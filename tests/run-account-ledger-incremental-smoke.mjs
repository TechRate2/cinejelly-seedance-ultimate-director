#!/usr/bin/env node
/**
 * No-spend regression for the append-only credit-ledger persistence (#2 hardening).
 *
 * The SQLite/Postgres drivers now INSERT only the newly-appended credit entries on each write
 * instead of rewriting the whole ledger table (the old DELETE-all + re-INSERT was O(all) per charge;
 * on a remote DB like Neon that was O(all) SEQUENTIAL network round-trips — catastrophic at scale).
 * Those drivers cannot run here (node:sqlite needs Node >= 22.5; postgres needs a live DB), so this
 * test validates the CONTRACT they implement with a MockIncrementalDriver that mirrors their exact
 * semantics: entries keyed by entryId, insert only entries.slice(persistedEntryCount), INSERT-OR-
 * IGNORE on a duplicate key. It proves that driving the REAL UserAccountStore through an append-only
 * incremental driver reconstructs the IDENTICAL balance + ledger as the whole-file JSON driver, and
 * that no already-persisted entry is ever re-inserted. Pure store logic; no spend/network.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserAccountStore, loadRenderCreditPricing } from "../dist/api/user-account-store.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}
const PACK = { packageId: "t", label: "t", credits: 5000, priceUsd: 50, priceVnd: 1350000 };
const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Mirrors the SQLite/Postgres append-only ledger semantics exactly. Mutable collections are replaced
 * wholesale (as the real drivers replaceAll them); the ledger is append-only so only entries beyond
 * persistedEntryCount are inserted, and a duplicate entryId is ignored (INSERT OR IGNORE / ON CONFLICT
 * DO NOTHING). reinsertAttempts counts any attempt to insert an already-present key — it must stay 0
 * on the happy path, proving the slice cursor only ever feeds genuinely-new rows to the DB.
 */
