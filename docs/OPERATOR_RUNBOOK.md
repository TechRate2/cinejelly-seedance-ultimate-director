# CineJelly Operator Runbook
> ⚠️ **TÀI LIỆU THIẾT KẾ — KHÔNG PHẢI MÔ TẢ CODE HIỆN TẠI.**
> Cập nhật lần cuối: **2026-07-02**. Từ đó tới nay mã nguồn đã đổi rất nhiều.
> Đọc [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md) để biết dự án HIỆN TẠI ra sao.
> Khi tài liệu này mâu thuẫn với code, **code đúng** — tài liệu là cái sai.


This runbook is the Phase 6 operating checklist for taking CineJelly Seedance Ultimate Director from a validated code foundation to a real provider validation run. It does not contain secrets, sample keys, mock providers, or demo production files.

## Current Readiness

As of 2026-06-16T06:05:12.303Z, the current local workstation passes the no-spend local validation smoke through `node tests/run-local-validation-smoke.mjs`. The latest local readiness report has 60 checks: 60 pass, 0 warn, and 0 fail, with decision `ready_for_paid_validation`. Atlas keys, model IDs, Atlas LLM/media base URLs, API auth token, output directory, explicit FFmpeg/FFprobe executable paths, pinned Seedance capability records, and the optional API client policy preflight are present in the ignored local `.env`/runtime checks. The local `.env` can use Atlas's two-key layout: `ATLASCLOUD_API_KEY` for media/upload/video under `/api/v1` and `ATLASCLOUD_LLM_API_KEY` for chat completions under `/v1`. If the separate LLM key returns authentication or plan errors during validation, replace only `ATLASCLOUD_LLM_API_KEY` with a working Coding Plan key or temporarily reuse the known-working Atlas key until the Atlas wallet is corrected.

The API has also been started locally from `dist/api/server.js` with `.env` loading, and `GET /health` plus protected `GET /v1/validation-readiness` returned `ready_for_paid_validation`. A no-spend render request validation succeeded for a valid 15-second operator request, and `validation:client-policy-smoke` passed for digest auth, quota reservation, JSONL usage-ledger writing, and quota blocking. One short paid Atlas validation render completed on 2026-06-15T13:33:55.217Z with request `req_8262f057-c412-4f84-8bdb-56cefd8757f2`, project `project_f87153061ebea88e`, 58 provider ledger entries, estimated cost gate `$3`, a 13.5s H.264 854x480 final MP4, and artifact validation status `pass`. This run used `audioMode:none`, so no audio stream is expected.

The clean release-candidate worktree passes the no-spend release audit as `release_ready`: local smoke, paid-render evidence, paid artifact validation, Git metadata, clean tracked worktree, ignored `.env`/outputs, tracked secret scan, and import-boundary scan pass. The original interrupted clone still has unrelated upstream snapshot line-ending dirt, so use the release-candidate worktree for release evidence. Manual media quality, artifact, and redaction review still remain required.

The repo also provides `npm.cmd run validation:render-request -- --request <request-json>` as a no-spend request validator and `npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>` as a readiness-gated paid-render validation runner. Request validation checks the operator-owned JSON payload through the same admission and output-root normalization used by API render paths, but it does not initialize providers, run readiness, call Atlas, or write render artifacts. Paid-render validation stops before provider spend when readiness is blocked, when readiness warnings are not explicitly accepted, when `--confirm-paid-spend` is missing, or when a fresh Atlas billing-readiness report does not prove the approved budget covers the request. It writes success or failure artifacts, validates them, and emits a redacted operator report. It does not replace manual artifact and media review.

Do not open customer traffic until all checks in this runbook pass, the Git/source-hygiene audit is trustworthy, at least one paid Atlas render has been inspected, manual redaction review is complete, and `npm.cmd run validation:business-readiness` is no longer `blocked`. Do not run another `validation:paid-render -- --confirm-paid-spend --atlas-billing-report <atlas-billing-report>` unless the operator has explicitly accepted any readiness warnings, supplied fresh Atlas billing-readiness evidence, and approved Atlas credit spend for that specific run.

## Required Environment

Configure secrets and provider IDs through environment variables only:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_API_KEY` when the deployment uses a separate Atlas key for LLM calls
- `ATLASCLOUD_LLM_BASE_URL` when overriding the default Atlas LLM `/v1` base URL
- `ATLASCLOUD_MEDIA_BASE_URL` or `ATLASCLOUD_BASE_URL` when overriding the default Atlas image/video/upload `/api/v1` base URL
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `CINEJELLY_API_AUTH_TOKEN`

If an Atlas base URL override points at `api.atlascloud.ai`, preflight enforces the documented split: LLM overrides must use `/v1`, and media/upload/video overrides must use `/api/v1`. The `atlascloud_docs_conformance` preflight check also verifies the local endpoint family wiring for LLM, media model calls, billing `/balance`, and configured Seedance capability coverage before paid validation. Use a different clean HTTPS host only when routing through an approved proxy.

Recommended production controls:

- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_FFMPEG_PATH`
- `CINEJELLY_FFPROBE_PATH`
- `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH`
- `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS`
- `CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS`
- `CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `COVERR_API_KEY`
- `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`
- `CINEJELLY_API_CLIENTS_JSON`
- `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER`
- `CINEJELLY_CLIENT_USAGE_LEDGER_PATH`
- `CINEJELLY_API_JOB_HISTORY_PATH`
- `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH`
- `CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH`
- `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_LIMIT`
- `CINEJELLY_MAX_GENERATED_AUDIO_INTENTS`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `ATLASCLOUD_GENERATED_AUDIO_MODEL`
- `ATLASCLOUD_GENERATED_AUDIO_VOICE_ID`
- `ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS`
- `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON`

Install and verify media tools:

```powershell
ffmpeg -version
ffprobe -version
```

If the deployment uses portable media-tool binaries instead of global `PATH`, set `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH` to executable command paths and then run preflight. Preflight and runtime media engines use the same resolved commands, so a path override must be validated before paid provider work.

`CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` is optional. When set, it must point to an operator-owned JSON catalog whose entries use safe `asset://` or credential-free HTTPS `assetUri` values, approved rights metadata, bounded labels/tags, and no local filesystem paths or signed URL credentials. Missing this variable keeps material fulfillment in a planned-only state.

`CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` is optional and enables remote stock material adapters. At least one approved provider key must be configured. Pexels uses `PEXELS_API_KEY`, Pixabay uses `PIXABAY_API_KEY`, and Coverr uses `COVERR_API_KEY` only when `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true` confirms the deployment has accepted the required commercial terms. Provider keys must never appear in request payloads, artifacts, or logs.

`CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true` is optional and enables automatic source-video deconstruction for clean HTTPS `source_video_structure` references when the request does not already include `sourceVideoAnalysis`. Configure `CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR`, `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS`, `CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES`, and `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR` as needed. Keep the default fail-open behavior for early validation; set fail-on-error only when the configured multimodal LLM and FFmpeg frame extraction are validated for production inputs.

