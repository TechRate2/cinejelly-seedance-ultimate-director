import type { ReviewApprovalReport } from "./review-approval.js";
import type { ShortChannelStyleProfile, ShortChannelStyleProfileInput } from "./short-channel-style.js";
import type { ShortDirectorPlan } from "./short-director.js";
import type { AspectRatio, AudioMode, BitrateMode, Resolution } from "./settings.js";
import type { ShortAgentGraphRun, ShortSeedancePromptPack } from "./short-agent.js";
import type { ShortCommercialReadinessPlan } from "./short-commercial-readiness.js";
import type {
  ShortReferenceVideoLearningInput,
  ShortReferenceVideoSafetyStatus,
  ShortViralIntelligencePlan
} from "./short-viral-intelligence.js";
import type { ReferenceRole } from "./prompt.js";
import type { ProviderMode, ReferenceKind } from "./provider.js";

export type ShortPipelinePlatform =
  | "tiktok"
  | "douyin"
  | "instagram_reels"
  | "youtube_shorts"
  | "facebook"
  | "linkedin"
  | "website"
  | "marketplace"
  | "unknown";

export type ShortPipelineEmotion =
  | "aspirational"
  | "urgent"
  | "trustworthy"
  | "playful"
  | "premium"
  | "educational"
  | "problem_solution"
  | "unknown";

export type ProductUrlBriefStatus = "ready" | "review_required" | "blocked";

export type ShortPipelineAudioLanguage = "en" | "vi" | "zh";

export type ShortPipelineAudioMode = "off" | "voiceover" | "native" | "hybrid";

export interface ShortPipelineAudioPolicyInput {
  readonly mode?: ShortPipelineAudioMode;
  readonly language?: ShortPipelineAudioLanguage;
  readonly voiceStyle?: string;
}

export interface ShortPipelineAudioPolicy {
  readonly schemaVersion: "cinejelly.short-audio-policy.v1";
  readonly mode: ShortPipelineAudioMode;
  readonly language?: ShortPipelineAudioLanguage;
  readonly languageLabel?: "English" | "Vietnamese" | "Chinese";
  readonly voiceStyle?: string;
  readonly renderAudioMode: AudioMode;
  readonly generatedAudioIntentEnabled: boolean;
  readonly nativeProviderAudioEnabled: boolean;
  readonly providerAudioPromptEnabled: boolean;
  readonly externalAudioScriptEnabled: boolean;
  readonly reviewRequired: true;
}

export interface ShortPipelineVisualTextPolicy {
  readonly schemaVersion: "cinejelly.short-visual-text-policy.v1";
  readonly mode: "no_visible_text";
  readonly allowOnScreenText: false;
  readonly allowCaptions: false;
  readonly allowCtaCards: false;
  readonly allowTextOverlays: false;
  readonly allowLogoText: "reference_asset_only";
  readonly promptConstraint: string;
}

export type ProductUrlEvidenceStatus =
  | "not_provided"
  | "clean_https"
  | "unsafe_query_redacted"
  | "invalid_url"
  | "blocked_non_https"
  | "blocked_localhost"
  | "blocked_embedded_credentials";

export type ProductClaimRisk = "low" | "medium" | "high";

export type ProductUrlIssueCode =
  | "missing_product_url"
  | "invalid_product_url"
  | "non_https_product_url"
  | "localhost_product_url"
  | "embedded_url_credentials"
  | "unsafe_query_redacted"
  | "missing_product_title"
  | "missing_product_benefits"
  | "missing_product_image_rights"
  | "claim_substantiation_required"
  | "unsafe_product_text";

export interface ProductUrlSnapshotInput {
  readonly productTitle?: string;
  readonly pageTitle?: string;
  readonly metaDescription?: string;
  readonly category?: string;
  readonly priceText?: string;
  readonly imageUrls?: readonly string[];
  readonly benefits?: readonly string[];
  readonly claims?: readonly string[];
  readonly targetBuyer?: string;
  readonly cta?: string;
  readonly pageText?: string;
}

export interface ProductUrlBriefInput {
  readonly productUrl?: string;
  readonly snapshot?: ProductUrlSnapshotInput;
}

export interface ProductUrlSourceEvidence {
  readonly status: ProductUrlEvidenceStatus;
  readonly sourceUrlSha256?: string;
  readonly sourceHost?: string;
  readonly sourcePathSha256?: string;
  readonly queryKeyCount: number;
  readonly unsafeQueryKeyCount: number;
}

