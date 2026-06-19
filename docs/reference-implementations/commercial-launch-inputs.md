# Commercial Launch Inputs

Implementation status as of 2026-06-19: implemented as a CineJelly-owned no-spend Node.js report generator, JSON schema, package command, Markdown checklist writer, launch-intake scope gate, command-plan audit, and secret-free operator handoff manifest. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Before asking an operator for the remaining production inputs, CineJelly needs one secret-free packet that converts the current readiness reports into a concrete checklist and machine-readable handoff manifest: URLs, secret env placeholders, commercial offer scope, operator attestations, ignored operator input files, draft/template files, report archives, approved Atlas budget, live evidence commands, paid Atlas commands, and manual review gates.

## Rules

1. The generator must not call Atlas, deployment endpoints, stock provider APIs, source-video URLs, FFmpeg, render routes, or billing/payment APIs.
2. The generator must not expose `.env` values, provider keys, bearer tokens, signed URLs, or local-only artifact paths.
3. The generator is not business-readiness evidence and must not make customer traffic release pass.
4. Provider-choice secrets such as Pexels, Pixabay, and Coverr keys must be described as alternatives, not individually mandatory keys.
5. The checklist must keep each paid Atlas validation blocked while its relevant Atlas billing readiness or approved-budget fit fails.
6. The Markdown output must be derived from the JSON report so operators can share a readable checklist without losing schema-validated evidence.
7. Budget checklist values must prefer the current business-plan/live-input cost plan over older Atlas billing evidence, and blocker text must surface stale Atlas billing reports when the live-input validator detects them.
8. When the full known paid sequence exceeds the approved budget, the packet must show which narrower paid slices are inside budget, blocked, or unknown-cost without marking the full sequence or release ready.
9. Each paid slice should include the slice-specific Atlas billing-readiness command before the paid command, using a distinct output path when the slice is not the full business-readiness plan.
10. Generated-audio manual review checklist items must use `--review-existing-report` so manual review can update evidence without calling Atlas again.
11. Generated-audio paid commands copied from the business plan must include the slice billing report path, local max-cost cap, cost-rate assumption, and validation text so operators do not depend on hidden CLI defaults.
12. Generated-audio manual review checklist items must include `validation:generated-audio-artifact -- --confirm-live-network` before the review-existing command so structured review binds to SHA-256/duration evidence from the exact audio bytes.
13. The packet must include a secret-free Atlas configuration summary derived from live-readiness evidence so operators can distinguish "Atlas keys/models are configured" from deployment, attestation, live-evidence, and budget blockers.
14. The packet must include live provider action evidence as a separate operator input, backed by `validation:provider-live-actions`, so distributed-resume evidence is not conflated with Atlas key, deployment, or paid-budget readiness.
15. The packet must include graph-resume enqueue payload evidence as a separate operator input, backed by `validation:provider-graph-resume`, so a provider callback cannot be mistaken for proven resumable graph state or queue payloads.
16. The packet must include the launch-intake commercial offer scope decision so an API/CLI-only launch is explicit and a UI-required launch remains blocked until the UI exists.
17. The packet must audit its own command plan against `package.json` scripts and paid-spend guard flags so stale checklist commands are caught before an operator copies them into a live or paid run.
18. The packet must include an `operatorHandoffManifest` that is safe to share, contains no raw secrets/provider payloads/local absolute paths/customer media, lists ignored operator input files, draft/template files, report archives, flattened guarded commands, expands multi-step required-input validation commands into an `inputValidationRunbook`, flags manual audio and long-form quality review commands as manual-review guarded, and explicitly marks itself as non-release evidence.

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
  atlasConfigurationSummary: {
    source: "live_readiness_inputs" | "missing_live_inputs_report";
    docsAlignment: {
      apiKeyModel: string;
      llmBaseUrl: "https://api.atlascloud.ai/v1";
      mediaBaseUrl: "https://api.atlascloud.ai/api/v1";
      billingBaseUrl: "https://api.atlascloud.ai/public/v1";
    };
    keys: Record<string, boolean>;
    endpoints: Record<string, boolean>;
    models: Record<string, boolean | number>;
    readiness: Record<string, boolean>;
    operatorMessage: string;
  };
  evidenceCommandPlan: Record<string, Array<{ name: string; status: string; command: string }>>;
  budgetConstrainedPaidPlan: {
    present: boolean;
    maxBudgetUsd?: number;
    knownPaidEstimateUsd?: number;
    fullKnownPaidSequenceWithinBudget: boolean;
    recommendedSliceName?: string;
    slices: Array<{ name: string; status: string; billingReadinessCommand?: string; command: string; estimatedCostUsd?: number }>;
  };
  commandPlanAudit: {
    status: "pass" | "warn" | "fail";
    checkedCommandCount: number;
    npmScriptCount: number;
    issues: Array<{ severity: "warn" | "fail"; location: string; commandName: string; command: string; message: string }>;
  };
  operatorHandoffManifest: {
    purpose: string;
    status: "blocked_by_operator_inputs" | "ready_for_live_evidence_sequence";
    noSpend: true;
    networkCallsMade: false;
    providerCallsMade: false;
    safety: {
      shareableWithOperators: true;
      secretValuesIncluded: false;
      rawProviderPayloadsIncluded: false;
      localAbsolutePathsIncluded: false;
      customerMediaIncluded: false;
      releaseEvidence: false;
    };
    summary: Record<string, number | string>;
    blockedInputIds: string[];
    operatorInputFiles: Array<{ path: string; sourceInputIds: string[]; status: string; sensitivity: string; present: boolean }>;
    draftFiles: Array<{ sourceInputId: string; path: string; kind: string; present: boolean; copyTo?: string }>;
    reportArchiveFiles: Array<{ path: string; source: string; status: string; present: boolean }>;
    envPlaceholders: Array<{ name: string; sensitivity: "public_url" | "secret" | "boolean"; required: boolean; configured: boolean }>;
    commandRunbook: Array<{ section: string; name: string; status: string; command: string; runnable: boolean; requiresProviderSpend: boolean }>;
    inputValidationRunbook: Array<{ section: "requiredInput"; sourceInputId: string; stepIndex: number; stepCount: number; command: string; requiresLiveNetwork: boolean; requiresProviderSpend: boolean; requiresManualReview: boolean; containsPlaceholder: boolean }>;
    refreshCommands: string[];
  };
  releaseGateSummary: {
    canRunNoSpendPrep: boolean;
    canRunLiveNetworkEvidence: boolean;
    canRunPaidAtlasValidation: boolean;
    readyPaidGates: string[];
    readyPaidGateCount: number;
    shouldDeferFullSequenceSpend: boolean;
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
- Done: include the live provider action evidence packet and validator command in the checklist and command-plan audit.
- Done: include the graph-resume enqueue payload evidence packet and validator command in the checklist and command-plan audit.
- Done: include the commercial offer scope decision from `validation:launch-intake` as an operator-decision checklist item.
- Done: include a contract-validated `operatorHandoffManifest` that maps remaining operator files, draft/template files, report archives, env placeholders, flattened guarded command order, and expanded required-input validation steps without making release claims.

## Acceptance Checks

- Running the generator performs no network, provider, render, FFmpeg, or billing calls.
- The report and Markdown checklist expose only placeholders, booleans, report paths, commands, and cost estimates.
- Current output says commercial inputs are blocked by missing deployment URL, commercial offer scope decision, operator attestations, live provider action evidence, graph-resume enqueue payload evidence, source-video inputs, remote stock inputs, and approved Atlas budget.
- Current output includes a paid budget slice section that names generated-audio smoke as within the `$5` ceiling while long-form/full sequence remain blocked.
- The generated-audio smoke slice shows a no-spend Atlas billing probe with `--planned-cost-usd` before the paid generated-audio command.
- The generated-audio paid command references `atlas-billing-generated-audio-smoke-report.json`, `--max-cost-usd`, `--cost-usd-per-1k-chars`, and the planned validation text.
- The generated-audio manual review item points to `validation:generated-audio-artifact -- --confirm-live-network`, `validation:generated-audio-review-draft`, and `validation:generated-audio -- --review-existing-report ... --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review`, not a second provider execution.
- Current output can mark the generated-audio paid smoke command ready when live-inputs confirms its billing slice, reports the exact ready paid gate names, keeps `shouldDeferFullSequenceSpend=true`, and keeps customer traffic release false.
- When the approved budget changes, checklist output points operators to rerun `validation:atlas-billing -- --max-budget-usd <current-budget> --confirm-live-network` instead of repeating stale audit text.
- Current output includes a no-secret Atlas configuration section showing whether media/LLM keys, endpoint families, Seedance model/capability config, generated-audio config, and the generated-audio billing slice are ready without printing key values.
- Current output includes a `live_provider_action_evidence` checklist item pointing to ignored `ops/render-provider-live-actions.json` and `validation:provider-live-actions -- --confirm-live-provider-actions`.
- Current output includes a `graph_resume_enqueue_evidence` checklist item pointing to ignored `ops/render-provider-graph-resume-enqueues.json` and `validation:provider-graph-resume -- --confirm-graph-resume-enqueues`.
- Current output includes a `commercial_offer_scope_decision` checklist item pointing to ignored `ops/commercial-launch-intake.json` and `validation:launch-intake -- --write-draft`.
- Current output includes `commandPlanAudit.status: "pass"` after checking command names against `package.json` scripts and confirming ready paid commands retain required confirmation/billing flags.
- Current output includes `operatorHandoffManifest.safety.releaseEvidence=false`, no raw secrets, the expected `ops/*` input files, launch-intake/live-provider/graph-resume draft files, report archive paths, a flattened command runbook whose counts match the source command plans, and an `inputValidationRunbook` whose expanded generated-audio/long-form manual review steps carry live-network, provider-spend, placeholder, and manual-review guard flags.
