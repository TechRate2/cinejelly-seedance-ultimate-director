/**
 * Short Director contracts.
 * This keeps short-form decisions separate from long-form story direction so the future UI can expose
 * a clear Short workflow without routing everything through a broad meta-director.
 */

import type { ShortPipelineAudioMode, ShortPipelinePlatform } from "./short-pipeline.js";

export type ShortDirectorPlanStatus = "ready" | "review_required" | "blocked";

export type ShortDirectorWorkflowMode = "single_clip" | "storyboard_multishot";

export type ShortDirectorDurationStrategy = "completion_first_15s" | "engagement_30s" | "flexible_60s";

export type ShortDirectorCreativeMode =
  | "ugc_ad"
  | "product_review"
  | "product_demo"
  | "explainer"
  | "cinematic_reveal"
  | "native_social_story";

export type ShortDirectorFindingSeverity = "info" | "warn" | "block";

export type ShortDirectorFindingCode =
  | "duration_needs_multishot_storyboard"
  | "single_clip_duration_safe"
  | "hook_window_required"
  | "no_visible_text_caption_adaptation"
  | "reference_pattern_requires_originality_guardrail"
  | "product_or_brand_review_required"
  | "blocked_dependency"
  | "audio_review_required";

export interface ShortDirectorFinding {
  readonly code: ShortDirectorFindingCode;
  readonly severity: ShortDirectorFindingSeverity;
  readonly message: string;
  readonly repair: string;
}

export interface ShortDirectorHookPlan {
  readonly hookWindowSeconds: number;
  readonly firstFrameJob: string;
  readonly patternInterrupt: string;
  readonly viewerPromise: string;
}

export interface ShortDirectorPacingPlan {
  readonly visualChangeEverySeconds: readonly [number, number];
  readonly targetBeatCount: number;
  readonly maxSeedanceShotsPerClip: number;
  readonly recommendedCutLabelPolicy: "shot_n_labels_for_single_generation" | "scene_level_storyboard";
}

export interface ShortDirectorPlatformPlan {
  readonly platform: ShortPipelinePlatform;
  readonly aspectRatio: "9:16" | "16:9";
  readonly safeZone: "universal_vertical_900x1400_center" | "platform_native";
  readonly durationStrategy: ShortDirectorDurationStrategy;
}

export interface ShortDirectorReferencePolicy {
  readonly roleMapRequiredBeforePrompt: true;
  readonly sourceVideoControlsStructureOnly: true;
  readonly protectedIdentityCopyAllowed: false;
  readonly protectedMusicOrVoiceCopyAllowed: false;
  readonly originalityGuardrails: readonly string[];
}

export interface ShortDirectorReviewPolicy {
  readonly creativeApprovalRequired: true;
  readonly requiredSurfaces: readonly ["scene", "audio", "caption", "claim"];
  readonly checkpointPolicy: "pause_before_provider_spend";
  readonly captionStrategy: "review_metadata_only_no_burn_in" | "operator_enabled_postproduction";
}

export interface ShortDirectorAudioPlan {
  readonly mode: ShortPipelineAudioMode;
  readonly startsImmediately: boolean;
  readonly reviewRequired: true;
  readonly targetEnergy: string;
}

export interface ShortDirectorPlan {
  readonly schemaVersion: "cinejelly.short-director.v1";
  readonly directorId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: ShortDirectorPlanStatus;
  readonly creativeMode: ShortDirectorCreativeMode;
  readonly recommendedWorkflowMode: ShortDirectorWorkflowMode;
  readonly platformPlan: ShortDirectorPlatformPlan;
  readonly hookPlan: ShortDirectorHookPlan;
  readonly pacingPlan: ShortDirectorPacingPlan;
  readonly referencePolicy: ShortDirectorReferencePolicy;
  readonly reviewPolicy: ShortDirectorReviewPolicy;
  readonly audioPlan: ShortDirectorAudioPlan;
  readonly findings: readonly ShortDirectorFinding[];
  readonly directorDirectives: readonly string[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendDirectorEvidence: boolean;
    readonly canProceedToShortPlanning: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
