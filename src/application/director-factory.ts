/**
 * Factory for wiring the production DirectorAgent with Atlas Cloud provider dependencies.
 * This keeps server startup thin and keeps provider creation in one place.
 */

import { loadRuntimeSettings } from "../config/runtime-config.js";
import { AtlasCloudProvider } from "../providers/atlascloud/atlas-cloud-provider.js";
import { ProviderCostLedger, type CostLedgerRecordReporter } from "../providers/cost-ledger.js";
import { DirectorAgent } from "../agents/director-agent.js";
import { RenderProducer } from "../agents/render-producer.js";
import { CreativeBriefAnalyst } from "../agents/creative-brief-analyst.js";
import { ReferenceVisionAnalyst } from "../agents/reference-vision-analyst.js";
import { ScriptEnhancer } from "../agents/script-enhancer.js";
import { StoryArchitect } from "../agents/story-architect.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { LocalMaterialLibraryAdapter } from "../core/local-material-library-adapter.js";
import { RemoteStockMaterialAdapter } from "../core/remote-stock-material-adapter.js";
import { MediaInspector } from "../core/media-inspector.js";
import { RenderCostGate } from "../core/render-cost-gate.js";
import { RenderedCandidateVisualInspector } from "../core/rendered-candidate-visual-inspector.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { ImageAnchorVerifier } from "../core/image-anchor-verifier.js";
import { SourceVideoAutoAnalyzer } from "../core/source-video-auto-analyzer.js";
import type { ProductionStageProgressReporter } from "../types/stage.js";
import { RuntimePreflight } from "./runtime-preflight.js";

export interface DirectorRuntime {
  readonly director: DirectorAgent;
  readonly ledger: ProviderCostLedger;
  readonly preflight: RuntimePreflight;
}

export interface DirectorRuntimeOptions {
  readonly stageProgressReporter?: ProductionStageProgressReporter;
  readonly providerLedgerReporter?: CostLedgerRecordReporter;
}

export function createDirectorRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: DirectorRuntimeOptions = {}
): DirectorRuntime {
  const settings = loadRuntimeSettings(env);
  const ledger = new ProviderCostLedger(options.providerLedgerReporter);
  const atlasProvider = new AtlasCloudProvider(settings.atlasCloud, ledger);
  // The creative TEXT stages (script, styleDna, dialogue) set the quality ceiling, so they run on the
  // dedicated "writer" model when one is configured; the vision stages (reference/semantic inspection)
  // stay on llmModel. Falls back to llmModel when no writer model is set — existing deploys unchanged.
  const creativeModel = settings.atlasCloud.models.creativeLlmModel ?? settings.atlasCloud.models.llmModel;
  const storyArchitect = new StoryArchitect(atlasProvider, creativeModel);
  const creativeBriefAnalyst = new CreativeBriefAnalyst(atlasProvider, creativeModel);
  const referenceVisionAnalyst = new ReferenceVisionAnalyst(atlasProvider, settings.atlasCloud.models.llmModel);
  const scriptEnhancer = new ScriptEnhancer(atlasProvider, creativeModel);
  const renderProducer = new RenderProducer(atlasProvider, atlasProvider);
  const renderCostGate = new RenderCostGate(settings.costEstimation);
  const semanticVisualInspector = new SemanticVisualInspector(atlasProvider, settings.atlasCloud.models.llmModel);
  // Pre-video-spend image check (ViMax economy): portraits/keyframes are verified by the VISION
  // model (an "eyes" task — llmModel, not the writer model) before dollars render on them.
  const imageAnchorVerifier = new ImageAnchorVerifier(atlasProvider, settings.atlasCloud.models.llmModel);
  const candidateMediaInspector = new MediaInspector();
  const renderedCandidateVisualInspector = new RenderedCandidateVisualInspector({
    mediaInspector: candidateMediaInspector,
    semanticVisualInspector,
    mediaProber: candidateMediaInspector
  });
  const sourceVideoAutoAnalyzer = settings.sourceVideoAutoAnalysis.enabled
    ? new SourceVideoAutoAnalyzer({
        llmProvider: atlasProvider,
        defaultModelId: settings.atlasCloud.models.llmModel
      })
    : undefined;
  const materialSourceAdapters = [
    ...(settings.material.localCatalogPath
      ? [new LocalMaterialLibraryAdapter({ catalogPath: settings.material.localCatalogPath })]
      : []),
    ...settings.material.remoteStock.providers.map((provider) =>
      new RemoteStockMaterialAdapter({ settings: provider })
    )
  ];
  const preferredMaterialSources = [
    "user_provided" as const,
    "local_library" as const,
    ...settings.material.remoteStock.providers.map((provider) => provider.source)
  ];
  const assemblyEngine = new AssemblyEngine({
    maxRenderedClipBytes: settings.assembly.maxRenderedClipBytes,
    maxAudioTrackBytes: settings.assembly.maxAudioTrackBytes
  });

  return {
    director: new DirectorAgent({
      storyArchitect,
      renderProducer,
      renderCostGate,
      semanticVisualInspector,
      renderedCandidateVisualInspector,
      // Same ffprobe instance the candidate inspector uses: it lets the talking-shot stage MEASURE
      // the voice tracks it just bought and stop a provably-short video before the avatar renders
      // (the expensive stage) rather than at the delivery gate (after everything is paid).
      speechDurationProber: candidateMediaInspector,
      materialPlanningOptions: settings.material.remoteStock.enabled
        ? {
            allowRemoteSources: true,
            preferredSources: preferredMaterialSources,
            maxCandidatesPerBrief: settings.material.remoteStock.maxResultsPerBrief
          }
        : {
            allowRemoteSources: false,
            preferredSources: preferredMaterialSources
          },
      materialSourceAdapters,
      assemblyEngine,
      imageAnchorVerifier,
      renderConcurrency: settings.renderConcurrency,
      audioGenerationCapabilities: atlasProvider.audioCapabilities(),
      audioProvider: atlasProvider,
      imageProvider: atlasProvider,
      speechProvider: atlasProvider,
      creativeBriefAnalyst,
      referenceVisionAnalyst,
      scriptEnhancer,
      ...(options.stageProgressReporter ? { stageProgressReporter: options.stageProgressReporter } : {}),
      ...(sourceVideoAutoAnalyzer
        ? {
            sourceVideoAutoAnalyzer,
            sourceVideoAutoAnalysisSettings: settings.sourceVideoAutoAnalysis
          }
        : {}),
      atlasSettings: settings.atlasCloud
    }),
    ledger,
    preflight: new RuntimePreflight(env)
  };
}
