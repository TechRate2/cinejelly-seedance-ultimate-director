/**
 * Deterministic long-form timeline planner.
 * It translates continuity, agentic-video timing, and batch-output ideas into CineJelly-owned evidence.
 */

import { VOICEOVER_WORDS_PER_SECOND } from "./duration-scripting.js";
import type { GeneratedAudioIntent } from "../types/audio.js";
import type { CaptionCue } from "../types/caption.js";
import type { LongFormContinuityPlan, LongFormContinuitySequence } from "../types/long-form-continuity.js";
import type {
  LongFormTimelineAudioScriptLine,
  LongFormTimelineAudioCoverage,
  LongFormTimelineCaptionCoverage,
  LongFormTimelineIssue,
  LongFormTimelineIssueCode,
  LongFormTimelineIssueSeverity,
  LongFormTimelinePlan,
  LongFormTimelineProductionAct,
  LongFormTimelineProviderSettingPolicy,
  LongFormTimelineSegment,
  LongFormTimelineSegmentProductionContract,
  LongFormTimelineSequence
} from "../types/long-form-timeline.js";
import type { PostproductionAssetPlan } from "../types/postproduction-assets.js";
import type { ContinuityRisk, ShotContract } from "../types/prompt.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import type { RenderSchedulePlan, RenderSchedulePlanItem } from "./render-scheduler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  LONG_FORM_TIMELINE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_FORM_TIMELINE_SOURCE_PATTERN_IDS);

export class LongFormTimelinePlanner {
  public build(input: {
    readonly projectId: string;
    readonly targetDurationSeconds: number;
    readonly shots: readonly ShotContract[];
    readonly continuityPlan: LongFormContinuityPlan;
    readonly renderSchedulePlan: RenderSchedulePlan;
    readonly postproductionAssetPlan: PostproductionAssetPlan;
    readonly captionCues?: readonly CaptionCue[];
    readonly generatedAudioIntents?: readonly GeneratedAudioIntent[];
    readonly seedanceSettings?: FlexibleSeedanceSettings;
  }): LongFormTimelinePlan {
    const scheduleByShotId = new Map(
      input.renderSchedulePlan.items.map((item) => [item.shotId, item])
    );
    const seedanceSettings = input.seedanceSettings ?? DEFAULT_SEEDANCE_SETTINGS;
    const providerSettingPolicy = this.providerSettingPolicy(seedanceSettings);
    const timelineSegments = this.segments({ ...input, providerSettingPolicy }, scheduleByShotId);
    const audioScript = this.audioScript(timelineSegments);
    const timelineSequences = this.sequences(input.continuityPlan, timelineSegments);
    const issues = this.issues({
      ...input,
      segments: timelineSegments,
      sequences: timelineSequences,
      scheduleByShotId
    });
    const plannedDurationSeconds = roundSeconds(
      timelineSegments.reduce((maxEnd, segment) => Math.max(maxEnd, segment.endSecond), 0)
    );
    const captionCoveredSeconds = roundSeconds(
      timelineSegments.reduce((sum, segment) => sum + segment.captionCoverage.coveredSeconds, 0)
    );
    const blockingIssueCount = issues.filter((issue) => issue.severity === "block").length;
    const warningIssueCount = issues.filter((issue) => issue.severity === "warn").length;

    return {
      schemaVersion: "cinejelly.long-form-timeline.v1",
      projectId: input.projectId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      targetDurationSeconds: input.targetDurationSeconds,
      plannedDurationSeconds,
      sequenceCount: timelineSequences.length,
      segmentCount: timelineSegments.length,
      shotCount: input.shots.length,
      transitionCount: timelineSegments.filter((segment) => segment.transitionIntent).length,
      sequentialSegmentCount: timelineSegments.filter((segment) => segment.renderMode === "sequential").length,
      manualReviewSegmentCount: timelineSegments.filter((segment) => segment.requiresManualReview).length,
      captionCueCount: input.postproductionAssetPlan.caption.cueCount,
      audioEventCount: input.postproductionAssetPlan.audio.trackCount,
      generatedAudioEventCount: input.postproductionAssetPlan.generatedAudio.intentCount,
      audioScriptLineCount: audioScript.length,
      providerSettingPolicy,
      issueCount: issues.length,
      blockingIssueCount,
      warningIssueCount,
      sequences: timelineSequences,
      segments: timelineSegments,
      audioScript,
      postproduction: {
        captionCueCount: input.postproductionAssetPlan.caption.cueCount,
        captionCoveredSeconds,
        audioTrackCount: input.postproductionAssetPlan.audio.trackCount,
        generatedAudioIntentCount: input.postproductionAssetPlan.generatedAudio.intentCount,
        generatedAudioReadyIntentCount: input.postproductionAssetPlan.generatedAudio.readyIntentCount,
        generatedAudioBlockedIntentCount: input.postproductionAssetPlan.generatedAudio.blockedIntentCount
      },
      issues,
      releaseGateSummary: {
        canUseAsNoSpendTimelineEvidence: blockingIssueCount === 0,
        canProceedToRender: blockingIssueCount === 0,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: blockingIssueCount > 0
          ? "Long-form timeline has blocking orchestration issues before render."
          : "Long-form timeline is no-spend orchestration evidence only; paid render, media inspection, manual review, deployment, and commercial approval remain separate gates."
      }
    };
  }

