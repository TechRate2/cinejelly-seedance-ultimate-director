#!/usr/bin/env node
/**
 * No-spend regression for operator-hold ("treo chờ admin") behavior.
 *
 * The money rule: an admin-side / infrastructure failure (missing API key, provider down,
 * rate limit) must NOT burn the customer's video. The job is HELD (non-terminal), the
 * customer's charge stays reserved (NO settlement event fires), the customer sees it as
 * "still processing", and the background sweep retries it. When the operator fixes the
 * setup the job succeeds on its own. If it stays broken past the deadline it is force-failed
 * so the existing refund path returns the money — never held forever. Genuine content
 * errors still fail immediately, and a cancel always wins over a hold.
 *
 * onJobFinalized is the billing seam: it fires exactly once per TERMINAL transition and
 * drives refund/queue. This smoke asserts it never fires on a hold and fires correctly on
 * success / deadline-fail / terminal-fail.
 */

import { RenderJobManager } from "../dist/api/render-job-manager.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function providerError(code, message) {
  return Object.assign(new Error(message ?? code), { name: "ProviderError", code });
}
function fakeResult(projectId) {
  return {
    projectId,
    storyPlan: { premise: "Operator hold smoke", targetDurationSeconds: 12, scenes: [] },
    storyboard: { projectId, scenes: [] },
    storyboardPreflight: { status: "pass", checks: [] },
    productionGraph: { projectId, nodes: [], edges: [] },
    materialSourcingPlan: { projectId, sources: [] },
    materialSourceValidation: { projectId, status: "pass", checks: [] },
    postproductionAssetPlan: { projectId, assets: [] },
    stagePlan: { projectId, stages: [] },
    costEstimate: { currency: "USD", totalEstimatedCost: 0, lineItems: [] },
    compiledPrompts: [],
    renderedShots: [],
    deliverable: { outputPath: "assets/output_deliverables/business-readiness/operator-hold/video.mp4" }
  };
}
function request(requestId) {
  return {
    userInput: "Operator hold commercial video.",
    settings: { durationTargetSeconds: 12, qualityMode: "economy", resolution: "480p" },
    metadata: { requestId, projectId: "project_operator_hold_smoke" }
  };
}
async function waitForStatus(manager, jobId, statuses, timeoutMs = 3000) {
  const wanted = new Set(statuses);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summary = manager.get(jobId);
    if (summary && wanted.has(summary.status)) {
      return summary;
    }
    await delay(15);
  }
  return manager.get(jobId);
}

const finalized = [];
// Controls what the fake director does on each run.
let mode = "config_error"; // "config_error" | "succeed" | "terminal_error"
const manager = new RenderJobManager({
  maxConcurrentJobs: 1,
  queueLimit: 20,
  operatorHoldEnabled: true,
  operatorHoldMaxMs: 60_000,
  operatorHoldRetryIntervalMs: 15_000, // sweep is driven manually below for determinism
  runtimeFactory: () => ({
    director: {
      run: async () => {
        if (mode === "succeed") {
          return fakeResult("project_operator_hold_smoke");
        }
        if (mode === "terminal_error") {
          throw providerError("INVALID_SCHEMA", "bad request content");
        }
        throw providerError("AUTHENTICATION_FAILED", "missing/invalid API key");
      }
    },
    ledger: { list: () => [] }
  }),
  artifactStore: {
    writeRunArtifacts: async ({ result, artifactDirectory }) => ({
      projectId: result.projectId,
      artifactDirectory,
      manifestPath: `${artifactDirectory}/manifest.json`,
      entries: []
    }),
    writeFailureArtifacts: async ({ artifactDirectory }) => ({
      projectId: "project_operator_hold_failed",
      artifactDirectory,
      manifestPath: `${artifactDirectory}/manifest.json`,
      entries: []
    })
  },
  artifactValidator: {
    validate: async (artifactDirectory) => ({ status: "pass", checkedAt: new Date(), artifactDirectory, checks: [] })
  },
  onJobFinalized: (event) => finalized.push(event)
});

// --- 1. Config error HOLDS (not fail), no settlement, money reserved. ---
mode = "config_error";
const held = manager.submit({ request: request("req_hold_1"), artifactDirectory: "assets/output_deliverables/business-readiness/operator-hold/1" });
const heldSummary = await waitForStatus(manager, held.summary.jobId, ["paused_for_operator", "failed", "succeeded"]);
check("config_error_holds_not_fails", heldSummary?.status === "paused_for_operator", `status=${heldSummary?.status}`);
check("hold_records_attempt_and_reason", heldSummary?.operatorHoldAttempts === 1 && Boolean(heldSummary?.operatorHoldReason));
check("hold_emits_no_settlement", finalized.filter((event) => event.jobId === held.summary.jobId).length === 0);

// --- 2. Sweep while still broken -> retries and RE-HOLDS (still no settlement). ---
manager.sweepOperatorHolds(new Date());
const reHeld = await waitForStatus(manager, held.summary.jobId, ["paused_for_operator", "failed", "succeeded"]);
check("retry_while_broken_reholds", reHeld?.status === "paused_for_operator" && (reHeld?.operatorHoldAttempts ?? 0) >= 2, `status=${reHeld?.status} attempts=${reHeld?.operatorHoldAttempts}`);
check("rehold_still_no_settlement", finalized.filter((event) => event.jobId === held.summary.jobId).length === 0);

