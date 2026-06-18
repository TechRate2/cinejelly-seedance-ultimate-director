# CineJelly Seedance Ultimate Director

Commercial agentic video production architecture for high-quality Seedance 2.0 workflows through Atlas Cloud.

## Status

The repository contains a production-oriented TypeScript foundation. A short paid Atlas validation render has completed, automated artifact validation passes, and the clean release-candidate worktree passes the no-spend release audit. The project should still not be treated as open customer traffic until manual media review, redaction review, long-form/source-video/remote-stock/generated-audio validation, and production deployment hardening are complete.

- Atlas Cloud is the default provider target for both LLM reasoning and Seedance 2.0 rendering.
- `src/` contains working foundations for the provider layer, structured LLM parsing, Reference Librarian validation and graph lineage, Atlas media upload/direct-reference handling, configurable render cost gating, prompt compilation, Production Graph planning and run-recording, continuity ledger generation, Consistency Guardian checks, director orchestration, assembly/postproduction engines, postproduction asset planning, generated-audio intent/execution planning, generated-audio output validation, batch reconciliation, optional batch artifact evidence, generated-audio asset resolution plus catalog preflight, Atlas generated-audio submit/poll execution behind capability and spend gates, and production HTTP API.
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
- Postproduction asset planning now classifies supplied caption cues, supplied audio tracks, and generated-audio intents into deterministic evidence before final assembly, writes `postproduction-assets.json`, maps generated-audio intents to verified provider capabilities when available, validates generated-audio provider results and result batches before they can become mix tracks, can resolve reviewed generated-audio `asset://` outputs into credential-free HTTPS mix inputs, validates an optional operator-owned generated-audio asset resolution catalog during preflight, and marks inconsistent caption/audio/generated-audio planning inputs as review-required instead of silently ignoring them; Atlas `xai/tts-v1` TTS submit/poll execution is wired behind verified capability, schema-review, budget, explicit spend, output validation, and manual-review gates, while BGM/ambience/SFX still require verified Atlas model mappings before use.
- Long-form runs now emit a typed stage lifecycle for `plan`, `storyboard`, `prompt`, `source_material`, `render`, `inspect`, `repair`, `assemble`, and `deliver`; review packets and durable artifacts expose this evidence for operator review.
- Async render jobs now retain bounded stage progress telemetry during execution: list responses expose compact current-stage fields, while per-job polling exposes retained stage progress events without local paths, secrets, inline media, or raw provider payloads.
- Compact async job history now also retains a bounded provider checkpoint summary from cost-ledger entries, the provider reconciliation foundation can query active prediction IDs through the provider abstraction, and the provider handoff foundation can exercise local leases, a deployment-token-protected lease-service route, HTTPS external-lease action decisions, idempotent worker-action intent replay, local two-worker lease handoff after expiry, and production HTTPS lease-service capture readiness with retained-worker heartbeat evidence without storing raw provider payloads.
- The codebase now includes source-translation lineage contracts and a redacted logging foundation for future Faithful Logic Translation work across providers, prompt compiler, graph planning, and guardian modules.
- The intake path now supports a bounded `sourceVideoAnalysis` contract for VideoAgent/OpenMontage-style transcript, scene, keyframe, pacing, style, and safety deconstruction; Story Architect uses it as original structural guidance, and graph/artifacts preserve the source-video lineage.
- An opt-in Source Video Auto Analysis Adapter can sample bounded frames from a clean HTTPS `source_video_structure` reference, ask the configured Atlas LLM for structural deconstruction, normalize the result through `SourceVideoAnalyst`, and keep local frame paths/base64 payloads out of returned analysis and artifacts.
- Successful runs emit `review-packet.json`, a redacted commercial handoff summary that ties planning, render, cost, delivery, and QC evidence together.
- Optional reference selection metadata for camera, composition, character, view, timeline index, and authorization is validated at API admission, preserved by the Reference Librarian, and consumed by deterministic reference selection before provider request compilation.
- Normalized source-video scene/keyframe metadata now enriches exact keyframe URI references and matching source-video structure references with typed camera/composition/timeline/source-scene/source-keyframe hints for reference scoring.
- Atlas provider cost ledger entries now record actual retry counts for retryable LLM, Seedance, prediction polling, and media upload/direct-reference handling, with prediction polling tied back to the originating model and graph node when context is available.
- Atlas prediction output mapping now tolerates nested provider response shapes such as `output`, `result`, `data`, `videos`, and file objects before declaring `OUTPUT_MISSING`, and prediction polling falls back from `/model/prediction/{id}` to Atlas result compatibility routes, including the documented `/model/getResult?predictionId=...`, only when earlier routes are unavailable.
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
- A production `npm run preflight` gate emits a redacted preflight report and exits non-zero when Atlas config, FFmpeg/FFprobe, output storage, or deployment knobs are not ready; `npm run validation:render-request -- --request <request-json>` validates an operator-supplied render request without provider spend, `npm run validation:readiness` and `GET /v1/validation-readiness` convert preflight into a Phase 6 operator-readiness report, and `npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>` provides a readiness-gated paid-render validation harness that blocks before provider spend unless the operator passes the explicit spend-confirmation flag and a fresh Atlas billing-readiness report proves budget fit.
- `npm run doctor` is the beginner-safe local check: it prepares `.env`, preserves existing secrets, detects media tools, runs the no-spend local smoke, summarizes readiness, and never runs paid Atlas rendering. `npm run validation:release-audit` is the strict Phase 6 hygiene gate; `npm run validation:business-readiness` is the commercial customer-traffic gate.
- Async render submissions now enforce a configurable queued/running job limit before job creation, runtime initialization, or provider spend, and job listing returns queue telemetry for operators.
- Async render submissions accept `Idempotency-Key` for retry-safe long-form job creation within retained in-process job history, preventing duplicate Atlas spend when clients retry the same payload.
- Synchronous `/v1/render` now has its own in-process concurrency gate so request-bound renders cannot crowd out async long-form work.
- Rate-limit and queue-saturation responses now include `Retry-After` plus a JSON `retryAfterSeconds` value for disciplined upstream retries.
- Render POST request body size is configurable and oversized bodies are rejected with `413` before JSON parsing, queue admission, runtime creation, or provider spend.
- API admission now validates nested caption, audio mix, frame sampling, semantic visual inspection, and transition option objects before runtime creation or provider spend.
- Runtime preflight now verifies the configured/default output directory can be prepared and written before customer traffic.
- The package declares `main`, `types`, and ESM `exports` for stable production imports from the built `dist/index.js` surface, including API, agents, core engines, providers, prompt compiler, and shared types.
- No CineJelly-owned test, mock, demo, sample, or example files are part of the production runtime. Upstream snapshots may contain original upstream development files inside `external/upstream/`; those files become product material only after license/product review and an intentional copy/adapt step.
- Runtime validation currently has real Atlas credentials, verified local FFmpeg/FFprobe access, a Phase 6 validation-readiness report at 59/60 pass with only the intentional mandatory-client-policy warning, one completed short paid Atlas render, no-spend client policy, deployment-readiness, billing/admin/quota, and production-operations evidence tooling, and a clean release-candidate release audit. Customer use is still blocked by full commercial evidence for a real HTTPS deployment, long-form/source-video/remote-stock/generated-audio paths, billing/admin operations, and production operations.
- The repository now includes a production container packaging path (`Dockerfile` and `.dockerignore`) plus `npm run validation:deployment-package`, which statically verifies the no-secret Docker build context, FFmpeg/FFprobe runtime installation, `/health` healthcheck, production API entrypoint, env template notes, and deployment docs before any real host is published.

