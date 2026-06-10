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
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { RuntimePreflight } from "./runtime-preflight.js";

export interface DirectorRuntime {
  readonly director: DirectorAgent;
  readonly ledger: ProviderCostLedger;
  readonly preflight: RuntimePreflight;
}

export function createDirectorRuntime(env: NodeJS.ProcessEnv = process.env): DirectorRuntime {
  const settings = loadRuntimeSettings(env);
  const ledger = new ProviderCostLedger();
  const atlasProvider = new AtlasCloudProvider(settings.atlasCloud, ledger);
  const storyArchitect = new StoryArchitect(atlasProvider, settings.atlasCloud.models.llmModel);
  const renderProducer = new RenderProducer(atlasProvider, atlasProvider);
  const semanticVisualInspector = new SemanticVisualInspector(atlasProvider, settings.atlasCloud.models.llmModel);

  return {
    director: new DirectorAgent({
      storyArchitect,
      renderProducer,
      semanticVisualInspector,
      atlasSettings: settings.atlasCloud
    }),
    ledger,
    preflight: new RuntimePreflight(env)
  };
}
