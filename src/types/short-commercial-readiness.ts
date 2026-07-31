import type { ProductUrlEvidenceStatus } from "./short-pipeline.js";

export type ShortCommercialReadinessStatus = "ready" | "review_required" | "blocked";

export type ShortCommercialReadinessCheckCode =
  | "product_evidence"
  | "brand_policy"
  | "viral_strategy"
  | "agent_graph"
  | "human_review"
  | "reference_originality"
  | "media_references"
  | "channel_style_memory"
  | "outcome_memory"
  | "crawler_policy"
  | "render_handoff";

export interface ShortCommercialReadinessCheck {
  readonly checkId: string;
  readonly code: ShortCommercialReadinessCheckCode;
  readonly status: ShortCommercialReadinessStatus;
  readonly score: number;
  readonly message: string;
  readonly repair: string;
  readonly evidence: Readonly<Record<string, string | number | boolean>>;
}

export type ShortCrawlerPolicyStatus =
  | "not_needed"
  | "snapshot_ready"
  | "live_crawl_optional"
  | "clean_url_required"
  | "blocked_by_unsafe_url";

export interface ShortCrawlerPolicyPlan {
  readonly schemaVersion: "cinejelly.short-crawler-policy.v1";
  readonly policyId: string;
  readonly status: ShortCrawlerPolicyStatus;
  readonly sourceStatus: ProductUrlEvidenceStatus;
  readonly liveNetworkDefault: "disabled_until_operator_confirmation";
  readonly bypassPolicy: "never_bypass_access_controls";
  readonly fallbackPolicy: "use_operator_snapshot_or_uploaded_assets";
  readonly estimatedPlatformCostUsd: 0;
  readonly estimatedProviderCostUsd: 0;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly canAttemptLiveCrawlWithConfirmation: boolean;
  readonly safeToSkipWhenBlocked: boolean;
  readonly nextAction: string;
}

export type ShortReferenceAnalysisStatus =
  | "not_provided"
  | "operator_summary_ready"
  | "auto_analysis_recommended"
  | "review_required"
  | "blocked";

export interface ShortReferenceAnalysisContract {
  readonly schemaVersion: "cinejelly.short-reference-analysis-contract.v1";
  readonly contractId: string;
  readonly status: ShortReferenceAnalysisStatus;
  readonly source: "none" | "operator_summary" | "source_video_auto_analysis";
  readonly requiredFields: readonly string[];
  readonly missingFields: readonly string[];
  readonly originalityPolicy: "learn_structure_only_never_clone";
  readonly canUseForStyleTransfer: boolean;
  readonly nextAction: string;
}

export type ShortOutcomeMemoryStatus =
  | "ready_to_write_after_review"
  | "waiting_for_persistent_store"
  | "blocked";

export interface ShortOutcomeMemoryContract {
  readonly schemaVersion: "cinejelly.short-outcome-memory-contract.v1";
  readonly contractId: string;
  readonly status: ShortOutcomeMemoryStatus;
  readonly retrievedPatternCount: number;
  readonly writeIntentCount: number;
  readonly requiredOutcomeFields: readonly string[];
  readonly persistenceMode: "contract_only_until_store_configured";
  readonly rawTranscriptStored: false;
  readonly rawSourceUrlStored: false;
  readonly nextAction: string;
}

export interface ShortCommercialReadinessPlan {
  readonly schemaVersion: "cinejelly.short-commercial-readiness.v1";
  readonly readinessId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly status: ShortCommercialReadinessStatus;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly qualityScore: number;
  readonly checkSummary: {
    readonly ready: number;
    readonly reviewRequired: number;
    readonly blocked: number;
  };
  readonly checks: readonly ShortCommercialReadinessCheck[];
  readonly crawlerPolicy: ShortCrawlerPolicyPlan;
  readonly referenceAnalysis: ShortReferenceAnalysisContract;
  readonly outcomeMemory: ShortOutcomeMemoryContract;
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendReadinessEvidence: boolean;
    readonly canRenderAfterFormalApproval: boolean;
    readonly canRenderNow: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}
