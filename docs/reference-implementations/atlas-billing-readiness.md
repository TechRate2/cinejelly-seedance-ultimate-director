# Atlas Billing Readiness

Implementation status as of 2026-06-16: implemented as a CineJelly-owned Atlas Billing Public API readiness validator, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Before running additional paid Atlas validation, operators need to know whether the configured Atlas key can read account billing data and whether the currently planned paid validation cost fits the approved budget and available account balance.

## Rules

1. The default command must be local-only and must not call Atlas until `--confirm-live-network` is present.
2. The live-network path may call only Atlas Billing Public API `/balance`; it must not call model, upload, prediction, image, video, audio, stock, deployment, render, or payment-provider endpoints.
3. The report must never print Atlas secret key values.
4. A billing-readiness pass is pre-paid-spend evidence only; it must not mark business readiness or customer traffic as approved.
5. The validator should prefer `ATLASCLOUD_BILLING_API_KEY` when present and fall back to `ATLASCLOUD_API_KEY` for operators who use one Atlas pay-as-you-go key.

## Delivered Implementation

- Done: add `scripts/validate-atlas-billing-readiness.mjs`.
- Done: add `npm.cmd run validation:atlas-billing`.
- Done: add `schemas/atlas-billing-readiness-report.schema.json`.
- Done: compare the current business-plan known paid estimate against `--max-budget-usd`.
- Done: support a no-spend live-network `/balance` probe behind `--confirm-live-network`.
- Done: make `validation:business-readiness` require this report as a hard pre-paid-spend gate with zero completion weight.
- Done: keep business-readiness paid-validation summary flags false while this report fails.

## Acceptance Checks

- Running without `--confirm-live-network` writes `cinejelly.atlas-billing-readiness.v1` with `status: blocked_by_network_confirmation` and `networkCallsMade: false`.
- Running with `--confirm-live-network` calls only `https://api.atlascloud.ai/public/v1/balance`.
- The generated report redacts key-like string values and records only safe key metadata such as configured env name and `apikey-` prefix validity.
- A pass still reports `canReleaseToCustomerTraffic: false`.
- Business-readiness stays blocked when this report is missing or fails, but the evidence-completion percentage is not inflated by this pre-spend guard.
