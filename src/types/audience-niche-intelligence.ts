/**
 * Shared no-spend audience, niche, and user-intent intelligence.
 * This contract is used by both Short and Long so the backend interprets messy user briefs consistently.
 */

export type AudienceNichePresentationStyle =
  | "brief"
  | "rambling"
  | "product_url_or_facts"
  | "creative_direction"
  | "revision_or_constraints"
  | "approval_or_launch";

export type AudienceNicheFormat =
  | "product_ad"
  | "ugc_review"
  | "product_demo"
  | "comparison"
  | "education"
  | "brand_story"
  | "cinematic_story"
  | "problem_solution"
  | "testimonial"
  | "case_study"
  | "community"
  | "unknown";

export type AudienceNicheFunnelStage = "awareness" | "consideration" | "conversion" | "retention";

export type AudienceNicheTrendPosture =
  | "trend_native"
  | "proof_led"
  | "educational_search"
  | "story_authority"
  | "cinematic_premium"
  | "community_social"
  | "evergreen";

export interface AudienceNicheIntelligenceInput {
  readonly projectId: string;
  readonly prompt: string;
  readonly productTitle?: string;
  readonly productCategory?: string;
  readonly productBenefits?: readonly string[];
  readonly productClaims?: readonly string[];
  readonly ctaCandidates?: readonly string[];
  readonly explicitAudience?: string;
  readonly platform?: string;
  readonly durationSeconds?: number;
  readonly brandTone?: string;
  readonly referenceProvided?: boolean;
  readonly sourceVideoProvided?: boolean;
}

export interface AudienceNicheIntelligence {
  readonly schemaVersion: "cinejelly.audience-niche-intelligence.v1";
  readonly intelligenceId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly userPresentationStyle: AudienceNichePresentationStyle;
  readonly niche: string;
  readonly audience: string;
  readonly funnelStage: AudienceNicheFunnelStage;
  readonly format: AudienceNicheFormat;
  readonly trendPosture: AudienceNicheTrendPosture;
  readonly viewerDesire: string;
  readonly viewerObjection: string;
  readonly hookAngle: string;
  readonly retentionPattern: string;
  readonly proofStrategy: string;
  readonly shareTrigger: string;
  readonly ctaStrategy: string;
  readonly localizationSignals: readonly string[];
  readonly riskSignals: readonly string[];
  readonly missingSignals: readonly string[];
  readonly ideaSeeds: readonly string[];
  readonly sourcePatternOrigins: readonly string[];
}
