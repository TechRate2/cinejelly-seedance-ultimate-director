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
import {
  DEFAULT_SEEDANCE_PROVIDER_DURATION,
  DEFAULT_SEEDANCE_PROVIDER_MODES,
  DEFAULT_SEEDANCE_PROVIDER_NAME,
  DEFAULT_SEEDANCE_PROVIDER_REFERENCES,
  DEFAULT_SEEDANCE_PROVIDER_SETTINGS,
  defaultSeedanceResolutionsForModel
} from "../config/seedance-capabilities.js";
import { DEFAULT_SEEDANCE_SETTINGS, type AspectRatio, type BitrateMode, type QualityMode, type Resolution } from "../types/settings.js";
import type { DurationRange, ProviderMode, ReferenceKind } from "../types/provider.js";

export interface RenderSettingsDescriptor {
  readonly schemaVersion: "cinejelly.render-settings.v1";
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
  readonly capabilitySupport: SeedanceCapabilitySupportDescriptor;
}

export interface SeedanceCapabilitySupportDescriptor {
  readonly provider: string;
  readonly capabilitySource: "capability_json" | "documented_default";
  readonly modes: readonly ProviderMode[];
  readonly durations: DurationRange;
  readonly resolutions: readonly Resolution[];
  readonly ratios: readonly AspectRatio[];
  readonly references: readonly ReferenceKind[];
  readonly effectiveSettings: SeedanceEffectiveSettingsDescriptor;
}

export interface SeedanceEffectiveSettingsDescriptor {
  readonly source: "explicit_capability" | "capability_json_defaults" | "documented_default";
  readonly generateAudio: boolean;
  readonly returnLastFrame: boolean;
  readonly bitrateModes: readonly BitrateMode[];
  readonly watermark: boolean;
}

export function buildRenderSettingsDescriptor(env: NodeJS.ProcessEnv = process.env): RenderSettingsDescriptor {
  return {
    schemaVersion: "cinejelly.render-settings.v1",
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
  const capabilityRecords = seedanceCapabilityRecords(env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON);
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
  for (const modelId of capabilityRecords.keys()) {
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
      source: sourceForSelectableModel(entry),
      capabilitySupport: seedanceCapabilitySupportForModel(modelId, entry.configuredTier, capabilityRecords.get(modelId))
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

interface SeedanceCapabilityRecord {
  readonly provider?: unknown;
  readonly modelId: string;
  readonly modes?: unknown;
  readonly durations?: unknown;
  readonly resolutions?: unknown;
  readonly ratios?: unknown;
  readonly references?: unknown;
  readonly settings?: unknown;
}

function seedanceCapabilityRecords(value: string | undefined): Map<string, SeedanceCapabilityRecord> {
  const records = new Map<string, SeedanceCapabilityRecord>();
  if (!value?.trim()) {
    return records;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return records;
    }
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const payload = item as Record<string, unknown>;
      const modelId = typeof payload.modelId === "string" ? payload.modelId.trim() : "";
      if (modelId) {
        records.set(modelId, { ...payload, modelId });
      }
    }
  } catch {
    return records;
  }
  return records;
}

function seedanceCapabilitySupportForModel(
  modelId: string,
  tier: "mini" | "fast" | "standard" | undefined,
  record: SeedanceCapabilityRecord | undefined
): SeedanceCapabilitySupportDescriptor {
  const defaultResolutions = defaultResolutionsForModel(modelId, tier);
  return {
    provider: cleanString(record?.provider) ?? DEFAULT_SEEDANCE_PROVIDER_NAME,
    capabilitySource: record ? "capability_json" : "documented_default",
    modes: cleanAllowedArray(record?.modes, DEFAULT_SEEDANCE_PROVIDER_MODES) ?? DEFAULT_SEEDANCE_PROVIDER_MODES,
    durations: cleanDurationRange(record?.durations) ?? DEFAULT_SEEDANCE_PROVIDER_DURATION,
    resolutions: cleanAllowedArray(record?.resolutions, RESOLUTIONS) ?? defaultResolutions,
    ratios: cleanAllowedArray(record?.ratios, RATIOS) ?? RATIOS,
    references: cleanAllowedArray(record?.references, DEFAULT_SEEDANCE_PROVIDER_REFERENCES) ?? DEFAULT_SEEDANCE_PROVIDER_REFERENCES,
    effectiveSettings: effectiveSeedanceSettings(record)
  };
}

function defaultResolutionsForModel(modelId: string, tier: "mini" | "fast" | "standard" | undefined): readonly Resolution[] {
  return defaultSeedanceResolutionsForModel(modelId, tier);
}

function effectiveSeedanceSettings(record: SeedanceCapabilityRecord | undefined): SeedanceEffectiveSettingsDescriptor {
  const settings = record?.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
    ? (record.settings as Record<string, unknown>)
    : undefined;
  return {
    source: settings ? "explicit_capability" : record ? "capability_json_defaults" : "documented_default",
    generateAudio: typeof settings?.generateAudio === "boolean" ? settings.generateAudio : DEFAULT_SEEDANCE_PROVIDER_SETTINGS.generateAudio ?? true,
    returnLastFrame: typeof settings?.returnLastFrame === "boolean" ? settings.returnLastFrame : DEFAULT_SEEDANCE_PROVIDER_SETTINGS.returnLastFrame ?? true,
    bitrateModes: cleanAllowedArray(settings?.bitrateModes, BITRATE_MODES) ?? DEFAULT_SEEDANCE_PROVIDER_SETTINGS.bitrateModes ?? BITRATE_MODES,
    watermark: typeof settings?.watermark === "boolean" ? settings.watermark : DEFAULT_SEEDANCE_PROVIDER_SETTINGS.watermark ?? true
  };
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanAllowedArray<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[]
): readonly TValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const cleaned = [...new Set(value.filter((item): item is TValue => allowed.includes(item as TValue)))];
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanDurationRange(value: unknown): DurationRange | undefined {
  const durations = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
  if (
    typeof durations?.min !== "number" ||
    typeof durations.max !== "number" ||
    !Number.isFinite(durations.min) ||
    !Number.isFinite(durations.max) ||
    durations.min <= 0 ||
    durations.max < durations.min
  ) {
    return undefined;
  }
  return { min: durations.min, max: durations.max };
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
