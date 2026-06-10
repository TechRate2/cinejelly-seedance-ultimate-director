/**
 * Prompt repair hints used by Consistency Guardian after render inspection.
 * These hints are compiler-level levers, not automatic quality claims.
 */

import type { ShotContract } from "../types/prompt.js";

export function buildRepairHints(shot: ShotContract): readonly string[] {
  const hints: string[] = [];

  if (shot.risks.includes("face")) {
    hints.push("Move identity reference clause earlier and simplify subject description.");
  }
  if (shot.risks.includes("product_logo")) {
    hints.push("Reduce motion around the product and reinforce product geometry/material wording.");
  }
  if (shot.risks.includes("audio_sync")) {
    hints.push("Align audio cue duration with clip duration and reduce simultaneous actions.");
  }
  if (shot.risks.includes("transition")) {
    hints.push("Add first/last-frame anchors or shorten the transition-critical shot.");
  }
  if (shot.timeline && shot.timeline.length > 3) {
    hints.push("Split the shot into smaller graph nodes if Seedance ignores later timeline beats.");
  }

  return hints.length > 0 ? hints : ["Compress prompt to the directorial essentials and rerender the affected shot only."];
}
