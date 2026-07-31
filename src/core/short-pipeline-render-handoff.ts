/**
 * Short-pipeline render handoff.
 * Converts a reviewable short plan into the normal async render-job contract
 * without bypassing admission, quota, review, cost, or artifact gates.
 */

import { createHash } from "node:crypto";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { CaptionCue, CaptionOptions } from "../types/caption.js";
import type { GeneratedAudioIntent } from "../types/audio.js";
import type { PromptReference } from "../types/prompt.js";
import type {
  ReviewApprovalCheckpoint,
  ReviewApprovalCheckpointInput,
  ReviewApprovalGate
} from "../types/review-approval.js";
import type {
  ShortPipelineAudioPolicy,
  ShortPipelineAudioPolicyInput,
  ShortMediaReferenceInput,
  ShortMediaReferencePlan,
  ShortPipelinePlan,
  ShortPipelineVisualTextPolicy
} from "../types/short-pipeline.js";
import { buildCaptionCuesFromAudioScript } from "./subtitle-caption-builder.js";
import { SHORT_PROMPT_CORPUS_COVERAGE } from "./short-prompt-pattern-corpus.js";
import { SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE } from "./short-platform-template-corpus.js";
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
  readonly mediaReferenceInputs?: readonly ShortMediaReferenceInput[];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly captionOptions?: CaptionOptions;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly audio?: ShortPipelineAudioPolicyInput;
  /**
   * Subtitle switch. "narration_subtitles" derives perfectly-synced caption cues from the
   * plan's own TTS audio script (zero transcription cost) and enables burn-in; the default
   * "none" keeps the historical no-visible-text behavior. Caption evidence still passes
   * the normal caption review checkpoint before render.
   */
  readonly captionPreference?: "narration_subtitles" | "none";
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
    /**
     * True when the plan is render-ready in every respect EXCEPT the visual-bible asset gate — i.e.
     * the ONLY thing stopping the handoff is "reference/bible assets not pre-approved". The self-serve
     * customer render path may proceed on this because the director's keyframe-first stage generates
     * those portraits/keyframes DURING render; the advanced operator workflow still treats it as a
     * block. A genuine plan block (unsafe/conflicting evidence) is NOT this and always stops render.
     */
    readonly blockedOnlyByVisualBibleAssets: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}

const RENDER_PROMPT_MAX_CHARS = 23_500;
const SHORT_RENDER_METADATA_MAX_ENTRIES = 50;
const UNSAFE_MEDIA_REFERENCE_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;
const UNSAFE_QUERY_PATTERN = /token|signature|sig|key|apikey|api_key|secret|password|auth|credential|expires|policy/i;
const SHORT_RENDER_METADATA_PRIORITY_KEYS = [
  "workspaceId",
  "smoke",
  "graphNodeId",
  "projectId",
  "requestId",
  "workflowMode",
  "renderMode",
  "videoMode",
  "mode",
  "shortPipelineRecommendedWorkflowMode",
  "shortVideoPipeSelectedMode",
  "shortDirectorPlanId",
  "shortPipelinePlanId",
  "shortPipelineStatus",
  "shortPipelineReviewStatus",
  "shortPipelineSource",
  "shortViralIntelligenceId",
  // The two keys that decide HOW THE VIDEO IS SHOT. They must sit high in this list, not be left to
  // the alphabetical spillover below: the priority list is longer than the entry cap, so anything
  // that falls through to the spillover is competing for the handful of remaining slots. Measured
  // before they were listed here: 4 out of 4 realistic briefs produced exactly 50 entries with
  // BOTH keys missing, every time. Losing shortViralCreativeMode silently swaps the shot planner
  // onto shortDirectorCreativeMode — a DIFFERENT vocabulary whose values match no palette — so a
  // phone-selfie video was framed with the full crewed camera rotation and the render prompt asked
  // for a camera standing behind someone filming themselves. Losing shortViralNiche silently drops
  // the niche-DNA section from the compiled prompt.
  "shortViralCreativeMode",
  "shortViralNiche",
  "shortViralPlatformFocus",
  "shortCreativePatternLearningId",
  "shortAudienceNicheTrendPosture",
  "shortCommercialReadinessId",
  "shortCommercialReadinessStatus",
  "shortAudioRenderMode",
  "shortAudioNativeProviderEnabled",
  "shortAudioExternalScriptEnabled",
  "shortCrawlerPolicyStatus",
  "shortOutcomeMemoryStatus",
  "shortOnScreenTextAllowed",
  "shortCaptionBurnInAllowed",
  "shortCtaCardsAllowed",
  "shortSeedanceRoutingId",
  "shortSeedanceProviderMode",
  "shortSeedancePreferredTier",
  "shortSeedanceResolution",
  "shortReferenceRemakeBlueprintId",
  "shortReferenceRemakeTrendIntakeMode",
  "shortVisualBiblePlanId",
  "shortVisualBiblePipe",
  "shortVisualBibleBlocksRender",
  "shortVideoPipePlanId",
  "shortVideoPipeSelectedBackendPipe",
  "shortVideoPipeVisualBibleAlignment",
  "shortVideoPipeDurationMaxSeconds",
  "shortVideoPipeSupportsLongSequence",
  "shortVideoPipeTargetWithinDurationRange",
  "shortAgentGraphRunId",
  "shortAgentGraphStatus",
  "shortSeedancePromptPackId",
  "shortChannelStyleProfileId",
  "productBriefId",
  "brandKitId",
  "shortSeedanceBitrateMode",
  "shortSeedanceSuperResolution"
] as const;

