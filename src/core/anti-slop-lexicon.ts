/**
 * Anti-slop lexicon — replace generic "AI slop" filler with concrete cinematography.
 *
 * LLM-authored shot descriptions drift toward empty boosters ("stunning, cinematic, 8K,
 * hyper-detailed, masterpiece") that push models toward generic, over-processed output. This
 * module maps each KNOWN slop token either to a concrete directive (a rig/angle/light/texture)
 * or to nothing (pure filler is dropped), and scores a prompt's slop density. Slop is prevented at
 * the SOURCE — the Story Architect is instructed to avoid it (see antiSlopDirective) — rather than by
 * rewriting a finished prompt, which a prior design proved breaks grammar and blinds style guardrails.
 *
 * Deliberately HIGH-PRECISION: only tokens that are almost always empty filler are listed, so a
 * legitimate word ("a professional presenter", "a perfect circle") is never mangled. Every
 * concrete replacement is itself slop-free, so the rewrite is idempotent and never reintroduces
 * filler. Clean-room original (behavior inspired by the seedance-2 anti-slop reference notes; no
 * upstream text copied). Deterministic and no-spend.
 */

export type SlopBucket =
  | "superlative"
  | "resolution_theater"
  | "ai_self_praise"
  | "empty_atmosphere"
  | "vague_quality";

export interface SlopEntry {
  /** The filler token (matched whole-word, case-insensitive, hyphen/space tolerant). */
  readonly term: string;
  /** Concrete cinematography to swap in; empty string means "drop it as pure filler". */
  readonly concrete: string;
  readonly bucket: SlopBucket;
}

export type SlopVerdict = "clean" | "acceptable" | "tighten" | "rewrite";

export interface SlopRewriteResult {
  readonly rewritten: string;
  readonly replacements: readonly { readonly term: string; readonly concrete: string; readonly bucket: SlopBucket }[];
  readonly slopCount: number;
  readonly tokenCount: number;
  readonly density: number;
  readonly verdict: SlopVerdict;
}

/**
 * The lexicon. Ordered longest-first per bucket so multi-word phrases match before their
 * single-word substrings (e.g. "hyper detailed" before "detailed" — which is not itself listed).
 */
const SLOP_ENTRIES: readonly SlopEntry[] = [
  // Empty superlatives — pure filler, dropped.
  { term: "breathtaking", concrete: "", bucket: "superlative" },
  { term: "jaw-dropping", concrete: "", bucket: "superlative" },
  { term: "jaw dropping", concrete: "", bucket: "superlative" },
  { term: "eye-catching", concrete: "", bucket: "superlative" },
  { term: "awe-inspiring", concrete: "", bucket: "superlative" },
  { term: "mesmerizing", concrete: "", bucket: "superlative" },
  { term: "mesmerising", concrete: "", bucket: "superlative" },
  { term: "stunning", concrete: "", bucket: "superlative" },
  { term: "gorgeous", concrete: "", bucket: "superlative" },
  // Resolution theatre — output resolution is set by settings, not by begging in the prompt.
  { term: "insanely detailed", concrete: "", bucket: "resolution_theater" },
  { term: "extremely detailed", concrete: "", bucket: "resolution_theater" },
  { term: "super detailed", concrete: "", bucket: "resolution_theater" },
  { term: "hyper-detailed", concrete: "", bucket: "resolution_theater" },
  { term: "hyper detailed", concrete: "", bucket: "resolution_theater" },
  { term: "hyperdetailed", concrete: "", bucket: "resolution_theater" },
  { term: "ultra-hd", concrete: "", bucket: "resolution_theater" },
  { term: "ultra hd", concrete: "", bucket: "resolution_theater" },
  { term: "16k", concrete: "", bucket: "resolution_theater" },
  { term: "8k", concrete: "", bucket: "resolution_theater" },
  { term: "4k", concrete: "", bucket: "resolution_theater" },
  // AI self-praise — the model does not need to be told it is good.
  { term: "trending on artstation", concrete: "", bucket: "ai_self_praise" },
  { term: "award-winning", concrete: "", bucket: "ai_self_praise" },
  { term: "award winning", concrete: "", bucket: "ai_self_praise" },
  { term: "highest quality", concrete: "", bucket: "ai_self_praise" },
  { term: "best quality", concrete: "", bucket: "ai_self_praise" },
  { term: "masterpiece", concrete: "", bucket: "ai_self_praise" },
  // Empty atmosphere — swapped for the concrete look the word is gesturing at.
  { term: "cinematic", concrete: "shallow depth of field with filmic contrast", bucket: "empty_atmosphere" },
  { term: "atmospheric", concrete: "hazy motivated light", bucket: "empty_atmosphere" },
  { term: "ethereal", concrete: "soft diffused glow", bucket: "empty_atmosphere" },
  { term: "dreamy", concrete: "soft-focus haze", bucket: "empty_atmosphere" },
  { term: "moody", concrete: "low-key motivated light", bucket: "empty_atmosphere" },
  { term: "epic", concrete: "wide-scale staging", bucket: "empty_atmosphere" },
  // Vague quality — swapped for a measurable property.
  { term: "hyperrealistic", concrete: "photographic realism", bucket: "vague_quality" },
  { term: "photorealistic", concrete: "photographic realism", bucket: "vague_quality" },
  { term: "vibrant", concrete: "saturated color", bucket: "vague_quality" }
];

