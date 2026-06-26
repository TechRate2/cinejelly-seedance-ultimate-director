/**
 * Short-pipeline render handoff.
 * Converts a reviewable short plan into the normal async render-job contract
 * without bypassing admission, quota, review, cost, or artifact gates.
 */

import type { CineJellyProjectRequest } from "../types/agent.js";
import type { CaptionCue, CaptionOptions } from "../types/caption.js";
import type { GeneratedAudioIntent } from "../types/audio.js";
import type {
  ReviewApprovalCheckpoint,
  ReviewApprovalCheckpointInput,
  ReviewApprovalGate
} from "../types/review-approval.js";
import type {
  ShortPipelineAudioPolicy,
  ShortPipelineAudioPolicyInput,
  ShortPipelinePlan,
  ShortPipelineVisualTextPolicy
} from "../types/short-pipeline.js";
import { createStableId } from "../utils/ids.js";

export interface ShortPipelineRenderHandoffReviewInput {
  readonly gate?: ReviewApprovalGate;
  readonly checkpoints: readonly ReviewApprovalCheckpointInput[];
}

export interface ShortPipelineRenderHandoffInput {
  readonly plan: ShortPipelinePlan;
  readonly reviewApproval?: ShortPipelineRenderHandoffReviewInput;
  readonly settings?: CineJellyProjectRequest["settings"];
  readonly modelPreferences?: CineJellyProjectRequest["modelPreferences"];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly captionOptions?: CaptionOptions;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly audio?: ShortPipelineAudioPolicyInput;
}

