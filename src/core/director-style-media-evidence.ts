import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  DirectorStyleBenchmarkMediaEvidence,
  DirectorStyleBenchmarkMediaStreamEvidence,
  DirectorStyleBenchmarkVisualSignals
} from "../types/director-style-benchmark.js";
import type { FrameSample, MediaMetadata } from "../types/media.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";
import { MediaInspector } from "./media-inspector.js";

export interface DirectorStyleMediaEvidenceOptions {
  readonly mediaPath: string;
  readonly mediaPathForReport?: string;
  readonly frameSamplingIntervalSeconds?: number;
  readonly maxFrameSamples?: number;
  readonly signal?: AbortSignal;
}

interface AverageRgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

const DEFAULT_FRAME_INTERVAL_SECONDS = 3;
const DEFAULT_MAX_FRAME_SAMPLES = 8;

export async function collectDirectorStyleMediaEvidence(
  options: DirectorStyleMediaEvidenceOptions
): Promise<DirectorStyleBenchmarkMediaEvidence> {
  const inspector = new MediaInspector();
  const mediaPathForReport = options.mediaPathForReport;
  const common = {
    source: "local_file" as const,
    ...(mediaPathForReport ? { mediaPath: mediaPathForReport } : {}),
    mediaFileName: basename(options.mediaPath)
  };

  let sizeBytes: number | undefined;
  try {
    sizeBytes = (await stat(options.mediaPath)).size;
  } catch (error) {
    return {
      ...common,
      status: "unavailable",
      findings: [`Media file could not be read: ${messageFrom(error)}.`]
    };
  }

  let metadata: MediaMetadata;
  try {
    metadata = await inspector.probe(options.mediaPath, options.signal);
  } catch (error) {
    return {
      ...common,
      status: "unavailable",
      sizeBytes,
      findings: [`FFprobe media probe failed: ${messageFrom(error)}.`]
    };
  }

  const delivery = inspector.inspectDelivery(metadata);
  const videoStream = metadata.streams.find((stream) => stream.type === "video");
  const frameSamplingIntervalSeconds = normalizePositiveInteger(
    options.frameSamplingIntervalSeconds,
    DEFAULT_FRAME_INTERVAL_SECONDS
  );
  const maxFrameSamples = normalizePositiveInteger(options.maxFrameSamples, DEFAULT_MAX_FRAME_SAMPLES);
  const findings = [...delivery.findings];
  const baseEvidence = {
    ...common,
    sizeBytes,
    deliveryStatus: delivery.status,
    ...(metadata.durationSeconds !== undefined ? { durationSeconds: round(metadata.durationSeconds) } : {}),
    ...(metadata.bitrate !== undefined ? { bitrate: Math.round(metadata.bitrate) } : {}),
    ...(videoStream ? { video: mediaStreamEvidence(videoStream) } : {}),
    audio: {
      hasAudio: delivery.audio.hasAudio,
      ...(delivery.audio.codecName ? { codecName: delivery.audio.codecName } : {}),
      ...(delivery.audio.durationSeconds !== undefined ? { durationSeconds: round(delivery.audio.durationSeconds) } : {})
    },
    findings
  } satisfies Omit<DirectorStyleBenchmarkMediaEvidence, "status">;

  if (!videoStream || delivery.status === "fail") {
    return {
      ...baseEvidence,
      status: "probe_only"
    };
  }

  const sampleDirectory = await mkdtemp(join(tmpdir(), "cinejelly-director-benchmark-"));
  try {
    const samples = await inspector.sampleFrames(
      options.mediaPath,
      {
        enabled: true,
        outputDirectory: sampleDirectory,
        intervalSeconds: frameSamplingIntervalSeconds,
        maxFrames: maxFrameSamples
      },
      options.signal
    );
    const visualSignals = await visualSignalsFromSamples(samples, sampleDirectory, options.signal);
    return {
      ...baseEvidence,
      status: visualSignals.sampleCount > 0 ? "frame_sampled" : "probe_only",
      frameSampleCount: samples.length,
      frameSamplingIntervalSeconds,
      sampledFramesRedacted: true,
      visualSignals,
      findings: [...findings, ...visualSignals.findings]
    };
  } catch (error) {
    return {
      ...baseEvidence,
      status: "probe_only",
      frameSamplingIntervalSeconds,
      findings: [...findings, `Frame sampling or signal extraction failed: ${messageFrom(error)}.`]
    };
  } finally {
    await rm(sampleDirectory, { recursive: true, force: true });
  }
}

