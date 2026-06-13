# Reference Implementation: Phase 6 Validation Readiness Report

Implementation status as of 2026-06-13: implemented as CineJelly-owned TypeScript in validation-readiness contracts, report builder, CLI entrypoint, package script, API diagnostic endpoint, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The report prepares operator validation; it does not replace a paid Atlas render or artifact inspection.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic validate/report discipline, explicit status refresh, and operator review reports. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Operator-visible task readiness before long-running video work starts. |

## Behavior To Preserve

1. Readiness should be visible before paid provider work starts.
2. The report must be deterministic, redacted, and safe to store with deployment validation evidence.
3. Hard blockers must be explicit and derived from preflight `fail` checks.
4. Warnings must be explicit and require operator review before paid rendering.
5. The report must not claim release readiness. Release still requires paid Atlas render validation, artifact validation, and manual redaction review.
6. The report must provide next actions that map directly to the Phase 6 runbook.
7. The same report shape must be available through CLI and HTTP so operators can validate local shells, containers, and deployed API processes with one contract.

## Edge Cases

- Preflight has one or more `fail` checks: decision is `blocked`; do not run paid validation.
- Preflight has no failures but has `warn` checks: decision is `review_warnings`; warnings must be accepted before paid validation.
- Preflight passes with no warnings: decision is `ready_for_paid_validation`; the next action is the paid Atlas validation run.
- Report output receives secret-like values or local paths from a future preflight check: the entrypoint redacts before stdout or file output.
- Operator runs the CLI without an output path: JSON is emitted to stdout only.
- Operator calls `GET /v1/validation-readiness` without `CINEJELLY_API_AUTH_TOKEN` configured: the endpoint is allowed as a diagnostic readiness endpoint, matching `/v1/preflight`.
- Operator calls `GET /v1/validation-readiness` with `CINEJELLY_API_AUTH_TOKEN` configured: normal API auth applies.
- HTTP response status is `503` when decision is `blocked`; `review_warnings` and `ready_for_paid_validation` return `200` because the process is reachable and the operator must inspect the report body.

## Reference Implementation

```ts
type ValidationReadinessDecision = "blocked" | "review_warnings" | "ready_for_paid_validation";

interface Phase6ValidationReadinessReport {
  schemaVersion: "cinejelly.phase6.validation-readiness.v1";
  generatedAt: Date;
  sourcePatternOrigins: readonly string[];
  decision: ValidationReadinessDecision;
  preflightStatus: "pass" | "warn" | "fail";
  checkCounts: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
  };
  hardBlockers: readonly string[];
  warnings: readonly string[];
  nextActions: readonly string[];
  releaseGateSummary: {
    canRunPaidValidation: boolean;
    canReleaseToCustomerTraffic: false;
    releaseBlocker: string;
  };
  preflight: RuntimePreflightReport;
}

function buildReadiness(preflight: RuntimePreflightReport): Phase6ValidationReadinessReport {
  const hardBlockers = preflight.checks.filter((check) => check.status === "fail").map((check) => check.name);
  const warnings = preflight.checks.filter((check) => check.status === "warn").map((check) => check.name);
  const decision =
    hardBlockers.length > 0 ? "blocked" : warnings.length > 0 ? "review_warnings" : "ready_for_paid_validation";

  return {
    schemaVersion: "cinejelly.phase6.validation-readiness.v1",
    generatedAt: new Date(),
    sourcePatternOrigins: ["vericontext/vibeframe", "harry0703/MoneyPrinterTurbo"],
    decision,
    preflightStatus: preflight.status,
    checkCounts: count(preflight.checks),
    hardBlockers,
    warnings,
    nextActions: actionsFor(decision),
    releaseGateSummary: {
      canRunPaidValidation: decision === "ready_for_paid_validation",
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Paid Atlas render validation, artifact validation, and manual redaction review are still required."
    },
    preflight
  };
}

async function handleValidationReadinessHttp(signal: AbortSignal): Promise<HttpResponse> {
  const preflight = await runtimePreflight.run(signal);
  const report = buildReadiness(preflight);
  return {
    statusCode: report.decision === "blocked" ? 503 : 200,
    body: redactForPublicApi(report)
  };
}

function allowWithoutConfiguredApiToken(pathname: string): boolean {
  return pathname === "/v1/preflight" || pathname === "/v1/validation-readiness";
}
```

## CineJelly Translation Plan

- Done: add Phase 6 validation readiness types under `src/types/preflight.ts`.
- Done: add a CineJelly-owned report builder under `src/application/validation-readiness-report.ts`.
- Done: add a CLI entrypoint under `src/application/validation-readiness-entrypoint.ts`.
- Done: add an npm script that builds and emits the report without calling Atlas.
- Done: expose the same readiness report through `GET /v1/validation-readiness` without calling Atlas.
- Done: keep `GET /v1/validation-readiness` available without a configured API token only as a diagnostic endpoint; require normal auth when a token is configured.
- Done: update the operator runbook and roadmap to make the readiness report part of the Phase 6 evidence path.

## Validation Checklist

- Report derives hard blockers only from preflight `fail` checks.
- Report derives warnings only from preflight `warn` checks.
- `ready_for_paid_validation` is possible only when preflight has no `fail` or `warn` checks.
- `canRunPaidValidation` is true only for `ready_for_paid_validation`, not for unreviewed warnings.
- `canReleaseToCustomerTraffic` remains `false` because a readiness report is not release validation.
- CLI stdout and optional file output are redacted.
- API response is redacted and returns `503` only for the blocked decision.
- API auth behavior matches `/v1/preflight`: public only when no deployment token is configured, protected when `CINEJELLY_API_AUTH_TOKEN` exists.
- No production runtime import from `external/upstream/`.
- Typecheck, build, CLI smoke, and API endpoint smoke pass.
