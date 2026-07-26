#!/usr/bin/env node
/**
 * No-spend regression for the DETERMINISTIC talking-video duration fill (paid-acceptance forensics
 * 2026-07-26). An avatar/OmniHuman clip lasts exactly its TTS line, so a talking video's runtime =
 * total spoken words / ~4 per second. The real idol-18s paid render collapsed to 7.3s because:
 * (1) limitBeatsToDurationCapacity capped an 18s video at floor(18/4)=4 beats, and
 * (2) the LLM wrote only 3 short lines. This locks the cure: talking plans allow many short beats
 * (talking floor 2s), honest per-beat durations, and a measure-and-continue loop that tops up the
 * speech when the first pass is short — none of which the prompt-only "write longer lines" law could
 * guarantee. Pure: fake in-memory LLM, no network, no render.
 */

import { StoryArchitect } from "../dist/agents/story-architect.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const SHORT_LINE = "cái này mình xài mê luôn á"; // 7 words ≈ 1.75s of speech
const FULL_LINE = "ôi cái son dưỡng này mình xài cả tuần rồi mê lắm nha"; // ~12 words ≈ 3s — a filled beat
const baseSettings = { tier: "fast", resolution: "720p", qualityMode: "economy", ratio: "9:16", durationTargetSeconds: 18, audioMode: "hybrid", bitrateMode: "standard", watermark: false, returnLastFrame: true };

function beat(i, line) {
  return { beatId: `b${i}`, purpose: i === 0 ? "hook" : "proof", action: `action ${i}`, subject: "KOL", camera: "phone", lighting: "window", durationSeconds: 6, ...(line ? { spokenLine: line } : {}), risks: [] };
}
// A fake LLM: first structured() returns `firstBeats`, later calls return `contBeats` short-line beats in fresh scenes.
function fakeLlm(firstBeatLines, contCount, register = "natural_phone_kol") {
  let calls = 0;
  return {
    calls: () => calls,
    name: "f",
    async chat() { return { provider: "a", modelId: "f", content: "{}", raw: {}, latencyMs: 0 }; },
    async structured() {
      calls += 1;
      if (calls === 1) {
        const beats = firstBeatLines.map((line, i) => beat(i + 1, line));
        const value = { premise: "p", ...(register ? { register } : {}), targetDurationSeconds: 18, scenes: [{ sceneId: "s1", title: "t", beats }] };
        return { provider: "a", modelId: "f", content: "{}", raw: {}, value, latencyMs: 0 };
      }
      const scenes = Array.from({ length: contCount }, (_, k) => ({ sceneId: `cont_${calls}_${k}`, title: "t", beats: [beat(100 + calls * 10 + k, SHORT_LINE)] }));
      return { provider: "a", modelId: "f", content: "{}", raw: {}, value: { premise: "p", targetDurationSeconds: 18, scenes }, latencyMs: 0 };
    },
    capabilities() { return []; }
  };
}

async function plan(llm, settings = baseSettings, metadata = { shortViralCreativeMode: "ugc_review" }, userInput = "review son duong 18 giay kieu idol tu quay") {
  return new StoryArchitect(llm, "f").plan({ projectId: "p", userInput, settings, references: [], metadata });
}

// --- 1. Under-filled talking plan (3 short beats) triggers the continuation loop and fills to target.
const under = fakeLlm([SHORT_LINE, SHORT_LINE, SHORT_LINE], 5);
const p1 = await plan(under);
const b1 = p1.scenes.flatMap((s) => s.beats);
const talking1 = b1.filter((b) => b.spokenLine);
check("underfilled_triggers_continuation", under.calls() === 2, `llmCalls=${under.calls()}`);
check("talking_beats_survive_capacity", talking1.length >= 7, `talking=${talking1.length}`);
check("talking_beat_floor_is_2s", Math.min(...talking1.map((b) => b.durationSeconds)) <= 2, `min=${Math.min(...talking1.map((b) => b.durationSeconds))}`);
check("durations_sum_to_target", Math.abs(b1.reduce((a, b) => a + b.durationSeconds, 0) - 18) <= 2, `sum=${b1.reduce((a, b) => a + b.durationSeconds, 0)}`);

