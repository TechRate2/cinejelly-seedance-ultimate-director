/**
 * Rendered-clip salvage: a retry of a failed job must not pay for clips it already bought.
 *
 * THE PROBLEM. `DirectorAgent.run()` throws when any shot fails inspection after its candidates and
 * repairs are exhausted. Renders run concurrently, so by the time shot 7 of 10 fails, six to eight
 * clips have already been rendered and billed — and they vanish with the exception. The customer's
 * credits go to a manual refund queue, and their next attempt pays for all ten again. On a 60-second
 * cinematic order (~$54.58) a late failure destroys roughly $49 of finished work.
 *
 * WHAT IS STORED, AND WHY IT IS NOT THE CLIP. Only the provider's `predictionId` per shot. Fetching a
 * completed prediction by id is a status GET (`video.get_prediction`), not a generation call, so a
 * reused clip costs nothing to recover. Storing the output URL instead would duplicate an asset
 * reference this repository deliberately keeps out of durable state — see
 * production-graph-resume-state.ts, where `outputUrlsStored: false` is part of the contract.
 *
 * SCOPE — DELIBERATELY NARROW. This salvages a retry of THE SAME job. It is NOT a content-addressed
 * cache: nothing is matched by prompt similarity, and two different jobs never share a clip. That
 * decision removes the two failure modes a cache would introduce — a customer who edits their brief
 * being silently served the previous video, and one customer's footage surfacing in another's render.
 * A customer who changes anything starts a new job and pays for it, which is how they expect it to work.
 *
 * KEYED ON requestId, NOT projectId. The Studio sends a hard-coded hidden `projectId` of
 * "short_create_shell" for every customer and every render (short-pipeline-create-page.ts), so
 * keying on it would hand every customer everyone else's clips. `requestId` is a per-request random
 * UUID. `clientId` is recorded alongside and must match on read, so even a guessed requestId cannot
 * cross accounts.
 *
 * SEVEN-DAY LIFETIME (owner decision). Records older than that are swept: keeping provider output
 * alive indefinitely costs storage, and a week is far longer than any real retry window.
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** One salvageable shot: enough to re-fetch the clip, and nothing more. */
export interface SalvagedShotRecord {
  readonly shotId: string;
  readonly predictionId: string;
  /** Needed by getPrediction's polling context so the provider maps the response correctly. */
  readonly modelId: string;
  readonly recordedAt: string;
}

export interface ClipSalvageRecord {
  readonly schemaVersion: "cinejelly.clip-salvage.v1";
  readonly requestId: string;
  /** Owner of the job. A read whose clientId differs gets nothing, whatever the requestId. */
  readonly clientId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly shots: readonly SalvagedShotRecord[];
}

/** Owner decision 2026-07-30: a week of retry cover, then the storage is reclaimed. */
export const CLIP_SALVAGE_RETENTION_DAYS = 7;

const SCHEMA_VERSION = "cinejelly.clip-salvage.v1";

export class RenderedClipSalvageStore {
  private readonly directory: string;
  /**
   * Per-request write serialization. Shots finish concurrently and each one appends to the same
   * file; without this, two finishing in the same tick would read the same snapshot and the second
   * write would drop the first shot — losing exactly the clip this store exists to keep.
   */
  private readonly writeLocks = new Map<string, Promise<unknown>>();
  private tempCounter = 0;

  public constructor(options: { readonly outputRoot: string }) {
    this.directory = resolve(options.outputRoot, "clip-salvage");
  }

