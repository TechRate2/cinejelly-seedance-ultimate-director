/**
 * Review/Approval System.
 * It provides a reusable commercial-core gate for scene, audio, caption, and claim review
 * before provider spend or customer-facing export.
 */

import type {
  ReviewApprovalCheckpoint,
  ReviewApprovalCheckpointInput,
  ReviewApprovalEvidenceValue,
  ReviewApprovalGate,
  ReviewApprovalLifecycleDecision,
  ReviewApprovalReport,
  ReviewApprovalStatus,
  ReviewApprovalSurface
} from "../types/review-approval.js";
import { createStableId } from "../utils/ids.js";
import { reviewApprovalSourcePatternOrigins } from "./private-source-pattern-registry.js";

const ALL_SURFACES: readonly ReviewApprovalSurface[] = ["scene", "audio", "caption", "claim"];

const UNSAFE_PUBLIC_TEXT_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

export interface ReviewApprovalSystemInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly gate: ReviewApprovalGate;
  readonly checkpoints: readonly ReviewApprovalCheckpointInput[];
  readonly generatedAt?: Date;
}

export class ReviewApprovalSystem {
  public evaluate(input: ReviewApprovalSystemInput): ReviewApprovalReport {
    const generatedAt = input.generatedAt ?? new Date();
    const checkpoints = input.checkpoints.map((checkpoint, index) =>
      this.normalizeCheckpoint(input.projectId, checkpoint, index)
    );
    const summary = this.summary(checkpoints);
    const status = this.status(summary);
    const lifecycle = this.lifecycle(status);
    const canContinueAfterReview = status === "approved";
    const approvalId = createStableId(
      "review_approval",
      [
        input.projectId,
        input.requestId ?? "",
        input.gate,
        checkpoints.map((checkpoint) => `${checkpoint.checkpointId}:${checkpoint.decision}`).join("|")
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.review-approval.v1",
      approvalId,
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      gate: input.gate,
      generatedAt,
      status,
      checkpoints,
      summary,
      lifecycle,
      releaseGateSummary: {
        canContinueAfterReview,
        canRenderAfterReview: canContinueAfterReview && input.gate === "pre_render",
        canExportAfterReview: canContinueAfterReview && input.gate === "pre_export",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: canContinueAfterReview
          ? "Approval gate passed, but customer traffic still requires the full commercial-readiness audit."
          : "Approval gate is not fully accepted; pause the job until required scene, audio, caption, and claim checkpoints are resolved."
      },
      nextActions: this.nextActions(status, input.gate)
    };
  }

  private normalizeCheckpoint(
    projectId: string,
    checkpoint: ReviewApprovalCheckpointInput,
    index: number
  ): ReviewApprovalCheckpoint {
    const issueCodes = new Set(checkpoint.issueCodes ?? []);
    const reviewer = this.safeOptionalText(checkpoint.reviewer);
    const notes = this.safeOptionalText(checkpoint.notes);
    const evidence = this.safeEvidence(checkpoint.evidence ?? {});
    const label = this.requiredText(checkpoint.label, "label");
    const subjectId = this.safeOptionalText(checkpoint.subjectId);
    const decision = checkpoint.decision ?? "pending";

    if (this.containsUnsafeText(label) || this.containsUnsafeText(subjectId) || this.containsUnsafeText(reviewer) ||
        this.containsUnsafeText(notes) || this.evidenceContainsUnsafeText(evidence)) {
      issueCodes.add("unsafe_public_review_text");
    }
    if (decision === "approved" && (!reviewer || !checkpoint.reviewedAt)) {
      issueCodes.add("approved_without_reviewer_or_timestamp");
    }

    const normalizedDecision = issueCodes.has("unsafe_public_review_text") ||
      issueCodes.has("approved_without_reviewer_or_timestamp")
      ? "blocked"
      : decision;

    return {
      checkpointId: createStableId(
        `approval_${checkpoint.surface}`,
        `${projectId}:${checkpoint.surface}:${subjectId ?? index}:${label}`
      ),
      surface: checkpoint.surface,
      label,
      ...(subjectId ? { subjectId } : {}),
      required: checkpoint.required ?? true,
      decision: normalizedDecision,
      ...(reviewer ? { reviewer } : {}),
      ...(checkpoint.reviewedAt ? { reviewedAt: checkpoint.reviewedAt } : {}),
      ...(notes ? { notes } : {}),
      issueCodes: [...issueCodes].sort(),
      evidence,
      sourcePatternOrigins: reviewApprovalSourcePatternOrigins(checkpoint.surface)
    };
  }

  private summary(checkpoints: readonly ReviewApprovalCheckpoint[]) {
    const required = checkpoints.filter((checkpoint) => checkpoint.required);
    const surfaceCounts = Object.fromEntries(
      ALL_SURFACES.map((surface) => [
        surface,
        checkpoints.filter((checkpoint) => checkpoint.surface === surface).length
      ])
    ) as Record<ReviewApprovalSurface, number>;

    return {
      checkpointCount: checkpoints.length,
      requiredCheckpointCount: required.length,
      optionalCheckpointCount: checkpoints.length - required.length,
      approvedRequiredCount: required.filter((checkpoint) => checkpoint.decision === "approved").length,
      pendingRequiredCount: required.filter((checkpoint) => checkpoint.decision === "pending").length,
      changesRequestedRequiredCount: required.filter((checkpoint) => checkpoint.decision === "changes_requested").length,
      rejectedRequiredCount: required.filter((checkpoint) => checkpoint.decision === "rejected").length,
      blockedCheckpointCount: checkpoints.filter((checkpoint) => checkpoint.decision === "blocked").length,
      issueCount: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.issueCodes.length, 0),
      surfaceCounts
    };
  }

