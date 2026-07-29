# Reference Implementation: Production Graph Resume State Capsule

Implementation status as of 2026-06-19: CineJelly-owned TypeScript foundation implemented as `ProductionGraphResumeStateBuilder`, `FileProductionGraphResumeStateStore`, `FileProductionGraphResumeQueueStore`, the deployment-token-protected `ProductionGraphResumeQueueService`, `ProductionGraphResumeQueueHttpClient`, and `RenderProviderGraphResumeWorker`, with `validation:graph-resume-state`, `validation:graph-resume-queue-service`, and `validation:provider-graph-resume-worker` producing no-spend contract reports. The capsule creates digest-only graph/provider-work resume context for future durable workers, the local queue store proves idempotent enqueue, replay, lease, reload, and acknowledgement lifecycle, the protected HTTP queue service exposes that lifecycle to deployment workers, and the worker bridge maps only `resume_polling` action-ledger records to matching digest-only capsules while refusing distributed-resume or customer-release claims.

## Upstream Sources

- `harry0703/MoneyPrinterTurbo`: durable task state and externally visible resume ownership.
- `vericontext/vibeframe`: deterministic status/report evidence before release-facing claims.
- `HKUDS/ViMax`: graph-aware long-form workflow boundaries.
- `HKUDS/VideoAgent`: graph-style tool planning and separated resume context.

## Preserved Behavior

1. Resume state is durable enough to survive a process reload.
2. Resume state is tied to a render job and optional handoff action ID.
3. The graph resume cursor identifies the next work class without exposing raw graph nodes.
4. Provider prediction IDs are summarized by count and SHA-256 digest only; raw IDs remain in the action-ledger boundary.
5. Public reports keep raw graph state, raw provider payloads, output URLs, local paths, bearer tokens, and secrets out of serialized evidence.
6. Local evidence remains no-spend and cannot claim distributed resume, live queue execution, or customer traffic readiness.
7. Queue records store the queue name and worker ID as SHA-256 digests, replay duplicate enqueues by stable idempotency key, and persist lease/ack state across reload.
8. Worker bridge evidence enqueues only resume-polling actions with a matching capsule/action ID, skips terminal/manual-audit actions, and replays duplicate attempts without creating live-evidence claims.

## Intentional Changes

1. CineJelly does not copy upstream task managers, graph runtimes, or queue code.
2. The capsule, local queue store, protected HTTP queue service, HTTP client, and worker bridge are typed TypeScript security boundaries, not Redis-compatible queue implementations.
3. The report stores node/edge/data digests and counts rather than replaying raw graph JSON.
4. The capsule requires action-ledger prediction IDs for any future provider callback worker, so the resume-state artifact does not become another sensitive provider-ID store.

## Production Destination

- `src/core/production-graph-resume-state.ts`
- `src/api/production-graph-resume-queue-service.ts`
- `src/api/production-graph-resume-queue-client.ts`
- `src/api/render-provider-graph-resume-worker.ts`
- `src/api/server.ts`
- `tests/run-production-graph-resume-state-smoke.mjs`
- `tests/run-production-graph-resume-queue-service-smoke.mjs`
- `tests/run-render-provider-graph-resume-worker-smoke.mjs`
- `schemas/production-graph-resume-state-report.schema.json`
- `schemas/production-graph-resume-queue-service-smoke-report.schema.json`
- `schemas/render-provider-graph-resume-worker-smoke-report.schema.json`
- `scripts/validate-report-contracts.mjs`
- `scripts/run-commercial-launch-doctor.mjs`

## Validation Checklist

- `validation:graph-resume-state` builds TypeScript, creates a fake graph with intentionally unsafe prompt text, output URLs, local paths, bearer/token-like metadata, and provider prediction IDs.
- The persisted capsule reloads from disk.
- The capsule digest is stable for the same inputs.
- The local queue records the first enqueue and replays the second enqueue by idempotency key.
- The local queue leases the queued record to a worker, reloads the leased state from disk, acknowledges it by lease ID, and reloads the acknowledged state.
- `validation:graph-resume-queue-service` starts the local API, protects `/v1/production-graph-resume-queue/*` with the deployment token, validates preflight queue-path readiness, and proves enqueue/replay/lease/ack through HTTP without serializing raw queue names, raw worker IDs, raw prediction IDs, URLs, local paths, or tokens.
- `validation:provider-graph-resume-worker` starts the local API, records idempotent handoff actions, creates a matching digest-only capsule for one `resume_polling` action, enqueues it through the protected queue-service client, replays the second worker pass by queue idempotency key, skips terminal/manual-audit actions, and keeps live-action/graph-resume-payload/distributed-resume claims false.
- The active `clip_render` node is selected as the resume cursor when provider work is still running.
- The report confirms raw graph state, raw provider payloads, output URLs, local paths, secret-like text, raw queue names, raw worker IDs, and raw prediction IDs are absent from public evidence.
- Report contract validation rejects customer-release or distributed-resume claims for this local smoke.

## Remaining Scope

To claim distributed/HA resume parity, CineJelly still needs deployed durable worker execution against the protected queue service or an external HA queue backend, live queue enqueue evidence from that deployment, live provider callbacks, production multi-worker ownership evidence, and archived graph-resume enqueue payload evidence bound to a passing live-action report.
