import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
  businessPlanPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  baseUrl: process.env.ATLASCLOUD_BILLING_BASE_URL || "https://api.atlascloud.ai/public/v1",
  apiKeyEnv: process.env.ATLASCLOUD_BILLING_API_KEY ? "ATLASCLOUD_BILLING_API_KEY" : "ATLASCLOUD_API_KEY",
  fallbackApiKeyEnv: "ATLASCLOUD_API_KEY",
  maxBudgetUsd: Number(process.env.CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD || "5"),
  timeoutMs: 15_000
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|policy|expires|sig/i;

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    confirmLiveNetwork: false,
    plannedCostUsd: undefined
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--business-plan-report", "businessPlanPath"],
    ["--base-url", "baseUrl"],
    ["--api-key-env", "apiKeyEnv"],
    ["--fallback-api-key-env", "fallbackApiKeyEnv"],
    ["--max-budget-usd", "maxBudgetUsd"],
    ["--planned-cost-usd", "plannedCostUsd"],
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
    if (arg === "--confirm-live-network") {
      options.confirmLiveNetwork = true;
      continue;
    }
    if (arg === "--no-api-key-fallback") {
      options.fallbackApiKeyEnv = undefined;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = numericOption(key) ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return ["maxBudgetUsd", "plannedCostUsd", "timeoutMs"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Validate Atlas billing readiness without provider spend.

Usage:
  npm.cmd run validation:atlas-billing
  npm.cmd run validation:atlas-billing -- --confirm-live-network

Options:
  --confirm-live-network           Call Atlas Billing Public API /balance. Without this flag the command is local-only.
  --business-plan-report <path>    Used to derive planned paid validation cost. Default: ${defaults.businessPlanPath}
  --base-url <url>                 Atlas billing public base URL. Default: ${defaults.baseUrl}
  --api-key-env <name>             Env var containing a billing-capable Atlas key. Default: ${defaults.apiKeyEnv}
  --fallback-api-key-env <name>    Fallback env var. Default: ${defaults.fallbackApiKeyEnv}
  --no-api-key-fallback            Disable fallback to ATLASCLOUD_API_KEY.
  --max-budget-usd <amount>        Approved validation budget. Default: ${defaults.maxBudgetUsd}
  --planned-cost-usd <amount>      Override planned paid validation cost. Defaults to current business-plan known estimate.
  --timeout-ms <ms>                Billing API timeout. Default: ${defaults.timeoutMs}
  --output <path>                  JSON report path. Default: ${defaults.outputPath}
  --no-output                      Print only; do not write the report.

This command never calls Atlas model, upload, prediction, image, video, audio, stock, deployment, render, or payment-provider endpoints.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const baseUrl = normalizeBillingBaseUrl(options.baseUrl);
  const apiKey = resolveApiKey(options);
  const costPlan = buildCostPlan(options);
  const localChecks = [
    apiKey.configured
      ? pass("atlas_billing_api_key_configured", `${apiKey.sourceEnv} is configured.`)
      : fail("atlas_billing_api_key_configured", `${options.apiKeyEnv}${options.fallbackApiKeyEnv ? ` or ${options.fallbackApiKeyEnv}` : ""} must be configured.`),
    apiKey.prefixValid
      ? pass("atlas_billing_api_key_prefix", "Atlas key has the documented apikey- prefix.")
      : fail("atlas_billing_api_key_prefix", "Atlas Billing Public API keys should start with apikey-."),
    costPlan.plannedCostUsd <= options.maxBudgetUsd
      ? pass("planned_cost_within_approved_budget", `Planned validation cost ${formatUsd(costPlan.plannedCostUsd)} is within approved budget ${formatUsd(options.maxBudgetUsd)}.`)
      : fail("planned_cost_within_approved_budget", `Planned validation cost ${formatUsd(costPlan.plannedCostUsd)} exceeds approved budget ${formatUsd(options.maxBudgetUsd)}.`)
  ];

  const networkEvidence = options.confirmLiveNetwork && apiKey.value
    ? await fetchBalanceEvidence({ baseUrl, apiKey: apiKey.value, timeoutMs: options.timeoutMs, costPlan, maxBudgetUsd: options.maxBudgetUsd })
    : buildSkippedNetworkEvidence(options.confirmLiveNetwork, apiKey);

  const checks = [
    ...localChecks,
    ...networkEvidence.checks
  ];
  const status = statusFor({ options, apiKey, checks });
  const report = {
    schemaVersion: "cinejelly.atlas-billing-readiness.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: networkEvidence.networkCallsMade,
    providerCallsMade: false,
    checkedInputs: {
      businessPlanPath: toRepoRelative(options.businessPlanPath),
      billingBaseUrl: safeBaseUrl(baseUrl),
      apiKeyEnv: apiKey.sourceEnv ?? options.apiKeyEnv,
      apiKeyConfigured: apiKey.configured,
      confirmLiveNetwork: options.confirmLiveNetwork,
      maxBudgetUsd: options.maxBudgetUsd,
      plannedCostUsd: costPlan.plannedCostUsd
    },
    apiKey: {
      configured: apiKey.configured,
      sourceEnv: apiKey.sourceEnv,
      prefixValid: apiKey.prefixValid
    },
    costPlan,
    atlasBillingPublicApi: networkEvidence.summary,
    checks,
    releaseGateSummary: {
      canUseAsPrePaidAtlasBillingEvidence: status === "pass",
      canRunAtlasSpendWithinApprovedBudget: status === "pass" && costPlan.plannedCostUsd <= options.maxBudgetUsd,
      canReleaseToCustomerTraffic: false,
      releaseBlocker:
        status === "pass"
          ? "Atlas billing readiness passed; this is pre-paid-spend evidence only, not commercial release approval."
          : "Atlas billing readiness is incomplete or planned validation exceeds the approved budget."
    },
    nextActions: nextActionsFor({ status, checks, options, costPlan })
  };

  if (options.writeReport) {
    writeReport(options.outputPath, redactUnknown(report));
  }
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (!Number.isFinite(options.maxBudgetUsd) || options.maxBudgetUsd < 0) {
    throw new Error("--max-budget-usd must be a non-negative number.");
  }
  if (options.plannedCostUsd !== undefined && (!Number.isFinite(options.plannedCostUsd) || options.plannedCostUsd < 0)) {
    throw new Error("--planned-cost-usd must be a non-negative number.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 1000 to 120000.");
  }
}

function normalizeBillingBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Atlas billing base URL must use HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Atlas billing base URL must not include credentials, query strings, or fragments.");
  }
  if (isLocalhost(url.hostname)) {
    throw new Error("Atlas billing base URL must not be localhost.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/public/v1")) {
    throw new Error("Atlas billing base URL must end with /public/v1.");
  }
  return url;
}

