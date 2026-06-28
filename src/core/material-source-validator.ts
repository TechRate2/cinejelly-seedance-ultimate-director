/**
 * Material source validation gate.
 * CineJelly-owned rewrite of staged source-material checks:
 * keep adapter output tied to approved briefs, rights, URI safety, and operator-visible evidence.
 */

import type {
  MaterialCandidate,
  MaterialCandidateEvaluation,
  MaterialCandidateEvaluationDecision,
  MaterialCandidateScoreFactor,
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
const MAX_CANDIDATE_FIT_SCORE = 100;

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
      issues,
      candidateEvaluations: this.evaluateCandidates({
        plan: input.plan,
        candidates,
        issues,
        selectedByBrief
      })
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
    if (candidate.sourcePageUrl && !this.isSafeMaterialUri(candidate.sourcePageUrl, candidate.source)) {
      issues.push(
        this.issue({
          code: "unsafe_uri",
          severity: "block",
          brief,
          candidate,
          message: "Material candidate source page URL is not safe for production artifacts.",
          repair: "Use credential-free HTTPS source page URLs without signed or secret query parameters."
        })
      );
    }
    if (candidate.previewUri && !this.isSafeMaterialUri(candidate.previewUri, candidate.source)) {
      issues.push(
        this.issue({
          code: "unsafe_uri",
          severity: "block",
          brief,
          candidate,
          message: "Material candidate preview URI is not safe for production artifacts.",
          repair: "Use credential-free HTTPS preview URIs without signed or secret query parameters."
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

  private evaluateCandidates(input: {
    readonly plan: MaterialSourcingPlan;
    readonly candidates: readonly MaterialCandidate[];
    readonly issues: readonly MaterialSourceValidationIssue[];
    readonly selectedByBrief: ReadonlyMap<string, number>;
  }): readonly MaterialCandidateEvaluation[] {
    const briefsById = new Map(input.plan.briefs.map((brief) => [brief.briefId, brief]));
    const issuesByCandidate = new Map<string, MaterialSourceValidationIssue[]>();
    for (const issue of input.issues) {
      if (!issue.candidateId) {
        continue;
      }
      const current = issuesByCandidate.get(issue.candidateId) ?? [];
      current.push(issue);
      issuesByCandidate.set(issue.candidateId, current);
    }

    return input.candidates.map((candidate) => {
      const brief = briefsById.get(candidate.briefId);
      const issues = issuesByCandidate.get(candidate.candidateId) ?? [];
      const blockingIssueCodes = this.issueCodes(issues, "block");
      const warningIssueCodes = this.issueCodes(issues, "warn");
      const scoreFactors = this.candidateScoreFactors({
        brief,
        candidate,
        selectedCountForBrief: input.selectedByBrief.get(candidate.briefId) ?? 0
      });
      const fitScore = Math.min(
        MAX_CANDIDATE_FIT_SCORE,
        scoreFactors.reduce((sum, factor) => sum + factor.score, 0)
      );
      const decision = this.evaluationDecision({ fitScore, blockingIssueCodes, warningIssueCodes });
      return {
        candidateId: candidate.candidateId,
        briefId: candidate.briefId,
        source: candidate.source,
        selected: candidate.selected,
        decision,
        fitScore,
        maxFitScore: MAX_CANDIDATE_FIT_SCORE,
        scoreFactors,
        blockingIssueCodes,
        warningIssueCodes,
        recommendedAction: this.recommendedActionForDecision(decision)
      };
    });
  }

  private candidateScoreFactors(input: {
    readonly brief: MaterialSourcingBrief | undefined;
    readonly candidate: MaterialCandidate;
    readonly selectedCountForBrief: number;
  }): readonly MaterialCandidateScoreFactor[] {
    const { brief, candidate } = input;
    const sourceAllowed = brief ? brief.preferredSources.includes(candidate.source) : false;
    const uriSafe = this.isSafeMaterialUri(candidate.uri, candidate.source) &&
      (!candidate.sourcePageUrl || this.isSafeMaterialUri(candidate.sourcePageUrl, candidate.source)) &&
      (!candidate.previewUri || this.isSafeMaterialUri(candidate.previewUri, candidate.source));
    const rightsAccepted = this.rightsAccepted(brief?.rightsRequirement, candidate);
    const attributionAccepted = candidate.rightsStatus !== "requires_attribution" || Boolean(candidate.attribution?.trim());
    const duration = this.durationFitFactor(brief, candidate);
    const aspectRatio = this.aspectRatioFitFactor(brief, candidate);
    const resolution = this.resolutionFitFactor(brief, candidate);
    const selectedWithinLimit = !candidate.selected || (brief !== undefined && input.selectedCountForBrief <= brief.maxCandidates);

    return [
      this.factor("source_allowed", 15, sourceAllowed, sourceAllowed
        ? "Candidate source is allowed by the material brief."
        : "Candidate source is not allowed by the material brief."),
      this.factor("uri_safety", 20, uriSafe, uriSafe
        ? "Candidate URIs are artifact-safe."
        : "Candidate URI, source page, or preview URI is unsafe."),
      this.factor("rights", 20, rightsAccepted, rightsAccepted
        ? "Candidate rights are acceptable for the brief."
        : "Candidate rights are not acceptable for selected production use."),
      this.factor("attribution", 5, attributionAccepted, attributionAccepted
        ? "Attribution requirement is satisfied or not needed."
        : "Attribution-required material is missing attribution."),
      duration,
      aspectRatio,
      resolution,
      this.factor("selection_limit", 5, selectedWithinLimit, selectedWithinLimit
        ? "Selected candidate count is within the brief limit."
        : "Selected candidate count exceeds the brief limit.")
    ];
  }

  private rightsAccepted(requirement: MaterialRightsRequirement | undefined, candidate: MaterialCandidate): boolean {
    if (!requirement) {
      return false;
    }
    if (candidate.rightsStatus === "rejected" || (candidate.selected && candidate.rightsStatus === "unverified")) {
      return false;
    }
    if (requirement === "user_owned" && candidate.rightsStatus === "requires_attribution") {
      return false;
    }
    if (requirement === "internal_reference_only" && candidate.selected) {
      return false;
    }
    return true;
  }

  private durationFitFactor(
    brief: MaterialSourcingBrief | undefined,
    candidate: MaterialCandidate
  ): MaterialCandidateScoreFactor {
    if (!brief) {
      return this.factor("duration_fit", 15, false, "Candidate has no matching brief for duration scoring.");
    }
    if (candidate.durationSeconds === undefined) {
      return {
        name: "duration_fit",
        score: candidate.selected ? 6 : 8,
        maxScore: 15,
        passed: false,
        message: "Candidate duration metadata is missing."
      };
    }
    if (candidate.durationSeconds < brief.minimumDurationSeconds) {
      return this.factor("duration_fit", 15, false, "Candidate is shorter than the brief minimum duration.");
    }
    const target = Math.max(brief.targetDurationSeconds, brief.minimumDurationSeconds, 1);
    const closeness = Math.max(0, 1 - Math.abs(candidate.durationSeconds - target) / target);
    return {
      name: "duration_fit",
      score: Math.round(8 + 7 * closeness),
      maxScore: 15,
      passed: true,
      message: "Candidate duration meets the brief minimum."
    };
  }

  private aspectRatioFitFactor(
    brief: MaterialSourcingBrief | undefined,
    candidate: MaterialCandidate
  ): MaterialCandidateScoreFactor {
    if (!brief) {
      return this.factor("aspect_ratio_fit", 10, false, "Candidate has no matching brief for aspect-ratio scoring.");
    }
    if (!candidate.aspectRatio || candidate.aspectRatio === "adaptive") {
      return {
        name: "aspect_ratio_fit",
        score: 5,
        maxScore: 10,
        passed: false,
        message: "Candidate aspect ratio metadata is missing or adaptive."
      };
    }
    return this.factor("aspect_ratio_fit", 10, candidate.aspectRatio === brief.aspectRatio, candidate.aspectRatio === brief.aspectRatio
      ? "Candidate aspect ratio matches the brief."
      : "Candidate aspect ratio differs from the brief.");
  }

  private resolutionFitFactor(
    brief: MaterialSourcingBrief | undefined,
    candidate: MaterialCandidate
  ): MaterialCandidateScoreFactor {
    if (!brief) {
      return this.factor("resolution_fit", 10, false, "Candidate has no matching brief for resolution scoring.");
    }
    if (!candidate.resolution) {
      return {
        name: "resolution_fit",
        score: 5,
        maxScore: 10,
        passed: false,
        message: "Candidate resolution metadata is missing."
      };
    }
    return this.factor("resolution_fit", 10, candidate.resolution === brief.resolution, candidate.resolution === brief.resolution
      ? "Candidate resolution matches the brief."
      : "Candidate resolution differs from the brief.");
  }

  private factor(name: string, maxScore: number, passed: boolean, message: string): MaterialCandidateScoreFactor {
    return {
      name,
      score: passed ? maxScore : 0,
      maxScore,
      passed,
      message
    };
  }

  private issueCodes(
    issues: readonly MaterialSourceValidationIssue[],
    severity: MaterialSourceValidationSeverity
  ): readonly MaterialSourceValidationIssueCode[] {
    return [...new Set(issues.filter((issue) => issue.severity === severity).map((issue) => issue.code))].sort();
  }

  private evaluationDecision(input: {
    readonly fitScore: number;
    readonly blockingIssueCodes: readonly MaterialSourceValidationIssueCode[];
    readonly warningIssueCodes: readonly MaterialSourceValidationIssueCode[];
  }): MaterialCandidateEvaluationDecision {
    if (input.blockingIssueCodes.length > 0) {
      return "rejected";
    }
    if (input.warningIssueCodes.length > 0 || input.fitScore < 80) {
      return "review_required";
    }
    return "approved";
  }

  private recommendedActionForDecision(decision: MaterialCandidateEvaluationDecision): string {
    switch (decision) {
      case "approved":
        return "Candidate can remain selected if the surrounding material validation report is approved.";
      case "review_required":
        return "Operator should review fit metadata, crop/scale strategy, duration, rights, and attribution before use.";
      case "rejected":
        return "Replace the candidate or repair the blocking validation issues before production assembly.";
    }
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
