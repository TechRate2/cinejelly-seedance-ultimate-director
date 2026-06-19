# Workspace Project Billing Foundation

## Purpose

This foundation adds an opt-in commercial boundary above client API keys. Client policy answers "which key can render and how much can that key reserve"; workspace billing answers "which customer workspace and project owns this render, what credit/quota applies, and what usage evidence should survive restart."

It is intentionally not a payment-provider integration. Stripe, Paddle, invoices, refunds, tax, support, and account lifecycle still require the billing/admin operations attestation and production evidence gates.

## Runtime Contract

Render requests can include:

```json
{
  "metadata": {
    "workspaceId": "workspace-agency-a",
    "projectId": "project-product-launch"
  }
}
```

Workspace enforcement is configured by environment:

- `CINEJELLY_WORKSPACES_JSON`: JSON array of workspace policies.
- `CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER=true`: reject render requests without `metadata.workspaceId`.
- `CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH`: append-only JSONL reservation ledger.

Example policy:

```json
[
  {
    "workspaceId": "workspace-agency-a",
    "enabled": true,
    "displayName": "Agency A",
    "planId": "agency-growth",
    "clientIds": ["client-a"],
    "monthlyRequestLimit": 100,
    "monthlyReservedCostUsdLimit": 500,
    "maxReservedCostUsdPerRequest": 20,
    "defaultReservedCostUsdPerRequest": 3,
    "creditBalanceUsd": 500,
    "projects": [
      {
        "projectId": "project-product-launch",
        "enabled": true,
        "monthlyRequestLimit": 25,
        "monthlyReservedCostUsdLimit": 100,
        "maxReservedCostUsdPerRequest": 10,
        "defaultReservedCostUsdPerRequest": 2
      }
    ]
  }
]
```

## Reservation Semantics

- Missing or disabled workspace blocks when workspace enforcement is enabled.
- If a workspace lists `clientIds`, client API keys can only render for assigned workspaces.
- If a workspace lists `projects`, `metadata.projectId` must match an enabled project.
- `settings.maxCostUsd` is the preferred reservation amount.
- Project default reserved cost overrides workspace default reserved cost.
- Workspace and project monthly request/cost limits are checked before provider spend.
- Workspace credit balance is treated as a reserved-cost ceiling.
- Usage ledger records only safe identifiers and numeric reservation data. It does not store raw prompts, media, API keys, provider payloads, or local paths.

Async review-gated jobs are accepted only when workspace/project metadata is valid, but workspace usage is not reserved until the job is approved and actually queued for render.

## API Surfaces

- `GET /v1/admin/workspace-billing`: deployment-token-only, secret-free summary of workspace policies and current-month usage.
- `workspaceBillingReservation`: included in sync render responses and async job approval/submit responses only when a render reservation is actually made.

## Validation

Run:

```powershell
npm.cmd run validation:workspace-billing
```

The smoke proves workspace/project parsing, client membership, per-request limits, monthly quota, credit ceiling, JSONL ledger reload, required metadata rejection, and review-paused no-reservation behavior without external network calls or provider calls.

## Remaining Commercial Gates

- Real billing provider or contract workflow.
- Refund, tax, invoice, support, and account lifecycle procedures.
- HTTPS deployment evidence.
- Billing/admin operations attestation.
- Customer-facing UI for workspace/project selection and usage visibility.
