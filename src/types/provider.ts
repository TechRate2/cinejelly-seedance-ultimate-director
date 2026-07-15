/**
 * Provider-neutral type contracts used by the model abstraction layer.
 * Application services depend on these shapes, never on Atlas-specific payloads.
 */

import type { AspectRatio, BitrateMode, Resolution } from "./settings.js";
import type { GeneratedAudioIntentKind } from "./audio.js";
import type { ProviderErrorCode } from "../utils/errors.js";

export type ProviderName = "atlascloud" | (string & {});

export type ProviderMode =
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "video_to_video"
  | "extend"
  | "edit";

export type ReferenceKind =
  | "image"
  | "video"
  | "audio"
  | "first_frame"
  | "last_frame"
  | "identity"
  | "product"
  | "environment"
  | "motion"
  | "camera"
  | "style";

export type PredictionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

export type AssetStatus = "pending" | "processing" | "active" | "failed" | "deleted";
export type ProviderCallStatus = "succeeded" | "failed" | "timeout" | "canceled";

export interface DurationRange {
  readonly min: number;
  readonly max: number;
}

export interface ProviderCapability {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly modes: readonly ProviderMode[];
  readonly durations: DurationRange;
  readonly resolutions: readonly Resolution[];
  readonly ratios: readonly AspectRatio[];
  readonly references: readonly ReferenceKind[];
  readonly settings?: ProviderCapabilitySettings;
  readonly async: boolean;
}

export interface ProviderCapabilitySettings {
  readonly generateAudio?: boolean;
  readonly returnLastFrame?: boolean;
  readonly bitrateModes?: readonly BitrateMode[];
  readonly watermark?: boolean;
}

export interface ProviderReference {
  readonly kind: ReferenceKind;
  readonly uri: string;
  readonly role?: string;
  readonly providerAssetId?: string;
  readonly label?: string;
}

export interface ProviderMetadata {
  readonly projectId?: string;
  readonly graphNodeId?: string;
  readonly shotId?: string;
  readonly requestId?: string;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface VideoGenerationSettings {
  readonly durationSeconds: number;
  readonly resolution: Resolution;
  readonly ratio: AspectRatio;
  readonly generateAudio: boolean;
  readonly bitrateMode: BitrateMode;
  readonly watermark: boolean;
  readonly returnLastFrame: boolean;
  /**
   * Optional deterministic seed. When set, the provider is asked to reproduce the same
   * base generation, which lets a cinematic look be locked across candidates and shots.
   */
  readonly seed?: number;
  /**
   * Optional prompt-adherence strength (classifier-free guidance). Higher values follow
   * the prompt/references more strictly; lower values allow more model freedom.
   */
  readonly guidanceScale?: number;
}

export interface VideoGenerationRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly mode: ProviderMode;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly references: readonly ProviderReference[];
  readonly settings: VideoGenerationSettings;
  readonly metadata?: ProviderMetadata;
}

export interface ImageGenerationSettings {
  readonly ratio: AspectRatio;
  /** Optional deterministic seed so a chosen keyframe look can be reproduced. */
  readonly seed?: number;
  /** Optional prompt-adherence strength for the image model. */
  readonly guidanceScale?: number;
}

/**
 * Provider-neutral still-image generation request. Used for keyframe-first workflows:
 * generate a strong opening frame (optionally conditioned on identity/product references),
 * review it, then animate it through image-to-video.
 */
export interface ImageGenerationRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly references: readonly ProviderReference[];
  readonly settings: ImageGenerationSettings;
  readonly metadata?: ProviderMetadata;
}

/**
 * Provider-neutral text-to-speech request that voices a TALKING shot's verbatim line BEFORE video
 * generation (audio-first): the resulting audio drives the avatar model, so pacing and emotion
 * follow real speech instead of a video model guessing delivery.
 */
export interface SpeechSynthesisRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  /** The exact line to speak — verbatim, already in the target language. */
  readonly text: string;
  /** Optional provider voice id/name; multilingual voices handle Vietnamese. */
  readonly voice?: string;
  /** Optional BCP-47 hint; multilingual voices usually auto-detect. */
  readonly languageCode?: string;
  /** 0..1 delivery stability (lower = more expressive). */
  readonly stability?: number;
  readonly metadata?: ProviderMetadata;
}

/**
 * Audio-driven avatar video request (OmniHuman-class): one portrait/keyframe image + a voiceover
 * audio track -> a lip-synced, emoting, gesturing clip of that character speaking. Used for TALKING
 * shots only; b-roll/action shots keep the general video models.
 */
