/**
 * FFprobe-based media inspector for delivery QC.
 * It verifies output structure without claiming semantic visual quality.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AudioInspectionReport,
  DeliveryInspectionReport,
  FrameSample,
  FrameSamplingOptions,
  MediaMetadata,
  MediaStreamInfo
} from "../types/media.js";
import { ensureDirectory } from "../utils/files.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";

type JsonObject = Record<string, unknown>;

export class MediaInspector {
  public async probe(path: string, signal?: AbortSignal): Promise<MediaMetadata> {
    const result = await runProcess(
      readMediaToolCommand("ffprobe"),
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
      signal
    );
    const payload = JSON.parse(result.stdout) as JsonObject;
    const format = this.object(payload.format);
    const streams = Array.isArray(payload.streams) ? payload.streams.map((stream, index) => this.mapStream(stream, index)) : [];
    const durationSeconds = this.readNumber(format.duration);
    const bitrate = this.readNumber(format.bit_rate);

    return {
      path,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(bitrate !== undefined ? { bitrate } : {}),
      ...(typeof format.format_name === "string" ? { formatName: format.format_name } : {}),
      streams
    };
  }

  public inspectAudio(metadata: MediaMetadata): AudioInspectionReport {
    const audioStream = metadata.streams.find((stream) => stream.type === "audio");
    const findings: string[] = [];
    if (!audioStream) {
      findings.push("No audio stream detected.");
      return {
        hasAudio: false,
        findings
      };
    }
    if (metadata.durationSeconds && audioStream.durationSeconds && Math.abs(metadata.durationSeconds - audioStream.durationSeconds) > 1.5) {
      findings.push("Audio duration differs from container duration by more than 1.5 seconds.");
    }
    return {
      hasAudio: true,
      ...(audioStream.durationSeconds !== undefined ? { durationSeconds: audioStream.durationSeconds } : {}),
      ...(audioStream.codecName ? { codecName: audioStream.codecName } : {}),
      findings
    };
  }

  public inspectDelivery(metadata: MediaMetadata): DeliveryInspectionReport {
    const findings: string[] = [];
    const videoStream = metadata.streams.find((stream) => stream.type === "video");
    const audio = this.inspectAudio(metadata);

    if (!videoStream) {
      findings.push("No video stream detected.");
    }
    if (!metadata.durationSeconds || metadata.durationSeconds <= 0) {
      findings.push("Media duration is missing or zero.");
    }
    if (videoStream && (!videoStream.width || !videoStream.height)) {
      findings.push("Video stream is missing width or height.");
    }
    if (audio.findings.length > 0) {
      findings.push(...audio.findings);
    }

    return {
      metadata,
      audio,
      status: findings.some((finding) => finding.startsWith("No video") || finding.includes("zero")) ? "fail" : findings.length > 0 ? "warn" : "pass",
      findings
    };
  }

  public async sampleFrames(path: string, options: FrameSamplingOptions, signal?: AbortSignal): Promise<readonly FrameSample[]> {
    if (!options.enabled) {
      return [];
    }
    if (options.intervalSeconds <= 0 || options.maxFrames <= 0) {
      throw new Error("Frame sampling intervalSeconds and maxFrames must be positive.");
    }
    await ensureDirectory(options.outputDirectory);
    const prefix = `frame_${Date.now()}`;
    const pattern = join(options.outputDirectory, `${prefix}_%03d.jpg`);
    await runProcess(
      readMediaToolCommand("ffmpeg"),
      [
        "-y",
        "-i",
        path,
        "-vf",
        `fps=1/${options.intervalSeconds}`,
        "-frames:v",
        String(options.maxFrames),
        pattern
      ],
      signal
    );

    const files = await readdir(options.outputDirectory);
    return files
      .filter((file) => file.startsWith(prefix) && file.endsWith(".jpg"))
      .sort()
      .map((file, index) => ({
        path: join(options.outputDirectory, file),
        index
      }));
  }

  private mapStream(stream: unknown, fallbackIndex: number): MediaStreamInfo {
    const payload = this.object(stream);
    const frameRate = this.parseFrameRate(typeof payload.avg_frame_rate === "string" ? payload.avg_frame_rate : undefined);
    const durationSeconds = this.readNumber(payload.duration);

    return {
      index: typeof payload.index === "number" ? payload.index : fallbackIndex,
      type: this.mapStreamType(payload.codec_type),
      ...(typeof payload.codec_name === "string" ? { codecName: payload.codec_name } : {}),
      ...(typeof payload.width === "number" ? { width: payload.width } : {}),
      ...(typeof payload.height === "number" ? { height: payload.height } : {}),
      ...(frameRate !== undefined ? { frameRate } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {})
    };
  }

  private object(value: unknown): JsonObject {
    return value && typeof value === "object" ? (value as JsonObject) : {};
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private parseFrameRate(value: string | undefined): number | undefined {
    if (!value || value === "0/0") {
      return undefined;
    }
    const [rawNumerator, rawDenominator] = value.split("/");
    const numerator = Number.parseFloat(rawNumerator ?? "");
    const denominator = Number.parseFloat(rawDenominator ?? "1");
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return undefined;
    }
    return numerator / denominator;
  }

  private mapStreamType(value: unknown): MediaStreamInfo["type"] {
    if (value === "video" || value === "audio" || value === "subtitle" || value === "data") {
      return value;
    }
    return "unknown";
  }
}
