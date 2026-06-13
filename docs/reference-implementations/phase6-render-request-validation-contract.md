# Reference Implementation: Phase 6 Render Request Validation Contract

Implementation status as of 2026-06-14: Reference Implementation was drafted before production code, then translated into CineJelly-owned TypeScript, static operator schemas, source-lineage records, and runbook updates. Local `npm.cmd run typecheck`, `npm.cmd run build`, and a no-provider `npm.cmd run validation:render-request -- --request <temp-request>` smoke passed. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The goal is to give operators a stable request contract and local validation command before they run readiness-gated paid rendering.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Dry-run and validate-before-build discipline, deterministic request/report surfaces. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/models/schema.py` and `external/upstream/moneyprinterturbo/app/controllers/v1/video.py` | MIT | One-input request schema should be operator-visible before task execution. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Approval-gate and request-review concepts are behavior notes only; AGPL implementation code is not copied, linked, or executed. |

## Behavior To Preserve

1. Request validation is explicit and operator-triggered. It never creates sample, mock, demo, or fake requests.
2. Validation accepts an operator-owned JSON request file and strips a UTF-8 BOM when present.
3. Validation uses the same request admission limits and output-root path normalization as `/v1/render` and `validation:paid-render`.
4. Validation does not run readiness, create runtime providers, call Atlas, write render artifacts, or spend credits.
5. Output is a redacted JSON report with pass/fail status, request ID, normalized request summary, and stable issue messages.
6. Output must not expose local absolute paths, secrets, signed URLs, inline media, or stack traces.
7. Static JSON schemas under `schemas/` document the operator request contract and paid-render validation report contract, but TypeScript admission remains the runtime authority.

## Edge Cases

- Missing `--request`: return a stable usage failure.
- Empty request file: fail before provider/runtime work.
- Request file starts with UTF-8 BOM: strip before parsing.
- Invalid JSON: return a redacted parse failure.
- Invalid request shape, unsafe URI, or out-of-root path: return `fail` with the admission/normalization message.
- Valid request with omitted `outputPath`, `workDirectory`, or `artifactDirectory`: pass and report that defaults will be applied without echoing local paths.
- Request has a caller-provided safe `metadata.requestId`: preserve it in the report.

## Reference Implementation

```ts
async function validateRenderRequest(input: {
  requestPath: string;
  env: NodeJS.ProcessEnv;
}): Promise<RenderRequestValidationReport> {
  const raw = stripBom(await readFile(input.requestPath, "utf8"));
  const payload = JSON.parse(raw);

  try {
    renderRequestAdmissionFromEnv(input.env).assertAcceptable(payload);
    const normalized = normalizeRenderRequest(payload, {
      env: input.env,
      requestId: payload.metadata?.requestId
    });
    return {
      schemaVersion: "cinejelly.phase6.render-request-validation.v1",
      status: "pass",
      requestId: normalized.metadata?.requestId,
      normalizedSummary: {
        hasOutputPath: Boolean(normalized.outputPath),
        hasWorkDirectory: Boolean(normalized.workDirectory),
        hasArtifactDirectory: Boolean(normalized.artifactDirectory),
        referenceCount: normalized.references?.length ?? 0
      },
      issues: []
    };
  } catch (error) {
    return {
      schemaVersion: "cinejelly.phase6.render-request-validation.v1",
      status: "fail",
      issues: [{ code: "request_invalid", message: stackFree(error) }]
    };
  }
}
```

## CineJelly Translation Plan

- Add `schemas/render-request.schema.json` for the operator request file contract.
- Add `schemas/phase6-render-request-validation-report.schema.json` for the pre-paid request validation report shape.
- Add `schemas/phase6-paid-render-validation-report.schema.json` for the paid-render validation report shape.
- Add `src/application/render-request-validation-entrypoint.ts`.
- Add `npm.cmd run validation:render-request -- --request <request-json> [--output <report-path>]`.
- Reuse `renderRequestAdmissionFromEnv` and `normalizeRenderRequest`.
- Update README, runbook, roadmap, project context, snapshot inventory, credits, package exports, and source-lineage records.

## Validation Checklist

- Reference Implementation exists before production code.
- Request validator never creates runtime providers or calls Atlas.
- Request validator uses the same admission and normalization boundaries as API and paid-render CLI.
- Static schemas are documentation/operator contracts, not a replacement for TypeScript runtime admission.
- CLI output is redacted and stack-free.
- Local smoke validation passes with an operator-owned temporary request and preserves a safe request ID.
- No production runtime import from `external/upstream/`.
- No mock, demo, sample, or fake request file is added.
