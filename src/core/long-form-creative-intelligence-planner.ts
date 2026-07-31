/**
 * Long-form creative intelligence planner.
 * It translates reference-consistency, agentic-video, benchmark, and storyboard director reasoning into deterministic
 * CineJelly-owned story bible, viral strategy, quality, repair, and candidate-selection evidence.
 */

import type { StoryPlan } from "../types/agent.js";
import { LongDirectorPlanner } from "./long-director-planner.js";
import type { AudienceNicheIntelligence } from "../types/audience-niche-intelligence.js";
import type { LongFormAgentReviewPlan } from "../types/long-form-agent-review.js";
import type { LongFormContinuityPlan, LongFormContinuitySequence } from "../types/long-form-continuity.js";
import type {
  LongFormCreativeAudioCaptionQuality,
  LongFormCreativeCandidateDirective,
  LongFormCreativeIdeaCandidate,
  LongFormCreativeIdeaScore,
  LongFormCreativeIdeaSource,
  LongFormCreativeIntelligencePlan,
  LongFormCreativeIntelligenceStatus,
  LongFormCreativeNicheStrategy,
  LongFormCreativeQualityFinding,
  LongFormCreativeQualityFindingCode,
  LongFormCreativeQualitySeverity,
  LongFormCreativeRepairDirective,
  LongFormCreativeRepairPriority,
  LongFormCreativeRepairScope,
  LongFormCreativeShotDirective,
  LongFormCreativeStoryBible,
  LongFormCreativeViralLever
} from "../types/long-form-creative-intelligence.js";
import type { LongFormTimelinePlan, LongFormTimelineSegment } from "../types/long-form-timeline.js";
import type { PostproductionAssetPlan } from "../types/postproduction-assets.js";
import type { ShotContract } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import type { VideoRenderStrategyPlan } from "../types/video-render-strategy.js";
import { createStableId } from "../utils/ids.js";
import { AudienceNicheIntelligencePlanner } from "./audience-niche-intelligence.js";
import {
  internalSourcePatternOrigins,
  LONG_FORM_CREATIVE_INTELLIGENCE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_FORM_CREATIVE_INTELLIGENCE_SOURCE_PATTERN_IDS);

const CLAIM_RISK_PATTERN =
  /100%|guarantee|guaranteed|cure|heal|doctor|clinical|risk[-\s]?free|overnight|income|profit|#1|best\b/i;
const HOOK_PATTERN = /hook|problem|pain|curious|secret|why|before|after|mistake|stop|watch|attention|opening/i;
const PAYOFF_PATTERN = /cta|payoff|result|resolution|transform|proof|final|offer|buy|try|learn|subscribe|share/i;

interface LongFormCreativeIdeaSpec {
  readonly source: LongFormCreativeIdeaSource;
  readonly label: string;
  readonly logline: string;
  readonly openingHook: string;
  readonly sequenceArc: readonly string[];
  readonly proofPlan: string;
  readonly audioNarrationPlan: string;
  readonly sourceVideoAdaptationRule: string;
  readonly productionRisks: readonly string[];
  readonly reasons: readonly string[];
}

export class LongFormCreativeIntelligencePlanner {
  private readonly longDirectorPlanner = new LongDirectorPlanner();
  private readonly audienceNichePlanner = new AudienceNicheIntelligencePlanner();

  public build(input: {
    readonly projectId: string;
    readonly userInput: string;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
    readonly continuityPlan: LongFormContinuityPlan;
    readonly agentReview: LongFormAgentReviewPlan;
    readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    readonly timelinePlan: LongFormTimelinePlan;
    readonly postproductionAssetPlan: PostproductionAssetPlan;
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
  }): LongFormCreativeIntelligencePlan {
    const nicheStrategy = this.nicheStrategy(input.projectId, input.userInput, input.storyPlan, input.sourceVideoAnalysis);
    const storyBible = this.storyBible(input.storyPlan, input.continuityPlan, nicheStrategy);
    const audioCaptionQuality = this.audioCaptionQuality(input.timelinePlan, input.postproductionAssetPlan);
    const findings = [
      ...this.storyFindings(input, nicheStrategy, storyBible),
      ...this.continuityFindings(input.continuityPlan),
      ...this.qualityFindings(input, audioCaptionQuality),
      ...this.upstreamGateFindings(input),
      ...this.sourceVideoFindings(input)
    ];
    const shotDirectives = this.shotDirectives(input, nicheStrategy);
    const candidateDirectives = this.candidateDirectives(input, shotDirectives, findings);
    const repairDirectives = this.repairDirectives(input.projectId, findings);
    const ideaCandidates = this.ideaCandidates(input, nicheStrategy, storyBible, findings, repairDirectives);
    const selectedIdeaCandidate = ideaCandidates.find((candidate) => candidate.selectedForRender);
    const directorPlan = this.longDirectorPlanner.build({
      projectId: input.projectId,
      storyPlan: input.storyPlan,
      continuityPlan: input.continuityPlan,
      storyBible,
      shots: input.shots,
      findings
    });
    const blockingFindingCount = findings.filter((finding) => finding.severity === "block").length;
    const reviewRequiredFindingCount = findings.filter((finding) => finding.severity === "warn").length;
    const status = statusFor(findings);
    const qualityScore = qualityScoreFor(findings, input.shots.length, input.timelinePlan.segmentCount);

    return {
      schemaVersion: "cinejelly.long-form-creative-intelligence.v1",
      projectId: input.projectId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      targetDurationSeconds: input.storyPlan.targetDurationSeconds,
      qualityScore,
      nicheStrategy,
      storyBible,
      directorPlan,
      findingCount: findings.length,
      blockingFindingCount,
      reviewRequiredFindingCount,
      ...(selectedIdeaCandidate ? { selectedIdeaCandidateId: selectedIdeaCandidate.ideaId } : {}),
      ideaCandidateCount: ideaCandidates.length,
      shotDirectiveCount: shotDirectives.length,
      candidateDirectiveCount: candidateDirectives.length,
      repairDirectiveCount: repairDirectives.length,
      audioCaptionQuality,
      findings,
      ideaCandidates,
      shotDirectives,
      candidateDirectives,
      repairDirectives,
      releaseGateSummary: {
        canUseAsNoSpendCreativeIntelligenceEvidence: true,
        canProceedToRender: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Long-form creative intelligence found blocking story, strategy, timeline, or review evidence before provider spend."
          : status === "review_required"
            ? "Long-form creative intelligence can proceed to render, but highlighted quality/viral/continuity risks require review or repair before customer release."
            : "Long-form creative intelligence is ready as no-spend director evidence; customer release still depends on media review and accepted artifacts."
      }
    };
  }

