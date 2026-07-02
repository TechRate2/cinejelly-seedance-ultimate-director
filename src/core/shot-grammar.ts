/**
 * Controlled shot-grammar vocabulary.
 *
 * Explicit framing enums (shot type, camera angle, camera position) instead of free-prose
 * camera text alone. Structured-caption research on short-drama data shows generalist
 * models are weakest exactly here (framing/position fidelity), so making the grammar an
 * explicit, machine-checkable instruction tightens composition and gives inspection a
 * concrete axis to verify. Distilled as original CineJelly vocabulary from the SkyReels
 * SkyCaptioner structured-caption field taxonomy (see external snapshot; methodology
 * reference only, no upstream code).
 */

export type ShotType =
  | "extreme_close_up"
  | "close_up"
  | "medium_shot"
  | "full_shot"
  | "long_shot";

export type ShotAngle = "eye_level" | "high_angle" | "low_angle";

export type ShotPosition =
  | "front_view"
  | "back_view"
  | "side_view"
  | "over_the_shoulder"
  | "overhead_view"
  | "point_of_view";

export interface ShotGrammar {
  readonly shotType: ShotType;
  readonly shotAngle: ShotAngle;
  readonly shotPosition: ShotPosition;
}

const SHOT_TYPE_DIRECTIVES: Record<ShotType, string> = {
  extreme_close_up: "extreme close-up isolating one detail (eyes, hands, product surface) with everything else falling away",
  close_up: "close-up framing the face or product tight enough to read micro-expression and texture",
  medium_shot: "medium shot from roughly the waist up, balancing subject presence and readable context",
  full_shot: "full shot with the entire subject in frame and enough room for body action",
  long_shot: "long shot placing the subject inside the environment with clear spatial context"
};

const SHOT_ANGLE_DIRECTIVES: Record<ShotAngle, string> = {
  eye_level: "camera at the subject's eye level for a neutral, human perspective",
  high_angle: "camera above the subject looking down, reducing the subject's power in frame",
  low_angle: "camera below the subject looking up, giving the subject weight and dominance"
};

const SHOT_POSITION_DIRECTIVES: Record<ShotPosition, string> = {
  front_view: "camera in front of the subject",
  back_view: "camera behind the subject",
  side_view: "camera to the subject's side in profile",
  over_the_shoulder: "camera over one subject's shoulder onto the other subject",
  overhead_view: "camera directly above the scene",
  point_of_view: "camera as the subject's own eyes"
};

/**
 * One embeddable prompt line for the framing grammar. `mode: "strict"` locks the framing
 * for the whole clip (single-framing shots); `mode: "home"` declares it the shot's home
 * framing that per-beat timeline cameras may cut away from and return to — this keeps the
 * grammar from contradicting planner beat cameras when a timeline exists.
 */
export function shotGrammarPromptLine(grammar: ShotGrammar, options?: { readonly mode?: "strict" | "home" }): string {
  const base = `${SHOT_TYPE_DIRECTIVES[grammar.shotType]}; ${SHOT_ANGLE_DIRECTIVES[grammar.shotAngle]}; ${SHOT_POSITION_DIRECTIVES[grammar.shotPosition]}`;
  if (options?.mode === "home") {
    return `Framing grammar (home framing): ${base}. Per-beat timeline cameras may cut to other framings where the timeline says so, but always return to and end on this home framing.`;
  }
  return `Framing grammar (hold exactly): ${base}. Do not drift to a different shot size, angle, or position unless the timeline explicitly cuts.`;
}

/** Parse grammar from loosely-typed metadata values; returns undefined unless all valid. */
export function shotGrammarFromMetadata(metadata: Record<string, unknown> | undefined): ShotGrammar | undefined {
  if (!metadata) {
    return undefined;
  }
  const shotType = metadata.shotType;
  const shotAngle = metadata.shotAngle;
  const shotPosition = metadata.shotPosition;
  if (
    typeof shotType === "string" && Object.hasOwn(SHOT_TYPE_DIRECTIVES, shotType) &&
    typeof shotAngle === "string" && Object.hasOwn(SHOT_ANGLE_DIRECTIVES, shotAngle) &&
    typeof shotPosition === "string" && Object.hasOwn(SHOT_POSITION_DIRECTIVES, shotPosition)
  ) {
    return {
      shotType: shotType as ShotType,
      shotAngle: shotAngle as ShotAngle,
      shotPosition: shotPosition as ShotPosition
    };
  }
  return undefined;
}

/**
 * Sensible framing defaults by video arc role, for planners that want grammar without
 * hand-picking: hooks and climaxes push closer, developments hold medium, endings settle.
 */
