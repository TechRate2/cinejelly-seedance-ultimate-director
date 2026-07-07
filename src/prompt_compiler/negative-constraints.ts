/**
 * Negative constraint builder for Seedance prompts.
 * It keeps constraints short and targeted instead of adding broad low-quality keyword lists.
 */

import type { ContinuityRisk, ShotContract } from "../types/prompt.js";

const RISK_CONSTRAINTS: Record<ContinuityRisk, readonly string[]> = {
  face: ["no identity drift", "no face morphing"],
  product_logo: ["no warped product logo", "no distorted label"],
  wardrobe: ["no sudden wardrobe changes"],
  environment: ["no abrupt environment changes"],
  physics: ["no impossible body mechanics"],
  text: ["no unintended text"],
  multi_character_blocking: ["no character merging", "no blocking confusion"],
  audio_sync: ["no mismatched lip-sync"],
  transition: ["no camera jump unless specified", "no mismatched start/end handles"]
};

const BASE_CONSTRAINTS: readonly string[] = [
  "no watermark unless requested",
  "no subtitles unless requested",
  "no visible captions, lower thirds, CTA cards, or fake UI text",
  "no temporal flicker",
  "no frozen static product pose for the full clip"
];

export function buildNegativePrompt(shot: ShotContract): string {
  const constraints = new Set<string>(BASE_CONSTRAINTS);
  for (const risk of shot.risks) {
    for (const constraint of RISK_CONSTRAINTS[risk]) {
      constraints.add(constraint);
    }
  }
  if (shot.references.some((reference) => reference.role === "source_video_structure")) {
    constraints.add("no copied source-video face identity");
    constraints.add("no copied source-video transcript");
    constraints.add("no copied source-video music or melody");
    constraints.add("no source-video watermark, caption style, logo, or brand marks");
  }
  if (shot.references.some((reference) => reference.role === "audio_tempo" || reference.role === "voice")) {
    constraints.add("no unapproved voice likeness");
    constraints.add("no protected song imitation");
  }
  return [...constraints].join(", ");
}
