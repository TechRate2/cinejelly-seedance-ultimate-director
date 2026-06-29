/**
 * Long-form continuity planner.
 * It creates a sequence-level continuity bible before render so long videos keep story, identity,
 * product, environment, style, source-video, and risk anchors visible.
 */

import type { StoryPlan } from "../types/agent.js";
import type {
  LongFormContinuityAnchors,
  LongFormContinuityPlan,
  LongFormContinuitySequence,
  LongFormSequenceBridge,
  LongFormSequenceRenderModeRecommendation
} from "../types/long-form-continuity.js";
import type { ContinuityRisk, PromptReference, ShotContract } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import { LongFormSequencePlanner } from "./long-form-sequence-planner.js";
import type { BeatPlan } from "./shot-planner.js";
import {
  internalSourcePatternOrigins,
  LONG_FORM_REVIEW_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_FORM_REVIEW_SOURCE_PATTERN_IDS);

export class LongFormContinuityPlanner {
  private readonly sequencePlanner: LongFormSequencePlanner;

  public constructor(input: { readonly sequencePlanner?: LongFormSequencePlanner } = {}) {
    this.sequencePlanner = input.sequencePlanner ?? new LongFormSequencePlanner();
  }

  public build(input: {
    readonly projectId: string;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
    readonly references?: readonly PromptReference[];
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
  }): LongFormContinuityPlan {
    const groups = this.sequencePlanner.plan({
      projectId: input.projectId,
      storyPlan: input.storyPlan
    });
    const sequencesWithoutBridges = groups.map((group) => {
      const sceneIds = group.scenes.map((scene) => scene.sceneId);
      const beats = group.scenes.flatMap((scene) => scene.beats);
      const beatIds = beats.map((beat) => beat.beatId);
      const shots = input.shots.filter((shot) => shot.sceneId && sceneIds.includes(shot.sceneId));
      const anchors = this.sequenceAnchors(beats, shots, input.references ?? []);
      const riskCodes = uniqueValues(shots.flatMap((shot) => shot.risks));
      return {
        sequenceId: group.sequenceId,
        title: group.title,
        purpose: group.purpose,
        order: group.order,
        targetDurationSeconds: group.targetDurationSeconds,
        sceneIds,
        beatIds,
        shotIds: shots.map((shot) => shot.shotId),
        openingBeat: this.beatSummary(beats[0]),
        closingBeat: this.beatSummary(beats[beats.length - 1]),
        anchors,
        riskCodes,
        renderModeRecommendation: this.renderModeRecommendation(riskCodes, anchors)
      } satisfies Omit<LongFormContinuitySequence, "bridgeToNext">;
    });
    const sequences = sequencesWithoutBridges.map((sequence, index): LongFormContinuitySequence => {
      const nextSequence = sequencesWithoutBridges[index + 1];
      return {
        ...sequence,
        ...(nextSequence ? { bridgeToNext: this.bridge(sequence, nextSequence) } : {})
      };
    });
    const globalAnchors = mergeAnchors(sequences.map((sequence) => sequence.anchors));

    return {
      schemaVersion: "cinejelly.long-form-continuity.v1",
      projectId: input.projectId,
      targetDurationSeconds: input.storyPlan.targetDurationSeconds,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      sequenceCount: sequences.length,
      sceneCount: input.storyPlan.scenes.length,
      beatCount: input.storyPlan.scenes.reduce((sum, scene) => sum + scene.beats.length, 0),
      shotCount: input.shots.length,
      highRiskSequenceCount: sequences.filter((sequence) => sequence.renderModeRecommendation === "sequential_recommended").length,
      sourceVideoAnchorCount: globalAnchors.sourceVideoSceneIds.length + (input.sourceVideoAnalysis?.scenes?.length ?? 0),
      bridgeCount: sequences.filter((sequence) => Boolean(sequence.bridgeToNext)).length,
      globalAnchors: {
        ...globalAnchors,
        sourceVideoSceneIds: uniqueValues([
          ...globalAnchors.sourceVideoSceneIds,
          ...(input.sourceVideoAnalysis?.scenes ?? []).map((scene) => scene.sceneId)
        ])
      },
      sequences
    };
  }

