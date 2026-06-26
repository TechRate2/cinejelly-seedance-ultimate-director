#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/short-product-rights-evidence.json",
  outputPath: "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json"
};

const allowedReviewerRoles = new Set(["operator", "producer", "product", "legal", "qa", "hybrid"]);
const allowedOwnershipDecisions = new Set([
  "brand_owned",
  "licensed",
  "merchant_authorized",
  "public_listing_with_operator_approval"
]);
const allowedModelReleaseStatuses = new Set(["not_required", "accepted"]);
const allowedAttributionStatuses = new Set(["not_required", "required_and_recorded"]);
const topLevelKeys = new Set([
  "schemaVersion",
  "environmentKind",
  "deploymentBaseUrl",
  "sessionId",
  "reviewer",
  "productFacts",
  "mediaRights",
  "operationBoundary",
  "evidenceBinding"
]);
const reviewerKeys = new Set(["reviewerId", "reviewerRole", "reviewedAt", "redactionReviewed"]);
const productFactsKeys = new Set([
  "productUrlSha256",
  "productHostSha256",
  "productPathSha256",
  "liveExtractionReportSha256",
  "productTitleAccepted",
  "productCategoryAccepted",
  "productBenefitsAccepted",
  "productCtaAccepted",
  "claimSubstantiationAccepted",
  "productSnapshotMatchesPlan",
  "missingRequiredFactCount",
  "unsupportedClaimCount",
  "rawProductUrlStored",
  "rawMediaUrlsStored",
  "secretsStored",
  "notes"
]);
const mediaRightsKeys = new Set([
  "productMediaApprovedForUse",
  "commercialUseApproved",
  "usageScopeReviewed",
  "ownershipDecision",
  "modelReleaseStatus",
  "trademarkUsageApproved",
  "restrictedThirdPartyMarksAbsent",
  "attributionStatus",
  "attributionSummarySha256",
  "rightsReviewerRole",
  "rightsReviewedAt",
  "redactionReviewed",
  "notes"
]);
const operationBoundaryKeys = new Set([
  "noSpend",
  "networkCallsMade",
  "providerCallsMade",
  "canQueueProviderSpendFromEvidence",
  "renderJobQueued",
  "spendReservationCreated",
  "canReleaseToCustomerTraffic"
]);
const bindingKeys = new Set([
  "productFactsReviewSha256",
  "mediaRightsReviewSha256",
  "productUrlExtractionReportSha256",
  "sessionUiContractSha256",
  "storedSessionPlanSha256",
  "clientScoped",
  "serverSidePlanUsed",
  "redactionReviewed",
  "shortReviewOperationEvidenceIncluded",
  "paidRenderEvidenceIncluded"
]);

