import type {
  DirectorStyleBenchmarkAudioReviewEvidence,
  DirectorStyleBenchmarkAudioReviewMetricEvidence,
  DirectorStyleBenchmarkAudioReviewMetricName,
  DirectorStyleBenchmarkAudioReviewerType,
  DirectorStyleBenchmarkAudioReviewStatus,
  DirectorStyleBenchmarkReviewArtifactBinding
} from "../types/director-style-benchmark.js";
import {
  safeDirectorStyleReviewFindings,
  safeDirectorStyleReviewText
} from "./director-style-review-text.js";
import { normalizeDirectorStyleReviewArtifactBinding } from "./director-style-review-artifact-binding.js";

const METRIC_NAMES = new Set<DirectorStyleBenchmarkAudioReviewMetricName>([
  "narration_reasonableness",
  "bgm_consistency",
  "video_audio_consistency",
  "text_audio_consistency"
]);

const REVIEWER_TYPES = new Set<DirectorStyleBenchmarkAudioReviewerType>(["manual", "asr", "waveform", "hybrid"]);
const REVIEW_STATUSES = new Set<DirectorStyleBenchmarkAudioReviewStatus>(["accepted", "needs_review", "rejected"]);

export function normalizeDirectorStyleAudioReviewEvidence(
  value: unknown,
  options: {
    readonly sourcePath?: string;
    readonly expectedArtifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  } = {}
): DirectorStyleBenchmarkAudioReviewEvidence {
  if (!isRecord(value)) {
    throw new Error("audio review must be a JSON object");
  }

  const reviewerType = normalizeReviewerType(value.reviewerType) ?? "manual";
  const rawMetrics = Array.isArray(value.metrics)
    ? value.metrics
    : Array.isArray(value.checkpoints)
      ? value.checkpoints
      : undefined;
  if (!rawMetrics) {
    throw new Error("audio review must include a metrics or checkpoints array");
  }

  const metrics = rawMetrics.map((item, index) => normalizeMetric(item, index, reviewerType));
  if (metrics.length === 0) {
    throw new Error("audio review must include at least one supported metric checkpoint");
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
      .map((metric) => `${metric.metricName} audio review status is ${metric.status}.`)
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
  defaultReviewerType: DirectorStyleBenchmarkAudioReviewerType
): DirectorStyleBenchmarkAudioReviewMetricEvidence {
  if (!isRecord(value)) {
    throw new Error(`audio review metric at index ${index} must be an object`);
  }
  const metricName = normalizeMetricName(value.metricName ?? value.metric ?? value.id);
  if (!metricName) {
    throw new Error(`audio review metric at index ${index} has an unsupported metricName`);
  }
  const score = normalizeScore(value.score ?? value.normalizedScore) ?? normalizeLikertScore(value.likertScore ?? value.rating);
  if (score === undefined) {
    throw new Error(`audio review metric ${metricName} must include score 0-1 or likertScore 1-5`);
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
    ?? `Structured audio review checkpoint for ${metricName}.`;
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

function normalizeMetricName(value: unknown): DirectorStyleBenchmarkAudioReviewMetricName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return METRIC_NAMES.has(normalized as DirectorStyleBenchmarkAudioReviewMetricName)
    ? normalized as DirectorStyleBenchmarkAudioReviewMetricName
    : undefined;
}

function normalizeReviewerType(value: unknown): DirectorStyleBenchmarkAudioReviewerType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEWER_TYPES.has(normalized as DirectorStyleBenchmarkAudioReviewerType)
    ? normalized as DirectorStyleBenchmarkAudioReviewerType
    : undefined;
}

function normalizeStatus(value: unknown): DirectorStyleBenchmarkAudioReviewStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return REVIEW_STATUSES.has(normalized as DirectorStyleBenchmarkAudioReviewStatus)
    ? normalized as DirectorStyleBenchmarkAudioReviewStatus
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

function statusFromScore(score: number, confidence: number): DirectorStyleBenchmarkAudioReviewStatus {
  if (score >= 0.7 && confidence >= 0.6) {
    return "accepted";
  }
  if (score < 0.4) {
    return "rejected";
  }
  return "needs_review";
}

function statusFromMetrics(
  metrics: readonly DirectorStyleBenchmarkAudioReviewMetricEvidence[]
): DirectorStyleBenchmarkAudioReviewStatus {
  if (metrics.some((metric) => metric.status === "rejected")) {
    return "rejected";
  }
  if (metrics.some((metric) => metric.status === "needs_review")) {
    return "needs_review";
  }
  return "accepted";
}

function defaultConfidenceFor(reviewerType: DirectorStyleBenchmarkAudioReviewerType): number {
  if (reviewerType === "hybrid") {
    return 0.68;
  }
  if (reviewerType === "manual") {
    return 0.64;
  }
  return 0.6;
}

function sourceFor(reviewerType: DirectorStyleBenchmarkAudioReviewerType): DirectorStyleBenchmarkAudioReviewEvidence["source"] {
  if (reviewerType === "hybrid") {
    return "hybrid_json";
  }
  if (reviewerType === "asr") {
    return "asr_json";
  }
  if (reviewerType === "waveform") {
    return "waveform_json";
  }
  return "manual_json";
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
