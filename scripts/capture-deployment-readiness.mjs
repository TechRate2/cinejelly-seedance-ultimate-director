import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  baseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  authTokenEnv: "CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN",
  fallbackAuthTokenEnv: "CINEJELLY_API_AUTH_TOKEN",
  outputPath: "assets/output_deliverables/business-readiness/deployment-preflight-report.json",
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
    baseUrl: defaults.baseUrl,
    authTokenEnv: defaults.authTokenEnv,
    fallbackAuthTokenEnv: defaults.fallbackAuthTokenEnv,
    outputPath: defaults.outputPath,
    timeoutMs: defaults.timeoutMs,
    writeReport: true
  };

  const flagMap = new Map([
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
  console.log(`Capture no-spend deployment readiness evidence from a running CineJelly API.

Usage:
  npm.cmd run validation:deployment-readiness -- --base-url https://cinejelly.example.com
  node scripts/capture-deployment-readiness.mjs --base-url http://127.0.0.1:8787 --environment-kind local

Options:
  --base-url <url>                    Deployment API origin or base path. Can also use CINEJELLY_DEPLOYMENT_BASE_URL.
  --auth-token-env <name>             Env var containing the deployment token. Default: ${defaults.authTokenEnv}
  --fallback-auth-token-env <name>    Fallback env var. Default: ${defaults.fallbackAuthTokenEnv}
  --no-auth-fallback                  Do not fallback to CINEJELLY_API_AUTH_TOKEN.
  --environment-kind <kind>           deployment or local. Defaults to deployment for HTTPS non-localhost, local for localhost.
  --timeout-ms <ms>                   Per-endpoint timeout. Default: ${defaults.timeoutMs}
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --no-output                         Print only; do not write the report.

This command only calls GET /health, /v1/preflight, /v1/validation-readiness, and /v1/render-settings.
It never submits render work, initializes Atlas providers, creates media, or spends credits.`);
}

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl || typeof rawBaseUrl !== "string") {
    throw new Error("--base-url or CINEJELLY_DEPLOYMENT_BASE_URL is required.");
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
  const localhost = isLocalhost(baseUrl.hostname);
  if (configuredKind && configuredKind !== "deployment" && configuredKind !== "local") {
    throw new Error("--environment-kind must be deployment or local.");
  }
  if (configuredKind === "deployment" && localhost) {
    throw new Error("Localhost URLs cannot be labeled as deployment evidence.");
  }
  return configuredKind ?? (localhost ? "local" : "deployment");
}

function assertTransportPolicy(baseUrl, environmentKind) {
  if (environmentKind === "deployment" && baseUrl.protocol !== "https:") {
    throw new Error("Deployment readiness capture requires an https base URL.");
  }
  if (baseUrl.protocol === "http:" && !isLocalhost(baseUrl.hostname)) {
    throw new Error("Plain http is allowed only for localhost readiness captures.");
  }
}

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function resolveAuth(options) {
  const token =
    (options.authTokenEnv ? process.env[options.authTokenEnv] : undefined) ||
    (options.fallbackAuthTokenEnv ? process.env[options.fallbackAuthTokenEnv] : undefined);
  const tokenEnvName = process.env[options.authTokenEnv] ? options.authTokenEnv : token ? options.fallbackAuthTokenEnv : options.authTokenEnv;
  return {
    token,
    tokenEnvName,
    tokenProvided: Boolean(token),
    mode: token ? "bearer" : "none"
  };
}

function endpointUrl(baseUrl, path) {
  const next = new URL(baseUrl.href);
  next.pathname = `${baseUrl.pathname}${path}`.replace(/\/{2,}/g, "/");
  return next;
}

