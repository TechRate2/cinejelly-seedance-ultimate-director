# Live Readiness Input Validator

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js validator, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Before running any live network or paid Atlas validation, operators need a single local report that says whether the real inputs are ready: deployment URL and token, operator attestations, Atlas billing/budget readiness, source-video URL, remote stock provider approvals, generated-audio capability config, and long-form budget.

## Rules

1. The validator must not call Atlas, stock provider APIs, deployment endpoints, source-video URLs, FFmpeg, render routes, or billing/payment APIs.
2. The validator must not expose `.env` values, provider keys, bearer tokens, signed URLs, or local-only artifact paths.
3. The validator is not business-readiness evidence and must not make any customer traffic gate pass by itself.
4. A clean HTTPS URL means HTTPS, non-localhost, no embedded credentials, no query string, and no fragment.
5. Long-form budget checks must use configured `CINEJELLY_RENDER_COST_USD_PER_SECOND` and `CINEJELLY_COST_BUFFER_MULTIPLIER`.
6. Generated-audio budget checks must use configured `ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS`, defaulting to the documented local validation rate when absent.
7. If any no-spend input gate is blocked, the report must recommend deferring Atlas paid spend.
8. Paid Atlas gates must remain blocked while the local Atlas billing-readiness report is missing, failing, or outside the approved validation budget.
9. Paid Atlas gates must also remain blocked when the local Atlas billing-readiness report was captured for a different `maxBudgetUsd` or `plannedCostUsd` than the current live-input cost plan.

## Report Shape

```ts
interface LiveReadinessInputsReport {
  schemaVersion: "cinejelly.live-readiness-inputs.v1";
  generatedAt: string;
  status: "blocked_by_missing_inputs" | "ready_for_live_validation_sequence";
  noSpend: true;
  networkCallsMade: false;
  providerCallsMade: false;
  checkedInputs: Record<string, unknown>;
  environment: Record<string, unknown>;
  costPlan: {
    maxBudgetUsd: number;
    knownPaidEstimateUsd: number;
    budgetFit: "within_budget" | "exceeds_budget" | "unknown";
  };
  gates: Array<{
    name: string;
    kind: "no_spend" | "no_spend_network" | "live_network" | "paid_atlas_llm_and_source_fetch" | "paid_atlas_audio" | "paid_atlas_video";
    status: "ready" | "blocked";
    checks: Array<{ name: string; status: "pass" | "fail"; message: string }>;
    estimatedCostUsd?: number;
  }>;
  releaseGateSummary: {
    canRunDeploymentReadinessCapture: boolean;
    canRunBillingAdminOpsCapture: boolean;
    canRunProductionOpsCapture: boolean;
    canRunSourceVideoPaidValidation: boolean;
    canRunRemoteStockProviderValidation: boolean;
    canRunGeneratedAudioPaidValidation: boolean;
    canRunLongFormWithinBudget: boolean;
    shouldDeferAtlasSpend: boolean;
    canReleaseToCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## Delivered Implementation

- Done: add `scripts/validate-live-readiness-inputs.mjs`.
- Done: add `npm.cmd run validation:live-inputs`.
- Done: add `schemas/live-readiness-inputs-report.schema.json`.
- Done: document the validator in `README.md`, `docs/OPERATOR_RUNBOOK.md`, `docs/IMPLEMENTATION_ROADMAP.md`, and `docs/PROJECT_CONTEXT.md`.

## Acceptance Checks

- Running the validator performs no network, provider, render, FFmpeg, or billing calls.
- The report exposes only booleans, counts, redacted safe URL previews, and cost estimates.
- The current 120s long-form validation remains blocked under a `$5` ceiling when the configured estimate is `$24`.
- The report can show generated-audio technical inputs are present, but it must keep generated-audio paid validation blocked while Atlas billing readiness or the approved-budget fit fails.
- Changing `CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD` makes the live-input report request a fresh Atlas billing readiness probe before any paid Atlas gate can pass.