export function buildShortPipelineRenderHandoff(input: ShortPipelineRenderHandoffInput): ShortPipelineRenderHandoff {
  const plan = input.plan;
  const visualBibleBlocksRender = plan.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved;
  const renderReadyExceptVisualBible = plan.status !== "blocked" &&
    plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence;
  const canUseAsRenderJobHandoff = renderReadyExceptVisualBible && !visualBibleBlocksRender;
  // Render-ready in every respect except the (self-generatable) visual-bible asset gate.
  const blockedOnlyByVisualBibleAssets = renderReadyExceptVisualBible && visualBibleBlocksRender;
  const visualTextPolicy = plan.visualTextPolicy ?? defaultVisualTextPolicy();
  const audioPolicy = resolveAudioPolicy(input.audio, plan.audioPolicy ?? defaultAudioPolicyForPlan(plan));
  const captionCues: readonly CaptionCue[] =
    input.captionPreference === "narration_subtitles"
      ? narrationCaptionCuesForPlan(plan)
      : [];
  const captionsEnabled = captionCues.length > 0;
  const generatedAudioIntents = audioPolicy.generatedAudioIntentEnabled && input.includeGeneratedAudioIntents !== false
    ? generatedAudioIntentsFromPlan(plan, audioPolicy)
    : [];
  const reviewApproval = input.reviewApproval ?? {
    gate: "pre_render" as const,
    checkpoints: plan.reviewApproval.checkpoints.map(checkpointInputFromReport)
  };
  const workflowMetadata = shortWorkflowMetadata(plan, input.metadata);
  const references = mergeShortHandoffReferences(plan, input.references, input.mediaReferenceInputs);
  const requestedAudioMode = input.settings?.audioMode ?? audioPolicy.renderAudioMode ?? plan.seedanceRouting.generatedAudioMode;
  const shortAudioMode = requestedAudioMode;
  const selectedPipe = selectedVideoPipeOption(plan);
  const withinSelectedPipeDurationRange = selectedPipe
    ? plan.intent.targetDurationSeconds >= selectedPipe.durationSupport.minSeconds &&
      plan.intent.targetDurationSeconds <= selectedPipe.durationSupport.maxSeconds
    : false;

  return {
    request: {
      userInput: renderPromptFromPlan(plan, audioPolicy, visualTextPolicy),
      settings: {
        durationTargetSeconds: plan.intent.targetDurationSeconds,
        ratio: plan.intent.aspectRatio,
        tier: plan.seedanceRouting.preferredTier,
        resolution: plan.seedanceRouting.resolution,
        bitrateMode: plan.seedanceRouting.bitrateMode,
        returnLastFrame: plan.seedanceRouting.returnLastFrame,
        // Customer renders default to single-pass (economy): no extra candidate/repair passes to
        // eat cost, which keeps clips competitively cheap and makes the metered charge equal the
        // real render. Callers can still override to a pricier best-of-N quality (billed for it).
        qualityMode: "economy",
        ...input.settings,
        audioMode: shortAudioMode
      },
      ...(input.modelPreferences ? { modelPreferences: input.modelPreferences } : {}),
      ...(references.length > 0 ? { references } : {}),
      metadata: compactShortRenderMetadata({
        ...safeMetadata(input.metadata),
        ...workflowMetadata,
        projectId: plan.projectId,
        ...(plan.requestId ? { requestId: plan.requestId } : {}),
        shortPipelinePlanId: plan.planId,
        shortPipelineStatus: plan.status,
        shortPipelineTemplatePolicy: plan.templatePolicy,
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
        shortAudioRenderMode: shortAudioMode,
        shortAudioNativeProviderEnabled: String(audioPolicy.nativeProviderAudioEnabled),
        shortAudioExternalScriptEnabled: String(audioPolicy.externalAudioScriptEnabled),
        ...(audioPolicy.language ? { shortAudioLanguage: audioPolicy.language } : {}),
        shortVisualTextPolicy: visualTextPolicy.mode,
        shortOnScreenTextAllowed: String(visualTextPolicy.allowOnScreenText),
        shortCaptionBurnInAllowed: String(visualTextPolicy.allowCaptions),
        shortCtaCardsAllowed: String(visualTextPolicy.allowCtaCards),
        shortCrawlerPolicyStatus: plan.commercialReadiness.crawlerPolicy.status,
        shortOutcomeMemoryStatus: plan.commercialReadiness.outcomeMemory.status,
        shortReferenceAnalysisStatus: plan.commercialReadiness.referenceAnalysis.status,
        shortSeedanceRoutingId: plan.seedanceRouting.routingId,
        shortSeedanceProviderMode: plan.seedanceRouting.recommendedProviderMode,
        shortSeedancePreferredTier: plan.seedanceRouting.preferredTier,
        shortSeedanceResolution: plan.seedanceRouting.resolution,
        shortSeedanceBitrateMode: plan.seedanceRouting.bitrateMode,
        shortSeedanceSuperResolution: String(plan.seedanceRouting.superResolution),
        shortSeedanceRoutingSummary: [
          plan.seedanceRouting.modelAlias,
          plan.seedanceRouting.promptRecipe.name,
          `lastFrame=${plan.seedanceRouting.returnLastFrame}`,
          `bitrate=${plan.seedanceRouting.bitrateMode}`,
          `sr=${plan.seedanceRouting.superResolution}`,
          `tags=${plan.seedanceRouting.referenceTags.length}`,
          `media=${plan.mediaReferencePlan.length}`,
          `handoff=${plan.mediaReferencePlan.filter((reference) => reference.includeInProviderHandoff).length}`
        ].join("|"),
        ...(plan.channelStyleProfile ? {
          shortChannelStyleProfileId: plan.channelStyleProfile.profileId,
          shortChannelStyleStatus: plan.channelStyleProfile.status,
          shortChannelStyleAnchorCount: String(plan.channelStyleProfile.styleAnchors.length)
        } : {}),
        ...(plan.viralIntelligence.winningConceptId ? { shortViralWinningConceptId: plan.viralIntelligence.winningConceptId } : {}),
        ...(plan.viralIntelligence.referenceVideoPattern ? { shortReferencePatternId: plan.viralIntelligence.referenceVideoPattern.patternId } : {}),
        ...(plan.referenceRemakeBlueprint ? {
          shortReferenceRemakeBlueprintId: plan.referenceRemakeBlueprint.blueprintId,
          shortReferenceRemakeMode: plan.referenceRemakeBlueprint.mode,
          shortReferenceRemakeStatus: plan.referenceRemakeBlueprint.status,
          shortReferenceRemakeFidelityTarget: plan.referenceRemakeBlueprint.fidelityTarget,
          shortReferenceRemakeTrendIntakeMode: plan.referenceRemakeBlueprint.trendVideoIntakeMode,
          shortReferenceRemakeAdherenceTargetCount: String(plan.referenceRemakeBlueprint.adherenceTargets.length),
          shortReferenceRemakeBeatMapCount: String(plan.referenceRemakeBlueprint.sourceBeatMap.length)
        } : {}),
        shortVisualBiblePlanId: plan.visualBiblePlan.planId,
        shortVisualBibleStatus: plan.visualBiblePlan.status,
        shortVisualBibleMode: plan.visualBiblePlan.requestedMode,
        shortVisualBiblePipe: plan.visualBiblePlan.recommendedPipe,
        shortVisualBibleDurationBand: plan.visualBiblePlan.durationBand,
        shortVisualBibleAssetPlanCount: String(plan.visualBiblePlan.assetPlans.length),
        shortVisualBibleBoardCount: String(plan.visualBiblePlan.sequencePlan.boardCount),
        shortVisualBibleTargetClipCount: String(plan.visualBiblePlan.sequencePlan.targetClipCount),
        shortVisualBibleExecutionMode: plan.visualBiblePlan.executionBlueprint.mode,
        shortVisualBibleClipStrategy: plan.visualBiblePlan.executionBlueprint.clipExecutionStrategy,
        shortVisualBibleSeedanceMode: plan.visualBiblePlan.executionBlueprint.seedanceSubmissionMode,
        shortVisualBibleCoverageRule: plan.visualBiblePlan.executionBlueprint.durationCoverage.coverageRule,
        shortVisualBibleBindingOrder: plan.visualBiblePlan.executionBlueprint.referenceTagBindingOrder.join("|").slice(0, 500),
        shortVisualBibleBlocksRender: String(plan.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved),
        shortVideoPipePlanId: plan.videoPipePlan.pipePlanId,
        shortVideoPipeSelectedMode: plan.videoPipePlan.selectedMode,
        shortVideoPipeSelectedBackendPipe: plan.videoPipePlan.selectedBackendPipe,
        shortVideoPipeSelectionReasons: plan.videoPipePlan.selectionReasonCodes.join("|").slice(0, 500),
        shortVideoPipeVisualBibleAlignment: plan.videoPipePlan.visualBibleAlignment.status,
        shortVideoPipeOptionCount: String(plan.videoPipePlan.pipeOptions.length),
        ...(selectedPipe ? {
          shortVideoPipeDurationMinSeconds: String(selectedPipe.durationSupport.minSeconds),
          shortVideoPipeDurationMaxSeconds: String(selectedPipe.durationSupport.maxSeconds),
          shortVideoPipeIdealDurationRange: selectedPipe.durationSupport.idealRangeSeconds.join("-"),
          shortVideoPipeSupportsLongSequence: String(selectedPipe.durationSupport.supportsLongSequence),
          shortVideoPipeTargetWithinDurationRange: String(withinSelectedPipeDurationRange)
        } : {}),
        ...(plan.agentGraph ? { shortAgentGraphRunId: plan.agentGraph.graphRunId, shortAgentGraphStatus: plan.agentGraph.status } : {}),
        ...(plan.seedancePromptPack ? { shortSeedancePromptPackId: plan.seedancePromptPack.promptPackId } : {}),
        ...(captionsEnabled ? { shortCaptionMode: "narration_subtitles" } : {}),
        ...(plan.selectedTemplate ? { shortPipelineSelectedTemplateId: plan.selectedTemplate.templateId } : {}),
        ...(plan.productBrief ? { productBriefId: plan.productBrief.briefId } : {}),
        ...(plan.brandKitEvaluation ? { brandKitId: plan.brandKitEvaluation.brandKitId } : {})
      }),
      captionCues,
      captionOptions: {
        ...(input.captionOptions ?? {}),
        enabled: captionsEnabled,
        burnIn: captionsEnabled,
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
      blockedOnlyByVisualBibleAssets,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: canUseAsRenderJobHandoff
        ? "Short-pipeline handoff can create an async render job, but customer traffic still requires render success, artifact validation, manual media review, deployment evidence, and business-readiness approval."
        : visualBibleBlocksRender
          ? "Short-pipeline plan requires Visual Bible/reference assets to be generated or approved before render handoff can be used for provider spend."
          : "Short-pipeline plan is blocked and cannot be handed to render until unsafe or conflicting evidence is corrected."
    }
  };
}

function selectedVideoPipeOption(plan: ShortPipelinePlan): ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number] | undefined {
  return plan.videoPipePlan.pipeOptions.find((pipe) => pipe.mode === plan.videoPipePlan.selectedMode);
}

