# Reference Implementation: Render Provider Handoff

Implementation status as of 2026-06-19: CineJelly-owned TypeScript foundation implemented as `RenderProviderHandoffCoordinator`, `FileRenderProviderHandoffLeaseStore`, `HttpRenderProviderHandoffLeaseStore`, `RenderProviderHandoffLeaseService`, `FileRenderProviderHandoffActionLedger`, `ProductionGraphResumeStateBuilder`, `FileProductionGraphResumeStateStore`, `FileProductionGraphResumeQueueStore`, `ProductionGraphResumeQueueService`, `ProductionGraphResumeQueueHttpClient`, `RenderProviderGraphResumeWorker`, no-spend smoke reports, a production handoff capture runner, template/checklist helpers for live provider action evidence and graph-resume enqueue payload evidence, a live provider action evidence validator with separate graph-resume enqueue evidence counting and action/kind/result consistency checks, a digest-only graph-resume enqueue payload validator, and digest-only Production Graph resume-state/queue/worker smokes. It wraps provider reconciliation in bounded job leases so a worker can decide whether to close terminal provider work, heartbeat-renew still-active polling ownership, or defer to an existing lease holder. The protected HTTP lease-service route gives production deployments a built-in durable contract for external workers, the action ledger records redacted idempotent action intents, the resume-state capsule stores graph/provider-work replay context without raw graph JSON or URLs, the local queue store proves idempotent enqueue/replay/lease/ack lifecycle without raw queue names or worker IDs, the protected queue-service route exposes that digest-only queue lifecycle to deployment workers through `/v1/production-graph-resume-queue/*`, the graph-resume worker bridge enqueues only `resume_polling` capsules through the protected service and replays duplicate attempts by queue idempotency key, and the action executor boundary persists callback execution evidence so repeated worker runs do not duplicate terminal close/resume/manual-audit callbacks. The local two-worker smoke proves held-by-other behavior plus handoff after lease expiry against the protected route, the production capture runner can exercise the real HTTPS lease-service route without Atlas spend while redacting hostnames and lease job IDs from public operation responses, `validation:graph-resume-state` proves digest-only graph resume-state storage/reload plus local queue lifecycle, `validation:graph-resume-queue-service` proves deployment-token-protected enqueue/replay/lease/ack/records behavior against a local server and preflight queue path, `validation:provider-graph-resume-worker` proves action-ledger-to-capsule-to-protected-queue worker bridge behavior without Atlas calls, `validation:provider-live-action-draft` and `validation:provider-graph-resume-draft` give operators non-evidence templates that are intentionally rejected if copied directly, `validation:provider-live-actions` gives operators a machine-checkable contract for archived live provider callback evidence, and `validation:provider-graph-resume` validates archived enqueue payload digests bound to that live action report without storing raw graph state, provider payloads, output URLs, or queue secrets. This is still not a live Redis-compatible distributed queue or automatic graph resume engine.

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
10. A real deployment can capture acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service evidence without serializing deployment tokens, hostnames, worker owner IDs, probe job IDs, or raw lease job IDs from the list endpoint.
11. Live provider action evidence must be archived through an ignored operator-owned packet and validated before any resume/close/manual-audit provider callback is counted as production evidence.
12. Graph-resume enqueue evidence is counted separately from provider polling/closeout evidence so live callback evidence cannot be inflated into distributed-resume proof.
13. Graph-resume evidence is counted only when `action=resume_polling`, `providerCallKind=graph_resume_enqueue`, and `resultStatus=resume_enqueued` are all present on the same reviewed execution entry.
14. Live action evidence must match the production handoff deployment base URL fingerprint while public reports keep the deployment host redacted.
15. Graph-resume enqueue payload evidence must be archived separately as digest-only queue/graph/resume/prediction summaries and must match a passing live action graph-resume execution by action ID and job ID.
16. Graph resume-state capsules must be digest-only, reloadable, and free of raw graph state, raw provider payloads, output URLs, local paths, and secrets before any durable worker queue can reference them.
17. Local graph-resume queue records must be idempotent, leaseable, acknowledged by lease ID, reloadable, and free of raw queue names, worker IDs, raw prediction IDs, local paths, URLs, and secrets.
18. The protected Production Graph resume queue-service route must require a deployment token, validate its queue path through preflight, expose only digest-only queue records, and keep `canClaimDistributedResume=false` until live deployment evidence exists.
19. A worker bridge must map only idempotent `resume_polling` action records to matching digest-only resume-state capsules, enqueue through the protected queue service, skip terminal/manual-audit actions, replay duplicate attempts safely, and keep live/distributed evidence claims false.

## Intentional Changes

