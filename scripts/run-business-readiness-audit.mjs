import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  releaseAuditPath: "assets/output_deliverables/phase6-validation/release-audit-report.json",
  paidReportPath: "assets/output_deliverables/phase6-validation/paid-render-report.json",
  manualReviewPath: "assets/output_deliverables/phase6-validation/manual-review-report.md",
  deploymentPreflightPath: "assets/output_deliverables/business-readiness/deployment-preflight-report.json",
  longFormReportPath: "assets/output_deliverables/business-readiness/long-form-validation-report.json",
  sourceVideoReportPath: "assets/output_deliverables/business-readiness/source-video-validation-report.json",
  remoteStockReportPath: "assets/output_deliverables/business-readiness/remote-stock-validation-report.json",
  generatedAudioReportPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  billingAdminReportPath: "assets/output_deliverables/business-readiness/billing-admin-ops-report.json",
  operationsReportPath: "assets/output_deliverables/business-readiness/production-operations-report.json",
  outputPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json"
};

const checks = [
  {
    name: "release_audit_and_source_hygiene",
    weight: 14,
    pathOption: "releaseAuditPath",
    evaluator: evaluateReleaseAudit,
    missing:
      "Missing clean release-audit evidence. Run npm.cmd run validation:local-smoke and npm.cmd run validation:release-audit first."
  },
  {
    name: "short_paid_render_and_artifacts",
    weight: 14,
    pathOption: "paidReportPath",
    evaluator: evaluatePaidRender,
    missing:
      "Missing short paid-render evidence. Reuse existing evidence or run a new approved paid validation render only after explicit spend approval."
  },
  {
    name: "manual_short_media_redaction_review",
    weight: 10,
    pathOption: "manualReviewPath",
    evaluator: evaluateManualReview,
    missing:
      "Missing manual media/artifact/redaction review for the paid validation run."
  },
  {
    name: "deployment_preflight_archive",
    weight: 10,
    pathOption: "deploymentPreflightPath",
    evaluator: evaluateDeploymentPreflight,
    missing:
      "Missing deployment-environment preflight/readiness evidence. Run npm.cmd run validation:deployment-readiness against the real HTTPS host."
  },
  {
    name: "long_form_paid_validation",
    weight: 16,
    pathOption: "longFormReportPath",
    evaluator: evaluateLongForm,
    missing:
      "Missing real 2-8 minute long-form paid validation evidence with artifact validation and manual quality review."
  },
  {
    name: "source_video_auto_analysis_validation",
    weight: 10,
    pathOption: "sourceVideoReportPath",
    evaluator: evaluateRequiredPassReport,
    missing:
      "Missing live source-video auto-analysis evidence using real clean HTTPS source video, FFmpeg frame extraction, and the configured multimodal LLM."
  },
  {
    name: "remote_stock_provider_validation",
    weight: 8,
    pathOption: "remoteStockReportPath",
    evaluator: evaluateRequiredPassReport,
    missing:
      "Missing live remote stock provider evidence for configured Pexels/Pixabay/Coverr credentials, credential-free URLs, attribution, and commercial-rights approval."
  },
  {
    name: "atlas_generated_audio_validation",
    weight: 8,
    pathOption: "generatedAudioReportPath",
    evaluator: evaluateRequiredPassReport,
    missing:
      "Missing live Atlas generated-audio evidence for verified schemas, model IDs, pricing, output formats, artifact validation, and manual audio review."
  },
  {
    name: "billing_admin_quota_controls",
    weight: 7,
    pathOption: "billingAdminReportPath",
    evaluator: evaluateBillingAdminOps,
    missing:
      "Missing business operations evidence. Run npm.cmd run validation:billing-admin-ops with deployment URL, client policy, usage ledger, and non-secret billing/admin attestation."
  },
  {
    name: "production_storage_observability_support",
    weight: 3,
    pathOption: "operationsReportPath",
    evaluator: evaluateRequiredPassReport,
    missing:
      "Missing production operations evidence for durable storage, backups, monitoring, incident handling, log redaction, and support workflow."
  }
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };

  const flagMap = new Map([
    ["--release-audit", "releaseAuditPath"],
    ["--paid-report", "paidReportPath"],
    ["--manual-review", "manualReviewPath"],
    ["--deployment-preflight-report", "deploymentPreflightPath"],
    ["--long-form-report", "longFormReportPath"],
    ["--source-video-report", "sourceVideoReportPath"],
    ["--remote-stock-report", "remoteStockReportPath"],
    ["--generated-audio-report", "generatedAudioReportPath"],
    ["--billing-admin-report", "billingAdminReportPath"],
    ["--operations-report", "operationsReportPath"],
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
  console.log(`Run CineJelly's no-spend business-readiness audit.

Usage:
  npm.cmd run validation:business-readiness
  npm.cmd run validation:business-readiness -- --long-form-report <path>

Options:
  --release-audit <path>                Release-audit report. Default: ${defaults.releaseAuditPath}
  --paid-report <path>                  Paid-render report. Default: ${defaults.paidReportPath}
  --manual-review <path>                Manual review report. Default: ${defaults.manualReviewPath}
  --deployment-preflight-report <path>  Real deployment preflight/readiness report. Default: ${defaults.deploymentPreflightPath}
  --long-form-report <path>             Real 2-8 minute validation report. Default: ${defaults.longFormReportPath}
  --source-video-report <path>          Live source-video auto-analysis report. Default: ${defaults.sourceVideoReportPath}
  --remote-stock-report <path>          Live remote stock provider report. Default: ${defaults.remoteStockReportPath}
  --generated-audio-report <path>       Live generated-audio provider report. Default: ${defaults.generatedAudioReportPath}
  --billing-admin-report <path>         Billing/admin/quota operations report. Default: ${defaults.billingAdminReportPath}
  --operations-report <path>            Storage/observability/support report. Default: ${defaults.operationsReportPath}
  --output <path>                       Output report. Default: ${defaults.outputPath}
  --no-output                           Print only; do not write the report.

This command does not call Atlas, initialize providers, create media, or spend credits.`);
}

function evaluateReleaseAudit(path) {
  const report = readJson(path);
  if (report.schemaVersion !== "cinejelly.phase6.release-audit.v1") {
    return fail("Release-audit schemaVersion is not recognized.");
  }
  if (report.status === "release_ready") {
    return pass("Release audit is release_ready.");
  }
  if (report.status === "review_warnings") {
    return warn("Release audit has warnings that must be reviewed before commercial approval.");
  }
  return fail(`Release audit status is ${report.status ?? "missing"}.`);
}

function evaluatePaidRender(path) {
  const report = readJson(path);
  if (report.schemaVersion !== "cinejelly.phase6.paid-render-validation.v1") {
    return fail("Paid-render report schemaVersion is not recognized.");
  }
  const artifactStatus = report.artifactValidation?.status;
  if (report.status === "completed" && artifactStatus === "pass") {
    return pass("Short paid Atlas render completed and artifact validation passed.");
  }
  if (report.status === "completed_with_artifact_validation_warning" || artifactStatus === "warn") {
    return warn("Short paid Atlas render completed with artifact warnings that require review.");
  }
  return fail(`Paid-render status is ${report.status ?? "missing"}; artifact status is ${artifactStatus ?? "missing"}.`);
}

function evaluateManualReview(path) {
  const text = readText(path);
  const normalized = text.toLowerCase();
  const hasDecision = normalized.includes("manual review passes") || normalized.includes("decision") && normalized.includes("pass");
  const hasRedaction = normalized.includes("redaction");
  const declaresLimitation =
    normalized.includes("does not approve full commercial traffic") ||
    normalized.includes("remaining business-readiness validation");
  if (hasDecision && hasRedaction && declaresLimitation) {
    return pass("Manual short-validation media/artifact/redaction review is archived and explicitly scoped.");
  }
  if (hasDecision && hasRedaction) {
    return warn("Manual review is archived but does not clearly scope remaining business-readiness blockers.");
  }
  return fail("Manual review does not contain a clear pass decision and redaction review.");
}

function evaluateDeploymentPreflight(path) {
  const report = readJson(path);
  if (report.schemaVersion === "cinejelly.deployment-readiness-capture.v1") {
    if (report.environmentKind !== "deployment") {
      return fail("Deployment readiness capture was not run against a real deployment environment.");
    }
    if (report.status === "pass" && report.releaseGateSummary?.canUseAsBusinessReadinessDeploymentEvidence === true) {
      return pass("Deployment readiness capture passed on the real HTTPS host.");
    }
    if (report.status === "warn") {
      return warn("Deployment readiness capture has warnings requiring operator acceptance.");
    }
    return fail(`Deployment readiness capture status is ${report.status ?? "missing"}.`);
  }
  if (report.schemaVersion === "cinejelly.phase6.validation-readiness.v1") {
    if (report.decision === "ready_for_paid_validation") {
      return pass("Deployment validation-readiness evidence has no hard blockers or warnings.");
    }
    if (report.decision === "review_warnings") {
      return warn("Deployment validation-readiness evidence has warnings requiring operator acceptance.");
    }
    return fail(`Deployment validation-readiness decision is ${report.decision ?? "missing"}.`);
  }
  if (report.status === "pass") {
    return pass("Deployment preflight evidence status is pass.");
  }
  if (report.status === "warn" || report.status === "review_warnings") {
    return warn("Deployment preflight evidence has warnings requiring operator acceptance.");
  }
  return fail(`Deployment evidence status is ${report.status ?? report.decision ?? "missing"}.`);
}

function evaluateLongForm(path) {
  const report = readJson(path);
  const status = inferReportStatus(report);
  const artifactStatus = report.artifactValidation?.status ?? report.artifacts?.status;
  const durationSeconds = firstNumber([
    report.durationSeconds,
    report.finalDurationSeconds,
    report.media?.durationSeconds,
    report.finalVideo?.durationSeconds,
    report.deliverable?.durationSeconds
  ]);

  if (status === "fail") {
    return fail(`Long-form validation status is ${report.status ?? report.decision ?? "missing"}.`);
  }
  if (durationSeconds === undefined) {
    return fail("Long-form validation evidence must include a final durationSeconds value.");
  }
  if (durationSeconds < 120 || durationSeconds > 480) {
    return fail(`Long-form duration ${durationSeconds}s is outside the 2-8 minute target range.`);
  }
  if (artifactStatus !== undefined && artifactStatus !== "pass" && artifactStatus !== "warn") {
    return fail(`Long-form artifact validation status is ${artifactStatus}.`);
  }
  if (status === "warn" || artifactStatus === "warn") {
    return warn(`Long-form validation reached ${durationSeconds}s with warnings requiring manual review.`);
  }
  return pass(`Long-form validation evidence covers ${durationSeconds}s and passed required checks.`);
}

function evaluateBillingAdminOps(path) {
  const report = readJson(path);
  if (report.schemaVersion !== "cinejelly.billing-admin-ops.v1") {
    return fail("Billing/admin operations report schemaVersion is not recognized.");
  }
  if (report.status === "pass" && report.releaseGateSummary?.canUseAsBusinessReadinessBillingEvidence === true) {
    return pass("Billing/admin/quota operations evidence passed.");
  }
  if (report.status === "warn") {
    return warn("Billing/admin/quota operations evidence has warnings requiring operator acceptance.");
  }
  const firstFailure = Array.isArray(report.checks)
    ? report.checks.find((check) => check?.status === "fail" && typeof check?.message === "string")?.message
    : undefined;
  return fail(
    firstFailure
      ? `Billing/admin/quota operations evidence is incomplete: ${firstFailure}`
      : `Billing/admin/quota operations evidence status is ${report.status ?? "missing"}.`
  );
}

function evaluateRequiredPassReport(path) {
  const report = readJson(path);
  const status = inferReportStatus(report);
  if (status === "pass") {
    return pass("Evidence report status is pass/approved/completed.");
  }
  if (status === "warn") {
    return warn("Evidence report has warnings requiring operator acceptance.");
  }
  return fail(`Evidence report status is ${report.status ?? report.decision ?? "missing"}.`);
}

function inferReportStatus(report) {
  const raw = String(report.status ?? report.decision ?? report.result ?? report.validationStatus ?? "").toLowerCase();
  if (["pass", "passed", "approved", "completed", "release_ready", "ready", "ready_for_customer_traffic"].includes(raw)) {
    return "pass";
  }
  if (raw.includes("warning") || raw === "warn" || raw === "review_warnings") {
    return "warn";
  }
  return "fail";
}

function firstNumber(values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function buildCheck(spec, options) {
  const relativePath = options[spec.pathOption];
  if (!existsSync(resolve(repoRoot, relativePath))) {
    return {
      name: spec.name,
      status: "fail",
      weight: spec.weight,
      evidencePath: relativePath,
      message: spec.missing
    };
  }
  try {
    const result = spec.evaluator(relativePath);
    return {
      name: spec.name,
      status: result.status,
      weight: spec.weight,
      evidencePath: relativePath,
      message: result.message
    };
  } catch (error) {
    return {
      name: spec.name,
      status: "fail",
      weight: spec.weight,
      evidencePath: relativePath,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function readJson(path) {
  const text = readText(path);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Evidence file at ${path} is not valid JSON.`);
  }
}

function readText(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function pass(message) {
  return { status: "pass", message };
}

function warn(message) {
  return { status: "warn", message };
}

function fail(message) {
  return { status: "fail", message };
}

function statusForChecks(results) {
  if (results.some((check) => check.status === "fail")) {
    return "blocked";
  }
  if (results.some((check) => check.status === "warn")) {
    return "review_warnings";
  }
  return "ready_for_limited_customer_traffic";
}

function completionFor(results) {
  const totalWeight = results.reduce((sum, check) => sum + check.weight, 0);
  const completedWeight = results.reduce((sum, check) => {
    if (check.status === "pass") {
      return sum + check.weight;
    }
    if (check.status === "warn") {
      return sum + check.weight / 2;
    }
    return sum;
  }, 0);
  return {
    completedWeight,
    totalWeight,
    evidenceCompletionPercent: Math.round((completedWeight / totalWeight) * 100)
  };
}

function nextActionsFor(results) {
  const actions = [];
  for (const check of results) {
    if (check.status === "fail") {
      actions.push(check.message);
    }
  }
  if (results.some((check) => check.status === "warn")) {
    actions.push("Review and explicitly accept or resolve every warning before commercial approval.");
  }
  if (actions.length === 0) {
    return [
      "Archive this report with release evidence.",
      "Run a limited customer canary with billing, quota, support, rollback, and incident monitoring active."
    ];
  }
  actions.push("Do not open paid customer traffic until this report is ready_for_limited_customer_traffic.");
  return [...new Set(actions)];
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }

  const results = checks.map((spec) => buildCheck(spec, options));
  const status = statusForChecks(results);
  const completion = completionFor(results);
  const releaseAuditPassed = results.find((check) => check.name === "release_audit_and_source_hygiene")?.status === "pass";
  const shortValidationPassed =
    results.find((check) => check.name === "short_paid_render_and_artifacts")?.status === "pass" &&
    results.find((check) => check.name === "manual_short_media_redaction_review")?.status === "pass";

  const report = {
    schemaVersion: "cinejelly.business-readiness-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    scope: "full_commercial_platform",
    sourcePatternOrigins: [
      "vericontext/vibeframe",
      "harry0703/MoneyPrinterTurbo",
      "calesthio/OpenMontage"
    ],
    checkedInputs: {
      releaseAuditPath: options.releaseAuditPath,
      paidReportPath: options.paidReportPath,
      manualReviewPath: options.manualReviewPath,
      deploymentPreflightPath: options.deploymentPreflightPath,
      longFormReportPath: options.longFormReportPath,
      sourceVideoReportPath: options.sourceVideoReportPath,
      remoteStockReportPath: options.remoteStockReportPath,
      generatedAudioReportPath: options.generatedAudioReportPath,
      billingAdminReportPath: options.billingAdminReportPath,
      operationsReportPath: options.operationsReportPath
    },
    completion,
    checks: results,
    releaseGateSummary: {
      canRunAdditionalPaidValidation: releaseAuditPassed && shortValidationPassed,
      canRunLongFormValidation: releaseAuditPassed && shortValidationPassed,
      canReleaseToCustomerTraffic: status === "ready_for_limited_customer_traffic",
      releaseBlocker:
        status === "ready_for_limited_customer_traffic"
          ? undefined
          : "Full commercial-platform release still lacks one or more real evidence gates."
    },
    nextActions: nextActionsFor(results)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "ready_for_limited_customer_traffic" ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.business-readiness-audit.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
