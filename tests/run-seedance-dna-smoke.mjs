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
// 1b. Audio is NEVER left blank even with no audioIntent/spokenLine — otherwise Seedance dubs a
// generic library score over the clip. And it must never phrase it as "Audio: Silent".
check("audio_floor_never_blank", plain.prompt.includes("Audio design:") && !plain.prompt.includes("Audio: Silent"));
// 1c. The always-on anti-AI-look floor now guards the two loudest human tells: waxy skin + dead eyes.
check("antiai_skin_and_eye_floor", plain.prompt.includes("never waxy, plastic") && plain.prompt.includes("living eyes"));
// 1d. An UNRESOLVED register gets the NEUTRAL capture wording, not the cinematic gloss ("speculars")
// that would impose an AI-ad look on an unlabeled brief (audit #9).
check("unresolved_register_neutral_capture", plain.prompt.includes("photoreal camera capture") && !plain.prompt.includes("physically based speculars"));

// 2. Short-pipeline metadata keys fire the DNA section end-to-end.
const shortKeys = compile({ shortViralNiche: "beauty_skincare", shortViralCreativeMode: "ugc_review" });
check("short_keys_fire_niche_dna", shortKeys.prompt.includes("Niche DNA (beauty_skincare)"));
check("short_keys_fire_mode_dna", shortKeys.prompt.includes("Creative-mode DNA (ugc_review)"));

// 3. Direct keys also work for long-form/direct callers.
const directKeys = compile({ niche: "food_beverage", creativeMode: "cinematic" });
check("direct_keys_fire_dna", directKeys.prompt.includes("Niche DNA (food_beverage)") && directKeys.prompt.includes("Creative-mode DNA (cinematic)"));

// 3b. Register is the single source of truth for STYLE (audit #12): a keyword creative mode bound to
// the OPPOSITE register is dropped from the DNA lookup (its cinematic language must never sit under a
// phone-KOL register frame), while niche texture is kept; an AGREEING mode still fires.
const conflicted = compiler.compile({
  shot: { ...shotFixture({ shortViralNiche: "beauty_skincare", shortViralCreativeMode: "product_ad" }), styleDna: { register: "natural_phone_kol" } },
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("conflicting_mode_dna_dropped_under_register", !conflicted.prompt.includes("Creative-mode DNA (product_ad)") && conflicted.prompt.includes("Niche DNA (beauty_skincare)") && conflicted.prompt.includes("Style register: natural phone-shot / KOL."));
const agreeing = compiler.compile({
  shot: { ...shotFixture({ shortViralNiche: "beauty_skincare", shortViralCreativeMode: "ugc_review" }), styleDna: { register: "natural_phone_kol" } },
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("agreeing_mode_dna_kept_under_register", agreeing.prompt.includes("Creative-mode DNA (ugc_review)"));

// 3c. Single-clip contradiction fixes (audit #5 follow-up): a VERBATIM spokenLine suppresses the
// word CAPS ("do not shorten" must never sit next to "keep under N words"); and a full_video clip
// with no neighbors gets NO "cut together with adjacent clips" boundary bookkeeping.
const verbatimShot = compiler.compile({
  shot: {
    ...shotFixture({ videoArcRole: "full_video" }),
    spokenLine: "Line one. Line two. Line three.",
    transitionIntent: "hand off to the next proof beat",
    timeline: [
      { startSecond: 0, endSecond: 4, action: "hook", audioCue: "spoken hook starts" },
      { startSecond: 4, endSecond: 8, action: "proof", audioCue: "narration supports" }
    ]
  },
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("verbatim_line_suppresses_word_caps", !verbatimShot.prompt.includes("Keep narration under about") && !verbatimShot.prompt.includes("words for this beat") && verbatimShot.prompt.includes("Pace the scripted line naturally"));
check("full_video_clip_has_no_adjacent_clip_boundary", !verbatimShot.prompt.includes("cut together with adjacent clips"));
// (The keep-budget-for-free-narration case is asserted for real in run-short-pipeline-smoke's
// storyboard prompt contract — its beats have audioIntent and no spokenLine.)

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
