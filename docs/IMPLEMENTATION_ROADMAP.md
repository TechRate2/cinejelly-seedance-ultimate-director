# Implementation Roadmap

## Purpose

This roadmap turns the Subtree + Snapshot + Faithful Logic Translation policy into a practical implementation sequence. It focuses on source-faithful behavior that improves commercial output quality without importing directly from `external/upstream/`.

The current `src/` foundation is useful, but a module is not considered source-faithful until it has:

- a source map or Reference Implementation
- CineJelly-owned TypeScript implementation
- source lineage and attribution
- validation against the edge cases captured in the Reference Implementation

## Current Readiness

Ready foundations:

- Model Provider Abstraction contracts, Atlas provider, provider error normalization, capability validation, cost ledger, and retry telemetry.
- Prompt Compiler, reference sorting, negative constraints, repair hints, and provider-neutral request compilation.
- Production Graph, storyboard planner, shot planner, run recorder, review packet builder, artifact store, and delivery gate.
- Consistency Guardian preflight, storyboard checks, render checks, candidate selection hooks, and repair-only rerender orchestration.
- Source translation ledger and redacted logging foundation.

Not yet complete:

- Remaining per-logic Reference Implementations beyond Phase 1 Prompt Binding Plan.
- Stronger camera/composition/character-view metadata extraction to improve Reference Selection Scoring inputs.
- Guardian repair-decision provenance with narrow repair scope in operator artifacts.
- Real end-to-end Atlas render validation with paid credentials and FFmpeg/FFprobe installed.

## Phase 1: Prompt Fidelity

Current status as of 2026-06-13: Phase 1 foundation implemented and typechecked. The prompt compiler now creates a `PromptBindingPlan` before assembling prose, receives selected-provider reference capability data from the render producer, filters provider references before request compilation, and Guardian preflight consumes binding conflicts before provider spend. Review packets include runtime source lineage for the translated Prompt Binding Plan behavior. Remaining evidence work is real Atlas validation with paid credentials.

Target module:

- `src/prompt_compiler`
- `src/types/prompt.ts`
- `src/core/consistency-guardian.ts` where prompt/reference preflight is required

Source logic to translate:

- Emily2040/seedance-2.0 reference workflow, intent-vs-precision, and anti-slop compression order.
- YouMind-OpenLab/awesome-seedance-2-prompts prompt anatomy, timing, negative constraints, and cinematic ordering.

Deliverables:

