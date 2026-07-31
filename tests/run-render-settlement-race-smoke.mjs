#!/usr/bin/env node
/**
 * No-spend regression for the billing-settlement invariant:
 *   the status handed to onJobFinalized (which drives refund/queue) MUST equal the status
 *   that actually stuck on the job record — never a computed status the terminal guard
 *   rejected.
 *
 * Reproduces the real money-loss race deterministically with fake providers: a cancel that
 * lands while the run loop is writing artifacts (after director.run resolved, before
 * updateJob) leaves the stored status "canceled" but historically emitted the computed
 * "succeeded", so the server skipped the refund and the customer was charged for a video
 * they could not download until the next restart. The fix emits the stored status, so the
 * settlement fires "canceled" -> refund/queue. A control job (no cancel) still settles
 * "succeeded". Also asserts a normal provider failure settles "failed".
 */

import { RenderJobManager } from "../dist/api/render-job-manager.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

function fakeResult(projectId) {
  return {
    projectId,
    storyPlan: { premise: "Settlement race smoke", targetDurationSeconds: 12, scenes: [] },
    storyboard: { projectId, scenes: [] },
    storyboardPreflight: { status: "pass", checks: [] },
    productionGraph: { projectId, nodes: [], edges: [] },
    materialSourcingPlan: { projectId, sources: [] },
    materialSourceValidation: { projectId, status: "pass", checks: [] },
    postproductionAssetPlan: { projectId, assets: [] },
    stagePlan: { projectId, stages: [] },
    costEstimate: { currency: "USD", totalEstimatedCost: 0, lineItems: [] },
    compiledPrompts: [],
    renderedShots: []
  };
}

function request(requestId) {
  return {
    userInput: "Create a settlement-race commercial product video.",
    settings: { durationTargetSeconds: 12, qualityMode: "economy", resolution: "480p" },
    metadata: { requestId, projectId: "project_settlement_race_smoke" }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settledStatusFor(manager, jobId) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const summary = manager.get(jobId);
    if (summary && (summary.status === "succeeded" || summary.status === "failed" || summary.status === "canceled" || summary.status === "rejected")) {
      return summary.status;
    }
    await delay(15);
  }
  return manager.get(jobId)?.status;
}

// The settlement events the SERVER acts on: whatever lands here is what gets refunded/kept.
const finalized = [];
// Set to a jobId to have the artifact-write step cancel it mid-write (the race window).
let cancelDuringWriteJobId = "";
let failNextRun = false;

const manager = new RenderJobManager({
  maxConcurrentJobs: 1,
  queueLimit: 10,
  runtimeFactory: () => ({
    director: {
      run: async () => {
        if (failNextRun) {
          throw new Error("Fake provider failure for settlement test.");
        }
        return fakeResult("project_settlement_race_smoke");
      }
    },
    ledger: { list: () => [] }
  }),
  artifactStore: {
    writeRunArtifacts: async ({ result, artifactDirectory }) => {
      if (cancelDuringWriteJobId) {
        // Land the cancel exactly in the post-run / pre-updateJob window — the real race.
        const target = cancelDuringWriteJobId;
        cancelDuringWriteJobId = "";
        manager.cancel(target);
      }
      return { projectId: result.projectId, artifactDirectory, manifestPath: `${artifactDirectory}/manifest.json`, entries: [] };
    },
    writeFailureArtifacts: async ({ artifactDirectory }) => ({
      projectId: "project_settlement_race_failed",
      artifactDirectory,
      manifestPath: `${artifactDirectory}/manifest.json`,
      entries: []
    })
  },
  artifactValidator: {
    validate: async (artifactDirectory) => ({ status: "pass", checkedAt: new Date(), artifactDirectory, checks: [] })
  },
  onJobFinalized: (event) => {
    finalized.push(event);
  }
});

// --- 1. Control: an uncanceled job settles succeeded and the event agrees with the store.
const okSubmission = manager.submit({
  request: request("req_settlement_ok"),
  artifactDirectory: "assets/output_deliverables/business-readiness/settlement-race/ok"
});
const okStored = await settledStatusFor(manager, okSubmission.summary.jobId);
const okEvent = finalized.find((event) => event.jobId === okSubmission.summary.jobId);
check("control_job_stored_succeeded", okStored === "succeeded", `stored=${okStored}`);
check("control_event_matches_store", okEvent?.status === "succeeded", `event=${okEvent?.status}`);

// --- 2. THE FIX: cancel racing the artifact write => stored canceled => event canceled
// (so the server refunds/queues). The bug emitted "succeeded" here and skipped the refund.
const raceSubmission = manager.submit({
  request: request("req_settlement_race"),
  artifactDirectory: "assets/output_deliverables/business-readiness/settlement-race/race"
});
cancelDuringWriteJobId = raceSubmission.summary.jobId;
const raceStored = await settledStatusFor(manager, raceSubmission.summary.jobId);
const raceEvent = finalized.find((event) => event.jobId === raceSubmission.summary.jobId);
check("race_job_stored_canceled", raceStored === "canceled", `stored=${raceStored}`);
check(
  "race_settlement_event_matches_store_not_computed",
  raceEvent?.status === "canceled",
  `event=${raceEvent?.status} (bug would emit "succeeded" and skip the refund)`
);
check("race_download_blocked", manager.deliverablePathFor(raceSubmission.summary.jobId) === undefined);

// --- 3. A genuine provider failure settles failed and the event agrees.
failNextRun = true;
const failSubmission = manager.submit({
  request: request("req_settlement_fail"),
  artifactDirectory: "assets/output_deliverables/business-readiness/settlement-race/fail"
});
const failStored = await settledStatusFor(manager, failSubmission.summary.jobId);
failNextRun = false;
const failEvent = finalized.find((event) => event.jobId === failSubmission.summary.jobId);
check("failed_job_stored_failed", failStored === "failed", `stored=${failStored}`);
check("failed_event_matches_store", failEvent?.status === "failed", `event=${failEvent?.status}`);

// --- 4. Global invariant: EVERY settlement event equals the job's stored terminal status.
const mismatches = finalized.filter((event) => manager.get(event.jobId)?.status !== event.status);
check(
  "every_settlement_event_equals_stored_status",
  mismatches.length === 0,
  mismatches.map((event) => `${event.jobId}:${event.status}!=${manager.get(event.jobId)?.status}`).join(", ")
);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.render-settlement-race-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing whenever render-job-manager settlement/notifyFinished or the terminal guard changes.",
    "This guards the money path: the refund decision keys on the emitted status, which must equal the stored one."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
