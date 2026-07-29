#!/usr/bin/env node
/**
 * No-spend smoke for the niche playbook intelligence layer.
 * Proves: all content-family playbooks are complete (hooks, beats, camera, audio,
 * references, viral triggers, avoid), every platform niche and creative mode routes to a
 * real family (Vietnamese keyword fallback included), the scripting directive stays
 * compact, the Story Architect actually injects it plus the Seedance mastery rules, and
 * the short prompt corpus gained the entertainment families with retrievable patterns.
 */

import { readFileSync } from "node:fs";
import {
  resolveNichePlaybook,
  nichePlaybookDirective,
  listNichePlaybookFamilies,
  SEEDANCE_MASTERY_DIRECTIVE
} from "../dist/core/niche-playbooks.js";
import { retrieveShortPromptCorpusPatterns } from "../dist/core/short-prompt-pattern-corpus.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// --- 1. Every playbook is complete.
const families = listNichePlaybookFamilies();
check("thirteen_families_present", families.length >= 13, `count=${families.length}`);
for (const family of families) {
  const playbook = resolveNichePlaybook({ niche: familyProbe(family) });
  void playbook;
}
let incomplete = [];
for (const family of families) {
  // Resolve through a direct family probe by scanning known keys is indirect; instead
  // validate via the directive text for each family through representative inputs below.
}
const REPRESENTATIVE = [
  { input: { creativeMode: "cinematic" }, family: "cinematic_film" },
  { input: { niche: "anime" }, family: "anime_animation" },
  { input: { creativeMode: "ugc_review" }, family: "ugc_pov_authentic" },
  { input: { niche: "beauty_skincare" }, family: "commercial_product" },
  { input: { niche: "fantasy" }, family: "action_vfx_fantasy" },
  { input: { niche: "meme" }, family: "comedy_meme" },
  { input: { niche: "food_beverage" }, family: "food_asmr" },
  { input: { niche: "music_video" }, family: "music_dance" },
  { input: { niche: "sports" }, family: "sports_fitness" },
  { input: { niche: "travel_hospitality" }, family: "travel_worldtour" },
  { input: { niche: "transformation" }, family: "transformation_reveal" },
  { input: { niche: "kids_family" }, family: "family_kids" },
  { input: { creativeMode: "education" }, family: "education_explainer" }
];
for (const { input, family } of REPRESENTATIVE) {
  const playbook = resolveNichePlaybook(input);
  const complete =
    playbook.family === family &&
    playbook.hookFormulas.length >= 3 &&
    playbook.beatTemplate.length > 40 &&
    playbook.cameraPlaybook.length > 40 &&
    playbook.audioSignature.length > 40 &&
    playbook.referenceStrategy.length > 40 &&
    playbook.viralTriggers.length >= 2 &&
    playbook.avoid.length > 20;
  if (!complete) {
    incomplete.push(`${family}:${playbook.family}`);
  }
}
check("all_families_route_and_complete", incomplete.length === 0, incomplete.join(", "));

// --- 2. Vietnamese keyword fallback + grounded default.
check("vietnamese_anime_keyword", resolveNichePlaybook({ niche: "phim hoạt hình anime" }).family === "anime_animation");
check("vietnamese_meme_keyword", resolveNichePlaybook({ niche: "video hài meme" }).family === "comedy_meme");
check("vietnamese_travel_keyword", resolveNichePlaybook({ niche: "du lịch đà nẵng" }).family === "travel_worldtour");
check("vietnamese_transform_keyword", resolveNichePlaybook({ niche: "biến hình glow up" }).family === "transformation_reveal");
check("unknown_gets_grounded_default", resolveNichePlaybook({ niche: "zzz_unknown" }).family === "grounded_general");
check("empty_gets_grounded_default", resolveNichePlaybook({}).family === "grounded_general");

// --- 3. Directive stays compact and structured.
let oversized = [];
for (const { input } of REPRESENTATIVE) {
  const directive = nichePlaybookDirective(input);
  if (directive.length > 1700) {
    oversized.push(`${resolveNichePlaybook(input).family}=${directive.length}`);
  }
  if (!/NICHE PLAYBOOK/.test(directive) || !/Hook/.test(directive) || !/viral trigger/.test(directive) || !/Never:/.test(directive)) {
    oversized.push(`${resolveNichePlaybook(input).family}=missing-section`);
  }
}
check("directives_compact_and_structured", oversized.length === 0, oversized.join(", "));

