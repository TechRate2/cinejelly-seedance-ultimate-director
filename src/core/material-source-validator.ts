/**
 * Material source validation gate.
 * CineJelly-owned rewrite of MoneyPrinterTurbo/VibeFrame-style source-material checks:
 * keep adapter output tied to approved briefs, rights, URI safety, and operator-visible evidence.
 */

import type {
  MaterialCandidate,
  MaterialRightsRequirement,
  MaterialSource,
  MaterialSourceValidationIssue,
  MaterialSourceValidationIssueCode,
  MaterialSourceValidationReport,
  MaterialSourceValidationSeverity,
  MaterialSourceValidationStatus,
  MaterialSourcingBrief,
  MaterialSourcingPlan
} from "../types/material.js";

const REMOTE_STOCK_SOURCES: ReadonlySet<MaterialSource> = new Set([
  "pexels",
  "pixabay",
  "coverr",
  "paid_stock"
]);
const SECRET_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|x-amz-|x-goog-|x-oss-|x-ms-)/i;

export interface MaterialSourceValidationInput {
  readonly plan: MaterialSourcingPlan;
  readonly candidates?: readonly MaterialCandidate[];
}

export class MaterialSourceValidator {
  public validate(input: MaterialSourceValidationInput): MaterialSourceValidationReport {
    const candidates = input.candidates ?? [];
    const briefsById = new Map(input.plan.briefs.map((brief) => [brief.briefId, brief]));
    const issues: MaterialSourceValidationIssue[] = [];
    const selectedByBrief = new Map<string, number>();

    if (candidates.length === 0) {
      issues.push(
        this.issue({
          code: "planned_only_no_candidates",
          severity: "info",
          message: "No material adapter candidates were supplied; source-material stage remains planning-only.",
          repair: "Attach approved user/local/stock material candidates when external source material is required."
        })
      );
    }

    for (const candidate of candidates) {
      const brief = briefsById.get(candidate.briefId);
      if (!brief) {
        issues.push(
          this.issue({
            code: "unknown_brief",
            severity: "block",
            candidate,
            message: "Material candidate is not tied to a known sourcing brief.",
            repair: "Drop the candidate or regenerate it against a current MaterialSourcingBrief."
          })
        );
        continue;
      }

      if (candidate.selected) {
        selectedByBrief.set(candidate.briefId, (selectedByBrief.get(candidate.briefId) ?? 0) + 1);
      }
      issues.push(...this.validateCandidateAgainstBrief(brief, candidate));
    }

    for (const brief of input.plan.briefs) {
      const selectedCount = selectedByBrief.get(brief.briefId) ?? 0;
      if (selectedCount > brief.maxCandidates) {
        issues.push(
          this.issue({
            code: "too_many_selected_candidates",
            severity: "block",
            briefId: brief.briefId,
            message: `Material brief selected ${selectedCount} candidates but allows ${brief.maxCandidates}.`,
            repair: "Trim selected material candidates to the brief maxCandidates limit before assembly."
          })
        );
      }
    }

    return {
      planId: input.plan.planId,
      projectId: input.plan.projectId,
      status: this.status(candidates, issues),
      candidateCount: candidates.length,
      selectedCandidateCount: candidates.filter((candidate) => candidate.selected).length,
      approvedCandidateCount: this.approvedCandidateCount(candidates, issues),
      rejectedCandidateCount: candidates.filter((candidate) => candidate.rightsStatus === "rejected").length,
      candidates,
      issues
    };
  }

  private validateCandidateAgainstBrief(
    brief: MaterialSourcingBrief,
    candidate: MaterialCandidate
  ): readonly MaterialSourceValidationIssue[] {
    const issues: MaterialSourceValidationIssue[] = [];

    if (!brief.preferredSources.includes(candidate.source)) {
      issues.push(
        this.issue({
          code: "source_not_preferred",
          severity: "block",
          brief,
          candidate,
          message: "Material candidate source is outside the brief preferredSources list.",
          repair: "Use an approved source from the material brief or regenerate the material sourcing plan."
        })
      );
    }
    if (!brief.allowRemoteSources && REMOTE_STOCK_SOURCES.has(candidate.source)) {
      issues.push(
        this.issue({
          code: "remote_source_not_allowed",
          severity: "block",
          brief,
          candidate,
          message: "Remote stock material was returned while remote sources are disabled.",
          repair: "Use user-owned/local material or enable remote sources with commercial rights review."
        })
      );
    }
    if (!this.isSafeMaterialUri(candidate.uri, candidate.source)) {
      issues.push(
        this.issue({
          code: "unsafe_uri",
          severity: "block",
          brief,
          candidate,
          message: "Material candidate URI is not safe for production artifacts.",
          repair: "Use asset:// or credential-free HTTPS material URIs without signed or secret query parameters."
        })
      );
    }
    issues.push(...this.rightsIssues(brief.rightsRequirement, brief, candidate));
    if (candidate.selected) {
      issues.push(...this.selectedCandidateFitIssues(brief, candidate));
    }

    return issues;
  }

