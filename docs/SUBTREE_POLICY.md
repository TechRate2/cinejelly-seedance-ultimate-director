# Git Subtree Snapshot Policy

## Purpose

CineJelly uses Git Subtree to vendor upstream repositories into `external/upstream/` as source snapshots. The goal is to build a strong autonomous commercial product by combining the best useful parts from multiple open-source repositories, then extending them into CineJelly-owned architecture, code, data, and documentation.

Snapshots are valid source material for:

- documentation and design notes
- prompt patterns and reusable prompt anatomy
- folder structures, schemas, contracts, and workflow organization
- agent roles, production graphs, approval gates, and QA loops
- compatible implementation logic that can be reused under its license

## Required Snapshot Location

All upstream repositories must be added under:

```text
external/upstream/<snapshot-name>
```

The current primary upstream snapshots are:

| Snapshot path | Upstream repository | Primary use |
| --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | Seedance workflow, reference roles, professional prompt/QC lanes. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | Prompt anatomy, timing structures, consistency constraints, negative constraints. |
| `external/upstream/vimax` | `HKUDS/ViMax` | Long-form multi-agent planning, storyboard segmentation, reference selection, consistency checks. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | Deterministic artifacts, cost gates, build/review reports, repair loops. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | Intent decomposition, video understanding, graph-powered planning, multimodal retrieval. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | Reference-video analysis, approval gates, provider scoring, real-footage path, self-review. |

## Required Git Subtree Commands

Always use `--squash` when adding or refreshing a subtree. This keeps CineJelly history readable while preserving a durable snapshot boundary.

Add a snapshot:

```bash
git subtree add --prefix=external/upstream/<snapshot-name> <repo-url> <branch> --squash
```

Refresh a snapshot:

```bash
git subtree pull --prefix=external/upstream/<snapshot-name> <repo-url> <branch> --squash
```

Example:

```bash
git subtree add --prefix=external/upstream/seedance-2.0 https://github.com/Emily2040/seedance-2.0.git main --squash
```

## Snapshot To Product Workflow

1. Add or refresh the upstream repository under `external/upstream/` with Git Subtree and `--squash`.
2. Review the upstream license, notices, README attribution requirements, and nested third-party license files.
3. Identify useful documents, structures, patterns, schemas, prompts, agent roles, graph logic, quality gates, or implementation logic.
4. Copy or adapt the useful pieces into CineJelly-owned `docs/`, `data/`, or `src/` paths.
5. Rename and reshape copied/adapted parts so they fit CineJelly product boundaries, provider abstractions, and commercial workflows.
6. Preserve license notices and source attribution where required.
7. Update `docs/CREDITS.md` and `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` when a copied/adapted component becomes part of the product direction.

## Use Of `external/`

`external/upstream/` is the snapshot and audit layer. It should preserve upstream context as much as possible so engineers can compare CineJelly behavior against the original source.

`external/upstream/` may contain upstream tests, demos, samples, experiments, and development files because those are part of the original repositories. These files become CineJelly product material only after a deliberate copy/adapt step into `src/`, `data/`, or `docs/`.

Production code must import CineJelly-owned modules from `src/`, not upstream files from `external/upstream/`. The commercial product path is to copy or adapt the useful logic into owned modules, keep the source trail in docs, and avoid direct production coupling to a snapshot.

## Allowed Copy And Adaptation Paths

The project explicitly allows these movements:

- `external/upstream/<repo>/docs` or README material into `docs/` when attribution is preserved.
- Prompt structures, timing patterns, negative constraints, and prompt bibles into `data/` when licensing and attribution permit.
- Agent roles, graph structures, schemas, validation logic, and workflow patterns into `src/` as CineJelly-owned modules.
- Compatible MIT implementation logic into `src/` as new CineJelly code or focused adaptations with license notices and attribution.
- CC BY prompt or documentation material into `docs/` or `data/` with required attribution and product review.
- AGPL material into architecture notes, product planning, or implementation only when the product accepts the AGPL obligations or legal review approves the reuse path.

## Attribution Requirements

Every material copy/adaptation should record:

- upstream repository name and URL
- local snapshot path
- upstream license
- copied/adapted component type
- CineJelly-owned destination path
- CineJelly-specific extension or modification

Attribution can live in `docs/CREDITS.md`, `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, a focused design document, or a concise source comment when the relationship is local to one implementation.

## `src/` Implementation Rule

`src/` is the owned production implementation layer. Engineers may study, copy small compatible snippets when useful, and adapt upstream logic, but they should not drop large upstream files into `src/` unchanged. The right flow is:

1. Inspect the upstream snapshot.
2. Decide which pattern, data shape, algorithm, or workflow is useful.
3. Design the CineJelly version around existing product contracts.
4. Write or refactor CineJelly-owned TypeScript modules under `src/`.
5. Preserve attribution and license notices when the implementation materially follows a source.

## License Discipline

Git Subtree snapshotting preserves source context; it does not erase license obligations.

- MIT sources can generally be reused with the required copyright/license notice.
- CC BY sources can be reused with attribution and attention to community-content provenance.
- AGPL sources can be studied and adapted at the architecture/pattern level; direct implementation reuse must follow AGPL obligations or a legal review decision.
- No-license material should stay in the snapshot/audit layer until permission or a compatible reuse path is clarified.
- Nested tools and vendored third-party folders must be checked separately from the top-level repository license.

## Product Goal

The point of this policy is not to keep CineJelly separate from upstream value. The point is to use upstream value deliberately: snapshot it, copy the best parts, attribute clearly, adapt aggressively into CineJelly's Production Graph, Prompt Compiler, Consistency Guardian, provider layer, and long-form workflow, then continue building a differentiated product.