Faithful Logic Translation foundations are implemented for Prompt Binding Plan, Guardian Repair Decision Provenance, Reference Selection Scoring, Reference Metadata Enrichment, Source Video Reference Metadata Enrichment, Source Video Auto Analysis Adapter, Provider Polling/Retry/Cost Fidelity, Long-Form Planning/Batch Workflow, Render Job Stage Progress Telemetry, Render Provider Reconciliation, Render Provider Handoff including protected lease service/action ledger/local two-worker validation/production capture runner, API Artifact Validation Evidence, API Client Policy And Quota Gate, Deployment Readiness Capture, Billing Admin Operations Evidence, Production Operations Evidence, Phase 6 Validation Readiness Report, Phase 6 Render Request Validation Contract, Phase 6 Paid Render Validation Runner, Business Readiness Audit, Media Tool Binary Resolution, Material Source Adapter Validation, Local Material Library Adapter, Remote Stock Material Adapter, Postproduction Asset Orchestration, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence including review-packet handoff evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, and Generated Audio Provider Execution Contract. The next required phase is real provider validation using `docs/OPERATOR_RUNBOOK.md`.

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
- `docs/reference-implementations/live-readiness-input-validator.md`: no-spend input gate for confirming live deployment, ops, source-video, stock, audio, and long-form budget inputs before paid validation.
- `docs/reference-implementations/report-contract-validation.md`: no-spend schema contract gate for generated release, deployment-capture, and business-readiness reports.
- `docs/reference-implementations/director-style-benchmark-harness.md`: no-spend DirectorBench-style artifact-contract benchmark for backend quality evidence before UI work.
- `docs/reference-implementations/business-readiness-validation-plan.md`: no-spend planner contract for sequencing remaining commercial validation before paid Atlas spend.
- `docs/reference-implementations/atlas-billing-readiness.md`: no-spend Atlas Billing Public API readiness gate for checking billing-capable key access and budget fit before paid Atlas validation.
- `docs/reference-implementations/deployment-container-packaging.md`: Docker packaging contract and no-spend package validator for repeatable HTTPS deployment preparation without baking secrets or artifacts into images.
- `docs/BEGINNER_QUICKSTART.md`: shortest setup path for non-specialist operators, including automation boundaries and clean-source checks.
- `docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md`: practical install, environment, model, API, settings, and no-UI runtime guide.
- `docs/PROMPT_COMPILER_DESIGN.md`: adaptive Seedance prompt compiler design.
- `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`: 2 to 8 minute graph and chunking strategy.
- `docs/CONSISTENCY_GUARDIAN_DESIGN.md`: quality, continuity, inspection, and repair design.
- `docs/MODEL_PROVIDER_ABSTRACTION.md`: Atlas Cloud default provider layer and future provider contracts.
- `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`: user-facing settings and provider validation policy.

