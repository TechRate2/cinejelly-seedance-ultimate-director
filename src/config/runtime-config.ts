/**
 * Secret-safe runtime configuration loader.
 * Model IDs are required from environment variables so business logic never hardcodes provider choices.
 */

import type { ProviderCapability } from "../types/provider.js";
import type { CostEstimationSettings } from "../types/cost.js";
import type { RemoteStockProviderSettings } from "../types/material.js";
import type {
  AssemblyRuntimeSettings,
  AtlasCloudRuntimeSettings,
  GeneratedAudioRuntimeSettings,
  MaterialRuntimeSettings,
  RemoteStockRuntimeSettings,
  RuntimeSettings,
  SourceVideoAutoAnalysisSettings
} from "../types/settings.js";

const DEFAULT_ATLAS_API_BASE_URL = "https://api.atlascloud.ai/v1";
const DEFAULT_ATLAS_ASSET_BASE_URL = "https://console.atlascloud.ai/api/v1";
const DEFAULT_ATLAS_JSON_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RENDERED_CLIP_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_AUDIO_TRACK_BYTES = 256 * 1024 * 1024;
const DEFAULT_REMOTE_STOCK_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF = 5;
const DEFAULT_SOURCE_VIDEO_ANALYSIS_WORK_DIR = "assets/output_deliverables/source-video-analysis-work";
const DEFAULT_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS = 8;
const DEFAULT_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES = 12;
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

function optionalPathEnv(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name]?.trim();
  if (!value) {
    return undefined;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Environment variable ${name} must not contain control characters.`);
  }
  return value;
}

function optionalStringEnv(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[name]?.trim();
  if (!value) {
    return undefined;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Environment variable ${name} must not contain control characters.`);
  }
  return value;
}

function optionalBooleanEnv(name: string, env: NodeJS.ProcessEnv, fallback = false): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  if (value !== "true" && value !== "false") {
    throw new Error(`Environment variable ${name} must be true or false when set.`);
  }
  return value === "true";
}

export function loadAtlasCloudSettings(env: NodeJS.ProcessEnv = process.env): AtlasCloudRuntimeSettings {
  const seedanceCapabilities = parseCapabilitiesEnv(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON);
  const llmApiKey = optionalStringEnv("ATLASCLOUD_LLM_API_KEY", env);
  return {
    apiKey: requireEnv("ATLASCLOUD_API_KEY", env),
    ...(llmApiKey ? { llmApiKey } : {}),
    apiBaseUrl: optionalHttpsUrlEnv("ATLASCLOUD_API_BASE_URL", env, DEFAULT_ATLAS_API_BASE_URL),
    assetBaseUrl: optionalHttpsUrlEnv("ATLASCLOUD_ASSET_BASE_URL", env, DEFAULT_ATLAS_ASSET_BASE_URL),
    models: {
      llmModel: requireEnv("ATLASCLOUD_LLM_MODEL", env),
      seedanceStandardModel: requireEnv("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", env),
      seedanceFastModel: requireEnv("ATLASCLOUD_SEEDANCE_FAST_MODEL", env)
    },
    ...(seedanceCapabilities ? { seedanceCapabilities } : {}),
    requestTimeoutMs: optionalIntegerEnv("CINEJELLY_REQUEST_TIMEOUT_MS", env, 120_000),
    maxJsonResponseBytes: optionalIntegerEnv(
      "CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES",
      env,
      DEFAULT_ATLAS_JSON_RESPONSE_MAX_BYTES
    ),
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
    assembly: loadAssemblyRuntimeSettings(env),
    material: loadMaterialRuntimeSettings(env),
    generatedAudio: loadGeneratedAudioRuntimeSettings(env),
    sourceVideoAutoAnalysis: loadSourceVideoAutoAnalysisSettings(env)
  };
}

