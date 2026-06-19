#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/review-approval-smoke-report.json";

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

const { ReviewApprovalSystem } = await import("../dist/core/review-approval-system.js");
const system = new ReviewApprovalSystem();
const reviewedAt = new Date("2026-06-19T00:00:00.000Z");

const pending = system.evaluate({
  projectId: "review_approval_smoke",
  requestId: "req_review_approval_pending",
  gate: "pre_render",
  generatedAt: reviewedAt,
  checkpoints: [
    { surface: "scene", label: "Opening hook matches product promise", subjectId: "scene_001" },
    { surface: "audio", label: "Narration tone is approved", subjectId: "audio_main" },
    { surface: "caption", label: "Caption text is readable", subjectId: "caption_main" },
    { surface: "claim", label: "Commercial claim is substantiated", subjectId: "claim_001" }
  ]
});

const approved = system.evaluate({
  projectId: "review_approval_smoke",
  requestId: "req_review_approval_approved",
  gate: "pre_export",
  generatedAt: reviewedAt,
  checkpoints: [
    approvedCheckpoint("scene", "Opening hook matches product promise", "scene_001", reviewedAt),
    approvedCheckpoint("audio", "Narration tone is approved", "audio_main", reviewedAt),
    approvedCheckpoint("caption", "Caption text is readable", "caption_main", reviewedAt),
    approvedCheckpoint("claim", "Commercial claim is substantiated", "claim_001", reviewedAt)
  ]
});

const changesRequested = system.evaluate({
  projectId: "review_approval_smoke",
  requestId: "req_review_approval_changes",
  gate: "pre_render",
  generatedAt: reviewedAt,
  checkpoints: [
    approvedCheckpoint("scene", "Opening hook matches product promise", "scene_001", reviewedAt),
    {
      surface: "claim",
      label: "Commercial claim is substantiated",
      subjectId: "claim_001",
      decision: "changes_requested",
      reviewer: "Commercial reviewer",
      reviewedAt,
      notes: "Tone down the performance claim before render."
    }
  ]
});

const rejected = system.evaluate({
  projectId: "review_approval_smoke",
  requestId: "req_review_approval_rejected",
  gate: "pre_render",
  generatedAt: reviewedAt,
  checkpoints: [
    {
      surface: "claim",
      label: "Unsupported medical-style claim",
      subjectId: "claim_unsafe",
      decision: "rejected",
      reviewer: "Commercial reviewer",
      reviewedAt,
      notes: "Rejected because the product evidence is insufficient."
    }
  ]
});

const unsafe = system.evaluate({
  projectId: "review_approval_smoke",
  requestId: "req_review_approval_unsafe",
  gate: "pre_export",
  generatedAt: reviewedAt,
  checkpoints: [
    {
      surface: "audio",
      label: "Unsafe public review text",
      subjectId: "audio_unsafe",
      decision: "approved",
      reviewer: "Audio reviewer",
      reviewedAt,
      notes: "Do not store https://example.invalid/output.mp3?token=secret in approval evidence."
    }
  ]
});

const checks = [
  pending.status === "approval_required" && pending.lifecycle.action === "pause_for_human_review"
    ? pass("pending_pauses_job", "Pending required checkpoints pause the job for human review.")
    : fail("pending_pauses_job", "Expected pending required checkpoints to pause for human review."),
  approved.status === "approved" &&
    approved.lifecycle.action === "continue" &&
    approved.releaseGateSummary.canExportAfterReview === true &&
    approved.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("approved_allows_export_only", "Approved checkpoints allow pre-export continuation without claiming customer traffic.")
    : fail("approved_allows_export_only", "Expected approved pre-export gate to continue without customer-traffic claim."),
  changesRequested.status === "changes_requested" && changesRequested.lifecycle.action === "pause_for_revision"
    ? pass("changes_request_pauses_revision", "Required change requests pause the job for revision.")
    : fail("changes_request_pauses_revision", "Expected change requests to pause for revision."),
  rejected.status === "rejected" && rejected.lifecycle.action === "reject_job"
    ? pass("rejected_stops_job", "Rejected required checkpoints stop the current job path.")
    : fail("rejected_stops_job", "Expected rejected checkpoint to stop the job path."),
  unsafe.status === "blocked" &&
    unsafe.lifecycle.action === "block_job" &&
    unsafe.checkpoints.some((checkpoint) => checkpoint.issueCodes.includes("unsafe_public_review_text"))
    ? pass("unsafe_text_blocks", "Unsafe URLs, paths, or credential-like text block approval evidence.")
    : fail("unsafe_text_blocks", "Expected unsafe public review text to block approval evidence."),
  approved.summary.surfaceCounts.scene === 1 &&
    approved.summary.surfaceCounts.audio === 1 &&
    approved.summary.surfaceCounts.caption === 1 &&
    approved.summary.surfaceCounts.claim === 1
    ? pass("surface_coverage", "Scene, audio, caption, and claim surfaces are counted independently.")
    : fail("surface_coverage", "Expected one checkpoint for each required approval surface.")
];

const report = {
  schemaVersion: "cinejelly.review-approval-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: [
    "calesthio/OpenMontage",
    "HKUDS/ViMax",
    "HKUDS/VideoAgent",
    "vericontext/vibeframe",
    "harry0703/MoneyPrinterTurbo"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 5,
    approvalSurfaces: ["scene", "audio", "caption", "claim"]
  },
  scenarios: {
    pending: summarize(pending),
    approved: summarize(approved),
    changesRequested: summarize(changesRequested),
    rejected: summarize(rejected),
    unsafe: summarize(unsafe)
  },
  checks,
  releaseGateSummary: {
    reviewApprovalSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Review approval smoke proves lifecycle gating semantics only; live deployment, paid validation, manual media review, and business-readiness evidence are still required."
  }
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

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

function summarize(report) {
  return {
    status: report.status,
    gate: report.gate,
    lifecycleAction: report.lifecycle.action,
    nextJobState: report.lifecycle.nextJobState,
    canContinueAfterReview: report.releaseGateSummary.canContinueAfterReview,
    canRenderAfterReview: report.releaseGateSummary.canRenderAfterReview,
    canExportAfterReview: report.releaseGateSummary.canExportAfterReview,
    checkpointCount: report.summary.checkpointCount,
    requiredCheckpointCount: report.summary.requiredCheckpointCount,
    issueCount: report.summary.issueCount
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
