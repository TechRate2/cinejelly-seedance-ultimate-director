/**
 * FFmpeg Assembly Engine.
 * It materializes provider clip outputs and concatenates them into a final video deliverable.
 */

import { access, copyFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AssembledDeliverable, AssemblyClip, AssemblyInput } from "../types/assembly.js";
import { DEFAULT_POSTPRODUCTION_SETTINGS, PostproductionEngine } from "./postproduction-engine.js";
import { MediaInspector } from "./media-inspector.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";
import { runProcess } from "../utils/process.js";

export class AssemblyEngine {
  private readonly postproductionEngine: PostproductionEngine;
  private readonly mediaInspector: MediaInspector;

  public constructor(input: { readonly postproductionEngine?: PostproductionEngine; readonly mediaInspector?: MediaInspector } = {}) {
    this.postproductionEngine = input.postproductionEngine ?? new PostproductionEngine();
    this.mediaInspector = input.mediaInspector ?? new MediaInspector();
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
    const concatOutputPath = postproductionSettings.enabled
      ? join(input.workDirectory, `${input.projectId}_assembled_raw.mp4`)
      : input.outputPath;
    await writeFileEnsuringDirectory(concatListPath, this.toConcatList(localClipPaths));

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

    const postproduction = postproductionSettings.enabled
      ? await this.postproductionEngine.polish(
          {
            inputPath: concatOutputPath,
            outputPath: input.outputPath,
            settings: postproductionSettings
          },
          signal
        )
      : undefined;
    const outputPath = postproduction?.outputPath ?? concatOutputPath;
    const inspection = this.mediaInspector.inspectDelivery(await this.mediaInspector.probe(outputPath, signal));

    return {
      projectId: input.projectId,
      outputPath,
      clipCount: orderedClips.length,
      assembledAt: new Date(),
      ...(postproduction ? { postproduction } : {}),
      inspection
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
      const response = await fetch(clip.sourceUrlOrPath, signal ? { signal } : undefined);
      if (!response.ok) {
        throw new Error(`Failed to download rendered clip ${clip.clipId}: HTTP ${response.status}`);
      }
      const data = new Uint8Array(await response.arrayBuffer());
      await writeFileEnsuringDirectory(targetPath, data);
      return targetPath;
    }

    const sourcePath = isAbsolute(clip.sourceUrlOrPath) ? clip.sourceUrlOrPath : resolve(clip.sourceUrlOrPath);
    await access(sourcePath);
    await copyFile(sourcePath, targetPath);
    return targetPath;
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
}
