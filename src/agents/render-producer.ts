/**
 * Render Producer submits compiled prompts to the selected video provider and waits for async completion.
 * It keeps render orchestration separate from prompt compilation and story planning.
 * Extension based on Atlas Cloud Asset Library guidance: video/audio references are registered and active before generation.
 */

import type { AssetProvider, VideoProvider } from "../providers/contracts.js";
import type { CompiledPrompt } from "../types/prompt.js";
import type { Prediction, ProviderMetadata, ProviderReference } from "../types/provider.js";
import { ProviderError } from "../utils/errors.js";

export interface RenderProducerResult {
  readonly compiledPrompt: CompiledPrompt;
  readonly prediction: Prediction;
}

export class RenderProducer {
  private readonly videoProvider: VideoProvider;
  private readonly assetProvider: AssetProvider | undefined;
  private readonly assetCache = new Map<string, Promise<string>>();

  public constructor(videoProvider: VideoProvider, assetProvider?: AssetProvider) {
    this.videoProvider = videoProvider;
    this.assetProvider = assetProvider;
  }

  public async render(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<RenderProducerResult> {
    const preparedPrompt = await this.prepareReferences(compiledPrompt, signal);
    const initialPrediction = await this.submit(preparedPrompt, signal);
    if (initialPrediction.status === "succeeded") {
      return {
        compiledPrompt: preparedPrompt,
        prediction: this.normalizeCompletedPrediction(initialPrediction, preparedPrompt.videoRequest.modelId)
      };
    }
    const prediction = await this.videoProvider.waitForPrediction(initialPrediction.predictionId, signal);
    return {
      compiledPrompt: preparedPrompt,
      prediction: this.normalizeCompletedPrediction(prediction, preparedPrompt.videoRequest.modelId)
    };
  }

  private async prepareReferences(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<CompiledPrompt> {
    const references = await Promise.all(
      compiledPrompt.videoRequest.references.map((reference) =>
        this.resolveReferenceAsset(reference, compiledPrompt.videoRequest.metadata, signal)
      )
    );

    return {
      ...compiledPrompt,
      references,
      videoRequest: {
        ...compiledPrompt.videoRequest,
        references
      }
    };
  }

  private async resolveReferenceAsset(
    reference: ProviderReference,
    metadata: ProviderMetadata | undefined,
    signal?: AbortSignal
  ): Promise<ProviderReference> {
    if (reference.providerAssetId) {
      return reference;
    }
    const assetKind = this.assetKindFor(reference);
    if (!assetKind) {
      return reference;
    }
    if (!this.assetProvider) {
      throw new ProviderError({
        code: "ASSET_VALIDATION_FAILED",
        provider: this.videoProvider.name,
        message: `Reference ${reference.label || reference.role || reference.kind} requires asset registration, but no AssetProvider is configured.`
      });
    }

    const cacheKey = `${assetKind}:${reference.uri}`;
    let assetId = this.assetCache.get(cacheKey);
    if (!assetId) {
      assetId = this.registerAndWait(reference, assetKind, metadata, signal).catch((error: unknown) => {
        this.assetCache.delete(cacheKey);
        throw error;
      });
      this.assetCache.set(cacheKey, assetId);
    }

    return {
      ...reference,
      providerAssetId: await assetId
    };
  }

  private async registerAndWait(
    reference: ProviderReference,
    kind: "video" | "audio",
    metadata: ProviderMetadata | undefined,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.assetProvider) {
      throw new Error("AssetProvider is required for asset registration.");
    }
    const registration = await this.assetProvider.registerAsset(
      {
        uri: reference.uri,
        kind,
        metadata: {
          ...(metadata ?? {}),
          ...(reference.role ? { referenceRole: reference.role } : {}),
          ...(reference.label ? { referenceLabel: reference.label } : {})
        }
      },
      signal
    );
    const activeAsset = registration.status === "active" ? registration : await this.assetProvider.waitUntilActive(registration.assetId, signal);
    if (activeAsset.assetId === "unknown") {
      throw new ProviderError({
        code: "ASSET_VALIDATION_FAILED",
        provider: this.assetProvider.name,
        message: "Asset Library registration did not return a usable asset ID.",
        details: activeAsset.raw
      });
    }
    return activeAsset.assetId;
  }

  private assetKindFor(reference: ProviderReference): "video" | "audio" | undefined {
    if (reference.kind === "video") {
      return "video";
    }
    if (reference.kind === "audio") {
      return "audio";
    }
    if (reference.role && ["motion", "camera", "source_video_structure"].includes(reference.role)) {
      return "video";
    }
    if (reference.role && ["audio_tempo", "voice"].includes(reference.role)) {
      return "audio";
    }
    return undefined;
  }

  private normalizeCompletedPrediction(prediction: Prediction, modelId: string): Prediction {
    const normalized = prediction.modelId === "unknown" ? { ...prediction, modelId } : prediction;
    if (normalized.status === "succeeded" && normalized.outputUrls.length === 0) {
      throw new ProviderError({
        code: "OUTPUT_MISSING",
        provider: normalized.provider,
        message: `Prediction ${normalized.predictionId} succeeded but did not return an output video URL.`,
        details: normalized.raw
      });
    }
    return normalized;
  }

  private submit(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<Prediction> {
    switch (compiledPrompt.videoRequest.mode) {
      case "text_to_video":
        return this.videoProvider.generateTextToVideo(compiledPrompt.videoRequest, signal);
      case "image_to_video":
        return this.videoProvider.generateImageToVideo(compiledPrompt.videoRequest, signal);
      case "reference_to_video":
        return this.videoProvider.generateReferenceToVideo(compiledPrompt.videoRequest, signal);
      case "edit":
        return this.videoProvider.editVideo(compiledPrompt.videoRequest, signal);
      case "extend":
        return this.videoProvider.extendVideo(compiledPrompt.videoRequest, signal);
      case "video_to_video":
        return this.videoProvider.generateReferenceToVideo(compiledPrompt.videoRequest, signal);
    }
  }
}
