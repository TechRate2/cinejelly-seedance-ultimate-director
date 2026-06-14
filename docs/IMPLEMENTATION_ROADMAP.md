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

- Model Provider Abstraction contracts, Atlas provider, generated-audio provider contract boundary, provider error normalization, capability validation, cost ledger, and retry telemetry.
- Prompt Compiler, reference sorting, negative constraints, repair hints, and provider-neutral request compilation.
- Production Graph, storyboard planner, shot planner, run recorder, review packet builder, artifact store, and delivery gate.
- Material sourcing planner, local material library adapter, remote stock material adapter, material source validator, postproduction asset planner, generated-audio intent planning, generated-audio execution planning, generated-audio output validation, generated-audio output batch validation, optional generated-audio batch artifact evidence, generated-audio asset resolution plus catalog preflight, render-job stage progress telemetry, and source-material/postproduction artifact validation.
- Consistency Guardian preflight, storyboard checks, render checks, candidate selection hooks, and repair-only rerender orchestration.
- Source translation ledger and redacted logging foundation.
- Reference Implementations and CineJelly-owned rewrites for Phase 1-5 foundations, Source Video Auto Analysis Adapter, Render Job Stage Progress Telemetry, API Artifact Validation Evidence, Material Source Adapter Validation, Local Material Library Adapter, Remote Stock Material Adapter, Postproduction Asset Orchestration, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, Generated Audio Provider Execution Contract, Phase 6 Validation Readiness Report, Phase 6 Render Request Validation Contract, Phase 6 Paid Render Validation Runner, and Media Tool Binary Resolution.
- Operator validation readiness through `npm.cmd run validation:readiness`, `GET /v1/validation-readiness`, no-spend render request validation through `npm.cmd run validation:render-request -- --request <request-json>`, readiness-gated paid render validation through `npm.cmd run validation:paid-render -- --request <request-json>`, API-visible synchronous/async artifact validation, and artifact validation through `npm.cmd run validate:artifacts -- <artifact-directory>` for pre-paid blockers, request-contract issues, manifest integrity, required artifacts, stage lifecycle, material rights briefs, cost ledger shape, deliverable metadata, and redaction checks.

Not yet complete:

- Real end-to-end Atlas render validation with paid credentials and FFmpeg/FFprobe available through `PATH` or configured binary paths.
- Real artifact review from a paid Atlas validation run, including validator output, review packet, cost ledger, stage lifecycle, and deliverable metadata.
- Live validation of source-video auto-analysis with real source videos, deployment FFmpeg frame extraction, and the configured Atlas multimodal LLM.
- Live remote stock provider validation with real Pexels/Pixabay/Coverr credentials and operator-approved commercial terms.
- Live Atlas-backed TTS/BGM/ambience/SFX execution; current generated-audio support includes provider-neutral ready-item execution plumbing, but Atlas remains no-capability/no-spend until audio schemas, model IDs, pricing, and paid validation are verified.

## Phase 1: Prompt Fidelity

Current status as of 2026-06-13: Phase 1 foundation implemented with local typecheck/build validation. The prompt compiler now creates a `PromptBindingPlan` before assembling prose, receives selected-provider reference capability data from the render producer, filters provider references before request compilation, and Guardian preflight consumes binding conflicts before provider spend. Review packets include runtime source lineage for the translated Prompt Binding Plan behavior. Remaining evidence work is real Atlas validation with paid credentials.

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

Current status as of 2026-06-13: foundation implemented with local typecheck/build validation. Guardian reports now include `repairScope`, `affectedNodeIds`, `sourceCheckpoints`, and `recommendedNextStep`; Production Graph inspection/repair nodes preserve this provenance; review packets expose `repairProvenance`; runtime source lineage records cover ViMax and VibeFrame influences. Remaining Phase 2 evidence work is real artifact review after a paid Atlas validation run.

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

