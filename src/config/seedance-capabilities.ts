/**
 * Shared Seedance capability defaults used by provider validation and public settings descriptors.
 */

import {
  MAX_CLIP_DURATION_SECONDS,
  MIN_CLIP_DURATION_SECONDS,
  RATIOS,
  RESOLUTIONS
} from "./seedance-settings.js";
import type { Resolution } from "../types/settings.js";
import type {
  DurationRange,
  ProviderCapability,
  ProviderCapabilitySettings,
  ProviderMode,
  ReferenceKind
} from "../types/provider.js";

export const DEFAULT_SEEDANCE_PROVIDER_NAME = "atlascloud";

export const DEFAULT_SEEDANCE_PROVIDER_MODES: readonly ProviderMode[] = [
  "text_to_video",
  "image_to_video",
  "reference_to_video",
  "video_to_video",
  "extend",
  "edit"
];

export const DEFAULT_SEEDANCE_PROVIDER_REFERENCES: readonly ReferenceKind[] = [
  "image",
  "video",
  "audio",
  "first_frame",
  "last_frame",
  "identity",
  "product",
  "environment",
  "motion",
  "camera",
  "style"
];

export const DEFAULT_SEEDANCE_PROVIDER_DURATION: DurationRange = {
  min: MIN_CLIP_DURATION_SECONDS,
  max: MAX_CLIP_DURATION_SECONDS
};

export const DEFAULT_SEEDANCE_PROVIDER_SETTINGS: ProviderCapabilitySettings = {
  generateAudio: true,
  returnLastFrame: true,
  bitrateModes: ["standard", "high"],
  watermark: true
};

export function isSeedanceMiniModel(modelId: string): boolean {
  return /(^|[-_/])mini([-_/]|$)/i.test(modelId);
}

export function defaultSeedanceResolutionsForModel(
  modelId: string,
  tier?: "mini" | "fast" | "standard"
): readonly Resolution[] {
  return tier === "mini" || isSeedanceMiniModel(modelId)
    ? ["480p", "720p"]
    : RESOLUTIONS;
}

export function defaultSeedanceProviderCapability(
  modelId: string,
  tier?: "mini" | "fast" | "standard"
): ProviderCapability {
  return {
    provider: DEFAULT_SEEDANCE_PROVIDER_NAME,
    modelId,
    modes: DEFAULT_SEEDANCE_PROVIDER_MODES,
    durations: DEFAULT_SEEDANCE_PROVIDER_DURATION,
    resolutions: defaultSeedanceResolutionsForModel(modelId, tier),
    ratios: RATIOS,
    references: DEFAULT_SEEDANCE_PROVIDER_REFERENCES,
    settings: DEFAULT_SEEDANCE_PROVIDER_SETTINGS,
    async: true
  };
}
