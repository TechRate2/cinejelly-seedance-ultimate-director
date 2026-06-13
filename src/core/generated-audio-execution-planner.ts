/**
 * Maps generated-audio intents to verified provider capabilities without calling providers.
 * Inspired by MoneyPrinterTurbo audio-stage visibility and VibeFrame validation-before-spend discipline.
 */

import type { GeneratedAudioIntent } from "../types/audio.js";
import type {
  AudioGenerationCapability,
  AudioGenerationOutputFormat,
  ProviderMetadata
} from "../types/provider.js";
import type {
  GeneratedAudioCapabilityMatch,
  GeneratedAudioExecutionBlockedItem,
  GeneratedAudioExecutionItem,
  GeneratedAudioExecutionPlan,
  GeneratedAudioExecutionPlannerOptions,
  GeneratedAudioExecutionPlanStatus,
  GeneratedAudioExecutionReadyItem
} from "../types/generated-audio-execution.js";

const DEFAULT_AUDIO_OUTPUT_FORMAT: AudioGenerationOutputFormat = "mp3";

export interface GeneratedAudioExecutionPlannerInput {
  readonly intents: readonly GeneratedAudioIntent[];
  readonly capabilities?: readonly AudioGenerationCapability[];
  readonly metadata?: ProviderMetadata;
  readonly options?: GeneratedAudioExecutionPlannerOptions;
}

export class GeneratedAudioExecutionPlanner {
  public plan(input: GeneratedAudioExecutionPlannerInput): GeneratedAudioExecutionPlan {
    const intents = input.intents;
    const capabilities = input.capabilities ?? [];
    const outputFormat = input.options?.outputFormat ?? DEFAULT_AUDIO_OUTPUT_FORMAT;
    if (intents.length === 0) {
      return this.emptyPlan("not_requested", outputFormat);
    }

    const items = intents.map((intent) => this.planItem(intent, capabilities, outputFormat, input.metadata));
    const readyCount = items.filter((item) => item.status === "ready_for_provider").length;
    const blockedCount = items.length - readyCount;
    return {
      status: this.planStatus(readyCount, blockedCount),
      intentCount: intents.length,
      readyCount,
      blockedCount,
      requestedDurationSeconds: this.totalDurationSeconds(items),
      outputFormat,
      items
    };
  }

  private planItem(
    intent: GeneratedAudioIntent,
    capabilities: readonly AudioGenerationCapability[],
    outputFormat: AudioGenerationOutputFormat,
    metadata: ProviderMetadata | undefined
  ): GeneratedAudioExecutionItem {
    const requestedDurationSeconds = this.durationSeconds(intent);
    if (requestedDurationSeconds !== undefined && requestedDurationSeconds <= 0) {
      return this.blocked(intent, "invalid_duration", "Generated-audio intent duration must be greater than zero seconds.", {
        requestedDurationSeconds,
        candidateProviderCount: capabilities.length,
        candidateKindCount: 0
      });
    }

    const providerCandidates = intent.providerPreference
      ? capabilities.filter((capability) => capability.provider === intent.providerPreference)
      : capabilities;
    if (intent.providerPreference && providerCandidates.length === 0) {
      return this.blocked(intent, "provider_preference_unavailable", "Requested generated-audio provider has no verified capability.", {
        requestedDurationSeconds,
        candidateProviderCount: 0,
        candidateKindCount: 0
      });
    }
    if (providerCandidates.length === 0) {
      return this.blocked(intent, "provider_not_configured", "No verified generated-audio provider capability is configured.", {
        requestedDurationSeconds,
        candidateProviderCount: 0,
        candidateKindCount: 0
      });
    }

    const kindCandidates = providerCandidates.filter((capability) => capability.kinds.includes(intent.kind));
    if (kindCandidates.length === 0) {
      return this.blocked(intent, "kind_not_supported", "No verified generated-audio capability supports this intent kind.", {
        requestedDurationSeconds,
        candidateProviderCount: providerCandidates.length,
        candidateKindCount: 0
      });
    }

    const durationCandidates = kindCandidates.filter(
      (capability) => requestedDurationSeconds === undefined || requestedDurationSeconds <= capability.maxDurationSeconds
    );
    if (durationCandidates.length === 0) {
      return this.blocked(intent, "duration_exceeds_capability", "Generated-audio intent duration exceeds verified provider capability.", {
        requestedDurationSeconds,
        candidateProviderCount: providerCandidates.length,
        candidateKindCount: kindCandidates.length
      });
    }

    const formatCandidates = durationCandidates.filter((capability) => capability.outputFormats.includes(outputFormat));
    if (formatCandidates.length === 0) {
      return this.blocked(intent, "output_format_not_supported", "No verified generated-audio capability supports the requested output format.", {
        requestedDurationSeconds,
        candidateProviderCount: providerCandidates.length,
        candidateKindCount: kindCandidates.length
      });
    }

    return this.ready(intent, this.bestMatch(formatCandidates, requestedDurationSeconds), outputFormat, metadata);
  }

