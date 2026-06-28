/**
 * Public, secret-free render settings descriptor for API clients and future UI controls.
 */

import {
  AUDIO_MODES,
  BITRATE_MODES,
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
    readonly bitrateMode: typeof BITRATE_MODES;
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
    readonly seedanceMiniModel?: string;
    readonly seedanceStandardModel?: string;
    readonly seedanceFastModel?: string;
  };
  readonly modelSelection: {
    readonly seedance: {
      readonly requestField: "modelPreferences.seedanceModelId";
      readonly policy: "admin_allowlist";
      readonly arbitraryModelIdsAllowed: false;
      readonly defaultModelId?: string;
      readonly selectableModels: readonly SeedanceSelectableModelDescriptor[];
    };
    readonly llm: {
      readonly policy: "admin_configured";
      readonly requestOverrideAllowed: false;
      readonly selectedModelConfigured: boolean;
    };
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
    readonly paidValidationCommand: "npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>";
  };
}

export interface QualityModeDescriptor {
  readonly mode: QualityMode;
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
  readonly usesTestTakes: boolean;
  readonly requiresStrictInspection: boolean;
}

export interface SeedanceSelectableModelDescriptor {
  readonly modelId: string;
  readonly configuredTier?: "mini" | "fast" | "standard";
  readonly capabilityConfigured: boolean;
  readonly source: "configured_tier" | "capability_json" | "configured_tier_and_capability_json";
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
      audioMode: AUDIO_MODES,
      bitrateMode: BITRATE_MODES
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
      ...(env.ATLASCLOUD_SEEDANCE_MINI_MODEL?.trim()
        ? { seedanceMiniModel: env.ATLASCLOUD_SEEDANCE_MINI_MODEL.trim() }
        : {}),
      ...(env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL?.trim()
        ? { seedanceStandardModel: env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL.trim() }
        : {}),
      ...(env.ATLASCLOUD_SEEDANCE_FAST_MODEL?.trim()
        ? { seedanceFastModel: env.ATLASCLOUD_SEEDANCE_FAST_MODEL.trim() }
        : {})
    },
    modelSelection: buildModelSelectionDescriptor(env),
    capabilityConfiguration: describeSeedanceCapabilityConfiguration(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON),
    uiGuidance: {
      hasFirstPartyUi: false,
      currentControlSurface: "http_api_and_cli",
      safeLocalCheckCommand: "npm.cmd run doctor",
      paidValidationCommand: "npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>"
    }
  };
}

function buildModelSelectionDescriptor(env: NodeJS.ProcessEnv): RenderSettingsDescriptor["modelSelection"] {
  const fastModel = env.ATLASCLOUD_SEEDANCE_FAST_MODEL?.trim();
  const miniModel = env.ATLASCLOUD_SEEDANCE_MINI_MODEL?.trim();
  const standardModel = env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL?.trim();
  const capabilityModelIds = seedanceCapabilityModelIds(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON);
  const entries = new Map<string, {
    configuredTier?: "mini" | "fast" | "standard";
    capabilityConfigured: boolean;
  }>();
  if (miniModel) {
    entries.set(miniModel, { configuredTier: "mini", capabilityConfigured: false });
  }
  if (fastModel) {
    entries.set(fastModel, { configuredTier: "fast", capabilityConfigured: false });
  }
  if (standardModel) {
    entries.set(standardModel, { configuredTier: "standard", capabilityConfigured: false });
  }
  for (const modelId of capabilityModelIds) {
    const existing = entries.get(modelId);
    entries.set(modelId, {
      ...(existing?.configuredTier ? { configuredTier: existing.configuredTier } : {}),
      capabilityConfigured: true
    });
  }
  const selectableModels = [...entries.entries()]
    .map(([modelId, entry]): SeedanceSelectableModelDescriptor => ({
      modelId,
      ...(entry.configuredTier ? { configuredTier: entry.configuredTier } : {}),
      capabilityConfigured: entry.capabilityConfigured,
      source: sourceForSelectableModel(entry)
    }))
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
  const defaultModelId = DEFAULT_SEEDANCE_SETTINGS.tier === "mini"
    ? miniModel
    : DEFAULT_SEEDANCE_SETTINGS.tier === "fast"
      ? fastModel
      : standardModel;
  return {
    seedance: {
      requestField: "modelPreferences.seedanceModelId",
      policy: "admin_allowlist",
      arbitraryModelIdsAllowed: false,
      ...(defaultModelId ? { defaultModelId } : {}),
      selectableModels
    },
    llm: {
      policy: "admin_configured",
      requestOverrideAllowed: false,
      selectedModelConfigured: Boolean(env.ATLASCLOUD_LLM_MODEL?.trim())
    }
  };
}

function sourceForSelectableModel(entry: {
  readonly configuredTier?: "mini" | "fast" | "standard";
  readonly capabilityConfigured: boolean;
}): SeedanceSelectableModelDescriptor["source"] {
  if (entry.configuredTier && entry.capabilityConfigured) {
    return "configured_tier_and_capability_json";
  }
  return entry.configuredTier ? "configured_tier" : "capability_json";
}

function seedanceCapabilityModelIds(value: string | undefined): readonly string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }
      const modelId = (item as Record<string, unknown>).modelId;
      return typeof modelId === "string" && modelId.trim() ? [modelId.trim()] : [];
    }))].sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
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
