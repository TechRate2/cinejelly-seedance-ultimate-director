/**
 * Long-form timeline contracts.
 * They make sequence, shot, caption, audio, and render-batch timing reviewable before customer release.
 */

import type { AudioTrackRole, GeneratedAudioIntentKind } from "./audio.js";
import type { LongFormSequenceRenderModeRecommendation } from "./long-form-continuity.js";
import type { ContinuityRisk } from "./prompt.js";
import type {
  AspectRatio,
  AudioMode,
  BitrateMode,
  QualityMode,
  Resolution,
  SpeedTier
} from "./settings.js";
import type { RenderScheduleMode, RenderScheduleSequentialReason } from "../core/render-scheduler.js";

export type LongFormTimelineIssueSeverity = "info" | "warn" | "block";

export type LongFormTimelineIssueCode =
  | "duration_drift"
  | "sequence_duration_drift"
  | "missing_render_schedule_item"
  | "caption_coverage_gap"
  | "caption_out_of_range"
  | "generated_audio_timing_gap"
  | "generated_audio_blocked"
  | "sequential_manual_review";

export interface LongFormTimelineCaptionCoverage {
  readonly cueCount: number;
  readonly coveredSeconds: number;
  readonly cueIndexes: readonly number[];
}

export interface LongFormTimelineAudioCoverage {
  readonly suppliedTrackRoles: readonly AudioTrackRole[];
  readonly generatedIntentIds: readonly string[];
  readonly generatedKinds: readonly GeneratedAudioIntentKind[];
  readonly generatedLanguages: readonly string[];
}

export type LongFormTimelineProductionAct =
  | "opening"
  | "development"
  | "proof"
  | "turning_point"
  | "payoff";

export interface LongFormTimelineProviderSettingPolicy {
  readonly tier: SpeedTier;
  readonly resolution: Resolution;
  readonly qualityMode: QualityMode;
  readonly ratio: AspectRatio;
  readonly audioMode: AudioMode;
  readonly bitrateMode: BitrateMode;
  readonly watermark: boolean;
  readonly returnLastFrame: boolean;
  readonly nativeProviderAudioEnabled: boolean;
  readonly externalAudioScriptEnabled: boolean;
  readonly lastFrameChainingPreferred: boolean;
}

export interface LongFormTimelineSegmentProductionContract {
  readonly productionAct: LongFormTimelineProductionAct;
  readonly timingGoal: string;
  readonly requiredVisualChange: string;
  readonly voiceoverLine: string;
  readonly nativeAudioPrompt: string;
  readonly musicCue: string;
  readonly sfxCue: string;
  readonly endpointJob: string;
  readonly providerSettingSummary: string;
}

export interface LongFormTimelineAudioScriptLine {
  readonly lineId: string;
  readonly sequenceId: string;
  readonly shotId: string;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly durationSeconds: number;
  readonly spokenLine: string;
  readonly language: string;
  readonly delivery: string;
  readonly wordBudget: number;
  readonly visualSync: string;
}

export interface LongFormTimelineSegment {
  readonly segmentId: string;
  readonly sequenceId: string;
  readonly sequenceOrder: number;
  readonly order: number;
  readonly shotId: string;
  readonly sceneId?: string;
  readonly beatId?: string;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly durationSeconds: number;
  readonly storyArcRole: string;
  readonly storyArcPosition: string;
  readonly storyArcContract: string;
  readonly intent: string;
  readonly subject: string;
  readonly action: string;
  readonly camera: string;
  readonly lighting: string;
  readonly audioIntent?: string;
  readonly transitionIntent?: string;
  readonly renderBatchId?: string;
  readonly renderMode: RenderScheduleMode;
  readonly sequentialReasons: readonly RenderScheduleSequentialReason[];
  readonly referenceRoles: readonly string[];
  readonly riskCodes: readonly ContinuityRisk[];
  readonly continuityFields: readonly string[];
  readonly sourceVideoSceneIds: readonly string[];
  readonly captionCoverage: LongFormTimelineCaptionCoverage;
  readonly audioCoverage: LongFormTimelineAudioCoverage;
  readonly productionContract: LongFormTimelineSegmentProductionContract;
  readonly audioScriptLineId: string;
  readonly requiresManualReview: boolean;
}

export interface LongFormTimelineSequence {
  readonly sequenceId: string;
  readonly title: string;
  readonly purpose: string;
  readonly order: number;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly durationSeconds: number;
  readonly targetDurationSeconds: number;
  readonly segmentIds: readonly string[];
  readonly shotIds: readonly string[];
  readonly riskCodes: readonly ContinuityRisk[];
  readonly sourceVideoSceneIds: readonly string[];
  readonly renderModeRecommendation: LongFormSequenceRenderModeRecommendation;
  readonly bridgeToNextSequenceId?: string;
  readonly bridgeIntent?: string;
  readonly requiredBridgeAnchors: readonly string[];
}

export interface LongFormTimelinePostproductionSummary {
  readonly captionCueCount: number;
  readonly captionCoveredSeconds: number;
  readonly audioTrackCount: number;
  readonly generatedAudioIntentCount: number;
  readonly generatedAudioReadyIntentCount: number;
  readonly generatedAudioBlockedIntentCount: number;
}

export interface LongFormTimelineIssue {
  readonly issueId: string;
  readonly severity: LongFormTimelineIssueSeverity;
  readonly code: LongFormTimelineIssueCode;
  readonly message: string;
  readonly repair: string;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
  readonly evidence: Record<string, string | number | boolean>;
}

export interface LongFormTimelinePlan {
  readonly schemaVersion: "cinejelly.long-form-timeline.v1";
  readonly projectId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly targetDurationSeconds: number;
  readonly plannedDurationSeconds: number;
  readonly sequenceCount: number;
  readonly segmentCount: number;
  readonly shotCount: number;
  readonly transitionCount: number;
  readonly sequentialSegmentCount: number;
  readonly manualReviewSegmentCount: number;
  readonly captionCueCount: number;
  readonly audioEventCount: number;
  readonly generatedAudioEventCount: number;
  readonly audioScriptLineCount: number;
  readonly providerSettingPolicy: LongFormTimelineProviderSettingPolicy;
  readonly issueCount: number;
  readonly blockingIssueCount: number;
  readonly warningIssueCount: number;
  readonly sequences: readonly LongFormTimelineSequence[];
  readonly segments: readonly LongFormTimelineSegment[];
  readonly audioScript: readonly LongFormTimelineAudioScriptLine[];
  readonly postproduction: LongFormTimelinePostproductionSummary;
  readonly issues: readonly LongFormTimelineIssue[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendTimelineEvidence: boolean;
    readonly canProceedToRender: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
