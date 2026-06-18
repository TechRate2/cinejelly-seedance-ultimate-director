import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  DirectorStyleBenchmarkAudioVideoSyncSignals,
  DirectorStyleBenchmarkAudioWaveformSignals,
  DirectorStyleBenchmarkMediaEvidence,
  DirectorStyleBenchmarkMediaStreamEvidence,
  DirectorStyleBenchmarkTransitionBoundarySignal,
  DirectorStyleBenchmarkTransitionSignals,
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
  readonly sceneChangeThreshold?: number;
  readonly transitionBoundaryWindowSeconds?: number;
  readonly maxTransitionBoundaries?: number;
  readonly signal?: AbortSignal;
}

interface AverageRgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

const DEFAULT_FRAME_INTERVAL_SECONDS = 3;
const DEFAULT_MAX_FRAME_SAMPLES = 8;
const DEFAULT_SCENE_CHANGE_THRESHOLD = 0.12;
const DEFAULT_TRANSITION_BOUNDARY_WINDOW_SECONDS = 0.12;
const DEFAULT_MAX_TRANSITION_BOUNDARIES = 8;
const DEFAULT_AUDIO_ANALYSIS_WINDOW_SECONDS = 30;

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
  const sceneChangeThreshold = normalizeThreshold(options.sceneChangeThreshold, DEFAULT_SCENE_CHANGE_THRESHOLD);
  const transitionBoundaryWindowSeconds = normalizePositiveNumber(
    options.transitionBoundaryWindowSeconds,
    DEFAULT_TRANSITION_BOUNDARY_WINDOW_SECONDS
  );
  const maxTransitionBoundaries = normalizePositiveInteger(
    options.maxTransitionBoundaries,
    DEFAULT_MAX_TRANSITION_BOUNDARIES
  );
  const audioWaveformDurationSeconds = delivery.audio.durationSeconds ?? metadata.durationSeconds;
  const audioWaveformSignals = delivery.audio.hasAudio
    ? await audioWaveformSignalsFromMedia({
        mediaPath: options.mediaPath,
        ...(audioWaveformDurationSeconds !== undefined ? { durationSeconds: audioWaveformDurationSeconds } : {}),
        ...(options.signal ? { signal: options.signal } : {})
      })
    : undefined;
  const audioVideoSyncSignals = delivery.audio.hasAudio
    ? audioVideoSyncSignalsFromMetadata({
        ...(metadata.durationSeconds !== undefined ? { containerDurationSeconds: metadata.durationSeconds } : {}),
        ...(videoStream?.durationSeconds !== undefined ? { videoDurationSeconds: videoStream.durationSeconds } : {}),
        ...(delivery.audio.durationSeconds !== undefined ? { audioDurationSeconds: delivery.audio.durationSeconds } : {})
      })
    : undefined;
  const findings = [
    ...delivery.findings,
    ...(audioWaveformSignals?.findings ?? []),
    ...(audioVideoSyncSignals?.findings ?? [])
  ];
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
      ...(delivery.audio.sampleRate !== undefined ? { sampleRate: delivery.audio.sampleRate } : {}),
      ...(delivery.audio.channelCount !== undefined ? { channelCount: delivery.audio.channelCount } : {}),
      ...(delivery.audio.durationSeconds !== undefined ? { durationSeconds: round(delivery.audio.durationSeconds) } : {}),
      ...(audioWaveformSignals ? { waveformSignals: audioWaveformSignals } : {}),
      ...(audioVideoSyncSignals ? { audioVideoSyncSignals } : {})
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
    const transitionSignals = await transitionSignalsFromMedia({
      mediaPath: options.mediaPath,
      workDirectory: sampleDirectory,
      ...(metadata.durationSeconds !== undefined ? { durationSeconds: metadata.durationSeconds } : {}),
      sceneChangeThreshold,
      boundaryWindowSeconds: transitionBoundaryWindowSeconds,
      maxBoundaries: maxTransitionBoundaries,
      ...(options.signal ? { signal: options.signal } : {})
    });
    return {
      ...baseEvidence,
      status: visualSignals.sampleCount > 0 ? "frame_sampled" : "probe_only",
      frameSampleCount: samples.length,
      frameSamplingIntervalSeconds,
      sampledFramesRedacted: true,
      visualSignals,
      transitionSignals,
      findings: [...findings, ...visualSignals.findings, ...transitionSignals.findings]
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
    ...(stream.sampleRate !== undefined ? { sampleRate: stream.sampleRate } : {}),
    ...(stream.channelCount !== undefined ? { channelCount: stream.channelCount } : {}),
    ...(stream.durationSeconds !== undefined ? { durationSeconds: round(stream.durationSeconds) } : {})
  };
}

