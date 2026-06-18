import type {
  DirectorStyleBenchmarkGovernanceReviewCheckEvidence,
  DirectorStyleBenchmarkGovernanceReviewCheckName,
  DirectorStyleBenchmarkGovernanceReviewerType,
  DirectorStyleBenchmarkGovernanceReviewEvidence,
  DirectorStyleBenchmarkGovernanceReviewStatus,
  DirectorStyleBenchmarkReviewArtifactBinding
} from "../types/director-style-benchmark.js";
import {
  safeDirectorStyleReviewFindings,
  safeDirectorStyleReviewText
} from "./director-style-review-text.js";
import { normalizeDirectorStyleReviewArtifactBinding } from "./director-style-review-artifact-binding.js";

const CHECK_NAMES = new Set<DirectorStyleBenchmarkGovernanceReviewCheckName>([
  "directorbench_license_boundary",
  "upstream_code_reuse_boundary",
  "runtime_evaluator_independence",
  "evaluation_asset_permissions"
]);

const REVIEWER_TYPES = new Set<DirectorStyleBenchmarkGovernanceReviewerType>([
  "operator",
  "legal",
  "product",
  "security",
  "hybrid"
]);

const REVIEW_STATUSES = new Set<DirectorStyleBenchmarkGovernanceReviewStatus>([
  "accepted",
  "needs_review",
  "rejected"
]);

export function normalizeDirectorStyleGovernanceReviewEvidence(
  value: unknown,
  options: {
    readonly sourcePath?: string;
    readonly expectedArtifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  } = {}
): DirectorStyleBenchmarkGovernanceReviewEvidence {
  if (!isRecord(value)) {
    throw new Error("governance review must be a JSON object");
  }

  const reviewerType = normalizeReviewerType(value.reviewerType) ?? "operator";
  const rawChecks = Array.isArray(value.checks)
    ? value.checks
    : Array.isArray(value.metrics)
      ? value.metrics
      : undefined;
  if (!rawChecks) {
    throw new Error("governance review must include a checks array");
  }

  const checks = rawChecks.map((item, index) => normalizeCheck(item, index, reviewerType));
  if (checks.length === 0) {
    throw new Error("governance review must include at least one supported check");
  }

  const status = normalizeStatus(value.status) ?? statusFromChecks(checks);
  const reviewedAt = normalizeDateTime(value.reviewedAt);
  const artifactBinding = normalizeDirectorStyleReviewArtifactBinding(value, {
    expectedArtifactBinding: options.expectedArtifactBinding
  });
  const findings = [
    ...safeDirectorStyleReviewFindings(value.findings),
    ...artifactBinding.findings,
    ...checks
      .filter((check) => check.status !== "accepted")
      .map((check) => `${check.checkName} governance review status is ${check.status}.`)
  ];

  return {
    source: sourceFor(reviewerType),
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    status,
    reviewerType,
    ...(artifactBinding.artifactBinding ? { artifactBinding: artifactBinding.artifactBinding } : {}),
    artifactBindingStatus: artifactBinding.artifactBindingStatus,
    ...(reviewedAt ? { reviewedAt } : {}),
    checkCount: checks.length,
    acceptedCheckCount: checks.filter((check) => check.status === "accepted").length,
    checks,
    findings
  };
}

function normalizeCheck(
  value: unknown,
  index: number,
  defaultReviewerType: DirectorStyleBenchmarkGovernanceReviewerType
): DirectorStyleBenchmarkGovernanceReviewCheckEvidence {
  if (!isRecord(value)) {
    throw new Error(`governance review check at index ${index} must be an object`);
  }
  const checkName = normalizeCheckName(value.checkName ?? value.check ?? value.metricName ?? value.id);
  if (!checkName) {
    throw new Error(`governance review check at index ${index} has an unsupported checkName`);
  }
  const reviewerType = normalizeReviewerType(value.reviewerType) ?? defaultReviewerType;
  const status = normalizeStatus(value.status) ?? "needs_review";
  const evidenceSummary = safeDirectorStyleReviewText(
    firstString(value.evidenceSummary, value.summary, value.evidence)
  ) ?? `Structured governance review checkpoint for ${checkName}.`;
  const reviewedAt = normalizeDateTime(value.reviewedAt);

  return {
    checkName,
    status,
    reviewerType,
    evidenceSummary,
    ...(reviewedAt ? { reviewedAt } : {}),
    findings: safeDirectorStyleReviewFindings(value.findings)
  };
}

function normalizeCheckName(value: unknown): DirectorStyleBenchmarkGovernanceReviewCheckName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return CHECK_NAMES.has(normalized as DirectorStyleBenchmarkGovernanceReviewCheckName)
    ? normalized as DirectorStyleBenchmarkGovernanceReviewCheckName
    : undefined;
}

function normalizeReviewerType(value: unknown): DirectorStyleBenchmarkGovernanceReviewerType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEWER_TYPES.has(normalized as DirectorStyleBenchmarkGovernanceReviewerType)
    ? normalized as DirectorStyleBenchmarkGovernanceReviewerType
    : undefined;
}

function normalizeStatus(value: unknown): DirectorStyleBenchmarkGovernanceReviewStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEW_STATUSES.has(normalized as DirectorStyleBenchmarkGovernanceReviewStatus)
    ? normalized as DirectorStyleBenchmarkGovernanceReviewStatus
    : undefined;
}

function statusFromChecks(
  checks: readonly DirectorStyleBenchmarkGovernanceReviewCheckEvidence[]
): DirectorStyleBenchmarkGovernanceReviewStatus {
  if (checks.some((check) => check.status === "rejected")) {
    return "rejected";
  }
  if (checks.some((check) => check.status === "needs_review")) {
    return "needs_review";
  }
  return "accepted";
}

function sourceFor(
  reviewerType: DirectorStyleBenchmarkGovernanceReviewerType
): DirectorStyleBenchmarkGovernanceReviewEvidence["source"] {
  if (reviewerType === "hybrid") {
    return "hybrid_governance_json";
  }
  return `${reviewerType}_governance_json` as DirectorStyleBenchmarkGovernanceReviewEvidence["source"];
}

function normalizeDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value.includes("T") ? value : undefined;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
