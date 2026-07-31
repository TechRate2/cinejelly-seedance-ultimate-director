# Reference Implementation: Long-Form Planning And Batch Workflow

Implementation status as of 2026-06-19: CineJelly-owned production foundation implemented for stage lifecycle contracts, `ProductionStagePlanner`, DirectorAgent material planning, Production Graph `story_arc -> sequence -> scene -> beat -> shot` evidence, Production Graph `material_sourcing` evidence, sequence-level `long-form-continuity.json` evidence, multi-role `long-form-agent-review.json` evidence, `long-form-timeline.json` timing/postproduction/render-batch evidence, material source validation evidence, review-packet stage lifecycle, render-schedule evidence, and stage/material/schedule/continuity/agent-review/timeline artifacts. Direct `tsc -p tsconfig.json`, `tests/run-render-scheduler-smoke.mjs`, `tests/run-production-graph-sequence-smoke.mjs`, `tests/run-long-form-continuity-smoke.mjs`, `tests/run-long-form-agent-review-smoke.mjs`, and `tests/run-long-form-timeline-smoke.mjs` passed; real long-form Atlas validation remains pending. CineJelly production code must stay CineJelly-owned TypeScript and must not import runtime code from `external/upstream/`.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Long-form decomposition, reference-aware dependency thinking, candidate comparison, and continuity-sensitive sequencing. |
| `HKUDS/VideoAgent` | `external/upstream/videoagent` | Mixed nested dependencies; top-level MIT | Role/tool-style video reasoning, source-video structure discipline, and agentic review-board patterns translated without runtime reuse. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Storyboard-driven project loop, deterministic artifact order, status refresh, build/review reports, narrow repair commands. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | One-input staged pipeline, task progress updates, material sourcing before composition, batch output lifecycle, terminal stage failure visibility. |

## Behavior To Preserve

1. A 2-8 minute request must be decomposed into provider-safe shots before provider spend.
2. Stage order must remain explicit: plan -> storyboard -> prompt -> source_material -> render -> inspect -> repair -> assemble -> deliver.
3. Stage records must be operator-visible and artifact-safe, even when no deliverable is requested.
4. Long-form graph hierarchy must preserve sequence groupings between story arcs and scenes, with deterministic order and duration evidence.
5. Material sourcing must happen as a governed planning stage: rights requirement, allowed sources, search terms, duration, aspect ratio, and candidate limits must be visible.
6. Sequence-level continuity anchors must preserve identity, product, environment, style, source-video scene IDs, risk codes, and bridge intent before render.
7. Agentic long-form review must translate script, continuity, source-video, render orchestration, and commercial-risk review into deterministic findings before provider spend.
8. Long-form timeline evidence must map sequences and shots to timing, render batches, caption coverage, supplied audio, generated-audio intents, and manual-review segments before provider spend.
9. Continuity-sensitive shots render sequentially; independent shots may render concurrently within configured limits.
10. Batch candidates must be traceable: selected candidate, rejected candidates, test-take candidate, repair candidates, and final deliverable evidence.
11. Terminal failures must preserve the narrow failed stage and should not erase earlier stage evidence.
12. Artifacts must be deterministic: stage lifecycle, render schedule, long-form continuity, long-form agent review, long-form timeline, story plan, storyboard, production graph, cost plan, prompts, rendered shots, and deliverable evidence keep stable names.

## Edge Cases

- Empty story plan or no renderable shots: mark `plan` as failed and do not continue to provider spend.
- Storyboard preflight `repair` or `block`: mark `storyboard` as blocked and stop before prompt/render spend.
- Compiled prompts are empty: mark `prompt` as failed.
- Remote material sourcing is disabled: material stage still succeeds with `user_owned` rights requirement and local/user-provided source policy.
- Remote material sourcing is enabled: material briefs must require commercial stock or attribution-safe evidence before candidates can be selected.
- A shot has first-frame, last-frame, source-video, transition, or explicit previous/next continuity: scheduler must keep it sequential.
- A shot has source-video scene/timeline metadata or continuity risk: scheduler must record the exact sequential reason, not only serialize it implicitly.
- A render candidate fails but a repair candidate succeeds: stage `repair` is succeeded and rejected candidate evidence remains in rendered shot artifacts.
- No output path is provided: `assemble` and `deliver` are skipped, not failed.
- Delivery gate blocks: `deliver` is blocked while render/inspect evidence remains inspectable.