// --- 3. Operator fixes config -> next sweep retries -> SUCCESS, settles once. ---
mode = "succeed";
manager.sweepOperatorHolds(new Date());
const recovered = await waitForStatus(manager, held.summary.jobId, ["succeeded", "failed"]);
check("fixed_config_recovers_to_success", recovered?.status === "succeeded", `status=${recovered?.status}`);
const heldFinal = finalized.filter((event) => event.jobId === held.summary.jobId);
check("recovered_settles_exactly_once_succeeded", heldFinal.length === 1 && heldFinal[0].status === "succeeded");
check("recovered_video_downloadable", manager.deliverablePathFor(held.summary.jobId) !== undefined);

// --- 4. Held past the deadline -> force-fail -> settles failed (money refunded). ---
mode = "config_error";
const stuck = manager.submit({ request: request("req_hold_stuck"), artifactDirectory: "assets/output_deliverables/business-readiness/operator-hold/stuck" });
await waitForStatus(manager, stuck.summary.jobId, ["paused_for_operator"]);
check("stuck_job_is_held", manager.get(stuck.summary.jobId)?.status === "paused_for_operator");
// Sweep with a clock past the deadline (maxMs + margin).
manager.sweepOperatorHolds(new Date(Date.now() + 60_000 + 5_000));
const expired = await waitForStatus(manager, stuck.summary.jobId, ["failed", "succeeded", "paused_for_operator"]);
check("deadline_force_fails_held_job", expired?.status === "failed", `status=${expired?.status}`);
const stuckFinal = finalized.filter((event) => event.jobId === stuck.summary.jobId);
check("deadline_settles_failed_for_refund", stuckFinal.length === 1 && stuckFinal[0].status === "failed");

// --- 5. Genuine content error fails IMMEDIATELY (never held). ---
mode = "terminal_error";
const terminal = manager.submit({ request: request("req_terminal"), artifactDirectory: "assets/output_deliverables/business-readiness/operator-hold/terminal" });
const terminalSummary = await waitForStatus(manager, terminal.summary.jobId, ["failed", "paused_for_operator", "succeeded"]);
check("content_error_fails_immediately_not_held", terminalSummary?.status === "failed", `status=${terminalSummary?.status}`);
const terminalFinal = finalized.filter((event) => event.jobId === terminal.summary.jobId);
check("content_error_settles_failed", terminalFinal.length === 1 && terminalFinal[0].status === "failed");

// --- 6. A cancel always wins over a hold (aborted job settles canceled, never held). ---
mode = "config_error";
const toCancel = manager.submit({ request: request("req_cancel"), artifactDirectory: "assets/output_deliverables/business-readiness/operator-hold/cancel" });
manager.cancel(toCancel.summary.jobId);
const canceledSummary = await waitForStatus(manager, toCancel.summary.jobId, ["canceled", "failed", "paused_for_operator", "succeeded"]);
check("cancel_wins_over_hold", canceledSummary?.status === "canceled", `status=${canceledSummary?.status}`);

// --- 7. Global invariant: every settlement event equals the job's stored terminal status. ---
const mismatches = finalized.filter((event) => {
  const stored = manager.get(event.jobId)?.status;
  return stored !== event.status;
});
check("settlement_events_match_stored_status", mismatches.length === 0, mismatches.map((event) => `${event.jobId}:${event.status}`).join(", "));

// --- 8. Disabling the hold restores immediate fail (old behavior still available). ---
const off = new RenderJobManager({
  maxConcurrentJobs: 1,
  queueLimit: 5,
  operatorHoldEnabled: false,
  runtimeFactory: () => ({
    director: { run: async () => { throw providerError("AUTHENTICATION_FAILED", "no key"); } },
    ledger: { list: () => [] }
  }),
  artifactStore: {
    writeRunArtifacts: async ({ artifactDirectory }) => ({ projectId: "p", artifactDirectory, manifestPath: `${artifactDirectory}/m.json`, entries: [] }),
    writeFailureArtifacts: async ({ artifactDirectory }) => ({ projectId: "p", artifactDirectory, manifestPath: `${artifactDirectory}/m.json`, entries: [] })
  },
  artifactValidator: { validate: async (artifactDirectory) => ({ status: "pass", checkedAt: new Date(), artifactDirectory, checks: [] }) }
});
const offJob = off.submit({ request: request("req_off"), artifactDirectory: "assets/output_deliverables/business-readiness/operator-hold/off" });
const offSummary = await waitForStatus(off, offJob.summary.jobId, ["failed", "paused_for_operator", "succeeded"]);
check("hold_disabled_fails_immediately", offSummary?.status === "failed", `status=${offSummary?.status}`);
off.stopOperatorHoldSweep();
manager.stopOperatorHoldSweep();

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.operator-hold-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing operator-hold classification, the sweep, or the deadline.",
    "Live behavior (a real key fix resuming a held job) is confirmed on a real paid run."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