function shortWorkflowMetadata(
  plan: ShortPipelinePlan,
  metadata: CineJellyProjectRequest["metadata"] | undefined
): Record<string, string> {
  const provided = safeMetadata(metadata);
  const hasExplicitMode = Boolean(provided.workflowMode || provided.renderMode || provided.videoMode || provided.mode);
  const recommendedMode = plan.directorPlan.recommendedWorkflowMode;
  const singleClipRecommended = recommendedMode === "single_clip";
  const selectedPipe = plan.videoPipePlan.selectedMode;
  return {
    shortPipelineRecommendedWorkflowMode: recommendedMode,
    shortVideoPipeSelectedMode: selectedPipe,
    shortDirectorPlanId: plan.directorPlan.directorId,
    shortDirectorStatus: plan.directorPlan.status,
    shortDirectorCreativeMode: plan.directorPlan.creativeMode,
    shortDirectorHookWindowSeconds: String(plan.directorPlan.hookPlan.hookWindowSeconds),
    shortDirectorTargetBeatCount: String(plan.directorPlan.pacingPlan.targetBeatCount),
    ...(hasExplicitMode
      ? {}
        : plan.referenceRemakeBlueprint
          ? {
              workflowMode: "source_video",
              renderMode: "video_remake"
            }
          : selectedPipe === "production_bible"
            ? {
                workflowMode: "sequence",
                renderMode: "production_bible"
              }
          : selectedPipe === "product_kol_ugc"
            ? {
                workflowMode: "reference_locked",
                renderMode: "product_kol_ugc"
              }
          : singleClipRecommended && selectedPipe === "smart_short"
            ? {
                workflowMode: "single",
                renderMode: "single_clip"
              }
          : selectedPipe === "storyboard_multishot"
            ? {
                workflowMode: "storyboard",
                renderMode: "storyboard_multishot"
              }
          : plan.visualBiblePlan.recommendedPipe === "reference_board_pipe" || plan.visualBiblePlan.recommendedPipe === "storyboard_board_pipe"
            ? {
                workflowMode: "reference_locked",
                renderMode: "visual_bible"
              }
        : {
            workflowMode: "storyboard",
            renderMode: "storyboard_multishot"
          })
  };
}

function mergeShortHandoffReferences(
  plan: ShortPipelinePlan,
  providedReferences: CineJellyProjectRequest["references"] | undefined,
  mediaReferenceInputs: readonly ShortMediaReferenceInput[] | undefined
): readonly PromptReference[] {
  const plannedReferences = plan.mediaReferencePlan
    .flatMap((reference): readonly PromptReference[] => {
      const providerUri = reference.providerUri ?? (
        reference.providerAssetId ? `asset://${reference.providerAssetId}` : providerUriFromRawMediaInput(reference, mediaReferenceInputs)
      );
      if (!reference.includeInProviderHandoff || !providerUri) {
        return [];
      }
      return [{
        role: reference.promptRole,
        label: reference.label,
        priority: reference.priority,
        providerReference: {
          kind: reference.providerKind,
          uri: providerUri,
          role: reference.promptRole,
          ...(reference.providerAssetId ? { providerAssetId: reference.providerAssetId } : {}),
          label: reference.label
        },
        selection: {
          authorized: true
        }
      }];
    });
  const deduped = new Map<string, PromptReference>();
  for (const reference of [...plannedReferences, ...(providedReferences ?? [])]) {
    const providerReference = reference.providerReference;
    const key = [
      reference.role,
      reference.label,
      providerReference.kind,
      providerReference.providerAssetId ?? providerReference.uri
    ].join(":");
    if (!deduped.has(key)) {
      deduped.set(key, reference);
    }
  }
  return [...deduped.values()];
}

function providerUriFromRawMediaInput(
  reference: ShortMediaReferencePlan,
  mediaReferenceInputs: readonly ShortMediaReferenceInput[] | undefined
): string | undefined {
  if (!mediaReferenceInputs?.length || reference.uriPolicy !== "clean_https_hashed" || !reference.uriSha256) {
    return undefined;
  }
  for (const rawReference of mediaReferenceInputs.slice(0, 12)) {
    const evidence = cleanRawMediaProviderUri(rawReference.uri);
    if (
      evidence.uriSha256 === reference.uriSha256 &&
      rawMediaPromptRole(rawReference.role) === reference.promptRole &&
      rawMediaProviderKind(rawReference) === reference.providerKind &&
      evidence.providerUri
    ) {
      return evidence.providerUri;
    }
  }
  return undefined;
}

function cleanRawMediaProviderUri(uri: string): { readonly uriSha256?: string; readonly providerUri?: string } {
  const cleaned = boundedText(uri, 600);
  if (!cleaned || UNSAFE_MEDIA_REFERENCE_PATTERN.test(cleaned)) {
    return {};
  }
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return {};
  }
  if (parsed.protocol !== "https:" || isLocalHost(parsed.hostname) || parsed.username || parsed.password || parsed.hash) {
    return {};
  }
  if ([...parsed.searchParams.entries()].some(([key, value]) => UNSAFE_QUERY_PATTERN.test(key) || UNSAFE_QUERY_PATTERN.test(value))) {
    return {};
  }
  return {
    uriSha256: sha256(cleaned),
    providerUri: parsed.toString()
  };
}

