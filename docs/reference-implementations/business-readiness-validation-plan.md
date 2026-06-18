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
8. Each paid Atlas step must remain blocked while its relevant Atlas billing readiness or approved-budget fit fails; full-sequence approval must remain blocked while the full known paid estimate exceeds the approved budget.
9. The default approved budget must come from `CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD` when it is configured so the planner, live-input validator, and Atlas billing gate agree on the same operator-approved ceiling.
10. A stored Atlas billing readiness report must be treated as stale when its captured `maxBudgetUsd` or `plannedCostUsd` differs from the current plan; stale billing evidence cannot unlock paid Atlas validation.
11. A stored Atlas billing readiness report must also be treated as stale when it is older than `CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS`, defaulting to 24 hours.
12. When the full known paid estimate exceeds the approved budget, the planner must still show no-spend budget-constrained slices so operators can intentionally choose a narrower paid validation run without treating it as full release evidence.
13. Narrow paid slices must include a separate Atlas billing-readiness command with `--planned-cost-usd` and a slice-specific output path so they do not overwrite the full-plan billing evidence.
14. Generated-audio paid planning must separate provider execution from manual listening review: the provider command must not include `--confirm-manual-audio-review`, and the plan must point operators to `validation:generated-audio-review-draft` plus `--review-existing-report --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review` for the no-provider review update after output inspection.
15. Generated-audio paid commands must pass the same validation text, cost rate, local max-cost cap, and slice billing report path used by the planner so the paid runner cannot silently use different cost assumptions.
16. A passing `ops/commercial-launch-intake.json` can feed missing deployment/source-video URLs, source-video enablement, remote-stock provider intent, and budget ceiling into the no-spend plan, while the planner must surface a `commercial_launch_intake_precheck` step until that intake passes.
17. Full-sequence budget readiness must be false when required cost estimates are incomplete; a missing long-form estimate must produce `budgetFit="unknown"` and a full-sequence slice status of `unknown_cost`, not `within_budget`.
18. Report-contract validation must verify the budget-constrained paid-slice names, status math, ready paid-gate counts, and `fullKnownPaidSequenceWithinBudget` semantics so stale planner output cannot look release-safe.

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
    knownPaidEstimateComplete: boolean;
    missingCostEstimateItems: string[];
    budgetFit: "within_budget" | "exceeds_budget" | "unknown";
    budgetConstrainedSlices: {
      maxBudgetUsd: number;
      knownPaidEstimateUsd: number;
      fullKnownPaidSequenceWithinBudget: boolean;
      recommendedSliceName?: string;
      slices: Array<{
        name: string;
        kind: "paid_atlas_audio" | "paid_atlas_video" | "paid_atlas_full_sequence" | "paid_atlas_llm_and_source_fetch";
        status: "within_budget" | "blocked_by_budget" | "unknown_cost";
        maxBudgetUsd: number;
        estimatedCostUsd?: number;
        billingReadinessCommand?: string;
        command: string;
        prerequisites: string[];
        limitations: string[];
      }>;
    };
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
    readyPaidGates: string[];
    readyPaidGateCount: number;
    shouldDeferFullSequenceSpend: boolean;
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
- Done: add report-contract semantic validation for business-plan paid-slice budget math and full-sequence readiness flags.
- Done: document the planner in `README.md`, `docs/OPERATOR_RUNBOOK.md`, `docs/IMPLEMENTATION_ROADMAP.md`, and `docs/PROJECT_CONTEXT.md`.

## Acceptance Checks

- Running the planner with no deployment/source-video URLs does not perform network or provider calls.
- Planner output redacts secret-like strings and reports only booleans/counts for key-bearing env configuration.
- Current long-form validation is blocked by the configured budget when the estimate exceeds the approved ceiling.
- Current generated-audio validation can be ready when its slice-specific Atlas billing report is fresh, passing, and within budget, even while full-sequence Atlas billing remains blocked by the approved ceiling.
- Overriding `CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD` changes the planner default `maxBudgetUsd` without requiring a CLI flag.
- When the approved budget changes, planner output names the stored Atlas billing report as stale until `validation:atlas-billing -- --max-budget-usd <current-budget> --confirm-live-network` refreshes it.
- When the Atlas billing report is older than the configured max age, planner output keeps paid steps blocked until `validation:atlas-billing -- --confirm-live-network` refreshes it.
- With the default `$5` ceiling, planner output names generated-audio smoke as the only known paid slice inside budget while keeping long-form and the full known paid sequence blocked.
- If the long-form cost rate is missing, planner output must mark the full paid sequence as `unknown_cost` and `fullKnownPaidSequenceWithinBudget=false`.
- Report-contract validation must fail if `budgetConstrainedSlices` drops a required slice, duplicates a slice name, disagrees with `budgetFit`, or reports ready paid gates that do not match ready paid validation steps.
- Generated-audio smoke includes a no-spend Atlas billing probe command using `--planned-cost-usd` and `atlas-billing-generated-audio-smoke-report.json`, leaving the canonical full-plan billing report untouched.
- Generated-audio paid commands are provider-only first, explicitly reference `atlas-billing-generated-audio-smoke-report.json`, carry the planned validation text and rate assumptions, then tell operators to apply manual listening review with `--review-existing-report` so review does not call Atlas again.
- Planner output includes `commercial_launch_intake_precheck` and records `checkedInputs.launchIntake*` plus `environment.launchIntake` so missing operator intake is visible before live network or paid Atlas commands.
- Planner output says it is not release evidence and cannot release customer traffic.
