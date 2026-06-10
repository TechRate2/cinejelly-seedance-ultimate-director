/**
 * Agent orchestration types for the one-input CineJelly workflow.
 * These types keep user input, planning, rendering, and guardian reports explicit.
 */

import type { FlexibleSeedanceSettings } from "./settings.js";
import type { PromptReference, CompiledPrompt } from "./prompt.js";
import type { GuardianReport } from "./guardian.js";
import type { Prediction } from "./provider.js";
import type { ScenePlan } from "../core/shot-planner.js";
import type { AssembledDeliverable } from "./assembly.js";
import type { ProductionGraphSnapshot } from "./graph.js";
import type { CaptionCue, CaptionOptions } from "./caption.js";
import type { AudioMixOptions, AudioMixTrack } from "./audio.js";
import type { FrameSamplingOptions } from "./media.js";
import type { TransitionSettings } from "./transition.js";

export interface CineJellyProjectRequest {
  readonly userInput: string;
  readonly settings?: Partial<FlexibleSeedanceSettings>;
  readonly references?: readonly PromptReference[];
  readonly metadata?: Record<string, string>;
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly captionCues?: readonly CaptionCue[];
  readonly captionOptions?: CaptionOptions;
  readonly audioTracks?: readonly AudioMixTrack[];
  readonly audioMixOptions?: AudioMixOptions;
  readonly frameSamplingOptions?: FrameSamplingOptions;
  readonly transitionSettings?: TransitionSettings;
}

export interface IntakeResult {
  readonly projectId: string;
  readonly userInput: string;
  readonly settings: FlexibleSeedanceSettings;
  readonly references: readonly PromptReference[];
}

export interface StoryPlan {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly scenes: readonly ScenePlan[];
}

export interface RenderedShot {
  readonly compiledPrompt: CompiledPrompt;
  readonly preflight: GuardianReport;
  readonly prediction: Prediction;
  readonly renderInspection: GuardianReport;
}

export interface DirectorRunResult {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly productionGraph: ProductionGraphSnapshot;
  readonly compiledPrompts: readonly CompiledPrompt[];
  readonly renderedShots: readonly RenderedShot[];
  readonly deliverable?: AssembledDeliverable;
}
