import type { ReviewApprovalSurface } from "./review-approval.js";
import type { ShortPipelinePlan } from "./short-pipeline.js";

export type ShortMvpUiWorkflowMode =
  | "auto"
  | "single_clip"
  | "storyboard_multishot"
  | "reference_locked"
  | "source_video_guided"
  | "manual_storyboard";

export type ShortMvpUiActionStatus = "ready" | "needs_review" | "blocked" | "optional";

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

export interface ShortMvpUiAction {
  readonly actionId: string;
  readonly label: string;
  readonly status: ShortMvpUiActionStatus;
  readonly required: boolean;
  readonly handledBy: "backend" | "user" | "operator";
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
  readonly review: {
    readonly status: ShortPipelinePlan["reviewApproval"]["status"];
    readonly checkpointCount: number;
    readonly requiredPendingCount: number;
    readonly surfaces: readonly ShortMvpUiReviewSurfaceSummary[];
  };
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
    readonly generatedAudioIntentCount: number;
    readonly expectedSceneCount: number;
  };
  readonly releaseGateSummary: {
    readonly readyForUiMvpIntegration: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
