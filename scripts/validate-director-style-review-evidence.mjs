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
    allowedTopLevelKeys: [
      "schemaVersion",
      "reviewerType",
      "status",
      "artifactBinding",
      "reviewedShotCount",
      "reviewedBoundaryCount",
      "metrics",
      "findings"
    ],
    allowedItemKeys: [
      "metricName",
      "status",
      "reviewerType",
      "score",
      "likertScore",
      "confidence",
      "evidenceSummary",
      "reviewedShotCount",
      "reviewedBoundaryCount",
      "findings"
    ],
    allowedReviewerTypes: ["manual", "vlm", "hybrid"],
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
    allowedTopLevelKeys: [
      "schemaVersion",
      "reviewerType",
      "status",
      "artifactBinding",
      "reviewedSegmentCount",
      "reviewedBoundaryCount",
      "metrics",
      "findings"
    ],
    allowedItemKeys: [
      "metricName",
      "status",
      "reviewerType",
      "score",
      "likertScore",
      "confidence",
      "evidenceSummary",
      "reviewedSegmentCount",
      "reviewedBoundaryCount",
      "findings"
    ],
    allowedReviewerTypes: ["manual", "asr", "waveform", "hybrid"],
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
    allowedTopLevelKeys: [
      "schemaVersion",
      "reviewerType",
      "status",
      "artifactBinding",
      "reviewedSegmentCount",
      "reviewedBoundaryCount",
      "metrics",
      "findings"
    ],
    allowedItemKeys: [
      "metricName",
      "status",
      "reviewerType",
      "score",
      "likertScore",
      "confidence",
      "evidenceSummary",
      "reviewedSegmentCount",
      "reviewedBoundaryCount",
      "findings"
    ],
    allowedReviewerTypes: ["manual", "asr", "lip_sync", "hybrid"],
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
    allowedTopLevelKeys: [
      "schemaVersion",
      "reviewerType",
      "status",
      "artifactBinding",
      "reviewedAt",
      "checks",
      "findings"
    ],
    allowedItemKeys: [
      "checkName",
      "status",
      "reviewerType",
      "evidenceSummary",
      "reviewedAt",
      "findings"
    ],
    allowedReviewerTypes: ["operator", "legal", "product", "security", "hybrid"],
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
  const schemaIssues = reviewSchemaIssues(config, value, collection);
  const schemaValid = schemaVersion === config.schemaVersion && collection.length > 0 && schemaIssues.length === 0;
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
  issues.push(...schemaIssues);
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
  if (reviews.some((review) => review.present && review.jsonValid && !review.schemaValid)) {
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

function reviewSchemaIssues(config, value, collection) {
  const issues = [];
  const allowedTopLevelKeys = new Set(config.allowedTopLevelKeys);
  const allowedItemKeys = new Set(config.allowedItemKeys);
  const supportedNames = new Set(config.requiredNames);

  for (const key of Object.keys(value)) {
    if (!allowedTopLevelKeys.has(key)) {
      issues.push(`${config.kind} review has unsupported top-level field ${key}.`);
    }
  }
  if (value.schemaVersion !== config.schemaVersion) {
    issues.push(`${config.kind} review schemaVersion must be ${config.schemaVersion}.`);
  }
  if (!config.allowedReviewerTypes.includes(value.reviewerType)) {
    issues.push(`${config.kind} review reviewerType is unsupported.`);
  }
  if (value.status !== undefined && !normalizeStatus(value.status)) {
    issues.push(`${config.kind} review status is unsupported.`);
  }
  issues.push(...artifactBindingShapeIssues(config.kind, value.artifactBinding));
  issues.push(...countFieldIssues(config.kind, value, ["reviewedShotCount", "reviewedSegmentCount", "reviewedBoundaryCount"]));
  if (value.reviewedAt !== undefined && !validDateTime(value.reviewedAt)) {
    issues.push(`${config.kind} review reviewedAt must be a valid date-time string.`);
  }
  issues.push(...safeReviewTextArrayIssues(`${config.kind} review findings`, value.findings));

  collection.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(`${config.kind} review item ${index} must be an object.`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!allowedItemKeys.has(key)) {
        issues.push(`${config.kind} review item ${index} has unsupported field ${key}.`);
      }
    }
    const name = checkpointNameFor(item, config.nameKeys);
    if (!name || !supportedNames.has(name)) {
      issues.push(`${config.kind} review item ${index} has an unsupported checkpoint name.`);
    }
    if (item.status !== undefined && !normalizeStatus(item.status)) {
      issues.push(`${config.kind} review item ${index} status is unsupported.`);
    }
    if (item.reviewerType !== undefined && !config.allowedReviewerTypes.includes(item.reviewerType)) {
      issues.push(`${config.kind} review item ${index} reviewerType is unsupported.`);
    }
    if (typeof item.evidenceSummary !== "string" || !safeReviewText(item.evidenceSummary)) {
      issues.push(`${config.kind} review item ${index} evidenceSummary must be safe bounded review text.`);
    }
    if (config.kind === "governance") {
      if (item.status === undefined) {
        issues.push(`${config.kind} review item ${index} must include status.`);
      }
    } else {
      const hasScore = typeof item.score === "number";
      const hasLikert = typeof item.likertScore === "number";
      if (!hasScore && !hasLikert) {
        issues.push(`${config.kind} review item ${index} must include score or likertScore.`);
      }
      if (hasScore && (item.score < 0 || item.score > 1 || !Number.isFinite(item.score))) {
        issues.push(`${config.kind} review item ${index} score must be between 0 and 1.`);
      }
      if (hasLikert && (item.likertScore < 1 || item.likertScore > 5 || !Number.isFinite(item.likertScore))) {
        issues.push(`${config.kind} review item ${index} likertScore must be between 1 and 5.`);
      }
      if (item.confidence !== undefined && (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1 || !Number.isFinite(item.confidence))) {
        issues.push(`${config.kind} review item ${index} confidence must be between 0 and 1.`);
      }
    }
    if (item.reviewedAt !== undefined && !validDateTime(item.reviewedAt)) {
      issues.push(`${config.kind} review item ${index} reviewedAt must be a valid date-time string.`);
    }
    issues.push(...countFieldIssues(`${config.kind} review item ${index}`, item, ["reviewedShotCount", "reviewedSegmentCount", "reviewedBoundaryCount"]));
    issues.push(...safeReviewTextArrayIssues(`${config.kind} review item ${index} findings`, item.findings));
  });

  return [...new Set(issues)];
}

