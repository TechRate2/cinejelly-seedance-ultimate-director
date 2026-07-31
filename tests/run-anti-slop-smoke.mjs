#!/usr/bin/env node
/**
 * No-spend regression for the anti-slop lexicon + source-side authoring directive. Pure string
 * work — no network, no provider, no spend.
 *  - empty superlatives / resolution-theatre / self-praise are dropped; empty-atmosphere and
 *    vague-quality words are swapped for concrete cinematography;
 *  - the rewrite is idempotent and never reintroduces filler (every concrete is slop-free);
 *  - HIGH-PRECISION: legitimate words ("professional", "perfect") and boundary cases ("8kg",
 *    "cinematically") are left untouched.
 */

import { readFileSync } from "node:fs";
import {
  rewriteSlop,
  slopDensityScore,
  listSlopTerms,
  antiSlopDirective
} from "../dist/core/anti-slop-lexicon.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}
const lower = (s) => s.toLowerCase();

// ---- Part A: removals + swaps. ----
const r1 = rewriteSlop("a stunning breathtaking sunset over the sea");
check("drops_empty_superlatives", !/stunning|breathtaking/i.test(r1.rewritten) && r1.slopCount === 2, `${r1.slopCount}:${r1.rewritten}`);

const r2 = rewriteSlop("cinematic hero shot of the product");
check("maps_cinematic_to_concrete", /shallow depth of field/i.test(r2.rewritten) && !/\bcinematic\b/i.test(r2.rewritten), r2.rewritten);

const r3 = rewriteSlop("8K ultra hd hyper-detailed footage, masterpiece");
check("drops_resolution_theater_and_praise", !/8k|ultra hd|hyper-detailed|masterpiece/i.test(r3.rewritten) && r3.slopCount === 4, `${r3.slopCount}:${r3.rewritten}`);

const r4 = rewriteSlop("stunning cinematic 8K masterpiece");
check("heavy_slop_all_replaced", r4.slopCount === 4 && /shallow depth of field/i.test(r4.rewritten) && !/stunning|masterpiece|8k/i.test(r4.rewritten), `${r4.slopCount}:${r4.rewritten}`);
check("heavy_slop_verdict_rewrite", r4.verdict === "rewrite", r4.verdict);

// ---- Part B: idempotency + no reintroduction. ----
const once = rewriteSlop("epic cinematic atmospheric 4K masterpiece scene");
const twice = rewriteSlop(once.rewritten);
check("idempotent_second_pass_clean", twice.slopCount === 0, `${twice.slopCount}:${twice.rewritten}`);
// Every concrete replacement must itself be slop-free (proves no reintroduction, for the whole lexicon).
let dirtyConcrete = [];
for (const term of listSlopTerms()) {
  const swap = rewriteSlop(term);
  const reSwap = rewriteSlop(swap.rewritten);
  if (reSwap.slopCount !== 0) { dirtyConcrete.push(term); }
}
check("no_concrete_reintroduces_slop", dirtyConcrete.length === 0, dirtyConcrete.join(","));

// ---- Part C: HIGH-PRECISION — legitimate words + boundaries untouched. ----
const legit = "a professional presenter holds a perfect circle in a bright studio";
const rl = rewriteSlop(legit);
check("legit_words_untouched", rl.slopCount === 0 && rl.rewritten === legit, `${rl.slopCount}:${rl.rewritten}`);
check("boundary_8kg_not_matched", rewriteSlop("an 8kg dumbbell").slopCount === 0, rewriteSlop("an 8kg dumbbell").rewritten);
check("boundary_cinematically_not_matched", rewriteSlop("shot cinematically well").slopCount === 0, rewriteSlop("shot cinematically well").rewritten);

// ---- Part D: density scoring + safety. ----
check("clean_text_verdict_clean", slopDensityScore("a woman applies cream to her face").verdict === "clean");
const ds = slopDensityScore("stunning gorgeous breathtaking");
check("all_slop_density_one", ds.density === 1 && ds.verdict === "rewrite", `${ds.density}:${ds.verdict}`);
check("empty_string_safe", rewriteSlop("").slopCount === 0 && rewriteSlop("").rewritten === "");
check("non_string_safe", rewriteSlop(null).rewritten === "" && rewriteSlop(undefined).slopCount === 0);