  private segments(
    input: {
      readonly projectId: string;
      readonly targetDurationSeconds: number;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly postproductionAssetPlan: PostproductionAssetPlan;
      readonly captionCues?: readonly CaptionCue[];
      readonly generatedAudioIntents?: readonly GeneratedAudioIntent[];
      readonly providerSettingPolicy: LongFormTimelineProviderSettingPolicy;
    },
    scheduleByShotId: ReadonlyMap<string, RenderSchedulePlanItem>
  ): readonly LongFormTimelineSegment[] {
    let cursor = 0;
    return input.shots.map((shot, index) => {
      const sequence = this.sequenceForShot(input.continuityPlan, shot);
      const startSecond = roundSeconds(cursor);
      const durationSeconds = roundSeconds(Math.max(0, shot.durationSeconds));
      const endSecond = roundSeconds(startSecond + durationSeconds);
      cursor = endSecond;
      const storyArcRole = this.storyArcRoleForSegment(shot, startSecond, endSecond, input.targetDurationSeconds);
      const storyArcPosition = this.storyArcPositionForSegment(shot, startSecond, endSecond, input.targetDurationSeconds);
      const schedule = scheduleByShotId.get(shot.shotId);
      const captionCoverage = this.captionCoverage(input.captionCues ?? [], startSecond, endSecond);
      const audioCoverage = this.audioCoverage(input.postproductionAssetPlan, input.generatedAudioIntents ?? [], startSecond, endSecond);
      const audioScriptLineId = createStableId("timeline_audio_line", `${input.projectId}:${shot.shotId}:${startSecond}:${endSecond}`);
      const sourceVideoSceneIds = uniqueStrings([
        ...(sequence?.anchors.sourceVideoSceneIds ?? []),
        ...shot.references
          .filter((reference) => reference.role === "source_video_structure")
          .map((reference) => reference.selection?.sourceSceneId)
      ]);
      const riskCodes = uniqueStrings(shot.risks) as ContinuityRisk[];
      const sequentialReasons = schedule?.sequentialReasons ?? [];
      const productionContract = this.productionContract({
        shot,
        sequence,
        startSecond,
        endSecond,
        durationSeconds,
        storyArcRole,
        storyArcPosition,
        audioCoverage,
        audioScriptLineId,
        providerSettingPolicy: input.providerSettingPolicy
      });
      return {
        segmentId: createStableId("timeline_segment", `${input.projectId}:${shot.shotId}:${index}`),
        sequenceId: sequence?.sequenceId ?? "unsequenced",
        sequenceOrder: sequence?.order ?? -1,
        order: index,
        shotId: shot.shotId,
        ...(shot.sceneId ? { sceneId: shot.sceneId } : {}),
        ...(shot.beatId ? { beatId: shot.beatId } : {}),
        startSecond,
        endSecond,
        durationSeconds,
        storyArcRole,
        storyArcPosition,
        storyArcContract: this.storyArcContract(storyArcRole, storyArcPosition, startSecond, endSecond, input.targetDurationSeconds),
        intent: shot.intent,
        subject: shot.subject,
        action: shot.action,
        camera: shot.camera,
        lighting: shot.lighting,
        ...(shot.audioIntent ? { audioIntent: shot.audioIntent } : {}),
        ...(shot.transitionIntent ? { transitionIntent: shot.transitionIntent } : {}),
        ...(schedule?.batchId ? { renderBatchId: schedule.batchId } : {}),
        renderMode: schedule?.mode ?? "sequential",
        sequentialReasons,
        referenceRoles: schedule?.referenceRoles ?? uniqueStrings(shot.references.map((reference) => reference.role)),
        riskCodes,
        continuityFields: schedule?.continuityFields ?? this.continuityFields(shot),
        sourceVideoSceneIds,
        captionCoverage,
        audioCoverage,
        productionContract,
        audioScriptLineId,
        requiresManualReview: riskCodes.length > 0 ||
          sequentialReasons.length > 0 ||
          sourceVideoSceneIds.length > 0 ||
          Boolean(shot.transitionIntent)
      };
    });
  }

