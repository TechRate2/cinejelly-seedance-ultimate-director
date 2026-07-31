/**
 * Seedance-reliable cinematic grammar.
 *
 * A curated vocabulary of film-grammar terms that empirically "translate reliably" into
 * Seedance 2.0 output (focus/lens, lighting, colour grade, lens character), distilled from
 * the current Seedance prompt-engineering guides and prompt libraries. The prompt compiler
 * emits a mode-appropriate line so every prompt speaks Seedance's cinematography language,
 * instead of leaving lens/light/grade to chance — the single highest-leverage lift for
 * output quality once the CRAFT anatomy (context/reference/action/framing/timing) is in
 * place, which it already is.
 *
 * Deterministic, no-spend, original wording (attribution in docs/CREDITS.md).
 */

export interface CinematicGrammar {
  /** Focus + lens behaviour, e.g. shallow depth of field with rack focus. */
  readonly focus: string;
  /** Lighting design in film terms, e.g. motivated key with soft fill. */
  readonly lighting: string;
  /** Colour grade, e.g. teal-and-orange or clean neutral. */
  readonly colorGrade: string;
  /** Lens character / film stock, e.g. 35mm grain, anamorphic flare, or clean digital. */
  readonly lens: string;
}

/**
 * Per-creative-mode cinematic defaults. UGC stays honest and phone-like (no heavy grade);
 * cinematic/story goes full film language; product/ad favours clean key + specular pop;
 * education/demo stays clean and legible. Unknown modes fall back to a grounded default.
 */
const MODE_CINEMATIC_GRAMMAR: Record<string, CinematicGrammar> = {
  ugc_review: {
    focus: "phone-lens look with mild natural depth of field, subject in crisp focus",
    lighting: "motivated natural light (window or ring light), soft and flattering, true skin tone",
    colorGrade: "true-to-life colour, only a light warm lift, no heavy grade",
    lens: "clean smartphone-camera character, subtle handheld energy, no cinematic flare"
  },
  testimonial: {
    focus: "shallow depth of field keeping the speaker sharp against a soft background",
    lighting: "soft key with gentle fill and a hint of hair/rim light for separation",
    colorGrade: "neutral, trustworthy colour with accurate skin tones",
    lens: "clean 50mm-style rendering, minimal distortion"
  },
  product_ad: {
    focus: "shallow depth of field with a slow rack focus onto the product's hero detail",
    lighting: "clean controlled key with soft fill, crisp specular highlights and accurate contact shadows on the product",
    colorGrade: "punchy but natural colour that keeps true product colour and brand accuracy",
    lens: "clean commercial macro character, glossy highlight roll-off, no distracting flare"
  },
  demo: {
    focus: "deep-enough focus to keep the action and the result both readable, shallow only on the payoff",
    lighting: "bright even motivated lighting so every step of the demo reads clearly",
    colorGrade: "clean neutral colour, high clarity",
    lens: "clean digital rendering, honest perspective"
  },
  comparison: {
    focus: "balanced focus that keeps both compared items legible, rack focus to whichever is being discussed",
    lighting: "even, unbiased lighting so neither side looks unfairly better lit",
    colorGrade: "neutral colour for fair comparison",
    lens: "clean digital rendering"
  },
  problem_solution: {
    focus: "shallow depth of field on the problem, opening up as the solution arrives",
    lighting: "cooler, lower-key light for the problem beat warming into bright motivated light on the solution",
    colorGrade: "slight cool-to-warm grade shift across the arc",
    lens: "clean cinematic rendering with subtle grain"
  },
  education: {
    focus: "clear, mostly deep focus so information stays legible, shallow only for emphasis",
    lighting: "bright, even, motivated lighting; no dramatic shadow that hides detail",
    colorGrade: "clean neutral, high legibility colour",
    lens: "clean digital rendering"
  },
  story: {
    focus: "cinematic shallow depth of field with motivated rack focus between subjects",
    lighting: "motivated key with soft fill, hard rim light for separation, expressive shadow",
    colorGrade: "filmic teal-and-orange or a mood-matched grade with controlled contrast",
    lens: "35mm film grain with gentle anamorphic character"
  },
  cinematic: {
    focus: "shallow depth of field, bokeh highlights, motivated rack focus on emotional beats",
    lighting: "motivated cinematic lighting: hard rim light, soft key, low-key shadow where the mood calls for it",
    colorGrade: "filmic grade (teal-and-orange, bleach bypass, or desaturated cold blues) with crushed blacks and controlled contrast",
    lens: "anamorphic lens character, subtle lens flare from practical lights, 35mm film grain"
  }
};

const GROUNDED_CINEMATIC_GRAMMAR: CinematicGrammar = {
  focus: "natural depth of field with the subject in clean focus and a soft background",
  lighting: "motivated key light with soft fill and accurate contact shadows",
  colorGrade: "natural, true-to-life colour with gentle contrast",
  lens: "clean cinematic rendering with fine, natural grain"
};

export function resolveCinematicGrammar(creativeMode: string | undefined): CinematicGrammar {
  if (creativeMode && Object.hasOwn(MODE_CINEMATIC_GRAMMAR, creativeMode)) {
    return MODE_CINEMATIC_GRAMMAR[creativeMode] as CinematicGrammar;
  }
  return GROUNDED_CINEMATIC_GRAMMAR;
}

/** One compact prompt line carrying the reliable-Seedance cinematography for this mode. */
export function cinematicGrammarPromptLine(creativeMode: string | undefined): string {
  const grammar = resolveCinematicGrammar(creativeMode);
  return `Cinematography: ${grammar.focus}; ${grammar.lighting}; ${grammar.colorGrade}; ${grammar.lens}.`;
}
