/**
 * File-system helpers for production media assembly.
 * They keep path creation and file writes explicit and reusable across workers.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeFileEnsuringDirectory(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}