  private sequences(
    continuityPlan: LongFormContinuityPlan,
    segments: readonly LongFormTimelineSegment[]
  ): readonly LongFormTimelineSequence[] {
    return continuityPlan.sequences.map((sequence) => {
      const sequenceSegments = segments.filter((segment) => segment.sequenceId === sequence.sequenceId);
      const startSecond = roundSeconds(
        sequenceSegments.reduce((minStart, segment) => Math.min(minStart, segment.startSecond), Number.POSITIVE_INFINITY)
      );
      const endSecond = roundSeconds(
        sequenceSegments.reduce((maxEnd, segment) => Math.max(maxEnd, segment.endSecond), 0)
      );
      return {
        sequenceId: sequence.sequenceId,
        title: sequence.title,
        purpose: sequence.purpose,
        order: sequence.order,
        startSecond: Number.isFinite(startSecond) ? startSecond : 0,
        endSecond,
        durationSeconds: roundSeconds(Math.max(0, endSecond - (Number.isFinite(startSecond) ? startSecond : 0))),
        targetDurationSeconds: sequence.targetDurationSeconds,
        segmentIds: sequenceSegments.map((segment) => segment.segmentId),
        shotIds: sequence.shotIds,
        riskCodes: sequence.riskCodes,
        sourceVideoSceneIds: sequence.anchors.sourceVideoSceneIds,
        renderModeRecommendation: sequence.renderModeRecommendation,
        ...(sequence.bridgeToNext?.nextSequenceId ? { bridgeToNextSequenceId: sequence.bridgeToNext.nextSequenceId } : {}),
        ...(sequence.bridgeToNext?.bridgeIntent ? { bridgeIntent: sequence.bridgeToNext.bridgeIntent } : {}),
        requiredBridgeAnchors: sequence.bridgeToNext?.requiredAnchors ?? []
      };
    });
  }