## Configuration And Secrets

Runtime implementation will require:

- `ATLASCLOUD_API_KEY`: Atlas Cloud pay-as-you-go API key for `/api/v1` media, upload, video, and generated-audio validation calls.
- `ATLASCLOUD_LLM_API_KEY`: optional separate Atlas Coding Plan key for `/v1` chat completions; if omitted, the runtime falls back to `ATLASCLOUD_API_KEY`.

Security rules:

- never commit `.env` files
- never commit or return API keys, provider tokens, private keys, signed URL credentials, or local credentials
- keep provider model IDs and runtime capabilities in configuration, not hardcoded business logic
- `setup:local` and `doctor` can write documented Seedance capability assumptions into `.env`; verify the current Atlas model catalog before customer release
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
- `ATLASCLOUD_LLM_BASE_URL`
- `ATLASCLOUD_API_BASE_URL`
- `ATLASCLOUD_MEDIA_BASE_URL`
- `ATLASCLOUD_BASE_URL`
- `ATLASCLOUD_ASSET_BASE_URL`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `ATLASCLOUD_GENERATED_AUDIO_MODEL`
- `ATLASCLOUD_GENERATED_AUDIO_VOICE_ID`
- `ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS`
- `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON`
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
- `CINEJELLY_API_CLIENTS_JSON`
- `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER`
- `CINEJELLY_CLIENT_USAGE_LEDGER_PATH`
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

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities. `setup:local` writes documented default assumptions based on the configured Standard/Fast model IDs so local readiness is less fragile, but those assumptions still need Atlas catalog verification before customer release.
`ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` can pin verified Atlas generated-audio capability records for `tts_narration`, `bgm`, `ambience`, or `sfx`. The local validation command defaults to Atlas's documented `xai/tts-v1` TTS model shape for evidence, but business readiness requires `npm run validation:generated-audio` to pass with explicit spend, schema-review, output validation, ledger, and manual audio review evidence.
Preflight, live-input checks, and business-readiness planning validate generated-audio capability JSON shape when it is configured, while keeping Atlas generated-audio execution disabled when no reviewed capability records are present.
Atlas endpoint overrides (`ATLASCLOUD_LLM_BASE_URL`, `ATLASCLOUD_API_BASE_URL`, `ATLASCLOUD_MEDIA_BASE_URL`, `ATLASCLOUD_BASE_URL`, `ATLASCLOUD_ASSET_BASE_URL`) must be valid HTTPS URLs without embedded credentials, query strings, or fragments; insecure or credential-bearing protocols are rejected by runtime configuration and `/v1/preflight` before any provider request can use credentials. When the official `api.atlascloud.ai` host is used, runtime configuration and preflight also require the documented path split: Atlas LLM calls use `/v1`; image/video/upload calls use `/api/v1`.
Numeric runtime environment values must be plain base-10 integer or decimal strings without units or suffixes; malformed deployment knobs fail runtime loading or `/v1/preflight` instead of being partially parsed.
`PORT` must be a valid TCP port from 1 to 65535 when set; `npm run preflight` and startup enforce the same range.
`CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES` bounds Atlas LLM, prediction, and media upload JSON metadata responses before parsing; it does not apply to rendered media downloads, which are handled by the assembly streaming limits below.
`CINEJELLY_TRUST_PROXY_HEADERS=true` allows the API rate limiter to bucket clients by `X-Forwarded-For`; leave it unset unless a trusted reverse proxy strips and rewrites client IP headers before traffic reaches CineJelly.
When a request includes `settings.maxCostUsd`, `CINEJELLY_RENDER_COST_USD_PER_SECOND` must be configured so the render cost gate can block over-budget jobs before provider calls.
`CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` optionally enables the local material library adapter. The file must be an operator-owned JSON catalog whose entries use safe `asset://` or credential-free `https://` asset URIs, rights metadata, and bounded labels/tags; runtime preflight validates it before customer traffic. Do not put local filesystem paths or signed URLs into catalog `assetUri` values.
`CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH` optionally points to an operator-owned generated-audio asset resolution catalog. Entries must map clean `asset://` generated-audio outputs to credential-free HTTPS delivery URLs with `approvedForMix` and optional identity/provider/duration evidence; preflight validates the catalog but does not call audio providers or create generated audio.
`CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` enables opt-in remote stock material adapters. At least one approved provider key must be configured: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, or `COVERR_API_KEY` with `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true`. Provider keys are used only for outbound search requests; material candidates stored in artifacts must use credential-free HTTPS URLs and attribution metadata.

Build commands:

