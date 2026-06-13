# Credits and Source Attribution

## Purpose

This document records the public projects, papers, and articles used to design and build CineJelly Seedance Ultimate Director. It is also the attribution boundary for Git Subtree snapshots, copied documentation, adapted structures, prompt-pattern snapshots, and reusable logic that are integrated into the product. Public prompt examples, repo text, and article content may be copied or adapted when the license allows the intended use, attribution is preserved, and the usage has been reviewed.

Các thành phần được snapshot từ repo gốc sẽ được ghi nhận nguồn và phát triển thành sản phẩm riêng của CineJelly.

## Current Repository Review

- Repository reviewed: `TechRate2/cinejelly-seedance-ultimate-director`
- Result: the current repository contains production TypeScript source, design documentation, and upstream Git Subtree snapshots under `external/upstream/`.
- Current Git Subtree snapshots are stored under `external/upstream/`; see `docs/SUBTREE_POLICY.md` for the workflow and `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` for local paths, license evidence, and reuse boundaries.

## Primary Architecture References

### Emily2040/seedance-2.0

- URL: https://github.com/Emily2040/seedance-2.0
- Local snapshot: `external/upstream/seedance-2.0`
- License shown in repo: MIT.
- Used for: intent-first Seedance workflow, role-based reference mapping, prompt routing, professional filmmaker artifacts, safety/copyright rewrites, troubleshooting levers, delivery/QC thinking, dated source claims.
- Source-derived patterns adopted:
  - Direct the model rather than micromanage frames.
  - Route vague ideas through a brief/interview step.
  - Separate references by identity, environment, motion, camera rhythm, audio tempo, style, or endpoint.
  - Produce the production object before a prompt for film/client/campaign work.
  - Keep model/provider claims source-dated.
- CineJelly extension:
  - Adds a typed Production Graph and Consistency Guardian around the Seedance Skill OS idea.

### YouMind-OpenLab/awesome-seedance-2-prompts

- URL: https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts
- Local snapshot: `external/upstream/awesome-seedance-2-prompts`
- License shown in repo: CC BY 4.0 license file and README attribution guidance; repository includes community prompt material.
- Used for: prompt pattern mining, reusable prompt anatomy, attribution-reviewed example structures, and curated prompt-pattern snapshots.
- Source-derived patterns adopted:
  - High-performing prompts often include time ranges, shot numbers, camera movements, identity consistency constraints, character micro-expression, environment, audio, dialogue, sound effects, and negative quality constraints.
  - Seedance 2.0 is described as supporting text, image, video, and audio inputs, up to 1080p, and 4 to 15 second clip duration.
- Reuse requirements:
  - Copied community prompt text requires CC BY attribution and product review before it is bundled into product docs, data, UI, or generated customer-facing examples.
  - Generalized structural patterns can be adapted into the Prompt Compiler and `data/` knowledge artifacts with source attribution.
- CineJelly extension:
  - Converts mined prompt patterns into an adaptive Prompt Compiler that avoids hardcoded niche templates.

### HKUDS/ViMax

- URL: https://github.com/HKUDS/ViMax
- Local snapshot: `external/upstream/vimax`
- License shown in repo listing: MIT.
- Used for: multi-agent long-form video architecture.
- Source-derived patterns adopted:
  - Multi-agent director/screenwriter/producer/video-generator workflow.
  - RAG-based long script generation and segmentation.
  - Shot-level storyboard design.
  - Multi-camera filming simulation.
  - Intelligent reference image selection based on previous timeline context.
  - Parallel candidate generation and VLM/MLLM consistency checking.
  - High-efficiency parallel shot generation where dependency constraints allow it.
- CineJelly extension:
  - Reframes these patterns into a provider-agnostic Production Graph with Atlas Cloud Seedance 2.0 as the default render provider.
  - Uses scene/keyframe guidance as one influence for source-video auto-analysis and downstream reference selection, implemented as CineJelly-owned TypeScript.

### vericontext/vibeframe

- URL: https://github.com/vericontext/vibeframe
- Local snapshot: `external/upstream/vibeframe`
- License shown in repo: MIT.
- Used for: CLI-first, deterministic artifact, cost, report, and repair patterns.
- Source-derived patterns adopted:
  - Brief-to-video workflow through storyboard/design artifacts.
  - JSON output, dry runs, cost gates, build reports, review reports.
  - Separate lanes for full build, standalone asset generation, and edit/remix.
  - Deterministic repair commands and inspect-render loop.
  - Deterministic validation/report discipline for readiness and release review.
