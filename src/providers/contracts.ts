/**
 * Provider interfaces from docs/MODEL_PROVIDER_ABSTRACTION.md.
 * These contracts are the dependency boundary for all future agents and graph services.
 */

import type {
  AudioGenerationCapability,
  AudioGenerationRequest,
  AudioGenerationResult,
  AssetRegistration,
  AssetRegistrationRequest,
  ChatRequest,
  ChatResponse,
  Prediction,
  PredictionPollingContext,
  ProviderCapability,
  StructuredChatRequest,
  StructuredChatResponse,
  VideoGenerationRequest
} from "../types/provider.js";

export interface LlmProvider {
  readonly name: string;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  structured<TValue, TSchema extends Record<string, unknown>>(
    request: StructuredChatRequest<TSchema>,
    signal?: AbortSignal
  ): Promise<StructuredChatResponse<TValue>>;
  capabilities(modelId?: string): readonly ProviderCapability[];
}

export interface VideoProvider {
  readonly name: string;
  generateTextToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  generateImageToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  generateReferenceToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  editVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  extendVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  getPrediction(predictionId: string, signal?: AbortSignal, context?: PredictionPollingContext): Promise<Prediction>;
  waitForPrediction(predictionId: string, signal?: AbortSignal, context?: PredictionPollingContext): Promise<Prediction>;
  capabilities(modelId?: string): readonly ProviderCapability[];
}

export interface AssetProvider {
  readonly name: string;
  registerAsset(request: AssetRegistrationRequest, signal?: AbortSignal): Promise<AssetRegistration>;
  getAsset(assetId: string, signal?: AbortSignal): Promise<AssetRegistration>;
  waitUntilActive(assetId: string, signal?: AbortSignal): Promise<AssetRegistration>;
  deleteAsset(assetId: string, signal?: AbortSignal): Promise<void>;
}

export interface AudioProvider {
  readonly name: string;
  generateAudio(request: AudioGenerationRequest, signal?: AbortSignal): Promise<AudioGenerationResult>;
  audioCapabilities(modelId?: string): readonly AudioGenerationCapability[];
}

export interface ModelProvider extends LlmProvider, VideoProvider, AssetProvider, AudioProvider {}
