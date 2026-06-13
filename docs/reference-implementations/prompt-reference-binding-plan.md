# Prompt Reference Binding Plan Reference Implementation

## Status

This is a non-production Reference Implementation for Phase 1: Prompt Fidelity. It must not be imported by runtime code. Its job is to preserve upstream behavior decisions before CineJelly rewrites them into owned TypeScript under `src/`.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `Emily2040/seedance-2.0` | `external/upstream/seedance-2.0` | MIT | Reference workflow, intent-vs-precision tradeoff, first/last frame anchors, directorial handoff discipline, anti-slop compression order. |
| `YouMind-OpenLab/awesome-seedance-2-prompts` | `external/upstream/awesome-seedance-2-prompts` | CC BY 4.0 | Prompt anatomy, cinematic sequencing, timing language, negative constraint placement, consistency-preserving reference descriptions. |

## Behavior To Preserve

1. Reference binding happens before prompt prose is assembled.
2. Ordering is deterministic: identity, product, wardrobe, first frame, last frame, environment, motion, camera, audio tempo, voice, style, then source-video structure.
3. Primary references outrank supporting references inside the same role.
4. Label tie-breaks are stable so repeated compiles do not reorder equivalent references.
5. Source-video structure references are planning guidance by default; do not pass them to the provider unless a provider capability explicitly supports them.
6. Provider filtering is explicit. Unsupported reference kinds are dropped from provider requests but remain visible in the binding plan with a conflict record.
7. Reference overflow is bounded before provider spend. Identity, product, and endpoint anchors are preserved first because they protect continuity.
8. Audio references must stay scoped to audio tempo or voice. They must not override visual identity/product/camera anchors.
9. Missing identity/product references are recorded as repair-oriented conflicts when the shot declares face or product-logo risk.
10. Compression order follows the source prompt discipline: references first, continuity second, subject/action/camera/lighting next, timeline/audio/transition after that, and final constraints last.

## Edge Cases To Preserve

- Empty reference list: compile prompt from the shot contract only and do not produce provider references.
- Duplicate exact reference: keep the first deterministic occurrence and record a duplicate conflict.
- Multiple references with the same role: keep deterministic order and preserve primary before supporting.
- Unsupported provider reference kind: keep it in sorted references and role scopes, drop it from provider references, and record the provider filter reason.
- Too many references: keep the sorted list in the plan, pass only the bounded provider references, and record each overflow item.
- `source_video_structure`: retain as planning/prose guidance, filter from provider references by default, and record an informational conflict.
- Face risk without identity reference: record a repair conflict before render spend.
- Product-logo risk without product reference: record a repair conflict before render spend.

## Reference Implementation

