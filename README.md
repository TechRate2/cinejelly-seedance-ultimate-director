# CineJelly Seedance Ultimate Director

Commercial agentic video production architecture for high-quality Seedance 2.0 workflows through Atlas Cloud.

## Status

The repository contains the first production TypeScript foundation:

- Atlas Cloud is the default provider target for both LLM reasoning and Seedance 2.0 rendering.
- The provider layer, robust structured LLM parsing, Reference Librarian validation and graph lineage, Atlas Asset Library reference registration, configurable render cost gating, prompt compiler, Production Graph planning and run-recording, continuity ledger generation, Consistency Guardian, director orchestration, assembly/postproduction engines, and production HTTP API are implemented under `src/`.
- Quality mode now drives actual render behavior: Economy/Standard/High/Ultimate produce one to four Seedance candidates per shot, authorize zero to three targeted repair attempts, the Consistency Guardian selects the best candidate, and the Production Graph records selected, rejected, and repair candidate evidence.
- The HTTP API now creates or accepts a sanitized request correlation ID and propagates it through JSON responses, render job summaries, provider metadata, Production Graph project metadata, and success/failure artifacts.
- The API propagates client disconnects and deployment shutdown signals into active render work so request-bound orchestration, provider calls, polling, assembly, and postproduction stop as early as the selected provider path allows.
- The assembly path materializes HTTPS provider clip URLs and remote audio tracks with bounded streaming downloads instead of loading whole rendered media into memory.
- FFmpeg/FFprobe child-process stdout and stderr are capped so noisy media failures cannot exhaust API memory.
- The planning path now emits and Guardian-validates a typed storyboard from shot contracts before render spend; storyboard panels and preflight evidence are stored in the Production Graph and durable artifacts.
- Successful runs emit `review-packet.json`, a redacted commercial handoff summary that ties planning, render, cost, delivery, and QC evidence together.
- Atlas provider cost ledger entries now record actual retry counts for retryable LLM, Seedance, prediction polling, and Asset Library HTTP calls, with prediction polling tied back to the originating model and graph node when context is available.
- Atlas prediction output mapping now tolerates nested provider response shapes such as `output`, `result`, `data`, `videos`, and file objects before declaring `OUTPUT_MISSING`.
- Atlas HTTP errors now preserve normalized status-based error codes even when the provider returns a non-JSON body, and non-JSON body previews are redacted before entering diagnostics.
- Atlas JSON metadata responses are bounded by a configurable byte cap before parsing so abnormal provider responses cannot exhaust API memory.
- Artifact manifests include per-file SHA-256 hashes for redacted JSON artifacts so production handoffs can verify file integrity after storage or transfer.
- Failure artifacts keep stack-free redacted error name/message details so audit handoffs do not expose source or runtime paths.
- API artifact bundle responses expose manifest entries and hashes without returning server-local artifact directories or manifest paths.
- Public API JSON redaction now removes inline `data:` URIs so sampled frames or provider/debug payloads cannot leak as base64 response content.
- Public API JSON redaction also removes non-HTTPS, embedded-credential, and signed/credential-query URIs while preserving clean `https://` and `asset://` values.
- Final assembled videos record output byte size and streaming SHA-256 hashes in `deliverable.json` and `review-packet.json`.
- Postproduction scales and pads non-adaptive outputs onto the selected aspect-ratio canvas before delivery validation.
- Delivery Gate blocks final handoff when FFprobe metadata does not match the selected non-adaptive aspect ratio.
- A production `npm run preflight` gate emits a redacted readiness report and exits non-zero when Atlas config, FFmpeg/FFprobe, output storage, or deployment knobs are not ready.
- Async render submissions now enforce a configurable queued/running job limit before job creation, runtime initialization, or provider spend, and job listing returns queue telemetry for operators.
- Async render submissions accept `Idempotency-Key` for retry-safe long-form job creation within retained in-process job history, preventing duplicate Atlas spend when clients retry the same payload.
- Synchronous `/v1/render` now has its own in-process concurrency gate so request-bound renders cannot crowd out async long-form work.
- Rate-limit and queue-saturation responses now include `Retry-After` plus a JSON `retryAfterSeconds` value for disciplined upstream retries.
- Render POST request body size is configurable and oversized bodies are rejected with `413` before JSON parsing, queue admission, runtime creation, or provider spend.
- API admission now validates nested caption, audio mix, frame sampling, semantic visual inspection, and transition option objects before runtime creation or provider spend.
- Runtime preflight now verifies the configured/default output directory can be prepared and written before customer traffic.
- The package declares `main`, `types`, and ESM `exports` for stable production imports from the built `dist/index.js` surface, including API, agents, core engines, providers, prompt compiler, and shared types.
- No test, mock, demo, sample, or example files are part of the project.
- Runtime validation still requires real Atlas Cloud credentials, verified model IDs, FFmpeg, and FFprobe before customer use.

