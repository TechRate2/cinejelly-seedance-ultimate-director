# Commercial Readiness Checklist
> ⚠️ **TÀI LIỆU THIẾT KẾ — KHÔNG PHẢI MÔ TẢ CODE HIỆN TẠI.**
> Cập nhật lần cuối: **2026-07-02**. Từ đó tới nay mã nguồn đã đổi rất nhiều.
> Đọc [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md) để biết dự án HIỆN TẠI ra sao.
> Khi tài liệu này mâu thuẫn với code, **code đúng** — tài liệu là cái sai.


This checklist defines the commercial-core bar before CineJelly can accept customer traffic. It is intentionally stricter than a green build or a short paid render.

## Current Gate

Status on 2026-06-26: backend hygiene, Short evidence draft handoffs, and report contracts pass when the local validation suite is green, but full commercial readiness remains blocked by external evidence, paid validation, manual review, deployment operations, and product-scope decisions.

## Core Backend

- [x] TypeScript build passes.
- [x] No tracked secrets in source/doc/schema files.
- [x] API auth, rate limiting, body-size limits, and client policy gates exist.
- [x] Async render job queue, polling, cancel, idempotency, and quota reservation exist.
- [x] Workspace/project billing foundation exists with opt-in workspace policy, project policy, credit ceiling, quota reservation, and safe usage ledger.
- [x] Docker image plus docker compose/Caddy HTTPS deployment package exists and is covered by no-spend package validation.
- [x] Artifact validation and redacted public API responses exist.
- [x] Report contract validation exists.
- [x] Review/approval primitive exists for scene, audio, caption, and claim gates.
- [x] Async pre-render review/approval is wired into API job lifecycle as `pause -> review -> approve/reject`, with quota reservation deferred until approval.
- [x] Async pre-export review/approval is wired after artifact validation so retained artifacts can pause for artifact-bound evidence and be approved for export without rerendering or reserving spend again.
- [x] No-spend agentic short-pipeline planning foundation exists with product URL fingerprinting, optional template suggestions, brand-kit guardrails, and scene/audio/caption/claim review checkpoints.
- [x] No-spend short-pipeline conversation backend exists for natural-language turns, revision tracking, optional-template rejection, approval-intent detection, and raw transcript redaction.
- [x] No-spend durable Short Studio session/style stores default under `CINEJELLY_OUTPUT_DIR`, can be overridden by explicit store paths, and keep atomic writes, client-scoped reads, and redaction checks for raw transcript, URLs, local paths, and secret-like values.
- [x] No-spend short-pipeline session render handoff exists so a stored session can create a paused/blocked async render job only through server-side plan retrieval, rejection of client-side plan replacement, formal review evidence, client scope, and explicit spend confirmation.
- [x] No-spend Product URL-to-Video backend extraction can parse bounded public HTML behind explicit live-network confirmation, feed safe product facts into short-pipeline planning, and emit schema-validated redaction evidence without provider spend.
- [x] No-spend Short review-operation and product-rights operator draft/checklist handoffs exist, and direct template use is rejected by the accepted-packet validators.
- [x] No-spend Short Viral/Niche Intelligence backend exists with TikTok/Douyin-first strategy, concept scoring, scene directives, reference-video pattern learning, originality guardrails, and render-handoff prompt metadata before provider spend.
- [x] No-spend Long Creative Intelligence backend exists with story bible, niche/viral strategy, shot-level quality directives, multi-candidate guidance, auto-repair directives, and audio/caption QA before provider spend.
- [ ] First-party UI review screens and accepted artifact-bound manual media review are completed for the first commercial launch scope.

## Paid Provider Evidence

- [x] Short paid Atlas render evidence exists for Phase 6 smoke validation.
- [ ] Paid 2-8 minute long-form validation passes with artifact-bound manual review.
- [ ] Live source-video auto-analysis passes with a clean HTTPS source video and approved Atlas LLM budget.
- [ ] Live remote stock provider validation passes with reviewed commercial terms.
- [ ] Generated-audio manual listening review is accepted and bound to artifact evidence.
- [ ] Live provider action evidence and graph-resume enqueue evidence are archived from a real deployment.

## Commercial Operations

- [ ] Real HTTPS deployment URL is validated.
- [ ] Billing/admin/quota attestation is filled and accepted.
- [ ] Production operations attestation is filled and accepted.
- [ ] Storage, backup, restore, monitoring, incident response, support, redaction, and retention evidence are captured.
- [ ] Customer traffic remains blocked until business-readiness audit reports ready.

