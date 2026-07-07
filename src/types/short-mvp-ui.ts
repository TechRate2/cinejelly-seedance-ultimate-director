import type {
  ReviewApprovalDecision,
  ReviewApprovalGate,
  ReviewApprovalSurface
} from "./review-approval.js";
import type { AudioMode } from "./settings.js";
import type { ShortPipelinePlan, ShortReferenceRemakeBlueprint } from "./short-pipeline.js";

export type ShortMvpUiWorkflowMode =
  | "auto"
  | "single_clip"
  | "storyboard_multishot"
  | "reference_locked"
  | "reference_board"
  | "storyboard_board"
  | "production_bible"
  | "source_video_guided"
  | "video_remake"
  | "manual_storyboard";

export type ShortMvpUiActionStatus = "ready" | "needs_review" | "blocked" | "optional";

export type ShortMvpUiAudioOptionId = "off" | "english" | "vietnamese" | "chinese";

export type ShortMvpUiPipeNavigationMode =
  | "smart_short"
  | "product_kol_ugc"
  | "storyboard_multishot"
  | "video_remake"
  | "production_bible";

export interface ShortMvpUiWorkflowControl {
  readonly mode: ShortMvpUiWorkflowMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly reason: string;
}

export interface ShortMvpUiPipeSetting {
  readonly settingId: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly userAdjustable: boolean;
  readonly backendManaged: boolean;
  readonly group?: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["settings"][number]["group"];
  readonly control?: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["settings"][number]["control"];
  readonly scope?: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["settings"][number]["scope"];
  readonly options?: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["settings"][number]["options"];
  readonly helperText?: string;
}

export interface ShortMvpUiPipeNavigationItem {
  readonly mode: ShortMvpUiPipeNavigationMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly backendPipe: ShortPipelinePlan["videoPipePlan"]["selectedBackendPipe"];
  readonly uiLayout: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["uiLayout"];
  readonly capabilityPolicy: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["capabilityPolicy"];
  readonly effectiveSettings?: ShortPipelinePlan["videoPipePlan"]["pipeOptions"][number]["effectiveSettings"];
  readonly durationSupport: {
    readonly minSeconds: number;
    readonly maxSeconds: number;
    readonly idealRangeSeconds: readonly [number, number];
    readonly supportsLongSequence: boolean;
  };
  readonly seedanceMode: ShortPipelinePlan["seedanceRouting"]["recommendedProviderMode"];
  readonly preferredTier: ShortPipelinePlan["seedanceRouting"]["preferredTier"];
  readonly defaultResolution: ShortPipelinePlan["seedanceRouting"]["resolution"];
  readonly audioDefault: AudioMode;
  readonly returnLastFrameDefault: boolean;
  readonly requiredInputs: readonly string[];
  readonly optionalInputs: readonly string[];
  readonly settings: readonly ShortMvpUiPipeSetting[];
  readonly outputStrategy: string;
  readonly reason: string;
}

export interface ShortMvpUiPipeSelectionSummary {
  readonly selectedMode: ShortPipelinePlan["videoPipePlan"]["selectedMode"];
  readonly selectedBackendPipe: ShortPipelinePlan["videoPipePlan"]["selectedBackendPipe"];
  readonly selectedReason: string;
  readonly selectionReasonCodes: ShortPipelinePlan["videoPipePlan"]["selectionReasonCodes"];
  readonly visualBibleAlignmentStatus: ShortPipelinePlan["videoPipePlan"]["visualBibleAlignment"]["status"];
  readonly visualBibleAlignmentExplanation: string;
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
  readonly handoffAudioMode: AudioMode;
  readonly language?: "en" | "vi" | "zh";
  readonly reason: string;
}

export interface ShortMvpUiCreativeIdeaSummary {
  readonly ideaId: string;
  readonly patternId: string;
  readonly label: string;
  readonly score: number;
  readonly nonCloneSafety: number;
  readonly hook: string;
  readonly proofPlan: string;
}

export interface ShortMvpUiCreativePatternLearning {
  readonly learningId: string;
  readonly patternCount: number;
  readonly candidateCount: number;
  readonly selectedIdeaId?: string;
  readonly selectedIdeaLabel?: string;
  readonly selectedIdeaScore?: number;
  readonly selectedIdeaHook?: string;
  readonly selectedIdeaProofPlan?: string;
  readonly topCandidates: readonly ShortMvpUiCreativeIdeaSummary[];
}

export interface ShortMvpUiMediaReferenceSummary {
  readonly referenceId: string;
  readonly inputRole: ShortPipelinePlan["mediaReferencePlan"][number]["inputRole"];
  readonly promptRole: ShortPipelinePlan["mediaReferencePlan"][number]["promptRole"];
  readonly providerKind: ShortPipelinePlan["mediaReferencePlan"][number]["providerKind"];
  readonly label: string;
  readonly promptTag: string;
  readonly status: ShortPipelinePlan["mediaReferencePlan"][number]["status"];
  readonly rightsStatus: ShortPipelinePlan["mediaReferencePlan"][number]["rightsStatus"];
  readonly priority: ShortPipelinePlan["mediaReferencePlan"][number]["priority"];
  readonly uriPolicy: ShortPipelinePlan["mediaReferencePlan"][number]["uriPolicy"];
  readonly sourceHost?: string;
  readonly includeInProviderHandoff: boolean;
  readonly transferScope: string;
  readonly doNotTransfer: readonly string[];
  readonly issues: readonly string[];
}

