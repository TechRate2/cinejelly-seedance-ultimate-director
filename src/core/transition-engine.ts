/**
 * FFmpeg transition engine for smooth clip assembly.
 * It normalizes clip dimensions/timebase, applies xfade between video clips, and uses acrossfade when every clip has audio.
 */

import type { MediaMetadata } from "../types/media.js";
import type { AspectRatio } from "../types/settings.js";
import type { TransitionArtifact, TransitionAssemblyInput, TransitionSettings } from "../types/transition.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";
import { MediaInspector } from "./media-inspector.js";

export const DEFAULT_TRANSITION_SETTINGS: TransitionSettings = {
  enabled: true,
  kind: "fade",
  durationSeconds: 0.35,
  fps: 30,
  preserveAudio: true
};

export class TransitionEngine {
  private readonly mediaInspector: MediaInspector;

  public constructor(mediaInspector = new MediaInspector()) {
    this.mediaInspector = mediaInspector;
  }

  public async assemble(input: TransitionAssemblyInput, signal?: AbortSignal): Promise<TransitionArtifact> {
    if (input.inputPaths.length < 2) {
      throw new Error("Transition assembly requires at least two clips.");
    }
    this.validateSettings(input.settings);

    const metadata = await Promise.all(input.inputPaths.map((path) => this.mediaInspector.probe(path, signal)));
    const targetHeight = input.settings.targetHeight ?? this.firstVideoHeight(metadata) ?? 720;
    const targetWidth = this.targetWidth(targetHeight, input.settings.targetRatio, metadata);
    const transitionDurationSeconds = this.effectiveTransitionDurationSeconds(input.settings.durationSeconds, metadata);
    const usesFixedCanvas = Boolean(input.settings.targetRatio && input.settings.targetRatio !== "adaptive");
    const allHaveAudio = input.settings.preserveAudio && metadata.every((item) => item.streams.some((stream) => stream.type === "audio"));
    const args = this.buildFfmpegArgs(input, metadata, targetHeight, targetWidth, transitionDurationSeconds, usesFixedCanvas, allHaveAudio);
    await runProcess(readMediaToolCommand("ffmpeg"), args, signal);

    return {
      outputPath: input.outputPath,
      transitionCount: input.inputPaths.length - 1,
      usedAudioCrossfade: allHaveAudio,
      settings: {
        ...input.settings,
        durationSeconds: transitionDurationSeconds,
        targetHeight,
        ...(input.settings.targetRatio ? { targetRatio: input.settings.targetRatio } : {})
      },
      assembledAt: new Date()
    };
  }

