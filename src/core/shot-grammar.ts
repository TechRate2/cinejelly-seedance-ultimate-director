/**
 * Controlled shot-grammar vocabulary.
 *
 * Explicit framing enums (shot type, camera angle, camera position) instead of free-prose
 * camera text alone. Structured-caption research on short-drama data shows generalist
 * models are weakest exactly here (framing/position fidelity), so making the grammar an
 * explicit, machine-checkable instruction tightens composition and gives inspection a
 * concrete axis to verify. Original CineJelly vocabulary distilled from credited
 * structured-caption methodology (attribution in docs/CREDITS.md; no upstream code).
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

/** SkyCaptioner structured camera-motion field (the low-accuracy axis worth pinning). */
export type CameraMotion =
  | "static"
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "tracking"
  | "handheld"
  | "orbit"
  | "crane"
  // Workhorse commercial moves that were missing: lateral truck, vertical pedestal, and OPTICAL
  // zoom (a lens change, distinct from a physical dolly push/pull — Seedance 2.0 follows both).
  | "truck_left"
  | "truck_right"
  | "pedestal_up"
  | "pedestal_down"
  | "zoom_in"
  | "zoom_out";

/** SkyCaptioner structured subject-expression field, for identity/emotion consistency. */
export type SubjectExpression =
  | "neutral"
  | "smiling"
  | "laughing"
  | "surprised"
  | "focused"
  | "worried"
  | "confident"
  | "tearful"
  | "angry";

export interface ShotGrammar {
  readonly shotType: ShotType;
  readonly shotAngle: ShotAngle;
  readonly shotPosition: ShotPosition;
  /** Optional structured camera motion (SkyCaptioner axis). */
  readonly cameraMotion?: CameraMotion;
  /** Optional structured subject expression (SkyCaptioner axis). */
  readonly subjectExpression?: SubjectExpression;
}

const CAMERA_MOTION_DIRECTIVES: Record<CameraMotion, string> = {
  static: "locked-off static camera, no camera movement",
  push_in: "slow push-in toward the subject to build intimacy or tension",
  pull_out: "slow pull-out revealing more of the environment",
  pan_left: "smooth pan left across the scene",
  pan_right: "smooth pan right across the scene",
  tilt_up: "tilt up from low detail to the subject",
  tilt_down: "tilt down from wide context to detail",
  tracking: "tracking move following the subject's motion",
  handheld: "subtle handheld movement for lived-in energy (not shaky)",
  orbit: "arc/orbit around the subject to add dimensionality",
  crane: "vertical crane move for scale and reveal",
  truck_left: "lateral truck move sliding left, parallax across the scene",
  truck_right: "lateral truck move sliding right, parallax across the scene",
  pedestal_up: "pedestal move raising the camera body straight up",
  pedestal_down: "pedestal move lowering the camera body straight down",
  zoom_in: "optical zoom-in tightening the lens on the subject (lens change, not a dolly)",
  zoom_out: "optical zoom-out widening the lens to reveal context (lens change, not a dolly)"
};

const SUBJECT_EXPRESSION_DIRECTIVES: Record<SubjectExpression, string> = {
  neutral: "calm neutral expression",
  smiling: "warm genuine smile",
  laughing: "natural laughter",
  surprised: "authentic surprise",
  focused: "concentrated, focused expression",
  worried: "worried, uneasy expression",
  confident: "confident, self-assured expression",
  tearful: "restrained tearful emotion",
  angry: "controlled anger, tension in the jaw"
};

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
  // Worded to hold for ONE subject as well as two. The old phrasing ("over one subject's shoulder
  // onto the other subject") assumed a second person, but this position is assigned by rotation to
  // whatever shot lands on it — including single-subject demo and explainer shots, where it told the
  // model to frame a second person who does not exist in the scene.
  over_the_shoulder: "camera behind and just past the subject's shoulder, looking where they are looking (onto the other person when the scene has one, otherwise onto what they are doing)",
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
  const parts = [
    SHOT_TYPE_DIRECTIVES[grammar.shotType],
    SHOT_ANGLE_DIRECTIVES[grammar.shotAngle],
    SHOT_POSITION_DIRECTIVES[grammar.shotPosition]
  ];
  if (grammar.cameraMotion) {
    parts.push(CAMERA_MOTION_DIRECTIVES[grammar.cameraMotion]);
  }
  if (grammar.subjectExpression) {
    parts.push(SUBJECT_EXPRESSION_DIRECTIVES[grammar.subjectExpression]);
  }
  const base = parts.join("; ");
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
    const cameraMotion = metadata.cameraMotion;
    const subjectExpression = metadata.subjectExpression;
    return {
      shotType: shotType as ShotType,
      shotAngle: shotAngle as ShotAngle,
      shotPosition: shotPosition as ShotPosition,
      ...(typeof cameraMotion === "string" && Object.hasOwn(CAMERA_MOTION_DIRECTIVES, cameraMotion)
        ? { cameraMotion: cameraMotion as CameraMotion }
        : {}),
      ...(typeof subjectExpression === "string" && Object.hasOwn(SUBJECT_EXPRESSION_DIRECTIVES, subjectExpression)
        ? { subjectExpression: subjectExpression as SubjectExpression }
        : {})
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
  cinematic: ["long_shot", "medium_shot", "close_up", "full_shot", "extreme_close_up"],
  // ---- ShortDirectorCreativeMode vocabulary ----
  // Two different enums name the creative mode, and BOTH reach the shot planner: the viral one
  // above (ugc_review, ...) and the director one here (ugc_ad, ...). Only the viral names were
  // listed, so whenever the planner saw a director name it silently fell through to the default
  // palette — a phone-selfie video framed with long shots and the full crewed camera rotation.
  // These entries make the fallback correct even when the other vocabulary is the one that arrives.
  ugc_ad: ["close_up", "medium_shot", "close_up", "extreme_close_up"],
  product_review: ["close_up", "medium_shot", "close_up", "extreme_close_up"],
  product_demo: ["medium_shot", "close_up", "full_shot", "medium_shot"],
  explainer: ["medium_shot", "full_shot", "close_up", "medium_shot"],
  cinematic_reveal: ["long_shot", "medium_shot", "close_up", "full_shot", "extreme_close_up"],
  native_social_story: ["medium_shot", "close_up", "full_shot", "medium_shot"]
};

