import type { ProviderCapability } from "./provider.js";

/**
 * Shared runtime setting types for CineJelly's flexible Seedance workflow.
 * The unions mirror docs/FLEXIBLE_SEEDANCE_SETTINGS.md and stay provider-neutral.
 */

export type SpeedTier = "fast" | "standard";

export type QualityMode = "economy" | "standard" | "high" | "ultimate";

export type Resolution = "480p" | "720p" | "1080p";

export type AspectRatio =
  | "adaptive"
  | "21:9"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16";

export type AudioMode = "none" | "native" | "guided" | "post" | "hybrid";

export interface FlexibleSeedanceSettings {
  readonly tier: SpeedTier;
  readonly resolution: Resolution;
  readonly qualityMode: QualityMode;
  readonly ratio: AspectRatio;
  readonly durationTargetSeconds: number;
  readonly audioMode: AudioMode;
  readonly watermark: boolean;
  readonly returnLastFrame: boolean;
  readonly maxCostUsd?: number;
}

export interface ProviderModelSettings {
  readonly llmModel: string;
  readonly seedanceStandardModel: string;
  readonly seedanceFastModel: string;
}

export interface AtlasCloudRuntimeSettings {
  readonly apiKey: string;
  readonly apiBaseUrl: string;
  readonly assetBaseUrl: string;
  readonly models: ProviderModelSettings;
  readonly seedanceCapabilities?: readonly ProviderCapability[];
  readonly requestTimeoutMs: number;
  readonly pollingIntervalMs: number;
  readonly pollingTimeoutMs: number;
}

export interface RuntimeSettings {
  readonly atlasCloud: AtlasCloudRuntimeSettings;
}

export const DEFAULT_SEEDANCE_SETTINGS: FlexibleSeedanceSettings = {
  tier: "standard",
  resolution: "720p",
  qualityMode: "standard",
  ratio: "16:9",
  durationTargetSeconds: 120,
  audioMode: "hybrid",
  watermark: false,
  returnLastFrame: true
};
