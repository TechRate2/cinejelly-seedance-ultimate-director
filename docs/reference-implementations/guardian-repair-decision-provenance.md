# Guardian Repair Decision Provenance Reference Implementation

## Status

This is a non-production Reference Implementation for Phase 2: Guardian Repair Provenance. It must not be imported by runtime code. It captures the behavior CineJelly should preserve before extending Guardian reports, review packets, and Production Graph run evidence.

Implementation status as of 2026-06-13: CineJelly-owned production code now emits `repairScope`, `affectedNodeIds`, `sourceCheckpoints`, and `recommendedNextStep` through Guardian reports, Production Graph inspection/repair nodes, review packet `repairProvenance`, and runtime source lineage records.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Reference image selection guidance, same-camera priority, recent prior-frame priority, duplicate suppression, max 8 references, session stale-state tracking. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | CLI-first validate/plan/cost/build/render/inspect/repair loop, JSON reports, dry-run/cost gates, deterministic build and review artifacts, targeted scene repair commands. |

## Behavior To Preserve

1. Validate structured planning artifacts before provider spend.
2. Keep repair scope as narrow as possible: prompt, reference binding, storyboard, shot, render, or delivery.
3. Treat storyboard coverage and duplicate panels as planning/storyboard repairs, not render retries.
4. Treat provider failed/canceled/timeout status as a rerender of the affected shot, not a full project restart.
5. Treat missing output URL as delivery/render blocking evidence with provider diagnostics.
6. Preserve warnings in operator artifacts without blocking delivery.
7. Record provenance for every repair decision: upstream source family, checkpoint, affected graph node, selected repair scope, and CineJelly destination module.
8. Preserve ViMax reference-selection priorities for future Phase 3 integration: same camera/composition, recent prior frame, one portrait per character/view, duplicate suppression, maximum 8 selected references.
9. Preserve VibeFrame loop order: validate -> plan/cost -> dry-run/preflight -> build/render -> inspect -> repair -> refresh status.
10. Ensure review artifacts explain why CineJelly repairs only one prompt, storyboard node, shot, or delivery gate instead of regenerating the whole project.

## Edge Cases To Preserve

- Missing storyboard panel: block render and repair storyboard coverage only.
- Unknown storyboard shot ID: block render and repair storyboard graph alignment only.
- Duplicate storyboard panel: repair storyboard only.
- Storyboard duration/action/camera/lighting mismatch: repair storyboard panel from the approved shot contract.
- Prompt too dense: repair prompt before provider spend.
- Negative prompt too broad: warn or repair prompt, depending on severity.
- Binding conflict from `PromptBindingPlan`: repair prompt/reference binding before provider spend.
- Provider prediction failed/canceled/timeout: rerender affected shot only.
- Output URL missing after success: block delivery and rerender affected shot after diagnostics.
- Test-take failure: repair prompt or block full render before spending on final candidates.
- Multiple candidates: select the best passing candidate before rerendering.
- Warnings: include in review packet and routing evidence, but do not block delivery.

## Reference Implementation

