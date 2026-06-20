/**
 * Storyboard Approval Gate.
 * Converts a planned long-form storyboard into a formal pre-render approval packet before provider spend.
 */

import type { CineJellyProjectRequest } from "../types/agent.js";
import type { ReviewApprovalDecision, ReviewApprovalReport } from "../types/review-approval.js";
import type { Storyboard, StoryboardPanel } from "../types/storyboard.js";
import type { VideoRenderStrategyPlan } from "../types/video-render-strategy.js";
import { ReviewApprovalSystem } from "./review-approval-system.js";

export interface StoryboardApprovalGateInput {
  readonly projectId: string;
  readonly request: CineJellyProjectRequest;
  readonly storyboard: Storyboard;
  readonly strategy: VideoRenderStrategyPlan;
  readonly generatedAt?: Date;
}

export class StoryboardApprovalGate {
  private readonly approvalSystem: ReviewApprovalSystem;

  public constructor(approvalSystem = new ReviewApprovalSystem()) {
    this.approvalSystem = approvalSystem;
  }

  public evaluate(input: StoryboardApprovalGateInput): ReviewApprovalReport | undefined {
    if (!input.strategy.storyboardRequired) {
      return undefined;
    }

    const metadata = input.request.metadata ?? {};
    const decision = this.decision(metadata);
    const reviewer = this.reviewer(metadata);
    const reviewedAt = this.reviewedAt(metadata);

    return this.approvalSystem.evaluate({
      projectId: input.projectId,
      ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
      gate: "pre_render",
      ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
      checkpoints: input.storyboard.panels.map((panel) => ({
        surface: "scene",
        label: this.panelLabel(panel),
        subjectId: panel.panelId,
        required: true,
        decision,
        ...(reviewer ? { reviewer } : {}),
        ...(reviewedAt ? { reviewedAt } : {}),
        ...(metadata.storyboardApprovalNotes ? { notes: metadata.storyboardApprovalNotes } : {}),
        evidence: {
          panelOrder: panel.order,
          shotId: panel.shotId,
          durationSeconds: panel.durationSeconds,
          workflowMode: input.strategy.workflowMode,
          continuityMode: input.strategy.continuityMode,
          referenceBindingRoles: panel.referenceBindings.map((binding) => binding.role).sort(),
          inspectionFocus: panel.inspectionFocus.slice(0, 6)
        }
      }))
    });
  }

  private panelLabel(panel: StoryboardPanel): string {
    const order = Number.isInteger(panel.order) ? panel.order + 1 : 1;
    return `Storyboard panel ${order} scene approval`;
  }

  private decision(metadata: Record<string, string>): ReviewApprovalDecision {
    const normalized = (
      metadata.storyboardApproval ??
      metadata.reviewApproval ??
      metadata.approvalStatus ??
      "pending"
    ).trim().toLowerCase().replace(/[\s-]+/g, "_");

    switch (normalized) {
      case "approved":
      case "operator_approved":
        return "approved";
      case "changes_requested":
      case "change_requested":
      case "needs_changes":
        return "changes_requested";
      case "rejected":
        return "rejected";
      case "blocked":
        return "blocked";
      case "pending":
      default:
        return "pending";
    }
  }

  private reviewer(metadata: Record<string, string>): string | undefined {
    const reviewer = metadata.storyboardReviewer ?? metadata.reviewedBy ?? metadata.approvalReviewer;
    const normalized = reviewer?.replace(/\s+/g, " ").trim();
    return normalized || undefined;
  }

  private reviewedAt(metadata: Record<string, string>): Date | undefined {
    const value = metadata.storyboardReviewedAt ?? metadata.reviewedAt ?? metadata.approvalReviewedAt;
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
