import type {
  DirectorStyleBenchmarkBottleneck,
  DirectorStyleBenchmarkDimension,
  DirectorStyleBenchmarkDimensionScore,
  DirectorStyleBenchmarkEvidence,
  DirectorStyleBenchmarkEvidenceScope,
  DirectorStyleBenchmarkFacts,
  DirectorStyleBenchmarkMetricResult,
  DirectorStyleBenchmarkMetricStatus,
  DirectorStyleBenchmarkProfile,
  DirectorStyleBenchmarkReport,
  DirectorStyleBenchmarkSeverity,
  DirectorStyleBenchmarkStatus
} from "../types/director-style-benchmark.js";

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
    const mediaPath = input.mediaPath ?? input.facts.mediaEvidence?.mediaPath;
    const frameSamplingIntervalSeconds =
      input.frameSamplingIntervalSeconds ?? input.facts.mediaEvidence?.frameSamplingIntervalSeconds;

    return {
      schemaVersion: "cinejelly.director-style-benchmark.v1",
      generatedAt: new Date().toISOString(),
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: ["jiaminchen-1031/DirectorBench", "vericontext/vibeframe", ...input.facts.sourcePatternOrigins]
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
      releaseGateSummary: {
        benchmarkHarnessPass: status === "pass",
        canUseAsBackendBenchmarkEvidence: status !== "blocked",
        canClaimDirectorBenchParity: false,
        canReleaseToCustomerTraffic: false,
        releaseBlocker:
          status === "blocked"
            ? "Benchmark evidence is blocked by missing core artifact or render completion evidence."
            : evidenceScope === "artifact_contract_only"
              ? "Director-style benchmark evidence is artifact-contract-only; customer release still requires real long-form paid output, frame/audio review, production deployment evidence, and manual approval."
              : "Director-style benchmark includes local media probe/frame-signal evidence, but customer release still requires long-form paid output, semantic visual/audio review, production deployment evidence, and manual approval."
      },
      nextActions: this.nextActions(input.facts, metrics, bottlenecks)
    };
  }

  private metricsFor(facts: DirectorStyleBenchmarkFacts): readonly DirectorStyleBenchmarkMetricResult[] {
    const visualSignals = facts.mediaEvidence?.visualSignals;
    const hasFrameSignals = facts.mediaEvidence?.status === "frame_sampled" && (visualSignals?.sampleCount ?? 0) >= 2;
    const hasMediaProbe = facts.mediaEvidence?.deliveryStatus !== undefined;
    const mediaProxyLimitations = [
      "Sampled-frame color and brightness signals are structural proxies; VLM/ASR/lip-sync and shot-boundary review are still required for full DirectorBench-style parity."
    ];
    const frameSignalEvidence = hasFrameSignals
      ? [
          this.mediaEvidence(
            "media_frame_signal",
            `Sampled ${visualSignals?.sampleCount ?? 0} frame signal(s) from local rendered media; frame paths are redacted from this report.`
          )
        ]
      : [];
    const probedMediaEvidence = hasMediaProbe
      ? [
          this.mediaEvidence(
            "media_probe",
            `FFprobe delivery status is ${facts.mediaEvidence?.deliveryStatus}; duration=${facts.mediaEvidence?.durationSeconds ?? "unknown"}s, audio=${facts.mediaEvidence?.audio?.hasAudio === true ? "present" : "absent"}.`
          )
        ]
      : [];
    const scriptVideoFidelityScore = hasFrameSignals && facts.manualReviewAccepted ? 0.74 : 0.68;
    const scriptVideoFidelityConfidence = hasFrameSignals && facts.manualReviewAccepted ? 0.6 : 0.46;
    const temporalCoherenceScore = hasFrameSignals && visualSignals?.temporalContinuityScore !== undefined
      ? Math.max(0.7, Math.min(0.84, 0.58 + visualSignals.temporalContinuityScore * 0.26))
      : 0.78;
    const temporalCoherenceConfidence = hasFrameSignals ? 0.68 : 0.64;
    const transitionQualityScore = hasFrameSignals && visualSignals?.transitionContinuityScore !== undefined
      ? Math.max(0.56, Math.min(0.72, 0.48 + visualSignals.transitionContinuityScore * 0.24))
      : facts.finalDurationSeconds && facts.finalDurationSeconds >= 60 ? 0.68 : 0.56;
    const transitionQualityConfidence = hasFrameSignals ? 0.56 : facts.finalDurationSeconds && facts.finalDurationSeconds >= 60 ? 0.48 : 0.34;
    const lightingConsistencyScore = hasFrameSignals && visualSignals?.lightingConsistencyScore !== undefined
      ? Math.max(0.56, Math.min(0.76, 0.48 + visualSignals.lightingConsistencyScore * 0.28))
      : 0.56;
    const lightingConsistencyConfidence = hasFrameSignals ? 0.62 : 0.34;
    const generationStabilityConfidence = facts.finalDurationSeconds && facts.finalDurationSeconds >= 120
      ? 0.7
      : hasMediaProbe
        ? 0.56
        : 0.52;
    const textVideoConsistencyScore = hasFrameSignals && facts.manualReviewAccepted ? 0.69 : 0.66;
    const textVideoConsistencyConfidence = hasFrameSignals && facts.manualReviewAccepted ? 0.55 : 0.45;

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
        passMessage: hasFrameSignals
          ? "Storyboard/rendered-shot evidence is reinforced by sampled-frame media signals and accepted manual review."
          : "Storyboard and rendered-shot evidence can be cross-counted, but no visual frame analysis is run.",
        failMessage: "Storyboard or rendered-shot evidence is missing.",
        suggestion: "Add real VLM or shot-level manual fidelity review before claiming script-video fidelity.",
        extraEvidence: frameSignalEvidence,
        ...(hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "user_demand_fulfillment",
        upstreamMetric: "user_demand_fulfillment",
        requiredKinds: [ARTIFACT_KINDS.deliverable, ARTIFACT_KINDS.reviewPacket],
        score: facts.artifactValidationStatus === "pass" ? 0.82 : 0.58,
        confidence: 0.66,
        passMessage: "Deliverable and review-packet evidence exist, with artifact validation status considered.",
        failMessage: "Deliverable or review-packet evidence is missing.",
        suggestion: "Keep artifact validation pass evidence with every benchmarked deliverable."
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "temporal_coherence",
        upstreamMetric: "temporal_coherence",
        requiredKinds: [ARTIFACT_KINDS.stageLifecycle, ARTIFACT_KINDS.renderedShots, ARTIFACT_KINDS.productionGraph],
        score: temporalCoherenceScore,
        confidence: temporalCoherenceConfidence,
        passMessage: hasFrameSignals
          ? "Stage lifecycle evidence is reinforced by sampled-frame continuity signals from the rendered media."
          : "Stage lifecycle, production graph, and rendered-shot artifacts preserve ordered temporal evidence.",
        failMessage: "Temporal planning or rendered-shot evidence is missing.",
        suggestion: "Keep stage lifecycle and production graph evidence synchronized with rendered shots.",
        extraEvidence: frameSignalEvidence,
        ...(hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "transition_quality",
        upstreamMetric: "transition_quality",
        requiredKinds: [ARTIFACT_KINDS.deliverable, ARTIFACT_KINDS.stageLifecycle],
        score: transitionQualityScore,
        confidence: transitionQualityConfidence,
        passMessage: hasFrameSignals
          ? "Deliverable/lifecycle evidence is reinforced by sampled-frame color-continuity signals."
          : "Deliverable and lifecycle evidence exist, but transition quality is not frame-boundary analyzed.",
        failMessage: "Deliverable or lifecycle evidence is missing.",
        suggestion: "Add true shot-boundary transition checks or manual transition review for long-form outputs.",
        extraEvidence: frameSignalEvidence,
        ...(hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.metric({
        facts,
        dimension: "video",
        metricName: "lighting_consistency",
        upstreamMetric: "lighting_consistency",
        requiredKinds: [ARTIFACT_KINDS.reviewPacket, ARTIFACT_KINDS.renderedShots],
        score: lightingConsistencyScore,
        confidence: lightingConsistencyConfidence,
        passMessage: hasFrameSignals
          ? "Rendered-shot and review evidence is reinforced by sampled-frame brightness consistency signals."
          : "Rendered-shot and review evidence exist, but lighting is not visually inspected by this no-spend harness.",
        failMessage: "Rendered-shot or review evidence is missing.",
        suggestion: "Use semantic visual inspection or manual review to raise lighting-confidence evidence.",
        extraEvidence: frameSignalEvidence,
        ...(hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
      }),
      this.audioMetric(facts, "narration_reasonableness", "narration_reasonableness"),
      this.audioMetric(facts, "bgm_consistency", "bgm_consistency"),
      this.metric({
        facts,
        dimension: "stability",
        metricName: "generation_stability",
        upstreamMetric: "generation_stability",
        requiredKinds: [ARTIFACT_KINDS.costLedger, ARTIFACT_KINDS.deliverable],
        score: facts.renderStatus === "completed" && facts.artifactValidationStatus === "pass" ? 0.82 : 0.52,
        confidence: generationStabilityConfidence,
        passMessage: hasMediaProbe
          ? "Render completion, cost ledger, deliverable validation, and local media probe evidence exist."
          : "Render completion, cost ledger, and deliverable validation evidence exist.",
        failMessage: "Render completion, cost ledger, or deliverable evidence is incomplete.",
        suggestion: "Run this benchmark on a real 2-8 minute paid output to prove long-form stability.",
        extraEvidence: probedMediaEvidence,
        ...(facts.finalDurationSeconds && facts.finalDurationSeconds >= 120
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
        passMessage: hasFrameSignals
          ? "Compiled prompt/rendered-shot/review evidence is reinforced by sampled-frame media signals, but semantic matching is still limited."
          : "Compiled prompt, rendered-shot, and review evidence exist, but semantic frame matching is not run.",
        failMessage: "Prompt, rendered-shot, or review evidence is missing.",
        suggestion: "Add VLM or shot-level manual review evidence before claiming text-video semantic alignment.",
        extraEvidence: frameSignalEvidence,
        ...(hasFrameSignals ? { limitations: mediaProxyLimitations } : {})
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
    metricName: string,
    upstreamMetric: string,
    dimension: DirectorStyleBenchmarkDimension = "audio"
  ): DirectorStyleBenchmarkMetricResult {
    if (!facts.hasAudioEvidence) {
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
      score: facts.manualReviewAccepted ? 0.78 : 0.62,
      confidence: facts.manualReviewAccepted ? 0.64 : 0.46,
      passMessage: "Audio/postproduction evidence exists and manual review status is reflected.",
      failMessage: "Audio/postproduction review evidence is incomplete.",
      suggestion: "Capture provider-backed generated-audio output validation and manual listening review."
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
    if (!facts.finalDurationSeconds || facts.finalDurationSeconds < 120) {
      actions.add("Run the benchmark against a paid 2-8 minute long-form output before using it as long-form production evidence.");
    }
    if (!facts.hasAudioEvidence) {
      actions.add("Add generated-audio provider output validation and manual listening review to score audio and audio cross-modal metrics.");
    }
    if (!facts.mediaEvidence || facts.mediaEvidence.status === "unavailable") {
      actions.add("Provide a local rendered media file to add media probe and sampled-frame evidence to the Director-style benchmark.");
    } else if (facts.mediaEvidence.status !== "frame_sampled") {
      actions.add("Enable successful sampled-frame extraction so transition, lighting, and temporal continuity evidence can move beyond metadata-only checks.");
    }
    if (metrics.some((metric) => metric.limitations.length > 0)) {
      actions.add("Add true shot-boundary, semantic visual, ASR/lip-sync, or manual media review evidence for metrics still limited to structural proxies.");
    }
    if (bottlenecks.length > 0) {
      actions.add("Review benchmark bottlenecks and feed them into the repair/manual-review checklist before commercial release.");
    }
    actions.add("Keep this report as backend quality evidence only; do not treat it as UI readiness or customer-traffic approval.");
    return [...actions];
  }

  private evidenceScope(facts: DirectorStyleBenchmarkFacts): DirectorStyleBenchmarkEvidenceScope {
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
}