function rawMediaPromptRole(role: ShortMediaReferenceInput["role"]): ShortMediaReferencePlan["promptRole"] {
  switch (role) {
    case "kol":
    case "creator":
      return "identity";
    case "product":
      return "product";
    case "wardrobe":
    case "clothing":
      return "wardrobe";
    case "background":
    case "environment":
      return "environment";
    case "first_frame":
      return "first_frame";
    case "last_frame":
      return "last_frame";
    case "style":
      return "style";
    case "motion":
      return "motion";
    case "camera":
      return "camera";
    case "audio":
      return "audio_tempo";
    case "source_video":
      return "source_video_structure";
  }
}

function rawMediaProviderKind(reference: ShortMediaReferenceInput): ShortMediaReferencePlan["providerKind"] {
  const role = rawMediaPromptRole(reference.role);
  if (reference.kind === "audio" || role === "audio_tempo") {
    return "audio";
  }
  if (
    reference.kind === "video" ||
    role === "motion" ||
    role === "camera" ||
    role === "source_video_structure" ||
    /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(reference.uri)
  ) {
    return "video";
  }
  if (role === "first_frame" || role === "last_frame") {
    return role;
  }
  if (role === "identity" || role === "product" || role === "environment" || role === "style") {
    return role;
  }
  return "image";
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
    priorityRenderHandoffSummaryFromPlan(plan, compact),
    product,
    brand,
    `Business goal: ${plan.intent.businessGoal}`,
    `Audience: ${plan.intent.audience}`,
    `Platform: ${plan.intent.platform}`,
    `Emotion: ${plan.intent.emotion}`,
    `Target duration: ${plan.intent.targetDurationSeconds} seconds`,
    `Aspect ratio: ${plan.intent.aspectRatio}`,
    durationArcFromPlan(plan, compact),
    seamlessEditContractFromPlan(plan, compact),
    visualBibleFromPlan(plan, compact),
    template,
    concept ? `Primary concept: ${concept.label}. ${concept.angle} Hook: ${concept.hook}` : "",
    "Scene plan:",
    scenes,
    mediaReferencesFromPlan(plan, compact),
    videoPipePlanFromPlan(plan, compact),
    seedanceRoutingFromPlan(plan, compact),
    viralStrategyFromPlan(plan, compact),
    referenceRemakeBlueprintFromPlan(plan, compact),
    "Viral scene directives:",
    viralDirectivesFromPlan(plan, compact),
    seedancePromptPackFromPlan(plan, compact),
    channelStyleFromPlan(plan, compact),
    "Claim review inventory:",
    claims
  ]);
  const fullPrompt = renderPrompt(false);
  return fullPrompt.length <= RENDER_PROMPT_MAX_CHARS
    ? fullPrompt
    : capRenderPrompt(renderPrompt(true), RENDER_PROMPT_MAX_CHARS);
}

function priorityRenderHandoffSummaryFromPlan(plan: ShortPipelinePlan, compact = false): string {
  if (!compact) {
    return "";
  }
  const strategy = plan.viralIntelligence.nicheStrategy;
  const selectedIdea = selectedShortCreativeIdea(plan);
  const visualBible = plan.visualBiblePlan;
  const promptPack = plan.seedancePromptPack;
  const firstTransitionBridge = promptPack?.shotPrompts.find((shot) => Boolean(shot.transitionBridge))?.transitionBridge;
  const visualBibleImagePacks = visualBible.status === "not_needed"
    ? ""
    : visualBible.assetPlans
        .slice(0, 2)
        .map((asset) => {
          const pack = asset.imagePromptPack;
          return `${asset.role}: layout=${pack.layout}; output=${pack.outputPolicy}; Image prompt: ${boundedText(pack.prompt, 180)}; Negative prompt: ${boundedText(pack.negativePrompt, 120)}; Seedance binding: ${boundedText(pack.seedanceBindingInstruction, 120)}`;
        })
        .join(" | ");
  const scenes = plan.scenes
    .slice(0, 6)
    .map((scene) => `${scene.order}:${scene.role}:${boundedText(scene.goal, 90)}`)
    .join(" | ");
  const sceneDirectives = plan.viralIntelligence.sceneDirectives
    .slice(0, 6)
    .map((directive) =>
      `${directive.order}:${directive.role}:${directive.recommendedDurationSeconds}s first=${boundedText(directive.firstFrameRule, 90)} proof=${boundedText(directive.proofCue, 90)}`
    )
    .join(" | ");
  const pipeOptions = plan.videoPipePlan.pipeOptions
    .slice(0, 5)
    .map((option) => `${option.mode}/${option.backendPipe}/${option.seedanceMode}/${option.preferredTier}`)
    .join(" | ");
  const promptCorpusPatterns = plan.viralIntelligence.creativePatternLearning.patterns
    .filter((pattern) => pattern.source === "seedance_prompt_corpus")
    .slice(0, 3)
    .map((pattern) => pattern.label)
    .join(" | ");
  const platformPatterns = plan.viralIntelligence.creativePatternLearning.patterns
    .filter((pattern) => pattern.source === "platform_template_corpus")
    .slice(0, 3)
    .map((pattern) => pattern.label)
    .join(" | ");
  const reference = plan.viralIntelligence.referenceVideoPattern;
  const blueprint = plan.referenceRemakeBlueprint;
  return compactLines([
    "Priority render handoff summary: preserve these contracts if later detail is compacted.",
    `Scene plan: ${scenes}.`,
    `Video pipe plan: id=${plan.videoPipePlan.pipePlanId}; selected=${plan.videoPipePlan.selectedMode}; backendPipe=${plan.videoPipePlan.selectedBackendPipe}.`,
    `Video pipe alignment: visualBiblePipe=${plan.videoPipePlan.visualBibleAlignment.visualBibleRecommendedPipe}; status=${plan.videoPipePlan.visualBibleAlignment.status}; reasons=${plan.videoPipePlan.selectionReasonCodes.join(", ") || "none"}.`,
    `Available video pipes: ${pipeOptions}.`,
    `Seedance routing: provider=${plan.seedanceRouting.provider}; mode=${plan.seedanceRouting.recommendedProviderMode}; tier=${plan.seedanceRouting.preferredTier}; model=${plan.seedanceRouting.modelAlias}; resolution=${plan.seedanceRouting.resolution}; returnLastFrame=${plan.seedanceRouting.returnLastFrame}.`,
    visualBibleImagePacks ? `Visual Bible image prompt packs: ${visualBibleImagePacks}.` : "",
    `Short viral strategy: niche=${strategy.niche}; audience=${strategy.audience}; platformFocus=${strategy.platformFocus}; creativeMode=${strategy.creativeMode}; buyerIntent=${strategy.buyerIntent}.`,
    `Audience intelligence: presentation=${strategy.audienceNicheIntelligence.userPresentationStyle}; trendPosture=${strategy.audienceNicheIntelligence.trendPosture}; funnelStage=${strategy.audienceNicheIntelligence.funnelStage}.`,
    `Idea seeds: ${strategy.audienceNicheIntelligence.ideaSeeds.slice(0, 3).map((seed) => boundedText(seed, 120)).join(" | ")}.`,
    `Creative pattern learning: patterns=${plan.viralIntelligence.creativePatternLearning.patternCount}; candidates=${plan.viralIntelligence.creativePatternLearning.candidateCount}; selectedIdea=${selectedIdea?.ideaId ?? "none"}; selectedPattern=${selectedIdea?.patternId ?? "none"}.`,
    promptCorpusPatterns ? `Prompt corpus guidance: distilled Seedance/ad/UGC pattern DNA (${promptCorpusPatterns}); coverage=declaredPrompts:${SHORT_PROMPT_CORPUS_COVERAGE.declaredPromptCount}, runtimePatterns:${SHORT_PROMPT_CORPUS_COVERAGE.runtimePatternCount}, taxonomyFamilies:${SHORT_PROMPT_CORPUS_COVERAGE.taxonomyFamilyCount}; do not reproduce upstream prompt wording.` : "",
    platformPatterns ? `Platform template guidance: distilled public/licensed workflow structure (${platformPatterns}); coverage=archetypes:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.templateArchetypeCount}, nicheFamilies:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.nicheFamilyCount}, patternMatrix:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.declaredPatternMatrixCount}; do not reproduce third-party template wording or scrape proprietary UI.` : "",
    selectedIdea
      ? `Selected idea: ${selectedIdea.label}. Hook: ${boundedText(selectedIdea.hook, 180)} Proof: ${boundedText(selectedIdea.proofPlan, 180)} KOL/creator: ${boundedText(selectedIdea.creatorOrKolDirection, 150)}.`
      : "",
    reference
      ? `Reference pattern ${reference.patternId}: use structure only: hook=${boundedText(reference.hookPattern, 90)}; pacing=${boundedText(reference.pacingPattern, 90)}; camera=${boundedText(reference.cameraPattern, 90)}; payoff=${boundedText(reference.ctaPattern, 90)}; Guardrails: ${reference.originalityGuardrails.slice(0, 2).join("; ")}.`
      : "",
    blueprint ? `Video Remake blueprint: id=${blueprint.blueprintId}; mode=${blueprint.mode}; status=${blueprint.status}; fidelity=${blueprint.fidelityTarget}; sourceSafety=${blueprint.sourceSafetyStatus}.` : "",
    blueprint ? `Video Remake replacement slots: ${blueprint.replacementSlots.slice(0, 5).join(", ")}.` : "",
    blueprint ? `Video Remake adherence targets: ${blueprint.adherenceTargets.slice(0, 4).map((item) => boundedText(item, 120)).join(" | ")}.` : "",
    blueprint ? `Video Remake source beat map: ${blueprint.sourceBeatMap.slice(0, 4).map((item) => boundedText(item, 120)).join(" | ")}.` : "",
    `Viral scene directives: ${sceneDirectives}.`,
    promptPack ? "Seedance 2.0 prompt pack:" : "",
    promptPack ? `Prompt pack id: ${promptPack.promptPackId}` : "",
    promptPack ? `Time-coded Seedance shots: ${promptPack.shotPrompts.length} shot(s), ${promptPack.shotPrompts.map((shot) => `${shot.order}:${shot.startSecond}-${shot.endSecond}s:${shot.role}`).join(" | ")}` : "",
    promptPack ? `Duration production contract: target=${promptPack.durationProductionContract.targetDurationSeconds}s; acts=${promptPack.durationProductionContract.actStructure.join(">")}; roles=${promptPack.durationProductionContract.sceneRoleOrder.join(">")}; minVisualChanges=${promptPack.durationProductionContract.minVisualChangeCount}; timingRisk=${promptPack.durationProductionContract.timingRisk}; ${boundedText(promptPack.durationProductionContract.completionRule, 220)}` : "",
    promptPack ? `TTS-ready audio script: ${promptPack.audioScript.slice(0, 6).map((line) => `${line.startSecond}-${line.endSecond}s ${boundedText(line.spokenLine, 140)}`).join(" | ")}` : "",
    firstTransitionBridge ? `Transition bridge: ${boundedText(firstTransitionBridge, 180)}` : ""
  ]);
}

function seamlessEditContractFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const sceneCount = plan.scenes.length;
  const selectedPipe = plan.videoPipePlan.selectedMode;
  const multishot = plan.seedanceRouting.storyboardRequired || sceneCount > 1 || selectedPipe !== "smart_short";
  if (!multishot) {
    return "Single-clip continuity contract: still create a readable first frame, motivated middle action, and stable final frame for review or future extension.";
  }
  const bridgeMode = plan.seedanceRouting.returnLastFrame
    ? "Use last-frame chaining plus transition bridges whenever provider output exposes a usable final frame."
    : "Use transition bridges and xfade-safe endpoints even when last-frame return is off.";
  const remakeLine = plan.referenceRemakeBlueprint
    ? "For Video Remake, inherit source rhythm and performance timing only; every boundary must preserve replacement KOL/product/background/audio, not source assets."
    : "";
  return compactLines([
    `Seamless multishot edit contract: ${sceneCount} planned scene(s) must feel like one continuous filmed piece, not separate generated clips.`,
    bridgeMode,
    "Each clip must start from the prior endpoint, continue screen direction/camera momentum/room tone/lighting color, and end on a stable product/KOL/result handle for the next clip.",
    "Use invisible continuity dissolves, match cuts, or motivated motion transitions; avoid dead air, audio bed drops, sudden color shifts, new product scale, face drift, or unrelated camera resets.",
    remakeLine,
    compact ? "If compacting, preserve this seamless edit contract before secondary style detail." : ""
  ]);
}

function videoPipePlanFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const pipePlan = plan.videoPipePlan;
  const selected = pipePlan.pipeOptions.find((option) => option.mode === pipePlan.selectedMode);
  const options = pipePlan.pipeOptions
    .slice(0, compact ? 3 : pipePlan.pipeOptions.length)
    .map((option) =>
      `${option.mode}: recommended=${option.recommended}; backendPipe=${option.backendPipe}; duration=${option.durationSupport.minSeconds}-${option.durationSupport.maxSeconds}s; tier=${option.preferredTier}; mode=${option.seedanceMode}; inputs=${option.requiredInputs.join(", ")}`
    )
    .join("\n");
  return compactLines([
    `Video pipe plan: id=${pipePlan.pipePlanId}; selected=${pipePlan.selectedMode}; backendPipe=${pipePlan.selectedBackendPipe}; reason=${boundedText(pipePlan.selectedReason, compact ? 180 : 320)}.`,
    `Video pipe alignment: visualBiblePipe=${pipePlan.visualBibleAlignment.visualBibleRecommendedPipe}; status=${pipePlan.visualBibleAlignment.status}; reasons=${pipePlan.selectionReasonCodes.join(", ") || "none"}; explanation=${boundedText(pipePlan.visualBibleAlignment.explanation, compact ? 160 : 280)}.`,
    selected ? `Selected pipe output strategy: ${boundedText(selected.outputStrategy, compact ? 180 : 320)}.` : "",
    selected?.effectiveSettings ? `Selected pipe effective settings: mode=${selected.effectiveSettings.providerMode}; tier=${selected.effectiveSettings.tier}; resolution=${selected.effectiveSettings.resolution}; bitrate=${selected.effectiveSettings.bitrateMode}; superResolution=${selected.effectiveSettings.superResolution}; audio=${selected.effectiveSettings.audioMode}; returnLastFrame=${selected.effectiveSettings.returnLastFrame}; recipe=${selected.effectiveSettings.promptRecipeName}.` : "",
    options ? `Available video pipes:\n${options}` : "",
    "Use the selected video pipe as the production workflow. Do not switch modes unless the render request metadata explicitly overrides workflowMode/renderMode."
  ]);
}

function durationArcFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const seconds = plan.intent.targetDurationSeconds;
  const roles = plan.scenes.map((scene) => scene.role).join(" > ");
  const base = seconds <= 15
    ? [
        "Duration/story arc contract: fill the full 15 second short with a complete beginning, middle, and ending.",
        "0-1s must show the viewer problem, result promise, or pattern interrupt; do not start with a slow logo/product hold.",
        "1-5s establishes context and why the product/result matters.",
        "5-11s shows the actual demo/proof/use action with visible state change.",
        "11-15s resolves with result, reaction, product-in-result frame, or soft next-step implication.",
        "Do not spend all shots on the same macro/object angle; every scene must change the viewer's information."
      ]
    : seconds <= 30
      ? [
          `Duration/story arc contract: fill all ${seconds}s with hook, problem/context, demo/proof, payoff, and soft next-step.`,
          "Change visible information every 1-3 seconds; never let a scene become a static product hold.",
          "Keep the final beat tied to the hook so the video feels complete."
        ]
      : [
          `Duration/story arc contract: fill all ${seconds}s with a complete short-form commercial arc, not a loose list of shots.`,
          "Use visible state changes, proof escalation, and a resolved ending; keep every scene useful to retention."
        ];
  return compactLines([
    ...base,
    `Planned scene roles: ${roles || "hook > demo/proof > payoff"}.`,
    compact ? "If compacting, preserve the duration arc over secondary style detail." : ""
  ]);
}

function seedanceRoutingFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const routing = plan.seedanceRouting;
  return compactLines([
    `Seedance routing: provider=${routing.provider}; family=${routing.modelFamily}; mode=${routing.recommendedProviderMode}; tier=${routing.preferredTier}; model=${routing.modelAlias}; modelPolicy=${routing.modelSelectionPolicy}; modelEnv=${routing.preferredConfiguredModelEnv}.`,
    `Seedance settings: resolution=${routing.resolution}; superResolution=${routing.superResolution}; ratio=${routing.ratio}; bitrate=${routing.bitrateMode}; returnLastFrame=${routing.returnLastFrame}; clipSeconds=${routing.providerClipDurationSeconds.min}-${routing.providerClipDurationSeconds.max}; targetPerClip=${routing.providerClipDurationSeconds.targetPerClip}; storyboard=${routing.storyboardRequired}; sequential=${routing.sequentialRenderRecommended}; audio=${routing.generatedAudioMode}.`,
    `Seedance prompt recipe: ${routing.promptRecipe.name}. ${routing.promptRecipe.modeInstruction}`,
    `Seedance reference instruction: ${compact ? boundedText(routing.promptRecipe.referenceInstruction, 500) : routing.promptRecipe.referenceInstruction}`,
    `Seedance shot rules: ${(compact ? routing.promptRecipe.shotPromptRules.slice(0, 3) : routing.promptRecipe.shotPromptRules).join(" | ")}.`,
    `Seedance negative rules: ${(compact ? routing.promptRecipe.negativeRules.slice(0, 4) : routing.promptRecipe.negativeRules).join(" | ")}.`,
    routing.warnings.length ? `Seedance routing warnings: ${(compact ? routing.warnings.slice(0, 4) : routing.warnings).join(" | ")}.` : ""
  ]);
}

function mediaReferencesFromPlan(plan: ShortPipelinePlan, compact = false): string {
  if (!plan.mediaReferencePlan.length) {
    return "Media references: none attached. Generate original visual details from user brief, product facts, and niche strategy; do not invent a specific KOL likeness or product packaging.";
  }
  const references = plan.mediaReferencePlan
    .slice(0, compact ? 8 : plan.mediaReferencePlan.length)
    .map((reference) =>
      `${reference.promptTag} ${reference.promptRole}/${reference.providerKind} "${boundedText(reference.label, 80)}" status=${reference.status}; rights=${reference.rightsStatus}; uriPolicy=${reference.uriPolicy}; providerHandoff=${reference.includeInProviderHandoff}; scope=${boundedText(reference.transferScope, compact ? 180 : 320)}; doNotTransfer=${reference.doNotTransfer.join(", ")}`
    )
    .join("\n");
  return compactLines([
    "Media reference binding:",
    references,
    "Reference priority: KOL identity and product geometry override style, motion, environment, camera, and source-video structure references.",
    "Never expose raw media URLs, local paths, credentials, source captions, source music, source creator identity, or unapproved brand marks in generated content."
  ]);
}

function visualBibleFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const visualBible = plan.visualBiblePlan;
  if (visualBible.status === "not_needed") {
    return "Visual Bible workflow: not required for this short; use standard prompt, media-reference, and continuity contracts.";
  }
  const assetLines = visualBible.assetPlans
    .slice(0, compact ? 6 : visualBible.assetPlans.length)
    .map((asset) =>
      `${asset.role}: ${asset.sourcePolicy}; required=${asset.requiredBeforeRender}; role=${asset.promptRole ?? "none"}; kind=${asset.providerKind ?? "none"}; views=${asset.minimumViewCount}-${asset.maximumImageCount}; brief=${boundedText(asset.promptBrief, compact ? 180 : 320)}`
    )
    .join("\n");
  const imagePromptLines = visualBible.assetPlans
    .slice(0, compact ? 4 : visualBible.assetPlans.length)
    .map((asset) => {
      const pack = asset.imagePromptPack;
      return [
        `${asset.role}: layout=${pack.layout}; output=${pack.outputPolicy}; views=${pack.minPanelOrViewCount}-${pack.maxPanelOrViewCount}`,
        `Image prompt: ${boundedText(pack.prompt, compact ? 280 : 520)}`,
        `Negative prompt: ${boundedText(pack.negativePrompt, compact ? 180 : 320)}`,
        `Seedance binding: ${boundedText(pack.seedanceBindingInstruction, compact ? 180 : 320)}`,
        `Approval checklist: ${boundedText(pack.approvalChecklist.join(" | "), compact ? 180 : 320)}`
      ].join(" | ");
    })
    .join("\n");
  const blueprint = visualBible.executionBlueprint;
  const executionSteps = blueprint.steps
    .slice(0, compact ? 4 : blueprint.steps.length)
    .map((step) =>
      `${step.order}. ${step.stage}/${step.provider}${step.providerMode ? `/${step.providerMode}` : ""}: ${boundedText(step.title, 100)}; approve=${step.requiresHumanApproval}; inputs=${step.inputAssetRoles.join(", ") || "none"}; output=${step.outputAssetRole ?? "none"}; ${boundedText(step.instruction, compact ? 160 : 280)}`
    )
    .join("\n");
  return compactLines([
    `Visual Bible workflow: id=${visualBible.planId}; status=${visualBible.status}; mode=${visualBible.requestedMode}; pipe=${visualBible.recommendedPipe}; durationBand=${visualBible.durationBand}; imageProviderPolicy=${visualBible.imageProviderPolicy}.`,
    `Visual Bible sequence: boards=${visualBible.sequencePlan.boardCount}; targetClips=${visualBible.sequencePlan.targetClipCount}; maxSecondsPerBoard=${visualBible.sequencePlan.maxSecondsPerBoard}; continuity=${visualBible.sequencePlan.continuityStrategy}; blocksRender=${visualBible.releaseGateSummary.blocksRenderUntilAssetsApproved}.`,
    `Visual Bible execution blueprint: mode=${blueprint.mode}; imageProvider=${blueprint.imageProviderRole}; seedanceMode=${blueprint.seedanceSubmissionMode}; clipStrategy=${blueprint.clipExecutionStrategy}; bindingOrder=${blueprint.referenceTagBindingOrder.join(" > ") || "none"}.`,
    `Visual Bible duration coverage: target=${blueprint.durationCoverage.targetDurationSeconds}s; targetClips=${blueprint.durationCoverage.targetClipCount}; targetSecondsPerClip=${blueprint.durationCoverage.targetSecondsPerClip}; startMiddleEnd=${blueprint.durationCoverage.requiresStartMiddleEnd}; rule=${blueprint.durationCoverage.coverageRule}.`,
    imagePromptLines ? `Visual Bible image prompt packs:\n${imagePromptLines}` : "",
    executionSteps ? `Visual Bible execution steps:\n${executionSteps}` : "",
    assetLines ? `Visual Bible asset plan:\n${assetLines}` : "",
    `Visual Bible Seedance binding: ${(compact ? visualBible.seedanceBindingPlan.slice(0, 3) : visualBible.seedanceBindingPlan).join(" | ")}.`,
    `Visual Bible prompt contracts: ${(compact ? visualBible.promptContracts.slice(0, 3) : visualBible.promptContracts).join(" | ")}.`,
    `Visual Bible quality gates: ${(compact ? visualBible.qualityGates.slice(0, 4) : visualBible.qualityGates).join(" | ")}.`,
    visualBible.warnings.length ? `Visual Bible warnings: ${(compact ? visualBible.warnings.slice(0, 4) : visualBible.warnings).join(" | ")}.` : ""
  ]);
}