  private rightsIssues(
    requirement: MaterialRightsRequirement,
    brief: MaterialSourcingBrief,
    candidate: MaterialCandidate
  ): readonly MaterialSourceValidationIssue[] {
    const issues: MaterialSourceValidationIssue[] = [];
    if (candidate.rightsStatus === "rejected" || (candidate.selected && candidate.rightsStatus === "unverified")) {
      issues.push(
        this.issue({
          code: "rights_not_approved",
          severity: "block",
          brief,
          candidate,
          message: "Selected material must not have rejected or unverified rights.",
          repair: "Replace the candidate with approved material or attach reviewed rights metadata."
        })
      );
    }
    if (candidate.rightsStatus === "requires_attribution" && !candidate.attribution?.trim()) {
      issues.push(
        this.issue({
          code: "attribution_missing",
          severity: "block",
          brief,
          candidate,
          message: "Attribution-required material is missing attribution text.",
          repair: "Attach attribution text or replace the candidate with attribution-free material."
        })
      );
    }
    if (requirement === "user_owned" && candidate.rightsStatus === "requires_attribution") {
      issues.push(
        this.issue({
          code: "rights_not_approved",
          severity: "block",
          brief,
          candidate,
          message: "User-owned material briefs cannot select attribution-required stock material.",
          repair: "Use a user-owned/local candidate or regenerate the brief with stock material enabled."
        })
      );
    }
    if (requirement === "internal_reference_only" && candidate.selected) {
      issues.push(
        this.issue({
          code: "rights_not_approved",
          severity: "block",
          brief,
          candidate,
          message: "Internal-reference-only material cannot be selected for production assembly.",
          repair: "Use the material only for planning guidance or replace it with approved production material."
        })
      );
    }
    return issues;
  }

  private selectedCandidateFitIssues(
    brief: MaterialSourcingBrief,
    candidate: MaterialCandidate
  ): readonly MaterialSourceValidationIssue[] {
    const issues: MaterialSourceValidationIssue[] = [];
    if (candidate.durationSeconds === undefined) {
      issues.push(
        this.issue({
          code: "duration_missing",
          severity: "warn",
          brief,
          candidate,
          message: "Selected material candidate has no duration metadata.",
          repair: "Inspect the candidate duration before assembly or choose a candidate with duration metadata."
        })
      );
    } else if (candidate.durationSeconds < brief.minimumDurationSeconds) {
      issues.push(
        this.issue({
          code: "duration_too_short",
          severity: "block",
          brief,
          candidate,
          message: "Selected material candidate is shorter than the brief minimum duration.",
          repair: "Choose a longer candidate or shorten the material brief requirement."
        })
      );
    }
    if (candidate.aspectRatio && candidate.aspectRatio !== brief.aspectRatio) {
      issues.push(
        this.issue({
          code: "aspect_ratio_mismatch",
          severity: "warn",
          brief,
          candidate,
          message: "Selected material aspect ratio differs from the brief.",
          repair: "Review crop/pad strategy before using this candidate in assembly."
        })
      );
    }
    if (candidate.resolution && candidate.resolution !== brief.resolution) {
      issues.push(
        this.issue({
          code: "resolution_mismatch",
          severity: "warn",
          brief,
          candidate,
          message: "Selected material resolution differs from the brief.",
          repair: "Review scaling quality before using this candidate in assembly."
        })
      );
    }
    return issues;
  }

  private isSafeMaterialUri(uri: string, source: MaterialSource): boolean {
    if (/^data:/i.test(uri)) {
      return false;
    }
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.protocol === "asset:") {
      return !parsed.search && !parsed.hash;
    }
    if (parsed.protocol !== "https:") {
      return false;
    }
    if (REMOTE_STOCK_SOURCES.has(source) && parsed.protocol !== "https:") {
      return false;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        return false;
      }
    }
    return true;
  }

  private approvedCandidateCount(
    candidates: readonly MaterialCandidate[],
    issues: readonly MaterialSourceValidationIssue[]
  ): number {
    const blockedCandidateIds = new Set(
      issues
        .filter((issue) => issue.severity === "block" && issue.candidateId)
        .map((issue) => issue.candidateId)
    );
    return candidates.filter(
      (candidate) =>
        !blockedCandidateIds.has(candidate.candidateId) &&
        (candidate.rightsStatus === "approved" ||
          (candidate.rightsStatus === "requires_attribution" && Boolean(candidate.attribution?.trim())))
    ).length;
  }

  private status(
    candidates: readonly MaterialCandidate[],
    issues: readonly MaterialSourceValidationIssue[]
  ): MaterialSourceValidationStatus {
    if (candidates.length === 0) {
      return "planned_only";
    }
    if (issues.some((issue) => issue.severity === "block")) {
      return "rejected";
    }
    if (issues.some((issue) => issue.severity === "warn")) {
      return "review_required";
    }
    return "approved";
  }

  private issue(input: {
    readonly code: MaterialSourceValidationIssueCode;
    readonly severity: MaterialSourceValidationSeverity;
    readonly message: string;
    readonly repair: string;
    readonly brief?: MaterialSourcingBrief;
    readonly briefId?: string;
    readonly candidate?: MaterialCandidate;
  }): MaterialSourceValidationIssue {
    return {
      code: input.code,
      severity: input.severity,
      message: input.message,
      repair: input.repair,
      ...(input.brief ? { briefId: input.brief.briefId } : {}),
      ...(input.briefId ? { briefId: input.briefId } : {}),
      ...(input.candidate ? { candidateId: input.candidate.candidateId } : {})
    };
  }
}