Current status as of 2026-06-13: foundation implemented with local typecheck/build validation. A CineJelly-owned `ReferenceSelectionPlanner` now scores references before storyboard/prompt compilation, stores `ReferenceSelectionPlan` evidence on shot contracts, bounds selected references before provider request compilation, and Production Graph emits `reference_selection` nodes with selected/dropped candidate evidence. Reference metadata enrichment now validates and preserves explicit camera/composition/character/view/timeline/authorization fields before scoring, source-video reference metadata enrichment derives bounded camera/composition/timeline/source-scene/source-keyframe hints from normalized `sourceVideoAnalysis`, and the opt-in Source Video Auto Analysis Adapter can generate normalized `sourceVideoAnalysis` from bounded sampled frames of a clean HTTPS `source_video_structure` reference. Remaining evidence work is live validation with real videos, FFmpeg, and the configured Atlas multimodal LLM.

Target module:

- `src/core`
- `src/types/graph.ts`
- `src/types/prompt.ts`
- future focused module such as `src/core/reference-selection-planner.ts`

Source logic to translate:

- ViMax reference selection: same camera/composition priority, recent prior-frame priority, one portrait per character/view, duplicate suppression, maximum selected references.

Deliverables:

- Done: `docs/reference-implementations/reference-selection-scoring.md`
- Done: `docs/reference-implementations/reference-metadata-enrichment.md`
- Done: `docs/reference-implementations/source-video-reference-metadata-enrichment.md`
- Done: `docs/reference-implementations/source-video-auto-analysis-adapter.md`
- Done: CineJelly-owned reference selection planner.
- Done: API admission and ReferenceLibrarian preserve bounded reference selection metadata before provider spend.
- Done: Intake enriches references from normalized source-video scene/keyframe metadata without overwriting explicit caller metadata.
- Done: Opt-in `SourceVideoAutoAnalyzer` samples bounded frames, sends input-only frame data to the configured Atlas LLM, normalizes through `SourceVideoAnalyst`, and skips or fails based on operator configuration.
- Done: Production Graph evidence for candidate references, selected references, score reasons, and dropped duplicates.
- Done: Prompt Compiler consumes selected references rather than raw unordered references where available.

Milestone check:

- Same-camera references outrank generic references when continuity depends on composition.
- Recent prior-frame references outrank stale scene references.
- New character appearances prefer authorized portrait references.
- Reference count is bounded before provider request compilation.
- Source-video auto-analysis never overwrites caller-provided `sourceVideoAnalysis`.
- Local frame paths and base64 data are input-only and do not appear in returned source-video analysis.

## Phase 4: Provider Polling, Retry, And Cost Fidelity

Status as of 2026-06-13: Reference Implementation drafted; provider-neutral ledger contracts, Atlas polling ledger entries, retry-code classification, timeout/abort normalization, and review-packet canceled-operation counts are implemented. `npm.cmd run typecheck` and `npm.cmd run build` passed; paid Atlas validation is still required before closing provider behavior against the live service.

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

- Done: `docs/reference-implementations/provider-polling-retry-cost.md`
- Done: Provider polling state map for queued/running/succeeded/failed/canceled/timeout.
- Done: Retry classification and retry budget tied to ProviderError codes.
- Done: Cost ledger records retry count, model, graph node, prediction ID, latency, and provider-returned usage when available.
- Pending: paid Atlas validation of terminal provider states and ledger evidence.

Milestone check:

- Provider timeout and abort normalize into retryable ProviderError records where appropriate.
- Failed predictions produce ledger entries and stack-free public errors.
- Cost gate blocks before provider spend when configured max cost is exceeded.
- Polling cancellation respects request/job abort signals.

## Phase 5: Long-Form Planning And Batch Workflow

