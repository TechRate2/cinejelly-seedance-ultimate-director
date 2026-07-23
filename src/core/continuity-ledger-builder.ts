/**
 * Continuity Ledger Builder.
 * Extension based on reference-consistency and media-review patterns: recurring identity and style anchors
 * are converted into Character/Style bibles before render preflight, instead of leaving continuity implicit.
 */

import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { CharacterBible, ContinuityLedger, StyleBible } from "../types/guardian.js";
import type { BeatPlan } from "./shot-planner.js";
import { normalizeCharacterKey, splitCharacterIdentities } from "./keyframe-first-planner.js";

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

  /**
   * One bible PER CHARACTER with only that character's OWN reference labels (repo-fidelity audit,
   * multi-face defect). The old builder made one bible per identity-prose string and required ALL
   * identity labels globally — but the keyframe planner deliberately narrows a single-character
   * shot's references to that shot's cast, so on every 2+-face video the guardian's S1
   * character_bible_reference check false-BLOCKED (demanding the absent character's label) or never
   * fired. Per-character labels + per-character matching make the check enforce exactly what the
   * narrowing keeps: a shot naming a character must carry THAT character's reference.
   */
  private buildCharacterBibles(beats: readonly BeatPlan[], intake: IntakeResult): readonly CharacterBible[] {
    const identityReferences = intake.references.filter((reference) => reference.role === "identity");
    const characters = new Map<string, { readonly name: string; readonly labels: readonly string[] }>();
    for (const beat of beats) {
      for (const name of splitCharacterIdentities(beat.continuity.identity)) {
        const key = normalizeCharacterKey(name);
        if (!key || characters.has(key)) {
          continue;
        }
        // A character's required labels = only the identity references that MATCH that character
        // (by selection.characterId or label). Unmatched characters get [] — the guardian cannot
        // meaningfully demand labels it cannot attribute.
        const labels = identityReferences
          .filter((reference) => {
            const referenceKey = normalizeCharacterKey(reference.selection?.characterId ?? reference.label);
            // Empty keys must never match ("x".includes("") is true for every x).
            return referenceKey.length > 0 && (referenceKey === key || referenceKey.includes(key) || key.includes(referenceKey));
          })
          .map((reference) => reference.label);
        characters.set(key, { name: name.trim(), labels });
      }
    }
    return [...characters.entries()].map(([key, entry]) => ({
      characterId: key,
      identityDescription: entry.name,
      requiredReferenceLabels: entry.labels
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
