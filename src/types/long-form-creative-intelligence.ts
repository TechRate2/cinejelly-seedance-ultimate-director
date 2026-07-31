/**
 * Long-form creative intelligence contracts.
 * These no-spend reports turn story, niche, viral intent, quality checks, repair, and candidate planning
 * into explicit backend evidence before provider spend.
 */

import type { AudienceNicheIntelligence, AudienceNicheTrendPosture } from "./audience-niche-intelligence.js";
import type { LongDirectorPlan } from "./long-director.js";

export type LongFormCreativeIntelligenceStatus = "ready" | "review_required" | "blocked";

export type LongFormCreativeQualitySeverity = "info" | "warn" | "block";

export type LongFormCreativeQualityFindingCode =
  | "generic_niche_or_audience"
  | "weak_opening_hook"
  | "weak_payoff_or_cta"
  | "missing_story_anchor"
  | "sequence_bridge_gap"
  | "shot_duration_risk"
  | "repetitive_shot_language"
  | "continuity_risk_needs_candidate"
  | "caption_coverage_gap"
  | "generated_audio_timing_gap"
  | "unsupported_claim_risk"
  | "source_video_alignment_gap"
  | "agent_review_blocked"
  | "render_strategy_blocked"
  | "timeline_blocked";

export type LongFormCreativeRepairScope = "story" | "sequence" | "shot" | "prompt" | "postproduction" | "timeline";

export type LongFormCreativeRepairPriority = "low" | "medium" | "high" | "critical";

export type LongFormCreativeIdeaSource =
  | "audience_niche"
  | "story_bible"
  | "source_video_structure"
  | "timeline_production_contract"
  | "director_repair";

export type LongFormCreativeViralLever =
  | "specific_niche_promise"
  | "fast_hook"
  | "curiosity_gap"
  | "proof_stack"
  | "visual_payoff"
  | "identity_consistency"
  | "caption_retention"
  | "clean_cta"
  | "source_style_match";

export interface LongFormCreativeNicheStrategy {
  readonly audienceNicheIntelligence: AudienceNicheIntelligence;
  readonly niche: string;
  readonly audience: string;
  readonly platformIntent: string;
  readonly desiredViewerAction: string;
  readonly trendPosture: AudienceNicheTrendPosture;
  readonly viewerObjection: string;
  readonly proofStrategy: string;
  readonly shareTrigger: string;
  readonly hookPattern: string;
  readonly retentionBeats: readonly string[];
  readonly viralLevers: readonly LongFormCreativeViralLever[];
  readonly antiPatterns: readonly string[];
}

export interface LongFormCreativeStoryBible {
  readonly logline: string;
  readonly centralQuestion: string;
  readonly emotionalArc: readonly string[];
  readonly characterAnchors: readonly string[];
  readonly productAnchors: readonly string[];
  readonly environmentAnchors: readonly string[];
  readonly styleAnchors: readonly string[];
  readonly continuityRules: readonly string[];
  readonly payoff: string;
}

export interface LongFormCreativeQualityFinding {
  readonly findingId: string;
  readonly severity: LongFormCreativeQualitySeverity;
  readonly code: LongFormCreativeQualityFindingCode;
  readonly message: string;
  readonly repair: string;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
  readonly evidence: Record<string, string | number | boolean>;
}

export interface LongFormCreativeShotDirective {
  readonly shotId: string;
  readonly sequenceId: string;
  readonly order: number;
  readonly viralRole: string;
  readonly targetEmotion: string;
  readonly qualityChecks: readonly string[];
  readonly recommendedCandidateCount: number;
  readonly shouldPrioritizeRepair: boolean;
  readonly continuityAnchors: readonly string[];
}

export interface LongFormCreativeCandidateDirective {
  readonly shotId: string;
  readonly sequenceId: string;
  readonly candidateCount: number;
  readonly reasonCodes: readonly string[];
}

export interface LongFormCreativeRepairDirective {
  readonly repairId: string;
  readonly scope: LongFormCreativeRepairScope;
  readonly priority: LongFormCreativeRepairPriority;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
  readonly triggerCodes: readonly LongFormCreativeQualityFindingCode[];
  readonly action: string;
  readonly canAutoRepairBeforeRender: boolean;
  readonly requiresManualReview: boolean;
}

export interface LongFormCreativeIdeaScore {
  readonly hookStrength: number;
  readonly retentionDepth: number;
  readonly nicheFit: number;
  readonly proofSpecificity: number;
  readonly continuitySafety: number;
  readonly renderReadiness: number;
  readonly originality: number;
  readonly totalScore: number;
}

export interface LongFormCreativeIdeaCandidate {
  readonly ideaId: string;
  readonly label: string;
  readonly source: LongFormCreativeIdeaSource;
  readonly selectedForRender: boolean;
  readonly logline: string;
  readonly openingHook: string;
  readonly sequenceArc: readonly string[];
  readonly proofPlan: string;
  readonly audioNarrationPlan: string;
  readonly sourceVideoAdaptationRule: string;
  readonly productionRisks: readonly string[];
  readonly score: LongFormCreativeIdeaScore;
  readonly reasons: readonly string[];
}

export interface LongFormCreativeAudioCaptionQuality {
  readonly status: LongFormCreativeIntelligenceStatus;
  readonly captionCoverageRatio: number;
  readonly captionCueCount: number;
  readonly generatedAudioIntentCount: number;
  readonly generatedAudioReadyIntentCount: number;
  readonly generatedAudioBlockedIntentCount: number;
  readonly timingIssueCount: number;
  readonly recommendations: readonly string[];
}

export interface LongFormCreativeIntelligencePlan {
  readonly schemaVersion: "cinejelly.long-form-creative-intelligence.v1";
  readonly projectId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: LongFormCreativeIntelligenceStatus;
  readonly targetDurationSeconds: number;
  readonly qualityScore: number;
  readonly nicheStrategy: LongFormCreativeNicheStrategy;
  readonly storyBible: LongFormCreativeStoryBible;
  readonly directorPlan: LongDirectorPlan;
  readonly findingCount: number;
  readonly blockingFindingCount: number;
  readonly reviewRequiredFindingCount: number;
  readonly selectedIdeaCandidateId?: string;
  readonly ideaCandidateCount: number;
  readonly shotDirectiveCount: number;
  readonly candidateDirectiveCount: number;
  readonly repairDirectiveCount: number;
  readonly audioCaptionQuality: LongFormCreativeAudioCaptionQuality;
  readonly findings: readonly LongFormCreativeQualityFinding[];
  readonly ideaCandidates: readonly LongFormCreativeIdeaCandidate[];
  readonly shotDirectives: readonly LongFormCreativeShotDirective[];
  readonly candidateDirectives: readonly LongFormCreativeCandidateDirective[];
  readonly repairDirectives: readonly LongFormCreativeRepairDirective[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendCreativeIntelligenceEvidence: boolean;
    readonly canProceedToRender: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
