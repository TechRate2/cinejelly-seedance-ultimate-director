/**
 * Caption Engine.
 * It writes standards-compatible SRT sidecars and can optionally burn captions into the video.
 */

import { basename, join, relative } from "node:path";
import type { CaptionArtifact, CaptionCue, CaptionRenderInput } from "../types/caption.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
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
        "ffmpeg",
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
    return cues
      .map((cue, index) => {
        this.validateCue(cue);
        return `${index + 1}\n${this.timestamp(cue.startSecond)} --> ${this.timestamp(cue.endSecond)}\n${this.escapeText(cue.text)}\n`;
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

  private timestamp(seconds: number): string {
    const totalMilliseconds = Math.round(seconds * 1000);
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
    return text.replace(/\r?\n/g, " ").trim();
  }

  private escapeSubtitlePathForFilter(path: string): string {
    const relativePath = relative(process.cwd(), path) || basename(path);
    return relativePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  }
}
