/**
 * Semantic long-form scene segmentation.
 *
 * Distilled from ViMax's retrieval-driven long-script segmentation: instead of slicing a
 * long story into fixed-duration windows, group contiguous scenes at NARRATIVE boundaries
 * — where the dominant subject shifts, the beat purpose changes act (setup -> development
 * -> proof -> resolution), or an explicit act marker appears — while keeping each sequence
 * inside a target duration band so no unit runs too long or too short.
 *
 * Fully deterministic and no-spend: the "topic signature" is derived from the scene's own
 * subjects and purpose keywords (no embedding model / paid LLM call). It is heuristic-
 * semantic, not vector-RAG, but it produces coherent narrative units instead of arbitrary
 * time slices, which is the creative essence the pipeline was missing.
 */

import type { ScenePlan } from "./shot-planner.js";

export interface SemanticSequenceBoundary {
  /** Index of the first scene in this sequence (into the original scene array). */
  readonly startSceneIndex: number;
  /** Number of scenes in this sequence. */
  readonly sceneCount: number;
  /** Why a boundary was opened here, for evidence/telemetry. */
  readonly boundaryReason: "start" | "subject_shift" | "act_shift" | "duration_band" | "act_marker";
  readonly targetDurationSeconds: number;
}

const SETUP_PURPOSE_TERMS = ["hook", "setup", "intro", "open", "context", "establish", "cold"];
const DEVELOPMENT_PURPOSE_TERMS = ["develop", "explore", "build", "rise", "middle", "demo", "process", "explain"];
const PROOF_PURPOSE_TERMS = ["proof", "peak", "climax", "reveal", "turn", "twist", "payoff", "result"];
const RESOLUTION_PURPOSE_TERMS = ["resolve", "close", "ending", "settle", "cta", "outro", "wrap", "final"];

type NarrativeAct = "setup" | "development" | "proof" | "resolution" | "neutral";

/**
 * Segment scenes into narrative sequences. `targetSequenceSeconds` is the preferred length
 * of one unit (default ~45s); a sequence is closed when the topic shifts OR the band is
 * exceeded, whichever comes first, and never splits below `minSequenceSeconds`.
 */
export function segmentScenesSemantic(input: {
  readonly scenes: readonly ScenePlan[];
  readonly targetSequenceSeconds?: number;
  readonly minSequenceSeconds?: number;
}): readonly SemanticSequenceBoundary[] {
  if (input.scenes.length === 0) {
    return [];
  }
  const targetSeconds = Math.max(10, input.targetSequenceSeconds ?? 45);
  const minSeconds = Math.max(5, Math.min(input.minSequenceSeconds ?? 20, targetSeconds));

  const boundaries: SemanticSequenceBoundary[] = [];
  let startIndex = 0;
  let accumulatedSeconds = 0;
  let currentReason: SemanticSequenceBoundary["boundaryReason"] = "start";
  let previousSignature = sceneSignature(input.scenes[0] as ScenePlan);

  for (let index = 0; index < input.scenes.length; index += 1) {
    const scene = input.scenes[index] as ScenePlan;
    const signature = sceneSignature(scene);
    const sceneSeconds = sceneDurationSeconds(scene);

    if (index > startIndex) {
      const belowFloor = accumulatedSeconds < minSeconds;
      // Predictive band: split BEFORE a scene that would push the group past the target,
      // so groups stay near the target length instead of overshooting by a whole scene.
      const wouldOverBand = accumulatedSeconds + sceneSeconds > targetSeconds && accumulatedSeconds >= minSeconds;
      const actShift = signature.act !== previousSignature.act && signature.act !== "neutral" && previousSignature.act !== "neutral";
      const subjectShift = !sharesSubject(signature.subjects, previousSignature.subjects);
      const actMarker = signature.hasActMarker;

      // A boundary opens when the topic genuinely shifts (and we are past the floor), or
      // when adding this scene would fill the duration band regardless of topic.
      let reason: SemanticSequenceBoundary["boundaryReason"] | undefined;
      if (actMarker && !belowFloor) {
        reason = "act_marker";
      } else if (wouldOverBand) {
        reason = "duration_band";
      } else if (!belowFloor && actShift) {
        reason = "act_shift";
      } else if (!belowFloor && subjectShift && accumulatedSeconds >= targetSeconds * 0.6) {
        reason = "subject_shift";
      }

      if (reason) {
        boundaries.push({
          startSceneIndex: startIndex,
          sceneCount: index - startIndex,
          boundaryReason: currentReason,
          targetDurationSeconds: round1(accumulatedSeconds)
        });
        startIndex = index;
        accumulatedSeconds = 0;
        currentReason = reason;
      }
    }

    accumulatedSeconds += sceneSeconds;
    previousSignature = signature;
  }

  boundaries.push({
    startSceneIndex: startIndex,
    sceneCount: input.scenes.length - startIndex,
    boundaryReason: currentReason,
    targetDurationSeconds: round1(accumulatedSeconds)
  });

  return boundaries;
}

interface SceneSignature {
  readonly subjects: ReadonlySet<string>;
  readonly act: NarrativeAct;
  readonly hasActMarker: boolean;
}

function sceneSignature(scene: ScenePlan): SceneSignature {
  const subjects = new Set<string>();
  const actVotes: Record<NarrativeAct, number> = { setup: 0, development: 0, proof: 0, resolution: 0, neutral: 0 };
  let hasActMarker = false;

  for (const beat of scene.beats ?? []) {
    for (const token of tokenize(beat.subject)) {
      subjects.add(token);
    }
    const act = actForText(`${beat.purpose ?? ""} ${beat.action ?? ""}`);
    actVotes[act] += 1;
  }
  if (/\b(act|chapter|part|episode|scene)\s*\d|hồi\s*\d|chương\s*\d/iu.test(scene.title ?? "")) {
    hasActMarker = true;
  }

  const act = (Object.entries(actVotes) as [NarrativeAct, number][])
    .filter(([name]) => name !== "neutral")
    .sort((left, right) => right[1] - left[1])[0];
  return {
    subjects,
    act: act && act[1] > 0 ? act[0] : "neutral",
    hasActMarker
  };
}

function actForText(text: string): NarrativeAct {
  const lower = (text ?? "").toLowerCase();
  if (PROOF_PURPOSE_TERMS.some((term) => lower.includes(term))) {
    return "proof";
  }
  if (RESOLUTION_PURPOSE_TERMS.some((term) => lower.includes(term))) {
    return "resolution";
  }
  if (SETUP_PURPOSE_TERMS.some((term) => lower.includes(term))) {
    return "setup";
  }
  if (DEVELOPMENT_PURPOSE_TERMS.some((term) => lower.includes(term))) {
    return "development";
  }
  return "neutral";
}

function sharesSubject(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) {
    return true;
  }
  for (const token of a) {
    if (b.has(token)) {
      return true;
    }
  }
  return false;
}

const STOPWORDS = new Set(["the", "a", "an", "and", "with", "of", "in", "on", "at", "to", "và", "của", "một", "các", "người"]);

function tokenize(value: string | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function sceneDurationSeconds(scene: ScenePlan): number {
  return (scene.beats ?? []).reduce((sum, beat) => sum + (Number.isFinite(beat.durationSeconds) ? beat.durationSeconds : 0), 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