## Product Scope

- [ ] Decide whether the first commercial release is API/CLI/operator-report only or requires first-party UI.
- [ ] If UI is required, build Create Video, Job Monitor, Review and Export, and Admin Settings first.
- [ ] If API/CLI-only is chosen, document the scope explicitly in commercial launch intake.

## Short Pipeline

- [x] Product URL-to-video extraction produces safe product facts and claim checkpoints in the no-spend backend smoke.
- [x] Optional workflow template registry exists without forcing templates.
- [x] Brand kit backend exists and influences planning/validation.
- [x] Natural-language short pipeline can propose concept, script, scene plan, and review checkpoints.
- [x] Short Viral/Niche Intelligence can infer niche, buyer intent, platform focus, creative mode, viral levers, concept scores, and per-scene quality directives for TikTok/Douyin-first UGC, review, ad, demo, and product shorts.
- [x] Reference-video learning can store redacted pattern fingerprints and adapt hook, pacing, caption, camera, audio, retention, and CTA structure without copying source script, assets, identities, claims, or brand marks.
- [x] Natural-language conversation backend can accept multi-turn brief/revision/approval-intent messages without storing raw transcript in public evidence.
- [x] Durable conversation sessions can be persisted and reloaded for future UI continuity without weakening client isolation or formal review gates.
- [x] Durable conversation sessions can hand off into async render-job review lifecycle without accepting a client-side replacement plan or bypassing explicit render confirmation.
- [x] `video-db/Director` snapshot and Director Agentic Media Reasoning baseline are captured for chat/workflow parity tracking.
- [x] Human-in-the-loop review checkpoints are emitted before render.
- [x] No-spend operator draft/checklist helpers exist for accepted Short review-operation evidence and accepted product-facts/media-rights evidence.
- [ ] Accepted live Short create/review operation evidence is archived from a real deployment. The no-spend draft, validator, unsafe-note guard, and launch-doctor status are implemented; an operator-supplied accepted live packet is still required.
- [ ] Live product URL crawling/extraction, accepted product facts, and rights-reviewed product media are proven on real URLs. The no-spend accepted product-facts/media-rights draft, validator, unsafe-note guard, and launch-doctor status are implemented; an operator-supplied accepted live packet is still required.
- [x] Short-pipeline accepted review handoff is wired into async render-job submission.
- [ ] Live short-pipeline render validation is proven with approved review evidence, explicit spend confirmation, artifact validation, and manual media review.
- [ ] First-party chat/review UI and media-library evidence are implemented before claiming Director-style product parity.

## Evidence Commands

Run these before any commercial claim:

```powershell
npm.cmd run build
npm.cmd run validation:deployment-package
npm.cmd run validation:report-contracts
npm.cmd run validation:render-job-review-lifecycle
npm.cmd run validation:workspace-billing
npm.cmd run validation:long-form-creative-intelligence
npm.cmd run validation:short-viral-intelligence
npm.cmd run validation:short-pipeline-conversation
npm.cmd run validation:short-pipeline-session-store
npm.cmd run validation:short-pipeline-session-render-handoff
npm.cmd run validation:short-pipeline
npm.cmd run validation:product-url-extraction
npm.cmd run validation:short-review-operation-draft -- --force
npm.cmd run validation:short-review-operation-guard
npm.cmd run validation:short-product-rights-draft -- --force
npm.cmd run validation:short-product-rights-guard
npm.cmd run validation:release-audit
npm.cmd run validation:business-readiness
npm.cmd run validation:completion-audit
```

Run these after deployment/operator evidence is available:

```powershell
npm.cmd run validation:deployment-readiness -- --base-url https://<your-cinejelly-host>
npm.cmd run validation:billing-admin-ops -- --base-url https://<your-cinejelly-host> --attestation ops/billing-admin-attestation.json
npm.cmd run validation:production-ops -- --base-url https://<your-cinejelly-host> --attestation ops/production-operations-attestation.json
npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions
npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues
npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation
npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights
```

## Release Rule

Do not open paid customer traffic until:

1. `validation:business-readiness` is ready for customer traffic.
2. Paid long-form/source-video/generated-audio evidence is accepted as applicable to the launch scope.
3. Deployment, billing/admin, and production operations evidence pass.
4. Manual review evidence is artifact-bound and redaction-safe.
5. Product scope is explicitly recorded.