```bash
npm install
npm run doctor
npm run typecheck
npm run build
npm run preflight
npm run validation:readiness
npm run validation:create-request -- --safe-default
npm run validation:local-smoke
npm run validation:deployment-readiness -- --base-url <deployment-url>
npm run validation:long-form -- --duration-seconds 120
npm run validation:atlas-billing -- --max-budget-usd <approved-long-form-budget-usd> --planned-cost-usd <estimated-long-form-cost-usd> --output assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json --confirm-live-network
npm run validation:atlas-billing -- --max-budget-usd <approved-source-video-budget-usd> --planned-cost-usd <approved-source-video-budget-usd> --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network
npm run validation:source-video-auto-analysis -- --source-video-url <clean-https-video-url> --confirm-provider-spend --max-cost-usd <approved-source-video-budget-usd> --atlas-billing-report assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json
npm run validation:remote-stock -- --confirm-live-network --confirm-commercial-terms-reviewed
npm run validation:atlas-billing -- --max-budget-usd 5 --planned-cost-usd 0.000870 --output assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json --confirm-live-network
npm run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed
npm run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --confirm-manual-audio-review
npm run ops:create-client-policy -- --client-id pilot-client
npm run ops:apply-client-policy-env
npm run validation:ops-config -- --write-drafts
npm run ops:promote-attestations -- --dry-run
npm run ops:promote-attestations
npm run validation:ops-config
npm run validation:launch-intake -- --write-draft
npm run validation:launch-intake
npm run validation:live-inputs
npm run validation:business-plan
npm run validation:atlas-billing
npm run validation:commercial-inputs
npm run validation:quality-benchmark
npm run validation:report-contracts
npm run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json
npm run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json
npm run validation:release-audit
npm run validation:render-request -- --request <request-json>
npm run validation:atlas-billing -- --max-budget-usd <approved-paid-render-budget-usd> --planned-cost-usd <estimated-paid-render-cost-usd> --output assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json --confirm-live-network
npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json
npm run validate:artifacts -- <artifact-directory>
npm start
```

`CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD` is the shared default approved-budget ceiling for `validation:live-inputs`, `validation:business-plan`, and `validation:atlas-billing`; keep it low until the operator explicitly approves the full paid Atlas validation plan, or pass `--max-budget-usd` for a one-off run.
After changing that ceiling, rerun `npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-budget> --confirm-live-network`; stored Atlas billing reports are treated as stale when their captured budget or planned cost no longer matches the current plan.
`CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS` controls how long a stored Atlas billing-readiness report can unlock paid-validation planning; the default is 24 hours, after which `validation:live-inputs`, `validation:business-plan`, and `validation:business-readiness` require a fresh no-spend `/balance` probe.

Production API:

- `GET /health`
- `GET /v1/preflight`
- `GET /v1/validation-readiness`
- `GET /v1/render-settings`
- `POST /v1/render`
- `POST /v1/render-jobs`
- `GET /v1/render-jobs`
- `GET /v1/render-jobs/{jobId}`
- `DELETE /v1/render-jobs/{jobId}`
- `GET /v1/admin/client-policy`