## Reference Implementation

```ts
type StageName =
  | "plan"
  | "storyboard"
  | "prompt"
  | "source_material"
  | "render"
  | "inspect"
  | "repair"
  | "assemble"
  | "deliver";

type StageStatus = "pending" | "running" | "succeeded" | "warn" | "blocked" | "failed" | "skipped";

interface StageRecord {
  stage: StageName;
  order: number;
  status: StageStatus;
  graphNodeIds: readonly string[];
  evidence: Record<string, string | number | boolean>;
  sourcePatternOrigins: readonly string[];
  blockingReason?: string;
}

function createMaterialPlan(input: { projectId: string; shots: ShotContract[]; settings: Settings }): MaterialSourcingPlan {
  return {
    planId: stableId("material_plan", input.projectId),
    sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo"],
    briefs: input.shots.map((shot) => ({
      shotId: shot.shotId,
      purpose: inferMaterialPurpose(shot),
      queryTerms: weightedTerms([shot.subject, shot.intent, shot.action, shot.style]),
      preferredSources: input.allowRemoteSources ? ["user_provided", "local_library", "pexels", "pixabay", "coverr"] : ["user_provided", "local_library"],
      rightsRequirement: input.allowRemoteSources ? "commercial_stock" : "user_owned",
      targetDurationSeconds: ceil(shot.durationSeconds),
      maxCandidates: countForQuality(input.settings.qualityMode)
    }))
  };
}

function createStagePlan(input: RuntimeEvidence): StagePlan {
  return {
    planId: stableId("stage_plan", input.projectId),
    projectId: input.projectId,
    records: [
      stage("plan", input.storyPlan.scenes.length > 0 && input.shots.length > 0 ? "succeeded" : "failed", {
        sceneCount: input.storyPlan.scenes.length,
        shotCount: input.shots.length,
        targetDurationSeconds: input.storyPlan.targetDurationSeconds
      }),
      stage("storyboard", guardianToStage(input.storyboardPreflight.status), {
        storyboardPanelCount: input.storyboard.panels.length
      }),
      stage("prompt", input.compiledPrompts.length > 0 ? "succeeded" : "failed", {
        compiledPromptCount: input.compiledPrompts.length
      }),
      stage("source_material", "succeeded", {
        materialBriefCount: input.materialPlan.briefs.length,
        remoteSourcesAllowed: input.materialPlan.briefs.some((brief) => brief.allowRemoteSources),
        rightsRequirements: unique(input.materialPlan.briefs.map((brief) => brief.rightsRequirement)).join(",")
      }),
      stage("render", renderStatus(input.renderedShots), {
        renderedShotCount: input.renderedShots.length,
        totalCandidateCount: totalCandidates(input.renderedShots)
      }),
      stage("inspect", inspectionStatus(input.renderedShots), {
        blockingInspectionCount: countBlockingInspections(input.renderedShots)
      }),
      stage("repair", repairStatus(input.renderedShots), {
        repairAttemptCount: totalRepairAttempts(input.renderedShots)
      }),
      stage("assemble", input.deliverable ? "succeeded" : "skipped", {
        hasDeliverable: Boolean(input.deliverable)
      }),
      stage("deliver", deliveryStatus(input.deliveryGate), {
        deliveryGateStatus: input.deliveryGate?.status ?? "not_run"
      })
    ]
  };
}
```

## CineJelly Translation Plan