export interface AvatarVideoRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  /** HTTPS URL of the character image (in-scene keyframe preferred, portrait anchor fallback). */
  readonly imageUrl: string;
  /** HTTPS URL of the driving voiceover audio (<=15s recommended, 60s max). */
  readonly audioUrl: string;
  /** Optional short action/scene/expression hint (<=2000 chars). */
  readonly prompt?: string;
  /** Output resolution (720 or 1080). */
  readonly outputResolution?: 720 | 1080;
  readonly seed?: number;
  readonly metadata?: ProviderMetadata;
}

/**
 * Provider-neutral speech-to-text (transcription) request. Used to derive timed subtitle
 * cues from user-supplied narration/source audio. The audio must be a clean https:// or
 * asset:// URI already admitted by the normal reference-safety rules.
 */
export interface SpeechTranscriptionRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly audioUri: string;
  /** Optional BCP-47-ish language hint (e.g. "vi", "en"). */
  readonly language?: string;
  readonly metadata?: ProviderMetadata;
}

export interface SpeechTranscriptSegment {
  readonly startSecond: number;
  readonly endSecond: number;
  readonly text: string;
}

export interface SpeechTranscriptionResult {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly language?: string;
  readonly text: string;
  readonly segments: readonly SpeechTranscriptSegment[];
  /** Redacted raw payload for evidence/debugging. */
  readonly raw: unknown;
}

export type ChatContentPart =
  | {
      readonly type: "text";
      readonly text: string;
    }
  | {
      readonly type: "image_url";
      readonly image_url: {
        readonly url: string;
      };
    };

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | readonly ChatContentPart[];
}

export interface ChatRequest {
  readonly modelId: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly metadata?: ProviderMetadata;
}

export interface ChatResponse {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly content: string;
  readonly raw: unknown;
  readonly usage?: ProviderUsage;
  readonly latencyMs: number;
}

export interface StructuredChatRequest<TSchema extends Record<string, unknown>> extends ChatRequest {
  readonly schema: TSchema;
  readonly instruction: string;
}

export interface StructuredChatResponse<TValue> extends ChatResponse {
  readonly value: TValue;
}

export interface ProviderUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
}

export interface Prediction {
  readonly provider: ProviderName;
  readonly predictionId: string;
  readonly modelId: string;
  readonly status: PredictionStatus;
  readonly outputUrls: readonly string[];
  readonly raw: unknown;
  readonly submittedAt: Date;
  readonly completedAt?: Date;
  readonly latencyMs?: number;
  readonly usage?: ProviderUsage;
}

export interface PredictionPollingContext {
  readonly modelId?: string;
  readonly metadata?: ProviderMetadata;
}

export interface AssetRegistrationRequest {
  readonly uri: string;
  readonly kind: "image" | "video" | "audio";
  readonly metadata?: ProviderMetadata;
}

export interface AssetRegistration {
  readonly provider: ProviderName;
  readonly assetId: string;
  readonly status: AssetStatus;
  readonly uri?: string;
  readonly raw: unknown;
}

export interface CostLedgerEntry {
  readonly provider: ProviderName;
  readonly operation: string;
  readonly modelId?: string;
  readonly predictionId?: string;
  readonly assetId?: string;
  readonly graphNodeId?: string;
  readonly requestedAt: Date;
  readonly completedAt?: Date;
  readonly latencyMs?: number;
  readonly status: ProviderCallStatus;
  readonly providerStatus?: PredictionStatus | AssetStatus;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
  readonly usage?: ProviderUsage;
  readonly errorCode?: ProviderErrorCode;
  readonly retryable?: boolean;
  readonly retryCount: number;
}

export type AudioGenerationOutputFormat = "mp3" | "wav";

export interface AudioGenerationCapability {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly kinds: readonly GeneratedAudioIntentKind[];
  readonly outputFormats: readonly AudioGenerationOutputFormat[];
  readonly maxDurationSeconds: number;
  readonly async: boolean;
}

export interface AudioGenerationSettings {
  readonly outputFormat: AudioGenerationOutputFormat;
  readonly durationSeconds?: number;
  readonly language?: string;
  readonly voiceStyle?: string;
  readonly mood?: string;
  readonly volume?: number;
}

export interface AudioGenerationRequest {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly intentId: string;
  readonly kind: GeneratedAudioIntentKind;
  readonly prompt: string;
  readonly settings: AudioGenerationSettings;
  readonly metadata?: ProviderMetadata;
}

export interface AudioGenerationResult {
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly intentId: string;
  readonly kind: GeneratedAudioIntentKind;
  readonly status: ProviderCallStatus;
  readonly outputUrl?: string;
  readonly providerAssetId?: string;
  readonly durationSeconds?: number;
  readonly raw: unknown;
  readonly usage?: ProviderUsage;
  readonly submittedAt: Date;
  readonly completedAt?: Date;
  readonly latencyMs?: number;
}
