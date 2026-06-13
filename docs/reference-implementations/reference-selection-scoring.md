# Reference Selection Scoring Reference Implementation

## Status

This is a non-production Reference Implementation for Phase 3: Reference Selection Scoring. It must not be imported by runtime code. Its job is to preserve the ViMax reference-selection behavior before CineJelly rewrites it into owned TypeScript under `src/`.

Implementation status as of 2026-06-13: CineJelly-owned production code now emits `ReferenceSelectionPlan`, runs `ReferenceSelectionPlanner` before storyboard/prompt compilation, records Production Graph `reference_selection` evidence, and lets Prompt Compiler consume selected references before `PromptBindingPlan`.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/ViMax` | `external/upstream/vimax/agents/reference_image_selector.py` | MIT | Same-camera/composition priority, recent prior-frame priority, one portrait per character/view, duplicate suppression, max 8 selected references. |
| `HKUDS/ViMax` | `external/upstream/vimax/agent_runtime/session_index.py` | MIT | Stale artifact awareness and evidence-driven regeneration boundaries. |

## Behavior To Preserve

1. Score candidate references before provider request compilation.
2. Prefer references with the same camera or composition as the target shot.
3. Prefer recent prior-frame references over older scene references.
4. Prefer authorized identity/product/endpoint references when the shot has face, product-logo, or transition risks.
5. Allow at most one identity portrait per character/view so duplicate face references do not overload prompts.
6. Drop exact duplicates before max-reference bounding.
7. Bound selected references to a maximum of 8 before provider request compilation.
8. Keep evidence for every candidate: score, score reasons, selected/dropped status, and drop reason.
9. Preserve selected references on the shot contract so Storyboard, Prompt Compiler, Guardian, and Production Graph all see the same narrowed reference set.
10. Keep the original full candidate set in a `ReferenceSelectionPlan` for audit and repair decisions.

## Edge Cases To Preserve

- No references: return an empty selected set and no dropped candidates.
- More than 8 references: keep the highest-scored candidates, preserving identity/product/first-frame/last-frame anchors ahead of generic style/support refs.
- Same URI/role/label duplicate: keep the first highest-scored candidate and drop later exact duplicates.
- Same character and same view identity portrait: keep the highest-scored portrait only.
- Unauthorized reference: drop before scoring can select it.
- New character or face risk: identity references receive strong priority.
- Product-logo risk: product references receive strong priority.
- Transition risk: first/last frame anchors receive strong priority.
- Prior frame from immediately previous shot: outranks older prior frames.
- Missing timeline metadata: fall back to role priority, primary/supporting priority, and stable label order.

## Reference Implementation

```ts
type SelectionReason =
  | "primary_priority"
  | "same_camera"
  | "same_composition"
  | "recent_prior_frame"
  | "identity_risk_anchor"
  | "product_risk_anchor"
  | "transition_endpoint_anchor"
  | "role_priority"
  | "stable_tiebreak";

type DropReason =
  | "unauthorized_reference"
  | "duplicate_exact_reference"
  | "duplicate_character_view"
  | "max_selected_references_exceeded";

