/**
 * Prompt Compiler domain types.
 * They model shot contracts and compiled Seedance prompt outputs without embedding Atlas-specific schemas.
 */

import type { FlexibleSeedanceSettings } from "./settings.js";
import type { ProviderMetadata, ProviderReference, VideoGenerationRequest } from "./provider.js";

export type ReferenceRole =
  | "identity"
  | "product"
  | "wardrobe"
  | "environment"
  | "motion"
  | "camera"
  | "audio_tempo"
  | "voice"
  | "style"
  | "first_frame"
  | "last_frame"
  | "source_video_structure";

export type ContinuityRisk =
  | "face"
  | "product_logo"
  | "wardrobe"
  | "environment"
  | "physics"
  | "text"
  | "multi_character_blocking"
  | "audio_sync"
  | "transition";

export interface PromptReference {
  readonly role: ReferenceRole;
  readonly label: string;
  readonly providerReference: ProviderReference;
  readonly priority: "primary" | "supporting";
}

export interface TimelineSegment {
  readonly startSecond: number;
  readonly endSecond: number;
  readonly action: string;
  readonly camera?: string;
  readonly audioCue?: string;
}

export interface ShotContinuity {
  readonly identity?: string;
  readonly product?: string;
  readonly wardrobe?: string;
  readonly environment?: string;
  readonly style?: string;
  readonly previousShotEndState?: string;
  readonly nextShotStartState?: string;
}

export interface ShotContract {
  readonly shotId: string;
  readonly sceneId?: string;
  readonly beatId?: string;
  readonly durationSeconds: number;
  readonly intent: string;
  readonly subject: string;
  readonly action: string;
  readonly camera: string;
  readonly lighting: string;
  readonly style?: string;
  readonly audioIntent?: string;
  readonly transitionIntent?: string;
  readonly timeline?: readonly TimelineSegment[];
  readonly references: readonly PromptReference[];
  readonly continuity: ShotContinuity;
  readonly risks: readonly ContinuityRisk[];
  readonly metadata?: ProviderMetadata;
}

export interface PromptCompilerInput {
  readonly shot: ShotContract;
  readonly settings: FlexibleSeedanceSettings;
  readonly modelId: string;
  readonly provider: "atlascloud";
}

export interface CompiledPrompt {
  readonly shotId: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly references: readonly ProviderReference[];
  readonly inspectionExpectations: readonly string[];
  readonly repairHints: readonly string[];
  readonly videoRequest: VideoGenerationRequest;
}