  private pathFor(requestId: string): string {
    const safe = requestId.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120) || "request";
    return join(this.directory, `${safe}.json`);
  }

  private async withLock<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.writeLocks.get(requestId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.writeLocks.set(requestId, run);
    try {
      return await run;
    } finally {
      if (this.writeLocks.get(requestId) === run) {
        this.writeLocks.delete(requestId);
      }
    }
  }

  /**
   * Record one successfully rendered shot. Append-only per shot: re-recording the same shotId
   * replaces its prediction, because the newest successful render of that shot is the one a retry
   * should reuse.
   *
   * Never throws. This runs on the success path of a render that has already been paid for, and a
   * bookkeeping failure must not turn a working render into a failed one — the cost of a lost record
   * is one re-rendered shot, the cost of a thrown exception here is the whole job.
   */
  public async recordShot(input: {
    readonly requestId: string;
    readonly clientId?: string;
    readonly shotId: string;
    readonly predictionId: string;
    readonly modelId: string;
  }): Promise<void> {
    if (!input.requestId.trim() || !input.shotId.trim() || !input.predictionId.trim()) {
      return;
    }
    try {
      await this.withLock(input.requestId, async () => {
        const existing = await this.readRecord(input.requestId);
        const now = new Date().toISOString();
        const shots = [
          ...(existing?.shots ?? []).filter((shot) => shot.shotId !== input.shotId),
          { shotId: input.shotId, predictionId: input.predictionId, modelId: input.modelId, recordedAt: now }
        ];
        const record: ClipSalvageRecord = {
          schemaVersion: SCHEMA_VERSION,
          requestId: input.requestId,
          ...(input.clientId ? { clientId: input.clientId } : existing?.clientId ? { clientId: existing.clientId } : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          shots
        };
        await this.save(record);
      });
    } catch {
      // Deliberately silent — see the note above.
    }
  }

  /**
   * Shots reusable by a retry of this request, as shotId -> record.
   *
   * Returns nothing when the caller's clientId does not match the record's. That check is the reason
   * a leaked or guessed requestId still cannot pull another account's footage.
   */
  public async reusableShots(input: {
    readonly requestId: string;
    readonly clientId?: string;
  }): Promise<ReadonlyMap<string, SalvagedShotRecord>> {
    const empty = new Map<string, SalvagedShotRecord>();
    if (!input.requestId.trim()) {
      return empty;
    }
    let record: ClipSalvageRecord | undefined;
    try {
      record = await this.readRecord(input.requestId);
    } catch {
      return empty;
    }
    if (!record) {
      return empty;
    }
    // An unowned record (operator/CLI run) is readable only by another unowned run.
    if ((record.clientId ?? "") !== (input.clientId ?? "")) {
      return empty;
    }
    if (this.isExpired(record.createdAt)) {
      return empty;
    }
    return new Map(record.shots.map((shot) => [shot.shotId, shot]));
  }

  /** Drop a request's record — used once its clips have been delivered and cannot be needed again. */
  public async forget(requestId: string): Promise<void> {
    try {
      await rm(this.pathFor(requestId), { force: true });
    } catch {
      // Nothing to do: a record that cannot be removed is swept by retention instead.
    }
  }

  /**
   * Remove records past the retention window. Returns how many were deleted so the caller can report
   * it. Safe to call concurrently with writes: a record being written now is never expired.
   */
  public async sweepExpired(): Promise<number> {
    let removed = 0;
    let files: readonly string[];
    try {
      files = await readdir(this.directory);
    } catch {
      return 0;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const path = join(this.directory, file);
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as ClipSalvageRecord;
        const expired = parsed.schemaVersion !== SCHEMA_VERSION || this.isExpired(parsed.createdAt);
        if (expired) {
          await rm(path, { force: true });
          removed += 1;
        }
      } catch {
        // Unreadable or corrupt: fall back to the file's own age so junk cannot accumulate forever.
        try {
          const stats = await stat(path);
          if (Date.now() - stats.mtimeMs > CLIP_SALVAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
            await rm(path, { force: true });
            removed += 1;
          }
        } catch {
          // Give up on this entry; the next sweep will try again.
        }
      }
    }
    return removed;
  }

  private isExpired(createdAt: string): boolean {
    const created = Date.parse(createdAt);
    if (!Number.isFinite(created)) {
      // An unparseable timestamp is treated as expired: reusing a clip we cannot date is the one
      // outcome worse than re-rendering it.
      return true;
    }
    return Date.now() - created > CLIP_SALVAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  private async readRecord(requestId: string): Promise<ClipSalvageRecord | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(requestId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
    const parsed = JSON.parse(raw) as ClipSalvageRecord;
    return parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.shots) ? parsed : undefined;
  }

  /** Atomic write: a crash mid-save must not leave a half-written record a retry would then trust. */
  private async save(record: ClipSalvageRecord): Promise<void> {
    const path = this.pathFor(record.requestId);
    await mkdir(dirname(path), { recursive: true });
    this.tempCounter += 1;
    const temporary = `${path}.${process.pid}.${this.tempCounter}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }
}
