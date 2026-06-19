#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/render-provider-live-actions.json",
  productionHandoffPath: "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json",
  outputPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json"
};

const workerActions = new Set([
  "resume_polling",
  "close_terminal_succeeded",
  "close_terminal_failed",
  "close_terminal_canceled",
  "close_terminal_timeout",
  "close_terminal_mixed",
  "manual_audit_required"
]);

const providerCallKinds = new Set([
  "prediction_poll",
  "terminal_closeout",
  "manual_audit_enqueue",
  "provider_cancel_or_close",
  "graph_resume_enqueue"
]);

const resultStatuses = new Set([
  "succeeded",
  "still_active",
  "terminal_failed",
  "manual_audit_queued",
  "resume_enqueued",
  "closeout_recorded"
]);

const evidenceKeys = new Set([
  "schemaVersion",
  "environmentKind",
  "deploymentBaseUrl",
  "approvedBy",
  "approvedAt",
  "executions"
]);

const executionKeys = new Set([
  "actionId",
  "jobId",
  "action",
  "predictionIds",
  "provider",
  "providerCallKind",
  "providerCallMade",
  "resultStatus",
  "executedAt",
  "evidenceSummary",
  "redactionReviewed",
  "rawProviderPayloadStored",
  "outputUrlsStored"
]);