function artifactBindingShapeIssues(kind, binding) {
  if (binding === undefined) {
    return [];
  }
  const issues = [];
  if (!isRecord(binding)) {
    return [`${kind} review artifactBinding must be an object when present.`];
  }
  for (const key of Object.keys(binding)) {
    if (!["projectId", "requestId", "deliverableSha256"].includes(key)) {
      issues.push(`${kind} review artifactBinding has unsupported field ${key}.`);
    }
  }
  if (binding.projectId !== undefined && !safeIdentifier(binding.projectId)) {
    issues.push(`${kind} review artifactBinding.projectId must be a safe identifier.`);
  }
  if (binding.requestId !== undefined && !safeIdentifier(binding.requestId)) {
    issues.push(`${kind} review artifactBinding.requestId must be a safe identifier.`);
  }
  if (binding.deliverableSha256 !== undefined && !safeSha256(binding.deliverableSha256)) {
    issues.push(`${kind} review artifactBinding.deliverableSha256 must be a SHA-256 digest.`);
  }
  return issues;
}

function countFieldIssues(label, value, names) {
  const issues = [];
  for (const name of names) {
    if (value[name] !== undefined && (!Number.isSafeInteger(value[name]) || value[name] < 0)) {
      issues.push(`${label} ${name} must be a non-negative integer.`);
    }
  }
  return issues;
}

function safeReviewTextArrayIssues(label, value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`${label} must be an array when present.`];
  }
  return value.flatMap((item, index) =>
    typeof item === "string" && safeReviewText(item)
      ? []
      : [`${label}[${index}] must be safe bounded review text.`]
  );
}

const unsafeReviewTextPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /sk-[A-Za-z0-9_-]+/i,
  /apikey-[A-Za-z0-9]{20,}/i,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/i,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/i,
  /[A-Za-z]:\\[^\s"'<>]+/,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/,
  /https?:\/\/[^\s"'<>]+/i,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/i,
  /data:[^\s"'<>]+/i
];

function safeReviewText(value) {
  return typeof value === "string" &&
    value.trim().length >= 1 &&
    value.length <= 500 &&
    !unsafeReviewTextPatterns.some((pattern) => pattern.test(value));
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim());
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function validDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
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
