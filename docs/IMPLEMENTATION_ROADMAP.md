# Implementation Roadmap
> ⚠️ **TÀI LIỆU THIẾT KẾ — KHÔNG PHẢI MÔ TẢ CODE HIỆN TẠI.**
> Cập nhật lần cuối: **2026-07-02**. Từ đó tới nay mã nguồn đã đổi rất nhiều.
> Đọc [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md) để biết dự án HIỆN TẠI ra sao.
> Khi tài liệu này mâu thuẫn với code, **code đúng** — tài liệu là cái sai.


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
- Material sourcing planner, local material library adapter, remote stock material adapter, material source validator with deterministic URI-free candidate scoring/evaluation evidence, postproduction asset planner, generated-audio intent planning, generated-audio execution planning, generated-audio mapping smoke for narration/BGM/ambience/SFX kind boundaries, generated-audio output validation, generated-audio output batch validation, optional generated-audio batch artifact evidence, generated-audio asset resolution plus catalog preflight, render-job stage progress telemetry, compact render-job history persistence with provider checkpoint summaries, provider-state reconciliation foundation, local provider handoff/lease foundation, deployment-token-protected lease-service endpoint, HTTPS external lease adapter plus heartbeat foundation, idempotent provider handoff action ledger and execution replay boundary, digest-only Production Graph resume-state capsule plus protected enqueue/replay/lease/ack queue-service lifecycle, local two-worker handoff validation, production handoff capture runner, non-evidence live provider action template/checklist handoff, live provider action evidence validator with graph-resume enqueue evidence counting, graph-resume enqueue payload evidence validator, and source-material/postproduction artifact validation.
- Consistency Guardian preflight, storyboard checks, render checks, candidate selection hooks, and repair-only rerender orchestration.
- Source translation ledger and redacted logging foundation.
- Reference Implementations and CineJelly-owned rewrites for Phase 1-5 foundations, Source Video Auto Analysis Adapter, Source Video Auto Analysis Smoke, Render Job Stage Progress Telemetry, Render Job History Persistence, Render Provider Reconciliation, Render Provider Handoff, Director-Style Benchmark Harness, Director Agentic Media Reasoning, Short Pipeline Conversation Smoke, Short Pipeline Session Store Smoke, Short Pipeline Session Render Handoff Smoke, Short MVP UI Contract plus first-party create/review shell, Product URL-to-Video Extraction Smoke, API Artifact Validation Evidence, API Client Policy And Quota Gate, API Client Policy Kit, Deployment Readiness Capture, Billing Admin Operations Evidence, Production Operations Evidence, Live Readiness Input Validator, Business Readiness Validation Plan, Atlas Billing Readiness, AtlasCloud Docs Conformance Preflight, Commercial Launch Intake with a raw ignored-input schema contract, Commercial Launch Inputs with a contract-validated operator handoff manifest and input validation runbook, Operator Launch UI Contract plus first-party operator dashboard shell, Snapshot Parity Audit, Report Contract Validation, Roadmap Closure Audit, Material Source Adapter Validation, Material Source Scoring Smoke, Local Material Library Adapter, Remote Stock Material Adapter, Remote Stock Adapter Smoke, Postproduction Asset Orchestration, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Mapping Smoke, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, Generated Audio Provider Execution Contract, Long-Form Validation Runner, Long-Form Manual Review Readiness, Phase 6 Validation Readiness Report, Phase 6 Render Request Validation Contract, Phase 6 Paid Render Validation Runner, Business Readiness Audit, and Media Tool Binary Resolution.
- Operator validation readiness through `npm.cmd run doctor`, `npm.cmd run validation:readiness`, `GET /v1/validation-readiness`, secret-free render option and admin-allowlisted model discovery through `GET /v1/render-settings`, deployment-token operator launch dashboard evidence through `GET /v1/admin/operator-launch-ui-contract` and `npm.cmd run validation:operator-launch-ui-contract`, safe request creation through `npm.cmd run validation:create-request`, client-policy quota smoke through `npm.cmd run validation:client-policy-smoke`, client-policy kit generation and env merge through `npm.cmd run ops:create-client-policy` plus `npm.cmd run ops:apply-client-policy-env`, no-spend deployment-package validation through `npm.cmd run validation:deployment-package`, deployment-host capture through `npm.cmd run validation:deployment-readiness -- --base-url <deployment-url>`, long-form business evidence through `npm.cmd run validation:long-form -- --duration-seconds 120`, no-spend long-form manual quality/redaction review template/checklist generation through `npm.cmd run validation:long-form-review-draft`, no-spend long-form manual-review readiness through `npm.cmd run validation:long-form-review-readiness`, no-spend Director-style backend benchmark evidence through `npm.cmd run validation:quality-benchmark`, no-spend artifact-bound Director review draft generation through `npm.cmd run validation:quality-review-drafts`, no-spend accepted Director review-evidence readiness through `npm.cmd run validation:quality-review-evidence`, no-spend review-evidence schema/redaction guard through `npm.cmd run validation:quality-review-guard`, no-spend snapshot/subtree parity guardrails through `npm.cmd run validation:snapshot-parity`, no-spend material-source scoring smoke through `npm.cmd run validation:material-source-scoring`, no-spend source-video auto-analysis smoke through `npm.cmd run validation:source-video-auto-analysis-smoke`, no-spend remote-stock adapter smoke through `npm.cmd run validation:remote-stock-adapter-smoke`, no-spend provider reconciliation smoke through `npm.cmd run validation:provider-reconciliation`, no-spend provider handoff smoke through `npm.cmd run validation:provider-handoff`, no-spend provider external-lease heartbeat contract smoke through `npm.cmd run validation:provider-external-lease`, no-spend protected provider lease-service route smoke through `npm.cmd run validation:provider-lease-service`, no-spend provider handoff action-ledger execution replay smoke through `npm.cmd run validation:provider-handoff-actions`, no-spend digest-only graph resume-state capsule plus local queue lifecycle smoke through `npm.cmd run validation:graph-resume-state`, no-spend protected graph-resume queue-service smoke through `npm.cmd run validation:graph-resume-queue-service`, no-spend provider graph-resume worker bridge smoke through `npm.cmd run validation:provider-graph-resume-worker`, no-spend provider local multi-worker handoff smoke through `npm.cmd run validation:provider-multi-worker-handoff`, no-spend production provider handoff capture through `npm.cmd run validation:provider-production-handoff -- --base-url <deployment-url>`, no-spend live provider action evidence template/checklist generation through `npm.cmd run validation:provider-live-action-draft`, no-spend live provider action evidence validation through `npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions`, no-spend graph-resume enqueue payload template/checklist generation through `npm.cmd run validation:provider-graph-resume-draft`, no-spend graph-resume enqueue payload evidence validation through `npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues`, no-spend short-pipeline session-store validation through `npm.cmd run validation:short-pipeline-session-store`, no-spend short-pipeline session render-handoff validation through `npm.cmd run validation:short-pipeline-session-render-handoff`, no-spend ops-config draft/precheck tooling through `npm.cmd run validation:ops-config -- --write-drafts`, no-spend operator attestation promotion through `npm.cmd run ops:promote-attestations`, no-spend commercial launch intake validation through `npm.cmd run validation:launch-intake`, no-spend live-input validation through `npm.cmd run validation:live-inputs`, no-spend business validation sequencing through `npm.cmd run validation:business-plan`, no-spend Atlas billing readiness through `npm.cmd run validation:atlas-billing`, no-spend commercial launch input packet plus safe operator handoff manifest/input validation runbook generation through `npm.cmd run validation:commercial-inputs`, no-spend roadmap/snapshot closure audit through `npm.cmd run validation:roadmap-closure`, no-spend commercial launch doctor orchestration through `npm.cmd run validation:launch-doctor`, no-spend report contract validation through `npm.cmd run validation:report-contracts`, billing/admin/quota evidence capture through `npm.cmd run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json`, production operations evidence capture through `npm.cmd run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json`, one-command no-spend local smoke evidence through `npm.cmd run validation:local-smoke`, no-spend render request validation through `npm.cmd run validation:render-request -- --request <request-json>`, readiness- and Atlas-billing-gated paid render validation through `npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>`, release hygiene audit through `npm.cmd run validation:release-audit`, full commercial-platform evidence audit through `npm.cmd run validation:business-readiness`, API-visible synchronous/async artifact validation, and artifact validation through `npm.cmd run validate:artifacts -- <artifact-directory>` for setup gaps, pre-paid blockers, request-contract issues, manifest integrity, required artifacts, stage lifecycle, material rights briefs, cost ledger shape, deliverable metadata, redaction checks, quota controls, and customer-release blockers.
- Generated-audio mapping smoke is now part of the no-spend backend gate through `npm.cmd run validation:generated-audio-mapping`; it proves narration, BGM, ambience, and SFX kind boundaries, provider-preference blocking, duration blocking, safe result-to-track role mapping, and kind-mismatch rejection without Atlas calls or generated audio files.
- Commercial launch doctor now surfaces generated-audio paid validation status and artifact-evidence status separately from the manual-review draft so operators can distinguish provider execution, SHA/duration media capture, and listening approval before customer-traffic claims.
- Generated-audio manual-review readiness is now a no-spend gate through `npm.cmd run validation:generated-audio-review-readiness`; it reports `ready_for_manual_review` only after provider execution, output-batch, ledger, billing/schema, and artifact SHA/duration binding are ready, while keeping accepted listening review and business-readiness approval separate.
- Long-form manual-review readiness is now a no-spend gate through `npm.cmd run validation:long-form-review-readiness`; it reports `ready_for_manual_review` only after paid render completion, Atlas billing, artifact validation, 120-480s duration, cost-ledger evidence, rendered/compiled counts, and artifact fingerprint binding are ready, while keeping accepted quality/redaction review and business-readiness approval separate.
- Business-readiness planning now emits contract-validated budget-constrained paid slices for generated-audio smoke, long-form 120s minimum, full paid sequence, and source-video auto-analysis; report-contract validation rejects missing/duplicate slices, inconsistent budget status math, and any full-sequence budget-ready claim when required cost estimates are incomplete or over the approved cap.
- Agentic short-pipeline render handoff is now implemented through `ShortPipelineRenderHandoff` and `POST /v1/short-pipeline/render-jobs`; accepted review evidence can enter the normal async render-job lifecycle only after explicit confirmation, while pending review evidence pauses before provider spend.
- Agentic short-pipeline conversation backend is now implemented through `ShortPipelineConversationEngine`, `POST /v1/short-pipeline/conversation`, `npm.cmd run validation:short-pipeline-conversation`, and a report contract; it accepts natural-language turns, tracks revision intent, lets users reject templates, detects conversational approval intent without bypassing formal review, and stores only digests/redacted summaries in public evidence.
- Durable short-pipeline conversation session storage is now implemented through `ShortPipelineSessionStore`, `POST/GET /v1/short-pipeline/conversation-sessions`, `npm.cmd run validation:short-pipeline-session-store`, and a report contract; it persists only redacted no-spend session payloads, uses atomic file writes, scopes list/detail reads by API client, and refuses raw transcript, URL, local path, or secret-like residue.
- Stored short-pipeline session render handoff is now implemented through `POST /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs`, `npm.cmd run validation:short-pipeline-session-render-handoff`, and a report contract; it reads the server-side stored plan, rejects blocked or malformed session evidence, preserves client scope, creates paused jobs for pending review, blocks unsafe approved-looking review text, and requires `confirmRenderSubmission=true` before approved review can queue provider spend.
- First-party Short create/review shell is now served at `/short/create` and smoke-covered by `validation:short-mvp-ui-contract`; it creates durable no-spend conversation sessions, loads stored-session UI contracts, displays Director/workflow/review/action/checkpoint evidence, prepares reviewer/timestamp-bound approval packet drafts with `confirmRenderSubmission=false` by default, and keeps client API keys in browser memory while all `/v1` data routes remain protected.
- Short review operation evidence draft/validation is now implemented through `validation:short-review-operation-draft`, `validation:short-review-operation`, `validation:short-review-operation-guard`, and report contracts; it creates a non-evidence operator template/checklist, validates an ignored operator packet for accepted scene/audio/caption/claim reviewer operation evidence only when deployment-scoped, session-bound, redaction-reviewed, explicitly confirmed, and still no-spend/no-provider-submission, while rejecting unsafe accepted-looking review notes and direct template use.
- Short product-facts and media-rights evidence draft/validation is now implemented through `validation:short-product-rights-draft`, `validation:short-product-rights`, `validation:short-product-rights-guard`, and report contracts; it creates a non-evidence operator template/checklist, validates an ignored operator packet for accepted product facts, claim substantiation, product URL extraction hashes, media ownership, commercial-use approval, model-release status, trademark/third-party mark review, attribution digest, session binding, and redaction review only when explicitly confirmed, while rejecting unsafe accepted-looking product/rights notes and direct template use and keeping provider submission, paid render, artifact validation, manual media review, and customer traffic locked.
- Commercial launch doctor now refreshes both Short evidence guards, both non-evidence draft handoffs, and both accepted-packet validation reports so missing operator packets are visible as evidence blockers rather than hidden backend gaps.
- Product URL-to-Video backend extraction is now implemented through `ProductUrlResearcher`, `POST /v1/short-pipeline/product-url-plan`, `npm.cmd run validation:product-url-extraction`, and a report contract; it gates live fetching behind explicit confirmation, rejects unsafe query-bearing product URLs before fetch, extracts bounded safe product facts, feeds claim checkpoints into the short pipeline, and keeps raw product/media URLs out of public evidence.
- Async pre-export review is now implemented through `/v1/render-jobs`, `/v1/render-jobs/{jobId}/review`, `npm.cmd run validation:render-job-review-lifecycle`, and a report contract; after artifact validation, jobs can pause with retained result/artifact evidence and be approved for export without rerendering or reserving provider spend again.

