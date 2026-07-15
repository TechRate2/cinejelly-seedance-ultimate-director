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
  AvatarVideoRequest,
  ChatRequest,
  ChatResponse,
  ImageGenerationRequest,
  Prediction,
  SpeechSynthesisRequest,
  SpeechTranscriptionRequest,
  SpeechTranscriptionResult,
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
  /**
   * Optional audio-driven avatar generation for TALKING shots (submit-only; callers poll via
   * waitForPrediction like the other video modes). Feature-check before use.
   */
  generateAvatarVideo?(request: AvatarVideoRequest, signal?: AbortSignal): Promise<Prediction>;
  /**
   * Optional text-to-speech that voices a talking shot's verbatim line BEFORE avatar generation
   * (audio-first). Polls to terminal internally and resolves with the audio output URL.
   */
  synthesizeSpeech?(request: SpeechSynthesisRequest, signal?: AbortSignal): Promise<Prediction>;
}

/**
 * Provider-neutral text-to-speech for voicing talking shots (audio-first avatar pipeline).
 * Implementations poll to terminal and resolve with the audio output URL in the prediction.
 */
export interface SpeechSynthesisProvider {
  readonly name: string;
  synthesizeSpeech(request: SpeechSynthesisRequest, signal?: AbortSignal): Promise<Prediction>;
}

/**
 * Provider-neutral still-image generation for keyframe-first workflows.
 * Optional on providers: callers must feature-check before use.
 */
export interface ImageProvider {
  readonly name: string;
  generateImage(request: ImageGenerationRequest, signal?: AbortSignal): Promise<Prediction>;
  /** True when an image model is configured and image generation can be attempted. */
  supportsImageGeneration(): boolean;
}

/**
 * Provider-neutral speech-to-text for subtitle generation from user-supplied audio.
 * Optional on providers: callers must feature-check before use.
 */
export interface SpeechProvider {
  readonly name: string;
  transcribeAudio(request: SpeechTranscriptionRequest, signal?: AbortSignal): Promise<SpeechTranscriptionResult>;
  /** True when a speech model is configured and transcription can be attempted. */
  supportsSpeechToText(): boolean;
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
  resumeAudioPrediction?(
    request: AudioGenerationRequest,
    predictionId: string,
    signal?: AbortSignal
  ): Promise<AudioGenerationResult>;
  audioCapabilities(modelId?: string): readonly AudioGenerationCapability[];
}

export interface ModelProvider
  extends LlmProvider, VideoProvider, ImageProvider, SpeechProvider, AssetProvider, AudioProvider {}
