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
  /**
   * Optional deterministic seed for reproducible generations. Locking a seed keeps a
   * chosen cinematic look consistent across candidates and across shots of one product.
   */
  readonly seed?: number;
  /**
   * Optional classifier-free guidance strength for prompt/reference adherence.
   */
  readonly guidanceScale?: number;
}

export interface ModelPreferences {
  readonly seedanceModelId?: string;
}

export interface ProviderModelSettings {
  readonly llmModel: string;
  /**
   * Optional dedicated "writer" model for the CREATIVE TEXT stages (Creative Brief Analyst styleDna,
   * Story Architect script/dialogue, Script Enhancer). These stages set the ceiling on script logic,
   * natural human voice, and per-request styleDna quality, so production should point them at a strong
   * frontier model even when `llmModel` stays a cheaper vision model for the image/frame INSPECTION
   * stages. Falls back to `llmModel` when unset, so existing deployments are unchanged.
   */
  readonly creativeLlmModel?: string;
  readonly seedanceMiniModel?: string;
  readonly seedanceStandardModel: string;
  readonly seedanceFastModel: string;
  /** Optional still-image model (e.g. nano-banana-pro) for keyframe-first generation. */
  readonly imageModel?: string;
  /**
   * Optional reference-capable image model (e.g. google/nano-banana-2/reference-to-image) used
   * whenever an image request carries identity/product reference images, so keyframes conditioned
   * on cast-portrait anchors run through a model that actually honors references. Falls back to
   * imageModel when unset.
   */
  readonly imageReferenceModel?: string;
  /** Optional speech-to-text model for subtitle generation from user audio. */
  readonly speechModel?: string;
  /**
   * Optional audio-driven avatar model (e.g. bytedance/avatar-omni-human-v1.5) for TALKING shots:
   * portrait image + TTS voiceover audio -> lip-synced, emoting, gesturing character video. This is
   * the Topview-class architecture move — general video models render b-roll/action, but a person
   * speaking to camera is routed here so delivery stops feeling stiff and emotionless.
   */
  readonly avatarModel?: string;
  /** Optional text-to-speech model (e.g. elevenlabs/v3/text-to-speech) that voices talking shots. */
  readonly ttsModel?: string;
  /** Optional TTS voice id/name (multilingual voices: Bella, Charlie, Liam, Jessica). */
  readonly ttsVoice?: string;
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
  /** Root of the output/uploads storage, for resolving upload:// reference handles. */
  readonly uploadsOutputRoot?: string;
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
  bitrateMode: "high",
  watermark: false,
  returnLastFrame: true
};