Not yet complete:

- Real deployment capture from an HTTPS non-localhost host using `validation:deployment-readiness`.
- Real billing/admin/quota capture from an HTTPS deployment host with enabled client policies, persistent usage ledger, admin endpoint evidence, and non-secret billing/admin attestation; `validation:ops-config` now creates/promotes drafts and `validation:report-contracts` validates the raw ignored attestation packet when present before this capture.
- Real production operations capture from an HTTPS deployment host with durable storage, backups, restore test, monitoring, incident, support, redaction, and retention evidence; `validation:ops-config` now creates/promotes drafts and `validation:report-contracts` validates the raw ignored attestation packet when present before this capture.
- Real end-to-end Atlas render validation with paid credentials and FFmpeg/FFprobe available through `PATH` or configured binary paths.
- Real artifact review from a paid Atlas validation run, including validator output, review packet, cost ledger, stage lifecycle, and deliverable metadata.
- Live evidence run for source-video auto-analysis with a real clean HTTPS source video, deployment FFmpeg frame extraction, and the configured Atlas multimodal LLM. The adapter smoke, report contract, launch-doctor gate, validation runner, and spend gate are implemented; the archived live report is still pending.
- Live evidence run for remote stock provider validation with real Pexels/Pixabay/Coverr credentials and operator-approved commercial terms. The adapter smoke, report contract, launch-doctor gate, validation runner, and live-network gate are implemented; the archived live provider report is still pending.
- Live 2-8 minute long-form Atlas validation with an approved budget, passing paid-render artifacts, and artifact-bound manual quality/redaction review. The validation runner, schema, spend gate, budget gate, chunk-plan gate, fingerprint-bound manual review gate, no-spend manual review template/checklist helper, report contracts, and business-readiness evaluator are implemented; the archived passing paid report is still pending.
- Live Atlas-backed generated-audio business evidence; current generated-audio support includes provider-neutral ready-item execution plumbing, Atlas `xai/tts-v1` submit/poll mapping, paid `eve` output validation, approved output-batch evidence, and provider ledger evidence, but structured manual listening review remains pending before commercial use.
- Live short-pipeline render validation with accepted review evidence, explicit spend confirmation, artifact validation, and manual media review. The backend handoff, API route, smoke report, and report contract are implemented; archived live paid media evidence is still pending.
- Customer-grade short-pipeline review operation evidence and managed product workspace storage. The no-spend backend conversation route, opt-in durable redacted session store, first-party create/review shell, safe checkpoint controls, approval-packet contract, review-operation evidence draft/checklist, validator, and unsafe-review guard smoke are implemented; an operator-supplied accepted live reviewer operation packet, managed multi-instance storage/backups, media playback/library controls, and production UI QA evidence are still pending.
- Live Product URL-to-Video evidence with a real approved public product URL plus an operator-supplied accepted product-facts/media-rights packet. The bounded extractor, API route, no-spend smoke, accepted product/rights draft/checklist, validator, unsafe-note guard smoke, and report contracts are implemented; archived live URL evidence and a real accepted operator packet are still pending.
- Live multi-worker active provider-work resume evidence; current handoff support includes local leases, a built-in durable lease-service route, HTTPS external-lease heartbeat smoke evidence, idempotent action-ledger execution replay, digest-only Production Graph resume-state capsules, protected graph-resume queue-service enqueue/replay/lease/ack evidence, a graph-resume worker bridge smoke that enqueues and replays resume capsules through the protected service, local two-worker handoff validation, a production capture runner, template/checklist helpers for live provider actions and graph-resume enqueue payloads that cannot count as evidence, a live provider action validator that separates graph-resume enqueue evidence from provider callback evidence, and a separate digest-only graph-resume enqueue payload validator, but not archived deployed HA ownership evidence, live Atlas provider action execution evidence, live queue enqueue execution, or automatic graph resume.
- Media-level DirectorBench-style evidence; current `validation:quality-benchmark` covers artifact-contract scoring, confidence, bottlenecks, skipped audio when absent, report history, local FFprobe metadata, sampled-frame structural proxy signals, FFmpeg scene-change transition-boundary pre/post proxy signals when boundaries are detected, bounded FFmpeg audio waveform/volume proxy signals when audio is present, FFprobe audio-video duration-sync proxy signals when audio is present, optional structured semantic-review checkpoints via `--semantic-review`, optional structured audio-review checkpoints via `--audio-review`, optional structured ASR/lip-sync runtime checkpoints via `--runtime-review`, optional structured governance-review checkpoints via `--governance-review`, paid-artifact binding checks for structured review parity rows, optional generated-audio validation report evidence via `--generated-audio-validation` with artifact SHA binding required before provider-backed audio parity can be met, optional long-form validation report evidence via `--long-form-validation`, and a contract-validated `parityEvidenceMatrix`; `validation:quality-review-drafts` now creates artifact-bound `needs_review` packets for the manual/analyzer handoff, `validation:long-form-review-draft` creates the separate paid-artifact-bound long-form manual quality/redaction review template, `validation:quality-review-evidence` enforces schema/redaction safety before accepted review flags, and `validation:quality-review-guard` proves unsafe review text is rejected, but this still is not automated VLM/ASR/lip-sync analysis, accepted live generated-audio provider evidence, accepted paid long-form validation evidence, real archived long-form review evidence, accepted operator/legal governance evidence, or full upstream runtime parity.

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

