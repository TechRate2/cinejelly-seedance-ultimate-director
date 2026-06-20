# Upstream Context Routing

## Purpose

Use this file when an engineer or coding agent needs upstream snapshot context without loading the whole `external/upstream/` tree. The snapshots are source material, not runtime dependencies. Production work should read the smallest relevant upstream slice, translate behavior into CineJelly-owned `src/`, and keep attribution in the source-logic ledger.

Default rule: do not run broad reads over `external/upstream/`. Use `rg` scoped to one snapshot path and one behavior area.

## Current Build Order

1. Finish long-form commercial-core backend evidence first.
2. Then finish short-form commercial-core backend evidence.
3. Build the first-party Topview-style UI only after the backend has enough real render, review, billing/quota, artifact, and deployment evidence to support a sellable MVP.

Long-form comes first because it is the core CineJelly product promise: one input to a controlled, high-quality 2-8 minute video workflow. Short-form already has a no-spend backend foundation, but it still needs live media evidence and UI later.

## Baseline Files Before Upstream

Always start with these local files before opening upstream code:

1. `docs/PROJECT_CONTEXT.md`
2. One focused design doc:
   - long-form: `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`
   - short-form: `docs/SHORT_PIPELINE_AGENTIC_DESIGN.md`
   - source policy: `docs/SUBTREE_POLICY.md`
   - roadmap gaps: `docs/IMPLEMENTATION_ROADMAP.md`
   - parity reality: `docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md`
3. `src/core/source-logic-translation-records.ts` for the exact upstream paths already tied to the behavior.
4. A focused `docs/reference-implementations/*.md` file when one exists.

Only then open upstream files, and only from the relevant route below.

## Long-Form Routes

### Planning, Storyboard, Reference Selection

Use for Production Graph, sequences, scenes, beats, shots, reference binding, continuity, and deterministic long-form planning.

Read first:

- `external/upstream/vimax/agents/scene_extractor.py`
- `external/upstream/vimax/agents/storyboard_artist.py`
- `external/upstream/vimax/agents/reference_image_selector.py`
- `external/upstream/vimax/pipelines/script2video_pipeline.py`
- `external/upstream/vimax/pipelines/novel2movie_pipeline.py`
- `external/upstream/vimax/agent_runtime/session_index.py`
- `external/upstream/vimax/prompts/workflow.md`

Usually do not read:

- `external/upstream/vimax/ui/`
- `external/upstream/vimax/tests/`
- unrelated provider adapter tests unless changing provider behavior.

### Deterministic Build, Timeline, Review, Repair

Use for validate-before-spend, artifact reports, deterministic plan/build outputs, timeline/render inspection, and repair loops.

Read first:

- `external/upstream/vibeframe/README.md`
- `external/upstream/vibeframe/ROADMAP.md`
- `external/upstream/vibeframe/packages/cli/src/commands/_shared/build-plan.ts`
- `external/upstream/vibeframe/packages/cli/src/commands/_shared/storyboard-parse.ts`
- `external/upstream/vibeframe/packages/cli/src/commands/_shared/review-report.ts`
- `external/upstream/vibeframe/packages/cli/src/commands/timeline.ts`
- `external/upstream/vibeframe/packages/cli/src/commands/_shared/render-inspect.ts`

Usually do not read:

- VibeFrame provider adapters unless the task changes provider routing.
- VibeFrame tests/fixtures unless reproducing a specific edge case.

### Stage Progress, Materials, Captions, Audio, Batch Output

Use for MoneyPrinterTurbo-style one-input staged task progress, material sourcing, subtitles, TTS/BGM/SFX, and output batch lifecycle.

Read first:

- `external/upstream/moneyprinterturbo/app/services/task.py`
- `external/upstream/moneyprinterturbo/app/services/state.py`
- `external/upstream/moneyprinterturbo/app/services/material.py`
- `external/upstream/moneyprinterturbo/app/services/subtitle.py`
- `external/upstream/moneyprinterturbo/app/services/voice.py`
- `external/upstream/moneyprinterturbo/app/services/video.py`
- `external/upstream/moneyprinterturbo/app/models/schema.py`
- `external/upstream/moneyprinterturbo/app/controllers/v1/video.py`

Usually do not read:

- `external/upstream/moneyprinterturbo/docs/*.jpg`
- `external/upstream/moneyprinterturbo/test/resources/`
- `external/upstream/moneyprinterturbo/webui/` unless implementing first-party UI or task-monitor UX.

### Source-Video Understanding

Use for live source-video analysis, transcript/scene/keyframe/pacing normalization, and graph-powered retrieval patterns.

Read first:

- `external/upstream/videoagent/README.md`
- `external/upstream/videoagent/videoagent`
- `external/upstream/videoagent/tools/videorag/base.py`
- `external/upstream/videoagent/tools/videorag/videoragcontent.py`
- `external/upstream/videoagent/tools/videorag/_videoutil/split.py`
- `external/upstream/videoagent/tools/videorag/_videoutil/caption.py`

Usually do not read:

