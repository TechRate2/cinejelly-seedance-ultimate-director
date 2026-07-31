/**
 * File-system helpers for production media assembly.
 * They keep path creation and file writes explicit and reusable across workers.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Atomic write: stage to a per-write temp file then rename over the target. A crash or
 * concurrent writer can never leave a half-written file at the real path (rename is atomic
 * within a directory), which matters for artifacts and sidecars other steps read back.
 */
export async function writeFileEnsuringDirectory(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${uniqueWriteSuffix()}.tmp`;
  try {
    await writeFile(tempPath, data);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

let writeSuffixSequence = 0;
function uniqueWriteSuffix(): string {
  writeSuffixSequence += 1;
  return `${Date.now()}_${writeSuffixSequence}`;
}
