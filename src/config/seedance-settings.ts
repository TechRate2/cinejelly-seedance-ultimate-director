/**
 * Flexible Seedance settings validation and model selection.
 * This module turns user-facing controls into provider-neutral generation settings.
 */

import type { AtlasCloudRuntimeSettings, FlexibleSeedanceSettings, ModelPreferences, QualityMode, Resolution } from "../types/settings.js";
import type { VideoGenerationSettings } from "../types/provider.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../types/settings.js";

export const MIN_TOTAL_DURATION_SECONDS = 15;
export const MAX_TOTAL_DURATION_SECONDS = 480;
export const MIN_CLIP_DURATION_SECONDS = 4;
export const MAX_CLIP_DURATION_SECONDS = 15;
export const SEEDANCE_TEST_TAKE_DURATION_SECONDS = MIN_CLIP_DURATION_SECONDS;

/** Bounds for optional deterministic seed and guidance strength controls. */
export const MAX_SEED_VALUE = 2_147_483_647;
export const MIN_GUIDANCE_SCALE = 1;
export const MAX_GUIDANCE_SCALE = 30;

export const SPEED_TIERS = ["mini", "fast", "standard"] as const;
export const QUALITY_MODES = ["economy", "standard", "high", "ultimate"] as const;
export const RESOLUTIONS = ["480p", "720p", "1080p", "720p-SR", "1080p-SR", "1440p-SR"] as const;
export const RATIOS = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export const AUDIO_MODES = ["none", "native", "guided", "post", "hybrid"] as const;
export const BITRATE_MODES = ["standard", "high"] as const;

export interface NormalizedSeedanceSettings extends FlexibleSeedanceSettings {
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
  readonly requiresStrictInspection: boolean;
  readonly usesTestTakes: boolean;
}

export function normalizeSeedanceSettings(
  input: Partial<FlexibleSeedanceSettings> = {}
): NormalizedSeedanceSettings {
  const settings: FlexibleSeedanceSettings = {
    ...DEFAULT_SEEDANCE_SETTINGS,
    ...input
  };

  validateFlexibleSettings(settings);

  return {
    ...settings,
    candidateCount: candidateCountForQuality(settings.qualityMode),
    repairAttemptCount: repairAttemptCountForQuality(settings.qualityMode),
    requiresStrictInspection: settings.qualityMode === "high" || settings.qualityMode === "ultimate",
    usesTestTakes: usesTestTakesForQuality(settings.qualityMode)
  };
}

export function resolveSeedanceModelId(
  settings: Pick<FlexibleSeedanceSettings, "tier">,
  atlasCloud: AtlasCloudRuntimeSettings,
  modelPreferences: ModelPreferences = {}
): string {
  if (modelPreferences.seedanceModelId) {
    assertAllowedSeedanceModelId(modelPreferences.seedanceModelId, atlasCloud);
    return modelPreferences.seedanceModelId;
  }
  if (settings.tier === "mini") {
    return (
      atlasCloud.models.seedanceMiniModel?.trim() ||
      atlasCloud.seedanceCapabilities?.find((capability) =>
        /(^|[-_/])mini([-_/]|$)/i.test(capability.modelId)
      )?.modelId ||
      atlasCloud.models.seedanceFastModel
    );
  }
  return settings.tier === "fast"
    ? atlasCloud.models.seedanceFastModel
    : atlasCloud.models.seedanceStandardModel;
}

