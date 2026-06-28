/**
 * Short Director planner.
 * Translates Seedance 2.0 short/multishot grammar and short-form checkpoint behavior
 * into a no-spend CineJelly-owned planning artifact.
 */

import type { ShortChannelStyleProfile } from "../types/short-channel-style.js";
import type {
  ShortDirectorCreativeMode,
  ShortDirectorDurationStrategy,
  ShortDirectorFinding,
  ShortDirectorPlan,
  ShortDirectorPlanStatus,
  ShortDirectorWorkflowMode
} from "../types/short-director.js";
import type {
  BrandKitEvaluation,
  ProductUrlBrief,
  ShortPipelineAudioPolicy,
  ShortPipelineConcept,
  ShortPipelineIntent,
  ShortPipelineScenePlan,
  ShortPipelineVisualTextPolicy,
  WorkflowTemplateSuggestion
} from "../types/short-pipeline.js";
import type { ShortViralIntelligencePlan } from "../types/short-viral-intelligence.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_DIRECTOR_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_DIRECTOR_SOURCE_PATTERN_IDS);

export interface ShortDirectorPlannerInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly userPrompt: string;
  readonly intent: ShortPipelineIntent;
  readonly productBrief?: ProductUrlBrief;
  readonly brandKitEvaluation?: BrandKitEvaluation;
  readonly channelStyleProfile?: ShortChannelStyleProfile;
  readonly selectedTemplate?: WorkflowTemplateSuggestion;
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly viralIntelligence: ShortViralIntelligencePlan;
  readonly audioPolicy: ShortPipelineAudioPolicy;
  readonly visualTextPolicy: ShortPipelineVisualTextPolicy;
}

export class ShortDirectorPlanner {
  public build(input: ShortDirectorPlannerInput): ShortDirectorPlan {
    const durationStrategy = durationStrategyFor(input.intent.targetDurationSeconds);
    const recommendedWorkflowMode = workflowModeFor(input.intent.targetDurationSeconds);
    const creativeMode = creativeModeFor(input);
    const findings = this.findings(input, recommendedWorkflowMode);
    const status = statusFor(findings);
    const targetBeatCount = targetBeatCountFor(input.intent.targetDurationSeconds, input.scenes.length);

    return {
      schemaVersion: "cinejelly.short-director.v1",
      directorId: createStableId(
        "short_director",
        [
          input.projectId,
          input.requestId ?? "",
          input.intent.platform,
          input.intent.targetDurationSeconds,
          recommendedWorkflowMode,
          creativeMode,
          input.scenes.map((scene) => scene.role).join("|")
        ].join(":")
      ),
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      creativeMode,
      recommendedWorkflowMode,
      platformPlan: {
        platform: input.intent.platform,
        aspectRatio: shortAspectRatioFor(input.intent.aspectRatio),
        safeZone: shortAspectRatioFor(input.intent.aspectRatio) === "9:16" ? "universal_vertical_900x1400_center" : "platform_native",
        durationStrategy
      },
      hookPlan: {
        hookWindowSeconds: input.intent.targetDurationSeconds <= 15 ? 1 : 2,
        firstFrameJob: firstFrameJob(input),
        patternInterrupt: patternInterruptFor(input),
        viewerPromise: viewerPromiseFor(input)
      },
      pacingPlan: {
        visualChangeEverySeconds: [1, 3],
        targetBeatCount,
        maxSeedanceShotsPerClip: recommendedWorkflowMode === "single_clip"
          ? Math.max(1, Math.min(3, Math.ceil(input.intent.targetDurationSeconds / 5)))
          : 3,
        recommendedCutLabelPolicy: recommendedWorkflowMode === "single_clip"
          ? "shot_n_labels_for_single_generation"
          : "scene_level_storyboard"
      },
      referencePolicy: {
        roleMapRequiredBeforePrompt: true,
        sourceVideoControlsStructureOnly: true,
        protectedIdentityCopyAllowed: false,
        protectedMusicOrVoiceCopyAllowed: false,
        originalityGuardrails: [
          "Learn pacing, camera grammar, hook structure, and scene order only.",
          "Do not copy faces, voices, brands, music, scripts, logos, or protected scene ownership.",
          "Keep product and channel identity anchored to operator-approved references."
        ]
      },
      reviewPolicy: {
        creativeApprovalRequired: true,
        requiredSurfaces: ["scene", "audio", "caption", "claim"],
        checkpointPolicy: "pause_before_provider_spend",
        captionStrategy: input.visualTextPolicy.allowCaptions
          ? "operator_enabled_postproduction"
          : "review_metadata_only_no_burn_in"
      },
      audioPlan: {
        mode: input.audioPolicy.mode,
        startsImmediately: input.audioPolicy.mode !== "off",
        reviewRequired: true,
        targetEnergy: audioEnergyFor(input)
      },
      findings,
      directorDirectives: directorDirectivesFor(input, recommendedWorkflowMode, creativeMode),
      releaseGateSummary: {
        canUseAsNoSpendDirectorEvidence: true,
        canProceedToShortPlanning: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Short Director found blocked dependencies; repair product, brand, reference, or viral evidence before render planning."
          : "Short Director is planning evidence only; customer traffic requires render, artifact validation, review approval, and business readiness."
      }
    };
  }