Status as of 2026-06-19: Reference Implementations drafted/implemented for stage lifecycle, material sourcing, material-source scoring, postproduction asset orchestration, generated-audio intent planning, generated-audio execution planning, generated-audio provider execution runner, generated-audio output validation, generated-audio output batch validation, generated-audio batch artifact evidence, generated-audio asset resolution, generated-audio asset resolution catalog, generated-audio provider execution contracts, remote stock provider validation, Atlas generated-audio validation, long-form validation evidence, compact render-job history persistence, provider-state reconciliation foundation, local provider handoff/lease foundation, protected provider lease-service route, HTTPS external lease adapter plus heartbeat foundation, provider handoff action-ledger execution replay foundation, digest-only Production Graph resume-state capsules with local enqueue/replay/lease/ack queue lifecycle, protected Production Graph resume queue-service lifecycle, graph-resume worker bridge lifecycle, local two-worker handoff validation, production handoff capture runner, live provider action evidence validation with graph-resume enqueue evidence counting, and digest-only graph-resume enqueue payload evidence validation. `ProductionStagePlanner`, material sourcing graph node, DirectorAgent material planning, postproduction asset planning, generated-audio planned/ready evidence, generated-audio ready/blocked execution planning, provider-neutral generated-audio ready-item execution plumbing, generated-audio result-to-track validation, generated-audio batch result reconciliation, optional generated-audio batch artifact persistence/validation, generated-audio batch review-packet planning/status/recommendation evidence, generated-audio asset-to-HTTPS resolution, generated-audio asset resolution catalog preflight, generated-audio provider-neutral contracts, configurable Atlas generated-audio capability records, Atlas `generateAudio` submit/poll execution behind explicit validation spend gates, generated-audio business-readiness validation runner, generated-audio polling-resilience smoke, structured generated-audio manual review schema plus draft handoff, long-form request/readiness/budget/chunk validation runner, DirectorAgent stage progress reporting, async render-job progress polling, optional compact job-history restore through `CINEJELLY_API_JOB_HISTORY_PATH`, provider checkpoint summaries for active/terminal prediction audit, redacted provider reconciliation reports for active checkpoint prediction IDs, local, HTTP-service, and HTTPS-adapted provider handoff reports with terminal-close/continue-polling/heartbeat-retained/held-by-other/manual-audit actions, idempotent action-intent records plus persisted execution evidence for terminal-close/resume-polling/manual-audit callback replay, digest-only graph/provider-work resume-state capsule persistence, local graph-resume queue lifecycle persistence, protected graph-resume queue-service persistence, graph-resume worker bridge persistence through the protected service, local protected-route two-worker held-by-other/expiry handoff evidence, production HTTPS lease-service handoff capture tooling, live provider action evidence validation, graph-resume enqueue payload validation, Director-style structured review paid-artifact binding checks, artifact-bound Director review draft generation, accepted review-evidence schema/redaction guard smoke, stale queued/running job recovery as canceled/audit-required compact history, synchronous/async API artifact validation evidence, local material library adapter, opt-in remote stock material adapter, remote stock provider live-network validation runner, material source validation with URI-free candidate scoring/evaluation evidence, review-packet stage/postproduction planning evidence, and stage/material/postproduction artifacts are implemented. `node ./node_modules/typescript/bin/tsc --noEmit`, `node ./node_modules/typescript/bin/tsc -p tsconfig.json`, direct `node tests/run-material-source-scoring-smoke.mjs`, direct `node tests/run-render-job-history-smoke.mjs`, direct `node tests/run-render-provider-reconciliation-smoke.mjs`, direct `node tests/run-render-provider-handoff-smoke.mjs`, direct `node tests/run-render-provider-external-lease-smoke.mjs`, direct `node tests/run-render-provider-lease-service-smoke.mjs`, direct `node tests/run-render-provider-handoff-action-ledger-smoke.mjs`, direct `node tests/run-production-graph-resume-state-smoke.mjs`, direct `node tests/run-production-graph-resume-queue-service-smoke.mjs`, direct `node tests/run-render-provider-graph-resume-worker-smoke.mjs`, direct `node tests/run-render-provider-multi-worker-handoff-smoke.mjs`, direct `node tests/run-director-style-review-evidence-guard-smoke.mjs`, local no-network generated-audio execution-planner smoke, local no-network generated-audio provider-execution-runner smoke, local no-network generated-audio output-validation smoke, local no-network generated-audio output-batch-validation smoke, local no-network generated-audio batch-artifact validation smoke, local no-network generated-audio asset-resolution smoke, local no-network generated-audio asset-resolution catalog smoke, local no-network Atlas generated-audio submit/poll smoke, generated-audio validation gate smoke, generated-audio polling-resilience smoke, generated-audio manual-review draft contract validation, and long-form validation gate smoke passed for the foundation phases; real long-form Atlas validation, archived live remote stock provider evidence with real keys, structured manual review for the paid Atlas generated-audio output, accepted review drafts promoted by a real reviewer/analyzer, full first-party commercial Web UI beyond the current Short Studio/operator shells, and full distributed active provider-work resume with deployed multi-worker evidence, external live queue enqueue proof, graph-resume enqueue payload evidence, and live Atlas provider action execution remain pending.
- Generated-audio mapping smoke also passes on 2026-06-19 and narrows the earlier BGM/SFX mapping gap: it covers kind identity, provider preference, duration capability, safe result-to-track role mapping, and kind-mismatch rejection. It does not prove live BGM/SFX media quality, manual listening review, or customer traffic readiness.
- Short-pipeline conversation smoke also passes on 2026-06-19 and narrows the Director/VideoAgent-style conversational workflow gap: it covers natural-language brief intake, revision detection, optional-template rejection, approval-intent detection without formal approval bypass, no-spend planning, and raw transcript/URL redaction. It does not prove full customer-facing UI parity, durable customer session storage, live render evidence, or customer traffic readiness.
- Product URL-to-Video extraction smoke also passes on 2026-06-19 and narrows the first commercial short-video intake gap: it covers explicit live-network confirmation, unsafe query blocking before fetch, bounded HTML/JSON-LD extraction, planner handoff, claim checkpoints, and raw URL redaction. It does not prove archived live product-page evidence, product-media rights, manual fact approval, or customer traffic readiness.

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
- `docs/reference-implementations/render-job-history-persistence.md`
- `docs/reference-implementations/render-provider-reconciliation.md`
- `docs/reference-implementations/render-provider-handoff.md`
- `docs/reference-implementations/director-style-benchmark-harness.md`
- `docs/reference-implementations/api-artifact-validation-evidence.md`
- Explicit stage status model for plan, storyboard, prompt, source material, render, inspect, repair, assemble, deliver.
- Bounded async render-job stage progress telemetry with compact list summaries and detailed per-job progress events.
- Optional compact async render-job history persistence through `CINEJELLY_API_JOB_HISTORY_PATH`, with preflight validation, restored-history markers, bounded provider checkpoint summaries, and stale active job recovery as canceled/audit-required.
- Provider reconciliation foundation for querying active checkpoint prediction IDs through the provider abstraction and returning redacted terminal/still-active/query-failure evidence without raw provider payloads.
- Local provider handoff foundation for acquiring bounded file leases around reconciled active provider work, retaining still-active leases, releasing terminal leases, deferring held-by-other work, and emitting schema-validated no-spend evidence without claiming distributed resume.
- Protected provider lease-service route plus HTTPS external lease adapter foundation for acquire/release/heartbeat/list/active lease-service calls with deployment-token auth, HTTPS-only external base URLs, bearer-auth use without token serialization, strict response validation, and no-spend fake-service/local-server validation.
- Provider handoff action-ledger foundation for stable idempotency keys, durable redacted terminal-close/resume-polling/manual-audit action-intent replay, and persisted callback execution evidence, without executing live Atlas provider actions or claiming distributed resume.
- Production Graph resume-state capsule and protected HTTP queue-service foundation for stable digest-only graph/provider-work replay context, reloadable local persistence, active cursor summaries, deployment-token-protected idempotent enqueue/replay/lease/ack lifecycle, and hard false release/distributed-resume claims without storing raw graph state, output URLs, local paths, provider payloads, raw queue names, raw worker IDs, raw prediction IDs, or secrets.
- Graph-resume worker bridge foundation that reads idempotent provider handoff action records, finds matching digest-only resume-state capsules, enqueues only `resume_polling` work through the protected queue service, replays duplicate attempts by queue idempotency key, skips terminal/manual-audit actions, and keeps live-action/distributed-resume claims false.
- Local two-worker handoff validation proving the protected lease-service route blocks immediate lease stealing, allows ownership handoff after lease expiry, and replays the existing action intent instead of recording a duplicate.
- Production provider handoff capture runner for no-spend HTTPS deployment evidence across acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service calls without serializing deployment tokens or worker owner IDs.
- Live provider action evidence validator for ignored operator-owned action callback packets, requiring a passing production handoff capture, explicit confirmation, live provider-call evidence, resume-polling plus terminal/manual evidence, graph-resume enqueue evidence counting, and redaction review while still refusing distributed-resume claims.
- Graph-resume enqueue payload evidence validator for ignored operator-owned digest-only queue/graph/resume/prediction payload packets, requiring a passing live action report, explicit confirmation, action/job binding, no raw graph state/provider payload/output URL storage, and false distributed-resume/customer-release claims.
- Director-style benchmark harness for no-spend backend quality evidence across script, video, optional audio, stability, and cross-modal checkpoints, with confidence-weighted dimension scores, bottlenecks, schema validation, append-only JSONL history, optional local media probe/sampled-frame/transition-boundary/audio-waveform/audio-video-duration proxy evidence, optional structured semantic-review checkpoint ingestion, optional structured audio-review checkpoint ingestion, optional structured ASR/lip-sync runtime checkpoint ingestion, optional structured governance-review checkpoint ingestion, artifact-bound `needs_review` review draft generation, accepted-review schema/redaction guard smoke, optional generated-audio validation report ingestion with artifact SHA binding checks, optional long-form validation report ingestion, contract-validated `parityEvidenceMatrix`, and explicit `canClaimDirectorBenchParity=false` until full semantic/audio/runtime/governance/long-form media evidence exists.
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
- Atlas generated-audio polling resilience hardened so retryable transient polling failures keep active predictions polling until the overall timeout, structured terminal failed prediction bodies are parsed even when Atlas returns an HTTP error, and existing prediction IDs can be resume-polled without submitting another job; `validation:generated-audio-polling-resilience` proves the backend behavior with a fake provider and report contract.
- Operator-owned local material catalog fulfillment through safe `asset://` or credential-free HTTPS candidates, with `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` config and preflight validation.
- Opt-in remote stock material fulfillment through Pexels, Pixabay, and commercially approved Coverr providers, with key-gated runtime config, credential-free candidate URIs, attribution metadata, and centralized material validation.
- Done: `npm.cmd run validation:material-source-scoring` proves the no-spend material-source scoring contract across approved, review-required, and rejected candidate decisions without exposing raw candidate URIs.
- Done: `npm.cmd run validation:remote-stock` blocks before provider network calls unless `--confirm-live-network` is present, requires `--confirm-commercial-terms-reviewed` for commercial evidence, and emits versioned business-readiness evidence.
- Done: `npm.cmd run validation:generated-audio` blocks before Atlas audio provider execution unless `--confirm-provider-spend` is present, requires schema-review/manual-review evidence for business readiness, and emits versioned generated-audio business-readiness evidence.
- Done: `npm.cmd run validation:generated-audio-artifact` captures SHA-256, byte-size, ffprobe duration, and output binding for the already-generated clean audio URL only after `--confirm-live-network`, and structured manual review evidence must match that artifact report before it can pass.
- Done: `npm.cmd run validation:generated-audio-review-draft` prepares a no-spend operator template/checklist bound to a provider-backed generated-audio report, while `schemas/generated-audio-manual-review.schema.json` rejects copied `needs_review` drafts as final evidence.
- Done: `npm.cmd run validation:long-form` verifies 120-480s request admission, readiness, configured cost budget, provider-safe 4-15s chunk planning, paid-render wrapping, artifact evidence, and manual review before emitting versioned long-form business-readiness evidence.
- Done: `npm.cmd run validation:long-form-review-readiness` checks long-form paid artifact/manual-review readiness without provider calls and keeps business-readiness, DirectorBench parity, and customer traffic locked until the main long-form validation report passes.

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
- Retryable Atlas generated-audio polling failures no longer convert an active prediction into a final failure before the polling deadline; structured terminal failed bodies no longer poll until timeout; the no-spend smoke records both successful transient recovery and terminal failed-body handling.
- Generated-audio mapping smoke proves narration, BGM, ambience, and SFX stay as distinct provider-request kinds, map to narration/music/ambience/SFX mix roles only after safe output validation, keep provider preference binding strict, block overlong intents before spend, and reject kind-mismatched provider results before mixing; it remains no-spend backend evidence, not live audio quality approval.
- Paid Atlas generated-audio validation with the documented multilingual `eve` voice produced a provider-success result, approved output-batch evidence, and a succeeded provider ledger entry; generated-audio artifact evidence is captured and the manual-review readiness gate can report `ready_for_manual_review`, but business-readiness remains blocked until manual audio review passes and the generated-audio validation report is refreshed in review-existing mode.
- Generated-audio structured manual review cannot pass on URL/prediction binding alone; it must also carry matching artifact evidence from `generated-audio-artifact-evidence-report.json`.
- Generated-audio provider results cannot become final mix tracks unless output validation approves status, identity, kind, provider, model, duration, volume, and safe URL.
- Generated-audio provider result batches cannot become mix inputs unless every ready intent has exactly one matching result, stray or blocked-intent results are rejected, and approved tracks preserve execution-plan order.
- Generated-audio output batch artifacts are optional until provider-backed execution exists; when present, `generated-audio-output-batch-validation.json`, `run-summary.json`, `review-packet.json`, and `postproduction-assets.json` must agree on status/count evidence.
- Generated-audio `asset://` outputs cannot become final mix tracks unless asset resolution also approves the source asset, identity binding, provider/model binding, optional duration evidence, and credential-free HTTPS delivery URL.
- Generated-audio asset resolution catalogs fail preflight on duplicate `asset://` entries, unsafe URIs, malformed entries, or missing boolean approval fields.
- Local material catalog entries never expose filesystem paths in API/artifact candidate URIs.
- Remote stock candidates never expose API keys, signed URLs, or credential-like query parameters in candidate, source-page, or preview URIs.
- Running async jobs expose current stage, current stage status, progress event count, and retained detail events without local paths, inline media, secrets, or raw provider payloads.
- Running and restored async jobs expose compact provider checkpoint evidence in per-job detail when provider ledger entries exist, without raw provider payloads or local artifact paths.
- Provider checkpoint reconciliation reports expose only active prediction IDs, provider status, terminal/still-active decisions, output URL counts, and redacted errors; they do not claim durable distributed queue or automatic resume parity.
- Provider handoff reports expose only lease status/expiry, handoff action, prediction status evidence, and release-gate summary; they do not expose owner IDs, bearer tokens, or raw external service payloads and do not claim deployed durable queue, production multi-worker, or automatic graph-resume parity.
- Provider handoff action-ledger reports expose only action IDs, idempotency keys, job IDs, action kinds, prediction IDs, replay status, execution status, and provider-call counts; they do not expose raw provider payloads, output URLs, local paths, worker owner IDs, or claim live provider execution.
- Production handoff capture reports expose only operation summaries, lease counts, redacted response summaries, and release-gate status; they do not expose deployment tokens, worker owner IDs, raw lease payloads, or claim live provider execution.
- Director-style benchmark reports expose artifact-kind facts, redacted local media metadata/proxy signals, redacted transition-boundary proxy summaries, aggregate audio waveform/volume and audio-video duration proxy summaries, optional structured semantic-review checkpoint summaries, optional structured audio-review checkpoint summaries, optional structured ASR/lip-sync runtime checkpoint summaries, optional structured governance-review summaries, optional generated-audio validation status/count/gate/artifact-SHA-binding summaries, optional long-form validation status/duration/count/gate summaries, score/confidence summaries, bottlenecks, limitations, release-gate status, and a met/partial/missing parity evidence matrix; review draft/readiness/guard reports expose only artifact binding, draft paths, draft statuses, checklist state, readiness counts, and safe guard summaries; neither report family exposes provider payloads, media bytes, sampled frame paths, raw audio bytes, raw transcripts, output URLs, validation text, voice IDs, local artifact paths, tokens, or claim full DirectorBench parity.
- Synchronous render responses expose artifact validation status/checks, and terminal async jobs expose compact artifact validation status in list responses plus full validation checks in per-job responses without local artifact directories or manifest paths.