export function selectableSeedanceModelIds(atlasCloud: Pick<AtlasCloudRuntimeSettings, "models" | "seedanceCapabilities">): readonly string[] {
  const ids = new Set<string>();
  if (atlasCloud.models.seedanceFastModel.trim()) {
    ids.add(atlasCloud.models.seedanceFastModel.trim());
  }
  if (atlasCloud.models.seedanceMiniModel?.trim()) {
    ids.add(atlasCloud.models.seedanceMiniModel.trim());
  }
  if (atlasCloud.models.seedanceStandardModel.trim()) {
    ids.add(atlasCloud.models.seedanceStandardModel.trim());
  }
  for (const capability of atlasCloud.seedanceCapabilities ?? []) {
    if (capability.modelId.trim()) {
      ids.add(capability.modelId.trim());
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function assertAllowedSeedanceModelId(modelId: string, atlasCloud: AtlasCloudRuntimeSettings): void {
  if (!selectableSeedanceModelIds(atlasCloud).includes(modelId)) {
    throw new Error(`seedanceModelId must be one of the configured admin allowlist models.`);
  }
}

export function toVideoGenerationSettings(
  settings: FlexibleSeedanceSettings,
  clipDurationSeconds: number
): VideoGenerationSettings {
  validateFlexibleSettings(settings);
  validateClipDuration(clipDurationSeconds);

  return {
    durationSeconds: clipDurationSeconds,
    resolution: settings.resolution,
    ratio: settings.ratio,
    generateAudio: settings.audioMode === "native" || settings.audioMode === "guided" || settings.audioMode === "hybrid",
    bitrateMode: settings.bitrateMode,
    watermark: settings.watermark,
    returnLastFrame: settings.returnLastFrame,
    ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
    ...(settings.guidanceScale !== undefined ? { guidanceScale: settings.guidanceScale } : {})
  };
}

function validateFlexibleSettings(settings: FlexibleSeedanceSettings): void {
  validateOption("tier", settings.tier, SPEED_TIERS);
  validateOption("resolution", settings.resolution, RESOLUTIONS);
  validateOption("qualityMode", settings.qualityMode, QUALITY_MODES);
  validateOption("ratio", settings.ratio, RATIOS);
  validateOption("audioMode", settings.audioMode, AUDIO_MODES);
  validateOption("bitrateMode", settings.bitrateMode, BITRATE_MODES);
  validateBoolean("watermark", settings.watermark);
  validateBoolean("returnLastFrame", settings.returnLastFrame);
  validateTotalDuration(settings.durationTargetSeconds);
  if (
    settings.maxCostUsd !== undefined &&
    (!Number.isFinite(settings.maxCostUsd) || settings.maxCostUsd <= 0)
  ) {
    throw new Error("maxCostUsd must be greater than zero when provided.");
  }
  if (
    settings.seed !== undefined &&
    (!Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > MAX_SEED_VALUE)
  ) {
    throw new Error(`seed must be an integer between 0 and ${MAX_SEED_VALUE} when provided.`);
  }
  if (
    settings.guidanceScale !== undefined &&
    (!Number.isFinite(settings.guidanceScale) ||
      settings.guidanceScale < MIN_GUIDANCE_SCALE ||
      settings.guidanceScale > MAX_GUIDANCE_SCALE)
  ) {
    throw new Error(
      `guidanceScale must be between ${MIN_GUIDANCE_SCALE} and ${MAX_GUIDANCE_SCALE} when provided.`
    );
  }
}

function validateOption<TValue extends string>(
  name: string,
  value: unknown,
  allowedValues: readonly TValue[]
): asserts value is TValue {
  if (typeof value !== "string" || !allowedValues.includes(value as TValue)) {
    throw new Error(`${name} must be one of: ${allowedValues.join(", ")}.`);
  }
}

function validateBoolean(name: string, value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }
}

export function candidateCountForQuality(qualityMode: QualityMode): number {
  switch (qualityMode) {
    case "economy":
      return 1;
    case "standard":
      return 2;
    case "high":
      return 3;
    case "ultimate":
      return 4;
  }
}

/**
 * Extra submissions granted when the PROVIDER returns no usable clip, in EVERY quality mode.
 *
 * Distinct from the per-quality repair budget above: a repair re-renders with a corrected prompt
 * because the inspector judged the content wrong, and economy buys none of those because the customer
 * accepted the first take. A failed prediction is different — nothing is wrong with the request, the
 * render simply did not happen, and one dead shot kills the whole job at the inspection gate along
 * with every clip already paid for. Small on purpose: a genuine Atlas outage should surface fast
 * instead of retrying through the customer's balance.
 */
export const PROVIDER_FAILURE_RETRY_ATTEMPTS = 2;

export function repairAttemptCountForQuality(qualityMode: QualityMode): number {
  switch (qualityMode) {
    case "economy":
      return 0;
    case "standard":
      return 1;
    case "high":
      return 2;
    case "ultimate":
      return 3;
  }
}

export function usesTestTakesForQuality(qualityMode: QualityMode): boolean {
  return qualityMode !== "economy";
}

export function seedanceBaseResolution(resolution: Resolution): "480p" | "720p" | "1080p" | "1440p" {
  switch (resolution) {
    case "480p":
      return "480p";
    case "720p":
    case "720p-SR":
      return "720p";
    case "1080p":
    case "1080p-SR":
      return "1080p";
    case "1440p-SR":
      return "1440p";
  }
}

export function seedanceResolutionHeight(resolution: Resolution): 480 | 720 | 1080 | 1440 {
  switch (seedanceBaseResolution(resolution)) {
    case "480p":
      return 480;
    case "720p":
      return 720;
    case "1080p":
      return 1080;
    case "1440p":
      return 1440;
  }
}

export function seedanceUsesSuperResolution(resolution: Resolution): boolean {
  return resolution.endsWith("-SR");
}

function validateTotalDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_TOTAL_DURATION_SECONDS || durationSeconds > MAX_TOTAL_DURATION_SECONDS) {
    throw new Error(
      `Total duration must be between ${MIN_TOTAL_DURATION_SECONDS} and ${MAX_TOTAL_DURATION_SECONDS} seconds.`
    );
  }
}

function validateClipDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_CLIP_DURATION_SECONDS || durationSeconds > MAX_CLIP_DURATION_SECONDS) {
    throw new Error(
      `Seedance clip duration must be between ${MIN_CLIP_DURATION_SECONDS} and ${MAX_CLIP_DURATION_SECONDS} seconds.`
    );
  }
}
