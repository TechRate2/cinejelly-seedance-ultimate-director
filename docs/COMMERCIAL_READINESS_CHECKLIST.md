# Commercial Readiness Checklist

This checklist defines the commercial-core bar before CineJelly can accept customer traffic. It is intentionally stricter than a green build or a short paid render.

## Current Gate

Status on 2026-06-19: backend hygiene and report contracts pass, but full commercial readiness remains blocked by external evidence, paid validation, manual review, deployment operations, and product-scope decisions.

## Core Backend

- [x] TypeScript build passes.
- [x] No tracked secrets in source/doc/schema files.
- [x] API auth, rate limiting, body-size limits, and client policy gates exist.
- [x] Async render job queue, polling, cancel, idempotency, and quota reservation exist.
- [x] Artifact validation and redacted public API responses exist.
- [x] Report contract validation exists.
- [x] Review/approval primitive exists for scene, audio, caption, and claim gates.
- [ ] Review/approval is wired into API job lifecycle as persisted `pause -> review -> approve/reject` state.

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

- [ ] Product URL-to-video extraction produces safe product facts and claim checkpoints.
- [ ] Optional workflow template registry exists without forcing templates.
- [ ] Brand kit backend exists and influences planning/validation.
- [ ] Natural-language short pipeline can propose concept, script, scene plan, and review checkpoints.
- [ ] Human-in-the-loop review can revise or approve plan before render.

## Evidence Commands

Run these before any commercial claim:

```powershell
npm.cmd run build
npm.cmd run validation:report-contracts
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
```

## Release Rule

Do not open paid customer traffic until:

1. `validation:business-readiness` is ready for customer traffic.
2. Paid long-form/source-video/generated-audio evidence is accepted as applicable to the launch scope.
3. Deployment, billing/admin, and production operations evidence pass.
4. Manual review evidence is artifact-bound and redaction-safe.
5. Product scope is explicitly recorded.
