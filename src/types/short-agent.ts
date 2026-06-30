import type {
  ShortPipelineConcept,
  ShortPipelinePlatform,
  ShortPipelineScenePlan
} from "./short-pipeline.js";
import type {
  ShortViralCreativeMode,
  ShortViralLever,
  ShortViralPlatformFocus
} from "./short-viral-intelligence.js";

export type ShortAgentStageName =
  | "intake"
  | "research_planner"
  | "evidence_curator"
  | "memory_retriever"
  | "niche_strategist"
  | "candidate_factory"
  | "critic_council"
  | "repair_loop"
  | "seedance_prompt_compiler"
  | "approval_gate"
  | "learning_writer";

export type ShortAgentStageStatus = "completed" | "review_required" | "blocked";

export interface ShortAgentStageRun {
  readonly stage: ShortAgentStageName;
  readonly status: ShortAgentStageStatus;
  readonly agentRole: string;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly nextNode?: ShortAgentStageName;
}

export interface ShortAgentResearchQuestion {
  readonly questionId: string;
  readonly focus: "audience" | "pain" | "proof" | "trend" | "competitor" | "platform" | "claim";
  readonly question: string;
  readonly reason: string;
  readonly toolPolicy: "provided_context_only" | "live_research_optional_after_cost_gate";
}

export interface ShortAgentEvidenceItem {
  readonly evidenceId: string;
  readonly kind: "prompt" | "product" | "brand" | "channel_style" | "reference" | "memory" | "platform" | "claim";
  readonly confidence: number;
  readonly summary: string;
  readonly reviewRequired: boolean;
}

export interface ShortAgentResearchPack {
  readonly schemaVersion: "cinejelly.short-agent-research-pack.v1";
  readonly packId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly questions: readonly ShortAgentResearchQuestion[];
  readonly evidence: readonly ShortAgentEvidenceItem[];
  readonly unresolvedQuestions: readonly string[];
}

export interface ShortAgentMemoryPattern {
  readonly patternId: string;
  readonly source: "seedance_prompt_playbook" | "platform_playbook" | "brand_memory" | "channel_style_memory" | "outcome_memory" | "reference_pattern" | "creative_pattern_learning";
  readonly label: string;
  readonly instruction: string;
  readonly appliesTo: readonly string[];
}

export interface ShortAgentMemoryPack {
  readonly schemaVersion: "cinejelly.short-agent-memory-pack.v1";
  readonly packId: string;
  readonly noSpend: true;
  readonly retrievedPatterns: readonly ShortAgentMemoryPattern[];
  readonly writeIntents: readonly string[];
}

export interface ShortAgentCreativeCandidate {
  readonly candidateId: string;
  readonly sourceConceptId?: string;
  readonly label: string;
  readonly hook: string;
  readonly storyArc: string;
  readonly creativeMode: ShortViralCreativeMode;
  readonly platformFit: ShortViralPlatformFocus;
  readonly sceneRoles: readonly ShortPipelineScenePlan["role"][];
  readonly viralLevers: readonly ShortViralLever[];
  readonly scores: {
    readonly hook: number;
    readonly nicheFit: number;
    readonly retention: number;
    readonly brandSafety: number;
    readonly seedanceFeasibility: number;
    readonly total: number;
  };
  readonly reasons: readonly string[];
}

export interface ShortAgentCritique {
  readonly critiqueId: string;
  readonly reviewer: "viral" | "brand_claim" | "seedance_feasibility" | "continuity" | "platform_native";
  readonly severity: "info" | "warn" | "block";
  readonly message: string;
  readonly repair: string;
  readonly targetId?: string;
}

export interface ShortAgentRepairAction {
  readonly actionId: string;
  readonly targetId: string;
  readonly change: string;
  readonly reason: string;
  readonly applied: true;
}

export type ShortSeedanceProductionAct = "opening" | "development" | "payoff";

export interface ShortSeedanceShotBeatContract {
  readonly act: ShortSeedanceProductionAct;
  readonly timingGoal: string;
  readonly requiredVisualChange: string;
  readonly narrationJob: string;
  readonly audioJob: string;
  readonly endpointJob: string;
}

export interface ShortSeedanceDurationProductionContract {
  readonly schemaVersion: "cinejelly.short-duration-production-contract.v1";
  readonly targetDurationSeconds: number;
  readonly actStructure: readonly ShortSeedanceProductionAct[];
  readonly sceneRoleOrder: readonly ShortPipelineScenePlan["role"][];
  readonly minVisualChangeCount: number;
  readonly completionRule: string;
  readonly timingRisk: "low" | "medium" | "high";
}

export interface ShortSeedanceAudioScriptLine {
  readonly shotId: string;
  readonly sceneId: string;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly languageHint: string;
  readonly voiceStyle: string;
  readonly spokenLine: string;
  readonly delivery: string;
  readonly musicCue: string;
  readonly sfxCue: string;
  readonly externalTtsReady: true;
}

export interface ShortSeedanceShotPrompt {
  readonly shotId: string;
  readonly sceneId: string;
  readonly order: number;
  readonly role: ShortPipelineScenePlan["role"];
  readonly startSecond: number;
  readonly endSecond: number;
  readonly durationSeconds: number;
  readonly firstFrame: string;
  readonly visualPrompt: string;
  readonly camera: string;
  readonly action: string;
  readonly dialogueOrNarration: string;
  readonly caption: string;
  readonly audio: string;
  readonly beatContract: ShortSeedanceShotBeatContract;
  readonly voiceoverLine: string;
  readonly nativeAudioPrompt: string;
  readonly musicCue: string;
  readonly sfxCue: string;
  readonly continuity: string;
  readonly transitionBridge: string;
  readonly referencePolicy: string;
  readonly negativeConstraints: readonly string[];
  readonly qualityChecks: readonly string[];
}

export interface ShortSeedancePromptPack {
  readonly schemaVersion: "cinejelly.short-seedance-prompt-pack.v1";
  readonly promptPackId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly platform: ShortPipelinePlatform;
  readonly platformFocus: ShortViralPlatformFocus;
  readonly creativeMode: ShortViralCreativeMode;
  readonly targetDurationSeconds: number;
  readonly aspectRatio: string;
  readonly masterPrompt: string;
  readonly shotPrompts: readonly ShortSeedanceShotPrompt[];
  readonly durationProductionContract: ShortSeedanceDurationProductionContract;
  readonly audioScript: readonly ShortSeedanceAudioScriptLine[];
  readonly globalNegativeConstraints: readonly string[];
  readonly audioPlan: string;
  readonly captionPlan: string;
  readonly referencePolicy: string;
  readonly sourcePatternOrigins: readonly string[];
}

export interface ShortAgentGraphRun {
  readonly schemaVersion: "cinejelly.short-agent-graph-run.v1";
  readonly graphRunId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly status: "ready" | "review_required" | "blocked";
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly stages: readonly ShortAgentStageRun[];
  readonly researchPack: ShortAgentResearchPack;
  readonly memoryPack: ShortAgentMemoryPack;
  readonly candidates: readonly ShortAgentCreativeCandidate[];
  readonly selectedCandidateId?: string;
  readonly critiques: readonly ShortAgentCritique[];
  readonly repairs: readonly ShortAgentRepairAction[];
  readonly seedancePromptPack: ShortSeedancePromptPack;
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendAgentEvidence: boolean;
    readonly canRenderAfterApproval: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}