function mediaStreamEvidence(stream: MediaMetadata["streams"][number]): DirectorStyleBenchmarkMediaStreamEvidence {
  return {
    ...(stream.codecName ? { codecName: stream.codecName } : {}),
    ...(stream.width !== undefined ? { width: stream.width } : {}),
    ...(stream.height !== undefined ? { height: stream.height } : {}),
    ...(stream.frameRate !== undefined ? { frameRate: round(stream.frameRate) } : {}),
    ...(stream.durationSeconds !== undefined ? { durationSeconds: round(stream.durationSeconds) } : {})
  };
}

async function visualSignalsFromSamples(
  samples: readonly FrameSample[],
  workDirectory: string,
  signal?: AbortSignal
): Promise<DirectorStyleBenchmarkVisualSignals> {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      findings: ["No sampled frames were produced by FFmpeg."]
    };
  }

  const colors: AverageRgb[] = [];
  const findings: string[] = [];
  for (const sample of samples) {
    try {
      colors.push(await averageRgbFromFrame(sample, workDirectory, signal));
    } catch (error) {
      findings.push(`Sample ${sample.index} could not be reduced to an RGB signal: ${messageFrom(error)}.`);
    }
  }

  if (colors.length === 0) {
    return {
      sampleCount: 0,
      findings: findings.length > 0 ? findings : ["No sampled frames could be reduced to RGB signals."]
    };
  }

  const brightness = colors.map((color) => (color.red + color.green + color.blue) / (3 * 255));
  const colorDeltas = pairwise(colors, colorDistance);
  const brightnessRange = Math.max(...brightness) - Math.min(...brightness);
  const brightnessStdDev = standardDeviation(brightness);
  const meanColorDelta = average(colorDeltas);
  const maxColorDelta = colorDeltas.length > 0 ? Math.max(...colorDeltas) : undefined;
  const lightingConsistencyScore = clamp01(1 - brightnessRange / 0.45);
  const temporalContinuityScore = meanColorDelta !== undefined ? clamp01(1 - meanColorDelta / 0.5) : undefined;
  const transitionContinuityScore = maxColorDelta !== undefined ? clamp01(1 - maxColorDelta / 0.7) : undefined;

  if (brightnessRange > 0.35) {
    findings.push("Sampled frames show a large brightness range; lighting continuity needs visual review.");
  }
  if ((maxColorDelta ?? 0) > 0.55) {
    findings.push("Sampled frames show a large color discontinuity; transition boundaries need closer review.");
  }
  if (colors.length < 3) {
    findings.push("Fewer than three sampled frame signals were available; confidence stays limited.");
  }

  return {
    sampleCount: colors.length,
    meanBrightness: round(average(brightness) ?? 0),
    brightnessRange: round(brightnessRange),
    brightnessStdDev: round(brightnessStdDev),
    ...(meanColorDelta !== undefined ? { meanColorDelta: round(meanColorDelta) } : {}),
    ...(maxColorDelta !== undefined ? { maxColorDelta: round(maxColorDelta) } : {}),
    ...(temporalContinuityScore !== undefined ? { temporalContinuityScore: round(temporalContinuityScore) } : {}),
    lightingConsistencyScore: round(lightingConsistencyScore),
    ...(transitionContinuityScore !== undefined ? { transitionContinuityScore: round(transitionContinuityScore) } : {}),
    findings
  };
}

async function averageRgbFromFrame(sample: FrameSample, workDirectory: string, signal?: AbortSignal): Promise<AverageRgb> {
  const rawPath = join(workDirectory, `sample_${sample.index}.rgb`);
  await runProcess(
    readMediaToolCommand("ffmpeg"),
    ["-y", "-i", sample.path, "-vf", "scale=1:1,format=rgb24", "-frames:v", "1", "-f", "rawvideo", rawPath],
    {
      ...(signal ? { signal } : {}),
      maxOutputBytes: 256 * 1024
    }
  );
  const bytes = await readFile(rawPath);
  if (bytes.length < 3) {
    throw new Error("raw RGB output was empty");
  }
  return {
    red: bytes[0] ?? 0,
    green: bytes[1] ?? 0,
    blue: bytes[2] ?? 0
  };
}

function pairwise<T>(items: readonly T[], fn: (left: T, right: T) => number): readonly number[] {
  const values: number[] = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    const left = items[index];
    const right = items[index + 1];
    if (left !== undefined && right !== undefined) {
      values.push(fn(left, right));
    }
  }
  return values;
}

function colorDistance(left: AverageRgb, right: AverageRgb): number {
  const red = (left.red - right.red) / 255;
  const green = (left.green - right.green) / 255;
  const blue = (left.blue - right.blue) / 255;
  return Math.sqrt(red * red + green * green + blue * blue) / Math.sqrt(3);
}

function average(values: readonly number[]): number | undefined {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return undefined;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function standardDeviation(values: readonly number[]): number {
  const mean = average(values);
  if (mean === undefined || values.length < 2) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