export interface ShortPipelineRenderHandoff {
  readonly request: CineJellyProjectRequest;
  readonly reviewApproval: ShortPipelineRenderHandoffReviewInput;
  readonly summary: {
    readonly planId: string;
    readonly projectId: string;
    readonly planStatus: ShortPipelinePlan["status"];
    readonly reviewApprovalStatus: ShortPipelinePlan["reviewApproval"]["status"];
    readonly sceneCount: number;
    readonly captionCueCount: number;
    readonly generatedAudioIntentCount: number;
    readonly canUseAsRenderJobHandoff: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}

const SHORT_SINGLE_CLIP_MAX_SECONDS = 15;
const RENDER_PROMPT_MAX_CHARS = 23_500;

export function buildShortPipelineRenderHandoff(input: ShortPipelineRenderHandoffInput): ShortPipelineRenderHandoff {
  const plan = input.plan;
  const canUseAsRenderJobHandoff = plan.status !== "blocked" && plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence;
  const visualTextPolicy = plan.visualTextPolicy ?? defaultVisualTextPolicy();
  const audioPolicy = resolveAudioPolicy(input.audio, plan.audioPolicy ?? defaultAudioPolicyForPlan(plan));
  const captionCues: readonly CaptionCue[] = [];
  const generatedAudioIntents = audioPolicy.generatedAudioIntentEnabled && input.includeGeneratedAudioIntents !== false
    ? generatedAudioIntentsFromPlan(plan, audioPolicy)
    : [];
  const reviewApproval = input.reviewApproval ?? {
    gate: "pre_render" as const,
    checkpoints: plan.reviewApproval.checkpoints.map(checkpointInputFromReport)
  };
  const workflowMetadata = shortWorkflowMetadata(plan, input.metadata);

  return {
    request: {
      userInput: renderPromptFromPlan(plan, audioPolicy, visualTextPolicy),
      settings: {
        durationTargetSeconds: plan.intent.targetDurationSeconds,
        ratio: plan.intent.aspectRatio,
        ...input.settings,
        audioMode: generatedAudioIntents.length > 0 ? "guided" : "none"
      },
      ...(input.modelPreferences ? { modelPreferences: input.modelPreferences } : {}),
      ...(input.references ? { references: input.references } : {}),
      metadata: {
        ...safeMetadata(input.metadata),
        ...workflowMetadata,
        projectId: plan.projectId,
        ...(plan.requestId ? { requestId: plan.requestId } : {}),
        shortPipelinePlanId: plan.planId,
        shortPipelineStatus: plan.status,
        shortPipelineTemplatePolicy: plan.templatePolicy,
        shortPipelineDynamicWorkflowRequired: String(plan.dynamicWorkflowRequired),
        shortPipelineReviewStatus: plan.reviewApproval.status,
        shortPipelineSource: "agentic_short_pipeline",
        shortViralIntelligenceId: plan.viralIntelligence.intelligenceId,
        shortViralStatus: plan.viralIntelligence.status,
        shortViralNiche: plan.viralIntelligence.nicheStrategy.niche,
        shortViralPlatformFocus: plan.viralIntelligence.nicheStrategy.platformFocus,
        shortViralCreativeMode: plan.viralIntelligence.nicheStrategy.creativeMode,
        shortCreativePatternLearningId: plan.viralIntelligence.creativePatternLearning.learningId,
        shortAudienceNicheTrendPosture: plan.viralIntelligence.nicheStrategy.audienceNicheIntelligence.trendPosture,
        shortCommercialReadinessId: plan.commercialReadiness.readinessId,
        shortCommercialReadinessStatus: plan.commercialReadiness.status,
        shortCommercialReadinessScore: String(plan.commercialReadiness.qualityScore),
        shortAudioPolicyMode: audioPolicy.mode,
        shortAudioRenderMode: generatedAudioIntents.length > 0 ? "guided" : "none",
        shortGeneratedAudioIntentEnabled: String(generatedAudioIntents.length > 0),
        ...(audioPolicy.language ? { shortAudioLanguage: audioPolicy.language } : {}),
        shortVisualTextPolicy: visualTextPolicy.mode,
        shortOnScreenTextAllowed: String(visualTextPolicy.allowOnScreenText),
        shortCaptionBurnInAllowed: String(visualTextPolicy.allowCaptions),
        shortCtaCardsAllowed: String(visualTextPolicy.allowCtaCards),
        shortCrawlerPolicyStatus: plan.commercialReadiness.crawlerPolicy.status,
        shortOutcomeMemoryStatus: plan.commercialReadiness.outcomeMemory.status,
        shortReferenceAnalysisStatus: plan.commercialReadiness.referenceAnalysis.status,
        ...(plan.channelStyleProfile ? {
          shortChannelStyleProfileId: plan.channelStyleProfile.profileId,
          shortChannelStyleStatus: plan.channelStyleProfile.status,
          shortChannelStyleAnchorCount: String(plan.channelStyleProfile.styleAnchors.length)
        } : {}),
        ...(plan.viralIntelligence.winningConceptId ? { shortViralWinningConceptId: plan.viralIntelligence.winningConceptId } : {}),
        ...(plan.viralIntelligence.referenceVideoPattern ? { shortReferencePatternId: plan.viralIntelligence.referenceVideoPattern.patternId } : {}),
        ...(plan.agentGraph ? { shortAgentGraphRunId: plan.agentGraph.graphRunId, shortAgentGraphStatus: plan.agentGraph.status } : {}),
        ...(plan.seedancePromptPack ? { shortSeedancePromptPackId: plan.seedancePromptPack.promptPackId } : {}),
        ...(plan.selectedTemplate ? { shortPipelineSelectedTemplateId: plan.selectedTemplate.templateId } : {}),
        ...(plan.productBrief ? { productBriefId: plan.productBrief.briefId } : {}),
        ...(plan.brandKitEvaluation ? { brandKitId: plan.brandKitEvaluation.brandKitId } : {})
      },
      captionCues,
      captionOptions: {
        ...(input.captionOptions ?? {}),
        enabled: false,
        burnIn: false,
        ...(plan.brandKitEvaluation?.language ? { language: plan.brandKitEvaluation.language } : {})
      },
      ...(generatedAudioIntents.length > 0 ? { generatedAudioIntents } : {}),
      ...(input.outputPath ? { outputPath: input.outputPath } : {}),
      ...(input.workDirectory ? { workDirectory: input.workDirectory } : {}),
      ...(input.artifactDirectory ? { artifactDirectory: input.artifactDirectory } : {})
    },
    reviewApproval,
    summary: {
      planId: plan.planId,
      projectId: plan.projectId,
      planStatus: plan.status,
      reviewApprovalStatus: plan.reviewApproval.status,
      sceneCount: plan.scenes.length,
      captionCueCount: captionCues.length,
      generatedAudioIntentCount: generatedAudioIntents.length,
      canUseAsRenderJobHandoff,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: canUseAsRenderJobHandoff
        ? "Short-pipeline handoff can create an async render job, but customer traffic still requires render success, artifact validation, manual media review, deployment evidence, and business-readiness approval."
        : "Short-pipeline plan is blocked and cannot be handed to render until unsafe or conflicting evidence is corrected."
    }
  };
}

function shortWorkflowMetadata(
  plan: ShortPipelinePlan,
  metadata: CineJellyProjectRequest["metadata"] | undefined
): Record<string, string> {
  const provided = safeMetadata(metadata);
  const hasExplicitMode = Boolean(provided.workflowMode || provided.renderMode || provided.videoMode || provided.mode);
  const recommendedMode = plan.directorPlan.recommendedWorkflowMode;
  const singleClipRecommended = recommendedMode === "single_clip";
  return {
    shortPipelineRecommendedWorkflowMode: recommendedMode,
    shortDirectorPlanId: plan.directorPlan.directorId,
    shortDirectorStatus: plan.directorPlan.status,
    shortDirectorCreativeMode: plan.directorPlan.creativeMode,
    shortDirectorHookWindowSeconds: String(plan.directorPlan.hookPlan.hookWindowSeconds),
    shortDirectorTargetBeatCount: String(plan.directorPlan.pacingPlan.targetBeatCount),
    shortPipelineProviderClipMaxSeconds: String(SHORT_SINGLE_CLIP_MAX_SECONDS),
    shortPipelineCommercialDurationPolicy: "15_to_60_seconds",
    ...(hasExplicitMode
      ? {}
      : singleClipRecommended
        ? {
            workflowMode: "single",
            renderMode: "single_clip"
          }
        : {
            workflowMode: "storyboard",
            renderMode: "storyboard_multishot"
          })
  };
}

export function reviewInputCanQueueRender(input: ShortPipelineRenderHandoffReviewInput): boolean {
  return input.checkpoints.length > 0 &&
    input.checkpoints.every((checkpoint) => checkpoint.required === false || checkpoint.decision === "approved");
}

function renderPromptFromPlan(
  plan: ShortPipelinePlan,
  audioPolicy: ShortPipelineAudioPolicy,
  visualTextPolicy: ShortPipelineVisualTextPolicy
): string {
  const concept = plan.concepts[0];
  const product = plan.productBrief?.title ? `Product: ${plan.productBrief.title}` : "Product: operator-provided brief";
  const brand = plan.brandKitEvaluation?.brandName ? `Brand: ${plan.brandKitEvaluation.brandName}` : "Brand: not specified";
  const scenes = plan.scenes
    .map((scene) =>
      `${scene.order}. ${scene.role.toUpperCase()} - Goal: ${scene.goal} Visual: ${scene.visualDirection} Narration: ${scene.narration}`
    )
    .join("\n");
  const claims = plan.productBrief?.claimInventory.length
    ? plan.productBrief.claimInventory
        .map((claim) => `- ${claim.text} [risk=${claim.risk}, substantiationRequired=${claim.substantiationRequired}]`)
        .join("\n")
    : "- No explicit product claims; keep claims conservative and review-bound.";
  const template = plan.selectedTemplate
    ? `Selected optional accelerator: ${plan.selectedTemplate.label}`
    : plan.templateSuggestions[0]
      ? `Suggested optional accelerator: ${plan.templateSuggestions[0].label}`
      : "No template accelerator selected; build from natural-language intent.";
  const renderPrompt = (compact: boolean): string => compactLines([
    "Create a short commercial video from this approved agentic short-pipeline plan.",
    "Do not introduce unsupported claims. Preserve scene order.",
    visualTextPolicy.promptConstraint,
    audioPolicyPromptLine(audioPolicy),
    product,
    brand,
    `Business goal: ${plan.intent.businessGoal}`,
    `Audience: ${plan.intent.audience}`,
    `Platform: ${plan.intent.platform}`,
    `Emotion: ${plan.intent.emotion}`,
    `Target duration: ${plan.intent.targetDurationSeconds} seconds`,
    `Aspect ratio: ${plan.intent.aspectRatio}`,
    template,
    channelStyleFromPlan(plan, compact),
    viralStrategyFromPlan(plan, compact),
    concept ? `Primary concept: ${concept.label}. ${concept.angle} Hook: ${concept.hook}` : "",
    "Scene plan:",
    scenes,
    "Viral scene directives:",
    viralDirectivesFromPlan(plan, compact),
    seedancePromptPackFromPlan(plan, compact),
    "Claim review inventory:",
    claims
  ]);
  const fullPrompt = renderPrompt(false);
  return fullPrompt.length <= RENDER_PROMPT_MAX_CHARS
    ? fullPrompt
    : capRenderPrompt(renderPrompt(true), RENDER_PROMPT_MAX_CHARS);
}

function channelStyleFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const profile = plan.channelStyleProfile;
  if (!profile) {
    return "";
  }
  return compactLines([
    `Channel style profile: ${profile.channelName ?? profile.profileId}${profile.seriesName ? ` / ${profile.seriesName}` : ""}; status=${profile.status}; memory=${profile.memoryPolicy.mode}.`,
    profile.contentPillars.length ? `Content pillars: ${profile.contentPillars.join(", ")}.` : "",
    profile.styleRules.length ? `Style rules: ${profile.styleRules.join("; ")}.` : "",
    profile.doNotChange.length ? `Do not change: ${profile.doNotChange.join("; ")}.` : "",
    profile.avoidPatterns.length ? `Avoid channel drift: ${profile.avoidPatterns.join("; ")}.` : "",
    profile.styleAnchors.length && !compact
      ? `Reusable channel anchors: ${profile.styleAnchors.slice(0, 10).map((anchorItem) => `${anchorItem.kind}:${anchorItem.label}=${anchorItem.instruction}`).join(" | ")}.`
      : ""
  ]);
}

function viralStrategyFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const strategy = plan.viralIntelligence.nicheStrategy;
  const score = plan.viralIntelligence.conceptScores.find((item) => item.conceptId === plan.viralIntelligence.winningConceptId);
  const reference = plan.viralIntelligence.referenceVideoPattern;
  const selectedIdea = selectedShortCreativeIdea(plan);
  const topIdeas = plan.viralIntelligence.creativePatternLearning.candidates
    .slice(0, compact ? 3 : 5)
    .map((candidate) => `${candidate.label} score=${candidate.score.totalScore}`)
    .join(" | ");
  const findings = plan.viralIntelligence.findings
    .filter((finding) => finding.severity !== "info")
    .map((finding) => `${finding.code}:${finding.severity}`)
    .join(", ");
  const ideaSeeds = compact
    ? strategy.audienceNicheIntelligence.ideaSeeds.slice(0, 4).map((seed) => boundedText(seed, 180))
    : strategy.audienceNicheIntelligence.ideaSeeds;
  const viralLevers = compact ? strategy.viralLevers.slice(0, 8) : strategy.viralLevers;
  const antiPatterns = compact ? strategy.antiPatterns.slice(0, 5) : strategy.antiPatterns;
  const scoreReasons = compact ? score?.reasons.slice(0, 3) : score?.reasons;
  const referenceGuardrails = compact ? reference?.originalityGuardrails.slice(0, 3) : reference?.originalityGuardrails;
  return compactLines([
    `Short viral strategy: niche=${strategy.niche}; audience=${strategy.audience}; platformFocus=${strategy.platformFocus}; creativeMode=${strategy.creativeMode}; buyerIntent=${strategy.buyerIntent}.`,
    `Audience intelligence: presentation=${strategy.audienceNicheIntelligence.userPresentationStyle}; format=${strategy.audienceNicheIntelligence.format}; trendPosture=${strategy.audienceNicheIntelligence.trendPosture}; funnelStage=${strategy.audienceNicheIntelligence.funnelStage}.`,
    `Hook/proof/retention: ${strategy.audienceNicheIntelligence.hookAngle}. Proof: ${strategy.audienceNicheIntelligence.proofStrategy}. Retention: ${strategy.audienceNicheIntelligence.retentionPattern}.`,
    `Idea seeds: ${ideaSeeds.join(" | ")}.`,
    `Creative pattern learning: patterns=${plan.viralIntelligence.creativePatternLearning.patternCount}; candidates=${plan.viralIntelligence.creativePatternLearning.candidateCount}; selectedIdea=${selectedIdea?.ideaId ?? "none"}; selectedPattern=${selectedIdea?.patternId ?? "none"}.`,
    selectedIdea
      ? `Selected idea: ${selectedIdea.label}. Hook: ${boundedText(selectedIdea.hook, compact ? 220 : 360)} Proof: ${boundedText(selectedIdea.proofPlan, compact ? 220 : 360)} KOL/creator: ${boundedText(selectedIdea.creatorOrKolDirection, compact ? 180 : 300)}.`
      : "",
    topIdeas ? `Top idea candidates: ${topIdeas}.` : "",
    `Viewer desire: ${strategy.viewerDesire}. Viewer objection: ${strategy.viewerObjection}.`,
    `Use viral levers: ${viralLevers.join(", ")}. Avoid: ${antiPatterns.join("; ")}.`,
    score && scoreReasons ? `Winning concept score: ${score.totalScore} (${scoreReasons.join("; ")}).` : "",
    reference
      ? `Reference pattern ${reference.patternId}: use structure only: hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; text-rhythm=${reference.captionPattern}; payoff=${reference.ctaPattern}. Guardrails: ${(referenceGuardrails ?? []).join("; ")}.`
      : "",
    findings ? `Open viral findings for review: ${findings}.` : ""
  ]);
}

