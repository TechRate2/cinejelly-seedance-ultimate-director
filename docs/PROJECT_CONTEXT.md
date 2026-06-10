# CineJelly Project Context

## What This Project Is

CineJelly Seedance Ultimate Director is a commercial AI video production system. The product goal is to turn one user input, plus optional references, into a complete polished video using Atlas Cloud as the default provider for both LLM reasoning and Seedance 2.0 rendering.

## Core Product Goal

One input should produce:

1. intent and reference analysis
2. script/story structure
3. storyboard and shot contracts
4. Production Graph
5. Seedance prompt batch
6. rendered clips
7. consistency inspection and repair
8. postproduction assembly
9. final high-quality deliverable

The target long-form range is 2 to 8 minutes with high consistency.

## Non-Negotiable Rules

- Production-grade only.
- No test/mock/demo/sample/example files.
- Never commit `.env`, API keys, tokens, private keys, credentials, or generated customer media.
- Atlas Cloud is the default provider.
- Use a Model Provider Abstraction so future providers such as Kie.ai, fal.ai, Runway, Replicate, or direct Volcengine can be added later.
- Do not hardcode niche templates.
- Do not copy public prompt examples into product content.
- Do not copy AGPL code from OpenMontage into proprietary implementation.

## Architecture In One Screen

```mermaid
flowchart LR
    A["User Input + References"] --> B["Intent & Reference Intake"]
    B --> C["Production Graph Builder"]
    C --> D["Prompt Compiler"]
    C --> E["Reference Binder"]
    D --> F["Model Provider Layer"]
    E --> F
    F --> G["Atlas Cloud Seedance 2.0"]
    G --> H["Clip Store"]
    H --> I["Consistency Guardian"]
    I -->|repair| C
    I -->|approved| J["Postproduction"]
    J --> K["Final Deliverable"]
```

## Main Concepts

- `Production Graph`: system of record for project, references, story, sequences, scenes, beats, shots, renders, inspection reports, repairs, and deliverables.
- `Reference Binder`: classifies assets as identity, product, environment, motion, camera, audio tempo, style, first frame, last frame, or source-video structure.
- `Prompt Compiler`: turns shot contracts into Seedance-ready prompts and provider-neutral render requests.
- `Consistency Guardian`: checks identity, product, environment, motion, transition, audio, cross-modal sync, and delivery quality.
- `Model Provider Abstraction`: keeps Atlas Cloud-specific request details out of business logic.

## Source-Inspired Design

- Emily2040/seedance-2.0: intent-first Seedance workflow, reference roles, professional shot/QC handoff.
- YouMind-OpenLab/awesome-seedance-2-prompts: prompt structure patterns only, not copied prompt content.
- HKUDS/ViMax: multi-agent long-form planning, storyboard, reference selection, consistency validation.
- VibeFrame: deterministic artifacts, dry runs, cost gates, build/review reports, repair loop.
- DirectorBench: checkpoint-level long-form diagnosis across script, visual, audio, cross-modal, stability.
- HKUDS/VideoAgent: video understanding, intent decomposition, graph-powered tool planning.
- OpenMontage: reference-video analysis, approval gates, provider scoring, real-footage path, self-review.
- Atlas Cloud: default API gateway, OpenAI-compatible LLM endpoint, async media generation, Seedance 2.0 Universal Reference, Asset Library.

## Detailed Docs Map

- `docs/ARCHITECTURE_SPEC.md`: full system architecture and agent responsibilities.
- `docs/CREDITS.md`: attribution, license cautions, and source boundaries.
- `docs/PROMPT_COMPILER_DESIGN.md`: adaptive niche prompt compiler.
- `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`: 2 to 8 minute graph strategy.
- `docs/CONSISTENCY_GUARDIAN_DESIGN.md`: QA, inspection, and repair system.
- `docs/MODEL_PROVIDER_ABSTRACTION.md`: Atlas default and future provider contracts.
- `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`: user settings for tier, resolution, quality, ratio, audio.

