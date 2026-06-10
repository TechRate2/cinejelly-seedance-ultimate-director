/**
 * FFmpeg Assembly Engine.
 * It materializes provider clip outputs and concatenates them into a final video deliverable.
 */

import { access, copyFile, open, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AssembledDeliverable, AssemblyClip, AssemblyInput } from "../types/assembly.js";
import { DEFAULT_POSTPRODUCTION_SETTINGS, PostproductionEngine } from "./postproduction-engine.js";
import { MediaInspector } from "./media-inspector.js";
import { CaptionEngine } from "./caption-engine.js";
import { AudioMixEngine, DEFAULT_AUDIO_MIX_OPTIONS } from "./audio-mix-engine.js";
import { DEFAULT_TRANSITION_SETTINGS, TransitionEngine } from "./transition-engine.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";
import { runProcess } from "../utils/process.js";

const DEFAULT_MAX_RENDERED_CLIP_BYTES = 2 * 1024 * 1024 * 1024;

export class AssemblyEngine {
  private readonly postproductionEngine: PostproductionEngine;
  private readonly mediaInspector: MediaInspector;
  private readonly captionEngine: CaptionEngine;
  private readonly audioMixEngine: AudioMixEngine;
  private readonly transitionEngine: TransitionEngine;
  private readonly maxRenderedClipBytes: number;

  public constructor(
    input: {
      readonly postproductionEngine?: PostproductionEngine;
      readonly mediaInspector?: MediaInspector;
      readonly captionEngine?: CaptionEngine;
      readonly audioMixEngine?: AudioMixEngine;
      readonly transitionEngine?: TransitionEngine;
      readonly maxRenderedClipBytes?: number;
    } = {}
  ) {
    this.postproductionEngine = input.postproductionEngine ?? new PostproductionEngine();
    this.mediaInspector = input.mediaInspector ?? new MediaInspector();
    this.captionEngine = input.captionEngine ?? new CaptionEngine();
    this.audioMixEngine = input.audioMixEngine ?? new AudioMixEngine();
    this.transitionEngine = input.transitionEngine ?? new TransitionEngine(this.mediaInspector);
    this.maxRenderedClipBytes = Math.max(1, input.maxRenderedClipBytes ?? DEFAULT_MAX_RENDERED_CLIP_BYTES);
  }

  public async assemble(input: AssemblyInput, signal?: AbortSignal): Promise<AssembledDeliverable> {
    if (input.clips.length === 0) {
      throw new Error("Assembly requires at least one rendered clip.");
    }

    await this.assertFfmpegAvailable(signal);
    await this.assertFfprobeAvailable(signal);
    await ensureDirectory(input.workDirectory);
    await ensureDirectory(dirname(resolve(input.outputPath)));

    const orderedClips = [...input.clips].sort((left, right) => left.order - right.order);
    const localClipPaths = await Promise.all(
      orderedClips.map((clip) => this.materializeClip(input.projectId, input.workDirectory, clip, signal))
    );
    const concatListPath = join(input.workDirectory, `${input.projectId}_concat.txt`);
    const postproductionSettings = input.postproductionSettings ?? DEFAULT_POSTPRODUCTION_SETTINGS;
    const audioMixOptions = input.audioMixOptions ?? {
      ...DEFAULT_AUDIO_MIX_OPTIONS,
      enabled: Boolean(input.audioTracks && input.audioTracks.length > 0)
    };
    const transitionSettings = input.transitionSettings ?? {
      ...DEFAULT_TRANSITION_SETTINGS,
      enabled: localClipPaths.length > 1
    };
    const captionOptions = input.captionOptions ?? { enabled: false, burnIn: false };
    const needsTransitions = localClipPaths.length > 1 && transitionSettings.enabled;
    const needsCaptionBurn = Boolean(input.captionCues && captionOptions.enabled && captionOptions.burnIn);
    const needsAudioMix = Boolean(input.audioTracks && input.audioTracks.length > 0 && audioMixOptions.enabled);
    const concatOutputPath = postproductionSettings.enabled || needsCaptionBurn || needsAudioMix || needsTransitions
      ? join(input.workDirectory, `${input.projectId}_assembled_raw.mp4`)
      : input.outputPath;
    await writeFileEnsuringDirectory(concatListPath, this.toConcatList(localClipPaths));

    const transition = needsTransitions
      ? await this.transitionEngine.assemble(
          {
            inputPaths: localClipPaths,
            outputPath: concatOutputPath,
            settings: transitionSettings
          },
          signal
        )
      : undefined;
    if (!transition) {
      await runProcess(
        "ffmpeg",
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concatListPath,
          "-c",
          "copy",
          concatOutputPath
        ],
        signal
      );
    }

