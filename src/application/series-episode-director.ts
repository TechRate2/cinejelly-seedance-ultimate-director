/**
 * Series Episode Director — renders a 30-70-episode drama ONE episode at a time with real
 * continuity, instead of the planner's templated recaps:
 *
 *   load continuity record -> compose the next episode's request (planned beats + the REAL
 *   previously-on recap from recorded episode states + pinned cast identity references so
 *   faces stay identical from ep 1 to ep 70) -> director.run (all normal review/cost gates,
 *   INCLUDING the paid-render confirmation policy — this class never bypasses spend gates)
 *   -> record what actually happened (Story Architect's episodeSummary/endState/cliffhanger)
 *   back into the store for the following episode.
 */

import type { CineJellyProjectRequest, DirectorRunResult } from "../types/agent.js";
import type { PromptReference } from "../types/prompt.js";
import {
  episodeRenderRequestFor,
  planSeriesDrama,
  type SeriesDramaPlan,
  type SeriesDramaRequest,
  type SeriesMacroPhase
} from "../core/series-drama-planner.js";
import {
  SeriesContinuityStore,
  type SeriesContinuityRecord,
  type SeriesEpisodeState
} from "../core/series-continuity-store.js";

export interface EpisodeDirectorRunner {
  run(request: CineJellyProjectRequest, signal?: AbortSignal): Promise<DirectorRunResult>;
}

export interface SeriesEpisodeRenderResult {
  readonly episodeNumber: number;
  readonly result: DirectorRunResult;
  readonly record: SeriesContinuityRecord;
}

export class SeriesEpisodeDirector {
  private readonly director: EpisodeDirectorRunner;
  private readonly store: SeriesContinuityStore;
  /** Per-series render chain: two renderNextEpisode calls for one series run strictly in order. */
  private readonly seriesLocks = new Map<string, Promise<unknown>>();

  public constructor(options: { readonly director: EpisodeDirectorRunner; readonly store: SeriesContinuityStore }) {
    this.director = options.director;
    this.store = options.store;
  }

  /** Create (or return) the series' continuity record. No spend — planning is pure. */
  public async startSeries(request: SeriesDramaRequest, ownerUserId?: string): Promise<SeriesContinuityRecord> {
    const plan = planSeriesDrama(request);
    // Persist the request WITH the resolved seriesId so every later re-plan is deterministic.
    return this.store.create({ ...request, seriesId: plan.bible.seriesId }, plan.bible, ownerUserId);
  }

  /**
   * Compose the next episode's render request WITHOUT running it — exposed separately so
   * callers can show the brief (and its cost estimate) before committing paid work.
   */
  public async composeNextEpisode(
    seriesId: string
  ): Promise<{ readonly episodeNumber: number; readonly request: CineJellyProjectRequest }> {
    const record = await this.requireRecord(seriesId);
    const plan = planSeriesDrama(record.request);
    const episodeNumber = this.store.nextEpisodeNumber(record);
    if (episodeNumber > plan.episodes.length) {
      throw new Error(`Series ${seriesId} is complete: all ${plan.episodes.length} episodes are recorded.`);
    }
    const base = episodeRenderRequestFor(plan, episodeNumber);
    const recap = this.store.recapFor(record);
    const request: CineJellyProjectRequest = {
      ...base,
      // The REAL previously-on block outranks the planner's templated recap hook: it is what
      // actually happened in the rendered episodes, so the scriptwriter continues facts, not
      // templates. Appended (not replacing) so the planned beat structure stays intact.
      userInput: recap
        ? `${base.userInput}\nPREVIOUSLY ON (authoritative — continue these facts exactly): ${recap}`
        : base.userInput,
      references: this.mergedIdentityReferences(base.references ?? [], record),
      metadata: {
        ...(base.metadata ?? {}),
        ...(recap ? { seriesRecap: recap } : {}),
        ...(record.arcSummary ? { seriesArcSummary: record.arcSummary } : {})
      }
    };
    return { episodeNumber, request };
  }

  /** Render the next episode through the normal pipeline and record its real outcome. */
  public async renderNextEpisode(seriesId: string, signal?: AbortSignal): Promise<SeriesEpisodeRenderResult> {
    // Serialize per series: concurrent calls would both compose "episode N" and double-render
    // (the store rejects the duplicate record, but only AFTER the second paid render ran).
    const previous = this.seriesLocks.get(seriesId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.renderNextEpisodeSerialized(seriesId, signal));
    this.seriesLocks.set(seriesId, run);
    try {
      return await run;
    } finally {
      if (this.seriesLocks.get(seriesId) === run) {
        this.seriesLocks.delete(seriesId);
      }
    }
  }

