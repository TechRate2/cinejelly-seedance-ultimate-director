export type DirectorStyleBenchmarkStatus = "pass" | "review_required" | "blocked";
export type DirectorStyleBenchmarkMetricStatus = "pass" | "warn" | "fail" | "skipped";
export type DirectorStyleBenchmarkDimension = "script" | "video" | "audio" | "stability" | "cross_modal";
export type DirectorStyleBenchmarkSeverity = "info" | "warn" | "block";
export type DirectorStyleBenchmarkEvidenceScope =
  | "artifact_contract_only"
  | "artifact_contract_plus_media_probe"
  | "artifact_contract_plus_media_frames"
  | "artifact_contract_plus_media_boundaries"
  | "artifact_contract_plus_media_audio_waveform"
  | "artifact_contract_plus_semantic_review"
  | "artifact_contract_plus_semantic_audio_review"
  | "artifact_contract_plus_media_semantic_review"
  | "artifact_contract_plus_media_semantic_audio_waveform"
  | "artifact_contract_plus_audio_review"
  | "artifact_contract_plus_media_audio_review"
  | "artifact_contract_plus_media_semantic_audio_review";
export type DirectorStyleBenchmarkProfile =
  | "balanced"
  | "story_first"
  | "visual_heavy"
  | "audio_emotion"
  | "sync_perfectionist";
export type DirectorStyleBenchmarkSemanticReviewMetricName =
  | "script_video_fidelity"
  | "user_demand_fulfillment"
  | "temporal_coherence"
  | "transition_quality"
  | "lighting_consistency"
  | "text_video_consistency";
export type DirectorStyleBenchmarkSemanticReviewStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkSemanticReviewerType = "manual" | "vlm" | "hybrid";
export type DirectorStyleBenchmarkAudioReviewMetricName =
  | "narration_reasonableness"
  | "bgm_consistency"
  | "video_audio_consistency"
  | "text_audio_consistency";
export type DirectorStyleBenchmarkAudioReviewStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkAudioReviewerType = "manual" | "asr" | "waveform" | "hybrid";

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

export interface DirectorStyleBenchmarkMediaStreamEvidence {
  readonly codecName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly sampleRate?: number;
  readonly channelCount?: number;
  readonly durationSeconds?: number;
}

export interface DirectorStyleBenchmarkAudioWaveformSignals {
  readonly status: "analyzed" | "unavailable";
  readonly analyzer: "ffmpeg_volumedetect";
  readonly analyzedDurationSeconds?: number;
  readonly meanVolumeDb?: number;
  readonly maxVolumeDb?: number;
  readonly headroomDb?: number;
  readonly signalPresenceScore?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkAudioMediaEvidence {
  readonly hasAudio: boolean;
  readonly codecName?: string;
  readonly sampleRate?: number;
  readonly channelCount?: number;
  readonly durationSeconds?: number;
  readonly waveformSignals?: DirectorStyleBenchmarkAudioWaveformSignals;
}

export interface DirectorStyleBenchmarkVisualSignals {
  readonly sampleCount: number;
  readonly meanBrightness?: number;
  readonly brightnessRange?: number;
  readonly brightnessStdDev?: number;
  readonly meanColorDelta?: number;
  readonly maxColorDelta?: number;
  readonly temporalContinuityScore?: number;
  readonly lightingConsistencyScore?: number;
  readonly transitionContinuityScore?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkTransitionBoundarySignal {
  readonly index: number;
  readonly timeSeconds: number;
  readonly preTimeSeconds: number;
  readonly postTimeSeconds: number;
  readonly colorDelta: number;
  readonly brightnessDelta: number;
  readonly continuityScore: number;
}

export interface DirectorStyleBenchmarkTransitionSignals {
  readonly status: "not_detected" | "analyzed" | "unavailable";
  readonly sceneChangeThreshold: number;
  readonly boundaryWindowSeconds: number;
  readonly candidateBoundaryCount: number;
  readonly analyzedBoundaryCount: number;
  readonly meanBoundaryColorDelta?: number;
  readonly maxBoundaryColorDelta?: number;
  readonly meanBrightnessDelta?: number;
  readonly transitionContinuityScore?: number;
  readonly boundaries?: readonly DirectorStyleBenchmarkTransitionBoundarySignal[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkSemanticReviewMetricEvidence {
  readonly metricName: DirectorStyleBenchmarkSemanticReviewMetricName;
  readonly status: DirectorStyleBenchmarkSemanticReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkSemanticReviewerType;
  readonly score: number;
  readonly confidence: number;
  readonly evidenceSummary: string;
  readonly reviewedShotCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkSemanticReviewEvidence {
  readonly source: "manual_json" | "vlm_json" | "hybrid_json";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkSemanticReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkSemanticReviewerType;
  readonly reviewedShotCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly metricCount: number;
  readonly averageScore?: number;
  readonly averageConfidence?: number;
  readonly metrics: readonly DirectorStyleBenchmarkSemanticReviewMetricEvidence[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkAudioReviewMetricEvidence {
  readonly metricName: DirectorStyleBenchmarkAudioReviewMetricName;
  readonly status: DirectorStyleBenchmarkAudioReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkAudioReviewerType;
  readonly score: number;
  readonly confidence: number;
  readonly evidenceSummary: string;
  readonly reviewedSegmentCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkAudioReviewEvidence {
  readonly source: "manual_json" | "asr_json" | "waveform_json" | "hybrid_json";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkAudioReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkAudioReviewerType;
  readonly reviewedSegmentCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly metricCount: number;
  readonly averageScore?: number;
  readonly averageConfidence?: number;
  readonly metrics: readonly DirectorStyleBenchmarkAudioReviewMetricEvidence[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkMediaEvidence {
  readonly status: "unavailable" | "probe_only" | "frame_sampled";
  readonly source: "local_file";
  readonly mediaPath?: string;
  readonly mediaFileName?: string;
  readonly sizeBytes?: number;
  readonly deliveryStatus?: "pass" | "warn" | "fail";
  readonly durationSeconds?: number;
  readonly bitrate?: number;
  readonly video?: DirectorStyleBenchmarkMediaStreamEvidence;
  readonly audio?: DirectorStyleBenchmarkAudioMediaEvidence;
  readonly frameSampleCount?: number;
  readonly frameSamplingIntervalSeconds?: number;
  readonly sampledFramesRedacted?: true;
  readonly visualSignals?: DirectorStyleBenchmarkVisualSignals;
  readonly transitionSignals?: DirectorStyleBenchmarkTransitionSignals;
  readonly findings: readonly string[];
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
  readonly mediaEvidence?: DirectorStyleBenchmarkMediaEvidence;
  readonly semanticReviewEvidence?: DirectorStyleBenchmarkSemanticReviewEvidence;
  readonly audioReviewEvidence?: DirectorStyleBenchmarkAudioReviewEvidence;
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
    readonly mediaPath?: string;
    readonly frameSamplingIntervalSeconds?: number;
    readonly maxFrameSamples?: number;
    readonly sceneChangeThreshold?: number;
    readonly transitionBoundaryWindowSeconds?: number;
    readonly maxTransitionBoundaries?: number;
    readonly semanticReviewPath?: string;
    readonly audioReviewPath?: string;
    readonly outputPath?: string;
    readonly jsonlPath?: string;
    readonly minPassingScore: number;
    readonly minConfidence: number;
  };
  readonly summary: {
    readonly overallScore?: number;
    readonly overallConfidence?: number;
    readonly grade: "A" | "B" | "C" | "D" | "F" | "N/A";
    readonly evidenceScope: DirectorStyleBenchmarkEvidenceScope;
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
