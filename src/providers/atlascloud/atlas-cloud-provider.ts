/**
 * Atlas Cloud provider implementation for LLM, Seedance 2.0 video generation, and Asset Library.
 * It follows docs/MODEL_PROVIDER_ABSTRACTION.md while keeping model IDs and capability validation configurable.
 */

import type { AtlasCloudRuntimeSettings } from "../../types/settings.js";
import type {
  AssetRegistration,
  AssetRegistrationRequest,
  ChatRequest,
  ChatResponse,
  Prediction,
  ProviderCapability,
  ProviderMode,
  StructuredChatRequest,
  StructuredChatResponse,
  VideoGenerationRequest
} from "../../types/provider.js";
import type { CostLedger } from "../cost-ledger.js";
import type { ModelProvider } from "../contracts.js";
import { DEFAULT_RETRY_POLICY, withRetry } from "../../utils/retry.js";
import { elapsedMs, now, sleep } from "../../utils/time.js";
import { ProviderError, asProviderError } from "../../utils/errors.js";
import { AtlasCloudHttpClient } from "./atlas-cloud-http.js";
import { mapAssetRegistration, mapPrediction, mapUsage, readChatContent } from "./atlas-cloud-mappers.js";

const ATLAS_PROVIDER_NAME = "atlascloud";

export class AtlasCloudProvider implements ModelProvider {
  public readonly name = ATLAS_PROVIDER_NAME;

  private readonly settings: AtlasCloudRuntimeSettings;
  private readonly http: AtlasCloudHttpClient;
  private readonly ledger: CostLedger | undefined;

  public constructor(settings: AtlasCloudRuntimeSettings, ledger?: CostLedger) {
    this.settings = settings;
    this.ledger = ledger;
    this.http = new AtlasCloudHttpClient({
      apiKey: settings.apiKey,
      timeoutMs: settings.requestTimeoutMs
    });
  }

  public capabilities(modelId?: string): readonly ProviderCapability[] {
    const standardModel = this.settings.models.seedanceStandardModel;
    const fastModel = this.settings.models.seedanceFastModel;
    const models = modelId ? [modelId] : [standardModel, fastModel];
    return models.map((selectedModelId) => ({
      provider: ATLAS_PROVIDER_NAME,
      modelId: selectedModelId,
      modes: ["text_to_video", "image_to_video", "reference_to_video", "video_to_video", "extend", "edit"],
      durations: { min: 4, max: 15 },
      resolutions: ["480p", "720p", "1080p"],
      ratios: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
      references: ["image", "video", "audio", "first_frame", "last_frame", "identity", "product", "environment", "motion", "camera", "style"],
      async: true
    }));
  }

  public async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const startedAt = now();
    const payload = {
      model: request.modelId,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens
    };

    return this.trackProviderCall("llm.chat", request.modelId, request.metadata?.graphNodeId, startedAt, async () => {
      const response = await withRetry(
        () => this.http.postJson<unknown>(this.url(this.settings.apiBaseUrl, "/chat/completions"), payload, signal),
        DEFAULT_RETRY_POLICY,
        signal
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
    });
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
        value: JSON.parse(response.content) as TValue
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

  public async getPrediction(predictionId: string, signal?: AbortSignal): Promise<Prediction> {
    const startedAt = now();
    return this.trackProviderCall("video.get_prediction", undefined, undefined, startedAt, async () => {
      const response = await withRetry(
        () => this.http.getJson<unknown>(this.url(this.settings.apiBaseUrl, `/predictions/${encodeURIComponent(predictionId)}`), signal),
        DEFAULT_RETRY_POLICY,
        signal
      );
      return mapPrediction(response, "unknown", startedAt);
    });
  }

  public async waitForPrediction(predictionId: string, signal?: AbortSignal): Promise<Prediction> {
    const startedAt = now();
    const deadline = startedAt.getTime() + this.settings.pollingTimeoutMs;

    while (Date.now() <= deadline) {
      const prediction = await this.getPrediction(predictionId, signal);
      if (prediction.status === "succeeded") {
        return prediction;
      }
      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new ProviderError({
          code: "GENERATION_FAILED",
          provider: ATLAS_PROVIDER_NAME,
          message: `Atlas Cloud prediction ${predictionId} ended with status ${prediction.status}.`,
          details: prediction.raw
        });
      }
      await sleep(this.settings.pollingIntervalMs, signal);
    }

    throw new ProviderError({
      code: "POLLING_TIMEOUT",
      provider: ATLAS_PROVIDER_NAME,
      retryable: true,
      message: `Atlas Cloud prediction ${predictionId} did not finish within ${this.settings.pollingTimeoutMs}ms.`
    });
  }

