/**
 * Production stage lifecycle contracts for long-form and batch-aware runs.
 * These records are operator evidence, not a task queue implementation.
 */

export type ProductionStageName =
  | "plan"
  | "storyboard"
  | "prompt"
  | "source_material"
  | "render"
  | "inspect"
  | "repair"
  | "assemble"
  | "deliver";

export type ProductionStageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "warn"
  | "blocked"
  | "failed"
  | "skipped";

export type ProductionStageEvidenceValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[];

export interface ProductionStageRecord {
  readonly stage: ProductionStageName;
  readonly order: number;
  readonly status: ProductionStageStatus;
  readonly graphNodeIds: readonly string[];
  readonly evidence: Readonly<Record<string, ProductionStageEvidenceValue>>;
  readonly sourcePatternOrigins: readonly string[];
  readonly blockingReason?: string;
}

export interface ProductionStagePlan {
  readonly planId: string;
  readonly projectId: string;
  readonly records: readonly ProductionStageRecord[];
}
