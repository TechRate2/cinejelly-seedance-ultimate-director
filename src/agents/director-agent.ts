/**
 * Director Agent orchestrates the first runnable render-level pipeline:
 * input -> story plan -> shot planning -> prompt compile -> preflight -> Seedance render -> render inspection.
 */

import { resolveSeedanceModelId } from "../config/seedance-settings.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { ConsistencyGuardian } from "../core/consistency-guardian.js";
import { ProductionGraphBuilder } from "../core/production-graph-builder.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { ShotPlanner } from "../core/shot-planner.js";
import type { AtlasCloudRuntimeSettings } from "../types/settings.js";
import type { CineJellyProjectRequest, DirectorRunResult, RenderedShot } from "../types/agent.js";
import { SeedancePromptCompiler } from "../prompt_compiler/prompt-compiler.js";
import { IntakeDirector } from "./intake-director.js";
import { RenderProducer } from "./render-producer.js";
import { StoryArchitect } from "./story-architect.js";

export class DirectorAgent {
  private readonly intakeDirector: IntakeDirector;
  private readonly storyArchitect: StoryArchitect;
  private readonly shotPlanner: ShotPlanner;
  private readonly productionGraphBuilder: ProductionGraphBuilder;
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
    readonly productionGraphBuilder?: ProductionGraphBuilder;
    readonly promptCompiler?: SeedancePromptCompiler;
    readonly consistencyGuardian?: ConsistencyGuardian;
    readonly assemblyEngine?: AssemblyEngine;
    readonly semanticVisualInspector?: SemanticVisualInspector;
  }) {
    this.intakeDirector = input.intakeDirector ?? new IntakeDirector();
    this.storyArchitect = input.storyArchitect;
    this.shotPlanner = input.shotPlanner ?? new ShotPlanner();
    this.productionGraphBuilder = input.productionGraphBuilder ?? new ProductionGraphBuilder();
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

    const preflightReports = compiledPrompts.map((compiledPrompt) => {
      const shot = shots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
      if (!shot) {
        throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
      }
      return this.consistencyGuardian.preflight({
        shot,
        prompt: compiledPrompt.prompt,
        negativePrompt: compiledPrompt.negativePrompt,
        ledger: {
          characters: [],
          styles: [],
          approvedShotIds: []
        }
      });
    });
    const blockingPreflightReports = preflightReports.filter(
      (report) => report.status === "block" || report.status === "repair"
    );
    if (blockingPreflightReports.length > 0) {
      throw new Error(this.describePreflightBlock(blockingPreflightReports));
    }

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
      const renderResult = await this.renderProducer.render(compiledPrompt, signal);
      compiledPrompts[promptIndex] = renderResult.compiledPrompt;
      const renderInspection = this.consistencyGuardian.inspectRender({
        shot,
        prediction: renderResult.prediction
      });
      renderedShots.push({
        compiledPrompt: renderResult.compiledPrompt,
        preflight,
        prediction: renderResult.prediction,
        renderInspection
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

    return {
      projectId: intake.projectId,
      storyPlan,
      productionGraph,
      compiledPrompts,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      ...(semanticVisualInspection ? { semanticVisualInspection } : {})
    };
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