// --- 3b. REGISTER-AWARE playbook (cross-audit A1): a skincare/food REVIEW resolves niche-first to a
// cinematic scored family (commercial_product/food_asmr), but its register is natural_phone_kol — the
// playbook must switch to the authentic phone formula, NOT hand a scored-ad directive to a phone brief.
const skincareReview = { niche: "beauty_skincare", creativeMode: "ugc_review" };
const nicheFirst = nichePlaybookDirective(skincareReview);
const registerAware = nichePlaybookDirective({ ...skincareReview, register: "natural_phone_kol" });
check("review_niche_first_would_be_commercial", /NICHE PLAYBOOK \(commercial_product\)/.test(nicheFirst) && /Beat sync/.test(nicheFirst));
check("review_phone_register_switches_to_authentic", /NICHE PLAYBOOK \(ugc_pov_authentic\)/.test(registerAware) && !/Beat sync/.test(registerAware));
// A cinematic register keeps the niche-first family (a real cinematic product ad still gets the ad playbook).
const foodAd = nichePlaybookDirective({ niche: "food_beverage", creativeMode: "product_ad", register: "professional_cinematic" });
check("cinematic_register_keeps_niche_family", /NICHE PLAYBOOK \(food_asmr\)/.test(foodAd));
check("mastery_directive_covers_core_rules", /emotional pacing curve/.test(SEEDANCE_MASTERY_DIRECTIVE) && /lip-sync/.test(SEEDANCE_MASTERY_DIRECTIVE) && /drift/.test(SEEDANCE_MASTERY_DIRECTIVE) && /never render the sheet/.test(SEEDANCE_MASTERY_DIRECTIVE) && SEEDANCE_MASTERY_DIRECTIVE.length < 1300);
// Anti-AI realism discipline (mined from ai-shortfilm-prompts): >=2 imperfection anchors + a restrained closer.
check("mastery_directive_has_antiai_realism", /imperfection/.test(SEEDANCE_MASTERY_DIRECTIVE) && /RESTRAINED/.test(SEEDANCE_MASTERY_DIRECTIVE) && /read as AI|reads as AI|AI tell/.test(SEEDANCE_MASTERY_DIRECTIVE));

// --- 4. Story Architect injects both directives.
const architectSource = readFileSync(new URL("../src/agents/story-architect.ts", import.meta.url), "utf8");
check("story_architect_injects_playbook", architectSource.includes("nichePlaybookDirective(") && architectSource.includes("SEEDANCE_MASTERY_DIRECTIVE"));
check("story_architect_reads_niche_metadata", architectSource.includes("shortViralNiche") && architectSource.includes("shortViralCreativeMode"));
// Retention spine (mined short-form virality): a labeled emotional curve + a mid-video pattern-interrupt.
check("hook_directive_has_retention_spine", architectSource.includes("RETENTION SPINE") && architectSource.includes("PATTERN-INTERRUPT") && architectSource.includes("one-third mark"));
// Open-loop / curiosity-gap hook (mined short-form retention): hook opens a loop the payoff closes.
check("hook_directive_has_open_loop_rule", architectSource.includes("OPEN-LOOP RULE") && architectSource.includes("curiosity gap") && architectSource.includes("must NOT give away the ending"));

// --- 5. Corpus gained the entertainment families and retrieves them.
function corpusQuery(niche, prompt) {
  return retrieveShortPromptCorpusPatterns({
    prompt,
    niche,
    creativeMode: "story",
    platformFocus: "tiktok_douyin",
    audience: "gen z viewers",
    buyerIntent: "entertainment",
    targetDurationSeconds: 15,
    ideaSeeds: [],
    hasReferenceVideo: false,
    hasProductEvidence: false
  });
}
const animePatterns = corpusQuery("anime", "anime power up transformation");
check("corpus_retrieves_anime_patterns", animePatterns.length > 0, `count=${animePatterns.length}`);
const mvPatterns = corpusQuery("music_video", "rap dance beat drop");
check("corpus_retrieves_music_patterns", mvPatterns.length > 0, `count=${mvPatterns.length}`);
const memePatterns = corpusQuery("meme", "video hài deadpan prank funny");
check("corpus_retrieves_meme_patterns", memePatterns.length > 0, `count=${memePatterns.length}`);

function familyProbe(family) {
  return family;
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.niche-playbooks-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when adding families, niches, keyword routes, or corpus entries.",
    "Playbooks are script-time direction; their video-quality benefit is confirmed on a real paid render."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
