#!/usr/bin/env node
/**
 * No-spend regression for the single-clip voice-over word budget (cross-audit B5).
 * When several scripted beats collapse into ONE physical clip (single_clip workflow), the merged
 * spoken line cannot exceed what the clip's runtime can actually speak (~2.8 words/second). Proves:
 * (1) an over-long multi-beat script is capped to the duration budget, keeping the OPENING words
 * (the hook), and (2) a short script that already fits is passed through verbatim, uncapped. Pure —
 * the LLM provider is faked, no network, no render.
 */

import { StoryArchitect } from "../dist/agents/story-architect.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// A fake provider that emits N beats, each carrying a fixed spoken line, so the single-clip
// collapse has real dialogue to merge and cap.
function fakeProviderWithBeats(spokenLinesPerBeat) {
  return {
    name: "fake-single-clip-llm",
    async chat() {
      return { provider: "atlascloud", modelId: "fake", content: "{}", raw: {}, latencyMs: 0 };
    },
    async structured() {
      const scenes = spokenLinesPerBeat.map((line, index) => ({
        sceneId: `scene_${index + 1}`,
        title: `Beat ${index + 1}`,
        beats: [
          {
            beatId: `beat_${index + 1}`,
            purpose: index === 0 ? "hook" : "proof",
            action: `Show proof beat ${index + 1}.`,
            subject: "approved product subject",
            camera: "vertical handheld phone camera",
            lighting: "clean soft daylight",
            durationSeconds: 5,
            spokenLine: line,
            emotionalTurn: index === 0 ? "curious -> hooked" : "hooked -> convinced",
            risks: []
          }
        ]
      }));
      const value = { premise: "Fake single-clip plan", targetDurationSeconds: 15, scenes };
      return { provider: "atlascloud", modelId: "fake", content: JSON.stringify(value), raw: {}, latencyMs: 0, value };
    },
    capabilities() {
      return [];
    }
  };
}

const baseSettings = {
  tier: "fast",
  resolution: "480p",
  qualityMode: "economy",
  ratio: "9:16",
  durationTargetSeconds: 15,
  audioMode: "voiceover",
  watermark: false,
  returnLastFrame: true
};
const singleClipMetadata = { shortPipelineRecommendedWorkflowMode: "single_clip" };

// --- 1. Over-long script (5 beats × ~20 words = ~100 words) capped to the 15s budget (floor(15*2.8)=42).
const longLine = "này mọi người ơi mình vừa thử xong cái serum này xong da mình nó căng mượt lên hẳn luôn á nha"; // ~21 words
const longArchitect = new StoryArchitect(fakeProviderWithBeats([longLine, longLine, longLine, longLine, longLine]), "fake");
const longPlan = await longArchitect.plan({
  projectId: "single_clip_vo_budget_long",
  userInput: "Làm 1 clip review serum 15 giây giọng nói tiếng Việt.",
  settings: baseSettings,
  references: [],
  metadata: singleClipMetadata
});
const longClipLine = longPlan.scenes[0]?.beats[0]?.spokenLine ?? "";
// A merged single-clip line is DIRECT SPEECH (TTS/avatar), so it is capped at the talking rate
// (4 w/s measured on VN TTS), not the 2.8 narration-budget rate: a 15s clip really can speak 60
// Vietnamese words. Capping at 2.8 here deleted ~30% of every line and shipped short videos.
const budget = Math.floor(15 * 4); // 60
check("collapsed_to_single_clip", longPlan.scenes.length === 1 && longPlan.scenes[0]?.beats.length === 1);
check("long_vo_capped_to_budget", wordCount(longClipLine) <= budget && wordCount(longClipLine) > 0, `words=${wordCount(longClipLine)} budget=${budget}`);
check("long_vo_keeps_opening_hook", longClipLine.startsWith("này mọi người ơi"), longClipLine.slice(0, 40));
check("long_vo_no_trailing_punct", !/[,;:—-]$/.test(longClipLine.trim()), longClipLine.slice(-12));

