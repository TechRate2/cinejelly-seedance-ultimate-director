# CineJelly Seedance Ultimate Director

Commercial agentic video production architecture for high-quality Seedance 2.0 workflows through Atlas Cloud.

## Status

The repository is in the pre-implementation architecture stage:

- Production architecture documents are complete enough to start coding.
- `src/` is a production module boundary and currently contains no implementation code.
- No test, mock, demo, sample, or example files are part of the project.
- Atlas Cloud is the default provider target for both LLM reasoning and Seedance 2.0 rendering.

The next implementation phase starts with the Model Provider Abstraction Layer, then Prompt Compiler, Production Graph, and Consistency Guardian.

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

- `Production Graph`: project, references, story, sequences, scenes, beats, shots, renders, inspection reports, repair actions, and deliverables.
- `Model Provider Abstraction`: Atlas Cloud default, future-ready for Kie.ai, fal.ai, Runway, Replicate, direct Volcengine, or other providers.
- `Prompt Compiler`: source-faithful Seedance prompt compilation from shot contracts, not hardcoded niche templates.
- `Consistency Guardian`: preflight, test-take inspection, post-render inspection, timeline inspection, and targeted repair.
- `Flexible Settings`: Fast/Standard tier, 480p/720p/1080p, quality mode, aspect ratio, duration, audio mode, watermark policy, and last-frame return policy.

## Repository Structure

```text
cinejelly-seedance-ultimate-director/
├── AGENTS.md
├── README.md
├── assets/
│   ├── output_deliverables/
│   └── reference_inputs/
├── config/
├── data/
├── docs/
├── external/
├── ops/
├── schemas/
└── src/
    ├── agents/
    ├── config/
    ├── core/
    ├── prompt_compiler/
    ├── providers/
    ├── types/
    └── utils/
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
- never commit API keys, provider tokens, private keys, or local credentials
- keep provider model IDs and runtime capabilities in configuration, not hardcoded business logic
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

Optional environment variables:

- `ATLASCLOUD_API_BASE_URL`
- `ATLASCLOUD_ASSET_BASE_URL`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `CINEJELLY_REQUEST_TIMEOUT_MS`
- `CINEJELLY_POLLING_INTERVAL_MS`
- `CINEJELLY_POLLING_TIMEOUT_MS`

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities instead of relying on default documented capability assumptions.

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

`GET /v1/preflight` verifies required Atlas configuration and local FFmpeg/FFprobe availability without exposing secret values.

`POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`. If output paths are omitted, local deliverables are written under `assets/output_deliverables/`.

The current codebase provides the provider layer, prompt compiler, Production Graph, Consistency Guardian, director orchestration, FFmpeg assembly engine, xfade/acrossfade transition assembly, FFprobe media inspection, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, postproduction polish, caption sidecar/burn-in automation, audio mix automation, and production HTTP entrypoint. The correct operating loop is:

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
19. Real end-to-end validation with Atlas credentials and FFmpeg/FFprobe installed - next

## Source Fidelity

CineJelly is source-faithful, not source-copied. It learns architecture and workflow patterns from credited sources, then implements original production code for this product. Public prompt corpora and AGPL implementation code must not be copied into the product without legal approval.
