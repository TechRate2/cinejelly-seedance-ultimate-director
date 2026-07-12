/**
 * Seedance prompt DNA engine.
 *
 * Niche-adaptive and creative-mode-adaptive "prompt DNA" that turns a bare brief into
 * physically-directed Seedance 2.0 prompt guidance for every niche. It closes the
 * "does not look real / generic ad" gap that separates raw text-to-video from
 * commercial-grade output like Topview/Higgsfield.
 *
 * Source lineage: pattern DNA distilled from the community Seedance 2 prompt corpus
 * snapshot (CC BY 4.0; full attribution with the exact source name lives in
 * docs/CREDITS.md and the private source registry). This module contains ORIGINAL
 * condensed direction, not verbatim upstream prompt text.
 *
 * The proven Seedance 2.0 prompt anatomy this engine follows:
 *   1 style/quality  2 duration+scene  3 subject+appearance  4 timestamped camera/shot plan
 *   5 motion + micro-movement  6 audio/sound design  7 anti-slop technical constraints
 *   8 narrative/emotion.
 */

import type { ShortViralCreativeMode } from "../types/short-viral-intelligence.js";

export const SEEDANCE_PROMPT_DNA_ATTRIBUTION =
  "Prompt DNA distilled from the CC BY 4.0 community Seedance prompt corpus (exact source attribution in docs/CREDITS.md); original condensed direction, no verbatim prompt text.";

/**
 * The reusable 8-component Seedance prompt anatomy directive. Steering the planner and the
 * compiler with this structure is what makes generated clips read as filmed, not rendered.
 */
export const SEEDANCE_ANATOMY_DIRECTIVE =
  "Seedance prompt anatomy: build each shot as (1) style/quality tier, (2) scene + duration, " +
  "(3) subject identity/appearance held consistent, (4) a timestamped shot/camera plan " +
  "(e.g. [00:00-00:03] push-in, [00:03-00:06] cut to close-up), (5) concrete motion with " +
  "believable micro-movement, (6) audio/sound design timing, (7) explicit anti-artifact " +
  "constraints, and (8) the emotional beat. Prefer physical, camera-real direction over " +
  "abstract marketing language.";

/**
 * Physical direction per creative mode. Each entry is camera/light/motion/texture-first so
 * Seedance renders a believable moment rather than a stiff commercial.
 */
export const CREATIVE_MODE_DNA: Record<ShortViralCreativeMode, string> = {
  ugc_review:
    "Handheld phone framing with slight natural sway and auto-exposure shifts, creator eye-line into lens, real skin/hand texture, micro-pauses before product contact, imperfect casual timing; avoid studio polish, tripod-locked stillness, and plastic skin. Real-creator rhythm: quick spontaneous reactions, speech overlapping action, small restless movements between lines, TikTok-native cut-to-cut energy — never slow-motion pacing, never a posed pause, never theatrical acting; it must feel like one real person filmed this in one casual take. First 1.5s hook: creator mid-reaction or mid-action already involving the product, never a slow settle-in.",
  product_ad:
    "Premium but grounded: motivated key light, shallow depth of field, stable recognizable product geometry, one clean hero move (rotate/reveal/contact) and a settled end frame; keep packaging, label, and scale locked. First 1.5s hook: the product already in motion or being reached for, promise of the payoff visible.",
  demo:
    "Action-led before -> contact -> after, all visibly on screen; hands and camera move together, one concrete state change proven on camera, no skipped cause-and-effect. First 1.5s hook: open mid-problem or mid-contact, not on an empty setup.",
  testimonial:
    "Person on camera or voice-over-B-roll with authentic delivery, relaxed posture, real room tone; bound claims to what is shown, avoid miracle framing and over-lit fakery. First 1.5s hook: the speaker already mid-sentence on the most surprising point.",
  problem_solution:
    "Open on the friction/pain moment with visible tension, then introduce the product action that resolves it; keep the turn physical and readable, soft close rather than hard sell. First 1.5s hook: the problem at its most visually frustrating instant.",
  comparison:
    "Fair side-by-side or before/after with matched lighting, lens, and framing between options; change only the variable being compared, no disparagement, no unfair staging. First 1.5s hook: both options on screen at once with visible difference tension.",
  education:
    "One concrete example demonstrated per beat, clean legible staging, teaching-over-selling pacing; camera supports comprehension (insert shots, clear angles) without clutter. First 1.5s hook: the counterintuitive result shown before the explanation.",
  story:
    "Relatable micro-moment and emotional beat before any product reveal; natural performance, motivated cuts, let the payoff land as consequence not advertisement. First 1.5s hook: the emotional turning point mid-happening, not the setup.",
  cinematic:
    "Motivated premium motion (dolly/crane/parallax), shallow depth, sophisticated lighting with practical sources and controlled contrast, filmic color and material sheen; hero the subject with intentional composition. First 1.5s hook: the most striking composed frame already in motion."
};

