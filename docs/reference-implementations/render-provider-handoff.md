# Reference Implementation: Render Provider Handoff

Implementation status as of 2026-06-17: CineJelly-owned TypeScript foundation implemented as `RenderProviderHandoffCoordinator` plus `FileRenderProviderHandoffLeaseStore` and a no-spend smoke report. It wraps provider reconciliation in bounded job leases so a worker can decide whether to close terminal provider work, keep polling active predictions, or defer to an existing lease holder. This is still not a Redis-compatible distributed queue, production lease backend, or automatic graph resume engine.

## Upstream Sources

- `harry0703/MoneyPrinterTurbo`: memory and Redis task managers keep task ownership and progress externally visible.
- `vericontext/vibeframe`: deterministic status refresh and report evidence should happen before release claims.
- Atlas Cloud Predictions docs: active prediction IDs can be queried and then closed, retained, or audited by an operator workflow.

## Preserved Behavior

1. Active provider work has explicit ownership before a worker tries to reconcile it.
2. Another worker's active lease is not stolen.
3. Terminal provider work releases the lease and becomes closeout evidence.
4. Still-active provider work keeps a retained lease for continued polling.
5. Missing checkpoints or no-active-provider-work states are skipped without pretending work resumed.
6. Handoff reports remain redacted and schema-validated.

## Intentional Changes

1. CineJelly does not copy MoneyPrinterTurbo Python memory or Redis manager code.
2. The first lease store is a local JSON file foundation for validation and adapter design, not a distributed lock service.
3. The coordinator reports handoff actions; it does not recreate render requests or continue the full Director graph after process loss.
4. Reports do not include raw provider payloads, output URLs, hostnames, worker IDs, local paths, or secrets.

## Edge Cases

- No checkpoint: `skip_no_checkpoint`.
- Checkpoint has no active prediction IDs: `skip_no_active_provider_work`.
- Lease held by another worker: `lease_unavailable`.
- Provider terminal succeeded: `close_terminal_succeeded` and release lease.
- Provider terminal failed/canceled/timeout: close terminal state and release lease, leaving downstream artifact/manual review to existing gates.
- Provider still active: `continue_polling` and retain lease.
- Provider query failure or unavailable provider: `manual_audit_required` and release lease.

## CineJelly Rewrite Shape

```ts
interface RenderProviderHandoffCoordinator {
  run(
    summaries: readonly RenderProviderReconciliationInput[],
    signal?: AbortSignal
  ): Promise<RenderProviderHandoffReport>;
}
```

The lease store persists:

- schema version
- job ID
- lease ID
- owner ID
- acquired/renewed/expires/released timestamps

The public report omits owner ID and stores only:

- lease status and expiry
- handoff action
- active and terminal prediction IDs
- provider reconciliation decisions
- redacted prediction status evidence
- release summary with `canClaimDistributedResume=false`

## Production Destination

- `src/api/render-provider-handoff.ts`
- `scripts/run-render-provider-handoff-smoke.mjs`
- `schemas/render-provider-handoff-report.schema.json`
- `scripts/validate-report-contracts.mjs`

## Validation Checklist

- Typecheck and build pass.
- No-spend handoff smoke emits `cinejelly.render-provider-handoff.v1`.
- Smoke proves terminal close/release, still-active retained lease, held-by-other lease protection, and no-checkpoint skip.
- Smoke reloads the file lease store to prove retained active leases survive process reload.
- Smoke proves raw provider payloads and local paths are not serialized into the handoff report.
- Report contract validation passes for `render_provider_handoff`.
- Business completion audit keeps full distributed active provider-work resume visible as incomplete until an external lease backend, real worker ownership handoff, and live Atlas prediction evidence exist.

## Remaining Scope

To claim distributed/HA parity, CineJelly still needs an external lease backend, queue task payloads or secure resumable graph state, worker identity/heartbeat operations, idempotent close/cancel/resume actions against live provider IDs, and deployment evidence across multiple workers. The current handoff foundation is the local lease and action-decision layer those pieces can build on.
