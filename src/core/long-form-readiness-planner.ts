/**
 * Long-form readiness planner.
 * It turns the existing long-form evidence into one UI-ready pre-render intelligence contract.
 */

import type { StoryPlan } from "../types/agent.js";
import type { LongFormAgentReviewPlan } from "../types/long-form-agent-review.js";
import type { LongFormContinuityPlan, LongFormContinuitySequence } from "../types/long-form-continuity.js";
import type { LongFormCreativeIntelligencePlan } from "../types/long-form-creative-intelligence.js";
import type {
  LongFormAdaptiveShotDecision,
  LongFormCoherenceScore,
  LongFormIntentKind,
  LongFormIntentRoute,
  LongFormReadinessPlan,
  LongFormReadinessStatus,
  LongFormRenderUnitMode,
  LongFormRepairCategory,
  LongFormRepairPriority,
  LongFormRepairQueueItem,
  LongFormTargetDurationClass,
  LongFormUiReviewPacket
} from "../types/long-form-readiness.js";
import type { LongFormTimelinePlan, LongFormTimelineSegment } from "../types/long-form-timeline.js";
import type { PostproductionAssetPlan } from "../types/postproduction-assets.js";
import type { ReferenceRole, ShotContract } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import type { VideoRenderStrategyPlan, VideoRenderWorkflowMode } from "../types/video-render-strategy.js";
import type { RenderSchedulePlan, RenderScheduleSequentialReason } from "./render-scheduler.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  LONG_FORM_READINESS_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_FORM_READINESS_SOURCE_PATTERN_IDS);

const HOOK_PATTERN = /hook|problem|pain|curious|secret|why|before|after|mistake|stop|watch|attention|opening/i;
const PAYOFF_PATTERN = /cta|payoff|result|resolution|transform|proof|final|offer|buy|try|learn|subscribe|share/i;
const CLAIM_RISK_PATTERN =
  /100%|guarantee|guaranteed|cure|heal|doctor|clinical|risk[-\s]?free|overnight|income|profit|#1|best\b/i;
const COMMERCIAL_PATTERN = /ad|ads|ugc|review|product|ecommerce|shop|sale|offer|customer|buyer|brand|conversion|cta/i;
const EDUCATION_PATTERN = /course|lesson|teach|training|tutorial|explainer|learn|education|class|workshop/i;
const DOCUMENTARY_PATTERN = /documentary|history|origin|case study|investigation|behind the scenes|interview/i;
const CINEMATIC_PATTERN = /cinematic|film|short film|trailer|story|narrative|movie|scene/i;
const SOCIAL_PLATFORM_PATTERN = /tiktok|douyin|reels|shorts|youtube|instagram|social|vertical/i;

const REFERENCE_LOCK_ROLES = new Set<ReferenceRole>([
  "identity",
  "product",
  "wardrobe",
  "environment",
  "motion",
  "camera",
  "style",
  "first_frame",
  "last_frame"
]);

const CHAINING_REASONS = new Set<RenderScheduleSequentialReason>([
  "endpoint_reference",
  "endpoint_continuity",
  "source_video_timeline",
  "transition_risk",
  "transition_intent",
  "strategy_last_frame_chaining",
  "strategy_source_video",
  "strategy_reference_lock",
  "strategy_sequence_bible"
]);

export class LongFormReadinessPlanner {
  public build(input: {
    readonly projectId: string;
    readonly userInput: string;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
    readonly continuityPlan: LongFormContinuityPlan;
    readonly agentReview: LongFormAgentReviewPlan;
    readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    readonly timelinePlan: LongFormTimelinePlan;
    readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
    readonly renderSchedulePlan: RenderSchedulePlan;
    readonly postproductionAssetPlan: PostproductionAssetPlan;
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
  }): LongFormReadinessPlan {
    const targetDurationSeconds = this.targetDurationSeconds(input.storyPlan, input.shots, input.timelinePlan);
    const intentRoute = this.intentRoute(input, targetDurationSeconds);
    const coherence = this.coherence(input, targetDurationSeconds);
    const repairQueue = this.repairQueue(input);
    const adaptiveShotDecisions = this.adaptiveShotDecisions(input, repairQueue);
    const status = this.status(input, coherence, repairQueue);
    const uiReviewPacket = this.uiReviewPacket(input, status, coherence, repairQueue, adaptiveShotDecisions);

    return {
      schemaVersion: "cinejelly.long-form-readiness.v1",
      projectId: input.projectId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      targetDurationSeconds,
      intentRoute,
      coherence,
      adaptiveShotDecisions,
      repairQueue,
      uiReviewPacket,
      releaseGateSummary: {
        canUseAsNoSpendReadinessEvidence: true,
        canProceedToRender: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: this.releaseBlocker(status, coherence, repairQueue)
      }
    };
  }

