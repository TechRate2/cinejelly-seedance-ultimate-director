import type {
  DirectorStyleBenchmarkRuntimeReviewEvidence,
  DirectorStyleBenchmarkRuntimeReviewMetricEvidence,
  DirectorStyleBenchmarkRuntimeReviewMetricName,
  DirectorStyleBenchmarkRuntimeReviewerType,
  DirectorStyleBenchmarkRuntimeReviewStatus,
  DirectorStyleBenchmarkReviewArtifactBinding
} from "../types/director-style-benchmark.js";
import {
  safeDirectorStyleReviewFindings,
  safeDirectorStyleReviewText
} from "./director-style-review-text.js";
import { normalizeDirectorStyleReviewArtifactBinding } from "./director-style-review-artifact-binding.js";

const METRIC_NAMES = new Set<DirectorStyleBenchmarkRuntimeReviewMetricName>([
  "asr_transcript_alignment",
  "lip_sync_timing"
]);

const REVIEWER_TYPES = new Set<DirectorStyleBenchmarkRuntimeReviewerType>(["manual", "asr", "lip_sync", "hybrid"]);
const REVIEW_STATUSES = new Set<DirectorStyleBenchmarkRuntimeReviewStatus>(["accepted", "needs_review", "rejected"]);

export function normalizeDirectorStyleRuntimeReviewEvidence(
  value: unknown,
  options: {
    readonly sourcePath?: string;
    readonly expectedArtifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  } = {}
): DirectorStyleBenchmarkRuntimeReviewEvidence {
  if (!isRecord(value)) {
    throw new Error("runtime review must be a JSON object");
  }

  const reviewerType = normalizeReviewerType(value.reviewerType) ?? "manual";
  const rawMetrics = Array.isArray(value.metrics)
    ? value.metrics
    : Array.isArray(value.checkpoints)
      ? value.checkpoints
      : undefined;
  if (!rawMetrics) {
    throw new Error("runtime review must include a metrics or checkpoints array");
  }

  const metrics = rawMetrics.map((item, index) => normalizeMetric(item, index, reviewerType));
  if (metrics.length === 0) {
    throw new Error("runtime review must include at least one supported metric checkpoint");
  }

  const averageScore = average(metrics.map((metric) => metric.score));
  const averageConfidence = average(metrics.map((metric) => metric.confidence));
  const status = normalizeStatus(value.status) ?? statusFromMetrics(metrics);
  const reviewedSegmentCount = normalizeCount(value.reviewedSegmentCount);
  const reviewedBoundaryCount = normalizeCount(value.reviewedBoundaryCount);
  const artifactBinding = normalizeDirectorStyleReviewArtifactBinding(value, {
    expectedArtifactBinding: options.expectedArtifactBinding
  });
  const findings = [
    ...safeDirectorStyleReviewFindings(value.findings),
    ...artifactBinding.findings,
    ...metrics
      .filter((metric) => metric.status !== "accepted")
      .map((metric) => `${metric.metricName} runtime review status is ${metric.status}.`)
  ];

  return {
    source: sourceFor(reviewerType),
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    status,
    reviewerType,
    ...(artifactBinding.artifactBinding ? { artifactBinding: artifactBinding.artifactBinding } : {}),
    artifactBindingStatus: artifactBinding.artifactBindingStatus,
    ...(reviewedSegmentCount !== undefined ? { reviewedSegmentCount } : {}),
    ...(reviewedBoundaryCount !== undefined ? { reviewedBoundaryCount } : {}),
    metricCount: metrics.length,
    ...(averageScore !== undefined ? { averageScore: round(averageScore) } : {}),
    ...(averageConfidence !== undefined ? { averageConfidence: round(averageConfidence) } : {}),
    metrics,
    findings
  };
}

