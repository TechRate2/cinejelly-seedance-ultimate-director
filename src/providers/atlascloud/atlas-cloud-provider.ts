/**
 * Atlas Cloud provider implementation for LLM, Seedance 2.0 video generation, and media upload.
 * It follows docs/MODEL_PROVIDER_ABSTRACTION.md while keeping model IDs and capability validation configurable.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { AtlasCloudRuntimeSettings } from "../../types/settings.js";
import { defaultSeedanceProviderCapability } from "../../config/seedance-capabilities.js";
import type {
  AudioGenerationCapability,
  AudioGenerationRequest,
  AvatarVideoRequest,
  ImageGenerationRequest,
  SpeechSynthesisRequest,
  SpeechTranscriptionRequest,
  SpeechTranscriptionResult,
  AudioGenerationResult,
  AssetRegistration,
  AssetRegistrationRequest,
  AssetStatus,
  ChatRequest,
  ChatResponse,
  Prediction,
  PredictionPollingContext,
  ProviderCapability,
  ProviderCallStatus,
  ProviderMode,
  ProviderReference,
  ProviderUsage,
  PredictionStatus,
  ReferenceKind,
  StructuredChatRequest,
  StructuredChatResponse,
  VideoGenerationRequest
} from "../../types/provider.js";
import type { CostLedger } from "../cost-ledger.js";
import type { ModelProvider } from "../contracts.js";
import { DEFAULT_RETRY_POLICY, withRetry } from "../../utils/retry.js";
import { elapsedMs, now, sleep } from "../../utils/time.js";
import { ProviderError, asProviderError } from "../../utils/errors.js";
import { redactText, redactUnknown } from "../../utils/redaction.js";
import { AtlasCloudHttpClient } from "./atlas-cloud-http.js";
import { mapAssetRegistration, mapPrediction, mapUsage, readChatContent } from "./atlas-cloud-mappers.js";
import { resolveUploadUriToPath } from "../../core/upload-reference.js";

const ATLAS_PROVIDER_NAME = "atlascloud";
const DEFAULT_VIDEO_FPS = 24;
const DEFAULT_AUDIO_LANGUAGE = "auto";
const MAX_ATLAS_AUDIO_TEXT_CHARS = 15_000;
const DIMENSION_RATIOS: Partial<Record<string, readonly [number, number]>> = {
  "21:9": [21, 9],
  "16:9": [16, 9],
  "4:3": [4, 3],
  "1:1": [1, 1],
  "3:4": [3, 4],
  "9:16": [9, 16]
};

interface LedgerMetadata {
  readonly predictionId?: string;
  readonly assetId?: string;
  readonly providerStatus?: PredictionStatus | AssetStatus;
  readonly usage?: ProviderUsage;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
}

export class AtlasCloudProvider implements ModelProvider {
  public readonly name = ATLAS_PROVIDER_NAME;

  private readonly settings: AtlasCloudRuntimeSettings;
  private readonly http: AtlasCloudHttpClient;
  private readonly llmHttp: AtlasCloudHttpClient;
  private readonly ledger: CostLedger | undefined;

  public constructor(settings: AtlasCloudRuntimeSettings, ledger?: CostLedger) {
    this.settings = settings;
    this.ledger = ledger;
    this.http = new AtlasCloudHttpClient({
      apiKey: settings.apiKey,
      timeoutMs: settings.requestTimeoutMs,
      maxJsonResponseBytes: settings.maxJsonResponseBytes
    });
    this.llmHttp = settings.llmApiKey
      ? new AtlasCloudHttpClient({
          apiKey: settings.llmApiKey,
          timeoutMs: settings.requestTimeoutMs,
          maxJsonResponseBytes: settings.maxJsonResponseBytes
        })
      : this.http;
  }

  public capabilities(modelId?: string): readonly ProviderCapability[] {
    if (this.settings.seedanceCapabilities && this.settings.seedanceCapabilities.length > 0) {
      return modelId
        ? this.settings.seedanceCapabilities.filter((capability) => capability.modelId === modelId)
        : this.settings.seedanceCapabilities;
    }
    const standardModel = this.settings.models.seedanceStandardModel;
    const fastModel = this.settings.models.seedanceFastModel;
    const miniModel = this.settings.models.seedanceMiniModel;
    const models = modelId ? [modelId] : [standardModel, fastModel, miniModel].filter((value): value is string => Boolean(value));
    return models.map((selectedModelId) => defaultSeedanceProviderCapability(selectedModelId));
  }

  public audioCapabilities(modelId?: string): readonly AudioGenerationCapability[] {
    const capabilities = this.settings.generatedAudioCapabilities ?? [];
    return modelId
      ? capabilities.filter((capability) => capability.modelId === modelId)
      : capabilities;
  }

  public async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const startedAt = now();
    const payload = {
      model: request.modelId,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens
    };

    return this.trackProviderCall(
      "llm.chat",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.llmHttp.postJson<unknown>(this.url(this.settings.apiBaseUrl, "/chat/completions"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        const finishedAt = now();
        const objectResponse = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
        const usage = mapUsage(objectResponse);
        const baseResponse = {
          provider: ATLAS_PROVIDER_NAME,
          modelId: request.modelId,
          content: readChatContent(response),
          raw: response,
          latencyMs: elapsedMs(startedAt, finishedAt)
        };
        return usage ? { ...baseResponse, usage } : baseResponse;
      },
      (response) => this.chatLedgerMetadata(response)
    );
  }

  public async structured<TValue, TSchema extends Record<string, unknown>>(
    request: StructuredChatRequest<TSchema>,
    signal?: AbortSignal
  ): Promise<StructuredChatResponse<TValue>> {
    const response = await this.chat(
      {
        ...request,
        messages: [
          ...request.messages,
          {
            role: "system",
            content: `${request.instruction}\nReturn only JSON that conforms to this schema: ${JSON.stringify(request.schema)}`
          }
        ]
      },
      signal
    );

    try {
      return {
        ...response,
        value: this.parseStructuredJson<TValue>(response.content)
      };
    } catch (error) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Atlas Cloud LLM returned non-JSON content for a structured request.",
        details: { parseError: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  private parseStructuredJson<TValue>(content: string): TValue {
    const candidates = [
      content.trim(),
      this.extractFencedJson(content),
      this.extractJsonObject(content)
    ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as TValue;
      } catch {
        continue;
      }
    }
    throw new Error("No parseable JSON object found in structured response.");
  }

  private extractFencedJson(content: string): string | undefined {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return match?.[1]?.trim();
  }

  private extractJsonObject(content: string): string | undefined {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return undefined;
    }
    return content.slice(start, end + 1);
  }

  public generateTextToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    return this.submitVideoGeneration("text_to_video", request, signal);
  }

  public generateImageToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    return this.submitVideoGeneration("image_to_video", request, signal);
  }

  public generateReferenceToVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    return this.submitVideoGeneration("reference_to_video", request, signal);
  }

  public editVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    return this.submitVideoGeneration("edit", request, signal);
  }

  public extendVideo(request: VideoGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    return this.submitVideoGeneration("extend", request, signal);
  }

  public supportsImageGeneration(): boolean {
    return Boolean(this.settings.models.imageModel?.trim());
  }

  /**
   * Still-image generation for keyframe-first workflows. Uses the same async prediction
   * submit/poll contract as video so downstream polling, cost ledger, and redaction reuse
   * the existing machinery. Requires ATLASCLOUD_IMAGE_MODEL (settings.models.imageModel).
   */
  public async generateImage(request: ImageGenerationRequest, signal?: AbortSignal): Promise<Prediction> {
    if (request.provider !== ATLAS_PROVIDER_NAME) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Atlas Cloud provider received image request for provider ${request.provider}.`
      });
    }
    if (!request.modelId?.trim()) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: "Image generation needs a configured image model (ATLASCLOUD_IMAGE_MODEL)."
      });
    }
    if (!request.prompt?.trim()) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Image generation prompt cannot be empty."
      });
    }
    const startedAt = now();
    const effectiveModelId = this.effectiveImageModelId(request);
    const payload = this.toAtlasImagePayload(request);
    const submitted = await this.trackProviderCall(
      "image.submit",
      effectiveModelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.http.postJson<unknown>(this.url(this.settings.assetBaseUrl, "/model/generateImage"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return this.requireKnownPredictionId(mapPrediction(response, effectiveModelId, startedAt), "image generation");
      },
      (prediction) => this.predictionLedgerMetadata(prediction)
    );
    // Poll to terminal like video/audio. Atlas image generation is an ASYNC prediction: the submit
    // returns status "running" with no output URL, so returning it directly (the old behaviour) meant
    // every keyframe-first still and character-anchor portrait was submitted AND billed but never
    // usable — bindKeyframesToShots/bindPortraitsToCast require "succeeded" — so the flagship identity
    // anchoring was structurally dead and drove cross-clip drift (final live-audit gap #1/#16).
    if (submitted.status !== "running") {
      return submitted;
    }
    return this.waitForPrediction(
      submitted.predictionId,
      signal,
      {
        modelId: effectiveModelId,
        ...(request.metadata ? { metadata: request.metadata } : {})
      },
      "image.wait_for_prediction"
    );
  }

  /**
   * Audio-first TTS for TALKING shots (ElevenLabs-class via Atlas /model/generateAudio). Submits the
   * verbatim line and polls to terminal, so the caller receives a ready audio URL to drive the avatar
   * model. Ledger ops: tts.submit + tts.wait_for_prediction.
   */
  public async synthesizeSpeech(request: SpeechSynthesisRequest, signal?: AbortSignal): Promise<Prediction> {
    if (!request.modelId?.trim()) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: "Speech synthesis needs a configured TTS model (ATLASCLOUD_TTS_MODEL)."
      });
    }
    if (!request.text?.trim()) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Speech synthesis text cannot be empty."
      });
    }
    const startedAt = now();
    const payload: Record<string, unknown> = {
      model: request.modelId,
      text: request.text,
      ...(request.voice ? { voice: request.voice } : {}),
      ...(request.languageCode ? { language_code: request.languageCode } : {}),
      ...(request.stability !== undefined ? { stability: request.stability } : {}),
      metadata: request.metadata
    };
    const submitted = await this.trackProviderCall(
      "tts.submit",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.http.postJson<unknown>(this.url(this.settings.assetBaseUrl, "/model/generateAudio"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return this.requireKnownPredictionId(mapPrediction(response, request.modelId, startedAt), "speech synthesis");
      },
      (prediction) => this.predictionLedgerMetadata(prediction)
    );
    if (submitted.status !== "running") {
      return submitted;
    }
    return this.waitForPrediction(
      submitted.predictionId,
      signal,
      {
        modelId: request.modelId,
        ...(request.metadata ? { metadata: request.metadata } : {})
      },
      "tts.wait_for_prediction"
    );
  }

  /**
   * Audio-driven avatar video for TALKING shots (OmniHuman-class via Atlas /model/generateVideo:
   * image_url + audio_url -> lip-synced, emoting character clip whose length follows the audio).
   * Submit-only, mirroring the other video modes — the render producer polls waitForPrediction.
   */
  public async generateAvatarVideo(request: AvatarVideoRequest, signal?: AbortSignal): Promise<Prediction> {
    if (!request.modelId?.trim()) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: "Avatar generation needs a configured avatar model (ATLASCLOUD_AVATAR_MODEL)."
      });
    }
    if (!/^https:\/\//.test(request.imageUrl) || !/^https:\/\//.test(request.audioUrl)) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Avatar generation needs HTTPS imageUrl and audioUrl inputs."
      });
    }
    const startedAt = now();
    const payload: Record<string, unknown> = {
      model: request.modelId,
      image_url: request.imageUrl,
      audio_url: request.audioUrl,
      ...(request.prompt?.trim() ? { prompt: request.prompt.slice(0, 2_000) } : {}),
      ...(request.outputResolution ? { output_resolution: request.outputResolution } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      metadata: request.metadata
    };
    return this.trackProviderCall(
      "avatar.submit",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.http.postJson<unknown>(this.url(this.settings.assetBaseUrl, "/model/generateVideo"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return this.requireKnownPredictionId(mapPrediction(response, request.modelId, startedAt), "avatar generation");
      },
      (prediction) => this.predictionLedgerMetadata(prediction)
    );
  }

  public supportsSpeechToText(): boolean {
    return Boolean(this.settings.models.speechModel?.trim());
  }

  /**
   * Speech-to-text for subtitle generation from user-supplied audio. Gated by
   * ATLASCLOUD_SPEECH_MODEL; verify the exact model id and endpoint against the Atlas
   * catalog before live use. Accepts a synchronous transcription payload or an async
   * prediction that is polled to completion, then maps flexible segment shapes into the
   * provider-neutral result.
   */
  public async transcribeAudio(
    request: SpeechTranscriptionRequest,
    signal?: AbortSignal
  ): Promise<SpeechTranscriptionResult> {
    if (request.provider !== ATLAS_PROVIDER_NAME) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Atlas Cloud provider received speech request for provider ${request.provider}.`
      });
    }
    if (!request.modelId?.trim()) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: "Speech transcription needs a configured speech model (ATLASCLOUD_SPEECH_MODEL)."
      });
    }
    if (!/^(https:\/\/|asset:\/\/)/.test(request.audioUri ?? "")) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Speech transcription needs a clean https:// or asset:// audio URI."
      });
    }
    const startedAt = now();
    return this.trackProviderCall(
      "speech.transcribe",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const payload = {
          model: request.modelId,
          audio_url: request.audioUri,
          audio: request.audioUri,
          ...(request.language ? { language: request.language } : {}),
          metadata: request.metadata
        };
        const response = await withRetry(
          () =>
            this.http.postJson<unknown>(this.url(this.settings.assetBaseUrl, "/model/transcribeAudio"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        const finalPayload = await this.resolveSpeechPayload(response, recordRetry, signal);
        return this.mapSpeechResult(request, finalPayload);
      },
      () => ({ providerStatus: "succeeded" })
    );
  }

  /** If the transcription endpoint answered with an async prediction, poll it to the end. */
  private async resolveSpeechPayload(
    response: unknown,
    recordRetry: () => void,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (this.extractSpeechSegments(response).length > 0 || this.extractSpeechText(response)) {
      return response;
    }
    const prediction = mapPrediction(response, "speech", now());
    if (prediction.predictionId === "unknown") {
      return response;
    }
    const deadline = Date.now() + this.settings.pollingTimeoutMs;
    let latest: unknown = response;
    while (Date.now() <= deadline) {
      this.throwIfAborted(signal);
      try {
        latest = await this.getPredictionPayload(prediction.predictionId, signal, recordRetry);
      } catch (error) {
        const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
        if (!this.shouldContinuePollingAfterError(providerError, deadline)) {
          throw providerError;
        }
        await this.sleepForPolling(signal);
        continue;
      }
      const status = mapPrediction(latest, "speech", now()).status;
      if (status === "succeeded") {
        return latest;
      }
      if (status === "failed" || status === "canceled") {
        throw new ProviderError({
          code: "GENERATION_FAILED",
          provider: ATLAS_PROVIDER_NAME,
          message: `Atlas Cloud transcription ended with status ${status}.`,
          details: redactUnknown(latest)
        });
      }
      await this.sleepForPolling(signal);
    }
    throw new ProviderError({
      code: "POLLING_TIMEOUT",
      provider: ATLAS_PROVIDER_NAME,
      retryable: true,
      message: `Atlas Cloud transcription did not finish within ${this.settings.pollingTimeoutMs}ms.`
    });
  }

  private mapSpeechResult(request: SpeechTranscriptionRequest, payload: unknown): SpeechTranscriptionResult {
    const segments = this.extractSpeechSegments(payload)
      .filter((segment) => Number.isFinite(segment.startSecond) && Number.isFinite(segment.endSecond))
      .filter((segment) => segment.endSecond > segment.startSecond && segment.text.trim().length > 0)
      .sort((left, right) => left.startSecond - right.startSecond);
    const text = this.extractSpeechText(payload) || segments.map((segment) => segment.text).join(" ").trim();
    if (!text && segments.length === 0) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Atlas Cloud transcription returned no text or timed segments.",
        details: redactUnknown(payload)
      });
    }
    return {
      provider: ATLAS_PROVIDER_NAME,
      modelId: request.modelId,
      ...(request.language ? { language: request.language } : {}),
      text,
      segments,
      raw: redactUnknown(payload)
    };
  }

  private extractSpeechText(payload: unknown): string {
    for (const container of this.speechContainers(payload)) {
      for (const key of ["text", "transcript", "transcription"]) {
        const value = (container as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
    return "";
  }

  private extractSpeechSegments(payload: unknown): readonly { startSecond: number; endSecond: number; text: string }[] {
    for (const container of this.speechContainers(payload)) {
      for (const key of ["segments", "utterances", "words", "chunks"]) {
        const value = (container as Record<string, unknown>)[key];
        if (Array.isArray(value) && value.length > 0) {
          const mapped = value
            .map((item) => this.speechSegmentFrom(item))
            .filter((item): item is { startSecond: number; endSecond: number; text: string } => item !== undefined);
          if (mapped.length > 0) {
            return mapped;
          }
        }
      }
    }
    return [];
  }

  private speechContainers(payload: unknown): readonly object[] {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const containers: object[] = [payload];
    for (const key of ["output", "result", "data", "response", "prediction"]) {
      const nested = (payload as Record<string, unknown>)[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        containers.push(nested);
      }
    }
    return containers;
  }

  private speechSegmentFrom(item: unknown): { startSecond: number; endSecond: number; text: string } | undefined {
    if (!item || typeof item !== "object") {
      return undefined;
    }
    const record = item as Record<string, unknown>;
    const start = this.speechSeconds(record, ["startSecond", "start_second", "start", "start_time", "begin"]);
    const end = this.speechSeconds(record, ["endSecond", "end_second", "end", "end_time"]);
    const textValue = record.text ?? record.content ?? record.word;
    if (start === undefined || end === undefined || typeof textValue !== "string") {
      return undefined;
    }
    return { startSecond: start, endSecond: end, text: textValue };
  }

  private speechSeconds(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return undefined;
  }

  /**
   * Pick the effective image model for a request: reference-carrying requests (keyframes conditioned
   * on cast portraits / product images) route to the reference-capable slug when configured
   * (e.g. google/nano-banana-2/reference-to-image), because text-to-image slugs do not honor
   * reference_images. Plain requests keep the primary image model.
   */
  private effectiveImageModelId(request: ImageGenerationRequest): string {
    const referenceModel = this.settings.models.imageReferenceModel?.trim();
    if (referenceModel && request.references.length > 0) {
      return referenceModel;
    }
    return request.modelId;
  }

  /** Diffusion-style knobs (negative_prompt/guidance) only apply to models that support them. */
  private imageModelSupportsDiffusionControls(modelId: string): boolean {
    return !/gpt-image|nano-banana|gemini/i.test(modelId);
  }

  private toAtlasImagePayload(request: ImageGenerationRequest): Record<string, unknown> {
    const modelId = this.effectiveImageModelId(request);
    const references = request.references.map((reference) => this.toAtlasReference(reference));
    const referenceImages = references
      .filter((reference) => reference.type === "image" || reference.role === "identity" || reference.role === "product")
      .map((reference) => reference.url)
      .filter((url): url is string => Boolean(url));
    const supportsDiffusionControls = this.imageModelSupportsDiffusionControls(modelId);
    // Instruction-native models (gpt-image, nano-banana/gemini) take avoid-lists as prompt text, not
    // a negative_prompt field — fold the negatives in so the constraints still apply.
    const prompt = !supportsDiffusionControls && request.negativePrompt
      ? `${request.prompt} Strictly avoid: ${request.negativePrompt}.`
      : request.prompt;
    return {
      model: modelId,
      prompt,
      ...(supportsDiffusionControls && request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      // "adaptive" is a video-side concept; omit ratio and let the image model decide.
      ...(request.settings.ratio !== "adaptive" ? { ratio: request.settings.ratio } : {}),
      ...(request.settings.seed !== undefined ? { seed: request.settings.seed } : {}),
      ...(supportsDiffusionControls && request.settings.guidanceScale !== undefined
        ? { guidance_scale: request.settings.guidanceScale }
        : {}),
      ...(referenceImages.length > 0 ? { reference_images: referenceImages.slice(0, 9) } : {}),
      metadata: request.metadata
    };
  }

  public async getPrediction(
    predictionId: string,
    signal?: AbortSignal,
    context?: PredictionPollingContext
  ): Promise<Prediction> {
    const startedAt = now();
    return this.trackProviderCall(
      "video.get_prediction",
      context?.modelId,
      context?.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await this.getPredictionPayload(predictionId, signal, recordRetry);
        return mapPrediction(response, context?.modelId ?? "unknown", startedAt);
      },
      (prediction) => this.predictionLedgerMetadata(prediction),
      () => ({ predictionId })
    );
  }

  public async waitForPrediction(
    predictionId: string,
    signal?: AbortSignal,
    context?: PredictionPollingContext,
    operationLabel: string = "video.wait_for_prediction"
  ): Promise<Prediction> {
    const startedAt = now();
    let latestMetadata: LedgerMetadata = { predictionId };

    return this.trackProviderCall(
      operationLabel,
      context?.modelId,
      context?.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const deadline = startedAt.getTime() + this.settings.pollingTimeoutMs;
        while (Date.now() <= deadline) {
          this.throwIfAborted(signal);
          // Poll through the raw payload path (not the public getPrediction) so each poll
          // does not open a nested ledger call: terminal cost is recorded exactly once on
          // this wait entry, and transient poll failures are tolerated until the deadline
          // instead of abandoning a still-running, already-paid render.
          let prediction: Prediction;
          try {
            const response = await this.getPredictionPayload(predictionId, signal, recordRetry);
            prediction = mapPrediction(response, context?.modelId ?? "unknown", startedAt);
          } catch (error) {
            const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
            if (!this.shouldContinuePollingAfterError(providerError, deadline)) {
              throw providerError;
            }
            await this.sleepForPolling(signal);
            continue;
          }
          latestMetadata = this.predictionLedgerMetadata(prediction);
          if (prediction.status === "succeeded") {
            return prediction;
          }
          if (prediction.status === "failed") {
            throw new ProviderError({
              code: "GENERATION_FAILED",
              provider: ATLAS_PROVIDER_NAME,
              message: `Atlas Cloud prediction ${predictionId} ended with status failed.`,
              details: prediction.raw
            });
          }
          if (prediction.status === "canceled") {
            throw new ProviderError({
              code: "PREDICTION_CANCELED",
              provider: ATLAS_PROVIDER_NAME,
              message: `Atlas Cloud prediction ${predictionId} was canceled.`,
              details: prediction.raw
            });
          }
          await this.sleepForPolling(signal);
        }

        latestMetadata = { ...latestMetadata, predictionId, providerStatus: "timeout" };
        throw new ProviderError({
          code: "POLLING_TIMEOUT",
          provider: ATLAS_PROVIDER_NAME,
          retryable: true,
          message: `Atlas Cloud prediction ${predictionId} did not finish within ${this.settings.pollingTimeoutMs}ms.`
        });
      },
      (prediction) => this.predictionLedgerMetadata(prediction),
      () => latestMetadata
    );
  }

  public async registerAsset(request: AssetRegistrationRequest, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    return this.trackProviderCall(
      "asset.register",
      undefined,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        if (isHttpsUri(request.uri)) {
          return {
            provider: ATLAS_PROVIDER_NAME,
            assetId: request.uri,
            status: "active",
            uri: request.uri,
            raw: { url: request.uri, source: "direct_https_reference" }
          };
        }
        if (isAssetUri(request.uri)) {
          return {
            provider: ATLAS_PROVIDER_NAME,
            assetId: request.uri.slice("asset://".length),
            status: "active",
            uri: request.uri,
            raw: { url: request.uri, source: "operator_asset_reference" }
          };
        }
        const uploadHandlePath = resolveUploadUriToPath(request.uri, this.settings.uploadsOutputRoot ?? "assets/output_deliverables");
        // Only https / asset:// / upload:// are valid asset references. Falling back to readFile on a
        // raw request.uri was a latent arbitrary-local-read foot-gun (security audit LOW-2): reject any
        // URI that is not a sandbox-resolved upload handle instead of reading an attacker-influenced path.
        if (!uploadHandlePath) {
          throw new Error(`Unsupported asset reference URI: only https, asset://, and upload:// handles are accepted.`);
        }
        const formData = new FormData();
        const file = await readFile(uploadHandlePath);
        formData.set("file", new Blob([file]), basename(request.uri));
        const response = await withRetry(
          () =>
            this.http.postFormData<unknown>(
              this.url(this.settings.assetBaseUrl, "/model/uploadMedia"),
              formData,
              signal
            ),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return mapAssetRegistration(response);
      },
      (asset) => this.assetLedgerMetadata(asset)
    );
  }

  public async getAsset(assetId: string, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    return this.trackProviderCall(
      "asset.get",
      undefined,
      undefined,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.http.getJson<unknown>(this.url(this.settings.assetBaseUrl, `/assets/${encodeURIComponent(assetId)}`), signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return mapAssetRegistration(response);
      },
      (asset) => this.assetLedgerMetadata(asset),
      () => ({ assetId })
    );
  }

  public async waitUntilActive(assetId: string, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    let latestMetadata: LedgerMetadata = { assetId };

    return this.trackProviderCall(
      "asset.wait_until_active",
      undefined,
      undefined,
      startedAt,
      async () => {
        const deadline = startedAt.getTime() + this.settings.pollingTimeoutMs;
        while (Date.now() <= deadline) {
          this.throwIfAborted(signal);
          let asset: AssetRegistration;
          try {
            asset = await this.getAsset(assetId, signal);
          } catch (error) {
            const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
            if (!this.shouldContinuePollingAfterError(providerError, deadline)) {
              throw providerError;
            }
            await this.sleepForPolling(signal);
            continue;
          }
          latestMetadata = this.assetLedgerMetadata(asset);
          if (asset.status === "active") {
            return asset;
          }
          if (asset.status === "failed" || asset.status === "deleted") {
            throw new ProviderError({
              code: "ASSET_VALIDATION_FAILED",
              provider: ATLAS_PROVIDER_NAME,
              message: `Atlas Cloud asset ${assetId} ended with status ${asset.status}.`,
              details: asset.raw
            });
          }
          await this.sleepForPolling(signal);
        }

        latestMetadata = { ...latestMetadata, assetId };
        throw new ProviderError({
          code: "ASSET_NOT_ACTIVE",
          provider: ATLAS_PROVIDER_NAME,
          retryable: true,
          message: `Atlas Cloud asset ${assetId} did not become active within ${this.settings.pollingTimeoutMs}ms.`
        });
      },
      (asset) => this.assetLedgerMetadata(asset),
      () => latestMetadata
    );
  }

  public async deleteAsset(assetId: string, signal?: AbortSignal): Promise<void> {
    const startedAt = now();
    await this.trackProviderCall(
      "asset.delete",
      undefined,
      undefined,
      startedAt,
      async (recordRetry) => {
        await withRetry(
          () => this.http.deleteJson<unknown>(this.url(this.settings.assetBaseUrl, `/assets/${encodeURIComponent(assetId)}`), signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
      },
      undefined,
      () => ({ assetId })
    );
  }

  public generateAudio(request: AudioGenerationRequest, signal?: AbortSignal): Promise<AudioGenerationResult> {
    const startedAt = now();
    let latestMetadata: LedgerMetadata = {};
    return this.trackProviderCall(
      "audio.generate",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        this.validateAudioRequest(request);
        const submitResponse = await withRetry(
          () =>
            this.http.postJson<unknown>(
              this.url(this.settings.assetBaseUrl, "/model/generateAudio"),
              this.toAtlasAudioPayload(request),
              signal
            ),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        const submittedPrediction = this.requireKnownPredictionId(
          mapPrediction(submitResponse, request.modelId, startedAt),
          "audio generation"
        );
        latestMetadata = this.predictionLedgerMetadata(submittedPrediction);
        const finalPrediction = await this.waitForAudioPrediction({
          predictionId: submittedPrediction.predictionId,
          modelId: request.modelId,
          recordRetry,
          ...(signal ? { signal } : {}),
          onMetadata: (metadata) => {
            latestMetadata = metadata;
          }
        });
        return this.audioResultFromPrediction(request, finalPrediction, startedAt);
      },
      (result) => this.audioLedgerMetadata(result),
      () => latestMetadata
    );
  }

  public resumeAudioPrediction(
    request: AudioGenerationRequest,
    predictionId: string,
    signal?: AbortSignal
  ): Promise<AudioGenerationResult> {
    const startedAt = now();
    let latestMetadata: LedgerMetadata = { predictionId, providerStatus: "running" };
    return this.trackProviderCall(
      "audio.resume_prediction",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        this.validateAudioRequest(request);
        const finalPrediction = await this.waitForAudioPrediction({
          predictionId,
          modelId: request.modelId,
          recordRetry,
          ...(signal ? { signal } : {}),
          onMetadata: (metadata) => {
            latestMetadata = metadata;
          }
        });
        return this.audioResultFromPrediction(request, finalPrediction, startedAt);
      },
      (result) => this.audioLedgerMetadata(result),
      () => latestMetadata
    );
  }

  private async submitVideoGeneration(
    expectedMode: ProviderMode,
    request: VideoGenerationRequest,
    signal?: AbortSignal
  ): Promise<Prediction> {
    this.validateVideoRequest(expectedMode, request);
    const startedAt = now();
    const payload = this.toAtlasVideoPayload(request);

    return this.trackProviderCall(
      "video.submit",
      request.modelId,
      request.metadata?.graphNodeId,
      startedAt,
      async (recordRetry) => {
        const response = await withRetry(
          () => this.http.postJson<unknown>(this.url(this.settings.assetBaseUrl, "/model/generateVideo"), payload, signal),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
        return this.requireKnownPredictionId(mapPrediction(response, request.modelId, startedAt), "video generation");
      },
      (prediction) => this.predictionLedgerMetadata(prediction)
    );
  }

  private validateVideoRequest(expectedMode: ProviderMode, request: VideoGenerationRequest): void {
    if (request.provider !== ATLAS_PROVIDER_NAME) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Atlas Cloud provider received request for provider ${request.provider}.`
      });
    }
    if (request.mode !== expectedMode) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: `Video request mode ${request.mode} does not match provider method ${expectedMode}.`
      });
    }
    const capability = this.capabilities(request.modelId)[0];
    if (!capability) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: `No capability is configured for model ${request.modelId}.`
      });
    }
    if (!capability.modes.includes(request.mode)) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Mode ${request.mode} is not supported by configured capability for model ${request.modelId}.`
      });
    }
    const duration = request.settings.durationSeconds;
    if (duration < capability.durations.min || duration > capability.durations.max) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Duration ${duration}s is outside supported range ${capability.durations.min}-${capability.durations.max}s.`
      });
    }
    if (!capability.resolutions.includes(request.settings.resolution)) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Resolution ${request.settings.resolution} is not supported by configured capability.`
      });
    }
    if (!capability.ratios.includes(request.settings.ratio)) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Aspect ratio ${request.settings.ratio} is not supported by configured capability.`
      });
    }
    this.validateCapabilitySettings(request, capability);
    for (const reference of request.references) {
      this.validateReferenceCapability(reference, capability);
    }
  }

  private validateAudioRequest(request: AudioGenerationRequest): void {
    if (request.provider !== ATLAS_PROVIDER_NAME) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Atlas Cloud provider received generated-audio request for provider ${request.provider}.`
      });
    }
    if (!request.prompt.trim()) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Generated-audio request prompt must be non-empty."
      });
    }
    if (request.prompt.length > MAX_ATLAS_AUDIO_TEXT_CHARS) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Generated-audio request prompt exceeds Atlas documented ${MAX_ATLAS_AUDIO_TEXT_CHARS} character limit.`
      });
    }
    const requestedDuration = request.settings.durationSeconds;
    if (requestedDuration !== undefined && requestedDuration <= 0) {
      throw new ProviderError({
        code: "INVALID_SCHEMA",
        provider: ATLAS_PROVIDER_NAME,
        message: "Generated-audio request duration must be greater than zero seconds."
      });
    }

    const capability = this.audioCapabilities(request.modelId).find((candidate) =>
      candidate.modelId === request.modelId &&
      candidate.kinds.includes(request.kind) &&
      candidate.outputFormats.includes(request.settings.outputFormat)
    );
    if (!capability) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: ATLAS_PROVIDER_NAME,
        message: `No verified Atlas Cloud generated-audio capability is configured for ${request.kind} using model ${request.modelId}.`
      });
    }
    if (requestedDuration !== undefined && requestedDuration > capability.maxDurationSeconds) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Generated-audio duration ${requestedDuration}s exceeds configured capability limit ${capability.maxDurationSeconds}s.`
      });
    }
  }

  private async waitForAudioPrediction(input: {
    readonly predictionId: string;
    readonly modelId: string;
    readonly signal?: AbortSignal;
    readonly recordRetry: () => void;
    readonly onMetadata: (metadata: LedgerMetadata) => void;
  }): Promise<Prediction> {
    const startedAt = now();
    const deadline = startedAt.getTime() + this.settings.pollingTimeoutMs;
    let latestMetadata: LedgerMetadata = { predictionId: input.predictionId, providerStatus: "running" };
    while (Date.now() <= deadline) {
      this.throwIfAborted(input.signal);
      let response: unknown;
      try {
        response = await this.getPredictionPayload(input.predictionId, input.signal, input.recordRetry);
      } catch (error) {
        const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
        if (!this.shouldContinuePollingAfterError(providerError, deadline)) {
          throw providerError;
        }
        input.onMetadata(latestMetadata);
        await this.sleepForPolling(input.signal);
        continue;
      }
      const prediction = mapPrediction(response, input.modelId, startedAt);
      latestMetadata = this.predictionLedgerMetadata(prediction);
      input.onMetadata(latestMetadata);
      if (prediction.status === "succeeded") {
        return prediction;
      }
      if (prediction.status === "failed") {
        throw new ProviderError({
          code: "GENERATION_FAILED",
          provider: ATLAS_PROVIDER_NAME,
          message: `Atlas Cloud audio prediction ${input.predictionId} ended with status failed.`,
          details: prediction.raw
        });
      }
      if (prediction.status === "canceled") {
        throw new ProviderError({
          code: "PREDICTION_CANCELED",
          provider: ATLAS_PROVIDER_NAME,
          message: `Atlas Cloud audio prediction ${input.predictionId} was canceled.`,
          details: prediction.raw
        });
      }
      await this.sleepForPolling(input.signal);
    }

    input.onMetadata({ predictionId: input.predictionId, providerStatus: "timeout" });
    throw new ProviderError({
      code: "POLLING_TIMEOUT",
      provider: ATLAS_PROVIDER_NAME,
      retryable: true,
      message: `Atlas Cloud audio prediction ${input.predictionId} did not finish within ${this.settings.pollingTimeoutMs}ms.`
    });
  }

  /**
   * Shared polling tolerance for video/audio/asset waits: transient provider failures
   * (network blips, request timeouts, rate limiting) keep polling until the overall
   * deadline instead of abandoning a still-running, already-paid generation.
   */
  private shouldContinuePollingAfterError(error: ProviderError, deadline: number): boolean {
    if (Date.now() > deadline || !error.retryable) {
      return false;
    }
    return error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT" || error.code === "RATE_LIMITED";
  }

  private async getPredictionPayload(
    predictionId: string,
    signal: AbortSignal | undefined,
    recordRetry: () => void
  ): Promise<unknown> {
    const encodedPredictionId = encodeURIComponent(predictionId);
    try {
      return await withRetry(
        () =>
          this.http.getJson<unknown>(
            this.url(this.settings.assetBaseUrl, `/model/prediction/${encodedPredictionId}`),
            signal
          ),
        DEFAULT_RETRY_POLICY,
        signal,
        recordRetry
      );
    } catch (error) {
      const predictionPayload = this.predictionPayloadFromProviderError(error);
      if (predictionPayload) {
        return predictionPayload;
      }
      if (!this.shouldTryPredictionFallback(error)) {
        throw error;
      }
      try {
        return await withRetry(
          () =>
            this.http.getJson<unknown>(
              this.url(this.settings.assetBaseUrl, `/model/result/${encodedPredictionId}`),
              signal
            ),
          DEFAULT_RETRY_POLICY,
          signal,
          recordRetry
        );
      } catch (resultError) {
        const resultPayload = this.predictionPayloadFromProviderError(resultError);
        if (resultPayload) {
          return resultPayload;
        }
        if (!this.shouldTryPredictionFallback(resultError)) {
          throw resultError;
        }
        try {
          return await withRetry(
            () =>
              this.http.getJson<unknown>(
                this.url(this.settings.assetBaseUrl, `/model/getResult?predictionId=${encodedPredictionId}`),
                signal
              ),
            DEFAULT_RETRY_POLICY,
            signal,
            recordRetry
          );
        } catch (getResultError) {
          const getResultPayload = this.predictionPayloadFromProviderError(getResultError);
          if (getResultPayload) {
            return getResultPayload;
          }
          throw getResultError;
        }
      }
    }
  }

  private predictionPayloadFromProviderError(error: unknown): unknown | undefined {
    if (!(error instanceof ProviderError) || !error.details || typeof error.details !== "object") {
      return undefined;
    }
    const payload = error.details as Record<string, unknown>;
    const data = payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
    if (typeof data.status !== "string") {
      return undefined;
    }
    if (!("id" in data) && !("outputs" in data) && !("output" in data) && !("error" in data)) {
      return undefined;
    }
    return payload;
  }

  private shouldTryPredictionFallback(error: unknown): boolean {
    return error instanceof ProviderError && (error.statusCode === 404 || error.statusCode === 405);
  }

  private validateReferenceCapability(reference: ProviderReference, capability: ProviderCapability): void {
    const supportedByKind = capability.references.includes(reference.kind);
    const supportedByRole = reference.role ? capability.references.some((kind) => kind === reference.role) : false;
    if (!supportedByKind && !supportedByRole) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Reference ${reference.label || reference.role || reference.kind} is not supported by configured capability for model ${capability.modelId}.`
      });
    }
    if (this.requiresRegisteredAsset(reference) && !reference.providerAssetId) {
      throw new ProviderError({
        code: "ASSET_NOT_ACTIVE",
        provider: ATLAS_PROVIDER_NAME,
        message: `Reference ${reference.label || reference.role || reference.kind} must be an Atlas asset:// reference or clean HTTPS media URL before generation.`
      });
    }
  }

  private validateCapabilitySettings(request: VideoGenerationRequest, capability: ProviderCapability): void {
    const supportedSettings = capability.settings;
    if (!supportedSettings) {
      return;
    }
    if (supportedSettings.generateAudio === false && request.settings.generateAudio) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Native audio generation is not supported by configured capability for model ${capability.modelId}.`
      });
    }
    if (supportedSettings.returnLastFrame === false && request.settings.returnLastFrame) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Last-frame return is not supported by configured capability for model ${capability.modelId}.`
      });
    }
    if (supportedSettings.bitrateModes && !supportedSettings.bitrateModes.includes(request.settings.bitrateMode)) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Bitrate mode ${request.settings.bitrateMode} is not supported by configured capability for model ${capability.modelId}.`
      });
    }
    if (supportedSettings.watermark === false && request.settings.watermark) {
      throw new ProviderError({
        code: "UNSUPPORTED_SETTING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Watermark output is not supported by configured capability for model ${capability.modelId}.`
      });
    }
  }

  private requiresRegisteredAsset(reference: ProviderReference): boolean {
    const uri = reference.providerAssetId ? `asset://${reference.providerAssetId}` : reference.uri;
    if (isHttpsUri(uri) || isAssetUri(uri)) {
      return false;
    }
    return reference.kind === "image" ||
      reference.kind === "video" ||
      reference.kind === "audio" ||
      reference.kind === "first_frame" ||
      reference.kind === "last_frame" ||
      ["identity", "product", "environment", "style"].includes(reference.role ?? "");
  }

  private toAtlasVideoPayload(request: VideoGenerationRequest): Record<string, unknown> {
    const references = request.references.map((reference) => this.toAtlasReference(reference));
    const dimensions = this.dimensionsFor(request.settings.resolution, request.settings.ratio);
    const endpointReferencePresent = references.some((reference) =>
      reference.type === "first_frame" ||
      reference.type === "last_frame" ||
      reference.role === "first_frame" ||
      reference.role === "last_frame"
    );
    const imageToVideoReferenceUrl = this.firstReferenceUrl(references, ["first_frame", "image", "identity", "product", "environment", "style"]);
    const firstFrameUrl = this.firstReferenceUrl(references, ["first_frame"]);
    const lastImageUrl = this.firstReferenceUrl(references, ["last_frame"]);
    const firstVideoUrl = this.firstReferenceUrl(references, ["video", "motion", "camera"]);
    const firstAudioUrl = this.firstReferenceUrl(references, ["audio"]);
    const firstImageUrl = request.mode !== "text_to_video"
      ? (firstFrameUrl ?? imageToVideoReferenceUrl)
      : undefined;
    // Send the image reference array in image_to_video too (previously forced to []), so a KOL+product
    // shot never silently drops the product/environment — the first image is still `image`, and the
    // full set (KOL + product + …) also rides in reference_images. Suppressed only for endpoint
    // (last-frame) chaining, which pins the exact starting frame and must not carry extra references.
    const referenceImages = endpointReferencePresent
      ? []
      : this.referenceUrlsByFamily(references, "image");
    const referenceVideos = this.referenceUrlsByFamily(references, "video");
    const referenceAudios = this.referenceUrlsByFamily(references, "audio");
    const includeReferenceArray = request.mode !== "image_to_video" && !endpointReferencePresent && references.length > 0;

    return {
      model: request.modelId,
      prompt: request.prompt,
      ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
      duration: request.settings.durationSeconds,
      fps: DEFAULT_VIDEO_FPS,
      resolution: request.settings.resolution,
      bitrate_mode: request.settings.bitrateMode,
      ...(dimensions ? dimensions : { ratio: request.settings.ratio }),
      ...(request.mode !== "text_to_video" ? { mode: request.mode } : {}),
      ...(firstImageUrl ? { image: firstImageUrl, image_url: firstImageUrl } : {}),
      ...(lastImageUrl ? { last_image: lastImageUrl, image_end: lastImageUrl, last_image_url: lastImageUrl, end_image_url: lastImageUrl } : {}),
      ...(firstVideoUrl ? { video: firstVideoUrl, video_url: firstVideoUrl } : {}),
      ...(firstAudioUrl ? { audio: firstAudioUrl, audio_url: firstAudioUrl } : {}),
      ...(referenceImages.length > 0 ? { reference_images: referenceImages.slice(0, 9) } : {}),
      ...(referenceVideos.length > 0 ? { reference_videos: referenceVideos.slice(0, 3) } : {}),
      ...(referenceAudios.length > 0 ? { reference_audios: referenceAudios.slice(0, 3) } : {}),
      ...(includeReferenceArray ? { references } : {}),
      generate_audio: request.settings.generateAudio,
      watermark: request.settings.watermark,
      return_last_frame: request.settings.returnLastFrame,
      ...(request.settings.seed !== undefined ? { seed: request.settings.seed } : {}),
      ...(request.settings.guidanceScale !== undefined ? { guidance_scale: request.settings.guidanceScale } : {}),
      metadata: request.metadata
    };
  }

  private toAtlasAudioPayload(request: AudioGenerationRequest): Record<string, unknown> {
    return {
      model: request.modelId,
      text: request.prompt,
      language: request.settings.language || DEFAULT_AUDIO_LANGUAGE,
      ...(request.settings.voiceStyle ? { voice_id: request.settings.voiceStyle } : {}),
      codec: request.settings.outputFormat
    };
  }

  private toAtlasReference(reference: ProviderReference): {
    readonly type: ReferenceKind;
    readonly url: string;
    readonly role?: string;
    readonly label?: string;
  } {
    return {
      type: reference.kind,
      url: this.providerReferenceUrl(reference),
      ...(reference.role ? { role: reference.role } : {}),
      ...(reference.label ? { label: reference.label } : {})
    };
  }

  private providerReferenceUrl(reference: ProviderReference): string {
    if (!reference.providerAssetId) {
      return reference.uri;
    }
    if (isHttpsUri(reference.providerAssetId) || isAssetUri(reference.providerAssetId)) {
      return reference.providerAssetId;
    }
    return `asset://${reference.providerAssetId}`;
  }

  private firstReferenceUrl(
    references: readonly { readonly type: ReferenceKind; readonly url: string; readonly role?: string }[],
    preferredKindsOrRoles: readonly string[]
  ): string | undefined {
    return references.find((reference) =>
      preferredKindsOrRoles.includes(reference.type) ||
      (reference.role ? preferredKindsOrRoles.includes(reference.role) : false)
    )?.url;
  }

  private referenceUrlsByFamily(
    references: readonly { readonly type: ReferenceKind; readonly url: string; readonly role?: string }[],
    family: "image" | "video" | "audio"
  ): readonly string[] {
    const urls = new Set<string>();
    for (const reference of references) {
      if (this.referenceFamily(reference) === family) {
        urls.add(reference.url);
      }
    }
    return [...urls];
  }

  private referenceFamily(reference: { readonly type: ReferenceKind; readonly role?: string }): "image" | "video" | "audio" {
    if (reference.type === "audio" || reference.role === "audio_tempo" || reference.role === "voice") {
      return "audio";
    }
    if (
      reference.type === "video" ||
      reference.type === "motion" ||
      reference.type === "camera" ||
      reference.role === "source_video_structure" ||
      reference.role === "motion" ||
      reference.role === "camera"
    ) {
      return "video";
    }
    return "image";
  }

  private dimensionsFor(
    resolution: VideoGenerationRequest["settings"]["resolution"],
    ratio: VideoGenerationRequest["settings"]["ratio"]
  ): { readonly width: number; readonly height: number } | undefined {
    if (ratio === "adaptive") {
      return undefined;
    }
    const height = Number.parseInt(resolution, 10);
    const ratioParts = DIMENSION_RATIOS[ratio];
    if (!Number.isFinite(height) || !ratioParts) {
      return undefined;
    }
    const [widthRatio, heightRatio] = ratioParts;
    const width = this.nearestEven((height * widthRatio) / heightRatio);
    return { width, height };
  }

  private nearestEven(value: number): number {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  }

  private async trackProviderCall<TValue>(
    operation: string,
    modelId: string | undefined,
    graphNodeId: string | undefined,
    startedAt: Date,
    callback: (recordRetry: () => void) => Promise<TValue>,
    ledgerMetadata?: (value: TValue) => LedgerMetadata,
    currentLedgerMetadata?: () => LedgerMetadata
  ): Promise<TValue> {
    let retryCount = 0;
    try {
      const result = await callback(() => {
        retryCount += 1;
      });
      const completedAt = now();
      const metadata = {
        ...(currentLedgerMetadata?.() ?? {}),
        ...(ledgerMetadata?.(result) ?? {})
      };
      this.ledger?.record({
        provider: ATLAS_PROVIDER_NAME,
        operation,
        requestedAt: startedAt,
        completedAt,
        latencyMs: elapsedMs(startedAt, completedAt),
        status: "succeeded",
        retryCount,
        ...(modelId ? { modelId } : {}),
        ...(graphNodeId ? { graphNodeId } : {}),
        ...(metadata?.predictionId ? { predictionId: metadata.predictionId } : {}),
        ...(metadata?.assetId ? { assetId: metadata.assetId } : {}),
        ...(metadata?.providerStatus ? { providerStatus: metadata.providerStatus } : {}),
        ...(metadata?.usage ? { usage: metadata.usage } : {}),
        ...(metadata?.estimatedCostUsd !== undefined ? { estimatedCostUsd: metadata.estimatedCostUsd } : {}),
        ...(metadata?.actualCostUsd !== undefined ? { actualCostUsd: metadata.actualCostUsd } : {})
      });
      return result;
    } catch (error) {
      const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
      const completedAt = now();
      const metadata = currentLedgerMetadata?.() ?? {};
      this.ledger?.record({
        provider: ATLAS_PROVIDER_NAME,
        operation,
        requestedAt: startedAt,
        completedAt,
        latencyMs: elapsedMs(startedAt, completedAt),
        status: this.providerCallStatus(providerError, metadata.providerStatus),
        retryCount,
        ...(modelId ? { modelId } : {}),
        ...(graphNodeId ? { graphNodeId } : {}),
        ...(metadata.predictionId ? { predictionId: metadata.predictionId } : {}),
        ...(metadata.assetId ? { assetId: metadata.assetId } : {}),
        ...(metadata.providerStatus ? { providerStatus: metadata.providerStatus } : {}),
        ...(metadata.usage ? { usage: metadata.usage } : {}),
        ...(metadata.estimatedCostUsd !== undefined ? { estimatedCostUsd: metadata.estimatedCostUsd } : {}),
        ...(metadata.actualCostUsd !== undefined ? { actualCostUsd: metadata.actualCostUsd } : {}),
        errorCode: providerError.code,
        retryable: providerError.retryable
      });
      throw providerError;
    }
  }

  private url(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private predictionLedgerMetadata(prediction: Prediction): LedgerMetadata {
    return {
      ...(prediction.predictionId !== "unknown" ? { predictionId: prediction.predictionId } : {}),
      providerStatus: prediction.status,
      ...this.usageLedgerMetadata(prediction.usage)
    };
  }

  private assetLedgerMetadata(asset: AssetRegistration): LedgerMetadata {
    return {
      ...(asset.assetId !== "unknown" ? { assetId: asset.assetId } : {}),
      providerStatus: asset.status
    };
  }

  private chatLedgerMetadata(response: ChatResponse): LedgerMetadata {
    return this.usageLedgerMetadata(response.usage);
  }

  private audioLedgerMetadata(response: AudioGenerationResult): LedgerMetadata {
    return {
      ...(response.providerAssetId ? { predictionId: response.providerAssetId } : {}),
      ...this.usageLedgerMetadata(response.usage)
    };
  }

  private usageLedgerMetadata(usage: ProviderUsage | undefined): LedgerMetadata {
    if (!usage) {
      return {};
    }
    return {
      usage,
      ...(usage.estimatedCostUsd !== undefined ? { estimatedCostUsd: usage.estimatedCostUsd } : {}),
      ...(usage.actualCostUsd !== undefined ? { actualCostUsd: usage.actualCostUsd } : {})
    };
  }

  private providerCallStatus(
    error: ProviderError,
    providerStatus: PredictionStatus | AssetStatus | undefined
  ): ProviderCallStatus {
    if (providerStatus === "canceled" || error.code === "PREDICTION_CANCELED" || error.code === "REQUEST_ABORTED") {
      return "canceled";
    }
    if (providerStatus === "timeout" || error.code === "POLLING_TIMEOUT" || error.code === "REQUEST_TIMEOUT") {
      return "timeout";
    }
    if (error.code === "ASSET_NOT_ACTIVE" && error.retryable) {
      return "timeout";
    }
    return "failed";
  }

  private requireKnownPredictionId(prediction: Prediction, operationLabel: string): Prediction {
    if (prediction.predictionId !== "unknown") {
      return prediction;
    }
    // A synchronously completed result is still a billable success even without an ID:
    // keep it instead of discarding finished (paid) output over a missing identifier.
    if (prediction.status === "succeeded" && prediction.outputUrls.length > 0) {
      return prediction;
    }
    throw new ProviderError({
      code: "INVALID_SCHEMA",
      provider: ATLAS_PROVIDER_NAME,
      message: `Atlas Cloud accepted the ${operationLabel} request but did not return a prediction ID.`,
      details: prediction.raw
    });
  }

  private audioResultFromPrediction(
    request: AudioGenerationRequest,
    prediction: Prediction,
    submittedAt: Date
  ): AudioGenerationResult {
    const outputUrl = prediction.outputUrls[0];
    if (!outputUrl) {
      throw new ProviderError({
        code: "OUTPUT_MISSING",
        provider: ATLAS_PROVIDER_NAME,
        message: `Atlas Cloud audio prediction ${prediction.predictionId} completed without an output URL.`,
        details: prediction.raw
      });
    }
    const completedAt = prediction.completedAt ?? now();
    return {
      provider: ATLAS_PROVIDER_NAME,
      modelId: request.modelId,
      intentId: request.intentId,
      kind: request.kind,
      status: "succeeded",
      outputUrl,
      providerAssetId: prediction.predictionId,
      ...(request.settings.durationSeconds !== undefined ? { durationSeconds: request.settings.durationSeconds } : {}),
      raw: prediction.raw,
      ...(prediction.usage ? { usage: prediction.usage } : {}),
      submittedAt,
      completedAt,
      latencyMs: elapsedMs(submittedAt, completedAt)
    };
  }

  private async sleepForPolling(signal?: AbortSignal): Promise<void> {
    try {
      await sleep(this.settings.pollingIntervalMs, signal);
    } catch (error) {
      throw this.requestAbortedError(error);
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }
    throw this.requestAbortedError(signal.reason);
  }

  private requestAbortedError(reason: unknown): ProviderError {
    return new ProviderError({
      code: "REQUEST_ABORTED",
      provider: ATLAS_PROVIDER_NAME,
      message: "Atlas Cloud polling was aborted.",
      details: this.abortDetails(reason)
    });
  }

  private abortDetails(reason: unknown): Record<string, string> | undefined {
    if (reason instanceof Error) {
      return {
        name: reason.name,
        message: redactText(reason.message)
      };
    }
    if (typeof reason === "string" && reason.trim()) {
      return {
        message: redactText(reason)
      };
    }
    return undefined;
  }
}

function isHttpsUri(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAssetUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "asset:" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}
