/**
 * Director Agent orchestrates the first runnable render-level pipeline:
 * input -> story plan -> shot planning -> prompt compile -> preflight -> Seedance render -> render inspection.
 */

import { candidateCountForQuality, resolveSeedanceModelId } from "../config/seedance-settings.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { ConsistencyGuardian } from "../core/consistency-guardian.js";
import { ContinuityLedgerBuilder } from "../core/continuity-ledger-builder.js";
import { ProductionGraphBuilder } from "../core/production-graph-builder.js";
import { ProductionGraphRunRecorder } from "../core/production-graph-run-recorder.js";
import { RenderCostGate } from "../core/render-cost-gate.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { ShotPlanner } from "../core/shot-planner.js";
import type { AtlasCloudRuntimeSettings } from "../types/settings.js";
import type { CineJellyProjectRequest, DirectorRunResult, RenderCandidate, RenderedShot } from "../types/agent.js";
import type { GuardianReport, GuardianSeverity, GuardianStatus } from "../types/guardian.js";
import type { CompiledPrompt, ShotContract } from "../types/prompt.js";
import type { Prediction } from "../types/provider.js";
import { asProviderError } from "../utils/errors.js";
import { createStableId } from "../utils/ids.js";
import { redactUnknown } from "../utils/redaction.js";
import { SeedancePromptCompiler } from "../prompt_compiler/prompt-compiler.js";
import { IntakeDirector } from "./intake-director.js";
import { RenderProducer } from "./render-producer.js";
import { StoryArchitect } from "./story-architect.js";

export class DirectorAgent {
  private readonly intakeDirector: IntakeDirector;
  private readonly storyArchitect: StoryArchitect;
  private readonly shotPlanner: ShotPlanner;
  private readonly continuityLedgerBuilder: ContinuityLedgerBuilder;
  private readonly productionGraphBuilder: ProductionGraphBuilder;
  private readonly productionGraphRunRecorder: ProductionGraphRunRecorder;
  private readonly renderCostGate: RenderCostGate;
  private readonly promptCompiler: SeedancePromptCompiler;
  private readonly consistencyGuardian: ConsistencyGuardian;
  private readonly renderProducer: RenderProducer;
  private readonly assemblyEngine: AssemblyEngine;
  private readonly semanticVisualInspector: SemanticVisualInspector | undefined;
  private readonly atlasSettings: AtlasCloudRuntimeSettings;

  public constructor(input: {
    readonly storyArchitect: StoryArchitect;
    readonly renderProducer: RenderProducer;
    readonly atlasSettings: AtlasCloudRuntimeSettings;
    readonly intakeDirector?: IntakeDirector;
    readonly shotPlanner?: ShotPlanner;
    readonly continuityLedgerBuilder?: ContinuityLedgerBuilder;
    readonly productionGraphBuilder?: ProductionGraphBuilder;
    readonly productionGraphRunRecorder?: ProductionGraphRunRecorder;
    readonly renderCostGate?: RenderCostGate;
    readonly promptCompiler?: SeedancePromptCompiler;
    readonly consistencyGuardian?: ConsistencyGuardian;
    readonly assemblyEngine?: AssemblyEngine;
    readonly semanticVisualInspector?: SemanticVisualInspector;
  }) {
    this.intakeDirector = input.intakeDirector ?? new IntakeDirector();
    this.storyArchitect = input.storyArchitect;
    this.shotPlanner = input.shotPlanner ?? new ShotPlanner();
    this.continuityLedgerBuilder = input.continuityLedgerBuilder ?? new ContinuityLedgerBuilder();
    this.productionGraphBuilder = input.productionGraphBuilder ?? new ProductionGraphBuilder();
    this.productionGraphRunRecorder = input.productionGraphRunRecorder ?? new ProductionGraphRunRecorder();
    this.renderCostGate = input.renderCostGate ?? new RenderCostGate({ costBufferMultiplier: 1 });
    this.promptCompiler = input.promptCompiler ?? new SeedancePromptCompiler();
    this.consistencyGuardian = input.consistencyGuardian ?? new ConsistencyGuardian();
    this.renderProducer = input.renderProducer;
    this.assemblyEngine = input.assemblyEngine ?? new AssemblyEngine();
    this.semanticVisualInspector = input.semanticVisualInspector;
    this.atlasSettings = input.atlasSettings;
  }