  private issues(input: {
    readonly projectId: string;
    readonly targetDurationSeconds: number;
    readonly shots: readonly ShotContract[];
    readonly continuityPlan: LongFormContinuityPlan;
    readonly postproductionAssetPlan: PostproductionAssetPlan;
    readonly captionCues?: readonly CaptionCue[];
    readonly generatedAudioIntents?: readonly GeneratedAudioIntent[];
    readonly segments: readonly LongFormTimelineSegment[];
    readonly sequences: readonly LongFormTimelineSequence[];
    readonly scheduleByShotId: ReadonlyMap<string, RenderSchedulePlanItem>;
  }): readonly LongFormTimelineIssue[] {
    const issues: LongFormTimelineIssue[] = [];
    const plannedDurationSeconds = input.segments.reduce((maxEnd, segment) => Math.max(maxEnd, segment.endSecond), 0);
    const durationDelta = roundSeconds(Math.abs(plannedDurationSeconds - input.targetDurationSeconds));
    const allowedDelta = Math.max(3, input.targetDurationSeconds * 0.05);
    if (durationDelta > allowedDelta) {
      issues.push(issue(
        input.projectId,
        "warn",
        "duration_drift",
        "Planned shot timeline drifts from requested long-form duration.",
        "Rebalance shot durations before paid long-form validation.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.shots.map((shot) => shot.shotId),
        { plannedDurationSeconds, targetDurationSeconds: input.targetDurationSeconds, durationDelta }
      ));
    }

    for (const sequence of input.sequences) {
      const sequenceDelta = roundSeconds(Math.abs(sequence.durationSeconds - sequence.targetDurationSeconds));
      if (sequence.targetDurationSeconds > 0 && sequenceDelta / sequence.targetDurationSeconds > 0.2) {
        issues.push(issue(
          input.projectId,
          "warn",
          "sequence_duration_drift",
          "A sequence timeline duration drifts from its target duration.",
          "Redistribute shot durations inside the affected sequence.",
          [sequence.sequenceId],
          sequence.shotIds,
          {
            targetDurationSeconds: sequence.targetDurationSeconds,
            plannedDurationSeconds: sequence.durationSeconds,
            sequenceDelta
          }
        ));
      }
    }

    const missingScheduleShotIds = input.shots
      .filter((shot) => !input.scheduleByShotId.has(shot.shotId))
      .map((shot) => shot.shotId);
    if (missingScheduleShotIds.length > 0) {
      issues.push(issue(
        input.projectId,
        "block",
        "missing_render_schedule_item",
        "One or more timeline shots are missing render schedule evidence.",
        "Rebuild the render schedule before provider spend.",
        [],
        missingScheduleShotIds,
        { missingScheduleShotCount: missingScheduleShotIds.length }
      ));
    }

    const captionEnabled = input.postproductionAssetPlan.caption.enabled;
    const captionCoveredSeconds = input.segments.reduce((sum, segment) => sum + segment.captionCoverage.coveredSeconds, 0);
    if (captionEnabled && captionCoveredSeconds < plannedDurationSeconds * 0.7) {
      issues.push(issue(
        input.projectId,
        "warn",
        "caption_coverage_gap",
        "Caption coverage is below the expected long-form timeline range.",
        "Generate or supply caption cues that cover the approved narration and key on-screen claims.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.shots.map((shot) => shot.shotId),
        { captionCoveredSeconds: roundSeconds(captionCoveredSeconds), plannedDurationSeconds }
      ));
    }
    const outOfRangeCueCount = (input.captionCues ?? []).filter((cue) =>
      cue.startSecond < 0 || cue.endSecond <= cue.startSecond || cue.endSecond > plannedDurationSeconds + 1
    ).length;
    if (outOfRangeCueCount > 0) {
      issues.push(issue(
        input.projectId,
        "warn",
        "caption_out_of_range",
        "One or more caption cues sit outside the planned long-form timeline.",
        "Clamp or regenerate caption cues against the planned timeline before assembly.",
        [],
        [],
        { outOfRangeCueCount, plannedDurationSeconds }
      ));
    }

    const generatedItems = input.postproductionAssetPlan.generatedAudio.executionPlan.items;
    const intentById = new Map((input.generatedAudioIntents ?? []).map((intent) => [intent.intentId, intent]));
    const generatedTimingGapCount = generatedItems.filter((item) =>
      item.status === "ready_for_provider" &&
      (
        typeof intentById.get(item.intentId)?.startSecond !== "number" ||
        this.generatedIntentDuration(intentById.get(item.intentId)) === undefined
      )
    ).length;
    if (generatedTimingGapCount > 0) {
      issues.push(issue(
        input.projectId,
        "warn",
        "generated_audio_timing_gap",
        "Ready generated-audio intents are missing explicit timeline timing.",
        "Bind every ready narration, BGM, ambience, or SFX intent to start and duration before paid audio validation.",
        [],
        [],
        { generatedTimingGapCount }
      ));
    }
    if (input.postproductionAssetPlan.generatedAudio.blockedIntentCount > 0) {
      issues.push(issue(
        input.projectId,
        "warn",
        "generated_audio_blocked",
        "Some generated-audio intents are blocked before provider execution.",
        "Resolve generated-audio capability, provider preference, or duration issues before assembly.",
        [],
        [],
        { blockedIntentCount: input.postproductionAssetPlan.generatedAudio.blockedIntentCount }
      ));
    }

    const sequentialSegments = input.segments.filter((segment) => segment.requiresManualReview);
    if (sequentialSegments.length > 0) {
      issues.push(issue(
        input.projectId,
        "info",
        "sequential_manual_review",
        "Timeline contains continuity-sensitive segments that should receive manual review after paid render.",
        "Review sequential, source-video anchored, or high-risk transitions before customer delivery.",
        uniqueStrings(sequentialSegments.map((segment) => segment.sequenceId)),
        sequentialSegments.map((segment) => segment.shotId),
        { manualReviewSegmentCount: sequentialSegments.length }
      ));
    }

    return issues;
  }

