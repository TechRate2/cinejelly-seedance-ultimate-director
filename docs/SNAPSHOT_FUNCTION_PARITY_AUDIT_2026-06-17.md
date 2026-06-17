# Snapshot Function Parity Audit - 2026-06-17

## Purpose

This audit is the strict baseline for comparing the current CineJelly implementation with the local upstream snapshots under `external/upstream/`.

Percentages in this file are evidence-based engineering estimates, not marketing claims. They describe implemented and locally validated behavior, not full commercial launch readiness.

## Scope Reviewed

- `src/`
- `scripts/`
- `schemas/`
- `docs/`
- `docs/reference-implementations/`
- `external/upstream/`
- Current validation reports written under the local Phase 6 output directory

This audit does not claim new paid Atlas evidence, live source-video evidence, live remote-stock evidence, live generated-audio evidence, or production-host deployment evidence.

## Current Practical Status

| Area | Practical status | Current estimate |
| --- | --- | ---: |
| First-party web UI | Not implemented. The repo exposes API/CLI/operator reports and `/v1/render-settings` for a future UI, but no product web app exists yet. | 0% |
| API and CLI runtime foundation | Implemented across render admission, async jobs, optional compact job-history persistence with stale-active recovery, provider checkpoint, reconciliation, local handoff, and HTTPS external lease adapter audit evidence, readiness endpoints, provider abstraction, artifacts, quotas, validation commands, and one-command launch doctor orchestration. | 89-92% |
| Source-logic translation foundation | Strong TypeScript foundation with Reference Implementations, source lineage records, and local validation for priority modules. | 78-82% |
| Snapshot feature parity across all upstreams | Mixed. VibeFrame/MoneyPrinterTurbo/Seedance foundations are strongest; VideoAgent/OpenMontage/DirectorBench parity is partial. | 60-65% |
| Full commercial/customer readiness | Blocked until deployment, long-form, source-video, remote stock, generated audio, billing/admin, production ops, paid validation, and manual review evidence are complete. | 38% |

## Snapshot Parity By Source

| Upstream snapshot | Main upstream capability being compared | Implemented CineJelly coverage | Current parity estimate | Main gaps |
| --- | --- | --- | ---: | --- |
| `Emily2040/seedance-2.0` | Intent-first Seedance workflow, reference roles, prompt handoff, and QC discipline. | Prompt Compiler, reference roles, provider-aware reference filtering, Consistency Guardian preflight, Atlas provider request path, and Source Logic Translation records. | 78% | Full skill/workflow ecosystem parity, more live prompt/reference validation against Atlas, and operator-facing UI are still missing. |
| `YouMind-OpenLab/awesome-seedance-2-prompts` | Prompt anatomy, timing, camera, motion, audio, and negative constraint patterns. | Generalized prompt structure, prompt sections, negative constraints, repair hints, and source-derived prompt ordering without hardcoding niche templates. | 72% | Exact prompt corpus bundling still needs license/attribution/product review; prompt quality still needs broader live artifact evidence. |
| `HKUDS/ViMax` | Multi-agent long-form planning, storyboard, reference selection, consistency, and long-form decomposition. | Production Graph, long-form planning foundation, storyboard planner, reference selection scoring, consistency checks, chunk gates, and validation runners. | 70% | Full RAG/multi-agent framework parity is not implemented; real 2-8 minute Atlas validation and manual review remain pending. |
| `vericontext/vibeframe` | Validate-before-spend, deterministic artifacts, cost gates, review reports, and repair loop discipline. | Strongly translated into readiness gates, render request validation, cost ledger, deterministic artifacts, review packet, repair provenance, and release/business audits. | 85% | Needs more production-host evidence, live provider terminal-state evidence, and production operations proof. |
| `HKUDS/VideoAgent` | Video understanding, intent decomposition, graph-powered tool planning, and VideoRAG-style analysis. | Source Video Analyst, source-video metadata enrichment, opt-in frame sampling, Atlas LLM auto-analysis gate, and business-readiness validation runner. | 60% | Full VideoRAG/tool-graph parity is not implemented; live source-video run with a real clean HTTPS video is still pending. |
| `calesthio/OpenMontage` | Source media review, approval gates, provider scoring, real-footage path, and self-review. | Approval-gate concepts, material validation, source-video guardrails, Guardian/delivery checks, and AGPL-aware behavior notes. | 55% | Direct code reuse is intentionally avoided because of AGPL boundaries; full provider scoring and real-footage workflow parity are not implemented. |
| `harry0703/MoneyPrinterTurbo` | One-input staged pipeline, task progress, material sourcing, subtitles/TTS/BGM, API/CLI/WebUI operations. | One-input render pipeline, stage progress, compact job-history persistence with stale-active recovery plus provider checkpoint/reconciliation/handoff evidence, HTTPS external lease adapter contract, material sourcing, postproduction planning, generated-audio gates, API/CLI, async jobs, quotas, and artifact evidence. | 84% | WebUI is absent, deployed durable queue-backed active provider-work resume/handoff is not implemented, and live TTS/BGM/generated-audio validation remains pending. |
| `jiaminchen-1031/DirectorBench` | Checkpoint evaluation for script, visual, audio, cross-modal, stability, transition, and quality. | DirectorBench ideas influence Guardian checks, long-form quality gates, artifact validation, and manual-review expectations. | 25% | No full DirectorBench-style benchmark harness exists; license ambiguity keeps this mostly at planning/evaluation-influence level. |

