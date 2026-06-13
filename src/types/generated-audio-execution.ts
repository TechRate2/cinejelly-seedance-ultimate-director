/**
 * Generated-audio execution planning contracts.
 * These records map generated-audio intents to verified provider capabilities before any provider spend.
 */

import type { GeneratedAudioIntentKind } from "./audio.js";
import type {
  AudioGenerationCapability,
  AudioGenerationRequest,
  AudioGenerationOutputFormat,
  ProviderName
} from "./provider.js";

export type GeneratedAudioExecutionPlanStatus =
  | "not_requested"
  | "planned_only"
  | "ready_for_provider"
  | "partially_ready";

export type GeneratedAudioExecutionItemStatus = "ready_for_provider" | "blocked";

export type GeneratedAudioExecutionBlockReason =
  | "provider_not_configured"
  | "provider_preference_unavailable"
  | "kind_not_supported"
  | "duration_exceeds_capability"
  | "output_format_not_supported"
  | "invalid_duration";

export interface GeneratedAudioExecutionPlan {
  readonly status: GeneratedAudioExecutionPlanStatus;
  readonly intentCount: number;
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly requestedDurationSeconds: number;
  readonly outputFormat: AudioGenerationOutputFormat;
  readonly items: readonly GeneratedAudioExecutionItem[];
}

export type GeneratedAudioExecutionItem = GeneratedAudioExecutionReadyItem | GeneratedAudioExecutionBlockedItem;

export interface GeneratedAudioExecutionBaseItem {
  readonly intentId: string;
  readonly kind: GeneratedAudioIntentKind;
  readonly providerPreference?: string;
  readonly requestedDurationSeconds?: number;
}

export interface GeneratedAudioExecutionReadyItem extends GeneratedAudioExecutionBaseItem {
  readonly status: "ready_for_provider";
  readonly provider: ProviderName;
  readonly modelId: string;
  readonly maxDurationSeconds: number;
  readonly request: AudioGenerationRequest;
}

export interface GeneratedAudioExecutionBlockedItem extends GeneratedAudioExecutionBaseItem {
  readonly status: "blocked";
  readonly reason: GeneratedAudioExecutionBlockReason;
  readonly message: string;
  readonly candidateProviderCount: number;
  readonly candidateKindCount: number;
}

export interface GeneratedAudioExecutionPlannerOptions {
  readonly outputFormat?: AudioGenerationOutputFormat;
}

export interface GeneratedAudioCapabilityMatch {
  readonly capability: AudioGenerationCapability;
  readonly requestedDurationSeconds?: number;
}