`GET /v1/preflight` and `npm run preflight` verify required Atlas configuration, AtlasCloud docs conformance for LLM/media/billing endpoint families, clean HTTPS Atlas endpoint overrides, strict numeric runtime settings, API authentication configuration, optional client policy configuration, job queue settings, optional render-provider lease-service storage, optional local material catalog validity, optional generated-audio asset resolution catalog validity, optional remote stock provider readiness, optional source-video auto-analysis work-directory readiness, output directory write readiness, and local FFmpeg/FFprobe availability without exposing secret values or local absolute paths. Deployments can use `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH` to point at portable binaries instead of modifying global `PATH`; runtime media engines use the same resolved commands as preflight. `GET /v1/render-settings` returns a secret-free descriptor of supported tier, resolution, quality, ratio, audio, duration, cost, selected model IDs, admin-allowlisted Seedance model choices for `modelPreferences.seedanceModelId`, and Seedance capability configuration for API clients and future UI controls. `npm run doctor` runs setup plus local no-spend validation as the simplest operator check; it preserves existing `.env` values, creates missing local defaults, writes the local smoke evidence report under `assets/output_deliverables`, and never calls Atlas rendering. `npm run validation:client-policy-smoke` proves client-key digest auth, quota reservation, usage-ledger writing, and quota blocking without starting providers or calling Atlas. `npm run validation:provider-lease-service` starts a local protected API instance and proves `/v1/render-provider-handoff-leases/{acquire,release,heartbeat,leases,active}` against a durable lease file without Atlas/provider calls. `npm run validation:deployment-readiness -- --base-url <deployment-url>` captures no-spend real-host evidence from `/health`, `/v1/preflight`, `/v1/validation-readiness`, and `/v1/render-settings`; localhost captures are marked local and do not satisfy the business-readiness deployment gate. `npm run validation:long-form` creates or reads a 120-480s request, verifies admission/readiness/cost/chunking without provider calls, and writes `cinejelly.long-form-validation.v1` evidence; adding `--confirm-paid-spend` passes the request into the paid-render validation runner, but business readiness still requires artifact pass, 120-480s final duration, provider-safe chunks, and manual quality/redaction review. `npm run validation:source-video-auto-analysis -- --source-video-url <clean-https-video-url>` verifies the source-video spend gate without provider calls; adding `--confirm-provider-spend` also requires `--max-cost-usd` plus a fresh matching `atlas-billing-source-video-report.json` before bounded FFmpeg frame extraction or Atlas LLM calls can run through `SourceVideoAutoAnalyzer`. `npm run validation:remote-stock` verifies the remote-stock network gate without provider calls, and adding `--confirm-live-network --confirm-commercial-terms-reviewed` calls configured Pexels/Pixabay/commercially approved Coverr adapters, validates credential-free HTTPS candidates through `MaterialSourceValidator`, and writes business-readiness evidence without exposing provider keys or outbound search URLs. `npm run validation:generated-audio` verifies Atlas generated-audio input, capability, cost, schema, output-batch, ledger, and manual-review gates without provider execution until `--confirm-provider-spend` is present; business readiness requires the report schema `cinejelly.generated-audio-validation.v1` to pass with schema review and manual audio review evidence. `npm run ops:create-client-policy` creates an ignored client-policy kit with a raw one-time client key file, SHA-256 digest policy JSON, env snippet, and redacted report; it does not call Atlas or deployment endpoints and it should feed `validation:ops-config` before customer traffic. `npm run ops:apply-client-policy-env` merges only the generated client-policy env keys into `.env`, preserves Atlas keys and deployment tokens, creates an ignored backup, and writes a redacted apply report. `npm run validation:ops-config` performs no-spend, no-network pre-capture validation for client quota policy plus non-secret billing/admin and production-operations attestations; `--write-drafts` writes incomplete draft files under ignored output deliverables and those drafts are intentionally not release evidence. `npm run ops:promote-attestations` validates completed draft attestations with `validation:ops-config` before copying them into ignored `ops/*.json` input files, and blocks rather than creating fake evidence when fields are still blank. `npm run validation:launch-intake -- --write-draft` creates the ignored commercial launch intake draft and Markdown fill-out packet; `npm run validation:launch-intake` validates the filled `ops/commercial-launch-intake.json` without secrets, network calls, or provider calls. `npm run validation:live-inputs` reads only local env shape, optional launch intake, ops reports, Atlas billing-readiness evidence, attestation presence, clean deployment/source-video URL shape, remote-stock approvals, generated-audio capability inputs, and known cost estimates; it writes `cinejelly.live-readiness-inputs.v1`, makes no network/provider calls, and recommends deferring Atlas spend while prerequisite gates are incomplete or the Atlas billing/budget gate fails. `npm run validation:business-plan` reads current business-readiness, optional launch intake, ops-config, Atlas billing reports, and non-secret environment reports, estimates known paid validation cost, can mark an independently budgeted paid slice ready while full-sequence spend remains deferred, surfaces `commercial_launch_intake_precheck`, and writes a no-spend sequence plan before any Atlas, stock-provider, deployment, FFmpeg, or render work is attempted. `npm run validation:atlas-billing` is local-only until `--confirm-live-network` is present; with confirmation it calls only Atlas Billing Public API `/balance`, prefers the documented `available` balance, records safe balance/credit-grant breakdown evidence, writes `cinejelly.atlas-billing-readiness.v1`, and checks billing-capable key access plus budget/balance fit before paid Atlas validation. `npm run validation:commercial-inputs` reads the current readiness reports and writes a secret-free JSON plus Markdown checklist of the remaining operator-provided URLs, env placeholders, attestation files, budget approval, evidence commands, paid validation commands, and manual review tasks. `npm run validation:business-readiness` now treats Atlas billing reports as hard pre-paid-spend gates while keeping them outside the weighted product-completion percentage. `npm run validation:report-contracts` validates generated release/business-readiness reports and optional deployment-capture reports against local schemas, writes `cinejelly.report-contract-validation.v1`, and catches report/schema drift without calling providers or changing business-readiness status. `npm run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json` captures no-spend billing/admin/quota evidence from configured client policy, a writable usage ledger, deployment-token-only `/v1/admin/client-policy`, and a non-secret operator attestation for billing/refund/tax/support/account lifecycle controls. `npm run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json` captures no-spend production storage/observability/support evidence from diagnostic endpoints and a non-secret operations attestation. `npm run validation:release-audit` reads local smoke evidence, paid-render evidence, git hygiene, ignored secret/output paths, tracked secret scan, and external import boundaries; when `release_ready`, it can be used as Phase 6 hygiene evidence but still reports `canReleaseToCustomerTraffic=false`. `npm run validation:create-request -- --safe-default` writes a local non-sensitive request JSON under `assets/output_deliverables` for operator validation; it does not call Atlas, create providers, write render artifacts, or include secrets. `npm run validation:local-smoke` runs the local no-spend gate in one command: safe request creation, typecheck, build, client-policy quota smoke, readiness, request validation, API diagnostic readiness, and a local no-spend evidence report under `assets/output_deliverables`. `npm run validation:render-request -- --request <request-json>` checks an operator-owned request file through the same render request admission and output-root path normalization used by `/v1/render` and the paid-render runner, emits a redacted pass/fail report, and does not run readiness, initialize providers, call Atlas, or write render artifacts. `npm run validation:readiness` and `GET /v1/validation-readiness` wrap the preflight report into a redacted Phase 6 readiness report with blocker names, warning names, next actions, and an explicit reminder that customer release requires paid Atlas render evidence, artifact validation, source hygiene, and manual review. `npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>` reuses that readiness gate before paid provider spend, blocks with `blocked_by_spend_confirmation` when the explicit spend-confirmation flag is missing, blocks with `blocked_by_atlas_billing` when fresh Atlas billing-readiness evidence is missing or incompatible with the request budget cap, requires `--allow-warnings` to continue from a warning decision, uses the same render request admission and output-root path normalization as `/v1/render`, writes success/failure artifacts, validates them, and emits a redacted operator report without local artifact paths. The CLI preflight exits `1` on hard failure and `0` for pass or warning states; request validation exits `1` for invalid request files, validation readiness exits `1` only when hard blockers remain, release audit exits `1` until hygiene blockers are cleared, while the HTTP readiness endpoint returns `503` for `blocked` and `200` for warning/ready decisions. `/v1/preflight` and `/v1/validation-readiness` are available before the render runtime is initialized, so a fresh deployment can diagnose missing environment variables safely. `/health` is public; protected `/v1` endpoints require `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>`, `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`, or a configured client API key whose SHA-256 digest appears in `CINEJELLY_API_CLIENTS_JSON`. Render POST attempts are rate limited before auth failure responses so unauthenticated floods cannot bypass the render submission throttle. If no deployment token or client policies are configured, only `/v1/preflight` and `/v1/validation-readiness` remain available and render/job endpoints return 503. `CINEJELLY_DISABLE_API_AUTH=true` is reserved for private trusted networks.