  private buildFfmpegArgs(
    input: TransitionAssemblyInput,
    metadata: readonly MediaMetadata[],
    targetHeight: number,
    targetWidth: number,
    transitionDurationSeconds: number,
    usesFixedCanvas: boolean,
    includeAudio: boolean
  ): readonly string[] {
    const args: string[] = ["-y"];
    for (const path of input.inputPaths) {
      args.push("-i", path);
    }

    const filters: string[] = [];
    for (let index = 0; index < input.inputPaths.length; index += 1) {
      filters.push(
        `[${index}:v]setpts=PTS-STARTPTS,${this.canvasFilter(targetWidth, targetHeight, usesFixedCanvas)},setsar=1,fps=${input.settings.fps},format=yuv420p[v${index}]`
      );
      if (includeAudio) {
        filters.push(`[${index}:a]asetpts=PTS-STARTPTS,aresample=async=1[a${index}]`);
      }
    }

    let currentVideoLabel = "v0";
    let cumulativeDuration = this.durationFor(metadata[0]);
    for (let index = 1; index < input.inputPaths.length; index += 1) {
      const nextVideoLabel = `vx${index}`;
      const offset = Math.max(0, cumulativeDuration - transitionDurationSeconds);
      filters.push(
        `[${currentVideoLabel}][v${index}]xfade=transition=${input.settings.kind}:duration=${transitionDurationSeconds}:offset=${offset.toFixed(3)}[${nextVideoLabel}]`
      );
      cumulativeDuration = cumulativeDuration + this.durationFor(metadata[index]) - transitionDurationSeconds;
      currentVideoLabel = nextVideoLabel;
    }

    let currentAudioLabel: string | undefined;
    if (includeAudio) {
      currentAudioLabel = "a0";
      for (let index = 1; index < input.inputPaths.length; index += 1) {
        const nextAudioLabel = `ax${index}`;
        filters.push(
          `[${currentAudioLabel}][a${index}]acrossfade=d=${transitionDurationSeconds}:c1=tri:c2=tri[${nextAudioLabel}]`
        );
        currentAudioLabel = nextAudioLabel;
      }
    }

    args.push("-filter_complex", filters.join(";"), "-map", `[${currentVideoLabel}]`);
    if (currentAudioLabel) {
      args.push("-map", `[${currentAudioLabel}]`);
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      ...(currentAudioLabel ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-movflags",
      "+faststart",
      input.outputPath
    );
    return args;
  }

  private durationFor(metadata: MediaMetadata | undefined): number {
    if (!metadata?.durationSeconds || metadata.durationSeconds <= 0) {
      throw new Error("Transition assembly requires valid clip durations from ffprobe.");
    }
    return metadata.durationSeconds;
  }

  private effectiveTransitionDurationSeconds(requestedDurationSeconds: number, metadata: readonly MediaMetadata[]): number {
    const shortestClipDuration = Math.min(...metadata.map((item) => this.durationFor(item)));
    const safeMaximum = Math.max(0.08, shortestClipDuration / 3);
    return Number(Math.min(requestedDurationSeconds, safeMaximum).toFixed(3));
  }

  private firstVideoHeight(metadata: readonly MediaMetadata[]): 480 | 720 | 1080 | 1440 | undefined {
    const height = metadata[0]?.streams.find((stream) => stream.type === "video")?.height;
    if (height === 480 || height === 720 || height === 1080 || height === 1440) {
      return height;
    }
    return undefined;
  }

  private targetWidth(
    targetHeight: 480 | 720 | 1080 | 1440,
    targetRatio: AspectRatio | undefined,
    metadata: readonly MediaMetadata[]
  ): number {
    if (targetRatio && targetRatio !== "adaptive") {
      return this.evenWidthForRatio(targetHeight, targetRatio);
    }
    const firstVideo = metadata[0]?.streams.find((stream) => stream.type === "video");
    if (firstVideo?.width && firstVideo.height && firstVideo.width > 0 && firstVideo.height > 0) {
      return this.nearestEven((targetHeight * firstVideo.width) / firstVideo.height);
    }
    return this.evenWidthForRatio(targetHeight, "16:9");
  }

  private evenWidthForRatio(targetHeight: 480 | 720 | 1080 | 1440, ratio: Exclude<AspectRatio, "adaptive">): number {
    return this.nearestEven(targetHeight * this.ratioValue(ratio));
  }

  private nearestEven(value: number): number {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  }

  private ratioValue(ratio: Exclude<AspectRatio, "adaptive">): number {
    switch (ratio) {
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

  private canvasFilter(targetWidth: number, targetHeight: number, usesFixedCanvas: boolean): string {
    return usesFixedCanvas
      ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`
      : `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;
  }

  private validateSettings(settings: TransitionSettings): void {
    if (!settings.enabled) {
      throw new Error("Transition settings must be enabled before transition assembly.");
    }
    if (!Number.isFinite(settings.durationSeconds) || settings.durationSeconds <= 0 || settings.durationSeconds > 3) {
      throw new Error("Transition duration must be between 0 and 3 seconds.");
    }
    if (!Number.isFinite(settings.fps) || settings.fps < 12 || settings.fps > 60) {
      throw new Error("Transition FPS must be between 12 and 60.");
    }
  }
}
