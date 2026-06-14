# CineJelly Seedance Ultimate Director

Commercial agentic video production architecture for high-quality Seedance 2.0 workflows through Atlas Cloud.

## Status

The repository contains a production-oriented TypeScript foundation. It is ready for focused implementation work, but it should not be treated as fully validated for customer traffic until real Atlas credentials, FFmpeg/FFprobe, and at least one paid end-to-end render validation are complete.

- Atlas Cloud is the default provider target for both LLM reasoning and Seedance 2.0 rendering.
- `src/` contains working foundations for the provider layer, structured LLM parsing, Reference Librarian validation and graph lineage, Atlas Asset Library reference registration, configurable render cost gating, prompt compilation, Production Graph planning and run-recording, continuity ledger generation, Consistency Guardian checks, director orchestration, assembly/postproduction engines, postproduction asset planning, generated-audio intent/execution planning, generated-audio output validation, batch reconciliation, optional batch artifact evidence, generated-audio asset resolution plus catalog preflight, a no-spend generated-audio provider contract boundary, and production HTTP API.
- Local Git Subtree snapshots of upstream projects are stored under `external/upstream/` for source-fidelity review, copy/adaptation, and product integration. Productized behavior should be copied or adapted into CineJelly-owned `src/`, `data/`, or `docs/` surfaces with attribution instead of depending on live upstream availability or importing directly from snapshots. Behavior-critical source logic should follow Faithful Logic Translation before production rewriting.
- Faithful Logic Translation is now defined, but only per-logic implementation work can make a module source-faithful. Current source-inspired modules should be upgraded one at a time with Reference Implementations, lineage records, and validation checklists.
- Quality mode now drives actual render behavior: Economy/Standard/High/Ultimate produce one to four Seedance candidates per shot, authorize zero to three targeted repair attempts, the Consistency Guardian selects the best candidate, and the Production Graph records selected, rejected, and repair candidate evidence.
- The HTTP API now creates or accepts a sanitized request correlation ID and propagates it through JSON responses, render job summaries, provider metadata, Production Graph project metadata, and success/failure artifacts.
- The API propagates client disconnects and deployment shutdown signals into active render work so request-bound orchestration, provider calls, polling, assembly, and postproduction stop as early as the selected provider path allows.
- The assembly path materializes HTTPS provider clip URLs and remote audio tracks with bounded streaming downloads instead of loading whole rendered media into memory.
- FFmpeg/FFprobe child-process stdout and stderr are capped so noisy media failures cannot exhaust API memory.
- The planning path now emits and Guardian-validates a typed storyboard from shot contracts before render spend; storyboard panels and preflight evidence are stored in the Production Graph and durable artifacts.
- The codebase now includes a MoneyPrinterTurbo-inspired, CineJelly-owned material sourcing planner that turns shot contracts into governed material briefs without importing upstream code or calling stock APIs directly.
- An optional local material library adapter can fulfill those briefs from an operator-owned JSON catalog using safe `asset://` or credential-free HTTPS URIs; missing catalog configuration keeps the source-material stage explicitly planned-only.
- Optional remote stock material adapters can fulfill briefs from Pexels, Pixabay, and commercially approved Coverr providers when explicitly enabled with provider keys; candidate URIs are filtered to credential-free HTTPS and still pass through centralized material validation.
- Material source validation now checks adapter candidates against known briefs, approved source lists, remote-source policy, safe URIs, rights/attribution status, duration, aspect ratio, and resolution; planned-only runs remain explicit when no material adapter candidates are supplied.
- Postproduction asset planning now classifies supplied caption cues, supplied audio tracks, and generated-audio intents into deterministic evidence before final assembly, writes `postproduction-assets.json`, maps generated-audio intents to verified provider capabilities when available, validates generated-audio provider results and result batches before they can become mix tracks, can resolve reviewed generated-audio `asset://` outputs into credential-free HTTPS mix inputs, validates an optional operator-owned generated-audio asset resolution catalog during preflight, and marks inconsistent caption/audio/generated-audio planning inputs as review-required instead of silently ignoring them; a provider-neutral generated-audio contract exists, but Atlas TTS/BGM/ambience/SFX execution remains disabled until verified audio schemas, model IDs, pricing, and paid output validation are available.
- Long-form runs now emit a typed stage lifecycle for `plan`, `storyboard`, `prompt`, `source_material`, `render`, `inspect`, `repair`, `assemble`, and `deliver`; review packets and durable artifacts expose this evidence for operator review.
- Async render jobs now retain bounded stage progress telemetry during execution: list responses expose compact current-stage fields, while per-job polling exposes retained stage progress events without local paths, secrets, inline media, or raw provider payloads.
- The codebase now includes source-translation lineage contracts and a redacted logging foundation for future Faithful Logic Translation work across providers, prompt compiler, graph planning, and guardian modules.
- The intake path now supports a bounded `sourceVideoAnalysis` contract for VideoAgent/OpenMontage-style transcript, scene, keyframe, pacing, style, and safety deconstruction; Story Architect uses it as original structural guidance, and graph/artifacts preserve the source-video lineage.
- An opt-in Source Video Auto Analysis Adapter can sample bounded frames from a clean HTTPS `source_video_structure` reference, ask the configured Atlas LLM for structural deconstruction, normalize the result through `SourceVideoAnalyst`, and keep local frame paths/base64 payloads out of returned analysis and artifacts.
- Successful runs emit `review-packet.json`, a redacted commercial handoff summary that ties planning, render, cost, delivery, and QC evidence together.
- Optional reference selection metadata for camera, composition, character, view, timeline index, and authorization is validated at API admission, preserved by the Reference Librarian, and consumed by deterministic reference selection before provider request compilation.
- Normalized source-video scene/keyframe metadata now enriches exact keyframe URI references and matching source-video structure references with typed camera/composition/timeline/source-scene/source-keyframe hints for reference scoring.
- Atlas provider cost ledger entries now record actual retry counts for retryable LLM, Seedance, prediction polling, and Asset Library HTTP calls, with prediction polling tied back to the originating model and graph node when context is available.
- Atlas prediction output mapping now tolerates nested provider response shapes such as `output`, `result`, `data`, `videos`, and file objects before declaring `OUTPUT_MISSING`.
- Atlas HTTP timeout and abort paths now normalize into retryable `ProviderError` records with redacted reason details instead of leaking raw runtime errors through provider boundaries.
- Atlas HTTP errors now preserve normalized status-based error codes even when the provider returns a non-JSON body, and non-JSON body previews are redacted before entering diagnostics.
- Atlas JSON metadata responses are bounded by a configurable byte cap before parsing so abnormal provider responses cannot exhaust API memory.
- Artifact manifests include per-file SHA-256 hashes for redacted JSON artifacts so production handoffs can verify file integrity after storage or transfer.
- `npm.cmd run validate:artifacts -- <artifact-directory>` validates manifest integrity, required artifact presence, stage lifecycle, material rights briefs, optional generated-audio batch validation evidence, cost ledger shape, deliverable metadata, and secret/unsafe URI redaction after provider runs.
- Synchronous render responses and async render jobs now validate their own success/failure artifacts immediately after API-owned artifact writes; sync responses include `artifactValidation`, compact job lists expose `artifactValidationStatus`, and per-job polling exposes validation checks without server-local artifact paths.
- Failure artifacts keep stack-free redacted error name/message details so audit handoffs do not expose source or runtime paths.
- API artifact bundle responses expose manifest entries and hashes without returning server-local artifact directories or manifest paths.
- Public API JSON redaction now removes inline `data:` URIs so sampled frames or provider/debug payloads cannot leak as base64 response content.
- Public API JSON redaction also removes non-HTTPS, embedded-credential, and signed/credential-query URIs while preserving clean `https://` and `asset://` values.
- Final assembled videos record output byte size and streaming SHA-256 hashes in `deliverable.json` and `review-packet.json`.
- Postproduction scales and pads non-adaptive outputs onto the selected aspect-ratio canvas before delivery validation.
- Delivery Gate blocks final handoff when FFprobe metadata does not match the selected non-adaptive aspect ratio.
- A production `npm run preflight` gate emits a redacted preflight report and exits non-zero when Atlas config, FFmpeg/FFprobe, output storage, or deployment knobs are not ready; `npm run validation:render-request -- --request <request-json>` validates an operator-supplied render request without provider spend, `npm run validation:readiness` and `GET /v1/validation-readiness` convert preflight into a Phase 6 operator-readiness report, and `npm run validation:paid-render -- --request <request-json>` provides a readiness-gated paid-render validation harness.
- Async render submissions now enforce a configurable queued/running job limit before job creation, runtime initialization, or provider spend, and job listing returns queue telemetry for operators.
- Async render submissions accept `Idempotency-Key` for retry-safe long-form job creation within retained in-process job history, preventing duplicate Atlas spend when clients retry the same payload.
- Synchronous `/v1/render` now has its own in-process concurrency gate so request-bound renders cannot crowd out async long-form work.
- Rate-limit and queue-saturation responses now include `Retry-After` plus a JSON `retryAfterSeconds` value for disciplined upstream retries.
- Render POST request body size is configurable and oversized bodies are rejected with `413` before JSON parsing, queue admission, runtime creation, or provider spend.
- API admission now validates nested caption, audio mix, frame sampling, semantic visual inspection, and transition option objects before runtime creation or provider spend.
- Runtime preflight now verifies the configured/default output directory can be prepared and written before customer traffic.
- The package declares `main`, `types`, and ESM `exports` for stable production imports from the built `dist/index.js` surface, including API, agents, core engines, providers, prompt compiler, and shared types.
- No CineJelly-owned test, mock, demo, sample, or example files are part of the production runtime. Upstream snapshots may contain original upstream development files inside `external/upstream/`; those files become product material only after license/product review and an intentional copy/adapt step.
- Runtime validation still requires real Atlas Cloud credentials, verified model IDs, FFmpeg, FFprobe, a Phase 6 validation-readiness report, and at least one paid Atlas render before customer use.