1. CineJelly does not copy MoneyPrinterTurbo Python memory or Redis manager code.
2. The local JSON store is for validation and single-host adapter design, not a distributed lock service.
3. The protected lease-service route is backed by a serialized durable store for single-service deployments; the HTTPS lease-store adapter remains a strict external-service contract with no dependency on Redis client libraries.
4. The coordinator reports handoff actions, the action ledger makes those action intents idempotent, the resume-state capsule records digest-only graph/provider-work context, the local queue store proves enqueue/replay/lease/ack lifecycle, the protected queue service exposes enqueue/replay/lease/ack/records over the deployment API, and the executor boundary lets a future live worker attach provider close/resume/manual-audit callbacks without changing the report contract. The live action and graph-resume payload validators check archived callback/enqueue proof, but still do not recreate render requests or continue the full Director graph after process loss.
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
- `src/api/production-graph-resume-queue-service.ts`
- `src/api/production-graph-resume-queue-client.ts`
- `src/api/render-provider-graph-resume-worker.ts`
- `src/core/production-graph-resume-state.ts`
- `src/api/server.ts`
- `tests/run-render-provider-handoff-smoke.mjs`
- `tests/run-render-provider-external-lease-smoke.mjs`
- `tests/run-render-provider-lease-service-smoke.mjs`
- `tests/run-render-provider-handoff-action-ledger-smoke.mjs`
- `tests/run-production-graph-resume-state-smoke.mjs`
- `tests/run-production-graph-resume-queue-service-smoke.mjs`
- `tests/run-render-provider-graph-resume-worker-smoke.mjs`
- `tests/run-render-provider-multi-worker-handoff-smoke.mjs`
- `scripts/capture-render-provider-production-handoff.mjs`
- `scripts/create-render-provider-live-action-evidence-draft.mjs`
- `scripts/validate-render-provider-live-actions.mjs`
- `scripts/create-render-provider-graph-resume-enqueue-evidence-draft.mjs`
- `scripts/validate-render-provider-graph-resume-enqueues.mjs`
- `schemas/render-provider-handoff-report.schema.json`
- `schemas/render-provider-lease-service-smoke-report.schema.json`
- `schemas/render-provider-handoff-action-ledger-report.schema.json`
- `schemas/production-graph-resume-state-report.schema.json`
- `schemas/production-graph-resume-queue-service-smoke-report.schema.json`
- `schemas/render-provider-graph-resume-worker-smoke-report.schema.json`
- `schemas/render-provider-multi-worker-handoff-report.schema.json`
- `schemas/render-provider-production-handoff-report.schema.json`
- `schemas/render-provider-live-action-evidence-draft-report.schema.json`
- `schemas/render-provider-live-action-evidence.schema.json`
- `schemas/render-provider-live-actions-report.schema.json`
- `schemas/render-provider-graph-resume-enqueue-evidence-draft-report.schema.json`
- `schemas/render-provider-graph-resume-enqueue-evidence.schema.json`
- `schemas/render-provider-graph-resume-enqueues-report.schema.json`
- `scripts/validate-report-contracts.mjs`

## Validation Checklist

