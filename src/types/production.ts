/**
 * Early production-domain types shared by providers and the upcoming graph layer.
 * These are intentionally small so the provider module can compile before graph implementation lands.
 */

export interface ShotIdentity {
  readonly projectId: string;
  readonly shotId: string;
  readonly graphNodeId: string;
}

export interface ProviderLineage {
  readonly source: "user_reference" | "generated_clip" | "provider_asset" | "production_graph";
  readonly sourceId: string;
  readonly role: string;
}
