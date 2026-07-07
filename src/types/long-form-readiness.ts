/**
 * Long-form readiness contracts.
 * This no-spend layer combines intent routing, story coherence, adaptive shot strategy,
 * auto-repair planning, and UI review requirements before provider spend.
 */

import type { RenderScheduleMode } from "../core/render-scheduler.js";
import type { VideoRenderWorkflowMode } from "./video-render-strategy.js";

export type LongFormReadinessStatus = "ready" | "review_required" | "blocked";

export type LongFormIntentKind =
  | "commercial_ad"
  | "cinematic_story"
  | "documentary"
  | "education_training"
  | "long_explainer"
  | "reference_product_story"
  | "source_video_guided"
  | "short_story"
  | "general_long_form";

export type LongFormTargetDurationClass =
  | "under_45_seconds"
  | "short_45_90_seconds"
  | "medium_90_180_seconds"
  | "long_3_8_minutes"
  | "extended_over_8_minutes";

export type LongFormUserControlMode =
  | "auto"
  | "single"
  | "storyboard"
  | "multishot"
  | "reference_locked"
  | "source_video"
  | "sequence_bible"
  | "manual_storyboard";

export type LongFormRenderUnitMode =
  | "single_clip"
  | "storyboard_multishot"
  | "reference_locked"
  | "source_video_guided"
  | "sequence_bible"
  | "manual_review_required";

export type LongFormRepairCategory =
  | "intent"
  | "story"
  | "coherence"
  | "shot_strategy"
  | "timeline"
  | "audio_caption"
  | "source_video"
  | "review";

export type LongFormRepairPriority = "low" | "medium" | "high" | "critical";

export interface LongFormIntentRoute {
  readonly intentKind: LongFormIntentKind;
  readonly platformIntent: string;
  readonly targetDurationClass: LongFormTargetDurationClass;
  readonly userControlMode: LongFormUserControlMode;
  readonly recommendedWorkflowMode: VideoRenderWorkflowMode;
  readonly reasons: readonly string[];
  readonly missingInputs: readonly string[];
}

export interface LongFormCoherenceScore {
  readonly overallScore: number;
  readonly storyArcScore: number;
  readonly sequenceBridgeScore: number;
  readonly anchorConsistencyScore: number;
  readonly hookPayoffScore: number;
  readonly timelineFitScore: number;
  readonly sourceVideoAlignmentScore: number;
  readonly issueCount: number;
  readonly blockingIssueCount: number;
  readonly reviewRequiredIssueCount: number;
}

export interface LongFormAdaptiveShotDecision {
  readonly shotId: string;
  readonly sequenceId?: string;
  readonly order: number;
  readonly mode: LongFormRenderUnitMode;
  readonly renderMode: RenderScheduleMode;
  readonly shouldRunTestTake: boolean;
  readonly shouldChainFromPrevious: boolean;
  readonly requiresReferenceLock: boolean;
  readonly requiresManualReview: boolean;
  readonly reasons: readonly string[];
  readonly repairHints: readonly string[];
}

export interface LongFormRepairQueueItem {
  readonly repairId: string;
  readonly category: LongFormRepairCategory;
  readonly priority: LongFormRepairPriority;
  readonly autoRepairable: boolean;
  readonly blocksRender: boolean;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
  readonly trigger: string;
  readonly action: string;
  readonly uiLabel: string;
}

export interface LongFormUiReviewPacket {
  readonly canRenderAfterApproval: boolean;
  readonly requiredApprovalSurfaces: readonly string[];
  readonly sceneReviewCount: number;
  readonly shotReviewCount: number;
  readonly audioReviewCount: number;
  readonly captionReviewCount: number;
  readonly claimReviewCount: number;
  readonly repairQueueCount: number;
  readonly operatorSummary: string;
  readonly nextActions: readonly string[];
}

export interface LongFormReadinessPlan {
  readonly schemaVersion: "cinejelly.long-form-readiness.v1";
  readonly projectId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: LongFormReadinessStatus;
  readonly targetDurationSeconds: number;
  readonly intentRoute: LongFormIntentRoute;
  readonly coherence: LongFormCoherenceScore;
  readonly adaptiveShotDecisions: readonly LongFormAdaptiveShotDecision[];
  readonly repairQueue: readonly LongFormRepairQueueItem[];
  readonly uiReviewPacket: LongFormUiReviewPacket;
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendReadinessEvidence: boolean;
    readonly canProceedToRender: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