Every API response includes `requestId` and the `X-CineJelly-Request-Id` response header. Callers may provide `X-CineJelly-Request-Id` or `X-Request-Id`; invalid values are ignored and replaced with a generated UUID-based ID. The normalized request stores this ID in metadata so LLM calls, Seedance requests, render jobs, Production Graph project nodes, `run-summary.json`, and `failure-report.json` can be correlated without exposing secrets. Public JSON responses pass through secret redaction plus local filesystem path, inline `data:` URI, non-HTTPS URI, embedded-credential URI, and signed/credential-query URI redaction, preserve deploy-safe URI values such as clean `https://` and `asset://` references while hiding server-only paths, and are returned with `Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`.

For synchronous `/v1/render`, client disconnects propagate through `AbortSignal` into Story Architect, Atlas media upload or direct-reference handling, Seedance submission/polling, assembly, and postproduction where supported. `CINEJELLY_API_SYNC_RENDER_CONCURRENCY` controls how many synchronous render pipelines can run at once per API process; the lease is acquired after body parsing, admission control, and path normalization but before runtime creation or provider spend. When that capacity is full, the API returns `503` with retry hints and callers should use `/v1/render-jobs` for long-form work. On `SIGINT` or `SIGTERM`, the API stops accepting new connections, aborts active request-bound render orchestration, and cancels queued/running async render jobs with an explicit shutdown reason.

`POST /v1/render` and `POST /v1/render-jobs` require an application JSON media type, either `application/json` or `application/*+json`, before body parsing. `CINEJELLY_API_MAX_BODY_BYTES` bounds render POST bodies; oversized requests return `413` before JSON parsing, queue admission, runtime creation, or provider spend. `POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `sourceVideoAnalysis`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `generatedAudioIntents`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`/`artifactDirectory`. `sourceVideoAnalysis` is a bounded deconstruction contract for a `source_video_structure` reference: transcript cues, scenes, keyframes, pacing notes, style notes, structural beats, and safety notes. `generatedAudioIntents` is a bounded planning contract for requested narration, BGM, ambience, or SFX; the current foundation keeps Atlas audio no-spend by default, but can execute ready generated-audio items through the provider-neutral runner when verified audio capabilities and an `AudioProvider` are present. Render requests pass rate limiting and admission control before runtime creation: user input length, reference count, source-video analysis sizes, caption cue count, audio track count, generated-audio intent count, metadata shape, settings, JSON size, option object shape/ranges, and path lengths are bounded before LLM or provider spend. Public API audio track sources must be credential-free HTTPS URLs without credential-like query parameters; local audio files are reserved for internal engine calls. Reference URIs and source-video keyframe URIs must be credential-free HTTPS URLs or pre-registered `asset://` references in the current Atlas path, and credential-like query parameters are rejected before runtime/provider spend. Output, work, and artifact paths are confined to `CINEJELLY_OUTPUT_DIR` or `assets/output_deliverables` by default; relative paths are resolved inside that root and absolute paths outside it are rejected.

During assembly, remote provider clip and audio URLs must be HTTPS and must not include embedded credentials. Remote provider clip URLs and audio tracks are downloaded as streams into temporary files and then atomically moved into the work directory. `CINEJELLY_MAX_RENDERED_CLIP_BYTES` bounds each rendered clip download so long-form jobs cannot exhaust process memory or disk unexpectedly; the default is 2 GiB per clip. `CINEJELLY_MAX_AUDIO_TRACK_BYTES` separately bounds each remote audio track download; the default is 256 MiB per track.

FFmpeg and FFprobe are resolved through `CINEJELLY_FFMPEG_PATH`/`CINEJELLY_FFPROBE_PATH` when configured, otherwise through `PATH`, and are launched through a shared argument-array process runner, not shell-built commands. Child-process stdout and stderr are each capped at 2 MiB by default; if a media tool exceeds that cap, the child process is stopped and the render fails with a bounded error.

