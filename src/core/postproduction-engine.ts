/**
 * FFmpeg postproduction polish.
 * It transcodes assembled clips into delivery-friendly H.264/AAC MP4 with faststart metadata.
 */

import type { PostproductionInput, PostproductionResult, PostproductionSettings } from "../types/media.js";
import { ensureDirectory } from "../utils/files.js";
import { runProcess } from "../utils/process.js";
import { dirname, resolve } from "node:path";

export const DEFAULT_POSTPRODUCTION_SETTINGS: PostproductionSettings = {
  enabled: true,
  videoCodec: "libx264",
  preset: "medium",
  crf: 18,
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  audioBitrate: "192k",
  fastStart: true
};

export class PostproductionEngine {
  public async polish(input: PostproductionInput, signal?: AbortSignal): Promise<PostproductionResult> {
    await ensureDirectory(dirname(resolve(input.outputPath)));
    if (!input.settings.enabled) {
      return {
        inputPath: input.inputPath,
        outputPath: input.inputPath,
        polishedAt: new Date(),
        settings: input.settings
      };
    }

    const args = this.buildFfmpegArgs(input);
    await runProcess("ffmpeg", args, signal);

    return {
      inputPath: input.inputPath,
      outputPath: input.outputPath,
      polishedAt: new Date(),
      settings: input.settings
    };
  }

  private buildFfmpegArgs(input: PostproductionInput): readonly string[] {
    const args: string[] = ["-y", "-i", input.inputPath, "-map", "0:v:0", "-map", "0:a?"];
    if (input.settings.targetHeight) {
      args.push("-vf", `scale=-2:${input.settings.targetHeight}`);
    }
    args.push(
      "-c:v",
      input.settings.videoCodec,
      "-preset",
      input.settings.preset,
      "-crf",
      String(input.settings.crf),
      "-pix_fmt",
      input.settings.pixelFormat,
      "-c:a",
      input.settings.audioCodec,
      "-b:a",
      input.settings.audioBitrate
    );
    if (input.settings.fastStart) {
      args.push("-movflags", "+faststart");
    }
    args.push(input.outputPath);
    return args;
  }
}
