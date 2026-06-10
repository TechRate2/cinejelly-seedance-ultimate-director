/**
 * Registry for provider implementations.
 * Future providers such as Kie.ai or fal.ai plug in here without changing graph or prompt logic.
 */

import type { ModelProvider } from "./contracts.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  public register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider is not registered: ${name}`);
    }
    return provider;
  }

  public list(): readonly ModelProvider[] {
    return [...this.providers.values()];
  }
}
