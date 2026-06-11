# Faithful Logic Translation Process

## Purpose

CineJelly uses upstream Git Subtree snapshots to build product behavior with high source fidelity while keeping the production implementation CineJelly-owned. Faithful Logic Translation means translating the useful behavior of an upstream component into CineJelly's TypeScript architecture without directly importing from `external/upstream/` or dropping large unchanged upstream files into `src/`.

The target is behavioral fidelity, not file fidelity. Engineers should preserve the important ordering, defaults, edge cases, scoring rules, fallback behavior, repair decisions, and quality gates from the source when those details make the product stronger.

## When This Process Is Required

Use this process before implementing or materially changing source-derived logic that affects:

- provider request compilation, polling, retry, fallback, or cost accounting
- prompt weighting, prompt ordering, negative constraints, reference binding, or repair hints
- long-form chunking, scene ordering, dependency planning, or shot scheduling
- candidate ranking, consistency checks, repair strategy, or delivery gating
- source-video analysis, material sourcing, batch generation, task progress, or postproduction flow
- any behavior claimed to be faithful to Emily2040/seedance-2.0, YouMind-OpenLab/awesome-seedance-2-prompts, ViMax, VibeFrame, VideoAgent, OpenMontage, MoneyPrinterTurbo, DirectorBench, or another upstream snapshot

Small terminology changes, original CineJelly-only utilities, and purely local refactors do not need a full Reference Implementation, but they should still preserve attribution when the source relationship is material.

## The 6-Step Process

## 1. Deep Analysis

Read the upstream snapshot directly from `external/upstream/<snapshot-name>`. Capture:

- upstream repository and local snapshot path
- upstream commit or subtree refresh date when known
- relevant upstream files, docs, schemas, or examples
- license evidence and nested third-party license concerns
- input and output shapes
- state transitions, ordering, defaults, limits, and weighting rules
- failure modes, retry rules, fallback decisions, and edge cases
- product gaps where CineJelly must improve on the source

The analysis should be narrow. Study only the upstream area needed for the module being implemented.

## 2. Reference Implementation

Create a non-production Reference Implementation before writing production code when the upstream behavior is important. A Reference Implementation may be:

- a pseudocode section in the relevant design doc
- a short algorithm map under `docs/`
- a source-to-CineJelly translation table
- a structured checklist of edge cases, ordering rules, and expected decisions

Reference Implementations must not be imported by production runtime code. They are a fidelity aid, not a deployable dependency.

For critical modules, the Reference Implementation should state:

- the upstream source paths and license
- the behavior being preserved
- the behavior intentionally changed by CineJelly
- the acceptance criteria for the rewritten module
- the attribution destination, usually `docs/CREDITS.md`, `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, or a focused design document

## 3. Fidelity Review

Review the Reference Implementation before production rewriting. Confirm:

- the important source behaviors are represented accurately
- license boundaries are clear before implementation starts
- AGPL or no-license material is not being copied into proprietary production code without an approved path
- upstream limitations are identified so CineJelly can improve them deliberately
- the target CineJelly contracts are known

This review should decide whether the production implementation will be a clean CineJelly rewrite, a compatible attributed adaptation, or a documentation-only influence.

## 4. CineJelly Rewriting

Write new production TypeScript under `src/`. The implementation should:

- use CineJelly-owned names, contracts, types, errors, logging, and cost tracking
- preserve the chosen source behavior at the logic level
- avoid direct imports from `external/upstream/`
- avoid copying large upstream files unchanged into `src/`
- improve reliability for commercial use, including validation, bounded inputs, redaction, deterministic IDs, cancellation, and operator-visible artifacts where relevant
- keep provider-specific details behind the Model Provider Abstraction

If a small compatible snippet is adapted from an MIT source, preserve the required license notice and attribution. Prefer rewriting into CineJelly style when the source code shape does not match local architecture.

## 5. Integration

Integrate the rewritten module through CineJelly production boundaries:

- provider logic through `src/providers`
- prompt logic through `src/prompt_compiler`
- graph, planning, guardian, sourcing, and postproduction logic through `src/core`
- orchestration through `src/agents` or `src/application`
- public contracts through `src/types`
- stable package surface through `src/index.ts`

Record source lineage in docs and, when useful for operator audit, in product artifacts. The lineage should name the source repository, local snapshot path, license, preserved behavior, and CineJelly changes.

## 6. Validation

Validate the rewritten behavior before treating it as production-ready:

- run TypeScript type checking
- review edge cases from the Reference Implementation
- verify no production code imports from `external/upstream/`
- verify redaction for secrets, filesystem paths, signed URLs, and credential-bearing URLs
- verify cost tracking and provider error handling for credit-spending paths
- verify long-form behavior with bounded chunking, dependency ordering, and repair-only regeneration where relevant
- verify attribution and license notes are updated

Do not create CineJelly-owned test, mock, demo, sample, or example files in production paths. Validation evidence can live in design notes, operator artifacts, review packets, or future approved test infrastructure if project policy changes.

## License-Aware Translation Rules

## MIT Sources

MIT sources can inform implementation and can be adapted into production code with the required copyright and license notice. CineJelly still prefers a local rewrite when the source file is large, framework-specific, or not aligned with product contracts.

Primary MIT snapshots include Emily2040/seedance-2.0, ViMax, VibeFrame, VideoAgent top-level code, and MoneyPrinterTurbo.

## CC BY Sources

CC BY sources can be used with attribution. Exact prompt text, community examples, and prompt corpora require product review before bundling because provenance and downstream rights may vary by contribution.

The primary CC BY snapshot is YouMind-OpenLab/awesome-seedance-2-prompts.

## AGPL Sources

AGPL sources can be studied for architecture, workflows, and behavior. Direct implementation reuse must follow AGPL obligations or an approved legal path. When CineJelly does not accept AGPL obligations for a module, use clean CineJelly rewriting from behavioral notes rather than copying implementation code.

The primary AGPL snapshot is OpenMontage.

## No-License Sources

No-license sources should remain in the snapshot/audit layer unless permission or a compatible reuse path is established. They can inform evaluation dimensions, vocabulary, and product planning notes, but production implementation should not copy protected expression from them.

The current no-license snapshot is DirectorBench.

## First Logic Areas To Translate

The highest-value early translation targets are:

- Emily2040/seedance-2.0 and YouMind prompt ordering, reference roles, prompt weights, negative constraints, and repair prompt structure
- ViMax long-form chunking, storyboard segmentation, reference selection, and consistency checkpoints
- VibeFrame deterministic artifact discipline, cost gates, build reports, and repair loop ordering
- VideoAgent intent decomposition, graph planning, and source-video understanding boundaries
- OpenMontage approval gates, reference-video analysis, provider scoring, and self-review as license-reviewed behavioral notes
- MoneyPrinterTurbo staged pipeline, material sourcing, task progress, batch candidate handling, subtitles, TTS, BGM, and one-input workflow ergonomics

Each translated area should produce a short source map before production changes begin.
