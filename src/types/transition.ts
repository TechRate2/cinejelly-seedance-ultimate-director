/**
 * Transition types for smooth timeline assembly.
 * FFmpeg xfade/acrossfade is used to reduce hard cuts between Seedance clips.
 * Missing per-clip audio is filled with silence when neighboring clips have sound.
 */

import type { AspectRatio } from "./settings.js";

export type ResolvedTransitionKind =
  | "fade"
  | "dissolve"
  | "fadeblack"
  | "fadewhite"
  | "hblur"
  | "zoomin"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "smoothleft"
  | "smoothright"
  | "circleopen"
  | "circleclose";
export type TransitionKind = "auto" | ResolvedTransitionKind;

export interface TransitionSettings {
  readonly enabled: boolean;
  readonly kind: TransitionKind;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly targetHeight?: 480 | 720 | 1080 | 1440;
  readonly targetRatio?: AspectRatio;
  readonly preserveAudio: boolean;
}

export interface TransitionAssemblyInput {
  readonly inputPaths: readonly string[];
  readonly outputPath: string;
  readonly settings: TransitionSettings;
  readonly transitionIntents?: readonly string[];
}

export interface TransitionBoundaryPlan {
  readonly boundaryIndex: number;
  readonly fromInputIndex: number;
  readonly toInputIndex: number;
  readonly kind: ResolvedTransitionKind;
  readonly durationSeconds: number;
  readonly offsetSeconds: number;
  readonly intent?: string;
  readonly reasonCodes: readonly string[];
}

export interface TransitionArtifact {
  readonly outputPath: string;
  readonly transitionCount: number;
  readonly boundaryPlans: readonly TransitionBoundaryPlan[];
  readonly usedAudioCrossfade: boolean;
  readonly audioPreservationMode: "none" | "crossfade_all_source_audio" | "crossfade_with_silence_fill";
  readonly silentAudioFillCount: number;
  readonly settings: TransitionSettings;
  readonly assembledAt: Date;
}
