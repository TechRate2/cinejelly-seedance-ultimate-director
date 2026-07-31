# Faithful Logic Translation: OpenMontage
> ⚠️ **TÀI LIỆU THIẾT KẾ — KHÔNG PHẢI MÔ TẢ CODE HIỆN TẠI.**
> Cập nhật lần cuối: **2026-07-02**. Từ đó tới nay mã nguồn đã đổi rất nhiều.
> Đọc [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md) để biết dự án HIỆN TẠI ra sao.
> Khi tài liệu này mâu thuẫn với code, **code đúng** — tài liệu là cái sai.


Date: 2026-06-25

## Upstream Snapshot

- Repository: `calesthio/OpenMontage`
- Local snapshot: `external/upstream/openmontage`
- License class: AGPL per project policy
- Translation mode: behavior-note input only, rewritten as CineJelly-owned TypeScript

## Source Files Read For This Upgrade

- `external/upstream/openmontage/skills/creative/short-form.md`
- `external/upstream/openmontage/skills/meta/checkpoint-protocol.md`
- `external/upstream/openmontage/skills/creative/broll-planning.md`

These files were selected because this upgrade adds separate Short/Long director planning and review-policy evidence. OpenMontage frontend, full skill tree, and provider-specific implementation files were intentionally not loaded.

## Behavior To Preserve

1. Short-form planning must respect platform duration, safe-zone, hook, pacing, audio, and review constraints.
2. Short-form plans should treat 15 seconds as completion-friendly, 30 seconds as engagement-friendly, and 60 seconds as flexible but retention-sensitive.
3. The first 1-3 seconds must carry a hook, movement, or pattern interrupt.
4. Visual changes should be frequent for short-form, generally every 1-3 seconds.
5. Checkpoints should preserve stage artifacts, review findings, cost/time metadata, and human approval state.
6. Creative stages should not skip human review when the downstream provider spend or public release depends on them.
7. B-roll/material decisions should prefer stock for realism and generated material for specific/stylized concepts, with source and rights evidence.

## CineJelly Mapping

| Upstream behavior | CineJelly destination |
| --- | --- |
| Short hook/pacing/duration strategy | `src/core/short-director-planner.ts`, `src/core/short-viral-intelligence-planner.ts`, `src/core/short-mvp-ui-contract.ts` |
| Human checkpoint protocol | `src/core/review-approval-system.ts`, `src/api/render-job-manager.ts` |
| Resume/audit-friendly checkpoint concepts | `src/core/production-graph-resume-state.ts`, `src/core/production-graph-run-recorder.ts` |
| B-roll source-vs-generated decision matrix | `src/core/material-sourcing-planner.ts`, `src/core/material-source-validator.ts` |
| Stage-specific review evidence | `src/core/short-commercial-readiness-planner.ts`, `src/core/long-form-readiness-planner.ts` |

## Intentional CineJelly Changes

- CineJelly does not copy OpenMontage code because the snapshot is AGPL. All production logic is a clean TypeScript rewrite.
- CineJelly keeps Short Director and Long Director separate so the future UI can expose clear product modes.
- CineJelly does not require burned-in captions for Short while the current product policy is no visible video text. It keeps caption/no-text review evidence and can later expose captions as an opt-in post-production/export feature.
- CineJelly blocks provider spend unless review and commercial gates are satisfied.

## Acceptance Criteria

- Short Director must output hook, pacing, workflow, review, and safe-zone guidance without network/provider calls.
- UI contracts must expose Short Director workflow, hook, pacing, reference, and review-gate guidance so frontend clients do not reimplement backend decision rules.
- Long Director must output story, continuity, checkpoint, and repair guidance without network/provider calls.
- Review policy must remain explicit and compatible with existing scene/audio/caption/claim checkpoints.
- Production code must not import from `external/upstream/openmontage`.

## Validation

- TypeScript typecheck must pass.
- Short pipeline smoke must pass.
- Long-form planning validations should continue to pass.
- Public reports must not leak raw URLs, local paths, credentials, or upstream implementation details.
