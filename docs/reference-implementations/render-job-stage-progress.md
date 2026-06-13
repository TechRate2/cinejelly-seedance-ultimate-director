# Reference Implementation: Render Job Stage Progress Telemetry

Implementation status as of 2026-06-13: CineJelly-owned TypeScript foundation implemented in stage contracts, DirectorAgent progress reporting, async render-job polling, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. Real long-form Atlas validation is still required before release.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Long-running task state, progress visibility, stage-oriented API feedback, terminal failure visibility. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic status refresh, build/review report discipline, operator-friendly run evidence. |

## Behavior To Preserve

1. Async render jobs must expose current stage progress while the job is running, not only after artifacts are written.
2. Progress events must use the same stage vocabulary and order as final stage lifecycle evidence: plan, storyboard, prompt, source material, render, inspect, repair, assemble, deliver.
3. Events must be deterministic and bounded: sequence number, stage, order, status, timestamp, message, source-pattern origins, and small numeric/string evidence.
4. Progress events must be artifact/API safe: no local file paths, no raw provider payloads, no credentials, no inline media, and no stack traces.
5. Terminal failures must preserve the latest stage event so operators can see where the job failed even when final `stage-lifecycle.json` cannot be produced.
6. A queued job may have no stage event yet; a running job should report at least the first active stage once orchestration starts.
7. Job list responses should stay compact, while per-job polling can include the detailed progress event list.

## Edge Cases

- Job is queued but not started: `currentStage` is absent and `progressEventCount` is zero.
- Job is canceled while queued: no fake stage progress is created.
- Job is canceled while running: the last real stage remains visible and the job status becomes `canceled`.
- Storyboard preflight blocks before render spend: the storyboard stage records `blocked` before the job fails.
- Prompt compiler produces no prompts: the prompt stage records `failed` before the job fails.
- Source-material validation finds no approved candidates where external material is required: the source-material stage records `blocked` or `warn` before render spend.
- Render candidate failure leads to job failure before final artifacts: render or inspect progress remains available in the job detail response.
- Event count exceeds the retention bound: keep the latest bounded events and preserve `progressEventCount` for retained detail.

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

interface StageProgressEvent {
  sequence: number;
  stage: StageName;
  order: number;
  status: StageStatus;
  recordedAt: Date;
  message: string;
  sourcePatternOrigins: readonly string[];
  evidence?: Record<string, string | number | boolean | readonly string[] | readonly number[]>;
}

function reportStage(stage, status, message, evidence) {
  progressReporter?.({
    sequence: nextSequence(),
    stage,
    order: STAGE_ORDER.indexOf(stage),
    status,
    recordedAt: new Date(),
    message,
    sourcePatternOrigins: STAGE_ORIGINS[stage],
    evidence: redactAndBound(evidence)
  });
}

async function run(request) {
  reportStage("plan", "running", "Planning story and shots.");
  const intake = intakeDirector.intake(request);
  const story = await storyArchitect.plan(intake);
  const shots = shotPlanner.plan(story);
  reportStage("plan", "succeeded", "Plan completed.", { sceneCount: story.scenes.length, shotCount: shots.length });

  reportStage("storyboard", "running", "Planning storyboard panels.");
  const storyboard = storyboardPlanner.plan(shots);
  const preflight = guardian.inspectStoryboard(storyboard);
  reportStage("storyboard", guardianToStage(preflight.status), "Storyboard preflight completed.", {
    panelCount: storyboard.panels.length,
    status: preflight.status
  });
  if (isBlocking(preflight.status)) throw new Error("Storyboard blocked.");

  reportStage("prompt", "running", "Compiling prompts.");
  const prompts = shots.map(compile);
  if (prompts.length === 0) {
    reportStage("prompt", "failed", "No renderable prompts were produced.");
    throw new Error("No prompts.");
  }
  reportStage("prompt", "succeeded", "Prompts compiled.", { compiledPromptCount: prompts.length });

  reportStage("source_material", "running", "Planning source material.");
  const materialPlan = materialSourcingPlanner.plan(shots);
  const materialCandidates = await resolveMaterialCandidates(materialPlan);
  const materialReport = materialSourceValidator.validate(materialPlan, materialCandidates);
  reportStage("source_material", materialToStage(materialReport.status), "Source material completed.", {
    materialBriefCount: materialPlan.briefs.length,
    materialCandidateCount: materialReport.candidateCount,
    selectedMaterialCandidateCount: materialReport.selectedCandidateCount
  });

  reportStage("render", "running", "Rendering shots.");
  const rendered = await renderScheduler.run(prompts);
  reportStage("render", renderStatus(rendered), "Render stage completed.", { renderedShotCount: rendered.length });
}
```

## CineJelly Translation Plan

- Done: add `ProductionStageProgressEvent` and `ProductionStageProgressReporter` contracts under `src/types/stage.ts`.
- Done: share stage order and source-pattern origins between `ProductionStagePlanner` and DirectorAgent progress events.
- Done: add an optional stage progress reporter to `DirectorAgent`.
- Done: add progress events at the major orchestration boundaries without changing provider behavior.
- Done: add an optional runtime factory hook in `RenderJobManager` so async jobs can attach a progress collector to each runtime.
- Done: expose compact progress fields on job list responses and full retained progress events on per-job polling.
- Done: keep event retention bounded and redacted with secret, unsafe URI, data URI, key-level path, and embedded local-path filtering.

## Validation Checklist

- Running jobs can expose `currentStage`, `currentStageStatus`, and `progressEventCount`.
- Per-job detail includes retained `stageProgressEvents`.
- List responses remain compact and do not include full event arrays.
- Progress events do not include local paths, credentials, inline media, unsafe URIs, or raw provider payloads.
- Storyboard/prompt/render failure paths record a stage event before throwing where the pipeline reaches that boundary.
- Queued cancellation does not invent stage progress.
- No production runtime import from `external/upstream/`.
- Source lineage is added to `DEFAULT_SOURCE_LOGIC_TRANSLATIONS`.
