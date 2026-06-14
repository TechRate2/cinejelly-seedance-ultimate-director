/**
 * Public, secret-free render settings descriptor for API clients and future UI controls.
 */

import {
  AUDIO_MODES,
  MAX_CLIP_DURATION_SECONDS,
  MAX_TOTAL_DURATION_SECONDS,
  MIN_CLIP_DURATION_SECONDS,
  MIN_TOTAL_DURATION_SECONDS,
  QUALITY_MODES,
  RATIOS,
  RESOLUTIONS,
  SEEDANCE_TEST_TAKE_DURATION_SECONDS,
  SPEED_TIERS,
  candidateCountForQuality,
  repairAttemptCountForQuality,
  usesTestTakesForQuality
} from "../config/seedance-settings.js";
import { DEFAULT_SEEDANCE_SETTINGS, type QualityMode } from "../types/settings.js";

export interface RenderSettingsDescriptor {
  readonly schemaVersion: "cinejelly.render-settings.v1";
  readonly sourcePatternOrigins: readonly string[];
  readonly defaults: typeof DEFAULT_SEEDANCE_SETTINGS;
  readonly options: {
    readonly tier: typeof SPEED_TIERS;
    readonly resolution: typeof RESOLUTIONS;
    readonly qualityMode: typeof QUALITY_MODES;
    readonly ratio: typeof RATIOS;
    readonly audioMode: typeof AUDIO_MODES;
  };
  readonly constraints: {
    readonly durationTargetSeconds: {
      readonly min: number;
      readonly max: number;
    };
    readonly providerClipDurationSeconds: {
      readonly min: number;
      readonly max: number;
    };
    readonly testTakeDurationSeconds: number;
    readonly maxCostUsd: {
      readonly minExclusive: number;
      readonly optional: true;
    };
  };
  readonly qualityModes: readonly QualityModeDescriptor[];
  readonly selectedModels: {
    readonly llmModelConfigured: boolean;
    readonly llmModel?: string;
    readonly seedanceStandardModel?: string;
    readonly seedanceFastModel?: string;
  };
  readonly capabilityConfiguration: {
    readonly source: "explicit_env" | "documented_default" | "invalid_env";
    readonly configuredRecordCount: number;
    readonly message: string;
  };
  readonly uiGuidance: {
    readonly hasFirstPartyUi: false;
    readonly currentControlSurface: "http_api_and_cli";
    readonly safeLocalCheckCommand: "npm.cmd run doctor";
    readonly paidValidationCommand: "npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend";
  };
}

export interface QualityModeDescriptor {
  readonly mode: QualityMode;
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
  readonly usesTestTakes: boolean;
  readonly requiresStrictInspection: boolean;
}

const SOURCE_PATTERN_ORIGINS = [
  "Emily2040/seedance-2.0",
  "YouMind-OpenLab/awesome-seedance-2-prompts",
  "vericontext/vibeframe",
  "HKUDS/ViMax"
] as const;

export function buildRenderSettingsDescriptor(env: NodeJS.ProcessEnv = process.env): RenderSettingsDescriptor {
  return {
    schemaVersion: "cinejelly.render-settings.v1",
    sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
    defaults: DEFAULT_SEEDANCE_SETTINGS,
    options: {
      tier: SPEED_TIERS,
      resolution: RESOLUTIONS,
      qualityMode: QUALITY_MODES,
      ratio: RATIOS,
      audioMode: AUDIO_MODES
    },
    constraints: {
      durationTargetSeconds: {
        min: MIN_TOTAL_DURATION_SECONDS,
        max: MAX_TOTAL_DURATION_SECONDS
      },
      providerClipDurationSeconds: {
        min: MIN_CLIP_DURATION_SECONDS,
        max: MAX_CLIP_DURATION_SECONDS
      },
      testTakeDurationSeconds: SEEDANCE_TEST_TAKE_DURATION_SECONDS,
      maxCostUsd: {
        minExclusive: 0,
        optional: true
      }
    },
    qualityModes: QUALITY_MODES.map((mode) => ({
      mode,
      candidateCount: candidateCountForQuality(mode),
      repairAttemptCount: repairAttemptCountForQuality(mode),
      usesTestTakes: usesTestTakesForQuality(mode),
      requiresStrictInspection: mode === "high" || mode === "ultimate"
    })),
    selectedModels: {
      llmModelConfigured: Boolean(env.ATLASCLOUD_LLM_MODEL?.trim()),
      ...(env.ATLASCLOUD_LLM_MODEL?.trim() ? { llmModel: env.ATLASCLOUD_LLM_MODEL.trim() } : {}),
      ...(env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL?.trim()
        ? { seedanceStandardModel: env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL.trim() }
        : {}),
      ...(env.ATLASCLOUD_SEEDANCE_FAST_MODEL?.trim()
        ? { seedanceFastModel: env.ATLASCLOUD_SEEDANCE_FAST_MODEL.trim() }
        : {})
    },
    capabilityConfiguration: describeSeedanceCapabilityConfiguration(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON),
    uiGuidance: {
      hasFirstPartyUi: false,
      currentControlSurface: "http_api_and_cli",
      safeLocalCheckCommand: "npm.cmd run doctor",
      paidValidationCommand: "npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend"
    }
  };
}

function describeSeedanceCapabilityConfiguration(value: string | undefined): RenderSettingsDescriptor["capabilityConfiguration"] {
  if (!value?.trim()) {
    return {
      source: "documented_default",
      configuredRecordCount: 0,
      message: "No explicit capability JSON configured; runtime will use documented default assumptions."
    };
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        source: "invalid_env",
        configuredRecordCount: 0,
        message: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON is not a JSON array."
      };
    }
    return {
      source: "explicit_env",
      configuredRecordCount: parsed.length,
      message: "Explicit Seedance capability records are configured; verify them against the current Atlas catalog before customer release."
    };
  } catch {
    return {
      source: "invalid_env",
      configuredRecordCount: 0,
      message: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON is not valid JSON."
    };
  }
}