Faithful Logic Translation foundations are implemented for Prompt Binding Plan, Guardian Repair Decision Provenance, Reference Selection Scoring, Reference Metadata Enrichment, Source Video Reference Metadata Enrichment, Source Video Auto Analysis Adapter, Provider Polling/Retry/Cost Fidelity, Long-Form Planning/Batch Workflow, Render Job Stage Progress Telemetry, API Artifact Validation Evidence, Phase 6 Validation Readiness Report, Phase 6 Render Request Validation Contract, Phase 6 Paid Render Validation Runner, Media Tool Binary Resolution, Material Source Adapter Validation, Local Material Library Adapter, Remote Stock Material Adapter, Postproduction Asset Orchestration, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence including review-packet handoff evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, and Generated Audio Provider Execution Contract. The next required phase is real provider validation using `docs/OPERATOR_RUNBOOK.md`.

## Product Goal

CineJelly Seedance Ultimate Director turns one user input plus optional references into a polished commercial video:

1. understand intent and references
2. generate script, storyboard, and shot contracts
3. build a Production Graph for long-form control
4. compile Seedance 2.0 prompts
5. render through Atlas Cloud
6. inspect consistency and repair only affected graph nodes
7. assemble, polish, and export final deliverables

The target long-form range is 2 to 8 minutes, handled through graph chunking, continuity ledgers, reference binding, governed material sourcing, batch candidate evidence, and Consistency Guardian checkpoints.