export interface ProductImageEvidence {
  readonly imageId: string;
  readonly status: ProductUrlEvidenceStatus;
  readonly imageUrlSha256?: string;
  readonly sourceHost?: string;
  readonly rightsStatus: "unverified" | "operator_approved";
}

export interface ProductClaimInventoryItem {
  readonly claimId: string;
  readonly text: string;
  readonly risk: ProductClaimRisk;
  readonly confidence: number;
  readonly substantiationRequired: boolean;
  readonly source: "snapshot_claim" | "benefit" | "description" | "operator_note";
}

export interface ProductUrlBriefIssue {
  readonly code: ProductUrlIssueCode;
  readonly severity: "warn" | "block";
  readonly message: string;
  readonly repair: string;
}

export interface ProductUrlBrief {
  readonly schemaVersion: "cinejelly.product-url-brief.v1";
  readonly briefId: string;
  readonly status: ProductUrlBriefStatus;
  readonly source: ProductUrlSourceEvidence;
  readonly title?: string;
  readonly category?: string;
  readonly priceText?: string;
  readonly targetBuyer?: string;
  readonly benefits: readonly string[];
  readonly ctaCandidates: readonly string[];
  readonly images: readonly ProductImageEvidence[];
  readonly claimInventory: readonly ProductClaimInventoryItem[];
  readonly missingFields: readonly string[];
  readonly issues: readonly ProductUrlBriefIssue[];
  readonly sourcePatternOrigins: readonly string[];
}

export type BrandKitStatus = "ready" | "review_required" | "blocked";

export type BrandKitIssueCode =
  | "missing_brand_name"
  | "missing_tone"
  | "missing_claim_policy"
  | "forbidden_claim_present"
  | "unsafe_brand_asset_uri"
  | "unapproved_brand_asset";

export interface BrandKitInput {
  readonly brandId?: string;
  readonly brandName?: string;
  readonly tone?: string;
  readonly language?: string;
  readonly visualStyle?: string;
  readonly colorPalette?: readonly string[];
  readonly logoAssetUris?: readonly string[];
  readonly approvedAssetIds?: readonly string[];
  readonly allowedClaims?: readonly string[];
  readonly forbiddenClaims?: readonly string[];
  readonly ctaRules?: readonly string[];
  readonly voicePreferences?: readonly string[];
  readonly complianceNotes?: readonly string[];
}

export interface BrandKitIssue {
  readonly code: BrandKitIssueCode;
  readonly severity: "warn" | "block";
  readonly message: string;
  readonly repair: string;
  readonly subject?: string;
}

export interface BrandKitEvaluation {
  readonly schemaVersion: "cinejelly.brand-kit-evaluation.v1";
  readonly brandKitId: string;
  readonly status: BrandKitStatus;
  readonly brandName?: string;
  readonly tone?: string;
  readonly language?: string;
  readonly visualStyle?: string;
  readonly colorPalette: readonly string[];
  readonly allowedClaimCount: number;
  readonly forbiddenClaimCount: number;
  readonly ctaRuleCount: number;
  readonly voicePreferenceCount: number;
  readonly approvedAssetCount: number;
  readonly issues: readonly BrandKitIssue[];
  readonly sourcePatternOrigins: readonly string[];
}

export type WorkflowTemplateCategory =
  | "product_ad"
  | "ugc_ad"
  | "explainer"
  | "founder_story"
  | "testimonial"
  | "comparison"
  | "cinematic_reveal";

export interface WorkflowTemplatePlanningHint {
  readonly kind: "hook" | "proof" | "scene" | "audio" | "visual" | "claim" | "payoff";
  readonly text: string;
}

export interface WorkflowTemplateDefinition {
  readonly templateId: string;
  readonly label: string;
  readonly category: WorkflowTemplateCategory;
  readonly platforms: readonly ShortPipelinePlatform[];
  readonly durationRangeSeconds: readonly [number, number];
  readonly planningHints: readonly WorkflowTemplatePlanningHint[];
  readonly approvalSurfaces: readonly ["scene", "audio", "caption", "claim"];
  readonly sourcePatternOrigins: readonly string[];
}

export interface WorkflowTemplateSuggestion {
  readonly templateId: string;
  readonly label: string;
  readonly category: WorkflowTemplateCategory;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly usePolicy: "optional_accelerator";
  readonly planningHints: readonly WorkflowTemplatePlanningHint[];
}

export interface ShortPipelineIntent {
  readonly businessGoal: string;
  readonly audience: string;
  readonly platform: ShortPipelinePlatform;
  readonly emotion: ShortPipelineEmotion;
  readonly targetDurationSeconds: number;
  readonly aspectRatio: AspectRatio;
  readonly offer?: string;
  readonly missingInputs: readonly string[];
  readonly inferredFrom: readonly string[];
}

