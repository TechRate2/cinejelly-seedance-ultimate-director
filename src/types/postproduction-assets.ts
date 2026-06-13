/**
 * Postproduction asset planning contracts.
 * These records make subtitles, narration, BGM, ambience, and SFX decisions reviewable before assembly.
 */

import type { AudioMixOptions, AudioTrackRole } from "./audio.js";
import type { CaptionOptions } from "./caption.js";

export type PostproductionAssetStatus = "disabled" | "planned" | "review_required";

export type PostproductionCaptionDeliveryMode = "disabled" | "sidecar" | "burn_in";

export type PostproductionOriginalAudioPolicy = "detect_at_assembly" | "not_used";

export type PostproductionAssetIssueSeverity = "info" | "warn" | "block";

export type PostproductionAssetIssueCode =
  | "caption_enabled_without_cues"
  | "caption_cues_not_rendered"
  | "audio_tracks_not_mixed"
  | "audio_mix_enabled_without_tracks"
  | "tts_generation_not_configured"
  | "bgm_generation_not_configured";

export interface PostproductionCaptionPlan {
  readonly enabled: boolean;
  readonly cueCount: number;
  readonly burnIn: boolean;
  readonly deliveryMode: PostproductionCaptionDeliveryMode;
  readonly totalCaptionSeconds: number;
  readonly language?: CaptionOptions["language"];
}

export interface PostproductionAudioRoleCount {
  readonly role: AudioTrackRole;
  readonly count: number;
}

export interface PostproductionAudioPlan {
  readonly enabled: boolean;
  readonly mode: AudioMixOptions["mode"];
  readonly trackCount: number;
  readonly roleCounts: readonly PostproductionAudioRoleCount[];
  readonly originalAudioPolicy: PostproductionOriginalAudioPolicy;
  readonly outputBitrate: string;
}

export interface PostproductionAssetIssue {
  readonly code: PostproductionAssetIssueCode;
  readonly severity: PostproductionAssetIssueSeverity;
  readonly message: string;
  readonly repair: string;
}

export interface PostproductionAssetPlan {
  readonly planId: string;
  readonly projectId: string;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: PostproductionAssetStatus;
  readonly caption: PostproductionCaptionPlan;
  readonly audio: PostproductionAudioPlan;
  readonly issueCount: number;
  readonly issues: readonly PostproductionAssetIssue[];
}