## Architecture Pillars

- `Production Graph`: project, validated reference assets, story, sequences, scenes, beats, shots, renders, inspection reports, repair actions, and deliverables.
- `Model Provider Abstraction`: Atlas Cloud default, future-ready for Kie.ai, fal.ai, Runway, Replicate, direct Volcengine, generated-audio providers, or other providers.
- `Prompt Compiler`: source-traceable Seedance prompt compilation from shot contracts, copied/adapted prompt anatomy, and CineJelly-owned rules, not hardcoded niche templates.
- `Consistency Guardian`: preflight, test-take inspection, post-render inspection, timeline inspection, and targeted repair.
- `Material and Batch Pipeline`: MoneyPrinterTurbo-inspired material sourcing, stage progress, subtitles/TTS/BGM lineage, and batch output evidence adapted into CineJelly-owned graph contracts.
- `Flexible Settings`: Fast/Standard tier, 480p/720p/1080p, quality mode, aspect ratio, duration, audio mode, watermark policy, and last-frame return policy.

## Repository Structure

```text
cinejelly-seedance-ultimate-director/
|-- AGENTS.md
|-- README.md
|-- assets/
|   |-- output_deliverables/
|   `-- reference_inputs/
|-- config/
|-- data/
|-- docs/
|-- external/
|-- ops/
|-- schemas/
`-- src/
    |-- agents/
    |-- api/
    |-- application/
    |-- config/
    |-- core/
    |-- prompt_compiler/
    |-- providers/
    |-- types/
    `-- utils/
