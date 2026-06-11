# External Source Snapshots

## Purpose

CineJelly keeps upstream repositories as local Git Subtree snapshots under `external/upstream/` so architecture, documentation, prompt patterns, workflow structures, and implementation decisions can be checked against original public sources and then copied or adapted into the product. This improves source fidelity and product velocity while keeping license and attribution obligations visible.

The production rule is deliberate: `external/upstream/` is the snapshot and audit layer, while productized components live in CineJelly-owned `src/`, `data/`, and `docs/` paths after a copy/adapt step governed by `docs/SUBTREE_POLICY.md`.

Production code must not import directly from `external/upstream/`. When useful upstream logic becomes production behavior, write a CineJelly-owned implementation in `src/`, preserve attribution, and avoid copying large upstream files unchanged.

## Git Subtree Command Policy

All upstream snapshots must be added or refreshed with `--squash`:

```bash
git subtree add --prefix=external/upstream/<snapshot-name> <repo-url> <branch> --squash
git subtree pull --prefix=external/upstream/<snapshot-name> <repo-url> <branch> --squash
```

## Snapshot Table

| Snapshot | Upstream | Branch captured | Local license evidence | Reuse and integration boundary |
| --- | --- | --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | `main` | `LICENSE` is MIT | Use for Seedance workflow, reference roles, professional handoff, and troubleshooting patterns. Compatible code or logic reuse must preserve MIT attribution and be productized as CineJelly-owned modules. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | `main` | `LICENSE` is CC BY 4.0 | Use for generalized prompt anatomy, weighting patterns, and attribution-reviewed prompt-pattern snapshots. Exact community prompt text requires CC BY attribution and product review before bundled use. |
| `external/upstream/vimax` | `HKUDS/ViMax` | `main` | `LICENSE` is MIT | Use for long-form multi-agent planning, shot/storyboard segmentation, reference selection, parallel candidate generation, and consistency validation patterns. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | `main` | `LICENSE` is MIT | Use for deterministic artifacts, cost gates, dry-run discipline, build/review reports, and repair-loop structure. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | `main` | Top-level `LICENSE` is MIT; nested tool folders include separate licenses | Use for video understanding, intent decomposition, multimodal retrieval, and graph-powered tool planning patterns. Nested tools need separate license review before reuse. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | `main` | `LICENSE` is GNU AGPL-3.0 | Use for reference-video analysis, approval gates, provider scoring, real-footage path, and self-review. Direct implementation reuse must follow AGPL obligations or a legal review decision. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | `master` | No top-level license file found in the snapshot | Use for long-form evaluation dimensions, dynamic checkpoints, and bottleneck reporting in architecture notes until permission or a compatible reuse path is clarified. |

## How Engineers Should Use These Snapshots

1. Read `docs/PROJECT_CONTEXT.md` first for the compact system map.
2. Read the relevant design spec in `docs/`.
3. Review the relevant upstream repository and license obligations.
4. Add or refresh the matching snapshot under `external/upstream/` with Git Subtree and `--squash`.
5. Decide what should be copied/adapted: document, pattern, structure, schema, prompt anatomy, or implementation logic.
6. Move product-ready material into CineJelly-owned `docs/`, `data/`, or newly written/adapted `src/` modules.
7. Add attribution notes in the relevant design document, `docs/CREDITS.md`, or code comment when a feature is intentionally source-integrated.

## Current Source-Inspired Implementation Map

| CineJelly area | Source patterns used | CineJelly-specific extension |
| --- | --- | --- |
| Prompt Compiler | Emily2040 Seedance workflow plus YouMind prompt anatomy | Typed shot contracts, reference binding, negative constraints, repair hints, adaptive niche planning without hardcoded prompt templates. |
| Production Graph | ViMax long-form segmentation plus VideoAgent graph planning | Provider-neutral graph of project, references, story, storyboard, shots, renders, inspections, repairs, and deliverables. |
| Consistency Guardian | ViMax consistency checks, DirectorBench checkpoints, OpenMontage self-review ideas | Runtime preflight, storyboard preflight, test-take gates, candidate selection, render inspection, semantic visual inspection, and repair-only regeneration. |
| Source Video Analyst | VideoAgent video understanding plus OpenMontage reference-video analysis | Bounded transcript, scene, keyframe, pacing, style, structural beat, and safety guidance that informs original planning while preserving source-video rights boundaries. |
| Artifact and Review Discipline | VibeFrame build/review reports and OpenMontage approval gates | Redacted success/failure artifacts, review packets, cost ledgers, manifest hashes, delivery gates, and queue telemetry for commercial operations. |
| Provider Layer | Atlas Cloud docs and Seedance 2.0 reference guides | Atlas Cloud default with provider-neutral contracts for future Kie.ai, fal.ai, Runway, Replicate, or direct Volcengine adapters. |

## License-Sensitive Boundaries

- MIT snapshots can inform implementation and can be reused with the required copyright/license notice and attribution.
- CC BY 4.0 prompt content requires attribution and may carry community-content constraints; exact prompt text should be bundled only after product review.
- AGPL-3.0 source, including OpenMontage implementation code, can be reused only when the product accepts the AGPL obligations or legal review approves the reuse path.
- No-license snapshots, including the current DirectorBench repository snapshot, should stay in the snapshot/audit layer until permission or a compatible reuse path is clarified.
- Public source means publicly viewable; license status still controls commercial copying, modification, distribution, and embedding.

## Security Handling

Upstream snapshots may contain their own sample configuration files, tests, demos, and development assets. Keep those files inside the snapshot/audit layer until they are explicitly reviewed and copied/adapted into CineJelly-owned product paths. Before every push, run a redacted secret audit that reports file paths and counts only, never raw secret-like values.
