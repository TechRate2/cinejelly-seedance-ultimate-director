/**
 * Generated-audio output validation contracts.
 * These reports decide whether provider audio results can safely enter the audio mix.
 */

import type { AudioMixTrack, GeneratedAudioIntentKind } from "./audio.js";
import type { GeneratedAudioAssetResolutionReport } from "./generated-audio-asset.js";

export type GeneratedAudioOutputValidationStatus = "approved" | "review_required" | "rejected";

export type GeneratedAudioOutputValidationSeverity = "info" | "warn" | "block";

export type GeneratedAudioOutputValidationIssueCode =
  | "provider_result_not_succeeded"
  | "missing_output_url"
  | "invalid_output_url"
  | "asset_resolution_required"
  | "asset_resolution_failed"
  | "unsafe_output_url"
  | "intent_mismatch"
  | "kind_mismatch"
  | "provider_mismatch"
  | "model_mismatch"
  | "missing_duration"
  | "invalid_duration"
  | "duration_exceeds_plan"
  | "invalid_volume";

export interface GeneratedAudioOutputValidationIssue {
  readonly code: GeneratedAudioOutputValidationIssueCode;
  readonly severity: GeneratedAudioOutputValidationSeverity;
  readonly message: string;
  readonly repair: string;
}

export interface GeneratedAudioOutputValidationReport {
  readonly status: GeneratedAudioOutputValidationStatus;
  readonly intentId: string;
  readonly kind: GeneratedAudioIntentKind;
  readonly provider: string;
  readonly modelId: string;
  readonly outputUrl?: string;
  readonly resolvedOutputUrl?: string;
  readonly providerAssetId?: string;
  readonly durationSeconds?: number;
  readonly assetResolution?: GeneratedAudioAssetResolutionReport;
  readonly issueCount: number;
  readonly issues: readonly GeneratedAudioOutputValidationIssue[];
  readonly audioTrack?: AudioMixTrack;
}
