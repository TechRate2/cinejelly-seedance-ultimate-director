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

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  /** Absolute path to the rendered episode video (under the output root) so it can be downloaded. */
  readonly videoPath?: string;
  readonly recordedAt: string;
}

export interface SeriesCastRecord extends SeriesCastMember {
  readonly firstAppearedEpisode: number;
}

export interface SeriesContinuityRecord {
  readonly schemaVersion: "cinejelly.series-continuity.v1";
  readonly seriesId: string;
  /** Customer owner (userId) — absent for operator-created series. Routes enforce it. */
  readonly ownerUserId?: string;
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

/**
 * Series one customer may own.
 *
 * Creation was unbounded, and listing costs a read+parse of EVERY series file belonging to EVERY
 * customer — each of which holds a bible, a cast ledger and one state per episode. A free account
 * could therefore make every other customer's series list progressively slower and more expensive
 * just by creating series, without rendering anything or spending a credit.
 *
 * Twenty is far past what a real customer runs at once and cheap to raise deliberately; unbounded
 * was never a product decision, only an omission.
 */
const MAX_SERIES_PER_OWNER = 20;

export class SeriesContinuityStore {
  private readonly seriesDirectory: string;
  /** Per-series write serialization so a read-modify-write (create/recordEpisode) is atomic within
   *  this process regardless of caller — the HTTP recordRenderedEpisode path bypasses the director's
   *  own lock, and two overlapping records would else drop an episode / corrupt the file (audit HIGH). */
  private readonly writeLocks = new Map<string, Promise<unknown>>();
  private tempCounter = 0;

  public constructor(options: { readonly outputRoot: string }) {
    this.seriesDirectory = resolve(options.outputRoot, "series");
  }

  /** Work directory for a series' derived assets (episode end frames), beside its record. */
  public workDirectoryFor(seriesId: string): string {
    return resolve(this.seriesDirectory, "derived", seriesId.replace(/[^a-zA-Z0-9_-]+/g, "_"));
  }

  private async withSeriesLock<T>(seriesId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.writeLocks.get(seriesId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.writeLocks.set(seriesId, run);
    try {
      return await run;
    } finally {
      if (this.writeLocks.get(seriesId) === run) {
        this.writeLocks.delete(seriesId);
      }
    }
  }

  public pathFor(seriesId: string): string {
    return join(this.seriesDirectory, `${sanitizeSeriesId(seriesId)}.json`);
  }

  public async load(seriesId: string): Promise<SeriesContinuityRecord | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(seriesId), "utf8");
    } catch (error) {
      // ENOENT = the series genuinely does not exist -> undefined (create() may make it). Any OTHER
      // read error is surfaced so a transient/permission fault is never mistaken for "absent".
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
    // A present-but-corrupt file must NOT read as "absent" — that would let create() overwrite and
    // reset a real 30-70-episode series to episode 0 (deep-audit HIGH). Surface the corruption.
    const parsed = JSON.parse(raw) as SeriesContinuityRecord;
    return parsed.schemaVersion === "cinejelly.series-continuity.v1" ? parsed : undefined;
  }