    const postproductionOutputPath = postproductionSettings.enabled
      ? needsCaptionBurn || needsAudioMix
        ? join(input.workDirectory, `${input.projectId}_polished.mp4`)
        : input.outputPath
      : concatOutputPath;
    const postproduction = postproductionSettings.enabled
      ? await this.postproductionEngine.polish(
          {
            inputPath: concatOutputPath,
            outputPath: postproductionOutputPath,
            settings: postproductionSettings
          },
          signal
        )
      : undefined;
    const videoAfterPostproduction = postproduction?.outputPath ?? concatOutputPath;
    const captionedOutputPath = needsCaptionBurn
      ? needsAudioMix
        ? join(input.workDirectory, `${input.projectId}_captioned.mp4`)
        : input.outputPath
      : videoAfterPostproduction;
    const captions = input.captionCues && captionOptions.enabled
      ? await this.captionEngine.render(
          {
            projectId: input.projectId,
            inputVideoPath: videoAfterPostproduction,
            outputVideoPath: captionedOutputPath,
            workDirectory: input.workDirectory,
            cues: input.captionCues,
            options: captionOptions
          },
          signal
        )
      : undefined;
    const videoAfterCaptions = captions?.burnedIn ? captionedOutputPath : videoAfterPostproduction;
    const mediaBeforeAudio = await this.mediaInspector.probe(videoAfterCaptions, signal);
    const audioReportBeforeMix = this.mediaInspector.inspectAudio(mediaBeforeAudio);
    const audioMix = input.audioTracks && needsAudioMix
      ? await this.audioMixEngine.mix(
          {
            projectId: input.projectId,
            inputVideoPath: videoAfterCaptions,
            outputVideoPath: input.outputPath,
            workDirectory: input.workDirectory,
            tracks: input.audioTracks,
            options: audioMixOptions,
            includeOriginalAudio: audioReportBeforeMix.hasAudio
          },
          signal
        )
      : undefined;
    const outputPath = audioMix?.outputPath ?? videoAfterCaptions;
    const inspection = this.mediaInspector.inspectDelivery(await this.mediaInspector.probe(outputPath, signal));
    const frameSamples = input.frameSamplingOptions
      ? await this.mediaInspector.sampleFrames(outputPath, input.frameSamplingOptions, signal)
      : undefined;

    return {
      projectId: input.projectId,
      outputPath,
      clipCount: orderedClips.length,
      assembledAt: new Date(),
      ...(postproduction ? { postproduction } : {}),
      ...(captions ? { captions } : {}),
      ...(audioMix ? { audioMix } : {}),
      ...(transition ? { transition } : {}),
      inspection,
      ...(frameSamples && frameSamples.length > 0 ? { frameSamples } : {})
    };
  }

  private async materializeClip(
    projectId: string,
    workDirectory: string,
    clip: AssemblyClip,
    signal?: AbortSignal
  ): Promise<string> {
    const extension = this.safeExtension(clip.sourceUrlOrPath);
    const targetPath = join(workDirectory, `${projectId}_${clip.order}_${createStableId("clip", clip.clipId)}${extension}`);

    if (this.isRemoteUrl(clip.sourceUrlOrPath)) {
      await this.downloadRemoteClip(clip, targetPath, signal);
      return targetPath;
    }

    const sourcePath = isAbsolute(clip.sourceUrlOrPath) ? clip.sourceUrlOrPath : resolve(clip.sourceUrlOrPath);
    await access(sourcePath);
    await ensureDirectory(dirname(targetPath));
    await copyFile(sourcePath, targetPath);
    return targetPath;
  }

  private async downloadRemoteClip(
    clip: AssemblyClip,
    targetPath: string,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(clip.sourceUrlOrPath, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error(`Failed to download rendered clip ${clip.clipId}: HTTP ${response.status}`);
    }
    const contentLength = this.parseContentLength(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > this.maxRenderedClipBytes) {
      throw new Error(
        `Rendered clip ${clip.clipId} is ${this.formatBytes(contentLength)}, above the configured ${this.formatBytes(this.maxRenderedClipBytes)} limit.`
      );
    }
    if (!response.body) {
      throw new Error(`Rendered clip ${clip.clipId} did not include a readable response body.`);
    }

    await ensureDirectory(dirname(targetPath));
    const tempPath = `${targetPath}.${createStableId("download", `${clip.clipId}:${Date.now()}`)}.tmp`;
    const file = await open(tempPath, "w");
    let closed = false;
    const closeFile = async (): Promise<void> => {
      if (!closed) {
        closed = true;
        await file.close();
      }
    };

    try {
      const reader = response.body.getReader();
      let writtenBytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }
          if (!chunk.value) {
            continue;
          }
          writtenBytes += chunk.value.byteLength;
          if (writtenBytes > this.maxRenderedClipBytes) {
            throw new Error(
              `Rendered clip ${clip.clipId} exceeded the configured ${this.formatBytes(this.maxRenderedClipBytes)} download limit.`
            );
          }
          await file.write(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      await closeFile();
      await rename(tempPath, targetPath);
    } catch (error) {
      await closeFile().catch(() => undefined);
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private toConcatList(paths: readonly string[]): string {
    return paths.map((path) => `file '${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  }

  private async assertFfmpegAvailable(signal?: AbortSignal): Promise<void> {
    await runProcess("ffmpeg", ["-version"], signal);
  }

  private async assertFfprobeAvailable(signal?: AbortSignal): Promise<void> {
    await runProcess("ffprobe", ["-version"], signal);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private safeExtension(source: string): string {
    const parsedExtension = extname(this.isRemoteUrl(source) ? new URL(source).pathname : basename(source)).toLowerCase();
    return parsedExtension || ".mp4";
  }

  private parseContentLength(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== value.trim()) {
      throw new Error("Rendered clip response has an invalid content-length header.");
    }
    return parsed;
  }

  private formatBytes(value: number): string {
    return `${value} bytes`;
  }
}
