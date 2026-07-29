#!/usr/bin/env node
/**
 * No-spend regression for finding F2: a durable render_settled marker stops boot-time
 * reconciliation from refunding a DELIVERED video that merely aged out of the in-memory job
 * history. Includes a CONTROL (unmarked charge) proving the marker is what prevents the refund —
 * without it the delivered video would be refunded (the bug). Pure store logic; no spend/network.
 */

import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserAccountStore, loadRenderCreditPricing } from "../dist/api/user-account-store.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}
const PACK = { packageId: "t", label: "t", credits: 1000, priceUsd: 10, priceVnd: 270000 };

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-reconcile-settle-"));
try {
  const store = new UserAccountStore({ storePath: join(workDir, "accounts.json"), pricing: loadRenderCreditPricing(process.env) });
  const reg = await store.register({ email: "settle@test.local", password: "Settle-Test-1234" });
  const userId = reg.user.userId;
  const topup = store.requestTopupForPackage({ userId, creditPackage: PACK });
  store.decideTopup({ topupId: topup.topupId, approve: true });
  check("initial_balance_1000", store.balanceOf(userId) === 1000, store.balanceOf(userId));

  store.chargeRender({ userId, jobId: "job_settled", credits: 100 });
  store.chargeRender({ userId, jobId: "job_unsettled", credits: 100 });
  check("balance_after_two_charges_800", store.balanceOf(userId) === 800, store.balanceOf(userId));

  // The F2 fix: mark the delivered job settled (idempotent).
  store.markRenderSettled({ userId, jobId: "job_settled" });
  store.markRenderSettled({ userId, jobId: "job_settled" });

  // Simulate a restart reconcile where BOTH jobs were evicted from history (status unknown) and both
  // charges are fresh (<48h). Only the UNSETTLED job is refunded; the delivered one is protected.
  const refunds = store.reconcileRenderCharges(() => undefined, { mode: "refund" });
  check("only_unsettled_refunded", refunds === 1, `refunds=${refunds}`);
  check("settled_video_not_refunded", store.balanceOf(userId) === 900, store.balanceOf(userId));

  // Reconcile again — idempotent, no further movement.
  const refunds2 = store.reconcileRenderCharges(() => undefined, { mode: "refund" });
  check("reconcile_idempotent", refunds2 === 0 && store.balanceOf(userId) === 900, `${refunds2}:${store.balanceOf(userId)}`);

  // Queue mode must also skip the settled job.
  const store3 = new UserAccountStore({ storePath: join(workDir, "accounts3.json"), pricing: loadRenderCreditPricing(process.env) });
  const reg3 = await store3.register({ email: "q@test.local", password: "Queue-Test-1234" });
  const u3 = reg3.user.userId;
  const t3 = store3.requestTopupForPackage({ userId: u3, creditPackage: PACK }); store3.decideTopup({ topupId: t3.topupId, approve: true });
  store3.chargeRender({ userId: u3, jobId: "job_q", credits: 100 });
  store3.markRenderSettled({ userId: u3, jobId: "job_q" });
  const queued = store3.reconcileRenderCharges(() => undefined, { mode: "queue" });
  check("queue_mode_skips_settled", queued === 0, `queued=${queued}`);

  // CONTROL: an identical charge that is NOT marked settled IS refunded on reconcile — proving the
  // marker is the sole thing protecting the delivered video (i.e. the bug is real without the fix).
  const store2 = new UserAccountStore({ storePath: join(workDir, "accounts2.json"), pricing: loadRenderCreditPricing(process.env) });
  const reg2 = await store2.register({ email: "ctl@test.local", password: "Ctl-Test-1234" });
  const u2 = reg2.user.userId;
  const t2 = store2.requestTopupForPackage({ userId: u2, creditPackage: PACK }); store2.decideTopup({ topupId: t2.topupId, approve: true });
  store2.chargeRender({ userId: u2, jobId: "job_x", credits: 100 });
  const r2 = store2.reconcileRenderCharges(() => undefined, { mode: "refund" });
  check("control_unmarked_charge_is_refunded", r2 === 1 && store2.balanceOf(u2) === 1000, `${r2}:${store2.balanceOf(u2)}`);

  // Redub uses render_charge with a redub_ jobId (prefix-agnostic store), so the SAME reconcile
  // machinery applies: a delivered redub (settled marker) keeps its charge; a redub charged but never
  // delivered (crash between charge and response, no marker, recent) is an orphan and is refunded.
  const store4 = new UserAccountStore({ storePath: join(workDir, "accounts4.json"), pricing: loadRenderCreditPricing(process.env) });
  const reg4 = await store4.register({ email: "redub@test.local", password: "Redub-Test-1234" });
  const u4 = reg4.user.userId;
  const t4 = store4.requestTopupForPackage({ userId: u4, creditPackage: PACK }); store4.decideTopup({ topupId: t4.topupId, approve: true });
  store4.chargeRender({ userId: u4, jobId: "redub_delivered", credits: 100 });
  store4.chargeRender({ userId: u4, jobId: "redub_crashed", credits: 100 });
  store4.markRenderSettled({ userId: u4, jobId: "redub_delivered" }); // delivery marker stamped on success
  const redubRefunds = store4.reconcileRenderCharges((jobId) => undefined, { mode: "refund" });
  check("redub_crashed_orphan_refunded_delivered_kept", redubRefunds === 1 && store4.balanceOf(u4) === 900, `refunds=${redubRefunds} bal=${store4.balanceOf(u4)}`);

  // Server wiring lock: redub success MUST stamp the settled marker, and the boot reconcile MUST NOT
  // blanket-treat redub_* as "succeeded" (that old shortcut left every crashed redub charged forever).
  const serverSrc = readFileSync(new URL("../src/api/server.ts", import.meta.url), "utf8");
  check("server_redub_success_marks_settled", /markRenderSettled\(\{\s*userId:\s*redubCharge\.userId,\s*jobId:\s*redubId\s*\}\)/.test(serverSrc));
  check("server_reconcile_no_longer_forces_redub_succeeded", !serverSrc.includes('jobId.startsWith("redub_") ? "succeeded"'));
  // Series episodes are inline director runs (never jobManager jobs, so statusOfAny is undefined) —
  // the success path MUST stamp the settled marker or a delivered episode is refunded on restart.
  check("server_series_episode_success_marks_settled", /markRenderSettled\(\{\s*userId:\s*episodeCharge\.userId,\s*jobId:\s*episodeJobId\s*\}\)/.test(serverSrc));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.reconcile-settlement-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep green when changing markRenderSettled, reconcileRenderCharges, or the onJobFinalized success hook.",
    "onJobFinalized must call markRenderSettled on status==='succeeded' so delivered videos are never auto-refunded after a restart."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
