#!/usr/bin/env node
/**
 * No-spend smoke for the reliable-Seedance cinematic grammar + reference disambiguation.
 * Proves the mode-appropriate cinematography line (focus/lens/lighting/grade), that UGC
 * stays honest while cinematic goes full film language, that the compiler emits it end to
 * end, and that identity/product references carry disambiguation ("take X, not background").
 */

import { cinematicGrammarPromptLine, resolveCinematicGrammar } from "../dist/core/seedance-cinematic-grammar.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// Mode-appropriate cinematography.
check("ugc_stays_honest_no_heavy_grade", /no heavy grade/.test(cinematicGrammarPromptLine("ugc_review")) && !/anamorphic/.test(cinematicGrammarPromptLine("ugc_review")));
check("cinematic_uses_film_language", /anamorphic/.test(cinematicGrammarPromptLine("cinematic")) && /rack focus/.test(cinematicGrammarPromptLine("cinematic")));
check("product_ad_specular_and_rack_focus", /specular/.test(cinematicGrammarPromptLine("product_ad")) && /rack focus/.test(cinematicGrammarPromptLine("product_ad")));
check("education_stays_clear_deep_focus", /deep focus/.test(cinematicGrammarPromptLine("education")));
check("unknown_mode_grounded_fallback", /natural/.test(cinematicGrammarPromptLine("totally_unknown")));
const grammar = resolveCinematicGrammar("cinematic");
check("grammar_has_four_axes", Boolean(grammar.focus && grammar.lighting && grammar.colorGrade && grammar.lens));
check("line_is_single_compact_sentence", cinematicGrammarPromptLine("story").startsWith("Cinematography:") && cinematicGrammarPromptLine("story").split(".").length <= 3);

// Compiler emits the cinematography line for a creative-mode shot.
const compiler = new SeedancePromptCompiler();
function shot(mode, extra = {}) {
  return {
    shotId: "s1",
    sceneId: "sc1",
    intent: "hook",
    action: "creator lifts the serum",
    subject: "creator and serum",
    camera: "handheld",
    lighting: "soft window light",
    durationSeconds: 6,
    references: [],
    risks: [],
    continuity: {},
    metadata: { shortViralCreativeMode: mode, ...extra }
  };
}
const cinematicPrompt = compiler.compile({ shot: shot("cinematic"), settings: { ...DEFAULT_SEEDANCE_SETTINGS }, modelId: "seedance-2-0", provider: "atlascloud" }).prompt;
// Register engine (final upgrade): mapped creative modes emit the REGISTER frame instead of the
// legacy Cinematography line — professional_cinematic covers optics/light/color/motion.
check("compiler_emits_cinematic_register", cinematicPrompt.includes("Style register: professional cinematic.") && cinematicPrompt.includes("shallow depth of field"));
// Craft FLOOR (audit #4): the cinematic register now ALSO re-attaches the Seedance-reliable film
// vocabulary (was lost on the register path) when styleDna hasn't authored the look.
check("cinematic_register_keeps_film_vocab_floor", cinematicPrompt.includes("Cinematography:") && /anamorphic|rack focus|grade/.test(cinematicPrompt));
// Cross-audit #5: when the film-vocab floor fires it carries optics/lighting/grade, so the register
// frame's GENERIC optics ("Cinema-camera capture: …") must be OMITTED — not printed a second time.
check("cinematic_floor_omits_duplicate_register_optics", !cinematicPrompt.includes("Cinema-camera capture") && (cinematicPrompt.match(/shallow depth of field/g) || []).length <= 1);
const ugcPrompt = compiler.compile({ shot: shot("ugc_review"), settings: { ...DEFAULT_SEEDANCE_SETTINGS }, modelId: "seedance-2-0", provider: "atlascloud" }).prompt;
check("compiler_ugc_register_differs", ugcPrompt.includes("Style register: natural phone-shot / KOL.") && ugcPrompt.includes("NO cinematic bokeh") && !ugcPrompt.includes("Style register: professional cinematic."));
// The film-look floor is cinematic-only — a natural phone/KOL shot must NOT get anamorphic/grade language.
check("ugc_gets_no_cinematic_floor", !ugcPrompt.includes("Cinematography:"));

// Reference disambiguation appears when identity/product references are bound.
const identityShot = {
  shotId: "s2",
  sceneId: "sc1",
  intent: "demo",
  action: "hold the product to camera",
  subject: "KOL and product",
  camera: "handheld",
  lighting: "soft",
  durationSeconds: 6,
  risks: ["face", "product_logo"],
  continuity: {},
  references: [
    { role: "identity", label: "KOL", priority: "primary", providerReference: { kind: "image", uri: "upload://up_0123456789abcdef.png" }, selection: { characterId: "kol", view: "front" } },
    { role: "product", label: "Serum", priority: "primary", providerReference: { kind: "image", uri: "upload://up_abcdef0123456789.png" } }
  ],
  metadata: { shortViralCreativeMode: "product_ad" }
};
const refPrompt = compiler.compile({ shot: identityShot, settings: { ...DEFAULT_SEEDANCE_SETTINGS }, modelId: "seedance-2-0", provider: "atlascloud" }).prompt;
check("identity_reference_disambiguation", /take only the person's face/.test(refPrompt));
check("product_reference_disambiguation", /exact product shape/.test(refPrompt));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.cinematic-grammar-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing the cinematic grammar vocabulary, mode mappings, or the compiler cinematography/disambiguation sections.",
    "Cinematography direction is a prompt-quality lift; its visual benefit is confirmed only on a real paid render."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
