import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  attestationPath: "ops/production-operations-attestation.json",
  baseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  authTokenEnv: "CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN",
  fallbackAuthTokenEnv: "CINEJELLY_API_AUTH_TOKEN",
  outputPath: "assets/output_deliverables/business-readiness/production-operations-report.json",
  timeoutMs: 15_000
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

function parseArgs(args) {
  const options = {
    attestationPath: defaults.attestationPath,
    baseUrl: defaults.baseUrl,
    authTokenEnv: defaults.authTokenEnv,
    fallbackAuthTokenEnv: defaults.fallbackAuthTokenEnv,
    outputPath: defaults.outputPath,
    timeoutMs: defaults.timeoutMs,
    writeReport: true
  };
  const flagMap = new Map([
    ["--attestation", "attestationPath"],
    ["--base-url", "baseUrl"],
    ["--auth-token-env", "authTokenEnv"],
    ["--fallback-auth-token-env", "fallbackAuthTokenEnv"],
    ["--environment-kind", "environmentKind"],
    ["--output", "outputPath"],
    ["--timeout-ms", "timeoutMs"]
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
      const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = key === "timeoutMs" ? Number.parseInt(value, 10) : value;
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
  console.log(`Capture CineJelly production storage/observability/support evidence without provider spend.

Usage:
  npm.cmd run validation:production-ops -- --base-url https://cinejelly.example.com --attestation ops/production-operations-attestation.json

Options:
  --attestation <path>                Non-secret production operations attestation JSON. Default: ${defaults.attestationPath}
  --base-url <url>                    Deployment API origin or base path. Can also use CINEJELLY_DEPLOYMENT_BASE_URL.
  --auth-token-env <name>             Env var containing the deployment token. Default: ${defaults.authTokenEnv}
  --fallback-auth-token-env <name>    Fallback env var. Default: ${defaults.fallbackAuthTokenEnv}
  --no-auth-fallback                  Do not fallback to CINEJELLY_API_AUTH_TOKEN.
  --environment-kind <kind>           deployment or local. Defaults to deployment for HTTPS non-localhost, local for localhost.
  --timeout-ms <ms>                   Per-endpoint timeout. Default: ${defaults.timeoutMs}
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --no-output                         Print only; do not write the report.

This command only calls GET /health, /v1/preflight, /v1/validation-readiness, and /v1/render-settings.
It never submits render work, initializes providers, calls Atlas, or inspects customer media.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 120000.");
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }

  const baseUrl = options.baseUrl ? normalizeBaseUrl(options.baseUrl) : undefined;
  const environmentKind = inferEnvironmentKind(baseUrl, options.environmentKind);
  if (baseUrl) {
    assertTransportPolicy(baseUrl, environmentKind);
  }
  const auth = resolveAuth(options);
  const attestationEvidence = buildAttestationEvidence(options.attestationPath);
  const endpointEvidence = await buildEndpointEvidence({
    baseUrl,
    environmentKind,
    auth,
    timeoutMs: options.timeoutMs
  });
  const checks = [...attestationEvidence.checks, ...endpointEvidence.checks];
  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.production-operations.v1",
    generatedAt: new Date().toISOString(),
    status,
    environmentKind,
    checkedInputs: {
      attestationPath: toRepoRelative(options.attestationPath),
      deploymentBaseUrlConfigured: Boolean(baseUrl),
      authTokenEnv: auth.tokenEnvName,
      authTokenProvided: auth.tokenProvided
    },
    checks,
    attestation: attestationEvidence.summary,
    endpointCapture: endpointEvidence.summary,
    releaseGateSummary: {
      canUseAsBusinessReadinessOperationsEvidence: status === "pass",
      canOpenPaidCustomerTraffic: false,
      releaseBlocker:
        status === "pass"
          ? "Production operations evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
          : "Production storage/observability/support evidence is incomplete."
    }
  };
  const completeReport = {
    ...report,
    nextActions: nextActionsFor(report)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, completeReport);
  }
  process.stdout.write(`${JSON.stringify(completeReport, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function buildAttestationEvidence(attestationPath) {
  const absolutePath = resolve(repoRoot, attestationPath);
  if (!existsSync(absolutePath)) {
    return {
      checks: [fail("production_ops_attestation", `Missing non-secret operations attestation at ${toRepoRelative(attestationPath)}.`)],
      summary: {
        configured: false,
        path: toRepoRelative(attestationPath)
      }
    };
  }
  try {
    const attestation = JSON.parse(readFileSync(absolutePath, "utf8"));
    return {
      checks: validateAttestation(attestation),
      summary: summarizeAttestation(attestation)
    };
  } catch (error) {
    return {
      checks: [fail("production_ops_attestation", `Attestation is not valid JSON: ${redactText(error instanceof Error ? error.message : String(error))}`)],
      summary: {
        configured: false,
        path: toRepoRelative(attestationPath)
      }
    };
  }
}

function validateAttestation(attestation) {
  const checks = [];
  checks.push(
    attestation?.schemaVersion === "cinejelly.production-operations-attestation.v1"
      ? pass("attestation.schema", "Production operations attestation schema is recognized.")
      : fail("attestation.schema", "schemaVersion must be cinejelly.production-operations-attestation.v1.")
  );
  checks.push(requiredTextCheck(attestation?.approvedBy, "attestation.approved_by", "approvedBy"));
  checks.push(dateTimeCheck(attestation?.approvedAt, "attestation.approved_at", "approvedAt"));
  checks.push(requiredTextCheck(attestation?.operationsOwner, "attestation.operations_owner", "operationsOwner"));
  checks.push(requiredTextCheck(attestation?.supportContact, "attestation.support_contact", "supportContact"));
  checks.push(requiredTextCheck(attestation?.securityContact, "attestation.security_contact", "securityContact"));
  checks.push(requiredTextCheck(attestation?.incidentEscalationContact, "attestation.incident_escalation_contact", "incidentEscalationContact"));

  const storage = attestation?.storage;
  checks.push(enumCheck(storage?.provider, ["s3", "gcs", "azure_blob", "r2", "managed_platform", "external"], "attestation.storage.provider", "storage.provider must identify durable storage."));
  checks.push(booleanTrueCheck(storage?.durableStorage, "attestation.storage.durable", "storage.durableStorage"));
  checks.push(minIntegerCheck(storage?.artifactRetentionDays, 30, "attestation.storage.retention_days", "storage.artifactRetentionDays"));
  checks.push(booleanTrueCheck(storage?.backupEnabled, "attestation.storage.backup_enabled", "storage.backupEnabled"));
  checks.push(requiredTextCheck(storage?.backupCadence, "attestation.storage.backup_cadence", "storage.backupCadence"));
  checks.push(dateTimeCheck(storage?.restoreTestedAt, "attestation.storage.restore_tested_at", "storage.restoreTestedAt"));
  checks.push(httpsUrlCheck(storage?.restoreRunbookUrl, "attestation.storage.restore_runbook_url", "storage.restoreRunbookUrl"));

  const observability = attestation?.observability;
  checks.push(requiredTextCheck(observability?.provider, "attestation.observability.provider", "observability.provider"));
  checks.push(httpsUrlCheck(observability?.dashboardUrl, "attestation.observability.dashboard_url", "observability.dashboardUrl"));
  checks.push(booleanTrueCheck(observability?.alertingEnabled, "attestation.observability.alerting", "observability.alertingEnabled"));
  checks.push(requiredTextCheck(observability?.onCallSchedule, "attestation.observability.on_call", "observability.onCallSchedule"));
  checks.push(requiredTextCheck(observability?.requestIdSearchProcedure, "attestation.observability.request_id_search", "observability.requestIdSearchProcedure"));

  const incident = attestation?.incidentResponse;
  checks.push(httpsUrlCheck(incident?.runbookUrl, "attestation.incident.runbook_url", "incidentResponse.runbookUrl"));
  checks.push(requiredTextCheck(incident?.severityPolicy, "attestation.incident.severity_policy", "incidentResponse.severityPolicy"));
  checks.push(requiredTextCheck(incident?.rollbackProcedure, "attestation.incident.rollback", "incidentResponse.rollbackProcedure"));
  checks.push(requiredTextCheck(incident?.postIncidentReviewProcedure, "attestation.incident.review", "incidentResponse.postIncidentReviewProcedure"));

  const support = attestation?.supportWorkflow;
  checks.push(httpsUrlCheck(support?.supportRunbookUrl, "attestation.support.runbook_url", "supportWorkflow.supportRunbookUrl"));
  checks.push(requiredTextCheck(support?.responseSlo, "attestation.support.response_slo", "supportWorkflow.responseSlo"));
  checks.push(requiredTextCheck(support?.customerEscalationProcedure, "attestation.support.escalation", "supportWorkflow.customerEscalationProcedure"));

  const dataProtection = attestation?.dataProtection;
  checks.push(booleanTrueCheck(dataProtection?.logRedactionReviewPassed, "attestation.data.log_redaction", "dataProtection.logRedactionReviewPassed"));
  checks.push(requiredTextCheck(dataProtection?.secretRotationProcedure, "attestation.data.secret_rotation", "dataProtection.secretRotationProcedure"));
  checks.push(requiredTextCheck(dataProtection?.customerArtifactDeletionProcedure, "attestation.data.artifact_deletion", "dataProtection.customerArtifactDeletionProcedure"));
  checks.push(httpsUrlCheck(dataProtection?.dataRetentionPolicyUrl, "attestation.data.retention_policy_url", "dataProtection.dataRetentionPolicyUrl"));
  return checks;
}

async function buildEndpointEvidence({ baseUrl, environmentKind, auth, timeoutMs }) {
  if (!baseUrl) {
    return {
      checks: [fail("deployment_endpoint_capture", "CINEJELLY_DEPLOYMENT_BASE_URL or --base-url is required to verify production operations endpoints.")],
      summary: { captured: false }
    };
  }
  if (environmentKind !== "deployment") {
    return {
      checks: [fail("deployment_endpoint_capture", "Production operations evidence must be captured from a real HTTPS deployment host, not localhost.")],
      summary: { captured: false, baseUrl: safeBaseUrl(baseUrl), environmentKind }
    };
  }
  if (!auth.token) {
    return {
      checks: [fail("deployment_endpoint_capture", `${auth.tokenEnvName} must be set to capture protected production operations endpoints.`)],
      summary: { captured: false, baseUrl: safeBaseUrl(baseUrl), environmentKind, authTokenProvided: false }
    };
  }

  const endpoints = await Promise.all([
    fetchEndpoint(baseUrl, "/health", "health", undefined, timeoutMs),
    fetchEndpoint(baseUrl, "/v1/preflight", "preflight", auth.token, timeoutMs),
    fetchEndpoint(baseUrl, "/v1/validation-readiness", "validation_readiness", auth.token, timeoutMs),
    fetchEndpoint(baseUrl, "/v1/render-settings", "render_settings", auth.token, timeoutMs)
  ]);
  const checks = classifyEndpoints(endpoints);
  return {
    checks,
    summary: {
      captured: true,
      baseUrl: safeBaseUrl(baseUrl),
      environmentKind,
      endpoints,
      requiredPreflightChecks: summarizeRequiredPreflightChecks(endpoints.find((endpoint) => endpoint.name === "preflight")?.payload)
    }
  };
}

async function fetchEndpoint(baseUrl, path, name, token, timeoutMs) {
  const url = new URL(baseUrl.href);
  url.pathname = `${baseUrl.pathname}${path}`.replace(/\/{2,}/g, "/");
  const startedAtMs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await response.text();
    return {
      name,
      method: "GET",
      path,
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAtMs,
      payload: redactUnknown(parseJsonPayload(text))
    };
  } catch (error) {
    return {
      name,
      method: "GET",
      path,
      ok: false,
      durationMs: Date.now() - startedAtMs,
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyEndpoints(endpoints) {
  const checks = [];
  const health = endpoints.find((endpoint) => endpoint.name === "health");
  checks.push(
    health?.httpStatus === 200 && health?.payload?.status === "ok"
      ? pass("endpoint.health", "Deployment health endpoint returned ok.")
      : fail("endpoint.health", "Deployment health endpoint did not return status ok.")
  );
  const preflight = endpoints.find((endpoint) => endpoint.name === "preflight");
  checks.push(
    preflight?.httpStatus === 200 && preflight?.payload?.status === "pass"
      ? pass("endpoint.preflight", "Deployment preflight status is pass.")
      : fail("endpoint.preflight", `Deployment preflight status is ${preflight?.payload?.status ?? "missing"} with HTTP ${preflight?.httpStatus ?? "missing"}.`)
  );
  for (const checkName of ["CINEJELLY_OUTPUT_DIR", "CINEJELLY_API_AUTH_TOKEN", "atlascloud_docs_conformance", "ffmpeg", "ffprobe"]) {
    const check = preflight?.payload?.checks?.find((item) => item?.name === checkName);
    checks.push(
      check?.status === "pass"
        ? pass(`preflight.${checkName}`, `${checkName} preflight check is pass.`)
        : fail(`preflight.${checkName}`, `${checkName} preflight check is ${check?.status ?? "missing"}.`)
    );
  }
  const readiness = endpoints.find((endpoint) => endpoint.name === "validation_readiness");
  checks.push(
    readiness?.httpStatus === 200 && readiness?.payload?.decision === "ready_for_paid_validation"
      ? pass("endpoint.validation_readiness", "Deployment validation-readiness is ready_for_paid_validation.")
      : fail("endpoint.validation_readiness", `Deployment validation-readiness decision is ${readiness?.payload?.decision ?? "missing"} with HTTP ${readiness?.httpStatus ?? "missing"}.`)
  );
  const renderSettings = endpoints.find((endpoint) => endpoint.name === "render_settings");
  checks.push(
    renderSettings?.httpStatus === 200 && renderSettings?.payload?.schemaVersion === "cinejelly.render-settings.v1"
      ? pass("endpoint.render_settings", "Deployment render settings descriptor is available.")
      : fail("endpoint.render_settings", `Deployment render settings descriptor is unavailable or unrecognized with HTTP ${renderSettings?.httpStatus ?? "missing"}.`)
  );
  return checks;
}

function summarizeRequiredPreflightChecks(preflightPayload) {
  const checks = Array.isArray(preflightPayload?.checks) ? preflightPayload.checks : [];
  return Object.fromEntries(
    ["CINEJELLY_OUTPUT_DIR", "CINEJELLY_API_AUTH_TOKEN", "atlascloud_docs_conformance", "ffmpeg", "ffprobe"].map((name) => {
      const check = checks.find((item) => item?.name === name);
      return [name, check?.status ?? "missing"];
    })
  );
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

function summarizeAttestation(attestation) {
  return {
    configured: true,
    schemaVersion: attestation?.schemaVersion,
    approvedAt: attestation?.approvedAt,
    approvedBy: redactText(String(attestation?.approvedBy ?? "")),
    operationsOwner: redactText(String(attestation?.operationsOwner ?? "")),
    supportContact: redactText(String(attestation?.supportContact ?? "")),
    securityContact: redactText(String(attestation?.securityContact ?? "")),
    storageProvider: attestation?.storage?.provider,
    artifactRetentionDays: attestation?.storage?.artifactRetentionDays,
    observabilityProvider: attestation?.observability?.provider,
    monitoringDashboardUrl: attestation?.observability?.dashboardUrl,
    incidentRunbookUrl: attestation?.incidentResponse?.runbookUrl,
    supportRunbookUrl: attestation?.supportWorkflow?.supportRunbookUrl,
    dataRetentionPolicyUrl: attestation?.dataProtection?.dataRetentionPolicyUrl
  };
}

function statusForChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function nextActionsFor(report) {
  const actions = [];
  for (const check of report.checks) {
    if (check.status === "fail") {
      actions.push(check.message);
    }
    if (check.status === "warn") {
      actions.push(`Review warning: ${check.message}`);
    }
  }
  if (actions.length === 0) {
    actions.push("Archive this production operations report with release evidence.");
    actions.push("Continue the remaining business-readiness gates before opening paid customer traffic.");
  }
  return [...new Set(actions)];
}

function normalizeBaseUrl(rawBaseUrl) {
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
  if (!baseUrl) {
    return configuredKind ?? "deployment";
  }
  if (configuredKind === "deployment" && isLocalhost(baseUrl.hostname)) {
    throw new Error("Localhost URLs cannot be labeled as deployment evidence.");
  }
  return configuredKind ?? (isLocalhost(baseUrl.hostname) ? "local" : "deployment");
}

function assertTransportPolicy(baseUrl, environmentKind) {
  if (environmentKind === "deployment" && baseUrl.protocol !== "https:") {
    throw new Error("Production operations evidence requires an https base URL.");
  }
  if (baseUrl.protocol === "http:" && !isLocalhost(baseUrl.hostname)) {
    throw new Error("Plain http is allowed only for localhost production-ops smoke captures.");
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

function pass(name, message) {
  return { name, status: "pass", message };
}

function warn(name, message) {
  return { name, status: "warn", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function requiredTextCheck(value, name, fieldName) {
  return typeof value === "string" && value.trim().length >= 8
    ? pass(name, `${fieldName} is documented.`)
    : fail(name, `${fieldName} must be a non-secret string of at least 8 characters.`);
}

function dateTimeCheck(value, name, fieldName) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? pass(name, `${fieldName} is a parseable date-time.`)
    : fail(name, `${fieldName} must be a parseable ISO-style date-time string.`);
}

function enumCheck(value, allowed, name, message) {
  return typeof value === "string" && allowed.includes(value) ? pass(name, `${value} is accepted.`) : fail(name, message);
}

function booleanTrueCheck(value, name, fieldName) {
  return value === true ? pass(name, `${fieldName} is true.`) : fail(name, `${fieldName} must be true.`);
}

function minIntegerCheck(value, minimum, name, fieldName) {
  return Number.isInteger(value) && value >= minimum
    ? pass(name, `${fieldName} is at least ${minimum}.`)
    : fail(name, `${fieldName} must be an integer greater than or equal to ${minimum}.`);
}

function httpsUrlCheck(value, name, fieldName) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) {
      return pass(name, `${fieldName} is a clean HTTPS URL.`);
    }
  } catch {
    // fall through
  }
  return fail(name, `${fieldName} must be a clean HTTPS URL.`);
}

function safeBaseUrl(baseUrl) {
  const safe = new URL(baseUrl.href);
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.href.replace(/\/$/, "");
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
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

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.production-operations.v1",
        generatedAt: new Date().toISOString(),
        status: "fail",
        error: redactText(error instanceof Error ? error.message : String(error))
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
