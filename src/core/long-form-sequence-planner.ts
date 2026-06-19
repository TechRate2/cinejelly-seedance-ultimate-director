/**
 * Deterministic long-form sequence planner.
 * It groups contiguous scenes into sequence units shared by the Production Graph and continuity evidence.
 */

import type { StoryPlan } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";
import type { ScenePlan } from "./shot-planner.js";

export interface LongFormSequenceGroup {
  readonly sequenceId: string;
  readonly title: string;
  readonly purpose: string;
  readonly targetDurationSeconds: number;
  readonly order: number;
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
    const targetSequenceCount = Math.min(
      input.storyPlan.scenes.length,
      Math.max(1, Math.ceil(input.storyPlan.targetDurationSeconds / 45))
    );
    const groups: LongFormSequenceGroup[] = [];
    let sceneCursor = 0;

    for (let sequenceIndex = 0; sequenceIndex < targetSequenceCount; sequenceIndex += 1) {
      const remainingScenes = input.storyPlan.scenes.length - sceneCursor;
      const remainingSequences = targetSequenceCount - sequenceIndex;
      const scenesInGroup = Math.max(1, Math.ceil(remainingScenes / remainingSequences));
      const scenes = input.storyPlan.scenes.slice(sceneCursor, sceneCursor + scenesInGroup);
      sceneCursor += scenes.length;
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
        purpose: this.sequencePurpose(sequenceIndex, targetSequenceCount),
        targetDurationSeconds,
        order: sequenceIndex,
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