async function fetchEndpoint({ baseUrl, path, name, auth, timeoutMs }) {
  const startedAtMs = Date.now();
  const url = endpointUrl(baseUrl, path);
  const headers = { Accept: "application/json" };
  if (path.startsWith("/v1/") && auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await response.text();
    const payload = parseJsonPayload(text);
    return {
      name,
      method: "GET",
      path,
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAtMs,
      payload: redactUnknown(payload)
    };
  } catch (error) {
    return {
      name,
      method: "GET",
      path,
      httpStatus: undefined,
      ok: false,
      durationMs: Date.now() - startedAtMs,
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
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

function classifyEndpoint(endpoint) {
  const payload = endpoint.payload && typeof endpoint.payload === "object" ? endpoint.payload : {};
  if (endpoint.name === "health") {
    return endpoint.httpStatus === 200 && payload.status === "ok" ? pass("Health endpoint returned ok.") : fail("Health endpoint did not return status ok.");
  }
  if (endpoint.name === "preflight") {
    const atlasDocsCheck = preflightCheck(payload, "atlascloud_docs_conformance");
    if (!atlasDocsCheck) {
      return fail("Preflight is missing atlascloud_docs_conformance; redeploy the current build before using deployment evidence.");
    }
    if (atlasDocsCheck.status === "fail") {
      return fail(`AtlasCloud docs conformance is fail: ${atlasDocsCheck.message ?? "missing message"}`);
    }
    if (atlasDocsCheck.status === "warn") {
      return warn(`AtlasCloud docs conformance is warn: ${atlasDocsCheck.message ?? "missing message"}`);
    }
    if (endpoint.httpStatus === 200 && payload.status === "pass") {
      return pass("Preflight status is pass.");
    }
    if (endpoint.httpStatus === 200 && payload.status === "warn") {
      return warn("Preflight status is warn and requires operator acceptance.");
    }
    return fail(`Preflight status is ${payload.status ?? "missing"} with HTTP ${endpoint.httpStatus ?? "missing"}.`);
  }
  if (endpoint.name === "validation_readiness") {
    if (endpoint.httpStatus === 200 && payload.decision === "ready_for_paid_validation") {
      return pass("Validation readiness is ready_for_paid_validation.");
    }
    if (endpoint.httpStatus === 200 && payload.decision === "review_warnings") {
      return warn("Validation readiness has warnings requiring operator acceptance.");
    }
    return fail(`Validation readiness decision is ${payload.decision ?? "missing"} with HTTP ${endpoint.httpStatus ?? "missing"}.`);
  }
  if (endpoint.name === "render_settings") {
    if (endpoint.httpStatus === 200 && payload.schemaVersion === "cinejelly.render-settings.v1") {
      return pass("Render settings descriptor is available and secret-free.");
    }
    return fail(`Render settings descriptor is unavailable or unrecognized with HTTP ${endpoint.httpStatus ?? "missing"}.`);
  }
  return fail("Unknown endpoint.");
}

function preflightCheck(payload, name) {
  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  return checks.find((check) => check?.name === name);
}

function statusForClassifications(classifications) {
  if (classifications.some((classification) => classification.status === "fail")) {
    return "fail";
  }
  if (classifications.some((classification) => classification.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function buildNextActions(report) {
  const actions = [];
  if (report.environmentKind !== "deployment") {
    actions.push("Run this capture against the real HTTPS deployment host before counting it as business-readiness evidence.");
  }
  for (const endpoint of report.endpoints) {
    if (endpoint.status === "fail") {
      actions.push(`Fix ${endpoint.path}: ${endpoint.message}`);
    }
    if (endpoint.status === "warn") {
      actions.push(`Review and accept or resolve ${endpoint.path}: ${endpoint.message}`);
    }
  }
  if (!report.auth.tokenProvided) {
    actions.push(`Set ${report.auth.tokenEnvName} when protected /v1 endpoints require deployment authentication.`);
  }
  if (actions.length === 0) {
    actions.push("Archive this report with the release evidence and continue with the remaining business-readiness gates.");
  }
  return [...new Set(actions)];
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

function pass(message) {
  return { status: "pass", message };
}

function warn(message) {
  return { status: "warn", message };
}

function fail(message) {
  return { status: "fail", message };
}

function toSafeBaseUrlString(baseUrl) {
  const safe = new URL(baseUrl.href);
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.href.replace(/\/$/, "");
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const environmentKind = inferEnvironmentKind(baseUrl, options.environmentKind);
  assertTransportPolicy(baseUrl, environmentKind);
  const auth = resolveAuth(options);

  const endpoints = await Promise.all([
    fetchEndpoint({ baseUrl, path: "/health", name: "health", auth, timeoutMs: options.timeoutMs }),
    fetchEndpoint({ baseUrl, path: "/v1/preflight", name: "preflight", auth, timeoutMs: options.timeoutMs }),
    fetchEndpoint({ baseUrl, path: "/v1/validation-readiness", name: "validation_readiness", auth, timeoutMs: options.timeoutMs }),
    fetchEndpoint({ baseUrl, path: "/v1/render-settings", name: "render_settings", auth, timeoutMs: options.timeoutMs })
  ]);
  const classifiedEndpoints = endpoints.map((endpoint) => ({
    ...endpoint,
    ...classifyEndpoint(endpoint)
  }));
  const status = statusForClassifications(classifiedEndpoints);
  const readinessEndpoint = classifiedEndpoints.find((endpoint) => endpoint.name === "validation_readiness");
  const preflightEndpoint = classifiedEndpoints.find((endpoint) => endpoint.name === "preflight");
  const renderSettingsEndpoint = classifiedEndpoints.find((endpoint) => endpoint.name === "render_settings");
  const atlasCloudDocsConformanceStatus = preflightCheck(preflightEndpoint?.payload, "atlascloud_docs_conformance")?.status ?? "missing";

  const report = {
    schemaVersion: "cinejelly.deployment-readiness-capture.v1",
    generatedAt: new Date().toISOString(),
    status,
    environmentKind,
    baseUrl: toSafeBaseUrlString(baseUrl),
    timeoutMs: options.timeoutMs,
    auth: {
      mode: auth.mode,
      tokenEnvName: auth.tokenEnvName,
      tokenProvided: auth.tokenProvided,
      sentAuthorizationToV1Endpoints: auth.tokenProvided
    },
    endpoints: classifiedEndpoints,
    summary: {
      healthStatus: classifiedEndpoints.find((endpoint) => endpoint.name === "health")?.payload?.status,
      preflightStatus: preflightEndpoint?.payload?.status,
      atlasCloudDocsConformanceStatus,
      validationReadinessDecision: readinessEndpoint?.payload?.decision,
      renderSettingsSchemaVersion: renderSettingsEndpoint?.payload?.schemaVersion,
      allEndpointsCaptured: classifiedEndpoints.every((endpoint) => endpoint.httpStatus !== undefined)
    },
    releaseGateSummary: {
      canUseAsBusinessReadinessDeploymentEvidence:
        environmentKind === "deployment" && status === "pass" && atlasCloudDocsConformanceStatus === "pass",
      canRunPaidValidationFromHost:
        readinessEndpoint?.payload?.decision === "ready_for_paid_validation" ||
        readinessEndpoint?.payload?.decision === "review_warnings",
      canReleaseToCustomerTraffic: false,
      releaseBlocker:
        environmentKind === "deployment" && status === "pass"
          ? "Deployment readiness evidence alone is not customer-traffic approval; the remaining business-readiness gates must pass too."
          : "Deployment readiness capture is not pass evidence for the real HTTPS deployment host."
    }
  };
  const completeReport = {
    ...report,
    nextActions: buildNextActions(report)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, completeReport);
  }
  process.stdout.write(`${JSON.stringify(completeReport, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.deployment-readiness-capture.v1",
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
