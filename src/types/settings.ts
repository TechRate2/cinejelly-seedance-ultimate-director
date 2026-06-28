import type { AudioGenerationCapability, ProviderCapability } from "./provider.js";
import type { CostEstimationSettings } from "./cost.js";
import type { RemoteStockProviderSettings } from "./material.js";

/**
 * Shared runtime setting types for CineJelly's flexible Seedance workflow.
 * The unions mirror docs/FLEXIBLE_SEEDANCE_SETTINGS.md and stay provider-neutral.
 */

export type SpeedTier = "mini" | "fast" | "standard";

export type QualityMode = "economy" | "standard" | "high" | "ultimate";

export type Resolution = "480p" | "720p" | "1080p" | "720p-SR" | "1080p-SR" | "1440p-SR";

export type AspectRatio =
  | "adaptive"
  | "21:9"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16";

export type AudioMode = "none" | "native" | "guided" | "post" | "hybrid";

export type BitrateMode = "standard" | "high";

export interface FlexibleSeedanceSettings {
  readonly tier: SpeedTier;
  readonly resolution: Resolution;
  readonly qualityMode: QualityMode;
  readonly ratio: AspectRatio;
  readonly durationTargetSeconds: number;
  readonly audioMode: AudioMode;
  readonly bitrateMode: BitrateMode;
  readonly watermark: boolean;
  readonly returnLastFrame: boolean;
  readonly maxCostUsd?: number;
}

export interface ModelPreferences {
  readonly seedanceModelId?: string;
}

export interface ProviderModelSettings {
  readonly llmModel: string;
  readonly seedanceMiniModel?: string;
  readonly seedanceStandardModel: string;
  readonly seedanceFastModel: string;
}

export interface AtlasCloudRuntimeSettings {
  readonly apiKey: string;
  readonly llmApiKey?: string;
  readonly apiBaseUrl: string;
  readonly assetBaseUrl: string;
  readonly models: ProviderModelSettings;
  readonly seedanceCapabilities?: readonly ProviderCapability[];
  readonly generatedAudioCapabilities?: readonly AudioGenerationCapability[];
  readonly requestTimeoutMs: number;
  readonly maxJsonResponseBytes: number;
  readonly pollingIntervalMs: number;
  readonly pollingTimeoutMs: number;
}

export interface AssemblyRuntimeSettings {
  readonly maxRenderedClipBytes: number;
  readonly maxAudioTrackBytes: number;
}

export interface MaterialRuntimeSettings {
  readonly localCatalogPath?: string;
  readonly remoteStock: RemoteStockRuntimeSettings;
}

export interface GeneratedAudioRuntimeSettings {
  readonly assetResolutionCatalogPath?: string;
}

export interface RemoteStockRuntimeSettings {
  readonly enabled: boolean;
  readonly requestTimeoutMs: number;
  readonly maxResultsPerBrief: number;
  readonly providers: readonly RemoteStockProviderSettings[];
}

export interface SourceVideoAutoAnalysisSettings {
  readonly enabled: boolean;
  readonly workDirectory: string;
  readonly frameIntervalSeconds: number;
  readonly maxFrames: number;
  readonly failOnError: boolean;
}

export interface RuntimeSettings {
  readonly atlasCloud: AtlasCloudRuntimeSettings;
  readonly costEstimation: CostEstimationSettings;
  readonly renderConcurrency: number;
  readonly assembly: AssemblyRuntimeSettings;
  readonly material: MaterialRuntimeSettings;
  readonly generatedAudio: GeneratedAudioRuntimeSettings;
  readonly sourceVideoAutoAnalysis: SourceVideoAutoAnalysisSettings;
}

export const DEFAULT_SEEDANCE_SETTINGS: FlexibleSeedanceSettings = {
  tier: "standard",
  resolution: "720p",
  qualityMode: "standard",
  ratio: "16:9",
  durationTargetSeconds: 120,
  audioMode: "hybrid",
  bitrateMode: "standard",
  watermark: false,
  returnLastFrame: true
};
