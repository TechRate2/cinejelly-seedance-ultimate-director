#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  generatedAudioReportPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  artifactEvidenceReportPath: "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json",
  manualAudioReviewPath: "ops/generated-audio-manual-review.json",
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-manual-review-readiness-report.json"
};

const requiredManualCheckNames = [
  "listenedFullOutput",
  "outputIsAudible",
  "languageMatchesRequest",
  "narrationMatchesValidationText",
  "noObviousArtifacts",
  "noCredentialLeak",
  "safeForBusinessEvidence"
];

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Atlas Cloud xai/tts-v1 model page",
  "Atlas Cloud Predictions docs"
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--generated-audio-report", "generatedAudioReportPath"],
    ["--artifact-evidence-report", "artifactEvidenceReportPath"],
    ["--manual-audio-review", "manualAudioReviewPath"],
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
      options[key] = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
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
  console.log(`Validate generated-audio manual-review readiness without network or provider calls.

Usage:
  npm.cmd run validation:generated-audio-review-readiness

Options:
  --generated-audio-report <path>   Existing generated-audio validation report.
                                   Default: ${defaults.generatedAudioReportPath}
  --artifact-evidence-report <path> Generated-audio artifact evidence report.
                                   Default: ${defaults.artifactEvidenceReportPath}
  --manual-audio-review <path>      Operator-filled manual review packet.
                                   Default: ${defaults.manualAudioReviewPath}
  --output <path>                   JSON report path. Default: ${defaults.outputPath}
  --no-output                       Print only; do not write the report.

This command never calls Atlas, never downloads media, never listens on behalf of an operator, and never converts a review template into evidence.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const generatedAudioRead = readJson(options.generatedAudioReportPath);
  const sourceReportContext = generatedAudioContextFor(generatedAudioRead);
  const artifactEvidenceRead = readJson(options.artifactEvidenceReportPath);
  const artifactEvidenceContext = artifactEvidenceContextFor(artifactEvidenceRead, sourceReportContext);
  const manualReviewRead = readJson(options.manualAudioReviewPath);
  const manualReviewContext = manualReviewContextFor(manualReviewRead, sourceReportContext, artifactEvidenceContext);
  const checks = buildChecks(sourceReportContext, artifactEvidenceContext, manualReviewContext);
  const status = statusFor(sourceReportContext, artifactEvidenceContext, manualReviewContext);

  const report = {
    schemaVersion: "cinejelly.generated-audio-manual-review-readiness.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    releaseEvidence: false,
    sourcePatternOrigins,
    checkedInputs: {
      generatedAudioReportPath: toRepoRelative(options.generatedAudioReportPath),
      artifactEvidenceReportPath: toRepoRelative(options.artifactEvidenceReportPath),
      manualAudioReviewPath: toRepoRelative(options.manualAudioReviewPath),
      outputPath: toRepoRelative(options.outputPath)
    },
    sourceReportContext,
    artifactEvidenceContext,
    manualReviewContext,
    checks,
    releaseGateSummary: {
      canUseAsManualReviewReadinessEvidence: ["ready_for_manual_review", "accepted_manual_review"].includes(status),
      canUseManualReviewAsGeneratedAudioEvidence: status === "accepted_manual_review",
      canUseAsBusinessReadinessGeneratedAudioEvidence: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: releaseBlockerFor(status)
    },
    nextActions: nextActionsFor(options, status, sourceReportContext, artifactEvidenceContext, manualReviewContext)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return ["ready_for_manual_review", "accepted_manual_review"].includes(status) ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--generated-audio-report", options.generatedAudioReportPath],
    ["--artifact-evidence-report", options.artifactEvidenceReportPath],
    ["--manual-audio-review", options.manualAudioReviewPath],
    ["--output", options.outputPath]
  ]) {
    if (extname(path).toLowerCase() !== ".json") {
      throw new Error(`${flag} must point to a JSON file.`);
    }
  }
}

function generatedAudioContextFor(read) {
  const report = read.value;
  const binding = generatedAudioBindingFromReport(report);
  const outputUrlClean = typeof binding.outputUrlPreview === "string" &&
    /^https:\/\//i.test(binding.outputUrlPreview) &&
    !/[?&#]/.test(binding.outputUrlPreview);
  const providerExecutionSucceeded = report?.executionRun?.status === "succeeded";
  const outputBatchApproved =
    report?.outputBatchValidation?.status === "approved" &&
    Number(report?.outputBatchValidation?.approvedTrackCount ?? 0) > 0;
  const providerLedgerEntryCount = Number(report?.providerLedger?.entryCount ?? 0);
  const readyForArtifactAndManualReview =
    read.exists === true &&
    report?.schemaVersion === "cinejelly.generated-audio-validation.v1" &&
    report?.spendGate?.providerNetworkCallsAllowed === true &&
    report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true &&
    report?.schemaGate?.confirmAudioSchemaReviewed === true &&
    providerExecutionSucceeded &&
    outputBatchApproved &&
    providerLedgerEntryCount > 0 &&
    outputUrlClean;
  return {
    reportPresent: read.exists === true,
    reportPath: read.path,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    providerSpendEvidence: report?.spendGate?.providerNetworkCallsAllowed === true,
    atlasBillingEvidence: report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true,
    schemaReviewEvidence: report?.schemaGate?.confirmAudioSchemaReviewed === true,
    providerExecutionSucceeded,
    outputBatchApproved,
    approvedTrackCount: Number(report?.outputBatchValidation?.approvedTrackCount ?? 0),
    providerLedgerEntryCount,
    outputUrlClean,
    readyForArtifactAndManualReview,
    outputUrlSha256: binding.outputUrlPreview ? sha256(binding.outputUrlPreview) : undefined,
    artifactBinding: safeBinding(binding)
  };
}

function artifactEvidenceContextFor(read, sourceContext) {
  const report = read.value;
  const evidence = report?.artifactEvidence;
  const reportPassed = report?.schemaVersion === "cinejelly.generated-audio-artifact-evidence.v1" &&
    report?.status === "pass" &&
    report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence === true;
  const bindingMatches = reportPassed &&
    evidence?.modelId === sourceContext.artifactBinding.modelId &&
    evidence?.language === sourceContext.artifactBinding.language &&
    evidence?.voiceId === sourceContext.artifactBinding.voiceId &&
    evidence?.outputFormat === sourceContext.artifactBinding.outputFormat &&
    evidence?.intentId === sourceContext.artifactBinding.intentId &&
    evidence?.providerAssetId === sourceContext.artifactBinding.providerAssetId &&
    evidence?.predictionId === sourceContext.artifactBinding.predictionId &&
    sha256(evidence?.outputUrlPreview ?? "") === sourceContext.outputUrlSha256;
  return {
    reportPresent: read.exists === true,
    reportPath: read.path,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    canUseAsManualReviewArtifactEvidence: report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence === true,
    bindingMatchesSourceReport: bindingMatches === true,
    readyForManualReviewBinding: reportPassed && bindingMatches === true,
    mediaSha256: typeof evidence?.mediaSha256 === "string" ? evidence.mediaSha256 : undefined,
    byteSize: numberOrUndefined(evidence?.byteSize),
    durationSeconds: numberOrUndefined(evidence?.durationSeconds),
    outputUrlSha256: evidence?.outputUrlPreview ? sha256(evidence.outputUrlPreview) : undefined,
    predictionId: stringOrUndefined(evidence?.predictionId),
    artifactPath: typeof evidence?.artifactPath === "string" ? evidence.artifactPath : undefined
  };
}

function manualReviewContextFor(read, sourceContext, artifactContext) {
  const review = read.value;
  if (!read.exists) {
    return {
      present: false,
      path: read.path,
      passed: false,
      status: "missing",
      decision: "missing",
      requiredCheckCount: requiredManualCheckNames.length,
      passedCheckCount: 0,
      artifactBindingMatchesReport: false,
      artifactEvidenceMatchesReport: false,
      message: "Manual generated-audio review file is missing."
    };
  }
  if (read.error) {
    return {
      present: true,
      path: read.path,
      passed: false,
      status: "invalid_json",
      decision: "invalid_json",
      requiredCheckCount: requiredManualCheckNames.length,
      passedCheckCount: 0,
      artifactBindingMatchesReport: false,
      artifactEvidenceMatchesReport: false,
      message: `Manual generated-audio review is invalid JSON: ${read.error}.`
    };
  }
  const checks = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks) ? review.checks : {};
  const passedCheckCount = requiredManualCheckNames.filter((name) => checks[name] === true).length;
  const binding = compareManualReviewBinding(review, sourceContext);
  const artifact = compareManualReviewArtifactEvidence(review, artifactContext);
  const issues = [];
  if (review?.schemaVersion !== "cinejelly.generated-audio-manual-review.v1") {
    issues.push("schemaVersion");
  }
  if (!["manual", "approved_analyzer"].includes(review?.reviewerType)) {
    issues.push("reviewerType");
  }
  if (review?.status !== "accepted") {
    issues.push("status");
  }
  if (review?.decision !== "pass") {
    issues.push("decision");
  }
  if (review?.redactionReviewed !== true) {
    issues.push("redactionReviewed");
  }
  if (passedCheckCount !== requiredManualCheckNames.length) {
    issues.push("checks");
  }
  if (!binding.matches) {
    issues.push("artifactBinding");
  }
  if (!artifact.matches) {
    issues.push("artifactEvidence");
  }
  const hasTemplateFields = Object.keys(review ?? {}).some((key) => key.startsWith("_"));
  if (hasTemplateFields) {
    issues.push("templateFields");
  }
  return {
    present: true,
    path: read.path,
    schemaVersion: typeof review?.schemaVersion === "string" ? review.schemaVersion : "missing",
    reviewerType: typeof review?.reviewerType === "string" ? review.reviewerType : "missing",
    status: typeof review?.status === "string" ? review.status : "missing",
    decision: typeof review?.decision === "string" ? review.decision : "missing",
    reviewedAt: typeof review?.reviewedAt === "string" ? review.reviewedAt : undefined,
    requiredCheckCount: requiredManualCheckNames.length,
    passedCheckCount,
    artifactBindingMatchesReport: binding.matches,
    artifactEvidenceMatchesReport: artifact.matches,
    artifactEvidenceReportPath: artifact.reportPath,
    mediaSha256: artifact.mediaSha256,
    templateFieldsPresent: hasTemplateFields,
    passed: issues.length === 0,
    issues,
    message: issues.length === 0
      ? "Structured manual generated-audio review is accepted and bound to artifact evidence."
      : `Structured manual generated-audio review is not accepted: ${issues.join(", ")}.`
  };
}

function buildChecks(sourceContext, artifactContext, manualContext) {
  return [
    sourceContext.readyForArtifactAndManualReview
      ? pass("generated_audio_provider_evidence_ready", "Generated-audio provider execution, output batch, ledger, billing, schema, and clean output URL evidence are ready.")
      : fail("generated_audio_provider_evidence_ready", "Generated-audio provider evidence is not ready for manual review."),
    artifactContext.readyForManualReviewBinding
      ? pass("artifact_evidence_ready", "Generated-audio artifact evidence is captured and bound to the provider output.")
      : fail("artifact_evidence_ready", "Generated-audio artifact evidence is missing, failed, or not bound to the provider output."),
    manualContext.present
      ? pass("manual_review_file_present", "Manual generated-audio review file is present.")
      : warn("manual_review_file_present", "Manual generated-audio review file is not present yet."),
    manualContext.passed
      ? pass("manual_review_accepted", "Manual generated-audio review is accepted and evidence-bound.")
      : warn("manual_review_accepted", "Manual generated-audio review is not accepted yet.")
  ];
}

function statusFor(sourceContext, artifactContext, manualContext) {
  if (!sourceContext.readyForArtifactAndManualReview) {
    return "blocked_by_generated_audio_report";
  }
  if (!artifactContext.readyForManualReviewBinding) {
    return "blocked_by_artifact_evidence";
  }
  if (manualContext.passed) {
    return "accepted_manual_review";
  }
  if (manualContext.present) {
    return "blocked_by_manual_review";
  }
  return "ready_for_manual_review";
}

function releaseBlockerFor(status) {
  if (status === "accepted_manual_review") {
    return "Manual generated-audio review is accepted, but the generated-audio validation report must still be refreshed with review-existing mode before business-readiness can count it.";
  }
  if (status === "ready_for_manual_review") {
    return "Provider output and artifact evidence are ready; a human or approved analyzer must listen and fill the manual review packet.";
  }
  if (status === "blocked_by_generated_audio_report") {
    return "Generated-audio provider execution evidence is not ready.";
  }
  if (status === "blocked_by_artifact_evidence") {
    return "Generated-audio artifact evidence is not captured or not bound to the provider output.";
  }
  return "Generated-audio manual review evidence is present but not accepted.";
}

function nextActionsFor(options, status, sourceContext, artifactContext, manualContext) {
  const actions = [];
  if (!sourceContext.readyForArtifactAndManualReview) {
    actions.push("Run generated-audio validation with provider spend and schema review, or resume/review an existing provider report until execution, output batch, and ledger evidence are ready.");
  }
  if (sourceContext.readyForArtifactAndManualReview && !artifactContext.readyForManualReviewBinding) {
    actions.push(`Run npm.cmd run validation:generated-audio-artifact -- --confirm-live-network to capture SHA-256/duration evidence at ${toRepoRelative(options.artifactEvidenceReportPath)}.`);
  }
  if (status === "ready_for_manual_review") {
    actions.push(`Listen to the generated audio, fill ${toRepoRelative(options.manualAudioReviewPath)}, and keep artifact binding values unchanged.`);
    actions.push(`Run npm.cmd run validation:generated-audio -- --review-existing-report ${toRepoRelative(options.generatedAudioReportPath)} --manual-audio-review ${toRepoRelative(options.manualAudioReviewPath)} --confirm-manual-audio-review.`);
  }
  if (status === "blocked_by_manual_review") {
    actions.push(`Fix ${toRepoRelative(options.manualAudioReviewPath)}: ${manualContext.message}`);
  }
  if (status === "accepted_manual_review") {
    actions.push(`Refresh the generated-audio validation report with npm.cmd run validation:generated-audio -- --review-existing-report ${toRepoRelative(options.generatedAudioReportPath)} --manual-audio-review ${toRepoRelative(options.manualAudioReviewPath)} --confirm-manual-audio-review.`);
  }
  actions.push("Do not claim generated-audio business readiness until the generated-audio validation report itself passes after review-existing mode.");
  return [...new Set(actions)];
}

function compareManualReviewBinding(review, sourceContext) {
  const binding = review?.artifactBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return { matches: false, message: "artifactBinding is missing." };
  }
  const expected = sourceContext.artifactBinding;
  const mismatch = Object.entries(expected)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .filter(([key, value]) => binding[key] !== value)
    .map(([key]) => key);
  return {
    matches: mismatch.length === 0,
    message: mismatch.length === 0 ? "artifactBinding matches." : `artifactBinding mismatch: ${mismatch.join(", ")}.`
  };
}

function compareManualReviewArtifactEvidence(review, artifactContext) {
  const evidence = review?.artifactEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { matches: false, message: "artifactEvidence is missing." };
  }
  const mismatches = [];
  if (evidence.generatedAudioArtifactEvidenceReportPath !== artifactContext.reportPath) {
    mismatches.push("generatedAudioArtifactEvidenceReportPath");
  }
  if (evidence.mediaSha256 !== artifactContext.mediaSha256) mismatches.push("mediaSha256");
  if (evidence.byteSize !== artifactContext.byteSize) mismatches.push("byteSize");
  if (evidence.durationSeconds !== artifactContext.durationSeconds) mismatches.push("durationSeconds");
  if (sha256(evidence.outputUrlPreview ?? "") !== artifactContext.outputUrlSha256) mismatches.push("outputUrlPreview");
  if (evidence.predictionId !== artifactContext.predictionId) mismatches.push("predictionId");
  return {
    matches: artifactContext.readyForManualReviewBinding === true && mismatches.length === 0,
    reportPath: stringOrUndefined(evidence.generatedAudioArtifactEvidenceReportPath),
    mediaSha256: stringOrUndefined(evidence.mediaSha256),
    message: mismatches.length === 0 ? "artifactEvidence matches." : `artifactEvidence mismatch: ${mismatches.join(", ")}.`
  };
}

function generatedAudioBindingFromReport(report) {
  const result = Array.isArray(report?.executionRun?.results)
    ? report.executionRun.results.find((item) => item?.status === "succeeded") ?? report.executionRun.results[0]
    : undefined;
  const batchReport = Array.isArray(report?.outputBatchValidation?.reports)
    ? report.outputBatchValidation.reports.find((item) => item?.status === "approved") ?? report.outputBatchValidation.reports[0]
    : undefined;
  const ledgerEntry = Array.isArray(report?.providerLedger?.entries)
    ? report.providerLedger.entries.find((item) => item?.operation === "audio.generate") ?? report.providerLedger.entries[0]
    : undefined;
  return {
    modelId: stringOrUndefined(report?.checkedInputs?.modelId),
    language: stringOrUndefined(report?.checkedInputs?.language),
    voiceId: stringOrUndefined(report?.checkedInputs?.voiceId),
    outputFormat: stringOrUndefined(report?.checkedInputs?.outputFormat),
    intentId: stringOrUndefined(result?.intentId ?? batchReport?.intentId),
    providerAssetId: stringOrUndefined(result?.providerAssetId ?? ledgerEntry?.predictionId),
    predictionId: stringOrUndefined(ledgerEntry?.predictionId ?? result?.providerAssetId),
    outputUrlPreview: stringOrUndefined(result?.outputUrlPreview ?? batchReport?.outputUrlPreview)
  };
}

function safeBinding(binding) {
  return {
    modelId: binding.modelId,
    language: binding.language,
    voiceId: binding.voiceId,
    outputFormat: binding.outputFormat,
    intentId: binding.intentId,
    providerAssetId: binding.providerAssetId,
    predictionId: binding.predictionId
  };
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  const repoPath = toRepoRelative(path);
  if (!existsSync(absolutePath)) {
    return { exists: false, path: repoPath };
  }
  try {
    const value = JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
    return { exists: true, path: repoPath, value };
  } catch (error) {
    return { exists: true, path: repoPath, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function warn(name, message) {
  return { name, status: "warn", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toRepoRelative(value) {
  const resolved = resolve(repoRoot, value);
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedResolved = resolved.replace(/\\/g, "/");
  const normalizedResolvedLower = normalizedResolved.toLowerCase();
  if (normalizedResolvedLower === normalizedRoot) {
    return ".";
  }
  if (normalizedResolvedLower.startsWith(`${normalizedRoot}/`)) {
    return normalizedResolved.slice(normalizedRoot.length + 1);
  }
  return "[outside-repo]";
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
