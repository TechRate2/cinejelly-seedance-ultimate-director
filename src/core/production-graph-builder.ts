/**
 * Production Graph Builder.
 * It turns the planned story and shot contracts into a graph snapshot for audit, repair, and long-form continuity.
 */

import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { GraphEdgeType, ProductionGraphNode, ProductionGraphSnapshot } from "../types/graph.js";
import type { GuardianReport, GuardianSeverity } from "../types/guardian.js";
import type { PromptReference, ShotContract } from "../types/prompt.js";
import type { Storyboard } from "../types/storyboard.js";
import { createStableId } from "../utils/ids.js";
import { now } from "../utils/time.js";
import { ProductionGraph } from "./production-graph.js";

export class ProductionGraphBuilder {
  public build(input: {
    readonly intake: IntakeResult;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
    readonly storyboard?: Storyboard;
    readonly storyboardPreflight?: GuardianReport;
  }): ProductionGraphSnapshot {
    const graph = new ProductionGraph();
    const projectNode = this.node("project", input.intake.projectId, {
      userInput: input.intake.userInput,
      settings: input.intake.settings,
      targetDurationSeconds: input.storyPlan.targetDurationSeconds,
      ...(input.intake.metadata ? { metadata: input.intake.metadata } : {}),
      ...(input.intake.sourceVideoAnalysis ? { sourceVideoAnalysis: input.intake.sourceVideoAnalysis } : {})
    });
    const storyNodeId = createStableId("story", `${input.intake.projectId}:${input.storyPlan.premise}`);
    const storyNode = this.node("story_arc", storyNodeId, {
      premise: input.storyPlan.premise
    });

    graph.addNode(projectNode);
    graph.addNode(storyNode);
    graph.addEdge(projectNode.id, storyNode.id, "depends_on");
    if (input.storyboardPreflight) {
      const inspectionNode = this.inspectionNode(input.intake.projectId, input.storyboardPreflight);
      graph.addNode(inspectionNode);
      graph.addEdge(storyNode.id, inspectionNode.id, "depends_on");
    }

    const referenceNodeIds = this.addReferenceNodes({
      graph,
      projectId: input.intake.projectId,
      projectNodeId: projectNode.id,
      references: input.intake.references
    });

    const shotNodes: ProductionGraphNode[] = [];
    for (const [sceneIndex, scene] of input.storyPlan.scenes.entries()) {
      const sceneNodeId = createStableId("scene", `${input.intake.projectId}:${scene.sceneId}`);
      const sceneNode = this.node("scene", sceneNodeId, {
        title: scene.title,
        narrativeFunction: scene.title,
        targetDurationSeconds: scene.beats.reduce((sum, beat) => sum + beat.durationSeconds, 0),
        order: sceneIndex
      });
      graph.addNode(sceneNode);
      graph.addEdge(storyNode.id, sceneNode.id, "depends_on");

      for (const [beatIndex, beat] of scene.beats.entries()) {
        const beatNodeId = createStableId("beat", `${sceneNodeId}:${beat.beatId}`);
        const beatNode = this.node("beat", beatNodeId, {
          purpose: beat.purpose,
          action: beat.action,
          targetDurationSeconds: beat.durationSeconds,
          order: beatIndex
        });
        graph.addNode(beatNode);
        graph.addEdge(sceneNode.id, beatNode.id, "depends_on");

        const beatShots = input.shots.filter((shot) => shot.beatId === beat.beatId && shot.sceneId === scene.sceneId);
        for (const shot of beatShots) {
          const storyboardPanel = input.storyboard?.panels.find((panel) => panel.shotId === shot.shotId);
          const storyboardNode = storyboardPanel ? this.node("storyboard_panel", storyboardPanel.panelId, storyboardPanel) : undefined;
          const shotNode = this.node("shot", shot.shotId, shot);
          if (storyboardNode) {
            graph.addNode(storyboardNode);
            graph.addEdge(beatNode.id, storyboardNode.id, "depends_on");
          }
          graph.addNode(shotNode);
          graph.addEdge(storyboardNode?.id ?? beatNode.id, shotNode.id, "depends_on");
          this.addReferenceEdges({
            graph,
            shot,
            shotNodeId: shotNode.id,
            referenceNodeIds
          });
          shotNodes.push(shotNode);
        }
      }
    }

    for (let index = 0; index < shotNodes.length - 1; index += 1) {
      const current = shotNodes[index];
      const next = shotNodes[index + 1];
      if (current && next) {
        graph.addEdge(current.id, next.id, "transitions_to");
      }
    }

    return graph.snapshot();
  }

  private addReferenceNodes(input: {
    readonly graph: ProductionGraph;
    readonly projectId: string;
    readonly projectNodeId: string;
    readonly references: readonly PromptReference[];
  }): ReadonlyMap<string, string> {
    const referenceNodeIds = new Map<string, string>();

    for (const reference of input.references) {
      const referenceKey = this.referenceKey(reference);
      const nodeId = createStableId("reference", `${input.projectId}:${referenceKey}`);
      const referenceNode = this.node("reference_asset", nodeId, {
        reference: reference.providerReference,
        role: reference.role,
        label: reference.label,
        priority: reference.priority,
        lineage: "user_reference",
        validated: true
      });
      input.graph.addNode(referenceNode);
      input.graph.addEdge(input.projectNodeId, referenceNode.id, "depends_on");
      referenceNodeIds.set(referenceKey, referenceNode.id);
    }

    return referenceNodeIds;
  }

  private addReferenceEdges(input: {
    readonly graph: ProductionGraph;
    readonly shot: ShotContract;
    readonly shotNodeId: string;
    readonly referenceNodeIds: ReadonlyMap<string, string>;
  }): void {
    for (const reference of input.shot.references) {
      const referenceNodeId = input.referenceNodeIds.get(this.referenceKey(reference));
      if (!referenceNodeId) {
        continue;
      }
      input.graph.addEdge(referenceNodeId, input.shotNodeId, "depends_on");
      const edgeType = this.referenceEdgeType(reference.role);
      if (edgeType) {
        input.graph.addEdge(referenceNodeId, input.shotNodeId, edgeType);
      }
    }
  }

  private referenceEdgeType(role: PromptReference["role"]): GraphEdgeType | undefined {
    if (role === "identity" || role === "wardrobe") {
      return "continues_identity";
    }
    if (role === "environment" || role === "style") {
      return "continues_environment";
    }
    if (["motion", "camera", "audio_tempo", "voice", "source_video_structure"].includes(role)) {
      return "matches_motion";
    }
    return undefined;
  }

  private referenceKey(reference: PromptReference): string {
    return [
      reference.role,
      reference.label.toLowerCase(),
      reference.providerReference.kind,
      reference.providerReference.providerAssetId ?? reference.providerReference.uri
    ].join(":");
  }

  private inspectionNode(
    projectId: string,
    report: GuardianReport
  ): Extract<ProductionGraphNode, { type: "inspection_report" }> {
    return this.node("inspection_report", createStableId("inspection", `${projectId}:${report.stage}:${report.status}`), {
      status: report.status,
      findings: report.findings.map((finding) => `${finding.checkpoint}: ${finding.evidence}`),
      severity: this.maxSeverity(report)
    });
  }

  private maxSeverity(report: GuardianReport): GuardianSeverity {
    const order: Record<GuardianSeverity, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };
    return report.findings.reduce<GuardianSeverity>(
      (max, finding) => (order[finding.severity] < order[max] ? finding.severity : max),
      "S3"
    );
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
}
