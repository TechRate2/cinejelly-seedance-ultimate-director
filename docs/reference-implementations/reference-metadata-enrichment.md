# Reference Implementation: Reference Metadata Enrichment

Implementation status as of 2026-06-13: CineJelly-owned production foundation implemented in `ReferenceLibrarian` and API admission. `npm.cmd run typecheck`, `npm.cmd run build`, a local reference-selection smoke check, and an invalid-view admission smoke check passed. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Reference selection depends on camera, composition, recency, character identity, and view evidence before candidate scoring. |
| `HKUDS/VideoAgent` | `external/upstream/videoagent` | MIT top level; nested review required | Video/source analysis should expose bounded scene, camera, and temporal structure as planning metadata rather than opaque prompt prose. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Reference-video analysis and approval-gate concepts inform metadata boundaries only; no implementation code is reused. |

## Behavior To Preserve

1. Reference selection metadata must be normalized before story, graph, prompt, or provider spend.
2. Camera/composition/character/view/timeline evidence must remain structured fields, not free-text prompt fragments.
3. Unauthorized references must remain explicit so selection can drop them before provider request compilation.
4. Invalid selection metadata must fail admission or intake early, not silently change scoring.
5. Metadata must improve deterministic scoring but must not create a runtime dependency on `external/upstream/`.
6. Source-video analysis can guide metadata design, but production code must preserve only bounded fields accepted by CineJelly contracts.

## Edge Cases

- Missing `selection` metadata: keep the reference valid; scoring falls back to role, priority, risk, and stable tie-break order.
- Unknown `view`: reject it at API admission/intake rather than widening duplicate handling unpredictably.
- Negative or fractional `timelineIndex`: reject before scoring because recency ordering depends on integer shot order.
- `authorized: false`: preserve the field so Reference Selection can drop the reference with `unauthorized_reference`.
- Overlong IDs: reject bounded metadata before any LLM/provider work.
- AGPL-sourced concepts: use behavior notes only unless legal review approves a stronger reuse path.

## Reference Implementation

```ts
type RawSelection = {
  cameraId?: string;
  compositionId?: string;
  characterId?: string;
  view?: "front" | "side" | "back" | "three_quarter" | "over_the_shoulder" | "unknown";
  timelineIndex?: number;
  sourceShotId?: string;
  sourceSceneId?: string;
  authorized?: boolean;
};

function normalizeSelection(raw: unknown): PromptReferenceSelectionMetadata | undefined {
  if (raw === undefined) return undefined;
  assertObject(raw);

  const selection = {
    cameraId: optionalBoundedString(raw.cameraId),
    compositionId: optionalBoundedString(raw.compositionId),
    characterId: optionalBoundedString(raw.characterId),
    view: optionalKnownView(raw.view),
    timelineIndex: optionalNonNegativeInteger(raw.timelineIndex),
    sourceShotId: optionalBoundedString(raw.sourceShotId),
    sourceSceneId: optionalBoundedString(raw.sourceSceneId),
    authorized: optionalBoolean(raw.authorized)
  };

  return removeUndefined(selection);
}

function normalizeReference(reference: RawReference): PromptReference {
  const providerReference = normalizeProviderReference(reference.providerReference);
  const selection = normalizeSelection(reference.selection);

  return {
    role: normalizeRole(reference.role, providerReference.kind),
    label: normalizedLabel(reference.label),
    priority: normalizedPriority(reference.priority),
    providerReference,
    ...(selection ? { selection } : {})
  };
}
```

## CineJelly Rewrite

- `src/api/render-request-admission.ts` validates optional `references[].selection` before queue admission, runtime creation, LLM planning, or provider spend.
- `src/agents/reference-librarian.ts` preserves normalized `PromptReferenceSelectionMetadata` from accepted references.
- `src/core/reference-selection-planner.ts` continues to consume `cameraId`, `compositionId`, `characterId`, `view`, `timelineIndex`, and `authorized` through its existing deterministic scoring and drop rules.
- `src/types/prompt.ts` remains the shared contract for reference selection metadata; production code must extend that contract rather than pass source-specific payloads around.

## Validation Checklist

- API admission rejects malformed `selection` objects.
- Intake preserves valid `selection` metadata on `PromptReference`.
- Unauthorized references reach `ReferenceSelectionPlanner` as `authorized: false` and are dropped before provider request compilation.
- Same-camera, same-composition, recent-prior-frame, and duplicate character/view scoring still use typed metadata fields.
- No code imports from `external/upstream/`.
- Source lineage is recorded in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` and runtime `sourceLineage`.
