/**
 * Avatar shot planner — the Topview-class routing decision.
 *
 * Live-render forensics + the public reference corpus showed the industry split: a person SPEAKING
 * to camera is rendered by an audio-driven avatar model (portrait/keyframe image + TTS voiceover ->
 * lip-sync, expression, gesture), while general video models handle b-roll/action. Asking a general
 * text/image-to-video model to "act and talk" is what produced the stiff, emotionless delivery in the
 * first paid renders.
 *
 * Pure planning only (no provider calls): classification, image selection, and the compact avatar
 * hint are all deterministic and unit-testable.
 */

import type { ShotContract } from "../types/prompt.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";

/** OmniHuman guidance: <=15s audio recommended; our clip window is 4-15s so lines fit naturally. */
export const MAX_AVATAR_LINE_SECONDS = 15;

export interface AvatarShotDecision {
  readonly talking: boolean;
  readonly reason:
    | "spoken_line_with_character_image"
    | "no_spoken_line"
    | "no_character_image";
  /** HTTPS image that shows the speaking character (in-scene keyframe preferred). */
  readonly imageUrl?: string;
}

/**
 * A shot is a TALKING shot when it carries a verbatim spoken line AND we hold an HTTPS image of the
 * speaking character. The in-scene keyframe (first_frame) is preferred — the avatar then speaks
 * inside the real scene — with the identity anchor portrait as fallback.
 */
export function decideAvatarShot(shot: ShotContract): AvatarShotDecision {
  if (!shot.spokenLine?.trim()) {
    return { talking: false, reason: "no_spoken_line" };
  }
  const imageUrl = avatarImageUrlFor(shot);
  if (!imageUrl) {
    return { talking: false, reason: "no_character_image" };
  }
  return { talking: true, reason: "spoken_line_with_character_image", imageUrl };
}

function avatarImageUrlFor(shot: ShotContract): string | undefined {
  const httpsImage = (role: string): string | undefined => {
    const reference = shot.references.find(
      (candidate) => candidate.role === role && /^https:\/\//.test(candidate.providerReference.uri)
    );
    return reference?.providerReference.uri;
  };
  return httpsImage("first_frame") ?? httpsImage("identity");
}

/**
 * Compact action/expression hint for the avatar model (<=2000 chars). The avatar model reads the
 * AUDIO for delivery; this hint only sets scene, action, and emotional register — no timing
 * contracts, no reference plumbing (those confuse audio-driven models).
 */
export function buildAvatarPrompt(shot: ShotContract): string {
  // Carry the ENVIRONMENT into the avatar model too: OmniHuman animates the driving keyframe but a
  // stated setting keeps it from drifting the background toward a neutral studio while it moves
  // (paid-acceptance forensics: talking clips lost the ordered bedroom). Kept short — the model
  // reads the audio for delivery.
  const environment = shot.continuity?.environment?.trim();
  // Carry the beat's EMOTIONAL TURN and the register's PERFORMANCE axis into the hint (quality
  // scan): the avatar path replaces the rich compiled prompt with this thin hint, so without these
  // the talking shot lost the phone-KOL performance direction the rest of the pipeline built and
  // came out flat. The model reads the AUDIO for delivery, but a visible-emotion + performance line
  // shapes the facial acting on top.
  // Cap each LLM-authored field and put the load-bearing UGC-delivery clause FIRST
  // (adversarial-audit F3): environment/emotionalTurn/performance are un-sliced upstream, so a
  // verbose LLM value could push the critical delivery instruction past the 2000-char cut. Leading
  // with it + per-field caps means it can never be truncated away.
  const cap = (text: string | undefined, n: number): string | undefined => text?.trim().slice(0, n) || undefined;
  const emotionalTurn = cap(shot.emotionalTurn, 200);
  const performance = cap(shot.styleDna?.performance, 200);
  // Carry the full VISUAL styleDna axes into the avatar hint (quality upgrade): OmniHuman animates
  // the keyframe but a stated look keeps optics/lighting/color/motion from drifting toward a generic
  // render while it moves. Previously ONLY performance rode along, so the talking shot lost the
  // register/niche look the compiler built for every OTHER shot — the UGC path came out visually
  // flatter than its own b-roll. audioFeel is skipped (the model reads the real audio); avoid-words
  // become a short negative tail. Each axis capped so the load-bearing UGC clause is never truncated.
  const dna = shot.styleDna;
  const look = [
    cap(dna?.optics, 150),
    cap(dna?.lighting, 150),
    cap(dna?.palette, 120),
    cap(dna?.motion, 120)
  ].filter((axis): axis is string => Boolean(axis)).join("; ");
  const avoid = dna?.avoid && dna.avoid.length > 0 ? cap(dna.avoid.join(", "), 200) : undefined;
  const parts = [
    "Natural spontaneous UGC delivery: real facial emotion matching the speech, small hand gestures, handheld phone energy — never a stiff presenter pose.",
    `${cap(shot.subject, 400)}.`,
    `${cap(shot.action, 400)?.replace(/[.\s]+$/u, "")}.`,
    environment ? `Set inside: ${cap(environment, 300)} — keep this real location as the background, not a studio backdrop.` : undefined,
    emotionalTurn ? `Play this emotional turn visibly on the face: ${emotionalTurn}.` : undefined,
    performance ? `Performance: ${performance}.` : undefined,
    look ? `Look: ${look}.` : undefined,
    `Camera: ${cap(shot.camera, 300)}.`,
    avoid ? `Avoid: ${avoid}.` : undefined
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" ").slice(0, 2_000);
}

/** Map pipeline resolution settings onto the avatar model's 720/1080 options. */
export function avatarOutputResolution(settings: FlexibleSeedanceSettings): 720 | 1080 {
  return /1080/.test(settings.resolution) ? 1080 : 720;
}