export interface ShortMvpUiSeedanceRoutingSummary {
  readonly routingId: string;
  readonly provider: "atlascloud";
  readonly modelFamily: "seedance_2_0";
  readonly recommendedProviderMode: ShortPipelinePlan["seedanceRouting"]["recommendedProviderMode"];
  readonly preferredTier: ShortPipelinePlan["seedanceRouting"]["preferredTier"];
  readonly modelSelectionPolicy: ShortPipelinePlan["seedanceRouting"]["modelSelectionPolicy"];
  readonly preferredConfiguredModelEnv: ShortPipelinePlan["seedanceRouting"]["preferredConfiguredModelEnv"];
  readonly modelAlias: ShortPipelinePlan["seedanceRouting"]["modelAlias"];
  readonly resolution: ShortPipelinePlan["seedanceRouting"]["resolution"];
  readonly ratio: ShortPipelinePlan["seedanceRouting"]["ratio"];
  readonly bitrateMode: ShortPipelinePlan["seedanceRouting"]["bitrateMode"];
  readonly superResolution: boolean;
  readonly returnLastFrame: boolean;
  readonly storyboardRequired: boolean;
  readonly sequentialRenderRecommended: boolean;
  readonly generatedAudioMode: ShortPipelinePlan["seedanceRouting"]["generatedAudioMode"];
  readonly providerClipDurationSeconds: ShortPipelinePlan["seedanceRouting"]["providerClipDurationSeconds"];
  readonly referenceTagCount: number;
  readonly referenceTags: ShortPipelinePlan["seedanceRouting"]["referenceTags"];
  readonly promptRecipe: ShortPipelinePlan["seedanceRouting"]["promptRecipe"];
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly string[];
  readonly canSubmitToProviderNow: false;
}

export interface ShortMvpUiReferenceRemakeSummary {
  readonly blueprintId: string;
  readonly userFacingModeLabel: "Video Remake";
  readonly mode: ShortReferenceRemakeBlueprint["mode"];
  readonly status: ShortReferenceRemakeBlueprint["status"];
  readonly fidelityTarget: ShortReferenceRemakeBlueprint["fidelityTarget"];
  readonly sourceSafetyStatus: ShortReferenceRemakeBlueprint["sourceSafetyStatus"];
  readonly sourceLabel?: string;
  readonly trendVideoIntakeMode: ShortReferenceRemakeBlueprint["trendVideoIntakeMode"];
  readonly replacementSlots: readonly string[];
  readonly lockedElements: readonly string[];
  readonly adherenceTargets: readonly string[];
  readonly sourceBeatMap: readonly string[];
  readonly providerExecutionPlan: readonly string[];
  readonly remakeGuardrails: readonly string[];
  readonly reviewRequiredBeforeRender: true;
  readonly canUseAfterReview: boolean;
}

export interface ShortMvpUiVisualBibleSummary {
  readonly planId: string;
  readonly status: ShortPipelinePlan["visualBiblePlan"]["status"];
  readonly requestedMode: ShortPipelinePlan["visualBiblePlan"]["requestedMode"];
  readonly recommendedPipe: ShortPipelinePlan["visualBiblePlan"]["recommendedPipe"];
  readonly durationBand: ShortPipelinePlan["visualBiblePlan"]["durationBand"];
  readonly imageProviderPolicy: ShortPipelinePlan["visualBiblePlan"]["imageProviderPolicy"];
  readonly assetPlanCount: number;
  readonly requiredAssetPlanCount: number;
  readonly boardCount: number;
  readonly targetClipCount: number;
  readonly continuityStrategy: ShortPipelinePlan["visualBiblePlan"]["sequencePlan"]["continuityStrategy"];
  readonly blocksRenderUntilAssetsApproved: boolean;
  readonly seedanceBindingPlan: readonly string[];
  readonly promptContracts: readonly string[];
  readonly qualityGates: readonly string[];
  readonly warnings: readonly string[];
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
    readonly selectedPipeMinSeconds: number;
    readonly selectedPipeMaxSeconds: number;
    readonly selectedPipeIdealRangeSeconds: readonly [number, number];
    readonly selectedPipeSupportsLongSequence: boolean;
    readonly withinSelectedPipeDurationRange: boolean;
    readonly recommendedWorkflowMode: "single_clip" | "storyboard_multishot";
    readonly providerSingleClipMaxSeconds: 15;
  };
  readonly workflowControls: readonly ShortMvpUiWorkflowControl[];
  readonly pipeSelection: ShortMvpUiPipeSelectionSummary;
  readonly pipeNavigation: readonly ShortMvpUiPipeNavigationItem[];
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
  readonly creativePatternLearning: ShortMvpUiCreativePatternLearning;
  readonly mediaReferences: readonly ShortMvpUiMediaReferenceSummary[];
  readonly seedanceRouting: ShortMvpUiSeedanceRoutingSummary;
  readonly visualBible: ShortMvpUiVisualBibleSummary;
  readonly referenceRemake?: ShortMvpUiReferenceRemakeSummary;
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
    readonly audioMode: AudioMode;
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
