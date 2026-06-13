/**
 * Provider-neutral type contracts used by the model abstraction layer.
 * Application services depend on these shapes, never on Atlas-specific payloads.
 */

import type { AspectRatio, Resolution } from "./settings.js";
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
  readonly async: boolean;
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
  readonly watermark: boolean;
  readonly returnLastFrame: boolean;
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
  readonly kind: "video" | "audio";
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