export interface ShortPipelineScenePlan {
  readonly sceneId: string;
  readonly order: number;
  readonly role: "hook" | "problem" | "proof" | "demo" | "offer" | "payoff";
  readonly goal: string;
  readonly visualDirection: string;
  readonly narration: string;
  readonly caption: string;
  readonly claimIds: readonly string[];
}

export interface ShortPipelineConcept {
  readonly conceptId: string;
  readonly label: string;
  readonly angle: string;
  readonly hook: string;
  readonly riskNotes: readonly string[];
}

export type ShortMediaReferenceInputRole =
  | "kol"
  | "creator"
  | "product"
  | "wardrobe"
  | "clothing"
  | "background"
  | "environment"
  | "first_frame"
  | "last_frame"
  | "style"
  | "motion"
  | "camera"
  | "audio"
  | "source_video";

export type ShortMediaReferenceInputKind = "image" | "video" | "audio";

export type ShortMediaReferenceRightsStatus =
  | "operator_approved"
  | "needs_review"
  | "unknown";

export interface ShortMediaReferenceInput {
  readonly role: ShortMediaReferenceInputRole;
  readonly uri: string;
  readonly label?: string;
  readonly kind?: ShortMediaReferenceInputKind;
  readonly rightsStatus?: ShortMediaReferenceRightsStatus;
  readonly priority?: "primary" | "supporting";
  readonly description?: string;
}

export type ShortMediaReferencePlanStatus =
  | "ready"
  | "review_required"
  | "blocked";

export type ShortMediaReferenceUriPolicy =
  | "asset_id_retained"
  | "upload_handle_retained"
  | "clean_https_hashed"
  | "blocked_unsafe_or_private";

export interface ShortMediaReferencePlan {
  readonly schemaVersion: "cinejelly.short-media-reference-plan.v1";
  readonly referenceId: string;
  readonly inputRole: ShortMediaReferenceInputRole;
  readonly promptRole: ReferenceRole;
  readonly providerKind: ReferenceKind;
  readonly label: string;
  readonly promptTag: string;
  readonly status: ShortMediaReferencePlanStatus;
  readonly rightsStatus: ShortMediaReferenceRightsStatus;
  readonly priority: "primary" | "supporting";
  readonly uriPolicy: ShortMediaReferenceUriPolicy;
  readonly uriSha256?: string;
  readonly sourceHost?: string;
  readonly providerUri?: string;
  readonly providerAssetId?: string;
  readonly includeInProviderHandoff: boolean;
  readonly transferScope: string;
  readonly doNotTransfer: readonly string[];
  readonly issues: readonly string[];
}

export type ShortSeedanceModelTier = "mini" | "fast" | "standard";

export type ShortSeedancePromptRecipeName =
  | "text_to_video_niche_short"
  | "image_to_video_product_or_kol"
  | "reference_to_video_multi_reference"
  | "reference_to_video_remake_blueprint"
  | "reference_board_to_video_sequence";

export interface ShortSeedanceReferenceTag {
  readonly tag: string;
  readonly role: ReferenceRole;
  readonly providerKind: ReferenceKind;
  readonly label: string;
  readonly transferScope: string;
  readonly priority: "primary" | "supporting";
}

export interface ShortSeedanceRoutingPlan {
  readonly schemaVersion: "cinejelly.short-seedance-routing.v1";
  readonly routingId: string;
  readonly provider: "atlascloud";
  readonly modelFamily: "seedance_2_0";
  readonly recommendedProviderMode: ProviderMode;
  readonly preferredTier: ShortSeedanceModelTier;
  readonly modelSelectionPolicy: "admin_allowlist_capability_first";
  readonly preferredConfiguredModelEnv: "ATLASCLOUD_SEEDANCE_STANDARD_MODEL" | "ATLASCLOUD_SEEDANCE_FAST_MODEL" | "ATLASCLOUD_SEEDANCE_MINI_MODEL" | "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON";
  readonly modelAlias: "Seedance 2.0" | "Seedance 2.0 Fast" | "Seedance 2.0 Mini";
  readonly resolution: Resolution;
  readonly ratio: AspectRatio;
  readonly bitrateMode: "standard" | "high";
  readonly superResolution: boolean;
  readonly returnLastFrame: boolean;
  readonly providerClipDurationSeconds: {
    readonly min: 4;
    readonly max: 15;
    readonly targetPerClip: number;
  };
  readonly storyboardRequired: boolean;
  readonly sequentialRenderRecommended: boolean;
  readonly generatedAudioMode: AudioMode;
  readonly referenceTags: readonly ShortSeedanceReferenceTag[];
  readonly promptRecipe: {
    readonly name: ShortSeedancePromptRecipeName;
    readonly modeInstruction: string;
    readonly referenceInstruction: string;
    readonly shotPromptRules: readonly string[];
    readonly negativeRules: readonly string[];
  };
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly string[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendModelRoutingEvidence: true;
    readonly canSubmitToProviderNow: false;
    readonly releaseBlocker: string;
  };
}

