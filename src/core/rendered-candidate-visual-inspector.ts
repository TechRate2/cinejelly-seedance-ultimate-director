/**
 * Per-candidate visual curation.
 *
 * Samples frames from each rendered candidate clip and asks the semantic visual inspector
 * (multimodal LLM) to judge identity drift, product distortion, artifacts, and composition
 * BEFORE candidate selection. The resulting Guardian report merges into the deterministic
 * render inspection so `selectBestCandidate()` prefers visually clean takes and the repair
 * loop re-renders visually bad shots — the missing "curate by looking at the picture" loop
 * that separates raw provider output from commercial-grade curation.
 *
 * Fail-safe by design: any infrastructure failure (unreadable clip URL, missing ffmpeg,
 * inspector error) degrades to a `warn` finding instead of blocking the render pipeline.
 */

import { join } from "node:path";
import type { GuardianFinding, GuardianReport, GuardianStatus } from "../types/guardian.js";
import type { CompiledPrompt, ShotContract } from "../types/prompt.js";
import type { Prediction } from "../types/provider.js";
import type {
  SemanticVisualFinding,
  SemanticVisualInspectionOptions,
  SemanticVisualInspectionReport
} from "../types/visual-inspection.js";
import type { FrameSample, FrameSamplingOptions } from "../types/media.js";
import { isImageOutputUrl } from "./endpoint-frame-chain.js";

const DEFAULT_FRAME_INTERVAL_SECONDS = 2;
const DEFAULT_MAX_FRAMES_PER_CANDIDATE = 3;

const STATUS_ORDER: Record<GuardianStatus, number> = {
  pass: 0,
  warn: 1,
  repair: 2,
  rerender: 3,
  block: 4
};

/** Runtime configuration threaded from the render request into per-candidate curation. */
export interface CandidateVisualCuration {
  readonly options: SemanticVisualInspectionOptions;
  readonly workDirectory: string;
  readonly frameIntervalSeconds?: number;
  readonly maxFramesPerCandidate?: number;
}

interface FrameSamplerLike {
  sampleFrames(path: string, options: FrameSamplingOptions, signal?: AbortSignal): Promise<readonly FrameSample[]>;
}

interface MediaProberLike {
  probe(path: string, signal?: AbortSignal): Promise<{ readonly durationSeconds?: number }>;
}

/** Rendered clips shorter than this fraction of the requested duration trigger a re-render. */
const DURATION_SHORTFALL_RERENDER_RATIO = 0.12;
/** Rendered clips shorter than this fraction of the requested duration raise a warning. */
const DURATION_SHORTFALL_WARN_RATIO = 0.05;

interface SemanticInspectorLike {
  inspect(
    frames: readonly FrameSample[],
    options: SemanticVisualInspectionOptions,
    signal?: AbortSignal
  ): Promise<SemanticVisualInspectionReport>;
}

export class RenderedCandidateVisualInspector {
  private readonly mediaInspector: FrameSamplerLike;
  private readonly semanticVisualInspector: SemanticInspectorLike;
  private readonly mediaProber: MediaProberLike | undefined;

  public constructor(input: {
    readonly mediaInspector: FrameSamplerLike;
    readonly semanticVisualInspector: SemanticInspectorLike;
    readonly mediaProber?: MediaProberLike;
  }) {
    this.mediaInspector = input.mediaInspector;
    this.semanticVisualInspector = input.semanticVisualInspector;
    this.mediaProber = input.mediaProber;
  }

