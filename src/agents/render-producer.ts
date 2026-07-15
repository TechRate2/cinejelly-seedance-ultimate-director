/**
 * Render Producer submits compiled prompts to the selected video provider and waits for async completion.
 * It keeps render orchestration separate from prompt compilation and story planning.
 * Atlas upload/direct-reference handling: video/audio references are ready before generation.
 */

import type { AssetProvider, VideoProvider } from "../providers/contracts.js";
import type { CompiledPrompt } from "../types/prompt.js";
import type { AssetRegistrationRequest, Prediction, ProviderMetadata, ProviderReference, ReferenceKind } from "../types/provider.js";
import { ProviderError } from "../utils/errors.js";
import { ProviderCapabilityValidator } from "../providers/capability-validator.js";

export interface RenderProducerResult {
  readonly compiledPrompt: CompiledPrompt;
  readonly prediction: Prediction;
}

export class RenderProducer {
  private readonly videoProvider: VideoProvider;
  private readonly assetProvider: AssetProvider | undefined;
  private readonly capabilityValidator: ProviderCapabilityValidator;
  private readonly assetCache = new Map<string, Promise<string>>();

  public constructor(videoProvider: VideoProvider, assetProvider?: AssetProvider, capabilityValidator = new ProviderCapabilityValidator()) {
    this.videoProvider = videoProvider;
    this.assetProvider = assetProvider;
    this.capabilityValidator = capabilityValidator;
  }

  public async render(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<RenderProducerResult> {
    // TALKING shot: route to the audio-driven avatar model (image + pre-generated TTS voiceover) so
    // lip-sync/expression/gesture follow real speech. B-roll/action shots keep the general model.
    if (compiledPrompt.avatarPlan && typeof this.videoProvider.generateAvatarVideo === "function") {
      const plan = compiledPrompt.avatarPlan;
      const initial = await this.videoProvider.generateAvatarVideo(
        {
          provider: "atlascloud",
          modelId: plan.modelId,
          imageUrl: plan.imageUrl,
          audioUrl: plan.audioUrl,
          ...(plan.prompt ? { prompt: plan.prompt } : {}),
          ...(plan.outputResolution ? { outputResolution: plan.outputResolution } : {}),
          ...(plan.seed !== undefined ? { seed: plan.seed } : {}),
          ...(compiledPrompt.videoRequest.metadata ? { metadata: compiledPrompt.videoRequest.metadata } : {})
        },
        signal
      );
      const prediction = initial.status === "succeeded"
        ? initial
        : await this.videoProvider.waitForPrediction(initial.predictionId, signal, {
            modelId: plan.modelId,
            ...(compiledPrompt.videoRequest.metadata ? { metadata: compiledPrompt.videoRequest.metadata } : {})
          });
      return {
        compiledPrompt,
        prediction: this.normalizeCompletedPrediction(prediction, plan.modelId)
      };
    }
    this.validateCapability(compiledPrompt);
    const preparedPrompt = await this.prepareReferences(compiledPrompt, signal);
    const initialPrediction = await this.submit(preparedPrompt, signal);
    if (initialPrediction.status === "succeeded") {
      return {
        compiledPrompt: preparedPrompt,
        prediction: this.normalizeCompletedPrediction(initialPrediction, preparedPrompt.videoRequest.modelId)
      };
    }
    const prediction = await this.videoProvider.waitForPrediction(initialPrediction.predictionId, signal, {
      modelId: preparedPrompt.videoRequest.modelId,
      ...(preparedPrompt.videoRequest.metadata ? { metadata: preparedPrompt.videoRequest.metadata } : {})
    });
    return {
      compiledPrompt: preparedPrompt,
      prediction: this.normalizeCompletedPrediction(prediction, preparedPrompt.videoRequest.modelId)
    };
  }

  public validateCapability(compiledPrompt: CompiledPrompt): void {
    this.capabilityValidator.validateVideoRequest({
      providerName: this.videoProvider.name,
      request: compiledPrompt.videoRequest,
      capabilities: this.videoProvider.capabilities(compiledPrompt.videoRequest.modelId)
    });
  }

  public supportedReferenceKinds(modelId: string): readonly ReferenceKind[] | undefined {
    const capabilities = this.videoProvider.capabilities(modelId).filter((capability) => capability.modelId === modelId);
    if (capabilities.length === 0) {
      return undefined;
    }

    const referenceKinds = new Set<ReferenceKind>();
    for (const capability of capabilities) {
      for (const reference of capability.references) {
        referenceKinds.add(reference);
      }
    }
    return [...referenceKinds].sort((left, right) => left.localeCompare(right));
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
      bindingPlan: {
        ...compiledPrompt.bindingPlan,
        providerReferences: references
      },
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
    if (this.isDirectProviderReference(reference.uri)) {
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
    let providerReference = this.assetCache.get(cacheKey);
    if (!providerReference) {
      providerReference = this.registerAndWait(reference, assetKind, metadata, signal).catch((error: unknown) => {
        this.assetCache.delete(cacheKey);
        throw error;
      });
      this.assetCache.set(cacheKey, providerReference);
    }

    return {
      ...reference,
      providerAssetId: await providerReference
    };
  }

  private async registerAndWait(
    reference: ProviderReference,
    kind: AssetRegistrationRequest["kind"],
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
    const providerReference = this.activeAssetProviderReference(activeAsset);
    if (!providerReference) {
      throw new ProviderError({
        code: "ASSET_VALIDATION_FAILED",
        provider: this.assetProvider.name,
        message: "Asset Library registration did not return a usable asset ID or clean HTTPS media URL.",
        details: activeAsset.raw
      });
    }
    return providerReference;
  }

  private activeAssetProviderReference(activeAsset: { readonly assetId: string; readonly uri?: string }): string | undefined {
    if (activeAsset.assetId !== "unknown") {
      return activeAsset.assetId;
    }
    if (activeAsset.uri && this.isDirectProviderReference(activeAsset.uri)) {
      return activeAsset.uri;
    }
    return undefined;
  }

  private isDirectProviderReference(uri: string): boolean {
    try {
      const parsed = new URL(uri);
      return parsed.protocol === "https:" || (parsed.protocol === "asset:" && !parsed.search && !parsed.hash);
    } catch {
      return false;
    }
  }

  private assetKindFor(reference: ProviderReference): AssetRegistrationRequest["kind"] | undefined {
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
    if (
      reference.kind === "image" ||
      reference.kind === "first_frame" ||
      reference.kind === "last_frame" ||
      ["identity", "product", "environment", "style", "first_frame", "last_frame"].includes(reference.role ?? "")
    ) {
      return "image";
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