function referenceRemakeBlueprintFromPlan(plan: ShortPipelinePlan, compact = false): string {
  const blueprint = plan.referenceRemakeBlueprint;
  if (!blueprint) {
    return "";
  }
  return compactLines([
    `Video Remake blueprint: id=${blueprint.blueprintId}; mode=${blueprint.mode}; status=${blueprint.status}; fidelity=${blueprint.fidelityTarget}; sourceSafety=${blueprint.sourceSafetyStatus}.`,
    blueprint.sourcePatternId ? `Video Remake source pattern: ${blueprint.sourcePatternId}.` : "",
    `Video Remake trend intake: ${blueprint.trendVideoIntakeMode}.`,
    `Video Remake replacement slots: ${(compact ? blueprint.replacementSlots.slice(0, 4) : blueprint.replacementSlots).join(", ")}.`,
    `Video Remake adherence targets: ${(compact ? blueprint.adherenceTargets.slice(0, 4).map((item) => boundedText(item, 160)) : blueprint.adherenceTargets).join(" | ")}.`,
    `Video Remake source beat map: ${(compact ? blueprint.sourceBeatMap.slice(0, 5).map((item) => boundedText(item, 160)) : blueprint.sourceBeatMap).join(" | ")}.`,
    `Video Remake provider execution: ${(compact ? blueprint.providerExecutionPlan.slice(0, 4).map((item) => boundedText(item, 160)) : blueprint.providerExecutionPlan).join(" | ")}.`,
    `Video Remake locked elements: ${(compact ? blueprint.lockedElements.slice(0, 4).map((item) => boundedText(item, 160)) : blueprint.lockedElements).join(" | ")}.`,
    `Video Remake guardrails: ${(compact ? blueprint.remakeGuardrails.slice(0, 4).map((item) => boundedText(item, 160)) : blueprint.remakeGuardrails).join(" | ")}.`,
    "Use the blueprint to recreate rhythm, performance beats, and camera grammar with the user's approved KOL, product, setting, voice, and evidence; keep expression and assets original unless rights review explicitly clears a closer remake."
  ]);
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
  const corpusPatterns = plan.viralIntelligence.creativePatternLearning.patterns
    .filter((pattern) => pattern.source === "seedance_prompt_corpus")
    .slice(0, compact ? 4 : 8)
    .map((pattern) => `${pattern.label} -> ${pattern.kind}`)
    .join(" | ");
  const platformTemplatePatterns = plan.viralIntelligence.creativePatternLearning.patterns
    .filter((pattern) => pattern.source === "platform_template_corpus")
    .slice(0, compact ? 4 : 8)
    .map((pattern) => `${pattern.label} -> ${pattern.kind}`)
    .join(" | ");
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
    corpusPatterns ? `Prompt corpus guidance: use distilled Seedance/ad/UGC pattern DNA only (${corpusPatterns}); coverage=declaredPrompts:${SHORT_PROMPT_CORPUS_COVERAGE.declaredPromptCount}, localVideoIndex:${SHORT_PROMPT_CORPUS_COVERAGE.localVideoUrlIndexCount}, runtimePatterns:${SHORT_PROMPT_CORPUS_COVERAGE.runtimePatternCount}, taxonomyFamilies:${SHORT_PROMPT_CORPUS_COVERAGE.taxonomyFamilyCount}; do not reproduce upstream prompt wording.` : "",
    platformTemplatePatterns ? `Platform template guidance: use distilled public/licensed workflow structure only (${platformTemplatePatterns}); coverage=archetypes:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.templateArchetypeCount}, nicheFamilies:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.nicheFamilyCount}, patternMatrix:${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.declaredPatternMatrixCount}; do not reproduce third-party template wording or scrape proprietary UI.` : "",
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
        return `${shot.order}. ${shot.startSecond}-${shot.endSecond}s ${shot.role.toUpperCase()} | Act: ${shot.beatContract.act} | First frame: ${boundedText(shot.firstFrame, 160)} | Visual: ${boundedText(shot.visualPrompt, 240)} | Camera: ${boundedText(shot.camera, 120)} | Action: ${boundedText(shot.action, 160)} | Voiceover: ${boundedText(shot.voiceoverLine, 200)} | Native audio: ${boundedText(shot.nativeAudioPrompt, 180)} | On-screen text: ${onScreenTextInstructionFor(shot.caption)} | Continuity: ${boundedText(shot.continuity, 140)} | Endpoint: ${boundedText(shot.beatContract.endpointJob, 160)} | Transition bridge: ${boundedText(shot.transitionBridge, 180)}`;
      }
      return `${shot.order}. ${shot.startSecond}-${shot.endSecond}s ${shot.role.toUpperCase()} | Act: ${shot.beatContract.act} | Timing goal: ${shot.beatContract.timingGoal} | Required visual change: ${shot.beatContract.requiredVisualChange} | First frame: ${shot.firstFrame} | Visual: ${shot.visualPrompt} | Camera: ${shot.camera} | Action: ${shot.action} | Voiceover: ${shot.voiceoverLine} | Native audio: ${shot.nativeAudioPrompt} | On-screen text: ${onScreenTextInstructionFor(shot.caption)} | Continuity: ${shot.continuity} | Endpoint: ${shot.beatContract.endpointJob} | Transition bridge: ${shot.transitionBridge} | Reference: ${shot.referencePolicy} | Negatives: ${shot.negativeConstraints.join("; ")} | Checks: ${shot.qualityChecks.join("; ")}`;
    })
    .join("\n");
  const contract = pack.durationProductionContract;
  const audioScript = pack.audioScript
    .map((line) => `${line.startSecond}-${line.endSecond}s ${line.voiceStyle}: ${line.spokenLine} | music=${line.musicCue} | sfx=${line.sfxCue}`)
    .join("\n");
  return compactLines([
    "Seedance 2.0 prompt pack:",
    `Prompt pack id: ${pack.promptPackId}`,
    `Time-coded Seedance shots: ${pack.shotPrompts.length} shot(s), ${pack.shotPrompts.map((shot) => `${shot.order}:${shot.startSecond}-${shot.endSecond}s:${shot.role}`).join(" | ")}`,
    `Duration production contract: target=${contract.targetDurationSeconds}s; acts=${contract.actStructure.join(">")}; roles=${contract.sceneRoleOrder.join(">")}; minVisualChanges=${contract.minVisualChangeCount}; timingRisk=${contract.timingRisk}; ${contract.completionRule}`,
    compact ? boundedText(pack.masterPrompt, 800) : pack.masterPrompt,
    `Audio plan: ${compact ? boundedText(pack.audioPlan, 300) : pack.audioPlan}`,
    `TTS-ready audio script:\n${compact ? boundedText(audioScript, 700) : audioScript}`,
    `No-visible-text plan: ${compact ? boundedText(pack.captionPlan, 300) : pack.captionPlan}`,
    `Reference policy: ${compact ? boundedText(pack.referencePolicy, 300) : pack.referencePolicy}`,
    `Global negative constraints: ${(compact ? pack.globalNegativeConstraints.slice(0, 8).map((item) => boundedText(item, 120)) : pack.globalNegativeConstraints).join("; ")}`,
    "Time-coded Seedance shot details:",
    shots
  ]);
}

