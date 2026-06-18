# Reference Implementation: Production Graph Resume State Capsule

Implementation status as of 2026-06-19: CineJelly-owned TypeScript foundation implemented as `ProductionGraphResumeStateBuilder` and `FileProductionGraphResumeStateStore`, with `validation:graph-resume-state` producing a no-spend contract report. The capsule creates digest-only graph/provider-work resume context for future durable workers while refusing distributed-resume or customer-release claims.

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

## Intentional Changes

1. CineJelly does not copy upstream task managers, graph runtimes, or queue code.
2. The capsule is a typed TypeScript security boundary, not a Redis-compatible queue implementation.
3. The report stores node/edge/data digests and counts rather than replaying raw graph JSON.
4. The capsule requires action-ledger prediction IDs for any future provider callback worker, so the resume-state artifact does not become another sensitive provider-ID store.

## Production Destination

- `src/core/production-graph-resume-state.ts`
- `scripts/run-production-graph-resume-state-smoke.mjs`
- `schemas/production-graph-resume-state-report.schema.json`
- `scripts/validate-report-contracts.mjs`
- `scripts/run-commercial-launch-doctor.mjs`

## Validation Checklist

- `validation:graph-resume-state` builds TypeScript, creates a fake graph with intentionally unsafe prompt text, output URLs, local paths, bearer/token-like metadata, and provider prediction IDs.
- The persisted capsule reloads from disk.
- The capsule digest is stable for the same inputs.
- The active `clip_render` node is selected as the resume cursor when provider work is still running.
- The report confirms raw graph state, raw provider payloads, output URLs, local paths, secret-like text, and raw prediction IDs are absent from public evidence.
- Report contract validation rejects customer-release or distributed-resume claims for this local smoke.

## Remaining Scope

To claim distributed/HA resume parity, CineJelly still needs deployed durable worker execution, live queue enqueue evidence, live provider callbacks, production multi-worker ownership evidence, and archived graph-resume enqueue payload evidence bound to a passing live-action report.
