/**
 * Intake Director turns one founder/customer input into a normalized project request.
 * It performs deterministic validation before any LLM or render provider is called.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest, IntakeResult } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";
import { ReferenceLibrarian } from "./reference-librarian.js";
import { SourceVideoAnalyst } from "./source-video-analyst.js";

export class IntakeDirector {
  private readonly referenceLibrarian: ReferenceLibrarian;
  private readonly sourceVideoAnalyst: SourceVideoAnalyst;

  public constructor(referenceLibrarian = new ReferenceLibrarian(), sourceVideoAnalyst = new SourceVideoAnalyst()) {
    this.referenceLibrarian = referenceLibrarian;
    this.sourceVideoAnalyst = sourceVideoAnalyst;
  }

  public intake(request: CineJellyProjectRequest): IntakeResult {
    const userInput = request.userInput.trim();
    if (!userInput) {
      throw new Error("CineJelly project input cannot be empty.");
    }

    const settings = normalizeSeedanceSettings(request.settings);
    const projectId = createStableId("project", `${userInput}:${settings.durationTargetSeconds}:${settings.ratio}`);
    const metadata = request.metadata ? { metadata: request.metadata } : {};
    const references = this.referenceLibrarian.normalize({
      projectId,
      references: request.references ?? []
    });
    const sourceVideoAnalysis = this.sourceVideoAnalyst.normalize(request.sourceVideoAnalysis, references);

    return {
      projectId,
      userInput,
      settings,
      ...metadata,
      references,
      ...(sourceVideoAnalysis ? { sourceVideoAnalysis } : {})
    };
  }
}
