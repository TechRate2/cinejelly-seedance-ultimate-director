# Reference Implementation: Render Provider Handoff

Implementation status as of 2026-06-17: CineJelly-owned TypeScript foundation implemented as `RenderProviderHandoffCoordinator`, `FileRenderProviderHandoffLeaseStore`, `HttpRenderProviderHandoffLeaseStore`, `RenderProviderHandoffLeaseService`, and no-spend smoke reports. It wraps provider reconciliation in bounded job leases so a worker can decide whether to close terminal provider work, heartbeat-renew still-active polling ownership, or defer to an existing lease holder. The protected HTTP lease-service route gives production deployments a built-in durable contract for external workers, and the HTTPS lease adapter can point to that route or another operator-owned service, but this is still not a live Redis-compatible distributed queue or automatic graph resume engine.

## Upstream Sources

- `harry0703/MoneyPrinterTurbo`: memory and Redis task managers keep task ownership and progress externally visible.
- `vericontext/vibeframe`: deterministic status refresh and report evidence should happen before release claims.
- Atlas Cloud Predictions docs: active prediction IDs can be queried and then closed, retained, or audited by an operator workflow.

## Preserved Behavior

1. Active provider work has explicit ownership before a worker tries to reconcile it.
2. Another worker's active lease is not stolen.
3. Terminal provider work releases the lease and becomes closeout evidence.
4. Still-active provider work keeps a heartbeat-renewed retained lease for continued polling.
5. Missing checkpoints or no-active-provider-work states are skipped without pretending work resumed.
6. Handoff reports remain redacted and schema-validated.

## Intentional Changes

1. CineJelly does not copy MoneyPrinterTurbo Python memory or Redis manager code.
2. The local JSON store is for validation and single-host adapter design, not a distributed lock service.
3. The protected lease-service route is backed by a serialized durable store for single-service deployments; the HTTPS lease-store adapter remains a strict external-service contract with no dependency on Redis client libraries.
4. The coordinator reports handoff actions; it does not recreate render requests or continue the full Director graph after process loss.
5. Reports do not include raw provider payloads, output URLs, hostnames, worker IDs, local paths, bearer tokens, or secrets.

## Edge Cases

- No checkpoint: `skip_no_checkpoint`.
- Checkpoint has no active prediction IDs: `skip_no_active_provider_work`.
- Lease held by another worker: `lease_unavailable`.
- Provider terminal succeeded: `close_terminal_succeeded` and release lease.
- Provider terminal failed/canceled/timeout: close terminal state and release lease, leaving downstream artifact/manual review to existing gates.
- Provider still active: `continue_polling`, heartbeat-renew the lease, and retain lease.
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
- heartbeat status and timestamp for retained active work
- handoff action
- active and terminal prediction IDs
- provider reconciliation decisions
- redacted prediction status evidence
- release summary with `canClaimDistributedResume=false`

## Production Destination

- `src/api/render-provider-handoff.ts`
- `src/api/render-provider-handoff-external-lease.ts`
- `src/api/render-provider-handoff-lease-service.ts`
- `src/api/server.ts`
- `scripts/run-render-provider-handoff-smoke.mjs`
- `scripts/run-render-provider-external-lease-smoke.mjs`
- `scripts/run-render-provider-lease-service-smoke.mjs`
- `schemas/render-provider-handoff-report.schema.json`
- `schemas/render-provider-lease-service-smoke-report.schema.json`
- `scripts/validate-report-contracts.mjs`

## Validation Checklist

- Typecheck and build pass.
- No-spend handoff smoke emits `cinejelly.render-provider-handoff.v1`.
- Smoke proves terminal close/release, still-active retained lease, held-by-other lease protection, and no-checkpoint skip.
- Smoke reloads the file lease store to prove retained active leases survive process reload.
- External lease smoke proves HTTPS-only base URL validation, bearer-auth request use without token serialization, acquire/release/heartbeat/list/active contract behavior, held-by-other protection, and owner-ID redaction from public reports.
- Lease-service smoke proves deployment-token-only HTTP routing, preflight lease path validation, durable acquire/release/heartbeat/list/active behavior, invalid-body rejection, and token non-serialization against a local server.
- Smoke proves raw provider payloads, bearer tokens, and local paths are not serialized into the handoff report.
- Report contract validation passes for `render_provider_handoff` and `render_provider_external_lease`.
- Business completion audit keeps full distributed active provider-work resume visible as incomplete until real multi-worker ownership handoff, idempotent worker actions, and live Atlas prediction evidence exist.

## Remaining Scope

To claim distributed/HA parity, CineJelly still needs queue task payloads or secure resumable graph state, idempotent close/cancel/resume actions against live provider IDs, and deployment evidence across multiple workers. The current handoff foundation is the local lease, protected lease-service route, HTTPS adapter contract, heartbeat-renewal evidence, and action-decision layer those pieces can build on.
