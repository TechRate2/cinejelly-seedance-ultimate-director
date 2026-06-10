/**
 * Production Graph Run Recorder.
 * It enriches the planning graph with render, inspection, repair, and deliverable evidence after execution.
 */

import type { RenderCandidate, RenderedShot } from "../types/agent.js";
import type { AssembledDeliverable } from "../types/assembly.js";
import type {
  GraphEdgeType,
  ProductionGraphEdge,
  ProductionGraphNode,
  ProductionGraphSnapshot
} from "../types/graph.js";
import type { GuardianReport, GuardianSeverity } from "../types/guardian.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";
import { now } from "../utils/time.js";

export class ProductionGraphRunRecorder {
  public record(input: {
    readonly graph: ProductionGraphSnapshot;
    readonly renderedShots: readonly RenderedShot[];
    readonly deliverable?: AssembledDeliverable;
    readonly settings: FlexibleSeedanceSettings;
  }): ProductionGraphSnapshot {
    const nodes: ProductionGraphNode[] = [...input.graph.nodes];
    const edges: ProductionGraphEdge[] = [...input.graph.edges];

    for (const renderedShot of input.renderedShots) {
      const shotId = renderedShot.compiledPrompt.shotId;
      const preflightNode = this.inspectionNode(shotId, renderedShot.preflight);
      nodes.push(preflightNode);
      edges.push(this.edge(shotId, preflightNode.id, "depends_on"));
      this.maybeAddRepair(nodes, edges, preflightNode, shotId);

      if (renderedShot.testTake) {
        const testTakeNode = this.clipRenderNode(shotId, renderedShot.testTake, false);
        nodes.push(testTakeNode);
        edges.push(this.edge(shotId, testTakeNode.id, "depends_on"));

        const testTakeInspectionNode = this.inspectionNode(testTakeNode.id, renderedShot.testTake.renderInspection);
        nodes.push(testTakeInspectionNode);
        edges.push(this.edge(testTakeNode.id, testTakeInspectionNode.id, "depends_on"));
        this.maybeAddRepair(nodes, edges, testTakeInspectionNode, shotId);
      }

      for (const candidate of renderedShot.candidates) {
        const selected = candidate.candidateIndex === renderedShot.selectedCandidateIndex;
        const clipNode = this.clipRenderNode(shotId, candidate, selected);
        nodes.push(clipNode);
        edges.push(this.edge(shotId, clipNode.id, "depends_on"));

        const renderInspectionNode = this.inspectionNode(clipNode.id, candidate.renderInspection);
        nodes.push(renderInspectionNode);
        edges.push(this.edge(clipNode.id, renderInspectionNode.id, "depends_on"));
        if (selected) {
          this.maybeAddRepair(nodes, edges, renderInspectionNode, shotId);
        }
      }
    }

    if (input.deliverable) {
      const deliverableNode = this.node("deliverable", createStableId("deliverable", `${input.deliverable.projectId}:${input.deliverable.outputPath}`), {
        outputUrl: input.deliverable.outputPath,
        durationSeconds: input.deliverable.inspection.metadata.durationSeconds ?? 0,
        resolution: this.resolution(input.deliverable),
        ratio: input.settings.ratio
      });
      nodes.push(deliverableNode);
      for (const renderedShot of input.renderedShots) {
        edges.push(this.edge(renderedShot.compiledPrompt.shotId, deliverableNode.id, "depends_on"));
      }
    }

    return { nodes, edges };
  }

  private inspectionNode(parentNodeId: string, report: GuardianReport): Extract<ProductionGraphNode, { type: "inspection_report" }> {
    return this.node("inspection_report", createStableId("inspection", `${parentNodeId}:${report.stage}:${report.status}`), {
      status: report.status,
      findings: report.findings.map((finding) => `${finding.checkpoint}: ${finding.evidence}`),
      severity: this.maxSeverity(report)
    });
  }

  private maybeAddRepair(
    nodes: ProductionGraphNode[],
    edges: ProductionGraphEdge[],
    inspectionNode: Extract<ProductionGraphNode, { type: "inspection_report" }>,
    targetNodeId: string
  ): void {
    if (!["repair", "rerender", "block"].includes(inspectionNode.data.status)) {
      return;
    }
    const repairNode = this.node("repair_action", createStableId("repair", `${targetNodeId}:${inspectionNode.id}:${inspectionNode.data.status}`), {
      scope: inspectionNode.data.status === "block" ? "Global" : "ShotLocal",
      reason: inspectionNode.data.findings[0] ?? `Inspection status ${inspectionNode.data.status}`,
      targetNodeId
    });
    nodes.push(repairNode);
    edges.push(this.edge(inspectionNode.id, repairNode.id, "requires_repair"));
  }

  private maxSeverity(report: GuardianReport): GuardianSeverity {
    const order: Record<GuardianSeverity, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };
    return report.findings.reduce<GuardianSeverity>(
      (max, finding) => (order[finding.severity] < order[max] ? finding.severity : max),
      "S3"
    );
  }

  private costUsd(candidate: RenderCandidate): number | undefined {
    return candidate.prediction.usage?.actualCostUsd ?? candidate.prediction.usage?.estimatedCostUsd;
  }

  private clipRenderNode(
    shotId: string,
    candidate: RenderCandidate,
    selected: boolean
  ): Extract<ProductionGraphNode, { type: "clip_render" }> {
    const costUsd = this.costUsd(candidate);
    return this.node(
      "clip_render",
      createStableId("clip_render", `${shotId}:${candidate.testTake ? "test_take" : candidate.candidateIndex}:${candidate.prediction.predictionId}`),
      {
        provider: candidate.prediction.provider,
        modelId: candidate.prediction.modelId,
        predictionId: candidate.prediction.predictionId,
        status: candidate.prediction.status,
        outputUrls: candidate.prediction.outputUrls,
        candidateIndex: candidate.candidateIndex,
        ...(candidate.repairAttempt !== undefined ? { repairAttempt: candidate.repairAttempt } : {}),
        ...(candidate.testTake ? { testTake: true } : {}),
        selected,
        ...(costUsd !== undefined ? { costUsd } : {})
      }
    );
  }

  private resolution(deliverable: AssembledDeliverable): string {
    const video = deliverable.inspection.metadata.streams.find((stream) => stream.type === "video");
    return video?.width && video.height ? `${video.width}x${video.height}` : "unknown";
  }

  private node<TNode extends ProductionGraphNode["type"]>(
    type: TNode,
    id: string,
    data: Extract<ProductionGraphNode, { type: TNode }>["data"]
  ): Extract<ProductionGraphNode, { type: TNode }> {
    const timestamp = now();
    return {
      id,
      type,
      data,
      createdAt: timestamp,
      updatedAt: timestamp
    } as Extract<ProductionGraphNode, { type: TNode }>;
  }

  private edge(fromNodeId: string, toNodeId: string, type: GraphEdgeType): ProductionGraphEdge {
    return {
      id: createStableId("edge", `${fromNodeId}:${toNodeId}:${type}`),
      fromNodeId,
      toNodeId,
      type,
      createdAt: now()
    };
  }
}
