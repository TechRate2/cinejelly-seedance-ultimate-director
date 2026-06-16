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
- Reference Implementations and CineJelly-owned rewrites for Phase 1-5 foundations, Source Video Auto Analysis Adapter, Render Job Stage Progress Telemetry, API Artifact Validation Evidence, API Client Policy And Quota Gate, API Client Policy Kit, Deployment Readiness Capture, Billing Admin Operations Evidence, Production Operations Evidence, Live Readiness Input Validator, Business Readiness Validation Plan, Material Source Adapter Validation, Local Material Library Adapter, Remote Stock Material Adapter, Postproduction Asset Orchestration, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, Generated Audio Provider Execution Contract, Long-Form Validation Runner, Phase 6 Validation Readiness Report, Phase 6 Render Request Validation Contract, Phase 6 Paid Render Validation Runner, Business Readiness Audit, and Media Tool Binary Resolution.
- Operator validation readiness through `npm.cmd run doctor`, `npm.cmd run validation:readiness`, `GET /v1/validation-readiness`, secret-free render option discovery through `GET /v1/render-settings`, safe request creation through `npm.cmd run validation:create-request`, client-policy quota smoke through `npm.cmd run validation:client-policy-smoke`, client-policy kit generation and env merge through `npm.cmd run ops:create-client-policy` plus `npm.cmd run ops:apply-client-policy-env`, deployment-host capture through `npm.cmd run validation:deployment-readiness -- --base-url <deployment-url>`, long-form business evidence through `npm.cmd run validation:long-form -- --duration-seconds 120`, no-spend ops-config draft/precheck tooling through `npm.cmd run validation:ops-config -- --write-drafts`, no-spend operator attestation promotion through `npm.cmd run ops:promote-attestations`, no-spend live-input validation through `npm.cmd run validation:live-inputs`, no-spend business validation sequencing through `npm.cmd run validation:business-plan`, billing/admin/quota evidence capture through `npm.cmd run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json`, production operations evidence capture through `npm.cmd run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json`, one-command no-spend local smoke evidence through `npm.cmd run validation:local-smoke`, no-spend render request validation through `npm.cmd run validation:render-request -- --request <request-json>`, readiness-gated paid render validation through `npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend`, release hygiene audit through `npm.cmd run validation:release-audit`, full commercial-platform evidence audit through `npm.cmd run validation:business-readiness`, API-visible synchronous/async artifact validation, and artifact validation through `npm.cmd run validate:artifacts -- <artifact-directory>` for setup gaps, pre-paid blockers, request-contract issues, manifest integrity, required artifacts, stage lifecycle, material rights briefs, cost ledger shape, deliverable metadata, redaction checks, quota controls, and customer-release blockers.

Not yet complete:

- Real deployment capture from an HTTPS non-localhost host using `validation:deployment-readiness`.
- Real billing/admin/quota capture from an HTTPS deployment host with enabled client policies, persistent usage ledger, admin endpoint evidence, and non-secret billing/admin attestation; `validation:ops-config` now creates drafts and validates the required shape before this capture.
- Real production operations capture from an HTTPS deployment host with durable storage, backups, restore test, monitoring, incident, support, redaction, and retention evidence; `validation:ops-config` now creates drafts and validates the required shape before this capture.
- Real end-to-end Atlas render validation with paid credentials and FFmpeg/FFprobe available through `PATH` or configured binary paths.
- Real artifact review from a paid Atlas validation run, including validator output, review packet, cost ledger, stage lifecycle, and deliverable metadata.
- Live evidence run for source-video auto-analysis with a real clean HTTPS source video, deployment FFmpeg frame extraction, and the configured Atlas multimodal LLM. The validation runner and spend gate are implemented; the archived live report is still pending.
- Live evidence run for remote stock provider validation with real Pexels/Pixabay/Coverr credentials and operator-approved commercial terms. The validation runner and live-network gate are implemented; the archived live provider report is still pending.
- Live 2-8 minute long-form Atlas validation with an approved budget, passing paid-render artifacts, and manual quality/redaction review. The validation runner, schema, spend gate, budget gate, chunk-plan gate, and business-readiness evaluator are implemented; the archived passing paid report is still pending.
- Live Atlas-backed generated-audio business evidence; current generated-audio support includes provider-neutral ready-item execution plumbing and Atlas `xai/tts-v1` submit/poll mapping, but paid output validation and manual review remain pending before commercial use.

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