  public async run(request: CineJellyProjectRequest, signal?: AbortSignal): Promise<DirectorRunResult> {
    const intake = this.intakeDirector.intake(request);
    const storyPlan = await this.storyArchitect.plan(intake, signal);
    const continuityLedger = this.continuityLedgerBuilder.build({
      intake,
      storyPlan
    });
    const shots = this.shotPlanner.plan({
      projectId: intake.projectId,
      scenes: storyPlan.scenes,
      settings: intake.settings
    });
    const modelId = resolveSeedanceModelId(intake.settings, this.atlasSettings);
    const productionGraph = this.productionGraphBuilder.build({
      intake,
      storyPlan,
      shots
    });
    const compiledPrompts = shots.map((shot) =>
      this.promptCompiler.compile({
        shot,
        settings: intake.settings,
        modelId,
        provider: "atlascloud"
      })
    );
    if (compiledPrompts.length === 0) {
      throw new Error("Story planning produced no renderable shots. Regenerate the story plan before rendering.");
    }
    const costEstimate = this.renderCostGate.estimate({
      compiledPrompts,
      settings: intake.settings
    });
    this.renderCostGate.assertWithinBudget(costEstimate);

    const preflightReports = compiledPrompts.map((compiledPrompt) => {
      const shot = shots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
      if (!shot) {
        throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
      }
      return this.consistencyGuardian.preflight({
        shot,
        prompt: compiledPrompt.prompt,
        negativePrompt: compiledPrompt.negativePrompt,
        ledger: continuityLedger
      });
    });
    const blockingPreflightReports = preflightReports.filter(
      (report) => report.status === "block" || report.status === "repair"
    );
    if (blockingPreflightReports.length > 0) {
      throw new Error(this.describePreflightBlock(blockingPreflightReports));
    }

    const candidateCount = candidateCountForQuality(intake.settings.qualityMode);
    const renderedShots: RenderedShot[] = [];
    for (const [promptIndex, compiledPrompt] of compiledPrompts.entries()) {
      const shot = shots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
      if (!shot) {
        throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
      }
      const preflight = preflightReports[promptIndex];
      if (!preflight) {
        throw new Error(`Missing preflight report for compiled prompt: ${compiledPrompt.shotId}`);
      }
      const candidates = await this.renderCandidates({
        shot,
        compiledPrompt,
        candidateCount,
        signal
      });
      const selectedCandidate = this.selectBestCandidate(candidates);
      compiledPrompts[promptIndex] = selectedCandidate.compiledPrompt;
      renderedShots.push({
        compiledPrompt: selectedCandidate.compiledPrompt,
        preflight,
        prediction: selectedCandidate.prediction,
        renderInspection: selectedCandidate.renderInspection,
        candidates,
        selectedCandidateIndex: selectedCandidate.candidateIndex
      });
    }

    const deliverable =
      request.outputPath && request.workDirectory && renderedShots.length > 0
        ? await this.assemblyEngine.assemble(
            {
              projectId: intake.projectId,
              outputPath: request.outputPath,
              workDirectory: request.workDirectory,
              ...(request.captionCues ? { captionCues: request.captionCues } : {}),
              ...(request.captionOptions ? { captionOptions: request.captionOptions } : {}),
              ...(request.audioTracks ? { audioTracks: request.audioTracks } : {}),
              ...(request.audioMixOptions ? { audioMixOptions: request.audioMixOptions } : {}),
              ...(request.frameSamplingOptions ? { frameSamplingOptions: request.frameSamplingOptions } : {}),
              ...(request.transitionSettings ? { transitionSettings: request.transitionSettings } : {}),
              clips: renderedShots.flatMap((renderedShot, index) =>
                renderedShot.prediction.outputUrls.map((url, outputIndex) => ({
                  clipId: `${renderedShot.compiledPrompt.shotId}_${outputIndex}`,
                  sourceUrlOrPath: url,
                  order: index + outputIndex / 100
                }))
              )
            },
            signal
          )
        : undefined;
    const semanticVisualInspection =
      deliverable?.frameSamples && request.semanticVisualInspectionOptions?.enabled
        ? await this.requireSemanticVisualInspector().inspect(
            deliverable.frameSamples,
            request.semanticVisualInspectionOptions,
            signal
          )
        : undefined;
    const finalProductionGraph = this.productionGraphRunRecorder.record({
      graph: productionGraph,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      settings: intake.settings
    });

    return {
      projectId: intake.projectId,
      storyPlan,
      productionGraph: finalProductionGraph,
      costEstimate,
      compiledPrompts,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      ...(semanticVisualInspection ? { semanticVisualInspection } : {})
    };
  }

