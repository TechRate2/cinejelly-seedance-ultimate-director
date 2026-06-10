/**
 * Seedance Prompt Compiler.
 * It converts Production Graph shot contracts into compact directorial prompts and provider-neutral video requests.
 */

import { toVideoGenerationSettings } from "../config/seedance-settings.js";
import type { CompiledPrompt, PromptCompilerInput, ShotContract, TimelineSegment } from "../types/prompt.js";
import type { ProviderMode } from "../types/provider.js";
import { buildNegativePrompt } from "./negative-constraints.js";
import { describeReferenceBindings, sortReferencesForPrompt, toProviderReferences } from "./reference-binding.js";
import { buildRepairHints } from "./repair-hints.js";

export class SeedancePromptCompiler {
  public compile(input: PromptCompilerInput): CompiledPrompt {
    const prompt = this.buildPrompt(input.shot);
    const negativePrompt = buildNegativePrompt(input.shot);
    const references = toProviderReferences(input.shot.references);
    const videoRequest = {
      provider: input.provider,
      modelId: input.modelId,
      mode: this.resolveMode(input.shot),
      prompt,
      negativePrompt,
      references,
      settings: toVideoGenerationSettings(input.settings, input.shot.durationSeconds),
      ...(input.shot.metadata ? { metadata: input.shot.metadata } : {})
    };

    return {
      shotId: input.shot.shotId,
      prompt,
      negativePrompt,
      references,
      inspectionExpectations: this.buildInspectionExpectations(input.shot),
      repairHints: buildRepairHints(input.shot),
      videoRequest
    };
  }

  private buildPrompt(shot: ShotContract): string {
    const sections = [
      `Shot ${shot.shotId}, ${shot.durationSeconds}s.`,
      `Intent: ${shot.intent}.`,
      this.buildReferenceSection(shot),
      this.buildContinuitySection(shot),
      `Scene subject: ${shot.subject}.`,
      `Action: ${shot.action}.`,
      `Camera: ${shot.camera}.`,
      `Lighting: ${shot.lighting}.`,
      shot.style ? `Style: ${shot.style}.` : undefined,
      shot.timeline && shot.timeline.length > 0 ? this.buildTimelineSection(shot.timeline) : undefined,
      shot.audioIntent ? `Audio: ${shot.audioIntent}.` : undefined,
      shot.transitionIntent ? `Transition: ${shot.transitionIntent}.` : undefined,
      "Keep the result cinematic, coherent, and physically plausible."
    ];

    return sections.filter((section): section is string => Boolean(section && section.trim())).join("\n");
  }

  private buildReferenceSection(shot: ShotContract): string {
    if (shot.references.length === 0) {
      return "References: no external reference assets; follow the shot contract only.";
    }
    return `References:\n${describeReferenceBindings(shot.references).map((item) => `- ${item}`).join("\n")}`;
  }

  private buildContinuitySection(shot: ShotContract): string {
    const continuity = shot.continuity;
    const clauses = [
      continuity.identity ? `Identity: preserve ${continuity.identity}.` : undefined,
      continuity.product ? `Product: preserve ${continuity.product}.` : undefined,
      continuity.wardrobe ? `Wardrobe: preserve ${continuity.wardrobe}.` : undefined,
      continuity.environment ? `Environment: preserve ${continuity.environment}.` : undefined,
      continuity.style ? `Visual continuity: maintain ${continuity.style}.` : undefined,
      continuity.previousShotEndState ? `Start state: ${continuity.previousShotEndState}.` : undefined,
      continuity.nextShotStartState ? `End state: ${continuity.nextShotStartState}.` : undefined
    ].filter((clause): clause is string => Boolean(clause));

    return clauses.length > 0 ? `Continuity:\n${clauses.map((clause) => `- ${clause}`).join("\n")}` : "Continuity: follow scene context with no unexplained changes.";
  }

  private buildTimelineSection(timeline: readonly TimelineSegment[]): string {
    const lines = timeline.map((segment, index) => {
      const parts = [
        `Beat ${index + 1}, ${segment.startSecond}-${segment.endSecond}s: ${segment.action}`,
        segment.camera ? `camera ${segment.camera}` : undefined,
        segment.audioCue ? `audio cue ${segment.audioCue}` : undefined
      ].filter((part): part is string => Boolean(part));
      return parts.join("; ");
    });
    return `Timeline:\n${lines.map((line) => `- ${line}.`).join("\n")}`;
  }

  private buildInspectionExpectations(shot: ShotContract): readonly string[] {
    const expectations = new Set<string>([
      "prompt intent is visible",
      "camera instruction is followed",
      "lighting remains coherent",
      "no unintended text, watermark, or subtitles"
    ]);

    for (const reference of sortReferencesForPrompt(shot.references)) {
      expectations.add(`${reference.role} reference is respected`);
    }
    for (const risk of shot.risks) {
      expectations.add(`${risk} risk is controlled`);
    }
    if (shot.transitionIntent) {
      expectations.add("start and end states support the requested transition");
    }
    return [...expectations];
  }

  private resolveMode(shot: ShotContract): ProviderMode {
    const roles = new Set(shot.references.map((reference) => reference.role));
    if (roles.has("motion") || roles.has("audio_tempo") || roles.has("style")) {
      return "reference_to_video";
    }
    if (roles.has("first_frame") || roles.has("last_frame") || roles.has("identity") || roles.has("product")) {
      return "image_to_video";
    }
    return "text_to_video";
  }
}