const SLOP_REGEX_CACHE = new Map<string, RegExp>();

function slopRegex(term: string): RegExp {
  let regex = SLOP_REGEX_CACHE.get(term);
  if (!regex) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    // Hyphen- and word-boundary aware so "8k" does not fire inside "8kg" and "cinematic"
    // does not fire inside "cinematically" only when it is a standalone token.
    regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "gi");
    SLOP_REGEX_CACHE.set(term, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")            // drop whitespace before punctuation
    .replace(/([,;:])\s*(?=[,;:.!?])/g, "")     // a comma/semicolon/colon before ANY punctuation -> drop it
    .replace(/\(\s*\)/g, "")                     // empty parens left by a dropped token
    .replace(/^[\s,;:.!?]+/, "")                 // strip leading punctuation/whitespace
    .replace(/[\s,;:]+$/, "")                    // strip trailing whitespace/comma (keep sentence-final . ! ?)
    .trim();
}

function countTokens(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function verdictFor(density: number, slopCount: number): SlopVerdict {
  if (slopCount === 0) {
    return "clean";
  }
  if (density <= 0.1) {
    return "acceptable";
  }
  if (density <= 0.2) {
    return "tighten";
  }
  return "rewrite";
}

/**
 * De-slop a free-text description: swap known filler tokens for concrete cinematography (or drop
 * pure filler), then tidy punctuation. Idempotent — running it twice yields the same text.
 */
export function rewriteSlop(text: string): SlopRewriteResult {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { rewritten: typeof text === "string" ? text : "", replacements: [], slopCount: 0, tokenCount: 0, density: 0, verdict: "clean" };
  }
  const tokenCount = countTokens(text);
  const replacements: { term: string; concrete: string; bucket: SlopBucket }[] = [];
  let slopCount = 0;
  let slopWordCount = 0;
  let rewritten = text;
  for (const entry of SLOP_ENTRIES) {
    const regex = slopRegex(entry.term);
    const entryWords = countTokens(entry.term);
    rewritten = rewritten.replace(regex, () => {
      slopCount += 1;
      slopWordCount += entryWords;
      replacements.push({ term: entry.term, concrete: entry.concrete, bucket: entry.bucket });
      return entry.concrete;
    });
  }
  rewritten = tidy(rewritten);
  // Density is measured in slop WORDS over total words, so multiword filler ("hyper detailed",
  // "trending on artstation") is not undercounted the way a per-match count would.
  const density = tokenCount > 0 ? slopWordCount / tokenCount : 0;
  return { rewritten, replacements, slopCount, tokenCount, density, verdict: verdictFor(density, slopCount) };
}

/** Score-only helper: how much filler a prompt carries, without rewriting it. */
export function slopDensityScore(text: string): { readonly slopCount: number; readonly tokenCount: number; readonly density: number; readonly verdict: SlopVerdict } {
  const result = rewriteSlop(text);
  return { slopCount: result.slopCount, tokenCount: result.tokenCount, density: result.density, verdict: result.verdict };
}

/** All listed slop terms (lowercased), for tests and tooling. */
export function listSlopTerms(): readonly string[] {
  return SLOP_ENTRIES.map((entry) => entry.term);
}

/**
 * Authoring directive for the script/prompt LLM: prevent slop AT THE SOURCE instead of rewriting a
 * finished prompt (a post-hoc find/replace injects contradictions and breaks grammar). Injected
 * into the Story Architect instruction alongside the niche playbook + mastery rules.
 */
export function antiSlopDirective(): string {
  // Name at least one exemplar from EVERY bucket (was a flat slice(0,14) that never reached the
  // empty_atmosphere / vague_quality buckets, so "cinematic, dreamy, moody, epic, vibrant,
  // hyperrealistic, photorealistic" were never explicitly banned — the boosters research flags most).
  const buckets: readonly SlopBucket[] = ["superlative", "resolution_theater", "ai_self_praise", "empty_atmosphere", "vague_quality"];
  const banned = buckets
    .flatMap((bucket) => SLOP_ENTRIES.filter((entry) => entry.bucket === bucket).slice(0, 4).map((entry) => entry.term))
    .join(", ");
  return [
    "ANTI-SLOP: never pad a shot with empty boosters",
    `(${banned}).`,
    "They read as generic AI slop and push the model toward over-processed output.",
    "Instead name the concrete cause — the lens, angle, rig, light direction+quality, and a number:",
    'not "cinematic" but "85mm, shallow depth of field, hard 45-degree key with amber gel";',
    'not "stunning sunset" but "low sun raking across the frame, long hard shadows".',
    "Every adjective must earn its place with a visible, filmable specific."
  ].join(" ");
}