function onScreenTextInstructionFor(caption: string): string {
  return caption === "NO_ON_SCREEN_TEXT"
    ? "none; do not render captions, subtitles, CTA cards, labels, typography, lower thirds, or fake UI text"
    : caption;
}

/**
 * Perfectly-synced subtitle cues from the plan's own TTS audio script. Exported so the
 * speech-captions smoke can verify the handoff path without building a full plan through
 * the planner. Returns [] when the plan has no narration script (captions stay off).
 */
export function narrationCaptionCuesForPlan(plan: ShortPipelinePlan): readonly CaptionCue[] {
  const audioScript = plan.seedancePromptPack?.audioScript ?? [];
  if (audioScript.length === 0) {
    return [];
  }
  return buildCaptionCuesFromAudioScript(
    audioScript.map((line) => ({
      startSecond: line.startSecond,
      endSecond: line.endSecond,
      spokenLine: line.spokenLine
    }))
  );
}

function generatedAudioIntentsFromPlan(plan: ShortPipelinePlan, audioPolicy: ShortPipelineAudioPolicy): readonly GeneratedAudioIntent[] {
  const sceneDuration = Math.max(1, plan.intent.targetDurationSeconds / Math.max(1, plan.scenes.length));
  return plan.scenes.map((scene, index) => {
    const audioScriptLine = plan.seedancePromptPack?.audioScript.find((line) => line.sceneId === scene.sceneId);
    const startSecond = audioScriptLine?.startSecond ?? roundSeconds(index * sceneDuration);
    const endSecond = audioScriptLine?.endSecond ?? roundSeconds(Math.min(plan.intent.targetDurationSeconds, (index + 1) * sceneDuration));
    const voiceStyle = channelVoiceStyle(plan) ?? plan.brandKitEvaluation?.tone;
    const selectedVoiceStyle = audioPolicy.voiceStyle ?? audioScriptLine?.voiceStyle ?? voiceStyle;
    return {
      intentId: createStableId("short_audio", `${plan.planId}:${scene.sceneId}:${scene.order}`),
      kind: "tts_narration",
      prompt: audioScriptLine?.spokenLine ?? scene.narration,
      startSecond,
      endSecond: endSecond > startSecond ? endSecond : roundSeconds(startSecond + 1),
      durationSeconds: roundSeconds(Math.max(1, endSecond - startSecond)),
      ...(audioPolicy.language ? { language: audioPolicy.language } : {}),
      ...(selectedVoiceStyle ? { voiceStyle: selectedVoiceStyle } : {}),
      ...(audioScriptLine?.musicCue ? { mood: audioScriptLine.musicCue } : {}),
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
  const mode = shortAudioModeFor(input.mode);
  const language = mode === "off" ? undefined : isShortAudioLanguage(input.language) ? input.language : planPolicy.language ?? "en";
  const voiceStyle = input.voiceStyle ?? planPolicy.voiceStyle;
  const renderAudioMode = renderAudioModeForShortMode(mode);
  return {
    schemaVersion: "cinejelly.short-audio-policy.v1",
    mode,
    ...(language ? { language } : {}),
    ...(language ? { languageLabel: languageLabelFor(language) } : {}),
    ...(voiceStyle && mode !== "off" ? { voiceStyle } : {}),
    renderAudioMode,
    generatedAudioIntentEnabled: mode !== "off",
    nativeProviderAudioEnabled: renderAudioMode === "native" || renderAudioMode === "hybrid",
    providerAudioPromptEnabled: renderAudioMode === "native" || renderAudioMode === "guided" || renderAudioMode === "hybrid",
    externalAudioScriptEnabled: mode !== "off",
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
    renderAudioMode: "hybrid",
    generatedAudioIntentEnabled: true,
    nativeProviderAudioEnabled: true,
    providerAudioPromptEnabled: true,
    externalAudioScriptEnabled: true,
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
  const providerLine = audioPolicy.nativeProviderAudioEnabled
    ? "enable Seedance/provider-native audio when the selected model supports it"
    : "keep provider-native audio disabled";
  const scriptLine = audioPolicy.externalAudioScriptEnabled
    ? "also emit TTS-ready narration/script cues for later external voice or music APIs"
    : "do not emit external audio script cues";
  return `Audio policy: ${providerLine}; ${scriptLine}; language=${audioPolicy.languageLabel ?? audioPolicy.language ?? "English"}; mode=${audioPolicy.renderAudioMode}; visuals must still be understandable without on-screen text.`;
}

function shortAudioModeFor(value: unknown): ShortPipelineAudioPolicy["mode"] {
  if (value === "off" || value === "native" || value === "hybrid" || value === "voiceover") {
    return value;
  }
  // Common ways a user disables audio must NOT silently default to voiceover (audio ON = extra spend).
  if (value === "none" || value === "mute" || value === "muted" || value === "silent" || value === "silence") {
    return "off";
  }
  return "voiceover";
}

function renderAudioModeForShortMode(mode: ShortPipelineAudioPolicy["mode"]): ShortPipelineAudioPolicy["renderAudioMode"] {
  switch (mode) {
    case "off":
      return "none";
    case "native":
      return "native";
    case "hybrid":
    case "voiceover":
      return "hybrid";
  }
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

function compactShortRenderMetadata(metadata: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  let outputCount = 0;
  for (const key of SHORT_RENDER_METADATA_PRIORITY_KEYS) {
    const value = metadata[key];
    if (value !== undefined && outputCount < SHORT_RENDER_METADATA_MAX_ENTRIES) {
      output[key] = value;
      outputCount += 1;
    }
  }
  for (const key of Object.keys(metadata).sort()) {
    if (outputCount >= SHORT_RENDER_METADATA_MAX_ENTRIES) {
      break;
    }
    const value = metadata[key];
    if (output[key] === undefined && value !== undefined) {
      output[key] = value;
      outputCount += 1;
    }
  }
  return output;
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local");
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}