`CINEJELLY_MAX_GENERATED_AUDIO_INTENTS` controls how many generated-audio planning requests the API accepts per render request. These intents are recorded as reviewable generated-audio evidence for narration, BGM, ambience, or SFX; CineJelly can plan provider-neutral requests, validate provider results, and resolve reviewed generated-audio `asset://` outputs to credential-free HTTPS mix inputs. `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` can expose reviewed Atlas audio capability records to the planner, but generated-audio business readiness still requires the dedicated `validation:generated-audio` evidence gate with explicit spend, schema review, output validation, ledger, and manual audio review.
Preflight, live-input checks, and business-readiness planning validate `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` shape when configured, and report generated-audio execution as disabled when no reviewed capability records are present.

`CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH` is optional. When set, it must point to an operator-owned JSON catalog whose entries map clean generated-audio `asset://` outputs to credential-free HTTPS delivery URLs, include boolean `approvedForMix`, avoid duplicate `assetUri` values, and carry optional intent/provider/model/duration evidence when available. Preflight validates this catalog only; it does not call audio providers or create generated-audio assets.

`CINEJELLY_API_JOB_HISTORY_PATH` is optional but recommended for production operators. When set, it must point to an ignored durable JSON path. CineJelly persists compact async job summaries and restores them after API restart with `retentionSource=history_store` and `detailRetention=compact_restored`; raw render requests, local artifact paths, provider payloads, and secrets are not stored there. Stale queued/running jobs restore as canceled/audit-required because active provider work is not resumed automatically.

Short Studio persistence defaults under `CINEJELLY_OUTPUT_DIR`: sessions use `short-pipeline-sessions.json`, and reusable channel/KOL/style profiles use `short-channel-styles.json`. Override `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH` or `CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH` only when those UI continuity files need a separate durable volume. CineJelly persists only redacted no-spend session payloads with message digests/summaries, client-scoped list/detail access, and formal review gates still intact; raw transcript text, raw product/media URLs, local paths, and secret-like values are refused. Channel-style profiles also reject local paths and secret-like residue. `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_LIMIT` and `CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_LIMIT` control retained records and default to 200.

## Preflight Gate

Run:

```powershell
npm.cmd install
npm.cmd run doctor
```

The doctor command runs local setup, preserves existing `.env` secrets, writes documented Seedance capability assumptions when absent, detects FFmpeg/FFprobe where possible, creates a safe request, runs typecheck/build/readiness/request validation, starts a temporary API when needed, checks `/health` plus `/v1/validation-readiness`, prints a readiness summary, and writes `assets/output_deliverables/phase6-validation/local-smoke-report.json`. It does not call Atlas rendering or write render artifacts. The local smoke report is pre-paid evidence only; it is not release approval.