Current status as of 2026-06-16: foundation implemented with local typecheck/build validation. A CineJelly-owned `ReferenceSelectionPlanner` now scores references before storyboard/prompt compilation, stores `ReferenceSelectionPlan` evidence on shot contracts, bounds selected references before provider request compilation, and Production Graph emits `reference_selection` nodes with selected/dropped candidate evidence. Reference metadata enrichment now validates and preserves explicit camera/composition/character/view/timeline/authorization fields before scoring, source-video reference metadata enrichment derives bounded camera/composition/timeline/source-scene/source-keyframe hints from normalized `sourceVideoAnalysis`, and the opt-in Source Video Auto Analysis Adapter can generate normalized `sourceVideoAnalysis` from bounded sampled frames of a clean HTTPS `source_video_structure` reference. The live validation CLI and business-readiness report gate now exist; remaining evidence work is running it with a real clean HTTPS source video, FFmpeg, and the configured Atlas multimodal LLM after explicit spend approval.

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
- Done: `docs/reference-implementations/source-video-auto-analysis-validation-runner.md`
- Done: CineJelly-owned reference selection planner.
- Done: API admission and ReferenceLibrarian preserve bounded reference selection metadata before provider spend.
- Done: Intake enriches references from normalized source-video scene/keyframe metadata without overwriting explicit caller metadata.
- Done: Opt-in `SourceVideoAutoAnalyzer` samples bounded frames, sends input-only frame data to the configured Atlas LLM, normalizes through `SourceVideoAnalyst`, and skips or fails based on operator configuration.
- Done: `npm.cmd run validation:source-video-auto-analysis` blocks before provider/source-video network calls unless `--confirm-provider-spend` is present, then emits versioned business-readiness evidence.
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
- Atlas Cloud current docs and schema for async prediction, direct references, and media upload behavior.

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

Status as of 2026-06-16: Reference Implementations drafted/implemented for stage lifecycle, material sourcing, postproduction asset orchestration, generated-audio intent planning, generated-audio execution planning, generated-audio provider execution runner, generated-audio output validation, generated-audio output batch validation, generated-audio batch artifact evidence, generated-audio asset resolution, generated-audio asset resolution catalog, generated-audio provider execution contracts, remote stock provider validation, Atlas generated-audio validation, and long-form validation evidence. `ProductionStagePlanner`, material sourcing graph node, DirectorAgent material planning, postproduction asset planning, generated-audio planned/ready evidence, generated-audio ready/blocked execution planning, provider-neutral generated-audio ready-item execution plumbing, generated-audio result-to-track validation, generated-audio batch result reconciliation, optional generated-audio batch artifact persistence/validation, generated-audio batch review-packet planning/status/recommendation evidence, generated-audio asset-to-HTTPS resolution, generated-audio asset resolution catalog preflight, generated-audio provider-neutral contracts, configurable Atlas generated-audio capability records, Atlas `generateAudio` submit/poll execution behind explicit validation spend gates, generated-audio business-readiness validation runner, long-form request/readiness/budget/chunk validation runner, DirectorAgent stage progress reporting, async render-job progress polling, synchronous/async API artifact validation evidence, local material library adapter, opt-in remote stock material adapter, remote stock provider live-network validation runner, material source validation, review-packet stage/postproduction planning evidence, and stage/material/postproduction artifacts are implemented. `npm.cmd run typecheck`, `npm.cmd run build`, local no-network generated-audio execution-planner smoke, local no-network generated-audio provider-execution-runner smoke, local no-network generated-audio output-validation smoke, local no-network generated-audio output-batch-validation smoke, local no-network generated-audio batch-artifact validation smoke, local no-network generated-audio asset-resolution smoke, local no-network generated-audio asset-resolution catalog smoke, local no-network Atlas generated-audio submit/poll smoke, generated-audio validation gate smoke, and long-form validation gate smoke passed for the foundation phases; real long-form Atlas validation, archived live remote stock provider evidence with real keys, and live paid Atlas generated-audio validation remain pending.

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
- `docs/reference-implementations/generated-audio-validation-runner.md`
- `docs/reference-implementations/long-form-validation-runner.md`
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
- Provider-neutral audio-generation capability/request/result contracts and `AudioProvider` boundary added; Atlas `generateAudio` submit/poll execution now runs only for verified capability-mapped ready items and remains behind validation spend/schema/manual-review gates.
- Operator-owned local material catalog fulfillment through safe `asset://` or credential-free HTTPS candidates, with `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` config and preflight validation.
- Opt-in remote stock material fulfillment through Pexels, Pixabay, and commercially approved Coverr providers, with key-gated runtime config, credential-free candidate URIs, attribution metadata, and centralized material validation.
- Done: `npm.cmd run validation:remote-stock` blocks before provider network calls unless `--confirm-live-network` is present, requires `--confirm-commercial-terms-reviewed` for commercial evidence, and emits versioned business-readiness evidence.
- Done: `npm.cmd run validation:generated-audio` blocks before Atlas audio provider execution unless `--confirm-provider-spend` is present, requires schema-review/manual-review evidence for business readiness, and emits versioned generated-audio business-readiness evidence.
- Done: `npm.cmd run validation:long-form` verifies 120-480s request admission, readiness, configured cost budget, provider-safe 4-15s chunk planning, paid-render wrapping, artifact evidence, and manual review before emitting versioned long-form business-readiness evidence.