```

`data/` is reserved for production-approved local knowledge artifacts such as copied/adapted prompt-pattern snapshots, bibles, and evaluation rubrics when they become necessary. `external/upstream/` contains legally bounded Git Subtree snapshots of upstream repositories; CineJelly uses them as source material, then productizes useful parts into `src/`, `data/`, and `docs/`. Production code must not import directly from `external/upstream/`; `src/` remains CineJelly-owned code written new or adapted into product-specific modules, not a drop zone for large upstream files.

## Documentation Map

- `docs/PROJECT_CONTEXT.md`: compact project memory for token-efficient agent work.
- `docs/ARCHITECTURE_SPEC.md`: full system architecture and agent responsibilities.
- `docs/CREDITS.md`: attribution, source boundaries, and license cautions.
- `docs/SUBTREE_POLICY.md`: Git Subtree workflow, required `--squash` usage, and copy/adapt policy.
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`: local subtree inventory, license status, and reuse boundaries.
- `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`: source-to-product fidelity process for behavior-critical logic, including practical Reference Implementation examples.
- `docs/IMPLEMENTATION_ROADMAP.md`: practical module-by-module roadmap for implemented fidelity phases and remaining provider validation.
- `docs/ROADMAP_FIDELITY_AUDIT_2026-06-14.md`: owner-level audit of roadmap completion, subtree fidelity, remaining blockers, and next validation steps.
- `docs/BEGINNER_QUICKSTART.md`: shortest setup path for non-specialist operators, including automation boundaries and clean-source checks.
- `docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md`: practical install, environment, model, API, settings, and no-UI runtime guide.
- `docs/PROMPT_COMPILER_DESIGN.md`: adaptive Seedance prompt compiler design.
- `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`: 2 to 8 minute graph and chunking strategy.
- `docs/CONSISTENCY_GUARDIAN_DESIGN.md`: quality, continuity, inspection, and repair design.
- `docs/MODEL_PROVIDER_ABSTRACTION.md`: Atlas Cloud default provider layer and future provider contracts.
- `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`: user-facing settings and provider validation policy.

## Configuration And Secrets

Runtime implementation will require:

- `ATLASCLOUD_API_KEY`: Atlas Cloud API key for LLM and media generation.

Security rules:

- never commit `.env` files
- never commit or return API keys, provider tokens, private keys, signed URL credentials, or local credentials
- keep provider model IDs and runtime capabilities in configuration, not hardcoded business logic
- keep generated deliverables and run artifacts inside `CINEJELLY_OUTPUT_DIR`
- verify Atlas Cloud model schema before enabling customer-facing settings

`.gitignore` and `.gitleaks.toml` are included to reduce accidental secret exposure. Use a redacted secret audit before every push.

## Running The Project

Current runtime requirements:

- Node.js 20+
- FFmpeg available on `PATH`, or configured through `CINEJELLY_FFMPEG_PATH`, for final clip assembly and postproduction polish
- FFprobe available on `PATH`, or configured through `CINEJELLY_FFPROBE_PATH`, for media inspection and delivery QC
- Atlas Cloud credentials and configured model IDs

Required environment variables:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `CINEJELLY_API_AUTH_TOKEN`

Optional environment variables:

