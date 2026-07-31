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

/**
 * Real camera + lens gear anchor per register (mined from ai-shortfilm-prompts, Seedance-tuned):
 * naming concrete film gear ("shot on ARRI Alexa with vintage Cooke primes") binds the model's
 * training to genuine cinema imagery far more strongly than the word "cinematic" — and pinning a
 * specific phone camera keeps the phone register from drifting toward a polished studio look. Emitted
 * once in the register section; a shot's own authored optics still layers on top.
 */
export const GEAR_ANCHOR_BY_REGISTER: Record<StyleRegister, string> = {
  professional_cinematic:
    "Capture gear: shot on a professional cinema camera with vintage prime lenses (ARRI Alexa / Sony Venice body, Cooke S4 or vintage anamorphic primes) — real film optics, natural lens breathing and organic bokeh, fine filmic grain.",
  natural_phone_kol:
    "Capture gear: shot handheld on a recent flagship phone's main camera (iPhone 15 Pro-class) — natural phone-lens perspective, real auto-exposure and autofocus behaviour, no cinema rig, no color grade."
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

/**
 * The register LOCKED by the customer's explicit "Phong cách" choice, parsed from the [style:X] tag
 * the UI appends to the brief. Returns undefined for "auto" (no tag) so the LLM keeps inferring.
 * When present it must OUTRANK any LLM-authored register (cross-audit finding #1: the explicit choice
 * previously sat at the bottom of precedence, so a "review"-worded cinematic brief still rendered as
 * phone-KOL — the customer's pick was silently discarded).
 */
export function explicitStyleTagRegister(text: string | undefined): StyleRegister | undefined {
  if (!text) {
    return undefined;
  }
  const match = /\[style:(ugc|cinematic|story|demo|education|testimonial|comparison|problem_solution|product_ad)\]/i.exec(text);
  if (!match) {
    return undefined;
  }
  const tag = match[1]!.toLowerCase();
  return registerForCreativeMode(tag === "ugc" ? "ugc_review" : tag);
}

export type RegisterAxis = "optics" | "lighting" | "color" | "motion" | "performance" | "audioFeel";

/**
 * Compact single-paragraph register frame for the compiled prompt.
 * `omit` drops any axis the shot's authored styleDna overrides, so each axis is stated EXACTLY once
 * (the override replaces the register default instead of stacking a second, possibly-conflicting
 * sentence on top of it — audit: five axes were double-printed whenever styleDna existed).
 */
export function registerGrammarPromptLine(
  register: StyleRegister,
  options?: { readonly omit?: readonly RegisterAxis[] }
): string {
  const grammar = REGISTER_GRAMMAR[register];
  const omit = new Set(options?.omit ?? []);
  const axis = (name: RegisterAxis, text: string): string | undefined => (omit.has(name) ? undefined : text);
  return [
    `Style register: ${REGISTER_LABEL[register]}.`,
    axis("optics", grammar.optics),
    axis("lighting", grammar.lighting),
    axis("color", grammar.color),
    axis("motion", grammar.motion),
    axis("performance", grammar.performance),
    axis("audioFeel", grammar.audioFeel)
  ].filter((line): line is string => Boolean(line)).join(" ");
}

/**
 * Dialogue-light clause for weak-lip-sync spoken languages (Vietnamese first): expression and
 * blocking carry meaning; the beat must read with the sound off. Appended by the compiler when the
 * shot's audio language is flagged weak — the language itself stays data, not hardcode.
 */
export const DIALOGUE_LIGHT_LANGUAGE_CLAUSE =
  "Dialogue-light language mode: keep any spoken line short and front-loaded, let expression and blocking carry the meaning, and treat lip-shape matching as approximate — the beat must read fully with the sound off.";

/**
 * Variant for shots that carry a VERBATIM scripted spokenLine. Deliberately says NOTHING about
 * delivering/shortening the line — the audio section of the SAME prompt already carries the
 * "deliver word-for-word, do not shorten" verbatim contract, and restating it here tripled the
 * mandate (redundancy-audit R3); only the lip-shape/read-with-sound-off signal is unique. Also no
 * "gesture carries meaning" — it pulled against the talking-head clause's "no theatrical gestures".
 */
export const DIALOGUE_LIGHT_VERBATIM_CLAUSE =
  "Dialogue-light language mode: treat lip-shape matching as approximate; expression and blocking carry the meaning, and the beat must still read with the sound off.";

/**
 * Talking-head naturalness (mined from micro-drama practice: ko-dialogue-melodrama-structure). The
 * single biggest AI-tell on a spoken shot is an over-animated, over-scored talking head, so during a
 * spoken line keep mouth movement small and natural, hold the camera and head still, and let the
 * voice sit in clean quiet — no music swelling under the line. Applied to any shot with a spokenLine.
 */
export const TALKING_HEAD_NATURALNESS_CLAUSE =
  "Talking-head naturalness: during the spoken line keep mouth movement small and natural (no exaggerated over-articulation), hold the head and camera steady with only micro-motion, keep the eyeline consistent, and leave the voice in clean quiet — no music swelling under the line, no theatrical gestures. Natural micro-expressions and a small breath read as real; a bobbing, over-mouthing head reads as AI.";
