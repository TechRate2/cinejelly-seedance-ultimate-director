/**
 * No-spend smoke for intelligent shot-framing variation.
 * Proves: framing follows the emotional arc (hook/climax push closer), adjacent shots never
 * repeat the same shot size (anti-monotony), the palette adapts to creative mode (UGC stays
 * tight with no wides; cinematic roams to long shots), explicit caller grammar still wins,
 * and the compiler emits the framing as a hard instruction. No network, no spend.
 */

import { planShotFramingSequence } from "../dist/core/shot-grammar.js";
import { ShotPlanner } from "../dist/core/shot-planner.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

function noAdjacentRepeat(types) {
  for (let i = 1; i < types.length; i += 1) {
    if (types[i] === types[i - 1]) return false;
  }
  return true;
}

// 1. UGC stays tight and handheld: no long shots, no adjacent repeats, hook is a close-up.
const ugc = planShotFramingSequence({
  arcRoles: ["opening_hook", "development", "development", "climax", "closing_resolve"],
  creativeMode: "ugc_review"
});
const ugcTypes = ugc.map((g) => g.shotType);
check("ugc_no_wides", ugcTypes.every((t) => t !== "long_shot" && t !== "full_shot"), ugcTypes.join(","));
check("ugc_no_adjacent_repeat", noAdjacentRepeat(ugcTypes));
check("ugc_hook_is_close", ugcTypes[0] === "close_up");
check("ugc_climax_low_angle", ugc[3].shotAngle === "low_angle");

// 2. Cinematic roams wide, still no adjacent repeats.
const cinematic = planShotFramingSequence({
  arcRoles: ["opening_hook", "development", "development", "development", "climax", "closing_resolve"],
  creativeMode: "cinematic"
});
const cinTypes = cinematic.map((g) => g.shotType);
check("cinematic_has_wide", cinTypes.some((t) => t === "long_shot" || t === "full_shot"));
check("cinematic_no_adjacent_repeat", noAdjacentRepeat(cinTypes));
check("cinematic_more_variety_than_ugc", new Set(cinTypes).size >= new Set(ugcTypes).size);

// 3. Single-shot and unknown mode are safe.
check("single_shot_ok", planShotFramingSequence({ arcRoles: ["full_video"] }).length === 1);
const unknown = planShotFramingSequence({ arcRoles: ["opening_hook", "development", "closing_resolve"], creativeMode: "totally_unknown_mode" });
check("unknown_mode_falls_back", unknown.length === 3 && noAdjacentRepeat(unknown.map((g) => g.shotType)));

// 4. End to end: the ShotPlanner stamps varied framing and the compiler emits it.
const planner = new ShotPlanner();
function beat(beatId, action, purpose) {
  return {
    beatId,
    purpose,
    action,
    subject: "A creator and a serum bottle",
    camera: "handheld phone",
    lighting: "soft window light",
    durationSeconds: 6,
    risks: [],
    references: [],
    continuity: {}
  };
}
const scenes = [
  {
    sceneId: "scene_1",
    beats: [
      beat("b1", "Creator lifts the serum into the light", "hook"),
      beat("b2", "Dropper releases onto the back of the hand", "proof"),
      beat("b3", "Skin looks visibly smoother", "payoff")
    ]
  }
];
const planned = planner.plan({
  projectId: "proj_framing_smoke",
  scenes,
  settings: { ...DEFAULT_SEEDANCE_SETTINGS, durationTargetSeconds: 18 },
  metadata: { shortViralCreativeMode: "ugc_review" }
});
check("planner_stamps_shot_type", planned.every((shot) => typeof shot.metadata?.shotType === "string"));
const plannedTypes = planned.map((shot) => shot.metadata?.shotType);
check("planner_framing_varies", noAdjacentRepeat(plannedTypes), plannedTypes.join(","));