  public async registerAsset(request: AssetRegistrationRequest, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    return this.trackProviderCall("asset.register", undefined, request.metadata?.graphNodeId, startedAt, async () => {
      const response = await withRetry(
        () =>
          this.http.postJson<unknown>(
            this.url(this.settings.assetBaseUrl, "/assets"),
            {
              url: request.uri,
              type: request.kind,
              metadata: request.metadata
            },
            signal
          ),
        DEFAULT_RETRY_POLICY,
        signal
      );
      return mapAssetRegistration(response);
    });
  }

  public async getAsset(assetId: string, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    return this.trackProviderCall("asset.get", undefined, undefined, startedAt, async () => {
      const response = await withRetry(
        () => this.http.getJson<unknown>(this.url(this.settings.assetBaseUrl, `/assets/${encodeURIComponent(assetId)}`), signal),
        DEFAULT_RETRY_POLICY,
        signal
      );
      return mapAssetRegistration(response);
    });
  }

  public async waitUntilActive(assetId: string, signal?: AbortSignal): Promise<AssetRegistration> {
    const startedAt = now();
    const deadline = startedAt.getTime() + this.settings.pollingTimeoutMs;

    while (Date.now() <= deadline) {
      const asset = await this.getAsset(assetId, signal);
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
      await sleep(this.settings.pollingIntervalMs, signal);
    }

    throw new ProviderError({
      code: "ASSET_NOT_ACTIVE",
      provider: ATLAS_PROVIDER_NAME,
      retryable: true,
      message: `Atlas Cloud asset ${assetId} did not become active within ${this.settings.pollingTimeoutMs}ms.`
    });
  }

  public async deleteAsset(assetId: string, signal?: AbortSignal): Promise<void> {
    const startedAt = now();
    await this.trackProviderCall("asset.delete", undefined, undefined, startedAt, async () => {
      await withRetry(
        () => this.http.deleteJson<unknown>(this.url(this.settings.assetBaseUrl, `/assets/${encodeURIComponent(assetId)}`), signal),
        DEFAULT_RETRY_POLICY,
        signal
      );
    });
  }

  private async submitVideoGeneration(
    expectedMode: ProviderMode,
    request: VideoGenerationRequest,
    signal?: AbortSignal
  ): Promise<Prediction> {
    this.validateVideoRequest(expectedMode, request);
    const startedAt = now();
    const payload = this.toAtlasVideoPayload(request);

    return this.trackProviderCall("video.submit", request.modelId, request.metadata?.graphNodeId, startedAt, async () => {
      const response = await withRetry(
        () => this.http.postJson<unknown>(this.url(this.settings.apiBaseUrl, "/predictions"), payload, signal),
        DEFAULT_RETRY_POLICY,
        signal
      );
      return mapPrediction(response, request.modelId, startedAt);
    });
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
  }

  private toAtlasVideoPayload(request: VideoGenerationRequest): Record<string, unknown> {
    const references = request.references.map((reference) => ({
      type: reference.kind,
      url: reference.providerAssetId ? `asset://${reference.providerAssetId}` : reference.uri,
      role: reference.role,
      label: reference.label
    }));

    return {
      model: request.modelId,
      mode: request.mode,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      references,
      duration: request.settings.durationSeconds,
      resolution: request.settings.resolution,
      ratio: request.settings.ratio,
      generate_audio: request.settings.generateAudio,
      watermark: request.settings.watermark,
      return_last_frame: request.settings.returnLastFrame,
      metadata: request.metadata
    };
  }

  private async trackProviderCall<TValue>(
    operation: string,
    modelId: string | undefined,
    graphNodeId: string | undefined,
    startedAt: Date,
    callback: () => Promise<TValue>
  ): Promise<TValue> {
    let retryCount = 0;
    try {
      const result = await callback();
      const completedAt = now();
      this.ledger?.record({
        provider: ATLAS_PROVIDER_NAME,
        operation,
        requestedAt: startedAt,
        completedAt,
        latencyMs: elapsedMs(startedAt, completedAt),
        status: "succeeded",
        retryCount,
        ...(modelId ? { modelId } : {}),
        ...(graphNodeId ? { graphNodeId } : {})
      });
      return result;
    } catch (error) {
      const providerError = asProviderError(ATLAS_PROVIDER_NAME, error);
      const completedAt = now();
      this.ledger?.record({
        provider: ATLAS_PROVIDER_NAME,
        operation,
        requestedAt: startedAt,
        completedAt,
        latencyMs: elapsedMs(startedAt, completedAt),
        status: providerError.code === "POLLING_TIMEOUT" ? "timeout" : "failed",
        retryCount,
        ...(modelId ? { modelId } : {}),
        ...(graphNodeId ? { graphNodeId } : {})
      });
      throw providerError;
    }
  }

  private url(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }
}