Status as of 2026-06-14: Reference Implementations drafted/implemented for stage lifecycle, material sourcing, postproduction asset orchestration, generated-audio intent planning, generated-audio execution planning, generated-audio provider execution runner, generated-audio output validation, generated-audio output batch validation, generated-audio batch artifact evidence, generated-audio asset resolution, generated-audio asset resolution catalog, and generated-audio provider execution contracts. `ProductionStagePlanner`, material sourcing graph node, DirectorAgent material planning, postproduction asset planning, generated-audio planned/ready evidence, generated-audio ready/blocked execution planning, provider-neutral generated-audio ready-item execution plumbing, generated-audio result-to-track validation, generated-audio batch result reconciliation, optional generated-audio batch artifact persistence/validation, generated-audio batch review-packet planning/status/recommendation evidence, generated-audio asset-to-HTTPS resolution, generated-audio asset resolution catalog preflight, generated-audio provider-neutral contracts, no-spend Atlas generated-audio boundary, DirectorAgent stage progress reporting, async render-job progress polling, synchronous/async API artifact validation evidence, local material library adapter, opt-in remote stock material adapter, material source validation, review-packet stage/postproduction planning evidence, and stage/material/postproduction artifacts are implemented. `npm.cmd run typecheck`, `npm.cmd run build`, local no-network generated-audio execution-planner smoke, local no-network generated-audio provider-execution-runner smoke, local no-network generated-audio output-validation smoke, local no-network generated-audio output-batch-validation smoke, local no-network generated-audio batch-artifact validation smoke, local no-network generated-audio asset-resolution smoke, local no-network generated-audio asset-resolution catalog smoke, and local no-network generated-audio boundary smoke passed for the foundation phases; real long-form Atlas validation, live remote stock provider validation, and live Atlas generated-audio execution remain pending.

Target module:

- `src/core/shot-planner.ts`
- `src/core/chunking.ts`
- `src/core/render-scheduler.ts`
- `src/core/material-sourcing-planner.ts`
- `src/core/material-source-validator.ts`
- `src/agents/director-agent.ts`

Source logic to translate:

- ViMax long-form segmentation, storyboard decomposition, dependency planning.
- VibeFrame deterministic artifact order and status refresh.
- MoneyPrinterTurbo staged one-input pipeline, task progress, material sourcing, batch candidate lifecycle.
- OpenMontage approval-gate concepts for source material are used as AGPL-aware behavior notes only.

Deliverables:

