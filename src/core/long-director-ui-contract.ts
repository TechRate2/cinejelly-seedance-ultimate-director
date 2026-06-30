import type {
  LongDirectorUiAction,
  LongDirectorUiActionStatus,
  LongDirectorUiContract,
  LongDirectorUiWorkflowControl,
  LongDirectorUiWorkflowMode
} from "../types/long-director-ui.js";
import type { LongFormCreativeIntelligencePlan } from "../types/long-form-creative-intelligence.js";
import { redactPrivateSourcePatternText } from "./private-source-pattern-registry.js";

const LONG_COMMERCIAL_MIN_SECONDS = 120;
const LONG_COMMERCIAL_MAX_SECONDS = 480;

export function buildLongDirectorUiContract(plan: LongFormCreativeIntelligencePlan): LongDirectorUiContract {
  const sequenceCount = sequenceCountFor(plan);
  const highPriorityRepairCount = plan.repairDirectives.filter((directive) =>
    directive.priority === "high" || directive.priority === "critical"
  ).length;
  const canProceedToRenderAfterApproval = plan.releaseGateSummary.canProceedToRender;
  const backendManagedSteps = backendManagedActions(plan);
  const userRequiredActions = userActions(plan, highPriorityRepairCount);

  return {
    schemaVersion: "cinejelly.long-director-ui-contract.v1",
    generatedAt: new Date(),
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    projectId: plan.projectId,
    status: plan.status,
    duration: {
      targetSeconds: plan.targetDurationSeconds,
      commercialMinSeconds: LONG_COMMERCIAL_MIN_SECONDS,
      commercialMaxSeconds: LONG_COMMERCIAL_MAX_SECONDS,
      sequenceCount,
      shotDirectiveCount: plan.shotDirectiveCount
    },
    director: {
      directorId: plan.directorPlan.directorId,
      status: plan.directorPlan.status,
      narrativeMode: plan.directorPlan.storyPlan.narrativeMode,
      continuityMode: plan.directorPlan.continuityPlan.mode,
      checkpointStages: plan.directorPlan.checkpointPolicy.requiredStages,
      pauseBeforeProviderSpend: plan.directorPlan.checkpointPolicy.pauseBeforeProviderSpend,
      pauseBeforeCustomerRelease: plan.directorPlan.checkpointPolicy.pauseBeforeCustomerRelease,
      findingCount: plan.directorPlan.findings.length,
      blockerCount: plan.directorPlan.findings.filter((finding) => finding.severity === "block").length,
      warningCount: plan.directorPlan.findings.filter((finding) => finding.severity === "warn").length,
      directives: plan.directorPlan.directorDirectives.map(safeUiString)
    },
    creative: {
      qualityScore: plan.qualityScore,
      niche: safeUiString(plan.nicheStrategy.niche),
      platformIntent: safeUiString(plan.nicheStrategy.platformIntent),
      desiredViewerAction: safeUiString(plan.nicheStrategy.desiredViewerAction),
      trendPosture: safeUiString(plan.nicheStrategy.trendPosture),
      viewerObjection: safeUiString(plan.nicheStrategy.viewerObjection),
      proofStrategy: safeUiString(plan.nicheStrategy.proofStrategy),
      shareTrigger: safeUiString(plan.nicheStrategy.shareTrigger),
      ideaSeedCount: plan.nicheStrategy.audienceNicheIntelligence.ideaSeeds.length,
      ideaCandidateCount: plan.ideaCandidateCount,
      ...(plan.selectedIdeaCandidateId ? { selectedIdeaCandidateId: safeUiString(plan.selectedIdeaCandidateId) } : {}),
      viralLeverCount: plan.nicheStrategy.viralLevers.length,
      findingCount: plan.findingCount,
      blockingFindingCount: plan.blockingFindingCount,
      reviewRequiredFindingCount: plan.reviewRequiredFindingCount,
      candidateDirectiveCount: plan.candidateDirectiveCount,
      repairDirectiveCount: plan.repairDirectiveCount,
      highPriorityRepairCount
    },
    workflowControls: workflowControls(plan, highPriorityRepairCount),
    backendManagedSteps,
    userRequiredActions,
    outputContract: {
      finalMp4AssemblyManagedByBackend: true,
      longFormManualQualityReviewRequired: true,
      benchmarkEvidenceRequired: true,
      canSubmitToProviderNow: false,
      canProceedToRenderAfterApproval,
      captionCoverageRatio: plan.audioCaptionQuality.captionCoverageRatio,
      generatedAudioIntentCount: plan.audioCaptionQuality.generatedAudioIntentCount,
      expectedShotDirectiveCount: plan.shotDirectiveCount,
      repairQueueCount: plan.repairDirectiveCount
    },
    releaseGateSummary: {
      readyForLongReviewUiIntegration: backendManagedSteps.every((step) => step.status !== "blocked"),
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Long Director UI contract is no-spend review-console evidence only; customer release still requires paid 2-8 minute validation, artifact validation, accepted manual quality/redaction review, and benchmark-grade evidence."
    }
  };
}

function sequenceCountFor(plan: LongFormCreativeIntelligencePlan): number {
  const sequenceIds = new Set<string>();
  for (const directive of plan.shotDirectives) {
    sequenceIds.add(directive.sequenceId);
  }
  return sequenceIds.size || plan.storyBible.emotionalArc.length;
}

