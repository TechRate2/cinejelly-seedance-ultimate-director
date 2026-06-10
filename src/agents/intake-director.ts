/**
 * Intake Director turns one founder/customer input into a normalized project request.
 * It performs deterministic validation before any LLM or render provider is called.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest, IntakeResult } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";
import { ReferenceLibrarian } from "./reference-librarian.js";

export class IntakeDirector {
  private readonly referenceLibrarian: ReferenceLibrarian;

  public constructor(referenceLibrarian = new ReferenceLibrarian()) {
    this.referenceLibrarian = referenceLibrarian;
  }

  public intake(request: CineJellyProjectRequest): IntakeResult {
    const userInput = request.userInput.trim();
    if (!userInput) {
      throw new Error("CineJelly project input cannot be empty.");
    }

    const settings = normalizeSeedanceSettings(request.settings);
    const projectId = createStableId("project", `${userInput}:${settings.durationTargetSeconds}:${settings.ratio}`);
    const metadata = request.metadata ? { metadata: request.metadata } : {};
    return {
      projectId,
      userInput,
      settings,
      ...metadata,
      references: this.referenceLibrarian.normalize({
        projectId,
        references: request.references ?? []
      })
    };
  }
}
