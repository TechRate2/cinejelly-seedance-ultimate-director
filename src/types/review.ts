/**
 * Commercial review packet contracts.
 * A review packet gives operators and customers one redacted handoff summary for a completed production run.
 */

import type { DeliveryGateStatus } from "./delivery.js";
import type { CostGateStatus } from "./cost.js";
import type { GuardianRepairScope, GuardianStage, GuardianStatus } from "./guardian.js";
import type { QualityMode, Resolution, SpeedTier, AspectRatio } from "./settings.js";
import type { SourceLicenseKind, SourceLogicValidationStatus, SourceRepositoryId } from "./source-translation.js";
import type { ProductionStageRecord } from "./stage.js";
import type { MaterialSourceValidationStatus } from "./material.js";
import type { PostproductionAssetStatus } from "./postproduction-assets.js";

export type ReviewPacketStatus = "ready" | "review_required" | "blocked";

export interface ReviewPacket {
  readonly artifactSchemaVersion: "cinejelly.review_packet.v1";
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly status: ReviewPacketStatus;
  readonly summary: ReviewPacketSummary;
  readonly settings: ReviewPacketSettings;
  readonly planning: ReviewPacketPlanning;
  readonly render: ReviewPacketRender;
  readonly cost: ReviewPacketCost;
  readonly delivery: ReviewPacketDelivery;
  readonly stageLifecycle: readonly ProductionStageRecord[];
  readonly sourceLineage: readonly ReviewPacketSourceLineage[];
  readonly repairProvenance: readonly ReviewPacketRepairProvenance[];
  readonly recommendations: readonly string[];
}

export interface ReviewPacketSummary {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly deliverablePath?: string;
  readonly hasDeliverable: boolean;
}

export interface ReviewPacketSettings {
  readonly tier: SpeedTier;
  readonly resolution: Resolution;
  readonly qualityMode: QualityMode;
  readonly ratio: AspectRatio;
}

export interface ReviewPacketPlanning {
  readonly hasSourceVideoAnalysis: boolean;
  readonly sourceVideoSceneCount: number;
  readonly sourceVideoTranscriptCueCount: number;
  readonly storyboardPanelCount: number;
  readonly storyboardPreflightStatus: GuardianStatus;
  readonly productionGraphNodeCount: number;
  readonly productionGraphEdgeCount: number;
  readonly compiledPromptCount: number;
  readonly materialBriefCount: number;
  readonly materialValidationStatus: MaterialSourceValidationStatus;
  readonly materialCandidateCount: number;
  readonly selectedMaterialCandidateCount: number;
  readonly postproductionAssetStatus: PostproductionAssetStatus;
  readonly captionCueCount: number;
  readonly audioTrackCount: number;
  readonly postproductionAssetIssueCount: number;
}

export interface ReviewPacketRender {
  readonly renderedShotCount: number;
  readonly renderedTestTakeCount: number;
  readonly selectedCandidateIndexes: readonly ReviewPacketSelectedCandidate[];
  readonly totalCandidateCount: number;
  readonly totalRepairAttemptCount: number;
  readonly failedPredictionCount: number;
  readonly outputUrlCount: number;
}

export interface ReviewPacketSelectedCandidate {
  readonly shotId: string;
  readonly selectedCandidateIndex: number;
  readonly candidateCount: number;
  readonly repairAttemptCount: number;
}

export interface ReviewPacketCost {
  readonly costGateStatus: CostGateStatus;
  readonly plannedRenderSeconds: number;
  readonly estimatedTotalCostUsd?: number;
  readonly actualTotalCostUsd?: number;
  readonly providerOperationCount: number;
  readonly failedProviderOperationCount: number;
  readonly timeoutProviderOperationCount: number;
  readonly canceledProviderOperationCount: number;
}

export interface ReviewPacketDelivery {
  readonly deliveryGateStatus?: DeliveryGateStatus;
  readonly semanticVisualInspectionStatus?: "pass" | "warn" | "fail";
  readonly mediaInspectionStatus?: "pass" | "warn" | "fail";
  readonly clipCount?: number;
  readonly outputByteSize?: number;
  readonly outputSha256?: string;
  readonly durationSeconds?: number;
  readonly resolution?: string;
}

export interface ReviewPacketSourceLineage {
  readonly logicName: string;
  readonly sourceRepository: SourceRepositoryId;
  readonly license: SourceLicenseKind;
  readonly validationStatus: SourceLogicValidationStatus;
  readonly referenceImplementationPath?: string;
  readonly attributionPath?: string;
  readonly destinationPaths: readonly string[];
}

export interface ReviewPacketRepairProvenance {
  readonly nodeId: string;
  readonly stage: GuardianStage;
  readonly status: GuardianStatus;
  readonly repairScope: GuardianRepairScope;
  readonly affectedNodeIds: readonly string[];
  readonly recommendedNextStep: string;
  readonly checkpoints: readonly string[];
  readonly sourceRepositories: readonly string[];
}