const placeholderPatterns = [
  /replace[-_\s]?with/i,
  /placeholder/i,
  /\btodo\b/i,
  /\btbd\b/i
];

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi,
  /[A-Za-z]:\\[^\s"'<>]+/g,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/gi,
  /data:[^\s"'<>]+/gi
];

function parseArgs(args) {
  const options = {
    evidencePath: defaults.evidencePath,
    productionHandoffPath: defaults.productionHandoffPath,
    outputPath: defaults.outputPath,
    confirmLiveProviderActions: false,
    writeReport: true
  };
  const flagMap = new Map([
    ["--evidence", "evidencePath"],
    ["--production-handoff-report", "productionHandoffPath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-live-provider-actions") {
      options.confirmLiveProviderActions = true;
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
  console.log(`Validate archived live provider handoff action evidence without making provider calls.

Usage:
  npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions

Options:
  --evidence <path>                    Operator-owned live action evidence JSON. Default: ${defaults.evidencePath}
  --production-handoff-report <path>   Production handoff capture report. Default: ${defaults.productionHandoffPath}
  --confirm-live-provider-actions      Required before a valid evidence packet can pass.
  --output <path>                      JSON report path. Default: ${defaults.outputPath}
  --no-output                          Print only; do not write the report.

This validator reads local JSON evidence only. It never calls Atlas, deployment hosts, provider APIs, render routes, or billing systems.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const evidenceRead = readJson(options.evidencePath);
  const handoffRead = readJson(options.productionHandoffPath);
  const evidenceChecks = evidenceChecksFor(evidenceRead.value);
  const handoffChecks = productionHandoffChecksFor(handoffRead.value, evidenceRead.value);
  const evidenceExecutions = evidenceRead.value && evidenceChecks.every((item) => item.status === "pass")
    ? summarizeExecutions(evidenceRead.value.executions)
    : emptyExecutionSummary();
  const confirmationChecks = [
    options.confirmLiveProviderActions
      ? pass("live_provider_actions_confirmed", "Operator confirmed this packet came from live provider action execution.")
      : fail("live_provider_actions_confirmed", "--confirm-live-provider-actions is required before this packet can pass.")
  ];
  const checks = [
    evidenceRead.exists
      ? pass("live_action_evidence_file_present", "Live provider action evidence file is present.")
      : fail("live_action_evidence_file_present", `Missing live provider action evidence at ${toRepoRelative(options.evidencePath)}.`),
    ...(evidenceRead.error ? [fail("live_action_evidence_json", `Evidence JSON is invalid: ${redactText(evidenceRead.error)}.`)] : []),
    handoffRead.exists
      ? pass("production_handoff_report_present", "Production handoff capture report is present.")
      : fail("production_handoff_report_present", `Missing production handoff report at ${toRepoRelative(options.productionHandoffPath)}.`),
    ...(handoffRead.error ? [fail("production_handoff_report_json", `Production handoff report JSON is invalid: ${redactText(handoffRead.error)}.`)] : []),
    ...evidenceChecks,
    ...handoffChecks,
    ...confirmationChecks,
    evidenceExecutions.resumePollingEvidenceCount > 0
      ? pass("resume_polling_live_evidence_present", "At least one live resume-polling provider action is archived.")
      : fail("resume_polling_live_evidence_present", "At least one resume_polling action with provider-call evidence is required."),
    evidenceExecutions.terminalCloseEvidenceCount + evidenceExecutions.manualAuditEvidenceCount > 0
      ? pass("terminal_or_manual_live_evidence_present", "Terminal closeout or manual-audit handoff evidence is archived.")
      : fail("terminal_or_manual_live_evidence_present", "Terminal closeout or manual-audit live action evidence is required."),
    evidenceExecutions.redactionReviewedCount === evidenceExecutions.evidenceExecutionCount && evidenceExecutions.evidenceExecutionCount > 0
      ? pass("all_live_actions_redaction_reviewed", "Every live action evidence item has explicit redaction review.")
      : fail("all_live_actions_redaction_reviewed", "Every live action evidence item must set redactionReviewed=true.")
  ];
  const status = statusFor({ evidenceRead, checks, confirmLiveProviderActions: options.confirmLiveProviderActions });
  const graphResumeEvidencePass = status === "pass" && evidenceExecutions.graphResumeEvidenceCount > 0;
  const report = {
    schemaVersion: "cinejelly.render-provider-live-actions.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      evidencePath: toRepoRelative(options.evidencePath),
      productionHandoffPath: toRepoRelative(options.productionHandoffPath),
      outputPath: toRepoRelative(options.outputPath),
      evidenceConfigured: evidenceRead.exists,
      productionHandoffReportPresent: handoffRead.exists,
      confirmLiveProviderActions: options.confirmLiveProviderActions
    },
    summary: {
      ...evidenceExecutions,
      productionHandoffStatus: String(handoffRead.value?.status ?? "missing"),
      productionHandoffUsable: handoffRead.value?.releaseGateSummary?.canUseAsProductionHandoffEvidence === true,
      productionHandoffDeploymentMatch: deploymentBaseUrlMatchesHandoff(evidenceRead.value, handoffRead.value),
      canUseAsLiveProviderActionEvidence: status === "pass",
      canUseAsGraphResumeEvidence: graphResumeEvidencePass,
      canClaimDistributedResume: false
    },
    evidence: publicEvidenceSummary(evidenceRead.value),
    executions: evidenceRead.value && evidenceChecks.every((item) => item.status === "pass")
      ? evidenceRead.value.executions.map(publicExecution)
      : [],
    checks,
    releaseGateSummary: {
      liveProviderActionEvidencePass: status === "pass",
      graphResumeEvidencePass,
      canUseAsDistributedResumeEvidence: graphResumeEvidencePass,
      canClaimDistributedResume: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? graphResumeEvidencePass
          ? "Live provider action and graph-resume enqueue evidence are archived, but distributed resume still requires deployed multi-worker ownership proof and the full business-readiness gate."
          : "Live provider action evidence is archived, but graph-resume enqueue evidence, deployed multi-worker ownership proof, and the full business-readiness gate are still required."
        : "Live provider action evidence is missing, unconfirmed, or incomplete."
    },
    nextActions: nextActionsFor({ status, checks, options, graphResumeEvidencePass })
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.evidencePath).toLowerCase() !== ".json") {
    throw new Error("--evidence must point to a JSON file.");
  }
  if (extname(options.productionHandoffPath).toLowerCase() !== ".json") {
    throw new Error("--production-handoff-report must point to a JSON file.");
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
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
      value: JSON.parse(readFileSync(absolutePath, "utf8"))
    };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function evidenceChecksFor(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [];
  }
  const checks = [
    unknownKeys(evidence, evidenceKeys).length === 0
      ? pass("evidence.no_unknown_fields", "Live action evidence has no template-only or unknown top-level fields.")
      : fail("evidence.no_unknown_fields", `Live action evidence contains unsupported top-level fields: ${unknownKeys(evidence, evidenceKeys).join(", ")}.`),
    evidence.schemaVersion === "cinejelly.render-provider-live-action-evidence.v1"
      ? pass("evidence.schema", "Live action evidence schema is recognized.")
      : fail("evidence.schema", "schemaVersion must be cinejelly.render-provider-live-action-evidence.v1."),
    evidence.environmentKind === "deployment"
      ? pass("evidence.environment_kind", "Live action evidence is marked as deployment evidence.")
      : fail("evidence.environment_kind", "environmentKind must be deployment."),
    safeHttpsDeploymentUrl(evidence.deploymentBaseUrl)
      ? pass("evidence.deployment_base_url", "Deployment base URL is clean HTTPS and non-localhost.")
      : fail("evidence.deployment_base_url", "deploymentBaseUrl must be clean HTTPS, non-localhost, and free of credentials/query/fragment."),
    safeRequiredText(evidence.approvedBy)
      ? pass("evidence.approved_by", "Evidence approval owner is present.")
      : fail("evidence.approved_by", "approvedBy is required and must be a safe non-secret string."),
    isDateTime(evidence.approvedAt)
      ? pass("evidence.approved_at", "Evidence approval time is valid.")
      : fail("evidence.approved_at", "approvedAt must be an ISO date-time string."),
    Array.isArray(evidence.executions) && evidence.executions.length > 0
      ? pass("evidence.executions_present", "Live action execution evidence entries are present.")
      : fail("evidence.executions_present", "executions must contain at least one live action evidence item.")
  ];
  if (Array.isArray(evidence.executions)) {
    for (const [index, execution] of evidence.executions.entries()) {
      checks.push(...executionChecks(execution, index));
    }
  }
  return checks;
}

function executionChecks(execution, index) {
  const prefix = `evidence.executions[${index}]`;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    return [fail(prefix, `${prefix} must be an object.`)];
  }
  return [
    unknownKeys(execution, executionKeys).length === 0
      ? pass(`${prefix}.no_unknown_fields`, "Execution evidence has no template-only or unknown fields.")
      : fail(`${prefix}.no_unknown_fields`, `${prefix} contains unsupported fields: ${unknownKeys(execution, executionKeys).join(", ")}.`),
    safeIdentifier(execution.actionId)
      ? pass(`${prefix}.action_id`, "Action ID is safe.")
      : fail(`${prefix}.action_id`, "actionId must be a safe non-empty identifier."),
    safeIdentifier(execution.jobId)
      ? pass(`${prefix}.job_id`, "Job ID is safe.")
      : fail(`${prefix}.job_id`, "jobId must be a safe non-empty identifier."),
    workerActions.has(execution.action)
      ? pass(`${prefix}.action`, "Worker action is supported.")
      : fail(`${prefix}.action`, "action is not supported."),
    Array.isArray(execution.predictionIds) && execution.predictionIds.length > 0 && execution.predictionIds.every(safeIdentifier)
      ? pass(`${prefix}.prediction_ids`, "Prediction IDs are present and safe.")
      : fail(`${prefix}.prediction_ids`, "predictionIds must contain safe provider prediction IDs."),
    safeIdentifier(execution.provider)
      ? pass(`${prefix}.provider`, "Provider label is safe.")
      : fail(`${prefix}.provider`, "provider must be a safe non-empty string."),
    providerCallKinds.has(execution.providerCallKind)
      ? pass(`${prefix}.provider_call_kind`, "Provider call kind is supported.")
      : fail(`${prefix}.provider_call_kind`, "providerCallKind is not supported."),
    execution.providerCallMade === true
      ? pass(`${prefix}.provider_call_made`, "Provider call evidence is explicitly present.")
      : fail(`${prefix}.provider_call_made`, "providerCallMade must be true for live action evidence."),
    resultStatuses.has(execution.resultStatus)
      ? pass(`${prefix}.result_status`, "Result status is supported.")
      : fail(`${prefix}.result_status`, "resultStatus is not supported."),
    isDateTime(execution.executedAt)
      ? pass(`${prefix}.executed_at`, "Execution time is valid.")
      : fail(`${prefix}.executed_at`, "executedAt must be an ISO date-time string."),
    safeRequiredText(execution.evidenceSummary)
      ? pass(`${prefix}.evidence_summary`, "Evidence summary is safe.")
      : fail(`${prefix}.evidence_summary`, "evidenceSummary must be safe and must not include URLs, local paths, or secrets."),
    execution.redactionReviewed === true
      ? pass(`${prefix}.redaction_reviewed`, "Redaction was reviewed.")
      : fail(`${prefix}.redaction_reviewed`, "redactionReviewed must be true."),
    execution.rawProviderPayloadStored === false
      ? pass(`${prefix}.raw_payload_not_stored`, "Raw provider payload is not stored.")
      : fail(`${prefix}.raw_payload_not_stored`, "rawProviderPayloadStored must be false."),
    execution.outputUrlsStored === false
      ? pass(`${prefix}.output_urls_not_stored`, "Provider output URLs are not stored.")
      : fail(`${prefix}.output_urls_not_stored`, "outputUrlsStored must be false."),
    ...executionRelationshipChecks(execution, prefix)
  ];
}

function executionRelationshipChecks(execution, prefix) {
  if (
    !workerActions.has(execution.action) ||
    !providerCallKinds.has(execution.providerCallKind) ||
    !resultStatuses.has(execution.resultStatus)
  ) {
    return [];
  }
  if (execution.action === "resume_polling") {
    const validKind = execution.providerCallKind === "prediction_poll" || execution.providerCallKind === "graph_resume_enqueue";
    const validStatus = execution.resultStatus === "still_active" || execution.resultStatus === "resume_enqueued";
    const graphResumePairValid =
      execution.providerCallKind === "graph_resume_enqueue"
        ? execution.resultStatus === "resume_enqueued"
        : execution.resultStatus !== "resume_enqueued";
    return [
      validKind && validStatus && graphResumePairValid
        ? pass(`${prefix}.action_kind_result_consistency`, "Resume-polling action/kind/result relationship is consistent.")
        : fail(`${prefix}.action_kind_result_consistency`, "resume_polling must use prediction_poll/still_active or graph_resume_enqueue/resume_enqueued.")
    ];
  }
  if (typeof execution.action === "string" && execution.action.startsWith("close_terminal_")) {
    const validKind = execution.providerCallKind === "terminal_closeout" || execution.providerCallKind === "provider_cancel_or_close";
    const validStatus = execution.action === "close_terminal_succeeded"
      ? execution.resultStatus === "closeout_recorded" || execution.resultStatus === "succeeded"
      : execution.resultStatus === "closeout_recorded" || execution.resultStatus === "terminal_failed";
    return [
      validKind && validStatus
        ? pass(`${prefix}.action_kind_result_consistency`, "Terminal-close action/kind/result relationship is consistent.")
        : fail(`${prefix}.action_kind_result_consistency`, "close_terminal_* must use terminal close/cancel evidence and a terminal closeout result.")
    ];
  }
  if (execution.action === "manual_audit_required") {
    return [
      execution.providerCallKind === "manual_audit_enqueue" && execution.resultStatus === "manual_audit_queued"
        ? pass(`${prefix}.action_kind_result_consistency`, "Manual-audit action/kind/result relationship is consistent.")
        : fail(`${prefix}.action_kind_result_consistency`, "manual_audit_required must use manual_audit_enqueue/manual_audit_queued.")
    ];
  }
  return [];
}

function productionHandoffChecksFor(report, evidence) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return [];
  }
  const deploymentMatch = deploymentBaseUrlMatchesHandoff(evidence, report);
  return [
    report.schemaVersion === "cinejelly.render-provider-production-handoff-capture.v1"
      ? pass("production_handoff.schema", "Production handoff capture schema is recognized.")
      : fail("production_handoff.schema", "Production handoff report schema is not recognized."),
    report.status === "pass"
      ? pass("production_handoff.status", "Production handoff capture passed.")
      : fail("production_handoff.status", "Production handoff capture must pass before live action evidence can be accepted."),
    report.environmentKind === "deployment"
      ? pass("production_handoff.environment_kind", "Production handoff capture was recorded against deployment.")
      : fail("production_handoff.environment_kind", "Production handoff capture must be deployment evidence."),
    report.releaseGateSummary?.canUseAsProductionHandoffEvidence === true
      ? pass("production_handoff.usable", "Production handoff capture is usable as deployment evidence.")
      : fail("production_handoff.usable", "Production handoff capture must be usable as deployment evidence."),
    deploymentMatch
      ? pass("production_handoff.deployment_binding", "Live action evidence is bound to the same deployment base URL fingerprint as production handoff.")
      : fail("production_handoff.deployment_binding", "Live action evidence deploymentBaseUrl must match production handoff deploymentBaseUrlSha256.")
  ];
}

function summarizeExecutions(executions) {
  const entries = Array.isArray(executions) ? executions : [];
  return {
    evidenceExecutionCount: entries.length,
    providerCallEvidenceCount: entries.filter((item) => item?.providerCallMade === true).length,
    resumePollingEvidenceCount: entries.filter((item) => item?.action === "resume_polling").length,
    graphResumeEvidenceCount: entries.filter(isGraphResumeExecution).length,
    terminalCloseEvidenceCount: entries.filter((item) => typeof item?.action === "string" && item.action.startsWith("close_terminal_")).length,
    manualAuditEvidenceCount: entries.filter((item) => item?.action === "manual_audit_required").length,
    redactionReviewedCount: entries.filter((item) => item?.redactionReviewed === true).length
  };
}

function isGraphResumeExecution(item) {
  return item?.action === "resume_polling" &&
    item?.providerCallKind === "graph_resume_enqueue" &&
    item?.resultStatus === "resume_enqueued" &&
    item?.providerCallMade === true;
}

function emptyExecutionSummary() {
  return {
    evidenceExecutionCount: 0,
    providerCallEvidenceCount: 0,
    resumePollingEvidenceCount: 0,
    graphResumeEvidenceCount: 0,
    terminalCloseEvidenceCount: 0,
    manualAuditEvidenceCount: 0,
    redactionReviewedCount: 0
  };
}

function statusFor({ evidenceRead, checks, confirmLiveProviderActions }) {
  if (!evidenceRead.exists) {
    return "blocked_by_missing_inputs";
  }
  const failures = checks.filter((item) => item.status === "fail");
  const nonConfirmationFailures = failures.filter((item) => item.name !== "live_provider_actions_confirmed");
  if (nonConfirmationFailures.length > 0) {
    return "fail";
  }
  if (!confirmLiveProviderActions) {
    return "blocked_by_confirmation";
  }
  return failures.length > 0 ? "fail" : "pass";
}

function publicEvidenceSummary(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      configured: false
    };
  }
  return {
    configured: true,
    schemaVersion: typeof evidence.schemaVersion === "string" ? evidence.schemaVersion : "unknown",
    environmentKind: typeof evidence.environmentKind === "string" ? evidence.environmentKind : "unknown",
    deploymentBaseUrl: safePublicUrl(evidence.deploymentBaseUrl),
    deploymentBaseUrlSha256: safeDeploymentBaseUrlSha256(evidence.deploymentBaseUrl),
    approvedBy: safePublicText(evidence.approvedBy),
    approvedAt: typeof evidence.approvedAt === "string" ? evidence.approvedAt : "unknown",
    executionCount: Array.isArray(evidence.executions) ? evidence.executions.length : 0
  };
}

function publicExecution(execution) {
  return {
    actionId: String(execution.actionId),
    jobId: String(execution.jobId),
    action: String(execution.action),
    provider: String(execution.provider),
    providerCallKind: String(execution.providerCallKind),
    providerCallMade: execution.providerCallMade === true,
    resultStatus: String(execution.resultStatus),
    executedAt: String(execution.executedAt),
    predictionIdCount: Array.isArray(execution.predictionIds) ? execution.predictionIds.length : 0,
    evidenceSummary: safePublicText(execution.evidenceSummary),
    redactionReviewed: execution.redactionReviewed === true,
    rawProviderPayloadStored: execution.rawProviderPayloadStored === true,
    outputUrlsStored: execution.outputUrlsStored === true
  };
}

function nextActionsFor({ status, checks, options, graphResumeEvidencePass }) {
  const actions = [];
  if (status === "blocked_by_missing_inputs") {
    actions.push(`Create ignored live provider action evidence at ${toRepoRelative(options.evidencePath)} after a real deployment worker executes provider handoff actions.`);
  }
  if (status === "blocked_by_confirmation") {
    actions.push("Rerun with --confirm-live-provider-actions only after verifying the evidence came from live provider callbacks.");
  }
  for (const checkResult of checks) {
    if (checkResult.status === "fail") {
      actions.push(checkResult.message);
    }
  }
  if (status === "pass") {
    actions.push("Archive this report with production handoff and business-readiness evidence.");
    actions.push(graphResumeEvidencePass
      ? "Prove deployed multi-worker ownership handoff before any distributed-resume claim."
      : "Provide graph_resume_enqueue live evidence and deployed multi-worker ownership proof before any distributed-resume claim.");
  }
  return [...new Set(actions)];
}

function safeHttpsDeploymentUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !isLocalhost(url.hostname);
  } catch {
    return false;
  }
}

function safePublicUrl(value) {
  if (!safeHttpsDeploymentUrl(value)) {
    return "invalid_or_missing";
  }
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//[deployment-host]${path}`.replace(/\/$/, "");
}

function deploymentBaseUrlMatchesHandoff(evidence, report) {
  const evidenceHash = safeDeploymentBaseUrlSha256(evidence?.deploymentBaseUrl);
  const handoffHash = typeof report?.checkedInputs?.deploymentBaseUrlSha256 === "string"
    ? report.checkedInputs.deploymentBaseUrlSha256
    : undefined;
  return Boolean(evidenceHash && handoffHash && evidenceHash === handoffHash);
}

function safeDeploymentBaseUrlSha256(value) {
  if (!safeHttpsDeploymentUrl(value)) {
    return undefined;
  }
  return createHash("sha256").update(canonicalBaseUrl(new URL(value))).digest("hex");
}

function canonicalBaseUrl(baseUrl) {
  const next = new URL(baseUrl.href);
  next.protocol = next.protocol.toLowerCase();
  next.hostname = next.hostname.toLowerCase();
  next.pathname = next.pathname.replace(/\/+$/, "");
  next.search = "";
  next.hash = "";
  next.username = "";
  next.password = "";
  return next.href.replace(/\/$/, "");
}

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function safeIdentifier(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !containsSecretLikeText(value) &&
    !containsPlaceholderText(value);
}

function safeRequiredText(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 500 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !containsSecretLikeText(value) &&
    !containsPlaceholderText(value);
}

function safePublicText(value) {
  return safeRequiredText(value) ? String(value).trim() : "redacted_or_invalid";
}

function containsSecretLikeText(value) {
  const text = String(value);
  return secretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function containsPlaceholderText(value) {
  const text = String(value);
  return placeholderPatterns.some((pattern) => pattern.test(text));
}

function unknownKeys(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).filter((key) => !allowedKeys.has(key));
}

function isDateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value.includes("T");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeReport(outputPath, report) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), String(value));
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
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