const unsafePatterns = [
  /replace[-_\s]?with/i,
  /placeholder/i,
  /\btodo\b/i,
  /\btbd\b/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /sk-[A-Za-z0-9_-]+/,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/i,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/i,
  /[A-Za-z]:\\[^\s"'<>]+/,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/,
  /https?:\/\/[^\s"'<>]+/i,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/i,
  /data:[^\s"'<>]+/i
];

function parseArgs(args) {
  const options = {
    evidencePath: defaults.evidencePath,
    outputPath: defaults.outputPath,
    confirmAcceptedProductRights: false,
    allowFailStatusExitZero: false,
    writeReport: true
  };
  const flagMap = new Map([
    ["--evidence", "evidencePath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-accepted-product-rights") {
      options.confirmAcceptedProductRights = true;
      continue;
    }
    if (arg === "--allow-fail-status-exit-zero") {
      options.allowFailStatusExitZero = true;
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
  console.log(`Validate accepted Short product-facts and media-rights evidence without network, provider, render, or billing calls.

Usage:
  npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights

Options:
  --evidence <path>                       Operator-owned product/rights evidence JSON. Default: ${defaults.evidencePath}
  --confirm-accepted-product-rights       Required before a valid packet can pass.
  --output <path>                         JSON report path. Default: ${defaults.outputPath}
  --no-output                             Print only; do not write the report.

This validator reads local JSON evidence only. It does not crawl product URLs, submit render jobs, call Atlas, reserve spend, or approve customer traffic.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const evidenceRead = readJson(options.evidencePath);
  const evidenceChecks = evidenceRead.value ? evidenceChecksFor(evidenceRead.value) : [];
  const confirmationCheck = options.confirmAcceptedProductRights
    ? pass("accepted_product_rights_confirmed", "Operator confirmed this packet represents accepted Short product-facts and media-rights evidence.")
    : fail("accepted_product_rights_confirmed", "--confirm-accepted-product-rights is required before the packet can pass.");
  const checks = [
    evidenceRead.exists
      ? pass("short_product_rights_evidence_file_present", "Short product/rights evidence file is present.")
      : fail("short_product_rights_evidence_file_present", `Missing Short product/rights evidence at ${toRepoRelative(options.evidencePath)}.`),
    ...(evidenceRead.error ? [fail("short_product_rights_evidence_json", `Evidence JSON is invalid: ${redactText(evidenceRead.error)}.`)] : []),
    ...evidenceChecks,
    confirmationCheck
  ];
  const status = statusFor({ evidenceRead, checks, confirmAcceptedProductRights: options.confirmAcceptedProductRights });
  const canUse = status === "pass";
  const summary = summaryFor(evidenceRead.value, canUse);
  const report = {
    schemaVersion: "cinejelly.short-product-rights-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      evidenceConfigured: evidenceRead.exists,
      confirmAcceptedProductRights: options.confirmAcceptedProductRights
    },
    summary,
    evidence: publicEvidenceSummary(evidenceRead.value),
    checks,
    releaseGateSummary: {
      acceptedShortProductRightsEvidencePass: canUse,
      canUseAsAcceptedShortProductRightsEvidence: canUse,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: canUse
        ? "Accepted product-facts and media-rights evidence is schema/redaction safe for Short backend readiness only; accepted scene/audio/caption/claim review, paid render evidence, artifact validation, manual media review, and business-readiness approval remain separate gates."
        : "Short product-facts and media-rights evidence is missing, unconfirmed, unsafe, or not fully accepted."
    },
    nextActions: nextActionsFor({ status, options })
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" || options.allowFailStatusExitZero ? 0 : 1;
}

function validateOptions(options) {
  assertRepoRelativeJsonPath(options.evidencePath, "--evidence");
  assertRepoRelativeJsonPath(options.outputPath, "--output");
  if (options.allowFailStatusExitZero && process.env.CINEJELLY_INTERNAL_GUARD_SMOKE !== "true") {
    throw new Error("--allow-fail-status-exit-zero is reserved for the internal guard smoke runner.");
  }
}

function assertRepoRelativeJsonPath(path, flag) {
  if (extname(path).toLowerCase() !== ".json") {
    throw new Error(`${flag} must point to a JSON file.`);
  }
  if (isAbsolute(path)) {
    throw new Error(`${flag} must be repo-relative so validation cannot read or write outside the workspace.`);
  }
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${flag} must stay inside the repository workspace.`);
  }
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false, value: undefined, error: undefined };
  }
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")),
      error: undefined
    };
  } catch (error) {
    return { exists: true, value: undefined, error: error instanceof Error ? error.message : String(error) };
  }
}

function evidenceChecksFor(value) {
  const checks = [];
  if (!isRecord(value)) {
    return [fail("short_product_rights_shape", "Evidence must be a JSON object.")];
  }
  checks.push(allowedKeys(value, topLevelKeys, "short_product_rights_top_level_keys"));
  checks.push(value.schemaVersion === "cinejelly.short-product-rights-evidence.v1"
    ? pass("short_product_rights_schema_version", "Evidence schema version is supported.")
    : fail("short_product_rights_schema_version", "Evidence schemaVersion must be cinejelly.short-product-rights-evidence.v1."));
  checks.push(value.environmentKind === "deployment"
    ? pass("short_product_rights_environment", "Evidence is declared as deployment operation evidence.")
    : fail("short_product_rights_environment", "Evidence environmentKind must be deployment."));
  checks.push(validDeploymentUrl(value.deploymentBaseUrl)
    ? pass("short_product_rights_deployment_url", "Deployment URL is HTTPS, query-free, and hashed in public reports.")
    : fail("short_product_rights_deployment_url", "deploymentBaseUrl must be a clean HTTPS URL without query, hash, localhost, placeholder, or credential-like host data."));
  checks.push(safeSessionId(value.sessionId)
    ? pass("short_product_rights_session_id", "Session id uses the short-pipeline session format.")
    : fail("short_product_rights_session_id", "sessionId must match short_session_[a-f0-9]{16}."));
  checks.push(...reviewerChecks(value.reviewer));
  checks.push(...productFactChecks(value.productFacts));
  checks.push(...mediaRightsChecks(value.mediaRights));
  checks.push(...operationBoundaryChecks(value.operationBoundary));
  checks.push(...bindingChecks(value.evidenceBinding));
  return checks;
}

function reviewerChecks(reviewer) {
  if (!isRecord(reviewer)) {
    return [fail("short_product_rights_reviewer", "reviewer must be an object.")];
  }
  return [
    allowedKeys(reviewer, reviewerKeys, "short_product_rights_reviewer_keys"),
    safeIdentifier(reviewer.reviewerId)
      ? pass("short_product_rights_reviewer_id", "Reviewer id is safe.")
      : fail("short_product_rights_reviewer_id", "reviewer.reviewerId must be a safe non-placeholder identifier."),
    allowedReviewerRoles.has(reviewer.reviewerRole)
      ? pass("short_product_rights_reviewer_role", "Reviewer role is recognized.")
      : fail("short_product_rights_reviewer_role", "reviewer.reviewerRole must be operator, producer, product, legal, qa, or hybrid."),
    validPastDateTime(reviewer.reviewedAt)
      ? pass("short_product_rights_reviewed_at", "reviewer.reviewedAt is a valid non-future ISO timestamp.")
      : fail("short_product_rights_reviewed_at", "reviewer.reviewedAt must be a valid ISO date-time and not in the future."),
    reviewer.redactionReviewed === true
      ? pass("short_product_rights_reviewer_redaction", "Reviewer explicitly completed redaction review.")
      : fail("short_product_rights_reviewer_redaction", "reviewer.redactionReviewed must be true.")
  ];
}

function productFactChecks(productFacts) {
  if (!isRecord(productFacts)) {
    return [fail("short_product_rights_product_facts", "productFacts must be an object.")];
  }
  const factBooleans = [
    "productTitleAccepted",
    "productCategoryAccepted",
    "productBenefitsAccepted",
    "productCtaAccepted",
    "claimSubstantiationAccepted",
    "productSnapshotMatchesPlan"
  ];
  const checks = [
    allowedKeys(productFacts, productFactsKeys, "short_product_rights_product_facts_keys"),
    safeSha256(productFacts.productUrlSha256) &&
      safeSha256(productFacts.productHostSha256) &&
      safeSha256(productFacts.productPathSha256) &&
      safeSha256(productFacts.liveExtractionReportSha256)
      ? pass("short_product_rights_product_hashes", "Product URL/source extraction hashes are present.")
      : fail("short_product_rights_product_hashes", "product URL, host, path, and extraction-report SHA-256 hashes are required."),
    factBooleans.every((key) => productFacts[key] === true)
      ? pass("short_product_rights_product_facts_accepted", "Product title/category/benefits/CTA/claims/snapshot are accepted.")
      : fail("short_product_rights_product_facts_accepted", "Product title, category, benefits, CTA, claim substantiation, and plan snapshot matching must all be accepted."),
    productFacts.missingRequiredFactCount === 0 && productFacts.unsupportedClaimCount === 0
      ? pass("short_product_rights_product_fact_counts", "No missing required facts or unsupported claims remain.")
      : fail("short_product_rights_product_fact_counts", "missingRequiredFactCount and unsupportedClaimCount must both be zero."),
    productFacts.rawProductUrlStored === false &&
      productFacts.rawMediaUrlsStored === false &&
      productFacts.secretsStored === false
      ? pass("short_product_rights_product_redaction", "Product facts store no raw product URL, media URLs, or secrets.")
      : fail("short_product_rights_product_redaction", "productFacts must set rawProductUrlStored/rawMediaUrlsStored/secretsStored to false.")
  ];
  if (productFacts.notes !== undefined) {
    checks.push(safeEvidenceText(productFacts.notes)
      ? pass("short_product_rights_product_notes", "Product notes are safe.")
      : fail("short_product_rights_product_notes", "productFacts.notes must not contain URLs, paths, secrets, or placeholders."));
  }
  return checks;
}

function mediaRightsChecks(mediaRights) {
  if (!isRecord(mediaRights)) {
    return [fail("short_product_rights_media_rights", "mediaRights must be an object.")];
  }
  const checks = [
    allowedKeys(mediaRights, mediaRightsKeys, "short_product_rights_media_rights_keys"),
    mediaRights.productMediaApprovedForUse === true &&
      mediaRights.commercialUseApproved === true &&
      mediaRights.usageScopeReviewed === true &&
      mediaRights.trademarkUsageApproved === true &&
      mediaRights.restrictedThirdPartyMarksAbsent === true
      ? pass("short_product_rights_media_rights_approved", "Product media, commercial use, usage scope, trademarks, and third-party marks are approved.")
      : fail("short_product_rights_media_rights_approved", "Product media, commercial use, usage scope, trademark use, and restricted third-party mark checks must be accepted."),
    allowedOwnershipDecisions.has(mediaRights.ownershipDecision)
      ? pass("short_product_rights_ownership_decision", "Media ownership decision is recognized.")
      : fail("short_product_rights_ownership_decision", "mediaRights.ownershipDecision must be brand_owned, licensed, merchant_authorized, or public_listing_with_operator_approval."),
    allowedModelReleaseStatuses.has(mediaRights.modelReleaseStatus)
      ? pass("short_product_rights_model_release", "Model release status is accepted or not required.")
      : fail("short_product_rights_model_release", "mediaRights.modelReleaseStatus must be not_required or accepted."),
    allowedAttributionStatuses.has(mediaRights.attributionStatus) && safeSha256(mediaRights.attributionSummarySha256)
      ? pass("short_product_rights_attribution", "Attribution status and digest are recorded.")
      : fail("short_product_rights_attribution", "mediaRights.attributionStatus must be not_required or required_and_recorded, with attributionSummarySha256."),
    allowedReviewerRoles.has(mediaRights.rightsReviewerRole)
      ? pass("short_product_rights_rights_reviewer_role", "Rights reviewer role is recognized.")
      : fail("short_product_rights_rights_reviewer_role", "mediaRights.rightsReviewerRole must be operator, producer, product, legal, qa, or hybrid."),
    validPastDateTime(mediaRights.rightsReviewedAt)
      ? pass("short_product_rights_rights_reviewed_at", "mediaRights.rightsReviewedAt is a valid non-future ISO timestamp.")
      : fail("short_product_rights_rights_reviewed_at", "mediaRights.rightsReviewedAt must be a valid ISO date-time and not in the future."),
    mediaRights.redactionReviewed === true
      ? pass("short_product_rights_media_redaction", "Media rights evidence is redaction reviewed.")
      : fail("short_product_rights_media_redaction", "mediaRights.redactionReviewed must be true.")
  ];
  if (mediaRights.notes !== undefined) {
    checks.push(safeEvidenceText(mediaRights.notes)
      ? pass("short_product_rights_media_notes", "Media rights notes are safe.")
      : fail("short_product_rights_media_notes", "mediaRights.notes must not contain URLs, paths, secrets, or placeholders."));
  }
  return checks;
}

function operationBoundaryChecks(boundary) {
  if (!isRecord(boundary)) {
    return [fail("short_product_rights_operation_boundary", "operationBoundary must be an object.")];
  }
  return [
    allowedKeys(boundary, operationBoundaryKeys, "short_product_rights_operation_boundary_keys"),
    boundary.noSpend === true &&
      boundary.networkCallsMade === false &&
      boundary.providerCallsMade === false &&
      boundary.canQueueProviderSpendFromEvidence === false &&
      boundary.renderJobQueued === false &&
      boundary.spendReservationCreated === false &&
      boundary.canReleaseToCustomerTraffic === false
      ? pass("short_product_rights_no_spend_boundary", "Evidence cannot queue provider spend and cannot release customer traffic.")
      : fail("short_product_rights_no_spend_boundary", "operationBoundary must keep noSpend true and all network/provider/spend/release fields false.")
  ];
}

function bindingChecks(binding) {
  if (!isRecord(binding)) {
    return [fail("short_product_rights_binding", "evidenceBinding must be an object.")];
  }
  return [
    allowedKeys(binding, bindingKeys, "short_product_rights_binding_keys"),
    safeSha256(binding.productFactsReviewSha256) &&
      safeSha256(binding.mediaRightsReviewSha256) &&
      safeSha256(binding.productUrlExtractionReportSha256) &&
      safeSha256(binding.sessionUiContractSha256) &&
      safeSha256(binding.storedSessionPlanSha256)
      ? pass("short_product_rights_binding_hashes", "Product facts, media rights, URL extraction, UI contract, and stored plan hashes are present.")
      : fail("short_product_rights_binding_hashes", "productFactsReviewSha256, mediaRightsReviewSha256, productUrlExtractionReportSha256, sessionUiContractSha256, and storedSessionPlanSha256 must be SHA-256 hex strings."),
    binding.clientScoped === true && binding.serverSidePlanUsed === true && binding.redactionReviewed === true
      ? pass("short_product_rights_server_plan_binding", "Evidence is client-scoped, server-plan-bound, and redaction reviewed.")
      : fail("short_product_rights_server_plan_binding", "evidenceBinding must set clientScoped/serverSidePlanUsed/redactionReviewed to true."),
    binding.shortReviewOperationEvidenceIncluded === false && binding.paidRenderEvidenceIncluded === false
      ? pass("short_product_rights_scope_separation", "Review operation and paid render evidence remain separate gates.")
      : fail("short_product_rights_scope_separation", "shortReviewOperationEvidenceIncluded and paidRenderEvidenceIncluded must remain false in this product/rights packet.")
  ];
}

function summaryFor(value, canUse) {
  return {
    productFactsAccepted: productFactsAccepted(value?.productFacts),
    mediaRightsApproved: mediaRightsApproved(value?.mediaRights),
    redactionReviewed: value?.reviewer?.redactionReviewed === true &&
      value?.mediaRights?.redactionReviewed === true &&
      value?.evidenceBinding?.redactionReviewed === true,
    rawUrlStorageBlocked: value?.productFacts?.rawProductUrlStored === false &&
      value?.productFacts?.rawMediaUrlsStored === false &&
      value?.productFacts?.secretsStored === false,
    noSpendOperation: value?.operationBoundary?.noSpend === true,
    providerSubmissionBlocked: providerSubmissionBlocked(value),
    canUseAsAcceptedShortProductRightsEvidence: canUse,
    canSubmitToProviderNow: false,
    canReleaseToCustomerTraffic: false
  };
}

function productFactsAccepted(productFacts) {
  return isRecord(productFacts) &&
    productFacts.productTitleAccepted === true &&
    productFacts.productCategoryAccepted === true &&
    productFacts.productBenefitsAccepted === true &&
    productFacts.productCtaAccepted === true &&
    productFacts.claimSubstantiationAccepted === true &&
    productFacts.productSnapshotMatchesPlan === true &&
    productFacts.missingRequiredFactCount === 0 &&
    productFacts.unsupportedClaimCount === 0;
}

function mediaRightsApproved(mediaRights) {
  return isRecord(mediaRights) &&
    mediaRights.productMediaApprovedForUse === true &&
    mediaRights.commercialUseApproved === true &&
    mediaRights.usageScopeReviewed === true &&
    allowedOwnershipDecisions.has(mediaRights.ownershipDecision) &&
    allowedModelReleaseStatuses.has(mediaRights.modelReleaseStatus) &&
    mediaRights.trademarkUsageApproved === true &&
    mediaRights.restrictedThirdPartyMarksAbsent === true &&
    allowedAttributionStatuses.has(mediaRights.attributionStatus) &&
    safeSha256(mediaRights.attributionSummarySha256);
}

function providerSubmissionBlocked(value) {
  return value?.operationBoundary?.canQueueProviderSpendFromEvidence === false &&
    value?.operationBoundary?.renderJobQueued === false &&
    value?.operationBoundary?.spendReservationCreated === false &&
    value?.operationBoundary?.providerCallsMade === false &&
    value?.operationBoundary?.networkCallsMade === false &&
    value?.operationBoundary?.canReleaseToCustomerTraffic === false;
}

function publicEvidenceSummary(value) {
  if (!isRecord(value)) {
    return { configured: false };
  }
  return {
    configured: true,
    schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : "invalid",
    environmentKind: typeof value.environmentKind === "string" ? value.environmentKind : "invalid",
    deploymentBaseUrlSha256: validDeploymentUrl(value.deploymentBaseUrl) ? sha256(value.deploymentBaseUrl) : undefined,
    sessionId: safeSessionId(value.sessionId) ? value.sessionId : undefined,
    reviewerId: safeIdentifier(value.reviewer?.reviewerId) ? value.reviewer.reviewerId : undefined,
    reviewerRole: allowedReviewerRoles.has(value.reviewer?.reviewerRole) ? value.reviewer.reviewerRole : undefined,
    reviewedAt: validDateTime(value.reviewer?.reviewedAt) ? value.reviewer.reviewedAt : undefined,
    productUrlSha256: safeSha256(value.productFacts?.productUrlSha256) ? value.productFacts.productUrlSha256 : undefined,
    productHostSha256: safeSha256(value.productFacts?.productHostSha256) ? value.productFacts.productHostSha256 : undefined,
    productPathSha256: safeSha256(value.productFacts?.productPathSha256) ? value.productFacts.productPathSha256 : undefined,
    liveExtractionReportSha256: safeSha256(value.productFacts?.liveExtractionReportSha256) ? value.productFacts.liveExtractionReportSha256 : undefined,
    missingRequiredFactCount: Number.isSafeInteger(value.productFacts?.missingRequiredFactCount)
      ? value.productFacts.missingRequiredFactCount
      : 0,
    unsupportedClaimCount: Number.isSafeInteger(value.productFacts?.unsupportedClaimCount)
      ? value.productFacts.unsupportedClaimCount
      : 0,
    ownershipDecision: allowedOwnershipDecisions.has(value.mediaRights?.ownershipDecision) ? value.mediaRights.ownershipDecision : undefined,
    modelReleaseStatus: allowedModelReleaseStatuses.has(value.mediaRights?.modelReleaseStatus) ? value.mediaRights.modelReleaseStatus : undefined,
    attributionStatus: allowedAttributionStatuses.has(value.mediaRights?.attributionStatus) ? value.mediaRights.attributionStatus : undefined,
    attributionSummarySha256: safeSha256(value.mediaRights?.attributionSummarySha256) ? value.mediaRights.attributionSummarySha256 : undefined,
    rightsReviewerRole: allowedReviewerRoles.has(value.mediaRights?.rightsReviewerRole) ? value.mediaRights.rightsReviewerRole : undefined,
    rightsReviewedAt: validDateTime(value.mediaRights?.rightsReviewedAt) ? value.mediaRights.rightsReviewedAt : undefined,
    productFactsReviewSha256: safeSha256(value.evidenceBinding?.productFactsReviewSha256) ? value.evidenceBinding.productFactsReviewSha256 : undefined,
    mediaRightsReviewSha256: safeSha256(value.evidenceBinding?.mediaRightsReviewSha256) ? value.evidenceBinding.mediaRightsReviewSha256 : undefined,
    productUrlExtractionReportSha256: safeSha256(value.evidenceBinding?.productUrlExtractionReportSha256) ? value.evidenceBinding.productUrlExtractionReportSha256 : undefined,
    sessionUiContractSha256: safeSha256(value.evidenceBinding?.sessionUiContractSha256) ? value.evidenceBinding.sessionUiContractSha256 : undefined,
    storedSessionPlanSha256: safeSha256(value.evidenceBinding?.storedSessionPlanSha256) ? value.evidenceBinding.storedSessionPlanSha256 : undefined
  };
}

function statusFor({ evidenceRead, checks, confirmAcceptedProductRights }) {
  if (!evidenceRead.exists) {
    return "blocked_by_missing_inputs";
  }
  if (checks.some((check) => check.status === "fail" && check.name !== "accepted_product_rights_confirmed")) {
    return "fail";
  }
  if (!confirmAcceptedProductRights) {
    return "blocked_by_confirmation";
  }
  return "pass";
}

function nextActionsFor({ status, options }) {
  if (status === "pass") {
    return [
      "Combine this product/rights evidence with accepted Short review-operation evidence before any paid Short render handoff.",
      "Keep paid render, artifact validation, manual media review, and business-readiness approval as separate release gates."
    ];
  }
  if (status === "blocked_by_confirmation") {
    return [
      `Rerun with --confirm-accepted-product-rights only after an operator accepts product facts and media rights in ${toRepoRelative(options.evidencePath)}.`,
      "Do not use this packet as Short product/rights evidence until the confirmation flag is present."
    ];
  }
  if (status === "blocked_by_missing_inputs") {
    return [
      `Create the ignored operator packet at ${toRepoRelative(options.evidencePath)} using schema cinejelly.short-product-rights-evidence.v1.`,
      "Bind it to product URL extraction, stored session plan, and session UI contract hashes before trying a paid Short render."
    ];
  }
  return [
    "Fix failed schema, redaction, approval, rights, or hash-binding checks in the Short product/rights evidence packet.",
    "Rerun validation:short-product-rights before combining it with accepted review-operation or paid render evidence."
  ];
}

function allowedKeys(value, allowed, name) {
  if (!isRecord(value)) {
    return fail(name, "Expected a JSON object.");
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  return unexpected.length === 0
    ? pass(name, "No unexpected keys are present.")
    : fail(name, `Unexpected keys are present: ${unexpected.map(redactText).join(", ")}.`);
}

function validDeploymentUrl(value) {
  if (typeof value !== "string" || !value.trim() || !safeEvidenceText(value, { allowHttpsUrl: true })) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) &&
      !host.endsWith(".example.com") &&
      !host.endsWith(".example.invalid") &&
      !host.includes("placeholder") &&
      !host.includes("token") &&
      !host.includes("secret") &&
      !host.includes("credential");
  } catch {
    return false;
  }
}

function safeSessionId(value) {
  return typeof value === "string" && /^short_session_[a-f0-9]{16}$/.test(value);
}

function safeIdentifier(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 180 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    safeEvidenceText(value);
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validPastDateTime(value) {
  if (!validDateTime(value)) {
    return false;
  }
  return new Date(value).getTime() <= Date.now();
}

function validDateTime(value) {
  if (typeof value !== "string" || !value) {
    return false;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) && value.includes("T");
}

function safeEvidenceText(value, options = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 700) {
    return false;
  }
  return unsafePatterns.every((pattern) => {
    if (options.allowHttpsUrl && pattern.source.startsWith("https?:")) {
      return true;
    }
    return !pattern.test(value);
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message: redactText(message) };
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(value) {
  const absolutePath = resolve(repoRoot, value);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "[outside-repo]";
  }
  return relativePath.replace(/\\/g, "/");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function redactText(value) {
  let text = String(value ?? "");
  for (const pattern of unsafePatterns) {
    text = text.replace(pattern, "[redacted]");
  }
  return text.length > 900 ? `${text.slice(0, 897)}...` : text;
}

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(redactText(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