export interface ShortSeedanceSettingsInput {
  readonly resolution?: Resolution;
  readonly bitrateMode?: BitrateMode;
  readonly returnLastFrame?: boolean;
}

export type ShortVisualBibleMode =
  | "auto"
  | "off"
  | "reference_board"
  | "storyboard_board"
  | "production_bible";

export type ShortVisualBibleStatus =
  | "not_needed"
  | "recommended"
  | "required";

export type ShortVisualBibleRecommendedPipe =
  | "normal_short_pipe"
  | "product_kol_reference_pipe"
  | "reference_board_pipe"
  | "storyboard_board_pipe"
  | "video_remake_pipe"
  | "long_sequence_bible_pipe";

export type ShortVideoBackendPipe =
  | "normal_short_pipe"
  | "product_kol_reference_pipe"
  | "storyboard_board_pipe"
  | "video_remake_pipe"
  | "long_sequence_bible_pipe";

export type ShortVisualBibleDurationBand =
  | "single_clip_5_15"
  | "short_multishot_15_60"
  | "midform_sequence_60_180"
  | "long_sequence_180_480";

export type ShortVisualBibleAssetRole =
  | "identity_sheet"
  | "product_sheet"
  | "environment_board"
  | "style_board"
  | "first_frame_board"
  | "storyboard_board"
  | "sequence_board"
  | "audio_timing_board";

export type ShortVisualBibleAssetSourcePolicy =
  | "operator_supplied_asset"
  | "generate_before_seedance"
  | "derive_from_existing_reference"
  | "optional_quality_upgrade";

export type ShortVisualBibleImagePromptLayout =
  | "identity_multi_view_sheet"
  | "product_geometry_sheet"
  | "environment_set_board"
  | "style_light_camera_board"
  | "first_frame_lock"
  | "storyboard_panel_grid"
  | "sequence_panel_grid"
  | "audio_timing_board";

export interface ShortVisualBibleImagePromptPack {
  readonly schemaVersion: "cinejelly.short-visual-bible-image-prompt.v1";
  readonly provider: "provider_neutral_image_model";
  readonly layout: ShortVisualBibleImagePromptLayout;
  readonly outputPolicy: "single_image_reference_sheet";
  readonly minPanelOrViewCount: number;
  readonly maxPanelOrViewCount: number;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly seedanceBindingInstruction: string;
  readonly approvalChecklist: readonly string[];
}

export interface ShortVisualBibleInput {
  readonly mode?: ShortVisualBibleMode;
  readonly imageProviderPolicy?: "provider_neutral" | "openai_compatible" | "atlascloud" | "operator_supplied";
  readonly maxBoardCount?: number;
  readonly requireBeforeRender?: boolean;
}

export interface ShortVisualBibleAssetPlan {
  readonly schemaVersion: "cinejelly.short-visual-bible-asset.v1";
  readonly assetPlanId: string;
  readonly role: ShortVisualBibleAssetRole;
  readonly label: string;
  readonly sourcePolicy: ShortVisualBibleAssetSourcePolicy;
  readonly requiredBeforeRender: boolean;
  readonly promptRole?: ReferenceRole;
  readonly providerKind?: ReferenceKind;
  readonly preferredPromptTag?: string;
  readonly minimumViewCount: number;
  readonly maximumImageCount: number;
  readonly promptBrief: string;
  readonly imagePromptPack: ShortVisualBibleImagePromptPack;
  readonly seedanceBindingPriority: "primary" | "supporting";
  readonly sourceEvidence: readonly string[];
}

export interface ShortVisualBibleSequencePlan {
  readonly boardCount: number;
  readonly targetClipCount: number;
  readonly maxSecondsPerBoard: number;
  readonly seedanceClipDurationSeconds: {
    readonly min: 4;
    readonly max: 15;
  };
  readonly continuityStrategy: "single_reference_board" | "multi_board_sequence" | "sequence_bible_with_last_frame_chaining";
  readonly durationGuidance: readonly string[];
}