  private async renderNextEpisodeSerialized(seriesId: string, signal?: AbortSignal): Promise<SeriesEpisodeRenderResult> {
    const record = await this.requireRecord(seriesId);
    const { episodeNumber, request } = await this.composeNextEpisode(seriesId);
    const result = await this.director.run(request, signal);
    const state = this.episodeStateFrom(record, episodeNumber, request, result);
    const updated = await this.store.recordEpisode(seriesId, state, this.castGrowthFrom(record, result));
    return { episodeNumber, result, record: updated };
  }

  /**
   * Record an episode that was rendered OUTSIDE renderNextEpisode (e.g. an HTTP route that
   * normalizes/gates the composed request itself before running the director).
   */
  public async recordRenderedEpisode(
    seriesId: string,
    episodeNumber: number,
    request: CineJellyProjectRequest,
    result: DirectorRunResult
  ): Promise<SeriesContinuityRecord> {
    const record = await this.requireRecord(seriesId);
    const state = this.episodeStateFrom(record, episodeNumber, request, result);
    return this.store.recordEpisode(seriesId, state, this.castGrowthFrom(record, result));
  }

  /**
   * Cast growth (vimax pattern): characters the scriptwriter introduced this episode that are not
   * in the ledger yet — recorded name-only so their LABEL stays stable in every later episode's
   * brief (their face gets pinned once a portrait exists; existing faces are never replaced).
   */
  private castGrowthFrom(
    record: SeriesContinuityRecord,
    result: DirectorRunResult
  ): readonly { characterId: string; name: string; castRole: "support"; description: string }[] {
    const known = new Set(record.cast.flatMap((member) => [member.characterId.toLowerCase(), member.name.toLowerCase()]));
    const discovered = new Map<string, string>();
    for (const scene of result.storyPlan.scenes) {
      for (const beat of scene.beats) {
        const identity = beat.continuity?.identity;
        if (!identity) {
          continue;
        }
        for (const label of identity.split(",").map((part) => part.trim()).filter(Boolean)) {
          const key = label.toLowerCase();
          if (!known.has(key) && !discovered.has(key) && label.length <= 60) {
            discovered.set(key, label);
          }
        }
      }
    }
    return [...discovered.values()].map((name) => ({
      characterId: name.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "new_character",
      name,
      castRole: "support" as const,
      description: `Introduced mid-series; keep the same face and presentation as their first appearance.`
    }));
  }

  private episodeStateFrom(
    record: SeriesContinuityRecord,
    episodeNumber: number,
    request: CineJellyProjectRequest,
    result: DirectorRunResult
  ): SeriesEpisodeState {
    const plan: SeriesDramaPlan = planSeriesDrama(record.request);
    const planned = plan.episodes.find((episode) => episode.episodeNumber === episodeNumber);
    const macroPhase: SeriesMacroPhase = planned?.macroPhase ?? "escalation";
    // The Story Architect's series fields are authoritative (what was actually written);
    // planner templates are the deterministic fallback so recording never fails.
    const summary = result.storyPlan.episodeSummary ?? result.storyPlan.premise;
    const endState = result.storyPlan.episodeEndState
      ?? (typeof request.metadata?.seriesEndingState === "string" ? request.metadata.seriesEndingState : "")
      ?? "";
    const cliffhanger = result.storyPlan.cliffhanger
      ?? (planned?.endingStyle === "cliffhanger" ? planned.twist : undefined);
    return {
      episodeNumber,
      projectId: result.projectId,
      summary,
      endState: endState || summary,
      ...(cliffhanger ? { cliffhanger } : {}),
      macroPhase,
      recordedAt: new Date().toISOString()
    };
  }

  /**
   * Pinned faces: the bible cast's identity references come from the planner; characters that
   * GREW into the cast mid-series (recorded in the store with their own reference) are appended.
   * A character already referenced keeps the original URI — faces are append-only.
   */
  private mergedIdentityReferences(
    base: readonly PromptReference[],
    record: SeriesContinuityRecord
  ): readonly PromptReference[] {
    const seen = new Set(base.map((reference) => reference.label));
    const grown = record.cast
      .filter((member) => member.identityReferenceUri?.trim() && !seen.has(member.characterId))
      .map((member): PromptReference => ({
        role: "identity",
        label: member.characterId,
        providerReference: {
          kind: "image",
          uri: member.identityReferenceUri as string,
          label: member.characterId,
          role: "identity"
        },
        priority: "primary",
        selection: { characterId: member.characterId, authorized: true }
      }));
    return [...base, ...grown];
  }

  private async requireRecord(seriesId: string): Promise<SeriesContinuityRecord> {
    const record = await this.store.load(seriesId);
    if (!record) {
      throw new Error(`Series ${seriesId} not found — call startSeries() first.`);
    }
    return record;
  }
}