## Current Repo State

The repo contains architecture/design documentation plus a production TypeScript implementation scaffold for the first commercial pipeline. The implementation is original CineJelly code inspired by the credited sources; it does not clone upstream repository code or bundled public prompt corpora.

Current production folders:

- `src/agents`
- `src/core`
- `src/prompt_compiler`
- `src/providers`
- `src/config`
- `src/utils`
- `src/types`
- `data`
- `external`
- `schemas`
- `config`
- `ops`

Implementation status:

- `docs/` contains the architecture and design source of truth.
- `src/providers` implements provider-neutral contracts, an Atlas Cloud default provider, robust structured LLM JSON parsing, async polling, Asset Library operations, error normalization, configurable Seedance capabilities, and cost ledger tracking.
- `src/prompt_compiler` implements the Seedance prompt compiler, role-based reference binding, negative constraints, and repair hints.
- `src/core` implements Production Graph building, Production Graph run evidence recording for selected/rejected/repair render candidates, clip inspections, deliverables, configurable render cost gating with quality-mode candidate and repair multipliers, smart chunking, shot planning, continuity ledger generation for Character/Style bibles, Consistency Guardian preflight, FFmpeg assembly, smooth transition assembly, FFprobe inspection, frame sampling, postproduction polish, captions, audio mix automation, semantic visual inspection through the configured Atlas LLM provider, and deterministic project artifact persistence.
- `src/agents` and `src/application` wire intake, normalized story architecture with non-empty scene/beat planning, continuity-ledger-backed batch Consistency Guardian preflight gating before render spend, render-time Asset Library reference resolution for video/audio references, Economy/Standard/High/Ultimate candidate rendering with Guardian-based candidate selection, targeted repair-only rerendering before delivery, render gate blocking before assembly, director orchestration, runtime factory, and deployment preflight.
- `src/api/server.ts` exposes `/health`, `/v1/preflight`, and `/v1/render`.
- `src/config` loads secret-safe Atlas Cloud runtime configuration from environment variables.
- `src/types` defines the provider, production, prompt, graph, guardian, assembly, media, caption, audio, transition, visual-inspection, agent, and runtime-preflight contracts.

Current blockers before real customer rendering:

- Real Atlas Cloud credentials and verified model IDs must be provided through environment variables.
- FFmpeg and FFprobe must be installed on the deployment host for assembly, inspection, captions, audio mix, postproduction, and frame sampling.
- A real end-to-end Atlas render validation must be run against paid provider credentials before enabling customers.

## How To Interpret This Context

This file is a compact memory layer for token-efficient work. It helps an agent quickly understand the product direction, repo structure, and source boundaries. It does not replace the detailed specs, and it does not mean CineJelly has already implemented or copied every upstream function.

For accurate work:

1. Read this file first.
2. Read only the detailed spec relevant to the change.
3. Re-open upstream sources only when changing provider claims, source-derived behavior, license-sensitive features, or long-form architecture assumptions.

## Source Fidelity And No-Copy Boundary

CineJelly should be source-faithful, not source-copied.

Source-faithful means:

- design decisions are traceable to credited repos/articles
- source-inspired patterns are named and attributed
- provider claims are checked against current Atlas Cloud docs/schema when they affect runtime behavior
- long-form quality logic follows the ideas from ViMax, VibeFrame, DirectorBench, VideoAgent, OpenMontage, Emily2040/seedance-2.0, and Atlas Cloud without pretending those systems are already fully cloned

Not allowed:

- copying entire upstream repos into this project
- copying public prompt corpora as bundled product content
- copying AGPL OpenMontage implementation code into proprietary code without legal approval
- claiming 100% feature parity before implementation and verification
- using upstream names to imply endorsement

If the product needs 100% behavior parity with a source repo, create a dedicated implementation plan that maps each upstream capability to a CineJelly production feature, license status, provider dependency, acceptance criteria, and verification method.
