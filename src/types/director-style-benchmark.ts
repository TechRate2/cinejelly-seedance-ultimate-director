export type DirectorStyleBenchmarkStatus = "pass" | "review_required" | "blocked";
export type DirectorStyleBenchmarkMetricStatus = "pass" | "warn" | "fail" | "skipped";
export type DirectorStyleBenchmarkDimension = "script" | "video" | "audio" | "stability" | "cross_modal";
export type DirectorStyleBenchmarkSeverity = "info" | "warn" | "block";
export type DirectorStyleBenchmarkParityEvidenceStatus = "met" | "partial" | "missing";
export type DirectorStyleBenchmarkParityEvidenceCategory =
  | "artifact_contract"
  | "visual_media"
  | "audio_media"
  | "long_form"
  | "semantic_review"
  | "runtime_parity"
  | "governance";
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
  | "artifact_contract_plus_media_semantic_audio_review"
  | "artifact_contract_plus_runtime_review"
  | "artifact_contract_plus_media_runtime_review"
  | "artifact_contract_plus_semantic_audio_runtime_review"
  | "artifact_contract_plus_media_semantic_audio_runtime_review";
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
export type DirectorStyleBenchmarkRuntimeReviewMetricName =
  | "asr_transcript_alignment"
  | "lip_sync_timing";
export type DirectorStyleBenchmarkRuntimeReviewStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkRuntimeReviewerType = "manual" | "asr" | "lip_sync" | "hybrid";
export type DirectorStyleBenchmarkGovernanceReviewCheckName =
  | "directorbench_license_boundary"
  | "upstream_code_reuse_boundary"
  | "runtime_evaluator_independence"
  | "evaluation_asset_permissions";
export type DirectorStyleBenchmarkGovernanceReviewStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkGovernanceReviewerType = "operator" | "legal" | "product" | "security" | "hybrid";
export type DirectorStyleBenchmarkGeneratedAudioProviderEvidenceStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkLongFormValidationEvidenceStatus = "accepted" | "needs_review" | "rejected";
export type DirectorStyleBenchmarkReviewArtifactBindingStatus = "matched" | "missing" | "mismatched";

export interface DirectorStyleBenchmarkEvidence {
  readonly kind: string;
  readonly severity: DirectorStyleBenchmarkSeverity;
  readonly message: string;
  readonly source?: string;
}

