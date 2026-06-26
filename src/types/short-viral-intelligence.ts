import type { AudienceNicheIntelligence } from "./audience-niche-intelligence.js";

export type ShortViralIntelligenceStatus = "ready" | "review_required" | "blocked";

export type ShortViralPlatformFocus =
  | "tiktok_douyin"
  | "reels"
  | "youtube_shorts"
  | "paid_social"
  | "cross_platform_social";

export type ShortViralCreativeMode =
  | "ugc_review"
  | "product_ad"
  | "demo"
  | "testimonial"
  | "problem_solution"
  | "comparison"
  | "education"
  | "story"
  | "cinematic";

export type ShortViralLever =
  | "fast_hook"
  | "native_ugc"
  | "pattern_interrupt"
  | "curiosity_gap"
  | "proof_stack"
  | "product_demo"
  | "social_proof"
  | "visual_retention"
  | "visual_payoff"
  | "clear_payoff"
  | "trend_transfer";

export type ShortReferenceVideoSafetyStatus =
  | "not_provided"
  | "learned_pattern"
  | "review_required"
  | "blocked";

export interface ShortReferenceVideoLearningInput {
  readonly sourceLabel?: string;
  readonly sourceUrl?: string;
  readonly summary?: string;
  readonly hook?: string;
  readonly durationSeconds?: number;
  readonly sceneCount?: number;
  readonly pacing?: string;
  readonly cameraStyle?: string;
  readonly captionStyle?: string;
  readonly audioStyle?: string;
  readonly retentionPattern?: string;
  readonly ctaStyle?: string;
  readonly visualMotifs?: readonly string[];
  readonly doNotCopy?: boolean;
}

export interface ShortReferenceVideoPattern {
  readonly schemaVersion: "cinejelly.short-reference-video-pattern.v1";
  readonly patternId: string;
  readonly safetyStatus: ShortReferenceVideoSafetyStatus;
  readonly sourceLabel?: string;
  readonly sourceUrlSha256?: string;
  readonly sourceHost?: string;
  readonly durationSeconds?: number;
  readonly sceneCount?: number;
  readonly hookPattern: string;
  readonly pacingPattern: string;
  readonly cameraPattern: string;
  readonly captionPattern: string;
  readonly audioPattern: string;
  readonly retentionMechanics: readonly string[];
  readonly ctaPattern: string;
  readonly visualMotifs: readonly string[];
  readonly originalityGuardrails: readonly string[];
  readonly sourcePatternOrigins: readonly string[];
}

export interface ShortViralNicheStrategy {
  readonly audienceNicheIntelligence: AudienceNicheIntelligence;
  readonly niche: string;
  readonly audience: string;
  readonly buyerIntent: "awareness" | "consideration" | "conversion" | "retention";
  readonly platformFocus: ShortViralPlatformFocus;
  readonly creativeMode: ShortViralCreativeMode;
  readonly viewerDesire: string;
  readonly viewerObjection: string;
  readonly viralLevers: readonly ShortViralLever[];
  readonly antiPatterns: readonly string[];
}

export interface ShortViralConceptScore {
  readonly conceptId: string;
  readonly label: string;
  readonly hookScore: number;
  readonly retentionScore: number;
  readonly nicheFitScore: number;
  readonly brandFitScore: number;
  readonly claimSafetyScore: number;
  readonly renderabilityScore: number;
  readonly totalScore: number;
  readonly reasons: readonly string[];
}

export interface ShortViralSceneDirective {
  readonly sceneId: string;
  readonly order: number;
  readonly role: "hook" | "problem" | "proof" | "demo" | "offer" | "payoff";
  readonly recommendedDurationSeconds: number;
  readonly firstFrameRule: string;
  readonly retentionJob: string;
  readonly cameraCue: string;
  readonly captionCue: string;
  readonly proofCue: string;
  readonly ctaCue?: string;
  readonly viralLevers: readonly ShortViralLever[];
  readonly qualityChecks: readonly string[];
  readonly referencePatternAlignment?: string;
}

export type ShortViralFindingCode =
  | "generic_niche"
  | "weak_hook"
  | "missing_product_evidence"
  | "claim_review_required"
  | "reference_video_copy_risk"
  | "reference_video_unsafe_source"
  | "visual_retention_gap"
  | "scene_pacing_review";

export interface ShortViralFinding {
  readonly code: ShortViralFindingCode;
  readonly severity: "info" | "warn" | "block";
  readonly message: string;
  readonly repair: string;
  readonly evidence?: Readonly<Record<string, string | number | boolean>>;
}

export interface ShortViralIntelligencePlan {
  readonly schemaVersion: "cinejelly.short-viral-intelligence.v1";
  readonly intelligenceId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly status: ShortViralIntelligenceStatus;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly nicheStrategy: ShortViralNicheStrategy;
  readonly referenceVideoPattern?: ShortReferenceVideoPattern;
  readonly winningConceptId?: string;
  readonly conceptScores: readonly ShortViralConceptScore[];
  readonly sceneDirectives: readonly ShortViralSceneDirective[];
  readonly findings: readonly ShortViralFinding[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendViralEvidence: boolean;
    readonly canRenderAfterApproval: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
