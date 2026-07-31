/**
 * Caption Engine.
 * It writes standards-compatible SRT sidecars and can optionally burn captions into the video.
 */

import { join, resolve } from "node:path";
import type { CaptionArtifact, CaptionCue, CaptionRenderInput } from "../types/caption.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";

export class CaptionEngine {
  public async render(input: CaptionRenderInput, signal?: AbortSignal): Promise<CaptionArtifact> {
    if (!input.options.enabled || input.cues.length === 0) {
      throw new Error("Caption rendering requires enabled options and at least one cue.");
    }
    await ensureDirectory(input.workDirectory);
    const srtPath = join(input.workDirectory, `${input.projectId}.srt`);
    await writeFileEnsuringDirectory(srtPath, this.toSrt(input.cues));

    if (input.options.burnIn) {
      await runProcess(
        readMediaToolCommand("ffmpeg"),
        [
          "-y",
          "-i",
          input.inputVideoPath,
          "-vf",
          `subtitles=${this.escapeSubtitlePathForFilter(srtPath)}`,
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          input.outputVideoPath
        ],
        signal
      );
    }

    return {
      srtPath,
      cueCount: input.cues.length,
      ...(input.options.language ? { language: input.options.language } : {}),
      burnedIn: input.options.burnIn
    };
  }

  private toSrt(cues: readonly CaptionCue[]): string {
    // ASR/word-timed cues can arrive out of order; SRT timestamps must be monotonic.
    const ordered = [...cues].sort(
      (left, right) => left.startSecond - right.startSecond || left.endSecond - right.endSecond
    );
    return ordered
      .map((cue, index) => {
        this.validateCue(cue);
        const startMs = Math.round(cue.startSecond * 1000);
        // Millisecond rounding can collapse a valid sub-ms cue to zero duration.
        const endMs = Math.max(Math.round(cue.endSecond * 1000), startMs + 1);
        return `${index + 1}\n${this.timestampFromMs(startMs)} --> ${this.timestampFromMs(endMs)}\n${this.escapeText(cue.text)}\n`;
      })
      .join("\n");
  }

  private validateCue(cue: CaptionCue): void {
    if (!Number.isFinite(cue.startSecond) || !Number.isFinite(cue.endSecond) || cue.startSecond < 0 || cue.endSecond <= cue.startSecond) {
      throw new Error("Caption cue timing is invalid.");
    }
    if (!cue.text.trim()) {
      throw new Error("Caption cue text cannot be empty.");
    }
  }

  private timestampFromMs(totalMilliseconds: number): string {
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
    const milliseconds = totalMilliseconds % 1000;
    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(wholeSeconds)},${String(milliseconds).padStart(3, "0")}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, "0");
  }

  private escapeText(text: string): string {
    // Strip libass override braces so burned-in cue text cannot inject styling tags.
    return text.replace(/\r?\n/g, " ").replace(/[{}]/g, "").trim();
  }

  private escapeSubtitlePathForFilter(path: string): string {
    // Absolute path (independent of process.cwd at exec time) with forward slashes, then
    // filtergraph quoting: single quotes protect spaces/commas/semicolons/brackets from
    // graph parsing, the drive colon is escaped for the filter's own option parser, and a
    // literal single quote is escaped by closing and reopening the quoted section.
    const normalized = resolve(path).replace(/\\/g, "/");
    const colonEscaped = normalized.replace(/:/g, "\\:");
    const quoteEscaped = colonEscaped.replace(/'/g, "'\\''");
    return `'${quoteEscaped}'`;
  }
}
