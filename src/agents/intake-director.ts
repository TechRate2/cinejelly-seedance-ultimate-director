/**
 * Intake Director turns one founder/customer input into a normalized project request.
 * It performs deterministic validation before any LLM or render provider is called.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest, IntakeResult } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";

export class IntakeDirector {
  public intake(request: CineJellyProjectRequest): IntakeResult {
    const userInput = request.userInput.trim();
    if (!userInput) {
      throw new Error("CineJelly project input cannot be empty.");
    }

    const settings = normalizeSeedanceSettings(request.settings);
    return {
      projectId: createStableId("project", `${userInput}:${settings.durationTargetSeconds}:${settings.ratio}`),
      userInput,
      settings,
      references: request.references ?? []
    };
  }
}