// --- 2. Already-filled talking plan (7 beats × ~12 words ≈ 21s of speech > 18) does NOT trigger a
// continuation call — the measure-and-continue loop only fires when speech is genuinely short.
const filled = fakeLlm(Array.from({ length: 7 }, () => FULL_LINE), 5);
const p2 = await plan(filled);
check("filled_plan_no_continuation", filled.calls() === 1, `llmCalls=${filled.calls()}`);
check("filled_plan_keeps_all_beats", p2.scenes.flatMap((s) => s.beats).filter((b) => b.spokenLine).length >= 7);

// --- 3. Non-talking (no register) plan is UNCHANGED: 18s still caps at 4 beats, 4s floor, no talking call.
const broll = fakeLlm([undefined, undefined, undefined, undefined, undefined, undefined], 5, undefined);
const p3 = await plan(broll, baseSettings, { creativeMode: "product_ad" }, "cinematic product film");
const b3 = p3.scenes.flatMap((s) => s.beats);
check("broll_capped_at_4_beats", b3.length <= 4, `beats=${b3.length}`);
check("broll_floor_is_4s", Math.min(...b3.map((b) => b.durationSeconds)) >= 4, `min=${Math.min(...b3.map((b) => b.durationSeconds))}`);
check("broll_no_talking_continuation", broll.calls() === 1, `llmCalls=${broll.calls()}`);

// --- 4. Talking density guidance appears in the instruction for talking, absent for non-talking.
let capturedInstruction = "";
const capLlm = {
  name: "f", async chat() { return { provider: "a", modelId: "f", content: "{}", raw: {}, latencyMs: 0 }; },
  async structured(req) { capturedInstruction = capturedInstruction || req.instruction; return { provider: "a", modelId: "f", content: "{}", raw: {}, value: { premise: "p", register: "natural_phone_kol", targetDurationSeconds: 18, scenes: [{ sceneId: "s1", title: "t", beats: Array.from({ length: 8 }, (_, i) => beat(i + 1, SHORT_LINE)) }] }, latencyMs: 0 }; },
  capabilities() { return []; }
};
await plan(capLlm);
check("talking_density_guidance_present", /TALKING VIDEO DENSITY/.test(capturedInstruction) && /at least \d+ short talking beats/.test(capturedInstruction), capturedInstruction.match(/at least \d+ short talking beats/)?.[0]);

let brollInstruction = "";
const capLlm2 = {
  name: "f", async chat() { return { provider: "a", modelId: "f", content: "{}", raw: {}, latencyMs: 0 }; },
  async structured(req) { brollInstruction = brollInstruction || req.instruction; return { provider: "a", modelId: "f", content: "{}", raw: {}, value: { premise: "p", targetDurationSeconds: 18, scenes: [{ sceneId: "s1", title: "t", beats: [beat(1)] }] }, latencyMs: 0 }; },
  capabilities() { return []; }
};
await plan(capLlm2, baseSettings, { creativeMode: "product_ad" }, "cinematic product film");
check("non_talking_no_talking_density", !/TALKING VIDEO DENSITY/.test(brollInstruction));

// --- 5. Script-first talking plan is NOT extended (verbatim customer lines are not ours to pad).
const scriptFirst = fakeLlm([SHORT_LINE, SHORT_LINE], 5);
await plan(scriptFirst, baseSettings, { shortViralCreativeMode: "ugc_review", scriptFirst: "true" }, "kịch bản khách dán");
check("script_first_not_extended", scriptFirst.calls() === 1, `llmCalls=${scriptFirst.calls()}`);

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.talking-duration-fill-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
