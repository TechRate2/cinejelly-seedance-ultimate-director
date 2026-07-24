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
  /**
   * Present when the audio ran longer than planned but within the natural atempo cap: the track is
   * tempo-fitted at mix time instead of rejected (the MoneyPrinterTurbo accommodate-don't-clip
   * invariant, adapted to a fixed-length video). Transparency without flipping status.
   */
  readonly tempoFit?: {
    readonly ratio: number;
    readonly measuredSeconds: number;
    readonly plannedSeconds: number;
  };
  readonly audioTrack?: AudioMixTrack;
}

export type GeneratedAudioOutputBatchValidationStatus =
  | "not_requested"
  | "approved"
  | "review_required"
  | "partially_approved"
  | "rejected";

export type GeneratedAudioOutputBatchValidationIssueCode =
  | "duplicate_intent"
  | "duplicate_planned_item"
  | "missing_intent"
  | "missing_planned_result"
  | "duplicate_result"
  | "unexpected_result"
  | "result_for_blocked_intent";

export interface GeneratedAudioOutputBatchValidationIssue {
  readonly code: GeneratedAudioOutputBatchValidationIssueCode;
  readonly severity: GeneratedAudioOutputValidationSeverity;
  readonly intentId: string;
  readonly message: string;
  readonly repair: string;
}

export interface GeneratedAudioOutputValidationBatchReport {
  readonly status: GeneratedAudioOutputBatchValidationStatus;
  readonly intentCount: number;
  readonly readyIntentCount: number;
  readonly resultCount: number;
  readonly approvedTrackCount: number;
  readonly reviewRequiredReportCount: number;
  readonly rejectedReportCount: number;
  readonly missingResultCount: number;
  readonly unexpectedResultCount: number;
  readonly duplicateResultCount: number;
  readonly issueCount: number;
  readonly issues: readonly GeneratedAudioOutputBatchValidationIssue[];
  readonly reports: readonly GeneratedAudioOutputValidationReport[];
  readonly audioTracks: readonly AudioMixTrack[];
}