function selectReferencesForShot(input: {
  shot: ShotContract;
  shotIndex: number;
  maxSelectedReferences?: number;
}): ReferenceSelectionPlan {
  const maxSelectedReferences = input.maxSelectedReferences ?? 8;
  const candidates = input.shot.references.map((reference, originalIndex) => {
    const reasons: SelectionReason[] = [];
    let score = roleBaseScore(reference.role);

    if (reference.priority === "primary") {
      score += 50;
      reasons.push("primary_priority");
    }

    if (cameraMatches(reference.selection?.cameraId, input.shot.camera)) {
      score += 40;
      reasons.push("same_camera");
    }

    if (reference.selection?.compositionId && reference.selection.compositionId === input.shot.metadata?.compositionId) {
      score += 35;
      reasons.push("same_composition");
    }

    if (reference.selection?.timelineIndex !== undefined && reference.selection.timelineIndex < input.shotIndex) {
      score += Math.max(1, 30 - (input.shotIndex - reference.selection.timelineIndex) * 3);
      reasons.push("recent_prior_frame");
    }

    if (input.shot.risks.includes("face") && reference.role === "identity") {
      score += 60;
      reasons.push("identity_risk_anchor");
    }

    if (input.shot.risks.includes("product_logo") && reference.role === "product") {
      score += 60;
      reasons.push("product_risk_anchor");
    }

    if (input.shot.risks.includes("transition") && ["first_frame", "last_frame"].includes(reference.role)) {
      score += 45;
      reasons.push("transition_endpoint_anchor");
    }

    reasons.push("role_priority", "stable_tiebreak");

    return {
      reference,
      originalIndex,
      score,
      scoreReasons: reasons
    };
  });

  const ranked = candidates.sort((left, right) =>
    right.score - left.score ||
    rolePriority(left.reference.role) - rolePriority(right.reference.role) ||
    left.reference.label.localeCompare(right.reference.label) ||
    left.originalIndex - right.originalIndex
  );

  const selected: ReferenceSelectionCandidate[] = [];
  const dropped: ReferenceSelectionCandidate[] = [];
  const exactKeys = new Set<string>();
  const characterViewKeys = new Set<string>();

  for (const candidate of ranked) {
    const exactKey = exactReferenceKey(candidate.reference);
    if (candidate.reference.selection?.authorized === false) {
      dropped.push({ ...candidate, selected: false, dropReason: "unauthorized_reference" });
      continue;
    }
    if (exactKeys.has(exactKey)) {
      dropped.push({ ...candidate, selected: false, dropReason: "duplicate_exact_reference" });
      continue;
    }
    exactKeys.add(exactKey);

    const characterViewKey = identityCharacterViewKey(candidate.reference);
    if (characterViewKey && characterViewKeys.has(characterViewKey)) {
      dropped.push({ ...candidate, selected: false, dropReason: "duplicate_character_view" });
      continue;
    }
    if (characterViewKey) {
      characterViewKeys.add(characterViewKey);
    }

    if (selected.length >= maxSelectedReferences) {
      dropped.push({ ...candidate, selected: false, dropReason: "max_selected_references_exceeded" });
      continue;
    }

    selected.push({ ...candidate, selected: true });
  }

  return {
    shotId: input.shot.shotId,
    maxSelectedReferences,
    candidateCount: candidates.length,
    selectedReferences: selected.map((candidate) => candidate.reference),
    candidates: selected.concat(dropped)
  };
}
```

## CineJelly Keeps

- Same-camera/composition priority.
- Recent prior-frame priority.
- Identity/product/endpoint anchors before generic supporting references.
- Duplicate suppression before max-reference bounding.
- One identity portrait per character/view.
- Max 8 selected references before provider request compilation.

## CineJelly Improves

- Adds typed `ReferenceSelectionPlan` evidence to shot contracts.
- Keeps both selected references and dropped candidate evidence for Production Graph review.
- Lets Prompt Compiler consume selected references without losing the original candidate audit trail.
- Keeps provider filtering in `PromptBindingPlan`, after reference selection has narrowed the set.

## CineJelly Destinations

- `src/types/prompt.ts`
- `src/core/reference-selection-planner.ts`
- `src/core/production-graph-builder.ts`
- `src/prompt_compiler/prompt-compiler.ts`
- `src/agents/director-agent.ts`
- `src/core/source-logic-translation-records.ts`
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

## Validation Notes

- Verify same-camera references outrank generic references.
- Verify immediately prior-frame references outrank older prior-frame references.
- Verify identity/product/endpoint anchors survive max-reference bounding.
- Verify exact duplicates and duplicate identity character/view references are dropped.
- Verify unauthorized references are dropped before provider request compilation.
- Verify selected references replace raw references for Storyboard and Prompt Compiler, while candidate evidence remains in `ReferenceSelectionPlan`.
- Verify Production Graph contains selected and dropped reference evidence.
- Verify `npm.cmd run typecheck` passes after the CineJelly rewrite.
- Verify no production runtime import points to `external/upstream/`.
