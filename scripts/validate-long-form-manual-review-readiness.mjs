#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  longFormReportPath: "assets/output_deliverables/business-readiness/long-form-validation-report.json",
  manualQualityReviewPath: "ops/long-form-manual-quality-review.json",
  outputPath: "assets/output_deliverables/business-readiness/long-form-manual-quality-review-readiness-report.json"
};

const requiredQualityCheckNames = [
  "durationAndPacingAccepted",
  "shotContinuityAccepted",
  "visualArtifactsAccepted",
  "promptFidelityAccepted",
  "audioSyncAccepted",
  "noUnsafeContentObserved"
];

const sourcePatternOrigins = [
  "HKUDS/ViMax",
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo",
  "calesthio/OpenMontage",
  "jiaminchen-1031/DirectorBench",
  "Atlas Cloud Seedance 2.0 model page"
];

const unsafeTextPatterns = [
  /replace[-_\s]?with|placeholder|\btodo\b|\btbd\b/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /sk-[A-Za-z0-9_-]+/i,
  /(?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/i,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/i,
  /[A-Za-z]:\\[^\s"'<>]+/,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/,
  /https?:\/\/[^\s"'<>]+/i,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/i,
  /data:[^\s"'<>]+/i
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--long-form-report", "longFormReportPath"],
    ["--manual-quality-review", "manualQualityReviewPath"],
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
  console.log(`Validate long-form manual quality/redaction review readiness without network or provider calls.

Usage:
  npm.cmd run validation:long-form-review-readiness

Options:
  --long-form-report <path>       Existing long-form validation report.
                                  Default: ${defaults.longFormReportPath}
  --manual-quality-review <path>  Operator-filled manual quality/redaction review packet.
                                  Default: ${defaults.manualQualityReviewPath}
  --output <path>                 JSON report path. Default: ${defaults.outputPath}
  --no-output                     Print only; do not write the report.

This command never calls Atlas, never renders media, never performs review on behalf of an operator, and never converts a draft template into evidence.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const sourceRead = readJson(options.longFormReportPath);
  const sourceReportContext = longFormContextFor(sourceRead);
  const manualReviewRead = readJson(options.manualQualityReviewPath);
  const manualReviewContext = manualReviewContextFor(manualReviewRead, sourceReportContext);
  const checks = buildChecks(sourceReportContext, manualReviewContext);
  const status = statusFor(sourceReportContext, manualReviewContext);

  const report = {
    schemaVersion: "cinejelly.long-form-manual-quality-review-readiness.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    releaseEvidence: false,
    sourcePatternOrigins,
    checkedInputs: {
      longFormReportPath: toRepoRelative(options.longFormReportPath),
      manualQualityReviewPath: toRepoRelative(options.manualQualityReviewPath),
      outputPath: toRepoRelative(options.outputPath)
    },
    sourceReportContext,
    manualReviewContext,
    checks,
    releaseGateSummary: {
      canUseAsManualReviewReadinessEvidence: ["ready_for_manual_review", "accepted_manual_review"].includes(status),
      canUseManualReviewAsLongFormEvidence: status === "accepted_manual_review",
      canUseAsBusinessReadinessLongFormEvidence: false,
      canClaimDirectorBenchParity: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: releaseBlockerFor(status)
    },
    nextActions: nextActionsFor(options, status, sourceReportContext, manualReviewContext)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return ["ready_for_manual_review", "accepted_manual_review"].includes(status) ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--long-form-report", options.longFormReportPath],
    ["--manual-quality-review", options.manualQualityReviewPath],
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

function longFormContextFor(read) {
  const report = read.value;
  const artifactBinding = artifactBindingFromReport(report);
  const finalDurationSeconds = numberOrUndefined(report?.artifactEvidence?.finalDurationSeconds);
  const costLedgerEntryCount = Number(report?.paidRender?.costLedgerEntryCount ?? 0);
  const renderedShotCount = Number(report?.artifactEvidence?.renderedShotCount ?? 0);
  const compiledPromptCount = Number(report?.artifactEvidence?.compiledPromptCount ?? 0);
  const providerSpendAllowed = report?.spendGate?.providerSpendAllowed === true;
  const atlasBillingReady = report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true;
  const paidRenderCompleted = report?.paidRender?.status === "completed";
  const artifactValidationPassed = report?.paidRender?.artifactValidationStatus === "pass";
  const artifactEvidencePresent = report?.artifactEvidence?.present === true;
  const deliverablePresent = report?.artifactEvidence?.deliverablePresent === true;
  const readyForManualReview =
    read.exists === true &&
    report?.schemaVersion === "cinejelly.long-form-validation.v1" &&
    providerSpendAllowed &&
    atlasBillingReady &&
    paidRenderCompleted &&
    artifactValidationPassed &&
    artifactEvidencePresent &&
    deliverablePresent &&
    isLongFormDuration(finalDurationSeconds) &&
    costLedgerEntryCount > 0 &&
    renderedShotCount > 0 &&
    compiledPromptCount > 0 &&
    hasCompleteArtifactBinding(artifactBinding);
  return {
    reportPresent: read.exists === true,
    reportPath: read.path,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    providerSpendAllowed,
    atlasBillingReady,
    paidRenderCompleted,
    artifactValidationPassed,
    artifactEvidencePresent,
    deliverablePresent,
    finalDurationSeconds: finalDurationSeconds ?? 0,
    renderedShotCount: Number.isFinite(renderedShotCount) ? renderedShotCount : 0,
    compiledPromptCount: Number.isFinite(compiledPromptCount) ? compiledPromptCount : 0,
    costLedgerEntryCount: Number.isFinite(costLedgerEntryCount) ? costLedgerEntryCount : 0,
    artifactBindingComplete: hasCompleteArtifactBinding(artifactBinding),
    manualQualityReviewPassedInSourceReport: report?.manualQualityReview?.passed === true,
    manualReviewArtifactBindingStatusInSourceReport: typeof report?.manualQualityReview?.artifactBindingStatus === "string"
      ? report.manualQualityReview.artifactBindingStatus
      : "missing",
    canUseAsBusinessReadinessLongFormEvidenceInSourceReport:
      report?.releaseGateSummary?.canUseAsBusinessReadinessLongFormEvidence === true,
    readyForManualReview,
    artifactBinding
  };
}

function manualReviewContextFor(read, sourceContext) {
  const review = read.value;
  if (!read.exists) {
    return {
      present: false,
      path: read.path,
      passed: false,
      decision: "missing",
      redactionReviewPassed: false,
      requiredCheckCount: requiredQualityCheckNames.length,
      passedCheckCount: 0,
      artifactBindingMatchesReport: false,
      templateFieldsPresent: false,
      message: "Manual long-form quality/redaction review file is missing."
    };
  }
  if (read.error) {
    return {
      present: true,
      path: read.path,
      passed: false,
      decision: "invalid_json",
      redactionReviewPassed: false,
      requiredCheckCount: requiredQualityCheckNames.length,
      passedCheckCount: 0,
      artifactBindingMatchesReport: false,
      templateFieldsPresent: false,
      issues: ["invalid_json"],
      message: `Manual long-form quality/redaction review is invalid JSON: ${read.error}.`
    };
  }
  const checks = review?.qualityChecks && typeof review.qualityChecks === "object" && !Array.isArray(review.qualityChecks)
    ? review.qualityChecks
    : {};
  const passedCheckCount = requiredQualityCheckNames.filter((name) => checks[name] === true).length;
  const binding = compareManualReviewBinding(review, sourceContext);
  const hasTemplateFields = Object.keys(review ?? {}).some((key) => key.startsWith("_"));
  const issues = [];
  if (review?.schemaVersion !== "cinejelly.long-form-manual-quality-review.v1") {
    issues.push("schemaVersion");
  }
  if (review?.decision !== "pass") {
    issues.push("decision");
  }
  if (review?.redactionReviewPassed !== true) {
    issues.push("redactionReviewPassed");
  }
  if (passedCheckCount !== requiredQualityCheckNames.length) {
    issues.push("qualityChecks");
  }
  if (!binding.matches) {
    issues.push("artifactBinding");
  }
  if (hasTemplateFields) {
    issues.push("templateFields");
  }
  const unsafeTextFields = unsafeManualReviewTextFields(review);
  issues.push(...unsafeTextFields);
  return {
    present: true,
    path: read.path,
    schemaVersion: typeof review?.schemaVersion === "string" ? review.schemaVersion : "missing",
    decision: typeof review?.decision === "string" ? review.decision : "missing",
    redactionReviewPassed: review?.redactionReviewPassed === true,
    reviewedAt: typeof review?.reviewedAt === "string" ? review.reviewedAt : undefined,
    reviewerPresent: typeof review?.reviewer === "string" && review.reviewer.trim().length > 0,
    requiredCheckCount: requiredQualityCheckNames.length,
    passedCheckCount,
    artifactBindingMatchesReport: binding.matches,
    reviewedProjectId: stringOrUndefined(review?.reviewedProjectId),
    reviewedManifestSha256: stringOrUndefined(review?.reviewedManifestSha256),
    reviewedDeliverableSha256: stringOrUndefined(review?.reviewedDeliverableSha256),
    templateFieldsPresent: hasTemplateFields,
    unsafeTextFieldCount: unsafeTextFields.length,
    passed: issues.length === 0,
    issues,
    message: issues.length === 0
      ? "Structured manual long-form quality/redaction review is accepted and bound to paid artifact fingerprints."
      : `Structured manual long-form quality/redaction review is not accepted: ${issues.join(", ")}.`
  };
}

function buildChecks(sourceContext, manualContext) {
  return [
    sourceContext.readyForManualReview
      ? pass("long_form_paid_artifact_ready", "Long-form paid render, billing, artifact validation, duration, cost ledger, and artifact fingerprints are ready.")
      : fail("long_form_paid_artifact_ready", "Long-form paid artifact evidence is not ready for manual quality/redaction review."),
    manualContext.present
      ? pass("manual_review_file_present", "Manual long-form quality/redaction review file is present.")
      : warn("manual_review_file_present", "Manual long-form quality/redaction review file is not present yet."),
    manualContext.passed
      ? pass("manual_review_accepted", "Manual long-form quality/redaction review is accepted and artifact-bound.")
      : warn("manual_review_accepted", "Manual long-form quality/redaction review is not accepted yet.")
  ];
}

function statusFor(sourceContext, manualContext) {
  if (!sourceContext.readyForManualReview) {
    return "blocked_by_long_form_report";
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
    return "Manual long-form quality/redaction review is accepted, but the long-form validation report must still be refreshed with the review packet before business-readiness can count it.";
  }
  if (status === "ready_for_manual_review") {
    return "Paid long-form artifact evidence is ready; an operator must inspect the media, redaction posture, and quality before filling the manual review packet.";
  }
  if (status === "blocked_by_long_form_report") {
    return "Long-form paid render, artifact, billing, duration, cost-ledger, or artifact-fingerprint evidence is not ready.";
  }
  return "Long-form manual quality/redaction review evidence is present but not accepted.";
}

function nextActionsFor(options, status, sourceContext, manualContext) {
  const actions = [];
  if (!sourceContext.readyForManualReview) {
    actions.push("Run the paid long-form validation only after budget/billing/readiness gates are ready, then rerun this readiness command after paid artifact evidence exists.");
  }
  if (status === "ready_for_manual_review") {
    actions.push(`Inspect the paid 2-8 minute deliverable, fill ${toRepoRelative(options.manualQualityReviewPath)}, and keep reviewedProjectId/reviewedManifestSha256/reviewedDeliverableSha256 unchanged.`);
    actions.push(`Run npm.cmd run validation:long-form -- --request assets/output_deliverables/business-readiness/long-form-request.json --manual-quality-review ${toRepoRelative(options.manualQualityReviewPath)} --confirm-manual-quality-review --confirm-paid-spend with the same billing/budget options used for the paid run.`);
  }
  if (status === "blocked_by_manual_review") {
    actions.push(`Fix ${toRepoRelative(options.manualQualityReviewPath)}: ${manualContext.message}`);
  }
  if (status === "accepted_manual_review") {
    actions.push(`Refresh the long-form validation report with npm.cmd run validation:long-form -- --manual-quality-review ${toRepoRelative(options.manualQualityReviewPath)} --confirm-manual-quality-review and the same paid-run request/billing options.`);
  }
  actions.push("Do not claim long-form business readiness until the long-form validation report itself passes after manual quality/redaction review.");
  return [...new Set(actions)];
}

function artifactBindingFromReport(report) {
  return {
    projectId: stringOrUndefined(report?.artifactEvidence?.projectId),
    manifestSha256: safeSha256(report?.artifactEvidence?.manifestSha256)
      ? report.artifactEvidence.manifestSha256.trim().toLowerCase()
      : undefined,
    deliverableSha256: safeSha256(report?.artifactEvidence?.deliverableSha256)
      ? report.artifactEvidence.deliverableSha256.trim().toLowerCase()
      : undefined
  };
}

function hasCompleteArtifactBinding(binding) {
  return Boolean(binding?.projectId && binding?.manifestSha256 && binding?.deliverableSha256);
}

function compareManualReviewBinding(review, sourceContext) {
  const expected = sourceContext.artifactBinding;
  const matches =
    hasCompleteArtifactBinding(expected) &&
    review?.reviewedProjectId === expected.projectId &&
    review?.reviewedManifestSha256 === expected.manifestSha256 &&
    review?.reviewedDeliverableSha256 === expected.deliverableSha256;
  return { matches };
}

function unsafeManualReviewTextFields(review) {
  const issues = [];
  for (const key of ["reviewer", "notes"]) {
    const value = review?.[key];
    if (typeof value === "string" && unsafeTextPatterns.some((pattern) => pattern.test(value))) {
      issues.push(`unsafeText:${key}`);
    }
  }
  return issues;
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

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value.trim());
}

function isLongFormDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 120 && value <= 480;
}

function isInsideRepo(value) {
  return !toRepoRelative(value).startsWith("[outside-repo]");
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
