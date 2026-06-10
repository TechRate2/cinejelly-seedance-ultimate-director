/**
 * Storyboard Planner.
 * Extension based on ViMax storyboard planning and VibeFrame source-of-truth artifacts:
 * generate deterministic, reviewable storyboard panels from shot contracts before render spend.
 */

import type { StoryPlan } from "../types/agent.js";
import type { ShotContract } from "../types/prompt.js";
import type { Storyboard, StoryboardPanel } from "../types/storyboard.js";
import { createStableId } from "../utils/ids.js";

export interface StoryboardPlanningInput {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly shots: readonly ShotContract[];
}

export class StoryboardPlanner {
  public plan(input: StoryboardPlanningInput): Storyboard {
    return {
      projectId: input.projectId,
      createdAt: new Date(),
      panels: this.orderedShots(input).map((shot, index) => this.panelForShot(input.projectId, shot, index))
    };
  }

  private orderedShots(input: StoryboardPlanningInput): readonly ShotContract[] {
    const order = new Map<string, number>();
    let cursor = 0;
    for (const scene of input.storyPlan.scenes) {
      for (const beat of scene.beats) {
        order.set(`${scene.sceneId}:${beat.beatId}`, cursor);
        cursor += 1;
      }
    }
    return input.shots.map((shot, index) => ({ shot, index })).sort((leftItem, rightItem) => {
      const left = leftItem.shot;
      const right = rightItem.shot;
      const leftKey = `${left.sceneId ?? ""}:${left.beatId ?? ""}`;
      const rightKey = `${right.sceneId ?? ""}:${right.beatId ?? ""}`;
      const beatOrder = (order.get(leftKey) ?? Number.MAX_SAFE_INTEGER) - (order.get(rightKey) ?? Number.MAX_SAFE_INTEGER);
      if (beatOrder !== 0) {
        return beatOrder;
      }
      return leftItem.index - rightItem.index;
    }).map((item) => item.shot);
  }

  private panelForShot(projectId: string, shot: ShotContract, order: number): StoryboardPanel {
    const visualDescription = [
      shot.subject,
      shot.style ? `styled as ${shot.style}` : undefined,
      `with ${shot.lighting}`,
      `captured by ${shot.camera}`
    ].filter((part): part is string => Boolean(part && part.trim())).join("; ");

    return {
      panelId: createStableId("storyboard_panel", `${projectId}:${shot.shotId}`),
      shotId: shot.shotId,
      ...(shot.sceneId ? { sceneId: shot.sceneId } : {}),
      ...(shot.beatId ? { beatId: shot.beatId } : {}),
      order,
      durationSeconds: shot.durationSeconds,
      visualDescription,
      action: shot.action,
      camera: shot.camera,
      lighting: shot.lighting,
      continuity: shot.continuity,
      referenceBindings: shot.references.map((reference) => ({
        role: reference.role,
        label: reference.label,
        priority: reference.priority
      })),
      ...(shot.transitionIntent ? { transitionIntent: shot.transitionIntent } : {}),
      inspectionFocus: this.inspectionFocus(shot)
    };
  }

  private inspectionFocus(shot: ShotContract): readonly string[] {
    const focus = new Set<string>([
      "shot intent is visually legible",
      "camera and lighting match the storyboard panel",
      "start and end states remain edit-safe"
    ]);
    for (const reference of shot.references) {
      focus.add(`${reference.role} reference ${reference.label} remains recognizable`);
    }
    for (const risk of shot.risks) {
      focus.add(`${risk} risk is controlled before final assembly`);
    }
    if (shot.continuity.identity) {
      focus.add("identity continuity is preserved");
    }
    if (shot.continuity.product) {
      focus.add("product geometry and brand-relevant details are preserved");
    }
    if (shot.continuity.environment) {
      focus.add("environment continuity is preserved");
    }
    return [...focus];
  }
}
