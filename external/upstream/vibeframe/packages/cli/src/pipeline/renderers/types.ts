/**
 * Render backend abstraction for VibeFrame rendering.
 *
 * Backends implement RenderBackend so `vibe render` and YAML render steps can
 * target FFmpeg, Hyperframes, or future renderers through one contract.
 *
 * Renderer details live with each backend implementation.
 */

import type { TimelineState } from "@vibeframe/core";

export type BackendName = "ffmpeg" | "hyperframes";

export interface RenderOptions {
  projectState: TimelineState;
  outputPath: string;
  fps?: 24 | 30 | 60;
  quality?: "draft" | "standard" | "high";
  format?: "mp4" | "webm" | "mov";
  /** Hyperframes capture worker count. Defaults to 1 (sequential) — auto-worker mode times out on small comps. */
  workers?: number;
  onProgress?: (pct: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  durationMs?: number;
  framesRendered?: number;
  error?: string;
}

export interface RenderBackend {
  name: BackendName;
  /** Human-readable check before invocation (e.g. Chrome present, FFmpeg version). */
  preflight?(): Promise<{ ok: true } | { ok: false; reason: string }>;
  render(options: RenderOptions): Promise<RenderResult>;
}