## Phase 6: Real Provider Validation

Status as of 2026-06-16T09:14:34.425Z: local no-spend validation passes in the clean release-candidate worktree. `node tests/run-local-validation-smoke.mjs` created a safe request, ran typecheck/build/client-policy quota smoke/readiness/request validation, started a temporary API, checked `/health`, checked protected `/v1/validation-readiness`, and wrote an ignored local smoke evidence report with readiness decision `review_warnings`: 60 checks total, 59 pass, 1 warn, and 0 fail. The only warning is `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true`, which is the intended spend-control posture for client-key-gated render submissions. Atlas keys, model IDs, API auth token, output directory, configured FFmpeg/FFprobe executable paths, Atlas LLM/media base URLs, pinned Seedance capability records, and API client policy preflight are present in the local ignored `.env`/runtime checks. A short paid Atlas validation render completed on 2026-06-15T13:33:55.217Z with request `req_8262f057-c412-4f84-8bdb-56cefd8757f2`, project `project_f87153061ebea88e`, 58 provider ledger entries, estimated cost gate `$3`, a 13.5s H.264 854x480 final MP4, and artifact validation status `pass`. This paid run was intentionally text-to-video with `audioMode:none`, so the no-audio inspection warning is expected. The clean release-candidate release audit is `release_ready`: local smoke, paid evidence, artifact validation, Git metadata, clean tracked worktree, ignored `.env`/outputs, tracked secret scan, and external import-boundary scan all pass; release audit accepts the single mandatory-client-policy readiness warning only when the configured policy preflight passes and reports `canUseAsPhase6ReleaseEvidence=true` while keeping `canReleaseToCustomerTraffic=false`. Manual short-validation media/artifact/redaction review passed for smoke-validation purposes; full customer traffic still requires production-quality review for real long-form/customer inputs. `npm.cmd run validation:business-readiness` is the no-spend full-platform gate that converts those remaining commercial blockers into a weighted evidence report.

