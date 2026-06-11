/**
 * Secret-safe runtime configuration loader.
 * Model IDs are required from environment variables so business logic never hardcodes provider choices.
 */

import type { ProviderCapability } from "../types/provider.js";
import type { CostEstimationSettings } from "../types/cost.js";
import type { AssemblyRuntimeSettings, AtlasCloudRuntimeSettings, RuntimeSettings } from "../types/settings.js";

const DEFAULT_ATLAS_API_BASE_URL = "https://api.atlascloud.ai/v1";
const DEFAULT_ATLAS_ASSET_BASE_URL = "https://console.atlascloud.ai/api/v1";
const DEFAULT_MAX_RENDERED_CLIP_BYTES = 2 * 1024 * 1024 * 1024;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalIntegerEnv(name: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const value = env[name]?.trim();
  if (!value) {
    return fallback;
  }
  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalNumberEnv(name: string, env: NodeJS.ProcessEnv): number | undefined {
  const value = env[name]?.trim();
  if (!value) {
    return undefined;
  }
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(value)) {
    throw new Error(`Environment variable ${name} must be a non-negative decimal number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative decimal number.`);
  }
  return parsed;
}

function optionalNumberEnvWithFallback(name: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const value = optionalNumberEnv(name, env);
  if (value === undefined) {
    return fallback;
  }
  if (value <= 0) {
    throw new Error(`Environment variable ${name} must be greater than zero.`);
  }
  return value;
}

export function loadAtlasCloudSettings(env: NodeJS.ProcessEnv = process.env): AtlasCloudRuntimeSettings {
  const seedanceCapabilities = parseCapabilitiesEnv(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON);
  return {
    apiKey: requireEnv("ATLASCLOUD_API_KEY", env),
    apiBaseUrl: optionalHttpsUrlEnv("ATLASCLOUD_API_BASE_URL", env, DEFAULT_ATLAS_API_BASE_URL),
    assetBaseUrl: optionalHttpsUrlEnv("ATLASCLOUD_ASSET_BASE_URL", env, DEFAULT_ATLAS_ASSET_BASE_URL),
    models: {
      llmModel: requireEnv("ATLASCLOUD_LLM_MODEL", env),
      seedanceStandardModel: requireEnv("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", env),
      seedanceFastModel: requireEnv("ATLASCLOUD_SEEDANCE_FAST_MODEL", env)
    },
    ...(seedanceCapabilities ? { seedanceCapabilities } : {}),
    requestTimeoutMs: optionalIntegerEnv("CINEJELLY_REQUEST_TIMEOUT_MS", env, 120_000),
    pollingIntervalMs: optionalIntegerEnv("CINEJELLY_POLLING_INTERVAL_MS", env, 5_000),
    pollingTimeoutMs: optionalIntegerEnv("CINEJELLY_POLLING_TIMEOUT_MS", env, 1_800_000)
  };
}

function optionalHttpsUrlEnv(name: string, env: NodeJS.ProcessEnv, fallback: string): string {
  const value = env[name]?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Environment variable ${name} must use https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Environment variable ${name} must not include embedded credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`Environment variable ${name} must not include query strings or fragments.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadRuntimeSettings(env: NodeJS.ProcessEnv = process.env): RuntimeSettings {
  return {
    atlasCloud: loadAtlasCloudSettings(env),
    costEstimation: loadCostEstimationSettings(env),
    renderConcurrency: optionalIntegerEnv("CINEJELLY_RENDER_CONCURRENCY", env, 2),
    assembly: loadAssemblyRuntimeSettings(env)
  };
}

export function loadAssemblyRuntimeSettings(env: NodeJS.ProcessEnv = process.env): AssemblyRuntimeSettings {
  return {
    maxRenderedClipBytes: optionalIntegerEnv(
      "CINEJELLY_MAX_RENDERED_CLIP_BYTES",
      env,
      DEFAULT_MAX_RENDERED_CLIP_BYTES
    )
  };
}

export function loadCostEstimationSettings(env: NodeJS.ProcessEnv = process.env): CostEstimationSettings {
  const renderCostUsdPerSecond = optionalNumberEnv("CINEJELLY_RENDER_COST_USD_PER_SECOND", env);
  const assetRegistrationCostUsd = optionalNumberEnv("CINEJELLY_ASSET_REGISTRATION_COST_USD", env);
  const llmPlanCostUsd = optionalNumberEnv("CINEJELLY_LLM_PLAN_COST_USD", env);

  return {
    ...(renderCostUsdPerSecond !== undefined ? { renderCostUsdPerSecond } : {}),
    ...(assetRegistrationCostUsd !== undefined ? { assetRegistrationCostUsd } : {}),
    ...(llmPlanCostUsd !== undefined ? { llmPlanCostUsd } : {}),
    costBufferMultiplier: optionalNumberEnvWithFallback("CINEJELLY_COST_BUFFER_MULTIPLIER", env, 1)
  };
}

function parseCapabilitiesEnv(value: string | undefined): readonly ProviderCapability[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON must be a JSON array.");
  }
  return parsed.map((item) => validateCapability(item));
}

function validateCapability(value: unknown): ProviderCapability {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (typeof payload.provider !== "string" || typeof payload.modelId !== "string") {
    throw new Error("Provider capability must include provider and modelId strings.");
  }
  if (!Array.isArray(payload.modes) || !Array.isArray(payload.resolutions) || !Array.isArray(payload.ratios) || !Array.isArray(payload.references)) {
    throw new Error("Provider capability must include modes, resolutions, ratios, and references arrays.");
  }
  const durations = payload.durations && typeof payload.durations === "object" ? (payload.durations as Record<string, unknown>) : {};
  if (typeof durations.min !== "number" || typeof durations.max !== "number") {
    throw new Error("Provider capability durations must include numeric min and max.");
  }
  return payload as unknown as ProviderCapability;
}