  public async inspectCandidate(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly prediction: Prediction;
    readonly candidateIndex: number;
    readonly repairAttempt?: number;
    readonly curation: CandidateVisualCuration;
    readonly signal?: AbortSignal;
  }): Promise<GuardianReport> {
    const videoUrl = this.selectVideoOutputUrl(input.prediction);
    if (!videoUrl) {
      return this.toReport(input.shot.shotId, [
        this.infraFinding(
          "visual_no_video_output",
          "Candidate prediction returned no video output URL to sample for visual curation.",
          "Verify provider output URLs before relying on visual curation for this candidate."
        )
      ]);
    }

    const durationFinding = await this.durationShortfallFinding(videoUrl, input.compiledPrompt, input.signal);
    const durationFindings = durationFinding ? [durationFinding] : [];

    try {
      const outputDirectory = join(
        input.curation.workDirectory,
        "candidate-frames",
        input.shot.shotId,
        `candidate-${input.candidateIndex}${input.repairAttempt !== undefined ? `-repair-${input.repairAttempt}` : ""}`
      );
      const frames = await this.mediaInspector.sampleFrames(
        videoUrl,
        {
          enabled: true,
          outputDirectory,
          intervalSeconds: input.curation.frameIntervalSeconds ?? DEFAULT_FRAME_INTERVAL_SECONDS,
          maxFrames: input.curation.maxFramesPerCandidate ?? DEFAULT_MAX_FRAMES_PER_CANDIDATE
        },
        input.signal
      );
      const semanticReport = await this.semanticVisualInspector.inspect(
        frames,
        {
          ...input.curation.options,
          expectations: this.expectationsFor(input.compiledPrompt, input.curation.options)
        },
        input.signal
      );
      return this.toReport(input.shot.shotId, [...durationFindings, ...this.toGuardianFindings(semanticReport)]);
    } catch (error: unknown) {
      if (input.signal?.aborted) {
        throw error;
      }
      return this.toReport(input.shot.shotId, [
        ...durationFindings,
        this.infraFinding(
          "visual_curation_unavailable",
          `Visual curation could not run for this candidate: ${error instanceof Error ? error.message : "unknown error"}.`,
          "Check ffmpeg availability, work directory, and provider output URL readability; deterministic inspection still applies."
        )
      ]);
    }
  }

  /**
   * Measure the rendered clip's real duration against the requested duration. A short clip
   * is the root cause of "video thiếu thời lượng": it silently shrinks the assembled total,
   * so a meaningful shortfall becomes a rerender-grade finding for the repair loop.
   * Fail-safe: probe errors or a missing prober produce no finding.
   */
  private async durationShortfallFinding(
    videoUrl: string,
    compiledPrompt: CompiledPrompt,
    signal?: AbortSignal
  ): Promise<GuardianFinding | undefined> {
    if (!this.mediaProber) {
      return undefined;
    }
    const requestedSeconds = compiledPrompt.videoRequest.settings.durationSeconds;
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      return undefined;
    }
    let actualSeconds: number | undefined;
    try {
      const metadata = await this.mediaProber.probe(videoUrl, signal);
      actualSeconds = metadata.durationSeconds;
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw error;
      }
      return undefined;
    }
    if (actualSeconds === undefined || !Number.isFinite(actualSeconds) || actualSeconds <= 0) {
      return undefined;
    }
    const shortfallRatio = (requestedSeconds - actualSeconds) / requestedSeconds;
    if (shortfallRatio <= DURATION_SHORTFALL_WARN_RATIO) {
      return undefined;
    }
    const severe = shortfallRatio > DURATION_SHORTFALL_RERENDER_RATIO;
    return {
      stage: "render",
      status: severe ? "rerender" : "warn",
      severity: severe ? "S1" : "S3",
      checkpoint: "visual_duration_shortfall",
      evidence: `Rendered clip covers ${actualSeconds.toFixed(2)}s of the requested ${requestedSeconds}s (${Math.round(shortfallRatio * 100)}% short).`,
      repair: `Re-render this shot to fill the full ${requestedSeconds}s runtime; keep the action continuous to the final second and do not end early.`,
      repairScope: severe ? "render" : "none"
    };
  }

  private expectationsFor(
    compiledPrompt: CompiledPrompt,
    options: SemanticVisualInspectionOptions
  ): readonly string[] {
    const expectations = new Set<string>([
      ...options.expectations,
      ...compiledPrompt.inspectionExpectations
    ]);
    return [...expectations];
  }

  private selectVideoOutputUrl(prediction: Prediction): string | undefined {
    return prediction.outputUrls.find((url) => !isImageOutputUrl(url)) ?? undefined;
  }

  private toGuardianFindings(report: SemanticVisualInspectionReport): readonly GuardianFinding[] {
    if (report.findings.length === 0 && report.status !== "pass") {
      return [
        this.infraFinding(
          "visual_review_incomplete",
          `Semantic visual review returned status ${report.status} without findings.`,
          "Treat as reviewable warning; rerun visual curation if this repeats."
        )
      ];
    }
    return report.findings.map((finding) => this.toGuardianFinding(finding));
  }

  private toGuardianFinding(finding: SemanticVisualFinding): GuardianFinding {
    return {
      stage: "render",
      status: this.statusForSeverity(finding.severity),
      severity: finding.severity,
      checkpoint: `visual_${finding.checkpoint.trim().replace(/\s+/g, "_").toLowerCase()}`,
      evidence: finding.evidence,
      repair: finding.recommendation,
      repairScope: "render"
    };
  }

  private statusForSeverity(severity: SemanticVisualFinding["severity"]): GuardianStatus {
    switch (severity) {
      case "S0":
      case "S1":
        return "rerender";
      case "S2":
        return "repair";
      case "S3":
        return "warn";
    }
  }

  private infraFinding(checkpoint: string, evidence: string, repair: string): GuardianFinding {
    return {
      stage: "render",
      status: "warn",
      severity: "S3",
      checkpoint,
      evidence,
      repair,
      repairScope: "none"
    };
  }

  private toReport(shotId: string, findings: readonly GuardianFinding[]): GuardianReport {
    const status = findings.reduce<GuardianStatus>(
      (worst, finding) => (STATUS_ORDER[finding.status] > STATUS_ORDER[worst] ? finding.status : worst),
      "pass"
    );
    return {
      nodeId: shotId,
      stage: "render",
      status,
      findings,
      repairScope: status === "pass" || status === "warn" ? "none" : "render",
      affectedNodeIds: [shotId],
      sourceCheckpoints: [],
      recommendedNextStep:
        status === "pass"
          ? "Visual curation passed; candidate is eligible for selection."
          : status === "warn"
            ? "Visual curation raised warnings; candidate remains selectable but review is recommended."
            : "Re-render this candidate with the visual repair directives before selection."
    };
  }
}

