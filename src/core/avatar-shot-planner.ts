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
  const parts = [
    `${shot.subject}.`,
    `${shot.action.replace(/[.\s]+$/u, "")}.`,
    `Camera: ${shot.camera}.`,
    "Natural spontaneous UGC delivery: real facial emotion matching the speech, small hand gestures, handheld phone energy — never a stiff presenter pose."
  ];
  return parts.join(" ").slice(0, 2_000);
}

/** Map pipeline resolution settings onto the avatar model's 720/1080 options. */
export function avatarOutputResolution(settings: FlexibleSeedanceSettings): 720 | 1080 {
  return /1080/.test(settings.resolution) ? 1080 : 720;
}