/**
 * Fallback palette when no creative mode is set — which is exactly the long-form/film path. It used
 * to be only three mid sizes, so an 8-minute film never got a wide to establish a space or an
 * extreme close-up for an emotional beat. The full expressive range is the sensible default; the
 * tight UGC/testimonial palettes above still override it per mode.
 */
const DEFAULT_SHOT_TYPE_PALETTE: readonly ShotType[] = ["medium_shot", "close_up", "full_shot", "long_shot", "extreme_close_up"];

const ANGLE_CYCLE: readonly ShotAngle[] = ["eye_level", "eye_level", "low_angle", "high_angle"];

/**
 * Camera POSITION rotation. Shot size and angle already varied, but every shot in every video came
 * out `front_view` — 40 of 40 in a 480s probe — because the position was taken from the arc-role
 * default, which is front_view for all five roles. A whole film shot dead-on, with no
 * over-the-shoulder for dialogue and no side/behind coverage, is one of the clearest "made by AI"
 * tells. Hooks and climaxes KEEP front_view (the face carries those beats); the beats in between
 * rotate through real coverage positions. `point_of_view` and `overhead_view` are deliberately left
 * out of the cycle: POV changes who the subject is, and overhead is a special-occasion framing.
 */
const POSITION_CYCLE: readonly ShotPosition[] = ["front_view", "over_the_shoulder", "side_view", "front_view", "back_view"];

/**
 * Per-mode position palettes. The cycle above is written for a CREWED camera that can stand
 * anywhere; applied blindly it put `back_view` and `over_the_shoulder` into phone-selfie modes,
 * where the camera IS the subject's own outstretched arm — a physically impossible shot, and one
 * of the loudest "this was machine-assembled" tells in exactly the format that sells most.
 *
 * So the roam is scoped to what each mode's camera can physically do:
 *  - selfie registers (ugc_review, testimonial) stay front-on, with an occasional profile for a
 *    non-speaking reaction/b-roll beat — real KOL footage looks like this;
 *  - phone modes that film an ACTION rather than a face (demo, comparison, problem_solution,
 *    education, product_ad) may go over-the-shoulder — the natural "watch what I'm doing / what's
 *    on my screen" angle — but never behind the presenter;
 *  - story/cinematic and the no-mode long-form default keep the full crewed cycle.
 */
