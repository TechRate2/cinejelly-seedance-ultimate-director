#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/long-backend-45s-closure-audit-report.json",
  paidReportPath: "assets/output_deliverables/phase6-validation/paid-render-45s-real-20260620-142349-report.json",
  finalMediaPath: "assets/output_deliverables/phase6-validation/final-45s-video-only-reassembly-check.mp4",
  mixedOutputReportPath: "assets/output_deliverables/business-readiness/mixed-output-assembly-smoke-report.json",
  continuityReportPath: "assets/output_deliverables/business-readiness/long-form-continuity-smoke-report.json",
  agentReviewReportPath: "assets/output_deliverables/business-readiness/long-form-agent-review-smoke-report.json",
  timelineReportPath: "assets/output_deliverables/business-readiness/long-form-timeline-smoke-report.json",
  schedulerReportPath: "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json",
  targetDurationSeconds: 45,
  minDurationSeconds: 40,
  maxDurationSeconds: 60,
  maxApprovedAtlasSpendUsd: 10
};

const requiredArtifactKinds = [
  "run_summary",
  "review_packet",
  "story_plan",
  "storyboard",
  "production_graph",
  "long_form_continuity",
  "long_form_agent_review",
  "long_form_timeline",
  "render_schedule",
  "stage_lifecycle",
  "cost_plan",
  "compiled_prompts",
  "rendered_shots",
  "cost_ledger",
  "deliverable",
  "delivery_gate"
];

function parseArgs(args) {
  const options = { ...defaults, writeReport: true };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--paid-report", "paidReportPath"],
    ["--final-media", "finalMediaPath"],
    ["--mixed-output-report", "mixedOutputReportPath"],
    ["--continuity-report", "continuityReportPath"],
    ["--agent-review-report", "agentReviewReportPath"],
    ["--timeline-report", "timelineReportPath"],
    ["--scheduler-report", "schedulerReportPath"],
    ["--target-duration-seconds", "targetDurationSeconds"],
    ["--min-duration-seconds", "minDurationSeconds"],
    ["--max-duration-seconds", "maxDurationSeconds"],
    ["--max-approved-atlas-spend-usd", "maxApprovedAtlasSpendUsd"]
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (!key) {
      throw new Error(`Unknown option: ${arg}`);
    }
    const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
    options[key] = numericOption(key) ? Number(rawValue) : rawValue;
    index += equalsIndex >= 0 ? 0 : 1;
  }
  return options;
}

