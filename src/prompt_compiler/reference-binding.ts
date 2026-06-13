/**
 * Reference binding helpers based on the documented Seedance Reference Cluster pattern.
 * They create a PromptBindingPlan before prompt prose so ordering, filtering, and conflicts stay inspectable.
 */

import type {
  ContinuityRisk,
  PromptBindingConflict,
  PromptBindingPlan,
  PromptBindingRoleScope,
  PromptCompressionNote,
  PromptReference,
  ReferenceRole
} from "../types/prompt.js";
import type { ProviderReference, ReferenceKind } from "../types/provider.js";

const ROLE_PRIORITY: Record<ReferenceRole, number> = {
  identity: 0,
  product: 1,
  wardrobe: 2,
  first_frame: 3,
  last_frame: 4,
  environment: 5,
  motion: 6,
  camera: 7,
  audio_tempo: 8,
  voice: 9,
  style: 10,
  source_video_structure: 11
};

const ROLE_SCOPE: Record<ReferenceRole, string> = {
  identity: "lock character identity and face continuity",
  product: "lock product geometry, logo, and hero-object continuity",
  wardrobe: "lock costume, fabric, color, and continuity-visible accessories",
  first_frame: "anchor the opening pose and composition",
  last_frame: "anchor the ending pose and composition for transitions",
  environment: "lock location, set dressing, and atmosphere",
  motion: "guide action dynamics without overriding identity/product anchors",
  camera: "guide lens, framing, movement, and composition",
  audio_tempo: "guide audio rhythm only",
  voice: "guide voice character only",
  style: "guide visual style after continuity-critical references",
  source_video_structure: "guide planning and shot structure, not default provider input"
};

const DEFAULT_MAX_PROVIDER_REFERENCES = 8;

const COMPRESSION_NOTES: readonly PromptCompressionNote[] = [
  { order: 1, section: "references", reason: "bind continuity-critical assets before prose" },
  { order: 2, section: "continuity", reason: "state identity/product/environment constraints after references" },
  { order: 3, section: "subject", reason: "describe scene subject only after anchors are known" },
  { order: 4, section: "action", reason: "action should not override reference anchors" },
  { order: 5, section: "camera", reason: "camera follows subject/action and role-scoped camera references" },
  { order: 6, section: "lighting", reason: "lighting preserves environment/style consistency" },
  { order: 7, section: "timeline", reason: "long-form beat timing stays compact and ordered" },
  { order: 8, section: "audio", reason: "audio directives are scoped after visual plan" },
  { order: 9, section: "transition", reason: "transition handles depend on endpoints" },
  { order: 10, section: "constraints", reason: "final anti-slop and negative guidance stays last" }
];

export interface PromptBindingPlanInput {
  readonly references: readonly PromptReference[];
  readonly risks?: readonly ContinuityRisk[];
  readonly providerSupportedReferenceKinds?: readonly ReferenceKind[];
  readonly maxProviderReferences?: number;
}

export function sortReferencesForPrompt(references: readonly PromptReference[]): readonly PromptReference[] {
  return [...references].sort(compareReferencesForPrompt);
}

export function buildPromptBindingPlan(input: PromptBindingPlanInput): PromptBindingPlan {
  const sortedReferences = sortReferencesForPrompt(input.references);
  const supportedKinds = input.providerSupportedReferenceKinds
    ? new Set<ReferenceKind>(input.providerSupportedReferenceKinds)
    : undefined;
  const maxProviderReferences = input.maxProviderReferences ?? DEFAULT_MAX_PROVIDER_REFERENCES;
  const conflicts: PromptBindingConflict[] = [];
  const roleScopes: PromptBindingRoleScope[] = [];
  const providerReferences: ProviderReference[] = [];
  const seenExactReferences = new Set<string>();

  for (const reference of sortedReferences) {
    const duplicateKey = exactReferenceKey(reference);
    const duplicate = seenExactReferences.has(duplicateKey);
    if (!duplicate) {
      seenExactReferences.add(duplicateKey);
    }

    const decision = providerDecision({
      reference,
      duplicate,
      supportedKinds,
      maxProviderReferences,
      currentProviderReferenceCount: providerReferences.length
    });

    conflicts.push(...decision.conflicts);
    roleScopes.push(roleScopeForReference(reference, decision.include, decision.providerFilterReason));

    if (decision.include) {
      providerReferences.push(toProviderReference(reference));
    }
  }

  conflicts.push(...riskConflicts(sortedReferences, input.risks ?? []));
  const audioVideoConflict = buildAudioVideoScopeConflict(sortedReferences);
  if (audioVideoConflict) {
    conflicts.push(audioVideoConflict);
  }

  return {
    sortedReferences,
    providerReferences,
    roleScopes,
    conflicts,
    referenceLines: sortedReferences.map(describeReferenceBinding),
    compressionNotes: COMPRESSION_NOTES
  };
}

export function toProviderReferences(references: readonly PromptReference[]): readonly ProviderReference[] {
  return buildPromptBindingPlan({ references }).providerReferences;
}

export function describeReferenceBindings(references: readonly PromptReference[]): readonly string[] {
  return buildPromptBindingPlan({ references }).referenceLines;
}

export function describeReferenceBindingsFromPlan(plan: PromptBindingPlan): readonly string[] {
  return plan.referenceLines;
}

function compareReferencesForPrompt(left: PromptReference, right: PromptReference): number {
  const roleDelta = ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role];
  if (roleDelta !== 0) {
    return roleDelta;
  }
  if (left.priority !== right.priority) {
    return left.priority === "primary" ? -1 : 1;
  }
  return left.label.localeCompare(right.label);
}

