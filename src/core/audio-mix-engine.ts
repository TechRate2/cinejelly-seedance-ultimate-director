/**
 * FFmpeg audio mix engine.
 * It mixes original clip audio with narration/music/SFX tracks or replaces original audio when requested.
 */

import { access, copyFile, open, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { AudioMixArtifact, AudioMixInput, AudioMixOptions, AudioMixTrack } from "../types/audio.js";
import { ensureDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";

export const DEFAULT_AUDIO_MIX_OPTIONS: AudioMixOptions = {
  enabled: false,
  mode: "mix",
  originalVolume: 1,
  outputBitrate: "192k"
};

const DEFAULT_MAX_AUDIO_TRACK_BYTES = 256 * 1024 * 1024;
const NON_NEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

export class AudioMixEngine {
  private readonly maxAudioTrackBytes: number;

  public constructor(input: { readonly maxAudioTrackBytes?: number } = {}) {
    this.maxAudioTrackBytes = Math.max(1, input.maxAudioTrackBytes ?? DEFAULT_MAX_AUDIO_TRACK_BYTES);
  }

  public async mix(input: AudioMixInput, signal?: AbortSignal): Promise<AudioMixArtifact> {
    if (!input.options.enabled || input.tracks.length === 0) {
      throw new Error("Audio mix requires enabled options and at least one audio track.");
    }
    await ensureDirectory(input.workDirectory);
    const localTracks = await Promise.all(
      input.tracks.map((track, index) => this.materializeTrack(input.projectId, input.workDirectory, track, index, signal))
    );
    const args = this.buildFfmpegArgs(input, localTracks);
    await runProcess(readMediaToolCommand("ffmpeg"), args, signal);

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
    const remoteUrl = this.isRemoteUrl(track.sourceUrlOrPath)
      ? this.validateRemoteMediaUrl(track.sourceUrlOrPath, `Audio track ${track.trackId}`)
      : undefined;
    const extension = this.safeExtension(remoteUrl ?? track.sourceUrlOrPath);
    const targetPath = join(workDirectory, `${projectId}_audio_${index}_${createStableId("track", track.trackId)}${extension}`);

    if (remoteUrl) {
      await this.downloadRemoteTrack(track, remoteUrl, targetPath, signal);
      return targetPath;
    }

    const sourcePath = isAbsolute(track.sourceUrlOrPath) ? track.sourceUrlOrPath : resolve(track.sourceUrlOrPath);
    await access(sourcePath);
    await copyFile(sourcePath, targetPath);
    return targetPath;
  }

  private async downloadRemoteTrack(
    track: AudioMixTrack,
    sourceUrl: URL,
    targetPath: string,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(sourceUrl, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error(`Failed to download audio track ${track.trackId}: HTTP ${response.status}`);
    }
    const contentLength = this.parseContentLength(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > this.maxAudioTrackBytes) {
      throw new Error(
        `Audio track ${track.trackId} is ${this.formatBytes(contentLength)}, above the configured ${this.formatBytes(this.maxAudioTrackBytes)} limit.`
      );
    }
    if (!response.body) {
      throw new Error(`Audio track ${track.trackId} did not include a readable response body.`);
    }

    await ensureDirectory(dirname(targetPath));
    const tempPath = `${targetPath}.${createStableId("download", `${track.trackId}:${Date.now()}`)}.tmp`;
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
          if (writtenBytes > this.maxAudioTrackBytes) {
            throw new Error(
              `Audio track ${track.trackId} exceeded the configured ${this.formatBytes(this.maxAudioTrackBytes)} download limit.`
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

  private validateRemoteMediaUrl(value: string, label: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${label} URL must be a valid HTTPS URL.`);
    }
    if (parsed.protocol !== "https:") {
      throw new Error(`${label} URL must use https.`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`${label} URL must not include embedded credentials.`);
    }
    return parsed;
  }

  private safeExtension(source: string | URL): string {
    const sourcePath = source instanceof URL ? source.pathname : basename(source);
    const parsedExtension = extname(sourcePath).toLowerCase();
    return parsedExtension || ".mp3";
  }

  private parseContentLength(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(trimmed)) {
      throw new Error("Audio track response has an invalid content-length header.");
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("Audio track response has an invalid content-length header.");
    }
    return parsed;
  }

  private formatBytes(value: number): string {
    return `${value} bytes`;
  }
}