function numericOption(key) {
  return ["targetDurationSeconds", "minDurationSeconds", "maxDurationSeconds", "maxApprovedAtlasSpendUsd"].includes(key);
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

const { MediaInspector } = await import("../dist/core/media-inspector.js");
const { DeliveryGate } = await import("../dist/core/delivery-gate.js");

const paidReport = readJsonReport(options.paidReportPath);
const mixedOutputReport = readJsonReport(options.mixedOutputReportPath);
const continuityReport = readJsonReport(options.continuityReportPath);
const agentReviewReport = readJsonReport(options.agentReviewReportPath);
const timelineReport = readJsonReport(options.timelineReportPath);
const schedulerReport = readJsonReport(options.schedulerReportPath);
const mediaPath = resolve(repoRoot, options.finalMediaPath);
const mediaProbe = await probeMedia(mediaPath);

const checks = [
  checkPaidRenderCompleted(paidReport),
  checkAtlasBudget(paidReport, options.maxApprovedAtlasSpendUsd),
  checkArtifactValidation(paidReport),
  checkArtifactKinds(paidReport, requiredArtifactKinds),
  checkNoSpendSmoke("mixed_output_assembly", mixedOutputReport),
  checkNoSpendSmoke("long_form_continuity", continuityReport),
  checkNoSpendSmoke("long_form_agent_review", agentReviewReport),
  checkNoSpendSmoke("long_form_timeline", timelineReport),
  checkNoSpendSmoke("render_scheduler", schedulerReport),
  checkMixedOutputSummary(mixedOutputReport),
  checkMediaDuration(mediaProbe, options),
  checkMediaVideoStream(mediaProbe),
  checkDeliveryGate(mediaProbe, options)
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-backend-45s-closure-audit.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  scope: {
    label: "approved_45_to_60_second_long_backend_real_smoke",
    targetDurationSeconds: options.targetDurationSeconds,
    minDurationSeconds: options.minDurationSeconds,
    maxDurationSeconds: options.maxDurationSeconds,
    maxApprovedAtlasSpendUsd: options.maxApprovedAtlasSpendUsd,
    commercial120To480LongFormScope: false
  },
  evidence: {
    paidRender: summarizePaidReport(paidReport, options.paidReportPath),
    noSpendSmokes: {
      mixedOutputAssembly: summarizeSmoke(mixedOutputReport, options.mixedOutputReportPath),
      longFormContinuity: summarizeSmoke(continuityReport, options.continuityReportPath),
      longFormAgentReview: summarizeSmoke(agentReviewReport, options.agentReviewReportPath),
      longFormTimeline: summarizeSmoke(timelineReport, options.timelineReportPath),
      renderScheduler: summarizeSmoke(schedulerReport, options.schedulerReportPath)
    },
    finalMedia: summarizeMedia(mediaProbe, options.finalMediaPath)
  },
  checks,
  releaseGateSummary: {
    canUseAsLongBackend45To60ClosureEvidence: status === "pass",
    canProceedToShortBackendPlanning: status === "pass",
    canClaimLongFormCommercial120To480Evidence: false,
    canClaimDirectorBenchParity: false,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "45-60s real long-backend smoke is closed; commercial customer traffic still requires product policy, deployment, billing/workspace, and manual release approval."
      : "Long-backend 45-60s closure audit failed; fix failing checks before using this as final long smoke evidence."
  },
  nextActions: status === "pass"
    ? [
        "Use this report as the final backend-long 45-60s closure evidence before starting short pipeline hardening.",
        "Keep mixed-output assembly, continuity, agent-review, timeline, scheduler, and paid artifact validation gates passing after future changes.",
        "Do not claim 120-480s commercial long-form validation or DirectorBench parity from this 45-60s scope."
      ]
    : ["Fix failed closure checks, rerun validation:mixed-output-assembly and this closure audit, then refresh the report."]
};

if (options.writeReport) {
  const outputPath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;

function readJsonReport(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { present: false, path };
  }
  const bytes = readFileSync(absolutePath);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString("utf16le") : bytes.toString("utf8");
  return {
    present: true,
    path,
    value: JSON.parse(text)
  };
}

async function probeMedia(path) {
  if (!existsSync(path)) {
    return { present: false, path };
  }
  const inspector = new MediaInspector();
  const metadata = await inspector.probe(path);
  const delivery = inspector.inspectDelivery(metadata);
  return {
    present: true,
    path,
    sizeBytes: statSync(path).size,
    sha256: sha256(path),
    metadata,
    delivery
  };
}

function checkPaidRenderCompleted(read) {
  const report = read.value;
  return report?.status === "completed" && Number(report?.costLedgerEntryCount ?? 0) > 0
    ? pass("paid_render_completed", "Paid Atlas render completed and provider cost ledger entries exist.")
    : fail("paid_render_completed", "Paid Atlas render report is missing, incomplete, or has no provider cost ledger entries.");
}

function checkAtlasBudget(read, maxApprovedAtlasSpendUsd) {
  const gate = read.value?.atlasBillingGate;
  const withinApprovedBudget =
    gate?.status === "pass" &&
    gate?.canUseAsPrePaidAtlasBillingEvidence === true &&
    gate?.freshForPaidValidation === true &&
    gate?.plannedCostWithinRequestCap === true &&
    gate?.budgetCoversRequestCap === true &&
    Number(gate?.currentMaxCostUsd ?? Number.POSITIVE_INFINITY) <= maxApprovedAtlasSpendUsd &&
    Number(gate?.reportMaxBudgetUsd ?? Number.POSITIVE_INFINITY) <= maxApprovedAtlasSpendUsd;
  return withinApprovedBudget
    ? pass("atlas_budget_gate", `Atlas billing/budget gate passed within the approved $${maxApprovedAtlasSpendUsd} cap.`)
    : fail("atlas_budget_gate", `Atlas billing/budget gate did not prove spend stayed within the approved $${maxApprovedAtlasSpendUsd} cap.`);
}

function checkArtifactValidation(read) {
  const validation = read.value?.artifactValidation;
  return validation?.status === "pass"
    ? pass("artifact_validation_pass", "Paid run artifact manifest, hashes, required files, and domain checks passed.")
    : fail("artifact_validation_pass", "Paid run artifact validation is missing or not pass.");
}

function checkArtifactKinds(read, kinds) {
  const presentKinds = new Set((read.value?.artifactBundle?.entries ?? []).map((entry) => entry?.kind));
  const missing = kinds.filter((kind) => !presentKinds.has(kind));
  return missing.length === 0
    ? pass("artifact_kind_coverage", "Paid run artifact bundle contains all required long-backend planning, render, delivery, and ledger artifacts.")
    : fail("artifact_kind_coverage", `Paid run artifact bundle is missing required artifact kinds: ${missing.join(", ")}.`);
}

function checkNoSpendSmoke(name, read) {
  const report = read.value;
  return report?.status === "pass" && report?.noSpend === true && report?.providerCallsMade === false
    ? pass(`${name}_smoke_pass`, `${name} smoke passed without provider spend.`)
    : fail(`${name}_smoke_pass`, `${name} smoke is missing, failed, or made provider calls.`);
}

function checkMixedOutputSummary(read) {
  const scenario = read.value?.scenarios?.mixedProviderOutputs;
  const safe =
    scenario?.providerOutputUrlCount === 6 &&
    scenario?.selectedAssemblyClipCount === 3 &&
    scenario?.rejectedSidecarCount === 3 &&
    read.value?.checkedInputs?.rawOutputUrlsStoredInReport === false;
  return safe
    ? pass("mixed_output_media_selection", "Mixed Atlas-style media outputs keep sidecar images out of assembly and out of the report.")
    : fail("mixed_output_media_selection", "Mixed-output assembly evidence is missing or did not prove video-only clip selection.");
}

function checkMediaDuration(media, optionsValue) {
  const duration = media.metadata?.durationSeconds;
  return media.present &&
    typeof duration === "number" &&
    duration >= optionsValue.minDurationSeconds &&
    duration <= optionsValue.maxDurationSeconds
    ? pass("final_media_duration", `Final checked media duration ${duration}s is inside the approved ${optionsValue.minDurationSeconds}-${optionsValue.maxDurationSeconds}s range.`)
    : fail("final_media_duration", "Final checked media is missing or outside the approved 45-60s smoke range.");
}

function checkMediaVideoStream(media) {
  const video = media.metadata?.streams?.find((stream) => stream.type === "video");
  return video?.width && video?.height && media.sizeBytes > 0
    ? pass("final_media_video_stream", `Final checked media has a video stream at ${video.width}x${video.height}.`)
    : fail("final_media_video_stream", "Final checked media is missing a valid video stream.");
}

function checkDeliveryGate(media, optionsValue) {
  if (!media.delivery) {
    return fail("final_media_delivery_gate", "Final checked media could not be inspected.");
  }
  const gate = new DeliveryGate().evaluate({
    deliverable: {
      projectId: "long_backend_45s_closure",
      outputPath: media.path,
      outputByteSize: media.sizeBytes,
      outputSha256: media.sha256,
      clipCount: 6,
      assembledAt: new Date(),
      inspection: media.delivery
    },
    settings: {
      model: "seedance-v1-pro",
      tier: "fast",
      ratio: "16:9",
      resolution: "480p",
      durationTargetSeconds: optionsValue.targetDurationSeconds,
      qualityMode: "economy",
      audioMode: "none",
      fps: 30,
      seed: 1,
      returnLastFrame: true
    }
  });
  return gate.status === "pass"
    ? pass("final_media_delivery_gate", "Final checked media passes deterministic delivery gate for resolution, aspect ratio, duration, and audio policy.")
    : fail("final_media_delivery_gate", `Final checked media delivery gate status is ${gate.status}.`);
}

function summarizePaidReport(read, path) {
  const report = read.value ?? {};
  return {
    path,
    present: read.present === true,
    schemaVersion: report.schemaVersion,
    status: report.status,
    requestId: report.requestId,
    artifactValidationStatus: report.artifactValidation?.status,
    costLedgerEntryCount: report.costLedgerEntryCount,
    atlasBillingGateStatus: report.atlasBillingGate?.status,
    approvedBudgetUsd: report.atlasBillingGate?.reportMaxBudgetUsd,
    plannedCostUsd: report.atlasBillingGate?.reportPlannedCostUsd,
    artifactKindCount: report.artifactBundle?.entries?.length ?? 0
  };
}

function summarizeSmoke(read, path) {
  const report = read.value ?? {};
  return {
    path,
    present: read.present === true,
    schemaVersion: report.schemaVersion,
    status: report.status,
    noSpend: report.noSpend,
    providerCallsMade: report.providerCallsMade
  };
}

function summarizeMedia(media, path) {
  const video = media.metadata?.streams?.find((stream) => stream.type === "video");
  return {
    path,
    present: media.present === true,
    sizeBytes: media.sizeBytes,
    sha256: media.sha256,
    durationSeconds: media.metadata?.durationSeconds,
    deliveryStatus: media.delivery?.status,
    video: video
      ? {
          codecName: video.codecName,
          width: video.width,
          height: video.height,
          frameRate: video.frameRate
        }
      : undefined,
    audio: media.delivery?.audio
      ? {
          hasAudio: media.delivery.audio.hasAudio
        }
      : undefined
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
