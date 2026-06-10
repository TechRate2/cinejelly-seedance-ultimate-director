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
  transition: ["no camera jump unless specified"]
};

const BASE_CONSTRAINTS: readonly string[] = [
  "no watermark unless requested",
  "no subtitles unless requested",
  "no temporal flicker"
];

export function buildNegativePrompt(shot: ShotContract): string {
  const constraints = new Set<string>(BASE_CONSTRAINTS);
  for (const risk of shot.risks) {
    for (const constraint of RISK_CONSTRAINTS[risk]) {
      constraints.add(constraint);
    }
  }
  return [...constraints].join(", ");
}
