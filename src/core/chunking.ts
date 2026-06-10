/**
 * Smart clip chunking for Seedance 2.0 long-form production.
 * It keeps every renderable shot inside the 4-15 second provider clip window.
 */

import type { QualityMode } from "../types/settings.js";

const MIN_CLIP_SECONDS = 4;
const MAX_CLIP_SECONDS = 15;

export interface ChunkingInput {
  readonly totalDurationSeconds: number;
  readonly qualityMode: QualityMode;
  readonly highRisk: boolean;
}

export interface DurationChunk {
  readonly index: number;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly durationSeconds: number;
}

export function planDurationChunks(input: ChunkingInput): readonly DurationChunk[] {
  if (!Number.isFinite(input.totalDurationSeconds) || input.totalDurationSeconds <= 0) {
    throw new Error("Chunking duration must be positive.");
  }

  const targetClipSeconds = chooseTargetClipDuration(input.qualityMode, input.highRisk);
  const chunks: DurationChunk[] = [];
  let cursor = 0;

  while (cursor < input.totalDurationSeconds) {
    const remaining = input.totalDurationSeconds - cursor;
    const duration = chooseNextChunkDuration(remaining, targetClipSeconds);
    chunks.push({
      index: chunks.length,
      startSecond: cursor,
      endSecond: cursor + duration,
      durationSeconds: duration
    });
    cursor += duration;
  }

  return chunks;
}

function chooseTargetClipDuration(qualityMode: QualityMode, highRisk: boolean): number {
  if (highRisk) {
    return qualityMode === "ultimate" ? 5 : 6;
  }
  switch (qualityMode) {
    case "economy":
      return 12;
    case "standard":
      return 10;
    case "high":
      return 8;
    case "ultimate":
      return 6;
  }
}

function chooseNextChunkDuration(remaining: number, targetClipSeconds: number): number {
  if (remaining <= MAX_CLIP_SECONDS) {
    return Math.max(MIN_CLIP_SECONDS, remaining);
  }
  const afterTarget = remaining - targetClipSeconds;
  if (afterTarget > 0 && afterTarget < MIN_CLIP_SECONDS) {
    return Math.min(MAX_CLIP_SECONDS, targetClipSeconds + afterTarget);
  }
  return Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, targetClipSeconds));
}