- CineJelly extension:
  - Uses VibeFrame-style artifact discipline inside a commercial API-first service rather than a CLI-only runtime.
  - Adds API-visible artifact validation evidence for synchronous render responses and retained async job artifacts without exposing server-local artifact paths.
  - Adds redacted CLI and HTTP Phase 6 validation readiness reporting before paid provider work.
  - Extends preflight discipline into configurable FFmpeg/FFprobe command resolution so portable deployment binaries can be validated before paid work.
  - Extends deterministic incomplete-stage evidence to generated-audio intent planning so requested narration, BGM, ambience, or SFX are visible as planned-only review evidence until provider-backed audio generation exists.
  - Extends validation/cost/report discipline into a generated-audio provider contract boundary that fails safely before spend when no verified audio capability is configured.
  - Extends validation-before-spend discipline into a generated-audio execution planner that records ready and blocked intent counts before provider calls.
  - Extends validation-before-release discipline into generated-audio output validation so provider results must pass safe URL, duration, and identity checks before mixing.
  - Extends artifact-resolution discipline into generated-audio asset resolution so reviewed `asset://` outputs must map to credential-free HTTPS before mixing.
  - Extends preflight/report discipline into a generated-audio asset resolution catalog so operator-owned resolver entries are validated before customer traffic.

### DirectorBench

- URL: https://arxiv.org/html/2605.30090v1
- Code/data snapshot: `external/upstream/directorbench` from https://github.com/jiaminchen-1031/DirectorBench
- License shown in local snapshot: no top-level license file found; use the snapshot for evaluation dimensions and planning notes until permission or a compatible reuse path is clarified.
- Used for: long-form quality diagnosis.
- Source-derived patterns adopted:
  - Evaluate long-form video across script, visual, audio, cross-modal, and stability dimensions.
  - Use structured metadata, user profiles, dynamic checkpoint activation, tool-based evidence, confidence-aware aggregation, and profile-weighted scoring.
  - Report checkpoint-level bottlenecks rather than only an aggregate score.
  - Pay special attention to transition quality because the paper reports transition quality as a key bottleneck across workflows.
- CineJelly extension:
  - Converts DirectorBench's evaluation philosophy into runtime Consistency Guardian inspections and repair routing.

### HKUDS/VideoAgent

- URL: https://github.com/HKUDS/VideoAgent
- Local snapshot: `external/upstream/videoagent`
- License shown in repo: MIT at the top level; nested tool folders include additional licenses that require separate review before reuse.
- Used for: video understanding, editing, remaking, and intent-to-tool workflow planning.
- Source-derived patterns adopted:
  - Analyze both explicit and implicit user sub-intents.
  - Use graph-powered workflow generation.
  - Use multimodal understanding to transform raw video into semantically aligned retrieval queries.
  - Support video understanding, editing, and remaking in one agentic framework.
- CineJelly extension:
  - Adds source-video deconstruction to the CineJelly intake path so a user can provide a long reference video and ask for an original production with similar pacing, structure, or style.
  - Adds an opt-in Source Video Auto Analysis Adapter that samples bounded frames from clean HTTPS source-video references and normalizes the configured Atlas LLM output through CineJelly's `SourceVideoAnalyst`.

### OpenMontage

- URL: https://github.com/calesthio/OpenMontage
- Local snapshot: `external/upstream/openmontage`
- License shown in repo: GNU AGPLv3.
- Used for: commercial-grade production orchestration ideas.
- Source-derived patterns adopted:
  - Agent handles research, scripting, asset generation, editing, and final composition.
  - Reference-video path analyzes transcript, pacing, scenes, keyframes, and style.
  - Produces concepts, cost estimates, and sample paths before full production.
  - Uses approval gates, provider scoring, and self-review.
  - Self-review can include ffprobe validation, frame sampling, audio level analysis, delivery promise verification, and subtitle checks.
  - Supports real-footage retrieval paths when appropriate instead of treating every video as animated stills.
- License caution:
  - Because OpenMontage uses AGPLv3, CineJelly may snapshot, study, and adapt architecture, documentation, and workflow patterns with attribution. Direct implementation reuse in a distributed or proprietary product must follow AGPL obligations or a legal review decision.
- CineJelly extension:
  - Adapts approval, costing, reference analysis, and QA ideas into CineJelly-owned production modules while preserving the OpenMontage attribution trail.
  - Uses source-media review, media self-review, and approval-gate ideas as AGPL-aware behavior notes for source-video auto-analysis guardrails and media-tool readiness; OpenMontage implementation code is not copied, linked, or executed.
  - Uses approval/self-review concepts as AGPL-aware behavior notes for generated-audio planning boundaries; no OpenMontage implementation code is copied, linked, imported, or executed for this feature.
  - Uses provider-menu, music-plan, and sample-before-batch concepts as AGPL-aware behavior notes for the generated-audio provider contract; implementation remains CineJelly-owned TypeScript.
  - Uses provider-preference and approval concepts as AGPL-aware behavior notes for generated-audio execution planning; no OpenMontage runtime code is copied, linked, imported, or executed.
  - Uses media-review and sample-before-batch concepts as AGPL-aware behavior notes for generated-audio output validation; implementation remains CineJelly-owned TypeScript.
  - Uses approval and media-review concepts as AGPL-aware behavior notes for generated-audio asset resolution; OpenMontage implementation code is not copied, linked, imported, or executed.
  - Uses approval concepts as AGPL-aware behavior notes for generated-audio asset resolution catalog preflight; OpenMontage implementation code is not copied, linked, imported, or executed.

