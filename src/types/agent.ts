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
import type { Storyboard } from "./storyboard.js";
import type { CaptionCue, CaptionOptions } from "./caption.js";
import type { AudioMixOptions, AudioMixTrack } from "./audio.js";
import type { FrameSamplingOptions } from "./media.js";
import type { TransitionSettings } from "./transition.js";
import type { SemanticVisualInspectionOptions, SemanticVisualInspectionReport } from "./visual-inspection.js";
import type { RenderCostEstimate } from "./cost.js";
import type { DeliveryGateReport } from "./delivery.js";
import type { SourceVideoDeconstruction } from "./source-video.js";
import type { MaterialSourceValidationReport, MaterialSourcingPlan } from "./material.js";
import type { ProductionStagePlan } from "./stage.js";

export interface CineJellyProjectRequest {
  readonly userInput: string;
  readonly settings?: Partial<FlexibleSeedanceSettings>;
  readonly references?: readonly PromptReference[];
  readonly metadata?: Record<string, string>;
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly captionCues?: readonly CaptionCue[];
  readonly captionOptions?: CaptionOptions;
  readonly audioTracks?: readonly AudioMixTrack[];
  readonly audioMixOptions?: AudioMixOptions;
  readonly frameSamplingOptions?: FrameSamplingOptions;
  readonly transitionSettings?: TransitionSettings;
  readonly semanticVisualInspectionOptions?: SemanticVisualInspectionOptions;
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}

export interface IntakeResult {
  readonly projectId: string;
  readonly userInput: string;
  readonly settings: FlexibleSeedanceSettings;
  readonly references: readonly PromptReference[];
  readonly metadata?: Record<string, string>;
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}

export interface StoryPlan {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly scenes: readonly ScenePlan[];
}

export interface RenderCandidate {
  readonly candidateIndex: number;
  readonly repairAttempt?: number;
  readonly testTake?: boolean;
  readonly compiledPrompt: CompiledPrompt;
  readonly prediction: Prediction;
  readonly renderInspection: GuardianReport;
}

export interface RenderedShot {
  readonly compiledPrompt: CompiledPrompt;
  readonly preflight: GuardianReport;
  readonly prediction: Prediction;
  readonly renderInspection: GuardianReport;
  readonly testTake?: RenderCandidate;
  readonly candidates: readonly RenderCandidate[];
  readonly selectedCandidateIndex: number;
  readonly repairAttemptCount: number;
}

export interface DirectorRunResult {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly storyboard: Storyboard;
  readonly storyboardPreflight: GuardianReport;
  readonly productionGraph: ProductionGraphSnapshot;
  readonly materialSourcingPlan: MaterialSourcingPlan;
  readonly materialSourceValidation: MaterialSourceValidationReport;
  readonly stagePlan: ProductionStagePlan;
  readonly costEstimate: RenderCostEstimate;
  readonly compiledPrompts: readonly CompiledPrompt[];
  readonly renderedShots: readonly RenderedShot[];
  readonly deliverable?: AssembledDeliverable;
  readonly deliveryGate?: DeliveryGateReport;
  readonly semanticVisualInspection?: SemanticVisualInspectionReport;
}
