/**
 * Auto-cleans OLD render output so a solo operator's disk never silently fills (durability audit:
 * deliverables/redub/work dirs otherwise accumulate forever, and once the disk is full every render
 * AND every account/ledger write fails).
 *
 * SAFETY — this deletes files, so it is deliberately built as a strict ALLOWLIST, never a denylist:
 *   - It ONLY ever descends into the explicitly-named render-output subdirectories under the output
 *     root (default `work/` and `redub/`). It NEVER touches the output root itself — where the money
 *     files user-accounts.json / admin-settings.json live — nor uploads/, backups/, series/,
 *     business-readiness/, or anything else. A brand-new state file can therefore never be deleted by
 *     accident, because the janitor simply never looks there.
 *   - Within those dirs it removes only child entries whose mtime is older than the retention window,
 *     so an in-progress or recent render (recent mtime) is always skipped.
 *   - It is DISABLED by default (retentionDays = 0). Auto-deleting old customer videos is a conscious
 *     operator choice, enabled by setting CINEJELLY_OUTPUT_RETENTION_DAYS.
 */

import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_CLEANABLE_DIR_NAMES = ["work", "redub"] as const;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // sweep every 6 hours
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class OutputRetentionJanitor {
  private readonly outputRoot: string;
  private readonly retentionMs: number;
  private readonly cleanableDirNames: readonly string[];
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(input: {
    readonly outputRoot: string;
    readonly retentionDays: number;
    readonly cleanableDirNames?: readonly string[];
    readonly intervalMs?: number;
  }) {
    this.outputRoot = input.outputRoot;
    this.retentionMs = Math.max(0, Number.isFinite(input.retentionDays) ? input.retentionDays : 0) * MS_PER_DAY;
    // Allowlist only — see the safety note above. Never includes the root or any state directory.
    this.cleanableDirNames = (input.cleanableDirNames ?? DEFAULT_CLEANABLE_DIR_NAMES).filter(
      (name) => typeof name === "string" && name.length > 0 && !name.includes("/") && !name.includes("\\") && name !== "." && name !== ".."
    );
    this.intervalMs = input.intervalMs && input.intervalMs > 0 ? input.intervalMs : DEFAULT_INTERVAL_MS;
  }

  /** True only when a positive retention is configured; otherwise the janitor is inert. */
  public get enabled(): boolean {
    return this.retentionMs > 0;
  }

  /** Delete render-output child entries older than the retention window. Returns how many were removed. */
  public async sweep(now: number = Date.now()): Promise<{ readonly deletedCount: number }> {
    if (!this.enabled) {
      return { deletedCount: 0 };
    }
    let deletedCount = 0;
    for (const dirName of this.cleanableDirNames) {
      const dir = join(this.outputRoot, dirName);
      let children: readonly string[];
      try {
        children = await readdir(dir);
      } catch {
        // The subdirectory doesn't exist yet (no renders of that kind) — nothing to clean.
        continue;
      }
      for (const child of children) {
        const childPath = join(dir, child);
        try {
          const info = await stat(childPath);
          if (now - info.mtimeMs > this.retentionMs) {
            await rm(childPath, { recursive: true, force: true });
            deletedCount += 1;
          }
        } catch {
          // A file vanishing mid-sweep or a transient error is non-fatal; keep going.
        }
      }
    }
    return { deletedCount };
  }

  /** Start the periodic sweep (unref'd so it never keeps the process alive). No-op when disabled. */
  public start(): void {
    if (!this.enabled || this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.sweep().catch(() => undefined);
    }, this.intervalMs);
    this.timer.unref();
    // A first pass shortly after boot so a disk already near-full starts recovering immediately.
    void this.sweep().catch(() => undefined);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