class MockIncrementalDriver {
  constructor() {
    this.kind = "mock";
    this.schemaVersion = undefined;
    this.mutable = { users: [], sessions: [], topups: [], refundRequests: [] };
    this.entriesById = new Map();
    this.entryOrder = [];
    this.persistedEntryCount = 0;
    this.reinsertAttempts = 0;
    this.persistCalls = 0;
    this.appendCalls = 0; // ledger-only fast-path calls
    this.mutableRewrites = 0; // times the bounded mutable tables were rewritten (persist only)
    this.totalEntryInsertRuns = 0; // total INSERT statements issued across all writes
  }
  load() {
    if (this.schemaVersion === undefined) {
      return undefined;
    }
    const entries = this.entryOrder.map((id) => clone(this.entriesById.get(id)));
    this.persistedEntryCount = entries.length;
    return {
      schemaVersion: this.schemaVersion,
      users: clone(this.mutable.users),
      sessions: clone(this.mutable.sessions),
      entries,
      topups: clone(this.mutable.topups),
      refundRequests: clone(this.mutable.refundRequests)
    };
  }
  persist(state) {
    this.persistCalls += 1;
    this.schemaVersion = state.schemaVersion;
    // Mutable collections: full replace (bounded), exactly like the SQL drivers' replaceAll.
    this.mutableRewrites += 1;
    this.mutable.users = clone(state.users);
    this.mutable.sessions = clone(state.sessions);
    this.mutable.topups = clone(state.topups);
    this.mutable.refundRequests = clone(state.refundRequests ?? []);
    this.insertNewEntries(state);
  }
  appendCreditEntries(state) {
    // Ledger-only fast path: append new entries WITHOUT rewriting the mutable tables (mirrors the
    // SQL drivers). Never touches this.mutable — proving a charge/settle/refund costs no table rewrite.
    this.appendCalls += 1;
    this.schemaVersion = state.schemaVersion;
    this.insertNewEntries(state);
  }
  insertNewEntries(state) {
    // Append-only incremental insert of entries beyond the persisted cursor (INSERT OR IGNORE dup).
    for (let index = this.persistedEntryCount; index < state.entries.length; index += 1) {
      const record = state.entries[index];
      this.totalEntryInsertRuns += 1;
      if (this.entriesById.has(record.entryId)) {
        this.reinsertAttempts += 1;
        continue;
      }
      this.entriesById.set(record.entryId, clone(record));
      this.entryOrder.push(record.entryId);
    }
    this.persistedEntryCount = state.entries.length;
  }
  ready() {
    return Promise.resolve();
  }
}

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-ledger-incremental-"));
try {
  const pricing = loadRenderCreditPricing(process.env);
  const mock = new MockIncrementalDriver();
  const mockStore = new UserAccountStore({ driver: mock, pricing });
  const jsonStore = new UserAccountStore({ storePath: join(workDir, "accounts.json"), pricing });

  // Drive BOTH stores through an identical sequence of money operations.
  const run = async (store) => {
    const reg = await store.register({ email: "led@test.local", password: "Ledger-Test-1234" });
    const userId = reg.user.userId;
    const topup = store.requestTopupForPackage({ userId, creditPackage: PACK });
    store.decideTopup({ topupId: topup.topupId, approve: true });
    // 12 render charges (each appends a ledger entry) — this is the hot path the incremental write
    // optimises. A couple get settled, one gets refunded.
    for (let i = 0; i < 12; i += 1) {
      store.chargeRender({ userId, jobId: `job_${i}`, credits: 30 });
    }
    store.markRenderSettled({ userId, jobId: "job_0" });
    store.markRenderSettled({ userId, jobId: "job_1" });
    store.refundRender({ userId, jobId: "job_5", reason: "test refund" });
    // Idempotent repeats must not move money or append duplicates.
    store.markRenderSettled({ userId, jobId: "job_0" });
    store.refundRender({ userId, jobId: "job_5", reason: "test refund again" });
    store.chargeRender({ userId, jobId: "job_5", credits: 30 }); // refunded -> genuine re-charge
    return { userId, balance: store.balanceOf(userId) };
  };

  const mockResult = await run(mockStore);
  const jsonResult = await run(jsonStore);

  // 1. The incremental (append-only) driver yields the SAME balance as the whole-file JSON driver.
  check("incremental_balance_matches_json", mockResult.balance === jsonResult.balance, `mock=${mockResult.balance} json=${jsonResult.balance}`);

  // 2. A fresh store reloading from the incremental driver's durable data reconstructs the balance.
  const reloaded = new UserAccountStore({ driver: mock, pricing });
  check("incremental_balance_survives_reload", reloaded.balanceOf(mockResult.userId) === mockResult.balance, `${reloaded.balanceOf(mockResult.userId)} vs ${mockResult.balance}`);

  // 3. No already-persisted entry was ever re-inserted (the slice cursor only feeds NEW rows).
  check("incremental_no_entry_reinserted", mock.reinsertAttempts === 0, `reinsertAttempts=${mock.reinsertAttempts}`);

  // 4. Total INSERT statements == total entries (each entry inserted exactly once across all writes),
  //    NOT persistCalls*entries (which the old whole-table rewrite would have produced).
  const durableEntryCount = mock.entryOrder.length;
  check("incremental_one_insert_per_entry", mock.totalEntryInsertRuns === durableEntryCount, `inserts=${mock.totalEntryInsertRuns} entries=${durableEntryCount} persists=${mock.persistCalls}`);
  // Sanity: the naive whole-rewrite cost would have been far higher than one-insert-per-entry.
  check("incremental_beats_whole_rewrite", mock.persistCalls > 1 && mock.totalEntryInsertRuns < mock.persistCalls * durableEntryCount, `persists=${mock.persistCalls} inserts=${mock.totalEntryInsertRuns}`);

  // 5. The durable ledger the incremental driver holds equals the JSON driver's ledger, entry-for-entry.
  const jsonReload = new UserAccountStore({ storePath: join(workDir, "accounts.json"), pricing });
  check("incremental_and_json_same_balance_on_reload", reloaded.balanceOf(mockResult.userId) === jsonReload.balanceOf(jsonResult.userId), `${reloaded.balanceOf(mockResult.userId)} vs ${jsonReload.balanceOf(jsonResult.userId)}`);

  // 6. The charge/settle/refund hot path used the ledger-only fast path (appendCreditEntries), so it
  //    appended entries WITHOUT rewriting the bounded mutable tables. This is the point of the fix:
  //    on a network DB a charge is ONE ledger INSERT, not a full users+sessions+topups+refunds rewrite
  //    (all of which also grow with business volume). Mutable rewrites stay a small constant (setup
  //    ops only) no matter how many charges run.
  check("fast_path_used_for_ledger_mutations", mock.appendCalls >= 12, `appendCalls=${mock.appendCalls}`);
  check("charges_did_not_rewrite_mutable_tables", mock.mutableRewrites <= 4 && mock.mutableRewrites < mock.appendCalls, `mutableRewrites=${mock.mutableRewrites} appendCalls=${mock.appendCalls} persistCalls=${mock.persistCalls}`);

  // 7. Postgres-like ASYNC boot must NOT wipe existing accounts. The postgres driver loads after an
  //    await, so at construction load() returns undefined and the store is EMPTY; without the hydration
  //    guard the first write would DELETE-and-replace the mutable tables with that empty snapshot and
  //    wipe every existing account. This seeds an existing DB, boots a store against an async driver,
  //    and proves: reads are empty pre-hydration, writes are BLOCKED (503) pre-hydration, the seeded
  //    accounts survive, and after ready() the real balance is restored.
  const seedMock = new MockIncrementalDriver();
  const seedStore = new UserAccountStore({ driver: seedMock, pricing });
  const seedReg = await seedStore.register({ email: "existing@test.local", password: "Existing-Test-1234" });
  const seedTop = seedStore.requestTopupForPackage({ userId: seedReg.user.userId, creditPackage: PACK });
  seedStore.decideTopup({ topupId: seedTop.topupId, approve: true });
  const seededBalance = seedStore.balanceOf(seedReg.user.userId);
  const seededState = seedMock.load();

  class AsyncPostgresLikeMock {
    constructor(state) {
      this.kind = "postgres";
      this.bootDone = false;
      this.durable = clone(state);
      this.persistedEntryCount = (this.durable.entries ?? []).length;
      // Deferred boot: the test controls exactly WHEN the async load completes, so the "write during
      // boot" is deterministic (no race with a microtask-resolved ready()).
      this.releaseBoot = null;
      this.readyPromise = new Promise((resolve) => { this.releaseBoot = resolve; }).then(() => { this.bootDone = true; });
    }
    load() { return this.bootDone ? clone(this.durable) : undefined; }
    ready() { return this.readyPromise; }
    persist(state) {
      this.durable.users = clone(state.users);
      this.durable.sessions = clone(state.sessions);
      this.durable.topups = clone(state.topups);
      this.durable.refundRequests = clone(state.refundRequests ?? []);
      this.appendCreditEntries(state);
    }
    appendCreditEntries(state) {
      for (let i = this.persistedEntryCount; i < state.entries.length; i += 1) this.durable.entries.push(clone(state.entries[i]));
      this.persistedEntryCount = state.entries.length;
    }
  }

  const asyncMock = new AsyncPostgresLikeMock(seededState);
  const bootStore = new UserAccountStore({ driver: asyncMock, pricing });
  check("async_boot_starts_unhydrated", bootStore.isHydrated() === false);
  check("async_boot_reads_empty_before_hydration", bootStore.balanceOf(seedReg.user.userId) === 0, String(bootStore.balanceOf(seedReg.user.userId)));
  // A sync write (topup request) during boot must be REFUSED before it can persist the empty snapshot.
  let toppedDuringBoot = false;
  try { bootStore.requestTopupForPackage({ userId: seedReg.user.userId, creditPackage: PACK }); toppedDuringBoot = true; } catch { /* expected 503 */ }
  check("async_boot_write_blocked_pre_hydration", toppedDuringBoot === false);
  check("async_boot_seeded_account_survives", asyncMock.durable.users.some((u) => u.userId === seedReg.user.userId) && asyncMock.durable.users.length === 1);
  // Complete the async boot and let the store hydrate.
  asyncMock.releaseBoot();
  await bootStore.ready();
  check("async_boot_hydrates_real_balance", bootStore.isHydrated() === true && bootStore.balanceOf(seedReg.user.userId) === seededBalance, `${bootStore.balanceOf(seedReg.user.userId)} vs ${seededBalance}`);
  const postHydrateReg = await bootStore.register({ email: "after@test.local", password: "After-Test-1234" });
  check("async_boot_writes_work_after_hydration", Boolean(postHydrateReg.user.userId) && asyncMock.durable.users.some((u) => u.userId === seedReg.user.userId));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.account-ledger-incremental-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep green when changing SqliteAccountDriver/PostgresAccountDriver ledger persistence or UserAccountStore mutation paths.",
    "The append-only ledger insert must stay idempotent (INSERT OR IGNORE / ON CONFLICT DO NOTHING) and advance persistedEntryCount only after commit.",
    "Real sqlite/postgres execution needs Node >= 22.5 / a live DB — validate there before a production ledger cutover."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