function normalizeMetric(
  value: unknown,
  index: number,
  defaultReviewerType: DirectorStyleBenchmarkRuntimeReviewerType
): DirectorStyleBenchmarkRuntimeReviewMetricEvidence {
  if (!isRecord(value)) {
    throw new Error(`runtime review metric at index ${index} must be an object`);
  }
  const metricName = normalizeMetricName(value.metricName ?? value.metric ?? value.id);
  if (!metricName) {
    throw new Error(`runtime review metric at index ${index} has an unsupported metricName`);
  }
  const score = normalizeScore(value.score ?? value.normalizedScore) ?? normalizeLikertScore(value.likertScore ?? value.rating);
  if (score === undefined) {
    throw new Error(`runtime review metric ${metricName} must include score 0-1 or likertScore 1-5`);
  }
  const reviewerType = normalizeReviewerType(value.reviewerType) ?? defaultReviewerType;
  const confidence = normalizeScore(value.confidence) ?? defaultConfidenceFor(reviewerType);
  const status = normalizeStatus(value.status) ?? statusFromScore(score, confidence);
  const boundedScore = status === "rejected" ? Math.min(score, 0.39) : score;
  const boundedConfidence = status === "accepted"
    ? confidence
    : status === "needs_review"
      ? Math.min(confidence, 0.59)
      : Math.min(confidence, 0.5);
  const evidenceSummary = safeDirectorStyleReviewText(firstString(value.evidenceSummary, value.summary, value.evidence))
    ?? `Structured runtime review checkpoint for ${metricName}.`;
  const reviewedSegmentCount = normalizeCount(value.reviewedSegmentCount);
  const reviewedBoundaryCount = normalizeCount(value.reviewedBoundaryCount);

  return {
    metricName,
    status,
    reviewerType,
    score: round(boundedScore),
    confidence: round(boundedConfidence),
    evidenceSummary,
    ...(reviewedSegmentCount !== undefined ? { reviewedSegmentCount } : {}),
    ...(reviewedBoundaryCount !== undefined ? { reviewedBoundaryCount } : {}),
    findings: safeDirectorStyleReviewFindings(value.findings)
  };
}

function normalizeMetricName(value: unknown): DirectorStyleBenchmarkRuntimeReviewMetricName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return METRIC_NAMES.has(normalized as DirectorStyleBenchmarkRuntimeReviewMetricName)
    ? normalized as DirectorStyleBenchmarkRuntimeReviewMetricName
    : undefined;
}

function normalizeReviewerType(value: unknown): DirectorStyleBenchmarkRuntimeReviewerType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEWER_TYPES.has(normalized as DirectorStyleBenchmarkRuntimeReviewerType)
    ? normalized as DirectorStyleBenchmarkRuntimeReviewerType
    : undefined;
}

function normalizeStatus(value: unknown): DirectorStyleBenchmarkRuntimeReviewStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEW_STATUSES.has(normalized as DirectorStyleBenchmarkRuntimeReviewStatus)
    ? normalized as DirectorStyleBenchmarkRuntimeReviewStatus
    : undefined;
}

function normalizeScore(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

function normalizeLikertScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) {
    return undefined;
  }
  return value / 5;
}

function normalizeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function statusFromScore(score: number, confidence: number): DirectorStyleBenchmarkRuntimeReviewStatus {
  if (score >= 0.7 && confidence >= 0.6) {
    return "accepted";
  }
  if (score < 0.4) {
    return "rejected";
  }
  return "needs_review";
}

function statusFromMetrics(
  metrics: readonly DirectorStyleBenchmarkRuntimeReviewMetricEvidence[]
): DirectorStyleBenchmarkRuntimeReviewStatus {
  if (metrics.some((metric) => metric.status === "rejected")) {
    return "rejected";
  }
  if (metrics.some((metric) => metric.status === "needs_review")) {
    return "needs_review";
  }
  return "accepted";
}

function defaultConfidenceFor(reviewerType: DirectorStyleBenchmarkRuntimeReviewerType): number {
  if (reviewerType === "hybrid") {
    return 0.7;
  }
  if (reviewerType === "asr" || reviewerType === "lip_sync") {
    return 0.66;
  }
  return 0.62;
}

function sourceFor(reviewerType: DirectorStyleBenchmarkRuntimeReviewerType): DirectorStyleBenchmarkRuntimeReviewEvidence["source"] {
  if (reviewerType === "hybrid") {
    return "hybrid_runtime_json";
  }
  if (reviewerType === "asr") {
    return "asr_json";
  }
  if (reviewerType === "lip_sync") {
    return "lip_sync_json";
  }
  return "manual_runtime_json";
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function average(values: readonly number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return undefined;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