export type ShortVisualBibleExecutionMode =
  | "text_only_no_board"
  | "reference_board_to_seedance"
  | "storyboard_board_to_seedance"
  | "video_remake_to_seedance"
  | "production_bible_to_seedance";

export type ShortVisualBibleClipExecutionStrategy =
  | "single_clip"
  | "multi_clip_last_frame_chaining"
  | "sequence_bible_last_frame_chaining";

export type ShortVisualBibleExecutionStage =
  | "reference_asset_planning"
  | "seedance_reference_binding"
  | "seedance_clip_rendering"
  | "continuity_review";

export interface ShortVisualBibleExecutionStep {
  readonly order: number;
  readonly stage: ShortVisualBibleExecutionStage;
  readonly title: string;
  readonly provider: "operator" | "image_model" | "seedance" | "review_gate";
  readonly providerMode?: ProviderMode;
  readonly inputAssetRoles: readonly ShortVisualBibleAssetRole[];
  readonly outputAssetRole?: ShortVisualBibleAssetRole;
  readonly outputReferenceTag?: string;
  readonly requiresHumanApproval: boolean;
  readonly instruction: string;
}

export interface ShortVisualBibleDurationCoverage {
  readonly targetDurationSeconds: number;
  readonly targetClipCount: number;
  readonly targetSecondsPerClip: number;
  readonly requiresStartMiddleEnd: boolean;
  readonly coverageRule: string;
}

export interface ShortVisualBibleExecutionBlueprint {
  readonly schemaVersion: "cinejelly.short-visual-bible-execution-blueprint.v1";
  readonly mode: ShortVisualBibleExecutionMode;
  readonly imageProviderRole: "none" | "provider_neutral_reference_board_generator";
  readonly seedanceSubmissionMode: ProviderMode;
  readonly clipExecutionStrategy: ShortVisualBibleClipExecutionStrategy;
  readonly referenceTagBindingOrder: readonly string[];
  readonly durationCoverage: ShortVisualBibleDurationCoverage;
  readonly steps: readonly ShortVisualBibleExecutionStep[];
  readonly handoffSummary: string;
}

export interface ShortVisualBiblePlan {
  readonly schemaVersion: "cinejelly.short-visual-bible-plan.v1";
  readonly planId: string;
  readonly status: ShortVisualBibleStatus;
  readonly requestedMode: ShortVisualBibleMode;
  readonly recommendedPipe: ShortVisualBibleRecommendedPipe;
  readonly durationBand: ShortVisualBibleDurationBand;
  readonly imageProviderPolicy: NonNullable<ShortVisualBibleInput["imageProviderPolicy"]>;
  readonly sourcePatternOrigins: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly assetPlans: readonly ShortVisualBibleAssetPlan[];
  readonly sequencePlan: ShortVisualBibleSequencePlan;
  readonly executionBlueprint: ShortVisualBibleExecutionBlueprint;
  readonly seedanceBindingPlan: readonly string[];
  readonly promptContracts: readonly string[];
  readonly qualityGates: readonly string[];
  readonly guardrails: readonly string[];
  readonly warnings: readonly string[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendVisualBibleEvidence: true;
    readonly blocksRenderUntilAssetsApproved: boolean;
    readonly releaseBlocker: string;
  };
}

export type ShortReferenceRemakeMode =
  | "structure_remake"
  | "rights_cleared_close_remake";

export type ShortReferenceRemakeStatus =
  | "ready"
  | "review_required"
  | "blocked";

export type ShortReferenceRemakeFidelityTarget =
  | "structure_locked"
  | "rights_cleared_close";

export type ShortReferenceTrendVideoIntakeMode =
  | "operator_summary_only"
  | "uploaded_or_clean_https_reference";

export interface ShortReferenceRemakeBlueprint {
  readonly schemaVersion: "cinejelly.short-reference-remake-blueprint.v1";
  readonly blueprintId: string;
  readonly userFacingModeLabel: "Video Remake";
  readonly mode: ShortReferenceRemakeMode;
  readonly status: ShortReferenceRemakeStatus;
  readonly sourcePatternId?: string;
  readonly sourceSafetyStatus: ShortReferenceVideoSafetyStatus;
  readonly sourceLabel?: string;
  readonly sourceHost?: string;
  readonly fidelityTarget: ShortReferenceRemakeFidelityTarget;
  readonly trendVideoIntakeMode: ShortReferenceTrendVideoIntakeMode;
  readonly replacementSlots: readonly string[];
  readonly lockedElements: readonly string[];
  readonly adherenceTargets: readonly string[];
  readonly sourceBeatMap: readonly string[];
  readonly providerExecutionPlan: readonly string[];
  readonly remakeGuardrails: readonly string[];
  readonly reviewRequiredBeforeRender: true;
  readonly canUseAfterReview: boolean;
}

