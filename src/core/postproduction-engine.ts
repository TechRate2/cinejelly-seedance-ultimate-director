/**
 * FFmpeg postproduction polish.
 * It transcodes assembled clips into delivery-friendly H.264/AAC MP4 with faststart metadata.
 */

import type { PostproductionInput, PostproductionResult, PostproductionSettings } from "../types/media.js";
import type { AspectRatio } from "../types/settings.js";
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
    const videoFilter = this.videoFilter(input.settings);
    if (videoFilter) {
      args.push("-vf", videoFilter);
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

  private videoFilter(settings: PostproductionSettings): string | undefined {
    if (!settings.targetHeight) {
      return undefined;
    }
    if (!settings.targetRatio || settings.targetRatio === "adaptive") {
      return `scale=-2:${settings.targetHeight}`;
    }
    const targetWidth = this.evenWidthForRatio(settings.targetHeight, settings.targetRatio);
    return [
      `scale=${targetWidth}:${settings.targetHeight}:force_original_aspect_ratio=decrease`,
      `pad=${targetWidth}:${settings.targetHeight}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1"
    ].join(",");
  }

  private evenWidthForRatio(targetHeight: 480 | 720 | 1080, ratio: AspectRatio): number {
    const width = Math.round(targetHeight * this.ratioValue(ratio));
    return width % 2 === 0 ? width : width + 1;
  }

  private ratioValue(ratio: AspectRatio): number {
    switch (ratio) {
      case "adaptive":
        throw new Error("Adaptive aspect ratio does not have a fixed postproduction canvas.");
      case "21:9":
        return 21 / 9;
      case "16:9":
        return 16 / 9;
      case "4:3":
        return 4 / 3;
      case "1:1":
        return 1;
      case "3:4":
        return 3 / 4;
      case "9:16":
        return 9 / 16;
    }
  }
}
