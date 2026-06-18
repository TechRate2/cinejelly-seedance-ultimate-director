#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const endpointPath = "/v1/render-provider-handoff-leases";

const defaults = {
  baseUrl: process.env.CINEJELLY_RENDER_PROVIDER_HANDOFF_BASE_URL || process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  authTokenEnv: "CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN",
  fallbackAuthTokenEnv: "CINEJELLY_API_AUTH_TOKEN",
  outputPath: "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json",
  timeoutMs: 15_000,
  ttlMs: 2_000
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi
];
const publicTextBlocklistPatterns = [
  ...secretPatterns,
  /[A-Za-z]:\\[^\s"'<>]+/g,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/gi,
  /data:[^\s"'<>]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

function parseArgs(args) {
  const options = {
    baseUrl: defaults.baseUrl,
    authTokenEnv: defaults.authTokenEnv,
    fallbackAuthTokenEnv: defaults.fallbackAuthTokenEnv,
    outputPath: defaults.outputPath,
    timeoutMs: defaults.timeoutMs,
    ttlMs: defaults.ttlMs,
    writeReport: true
  };
  const flagMap = new Map([
    ["--base-url", "baseUrl"],
    ["--auth-token-env", "authTokenEnv"],
    ["--fallback-auth-token-env", "fallbackAuthTokenEnv"],
    ["--environment-kind", "environmentKind"],
    ["--job-id", "jobId"],
    ["--output", "outputPath"],
    ["--timeout-ms", "timeoutMs"],
    ["--ttl-ms", "ttlMs"]
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
    if (arg === "--no-auth-fallback") {
      options.fallbackAuthTokenEnv = undefined;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = key === "timeoutMs" || key === "ttlMs" ? Number.parseInt(rawValue, 10) : rawValue;
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
  console.log(`Capture render-provider production handoff evidence without provider spend.

Usage:
  npm.cmd run validation:provider-production-handoff -- --base-url https://cinejelly.example.com

Options:
  --base-url <url>                    Deployment API origin. Can also use CINEJELLY_RENDER_PROVIDER_HANDOFF_BASE_URL or CINEJELLY_DEPLOYMENT_BASE_URL.
  --auth-token-env <name>             Env var containing the deployment token. Default: ${defaults.authTokenEnv}
  --fallback-auth-token-env <name>    Fallback env var. Default: ${defaults.fallbackAuthTokenEnv}
  --no-auth-fallback                  Do not fallback to CINEJELLY_API_AUTH_TOKEN.
  --environment-kind <kind>           deployment or local. Defaults to deployment for HTTPS non-localhost, local for localhost.
  --job-id <id>                       Optional safe probe job ID. A generated probe ID is used by default.
  --ttl-ms <ms>                       Lease TTL for the probe. Default: ${defaults.ttlMs}
  --timeout-ms <ms>                   Per-request timeout. Default: ${defaults.timeoutMs}
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --no-output                         Print only; do not write the report.

This command only calls ${endpointPath}/{acquire,heartbeat,release,leases,active}.
It never submits render work, initializes Atlas providers, calls model endpoints, or spends credits.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const environmentKind = inferEnvironmentKind(baseUrl, options.environmentKind);
  assertTransportPolicy(baseUrl, environmentKind);
  const auth = resolveAuth(options);
  const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const probe = {
    jobId: safeIdentifier(options.jobId || `provider_handoff_capture_${runId}`),
    ownerA: `provider_handoff_capture_owner_a_${runId}_must_not_leak`,
    ownerB: `provider_handoff_capture_owner_b_${runId}_must_not_leak`
  };

  const capture = auth.token
    ? await runCapture({ baseUrl, authToken: auth.token, timeoutMs: options.timeoutMs, ttlMs: options.ttlMs, probe })
    : missingAuthCapture(auth.tokenEnvName);
  const publicPayload = JSON.stringify(capture);
  const checks = [
    ...capture.checks,
    check("deployment_token_not_serialized", !publicPayload.includes(auth.token ?? "__missing_token__")),
    check("probe_job_id_not_serialized", !publicPayload.includes(probe.jobId)),
    check("probe_owner_ids_not_serialized", !publicPayload.includes(probe.ownerA) && !publicPayload.includes(probe.ownerB)),
    check("no_provider_or_render_calls", capture.summary.providerCallsMade === false && capture.summary.renderCallsMade === false)
  ];
  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.render-provider-production-handoff-capture.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    externalNetworkCallsMade: environmentKind === "deployment" && capture.summary.operationCount > 0,
    localHttpCallsMade: environmentKind === "local" && capture.summary.operationCount > 0,
    providerCallsMade: false,
    renderCallsMade: false,
    environmentKind,
    checkedInputs: {
      baseUrl: safeBaseUrl(baseUrl),
      deploymentBaseUrlSha256: deploymentBaseUrlSha256(baseUrl),
      endpointPath,
      outputPath: toRepoRelative(options.outputPath),
      authTokenEnv: auth.tokenEnvName,
      authTokenProvided: auth.tokenProvided,
      timeoutMs: options.timeoutMs,
      ttlMs: options.ttlMs,
      jobIdConfigured: Boolean(options.jobId)
    },
    summary: {
      ...capture.summary,
      canClaimDistributedResume: false
    },
    operations: capture.operations,
    checks,
    releaseGateSummary: {
      productionHandoffCapturePass: status === "pass" && environmentKind === "deployment",
      canUseAsProductionHandoffEvidence: status === "pass" && environmentKind === "deployment",
      canClaimDistributedResume: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker:
        status === "pass" && environmentKind === "deployment"
          ? "Production lease handoff capture passed, but distributed resume still requires live provider close/cancel/resume action evidence and the full business-readiness gate."
          : "Production render-provider handoff evidence is incomplete or was captured from a local host."
    },
    nextActions: nextActionsFor({ status, environmentKind, auth, capture })
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function validateOptions(options) {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 120000.");
  }
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1_000 || options.ttlMs > 60_000) {
    throw new Error("--ttl-ms must be an integer between 1000 and 60000.");
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
}

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl || typeof rawBaseUrl !== "string") {
    throw new Error("--base-url, CINEJELLY_RENDER_PROVIDER_HANDOFF_BASE_URL, or CINEJELLY_DEPLOYMENT_BASE_URL is required.");
  }
  const url = new URL(rawBaseUrl);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Base URL must not include credentials, query strings, or fragments.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Base URL must use http or https.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function inferEnvironmentKind(baseUrl, configuredKind) {
  if (configuredKind && configuredKind !== "deployment" && configuredKind !== "local") {
    throw new Error("--environment-kind must be deployment or local.");
  }
  if (configuredKind === "deployment" && isLocalhost(baseUrl.hostname)) {
    throw new Error("Localhost URLs cannot be labeled as deployment evidence.");
  }
  return configuredKind ?? (isLocalhost(baseUrl.hostname) ? "local" : "deployment");
}

function assertTransportPolicy(baseUrl, environmentKind) {
  if (environmentKind === "deployment" && baseUrl.protocol !== "https:") {
    throw new Error("Production handoff capture requires an https base URL for deployment evidence.");
  }
  if (baseUrl.protocol === "http:" && !isLocalhost(baseUrl.hostname)) {
    throw new Error("Plain http is allowed only for local handoff captures.");
  }
}

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function resolveAuth(options) {
  const primary = options.authTokenEnv ? process.env[options.authTokenEnv] : undefined;
  const fallback = options.fallbackAuthTokenEnv ? process.env[options.fallbackAuthTokenEnv] : undefined;
  const token = primary || fallback;
  return {
    token,
    tokenEnvName: primary ? options.authTokenEnv : token ? options.fallbackAuthTokenEnv : options.authTokenEnv,
    tokenProvided: Boolean(token)
  };
}

async function runCapture({ baseUrl, authToken, timeoutMs, ttlMs, probe }) {
  const operations = [];
  const acquireA = await postOperation(baseUrl, authToken, timeoutMs, "worker_a_acquire", "acquire", {
    jobId: probe.jobId,
    ownerId: probe.ownerA,
    ttlMs
  });
  operations.push(publicOperation(acquireA));
  const leaseA = acquireA.rawPayload?.lease?.leaseId;

  const acquireBImmediate = await postOperation(baseUrl, authToken, timeoutMs, "worker_b_immediate_acquire", "acquire", {
    jobId: probe.jobId,
    ownerId: probe.ownerB,
    ttlMs
  });
  operations.push(publicOperation(acquireBImmediate));

  const heartbeatA = leaseA
    ? await postOperation(baseUrl, authToken, timeoutMs, "worker_a_heartbeat", "heartbeat", {
        jobId: probe.jobId,
        ownerId: probe.ownerA,
        leaseId: leaseA,
        ttlMs
      })
    : skippedOperation("worker_a_heartbeat", "acquire did not return a lease ID.");
  operations.push(publicOperation(heartbeatA));

  const releaseA = leaseA
    ? await postOperation(baseUrl, authToken, timeoutMs, "worker_a_release", "release", {
        jobId: probe.jobId,
        ownerId: probe.ownerA,
        leaseId: leaseA
      })
    : skippedOperation("worker_a_release", "acquire did not return a lease ID.");
  operations.push(publicOperation(releaseA));

  const acquireBAfterRelease = await postOperation(baseUrl, authToken, timeoutMs, "worker_b_after_release_acquire", "acquire", {
    jobId: probe.jobId,
    ownerId: probe.ownerB,
    ttlMs
  });
  operations.push(publicOperation(acquireBAfterRelease));
  const leaseB = acquireBAfterRelease.rawPayload?.lease?.leaseId;

  const releaseB = leaseB
    ? await postOperation(baseUrl, authToken, timeoutMs, "worker_b_release", "release", {
        jobId: probe.jobId,
        ownerId: probe.ownerB,
        leaseId: leaseB
      })
    : skippedOperation("worker_b_release", "worker B acquire did not return a lease ID.");
  operations.push(publicOperation(releaseB));

  const activeLeases = await getOperation(baseUrl, authToken, timeoutMs, "active_after_cleanup", "active");
  operations.push(publicOperation(activeLeases));
  const allLeases = await getOperation(baseUrl, authToken, timeoutMs, "list_leases_after_cleanup", "leases");
  operations.push(publicOperation(allLeases));

  const checks = [
    check("worker_a_acquired", acquireA.httpStatus === 200 && acquireA.rawPayload?.status === "acquired" && typeof leaseA === "string"),
    check("worker_b_immediate_held_by_other", acquireBImmediate.httpStatus === 200 && acquireBImmediate.rawPayload?.status === "held_by_other"),
    check("worker_a_heartbeat_recorded", heartbeatA.httpStatus === 200 && heartbeatA.rawPayload?.status === "recorded"),
    check("worker_a_release_true", releaseA.httpStatus === 200 && releaseA.rawPayload?.released === true),
    check("worker_b_acquired_after_release", acquireBAfterRelease.httpStatus === 200 && acquireBAfterRelease.rawPayload?.status === "acquired" && typeof leaseB === "string"),
    check("worker_b_release_true", releaseB.httpStatus === 200 && releaseB.rawPayload?.released === true),
    check("active_empty_after_cleanup", activeLeases.httpStatus === 200 && leaseCount(activeLeases.rawPayload) === 0),
    check("lease_history_contains_probe", allLeases.httpStatus === 200 && leaseHistoryContainsJob(allLeases.rawPayload, probe.jobId))
  ];

  return {
    operations,
    checks,
    summary: {
      providerCallsMade: false,
      renderCallsMade: false,
      operationCount: operations.length,
      failedOperationCount: operations.filter((operation) => operation.status === "fail").length,
      skippedOperationCount: operations.filter((operation) => operation.status === "skipped").length,
      workerAAcquireStatus: String(acquireA.rawPayload?.status ?? "missing"),
      workerBImmediateAcquireStatus: String(acquireBImmediate.rawPayload?.status ?? "missing"),
      workerBAfterReleaseAcquireStatus: String(acquireBAfterRelease.rawPayload?.status ?? "missing"),
      activeAfterCleanupCount: leaseCount(activeLeases.rawPayload),
      probeLeaseHistoryObserved: leaseHistoryContainsJob(allLeases.rawPayload, probe.jobId)
    }
  };
}

function missingAuthCapture(tokenEnvName) {
  return {
    operations: [],
    checks: [fail("deployment_token_configured", `${tokenEnvName} must be set to call protected render-provider handoff lease endpoints.`)],
    summary: {
      providerCallsMade: false,
      renderCallsMade: false,
      operationCount: 0,
      failedOperationCount: 0,
      skippedOperationCount: 0,
      workerAAcquireStatus: "not_attempted",
      workerBImmediateAcquireStatus: "not_attempted",
      workerBAfterReleaseAcquireStatus: "not_attempted",
      activeAfterCleanupCount: 0,
      probeLeaseHistoryObserved: false
    }
  };
}

async function postOperation(baseUrl, authToken, timeoutMs, name, operation, body) {
  return requestOperation(baseUrl, authToken, timeoutMs, {
    name,
    method: "POST",
    operation,
    body
  });
}

async function getOperation(baseUrl, authToken, timeoutMs, name, operation) {
  return requestOperation(baseUrl, authToken, timeoutMs, {
    name,
    method: "GET",
    operation
  });
}

async function requestOperation(baseUrl, authToken, timeoutMs, input) {
  const startedAtMs = Date.now();
  const url = endpointUrl(baseUrl, input.operation);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${authToken}`
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: input.method,
      headers,
      signal: controller.signal,
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {})
    });
    const text = await response.text();
    const rawPayload = parseJsonPayload(text);
    return {
      name: input.name,
      method: input.method,
      path: `${endpointPath}/${input.operation}`,
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAtMs,
      rawPayload,
      response: summarizeResponse(rawPayload)
    };
  } catch (error) {
    return {
      name: input.name,
      method: input.method,
      path: `${endpointPath}/${input.operation}`,
      ok: false,
      durationMs: Date.now() - startedAtMs,
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function endpointUrl(baseUrl, operation) {
  const next = new URL(baseUrl.href);
  next.pathname = `${baseUrl.pathname}${endpointPath}/${operation}`.replace(/\/{2,}/g, "/");
  return next;
}

function parseJsonPayload(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { nonJsonBodyPreview: redactText(text.slice(0, 500)) };
  }
}

function summarizeResponse(payload) {
  const redacted = redactUnknown(payload);
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
    return { payload: redacted };
  }
  return {
    payload: {
      ...(typeof redacted.status === "string" ? { status: redacted.status } : {}),
      ...(typeof redacted.released === "boolean" ? { released: redacted.released } : {}),
      ...(redacted.lease && typeof redacted.lease === "object" ? { lease: { leaseId: "[REDACTED]", expiresAt: redacted.lease.expiresAt } } : {}),
      ...(redacted.heldBy && typeof redacted.heldBy === "object" ? { heldBy: { expiresAt: redacted.heldBy.expiresAt } } : {}),
      ...(typeof redacted.heartbeatAt === "string" ? { heartbeatAt: redacted.heartbeatAt } : {}),
      ...(Array.isArray(redacted.leases) ? { leaseCount: redacted.leases.length, leases: redacted.leases.map(publicLeaseSummary) } : {}),
      ...(typeof redacted.error === "string" ? { error: redacted.error } : {})
    }
  };
}

function publicLeaseSummary(lease) {
  if (!lease || typeof lease !== "object") {
    return {};
  }
  return {
    hasJobId: typeof lease.jobId === "string" && lease.jobId.length > 0,
    acquiredAt: String(lease.acquiredAt ?? ""),
    expiresAt: String(lease.expiresAt ?? ""),
    hasRenewedAt: typeof lease.renewedAt === "string",
    hasReleasedAt: typeof lease.releasedAt === "string"
  };
}

function publicOperation(operation) {
  const classification = classifyOperation(operation);
  return {
    name: operation.name,
    method: operation.method,
    path: operation.path,
    ...(operation.httpStatus ? { httpStatus: operation.httpStatus } : {}),
    ok: operation.ok === true,
    durationMs: operation.durationMs ?? 0,
    status: classification.status,
    message: classification.message,
    ...(operation.response ? { response: operation.response.payload } : {}),
    ...(operation.error ? { error: redactText(operation.error) } : {})
  };
}

function classifyOperation(operation) {
  if (operation.status === "skipped") {
    return { status: "skipped", message: operation.message };
  }
  if (operation.ok === true) {
    return { status: "pass", message: "Endpoint call completed." };
  }
  return { status: "fail", message: operation.error || `Endpoint returned HTTP ${operation.httpStatus ?? "missing"}.` };
}

function skippedOperation(name, message) {
  return {
    name,
    method: "POST",
    path: endpointPath,
    ok: false,
    durationMs: 0,
    status: "skipped",
    message
  };
}

function leaseCount(payload) {
  return Number.isSafeInteger(payload?.leaseCount) ? payload.leaseCount : Array.isArray(payload?.leases) ? payload.leases.length : 0;
}

function leaseHistoryContainsJob(payload, jobId) {
  const leases = Array.isArray(payload?.leases) ? payload.leases : [];
  return leases.some((lease) => lease?.jobId === jobId);
}

function safeIdentifier(value) {
  const trimmed = String(value).trim();
  if (
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(trimmed) ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    containsUnsafePublicText(trimmed)
  ) {
    throw new Error("--job-id must be a safe non-secret identifier using only letters, numbers, underscore, dot, colon, or hyphen.");
  }
  return trimmed;
}

function statusForChecks(checks) {
  return checks.some((item) => item.status === "fail") ? "fail" : "pass";
}

function nextActionsFor({ status, environmentKind, auth, capture }) {
  const actions = [];
  if (environmentKind !== "deployment") {
    actions.push("Run this capture against the real HTTPS deployment host before counting it as production handoff evidence.");
  }
  if (!auth.tokenProvided) {
    actions.push(`Set ${auth.tokenEnvName} before calling protected render-provider handoff lease endpoints.`);
  }
  for (const checkResult of capture.checks) {
    if (checkResult.status === "fail") {
      actions.push(checkResult.message);
    }
  }
  if (status === "pass" && environmentKind === "deployment") {
    actions.push("Archive this report with business-readiness evidence, then prove live provider close/cancel/resume action execution before claiming distributed resume parity.");
  }
  return [...new Set(actions)];
}

function safeBaseUrl(baseUrl) {
  const host = isLocalhost(baseUrl.hostname) ? "localhost" : "[deployment-host]";
  return `${baseUrl.protocol}//${host}${baseUrl.pathname}`.replace(/\/$/, "");
}

function deploymentBaseUrlSha256(baseUrl) {
  return createHash("sha256").update(canonicalBaseUrl(baseUrl)).digest("hex");
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

function redactText(value) {
  return publicTextBlocklistPatterns.reduce((current, pattern) => {
    pattern.lastIndex = 0;
    return current.replace(pattern, "[REDACTED]");
  }, String(value));
}

function containsUnsafePublicText(value) {
  return publicTextBlocklistPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function redactUnknown(value) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const redacted = redactUnknown(item);
        return [key, secretKeyPattern.test(key) && typeof redacted === "string" ? "[REDACTED]" : redacted];
      })
    );
  }
  return value;
}

function writeReport(outputPath, report) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(value) {
  const resolved = resolve(repoRoot, value);
  const relative = resolved.startsWith(repoRoot) ? resolved.slice(repoRoot.length).replace(/^[/\\]/, "") : resolved;
  return relative.replace(/\\/g, "/");
}

function check(name, pass) {
  return pass ? { name, status: "pass", message: "Check passed." } : fail(name, "Check failed.");
}

function fail(name, message) {
  return { name, status: "fail", message };
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