- Done: `docs/reference-implementations/prompt-reference-binding-plan.md`
- Done: `PromptBindingPlan` type that captures sorted references, role scopes, conflicts, provider-filtered references, prompt sections, and compression notes.
- Done: Prompt compiler uses the binding plan before assembling prompt prose.
- Done: Guardian preflight consumes binding conflicts for identity/product/source-video/audio-video edge cases.
- Done in docs: source lineage recorded in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`.
- Done in runtime: default `SourceLogicTranslationLedger` records seed Prompt Binding Plan lineage into review packet `sourceLineage`.

Milestone check:

- Reference role ordering is deterministic.
- Source-video structure references guide planning but are not passed to providers unless supported.
- Too many references are bounded with identity/product/endpoints preserved first.
- Missing identity/product references produce repair findings before provider spend.
- `npm.cmd run typecheck` passes.

## Phase 2: Guardian Repair Provenance

Current status as of 2026-06-13: foundation implemented and typechecked. Guardian reports now include `repairScope`, `affectedNodeIds`, `sourceCheckpoints`, and `recommendedNextStep`; Production Graph inspection/repair nodes preserve this provenance; review packets expose `repairProvenance`; runtime source lineage records cover ViMax and VibeFrame influences. Remaining Phase 2 evidence work is real artifact review after a paid Atlas validation run.

Target module:

- `src/core/consistency-guardian.ts`
- `src/types/guardian.ts`
- `src/core/review-packet-builder.ts`
- `src/core/production-graph-run-recorder.ts`

Source logic to translate:

- ViMax consistency checkpoint ordering and reference-image selection priorities.
- VibeFrame validate -> plan/cost -> build/render -> inspect -> repair loop.

Deliverables:

- Done: `docs/reference-implementations/guardian-repair-decision-provenance.md`
- Done: Guardian report extensions for `repairScope`, `affectedNodeIds`, `sourceCheckpoints`, and `recommendedNextStep`.
- Done: Review packet includes repair provenance without exposing local paths or secrets.
- Done: Production Graph repair nodes preserve narrow scope: prompt, reference binding, storyboard, shot, render, or delivery.

Milestone check:

- Missing storyboard panel blocks render.
- Duplicate storyboard panel repairs storyboard only.
- Failed provider prediction rerenders only the affected shot.
- Missing output URL blocks delivery and routes provider diagnostics.
- Warnings are recorded but do not block delivery.

## Phase 3: Reference Selection Scoring

Current status as of 2026-06-13: foundation implemented and typechecked. A CineJelly-owned `ReferenceSelectionPlanner` now scores references before storyboard/prompt compilation, stores `ReferenceSelectionPlan` evidence on shot contracts, bounds selected references before provider request compilation, and Production Graph emits `reference_selection` nodes with selected/dropped candidate evidence. Remaining evidence work is to enrich incoming references with stronger camera/composition/character-view metadata from future source-video and reference-analysis modules.

Target module:

- `src/core`
- `src/types/graph.ts`
- `src/types/prompt.ts`
- future focused module such as `src/core/reference-selection-planner.ts`

Source logic to translate:

- ViMax reference selection: same camera/composition priority, recent prior-frame priority, one portrait per character/view, duplicate suppression, maximum selected references.

Deliverables:

- Done: `docs/reference-implementations/reference-selection-scoring.md`
- Done: CineJelly-owned reference selection planner.
- Done: Production Graph evidence for candidate references, selected references, score reasons, and dropped duplicates.
- Done: Prompt Compiler consumes selected references rather than raw unordered references where available.

Milestone check:

- Same-camera references outrank generic references when continuity depends on composition.
- Recent prior-frame references outrank stale scene references.
- New character appearances prefer authorized portrait references.
- Reference count is bounded before provider request compilation.

## Phase 4: Provider Polling, Retry, And Cost Fidelity

Status as of 2026-06-13: Reference Implementation drafted; provider-neutral ledger contracts, Atlas polling ledger entries, retry-code classification, timeout/abort normalization, and review-packet canceled-operation counts are implemented. `npm.cmd run typecheck` passed; build and final validation are still required before closing the phase.

Target module:

- `src/providers`
- `src/utils/retry.ts`
- `src/providers/cost-ledger.ts`
- `src/types/provider.ts`

Source logic to translate:

- VibeFrame provider routing/cost-gate discipline.
- MoneyPrinterTurbo queue/progress patterns where relevant.
- Atlas Cloud current docs and schema for async prediction and Asset Library behavior.

Deliverables:

- `docs/reference-implementations/provider-polling-retry-cost.md`
- Provider polling state map for queued/running/succeeded/failed/canceled/timeout.
- Retry classification and retry budget tied to ProviderError codes.
- Cost ledger records retry count, model, graph node, prediction ID, latency, and provider-returned usage when available.

Milestone check:

- Provider timeout and abort normalize into retryable ProviderError records where appropriate.
- Failed predictions produce ledger entries and stack-free public errors.
- Cost gate blocks before provider spend when configured max cost is exceeded.
- Polling cancellation respects request/job abort signals.

## Phase 5: Long-Form Planning And Batch Workflow

Status as of 2026-06-13: Reference Implementation drafted; stage lifecycle contracts, `ProductionStagePlanner`, material sourcing graph node, DirectorAgent material planning, review-packet stage lifecycle, and stage/material artifacts are implemented. `npm.cmd run typecheck` passed; build/final validation and real long-form Atlas validation remain pending.

Target module:

- `src/core/shot-planner.ts`
- `src/core/chunking.ts`
- `src/core/render-scheduler.ts`
- `src/core/material-sourcing-planner.ts`
- `src/agents/director-agent.ts`

Source logic to translate:

- ViMax long-form segmentation, storyboard decomposition, dependency planning.
- VibeFrame deterministic artifact order and status refresh.
- MoneyPrinterTurbo staged one-input pipeline, task progress, material sourcing, batch candidate lifecycle.

Deliverables:

- `docs/reference-implementations/long-form-planning-batch-workflow.md`
- Explicit stage status model for plan, storyboard, prompt, source material, render, inspect, repair, assemble, deliver.
- Batch candidate evidence across shots and final deliverables.
- Material sourcing rights metadata wired into Production Graph nodes.

Milestone check:

- 2-8 minute jobs chunk into provider-safe shots.
- Dependency scheduler keeps continuity-sensitive shots ordered.
- Independent shots can render concurrently within configured limits.
- Batch candidates are traceable and rejected candidates are recorded.

## Phase 6: Real Provider Validation

Target module:

- Runtime config
- API endpoints
- Artifact store
- Operator runbook

Deliverables:

- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.
- Run `npm.cmd run preflight` with real deployment environment.
- Run one paid Atlas render using a short safe input and non-sensitive references.
- Inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, and deliverable metadata.
- Update `docs/PROJECT_CONTEXT.md` with actual validation date and remaining blockers.

Milestone check:

- Provider credentials are loaded only through environment variables.
- FFmpeg/FFprobe are detected.
- API response does not expose local paths, secrets, signed URLs, raw stack traces, or inline base64 media.
- Artifacts are redacted and include integrity hashes.

## Global Validation Checklist

Use this checklist for every module in this roadmap:

- Reference Implementation exists for behavior-critical source logic.
- License and attribution path are recorded.
- Production implementation is new or substantially adapted CineJelly TypeScript.
- No production runtime import from `external/upstream/`.
- Source edge cases are represented in TypeScript contracts or explicit validation code.
- Cost tracking exists before provider spend.
- Error handling uses stable codes/status and redacted public messages.
- Logging is redacted and includes request/project/graph/source context where available.
- Production Graph integration records lineage, affected nodes, and repair/candidate decisions.
- Documentation updates include relevant source path, destination module, and validation status.
- `npm.cmd run typecheck` passes.
- `git diff --check` passes.
- Redacted secret audit reports paths/counts only.