## Functional Coverage Reality Check

| Function family | Current reality | Estimate |
| --- | --- | ---: |
| Prompt and reference binding | Implemented and integrated; live Atlas prompt/reference quality evidence is still limited. | 80% |
| Production Graph and storyboard planning | Implemented foundation with graph, storyboard, source lineage, stage lifecycle, and artifacts. | 75% |
| Atlas media provider path | Implemented and previously validated with a short paid text-to-video run; broader terminal-state and long-form evidence remain pending. | 75% |
| Atlas LLM/source-video path | Implemented as an opt-in gated path; real source-video evidence is pending. | 60% |
| Generated audio path | Provider-neutral and Atlas execution plumbing exists behind gates; paid output validation and manual review are pending. | 65% |
| Remote stock/material sourcing | Local and opt-in remote adapter foundations exist; live provider validation is pending. | 65% |
| Long-form 2-8 minute workflow | Chunking, admission, budget, artifact, and validation runner foundations exist; real paid long-form proof is pending. | 65% |
| API/customer access controls | Auth, rate limits, body limits, client policy, quota reservation, usage ledger, async job scoping, optional compact job history with stale-active recovery and provider checkpoint/reconciliation/handoff evidence, HTTPS external lease adapter validation, admin diagnostics, and launch-doctor command orchestration exist. | 89% |
| Deployment and production operations | Container/static package checks and evidence capture commands exist; real HTTPS host, storage, backups, monitoring, support, and retention evidence are missing. | 45% |
| Web UI | No first-party frontend product exists in the repo. | 0% |

## What The Repo Has Now

- Production TypeScript runtime, provider layer, API, optional compact async job history with stale-active recovery plus provider checkpoint/reconciliation/handoff evidence, HTTPS external lease adapter validation, CLI validation commands, schemas, Reference Implementations, source lineage, and operator runbooks.
- Local release hygiene and report-contract validation commands.
- A previous short paid Atlas text-to-video evidence run for Phase 6 smoke validation.
- Business-readiness audit that intentionally remains blocked until real launch evidence exists.
- Business-completion audit that separates API/CLI schema blockers from product-code gaps and reports `canClaimFullSnapshotParity=false` while Web UI, deployed durable queue-backed active provider-work resume/reconciliation/handoff, or benchmark harness gaps remain.
- No first-party web UI.
- No claim of 100% parity with any upstream snapshot.

## What Must Happen Next For Commercial Launch

1. Capture real HTTPS deployment evidence with `/health`, `/v1/preflight`, `/v1/validation-readiness`, and `/v1/render-settings`.
2. Provide passing billing/admin/quota and production-operations attestations.
3. Approve a budget that covers the full validation sequence, or intentionally run only the narrow ready slice inside the current budget.
4. Run long-form 2-8 minute paid Atlas validation and manually review artifacts.
5. Run live source-video auto-analysis validation with a clean HTTPS source video.
6. Run live remote stock provider validation with approved commercial provider terms and keys.
7. Run live Atlas generated-audio validation with schema review, output validation, and manual review.
8. Decide whether to build a first-party UI or ship API/CLI only.
9. Keep updating this parity audit when source-derived behavior materially changes.

## GitHub Update Discipline

From this audit forward, every code or documentation change should follow this sequence:

1. Inspect the worktree and avoid staging unrelated user changes.
2. Run validation appropriate to the blast radius.
3. Commit with a focused message.
4. Push the updated branch to GitHub.
5. Verify that the local branch is no longer ahead of the tracked remote.

If network, authentication, or repository permissions prevent a push, the final response for that turn must say so explicitly. The project should not be reported as fully updated on GitHub until the push state is verified.

## Verdict

CineJelly is not just a skeleton. The backend/runtime/operator foundation is substantial and source-traceable. The strongest areas are VibeFrame-style validation discipline, Seedance prompt/reference handling, MoneyPrinterTurbo-style staged pipeline foundations, and API/operator validation gates.

The biggest current truth is also simple: business-ready completion is still about 38%, mostly because commercial launch requires external evidence, paid validation, manual review, production-host operations, and a UI decision. The repo is ready for strict validation-led completion work, not for a 100% parity or customer-traffic claim yet.
