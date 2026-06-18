#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  paidRenderReportPath: "assets/output_deliverables/phase6-validation/paid-render-report.json",
  semanticReviewPath: "assets/output_deliverables/business-readiness/director-style-semantic-review.json",
  audioReviewPath: "assets/output_deliverables/business-readiness/director-style-audio-review.json",
  runtimeReviewPath: "assets/output_deliverables/business-readiness/director-style-runtime-review.json",
  governanceReviewPath: "assets/output_deliverables/business-readiness/director-style-governance-review.json",
  outputPath: "assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json"
};

const reviewConfigs = [
  {
    kind: "semantic",
    optionKey: "semanticReviewPath",
    schemaVersion: "cinejelly.director-style-semantic-review.v1",
    collectionKey: "metrics",
    nameKeys: ["metricName", "metric", "id"],
    requiredNames: [
      "script_video_fidelity",
      "user_demand_fulfillment",
      "temporal_coherence",
      "transition_quality",
      "lighting_consistency",
      "text_video_consistency"
    ]
  },
  {
    kind: "audio",
    optionKey: "audioReviewPath",
    schemaVersion: "cinejelly.director-style-audio-review.v1",
    collectionKey: "metrics",
    nameKeys: ["metricName", "metric", "id"],
    requiredNames: [
      "narration_reasonableness",
      "bgm_consistency",
      "video_audio_consistency",
      "text_audio_consistency"
    ]
  },
  {
    kind: "runtime",
    optionKey: "runtimeReviewPath",
    schemaVersion: "cinejelly.director-style-runtime-review.v1",
    collectionKey: "metrics",
    nameKeys: ["metricName", "metric", "id"],
    requiredNames: [
      "asr_transcript_alignment",
      "lip_sync_timing"
    ]
  },
  {
    kind: "governance",
    optionKey: "governanceReviewPath",
    schemaVersion: "cinejelly.director-style-governance-review.v1",
    collectionKey: "checks",
    fallbackCollectionKey: "metrics",
    nameKeys: ["checkName", "check", "metricName", "id"],
    requiredNames: [
      "directorbench_license_boundary",
      "upstream_code_reuse_boundary",
      "runtime_evaluator_independence",
      "evaluation_asset_permissions"
    ]
  }
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--paid-render-report", "paidRenderReportPath"],
    ["--semantic-review", "semanticReviewPath"],
    ["--audio-review", "audioReviewPath"],
    ["--runtime-review", "runtimeReviewPath"],
    ["--governance-review", "governanceReviewPath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = value;
      index += equalsIndex >= 0 ? 0 : 1;
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

function printHelp() {
  console.log(`Validate Director-style structured review evidence readiness without network or provider calls.

Usage:
  npm.cmd run validation:quality-review-evidence

Options:
  --paid-render-report <path>  Paid render report with expected project/request/deliverable binding.
                               Default: ${defaults.paidRenderReportPath}
  --semantic-review <path>     Structured semantic review JSON. Default: ${defaults.semanticReviewPath}
  --audio-review <path>        Structured audio review JSON. Default: ${defaults.audioReviewPath}
  --runtime-review <path>      Structured ASR/lip-sync runtime review JSON. Default: ${defaults.runtimeReviewPath}
  --governance-review <path>   Structured governance review JSON. Default: ${defaults.governanceReviewPath}
  --output <path>              Report path. Default: ${defaults.outputPath}
  --no-output                  Print only; do not write the report.

This command does not inspect media, call Atlas, call deployment hosts, or approve DirectorBench parity. It only checks whether all review packets are present, explicitly accepted, and bound to the paid artifact fingerprint.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const paidRead = readJson(options.paidRenderReportPath);
  const expectedArtifactBinding = expectedArtifactBindingFor(paidRead.value);
  const reviews = reviewConfigs.map((config) => summarizeReview(config, options[config.optionKey], expectedArtifactBinding));
  const status = statusFor({ paidRead, expectedArtifactBinding, reviews });
  const acceptedReviewCount = reviews.filter((review) => review.accepted === true).length;
  const presentReviewCount = reviews.filter((review) => review.present === true).length;
  const artifactBoundReviewCount = reviews.filter((review) => review.artifactBindingStatus === "matched").length;
  const issueMessages = [
    ...(paidRead.error ? [`Paid render report is invalid JSON: ${paidRead.error}.`] : []),
    ...reviews.flatMap((review) => review.issues)
  ];
  if (!expectedArtifactBinding.complete) {
    issueMessages.push("Paid render report must expose projectId, requestId, and deliverableSha256 before accepted review evidence can be bound.");
  }

  const report = {
    schemaVersion: "cinejelly.director-style-review-evidence-readiness.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      paidRenderReportPath: toRepoRelative(options.paidRenderReportPath),
      semanticReviewPath: toRepoRelative(options.semanticReviewPath),
      audioReviewPath: toRepoRelative(options.audioReviewPath),
      runtimeReviewPath: toRepoRelative(options.runtimeReviewPath),
      governanceReviewPath: toRepoRelative(options.governanceReviewPath),
      outputPath: toRepoRelative(options.outputPath)
    },
    expectedArtifactBinding,
    summary: {
      requiredReviewCount: reviewConfigs.length,
      presentReviewCount,
      acceptedReviewCount,
      artifactBoundReviewCount,
      canUseAsAcceptedDirectorReviewEvidence: status === "pass",
      canRunQualityBenchmarkWithAcceptedReviews: status === "pass",
      canClaimDirectorBenchParity: false
    },
    reviews,
    issues: [...new Set(issueMessages)],
    releaseGateSummary: {
      acceptedDirectorReviewEvidencePass: status === "pass",
      canUseAsAcceptedDirectorReviewEvidence: status === "pass",
      canClaimDirectorBenchParity: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Structured review evidence is accepted and artifact-bound, but DirectorBench parity still requires the benchmark parity matrix and remaining live media/provider evidence to pass."
        : "Structured semantic/audio/runtime/governance review evidence is missing, not accepted, invalid, or not bound to the paid artifact."
    },
    nextActions: nextActionsFor({ paidRead, expectedArtifactBinding, reviews, status })
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function summarizeReview(config, path, expectedArtifactBinding) {
  const read = readJson(path);
  if (!read.exists) {
    return emptyReview(config, path, "missing", [`Missing ${config.kind} review at ${toRepoRelative(path)}.`]);
  }
  if (read.error) {
    return emptyReview(config, path, "invalid_json", [`${config.kind} review JSON is invalid: ${read.error}.`], true);
  }
  const value = read.value;
  if (!isRecord(value)) {
    return emptyReview(config, path, "invalid_shape", [`${config.kind} review must be a JSON object.`], true);
  }

  const collection = Array.isArray(value[config.collectionKey])
    ? value[config.collectionKey]
    : config.fallbackCollectionKey && Array.isArray(value[config.fallbackCollectionKey])
      ? value[config.fallbackCollectionKey]
      : [];
  const names = collection
    .map((item) => checkpointNameFor(item, config.nameKeys))
    .filter((name) => typeof name === "string");
  const acceptedNames = collection
    .filter((item) => isRecord(item) && normalizeStatus(item.status) === "accepted")
    .map((item) => checkpointNameFor(item, config.nameKeys))
    .filter((name) => typeof name === "string");
  const missingCheckpointNames = config.requiredNames.filter((name) => !names.includes(name));
  const nonAcceptedCheckpointNames = config.requiredNames.filter((name) => !acceptedNames.includes(name));
  const artifactBindingStatus = artifactBindingStatusFor(value.artifactBinding, expectedArtifactBinding);
  const topLevelStatus = normalizeStatus(value.status) ?? "missing";
  const schemaVersion = typeof value.schemaVersion === "string" ? value.schemaVersion : "missing";
  const schemaValid = schemaVersion === config.schemaVersion && collection.length > 0;
  const accepted =
    schemaValid &&
    topLevelStatus === "accepted" &&
    artifactBindingStatus === "matched" &&
    missingCheckpointNames.length === 0 &&
    nonAcceptedCheckpointNames.length === 0;
  const issues = [];
  if (schemaVersion !== config.schemaVersion) {
    issues.push(`${config.kind} review schemaVersion must be ${config.schemaVersion}.`);
  }
  if (collection.length === 0) {
    issues.push(`${config.kind} review must contain ${config.collectionKey} evidence.`);
  }
  if (topLevelStatus !== "accepted") {
    issues.push(`${config.kind} review top-level status must be accepted.`);
  }
  if (artifactBindingStatus !== "matched") {
    issues.push(`${config.kind} review artifactBinding must match the paid-render projectId, requestId, and deliverableSha256.`);
  }
  if (missingCheckpointNames.length > 0) {
    issues.push(`${config.kind} review is missing required checkpoint(s): ${missingCheckpointNames.join(", ")}.`);
  }
  if (nonAcceptedCheckpointNames.length > 0) {
    issues.push(`${config.kind} review has non-accepted required checkpoint(s): ${nonAcceptedCheckpointNames.join(", ")}.`);
  }

  return {
    kind: config.kind,
    path: toRepoRelative(path),
    present: true,
    jsonValid: true,
    schemaVersion,
    schemaValid,
    status: topLevelStatus,
    artifactBindingStatus,
    checkpointCount: collection.length,
    requiredCheckpointCount: config.requiredNames.length,
    acceptedCheckpointCount: acceptedNames.filter((name) => config.requiredNames.includes(name)).length,
    missingCheckpointNames,
    nonAcceptedCheckpointNames,
    accepted,
    issues
  };
}

function emptyReview(config, path, status, issues, present = false) {
  return {
    kind: config.kind,
    path: toRepoRelative(path),
    present,
    jsonValid: false,
    schemaVersion: "missing",
    schemaValid: false,
    status,
    artifactBindingStatus: "not_checked",
    checkpointCount: 0,
    requiredCheckpointCount: config.requiredNames.length,
    acceptedCheckpointCount: 0,
    missingCheckpointNames: [...config.requiredNames],
    nonAcceptedCheckpointNames: [...config.requiredNames],
    accepted: false,
    issues
  };
}

function statusFor({ paidRead, expectedArtifactBinding, reviews }) {
  if (paidRead.error || reviews.some((review) => review.present && !review.jsonValid)) {
    return "fail";
  }
  if (!expectedArtifactBinding.complete || reviews.some((review) => review.present && review.artifactBindingStatus !== "matched")) {
    return "blocked_by_artifact_binding";
  }
  if (reviews.some((review) => !review.present)) {
    return "blocked_by_missing_reviews";
  }
  if (reviews.some((review) => !review.accepted)) {
    return "blocked_by_review_status";
  }
  return "pass";
}

function nextActionsFor({ paidRead, expectedArtifactBinding, reviews, status }) {
  const actions = [];
  if (!paidRead.exists) {
    actions.push("Run or restore the paid-render validation report before binding review evidence.");
  }
  if (paidRead.error) {
    actions.push("Fix paid-render report JSON before review evidence can be checked.");
  }
  if (!expectedArtifactBinding.complete) {
    actions.push("Refresh paid-render evidence until projectId, requestId, and deliverableSha256 are available.");
  }
  for (const review of reviews) {
    if (!review.present) {
      actions.push(`Create ${review.kind} review JSON at ${review.path}.`);
    } else if (!review.jsonValid || !review.schemaValid) {
      actions.push(`Fix ${review.kind} review shape and schemaVersion.`);
    } else if (review.artifactBindingStatus !== "matched") {
      actions.push(`Bind ${review.kind} review to the paid-render projectId, requestId, and deliverableSha256.`);
    } else if (!review.accepted) {
      actions.push(`Update ${review.kind} review and every required checkpoint to status=accepted only after real review.`);
    }
  }
  if (status === "pass") {
    actions.push("Run validation:quality-benchmark with these accepted review packets and inspect the parityEvidenceMatrix.");
  } else {
    actions.push("Run validation:quality-review-drafts to prepare artifact-bound drafts, then replace needs_review checkpoints with accepted real review evidence.");
  }
  actions.push("Do not claim DirectorBench parity until validation:quality-benchmark parityEvidenceMatrix has no missing required evidence and release gates still agree.");
  return [...new Set(actions)];
}

function expectedArtifactBindingFor(report) {
  const deliverable = Array.isArray(report?.artifactBundle?.entries)
    ? report.artifactBundle.entries.find((entry) => entry?.kind === "deliverable")
    : undefined;
  const projectId = typeof report?.artifactBundle?.projectId === "string" ? report.artifactBundle.projectId : undefined;
  const requestId = typeof report?.requestId === "string" ? report.requestId : undefined;
  const deliverableSha256 = typeof deliverable?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(deliverable.sha256)
    ? deliverable.sha256.toLowerCase()
    : undefined;
  return {
    complete: Boolean(projectId && requestId && deliverableSha256),
    ...(projectId ? { projectId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(deliverableSha256 ? { deliverableSha256 } : {})
  };
}

function artifactBindingStatusFor(binding, expected) {
  if (!expected.complete) {
    return "not_checked";
  }
  if (!isRecord(binding)) {
    return "missing";
  }
  const deliverableSha256 = typeof binding.deliverableSha256 === "string" ? binding.deliverableSha256.toLowerCase() : undefined;
  if (
    binding.projectId === expected.projectId &&
    binding.requestId === expected.requestId &&
    deliverableSha256 === expected.deliverableSha256
  ) {
    return "matched";
  }
  return "mismatched";
}

function checkpointNameFor(value, keys) {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return undefined;
}

function normalizeStatus(value) {
  return typeof value === "string" && ["accepted", "needs_review", "rejected"].includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase()
    : undefined;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--paid-render-report", options.paidRenderReportPath],
    ["--semantic-review", options.semanticReviewPath],
    ["--audio-review", options.audioReviewPath],
    ["--runtime-review", options.runtimeReviewPath],
    ["--governance-review", options.governanceReviewPath],
    ["--output", options.outputPath]
  ]) {
    if (extname(path).toLowerCase() !== ".json") {
      throw new Error(`${flag} must point to a JSON file.`);
    }
    if (!isInsideRepo(path)) {
      throw new Error(`${flag} must resolve inside the repository workspace.`);
    }
  }
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""))
    };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  if (normalizedPath.toLowerCase().startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return "[outside-repo]";
}

function isInsideRepo(path) {
  const absolutePath = resolve(repoRoot, path);
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedPath = absolutePath.replace(/\\/g, "/").toLowerCase();
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
