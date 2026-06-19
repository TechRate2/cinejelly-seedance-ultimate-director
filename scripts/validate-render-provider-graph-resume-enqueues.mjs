#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/render-provider-graph-resume-enqueues.json",
  liveActionsReportPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json",
  outputPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json"
};

const evidenceKeys = new Set([
  "schemaVersion",
  "environmentKind",
  "deploymentBaseUrl",
  "approvedBy",
  "approvedAt",
  "enqueues"
]);

const enqueueKeys = new Set([
  "enqueueId",
  "actionId",
  "jobId",
  "graphRunKind",
  "idempotencyKey",
  "queueNameSha256",
  "graphStateSha256",
  "resumeCursorSha256",
  "predictionIdsSha256",
  "predictionIdCount",
  "resultStatus",
  "enqueuedAt",
  "evidenceSummary",
  "redactionReviewed",
  "rawGraphStateStored",
  "rawProviderPayloadStored",
  "outputUrlsStored"
]);

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

const placeholderPatterns = [
  /replace[-_\s]?with/i,
  /placeholder/i,
  /\btodo\b/i,
  /\btbd\b/i
];

function parseArgs(args) {
  const options = {
    ...defaults,
    confirmGraphResumeEnqueues: false,
    writeReport: true
  };
  const flagMap = new Map([
    ["--evidence", "evidencePath"],
    ["--live-actions-report", "liveActionsReportPath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-graph-resume-enqueues") {
      options.confirmGraphResumeEnqueues = true;
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
  console.log(`Validate archived render-provider graph-resume enqueue evidence without network or provider calls.

Usage:
  npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues

Options:
  --evidence <path>                    Operator-owned graph-resume enqueue evidence JSON. Default: ${defaults.evidencePath}
  --live-actions-report <path>         Live action validation report. Default: ${defaults.liveActionsReportPath}
  --confirm-graph-resume-enqueues      Required before a valid enqueue packet can pass.
  --output <path>                      JSON report path. Default: ${defaults.outputPath}
  --no-output                          Print only; do not write the report.

This validator reads local JSON evidence only. It never calls Atlas, deployment hosts, provider APIs, render routes, queue backends, or billing systems.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const evidenceRead = readJson(options.evidencePath);
  const liveActionsRead = readJson(options.liveActionsReportPath);
  const evidenceChecks = evidenceChecksFor(evidenceRead.value);
  const liveActionChecks = liveActionReportChecksFor(liveActionsRead.value, evidenceRead.value);
  const enqueueSummary = evidenceRead.value && evidenceChecks.every((item) => item.status === "pass")
    ? summarizeEnqueues(evidenceRead.value.enqueues, liveActionsRead.value)
    : emptyEnqueueSummary();
  const confirmationChecks = [
    options.confirmGraphResumeEnqueues
      ? pass("graph_resume_enqueues_confirmed", "Operator confirmed this packet came from live graph-resume enqueue execution.")
      : fail("graph_resume_enqueues_confirmed", "--confirm-graph-resume-enqueues is required before this packet can pass.")
  ];
  const checks = [
    evidenceRead.exists
      ? pass("graph_resume_enqueue_evidence_file_present", "Graph-resume enqueue evidence file is present.")
      : fail("graph_resume_enqueue_evidence_file_present", `Missing graph-resume enqueue evidence at ${toRepoRelative(options.evidencePath)}.`),
    ...(evidenceRead.error ? [fail("graph_resume_enqueue_evidence_json", `Evidence JSON is invalid: ${redactText(evidenceRead.error)}.`)] : []),
    liveActionsRead.exists
      ? pass("live_actions_report_present", "Live provider action report is present.")
      : fail("live_actions_report_present", `Missing live action report at ${toRepoRelative(options.liveActionsReportPath)}.`),
    ...(liveActionsRead.error ? [fail("live_actions_report_json", `Live action report JSON is invalid: ${redactText(liveActionsRead.error)}.`)] : []),
    ...evidenceChecks,
    ...liveActionChecks,
    ...confirmationChecks,
    enqueueSummary.enqueueCount > 0
      ? pass("graph_resume_enqueue_entries_present", "Graph-resume enqueue evidence entries are present.")
      : fail("graph_resume_enqueue_entries_present", "At least one graph-resume enqueue entry is required."),
    enqueueSummary.matchedLiveGraphResumeExecutionCount === enqueueSummary.enqueueCount && enqueueSummary.enqueueCount > 0
      ? pass("graph_resume_enqueues_match_live_actions", "Every graph-resume enqueue entry matches a live action graph-resume execution by actionId and jobId.")
      : fail("graph_resume_enqueues_match_live_actions", "Every graph-resume enqueue entry must match a live action graph_resume_enqueue execution by actionId and jobId."),
    enqueueSummary.redactionReviewedCount === enqueueSummary.enqueueCount && enqueueSummary.enqueueCount > 0
      ? pass("all_graph_resume_enqueues_redaction_reviewed", "Every graph-resume enqueue entry has explicit redaction review.")
      : fail("all_graph_resume_enqueues_redaction_reviewed", "Every graph-resume enqueue entry must set redactionReviewed=true.")
  ];
  const status = statusFor({ evidenceRead, checks, confirmGraphResumeEnqueues: options.confirmGraphResumeEnqueues });
  const graphResumePayloadPass = status === "pass";
  const report = {
    schemaVersion: "cinejelly.render-provider-graph-resume-enqueues.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    queueCallsMade: false,
    checkedInputs: {
      evidencePath: toRepoRelative(options.evidencePath),
      liveActionsReportPath: toRepoRelative(options.liveActionsReportPath),
      outputPath: toRepoRelative(options.outputPath),
      evidenceConfigured: evidenceRead.exists,
      liveActionsReportPresent: liveActionsRead.exists,
      confirmGraphResumeEnqueues: options.confirmGraphResumeEnqueues
    },
    summary: {
      ...enqueueSummary,
      liveActionsStatus: String(liveActionsRead.value?.status ?? "missing"),
      liveActionsGraphResumeEvidenceUsable: liveActionsRead.value?.summary?.canUseAsGraphResumeEvidence === true,
      deploymentBindingMatch: deploymentBaseUrlMatchesLiveActions(evidenceRead.value, liveActionsRead.value),
      canUseAsGraphResumePayloadEvidence: graphResumePayloadPass,
      canClaimDistributedResume: false
    },
    evidence: publicEvidenceSummary(evidenceRead.value),
    enqueues: evidenceRead.value && evidenceChecks.every((item) => item.status === "pass")
      ? evidenceRead.value.enqueues.map(publicEnqueue)
      : [],
    checks,
    releaseGateSummary: {
      graphResumePayloadEvidencePass: graphResumePayloadPass,
      canUseAsGraphResumePayloadEvidence: graphResumePayloadPass,
      canUseAsDistributedResumeEvidence: false,
      canClaimDistributedResume: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: graphResumePayloadPass
        ? "Graph-resume enqueue payload evidence is archived and bound to live action evidence, but distributed resume still requires deployed multi-worker ownership proof and the full business-readiness gate."
        : "Graph-resume enqueue payload evidence is missing, unconfirmed, unsafe, or not bound to usable live action graph-resume evidence."
    },
    nextActions: nextActionsFor({ status, checks, options })
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--evidence", options.evidencePath],
    ["--live-actions-report", options.liveActionsReportPath],
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

function evidenceChecksFor(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [];
  }
  const checks = [
    unknownKeys(evidence, evidenceKeys).length === 0
      ? pass("evidence.no_unknown_fields", "Graph-resume enqueue evidence has no template-only or unknown top-level fields.")
      : fail("evidence.no_unknown_fields", `Graph-resume enqueue evidence contains unsupported top-level fields: ${unknownKeys(evidence, evidenceKeys).join(", ")}.`),
    evidence.schemaVersion === "cinejelly.render-provider-graph-resume-enqueue-evidence.v1"
      ? pass("evidence.schema", "Graph-resume enqueue evidence schema is recognized.")
      : fail("evidence.schema", "schemaVersion must be cinejelly.render-provider-graph-resume-enqueue-evidence.v1."),
    evidence.environmentKind === "deployment"
      ? pass("evidence.environment_kind", "Graph-resume enqueue evidence is marked as deployment evidence.")
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
    Array.isArray(evidence.enqueues) && evidence.enqueues.length > 0
      ? pass("evidence.enqueues_present", "Graph-resume enqueue evidence entries are present.")
      : fail("evidence.enqueues_present", "enqueues must contain at least one graph-resume enqueue evidence item.")
  ];
  if (Array.isArray(evidence.enqueues)) {
    for (const [index, enqueue] of evidence.enqueues.entries()) {
      checks.push(...enqueueChecks(enqueue, index));
    }
    const enqueueIds = evidence.enqueues.map((item) => item?.enqueueId).filter(Boolean);
    const idempotencyKeys = evidence.enqueues.map((item) => item?.idempotencyKey).filter(Boolean);
    checks.push(
      new Set(enqueueIds).size === enqueueIds.length
        ? pass("evidence.enqueue_ids_unique", "Graph-resume enqueue IDs are unique.")
        : fail("evidence.enqueue_ids_unique", "Graph-resume enqueue IDs must be unique."),
      new Set(idempotencyKeys).size === idempotencyKeys.length
        ? pass("evidence.idempotency_keys_unique", "Graph-resume enqueue idempotency keys are unique.")
        : fail("evidence.idempotency_keys_unique", "Graph-resume enqueue idempotency keys must be unique.")
    );
  }
  return checks;
}

function enqueueChecks(enqueue, index) {
  const prefix = `evidence.enqueues[${index}]`;
  if (!enqueue || typeof enqueue !== "object" || Array.isArray(enqueue)) {
    return [fail(prefix, `${prefix} must be an object.`)];
  }
  return [
    unknownKeys(enqueue, enqueueKeys).length === 0
      ? pass(`${prefix}.no_unknown_fields`, "Graph-resume enqueue entry has no template-only or unknown fields.")
      : fail(`${prefix}.no_unknown_fields`, `${prefix} contains unsupported fields: ${unknownKeys(enqueue, enqueueKeys).join(", ")}.`),
    safeIdentifier(enqueue.enqueueId)
      ? pass(`${prefix}.enqueue_id`, "Enqueue ID is safe.")
      : fail(`${prefix}.enqueue_id`, "enqueueId must be a safe non-empty identifier."),
    safeIdentifier(enqueue.actionId)
      ? pass(`${prefix}.action_id`, "Action ID is safe.")
      : fail(`${prefix}.action_id`, "actionId must be a safe non-empty identifier."),
    safeIdentifier(enqueue.jobId)
      ? pass(`${prefix}.job_id`, "Job ID is safe.")
      : fail(`${prefix}.job_id`, "jobId must be a safe non-empty identifier."),
    enqueue.graphRunKind === "provider_work_resume"
      ? pass(`${prefix}.graph_run_kind`, "Graph run kind is provider_work_resume.")
      : fail(`${prefix}.graph_run_kind`, "graphRunKind must be provider_work_resume."),
    safeIdentifier(enqueue.idempotencyKey)
      ? pass(`${prefix}.idempotency_key`, "Idempotency key is safe.")
      : fail(`${prefix}.idempotency_key`, "idempotencyKey must be a safe non-empty identifier."),
    isSha256(enqueue.queueNameSha256)
      ? pass(`${prefix}.queue_name_sha256`, "Queue name digest is present.")
      : fail(`${prefix}.queue_name_sha256`, "queueNameSha256 must be a lowercase SHA-256 digest."),
    isSha256(enqueue.graphStateSha256)
      ? pass(`${prefix}.graph_state_sha256`, "Graph state digest is present.")
      : fail(`${prefix}.graph_state_sha256`, "graphStateSha256 must be a lowercase SHA-256 digest."),
    isSha256(enqueue.resumeCursorSha256)
      ? pass(`${prefix}.resume_cursor_sha256`, "Resume cursor digest is present.")
      : fail(`${prefix}.resume_cursor_sha256`, "resumeCursorSha256 must be a lowercase SHA-256 digest."),
    isSha256(enqueue.predictionIdsSha256)
      ? pass(`${prefix}.prediction_ids_sha256`, "Prediction ID digest is present.")
      : fail(`${prefix}.prediction_ids_sha256`, "predictionIdsSha256 must be a lowercase SHA-256 digest."),
    Number.isInteger(enqueue.predictionIdCount) && enqueue.predictionIdCount > 0
      ? pass(`${prefix}.prediction_id_count`, "Prediction ID count is positive.")
      : fail(`${prefix}.prediction_id_count`, "predictionIdCount must be a positive integer."),
    enqueue.resultStatus === "resume_enqueued"
      ? pass(`${prefix}.result_status`, "Result status is resume_enqueued.")
      : fail(`${prefix}.result_status`, "resultStatus must be resume_enqueued."),
    isDateTime(enqueue.enqueuedAt)
      ? pass(`${prefix}.enqueued_at`, "Enqueue time is valid.")
      : fail(`${prefix}.enqueued_at`, "enqueuedAt must be an ISO date-time string."),
    safeRequiredText(enqueue.evidenceSummary)
      ? pass(`${prefix}.evidence_summary`, "Evidence summary is safe.")
      : fail(`${prefix}.evidence_summary`, "evidenceSummary must be safe and must not include URLs, local paths, placeholders, or secrets."),
    enqueue.redactionReviewed === true
      ? pass(`${prefix}.redaction_reviewed`, "Redaction was reviewed.")
      : fail(`${prefix}.redaction_reviewed`, "redactionReviewed must be true."),
    enqueue.rawGraphStateStored === false
      ? pass(`${prefix}.raw_graph_state_not_stored`, "Raw graph state is not stored.")
      : fail(`${prefix}.raw_graph_state_not_stored`, "rawGraphStateStored must be false."),
    enqueue.rawProviderPayloadStored === false
      ? pass(`${prefix}.raw_payload_not_stored`, "Raw provider payload is not stored.")
      : fail(`${prefix}.raw_payload_not_stored`, "rawProviderPayloadStored must be false."),
    enqueue.outputUrlsStored === false
      ? pass(`${prefix}.output_urls_not_stored`, "Provider output URLs are not stored.")
      : fail(`${prefix}.output_urls_not_stored`, "outputUrlsStored must be false.")
  ];
}

function liveActionReportChecksFor(report, evidence) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return [];
  }
  const liveGraphResumeExecutions = liveGraphResumeExecutionsFor(report);
  return [
    report.schemaVersion === "cinejelly.render-provider-live-actions.v1"
      ? pass("live_actions.schema", "Live action report schema is recognized.")
      : fail("live_actions.schema", "Live action report schema is not recognized."),
    report.status === "pass"
      ? pass("live_actions.status", "Live action report passed.")
      : fail("live_actions.status", "Live action report must pass before graph-resume payload evidence can be accepted."),
    report.summary?.canUseAsGraphResumeEvidence === true
      ? pass("live_actions.graph_resume_usable", "Live action graph-resume evidence is usable.")
      : fail("live_actions.graph_resume_usable", "Live action report must include usable graph-resume evidence."),
    liveGraphResumeExecutions.length > 0
      ? pass("live_actions.graph_resume_execution_present", "Live action report contains graph-resume execution evidence.")
      : fail("live_actions.graph_resume_execution_present", "Live action report must contain graph_resume_enqueue/resume_enqueued execution evidence."),
    deploymentBaseUrlMatchesLiveActions(evidence, report)
      ? pass("live_actions.deployment_binding", "Graph-resume enqueue evidence is bound to the same deployment fingerprint as live action evidence.")
      : fail("live_actions.deployment_binding", "Graph-resume enqueue deploymentBaseUrl must match live action evidence deploymentBaseUrlSha256.")
  ];
}

function summarizeEnqueues(enqueues, liveActionsReport) {
  const entries = Array.isArray(enqueues) ? enqueues : [];
  const livePairs = new Set(liveGraphResumeExecutionsFor(liveActionsReport).map((item) => `${item.actionId}\u0000${item.jobId}`));
  return {
    enqueueCount: entries.length,
    matchedLiveGraphResumeExecutionCount: entries.filter((item) => livePairs.has(`${item?.actionId}\u0000${item?.jobId}`)).length,
    redactionReviewedCount: entries.filter((item) => item?.redactionReviewed === true).length
  };
}

function emptyEnqueueSummary() {
  return {
    enqueueCount: 0,
    matchedLiveGraphResumeExecutionCount: 0,
    redactionReviewedCount: 0
  };
}

function liveGraphResumeExecutionsFor(report) {
  const executions = Array.isArray(report?.executions) ? report.executions : [];
  return executions.filter((item) =>
    item?.action === "resume_polling" &&
    item?.providerCallKind === "graph_resume_enqueue" &&
    item?.resultStatus === "resume_enqueued" &&
    item?.providerCallMade === true
  );
}

function statusFor({ evidenceRead, checks, confirmGraphResumeEnqueues }) {
  if (!evidenceRead.exists) {
    return "blocked_by_missing_inputs";
  }
  const failures = checks.filter((item) => item.status === "fail");
  const nonConfirmationFailures = failures.filter((item) => item.name !== "graph_resume_enqueues_confirmed");
  if (nonConfirmationFailures.length > 0) {
    return "fail";
  }
  if (!confirmGraphResumeEnqueues) {
    return "blocked_by_confirmation";
  }
  return failures.length > 0 ? "fail" : "pass";
}

function publicEvidenceSummary(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { configured: false };
  }
  return {
    configured: true,
    schemaVersion: typeof evidence.schemaVersion === "string" ? evidence.schemaVersion : "unknown",
    environmentKind: typeof evidence.environmentKind === "string" ? evidence.environmentKind : "unknown",
    deploymentBaseUrl: safePublicUrl(evidence.deploymentBaseUrl),
    deploymentBaseUrlSha256: safeDeploymentBaseUrlSha256(evidence.deploymentBaseUrl),
    approvedBy: safePublicText(evidence.approvedBy),
    approvedAt: typeof evidence.approvedAt === "string" ? evidence.approvedAt : "unknown",
    enqueueCount: Array.isArray(evidence.enqueues) ? evidence.enqueues.length : 0
  };
}

function publicEnqueue(enqueue) {
  return {
    enqueueId: String(enqueue.enqueueId),
    actionId: String(enqueue.actionId),
    jobId: String(enqueue.jobId),
    graphRunKind: String(enqueue.graphRunKind),
    resultStatus: String(enqueue.resultStatus),
    predictionIdCount: Number(enqueue.predictionIdCount ?? 0),
    enqueuedAt: String(enqueue.enqueuedAt),
    queueNameSha256: String(enqueue.queueNameSha256),
    graphStateSha256: String(enqueue.graphStateSha256),
    resumeCursorSha256: String(enqueue.resumeCursorSha256),
    predictionIdsSha256: String(enqueue.predictionIdsSha256),
    evidenceSummary: safePublicText(enqueue.evidenceSummary),
    redactionReviewed: enqueue.redactionReviewed === true,
    rawGraphStateStored: enqueue.rawGraphStateStored === true,
    rawProviderPayloadStored: enqueue.rawProviderPayloadStored === true,
    outputUrlsStored: enqueue.outputUrlsStored === true
  };
}

function nextActionsFor({ status, checks, options }) {
  const actions = [];
  if (status === "blocked_by_missing_inputs") {
    actions.push(`Create ignored graph-resume enqueue evidence at ${toRepoRelative(options.evidencePath)} after a real deployment worker enqueues graph resume.`);
  }
  if (status === "blocked_by_confirmation") {
    actions.push("Rerun with --confirm-graph-resume-enqueues only after verifying the packet came from live graph-resume enqueue execution.");
  }
  for (const checkResult of checks) {
    if (checkResult.status === "fail") {
      actions.push(checkResult.message);
    }
  }
  if (status === "pass") {
    actions.push("Archive this report with live action, production handoff, and business-readiness evidence.");
    actions.push("Keep distributed-resume parity unclaimed until deployed multi-worker ownership proof and the full business-readiness gate pass.");
  }
  return [...new Set(actions)];
}

function deploymentBaseUrlMatchesLiveActions(evidence, report) {
  const evidenceHash = safeDeploymentBaseUrlSha256(evidence?.deploymentBaseUrl);
  const liveActionsHash = typeof report?.evidence?.deploymentBaseUrlSha256 === "string"
    ? report.evidence.deploymentBaseUrlSha256
    : undefined;
  return Boolean(evidenceHash && liveActionsHash && evidenceHash === liveActionsHash);
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

function safeRequiredText(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= 500 &&
    !/[\u0000-\u001f\u007f]/.test(trimmed) &&
    !anyPatternMatches(placeholderPatterns, trimmed) &&
    !anyPatternMatches(secretPatterns, trimmed);
}

function safePublicText(value) {
  return safeRequiredText(value) ? value.trim() : "invalid_or_redacted";
}

function safeIdentifier(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !anyPatternMatches(secretPatterns, value) &&
    !anyPatternMatches(placeholderPatterns, value);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isDateTime(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}

function unknownKeys(value, knownKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).filter((key) => !knownKeys.has(key));
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function redactText(value) {
  let text = String(value ?? "");
  for (const pattern of secretPatterns) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

function anyPatternMatches(patterns, text) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
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

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost");
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