const compiler = new SeedancePromptCompiler();
const compiled = compiler.compile({
  shot: planned[0],
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("compiler_emits_framing", compiled.prompt.includes("Framing grammar"));

// 5. Explicit caller grammar still wins over auto-assignment.
const pinned = planner.plan({
  projectId: "proj_framing_pinned",
  scenes,
  settings: { ...DEFAULT_SEEDANCE_SETTINGS, durationTargetSeconds: 18 },
  metadata: { shortViralCreativeMode: "ugc_review", shotType: "long_shot", shotAngle: "high_angle", shotPosition: "aerial_view" }
});
check("explicit_grammar_wins", pinned.every((shot) => shot.metadata?.shotType === "long_shot"));

// COVERAGE VARIETY (Phase 1): a film must not be 40 dead-on shots. Camera POSITION now rotates
// (front / over-the-shoulder / side / back) on non-arc-critical beats, and the default palette
// (used by the long-form path, which sets no creativeMode) spans wide -> extreme close-up.
const { assignVideoArcRoles: arcRolesFor } = await import("../dist/core/duration-scripting.js");
const filmFraming = planShotFramingSequence({ arcRoles: arcRolesFor(40) });
const positions = new Set(filmFraming.map((g) => g.shotPosition));
const sizes = new Set(filmFraming.map((g) => g.shotType));
check("film_uses_multiple_camera_positions", positions.size >= 3, [...positions].join(","));
check("film_is_not_all_front_view", filmFraming.filter((g) => g.shotPosition === "front_view").length < filmFraming.length * 0.7,
  `front=${filmFraming.filter((g) => g.shotPosition === "front_view").length}/40`);
check("film_default_palette_spans_wide_to_extreme_close", sizes.has("long_shot") && sizes.has("extreme_close_up"), [...sizes].join(","));
// Hooks and climaxes stay front-on — the face carries those beats.
const hookIdx = arcRolesFor(40).findIndex((r) => r === "opening_hook");
check("hook_stays_front_view", hookIdx < 0 || filmFraming[hookIdx].shotPosition === "front_view");

// PHYSICAL POSSIBILITY (Phase 1 audit fix): coverage variety must never ask for a shot the mode's
// camera CANNOT take. The rotation above was first applied to every mode, which put back_view and
// over_the_shoulder into phone-selfie videos — the camera there is the subject's own arm, so those
// shots cannot exist. Two independent locks, because either alone is escapable:
//   (a) selfie modes never rotate behind or over the shoulder, speaking or not;
//   (b) any beat with a spokenLine stays front-on in EVERY mode — it becomes a lip-synced avatar
//       shot, and a keyframe with no visible mouth gives the avatar model nothing to animate.
const IMPOSSIBLE_FOR_SELFIE = new Set(["back_view", "over_the_shoulder", "overhead_view", "point_of_view"]);
for (const selfieMode of ["ugc_review", "testimonial"]) {
  const selfie = planShotFramingSequence({ arcRoles: arcRolesFor(8), creativeMode: selfieMode });
  const impossible = selfie.filter((g) => IMPOSSIBLE_FOR_SELFIE.has(g.shotPosition)).map((g) => g.shotPosition);
  check(`${selfieMode}_has_no_physically_impossible_position`, impossible.length === 0, impossible.join(",") || "none");
}
// A talking beat is front-on even in a mode whose palette roams — checked against the widest
// palette (no creativeMode = the crewed long-form default) so the lock is proven, not incidental.
const everyBeatSpeaks = planShotFramingSequence({
  arcRoles: arcRolesFor(12),
  speakingBeats: Array.from({ length: 12 }, () => true)
});
check("speaking_beats_always_face_camera",
  everyBeatSpeaks.every((g) => g.shotPosition === "front_view"),
  [...new Set(everyBeatSpeaks.map((g) => g.shotPosition))].join(","));
// ...and the variety is genuinely spent on the SILENT beats rather than lost entirely.
const halfSpeak = planShotFramingSequence({
  arcRoles: arcRolesFor(12),
  speakingBeats: Array.from({ length: 12 }, (_unused, i) => i % 2 === 0)
});
check("silent_beats_still_get_coverage_variety",
  new Set(halfSpeak.filter((_g, i) => i % 2 === 1).map((g) => g.shotPosition)).size >= 2);
check("speaking_beats_front_when_mixed",
  halfSpeak.every((g, i) => i % 2 === 1 || g.shotPosition === "front_view"));
// The planner must actually WIRE spokenLine through — the lock is worthless if only the pure
// function honours it. A UGC plan whose beats all carry dialogue must come out entirely front-on.
const talkingScenes = [
  {
    sceneId: "scene_talk",
    beats: ["hook", "proof", "payoff", "proof", "payoff"].map((purpose, i) => ({
      ...beat(`t${i + 1}`, "Creator talks straight into the phone about the serum", purpose),
      spokenLine: "Mình dùng cái này ba tuần và da mặt mình thay đổi thật sự luôn đó mọi người ơi."
    }))
  }
];
const talkingPlan = planner.plan({
  projectId: "proj_framing_talking",
  scenes: talkingScenes,
  settings: { ...DEFAULT_SEEDANCE_SETTINGS, durationTargetSeconds: 24 },
  metadata: { shortViralCreativeMode: "ugc_review" }
});
const talkingPositions = talkingPlan
  .filter((shot) => String(shot.spokenLine ?? "").trim() || shot.spokenLineContinuation === true)
  .map((shot) => shot.metadata?.shotPosition);
check("planner_wires_speaking_beats_front_view",
  talkingPositions.length > 0 && talkingPositions.every((p) => p === "front_view"),
  `${talkingPositions.length} talking shots: ${[...new Set(talkingPositions)].join(",")}`);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.shot-framing-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing shot-grammar palettes, the shot planner framing pass, or the compiler grammar section.",
    "Framing variation is a prompt-level cinematic upgrade; its visual benefit is confirmed only on a real paid render."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
