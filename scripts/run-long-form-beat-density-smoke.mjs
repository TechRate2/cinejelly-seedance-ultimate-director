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

// A provider that captures the instruction it is handed, then returns a minimal valid plan.
function capturingProvider(sink) {
  return {
    name: "capture-llm",
    async chat() {
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0 };
    },
    async structured(request) {
      sink.instruction = request.instruction;
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

async function instructionFor(durationTargetSeconds) {
  const sink = {};
  const architect = new StoryArchitect(capturingProvider(sink), "f");
  await architect.plan({ projectId: "p", userInput: "x", settings: { ...baseSettings, durationTargetSeconds }, references: [], metadata: {} });
  return sink.instruction ?? "";
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
