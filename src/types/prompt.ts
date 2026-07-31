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
  readonly selection?: PromptReferenceSelectionMetadata;
}

export type ReferenceView = "front" | "side" | "back" | "three_quarter" | "over_the_shoulder" | "unknown";

export interface PromptReferenceSelectionMetadata {
  readonly cameraId?: string;
  readonly compositionId?: string;
  readonly characterId?: string;
  readonly view?: ReferenceView;
  readonly timelineIndex?: number;
  readonly sourceShotId?: string;
  readonly sourceSceneId?: string;
  readonly authorized?: boolean;
}

export type ReferenceSelectionReasonCode =
  | "primary_priority"
  | "same_camera"
  | "same_composition"
  | "recent_prior_frame"
  | "identity_risk_anchor"
  | "product_risk_anchor"
  | "transition_endpoint_anchor"
  | "role_priority"
  | "stable_tiebreak";

export type ReferenceSelectionDropReason =
  | "unauthorized_reference"
  | "duplicate_exact_reference"
  | "duplicate_character_view"
  | "max_selected_references_exceeded";

export interface ReferenceSelectionCandidate {
  readonly reference: PromptReference;
  readonly originalIndex: number;
  readonly score: number;
  readonly scoreReasons: readonly ReferenceSelectionReasonCode[];
  readonly selected: boolean;
  readonly dropReason?: ReferenceSelectionDropReason;
}

export interface ReferenceSelectionPlan {
  readonly shotId: string;
  readonly maxSelectedReferences: number;
  readonly candidateCount: number;
  readonly selectedReferences: readonly PromptReference[];
  readonly candidates: readonly ReferenceSelectionCandidate[];
}

export type PromptBindingConflictStatus = "info" | "warn" | "repair" | "block";

export type PromptBindingConflictCode =
  | "identity_reference_missing"
  | "product_reference_missing"
  | "audio_video_scope_conflict"
  | "source_video_structure_planning_only"
  | "unsupported_provider_reference_kind"
  | "provider_reference_limit_exceeded"
  | "provider_reference_family_limit_exceeded"
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

export type StyleRegister = "professional_cinematic" | "natural_phone_kol";

/**
 * Per-request style DNA AUTHORED by the LLM for THIS brief (analyst or scriptwriter) — replaces the
 * fixed per-niche lookup tables as the primary style source. Each axis overrides/extends the
 * invariant REGISTER_GRAMMAR frame; absent axes fall back to the register text alone.
 */
export interface StyleDna {
  readonly register: StyleRegister;
  readonly optics?: string;
  readonly lighting?: string;
  readonly palette?: string;
  readonly motion?: string;
  readonly performance?: string;
  readonly audioFeel?: string;
  readonly moodWords?: readonly string[];
  readonly avoid?: readonly string[];
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
  /**
   * A finished, author-supplied dialogue/narration line to be spoken VERBATIM (script-first mode).
   * Unlike audioIntent (guidance the compiler may rephrase), this is emitted to the provider exactly
   * as written and is never normalized, truncated, or duplicated across a beat's sub-clips.
   */
  readonly spokenLine?: string;
  /**
   * True on the 2nd+ sub-clip of a beat whose verbatim spokenLine rides the FIRST sub-clip: this
   * clip is still delivering that scripted narration, so word caps must not apply here either —
   * they would contradict the beat-level verbatim contract mid-delivery.
   */
  readonly spokenLineContinuation?: boolean;
  /** One visible emotional turn (state A -> state B) the beat must play — the anti-stiffness craft law. */
  readonly emotionalTurn?: string;
  /** LLM-authored per-request style DNA (register + axis overrides); legacy DNA tables are fallback-only. */
  readonly styleDna?: StyleDna;
  readonly transitionIntent?: string;
  readonly timeline?: readonly TimelineSegment[];
  readonly references: readonly PromptReference[];
  readonly referenceSelectionPlan?: ReferenceSelectionPlan;
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

/**
 * Audio-first avatar render plan for a TALKING shot. When present, the render producer routes the
 * shot to the audio-driven avatar model (portrait/keyframe image + pre-generated TTS voiceover)
 * instead of the general video model, so lip-sync, expression, and gesture follow the real speech.
 */
export interface CompiledPromptAvatarPlan {
  readonly modelId: string;
  readonly imageUrl: string;
  readonly audioUrl: string;
  readonly prompt?: string;
  readonly outputResolution?: 720 | 1080;
  readonly seed?: number;
}

export interface CompiledPrompt {
  readonly shotId: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly references: readonly ProviderReference[];
  readonly referenceSelectionPlan?: ReferenceSelectionPlan;
  readonly bindingPlan: PromptBindingPlan;
  readonly inspectionExpectations: readonly string[];
  readonly repairHints: readonly string[];
  readonly videoRequest: VideoGenerationRequest;
  readonly avatarPlan?: CompiledPromptAvatarPlan;
}
