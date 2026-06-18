# Reference Implementation: Render Provider Handoff

Implementation status as of 2026-06-18: CineJelly-owned TypeScript foundation implemented as `RenderProviderHandoffCoordinator`, `FileRenderProviderHandoffLeaseStore`, `HttpRenderProviderHandoffLeaseStore`, `RenderProviderHandoffLeaseService`, `FileRenderProviderHandoffActionLedger`, no-spend smoke reports, a production handoff capture runner, and a live provider action evidence validator. It wraps provider reconciliation in bounded job leases so a worker can decide whether to close terminal provider work, heartbeat-renew still-active polling ownership, or defer to an existing lease holder. The protected HTTP lease-service route gives production deployments a built-in durable contract for external workers, the action ledger records redacted idempotent action intents, and the action executor boundary persists callback execution evidence so repeated worker runs do not duplicate terminal close/resume/manual-audit callbacks. The local two-worker smoke proves held-by-other behavior plus handoff after lease expiry against the protected route, the production capture runner can exercise the real HTTPS lease-service route without Atlas spend, and `validation:provider-live-actions` gives operators a machine-checkable contract for archived live provider callback evidence. This is still not a live Redis-compatible distributed queue or automatic graph resume engine.

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
7. Worker action intents have stable idempotency keys so repeated handoff processing reuses existing records instead of duplicating terminal close or polling-resume intents.
8. Worker action callback execution is persisted by action ID so repeated executor runs report `already_executed` instead of calling the callback again.
9. A second worker cannot steal an active lease, but can take over after expiry while reusing the existing action intent.
10. A real deployment can capture acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service evidence without serializing deployment tokens or worker owner IDs.
11. Live provider action evidence must be archived through an ignored operator-owned packet and validated before any resume/close/manual-audit provider callback is counted as production evidence.

## Intentional Changes

1. CineJelly does not copy MoneyPrinterTurbo Python memory or Redis manager code.
2. The local JSON store is for validation and single-host adapter design, not a distributed lock service.
3. The protected lease-service route is backed by a serialized durable store for single-service deployments; the HTTPS lease-store adapter remains a strict external-service contract with no dependency on Redis client libraries.
4. The coordinator reports handoff actions, the action ledger makes those action intents idempotent, and the executor boundary lets a future live worker attach provider close/resume/manual-audit callbacks without changing the report contract. The live action evidence validator checks archived callback proof, but still does not recreate render requests or continue the full Director graph after process loss.
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
- `src/api/render-provider-handoff-action-ledger.ts`
- `src/api/server.ts`
- `scripts/run-render-provider-handoff-smoke.mjs`
- `scripts/run-render-provider-external-lease-smoke.mjs`
- `scripts/run-render-provider-lease-service-smoke.mjs`
- `scripts/run-render-provider-handoff-action-ledger-smoke.mjs`
- `scripts/run-render-provider-multi-worker-handoff-smoke.mjs`
- `scripts/capture-render-provider-production-handoff.mjs`
- `scripts/validate-render-provider-live-actions.mjs`
- `schemas/render-provider-handoff-report.schema.json`
- `schemas/render-provider-lease-service-smoke-report.schema.json`
- `schemas/render-provider-handoff-action-ledger-report.schema.json`
- `schemas/render-provider-multi-worker-handoff-report.schema.json`
- `schemas/render-provider-production-handoff-report.schema.json`
- `schemas/render-provider-live-action-evidence.schema.json`
- `schemas/render-provider-live-actions-report.schema.json`
- `scripts/validate-report-contracts.mjs`

## Validation Checklist

- Typecheck and build pass.
- No-spend handoff smoke emits `cinejelly.render-provider-handoff.v1`.
- Smoke proves terminal close/release, still-active retained lease, held-by-other lease protection, and no-checkpoint skip.
- Smoke reloads the file lease store to prove retained active leases survive process reload.
- External lease smoke proves HTTPS-only base URL validation, bearer-auth request use without token serialization, acquire/release/heartbeat/list/active contract behavior, held-by-other protection, and owner-ID redaction from public reports.
- Lease-service smoke proves deployment-token-only HTTP routing, preflight lease path validation, durable acquire/release/heartbeat/list/active behavior, invalid-body rejection, and token non-serialization against a local server.
- Action-ledger smoke proves terminal-close, resume-polling, and manual-audit intents record once, replay by stable idempotency key on a second worker pass, execute callbacks once, persist execution evidence across reload, return `already_executed` on a second execution pass, and avoid raw provider payload/output URL/local path serialization.
- Multi-worker handoff smoke starts the protected API locally, proves worker B receives `held_by_other` while worker A's retained lease is active, proves worker B acquires after lease expiry, and proves the action ledger replays the existing resume intent instead of recording a duplicate.
- Production handoff capture runner can call a real HTTPS deployment route for acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service evidence without calling Atlas or render endpoints.
- Live action evidence validator reads ignored `ops/render-provider-live-actions.json`, requires a passing production handoff capture, explicit `--confirm-live-provider-actions`, archived provider-call evidence for resume polling plus terminal closeout or manual-audit handoff, redaction review, no raw provider payloads, no output URLs, and keeps `canClaimDistributedResume=false`.
- Smoke proves raw provider payloads, bearer tokens, and local paths are not serialized into the handoff report.
- Report contract validation passes for `render_provider_handoff`, `render_provider_external_lease`, `render_provider_lease_service_smoke`, `render_provider_handoff_action_ledger`, `render_provider_multi_worker_handoff`, optional `render_provider_production_handoff`, optional `render_provider_live_action_evidence`, and optional `render_provider_live_actions` capture reports when present.
- Business completion audit keeps full distributed active provider-work resume visible as incomplete until production multi-worker ownership handoff, live provider action execution, and live Atlas prediction evidence exist.

## Remaining Scope

To claim distributed/HA parity, CineJelly still needs queue task payloads or secure resumable graph state, live close/cancel/resume execution against real provider IDs, and archived deployment evidence across production workers. The current handoff foundation is the local lease, protected lease-service route, HTTPS adapter contract, heartbeat-renewal evidence, action-decision layer, idempotent action ledger, local two-worker handoff smoke, production capture runner, and live action evidence contract that those pieces can build on.
