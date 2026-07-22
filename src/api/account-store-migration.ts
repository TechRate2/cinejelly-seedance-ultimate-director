/**
 * Moving the account/money store from the JSON backend to a SQL backend (sqlite/postgres) when the
 * operator switches CINEJELLY_DATABASE_KIND. The decision logic is isolated here so it can be tested
 * without a live SQL database: the caller supplies the source state, the target driver, and a way to
 * reload the target for verification.
 *
 * SAFETY: never overwrites a non-empty target (returns "target_not_empty"); writes then verifies the
 * copied user/entry counts (returns "verify_mismatch" if they don't match) so a bad migration is loud,
 * not silent. The caller keeps the source JSON file as a backup — this module never deletes it.
 */

import type { AccountPersistenceDriver, PersistedAccountState } from "./account-persistence.js";

export type AccountStoreMigrationStatus =
  | "nothing_to_migrate"
  | "target_not_empty"
  | "migrated"
  | "verify_mismatch";

export interface AccountStoreMigrationResult {
  readonly status: AccountStoreMigrationStatus;
  readonly sourceUserCount: number;
  readonly sourceEntryCount: number;
  readonly migratedUserCount: number;
  readonly migratedEntryCount: number;
}

export async function migrateAccountStore(input: {
  readonly sourceState: PersistedAccountState | undefined;
  readonly target: AccountPersistenceDriver;
  /** Reload the target from a FRESH connection to read back what was just written (for verification). */
  readonly reloadTargetState: () => Promise<PersistedAccountState | undefined>;
}): Promise<AccountStoreMigrationResult> {
  const source = input.sourceState;
  const sourceUserCount = source?.users?.length ?? 0;
  const sourceEntryCount = source?.entries?.length ?? 0;
  if (!source || sourceUserCount === 0) {
    return { status: "nothing_to_migrate", sourceUserCount, sourceEntryCount, migratedUserCount: 0, migratedEntryCount: 0 };
  }
  const existingTarget = input.target.load();
  if ((existingTarget?.users?.length ?? 0) > 0) {
    // Never clobber an already-populated target — the operator must clear it deliberately first.
    return { status: "target_not_empty", sourceUserCount, sourceEntryCount, migratedUserCount: 0, migratedEntryCount: 0 };
  }
  input.target.persist(source);
  await input.target.flush();
  const verified = await input.reloadTargetState();
  const migratedUserCount = verified?.users?.length ?? 0;
  const migratedEntryCount = verified?.entries?.length ?? 0;
  const status: AccountStoreMigrationStatus =
    migratedUserCount === sourceUserCount && migratedEntryCount === sourceEntryCount ? "migrated" : "verify_mismatch";
  return { status, sourceUserCount, sourceEntryCount, migratedUserCount, migratedEntryCount };
}
