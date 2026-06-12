# External Source Snapshots Inventory and Integration Policy

## Purpose

This document provides the authoritative inventory of Git Subtree snapshots under `external/upstream/` and the explicit policy for snapshotting, reviewing, and integrating patterns, structures, logic, and workflows from the original upstream repositories into CineJelly Seedance Ultimate Director.

We are explicitly permitted and encouraged to snapshot the upstream repositories using Git Subtree with `--squash`, review their content, and integrate, adapt, and improve the useful patterns, structures, and logic into our own autonomous CineJelly-owned implementation.

## Core Integration Policy

1. **Subtree**: Bring the original repo into `external/upstream/<name>` using `git subtree add --prefix=external/upstream/<name> <url> <branch> --squash`, or `git subtree pull` with `--squash` to refresh.
2. **Snapshot**: Preserve the upstream repository as read-only source material with a clean squashed history boundary.
3. **Review**: Examine license, structure, prompt patterns, agent workflows, graph designs, provider logic, quality gates, long-form strategies, error handling, and cost handling.
4. **Adapt + Improve**: Extract the useful essence, not whole files. Redesign it to fit CineJelly contracts such as Production Graph, Provider Abstraction, Prompt Compiler rules, Guardian checkpoints, flexible settings, and 2-8 minute long-form control.
5. **Faithful Logic Translation**: For behavior-critical logic, create a non-production Reference Implementation before production work. See `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`.
6. **Write New Code**: Implement as clean, production-grade TypeScript in `src/`. This must be original CineJelly work: new or substantially adapted implementation that combines and improves upon snapshotted ideas.
7. **Attribute**: Record origin, local snapshot path, license, preserved behavior, changed behavior, and CineJelly extension in `docs/CREDITS.md`, this file, focused design docs, or source comments.
8. **Enforce**: Production code must never import directly from `external/upstream/`. All runtime behavior lives in owned `src/` modules.

Result: the final product is a self-reliant commercial system that is stronger than any single upstream repository, with Atlas Cloud as default, full support for flexible settings, long videos, and professional delivery artifacts.

## Pattern Extraction vs Faithful Logic Translation

Pattern Extraction is enough when CineJelly is borrowing a broad product idea: a source folder shape, an agent role, a review artifact, or a general workflow lane.

Faithful Logic Translation is required when CineJelly wants upstream-like behavior. If the order, weight, fallback, duplicate handling, edge case, or repair decision changes the result, create a Reference Implementation before production code. Practical examples live in `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`:

- Reference Binding + Prompt Ordering from Emily2040/seedance-2.0 plus YouMind-OpenLab/awesome-seedance-2-prompts.
- Repair Strategy + Consistency Checkpoint from ViMax plus VibeFrame.

## Snapshot Inventory

| Local path | Upstream repo | License | Key patterns or logic after review | CineJelly extension and status |
| --- | --- | --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | MIT | Intent-first workflow, role-based references, professional shot/QC handoff, direct-the-model philosophy. | Production Graph, Consistency Guardian, typed lineage, targeted repair, and prompt handoff discipline. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | CC BY 4.0 | Structured prompt anatomy: time-bounded shots, consistency constraints, camera/motion/audio/negative constraints. | Adaptive Prompt Compiler without hardcoded niches; generalized prompt anatomy and repair hints with attribution review. |
| `external/upstream/vimax` | `HKUDS/ViMax` | MIT | Multi-agent long-form planning, RAG segmentation, storyboard, parallel candidates, consistency selection. | Provider-agnostic Production Graph, smart chunking, long-form continuity, and candidate evidence. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | MIT | Deterministic artifacts, dry runs, cost gates, build/review reports, repair loops. | API-first service with `review-packet.json`, cost ledger, preflight, redaction, and HTTP lifecycle. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | MIT top level; nested review required | Intent decomposition, graph-powered planning, multimodal video understanding. | Source Video Analyst for bounded reference-video deconstruction guidance and graph lineage. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | AGPL-3.0 | Reference-video analysis, approval gates, provider scoring, real-footage path, self-review. | Consistency Guardian and Delivery Gate ideas adapted through AGPL-aware behavior notes unless legal approval allows direct reuse. |
| `external/upstream/moneyprinterturbo` | `harry0703/MoneyPrinterTurbo` | MIT | Staged pipeline, material sourcing, batch outputs, task progress, subtitles, TTS, BGM, API/CLI/WebUI operations. | Governed material planner, batch evidence in graph, Atlas-first rendering, and long-form continuity instead of short-video-only automation. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | No top-level license found in snapshot | Checkpoint-level diagnosis across script, visual, audio, cross-modal, stability, and transition quality. | Evaluation and planning influence only until permission or a compatible reuse path is clarified. |

