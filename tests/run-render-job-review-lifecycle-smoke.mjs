#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawnSync } from "node:child_process";

const defaultOutput = "assets/output_deliverables/business-readiness/render-job-review-lifecycle-smoke-report.json";

function parseArgs(args) {
  const options = { outputPath: defaultOutput, writeReport: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

const options = parseArgs(process.argv.slice(2));
if (extname(options.outputPath).toLowerCase() !== ".json") {
  throw new Error("--output must point to a JSON file.");
}

const compile = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: resolve("."),
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const { RenderJobManager } = await import("../dist/api/render-job-manager.js");
const { startServer } = await import("../dist/api/server.js");

let runtimeRunCount = 0;
let reservationCount = 0;
const manager = new RenderJobManager({
  maxConcurrentJobs: 1,
  queueLimit: 10,
  runtimeFactory: () => ({
    director: {
      run: async () => {
        runtimeRunCount += 1;
        return {
          projectId: "project_review_lifecycle_smoke",
          storyPlan: { premise: "Smoke review lifecycle", targetDurationSeconds: 12, scenes: [] },
          storyboard: { projectId: "project_review_lifecycle_smoke", scenes: [] },
          storyboardPreflight: { status: "pass", checks: [] },
          productionGraph: { projectId: "project_review_lifecycle_smoke", nodes: [], edges: [] },
          materialSourcingPlan: { projectId: "project_review_lifecycle_smoke", sources: [] },
          materialSourceValidation: { projectId: "project_review_lifecycle_smoke", status: "pass", checks: [] },
          postproductionAssetPlan: { projectId: "project_review_lifecycle_smoke", assets: [] },
          stagePlan: { projectId: "project_review_lifecycle_smoke", stages: [] },
          costEstimate: { currency: "USD", totalEstimatedCost: 0, lineItems: [] },
          compiledPrompts: [],
          renderedShots: []
        };
      }
    },
    ledger: {
      list: () => []
    }
  }),
  artifactStore: {
    writeRunArtifacts: async ({ result, artifactDirectory }) => ({
      projectId: result.projectId,
      artifactDirectory,
      manifestPath: `${artifactDirectory}/manifest.json`,
      entries: []
    }),
    writeFailureArtifacts: async ({ artifactDirectory }) => ({
      projectId: "project_review_lifecycle_failed",
      artifactDirectory,
      manifestPath: `${artifactDirectory}/manifest.json`,
      entries: []
    })
  },
  artifactValidator: {
    validate: async (artifactDirectory) => ({
      status: "pass",
      checkedAt: new Date(),
      artifactDirectory,
      checks: []
    })
  }
});

const reviewedAt = new Date("2026-06-19T08:00:00.000Z");
const pendingSubmission = manager.submit({
  request: request("req_review_lifecycle_pending"),
  artifactDirectory: "assets/output_deliverables/business-readiness/render-job-review-lifecycle/pending",
  reviewApproval: {
    gate: "pre_render",
    checkpoints: [
      { surface: "scene", label: "Scene plan approved", subjectId: "scene_001" },
      { surface: "claim", label: "Claim evidence approved", subjectId: "claim_001" }
    ]
  },
  onAccepted: () => {
    reservationCount += 1;
  }
});

const afterPending = manager.get(pendingSubmission.summary.jobId);
const runtimeRunsAfterPending = runtimeRunCount;
const reservationsAfterPending = reservationCount;
const revisionSubmission = manager.review(pendingSubmission.summary.jobId, {
  gate: "pre_render",
  checkpoints: [
    approvedCheckpoint("scene", "Scene plan approved", "scene_001", reviewedAt),
    {
      surface: "claim",
      label: "Claim evidence approved",
      subjectId: "claim_001",
      decision: "changes_requested",
      reviewer: "Commercial reviewer",
      reviewedAt,
      notes: "Tone down the claim before render."
    }
  ]
});

const approvedSubmission = manager.review(
  pendingSubmission.summary.jobId,
  {
    gate: "pre_render",
    checkpoints: [
      approvedCheckpoint("scene", "Scene plan approved", "scene_001", reviewedAt),
      approvedCheckpoint("claim", "Claim evidence approved", "claim_001", reviewedAt)
    ]
  },
  {},
  {
    onApprovedForRender: () => {
      reservationCount += 1;
    }
  }
);
const finalApproved = await waitForStatus(manager, pendingSubmission.summary.jobId, "succeeded");

const rejectedSubmission = manager.submit({
  request: request("req_review_lifecycle_rejected"),
  artifactDirectory: "assets/output_deliverables/business-readiness/render-job-review-lifecycle/rejected",
  reviewApproval: {
    gate: "pre_render",
    checkpoints: [
      {
        surface: "claim",
        label: "Unsupported absolute claim",
        subjectId: "claim_unsafe",
        decision: "rejected",
        reviewer: "Commercial reviewer",
        reviewedAt,
        notes: "Reject this production path."
      }
    ]
  },
  onAccepted: () => {
    reservationCount += 1;
  }
});

const blockedSubmission = manager.submit({
  request: request("req_review_lifecycle_blocked"),
  artifactDirectory: "assets/output_deliverables/business-readiness/render-job-review-lifecycle/blocked",
  reviewApproval: {
    gate: "pre_render",
    checkpoints: [
      {
        surface: "audio",
        label: "Narration approved",
        subjectId: "audio_unsafe",
        decision: "approved",
        reviewer: "Audio reviewer",
        reviewedAt,
        notes: "Do not publish https://example.invalid/audio.wav?token=secret."
      }
    ]
  },
  onAccepted: () => {
    reservationCount += 1;
  }
});

const countsBeforePreExportReview = {
  runtimeRunCount,
  reservationCount
};
const preExportSubmission = manager.submit({
  request: request("req_review_lifecycle_pre_export"),
  artifactDirectory: "assets/output_deliverables/business-readiness/render-job-review-lifecycle/pre-export",
  preExportReviewApproval: {
    gate: "pre_export",
    checkpoints: [
      { surface: "audio", label: "Rendered audio accepted", subjectId: "artifact_audio_001" },
      { surface: "caption", label: "Rendered captions accepted", subjectId: "artifact_caption_001" },
      { surface: "claim", label: "Rendered claim evidence accepted", subjectId: "artifact_claim_001" }
    ]
  },
  onAccepted: () => {
    reservationCount += 1;
  }
});
const preExportPaused = await waitForStatus(manager, preExportSubmission.summary.jobId, "paused_for_review");
const countsAfterPreExportPause = {
  runtimeRunCount,
  reservationCount
};
const preExportApproval = manager.review(preExportSubmission.summary.jobId, {
  gate: "pre_export",
  checkpoints: [
    approvedCheckpoint("audio", "Rendered audio accepted", "artifact_audio_001", reviewedAt),
    approvedCheckpoint("caption", "Rendered captions accepted", "artifact_caption_001", reviewedAt),
    approvedCheckpoint("claim", "Rendered claim evidence accepted", "artifact_claim_001", reviewedAt)
  ]
});
const preExportFinal = manager.get(preExportSubmission.summary.jobId);

const apiSmoke = await runApiSmoke(startServer, reviewedAt);
const stats = manager.stats();
const checks = [
  check("pending_pauses_before_runtime", afterPending?.status === "paused_for_review" && runtimeRunsAfterPending === 0),
  check("pending_does_not_reserve_provider_spend", reservationsAfterPending === 0),
  check("changes_requested_pauses_revision", revisionSubmission?.summary.status === "paused_for_revision"),
  check("approval_queues_for_render", approvedSubmission?.queuedForRender === true),
  check("approval_reserves_once", countsBeforePreExportReview.reservationCount === 1),
  check("approved_job_succeeds", finalApproved?.status === "succeeded" && countsBeforePreExportReview.runtimeRunCount === 1),
  check("review_approval_detail_retained", finalApproved?.reviewApproval?.status === "approved"),
  check("rejected_is_terminal_without_runtime", rejectedSubmission.summary.status === "rejected" && countsBeforePreExportReview.runtimeRunCount === 1),
  check("blocked_is_paused_without_runtime", blockedSubmission.summary.status === "blocked" && countsBeforePreExportReview.runtimeRunCount === 1),
  check("pre_export_renders_before_pausing", countsAfterPreExportPause.runtimeRunCount === countsBeforePreExportReview.runtimeRunCount + 1),
  check("pre_export_reserves_once_before_render", countsAfterPreExportPause.reservationCount === countsBeforePreExportReview.reservationCount + 1),
  check(
    "pre_export_pauses_with_artifact_evidence",
    preExportPaused?.status === "paused_for_review" &&
      preExportPaused.hasResult === true &&
      preExportPaused.hasArtifacts === true &&
      preExportPaused.hasArtifactValidation === true &&
      preExportPaused.reviewApproval?.gate === "pre_export" &&
      preExportPaused.preExportReviewApproval?.status === "approval_required"
  ),
  check("pre_export_review_approves_export", preExportApproval?.approvedForExport === true && preExportFinal?.status === "succeeded"),
  check("pre_export_approval_does_not_rerender", runtimeRunCount === countsAfterPreExportPause.runtimeRunCount),
  check("pre_export_approval_does_not_reserve_again", reservationCount === countsAfterPreExportPause.reservationCount),
  check("queue_stats_count_paused_blocked", stats.pausedJobCount === 1),
  check("api_submit_pending_pauses", apiSmoke.submitStatusCode === 202 && apiSmoke.submitStatus === "paused_for_review"),
  check("api_submit_pending_no_reservation", apiSmoke.submitHasReservation === false),
  check("api_review_changes_pauses_revision", apiSmoke.reviewStatusCode === 202 && apiSmoke.reviewStatus === "paused_for_revision")
];

const report = {
  schemaVersion: "cinejelly.render-job-review-lifecycle-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((item) => item.status === "pass") ? "pass" : "fail",
  noExternalNetworkCallsMade: true,
  localHttpCallsMade: true,
  providerCallsMade: runtimeRunCount,
  reservationCount,
  jobStatuses: {
    pending: afterPending?.status,
    afterRevision: revisionSubmission?.summary.status,
    afterApproval: finalApproved?.status,
    rejected: rejectedSubmission.summary.status,
    blocked: blockedSubmission.summary.status,
    preExportPaused: preExportPaused?.status,
    preExportFinal: preExportFinal?.status,
    apiSubmit: apiSmoke.submitStatus,
    apiReview: apiSmoke.reviewStatus
  },
  preExportReview: {
    pausedStatus: preExportPaused?.status,
    finalStatus: preExportFinal?.status,
    hasResultAtPause: preExportPaused?.hasResult === true,
    hasArtifactsAtPause: preExportPaused?.hasArtifacts === true,
    hasArtifactValidationAtPause: preExportPaused?.hasArtifactValidation === true,
    reviewGateAtPause: preExportPaused?.reviewApproval?.gate,
    preExportReviewStatusAtPause: preExportPaused?.preExportReviewApprovalStatus,
    approvedForExport: preExportApproval?.approvedForExport === true,
    runtimeRunsDuringExportApproval: runtimeRunCount - countsAfterPreExportPause.runtimeRunCount,
    reservationsDuringExportApproval: reservationCount - countsAfterPreExportPause.reservationCount
  },
  queue: stats,
  checks,
  releaseGateSummary: {
    canUseAsNoSpendBackendEvidence: checks.every((item) => item.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "This smoke proves async job review lifecycle semantics only; live provider, HTTPS deployment, manual media review, and billing evidence are still required."
  }
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function request(requestId) {
  return {
    userInput: "Create a review-gated commercial product video.",
    settings: {
      durationTargetSeconds: 12,
      qualityMode: "economy",
      resolution: "480p"
    },
    metadata: {
      requestId,
      projectId: "project_review_lifecycle_smoke"
    }
  };
}

function approvedCheckpoint(surface, label, subjectId, reviewedAt) {
  return {
    surface,
    label,
    subjectId,
    decision: "approved",
    reviewer: "Commercial reviewer",
    reviewedAt,
    evidence: {
      reviewerRole: "commercial_quality",
      evidenceVersion: 1
    }
  };
}

async function waitForStatus(manager, jobId, status) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const summary = manager.get(jobId);
    if (summary?.status === status) {
      return summary;
    }
    await delay(20);
  }
  return manager.get(jobId);
}

async function runApiSmoke(startServer, reviewedAt) {
  const previousEnv = {
    CINEJELLY_DISABLE_API_AUTH: process.env.CINEJELLY_DISABLE_API_AUTH,
    CINEJELLY_DISABLE_API_RATE_LIMIT: process.env.CINEJELLY_DISABLE_API_RATE_LIMIT,
    CINEJELLY_OUTPUT_DIR: process.env.CINEJELLY_OUTPUT_DIR
  };
  process.env.CINEJELLY_DISABLE_API_AUTH = "true";
  process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
  process.env.CINEJELLY_OUTPUT_DIR = resolve(
    "assets/output_deliverables/business-readiness/render-job-review-lifecycle/api"
  );
  const server = startServer(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const submit = await postJson(`${baseUrl}/v1/render-jobs`, {
      userInput: "Create an API review-gated product video.",
      metadata: {
        projectId: "project_review_lifecycle_api_smoke"
      },
      reviewApprovalGate: "pre_render",
      reviewApprovalCheckpoints: [
        { surface: "scene", label: "Scene plan approved", subjectId: "scene_001" },
        { surface: "claim", label: "Claim evidence approved", subjectId: "claim_001" }
      ]
    });
    const review = await postJson(`${baseUrl}${submit.body.statusUrl}/review`, {
      gate: "pre_render",
      checkpoints: [
        approvedCheckpoint("scene", "Scene plan approved", "scene_001", reviewedAt.toISOString()),
        {
          surface: "claim",
          label: "Claim evidence approved",
          subjectId: "claim_001",
          decision: "changes_requested",
          reviewer: "Commercial reviewer",
          reviewedAt: reviewedAt.toISOString(),
          notes: "Revise claim evidence before render."
        }
      ]
    });
    return {
      submitStatusCode: submit.statusCode,
      submitStatus: submit.body.status,
      submitHasReservation: Object.hasOwn(submit.body, "clientPolicyReservation"),
      reviewStatusCode: review.statusCode,
      reviewStatus: review.body.status
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
    restoreEnv(previousEnv);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function check(name, pass) {
  return { name, status: pass ? "pass" : "fail" };
}

function writeJson(path, value) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
