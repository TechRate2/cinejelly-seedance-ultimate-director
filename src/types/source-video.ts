/**
 * Source-video deconstruction contracts.
 * Inspired by VideoAgent/OpenMontage patterns: external video-understanding work can feed transcript, pacing,
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

export interface SourceVideoDeconstruction {
  readonly sourceReferenceLabel?: string;
  readonly transformationIntent?: string;
  readonly transcript?: readonly SourceVideoTranscriptCue[];
  readonly scenes?: readonly SourceVideoSceneDeconstruction[];
  readonly pacingNotes?: readonly string[];
  readonly styleNotes?: readonly string[];
  readonly structuralBeats?: readonly string[];
  readonly safetyNotes?: readonly string[];
}
