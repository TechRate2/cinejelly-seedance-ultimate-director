/**
 * Secret-safe runtime configuration loader.
 * Model IDs are required from environment variables so business logic never hardcodes provider choices.
 */

import type { AtlasCloudRuntimeSettings, RuntimeSettings } from "../types/settings.js";

const DEFAULT_ATLAS_API_BASE_URL = "https://api.atlascloud.ai/v1";
const DEFAULT_ATLAS_ASSET_BASE_URL = "https://console.atlascloud.ai/api/v1";

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
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadAtlasCloudSettings(env: NodeJS.ProcessEnv = process.env): AtlasCloudRuntimeSettings {
  return {
    apiKey: requireEnv("ATLASCLOUD_API_KEY", env),
    apiBaseUrl: env.ATLASCLOUD_API_BASE_URL?.trim() || DEFAULT_ATLAS_API_BASE_URL,
    assetBaseUrl: env.ATLASCLOUD_ASSET_BASE_URL?.trim() || DEFAULT_ATLAS_ASSET_BASE_URL,
    models: {
      llmModel: requireEnv("ATLASCLOUD_LLM_MODEL", env),
      seedanceStandardModel: requireEnv("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", env),
      seedanceFastModel: requireEnv("ATLASCLOUD_SEEDANCE_FAST_MODEL", env)
    },
    requestTimeoutMs: optionalIntegerEnv("CINEJELLY_REQUEST_TIMEOUT_MS", env, 120_000),
    pollingIntervalMs: optionalIntegerEnv("CINEJELLY_POLLING_INTERVAL_MS", env, 5_000),
    pollingTimeoutMs: optionalIntegerEnv("CINEJELLY_POLLING_TIMEOUT_MS", env, 1_800_000)
  };
}

export function loadRuntimeSettings(env: NodeJS.ProcessEnv = process.env): RuntimeSettings {
  return {
    atlasCloud: loadAtlasCloudSettings(env)
  };
}
