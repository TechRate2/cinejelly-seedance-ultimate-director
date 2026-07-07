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

export type ShortCreativePatternSource =
  | "audience_niche"
  | "niche_playbook"
  | "reference_video"
  | "prompt_signal"
  | "seedance_prompt_corpus"
  | "platform_template_corpus"
  | "outcome_memory_placeholder";

export type ShortCreativePatternKind =
  | "proof_diary"
  | "skeptical_review"
  | "routine_rescue"
  | "myth_bust"
  | "challenge_progress"
  | "comparison_test"
  | "problem_demo_payoff"
  | "creator_confession"
  | "sensory_closeup"
  | "before_after_guarded"
  | "community_reaction"
  | "micro_story_twist"
  | "workflow_before_after"
  | "hidden_detail_reveal"
  | "first_try_reaction"
  | "mistake_fix"
  | "cinematic_reveal";

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

export interface ShortCreativePattern {
  readonly patternId: string;
  readonly kind: ShortCreativePatternKind;
  readonly label: string;
  readonly source: ShortCreativePatternSource;
  readonly nicheTags: readonly string[];
  readonly hookMechanic: string;
  readonly retentionMechanic: string;
  readonly proofDevice: string;
  readonly payoffMechanic: string;
  readonly creatorOrKolRole: string;
  readonly adaptationRule: string;
  readonly originalityGuardrails: readonly string[];
  readonly riskControls: readonly string[];
  readonly fitReasons: readonly string[];
}

export interface ShortCreativeIdeaScore {
  readonly hookPotential: number;
  readonly retentionPotential: number;
  readonly nicheFit: number;
  readonly proofFeasibility: number;
  readonly brandSafety: number;
  readonly novelty: number;
  readonly renderability: number;
  readonly nonCloneSafety: number;
  readonly totalScore: number;
}

export interface ShortCreativeIdeaCandidate {
  readonly ideaId: string;
  readonly patternId: string;
  readonly label: string;
  readonly logline: string;
  readonly hook: string;
  readonly sceneArc: readonly string[];
  readonly proofPlan: string;
  readonly creatorOrKolDirection: string;
  readonly productionNotes: readonly string[];
  readonly riskControls: readonly string[];
  readonly score: ShortCreativeIdeaScore;
  readonly reasons: readonly string[];
}

export interface ShortCreativePatternLearningPlan {
  readonly schemaVersion: "cinejelly.short-creative-pattern-learning.v1";
  readonly learningId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly selectedIdeaId?: string;
  readonly selectedPatternId?: string;
  readonly patternCount: number;
  readonly candidateCount: number;
  readonly patterns: readonly ShortCreativePattern[];
  readonly candidates: readonly ShortCreativeIdeaCandidate[];
  readonly sourcePatternOrigins: readonly string[];
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
  readonly creativePatternLearning: ShortCreativePatternLearningPlan;
  readonly winningConceptId?: string;
  readonly winningIdeaId?: string;
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