The next implementation phase is real end-to-end validation and hardening around observability and deployment operations.

## Product Goal

CineJelly Seedance Ultimate Director turns one user input plus optional references into a polished commercial video:

1. understand intent and references
2. generate script, storyboard, and shot contracts
3. build a Production Graph for long-form control
4. compile Seedance 2.0 prompts
5. render through Atlas Cloud
6. inspect consistency and repair only affected graph nodes
7. assemble, polish, and export final deliverables

The target long-form range is 2 to 8 minutes, handled through graph chunking, continuity ledgers, reference binding, and Consistency Guardian checkpoints.

## Architecture Pillars

- `Production Graph`: project, validated reference assets, story, sequences, scenes, beats, shots, renders, inspection reports, repair actions, and deliverables.
- `Model Provider Abstraction`: Atlas Cloud default, future-ready for Kie.ai, fal.ai, Runway, Replicate, direct Volcengine, or other providers.
- `Prompt Compiler`: source-faithful Seedance prompt compilation from shot contracts, not hardcoded niche templates.
- `Consistency Guardian`: preflight, test-take inspection, post-render inspection, timeline inspection, and targeted repair.
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

`data/` is reserved for production-approved local knowledge artifacts such as prompt-pattern snapshots or bibles when they become necessary. `external/` is reserved for legally reviewed Git subtree snapshots of upstream references; CineJelly must not depend live on upstream repos.

## Documentation Map

- `docs/PROJECT_CONTEXT.md`: compact project memory for token-efficient agent work.
- `docs/ARCHITECTURE_SPEC.md`: full system architecture and agent responsibilities.
- `docs/CREDITS.md`: attribution, source boundaries, and license cautions.
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
- FFmpeg available on `PATH` for final clip assembly and postproduction polish
- FFprobe available on `PATH` for media inspection and delivery QC
- Atlas Cloud credentials and configured model IDs

Required environment variables:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `CINEJELLY_API_AUTH_TOKEN`

Optional environment variables:

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
- `CINEJELLY_MAX_USER_INPUT_CHARS`
- `CINEJELLY_MAX_REFERENCES`
- `CINEJELLY_MAX_CAPTION_CUES`
- `CINEJELLY_MAX_AUDIO_TRACKS`
- `CINEJELLY_MAX_METADATA_ENTRIES`
- `CINEJELLY_MAX_RENDERED_CLIP_BYTES`
- `CINEJELLY_MAX_AUDIO_TRACK_BYTES`
- `CINEJELLY_DISABLE_API_AUTH`
- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities instead of relying on default documented capability assumptions.
Atlas endpoint overrides (`ATLASCLOUD_API_BASE_URL`, `ATLASCLOUD_ASSET_BASE_URL`) must be valid HTTPS URLs without embedded credentials, query strings, or fragments; insecure or credential-bearing protocols are rejected by runtime configuration and `/v1/preflight` before any provider request can use credentials.
Numeric runtime environment values must be plain base-10 integer or decimal strings without units or suffixes; malformed deployment knobs fail runtime loading or `/v1/preflight` instead of being partially parsed.
`CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES` bounds Atlas LLM, prediction, and Asset Library JSON metadata responses before parsing; it does not apply to rendered media downloads, which are handled by the assembly streaming limits below.
When a request includes `settings.maxCostUsd`, `CINEJELLY_RENDER_COST_USD_PER_SECOND` must be configured so the render cost gate can block over-budget jobs before provider calls.

Build commands:

```bash
npm install
npm run typecheck
npm run build
npm run preflight
npm start
```

Production API:

- `GET /health`
- `GET /v1/preflight`
- `POST /v1/render`
- `POST /v1/render-jobs`
- `GET /v1/render-jobs`
- `GET /v1/render-jobs/{jobId}`
- `DELETE /v1/render-jobs/{jobId}`

