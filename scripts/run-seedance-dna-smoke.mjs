/**
 * No-spend smoke for the Seedance prompt-DNA engine.
 * Proves that niche/creative-mode DNA resolves for every mode, falls back safely for
 * unknown niches, fires end-to-end through the SeedancePromptCompiler when shot metadata
 * carries the short-pipeline keys, and that seed/guidance settings reach the video request.
 * No network, no provider calls, no spend.
 */

import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";
import {
  CREATIVE_MODE_DNA,
  GENERIC_NICHE_DNA,
  NICHE_DNA,
  resolveSeedanceDna,
  SEEDANCE_ANATOMY_DIRECTIVE
} from "../dist/core/seedance-dna.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

function shotFixture(metadata) {
  return {
    shotId: "shot_dna_smoke_1",
    durationSeconds: 8,
    intent: "Show the product solving the desk-cable mess in one visible pass",
    subject: "A creator's hand and a magnetic cable organizer on a wooden desk",
    action: "Hand snaps the cable into the organizer, then pans to the tidy result",
    camera: "Handheld phone close-up, slight natural sway",
    lighting: "Warm window key light from the left with soft fill",
    references: [],
    continuity: {},
    risks: [],
    ...(metadata ? { metadata } : {})
  };
}

const compiler = new SeedancePromptCompiler();
function compile(metadata, settingsOverride = {}) {
  return compiler.compile({
    shot: shotFixture(metadata),
    settings: { ...DEFAULT_SEEDANCE_SETTINGS, ...settingsOverride },
    modelId: "seedance-2-0-smoke",
    provider: "atlascloud"
  });
}

// 1. Without niche metadata the DNA section must not fire, realism guardrails still do.
const plain = compile(undefined);
check("no_metadata_no_dna", !plain.prompt.includes("Niche DNA ("));
check("realism_guardrails_always_on", plain.prompt.includes("Realism guardrails:"));

// 2. Short-pipeline metadata keys fire the DNA section end-to-end.
const shortKeys = compile({ shortViralNiche: "beauty_skincare", shortViralCreativeMode: "ugc_review" });
check("short_keys_fire_niche_dna", shortKeys.prompt.includes("Niche DNA (beauty_skincare)"));
check("short_keys_fire_mode_dna", shortKeys.prompt.includes("Creative-mode DNA (ugc_review)"));

// 3. Direct keys also work for long-form/direct callers.
const directKeys = compile({ niche: "food_beverage", creativeMode: "cinematic" });
check("direct_keys_fire_dna", directKeys.prompt.includes("Niche DNA (food_beverage)") && directKeys.prompt.includes("Creative-mode DNA (cinematic)"));

// 4. Unknown niches fall back to grounded realism instead of failing.
const unknown = resolveSeedanceDna({ niche: "quantum_farming" });
check("unknown_niche_falls_back", unknown.nicheDirective === GENERIC_NICHE_DNA);
const unknownCompiled = compile({ shortViralNiche: "quantum_farming" });
check("unknown_niche_compiles", unknownCompiled.prompt.includes("Niche DNA (quantum_farming)"));

// 5. Every creative mode and every niche entry is non-empty; coverage is broad.
const modeEntries = Object.entries(CREATIVE_MODE_DNA);
check("all_modes_covered", modeEntries.length >= 9 && modeEntries.every(([, value]) => value.trim().length > 40));
const nicheEntries = Object.entries(NICHE_DNA);
check("niche_coverage_broad", nicheEntries.length >= 25 && nicheEntries.every(([, value]) => value.trim().length > 40));
check("saas_b2b_present", Boolean(NICHE_DNA.saas_b2b));
check("anatomy_directive_present", SEEDANCE_ANATOMY_DIRECTIVE.includes("timestamped shot/camera plan"));

// 6. Hook DNA: every creative mode carries first-1.5s hook direction.
check("hook_dna_every_mode", modeEntries.every(([, value]) => value.includes("First 1.5s hook:")));

// 7. Seed/guidance settings flow into the provider-neutral video request.
const seeded = compile(undefined, { seed: 42, guidanceScale: 7.5 });
check("seed_flows_to_video_request", seeded.videoRequest.settings.seed === 42);
check("guidance_flows_to_video_request", seeded.videoRequest.settings.guidanceScale === 7.5);
const unseeded = compile(undefined);
check("seed_absent_by_default", unseeded.videoRequest.settings.seed === undefined && unseeded.videoRequest.settings.guidanceScale === undefined);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.seedance-dna-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing seedance-dna.ts, prompt-compiler DNA seams, or short-pipeline metadata keys.",
    "Extend NICHE_DNA when audience-niche-intelligence adds new niche codes."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