- `PORT`
- `ATLASCLOUD_LLM_API_KEY`
- `ATLASCLOUD_API_BASE_URL`
- `ATLASCLOUD_ASSET_BASE_URL`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `CINEJELLY_REQUEST_TIMEOUT_MS`
- `CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES`
- `CINEJELLY_POLLING_INTERVAL_MS`
- `CINEJELLY_POLLING_TIMEOUT_MS`
- `CINEJELLY_RENDER_CONCURRENCY`
- `CINEJELLY_API_SYNC_RENDER_CONCURRENCY`
- `CINEJELLY_API_JOB_CONCURRENCY`
- `CINEJELLY_API_JOB_HISTORY_LIMIT`
- `CINEJELLY_API_JOB_QUEUE_LIMIT`
- `CINEJELLY_API_MAX_BODY_BYTES`
- `CINEJELLY_API_RATE_LIMIT_WINDOW_MS`
- `CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS`
- `CINEJELLY_DISABLE_API_RATE_LIMIT`
- `CINEJELLY_TRUST_PROXY_HEADERS`
- `CINEJELLY_MAX_USER_INPUT_CHARS`
- `CINEJELLY_MAX_REFERENCES`
- `CINEJELLY_MAX_CAPTION_CUES`
- `CINEJELLY_MAX_AUDIO_TRACKS`
- `CINEJELLY_MAX_GENERATED_AUDIO_INTENTS`
- `CINEJELLY_MAX_METADATA_ENTRIES`
- `CINEJELLY_MAX_SOURCE_VIDEO_SCENES`
- `CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES`
- `CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE`
- `CINEJELLY_MAX_SOURCE_VIDEO_NOTES`
- `CINEJELLY_MAX_RENDERED_CLIP_BYTES`
- `CINEJELLY_MAX_AUDIO_TRACK_BYTES`
- `CINEJELLY_DISABLE_API_AUTH`
- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`
- `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH`
- `CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH`
- `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS`
- `CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS`
- `CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF`
- `CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `COVERR_API_KEY`
- `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED`

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities instead of relying on default documented capability assumptions.
Atlas endpoint overrides (`ATLASCLOUD_API_BASE_URL`, `ATLASCLOUD_ASSET_BASE_URL`) must be valid HTTPS URLs without embedded credentials, query strings, or fragments; insecure or credential-bearing protocols are rejected by runtime configuration and `/v1/preflight` before any provider request can use credentials.
Numeric runtime environment values must be plain base-10 integer or decimal strings without units or suffixes; malformed deployment knobs fail runtime loading or `/v1/preflight` instead of being partially parsed.
`PORT` must be a valid TCP port from 1 to 65535 when set; `npm run preflight` and startup enforce the same range.
`CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES` bounds Atlas LLM, prediction, and Asset Library JSON metadata responses before parsing; it does not apply to rendered media downloads, which are handled by the assembly streaming limits below.
`CINEJELLY_TRUST_PROXY_HEADERS=true` allows the API rate limiter to bucket clients by `X-Forwarded-For`; leave it unset unless a trusted reverse proxy strips and rewrites client IP headers before traffic reaches CineJelly.
When a request includes `settings.maxCostUsd`, `CINEJELLY_RENDER_COST_USD_PER_SECOND` must be configured so the render cost gate can block over-budget jobs before provider calls.
`CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` optionally enables the local material library adapter. The file must be an operator-owned JSON catalog whose entries use safe `asset://` or credential-free `https://` asset URIs, rights metadata, and bounded labels/tags; runtime preflight validates it before customer traffic. Do not put local filesystem paths or signed URLs into catalog `assetUri` values.
`CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH` optionally points to an operator-owned generated-audio asset resolution catalog. Entries must map clean `asset://` generated-audio outputs to credential-free HTTPS delivery URLs with `approvedForMix` and optional identity/provider/duration evidence; preflight validates the catalog but does not call audio providers or create generated audio.
`CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` enables opt-in remote stock material adapters. At least one approved provider key must be configured: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, or `COVERR_API_KEY` with `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true`. Provider keys are used only for outbound search requests; material candidates stored in artifacts must use credential-free HTTPS URLs and attribution metadata.

Build commands:

```bash
npm install
npm run typecheck
npm run build
npm run preflight
npm run validation:readiness
npm run validation:render-request -- --request <request-json>
npm run validation:paid-render -- --request <request-json>
npm run validate:artifacts -- <artifact-directory>
npm start
```

Production API:

- `GET /health`
- `GET /v1/preflight`
- `GET /v1/validation-readiness`
- `POST /v1/render`
- `POST /v1/render-jobs`
- `GET /v1/render-jobs`
- `GET /v1/render-jobs/{jobId}`
- `DELETE /v1/render-jobs/{jobId}`

