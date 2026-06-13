/**
 * Intake Director turns one founder/customer input into a normalized project request.
 * It performs deterministic validation before any LLM or render provider is called.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest, IntakeResult } from "../types/agent.js";
import { createStableId } from "../utils/ids.js";
import { ReferenceLibrarian } from "./reference-librarian.js";
import { SourceVideoAnalyst } from "./source-video-analyst.js";
import { SourceVideoReferenceMetadataEnricher } from "./source-video-reference-metadata-enricher.js";

export class IntakeDirector {
  private readonly referenceLibrarian: ReferenceLibrarian;
  private readonly sourceVideoAnalyst: SourceVideoAnalyst;
  private readonly sourceVideoReferenceMetadataEnricher: SourceVideoReferenceMetadataEnricher;

  public constructor(
    referenceLibrarian = new ReferenceLibrarian(),
    sourceVideoAnalyst = new SourceVideoAnalyst(),
    sourceVideoReferenceMetadataEnricher = new SourceVideoReferenceMetadataEnricher()
  ) {
    this.referenceLibrarian = referenceLibrarian;
    this.sourceVideoAnalyst = sourceVideoAnalyst;
    this.sourceVideoReferenceMetadataEnricher = sourceVideoReferenceMetadataEnricher;
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
    const enrichedReferences = this.sourceVideoReferenceMetadataEnricher.enrich({
      references,
      ...(sourceVideoAnalysis ? { sourceVideoAnalysis } : {})
    });

    return {
      projectId,
      userInput,
      settings,
      ...metadata,
      references: enrichedReferences,
      ...(sourceVideoAnalysis ? { sourceVideoAnalysis } : {})
    };
  }
}
