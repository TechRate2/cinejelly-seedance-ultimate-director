/**
 * Continuity Ledger Builder.
 * Extension based on ViMax/DirectorBench/Atlas consistency patterns: recurring identity and style anchors
 * are converted into Character/Style bibles before render preflight, instead of leaving continuity implicit.
 */

import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { CharacterBible, ContinuityLedger, StyleBible } from "../types/guardian.js";
import type { BeatPlan } from "./shot-planner.js";

export class ContinuityLedgerBuilder {
  public build(input: {
    readonly intake: IntakeResult;
    readonly storyPlan: StoryPlan;
  }): ContinuityLedger {
    const beats = input.storyPlan.scenes.flatMap((scene) => scene.beats);
    return {
      characters: this.buildCharacterBibles(beats, input.intake),
      styles: this.buildStyleBibles(beats),
      approvedShotIds: []
    };
  }

  private buildCharacterBibles(beats: readonly BeatPlan[], intake: IntakeResult): readonly CharacterBible[] {
    const identityReferenceLabels = intake.references
      .filter((reference) => reference.role === "identity")
      .map((reference) => reference.label);
    const identities = this.unique(
      beats
        .map((beat) => beat.continuity.identity)
        .filter((identity): identity is string => Boolean(identity?.trim()))
    );

    return identities.map((identity) => ({
      characterId: identity,
      identityDescription: identity,
      requiredReferenceLabels: identityReferenceLabels
    }));
  }

  private buildStyleBibles(beats: readonly BeatPlan[]): readonly StyleBible[] {
    const styleValues = this.unique(
      beats
        .flatMap((beat) => [beat.style, beat.continuity.style])
        .filter((style): style is string => Boolean(style?.trim()))
    );

    return styleValues.map((style) => ({
      styleId: style,
      visualRules: [style],
      prohibitedDrift: [
        "change visual style",
        "unrelated visual style",
        "inconsistent style"
      ]
    }));
  }

  private unique(values: readonly string[]): readonly string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const normalized = value.trim();
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }
}