export type ShortVideoPipeMode =
  | "smart_short"
  | "product_kol_ugc"
  | "storyboard_multishot"
  | "video_remake"
  | "production_bible";

export type ShortVideoPipeSettingGroup =
  | "creative"
  | "input"
  | "model"
  | "render"
  | "audio"
  | "review";

export type ShortVideoPipeSettingControl =
  | "slider"
  | "select"
  | "toggle"
  | "asset_picker"
  | "review_gate"
  | "backend_auto";

export type ShortVideoPipeSettingScope =
  | "primary"
  | "advanced"
  | "backend_only";

export interface ShortVideoPipeSettingOption {
  readonly value: string | number | boolean;
  readonly label: string;
  readonly recommended: boolean;
}

export interface ShortVideoPipeSetting {
  readonly settingId: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly userAdjustable: boolean;
  readonly backendManaged: boolean;
  readonly group?: ShortVideoPipeSettingGroup;
  readonly control?: ShortVideoPipeSettingControl;
  readonly scope?: ShortVideoPipeSettingScope;
  readonly options?: readonly ShortVideoPipeSettingOption[];
  readonly helperText?: string;
}

export type ShortVideoPipeNavigationGroup =
  | "short"
  | "remake"
  | "production";

export type ShortVideoPipeDurationClass =
  | "single_clip_short"
  | "multi_shot_short"
  | "production_sequence";

export interface ShortVideoPipeUiLayout {
  readonly navigationGroup: ShortVideoPipeNavigationGroup;
  readonly navigationOrder: number;
  readonly displayStyle: "navigation_tab";
  readonly primarySettingIds: readonly string[];
  readonly advancedSettingIds: readonly string[];
}

export interface ShortVideoPipeCapabilityPolicy {
  readonly durationClass: ShortVideoPipeDurationClass;
  readonly providerClipMaxSeconds: 15;
  readonly providerModes: readonly ProviderMode[];
  readonly modelTierOptions: readonly ShortSeedanceModelTier[];
  readonly defaultTier: ShortSeedanceModelTier;
  readonly resolutionOptions: readonly Resolution[];
  readonly defaultResolution: Resolution;
  readonly autoRouteProviderMode: true;
  readonly userCannotPickRawProviderModel: true;
  readonly supportsReferenceAssets: boolean;
  readonly supportsSourceVideoLearning: boolean;
  readonly supportsVisualBible: boolean;
  readonly supportsLastFrameChaining: boolean;
  readonly supportsProductionSequence: boolean;
  readonly requiresReviewBeforeSpend: true;
}

export interface ShortVideoPipeEffectiveSettings {
  readonly resolvedForCurrentPlan: true;
  readonly providerMode: ProviderMode;
  readonly tier: ShortSeedanceModelTier;
  readonly resolution: Resolution;
  readonly bitrateMode: BitrateMode;
  readonly superResolution: boolean;
  readonly audioMode: AudioMode;
  readonly returnLastFrame: boolean;
  readonly promptRecipeName: ShortSeedancePromptRecipeName;
}

export type ShortVideoPipeSelectionReasonCode =
  | "smart_short_text_only"
  | "product_or_kol_reference_present"
  | "storyboard_needed_for_duration_or_missing_references"
  | "video_remake_blueprint_present"
  | "production_bible_or_long_duration"
  | "visual_bible_reference_board_asset_workflow"
  | "visual_bible_product_reference_needs_assets";

export type ShortVideoPipeVisualBibleAlignmentStatus =
  | "aligned"
  | "reference_board_asset_workflow"
  | "storyboard_until_references"
  | "duration_override"
  | "canonical_backend_override";

export interface ShortVideoPipeVisualBibleAlignment {
  readonly status: ShortVideoPipeVisualBibleAlignmentStatus;
  readonly visualBibleRecommendedPipe: ShortVisualBibleRecommendedPipe;
  readonly selectedBackendPipe: ShortVideoBackendPipe;
  readonly explanation: string;
}

