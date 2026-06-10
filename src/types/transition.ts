/**
 * Transition types for smooth timeline assembly.
 * FFmpeg xfade/acrossfade is used to reduce hard cuts between Seedance clips.
 */

export type TransitionKind = "fade" | "wipeleft" | "wiperight" | "slideleft" | "slideright";

export interface TransitionSettings {
  readonly enabled: boolean;
  readonly kind: TransitionKind;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly targetHeight?: 480 | 720 | 1080;
  readonly preserveAudio: boolean;
}

export interface TransitionAssemblyInput {
  readonly inputPaths: readonly string[];
  readonly outputPath: string;
  readonly settings: TransitionSettings;
}

export interface TransitionArtifact {
  readonly outputPath: string;
  readonly transitionCount: number;
  readonly usedAudioCrossfade: boolean;
  readonly settings: TransitionSettings;
  readonly assembledAt: Date;
}
