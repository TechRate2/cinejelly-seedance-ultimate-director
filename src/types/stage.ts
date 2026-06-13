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

export const PRODUCTION_STAGE_ORDER: readonly ProductionStageName[] = [
  "plan",
  "storyboard",
  "prompt",
  "source_material",
  "render",
  "inspect",
  "repair",
  "assemble",
  "deliver"
];

export const PRODUCTION_STAGE_SOURCE_PATTERN_ORIGINS: Readonly<Record<ProductionStageName, readonly string[]>> = {
  plan: ["HKUDS/ViMax", "vericontext/vibeframe"],
  storyboard: ["HKUDS/ViMax", "vericontext/vibeframe"],
  prompt: ["Emily2040/seedance-2.0", "YouMind-OpenLab/awesome-seedance-2-prompts"],
  source_material: ["harry0703/MoneyPrinterTurbo"],
  render: ["HKUDS/ViMax", "vericontext/vibeframe"],
  inspect: ["vericontext/vibeframe"],
  repair: ["HKUDS/ViMax", "vericontext/vibeframe"],
  assemble: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
  deliver: ["vericontext/vibeframe"]
};

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

export interface ProductionStageProgressEvent {
  readonly sequence: number;
  readonly stage: ProductionStageName;
  readonly order: number;
  readonly status: ProductionStageStatus;
  readonly recordedAt: Date;
  readonly message: string;
  readonly sourcePatternOrigins: readonly string[];
  readonly evidence?: Readonly<Record<string, ProductionStageEvidenceValue>>;
}

export type ProductionStageProgressReporter = (event: ProductionStageProgressEvent) => void;