export interface ShortVideoPipeOption {
  readonly mode: ShortVideoPipeMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly backendPipe: ShortVideoBackendPipe;
  readonly uiLayout: ShortVideoPipeUiLayout;
  readonly capabilityPolicy: ShortVideoPipeCapabilityPolicy;
  readonly effectiveSettings?: ShortVideoPipeEffectiveSettings;
  readonly durationSupport: {
    readonly minSeconds: number;
    readonly maxSeconds: number;
    readonly idealRangeSeconds: readonly [number, number];
    readonly supportsLongSequence: boolean;
  };
  readonly seedanceMode: ProviderMode;
  readonly preferredTier: ShortSeedanceModelTier;
  readonly defaultResolution: Resolution;
  readonly audioDefault: AudioMode;
  readonly returnLastFrameDefault: boolean;
  readonly requiredInputs: readonly string[];
  readonly optionalInputs: readonly string[];
  readonly settings: readonly ShortVideoPipeSetting[];
  readonly outputStrategy: string;
  readonly reason: string;
}

export interface ShortVideoPipeCatalogItem {
  readonly mode: ShortVideoPipeMode;
  readonly label: string;
  readonly backendPipe: ShortVideoBackendPipe;
  readonly uiLayout: ShortVideoPipeUiLayout;
  readonly capabilityPolicy: ShortVideoPipeCapabilityPolicy;
  readonly durationSupport: {
    readonly minSeconds: number;
    readonly maxSeconds: number;
    readonly idealRangeSeconds: readonly [number, number];
    readonly supportsLongSequence: boolean;
  };
  readonly seedanceModes: readonly ProviderMode[];
  readonly defaultSeedanceMode: ProviderMode;
  readonly preferredTier: ShortSeedanceModelTier;
  readonly defaultResolution: Resolution;
  readonly audioDefault: AudioMode;
  readonly returnLastFrameDefault: boolean;
  readonly requiredInputs: readonly string[];
  readonly optionalInputs: readonly string[];
  readonly settings: readonly ShortVideoPipeSetting[];
  readonly outputStrategy: string;
  readonly reason: string;
}

export interface ShortVideoPipeCatalog {
  readonly schemaVersion: "cinejelly.short-video-pipe-catalog.v1";
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly pipeCount: 5;
  readonly defaultResolution: Resolution;
  readonly defaultAudioMode: AudioMode;
  readonly defaultReturnLastFrame: true;
  readonly pipes: readonly ShortVideoPipeCatalogItem[];
  readonly releaseGateSummary: {
    readonly canUseAsUiNavigationEvidence: true;
    readonly canSubmitToProviderNow: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}

export interface ShortVideoPipePlan {
  readonly schemaVersion: "cinejelly.short-video-pipe-plan.v1";
  readonly pipePlanId: string;
  readonly selectedMode: ShortVideoPipeMode;
  readonly selectedBackendPipe: ShortVideoBackendPipe;
  readonly selectedReason: string;
  readonly selectionReasonCodes: readonly ShortVideoPipeSelectionReasonCode[];
  readonly visualBibleAlignment: ShortVideoPipeVisualBibleAlignment;
  readonly pipeOptions: readonly ShortVideoPipeOption[];
  readonly sourcePatternOrigins: readonly string[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendPipeEvidence: true;
    readonly canSubmitToProviderNow: false;
    readonly releaseBlocker: string;
  };
}

export interface ShortPipelinePlanInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly userPrompt?: string;
  readonly product?: ProductUrlBriefInput;
  readonly brandKit?: BrandKitInput;
  readonly channelStyle?: ShortChannelStyleProfileInput;
  readonly mediaReferences?: readonly ShortMediaReferenceInput[];
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
  readonly preferredTemplateId?: string;
  readonly allowTemplateSuggestions?: boolean;
  readonly targetPlatform?: ShortPipelinePlatform;
  readonly targetDurationSeconds?: number;
  readonly targetAspectRatio?: AspectRatio;
  readonly audio?: ShortPipelineAudioPolicyInput;
  readonly seedanceSettings?: ShortSeedanceSettingsInput;
  readonly visualBible?: ShortVisualBibleInput;
  readonly generatedAt?: Date;
}

export interface ShortPipelineReleaseGateSummary {
  readonly canRenderAfterApproval: boolean;
  readonly canUseAsNoSpendPlanningEvidence: boolean;
  readonly canReleaseToCustomerTraffic: false;
  readonly releaseBlocker: string;
}

