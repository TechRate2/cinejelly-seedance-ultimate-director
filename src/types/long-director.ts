/**
 * Long Director contracts.
 * This keeps story/series decisions separate from short-form viral decisions.
 */

export type LongDirectorPlanStatus = "ready" | "review_required" | "blocked";

export type LongDirectorNarrativeMode =
  | "single_long_story"
  | "documentary_explainer"
  | "training_or_education"
  | "brand_film"
  | "series_episode";

export type LongDirectorContinuityMode = "project_bible" | "series_bible_required";

export type LongDirectorCheckpointStage = "story" | "scene_plan" | "references" | "sample" | "render" | "publish";

export type LongDirectorFindingSeverity = "info" | "warn" | "block";

export type LongDirectorFindingCode =
  | "series_bible_required"
  | "sequence_bridge_required"
  | "long_duration_needs_hierarchical_planning"
  | "continuity_anchor_gap"
  | "repair_scope_must_stay_narrow"
  | "sample_checkpoint_recommended"
  | "blocked_dependency";

export interface LongDirectorFinding {
  readonly code: LongDirectorFindingCode;
  readonly severity: LongDirectorFindingSeverity;
  readonly message: string;
  readonly repair: string;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
}

export interface LongDirectorStoryPlan {
  readonly narrativeMode: LongDirectorNarrativeMode;
  readonly centralQuestionRequired: true;
  readonly sequencePurposeRequired: true;
  readonly payoffRequired: true;
  readonly recommendedActs: readonly string[];
}

export interface LongDirectorContinuityPlan {
  readonly mode: LongDirectorContinuityMode;
  readonly characterBibleRequired: boolean;
  readonly worldBibleRequired: boolean;
  readonly bridgeEverySequence: true;
  readonly preserveAnchors: readonly string[];
}

export interface LongDirectorRepairPlan {
  readonly narrowRepairRequired: true;
  readonly preferredOrder: readonly ["story", "sequence", "shot", "prompt", "rerender", "postproduction"];
  readonly rerenderOnlyAffectedShots: true;
}

export interface LongDirectorCheckpointPolicy {
  readonly requiredStages: readonly LongDirectorCheckpointStage[];
  readonly pauseBeforeProviderSpend: true;
  readonly pauseBeforeCustomerRelease: true;
}

export interface LongDirectorPlan {
  readonly schemaVersion: "cinejelly.long-director.v1";
  readonly directorId: string;
  readonly projectId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: LongDirectorPlanStatus;
  readonly storyPlan: LongDirectorStoryPlan;
  readonly continuityPlan: LongDirectorContinuityPlan;
  readonly repairPlan: LongDirectorRepairPlan;
  readonly checkpointPolicy: LongDirectorCheckpointPolicy;
  readonly findings: readonly LongDirectorFinding[];
  readonly directorDirectives: readonly string[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendDirectorEvidence: boolean;
    readonly canProceedToLongPlanning: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