  private intentRoute(
    input: {
      readonly userInput: string;
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    targetDurationSeconds: number
  ): LongFormIntentRoute {
    const text = `${input.userInput} ${input.storyPlan.premise}`.toLowerCase();
    const hasSourceVideo = Boolean(input.sourceVideoAnalysis) ||
      input.shots.some((shot) => shot.references.some((reference) => reference.role === "source_video_structure")) ||
      input.videoRenderStrategyPlan.workflowMode === "source_video_guided";
    const hasReferenceLock = input.shots.some((shot) =>
      shot.references.some((reference) => REFERENCE_LOCK_ROLES.has(reference.role))
    );
    const intentKind = this.intentKind(text, hasSourceVideo, hasReferenceLock, targetDurationSeconds);
    const missingInputs = this.missingInputs(input, intentKind, hasSourceVideo, hasReferenceLock);
    const reasons = [
      `requested_mode:${input.videoRenderStrategyPlan.requestedMode}`,
      `workflow_mode:${input.videoRenderStrategyPlan.workflowMode}`,
      `target_duration_class:${this.targetDurationClass(targetDurationSeconds)}`,
      hasSourceVideo ? "source_video_or_structure_present" : undefined,
      hasReferenceLock ? "reference_lock_roles_present" : undefined,
      SOCIAL_PLATFORM_PATTERN.test(text) ? "social_platform_language_present" : undefined,
      COMMERCIAL_PATTERN.test(text) ? "commercial_language_present" : undefined
    ].filter((reason): reason is string => Boolean(reason));

    return {
      intentKind,
      platformIntent: input.creativeIntelligencePlan.nicheStrategy.platformIntent,
      targetDurationClass: this.targetDurationClass(targetDurationSeconds),
      userControlMode: input.videoRenderStrategyPlan.requestedMode,
      recommendedWorkflowMode: this.recommendedWorkflowMode(
        input.videoRenderStrategyPlan.workflowMode,
        intentKind,
        targetDurationSeconds,
        hasReferenceLock,
        hasSourceVideo
      ),
      reasons,
      missingInputs
    };
  }

  private coherence(
    input: {
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly agentReview: LongFormAgentReviewPlan;
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    targetDurationSeconds: number
  ): LongFormCoherenceScore {
    const storyArcScore = this.storyArcScore(input.storyPlan, input.shots, targetDurationSeconds);
    const sequenceBridgeScore = this.sequenceBridgeScore(input.continuityPlan);
    const anchorConsistencyScore = this.anchorConsistencyScore(input.continuityPlan);
    const hookPayoffScore = this.hookPayoffScore(input.creativeIntelligencePlan);
    const timelineFitScore = this.timelineFitScore(input.timelinePlan, targetDurationSeconds);
    const sourceVideoAlignmentScore = this.sourceVideoAlignmentScore(input);
    const issueCount = input.creativeIntelligencePlan.findingCount +
      input.timelinePlan.issueCount +
      input.videoRenderStrategyPlan.issueCount +
      input.agentReview.findingCount;
    const blockingIssueCount = input.creativeIntelligencePlan.blockingFindingCount +
      input.timelinePlan.blockingIssueCount +
      input.videoRenderStrategyPlan.blockingIssueCount +
      input.agentReview.blockingFindingCount;
    const reviewRequiredIssueCount = input.creativeIntelligencePlan.reviewRequiredFindingCount +
      input.timelinePlan.warningIssueCount +
      input.videoRenderStrategyPlan.warningIssueCount +
      input.agentReview.reviewRequiredFindingCount;
    const overallScore = roundScore(
      storyArcScore * 0.2 +
      sequenceBridgeScore * 0.15 +
      anchorConsistencyScore * 0.2 +
      hookPayoffScore * 0.2 +
      timelineFitScore * 0.15 +
      sourceVideoAlignmentScore * 0.1
    );

    return {
      overallScore,
      storyArcScore,
      sequenceBridgeScore,
      anchorConsistencyScore,
      hookPayoffScore,
      timelineFitScore,
      sourceVideoAlignmentScore,
      issueCount,
      blockingIssueCount,
      reviewRequiredIssueCount
    };
  }

  private adaptiveShotDecisions(
    input: {
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly renderSchedulePlan: RenderSchedulePlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
    },
    repairQueue: readonly LongFormRepairQueueItem[]
  ): readonly LongFormAdaptiveShotDecision[] {
    const scheduleByShotId = new Map(input.renderSchedulePlan.items.map((item) => [item.shotId, item]));
    const segmentByShotId = new Map(input.timelinePlan.segments.map((segment) => [segment.shotId, segment]));
    return input.shots.map((shot, index) => {
      const schedule = scheduleByShotId.get(shot.shotId);
      const segment = segmentByShotId.get(shot.shotId);
      const sequence = this.sequenceForShot(input.continuityPlan, shot.shotId);
      const relatedRepairs = repairQueue.filter((repair) => repair.affectedShotIds.includes(shot.shotId));
      const referenceRoles = new Set(shot.references.map((reference) => reference.role));
      const sourceGuided = referenceRoles.has("source_video_structure") ||
        input.videoRenderStrategyPlan.workflowMode === "source_video_guided" ||
        (segment?.sourceVideoSceneIds.length ?? 0) > 0;
      const referenceLocked = [...referenceRoles].some((role) => REFERENCE_LOCK_ROLES.has(role)) ||
        input.videoRenderStrategyPlan.requiresReferenceLock;
      const requiresManualReview = this.requiresManualShotReview(shot, segment, relatedRepairs, input.videoRenderStrategyPlan);
      const mode = this.shotMode({
        workflowMode: input.videoRenderStrategyPlan.workflowMode,
        shotCount: input.shots.length,
        sourceGuided,
        referenceLocked,
        requiresManualReview
      });
      const sequentialReasons = schedule?.sequentialReasons ?? [];
      const shouldChainFromPrevious = index > 0 && (
        input.videoRenderStrategyPlan.lastFrameChaining.status === "required" ||
        input.videoRenderStrategyPlan.lastFrameChaining.status === "recommended" ||
        sequentialReasons.some((reason) => CHAINING_REASONS.has(reason))
      );
      const repairHints = this.repairHintsForShot(input.creativeIntelligencePlan, relatedRepairs, shot.shotId);
      const reasons = this.shotDecisionReasons(
        mode,
        shot,
        sourceGuided,
        referenceLocked,
        requiresManualReview,
        shouldChainFromPrevious,
        sequentialReasons
      );
      const decisionBase = {
        shotId: shot.shotId,
        order: index,
        mode,
        renderMode: schedule?.mode ?? "parallel",
        shouldRunTestTake: this.shouldRunTestTake(shot, mode, repairHints),
        shouldChainFromPrevious,
        requiresReferenceLock: referenceLocked,
        requiresManualReview,
        reasons,
        repairHints
      };
      return {
        ...decisionBase,
        ...(sequence ? { sequenceId: sequence.sequenceId } : {})
      };
    });
  }

  private repairQueue(input: {
    readonly projectId: string;
    readonly agentReview: LongFormAgentReviewPlan;
    readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    readonly timelinePlan: LongFormTimelinePlan;
    readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
  }): readonly LongFormRepairQueueItem[] {
    const items: LongFormRepairQueueItem[] = [];
    for (const directive of input.creativeIntelligencePlan.repairDirectives) {
      const blocksRender = directive.priority === "critical" ||
        directive.triggerCodes.some((code) => code === "timeline_blocked" || code === "agent_review_blocked" || code === "render_strategy_blocked");
      items.push({
        repairId: directive.repairId,
        category: this.categoryForCreativeScope(directive.scope),
        priority: directive.priority,
        autoRepairable: directive.canAutoRepairBeforeRender && !directive.requiresManualReview,
        blocksRender,
        affectedSequenceIds: directive.affectedSequenceIds,
        affectedShotIds: directive.affectedShotIds,
        trigger: directive.triggerCodes.join(","),
        action: directive.action,
        uiLabel: this.uiLabelForRepair(this.categoryForCreativeScope(directive.scope), directive.priority, directive.action)
      });
    }
    for (const issue of input.timelinePlan.issues) {
      items.push({
        repairId: createStableId("long_readiness_repair", `${input.projectId}:timeline:${issue.issueId}`),
        category: issue.code.includes("audio") ? "audio_caption" : "timeline",
        priority: this.priorityForSeverity(issue.severity),
        autoRepairable: issue.severity !== "block",
        blocksRender: issue.severity === "block",
        affectedSequenceIds: issue.affectedSequenceIds,
        affectedShotIds: issue.affectedShotIds,
        trigger: issue.code,
        action: issue.repair,
        uiLabel: this.uiLabelForRepair(issue.code.includes("audio") ? "audio_caption" : "timeline", this.priorityForSeverity(issue.severity), issue.repair)
      });
    }
    for (const issue of input.videoRenderStrategyPlan.issues) {
      items.push({
        repairId: createStableId("long_readiness_repair", `${input.projectId}:strategy:${issue.code}`),
        category: "shot_strategy",
        priority: this.priorityForSeverity(issue.severity),
        autoRepairable: issue.severity !== "block",
        blocksRender: issue.severity === "block",
        affectedSequenceIds: [],
        affectedShotIds: [],
        trigger: issue.code,
        action: issue.repair,
        uiLabel: this.uiLabelForRepair("shot_strategy", this.priorityForSeverity(issue.severity), issue.repair)
      });
    }
    for (const finding of input.agentReview.findings) {
      items.push({
        repairId: createStableId("long_readiness_repair", `${input.projectId}:agent:${finding.findingId}`),
        category: this.categoryForAgentRole(finding.role),
        priority: this.priorityForSeverity(finding.severity),
        autoRepairable: finding.severity !== "block",
        blocksRender: finding.severity === "block",
        affectedSequenceIds: finding.affectedSequenceIds,
        affectedShotIds: finding.affectedShotIds,
        trigger: finding.code,
        action: finding.repairDirective,
        uiLabel: this.uiLabelForRepair(this.categoryForAgentRole(finding.role), this.priorityForSeverity(finding.severity), finding.repairDirective)
      });
    }
    return [...this.dedupeRepairs(items)].sort((left, right) =>
      priorityRank(right.priority) - priorityRank(left.priority) ||
      Number(right.blocksRender) - Number(left.blocksRender) ||
      left.repairId.localeCompare(right.repairId)
    );
  }

  private uiReviewPacket(
    input: {
      readonly storyPlan: StoryPlan;
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
      readonly postproductionAssetPlan: PostproductionAssetPlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    status: LongFormReadinessStatus,
    coherence: LongFormCoherenceScore,
    repairQueue: readonly LongFormRepairQueueItem[],
    adaptiveShotDecisions: readonly LongFormAdaptiveShotDecision[]
  ): LongFormUiReviewPacket {
    const requiredApprovalSurfaces = this.requiredApprovalSurfaces(input, coherence, repairQueue, adaptiveShotDecisions);
    const claimReviewCount = input.creativeIntelligencePlan.findings.filter((finding) =>
      finding.code === "unsupported_claim_risk" ||
      CLAIM_RISK_PATTERN.test(finding.message) ||
      CLAIM_RISK_PATTERN.test(finding.repair)
    ).length;
    const nextActions = this.nextActions(status, requiredApprovalSurfaces, repairQueue);
    return {
      canRenderAfterApproval: status !== "blocked",
      requiredApprovalSurfaces,
      sceneReviewCount: input.storyPlan.scenes.length,
      shotReviewCount: adaptiveShotDecisions.filter((decision) => decision.requiresManualReview).length,
      audioReviewCount: input.postproductionAssetPlan.generatedAudio.intentCount,
      captionReviewCount: input.postproductionAssetPlan.caption.cueCount,
      claimReviewCount,
      repairQueueCount: repairQueue.length,
      operatorSummary: this.operatorSummary(status, coherence, repairQueue, input.videoRenderStrategyPlan.workflowMode),
      nextActions
    };
  }

  private requiredApprovalSurfaces(
    input: {
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
      readonly postproductionAssetPlan: PostproductionAssetPlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    coherence: LongFormCoherenceScore,
    repairQueue: readonly LongFormRepairQueueItem[],
    adaptiveShotDecisions: readonly LongFormAdaptiveShotDecision[]
  ): readonly string[] {
    const surfaces = new Set<string>();
    if (coherence.storyArcScore < 80 || coherence.hookPayoffScore < 80) {
      surfaces.add("story_arc");
    }
    if (input.videoRenderStrategyPlan.storyboardRequired || adaptiveShotDecisions.length > 1) {
      surfaces.add("storyboard");
    }
    if (adaptiveShotDecisions.some((decision) => decision.requiresManualReview)) {
      surfaces.add("shot_strategy");
    }
    if (input.sourceVideoAnalysis || input.videoRenderStrategyPlan.workflowMode === "source_video_guided") {
      surfaces.add("source_video");
    }
    if (input.postproductionAssetPlan.generatedAudio.intentCount > 0 || input.postproductionAssetPlan.generatedAudio.blockedIntentCount > 0) {
      surfaces.add("audio");
    }
    if (input.postproductionAssetPlan.caption.cueCount > 0 || input.creativeIntelligencePlan.audioCaptionQuality.captionCoverageRatio < 0.95) {
      surfaces.add("caption");
    }
    if (
      input.creativeIntelligencePlan.findings.some((finding) => finding.code === "unsupported_claim_risk") ||
      repairQueue.some((repair) => repair.category === "review" && /claim|risk|compliance/i.test(repair.action))
    ) {
      surfaces.add("claims");
    }
    if (repairQueue.length > 0) {
      surfaces.add("repair_queue");
    }
    if (input.videoRenderStrategyPlan.requiresStoryboardApproval) {
      surfaces.add("customer_storyboard_approval");
    }
    if (input.timelinePlan.manualReviewSegmentCount > 0) {
      surfaces.add("timeline");
    }
    return [...surfaces].sort();
  }

  private status(
    input: {
      readonly agentReview: LongFormAgentReviewPlan;
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
    },
    coherence: LongFormCoherenceScore,
    repairQueue: readonly LongFormRepairQueueItem[]
  ): LongFormReadinessStatus {
    if (
      coherence.blockingIssueCount > 0 ||
      repairQueue.some((repair) => repair.blocksRender) ||
      input.agentReview.status === "blocked" ||
      input.videoRenderStrategyPlan.blockingIssueCount > 0 ||
      input.timelinePlan.blockingIssueCount > 0 ||
      input.creativeIntelligencePlan.status === "blocked"
    ) {
      return "blocked";
    }
    if (
      coherence.overallScore < 78 ||
      coherence.reviewRequiredIssueCount > 0 ||
      repairQueue.length > 0 ||
      input.timelinePlan.manualReviewSegmentCount > 0 ||
      input.creativeIntelligencePlan.status === "review_required" ||
      input.agentReview.status === "review_required" ||
      input.videoRenderStrategyPlan.warningIssueCount > 0
    ) {
      return "review_required";
    }
    return "ready";
  }

  private intentKind(
    text: string,
    hasSourceVideo: boolean,
    hasReferenceLock: boolean,
    targetDurationSeconds: number
  ): LongFormIntentKind {
    if (hasSourceVideo) {
      return "source_video_guided";
    }
    if (COMMERCIAL_PATTERN.test(text) && hasReferenceLock) {
      return "reference_product_story";
    }
    if (COMMERCIAL_PATTERN.test(text)) {
      return "commercial_ad";
    }
    if (EDUCATION_PATTERN.test(text)) {
      return "education_training";
    }
    if (DOCUMENTARY_PATTERN.test(text)) {
      return "documentary";
    }
    if (CINEMATIC_PATTERN.test(text)) {
      return "cinematic_story";
    }
    if (targetDurationSeconds <= 90) {
      return "short_story";
    }
    if (targetDurationSeconds > 90) {
      return "long_explainer";
    }
    return "general_long_form";
  }

  private recommendedWorkflowMode(
    currentWorkflowMode: VideoRenderWorkflowMode,
    intentKind: LongFormIntentKind,
    targetDurationSeconds: number,
    hasReferenceLock: boolean,
    hasSourceVideo: boolean
  ): VideoRenderWorkflowMode {
    if (hasSourceVideo || intentKind === "source_video_guided") {
      return "source_video_guided";
    }
    if (currentWorkflowMode === "sequence_bible") {
      return "sequence_bible";
    }
    if (targetDurationSeconds <= 20 && !hasReferenceLock) {
      return "single_clip";
    }
    if (targetDurationSeconds <= 20 && hasReferenceLock) {
      return "reference_locked_single_clip";
    }
    if (hasReferenceLock || intentKind === "reference_product_story" || intentKind === "commercial_ad") {
      return "reference_locked_multishot";
    }
    if (currentWorkflowMode === "manual_storyboard") {
      return "manual_storyboard";
    }
    return "storyboard_multishot";
  }

  private missingInputs(
    input: {
      readonly userInput: string;
      readonly shots: readonly ShotContract[];
      readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    },
    intentKind: LongFormIntentKind,
    hasSourceVideo: boolean,
    hasReferenceLock: boolean
  ): readonly string[] {
    const missing = new Set<string>();
    if (input.userInput.trim().length < 24) {
      missing.add("clear_niche_audience_platform_goal");
    }
    if ((intentKind === "source_video_guided" || input.videoRenderStrategyPlan.requestedMode === "source_video") && !hasSourceVideo) {
      missing.add("source_video_analysis_or_source_video_reference");
    }
    if ((intentKind === "reference_product_story" || input.videoRenderStrategyPlan.requestedMode === "reference_locked") && !hasReferenceLock) {
      missing.add("identity_product_environment_or_style_reference");
    }
    if (input.shots.length > 1 && input.videoRenderStrategyPlan.requiresStoryboardApproval) {
      missing.add("storyboard_approval_metadata");
    }
    return [...missing].sort();
  }

  private targetDurationClass(targetDurationSeconds: number): LongFormTargetDurationClass {
    if (targetDurationSeconds < 45) {
      return "under_45_seconds";
    }
    if (targetDurationSeconds <= 90) {
      return "short_45_90_seconds";
    }
    if (targetDurationSeconds <= 180) {
      return "medium_90_180_seconds";
    }
    if (targetDurationSeconds <= 480) {
      return "long_3_8_minutes";
    }
    return "extended_over_8_minutes";
  }

  private storyArcScore(storyPlan: StoryPlan, shots: readonly ShotContract[], targetDurationSeconds: number): number {
    if (storyPlan.scenes.length === 0 || shots.length === 0) {
      return 0;
    }
    let score = 100;
    const firstShot = shots[0];
    const lastShot = shots[shots.length - 1];
    const firstText = `${firstShot?.intent ?? ""} ${firstShot?.action ?? ""}`;
    const lastText = `${lastShot?.intent ?? ""} ${lastShot?.action ?? ""}`;
    if (firstShot && !HOOK_PATTERN.test(firstText)) {
      score -= 24;
    }
    if (lastShot && !PAYOFF_PATTERN.test(lastText)) {
      score -= 20;
    }
    if (targetDurationSeconds > 45 && storyPlan.scenes.length < 2) {
      score -= 20;
    }
    if (targetDurationSeconds > 90 && storyPlan.scenes.length < 3) {
      score -= 15;
    }
    return clampScore(score);
  }

  private sequenceBridgeScore(continuityPlan: LongFormContinuityPlan): number {
    if (continuityPlan.sequenceCount <= 1) {
      return 100;
    }
    const expectedBridgeCount = Math.max(1, continuityPlan.sequenceCount - 1);
    const ratio = continuityPlan.bridgeCount / expectedBridgeCount;
    const bridgeAnchorPenalty = continuityPlan.sequences.filter((sequence) =>
      sequence.bridgeToNext && sequence.bridgeToNext.requiredAnchors.length === 0
    ).length * 10;
    return clampScore(ratio * 100 - bridgeAnchorPenalty);
  }

  private anchorConsistencyScore(continuityPlan: LongFormContinuityPlan): number {
    const anchors = continuityPlan.globalAnchors;
    const presentCount = [
      anchors.identity.length,
      anchors.product.length,
      anchors.environment.length,
      anchors.style.length
    ].filter((count) => count > 0).length;
    const base = presentCount * 25;
    const highRiskPenalty = Math.min(25, continuityPlan.highRiskSequenceCount * 8);
    return clampScore(base - highRiskPenalty);
  }

  private hookPayoffScore(plan: LongFormCreativeIntelligencePlan): number {
    let score = 100;
    for (const finding of plan.findings) {
      if (finding.code === "weak_opening_hook") {
        score -= 35;
      }
      if (finding.code === "weak_payoff_or_cta") {
        score -= 30;
      }
      if (finding.code === "generic_niche_or_audience") {
        score -= 15;
      }
    }
    return clampScore(score);
  }

  private timelineFitScore(timelinePlan: LongFormTimelinePlan, targetDurationSeconds: number): number {
    if (timelinePlan.segmentCount === 0 || targetDurationSeconds <= 0) {
      return 0;
    }
    const driftRatio = Math.abs(timelinePlan.plannedDurationSeconds - targetDurationSeconds) / targetDurationSeconds;
    const driftPenalty = Math.min(45, driftRatio * 100);
    const warningPenalty = Math.min(30, timelinePlan.warningIssueCount * 8);
    const blockingPenalty = Math.min(60, timelinePlan.blockingIssueCount * 30);
    return clampScore(100 - driftPenalty - warningPenalty - blockingPenalty);
  }

  private sourceVideoAlignmentScore(input: {
    readonly continuityPlan: LongFormContinuityPlan;
    readonly timelinePlan: LongFormTimelinePlan;
    readonly creativeIntelligencePlan: LongFormCreativeIntelligencePlan;
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
  }): number {
    const hasSourceVideo = Boolean(input.sourceVideoAnalysis) ||
      input.continuityPlan.sourceVideoAnchorCount > 0 ||
      input.timelinePlan.segments.some((segment) => segment.sourceVideoSceneIds.length > 0);
    if (!hasSourceVideo) {
      return 100;
    }
    let score = 100;
    if (input.continuityPlan.sourceVideoAnchorCount === 0) {
      score -= 25;
    }
    if (!input.timelinePlan.segments.some((segment) => segment.sourceVideoSceneIds.length > 0)) {
      score -= 25;
    }
    if (input.creativeIntelligencePlan.findings.some((finding) => finding.code === "source_video_alignment_gap")) {
      score -= 30;
    }
    return clampScore(score);
  }

  private shotMode(input: {
    readonly workflowMode: VideoRenderWorkflowMode;
    readonly shotCount: number;
    readonly sourceGuided: boolean;
    readonly referenceLocked: boolean;
    readonly requiresManualReview: boolean;
  }): LongFormRenderUnitMode {
    if (input.requiresManualReview || input.workflowMode === "manual_storyboard") {
      return "manual_review_required";
    }
    if (input.sourceGuided || input.workflowMode === "source_video_guided") {
      return "source_video_guided";
    }
    if (input.workflowMode === "sequence_bible") {
      return "sequence_bible";
    }
    if (input.referenceLocked || input.workflowMode === "reference_locked_multishot" || input.workflowMode === "reference_locked_single_clip") {
      return "reference_locked";
    }
    if (input.shotCount <= 1 || input.workflowMode === "single_clip") {
      return "single_clip";
    }
    return "storyboard_multishot";
  }

  private requiresManualShotReview(
    shot: ShotContract,
    segment: LongFormTimelineSegment | undefined,
    relatedRepairs: readonly LongFormRepairQueueItem[],
    strategy: VideoRenderStrategyPlan
  ): boolean {
    return Boolean(segment?.requiresManualReview) ||
      strategy.workflowMode === "manual_storyboard" ||
      relatedRepairs.some((repair) => !repair.autoRepairable || repair.blocksRender) ||
      shot.risks.some((risk) => risk === "face" || risk === "product_logo" || risk === "text" || risk === "audio_sync") ||
      CLAIM_RISK_PATTERN.test(`${shot.intent} ${shot.subject} ${shot.action}`);
  }

  private shouldRunTestTake(
    shot: ShotContract,
    mode: LongFormRenderUnitMode,
    repairHints: readonly string[]
  ): boolean {
    return shot.durationSeconds > 10 ||
      shot.risks.length > 0 ||
      repairHints.length > 0 ||
      mode === "source_video_guided" ||
      mode === "sequence_bible" ||
      mode === "reference_locked" ||
      mode === "manual_review_required";
  }

  private shotDecisionReasons(
    mode: LongFormRenderUnitMode,
    shot: ShotContract,
    sourceGuided: boolean,
    referenceLocked: boolean,
    requiresManualReview: boolean,
    shouldChainFromPrevious: boolean,
    sequentialReasons: readonly RenderScheduleSequentialReason[]
  ): readonly string[] {
    return [
      `mode:${mode}`,
      sourceGuided ? "source_video_structure_or_source_workflow" : undefined,
      referenceLocked ? "reference_lock_roles_present" : undefined,
      requiresManualReview ? "manual_review_needed_for_risk_or_repair" : undefined,
      shouldChainFromPrevious ? "chain_from_previous_for_continuity" : undefined,
      shot.risks.length > 0 ? `risk:${shot.risks.join(",")}` : undefined,
      sequentialReasons.length > 0 ? `sequential:${sequentialReasons.join(",")}` : undefined
    ].filter((reason): reason is string => Boolean(reason));
  }

  private repairHintsForShot(
    plan: LongFormCreativeIntelligencePlan,
    relatedRepairs: readonly LongFormRepairQueueItem[],
    shotId: string
  ): readonly string[] {
    const hints = new Set<string>();
    for (const directive of plan.repairDirectives) {
      if (directive.affectedShotIds.includes(shotId)) {
        hints.add(directive.action);
      }
    }
    for (const repair of relatedRepairs) {
      hints.add(repair.action);
    }
    return [...hints].slice(0, 6);
  }

  private categoryForCreativeScope(scope: string): LongFormRepairCategory {
    switch (scope) {
      case "story":
      case "sequence":
        return "story";
      case "shot":
      case "prompt":
        return "shot_strategy";
      case "postproduction":
        return "audio_caption";
      case "timeline":
        return "timeline";
      default:
        return "coherence";
    }
  }

  private categoryForAgentRole(role: string): LongFormRepairCategory {
    switch (role) {
      case "script_architect":
        return "story";
      case "continuity_supervisor":
        return "coherence";
      case "source_video_reviewer":
        return "source_video";
      case "render_orchestrator":
        return "shot_strategy";
      case "commercial_risk_reviewer":
        return "review";
      default:
        return "review";
    }
  }

  private priorityForSeverity(severity: string): LongFormRepairPriority {
    switch (severity) {
      case "block":
        return "critical";
      case "warn":
        return "high";
      case "info":
        return "low";
      default:
        return "medium";
    }
  }

  private dedupeRepairs(items: readonly LongFormRepairQueueItem[]): readonly LongFormRepairQueueItem[] {
    const seen = new Set<string>();
    const result: LongFormRepairQueueItem[] = [];
    for (const item of items) {
      const key = [
        item.category,
        item.priority,
        item.blocksRender,
        item.affectedSequenceIds.join(","),
        item.affectedShotIds.join(","),
        item.trigger,
        item.action
      ].join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  private uiLabelForRepair(category: LongFormRepairCategory, priority: LongFormRepairPriority, action: string): string {
    const label = action.length > 90 ? `${action.slice(0, 87).trim()}...` : action;
    return `${priority}:${category}:${label}`;
  }

  private nextActions(
    status: LongFormReadinessStatus,
    requiredApprovalSurfaces: readonly string[],
    repairQueue: readonly LongFormRepairQueueItem[]
  ): readonly string[] {
    if (status === "ready") {
      return ["Proceed to provider render, then require media inspection and customer release review."];
    }
    const actions = new Set<string>();
    for (const repair of repairQueue.slice(0, 8)) {
      actions.add(repair.action);
    }
    if (requiredApprovalSurfaces.length > 0) {
      actions.add(`Review approval surfaces before render/export: ${requiredApprovalSurfaces.join(", ")}.`);
    }
    if (status === "blocked") {
      actions.add("Resolve blocking readiness repairs before provider spend.");
    }
    return [...actions];
  }

  private operatorSummary(
    status: LongFormReadinessStatus,
    coherence: LongFormCoherenceScore,
    repairQueue: readonly LongFormRepairQueueItem[],
    workflowMode: VideoRenderWorkflowMode
  ): string {
    return `Long readiness is ${status} for ${workflowMode}; coherence=${coherence.overallScore}, repairs=${repairQueue.length}, blockingRepairs=${repairQueue.filter((repair) => repair.blocksRender).length}.`;
  }

  private releaseBlocker(
    status: LongFormReadinessStatus,
    coherence: LongFormCoherenceScore,
    repairQueue: readonly LongFormRepairQueueItem[]
  ): string {
    if (status === "blocked") {
      return "Long-form readiness found blocking intent, coherence, timeline, source-video, or strategy repairs before provider spend.";
    }
    if (status === "review_required") {
      return `Long-form readiness can proceed to render, but coherence=${coherence.overallScore} and repairQueue=${repairQueue.length} require operator/customer review before release.`;
    }
    return "Long-form readiness passed no-spend intent/coherence/shot-strategy checks; customer release still depends on rendered media review.";
  }

  private targetDurationSeconds(
    storyPlan: StoryPlan,
    shots: readonly ShotContract[],
    timelinePlan: LongFormTimelinePlan
  ): number {
    if (Number.isFinite(storyPlan.targetDurationSeconds) && storyPlan.targetDurationSeconds > 0) {
      return storyPlan.targetDurationSeconds;
    }
    if (Number.isFinite(timelinePlan.targetDurationSeconds) && timelinePlan.targetDurationSeconds > 0) {
      return timelinePlan.targetDurationSeconds;
    }
    return shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  }

  private sequenceForShot(continuityPlan: LongFormContinuityPlan, shotId: string): LongFormContinuitySequence | undefined {
    return continuityPlan.sequences.find((sequence) => sequence.shotIds.includes(shotId));
  }
}

function clampScore(value: number): number {
  return roundScore(Math.max(0, Math.min(100, value)));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function priorityRank(priority: LongFormRepairPriority): number {
  switch (priority) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}
