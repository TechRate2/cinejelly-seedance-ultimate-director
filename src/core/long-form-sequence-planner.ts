/**
 * Deterministic long-form sequence planner.
 * It groups contiguous scenes into sequence units shared by the Production Graph and continuity evidence.
 */

import type { StoryPlan } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";
import { segmentScenesSemantic } from "./semantic-sequence-segmenter.js";
import type { ScenePlan } from "./shot-planner.js";

export interface LongFormSequenceGroup {
  readonly sequenceId: string;
  readonly title: string;
  readonly purpose: string;
  readonly targetDurationSeconds: number;
  readonly order: number;
  /** How this sequence's boundary was chosen (narrative-aware vs even fallback). */
  readonly boundaryReason: string;
  readonly scenes: readonly ScenePlan[];
}

export class LongFormSequencePlanner {
  public plan(input: {
    readonly projectId: string;
    readonly storyPlan: StoryPlan;
  }): readonly LongFormSequenceGroup[] {
    if (input.storyPlan.scenes.length === 0) {
      return [];
    }
    // Narrative-aware segmentation (ViMax essence): group scenes at story boundaries inside
    // a target duration band instead of arbitrary fixed-time slices.
    const boundaries = segmentScenesSemantic({
      scenes: input.storyPlan.scenes,
      targetSequenceSeconds: 45
    });
    const groups: LongFormSequenceGroup[] = [];

    for (let sequenceIndex = 0; sequenceIndex < boundaries.length; sequenceIndex += 1) {
      const boundary = boundaries[sequenceIndex];
      if (!boundary) {
        continue;
      }
      const scenes = input.storyPlan.scenes.slice(boundary.startSceneIndex, boundary.startSceneIndex + boundary.sceneCount);
      const firstScene = scenes[0];
      const lastScene = scenes[scenes.length - 1];
      const targetDurationSeconds = scenes.reduce(
        (sum, scene) => sum + scene.beats.reduce((beatSum, beat) => beatSum + beat.durationSeconds, 0),
        0
      );

      groups.push({
        sequenceId: createStableId("sequence", `${input.projectId}:${sequenceIndex}:${scenes.map((scene) => scene.sceneId).join("|")}`),
        title: firstScene && lastScene && firstScene.sceneId !== lastScene.sceneId
          ? `${firstScene.title} to ${lastScene.title}`
          : firstScene?.title ?? `Sequence ${sequenceIndex + 1}`,
        purpose: this.sequencePurpose(sequenceIndex, boundaries.length),
        targetDurationSeconds,
        order: sequenceIndex,
        boundaryReason: boundary.boundaryReason,
        scenes
      });
    }

    return groups;
  }

  private sequencePurpose(sequenceIndex: number, sequenceCount: number): string {
    if (sequenceCount === 1) {
      return "complete long-form story arc";
    }
    if (sequenceIndex === 0) {
      return "hook, setup, and context";
    }
    if (sequenceIndex === sequenceCount - 1) {
      return "payoff, proof, and delivery";
    }
    return "progressive story development and continuity bridge";
  }
}
