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

import { readFileSync } from "node:fs";
import { StoryArchitect } from "../dist/agents/story-architect.js";
import { MIN_CLIP_DURATION_SECONDS } from "../dist/config/seedance-settings.js";

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
// An 18s order fits FOUR spoken beats, not seven. The floor is the renderer's own clip floor
// (MIN_CLIP_DURATION_SECONDS = 4), so 18 / 4 = 4. These two checks previously asserted a 2s floor and
// seven surviving beats, which is what a security/cost audit traced to a real double charge: nine 2s
// beats were planned, each rendered as a 4s clip, and an 18s order produced 36s of video at full
// price before the delivery gate refused it for running double the ordered length. The plan was
// promising a runtime the clips could not deliver — the exact thing the comment below claims the
// capacity cap exists to prevent.
check("talking_beats_fill_the_real_capacity", talking1.length === 4, `talking=${talking1.length}`);
check("talking_beat_floor_matches_the_renderer_clip_floor",
  Math.min(...talking1.map((b) => b.durationSeconds)) >= MIN_CLIP_DURATION_SECONDS,
  `min=${Math.min(...talking1.map((b) => b.durationSeconds))} floor=${MIN_CLIP_DURATION_SECONDS}`);
// The planned total must be renderable as-is: every beat at or above the clip floor, and the sum
// within the ordered runtime. This is the property the two checks above exist to protect.
check("planned_beats_are_all_renderable",
  talking1.every((beat) => beat.durationSeconds >= MIN_CLIP_DURATION_SECONDS));
check("planned_total_does_not_exceed_the_order",
  talking1.reduce((sum, beat) => sum + beat.durationSeconds, 0) <= 18,
  `total=${talking1.reduce((sum, beat) => sum + beat.durationSeconds, 0)}s`);
check("durations_sum_to_target", Math.abs(b1.reduce((a, b) => a + b.durationSeconds, 0) - 18) <= 2, `sum=${b1.reduce((a, b) => a + b.durationSeconds, 0)}`);

// --- 2. Already-filled talking plan (7 beats × ~12 words ≈ 21s of speech > 18) does NOT trigger a
// continuation call — the measure-and-continue loop only fires when speech is genuinely short.
const filled = fakeLlm(Array.from({ length: 7 }, () => FULL_LINE), 5);
const p2 = await plan(filled);
check("filled_plan_no_continuation", filled.calls() === 1, `llmCalls=${filled.calls()}`);
// A beat cannot be rendered shorter than the clip floor, so an 18s order fits 18/4 = 4 spoken beats.
// The capacity cap drops the rest rather than promising a runtime the clips cannot deliver — which is
// what it was doing when it sized beats at 3s against a 4s renderer.
check("filled_plan_keeps_only_beats_that_fit",
  p2.scenes.flatMap((s) => s.beats).filter((b) => b.spokenLine).length === 4,
  `beats=${p2.scenes.flatMap((s) => s.beats).filter((b) => b.spokenLine).length}`);

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

// --- 4b. MIXED plan (talking + silent b-roll beats) must NOT overshoot the target
// (adversarial-audit F1): the count-cap now accumulates real per-beat floors (2s spoken / 4s
// b-roll), so 5 spoken + 4 b-roll on an 18s order can't sum to 26s. Total stays <= target.
const mixedLlm = {
  name: "f", async chat() { return { provider: "a", modelId: "f", content: "{}", raw: {}, latencyMs: 0 }; },
  async structured() {
    const spoken = [1, 2, 3, 4, 5].map((i) => beat(i, FULL_LINE));
    const silent = [6, 7, 8, 9].map((i) => ({ beatId: `b${i}`, purpose: "broll", action: `broll ${i}`, subject: "product macro", camera: "macro", lighting: "soft", durationSeconds: 6, risks: [] }));
    return { provider: "a", modelId: "f", content: "{}", raw: {}, value: { premise: "p", register: "natural_phone_kol", targetDurationSeconds: 18, scenes: [{ sceneId: "s1", title: "t", beats: [...spoken, ...silent] }] }, latencyMs: 0 };
  },
  capabilities() { return []; }
};
const pm = await plan(mixedLlm);
const bm = pm.scenes.flatMap((s) => s.beats);
const mixedSum = bm.reduce((a, b) => a + b.durationSeconds, 0);
check("mixed_plan_never_overshoots_target", mixedSum <= 18, `sum=${mixedSum}`);
check("mixed_plan_keeps_some_beats", bm.length >= 1);

// --- 5. Script-first talking plan is NOT extended (verbatim customer lines are not ours to pad).
const scriptFirst = fakeLlm([SHORT_LINE, SHORT_LINE], 5);
await plan(scriptFirst, baseSettings, { shortViralCreativeMode: "ugc_review", scriptFirst: "true" }, "kịch bản khách dán");
check("script_first_not_extended", scriptFirst.calls() === 1, `llmCalls=${scriptFirst.calls()}`);

