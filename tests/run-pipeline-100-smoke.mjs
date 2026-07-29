#!/usr/bin/env node
/**
 * No-spend smoke for the "pipeline to 100%" upgrades that close the last snapshot gaps:
 *  - Semantic long-form segmentation (ViMax RAG essence): narrative-boundary grouping.
 *  - SkyCaptioner completeness: camera-motion + subject-expression grammar axes.
 *  - Multi-view character portraits (ViMax): front/three-quarter/side turnaround sheets.
 *  - Typography/text scene composition (VibeFrame): deterministic, XML-safe SVG scenes.
 * Pure functions, no network, no spend.
 */

import { segmentScenesSemantic } from "../dist/core/semantic-sequence-segmenter.js";
import { composeTypographyScene } from "../dist/core/typography-scene-composer.js";
import { planShotFramingSequence, shotGrammarFromMetadata, shotGrammarPromptLine } from "../dist/core/shot-grammar.js";
import { planCastPortraitRequests } from "../dist/core/keyframe-first-planner.js";
import { LongFormSequencePlanner } from "../dist/core/long-form-sequence-planner.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}
function scene(id, title, subject, purpose, dur) {
  return {
    sceneId: id,
    title,
    beats: [{ beatId: id + "b", purpose, action: purpose, subject, camera: "x", lighting: "x", durationSeconds: dur, risks: [], references: [], continuity: {} }]
  };
}

// --- Batch 1: semantic segmentation groups by narrative boundary, not fixed windows.
const scenes = [
  scene("s1", "Mở đầu", "Lan", "hook setup", 20),
  scene("s2", "Giới thiệu", "Lan", "setup context", 20),
  scene("s3", "Cao trào", "Minh", "climax proof reveal", 22),
  scene("s4", "Kết", "Minh", "resolve ending cta", 18)
];
const seg = segmentScenesSemantic({ scenes, targetSequenceSeconds: 45 });
check("segmentation_groups_same_subject_act", seg.length >= 2 && seg[0].sceneCount === 2, `groups=${seg.length} first=${seg[0]?.sceneCount}`);
check("segmentation_opens_boundary_on_act_shift", seg.some((b) => b.boundaryReason === "act_shift" || b.boundaryReason === "subject_shift"));
check("segmentation_covers_all_scenes", seg.reduce((sum, b) => sum + b.sceneCount, 0) === scenes.length);
const singleSeg = segmentScenesSemantic({ scenes: [scene("only", "Only", "X", "hook", 12)] });
check("segmentation_single_scene_ok", singleSeg.length === 1 && singleSeg[0].sceneCount === 1);

// --- long-form planner uses the semantic boundaries and exposes the reason.
const planner = new LongFormSequencePlanner();
const groups = planner.plan({ projectId: "p1", storyPlan: { premise: "x", targetDurationSeconds: 80, scenes } });
check("long_form_uses_semantic_boundaries", groups.length >= 2 && groups.every((g) => typeof g.boundaryReason === "string"));
check("long_form_covers_all_scenes", groups.reduce((sum, g) => sum + g.scenes.length, 0) === scenes.length);

// --- Batch 2: camera-motion follows the arc; grammar line carries motion + expression.
const framing = planShotFramingSequence({ arcRoles: ["opening_hook", "development", "climax", "closing_resolve"], creativeMode: "cinematic" });
check("framing_hook_pushes_in", framing[0].cameraMotion === "push_in");
check("framing_close_pulls_out", framing[3].cameraMotion === "pull_out");
check("framing_every_shot_has_motion", framing.every((g) => typeof g.cameraMotion === "string"));
const grammar = shotGrammarFromMetadata({ shotType: "close_up", shotAngle: "eye_level", shotPosition: "front_view", cameraMotion: "push_in", subjectExpression: "worried" });
const line = shotGrammarPromptLine(grammar);
check("grammar_line_includes_motion_and_expression", /push-in/.test(line) && /worried/.test(line));
check("grammar_rejects_bad_axes", (() => {
  const g = shotGrammarFromMetadata({ shotType: "close_up", shotAngle: "eye_level", shotPosition: "front_view", cameraMotion: "teleport", subjectExpression: "??" });
  return g && g.cameraMotion === undefined && g.subjectExpression === undefined;
})());

// --- Batch 3: multi-view portraits — one request per view, exactly one primary (front).
const portraits = planCastPortraitRequests({
  cast: [{ characterId: "c1", name: "Lan", description: "cô gái" }],
  provider: "atlascloud",
  imageModelId: "m",
  views: ["front", "three_quarter", "side"]
});
check("portraits_one_per_view", portraits.length === 3 && new Set(portraits.map((p) => p.view)).size === 3);
check("portraits_single_front_primary", portraits.filter((p) => p.isPrimary).length === 1 && portraits.find((p) => p.isPrimary).view === "front");
const defaultPortraits = planCastPortraitRequests({ cast: [{ characterId: "c1", name: "Lan", description: "x" }], provider: "atlascloud", imageModelId: "m" });
check("portraits_default_front_only", defaultPortraits.length === 1 && defaultPortraits[0].view === "front");
const skipBound = planCastPortraitRequests({ cast: [{ characterId: "c2", name: "Real", description: "x", identityReferenceUri: "upload://up_0123456789abcdef.png" }], provider: "atlascloud", imageModelId: "m", views: ["front", "side"] });
check("portraits_skip_members_with_identity", skipBound.length === 0);

// --- Batch 4: typography scene — valid self-contained SVG, XML-safe, aspect-aware.
const typo = composeTypographyScene({ kind: "bullet_list", title: "3 lý do <script>alert(1)</script>", lines: ["Nhanh", "Rẻ", "Đẹp"], theme: "brand", aspect: "9:16" });
check("typo_produces_svg", typo.svg.startsWith("<svg") && typo.svg.endsWith("</svg>"));
check("typo_escapes_user_text", !typo.svg.includes("<script>") && typo.svg.includes("&lt;script&gt;"));
check("typo_reveal_plan_present", typo.reveal.length === 3);
check("typo_aspect_dimensions", typo.width === 1080 && typo.height === 1920);
for (const kind of ["title_card", "quote", "stat_card", "kinetic_text"]) {
  const scene = composeTypographyScene({ kind, title: "Test " + kind, statValue: "3.2x", lines: ["a", "b"], attribution: "CineJelly" });
  check(`typo_kind_${kind}_valid_svg`, scene.svg.startsWith("<svg") && scene.svg.includes("</svg>"));
}
const emptyTypo = composeTypographyScene({ kind: "title_card" });
check("typo_empty_spec_safe", emptyTypo.svg.startsWith("<svg"));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.pipeline-100-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "These close the named snapshot gaps at the pipeline-logic layer; typography scenes still need an SVG rasterizer in assembly to render to frames.",
    "Keep this passing when changing segmentation, shot-grammar axes, portrait views, or the typography composer."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