// --- 2. A short script that already fits is passed through verbatim (no over-eager truncation).
const shortLine = "cái này xịn lắm nha"; // ~5 words
const shortArchitect = new StoryArchitect(fakeProviderWithBeats([shortLine, shortLine]), "fake");
const shortPlan = await shortArchitect.plan({
  projectId: "single_clip_vo_budget_short",
  userInput: "Làm 1 clip 15 giây.",
  settings: baseSettings,
  references: [],
  metadata: singleClipMetadata
});
const shortClipLine = shortPlan.scenes[0]?.beats[0]?.spokenLine ?? "";
check("short_vo_passthrough_unchanged", shortClipLine === `${shortLine} ${shortLine}`, `line="${shortClipLine}"`);

// --- 3. SCRIPT-FIRST verbatim guard (self-audit regression): when the customer PASTED their own
// finished script, an over-long merged line must be preserved WORD-FOR-WORD — never capped — because
// the compiler still emits it under a "deliver verbatim, do not shorten" contract. Same 5 long beats,
// but metadata.scriptFirst="true": the join must survive uncapped even though it exceeds the budget.
const scriptFirstArchitect = new StoryArchitect(fakeProviderWithBeats([longLine, longLine, longLine, longLine, longLine]), "fake");
const scriptFirstPlan = await scriptFirstArchitect.plan({
  projectId: "single_clip_vo_budget_script_first",
  userInput: "Kịch bản khách dán vào.",
  settings: baseSettings,
  references: [],
  metadata: { ...singleClipMetadata, scriptFirst: "true" }
});
const scriptFirstClipLine = scriptFirstPlan.scenes[0]?.beats[0]?.spokenLine ?? "";
const expectedVerbatim = [longLine, longLine, longLine, longLine, longLine].join(" ");
check("script_first_preserves_verbatim", scriptFirstClipLine === expectedVerbatim, `words=${wordCount(scriptFirstClipLine)} (uncapped, > ${budget})`);
check("script_first_exceeds_budget_uncapped", wordCount(scriptFirstClipLine) > budget, `words=${wordCount(scriptFirstClipLine)}`);

// --- 4. BOOLEAN scriptFirst flag (adversarial-audit #4): the direct API route passes raw JSON where
// scriptFirst arrives as a literal boolean `true`; the shared predicate must honor it identically —
// silently capping a customer's pasted script because the flag wasn't a string is the exact
// regression the exception exists to prevent.
const boolFlagArchitect = new StoryArchitect(fakeProviderWithBeats([longLine, longLine, longLine, longLine, longLine]), "fake");
const boolFlagPlan = await boolFlagArchitect.plan({
  projectId: "single_clip_vo_budget_bool_flag",
  userInput: "Kịch bản khách dán vào.",
  settings: baseSettings,
  references: [],
  metadata: { ...singleClipMetadata, scriptFirst: true }
});
const boolFlagLine = boolFlagPlan.scenes[0]?.beats[0]?.spokenLine ?? "";
check("boolean_script_first_flag_preserves_verbatim", boolFlagLine === expectedVerbatim, `words=${wordCount(boolFlagLine)}`);

// --- 5. Explicit "single" workflow beyond the 15s provider-clip ceiling is NOT collapsed
// (adversarial-audit #3): a 60s "single" would chunk anyway and cram the whole merged line onto the
// first ≤15s sub-clip. The plan must stay multi-beat instead.
const sixtyArchitect = new StoryArchitect(fakeProviderWithBeats([longLine, longLine, longLine]), "fake");
const sixtyPlan = await sixtyArchitect.plan({
  projectId: "single_clip_vo_budget_60s_explicit_single",
  userInput: "Làm 1 clip 60 giây.",
  settings: { ...baseSettings, durationTargetSeconds: 60 },
  references: [],
  metadata: { workflowMode: "single" }
});
const sixtyBeatCount = sixtyPlan.scenes.flatMap((scene) => scene.beats).length;
check("explicit_single_over_15s_not_collapsed", sixtyBeatCount > 1, `beats=${sixtyBeatCount}`);

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.single-clip-vo-budget-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
