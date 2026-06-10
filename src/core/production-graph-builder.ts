/**
 * Production Graph Builder.
 * It turns the planned story and shot contracts into a graph snapshot for audit, repair, and long-form continuity.
 */

import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ProductionGraphNode, ProductionGraphSnapshot } from "../types/graph.js";
import type { ShotContract } from "../types/prompt.js";
import { createStableId } from "../utils/ids.js";
import { now } from "../utils/time.js";
import { ProductionGraph } from "./production-graph.js";

export class ProductionGraphBuilder {
  public build(input: {
    readonly intake: IntakeResult;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
  }): ProductionGraphSnapshot {
    const graph = new ProductionGraph();
    const projectNode = this.node("project", input.intake.projectId, {
      userInput: input.intake.userInput,
      settings: input.intake.settings,
      targetDurationSeconds: input.storyPlan.targetDurationSeconds
    });
    const storyNodeId = createStableId("story", `${input.intake.projectId}:${input.storyPlan.premise}`);
    const storyNode = this.node("story_arc", storyNodeId, {
      premise: input.storyPlan.premise
    });

    graph.addNode(projectNode);
    graph.addNode(storyNode);
    graph.addEdge(projectNode.id, storyNode.id, "depends_on");

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
          const shotNode = this.node("shot", shot.shotId, shot);
          graph.addNode(shotNode);
          graph.addEdge(beatNode.id, shotNode.id, "depends_on");
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
