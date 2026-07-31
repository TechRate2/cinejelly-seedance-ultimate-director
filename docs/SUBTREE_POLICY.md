# Git Subtree Snapshot Policy

## Purpose

CineJelly uses curated upstream source snapshots under `external/upstream/`. The goal is to build a strong autonomous commercial product by combining the best useful parts from multiple open-source repositories, then extending them into CineJelly-owned architecture, code, data, and documentation.

The product repository is not a raw upstream mirror. After a snapshot add or refresh, prune upstream tests, mocks, demos, examples, generated build folders, temporary files, notebooks, sample media, generated datasets, cache files, binary model weights, and vendored font/music resources before commit. Full raw clones can live outside this repo for legal/source review, but commercial source control should stay focused on product code, source lineage, license evidence, and documentation anchors.

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
| `external/upstream/moneyprinterturbo` | `harry0703/MoneyPrinterTurbo` | Staged one-input pipeline, material sourcing, batch outputs, subtitles/TTS/BGM, task progress, API/CLI/WebUI. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | Checkpoint-level long-form diagnosis across script, visual, audio, cross-modal, stability, and transition quality. |
| `external/upstream/director` | `video-db/Director` | Chat-style media reasoning, dynamic agent/tool orchestration, typed content outputs, progress updates, and media workflow UI patterns. |
| `external/upstream/skyreels-v2` | `SkyworkAI/SkyReels-V2` | **Reference only, no code reuse.** Short-drama methodology: hook density, reversal rhythm, SkyCaptioner structured shot-caption fields. Ships a non-standard model-card license. |
| `external/upstream/open-ai-ugc` | `Anil-matcha/Open-AI-UGC` | **Reference only, no code reuse.** Minimal-input UGC studio UX shape. No license file in the snapshot, so all rights are reserved by its authors. |
| `external/upstream/open-ai-micro-drama-generator` | `Anil-matcha/Open-AI-Micro-Drama-Generator` | **Reference only, no code reuse.** Multi-agent micro-drama pipeline shape (screenwriter -> storyboard -> still frames -> video). No license file in the snapshot, so all rights are reserved by its authors. |

### Reference-only snapshots

Three snapshots above are marked **reference only**. They may be read to understand an approach; no
line of their code may be copied or translated into CineJelly source, because their licenses do not
grant that right — two ship no license file at all, which reserves every right to their authors, and
SkyReels ships a non-standard model-card license.

`npm run validation:snapshot-parity` enforces the distinction. A reference-only snapshot must be
inventoried here and in `EXTERNAL_SOURCE_SNAPSHOTS.md`, and must NOT have a source-lineage record in
`src/core/source-logic-translation-records.ts` — a lineage record asserts that product logic was
translated from the snapshot, which is precisely what must never happen for these. The audit also
fails on any snapshot directory that appears on disk without being declared here, which is how these
three went ungoverned until the 2026-07-28 audit.

The strictest license in the set is `openmontage` (**AGPL-3.0**). AGPL is copyleft: importing or
translating its code into this product would oblige the whole product to be released under AGPL.
Treat it as behaviour notes only unless a lawyer says otherwise.

## Required Git Subtree Commands

Always use `--squash` when adding or refreshing a subtree. This keeps CineJelly history readable while preserving a durable snapshot boundary. After every add or pull, apply the curated snapshot hygiene policy and run `npm.cmd run validation:snapshot-parity`.

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
2. Prune upstream tests, mocks, demos, examples, generated build folders, temporary files, notebooks, sample media, generated datasets, cache files, binary model weights, and vendored font/music resources from the tracked product repo.
3. Review the upstream license, notices, README attribution requirements, and nested third-party license files.
4. Identify useful documents, structures, patterns, schemas, prompts, agent roles, graph logic, quality gates, or implementation logic.
5. For important behavior, create a Reference Implementation using `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md` before writing production code.
6. Copy or adapt the useful pieces into CineJelly-owned `docs/`, `data/`, or `src/` paths.
7. Rename and reshape copied/adapted parts so they fit CineJelly product boundaries, provider abstractions, and commercial workflows.
8. Preserve license notices and source attribution where required.
9. Update `docs/CREDITS.md` and `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` when a copied/adapted component becomes part of the product direction.
10. Run `npm.cmd run validation:snapshot-parity` and keep the source hygiene check passing before push.

