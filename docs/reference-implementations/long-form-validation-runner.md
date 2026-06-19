# Reference Implementation: Long-Form Validation Runner

Implementation status as of 2026-06-19: implemented as a CineJelly-owned no-spend-by-default evidence CLI, JSON schema, package command, business-readiness input, manual-review artifact fingerprint binding, no-spend manual quality/redaction review draft helper, no-spend manual-review readiness helper, report-contract validation, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Source And Provider Pattern

| Source | Use |
| --- | --- |
| `HKUDS/ViMax` | Long-form segmentation, continuity-sensitive planning, and staged validation expectations. |
| `vericontext/vibeframe` | Validate-before-spend reports, cost gates, deterministic evidence, and repair-loop discipline. |
| `harry0703/MoneyPrinterTurbo` | One-input staged pipeline and operator-visible progress/evidence expectations. |
| `calesthio/OpenMontage` | Approval-gate and review evidence concepts as AGPL-aware behavior notes only. |
| Atlas Cloud Seedance 2.0 model page | Provider clip-duration, resolution, aspect-ratio, and model-family assumptions for validation evidence. |

## Contract

The runner must:

1. Write `schemaVersion: "cinejelly.long-form-validation.v1"`.
2. Create or read an operator-owned render request with a target duration from 120 to 480 seconds.
3. Run render request admission, runtime readiness, cost estimation, and provider-safe chunk planning before any provider spend.
4. Treat Atlas Seedance clips as provider-safe only when planned shot durations stay inside 4 to 15 seconds.
5. Block before live render validation unless `--confirm-paid-spend` is present.
6. Block before live render validation when the estimated total cost exceeds `--max-cost-usd`.
7. Delegate live provider work to the existing paid-render validation runner instead of duplicating provider orchestration.
8. Require a fresh Atlas billing-readiness report for the long-form slice whose `plannedCostUsd` matches the current duration estimate and whose approved budget covers `--max-cost-usd`.
9. Require paid render completion, artifact validation pass, 120 to 480 second final duration, rendered shot evidence, and manual quality/redaction review bound to the same paid `projectId`, `manifestSha256`, and `deliverableSha256` before business-readiness can count the evidence.
10. Redact secrets, signed URL query values, provider credentials, raw stack traces, and server-local artifact roots from archived reports.
11. Never mark customer traffic open from long-form evidence alone; all other business-readiness gates must pass too.
12. The manual-review readiness helper must be no-spend/no-network and distinguish `ready_for_manual_review` from accepted review evidence; it may prove paid-render artifact fingerprints are ready, but it must not approve long-form business-readiness evidence, DirectorBench parity, or customer traffic by itself.

## Report Shape

```ts
interface LongFormValidationReport {
  schemaVersion: "cinejelly.long-form-validation.v1";
  status:
    | "pass"
    | "warn"
    | "fail"
    | "blocked_by_budget"
    | "blocked_by_spend_confirmation"
    | "blocked_by_atlas_billing"
    | "blocked_by_readiness";
  checkedInputs: {
    requestPath: string;
    requestCreated: boolean;
    durationSeconds: number;
    outputPath: string;
  };
  spendGate: {
    confirmPaidSpend: boolean;
    providerSpendAllowed: boolean;
    maxCostUsd: number;
    estimatedTotalCostUsd?: number;
  };
  atlasBillingGate: {
    path: string;
    present: boolean;
    status: string;
    currentEstimatedCostUsd?: number;
    currentMaxCostUsd: number;
    canUseAsPrePaidAtlasBillingEvidence: boolean;
  };
  requestValidation: object;
  readiness: object;
  costEstimate: object;
  chunkPlan: object;
  paidRender: object;
  artifactEvidence: {
    present: boolean;
    manifestSha256?: string;
    deliverableSha256?: string;
  };
  manualQualityReview: {
    present: boolean;
    passed: boolean;
    bindingMatched: boolean;
    artifactBindingStatus:
      | "not_evaluated"
      | "missing_artifact_evidence"
      | "missing_review_binding"
      | "matched"
      | "mismatch"
      | "unbound_operator_flag";
  };
  releaseGateSummary: {
    canUseAsBusinessReadinessLongFormEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
}
```

## CLI

```powershell
npm.cmd run validation:long-form -- --duration-seconds 120
npm.cmd run validation:atlas-billing -- --max-budget-usd 25 --planned-cost-usd 24.000000 --output assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json --confirm-live-network
npm.cmd run validation:long-form-review-draft -- --force
npm.cmd run validation:long-form-review-readiness
npm.cmd run validation:long-form -- --request "assets/output_deliverables/business-readiness/long-form-request.json" --max-cost-usd 25 --confirm-paid-spend --manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review
```

The default run writes a blocked no-spend report when spend confirmation is missing or the local budget ceiling is too low. A live run still requires a slice-specific Atlas billing report before provider spend, the paid-render runner to pass, artifact validation to pass, and an operator manual quality/redaction review JSON bound to the emitted paid artifact fingerprints before the business-readiness audit accepts it. A bare `--confirm-manual-quality-review` flag without a review file remains archived as an unbound operator attestation and cannot make the report accepted. The draft helper can prefill the artifact fingerprints after a paid long-form report exists, but the template stays `needs_review`, keeps `redactionReviewPassed=false`, contains template-only marker fields, and cannot pass validation if copied directly.

Manual review JSON should be written only after the paid run emits artifact evidence:

```json
{
  "schemaVersion": "cinejelly.long-form-manual-quality-review.v1",
  "decision": "pass",
  "redactionReviewPassed": true,
  "reviewedProjectId": "<artifactEvidence.projectId>",
  "reviewedManifestSha256": "<artifactEvidence.manifestSha256>",
  "reviewedDeliverableSha256": "<artifactEvidence.deliverableSha256>",
  "reviewer": "Operator or approved reviewer name",
  "reviewedAt": "2026-06-19T00:00:00.000Z",
  "qualityChecks": {
    "durationAndPacingAccepted": true,
    "shotContinuityAccepted": true,
    "visualArtifactsAccepted": true,
    "promptFidelityAccepted": true,
    "audioSyncAccepted": true,
    "noUnsafeContentObserved": true
  }
}
```

## Done

- Done: add `scripts/run-long-form-validation.mjs`.
- Done: add `scripts/create-long-form-manual-quality-review-draft.mjs`.
- Done: add `schemas/long-form-validation-report.schema.json`.
- Done: add `schemas/long-form-manual-quality-review.schema.json`.
- Done: add `schemas/long-form-manual-quality-review-draft-report.schema.json`.
- Done: add `npm.cmd run validation:long-form`.
- Done: add `npm.cmd run validation:long-form-review-draft`.
- Done: add `npm.cmd run validation:long-form-review-readiness`.
- Done: add schema-aware long-form evaluation to `validation:business-readiness`.
- Done: add report-contract semantic validation for raw long-form manual review packets so pass decisions require redaction review, every required quality check, real redacted reviewer text, and a valid reviewedAt timestamp.
- Done: document the no-spend, budget, Atlas billing, paid-spend, artifact, draft-helper, and artifact-bound manual-review gates.

## Remaining

- Run the paid long-form validation only after the operator approves a budget ceiling that covers the estimated duration cost.
- Archive artifact-bound manual quality/redaction review evidence for the live long-form output after replacing the draft template with real review decisions.
- Re-run `validation:business-readiness` after deployment, source-video, remote-stock, generated-audio, billing/admin, and production-operations evidence also exists.
