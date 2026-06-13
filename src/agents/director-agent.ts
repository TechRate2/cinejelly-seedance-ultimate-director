/**
 * Director Agent orchestrates the first runnable render-level pipeline:
 * input -> story plan -> shot planning -> prompt compile -> preflight -> Seedance render -> render inspection.
 */

import {
  candidateCountForQuality,
  repairAttemptCountForQuality,
  SEEDANCE_TEST_TAKE_DURATION_SECONDS,
  resolveSeedanceModelId,
  usesTestTakesForQuality
} from "../config/seedance-settings.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { ConsistencyGuardian } from "../core/consistency-guardian.js";
import { ContinuityLedgerBuilder } from "../core/continuity-ledger-builder.js";
import { DeliveryGate } from "../core/delivery-gate.js";
import { ProductionGraphBuilder } from "../core/production-graph-builder.js";
import { ProductionGraphRunRecorder } from "../core/production-graph-run-recorder.js";
import { ProductionStagePlanner } from "../core/production-stage-planner.js";
import { PostproductionAssetPlanner } from "../core/postproduction-asset-planner.js";
import { ReferenceSelectionPlanner } from "../core/reference-selection-planner.js";
import { MaterialSourcingPlanner } from "../core/material-sourcing-planner.js";
import { MaterialSourceValidator } from "../core/material-source-validator.js";
import { DEFAULT_POSTPRODUCTION_SETTINGS } from "../core/postproduction-engine.js";
import { RenderCostGate } from "../core/render-cost-gate.js";
import { RenderScheduler, type RenderScheduleResult } from "../core/render-scheduler.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { ShotPlanner } from "../core/shot-planner.js";
import { SourceVideoAutoAnalyzer } from "../core/source-video-auto-analyzer.js";
import { StoryboardPlanner } from "../core/storyboard-planner.js";
import type {
  AtlasCloudRuntimeSettings,
  FlexibleSeedanceSettings,
  Resolution,
  SourceVideoAutoAnalysisSettings
} from "../types/settings.js";
import type { CineJellyProjectRequest, DirectorRunResult, RenderCandidate, RenderedShot } from "../types/agent.js";
import type { GuardianReport, GuardianSeverity, GuardianStatus } from "../types/guardian.js";
import type {
  MaterialCandidate,
  MaterialSource,
  MaterialSourceAdapter,
  MaterialSourceValidationReport
} from "../types/material.js";
import type { PostproductionSettings } from "../types/media.js";
import type { CompiledPrompt, ShotContract } from "../types/prompt.js";
import type { Prediction } from "../types/provider.js";
import type {
  ProductionStageEvidenceValue,
  ProductionStageName,
  ProductionStageProgressReporter,
  ProductionStageStatus
} from "../types/stage.js";
import {
  PRODUCTION_STAGE_ORDER,
  PRODUCTION_STAGE_SOURCE_PATTERN_ORIGINS
} from "../types/stage.js";
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
  private readonly storyboardPlanner: StoryboardPlanner;
  private readonly continuityLedgerBuilder: ContinuityLedgerBuilder;
  private readonly productionGraphBuilder: ProductionGraphBuilder;
  private readonly productionGraphRunRecorder: ProductionGraphRunRecorder;
  private readonly productionStagePlanner: ProductionStagePlanner;
  private readonly postproductionAssetPlanner: PostproductionAssetPlanner;
  private readonly referenceSelectionPlanner: ReferenceSelectionPlanner;
  private readonly materialSourcingPlanner: MaterialSourcingPlanner;
  private readonly materialPlanningOptions: MaterialPlanningOptions;
  private readonly materialSourceAdapters: readonly MaterialSourceAdapter[];
  private readonly materialSourceValidator: MaterialSourceValidator;
  private readonly renderCostGate: RenderCostGate;
  private readonly promptCompiler: SeedancePromptCompiler;
  private readonly consistencyGuardian: ConsistencyGuardian;
  private readonly renderProducer: RenderProducer;
  private readonly renderScheduler: RenderScheduler;
  private readonly assemblyEngine: AssemblyEngine;
  private readonly deliveryGate: DeliveryGate;
  private readonly semanticVisualInspector: SemanticVisualInspector | undefined;
  private readonly sourceVideoAutoAnalyzer: SourceVideoAutoAnalyzer | undefined;
  private readonly sourceVideoAutoAnalysisSettings: SourceVideoAutoAnalysisSettings | undefined;
  private readonly stageProgressReporter: ProductionStageProgressReporter | undefined;
  private readonly atlasSettings: AtlasCloudRuntimeSettings;
  private stageProgressSequence = 0;

  public constructor(input: {
    readonly storyArchitect: StoryArchitect;
    readonly renderProducer: RenderProducer;
    readonly atlasSettings: AtlasCloudRuntimeSettings;
    readonly intakeDirector?: IntakeDirector;
    readonly shotPlanner?: ShotPlanner;
    readonly storyboardPlanner?: StoryboardPlanner;
    readonly continuityLedgerBuilder?: ContinuityLedgerBuilder;
    readonly productionGraphBuilder?: ProductionGraphBuilder;
    readonly productionGraphRunRecorder?: ProductionGraphRunRecorder;
    readonly productionStagePlanner?: ProductionStagePlanner;
    readonly postproductionAssetPlanner?: PostproductionAssetPlanner;
    readonly referenceSelectionPlanner?: ReferenceSelectionPlanner;
    readonly materialSourcingPlanner?: MaterialSourcingPlanner;
    readonly materialPlanningOptions?: MaterialPlanningOptions;
    readonly materialSourceAdapters?: readonly MaterialSourceAdapter[];
    readonly materialSourceValidator?: MaterialSourceValidator;
    readonly renderCostGate?: RenderCostGate;
    readonly promptCompiler?: SeedancePromptCompiler;
    readonly consistencyGuardian?: ConsistencyGuardian;
    readonly renderConcurrency?: number;
    readonly assemblyEngine?: AssemblyEngine;
    readonly deliveryGate?: DeliveryGate;
    readonly semanticVisualInspector?: SemanticVisualInspector;
    readonly sourceVideoAutoAnalyzer?: SourceVideoAutoAnalyzer;
    readonly sourceVideoAutoAnalysisSettings?: SourceVideoAutoAnalysisSettings;
    readonly stageProgressReporter?: ProductionStageProgressReporter;
  }) {
    this.intakeDirector = input.intakeDirector ?? new IntakeDirector();
    this.storyArchitect = input.storyArchitect;
    this.shotPlanner = input.shotPlanner ?? new ShotPlanner();
    this.storyboardPlanner = input.storyboardPlanner ?? new StoryboardPlanner();
    this.continuityLedgerBuilder = input.continuityLedgerBuilder ?? new ContinuityLedgerBuilder();
    this.productionGraphBuilder = input.productionGraphBuilder ?? new ProductionGraphBuilder();
    this.productionGraphRunRecorder = input.productionGraphRunRecorder ?? new ProductionGraphRunRecorder();
    this.productionStagePlanner = input.productionStagePlanner ?? new ProductionStagePlanner();
    this.postproductionAssetPlanner = input.postproductionAssetPlanner ?? new PostproductionAssetPlanner();
    this.referenceSelectionPlanner = input.referenceSelectionPlanner ?? new ReferenceSelectionPlanner();
    this.materialSourcingPlanner = input.materialSourcingPlanner ?? new MaterialSourcingPlanner();
    this.materialPlanningOptions = input.materialPlanningOptions ?? {};
    this.materialSourceAdapters = input.materialSourceAdapters ?? [];
    this.materialSourceValidator = input.materialSourceValidator ?? new MaterialSourceValidator();
    this.renderCostGate = input.renderCostGate ?? new RenderCostGate({ costBufferMultiplier: 1 });
    this.promptCompiler = input.promptCompiler ?? new SeedancePromptCompiler();
    this.consistencyGuardian = input.consistencyGuardian ?? new ConsistencyGuardian();
    this.renderProducer = input.renderProducer;
    this.renderScheduler = new RenderScheduler(input.renderConcurrency ?? 1);
    this.assemblyEngine = input.assemblyEngine ?? new AssemblyEngine();
    this.deliveryGate = input.deliveryGate ?? new DeliveryGate();
    this.semanticVisualInspector = input.semanticVisualInspector;
    this.sourceVideoAutoAnalyzer = input.sourceVideoAutoAnalyzer;
    this.sourceVideoAutoAnalysisSettings = input.sourceVideoAutoAnalysisSettings;
    this.stageProgressReporter = input.stageProgressReporter;
    this.atlasSettings = input.atlasSettings;
  }

  public async run(request: CineJellyProjectRequest, signal?: AbortSignal): Promise<DirectorRunResult> {
    this.reportStageProgress("plan", "running", "Preparing intake, story plan, shot plan, and reference selection.");
    const preparedRequest = await this.prepareRequestForIntake(request, signal);
    const intake = this.intakeDirector.intake(preparedRequest);
    const storyPlan = await this.storyArchitect.plan(intake, signal);
    const continuityLedger = this.continuityLedgerBuilder.build({
      intake,
      storyPlan
    });
    const plannedShots = this.shotPlanner.plan({
      projectId: intake.projectId,
      scenes: storyPlan.scenes,
      settings: intake.settings,
      ...(intake.metadata ? { metadata: intake.metadata } : {})
    });
    const shots = this.referenceSelectionPlanner.planForShots({ shots: plannedShots });
    this.reportStageProgress("plan", "succeeded", "Planning completed.", {
      sceneCount: storyPlan.scenes.length,
      shotCount: shots.length,
      targetDurationSeconds: storyPlan.targetDurationSeconds,
      referenceCount: intake.references.length
    });
    this.reportStageProgress("storyboard", "running", "Planning storyboard panels and running storyboard preflight.");
    const storyboard = this.storyboardPlanner.plan({
      projectId: intake.projectId,
      storyPlan,
      shots
    });
    const storyboardPreflight = this.consistencyGuardian.inspectStoryboard({
      storyboard,
      shots
    });
    this.reportStageProgress(
      "storyboard",
      this.guardianStageStatus(storyboardPreflight.status),
      "Storyboard preflight completed.",
      {
        storyboardPanelCount: storyboard.panels.length,
        storyboardPreflightStatus: storyboardPreflight.status,
        findingCount: storyboardPreflight.findings.length
      }
    );
    if (storyboardPreflight.status === "block" || storyboardPreflight.status === "repair") {
      throw new Error(this.describeStoryboardBlock(storyboardPreflight));
    }
    const modelId = resolveSeedanceModelId(intake.settings, this.atlasSettings);
    const providerSupportedReferenceKinds = this.renderProducer.supportedReferenceKinds(modelId);
    this.reportStageProgress("prompt", "running", "Compiling provider-ready prompts and binding references.");
    const compiledPrompts = shots.map((shot) =>
      this.promptCompiler.compile({
        shot,
        settings: intake.settings,
        modelId,
        provider: "atlascloud",
        ...(providerSupportedReferenceKinds ? { providerSupportedReferenceKinds } : {})
      })
    );
    if (compiledPrompts.length === 0) {
      this.reportStageProgress("prompt", "failed", "Prompt compilation produced no renderable prompts.");
      throw new Error("Story planning produced no renderable shots. Regenerate the story plan before rendering.");
    }
    this.reportStageProgress("prompt", "succeeded", "Prompt compilation completed.", {
      compiledPromptCount: compiledPrompts.length,
      providerReferenceCount: compiledPrompts.reduce((sum, prompt) => sum + prompt.references.length, 0)
    });
    this.validateProviderCapabilities(compiledPrompts);
    const plannedTestTakeCount = shots.filter((shot) => this.shouldRunTestTake(shot, intake.settings)).length;
    const costEstimate = this.renderCostGate.estimate({
      compiledPrompts,
      settings: intake.settings,
      plannedTestTakeCount,
      plannedTestTakeRenderSeconds: plannedTestTakeCount * SEEDANCE_TEST_TAKE_DURATION_SECONDS
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
        bindingPlan: compiledPrompt.bindingPlan,
        ledger: continuityLedger
      });
    });
    const blockingPreflightReports = preflightReports.filter(
      (report) => report.status === "block" || report.status === "repair"
    );
    if (blockingPreflightReports.length > 0) {
      this.reportStageProgress("prompt", "blocked", "Prompt and reference preflight blocked render spend.", {
        blockingPreflightCount: blockingPreflightReports.length
      });
      throw new Error(this.describePreflightBlock(blockingPreflightReports));
    }

    this.reportStageProgress("source_material", "running", "Planning source-material briefs and resolving configured adapters.");
    const materialSourcingPlan = this.materialSourcingPlanner.plan({
      projectId: intake.projectId,
      shots,
      settings: intake.settings,
      ...(this.materialPlanningOptions.allowRemoteSources !== undefined
        ? { allowRemoteSources: this.materialPlanningOptions.allowRemoteSources }
        : {}),
      ...(this.materialPlanningOptions.preferredSources ? { preferredSources: this.materialPlanningOptions.preferredSources } : {}),
      ...(this.materialPlanningOptions.maxCandidatesPerBrief !== undefined
        ? { maxCandidatesPerBrief: this.materialPlanningOptions.maxCandidatesPerBrief }
        : {})
    });
    const materialCandidates = await this.resolveMaterialCandidates(materialSourcingPlan, signal);
    const materialSourceValidation = this.materialSourceValidator.validate({
      plan: materialSourcingPlan,
      candidates: materialCandidates
    });
    this.reportStageProgress(
      "source_material",
      this.materialSourceStageStatus(materialSourceValidation),
      "Source-material planning and validation completed.",
      {
        materialBriefCount: materialSourcingPlan.briefs.length,
        materialCandidateCount: materialSourceValidation.candidateCount,
        selectedMaterialCandidateCount: materialSourceValidation.selectedCandidateCount,
        materialValidationStatus: materialSourceValidation.status
      }
    );
    const postproductionAssetPlan = this.postproductionAssetPlanner.plan({
      projectId: intake.projectId,
      ...(preparedRequest.captionCues ? { captionCues: preparedRequest.captionCues } : {}),
      ...(preparedRequest.captionOptions ? { captionOptions: preparedRequest.captionOptions } : {}),
      ...(preparedRequest.audioTracks ? { audioTracks: preparedRequest.audioTracks } : {}),
      ...(preparedRequest.audioMixOptions ? { audioMixOptions: preparedRequest.audioMixOptions } : {})
    });
    const productionGraph = this.productionGraphBuilder.build({
      intake,
      storyPlan,
      shots,
      storyboard,
      storyboardPreflight,
      materialSourcingPlan
    });

    const candidateCount = candidateCountForQuality(intake.settings.qualityMode);
    const repairAttemptCount = repairAttemptCountForQuality(intake.settings.qualityMode);
    this.reportStageProgress("render", "running", "Rendering scheduled shots and candidates.", {
      scheduledShotCount: compiledPrompts.length,
      candidateCount,
      repairAttemptCount
    });
    let renderResults: readonly RenderScheduleResult<RenderedShot>[];
    try {
      renderResults = await this.renderScheduler.run(
        compiledPrompts.map((compiledPrompt, promptIndex) => {
          const shot = shots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
          const preflight = preflightReports[promptIndex];
          if (!shot) {
            throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
          }
          if (!preflight) {
            throw new Error(`Missing preflight report for compiled prompt: ${compiledPrompt.shotId}`);
          }
          return {
            index: promptIndex,
            shot,
            value: {
              compiledPrompt,
              preflight,
              shouldRunTestTake: this.shouldRunTestTake(shot, intake.settings)
            }
          };
        }),
        async (item) =>
          this.renderShot({
            shot: item.shot,
            compiledPrompt: item.value.compiledPrompt,
            preflight: item.value.preflight,
            shouldRunTestTake: item.value.shouldRunTestTake,
            candidateCount,
            repairAttemptCount,
            signal
          })
      );
    } catch (error) {
      this.reportStageProgress("render", "failed", "Render scheduler failed before producing completed shot evidence.");
      throw error;
    }
    const renderedShots = renderResults.map((result) => result.value);
    this.reportStageProgress("render", this.renderedShotsStageStatus(renderedShots), "Render stage completed.", {
      renderedShotCount: renderedShots.length,
      renderedTestTakeCount: renderedShots.filter((shot) => shot.testTake).length,
      totalCandidateCount: this.totalCandidateCount(renderedShots)
    });
    for (const [index, renderedShot] of renderedShots.entries()) {
      compiledPrompts[index] = renderedShot.compiledPrompt;
    }
    this.reportStageProgress("inspect", "running", "Inspecting rendered shots.");
    const blockingRenderReports = renderedShots.filter((renderedShot) =>
      this.needsRenderRepair(renderedShot.renderInspection)
    );
    if (blockingRenderReports.length > 0) {
      this.reportStageProgress("inspect", "blocked", "Rendered shot inspection blocked delivery.", {
        blockingInspectionCount: blockingRenderReports.length
      });
      throw new Error(this.describeRenderBlock(blockingRenderReports));
    }
    this.reportStageProgress("inspect", this.inspectionStageStatus(renderedShots), "Rendered shot inspection completed.", {
      warningInspectionCount: renderedShots.filter((shot) => shot.renderInspection.status === "warn").length
    });
    this.reportStageProgress("repair", this.repairStageStatus(renderedShots), "Repair stage completed or skipped.", {
      repairAttemptCount: renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0)
    });

    const shouldAssemble = Boolean(preparedRequest.outputPath && preparedRequest.workDirectory && renderedShots.length > 0);
    if (shouldAssemble) {
      this.reportStageProgress("assemble", "running", "Assembling rendered clips into the deliverable.");
    }
    const deliverable = shouldAssemble
      ? await this.assemblyEngine.assemble(
          {
            projectId: intake.projectId,
            outputPath: preparedRequest.outputPath as string,
            workDirectory: preparedRequest.workDirectory as string,
            ...(preparedRequest.captionCues ? { captionCues: preparedRequest.captionCues } : {}),
            ...(preparedRequest.captionOptions ? { captionOptions: preparedRequest.captionOptions } : {}),
            ...(preparedRequest.audioTracks ? { audioTracks: preparedRequest.audioTracks } : {}),
            ...(preparedRequest.audioMixOptions ? { audioMixOptions: preparedRequest.audioMixOptions } : {}),
            ...(preparedRequest.frameSamplingOptions ? { frameSamplingOptions: preparedRequest.frameSamplingOptions } : {}),
            ...(preparedRequest.transitionSettings ? { transitionSettings: preparedRequest.transitionSettings } : {}),
            postproductionSettings: this.postproductionSettingsForDelivery(intake.settings),
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
    this.reportStageProgress(
      "assemble",
      deliverable ? "succeeded" : "skipped",
      deliverable ? "Assembly completed." : "Assembly skipped because no deliverable path was requested.",
      {
        hasDeliverable: Boolean(deliverable)
      }
    );
    if (deliverable) {
      this.reportStageProgress("deliver", "running", "Evaluating delivery gate.");
    }
    const deliveryGate = deliverable
      ? this.deliveryGate.evaluate({
          deliverable,
          settings: intake.settings
        })
      : undefined;
    if (deliveryGate) {
      this.reportStageProgress(
        "deliver",
        this.deliveryGateStageStatus(deliveryGate),
        "Delivery gate completed.",
        {
          deliveryGateStatus: deliveryGate.status,
          findingCount: deliveryGate.findings.length
        }
      );
      this.deliveryGate.assertPass(deliveryGate);
    } else {
      this.reportStageProgress("deliver", "skipped", "Delivery skipped because no deliverable was assembled.", {
        deliveryGateStatus: "not_run"
      });
    }
    const semanticVisualInspection =
      deliverable?.frameSamples && preparedRequest.semanticVisualInspectionOptions?.enabled
        ? await this.requireSemanticVisualInspector().inspect(
            deliverable.frameSamples,
            preparedRequest.semanticVisualInspectionOptions,
            signal
          )
        : undefined;
    const finalProductionGraph = this.productionGraphRunRecorder.record({
      graph: productionGraph,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      settings: intake.settings
    });
    const stagePlan = this.productionStagePlanner.plan({
      projectId: intake.projectId,
      storyPlan,
      shots,
      storyboard,
      storyboardPreflight,
      materialSourcingPlan,
      materialSourceValidation,
      postproductionAssetPlan,
      compiledPrompts,
      renderedShots,
      deliverablePresent: Boolean(deliverable),
      ...(deliveryGate ? { deliveryGate } : {}),
      productionGraph: finalProductionGraph
    });

    return {
      projectId: intake.projectId,
      storyPlan,
      storyboard,
      storyboardPreflight,
      productionGraph: finalProductionGraph,
      materialSourcingPlan,
      materialSourceValidation,
      postproductionAssetPlan,
      stagePlan,
      costEstimate,
      compiledPrompts,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      ...(deliveryGate ? { deliveryGate } : {}),
      ...(semanticVisualInspection ? { semanticVisualInspection } : {})
    };
  }

  private async prepareRequestForIntake(
    request: CineJellyProjectRequest,
    signal: AbortSignal | undefined
  ): Promise<CineJellyProjectRequest> {
    if (!this.sourceVideoAutoAnalyzer || !this.sourceVideoAutoAnalysisSettings?.enabled) {
      return request;
    }
    return this.sourceVideoAutoAnalyzer.prepareRequest(request, this.sourceVideoAutoAnalysisSettings, signal);
  }

  private reportStageProgress(
    stage: ProductionStageName,
    status: ProductionStageStatus,
    message: string,
    evidence?: Readonly<Record<string, ProductionStageEvidenceValue>>
  ): void {
    if (!this.stageProgressReporter) {
      return;
    }
    try {
      this.stageProgressReporter({
        sequence: ++this.stageProgressSequence,
        stage,
        order: PRODUCTION_STAGE_ORDER.indexOf(stage),
        status,
        recordedAt: new Date(),
        message,
        sourcePatternOrigins: PRODUCTION_STAGE_SOURCE_PATTERN_ORIGINS[stage],
        ...(evidence ? { evidence } : {})
      });
    } catch {
      // Progress telemetry must not change render behavior.
    }
  }

  private guardianStageStatus(status: GuardianStatus): ProductionStageStatus {
    switch (status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "repair":
      case "rerender":
      case "block":
        return "blocked";
    }
  }

  private materialSourceStageStatus(report: MaterialSourceValidationReport): ProductionStageStatus {
    switch (report.status) {
      case "rejected":
        return "blocked";
      case "review_required":
        return "warn";
      case "approved":
      case "planned_only":
        return "succeeded";
    }
  }

  private renderedShotsStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "failed";
    }
    return renderedShots.some((shot) => shot.prediction.status !== "succeeded") ? "failed" : "succeeded";
  }

  private inspectionStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "skipped";
    }
    return renderedShots.some((shot) => shot.renderInspection.status === "warn") ? "warn" : "succeeded";
  }

  private repairStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    const repairAttemptCount = renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0);
    return repairAttemptCount > 0 ? "succeeded" : "skipped";
  }

  private deliveryGateStageStatus(deliveryGate: NonNullable<DirectorRunResult["deliveryGate"]>): ProductionStageStatus {
    switch (deliveryGate.status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "block":
        return "blocked";
    }
  }

  private totalCandidateCount(renderedShots: readonly RenderedShot[]): number {
    return renderedShots.reduce((sum, shot) => sum + shot.candidates.length, 0);
  }

  private validateProviderCapabilities(compiledPrompts: readonly CompiledPrompt[]): void {
    for (const compiledPrompt of compiledPrompts) {
      this.renderProducer.validateCapability(compiledPrompt);
    }
  }

  private async resolveMaterialCandidates(
    materialSourcingPlan: ReturnType<MaterialSourcingPlanner["plan"]>,
    signal: AbortSignal | undefined
  ): Promise<readonly MaterialCandidate[]> {
    if (this.materialSourceAdapters.length === 0) {
      return [];
    }
    const candidateGroups = await Promise.all(
      this.materialSourceAdapters.map((adapter) =>
        adapter.resolve({
          plan: materialSourcingPlan,
          ...(signal ? { signal } : {})
        })
      )
    );
    return candidateGroups.flat();
  }

  private postproductionSettingsForDelivery(settings: FlexibleSeedanceSettings): PostproductionSettings {
    return {
      ...DEFAULT_POSTPRODUCTION_SETTINGS,
      targetHeight: this.targetHeight(settings.resolution),
      targetRatio: settings.ratio
    };
  }

  private targetHeight(resolution: Resolution): 480 | 720 | 1080 {
    switch (resolution) {
      case "480p":
        return 480;
      case "720p":
        return 720;
      case "1080p":
        return 1080;
    }
  }

  private shouldRunTestTake(shot: ShotContract, settings: FlexibleSeedanceSettings): boolean {
    if (!usesTestTakesForQuality(settings.qualityMode) || shot.durationSeconds <= SEEDANCE_TEST_TAKE_DURATION_SECONDS) {
      return false;
    }
    const referenceRoles = new Set(shot.references.map((reference) => reference.role));
    return (
      shot.risks.some((risk) => ["face", "product_logo", "audio_sync", "transition", "multi_character_blocking"].includes(risk)) ||
      referenceRoles.has("motion") ||
      referenceRoles.has("camera") ||
      referenceRoles.has("audio_tempo") ||
      referenceRoles.has("voice") ||
      referenceRoles.has("source_video_structure")
    );
  }

  private async renderShot(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly preflight: GuardianReport;
    readonly shouldRunTestTake: boolean;
    readonly candidateCount: number;
    readonly repairAttemptCount: number;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderedShot> {
    let compiledPrompt = input.compiledPrompt;
    const testTake = input.shouldRunTestTake
      ? await this.renderTestTake({
          shot: input.shot,
          compiledPrompt,
          signal: input.signal
        })
      : undefined;
    if (testTake && this.needsTestTakeBlock(testTake.renderInspection)) {
      throw new Error(this.describeTestTakeBlock(input.shot, testTake.renderInspection));
    }
    if (testTake && testTake.renderInspection.status === "repair") {
      compiledPrompt = this.compileTestTakeRepair({
        compiledPrompt,
        report: testTake.renderInspection
      });
    }
    const candidates = await this.renderCandidates({
      shot: input.shot,
      compiledPrompt,
      candidateCount: input.candidateCount,
      repairAttemptCount: input.repairAttemptCount,
      signal: input.signal
    });
    const selectedCandidate = this.selectBestCandidate(candidates);

    return {
      compiledPrompt: selectedCandidate.compiledPrompt,
      preflight: input.preflight,
      prediction: selectedCandidate.prediction,
      renderInspection: selectedCandidate.renderInspection,
      ...(testTake ? { testTake } : {}),
      candidates,
      selectedCandidateIndex: selectedCandidate.candidateIndex,
      repairAttemptCount: candidates.filter((candidate) => candidate.repairAttempt !== undefined).length
    };
  }

  private async renderTestTake(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderCandidate> {
    const compiledPrompt = this.compileTestTakePrompt(input.compiledPrompt);
    const renderResult = await this.renderProducer.render(compiledPrompt, input.signal);
    const renderInspection = this.consistencyGuardian.inspectTestTake({
      shot: input.shot,
      prediction: renderResult.prediction
    });

    return {
      candidateIndex: 0,
      testTake: true,
      compiledPrompt: renderResult.compiledPrompt,
      prediction: renderResult.prediction,
      renderInspection
    };
  }

  private compileTestTakePrompt(compiledPrompt: CompiledPrompt): CompiledPrompt {
    const prompt = [
      compiledPrompt.prompt,
      "",
      `Render a ${SEEDANCE_TEST_TAKE_DURATION_SECONDS}-second test take for production validation.`,
      "Prioritize identity, product geometry, motion feasibility, audio sync feasibility, and transition handles over final pacing."
    ].join("\n");
    const metadata = {
      ...(compiledPrompt.videoRequest.metadata ?? {}),
      testTake: true
    };

    return {
      ...compiledPrompt,
      prompt,
      videoRequest: {
        ...compiledPrompt.videoRequest,
        prompt,
        metadata,
        settings: {
          ...compiledPrompt.videoRequest.settings,
          durationSeconds: SEEDANCE_TEST_TAKE_DURATION_SECONDS
        }
      }
    };
  }

  private compileTestTakeRepair(input: {
    readonly compiledPrompt: CompiledPrompt;
    readonly report: GuardianReport;
  }): CompiledPrompt {
    const directives = this.repairDirectives(input.compiledPrompt, input.report);
    const repairBlock = [
      "Apply targeted repair from the approved test take before full render.",
      "Preserve all approved references, duration, camera language, lighting, and continuity.",
      ...directives.map((directive) => `- ${directive}`)
    ].join("\n");
    const prompt = `${input.compiledPrompt.prompt}\n\n${repairBlock}`;
    const metadata = {
      ...(input.compiledPrompt.videoRequest.metadata ?? {}),
      testTakeRepair: true,
      testTakeSourceStatus: input.report.status,
      testTakeSourceNodeId: input.report.nodeId
    };

    return {
      ...input.compiledPrompt,
      prompt,
      repairHints: directives,
      videoRequest: {
        ...input.compiledPrompt.videoRequest,
        prompt,
        metadata
      }
    };
  }

  private async renderCandidates(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateCount: number;
    readonly repairAttemptCount: number;
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

    let selectedCandidate = this.selectBestCandidate(candidates);
    for (
      let repairAttempt = 1;
      repairAttempt <= input.repairAttemptCount && this.needsRenderRepair(selectedCandidate.renderInspection);
      repairAttempt += 1
    ) {
      const repairCompiledPrompt = this.compileRepairAttempt({
        compiledPrompt: selectedCandidate.compiledPrompt,
        report: selectedCandidate.renderInspection,
        repairAttempt
      });
      const repairCandidate = await this.renderCandidate({
        shot: input.shot,
        compiledPrompt: repairCompiledPrompt,
        candidateIndex: candidates.length + 1,
        repairAttempt,
        signal: input.signal
      });
      candidates.push(repairCandidate);
      selectedCandidate = this.selectBestCandidate(candidates);
    }

    return candidates;
  }

  private compileRepairAttempt(input: {
    readonly compiledPrompt: CompiledPrompt;
    readonly report: GuardianReport;
    readonly repairAttempt: number;
  }): CompiledPrompt {
    const directives = this.repairDirectives(input.compiledPrompt, input.report);
    const repairBlock = [
      `Targeted repair attempt ${input.repairAttempt}.`,
      "Preserve all approved shot intent, references, duration, camera language, lighting, and continuity.",
      "Repair only the failed checkpoints from the previous render:",
      ...directives.map((directive) => `- ${directive}`)
    ].join("\n");
    const prompt = `${input.compiledPrompt.prompt}\n\n${repairBlock}`;
    const metadata = {
      ...(input.compiledPrompt.videoRequest.metadata ?? {}),
      repairAttempt: input.repairAttempt,
      repairSourceStatus: input.report.status,
      repairSourceNodeId: input.report.nodeId
    };

    return {
      ...input.compiledPrompt,
      prompt,
      repairHints: directives,
      videoRequest: {
        ...input.compiledPrompt.videoRequest,
        prompt,
        metadata
      }
    };
  }

  private repairDirectives(compiledPrompt: CompiledPrompt, report: GuardianReport): readonly string[] {
    const directives = new Set<string>();
    for (const finding of report.findings) {
      if (finding.repair.trim()) {
        directives.add(finding.repair.trim());
      }
    }
    for (const hint of compiledPrompt.repairHints) {
      if (hint.trim()) {
        directives.add(hint.trim());
      }
    }
    if (directives.size === 0) {
      directives.add("Rerender only this shot with a simpler directorial prompt and the same reference bindings.");
    }
    return [...directives].slice(0, 6);
  }

  private async renderCandidate(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateIndex: number;
    readonly repairAttempt?: number;
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
        ...(input.repairAttempt !== undefined ? { repairAttempt: input.repairAttempt } : {}),
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
        ...(input.repairAttempt !== undefined ? { repairAttempt: input.repairAttempt } : {}),
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

  private needsRenderRepair(report: GuardianReport): boolean {
    return report.status === "repair" || report.status === "rerender" || report.status === "block";
  }

  private needsTestTakeBlock(report: GuardianReport): boolean {
    return report.status === "rerender" || report.status === "block";
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

  private describeStoryboardBlock(report: ReturnType<ConsistencyGuardian["inspectStoryboard"]>): string {
    const details = report.findings
      .slice(0, 5)
      .map((finding) => `${finding.checkpoint} (${finding.severity}) - ${finding.repair}`)
      .join("; ");
    return `Consistency Guardian storyboard preflight blocked production before render spend. ${details}`;
  }

  private describeRenderBlock(renderedShots: readonly RenderedShot[]): string {
    const details = renderedShots
      .slice(0, 5)
      .map((renderedShot) => {
        const finding = renderedShot.renderInspection.findings.find((candidate) =>
          candidate.status === "block" || candidate.status === "repair" || candidate.status === "rerender"
        );
        return finding
          ? `${renderedShot.compiledPrompt.shotId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}`
          : `${renderedShot.compiledPrompt.shotId}: ${renderedShot.renderInspection.status}`;
      })
      .join("; ");
    return `Consistency Guardian render gate blocked ${renderedShots.length} shot(s) after targeted repair budget. ${details}`;
  }

  private describeTestTakeBlock(shot: ShotContract, report: GuardianReport): string {
    const finding = report.findings.find((candidate) => candidate.status === "block" || candidate.status === "rerender");
    return finding
      ? `Consistency Guardian test-take gate blocked ${shot.shotId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}`
      : `Consistency Guardian test-take gate blocked ${shot.shotId}: ${report.status}`;
  }
}

export interface MaterialPlanningOptions {
  readonly allowRemoteSources?: boolean;
  readonly preferredSources?: readonly MaterialSource[];
  readonly maxCandidatesPerBrief?: number;
}