  private nicheStrategy(
    projectId: string,
    userInput: string,
    storyPlan: StoryPlan,
    sourceVideoAnalysis: SourceVideoDeconstruction | undefined
  ): LongFormCreativeNicheStrategy {
    const text = `${userInput} ${storyPlan.premise}`.toLowerCase();
    const audienceNicheIntelligence = this.audienceNichePlanner.build({
      projectId,
      prompt: `${userInput} ${storyPlan.premise}`,
      durationSeconds: storyPlan.targetDurationSeconds,
      sourceVideoProvided: Boolean(sourceVideoAnalysis?.scenes?.length)
    });
    const niche = longFormNicheFrom(text, audienceNicheIntelligence);
    const platformIntent = platformIntentFrom(text, storyPlan.targetDurationSeconds, audienceNicheIntelligence);
    const viralLevers = uniqueValues<LongFormCreativeViralLever>([
      "specific_niche_promise",
      platformIntent.includes("social") || platformIntent.includes("vertical") || audienceNicheIntelligence.trendPosture === "trend_native" || storyPlan.targetDurationSeconds <= 90
        ? "fast_hook"
        : "curiosity_gap",
      storyPlan.targetDurationSeconds > 90 ? "curiosity_gap" : undefined,
      "proof_stack",
      "visual_payoff",
      "identity_consistency",
      "caption_retention",
      "clean_cta",
      sourceVideoAnalysis?.scenes?.length ? "source_style_match" : undefined
    ]);
    return {
      audienceNicheIntelligence,
      niche,
      audience: audienceNicheIntelligence.audience,
      platformIntent,
      desiredViewerAction: viewerActionFrom(text, audienceNicheIntelligence),
      trendPosture: audienceNicheIntelligence.trendPosture,
      viewerObjection: audienceNicheIntelligence.viewerObjection,
      proofStrategy: audienceNicheIntelligence.proofStrategy,
      shareTrigger: audienceNicheIntelligence.shareTrigger,
      hookPattern: hookPatternFrom(storyPlan.targetDurationSeconds, audienceNicheIntelligence),
      retentionBeats: this.retentionBeats(storyPlan),
      viralLevers,
      antiPatterns: [
        "Do not let scenes become interchangeable proof shots.",
        "Do not add unsupported product or medical claims.",
        "Do not let style, identity, product, or environment anchors drift between shots.",
        "Do not bury the payoff after the viewer has already understood the premise.",
        "Do not use a generic template arc when the audience, objection, or trend posture points to a sharper idea."
      ]
    };
  }

  private storyBible(
    storyPlan: StoryPlan,
    continuityPlan: LongFormContinuityPlan,
    nicheStrategy: LongFormCreativeNicheStrategy
  ): LongFormCreativeStoryBible {
    const firstSequence = continuityPlan.sequences[0];
    const lastSequence = continuityPlan.sequences[continuityPlan.sequences.length - 1];
    return {
      logline: clean(storyPlan.premise, 280) || `${nicheStrategy.niche} video with a clear proof arc.`,
      centralQuestion: firstSequence
        ? `Can the video prove "${firstSequence.purpose}" for ${nicheStrategy.audience}?`
        : `Can the video deliver a clear ${nicheStrategy.niche} promise?`,
      emotionalArc: continuityPlan.sequences.map((sequence, index) =>
        `${index + 1}. ${sequence.title}: ${sequence.purpose}`
      ),
      characterAnchors: continuityPlan.globalAnchors.identity,
      productAnchors: continuityPlan.globalAnchors.product,
      environmentAnchors: continuityPlan.globalAnchors.environment,
      styleAnchors: continuityPlan.globalAnchors.style,
      continuityRules: uniqueValues([
        "Preserve identity, product, environment, and style anchors across every sequence.",
        "Each sequence must either raise the promise, prove it, or resolve it.",
        "Use bridge anchors when moving between sequences.",
        "Keep unsupported claims out of narration, captions, and visual text.",
        continuityPlan.globalAnchors.sourceVideoSceneIds.length > 0
          ? "When source-video guidance exists, preserve source scene order as structure, not raw copied media."
          : undefined
      ]),
      payoff: lastSequence?.closingBeat ?? "End with a clear result, CTA, or emotional resolution."
    };
  }

  private storyFindings(
    input: {
      readonly projectId: string;
      readonly userInput: string;
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
    },
    nicheStrategy: LongFormCreativeNicheStrategy,
    storyBible: LongFormCreativeStoryBible
  ): readonly LongFormCreativeQualityFinding[] {
    const findings: LongFormCreativeQualityFinding[] = [];
    const userText = input.userInput.trim();
    if (userText.length < 24 || nicheStrategy.niche === "general_video") {
      findings.push(finding(
        input.projectId,
        "warn",
        "generic_niche_or_audience",
        "The request has a weak niche/audience signal, which reduces viral targeting precision.",
        "Ask the user or UI to capture niche, audience, platform, and desired viewer action before final creative approval.",
        [],
        [],
        { userInputLength: userText.length }
      ));
    }
    const firstShot = input.shots[0];
    const firstText = `${firstShot?.intent ?? ""} ${firstShot?.action ?? ""}`;
    if (firstShot && !HOOK_PATTERN.test(firstText)) {
      findings.push(finding(
        input.projectId,
        "warn",
        "weak_opening_hook",
        "The first shot does not clearly carry hook/problem/curiosity language.",
        "Rewrite the first shot to expose the sharpest niche promise, pain, proof, or visual contrast immediately.",
        this.sequenceIdsForShots(input.continuityPlan, [firstShot.shotId]),
        [firstShot.shotId],
        { firstShotDurationSeconds: firstShot.durationSeconds }
      ));
    }
    const lastShot = input.shots[input.shots.length - 1];
    const lastText = `${lastShot?.intent ?? ""} ${lastShot?.action ?? ""} ${storyBible.payoff}`;
    if (lastShot && !PAYOFF_PATTERN.test(lastText)) {
      findings.push(finding(
        input.projectId,
        "warn",
        "weak_payoff_or_cta",
        "The final shot/payoff is not explicit enough for a commercial or viral loop.",
        "Rewrite the final beat with a concrete result, CTA, transformation, or emotional resolution.",
        this.sequenceIdsForShots(input.continuityPlan, [lastShot.shotId]),
        [lastShot.shotId],
        { targetDurationSeconds: input.storyPlan.targetDurationSeconds }
      ));
    }
    return findings;
  }

