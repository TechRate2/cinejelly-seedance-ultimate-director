/**
 * Provider-neutral video capability validation.
 * It blocks unsupported render requests before asset registration or paid generation calls.
 */

import type { ProviderCapability, ProviderReference, VideoGenerationRequest } from "../types/provider.js";
import { ProviderError } from "../utils/errors.js";

export class ProviderCapabilityValidator {
  public validateVideoRequest(input: {
    readonly providerName: string;
    readonly request: VideoGenerationRequest;
    readonly capabilities: readonly ProviderCapability[];
  }): void {
    const capability = this.resolveCapability(input.request, input.capabilities, input.providerName);

    if (!capability.modes.includes(input.request.mode)) {
      throw this.unsupported(
        input.providerName,
        `Mode ${input.request.mode} is not supported by model ${input.request.modelId}.`
      );
    }
    if (
      input.request.settings.durationSeconds < capability.durations.min ||
      input.request.settings.durationSeconds > capability.durations.max
    ) {
      throw this.unsupported(
        input.providerName,
        `Duration ${input.request.settings.durationSeconds}s is outside supported range ${capability.durations.min}-${capability.durations.max}s for model ${input.request.modelId}.`
      );
    }
    if (!capability.resolutions.includes(input.request.settings.resolution)) {
      throw this.unsupported(
        input.providerName,
        `Resolution ${input.request.settings.resolution} is not supported by model ${input.request.modelId}.`
      );
    }
    if (!capability.ratios.includes(input.request.settings.ratio)) {
      throw this.unsupported(
        input.providerName,
        `Aspect ratio ${input.request.settings.ratio} is not supported by model ${input.request.modelId}.`
      );
    }
    this.validateSettingSupport({
      providerName: input.providerName,
      modelId: input.request.modelId,
      capability,
      request: input.request
    });
    for (const reference of input.request.references) {
      this.validateReference({
        providerName: input.providerName,
        modelId: input.request.modelId,
        capability,
        reference
      });
    }
  }

  private resolveCapability(
    request: VideoGenerationRequest,
    capabilities: readonly ProviderCapability[],
    providerName: string
  ): ProviderCapability {
    const capability = capabilities.find(
      (candidate) => candidate.provider === request.provider && candidate.modelId === request.modelId
    );
    if (!capability) {
      throw new ProviderError({
        code: "MODEL_UNAVAILABLE",
        provider: providerName,
        message: `No configured capability found for provider ${request.provider} model ${request.modelId}.`
      });
    }
    return capability;
  }

  private validateSettingSupport(input: {
    readonly providerName: string;
    readonly modelId: string;
    readonly capability: ProviderCapability;
    readonly request: VideoGenerationRequest;
  }): void {
    const supportedSettings = input.capability.settings;
    if (!supportedSettings) {
      return;
    }
    if (supportedSettings.generateAudio === false && input.request.settings.generateAudio) {
      throw this.unsupported(
        input.providerName,
        `Native audio generation is not supported by model ${input.modelId}.`
      );
    }
    if (supportedSettings.returnLastFrame === false && input.request.settings.returnLastFrame) {
      throw this.unsupported(
        input.providerName,
        `Last-frame return is not supported by model ${input.modelId}.`
      );
    }
    if (
      supportedSettings.bitrateModes &&
      !supportedSettings.bitrateModes.includes(input.request.settings.bitrateMode)
    ) {
      throw this.unsupported(
        input.providerName,
        `Bitrate mode ${input.request.settings.bitrateMode} is not supported by model ${input.modelId}.`
      );
    }
    if (supportedSettings.watermark === false && input.request.settings.watermark) {
      throw this.unsupported(
        input.providerName,
        `Watermark output is not supported by model ${input.modelId}.`
      );
    }
  }

  private validateReference(input: {
    readonly providerName: string;
    readonly modelId: string;
    readonly capability: ProviderCapability;
    readonly reference: ProviderReference;
  }): void {
    const supportedByKind = input.capability.references.includes(input.reference.kind);
    const supportedByRole = input.reference.role
      ? input.capability.references.some((referenceKind) => referenceKind === input.reference.role)
      : false;

    if (supportedByKind || supportedByRole) {
      return;
    }

    throw this.unsupported(
      input.providerName,
      `Reference ${input.reference.label || input.reference.role || input.reference.kind} is not supported by model ${input.modelId}.`
    );
  }

  private unsupported(providerName: string, message: string): ProviderError {
    return new ProviderError({
      code: "UNSUPPORTED_SETTING",
      provider: providerName,
      message
    });
  }
}
