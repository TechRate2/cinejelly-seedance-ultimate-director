# Reference Implementation: Render Provider Reconciliation

Implementation status as of 2026-06-17: CineJelly-owned TypeScript foundation implemented as `RenderProviderReconciler` plus a no-spend smoke report. It can query active prediction IDs from compact render-job checkpoints through the provider abstraction and return redacted terminal/still-active/query-failure evidence. This is not a Redis-compatible queue, multi-process lease manager, or automatic provider-work resume engine.

## Upstream Sources

- `harry0703/MoneyPrinterTurbo`: task state remains operator-visible through memory/Redis-like state backends, and stale tasks should not disappear.
- `vericontext/vibeframe`: deterministic status/report refresh discipline and validate-before-claim release evidence.
- Atlas Cloud Predictions docs: async prediction IDs can be queried for current status through provider-specific endpoints; raw provider responses must remain internal.

## Preserved Behavior

1. Restored async jobs keep operator-visible status evidence after process restart.
2. Active provider work is represented by bounded prediction IDs, not raw provider payloads.
3. Reconciliation is explicit evidence generation: it queries provider state and reports whether work is terminal, still active, unavailable, or failed to query.
4. Reports are deterministic JSON artifacts with schema validation.
5. Still-active predictions block a full "resolved" claim and must continue polling or be handed to a durable worker.

## Intentional Changes

1. CineJelly does not copy MoneyPrinterTurbo Python state or Redis code.
2. Provider reconciliation is provider-neutral TypeScript using `VideoProvider.getPrediction`.
3. The first implementation reports evidence only; it does not recreate render requests, resume graph execution, or claim ownership of provider-side jobs after process loss.
4. Raw provider responses, output URLs, local paths, secrets, signed URLs, and stack traces are excluded from the report.

## Edge Cases

- No checkpoint: skip the job and report `no_checkpoint`.
- Checkpoint with no active prediction IDs: pass the job as `no_active_provider_work`.
- Missing provider adapter: fail the job as `provider_unavailable`.
- Provider query error: fail the prediction as `query_failed` with a redacted name/message.
- Provider returns `queued` or `running`: warn as `still_active`.
- Provider returns `succeeded`, `failed`, `canceled`, or `timeout`: report terminal decision without exposing output URLs, only `outputUrlCount`.
- Mixed active prediction outcomes: report `mixed` and keep the report status at least `warn`.

## CineJelly Rewrite Shape

```ts
interface RenderProviderReconciler {
  reconcileSummaries(
    summaries: readonly RenderProviderReconciliationInput[],
    signal?: AbortSignal
  ): Promise<RenderProviderReconciliationReport>;
}
```

The report contains:

- job/checkpoint counts
- queried prediction count
- terminal and still-active counts
- provider unavailable and query failure counts
- per-job active/terminal prediction ID evidence
- per-prediction provider status, decision, terminal flag, output URL count, and redacted error
- release summary that always keeps `canClaimDistributedResume=false`

## Production Destination

- `src/api/render-provider-reconciler.ts`
- `tests/run-render-provider-reconciliation-smoke.mjs`
- `schemas/render-provider-reconciliation-report.schema.json`
- `scripts/validate-report-contracts.mjs`

## Validation Checklist

- Typecheck and build pass.
- No-spend reconciliation smoke emits `cinejelly.render-provider-reconciliation.v1`.
- Smoke proves terminal, still-active, and no-checkpoint branches.
- Smoke proves the report does not serialize fake raw provider payloads or local provider paths.
- Report contract validation passes for `render_provider_reconciliation`.
- Business completion audit keeps full distributed active provider-work resume visible as incomplete until production multi-worker ownership handoff and live provider resume/close behavior are implemented.

## Remaining Scope

`docs/reference-implementations/render-provider-handoff.md` now adds the local lease/action/heartbeat foundation, protected lease-service route, HTTPS external lease adapter, idempotent action-ledger execution replay, local two-worker no-steal/expiry handoff smoke, and production handoff capture runner on top of this reconciler. To claim distributed/HA parity, CineJelly still needs archived production multi-worker ownership handoff, live resume/cancel/close execution, and live provider evidence against real Atlas prediction IDs.