  private findings(
    input: ShortDirectorPlannerInput,
    recommendedWorkflowMode: ShortDirectorWorkflowMode
  ): readonly ShortDirectorFinding[] {
    const findings: ShortDirectorFinding[] = [
      {
        code: "hook_window_required",
        severity: "info",
        message: "Short-form planning requires the first visual beat to carry the viewer promise immediately.",
        repair: "Make the first scene a visible result, problem, or pattern interrupt; do not start with a logo or slow intro."
      },
      {
        code: "audio_review_required",
        severity: "info",
        message: "Short-form audio policy requires review because voiceover, tempo, and silence materially affect retention.",
        repair: "Approve audio mode, language, and generated-audio intent before provider spend."
      }
    ];

    if (recommendedWorkflowMode === "single_clip") {
      findings.push({
        code: "single_clip_duration_safe",
        severity: "info",
        message: "The requested duration fits a single Seedance generation budget.",
        repair: "Keep at most three labeled internal shots and one primary action per labeled shot."
      });
    } else {
      findings.push({
        code: "duration_needs_multishot_storyboard",
        severity: "warn",
        message: "The requested duration should use storyboard/multishot planning instead of one dense provider prompt.",
        repair: "Split into scene-level beats and keep each generated clip inside the provider-safe duration budget."
      });
    }

    if (!input.visualTextPolicy.allowCaptions || !input.visualTextPolicy.allowOnScreenText) {
      findings.push({
        code: "no_visible_text_caption_adaptation",
        severity: "info",
        message: "Storyboard-style short-form captions are adapted into review/export metadata because this product policy forbids visible text in video.",
        repair: "Keep captions disabled for burn-in; expose transcript/caption review outside the rendered frame."
      });
    }

    if (input.viralIntelligence.referenceVideoPattern?.safetyStatus === "review_required") {
      findings.push({
        code: "reference_pattern_requires_originality_guardrail",
        severity: "warn",
        message: "Reference-video learning needs originality review before provider spend.",
        repair: "Approve structure-only learning and reject any request to copy protected identity, script, music, brand, or voice."
      });
    }

    if (input.productBrief?.status === "review_required" || input.brandKitEvaluation?.status === "review_required") {
      findings.push({
        code: "product_or_brand_review_required",
        severity: "warn",
        message: "Product or brand evidence requires human review before the short can be rendered.",
        repair: "Approve product facts, claims, brand tone, and asset rights."
      });
    }

    if (
      input.productBrief?.status === "blocked" ||
      input.brandKitEvaluation?.status === "blocked" ||
      input.viralIntelligence.status === "blocked"
    ) {
      findings.push({
        code: "blocked_dependency",
        severity: "block",
        message: "A product, brand, or viral-intelligence dependency is blocked.",
        repair: "Repair blocked dependencies before using the short plan for provider spend."
      });
    }

    return findings;
  }
}

function workflowModeFor(durationSeconds: number): ShortDirectorWorkflowMode {
  return durationSeconds <= 15 ? "single_clip" : "storyboard_multishot";
}