For long-running 2 to 8 minute production jobs, `POST /v1/render-jobs` accepts the same body as `/v1/render`, returns `202` plus a `statusUrl`, and runs the render in an in-process queue. Clients may send an `Idempotency-Key` header; repeated submissions with the same key and same payload return the retained existing job instead of creating a duplicate render or double-reserving client quota, while reusing the key for a different payload returns `409`. `GET /v1/render-jobs` returns queue telemetry plus retained jobs as compact summaries with `currentStage`, `currentStageStatus`, `progressEventCount`, `hasResult`, `hasCostLedger`, `hasProviderCheckpoint`, `hasArtifacts`, `hasArtifactValidation`, `artifactValidationStatus`, and `hasError` flags; client API keys see only their own retained jobs, while the deployment token can see all retained jobs. `GET /v1/render-jobs/{jobId}` returns queued/running/succeeded/failed/canceled status plus retained `stageProgressEvents`, redacted result, stack-free error name/message detail, cost ledger, compact provider checkpoint evidence, artifact manifest entries, and artifact validation checks when available, without exposing server-local result paths, artifact directories, or manifest paths. `RenderProviderReconciler` can turn restored checkpoint prediction IDs into redacted provider-status evidence through the provider abstraction, and `RenderProviderHandoffCoordinator` adds local file-lease, protected lease-service route, and HTTPS external-lease adapter foundations with retained-worker heartbeat evidence for terminal-close, continue-polling, held-by-other, and manual-audit decisions; this still does not replace multi-worker deployment proof or automatic distributed graph resume. `DELETE /v1/render-jobs/{jobId}` cancels a queued or running job through `AbortController`. `GET /v1/admin/client-policy` requires the deployment token and returns secret-free client policy and current-month usage diagnostics without raw keys or key digests. If `CINEJELLY_RENDER_PROVIDER_LEASE_PATH` is set, deployment-token-only `/v1/render-provider-handoff-leases/{acquire,release,heartbeat,leases,active}` exposes the same durable lease contract consumed by external handoff workers. `CINEJELLY_API_CLIENTS_JSON` stores client IDs, SHA-256 key digests, enable flags, monthly request limits, reserved-cost limits, duration limits, and allowed tier/quality policy; `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true` makes configured client policy mandatory for render submissions; `CINEJELLY_CLIENT_USAGE_LEDGER_PATH` enables a JSONL reservation ledger that survives process restarts. `CINEJELLY_API_JOB_CONCURRENCY` controls how many render jobs run at once per API process, `CINEJELLY_API_JOB_HISTORY_LIMIT` controls retained in-memory job history and the in-process idempotency replay window, and `CINEJELLY_API_JOB_QUEUE_LIMIT` caps queued plus running job occupancy before new job records, runtimes, or provider calls are created. When rate limits, queue capacity, or client quota blocks a request, the API returns `Retry-After` and `retryAfterSeconds` when a retry window is known so upstream gateways can retry later instead of silently accumulating long-form jobs.

`npm run validation:provider-handoff-actions` verifies the redacted idempotent action ledger for terminal-close, resume-polling, and manual-audit handoff intents without Atlas/provider calls; it is replay evidence only and does not prove live multi-worker deployment.

