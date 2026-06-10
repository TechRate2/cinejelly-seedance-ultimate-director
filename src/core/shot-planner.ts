/**
 * Shot Planner for converting scene and beat plans into renderable ShotContracts.
 * It implements long-form chunking without hardcoded niche templates.
 */

import type { ContinuityRisk, PromptReference, ShotContract, ShotContinuity } from "../types/prompt.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";
import { planDurationChunks } from "./chunking.js";

export interface BeatPlan {
  readonly beatId: string;
  readonly purpose: string;
  readonly action: string;
  readonly subject: string;
  readonly camera: string;
  readonly lighting: string;
  readonly style?: string;
  readonly audioIntent?: string;
  readonly durationSeconds: number;
  readonly risks: readonly ContinuityRisk[];
  readonly references: readonly PromptReference[];
  readonly continuity: ShotContinuity;
}

export interface ScenePlan {
  readonly sceneId: string;
  readonly title: string;
  readonly beats: readonly BeatPlan[];
}

export interface ShotPlanningInput {
  readonly projectId: string;
  readonly scenes: readonly ScenePlan[];
  readonly settings: FlexibleSeedanceSettings;
}

export class ShotPlanner {
  public plan(input: ShotPlanningInput): readonly ShotContract[] {
    return input.scenes.flatMap((scene) =>
      scene.beats.flatMap((beat) => this.planBeat(input.projectId, scene.sceneId, beat, input.settings))
    );
  }

  private planBeat(
    projectId: string,
    sceneId: string,
    beat: BeatPlan,
    settings: FlexibleSeedanceSettings
  ): readonly ShotContract[] {
    const highRisk = beat.risks.length > 0;
    const chunks = planDurationChunks({
      totalDurationSeconds: beat.durationSeconds,
      qualityMode: settings.qualityMode,
      highRisk
    });

    return chunks.map((chunk) => ({
      shotId: createStableId("shot", `${projectId}:${sceneId}:${beat.beatId}:${chunk.index}`),
      sceneId,
      beatId: beat.beatId,
      durationSeconds: chunk.durationSeconds,
      intent: beat.purpose,
      subject: beat.subject,
      action: this.chunkAction(beat.action, chunk.index, chunks.length),
      camera: beat.camera,
      lighting: beat.lighting,
      ...(beat.style ? { style: beat.style } : {}),
      ...(beat.audioIntent ? { audioIntent: beat.audioIntent } : {}),
      transitionIntent: this.transitionIntentForChunk(chunk.index, chunks.length),
      references: beat.references,
      continuity: beat.continuity,
      risks: beat.risks,
      metadata: {
        projectId,
        graphNodeId: `${sceneId}:${beat.beatId}`,
        shotId: `${beat.beatId}:${chunk.index}`
      }
    }));
  }

  private chunkAction(action: string, chunkIndex: number, totalChunks: number): string {
    if (totalChunks === 1) {
      return action;
    }
    if (chunkIndex === 0) {
      return `${action}; establish the beginning of the beat with clear subject state`;
    }
    if (chunkIndex === totalChunks - 1) {
      return `${action}; complete the beat and settle into the planned end state`;
    }
    return `${action}; continue the beat without changing identity, product, or environment anchors`;
  }

  private transitionIntentForChunk(chunkIndex: number, totalChunks: number): string {
    if (totalChunks === 1) {
      return "Preserve clean start and end handles for editing.";
    }
    if (chunkIndex === 0) {
      return "End with a stable state that can anchor the next chunk.";
    }
    if (chunkIndex === totalChunks - 1) {
      return "Start from the previous chunk state and end with an edit-safe handle.";
    }
    return "Maintain continuous motion from the previous chunk into the next chunk.";
  }
}
