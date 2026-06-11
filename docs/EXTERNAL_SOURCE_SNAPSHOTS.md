# External Source Snapshots Inventory and Integration Policy

## Purpose

This document provides the authoritative inventory of Git Subtree snapshots under `external/upstream/` and the **explicit policy** for snapshotting, reviewing, and integrating patterns, structures, logic, and workflows from the original upstream repositories into CineJelly Seedance Ultimate Director.

**We are explicitly permitted and encouraged to snapshot the upstream repositories using Git Subtree with `--squash`, review their content, and integrate/adapt/improve the useful patterns, structures, and logic into our own autonomous CineJelly-owned implementation.**

## Core Integration Policy (Mandatory for All Engineers)

1. **Subtree**: Bring original repo into `external/upstream/<name>` using `git subtree add --prefix=external/upstream/<name> <url> <branch> --squash` (or pull to refresh).
2. **Snapshot**: The full history is squashed into one commit for clean audit trail. The snapshot is read-only source material.
3. **Review**: Examine license, structure, prompt patterns, agent workflows, graph designs, provider logic, quality gates, long-form strategies, and error/cost handling.
4. **Adapt + Improve**: Extract the *useful essence* (not whole files). Redesign it to fit CineJelly contracts (Production Graph, Provider Abstraction, Prompt Compiler rules, Guardian checkpoints, flexible settings for 2-8min videos).
5. **Viết code mới (Write New Code)**: Implement as clean, production-grade TypeScript **in `src/`**. This must be original CineJelly work — new or substantially adapted implementation that combines + improves upon the snapshotted ideas. **Never copy large upstream files unchanged into `src/`**.
6. **Attribute**: Record origin + CineJelly extension in `docs/CREDITS.md`, this file, design docs, and code comments.
7. **Enforce**: Production code **must never import directly from `external/upstream/`**. All runtime behavior lives in owned `src/` modules.

**Result**: The final product is a self-reliant commercial system that is stronger or equal to the individual upstream repos, with Atlas Cloud as default, full support for flexible settings and long videos (2–8 phút), and professional delivery artifacts.

## Snapshot Inventory

| Local Path | Upstream Repo | License | Key Patterns/Logic Integrated (after review) | CineJelly Extension & Status |
|------------|---------------|---------|---------------------------------------------|------------------------------|
| external/upstream/seedance-2.0 | Emily2040/seedance-2.0 | MIT | Intent-first workflow, role-based references, professional shot/QC handoff, "direct the model" philosophy | Production Graph + Consistency Guardian; typed lineage and targeted repair |
| external/upstream/awesome-seedance-2-prompts | YouMind-OpenLab/awesome-seedance-2-prompts | CC BY 4.0 | Structured prompt anatomy (time-bounded, consistency constraints, camera/motion/audio/negative) | Adaptive Prompt Compiler (no hardcoded niches); generalized + repair hints |
| external/upstream/vimax | HKUDS/ViMax | MIT | Multi-agent long-form planning, RAG segmentation, storyboard, parallel candidates + consistency selection | Provider-agnostic Production Graph + smart chunking for 2-8min videos |
| external/upstream/vibeframe | vericontext/vibeframe | MIT | Deterministic artifacts, dry runs, cost gates, build/review reports, repair loops | API-first service with review-packet.json, cost-ledger, preflight, redaction, HTTP lifecycle |
| external/upstream/videoagent | HKUDS/VideoAgent | MIT (nested review) | Intent decomposition, graph-powered planning, multimodal video understanding | Source Video Analyst for bounded reference-video deconstruction guidance |
| external/upstream/openmontage | calesthio/OpenMontage | AGPL-3.0 | Reference-video analysis, approval gates, provider scoring, self-review (ffprobe etc.) | Consistency Guardian + Delivery Gate adapted from approval/self-review ideas (AGPL caution applied) |
| external/upstream/moneyprinterturbo | harry0703/MoneyPrinterTurbo | MIT | Staged pipeline, material sourcing, batch outputs, task progress, subtitles/TTS/BGM | Governed material planner + batch evidence in Graph; long-form continuity instead of short-video |
| external/upstream/directorbench | jiaminchen-1031/DirectorBench | Review pending | Checkpoint-level diagnosis (script/visual/audio/cross-modal/stability), transition focus | Consistency Guardian with checkpoint scoring and targeted repair routing |

## Atlas Cloud Integration

Atlas Cloud (docs + API guides) is the **default provider**. Its async prediction model, Universal Reference, Asset Library, and Seedance 2.0 capabilities are deeply integrated into the Model Provider Abstraction Layer (see docs/MODEL_PROVIDER_ABSTRACTION.md).

## Enforcement & Quality

- Allowed without friction: Snapshot, study, extract generalized patterns/structures/logic, redesign into own `src/` code with attribution.
- Requires explicit review: Exact community prompt text, AGPL implementation details in distributed product.
- Forbidden: Direct runtime imports from external/upstream/, wholesale large-file copies into src/.
- Goal: Autonomous commercial product ≥ any single upstream in long-form consistency, flexibility, cost control, and professional output.

Last updated: June 2026