- `docs/reference-implementations/long-form-planning-batch-workflow.md`
- `docs/reference-implementations/material-source-adapter-validation.md`
- `docs/reference-implementations/local-material-library-adapter.md`
- `docs/reference-implementations/remote-stock-material-adapter.md`
- `docs/reference-implementations/postproduction-asset-orchestration.md`
- `docs/reference-implementations/generated-audio-intent-planning.md`
- `docs/reference-implementations/generated-audio-execution-planner.md`
- `docs/reference-implementations/generated-audio-provider-execution-runner.md`
- `docs/reference-implementations/generated-audio-output-validation.md`
- `docs/reference-implementations/generated-audio-output-batch-validation.md`
- `docs/reference-implementations/generated-audio-batch-artifact-evidence.md`
- `docs/reference-implementations/generated-audio-asset-resolution.md`
- `docs/reference-implementations/generated-audio-asset-resolution-catalog.md`
- `docs/reference-implementations/generated-audio-provider-execution-contract.md`
- `docs/reference-implementations/render-job-stage-progress.md`
- `docs/reference-implementations/api-artifact-validation-evidence.md`
- Explicit stage status model for plan, storyboard, prompt, source material, render, inspect, repair, assemble, deliver.
- Bounded async render-job stage progress telemetry with compact list summaries and detailed per-job progress events.
- API-visible artifact validation status and checks for synchronous render responses and retained async job artifacts without exposing server-local artifact paths.
- Batch candidate evidence across shots and final deliverables.
- Material sourcing rights metadata wired into Production Graph nodes.
- Material source validation report wired into stage lifecycle, review packet planning evidence, durable artifacts, and artifact validation.
- Postproduction asset plan wired into assemble-stage evidence, review packet planning evidence, durable artifacts, artifact validation, and cross-artifact consistency checks.
- Generated-audio intents for narration, BGM, ambience, and SFX wired into request admission, postproduction asset plan, assemble-stage evidence, review packet planning evidence, durable artifacts, artifact validation, and cross-artifact consistency checks as planned-only evidence.
- Generated-audio execution planning maps intents to verified provider capabilities and records ready/blocked item evidence without calling providers.
- Generated-audio provider execution runner calls only ready generated-audio requests when an `AudioProvider` and verified capabilities are present; provider exceptions become result evidence and batch validation must approve outputs before they can enter assembly.
- Generated-audio output validation approves result-to-track conversion only for matched, positive-duration, credential-free HTTPS provider results; `asset://` outputs require a reviewed generated-audio asset resolver entry before becoming mix tracks.
- Generated-audio output batch validation reconciles ready execution-plan items with provider results in plan order, blocks missing/duplicate/unexpected results, and returns only approved tracks for future mixing.
- Generated-audio batch artifact evidence optionally persists batch validation reports, exposes matching review-packet planning/status evidence, and cross-checks them against postproduction, run-summary, and review-packet artifacts when provider-backed audio results exist.
- Generated-audio asset resolution maps approved clean `asset://` outputs to credential-free HTTPS delivery URLs without provider calls, media downloads, or generated files.
- Generated-audio asset resolution catalog preflight validates operator-owned resolver entries before customer traffic without enabling provider-backed audio generation.
- Provider-neutral audio-generation capability/request/result contracts and `AudioProvider` boundary added; Atlas generated-audio execution remains a stable no-spend `MODEL_UNAVAILABLE` path until verified capability mapping exists.
- Operator-owned local material catalog fulfillment through safe `asset://` or credential-free HTTPS candidates, with `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` config and preflight validation.
- Opt-in remote stock material fulfillment through Pexels, Pixabay, and commercially approved Coverr providers, with key-gated runtime config, credential-free candidate URIs, attribution metadata, and centralized material validation.

Milestone check:

- 2-8 minute jobs chunk into provider-safe shots.
- Dependency scheduler keeps continuity-sensitive shots ordered.
- Independent shots can render concurrently within configured limits.
- Batch candidates are traceable and rejected candidates are recorded.
- Source-material candidates are either planned-only or validated against known briefs, approved sources, safe URIs, rights/attribution, duration, aspect ratio, and resolution before release evidence.
- Caption cues and audio tracks produce deterministic postproduction planning evidence before final assembly; inconsistent caption/audio inputs become review-required issues instead of silent ignores.
- `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence agree on postproduction status and counts.
- Atlas-backed TTS, BGM, ambience, and SFX execution is not claimed until verified provider mappers exist; generated-audio intents are bounded, planned/ready evidence, provider-neutral runner execution is available only behind verified capabilities, and Atlas remains no-capability/no-spend by default.
- Generated-audio provider execution never sends blocked/planned-only items to providers; ready items preserve execution-plan order and failed provider calls become failed/timeout/canceled result evidence.
- Generated-audio intent counts in `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence agree.
- Generated-audio ready/blocked intent counts in `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence agree.
- Calling Atlas generated-audio without verified capability mapping fails before network spend with a stable provider error and, when a ledger is attached, an `audio.generate` failed ledger entry.
- Generated-audio provider results cannot become final mix tracks unless output validation approves status, identity, kind, provider, model, duration, volume, and safe URL.
- Generated-audio provider result batches cannot become mix inputs unless every ready intent has exactly one matching result, stray or blocked-intent results are rejected, and approved tracks preserve execution-plan order.
- Generated-audio output batch artifacts are optional until provider-backed execution exists; when present, `generated-audio-output-batch-validation.json`, `run-summary.json`, `review-packet.json`, and `postproduction-assets.json` must agree on status/count evidence.
- Generated-audio `asset://` outputs cannot become final mix tracks unless asset resolution also approves the source asset, identity binding, provider/model binding, optional duration evidence, and credential-free HTTPS delivery URL.
- Generated-audio asset resolution catalogs fail preflight on duplicate `asset://` entries, unsafe URIs, malformed entries, or missing boolean approval fields.
- Local material catalog entries never expose filesystem paths in API/artifact candidate URIs.
- Remote stock candidates never expose API keys, signed URLs, or credential-like query parameters in candidate, source-page, or preview URIs.
- Running async jobs expose current stage, current stage status, progress event count, and retained detail events without local paths, inline media, secrets, or raw provider payloads.
- Synchronous render responses expose artifact validation status/checks, and terminal async jobs expose compact artifact validation status in list responses plus full validation checks in per-job responses without local artifact directories or manifest paths.