### MoneyPrinterTurbo

- URL: https://github.com/harry0703/MoneyPrinterTurbo
- Local snapshot: `external/upstream/moneyprinterturbo`
- License shown in repo: MIT.
- Used for: end-to-end one-input video pipeline, material sourcing, batch generation, subtitles, TTS, background music, API/CLI/WebUI surfaces, Docker deployment patterns, task queue/progress handling, and stage-specific execution.
- Source-derived patterns adopted:
  - Generate script and search terms before selecting materials.
  - Support local materials and remote stock material sources such as Pexels, Pixabay, and Coverr with aspect/duration filtering.
  - Treat audio, subtitles, material gathering, composition, and final export as explicit pipeline stages.
  - Support batch output generation so one request can produce multiple candidate videos.
  - Expose task state, progress, and generated artifacts through an API.
  - Keep terminal failure/progress evidence visible for long-running generation work; CineJelly translates this into provider ledger and review packet evidence.
  - Use CLI/WebUI/Docker/operator surfaces to make the pipeline runnable by different user types.
- CineJelly extension:
  - Reworks these short-video automation patterns into a commercial Seedance 2.0 director pipeline with Atlas Cloud as the default LLM/render provider, Production Graph lineage, long-form chunking, consistency repair, governed material/reference sourcing, an operator-owned local material catalog adapter, and review packets.
  - Adds bounded async render-job stage progress telemetry so operators can see current stage and retained progress events before final artifacts exist.
  - Adds API-visible artifact validation status and checks for synchronous render responses and terminal async jobs so generated evidence stays reviewable through the API surface.
  - Adds pre-paid CLI and HTTP validation readiness reporting so blocked environment/tool state remains operator-visible before long-running Atlas work starts.
  - Adds configurable FFmpeg/FFprobe command resolution for preflight and runtime media engines so deployments can use portable binaries without global PATH changes.
  - Adds a deterministic postproduction asset plan for supplied captions and audio tracks so subtitle/audio/BGM decisions are visible in artifacts, review packets, and validation before assembly; provider-backed TTS/BGM execution remains disabled until verified provider wiring and live validation exist.
  - Adds bounded generated-audio intent planning for narration, BGM, ambience, and SFX so MoneyPrinterTurbo-style voice/BGM stage inputs become CineJelly-owned planned-only evidence, admission controls, review-packet fields, stage lifecycle fields, and artifact-validation checks before any provider-backed generation module is built.
  - Adds a generated-audio execution planner that maps bounded intents to provider-neutral requests only when verified capabilities exist, preserving blocked provider/kind/duration/output-format evidence without provider spend.
  - Adds generated-audio output validation so prepared provider results must be matched to the original intent and pass duration plus credential-free URL checks before becoming audio mix tracks.
  - Adds generated-audio asset resolution so approved `asset://` generated-audio outputs can become mix tracks only after clean HTTPS mapping, identity binding, and approval checks pass.
  - Adds generated-audio asset resolution catalog preflight so operator-owned `asset://` to HTTPS mappings are validated before runtime use.
  - Adds provider-neutral generated-audio capability/request/result contracts inspired by MoneyPrinterTurbo's explicit audio stage and `/audio` stop-at behavior, while keeping actual provider execution disabled until verified schemas and paid validation exist.
  - Remote stock source integrations are rewritten as opt-in CineJelly-owned adapters for Pexels, Pixabay, and commercially approved Coverr, with provider-specific licensing, attribution, credential handling, and validation required before release.

## Atlas Cloud References

### Atlas Cloud Docs Overview

- URL: https://www.atlascloud.ai/docs/en
- Used for: Atlas Cloud positioning as one API key, one endpoint, one billing account for 300+ models across LLM, image, video, audio, and media processing.

### Atlas Cloud LLM / Chat Docs

- URL: https://www.atlascloud.ai/docs/en/models/llm
- Used for:
  - OpenAI-compatible ChatCompletion format.
  - Base URL: `https://api.atlascloud.ai/v1`.
  - Streaming and non-streaming support.
  - Model selection guidance for DeepSeek, Qwen, Kimi, GLM, MiniMax, and Doubao families.

### Atlas Cloud Developer Page

- URL: https://www.atlascloud.ai/developer
- Used for:
  - One OpenAI-compatible API across LLM, image, video, and audio.
  - Model string swapping without changing most code.
  - Async image/video prediction model.
  - MCP and agent integration notes.

