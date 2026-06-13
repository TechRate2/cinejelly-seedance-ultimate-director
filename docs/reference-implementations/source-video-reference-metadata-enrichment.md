# Reference Implementation: Source Video Reference Metadata Enrichment

Implementation status as of 2026-06-13: CineJelly-owned production foundation implemented in source-video reference metadata enrichment, intake normalization, and reference selection scoring. `npm.cmd run typecheck`, `npm.cmd run build`, and a local source-video reference enrichment smoke check passed. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/VideoAgent` | `external/upstream/videoagent` | MIT top level; nested review required | Decompose source video into bounded scenes, keyframes, camera/pacing/style signals, and graph-usable metadata. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Reference-video analysis and approval-gate concepts are used as behavior notes only; no implementation code is reused. |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Reference selection benefits from camera, composition, scene order, recent keyframe, and character/view evidence. |

## Behavior To Preserve

1. Source-video analysis must be normalized before it enriches references.
2. Caller-provided reference metadata wins over derived metadata.
3. Derived metadata must stay structured in `PromptReference.selection`, not hidden inside prompt prose.
4. Exact keyframe URI matches are stronger than label-only matches.
5. Source-video structure references remain planning guidance unless provider capability filtering later allows them.
6. Scene order must become deterministic `timelineIndex` evidence for reference selection.
7. AGPL OpenMontage concepts may inform approval-gate behavior, but implementation must be CineJelly-owned TypeScript.

## Edge Cases

- No source-video analysis: return references unchanged.
- No scenes: return references unchanged except preserving existing selection metadata.
- `sourceReferenceLabel` matches a `source_video_structure` reference: enrich that reference with first-scene camera/composition and scene id.
- Keyframe URI equals a reference URI: enrich that reference with source scene id, source shot/keyframe id, timeline index, camera id, composition id, and inferred view.
- Existing `selection.authorized`, `cameraId`, `compositionId`, `characterId`, `view`, `timelineIndex`, `sourceShotId`, or `sourceSceneId` must not be overwritten.
- Description contains view terms like front/side/back/three-quarter/over-shoulder: map to known `ReferenceView` values; otherwise use `unknown` only when the reference is identity-like and a character id is available.

## Reference Implementation

```ts
function enrichReferences(input: {
  references: PromptReference[];
  sourceVideoAnalysis?: SourceVideoDeconstruction;
}): PromptReference[] {
  if (!input.sourceVideoAnalysis?.scenes?.length) return input.references;

  const keyframeIndex = new Map<string, { scene: Scene; sceneIndex: number; keyframe: Keyframe; keyframeIndex: number }>();
  for (const [sceneIndex, scene] of input.sourceVideoAnalysis.scenes.entries()) {
    for (const [keyframeIndexValue, keyframe] of (scene.keyframes ?? []).entries()) {
      if (keyframe.uri) {
        keyframeIndex.set(keyframe.uri, { scene, sceneIndex, keyframe, keyframeIndex: keyframeIndexValue });
      }
    }
  }

  return input.references.map((reference) => {
    const exactKeyframe = keyframeIndex.get(reference.providerReference.uri);
    if (exactKeyframe) {
      return mergeSelection(reference, {
        cameraId: normalizeId(exactKeyframe.scene.camera),
        compositionId: compositionId(exactKeyframe.scene),
        characterId: reference.role === "identity" ? normalizeId(reference.label) : undefined,
        view: inferView(`${reference.label} ${exactKeyframe.keyframe.description}`),
        timelineIndex: exactKeyframe.sceneIndex,
        sourceSceneId: exactKeyframe.scene.sceneId,
        sourceShotId: `${exactKeyframe.scene.sceneId}:keyframe:${exactKeyframe.keyframeIndex}`
      });
    }

    if (
      reference.role === "source_video_structure" &&
      reference.label === input.sourceVideoAnalysis.sourceReferenceLabel
    ) {
      const firstScene = input.sourceVideoAnalysis.scenes[0];
      return mergeSelection(reference, {
        cameraId: normalizeId(firstScene.camera),
        compositionId: compositionId(firstScene),
        timelineIndex: 0,
        sourceSceneId: firstScene.sceneId
      });
    }

    return reference;
  });
}
```

## CineJelly Rewrite

- Add a CineJelly-owned `SourceVideoReferenceMetadataEnricher`.
- Wire it inside `IntakeDirector` after `SourceVideoAnalyst.normalize`.
- Keep source-video analysis itself as caller-supplied structured metadata; this implementation does not invent video understanding or call a provider.
- Update `ReferenceSelectionPlanner` normalization so camera/composition matching tolerates punctuation and whitespace differences.
- Record lineage through `DEFAULT_SOURCE_LOGIC_TRANSLATIONS` and `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`.

## Validation Checklist

- No source analysis returns the original references unchanged.
- Exact keyframe URI enriches selection metadata without overwriting explicit caller metadata.
- Matching `sourceReferenceLabel` enriches the `source_video_structure` reference.
- Derived camera/composition ids are bounded and deterministic.
- View inference maps only to known `ReferenceView` values.
- Reference selection smoke shows enriched camera metadata can affect candidate scoring.
- No production runtime import from `external/upstream/`.