## Faithful Logic Translation

CineJelly wants high fidelity to useful upstream behavior, especially edge cases, ordering, weighting, fallback rules, and repair strategy. That fidelity must be achieved through deliberate translation into CineJelly-owned production modules, not through direct runtime dependency on upstream snapshots.

Pattern Extraction and Faithful Logic Translation are different:

- Pattern Extraction captures a broad shape such as folder structure, agent role, artifact type, or workflow lane. It is useful for product design but does not promise behavior parity.
- Faithful Logic Translation captures behavior that output quality depends on: ordering, scoring, weighting, fallback, duplicate handling, edge cases, and repair decisions.

Use the full process in `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md` when translating logic that affects:

- provider request compilation, polling, retry, fallback, error normalization, or cost tracking
- prompt ordering, reference binding, prompt weighting, negative constraints, or repair prompts
- long-form chunking, storyboard segmentation, dependency scheduling, or shot planning
- consistency scoring, candidate ranking, render inspection, delivery gates, or repair-only regeneration
- material sourcing, task progress, batch generation, subtitles, TTS, BGM, or source-video analysis

The required flow for important logic is:

```text
Deep Analysis -> Reference Implementation -> Fidelity Review -> CineJelly Rewriting -> Integration -> Validation
```

A Reference Implementation is a non-production fidelity aid. It can be pseudocode, a source-to-product mapping table, an algorithm note, or an edge-case checklist under `docs/`. It must not be imported by production code. Production behavior belongs in `src/` as new or substantially adapted CineJelly TypeScript.

Reference Implementations should record the upstream repository, snapshot path, source files, license, behavior preserved, behavior changed, acceptance criteria, and attribution destination. This gives engineers permission to preserve behavior closely while keeping source provenance and commercial boundaries clear.

For concrete examples, see the Practical Translation Examples in `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`:

- Reference Binding + Prompt Ordering from Emily2040/seedance-2.0 plus YouMind-OpenLab/awesome-seedance-2-prompts.
- Repair Strategy + Consistency Checkpoint from ViMax plus VibeFrame.
- Postproduction Asset Orchestration from MoneyPrinterTurbo subtitles/audio/BGM stage planning plus VibeFrame review artifact discipline.
- Generated Audio Intent Planning from MoneyPrinterTurbo voice/BGM stage inputs plus VibeFrame deterministic incomplete-stage evidence, with OpenMontage approval/self-review concepts kept as AGPL-aware behavior notes.
- Generated Audio Provider Execution Contract from MoneyPrinterTurbo audio-stage execution plus VibeFrame validation/cost discipline, with OpenMontage provider-menu and approval concepts kept as AGPL-aware behavior notes.
- Generated Audio Execution Planner from MoneyPrinterTurbo audio-stage request fields plus VibeFrame validation-before-spend reporting, with OpenMontage provider-preference concepts kept as AGPL-aware behavior notes.
- Generated Audio Output Validation from MoneyPrinterTurbo prepared-audio artifact boundaries plus VibeFrame validation-before-release reporting, with OpenMontage media-review concepts kept as AGPL-aware behavior notes.
- Generated Audio Output Batch Validation from MoneyPrinterTurbo staged generated-audio artifact reconciliation plus VibeFrame deterministic release reports, with OpenMontage sample-before-batch concepts kept as AGPL-aware behavior notes.
- Generated Audio Batch Artifact Evidence from MoneyPrinterTurbo operator-visible task artifacts plus VibeFrame deterministic artifact reports, with OpenMontage approval concepts kept as AGPL-aware behavior notes.
- Generated Audio Asset Resolution from MoneyPrinterTurbo staged prepared-audio artifacts plus VibeFrame artifact-resolution reporting, with OpenMontage approval concepts kept as AGPL-aware behavior notes.
- Generated Audio Asset Resolution Catalog from MoneyPrinterTurbo staged artifact visibility plus VibeFrame preflight/report discipline, with OpenMontage approval concepts kept as AGPL-aware behavior notes.
- Director Agentic Media Reasoning from video-db/Director natural-language agent routing, content/status payloads, and chat workflow concepts, rewritten as CineJelly-owned short-pipeline planning, approval gates, async job progress, and artifact evidence rather than importing upstream Python/frontend code.
- Focused Reference Implementations under `docs/reference-implementations/`, including Media Tool Binary Resolution, show how deployment-critical runtime behavior is translated without importing from upstream snapshots.