### Atlas Cloud CLI Docs

- URL: https://www.atlascloud.ai/docs/en/cli
- Used for:
  - Model schema inspection through `atlas models get`.
  - Async video generation and polling patterns.
  - First-class flags such as image, images, end image, video, audio, resolution, size, and duration.
  - Known model ID examples including `bytedance/seedance-2.0-fast/image-to-video`.

### Atlas Cloud Seedance 2.0 Model Page

- URL: https://www.atlascloud.ai/models/seedance2
- Used for:
  - Seedance 2.0 multimodal video generation.
  - Universal Reference concept.
  - Text-to-video, image-to-video, reference-to-video, and fast variants.
  - Mixed image/video/audio reference inputs.
  - 4 to 15 second output duration.
  - 480p and 720p listed in model comparison, and 1080p referenced in model family and examples.
  - Aspect ratios including 21:9, 16:9, 4:3, 1:1, 3:4, and 9:16.
  - Audio-visual synchronization and beat matching claims.

### Atlas Cloud Asset Library for Seedance 2.0

- URL: https://www.atlascloud.ai/blog/guides/atlas-cloud-asset-library-seedance-2-0
- Used for:
  - Register, poll until Active, then reference asset IDs in generation.
  - Video and audio references must be registered before generation.
  - Images may be passed inline.
  - Asset Library host and generation host differ.
  - Input validation happens at registration.
  - Video asset requirements include mp4/mov, 480p or 720p, 2 to 15 seconds, 24 to 60 FPS, and file size limits.
  - Audio asset requirements include wav/mp3, 2 to 15 seconds, and file size limits.

### Atlas Cloud Seedance All-Round Reference Guide

- URL: https://www.atlascloud.ai/blog/case-studies/generative-ai-model-seedance-2-0-a-guide-to-all-round-reference
- Used for:
  - Reference Cluster concept.
  - Identity Locking plus Motion Transfer.
  - Binding Logic and @-tag syntax.
  - Identity vs motion weighting guidance.
  - Prompt implementation using @Image, @Video, and @Audio roles.
  - 4-second test-take iteration before committing to full 15-second clips.
  - Troubleshooting causes such as contradictory prompts, weak reference images, overcrowded prompts, and mismatched motion references.

### Atlas Cloud Character Consistency Article

- URL: https://www.atlascloud.ai/blog/guides/how-character-consistency-in-ai-video-apis-is-revolutionizing-episodic-content
- Used for:
  - Master Identity and Identity Anchor concept.
  - Unified API orchestration for model swapping while maintaining one codebase.
  - Atlas Cloud image-to-video request example fields: model, prompt, image, last image, duration, resolution, ratio, generate audio, watermark, and return last frame.
  - Async generation and polling example.
  - Post-generation refinement options such as temporal smoothing, upscaling, and audio-visual sync checks.

## Other Frameworks Worth Monitoring

These were discovered during source review and are not primary sources for this first design:

- LTX Studio: mentioned in Atlas Cloud's consistency article as focused on cinematic scene-to-scene character locking. It may be worth comparing for UI/UX and scene consistency workflows.
- VBench: https://vchitect.github.io/VBench-project/ - useful for visual quality dimensions such as subject consistency, motion smoothness, temporal flicker, and spatial relationship. It is a benchmark, not a production agent framework.
- AgentVidBench: https://github.com/krafton-ai/agentvidbench - focused on multi-hop video question answering, useful for video understanding evaluation rather than production.

## Attribution Policy for CineJelly

- Cite public repos and articles in internal architecture docs.
- Use Git Subtree snapshots under `external/upstream/` as the durable source trail for copied/adapted components.
- Copy or adapt documentation, patterns, structures, data, and compatible code into `docs/`, `data/`, or `src/` when the license permits the intended commercial product use.
- Code moved into `src/` must become CineJelly-owned implementation: new or substantially adapted product code, not unchanged large upstream files.
- Production code must not import directly from `external/upstream/`.
- Behavior-critical logic should use the Faithful Logic Translation process: source analysis, non-production Reference Implementation, fidelity review, CineJelly-owned rewrite, integration, and validation.
- Public prompt examples used as bundled product content require license review, attribution, and a clear reason to include exact text rather than a distilled pattern.
- AGPL implementation reuse from OpenMontage requires acceptance of the AGPL obligations, legal approval, or a product decision to reimplement the pattern in CineJelly-owned code.
- Do not claim exact model IDs, pricing, or limits unless they are verified against the current Atlas Cloud schema or a dated provider source.
- Store source URLs and last-checked dates in future production config or provider metadata.
- Record copied/adapted component origin, local snapshot path, and CineJelly extension in the relevant design doc, source comment, or release note.
