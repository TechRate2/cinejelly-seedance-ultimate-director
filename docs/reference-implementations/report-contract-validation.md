# Report Contract Validation

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js report/schema validator, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

CineJelly has many release and business-readiness reports. Operators need a single local check that catches schema drift before a report is used as release evidence or handed to a customer/operator.

## Rules

1. The validator must not call Atlas, stock provider APIs, deployment endpoints, source-video URLs, FFmpeg, render routes, or billing/payment APIs.
2. The validator must not read `.env` or expose provider keys, bearer tokens, signed URLs, customer media, or local-only artifact paths.
3. The validator validates schema shape plus explicitly documented report-local semantic invariants; it must not turn blocked business evidence into a pass.
4. Default report contracts are skipped only when a report file is absent; custom `--contract` and `--only-contract` inputs are required.
5. The validator should support the local schema features used by CineJelly reports: `type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`, min/max constraints, string patterns, `date-time`/`uri` formats, local `$ref`, `allOf`, `anyOf`, `oneOf`, `not`, and basic `if`/`then`.
6. `--allow-launch-doctor-in-progress` is reserved for the commercial launch doctor while it rewrites its own report across multiple contract-refresh passes; default report-contract validation must remain strict for completed launch-doctor reports.

## Delivered Implementation

- Done: add `scripts/validate-report-contracts.mjs`.
- Done: add `npm.cmd run validation:report-contracts`.
- Done: add `schemas/phase6-release-audit-report.schema.json`.
- Done: add `schemas/report-contract-validation-report.schema.json`.
- Done: validate current release/business-readiness reports and catch generated-audio boolean redaction drift.
- Done: fix report redaction helpers so boolean/count fields with key-like names are not replaced with strings.
- Done: validate optional budget-slice Atlas billing reports, such as generated-audio smoke billing readiness, when those reports exist.
- Done: validate optional deployment-readiness captures, including local smoke evidence, against the deployment capture schema when those reports exist.
- Done: validate optional Director-style structured semantic-review and audio-review input packets when those files exist.
- Done: fail the commercial launch inputs contract when its local `commandPlanAudit` is not `pass`, so stale or unsafe launch commands are caught before operators copy them into live or paid runs.
- Done: allow release-audit checks to carry redacted `findings` arrays so failed secret/import-boundary scans remain schema-valid and actionable.
- Done: validate commercial launch doctor semantic invariants so stale command coverage, skipped provider-smoke evidence, missing quality benchmark refresh, or missing final report-contract pass cannot hide behind a schema-shape pass.
- Done: give the commercial launch doctor an explicit in-progress contract mode so intermediate self-validation can pass while standalone/default validation stays strict for completed reports.

## Acceptance Checks

- `node scripts/validate-report-contracts.mjs` reports `status: pass` for the current release-candidate report set.
- The generated report says schema-shape pass is not customer-traffic approval.
- Existing blocked reports can pass schema validation while still preserving their blocked/fail business status.
- Report redaction still removes string secrets but preserves boolean readiness fields such as `apiKeyConfigured`.
- When `atlas-billing-generated-audio-smoke-report.json` exists, report-contract validation includes it against the Atlas billing readiness schema.
- When deployment-readiness capture reports exist, report-contract validation includes them and catches missing `atlasCloudDocsConformanceStatus` summary evidence.
- When `director-style-semantic-review.json` or `director-style-audio-review.json` exists, report-contract validation checks the structured review input schema before the quality benchmark consumes it.
- When `director-style-benchmark-report.json` exists, report-contract validation includes the artifact-contract benchmark schema and verifies it still reports `canClaimDirectorBenchParity=false`.
- When `commercial-launch-inputs-report.json` exists, report-contract validation requires `commandPlanAudit.status` to be `pass` with no command-plan issues.
- When release-audit checks include redacted findings, the schema accepts only primitive finding fields and still rejects unrelated report drift.
- When `commercial-launch-doctor-report.json` exists, report-contract validation requires the core launch-doctor command sequence, refreshed quality benchmark evidence, final report-contract pass, provider handoff smoke pass/warn statuses when enabled, and explicit skipped provider statuses when `--skip-provider-handoff-smokes` is used.
- When launch doctor calls report-contract validation before its final command has been appended, it must pass `--allow-launch-doctor-in-progress`; a normal standalone `validation:report-contracts` run must still reject incomplete final launch-doctor evidence.
