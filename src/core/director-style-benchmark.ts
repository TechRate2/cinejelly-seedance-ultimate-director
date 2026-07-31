import type {
  DirectorStyleBenchmarkAudioVideoSyncSignals,
  DirectorStyleBenchmarkAudioWaveformSignals,
  DirectorStyleBenchmarkAudioReviewMetricEvidence,
  DirectorStyleBenchmarkAudioReviewMetricName,
  DirectorStyleBenchmarkBottleneck,
  DirectorStyleBenchmarkDimension,
  DirectorStyleBenchmarkDimensionScore,
  DirectorStyleBenchmarkEvidence,
  DirectorStyleBenchmarkEvidenceScope,
  DirectorStyleBenchmarkFacts,
  DirectorStyleBenchmarkGovernanceReviewCheckName,
  DirectorStyleBenchmarkMetricResult,
  DirectorStyleBenchmarkMetricStatus,
  DirectorStyleBenchmarkParityEvidenceCategory,
  DirectorStyleBenchmarkParityEvidenceMatrix,
  DirectorStyleBenchmarkParityEvidenceRequirement,
  DirectorStyleBenchmarkParityEvidenceStatus,
  DirectorStyleBenchmarkProfile,
  DirectorStyleBenchmarkReport,
  DirectorStyleBenchmarkRuntimeReviewMetricEvidence,
  DirectorStyleBenchmarkRuntimeReviewMetricName,
  DirectorStyleBenchmarkSemanticReviewMetricEvidence,
  DirectorStyleBenchmarkSemanticReviewMetricName,
  DirectorStyleBenchmarkSeverity,
  DirectorStyleBenchmarkStatus
} from "../types/director-style-benchmark.js";
import {
  DIRECTOR_STYLE_BENCHMARK_SOURCE_PATTERN_IDS,
  internalSourcePatternOrigins
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(DIRECTOR_STYLE_BENCHMARK_SOURCE_PATTERN_IDS);

const ARTIFACT_KINDS = {
  runSummary: "run_summary",
  reviewPacket: "review_packet",
  storyPlan: "story_plan",
  storyboard: "storyboard",
  productionGraph: "production_graph",
  stageLifecycle: "stage_lifecycle",
  compiledPrompts: "compiled_prompts",
  renderedShots: "rendered_shots",
  postproductionAssetPlan: "postproduction_asset_plan",
  materialSourceValidation: "material_source_validation",
  costLedger: "cost_ledger",
  deliverable: "deliverable"
} as const;

const PROFILE_WEIGHTS: Record<DirectorStyleBenchmarkProfile, Record<DirectorStyleBenchmarkDimension, number>> = {
  balanced: {
    script: 0.24,
    video: 0.28,
    audio: 0.16,
    stability: 0.16,
    cross_modal: 0.16
  },
  story_first: {
    script: 0.45,
    video: 0.2,
    audio: 0.1,
    stability: 0.1,
    cross_modal: 0.15
  },
  visual_heavy: {
    script: 0.15,
    video: 0.5,
    audio: 0.08,
    stability: 0.12,
    cross_modal: 0.15
  },
  audio_emotion: {
    script: 0.18,
    video: 0.17,
    audio: 0.42,
    stability: 0.08,
    cross_modal: 0.15
  },
  sync_perfectionist: {
    script: 0.18,
    video: 0.18,
    audio: 0.16,
    stability: 0.08,
    cross_modal: 0.4
  }
};

export class DirectorStyleBenchmarkEvaluator {
  public evaluate(input: {
    readonly facts: DirectorStyleBenchmarkFacts;
    readonly profile?: DirectorStyleBenchmarkProfile;
    readonly minPassingScore?: number;
    readonly minConfidence?: number;
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
  }): DirectorStyleBenchmarkReport {
    const profile = input.profile ?? "balanced";
    const minPassingScore = input.minPassingScore ?? 0.7;
    const minConfidence = input.minConfidence ?? 0.6;
    const metrics = this.metricsFor(input.facts);
    const dimensionScores = this.dimensionScores(metrics, PROFILE_WEIGHTS[profile], minPassingScore);
    const scoredDimensions = dimensionScores.filter(
      (dimension): dimension is DirectorStyleBenchmarkDimensionScore & { readonly score: number; readonly confidence: number } =>
        dimension.score !== undefined && dimension.confidence !== undefined
    );
    const weightedScore = this.weightedAverage(
      scoredDimensions.map((dimension) => ({
        value: dimension.score,
        weight: dimension.weight * dimension.confidence
      }))
    );
    const weightedConfidence = this.weightedAverage(
      scoredDimensions.map((dimension) => ({
        value: dimension.confidence,
        weight: dimension.weight
      }))
    );
    const bottlenecks = this.bottlenecks(metrics, minPassingScore, minConfidence);
    const scoredMetrics = metrics.filter((metric) => metric.status !== "skipped");
    const lowConfidenceMetricCount = scoredMetrics.filter((metric) => (metric.confidence ?? 0) < minConfidence).length;
    const status = this.statusFor(weightedScore, bottlenecks, metrics, minPassingScore, minConfidence);
    const evidenceScope = this.evidenceScope(input.facts);
    const parityEvidenceMatrix = this.parityEvidenceMatrix(input.facts);
    const mediaPath = input.mediaPath ?? input.facts.mediaEvidence?.mediaPath;
    const semanticReviewPath = input.semanticReviewPath ?? input.facts.semanticReviewEvidence?.sourcePath;
    const audioReviewPath = input.audioReviewPath ?? input.facts.audioReviewEvidence?.sourcePath;
    const runtimeReviewPath = input.runtimeReviewPath ?? input.facts.runtimeReviewEvidence?.sourcePath;
    const governanceReviewPath = input.governanceReviewPath ?? input.facts.governanceReviewEvidence?.sourcePath;
    const generatedAudioValidationPath =
      input.generatedAudioValidationPath ?? input.facts.generatedAudioProviderEvidence?.sourcePath;
    const longFormValidationPath = input.longFormValidationPath ?? input.facts.longFormValidationEvidence?.sourcePath;
    const frameSamplingIntervalSeconds =
      input.frameSamplingIntervalSeconds ?? input.facts.mediaEvidence?.frameSamplingIntervalSeconds;

    return {
      schemaVersion: "cinejelly.director-style-benchmark.v1",
      generatedAt: new Date().toISOString(),
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: [...SOURCE_PATTERN_ORIGINS, ...input.facts.sourcePatternOrigins]
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right)),
      checkedInputs: {
        profile,
        ...(input.facts.sourceReportPath ? { sourceReportPath: input.facts.sourceReportPath } : {}),
        ...(input.facts.requestPath ? { requestPath: input.facts.requestPath } : {}),
        ...(input.facts.artifactDirectory ? { artifactDirectory: input.facts.artifactDirectory } : {}),
        ...(mediaPath ? { mediaPath } : {}),
        ...(frameSamplingIntervalSeconds ? { frameSamplingIntervalSeconds } : {}),
        ...(input.maxFrameSamples ? { maxFrameSamples: input.maxFrameSamples } : {}),
        ...(input.sceneChangeThreshold ? { sceneChangeThreshold: input.sceneChangeThreshold } : {}),
        ...(input.transitionBoundaryWindowSeconds
          ? { transitionBoundaryWindowSeconds: input.transitionBoundaryWindowSeconds }
          : {}),
        ...(input.maxTransitionBoundaries ? { maxTransitionBoundaries: input.maxTransitionBoundaries } : {}),
        ...(semanticReviewPath ? { semanticReviewPath } : {}),
        ...(audioReviewPath ? { audioReviewPath } : {}),
        ...(runtimeReviewPath ? { runtimeReviewPath } : {}),
        ...(governanceReviewPath ? { governanceReviewPath } : {}),
        ...(generatedAudioValidationPath ? { generatedAudioValidationPath } : {}),
        ...(longFormValidationPath ? { longFormValidationPath } : {}),
        ...(input.outputPath ? { outputPath: input.outputPath } : {}),
        ...(input.jsonlPath ? { jsonlPath: input.jsonlPath } : {}),
        minPassingScore,
        minConfidence
      },
      summary: {
        ...(weightedScore !== undefined ? { overallScore: this.round(weightedScore) } : {}),
        ...(weightedConfidence !== undefined ? { overallConfidence: this.round(weightedConfidence) } : {}),
        grade: this.grade(weightedScore),
        evidenceScope,
        metricCount: metrics.length,
        scoredMetricCount: scoredMetrics.length,
        skippedMetricCount: metrics.filter((metric) => metric.status === "skipped").length,
        bottleneckCount: bottlenecks.length,
        lowConfidenceMetricCount,
        canClaimDirectorBenchParity: false
      },
      facts: input.facts,
      dimensionScores,
      metrics,
      bottlenecks,
      parityEvidenceMatrix,
      releaseGateSummary: {
        benchmarkHarnessPass: status === "pass",
        canUseAsBackendBenchmarkEvidence: status !== "blocked",
        canClaimDirectorBenchParity: false,
        canReleaseToCustomerTraffic: false,
        releaseBlocker:
          status === "blocked"
            ? "Benchmark evidence is blocked by missing core artifact or render completion evidence."
            : evidenceScope === "artifact_contract_only"
              ? "Director-style benchmark evidence is artifact-contract-only; customer release still requires real long-form paid output, frame/audio review, governance review, production deployment evidence, and manual approval."
              : evidenceScope.includes("audio_waveform")
              ? "Director-style benchmark includes local media probe/frame/audio-waveform/audio-duration-sync proxy evidence, but customer release still requires long-form paid output, semantic visual/audio review, generated-audio provider evidence, governance review, production deployment evidence, and manual approval."
              : "Director-style benchmark includes local media probe/frame-signal evidence, but customer release still requires long-form paid output, semantic visual/audio review, governance review, production deployment evidence, and manual approval."
      },
      nextActions: this.nextActions(input.facts, metrics, bottlenecks)
    };
  }

  private metricsFor(facts: DirectorStyleBenchmarkFacts): readonly DirectorStyleBenchmarkMetricResult[] {
    const visualSignals = facts.mediaEvidence?.visualSignals;
    const transitionSignals = facts.mediaEvidence?.transitionSignals;
    const hasFrameSignals = facts.mediaEvidence?.status === "frame_sampled" && (visualSignals?.sampleCount ?? 0) >= 2;
    const hasBoundarySignals = transitionSignals?.status === "analyzed" && transitionSignals.analyzedBoundaryCount > 0;
    const hasMediaProbe = facts.mediaEvidence?.deliveryStatus !== undefined;
    const hasAcceptedLongFormValidation = this.hasAcceptedLongFormValidation(facts);
    const hasLongFormDuration = this.hasMeasuredLongFormDuration(facts) || hasAcceptedLongFormValidation;
    const mediaProxyLimitations = [
      "Sampled-frame color and brightness signals are structural proxies; VLM/ASR/lip-sync and shot-boundary review are still required for full DirectorBench-style parity."
    ];
    const semanticReviewLimitations = [
      "Structured semantic review evidence is checkpoint evidence; long-form paid output, audio review, ASR/lip-sync, governance review, and full DirectorBench runtime parity remain separate gates."
    ];
    const frameSignalEvidence = hasFrameSignals
      ? [
          this.mediaEvidence(
            "media_frame_signal",
            `Sampled ${visualSignals?.sampleCount ?? 0} frame signal(s) from local rendered media; frame paths are redacted from this report.`
          )
        ]
      : [];
    const boundarySignalEvidence = hasBoundarySignals
      ? [
          this.mediaEvidence(
            "media_boundary_signal",
            `Analyzed ${transitionSignals?.analyzedBoundaryCount ?? 0} detected transition boundary/boundaries with pre/post frame signals; frame paths are redacted from this report.`
          )
        ]
      : [];
    const semanticReviewEvidence = (metricName: DirectorStyleBenchmarkSemanticReviewMetricName) => {
      const metric = this.semanticReviewMetric(facts, metricName);
      return metric
        ? [
            this.semanticEvidence(
              metric,
              `${metric.metricName} semantic review score=${metric.score}, confidence=${metric.confidence}; ${metric.evidenceSummary}`
            )
          ]
        : [];
    };
    const probedMediaEvidence = hasMediaProbe
      ? [
          this.mediaEvidence(
            "media_probe",
            `FFprobe delivery status is ${facts.mediaEvidence?.deliveryStatus}; duration=${facts.mediaEvidence?.durationSeconds ?? "unknown"}s, audio=${facts.mediaEvidence?.audio?.hasAudio === true ? "present" : "absent"}.`
          )
        ]
      : [];
    const scriptVideoFidelityReview = this.semanticReviewMetric(facts, "script_video_fidelity");
    const userDemandReview = this.semanticReviewMetric(facts, "user_demand_fulfillment");
    const temporalCoherenceReview = this.semanticReviewMetric(facts, "temporal_coherence");
    const transitionQualityReview = this.semanticReviewMetric(facts, "transition_quality");
    const lightingConsistencyReview = this.semanticReviewMetric(facts, "lighting_consistency");
    const textVideoConsistencyReview = this.semanticReviewMetric(facts, "text_video_consistency");
    const scriptVideoFidelityScore = scriptVideoFidelityReview?.score ?? (hasFrameSignals && facts.manualReviewAccepted ? 0.74 : 0.68);
    const scriptVideoFidelityConfidence = scriptVideoFidelityReview?.confidence ?? (hasFrameSignals && facts.manualReviewAccepted ? 0.6 : 0.46);
    const userDemandFulfillmentScore = userDemandReview?.score ?? (facts.artifactValidationStatus === "pass" ? 0.82 : 0.58);
    const userDemandFulfillmentConfidence = userDemandReview?.confidence ?? 0.66;
    const temporalCoherenceScore = temporalCoherenceReview?.score ?? (hasFrameSignals && visualSignals?.temporalContinuityScore !== undefined
      ? Math.max(0.7, Math.min(0.84, 0.58 + visualSignals.temporalContinuityScore * 0.26))
      : 0.78);
    const temporalCoherenceConfidence = temporalCoherenceReview?.confidence ?? (hasFrameSignals ? 0.68 : 0.64);
    const transitionQualityScore = transitionQualityReview?.score ?? (hasBoundarySignals && transitionSignals?.transitionContinuityScore !== undefined
      ? Math.max(0.6, Math.min(0.78, 0.5 + transitionSignals.transitionContinuityScore * 0.28))
      : hasFrameSignals && visualSignals?.transitionContinuityScore !== undefined
      ? Math.max(0.56, Math.min(0.72, 0.48 + visualSignals.transitionContinuityScore * 0.24))
      : facts.finalDurationSeconds && facts.finalDurationSeconds >= 60 ? 0.68 : 0.56);
    const transitionQualityConfidence = transitionQualityReview?.confidence ?? (hasBoundarySignals
      ? 0.64
      : hasFrameSignals ? 0.56 : facts.finalDurationSeconds && facts.finalDurationSeconds >= 60 ? 0.48 : 0.34);
    const lightingConsistencyScore = lightingConsistencyReview?.score ?? (hasFrameSignals && visualSignals?.lightingConsistencyScore !== undefined
      ? Math.max(0.56, Math.min(0.76, 0.48 + visualSignals.lightingConsistencyScore * 0.28))
      : 0.56);
    const lightingConsistencyConfidence = lightingConsistencyReview?.confidence ?? (hasFrameSignals ? 0.62 : 0.34);
    const generationStabilityScore = hasAcceptedLongFormValidation
      ? 0.88
      : facts.renderStatus === "completed" && facts.artifactValidationStatus === "pass" ? 0.82 : 0.52;
    const generationStabilityConfidence = hasAcceptedLongFormValidation
      ? 0.76
      : hasLongFormDuration
      ? 0.7
      : hasMediaProbe
        ? 0.56
        : 0.52;
    const textVideoConsistencyScore = textVideoConsistencyReview?.score ?? (hasFrameSignals && facts.manualReviewAccepted ? 0.69 : 0.66);
    const textVideoConsistencyConfidence = textVideoConsistencyReview?.confidence ?? (hasFrameSignals && facts.manualReviewAccepted ? 0.55 : 0.45);

    return [
      this.metric({
        facts,
        dimension: "script",
        metricName: "script_reasonableness",
        upstreamMetric: "script_reasonableness",
        requiredKinds: [ARTIFACT_KINDS.storyPlan, ARTIFACT_KINDS.storyboard, ARTIFACT_KINDS.compiledPrompts],
        score: 0.86,
        confidence: 0.72,
        passMessage: "Story plan, storyboard, and compiled prompts are present as deterministic planning artifacts.",
        failMessage: "Script/story planning artifacts are incomplete.",
        suggestion: "Keep story-plan, storyboard, and compiled-prompts artifacts in every render bundle."
      }),
      this.metric({
        facts,
        dimension: "script",
        metricName: "user_requirement_consistency",
        upstreamMetric: "user_requirement_consistency",
        requiredKinds: [ARTIFACT_KINDS.reviewPacket, ARTIFACT_KINDS.productionGraph],
        score: facts.requestPath ? 0.8 : 0.64,
        confidence: facts.requestPath ? 0.68 : 0.44,
        passMessage: facts.requestPath
          ? "Request input and review/graph evidence are available for prompt-to-plan traceability."
          : "Review and graph evidence exist, but the original request was not supplied to this benchmark run.",
        failMessage: "Review packet or production graph evidence is missing.",
        suggestion: "Run the benchmark with --request assets/output_deliverables/phase6-validation/request.json for stronger requirement evidence."
      }),
      this.metric({
        facts,
        dimension: "script",
        metricName: "script_video_fidelity",
        upstreamMetric: "script_video_fidelity",
        requiredKinds: [ARTIFACT_KINDS.storyboard, ARTIFACT_KINDS.renderedShots],
        score: scriptVideoFidelityScore,
        confidence: scriptVideoFidelityConfidence,
        passMessage: scriptVideoFidelityReview
          ? "Storyboard/rendered-shot evidence is reinforced by structured semantic review evidence."
          : hasFrameSignals
          ? "Storyboard/rendered-shot evidence is reinforced by sampled-frame media signals and accepted manual review."
          : "Storyboard and rendered-shot evidence can be cross-counted, but no visual frame analysis is run.",
        failMessage: "Storyboard or rendered-shot evidence is missing.",
        suggestion: "Add real VLM or shot-level manual fidelity review before claiming script-video fidelity.",
        extraEvidence: [...semanticReviewEvidence("script_video_fidelity"), ...frameSignalEvidence],
        ...(scriptVideoFidelityReview
          ? { limitations: semanticReviewLimitations }
          : hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "user_demand_fulfillment",
        upstreamMetric: "user_demand_fulfillment",
        requiredKinds: [ARTIFACT_KINDS.deliverable, ARTIFACT_KINDS.reviewPacket],
        score: userDemandFulfillmentScore,
        confidence: userDemandFulfillmentConfidence,
        passMessage: userDemandReview
          ? "Deliverable/review-packet evidence is reinforced by structured semantic user-demand review."
          : "Deliverable and review-packet evidence exist, with artifact validation status considered.",
        failMessage: "Deliverable or review-packet evidence is missing.",
        suggestion: "Keep artifact validation pass evidence with every benchmarked deliverable.",
        extraEvidence: semanticReviewEvidence("user_demand_fulfillment"),
        ...(userDemandReview ? { limitations: semanticReviewLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "temporal_coherence",
        upstreamMetric: "temporal_coherence",
        requiredKinds: [ARTIFACT_KINDS.stageLifecycle, ARTIFACT_KINDS.renderedShots, ARTIFACT_KINDS.productionGraph],
        score: temporalCoherenceScore,
        confidence: temporalCoherenceConfidence,
        passMessage: temporalCoherenceReview
          ? "Stage lifecycle evidence is reinforced by structured semantic temporal-coherence review."
          : hasFrameSignals
          ? "Stage lifecycle evidence is reinforced by sampled-frame continuity signals from the rendered media."
          : "Stage lifecycle, production graph, and rendered-shot artifacts preserve ordered temporal evidence.",
        failMessage: "Temporal planning or rendered-shot evidence is missing.",
        suggestion: "Keep stage lifecycle and production graph evidence synchronized with rendered shots.",
        extraEvidence: [...semanticReviewEvidence("temporal_coherence"), ...frameSignalEvidence],
        ...(temporalCoherenceReview
          ? { limitations: semanticReviewLimitations }
          : hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "transition_quality",
        upstreamMetric: "transition_quality",
        requiredKinds: [ARTIFACT_KINDS.deliverable, ARTIFACT_KINDS.stageLifecycle],
        score: transitionQualityScore,
        confidence: transitionQualityConfidence,
        passMessage: transitionQualityReview
          ? "Deliverable/lifecycle evidence is reinforced by structured semantic transition-quality review."
          : hasBoundarySignals
          ? "Deliverable/lifecycle evidence is reinforced by detected transition-boundary pre/post frame signals."
          : hasFrameSignals
            ? "Deliverable/lifecycle evidence is reinforced by sampled-frame color-continuity signals."
          : "Deliverable and lifecycle evidence exist, but transition quality is not frame-boundary analyzed.",
        failMessage: "Deliverable or lifecycle evidence is missing.",
        suggestion: "Run this benchmark on long-form outputs with detected transition boundaries and add semantic/manual transition review.",
        extraEvidence: [
          ...semanticReviewEvidence("transition_quality"),
          ...(hasBoundarySignals ? boundarySignalEvidence : frameSignalEvidence)
        ],
        ...(transitionQualityReview
          ? { limitations: semanticReviewLimitations }
          : hasBoundarySignals
          ? {
              limitations: [
                "FFmpeg scene-change boundary signals are structural proxies; semantic/manual transition review is still required for full DirectorBench-style parity."
              ]
            }
          : hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "lighting_consistency",
        upstreamMetric: "lighting_consistency",
        requiredKinds: [ARTIFACT_KINDS.reviewPacket, ARTIFACT_KINDS.renderedShots],
        score: lightingConsistencyScore,
        confidence: lightingConsistencyConfidence,
        passMessage: lightingConsistencyReview
          ? "Rendered-shot/review evidence is reinforced by structured semantic lighting review."
          : hasFrameSignals
          ? "Rendered-shot and review evidence is reinforced by sampled-frame brightness consistency signals."
          : "Rendered-shot and review evidence exist, but lighting is not visually inspected by this no-spend harness.",
        failMessage: "Rendered-shot or review evidence is missing.",
        suggestion: "Use semantic visual inspection or manual review to raise lighting-confidence evidence.",
        extraEvidence: [...semanticReviewEvidence("lighting_consistency"), ...frameSignalEvidence],
        ...(lightingConsistencyReview
          ? { limitations: semanticReviewLimitations }
          : hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.audioMetric(facts, "narration_reasonableness", "narration_reasonableness"),
      this.audioMetric(facts, "bgm_consistency", "bgm_consistency"),
      this.metric({
        facts,
        dimension: "stability",
        metricName: "generation_stability",
        upstreamMetric: "generation_stability",
        requiredKinds: [ARTIFACT_KINDS.costLedger, ARTIFACT_KINDS.deliverable],
        score: generationStabilityScore,
        confidence: generationStabilityConfidence,
        passMessage: hasAcceptedLongFormValidation
          ? "Accepted long-form validation report reinforces render completion, artifact validation, duration, and manual review evidence."
          : hasMediaProbe
          ? "Render completion, cost ledger, deliverable validation, and local media probe evidence exist."
          : "Render completion, cost ledger, and deliverable validation evidence exist.",
        failMessage: "Render completion, cost ledger, or deliverable evidence is incomplete.",
        suggestion: "Run this benchmark on a real 2-8 minute paid output to prove long-form stability.",
        extraEvidence: [
          ...probedMediaEvidence,
          ...(facts.longFormValidationEvidence ? [this.longFormValidationEvidence(facts.longFormValidationEvidence)] : [])
        ],
        ...(hasLongFormDuration
          ? {}
          : { limitations: ["Short media probe evidence cannot prove long-form quality maintenance."] })
      }),
      this.metric({
        facts,
        dimension: "stability",
        metricName: "provider_completion_stability",
        upstreamMetric: "generation_stability",
        requiredKinds: [ARTIFACT_KINDS.costLedger],
        score: facts.costLedgerEntryCount && facts.costLedgerEntryCount > 0 && facts.renderStatus === "completed" ? 0.86 : 0.45,
        confidence: 0.7,
        passMessage: "Provider operation ledger exists and the paid render report reached completed status.",
        failMessage: "Provider ledger or completed render status is missing.",
        suggestion: "Keep cost-ledger/provider operation evidence for every paid validation run."
      }),
      this.metric({
        facts,
        dimension: "cross_modal",
        metricName: "text_video_consistency",
        upstreamMetric: "text_video_consistency",
        requiredKinds: [ARTIFACT_KINDS.compiledPrompts, ARTIFACT_KINDS.renderedShots, ARTIFACT_KINDS.reviewPacket],
        score: textVideoConsistencyScore,
        confidence: textVideoConsistencyConfidence,
        passMessage: textVideoConsistencyReview
          ? "Compiled prompt/rendered-shot/review evidence is reinforced by structured semantic text-video review."
          : hasFrameSignals
          ? "Compiled prompt/rendered-shot/review evidence is reinforced by sampled-frame media signals, but semantic matching is still limited."
          : "Compiled prompt, rendered-shot, and review evidence exist, but semantic frame matching is not run.",
        failMessage: "Prompt, rendered-shot, or review evidence is missing.",
        suggestion: "Add VLM or shot-level manual review evidence before claiming text-video semantic alignment.",
        extraEvidence: [...semanticReviewEvidence("text_video_consistency"), ...frameSignalEvidence],
        ...(textVideoConsistencyReview
          ? { limitations: semanticReviewLimitations }
          : hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.audioMetric(facts, "video_audio_consistency", "video_audio_consistency", "cross_modal"),
      this.audioMetric(facts, "text_audio_consistency", "text_audio_consistency", "cross_modal")
    ];
  }

  private metric(input: {
    readonly facts: DirectorStyleBenchmarkFacts;
    readonly dimension: DirectorStyleBenchmarkDimension;
    readonly metricName: string;
    readonly upstreamMetric: string;
    readonly requiredKinds: readonly string[];
    readonly score: number;
    readonly confidence: number;
    readonly passMessage: string;
    readonly failMessage: string;
    readonly suggestion: string;
    readonly evidenceKind?: string;
    readonly extraEvidence?: readonly DirectorStyleBenchmarkEvidence[];
    readonly limitations?: readonly string[];
  }): DirectorStyleBenchmarkMetricResult {
    const missingKinds = input.requiredKinds.filter((kind) => !input.facts.artifactKinds.includes(kind));
    if (missingKinds.length > 0) {
      return {
        dimension: input.dimension,
        metricName: input.metricName,
        upstreamMetric: input.upstreamMetric,
        status: "fail",
        score: 0.25,
        confidence: 0.8,
        evidence: [
          {
            kind: "missing_artifact",
            severity: "block",
            message: `${input.failMessage} Missing: ${missingKinds.join(", ")}.`
          }
        ],
        suggestions: [input.suggestion],
        limitations: ["This no-spend benchmark only evaluates persisted CineJelly artifact evidence."]
      };
    }
    const limitations = input.limitations ?? (input.confidence < 0.6
      ? ["No frame-level/VLM/ASR media analysis is performed by this artifact-contract harness."]
      : []);
    return {
      dimension: input.dimension,
      metricName: input.metricName,
      upstreamMetric: input.upstreamMetric,
      status: input.score >= 0.7 && input.confidence >= 0.6 ? "pass" : "warn",
      score: this.round(input.score),
      confidence: this.round(input.confidence),
      evidence: [
        {
          kind: input.evidenceKind ?? "artifact_contract",
          severity: input.score >= 0.7 && input.confidence >= 0.6 ? "info" : "warn",
          message: input.passMessage
        },
        ...(input.extraEvidence ?? [])
      ],
      suggestions: input.score >= 0.7 && input.confidence >= 0.6 ? [] : [input.suggestion],
      limitations
    };
  }

  private audioMetric(
    facts: DirectorStyleBenchmarkFacts,
    metricName: DirectorStyleBenchmarkAudioReviewMetricName,
    upstreamMetric: string,
    dimension: DirectorStyleBenchmarkDimension = "audio"
  ): DirectorStyleBenchmarkMetricResult {
    const reviewMetric = this.audioReviewMetric(facts, metricName);
    const runtimeMetric = this.runtimeMetricForAudioMetric(facts, metricName);
    const waveformMetric = this.audioWaveformMetric(facts);
    const syncMetric = this.audioVideoSyncMetric(facts);
    const proxyMetric = this.audioProxyMetric(metricName, waveformMetric, syncMetric);
    const providerEvidence = facts.generatedAudioProviderEvidence;
    if (!facts.hasAudioEvidence && !reviewMetric && !runtimeMetric && providerEvidence?.status !== "accepted") {
      return {
        dimension,
        metricName,
        upstreamMetric,
        status: "skipped",
        evidence: [
          {
            kind: "audio_absent",
            severity: "info",
            message: "No generated-audio/audio-review evidence is present; Director-style audio metric is excluded rather than treated as a failure."
          }
        ],
        suggestions: ["Run generated-audio validation and manual listening review before commercial audio claims."],
        limitations: ["Absent audio is skipped following DirectorBench-style optional audio handling."]
      };
    }
    return this.metric({
      facts,
      dimension,
      metricName,
      upstreamMetric,
      requiredKinds: [ARTIFACT_KINDS.postproductionAssetPlan, ARTIFACT_KINDS.reviewPacket],
      score: runtimeMetric?.score ?? reviewMetric?.score ?? proxyMetric?.score ?? this.generatedAudioProviderScore(providerEvidence) ?? (facts.manualReviewAccepted ? 0.78 : 0.62),
      confidence: runtimeMetric?.confidence ?? reviewMetric?.confidence ?? proxyMetric?.confidence ?? this.generatedAudioProviderConfidence(providerEvidence) ?? (facts.manualReviewAccepted ? 0.64 : 0.46),
      passMessage: reviewMetric
        ? runtimeMetric
          ? "Audio/postproduction evidence is reinforced by structured audio review and runtime ASR/lip-sync checkpoint evidence."
          : "Audio/postproduction evidence is reinforced by structured audio review evidence."
        : runtimeMetric
        ? "Audio/postproduction evidence is reinforced by structured runtime ASR/lip-sync checkpoint evidence."
        : proxyMetric
        ? "Audio/postproduction evidence is reinforced by local audio signal and sync proxy evidence."
        : providerEvidence
        ? "Audio/postproduction evidence is reinforced by generated-audio provider validation evidence."
        : "Audio/postproduction evidence exists and manual review status is reflected.",
      failMessage: "Audio/postproduction runtime review evidence is incomplete.",
      suggestion: reviewMetric
        ? runtimeMetric
          ? "Keep runtime review evidence attached to the same generated-audio and long-form artifact bundle."
          : "Capture provider-backed generated-audio output validation plus ASR/lip-sync runtime review."
        : runtimeMetric
        ? "Pair runtime ASR/lip-sync review with generated-audio output validation and manual listening review."
        : proxyMetric
        ? "Add structured audio review, ASR/lip-sync, and generated-audio provider evidence before accepting audio quality."
        : "Capture provider-backed generated-audio output validation and manual listening review.",
      extraEvidence: [
        ...(reviewMetric
          ? [
            this.audioEvidence(
              reviewMetric,
              `${reviewMetric.metricName} audio review score=${reviewMetric.score}, confidence=${reviewMetric.confidence}; ${reviewMetric.evidenceSummary}`
            )
          ]
          : []),
        ...(runtimeMetric
          ? [
              this.runtimeEvidence(
                runtimeMetric,
                `${runtimeMetric.metricName} runtime review score=${runtimeMetric.score}, confidence=${runtimeMetric.confidence}; ${runtimeMetric.evidenceSummary}`
              )
            ]
          : []),
        ...(!reviewMetric && !runtimeMetric && proxyMetric ? proxyMetric.evidence : []),
        ...(!reviewMetric && !runtimeMetric && !proxyMetric && providerEvidence
          ? [this.generatedAudioProviderEvidence(providerEvidence)]
          : [])
      ],
      ...(runtimeMetric
        ? {
            limitations: [
              "Structured runtime review evidence is checkpoint evidence; it must still be tied to generated-audio provider output, long-form media, manual listening review, and permission review before DirectorBench-style parity can be claimed."
            ]
          }
        : reviewMetric
        ? {
            limitations: [
              "Structured audio review evidence is checkpoint evidence; ASR/lip-sync, waveform analysis, live generated-audio output, and full DirectorBench runtime parity remain separate gates."
            ]
          }
        : proxyMetric
        ? {
            limitations: [
              "FFmpeg waveform and FFprobe duration-alignment evidence are structural proxies; they cannot verify narration meaning, BGM appropriateness, true audio-video sync, ASR transcript accuracy, lip sync, or generated-audio provider quality."
            ]
          }
        : providerEvidence
        ? {
            limitations: [
              "Generated-audio provider validation evidence proves provider execution/output validation/manual listening gates, but structured audio review, ASR alignment, lip-sync timing, and long-form media binding remain separate gates."
            ]
          }
        : {})
    });
  }

  private dimensionScores(
    metrics: readonly DirectorStyleBenchmarkMetricResult[],
    weights: Record<DirectorStyleBenchmarkDimension, number>,
    minPassingScore: number
  ): readonly DirectorStyleBenchmarkDimensionScore[] {
    return (Object.keys(weights) as DirectorStyleBenchmarkDimension[]).map((dimension) => {
      const dimensionMetrics = metrics.filter((metric) => metric.dimension === dimension);
      const scored = dimensionMetrics.filter(
        (metric): metric is DirectorStyleBenchmarkMetricResult & { readonly score: number; readonly confidence: number } =>
          metric.score !== undefined && metric.confidence !== undefined && metric.status !== "skipped"
      );
      const score = this.weightedAverage(scored.map((metric) => ({ value: metric.score, weight: metric.confidence })));
      const confidence = this.weightedAverage(scored.map((metric) => ({ value: metric.confidence, weight: 1 })));
      const status = this.metricStatusFor(score, confidence, minPassingScore, 0.6, scored.length === 0);
      return {
        dimension,
        ...(score !== undefined ? { score: this.round(score) } : {}),
        ...(confidence !== undefined ? { confidence: this.round(confidence) } : {}),
        weight: weights[dimension],
        metricCount: dimensionMetrics.length,
        skippedMetricCount: dimensionMetrics.filter((metric) => metric.status === "skipped").length,
        status
      };
    });
  }

  private bottlenecks(
    metrics: readonly DirectorStyleBenchmarkMetricResult[],
    minPassingScore: number,
    minConfidence: number
  ): readonly DirectorStyleBenchmarkBottleneck[] {
    return metrics
      .filter((metric) => metric.status !== "skipped")
      .filter((metric) => (metric.score ?? 0) < minPassingScore || (metric.confidence ?? 0) < minConfidence)
      .map((metric) => ({
        dimension: metric.dimension,
        metricName: metric.metricName,
        ...(metric.score !== undefined ? { score: metric.score } : {}),
        ...(metric.confidence !== undefined ? { confidence: metric.confidence } : {}),
        severity: this.bottleneckSeverity(metric),
        message: `${metric.metricName} needs stronger evidence before it can be treated as production-quality backend benchmark proof.`,
        suggestions: metric.suggestions
      }));
  }

  private statusFor(
    overallScore: number | undefined,
    bottlenecks: readonly DirectorStyleBenchmarkBottleneck[],
    metrics: readonly DirectorStyleBenchmarkMetricResult[],
    minPassingScore: number,
    minConfidence: number
  ): DirectorStyleBenchmarkStatus {
    if (metrics.some((metric) => metric.status === "fail")) {
      return "blocked";
    }
    if (overallScore === undefined || overallScore < minPassingScore) {
      return "review_required";
    }
    if (bottlenecks.some((item) => item.severity === "block")) {
      return "blocked";
    }
    if (bottlenecks.length > 0 || metrics.some((metric) => (metric.confidence ?? 1) < minConfidence)) {
      return "review_required";
    }
    return "pass";
  }

  private nextActions(
    facts: DirectorStyleBenchmarkFacts,
    metrics: readonly DirectorStyleBenchmarkMetricResult[],
    bottlenecks: readonly DirectorStyleBenchmarkBottleneck[]
  ): readonly string[] {
    const actions = new Set<string>();
    if (facts.longFormValidationEvidence && facts.longFormValidationEvidence.status !== "accepted") {
      actions.add("Complete long-form validation budget, Atlas billing, paid render, artifact, duration, cost-ledger, and artifact-bound manual quality-review gates before treating long-form evidence as accepted.");
    } else if (!this.hasMeasuredLongFormDuration(facts) && !this.hasAcceptedLongFormValidation(facts)) {
      actions.add("Run the benchmark against a paid 2-8 minute long-form output before using it as long-form production evidence.");
    }
    if (facts.generatedAudioProviderEvidence && facts.generatedAudioProviderEvidence.status !== "accepted") {
      actions.add("Complete generated-audio validation provider spend, billing, schema, output-batch, ledger, and manual listening gates before treating audio provider evidence as accepted.");
    } else if (!facts.hasAudioEvidence && facts.generatedAudioProviderEvidence?.status !== "accepted") {
      actions.add("Add generated-audio provider output validation and manual listening review to score audio and audio cross-modal metrics.");
    } else if (!facts.audioReviewEvidence || facts.audioReviewEvidence.metricCount < 2) {
      actions.add("Provide structured audio review JSON for narration, BGM, and audio cross-modal quality checkpoints.");
    } else if (facts.audioReviewEvidence.status !== "accepted") {
      actions.add("Resolve structured audio review findings before treating audio metrics as accepted.");
    }
    if (!facts.runtimeReviewEvidence || facts.runtimeReviewEvidence.metricCount < 2) {
      actions.add("Provide structured runtime review JSON for ASR transcript alignment and lip-sync timing checkpoints.");
    } else if (facts.runtimeReviewEvidence.status !== "accepted") {
      actions.add("Resolve structured runtime ASR/lip-sync review findings before treating runtime parity checkpoints as accepted.");
    }
    if (facts.semanticReviewEvidence && !this.reviewArtifactBindingMatched(facts.semanticReviewEvidence)) {
      actions.add("Bind structured semantic review JSON to the paid-render projectId, requestId, and deliverableSha256 before using it as artifact-bound parity evidence.");
    }
    if (facts.audioReviewEvidence && !this.reviewArtifactBindingMatched(facts.audioReviewEvidence)) {
      actions.add("Bind structured audio review JSON to the paid-render projectId, requestId, and deliverableSha256 before using it as artifact-bound parity evidence.");
    }
    if (facts.runtimeReviewEvidence && !this.reviewArtifactBindingMatched(facts.runtimeReviewEvidence)) {
      actions.add("Bind structured runtime ASR/lip-sync review JSON to the paid-render projectId, requestId, and deliverableSha256 before using it as artifact-bound parity evidence.");
    }
    if (facts.governanceReviewEvidence && !this.reviewArtifactBindingMatched(facts.governanceReviewEvidence)) {
      actions.add("Bind structured governance review JSON to the paid-render projectId, requestId, and deliverableSha256 before using it as artifact-bound parity evidence.");
    }
    if (!this.hasAcceptedGovernanceReview(facts)) {
      actions.add("Provide structured governance review JSON for DirectorBench license boundary, runtime evaluator independence, and evaluation-asset permissions.");
    }
    if (!facts.mediaEvidence || facts.mediaEvidence.status === "unavailable") {
      actions.add("Provide a local rendered media file to add media probe and sampled-frame evidence to the Director-style benchmark.");
    } else if (facts.mediaEvidence.status !== "frame_sampled") {
      actions.add("Enable successful sampled-frame extraction so transition, lighting, and temporal continuity evidence can move beyond metadata-only checks.");
    }
    if (metrics.some((metric) => metric.limitations.length > 0)) {
      actions.add("Add long-form boundary-rich media, semantic visual review, ASR/lip-sync, or manual media review evidence for metrics still limited to structural proxies.");
    }
    if (!facts.semanticReviewEvidence || facts.semanticReviewEvidence.metricCount < 4) {
      actions.add("Provide structured semantic review JSON for script-video fidelity, transition quality, lighting, and text-video consistency.");
    } else if (facts.semanticReviewEvidence.status !== "accepted") {
      actions.add("Resolve structured semantic review findings before treating visual metrics as accepted.");
    }
    if (bottlenecks.length > 0) {
      actions.add("Review benchmark bottlenecks and feed them into the repair/manual-review checklist before commercial release.");
    }
    actions.add("Use parityEvidenceMatrix to close every missing DirectorBench-style parity evidence requirement before claiming full benchmark parity.");
    actions.add("Keep this report as backend quality evidence only; do not treat it as UI readiness or customer-traffic approval.");
    return [...actions];
  }

  private parityEvidenceMatrix(facts: DirectorStyleBenchmarkFacts): DirectorStyleBenchmarkParityEvidenceMatrix {
    const allCoreArtifactsPresent = [
      ARTIFACT_KINDS.storyPlan,
      ARTIFACT_KINDS.storyboard,
      ARTIFACT_KINDS.compiledPrompts,
      ARTIFACT_KINDS.renderedShots,
      ARTIFACT_KINDS.reviewPacket,
      ARTIFACT_KINDS.productionGraph,
      ARTIFACT_KINDS.stageLifecycle,
      ARTIFACT_KINDS.deliverable,
      ARTIFACT_KINDS.costLedger
    ].every((kind) => facts.artifactKinds.includes(kind));
    const mediaEvidence = facts.mediaEvidence;
    const hasLocalVideoProbe = mediaEvidence?.deliveryStatus !== undefined && mediaEvidence.video !== undefined;
    const hasSampledFrames = mediaEvidence?.status === "frame_sampled" && (mediaEvidence.frameSampleCount ?? 0) >= 2;
    const hasDetectedTransitionBoundaries =
      mediaEvidence?.transitionSignals?.status === "analyzed" &&
      mediaEvidence.transitionSignals.analyzedBoundaryCount > 0;
    const transitionAnalyzerRan = mediaEvidence?.transitionSignals?.status === "not_detected" || hasDetectedTransitionBoundaries;
    const hasMeasuredLongFormDuration = this.hasMeasuredLongFormDuration(facts);
    const hasAcceptedLongFormValidation = this.hasAcceptedLongFormValidation(facts);
    const hasLongFormDuration = hasMeasuredLongFormDuration || hasAcceptedLongFormValidation;
    const hasAcceptedSemanticReview =
      facts.semanticReviewEvidence?.status === "accepted" &&
      facts.semanticReviewEvidence.metricCount >= 4 &&
      this.reviewArtifactBindingMatched(facts.semanticReviewEvidence);
    const hasGeneratedAudioProviderEvidence = this.hasAcceptedGeneratedAudioProviderEvidence(facts);
    const hasAcceptedAudioReview =
      facts.audioReviewEvidence?.status === "accepted" &&
      facts.audioReviewEvidence.metricCount >= 4 &&
      this.reviewArtifactBindingMatched(facts.audioReviewEvidence);
    const hasAsrReview =
      facts.runtimeReviewEvidence?.status === "accepted" &&
      this.reviewArtifactBindingMatched(facts.runtimeReviewEvidence) &&
      facts.runtimeReviewEvidence.metrics.some((item) => item.metricName === "asr_transcript_alignment" && item.status === "accepted");
    const hasLipSyncProxy =
      facts.runtimeReviewEvidence?.status === "accepted" &&
      this.reviewArtifactBindingMatched(facts.runtimeReviewEvidence) &&
      facts.runtimeReviewEvidence.metrics.some((item) => item.metricName === "lip_sync_timing" && item.status === "accepted");
    const hasAcceptedManualReview = facts.manualReviewAccepted === true;
    const hasAcceptedGovernanceReview = this.hasAcceptedGovernanceReview(facts);

    const requirements: DirectorStyleBenchmarkParityEvidenceRequirement[] = [
      this.parityRequirement({
        id: "artifact_contracts",
        category: "artifact_contract",
        met: allCoreArtifactsPresent,
        evidence: allCoreArtifactsPresent
          ? [`Core artifact contracts are present across ${facts.artifactKinds.length} artifact kind(s).`]
          : [],
        missingEvidence: allCoreArtifactsPresent ? [] : ["Complete story, graph, render, delivery, review, and cost-ledger artifact bundle."],
        notes: "CineJelly artifact contracts are the local foundation for Director-style scoring."
      }),
      this.parityRequirement({
        id: "local_media_probe",
        category: "visual_media",
        met: hasLocalVideoProbe,
        evidence: hasLocalVideoProbe
          ? [`FFprobe metadata exists for local video media; duration=${mediaEvidence?.durationSeconds ?? "unknown"}s.`]
          : [],
        missingEvidence: hasLocalVideoProbe ? [] : ["Local rendered media probe with video stream metadata."],
        notes: "Media metadata proves the benchmark inspected a real local deliverable, not only JSON artifacts."
      }),
      this.parityRequirement({
        id: "sampled_frame_signals",
        category: "visual_media",
        met: hasSampledFrames,
        evidence: hasSampledFrames
          ? [`Sampled-frame aggregate signals exist for ${mediaEvidence?.frameSampleCount ?? 0} frame(s).`]
          : [],
        missingEvidence: hasSampledFrames ? [] : ["Bounded sampled-frame RGB/brightness continuity signals."],
        notes: "Sampled-frame signals are structural proxies and do not replace semantic visual review."
      }),
      this.parityRequirement({
        id: "transition_boundary_signals",
        category: "visual_media",
        met: hasDetectedTransitionBoundaries,
        partial: transitionAnalyzerRan && !hasDetectedTransitionBoundaries,
        evidence: hasDetectedTransitionBoundaries
          ? [`Detected and analyzed ${mediaEvidence?.transitionSignals?.analyzedBoundaryCount ?? 0} transition boundary/boundaries.`]
          : transitionAnalyzerRan
            ? ["Scene-change analyzer ran, but the current media did not expose detected transition boundaries."]
            : [],
        missingEvidence: hasDetectedTransitionBoundaries
          ? []
          : ["Boundary-rich long-form media with detected scene transitions and reviewed pre/post evidence."],
        notes: "Director-style transition quality needs boundary evidence, not only evenly sampled frames."
      }),
      this.parityRequirement({
        id: "long_form_duration",
        category: "long_form",
        met: hasLongFormDuration,
        partial: facts.longFormValidationEvidence !== undefined && !hasAcceptedLongFormValidation,
        evidence: [
          ...(hasMeasuredLongFormDuration
            ? [`Measured final media duration is ${facts.mediaEvidence?.durationSeconds ?? facts.finalDurationSeconds}s within the 120-480s validation range.`]
            : []),
          ...(facts.longFormValidationEvidence
            ? [
                `Long-form validation status=${facts.longFormValidationEvidence.status}; reportStatus=${facts.longFormValidationEvidence.reportStatus}; finalDuration=${this.formatSeconds(facts.longFormValidationEvidence.finalDurationSeconds)}; ledgerEntries=${facts.longFormValidationEvidence.costLedgerEntryCount}; manualReviewBinding=${facts.longFormValidationEvidence.manualReviewArtifactBindingStatus ?? "missing"}.`
              ]
            : [])
        ],
        missingEvidence: hasLongFormDuration ? [] : ["Accepted long-form validation report or measured paid 2-8 minute render output with validated final duration."],
        notes: "Short smoke renders cannot prove long-form stability or pacing."
      }),
      this.parityRequirement({
        id: "semantic_visual_review",
        category: "semantic_review",
        met: hasAcceptedSemanticReview,
        partial: facts.semanticReviewEvidence !== undefined && !hasAcceptedSemanticReview,
        evidence: facts.semanticReviewEvidence
          ? [`Structured semantic review status=${facts.semanticReviewEvidence.status}; metricCount=${facts.semanticReviewEvidence.metricCount}.`]
          : [],
        missingEvidence: hasAcceptedSemanticReview
          ? []
          : ["Accepted artifact-bound structured semantic visual review covering script-video, transition, lighting, and text-video consistency."],
        notes: "VLM or manual semantic checkpoint evidence must be bound to the paid artifact before visual proxy scores become parity evidence."
      }),
      this.parityRequirement({
        id: "generated_audio_provider_evidence",
        category: "audio_media",
        met: hasGeneratedAudioProviderEvidence,
        partial: (facts.hasAudioEvidence === true || facts.generatedAudioProviderEvidence !== undefined) && !hasGeneratedAudioProviderEvidence,
        evidence: facts.generatedAudioProviderEvidence
          ? [
              `Generated-audio validation status=${facts.generatedAudioProviderEvidence.status}; reportStatus=${facts.generatedAudioProviderEvidence.reportStatus}; approvedTracks=${facts.generatedAudioProviderEvidence.approvedTrackCount}; ledgerEntries=${facts.generatedAudioProviderEvidence.providerLedgerEntryCount}; artifactEvidence=${facts.generatedAudioProviderEvidence.artifactEvidenceChecked ? "checked" : "missing"}/${facts.generatedAudioProviderEvidence.artifactEvidenceMatchesReport ? "matched" : "unmatched"}.`
            ]
          : facts.hasAudioEvidence === true
            ? ["Some audio evidence is present in the benchmark facts."]
            : [],
        missingEvidence: hasGeneratedAudioProviderEvidence
          ? []
          : ["Accepted generated-audio validation report with provider spend, Atlas billing, schema review, output batch approval, provider ledger, artifact SHA binding, and manual listening review."],
        notes: "Director-style audio scoring needs provider-backed generated-audio evidence bound to the reviewed media artifact, not only optional audio flags."
      }),
      this.parityRequirement({
        id: "structured_audio_review",
        category: "audio_media",
        met: hasAcceptedAudioReview,
        partial: facts.audioReviewEvidence !== undefined && !hasAcceptedAudioReview,
        evidence: facts.audioReviewEvidence
          ? [`Structured audio review status=${facts.audioReviewEvidence.status}; metricCount=${facts.audioReviewEvidence.metricCount}.`]
          : [],
        missingEvidence: hasAcceptedAudioReview
          ? []
          : ["Accepted artifact-bound structured audio review for narration, BGM, video-audio, and text-audio checkpoints."],
        notes: "Waveform and duration-sync proxies cannot evaluate narration meaning or BGM appropriateness by themselves; accepted review evidence must be bound to the paid artifact."
      }),
      this.parityRequirement({
        id: "asr_transcript_alignment",
        category: "runtime_parity",
        met: hasAsrReview,
        partial: facts.runtimeReviewEvidence !== undefined && !hasAsrReview,
        evidence: hasAsrReview ? ["Accepted runtime ASR transcript-alignment checkpoint evidence is present."] : [],
        missingEvidence: hasAsrReview ? [] : ["Accepted artifact-bound runtime ASR transcript alignment evidence for generated narration and script intent."],
        notes: "ASR alignment remains separate from generic audio review and waveform evidence."
      }),
      this.parityRequirement({
        id: "lip_sync_evidence",
        category: "runtime_parity",
        met: hasLipSyncProxy,
        partial: facts.runtimeReviewEvidence !== undefined && !hasLipSyncProxy,
        evidence: hasLipSyncProxy ? ["Accepted runtime lip-sync timing checkpoint evidence is present."] : [],
        missingEvidence: hasLipSyncProxy ? [] : ["Dedicated artifact-bound lip-sync or equivalent video-audio timing evidence."],
        notes: "The current CineJelly harness ingests dedicated lip-sync review evidence but does not run a lip-sync analyzer itself."
      }),
      this.parityRequirement({
        id: "manual_long_form_media_review",
        category: "semantic_review",
        met: hasAcceptedLongFormValidation || (hasAcceptedManualReview && hasLongFormDuration),
        partial: (hasAcceptedManualReview && !hasLongFormDuration) ||
          (facts.longFormValidationEvidence !== undefined && !hasAcceptedLongFormValidation),
        evidence: [
          ...(hasAcceptedManualReview ? ["Manual review text is present and accepted."] : []),
          ...(facts.longFormValidationEvidence
            ? [
                `Long-form validation manualReviewPassed=${facts.longFormValidationEvidence.manualQualityReviewPassed}; manualReviewBinding=${facts.longFormValidationEvidence.manualReviewArtifactBindingStatus ?? "missing"}; status=${facts.longFormValidationEvidence.status}.`
              ]
            : [])
        ],
        missingEvidence: hasAcceptedLongFormValidation || (hasAcceptedManualReview && hasLongFormDuration)
          ? []
          : ["Accepted manual review for the same paid 2-8 minute long-form media artifact or accepted long-form validation report with artifact-bound manual quality/redaction review."],
        notes: "Manual review only proves parity evidence when attached to the same long-form artifact under test."
      }),
      this.parityRequirement({
        id: "license_and_runtime_permission_review",
        category: "governance",
        met: hasAcceptedGovernanceReview,
        partial: facts.governanceReviewEvidence !== undefined && !hasAcceptedGovernanceReview,
        evidence: facts.governanceReviewEvidence
          ? [
              `Structured governance review status=${facts.governanceReviewEvidence.status}; acceptedChecks=${facts.governanceReviewEvidence.acceptedCheckCount}/${facts.governanceReviewEvidence.checkCount}.`
            ]
          : [],
        missingEvidence: hasAcceptedGovernanceReview
          ? []
          : [
              "Accepted legal/permission review covering DirectorBench license boundary, no upstream code reuse, evaluator independence, and evaluation-asset permissions."
            ],
        notes: "The snapshot has no top-level license, so CineJelly must keep this implementation independent unless permissions change; review acceptance must be bound to the artifact under evaluation."
      })
    ];

    const metCount = requirements.filter((item) => item.status === "met").length;
    const partialCount = requirements.filter((item) => item.status === "partial").length;
    const missingCount = requirements.filter((item) => item.status === "missing").length;
    const requiredForParity = requirements.filter((item) => item.requiredForDirectorBenchParity);
    return {
      requirementCount: requirements.length,
      metCount,
      partialCount,
      missingCount,
      requiredForParityCount: requiredForParity.length,
      requiredForParityMetCount: requiredForParity.filter((item) => item.status === "met").length,
      canClaimDirectorBenchParity: false,
      requirements
    };
  }

  private parityRequirement(input: {
    readonly id: string;
    readonly category: DirectorStyleBenchmarkParityEvidenceCategory;
    readonly met: boolean;
    readonly partial?: boolean;
    readonly evidence: readonly string[];
    readonly missingEvidence: readonly string[];
    readonly notes: string;
  }): DirectorStyleBenchmarkParityEvidenceRequirement {
    const status: DirectorStyleBenchmarkParityEvidenceStatus = input.met ? "met" : input.partial ? "partial" : "missing";
    return {
      id: input.id,
      category: input.category,
      status,
      requiredForDirectorBenchParity: true,
      evidence: input.evidence,
      missingEvidence: input.missingEvidence,
      notes: input.notes
    };
  }

  private evidenceScope(facts: DirectorStyleBenchmarkFacts): DirectorStyleBenchmarkEvidenceScope {
    const hasSemanticReview = facts.semanticReviewEvidence !== undefined && facts.semanticReviewEvidence.metricCount > 0;
    const hasAudioReview = facts.audioReviewEvidence !== undefined && facts.audioReviewEvidence.metricCount > 0;
    const hasRuntimeReview = facts.runtimeReviewEvidence !== undefined && facts.runtimeReviewEvidence.metricCount > 0;
    const hasAudioProxy =
      facts.mediaEvidence?.audio?.waveformSignals?.status === "analyzed" ||
      facts.mediaEvidence?.audio?.audioVideoSyncSignals?.status === "analyzed";
    const hasMediaEvidence =
      facts.mediaEvidence?.deliveryStatus !== undefined ||
      facts.mediaEvidence?.status === "probe_only" ||
      facts.mediaEvidence?.status === "frame_sampled";
    if (hasSemanticReview && hasAudioReview && hasRuntimeReview && hasMediaEvidence) {
      return "artifact_contract_plus_media_semantic_audio_runtime_review";
    }
    if (hasSemanticReview && hasAudioReview && hasRuntimeReview) {
      return "artifact_contract_plus_semantic_audio_runtime_review";
    }
    if (hasRuntimeReview && hasMediaEvidence) {
      return "artifact_contract_plus_media_runtime_review";
    }
    if (hasRuntimeReview) {
      return "artifact_contract_plus_runtime_review";
    }
    if (hasSemanticReview && hasAudioReview && hasMediaEvidence) {
      return "artifact_contract_plus_media_semantic_audio_review";
    }
    if (hasSemanticReview && hasAudioReview) {
      return "artifact_contract_plus_semantic_audio_review";
    }
    if (hasAudioReview && hasMediaEvidence) {
      return "artifact_contract_plus_media_audio_review";
    }
    if (hasSemanticReview && hasMediaEvidence) {
      if (hasAudioProxy) {
        return "artifact_contract_plus_media_semantic_audio_waveform";
      }
      return "artifact_contract_plus_media_semantic_review";
    }
    if (hasAudioReview) {
      return "artifact_contract_plus_audio_review";
    }
    if (hasAudioProxy && hasMediaEvidence) {
      return "artifact_contract_plus_media_audio_waveform";
    }
    if (hasSemanticReview) {
      return "artifact_contract_plus_semantic_review";
    }
    if (facts.mediaEvidence?.transitionSignals?.status === "analyzed") {
      return "artifact_contract_plus_media_boundaries";
    }
    if (facts.mediaEvidence?.status === "frame_sampled") {
      return "artifact_contract_plus_media_frames";
    }
    if (facts.mediaEvidence?.deliveryStatus !== undefined || facts.mediaEvidence?.status === "probe_only") {
      return "artifact_contract_plus_media_probe";
    }
    return "artifact_contract_only";
  }

  private mediaEvidence(kind: string, message: string): DirectorStyleBenchmarkEvidence {
    return {
      kind,
      severity: "info",
      message,
      source: "local_media_probe"
    };
  }

  private generatedAudioProviderEvidence(
    evidence: NonNullable<DirectorStyleBenchmarkFacts["generatedAudioProviderEvidence"]>
  ): DirectorStyleBenchmarkEvidence {
    return {
      kind: "generated_audio_provider_evidence",
      severity: evidence.status === "accepted" ? "info" : evidence.status === "needs_review" ? "warn" : "block",
      message:
        evidence.status === "accepted"
          ? `Generated-audio validation report is accepted; approvedTracks=${evidence.approvedTrackCount}, ledgerEntries=${evidence.providerLedgerEntryCount}, artifactEvidence=matched.`
          : `Generated-audio validation report is ${evidence.status}; reportStatus=${evidence.reportStatus}, approvedTracks=${evidence.approvedTrackCount}, ledgerEntries=${evidence.providerLedgerEntryCount}, artifactEvidence=${evidence.artifactEvidenceChecked ? "checked" : "missing"}/${evidence.artifactEvidenceMatchesReport ? "matched" : "unmatched"}.`,
      source: "generated_audio_validation_report"
    };
  }

  private longFormValidationEvidence(
    evidence: NonNullable<DirectorStyleBenchmarkFacts["longFormValidationEvidence"]>
  ): DirectorStyleBenchmarkEvidence {
    return {
      kind: "long_form_validation_evidence",
      severity: evidence.status === "accepted" ? "info" : evidence.status === "needs_review" ? "warn" : "block",
      message:
        evidence.status === "accepted"
          ? `Long-form validation report is accepted; finalDuration=${this.formatSeconds(evidence.finalDurationSeconds)}, ledgerEntries=${evidence.costLedgerEntryCount}, manualReviewBinding=${evidence.manualReviewArtifactBindingStatus ?? "missing"}.`
          : `Long-form validation report is ${evidence.status}; reportStatus=${evidence.reportStatus}, finalDuration=${this.formatSeconds(evidence.finalDurationSeconds)}, manualReview=${evidence.manualQualityReviewPassed}, manualReviewBinding=${evidence.manualReviewArtifactBindingStatus ?? "missing"}.`,
      source: "long_form_validation_report"
    };
  }

  private generatedAudioProviderScore(
    evidence: DirectorStyleBenchmarkFacts["generatedAudioProviderEvidence"]
  ): number | undefined {
    if (!evidence) {
      return undefined;
    }
    if (evidence.status === "accepted") {
      return 0.76;
    }
    return evidence.status === "needs_review" ? 0.58 : 0.42;
  }

  private generatedAudioProviderConfidence(
    evidence: DirectorStyleBenchmarkFacts["generatedAudioProviderEvidence"]
  ): number | undefined {
    if (!evidence) {
      return undefined;
    }
    if (evidence.status === "accepted") {
      return 0.62;
    }
    return evidence.status === "needs_review" ? 0.48 : 0.58;
  }

  private semanticReviewMetric(
    facts: DirectorStyleBenchmarkFacts,
    metricName: DirectorStyleBenchmarkSemanticReviewMetricName
  ): DirectorStyleBenchmarkSemanticReviewMetricEvidence | undefined {
    return facts.semanticReviewEvidence?.metrics.find((metric) => metric.metricName === metricName);
  }

  private audioReviewMetric(
    facts: DirectorStyleBenchmarkFacts,
    metricName: DirectorStyleBenchmarkAudioReviewMetricName
  ): DirectorStyleBenchmarkAudioReviewMetricEvidence | undefined {
    return facts.audioReviewEvidence?.metrics.find((metric) => metric.metricName === metricName);
  }

  private runtimeReviewMetric(
    facts: DirectorStyleBenchmarkFacts,
    metricName: DirectorStyleBenchmarkRuntimeReviewMetricName
  ): DirectorStyleBenchmarkRuntimeReviewMetricEvidence | undefined {
    return facts.runtimeReviewEvidence?.metrics.find((metric) => metric.metricName === metricName);
  }

  private hasAcceptedGovernanceReview(facts: DirectorStyleBenchmarkFacts): boolean {
    const evidence = facts.governanceReviewEvidence;
    if (evidence?.status !== "accepted" || !this.reviewArtifactBindingMatched(evidence)) {
      return false;
    }
    const requiredChecks: readonly DirectorStyleBenchmarkGovernanceReviewCheckName[] = [
      "directorbench_license_boundary",
      "upstream_code_reuse_boundary",
      "runtime_evaluator_independence",
      "evaluation_asset_permissions"
    ];
    return requiredChecks.every((checkName) =>
      evidence.checks.some((check) => check.checkName === checkName && check.status === "accepted")
    );
  }

  private reviewArtifactBindingMatched(
    evidence: Pick<NonNullable<DirectorStyleBenchmarkFacts["semanticReviewEvidence"]>, "artifactBindingStatus"> |
      Pick<NonNullable<DirectorStyleBenchmarkFacts["audioReviewEvidence"]>, "artifactBindingStatus"> |
      Pick<NonNullable<DirectorStyleBenchmarkFacts["runtimeReviewEvidence"]>, "artifactBindingStatus"> |
      Pick<NonNullable<DirectorStyleBenchmarkFacts["governanceReviewEvidence"]>, "artifactBindingStatus">
  ): boolean {
    return evidence.artifactBindingStatus === "matched";
  }

  private hasAcceptedGeneratedAudioProviderEvidence(facts: DirectorStyleBenchmarkFacts): boolean {
    const evidence = facts.generatedAudioProviderEvidence;
    return evidence?.status === "accepted" &&
      evidence.canUseAsBusinessReadinessGeneratedAudioEvidence === true &&
      evidence.providerNetworkCallsAllowed === true &&
      evidence.atlasBillingReady === true &&
      evidence.schemaReviewed === true &&
      evidence.executionStatus === "succeeded" &&
      evidence.outputBatchStatus === "approved" &&
      evidence.approvedTrackCount > 0 &&
      evidence.providerLedgerEntryCount > 0 &&
      evidence.manualReviewPassed === true &&
      evidence.artifactEvidenceChecked === true &&
      evidence.artifactEvidenceMatchesReport === true &&
      evidence.mediaSha256 !== undefined;
  }

  private hasAcceptedLongFormValidation(facts: DirectorStyleBenchmarkFacts): boolean {
    const evidence = facts.longFormValidationEvidence;
    return evidence?.status === "accepted" &&
      evidence.canUseAsBusinessReadinessLongFormEvidence === true &&
      evidence.providerSpendAllowed === true &&
      evidence.atlasBillingReady === true &&
      evidence.requestValidationStatus === "pass" &&
      evidence.chunkPlanStatus === "pass" &&
      evidence.paidRenderStatus === "completed" &&
      evidence.artifactValidationStatus === "pass" &&
      evidence.artifactEvidencePresent === true &&
      evidence.deliverablePresent === true &&
      evidence.costLedgerEntryCount > 0 &&
      evidence.manualQualityReviewPassed === true &&
      evidence.manualReviewArtifactBindingMatched === true &&
      evidence.manualReviewArtifactBindingStatus === "matched" &&
      evidence.finalDurationSeconds !== undefined &&
      evidence.finalDurationSeconds >= 120 &&
      evidence.finalDurationSeconds <= 480;
  }

  private hasMeasuredLongFormDuration(facts: DirectorStyleBenchmarkFacts): boolean {
    const durationSeconds = facts.mediaEvidence?.durationSeconds ?? (facts.longFormValidationEvidence ? undefined : facts.finalDurationSeconds);
    return durationSeconds !== undefined && durationSeconds >= 120 && durationSeconds <= 480;
  }

  private runtimeMetricForAudioMetric(
    facts: DirectorStyleBenchmarkFacts,
    metricName: DirectorStyleBenchmarkAudioReviewMetricName
  ): DirectorStyleBenchmarkRuntimeReviewMetricEvidence | undefined {
    if (metricName === "text_audio_consistency") {
      return this.runtimeReviewMetric(facts, "asr_transcript_alignment");
    }
    if (metricName === "video_audio_consistency") {
      return this.runtimeReviewMetric(facts, "lip_sync_timing");
    }
    return undefined;
  }

  private semanticEvidence(
    metric: DirectorStyleBenchmarkSemanticReviewMetricEvidence,
    message: string
  ): DirectorStyleBenchmarkEvidence {
    return {
      kind: "semantic_review_checkpoint",
      severity: metric.status === "accepted" ? "info" : metric.status === "needs_review" ? "warn" : "block",
      message,
      source: `${metric.reviewerType}_semantic_review`
    };
  }

  private audioEvidence(
    metric: DirectorStyleBenchmarkAudioReviewMetricEvidence,
    message: string
  ): DirectorStyleBenchmarkEvidence {
    return {
      kind: "audio_review_checkpoint",
      severity: metric.status === "accepted" ? "info" : metric.status === "needs_review" ? "warn" : "block",
      message,
      source: `${metric.reviewerType}_audio_review`
    };
  }

  private runtimeEvidence(
    metric: DirectorStyleBenchmarkRuntimeReviewMetricEvidence,
    message: string
  ): DirectorStyleBenchmarkEvidence {
    return {
      kind: "runtime_review_checkpoint",
      severity: metric.status === "accepted" ? "info" : metric.status === "needs_review" ? "warn" : "block",
      message,
      source: `${metric.reviewerType}_runtime_review`
    };
  }

  private audioWaveformMetric(facts: DirectorStyleBenchmarkFacts):
    | { readonly score: number; readonly confidence: number; readonly signals: DirectorStyleBenchmarkAudioWaveformSignals }
    | undefined {
    const signals = facts.mediaEvidence?.audio?.waveformSignals;
    if (!signals || signals.status !== "analyzed") {
      return undefined;
    }
    const signalPresenceScore = signals.signalPresenceScore ?? 0.56;
    return {
      score: this.round(Math.max(0.56, Math.min(0.68, 0.52 + signalPresenceScore * 0.2))),
      confidence: signals.signalPresenceScore !== undefined ? 0.52 : 0.48,
      signals
    };
  }

  private audioVideoSyncMetric(facts: DirectorStyleBenchmarkFacts):
    | { readonly score: number; readonly confidence: number; readonly signals: DirectorStyleBenchmarkAudioVideoSyncSignals }
    | undefined {
    const signals = facts.mediaEvidence?.audio?.audioVideoSyncSignals;
    if (!signals || signals.status !== "analyzed") {
      return undefined;
    }
    const alignmentScore = signals.durationAlignmentScore ?? 0.56;
    return {
      score: this.round(Math.max(0.54, Math.min(0.72, 0.5 + alignmentScore * 0.22))),
      confidence: signals.durationAlignmentScore !== undefined ? 0.54 : 0.48,
      signals
    };
  }

  private audioProxyMetric(
    metricName: DirectorStyleBenchmarkAudioReviewMetricName,
    waveformMetric:
      | { readonly score: number; readonly confidence: number; readonly signals: DirectorStyleBenchmarkAudioWaveformSignals }
      | undefined,
    syncMetric:
      | { readonly score: number; readonly confidence: number; readonly signals: DirectorStyleBenchmarkAudioVideoSyncSignals }
      | undefined
  ):
    | { readonly score: number; readonly confidence: number; readonly evidence: readonly DirectorStyleBenchmarkEvidence[] }
    | undefined {
    const evidence = [
      ...(waveformMetric ? [this.audioWaveformEvidence(waveformMetric.signals)] : []),
      ...(syncMetric && (metricName === "video_audio_consistency" || metricName === "text_audio_consistency")
        ? [this.audioVideoSyncEvidence(syncMetric.signals)]
        : [])
    ];
    if (evidence.length === 0) {
      return undefined;
    }
    if (metricName === "video_audio_consistency" && syncMetric) {
      const score = waveformMetric
        ? waveformMetric.score * 0.4 + syncMetric.score * 0.6
        : syncMetric.score;
      const confidence = waveformMetric
        ? (waveformMetric.confidence + syncMetric.confidence) / 2
        : syncMetric.confidence;
      return { score: this.round(score), confidence: this.round(confidence), evidence };
    }
    if (metricName === "text_audio_consistency" && syncMetric) {
      const score = waveformMetric
        ? Math.min(0.66, waveformMetric.score * 0.55 + syncMetric.score * 0.45)
        : Math.min(0.62, syncMetric.score);
      return { score: this.round(score), confidence: 0.5, evidence };
    }
    if (waveformMetric) {
      return {
        score: waveformMetric.score,
        confidence: waveformMetric.confidence,
        evidence
      };
    }
    return undefined;
  }

  private audioWaveformEvidence(signals: DirectorStyleBenchmarkAudioWaveformSignals): DirectorStyleBenchmarkEvidence {
    const mean = signals.meanVolumeDb !== undefined ? `${signals.meanVolumeDb}dB` : "unknown";
    const peak = signals.maxVolumeDb !== undefined ? `${signals.maxVolumeDb}dB` : "unknown";
    const score = signals.signalPresenceScore !== undefined ? signals.signalPresenceScore : "unknown";
    return this.mediaEvidence(
      "audio_waveform_signal",
      `FFmpeg volumedetect analyzed ${signals.analyzedDurationSeconds ?? "bounded"}s of local media audio; mean=${mean}, peak=${peak}, signalPresenceScore=${score}.`
    );
  }

  private audioVideoSyncEvidence(signals: DirectorStyleBenchmarkAudioVideoSyncSignals): DirectorStyleBenchmarkEvidence {
    const delta = signals.durationDeltaSeconds !== undefined ? `${signals.durationDeltaSeconds}s` : "unknown";
    const score = signals.durationAlignmentScore !== undefined ? signals.durationAlignmentScore : "unknown";
    return this.mediaEvidence(
      "audio_video_sync_signal",
      `FFprobe duration proxy compared local video/audio streams; delta=${delta}, durationAlignmentScore=${score}.`
    );
  }

  private metricStatusFor(
    score: number | undefined,
    confidence: number | undefined,
    minPassingScore: number,
    minConfidence: number,
    skipped: boolean
  ): DirectorStyleBenchmarkMetricStatus {
    if (skipped) {
      return "skipped";
    }
    if (score === undefined || confidence === undefined || score < 0.4) {
      return "fail";
    }
    if (score < minPassingScore || confidence < minConfidence) {
      return "warn";
    }
    return "pass";
  }

  private bottleneckSeverity(metric: DirectorStyleBenchmarkMetricResult): DirectorStyleBenchmarkSeverity {
    if ((metric.score ?? 1) < 0.4 || metric.status === "fail") {
      return "block";
    }
    return "warn";
  }

  private weightedAverage(items: readonly { readonly value: number; readonly weight: number }[]): number | undefined {
    const valid = items.filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
    if (valid.length === 0) {
      return undefined;
    }
    const weight = valid.reduce((sum, item) => sum + item.weight, 0);
    return valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
  }

  private grade(score: number | undefined): "A" | "B" | "C" | "D" | "F" | "N/A" {
    if (score === undefined) {
      return "N/A";
    }
    if (score >= 0.85) {
      return "A";
    }
    if (score >= 0.7) {
      return "B";
    }
    if (score >= 0.55) {
      return "C";
    }
    if (score >= 0.4) {
      return "D";
    }
    return "F";
  }

  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private formatSeconds(value: number | undefined): string {
    return value === undefined ? "missing" : `${value}s`;
  }
}
