/**
 * Two-register style engine — the zero-hardcode replacement for per-niche style tables.
 *
 * Design mined from the battle-tested corpus (106 community Seedance prompts: the cinematic
 * vocabulary clusters are minable — shallow DoF/push-in/tracking/practical light — while the
 * natural-phone register is corpus-scarce and must be AUTHORED as an explicit anti-cinematic guard)
 * plus SkyReels captioner field grammar (the six-axis ordering). Booster slop (8K/masterpiece/
 * hyperrealistic) is deliberately excluded — concrete optics replace it.
 *
 * Precedence (compiler): REGISTER_GRAMMAR block = the invariant frame, always emitted;
 * analyst/scriptwriter-authored StyleDna = the per-request niche specifics layered on top;
 * legacy CREATIVE_MODE_DNA/NICHE_DNA lookups fire ONLY when no styleDna exists (fallback path).
 */

import type { StyleRegister } from "../types/prompt.js";

export type { StyleRegister };

export interface RegisterGrammar {
  readonly optics: string;
  readonly lighting: string;
  readonly color: string;
  readonly motion: string;
  readonly performance: string;
  readonly audioFeel: string;
}

export const REGISTER_GRAMMAR: Record<StyleRegister, RegisterGrammar> = {
  professional_cinematic: {
    optics:
      "Cinema-camera capture: shallow depth of field with a clean focal plane and natural bokeh roll-off, ONE motivated camera move per shot (push-in, tracking, or slow orbit), 35-85mm-equivalent perspective, no fisheye distortion.",
    lighting:
      "Motivated, shaped light: a clear key with soft fill and gentle rim separation, controlled contrast, practical sources visible in frame; shadows fall physically with accurate contact shadows.",
    color:
      "Deliberate film grade with controlled contrast, a cohesive palette, clean true skin tones and gentle highlight roll-off; never crushed, muddy, or oversaturated.",
    motion:
      "Weighted, deliberate motion with natural inertia and follow-through; the camera settles rather than drifts; no jitter, no video-game glide.",
    performance:
      "Restrained believable performance — micro-expressions, real eye-lines, natural blink and breathing; emotion reads on face and hands so the beat plays with the sound off.",
    audioFeel:
      "Designed soundstage: intentional diegetic ambience and foley, score under the moment never over it, dialogue clean and close."
  },
  natural_phone_kol: {
    optics:
      "Filmed on a modern phone in ONE casual take: near-deep focus with only mild natural depth, slight wide phone perspective at arm's length or propped, occasional autofocus hunt — NO cinematic bokeh, NO anamorphic look, NO tripod-locked stillness.",
    lighting:
      "Found light only: window daylight, ceiling room light, or harsh direct sun with real auto-exposure shifts as the camera moves — NO shaped key/fill, NO ring-light gloss, NO studio polish.",
    color:
      "Straight-off-the-phone color: accurate white balance, restrained saturation, soft organic contrast, tiny sensor imperfections — NO film grade, NO vivid mode, NO HDR halo, NO beauty filter.",
    motion:
      "Real handheld energy: natural micro-shake, small reframes, breathing sway, quick imperfect pans — NO slow-motion, NO gimbal smoothness, NO speed ramps.",
    performance:
      "A real person talking to their own phone: spontaneous reactions, speech overlapping action, filler words and self-interruption, imperfect eyelines, small restless movements — never a posed presenter, never theatrical acting; the beat must still read with the sound off.",
    audioFeel:
      "In-camera sound only: room tone, real contact noise, close phone-mic voice — NO scored music, NO polished mix."
  }
};

const REGISTER_LABEL: Record<StyleRegister, string> = {
  professional_cinematic: "professional cinematic",
  natural_phone_kol: "natural phone-shot / KOL"
};

/** Map the legacy creative modes onto a register so existing callers get the right frame for free. */
export function registerForCreativeMode(creativeMode: string | undefined): StyleRegister | undefined {
  switch (creativeMode) {
    case "ugc_review":
    case "testimonial":
    case "demo":
    case "problem_solution":
    case "comparison":
    case "education":
      return "natural_phone_kol";
    case "product_ad":
    case "story":
    case "cinematic":
      return "professional_cinematic";
    default:
      return undefined;
  }
}

export function isStyleRegister(value: unknown): value is StyleRegister {
  return value === "professional_cinematic" || value === "natural_phone_kol";
}

/** Compact single-paragraph register frame for the compiled prompt. */
export function registerGrammarPromptLine(register: StyleRegister): string {
  const grammar = REGISTER_GRAMMAR[register];
  return [
    `Style register: ${REGISTER_LABEL[register]}.`,
    grammar.optics,
    grammar.lighting,
    grammar.color,
    grammar.motion,
    grammar.performance,
    grammar.audioFeel
  ].join(" ");
}

/**
 * Dialogue-light clause for weak-lip-sync spoken languages (Vietnamese first): expression and
 * blocking carry meaning; the beat must read with the sound off. Appended by the compiler when the
 * shot's audio language is flagged weak — the language itself stays data, not hardcode.
 */
export const DIALOGUE_LIGHT_LANGUAGE_CLAUSE =
  "Dialogue-light language mode: keep any spoken line short and front-loaded, let expression, gesture, and blocking carry the meaning, and treat lip-shape matching as approximate — the beat must read fully with the sound off.";