function shortAspectRatioFor(aspectRatio: string): "9:16" | "16:9" {
  return aspectRatio === "16:9" ? "16:9" : "9:16";
}

function durationStrategyFor(durationSeconds: number): ShortDirectorDurationStrategy {
  if (durationSeconds <= 15) return "completion_first_15s";
  if (durationSeconds <= 30) return "engagement_30s";
  return "flexible_60s";
}

function creativeModeFor(input: ShortDirectorPlannerInput): ShortDirectorCreativeMode {
  const text = `${input.userPrompt} ${input.selectedTemplate?.category ?? ""} ${input.viralIntelligence.nicheStrategy.creativeMode}`.toLowerCase();
  if (text.includes("ugc")) return "ugc_ad";
  if (text.includes("review") || text.includes("testimonial")) return "product_review";
  if (text.includes("demo") || text.includes("proof")) return "product_demo";
  if (text.includes("cinematic") || text.includes("trailer")) return "cinematic_reveal";
  if (text.includes("explain") || text.includes("tutorial") || text.includes("education")) return "explainer";
  return "native_social_story";
}

function targetBeatCountFor(durationSeconds: number, sceneCount: number): number {
  const cadenceBeatCount = Math.max(1, Math.round(durationSeconds / 3));
  return Math.max(sceneCount, Math.min(20, cadenceBeatCount));
}

function firstFrameJob(input: ShortDirectorPlannerInput): string {
  const product = input.productBrief?.title ?? "the hero subject";
  if (input.intent.businessGoal.toLowerCase().includes("review")) {
    return `Open with a native creator-facing proof moment around ${product}.`;
  }
  if (input.intent.businessGoal.toLowerCase().includes("ad")) {
    return `Open with the problem/result contrast and keep ${product} visible immediately.`;
  }
  return `Open with a visually specific promise around ${product}.`;
}

function patternInterruptFor(input: ShortDirectorPlannerInput): string {
  const mode = input.viralIntelligence.nicheStrategy.creativeMode;
  if (mode.includes("proof")) return "show proof before explanation";
  if (mode.includes("ugc")) return "creator action starts on frame one";
  if (mode.includes("cinematic")) return "macro reveal or movement-first visual interruption";
  return "movement-first native social beat";
}

function viewerPromiseFor(input: ShortDirectorPlannerInput): string {
  const product = input.productBrief?.title ?? input.intent.businessGoal;
  const desire = input.viralIntelligence.nicheStrategy.viewerDesire;
  return `${product}: ${desire}`.slice(0, 180);
}

function audioEnergyFor(input: ShortDirectorPlannerInput): string {
  if (input.audioPolicy.mode === "off") return "silent visual-first short with no generated voiceover";
  if (input.intent.targetDurationSeconds <= 15) return "immediate high-clarity voiceover, no dead air";
  return "fast but intelligible voiceover with energy matched to scene changes";
}

function directorDirectivesFor(
  input: ShortDirectorPlannerInput,
  workflowMode: ShortDirectorWorkflowMode,
  creativeMode: ShortDirectorCreativeMode
): readonly string[] {
  return [
    `Keep Short pipeline separate; optimize for ${creativeMode}, not long-form story pacing.`,
    workflowMode === "single_clip"
      ? "Use one provider clip budget with explicit Shot N labels only when internal cuts are needed."
      : "Use storyboard/multishot planning; each scene should carry one retention job and one visual action.",
    "Role-map all references before prompt prose and keep source-video references structure-only unless explicitly authorized.",
    input.visualTextPolicy.allowOnScreenText
      ? "If visible text is later enabled, keep it inside platform safe zones."
      : "Do not render visible text, CTA cards, or burned-in captions; keep text/caption evidence outside the frame.",
    "Pause before provider spend until scene, audio, caption/no-visible-text, and claim checkpoints are reviewed."
  ];
}

function statusFor(findings: readonly ShortDirectorFinding[]): ShortDirectorPlanStatus {
  if (findings.some((finding) => finding.severity === "block")) return "blocked";
  if (findings.some((finding) => finding.severity === "warn")) return "review_required";
  return "ready";
}
