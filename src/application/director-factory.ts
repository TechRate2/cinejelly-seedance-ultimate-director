/**
 * Factory for wiring the production DirectorAgent with Atlas Cloud provider dependencies.
 * This keeps server startup thin and keeps provider creation in one place.
 */

import { loadRuntimeSettings } from "../config/runtime-config.js";
import { AtlasCloudProvider } from "../providers/atlascloud/atlas-cloud-provider.js";
import { ProviderCostLedger } from "../providers/cost-ledger.js";
import { DirectorAgent } from "../agents/director-agent.js";
import { RenderProducer } from "../agents/render-producer.js";
import { StoryArchitect } from "../agents/story-architect.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { LocalMaterialLibraryAdapter } from "../core/local-material-library-adapter.js";
import { RemoteStockMaterialAdapter } from "../core/remote-stock-material-adapter.js";
import { RenderCostGate } from "../core/render-cost-gate.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
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
}

export function createDirectorRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: DirectorRuntimeOptions = {}
): DirectorRuntime {
  const settings = loadRuntimeSettings(env);
  const ledger = new ProviderCostLedger();
  const atlasProvider = new AtlasCloudProvider(settings.atlasCloud, ledger);
  const storyArchitect = new StoryArchitect(atlasProvider, settings.atlasCloud.models.llmModel);
  const renderProducer = new RenderProducer(atlasProvider, atlasProvider);
  const renderCostGate = new RenderCostGate(settings.costEstimation);
  const semanticVisualInspector = new SemanticVisualInspector(atlasProvider, settings.atlasCloud.models.llmModel);
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
      renderConcurrency: settings.renderConcurrency,
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