const MODE_POSITION_PALETTE: Record<string, readonly ShotPosition[]> = {
  ugc_review: ["front_view", "front_view", "side_view", "front_view"],
  testimonial: ["front_view", "front_view", "side_view", "front_view"],
  demo: ["front_view", "over_the_shoulder", "side_view", "front_view"],
  comparison: ["front_view", "over_the_shoulder", "side_view", "front_view"],
  problem_solution: ["front_view", "side_view", "over_the_shoulder", "front_view"],
  education: ["front_view", "side_view", "over_the_shoulder", "front_view"],
  product_ad: ["front_view", "side_view", "over_the_shoulder", "front_view"],
  // ShortDirectorCreativeMode vocabulary — see the note on MODE_SHOT_TYPE_PALETTE. `ugc_ad` and
  // `product_review` are the selfie-register names in this enum and must never roam behind the
  // subject; `cinematic_reveal` is genuinely crewed and is deliberately left to POSITION_CYCLE.
  ugc_ad: ["front_view", "front_view", "side_view", "front_view"],
  product_review: ["front_view", "front_view", "side_view", "front_view"],
  product_demo: ["front_view", "over_the_shoulder", "side_view", "front_view"],
  explainer: ["front_view", "side_view", "over_the_shoulder", "front_view"],
  native_social_story: ["front_view", "side_view", "over_the_shoulder", "front_view"]
};

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
  /**
   * Per-beat flag: this beat carries a VERBATIM spoken line, so it will be avatar/lip-sync routed.
   * A talking beat must face camera — the avatar model drives the mouth off the keyframe's face, so
   * a back/over-the-shoulder/profile keyframe would leave it with no mouth to animate. Position
   * variety is therefore only ever spent on non-speaking beats.
   */
  readonly speakingBeats?: readonly boolean[];
  /**
   * The style register the analyst decided, used when no creativeMode palette matches.
   *
   * The planner keyed on `creativeMode` alone, so a phone-shot brief whose mode metadata did not
   * survive the trip to the renderer fell through to the CREWED default and was handed crane moves,
   * orbits, long shots and a camera behind the subject — for a video the customer is holding at
   * arm's length. The register is decided upstream and travels on the shot, so it is the honest
   * fallback: a brief can lose a metadata key, but it cannot stop being a phone video.
   */
  readonly register?: "professional_cinematic" | "natural_phone_kol";
}): readonly ShotGrammar[] {
  const phoneRegister = input.register === "natural_phone_kol";
  const palette =
    (input.creativeMode && MODE_SHOT_TYPE_PALETTE[input.creativeMode]) ||
    (phoneRegister ? MODE_SHOT_TYPE_PALETTE.ugc_review : undefined) ||
    DEFAULT_SHOT_TYPE_PALETTE;
  const positionPalette =
    (input.creativeMode && MODE_POSITION_PALETTE[input.creativeMode]) ||
    (phoneRegister ? MODE_POSITION_PALETTE.ugc_review : undefined) ||
    POSITION_CYCLE;
  const result: ShotGrammar[] = [];
  let paletteCursor = 0;
  let motionCursor = 0;
  // Size-appropriate dynamic camera moves for the development beats. Wide framings roam through
  // space (track/truck/pan/orbit/crane); tight framings press in (push/zoom/pedestal/handheld).
  // A phone in someone's hand cannot crane or orbit. Those moves are the loudest "this was made by a
  // machine" tell in the format that sells most, so the phone register gets handheld-plausible moves.
  const wideMotions: readonly CameraMotion[] = phoneRegister
    ? ["handheld", "pan_right", "truck_left", "pan_left", "truck_right"]
    : ["tracking", "truck_left", "pan_right", "orbit", "crane", "truck_right", "pan_left"];
  const tightMotions: readonly CameraMotion[] = ["push_in", "zoom_in", "handheld", "pedestal_up", "tilt_up", "zoom_out"];
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
    // Camera motion follows the arc AND varies beat-to-beat — a monotone camera is the #1 tell of
    // a cheap AI video. Hooks/climaxes push in for tension; endings pull out to settle; the beats
    // in between rotate a size-appropriate palette of dynamic moves and never repeat.
    const previousMotion = result[index - 1]?.cameraMotion;
    const isWide = shotType === "long_shot" || shotType === "full_shot";
    let cameraMotion: CameraMotion;
    if (arcRole === "opening_hook" || arcRole === "climax") {
      cameraMotion = "push_in";
    } else if (arcRole === "closing_resolve") {
      cameraMotion = "pull_out";
    } else {
      const pool = isWide ? wideMotions : tightMotions;
      cameraMotion = pool[motionCursor % pool.length] ?? "push_in";
      motionCursor += 1;
    }
    if (cameraMotion === previousMotion) {
      const pool = isWide ? wideMotions : tightMotions;
      cameraMotion = pool.find((motion) => motion !== previousMotion) ?? cameraMotion;
      motionCursor += 1;
    }
    // Arc-critical beats stay front-on (the face sells the hook and the climax), and so does any
    // beat with a scripted line (it becomes a lip-synced avatar shot — see `speakingBeats`). Every
    // remaining beat rotates the mode's physically-possible coverage positions, so the video is not
    // 40 dead-on shots in a row without ever asking for a shot the mode's camera cannot take.
    const isSpeakingBeat = input.speakingBeats?.[index] === true;
    const shotPosition: ShotPosition = arcRole === "opening_hook" || arcRole === "climax" || isSpeakingBeat
      ? roleDefault.shotPosition
      : positionPalette[index % positionPalette.length] ?? roleDefault.shotPosition;
    result.push({ shotType, shotAngle, shotPosition, cameraMotion });
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
