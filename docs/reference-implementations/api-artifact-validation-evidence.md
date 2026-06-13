# Reference Implementation: API Artifact Validation Evidence

Implementation status as of 2026-06-13: implemented as CineJelly-owned TypeScript in the artifact validator, synchronous render API, render-job manager, API artifact DTOs, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic build/review report discipline and explicit artifact validation before release decisions. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | API-visible long-running task status and generated artifact evidence after terminal job states. |

## Behavior To Preserve

1. Artifact validation is a release gate, not an optional local afterthought.
2. Success and failure artifacts should be validated immediately after they are written for synchronous render responses and async jobs.
3. The job can remain `succeeded`, `failed`, or `canceled`; artifact validation status is separate evidence and must be inspected before release.
4. API responses must expose validation status, checks, project ID, and manifest file name without exposing server-local artifact directories or manifest paths.
5. The API must not accept arbitrary local filesystem paths for validation. It should validate only artifacts created by the current synchronous render request or retained job record.
6. Validation must not call Atlas or any remote provider.
7. Validation failures should remain visible even when the render pipeline itself has already reached a terminal state.

## Edge Cases

- Successful render writes artifacts but validator reports `warn`: job stays `succeeded`; `artifactValidation.status` is `warn`, and release requires operator review.
- Successful render writes artifacts but validator reports `fail`: job stays `succeeded`; release remains blocked by artifact evidence.
- Failed render writes failure artifacts: validator checks `failure-report.json`, `cost-ledger.json`, manifest hashes, secret redaction, and stack-free error payloads.
- Failure artifact writing fails: job exposes no artifact validation because no manifest exists; the original render failure remains visible.
- Validation output contains local paths from the internal validator: public API DTO drops `artifactDirectory` and `manifestPath`.
- Synchronous `/v1/render` succeeds: response includes `artifactValidation` next to the artifact bundle, cost ledger, and result payload.
- Synchronous `/v1/render` fails after request normalization and failure artifacts are written: response includes `artifactValidation` next to the failure artifact bundle and partial cost ledger.
- Compact job list should expose whether artifact validation exists and its status, but not every check. Per-job detail may expose bounded validation checks.

## Reference Implementation

```ts
type PublicArtifactValidationStatus = "pass" | "warn" | "fail";

interface ApiArtifactValidationSummary {
  status: PublicArtifactValidationStatus;
  checkedAt: Date;
  projectId?: string;
  manifestFileName: "manifest.json";
  checkCount: number;
  failedCheckCount: number;
  warningCheckCount: number;
}

interface ApiArtifactValidationReport extends ApiArtifactValidationSummary {
  checks: readonly {
    name: string;
    status: PublicArtifactValidationStatus;
    message: string;
    fileName?: string;
  }[];
}

async function finalizeRenderJob(record: RenderJobRecord, result: DirectorRunResult): Promise<void> {
  const artifacts = await artifactStore.writeRunArtifacts({
    result,
    costLedger,
    artifactDirectory: record.artifactDirectory
  });
  const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);

  updateJob(record.jobId, {
    status: "succeeded",
    artifacts,
    artifactValidation,
    result,
    costLedger
  });
}

async function handleSynchronousRender(request: RenderRequest): Promise<ApiResponse> {
  const result = await director.run(request);
  const costLedger = ledger.list();
  const artifacts = await artifactStore.writeRunArtifacts({ result, costLedger, artifactDirectory });
  const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);
  return {
    statusCode: 200,
    body: {
      ...result,
      costLedger,
      artifacts: toApiProjectArtifactBundle(artifacts),
      artifactValidation: toApiArtifactValidationReport(artifactValidation)
    }
  };
}

function toApiArtifactValidationReport(report: ProjectArtifactValidationReport): ApiArtifactValidationReport {
  const failedCheckCount = report.checks.filter((check) => check.status === "fail").length;
  const warningCheckCount = report.checks.filter((check) => check.status === "warn").length;
  return {
    status: report.status,
    checkedAt: report.checkedAt,
    projectId: report.projectId,
    manifestFileName: "manifest.json",
    checkCount: report.checks.length,
    failedCheckCount,
    warningCheckCount,
    checks: report.checks
  };
}
```

## CineJelly Translation Plan

- Add public API artifact validation DTOs in `src/api/artifact-response.ts`.
- Extend synchronous render responses with `artifactValidation` next to the artifact bundle.
- Extend render job summaries with `hasArtifactValidation`, compact `artifactValidationStatus`, and detailed `artifactValidation` only for per-job polling.
- Run `ProjectArtifactValidator` immediately after success or failure artifact writing in `src/api/render-job-manager.ts`.
- Keep validation bound to the job-owned artifact bundle; do not add a public endpoint that accepts arbitrary local paths.
- Record lineage in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` and `src/core/source-logic-translation-records.ts`.

## Validation Checklist

- Artifact validation is produced for async success artifacts when a manifest is written.
- Artifact validation is produced for async failure artifacts when a manifest is written.
- Artifact validation is produced for synchronous success artifacts when a manifest is written.
- Artifact validation is produced for synchronous failure artifacts when a manifest is written.
- Job terminal status is not overwritten by artifact validation status.
- Synchronous render status code is not overwritten by artifact validation status.
- Compact job summaries do not expose full validation checks.
- Per-job polling exposes validation checks without local artifact directories or manifest paths.
- No production runtime import from `external/upstream/`.
- Typecheck, build, focused job-manager smoke, and API endpoint smoke pass.