function selectedShortCreativeIdea(plan: ShortPipelinePlan) {
  return plan.viralIntelligence.creativePatternLearning.candidates.find(
    (candidate) => candidate.ideaId === plan.viralIntelligence.creativePatternLearning.selectedIdeaId
  ) ?? plan.viralIntelligence.creativePatternLearning.candidates[0];
}

function viralDirectivesFromPlan(plan: ShortPipelinePlan, compact = false): string {
  return plan.viralIntelligence.sceneDirectives
    .map((directive) => {
      if (compact) {
        return `${directive.order}. ${directive.role.toUpperCase()} ${directive.recommendedDurationSeconds}s - First frame: ${boundedText(directive.firstFrameRule, 160)} Retention: ${boundedText(directive.retentionJob, 140)} Camera: ${boundedText(directive.cameraCue, 120)} Proof: ${boundedText(directive.proofCue, 140)}${directive.ctaCue ? ` Payoff: ${boundedText(directive.ctaCue, 120)}` : ""}`;
      }
      return `${directive.order}. ${directive.role.toUpperCase()} ${directive.recommendedDurationSeconds}s - First frame: ${directive.firstFrameRule} Retention: ${directive.retentionJob} Camera: ${directive.cameraCue} Visual text policy: ${directive.captionCue} Proof: ${directive.proofCue}${directive.ctaCue ? ` Payoff: ${directive.ctaCue}` : ""} Checks: ${directive.qualityChecks.join("; ")}`;
    })
    .join("\n");
}

function seedancePromptPackFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const pack = plan.seedancePromptPack;
  if (!pack) {
    return "";
  }
  const shots = pack.shotPrompts
    .map((shot) => {
      if (compact) {
        return `${shot.order}. ${shot.startSecond}-${shot.endSecond}s ${shot.role.toUpperCase()} | First frame: ${boundedText(shot.firstFrame, 160)} | Visual: ${boundedText(shot.visualPrompt, 240)} | Camera: ${boundedText(shot.camera, 120)} | Action: ${boundedText(shot.action, 160)} | Narration: ${boundedText(shot.dialogueOrNarration, 200)} | On-screen text: ${onScreenTextInstructionFor(shot.caption)} | Audio: ${boundedText(shot.audio, 120)} | Continuity: ${boundedText(shot.continuity, 140)}`;
      }
      return `${shot.order}. ${shot.startSecond}-${shot.endSecond}s ${shot.role.toUpperCase()} | First frame: ${shot.firstFrame} | Visual: ${shot.visualPrompt} | Camera: ${shot.camera} | Action: ${shot.action} | Narration: ${shot.dialogueOrNarration} | On-screen text: ${onScreenTextInstructionFor(shot.caption)} | Audio: ${shot.audio} | Continuity: ${shot.continuity} | Reference: ${shot.referencePolicy} | Negatives: ${shot.negativeConstraints.join("; ")} | Checks: ${shot.qualityChecks.join("; ")}`;
    })
    .join("\n");
  return compactLines([
    "Seedance 2.0 prompt pack:",
    `Prompt pack id: ${pack.promptPackId}`,
    compact ? boundedText(pack.masterPrompt, 800) : pack.masterPrompt,
    `Audio plan: ${compact ? boundedText(pack.audioPlan, 300) : pack.audioPlan}`,
    `No-visible-text plan: ${compact ? boundedText(pack.captionPlan, 300) : pack.captionPlan}`,
    `Reference policy: ${compact ? boundedText(pack.referencePolicy, 300) : pack.referencePolicy}`,
    `Global negative constraints: ${(compact ? pack.globalNegativeConstraints.slice(0, 8).map((item) => boundedText(item, 120)) : pack.globalNegativeConstraints).join("; ")}`,
    "Time-coded Seedance shots:",
    shots
  ]);
}

