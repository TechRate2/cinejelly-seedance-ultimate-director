/**
 * Series Continuity Store — the persistence layer that turns the no-spend series planner into a
 * real 30-70-episode product. One JSON file per series under CINEJELLY_OUTPUT_DIR/series/:
 *   - the series bible (world, tone, consistency contract)
 *   - the cast ledger (identity reference URIs so faces stay identical from ep 1 to ep 70;
 *     characters discovered mid-series are merged in — an existing face NEVER gets replaced)
 *   - per-episode states (what happened, the exact end state, the cliffhanger) — the next
 *     episode is written FROM these, not from templates
 *   - a rolling arc summary so late episodes stay coherent without replaying every recap.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { SeriesBible, SeriesCastMember, SeriesDramaRequest, SeriesMacroPhase } from "./series-drama-planner.js";

export interface SeriesEpisodeState {
  readonly episodeNumber: number;
  readonly projectId: string;
  /** 2-3 sentences of what visibly happened (from the Story Architect's episodeSummary). */
  readonly summary: string;
  /** The exact visible state at the final frame — the next episode resumes from it. */
  readonly endState: string;
  /** The unresolved hook the next episode must pick up (absent when the episode resolves). */
  readonly cliffhanger?: string;
  readonly macroPhase: SeriesMacroPhase;
  readonly recordedAt: string;
}

export interface SeriesCastRecord extends SeriesCastMember {
  readonly firstAppearedEpisode: number;
}

export interface SeriesContinuityRecord {
  readonly schemaVersion: "cinejelly.series-continuity.v1";
  readonly seriesId: string;
  readonly request: SeriesDramaRequest;
  readonly bible: SeriesBible;
  readonly cast: readonly SeriesCastRecord[];
  readonly episodeStates: readonly SeriesEpisodeState[];
  /** Rolling condensation of older episodes so ep-40 briefs do not replay 39 full recaps. */
  readonly arcSummary?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** How many most-recent episodes keep FULL summaries in the recap; older ones fold into arcSummary. */
const RECENT_EPISODE_WINDOW = 3;

export class SeriesContinuityStore {
  private readonly seriesDirectory: string;

  public constructor(options: { readonly outputRoot: string }) {
    this.seriesDirectory = resolve(options.outputRoot, "series");
  }

  public pathFor(seriesId: string): string {
    return join(this.seriesDirectory, `${sanitizeSeriesId(seriesId)}.json`);
  }

  public async load(seriesId: string): Promise<SeriesContinuityRecord | undefined> {
    try {
      const raw = await readFile(this.pathFor(seriesId), "utf8");
      const parsed = JSON.parse(raw) as SeriesContinuityRecord;
      return parsed.schemaVersion === "cinejelly.series-continuity.v1" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  public async create(request: SeriesDramaRequest, bible: SeriesBible): Promise<SeriesContinuityRecord> {
    const existing = await this.load(bible.seriesId);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const record: SeriesContinuityRecord = {
      schemaVersion: "cinejelly.series-continuity.v1",
      seriesId: bible.seriesId,
      request,
      bible,
      cast: bible.cast.map((member) => ({ ...member, firstAppearedEpisode: 1 })),
      episodeStates: [],
      createdAt: now,
      updatedAt: now
    };
    await this.save(record);
    return record;
  }

  /**
   * Record a finished episode: append its state, merge any newly-discovered cast (an existing
   * character's face/description always wins — series identity is append-only), and refresh the
   * rolling arc summary.
   */
  public async recordEpisode(
    seriesId: string,
    state: SeriesEpisodeState,
    castGrowth: readonly SeriesCastMember[] = []
  ): Promise<SeriesContinuityRecord> {
    const record = await this.load(seriesId);
    if (!record) {
      throw new Error(`Series ${seriesId} has no continuity record — call create() first.`);
    }
    if (record.episodeStates.some((existing) => existing.episodeNumber === state.episodeNumber)) {
      throw new Error(`Episode ${state.episodeNumber} of series ${seriesId} is already recorded.`);
    }
    const knownIds = new Set(record.cast.map((member) => member.characterId));
    const grown = castGrowth
      .filter((member) => member.characterId && !knownIds.has(member.characterId))
      .map((member) => ({ ...member, firstAppearedEpisode: state.episodeNumber }));
    const episodeStates = [...record.episodeStates, state].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const updated: SeriesContinuityRecord = {
      ...record,
      cast: [...record.cast, ...grown],
      episodeStates,
      ...(episodeStates.length > RECENT_EPISODE_WINDOW
        ? { arcSummary: buildArcSummary(episodeStates) }
        : {}),
      updatedAt: new Date().toISOString()
    };
    await this.save(updated);
    return updated;
  }

  public nextEpisodeNumber(record: SeriesContinuityRecord): number {
    const last = record.episodeStates[record.episodeStates.length - 1];
    return (last?.episodeNumber ?? 0) + 1;
  }

  /**
   * The PREVIOUSLY-ON block for the next episode's brief: rolling arc summary for older
   * episodes + full summaries for the recent window + the exact resume state and open hook.
   */
  public recapFor(record: SeriesContinuityRecord): string | undefined {
    const states = record.episodeStates;
    const last = states[states.length - 1];
    if (!last) {
      return undefined;
    }
    const recent = states.slice(-RECENT_EPISODE_WINDOW);
    const lines: string[] = [];
    if (record.arcSummary && states.length > recent.length) {
      lines.push(`Series so far: ${record.arcSummary}`);
    }
    for (const state of recent) {
      lines.push(`Ep ${state.episodeNumber}: ${state.summary}`);
    }
    lines.push(`Resume EXACTLY from this state: ${last.endState}`);
    if (last.cliffhanger) {
      lines.push(`Open hook this episode MUST pick up: ${last.cliffhanger}`);
    }
    return lines.join(" ");
  }

  private async save(record: SeriesContinuityRecord): Promise<void> {
    const path = this.pathFor(record.seriesId);
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(record, null, 2) + "\n", "utf8");
    await rename(tempPath, path);
  }
}

function sanitizeSeriesId(seriesId: string): string {
  const cleaned = seriesId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!cleaned) {
    throw new Error("seriesId is empty after sanitization.");
  }
  return cleaned.slice(0, 120);
}

function buildArcSummary(states: readonly SeriesEpisodeState[]): string {
  // Deterministic, no-LLM condensation: one clause per episode, oldest first, bounded length.
  const clauses = states
    .slice(0, Math.max(0, states.length - RECENT_EPISODE_WINDOW))
    .map((state) => `E${state.episodeNumber}: ${firstSentence(state.summary)}`);
  const joined = clauses.join(" ");
  return joined.length > 2000 ? `${joined.slice(0, 2000)}...` : joined;
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^[^.!?]{1,200}[.!?]?/u);
  return (match?.[0] ?? text.trim().slice(0, 200)).trim();
}