- `external/upstream/videoagent/tools/seed-vc/`
- `external/upstream/videoagent/tools/DiffSinger/`
- `external/upstream/videoagent/tools/CosyVoice/`
- `external/upstream/videoagent/tools/ImageBind/`
- nested speech/music model source trees unless the task is explicitly about those local model integrations.

### Quality Benchmark And Manual Review Evidence

Use for DirectorBench-style scoring dimensions and accepted review evidence, not for direct code reuse.

Read first:

- `external/upstream/directorbench/README.md`
- `external/upstream/directorbench/directorbench/schemas.py`
- `external/upstream/directorbench/directorbench/report.py`
- `external/upstream/directorbench/data/README.md`

Because DirectorBench has no top-level license in the snapshot, use high-level evaluation structure and original CineJelly implementation decisions only.

## Short-Form Routes

### Agentic Chat, Tool Orchestration, Progress

Use for Topview-simple/Director-style natural-language media workflow, session state, agent routing, typed content payloads, and progress evidence.

Read first:

- `external/upstream/director/README.md`
- `external/upstream/director/backend/director/core/reasoning.py`
- `external/upstream/director/backend/director/core/session.py`
- `external/upstream/director/backend/director/agents/base.py`
- `external/upstream/director/backend/director/agents/text_to_movie.py`
- `external/upstream/director/backend/director/agents/video_generation.py`
- `external/upstream/director/backend/director/agents/audio_generation.py`
- `external/upstream/director/frontend/README.md` only when building UI behavior.

Usually do not read:

- Full frontend source unless implementing UI.
- Database docs unless implementing media library/workspace storage parity.

### Short Pipeline Templates, Approval, Real-Footage Path

Use for dynamic short-form workflows, approval gates, real-footage/source-media review, and provider-scored material choices.

Read first:

- `external/upstream/openmontage/README.md`
- `external/upstream/openmontage/PROJECT_CONTEXT.md`
- `external/upstream/openmontage/skills/creative/short-form.md`
- `external/upstream/openmontage/skills/creative/broll-planning.md`
- `external/upstream/openmontage/skills/creative/video-understand-usage.md`
- `external/upstream/openmontage/skills/meta/checkpoint-protocol.md`
- `external/upstream/openmontage/skills/pipelines/clip-factory/`
- `external/upstream/openmontage/skills/pipelines/cinematic/`

OpenMontage is AGPL. Unless the product accepts AGPL obligations or legal review approves direct reuse, treat it as behavior-note input and rewrite CineJelly-owned TypeScript.

### Prompt Grammar And Seedance Controls

Use for prompt anatomy, reference roles, timing, camera, motion, negative constraints, and Seedance-specific quality language.

Read first:

- `external/upstream/seedance-2.0/references/reference-workflow.md`
- `external/upstream/seedance-2.0/references/intent-vs-precision.md`
- `external/upstream/seedance-2.0/references/shot-list-continuity.md`
- `external/upstream/seedance-2.0/references/multishot-grammar.md`
- `external/upstream/seedance-2.0/references/cinematography-shot-language.md`
- `external/upstream/seedance-2.0/references/audio-post-delivery.md`
- `external/upstream/awesome-seedance-2-prompts/README.md`

Usually do not read:

- every localized README or vocabulary file unless the task is localization.
- full prompt examples unless attribution/product review is part of the task.

## What To Avoid Loading By Default

Avoid broad reads of:

- `.git/`
- `node_modules/`
- `dist/`
- `assets/output_deliverables/`
- `external/upstream/**/tests`
- `external/upstream/**/__tests__`
- `external/upstream/**/fixtures`
- `external/upstream/**/docs/*.jpg`
- nested third-party model/tool folders under VideoAgent unless the feature explicitly targets those engines.

These files may be useful for a targeted investigation, but they are not normal context for long/short backend work.

## Search Patterns

Prefer targeted commands:

```powershell
rg -n "logicName: \"Long-Form" src/core/source-logic-translation-records.ts
rg -n "Director Agentic Media Reasoning" src/core/source-logic-translation-records.ts docs/SHORT_PIPELINE_AGENTIC_DESIGN.md
rg -n "scene|storyboard|reference" external/upstream/vimax/agents external/upstream/vimax/pipelines
rg -n "review|timeline|render inspect" external/upstream/vibeframe/packages/cli/src/commands
```

Avoid:

```powershell
rg -n "video" external/upstream
Get-ChildItem external/upstream -Recurse
```

The broad forms are acceptable only for snapshot inventory refreshes or license audits.

## Completion Evidence Priority

Long-form is not complete until evidence exists for:

- a paid 2-8 minute Atlas render validation report,
- artifact validation pass,
- final duration inside 120-480 seconds,
- cost/quota/billing controls,
- manual quality/redaction review accepted,
- source-video/generated-audio/remote-stock live evidence when those features are included in the sellable offer,
- deployment and production-ops evidence.

Short-form is not complete until evidence exists for:

- live product URL or prompt-to-short paid media workflow,
- accepted scene/audio/caption/claim review,
- artifact validation pass,
- render handoff through normal async job gates,
- session/workspace persistence appropriate for the sellable offer,
- product-media rights review,
- first-party UI or an explicitly API-only product decision.
