/**
 * Short MVP UI contract.
 * It translates a rich backend plan into a small control contract that a future
 * product UI can render without reimplementing pipeline rules client-side.
 */

import type {
  ShortMvpUiAction,
  ShortMvpUiAudioControl,
  ShortMvpUiAudioOptionId,
  ShortMvpUiContract,
  ShortMvpUiCreativePatternLearning,
  ShortMvpUiDirectorGuidance,
  ShortMvpUiReviewCheckpoint,
  ShortMvpUiReviewSurfaceSummary,
  ShortMvpUiWorkflowControl
} from "../types/short-mvp-ui.js";
import type { ShortPipelinePlan } from "../types/short-pipeline.js";
import type {
  ReviewApprovalCheckpoint,
  ReviewApprovalSurface
} from "../types/review-approval.js";

const SHORT_COMMERCIAL_MIN_SECONDS = 15;
const SHORT_COMMERCIAL_MAX_SECONDS = 60;
const SHORT_SINGLE_CLIP_MAX_SECONDS = 15;
const REVIEW_SURFACES: readonly ReviewApprovalSurface[] = ["scene", "audio", "caption", "claim"];
const RAW_HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s"',;)]*/gi;
const EMBEDDED_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\s"',;)]*/g;
const EMBEDDED_UNC_PATH_PATTERN = /\\\\[^\s"',;)]+/g;
const EMBEDDED_POSIX_PATH_PATTERN = /(^|\s)(\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+)/g;
const SECRET_TEXT_PATTERN =
  /\b(?:bearer\s+|api[_-]?key\s*[:=]|access[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|authorization\s*[:=])[^"',\s&]+/gi;

export function buildShortMvpUiContract(plan: ShortPipelinePlan): ShortMvpUiContract {
  const audioPolicy = plan.audioPolicy ?? {
    schemaVersion: "cinejelly.short-audio-policy.v1" as const,
    mode: "voiceover" as const,
    language: "en" as const,
    languageLabel: "English" as const,
    renderAudioMode: "guided" as const,
    generatedAudioIntentEnabled: true,
    nativeProviderAudioEnabled: false as const,
    reviewRequired: true as const
  };
  const recommendedWorkflowMode = plan.directorPlan.recommendedWorkflowMode;
  const canCreateRenderJob = plan.status !== "blocked" && plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence;
  const requiredPendingCount = plan.reviewApproval.summary.pendingRequiredCount +
    plan.reviewApproval.summary.changesRequestedRequiredCount +
    plan.reviewApproval.summary.rejectedRequiredCount +
    plan.reviewApproval.summary.blockedCheckpointCount;
  const backendManagedSteps = backendManagedActions(plan);
  const userRequiredActions = userActions(plan, requiredPendingCount);

  return {
    schemaVersion: "cinejelly.short-mvp-ui-contract.v1",
    generatedAt: new Date(),
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    projectId: plan.projectId,
    ...(plan.requestId ? { requestId: plan.requestId } : {}),
    planId: plan.planId,
    status: plan.status,
    headline: headlineFor(plan),
    duration: {
      targetSeconds: plan.intent.targetDurationSeconds,
      commercialMinSeconds: SHORT_COMMERCIAL_MIN_SECONDS,
      commercialMaxSeconds: SHORT_COMMERCIAL_MAX_SECONDS,
      recommendedWorkflowMode,
      providerSingleClipMaxSeconds: SHORT_SINGLE_CLIP_MAX_SECONDS
    },
    workflowControls: workflowControls(recommendedWorkflowMode, plan),
    audioControls: {
      selectedOptionId: selectedAudioOptionId(audioPolicy),
      options: audioControls(audioPolicy)
    },
    visualTextPolicy: {
      noOnScreenText: true,
      noCaptions: true,
      noCtaCards: true,
      captionsBurnIn: false
    },
    review: {
      status: plan.reviewApproval.status,
      gate: plan.reviewApproval.gate,
      checkpointCount: plan.reviewApproval.summary.checkpointCount,
      requiredPendingCount,
      surfaces: reviewSurfaces(plan),
      checkpoints: reviewCheckpoints(plan),
      approvalPayloadContract: {
        gate: "pre_render",
        endpointPath: "/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs",
        requiresReviewer: true,
        requiresReviewedAt: true,
        confirmRenderSubmissionDefault: false,
        canQueueProviderSpendFromContractAlone: false
      }
    },
    director: directorGuidance(plan),
    creativePatternLearning: creativePatternLearningFor(plan),
    render: {
      canCreateRenderJob,
      canSubmitToProviderNow: false,
      requiresExplicitRenderConfirmation: true,
      endpointPath: "/v1/short-pipeline/render-jobs",
      sessionEndpointPath: "/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs",
      blockedReason: canCreateRenderJob
        ? "UI must collect required review approvals and explicit render confirmation before provider spend."
        : "Plan is blocked or missing no-spend planning evidence; repair product, brand, style, claim, or reference issues first."
    },
    ...(plan.channelStyleProfile ? {
      channelStyle: {
        profileId: plan.channelStyleProfile.profileId,
        status: plan.channelStyleProfile.status,
        anchorCount: plan.channelStyleProfile.styleAnchors.length,
        canReuseAcrossScripts: plan.channelStyleProfile.memoryPolicy.canReuseAcrossScripts,
        requiresRightsReview: plan.channelStyleProfile.memoryPolicy.requiresRightsReview
      }
    } : {}),
    backendManagedSteps,
    userRequiredActions,
    outputContract: {
      finalMp4AssemblyManagedByBackend: true,
      captionsCanBeBurnedIn: false,
      visibleTextAllowed: false,
      audioMode: audioPolicy.renderAudioMode,
      ...(audioPolicy.language ? { audioLanguage: audioPolicy.language } : {}),
      generatedAudioIntentCount: audioPolicy.generatedAudioIntentEnabled ? plan.scenes.length : 0,
      expectedSceneCount: plan.scenes.length
    },
    releaseGateSummary: {
      readyForUiMvpIntegration: canCreateRenderJob && backendManagedSteps.every((step) => step.status !== "blocked"),
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "UI MVP integration can use this contract, but customer traffic still requires paid Short validation, artifact validation, manual media review, billing/workspace controls, and release approval."
    }
  };
}

function creativePatternLearningFor(plan: ShortPipelinePlan): ShortMvpUiCreativePatternLearning {
  const learning = plan.viralIntelligence.creativePatternLearning;
  const selectedIdea = learning.candidates.find((candidate) => candidate.ideaId === learning.selectedIdeaId) ?? learning.candidates[0];
  return {
    learningId: learning.learningId,
    patternCount: learning.patternCount,
    candidateCount: learning.candidateCount,
    ...(selectedIdea ? {
      selectedIdeaId: selectedIdea.ideaId,
      selectedIdeaLabel: selectedIdea.label,
      selectedIdeaScore: selectedIdea.score.totalScore,
      selectedIdeaHook: selectedIdea.hook,
      selectedIdeaProofPlan: selectedIdea.proofPlan
    } : {}),
    topCandidates: learning.candidates.slice(0, 5).map((candidate) => ({
      ideaId: candidate.ideaId,
      patternId: candidate.patternId,
      label: candidate.label,
      score: candidate.score.totalScore,
      nonCloneSafety: candidate.score.nonCloneSafety,
      hook: candidate.hook,
      proofPlan: candidate.proofPlan
    }))
  };
}

function selectedAudioOptionId(audioPolicy: NonNullable<ShortPipelinePlan["audioPolicy"]>): ShortMvpUiAudioOptionId {
  if (audioPolicy.mode === "off") {
    return "off";
  }
  switch (audioPolicy.language) {
    case "vi":
      return "vietnamese";
    case "zh":
      return "chinese";
    case "en":
    default:
      return "english";
  }
}

function audioControls(audioPolicy: NonNullable<ShortPipelinePlan["audioPolicy"]>): readonly ShortMvpUiAudioControl[] {
  const selected = selectedAudioOptionId(audioPolicy);
  return [
    audioControl("off", "Audio off", selected === "off", "none", undefined, "Use when the user wants a fully silent visual short."),
    audioControl("english", "English VO", selected === "english", "guided", "en", "Generate guided narration/audio intents in English."),
    audioControl("vietnamese", "Vietnamese VO", selected === "vietnamese", "guided", "vi", "Generate guided narration/audio intents in Vietnamese."),
    audioControl("chinese", "Chinese VO", selected === "chinese", "guided", "zh", "Generate guided narration/audio intents in Chinese.")
  ];
}

function audioControl(
  optionId: ShortMvpUiAudioOptionId,
  label: string,
  recommended: boolean,
  handoffAudioMode: ShortMvpUiAudioControl["handoffAudioMode"],
  language: ShortMvpUiAudioControl["language"] | undefined,
  reason: string
): ShortMvpUiAudioControl {
  return {
    optionId,
    label,
    recommended,
    enabled: true,
    handoffAudioMode,
    ...(language ? { language } : {}),
    reason
  };
}

function headlineFor(plan: ShortPipelinePlan): string {
  const product = plan.productBrief?.title ?? "Short video";
  const platform = plan.intent.platform === "unknown" ? "short-form" : plan.intent.platform;
  return `${product} ${platform} ${plan.intent.targetDurationSeconds}s`;
}

function workflowControls(
  recommendedWorkflowMode: "single_clip" | "storyboard_multishot",
  plan: ShortPipelinePlan
): readonly ShortMvpUiWorkflowControl[] {
  return [
    control("auto", "Auto", true, true, "Short Director chooses single or storyboard from duration, beat count, references, source-video evidence, and review gates."),
    control(
      "single_clip",
      "Single clip",
      recommendedWorkflowMode === "single_clip",
      plan.intent.targetDurationSeconds <= 20,
      "Best for compact 15s ads or one continuous reference-locked idea."
    ),
    control(
      "storyboard_multishot",
      "Storyboard",
      recommendedWorkflowMode === "storyboard_multishot",
      true,
      "Best for 20-60s shorts, UGC reviews, product demos, proof beats, and multi-scene ads."
    ),
    control(
      "reference_locked",
      "Reference locked",
      false,
      true,
      "Use when UI attaches approved product, character, style, first-frame, or last-frame references."
    ),
    control(
      "source_video_guided",
      "Learn reference",
      false,
      true,
      "Use a rights-cleared source video for pacing and structure only, without copying script, faces, marks, or audio."
    ),
    control(
      "manual_storyboard",
      "Manual storyboard",
      false,
      true,
      "Use when the operator/customer wants to approve each scene before spend."
    )
  ];
}

function control(
  mode: ShortMvpUiWorkflowControl["mode"],
  label: string,
  recommended: boolean,
  enabled: boolean,
  reason: string
): ShortMvpUiWorkflowControl {
  return { mode, label, recommended, enabled, reason };
}

function directorGuidance(plan: ShortPipelinePlan): ShortMvpUiDirectorGuidance {
  const director = plan.directorPlan;
  return {
    directorId: director.directorId,
    status: director.status,
    creativeMode: director.creativeMode,
    durationStrategy: director.platformPlan.durationStrategy,
    recommendedWorkflowMode: director.recommendedWorkflowMode,
    hookWindowSeconds: director.hookPlan.hookWindowSeconds,
    targetBeatCount: director.pacingPlan.targetBeatCount,
    captionStrategy: director.reviewPolicy.captionStrategy,
    sourceVideoControlsStructureOnly: director.referencePolicy.sourceVideoControlsStructureOnly,
    reviewPauseBeforeProviderSpend: director.reviewPolicy.checkpointPolicy === "pause_before_provider_spend",
    findingCount: director.findings.length,
    blockerCount: director.findings.filter((finding) => finding.severity === "block").length,
    warningCount: director.findings.filter((finding) => finding.severity === "warn").length,
    directives: director.directorDirectives
  };
}

function reviewSurfaces(plan: ShortPipelinePlan): readonly ShortMvpUiReviewSurfaceSummary[] {
  return REVIEW_SURFACES.map((surface) => {
    const checkpoints = plan.reviewApproval.checkpoints.filter((checkpoint) => checkpoint.surface === surface);
    return {
      surface,
      checkpointCount: checkpoints.length,
      requiredPendingCount: checkpoints.filter((checkpoint) =>
        checkpoint.required && checkpoint.decision !== "approved"
      ).length,
      blockedCount: checkpoints.filter((checkpoint) => checkpoint.decision === "blocked").length
    };
  });
}

function reviewCheckpoints(plan: ShortPipelinePlan): readonly ShortMvpUiReviewCheckpoint[] {
  return plan.reviewApproval.checkpoints.map((checkpoint) => {
    const subjectId = checkpoint.subjectId ? safeUiReviewText(checkpoint.subjectId) : undefined;
    return {
      checkpointId: checkpoint.checkpointId,
      surface: checkpoint.surface,
      label: safeUiReviewText(checkpoint.label),
      ...(subjectId ? { subjectId } : {}),
      required: checkpoint.required,
      decision: checkpoint.decision,
      issueCodes: checkpoint.issueCodes.map((issueCode) => safeUiReviewText(issueCode)),
      evidenceKeyCount: Object.keys(checkpoint.evidence).length,
      reviewerRequiredForApproval: true,
      reviewedAtRequiredForApproval: true,
      canApproveInUi: canApproveCheckpointInUi(checkpoint)
    };
  });
}

function canApproveCheckpointInUi(checkpoint: ReviewApprovalCheckpoint): boolean {
  return checkpoint.decision !== "blocked" &&
    !checkpoint.issueCodes.includes("unsafe_public_review_text") &&
    !checkpoint.issueCodes.includes("approved_without_reviewer_or_timestamp");
}

function safeUiReviewText(value: string): string {
  return value
    .replace(RAW_HTTP_URL_PATTERN, "[REDACTED_URL]")
    .replace(SECRET_TEXT_PATTERN, "[REDACTED_SECRET]")
    .replace(EMBEDDED_WINDOWS_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
    .replace(EMBEDDED_UNC_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
    .replace(EMBEDDED_POSIX_PATH_PATTERN, "$1[REDACTED_LOCAL_PATH]")
    .replace(/\s+/g, " ")
    .trim();
}

function backendManagedActions(plan: ShortPipelinePlan): readonly ShortMvpUiAction[] {
  return [
    backendAction("intent_inference", "Infer goal, audience, platform, emotion, duration, and aspect ratio", "ready", "Backend already normalized the user's natural-language brief."),
    backendAction("adaptive_short_agent", "Generate adaptive concept candidates without fixed templates", plan.agentGraph ? "ready" : "optional", "Short Agent graph supplies research, memory, critique, repair, and Seedance prompt-pack evidence when available."),
    backendAction("viral_strategy", "Build niche/platform viral strategy", plan.viralIntelligence.status === "blocked" ? "blocked" : "ready", "Backend scores concepts and scene directives from product, audience, reference, and platform evidence."),
    backendAction("channel_style_memory", "Apply saved channel style memory", plan.channelStyleProfile?.status === "blocked" ? "blocked" : plan.channelStyleProfile ? "ready" : "optional", "Backend binds recurring channel, character, voice, setting, visual rhythm, and editing anchors when supplied."),
    backendAction("render_handoff", "Prepare render-job handoff", plan.status === "blocked" ? "blocked" : "ready", "Backend converts the short plan into the normal async render-job request with lineage metadata."),
    backendAction("audio_visual_text_contracts", "Create audio and no-visible-text contracts", "ready", "Backend derives generated-audio intents only when audio is enabled and disables caption burn-in by default."),
    backendAction("final_mp4_assembly", "Assemble final MP4 after render", "ready", "DirectorAgent and AssemblyEngine select video outputs, stitch clips, apply audio when requested, and run delivery gate.")
  ];
}

function userActions(plan: ShortPipelinePlan, requiredPendingCount: number): readonly ShortMvpUiAction[] {
  return [
    ...(plan.productBrief?.status === "review_required"
      ? [userAction("confirm_product_facts", "Confirm product facts, image rights, and claims", "needs_review", true, "Product URL/snapshot evidence needs operator review before spend.")]
      : []),
    ...(plan.brandKitEvaluation?.status === "review_required"
      ? [userAction("complete_brand_kit", "Complete brand kit rules", "needs_review", true, "Tone, claim policy, audio language, or approved brand assets need review.")]
      : []),
    ...(plan.channelStyleProfile?.memoryPolicy.requiresRightsReview
      ? [userAction("approve_channel_assets", "Approve reusable channel assets", "needs_review", true, "Reusable channel assets are present but not fully rights-approved.")]
      : []),
    userAction(
      "approve_review_checkpoints",
      "Approve scene, audio, no-visible-text, and claim checkpoints",
      requiredPendingCount > 0 ? "needs_review" : "ready",
      requiredPendingCount > 0,
      requiredPendingCount > 0
        ? `${requiredPendingCount} required checkpoint(s) still need approval.`
        : "All required checkpoints are approved."
    ),
    userAction("confirm_render_submission", "Confirm render spend", "needs_review", true, "Provider spend is never queued until UI sends confirmRenderSubmission=true with approved review evidence.")
  ];
}

function backendAction(
  actionId: string,
  label: string,
  status: ShortMvpUiAction["status"],
  reason: string
): ShortMvpUiAction {
  return { actionId, label, status, required: true, handledBy: "backend", reason };
}

function userAction(
  actionId: string,
  label: string,
  status: ShortMvpUiAction["status"],
  required: boolean,
  reason: string
): ShortMvpUiAction {
  return { actionId, label, status, required, handledBy: "user", reason };
}
