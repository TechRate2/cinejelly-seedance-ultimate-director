#!/usr/bin/env node
/**
 * No-spend regression for the JSON -> SQL account-store migration (`npm run db:migrate`). The real
 * sqlite/postgres drivers need Node >= 22.5 / a live DB, so this drives the migration decision logic
 * with a real JSON source and a mock target that mirrors an SQL driver's contract. Proves:
 *   - empty source            -> nothing_to_migrate
 *   - populated source + EMPTY target -> migrated, verified user/entry counts match
 *   - populated source + NON-EMPTY target -> target_not_empty, and the target is NOT overwritten
 * The migration NEVER deletes the source JSON (backup preserved) — that is the caller's guarantee.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserAccountStore, loadRenderCreditPricing } from "../dist/api/user-account-store.js";
import { JsonFileAccountDriver } from "../dist/api/account-persistence.js";
import { migrateAccountStore } from "../dist/api/account-store-migration.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
const clone = (v) => JSON.parse(JSON.stringify(v));
const PACK = { packageId: "t", label: "t", credits: 5000, priceUsd: 50, priceVnd: 1350000 };

// Mirrors an SQL target driver's contract for the migration: starts empty (or pre-seeded), persist
// stores the whole state, flush/ready resolve, load returns the current durable state.
class MockTargetDriver {
  constructor(seed) {
    this.kind = "postgres";
    this.stored = seed ? clone(seed) : undefined;
    this.persistCalls = 0;
  }
  load() { return this.stored ? clone(this.stored) : undefined; }
  persist(state) { this.persistCalls += 1; this.stored = clone(state); }
  appendCreditEntries(state) { this.stored = clone(state); }
  ready() { return Promise.resolve(); }
  flush() { return Promise.resolve(); }
}

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-migrate-"));
try {
  const pricing = loadRenderCreditPricing(process.env);

  // Build a realistic JSON source with users + ledger.
  const jsonPath = join(workDir, "user-accounts.json");
  const src = new UserAccountStore({ storePath: jsonPath, pricing });
  const reg = await src.register({ email: "owner@shop.vn", password: "Migrate-Test-1234" });
  const top = src.requestTopupForPackage({ userId: reg.user.userId, creditPackage: PACK });
  src.decideTopup({ topupId: top.topupId, approve: true });
  src.chargeRender({ userId: reg.user.userId, jobId: "job_1", credits: 100 });
  const sourceState = new JsonFileAccountDriver(jsonPath).load();
  check("source_state_has_users_and_ledger", (sourceState?.users?.length ?? 0) === 1 && (sourceState?.entries?.length ?? 0) >= 2, JSON.stringify({ users: sourceState?.users?.length, entries: sourceState?.entries?.length }));

  // 1. Empty source -> nothing_to_migrate.
  const emptyTarget = new MockTargetDriver();
  const nothing = await migrateAccountStore({ sourceState: { schemaVersion: "x", users: [], sessions: [], entries: [], topups: [], refundRequests: [] }, target: emptyTarget, reloadTargetState: async () => emptyTarget.load() });
  check("empty_source_nothing_to_migrate", nothing.status === "nothing_to_migrate" && emptyTarget.persistCalls === 0);

  // 2. Populated source + EMPTY target -> migrated, verified counts match, no data lost.
  const target = new MockTargetDriver();
  const migrated = await migrateAccountStore({ sourceState, target, reloadTargetState: async () => target.load() });
  check("migrated_status", migrated.status === "migrated", migrated.status);
  check("migrated_user_count_matches", migrated.migratedUserCount === sourceState.users.length && migrated.migratedUserCount === 1);
  check("migrated_entry_count_matches", migrated.migratedEntryCount === sourceState.entries.length);
  // A store reloading from the migrated target reconstructs the SAME balance as the JSON source.
  const srcBalance = src.balanceOf(reg.user.userId);
  const migratedStore = new UserAccountStore({ driver: new MockTargetDriver(target.stored), pricing });
  check("migrated_balance_equals_source", migratedStore.balanceOf(reg.user.userId) === srcBalance, `${migratedStore.balanceOf(reg.user.userId)} vs ${srcBalance}`);

  // 3. Populated source + NON-EMPTY target -> refuse, do NOT overwrite.
  const seededTarget = new MockTargetDriver(sourceState); // already has the 1 user
  const before = clone(seededTarget.stored);
  const refused = await migrateAccountStore({ sourceState, target: seededTarget, reloadTargetState: async () => seededTarget.load() });
  check("nonempty_target_refused", refused.status === "target_not_empty");
  check("nonempty_target_not_overwritten", seededTarget.persistCalls === 0 && JSON.stringify(seededTarget.stored) === JSON.stringify(before));

  // 4. Orphan-detection guard: a switched-to (non-json) backend that boots EMPTY while the old
  //    user-accounts.json still holds accounts must be DETECTED (data safe but un-migrated).
  class MockSyncDriver {
    constructor(seed) { this.kind = "sqlite"; this.stored = seed ? clone(seed) : undefined; }
    load() { return this.stored ? clone(this.stored) : undefined; }
    persist(state) { this.stored = clone(state); }
    appendCreditEntries(state) { this.stored = clone(state); }
    ready() { return Promise.resolve(); }
    flush() { return Promise.resolve(); }
  }
  // Empty SQL backend + old json (jsonPath) still has 1 account -> orphan detected.
  const orphanStore = new UserAccountStore({ driver: new MockSyncDriver(), pricing, jsonStorePath: jsonPath });
  check("orphan_detected_after_unmigrated_switch", orphanStore.orphanedJsonAccountCount() === 1, `count=${orphanStore.orphanedJsonAccountCount()}`);
  // SQL backend that already has the data (migrated) -> no orphan warning.
  const migratedBackendStore = new UserAccountStore({ driver: new MockSyncDriver(sourceState), pricing, jsonStorePath: jsonPath });
  check("no_orphan_when_target_populated", migratedBackendStore.orphanedJsonAccountCount() === 0);
  // Plain json backend -> never an orphan (json IS the source).
  const jsonBackendStore = new UserAccountStore({ storePath: jsonPath, pricing });
  check("no_orphan_on_json_backend", jsonBackendStore.orphanedJsonAccountCount() === 0);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.account-store-migration-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep GREEN when changing migrateAccountStore or the db:migrate script — the 'non-empty target refused' + 'balance matches' checks are the data-safety guarantee.",
    "Real sqlite/postgres migration must be run in a Node >= 22.5 / live-DB environment before a production cutover."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