function resolveApiKey(options) {
  const primary = options.apiKeyEnv ? process.env[options.apiKeyEnv]?.trim() : undefined;
  const fallback =
    options.fallbackApiKeyEnv && options.fallbackApiKeyEnv !== options.apiKeyEnv
      ? process.env[options.fallbackApiKeyEnv]?.trim()
      : undefined;
  const value = primary || fallback;
  const sourceEnv = primary ? options.apiKeyEnv : value ? options.fallbackApiKeyEnv : undefined;
  return {
    value,
    sourceEnv,
    configured: Boolean(value),
    prefixValid: typeof value === "string" && value.startsWith("apikey-")
  };
}

function buildCostPlan(options) {
  const businessPlan = readJsonIfExists(options.businessPlanPath);
  const plannedCostUsd =
    options.plannedCostUsd ??
    numberOrUndefined(businessPlan?.costPlan?.knownPaidEstimateUsd) ??
    options.maxBudgetUsd;
  return {
    source: options.plannedCostUsd !== undefined ? "cli" : businessPlan ? "business_plan" : "max_budget_default",
    plannedCostUsd,
    maxBudgetUsd: options.maxBudgetUsd,
    withinApprovedBudget: plannedCostUsd <= options.maxBudgetUsd,
    businessPlanStatus: businessPlan?.status,
    businessPlanBudgetFit: businessPlan?.costPlan?.budgetFit
  };
}

