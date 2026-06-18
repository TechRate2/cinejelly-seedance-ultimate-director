# Reference Implementation: Business Readiness Audit

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js audit script, JSON schema, package command, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The audit does not call providers, create media, inspect media pixels, or spend Atlas credits.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Explicit operator-facing status reports before release decisions. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Practical production readiness discipline for video pipelines. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | MIT | Delivery evidence and artifact inspection discipline. |

## Behavior To Preserve

1. The audit must be no-spend and must never initialize Atlas providers.
2. Release hygiene, short paid-render evidence, and manual short-review evidence are necessary but not sufficient for full commercial release.
3. Full commercial-platform approval requires explicit evidence for deployment, Atlas billing readiness, long-form, source-video, remote stock, generated audio, billing/admin/quota controls, and production operations.
4. Missing evidence must fail closed with a clear next action.
5. Warnings must reduce the score and require explicit operator acceptance.
6. The report must be machine-readable, stable, and safe to archive with release evidence.
7. The completion percent is an evidence-completion score, not a claim that product code is feature-complete.
8. Atlas billing readiness evidence must match the current no-spend business-readiness validation plan's `maxBudgetUsd` and `knownPaidEstimateUsd`; stale billing evidence cannot unlock additional paid Atlas validation.
9. Atlas billing readiness evidence must be fresh enough for paid validation, using `CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS` with a default of 24 hours.
10. The audit must distinguish a narrow ready paid slice from the full paid sequence: `canRunSomePaidValidationNow` and `readyPaidGates` may be true while `shouldDeferFullSequenceSpend` and `canReleaseToCustomerTraffic` remain blocked.

## Reference Implementation

```ts
type BusinessReadinessStatus = "blocked" | "review_warnings" | "ready_for_limited_customer_traffic";

interface BusinessReadinessCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  weight: number;
  evidencePath: string;
  message: string;
}

interface BusinessReadinessReport {
  schemaVersion: "cinejelly.business-readiness-audit.v1";
  generatedAt: string;
  status: BusinessReadinessStatus;
  scope: "full_commercial_platform";
  completion: {
    completedWeight: number;
    totalWeight: number;
    evidenceCompletionPercent: number;
  };
  checks: BusinessReadinessCheck[];
  releaseGateSummary: {
    canRunAdditionalPaidValidation: boolean;
    canRunSomePaidValidationNow: boolean;
    readyPaidGates: string[];
    readyPaidGateCount: number;
    shouldDeferFullSequenceSpend: boolean;
    canRunLongFormValidation: boolean;
    canReleaseToCustomerTraffic: boolean;
    releaseBlocker?: string;
  };
  nextActions: string[];
}
```

## CineJelly Translation Plan

- Done: add `scripts/run-business-readiness-audit.mjs`.
- Done: add `npm.cmd run validation:business-readiness`.
- Done: add `schemas/business-readiness-audit-report.schema.json`.
- Done: update the operator runbook, roadmap, and project context.
- Done: add schema-aware long-form evidence evaluation through `cinejelly.long-form-validation.v1`.
- Done: add schema-aware source-video evidence evaluation through `cinejelly.source-video-auto-analysis-validation.v1`.
- Done: add schema-aware remote-stock evidence evaluation through `cinejelly.remote-stock-validation.v1`.
- Done: add schema-aware generated-audio evidence evaluation through `cinejelly.generated-audio-validation.v1`.
- Done: add schema-aware Atlas billing readiness evaluation through `cinejelly.atlas-billing-readiness.v1` as a zero-weight hard pre-paid-spend gate.
- Done: make paid-validation summary flags depend on the Atlas billing/budget gate instead of release hygiene alone.
- Done: reject stale Atlas billing readiness reports whose captured budget or planned cost no longer matches the current `cinejelly.business-readiness-validation-plan.v1` report.
- Done: reject Atlas billing readiness reports older than the configured evidence max age before enabling additional paid validation.
- Done: surface budget-ready paid slices from the current business-readiness validation plan without treating them as full-sequence approval.
- Done: add schema-aware billing/admin/quota evidence evaluation through `cinejelly.billing-admin-ops.v1`.
- Done: add schema-aware production operations evidence evaluation through `cinejelly.production-operations.v1`.
- Done: add report-contract semantic checks so status, weighted completion, paid-validation flags, paid-gate counts, customer-traffic approval, and release blockers cannot drift from the check evidence.
- Pending: feed the audit with real deployment, passing paid long-form, source-video, remote stock, generated-audio, Atlas billing readiness under the approved budget, billing/admin, and production operations evidence.

## Validation Checklist

- Missing evidence exits non-zero and writes a blocked report.
- Existing release audit, short paid-render report, and manual review report pass when present and valid.
- Long-form evidence cannot pass without a final duration between 120 and 480 seconds.
- The report lists exact evidence paths and next actions.
- Changing the approved validation budget without rerunning `validation:atlas-billing` leaves the Atlas billing audit check failed as stale.
- Letting the Atlas billing readiness report exceed the configured max age leaves the Atlas billing audit check failed as stale.
- The script does not import from `src/providers`, create runtimes, call Atlas, or write media artifacts.
- No production runtime import from `external/upstream/`.
- `validation:report-contracts` fails if the business-readiness report claims customer traffic readiness, long-form paid-validation readiness, or a different evidence-completion percent than the underlying checks justify.