  private sequenceAnchors(
    beats: readonly BeatPlan[],
    shots: readonly ShotContract[],
    projectReferences: readonly PromptReference[]
  ): LongFormContinuityAnchors {
    const references = [...projectReferences, ...shots.flatMap((shot) => shot.references)];
    return {
      identity: uniqueValues([
        ...beats.map((beat) => beat.continuity.identity),
        ...shots.map((shot) => shot.continuity.identity),
        ...references.filter((reference) => reference.role === "identity" || reference.role === "wardrobe").map((reference) => reference.label)
      ]),
      product: uniqueValues([
        ...beats.map((beat) => beat.continuity.product),
        ...shots.map((shot) => shot.continuity.product),
        ...references.filter((reference) => reference.role === "product").map((reference) => reference.label)
      ]),
      environment: uniqueValues([
        ...beats.map((beat) => beat.continuity.environment),
        ...shots.map((shot) => shot.continuity.environment),
        ...references.filter((reference) => reference.role === "environment").map((reference) => reference.label)
      ]),
      style: uniqueValues([
        ...beats.map((beat) => beat.style),
        ...beats.map((beat) => beat.continuity.style),
        ...shots.map((shot) => shot.style),
        ...shots.map((shot) => shot.continuity.style),
        ...references.filter((reference) => reference.role === "style").map((reference) => reference.label)
      ]),
      sourceVideoSceneIds: uniqueValues(
        references
          .filter((reference) => reference.role === "source_video_structure")
          .map((reference) => reference.selection?.sourceSceneId)
      )
    };
  }

  private beatSummary(beat: BeatPlan | undefined): string {
    if (!beat) {
      return "No beat evidence.";
    }
    return `${beat.purpose}: ${beat.action}`.replace(/\s+/g, " ").trim();
  }

  private renderModeRecommendation(
    riskCodes: readonly ContinuityRisk[],
    anchors: LongFormContinuityAnchors
  ): LongFormSequenceRenderModeRecommendation {
    return riskCodes.length > 0 || anchors.sourceVideoSceneIds.length > 0 ? "sequential_recommended" : "parallel_safe";
  }

  private bridge(
    current: Omit<LongFormContinuitySequence, "bridgeToNext">,
    next: Omit<LongFormContinuitySequence, "bridgeToNext">
  ): LongFormSequenceBridge {
    const sharedAnchors = sharedAnchorLabels(current.anchors, next.anchors);
    const requiredAnchors = sharedAnchors.length > 0
      ? sharedAnchors
      : uniqueValues([
          ...current.anchors.identity,
          ...current.anchors.product,
          ...current.anchors.environment,
          ...current.anchors.style
        ]).slice(0, 4);
    return {
      nextSequenceId: next.sequenceId,
      bridgeIntent: [
        `${current.closingBeat} -> ${next.openingBeat}`,
        "Preserve shared anchors, screen direction, camera momentum, lighting color, room tone, product/KOL scale, and endpoint action state so the sequence cut feels continuous."
      ].join(". ").slice(0, 420),
      requiredAnchors
    };
  }
}

function mergeAnchors(values: readonly LongFormContinuityAnchors[]): LongFormContinuityAnchors {
  return {
    identity: uniqueValues(values.flatMap((value) => value.identity)),
    product: uniqueValues(values.flatMap((value) => value.product)),
    environment: uniqueValues(values.flatMap((value) => value.environment)),
    style: uniqueValues(values.flatMap((value) => value.style)),
    sourceVideoSceneIds: uniqueValues(values.flatMap((value) => value.sourceVideoSceneIds))
  };
}

function sharedAnchorLabels(left: LongFormContinuityAnchors, right: LongFormContinuityAnchors): readonly string[] {
  const rightLabels = new Set(
    [
      ...right.identity,
      ...right.product,
      ...right.environment,
      ...right.style,
      ...right.sourceVideoSceneIds
    ].map((value) => value.toLowerCase())
  );
  return uniqueValues([
    ...left.identity,
    ...left.product,
    ...left.environment,
    ...left.style,
    ...left.sourceVideoSceneIds
  ]).filter((value) => rightLabels.has(value.toLowerCase()));
}

function uniqueValues<T extends string>(values: readonly (T | string | undefined)[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized as T);
  }
  return result;
}