function buildSkippedNetworkEvidence(confirmLiveNetwork, apiKey) {
  if (!confirmLiveNetwork) {
    return {
      networkCallsMade: false,
      checks: [
        fail("atlas_billing_live_network_confirmation", "--confirm-live-network is required before calling Atlas Billing Public API.")
      ],
      summary: {
        captured: false,
        reason: "blocked_by_network_confirmation"
      }
    };
  }
  return {
    networkCallsMade: false,
    checks: [
      fail("atlas_billing_live_network_confirmation", "Atlas billing call was not attempted because no billing-capable API key is configured.")
    ],
    summary: {
      captured: false,
      reason: apiKey.configured ? "invalid_api_key_shape" : "missing_api_key"
    }
  };
}

async function fetchBalanceEvidence({ baseUrl, apiKey, timeoutMs, costPlan, maxBudgetUsd }) {
  const endpoint = new URL(`${baseUrl.href.replace(/\/$/, "")}/balance`);
  const startedAtMs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    const text = await response.text();
    const payload = parseJsonPayload(text);
    const balanceEvidence = extractBalanceEvidence(payload);
    const balance = balanceEvidence.available ?? balanceEvidence.fallback;
    const checks = [
      response.status === 200
        ? pass("atlas_billing_balance_http", "Atlas Billing Public API /balance returned HTTP 200.")
        : fail("atlas_billing_balance_http", `Atlas Billing Public API /balance returned HTTP ${response.status}.`),
      balance
        ? pass("atlas_billing_balance_parse", "Atlas balance response includes a parseable available money value.")
        : fail("atlas_billing_balance_parse", "Atlas balance response did not include a parseable money value."),
      balance?.currency?.toLowerCase() === "usd"
        ? pass("atlas_billing_balance_currency", "Atlas available balance currency is USD.")
        : fail("atlas_billing_balance_currency", "Atlas balance currency is not USD or was not returned."),
      balance && balance.amount >= maxBudgetUsd
        ? pass("atlas_billing_balance_covers_approved_budget", `Atlas balance covers the approved budget ${formatUsd(maxBudgetUsd)}.`)
        : fail("atlas_billing_balance_covers_approved_budget", `Atlas balance does not cover the approved budget ${formatUsd(maxBudgetUsd)}.`),
      balance && balance.amount >= costPlan.plannedCostUsd
        ? pass("atlas_billing_balance_covers_planned_cost", `Atlas balance covers planned validation cost ${formatUsd(costPlan.plannedCostUsd)}.`)
        : fail("atlas_billing_balance_covers_planned_cost", `Atlas balance does not cover planned validation cost ${formatUsd(costPlan.plannedCostUsd)}.`)
    ];
    return {
      networkCallsMade: true,
      checks,
      summary: {
        captured: true,
        endpoint: safeUrl(endpoint),
        httpStatus: response.status,
        durationMs: Date.now() - startedAtMs,
        balance: balance ? { valueUsd: balance.amount, currency: balance.currency } : undefined,
        balanceSource: balanceEvidence.available ? "available" : balance ? "fallback" : "missing",
        balanceComponents: balanceEvidence.components,
        creditGrant: balanceEvidence.creditGrant,
        payloadShape: summarizePayloadShape(payload),
        payload: response.status === 200 ? undefined : redactUnknown(payload)
      }
    };
  } catch (error) {
    return {
      networkCallsMade: true,
      checks: [
        fail("atlas_billing_balance_http", `Atlas Billing Public API /balance request failed: ${redactText(error instanceof Error ? error.message : String(error))}`)
      ],
      summary: {
        captured: true,
        endpoint: safeUrl(endpoint),
        durationMs: Date.now() - startedAtMs,
        error: redactText(error instanceof Error ? error.message : String(error))
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function statusFor({ options, apiKey, checks }) {
  if (!apiKey.configured) {
    return "blocked_by_missing_credentials";
  }
  if (!options.confirmLiveNetwork) {
    return "blocked_by_network_confirmation";
  }
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function nextActionsFor({ status, checks, options, costPlan }) {
  const actions = [];
  for (const check of checks) {
    if (check.status === "fail") {
      actions.push(check.message);
    }
    if (check.status === "warn") {
      actions.push(`Review warning: ${check.message}`);
    }
  }
  if (status === "blocked_by_network_confirmation") {
    actions.push("Run npm.cmd run validation:atlas-billing -- --confirm-live-network after confirming this no-spend Atlas billing API call is allowed.");
  }
  if (!costPlan.withinApprovedBudget) {
    actions.push(`Raise --max-budget-usd to at least ${formatUsd(costPlan.plannedCostUsd)} for the current planned paid sequence, or run with --planned-cost-usd for a narrower approved validation slice.`);
  }
  if (status === "pass") {
    actions.push("Archive this Atlas billing readiness report before paid Atlas validation.");
    actions.push("Continue the remaining business-readiness gates before opening paid customer traffic.");
  }
  return [...new Set(actions)];
}

function extractMoney(payload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const direct = moneyFromObject(payload);
  if (direct) {
    return direct;
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const nested = moneyFromObject(value);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function extractBalanceEvidence(payload) {
  const objectPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const available = moneyFromObject(objectPayload.available);
  return {
    available,
    fallback: available ? undefined : extractMoney(payload),
    components: balanceComponents(objectPayload),
    creditGrant: creditGrantSummary(objectPayload.credit_grant)
  };
}

function balanceComponents(payload) {
  const result = {};
  for (const [field, outputName] of [
    ["available", "available"],
    ["cash", "cash"],
    ["bonus", "bonus"],
    ["subscription_bonus", "subscriptionBonus"],
    ["frozen", "frozen"]
  ]) {
    const money = moneyFromObject(payload[field]);
    if (money) {
      result[outputName] = { valueUsd: money.amount, currency: money.currency };
    }
  }
  return result;
}

function creditGrantSummary(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  if (!payload) {
    return undefined;
  }
  const result = {};
  if (typeof payload.status === "string") {
    result.status = payload.status;
  }
  for (const [field, outputName] of [
    ["granted", "granted"],
    ["used", "used"],
    ["remaining_overdraft", "remainingOverdraft"],
    ["overdrawn", "overdrawn"]
  ]) {
    const money = moneyFromObject(payload[field]);
    if (money) {
      result[outputName] = { valueUsd: money.amount, currency: money.currency };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function moneyFromObject(value) {
  const amount = parseFixedMoney(value?.value ?? value?.amount ?? value?.balance);
  const currency = typeof value?.currency === "string" ? value.currency.toLowerCase() : undefined;
  if (amount === undefined || !currency) {
    return undefined;
  }
  return { amount, currency };
}

function parseFixedMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function summarizePayloadShape(payload) {
  if (!payload || typeof payload !== "object") {
    return { type: typeof payload };
  }
  return {
    type: Array.isArray(payload) ? "array" : "object",
    keys: Object.keys(payload).slice(0, 20)
  };
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

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function safeBaseUrl(baseUrl) {
  const safe = new URL(baseUrl.href);
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.href.replace(/\/$/, "");
}

function safeUrl(url) {
  const safe = new URL(url.href);
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.href;
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function formatUsd(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), String(value));
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
        return [key, shouldRedactKeyValue(key, redacted) ? "[REDACTED]" : redacted];
      })
    );
  }
  return value;
}

function shouldRedactKeyValue(key, value) {
  if (typeof value !== "string" || !secretKeyPattern.test(key)) {
    return false;
  }
  if (/env(?:Name)?$/i.test(key) && /^[A-Z][A-Z0-9_]*$/.test(value)) {
    return false;
  }
  return true;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.atlas-billing-readiness.v1",
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
