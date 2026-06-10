/**
 * Production Graph types for long-form video planning.
 * The graph is the system of record for scenes, beats, shots, renders, inspections, repairs, and deliverables.
 */

import type { FlexibleSeedanceSettings } from "./settings.js";
import type { ShotContract } from "./prompt.js";
import type { PredictionStatus, ProviderReference } from "./provider.js";

export type GraphNodeType =
  | "project"
  | "audience_profile"
  | "reference_asset"
  | "story_arc"
  | "sequence"
  | "scene"
  | "beat"
  | "shot"
  | "clip_render"
  | "inspection_report"
  | "repair_action"
  | "deliverable";

export type GraphEdgeType =
  | "depends_on"
  | "continues_identity"
  | "continues_environment"
  | "matches_motion"
  | "transitions_to"
  | "requires_repair";

export interface GraphNodeBase<TType extends GraphNodeType, TData> {
  readonly id: string;
  readonly type: TType;
  readonly data: TData;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectNodeData {
  readonly userInput: string;
  readonly settings: FlexibleSeedanceSettings;
  readonly targetDurationSeconds: number;
}

export interface ReferenceAssetNodeData {
  readonly reference: ProviderReference;
  readonly lineage: string;
  readonly validated: boolean;
}

export interface StoryArcNodeData {
  readonly premise: string;
  readonly hook?: string;
  readonly payoff?: string;
}

export interface SequenceNodeData {
  readonly title: string;
  readonly purpose: string;
  readonly targetDurationSeconds: number;
  readonly order: number;
}

export interface SceneNodeData {
  readonly title: string;
  readonly location?: string;
  readonly narrativeFunction: string;
  readonly targetDurationSeconds: number;
  readonly order: number;
}

export interface BeatNodeData {
  readonly purpose: string;
  readonly action: string;
  readonly targetDurationSeconds: number;
  readonly order: number;
}

export interface ClipRenderNodeData {
  readonly provider: string;
  readonly modelId: string;
  readonly predictionId: string;
  readonly status: PredictionStatus;
  readonly outputUrls: readonly string[];
  readonly candidateIndex?: number;
  readonly repairAttempt?: number;
  readonly testTake?: boolean;
  readonly selected?: boolean;
  readonly costUsd?: number;
}

export interface InspectionReportNodeData {
  readonly status: "pass" | "warn" | "repair" | "rerender" | "block";
  readonly findings: readonly string[];
  readonly severity: "S0" | "S1" | "S2" | "S3";
}

export interface RepairActionNodeData {
  readonly scope: "ShotLocal" | "SceneLocal" | "SequenceLocal" | "Global";
  readonly reason: string;
  readonly targetNodeId: string;
}

export interface DeliverableNodeData {
  readonly outputUrl: string;
  readonly durationSeconds: number;
  readonly resolution: string;
  readonly ratio: string;
}

export type ProductionGraphNode =
  | GraphNodeBase<"project", ProjectNodeData>
  | GraphNodeBase<"reference_asset", ReferenceAssetNodeData>
  | GraphNodeBase<"story_arc", StoryArcNodeData>
  | GraphNodeBase<"sequence", SequenceNodeData>
  | GraphNodeBase<"scene", SceneNodeData>
  | GraphNodeBase<"beat", BeatNodeData>
  | GraphNodeBase<"shot", ShotContract>
  | GraphNodeBase<"clip_render", ClipRenderNodeData>
  | GraphNodeBase<"inspection_report", InspectionReportNodeData>
  | GraphNodeBase<"repair_action", RepairActionNodeData>
  | GraphNodeBase<"deliverable", DeliverableNodeData>;

export interface ProductionGraphEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly type: GraphEdgeType;
  readonly createdAt: Date;
}

export interface ProductionGraphSnapshot {
  readonly nodes: readonly ProductionGraphNode[];
  readonly edges: readonly ProductionGraphEdge[];
}