  private status(summary: ReturnType<ReviewApprovalSystem["summary"]>): ReviewApprovalStatus {
    if (summary.blockedCheckpointCount > 0) {
      return "blocked";
    }
    if (summary.rejectedRequiredCount > 0) {
      return "rejected";
    }
    if (summary.changesRequestedRequiredCount > 0) {
      return "changes_requested";
    }
    if (summary.pendingRequiredCount > 0 || summary.requiredCheckpointCount === 0) {
      return "approval_required";
    }
    return "approved";
  }

  private lifecycle(status: ReviewApprovalStatus): ReviewApprovalLifecycleDecision {
    switch (status) {
      case "approved":
        return {
          action: "continue",
          nextJobState: "continue",
          message: "All required checkpoints are approved; continue to the next commercial pipeline stage."
        };
      case "approval_required":
        return {
          action: "pause_for_human_review",
          nextJobState: "paused_for_review",
          message: "Required checkpoints still need human approval before the job can continue."
        };
      case "changes_requested":
        return {
          action: "pause_for_revision",
          nextJobState: "paused_for_revision",
          message: "At least one required checkpoint requests changes; revise the plan or artifact before continuing."
        };
      case "rejected":
        return {
          action: "reject_job",
          nextJobState: "rejected",
          message: "At least one required checkpoint was rejected; stop the current job path."
        };
      case "blocked":
        return {
          action: "block_job",
          nextJobState: "blocked",
          message: "Approval evidence is unsafe or internally inconsistent; block until corrected."
        };
    }
  }

  private nextActions(status: ReviewApprovalStatus, gate: ReviewApprovalGate): readonly string[] {
    const stage = gate === "pre_render" ? "provider spend" : "customer-facing export";
    switch (status) {
      case "approved":
        return [
          `Continue toward ${stage}, then keep the approval packet with run artifacts.`,
          "Do not treat this approval packet as full customer-traffic readiness without business-readiness evidence."
        ];
      case "approval_required":
        return [
          "Collect required scene, audio, caption, and claim decisions from an approved reviewer.",
          `Keep the job paused before ${stage} until every required checkpoint is approved.`
        ];
      case "changes_requested":
        return [
          "Apply reviewer changes to the plan, media, caption, or claim evidence.",
          "Regenerate the approval packet after the revised checkpoint evidence is available."
        ];
      case "rejected":
        return [
          "Stop the current job path and create a revised concept or production plan.",
          "Do not spend provider credits on rejected checkpoints."
        ];
      case "blocked":
        return [
          "Remove unsafe public review text, local paths, raw URLs, secrets, or approval decisions without reviewer/timestamp evidence.",
          "Regenerate the approval packet before the job can continue."
        ];
    }
  }

  private requiredText(value: string, field: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      throw new Error(`Review approval checkpoint ${field} is required.`);
    }
    return normalized;
  }

  private safeOptionalText(value: string | undefined): string | undefined {
    const normalized = value?.replace(/\s+/g, " ").trim();
    return normalized || undefined;
  }

  private safeEvidence(
    evidence: Readonly<Record<string, ReviewApprovalEvidenceValue>>
  ): Readonly<Record<string, ReviewApprovalEvidenceValue>> {
    return Object.fromEntries(
      Object.entries(evidence)
        .filter(([key]) => key.trim())
        .map(([key, value]) => [key.replace(/\s+/g, "_").trim(), value])
    );
  }

  private evidenceContainsUnsafeText(evidence: Readonly<Record<string, ReviewApprovalEvidenceValue>>): boolean {
    return Object.entries(evidence).some(([key, value]) => {
      if (this.containsUnsafeText(key)) {
        return true;
      }
      if (Array.isArray(value)) {
        return value.some((item) => this.containsUnsafeText(String(item)));
      }
      return this.containsUnsafeText(String(value));
    });
  }

  private containsUnsafeText(value: string | undefined): boolean {
    return Boolean(value && UNSAFE_PUBLIC_TEXT_PATTERN.test(value));
  }
}