## Phase 6: Real Provider Validation

Status as of 2026-06-14T06:48:36.159Z: `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run preflight`, and `npm.cmd run validation:readiness` passed current local machine checks with readiness decision `ready_for_paid_validation`: 55 checks total, 55 pass, 0 warn, and 0 fail. Atlas keys, model IDs, API auth token, output directory, configured FFmpeg/FFprobe executable paths, and pinned Seedance capability records are present in the local ignored `.env`. `GET /health` and protected `GET /v1/validation-readiness` were verified against a locally started API and returned healthy paid-validation readiness. A no-spend 15-second render request validation also passed through CineJelly request admission and output-root normalization. A Phase 6 Validation Readiness Report foundation is implemented for CLI and HTTP diagnostics so operators can capture redacted blockers, warnings, and next actions before paid provider work. A Phase 6 Render Request Validation Contract foundation now provides static operator schemas and `npm.cmd run validation:render-request -- --request <request-json>` to validate a request file through CineJelly admission and output-root normalization without provider spend. A Phase 6 Paid Render Validation Runner foundation provides `npm.cmd run validation:paid-render -- --request <request-json>` for readiness-gated paid runs, shared request normalization, success/failure artifact writing, and immediate artifact validation once deployment blockers are cleared. Paid Atlas render validation has not been run.

Operator validation procedure: `docs/OPERATOR_RUNBOOK.md`.

Target module:

- Runtime config
- API endpoints
- Artifact store
- Operator runbook
- Validation readiness report
- Render request validation contract and schemas
- Paid render validation runner

Deliverables:

- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.
- Run `npm.cmd run validation:render-request -- --request <request-json>` for the operator-owned paid-validation request.
- Run `npm.cmd run preflight` with real deployment environment.
- Run `npm.cmd run validation:readiness` and keep the redacted report with validation evidence.
- Call `GET /v1/validation-readiness` against the running API and keep the redacted report with deployment evidence.
- Run one paid Atlas render using `npm.cmd run validation:paid-render -- --request <request-json>` with a short safe input and non-sensitive references; pass `--allow-warnings` only after intentionally accepting readiness warnings.
- Run `npm.cmd run validate:artifacts -- <artifact-directory>` on generated success or failure artifacts.
- Inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, and deliverable metadata.
- Update `docs/PROJECT_CONTEXT.md` with actual validation date and remaining blockers.
- Maintain `docs/OPERATOR_RUNBOOK.md` as the authoritative execution checklist for preflight, paid validation, artifact inspection, redaction review, and release decision.

Milestone check:

- Provider credentials are loaded only through environment variables.
- FFmpeg/FFprobe are detected through `PATH` or configured binary paths.
- Validation readiness report decision is `ready_for_paid_validation`, or warnings are explicitly reviewed before paid rendering.
- Render request validation passes before paid rendering and does not initialize providers, call Atlas, or write render artifacts.
- Paid render validation runner blocks provider spend when readiness is `blocked`, requires explicit warning acknowledgement, and emits a redacted operator report after artifact validation.
- API response does not expose local paths, secrets, signed URLs, raw stack traces, or inline base64 media.
- Artifacts are redacted and include integrity hashes.
- Artifact validator passes or warnings are explicitly reviewed before release.

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
