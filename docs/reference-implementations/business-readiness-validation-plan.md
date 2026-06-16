# Business Readiness Validation Plan

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js planning script, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Before spending more Atlas credits, operators need one consolidated plan that explains which commercial evidence gates are already archived, which inputs are missing, which commands are safe/no-spend, and which live or paid steps require explicit approval plus Atlas billing/budget readiness.

## Rules

1. The planner must not call Atlas, stock provider APIs, deployment endpoints, FFmpeg, render routes, or billing/payment APIs.
2. The planner must not expose `.env` values, provider keys, bearer tokens, signed URLs, or local-only artifact paths.
3. The planner is not business-readiness evidence and must not make any gate pass by itself.
4. Paid Atlas commands must remain explicit and must include budget/confirmation flags only as planned next steps.
5. Long-form cost planning must use the same configured `CINEJELLY_RENDER_COST_USD_PER_SECOND` and `CINEJELLY_COST_BUFFER_MULTIPLIER` assumptions as the long-form validation runner.
6. Generated-audio planning must require configured model, voice, reviewed capability JSON shape, and the configured Atlas generated-audio rate, defaulting to the documented `xai/tts-v1` rate when absent.
7. Remote stock, source-video, deployment, billing/admin, and production-ops readiness must be represented as missing inputs or ready commands, not silently skipped.
8. Paid Atlas steps and top-level paid-validation flags must remain blocked while Atlas billing readiness or the approved-budget fit fails, even if one narrow paid sample is individually inexpensive.

## Report Shape

```ts
interface BusinessReadinessValidationPlan {
  schemaVersion: "cinejelly.business-readiness-validation-plan.v1";
  generatedAt: string;
  status: "blocked_by_missing_inputs" | "blocked_by_budget_or_sequence" | "ready_for_paid_sequence";
  noSpend: true;
  checkedInputs: Record<string, unknown>;
  currentBusinessReadiness: {
    present: boolean;
    status: string;
    evidenceCompletionPercent: number;
    failingChecks: string[];
  };
  environment: Record<string, unknown>;
  costPlan: {
    maxBudgetUsd: number;
    knownPaidEstimateUsd: number;
    budgetFit: "within_budget" | "exceeds_budget" | "unknown";
  };
  validationSequence: Array<{
    name: string;
    kind: "no_spend" | "no_spend_network" | "live_network" | "paid_atlas_llm_and_source_fetch" | "paid_atlas_audio" | "paid_atlas_video";
    status: "ready" | "blocked" | "needs_operator_input";
    command: string;
    requiredInputs?: string[];
    estimatedCostUsd?: number;
    notes: string[];
  }>;
  releaseGateSummary: {
    canRunSomePaidValidationNow: boolean;
    canRunLongFormWithinBudget: boolean;
    shouldDeferAtlasSpend: boolean;
    canReleaseToCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## Delivered Implementation

- Done: add `scripts/plan-business-readiness-validation.mjs`.
- Done: add `npm.cmd run validation:business-plan`.
- Done: add `schemas/business-readiness-validation-plan.schema.json`.
- Done: document the planner in `README.md`, `docs/OPERATOR_RUNBOOK.md`, `docs/IMPLEMENTATION_ROADMAP.md`, and `docs/PROJECT_CONTEXT.md`.

## Acceptance Checks

- Running the planner with no deployment/source-video URLs does not perform network or provider calls.
- Planner output redacts secret-like strings and reports only booleans/counts for key-bearing env configuration.
- Current long-form validation is blocked by the configured budget when the estimate exceeds the approved ceiling.
- Current generated-audio validation is blocked by Atlas billing readiness when the full paid sequence exceeds the approved ceiling, and is blocked earlier when model, voice, or reviewed capability JSON shape is incomplete.
- Planner output says it is not release evidence and cannot release customer traffic.