```ts
type Role =
  | "identity"
  | "product"
  | "wardrobe"
  | "first_frame"
  | "last_frame"
  | "environment"
  | "motion"
  | "camera"
  | "audio_tempo"
  | "voice"
  | "style"
  | "source_video_structure";

const rolePriority: Record<Role, number> = {
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

const roleScope: Record<Role, string> = {
  identity: "lock character identity and face continuity",
  product: "lock product geometry, logo, and hero-object continuity",
  wardrobe: "lock costume, fabric, color, and continuity-visible accessories",
  first_frame: "anchor the opening pose/composition",
  last_frame: "anchor the ending pose/composition for transitions",
  environment: "lock location, set dressing, and atmosphere",
  motion: "guide action dynamics without overriding identity/product anchors",
  camera: "guide lens, framing, movement, and composition",
  audio_tempo: "guide audio rhythm only",
  voice: "guide voice character only",
  style: "guide visual style after continuity-critical references",
  source_video_structure: "guide planning and shot structure, not default provider input"
};

function buildPromptBindingPlan(input: {
  references: readonly PromptReference[];
  risks: readonly ContinuityRisk[];
  providerSupportedKinds?: readonly ReferenceKind[];
  maxProviderReferences?: number;
}): PromptBindingPlan {
  const maxProviderReferences = input.maxProviderReferences ?? 8;
  const providerSupportedKinds = input.providerSupportedKinds
    ? new Set(input.providerSupportedKinds)
    : undefined;

  const sortedReferences = [...input.references].sort((left, right) => {
    const roleDelta = rolePriority[left.role] - rolePriority[right.role];
    if (roleDelta !== 0) return roleDelta;
    if (left.priority !== right.priority) {
      return left.priority === "primary" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });

  const conflicts: PromptBindingConflict[] = [];
  const roleScopes: PromptBindingRoleScope[] = [];
  const providerReferences: ProviderReference[] = [];
  const seenExactReferences = new Set<string>();

  for (const reference of sortedReferences) {
    const exactKey = [
      reference.role,
      reference.priority,
      reference.label,
      reference.providerReference.kind,
      reference.providerReference.uri
    ].join("\n");

    let includeProviderReference = true;
    let providerFilterReason: string | undefined;

    if (seenExactReferences.has(exactKey)) {
      includeProviderReference = false;
      providerFilterReason = "duplicate exact reference already kept";
      conflicts.push({
        status: "warn",
        code: "duplicate_role_reference",
        role: reference.role,
        label: reference.label,
        message: "Duplicate exact reference was filtered after the first deterministic occurrence.",
        repair: "Keep one canonical reference asset or give duplicates distinct labels and scopes."
      });
    } else {
      seenExactReferences.add(exactKey);
    }

    if (reference.role === "source_video_structure") {
      includeProviderReference = false;
      providerFilterReason = "planning-only reference role";
      conflicts.push({
        status: "info",
        code: "source_video_structure_planning_only",
        role: reference.role,
        label: reference.label,
        message: "Source-video structure is retained for planning/prose but not sent as provider input by default.",
        repair: "Only enable provider submission when the selected provider explicitly supports this role."
      });
    }

    if (providerSupportedKinds && !providerSupportedKinds.has(reference.providerReference.kind)) {
      includeProviderReference = false;
      providerFilterReason = `provider does not support reference kind ${reference.providerReference.kind}`;
      conflicts.push({
        status: reference.priority === "primary" ? "repair" : "warn",
        code: "unsupported_provider_reference_kind",
        role: reference.role,
        label: reference.label,
        message: "Reference is important to prompt fidelity but cannot be submitted to the selected provider.",
        repair: "Convert the source asset into a supported kind, route to a provider mode that supports it, or simplify the shot."
      });
    }

    if (includeProviderReference && providerReferences.length >= maxProviderReferences) {
      includeProviderReference = false;
      providerFilterReason = `provider reference limit ${maxProviderReferences} reached`;
      conflicts.push({
        status: reference.priority === "primary" ? "repair" : "warn",
        code: "provider_reference_limit_exceeded",
        role: reference.role,
        label: reference.label,
        message: "Reference was retained in prompt planning but not submitted to the provider because the limit was reached.",
        repair: "Reduce supporting references or promote only the minimum identity/product/endpoint anchors."
      });
    }

    roleScopes.push({
      role: reference.role,
      label: reference.label,
      priority: reference.priority,
      providerReferenceKind: reference.providerReference.kind,
      scope: roleScope[reference.role],
      providerIncluded: includeProviderReference,
      providerFilterReason
    });

    if (includeProviderReference) {
      providerReferences.push({
        ...reference.providerReference,
        role: reference.role,
        label: reference.label
      });
    }
  }

  if (input.risks.includes("face") && !sortedReferences.some((reference) => reference.role === "identity")) {
    conflicts.push({
      status: "repair",
      code: "identity_reference_missing",
      message: "Shot declares face risk but has no identity reference.",
      repair: "Attach an approved identity reference before provider spend."
    });
  }

  if (input.risks.includes("product_logo") && !sortedReferences.some((reference) => reference.role === "product")) {
    conflicts.push({
      status: "repair",
      code: "product_reference_missing",
      message: "Shot declares product-logo risk but has no product reference.",
      repair: "Attach an approved product/logo reference before provider spend."
    });
  }

  if (
    sortedReferences.some((reference) => reference.providerReference.kind === "audio") &&
    sortedReferences.some((reference) =>
      ["identity", "product", "first_frame", "last_frame", "camera"].includes(reference.role)
    )
  ) {
    conflicts.push({
      status: "info",
      code: "audio_video_scope_conflict",
      message: "Audio and visual references are both present and must stay scoped.",
      repair: "Keep audio references limited to rhythm/voice and preserve visual anchors for identity/product/camera."
    });
  }

  return {
    sortedReferences,
    providerReferences,
    roleScopes,
    conflicts,
    referenceLines: sortedReferences.map(referenceToPromptLine),
    compressionNotes: [
      { order: 1, section: "references", reason: "bind continuity-critical assets before prose" },
      { order: 2, section: "continuity", reason: "state identity/product/environment constraints after references" },
      { order: 3, section: "subject", reason: "describe scene subject only after anchors are known" },
      { order: 4, section: "action", reason: "action should not override reference anchors" },
      { order: 5, section: "camera", reason: "camera follows subject/action and role-scoped camera refs" },
      { order: 6, section: "lighting", reason: "lighting preserves environment/style consistency" },
      { order: 7, section: "timeline", reason: "long-form beat timing stays compact and ordered" },
      { order: 8, section: "audio", reason: "audio directives are scoped after visual plan" },
      { order: 9, section: "transition", reason: "transition handles depend on endpoints" },
      { order: 10, section: "constraints", reason: "final anti-slop/negative guidance stays last" }
    ]
  };
}
```

## CineJelly Keeps

- Role-first deterministic reference ordering.
- Primary-before-supporting weighting inside each role.
- Planning-only handling for `source_video_structure`.
- Provider filtering as an explicit plan artifact.
- Conflict records for missing identity/product anchors and unsupported provider references.
- Compression notes that explain prompt section order before prompt assembly.

## CineJelly Improves

- Adds typed `PromptBindingPlan` output so downstream Guardian, cost, and provider layers can inspect reference decisions.
- Separates sorted references from provider-submitted references.
- Records role scopes and filter reasons instead of burying decisions inside prompt prose.
- Adds bounded provider reference handling before provider spend.
- Keeps provider-neutral contracts so Atlas Cloud remains default without hardcoding Atlas payloads in prompt logic.

## CineJelly Destinations

- `src/types/prompt.ts`
- `src/prompt_compiler/reference-binding.ts`
- `src/prompt_compiler/prompt-compiler.ts`
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

## Validation Notes

- Verify deterministic ordering with mixed role, priority, and label inputs.
- Verify `source_video_structure` appears in sorted references and prompt lines but not provider references by default.
- Verify overflow drops lower-priority/later-sorted provider references after identity/product/endpoint anchors.
- Verify face/product-logo risks produce repair conflicts when references are missing.
- Verify `npm.cmd run typecheck` passes after the CineJelly rewrite.
- Verify no production runtime import points to `external/upstream/`.
