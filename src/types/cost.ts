/**
 * Cost planning contracts for commercial render gates.
 * Pricing is supplied by runtime configuration; CineJelly does not hardcode provider prices.
 */

export type CostGateStatus = "pass" | "warn" | "block";

export interface CostEstimationSettings {
  readonly renderCostUsdPerSecond?: number;
  readonly assetRegistrationCostUsd?: number;
  readonly llmPlanCostUsd?: number;
  /** Cost per generated keyframe still (keyframe-first image-to-video path). */
  readonly imageGenerationCostUsd?: number;
  /** Flat cost per talking-shot TTS synthesis (audio-first avatar path). */
  readonly ttsSynthesisCostUsd?: number;
  /** Per-second cost of the audio-driven avatar model (talking shots). */
  readonly avatarRenderCostUsdPerSecond?: number;
  readonly costBufferMultiplier: number;
}

export interface RenderCostEstimate {
  readonly status: CostGateStatus;
  readonly plannedShotCount: number;
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
  readonly plannedTestTakeCount: number;
  readonly plannedClipCount: number;
  readonly plannedSinglePassRenderSeconds: number;
  readonly plannedTestTakeRenderSeconds: number;
  readonly plannedCandidateRenderSeconds: number;
  readonly plannedRepairRenderSeconds: number;
  readonly plannedRenderSeconds: number;
  readonly plannedKeyframeImageCount: number;
  readonly plannedTalkingShotCount: number;
  readonly plannedAvatarRenderSeconds: number;
  readonly plannedLlmPlanCallCount: number;
  readonly referenceRegistrationCount: number;
  readonly estimatedRenderCostUsd?: number;
  readonly estimatedAssetRegistrationCostUsd?: number;
  readonly estimatedLlmCostUsd?: number;
  readonly estimatedKeyframeImageCostUsd?: number;
  readonly estimatedTtsCostUsd?: number;
  readonly estimatedAvatarRenderCostUsd?: number;
  readonly estimatedTotalCostUsd?: number;
  readonly maxCostUsd?: number;
  readonly findings: readonly string[];
}
