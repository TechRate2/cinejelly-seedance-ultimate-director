# Commercial Launch Inputs

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js report generator, JSON schema, package command, and Markdown checklist writer. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Before asking an operator for the remaining production inputs, CineJelly needs one secret-free packet that converts the current readiness reports into a concrete checklist: URLs, secret env placeholders, operator attestations, approved Atlas budget, live evidence commands, paid Atlas commands, and manual review gates.

## Rules

1. The generator must not call Atlas, deployment endpoints, stock provider APIs, source-video URLs, FFmpeg, render routes, or billing/payment APIs.
2. The generator must not expose `.env` values, provider keys, bearer tokens, signed URLs, or local-only artifact paths.
3. The generator is not business-readiness evidence and must not make customer traffic release pass.
4. Provider-choice secrets such as Pexels, Pixabay, and Coverr keys must be described as alternatives, not individually mandatory keys.
5. The checklist must keep paid Atlas validation blocked while Atlas billing readiness or the approved-budget fit fails.
6. The Markdown output must be derived from the JSON report so operators can share a readable checklist without losing schema-validated evidence.
7. Budget checklist values must prefer the current business-plan/live-input cost plan over older Atlas billing evidence, and blocker text must surface stale Atlas billing reports when the live-input validator detects them.
8. When the full known paid sequence exceeds the approved budget, the packet must show which narrower paid slices are inside budget, blocked, or unknown-cost without marking paid validation or release ready.

## Report Shape

```ts
interface CommercialLaunchInputsReport {
  schemaVersion: "cinejelly.commercial-launch-inputs.v1";
  generatedAt: string;
  status: "blocked_by_operator_inputs" | "ready_for_live_evidence_sequence";
  noSpend: true;
  networkCallsMade: false;
  providerCallsMade: false;
  checkedInputs: Record<string, string>;
  sourceReports: Record<string, { present: boolean; path: string; status: string; schemaVersion?: string }>;
  inputSummary: {
    total: number;
    configured: number;
    missing: number;
    blockedByBudget: number;
    pendingAfterPaidRun: number;
  };
  requiredInputs: Array<{
    id: string;
    label: string;
    category: string;
    status: "missing" | "configured" | "blocked_by_budget" | "pending_after_paid_run";
    sensitivity: string;
    requiredFor: string[];
    envVars: string[];
    filePaths: string[];
    acceptance: string;
    validationCommand: string;
  }>;
  envPlaceholders: Array<{
    name: string;
    sensitivity: "public_url" | "secret" | "boolean";
    exampleValue: string;
    required: boolean;
    configured: boolean;
  }>;
  evidenceCommandPlan: Record<string, Array<{ name: string; status: string; command: string }>>;
  budgetConstrainedPaidPlan: {
    present: boolean;
    maxBudgetUsd?: number;
    knownPaidEstimateUsd?: number;
    fullKnownPaidSequenceWithinBudget: boolean;
    recommendedSliceName?: string;
    slices: Array<{ name: string; status: string; command: string; estimatedCostUsd?: number }>;
  };
  releaseGateSummary: {
    canRunNoSpendPrep: boolean;
    canRunLiveNetworkEvidence: boolean;
    canRunPaidAtlasValidation: boolean;
    canReleaseToCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## Delivered Implementation

- Done: add `scripts/prepare-commercial-launch-inputs.mjs`.
- Done: add `npm.cmd run validation:commercial-inputs`.
- Done: add `schemas/commercial-launch-inputs-report.schema.json`.
- Done: include the report in `validation:report-contracts`.

## Acceptance Checks

- Running the generator performs no network, provider, render, FFmpeg, or billing calls.
- The report and Markdown checklist expose only placeholders, booleans, report paths, commands, and cost estimates.
- Current output says commercial inputs are blocked by missing deployment URL, operator attestations, source-video inputs, remote stock inputs, and approved Atlas budget.
- Current output includes a paid budget slice section that names generated-audio smoke as within the `$5` ceiling while long-form/full sequence remain blocked.
- Current output keeps paid Atlas validation and customer traffic release false.
- When the approved budget changes, checklist output points operators to rerun `validation:atlas-billing -- --max-budget-usd <current-budget> --confirm-live-network` instead of repeating stale audit text.