export function deriveShotGrammarForArcRole(
  arcRole: "full_video" | "opening_hook" | "development" | "climax" | "closing_resolve"
): ShotGrammar {
  switch (arcRole) {
    case "opening_hook":
      return { shotType: "close_up", shotAngle: "eye_level", shotPosition: "front_view" };
    case "development":
      return { shotType: "medium_shot", shotAngle: "eye_level", shotPosition: "front_view" };
    case "climax":
      return { shotType: "close_up", shotAngle: "low_angle", shotPosition: "front_view" };
    case "closing_resolve":
      return { shotType: "medium_shot", shotAngle: "eye_level", shotPosition: "front_view" };
    case "full_video":
      return { shotType: "medium_shot", shotAngle: "eye_level", shotPosition: "front_view" };
  }
}

export type ArcRoleName = "full_video" | "opening_hook" | "development" | "climax" | "closing_resolve";

/** Ordered shot-type palette per creative mode: how wide the framing range should roam. */
const MODE_SHOT_TYPE_PALETTE: Record<string, readonly ShotType[]> = {
  // Handheld selfie feel: stay tight, no wides.
  ugc_review: ["close_up", "medium_shot", "close_up", "extreme_close_up"],
  testimonial: ["close_up", "medium_shot", "close_up"],
  // Action proof: medium/close, occasional full for the reveal.
  demo: ["medium_shot", "close_up", "full_shot", "medium_shot"],
  comparison: ["medium_shot", "full_shot", "close_up", "medium_shot"],
  problem_solution: ["medium_shot", "close_up", "full_shot", "medium_shot"],
  product_ad: ["medium_shot", "close_up", "full_shot", "extreme_close_up"],
  education: ["medium_shot", "full_shot", "close_up", "medium_shot"],
  // Story/cinematic: full expressive range including wides.
  story: ["full_shot", "medium_shot", "close_up", "long_shot", "medium_shot"],
  cinematic: ["long_shot", "medium_shot", "close_up", "full_shot", "extreme_close_up"]
};

const DEFAULT_SHOT_TYPE_PALETTE: readonly ShotType[] = ["medium_shot", "close_up", "full_shot"];

const ANGLE_CYCLE: readonly ShotAngle[] = ["eye_level", "eye_level", "low_angle", "high_angle"];

/**
 * Plan a per-shot framing sequence for a whole video with deliberate variation.
 *
 * Two cinematic techniques the leading short-drama agents rely on: (1) framing follows the
 * emotional arc — hooks and climaxes push closer, development breathes wider; (2) adjacent
 * shots never repeat the same shot size, because monotone framing is the #1 tell of a
 * cheap AI video. The palette width is chosen by creative mode (UGC stays tight and
 * handheld; cinematic roams from long shots to extreme close-ups).
 */
export function planShotFramingSequence(input: {
  readonly arcRoles: readonly ArcRoleName[];
  readonly creativeMode?: string;
}): readonly ShotGrammar[] {
  const palette =
    (input.creativeMode && MODE_SHOT_TYPE_PALETTE[input.creativeMode]) || DEFAULT_SHOT_TYPE_PALETTE;
  const result: ShotGrammar[] = [];
  let paletteCursor = 0;
  for (let index = 0; index < input.arcRoles.length; index += 1) {
    const arcRole = input.arcRoles[index] ?? "development";
    const roleDefault = deriveShotGrammarForArcRole(arcRole);
    const previousType = result[index - 1]?.shotType;
    // Arc-critical beats keep their expressive role framing; other beats rotate the palette.
    let shotType: ShotType;
    if (arcRole === "opening_hook" || arcRole === "climax") {
      shotType = roleDefault.shotType;
    } else {
      shotType = palette[paletteCursor % palette.length] ?? roleDefault.shotType;
      paletteCursor += 1;
    }
    // Anti-monotony: never repeat the previous shot size two beats in a row.
    if (shotType === previousType) {
      shotType = nextDistinctShotType(palette, shotType, paletteCursor);
      paletteCursor += 1;
    }
    const shotAngle = arcRole === "climax" ? "low_angle" : ANGLE_CYCLE[index % ANGLE_CYCLE.length] ?? "eye_level";
    result.push({ shotType, shotAngle, shotPosition: roleDefault.shotPosition });
  }
  return result;
}

function nextDistinctShotType(palette: readonly ShotType[], avoid: ShotType, cursor: number): ShotType {
  for (let step = 0; step < palette.length; step += 1) {
    const candidate = palette[(cursor + step) % palette.length];
    if (candidate && candidate !== avoid) {
      return candidate;
    }
  }
  // Palette has a single entry: fall back to a guaranteed-different size.
  return avoid === "medium_shot" ? "close_up" : "medium_shot";
}