export function loadSourceVideoAutoAnalysisSettings(
  env: NodeJS.ProcessEnv = process.env
): SourceVideoAutoAnalysisSettings {
  return {
    enabled: optionalBooleanEnv("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS", env, false),
    workDirectory:
      optionalPathEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR", env) ??
      DEFAULT_SOURCE_VIDEO_ANALYSIS_WORK_DIR,
    frameIntervalSeconds: optionalIntegerEnv(
      "CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS",
      env,
      DEFAULT_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS
    ),
    maxFrames: optionalIntegerEnv(
      "CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES",
      env,
      DEFAULT_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES
    ),
    failOnError: optionalBooleanEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR", env, false)
  };
}

export function loadMaterialRuntimeSettings(env: NodeJS.ProcessEnv = process.env): MaterialRuntimeSettings {
  const localCatalogPath = optionalPathEnv("CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH", env);
  return {
    ...(localCatalogPath ? { localCatalogPath } : {}),
    remoteStock: loadRemoteStockRuntimeSettings(env)
  };
}

export function loadGeneratedAudioRuntimeSettings(
  env: NodeJS.ProcessEnv = process.env
): GeneratedAudioRuntimeSettings {
  const assetResolutionCatalogPath = optionalPathEnv(
    "CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH",
    env
  );
  return {
    ...(assetResolutionCatalogPath ? { assetResolutionCatalogPath } : {})
  };
}

export function loadRemoteStockRuntimeSettings(env: NodeJS.ProcessEnv = process.env): RemoteStockRuntimeSettings {
  const enabled = optionalBooleanEnv("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS", env, false);
  const requestTimeoutMs = optionalIntegerEnv(
    "CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS",
    env,
    DEFAULT_REMOTE_STOCK_REQUEST_TIMEOUT_MS
  );
  const maxResultsPerBrief = optionalIntegerEnv(
    "CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF",
    env,
    DEFAULT_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF
  );
  const providers = enabled ? remoteStockProviders(env, requestTimeoutMs, maxResultsPerBrief) : [];
  if (enabled && providers.length === 0) {
    throw new Error(
      "CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS requires at least one approved provider key."
    );
  }

  return {
    enabled,
    requestTimeoutMs,
    maxResultsPerBrief,
    providers
  };
}

function remoteStockProviders(
  env: NodeJS.ProcessEnv,
  requestTimeoutMs: number,
  maxResultsPerBrief: number
): readonly RemoteStockProviderSettings[] {
  const providers: RemoteStockProviderSettings[] = [];
  const pexelsApiKey = optionalStringEnv("PEXELS_API_KEY", env);
  if (pexelsApiKey) {
    providers.push({
      source: "pexels",
      apiKey: pexelsApiKey,
      requestTimeoutMs,
      maxResultsPerBrief
    });
  }
  const pixabayApiKey = optionalStringEnv("PIXABAY_API_KEY", env);
  if (pixabayApiKey) {
    providers.push({
      source: "pixabay",
      apiKey: pixabayApiKey,
      requestTimeoutMs,
      maxResultsPerBrief
    });
  }
  const coverrApiKey = optionalStringEnv("COVERR_API_KEY", env);
  const coverrCommercialUseApproved = optionalBooleanEnv(
    "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED",
    env,
    false
  );
  if (coverrApiKey && coverrCommercialUseApproved) {
    providers.push({
      source: "coverr",
      apiKey: coverrApiKey,
      commercialUseApproved: true,
      requestTimeoutMs,
      maxResultsPerBrief
    });
  }
  return providers;
}

export function loadAssemblyRuntimeSettings(env: NodeJS.ProcessEnv = process.env): AssemblyRuntimeSettings {
  return {
    maxRenderedClipBytes: optionalIntegerEnv(
      "CINEJELLY_MAX_RENDERED_CLIP_BYTES",
      env,
      DEFAULT_MAX_RENDERED_CLIP_BYTES
    ),
    maxAudioTrackBytes: optionalIntegerEnv(
      "CINEJELLY_MAX_AUDIO_TRACK_BYTES",
      env,
      DEFAULT_MAX_AUDIO_TRACK_BYTES
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