`GET /v1/preflight` and `npm run preflight` verify required Atlas configuration, clean HTTPS Atlas endpoint overrides, strict numeric runtime settings, API authentication configuration, job queue settings, optional local material catalog validity, optional generated-audio asset resolution catalog validity, optional remote stock provider readiness, optional source-video auto-analysis work-directory readiness, output directory write readiness, and local FFmpeg/FFprobe availability without exposing secret values or local absolute paths. Deployments can use `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH` to point at portable binaries instead of modifying global `PATH`; runtime media engines use the same resolved commands as preflight. `npm run validation:render-request -- --request <request-json>` checks an operator-owned request file through the same render request admission and output-root path normalization used by `/v1/render` and the paid-render runner, emits a redacted pass/fail report, and does not run readiness, initialize providers, call Atlas, or write render artifacts. `npm run validation:readiness` and `GET /v1/validation-readiness` wrap the preflight report into a redacted Phase 6 readiness report with blocker names, warning names, next actions, and an explicit reminder that customer release still requires paid Atlas render validation plus artifact validation. `npm run validation:paid-render -- --request <request-json>` reuses that readiness gate before paid provider spend, requires `--allow-warnings` to continue from a warning decision, uses the same render request admission and output-root path normalization as `/v1/render`, writes success/failure artifacts, validates them, and emits a redacted operator report without local artifact paths. The CLI preflight exits `1` on hard failure and `0` for pass or warning states; request validation exits `1` for invalid request files, validation readiness exits `1` only when hard blockers remain, while the HTTP readiness endpoint returns `503` for `blocked` and `200` for warning/ready decisions. `/v1/preflight` and `/v1/validation-readiness` are available before the render runtime is initialized, so a fresh deployment can diagnose missing environment variables safely. `/health` is public; protected `/v1` endpoints require `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>` with a case-insensitive Bearer scheme or `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`. Render POST attempts are rate limited before auth failure responses so unauthenticated floods cannot bypass the render submission throttle. If `CINEJELLY_API_AUTH_TOKEN` is missing, only `/v1/preflight` and `/v1/validation-readiness` remain available and render/job endpoints return 503. `CINEJELLY_DISABLE_API_AUTH=true` is reserved for private trusted networks.

Every API response includes `requestId` and the `X-CineJelly-Request-Id` response header. Callers may provide `X-CineJelly-Request-Id` or `X-Request-Id`; invalid values are ignored and replaced with a generated UUID-based ID. The normalized request stores this ID in metadata so LLM calls, Seedance requests, render jobs, Production Graph project nodes, `run-summary.json`, and `failure-report.json` can be correlated without exposing secrets. Public JSON responses pass through secret redaction plus local filesystem path, inline `data:` URI, non-HTTPS URI, embedded-credential URI, and signed/credential-query URI redaction, preserve deploy-safe URI values such as clean `https://` and `asset://` references while hiding server-only paths, and are returned with `Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`.

For synchronous `/v1/render`, client disconnects propagate through `AbortSignal` into Story Architect, Atlas Asset Library registration, Seedance submission/polling, assembly, and postproduction where supported. `CINEJELLY_API_SYNC_RENDER_CONCURRENCY` controls how many synchronous render pipelines can run at once per API process; the lease is acquired after body parsing, admission control, and path normalization but before runtime creation or provider spend. When that capacity is full, the API returns `503` with retry hints and callers should use `/v1/render-jobs` for long-form work. On `SIGINT` or `SIGTERM`, the API stops accepting new connections, aborts active request-bound render orchestration, and cancels queued/running async render jobs with an explicit shutdown reason.

`POST /v1/render` and `POST /v1/render-jobs` require an application JSON media type, either `application/json` or `application/*+json`, before body parsing. `CINEJELLY_API_MAX_BODY_BYTES` bounds render POST bodies; oversized requests return `413` before JSON parsing, queue admission, runtime creation, or provider spend. `POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `sourceVideoAnalysis`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `generatedAudioIntents`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`/`artifactDirectory`. `sourceVideoAnalysis` is a bounded deconstruction contract for a `source_video_structure` reference: transcript cues, scenes, keyframes, pacing notes, style notes, structural beats, and safety notes. `generatedAudioIntents` is a bounded planning contract for requested narration, BGM, ambience, or SFX; the current foundation keeps Atlas audio no-spend by default, but can execute ready generated-audio items through the provider-neutral runner when verified audio capabilities and an `AudioProvider` are present. Render requests pass rate limiting and admission control before runtime creation: user input length, reference count, source-video analysis sizes, caption cue count, audio track count, generated-audio intent count, metadata shape, settings, JSON size, option object shape/ranges, and path lengths are bounded before LLM or provider spend. Public API audio track sources must be credential-free HTTPS URLs without credential-like query parameters; local audio files are reserved for internal engine calls. Reference URIs and source-video keyframe URIs must be credential-free HTTPS URLs or pre-registered `asset://` references in the current Atlas path, and credential-like query parameters are rejected before runtime/provider spend. Output, work, and artifact paths are confined to `CINEJELLY_OUTPUT_DIR` or `assets/output_deliverables` by default; relative paths are resolved inside that root and absolute paths outside it are rejected.

During assembly, remote provider clip and audio URLs must be HTTPS and must not include embedded credentials. Remote provider clip URLs and audio tracks are downloaded as streams into temporary files and then atomically moved into the work directory. `CINEJELLY_MAX_RENDERED_CLIP_BYTES` bounds each rendered clip download so long-form jobs cannot exhaust process memory or disk unexpectedly; the default is 2 GiB per clip. `CINEJELLY_MAX_AUDIO_TRACK_BYTES` separately bounds each remote audio track download; the default is 256 MiB per track.

