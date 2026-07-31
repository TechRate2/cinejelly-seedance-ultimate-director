/**
 * Agent orchestration types for the one-input CineJelly workflow.
 * These types keep user input, planning, rendering, and guardian reports explicit.
 */

import type { FlexibleSeedanceSettings, ModelPreferences } from "./settings.js";
import type { PromptReference, CompiledPrompt } from "./prompt.js";
import type { GuardianReport } from "./guardian.js";
import type { Prediction } from "./provider.js";
import type { ScenePlan } from "../core/shot-planner.js";
import type { AssembledDeliverable } from "./assembly.js";
import type { SocialPublishingMetadata } from "../core/social-publishing-planner.js";
import type { ProductionGraphSnapshot } from "./graph.js";
import type { Storyboard } from "./storyboard.js";
import type { CaptionCue, CaptionOptions } from "./caption.js";
import type { AudioMixOptions, AudioMixTrack, GeneratedAudioIntent } from "./audio.js";
import type { FrameSamplingOptions } from "./media.js";
import type { TransitionSettings } from "./transition.js";
import type { SemanticVisualInspectionOptions, SemanticVisualInspectionReport } from "./visual-inspection.js";
import type { RenderCostEstimate } from "./cost.js";
import type { DeliveryGateReport } from "./delivery.js";
import type { SourceVideoDeconstruction } from "./source-video.js";
import type { MaterialSourceValidationReport, MaterialSourcingPlan } from "./material.js";
import type { ProductionStagePlan } from "./stage.js";
import type { PostproductionAssetPlan } from "./postproduction-assets.js";
import type { GeneratedAudioOutputValidationBatchReport } from "./generated-audio-output.js";
import type { LongFormAgentReviewPlan } from "./long-form-agent-review.js";
import type { LongFormContinuityPlan } from "./long-form-continuity.js";
import type { LongFormCreativeIntelligencePlan } from "./long-form-creative-intelligence.js";
import type { LongFormReadinessPlan } from "./long-form-readiness.js";
import type { LongFormTimelinePlan } from "./long-form-timeline.js";
import type { ReviewApprovalReport } from "./review-approval.js";
import type { VideoRenderStrategyPlan } from "./video-render-strategy.js";
import type { RenderSchedulePlan } from "../core/render-scheduler.js";

export interface CineJellyProjectRequest {
  readonly userInput: string;
  readonly settings?: Partial<FlexibleSeedanceSettings>;
  readonly modelPreferences?: ModelPreferences;
  readonly references?: readonly PromptReference[];
  readonly metadata?: Record<string, string>;
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly captionCues?: readonly CaptionCue[];
  readonly captionOptions?: CaptionOptions;
  readonly audioTracks?: readonly AudioMixTrack[];
  readonly audioMixOptions?: AudioMixOptions;
  readonly generatedAudioIntents?: readonly GeneratedAudioIntent[];
  readonly frameSamplingOptions?: FrameSamplingOptions;
  readonly transitionSettings?: TransitionSettings;
  readonly semanticVisualInspectionOptions?: SemanticVisualInspectionOptions;
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}

export interface IntakeResult {
  /** Deep-brief understanding from the Creative Brief Analyst (enhancer; absent = legacy behavior). */
  readonly creativeIntent?: import("./creative-intent.js").CreativeIntent;
  readonly projectId: string;
  readonly userInput: string;
  readonly settings: FlexibleSeedanceSettings;
  readonly modelPreferences?: ModelPreferences;
  readonly references: readonly PromptReference[];
  /** Vision descriptors of uploaded image references (palette/material/logo/appearance), so the
   *  brief analyst decides style grounded in the REAL asset, not just its role+label. Fail-open. */
  readonly referenceVisualDescriptors?: readonly { readonly label: string; readonly descriptor: string }[];
  readonly metadata?: Record<string, string>;
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}

export interface StoryPlan {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly scenes: readonly ScenePlan[];
  /** Per-character appearance sheets (label → concrete face/body description) for identity anchoring. */
  readonly cast?: readonly { readonly label: string; readonly appearance: string }[];
  /** Series mode (metadata.seriesId): 2-3 sentences of what happened, for the continuity store. */
  readonly episodeSummary?: string;
  /** Series mode: the exact visible state at the final frame — the next episode resumes from it. */
  readonly episodeEndState?: string;
  /** Series mode: the unresolved hook the next episode must pick up. */
  readonly cliffhanger?: string;
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

/** A character's locked identity portrait for this run — persisted so later episodes reuse the same face. */
export interface DirectorCharacterAnchor {
  readonly characterKey: string;
  readonly label: string;
  readonly uri: string;
}

export interface DirectorRunResult {
  readonly projectId: string;
  /**
   * Identity portraits actually bound to this run's shots (generated anchors for invented
   * characters, or the customer's own uploads). Series persists these so episode 2+ reuses episode
   * 1's face instead of inventing a new one each episode.
   */
  readonly characterAnchors: readonly DirectorCharacterAnchor[];
  readonly storyPlan: StoryPlan;
  readonly storyboard: Storyboard;
  readonly storyboardPreflight: GuardianReport;
  readonly storyboardApprovalReport?: ReviewApprovalReport;
  readonly productionGraph: ProductionGraphSnapshot;
  readonly longFormContinuityPlan: LongFormContinuityPlan;
  readonly longFormAgentReview: LongFormAgentReviewPlan;
  readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
  readonly longFormTimelinePlan: LongFormTimelinePlan;
  readonly longFormCreativeIntelligencePlan: LongFormCreativeIntelligencePlan;
  readonly longFormReadinessPlan: LongFormReadinessPlan;
  readonly materialSourcingPlan: MaterialSourcingPlan;
  readonly materialSourceValidation: MaterialSourceValidationReport;
  readonly postproductionAssetPlan: PostproductionAssetPlan;
  readonly generatedAudioOutputBatchValidation?: GeneratedAudioOutputValidationBatchReport;
  readonly renderSchedulePlan: RenderSchedulePlan;
  readonly stagePlan: ProductionStagePlan;
  readonly costEstimate: RenderCostEstimate;
  readonly compiledPrompts: readonly CompiledPrompt[];
  readonly renderedShots: readonly RenderedShot[];
  readonly deliverable?: AssembledDeliverable;
  readonly deliveryGate?: DeliveryGateReport;
  readonly semanticVisualInspection?: SemanticVisualInspectionReport;
  /** Platform-ready title/description/hashtags so the deliverable can be posted immediately. */
  readonly socialPublishing?: SocialPublishingMetadata;
}