/** Grounded realism direction used for general video and as the unknown-niche fallback. */
const GROUNDED_REALISM_DNA =
  "Grounded cinematic realism: motivated light, real texture and depth, coherent believable motion and a clean readable endpoint.";

/**
 * Physical direction per detected niche. Keys match audience-niche-intelligence niche codes.
 * Each entry biases toward the tactile proof and texture that make that category feel real.
 */
export const NICHE_DNA: Record<string, string> = {
  beauty_skincare:
    "Macro texture proof: pore-level skin detail, product-to-skin contact, glide/absorption and sheen; soft diffused light, avoid over-smoothed plastic skin and impossible glow.",
  fitness_wellness:
    "Show correct form, equipment contact, breathing rhythm and effort sweat; single realistic session, no transformation guarantees or morphing bodies.",
  workspace_accessory:
    "Desk-context hero: hand installs/uses the accessory, cable/surface interaction, tidy after-state; realistic office light and material finish (matte plastic, brushed metal).",
  fashion_apparel:
    "Fit-in-motion: fabric drape, walk/turn, mirror confirmation; consistent body, skin tone and garment color across shots; real cloth physics, no melting seams.",
  food_beverage:
    "Lead with the sensory hit (steam, crunch, pour, sip, drip), then reaction; specular highlights on liquid/glass, condensation and crumb detail; appetizing but physically real.",
  real_estate:
    "Smooth walkthrough parallax through real spatial layout, natural window light and accurate proportions; stable geometry, no warping walls or impossible rooms.",
  finance_investing:
    "Grounded, trustworthy staging; clean environment, believable on-desk props and screens implied not faked; avoid guaranteed-returns imagery and fake UI text.",
  healthcare_services:
    "Clean clinical realism, gentle motivated light, believable practitioner-patient interaction; careful, non-exaggerated claims and no graphic content.",
  gaming_entertainment:
    "High-energy but coherent motion, punchy cuts synced to beats, readable action and effects; keep character/scene consistent through fast cuts.",
  travel_hospitality:
    "Establishing wide to intimate detail, golden natural light, real depth and atmosphere (haze, water, foliage motion); aspirational yet physically plausible.",
  mobile_app:
    "Show the in-hand moment and the outcome; imply the app through reaction and context rather than fake burned-in UI; natural device handling.",
  saas_b2b:
    "Professional workspace realism: the workflow outcome and team reaction carry the story; believable office light and desk context, screens implied through posture and glow rather than fake UI; emphasize time-saved and adoption proof.",
  education_course:
    "Clear demonstrative staging, one idea per beat, insert shots that teach; approachable presenter energy, uncluttered background.",
  event_venue:
    "Atmosphere-first: crowd energy, lighting mood, motion of the space; sweeping but stable camera, real ambience and depth.",
  auto_service:
    "Mechanical proof: hands on the vehicle, part/tool contact, before -> service -> after; accurate metal/paint reflection and shop lighting.",
  home_repair:
    "Tactile fix on camera, tool-to-surface contact, visible resolved result; realistic material response and worksite light, no impossible instant results.",
  local_service:
    "Real premises and staff, service action shown honestly, warm approachable light; grounded neighborhood context.",
  family_lifestyle:
    "Warm candid domestic moment, natural performance from adults/kids/pets, soft daylight; genuine interaction over posed staging.",
  sports:
    "Athletic motion with real weight and momentum, tracking/whip camera that stays coherent, sweat and fabric physics; crisp decisive endpoint.",
  creator_tools:
    "Show the creator workflow and the finished output side by side; hands on device, believable screens implied, energetic but real timing.",
  drama_series:
    "Vertical short-drama staging: charged confrontations played in expressive close-ups and reaction inserts, blocking that reads instantly (power positions, distance, touch), minimal dialogue reliance with emotion on faces and hands; consistent cast faces/wardrobe and location dressing across episodes; every beat is a visible action or reversal, never narration over static frames.",
  brand_story_documentary:
    "Observational, motivated natural light, unhurried authentic performance and real texture; let environment and detail carry emotion.",
  cinematic_story:
    "Filmic premium look: shallow depth, motivated practicals, controlled contrast and color grade, deliberate camera moves and material sheen.",
  ecommerce_product_video:
    "Product hero with stable geometry, one clean reveal/contact/use, tidy end frame; accurate label, material and scale; avoid stacking static macros only.",
  news_commentary:
    "Grounded talking framing or B-roll, believable environment, steady readable staging; no fabricated on-screen graphics or claims.",
  podcast_clip:
    "Intimate two-shot or single framing with natural mic-present staging, believable room and eye-line; subtle motion, authentic delivery.",
  livestream_commerce:
    "Live-selling energy: creator presents product to camera with real handling and reactions, casual set light; keep product recognizable.",
  affiliate_review:
    "Honest hands-on review beats, real unboxing/use texture, creator-to-lens delivery; bounded claims, no fake guarantees.",
  general_video: GROUNDED_REALISM_DNA
};