At foundation level, the current codebase provides the provider layer, robust structured LLM parsing, Story Architect plan normalization with bounded source-video deconstruction guidance, Reference Librarian validation for role/kind compatibility and credential-free HTTPS or `asset://` reference URIs, Source Video Analyst normalization for transcript/scene/keyframe/pacing/style/safety analysis, provider-neutral capability validation before media upload or render spend, provider telemetry with prediction IDs, robust nested Atlas prediction output URL extraction, redacted non-JSON Atlas HTTP error diagnostics with preserved status-based error normalization, retryable Atlas abort/timeout ProviderError normalization, bounded Atlas JSON metadata response parsing, provider-returned cost metadata when available, actual retry counts for retryable Atlas HTTP calls, and graph/model context for prediction polling ledger entries, Atlas direct clean-reference preservation plus `/model/uploadMedia` handling for local video/audio references before Seedance generation, deterministic storyboard panel planning from shot contracts, Guardian storyboard preflight before render spend, quality-mode candidate rendering, high-risk test-take gating before full render, conservative dependency-aware render scheduling, targeted repair-only rerendering, Guardian-based candidate selection, configurable cost planning and budget gating with test-take, candidate, and repair multipliers, prompt compiler, Production Graph planning plus reference asset lineage, source-video analysis lineage, storyboard panel/preflight lineage, and run evidence recording for clip renders/inspections/deliverables, continuity ledger generation for Character/Style bibles, batch Consistency Guardian preflight gating, render gate blocking before assembly, director orchestration, FFmpeg assembly engine, bounded HTTPS streaming materialization of provider clip URLs and remote audio tracks, bounded FFmpeg/FFprobe process output capture, xfade/acrossfade transition assembly, selected-resolution and selected-aspect-ratio postproduction scaling, final video byte-size and SHA-256 integrity recording, FFprobe media inspection, deterministic delivery gate validation for selected resolution and non-adaptive aspect ratio, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, review packet generation for commercial handoff, postproduction polish, caption sidecar/burn-in automation, supplied-audio mix automation, generated-audio planning/execution evidence through a provider-neutral runner plus Atlas `generateAudio` submit/poll execution behind verified capability and explicit validation spend gates, output/artifact path confinement, redacted API responses and run artifacts, inline `data:` plus unsafe URI response redaction, stack-free failure-report error payloads, strict application JSON media-type enforcement and configurable body-size gating for credit-spending POST endpoints, shared render request normalization for API and validation CLI paths, local filesystem path redaction and no-store response headers for public API JSON payloads, credential-free HTTPS Atlas endpoint override validation, strict numeric runtime environment validation, API port/boolean-flag startup-preflight parity, API artifact response DTOs that omit server-local artifact paths, API artifact validation DTOs that omit server-local validator paths, compact render-job list summaries with detail payloads and stack-free error detail plus artifact validation checks reserved for per-job polling, synchronous render responses with artifact validation evidence, failure-path cost ledger capture after partial provider spend, SHA-256 manifest integrity hashes for run/failure artifacts, case-insensitive bearer-token auth guard, pre-auth proxy-safe render POST rate limiting with `Retry-After`, synchronous render concurrency gating, retry-safe async render submission with in-process idempotency, request admission control for credit-spending endpoints including nested source-video/caption/audio/generated-audio/transition/frame-sampling/semantic-inspection option validation, request correlation IDs across API/provider/job/graph/artifact metadata, client disconnect and deployment shutdown cancellation propagation, in-process render job submit/poll/cancel orchestration with queue-saturation retry hints, runtime preflight validation for writable output storage, redacted CLI and HTTP validation-readiness gates for deployment readiness, a redacted paid-render validation CLI that gates spend on readiness and immediately validates artifacts, stable ESM package exports for built production imports across API/agent/core/provider/type modules, deterministic success and failure artifact persistence, and production HTTP entrypoint. The correct operating loop is:

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
- Runtime readiness now has local Atlas credentials, configured model IDs, FFmpeg/FFprobe availability, no-spend readiness, one short paid provider validation, source-video auto-analysis validation tooling with an explicit spend gate, remote-stock provider validation tooling with explicit live-network/commercial-terms gates, no-spend ops-config draft/precheck tooling, and a trustworthy clean release-candidate Git/source-hygiene audit. Customer release still depends on manual media/artifact/redaction review, optional approved material catalogs or provider keys for source-material fulfillment, a live source-video auto-analysis run with a real clean HTTPS source video, live remote-stock validation with approved provider keys, long-form validation, billing/admin and production-ops attestations/captures, and Atlas generated-audio validation if audio generation is enabled.

Next implementation order:

1. Prepare deployment environment: Atlas credentials, verified model IDs, `CINEJELLY_API_AUTH_TOKEN`, FFmpeg/FFprobe on `PATH` or configured binary paths, and any opt-in material/source-video analysis settings.
2. Run `npm.cmd run doctor` for the complete no-spend setup/readiness check, or run `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run preflight` manually.
3. Validate the operator request file with `npm.cmd run validation:render-request -- --request <request-json>` before any paid run.
4. Reuse the existing short paid Atlas validation evidence for the current snapshot, or run a new paid Atlas validation render only after explicitly approving Atlas credit spend for a new release candidate.
5. Run `npm.cmd run validate:artifacts -- <artifact-directory>` and inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, `stage-lifecycle.json`, `material-sourcing-plan.json`, and deliverable metadata.
6. Run `npm.cmd run validation:ops-config -- --write-drafts`, fill real non-secret operator attestations, run `npm.cmd run ops:promote-attestations`, then run `npm.cmd run validation:live-inputs` before live network or paid validation.
7. Run `npm.cmd run validation:commercial-inputs` to generate the secret-free JSON and Markdown checklist of the remaining operator inputs.
8. Run `npm.cmd run validation:atlas-billing` locally, then `npm.cmd run validation:atlas-billing -- --confirm-live-network` only when the no-spend Atlas Billing Public API check is approved.
9. Run `validation:billing-admin-ops` and `validation:production-ops` against the HTTPS deployment after the live-input report says those captures can run.
10. Run `npm.cmd run validation:release-audit` and keep the release-audit report with the release evidence.
10. Update readiness notes and remaining blockers in `docs/PROJECT_CONTEXT.md` and `docs/IMPLEMENTATION_ROADMAP.md`.

Detailed milestones are tracked in `docs/IMPLEMENTATION_ROADMAP.md`; validation execution is described in `docs/OPERATOR_RUNBOOK.md`.

## Source Snapshot Strategy

CineJelly is source-traceable and product-owned. It keeps full upstream snapshots under `external/upstream/` so engineers can check behavior against original sources, copy or adapt useful pieces, and then develop them into CineJelly-owned modules under `src/`, `data/`, and `docs/`. The source snapshot is fuel; the production implementation remains CineJelly's own product layer.

Public source is not automatically unrestricted. MIT sources can be reused with attribution and notices, CC BY prompt content needs attribution review before bundled use, AGPL implementation code requires acceptance of AGPL obligations or legal approval, and no-license sources stay in the snapshot/audit layer until permission is clarified.