- Add `ProductionStagePlan` contracts under `src/types/stage.ts`.
- Add a CineJelly-owned `ProductionStagePlanner` under `src/core/production-stage-planner.ts`.
- Instantiate `MaterialSourcingPlanner` in `DirectorAgent` after reference selection and before Production Graph build.
- Wire `MaterialSourcingPlan` into `ProductionGraphBuilder` as a `material_sourcing` node with rights metadata from each brief.
- Wire deterministic `sequence` nodes into `ProductionGraphBuilder` so scene and shot evidence follows the documented long-form hierarchy.
- Include stage lifecycle, material sourcing plan, and material source validation report in `DirectorRunResult`, review packet, and artifact payloads.
- Include render schedule evidence in `DirectorRunResult`, run summary, and `render-schedule.json` artifact payloads.
- Build `LongFormContinuityPlan` after reference selection and before Production Graph persistence so review packets and artifacts can inspect sequence anchors, bridge intent, source-video scene IDs, and high-risk sequential recommendations.
- Build `LongFormAgentReviewPlan` after continuity planning and before prompt compilation so blocking sequence/story/source-video defects stop provider spend while warning findings remain manual-review directives.
- Build `LongFormTimelinePlan` after render scheduling and postproduction planning so review packets and artifacts can inspect sequence timing, render batches, manual-review segments, caption coverage, supplied audio, and generated-audio intent placement before provider spend.
- Keep RenderScheduler's dependency ordering as the first implementation of source-video, transition, and continuity-sensitive sequential render behavior.
- Preserve candidate evidence through existing `RenderedShot.candidates` and Production Graph run recorder.

## Validation Checklist

- Stage plan contains all nine stages in deterministic order.
- Material sourcing stage exists even when remote sourcing is disabled.
- Each material brief records rights requirement, preferred sources, target duration, aspect ratio, resolution, and max candidates.
- Material source validation report records planned-only, approved, review-required, or rejected status for adapter candidates.
- Production Graph contains deterministic sequence nodes between story arc and scenes, with documented sequence-count behavior for short and long fixtures.
- Production Graph contains a material sourcing node linked to project and shots.
- Review packet and run artifacts expose stage lifecycle without local paths or raw provider payloads.
- Run artifacts expose `render-schedule.json` with batch IDs, source order, parallel/sequential mode, reference roles, risk codes, continuity fields, and sequential reasons.
- Run artifacts expose `long-form-continuity.json` with deterministic sequence counts, bridge counts, global anchors, source-video scene IDs, high-risk sequence counts, and per-sequence render-mode recommendations.
- Run artifacts expose `long-form-agent-review.json` with five role decisions, findings, blocker counts, no-spend boundaries, source-pattern lineage, and release gates that never approve customer traffic.
- Run artifacts expose `long-form-timeline.json` with deterministic segment timing, sequence timing boundaries, render batch IDs, sequential reasons, caption coverage, supplied-audio role coverage, generated-audio intent coverage, manual-review segment counts, no-spend boundaries, and release gates that never approve customer traffic.
- Sequential render behavior is still driven by first/last frame, previous/next continuity, source-video/timeline structure, transition intent, and continuity risk.
- `tests/run-production-graph-sequence-smoke.mjs` passes for one-scene, 120-second, and 480-second graph fixtures without provider calls.
- `tests/run-render-scheduler-smoke.mjs` passes for bounded parallel batches, endpoint references, source-video structure/timeline, continuity risk, transition intent, and stable source order.
- `tests/run-long-form-continuity-smoke.mjs` passes for a 120-second fixture with sequence bridges, global anchors, source-video scene anchors, risk-driven sequential recommendations, and raw provider URL leak checks.
- `tests/run-long-form-agent-review-smoke.mjs` passes for a 120-second review-required fixture and an under-sequenced blocked fixture without network or provider calls.
- `tests/run-long-form-timeline-smoke.mjs` passes for ready and missing-schedule blocked fixtures with caption/audio/generated-audio timing coverage and raw provider URL leak checks.
- No production import path references `external/upstream`.
- Source lineage is added to `DEFAULT_SOURCE_LOGIC_TRANSLATIONS` after implementation.