export interface ShortPipelinePlan {
  readonly schemaVersion: "cinejelly.short-pipeline-plan.v1";
  readonly planId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly status: "approval_required" | "changes_requested" | "blocked";
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly intent: ShortPipelineIntent;
  readonly productBrief?: ProductUrlBrief;
  readonly brandKitEvaluation?: BrandKitEvaluation;
  readonly channelStyleProfile?: ShortChannelStyleProfile;
  readonly templateSuggestions: readonly WorkflowTemplateSuggestion[];
  readonly selectedTemplate?: WorkflowTemplateSuggestion;
  readonly templatePolicy: "none" | "suggested_optional" | "operator_selected_optional";
  readonly dynamicWorkflowRequired: boolean;
  readonly audioPolicy: ShortPipelineAudioPolicy;
  readonly visualTextPolicy: ShortPipelineVisualTextPolicy;
  readonly directorPlan: ShortDirectorPlan;
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
  readonly visualBiblePlan: ShortVisualBiblePlan;
  readonly videoPipePlan: ShortVideoPipePlan;
  readonly seedanceRouting: ShortSeedanceRoutingPlan;
  readonly viralIntelligence: ShortViralIntelligencePlan;
  readonly referenceRemakeBlueprint?: ShortReferenceRemakeBlueprint;
  readonly agentGraph?: ShortAgentGraphRun;
  readonly seedancePromptPack?: ShortSeedancePromptPack;
  readonly reviewApproval: ReviewApprovalReport;
  readonly commercialReadiness: ShortCommercialReadinessPlan;
  readonly releaseGateSummary: ShortPipelineReleaseGateSummary;
  readonly nextActions: readonly string[];
}

export type ShortPipelineConversationRole = "user" | "assistant" | "operator";

export type ShortPipelineTemplatePreference =
  | "suggest_optional"
  | "user_requested_template"
  | "user_rejected_templates";

export type ShortPipelineUserReviewState =
  | "needs_review"
  | "revision_requested"
  | "approval_intent_detected";

export interface ShortPipelineConversationMessageInput {
  readonly role?: ShortPipelineConversationRole;
  readonly text: string;
  readonly createdAt?: Date;
}

export interface ShortPipelineConversationInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly messages: readonly ShortPipelineConversationMessageInput[];
  readonly product?: ProductUrlBriefInput;
  readonly brandKit?: BrandKitInput;
  readonly channelStyle?: ShortChannelStyleProfileInput;
  readonly mediaReferences?: readonly ShortMediaReferenceInput[];
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
  readonly preferredTemplateId?: string;
  readonly allowTemplateSuggestions?: boolean;
  readonly targetPlatform?: ShortPipelinePlatform;
  readonly targetDurationSeconds?: number;
  readonly targetAspectRatio?: AspectRatio;
  readonly audio?: ShortPipelineAudioPolicyInput;
  readonly seedanceSettings?: ShortSeedanceSettingsInput;
  readonly visualBible?: ShortVisualBibleInput;
  readonly generatedAt?: Date;
}

export interface ShortPipelineConversationTurn {
  readonly turnId: string;
  readonly role: ShortPipelineConversationRole;
  readonly createdAt: Date;
  readonly messageSha256: string;
  readonly publicSummary: string;
  readonly rawMessageStored: false;
}

export interface ShortPipelineConversationAnalysis {
  readonly schemaVersion: "cinejelly.short-pipeline-conversation-analysis.v1";
  readonly businessGoal: string;
  readonly audience: string;
  readonly platform: ShortPipelinePlatform;
  readonly emotion: ShortPipelineEmotion;
  readonly templatePreference: ShortPipelineTemplatePreference;
  readonly userReviewState: ShortPipelineUserReviewState;
  readonly requestedChanges: readonly string[];
  readonly constraints: readonly string[];
  readonly riskSignals: readonly string[];
  readonly missingInputs: readonly string[];
  readonly sourcePatternOrigins: readonly string[];
}

export interface ShortPipelineConversationReleaseGateSummary {
  readonly canUseAsNoSpendConversationEvidence: boolean;
  readonly canRenderAfterFormalApproval: boolean;
  readonly canReleaseToCustomerTraffic: false;
  readonly releaseBlocker: string;
}

export interface ShortPipelineConversationSession {
  readonly schemaVersion: "cinejelly.short-pipeline-conversation-session.v1";
  readonly sessionId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly rawTranscriptStored: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly turns: readonly ShortPipelineConversationTurn[];
  readonly analysis: ShortPipelineConversationAnalysis;
  readonly plan: ShortPipelinePlan;
  readonly releaseGateSummary: ShortPipelineConversationReleaseGateSummary;
  readonly nextActions: readonly string[];
}
