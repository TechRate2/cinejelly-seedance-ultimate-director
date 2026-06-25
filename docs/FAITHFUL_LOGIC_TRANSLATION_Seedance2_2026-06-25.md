# Faithful Logic Translation: Seedance 2.0

Date: 2026-06-25

## Upstream Snapshot

- Repository: `Emily2040/seedance-2.0`
- Local snapshot: `external/upstream/seedance-2.0`
- License class: MIT snapshot per project policy
- Translation mode: faithful behavior translation into CineJelly-owned TypeScript

## Source Files Read For This Upgrade

- `external/upstream/seedance-2.0/references/reference-workflow.md`
- `external/upstream/seedance-2.0/references/shot-list-continuity.md`
- `external/upstream/seedance-2.0/references/multishot-grammar.md`

These files were selected because this upgrade changes director-level planning for Short and Long. Unrelated localized vocabularies, examples, UI docs, and migrated prompt corpora were intentionally not loaded.

## Behavior To Preserve

1. Assign an explicit role to every reference before prompt prose.
2. Keep identity/product/endpoints ahead of motion, camera, audio, and style.
3. Treat video/audio references as scoped controllers, not authorization to copy protected identity, voice, music, logos, or scene ownership.
4. Build a shot list and continuity ledger before writing prompts.
5. Record continuity anchors for character, product, location, screen direction, eyeline, lighting, camera, action state, and sound state.
6. Use the safest mode per beat: text, image, role-bound reference, first/last-frame, edit, or extend.
7. For multi-shot Seedance prompts, use explicit `Shot N:` labels and budget roughly 4-6 seconds per shot.
8. Do not force multi-shot below the duration budget; reduce shots or select a single continuous clip when the request is short and stable.

## CineJelly Mapping

| Upstream behavior | CineJelly destination |
| --- | --- |
| Reference role map before prose | `src/prompt_compiler/reference-binding.ts` and existing `PromptBindingPlan` |
| Shot list before prompt | `src/core/shot-planner.ts`, `src/core/storyboard-planner.ts`, `src/core/video-render-strategy-planner.ts` |
| Continuity ledger | `src/core/continuity-ledger-builder.ts`, `src/core/long-form-continuity-planner.ts` |
| Multi-shot duration grammar | `src/core/short-director-planner.ts`, `src/core/long-director-planner.ts`, `src/core/long-director-ui-contract.ts` |
| First/last-frame handoff | `src/core/endpoint-frame-chain.ts`, `src/core/video-render-strategy-planner.ts` |
| Scoped reference safety | `src/core/short-viral-intelligence-planner.ts`, `src/prompt_compiler/reference-binding.ts` |

## Intentional CineJelly Changes

- CineJelly keeps Short and Long directors separate instead of adding one heavy global Meta-Director.
- CineJelly does not enable visible burned-in text for Short by default. OpenMontage-style short-form caption evidence is translated into review/export metadata unless the operator later enables a UI/post-production caption path.
- CineJelly keeps source-video structure as planning evidence by default and does not pass it to a provider unless capability validation explicitly supports it.
- CineJelly routes all provider spend through cost, review, and artifact gates.

## Acceptance Criteria

- Short director decisions must recommend `single_clip` only when the duration and scene budget fit a single Seedance generation.
- Short director decisions must recommend `storyboard_multishot` when the concept needs more than one beat or exceeds the safe single-clip budget.
- Long director decisions must require sequence/bridge/continuity evidence for long or series-style productions.
- Both directors must be no-spend/no-network planning artifacts.
- Long review UI contracts must expose story, continuity, checkpoint, candidate, repair, paid-validation, and manual-review gates without frontend clients reinterpreting the full creative artifact.
- Production code must not import from `external/upstream/seedance-2.0`.

## Validation

- TypeScript typecheck must pass.
- Existing Short pipeline smoke must continue to pass.
- Existing long-form creative intelligence validation must continue to pass when run.
- Import-boundary review must show no runtime imports from `external/upstream`.
