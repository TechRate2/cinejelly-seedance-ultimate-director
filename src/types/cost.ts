/**
 * Cost planning contracts for commercial render gates.
 * Pricing is supplied by runtime configuration; CineJelly does not hardcode provider prices.
 */

export type CostGateStatus = "pass" | "warn" | "block";

export interface CostEstimationSettings {
  readonly renderCostUsdPerSecond?: number;
  readonly assetRegistrationCostUsd?: number;
  readonly llmPlanCostUsd?: number;
  readonly costBufferMultiplier: number;
}

export interface RenderCostEstimate {
  readonly status: CostGateStatus;
  readonly plannedShotCount: number;
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
  readonly plannedClipCount: number;
  readonly plannedSinglePassRenderSeconds: number;
  readonly plannedCandidateRenderSeconds: number;
  readonly plannedRepairRenderSeconds: number;
  readonly plannedRenderSeconds: number;
  readonly referenceRegistrationCount: number;
  readonly estimatedRenderCostUsd?: number;
  readonly estimatedAssetRegistrationCostUsd?: number;
  readonly estimatedLlmCostUsd?: number;
  readonly estimatedTotalCostUsd?: number;
  readonly maxCostUsd?: number;
  readonly findings: readonly string[];
}