  private sequenceForShot(
    continuityPlan: LongFormContinuityPlan,
    shot: ShotContract
  ): LongFormContinuitySequence | undefined {
    return continuityPlan.sequences.find((sequence) => sequence.shotIds.includes(shot.shotId));
  }

  private captionCoverage(
    cues: readonly CaptionCue[],
    startSecond: number,
    endSecond: number
  ): LongFormTimelineCaptionCoverage {
    const overlaps = cues
      .map((cue, index) => ({
        index,
        startSecond: Math.max(startSecond, cue.startSecond),
        endSecond: Math.min(endSecond, cue.endSecond)
      }))
      .filter((cue) => cue.endSecond > cue.startSecond);
    return {
      cueCount: overlaps.length,
      coveredSeconds: roundSeconds(overlaps.reduce((sum, cue) => sum + (cue.endSecond - cue.startSecond), 0)),
      cueIndexes: overlaps.map((cue) => cue.index)
    };
  }

  private audioCoverage(
    postproductionAssetPlan: PostproductionAssetPlan,
    generatedAudioIntents: readonly GeneratedAudioIntent[],
    startSecond: number,
    endSecond: number
  ): LongFormTimelineAudioCoverage {
    const intentById = new Map(generatedAudioIntents.map((intent) => [intent.intentId, intent]));
    const generated = postproductionAssetPlan.generatedAudio.executionPlan.items.filter((item) => {
      if (item.status !== "ready_for_provider") {
        return false;
      }
      const intent = intentById.get(item.intentId);
      const requestStart = typeof intent?.startSecond === "number" ? intent.startSecond : undefined;
      const requestDuration = this.generatedIntentDuration(intent);
      if (requestStart === undefined || requestDuration === undefined) {
        return false;
      }
      return requestStart < endSecond && requestStart + requestDuration > startSecond;
    });
    return {
      suppliedTrackRoles: postproductionAssetPlan.audio.roleCounts
        .filter((roleCount) => roleCount.count > 0)
        .map((roleCount) => roleCount.role),
      generatedIntentIds: generated.map((item) => item.intentId),
      generatedKinds: generated.map((item) => item.kind),
      generatedLanguages: uniqueStrings(
        generated.map((item) => intentById.get(item.intentId)?.language)
      )
    };
  }

  private generatedIntentDuration(intent: GeneratedAudioIntent | undefined): number | undefined {
    if (!intent) {
      return undefined;
    }
    if (typeof intent.durationSeconds === "number" && Number.isFinite(intent.durationSeconds) && intent.durationSeconds > 0) {
      return intent.durationSeconds;
    }
    if (
      typeof intent.startSecond === "number" &&
      Number.isFinite(intent.startSecond) &&
      typeof intent.endSecond === "number" &&
      Number.isFinite(intent.endSecond) &&
      intent.endSecond > intent.startSecond
    ) {
      return intent.endSecond - intent.startSecond;
    }
    return undefined;
  }