// ---- Part E: lexicon hygiene. ----
const terms = listSlopTerms();
check("lexicon_non_empty", terms.length >= 25, `${terms.length}`);
check("all_terms_lowercase", terms.every((t) => t === lower(t)));
check("no_duplicate_terms", new Set(terms).size === terms.length, `${terms.length} vs ${new Set(terms).size}`);

// ---- Part F: punctuation tidy after dropping filler (from the adversarial audit). ----
check("tidy_comma_bang", rewriteSlop("wow, stunning!").rewritten === "wow!", rewriteSlop("wow, stunning!").rewritten);
check("tidy_comma_question", rewriteSlop("wow, stunning?").rewritten === "wow?", rewriteSlop("wow, stunning?").rewritten);
check("tidy_leading_period", rewriteSlop("stunning. great").rewritten === "great", rewriteSlop("stunning. great").rewritten);
check("tidy_leading_bang", rewriteSlop("stunning! great").rewritten === "great", rewriteSlop("stunning! great").rewritten);
check("tidy_no_orphan_punct", !/[,;:]\s*[.!?]/.test(rewriteSlop("push in, stunning!").rewritten), rewriteSlop("push in, stunning!").rewritten);

// ---- Part G: density counts multiword slop by words (not per-match). ----
check("multiword_density_full", slopDensityScore("hyper detailed").density === 1, `${slopDensityScore("hyper detailed").density}`);

// ---- Part H: anti-slop AUTHORING directive (prevents slop at the source, not by rewriting). ----
const dir = antiSlopDirective();
check("directive_mentions_anti_slop", /ANTI-SLOP/.test(dir) && /85mm|shallow depth of field/.test(dir), dir.slice(0, 60));
check("directive_lists_banned_terms", /stunning|masterpiece|8K/i.test(dir));
const architectSrc = readFileSync(new URL("../src/agents/story-architect.ts", import.meta.url), "utf8");
check("story_architect_injects_anti_slop", architectSrc.includes("antiSlopDirective("));

// ---- Part I: ENFORCEMENT (audit #2) — the guardian scores LLM-authored shot fields pre-spend. ----
// Score-only warn: slop in authored fields surfaces as a finding; a clean shot stays clean; and a
// warn NEVER blocks spend (only block/repair do), so this is visibility, not a new failure mode.
const { ConsistencyGuardian } = await import("../dist/core/consistency-guardian.js");
const guardian = new ConsistencyGuardian();
const baseShot = {
  shotId: "slop_gate_shot",
  durationSeconds: 6,
  intent: "hook",
  subject: "creator with serum",
  action: "creator lifts the serum toward the lens and taps the cap twice",
  camera: "handheld phone close-up at arm's length",
  lighting: "window daylight from the left",
  references: [],
  risks: [],
  continuity: {}
};
const emptyLedger = { characters: [], styles: [] };
const cleanReport = guardian.preflight({ shot: baseShot, prompt: "p", negativePrompt: "", ledger: emptyLedger });
check("clean_authored_fields_no_slop_finding", !cleanReport.findings.some((f) => f.checkpoint === "authored_slop_density"));
const sloppyReport = guardian.preflight({
  shot: { ...baseShot, camera: "stunning cinematic epic camera", style: "breathtaking masterpiece 8k vibe" },
  prompt: "p",
  negativePrompt: "",
  ledger: emptyLedger
});
const slopFinding = sloppyReport.findings.find((f) => f.checkpoint === "authored_slop_density");
check("sloppy_authored_fields_flagged", Boolean(slopFinding) && slopFinding.status === "warn", JSON.stringify(slopFinding ?? null));
check("slop_finding_names_fields", Boolean(slopFinding) && /camera/.test(slopFinding.evidence) && /style/.test(slopFinding.evidence));
check("slop_gate_warn_never_blocks", sloppyReport.status === "warn" || sloppyReport.status === "pass", sloppyReport.status);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.anti-slop-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep green when adding slop terms or changing the rewrite/density rules.",
    "The Story Architect is told to avoid filler at authoring time via antiSlopDirective(); rewriteSlop/slopDensityScore stay available for QA scoring."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
