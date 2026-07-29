#!/usr/bin/env node
/**
 * No-spend regression for AUDIO coherence of the final compiled prompts per register
 * (contradiction-probe findings #1/#2/#4/#5). The phone-KOL register's audio axis is "in-camera
 * sound only, NO scored music" — no other layer (story-architect audio defaults, shot-planner cue
 * fallbacks/phase notes, compiler floor) may re-introduce a music bed into the SAME prompt. Also
 * locks the continuation-chunk contract for scripted beats: no word cap on the continuing clip,
 * dedup keeps the timeline lean, and the compiled length stays under the CI ceiling. Pure — fake
 * in-memory LLM, no network, no render.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { StoryArchitect } = await import(`${base}/agents/story-architect.js`);
const { ShotPlanner } = await import(`${base}/core/shot-planner.js`);
const { SeedancePromptCompiler } = await import(`${base}/prompt_compiler/prompt-compiler.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
const compiler = new SeedancePromptCompiler();

// Beats deliberately OMIT audioIntent and styleDna axes so every default fires.
function fakeLlm({ spokenLine, register } = {}) {
  return {
    name: "fake-coherence-llm",
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() {
      const purposes = ["hook", "proof", "payoff"];
      const scenes = purposes.map((purpose, index) => ({
        sceneId: `s${index + 1}`,
        title: `Scene ${index + 1}`,
        beats: [{
          beatId: `b${index + 1}`,
          purpose,
          action: `Show ${purpose} action ${index + 1} with a visible state change.`,
          subject: "the creator with the serum bottle",
          camera: "vertical handheld phone camera at arm's length",
          lighting: "window daylight",
          durationSeconds: 6,
          ...(spokenLine ? { spokenLine: `${spokenLine} (${purpose})` } : {}),
          risks: []
        }]
      }));
      const value = { premise: "p", targetDurationSeconds: 18, ...(register ? { register } : {}), scenes };
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value };
    },
    capabilities() { return []; }
  };
}

const settings = { tier: "fast", resolution: "720p", qualityMode: "economy", ratio: "9:16", durationTargetSeconds: 18, audioMode: "hybrid", bitrateMode: "standard", watermark: false, returnLastFrame: true };
const MUSIC_BED = /(low-volume music bed|low music bed|music resolves|clean music tail)/i;
const NO_SCORED = /(NO scored music|no music bed|in-camera sound only|in-camera room tone|no scored bed)/i;

async function compiledPrompts(metadata, llm) {
  const plan = await new StoryArchitect(llm, "f").plan({ projectId: "d", userInput: "review serum chân thật", settings, references: [], metadata });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata });
  return shots.map((shot) => compiler.compile({ shot, settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt);
}

// --- 1. Phone-KOL default path (ugc_review, no authored audioIntent): NO music-bed language may
// co-exist with the register's no-scored-music law in any prompt.
const phonePrompts = await compiledPrompts({ shortViralCreativeMode: "ugc_review", shortViralNiche: "beauty_skincare" }, fakeLlm({}));
const phoneContradiction = phonePrompts.find((p) => MUSIC_BED.test(p) && NO_SCORED.test(p));
check("phone_register_no_music_contradiction", !phoneContradiction, phoneContradiction ? phoneContradiction.match(MUSIC_BED)?.[0] : "clean");
check("phone_register_keeps_in_camera_law", phonePrompts.every((p) => NO_SCORED.test(p)));

// --- 2. Cinematic control: music language is legitimate under the cinematic register and must
// NOT have been stripped (don't over-fix).
const cinePrompts = await compiledPrompts({ shortViralCreativeMode: "cinematic" }, fakeLlm({ register: "professional_cinematic" }));
check("cinematic_register_keeps_music_language", cinePrompts.some((p) => /music|score/i.test(p)));

// --- 3. Phone register + niche whose compiler DNA is cinematic-flavored (real_estate: "smooth
// walkthrough parallax"): the niche line must be filtered out under the phone register.
const parallaxPrompts = await compiledPrompts({ shortViralCreativeMode: "ugc_review", shortViralNiche: "real_estate" }, fakeLlm({}));
check("phone_register_filters_cinematic_niche_dna", parallaxPrompts.every((p) => !/parallax|gimbal smoothness(?!.*NO)/i.test(p.replace(/NO gimbal smoothness/g, ""))), "");

// --- 4. Continuation chunk of a SCRIPTED beat (script-first, beat > 15s so it chunks): the clip
// that continues the verbatim narration gets no word cap, carries the continuation override, and
// the timeline dedup keeps the full base from re-printing (length under the 8000 CI ceiling).
const scriptLlm = {
  name: "fake-script-llm",
  async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
  async structured() {
    const value = {
      premise: "p",
      targetDurationSeconds: 24,
      scenes: [{
        sceneId: "s1", title: "Scene 1",
        beats: [{
          beatId: "b1", purpose: "hook",
          action: "Creator talks through the whole routine on camera.",
          subject: "the creator", camera: "vertical handheld phone camera", lighting: "window daylight",
          durationSeconds: 24,
          spokenLine: "Ôi mọi người ơi cái serum này mình xài được ba tuần rồi mà da mình nó khác hẳn luôn á, mịn hơn, sáng hơn, mà cái mùi nó thơm nhẹ nhàng dễ chịu lắm luôn, để mình chỉ cho mọi người cách mình dùng nè, mỗi tối sau khi rửa mặt xong mình chỉ cần hai giọt thôi nha.",
          risks: []
        }]
      }]
    };
    return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value };
  },
  capabilities() { return []; }
};
const scriptSettings = { ...settings, durationTargetSeconds: 24 };
const scriptPlan = await new StoryArchitect(scriptLlm, "f").plan({ projectId: "d", userInput: "CẢNH 1: nói\nLINH: thoại\nCẢNH 2: nói\nLINH: thoại\nCẢNH 3: chốt\nLINH: thoại", settings: scriptSettings, references: [], metadata: { scriptFirst: "true" } });
const scriptShots = new ShotPlanner().plan({ projectId: "d", scenes: scriptPlan.scenes, settings: scriptSettings, metadata: {} });
check("scripted_beat_chunks_into_multiple_clips", scriptShots.length >= 2, `shots=${scriptShots.length}`);
const firstShot = scriptShots[0];
const contShot = scriptShots.find((shot) => shot.spokenLineContinuation === true);
check("first_chunk_carries_verbatim_line", Boolean(firstShot?.spokenLine), "");
check("continuation_chunk_flagged", Boolean(contShot), "");
if (contShot) {
  const contPrompt = compiler.compile({ shot: contShot, settings: scriptSettings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt;
  check("continuation_no_word_cap", !/Keep narration under about \d+ spoken words/i.test(contPrompt) && !/keep spoken words within about \d+ words/i.test(contPrompt), "");
  check("continuation_pacing_sentence_present", /Continue the beat's scripted narration seamlessly/i.test(contPrompt), "");
  check("continuation_override_note_present", /continuation note overrides/i.test(contPrompt), "");
  const baseIntent = (contShot.audioIntent ?? "").split("; CONTINUATION (clip ")[0].trim();
  const basePrintCount = baseIntent ? contPrompt.split(baseIntent).length - 1 : 0;
  check("continuation_dedup_base_printed_once", basePrintCount <= 1, `count=${basePrintCount}`);
  check("continuation_under_ci_length_ceiling", contPrompt.length <= 8000, `len=${contPrompt.length}`);
}

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.register-audio-coherence-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
