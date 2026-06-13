/**
 * FFmpeg transition engine for smooth clip assembly.
 * It normalizes clip dimensions/timebase, applies xfade between video clips, and uses acrossfade when every clip has audio.
 */

import type { MediaMetadata } from "../types/media.js";
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
    const allHaveAudio = input.settings.preserveAudio && metadata.every((item) => item.streams.some((stream) => stream.type === "audio"));
    const args = this.buildFfmpegArgs(input, metadata, targetHeight, allHaveAudio);
    await runProcess(readMediaToolCommand("ffmpeg"), args, signal);

    return {
      outputPath: input.outputPath,
      transitionCount: input.inputPaths.length - 1,
      usedAudioCrossfade: allHaveAudio,
      settings: {
        ...input.settings,
        targetHeight
      },
      assembledAt: new Date()
    };
  }

  private buildFfmpegArgs(
    input: TransitionAssemblyInput,
    metadata: readonly MediaMetadata[],
    targetHeight: number,
    includeAudio: boolean
  ): readonly string[] {
    const args: string[] = ["-y"];
    for (const path of input.inputPaths) {
      args.push("-i", path);
    }

    const filters: string[] = [];
    for (let index = 0; index < input.inputPaths.length; index += 1) {
      filters.push(
        `[${index}:v]setpts=PTS-STARTPTS,scale=-2:${targetHeight},fps=${input.settings.fps},format=yuv420p[v${index}]`
      );
      if (includeAudio) {
        filters.push(`[${index}:a]asetpts=PTS-STARTPTS,aresample=async=1[a${index}]`);
      }
    }

    let currentVideoLabel = "v0";
    let cumulativeDuration = this.durationFor(metadata[0]);
    for (let index = 1; index < input.inputPaths.length; index += 1) {
      const nextVideoLabel = `vx${index}`;
      const offset = Math.max(0, cumulativeDuration - input.settings.durationSeconds);
      filters.push(
        `[${currentVideoLabel}][v${index}]xfade=transition=${input.settings.kind}:duration=${input.settings.durationSeconds}:offset=${offset.toFixed(3)}[${nextVideoLabel}]`
      );
      cumulativeDuration = cumulativeDuration + this.durationFor(metadata[index]) - input.settings.durationSeconds;
      currentVideoLabel = nextVideoLabel;
    }

    let currentAudioLabel: string | undefined;
    if (includeAudio) {
      currentAudioLabel = "a0";
      for (let index = 1; index < input.inputPaths.length; index += 1) {
        const nextAudioLabel = `ax${index}`;
        filters.push(
          `[${currentAudioLabel}][a${index}]acrossfade=d=${input.settings.durationSeconds}:c1=tri:c2=tri[${nextAudioLabel}]`
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

  private firstVideoHeight(metadata: readonly MediaMetadata[]): 480 | 720 | 1080 | undefined {
    const height = metadata[0]?.streams.find((stream) => stream.type === "video")?.height;
    if (height === 480 || height === 720 || height === 1080) {
      return height;
    }
    return undefined;
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
