/**
 * Flexible Seedance settings validation and model selection.
 * This module turns user-facing controls into provider-neutral generation settings.
 */

import type { AtlasCloudRuntimeSettings, FlexibleSeedanceSettings, QualityMode } from "../types/settings.js";
import type { VideoGenerationSettings } from "../types/provider.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../types/settings.js";

const MIN_TOTAL_DURATION_SECONDS = 15;
const MAX_TOTAL_DURATION_SECONDS = 480;
const MIN_CLIP_DURATION_SECONDS = 4;
const MAX_CLIP_DURATION_SECONDS = 15;

export interface NormalizedSeedanceSettings extends FlexibleSeedanceSettings {
  readonly candidateCount: number;
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

  validateTotalDuration(settings.durationTargetSeconds);

  return {
    ...settings,
    candidateCount: candidateCountForQuality(settings.qualityMode),
    requiresStrictInspection: settings.qualityMode === "high" || settings.qualityMode === "ultimate",
    usesTestTakes: settings.qualityMode !== "economy"
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