Operator validation procedure: `docs/OPERATOR_RUNBOOK.md`.

Target module:

- Runtime config
- API endpoints
- Artifact store
- Operator runbook
- AtlasCloud docs conformance preflight
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
- Run `npm.cmd run validation:launch-intake -- --write-draft`, fill the ignored intake with real non-secret launch values and the commercial offer scope decision, then run `npm.cmd run validation:live-inputs` before live network or paid provider validation and keep it blocked until deployment, ops, fresh Atlas billing/budget readiness, source-video, remote-stock, generated-audio, budget, and API/CLI-only versus full first-party commercial Web UI scope inputs are ready for the intended gate.
- Run `npm.cmd run validation:commercial-inputs` to generate the JSON and Markdown checklist of exactly which operator inputs are still missing before asking for live credentials, deployment URLs, live provider action evidence, commercial scope approval, or budget approvals.
- Run `npm.cmd run validation:completion-audit` after `validation:launch-doctor` so the final standalone blocker summary includes commercial-launch-doctor code blockers and ops-config status alongside business-readiness, snapshot-parity, report-contract, and commercial-input evidence. During the doctor run itself, completion-audit skips the in-progress doctor report to avoid reading stale previous-run evidence.
- Run `npm.cmd run validation:launch-doctor` when an operator wants one local no-spend command to refresh build, snapshot parity guardrails, source-video auto-analysis smoke, local smoke, provider resume/handoff smoke evidence, provider live-action and graph-resume draft handoffs, release hygiene, Director-style quality benchmark, Director/generated-audio/long-form review draft handoffs, generated-audio and long-form review-readiness gates, review-evidence guard smoke, accepted review-evidence readiness, launch-intake draft/validation, ops-config operator attestation drafts/validation, commercial launch inputs, business-readiness, completion, and report-contract evidence before deciding the next live or paid gate.
- Run `npm.cmd run validation:business-readiness` and keep it blocked until real evidence exists for deployment preflight, Atlas billing readiness, long-form, source-video, remote stock, generated audio, billing/admin/quota controls, and production operations.
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