## Atlas Cloud Integration

Atlas Cloud docs and API guides are the default provider source. Its async prediction model, Universal Reference, Asset Library, and Seedance 2.0 capability surface are integrated through the Model Provider Abstraction Layer. Provider claims that affect runtime behavior must be checked against current Atlas Cloud docs or schema before implementation.

## Faithful Logic Translation Targets

Use this table to decide which source behaviors should receive a Reference Implementation before new production code is written.

| Snapshot | High-value logic to translate | Notes |
| --- | --- | --- |
| `seedance-2.0` | Reference role handling, prompt handoff order, professional QC workflow, troubleshooting decision flow. | MIT-compatible. Translate into Prompt Compiler, Reference Binder, and Guardian behavior with attribution. |
| `awesome-seedance-2-prompts` | Prompt anatomy, timing language, negative constraints, cinematic weighting, subject/environment/camera ordering. | CC BY 4.0. Attribute exact text; translate generalized structures into CineJelly prompt contracts. |
| `vimax` | Long-form segmentation, storyboard decomposition, parallel candidate planning, reference selection, consistency checkpoint ordering. | MIT-compatible. Highest-value source for 2-8 minute planning and continuity logic. |
| `vibeframe` | Deterministic artifact naming, dry-run/cost gate sequence, build reports, review reports, repair loop ordering. | MIT-compatible. Translate into artifact store, cost gate, review packet, and repair workflow. |
| `videoagent` | Intent decomposition, video understanding boundaries, graph-powered planning, multimodal retrieval flow. | Top-level MIT with nested license checks. Translate reviewed components into Source Video Analyst and graph planning. |
| `openmontage` | Reference-video analysis, approval gates, provider scoring, real-footage path, self-review loop. | AGPL-3.0. Use architecture and behavior notes unless AGPL obligations or legal approval allow direct implementation reuse. |
| `moneyprinterturbo` | One-input staged pipeline, material sourcing, task progress, batch output lifecycle, subtitles/TTS/BGM orchestration, operator surfaces. | MIT-compatible. Translate into CineJelly-owned TypeScript with stronger rights metadata, Atlas-first provider contracts, and long-form review artifacts. |
| `directorbench` | Long-form evaluation dimensions, checkpoint taxonomy, bottleneck reporting. | No top-level license found. Keep as evaluation/planning influence until permission or compatible reuse path is clarified. |

Reference Implementations should capture upstream path, license, preserved behavior, changed behavior, CineJelly destination module, and validation criteria. They are non-production documentation; production code must live in `src/`.

## License-Sensitive Boundaries

- MIT snapshots can inform implementation and can be reused with the required copyright/license notice and attribution.
- CC BY 4.0 prompt content requires attribution and may carry community-content constraints; exact prompt text should be bundled only after product review.
- AGPL-3.0 source, including OpenMontage implementation code, can be studied and translated at the behavior-note level; direct implementation reuse can happen only when the product accepts AGPL obligations or legal review approves the reuse path.
- No-license snapshots, including the current DirectorBench snapshot, should stay in the snapshot/audit layer until permission or a compatible reuse path is clarified.
- Public source means publicly viewable; license status still controls commercial copying, modification, distribution, and embedding.

## Enforcement And Quality

- Allowed without friction: snapshot, study, extract generalized patterns, structures, and logic, then redesign into CineJelly-owned `src/` code with attribution.
- Required for important behavior: Faithful Logic Translation before production rewriting.
- Requires explicit review: exact community prompt text, AGPL implementation details in a distributed product, nested third-party tools, and no-license material.
- Forbidden: direct runtime imports from `external/upstream/` and wholesale large-file copies into `src/`.
- Goal: autonomous commercial product quality that is stronger than any single upstream in long-form consistency, flexibility, cost control, source lineage, and professional output.

## Security Handling

Upstream snapshots may contain their own sample configuration files, tests, demos, and development assets. Keep those files inside the snapshot/audit layer until they are explicitly reviewed and copied/adapted into CineJelly-owned product paths. Before every push, run a redacted secret audit that reports file paths and counts only, never raw secret-like values.

Last updated: June 2026