  private continuityFindings(continuityPlan: LongFormContinuityPlan): readonly LongFormCreativeQualityFinding[] {
    const findings: LongFormCreativeQualityFinding[] = [];
    const missingAnchorKinds = (["identity", "product", "environment", "style"] as const).filter(
      (kind) => continuityPlan.globalAnchors[kind].length === 0
    );
    for (const kind of missingAnchorKinds) {
      findings.push(finding(
        continuityPlan.projectId,
        "warn",
        "missing_story_anchor",
        `Long-form story bible is missing a global ${kind} anchor.`,
        `Add a ${kind} reference, constraint, or continuity note before creative approval.`,
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
        { anchorKind: kind }
      ));
    }
    for (const sequence of continuityPlan.sequences) {
      if (sequence.order < continuityPlan.sequenceCount - 1 && !sequence.bridgeToNext) {
        findings.push(finding(
          continuityPlan.projectId,
          "block",
          "sequence_bridge_gap",
          "A non-final sequence is missing bridge evidence, which can break long-form narrative continuity.",
          "Regenerate continuity bridges before provider spend.",
          [sequence.sequenceId],
          sequence.shotIds,
          { sequenceOrder: sequence.order }
        ));
      }
    }
    return findings;
  }

  private qualityFindings(
    input: {
      readonly projectId: string;
      readonly userInput: string;
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly postproductionAssetPlan: PostproductionAssetPlan;
    },
    audioCaptionQuality: LongFormCreativeAudioCaptionQuality
  ): readonly LongFormCreativeQualityFinding[] {
    const findings: LongFormCreativeQualityFinding[] = [];
    for (const shot of input.shots) {
      if (shot.durationSeconds > 12) {
        findings.push(finding(
          input.projectId,
          "warn",
          "shot_duration_risk",
          "A shot is long enough to risk weak retention or provider drift.",
          "Split the shot, add timeline beats, or make the action more specific before paid validation.",
          this.sequenceIdsForShots(input.continuityPlan, [shot.shotId]),
          [shot.shotId],
          { durationSeconds: shot.durationSeconds }
        ));
      }
      if (shot.risks.length > 0 && this.recommendedCandidateCount(shot, 0, input.shots.length) < 2) {
        findings.push(finding(
          input.projectId,
          "warn",
          "continuity_risk_needs_candidate",
          "A continuity-sensitive shot should receive multiple candidates or stricter repair review.",
          "Increase candidate count for risky identity, product, transition, or source-video shots.",
          this.sequenceIdsForShots(input.continuityPlan, [shot.shotId]),
          [shot.shotId],
          { riskCount: shot.risks.length }
        ));
      }
    }
    const repeatedActionGroups = repeatedActionKeys(input.shots);
    for (const group of repeatedActionGroups) {
      findings.push(finding(
        input.projectId,
        "warn",
        "repetitive_shot_language",
        "Multiple shots have nearly identical subject/action language, which can make the long video feel repetitive.",
        "Differentiate the affected shots by camera motivation, proof role, emotional turn, or visual payoff.",
        this.sequenceIdsForShots(input.continuityPlan, group.shotIds),
        group.shotIds,
        { repeatedShotCount: group.shotIds.length }
      ));
    }
    if (audioCaptionQuality.captionCoverageRatio < 0.7 && input.postproductionAssetPlan.caption.enabled) {
      findings.push(finding(
        input.projectId,
        "warn",
        "caption_coverage_gap",
        "Caption coverage is below the retention-safe threshold.",
        "Generate caption cues across narration, claims, and key proof beats before creative approval.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.shots.map((shot) => shot.shotId),
        { captionCoverageRatio: audioCaptionQuality.captionCoverageRatio }
      ));
    }
    if (audioCaptionQuality.timingIssueCount > 0) {
      findings.push(finding(
        input.projectId,
        "warn",
        "generated_audio_timing_gap",
        "Generated-audio planning has timing or readiness issues.",
        "Bind each narration/BGM/ambience/SFX intent to explicit timeline timing before paid audio validation.",
        [],
        [],
        { timingIssueCount: audioCaptionQuality.timingIssueCount }
      ));
    }
    const claimText = `${input.userInput} ${input.storyPlan.premise} ${input.shots.map((shot) => `${shot.intent} ${shot.action}`).join(" ")}`;
    if (CLAIM_RISK_PATTERN.test(claimText)) {
      findings.push(finding(
        input.projectId,
        "warn",
        "unsupported_claim_risk",
        "The creative brief contains claim language that may require substantiation.",
        "Route claims through approval and avoid unsupported absolute, medical, income, or guaranteed-result language.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.shots.map((shot) => shot.shotId),
        { claimRiskDetected: true }
      ));
    }
    return findings;
  }

