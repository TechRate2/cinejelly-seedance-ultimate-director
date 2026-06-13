# Reference Implementation: Phase 6 Paid Render Validation Runner

Implementation status as of 2026-06-14: drafted before production code. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The production runner must orchestrate an operator-supplied paid validation request through the existing CineJelly runtime only after readiness gates allow provider spend.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Validate before spend, run deterministically, preserve artifacts, and inspect outputs before release claims. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` and `external/upstream/moneyprinterturbo/app/controllers/v1/video.py` | MIT | One-input task execution should expose progress, terminal status, generated artifacts, and failure evidence. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Approval-gate and operator-review concepts are behavior notes only; AGPL runtime implementation is not copied, linked, or executed. |

## Behavior To Preserve

1. Paid validation must be explicit and operator-triggered. The runner never creates sample, mock, demo, or fake requests.
2. Runtime readiness must be checked before provider spend. If readiness is `blocked`, the runner stops and returns the redacted readiness report.
3. A warning readiness state can continue only when the operator passes an explicit `--allow-warnings` flag.
4. The request JSON must pass the same admission and path-normalization boundary as `/v1/render`.
5. Output, work, and artifact paths must remain inside `CINEJELLY_OUTPUT_DIR` or the default output root.
6. Successful runs must write deterministic run artifacts and then run artifact validation immediately.
7. Failed render pipelines after request normalization must still write failure artifacts, cost ledger evidence, and artifact validation results.
8. Public CLI output must be redacted: no secrets, raw stack traces, inline media, unsafe URLs, or server-local absolute paths.
9. The runner is a validation harness, not a release approval. Release still requires manual review of artifacts and paid output quality.

## Edge Cases

- Missing `--request`: return a stable usage failure before reading env or creating runtime.
- Request file is not valid JSON: return a redacted failure without provider spend.
- Request JSON starts with a UTF-8 BOM from Windows tooling: strip the BOM before parsing.
- Readiness is `blocked`: return readiness decision, blockers, and next actions; do not create runtime or call Atlas.
- Readiness is `review_warnings` without `--allow-warnings`: stop before spend and require operator acknowledgement.
- The render succeeds but artifact validation fails: return `completed_with_artifact_validation_failure`.
- The render fails after runtime creation: write failure artifacts with stack-free error message and validate those artifacts.
- Artifact writing or artifact validation throws: return a stable failure report and keep any cost ledger already captured.

## Reference Implementation

```ts
async function runPaidValidation(input: {
  requestPath: string;
  allowWarnings: boolean;
  env: NodeJS.ProcessEnv;
}): Promise<PaidValidationRunnerReport> {
  const body = readJson(input.requestPath);
  admission.assertAcceptable(body);
  const normalizedRequest = normalizeLikeRenderApi(body, {
    requestId: createValidationRequestId(),
    env: input.env
  });

  const readiness = readinessReporter.build(await preflight.run());
  if (readiness.decision === "blocked") {
    return report("blocked_by_readiness", { readiness });
  }
  if (readiness.decision === "review_warnings" && !input.allowWarnings) {
    return report("blocked_by_readiness_warnings", { readiness });
  }

  const runtime = createDirectorRuntime(input.env);
  try {
    const result = await runtime.director.run(normalizedRequest);
    const costLedger = runtime.ledger.list();
    const artifacts = await artifactStore.writeRunArtifacts({
      result,
      costLedger,
      artifactDirectory: normalizedRequest.artifactDirectory
    });
    const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);
    return report(artifactValidation.status === "fail"
      ? "completed_with_artifact_validation_failure"
      : "completed", {
      readiness,
      costLedger,
      artifacts,
      artifactValidation
    });
  } catch (error) {
    const costLedger = runtime.ledger.list();
    const artifacts = await artifactStore.writeFailureArtifacts({
      request: normalizedRequest,
      costLedger,
      artifactDirectory: normalizedRequest.artifactDirectory,
      error,
      stage: "paid_validation_render_pipeline"
    });
    const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);
    return report("render_failed", {
      readiness,
      costLedger,
      artifacts,
      artifactValidation,
      error: stackFree(error)
    });
  }
}
```

## CineJelly Translation Plan

- Add a shared render-request normalizer so API and CLI enforce the same output-root path boundary.
- Add a `runPaidRenderValidationCli` application entrypoint that accepts `--request <json>` and optional `--allow-warnings`.
- Add `npm.cmd run validation:paid-render -- --request <request-json>` as the operator command.
- Reuse `RuntimePreflight`, `Phase6ValidationReadinessReporter`, `createDirectorRuntime`, `ProjectArtifactStore`, and `ProjectArtifactValidator`.
- Return redacted JSON only; do not expose local artifact paths in stdout.
- Update roadmap, runbook, README, project context, credits, snapshot lineage, and runtime source-lineage records.

## Validation Checklist

- Reference Implementation exists before production code.
- Runner exits before provider spend when readiness is `blocked`.
- Runner requires explicit `--allow-warnings` before spending from `review_warnings`.
- Request JSON passes the same admission and output-root normalization as `/v1/render`.
- Successful and failed render paths both write artifacts and run artifact validation.
- CLI output is redacted for secrets, local paths, unsafe URLs, and stack traces.
- No production runtime import from `external/upstream/`.
- No mock, demo, sample, or fake request file is added.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run validation:paid-render -- --request <temp-request> --output <temp-report>` produced `blocked_by_readiness` with the current 54-check readiness report and stopped before runtime/provider spend because the local environment still lacks Atlas credentials, model IDs, API auth token, FFmpeg, and FFprobe.
