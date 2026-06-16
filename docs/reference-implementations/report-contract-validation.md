# Report Contract Validation

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js report/schema validator, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

CineJelly has many release and business-readiness reports. Operators need a single local check that catches schema drift before a report is used as release evidence or handed to a customer/operator.

## Rules

1. The validator must not call Atlas, stock provider APIs, deployment endpoints, source-video URLs, FFmpeg, render routes, or billing/payment APIs.
2. The validator must not read `.env` or expose provider keys, bearer tokens, signed URLs, customer media, or local-only artifact paths.
3. The validator validates schema shape only; it must not turn blocked business evidence into a pass.
4. Default report contracts are skipped only when a report file is absent; custom `--contract` and `--only-contract` inputs are required.
5. The validator should support the local schema features used by CineJelly reports: `type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`, min/max constraints, string patterns, `date-time`/`uri` formats, local `$ref`, `allOf`, `anyOf`, `oneOf`, `not`, and basic `if`/`then`.

## Delivered Implementation

- Done: add `scripts/validate-report-contracts.mjs`.
- Done: add `npm.cmd run validation:report-contracts`.
- Done: add `schemas/phase6-release-audit-report.schema.json`.
- Done: add `schemas/report-contract-validation-report.schema.json`.
- Done: validate current release/business-readiness reports and catch generated-audio boolean redaction drift.
- Done: fix report redaction helpers so boolean/count fields with key-like names are not replaced with strings.

## Acceptance Checks

- `node scripts/validate-report-contracts.mjs` reports `status: pass` for the current release-candidate report set.
- The generated report says schema-shape pass is not customer-traffic approval.
- Existing blocked reports can pass schema validation while still preserving their blocked/fail business status.
- Report redaction still removes string secrets but preserves boolean readiness fields such as `apiKeyConfigured`.
