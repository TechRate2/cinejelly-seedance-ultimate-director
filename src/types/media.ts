/**
 * Media inspection and postproduction types.
 * These reports become delivery evidence for customer-facing video outputs.
 */

import type { AspectRatio } from "./settings.js";

export interface MediaStreamInfo {
  readonly index: number;
  readonly type: "video" | "audio" | "subtitle" | "data" | "unknown";
  readonly codecName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly durationSeconds?: number;
}

export interface MediaMetadata {
  readonly path: string;
  readonly durationSeconds?: number;
  readonly bitrate?: number;
  readonly formatName?: string;
  readonly streams: readonly MediaStreamInfo[];
}

export interface AudioInspectionReport {
  readonly hasAudio: boolean;
  readonly durationSeconds?: number;
  readonly codecName?: string;
  readonly findings: readonly string[];
}

export interface DeliveryInspectionReport {
  readonly metadata: MediaMetadata;
  readonly audio: AudioInspectionReport;
  readonly status: "pass" | "warn" | "fail";
  readonly findings: readonly string[];
}

export interface FrameSamplingOptions {
  readonly enabled: boolean;
  readonly outputDirectory: string;
  readonly intervalSeconds: number;
  readonly maxFrames: number;
}

export interface FrameSample {
  readonly path: string;
  readonly index: number;
}

export interface PostproductionSettings {
  readonly enabled: boolean;
  readonly videoCodec: "libx264";
  readonly preset: "medium" | "slow" | "veryfast";
  readonly crf: number;
  readonly pixelFormat: "yuv420p";
  readonly audioCodec: "aac";
  readonly audioBitrate: string;
  readonly fastStart: boolean;
  readonly targetHeight?: 480 | 720 | 1080;
  readonly targetRatio?: AspectRatio;
}

export interface PostproductionInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly settings: PostproductionSettings;
}

export interface PostproductionResult {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly polishedAt: Date;
  readonly settings: PostproductionSettings;
}
