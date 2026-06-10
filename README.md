# CineJelly Seedance Ultimate Director

Commercial agentic video production architecture for high-quality Seedance 2.0 workflows through Atlas Cloud.

## Status

The repository contains the first production TypeScript foundation:

- Atlas Cloud is the default provider target for both LLM reasoning and Seedance 2.0 rendering.
- The provider layer, robust structured LLM parsing, Reference Librarian validation and graph lineage, Atlas Asset Library reference registration, configurable render cost gating, prompt compiler, Production Graph planning and run-recording, continuity ledger generation, Consistency Guardian, director orchestration, assembly/postproduction engines, and production HTTP API are implemented under `src/`.
- Quality mode now drives actual render behavior: Economy/Standard/High/Ultimate produce one to four Seedance candidates per shot, authorize zero to three targeted repair attempts, the Consistency Guardian selects the best candidate, and the Production Graph records selected, rejected, and repair candidate evidence.
- No test, mock, demo, sample, or example files are part of the project.
- Runtime validation still requires real Atlas Cloud credentials, verified model IDs, FFmpeg, and FFprobe before customer use.

The next implementation phase is real end-to-end validation and hardening around observability, queueing, and deployment operations.

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
- `CINEJELLY_POLLING_INTERVAL_MS`
- `CINEJELLY_POLLING_TIMEOUT_MS`
- `CINEJELLY_RENDER_CONCURRENCY`
- `CINEJELLY_API_JOB_CONCURRENCY`
- `CINEJELLY_API_JOB_HISTORY_LIMIT`
- `CINEJELLY_DISABLE_API_AUTH`
- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities instead of relying on default documented capability assumptions.
When a request includes `settings.maxCostUsd`, `CINEJELLY_RENDER_COST_USD_PER_SECOND` must be configured so the render cost gate can block over-budget jobs before provider calls.

Build commands:

```bash
npm install
npm run typecheck
npm run build
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

`GET /v1/preflight` verifies required Atlas configuration, API authentication configuration, and local FFmpeg/FFprobe availability without exposing secret values. It is available before the render runtime is initialized, so a fresh deployment can diagnose missing environment variables safely. `/health` is public; protected `/v1` endpoints require `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>` or `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`. If `CINEJELLY_API_AUTH_TOKEN` is missing, only `/v1/preflight` remains available and render/job endpoints return 503. `CINEJELLY_DISABLE_API_AUTH=true` is reserved for private trusted networks.

`POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`/`artifactDirectory`. Reference URIs must be absolute `http(s)` URLs or pre-registered `asset://` references in the current Atlas path. Output, work, and artifact paths are confined to `CINEJELLY_OUTPUT_DIR` or `assets/output_deliverables` by default; relative paths are resolved inside that root and absolute paths outside it are rejected.

For long-running 2 to 8 minute production jobs, `POST /v1/render-jobs` accepts the same body as `/v1/render`, returns `202` plus a `statusUrl`, and runs the render in an in-process queue. `GET /v1/render-jobs` lists retained jobs; `GET /v1/render-jobs/{jobId}` returns queued/running/succeeded/failed/canceled status plus redacted result, cost ledger, and artifacts when available. `DELETE /v1/render-jobs/{jobId}` cancels a queued or running job through `AbortController`. `CINEJELLY_API_JOB_CONCURRENCY` controls how many render jobs run at once per API process, and `CINEJELLY_API_JOB_HISTORY_LIMIT` controls retained in-memory job history.

The current codebase provides the provider layer, robust structured LLM parsing, Story Architect plan normalization, Reference Librarian validation for role/kind compatibility and secret-safe reference URIs, provider-neutral capability validation before Asset Library or render spend, provider telemetry with prediction IDs and provider-returned cost metadata when available, Atlas Asset Library registration/polling for video and audio references before Seedance generation, quality-mode candidate rendering, high-risk test-take gating before full render, conservative dependency-aware render scheduling, targeted repair-only rerendering, Guardian-based candidate selection, configurable cost planning and budget gating with test-take, candidate, and repair multipliers, prompt compiler, Production Graph planning plus reference asset lineage and run evidence recording for clip renders/inspections/deliverables, continuity ledger generation for Character/Style bibles, batch Consistency Guardian preflight gating, render gate blocking before assembly, director orchestration, FFmpeg assembly engine, xfade/acrossfade transition assembly, selected-resolution postproduction scaling, FFprobe media inspection, deterministic delivery gate validation, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, postproduction polish, caption sidecar/burn-in automation, audio mix automation, output/artifact path confinement, redacted API responses and run artifacts, API auth guard for credit-spending endpoints, in-process render job submit/poll/cancel orchestration, deterministic success and failure artifact persistence, and production HTTP entrypoint. The correct operating loop is:

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
40. Real end-to-end validation with Atlas credentials and FFmpeg/FFprobe installed - next

## Source Fidelity

CineJelly is source-faithful, not source-copied. It learns architecture and workflow patterns from credited sources, then implements original production code for this product. Public prompt corpora and AGPL implementation code must not be copied into the product without legal approval.