async function audioWaveformSignalsFromMedia(input: {
  readonly mediaPath: string;
  readonly durationSeconds?: number;
  readonly signal?: AbortSignal;
}): Promise<DirectorStyleBenchmarkAudioWaveformSignals> {
  const analyzedDurationSeconds = round(
    Math.min(
      normalizePositiveNumber(input.durationSeconds, DEFAULT_AUDIO_ANALYSIS_WINDOW_SECONDS),
      DEFAULT_AUDIO_ANALYSIS_WINDOW_SECONDS
    )
  );
  try {
    const result = await runProcess(
      readMediaToolCommand("ffmpeg"),
      [
        "-hide_banner",
        "-nostats",
        "-i",
        input.mediaPath,
        "-map",
        "0:a:0",
        "-t",
        String(analyzedDurationSeconds),
        "-vn",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-"
      ],
      {
        ...(input.signal ? { signal: input.signal } : {}),
        maxOutputBytes: 1024 * 1024
      }
    );
    const text = `${result.stdout}\n${result.stderr}`;
    const meanVolumeDb = readVolumeDb(text, "mean_volume");
    const maxVolumeDb = readVolumeDb(text, "max_volume");
    if (meanVolumeDb === undefined && maxVolumeDb === undefined) {
      return {
        status: "unavailable",
        analyzer: "ffmpeg_volumedetect",
        analyzedDurationSeconds,
        findings: ["FFmpeg volumedetect did not return usable volume statistics for the first audio stream."]
      };
    }
    const headroomDb = maxVolumeDb !== undefined ? round(Math.max(0, -maxVolumeDb)) : undefined;
    const signalPresenceScore = audioSignalPresenceScore(meanVolumeDb, maxVolumeDb);
    const findings = [
      `Audio waveform proxy analyzed ${analyzedDurationSeconds}s with FFmpeg volumedetect; raw audio bytes were not stored.`
    ];
    if (meanVolumeDb !== undefined && meanVolumeDb < -50) {
      findings.push("Mean audio level is very low; manual listening review should check for silence or unusable narration/BGM.");
    }
    if (maxVolumeDb !== undefined && maxVolumeDb > -0.3) {
      findings.push("Peak audio level is close to clipping; manual listening review should check distortion.");
    }
    return {
      status: "analyzed",
      analyzer: "ffmpeg_volumedetect",
      analyzedDurationSeconds,
      ...(meanVolumeDb !== undefined ? { meanVolumeDb } : {}),
      ...(maxVolumeDb !== undefined ? { maxVolumeDb } : {}),
      ...(headroomDb !== undefined ? { headroomDb } : {}),
      ...(signalPresenceScore !== undefined ? { signalPresenceScore } : {}),
      findings
    };
  } catch (error) {
    return {
      status: "unavailable",
      analyzer: "ffmpeg_volumedetect",
      analyzedDurationSeconds,
      findings: [`FFmpeg audio waveform proxy failed: ${messageFrom(error)}.`]
    };
  }
}