/** Fallback direction for any niche not explicitly mapped. */
export const GENERIC_NICHE_DNA: string = GROUNDED_REALISM_DNA;

export interface ResolvedSeedanceDna {
  readonly creativeMode?: string;
  readonly niche?: string;
  readonly modeDirective?: string;
  readonly nicheDirective: string;
  /** Ready-to-embed prompt lines, safe to drop into a prompt line list. */
  readonly promptLines: readonly string[];
}

/** Safe lookup for a creative-mode directive; unknown/absent modes return undefined. */
export function creativeModeDna(mode?: string): string | undefined {
  if (!mode || !Object.hasOwn(CREATIVE_MODE_DNA, mode)) {
    return undefined;
  }
  return (CREATIVE_MODE_DNA as Record<string, string>)[mode];
}

/** Safe lookup for a niche directive; unknown/absent niches fall back to grounded realism. */
export function nicheDna(niche?: string): string {
  const key = niche?.trim();
  if (!key || !Object.hasOwn(NICHE_DNA, key)) {
    return GENERIC_NICHE_DNA;
  }
  return NICHE_DNA[key] ?? GENERIC_NICHE_DNA;
}

/**
 * Resolve niche + creative-mode DNA into embeddable prompt lines.
 * Accepts a raw creativeMode string (e.g. from shot metadata) as well as the
 * ShortViralCreativeMode union. Unknown niches fall back to grounded cinematic realism
 * so every niche is covered.
 */
export function resolveSeedanceDna(input: {
  readonly niche?: string;
  readonly creativeMode?: ShortViralCreativeMode | string;
}): ResolvedSeedanceDna {
  const niche = input.niche?.trim() ? input.niche.trim() : undefined;
  const nicheDirective = nicheDna(niche);
  const modeDirective = creativeModeDna(input.creativeMode);
  const promptLines = [
    modeDirective ? `Creative-mode DNA (${input.creativeMode}): ${modeDirective}` : undefined,
    `Niche DNA (${niche ?? "general"}): ${nicheDirective}`
  ].filter((line): line is string => Boolean(line));
  return {
    ...(input.creativeMode ? { creativeMode: input.creativeMode } : {}),
    ...(niche ? { niche } : {}),
    ...(modeDirective ? { modeDirective } : {}),
    nicheDirective,
    promptLines
  };
}
