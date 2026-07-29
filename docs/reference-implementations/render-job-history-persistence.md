# Reference Implementation: Render Job History Persistence

Implementation status as of 2026-06-17: CineJelly-owned TypeScript foundation implemented as optional compact job-history persistence for retained async render jobs. Terminal jobs restore as compact history; stale queued/running jobs restore as canceled with an audit-required message because active provider work is not resumed automatically. Persisted summaries now also retain a bounded provider checkpoint summary derived from cost-ledger entries, including provider operations, prediction IDs, active/terminal prediction sets, retry evidence, and latest provider status for post-restart audit/reconciliation. `docs/reference-implementations/render-provider-reconciliation.md` extends this with provider-status query evidence, and `docs/reference-implementations/render-provider-handoff.md` adds local lease/action/heartbeat, protected lease-service, HTTPS external lease adapter, idempotent action-ledger evidence, local two-worker handoff smoke, and production handoff capture tooling while still avoiding a distributed resume claim. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/state.py` | MIT | Task state can be memory-backed or Redis-backed, and task lists remain operator-visible through paginated state reads. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/controllers/manager/memory_manager.py`, `external/upstream/moneyprinterturbo/app/controllers/manager/redis_manager.py` | MIT | Queue backends can change while the task contract stays stable. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic status/report refresh should preserve operator evidence without leaking local paths or provider internals. |

## Behavior To Preserve

1. Async task status should remain operator-visible across API restarts.
2. A durable backend must not change the public job status contract.
3. The persisted form should be bounded and pagination/list friendly.
4. Restored jobs must be marked as restored/compact so operators do not confuse them with live in-memory jobs that still have full artifact/result detail.
5. Persistence must not store raw render requests, local artifact directories, local filesystem paths, provider raw payloads, inline media, API keys, bearer tokens, or signed URLs.
6. Broken persistence configuration must be visible in preflight before customer traffic.
7. Queued/running jobs should not disappear after restart; they restore as canceled/audit-required compact history because the API cannot prove provider state after process loss.
8. When provider ledger entries exist before process loss, a bounded checkpoint summary should preserve enough prediction/asset ID evidence for an operator or future reconciliation worker to query provider state without storing raw provider payloads.

## Edge Cases

- No history path configured: job retention remains in-memory and preflight passes with an explicit disabled message.
- Empty history file: restore returns no jobs.
- Missing history file: restore returns no jobs, and the first accepted/updated job writes the file.
- Invalid JSON or schema drift: preflight fails and server startup with that configured history path should not silently ignore evidence corruption.
- History contains non-terminal jobs: restore converts them to canceled compact history with an audit-required error message.
- History contains provider checkpoint evidence: restore preserves bounded provider IDs, active prediction IDs, terminal prediction IDs, latest operation/status, and retry counts for audit.
- Restored jobs are listed and can be fetched by ID, but they do not expose raw result, cost ledger, or artifact detail that was not persisted.
- Stage progress messages containing local paths or bearer/API tokens are redacted before persistence.
- History exceeds retention limit: the latest summaries are retained and older summaries are pruned.

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
    providerCheckpoint?: {
      providerOperationCount: number;
      providers: readonly string[];
      operations: readonly string[];
      predictionIds: readonly string[];
      assetIds: readonly string[];
      activePredictionIds: readonly string[];
      terminalPredictionIds: readonly string[];
      latestProvider?: string;
      latestOperation?: string;
      latestProviderStatus?: string;
      latestProviderCallStatus?: string;
      latestPredictionId?: string;
      latestAssetId?: string;
      lastRecordedAt?: string;
      hasRetryableFailure: boolean;
      retryCount: number;
    };
    hasArtifacts: boolean;
    hasArtifactValidation: boolean;
    artifactValidationStatus?: "pass" | "warn" | "fail";
    hasError: boolean;
    error?: unknown;
  }[];
}

function persistCompactHistory(jobs: readonly RenderJobSummary[]) {
  const compactJobs = jobs
    .map((job) => redactLocalPathsAndSecrets(compact(job)))
    .slice(0, historyLimit);
  atomicWrite(historyPath, {
    schemaVersion: "cinejelly.render-job-history.v1",
    writtenAt: new Date().toISOString(),
    jobs: compactJobs
  });
}

function restoreHistory(historyFile): RestoredJob[] {
  assertSchema(historyFile);
  return historyFile.jobs.map((job) => ({
    ...parseStoredJob(job),
    status: job.status === "queued" || job.status === "running" ? "canceled" : job.status,
    retentionSource: "history_store",
    detailRetention: "compact_restored",
    error: job.status === "queued" || job.status === "running"
      ? "API restarted before terminal completion; provider state requires manual audit."
      : job.error
  }));
}
```

## CineJelly Translation Plan

- Done: add `RenderJobHistoryStore` under `src/api/render-job-history-store.ts`.
- Done: persist compact retained job summaries, not raw requests or local artifact paths.
- Done: restore retained compact jobs into `RenderJobManager` with `retentionSource: "history_store"` and `detailRetention: "compact_restored"`.
- Done: restore stale queued/running snapshots as canceled compact history with an audit-required error message instead of silently dropping them or pretending active work resumed.
- Done: persist a compact provider checkpoint summary from incremental provider ledger entries while jobs are active, then overwrite it from the final terminal cost ledger when available.
- Done: keep live jobs in memory with `detailRetention: "full"`.
- Done: wire optional `CINEJELLY_API_JOB_HISTORY_PATH` into `src/api/server.ts`.
- Done: add preflight validation for path writability and existing file schema.
- Done: add no-provider smoke validation through `tests/run-render-job-history-smoke.mjs`.

## Validation Checklist

- Typecheck and build pass.
- Smoke validation writes a history file, verifies secret/local-path redaction, loads the file, restores a terminal job, and converts a stale running job to canceled/audit-required through `RenderJobManager`.
- Smoke validation verifies provider checkpoint evidence survives terminal restore, stale-active restore, and history rewrite without storing raw provider payloads.
- `/v1/preflight` reports a pass when the configured history path is writable and valid.
- Public job summaries expose `retentionSource` and `detailRetention`.
- No production runtime import from `external/upstream/`.
- Source lineage is recorded in `DEFAULT_SOURCE_LOGIC_TRANSLATIONS`.

## Remaining Scope

This is not a Redis-compatible distributed queue, multi-process resume engine, automatic provider-state handoff worker, or full WebUI replacement. It improves commercial operator reliability by preserving compact job history plus provider prediction checkpoint evidence across API restarts and making stale active jobs visible as canceled/audit-required while keeping active provider calls and artifact detail under the existing runtime controls. Use the separate provider reconciliation, local handoff, protected lease-service, HTTPS external lease adapter, idempotent action-ledger execution replay, local two-worker handoff, and production handoff capture foundations to query checkpoint prediction IDs and exercise lease/action/heartbeat/replay/no-steal decisions, then prove production multi-worker resume behavior with live Atlas provider action execution before claiming distributed resume parity.
