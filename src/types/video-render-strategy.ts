import type { ReferenceRole } from "./prompt.js";

export type VideoRenderRequestedMode =
  | "auto"
  | "single"
  | "storyboard"
  | "multishot"
  | "reference_locked"
  | "source_video"
  | "sequence_bible"
  | "manual_storyboard";

export type VideoRenderWorkflowMode =
  | "single_clip"
  | "reference_locked_single_clip"
  | "storyboard_multishot"
  | "reference_locked_multishot"
  | "source_video_guided"
  | "sequence_bible"
  | "manual_storyboard";

export type VideoRenderContinuityMode =
  | "single_clip"
  | "prompt_only"
  | "reference_locked"
  | "last_frame_chaining"
  | "source_video_guided"
  | "sequence_bible"
  | "manual_locked";

export type LastFrameChainingStatus = "not_needed" | "recommended" | "required" | "blocked";

export type VideoRenderStrategyIssueSeverity = "info" | "warn" | "block";

export type VideoRenderStrategyDecisionCode =
  | "requested_mode_respected"
  | "auto_single_clip_selected"
  | "auto_storyboard_multishot_selected"
  | "reference_lock_selected"
  | "source_video_guided_selected"
  | "sequence_bible_selected"
  | "manual_storyboard_selected"
  | "last_frame_chaining_required"
  | "last_frame_chaining_recommended"
  | "storyboard_approval_required"
  | "strategy_forces_sequential_render";

export type VideoRenderStrategyIssueCode =
  | "requested_single_conflicts_with_multishot_plan"
  | "requested_source_video_missing_source"
  | "reference_locked_mode_missing_reference"
  | "last_frame_chaining_requested_without_last_frame_output"
  | "multishot_prompt_only_continuity_risk"
  | "storyboard_approval_missing";

export interface VideoRenderStrategyDecision {
  readonly code: VideoRenderStrategyDecisionCode;
  readonly message: string;
}

export interface VideoRenderStrategyIssue {
  readonly severity: VideoRenderStrategyIssueSeverity;
  readonly code: VideoRenderStrategyIssueCode;
  readonly message: string;
  readonly repair: string;
}

export interface VideoRenderStrategyReferenceSummary {
  readonly requestedReferenceCount: number;
  readonly selectedReferenceCount: number;
  readonly requestedRoles: readonly ReferenceRole[];
  readonly selectedRoles: readonly ReferenceRole[];
  readonly primaryReferenceLabels: readonly string[];
}

export interface VideoRenderStrategyLastFrameChaining {
  readonly status: LastFrameChainingStatus;
  readonly eligibleShotCount: number;
  readonly requiresReturnLastFrame: boolean;
  readonly reason: string;
}

export interface VideoRenderStrategyModelPolicy {
  readonly requestField: "modelPreferences.seedanceModelId";
  readonly selectionPolicy: "admin_allowlist";
  readonly requestedModelId?: string;
  readonly note: string;
}

export interface VideoRenderStrategyReleaseGateSummary {
  readonly canProceedToPlanning: boolean;
  readonly canProceedToRender: boolean;
  readonly canUseAsNoSpendStrategyEvidence: boolean;
  readonly canReleaseToCustomerTraffic: false;
  readonly releaseBlocker: string;
}

export interface VideoRenderStrategyPlan {
  readonly schemaVersion: "cinejelly.video-render-strategy.v1";
  readonly projectId: string;
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly requestedMode: VideoRenderRequestedMode;
  readonly workflowMode: VideoRenderWorkflowMode;
  readonly continuityMode: VideoRenderContinuityMode;
  readonly targetDurationSeconds: number;
  readonly plannedShotCount: number;
  readonly singleClipEligible: boolean;
  readonly storyboardRequired: boolean;
  readonly requiresStoryboardApproval: boolean;
  readonly storyboardApprovalStatus: "not_required" | "missing" | "approved";
  readonly requiresReferenceLock: boolean;
  readonly requiresSequentialRender: boolean;
  readonly sourceVideoAnalysisPresent: boolean;
  readonly referenceSummary: VideoRenderStrategyReferenceSummary;
  readonly lastFrameChaining: VideoRenderStrategyLastFrameChaining;
  readonly modelPolicy: VideoRenderStrategyModelPolicy;
  readonly issueCount: number;
  readonly warningIssueCount: number;
  readonly blockingIssueCount: number;
  readonly issues: readonly VideoRenderStrategyIssue[];
  readonly decisions: readonly VideoRenderStrategyDecision[];
  readonly sourcePatternOrigins: readonly string[];
  readonly releaseGateSummary: VideoRenderStrategyReleaseGateSummary;
}
