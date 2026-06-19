/**
 * Human-in-the-loop approval contracts for commercial render gates.
 * These types are shared by long-form, short-form, API, and future UI surfaces.
 */

export type ReviewApprovalSurface = "scene" | "audio" | "caption" | "claim";

export type ReviewApprovalGate = "pre_render" | "pre_export";

export type ReviewApprovalDecision =
  | "pending"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "blocked";

export type ReviewApprovalStatus =
  | "approved"
  | "approval_required"
  | "changes_requested"
  | "rejected"
  | "blocked";

export type ReviewApprovalLifecycleAction =
  | "continue"
  | "pause_for_human_review"
  | "pause_for_revision"
  | "reject_job"
  | "block_job";

export type ReviewApprovalEvidenceValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export interface ReviewApprovalCheckpointInput {
  readonly surface: ReviewApprovalSurface;
  readonly label: string;
  readonly subjectId?: string;
  readonly required?: boolean;
  readonly decision?: ReviewApprovalDecision;
  readonly reviewer?: string;
  readonly reviewedAt?: Date;
  readonly notes?: string;
  readonly issueCodes?: readonly string[];
  readonly evidence?: Readonly<Record<string, ReviewApprovalEvidenceValue>>;
}

export interface ReviewApprovalCheckpoint {
  readonly checkpointId: string;
  readonly surface: ReviewApprovalSurface;
  readonly label: string;
  readonly subjectId?: string;
  readonly required: boolean;
  readonly decision: ReviewApprovalDecision;
  readonly reviewer?: string;
  readonly reviewedAt?: Date;
  readonly notes?: string;
  readonly issueCodes: readonly string[];
  readonly evidence: Readonly<Record<string, ReviewApprovalEvidenceValue>>;
  readonly sourcePatternOrigins: readonly string[];
}

export interface ReviewApprovalSummary {
  readonly checkpointCount: number;
  readonly requiredCheckpointCount: number;
  readonly optionalCheckpointCount: number;
  readonly approvedRequiredCount: number;
  readonly pendingRequiredCount: number;
  readonly changesRequestedRequiredCount: number;
  readonly rejectedRequiredCount: number;
  readonly blockedCheckpointCount: number;
  readonly issueCount: number;
  readonly surfaceCounts: Readonly<Record<ReviewApprovalSurface, number>>;
}

export interface ReviewApprovalLifecycleDecision {
  readonly action: ReviewApprovalLifecycleAction;
  readonly nextJobState:
    | "continue"
    | "paused_for_review"
    | "paused_for_revision"
    | "rejected"
    | "blocked";
  readonly message: string;
}

export interface ReviewApprovalReleaseGateSummary {
  readonly canContinueAfterReview: boolean;
  readonly canRenderAfterReview: boolean;
  readonly canExportAfterReview: boolean;
  readonly canReleaseToCustomerTraffic: false;
  readonly releaseBlocker: string;
}

export interface ReviewApprovalReport {
  readonly schemaVersion: "cinejelly.review-approval.v1";
  readonly approvalId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly gate: ReviewApprovalGate;
  readonly generatedAt: Date;
  readonly status: ReviewApprovalStatus;
  readonly checkpoints: readonly ReviewApprovalCheckpoint[];
  readonly summary: ReviewApprovalSummary;
  readonly lifecycle: ReviewApprovalLifecycleDecision;
  readonly releaseGateSummary: ReviewApprovalReleaseGateSummary;
  readonly nextActions: readonly string[];
}
