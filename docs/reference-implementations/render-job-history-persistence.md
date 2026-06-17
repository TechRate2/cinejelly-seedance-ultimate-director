# Reference Implementation: Render Job History Persistence

Implementation status as of 2026-06-17: CineJelly-owned TypeScript foundation implemented as optional compact job-history persistence for terminal async render jobs. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/state.py` | MIT | Task state can be memory-backed or Redis-backed, and task lists remain operator-visible through paginated state reads. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/controllers/manager/memory_manager.py`, `external/upstream/moneyprinterturbo/app/controllers/manager/redis_manager.py` | MIT | Queue backends can change while the task contract stays stable. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic status/report refresh should preserve operator evidence without leaking local paths or provider internals. |

## Behavior To Preserve

1. Async task status should remain operator-visible after terminal states.
2. A durable backend must not change the public job status contract.
3. The persisted form should be bounded and pagination/list friendly.
4. Restored jobs must be marked as restored/compact so operators do not confuse them with live in-memory jobs that still have full artifact/result detail.
5. Persistence must not store raw render requests, local artifact directories, local filesystem paths, provider raw payloads, inline media, API keys, bearer tokens, or signed URLs.
6. Broken persistence configuration must be visible in preflight before customer traffic.
7. Queued/running jobs are runtime state; this foundation restores terminal retained history only. External queue resume can be added later as a separate backend.

## Edge Cases

- No history path configured: job retention remains in-memory and preflight passes with an explicit disabled message.
- Empty history file: restore returns no jobs.
- Missing history file: restore returns no jobs, and the first terminal update writes the file.
- Invalid JSON or schema drift: preflight fails and server startup with that configured history path should not silently ignore evidence corruption.
- History contains non-terminal jobs: validation rejects the file because only terminal jobs are durable in this foundation.
- Restored jobs are listed and can be fetched by ID, but they do not expose raw result, cost ledger, or artifact detail that was not persisted.
- Stage progress messages containing local paths or bearer/API tokens are redacted before persistence.
- History exceeds retention limit: the latest terminal summaries are retained and older summaries are pruned.

## Reference Implementation

```ts
interface StoredRenderJobSummary {
  schemaVersion: "cinejelly.render-job-history.v1";
  jobs: readonly {
    jobId: string;
    status: "succeeded" | "failed" | "canceled";
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    requestId?: string;
    projectId?: string;
    userInputPreview: string;
    requestedDurationSeconds?: number;
    requestedQualityMode?: string;
    requestedResolution?: string;
    referenceCount: number;
    stageProgressEvents: readonly RedactedProgressEvent[];
    hasResult: boolean;
    hasCostLedger: boolean;
    hasArtifacts: boolean;
    hasArtifactValidation: boolean;
    artifactValidationStatus?: "pass" | "warn" | "fail";
    hasError: boolean;
    error?: unknown;
  }[];
}

function persistTerminalHistory(jobs: readonly RenderJobSummary[]) {
  const terminal = jobs
    .filter((job) => isTerminal(job.status))
    .map((job) => redactLocalPathsAndSecrets(compact(job)))
    .slice(0, historyLimit);
  atomicWrite(historyPath, {
    schemaVersion: "cinejelly.render-job-history.v1",
    writtenAt: new Date().toISOString(),
    jobs: terminal
  });
}

function restoreHistory(historyFile): RestoredJob[] {
  assertSchema(historyFile);
  return historyFile.jobs.map((job) => ({
    ...parseStoredJob(job),
    retentionSource: "history_store",
    detailRetention: "compact_restored"
  }));
}
```

## CineJelly Translation Plan

- Done: add `RenderJobHistoryStore` under `src/api/render-job-history-store.ts`.
- Done: persist only compact terminal job summaries, not raw requests or local artifact paths.
- Done: restore terminal jobs into `RenderJobManager` with `retentionSource: "history_store"` and `detailRetention: "compact_restored"`.
- Done: keep live jobs in memory with `detailRetention: "full"`.
- Done: wire optional `CINEJELLY_API_JOB_HISTORY_PATH` into `src/api/server.ts`.
- Done: add preflight validation for path writability and existing file schema.
- Done: add no-provider smoke validation through `scripts/run-render-job-history-smoke.mjs`.

## Validation Checklist

- Typecheck and build pass.
- Smoke validation writes a history file, verifies secret/local-path redaction, loads the file, and restores a terminal job through `RenderJobManager`.
- `/v1/preflight` reports a pass when the configured history path is writable and valid.
- Public job summaries expose `retentionSource` and `detailRetention`.
- No production runtime import from `external/upstream/`.
- Source lineage is recorded in `DEFAULT_SOURCE_LOGIC_TRANSLATIONS`.

## Remaining Scope

This is not a Redis-compatible distributed queue, multi-process resume engine, or full WebUI replacement. It improves commercial operator reliability by preserving compact terminal job history across API restarts while keeping active render work, provider calls, and artifact detail under the existing runtime controls.