Milestone check:

- 2-8 minute jobs chunk into provider-safe shots.
- Dependency scheduler keeps continuity-sensitive shots ordered.
- Independent shots can render concurrently within configured limits.
- Batch candidates are traceable and rejected candidates are recorded.
- Source-material candidates are either planned-only or validated against known briefs, approved sources, safe URIs, rights/attribution, duration, aspect ratio, and resolution before release evidence.
- Caption cues and audio tracks produce deterministic postproduction planning evidence before final assembly; inconsistent caption/audio inputs become review-required issues instead of silent ignores.
- `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence agree on postproduction status and counts.
- Atlas-backed TTS execution is wired for verified `xai/tts-v1` capability records; generated-audio intents are bounded, planned/ready evidence, provider-neutral runner execution is available only behind verified capabilities, and Atlas remains no-spend by default unless the generated-audio validation runner is explicitly confirmed. BGM, ambience, and SFX still need verified Atlas model mappings before use.
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

Status as of 2026-06-16T09:14:34.425Z: local no-spend validation passes in the clean release-candidate worktree. `node scripts/run-local-validation-smoke.mjs` created a safe request, ran typecheck/build/client-policy quota smoke/readiness/request validation, started a temporary API, checked `/health`, checked protected `/v1/validation-readiness`, and wrote an ignored local smoke evidence report with readiness decision `review_warnings`: 60 checks total, 59 pass, 1 warn, and 0 fail. The only warning is `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true`, which is the intended spend-control posture for client-key-gated render submissions. Atlas keys, model IDs, API auth token, output directory, configured FFmpeg/FFprobe executable paths, Atlas LLM/media base URLs, pinned Seedance capability records, and API client policy preflight are present in the local ignored `.env`/runtime checks. A short paid Atlas validation render completed on 2026-06-15T13:33:55.217Z with request `req_8262f057-c412-4f84-8bdb-56cefd8757f2`, project `project_f87153061ebea88e`, 58 provider ledger entries, estimated cost gate `$3`, a 13.5s H.264 854x480 final MP4, and artifact validation status `pass`. This paid run was intentionally text-to-video with `audioMode:none`, so the no-audio inspection warning is expected. The clean release-candidate release audit is `release_ready`: local smoke, paid evidence, artifact validation, Git metadata, clean tracked worktree, ignored `.env`/outputs, tracked secret scan, and external import-boundary scan all pass; release audit accepts the single mandatory-client-policy readiness warning only when the configured policy preflight passes. Manual short-validation media/artifact/redaction review passed for smoke-validation purposes; full customer traffic still requires production-quality review for real long-form/customer inputs. `npm.cmd run validation:business-readiness` is the no-spend full-platform gate that converts those remaining commercial blockers into a weighted evidence report.

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
- Reuse the existing short paid Atlas validation evidence when evaluating the current local snapshot, or run a new paid Atlas render only after explicit operator approval for a new release candidate; pass `--allow-warnings` only after intentionally accepting readiness warnings.
- Run `npm.cmd run validate:artifacts -- <artifact-directory>` on generated success or failure artifacts.
- Inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, and deliverable metadata.
- Run `npm.cmd run validation:release-audit` and archive the release-audit report with validation evidence.
- Run `npm.cmd run validation:live-inputs` before live network or paid provider validation and keep it blocked until deployment, ops, source-video, remote-stock, generated-audio, and budget inputs are ready for the intended gate.
- Run `npm.cmd run validation:business-readiness` and keep it blocked until real evidence exists for deployment preflight, long-form, source-video, remote stock, generated audio, billing/admin/quota controls, and production operations.
- Keep `docs/PROJECT_CONTEXT.md` updated with actual validation dates, report paths, and remaining blockers.
- Maintain `docs/OPERATOR_RUNBOOK.md` as the authoritative execution checklist for preflight, paid validation, artifact inspection, redaction review, and release decision.

Milestone check:

- Provider credentials are loaded only through environment variables.
- FFmpeg/FFprobe are detected through `PATH` or configured binary paths.
- Validation readiness report decision is `ready_for_paid_validation`, or warnings are explicitly reviewed before paid rendering.
- Render request validation passes before paid rendering and does not initialize providers, call Atlas, or write render artifacts.
- Paid render validation runner blocks provider spend when readiness is `blocked`, requires explicit warning acknowledgement, and emits a redacted operator report after artifact validation.
- Release audit passes in the clean release-candidate worktree once local smoke, paid-render evidence, artifact validation, source hygiene, ignored secret/output paths, tracked secret scan, and import-boundary checks pass. It does not replace manual media/redaction review.
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
