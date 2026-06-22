import type { ReviewApprovalReport } from "./review-approval.js";
import type { ShortChannelStyleProfile, ShortChannelStyleProfileInput } from "./short-channel-style.js";
import type { AspectRatio } from "./settings.js";
import type { ShortAgentGraphRun, ShortSeedancePromptPack } from "./short-agent.js";
import type { ShortCommercialReadinessPlan } from "./short-commercial-readiness.js";
import type {
  ShortReferenceVideoLearningInput,
  ShortViralIntelligencePlan
} from "./short-viral-intelligence.js";

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

export type ShortPipelineAudioMode = "off" | "voiceover";

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
  readonly renderAudioMode: "none" | "guided";
  readonly generatedAudioIntentEnabled: boolean;
  readonly nativeProviderAudioEnabled: false;
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

export interface ShortPipelinePlanInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly userPrompt?: string;
  readonly product?: ProductUrlBriefInput;
  readonly brandKit?: BrandKitInput;
  readonly channelStyle?: ShortChannelStyleProfileInput;
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
  readonly preferredTemplateId?: string;
  readonly allowTemplateSuggestions?: boolean;
  readonly targetPlatform?: ShortPipelinePlatform;
  readonly targetDurationSeconds?: number;
  readonly audio?: ShortPipelineAudioPolicyInput;
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
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly viralIntelligence: ShortViralIntelligencePlan;
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
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
  readonly preferredTemplateId?: string;
  readonly allowTemplateSuggestions?: boolean;
  readonly targetPlatform?: ShortPipelinePlatform;
  readonly targetDurationSeconds?: number;
  readonly audio?: ShortPipelineAudioPolicyInput;
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