```ts
type RepairScope =
  | "none"
  | "prompt"
  | "reference_binding"
  | "storyboard"
  | "shot"
  | "render"
  | "delivery";

interface RepairProvenanceFinding {
  stage: GuardianStage;
  status: GuardianStatus;
  severity: GuardianSeverity;
  checkpoint: string;
  evidence: string;
  repair: string;
  repairScope: RepairScope;
  affectedNodeIds: readonly string[];
  sourceCheckpoints: readonly SourceCheckpoint[];
}

interface SourceCheckpoint {
  sourceRepository: "HKUDS/ViMax" | "vericontext/vibeframe" | "CineJelly";
  sourcePath: string;
  behavior: string;
  cineJellyDestination: string;
}

function guardianRepairDecision(input: GuardianInspectionInput): GuardianReport {
  const findings: RepairProvenanceFinding[] = [];

  findings.push(...validateStoryboardCoverage(input));
  findings.push(...validateStoryboardContractAlignment(input));
  findings.push(...validatePromptAndBindingPlan(input));
  findings.push(...validateRenderPrediction(input));
  findings.push(...validateDeliveryEvidence(input));

  return {
    nodeId: input.nodeId,
    stage: input.stage,
    status: rollupStatus(findings),
    findings,
    repairScope: narrowestRepairScope(findings),
    affectedNodeIds: unique(findings.flatMap((finding) => finding.affectedNodeIds)),
    sourceCheckpoints: uniqueSourceCheckpoints(findings.flatMap((finding) => finding.sourceCheckpoints)),
    recommendedNextStep: recommendedNextStep(findings)
  };
}

function narrowestRepairScope(findings: readonly RepairProvenanceFinding[]): RepairScope {
  if (findings.length === 0) return "none";
  if (findings.some((finding) => finding.repairScope === "delivery")) return "delivery";
  if (findings.some((finding) => finding.repairScope === "render")) return "render";
  if (findings.some((finding) => finding.repairScope === "shot")) return "shot";
  if (findings.some((finding) => finding.repairScope === "storyboard")) return "storyboard";
  if (findings.some((finding) => finding.repairScope === "reference_binding")) return "reference_binding";
  if (findings.some((finding) => finding.repairScope === "prompt")) return "prompt";
  return "none";
}

function recommendedNextStep(findings: readonly RepairProvenanceFinding[]): string {
  const blocking = findings.find((finding) =>
    ["block", "rerender", "repair"].includes(finding.status)
  );
  if (!blocking) return "Continue production; warnings are recorded for review.";

  switch (blocking.repairScope) {
    case "storyboard":
      return "Regenerate or repair only the affected storyboard panel(s), then rerun storyboard preflight.";
    case "reference_binding":
      return "Repair prompt reference bindings before provider spend, then rerun Guardian preflight.";
    case "prompt":
      return "Compress or rewrite only the affected prompt, then rerun Guardian preflight.";
    case "shot":
    case "render":
      return "Rerender only the affected shot node after preserving approved prompt and reference decisions.";
    case "delivery":
      return "Block customer delivery, inspect render/provider diagnostics, and rebuild only affected deliverable evidence.";
    case "none":
      return "No repair is required.";
  }
}

function validateReferenceSelectionForFuturePhase(input: ReferenceSelectionInput): ReferenceSelectionEvidence {
  const candidates = input.references
    .map((reference) => ({
      reference,
      scoreReasons: [
        reference.cameraId === input.targetCameraId ? "same_camera" : undefined,
        reference.timelineIndex < input.targetTimelineIndex ? "prior_frame" : undefined,
        reference.isPortrait ? "portrait_candidate" : undefined
      ].filter(Boolean),
      score:
        (reference.cameraId === input.targetCameraId ? 100 : 0) +
        Math.max(0, input.targetTimelineIndex - reference.timelineIndex) +
        (reference.isPortrait ? 10 : 0)
    }))
    .sort((left, right) => right.score - left.score);

  return {
    selected: dedupeByCharacterViewAndRole(candidates).slice(0, 8),
    droppedDuplicates: duplicateEvidence(candidates),
    sourceCheckpoints: [
      {
        sourceRepository: "HKUDS/ViMax",
        sourcePath: "external/upstream/vimax/agents/reference_image_selector.py",
        behavior: "same-camera, recent prior-frame, duplicate-suppressed, max-8 reference selection",
        cineJellyDestination: "future src/core/reference-selection-planner.ts"
      }
    ]
  };
}
```

## CineJelly Keeps

- Guardian status rollup remains deterministic.
- Storyboard repairs stay separate from render retries.
- Provider failures rerender affected shots rather than the whole project.
- Prompt/reference binding conflicts are handled before provider spend.
- Review artifacts receive enough provenance to explain repair scope and next action.

## CineJelly Improves

- Adds typed provenance fields to Guardian reports instead of burying repair rationale in free text.
- Maps upstream-inspired checkpoints to CineJelly destination modules.
- Makes narrow repair scope machine-readable for DirectorAgent, Production Graph, and review packets.
- Leaves ViMax reference scoring as Phase 3 while preserving the behavior map now.

## CineJelly Destinations

- `src/types/guardian.ts`
- `src/core/consistency-guardian.ts`
- `src/core/review-packet-builder.ts`
- `src/core/production-graph-run-recorder.ts`
- `src/types/graph.ts`
- `src/types/review.ts`
- `src/core/source-logic-translation-records.ts`
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

## Validation Notes

- Verify missing storyboard panel blocks render and recommends storyboard-only repair.
- Verify duplicate storyboard panel recommends storyboard repair, not rerender.
- Verify binding conflicts recommend prompt/reference binding repair before provider spend.
- Verify failed provider prediction recommends rerendering only the affected shot node.
- Verify missing output URL blocks delivery and records render/delivery provenance.
- Verify warnings remain visible in review packet evidence without blocking delivery.
- Verify Production Graph repair nodes preserve narrow repair scope and affected node IDs.
- Verify review packet `repairProvenance` includes recommended next steps and source repositories.
- Verify `npm.cmd run typecheck` passes after the CineJelly rewrite.
- Verify no production runtime import points to `external/upstream/`.