`GET /v1/preflight` and `npm run preflight` verify required Atlas configuration, clean HTTPS Atlas endpoint overrides, strict numeric runtime settings, API authentication configuration, job queue settings, output directory write readiness, and local FFmpeg/FFprobe availability without exposing secret values or local absolute paths. The CLI preflight exits `1` on hard failure and `0` for pass or warning states, making it suitable for deployment gates before opening traffic. `/v1/preflight` is available before the render runtime is initialized, so a fresh deployment can diagnose missing environment variables safely. `/health` is public; protected `/v1` endpoints require `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>` or `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`. If `CINEJELLY_API_AUTH_TOKEN` is missing, only `/v1/preflight` remains available and render/job endpoints return 503. `CINEJELLY_DISABLE_API_AUTH=true` is reserved for private trusted networks.

Every API response includes `requestId` and the `X-CineJelly-Request-Id` response header. Callers may provide `X-CineJelly-Request-Id` or `X-Request-Id`; invalid values are ignored and replaced with a generated UUID-based ID. The normalized request stores this ID in metadata so LLM calls, Seedance requests, render jobs, Production Graph project nodes, `run-summary.json`, and `failure-report.json` can be correlated without exposing secrets. Public JSON responses pass through secret redaction plus local filesystem path, inline `data:` URI, non-HTTPS URI, embedded-credential URI, and signed/credential-query URI redaction, preserve deploy-safe URI values such as clean `https://` and `asset://` references while hiding server-only paths, and are returned with `Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`.

For synchronous `/v1/render`, client disconnects propagate through `AbortSignal` into Story Architect, Atlas Asset Library registration, Seedance submission/polling, assembly, and postproduction where supported. `CINEJELLY_API_SYNC_RENDER_CONCURRENCY` controls how many synchronous render pipelines can run at once per API process; the lease is acquired after body parsing, admission control, and path normalization but before runtime creation or provider spend. When that capacity is full, the API returns `503` with retry hints and callers should use `/v1/render-jobs` for long-form work. On `SIGINT` or `SIGTERM`, the API stops accepting new connections, aborts active request-bound render orchestration, and cancels queued/running async render jobs with an explicit shutdown reason.

`POST /v1/render` and `POST /v1/render-jobs` require a JSON media type such as `application/json` before body parsing. `CINEJELLY_API_MAX_BODY_BYTES` bounds render POST bodies; oversized requests return `413` before JSON parsing, queue admission, runtime creation, or provider spend. `POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`/`artifactDirectory`. Render requests pass rate limiting and admission control before runtime creation: user input length, reference count, caption cue count, audio track count, metadata shape, settings, JSON size, option object shape/ranges, and path lengths are bounded before LLM or provider spend. Public API audio track sources must be credential-free HTTPS URLs without credential-like query parameters; local audio files are reserved for internal engine calls. Reference URIs must be credential-free HTTPS URLs or pre-registered `asset://` references in the current Atlas path, and credential-like query parameters are rejected before runtime/provider spend. Output, work, and artifact paths are confined to `CINEJELLY_OUTPUT_DIR` or `assets/output_deliverables` by default; relative paths are resolved inside that root and absolute paths outside it are rejected.

During assembly, remote provider clip and audio URLs must be HTTPS and must not include embedded credentials. Remote provider clip URLs and audio tracks are downloaded as streams into temporary files and then atomically moved into the work directory. `CINEJELLY_MAX_RENDERED_CLIP_BYTES` bounds each rendered clip download so long-form jobs cannot exhaust process memory or disk unexpectedly; the default is 2 GiB per clip. `CINEJELLY_MAX_AUDIO_TRACK_BYTES` separately bounds each remote audio track download; the default is 256 MiB per track.

FFmpeg and FFprobe are launched through a shared argument-array process runner, not shell-built commands. Child-process stdout and stderr are each capped at 2 MiB by default; if a media tool exceeds that cap, the child process is stopped and the render fails with a bounded error.

