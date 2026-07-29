#!/usr/bin/env node
/**
 * No-spend regression for the long-form beat-density floor (cross-audit B4). The render layer chunks
 * every beat into 4-15s clips, so a multi-minute video with too FEW authored beats still renders — but
 * reads as a stretched short (the same few actions tiled across minutes). Proves the Story Architect's
 * instruction gains a deterministic beat-count target for true long-form (>45s), scaled to runtime, and
 * carries NO such line for shorts (which keep their tight hook/proof/payoff structure). Pure — the LLM
 * provider is faked and only the instruction it receives is inspected; no network, no render.
 */

import { StoryArchitect } from "../dist/agents/story-architect.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// A provider that captures EVERY instruction it is handed (the ≥120s path legitimately makes a
// second CONTINUATION call — capture must not let it overwrite the first), then returns a minimal
// valid plan each time.
function capturingProvider(sink) {
  sink.instructions = [];
  return {
    name: "capture-llm",
    async chat() {
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0 };
    },
    async structured(request) {
      sink.instructions.push(request.instruction);
      const value = {
        premise: "p",
        targetDurationSeconds: 0,
        scenes: [{ sceneId: "s1", title: "t", beats: [{ beatId: "b1", purpose: "hook", action: "a", subject: "s", camera: "c", lighting: "l", durationSeconds: 10, risks: [] }] }]
      };
      return { provider: "atlascloud", modelId: "f", content: JSON.stringify(value), raw: {}, value, latencyMs: 0 };
    },
    capabilities() {
      return [];
    }
  };
}

const baseSettings = { tier: "fast", resolution: "480p", qualityMode: "economy", ratio: "9:16", audioMode: "none", watermark: false, returnLastFrame: true };

async function planCapture(durationTargetSeconds) {
  const sink = {};
  const architect = new StoryArchitect(capturingProvider(sink), "f");
  const plan = await architect.plan({ projectId: "p", userInput: "x", settings: { ...baseSettings, durationTargetSeconds }, references: [], metadata: {} });
  return { instruction: sink.instructions[0] ?? "", instructions: sink.instructions, plan };
}

async function instructionFor(durationTargetSeconds) {
  return (await planCapture(durationTargetSeconds)).instruction;
}

// --- 240s (4 min): density line present, floor = ceil(240/12)=20, soft max = ceil(240/7)=35.
const long = await instructionFor(240);
check("long_form_has_density_line", long.includes("LONG-FORM DENSITY"));
check("long_form_floor_20", long.includes("at least 20 distinct beats"), long.match(/at least \d+ distinct beats/)?.[0]);
check("long_form_range_20_35", long.includes("aim 20-35"), long.match(/aim \d+-\d+/)?.[0]);
check("long_form_15s_ceiling", /no single beat may carry more than ~15 seconds/i.test(long));

// --- 90s: floor = ceil(90/12)=8, soft max = ceil(90/7)=13.
const mid = await instructionFor(90);
check("ninety_floor_8_range_13", mid.includes("at least 8 distinct beats") && mid.includes("aim 8-13"));

// --- 46s: just over the gate — density fires (floor = ceil(46/12)=4).
const justOver = await instructionFor(46);
check("forty_six_fires", justOver.includes("LONG-FORM DENSITY") && justOver.includes("at least 4 distinct beats"));

// --- 45s and below: NO density line (shorts keep their own hook/proof/payoff structure).
const atGate = await instructionFor(45);
const shortForm = await instructionFor(18);
check("forty_five_no_density", !atGate.includes("LONG-FORM DENSITY"));
check("short_no_density", !shortForm.includes("LONG-FORM DENSITY"));

// --- ≥120s scene-structure rule is TOLD to the model (redundancy-audit R7: the review gate demanded
// 3 sequences while the instruction never mentioned scenes).
const twoForty = await planCapture(240);
check("long_form_demands_three_scenes", twoForty.instruction.includes("at least 3 scenes"));
check("ninety_does_not_demand_scenes", !(await instructionFor(90)).includes("at least 3 scenes"));

// --- CONTINUATION (anti-truncation, LocalMiniDrama pattern): a 240s plan that came back with 1 beat
// (far under the floor) triggers exactly ONE follow-up call whose instruction is the continuation
// contract; the echo of the same sceneId is dropped (idempotent merge).
check("truncated_long_plan_triggers_one_continuation", twoForty.instructions.length === 2, `calls=${twoForty.instructions.length}`);
check("continuation_instruction_is_continuation_contract", (twoForty.instructions[1] ?? "").includes("CONTINUE an interrupted scene plan"));
check("echoed_scene_ids_do_not_duplicate", twoForty.plan.scenes.flatMap((scene) => scene.beats).length === 1, `beats=${twoForty.plan.scenes.flatMap((scene) => scene.beats).length}`);
// Short plans never trigger a continuation call.
const eighteen = await planCapture(18);
check("short_plan_no_continuation", eighteen.instructions.length === 1, `calls=${eighteen.instructions.length}`);

// --- DETERMINISTIC SCENE REGROUP (R7 backstop): a ≥120s plan with 1 scene but enough beats is
// regrouped in code into setup/development/payoff movements so the long-form review gate's
// three-sequence demand can never hard-fail a paid job on LLM grouping.
const manyBeats = Array.from({ length: 12 }, (_, i) => ({
  beatId: `b${i + 1}`, purpose: i === 0 ? "hook" : "development", action: `action ${i + 1}`,
  subject: "s", camera: "c", lighting: "l", durationSeconds: 12, risks: []
}));
const oneSceneProvider = {
  name: "one-scene-llm",
  async chat() { return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0 }; },
  async structured() {
    const value = { premise: "p", targetDurationSeconds: 144, scenes: [{ sceneId: "s1", title: "t", beats: manyBeats }] };
    return { provider: "atlascloud", modelId: "f", content: JSON.stringify(value), raw: {}, value, latencyMs: 0 };
  },
  capabilities() { return []; }
};
const regrouped = await new StoryArchitect(oneSceneProvider, "f").plan({
  projectId: "p", userInput: "x", settings: { ...baseSettings, durationTargetSeconds: 144 }, references: [], metadata: {}
});
check("long_one_scene_regrouped_into_three", regrouped.scenes.length === 3, `scenes=${regrouped.scenes.length}`);
check("regroup_preserves_all_beats_in_order",
  regrouped.scenes.flatMap((scene) => scene.beats).map((beat) => beat.beatId).join(",") === manyBeats.map((beat) => beat.beatId).join(","));
check("regroup_titles_are_movements", regrouped.scenes.map((scene) => scene.title).join("|") === "Setup|Development|Payoff");

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.long-form-beat-density-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
