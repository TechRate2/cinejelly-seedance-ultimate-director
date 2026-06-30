import type { LongDirectorCheckpointStage } from "./long-director.js";
import type { LongFormCreativeIntelligencePlan } from "./long-form-creative-intelligence.js";

export type LongDirectorUiWorkflowMode =
  | "story_bible"
  | "sequence_board"
  | "continuity_review"
  | "candidate_review"
  | "repair_queue"
  | "manual_quality_review";

export type LongDirectorUiActionStatus = "ready" | "needs_review" | "blocked" | "optional";

export interface LongDirectorUiWorkflowControl {
  readonly mode: LongDirectorUiWorkflowMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly reason: string;
}

export interface LongDirectorUiAction {
  readonly actionId: string;
  readonly label: string;
  readonly status: LongDirectorUiActionStatus;
  readonly required: boolean;
  readonly handledBy: "backend" | "user" | "operator";
  readonly reason: string;
}

export interface LongDirectorUiContract {
  readonly schemaVersion: "cinejelly.long-director-ui-contract.v1";
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly projectId: string;
  readonly status: LongFormCreativeIntelligencePlan["status"];
  readonly duration: {
    readonly targetSeconds: number;
    readonly commercialMinSeconds: 120;
    readonly commercialMaxSeconds: 480;
    readonly sequenceCount: number;
    readonly shotDirectiveCount: number;
  };
  readonly director: {
    readonly directorId: string;
    readonly status: LongFormCreativeIntelligencePlan["directorPlan"]["status"];
    readonly narrativeMode: LongFormCreativeIntelligencePlan["directorPlan"]["storyPlan"]["narrativeMode"];
    readonly continuityMode: LongFormCreativeIntelligencePlan["directorPlan"]["continuityPlan"]["mode"];
    readonly checkpointStages: readonly LongDirectorCheckpointStage[];
    readonly pauseBeforeProviderSpend: true;
    readonly pauseBeforeCustomerRelease: true;
    readonly findingCount: number;
    readonly blockerCount: number;
    readonly warningCount: number;
    readonly directives: readonly string[];
  };
  readonly creative: {
    readonly qualityScore: number;
    readonly niche: string;
    readonly platformIntent: string;
    readonly desiredViewerAction: string;
    readonly trendPosture: string;
    readonly viewerObjection: string;
    readonly proofStrategy: string;
    readonly shareTrigger: string;
    readonly ideaSeedCount: number;
    readonly ideaCandidateCount: number;
    readonly selectedIdeaCandidateId?: string;
    readonly viralLeverCount: number;
    readonly findingCount: number;
    readonly blockingFindingCount: number;
    readonly reviewRequiredFindingCount: number;
    readonly candidateDirectiveCount: number;
    readonly repairDirectiveCount: number;
    readonly highPriorityRepairCount: number;
  };
  readonly workflowControls: readonly LongDirectorUiWorkflowControl[];
  readonly backendManagedSteps: readonly LongDirectorUiAction[];
  readonly userRequiredActions: readonly LongDirectorUiAction[];
  readonly outputContract: {
    readonly finalMp4AssemblyManagedByBackend: true;
    readonly longFormManualQualityReviewRequired: true;
    readonly benchmarkEvidenceRequired: true;
    readonly canSubmitToProviderNow: false;
    readonly canProceedToRenderAfterApproval: boolean;
    readonly captionCoverageRatio: number;
    readonly generatedAudioIntentCount: number;
    readonly expectedShotDirectiveCount: number;
    readonly repairQueueCount: number;
  };
  readonly releaseGateSummary: {
    readonly readyForLongReviewUiIntegration: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
