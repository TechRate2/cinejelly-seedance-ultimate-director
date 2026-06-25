import type {
  ReviewApprovalDecision,
  ReviewApprovalGate,
  ReviewApprovalSurface
} from "./review-approval.js";
import type { ShortPipelinePlan } from "./short-pipeline.js";

export type ShortMvpUiWorkflowMode =
  | "auto"
  | "single_clip"
  | "storyboard_multishot"
  | "reference_locked"
  | "source_video_guided"
  | "manual_storyboard";

export type ShortMvpUiActionStatus = "ready" | "needs_review" | "blocked" | "optional";

export type ShortMvpUiAudioOptionId = "off" | "english" | "vietnamese" | "chinese";

export interface ShortMvpUiWorkflowControl {
  readonly mode: ShortMvpUiWorkflowMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly reason: string;
}

export interface ShortMvpUiReviewSurfaceSummary {
  readonly surface: ReviewApprovalSurface;
  readonly checkpointCount: number;
  readonly requiredPendingCount: number;
  readonly blockedCount: number;
}

export interface ShortMvpUiReviewCheckpoint {
  readonly checkpointId: string;
  readonly surface: ReviewApprovalSurface;
  readonly label: string;
  readonly subjectId?: string;
  readonly required: boolean;
  readonly decision: ReviewApprovalDecision;
  readonly issueCodes: readonly string[];
  readonly evidenceKeyCount: number;
  readonly reviewerRequiredForApproval: true;
  readonly reviewedAtRequiredForApproval: true;
  readonly canApproveInUi: boolean;
}

export interface ShortMvpUiDirectorGuidance {
  readonly directorId: string;
  readonly status: ShortPipelinePlan["directorPlan"]["status"];
  readonly creativeMode: ShortPipelinePlan["directorPlan"]["creativeMode"];
  readonly durationStrategy: ShortPipelinePlan["directorPlan"]["platformPlan"]["durationStrategy"];
  readonly recommendedWorkflowMode: "single_clip" | "storyboard_multishot";
  readonly hookWindowSeconds: number;
  readonly targetBeatCount: number;
  readonly captionStrategy: ShortPipelinePlan["directorPlan"]["reviewPolicy"]["captionStrategy"];
  readonly sourceVideoControlsStructureOnly: boolean;
  readonly reviewPauseBeforeProviderSpend: boolean;
  readonly findingCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly directives: readonly string[];
}

export interface ShortMvpUiAction {
  readonly actionId: string;
  readonly label: string;
  readonly status: ShortMvpUiActionStatus;
  readonly required: boolean;
  readonly handledBy: "backend" | "user" | "operator";
  readonly reason: string;
}

export interface ShortMvpUiAudioControl {
  readonly optionId: ShortMvpUiAudioOptionId;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly handoffAudioMode: "none" | "guided";
  readonly language?: "en" | "vi" | "zh";
  readonly reason: string;
}

export interface ShortMvpUiContract {
  readonly schemaVersion: "cinejelly.short-mvp-ui-contract.v1";
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly projectId: string;
  readonly requestId?: string;
  readonly planId: string;
  readonly status: ShortPipelinePlan["status"];
  readonly headline: string;
  readonly duration: {
    readonly targetSeconds: number;
    readonly commercialMinSeconds: 15;
    readonly commercialMaxSeconds: 60;
    readonly recommendedWorkflowMode: "single_clip" | "storyboard_multishot";
    readonly providerSingleClipMaxSeconds: 15;
  };
  readonly workflowControls: readonly ShortMvpUiWorkflowControl[];
  readonly audioControls: {
    readonly selectedOptionId: ShortMvpUiAudioOptionId;
    readonly options: readonly ShortMvpUiAudioControl[];
  };
  readonly visualTextPolicy: {
    readonly noOnScreenText: true;
    readonly noCaptions: true;
    readonly noCtaCards: true;
    readonly captionsBurnIn: false;
  };
  readonly review: {
    readonly status: ShortPipelinePlan["reviewApproval"]["status"];
    readonly gate: ReviewApprovalGate;
    readonly checkpointCount: number;
    readonly requiredPendingCount: number;
    readonly surfaces: readonly ShortMvpUiReviewSurfaceSummary[];
    readonly checkpoints: readonly ShortMvpUiReviewCheckpoint[];
    readonly approvalPayloadContract: {
      readonly gate: "pre_render";
      readonly endpointPath: "/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs";
      readonly requiresReviewer: true;
      readonly requiresReviewedAt: true;
      readonly confirmRenderSubmissionDefault: false;
      readonly canQueueProviderSpendFromContractAlone: false;
    };
  };
  readonly director: ShortMvpUiDirectorGuidance;
  readonly render: {
    readonly canCreateRenderJob: boolean;
    readonly canSubmitToProviderNow: false;
    readonly requiresExplicitRenderConfirmation: true;
    readonly endpointPath: "/v1/short-pipeline/render-jobs";
    readonly sessionEndpointPath: "/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs";
    readonly blockedReason: string;
  };
  readonly channelStyle?: {
    readonly profileId: string;
    readonly status: string;
    readonly anchorCount: number;
    readonly canReuseAcrossScripts: boolean;
    readonly requiresRightsReview: boolean;
  };
  readonly backendManagedSteps: readonly ShortMvpUiAction[];
  readonly userRequiredActions: readonly ShortMvpUiAction[];
  readonly outputContract: {
    readonly finalMp4AssemblyManagedByBackend: true;
    readonly captionsCanBeBurnedIn: boolean;
    readonly visibleTextAllowed: false;
    readonly audioMode: "none" | "guided";
    readonly audioLanguage?: "en" | "vi" | "zh";
    readonly generatedAudioIntentCount: number;
    readonly expectedSceneCount: number;
  };
  readonly releaseGateSummary: {
    readonly readyForUiMvpIntegration: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