/**
 * Merge a deterministic Guardian report with a visual curation report for the same node.
 * The worst status wins, findings concatenate, and repair guidance follows the worse report
 * so the existing candidate comparator and repair loop become visual-quality-aware without
 * any changes to their logic.
 */
export function mergeGuardianReports(base: GuardianReport, extra: GuardianReport): GuardianReport {
  const worse = STATUS_ORDER[extra.status] > STATUS_ORDER[base.status] ? extra : base;
  // On equal status, do not let a "none" repair scope on the deterministic base mask a
  // concrete scope/next-step carried by the visual report.
  const tied = STATUS_ORDER[extra.status] === STATUS_ORDER[base.status];
  const scopeSource = tied && worse.repairScope === "none" && extra.repairScope !== "none" ? extra : worse;
  const affectedNodeIds = [...new Set([...base.affectedNodeIds, ...extra.affectedNodeIds])];
  return {
    nodeId: base.nodeId,
    stage: base.stage,
    status: worse.status,
    findings: [...base.findings, ...extra.findings],
    repairScope: scopeSource.repairScope,
    affectedNodeIds,
    sourceCheckpoints: [...base.sourceCheckpoints, ...extra.sourceCheckpoints],
    recommendedNextStep: scopeSource.recommendedNextStep
  };
}