  private upstreamGateFindings(input: {
    readonly projectId: string;
    readonly continuityPlan: LongFormContinuityPlan;
    readonly agentReview: LongFormAgentReviewPlan;
    readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    readonly timelinePlan: LongFormTimelinePlan;
  }): readonly LongFormCreativeQualityFinding[] {
    const findings: LongFormCreativeQualityFinding[] = [];
    if (input.agentReview.status === "blocked") {
      findings.push(finding(
        input.projectId,
        "block",
        "agent_review_blocked",
        "The multi-role long-form agent review is blocked.",
        "Resolve blocking long-form agent review directives before creative approval or provider spend.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
        { blockingFindingCount: input.agentReview.blockingFindingCount }
      ));
    }
    if (input.videoRenderStrategyPlan.blockingIssueCount > 0) {
      findings.push(finding(
        input.projectId,
        "block",
        "render_strategy_blocked",
        "The video render strategy has blocking workflow issues.",
        "Resolve render strategy mode, reference lock, source-video, or storyboard approval blockers before provider spend.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
        { blockingIssueCount: input.videoRenderStrategyPlan.blockingIssueCount }
      ));
    }
    if (input.timelinePlan.blockingIssueCount > 0) {
      findings.push(finding(
        input.projectId,
        "block",
        "timeline_blocked",
        "The long-form timeline has blocking orchestration issues.",
        "Resolve timing, schedule, caption, or generated-audio blockers before provider spend.",
        input.timelinePlan.sequences.map((sequence) => sequence.sequenceId),
        input.timelinePlan.segments.map((segment) => segment.shotId),
        { blockingIssueCount: input.timelinePlan.blockingIssueCount }
      ));
    }
    return findings;
  }

  private sourceVideoFindings(input: {
    readonly projectId: string;
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    readonly continuityPlan: LongFormContinuityPlan;
  }): readonly LongFormCreativeQualityFinding[] {
    if (!input.sourceVideoAnalysis?.scenes?.length) {
      return [];
    }
    if (input.continuityPlan.globalAnchors.sourceVideoSceneIds.length > 0) {
      return [];
    }
    return [
      finding(
        input.projectId,
        "warn",
        "source_video_alignment_gap",
        "Source-video analysis exists but no source scene IDs are anchored in continuity evidence.",
        "Bind sampled source scene structure to sequence or shot planning before claiming source-video-guided creative parity.",
        input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
        { sourceVideoSceneCount: input.sourceVideoAnalysis.scenes.length }
      )
    ];
  }

  private audioCaptionQuality(
    timelinePlan: LongFormTimelinePlan,
    postproductionAssetPlan: PostproductionAssetPlan
  ): LongFormCreativeAudioCaptionQuality {
    const captionCoverageRatio = timelinePlan.plannedDurationSeconds > 0
      ? round(timelinePlan.postproduction.captionCoveredSeconds / timelinePlan.plannedDurationSeconds)
      : 0;
    const timingIssueCount = timelinePlan.issues.filter((issue) =>
      issue.code === "caption_coverage_gap" ||
      issue.code === "caption_out_of_range" ||
      issue.code === "generated_audio_timing_gap" ||
      issue.code === "generated_audio_blocked"
    ).length;
    const status: LongFormCreativeIntelligenceStatus = timelinePlan.blockingIssueCount > 0
      ? "blocked"
      : timingIssueCount > 0 || (postproductionAssetPlan.caption.enabled && captionCoverageRatio < 0.7)
        ? "review_required"
        : "ready";
    const recommendations = uniqueValues([
      postproductionAssetPlan.caption.enabled
        ? "Keep captions synchronized with narration and claim-bearing proof moments."
        : "Enable captions for social retention when the launch surface is short-form or mobile-first.",
      postproductionAssetPlan.generatedAudio.intentCount > 0
        ? "Keep generated narration/audio timing bound to the long-form timeline before paid audio execution."
        : "Use guided narration or music only when it strengthens clarity, pacing, or emotional payoff.",
      timingIssueCount > 0 ? "Resolve timeline audio/caption timing issues before creative approval." : undefined
    ]);
    return {
      status,
      captionCoverageRatio,
      captionCueCount: postproductionAssetPlan.caption.cueCount,
      generatedAudioIntentCount: postproductionAssetPlan.generatedAudio.intentCount,
      generatedAudioReadyIntentCount: postproductionAssetPlan.generatedAudio.readyIntentCount,
      generatedAudioBlockedIntentCount: postproductionAssetPlan.generatedAudio.blockedIntentCount,
      timingIssueCount,
      recommendations
    };
  }

  private shotDirectives(
    input: {
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
    },
    nicheStrategy: LongFormCreativeNicheStrategy
  ): readonly LongFormCreativeShotDirective[] {
    return input.shots.map((shot, index) => {
      const sequence = this.sequenceForShot(input.continuityPlan, shot.shotId);
      const segment = input.timelinePlan.segments.find((candidate) => candidate.shotId === shot.shotId);
      const continuityAnchors = uniqueValues([
        shot.continuity.identity,
        shot.continuity.product,
        shot.continuity.environment,
        shot.continuity.style,
        ...(sequence?.bridgeToNext?.requiredAnchors ?? [])
      ]);
      return {
        shotId: shot.shotId,
        sequenceId: sequence?.sequenceId ?? "unsequenced",
        order: index,
        viralRole: this.viralRole(index, input.shots.length, shot, nicheStrategy),
        targetEmotion: this.targetEmotion(index, input.shots.length, nicheStrategy),
        qualityChecks: uniqueValues([
          "subject matches story bible",
          "action advances sequence purpose",
          "style and lighting preserve anchors",
          shot.risks.length > 0 ? "risk anchors are visible and reviewable" : undefined,
          segment?.requiresManualReview ? "manual review required after render" : undefined,
          shot.transitionIntent ? "start/end handles support clean edit continuity" : undefined
        ]),
        recommendedCandidateCount: this.recommendedCandidateCount(shot, index, input.shots.length),
        shouldPrioritizeRepair: shot.risks.length > 0 || Boolean(segment?.requiresManualReview),
        continuityAnchors
      };
    });
  }