  private async renderCandidates(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateCount: number;
    readonly signal: AbortSignal | undefined;
  }): Promise<readonly RenderCandidate[]> {
    const candidates: RenderCandidate[] = [];
    let preparedPrompt = input.compiledPrompt;

    for (let candidateIndex = 1; candidateIndex <= input.candidateCount; candidateIndex += 1) {
      const candidate = await this.renderCandidate({
        shot: input.shot,
        compiledPrompt: preparedPrompt,
        candidateIndex,
        signal: input.signal
      });
      candidates.push(candidate);
      preparedPrompt = candidate.compiledPrompt;
    }

    return candidates;
  }

  private async renderCandidate(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateIndex: number;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderCandidate> {
    const submittedAt = new Date();

    try {
      const renderResult = await this.renderProducer.render(input.compiledPrompt, input.signal);
      const renderInspection = this.consistencyGuardian.inspectRender({
        shot: input.shot,
        prediction: renderResult.prediction
      });
      return {
        candidateIndex: input.candidateIndex,
        compiledPrompt: renderResult.compiledPrompt,
        prediction: renderResult.prediction,
        renderInspection
      };
    } catch (error: unknown) {
      if (input.signal?.aborted) {
        throw error;
      }
      const prediction = this.failedPrediction({
        shot: input.shot,
        compiledPrompt: input.compiledPrompt,
        candidateIndex: input.candidateIndex,
        submittedAt,
        error
      });
      return {
        candidateIndex: input.candidateIndex,
        compiledPrompt: input.compiledPrompt,
        prediction,
        renderInspection: this.consistencyGuardian.inspectRender({
          shot: input.shot,
          prediction
        })
      };
    }
  }

  private failedPrediction(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateIndex: number;
    readonly submittedAt: Date;
    readonly error: unknown;
  }): Prediction {
    const providerError = asProviderError(String(input.compiledPrompt.videoRequest.provider), input.error);
    const completedAt = new Date();
    const rawError: Record<string, unknown> = {
      code: providerError.code,
      message: providerError.message,
      retryable: providerError.retryable
    };
    if (providerError.statusCode !== undefined) {
      rawError.statusCode = providerError.statusCode;
    }
    if (providerError.details !== undefined) {
      rawError.details = providerError.details;
    }

    return {
      provider: input.compiledPrompt.videoRequest.provider,
      predictionId: createStableId(
        "failed_prediction",
        `${input.shot.shotId}:${input.candidateIndex}:${input.submittedAt.toISOString()}`
      ),
      modelId: input.compiledPrompt.videoRequest.modelId,
      status: "failed",
      outputUrls: [],
      raw: redactUnknown(rawError),
      submittedAt: input.submittedAt,
      completedAt,
      latencyMs: completedAt.getTime() - input.submittedAt.getTime()
    };
  }

  private selectBestCandidate(candidates: readonly RenderCandidate[]): RenderCandidate {
    const sortedCandidates = [...candidates].sort((left, right) => this.compareCandidates(left, right));
    const bestCandidate = sortedCandidates[0];
    if (!bestCandidate) {
      throw new Error("No render candidates were produced for shot selection.");
    }
    return bestCandidate;
  }

  private compareCandidates(left: RenderCandidate, right: RenderCandidate): number {
    const statusDifference = this.statusRank(left.renderInspection.status) - this.statusRank(right.renderInspection.status);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    const severityDifference = this.severityPenalty(left.renderInspection) - this.severityPenalty(right.renderInspection);
    if (severityDifference !== 0) {
      return severityDifference;
    }

    const outputDifference = this.outputPenalty(left.prediction) - this.outputPenalty(right.prediction);
    if (outputDifference !== 0) {
      return outputDifference;
    }

    const latencyDifference = (left.prediction.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.prediction.latencyMs ?? Number.MAX_SAFE_INTEGER);
    if (latencyDifference !== 0) {
      return latencyDifference;
    }

    return left.candidateIndex - right.candidateIndex;
  }

  private statusRank(status: GuardianStatus): number {
    const order: Record<GuardianStatus, number> = {
      pass: 0,
      warn: 1,
      repair: 2,
      rerender: 3,
      block: 4
    };
    return order[status];
  }

  private severityPenalty(report: GuardianReport): number {
    const penalty: Record<GuardianSeverity, number> = {
      S3: 0,
      S2: 1,
      S1: 2,
      S0: 3
    };
    return report.findings.reduce((worstPenalty, finding) => Math.max(worstPenalty, penalty[finding.severity]), 0);
  }

  private outputPenalty(prediction: Prediction): number {
    return prediction.outputUrls.length > 0 ? 0 : 1;
  }

  private requireSemanticVisualInspector(): SemanticVisualInspector {
    if (!this.semanticVisualInspector) {
      throw new Error("Semantic visual inspection was requested but no SemanticVisualInspector is configured.");
    }
    return this.semanticVisualInspector;
  }

  private describePreflightBlock(reports: readonly ReturnType<ConsistencyGuardian["preflight"]>[]): string {
    const details = reports
      .slice(0, 5)
      .map((report) => {
        const finding = report.findings.find((candidate) => candidate.status === "block" || candidate.status === "repair");
        return finding
          ? `${report.nodeId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}`
          : `${report.nodeId}: ${report.status}`;
      })
      .join("; ");
    return `Consistency Guardian preflight blocked ${reports.length} shot(s). ${details}`;
  }
}