If running the gates manually instead, run:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preflight
npm.cmd run validation:create-request -- --safe-default
npm.cmd run validation:render-request -- --request "assets/output_deliverables/phase6-validation/request.json" --output "phase6-validation/request-validation-report.json"
npm.cmd run validation:readiness
```

Pass criteria:

- `npm.cmd run typecheck` exits `0`.
- `npm.cmd run build` exits `0`.
- `npm.cmd run preflight` exits `0`.
- `npm.cmd run validation:render-request -- --request <request-json>` exits `0` for the operator-owned paid-validation request and the report status is `pass`.
- `npm.cmd run validation:readiness` exits `0` and the report decision is `ready_for_paid_validation` or `review_warnings`.
- Preflight report has no `fail` checks.
- Any `warn` check is reviewed and intentionally accepted before paid rendering.

To persist the readiness report with validation evidence:

```powershell
npm.cmd run validation:readiness -- --output "phase6-validation/readiness-report.json"
```

The readiness report is a pre-paid gate only. It must not be used as release approval without the paid Atlas render, artifact validation, artifact inspection, and redaction review below.

The request-validation report is a request-contract gate only. It proves the supplied JSON can pass CineJelly admission and path normalization; it does not prove provider readiness, media-tool readiness, prompt quality, or render success.

The release audit is the final no-spend gate. It is expected to return `blocked` before paid validation has produced evidence:

```powershell
npm.cmd run validation:release-audit
```

It reads the local smoke report, paid-render report, artifact validation summary, git cleanliness, ignored `.env`/output paths, tracked secret scan, and external import boundary. It does not call Atlas or inspect video quality. Treat a non-zero exit as expected until paid render evidence and manual review prerequisites exist. When it returns `release_ready`, `releaseGateSummary.canUseAsPhase6ReleaseEvidence=true` means the report can feed the full business-readiness audit; `releaseGateSummary.canReleaseToCustomerTraffic` remains `false` because commercial traffic is controlled only by `validation:business-readiness`. If `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true` is the only readiness warning and the configured client policy preflight passes, release audit treats that warning as an accepted spend-control posture rather than asking operators to disable quota enforcement.

For the full commercial-platform release gate, run:

```powershell
npm.cmd run validation:business-readiness
npm.cmd run validation:live-inputs
npm.cmd run validation:business-plan
npm.cmd run validation:atlas-billing
npm.cmd run validation:deployment-package
npm.cmd run validation:launch-intake -- --write-draft
npm.cmd run validation:launch-intake
npm.cmd run validation:commercial-inputs
npm.cmd run validation:completion-audit
npm.cmd run validation:report-contracts
```

This no-spend audit reads the release audit, short paid-render report, manual review report, and explicit evidence reports for deployment preflight, Atlas billing readiness, 2-8 minute long-form validation, live source-video auto-analysis, live remote stock provider validation, live generated-audio provider validation, billing/admin/quota controls, and production storage/observability/support. It writes `assets/output_deliverables/phase6-validation/business-readiness-report.json` and exits non-zero while any required evidence gate is missing. Atlas billing readiness is a hard pre-paid-spend gate but does not add weighted product-completion credit; `canRunAdditionalPaidValidation` and `canRunLongFormValidation` remain false while the Atlas billing/budget gate fails. The report can still list narrow budget-ready paid slices in `readyPaidGates`; treat them as slice-only permission while `shouldDeferFullSequenceSpend=true` or customer release is blocked. A non-zero result is expected for the current snapshot until the remaining commercial evidence exists.

The `validation:live-inputs` command is also no-spend and no-network. It reads only local env shape, optional `ops/commercial-launch-intake.json`, ops reports, Atlas billing-readiness evidence, attestation presence, clean deployment/source-video URL shape, remote-stock approvals, generated-audio capability inputs, and known cost estimates, then writes `assets/output_deliverables/business-readiness/live-readiness-inputs-report.json`. A passing launch intake can supply missing clean deployment/source-video URLs, budget ceiling, source-video enablement, remote-stock intent, and attestation paths, but explicit CLI flags and environment variables remain authoritative. It makes no Atlas, deployment, stock-provider, source-video, FFmpeg, render, or billing-provider calls. Treat `shouldDeferAtlasSpend=true` as the default unless the specific live or paid gate is ready and the Atlas billing/budget gate passes.

The `validation:business-plan` command is also no-spend and no-network. It reads the current business-readiness report, optional launch intake, ops-config report, Atlas billing-readiness reports, and secret-free environment shape, then writes `assets/output_deliverables/business-readiness/business-readiness-validation-plan.json` with the remaining validation sequence, missing operator inputs, known paid-cost estimates, and a spend-deferral recommendation. It always surfaces `commercial_launch_intake_precheck` so missing non-secret launch values are visible before live network or paid Atlas commands. It can mark an independently budgeted paid slice ready, such as generated-audio smoke, while still deferring full-sequence spend and customer release. It is a planning aid only; it does not replace any evidence gate and it must not be used as release approval.

The `validation:atlas-billing` command is no-spend and local-only unless `--confirm-live-network` is present. With confirmation it calls only Atlas Billing Public API `/balance`, writes `assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json`, checks the configured billing-capable Atlas key and current budget/balance fit, and still reports `canReleaseToCustomerTraffic=false`. Downstream paid-validation gates reject stored Atlas billing reports older than `CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS` (default 24 hours), so refresh this report shortly before any approved paid validation run.

The `validation:launch-intake` command is also no-spend and no-network. It validates an ignored `ops/commercial-launch-intake.json` file that may contain only clean URLs, env var names, commercial offer scope, budget approvals, provider choices, non-secret operator names, and manual-review policy. Run it with `--write-draft` to create `assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake.draft.json` plus `commercial-launch-intake-fillout.md`, then copy the filled draft into `ops/commercial-launch-intake.json`. A passing intake is consumed by `validation:live-inputs`, `validation:business-plan`, and `validation:commercial-inputs` as a secret-free operator input source, and `validation:report-contracts` also validates the raw ignored intake against `schemas/commercial-launch-intake.schema.json` when the file exists. It rejects raw keys, bearer tokens, signed URLs, placeholder text, localhost deployment URLs, ambiguous commercial scope, API/CLI-only launches that pretend to rely on a full first-party commercial Web UI, UI-required launches that do not keep customer traffic blocked, and budget scopes that do not cover the current business-plan estimate. It does not approve customer traffic or paid Atlas execution by itself.

The `validation:commercial-inputs` command is also no-spend and no-network. It reads the current business-readiness, business-plan, live-inputs, launch-intake, Atlas billing, ops-config, live provider action, and graph-resume enqueue reports, then writes `assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json` plus a Markdown checklist at `assets/output_deliverables/business-readiness/commercial-launch-inputs-checklist.md`. Use it as the secret-free handoff packet for the remaining deployment URL, deployment token placeholder, commercial offer scope decision, operator attestations, live provider action evidence packet, graph-resume enqueue payload evidence packet, source-video inputs, remote-stock provider choices, approved Atlas budget, and manual review tasks. The JSON report also contains `operatorHandoffManifest`, a safe-to-share machine-readable map of ignored `ops/*` input files, generated draft/template files, report archives, env placeholders, and guarded command order; it deliberately records `releaseEvidence=false` and contains no raw secret values, provider payloads, local absolute paths, or customer media. The report names any currently ready paid slice in `readyPaidGates`, includes a no-secret Atlas configuration summary, audits the generated command plan against `package.json` scripts and required paid-spend guard flags, and keeps `shouldDeferFullSequenceSpend=true` while the full paid plan is still blocked. It is not release evidence and cannot override `validation:business-readiness`.

The `validation:launch-doctor` command is the no-spend one-command local audit. It refreshes build, deployment package, source-video auto-analysis smoke, remote-stock adapter smoke, generated-audio mapping smoke, optional local smoke, local provider resume/handoff smoke evidence including the digest-only Production Graph resume-state capsule, protected queue-service lifecycle, and graph-resume worker bridge lifecycle, provider live-action and graph-resume draft handoffs, release audit, Director-style quality benchmark, Director/generated-audio/long-form review draft handoffs, generated-audio and long-form manual-review readiness, review-evidence guard smoke, accepted review-evidence readiness, launch-intake draft/validation, ops-config operator attestation drafts/validation, live inputs, business plan, commercial inputs, completion audit, commercial offer scope, business-readiness, and report-contract evidence into `assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json` plus Markdown. The refreshed source-video smoke, remote-stock adapter smoke, generated-audio mapping smoke, quality benchmark, review-draft, review-evidence guard, review-evidence readiness, ops-config, commercial offer scope, and provider-handoff smoke statuses appear in the doctor snapshot, but benchmark `review_required` or `blocked` status, draft pass, guard pass, source-video smoke pass, remote-stock adapter smoke pass, generated-audio mapping smoke pass, generated-audio/long-form review-readiness status, missing/incomplete review-evidence packets, local handoff smoke passes, and resume-state capsule/queue-service/worker-bridge passes remain backend/product/evidence status; they do not become customer-traffic approval, production deployment proof, live source-video evidence, live remote-stock provider evidence, accepted generated-audio media evidence, accepted long-form media evidence, or distributed resume parity.

The `validation:generated-audio-mapping` command is no-spend and no-network. It builds the generated-audio planner/output-validator boundary with synthetic narration, BGM, ambience, and SFX intents; proves request kind identity, provider-preference blocking, duration blocking, safe result-to-track role mapping, and kind-mismatch rejection; and writes `assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json`. The public report stores output URL SHA-256 fingerprints only. It does not call Atlas, create audio files, validate live BGM/SFX quality, or replace generated-audio artifact capture and manual listening review.

The `validation:completion-audit` command is also no-spend and no-network. It reads the current business-readiness, business-plan, live-inputs, launch-intake, commercial-launch-inputs, release-audit, snapshot-parity, report-contracts, commercial-launch-doctor, and ops-config reports, then writes `assets/output_deliverables/business-readiness/business-completion-audit-report.json` plus `assets/output_deliverables/business-readiness/business-completion-audit.md`; when `validation:launch-doctor` invokes it mid-run, the doctor passes `--skip-launch-doctor-report` so completion-audit does not read a stale previous doctor report. Use it to separate remaining code/schema/command-plan/launch-doctor blockers from true external launch blockers such as the real deployment URL, commercial scope decision, operator attestations, budget approval, source-video settings, remote-stock provider evidence, paid Atlas validation, and manual review. It also exposes `commercialOfferScopeSummary`, `snapshotParityCoverageSummary`, `evidenceClosurePlan`, and `productCodeGaps` for full snapshot/product-completeness work, including whether the full first-party commercial Web UI is still a pending product-scope decision, explicitly scoped out for API/CLI-only launch, or required before customer traffic; per-upstream snapshot estimate ranges and main gaps; ordered blocker closure phases with required input IDs, env placeholders, related operator input/draft/report archive paths, command guard flags, local no-spend preparation commands, execution-readiness verdicts, and direct evidence commands; distributed active provider-work resume; and full semantic/audio/runtime/governance/generated-audio DirectorBench-style benchmark evidence gaps. `npm.cmd run validation:quality-review-drafts` is a no-spend handoff helper that pre-fills artifact-bound semantic/audio/runtime/governance review JSON drafts plus a checklist; every generated checkpoint stays `needs_review`, so drafts do not satisfy parity rows until a real reviewer or approved analyzer updates them. `npm.cmd run validation:quality-review-guard` is a no-spend guard smoke that proves the review-evidence readiness validator accepts a clean artifact-bound accepted bundle, rejects an accepted-looking packet with unsafe URL/token-like review text, and does not echo that unsafe text in public output. `npm.cmd run validation:quality-review-evidence` is a no-spend bundle validator for the archived semantic/audio/runtime/governance packets; it only marks accepted review evidence usable when all four packets are present, schema/redaction safe, explicitly `accepted`, complete for the required checkpoint names, and bound to the paid-render project/request/deliverable fingerprint, while still keeping `canClaimDirectorBenchParity=false`. `npm.cmd run validation:quality-benchmark` is a no-spend DirectorBench-style backend harness that reads existing paid-render/request/manual-review evidence plus optional structured semantic-review JSON, optional structured audio-review JSON, optional structured ASR/lip-sync runtime-review JSON, optional structured governance-review JSON, optional generated-audio validation report JSON, optional long-form validation report JSON, and an optional local media file, then writes script/video/audio/stability/cross-modal score, confidence, bottleneck, limitation, FFprobe metadata, sampled-frame proxy signal, FFmpeg scene-change transition-boundary proxy signal when boundaries are detected, bounded FFmpeg audio waveform/volume proxy signal when audio is present, FFprobe audio-video duration-sync proxy signal when audio is present, optional `semantic_review_checkpoint`, `audio_review_checkpoint`, `runtime_review_checkpoint`, governance-review parity evidence, generated-audio provider-evidence summaries, long-form validation evidence summaries, release-gate evidence, and a `parityEvidenceMatrix` that lists met, partial, and missing DirectorBench-style requirements. The current short no-audio smoke can be useful as a real example, but it must remain `review_required` and must not be used to claim long-form, generated-audio, accepted semantic/audio/runtime/governance review, or customer-traffic readiness; it currently has no detected scene-change boundary at the default threshold, no default accepted semantic/audio/runtime/governance-review packets, the default generated-audio validation report is still blocked before provider spend, and the default long-form validation report is still blocked before approved budget/billing/paid-render/manual-review evidence. `npm.cmd run validation:provider-reconciliation` is a no-spend fake-provider smoke for the redacted provider-state reconciliation foundation; `npm.cmd run validation:provider-handoff` is a no-spend local file-lease/action/heartbeat smoke for terminal-close, continue-polling, held-by-other, and no-checkpoint decisions; `npm.cmd run validation:provider-external-lease` is a no-spend fake-service smoke for the HTTPS external lease adapter contract, including heartbeat renewal; `npm.cmd run validation:provider-lease-service` is a no-spend local-server smoke for the protected built-in lease-service route; `npm.cmd run validation:provider-handoff-actions` is a no-spend smoke for idempotent terminal-close/resume-polling/manual-audit action-intent replay plus one-time callback execution persistence; `npm.cmd run validation:provider-multi-worker-handoff` is a no-spend local two-worker smoke proving the protected route blocks immediate lease stealing, allows takeover after expiry, and replays the existing resume intent instead of duplicating it; `npm.cmd run validation:provider-production-handoff -- --base-url https://<your-cinejelly-host>` is a no-spend HTTPS deployment capture for acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service calls; `npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions` validates an ignored operator-owned packet proving live provider callbacks for resume polling plus terminal closeout or manual-audit handoff, and separately counts only same-entry `resume_polling` + `graph_resume_enqueue` + `resume_enqueued` evidence before the graph-resume evidence slice can become usable; `npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues` validates a separate digest-only enqueue payload packet bound to the live action report without queue, provider, or deployment calls. These commands do not submit new Atlas render work or prove distributed resume by themselves. Only the production capture command can become deployment handoff evidence, and only when it is run against a real HTTPS non-localhost host with deployment auth; only the live-actions validator can count provider action evidence; only the graph-resume validator can count payload enqueue proof; all of them require real live evidence and explicit confirmation. They may confirm that Atlas key/model configuration is already present, but they never approve customer traffic, never replace `validation:business-readiness`, and must not be used to claim 100% parity while `canClaimFullSnapshotParity=false`.

`npm.cmd run validation:graph-resume-state` is the no-spend digest-only Production Graph resume-state capsule plus local queue smoke. It creates and reloads a capsule from a fake graph that intentionally contains unsafe prompt text, output URLs, local paths, bearer/token-like metadata, and provider prediction IDs, runs local enqueue/replay/lease/ack queue lifecycle evidence, then verifies the public report stores only safe counts and hashes while keeping raw queue names, raw worker IDs, distributed-resume, and customer-release claims out.

`npm.cmd run validation:graph-resume-queue-service` is the no-spend protected queue-service smoke. It starts a local API with `CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH`, verifies `/v1/preflight` sees a writable queue path, rejects unauthenticated queue operations, and exercises `/v1/production-graph-resume-queue/enqueue`, `/lease`, `/acknowledge`, and `/records` through the deployment token without serializing raw queue names, worker IDs, deployment tokens, prediction IDs, URLs, or local paths.

`npm.cmd run validation:provider-graph-resume-worker` is the no-spend worker bridge smoke. It starts a local protected API, records idempotent handoff action intents, creates a matching digest-only resume-state capsule for the `resume_polling` action, enqueues that capsule through the protected queue-service client, reruns the worker to prove idempotent replay, and verifies terminal/manual-audit actions are skipped. It never calls Atlas, never stores raw queue names/prediction IDs/output URLs/local paths/tokens in public evidence, and cannot be used as live provider action evidence or graph-resume payload evidence.

Run `npm.cmd run validation:provider-live-action-draft` before filling `ops/render-provider-live-actions.json` when you want a no-spend template and checklist for the live callback packet. Run `npm.cmd run validation:provider-graph-resume-draft` before filling `ops/render-provider-graph-resume-enqueues.json` when you want the matching graph-resume enqueue payload template/checklist. Both generated templates are intentionally marked template-only and keep evidence booleans false or placeholder/redaction fields unsafe, so they must not be copied directly as evidence and cannot unlock graph-resume or distributed-resume claims. Live action and graph-resume packets must use safe placeholder-free identifiers only, with no raw URLs, local paths, tokens, signed credentials, or raw provider payloads in any public evidence field. Fill `ops/render-provider-graph-resume-enqueues.json` only after the same deployment worker has actually enqueued graph resume; store SHA-256 digests and safe summaries only, then validate it with `validation:provider-graph-resume`.

The `validation:deployment-package` command is also no-spend and no-network. It reads only `Dockerfile`, `.dockerignore`, `.env.production.template`, and the container packaging reference doc, then writes `assets/output_deliverables/business-readiness/deployment-package-validation-report.json`. It does not call Docker, Atlas, FFmpeg, deployment hosts, render routes, or billing providers. A pass means the static package path is ready to build elsewhere; it does not replace real HTTPS deployment capture.

The `validation:report-contracts` command is also no-spend and no-network. It validates generated release/business-readiness JSON reports against their local schemas plus documented report-local semantic invariants, writes `assets/output_deliverables/business-readiness/report-contract-validation-report.json`, and catches schema or checklist-command drift before reports are shared or used as evidence. A schema/contract pass is not release approval; business-readiness status still controls customer traffic.

Create the deployment preflight evidence with the no-spend capture command after the API is deployed to its real HTTPS host:

```powershell
$env:CINEJELLY_DEPLOYMENT_BASE_URL = "https://<your-cinejelly-host>"
$env:CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN = "<deployment-token>"
npm.cmd run validation:deployment-readiness
```

The capture calls only `GET /health`, `GET /v1/preflight`, `GET /v1/validation-readiness`, and `GET /v1/render-settings`; it does not submit render work or call Atlas. Localhost captures are useful for smoke testing but are marked `environmentKind: local` and cannot satisfy the business-readiness deployment gate.

Create the 2-8 minute long-form evidence through the dedicated spend-gated runner. First run the request, readiness, budget, and chunk-plan checks without paid confirmation:

```powershell
npm.cmd run validation:long-form -- --duration-seconds 120
```

This writes `assets/output_deliverables/business-readiness/long-form-validation-report.json` and may stop as `blocked_by_budget` when the local `--max-cost-usd` ceiling is lower than the estimated configured cost, or as `blocked_by_spend_confirmation` when the budget is acceptable but `--confirm-paid-spend` is missing. Both outcomes are no-spend and make no Atlas render calls.

Before live long-form validation, refresh the long-form Atlas billing report for that exact request budget:

```powershell
npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-budget> --planned-cost-usd <estimated-long-form-cost> --output assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json --confirm-live-network
```

Run live long-form validation only after approving Atlas spend for that exact request and budget:

```powershell
npm.cmd run validation:long-form -- --request "assets/output_deliverables/business-readiness/long-form-request.json" --max-cost-usd <approved-budget> --confirm-paid-spend
```

If readiness returns warnings that the operator intentionally accepts, add `--allow-warnings`. The runner delegates provider work to `validation:paid-render` only after the slice billing report is fresh and matches the current estimate, then requires paid completion, artifact validation `pass`, a final duration from 120 to 480 seconds, provider-safe 4-15 second chunks, rendered-shot evidence, and manual quality/redaction review JSON bound to the emitted paid `projectId`, `manifestSha256`, and `deliverableSha256` before business-readiness can count the report. After the paid report emits artifact fingerprints, run `npm.cmd run validation:long-form-review-draft -- --force` to create the review template/checklist, then run `npm.cmd run validation:long-form-review-readiness` to confirm whether the paid artifact is actually ready for manual review. Fill `ops/long-form-manual-quality-review.json` from the paid artifact evidence only after inspecting the paid media and redaction posture. Use `--manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review`; a bare confirmation flag, a template-only JSON file, a pass packet without reviewer/reviewedAt, or a packet without all quality checks accepted is archived but not accepted. See `docs/reference-implementations/long-form-validation-runner.md` for the exact report contract.

Before spending on live source-video analysis, run the no-spend adapter smoke:

```powershell
npm.cmd run validation:source-video-auto-analysis-smoke
```

This smoke uses synthetic frame files and a fake LLM provider to prove disabled/no-overwrite/unsafe-skip/success/leak-guard/strict-failure behavior. It writes `assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json`, makes no Atlas, FFmpeg, source-video, or provider calls, and must not be treated as business-readiness source-video evidence.

Create the live source-video auto-analysis evidence with a real, clean HTTPS source video that has no credentials or signed query parameters. First run the spend gate without confirmation to verify the report path and source URL checks:

```powershell
npm.cmd run validation:source-video-auto-analysis -- --source-video-url "https://<clean-public-source-video>.mp4"
```

Before paid source-video validation, refresh the slice-specific Atlas billing report for the exact source-video LLM budget the operator approves:

```powershell
npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-source-video-budget-usd> --planned-cost-usd <approved-source-video-budget-usd> --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network
```

Then run the live validation only after approving Atlas LLM spend and source-video fetch for that specific video and budget:

```powershell
npm.cmd run validation:source-video-auto-analysis -- --source-video-url "https://<clean-public-source-video>.mp4" --confirm-provider-spend --max-cost-usd <approved-source-video-budget-usd> --atlas-billing-report assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json
```

If readiness returns warnings that the operator intentionally accepts, add `--allow-warnings`. The runner blocks as `blocked_by_atlas_billing` before FFmpeg fetch or Atlas LLM calls unless the source-video billing report is fresh, passed, captured `/balance`, matches `--max-cost-usd`, and covers that budget cap. When unblocked, it samples bounded frames with FFmpeg, sends them through the configured Atlas LLM provider, normalizes the result through `SourceVideoAnalyst`, and writes `assets/output_deliverables/business-readiness/source-video-validation-report.json`. The business-readiness gate counts it only when the report status is `pass`, provider calls were explicitly allowed, the Atlas billing gate passed, analysis content is usable, and the report confirms no local frame path or inline frame data leakage. See `docs/reference-implementations/source-video-auto-analysis-validation-runner.md` for the exact report contract.

Before spending provider calls on remote stock, run the no-spend adapter smoke:

```powershell
npm.cmd run validation:remote-stock-adapter-smoke
```

This smoke uses fake Pexels/Pixabay/Coverr payloads and fake fetch to prove disabled/no-fetch behavior, Pexels header credential handling, Pixabay outbound query-key handling, Coverr commercial approval gating, credential-free HTTPS candidate filtering, short-duration filtering, provider fail-closed behavior, and aggregate `MaterialSourceValidator` approval. It writes `assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json`, makes no stock-provider, Atlas, deployment, source-video, or billing calls, and must not be treated as live remote-stock business evidence.

Create the live remote stock provider evidence after approved Pexels/Pixabay/Coverr keys are configured and provider terms have been reviewed for the commercial offer. First run the live-network gate without confirmation:

```powershell
npm.cmd run validation:remote-stock
```

Then run the live validation only after approving the provider network calls and confirming commercial terms/licensing review:

```powershell
npm.cmd run validation:remote-stock -- --confirm-live-network --confirm-commercial-terms-reviewed
```

This runner uses configured `RemoteStockMaterialAdapter` instances, then validates candidate URIs, attribution, duration, aspect/resolution fit, and rights metadata through `MaterialSourceValidator`. It writes `assets/output_deliverables/business-readiness/remote-stock-validation-report.json` without raw provider keys, outbound Pixabay key URLs, or full candidate media URLs. Coverr can satisfy evidence only when `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true` is set and returned candidate URLs remain credential-free HTTPS; signed/tokenized URLs are intentionally rejected. See `docs/reference-implementations/remote-stock-provider-validation-runner.md` for the exact report contract.

Create the Atlas generated-audio evidence after the Atlas audio model, voice, pricing assumption, and generated-audio capability JSON are reviewed. First run the spend gate without confirmation:

```powershell
npm.cmd run validation:generated-audio
```

Before adding `--confirm-provider-spend`, refresh the slice-specific Atlas billing report so the planned audio cost matches the current validation text and the approved budget covers `--max-cost-usd`:

```powershell
npm.cmd run validation:atlas-billing -- --max-budget-usd 5 --planned-cost-usd 0.000870 --output assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json --confirm-live-network
```

Refresh the no-spend backend polling-resilience evidence before retrying live generated-audio validation:

```powershell
npm.cmd run validation:generated-audio-polling-resilience
```

Then run provider validation only after approving Atlas generated-audio spend for that specific sample and confirming the audio schema review:

```powershell
npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed
```

If a paid prediction was submitted but the validation command timed out while the provider was still running, resume the existing prediction instead of submitting another job:

```powershell
npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed --resume-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json
```

If that paid run succeeds but manual listening review was not attached yet, update the evidence without calling Atlas again:

```powershell
npm.cmd run validation:generated-audio-review-draft
npm.cmd run validation:generated-audio-artifact -- --confirm-live-network
npm.cmd run validation:generated-audio-review-readiness
npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review
```

The draft helper writes an ignored template and checklist under `assets/output_deliverables/business-readiness/operator-drafts`; it does not call Atlas and it is not release evidence. The artifact helper fetches only the already-generated clean HTTPS audio URL after `--confirm-live-network`, writes ignored local media, and records SHA-256, byte size, ffprobe duration, and binding metadata at `assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json`; it is review support, not manual approval. The review-readiness helper is no-spend/no-network and reports `ready_for_manual_review` only when provider execution, billing, schema, output-batch, provider ledger, and artifact SHA/duration binding are ready while the manual review file is still missing or incomplete. The runner writes `assets/output_deliverables/business-readiness/generated-audio-validation-report.json`. When the final `ops/generated-audio-manual-review.json` file exists, `validation:report-contracts` also validates it directly for accepted/pass status, all required listening checks, matching artifact binding/evidence, clean URL previews, safe repo-relative paths, positive media metadata, and redacted findings before later reports can trust it. The launch doctor surfaces generated-audio validation status, artifact-evidence status, review-readiness status, and manual-review draft status separately so operators can tell whether the remaining blocker is provider execution, media capture, or listening approval. The polling-resilience smoke writes `assets/output_deliverables/business-readiness/generated-audio-polling-resilience-smoke-report.json` and proves only backend retry behavior, not live media quality. The validation default voice is Atlas' documented multilingual `eve`; verify language-specific voices before making them presets. The business-readiness gate counts generated audio only when the live report schema is recognized, provider execution was explicitly allowed, schema review is confirmed, generated-audio output batch validation is approved, provider ledger evidence exists, artifact evidence is bound to the reviewed media bytes, and structured manual audio review passes. See `docs/reference-implementations/generated-audio-validation-runner.md` and `docs/reference-implementations/generated-audio-artifact-evidence.md` for the exact report contracts.

Create the billing/admin/quota evidence after client policy, a persistent usage ledger, a real deployment admin endpoint, and the non-secret billing/admin attestation are ready:

```powershell
npm.cmd run ops:create-client-policy -- --client-id "pilot-client"
npm.cmd run ops:apply-client-policy-env
npm.cmd run validation:ops-config -- --write-drafts
npm.cmd run ops:promote-attestations -- --dry-run
npm.cmd run ops:promote-attestations
npm.cmd run validation:ops-config
npm.cmd run validation:live-inputs
npm.cmd run validation:billing-admin-ops -- --base-url "https://<your-cinejelly-host>" --attestation "ops/billing-admin-attestation.json"
```

The `ops:create-client-policy` helper is no-spend and writes an ignored kit under `assets/output_deliverables/business-readiness/client-policy-kit`: a one-time raw client key file, a `client-policy.json` file containing only the SHA-256 digest, an env snippet, and a redacted report. Move the raw `.secret.txt` key into the secure customer onboarding channel and never commit it. The `ops:apply-client-policy-env` helper merges only the generated client-policy env keys into `.env`, preserves existing Atlas keys/tokens, creates an ignored backup, and writes a redacted report. The `validation:ops-config` command is no-spend and writes optional draft files under `assets/output_deliverables/business-readiness/operator-drafts` when `--write-drafts` is present; it also writes `operator-attestation-fillout-checklist.md` so operators can see every required field, promotion command, and later deployment-capture command in one place. The packet is an aid only, not release evidence, and the command does not call deployment endpoints, Atlas, render routes, or billing providers. After you fill the drafts with real non-secret operational details, `ops:promote-attestations` validates them with `validation:ops-config` before copying them into ignored `ops/*.json` input files; it blocks rather than creating release-looking evidence while fields are still blank. When the promoted `ops/billing-admin-attestation.json` file exists, `validation:report-contracts` also validates it directly for schema shape, clean policy URLs, real procedure text, required client-policy enforcement, and absence of secrets or signed URLs. The attestation file must not contain secrets or customer payment records. It documents the approved billing route, customer traffic mode, Terms/Privacy/Refund URLs, tax owner, support contact, account provisioning/suspension, API key rotation/revocation, refund/chargeback handling, emergency disable procedure, and quota review cadence. See `schemas/operator-attestation-promotion-report.schema.json`, `schemas/client-policy-env-apply.schema.json`, `schemas/api-client-policy-kit.schema.json`, `schemas/billing-admin-attestation.schema.json`, `schemas/api-client-policies.schema.json`, and `docs/reference-implementations/billing-admin-ops-evidence.md` for the exact contract.

Create the production storage/observability/support evidence after the real host, durable storage, backup/restore, monitoring, alerting, incident response, support, and data-retention procedures are in place:

```powershell
npm.cmd run validation:ops-config
npm.cmd run validation:production-ops -- --base-url "https://<your-cinejelly-host>" --attestation "ops/production-operations-attestation.json"
```

This command calls only diagnostic API endpoints and does not submit render work or call Atlas. When the promoted `ops/production-operations-attestation.json` file exists, `validation:report-contracts` also validates it directly for schema shape, clean runbook/dashboard URLs, real operations text, durable storage, retention, backups, alerting, log-redaction review, and absence of secrets or signed URLs. The attestation file must not contain secrets or customer media; it documents durable storage, artifact retention, backup cadence, restore testing, monitoring dashboards, alerting/on-call, request-ID trace search, incident rollback/review, support escalation, log redaction, secret rotation, and customer artifact deletion. See `schemas/production-operations-attestation.schema.json` and `docs/reference-implementations/production-operations-evidence.md` for the exact contract.

Hard blockers:

- Missing Atlas key or model IDs.
- Missing `CINEJELLY_API_AUTH_TOKEN` for a protected deployment.
- Missing FFmpeg or FFprobe on `PATH` or through `CINEJELLY_FFMPEG_PATH` / `CINEJELLY_FFPROBE_PATH`.
- Invalid Atlas endpoint overrides.
- Invalid local material catalog path or unsafe catalog asset URI when `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` is set.
- Remote stock enabled without an approved provider key.
- Coverr remote stock enabled without explicit commercial approval.
- Source-video auto-analysis enabled with an invalid or unwritable frame work directory.
- Output directory cannot be created or written.
- Invalid numeric settings or API port.

## Start API For Validation

Run:

```powershell
npm.cmd start
```

The default API port is `8787`. If `PORT` is configured, replace `8787` in the commands below with that value.

Check health and readiness from another terminal:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/preflight"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/validation-readiness"
npm.cmd run validation:deployment-readiness -- --base-url "http://127.0.0.1:8787" --environment-kind local --output "assets/output_deliverables/business-readiness/local-deployment-capture-smoke.json"
```

For protected endpoints, send either:

- `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>`
- `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`

Customer/client render access can also use a client API key whose SHA-256 digest is configured in `CINEJELLY_API_CLIENTS_JSON`. Store only `keySha256`, not raw customer keys. When `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true`, render submissions must use a configured client key and pass per-client duration, tier, quality, request-count, and reserved-cost limits before runtime creation or provider spend. Set `CINEJELLY_CLIENT_USAGE_LEDGER_PATH` to persist JSONL quota reservations, set `CINEJELLY_API_JOB_HISTORY_PATH` to preserve compact async job status across API restarts, and keep `CINEJELLY_OUTPUT_DIR` on durable storage so Short Studio sessions/style profiles survive restarts. `/v1/admin/client-policy` requires the deployment token and returns redacted policy/usage diagnostics.

`/v1/preflight` and `/v1/validation-readiness` are diagnostic endpoints. They remain available when `CINEJELLY_API_AUTH_TOKEN` is not configured so a fresh deployment can report missing configuration, but once a token is configured they use the same authentication guard as other `/v1` endpoints.

## Paid Atlas Render Validation

Use a short, safe, non-sensitive request. Keep the first paid run small:

- no private customer footage
- no signed URLs
- no embedded credentials in references
- no local filesystem paths in API payloads
- one clear commercial premise
- conservative resolution and quality mode
- explicit `outputPath`, `workDirectory`, and `artifactDirectory` inside the configured output root

Recommended CLI path:

```powershell
npm.cmd run validation:create-request -- --safe-default
npm.cmd run validation:render-request -- --request "assets/output_deliverables/phase6-validation/request.json" --output "phase6-validation/request-validation-report.json"
npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-paid-render-budget-usd> --planned-cost-usd <estimated-paid-render-cost-usd> --output "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --confirm-live-network
npm.cmd run validation:paid-render -- --request "assets/output_deliverables/phase6-validation/request.json" --confirm-paid-spend --atlas-billing-report "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --output "phase6-validation/paid-render-report.json"
```

If you already maintain an operator-owned request file, pass that file instead:

```powershell
npm.cmd run validation:render-request -- --request "phase6-validation/request.json" --output "phase6-validation/request-validation-report.json"
npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-paid-render-budget-usd> --planned-cost-usd <estimated-paid-render-cost-usd> --output "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --confirm-live-network
npm.cmd run validation:paid-render -- --request "phase6-validation/request.json" --confirm-paid-spend --atlas-billing-report "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --output "phase6-validation/paid-render-report.json"
```

If `npm.cmd run validation:readiness` returns `review_warnings`, use `--allow-warnings` only after explicitly accepting the warning state:

```powershell
npm.cmd run validation:render-request -- --request "phase6-validation/request.json" --output "phase6-validation/request-validation-report.json"
npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-paid-render-budget-usd> --planned-cost-usd <estimated-paid-render-cost-usd> --output "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --confirm-live-network
npm.cmd run validation:paid-render -- --request "phase6-validation/request.json" --confirm-paid-spend --allow-warnings --atlas-billing-report "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json" --output "phase6-validation/paid-render-report.json"
```

The request validator and paid-render validation runner use the same request admission and output-root path normalization as `/v1/render`. They do not create a request file for you; keep the request operator-owned, non-sensitive, and inside the release evidence folder. The paid-render runner requires a fresh `cinejelly.atlas-billing-readiness.v1` report captured through the no-spend Atlas `/balance` endpoint before runtime/provider creation. The request-validation output is a redacted contract summary; the paid-render runner output is a redacted execution summary and intentionally omits local artifact directories, so use the configured request paths and artifact manifest on disk for detailed manual inspection.

Recommended async path:

```powershell
$headers = @{
  "Authorization" = "Bearer $env:CINEJELLY_API_AUTH_TOKEN"
  "Content-Type" = "application/json"
  "Idempotency-Key" = "phase6-paid-validation-001"
}

$body = @{
  userInput = "Create a concise premium product launch video for a fictional smart desk lamp, focused on calm workspace lighting and clean motion."
  settings = @{
    tier = "standard"
    resolution = "480p"
    qualityMode = "economy"
    ratio = "16:9"
    durationTargetSeconds = 120
    maxCostUsd = 5
  }
  outputPath = "phase6-validation/final.mp4"
  workDirectory = "phase6-validation/work"
  artifactDirectory = "phase6-validation/artifacts"
} | ConvertTo-Json -Depth 12

$submit = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/render-jobs" -Headers $headers -Body $body
$submit
```

Poll until terminal:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787$($submit.statusUrl)" -Headers @{
  "Authorization" = "Bearer $env:CINEJELLY_API_AUTH_TOKEN"
}
```

While the job is running, the job payload should expose `currentStage`, `currentStageStatus`, `progressEventCount`, and retained `stageProgressEvents` in the per-job response. Once provider ledger entries exist, per-job detail should expose compact `providerCheckpoint` evidence while the list endpoint keeps only `hasProviderCheckpoint` plus current-stage fields without the full event array.

After the job reaches a terminal state and artifacts were written, the job payload should expose `hasArtifactValidation`, `artifactValidationStatus`, and detailed `artifactValidation.checks` in the per-job response. The list endpoint should keep only compact validation status, not the full check array. Treat `artifactValidationStatus=fail` as a release blocker even when the render job status is `succeeded`.

Use synchronous `/v1/render` only for short internal validation when deployment timeout limits are known and acceptable. Its success or failure response should include `artifactValidation` when artifacts were written; treat `artifactValidation.status=fail` as a release blocker.

## Automated Artifact Validation

After the run writes artifacts, validate the project artifact directory:

```powershell
npm.cmd run validate:artifacts -- "phase6-validation/artifacts"
```

The validator accepts either the parent artifact directory or the project-specific child directory that contains `manifest.json`.

Pass criteria:

- command exits `0`
- report status is `pass` or an intentionally reviewed `warn`
- manifest byte sizes and SHA-256 hashes match every listed artifact
- required success or failure artifacts are present
- `review-packet.json`, `stage-lifecycle.json`, `material-sourcing-plan.json`, `material-source-validation.json`, `postproduction-assets.json`, `production-graph.json`, `cost-ledger.json`, and `deliverable.json` domain checks pass when present
- no artifact contains secret-like text, inline `data:` media, or credential-like URL query strings

## Artifact Inspection Checklist

Inspect the generated artifact manifest and at least these files:

- `manifest.json`
- `run-summary.json`
- `review-packet.json`
- `production-graph.json`
- `long-form-creative-intelligence.json`
- `long-director-ui-contract.json`
- `long-form-readiness.json`
- `material-sourcing-plan.json`
- `material-source-validation.json`
- `postproduction-assets.json`
- `stage-lifecycle.json`
- `cost-plan.json`
- `cost-ledger.json`
- `compiled-prompts.json`
- `rendered-shots.json`
- `deliverable.json` when assembly succeeds
- `delivery-gate.json` when delivery validation runs

Required evidence:

- Manifest entries include byte size and SHA-256 hashes.
- `review-packet.json` includes `sourceLineage`, `repairProvenance`, `stageLifecycle`, cost summary, selected candidates, and delivery status.
- `stage-lifecycle.json` contains all stages in order: `plan`, `storyboard`, `prompt`, `source_material`, `render`, `inspect`, `repair`, `assemble`, `deliver`.
- Async job `stageProgressEvents` use the same stage vocabulary and include bounded evidence without local paths, inline media, secrets, stack traces, or raw provider payloads.
- Async job `providerCheckpoint` evidence, when present, contains bounded provider operation/prediction status IDs only and no raw provider payload, local path, secret, signed URL, or inline media.
- Provider reconciliation, handoff, action-ledger, local multi-worker handoff, production handoff capture, live provider action evidence, and graph-resume enqueue payload evidence reports, when present, contain only prediction IDs or prediction counts, provider statuses, terminal/still-active decisions, lease status/expiry, heartbeat status/time, handoff action, action intent/replay summaries, operation summaries, lease counts, output URL counts, provider-call evidence counts, graph-resume evidence counts, digest-only enqueue payload summaries, and redacted errors; they must not include raw graph state, raw provider payloads, output URLs, owner IDs, bearer tokens, local paths, secrets, signed URLs, hostnames, raw queue names, or inline media.
- `material-sourcing-plan.json` contains rights requirement and preferred sources for every material brief.
- `material-source-validation.json` records `planned_only`, `approved`, `review_required`, or `rejected` status, candidate counts, selected candidate counts, issue repair text, and URI-free `candidateEvaluations` with fit scores, score factors, issue codes, decisions, and recommended actions when generated by the current validator.
- `postproduction-assets.json` records caption delivery mode, caption cue counts, audio role counts, generated-audio planned/ready status/counts, postproduction status, issue count, and repair text without claiming provider-backed TTS/BGM/ambience/SFX generation unless the provider-neutral execution runner produced result evidence and batch validation approved it.
- If provider-backed generated-audio execution produced a batch validation report, `generated-audio-output-batch-validation.json` records status/counts, approved tracks, issues, and result reports; `review-packet.json` planning exposes matching generated-audio batch status/counts and repair recommendations; validator output has no generated-audio batch consistency failures.
- Validator output has no `postproduction_asset_consistency` failures; postproduction status, caption/audio counts, generated-audio status/counts, and issue counts agree across `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence.
- If a local material catalog is configured, selected candidates in `material-source-validation.json` use safe `asset://` or credential-free HTTPS URIs and preserve rights/attribution metadata.
- If a generated-audio asset resolution catalog is configured, preflight reports it as valid and does not expose server-local catalog paths, signed URLs, or credential-bearing URLs.
- If remote stock is enabled, selected candidates in `material-source-validation.json` use credential-free HTTPS media URIs, preserve provider asset IDs/source page/preview metadata when safe, and include attribution/license labels.
- If source-video auto-analysis is enabled and the request has a clean HTTPS `source_video_structure` reference without caller-supplied analysis, `source-video-analysis.json` should contain normalized scene/keyframe/pacing/style/safety structure without local frame paths, inline `data:` URLs, or signed source URLs.
- `long-director-ui-contract.json` should match `long-form-creative-intelligence.json`, keep provider submission disabled, require manual quality/redaction review and DirectorBench-style evidence, and agree with the compact Long Director fields in `run-summary.json` and `review-packet.json`.
- `cost-ledger.json` contains provider operations with model, graph node, prediction ID when available, latency, retry count, status, and provider usage/cost when returned.
- `production-graph.json` includes `reference_asset`, `reference_selection`, `material_sourcing`, `clip_render`, `inspection_report`, repair, and deliverable evidence as applicable.
- `deliverable.json` includes output byte size and SHA-256 hash.
- Per-job API `artifactValidation` omits server-local `artifactDirectory` and `manifestPath`; it should expose status, manifest file name, counts, and checks only.
- `npm.cmd run validate:artifacts -- <artifact-directory>` passes or any warning is explicitly reviewed.

## Release Audit

After paid validation and artifact validation, run:

```powershell
npm.cmd run validation:release-audit -- --paid-report "phase6-validation/paid-render-report.json" --output "phase6-validation/release-audit-report.json"
```

Pass criteria:

- status is `release_ready`
- local smoke evidence is `pass`
- paid-render validation status is `completed`, or warnings are explicitly reviewed before release
- paid artifact validation status is `pass`, or warnings are explicitly reviewed before release
- tracked worktree is clean
- `.env` and generated output paths are ignored by Git
- tracked secret scan has no findings
- no `src/` or `scripts/` file imports from `external/upstream`

This audit is not a substitute for watching the rendered video and reviewing artifacts. It proves release evidence exists and source hygiene is clean; the operator still approves media quality and redaction.

## Redaction And Safety Checklist

Before marking the validation run acceptable:

- No API response exposes local absolute paths.
- No API response exposes raw stack traces.
- No artifact exposes `ATLASCLOUD_API_KEY`, auth token, bearer headers, signed URLs, or credential-like query strings.
- No artifact exposes `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `COVERR_API_KEY`, or provider download URLs with credential-like query strings.
- No inline `data:` media payload appears in public API JSON.
- Failed provider calls have stack-free error name/message details.
- Failure artifacts preserve cost ledger entries created before failure.

## Failure Handling

If preflight fails:

1. Fix environment, media tool installation, or configured media tool paths.
2. Rerun `npm.cmd run preflight` and `npm.cmd run validation:readiness`.
3. Do not run paid provider validation until hard failures are gone.

If paid validation fails:

1. Inspect `failure-report.json`, `cost-ledger.json`, and `review-packet.json` if available.
2. Identify the failed stage from `stage-lifecycle.json` or the job status payload.
3. Map the failure to the narrowest module: config, provider, prompt, render, inspect, repair, assemble, or deliver.
4. Apply Faithful Logic Translation if the fix changes source-derived behavior.
5. Rerun typecheck, build, preflight, and then a new paid validation run.

## Release Decision

CineJelly is ready for limited customer traffic only when:

- Typecheck, build, and preflight pass in the deployment environment.
- Validation readiness report is archived and has no hard blockers.
- At least one paid Atlas validation render succeeds.
- Artifacts pass the inspection checklist.
- The retained job detail has `artifactValidationStatus=pass`, or any `warn` is explicitly reviewed and no `fail` remains.
- Material source validation is either `planned_only` for generated-only runs or `approved`/explicitly reviewed for runs using adapter candidates.
- Redaction checklist passes.
- `npm.cmd run validation:release-audit` is `release_ready`, or any warning is explicitly reviewed and recorded.
- `npm.cmd run validation:business-readiness` is `ready_for_limited_customer_traffic` for the full commercial platform, or any intentionally excluded feature scope is separately documented and approved before selling that narrower offer.
- Remaining warnings are documented in `docs/PROJECT_CONTEXT.md`.
- The run date, environment notes, and remaining blockers are recorded in `docs/IMPLEMENTATION_ROADMAP.md`.
