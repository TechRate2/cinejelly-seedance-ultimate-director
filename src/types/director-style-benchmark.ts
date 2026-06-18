export type DirectorStyleBenchmarkStatus = "pass" | "review_required" | "blocked";
export type DirectorStyleBenchmarkMetricStatus = "pass" | "warn" | "fail" | "skipped";
export type DirectorStyleBenchmarkDimension = "script" | "video" | "audio" | "stability" | "cross_modal";
export type DirectorStyleBenchmarkSeverity = "info" | "warn" | "block";
export type DirectorStyleBenchmarkProfile =
  | "balanced"
  | "story_first"
  | "visual_heavy"
  | "audio_emotion"
  | "sync_perfectionist";

export interface DirectorStyleBenchmarkEvidence {
  readonly kind: string;
  readonly severity: DirectorStyleBenchmarkSeverity;
  readonly message: string;
  readonly source?: string;
}

export interface DirectorStyleBenchmarkMetricResult {
  readonly dimension: DirectorStyleBenchmarkDimension;
  readonly metricName: string;
  readonly upstreamMetric: string;
  readonly status: DirectorStyleBenchmarkMetricStatus;
  readonly score?: number;
  readonly confidence?: number;
  readonly evidence: readonly DirectorStyleBenchmarkEvidence[];
  readonly suggestions: readonly string[];
  readonly limitations: readonly string[];
}

export interface DirectorStyleBenchmarkDimensionScore {
  readonly dimension: DirectorStyleBenchmarkDimension;
  readonly score?: number;
  readonly confidence?: number;
  readonly weight: number;
  readonly metricCount: number;
  readonly skippedMetricCount: number;
  readonly status: DirectorStyleBenchmarkMetricStatus;
}

export interface DirectorStyleBenchmarkBottleneck {
  readonly dimension: DirectorStyleBenchmarkDimension;
  readonly metricName: string;
  readonly score?: number;
  readonly confidence?: number;
  readonly severity: DirectorStyleBenchmarkSeverity;
  readonly message: string;
  readonly suggestions: readonly string[];
}

export interface DirectorStyleBenchmarkFacts {
  readonly sourceReportPath?: string;
  readonly requestPath?: string;
  readonly artifactDirectory?: string;
  readonly renderStatus?: string;
  readonly readinessDecision?: string;
  readonly artifactValidationStatus?: string;
  readonly projectId?: string;
  readonly requestId?: string;
  readonly targetDurationSeconds?: number;
  readonly finalDurationSeconds?: number;
  readonly hasAudioEvidence?: boolean;
  readonly manualReviewProvided?: boolean;
  readonly manualReviewAccepted?: boolean;
  readonly costLedgerEntryCount?: number;
  readonly artifactKinds: readonly string[];
  readonly sourcePatternOrigins: readonly string[];
}

export interface DirectorStyleBenchmarkReport {
  readonly schemaVersion: "cinejelly.director-style-benchmark.v1";
  readonly generatedAt: string;
  readonly status: DirectorStyleBenchmarkStatus;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly checkedInputs: {
    readonly profile: DirectorStyleBenchmarkProfile;
    readonly sourceReportPath?: string;
    readonly requestPath?: string;
    readonly artifactDirectory?: string;
    readonly outputPath?: string;
    readonly jsonlPath?: string;
    readonly minPassingScore: number;
    readonly minConfidence: number;
  };
  readonly summary: {
    readonly overallScore?: number;
    readonly overallConfidence?: number;
    readonly grade: "A" | "B" | "C" | "D" | "F" | "N/A";
    readonly evidenceScope: "artifact_contract_only";
    readonly metricCount: number;
    readonly scoredMetricCount: number;
    readonly skippedMetricCount: number;
    readonly bottleneckCount: number;
    readonly lowConfidenceMetricCount: number;
    readonly canClaimDirectorBenchParity: false;
  };
  readonly facts: DirectorStyleBenchmarkFacts;
  readonly dimensionScores: readonly DirectorStyleBenchmarkDimensionScore[];
  readonly metrics: readonly DirectorStyleBenchmarkMetricResult[];
  readonly bottlenecks: readonly DirectorStyleBenchmarkBottleneck[];
  readonly releaseGateSummary: {
    readonly benchmarkHarnessPass: boolean;
    readonly canUseAsBackendBenchmarkEvidence: boolean;
    readonly canClaimDirectorBenchParity: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}
