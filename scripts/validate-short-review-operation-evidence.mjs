#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/short-review-operation-evidence.json",
  outputPath: "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json"
};

const requiredSurfaces = ["scene", "audio", "caption", "claim"];
const allowedReviewerRoles = new Set(["operator", "producer", "product", "legal", "qa", "hybrid"]);
const topLevelKeys = new Set([
  "schemaVersion",
  "environmentKind",
  "deploymentBaseUrl",
  "sessionId",
  "reviewer",
  "operation",
  "checkpoints",
  "evidenceBinding"
]);
const reviewerKeys = new Set(["reviewerId", "reviewerRole", "reviewedAt", "redactionReviewed"]);
const operationKeys = new Set([
  "endpointPath",
  "reviewApprovalGate",
  "confirmRenderSubmission",
  "canQueueProviderSpendFromEvidence",
  "renderJobQueued",
  "spendReservationCreated",
  "providerCallsMade",
  "networkCallsMade",
  "noSpend",
  "rawTranscriptStored",
  "rawUrlsStored",
  "localPathsStored",
  "secretsStored"
]);
const checkpointKeys = new Set([
  "surface",
  "checkpointId",
  "label",
  "required",
  "decision",
  "reviewerRequiredForApproval",
  "reviewedAtRequiredForApproval",
  "evidenceKeyCount",
  "notes"
]);
const bindingKeys = new Set([
  "approvalPacketSha256",
  "sessionUiContractSha256",
  "storedSessionPlanSha256",
  "clientScoped",
  "serverSidePlanUsed",
  "redactionReviewed",
  "acceptedProductUrlEvidenceIncluded",
  "mediaRightsApprovalIncluded"
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
    confirmAcceptedReviewOperation: false,
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
    if (arg === "--confirm-accepted-review-operation") {
      options.confirmAcceptedReviewOperation = true;
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
  console.log(`Validate archived Short create/review operation evidence without making network, provider, render, or billing calls.

Usage:
  npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation

Options:
  --evidence <path>                         Operator-owned review operation evidence JSON. Default: ${defaults.evidencePath}
  --confirm-accepted-review-operation       Required before a valid packet can pass.
  --output <path>                           JSON report path. Default: ${defaults.outputPath}
  --no-output                               Print only; do not write the report.

This validator reads local JSON evidence only. It does not submit render jobs, call Atlas, call deployment hosts, reserve spend, or approve customer traffic.`);
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
  const checkpointSummary = summarizeCheckpoints(evidenceRead.value);
  const confirmationCheck = options.confirmAcceptedReviewOperation
    ? pass("accepted_review_operation_confirmed", "Operator confirmed this packet represents accepted Short create/review operation evidence.")
    : fail("accepted_review_operation_confirmed", "--confirm-accepted-review-operation is required before the packet can pass.");
  const checks = [
    evidenceRead.exists
      ? pass("short_review_operation_evidence_file_present", "Short review operation evidence file is present.")
      : fail("short_review_operation_evidence_file_present", `Missing Short review operation evidence at ${toRepoRelative(options.evidencePath)}.`),
    ...(evidenceRead.error ? [fail("short_review_operation_evidence_json", `Evidence JSON is invalid: ${redactText(evidenceRead.error)}.`)] : []),
    ...evidenceChecks,
    confirmationCheck
  ];
  const status = statusFor({ evidenceRead, checks, confirmAcceptedReviewOperation: options.confirmAcceptedReviewOperation });
  const canUse = status === "pass";
  const report = {
    schemaVersion: "cinejelly.short-review-operation-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      evidenceConfigured: evidenceRead.exists,
      confirmAcceptedReviewOperation: options.confirmAcceptedReviewOperation
    },
    summary: {
      requiredSurfaceCount: requiredSurfaces.length,
      presentSurfaceCount: checkpointSummary.presentSurfaceCount,
      checkpointCount: checkpointSummary.checkpointCount,
      approvedCheckpointCount: checkpointSummary.approvedCheckpointCount,
      redactionReviewed: evidenceRead.value?.reviewer?.redactionReviewed === true && evidenceRead.value?.evidenceBinding?.redactionReviewed === true,
      noSpendOperation: evidenceRead.value?.operation?.noSpend === true,
      providerSubmissionBlocked: providerSubmissionBlocked(evidenceRead.value),
      canUseAsAcceptedShortReviewOperationEvidence: canUse,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false
    },
    evidence: publicEvidenceSummary(evidenceRead.value),
    checkpoints: checkpointSummary.publicCheckpoints,
    checks,
    releaseGateSummary: {
      acceptedShortReviewOperationEvidencePass: canUse,
      canUseAsAcceptedShortReviewOperationEvidence: canUse,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: canUse
        ? "Accepted Short review operation evidence is schema/redaction safe for no-spend backend handoff validation only; product URL evidence, media-rights approval, paid render evidence, artifact validation, and business-readiness approval remain separate gates."
        : "Short review operation evidence is missing, unconfirmed, unsafe, or not fully accepted."
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
    return [fail("short_review_operation_shape", "Evidence must be a JSON object.")];
  }
  checks.push(allowedKeys(value, topLevelKeys, "short_review_operation_top_level_keys"));
  checks.push(value.schemaVersion === "cinejelly.short-review-operation-evidence.v1"
    ? pass("short_review_operation_schema_version", "Evidence schema version is supported.")
    : fail("short_review_operation_schema_version", "Evidence schemaVersion must be cinejelly.short-review-operation-evidence.v1."));
  checks.push(value.environmentKind === "deployment"
    ? pass("short_review_operation_environment", "Evidence is declared as deployment operation evidence.")
    : fail("short_review_operation_environment", "Evidence environmentKind must be deployment."));
  checks.push(validDeploymentUrl(value.deploymentBaseUrl)
    ? pass("short_review_operation_deployment_url", "Deployment URL is HTTPS, query-free, and not echoed in public reports.")
    : fail("short_review_operation_deployment_url", "deploymentBaseUrl must be a clean HTTPS URL without query, hash, localhost, placeholder, or credential-like host data."));
  checks.push(safeSessionId(value.sessionId)
    ? pass("short_review_operation_session_id", "Session id uses the short-pipeline session format.")
    : fail("short_review_operation_session_id", "sessionId must match short_session_[a-f0-9]{16}."));
  checks.push(...reviewerChecks(value.reviewer));
  checks.push(...operationChecks(value.operation, value.sessionId));
  checks.push(...checkpointChecks(value.checkpoints));
  checks.push(...bindingChecks(value.evidenceBinding));
  return checks;
}

function reviewerChecks(reviewer) {
  if (!isRecord(reviewer)) {
    return [fail("short_review_operation_reviewer", "reviewer must be an object.")];
  }
  return [
    allowedKeys(reviewer, reviewerKeys, "short_review_operation_reviewer_keys"),
    safeIdentifier(reviewer.reviewerId)
      ? pass("short_review_operation_reviewer_id", "Reviewer id is a safe identifier.")
      : fail("short_review_operation_reviewer_id", "reviewer.reviewerId must be a safe non-placeholder identifier."),
    allowedReviewerRoles.has(reviewer.reviewerRole)
      ? pass("short_review_operation_reviewer_role", "Reviewer role is recognized.")
      : fail("short_review_operation_reviewer_role", "reviewer.reviewerRole must be operator, producer, product, legal, qa, or hybrid."),
    validPastDateTime(reviewer.reviewedAt)
      ? pass("short_review_operation_reviewed_at", "reviewer.reviewedAt is a valid non-future ISO timestamp.")
      : fail("short_review_operation_reviewed_at", "reviewer.reviewedAt must be a valid ISO date-time and not in the future."),
    reviewer.redactionReviewed === true
      ? pass("short_review_operation_reviewer_redaction", "Reviewer explicitly completed redaction review.")
      : fail("short_review_operation_reviewer_redaction", "reviewer.redactionReviewed must be true.")
  ];
}

function operationChecks(operation, sessionId) {
  if (!isRecord(operation)) {
    return [fail("short_review_operation_payload", "operation must be an object.")];
  }
  const expectedEndpointPath = safeSessionId(sessionId)
    ? `/v1/short-pipeline/conversation-sessions/${sessionId}/render-jobs`
    : "";
  return [
    allowedKeys(operation, operationKeys, "short_review_operation_payload_keys"),
    operation.endpointPath === expectedEndpointPath
      ? pass("short_review_operation_endpoint_binding", "Endpoint path is bound to the reviewed stored session.")
      : fail("short_review_operation_endpoint_binding", "operation.endpointPath must match /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs for this session."),
    operation.reviewApprovalGate === "pre_render"
      ? pass("short_review_operation_gate", "Review approval gate is pre_render.")
      : fail("short_review_operation_gate", "operation.reviewApprovalGate must be pre_render."),
    operation.confirmRenderSubmission === false
      ? pass("short_review_operation_confirm_render_false", "Review operation evidence does not submit provider spend.")
      : fail("short_review_operation_confirm_render_false", "operation.confirmRenderSubmission must remain false for no-spend operation evidence."),
    operation.canQueueProviderSpendFromEvidence === false &&
      operation.renderJobQueued === false &&
      operation.spendReservationCreated === false &&
      operation.providerCallsMade === false &&
      operation.networkCallsMade === false &&
      operation.noSpend === true
      ? pass("short_review_operation_no_spend_boundary", "Operation evidence cannot queue provider spend and records no provider/network calls.")
      : fail("short_review_operation_no_spend_boundary", "operation must keep canQueueProviderSpendFromEvidence/renderJobQueued/spendReservationCreated/providerCallsMade/networkCallsMade false and noSpend true."),
    operation.rawTranscriptStored === false &&
      operation.rawUrlsStored === false &&
      operation.localPathsStored === false &&
      operation.secretsStored === false
      ? pass("short_review_operation_redacted_storage", "Operation evidence stores no raw transcripts, URLs, local paths, or secrets.")
      : fail("short_review_operation_redacted_storage", "operation must set rawTranscriptStored/rawUrlsStored/localPathsStored/secretsStored to false.")
  ];
}

function checkpointChecks(checkpoints) {
  if (!Array.isArray(checkpoints)) {
    return [fail("short_review_operation_checkpoints", "checkpoints must be an array.")];
  }
  const checks = [
    checkpoints.length >= requiredSurfaces.length
      ? pass("short_review_operation_checkpoint_count", "Checkpoint count covers required short review surfaces.")
      : fail("short_review_operation_checkpoint_count", "At least four checkpoints are required."),
    requiredSurfaces.every((surface) => checkpoints.some((checkpoint) => checkpoint?.surface === surface))
      ? pass("short_review_operation_required_surfaces", "Scene/audio/caption/claim surfaces are present.")
      : fail("short_review_operation_required_surfaces", "Scene, audio, caption, and claim checkpoints are all required.")
  ];
  checkpoints.forEach((checkpoint, index) => {
    const prefix = `short_review_operation_checkpoint_${index + 1}`;
    if (!isRecord(checkpoint)) {
      checks.push(fail(`${prefix}_shape`, "Each checkpoint must be an object."));
      return;
    }
    checks.push(allowedKeys(checkpoint, checkpointKeys, `${prefix}_keys`));
    checks.push(requiredSurfaces.includes(checkpoint.surface)
      ? pass(`${prefix}_surface`, "Checkpoint surface is recognized.")
      : fail(`${prefix}_surface`, "Checkpoint surface must be scene, audio, caption, or claim."));
    checks.push(safeIdentifier(checkpoint.checkpointId)
      ? pass(`${prefix}_id`, "Checkpoint id is safe.")
      : fail(`${prefix}_id`, "checkpointId must be a safe identifier."));
    checks.push(safeEvidenceText(checkpoint.label)
      ? pass(`${prefix}_label`, "Checkpoint label is safe.")
      : fail(`${prefix}_label`, "checkpoint label must be non-empty and must not contain URLs, paths, secrets, or placeholders."));
    checks.push(checkpoint.required === true &&
      checkpoint.reviewerRequiredForApproval === true &&
      checkpoint.reviewedAtRequiredForApproval === true
      ? pass(`${prefix}_required_approval_contract`, "Checkpoint requires reviewer and timestamp evidence.")
      : fail(`${prefix}_required_approval_contract`, "Checkpoint must be required and must require reviewer/timestamp approval evidence."));
    checks.push(checkpoint.decision === "approved"
      ? pass(`${prefix}_decision`, "Checkpoint decision is approved.")
      : fail(`${prefix}_decision`, "Accepted operation evidence requires every checkpoint decision to be approved."));
    checks.push(Number.isSafeInteger(checkpoint.evidenceKeyCount) && checkpoint.evidenceKeyCount >= 0
      ? pass(`${prefix}_evidence_count`, "Checkpoint evidence count is bounded.")
      : fail(`${prefix}_evidence_count`, "checkpoint.evidenceKeyCount must be a non-negative integer."));
    if (checkpoint.notes !== undefined) {
      checks.push(safeEvidenceText(checkpoint.notes)
        ? pass(`${prefix}_notes`, "Checkpoint notes are safe.")
        : fail(`${prefix}_notes`, "checkpoint notes must not contain URLs, paths, secrets, or placeholders."));
    }
  });
  return checks;
}

function bindingChecks(binding) {
  if (!isRecord(binding)) {
    return [fail("short_review_operation_binding", "evidenceBinding must be an object.")];
  }
  return [
    allowedKeys(binding, bindingKeys, "short_review_operation_binding_keys"),
    safeSha256(binding.approvalPacketSha256) &&
      safeSha256(binding.sessionUiContractSha256) &&
      safeSha256(binding.storedSessionPlanSha256)
      ? pass("short_review_operation_binding_hashes", "Approval packet, session UI contract, and stored plan hashes are present.")
      : fail("short_review_operation_binding_hashes", "approvalPacketSha256, sessionUiContractSha256, and storedSessionPlanSha256 must be SHA-256 hex strings."),
    binding.clientScoped === true && binding.serverSidePlanUsed === true && binding.redactionReviewed === true
      ? pass("short_review_operation_server_plan_binding", "Evidence is client-scoped, server-plan-bound, and redaction reviewed.")
      : fail("short_review_operation_server_plan_binding", "evidenceBinding must set clientScoped/serverSidePlanUsed/redactionReviewed to true."),
    binding.acceptedProductUrlEvidenceIncluded === false && binding.mediaRightsApprovalIncluded === false
      ? pass("short_review_operation_scope_separation", "Product URL acceptance and media-rights approval remain separate evidence gates.")
      : fail("short_review_operation_scope_separation", "acceptedProductUrlEvidenceIncluded and mediaRightsApprovalIncluded must remain false in this review-operation packet.")
  ];
}

function summarizeCheckpoints(value) {
  const checkpoints = Array.isArray(value?.checkpoints) ? value.checkpoints.filter(isRecord) : [];
  const surfaces = new Set(checkpoints.map((checkpoint) => checkpoint.surface).filter((surface) => requiredSurfaces.includes(surface)));
  return {
    checkpointCount: checkpoints.length,
    approvedCheckpointCount: checkpoints.filter((checkpoint) => checkpoint.decision === "approved").length,
    presentSurfaceCount: surfaces.size,
    publicCheckpoints: checkpoints.map((checkpoint) => ({
      surface: requiredSurfaces.includes(checkpoint.surface) ? checkpoint.surface : "unknown",
      checkpointId: safeIdentifier(checkpoint.checkpointId) ? checkpoint.checkpointId : "invalid",
      decision: checkpoint.decision === "approved" ? "approved" : "not_accepted",
      required: checkpoint.required === true,
      reviewerRequiredForApproval: checkpoint.reviewerRequiredForApproval === true,
      reviewedAtRequiredForApproval: checkpoint.reviewedAtRequiredForApproval === true,
      evidenceKeyCount: Number.isSafeInteger(checkpoint.evidenceKeyCount) && checkpoint.evidenceKeyCount >= 0
        ? checkpoint.evidenceKeyCount
        : 0
    }))
  };
}

function publicEvidenceSummary(value) {
  if (!isRecord(value)) {
    return { configured: false };
  }
  return {
    configured: true,
    schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : "missing",
    environmentKind: typeof value.environmentKind === "string" ? value.environmentKind : "missing",
    deploymentBaseUrlSha256: typeof value.deploymentBaseUrl === "string" ? sha256(value.deploymentBaseUrl.trim()) : undefined,
    sessionId: safeSessionId(value.sessionId) ? value.sessionId : undefined,
    endpointPathTemplate: "/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs",
    reviewerId: safeIdentifier(value.reviewer?.reviewerId) ? value.reviewer.reviewerId : undefined,
    reviewerRole: allowedReviewerRoles.has(value.reviewer?.reviewerRole) ? value.reviewer.reviewerRole : undefined,
    reviewedAt: validPastDateTime(value.reviewer?.reviewedAt) ? value.reviewer.reviewedAt : undefined,
    approvalPacketSha256: safeSha256(value.evidenceBinding?.approvalPacketSha256)
      ? value.evidenceBinding.approvalPacketSha256.toLowerCase()
      : undefined,
    sessionUiContractSha256: safeSha256(value.evidenceBinding?.sessionUiContractSha256)
      ? value.evidenceBinding.sessionUiContractSha256.toLowerCase()
      : undefined,
    storedSessionPlanSha256: safeSha256(value.evidenceBinding?.storedSessionPlanSha256)
      ? value.evidenceBinding.storedSessionPlanSha256.toLowerCase()
      : undefined
  };
}

function providerSubmissionBlocked(value) {
  const operation = value?.operation;
  return operation?.confirmRenderSubmission === false &&
    operation?.canQueueProviderSpendFromEvidence === false &&
    operation?.renderJobQueued === false &&
    operation?.spendReservationCreated === false &&
    operation?.providerCallsMade === false &&
    operation?.networkCallsMade === false;
}

function statusFor({ evidenceRead, checks, confirmAcceptedReviewOperation }) {
  if (!evidenceRead.exists) {
    return "blocked_by_missing_inputs";
  }
  if (evidenceRead.error) {
    return "fail";
  }
  const nonConfirmationFailures = checks.filter((check) =>
    check.status === "fail" && check.name !== "accepted_review_operation_confirmed"
  );
  if (nonConfirmationFailures.length > 0) {
    return "fail";
  }
  if (!confirmAcceptedReviewOperation) {
    return "blocked_by_confirmation";
  }
  return "pass";
}

function nextActionsFor({ status, options }) {
  if (status === "pass") {
    return [
      "Use this report only as no-spend accepted Short review operation evidence; keep provider submission behind confirmRenderSubmission=true and normal async render-job gates.",
      "Collect separate accepted product URL, media-rights, paid render, artifact validation, and manual media review evidence before any customer-traffic claim."
    ];
  }
  if (status === "blocked_by_missing_inputs") {
    return [
      `Create the ignored operator packet at ${toRepoRelative(options.evidencePath)} using schema cinejelly.short-review-operation-evidence.v1.`,
      "Run this validator again with --confirm-accepted-review-operation only after the packet comes from an accepted reviewer operation."
    ];
  }
  if (status === "blocked_by_confirmation") {
    return [
      "Review the local packet provenance, then rerun with --confirm-accepted-review-operation when it is accepted reviewer operation evidence.",
      "Do not use an unconfirmed packet as accepted review evidence."
    ];
  }
  return [
    "Fix the rejected evidence fields, especially checkpoint decisions, redaction flags, endpoint/session binding, and no-spend submission boundaries.",
    "Rerun validation:short-review-operation before handing the packet into any backend paid-render workflow."
  ];
}

function allowedKeys(value, allowed, name) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  return unexpected.length === 0
    ? pass(name, "Only expected keys are present.")
    : fail(name, "Unexpected keys are present in the evidence packet.");
}

function validDeploymentUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      host.length > 0 &&
      !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) &&
      !/(^|\.)example\./i.test(host) &&
      !/(^|\.)invalid$/i.test(host) &&
      !/placeholder|replace|token|secret|password|credential/i.test(host);
  } catch {
    return false;
  }
}

function safeEvidenceText(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 500 &&
    unsafePatterns.every((pattern) => !pattern.test(value));
}

function safeIdentifier(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9._:-]{1,180}$/.test(value.trim()) &&
    unsafePatterns.every((pattern) => !pattern.test(value));
}

function safeSessionId(value) {
  return typeof value === "string" && /^short_session_[a-f0-9]{16}$/.test(value);
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function validPastDateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return timestamp <= Date.now() + 5 * 60 * 1000;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]")
    .replace(/(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/[A-Za-z]:\\[^\s"'<>]+/g, "[REDACTED_PATH]");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
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

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
