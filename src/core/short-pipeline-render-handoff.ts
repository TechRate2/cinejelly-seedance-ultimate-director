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
import type { ShortPipelinePlan } from "../types/short-pipeline.js";
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

export function buildShortPipelineRenderHandoff(input: ShortPipelineRenderHandoffInput): ShortPipelineRenderHandoff {
  const plan = input.plan;
  const canUseAsRenderJobHandoff = plan.status !== "blocked" && plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence;
  const captionCues = captionCuesFromPlan(plan);
  const generatedAudioIntents = input.includeGeneratedAudioIntents === false
    ? []
    : generatedAudioIntentsFromPlan(plan);
  const reviewApproval = input.reviewApproval ?? {
    gate: "pre_render" as const,
    checkpoints: plan.reviewApproval.checkpoints.map(checkpointInputFromReport)
  };

  return {
    request: {
      userInput: renderPromptFromPlan(plan),
      settings: {
        durationTargetSeconds: plan.intent.targetDurationSeconds,
        ratio: plan.intent.aspectRatio,
        audioMode: generatedAudioIntents.length > 0 ? "guided" : "native",
        ...input.settings
      },
      ...(input.modelPreferences ? { modelPreferences: input.modelPreferences } : {}),
      ...(input.references ? { references: input.references } : {}),
      metadata: {
        ...safeMetadata(input.metadata),
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
        ...(plan.viralIntelligence.winningConceptId ? { shortViralWinningConceptId: plan.viralIntelligence.winningConceptId } : {}),
        ...(plan.viralIntelligence.referenceVideoPattern ? { shortReferencePatternId: plan.viralIntelligence.referenceVideoPattern.patternId } : {}),
        ...(plan.agentGraph ? { shortAgentGraphRunId: plan.agentGraph.graphRunId, shortAgentGraphStatus: plan.agentGraph.status } : {}),
        ...(plan.seedancePromptPack ? { shortSeedancePromptPackId: plan.seedancePromptPack.promptPackId } : {}),
        ...(plan.selectedTemplate ? { shortPipelineSelectedTemplateId: plan.selectedTemplate.templateId } : {}),
        ...(plan.productBrief ? { productBriefId: plan.productBrief.briefId } : {}),
        ...(plan.brandKitEvaluation ? { brandKitId: plan.brandKitEvaluation.brandKitId } : {})
      },
      captionCues,
      captionOptions: input.captionOptions ?? {
        enabled: true,
        burnIn: true,
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

export function reviewInputCanQueueRender(input: ShortPipelineRenderHandoffReviewInput): boolean {
  return input.checkpoints.length > 0 &&
    input.checkpoints.every((checkpoint) => checkpoint.required === false || checkpoint.decision === "approved");
}

function renderPromptFromPlan(plan: ShortPipelinePlan): string {
  const concept = plan.concepts[0];
  const product = plan.productBrief?.title ? `Product: ${plan.productBrief.title}` : "Product: operator-provided brief";
  const brand = plan.brandKitEvaluation?.brandName ? `Brand: ${plan.brandKitEvaluation.brandName}` : "Brand: not specified";
  const scenes = plan.scenes
    .map((scene) =>
      `${scene.order}. ${scene.role.toUpperCase()} - Goal: ${scene.goal} Visual: ${scene.visualDirection} Narration: ${scene.narration} Caption: ${scene.caption}`
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
  const viralStrategy = viralStrategyFromPlan(plan);
  const viralDirectives = viralDirectivesFromPlan(plan);
  const seedancePromptPack = seedancePromptPackFromPlan(plan);

  return compactLines([
    "Create a short commercial video from this approved agentic short-pipeline plan.",
    "Do not introduce unsupported claims. Preserve scene order and keep captions readable.",
    product,
    brand,
    `Business goal: ${plan.intent.businessGoal}`,
    `Audience: ${plan.intent.audience}`,
    `Platform: ${plan.intent.platform}`,
    `Emotion: ${plan.intent.emotion}`,
    `Target duration: ${plan.intent.targetDurationSeconds} seconds`,
    `Aspect ratio: ${plan.intent.aspectRatio}`,
    template,
    viralStrategy,
    concept ? `Primary concept: ${concept.label}. ${concept.angle} Hook: ${concept.hook}` : "",
    "Scene plan:",
    scenes,
    "Viral scene directives:",
    viralDirectives,
    seedancePromptPack,
    "Claim review inventory:",
    claims
  ]);
}

function viralStrategyFromPlan(plan: ShortPipelinePlan): string {
  const strategy = plan.viralIntelligence.nicheStrategy;
  const score = plan.viralIntelligence.conceptScores.find((item) => item.conceptId === plan.viralIntelligence.winningConceptId);
  const reference = plan.viralIntelligence.referenceVideoPattern;
  const findings = plan.viralIntelligence.findings
    .filter((finding) => finding.severity !== "info")
    .map((finding) => `${finding.code}:${finding.severity}`)
    .join(", ");
  return compactLines([
    `Short viral strategy: niche=${strategy.niche}; audience=${strategy.audience}; platformFocus=${strategy.platformFocus}; creativeMode=${strategy.creativeMode}; buyerIntent=${strategy.buyerIntent}.`,
    `Viewer desire: ${strategy.viewerDesire}. Viewer objection: ${strategy.viewerObjection}.`,
    `Use viral levers: ${strategy.viralLevers.join(", ")}. Avoid: ${strategy.antiPatterns.join("; ")}.`,
    score ? `Winning concept score: ${score.totalScore} (${score.reasons.join("; ")}).` : "",
    reference
      ? `Reference pattern ${reference.patternId}: use structure only: hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; captions=${reference.captionPattern}; CTA=${reference.ctaPattern}. Guardrails: ${reference.originalityGuardrails.join("; ")}.`
      : "",
    findings ? `Open viral findings for review: ${findings}.` : ""
  ]);
}

function viralDirectivesFromPlan(plan: ShortPipelinePlan): string {
  return plan.viralIntelligence.sceneDirectives
    .map((directive) =>
      `${directive.order}. ${directive.role.toUpperCase()} ${directive.recommendedDurationSeconds}s - First frame: ${directive.firstFrameRule} Retention: ${directive.retentionJob} Camera: ${directive.cameraCue} Caption: ${directive.captionCue} Proof: ${directive.proofCue}${directive.ctaCue ? ` CTA: ${directive.ctaCue}` : ""} Checks: ${directive.qualityChecks.join("; ")}`
    )
    .join("\n");
}

function seedancePromptPackFromPlan(plan: ShortPipelinePlan): string {
  const pack = plan.seedancePromptPack;
  if (!pack) {
    return "";
  }
  const shots = pack.shotPrompts
    .map((shot) =>
      `${shot.order}. ${shot.startSecond}-${shot.endSecond}s ${shot.role.toUpperCase()} | First frame: ${shot.firstFrame} | Visual: ${shot.visualPrompt} | Camera: ${shot.camera} | Action: ${shot.action} | Narration: ${shot.dialogueOrNarration} | Caption: ${shot.caption} | Audio: ${shot.audio} | Continuity: ${shot.continuity} | Reference: ${shot.referencePolicy} | Negatives: ${shot.negativeConstraints.join("; ")} | Checks: ${shot.qualityChecks.join("; ")}`
    )
    .join("\n");
  return compactLines([
    "Seedance 2.0 prompt pack:",
    `Prompt pack id: ${pack.promptPackId}`,
    pack.masterPrompt,
    `Audio plan: ${pack.audioPlan}`,
    `Caption plan: ${pack.captionPlan}`,
    `Reference policy: ${pack.referencePolicy}`,
    `Global negative constraints: ${pack.globalNegativeConstraints.join("; ")}`,
    "Time-coded Seedance shots:",
    shots
  ]);
}

function captionCuesFromPlan(plan: ShortPipelinePlan): readonly CaptionCue[] {
  const sceneDuration = Math.max(1, plan.intent.targetDurationSeconds / Math.max(1, plan.scenes.length));
  return plan.scenes.map((scene, index) => {
    const startSecond = roundSeconds(index * sceneDuration);
    const endSecond = roundSeconds(Math.min(plan.intent.targetDurationSeconds, (index + 1) * sceneDuration));
    return {
      startSecond,
      endSecond: endSecond > startSecond ? endSecond : roundSeconds(startSecond + 1),
      text: scene.caption
    };
  });
}

function generatedAudioIntentsFromPlan(plan: ShortPipelinePlan): readonly GeneratedAudioIntent[] {
  const sceneDuration = Math.max(1, plan.intent.targetDurationSeconds / Math.max(1, plan.scenes.length));
  return plan.scenes.map((scene, index) => {
    const startSecond = roundSeconds(index * sceneDuration);
    const endSecond = roundSeconds(Math.min(plan.intent.targetDurationSeconds, (index + 1) * sceneDuration));
    return {
      intentId: createStableId("short_audio", `${plan.planId}:${scene.sceneId}:${scene.order}`),
      kind: "tts_narration",
      prompt: scene.narration,
      startSecond,
      endSecond: endSecond > startSecond ? endSecond : roundSeconds(startSecond + 1),
      durationSeconds: roundSeconds(Math.max(1, endSecond - startSecond)),
      ...(plan.brandKitEvaluation?.language ? { language: plan.brandKitEvaluation.language } : {}),
      ...(plan.brandKitEvaluation?.tone ? { voiceStyle: plan.brandKitEvaluation.tone } : {}),
      volume: 0.9
    };
  });
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

function compactLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}
