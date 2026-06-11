/**
 * Material sourcing planner inspired by MoneyPrinterTurbo's staged material flow,
 * implemented as CineJelly-owned planning contracts.
 *
 * This module does not call stock APIs and does not import upstream code. It turns
 * approved shot contracts into governed sourcing briefs that later adapters can
 * fulfill through user-owned, local-library, stock, or Atlas asset-library paths.
 */

import type {
  MaterialPurpose,
  MaterialSearchTerm,
  MaterialSource,
  MaterialSourcingBrief,
  MaterialSourcingPlan
} from "../types/material.js";
import type { ShotContract } from "../types/prompt.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";

export interface MaterialSourcingPlannerInput {
  readonly projectId: string;
  readonly shots: readonly ShotContract[];
  readonly settings: FlexibleSeedanceSettings;
  readonly allowRemoteSources?: boolean;
  readonly preferredSources?: readonly MaterialSource[];
  readonly maxCandidatesPerBrief?: number;
}

export class MaterialSourcingPlanner {
  public plan(input: MaterialSourcingPlannerInput): MaterialSourcingPlan {
    const allowRemoteSources = input.allowRemoteSources ?? false;
    const preferredSources =
      input.preferredSources ?? this.defaultSources(allowRemoteSources);

    const briefs = input.shots.map((shot) =>
      this.createBrief({
        projectId: input.projectId,
        shot,
        settings: input.settings,
        allowRemoteSources,
        preferredSources,
        maxCandidates: input.maxCandidatesPerBrief ?? this.defaultCandidateCount(input.settings.qualityMode)
      })
    );

    return {
      planId: createStableId("material_plan", `${input.projectId}:${briefs.map((brief) => brief.briefId).join("|")}`),
      projectId: input.projectId,
      sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo"],
      briefs
    };
  }

  private createBrief(input: {
    readonly projectId: string;
    readonly shot: ShotContract;
    readonly settings: FlexibleSeedanceSettings;
    readonly allowRemoteSources: boolean;
    readonly preferredSources: readonly MaterialSource[];
    readonly maxCandidates: number;
  }): MaterialSourcingBrief {
    const purpose = this.inferPurpose(input.shot);
    const targetDurationSeconds = Math.max(1, Math.ceil(input.shot.durationSeconds));

    return {
      briefId: createStableId(
        "material_brief",
        `${input.projectId}:${input.shot.shotId}:${purpose}:${input.settings.ratio}`
      ),
      projectId: input.projectId,
      shotId: input.shot.shotId,
      ...(input.shot.sceneId ? { sceneId: input.shot.sceneId } : {}),
      purpose,
      queryTerms: this.buildSearchTerms(input.shot),
      preferredSources: input.preferredSources,
      aspectRatio: input.settings.ratio,
      resolution: input.settings.resolution,
      minimumDurationSeconds: Math.min(targetDurationSeconds, 4),
      targetDurationSeconds,
      maxCandidates: input.maxCandidates,
      rightsRequirement: input.allowRemoteSources ? "commercial_stock" : "user_owned",
      allowRemoteSources: input.allowRemoteSources
    };
  }

  private defaultSources(allowRemoteSources: boolean): readonly MaterialSource[] {
    if (!allowRemoteSources) {
      return ["user_provided", "local_library"];
    }
    return ["user_provided", "local_library", "pexels", "pixabay", "coverr"];
  }

  private defaultCandidateCount(qualityMode: FlexibleSeedanceSettings["qualityMode"]): number {
    switch (qualityMode) {
      case "economy":
        return 2;
      case "standard":
        return 3;
      case "high":
        return 4;
      case "ultimate":
        return 6;
    }
  }

  private inferPurpose(shot: ShotContract): MaterialPurpose {
    if (shot.audioIntent && shot.references.some((reference) => reference.role === "audio_tempo")) {
      return "audio_bed";
    }
    if (shot.references.some((reference) => reference.role === "product")) {
      return "product_plate";
    }
    if (shot.references.some((reference) => reference.role === "source_video_structure")) {
      return "reference_plate";
    }
    return "b_roll";
  }

  private buildSearchTerms(shot: ShotContract): readonly MaterialSearchTerm[] {
    const weightedTerms = [
      { text: shot.subject, weight: 1, reason: "shot subject" },
      { text: shot.intent, weight: 0.85, reason: "shot intent" },
      { text: shot.action, weight: 0.7, reason: "shot action" },
      ...(shot.style ? [{ text: shot.style, weight: 0.45, reason: "style cue" }] : [])
    ];

    const seen = new Set<string>();
    return weightedTerms
      .map((term) => ({
        term: this.normalizeTerm(term.text),
        weight: term.weight,
        reason: term.reason
      }))
      .filter((term) => {
        if (!term.term || seen.has(term.term)) {
          return false;
        }
        seen.add(term.term);
        return true;
      });
  }

  private normalizeTerm(value: string): string {
    return value
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .slice(0, 120);
  }
}