FFmpeg and FFprobe are resolved through `CINEJELLY_FFMPEG_PATH`/`CINEJELLY_FFPROBE_PATH` when configured, otherwise through `PATH`, and are launched through a shared argument-array process runner, not shell-built commands. Child-process stdout and stderr are each capped at 2 MiB by default; if a media tool exceeds that cap, the child process is stopped and the render fails with a bounded error.

For long-running 2 to 8 minute production jobs, `POST /v1/render-jobs` accepts the same body as `/v1/render`, returns `202` plus a `statusUrl`, and runs the render in an in-process queue. Clients may send an `Idempotency-Key` header; repeated submissions with the same key and same payload return the retained existing job instead of creating a duplicate render, while reusing the key for a different payload returns `409`. `GET /v1/render-jobs` returns queue telemetry plus retained jobs as compact summaries with `currentStage`, `currentStageStatus`, `progressEventCount`, `hasResult`, `hasCostLedger`, `hasArtifacts`, `hasArtifactValidation`, `artifactValidationStatus`, and `hasError` flags; `GET /v1/render-jobs/{jobId}` returns queued/running/succeeded/failed/canceled status plus retained `stageProgressEvents`, redacted result, stack-free error name/message detail, cost ledger, artifact manifest entries, and artifact validation checks when available, without exposing server-local result paths, artifact directories, or manifest paths. `DELETE /v1/render-jobs/{jobId}` cancels a queued or running job through `AbortController`. `CINEJELLY_API_JOB_CONCURRENCY` controls how many render jobs run at once per API process, `CINEJELLY_API_JOB_HISTORY_LIMIT` controls retained in-memory job history and the in-process idempotency replay window, and `CINEJELLY_API_JOB_QUEUE_LIMIT` caps queued plus running job occupancy before new job records, runtimes, or provider calls are created. When rate limits or queue capacity blocks a request, the API returns `Retry-After` and `retryAfterSeconds` so upstream gateways can retry later instead of silently accumulating long-form jobs.

At foundation level, the current codebase provides the provider layer, robust structured LLM parsing, Story Architect plan normalization with bounded source-video deconstruction guidance, Reference Librarian validation for role/kind compatibility and credential-free HTTPS or `asset://` reference URIs, Source Video Analyst normalization for transcript/scene/keyframe/pacing/style/safety analysis, provider-neutral capability validation before Asset Library or render spend, provider telemetry with prediction IDs, robust nested Atlas prediction output URL extraction, redacted non-JSON Atlas HTTP error diagnostics with preserved status-based error normalization, retryable Atlas abort/timeout ProviderError normalization, bounded Atlas JSON metadata response parsing, provider-returned cost metadata when available, actual retry counts for retryable Atlas HTTP calls, and graph/model context for prediction polling ledger entries, Atlas Asset Library registration/polling for video and audio references before Seedance generation, deterministic storyboard panel planning from shot contracts, Guardian storyboard preflight before render spend, quality-mode candidate rendering, high-risk test-take gating before full render, conservative dependency-aware render scheduling, targeted repair-only rerendering, Guardian-based candidate selection, configurable cost planning and budget gating with test-take, candidate, and repair multipliers, prompt compiler, Production Graph planning plus reference asset lineage, source-video analysis lineage, storyboard panel/preflight lineage, and run evidence recording for clip renders/inspections/deliverables, continuity ledger generation for Character/Style bibles, batch Consistency Guardian preflight gating, render gate blocking before assembly, director orchestration, FFmpeg assembly engine, bounded HTTPS streaming materialization of provider clip URLs and remote audio tracks, bounded FFmpeg/FFprobe process output capture, xfade/acrossfade transition assembly, selected-resolution and selected-aspect-ratio postproduction scaling, final video byte-size and SHA-256 integrity recording, FFprobe media inspection, deterministic delivery gate validation for selected resolution and non-adaptive aspect ratio, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, review packet generation for commercial handoff, postproduction polish, caption sidecar/burn-in automation, supplied-audio mix automation, generated-audio planning/execution evidence through a provider-neutral runner that remains no-spend for Atlas until verified capabilities exist, output/artifact path confinement, redacted API responses and run artifacts, inline `data:` plus unsafe URI response redaction, stack-free failure-report error payloads, strict application JSON media-type enforcement and configurable body-size gating for credit-spending POST endpoints, shared render request normalization for API and validation CLI paths, local filesystem path redaction and no-store response headers for public API JSON payloads, credential-free HTTPS Atlas endpoint override validation, strict numeric runtime environment validation, API port/boolean-flag startup-preflight parity, API artifact response DTOs that omit server-local artifact paths, API artifact validation DTOs that omit server-local validator paths, compact render-job list summaries with detail payloads and stack-free error detail plus artifact validation checks reserved for per-job polling, synchronous render responses with artifact validation evidence, failure-path cost ledger capture after partial provider spend, SHA-256 manifest integrity hashes for run/failure artifacts, case-insensitive Bearer API auth guard, pre-auth proxy-safe render POST rate limiting with `Retry-After`, synchronous render concurrency gating, retry-safe async render submission with in-process idempotency, request admission control for credit-spending endpoints including nested source-video/caption/audio/generated-audio/transition/frame-sampling/semantic-inspection option validation, request correlation IDs across API/provider/job/graph/artifact metadata, client disconnect and deployment shutdown cancellation propagation, in-process render job submit/poll/cancel orchestration with queue-saturation retry hints, runtime preflight validation for writable output storage, redacted CLI and HTTP validation-readiness gates for deployment readiness, a redacted paid-render validation CLI that gates spend on readiness and immediately validates artifacts, stable ESM package exports for built production imports across API/agent/core/provider/type modules, deterministic success and failure artifact persistence, and production HTTP entrypoint. The correct operating loop is:

