import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  attestationPath: "ops/billing-admin-attestation.json",
  baseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  authTokenEnv: "CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN",
  fallbackAuthTokenEnv: "CINEJELLY_API_AUTH_TOKEN",
  outputPath: "assets/output_deliverables/business-readiness/billing-admin-ops-report.json",
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
  console.log(`Capture CineJelly billing/admin/quota operations evidence without provider spend.

Usage:
  npm.cmd run validation:billing-admin-ops
  npm.cmd run validation:billing-admin-ops -- --base-url https://cinejelly.example.com --attestation ops/billing-admin-attestation.json

Options:
  --attestation <path>                Non-secret operator attestation JSON. Default: ${defaults.attestationPath}
  --base-url <url>                    Deployment API origin or base path. Can also use CINEJELLY_DEPLOYMENT_BASE_URL.
  --auth-token-env <name>             Env var containing the deployment token. Default: ${defaults.authTokenEnv}
  --fallback-auth-token-env <name>    Fallback env var. Default: ${defaults.fallbackAuthTokenEnv}
  --no-auth-fallback                  Do not fallback to CINEJELLY_API_AUTH_TOKEN.
  --environment-kind <kind>           deployment or local. Defaults to deployment for HTTPS non-localhost, local for localhost.
  --timeout-ms <ms>                   Admin endpoint timeout. Default: ${defaults.timeoutMs}
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --no-output                         Print only; do not write the report.

This command does not call Atlas, render endpoints, billing provider APIs, or customer payment APIs.
It validates CineJelly-side spend gates and a non-secret operator attestation for external billing/account lifecycle controls.`);
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
  const policyEvidence = await buildClientPolicyEvidence();
  const attestationEvidence = buildAttestationEvidence(options.attestationPath);
  const adminEndpointEvidence = await buildAdminEndpointEvidence({
    baseUrl,
    environmentKind,
    auth,
    timeoutMs: options.timeoutMs
  });

  const checks = [
    ...policyEvidence.checks,
    ...attestationEvidence.checks,
    ...adminEndpointEvidence.checks
  ];
  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.billing-admin-ops.v1",
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
    clientPolicy: policyEvidence.summary,
    attestation: attestationEvidence.summary,
    adminEndpoint: adminEndpointEvidence.summary,
    releaseGateSummary: {
      canUseAsBusinessReadinessBillingEvidence: status === "pass",
      canOpenPaidCustomerTraffic: false,
      releaseBlocker:
        status === "pass"
          ? "Billing/admin/quota evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
          : "Billing/admin/quota operations evidence is incomplete."
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

async function buildClientPolicyEvidence() {
  try {
    const { loadApiClientPolicySettingsFromEnv } = await import("../dist/api/api-client-policy.js");
    const settings = loadApiClientPolicySettingsFromEnv(process.env);
    const enabledPolicies = settings.policies.filter((policy) => policy.enabled);
    const checks = [];
    checks.push(
      settings.policies.length > 0
        ? pass("client_policy_configured", `${settings.policies.length} client polic${settings.policies.length === 1 ? "y is" : "ies are"} configured.`)
        : fail("client_policy_configured", "CINEJELLY_API_CLIENTS_JSON is not configured.")
    );
    checks.push(
      settings.requireClientPolicyForRender
        ? pass("client_policy_required", "Render submissions require a configured client policy.")
        : fail("client_policy_required", "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER must be true for commercial customer traffic.")
    );
    checks.push(
      settings.usageLedgerPath
        ? writableLedgerCheck(settings.usageLedgerPath)
        : fail("client_usage_ledger", "CINEJELLY_CLIENT_USAGE_LEDGER_PATH is not configured.")
    );
    checks.push(
      enabledPolicies.length > 0
        ? pass("enabled_client_policies", `${enabledPolicies.length} enabled client polic${enabledPolicies.length === 1 ? "y" : "ies"} configured.`)
        : fail("enabled_client_policies", "At least one enabled client policy is required for paid customer traffic.")
    );

    for (const policy of enabledPolicies) {
      checks.push(...checksForClientPolicy(policy));
    }

    return {
      checks,
      summary: {
        configured: settings.policies.length > 0,
        requireClientPolicyForRender: settings.requireClientPolicyForRender,
        usageLedgerConfigured: Boolean(settings.usageLedgerPath),
        clientCount: settings.policies.length,
        enabledClientCount: enabledPolicies.length,
        clients: settings.policies.map((policy) => ({
          clientId: policy.clientId,
          enabled: policy.enabled,
          keyDigestConfigured: true,
          monthlyRequestLimitConfigured: policy.monthlyRequestLimit !== undefined,
          monthlyReservedCostUsdLimitConfigured: policy.monthlyReservedCostUsdLimit !== undefined,
          maxReservedCostUsdPerRequestConfigured: policy.maxReservedCostUsdPerRequest !== undefined,
          defaultReservedCostUsdPerRequestConfigured: policy.defaultReservedCostUsdPerRequest !== undefined,
          maxDurationTargetSecondsConfigured: policy.maxDurationTargetSeconds !== undefined,
          allowedTiersConfigured: Boolean(policy.allowedTiers?.length),
          allowedQualityModesConfigured: Boolean(policy.allowedQualityModes?.length)
        }))
      }
    };
  } catch (error) {
    return {
      checks: [fail("client_policy_parse", redactText(error instanceof Error ? error.message : String(error)))],
      summary: {
        configured: false,
        parseError: redactText(error instanceof Error ? error.message : String(error))
      }
    };
  }
}

function checksForClientPolicy(policy) {
  const prefix = `client_policy.${policy.clientId}`;
  return [
    policy.monthlyRequestLimit !== undefined
      ? pass(`${prefix}.monthly_request_limit`, "Monthly request limit is configured.")
      : fail(`${prefix}.monthly_request_limit`, "monthlyRequestLimit is required."),
    policy.monthlyReservedCostUsdLimit !== undefined
      ? pass(`${prefix}.monthly_reserved_cost_limit`, "Monthly reserved-cost limit is configured.")
      : fail(`${prefix}.monthly_reserved_cost_limit`, "monthlyReservedCostUsdLimit is required."),
    policy.maxReservedCostUsdPerRequest !== undefined
      ? pass(`${prefix}.per_request_cost_limit`, "Per-request reserved-cost limit is configured.")
      : fail(`${prefix}.per_request_cost_limit`, "maxReservedCostUsdPerRequest is required."),
    policy.defaultReservedCostUsdPerRequest !== undefined
      ? pass(`${prefix}.default_request_cost`, "Default reserved cost is configured for requests without settings.maxCostUsd.")
      : fail(`${prefix}.default_request_cost`, "defaultReservedCostUsdPerRequest is required."),
    policy.maxDurationTargetSeconds !== undefined
      ? pass(`${prefix}.duration_limit`, "Maximum duration is configured.")
      : fail(`${prefix}.duration_limit`, "maxDurationTargetSeconds is required."),
    policy.allowedTiers?.length
      ? pass(`${prefix}.allowed_tiers`, "Allowed tier list is configured.")
      : fail(`${prefix}.allowed_tiers`, "allowedTiers is required."),
    policy.allowedQualityModes?.length
      ? pass(`${prefix}.allowed_quality_modes`, "Allowed quality-mode list is configured.")
      : fail(`${prefix}.allowed_quality_modes`, "allowedQualityModes is required.")
  ];
}

function writableLedgerCheck(ledgerPath) {
  const absolutePath = resolve(repoRoot, ledgerPath);
  const probePath = join(dirname(absolutePath), `.cinejelly-ledger-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(probePath, "probe\n", "utf8");
    rmSync(probePath, { force: true });
    return pass("client_usage_ledger", "Usage ledger path is configured and writable.");
  } catch (error) {
    return fail("client_usage_ledger", `Usage ledger path is not writable: ${redactText(error instanceof Error ? error.message : String(error))}`);
  }
}

function buildAttestationEvidence(attestationPath) {
  const absolutePath = resolve(repoRoot, attestationPath);
  if (!existsSync(absolutePath)) {
    return {
      checks: [fail("billing_admin_attestation", `Missing non-secret operator attestation at ${toRepoRelative(attestationPath)}.`)],
      summary: {
        configured: false,
        path: toRepoRelative(attestationPath)
      }
    };
  }

  try {
    const attestation = JSON.parse(readFileSync(absolutePath, "utf8"));
    const checks = validateAttestation(attestation);
    return {
      checks,
      summary: summarizeAttestation(attestation)
    };
  } catch (error) {
    return {
      checks: [fail("billing_admin_attestation", `Attestation is not valid JSON: ${redactText(error instanceof Error ? error.message : String(error))}`)],
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
    attestation?.schemaVersion === "cinejelly.billing-admin-attestation.v1"
      ? pass("attestation.schema", "Billing/admin attestation schema is recognized.")
      : fail("attestation.schema", "schemaVersion must be cinejelly.billing-admin-attestation.v1.")
  );
  checks.push(requiredTextCheck(attestation?.approvedBy, "attestation.approved_by", "approvedBy"));
  checks.push(dateTimeCheck(attestation?.approvedAt, "attestation.approved_at", "approvedAt"));
  checks.push(enumCheck(attestation?.customerTrafficMode, ["paid_customer", "pilot_contract"], "attestation.customer_traffic_mode", "customerTrafficMode must be paid_customer or pilot_contract."));
  checks.push(enumCheck(attestation?.billingProvider, ["stripe", "paddle", "lemonsqueezy", "manual_contract", "external"], "attestation.billing_provider", "billingProvider must identify the approved billing route."));
  checks.push(httpsUrlCheck(attestation?.termsUrl, "attestation.terms_url", "termsUrl"));
  checks.push(httpsUrlCheck(attestation?.privacyUrl, "attestation.privacy_url", "privacyUrl"));
  checks.push(httpsUrlCheck(attestation?.refundPolicyUrl, "attestation.refund_policy_url", "refundPolicyUrl"));
  checks.push(requiredTextCheck(attestation?.taxHandlingOwner, "attestation.tax_handling_owner", "taxHandlingOwner"));
  checks.push(requiredTextCheck(attestation?.supportContact, "attestation.support_contact", "supportContact"));

  const lifecycle = attestation?.accountLifecycle;
  checks.push(requiredTextCheck(lifecycle?.provisioning, "attestation.lifecycle.provisioning", "accountLifecycle.provisioning"));
  checks.push(requiredTextCheck(lifecycle?.suspension, "attestation.lifecycle.suspension", "accountLifecycle.suspension"));
  checks.push(requiredTextCheck(lifecycle?.apiKeyRotation, "attestation.lifecycle.api_key_rotation", "accountLifecycle.apiKeyRotation"));
  checks.push(requiredTextCheck(lifecycle?.refundHandling, "attestation.lifecycle.refund_handling", "accountLifecycle.refundHandling"));
  checks.push(requiredTextCheck(lifecycle?.chargebackHandling, "attestation.lifecycle.chargeback_handling", "accountLifecycle.chargebackHandling"));

  const spendControls = attestation?.spendControls;
  checks.push(
    spendControls?.requiresClientPolicy === true
      ? pass("attestation.spend_controls.require_client_policy", "Attestation requires client policy for paid renders.")
      : fail("attestation.spend_controls.require_client_policy", "spendControls.requiresClientPolicy must be true.")
  );
  checks.push(requiredTextCheck(spendControls?.emergencyDisableProcedure, "attestation.spend_controls.emergency_disable", "spendControls.emergencyDisableProcedure"));
  checks.push(requiredTextCheck(spendControls?.quotaReviewCadence, "attestation.spend_controls.quota_review", "spendControls.quotaReviewCadence"));
  return checks;
}

async function buildAdminEndpointEvidence({ baseUrl, environmentKind, auth, timeoutMs }) {
  if (!baseUrl) {
    return {
      checks: [fail("admin_client_policy_endpoint", "CINEJELLY_DEPLOYMENT_BASE_URL or --base-url is required to verify /v1/admin/client-policy.")],
      summary: {
        captured: false
      }
    };
  }
  if (environmentKind !== "deployment") {
    return {
      checks: [fail("admin_client_policy_endpoint", "Billing/admin evidence must be captured from a real HTTPS deployment host, not localhost.")],
      summary: {
        captured: false,
        baseUrl: safeBaseUrl(baseUrl),
        environmentKind
      }
    };
  }
  if (!auth.token) {
    return {
      checks: [fail("admin_client_policy_endpoint", `${auth.tokenEnvName} must be set to call /v1/admin/client-policy.`)],
      summary: {
        captured: false,
        baseUrl: safeBaseUrl(baseUrl),
        environmentKind,
        authTokenProvided: false
      }
    };
  }

  const endpoint = await fetchAdminEndpoint(baseUrl, auth.token, timeoutMs);
  const payload = endpoint.payload && typeof endpoint.payload === "object" ? endpoint.payload : {};
  const checks = [];
  checks.push(
    endpoint.httpStatus === 200
      ? pass("admin_client_policy_endpoint", "/v1/admin/client-policy returned HTTP 200.")
      : fail("admin_client_policy_endpoint", `/v1/admin/client-policy returned HTTP ${endpoint.httpStatus ?? "missing"}.`)
  );
  checks.push(
    payload.requireClientPolicyForRender === true
      ? pass("admin_endpoint.require_client_policy", "Deployment admin endpoint reports client policy is required.")
      : fail("admin_endpoint.require_client_policy", "Deployment admin endpoint does not report requireClientPolicyForRender=true.")
  );
  checks.push(
    payload.usageLedgerConfigured === true
      ? pass("admin_endpoint.usage_ledger", "Deployment admin endpoint reports a usage ledger is configured.")
      : fail("admin_endpoint.usage_ledger", "Deployment admin endpoint does not report a configured usage ledger.")
  );
  checks.push(
    Number(payload.enabledClientCount ?? 0) > 0
      ? pass("admin_endpoint.enabled_clients", "Deployment admin endpoint reports enabled client policies.")
      : fail("admin_endpoint.enabled_clients", "Deployment admin endpoint does not report enabled client policies.")
  );
  return {
    checks,
    summary: {
      captured: true,
      baseUrl: safeBaseUrl(baseUrl),
      environmentKind,
      httpStatus: endpoint.httpStatus,
      durationMs: endpoint.durationMs,
      payload: redactAdminPayload(payload),
      ...(endpoint.error ? { error: endpoint.error } : {})
    }
  };
}

async function fetchAdminEndpoint(baseUrl, token, timeoutMs) {
  const startedAtMs = Date.now();
  const url = new URL(baseUrl.href);
  url.pathname = `${baseUrl.pathname}/v1/admin/client-policy`.replace(/\/{2,}/g, "/");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    const text = await response.text();
    return {
      httpStatus: response.status,
      durationMs: Date.now() - startedAtMs,
      payload: redactUnknown(parseJsonPayload(text))
    };
  } catch (error) {
    return {
      httpStatus: undefined,
      durationMs: Date.now() - startedAtMs,
      payload: {},
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

function redactAdminPayload(payload) {
  const redacted = redactUnknown(payload);
  if (!redacted || typeof redacted !== "object") {
    return {};
  }
  return redacted;
}

function summarizeAttestation(attestation) {
  return {
    configured: true,
    schemaVersion: attestation?.schemaVersion,
    approvedAt: attestation?.approvedAt,
    approvedBy: redactText(String(attestation?.approvedBy ?? "")),
    billingProvider: attestation?.billingProvider,
    customerTrafficMode: attestation?.customerTrafficMode,
    termsUrl: attestation?.termsUrl,
    privacyUrl: attestation?.privacyUrl,
    refundPolicyUrl: attestation?.refundPolicyUrl,
    taxHandlingOwner: redactText(String(attestation?.taxHandlingOwner ?? "")),
    supportContact: redactText(String(attestation?.supportContact ?? ""))
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
    actions.push("Archive this billing/admin/quota report with release evidence.");
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
    throw new Error("Billing/admin deployment evidence requires an https base URL.");
  }
  if (baseUrl.protocol === "http:" && !isLocalhost(baseUrl.hostname)) {
    throw new Error("Plain http is allowed only for localhost billing/admin smoke captures.");
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
  return resolve(repoRoot, path).startsWith(repoRoot) ? resolve(repoRoot, path).slice(repoRoot.length + 1) : path;
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
        schemaVersion: "cinejelly.billing-admin-ops.v1",
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