  private ready(
    intent: GeneratedAudioIntent,
    match: GeneratedAudioCapabilityMatch,
    outputFormat: AudioGenerationOutputFormat,
    metadata: ProviderMetadata | undefined
  ): GeneratedAudioExecutionReadyItem {
    const request = {
      provider: match.capability.provider,
      modelId: match.capability.modelId,
      intentId: intent.intentId,
      kind: intent.kind,
      prompt: intent.prompt,
      settings: {
        outputFormat,
        ...(match.requestedDurationSeconds !== undefined ? { durationSeconds: match.requestedDurationSeconds } : {}),
        ...(intent.language ? { language: intent.language } : {}),
        ...(intent.voiceStyle ? { voiceStyle: intent.voiceStyle } : {}),
        ...(intent.mood ? { mood: intent.mood } : {}),
        ...(intent.volume !== undefined ? { volume: intent.volume } : {})
      },
      ...(metadata ? { metadata } : {})
    };
    return {
      intentId: intent.intentId,
      kind: intent.kind,
      status: "ready_for_provider",
      ...(intent.providerPreference ? { providerPreference: intent.providerPreference } : {}),
      ...(match.requestedDurationSeconds !== undefined ? { requestedDurationSeconds: match.requestedDurationSeconds } : {}),
      provider: match.capability.provider,
      modelId: match.capability.modelId,
      maxDurationSeconds: match.capability.maxDurationSeconds,
      request
    };
  }

  private blocked(
    intent: GeneratedAudioIntent,
    reason: GeneratedAudioExecutionBlockedItem["reason"],
    message: string,
    evidence: {
      readonly requestedDurationSeconds: number | undefined;
      readonly candidateProviderCount: number;
      readonly candidateKindCount: number;
    }
  ): GeneratedAudioExecutionBlockedItem {
    return {
      intentId: intent.intentId,
      kind: intent.kind,
      status: "blocked",
      reason,
      message,
      ...(intent.providerPreference ? { providerPreference: intent.providerPreference } : {}),
      ...(evidence.requestedDurationSeconds !== undefined ? { requestedDurationSeconds: evidence.requestedDurationSeconds } : {}),
      candidateProviderCount: evidence.candidateProviderCount,
      candidateKindCount: evidence.candidateKindCount
    };
  }

  private bestMatch(
    capabilities: readonly AudioGenerationCapability[],
    requestedDurationSeconds: number | undefined
  ): GeneratedAudioCapabilityMatch {
    const [capability] = [...capabilities].sort((left, right) => {
      const leftDurationFit = requestedDurationSeconds === undefined
        ? left.maxDurationSeconds
        : left.maxDurationSeconds - requestedDurationSeconds;
      const rightDurationFit = requestedDurationSeconds === undefined
        ? right.maxDurationSeconds
        : right.maxDurationSeconds - requestedDurationSeconds;
      if (leftDurationFit !== rightDurationFit) {
        return leftDurationFit - rightDurationFit;
      }
      const providerOrder = left.provider.localeCompare(right.provider);
      return providerOrder !== 0 ? providerOrder : left.modelId.localeCompare(right.modelId);
    });
    if (!capability) {
      throw new Error("Generated-audio capability match requires at least one candidate.");
    }
    return { capability, ...(requestedDurationSeconds !== undefined ? { requestedDurationSeconds } : {}) };
  }

  private durationSeconds(intent: GeneratedAudioIntent): number | undefined {
    if (typeof intent.durationSeconds === "number" && Number.isFinite(intent.durationSeconds)) {
      return intent.durationSeconds;
    }
    if (
      typeof intent.startSecond === "number" &&
      Number.isFinite(intent.startSecond) &&
      typeof intent.endSecond === "number" &&
      Number.isFinite(intent.endSecond)
    ) {
      return intent.endSecond - intent.startSecond;
    }
    return undefined;
  }

  private planStatus(readyCount: number, blockedCount: number): GeneratedAudioExecutionPlanStatus {
    if (readyCount === 0 && blockedCount === 0) {
      return "not_requested";
    }
    if (readyCount === 0) {
      return "planned_only";
    }
    return blockedCount === 0 ? "ready_for_provider" : "partially_ready";
  }

  private emptyPlan(
    status: GeneratedAudioExecutionPlanStatus,
    outputFormat: AudioGenerationOutputFormat
  ): GeneratedAudioExecutionPlan {
    return {
      status,
      intentCount: 0,
      readyCount: 0,
      blockedCount: 0,
      requestedDurationSeconds: 0,
      outputFormat,
      items: []
    };
  }

  private totalDurationSeconds(items: readonly GeneratedAudioExecutionItem[]): number {
    return items.reduce((sum, item) => sum + Math.max(0, item.requestedDurationSeconds ?? 0), 0);
  }
}
