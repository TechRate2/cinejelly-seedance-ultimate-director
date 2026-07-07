/**
 * Deterministic source-video media metrics for remake planning.
 * This extracts bounded technical/edit-rhythm evidence without calling LLMs.
 */

import { createHash } from "node:crypto";
import type { MediaMetadata, MediaStreamInfo } from "../types/media.js";
import type {
  SourceVideoEditRhythmLabel,
  SourceVideoMediaMetrics
} from "../types/source-video.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";
import { MediaInspector } from "./media-inspector.js";

const MAX_SCENE_TIMESTAMPS = 120;
const DEFAULT_SCENE_SAMPLE_WINDOW_SECONDS = 180;

export interface SourceVideoMediaMetricsAnalyzerInput {
  readonly mediaInspector?: Pick<MediaInspector, "probe">;
  readonly sceneSampleWindowSeconds?: number;
}

export class SourceVideoMediaMetricsAnalyzer {
  private readonly mediaInspector: Pick<MediaInspector, "probe">;
  private readonly sceneSampleWindowSeconds: number;

  public constructor(input: SourceVideoMediaMetricsAnalyzerInput = {}) {
    this.mediaInspector = input.mediaInspector ?? new MediaInspector();
    this.sceneSampleWindowSeconds = Math.max(10, input.sceneSampleWindowSeconds ?? DEFAULT_SCENE_SAMPLE_WINDOW_SECONDS);
  }

  public async analyze(sourceUri: string, signal?: AbortSignal): Promise<SourceVideoMediaMetrics> {
    const metadata = await this.mediaInspector.probe(sourceUri, signal);
    const sceneCutTimestampsSeconds = await this.detectSceneCuts(sourceUri, signal);
    return this.toMetrics(sourceUri, metadata, sceneCutTimestampsSeconds, true);
  }

  private async detectSceneCuts(sourceUri: string, signal?: AbortSignal): Promise<readonly number[]> {
    try {
      const result = await runProcess(
        readMediaToolCommand("ffmpeg"),
        [
          "-hide_banner",
          "-nostdin",
          "-i",
          sourceUri,
          "-t",
          String(this.sceneSampleWindowSeconds),
          "-vf",
          "select='gt(scene\\,0.35)',showinfo",
          "-an",
          "-f",
          "null",
          "-"
        ],
        { ...(signal ? { signal } : {}), maxOutputBytes: 1024 * 1024 }
      );
      return this.parseSceneTimestamps(`${result.stdout}\n${result.stderr}`);
    } catch {
      return [];
    }
  }

  private toMetrics(
    sourceUri: string,
    metadata: MediaMetadata,
    sceneCutTimestampsSeconds: readonly number[],
    probeSucceeded: boolean
  ): SourceVideoMediaMetrics {
    const video = metadata.streams.find((stream) => stream.type === "video");
    const audio = metadata.streams.find((stream) => stream.type === "audio");
    const durationSeconds = metadata.durationSeconds ?? video?.durationSeconds ?? audio?.durationSeconds;
    const sampledWindowSeconds = durationSeconds !== undefined
      ? Math.min(durationSeconds, this.sceneSampleWindowSeconds)
      : this.sceneSampleWindowSeconds;
    const sceneCutCount = sceneCutTimestampsSeconds.length;
    const cutDensityPerMinute = sampledWindowSeconds > 0 ? round((sceneCutCount / sampledWindowSeconds) * 60) : undefined;
    const averageShotLengthSeconds = sceneCutCount > 0 && sampledWindowSeconds > 0
      ? round(sampledWindowSeconds / (sceneCutCount + 1))
      : undefined;
    return {
      schemaVersion: "cinejelly.source-video-media-metrics.v1",
      ...(durationSeconds !== undefined ? { durationSeconds: round(durationSeconds) } : {}),
      ...(metadata.bitrate !== undefined ? { bitrate: Math.round(metadata.bitrate) } : {}),
      ...(metadata.formatName ? { formatName: metadata.formatName } : {}),
      ...(video ? { video: this.videoMetrics(video) } : {}),
      audio: {
        hasAudio: Boolean(audio),
        ...(audio?.codecName ? { codecName: audio.codecName } : {}),
        ...(audio?.sampleRate !== undefined ? { sampleRate: audio.sampleRate } : {}),
        ...(audio?.channelCount !== undefined ? { channelCount: audio.channelCount } : {})
      },
      editRhythm: {
        sampledWindowSeconds: round(sampledWindowSeconds),
        sceneCutCount,
        ...(cutDensityPerMinute !== undefined ? { cutDensityPerMinute } : {}),
        ...(averageShotLengthSeconds !== undefined ? { averageShotLengthSeconds } : {}),
        rhythmLabel: this.rhythmLabel(cutDensityPerMinute),
        ...(sceneCutTimestampsSeconds.length > 0 ? { sceneCutTimestampsSeconds: sceneCutTimestampsSeconds.slice(0, MAX_SCENE_TIMESTAMPS) } : {})
      },
      evidence: {
        probeSucceeded,
        sceneDetectionSucceeded: sceneCutCount > 0,
        sourceUriSha256: sha256(sourceUri)
      }
    };
  }

  private videoMetrics(stream: MediaStreamInfo): NonNullable<SourceVideoMediaMetrics["video"]> {
    return {
      ...(stream.codecName ? { codecName: stream.codecName } : {}),
      ...(stream.width !== undefined ? { width: stream.width } : {}),
      ...(stream.height !== undefined ? { height: stream.height } : {}),
      ...(stream.frameRate !== undefined ? { frameRate: round(stream.frameRate) } : {}),
      ...(stream.width && stream.height ? { aspectRatio: aspectRatioLabel(stream.width, stream.height) } : {})
    };
  }

  private parseSceneTimestamps(output: string): readonly number[] {
    const timestamps = new Set<number>();
    const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output)) && timestamps.size < MAX_SCENE_TIMESTAMPS) {
      const parsed = Number.parseFloat(match[1] ?? "");
      if (Number.isFinite(parsed) && parsed >= 0) {
        timestamps.add(round(parsed));
      }
    }
    return [...timestamps].sort((left, right) => left - right);
  }

  private rhythmLabel(cutDensityPerMinute: number | undefined): SourceVideoEditRhythmLabel {
    if (cutDensityPerMinute === undefined) {
      return "unknown";
    }
    if (cutDensityPerMinute >= 28) {
      return "very_fast";
    }
    if (cutDensityPerMinute >= 16) {
      return "fast";
    }
    if (cutDensityPerMinute >= 6) {
      return "balanced";
    }
    return "slow";
  }
}

function aspectRatioLabel(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