  /**
   * Every series owned by a customer (newest first). Operator listing (ownerUserId === undefined)
   * is intentionally NOT supported here — operators use the full record files directly.
   */
  /**
   * Every series owned by a customer (newest first).
   *
   * Reads and parses every series file in the directory, so its cost grows with the TOTAL number of
   * series across all customers, not just this customer's. Creation is capped per owner
   * (MAX_SERIES_PER_OWNER) so that total stays bounded by customers x cap rather than by whatever a
   * single account decides to create. At a scale where customers x cap becomes slow, this wants an
   * owner index or an owner-prefixed filename — a deliberate change, not something to bolt on here.
   */
  public async listByOwner(ownerUserId: string): Promise<readonly SeriesContinuityRecord[]> {
    let files: readonly string[];
    try {
      files = await readdir(this.seriesDirectory);
    } catch {
      return [];
    }
    const records: SeriesContinuityRecord[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      try {
        const parsed = JSON.parse(await readFile(join(this.seriesDirectory, file), "utf8")) as SeriesContinuityRecord;
        if (parsed.schemaVersion === "cinejelly.series-continuity.v1" && parsed.ownerUserId === ownerUserId) {
          records.push(parsed);
        }
      } catch {
        // Skip unreadable/corrupt series files rather than failing the whole listing.
      }
    }
    return records.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  public async create(
    request: SeriesDramaRequest,
    bible: SeriesBible,
    ownerUserId?: string
  ): Promise<SeriesContinuityRecord> {
    return this.withSeriesLock(bible.seriesId, async () => {
      const existing = await this.load(bible.seriesId);
      // Bound creation per owner. Checked only for a genuinely NEW series (an existing id returns
      // early below), and only for owned records — an operator/CLI run has no ownerUserId and is not
      // a tenant competing for shared cost.
      if (!existing && ownerUserId) {
        const owned = await this.listByOwner(ownerUserId);
        if (owned.length >= MAX_SERIES_PER_OWNER) {
          throw new Error(
            `Bạn đã đạt giới hạn ${MAX_SERIES_PER_OWNER} bộ phim dài tập. Hãy xoá bớt bộ cũ hoặc liên hệ hỗ trợ để nâng giới hạn.`
          );
        }
      }
      if (existing) {
        return existing;
      }
      const now = new Date().toISOString();
      const record: SeriesContinuityRecord = {
        schemaVersion: "cinejelly.series-continuity.v1",
        seriesId: bible.seriesId,
        ...(ownerUserId ? { ownerUserId } : {}),
        request,
        bible,
        cast: bible.cast.map((member) => ({ ...member, firstAppearedEpisode: 1 })),
        episodeStates: [],
        createdAt: now,
        updatedAt: now
      };
      await this.save(record);
      return record;
    });
  }

  /**
   * Record a finished episode: append its state, merge any newly-discovered cast (an existing
   * character's face/description always wins — series identity is append-only), and refresh the
   * rolling arc summary.
   */
  public async recordEpisode(
    seriesId: string,
    state: SeriesEpisodeState,
    castGrowth: readonly SeriesCastMember[] = [],
    /**
     * Identity portraits actually bound during this episode's render. Backfilled onto cast members
     * that have no face pinned yet, so an INVENTED character keeps episode 1's face for the rest of
     * the series instead of being re-invented (and re-paid for) every episode. Append-only: an
     * existing URI — the customer's own upload, or an earlier episode's locked face — is never
     * overwritten.
     */
    identityAnchors: readonly { readonly characterKey: string; readonly label: string; readonly uri: string }[] = []
  ): Promise<SeriesContinuityRecord> {
    // Serialize the whole read-modify-write so overlapping records (e.g. the HTTP path, which
    // bypasses the director's own lock) can't both load the same base and drop an episode (audit HIGH).
    return this.withSeriesLock(seriesId, async () => {
      const record = await this.load(seriesId);
      if (!record) {
        throw new Error(`Series ${seriesId} has no continuity record — call create() first.`);
      }
      if (record.episodeStates.some((existing) => existing.episodeNumber === state.episodeNumber)) {
        throw new Error(`Episode ${state.episodeNumber} of series ${seriesId} is already recorded.`);
      }
      // knownIds grows AS the batch is filtered. Checking against a frozen snapshot let two new
      // characters that happened to share an id both enter the ledger under that one id, after
      // which their two different portraits fought over the same slot — the identity-mixing failure
      // this store exists to prevent.
      const knownIds = new Set(record.cast.map((member) => member.characterId));
      const grown: SeriesCastRecord[] = [];
      for (const member of castGrowth) {
        if (!member.characterId || knownIds.has(member.characterId)) {
          continue;
        }
        knownIds.add(member.characterId);
        grown.push({ ...member, firstAppearedEpisode: state.episodeNumber });
      }
      const episodeStates = [...record.episodeStates, state].sort((a, b) => a.episodeNumber - b.episodeNumber);
      // Pin each character's face from this episode's bound portraits (match on characterId or name,
      // normalized), but ONLY where none is pinned yet.
      // Matching a cast member to a portrait is an IDENTITY decision — pinning the wrong URI puts
      // one character's face on another for the rest of the series, and nothing downstream can
      // detect it. So the match runs strict-first with a deliberately narrow fallback:
      //
      // exactKey keeps letters as written (Unicode-aware, so Vietnamese survives): "Lan" and "Lân"
      // stay two different people. A plain [a-z0-9] slug — the first cut of this code — was
      // catastrophic here: it deleted every accented vowel, so "Bác Hùng" and "Bác Hằng" both became
      // "b_c_h_ng", and any name starting with Đ lost its stem outright ("Đức" -> "c").
      //
      // foldedKey additionally strips diacritics, and is consulted ONLY when the exact key misses —
      // it absorbs harmless spelling drift ("Bác Hùng" vs "Bac Hung") from two sides of the pipeline
      // that normalize differently. Because folding CAN merge genuinely different names, any folded
      // key claimed by more than one distinct portrait is marked ambiguous and never matched: an
      // unpinned face costs one regenerated portrait, a wrongly pinned face ruins the series.
      const exactKey = (value: string): string =>
        value.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "");
      const foldedKey = (value: string): string =>
        value
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/đ/g, "d")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      // The ambiguity universe is EVERY name in play this episode — the portraits AND the cast's own
      // names and ids — not just portrait-vs-portrait. Checking only portraits against each other
      // left the common case wide open: a cast of "Dũng" (male lead) and "Dung" (female lead) where
      // only Dũng recurred enough to earn a portrait produces exactly ONE anchor, so the guard had
      // nothing to compare and the accent-folding fallback happily handed Dũng's face to Dung.
      const foldGroups = new Map<string, Set<string>>();
      const noteName = (value: string | undefined): void => {
        const exact = exactKey(value ?? "");
        const folded = foldedKey(value ?? "");
        if (!exact || !folded) {
          return;
        }
        const group = foldGroups.get(folded) ?? new Set<string>();
        group.add(exact);
        foldGroups.set(folded, group);
      };
      const castInPlay = [...record.cast, ...grown];
      for (const anchor of identityAnchors) {
        noteName(anchor.characterKey);
        noteName(anchor.label);
      }
      for (const member of castInPlay) {
        noteName(member.characterId);
        noteName(member.name);
      }

      const anchorByExact = new Map<string, string>();
      const anchorByFolded = new Map<string, string>();
      /** Exact keys claimed by two different portraits — refuse rather than pick one at random. */
      const ambiguousExact = new Set<string>();
      for (const anchor of identityAnchors) {
        if (!anchor.uri) {
          continue;
        }
        for (const candidate of [anchor.characterKey, anchor.label]) {
          const exact = exactKey(candidate ?? "");
          if (!exact) {
            continue;
          }
          const claimedExact = anchorByExact.get(exact);
          if (claimedExact === undefined) {
            anchorByExact.set(exact, anchor.uri);
          } else if (claimedExact !== anchor.uri) {
            ambiguousExact.add(exact);
          }
          const folded = foldedKey(candidate ?? "");
          if (!folded) {
            continue;
          }
          const claimedFolded = anchorByFolded.get(folded);
          if (claimedFolded === undefined) {
            anchorByFolded.set(folded, anchor.uri);
          }
        }
      }
      /** A folded key is safe only when exactly ONE distinct real name folds onto it. */
      const foldedIsSafe = (folded: string): boolean => (foldGroups.get(folded)?.size ?? 0) <= 1;
      const exactUriFor = (value: string | undefined): string | undefined => {
        const exact = exactKey(value ?? "");
        return exact && !ambiguousExact.has(exact) ? anchorByExact.get(exact) : undefined;
      };
      const foldedUriFor = (value: string | undefined): string | undefined => {
        const folded = foldedKey(value ?? "");
        return folded && foldedIsSafe(folded) ? anchorByFolded.get(folded) : undefined;
      };
      // Which cast member each NAME belongs to. Portraits are produced from a character's label, so
      // the name is the authoritative key; characterId is free operator/customer text that happens
      // to be usable as a secondary hint.
      const memberOwningNameKey = new Map<string, string>();
      for (const member of castInPlay) {
        const key = exactKey(member.name ?? "");
        if (key && !memberOwningNameKey.has(key)) {
          memberOwningNameKey.set(key, member.characterId);
        }
      }
      const withPinnedFaces = <T extends SeriesCastMember>(members: readonly T[]): readonly T[] =>
        members.map((member) => {
          if (member.identityReferenceUri?.trim()) {
            return member;
          }
          // The member's OWN NAME is tried first and wins outright. Resolving characterId first let
          // an id typed as "dung" for a character named "Dũng" exact-match a DIFFERENT character
          // actually called "Dung" and take that stranger's portrait, while the character's own
          // correct match was never consulted.
          //
          // characterId is only consulted when the name found nothing, and then only if that id is
          // not already some OTHER character's name — an id that collides with a different cast
          // member's name carries no information about who this person is, and following it is
          // exactly how one character ends up wearing another's face permanently.
          const idIsSafe = ((): boolean => {
            const key = exactKey(member.characterId ?? "");
            if (!key) {
              return false;
            }
            const owner = memberOwningNameKey.get(key);
            return owner === undefined || owner === member.characterId;
          })();
          const uri =
            exactUriFor(member.name) ??
            (idIsSafe ? exactUriFor(member.characterId) : undefined) ??
            foldedUriFor(member.name) ??
            (idIsSafe ? foldedUriFor(member.characterId) : undefined);
          return uri ? { ...member, identityReferenceUri: uri } : member;
        });
      const updated: SeriesContinuityRecord = {
        ...record,
        cast: withPinnedFaces(castInPlay),
        episodeStates,
        ...(episodeStates.length > RECENT_EPISODE_WINDOW
          ? { arcSummary: buildArcSummary(episodeStates) }
          : {}),
        updatedAt: new Date().toISOString()
      };
      await this.save(updated);
      return updated;
    });
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
    // UNIQUE temp path per write (pid + counter) so two writers never interleave into one shared
    // .tmp and rename garbled JSON — matches every other store in the repo (audit HIGH).
    this.tempCounter += 1;
    const tempPath = `${path}.${process.pid}.${this.tempCounter}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(record, null, 2) + "\n", "utf8");
      await rename(tempPath, path);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
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
