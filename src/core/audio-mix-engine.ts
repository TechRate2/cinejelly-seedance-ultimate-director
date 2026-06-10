/**
 * FFmpeg audio mix engine.
 * It mixes original clip audio with narration/music/SFX tracks or replaces original audio when requested.
 */

import { access, copyFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { AudioMixArtifact, AudioMixInput, AudioMixOptions, AudioMixTrack } from "../types/audio.js";
import { ensureDirectory, writeFileEnsuringDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";
import { runProcess } from "../utils/process.js";

export const DEFAULT_AUDIO_MIX_OPTIONS: AudioMixOptions = {
  enabled: false,
  mode: "mix",
  originalVolume: 1,
  outputBitrate: "192k"
};

export class AudioMixEngine {
  public async mix(input: AudioMixInput, signal?: AbortSignal): Promise<AudioMixArtifact> {
    if (!input.options.enabled || input.tracks.length === 0) {
      throw new Error("Audio mix requires enabled options and at least one audio track.");
    }
    await ensureDirectory(input.workDirectory);
    const localTracks = await Promise.all(
      input.tracks.map((track, index) => this.materializeTrack(input.projectId, input.workDirectory, track, index, signal))
    );
    const args = this.buildFfmpegArgs(input, localTracks);
    await runProcess("ffmpeg", args, signal);

    return {
      outputPath: input.outputVideoPath,
      trackCount: input.tracks.length,
      mixedAt: new Date(),
      mode: input.options.mode
    };
  }

  private async materializeTrack(
    projectId: string,
    workDirectory: string,
    track: AudioMixTrack,
    index: number,
    signal?: AbortSignal
  ): Promise<string> {
    const extension = this.safeExtension(track.sourceUrlOrPath);
    const targetPath = join(workDirectory, `${projectId}_audio_${index}_${createStableId("track", track.trackId)}${extension}`);

    if (this.isRemoteUrl(track.sourceUrlOrPath)) {
      const response = await fetch(track.sourceUrlOrPath, signal ? { signal } : undefined);
      if (!response.ok) {
        throw new Error(`Failed to download audio track ${track.trackId}: HTTP ${response.status}`);
      }
      await writeFileEnsuringDirectory(targetPath, new Uint8Array(await response.arrayBuffer()));
      return targetPath;
    }

    const sourcePath = isAbsolute(track.sourceUrlOrPath) ? track.sourceUrlOrPath : resolve(track.sourceUrlOrPath);
    await access(sourcePath);
    await copyFile(sourcePath, targetPath);
    return targetPath;
  }

  private buildFfmpegArgs(input: AudioMixInput, localTracks: readonly string[]): readonly string[] {
    const args = ["-y", "-i", input.inputVideoPath];
    for (const trackPath of localTracks) {
      args.push("-i", trackPath);
    }

    const includeOriginal = input.options.mode === "mix" && input.includeOriginalAudio;
    const filterParts: string[] = [];
    const audioLabels: string[] = [];

    if (includeOriginal) {
      filterParts.push(`[0:a]volume=${this.safeVolume(input.options.originalVolume)}[a0]`);
      audioLabels.push("[a0]");
    }
    input.tracks.forEach((track, index) => {
      const inputIndex = index + 1;
      const label = `[a${inputIndex}]`;
      filterParts.push(`[${inputIndex}:a]volume=${this.safeVolume(track.volume)}${label}`);
      audioLabels.push(label);
    });

    const outputLabel = "[aout]";
    if (audioLabels.length === 1) {
      filterParts.push(`${audioLabels[0]}anull${outputLabel}`);
    } else {
      filterParts.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=2${outputLabel}`);
    }

    args.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      outputLabel,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      input.options.outputBitrate,
      "-shortest",
      input.outputVideoPath
    );
    return args;
  }

  private safeVolume(volume: number): number {
    if (!Number.isFinite(volume) || volume < 0) {
      throw new Error("Audio track volume must be a non-negative number.");
    }
    return Math.min(volume, 4);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private safeExtension(source: string): string {
    const parsedExtension = extname(this.isRemoteUrl(source) ? new URL(source).pathname : basename(source)).toLowerCase();
    return parsedExtension || ".mp3";
  }
}
