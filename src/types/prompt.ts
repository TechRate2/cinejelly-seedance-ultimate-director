/**
 * Prompt Compiler domain types.
 * They model shot contracts and compiled Seedance prompt outputs without embedding Atlas-specific schemas.
 */

import type { FlexibleSeedanceSettings } from "./settings.js";
import type { ProviderMetadata, ProviderReference, ReferenceKind, VideoGenerationRequest } from "./provider.js";

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

export type PromptBindingConflictStatus = "info" | "warn" | "repair" | "block";

export type PromptBindingConflictCode =
  | "identity_reference_missing"
  | "product_reference_missing"
  | "audio_video_scope_conflict"
  | "source_video_structure_planning_only"
  | "unsupported_provider_reference_kind"
  | "provider_reference_limit_exceeded"
  | "duplicate_role_reference";

export type PromptCompressionSection =
  | "references"
  | "continuity"
  | "subject"
  | "action"
  | "camera"
  | "lighting"
  | "timeline"
  | "audio"
  | "transition"
  | "constraints";

export interface PromptBindingRoleScope {
  readonly role: ReferenceRole;
  readonly label: string;
  readonly priority: PromptReference["priority"];
  readonly scope: string;
  readonly providerReferenceKind: ReferenceKind;
  readonly providerIncluded: boolean;
  readonly providerFilterReason?: string;
}

export interface PromptBindingConflict {
  readonly status: PromptBindingConflictStatus;
  readonly code: PromptBindingConflictCode;
  readonly message: string;
  readonly repair: string;
  readonly role?: ReferenceRole;
  readonly label?: string;
}

export interface PromptCompressionNote {
  readonly order: number;
  readonly section: PromptCompressionSection;
  readonly reason: string;
}

export interface PromptBindingPlan {
  readonly sortedReferences: readonly PromptReference[];
  readonly providerReferences: readonly ProviderReference[];
  readonly roleScopes: readonly PromptBindingRoleScope[];
  readonly conflicts: readonly PromptBindingConflict[];
  readonly referenceLines: readonly string[];
  readonly compressionNotes: readonly PromptCompressionNote[];
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
  readonly providerSupportedReferenceKinds?: readonly ReferenceKind[];
  readonly maxProviderReferences?: number;
}

export interface CompiledPrompt {
  readonly shotId: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly references: readonly ProviderReference[];
  readonly bindingPlan: PromptBindingPlan;
  readonly inspectionExpectations: readonly string[];
  readonly repairHints: readonly string[];
  readonly videoRequest: VideoGenerationRequest;
}