function onScreenTextInstructionFor(caption: string): string {
  return caption === "NO_ON_SCREEN_TEXT"
    ? "none; do not render captions, subtitles, CTA cards, labels, typography, lower thirds, or fake UI text"
    : caption;
}

function generatedAudioIntentsFromPlan(plan: ShortPipelinePlan, audioPolicy: ShortPipelineAudioPolicy): readonly GeneratedAudioIntent[] {
  const sceneDuration = Math.max(1, plan.intent.targetDurationSeconds / Math.max(1, plan.scenes.length));
  return plan.scenes.map((scene, index) => {
    const startSecond = roundSeconds(index * sceneDuration);
    const endSecond = roundSeconds(Math.min(plan.intent.targetDurationSeconds, (index + 1) * sceneDuration));
    const voiceStyle = channelVoiceStyle(plan) ?? plan.brandKitEvaluation?.tone;
    const selectedVoiceStyle = audioPolicy.voiceStyle ?? voiceStyle;
    return {
      intentId: createStableId("short_audio", `${plan.planId}:${scene.sceneId}:${scene.order}`),
      kind: "tts_narration",
      prompt: scene.narration,
      startSecond,
      endSecond: endSecond > startSecond ? endSecond : roundSeconds(startSecond + 1),
      durationSeconds: roundSeconds(Math.max(1, endSecond - startSecond)),
      ...(audioPolicy.language ? { language: audioPolicy.language } : {}),
      ...(selectedVoiceStyle ? { voiceStyle: selectedVoiceStyle } : {}),
      volume: 0.9
    };
  });
}

function resolveAudioPolicy(
  input: ShortPipelineAudioPolicyInput | undefined,
  planPolicy: ShortPipelineAudioPolicy
): ShortPipelineAudioPolicy {
  if (!input) {
    return planPolicy;
  }
  const mode = input.mode === "off" ? "off" : "voiceover";
  const language = mode === "off" ? undefined : isShortAudioLanguage(input.language) ? input.language : planPolicy.language ?? "en";
  const voiceStyle = input.voiceStyle ?? planPolicy.voiceStyle;
  return {
    schemaVersion: "cinejelly.short-audio-policy.v1",
    mode,
    ...(language ? { language } : {}),
    ...(language ? { languageLabel: languageLabelFor(language) } : {}),
    ...(voiceStyle && mode !== "off" ? { voiceStyle } : {}),
    renderAudioMode: mode === "off" ? "none" : "guided",
    generatedAudioIntentEnabled: mode !== "off",
    nativeProviderAudioEnabled: false,
    reviewRequired: true
  };
}

