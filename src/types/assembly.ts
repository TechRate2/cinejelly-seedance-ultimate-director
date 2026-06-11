/**
 * Assembly types for turning rendered clips into a final deliverable.
 * The engine uses local media files or provider output URLs and produces a customer-facing video file.
 */

import type {
  DeliveryInspectionReport,
  FrameSample,
  FrameSamplingOptions,
  PostproductionResult,
  PostproductionSettings
} from "./media.js";
import type { CaptionArtifact, CaptionCue, CaptionOptions } from "./caption.js";
import type { AudioMixArtifact, AudioMixOptions, AudioMixTrack } from "./audio.js";
import type { TransitionArtifact, TransitionSettings } from "./transition.js";

export interface AssemblyClip {
  readonly clipId: string;
  readonly sourceUrlOrPath: string;
  readonly order: number;
}

export interface AssemblyInput {
  readonly projectId: string;
  readonly clips: readonly AssemblyClip[];
  readonly outputPath: string;
  readonly workDirectory: string;
  readonly postproductionSettings?: PostproductionSettings;
  readonly captionCues?: readonly CaptionCue[];
  readonly captionOptions?: CaptionOptions;
  readonly audioTracks?: readonly AudioMixTrack[];
  readonly audioMixOptions?: AudioMixOptions;
  readonly frameSamplingOptions?: FrameSamplingOptions;
  readonly transitionSettings?: TransitionSettings;
}

export interface AssembledDeliverable {
  readonly projectId: string;
  readonly outputPath: string;
  readonly outputByteSize: number;
  readonly outputSha256: string;
  readonly clipCount: number;
  readonly assembledAt: Date;
  readonly postproduction?: PostproductionResult;
  readonly captions?: CaptionArtifact;
  readonly audioMix?: AudioMixArtifact;
  readonly transition?: TransitionArtifact;
  readonly inspection: DeliveryInspectionReport;
  readonly frameSamples?: readonly FrameSample[];
}
