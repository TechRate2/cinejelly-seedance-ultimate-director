#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke-report.json";
const defaultWorkDir = "assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke";
const unsafeQueryKey = ["to", "ken"].join("");
const unsafeValue = ["red", "acted"].join("");
const unsafeNeedle = `https://review.cinejelly.invalid/product.png?${unsafeQueryKey}=${unsafeValue}`;

function parseArgs(args) {
  const options = {
    outputPath: defaultOutput,
    workDir: defaultWorkDir,
    writeReport: true
  };
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
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--work-dir") {
      options.workDir = readRequiredValue(args, index, arg);
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

function printHelp() {
  console.log(`Run the Short product/rights evidence guard smoke without network, provider, render, or billing calls.

Usage:
  npm.cmd run validation:short-product-rights-guard

Options:
  --output <path>     JSON report path. Default: ${defaultOutput}
  --work-dir <path>   Repo-relative working directory. Default: ${defaultWorkDir}
  --no-output         Print only; do not write the report.`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
assertRepoRelativeJsonPath(options.outputPath, "--output");
assertGuardWorkDirPath(options.workDir, "--work-dir");

const workDir = resolve(repoRoot, options.workDir);
const safeEvidencePath = resolve(workDir, "safe-short-product-rights-evidence.json");
const unsafeEvidencePath = resolve(workDir, "unsafe-short-product-rights-evidence.json");
const safeReportPath = resolve(workDir, "safe-short-product-rights-validation-report.json");
const unsafeReportPath = resolve(workDir, "unsafe-short-product-rights-validation-report.json");

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const safeEvidence = buildEvidence();
const unsafeEvidence = {
  ...safeEvidence,
  productFacts: {
    ...safeEvidence.productFacts,
    notes: `Unsafe product-facts note includes ${unsafeNeedle}`
  }
};
writeJson(safeEvidencePath, safeEvidence);
writeJson(unsafeEvidencePath, unsafeEvidence);

const safeRun = runValidator(safeEvidencePath, safeReportPath);
const unsafeRun = runValidator(unsafeEvidencePath, unsafeReportPath, { allowFailStatusExitZero: true });
const safeReport = readJson(safeReportPath);
const unsafeReport = readJson(unsafeReportPath);
const publicPayload = JSON.stringify({
  safeRun,
  unsafeRun,
  safeReport: publicReadiness(safeReport),
  unsafeReport: publicReadiness(unsafeReport)
});
const checks = [
  check("safe_product_rights_passes", safeRun.exitCode === 0 && safeReport.status === "pass"),
  check("unsafe_product_rights_rejected", unsafeRun.exitCode === 0 && unsafeReport.status === "fail"),
  check("unsafe_product_rights_never_unlocks_evidence", unsafeReport.summary?.canUseAsAcceptedShortProductRightsEvidence === false),
  check("unsafe_product_rights_blocks_provider_submission", unsafeReport.summary?.canSubmitToProviderNow === false),
  check("guard_reports_do_not_echo_unsafe_url_or_token", !publicPayload.includes(unsafeNeedle) && !publicPayload.includes(unsafeValue))
];
const report = {
  schemaVersion: "cinejelly.short-product-rights-evidence-guard-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: ["video-db/Director", "calesthio/OpenMontage", "vericontext/vibeframe"],
  checkedInputs: {
    workDir: toRepoRelative(workDir),
    safeEvidencePath: toRepoRelative(safeEvidencePath),
    unsafeEvidencePath: toRepoRelative(unsafeEvidencePath),
    safeReportPath: toRepoRelative(safeReportPath),
    unsafeReportPath: toRepoRelative(unsafeReportPath),
    outputPath: toRepoRelative(options.outputPath)
  },
  summary: {
    safeExitCode: safeRun.exitCode,
    safeStatus: safeReport.status,
    unsafeExitCode: unsafeRun.exitCode,
    unsafeStatus: unsafeReport.status,
    safeCanUseAsAcceptedShortProductRightsEvidence: safeReport.summary?.canUseAsAcceptedShortProductRightsEvidence === true,
    unsafeCanUseAsAcceptedShortProductRightsEvidence: unsafeReport.summary?.canUseAsAcceptedShortProductRightsEvidence === true,
    unsafeCanSubmitToProviderNow: unsafeReport.summary?.canSubmitToProviderNow === true
  },
  safeReadiness: publicReadiness(safeReport),
  unsafeReadiness: publicReadiness(unsafeReport),
  checks,
  releaseGateSummary: {
    shortProductRightsEvidenceGuardPass: checks.every((item) => item.status === "pass"),
    canUseAsAcceptedShortProductRightsEvidence: false,
    canSubmitToProviderNow: false,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Guard smoke proves Short product/rights evidence schema/redaction enforcement only; real product facts review, media-rights approval, paid render, artifact validation, and business-readiness approval remain separate gates."
  },
  nextActions: [
    "Use validation:short-product-rights with --confirm-accepted-product-rights when an operator supplies accepted product-facts and media-rights evidence.",
    "Keep this guard in report-contract validation so unsafe accepted-looking product or rights notes cannot unlock backend readiness evidence."
  ]
};

if (options.writeReport) {
  writeJson(resolve(repoRoot, options.outputPath), report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function runValidator(evidencePath, outputPath, options = {}) {
  const args = [
    "scripts/validate-short-product-rights-evidence.mjs",
    "--evidence",
    toRepoRelative(evidencePath),
    "--output",
    toRepoRelative(outputPath),
    "--confirm-accepted-product-rights"
  ];
  if (options.allowFailStatusExitZero) {
    args.push("--allow-fail-status-exit-zero");
  }
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CINEJELLY_INTERNAL_GUARD_SMOKE: "true"
    },
    maxBuffer: 1024 * 1024 * 4
  });
  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? undefined
  };
}

function buildEvidence() {
  const sessionId = "short_session_b1b2c3d4e5f67890";
  const reviewedAt = new Date(Date.now() - 60 * 1000).toISOString();
  return {
    schemaVersion: "cinejelly.short-product-rights-evidence.v1",
    environmentKind: "deployment",
    deploymentBaseUrl: "https://review.cinejelly.app",
    sessionId,
    reviewer: {
      reviewerId: "product_reviewer_2026_06",
      reviewerRole: "product",
      reviewedAt,
      redactionReviewed: true
    },
    productFacts: {
      productUrlSha256: sha256("safe product URL"),
      productHostSha256: sha256("safe product host"),
      productPathSha256: sha256("safe product path"),
      liveExtractionReportSha256: sha256("safe live extraction report"),
      productTitleAccepted: true,
      productCategoryAccepted: true,
      productBenefitsAccepted: true,
      productCtaAccepted: true,
      claimSubstantiationAccepted: true,
      productSnapshotMatchesPlan: true,
      missingRequiredFactCount: 0,
      unsupportedClaimCount: 0,
      rawProductUrlStored: false,
      rawMediaUrlsStored: false,
      secretsStored: false,
      notes: "Accepted product facts evidence for guard smoke."
    },
    mediaRights: {
      productMediaApprovedForUse: true,
      commercialUseApproved: true,
      usageScopeReviewed: true,
      ownershipDecision: "brand_owned",
      modelReleaseStatus: "not_required",
      trademarkUsageApproved: true,
      restrictedThirdPartyMarksAbsent: true,
      attributionStatus: "not_required",
      attributionSummarySha256: sha256("no attribution required"),
      rightsReviewerRole: "legal",
      rightsReviewedAt: reviewedAt,
      redactionReviewed: true,
      notes: "Accepted media rights evidence for guard smoke."
    },
    operationBoundary: {
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      canQueueProviderSpendFromEvidence: false,
      renderJobQueued: false,
      spendReservationCreated: false,
      canReleaseToCustomerTraffic: false
    },
    evidenceBinding: {
      productFactsReviewSha256: sha256("safe product facts review packet"),
      mediaRightsReviewSha256: sha256("safe media rights review packet"),
      productUrlExtractionReportSha256: sha256("safe product URL extraction report"),
      sessionUiContractSha256: sha256("safe session UI contract"),
      storedSessionPlanSha256: sha256("safe stored session plan"),
      clientScoped: true,
      serverSidePlanUsed: true,
      redactionReviewed: true,
      shortReviewOperationEvidenceIncluded: false,
      paidRenderEvidenceIncluded: false
    }
  };
}

function publicReadiness(report) {
  return {
    status: report?.status,
    summary: report?.summary,
    evidence: report?.evidence,
    failedCheckCount: Array.isArray(report?.checks)
      ? report.checks.filter((item) => item.status === "fail").length
      : 0,
    releaseGateSummary: report?.releaseGateSummary
  };
}

function check(name, passed) {
  return {
    name,
    status: passed ? "pass" : "fail",
    message: passed ? "Check passed." : "Check failed."
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function assertRepoRelativeJsonPath(path, flag) {
  if (extname(path).toLowerCase() !== ".json") {
    throw new Error(`${flag} must point to a JSON file.`);
  }
  assertRepoRelativePath(path, flag);
}

function assertGuardWorkDirPath(path, flag) {
  assertRepoRelativePath(path, flag);
  const allowedRoot = resolve(repoRoot, defaultWorkDir);
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(allowedRoot, absolutePath);
  if (relativePath && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
    throw new Error(`${flag} must stay inside ${defaultWorkDir} so smoke cleanup cannot remove unrelated files.`);
  }
}

function assertRepoRelativePath(path, flag) {
  if (isAbsolute(path)) {
    throw new Error(`${flag} must be repo-relative.`);
  }
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${flag} must stay inside the repository workspace.`);
  }
}

function toRepoRelative(value) {
  const absolutePath = resolve(repoRoot, value);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "[outside-repo]";
  }
  return relativePath.replace(/\\/g, "/");
}
