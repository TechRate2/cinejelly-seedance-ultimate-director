/**
 * Source-video deconstruction contracts.
 * Inspired by source-video understanding patterns: external video-understanding work can feed transcript, pacing,
 * keyframe, style, and safety structure into CineJelly without making upstream repos a runtime dependency.
 */

export const SOURCE_VIDEO_ANALYSIS_LIMITS = {
  maxScenes: 160,
  maxTranscriptCues: 1_500,
  maxKeyframesPerScene: 12,
  maxNotes: 120,
  maxTextLength: 2_000,
  maxLabelLength: 160,
  maxUriLength: 4_096
} as const;

export interface SourceVideoTranscriptCue {
  readonly startSecond: number;
  readonly endSecond: number;
  readonly text: string;
}

export interface SourceVideoKeyframe {
  readonly timestampSecond: number;
  readonly description: string;
  readonly uri?: string;
}

export interface SourceVideoSceneDeconstruction {
  readonly sceneId: string;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly summary: string;
  readonly pacing?: string;
  readonly camera?: string;
  readonly audio?: string;
  readonly visualStyle?: string;
  readonly keyframes?: readonly SourceVideoKeyframe[];
}

export type SourceVideoEditRhythmLabel = "unknown" | "slow" | "balanced" | "fast" | "very_fast";

export interface SourceVideoMediaVideoMetrics {
  readonly codecName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly aspectRatio?: string;
}

export interface SourceVideoMediaAudioMetrics {
  readonly hasAudio: boolean;
  readonly codecName?: string;
  readonly sampleRate?: number;
  readonly channelCount?: number;
}

export interface SourceVideoEditRhythmMetrics {
  readonly sampledWindowSeconds?: number;
  readonly sceneCutCount: number;
  readonly cutDensityPerMinute?: number;
  readonly averageShotLengthSeconds?: number;
  readonly rhythmLabel: SourceVideoEditRhythmLabel;
  readonly sceneCutTimestampsSeconds?: readonly number[];
}

export interface SourceVideoMediaMetricsEvidence {
  readonly probeSucceeded: boolean;
  readonly sceneDetectionSucceeded: boolean;
  readonly sourceUriSha256: string;
}

export interface SourceVideoMediaMetrics {
  readonly schemaVersion: "cinejelly.source-video-media-metrics.v1";
  readonly durationSeconds?: number;
  readonly bitrate?: number;
  readonly formatName?: string;
  readonly video?: SourceVideoMediaVideoMetrics;
  readonly audio: SourceVideoMediaAudioMetrics;
  readonly editRhythm: SourceVideoEditRhythmMetrics;
  readonly evidence: SourceVideoMediaMetricsEvidence;
}

export interface SourceVideoDeconstruction {
  readonly sourceReferenceLabel?: string;
  readonly transformationIntent?: string;
  readonly transcript?: readonly SourceVideoTranscriptCue[];
  readonly scenes?: readonly SourceVideoSceneDeconstruction[];
  readonly mediaMetrics?: SourceVideoMediaMetrics;
  readonly pacingNotes?: readonly string[];
  readonly styleNotes?: readonly string[];
  readonly structuralBeats?: readonly string[];
  readonly safetyNotes?: readonly string[];
}

export interface SourceVideoAutoAnalysisResult {
  readonly analysis?: SourceVideoDeconstruction;
  readonly skippedReason?: string;
}
