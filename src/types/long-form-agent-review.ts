/**
 * Long-form agentic review contracts.
 * They model a deterministic multi-role review board before provider spend.
 */

export type LongFormAgentReviewStatus = "ready" | "review_required" | "blocked";

export type LongFormAgentReviewRole =
  | "script_architect"
  | "continuity_supervisor"
  | "source_video_reviewer"
  | "render_orchestrator"
  | "commercial_risk_reviewer";

export type LongFormAgentReviewSeverity = "info" | "warn" | "block";

export interface LongFormAgentReviewFinding {
  readonly findingId: string;
  readonly role: LongFormAgentReviewRole;
  readonly severity: LongFormAgentReviewSeverity;
  readonly code: string;
  readonly message: string;
  readonly repairDirective: string;
  readonly affectedSequenceIds: readonly string[];
  readonly affectedShotIds: readonly string[];
  readonly evidence: Record<string, string | number | boolean>;
}

export interface LongFormAgentReviewDecision {
  readonly role: LongFormAgentReviewRole;
  readonly status: LongFormAgentReviewStatus;
  readonly findingCount: number;
  readonly blockingFindingCount: number;
  readonly requiredBeforeRender: readonly string[];
  readonly priorityDirective: string;
}

export interface LongFormAgentReviewPlan {
  readonly schemaVersion: "cinejelly.long-form-agent-review.v1";
  readonly projectId: string;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly status: LongFormAgentReviewStatus;
  readonly targetDurationSeconds: number;
  readonly agentCount: number;
  readonly reviewedSequenceCount: number;
  readonly reviewedShotCount: number;
  readonly findingCount: number;
  readonly blockingFindingCount: number;
  readonly reviewRequiredFindingCount: number;
  readonly decisions: readonly LongFormAgentReviewDecision[];
  readonly findings: readonly LongFormAgentReviewFinding[];
  readonly directives: readonly string[];
  readonly releaseGateSummary: {
    readonly canProceedToPromptCompilation: boolean;
    readonly canUseAsNoSpendAgenticReviewEvidence: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