  private candidateDirectives(
    input: {
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
    },
    shotDirectives: readonly LongFormCreativeShotDirective[],
    findings: readonly LongFormCreativeQualityFinding[]
  ): readonly LongFormCreativeCandidateDirective[] {
    return shotDirectives
      .filter((directive) => directive.recommendedCandidateCount > 1 || directive.shouldPrioritizeRepair)
      .map((directive) => {
        const shot = input.shots.find((candidate) => candidate.shotId === directive.shotId);
        const affectedFindings = findings.filter((findingItem) => findingItem.affectedShotIds.includes(directive.shotId));
        return {
          shotId: directive.shotId,
          sequenceId: directive.sequenceId,
          candidateCount: directive.recommendedCandidateCount,
          reasonCodes: uniqueValues([
            directive.shouldPrioritizeRepair ? "continuity_or_manual_review_sensitive" : undefined,
            shot?.risks.includes("face") ? "face_consistency" : undefined,
            shot?.risks.includes("product_logo") ? "product_logo_consistency" : undefined,
            shot?.risks.includes("transition") || shot?.transitionIntent ? "transition_continuity" : undefined,
            ...affectedFindings.map((findingItem) => findingItem.code)
          ])
        };
      });
  }

  private ideaCandidates(
    input: {
      readonly projectId: string;
      readonly storyPlan: StoryPlan;
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    nicheStrategy: LongFormCreativeNicheStrategy,
    storyBible: LongFormCreativeStoryBible,
    findings: readonly LongFormCreativeQualityFinding[],
    repairDirectives: readonly LongFormCreativeRepairDirective[]
  ): readonly LongFormCreativeIdeaCandidate[] {
    const specs = this.ideaSpecs(input, nicheStrategy, storyBible, findings, repairDirectives);
    const seen = new Set<string>();
    const candidates = specs
      .filter((spec) => {
        const key = `${spec.source}:${spec.label.toLowerCase()}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((spec) => this.ideaCandidateForSpec(input.projectId, spec, input, nicheStrategy, storyBible, findings))
      .sort((left, right) => right.score.totalScore - left.score.totalScore || left.ideaId.localeCompare(right.ideaId));
    const selectedIdeaId = candidates[0]?.ideaId;
    return candidates.map((candidate) => ({
      ...candidate,
      selectedForRender: candidate.ideaId === selectedIdeaId
    }));
  }

  private ideaSpecs(
    input: {
      readonly storyPlan: StoryPlan;
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    nicheStrategy: LongFormCreativeNicheStrategy,
    storyBible: LongFormCreativeStoryBible,
    findings: readonly LongFormCreativeQualityFinding[],
    repairDirectives: readonly LongFormCreativeRepairDirective[]
  ): readonly LongFormCreativeIdeaSpec[] {
    const ideaSeedSpecs = nicheStrategy.audienceNicheIntelligence.ideaSeeds.slice(0, 6).map((seed, index): LongFormCreativeIdeaSpec => ({
      source: "audience_niche",
      label: `Audience seed ${index + 1}`,
      logline: `${nicheStrategy.audience} watches a ${nicheStrategy.niche} story turn "${nicheStrategy.viewerObjection}" into ${nicheStrategy.proofStrategy}.`,
      openingHook: seed.includes("Hook:")
        ? seed
        : `Open with ${nicheStrategy.hookPattern}`,
      sequenceArc: this.sequenceArcFromContinuity(input.continuityPlan, storyBible, seed),
      proofPlan: seed.includes("Proof:")
        ? seed
        : nicheStrategy.proofStrategy,
      audioNarrationPlan: `Narration follows ${nicheStrategy.trendPosture}: ${nicheStrategy.audienceNicheIntelligence.retentionPattern}.`,
      sourceVideoAdaptationRule: "Use audience/niche seed as strategy only; write original scene wording, actions, claims, and CTA.",
      productionRisks: this.productionRisksFor(findings),
      reasons: uniqueValues([
        `uses shared audience/niche intelligence ${nicheStrategy.audienceNicheIntelligence.intelligenceId}`,
        `targets ${nicheStrategy.trendPosture}`,
        `addresses ${nicheStrategy.viewerObjection}`
      ])
    }));

    const timelineActs = uniqueValues(input.timelinePlan.segments.map((segment) => segment.productionContract.productionAct));
    const timelineSpec: LongFormCreativeIdeaSpec = {
      source: "timeline_production_contract",
      label: "Timeline act coverage candidate",
      logline: `A ${input.storyPlan.targetDurationSeconds}s story uses ${timelineActs.join(", ")} acts to prove the promise without compressing the middle.`,
      openingHook: input.timelinePlan.segments[0]?.productionContract.voiceoverLine ?? nicheStrategy.hookPattern,
      sequenceArc: input.timelinePlan.segments.slice(0, 8).map((segment) =>
        `${segment.storyArcPosition}: ${segment.productionContract.requiredVisualChange}`
      ),
      proofPlan: `Use segment production contracts and audio script lines as proof rhythm: ${nicheStrategy.proofStrategy}`,
      audioNarrationPlan: `Use ${input.timelinePlan.audioScriptLineCount} script line(s), native audio mode ${input.timelinePlan.providerSettingPolicy.audioMode}, and endpoint-aware pauses.`,
      sourceVideoAdaptationRule: "Use source-video timing only where source-video anchors exist; otherwise follow timeline production contracts.",
      productionRisks: this.productionRisksFor(findings),
      reasons: uniqueValues([
        "uses long-form timeline production contracts",
        `provider policy ${input.timelinePlan.providerSettingPolicy.resolution}/${input.timelinePlan.providerSettingPolicy.bitrateMode}`,
        `audio script lines ${input.timelinePlan.audioScriptLineCount}`
      ])
    };

    const storySpec: LongFormCreativeIdeaSpec = {
      source: "story_bible",
      label: "Story bible proof arc candidate",
      logline: storyBible.logline,
      openingHook: storyBible.centralQuestion,
      sequenceArc: storyBible.emotionalArc,
      proofPlan: `${storyBible.payoff}. ${nicheStrategy.proofStrategy}`,
      audioNarrationPlan: `Narration should carry the central question, proof turn, and payoff without unsupported claims.`,
      sourceVideoAdaptationRule: "Let story bible anchors override trend style whenever they conflict.",
      productionRisks: this.productionRisksFor(findings),
      reasons: uniqueValues([
        "uses story bible logline and central question",
        `anchor coverage ${storyBible.characterAnchors.length + storyBible.productAnchors.length + storyBible.environmentAnchors.length + storyBible.styleAnchors.length}`,
        `payoff ${storyBible.payoff}`
      ])
    };

    const sourceVideoSpec = input.sourceVideoAnalysis?.scenes?.length
      ? [{
          source: "source_video_structure" as const,
          label: "Source-video structure transfer candidate",
          logline: `Transfer ${input.sourceVideoAnalysis.scenes.length} approved source scene structure(s) into an original ${nicheStrategy.niche} proof story.`,
          openingHook: input.sourceVideoAnalysis.scenes[0]?.summary ?? nicheStrategy.hookPattern,
          sequenceArc: input.sourceVideoAnalysis.scenes.slice(0, 6).map((scene) =>
            `${scene.sceneId}: ${scene.summary}; pacing ${scene.pacing}; camera ${scene.camera}`
          ),
          proofPlan: `Borrow source structure only, then prove with user product/KOL anchors: ${nicheStrategy.proofStrategy}`,
          audioNarrationPlan: "Match source pacing energy only; write original narration, room tone, SFX, and music instructions.",
          sourceVideoAdaptationRule: "Replace faces, product, setting, transcript wording, captions, brand marks, music, claims, CTA, and assets with approved user inputs.",
          productionRisks: uniqueValues([...this.productionRisksFor(findings), "source_video_structure_review"]),
          reasons: uniqueValues([
            "uses approved source-video analysis",
            `source structural beats ${input.sourceVideoAnalysis.structuralBeats?.length ?? 0}`,
            `source style notes ${input.sourceVideoAnalysis.styleNotes?.length ?? 0}`
          ])
        }]
      : [];

    const repairSpec = repairDirectives.length > 0
      ? [{
          source: "director_repair" as const,
          label: "Repair-aware safer candidate",
          logline: `A safer version prioritizes ${repairDirectives.slice(0, 3).map((repair) => repair.scope).join(", ")} repair before paid render.`,
          openingHook: nicheStrategy.hookPattern,
          sequenceArc: repairDirectives.slice(0, 6).map((repair) =>
            `${repair.priority} ${repair.scope}: ${repair.action}`
          ),
          proofPlan: `Resolve repair-sensitive proof before render: ${nicheStrategy.proofStrategy}`,
          audioNarrationPlan: "Narration avoids claim risk, leaves pauses for repair-sensitive shots, and stays aligned with reviewed captions.",
          sourceVideoAdaptationRule: "Where repair conflicts with source-video style, repair and user assets win.",
          productionRisks: uniqueValues(repairDirectives.flatMap((repair) => repair.triggerCodes)),
          reasons: uniqueValues([
            `repair directives ${repairDirectives.length}`,
            `high priority repairs ${repairDirectives.filter((repair) => repair.priority === "high" || repair.priority === "critical").length}`
          ])
        }]
      : [];

    return [
      ...ideaSeedSpecs,
      timelineSpec,
      storySpec,
      ...sourceVideoSpec,
      ...repairSpec
    ];
  }

  private ideaCandidateForSpec(
    projectId: string,
    spec: LongFormCreativeIdeaSpec,
    input: {
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    nicheStrategy: LongFormCreativeNicheStrategy,
    storyBible: LongFormCreativeStoryBible,
    findings: readonly LongFormCreativeQualityFinding[]
  ): LongFormCreativeIdeaCandidate {
    const score = this.ideaScore(spec, input, nicheStrategy, storyBible, findings);
    const ideaId = createStableId(
      "long_idea",
      [
        projectId,
        spec.source,
        spec.label,
        spec.logline,
        spec.openingHook,
        score.totalScore
      ].join(":")
    );
    return {
      ideaId,
      label: clean(spec.label, 120),
      source: spec.source,
      selectedForRender: false,
      logline: clean(spec.logline, 360),
      openingHook: clean(spec.openingHook, 260),
      sequenceArc: spec.sequenceArc.slice(0, 10).map((item) => clean(item, 220)),
      proofPlan: clean(spec.proofPlan, 300),
      audioNarrationPlan: clean(spec.audioNarrationPlan, 300),
      sourceVideoAdaptationRule: clean(spec.sourceVideoAdaptationRule, 300),
      productionRisks: uniqueValues(spec.productionRisks).slice(0, 10),
      score,
      reasons: uniqueValues(spec.reasons).slice(0, 8)
    };
  }

  private ideaScore(
    spec: LongFormCreativeIdeaSpec,
    input: {
      readonly shots: readonly ShotContract[];
      readonly continuityPlan: LongFormContinuityPlan;
      readonly timelinePlan: LongFormTimelinePlan;
      readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
    },
    nicheStrategy: LongFormCreativeNicheStrategy,
    storyBible: LongFormCreativeStoryBible,
    findings: readonly LongFormCreativeQualityFinding[]
  ): LongFormCreativeIdeaScore {
    const hasHookLanguage = HOOK_PATTERN.test(`${spec.openingHook} ${spec.logline}`);
    const sequenceCoverage = Math.min(1, spec.sequenceArc.length / Math.max(1, input.continuityPlan.sequenceCount));
    const anchorCount = storyBible.characterAnchors.length + storyBible.productAnchors.length + storyBible.environmentAnchors.length + storyBible.styleAnchors.length;
    const warningCount = findings.filter((findingItem) => findingItem.severity === "warn").length;
    const blockingCount = findings.filter((findingItem) => findingItem.severity === "block").length;
    const sourceVideoBonus = spec.source === "source_video_structure" && input.sourceVideoAnalysis?.scenes?.length ? 8 : 0;
    const hookStrength = clampScore((hasHookLanguage ? 78 : 62) + (nicheStrategy.viralLevers.includes("fast_hook") ? 8 : 0));
    const retentionDepth = clampScore(58 + sequenceCoverage * 28 + (spec.sequenceArc.length >= 4 ? 6 : 0));
    const nicheFit = clampScore(nicheStrategy.niche === "general_video" ? 52 : 82 + (nicheStrategy.trendPosture === "trend_native" ? 5 : 0));
    const proofSpecificity = clampScore(60 + (spec.proofPlan.length > 80 ? 12 : 0) + (nicheStrategy.viralLevers.includes("proof_stack") ? 10 : 0));
    const continuitySafety = clampScore(62 + Math.min(20, anchorCount * 3) - warningCount * 2 - blockingCount * 12);
    const renderReadiness = clampScore(input.timelinePlan.blockingIssueCount > 0 ? 30 : 80 - warningCount * 2 - blockingCount * 20);
    const originality = clampScore(78 + sourceVideoBonus + (spec.source === "audience_niche" ? 6 : 0) - (spec.productionRisks.includes("source_video_structure_review") ? 4 : 0));
    const totalScore = round(
      hookStrength * 0.18 +
      retentionDepth * 0.18 +
      nicheFit * 0.16 +
      proofSpecificity * 0.16 +
      continuitySafety * 0.14 +
      renderReadiness * 0.1 +
      originality * 0.08
    );
    return {
      hookStrength,
      retentionDepth,
      nicheFit,
      proofSpecificity,
      continuitySafety,
      renderReadiness,
      originality,
      totalScore
    };
  }

  private sequenceArcFromContinuity(
    continuityPlan: LongFormContinuityPlan,
    storyBible: LongFormCreativeStoryBible,
    seed: string
  ): readonly string[] {
    const seedLine = clean(seed.replace(/^(Hook|Retention|Proof|Share\/CTA|Format\/posture|Desire\/objecting tension):\s*/i, ""), 140);
    return continuityPlan.sequences.length > 0
      ? continuityPlan.sequences.map((sequence, index) =>
          `${index + 1}. ${sequence.title}: ${sequence.purpose}; seed focus ${seedLine}`
        )
      : storyBible.emotionalArc;
  }

  private productionRisksFor(findings: readonly LongFormCreativeQualityFinding[]): readonly string[] {
    return uniqueValues(
      findings
        .filter((findingItem) => findingItem.severity !== "info")
        .map((findingItem) => findingItem.code)
    );
  }

  private repairDirectives(
    projectId: string,
    findings: readonly LongFormCreativeQualityFinding[]
  ): readonly LongFormCreativeRepairDirective[] {
    return findings
      .filter((findingItem) => findingItem.severity !== "info")
      .map((findingItem): LongFormCreativeRepairDirective => ({
        repairId: createStableId("creative_repair", `${projectId}:${findingItem.code}:${findingItem.affectedShotIds.join(",")}`),
        scope: scopeForFinding(findingItem.code),
        priority: priorityForFinding(findingItem.severity, findingItem.code),
        affectedSequenceIds: findingItem.affectedSequenceIds,
        affectedShotIds: findingItem.affectedShotIds,
        triggerCodes: [findingItem.code],
        action: findingItem.repair,
        canAutoRepairBeforeRender: canAutoRepairBeforeRender(findingItem.code),
        requiresManualReview: findingItem.severity === "warn" || !canAutoRepairBeforeRender(findingItem.code)
      }));
  }

  private recommendedCandidateCount(shot: ShotContract, index: number, shotCount: number): number {
    let count = 1;
    if (shot.risks.length > 0) {
      count += 1;
    }
    if (index === 0 || index === shotCount - 1) {
      count += 1;
    }
    if (shot.transitionIntent || shot.references.some((reference) => reference.role === "source_video_structure")) {
      count += 1;
    }
    return Math.min(4, count);
  }

  private viralRole(
    index: number,
    shotCount: number,
    shot: ShotContract,
    nicheStrategy: LongFormCreativeNicheStrategy
  ): string {
    if (index === 0) {
      return `hook: ${nicheStrategy.hookPattern}`;
    }
    if (index === shotCount - 1) {
      return `payoff/CTA: ${nicheStrategy.desiredViewerAction}`;
    }
    if (shot.risks.length > 0) {
      return "proof/continuity checkpoint";
    }
    return "retention beat";
  }

  private targetEmotion(index: number, shotCount: number, nicheStrategy: LongFormCreativeNicheStrategy): string {
    if (index === 0) {
      return "curiosity";
    }
    if (index === shotCount - 1) {
      return nicheStrategy.desiredViewerAction === "purchase_or_lead" ? "confidence" : "resolution";
    }
    return index < shotCount / 2 ? "tension" : "belief";
  }

  private sequenceForShot(continuityPlan: LongFormContinuityPlan, shotId: string): LongFormContinuitySequence | undefined {
    return continuityPlan.sequences.find((sequence) => sequence.shotIds.includes(shotId));
  }

  private sequenceIdsForShots(continuityPlan: LongFormContinuityPlan, shotIds: readonly string[]): readonly string[] {
    return continuityPlan.sequences
      .filter((sequence) => sequence.shotIds.some((shotId) => shotIds.includes(shotId)))
      .map((sequence) => sequence.sequenceId);
  }

  private retentionBeats(storyPlan: StoryPlan): readonly string[] {
    const beats = storyPlan.scenes.flatMap((scene) => scene.beats);
    if (beats.length === 0) {
      return ["hook", "proof", "payoff"];
    }
    return beats.slice(0, 8).map((beat, index) => `${index + 1}. ${clean(`${beat.purpose}: ${beat.action}`, 160)}`);
  }
}

function longFormNicheFrom(text: string, audienceNiche: AudienceNicheIntelligence): string {
  if (/shop|ecommerce|product|sku|price|sale|discount|ad|ads|tiktok shop|amazon|landing/i.test(text)) {
    return "ecommerce_product_video";
  }
  if (audienceNiche.niche === "education_course" || /course|training|education|lesson|explain|tutorial|teach|learn/i.test(text)) {
    return "educational_explainer";
  }
  if (audienceNiche.niche === "brand_story_documentary" || /documentary|story|founder|brand story|case study|journey/i.test(text)) {
    return "brand_story_documentary";
  }
  if (audienceNiche.niche === "cinematic_story" || /cinematic|film|trailer|short film|scene|movie/i.test(text)) {
    return "cinematic_story";
  }
  if (audienceNiche.niche === "saas_b2b" || /agency|client|campaign|b2b|saas|lead/i.test(text)) {
    return "agency_b2b_campaign";
  }
  return audienceNiche.niche === "general_video" ? "general_video" : audienceNiche.niche;
}

function platformIntentFrom(text: string, durationSeconds: number, audienceNiche: AudienceNicheIntelligence): string {
  if (/tiktok|reels|shorts|vertical/i.test(text) || audienceNiche.trendPosture === "trend_native") {
    return "vertical_social";
  }
  if (/youtube|webinar|training|course/i.test(text) || durationSeconds >= 120 || audienceNiche.trendPosture === "educational_search") {
    return "long_form_web";
  }
  if (/ad|ads|landing|product/i.test(text) || audienceNiche.funnelStage === "conversion") {
    return "paid_social_ad";
  }
  return durationSeconds <= 90 ? "social_video" : "long_form_web";
}

function viewerActionFrom(text: string, audienceNiche: AudienceNicheIntelligence): string {
  if (/buy|purchase|order|shop|lead|book|demo|signup|sign up/i.test(text) || audienceNiche.funnelStage === "conversion") {
    return "purchase_or_lead";
  }
  if (/learn|education|course|training|subscribe/i.test(text) || audienceNiche.trendPosture === "educational_search") {
    return "learn_or_subscribe";
  }
  if (/share|viral|awareness|brand/i.test(text) || audienceNiche.trendPosture === "trend_native") {
    return "share_or_remember";
  }
  return "understand_and_continue";
}

function hookPatternFrom(durationSeconds: number, audienceNiche: AudienceNicheIntelligence): string {
  if (durationSeconds <= 90) {
    return `Open with ${audienceNiche.hookAngle}.`;
  }
  return `Open a curiosity gap around ${audienceNiche.viewerObjection}, then resolve it through ${audienceNiche.proofStrategy}.`;
}

function finding(
  projectId: string,
  severity: LongFormCreativeQualitySeverity,
  code: LongFormCreativeQualityFindingCode,
  message: string,
  repair: string,
  affectedSequenceIds: readonly string[],
  affectedShotIds: readonly string[],
  evidence: Record<string, string | number | boolean>
): LongFormCreativeQualityFinding {
  return {
    findingId: createStableId("creative_finding", `${projectId}:${code}:${affectedSequenceIds.join(",")}:${affectedShotIds.join(",")}`),
    severity,
    code,
    message,
    repair,
    affectedSequenceIds,
    affectedShotIds,
    evidence
  };
}

function statusFor(findings: readonly LongFormCreativeQualityFinding[]): LongFormCreativeIntelligenceStatus {
  if (findings.some((findingItem) => findingItem.severity === "block")) {
    return "blocked";
  }
  if (findings.some((findingItem) => findingItem.severity === "warn")) {
    return "review_required";
  }
  return "ready";
}

function qualityScoreFor(findings: readonly LongFormCreativeQualityFinding[], shotCount: number, segmentCount: number): number {
  const base = shotCount > 0 && segmentCount === shotCount ? 100 : 85;
  const penalty = findings.reduce((sum, findingItem) => {
    switch (findingItem.severity) {
      case "block":
        return sum + 35;
      case "warn":
        return sum + 8;
      case "info":
        return sum + 1;
    }
  }, 0);
  return Math.max(0, Math.min(100, base - penalty));
}

function scopeForFinding(code: LongFormCreativeQualityFindingCode): LongFormCreativeRepairScope {
  switch (code) {
    case "generic_niche_or_audience":
    case "weak_opening_hook":
    case "weak_payoff_or_cta":
    case "unsupported_claim_risk":
      return "story";
    case "missing_story_anchor":
    case "sequence_bridge_gap":
    case "source_video_alignment_gap":
      return "sequence";
    case "shot_duration_risk":
    case "repetitive_shot_language":
    case "continuity_risk_needs_candidate":
      return "shot";
    case "caption_coverage_gap":
    case "generated_audio_timing_gap":
      return "postproduction";
    case "agent_review_blocked":
      return "prompt";
    case "render_strategy_blocked":
    case "timeline_blocked":
      return "timeline";
  }
}

function priorityForFinding(
  severity: LongFormCreativeQualitySeverity,
  code: LongFormCreativeQualityFindingCode
): LongFormCreativeRepairPriority {
  if (severity === "block") {
    return "critical";
  }
  if (code === "weak_opening_hook" || code === "weak_payoff_or_cta" || code === "unsupported_claim_risk") {
    return "high";
  }
  if (severity === "warn") {
    return "medium";
  }
  return "low";
}

function canAutoRepairBeforeRender(code: LongFormCreativeQualityFindingCode): boolean {
  switch (code) {
    case "source_video_alignment_gap":
    case "unsupported_claim_risk":
      return false;
    default:
      return true;
  }
}

function repeatedActionKeys(shots: readonly ShotContract[]): readonly { readonly key: string; readonly shotIds: readonly string[] }[] {
  const groups = new Map<string, string[]>();
  for (const shot of shots) {
    const key = `${normalizeKey(shot.subject)}:${normalizeKey(shot.action)}`;
    const existing = groups.get(key) ?? [];
    existing.push(shot.shotId);
    groups.set(key, existing);
  }
  return [...groups.entries()]
    .filter(([, shotIds]) => shotIds.length >= 3)
    .map(([key, shotIds]) => ({ key, shotIds }));
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
}

function clean(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampScore(value: number): number {
  return round(Math.max(0, Math.min(100, value)));
}

function uniqueValues<T extends string>(values: readonly (T | string | undefined)[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
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
    result.push(normalized as T);
  }
  return result;
}
