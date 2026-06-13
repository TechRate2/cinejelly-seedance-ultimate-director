/**
 * Generated-audio asset resolution contracts.
 * These records map reviewed asset:// outputs to credential-free HTTPS delivery URLs.
 */

import type { GeneratedAudioIntentKind } from "./audio.js";
import type { ProviderName } from "./provider.js";

export type GeneratedAudioAssetResolutionStatus = "resolved" | "review_required" | "rejected";

export type GeneratedAudioAssetResolutionSeverity = "info" | "warn" | "block";

export type GeneratedAudioAssetResolutionIssueCode =
  | "asset_uri_invalid"
  | "asset_resolution_not_found"
  | "asset_not_approved_for_mix"
  | "resolved_url_invalid"
  | "resolved_url_unsafe"
  | "asset_intent_mismatch"
  | "asset_kind_mismatch"
  | "asset_provider_mismatch"
  | "asset_model_mismatch"
  | "asset_provider_asset_mismatch"
  | "asset_duration_invalid"
  | "asset_duration_mismatch";

export interface GeneratedAudioAssetResolutionIssue {
  readonly code: GeneratedAudioAssetResolutionIssueCode;
  readonly severity: GeneratedAudioAssetResolutionSeverity;
  readonly message: string;
  readonly repair: string;
}

export interface GeneratedAudioAssetResolutionEntry {
  readonly assetUri: string;
  readonly resolvedUrl: string;
  readonly approvedForMix: boolean;
  readonly intentId?: string;
  readonly kind?: GeneratedAudioIntentKind;
  readonly provider?: ProviderName;
  readonly modelId?: string;
  readonly providerAssetId?: string;
  readonly durationSeconds?: number;
  readonly contentHash?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
}

export interface GeneratedAudioAssetResolutionCatalog {
  readonly catalogId?: string;
  readonly entries: readonly GeneratedAudioAssetResolutionEntry[];
}

export interface GeneratedAudioAssetResolutionReport {
  readonly status: GeneratedAudioAssetResolutionStatus;
  readonly assetUri: string;
  readonly resolvedUrl?: string;
  readonly providerAssetId?: string;
  readonly contentHash?: string;
  readonly issueCount: number;
  readonly issues: readonly GeneratedAudioAssetResolutionIssue[];
}