  private continuityFields(shot: ShotContract): readonly string[] {
    return Object.entries(shot.continuity)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .sort();
  }

  private storyArcRoleForSegment(
    shot: ShotContract,
    startSecond: number,
    endSecond: number,
    targetDurationSeconds: number
  ): string {
    if (typeof shot.metadata?.storyArcRole === "string" && shot.metadata.storyArcRole.trim()) {
      return shot.metadata.storyArcRole.trim();
    }
    const text = `${shot.intent} ${shot.action}`.toLowerCase();
    if (/hook|opening|first frame|stop|attention|curious|why/.test(text)) return "hook";
    if (/problem|pain|before|friction|objection/.test(text)) return "problem";
    if (/payoff|result|resolution|cta|final|close|offer/.test(text)) return "payoff";
    if (/turn|bridge|transition|reveal|twist|escalat/.test(text)) return "turning_point";
    if (/proof|evidence|test|claim|demo|demonstrat/.test(text)) return "proof";
    const midpoint = targetDurationSeconds > 0 ? ((startSecond + endSecond) / 2) / targetDurationSeconds : 0.5;
    if (midpoint < 0.2) return "setup";
    if (midpoint > 0.8) return "payoff";
    if (midpoint > 0.58) return "turning_point";
    return "development";
  }