function audioVideoSyncSignalsFromMetadata(input: {
  readonly containerDurationSeconds?: number;
  readonly videoDurationSeconds?: number;
  readonly audioDurationSeconds?: number;
}): DirectorStyleBenchmarkAudioVideoSyncSignals {
  const videoDurationSeconds = input.videoDurationSeconds ?? input.containerDurationSeconds;
  const audioDurationSeconds = input.audioDurationSeconds;
  if (videoDurationSeconds === undefined || audioDurationSeconds === undefined) {
    return {
      status: "unavailable",
      analyzer: "ffprobe_duration_delta",
      ...(input.containerDurationSeconds !== undefined ? { containerDurationSeconds: round(input.containerDurationSeconds) } : {}),
      ...(videoDurationSeconds !== undefined ? { videoDurationSeconds: round(videoDurationSeconds) } : {}),
      ...(audioDurationSeconds !== undefined ? { audioDurationSeconds: round(audioDurationSeconds) } : {}),
      findings: ["Audio/video duration alignment could not be computed because FFprobe did not expose both stream durations."]
    };
  }

  const durationDeltaSeconds = round(Math.abs(videoDurationSeconds - audioDurationSeconds));
  const durationDeltaRatio = round(durationDeltaSeconds / Math.max(videoDurationSeconds, audioDurationSeconds, 0.001));
  const durationAlignmentScore = durationAlignmentScoreForDelta(durationDeltaSeconds, durationDeltaRatio);
  const findings = [
    `Audio/video duration proxy compared FFprobe stream durations; delta=${durationDeltaSeconds}s, ratio=${durationDeltaRatio}.`
  ];
  if (durationDeltaSeconds > 1.5 || durationDeltaRatio > 0.08) {
    findings.push("Audio and video durations differ enough to require manual sync review.");
  }

  return {
    status: "analyzed",
    analyzer: "ffprobe_duration_delta",
    ...(input.containerDurationSeconds !== undefined ? { containerDurationSeconds: round(input.containerDurationSeconds) } : {}),
    videoDurationSeconds: round(videoDurationSeconds),
    audioDurationSeconds: round(audioDurationSeconds),
    durationDeltaSeconds,
    durationDeltaRatio,
    durationAlignmentScore,
    findings
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

function readVolumeDb(text: string, label: "mean_volume" | "max_volume"): number | undefined {
  const escapedLabel = label.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedLabel}:\\s*(-?(?:inf|\\d+(?:\\.\\d+)?))\\s*dB`, "i"));
  const raw = match?.[1]?.toLowerCase();
  if (!raw || raw.includes("inf")) {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? round(value) : undefined;
}

function audioSignalPresenceScore(meanVolumeDb: number | undefined, maxVolumeDb: number | undefined): number | undefined {
  if (meanVolumeDb === undefined && maxVolumeDb === undefined) {
    return undefined;
  }
  const mean = meanVolumeDb ?? -45;
  const meanScore =
    mean <= -60 ? 0.2 :
    mean <= -38 ? 0.56 :
    mean <= -14 ? 0.76 :
    mean <= -6 ? 0.68 :
    0.56;
  const clippingPenalty = maxVolumeDb !== undefined && maxVolumeDb > -0.3 ? 0.12 : 0;
  return round(clamp01(meanScore - clippingPenalty));
}

function durationAlignmentScoreForDelta(deltaSeconds: number, deltaRatio: number): number {
  if (deltaSeconds <= 0.25 && deltaRatio <= 0.01) {
    return 0.92;
  }
  if (deltaSeconds <= 0.75 && deltaRatio <= 0.03) {
    return 0.82;
  }
  if (deltaSeconds <= 1.5 && deltaRatio <= 0.08) {
    return 0.66;
  }
  return 0.42;
}

async function transitionSignalsFromMedia(input: {
  readonly mediaPath: string;
  readonly workDirectory: string;
  readonly durationSeconds?: number;
  readonly sceneChangeThreshold: number;
  readonly boundaryWindowSeconds: number;
  readonly maxBoundaries: number;
  readonly signal?: AbortSignal;
}): Promise<DirectorStyleBenchmarkTransitionSignals> {
  let boundaryTimes: readonly number[];
  try {
    boundaryTimes = await detectSceneChangeTimes({
      mediaPath: input.mediaPath,
      sceneChangeThreshold: input.sceneChangeThreshold,
      maxBoundaries: input.maxBoundaries,
      ...(input.signal ? { signal: input.signal } : {})
    });
  } catch (error) {
    return {
      status: "unavailable",
      sceneChangeThreshold: input.sceneChangeThreshold,
      boundaryWindowSeconds: input.boundaryWindowSeconds,
      candidateBoundaryCount: 0,
      analyzedBoundaryCount: 0,
      findings: [`Scene-change detection failed: ${messageFrom(error)}.`]
    };
  }

  const durationSeconds = input.durationSeconds;
  const candidateTimes = boundaryTimes
    .filter((time) => time > input.boundaryWindowSeconds)
    .filter((time) => durationSeconds === undefined || time < durationSeconds - input.boundaryWindowSeconds)
    .slice(0, input.maxBoundaries);

  if (candidateTimes.length === 0) {
    return {
      status: "not_detected",
      sceneChangeThreshold: input.sceneChangeThreshold,
      boundaryWindowSeconds: input.boundaryWindowSeconds,
      candidateBoundaryCount: boundaryTimes.length,
      analyzedBoundaryCount: 0,
      findings: boundaryTimes.length === 0
        ? ["FFmpeg scene-change detection did not find transition boundaries at the configured threshold."]
        : ["Detected scene changes were too close to the media edges for safe pre/post boundary sampling."]
    };
  }

  const boundaries: DirectorStyleBenchmarkTransitionBoundarySignal[] = [];
  const findings: string[] = [];
  for (const [index, timeSeconds] of candidateTimes.entries()) {
    const preTimeSeconds = Math.max(0, timeSeconds - input.boundaryWindowSeconds);
    const postTimeSeconds = timeSeconds + input.boundaryWindowSeconds;
    try {
      const preColor = await averageRgbFromMediaTime(input.mediaPath, preTimeSeconds, input.workDirectory, `boundary_${index}_pre`, input.signal);
      const postColor = await averageRgbFromMediaTime(input.mediaPath, postTimeSeconds, input.workDirectory, `boundary_${index}_post`, input.signal);
      const brightnessDelta = Math.abs(brightness(preColor) - brightness(postColor));
      const delta = colorDistance(preColor, postColor);
      boundaries.push({
        index,
        timeSeconds: round(timeSeconds),
        preTimeSeconds: round(preTimeSeconds),
        postTimeSeconds: round(postTimeSeconds),
        colorDelta: round(delta),
        brightnessDelta: round(brightnessDelta),
        continuityScore: round(clamp01(1 - delta / 0.75))
      });
    } catch (error) {
      findings.push(`Boundary ${index} at ${round(timeSeconds)}s could not be sampled: ${messageFrom(error)}.`);
    }
  }

  if (boundaries.length === 0) {
    return {
      status: "unavailable",
      sceneChangeThreshold: input.sceneChangeThreshold,
      boundaryWindowSeconds: input.boundaryWindowSeconds,
      candidateBoundaryCount: candidateTimes.length,
      analyzedBoundaryCount: 0,
      findings: findings.length > 0 ? findings : ["Transition boundary candidates could not be analyzed."]
    };
  }

  const colorDeltas = boundaries.map((boundary) => boundary.colorDelta);
  const brightnessDeltas = boundaries.map((boundary) => boundary.brightnessDelta);
  const meanBoundaryColorDelta = average(colorDeltas);
  const maxBoundaryColorDelta = Math.max(...colorDeltas);
  const meanBrightnessDelta = average(brightnessDeltas);
  const transitionContinuityScore = average(boundaries.map((boundary) => boundary.continuityScore));

  if (maxBoundaryColorDelta > 0.65) {
    findings.push("At least one detected boundary has a high color delta; semantic/manual transition review is required.");
  }
  if ((meanBrightnessDelta ?? 0) > 0.35) {
    findings.push("Detected boundaries show a high average brightness delta; lighting continuity needs review.");
  }

  return {
    status: "analyzed",
    sceneChangeThreshold: input.sceneChangeThreshold,
    boundaryWindowSeconds: input.boundaryWindowSeconds,
    candidateBoundaryCount: boundaryTimes.length,
    analyzedBoundaryCount: boundaries.length,
    ...(meanBoundaryColorDelta !== undefined ? { meanBoundaryColorDelta: round(meanBoundaryColorDelta) } : {}),
    maxBoundaryColorDelta: round(maxBoundaryColorDelta),
    ...(meanBrightnessDelta !== undefined ? { meanBrightnessDelta: round(meanBrightnessDelta) } : {}),
    ...(transitionContinuityScore !== undefined ? { transitionContinuityScore: round(transitionContinuityScore) } : {}),
    boundaries,
    findings
  };
}

async function detectSceneChangeTimes(input: {
  readonly mediaPath: string;
  readonly sceneChangeThreshold: number;
  readonly maxBoundaries: number;
  readonly signal?: AbortSignal;
}): Promise<readonly number[]> {
  const result = await runProcess(
    readMediaToolCommand("ffmpeg"),
    [
      "-hide_banner",
      "-i",
      input.mediaPath,
      "-vf",
      `select='gt(scene,${input.sceneChangeThreshold})',showinfo`,
      "-frames:v",
      String(input.maxBoundaries),
      "-f",
      "null",
      "-"
    ],
    {
      ...(input.signal ? { signal: input.signal } : {}),
      maxOutputBytes: 1024 * 1024
    }
  );
  const times = new Set<number>();
  const text = `${result.stdout}\n${result.stderr}`;
  for (const match of text.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g)) {
    const value = Number.parseFloat(match[1] ?? "");
    if (Number.isFinite(value)) {
      times.add(round(value));
    }
  }
  return [...times].sort((left, right) => left - right);
}

async function averageRgbFromMediaTime(
  mediaPath: string,
  timeSeconds: number,
  workDirectory: string,
  name: string,
  signal?: AbortSignal
): Promise<AverageRgb> {
  const rawPath = join(workDirectory, `${name}.rgb`);
  await runProcess(
    readMediaToolCommand("ffmpeg"),
    [
      "-y",
      "-ss",
      String(Math.max(0, timeSeconds)),
      "-i",
      mediaPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1,format=rgb24",
      "-f",
      "rawvideo",
      rawPath
    ],
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

function brightness(color: AverageRgb): number {
  return (color.red + color.green + color.blue) / (3 * 255);
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

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeThreshold(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
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