For long-running 2 to 8 minute production jobs, `POST /v1/render-jobs` accepts the same body as `/v1/render`, returns `202` plus a `statusUrl`, and runs the render in an in-process queue. Clients may send an `Idempotency-Key` header; repeated submissions with the same key and same payload return the retained existing job instead of creating a duplicate render, while reusing the key for a different payload returns `409`. `GET /v1/render-jobs` returns queue telemetry plus retained jobs as compact summaries with `hasResult`, `hasCostLedger`, `hasArtifacts`, and `hasError` flags; `GET /v1/render-jobs/{jobId}` returns queued/running/succeeded/failed/canceled status plus redacted result, stack-free error name/message detail, cost ledger, and artifact manifest entries when available, without exposing server-local result paths, artifact directories, or manifest paths. `DELETE /v1/render-jobs/{jobId}` cancels a queued or running job through `AbortController`. `CINEJELLY_API_JOB_CONCURRENCY` controls how many render jobs run at once per API process, `CINEJELLY_API_JOB_HISTORY_LIMIT` controls retained in-memory job history and the in-process idempotency replay window, and `CINEJELLY_API_JOB_QUEUE_LIMIT` caps queued plus running job occupancy before new job records, runtimes, or provider calls are created. When rate limits or queue capacity blocks a request, the API returns `Retry-After` and `retryAfterSeconds` so upstream gateways can retry later instead of silently accumulating long-form jobs.

The current codebase provides the provider layer, robust structured LLM parsing, Story Architect plan normalization, Reference Librarian validation for role/kind compatibility and credential-free HTTPS or `asset://` reference URIs, provider-neutral capability validation before Asset Library or render spend, provider telemetry with prediction IDs, robust nested Atlas prediction output URL extraction, redacted non-JSON Atlas HTTP error diagnostics with preserved status-based error normalization, bounded Atlas JSON metadata response parsing, provider-returned cost metadata when available, actual retry counts for retryable Atlas HTTP calls, and graph/model context for prediction polling ledger entries, Atlas Asset Library registration/polling for video and audio references before Seedance generation, deterministic storyboard panel planning from shot contracts, Guardian storyboard preflight before render spend, quality-mode candidate rendering, high-risk test-take gating before full render, conservative dependency-aware render scheduling, targeted repair-only rerendering, Guardian-based candidate selection, configurable cost planning and budget gating with test-take, candidate, and repair multipliers, prompt compiler, Production Graph planning plus reference asset lineage, storyboard panel/preflight lineage, and run evidence recording for clip renders/inspections/deliverables, continuity ledger generation for Character/Style bibles, batch Consistency Guardian preflight gating, render gate blocking before assembly, director orchestration, FFmpeg assembly engine, bounded HTTPS streaming materialization of provider clip URLs and remote audio tracks, bounded FFmpeg/FFprobe process output capture, xfade/acrossfade transition assembly, selected-resolution and selected-aspect-ratio postproduction scaling, final video byte-size and SHA-256 integrity recording, FFprobe media inspection, deterministic delivery gate validation for selected resolution and non-adaptive aspect ratio, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, review packet generation for commercial handoff, postproduction polish, caption sidecar/burn-in automation, audio mix automation, output/artifact path confinement, redacted API responses and run artifacts, inline `data:` plus unsafe URI response redaction, stack-free failure-report error payloads, JSON media-type enforcement and configurable body-size gating for credit-spending POST endpoints, local filesystem path redaction and no-store response headers for public API JSON payloads, credential-free HTTPS Atlas endpoint override validation, strict numeric runtime environment validation, API artifact response DTOs that omit server-local artifact paths, compact render-job list summaries with detail payloads and stack-free error detail reserved for per-job polling, failure-path cost ledger capture after partial provider spend, SHA-256 manifest integrity hashes for run/failure artifacts, API auth guard, rate limiting with `Retry-After`, synchronous render concurrency gating, retry-safe async render submission with in-process idempotency, request admission control for credit-spending endpoints including nested caption/audio/transition/frame-sampling/semantic-inspection option validation, request correlation IDs across API/provider/job/graph/artifact metadata, client disconnect and deployment shutdown cancellation propagation, in-process render job submit/poll/cancel orchestration with queue-saturation retry hints, runtime preflight validation for writable output storage, redacted CLI preflight gating for deployment readiness, stable ESM package exports for built production imports across API/agent/core/provider/type modules, deterministic success and failure artifact persistence, and production HTTP entrypoint. The correct operating loop is:

1. read `AGENTS.md`
2. read `docs/PROJECT_CONTEXT.md`
3. read the relevant detailed design spec
4. implement the next production module under `src/`
5. run secret audit
6. commit and push

When semantic visual inspection is enabled, `ATLASCLOUD_LLM_MODEL` must be a model that accepts image inputs in OpenAI-compatible chat content.

## Implementation Order