  private storyArcPositionForSegment(
    shot: ShotContract,
    startSecond: number,
    endSecond: number,
    targetDurationSeconds: number
  ): string {
    if (typeof shot.metadata?.storyArcPosition === "string" && shot.metadata.storyArcPosition.trim()) {
      return shot.metadata.storyArcPosition.trim();
    }
    if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) {
      return "unknown";
    }
    const midpoint = ((startSecond + endSecond) / 2) / targetDurationSeconds;
    if (midpoint <= 0.2) return "opening";
    if (midpoint < 0.35) return "early_development";
    if (midpoint < 0.65) return "middle_development";
    if (midpoint < 0.8) return "late_development";
    return "ending";
  }

  private storyArcContract(
    role: string,
    position: string,
    startSecond: number,
    endSecond: number,
    targetDurationSeconds: number
  ): string {
    return [
      `Segment ${startSecond}-${endSecond}s of ${targetDurationSeconds}s is ${position}.`,
      `It must advance the ${role} function of the full video, preserve continuity anchors, and leave an edit-ready endpoint.`
    ].join(" ");
  }

  private providerSettingPolicy(settings: FlexibleSeedanceSettings): LongFormTimelineProviderSettingPolicy {
    return {
      tier: settings.tier,
      resolution: settings.resolution,
      qualityMode: settings.qualityMode,
      ratio: settings.ratio,
      audioMode: settings.audioMode,
      bitrateMode: settings.bitrateMode,
      watermark: settings.watermark,
      returnLastFrame: settings.returnLastFrame,
      nativeProviderAudioEnabled: settings.audioMode === "native" || settings.audioMode === "guided" || settings.audioMode === "hybrid",
      externalAudioScriptEnabled: settings.audioMode !== "none",
      lastFrameChainingPreferred: settings.returnLastFrame
    };
  }

  private productionContract(input: {
    readonly shot: ShotContract;
    readonly sequence: LongFormContinuitySequence | undefined;
    readonly startSecond: number;
    readonly endSecond: number;
    readonly durationSeconds: number;
    readonly storyArcRole: string;
    readonly storyArcPosition: string;
    readonly audioCoverage: LongFormTimelineAudioCoverage;
    readonly audioScriptLineId: string;
    readonly providerSettingPolicy: LongFormTimelineProviderSettingPolicy;
  }): LongFormTimelineSegmentProductionContract {
    const productionAct = this.productionActFor(input.storyArcRole, input.storyArcPosition);
    return {
      productionAct,
      timingGoal: [
        `Use ${input.startSecond}-${input.endSecond}s of the full video as ${input.storyArcPosition}.`,
        `Complete one ${productionAct} beat inside this ${input.durationSeconds}s provider clip.`
      ].join(" "),
      requiredVisualChange: this.requiredVisualChangeFor(productionAct, input.shot),
      voiceoverLine: this.voiceoverLineFor(productionAct),
      nativeAudioPrompt: this.nativeAudioPromptFor(input.shot, input.providerSettingPolicy, input.audioCoverage),
      musicCue: this.musicCueFor(productionAct, input.providerSettingPolicy),
      sfxCue: this.sfxCueFor(productionAct, input.shot),
      endpointJob: this.endpointJobFor(input.shot, input.sequence),
      providerSettingSummary: this.providerSettingSummary(input.providerSettingPolicy, input.audioScriptLineId)
    };
  }

  private audioScript(segments: readonly LongFormTimelineSegment[]): readonly LongFormTimelineAudioScriptLine[] {
    return segments.map((segment) => ({
      lineId: segment.audioScriptLineId,
      sequenceId: segment.sequenceId,
      shotId: segment.shotId,
      startSecond: segment.startSecond,
      endSecond: segment.endSecond,
      durationSeconds: segment.durationSeconds,
      spokenLine: segment.productionContract.voiceoverLine,
      language: this.audioScriptLanguage(segment),
      delivery: this.deliveryFor(segment.productionContract.productionAct),
      wordBudget: this.voiceoverWordBudget(segment.durationSeconds),
      visualSync: segment.productionContract.requiredVisualChange
    }));
  }

  private productionActFor(role: string, position: string): LongFormTimelineProductionAct {
    const text = `${role} ${position}`.toLowerCase();
    if (/hook|opening|setup|problem/.test(text)) return "opening";
    if (/proof|demo|evidence|test/.test(text)) return "proof";
    if (/turn|bridge|transition|late_development/.test(text)) return "turning_point";
    if (/payoff|offer|ending|cta|close|result/.test(text)) return "payoff";
    return "development";
  }

  private requiredVisualChangeFor(act: LongFormTimelineProductionAct, shot: ShotContract): string {
    switch (act) {
      case "opening":
        return `Open with a readable promise or problem, then move into the planned action: ${shot.action}`;
      case "proof":
        return `Show evidence through a visible material, product, or human-state change: ${shot.action}`;
      case "turning_point":
        return `Reveal a contrast or direction shift while preserving anchors: ${shot.action}`;
      case "payoff":
        return `Resolve on product/result/creator reaction without adding a new claim: ${shot.action}`;
      case "development":
        return `Add one new visible detail that advances the story instead of repeating a pose: ${shot.action}`;
    }
  }

  private voiceoverLineFor(act: LongFormTimelineProductionAct): string {
    switch (act) {
      case "opening":
        return "Stop the scroll; show the promise now.";
      case "proof":
        return "Point to the evidence as it visibly changes.";
      case "turning_point":
        return "Mark the shift, then hand off cleanly.";
      case "payoff":
        return "Land the result and invite the next step.";
      case "development":
        return "Add one new detail that advances the story.";
    }
  }

  private nativeAudioPromptFor(
    shot: ShotContract,
    policy: LongFormTimelineProviderSettingPolicy,
    audioCoverage: LongFormTimelineAudioCoverage
  ): string {
    if (!policy.nativeProviderAudioEnabled) {
      return "Provider-native audio is disabled; keep the visual self-explanatory and use the external audio script if audio is produced later.";
    }
    const generatedKinds = audioCoverage.generatedKinds.length > 0
      ? audioCoverage.generatedKinds.join(", ")
      : "shot-timed original room tone, subtle music bed, and action-matched SFX";
    return [
      `Generate original audio only: ${generatedKinds}.`,
      shot.audioIntent ? `Follow shot audio intent: ${shot.audioIntent}.` : "Keep audio supportive and timed to visible action.",
      "Do not copy protected songs, source-video transcripts, unapproved voice likeness, or platform audio watermarks."
    ].join(" ");
  }

  private musicCueFor(act: LongFormTimelineProductionAct, policy: LongFormTimelineProviderSettingPolicy): string {
    if (policy.audioMode === "none") {
      return "No music requested.";
    }
    switch (act) {
      case "opening":
        return "Start music immediately with a low, original pulse; avoid a dead-air first second.";
      case "proof":
        return "Keep music restrained so proof/detail remains readable.";
      case "turning_point":
        return "Lift energy slightly at the reveal, then leave room for the next cut.";
      case "payoff":
        return "Resolve the music under the final product/result frame.";
      case "development":
        return "Maintain steady rhythm under narration and visible action.";
    }
  }

  private sfxCueFor(act: LongFormTimelineProductionAct, shot: ShotContract): string {
    const contactHint = /apply|touch|pour|open|close|click|swipe|wipe|cut|mix|spray|type|tap/i.test(shot.action)
      ? "Add subtle product/contact SFX exactly on the visible action."
      : "Use only natural ambience or very light movement SFX.";
    return act === "payoff"
      ? `${contactHint} Let the final half-second breathe for the edit handle.`
      : contactHint;
  }

  private endpointJobFor(shot: ShotContract, sequence: LongFormContinuitySequence | undefined): string {
    const nextState = shot.continuity.nextShotStartState;
    const bridgeIntent = sequence?.bridgeToNext?.bridgeIntent;
    if (nextState) {
      return `End on a stable last-frame handle for chaining; next shot expects ${nextState}.`;
    }
    if (bridgeIntent) {
      return `End on sequence bridge anchors: ${bridgeIntent}`;
    }
    return "End on a stable, non-blurry frame with subject/product/result legible for assembly.";
  }

  private providerSettingSummary(
    policy: LongFormTimelineProviderSettingPolicy,
    audioScriptLineId: string
  ): string {
    return [
      `tier=${policy.tier}`,
      `resolution=${policy.resolution}`,
      `quality=${policy.qualityMode}`,
      `ratio=${policy.ratio}`,
      `audio=${policy.audioMode}`,
      `nativeAudio=${policy.nativeProviderAudioEnabled}`,
      `bitrate=${policy.bitrateMode}`,
      `returnLastFrame=${policy.returnLastFrame}`,
      `audioScriptLine=${audioScriptLineId}`
    ].join("; ");
  }

  private audioScriptLanguage(segment: LongFormTimelineSegment): string {
    const [language] = segment.audioCoverage.generatedLanguages;
    if (language) {
      return language;
    }
    return "auto";
  }

  private deliveryFor(act: LongFormTimelineProductionAct): string {
    switch (act) {
      case "opening":
        return "direct, immediate, no pause before the first word";
      case "proof":
        return "calm, precise, timed to the visible evidence";
      case "turning_point":
        return "slightly lifted energy, then a clean pause";
      case "payoff":
        return "confident resolve, leave room under the final frame";
      case "development":
        return "conversational, forward-moving, not over-explaining";
    }
  }

  private voiceoverWordBudget(durationSeconds: number): number {
    const seconds = Number.isFinite(durationSeconds) ? Math.max(1, durationSeconds) : 4;
    return Math.max(3, Math.floor(seconds * VOICEOVER_WORDS_PER_SECOND));
  }
}

function issue(
  projectId: string,
  severity: LongFormTimelineIssueSeverity,
  code: LongFormTimelineIssueCode,
  message: string,
  repair: string,
  affectedSequenceIds: readonly string[],
  affectedShotIds: readonly string[],
  evidence: Record<string, string | number | boolean>
): LongFormTimelineIssue {
  return {
    issueId: createStableId("timeline_issue", `${projectId}:${code}:${affectedSequenceIds.join(",")}:${affectedShotIds.join(",")}`),
    severity,
    code,
    message,
    repair,
    affectedSequenceIds,
    affectedShotIds,
    evidence
  };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