1. read `AGENTS.md`
2. read `docs/PROJECT_CONTEXT.md`
3. read the relevant detailed design spec
4. implement the next production module under `src/`
5. run secret audit
6. commit and push

When semantic visual inspection is enabled, `ATLASCLOUD_LLM_MODEL` must be a model that accepts image inputs in OpenAI-compatible chat content.

## Implementation Status And Next Order

Current foundation:

- Provider, prompt, graph, guardian, API, cost, error, artifact, redaction, stage lifecycle, material sourcing, and media-processing foundations exist under `src/`.
- Source lineage and logging foundations exist, and Phase 1-5 source-faithful foundations plus the Source Video Auto Analysis Adapter, Render Job Stage Progress Telemetry, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence including review-packet handoff evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, Generated Audio Provider Execution Contract, Phase 6 Validation Readiness Report, and Phase 6 Paid Render Validation Runner have Reference Implementations, lineage records, and validation notes.
- Runtime readiness still depends on real Atlas credentials, verified model IDs, FFmpeg/FFprobe availability through either `PATH` or configured binary paths, optional approved material catalogs or provider keys for source-material fulfillment, optional multimodal LLM validation for source-video auto-analysis, and paid provider validation.

Next implementation order:

1. Prepare deployment environment: Atlas credentials, verified model IDs, `CINEJELLY_API_AUTH_TOKEN`, FFmpeg/FFprobe on `PATH` or configured binary paths, and any opt-in material/source-video analysis settings.
2. Run `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run preflight`.
3. Validate the operator request file with `npm.cmd run validation:render-request -- --request <request-json>` before any paid run.
4. Run one paid Atlas validation render using `npm.cmd run validation:paid-render -- --request <request-json>` with a short non-sensitive operator-supplied request.
5. Run `npm.cmd run validate:artifacts -- <artifact-directory>` and inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, `stage-lifecycle.json`, `material-sourcing-plan.json`, and deliverable metadata.
6. Update readiness notes and remaining blockers in `docs/PROJECT_CONTEXT.md` and `docs/IMPLEMENTATION_ROADMAP.md`.

Detailed milestones are tracked in `docs/IMPLEMENTATION_ROADMAP.md`; validation execution is described in `docs/OPERATOR_RUNBOOK.md`.

## Source Snapshot Strategy

CineJelly is source-traceable and product-owned. It keeps full upstream snapshots under `external/upstream/` so engineers can check behavior against original sources, copy or adapt useful pieces, and then develop them into CineJelly-owned modules under `src/`, `data/`, and `docs/`. The source snapshot is fuel; the production implementation remains CineJelly's own product layer.

Public source is not automatically unrestricted. MIT sources can be reused with attribution and notices, CC BY prompt content needs attribution review before bundled use, AGPL implementation code requires acceptance of AGPL obligations or legal approval, and no-license sources stay in the snapshot/audit layer until permission is clarified.