function workflowControls(
  plan: LongFormCreativeIntelligencePlan,
  highPriorityRepairCount: number
): readonly LongDirectorUiWorkflowControl[] {
  return [
    control("story_bible", "Story bible", true, true, "Review logline, central question, emotional arc, payoff, and global anchors before spend."),
    control("sequence_board", "Sequence board", true, true, "Approve sequence purposes, bridge intent, and continuity order before prompt compilation."),
    control("continuity_review", "Continuity", true, true, "Inspect identity, product, environment, style, and source-video structure anchors across sequences."),
    control("candidate_review", "Candidates", plan.candidateDirectiveCount > 0 || plan.ideaCandidateCount > 0, true, "Review idea candidates plus multi-candidate coverage for hook, payoff, transition, face, product, and source-video-sensitive shots."),
    control("repair_queue", "Repair queue", highPriorityRepairCount > 0 || plan.repairDirectiveCount > 0, plan.repairDirectiveCount > 0, "Resolve story, sequence, shot, prompt, timeline, or postproduction repair directives before paid validation."),
    control("manual_quality_review", "Manual review", true, true, "Bind paid artifacts to quality/redaction review and benchmark-grade evidence before customer release.")
  ];
}

function backendManagedActions(plan: LongFormCreativeIntelligencePlan): readonly LongDirectorUiAction[] {
  return [
    backendAction("story_bible_generation", "Generate story bible and niche strategy", "ready", "Backend turns story, niche, viral intent, and source-video structure into no-spend creative evidence."),
    backendAction("long_director_policy", "Create Long Director story/continuity/checkpoint policy", plan.directorPlan.status === "blocked" ? "blocked" : "ready", "Long Director separates story, continuity, narrow repair, and checkpoint decisions from Short logic."),
    backendAction("continuity_candidate_planning", "Plan continuity-aware candidate coverage", plan.candidateDirectiveCount > 0 || plan.ideaCandidateCount > 0 ? "ready" : "optional", "Backend identifies idea-level and shot-level candidates that need review before paid validation."),
    backendAction("repair_queue_generation", "Build repair queue", plan.repairDirectiveCount > 0 ? "ready" : "optional", "Backend maps findings to story, sequence, shot, prompt, timeline, or postproduction repair scopes."),
    backendAction("audio_caption_review_summary", "Summarize audio and caption timing", plan.audioCaptionQuality.status === "blocked" ? "blocked" : "ready", "Backend exposes caption coverage and generated-audio timing evidence for review UI."),
    backendAction("provider_spend_gate", "Hold provider spend until approval", "ready", "Provider submission stays disabled in this contract until budget, review, and paid-validation gates are satisfied."),
    backendAction("final_mp4_assembly", "Assemble final MP4 after approved renders", "ready", "DirectorAgent and AssemblyEngine own final assembly after paid render and artifact validation.")
  ];
}

function userActions(plan: LongFormCreativeIntelligencePlan, highPriorityRepairCount: number): readonly LongDirectorUiAction[] {
  return [
    userAction(
      "approve_story_bible",
      "Approve story bible, central question, payoff, and anchors",
      plan.status === "blocked" ? "blocked" : "needs_review",
      true,
      "Long-form output needs story/sequence approval before expensive provider work."
    ),
    userAction(
      "resolve_repair_queue",
      "Resolve high-priority repair directives",
      highPriorityRepairCount > 0 || plan.status === "blocked" ? "needs_review" : "optional",
      highPriorityRepairCount > 0,
      highPriorityRepairCount > 0
        ? `${highPriorityRepairCount} high-priority repair directive(s) should be resolved before paid validation.`
        : "No high-priority repair directives are currently blocking the review UI."
    ),
    userAction(
      "confirm_long_form_budget",
      "Confirm long-form paid validation budget",
      "needs_review",
      true,
      "Long-form provider spend remains outside this no-spend UI contract."
    ),
    userAction(
      "complete_manual_quality_review",
      "Complete paid-artifact quality and redaction review",
      "needs_review",
      true,
      "Customer release requires artifact-bound manual review after paid render output exists."
    ),
    userAction(
      "accept_benchmark_evidence",
      "Accept benchmark-grade semantic, audio, runtime, and governance evidence",
      "needs_review",
      true,
      "Full parity claims need accepted quality evidence, not only local planner scores."
    )
  ];
}

function control(
  mode: LongDirectorUiWorkflowMode,
  label: string,
  recommended: boolean,
  enabled: boolean,
  reason: string
): LongDirectorUiWorkflowControl {
  return { mode, label: safeUiString(label), recommended, enabled, reason: safeUiString(reason) };
}

function backendAction(
  actionId: string,
  label: string,
  status: LongDirectorUiActionStatus,
  reason: string
): LongDirectorUiAction {
  return { actionId, label: safeUiString(label), status, required: true, handledBy: "backend", reason: safeUiString(reason) };
}

function userAction(
  actionId: string,
  label: string,
  status: LongDirectorUiActionStatus,
  required: boolean,
  reason: string
): LongDirectorUiAction {
  return { actionId, label: safeUiString(label), status, required, handledBy: "user", reason: safeUiString(reason) };
}

function safeUiString(value: string): string {
  return redactPrivateSourcePatternText(value)
    .replace(/\s+/g, " ")
    .trim();
}