// --- 5b. END-TO-END SPEECH RATE (architect -> enhancer). The architect schedules a talking beat at
// TALKING_WORDS_PER_SECOND (4 w/s for VN TTS), so the ScriptEnhancer's re-cap MUST use the same rate.
// Capping direct speech at the narration rate (2.8) silently deletes ~30% of every line, so an 18s
// order delivers ~12s — and the pre-spend assert then blocks every talking video.
const { capToSpeakableWords, TALKING_WORDS_PER_SECOND: RATE } = await import("../dist/core/duration-scripting.js");
check("talking_rate_constant_shared", RATE === 4, `rate=${RATE}`);
const line13 = "ôi cái son dưỡng này mình xài cả tuần rồi mê lắm nha"; // 13 words
const beatSeconds = 13 / 4; // exactly what the architect schedules for this line
const capped = capToSpeakableWords(line13, beatSeconds, RATE);
check("enhancer_recap_preserves_scheduled_speech",
  capped.split(/\s+/).filter(Boolean).length >= 12,
  `kept=${capped.split(/\s+/).filter(Boolean).length}/13`);
const enhancerSource = readFileSync(new URL("../src/agents/script-enhancer.ts", import.meta.url), "utf8");
check("enhancer_uses_talking_rate_for_spoken_lines", /capToSpeakableWords\([^)]*TALKING_WORDS_PER_SECOND/.test(enhancerSource));
const architectSrc = readFileSync(new URL("../src/agents/story-architect.ts", import.meta.url), "utf8");
const directorSrc2 = readFileSync(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
check("no_duplicate_speech_rate_constants",
  !/const TALKING_WORDS_PER_SECOND = \d/.test(architectSrc) && !/const DELIVERABLE_SPEECH_WORDS_PER_SECOND = \d/.test(directorSrc2),
  "rate must be imported from duration-scripting, not re-declared");

// --- 6. PRE-SPEND DELIVERABLE-DURATION ASSERT lives in the DIRECTOR (it is the first place that
// knows which shots will actually be avatar-routed). Source invariant: it must run before the
// keyframe/TTS stages and throw a CustomerActionableError, mirroring the delivery gate's tolerance.
const directorSource = readFileSync(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
// Match the CALL, not one particular formatting of its arguments — the previous pattern pinned the
// whole argument list onto a single line, so wrapping the call (to pass transition settings) made
// this ordering check silently report "not found" instead of reporting the real ordering.
const assertAt = directorSource.indexOf("this.assertDeliverableDurationBeforeSpend(");
const keyframeAt = directorSource.indexOf("runKeyframeFirstStage({");
const ttsAt = directorSource.indexOf("runTalkingShotStage({");
check("pre_spend_duration_assert_exists", assertAt > -1, `at=${assertAt}`);
check("pre_spend_duration_assert_runs_before_keyframe_and_tts", assertAt > -1 && assertAt < keyframeAt && assertAt < ttsAt, `assert=${assertAt} keyframe=${keyframeAt} tts=${ttsAt}`);
check("pre_spend_duration_assert_is_customer_actionable", /throw new CustomerActionableError\(\s*`Kịch bản chỉ đủ khoảng/.test(directorSource));
// Tolerance is now imported from the delivery gate (single source of truth), not re-declared.
const deliverySource = readFileSync(new URL("../src/core/delivery-gate.ts", import.meta.url), "utf8");
check("tolerance_exported_from_delivery_gate", /export const DURATION_SHORT_BLOCK_TOLERANCE = 0\.1;/.test(deliverySource));
check("pre_spend_imports_shared_tolerance", /import \{ DURATION_SHORT_BLOCK_TOLERANCE \} from "\.\.\/core\/delivery-gate\.js";/.test(directorSource) && !/const DELIVERABLE_DURATION_SHORTFALL_TOLERANCE/.test(directorSource));
// Cost estimate must count the verifier's regenerations + its vision calls (was 4 images/3 calls
// estimated vs 8 images/11 calls really paid in the incident). Asserted on the FACTORS rather than
// the exact expression: the previous version pinned the whole formula as a literal string and went
// red the moment the character term gained its turnaround-view multiplier, reporting a regression
// where the estimate had in fact become more accurate.
const keyframeEstimate = directorSource.slice(
  directorSource.indexOf("plannedKeyframeImageCount: keyframeFirstEnabled"),
  directorSource.indexOf("plannedTalkingShotCount:")
);
check("cost_estimate_counts_verifier_regens", /this\.imageAnchorVerifier \? 2 : 1/.test(keyframeEstimate), keyframeEstimate.slice(0, 160));
check("cost_estimate_counts_every_shot_and_character", /shots\.length/.test(keyframeEstimate) && /characterAnchors\.length/.test(keyframeEstimate));
// Each recurring character costs one portrait PER TURNAROUND VIEW, so the character term must be
// multiplied by the view count or a large cast silently overruns maxCostUsd.
check("cost_estimate_counts_every_portrait_view", /CHARACTER_PORTRAIT_VIEWS\.length/.test(keyframeEstimate), keyframeEstimate.slice(0, 200));
check("cost_estimate_counts_verifier_vision_calls", directorSource.includes("plannedLlmPlanCallCount + plannedVerifierVisionCallCount"));

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
