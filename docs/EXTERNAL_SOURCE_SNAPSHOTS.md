# External Source Snapshots

## Purpose

CineJelly keeps upstream repositories as local Git subtree snapshots under `external/upstream/` so architecture and implementation decisions can be checked against original public sources. This improves source fidelity, but it does not grant unrestricted commercial reuse. License files and project-specific notices define what may be copied, modified, distributed, or embedded in CineJelly.

The production rule is strict: `external/upstream/` is a reference corpus, while `src/` is the original CineJelly production runtime.

## Snapshot Table

| Snapshot | Upstream | Branch captured | Local license evidence | Production reuse boundary |
| --- | --- | --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | `main` | `LICENSE` is MIT | Use for Seedance workflow, reference roles, professional handoff, and troubleshooting patterns. Direct code reuse must preserve MIT attribution. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | `main` | `LICENSE` is CC BY 4.0 | Use for generalized prompt anatomy and weighting patterns. Do not bundle copied community prompt text into product code, data, UI, or generated customer outputs without attribution review. |
| `external/upstream/vimax` | `HKUDS/ViMax` | `main` | `LICENSE` is MIT | Use for long-form multi-agent planning, shot/storyboard segmentation, reference selection, parallel candidate generation, and consistency validation patterns. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | `main` | `LICENSE` is MIT | Use for deterministic artifacts, cost gates, dry-run discipline, build/review reports, and repair-loop structure. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | `main` | Top-level `LICENSE` is MIT; nested tool folders include separate licenses | Use for video understanding, intent decomposition, multimodal retrieval, and graph-powered tool planning patterns. Nested tools need separate license review before reuse. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | `main` | `LICENSE` is GNU AGPL-3.0 | Reference only for reference-video analysis, approval gates, provider scoring, real-footage path, and self-review. Do not copy runtime implementation into proprietary CineJelly code without legal approval. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | `master` | No top-level license file found in the snapshot | Reference only for long-form evaluation dimensions, dynamic checkpoints, and bottleneck reporting until license status is clarified. |

## How Engineers Should Use These Snapshots

1. Read `docs/PROJECT_CONTEXT.md` first for the compact system map.
2. Read the relevant design spec in `docs/`.
3. Open the matching upstream snapshot only when changing a source-derived claim, a long-form planning pattern, prompt compiler behavior, provider capability assumption, or license-sensitive reuse decision.
4. Translate the observed pattern into original CineJelly code under `src/`.
5. Add attribution notes in the relevant design document or code comment when a feature is intentionally source-inspired.

## Current Source-Inspired Implementation Map

| CineJelly area | Source patterns used | CineJelly-specific extension |
| --- | --- | --- |
| Prompt Compiler | Emily2040 Seedance workflow plus YouMind prompt anatomy | Typed shot contracts, reference binding, negative constraints, repair hints, adaptive niche planning without hardcoded prompt templates. |
| Production Graph | ViMax long-form segmentation plus VideoAgent graph planning | Provider-neutral graph of project, references, story, storyboard, shots, renders, inspections, repairs, and deliverables. |
| Consistency Guardian | ViMax consistency checks, DirectorBench checkpoints, OpenMontage self-review ideas | Runtime preflight, storyboard preflight, test-take gates, candidate selection, render inspection, semantic visual inspection, and repair-only regeneration. |
| Source Video Analyst | VideoAgent video understanding plus OpenMontage reference-video analysis | Bounded transcript, scene, keyframe, pacing, style, structural beat, and safety guidance that informs original planning without copying source-video content. |
| Artifact and Review Discipline | VibeFrame build/review reports and OpenMontage approval gates | Redacted success/failure artifacts, review packets, cost ledgers, manifest hashes, delivery gates, and queue telemetry for commercial operations. |
| Provider Layer | Atlas Cloud docs and Seedance 2.0 reference guides | Atlas Cloud default with provider-neutral contracts for future Kie.ai, fal.ai, Runway, Replicate, or direct Volcengine adapters. |

## License-Sensitive Boundaries

- MIT snapshots can inform implementation and may permit reuse with attribution, but CineJelly still prefers original code for maintainability and product ownership.
- CC BY 4.0 prompt content requires attribution and may carry community-content constraints; generalized structural learning is preferred over copying prompts.
- AGPL-3.0 source, including OpenMontage implementation code, must stay reference-only for a proprietary hosted product unless legal review approves the obligations.
- No-license snapshots, including the current DirectorBench repository snapshot, must stay reference-only until permission is clarified.
- Public source means publicly viewable; it does not automatically mean unrestricted commercial copying.

## Security Handling

Upstream snapshots may contain their own sample configuration files, tests, demos, and development assets. They must remain isolated from CineJelly runtime and deployment packaging unless explicitly reviewed. Before every push, run a redacted secret audit that reports file paths and counts only, never raw secret-like values.