function providerDecision(input: {
  readonly reference: PromptReference;
  readonly duplicate: boolean;
  readonly supportedKinds: ReadonlySet<ReferenceKind> | undefined;
  readonly maxProviderReferences: number;
  readonly currentProviderReferenceCount: number;
}): {
  readonly include: boolean;
  readonly providerFilterReason?: string;
  readonly conflicts: readonly PromptBindingConflict[];
} {
  const conflicts: PromptBindingConflict[] = [];

  if (input.duplicate) {
    conflicts.push(
      conflict({
        status: "warn",
        code: "duplicate_role_reference",
        reference: input.reference,
        message: "Duplicate exact reference was filtered after the first deterministic occurrence.",
        repair: "Keep one canonical reference asset or give duplicates distinct labels and scopes."
      })
    );
    return {
      include: false,
      providerFilterReason: "duplicate exact reference already kept",
      conflicts
    };
  }

  if (input.reference.role === "source_video_structure") {
    conflicts.push(
      conflict({
        status: "info",
        code: "source_video_structure_planning_only",
        reference: input.reference,
        message: "Source-video structure is retained for planning/prose but not sent as provider input by default.",
        repair: "Only enable provider submission when the selected provider explicitly supports this role."
      })
    );
    return {
      include: false,
      providerFilterReason: "planning-only reference role",
      conflicts
    };
  }

  if (input.supportedKinds && !input.supportedKinds.has(input.reference.providerReference.kind)) {
    conflicts.push(
      conflict({
        status: input.reference.priority === "primary" ? "repair" : "warn",
        code: "unsupported_provider_reference_kind",
        reference: input.reference,
        message: "Reference is important to prompt fidelity but cannot be submitted to the selected provider.",
        repair: "Convert the source asset into a supported kind, route to a provider mode that supports it, or simplify the shot."
      })
    );
    return {
      include: false,
      providerFilterReason: `provider does not support reference kind ${input.reference.providerReference.kind}`,
      conflicts
    };
  }

  if (input.currentProviderReferenceCount >= input.maxProviderReferences) {
    conflicts.push(
      conflict({
        status: input.reference.priority === "primary" ? "repair" : "warn",
        code: "provider_reference_limit_exceeded",
        reference: input.reference,
        message: "Reference was retained in prompt planning but not submitted to the provider because the limit was reached.",
        repair: "Reduce supporting references or promote only the minimum identity/product/endpoint anchors."
      })
    );
    return {
      include: false,
      providerFilterReason: `provider reference limit ${input.maxProviderReferences} reached`,
      conflicts
    };
  }

  return {
    include: true,
    conflicts
  };
}

function riskConflicts(
  sortedReferences: readonly PromptReference[],
  risks: readonly ContinuityRisk[]
): readonly PromptBindingConflict[] {
  const conflicts: PromptBindingConflict[] = [];
  const roles = new Set(sortedReferences.map((reference) => reference.role));

  if (risks.includes("face") && !roles.has("identity")) {
    conflicts.push({
      status: "repair",
      code: "identity_reference_missing",
      message: "Shot declares face risk but has no identity reference.",
      repair: "Attach an approved identity reference before provider spend."
    });
  }

  if (risks.includes("product_logo") && !roles.has("product")) {
    conflicts.push({
      status: "repair",
      code: "product_reference_missing",
      message: "Shot declares product-logo risk but has no product reference.",
      repair: "Attach an approved product/logo reference before provider spend."
    });
  }

  return conflicts;
}

function buildAudioVideoScopeConflict(sortedReferences: readonly PromptReference[]): PromptBindingConflict | undefined {
  const hasAudioReference = sortedReferences.some((reference) => reference.providerReference.kind === "audio");
  const hasVisualAnchor = sortedReferences.some((reference) =>
    ["identity", "product", "first_frame", "last_frame", "camera"].includes(reference.role)
  );
  if (!hasAudioReference || !hasVisualAnchor) {
    return undefined;
  }

  return {
    status: "info",
    code: "audio_video_scope_conflict",
    message: "Audio and visual references are both present and must stay scoped.",
    repair: "Keep audio references limited to rhythm/voice and preserve visual anchors for identity/product/camera."
  };
}

function roleScopeForReference(
  reference: PromptReference,
  providerIncluded: boolean,
  providerFilterReason: string | undefined
): PromptBindingRoleScope {
  return {
    role: reference.role,
    label: reference.label,
    priority: reference.priority,
    scope: ROLE_SCOPE[reference.role],
    providerReferenceKind: reference.providerReference.kind,
    providerIncluded,
    ...(providerFilterReason ? { providerFilterReason } : {})
  };
}

function toProviderReference(reference: PromptReference): ProviderReference {
  return {
    ...reference.providerReference,
    role: reference.role,
    label: reference.label
  };
}

function describeReferenceBinding(reference: PromptReference): string {
  const assetLabel = reference.providerReference.providerAssetId
    ? `asset://${reference.providerReference.providerAssetId}`
    : reference.label;
  return `${reference.role}: use ${assetLabel} as ${reference.priority} reference`;
}

function exactReferenceKey(reference: PromptReference): string {
  return [
    reference.role,
    reference.priority,
    reference.label,
    reference.providerReference.kind,
    reference.providerReference.uri
  ].join("\n");
}

function conflict(input: {
  readonly status: PromptBindingConflict["status"];
  readonly code: PromptBindingConflict["code"];
  readonly reference: PromptReference;
  readonly message: string;
  readonly repair: string;
}): PromptBindingConflict {
  return {
    status: input.status,
    code: input.code,
    role: input.reference.role,
    label: input.reference.label,
    message: input.message,
    repair: input.repair
  };
}
