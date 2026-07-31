# Director Agentic Media Reasoning

Implementation status as of 2026-06-21: reference-drafted and partially implemented through CineJelly-owned TypeScript foundations for short-pipeline planning, short viral/niche intelligence, reference-video pattern learning, durable redacted conversation-session storage, stored-session render handoff, review approval, short-plan async render-job handoff, async job progress, source-video analysis, generated-audio planning, material sourcing, and artifact evidence. This Reference Implementation is documentation-only and must not import or execute upstream `video-db/Director` Python or frontend code.

## Purpose

CineJelly needs a practical baseline for translating the `video-db/Director` idea of chat-driven media work into a commercial video-production backend. Director is useful because it treats natural-language video requests as agent/tool workflows with progress updates, media content payloads, and a conversational operator surface. CineJelly should preserve that product shape while keeping its own provider abstraction, cost gates, approval gates, artifact contracts, and Atlas-first render path.

## Source Logic

| Source | Local snapshot path | License state | Behavior used |
| --- | --- | --- | --- |
| `video-db/Director` | `external/upstream/director` | MIT | Natural-language reasoning engine, tool/agent selection, content-type payloads, progress updates, chat UI concepts, and media workflow agent catalog. |

Primary source files reviewed:

- `external/upstream/director/README.md`
- `external/upstream/director/backend/director/core/reasoning.py`
- `external/upstream/director/backend/director/agents/base.py`
- `external/upstream/director/backend/director/core/session.py`
- `external/upstream/director/backend/director/agents/text_to_movie.py`
- `external/upstream/director/backend/director/agents/video_generation.py`
- `external/upstream/director/backend/director/agents/audio_generation.py`

## Preserved Behavior

1. A natural-language request can be decomposed into smaller media workflow steps.
2. Agent/tool choices should remain explicit enough to show an operator what is happening.
3. Long-running media work should emit progress/status updates instead of hiding behind one blocking request.
4. Outputs should be typed as media/content artifacts rather than plain text only.
5. Missing inputs and ambiguous requests should route to review, confirmation, or safe blocking states before provider spend.
6. Short-form planning should understand platform/niche/creative-mode intent before provider spend, not only generate a generic script.
7. The future first-party UI should feel conversational, but the backend must remain auditable and provider-neutral.

## CineJelly Changes

1. CineJelly does not use Director's Python runtime, VideoDB dependency, or frontend code as product runtime code.
2. Agent/tool selection is currently represented by deterministic TypeScript planners, admission control, stage progress, source-video/material/audio planners, and review approval checkpoints rather than an unconstrained LLM tool-calling loop.
3. Cost, quota, client policy, redaction, artifact hashes, report contracts, and approval gates are mandatory before commercial rendering.
4. Product URL evidence is fingerprinted and claim-reviewed rather than treated as trusted page content.
5. Template suggestions are optional accelerators; natural-language intent and review checkpoints remain the primary workflow.
6. Viral/niche intelligence is deterministic no-spend strategy evidence, not live platform scraping or unrestricted trend imitation.
7. Reference-video learning stores fingerprints and pattern guidance only; unsafe local/private sources block, and copy/99%-clone requests become review-required originality guardrails.
8. Durable conversation sessions persist only redacted no-spend public evidence, are enabled explicitly through `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH`, and are scoped by API client for list/detail/render-handoff reads.
9. Stored sessions can create async render jobs only by reading the server-side saved plan, applying formal review checkpoints, preserving client scope, and requiring explicit render confirmation before approved evidence queues provider spend.
10. Accepted short-pipeline plans now hand off into CineJelly's normal async render-job lifecycle with confirmation, quota, review, idempotency, and artifact gates still active.
11. The static Short create/review shell with safe checkpoint controls is implemented, but accepted live reviewer operation evidence, media library, VideoDB collection controls, and 20+ agent parity are not yet implemented.

## Destination Paths

- `src/core/short-pipeline-planner.ts`
- `src/core/short-viral-intelligence-planner.ts`
- `src/core/short-pipeline-conversation.ts`
- `src/core/review-approval-system.ts`
- `src/api/short-pipeline-session-store.ts`
- `src/api/short-pipeline-create-page.ts`
- `src/api/server.ts`
- `src/api/render-job-manager.ts`
- `src/types/short-pipeline.ts`
- `src/types/short-viral-intelligence.ts`
- `src/types/review-approval.ts`
- `tests/run-short-pipeline-conversation-smoke.mjs`
- `tests/run-short-pipeline-session-store-smoke.mjs`
- `tests/run-short-pipeline-session-render-handoff-smoke.mjs`
- `tests/run-short-mvp-ui-contract-smoke.mjs`
- `tests/run-short-pipeline-smoke.mjs`
- `tests/run-short-viral-intelligence-smoke.mjs`
- `src/core/short-pipeline-render-handoff.ts`
- `schemas/short-pipeline-conversation-smoke-report.schema.json`
- `schemas/short-pipeline-session-store-smoke-report.schema.json`
- `schemas/short-pipeline-session-render-handoff-smoke-report.schema.json`
- `schemas/short-mvp-ui-contract-smoke-report.schema.json`
- `schemas/short-pipeline-smoke-report.schema.json`
- `schemas/short-viral-intelligence-smoke-report.schema.json`
- `docs/SHORT_PIPELINE_AGENTIC_DESIGN.md`
- `src/core/source-logic-translation-records.ts`

## Validation Command

```powershell
node .\node_modules\typescript\bin\tsc -p tsconfig.json
node scripts\run-short-pipeline-conversation-smoke.mjs
node scripts\run-short-pipeline-session-store-smoke.mjs
node scripts\run-short-pipeline-session-render-handoff-smoke.mjs
node scripts\run-short-viral-intelligence-smoke.mjs
node scripts\run-short-pipeline-smoke.mjs
node scripts\audit-snapshot-parity.mjs --no-output
```

## Acceptance Criteria

- The `video-db/Director` snapshot is present under `external/upstream/director` and recorded in snapshot inventory, subtree policy, credits, parity audit, project context, and source-lineage records.
- Runtime code does not import from `external/upstream/director`.
- A natural-language short-video brief can produce a no-spend plan with intent, optional template suggestions, scene plans, and scene/audio/caption/claim review checkpoints.
- Short viral/niche intelligence can infer TikTok/Douyin-first strategy, creative mode, buyer intent, concept scores, scene directives, and reference-video guardrails without provider spend.
- Durable no-spend conversation sessions can be persisted and reloaded without raw transcript, raw URLs, local paths, or secret-like values.
- Stored sessions can create paused or blocked render jobs without accepting client-side plan replacement or bypassing explicit confirmation.
- Async render jobs can be paused by review approval status before provider spend.
- Accepted short-pipeline review checkpoints can be converted into a normal async render-job submission only after explicit render confirmation, while pending review evidence remains paused before provider spend.
- Snapshot parity reports include a non-release-evidence Director parity estimate below 100% with explicit gaps.
- CineJelly does not claim hosted Director UI, VideoDB media-library, 20+ agent catalog, accepted live reviewer operation parity, or fully dynamic LLM tool-routing parity until those product surfaces are implemented and validated.