export interface DirectorStyleBenchmarkReviewArtifactBinding {
  readonly projectId?: string;
  readonly requestId?: string;
  readonly deliverableSha256?: string;
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

export interface DirectorStyleBenchmarkParityEvidenceRequirement {
  readonly id: string;
  readonly category: DirectorStyleBenchmarkParityEvidenceCategory;
  readonly status: DirectorStyleBenchmarkParityEvidenceStatus;
  readonly requiredForDirectorBenchParity: boolean;
  readonly evidence: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly notes: string;
}

export interface DirectorStyleBenchmarkParityEvidenceMatrix {
  readonly requirementCount: number;
  readonly metCount: number;
  readonly partialCount: number;
  readonly missingCount: number;
  readonly requiredForParityCount: number;
  readonly requiredForParityMetCount: number;
  readonly canClaimDirectorBenchParity: false;
  readonly requirements: readonly DirectorStyleBenchmarkParityEvidenceRequirement[];
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

export interface DirectorStyleBenchmarkAudioVideoSyncSignals {
  readonly status: "analyzed" | "unavailable";
  readonly analyzer: "ffprobe_duration_delta";
  readonly containerDurationSeconds?: number;
  readonly videoDurationSeconds?: number;
  readonly audioDurationSeconds?: number;
  readonly durationDeltaSeconds?: number;
  readonly durationDeltaRatio?: number;
  readonly durationAlignmentScore?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkAudioMediaEvidence {
  readonly hasAudio: boolean;
  readonly codecName?: string;
  readonly sampleRate?: number;
  readonly channelCount?: number;
  readonly durationSeconds?: number;
  readonly waveformSignals?: DirectorStyleBenchmarkAudioWaveformSignals;
  readonly audioVideoSyncSignals?: DirectorStyleBenchmarkAudioVideoSyncSignals;
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
  readonly artifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  readonly artifactBindingStatus?: DirectorStyleBenchmarkReviewArtifactBindingStatus;
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
  readonly artifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  readonly artifactBindingStatus?: DirectorStyleBenchmarkReviewArtifactBindingStatus;
  readonly reviewedSegmentCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly metricCount: number;
  readonly averageScore?: number;
  readonly averageConfidence?: number;
  readonly metrics: readonly DirectorStyleBenchmarkAudioReviewMetricEvidence[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkRuntimeReviewMetricEvidence {
  readonly metricName: DirectorStyleBenchmarkRuntimeReviewMetricName;
  readonly status: DirectorStyleBenchmarkRuntimeReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkRuntimeReviewerType;
  readonly score: number;
  readonly confidence: number;
  readonly evidenceSummary: string;
  readonly reviewedSegmentCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkRuntimeReviewEvidence {
  readonly source: "manual_runtime_json" | "asr_json" | "lip_sync_json" | "hybrid_runtime_json";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkRuntimeReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkRuntimeReviewerType;
  readonly artifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  readonly artifactBindingStatus?: DirectorStyleBenchmarkReviewArtifactBindingStatus;
  readonly reviewedSegmentCount?: number;
  readonly reviewedBoundaryCount?: number;
  readonly metricCount: number;
  readonly averageScore?: number;
  readonly averageConfidence?: number;
  readonly metrics: readonly DirectorStyleBenchmarkRuntimeReviewMetricEvidence[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkGovernanceReviewCheckEvidence {
  readonly checkName: DirectorStyleBenchmarkGovernanceReviewCheckName;
  readonly status: DirectorStyleBenchmarkGovernanceReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkGovernanceReviewerType;
  readonly evidenceSummary: string;
  readonly reviewedAt?: string;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkGovernanceReviewEvidence {
  readonly source:
    | "operator_governance_json"
    | "legal_governance_json"
    | "product_governance_json"
    | "security_governance_json"
    | "hybrid_governance_json";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkGovernanceReviewStatus;
  readonly reviewerType: DirectorStyleBenchmarkGovernanceReviewerType;
  readonly artifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  readonly artifactBindingStatus?: DirectorStyleBenchmarkReviewArtifactBindingStatus;
  readonly reviewedAt?: string;
  readonly checkCount: number;
  readonly acceptedCheckCount: number;
  readonly checks: readonly DirectorStyleBenchmarkGovernanceReviewCheckEvidence[];
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkGeneratedAudioProviderEvidence {
  readonly source: "generated_audio_validation_report";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkGeneratedAudioProviderEvidenceStatus;
  readonly reportStatus: string;
  readonly canUseAsBusinessReadinessGeneratedAudioEvidence: boolean;
  readonly modelId?: string;
  readonly outputFormat?: "mp3" | "wav";
  readonly durationSeconds?: number;
  readonly estimatedCostUsd?: number;
  readonly providerNetworkCallsAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly schemaReviewed: boolean;
  readonly executionStatus?: string;
  readonly outputBatchStatus?: string;
  readonly approvedTrackCount: number;
  readonly providerLedgerEntryCount: number;
  readonly manualReviewPassed: boolean;
  readonly artifactEvidenceChecked: boolean;
  readonly artifactEvidenceMatchesReport: boolean;
  readonly artifactEvidenceReportPath?: string;
  readonly mediaSha256?: string;
  readonly findings: readonly string[];
}

export interface DirectorStyleBenchmarkLongFormValidationEvidence {
  readonly source: "long_form_validation_report";
  readonly sourcePath?: string;
  readonly status: DirectorStyleBenchmarkLongFormValidationEvidenceStatus;
  readonly reportStatus: string;
  readonly canUseAsBusinessReadinessLongFormEvidence: boolean;
  readonly plannedDurationSeconds?: number;
  readonly finalDurationSeconds?: number;
  readonly providerSpendAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly requestValidationStatus?: string;
  readonly readinessDecision?: string;
  readonly chunkPlanStatus?: string;
  readonly paidRenderStatus?: string;
  readonly artifactValidationStatus?: string;
  readonly artifactEvidencePresent: boolean;
  readonly deliverablePresent: boolean;
  readonly costLedgerEntryCount: number;
  readonly manualQualityReviewPassed: boolean;
  readonly manualReviewArtifactBindingMatched: boolean;
  readonly manualReviewArtifactBindingStatus?: string;
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
  readonly runtimeReviewEvidence?: DirectorStyleBenchmarkRuntimeReviewEvidence;
  readonly governanceReviewEvidence?: DirectorStyleBenchmarkGovernanceReviewEvidence;
  readonly generatedAudioProviderEvidence?: DirectorStyleBenchmarkGeneratedAudioProviderEvidence;
  readonly longFormValidationEvidence?: DirectorStyleBenchmarkLongFormValidationEvidence;
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
    readonly runtimeReviewPath?: string;
    readonly governanceReviewPath?: string;
    readonly generatedAudioValidationPath?: string;
    readonly longFormValidationPath?: string;
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
  readonly parityEvidenceMatrix: DirectorStyleBenchmarkParityEvidenceMatrix;
  readonly releaseGateSummary: {
    readonly benchmarkHarnessPass: boolean;
    readonly canUseAsBackendBenchmarkEvidence: boolean;
    readonly canClaimDirectorBenchParity: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}
