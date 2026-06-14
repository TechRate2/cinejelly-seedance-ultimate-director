/**
 * Flexible Seedance settings validation and model selection.
 * This module turns user-facing controls into provider-neutral generation settings.
 */

import type { AtlasCloudRuntimeSettings, FlexibleSeedanceSettings, QualityMode } from "../types/settings.js";
import type { VideoGenerationSettings } from "../types/provider.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../types/settings.js";

export const MIN_TOTAL_DURATION_SECONDS = 15;
export const MAX_TOTAL_DURATION_SECONDS = 480;
export const MIN_CLIP_DURATION_SECONDS = 4;
export const MAX_CLIP_DURATION_SECONDS = 15;
export const SEEDANCE_TEST_TAKE_DURATION_SECONDS = MIN_CLIP_DURATION_SECONDS;

export const SPEED_TIERS = ["fast", "standard"] as const;
export const QUALITY_MODES = ["economy", "standard", "high", "ultimate"] as const;
export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const RATIOS = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export const AUDIO_MODES = ["none", "native", "guided", "post", "hybrid"] as const;

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
  atlasCloud: AtlasCloudRuntimeSettings
): string {
  return settings.tier === "fast"
    ? atlasCloud.models.seedanceFastModel
    : atlasCloud.models.seedanceStandardModel;
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
    watermark: settings.watermark,
    returnLastFrame: settings.returnLastFrame
  };
}

function validateFlexibleSettings(settings: FlexibleSeedanceSettings): void {
  validateOption("tier", settings.tier, SPEED_TIERS);
  validateOption("resolution", settings.resolution, RESOLUTIONS);
  validateOption("qualityMode", settings.qualityMode, QUALITY_MODES);
  validateOption("ratio", settings.ratio, RATIOS);
  validateOption("audioMode", settings.audioMode, AUDIO_MODES);
  validateBoolean("watermark", settings.watermark);
  validateBoolean("returnLastFrame", settings.returnLastFrame);
  validateTotalDuration(settings.durationTargetSeconds);
  if (
    settings.maxCostUsd !== undefined &&
    (!Number.isFinite(settings.maxCostUsd) || settings.maxCostUsd <= 0)
  ) {
    throw new Error("maxCostUsd must be greater than zero when provided.");
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