For implementation order, milestones, and the shared validation checklist, use `docs/IMPLEMENTATION_ROADMAP.md`.

## Use Of `external/`

`external/upstream/` is the curated source snapshot and audit layer. It should preserve enough upstream context for engineers to compare CineJelly behavior against the original source without turning the product repo into a raw mirror.

`external/upstream/` must not keep upstream tests, mocks, demos, examples, generated build folders, temporary files, notebooks, sample media, generated datasets, cache files, binary model weights, or vendored font/music resources. Those files are useful for source review only in an external raw clone or archive; they become CineJelly product material only after a deliberate copy/adapt step into `src/`, `data/`, or `docs/`.

Production code must import CineJelly-owned modules from `src/`, not upstream files from `external/upstream/`. The commercial product path is to copy or adapt the useful logic into owned modules, keep the source trail in docs, and avoid direct production coupling to a snapshot.

## Allowed Copy And Adaptation Paths

The project explicitly allows these movements:

- `external/upstream/<repo>/docs` or README material into `docs/` when attribution is preserved.
- Prompt structures, timing patterns, negative constraints, and prompt bibles into `data/` when licensing and attribution permit.
- Agent roles, graph structures, schemas, validation logic, and workflow patterns into `src/` as CineJelly-owned modules.
- Compatible MIT implementation logic into `src/` as new CineJelly code or focused adaptations with license notices and attribution.
- CC BY prompt or documentation material into `docs/` or `data/` with required attribution and product review.
- AGPL material into architecture notes, product planning, or implementation only when the product accepts the AGPL obligations or legal review approves the reuse path.

Faithful Logic Translation is allowed and encouraged when the license path supports it. The implementation route depends on the source:

- MIT sources: compatible implementation logic may be translated or adapted into `src/` with required notices and attribution. Large unchanged file drops are still not the preferred product path.
- CC BY sources: prompt text and documentation may be copied or adapted with attribution and product review; generalized prompt anatomy can be translated into CineJelly-owned prompt structures.
- AGPL sources: architecture and behavior can be studied; direct implementation reuse requires accepting AGPL obligations or a legal approval path. Without that path, use clean CineJelly rewriting from behavioral notes.
- No-license sources: keep protected expression in the snapshot/audit layer unless permission or a compatible reuse path is clarified. Use only high-level learning, evaluation vocabulary, or original CineJelly implementation decisions.

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
3. Create a Reference Implementation for behavior-critical logic.
4. Design the CineJelly version around existing product contracts.
5. Write or refactor CineJelly-owned TypeScript modules under `src/`.
6. Preserve attribution and license notices when the implementation materially follows a source.

Production code must never import from `external/upstream/`. If a module needs source-derived behavior, translate it into the matching CineJelly layer first: `src/providers`, `src/prompt_compiler`, `src/core`, `src/agents`, `src/application`, or `src/types`.

## License Discipline

Git Subtree snapshotting preserves source context; it does not erase license obligations.

- MIT sources can generally be reused with the required copyright/license notice.
- CC BY sources can be reused with attribution and attention to community-content provenance.
- AGPL sources can be studied and adapted at the architecture/pattern level; direct implementation reuse must follow AGPL obligations or a legal review decision.
- No-license material should stay in the snapshot/audit layer until permission or a compatible reuse path is clarified.
- Nested tools and vendored third-party folders must be checked separately from the top-level repository license.

## Product Goal

The point of this policy is not to keep CineJelly separate from upstream value. The point is to use upstream value deliberately: snapshot it, copy the best parts, attribute clearly, adapt aggressively into CineJelly's Production Graph, Prompt Compiler, Consistency Guardian, provider layer, and long-form workflow, then continue building a differentiated product.