- Typecheck and build pass.
- No-spend handoff smoke emits `cinejelly.render-provider-handoff.v1`.
- Smoke proves terminal close/release, still-active retained lease, held-by-other lease protection, and no-checkpoint skip.
- Smoke reloads the file lease store to prove retained active leases survive process reload.
- External lease smoke proves HTTPS-only base URL validation, bearer-auth request use without token serialization, acquire/release/heartbeat/list/active contract behavior, held-by-other protection, and owner-ID redaction from public reports.
- Lease-service smoke proves deployment-token-only HTTP routing, preflight lease path validation, durable acquire/release/heartbeat/list/active behavior, invalid-body rejection, and token non-serialization against a local server.
- Action-ledger smoke proves terminal-close, resume-polling, and manual-audit intents record once, replay by stable idempotency key on a second worker pass, execute callbacks once, persist execution evidence across reload, return `already_executed` on a second execution pass, and avoid raw provider payload/output URL/local path serialization.
- Production Graph resume-state smoke proves digest-only capsule creation/reload, stable capsule hashes for identical inputs, active clip-render cursor selection, action-ledger prediction-ID dependency, local queue enqueue/replay/lease/ack lifecycle, false release claims, and absence of raw graph state, provider payloads, output URLs, local paths, secret-like text, raw queue names, raw worker IDs, and raw prediction IDs from public evidence.
- Production Graph resume queue-service smoke starts the protected API locally, verifies unauthenticated queue calls fail, verifies preflight sees a writable queue path, exercises enqueue/replay/lease/wrong-ack/correct-ack/records through the deployment token, and keeps queue names, worker IDs, prediction IDs, deployment tokens, URLs, local paths, and secrets out of public evidence.
- Graph-resume worker smoke starts the protected API locally, records action-ledger intents, creates a matching digest-only capsule for one `resume_polling` action, enqueues it through the protected queue-service client, reruns the worker to prove idempotent replay, skips terminal/manual-audit actions, and keeps live-action, graph-resume-payload, distributed-resume, and customer-release claims false.
- Multi-worker handoff smoke starts the protected API locally, proves worker B receives `held_by_other` while worker A's retained lease is active, proves worker B acquires after lease expiry, and proves the action ledger replays the existing resume intent instead of recording a duplicate.
- Production handoff capture runner can call a real HTTPS deployment route for acquire, held-by-other, heartbeat, release, post-release handoff, list, and active lease-service evidence without calling Atlas or render endpoints, while redacting the deployment hostname and raw lease job IDs from public reports and retaining only a SHA-256 deployment base URL fingerprint for later binding.
- Live action evidence draft helper writes a template/checklist under ignored operator-output paths, keeps template-only marker fields and false live-callback booleans so direct copies cannot pass the evidence contract, and reports `canUseTemplateAsLiveProviderActionEvidence=false`, `canUseTemplateAsGraphResumeEvidence=false`, and `canClaimDistributedResume=false`.
- Live action evidence validator reads ignored `ops/render-provider-live-actions.json`, requires a passing production handoff capture from the same deployment base URL fingerprint, explicit `--confirm-live-provider-actions`, archived provider-call evidence for resume polling plus terminal closeout or manual-audit handoff, redaction review, safe placeholder-free action/job/provider/prediction identifiers, no raw provider payloads, no output URLs, safe evidence summaries without URLs/local paths/data URIs/secrets, consistent action/providerCallKind/resultStatus relationships, tracks only same-entry `resume_polling` + `graph_resume_enqueue` + `resume_enqueued` evidence as graph-resume evidence, only marks the distributed-resume evidence slice usable when graph-resume evidence exists, and keeps `canClaimDistributedResume=false`.
- Graph-resume enqueue draft helper writes a template/checklist under ignored operator-output paths, pre-fills action/job IDs when a live-action graph-resume execution exists, keeps template-only marker fields, placeholder digests, and `redactionReviewed=false` so direct copies cannot pass the evidence contract, and reports graph-resume/distributed/customer-release flags false.
- Graph-resume enqueue validator reads ignored `ops/render-provider-graph-resume-enqueues.json`, requires explicit `--confirm-graph-resume-enqueues`, requires a passing live-action report with usable graph-resume evidence, matches each enqueue to live action evidence by action ID and job ID, validates safe placeholder-free enqueue/action/job/idempotency identifiers plus digest-only queue/graph/resume/prediction fields, rejects raw graph state/provider payload/output URL storage, and keeps distributed-resume/customer-release claims false.
- Smoke proves raw provider payloads, bearer tokens, and local paths are not serialized into the handoff report.
- Report contract validation passes for `render_provider_handoff`, `render_provider_external_lease`, `render_provider_lease_service_smoke`, `render_provider_handoff_action_ledger`, `production_graph_resume_state`, `production_graph_resume_queue_service`, `render_provider_graph_resume_worker`, `render_provider_multi_worker_handoff`, optional `render_provider_production_handoff`, optional `render_provider_live_action_evidence_draft`, optional `render_provider_live_action_evidence`, optional `render_provider_live_actions`, optional `render_provider_graph_resume_enqueue_evidence_draft`, optional `render_provider_graph_resume_enqueue_evidence`, and optional `render_provider_graph_resume_enqueues` capture reports when present; the optional production handoff contract rejects usable-evidence flags unless operations are complete, deployment-only, host-redacted, fingerprinted, and free of raw lease job IDs, the resume-state, queue-service, and worker-bridge contracts reject raw URL/path/secret/prediction-ID/queue-name/worker-ID/token leakage, incomplete enqueue/replay lifecycle, and release claims, the draft-helper contracts reject live-action/graph-resume-payload/distributed-resume claims, the live action contract rejects pass reports that are not bound to that deployment fingerprint, and the graph-resume contract rejects enqueue payload evidence that is not bound to a passing live action graph-resume execution.
- Business completion audit keeps full distributed active provider-work resume visible as incomplete until production multi-worker ownership handoff, live provider action execution, graph-resume enqueue payload proof, and live Atlas prediction evidence exist.

## Remaining Scope

To claim distributed/HA parity, CineJelly still needs an actual deployed worker path that enqueues secure resumable graph state into an external durable queue, live close/cancel/resume execution against real provider IDs, graph-resume enqueue payload evidence from that worker, and archived deployment evidence across production workers. The current handoff foundation is the local lease, protected lease-service route, HTTPS adapter contract, heartbeat-renewal evidence, action-decision layer, idempotent action ledger, digest-only graph resume-state capsule, local graph-resume queue lifecycle, protected graph-resume queue-service contract, graph-resume worker bridge contract, local two-worker handoff smoke, production capture runner, live action evidence contract, and graph-resume enqueue payload evidence contract that those pieces can build on.