1. Model Provider Abstraction Layer - implemented
2. Atlas Cloud LLM provider - implemented
3. Atlas Cloud Seedance 2.0 video provider - implemented
4. Atlas Cloud Asset Library integration - implemented
5. Prompt Compiler - implemented
6. Production Graph and Shot Planner - implemented
7. Consistency Guardian - implemented
8. Agent Orchestrator - implemented
9. Assembly engine - implemented
10. Production API/server entrypoint - implemented
11. Media inspection and postproduction polish - implemented
12. Caption sidecar and optional burn-in automation - implemented
13. Audio mix automation - implemented
14. Frame sampling QC - implemented
15. Smooth transition assembly - implemented
16. Semantic visual inspection - implemented
17. Provider schema hardening - implemented
18. Runtime deployment preflight - implemented
19. Deterministic project artifact persistence - implemented
20. Render-time Asset Library reference resolution - implemented
21. Structured story planning hardening - implemented
22. Batch preflight gating before render spend - implemented
23. Continuity ledger generation - implemented
24. Production Graph run evidence recording - implemented
25. Configurable render cost gate - implemented
26. Quality-mode candidate rendering and selection - implemented
27. Targeted repair-only rerendering and render gate blocking - implemented
28. Delivery gate and selected-resolution output validation - implemented
29. Failure report artifacts for blocked render runs - implemented
30. Provider-neutral capability gate before asset/render spend - implemented
31. Provider ledger prediction IDs and response cost metadata - implemented
32. Conservative dependency-aware render scheduling - implemented
33. High-risk test-take gating before full render - implemented
34. Reference Librarian validation and Production Graph reference lineage - implemented
35. API output and artifact path confinement - implemented
36. API response and artifact secret redaction hardening - implemented
37. Async render job submit/poll API - implemented
38. Async render job cancellation - implemented
39. API auth guard for protected render endpoints - implemented
40. API render request admission control and runtime flexible settings validation - implemented
41. API rate limiting for credit-spending endpoints - implemented
42. API request correlation across responses, jobs, provider metadata, graph metadata, and artifacts - implemented
43. API client disconnect and deployment shutdown cancellation propagation - implemented
44. Bounded streaming materialization of provider clip URLs before assembly - implemented
45. Typed storyboard planning with Production Graph and artifact persistence - implemented
46. Guardian storyboard preflight before provider render spend - implemented
47. Commercial review packet artifact for planning/render/cost/QC handoff - implemented
48. Provider retry telemetry in the cost ledger - implemented
49. Prediction polling model/graph context in the provider ledger - implemented
50. SHA-256 manifest integrity hashes for run/failure artifacts - implemented
51. Final video byte-size and SHA-256 integrity recording - implemented
52. Delivery Gate selected aspect-ratio validation - implemented
53. Postproduction selected aspect-ratio canvas enforcement - implemented
54. Compact render-job list summaries with detailed per-job polling - implemented
55. Failure-path cost ledger capture for sync and async render runs - implemented
56. Async render job queue capacity guard - implemented
57. Async render job queue telemetry and preflight validation - implemented
58. Runtime output directory write preflight - implemented
59. HTTP backpressure retry hints - implemented
60. API artifact response path redaction - implemented
61. Synchronous render concurrency gate - implemented
62. Async render idempotency key handling - implemented
63. Compact render-job error detail gating - implemented
64. Stack-free render-job API error details - implemented
65. Stack-free failure artifact error details - implemented
66. JSON media-type enforcement for render POST endpoints - implemented
67. Credential-free HTTPS Atlas endpoint override validation - implemented
68. Strict numeric runtime environment validation - implemented
69. Bounded HTTPS remote media materialization - implemented
70. Bounded FFmpeg/FFprobe process output capture - implemented
71. Credential-free HTTPS reference URI admission - implemented
72. Nested Atlas prediction output URL extraction - implemented
73. Redacted non-JSON Atlas HTTP error diagnostics - implemented
74. Bounded Atlas JSON metadata response parsing - implemented
75. Configurable API render body-size gating - implemented
76. Inline data URI redaction for public API responses - implemented
77. Unsafe URI redaction for public API responses - implemented
78. Nested render option object admission validation - implemented
79. Production CLI preflight gate - implemented
80. Stable package export contract - implemented
81. Complete package index export surface - implemented
82. Real end-to-end validation with Atlas credentials and FFmpeg/FFprobe installed - next

## Source Fidelity

CineJelly is source-faithful, not source-copied. It learns architecture and workflow patterns from credited sources, then implements original production code for this product. Public prompt corpora and AGPL implementation code must not be copied into the product without legal approval.
