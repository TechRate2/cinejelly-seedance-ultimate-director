import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BuildAssetKind } from "./build-cache.js";

export type AssetFreshness = "fresh" | "stale" | "unknown" | "referenced";

export interface BuildAssetMetadata {
  schemaVersion: "1";
  kind: BuildAssetKind;
  beatId: string;
  cue: string;
  provider: string;
  options?: Record<string, unknown>;
  cacheKey: string;
  canonicalPath: string;
  cachePath?: string;
  updatedAt: string;
}

export function assetMetadataPath(kind: BuildAssetKind, beatId: string): string {
  return `.vibeframe/assets/${kind}-${beatId}.json`;
}

export function readAssetMetadata(
  projectDir: string,
  kind: BuildAssetKind,
  beatId: string
): BuildAssetMetadata | null {
  const path = join(projectDir, assetMetadataPath(kind, beatId));
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<BuildAssetMetadata>;
    if (
      parsed.schemaVersion !== "1" ||
      parsed.kind !== kind ||
      parsed.beatId !== beatId ||
      typeof parsed.cacheKey !== "string"
    ) {
      return null;
    }
    return parsed as BuildAssetMetadata;
  } catch {
    return null;
  }
}

export function assetFreshnessFromMetadata(opts: {
  projectDir: string;
  kind: BuildAssetKind;
  beatId: string;
  expectedCacheKey?: string;
  canonicalExists: boolean;
}): AssetFreshness | undefined {
  if (!opts.canonicalExists) return undefined;
  if (!opts.expectedCacheKey) return "unknown";
  const metadata = readAssetMetadata(opts.projectDir, opts.kind, opts.beatId);
  if (!metadata) return "unknown";
  return metadata.cacheKey === opts.expectedCacheKey ? "fresh" : "stale";
}

export function isFreshCanonicalAsset(opts: {
  projectDir: string;
  kind: BuildAssetKind;
  beatId: string;
  cue: string;
  provider?: string;
  options?: Record<string, unknown>;
  cacheKey?: string;
}): boolean {
  const metadata = readAssetMetadata(opts.projectDir, opts.kind, opts.beatId);
  if (!metadata) return false;
  if (opts.cacheKey) return metadata.cacheKey === opts.cacheKey;
  if (metadata.cue !== opts.cue) return false;
  if (opts.provider && metadata.provider !== opts.provider) return false;
  if (!opts.options) return true;
  return Object.entries(opts.options).every(([key, value]) => metadata.options?.[key] === value);
}

export async function writeAssetMetadata(opts: {
  projectDir: string;
  kind: BuildAssetKind;
  beatId: string;
  cue: string;
  provider: string;
  options?: Record<string, unknown>;
  cacheKey: string;
  canonicalPath: string;
  cachePath?: string;
}): Promise<void> {
  const rel = assetMetadataPath(opts.kind, opts.beatId);
  const abs = join(opts.projectDir, rel);
  const metadata: BuildAssetMetadata = {
    schemaVersion: "1",
    kind: opts.kind,
    beatId: opts.beatId,
    cue: opts.cue,
    provider: opts.provider,
    options: opts.options,
    cacheKey: opts.cacheKey,
    canonicalPath: opts.canonicalPath,
    cachePath: opts.cachePath,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(metadata, null, 2) + "\n", "utf-8");
}
