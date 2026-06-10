/**
 * FFmpeg Assembly Engine.
 * It materializes provider clip outputs and concatenates them into a final video deliverable.
 */

import { access, copyFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { AssembledDeliverable, AssemblyClip, AssemblyInput } from "../types/assembly.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";

export class AssemblyEngine {
  public async assemble(input: AssemblyInput, signal?: AbortSignal): Promise<AssembledDeliverable> {
    if (input.clips.length === 0) {
      throw new Error("Assembly requires at least one rendered clip.");
    }

    await this.assertFfmpegAvailable(signal);
    await ensureDirectory(input.workDirectory);
    await ensureDirectory(dirname(resolve(input.outputPath)));

    const orderedClips = [...input.clips].sort((left, right) => left.order - right.order);
    const localClipPaths = await Promise.all(
      orderedClips.map((clip) => this.materializeClip(input.projectId, input.workDirectory, clip, signal))
    );
    const concatListPath = join(input.workDirectory, `${input.projectId}_concat.txt`);
    await writeFileEnsuringDirectory(concatListPath, this.toConcatList(localClipPaths));

    await this.runFfmpeg(
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
        input.outputPath
      ],
      signal
    );

    return {
      projectId: input.projectId,
      outputPath: input.outputPath,
      clipCount: orderedClips.length,
      assembledAt: new Date()
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
    await this.runFfmpeg(["-version"], signal);
  }

  private runFfmpeg(args: readonly string[], signal?: AbortSignal): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn("ffmpeg", [...args], {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
        signal
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 2000)}`));
      });
    });
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private safeExtension(source: string): string {
    const parsedExtension = extname(this.isRemoteUrl(source) ? new URL(source).pathname : basename(source)).toLowerCase();
    return parsedExtension || ".mp4";
  }
}
