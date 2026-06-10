/**
 * Stable ID helper for graph nodes and planned shots.
 * It is deterministic so Production Graph artifacts remain reproducible across retries.
 */

import { createHash } from "node:crypto";

export function createStableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}