function defaultAudioPolicyForPlan(plan: ShortPipelinePlan): ShortPipelineAudioPolicy {
  const language = languageFromText(plan.brandKitEvaluation?.language);
  return {
    schemaVersion: "cinejelly.short-audio-policy.v1",
    mode: "voiceover",
    language,
    languageLabel: languageLabelFor(language),
    ...(plan.brandKitEvaluation?.tone ? { voiceStyle: plan.brandKitEvaluation.tone } : {}),
    renderAudioMode: "guided",
    generatedAudioIntentEnabled: true,
    nativeProviderAudioEnabled: false,
    reviewRequired: true
  };
}

function defaultVisualTextPolicy(): ShortPipelineVisualTextPolicy {
  return {
    schemaVersion: "cinejelly.short-visual-text-policy.v1",
    mode: "no_visible_text",
    allowOnScreenText: false,
    allowCaptions: false,
    allowCtaCards: false,
    allowTextOverlays: false,
    allowLogoText: "reference_asset_only",
    promptConstraint: "No visible text in the generated video: no captions, subtitles, CTA cards, typography, labels, lower thirds, or fake UI text. Logos may appear only as approved/reference product assets."
  };
}

function languageFromText(value: string | undefined): NonNullable<ShortPipelineAudioPolicy["language"]> {
  const normalized = value?.toLowerCase() ?? "";
  if (/\bvi\b|vietnam|tieng viet/.test(normalized)) return "vi";
  if (/\bzh\b|chinese|mandarin|tieng trung/.test(normalized)) return "zh";
  return "en";
}

function languageLabelFor(language: NonNullable<ShortPipelineAudioPolicy["language"]>): NonNullable<ShortPipelineAudioPolicy["languageLabel"]> {
  switch (language) {
    case "vi":
      return "Vietnamese";
    case "zh":
      return "Chinese";
    case "en":
      return "English";
  }
}

function isShortAudioLanguage(value: unknown): value is NonNullable<ShortPipelineAudioPolicy["language"]> {
  return value === "en" || value === "vi" || value === "zh";
}

function audioPolicyPromptLine(audioPolicy: ShortPipelineAudioPolicy): string {
  if (audioPolicy.mode === "off") {
    return "Audio policy: audio is off; do not rely on voiceover, music, captions, or visible text to explain the video.";
  }
  return `Audio policy: generate guided voiceover in ${audioPolicy.languageLabel ?? audioPolicy.language ?? "English"}; visuals must still be understandable without on-screen text.`;
}

function channelVoiceStyle(plan: ShortPipelinePlan): string | undefined {
  return plan.channelStyleProfile?.styleAnchors.find((anchorItem) => anchorItem.kind === "voice")?.instruction;
}

function checkpointInputFromReport(checkpoint: ReviewApprovalCheckpoint): ReviewApprovalCheckpointInput {
  return {
    surface: checkpoint.surface,
    label: checkpoint.label,
    ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
    required: checkpoint.required,
    decision: checkpoint.decision,
    ...(checkpoint.reviewer ? { reviewer: checkpoint.reviewer } : {}),
    ...(checkpoint.reviewedAt ? { reviewedAt: checkpoint.reviewedAt } : {}),
    ...(checkpoint.notes ? { notes: checkpoint.notes } : {}),
    issueCodes: checkpoint.issueCodes,
    evidence: checkpoint.evidence
  };
}

function safeMetadata(metadata: CineJellyProjectRequest["metadata"] | undefined): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    const safeKey = key.replace(/\s+/g, "_").slice(0, 80);
    if (safeKey) {
      safe[safeKey] = String(value).replace(/\s+/g, " ").trim().slice(0, 500);
    }
  }
  return safe;
}

function boundedText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  const suffix = "...";
  return `${text.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

function capRenderPrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  const claimMarker = "\nClaim review inventory:\n";
  const compactNotice = "\nRender handoff prompt compacted to stay within backend admission; keep structured review artifacts as source of truth.\n";
  const claimIndex = prompt.lastIndexOf(claimMarker);
  if (claimIndex > 0) {
    const tail = prompt.slice(claimIndex);
    const headLength = maxLength - tail.length - compactNotice.length;
    if (headLength > 1000) {
      return `${prompt.slice(0, headLength).trimEnd()}${compactNotice}${tail.trimStart()}`;
    }
  }
  return boundedText(prompt, maxLength);
}

function compactLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}
