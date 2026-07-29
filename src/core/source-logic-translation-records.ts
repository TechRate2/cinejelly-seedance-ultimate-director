/**
 * Default source-logic lineage records for behavior already translated into CineJelly-owned runtime code.
 * These records are provenance metadata; they do not import or execute upstream snapshot code.
 */

import type { SourceLogicTranslationInput, SourceLogicTranslationRecord } from "../types/source-translation.js";
import { SourceLogicTranslationLedger } from "./source-logic-translation-ledger.js";

export const DEFAULT_SOURCE_LOGIC_TRANSLATIONS: readonly SourceLogicTranslationInput[] = [
  {
    logicName: "Prompt Reference Binding Plan",
    sourceRepository: "Emily2040/seedance-2.0",
    snapshotPath: "external/upstream/seedance-2.0",
    upstreamPaths: [
      "external/upstream/seedance-2.0/references/reference-workflow.md",
      "external/upstream/seedance-2.0/references/intent-vs-precision.md",
      "external/upstream/seedance-2.0/references/migrated/v5.2-legacy-skill-bodies/seedance-antislop.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "reference binding happens before prompt prose",
      "identity/product/endpoint references outrank environment, motion, camera, audio, and style cues",
      "source-video structure is planning guidance by default",
      "missing identity/product anchors produce repair findings before provider spend"
    ],
    behaviorChanged: [
      "rewritten into typed CineJelly PromptBindingPlan contracts",
      "provider capability filtering is explicit and provider-neutral",
      "Guardian preflight consumes binding conflicts before render calls"
    ],
    referenceImplementationPath: "docs/reference-implementations/prompt-reference-binding-plan.md",
    cineJellyDestinationPaths: [
      "src/types/prompt.ts",
      "src/prompt_compiler/reference-binding.ts",
      "src/prompt_compiler/prompt-compiler.ts",
      "src/core/consistency-guardian.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live provider capability data must stay aligned with Atlas Cloud schema",
      "reference selection scoring is a later ViMax-derived phase"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Prompt Reference Binding Plan",
    sourceRepository: "YouMind-OpenLab/awesome-seedance-2-prompts",
    snapshotPath: "external/upstream/awesome-seedance-2-prompts",
    upstreamPaths: [
      "external/upstream/awesome-seedance-2-prompts/README.md",
      "external/upstream/awesome-seedance-2-prompts/README_zh.md"
    ],
    license: "CC-BY-4.0",
    behaviorPreserved: [
      "prompt anatomy keeps references and continuity before scene prose",
      "camera, lighting, timing, audio, transition, and constraints remain ordered",
      "negative and anti-slop guidance stays distinct from positive prompt prose",
      "prompt timing, camera, proof, and retention primitives can feed ranked short idea candidates without bundling exact prompt examples"
    ],
    behaviorChanged: [
      "generalized prompt structure into CineJelly shot contracts",
      "exact community prompt text is not bundled in production code",
      "compression notes are emitted as metadata for operator review",
      "short creative pattern learning rewrites prompt-pattern inspiration into scored structural candidates rather than fixed prompt templates"
    ],
    referenceImplementationPath: "docs/reference-implementations/prompt-reference-binding-plan.md",
    cineJellyDestinationPaths: [
      "src/types/prompt.ts",
      "src/prompt_compiler/reference-binding.ts",
      "src/prompt_compiler/prompt-compiler.ts",
      "src/types/audience-niche-intelligence.ts",
      "src/core/audience-niche-intelligence.ts",
      "src/core/short-creative-pattern-learning.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "exact prompt examples require attribution/product review before bundling",
      "provider-specific prompt tags should be checked against current Atlas docs"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Separate Short Director Planning",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/skills/creative/short-form.md",
      "external/upstream/openmontage/skills/meta/checkpoint-protocol.md",
      "external/upstream/openmontage/skills/creative/broll-planning.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "short-form plans carry duration, hook, safe-zone, pacing, audio, and checkpoint guidance",
      "creative stages pause before provider spend when review is required",
      "source/reference learning is treated as structure guidance rather than content copying",
      "material decisions separate realistic stock needs from generated/stylized needs",
      "UI-facing review controls expose checkpoint decisions without bypassing reviewer/timestamp evidence"
    ],
    behaviorChanged: [
      "rewritten as clean CineJelly-owned TypeScript without copying AGPL implementation code",
      "visible text/caption rules are adapted to CineJelly no-visible-text policy",
      "Short Director is separate from Long Director so future UI can expose clear product modes",
      "approval packet drafts keep provider submission separate from review UI evidence"
    ],
    referenceImplementationPath: "docs/FAITHFUL_LOGIC_TRANSLATION_OpenMontage_2026-06-25.md",
    cineJellyDestinationPaths: [
      "src/types/short-director.ts",
      "src/core/short-director-planner.ts",
      "src/types/short-pipeline.ts",
      "src/types/short-mvp-ui.ts",
      "src/core/short-pipeline-planner.ts",
      "src/core/short-pipeline-render-handoff.ts",
      "src/core/short-mvp-ui-contract.ts",
      "src/api/short-pipeline-create-page.ts",
      "tests/run-short-mvp-ui-contract-smoke.mjs",
      "schemas/short-mvp-ui-contract-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "OpenMontage is AGPL, so behavior is a clean-room planning translation only",
      "caption advice is not copied directly into rendered-video text because current product policy forbids visible text"
    ],
    attributionPath: "docs/FAITHFUL_LOGIC_TRANSLATION_OpenMontage_2026-06-25.md"
  },
  {
    logicName: "Separate Long Director Planning",
    sourceRepository: "Emily2040/seedance-2.0",
    snapshotPath: "external/upstream/seedance-2.0",
    upstreamPaths: [
      "external/upstream/seedance-2.0/references/reference-workflow.md",
      "external/upstream/seedance-2.0/references/shot-list-continuity.md",
      "external/upstream/seedance-2.0/references/multishot-grammar.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "shot list and continuity ledger are stabilized before prompt prose",
      "reference roles are scoped before provider-bound generation",
      "multi-shot generation is bounded by duration budget and explicit Shot N labeling",
      "continuity-sensitive long-form work needs sequence bridges and narrow repair scopes"
    ],
    behaviorChanged: [
      "rewritten into a Long Director artifact that remains separate from Short Director logic",
      "series-bible and checkpoint policies are expressed as no-spend planning evidence",
      "long-form repair order is integrated with CineJelly Production Graph and Guardian concepts"
    ],
    referenceImplementationPath: "docs/FAITHFUL_LOGIC_TRANSLATION_Seedance2_2026-06-25.md",
    cineJellyDestinationPaths: [
      "src/types/long-director.ts",
      "src/types/long-director-ui.ts",
      "src/core/long-director-planner.ts",
      "src/core/long-director-ui-contract.ts",
      "src/types/artifact.ts",
      "src/types/review.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "src/api/server.ts",
      "src/types/long-form-creative-intelligence.ts",
      "src/core/long-form-creative-intelligence-planner.ts",
      "tests/run-long-form-creative-intelligence-smoke.mjs",
      "schemas/long-form-creative-intelligence-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "persistent cross-project series memory remains a later implementation phase",
      "future provider-router work must keep Seedance duration and mode constraints current"
    ],
    attributionPath: "docs/FAITHFUL_LOGIC_TRANSLATION_Seedance2_2026-06-25.md"
  },
  {
    logicName: "Guardian Repair Decision Provenance",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "same-camera and recent-prior-frame consistency priorities are captured for future reference scoring",
      "stale planning artifacts should be repaired without restarting the whole project",
      "reference and storyboard consistency issues route to narrow repair scopes"
    ],
    behaviorChanged: [
      "repair provenance is expressed through CineJelly GuardianReport contracts",
      "reference scoring remains planned for Phase 3 rather than embedded into Guardian reports",
      "affected graph nodes and recommended next steps are emitted as typed operator evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/guardian-repair-decision-provenance.md",
    cineJellyDestinationPaths: [
      "src/types/guardian.ts",
      "src/core/consistency-guardian.ts",
      "src/types/graph.ts",
      "src/core/production-graph-run-recorder.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "full ViMax reference selection scoring is intentionally deferred to Phase 3",
      "future graph consumers should preserve narrow repair scopes during orchestration"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Guardian Repair Decision Provenance",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "validate, plan/cost, build/render, inspect, repair, and refresh status loop ordering",
      "warnings stay visible in review artifacts without blocking delivery",
      "repair commands should target the affected scene, prompt, render, or delivery evidence"
    ],
    behaviorChanged: [
      "VibeFrame CLI report discipline is adapted into CineJelly review packet and Production Graph evidence",
      "repair scope is represented as typed GuardianReport metadata",
      "customer-facing artifacts stay redacted through existing CineJelly artifact serialization"
    ],
    referenceImplementationPath: "docs/reference-implementations/guardian-repair-decision-provenance.md",
    cineJellyDestinationPaths: [
      "src/types/guardian.ts",
      "src/core/consistency-guardian.ts",
      "src/types/review.ts",
      "src/core/review-packet-builder.ts",
      "src/types/graph.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "real review-packet inspection should be repeated after paid Atlas render validation",
      "future repair orchestration should consume recommendedNextStep rather than free-text only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Reference Selection Scoring",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "same-camera and same-composition references outrank generic references",
      "recent prior-frame references outrank stale scene references",
      "one identity portrait per character/view is selected",
      "duplicate references are dropped before max-reference bounding",
      "selected references are bounded to eight before provider request compilation"
    ],
    behaviorChanged: [
      "ViMax multimodal LLM selection is rewritten as deterministic CineJelly scoring evidence",
      "selected references are stored on ShotContract through ReferenceSelectionPlan",
      "Production Graph records selected and dropped candidate evidence for audit"
    ],
    referenceImplementationPath: "docs/reference-implementations/reference-selection-scoring.md",
    cineJellyDestinationPaths: [
      "src/types/prompt.ts",
      "src/core/reference-selection-planner.ts",
      "src/core/production-graph-builder.ts",
      "src/prompt_compiler/prompt-compiler.ts",
      "src/agents/director-agent.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "scoring depends on optional reference selection metadata when camera/composition/character-view evidence is available",
      "future visual-analysis modules can enrich references with better camera/composition metadata"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Reference Metadata Enrichment",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "camera, composition, character, view, and timeline metadata stay structured before reference scoring",
      "unauthorized references remain explicit so scoring can drop them before provider request compilation",
      "invalid metadata is rejected before downstream planning or provider spend"
    ],
    behaviorChanged: [
      "ViMax selection context is represented as bounded CineJelly PromptReferenceSelectionMetadata",
      "metadata is accepted through API admission and ReferenceLibrarian normalization rather than upstream runtime objects",
      "ReferenceSelectionPlanner consumes deterministic metadata fields without importing upstream code"
    ],
    referenceImplementationPath: "docs/reference-implementations/reference-metadata-enrichment.md",
    cineJellyDestinationPaths: [
      "src/types/prompt.ts",
      "src/api/render-request-admission.ts",
      "src/agents/reference-librarian.ts",
      "src/core/reference-selection-planner.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "automated camera/composition extraction from visual analyzers remains future work",
      "live provider validation is still needed to confirm selected reference payload behavior"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Reference Metadata Enrichment",
    sourceRepository: "HKUDS/VideoAgent",
    snapshotPath: "external/upstream/videoagent",
    upstreamPaths: [
      "external/upstream/videoagent/README.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "source-video analysis stays bounded and structured before it influences planning",
      "scene, keyframe, camera, pacing, and style evidence can feed graph/reference decisions",
      "source-video structure remains planning metadata rather than opaque prompt prose"
    ],
    behaviorChanged: [
      "caller-supplied SourceVideoDeconstruction is normalized by CineJelly contracts",
      "exact keyframe URI matches enrich PromptReferenceSelectionMetadata deterministically",
      "no upstream video-understanding runtime is imported or executed"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-reference-metadata-enrichment.md",
    cineJellyDestinationPaths: [
      "src/types/source-video.ts",
      "src/agents/source-video-analyst.ts",
      "src/agents/source-video-reference-metadata-enricher.ts",
      "src/agents/intake-director.ts",
      "src/core/reference-selection-planner.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "the source-video auto-analysis adapter can populate richer SourceVideoDeconstruction input, but live model validation remains pending",
      "derived composition IDs are deterministic hints, not semantic computer-vision claims"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Reference Metadata Enrichment",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "reference-video analysis should remain explicit and reviewable",
      "approval-sensitive source-video concepts should not be hidden inside prompt text",
      "source-derived metadata should stay inspectable before production handoff"
    ],
    behaviorChanged: [
      "AGPL implementation code is not copied or linked",
      "analysis concepts are rewritten into CineJelly-owned metadata enrichment",
      "source-video metadata enriches reference selection only after CineJelly normalization"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-reference-metadata-enrichment.md",
    cineJellyDestinationPaths: [
      "src/agents/source-video-reference-metadata-enricher.ts",
      "src/agents/intake-director.ts",
      "src/core/reference-selection-planner.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "legal review is still required before any direct AGPL implementation reuse",
      "current implementation uses approval behavior notes only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Reference Metadata Enrichment",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "camera, composition, scene order, and recent keyframe metadata should influence reference scoring",
      "same-camera matches tolerate formatting differences such as spaces, hyphens, and underscores",
      "explicit caller metadata remains higher priority than derived metadata"
    ],
    behaviorChanged: [
      "ViMax multimodal selection context is translated into deterministic CineJelly selection fields",
      "source-video-derived metadata fills only missing PromptReferenceSelectionMetadata fields",
      "ReferenceSelectionPlanner consumes normalized metadata without importing ViMax code"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-reference-metadata-enrichment.md",
    cineJellyDestinationPaths: [
      "src/agents/source-video-reference-metadata-enricher.ts",
      "src/agents/intake-director.ts",
      "src/core/reference-selection-planner.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future visual analyzers can supply richer scene/keyframe evidence",
      "derived composition IDs should be treated as scoring hints rather than definitive visual matches"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Provider Polling, Retry, And Cost Fidelity",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "provider spend follows validate, plan/cost, build/render, status refresh, and inspect ordering",
      "cost and status evidence must be visible in deterministic reports",
      "provider-heavy work is routed only after explicit planning and cost gates"
    ],
    behaviorChanged: [
      "CLI report discipline is rewritten into provider-neutral CostLedgerEntry records",
      "CineJelly records async polling outcomes through Atlas provider wait operations",
      "review packet cost summary counts failed, timeout, and canceled provider operations"
    ],
    referenceImplementationPath: "docs/reference-implementations/provider-polling-retry-cost.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts",
      "src/utils/retry.ts",
      "src/types/review.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid Atlas render validation is still required to confirm provider-returned status and usage payloads",
      "future provider routing should preserve ledger fields introduced in this phase"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Provider Polling, Retry, And Cost Fidelity",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/state.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "staged work updates should remain operator-visible",
      "terminal failure stops the current stage and records status evidence",
      "progress/state records should be bounded and inspectable"
    ],
    behaviorChanged: [
      "Python task state is translated into provider ledger and review packet evidence",
      "CineJelly uses AbortSignal-aware TypeScript polling instead of upstream task globals",
      "Atlas Cloud remains the default provider path rather than adopting upstream provider configuration"
    ],
    referenceImplementationPath: "docs/reference-implementations/provider-polling-retry-cost.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts",
      "src/providers/cost-ledger.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "render-job stage progress telemetry now covers active async jobs, but real long-form provider validation remains pending",
      "provider ledger state complements progress events but is still not a durable external job-progress stream"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Provider Polling, Retry, And Cost Fidelity",
    sourceRepository: "Atlas Cloud",
    snapshotPath: "https://www.atlascloud.ai/docs/en",
    upstreamPaths: [
      "https://www.atlascloud.ai/docs/en"
    ],
    license: "PROVIDER-DOCS",
    behaviorPreserved: [
      "async prediction submit/get/wait lifecycle is explicit",
      "Asset Library registration and activation polling remain separated",
      "upload responses that only provide clean temporary HTTPS media URLs remain usable as direct provider references",
      "provider-returned usage and cost fields are preserved when available"
    ],
    behaviorChanged: [
      "Atlas-specific payload mapping stays behind provider-neutral contracts",
      "timeout, abort, failed, and canceled outcomes are normalized into stable ProviderError codes",
      "ledger metadata records prediction ID, asset ID, provider status, retry count, graph node, model, and usage"
    ],
    referenceImplementationPath: "docs/reference-implementations/provider-polling-retry-cost.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts",
      "src/providers/atlascloud/atlas-cloud-http.ts",
      "src/agents/render-producer.ts",
      "src/utils/errors.ts",
      "src/utils/retry.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "Atlas Cloud public schema and model capability data must be rechecked before paid release",
      "real provider payloads may expose additional terminal states that need mapper updates"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "AtlasCloud Docs Conformance Preflight",
    sourceRepository: "Atlas Cloud",
    snapshotPath: "https://www.atlascloud.ai/docs",
    upstreamPaths: [
      "https://www.atlascloud.ai/docs/coding-plan/api",
      "https://www.atlascloud.ai/docs/upload-files",
      "https://www.atlascloud.ai/docs/more-models/bytedance/seedance-v1-pro-t2v-480p/generateVideo",
      "https://www.atlascloud.ai/docs/getResult",
      "https://www.atlascloud.ai/docs/public-api/balance"
    ],
    license: "PROVIDER-DOCS",
    behaviorPreserved: [
      "Coding Plan LLM traffic uses the documented /v1 endpoint family",
      "media upload and video generation use the documented /api/v1/model endpoint family",
      "billing readiness evidence is tied to the documented /public/v1/balance endpoint",
      "configured Seedance capability records must cover the admin-selected fast and standard model IDs"
    ],
    behaviorChanged: [
      "CineJelly validates endpoint-family and model-capability conformance locally before provider spend",
      "custom Atlas proxy hosts are allowed only as warning-state operator decisions",
      "secret key values are compared only in-process and never emitted"
    ],
    referenceImplementationPath: "docs/reference-implementations/atlascloud-docs-conformance-preflight.md",
    cineJellyDestinationPaths: [
      "src/application/runtime-preflight.ts",
      "docs/OPERATOR_RUNBOOK.md",
      "docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "Atlas provider schemas and model catalogs can still change after local preflight passes",
      "real paid validation remains required to prove live endpoint behavior and media quality"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Planning And Batch Workflow",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "long-form work is decomposed into renderable shots before provider spend",
      "story arcs preserve deterministic sequence groupings before scenes, beats, and shots",
      "sequence-level continuity anchors preserve identity, product, environment, style, source-video scene IDs, risk codes, and bridge intent before render",
      "continuity-sensitive dependencies remain explicit in scheduling and graph evidence",
      "source-video, transition, endpoint, and continuity-risk render barriers are visible in schedule evidence",
      "long-form multi-agent review is translated into role-specific script, continuity, source-video, render-orchestration, and commercial-risk findings before provider spend",
      "long-form timeline evidence exposes sequence/shot timing, render batches, caption coverage, generated-audio coverage, and manual-review segments before provider spend",
      "candidate and repair evidence remains traceable by shot"
    ],
    behaviorChanged: [
      "long-form lifecycle is represented through CineJelly ProductionStagePlan records",
      "material sourcing is separated from reference scoring and render selection",
      "stage, sequence-continuity, and agent-review evidence is emitted in review packets and durable artifacts",
      "ViMax-style agent reasoning is rewritten as deterministic TypeScript review evidence rather than executing upstream agents"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/core/production-stage-planner.ts",
      "src/core/render-scheduler.ts",
      "src/core/long-form-sequence-planner.ts",
      "src/types/long-form-continuity.ts",
      "src/core/long-form-continuity-planner.ts",
      "src/types/long-form-agent-review.ts",
      "src/core/long-form-agent-review-planner.ts",
      "src/types/long-form-timeline.ts",
      "src/core/long-form-timeline-planner.ts",
      "src/types/artifact.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/production-graph-builder.ts",
      "src/agents/director-agent.ts",
      "tests/run-render-scheduler-smoke.mjs",
      "schemas/render-scheduler-smoke-report.schema.json",
      "tests/run-production-graph-sequence-smoke.mjs",
      "schemas/production-graph-sequence-smoke-report.schema.json",
      "tests/run-long-form-continuity-smoke.mjs",
      "schemas/long-form-continuity-smoke-report.schema.json",
      "tests/run-long-form-agent-review-smoke.mjs",
      "schemas/long-form-agent-review-smoke-report.schema.json",
      "tests/run-long-form-timeline-smoke.mjs",
      "schemas/long-form-timeline-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "real 2-8 minute Atlas validation is still pending",
      "future source-video analysis should enrich dependency metadata beyond current shot contracts"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Planning And Batch Workflow",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "project stages remain deterministic and operator-visible",
      "artifact order preserves planning, storyboard, graph, schedule, cost, render, review, and delivery evidence",
      "story, sequence, scene, beat, and shot graph layers remain inspectable in deterministic artifacts",
      "sequence-level continuity evidence is persisted as a deterministic reviewable artifact",
      "agentic review findings are persisted as deterministic no-spend planning evidence",
      "timeline, caption, audio, render-batch, and manual-review segment evidence is persisted as deterministic no-spend planning evidence",
      "repair and inspection stages are separate lifecycle records"
    ],
    behaviorChanged: [
      "CLI project-loop status is rewritten into typed stage lifecycle records",
      "stage lifecycle, render schedule, continuity, and agent-review decisions are exposed through reviewable JSON artifacts",
      "CineJelly keeps Atlas Cloud as provider default instead of adopting upstream provider routing"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/render-scheduler.ts",
      "src/core/long-form-sequence-planner.ts",
      "src/types/long-form-continuity.ts",
      "src/core/long-form-continuity-planner.ts",
      "src/types/long-form-agent-review.ts",
      "src/core/long-form-agent-review-planner.ts",
      "src/types/long-form-timeline.ts",
      "src/core/long-form-timeline-planner.ts",
      "src/types/review.ts",
      "src/core/review-packet-builder.ts",
      "tests/run-render-scheduler-smoke.mjs",
      "schemas/render-scheduler-smoke-report.schema.json",
      "tests/run-production-graph-sequence-smoke.mjs",
      "schemas/production-graph-sequence-smoke-report.schema.json",
      "tests/run-long-form-continuity-smoke.mjs",
      "schemas/long-form-continuity-smoke-report.schema.json",
      "tests/run-long-form-agent-review-smoke.mjs",
      "schemas/long-form-agent-review-smoke-report.schema.json",
      "tests/run-long-form-timeline-smoke.mjs",
      "schemas/long-form-timeline-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "stage records currently describe a completed run rather than a persisted live task monitor",
      "future resumable long-running builds should preserve this stage schema"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Agentic Review Board",
    sourceRepository: "HKUDS/VideoAgent",
    snapshotPath: "external/upstream/videoagent",
    upstreamPaths: [
      "external/upstream/videoagent/README.md",
      "external/upstream/videoagent/tools/videorag",
      "external/upstream/videoagent/environment/roles"
    ],
    license: "MIXED",
    behaviorPreserved: [
      "video-workflow reasoning is decomposed into role-specific review decisions before generation",
      "source-video structure is treated as bounded evidence rather than raw media reproduction",
      "tool/agent readiness remains visible as operator-facing findings and directives",
      "blocking findings stop prompt compilation before provider spend"
    ],
    behaviorChanged: [
      "VideoAgent RAG/tool runtime code is not copied, imported, linked, or executed",
      "CineJelly uses deterministic TypeScript review rules and artifact contracts instead of an arbitrary tool-routing loop",
      "source-video evidence is reduced to scene IDs, labels, counts, and redacted directives"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/long-form-agent-review.ts",
      "src/core/long-form-agent-review-planner.ts",
      "src/agents/director-agent.ts",
      "src/types/artifact.ts",
      "src/types/review.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "tests/run-long-form-agent-review-smoke.mjs",
      "schemas/long-form-agent-review-smoke-report.schema.json",
      "scripts/validate-report-contracts.mjs"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "this is deterministic no-spend review-board evidence, not full VideoRAG/tool-graph parity",
      "live source-video and paid long-form media review evidence remain pending"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Planning And Batch Workflow",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/state.py",
      "external/upstream/moneyprinterturbo/app/services/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "one-input work becomes explicit stages",
      "material sourcing happens before final composition",
      "long-form production units stay grouped into sequence, scene, beat, and shot layers before render batches",
      "sequence-level continuity and bridge evidence stays visible before final composition",
      "render batches and sequential shot barriers are visible before final composition",
      "timeline evidence maps long-form shots to sequence timing, render batches, captions, supplied audio, and generated-audio intents before final composition",
      "batch candidates and final deliverable evidence are visible to operators"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task progress is adapted into CineJelly stage lifecycle records",
      "material sourcing is represented as governed briefs rather than immediate stock downloads",
      "batch render candidates remain Seedance/Atlas render candidates with graph, schedule, and review evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/core/material-sourcing-planner.ts",
      "src/types/graph.ts",
      "src/core/long-form-sequence-planner.ts",
      "src/types/long-form-continuity.ts",
      "src/core/long-form-continuity-planner.ts",
      "src/types/long-form-timeline.ts",
      "src/core/long-form-timeline-planner.ts",
      "src/core/production-graph-builder.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/render-scheduler.ts",
      "src/agents/director-agent.ts",
      "tests/run-render-scheduler-smoke.mjs",
      "schemas/render-scheduler-smoke-report.schema.json",
      "tests/run-production-graph-sequence-smoke.mjs",
      "schemas/production-graph-sequence-smoke-report.schema.json",
      "tests/run-long-form-continuity-smoke.mjs",
      "schemas/long-form-continuity-smoke-report.schema.json",
      "tests/run-long-form-timeline-smoke.mjs",
      "schemas/long-form-timeline-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live remote stock provider validation with real keys remains pending",
      "provider-backed TTS generation and BGM search/generation remain future dedicated modules"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Validation Runner",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/README.md",
      "external/upstream/vimax/agents/reference_image_selector.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "long-form validation stays duration-bound and continuity-sensitive before release claims",
      "manual review remains a separate post-artifact evidence step",
      "review readiness depends on artifact fingerprints rather than operator intent alone"
    ],
    behaviorChanged: [
      "CineJelly validates 120-480 second requests through no-spend gates before Atlas spend",
      "manual-review readiness is machine-checkable only after paid render, billing, artifact validation, duration, cost-ledger, and artifact fingerprints are ready",
      "manual-review readiness does not run ViMax agents, call providers, or approve customer traffic"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-validation-runner.md",
    cineJellyDestinationPaths: [
      "scripts/run-long-form-validation.mjs",
      "scripts/create-long-form-manual-quality-review-draft.mjs",
      "scripts/validate-long-form-manual-review-readiness.mjs",
      "schemas/long-form-validation-report.schema.json",
      "schemas/long-form-manual-quality-review.schema.json",
      "schemas/long-form-manual-quality-review-draft-report.schema.json",
      "schemas/long-form-manual-quality-review-readiness-report.schema.json",
      "scripts/validate-report-contracts.mjs",
      "scripts/run-commercial-launch-doctor.mjs",
      "docs/OPERATOR_RUNBOOK.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "readiness reports cannot replace a real paid 2-8 minute Atlas validation run",
      "accepted manual quality/redaction review still requires real media inspection by an operator or approved analyzer",
      "full DirectorBench parity still requires separate semantic, audio, runtime, and governance evidence"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Material Source Adapter Validation",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/material.py",
      "external/upstream/moneyprinterturbo/app/services/video.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "source material is treated as an explicit stage before composition and delivery",
      "material candidates stay tied to task/brief evidence",
      "terminal source-material failures remain operator-visible"
    ],
    behaviorChanged: [
      "upstream material download/provider code is not reused",
      "adapter output is validated through CineJelly MaterialSourceValidationReport contracts",
      "planned-only runs remain explicit when no adapter candidates have been supplied"
    ],
    referenceImplementationPath: "docs/reference-implementations/material-source-adapter-validation.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/core/material-source-validator.ts",
      "src/agents/director-agent.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live provider validation should inspect real local and remote stock material candidates",
      "paid end-to-end validation should inspect material-source-validation artifacts"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Material Source Adapter Validation",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "source material validation emits deterministic report evidence",
      "unsafe or rejected inputs are surfaced before release decisions",
      "review-required warnings remain operator-visible without pretending approval"
    ],
    behaviorChanged: [
      "CLI validation discipline is translated into CineJelly artifact validation",
      "material validation status feeds stage lifecycle and review packet planning evidence",
      "provider-specific fulfillment remains behind future adapters"
    ],
    referenceImplementationPath: "docs/reference-implementations/material-source-adapter-validation.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/core/material-source-validator.ts",
      "src/core/production-stage-planner.ts",
      "src/core/review-packet-builder.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "operator release review must inspect actual material candidates once adapters are enabled",
      "future resumable material-source jobs should preserve this validation schema"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Material Source Adapter Validation",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "real-footage or source-material approval must be explicit before production handoff",
      "unsafe or rights-unclear material should route to operator review",
      "approval-gate concepts inform validation status and issue repair text"
    ],
    behaviorChanged: [
      "AGPL implementation code is not copied or linked",
      "approval concepts are rewritten into CineJelly-owned TypeScript validation contracts",
      "material candidates are validated independently from OpenMontage runtime architecture"
    ],
    referenceImplementationPath: "docs/reference-implementations/material-source-adapter-validation.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/core/material-source-validator.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "legal review is still required before any direct AGPL implementation reuse",
      "current implementation uses approval behavior notes only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Local Material Library Adapter",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/material.py",
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "material fulfillment is an explicit stage before final composition",
      "candidate lists stay bounded and tied back to task or brief evidence",
      "missing material fulfillment remains visible instead of being silently treated as approved"
    ],
    behaviorChanged: [
      "upstream downloader/provider code is not reused",
      "operator-owned catalogs resolve into CineJelly MaterialCandidate contracts",
      "safe asset URIs and rights metadata are validated before candidates can be selected"
    ],
    referenceImplementationPath: "docs/reference-implementations/local-material-library-adapter.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/types/settings.ts",
      "src/core/local-material-library-adapter.ts",
      "src/config/runtime-config.ts",
      "src/application/director-factory.ts",
      "src/application/runtime-preflight.ts",
      "src/agents/director-agent.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "catalog quality depends on operator-owned rights review before deployment",
      "remote stock provider adapters require live provider validation before release"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Local Material Library Adapter",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "configured inputs are validated before expensive build or render work",
      "source-material evidence remains deterministic and operator-reviewable",
      "invalid configuration fails preflight instead of failing during provider spend"
    ],
    behaviorChanged: [
      "VibeFrame validation discipline is rewritten into CineJelly runtime preflight",
      "local catalog validation reuses CineJelly adapter normalization",
      "material candidates continue through centralized MaterialSourceValidator before release evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/local-material-library-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/local-material-library-adapter.ts",
      "src/application/runtime-preflight.ts",
      "src/core/material-source-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "preflight validates catalog shape and safe URIs but cannot prove business rights beyond provided metadata",
      "artifact review remains required after paid provider validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Local Material Library Adapter",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "real-footage and source-material approval must be explicit",
      "unsafe or rights-unclear material routes to review instead of release",
      "approval concepts inform source-material gate behavior"
    ],
    behaviorChanged: [
      "AGPL implementation code is not copied, linked, or executed",
      "approval-gate ideas are rewritten as CineJelly-owned catalog and validation behavior",
      "local material candidates use CineJelly contracts and safe URI constraints"
    ],
    referenceImplementationPath: "docs/reference-implementations/local-material-library-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/local-material-library-adapter.ts",
      "src/core/material-source-validator.ts",
      "src/application/runtime-preflight.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "legal review is still required before any direct AGPL implementation reuse",
      "current implementation uses approval behavior notes only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Remote Stock Material Adapter",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/material.py",
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "remote stock search happens as an explicit material stage before composition",
      "search terms, minimum duration, aspect, and provider source shape candidate retrieval",
      "candidate counts are bounded and tied back to material briefs"
    ],
    behaviorChanged: [
      "upstream downloader/provider code is not reused",
      "provider keys are parsed through secret-safe runtime configuration",
      "candidate URIs must be credential-free HTTPS and pass CineJelly MaterialSourceValidator",
      "no-spend adapter smoke validates provider credential boundaries, unsafe URL filtering, Coverr approval gating, fail-closed behavior, and aggregate material validation before live provider calls"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/types/settings.ts",
      "src/core/remote-stock-material-adapter.ts",
      "src/config/runtime-config.ts",
      "src/application/director-factory.ts",
      "src/application/runtime-preflight.ts",
      "src/agents/director-agent.ts",
      "tests/run-remote-stock-adapter-smoke.mjs",
      "schemas/remote-stock-adapter-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live Pexels/Pixabay/Coverr payloads must be validated with real keys before release",
      "provider license and attribution terms must be reviewed by the operator before customer use"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Remote Stock Material Adapter",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "provider-heavy work is enabled only after configuration validation",
      "remote material evidence remains deterministic and operator-reviewable",
      "invalid provider readiness fails preflight before expensive render work"
    ],
    behaviorChanged: [
      "VibeFrame validation discipline is rewritten into CineJelly remote stock preflight",
      "candidate metadata is redacted and safe for artifacts",
      "remote stock adapter output stays behind centralized material validation",
      "fake-fetch adapter smoke keeps provider response compatibility and report redaction checks separate from live provider evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/remote-stock-material-adapter.ts",
      "src/application/runtime-preflight.ts",
      "src/core/material-source-validator.ts",
      "src/core/review-packet-builder.ts",
      "tests/run-remote-stock-adapter-smoke.mjs",
      "schemas/remote-stock-adapter-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "preflight checks local readiness but cannot prove live provider response compatibility",
      "artifact review remains required after live provider validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Remote Stock Material Adapter",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "source-material approval must be explicit before production handoff",
      "rights-unclear or unsafe material routes to review instead of release",
      "approval-gate concepts inform remote stock candidate validation"
    ],
    behaviorChanged: [
      "AGPL implementation code is not copied, linked, or executed",
      "approval concepts are rewritten into CineJelly-owned provider gating and validation",
      "Coverr commercial-use approval is explicit before that provider can be enabled",
      "adapter smoke proves approval-gate and unsafe-output rejection behavior without importing or executing OpenMontage runtime"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/remote-stock-material-adapter.ts",
      "src/core/material-source-validator.ts",
      "src/application/runtime-preflight.ts",
      "tests/run-remote-stock-adapter-smoke.mjs",
      "schemas/remote-stock-adapter-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "legal review is still required before any direct AGPL implementation reuse",
      "current implementation uses approval behavior notes only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Job Stage Progress Telemetry",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "long-running jobs expose task state before final artifacts are available",
      "stage progress remains visible for terminal failures",
      "progress is tied to the same production stages used for final run evidence"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime code is not imported or executed",
      "CineJelly emits provider-neutral stage progress events from DirectorAgent",
      "job list responses stay compact while per-job detail exposes retained bounded events"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-job-stage-progress.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/agents/director-agent.ts",
      "src/application/director-factory.ts",
      "src/api/render-job-manager.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "real long-form Atlas runs must validate event ordering under provider latency and failures",
      "current in-process retention is bounded and not a durable event stream"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Job Stage Progress Telemetry",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "operator-visible status refresh follows deterministic stage vocabulary",
      "runtime progress complements final build/review reports",
      "failure visibility stays bounded and redacted"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten into CineJelly stage progress contracts",
      "progress events are API/job metadata rather than a CLI-only status display",
      "full final evidence remains in stage lifecycle artifacts after completion"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-job-stage-progress.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/core/production-stage-planner.ts",
      "src/agents/director-agent.ts",
      "src/api/render-job-manager.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "artifact and API review after a paid run must verify progress events remain redacted",
      "durable external queue backends may need their own event persistence adapter later"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Job History Persistence",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/state.py",
      "external/upstream/moneyprinterturbo/app/controllers/manager/memory_manager.py",
      "external/upstream/moneyprinterturbo/app/controllers/manager/redis_manager.py",
      "external/upstream/moneyprinterturbo/test/services/test_state.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "task status remains operator-visible across API process restarts",
      "the public task/job contract stays stable while persistence backend details change",
      "task lists remain bounded and suitable for operator polling",
      "stale queued/running state is not silently dropped after restart",
      "provider operation checkpoints remain available for post-restart audit when ledger entries were recorded before process loss"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo Python state and Redis manager code is not copied or executed",
      "CineJelly persists compact summaries rather than raw queued work",
      "raw render requests, local artifact directories, and provider payloads are intentionally excluded from persisted history",
      "provider checkpoint persistence stores only bounded IDs/status/count evidence rather than raw provider responses",
      "stale queued/running snapshots restore as canceled/audit-required instead of resuming provider work without proof"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-job-history-persistence.md",
    cineJellyDestinationPaths: [
      "src/api/render-job-history-store.ts",
      "src/api/render-job-manager.ts",
      "src/api/server.ts",
      "src/application/runtime-preflight.ts",
      "src/application/director-factory.ts",
      "src/providers/cost-ledger.ts",
      "tests/run-render-job-history-smoke.mjs"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "this foundation restores active snapshots as audit-required canceled history and does not resume active provider work after process restart",
      "distributed queue backends would need a separate adapter and deployment-specific validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Job History Persistence",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "operator status evidence remains deterministic and refreshable",
      "history persistence preserves release-facing status without exposing local paths",
      "preflight surfaces persistence misconfiguration before customer traffic",
      "stale active work is surfaced for operator audit after restart",
      "provider prediction IDs and latest provider status can be retained as compact checkpoint evidence"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten as a compact JSON history snapshot",
      "CineJelly marks restored jobs as compact history rather than pretending full runtime detail is still resident",
      "history persistence is local-file optional and no-provider by default",
      "provider checkpoint evidence is captured through a cost-ledger observer instead of importing VibeFrame status code",
      "queued/running snapshots restore as canceled/audit-required because provider state cannot be proven after process loss"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-job-history-persistence.md",
    cineJellyDestinationPaths: [
      "src/api/render-job-history-store.ts",
      "src/api/render-job-manager.ts",
      "src/application/director-factory.ts",
      "src/providers/cost-ledger.ts",
      "src/application/runtime-preflight.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "manual deployment review must ensure the configured history path is on durable storage for production",
      "artifact detail remains governed by artifact manifests and is not duplicated into the compact job history file"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Provider Reconciliation",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/state.py",
      "external/upstream/moneyprinterturbo/app/controllers/manager/redis_manager.py",
      "external/upstream/moneyprinterturbo/test/services/test_state.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "operator-visible task state can be revisited after process restart",
      "active provider work remains tied to compact task/job evidence",
      "provider state is refreshed explicitly before claiming active work is resolved"
    ],
    behaviorChanged: [
      "CineJelly queries active prediction IDs through provider-neutral TypeScript contracts",
      "reconciliation produces redacted evidence instead of mutating a Redis task backend",
      "raw provider payloads, output URLs, local paths, secrets, and stack traces are excluded from reports",
      "the report refuses to claim distributed resume without durable queue leasing"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-provider-reconciliation.md",
    cineJellyDestinationPaths: [
      "src/api/render-provider-reconciler.ts",
      "tests/run-render-provider-reconciliation-smoke.mjs",
      "schemas/render-provider-reconciliation-report.schema.json",
      "scripts/validate-report-contracts.mjs"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live provider reconciliation still needs operator-approved Atlas prediction evidence",
      "automatic resume/cancel/close behavior requires durable queue leases and ownership handoff"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Provider Reconciliation",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "status refresh produces deterministic report evidence",
      "release-facing reports distinguish pass, warning, and failure states",
      "provider evidence stays bounded and redacted"
    ],
    behaviorChanged: [
      "VibeFrame status-report discipline is rewritten into CineJelly provider reconciliation contracts",
      "still-active predictions produce warnings rather than release approval",
      "distributed resume remains an explicit future worker concern"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-provider-reconciliation.md",
    cineJellyDestinationPaths: [
      "src/api/render-provider-reconciler.ts",
      "tests/run-render-provider-reconciliation-smoke.mjs",
      "schemas/render-provider-reconciliation-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "operator tooling must not treat a no-spend fake-provider smoke as live Atlas reconciliation evidence",
      "future live scripts must preserve the same redaction boundary"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Provider Handoff",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/state.py",
      "external/upstream/moneyprinterturbo/app/controllers/manager/memory_manager.py",
      "external/upstream/moneyprinterturbo/app/controllers/manager/redis_manager.py",
      "external/upstream/moneyprinterturbo/test/services/test_state.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "long-running task ownership remains externally visible before a worker changes task state",
      "an active task lease should not be stolen from another worker",
      "terminal provider work can be closed while still-active provider work heartbeat-renews a retained lease for polling",
      "state evidence is durable enough to survive the local smoke process reload",
      "queue/state backend concerns stay behind an adapter contract",
      "live provider action evidence must be archived and reviewed before replay callbacks count as production resume proof",
      "live provider action evidence templates must stay template-only and fail direct evidence validation until real callback fields replace placeholders",
      "graph-resume enqueue evidence must be counted separately from provider polling and terminal-close callbacks before distributed-resume evidence can be considered usable",
      "graph-resume evidence requires same-entry action/kind/result consistency instead of loose provider-call or status matching",
      "graph-resume enqueue payload evidence must be archived as digest-only queue, graph state, resume cursor, and prediction-ID summaries bound to live action evidence",
      "live provider action evidence must be bound to the same deployment fingerprint as the production handoff capture",
      "secure graph resume state must be stored as bounded digest-only capsule evidence before any durable worker queue can use it",
      "local graph-resume queue records must replay duplicate enqueue attempts by idempotency key, lease by worker hash, and acknowledge by lease ID without exposing raw queue names or worker IDs",
      "protected graph-resume queue service calls must require a deployment token, validate preflight queue-path readiness, and expose only digest-only enqueue/replay/lease/ack/records evidence",
      "graph-resume worker bridge must enqueue only matching resume-polling capsules through the protected queue service and replay duplicate attempts without exposing raw queue names or prediction IDs"
    ],
    behaviorChanged: [
      "CineJelly implements a typed TypeScript handoff coordinator instead of copying MoneyPrinterTurbo Python memory or Redis managers",
      "local JSON and HTTPS lease-store adapters replace direct Redis coupling in the production TypeScript boundary",
      "the protected HTTP lease-service route and HTTPS adapter validate bearer-auth acquire, release, heartbeat, list, and active contracts, local two-worker smoke validates no-steal plus post-expiry handoff behavior, production capture tooling can exercise the real HTTPS lease-service route while redacting deployment hostnames/raw lease job IDs and retaining only a deployment fingerprint, a live action evidence draft helper writes a template/checklist that cannot count as proof, live action evidence validation checks archived provider callbacks plus action/kind/result/deployment-fingerprint consistency, graph-resume queue-service validation proves protected HTTP enqueue/lease/ack behavior, graph-resume worker bridge validation proves action-ledger-to-capsule-to-protected-queue enqueue/replay behavior, and graph-resume enqueue payload validation checks digest-only queue/graph/resume/prediction evidence without claiming distributed resume parity",
      "ProductionGraphResumeStateBuilder, FileProductionGraphResumeStateStore, FileProductionGraphResumeQueueStore, ProductionGraphResumeQueueService, ProductionGraphResumeQueueHttpClient, and RenderProviderGraphResumeWorker add a digest-only graph resume-state capsule plus local, protected-HTTP, and worker-bridged enqueue/replay/lease/ack queue lifecycle that records node/edge/provider-work summaries without raw graph state, raw provider payloads, output URLs, local paths, raw queue names, raw worker IDs, or secrets",
      "idempotent action-ledger records let terminal-close, resume-polling, and manual-audit intents replay by stable key without duplicating worker action records or callback execution evidence",
      "handoff reports expose redacted lease/action evidence and refuse to claim distributed resume parity",
      "raw provider payloads, output URLs, hostnames, raw lease job IDs, worker owner IDs, local paths, bearer tokens, and secrets are excluded from public reports"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-provider-handoff.md",
    cineJellyDestinationPaths: [
      "src/api/render-provider-handoff.ts",
      "src/api/render-provider-handoff-external-lease.ts",
      "src/api/render-provider-handoff-lease-service.ts",
      "src/api/render-provider-handoff-action-ledger.ts",
      "src/api/production-graph-resume-queue-service.ts",
      "src/api/production-graph-resume-queue-client.ts",
      "src/api/render-provider-graph-resume-worker.ts",
      "src/core/production-graph-resume-state.ts",
      "src/api/server.ts",
      "tests/run-render-provider-handoff-smoke.mjs",
      "tests/run-render-provider-external-lease-smoke.mjs",
      "tests/run-render-provider-lease-service-smoke.mjs",
      "tests/run-render-provider-handoff-action-ledger-smoke.mjs",
      "tests/run-production-graph-resume-state-smoke.mjs",
      "tests/run-production-graph-resume-queue-service-smoke.mjs",
      "tests/run-render-provider-graph-resume-worker-smoke.mjs",
      "tests/run-render-provider-multi-worker-handoff-smoke.mjs",
      "scripts/capture-render-provider-production-handoff.mjs",
      "scripts/create-render-provider-live-action-evidence-draft.mjs",
      "scripts/validate-render-provider-live-actions.mjs",
      "scripts/validate-render-provider-graph-resume-enqueues.mjs",
      "schemas/render-provider-handoff-report.schema.json",
      "schemas/render-provider-lease-service-smoke-report.schema.json",
      "schemas/render-provider-handoff-action-ledger-report.schema.json",
      "schemas/production-graph-resume-state-report.schema.json",
      "schemas/production-graph-resume-queue-service-smoke-report.schema.json",
      "schemas/render-provider-graph-resume-worker-smoke-report.schema.json",
      "schemas/render-provider-multi-worker-handoff-report.schema.json",
      "schemas/render-provider-production-handoff-report.schema.json",
      "schemas/render-provider-live-action-evidence-draft-report.schema.json",
      "schemas/render-provider-live-action-evidence.schema.json",
      "schemas/render-provider-live-actions-report.schema.json",
      "schemas/render-provider-graph-resume-enqueue-evidence.schema.json",
      "schemas/render-provider-graph-resume-enqueues-report.schema.json",
      "scripts/validate-report-contracts.mjs"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "draft live action templates are not evidence; production parity still requires real live provider action execution evidence, graph-resume enqueue payload evidence, and archived production multi-worker ownership handoff evidence",
      "live Atlas prediction IDs must be validated before using handoff output as paid-provider closeout evidence",
      "resume-state capsule plus local/protected queue-service and worker-bridge lifecycle evidence are not an external live queue enqueue or automatic graph resume engine; production worker replay and live provider callback proof are still required"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Render Provider Handoff",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "status refresh happens before release-facing handoff decisions",
      "still-active provider work remains warning evidence rather than release approval",
      "operator reports distinguish terminal closeout, continued polling with heartbeat, skipped work, manual audit states, and archived live provider callback evidence",
      "archived live callback evidence should be tied to the same deployment capture before release-facing claims",
      "live graph-resume evidence must be tied to a resume-polling action with graph-resume enqueue and resume-enqueued result",
      "graph-resume enqueue payload evidence must stay digest-only and matched to live action action/job IDs",
      "graph resume-state capsules and local/protected queue records must summarize graph/provider context without serializing raw graph state, output URLs, local paths, provider payloads, raw queue names, raw worker IDs, or secrets",
      "graph-resume worker bridge evidence must stay separate from live callback evidence until it runs in a real deployment with confirmed provider actions"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten into CineJelly provider handoff contracts",
      "local, protected HTTP-service, HTTPS-adapted lease decisions, heartbeat renewal, local two-worker no-steal/expiry handoff validation, production capture tooling, protected graph-resume queue-service validation, graph-resume worker bridge validation, non-evidence live action draft tooling, live action evidence validation, and graph-resume enqueue payload validation wrap CineJelly provider reconciliation instead of executing an upstream CLI loop",
      "Production Graph resume-state capsules plus local/protected/worker-bridged queue lifecycle records provide digest-only replay context for future durable workers while keeping release claims false",
      "idempotent action-ledger execution evidence is added for deterministic worker replay, and live action plus graph-resume payload evidence validation stays separate from local replay evidence while rejecting inconsistent action/provider-call/result/deployment-fingerprint tuples",
      "distributed resume remains blocked until production multi-worker ownership handoff, live provider actions, and graph-resume enqueue evidence are proven"
    ],
    referenceImplementationPath: "docs/reference-implementations/render-provider-handoff.md",
    cineJellyDestinationPaths: [
      "src/api/render-provider-handoff.ts",
      "src/api/render-provider-handoff-external-lease.ts",
      "src/api/render-provider-handoff-lease-service.ts",
      "src/api/render-provider-handoff-action-ledger.ts",
      "src/api/production-graph-resume-queue-service.ts",
      "src/api/production-graph-resume-queue-client.ts",
      "src/api/render-provider-graph-resume-worker.ts",
      "src/core/production-graph-resume-state.ts",
      "src/api/server.ts",
      "tests/run-render-provider-handoff-smoke.mjs",
      "tests/run-render-provider-external-lease-smoke.mjs",
      "tests/run-render-provider-lease-service-smoke.mjs",
      "tests/run-render-provider-handoff-action-ledger-smoke.mjs",
      "tests/run-production-graph-resume-state-smoke.mjs",
      "tests/run-production-graph-resume-queue-service-smoke.mjs",
      "tests/run-render-provider-graph-resume-worker-smoke.mjs",
      "tests/run-render-provider-multi-worker-handoff-smoke.mjs",
      "scripts/capture-render-provider-production-handoff.mjs",
      "scripts/create-render-provider-live-action-evidence-draft.mjs",
      "scripts/validate-render-provider-live-actions.mjs",
      "scripts/validate-render-provider-graph-resume-enqueues.mjs",
      "schemas/render-provider-handoff-report.schema.json",
      "schemas/production-graph-resume-state-report.schema.json",
      "schemas/production-graph-resume-queue-service-smoke-report.schema.json",
      "schemas/render-provider-graph-resume-worker-smoke-report.schema.json",
      "schemas/render-provider-multi-worker-handoff-report.schema.json",
      "schemas/render-provider-production-handoff-report.schema.json",
      "schemas/render-provider-live-action-evidence-draft-report.schema.json",
      "schemas/render-provider-live-action-evidence.schema.json",
      "schemas/render-provider-live-actions-report.schema.json",
      "schemas/render-provider-graph-resume-enqueue-evidence.schema.json",
      "schemas/render-provider-graph-resume-enqueues-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "operator tooling must not treat fake-provider, local/protected graph-resume queue, worker-bridge, local two-worker, or production lease-service capture evidence as live Atlas provider action evidence",
      "future worker automation must preserve the same redaction, bearer-token, and warning boundaries"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Auto Analysis Adapter",
    sourceRepository: "HKUDS/VideoAgent",
    snapshotPath: "external/upstream/videoagent",
    upstreamPaths: [
      "external/upstream/videoagent/README.md",
      "external/upstream/videoagent/videoagent"
    ],
    license: "MIT",
    behaviorPreserved: [
      "source video is analyzed into bounded planning structure before downstream graph work",
      "multimodal frame evidence is input-only and does not become public artifact data",
      "scene/keyframe analysis feeds CineJelly source-video contracts rather than provider-specific runtime code"
    ],
    behaviorChanged: [
      "upstream runtime and nested tools are not imported or executed",
      "CineJelly samples bounded frames through MediaInspector and normalizes the LLM result through SourceVideoAnalyst",
      "caller-provided sourceVideoAnalysis remains authoritative and is never overwritten by auto-analysis",
      "no-spend adapter smoke validates disabled, no-overwrite, unsafe-skip, bounded-success, leakage, and strict-failure behavior before live provider evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/types/source-video.ts",
      "src/types/settings.ts",
      "src/core/source-video-auto-analyzer.ts",
      "src/config/runtime-config.ts",
      "src/application/director-factory.ts",
      "src/application/runtime-preflight.ts",
      "src/agents/director-agent.ts",
      "tests/run-source-video-auto-analysis-smoke.mjs",
      "schemas/source-video-auto-analysis-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "no-spend smoke validates adapter guard behavior only; live Atlas multimodal model behavior must still be validated with real video frames before release",
      "asset:// source-video resolution is intentionally deferred until an internal resolver is implemented"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Auto Analysis Adapter",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/lib/source_media_review.py",
      "external/upstream/openmontage/schemas/artifacts/source_media_review.schema.json",
      "external/upstream/openmontage/schemas/artifacts/video_analysis_brief.schema.json"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "source-media review happens before final planning claims",
      "reference analysis is treated as approval-gated guidance rather than copy instructions",
      "analysis output is normalized into reviewable artifact-safe structure"
    ],
    behaviorChanged: [
      "AGPL implementation code is not copied, linked, imported, or executed",
      "approval-gate concepts are rewritten into CineJelly-owned source-video normalization and preflight behavior",
      "local frame paths and base64 payloads are forbidden from returned analysis and artifacts and are covered by no-spend smoke evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/source-video-auto-analyzer.ts",
      "src/agents/source-video-analyst.ts",
      "src/application/runtime-preflight.ts",
      "tests/run-source-video-auto-analysis-smoke.mjs",
      "schemas/source-video-auto-analysis-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "legal review is still required before any direct AGPL implementation reuse",
      "current implementation uses approval and source-review behavior notes only"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Source Video Auto Analysis Adapter",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/agents/scene_extractor.py",
      "external/upstream/vimax/agents/storyboard_artist.py",
      "external/upstream/vimax/agents/reference_image_selector.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "scene/keyframe analysis is structured before storyboard and reference selection",
      "camera/composition hints can improve later reference selection without overriding explicit operator metadata",
      "long-form continuity uses analysis as guidance rather than raw media copying"
    ],
    behaviorChanged: [
      "ViMax agent code is not copied or imported",
      "CineJelly uses a provider-neutral SourceVideoDeconstruction contract",
      "auto-analysis is opt-in and fails closed or skips based on operator configuration, with no-spend smoke coverage for those guard branches"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/source-video-auto-analyzer.ts",
      "src/agents/source-video-reference-metadata-enricher.ts",
      "src/core/reference-selection-planner.ts",
      "tests/run-source-video-auto-analysis-smoke.mjs",
      "schemas/source-video-auto-analysis-smoke-report.schema.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "scene/keyframe extraction quality depends on the configured multimodal LLM",
      "reference-selection lift from generated metadata needs real long-form validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "API Artifact Validation Evidence",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "deterministic artifact validation remains a release gate after build/render work",
      "artifact validation evidence is reviewable alongside generated artifacts",
      "validation status is separate from render execution status",
      "synchronous and asynchronous API render paths expose artifact validation evidence"
    ],
    behaviorChanged: [
      "VibeFrame artifact/report discipline is rewritten into CineJelly async job metadata",
      "public API DTOs drop server-local artifact directories and manifest paths",
      "validation is bound to job-owned artifacts instead of arbitrary API-supplied filesystem paths"
    ],
    referenceImplementationPath: "docs/reference-implementations/api-artifact-validation-evidence.md",
    cineJellyDestinationPaths: [
      "src/core/project-artifact-validator.ts",
      "src/api/artifact-response.ts",
      "src/api/server.ts",
      "src/api/render-job-manager.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid Atlas artifact validation remains required to confirm real media artifact shapes",
      "durable external queue backends should preserve the same artifact validation fields later"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "API Artifact Validation Evidence",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "terminal long-running jobs expose generated artifact evidence through the API",
      "failure artifacts remain visible for operator diagnosis",
      "compact list responses avoid heavy detail while per-job polling exposes reviewable evidence",
      "synchronous render responses include generated artifact validation evidence when artifacts are written"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime code is not copied or executed",
      "CineJelly validates deterministic artifact manifests after job-owned artifact writes",
      "artifact validation complements stage progress rather than becoming a separate task queue"
    ],
    referenceImplementationPath: "docs/reference-implementations/api-artifact-validation-evidence.md",
    cineJellyDestinationPaths: [
      "src/api/render-job-manager.ts",
      "src/api/server.ts",
      "src/api/artifact-response.ts",
      "src/types/artifact.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "in-process job retention is not durable across process restarts",
      "real paid validation must confirm cost-ledger, deliverable, and review-packet checks against provider outputs"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Validation Readiness Report",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "validation state is captured as a deterministic operator report",
      "warnings and failures stay explicit before build/render work proceeds",
      "report evidence remains redacted and reviewable",
      "readiness is available before paid provider work through both CLI and HTTP diagnostics"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten into CineJelly Phase 6 readiness contracts",
      "readiness reporting does not execute provider work or claim release readiness",
      "paid render validation and artifact validation remain separate gates",
      "HTTP readiness returns 503 only for blocked decisions and shares the public diagnostic boundary with preflight"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-validation-readiness-report.md",
    cineJellyDestinationPaths: [
      "src/types/preflight.ts",
      "src/application/validation-readiness-report.ts",
      "src/application/validation-readiness-entrypoint.ts",
      "src/api/server.ts",
      "src/api/api-auth.ts",
      "package.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "the report only proves preflight readiness and cannot validate Atlas render quality",
      "operators must still run the paid validation and artifact validator before release"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Validation Readiness Report",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "operator-visible readiness appears before long-running paid video work",
      "blocked task state is explicit and actionable",
      "next actions tell the operator whether to fix environment or proceed",
      "deployment operators can inspect readiness through a running API process before submitting render jobs"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task code is not copied or executed",
      "CineJelly readiness is based on RuntimePreflight checks and Phase 6 runbook gates",
      "release remains blocked until paid Atlas render and artifact review are completed",
      "API readiness is a non-render diagnostic route rather than a job/task runtime endpoint"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-validation-readiness-report.md",
    cineJellyDestinationPaths: [
      "src/application/validation-readiness-report.ts",
      "src/application/validation-readiness-entrypoint.ts",
      "src/api/server.ts",
      "src/api/api-auth.ts",
      "docs/OPERATOR_RUNBOOK.md",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "external queue persistence is still out of scope for the in-process validation report",
      "real provider validation remains the authoritative release gate"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Render Request Validation Contract",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "request validation happens before expensive build/render work",
      "operator-facing validation output is deterministic and redacted",
      "valid request checks remain separate from paid provider execution",
      "request-level Seedance model preferences are checked against an admin allowlist before paid work",
      "local runtime paths stay out of public validation output"
    ],
    behaviorChanged: [
      "VibeFrame dry-run discipline is rewritten into a CineJelly request contract validator",
      "static JSON schemas document operator contracts while TypeScript admission remains runtime authority",
      "the validator reuses CineJelly request admission and output-root normalization instead of upstream commands"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-render-request-validation-contract.md",
    cineJellyDestinationPaths: [
      "schemas/render-request.schema.json",
      "schemas/phase6-render-request-validation-report.schema.json",
      "schemas/phase6-paid-render-validation-report.schema.json",
      "src/application/render-request-validation-entrypoint.ts",
      "src/application/render-request-normalizer.ts",
      "src/application/render-settings-descriptor.ts",
      "src/api/render-request-admission.ts",
      "src/index.ts",
      "package.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "static schemas are operator contracts and must not drift from TypeScript admission",
      "valid request contracts do not prove provider readiness or render success"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Render Request Validation Contract",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/models/schema.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "one operator-supplied request is validated as a complete task input",
      "request issues are surfaced before long-running video work",
      "operator-visible request status avoids implicit task creation"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo Python schema/controller code is not copied or executed",
      "CineJelly request validation is provider-neutral TypeScript",
      "the validator does not create jobs, providers, artifacts, or generated media"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-render-request-validation-contract.md",
    cineJellyDestinationPaths: [
      "schemas/render-request.schema.json",
      "schemas/phase6-render-request-validation-report.schema.json",
      "src/application/render-request-validation-entrypoint.ts",
      "src/application/render-request-normalizer.ts",
      "src/api/render-request-admission.ts",
      "package.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "request validation is not a persistent task queue or WebUI workflow",
      "real paid execution still depends on readiness and provider validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Render Request Validation Contract",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "approval-gate concepts inform the pre-paid request review boundary",
      "request validation does not equal release approval",
      "operator review remains required before paid validation and customer release"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval behavior is used only as behavior-note guidance",
      "CineJelly-owned TypeScript enforces admission and redaction before paid work"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-render-request-validation-contract.md",
    cineJellyDestinationPaths: [
      "src/application/render-request-validation-entrypoint.ts",
      "docs/OPERATOR_RUNBOOK.md",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future richer approval UX must avoid AGPL implementation reuse unless product/legal obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Paid Render Validation Runner",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "validate-before-spend gates paid render work",
      "explicit spend confirmation blocks runtime creation before any provider call",
      "operator-visible reports preserve readiness, artifact validation, and next actions",
      "successful and failed runs emit deterministic artifacts before release review",
      "local runtime paths stay out of public validation output"
    ],
    behaviorChanged: [
      "VibeFrame CLI/report discipline is rewritten into a CineJelly Phase 6 validation runner",
      "the runner uses CineJelly DirectorAgent and artifact contracts instead of upstream build commands",
      "release approval remains a manual runbook decision after paid output inspection"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-paid-render-validation-runner.md",
    cineJellyDestinationPaths: [
      "src/application/paid-render-validation-entrypoint.ts",
      "src/application/render-request-normalizer.ts",
      "src/api/render-request-admission.ts",
      "src/api/server.ts",
      "src/index.ts",
      "package.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "real Atlas paid validation still requires credentials, model IDs, FFmpeg, FFprobe, and manual artifact/media inspection"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Paid Render Validation Runner",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "one operator-supplied input drives a visible long-running validation task",
      "operator approval is represented as an explicit CLI flag before paid execution",
      "terminal success or failure remains inspectable through generated artifacts",
      "cost ledger and artifact evidence remain available after render pipeline failure"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task runtime code is not copied or executed",
      "CineJelly blocks paid execution before runtime creation when readiness has hard blockers or spend confirmation is missing",
      "the validation runner emits a redacted summary instead of exposing local artifact directories"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-paid-render-validation-runner.md",
    cineJellyDestinationPaths: [
      "src/application/paid-render-validation-entrypoint.ts",
      "src/application/render-request-normalizer.ts",
      "src/api/render-request-admission.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "package.json"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "external queue persistence and WebUI task management remain out of scope for the CLI validation harness"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Phase 6 Paid Render Validation Runner",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "approval-gate and manual review concepts inform the release boundary",
      "explicit spend confirmation is required before the paid validation run can create runtime/provider work",
      "paid validation does not equal release approval",
      "artifact/media inspection remains required after automated validation"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval flow is translated only as behavior-note guidance",
      "CineJelly-owned TypeScript enforces readiness and artifact evidence before manual release review"
    ],
    referenceImplementationPath: "docs/reference-implementations/phase6-paid-render-validation-runner.md",
    cineJellyDestinationPaths: [
      "src/application/paid-render-validation-entrypoint.ts",
      "docs/OPERATOR_RUNBOOK.md",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future richer approval UX must avoid AGPL implementation reuse unless product/legal obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Media Tool Binary Resolution",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "media tool availability is validated before build/render work proceeds",
      "operator-facing readiness reports keep failures explicit and actionable",
      "runtime media processing uses the same readiness assumption as preflight",
      "local command details stay out of public failure payloads"
    ],
    behaviorChanged: [
      "VibeFrame preflight discipline is rewritten into CineJelly RuntimePreflight checks",
      "FFmpeg and FFprobe command resolution supports deployment-specific environment overrides",
      "runtime media engines resolve commands through a shared CineJelly utility before using the existing bounded process runner"
    ],
    referenceImplementationPath: "docs/reference-implementations/media-tool-binary-resolution.md",
    cineJellyDestinationPaths: [
      "src/utils/media-tools.ts",
      "src/application/runtime-preflight.ts",
      "src/core/assembly-engine.ts",
      "src/core/media-inspector.ts",
      "src/core/transition-engine.ts",
      "src/core/postproduction-engine.ts",
      "src/core/caption-engine.ts",
      "src/core/audio-mix-engine.ts",
      "src/index.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "local smoke validation can prove command resolution but not real FFmpeg/FFprobe codec behavior",
      "deployment binaries must still be validated through preflight and paid render artifact review"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Media Tool Binary Resolution",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/video.py",
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/Dockerfile"
    ],
    license: "MIT",
    behaviorPreserved: [
      "media processing readiness is treated as an operator-visible dependency",
      "long-running video work should fail before paid/runtime work when media tooling is unavailable",
      "deployment packaging may provide media tools without requiring a globally modified PATH"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime code is not copied or executed",
      "CineJelly keeps FFmpeg/FFprobe resolution provider-neutral and API-preflight visible",
      "configured command paths are resolved centrally and used by assembly, inspection, transitions, captions, audio mix, and postproduction"
    ],
    referenceImplementationPath: "docs/reference-implementations/media-tool-binary-resolution.md",
    cineJellyDestinationPaths: [
      "src/utils/media-tools.ts",
      "src/application/runtime-preflight.ts",
      "src/core/assembly-engine.ts",
      "src/core/media-inspector.ts",
      "src/core/transition-engine.ts",
      "src/core/postproduction-engine.ts",
      "src/core/caption-engine.ts",
      "src/core/audio-mix-engine.ts",
      "src/index.ts",
      "docs/OPERATOR_RUNBOOK.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "portable binary packaging remains an operator/deployment responsibility",
      "real media tool versions and codecs must still be documented during Phase 6 paid validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Media Tool Binary Resolution",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "media self-review depends on explicit media-tool availability",
      "quality checks should not silently skip inspection when FFmpeg/FFprobe are absent"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, or executed",
      "AGPL-sensitive concepts are limited to behavior notes for CineJelly-owned readiness checks",
      "CineJelly routes all media work through its own TypeScript engines and process runner"
    ],
    referenceImplementationPath: "docs/reference-implementations/media-tool-binary-resolution.md",
    cineJellyDestinationPaths: [
      "src/utils/media-tools.ts",
      "src/application/runtime-preflight.ts",
      "src/core/media-inspector.ts",
      "src/core/assembly-engine.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "AGPL implementation reuse remains disallowed unless legal/product obligations are accepted",
      "behavior-note parity must be validated against CineJelly artifacts rather than upstream runtime code"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Intent Planning",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/subtitle.py",
      "external/upstream/moneyprinterturbo/app/services/video.py",
      "external/upstream/moneyprinterturbo/app/services/task.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "voice/TTS, BGM, ambience, and SFX requests are explicit postproduction stage inputs",
      "missing provider-backed generation remains operator-visible instead of silently skipped",
      "generated audio work is represented before final composition or assembly",
      "stage and artifact evidence preserve generated-audio counts for later provider integration"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime voice/music code is not copied or executed",
      "CineJelly records generated-audio intents as reviewable planned/ready/blocked evidence until provider-backed execution succeeds",
      "API admission bounds intent prompts, timing, volume, and provider preference before runtime/provider spend",
      "review packet and artifact validation cross-check generated-audio counts without generating audio files"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-intent-planning.md",
    cineJellyDestinationPaths: [
      "src/types/audio.ts",
      "src/types/postproduction-assets.ts",
      "src/types/agent.ts",
      "src/api/render-request-admission.ts",
      "src/api/server.ts",
      "src/application/runtime-preflight.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "src/types/review.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "provider-backed TTS/BGM generation still requires verified provider schema, execution wiring, and live validation",
      "operator-supplied generated-audio prompts may need additional brand/safety review before provider execution"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Intent Planning",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "incomplete generation stages remain deterministic review evidence",
      "planning artifacts and review reports expose operator next actions",
      "artifact validation checks duplicated planning summaries for drift"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten into CineJelly postproduction generated-audio contracts",
      "CineJelly treats generated-audio requests as review-required planning/execution evidence until generated output is verified",
      "HTTP request admission rejects malformed generated-audio inputs before runtime initialization"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-intent-planning.md",
    cineJellyDestinationPaths: [
      "src/types/audio.ts",
      "src/types/postproduction-assets.ts",
      "src/api/render-request-admission.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "artifact evidence must be checked after a paid render to confirm generated-audio planning remains aligned with final media",
      "provider-backed audio generation should preserve these review and validation fields when execution is verified"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Intent Planning",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/README.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "audio generation plans should remain reviewable before approval",
      "media self-review concepts inform generated-audio readiness boundaries"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, or executed",
      "AGPL-sensitive concepts are limited to behavior notes for CineJelly-owned planning and validation",
      "provider execution remains disabled until CineJelly has verified provider-backed audio generation and output validation"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-intent-planning.md",
    cineJellyDestinationPaths: [
      "src/types/audio.ts",
      "src/types/postproduction-assets.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "AGPL implementation reuse remains disallowed unless legal/product obligations are accepted",
      "behavior-note parity must be validated through CineJelly artifacts rather than upstream runtime code"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Contract",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "audio generation is treated as an explicit stage with visible task state",
      "audio-only execution can complete before subtitle/material/final composition stages",
      "voice/BGM request knobs stay separate from supplied custom audio",
      "audio generation failures remain operator-visible instead of being silently ignored"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime TTS/BGM implementation code is not copied or executed",
      "CineJelly adds provider-neutral audio-generation request/result/capability contracts",
      "Atlas Cloud generated-audio execution is gated by verified capability mapping and explicit validation spend controls",
      "failed generated-audio provider attempts can be recorded as `audio.generate` cost-ledger entries without provider spend"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-contract.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/contracts.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual Atlas audio endpoint mapping remains blocked until current provider schema and model IDs are verified",
      "future generated-audio outputs must be media-inspected and URI-safety checked before becoming supplied audio tracks"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Contract",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "provider-backed work requires validation, cost visibility, and deterministic review evidence before release",
      "unavailable generation capabilities remain explicit blockers",
      "generated asset status belongs in operator-facing evidence rather than hidden side effects"
    ],
    behaviorChanged: [
      "VibeFrame provider/report discipline is rewritten into CineJelly provider-neutral audio contracts",
      "CineJelly does not add fake generated assets or unverified provider calls",
      "Atlas boundary returns no audio capabilities until the provider schema is intentionally configured"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-contract.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/contracts.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid provider validation must later confirm ledger status, usage/cost fields, output URIs, and artifact evidence"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Contract",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "provider capability availability should be visible before generation",
      "music/TTS provider decisions should be surfaced before paid asset work",
      "sample-before-batch and approval concepts inform future generated-audio release gates"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive provider menu and approval ideas remain behavior notes only",
      "CineJelly uses its own provider contracts and Atlas boundary for generated-audio readiness"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-contract.md",
    cineJellyDestinationPaths: [
      "src/types/provider.ts",
      "src/providers/contracts.ts",
      "src/providers/atlascloud/atlas-cloud-provider.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future implementation must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Runner",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/controllers/v1/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "audio generation is a visible stage before final composition",
      "terminal audio success or failure remains operator-visible",
      "audio-only execution evidence can exist before final video assembly"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime audio code is not copied or executed",
      "CineJelly executes only generated-audio items that were already marked ready by verified capability planning",
      "provider exceptions become stack-free generated-audio result evidence for batch validation",
      "retryable Atlas generated-audio polling failures continue polling active predictions before the overall timeout",
      "structured terminal provider bodies become terminal generated-audio failure evidence instead of hidden retries",
      "existing generated-audio prediction IDs can be resume-polled without submitting a second paid job",
      "approved generated-audio tracks can enter assembly only after CineJelly-owned output batch validation"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-runner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-provider-execution-runner.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "src/agents/director-agent.ts",
      "src/application/director-factory.ts",
      "tests/run-generated-audio-polling-resilience-smoke.mjs",
      "schemas/generated-audio-polling-resilience-smoke-report.schema.json",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live Atlas generated-audio validation remains pending paid output evidence and manual review"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Runner",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "provider work follows validate then execute then report discipline",
      "partial failures remain inspectable instead of erasing successful sibling evidence",
      "generated asset evidence is deterministic and reviewable before release"
    ],
    behaviorChanged: [
      "VibeFrame execution/report discipline is rewritten into CineJelly generated-audio runner and batch validation contracts",
      "CineJelly runner does not approve URLs, inspect media, or create files",
      "retryable Atlas polling errors are represented as continued active prediction polling in no-spend backend evidence",
      "terminal failed prediction bodies are preserved as reportable provider evidence",
      "resume polling preserves deterministic evidence without duplicating provider generation",
      "batch validation owns approval before generated-audio results can become mix tracks"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-runner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-provider-execution-runner.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "src/agents/director-agent.ts",
      "tests/run-generated-audio-polling-resilience-smoke.mjs",
      "schemas/generated-audio-polling-resilience-smoke-report.schema.json",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid provider validation now confirms one Atlas TTS provider/output-batch success path and no-spend mapping smoke covers BGM/SFX request-role boundaries, but manual listening quality and live BGM/SFX media quality remain pending"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Provider Execution Runner",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "sample-before-batch and provider-menu concepts inform generated-audio execution boundaries",
      "generated media should be reviewed before final use",
      "partial generated-media readiness should remain explicit"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive provider-menu and approval ideas remain behavior notes only",
      "CineJelly-owned runner and batch validator enforce ready-only execution and output approval without using OpenMontage runtime"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-runner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-provider-execution-runner.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "src/agents/director-agent.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Execution Planner",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/models/schema.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "audio/TTS/BGM work is planned as an explicit stage before final composition",
      "voice and BGM knobs stay visible as request-level planning fields",
      "provider execution readiness is separated from supplied-audio mixing",
      "item-level failures remain visible instead of dropping generated-audio intents"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo audio execution code is not copied or executed",
      "CineJelly maps generated-audio intents into provider-neutral requests only when verified capabilities exist",
      "empty or incompatible capability sets produce deterministic blocked planning evidence",
      "generated-audio planning does not create output URLs, audio files, or final mix tracks"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-execution-planner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-execution-planner.ts",
      "src/core/generated-audio-output-validator.ts",
      "src/types/postproduction-assets.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-validator.ts",
      "tests/run-generated-audio-mapping-smoke.mjs",
      "schemas/generated-audio-mapping-smoke-report.schema.json",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual provider-backed generation remains pending verified provider schema and paid validation",
      "future execution orchestration must preserve item-level ready/blocked evidence",
      "mapping smoke proves request and track-role boundaries but not live BGM/SFX media quality"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Execution Planner",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "provider work is validated and reported before spend",
      "ready and blocked work remains deterministic review evidence",
      "planning summaries are duplicated across artifacts so validators can detect drift"
    ],
    behaviorChanged: [
      "VibeFrame build/report discipline is rewritten into generated-audio execution plan contracts",
      "CineJelly carries ready/blocked intent counts into run summary, review packet, and stage lifecycle evidence",
      "artifact validation now checks generated-audio execution-plan shape and cross-artifact counts"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-execution-planner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-execution-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/review-packet-builder.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "generated-audio execution still needs live provider validation before release claims",
      "artifact validation cannot prove media correctness until generated outputs are created by a verified provider"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Execution Planner",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "provider capability visibility should exist before generation",
      "provider preference conflicts should be surfaced for operator review",
      "partial readiness should remain explicit rather than silently proceeding"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval and provider-menu concepts remain behavior notes only",
      "CineJelly-owned TypeScript records capability conflicts without invoking provider runtime"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-execution-planner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-execution-planner.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future implementation must keep AGPL material at behavior-note level unless legal/product obligations are accepted",
      "human approval UX remains a future orchestration surface"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Validation",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/video.py",
      "external/upstream/moneyprinterturbo/app/services/task.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated audio is treated as a prepared artifact before final composition",
      "audio-stage failures remain operator-visible rather than silently becoming mix inputs",
      "voice/BGM output remains separate from final video assembly"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo audio output handling code is not copied or executed",
      "CineJelly validates provider-neutral AudioGenerationResult objects before producing AudioMixTrack records",
      "credential-bearing URLs, local paths, data URIs, and unresolved asset URIs are rejected or held for review",
      "approved generated-audio outputs become deterministic audio mix tracks only after status, identity, URL, duration, and volume checks"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-validator.ts",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "waveform/media inspection still requires real generated audio files and deployment FFmpeg/FFprobe",
      "asset:// generated-audio output mixing now depends on reviewed resolver entries and still needs live generated-audio media validation"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Validation",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated artifacts must be validated and reviewable before release decisions",
      "invalid generated outputs become deterministic review issues",
      "release evidence should separate prepared outputs from unvalidated provider state"
    ],
    behaviorChanged: [
      "VibeFrame validation/report discipline is rewritten into CineJelly generated-audio output validation reports",
      "CineJelly does not download, inspect, or mix generated audio in this validator",
      "the validator produces an AudioMixTrack only for approved credential-free HTTPS output"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-validator.ts",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual release validation still requires generated audio media artifacts and artifact review"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Validation",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "sample-before-batch and approval concepts inform generated-media output gates",
      "provider output should be reviewed before final media assembly",
      "partial or unresolved generated output remains explicit"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive media-review concepts remain behavior notes only",
      "CineJelly-owned validation blocks unsafe provider output without invoking OpenMontage runtime"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Batch Validation",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated-audio stage outputs are reconciled with task intent before final composition",
      "missing or duplicate generated-audio artifacts remain operator-visible",
      "final composition consumes prepared audio assets in deterministic plan order"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task/audio batching code is not copied or executed",
      "CineJelly reconciles provider-neutral AudioGenerationResult batches against GeneratedAudioExecutionPlan items",
      "ready intents require exactly one matching result before an AudioMixTrack can be approved",
      "blocked-intent and unexpected results are rejected as batch issues instead of entering the mix"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-batch-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "src/core/generated-audio-output-validator.ts",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual provider-backed generated-audio commercial evidence remains pending paid validation and manual review",
      "future integration must persist batch reports into run artifacts before release claims"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Batch Validation",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated artifacts must be validated as a release report before final use",
      "partial readiness remains explicit instead of being treated as full success",
      "deterministic artifact status is available before expensive or release-sensitive work"
    ],
    behaviorChanged: [
      "VibeFrame report discipline is rewritten into CineJelly generated-audio batch validation reports",
      "batch validation performs no provider calls, downloads, or media inspection",
      "approved track output remains separate from rejected, duplicate, missing, or review-required evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-batch-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "artifact validation must later cross-check persisted batch reports after real provider execution"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Output Batch Validation",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "sample-before-batch and approval concepts inform generated-media batch boundaries",
      "unapproved or unresolved generated output should not silently enter final assembly",
      "partial generated-media readiness remains inspectable"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval concepts remain behavior notes only",
      "CineJelly-owned batch validation rejects unsafe or unexpected provider result sets without using OpenMontage runtime"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-output-batch-validation.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-batch-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Batch Artifact Evidence",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated-audio stage evidence remains visible to operators",
      "prepared audio artifacts stay separate from final composition until validated",
      "terminal task evidence can be reviewed through durable artifacts and review packets"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo artifact/task code is not copied or executed",
      "CineJelly persists generated-audio output batch validation only when a provider-backed report exists",
      "review packets surface generated-audio batch status and counts when provider-backed reports exist",
      "artifact validation cross-checks batch status and counts against postproduction, run-summary, and review-packet evidence",
      "current planned-only/no-spend generated-audio runs do not require a batch artifact"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-batch-artifact-evidence.md",
    cineJellyDestinationPaths: [
      "src/types/agent.ts",
      "src/types/artifact.ts",
      "src/types/review.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual provider-backed generated-audio commercial evidence remains pending paid validation and manual review",
      "real release evidence must later include provider-backed batch reports and media inspection results"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Batch Artifact Evidence",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "release-sensitive generated artifacts are captured as deterministic reports",
      "artifact validation checks persisted evidence rather than trusting in-memory state",
      "partial or blocked generated-media readiness remains explicit in review artifacts and review-packet status"
    ],
    behaviorChanged: [
      "VibeFrame artifact report discipline is rewritten into CineJelly generated-audio artifact contracts",
      "batch artifact validation does not rerun providers or media downloads",
      "run summary, postproduction plan, review packet, and optional batch artifact must agree when batch evidence exists"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-batch-artifact-evidence.md",
    cineJellyDestinationPaths: [
      "src/types/artifact.ts",
      "src/types/review.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid validation must later confirm artifact validator behavior against real generated-audio reports"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Batch Artifact Evidence",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "approval concepts inform release boundaries for generated media",
      "generated-media evidence remains reviewable before final use",
      "partial readiness is recorded instead of silently approving a batch"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval concepts remain behavior notes only",
      "CineJelly-owned artifact and review-packet validation checks generated-audio batch evidence without using OpenMontage runtime code"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-batch-artifact-evidence.md",
    cineJellyDestinationPaths: [
      "src/types/artifact.ts",
      "src/types/review.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Artifact Evidence Capture",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated media evidence is captured as deterministic report data before release-sensitive review",
      "review handoff uses explicit artifact hashes and media metadata instead of trusting transient URLs",
      "validation remains separated from release approval"
    ],
    behaviorChanged: [
      "CineJelly downloads only an already-generated credential-free HTTPS audio URL after explicit live-network confirmation",
      "no Atlas model endpoint, provider execution, or generated-audio spend is performed by the artifact capture command",
      "manual-review readiness is machine-checkable only after provider output and artifact SHA/duration evidence are bound",
      "structured manual review must bind to the captured SHA-256, byte size, duration, output URL, and prediction id before it can pass"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-artifact-evidence.md",
    cineJellyDestinationPaths: [
      "scripts/capture-generated-audio-artifact-evidence.mjs",
      "schemas/generated-audio-artifact-evidence-report.schema.json",
      "schemas/generated-audio-manual-review.schema.json",
      "scripts/create-generated-audio-manual-review-draft.mjs",
      "scripts/validate-generated-audio-manual-review-readiness.mjs",
      "schemas/generated-audio-manual-review-readiness-report.schema.json",
      "scripts/run-atlas-generated-audio-validation.mjs",
      "scripts/validate-report-contracts.mjs",
      "docs/OPERATOR_RUNBOOK.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "manual-review readiness does not listen to audio or approve business evidence",
      "artifact evidence supports but does not replace manual listening review",
      "credential-free generated-audio URL availability can expire and may require a fresh paid provider run if the media host no longer serves the file"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/video.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "prepared audio artifacts remain a distinct stage before final composition",
      "final composition consumes reviewed media references rather than opaque provider state",
      "audio-stage failures and unresolved outputs remain operator-visible"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo audio artifact path handling code is not copied or executed",
      "CineJelly resolves only reviewed clean asset:// generated-audio outputs to credential-free HTTPS delivery URLs",
      "resolver entries are identity-bound to intent, kind, provider, model, optional provider asset, and optional duration evidence",
      "resolution does not call providers, download media, inspect waveform data, or create generated audio files"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-asset.ts",
      "src/core/generated-audio-asset-resolver.ts",
      "src/types/generated-audio-output.ts",
      "src/core/generated-audio-output-validator.ts",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual provider-backed generated-audio commercial evidence remains pending paid validation and manual review",
      "resolved HTTPS audio still requires future live media inspection with generated artifacts before release claims"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "generated artifacts are resolved and validated before release decisions",
      "unresolved or unsafe artifacts remain explicit review issues",
      "artifact provenance stays visible to operators"
    ],
    behaviorChanged: [
      "VibeFrame artifact discipline is rewritten into CineJelly generated-audio asset resolution contracts",
      "CineJelly resolver reports preserve issue codes and provenance without exposing credentials",
      "resolver-approved outputs still pass generated-audio output validation before mixing"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-asset.ts",
      "src/core/generated-audio-asset-resolver.ts",
      "src/core/generated-audio-output-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "artifact resolution reports must later be compared against real provider-generated assets and delivery URLs"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "approval and media-review concepts inform generated media release boundaries",
      "unapproved generated output should not silently enter final composition",
      "media evidence should remain inspectable before batch/final use"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval concepts remain behavior notes only",
      "CineJelly-owned resolver contracts require approved asset mappings without using OpenMontage runtime code"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-asset.ts",
      "src/core/generated-audio-asset-resolver.ts",
      "src/core/generated-audio-output-validator.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution Catalog",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "prepared generated-audio artifacts are represented as explicit stage evidence",
      "operator-visible task state catches missing or unresolved media before final composition",
      "audio-stage artifacts remain separate from final video assembly inputs"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task and audio code is not copied or executed",
      "CineJelly validates an operator-owned resolver catalog before customer traffic",
      "catalog entries must use clean asset:// source URIs, credential-free HTTPS resolved URLs, and boolean approval flags",
      "catalog preflight does not call providers, download media, inspect waveform data, or create generated files"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution-catalog.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-asset.ts",
      "src/core/generated-audio-asset-resolver.ts",
      "src/types/settings.ts",
      "src/config/runtime-config.ts",
      "src/application/runtime-preflight.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "catalog validity does not prove generated-audio media quality until real provider artifacts are inspected",
      "actual provider-backed generated-audio commercial evidence remains pending paid validation and manual review"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution Catalog",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "artifact inputs should be validated before expensive or release-sensitive work",
      "preflight reports should give operator-visible readiness without leaking sensitive paths or credentials",
      "deterministic reports should catch malformed artifact evidence early"
    ],
    behaviorChanged: [
      "VibeFrame preflight/report discipline is rewritten into CineJelly runtime preflight checks",
      "catalog validation reports entry counts and failure reasons without exposing local catalog paths",
      "resolver catalog validation stays separate from provider-backed audio execution"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution-catalog.md",
    cineJellyDestinationPaths: [
      "src/core/generated-audio-asset-resolver.ts",
      "src/application/runtime-preflight.ts",
      "docs/IMPLEMENTATION_ROADMAP.md"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "deployment validation must later confirm preflight responses stay redacted behind the public API"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Generated Audio Asset Resolution Catalog",
    sourceRepository: "calesthio/OpenMontage",
    snapshotPath: "external/upstream/openmontage",
    upstreamPaths: [
      "external/upstream/openmontage/AGENT_GUIDE.md"
    ],
    license: "AGPL-3.0",
    behaviorPreserved: [
      "approval concepts inform generated media readiness gates",
      "unapproved generated output should not silently enter final composition",
      "media evidence should remain reviewable before final use"
    ],
    behaviorChanged: [
      "OpenMontage implementation code is not copied, linked, imported, or executed",
      "AGPL-sensitive approval concepts remain behavior notes only",
      "CineJelly-owned preflight validates approval flags and URI safety without using OpenMontage runtime code"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-asset-resolution-catalog.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-asset.ts",
      "src/core/generated-audio-asset-resolver.ts",
      "src/application/runtime-preflight.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "future approval UX must keep AGPL material at behavior-note level unless legal/product obligations are accepted"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Postproduction Asset Orchestration",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/app/services/subtitle.py",
      "external/upstream/moneyprinterturbo/app/services/voice.py",
      "external/upstream/moneyprinterturbo/app/services/video.py",
      "external/upstream/moneyprinterturbo/app/services/task.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "subtitle, narration, background music, ambience, and SFX decisions are explicit before assembly",
      "caption and audio inputs are classified into deterministic postproduction planning evidence",
      "missing or inconsistent caption/audio inputs become operator-visible review issues",
      "TTS and BGM generation are not claimed when only supplied tracks are planned"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo runtime subtitle, voice, music, and task code is not copied or executed",
      "CineJelly records a postproduction asset plan rather than generating provider-backed TTS or BGM in this module",
      "audio materialization remains delegated to the existing bounded AudioMixEngine",
      "caption burn-in or sidecar delivery remains delegated to the existing CaptionRenderer"
    ],
    referenceImplementationPath: "docs/reference-implementations/postproduction-asset-orchestration.md",
    cineJellyDestinationPaths: [
      "src/types/postproduction-assets.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/agents/director-agent.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "src/index.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "provider-backed TTS and BGM generation still require separate Reference Implementations",
      "paid end-to-end validation must confirm postproduction-assets.json, review packet planning evidence, and stage lifecycle evidence against real renders"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Postproduction Asset Orchestration",
    sourceRepository: "vericontext/vibeframe",
    snapshotPath: "external/upstream/vibeframe",
    upstreamPaths: [
      "external/upstream/vibeframe/README.md",
      "external/upstream/vibeframe/ROADMAP.md"
    ],
    license: "MIT",
    behaviorPreserved: [
      "postproduction readiness is represented as deterministic reviewable artifact evidence",
      "warnings and missing-input repairs stay visible to operators",
      "artifact validation checks the postproduction plan shape and cross-artifact consistency before release"
    ],
    behaviorChanged: [
      "VibeFrame review-report discipline is rewritten into CineJelly postproduction asset contracts",
      "CineJelly keeps the plan provider-free and redacted rather than embedding local file paths or raw media payloads",
      "postproduction evidence is integrated into stage lifecycle, run summary, review packet planning, and validator consistency checks"
    ],
    referenceImplementationPath: "docs/reference-implementations/postproduction-asset-orchestration.md",
    cineJellyDestinationPaths: [
      "src/types/postproduction-assets.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/types/review.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "real provider artifacts must still be inspected to confirm postproduction planning evidence lines up with final media outputs"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Director Agentic Media Reasoning",
    sourceRepository: "video-db/Director",
    snapshotPath: "external/upstream/director",
    upstreamPaths: [
      "external/upstream/director/README.md",
      "external/upstream/director/backend/director/core/reasoning.py",
      "external/upstream/director/backend/director/agents/base.py",
      "external/upstream/director/backend/director/core/session.py",
      "external/upstream/director/backend/director/agents/text_to_movie.py",
      "external/upstream/director/backend/director/agents/video_generation.py",
      "external/upstream/director/backend/director/agents/audio_generation.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "natural-language media requests are decomposed into explicit workflow steps",
      "multi-turn conversation state can express revisions, optional-template rejection, and approval intent without bypassing formal review",
      "agent and tool choices remain visible as operator-facing progress evidence",
      "long-running media work emits status updates rather than hiding behind one opaque blocking request",
      "media outputs are represented as typed content/artifact evidence instead of text-only responses",
      "ambiguous or commercially risky requests route to review or safe blocking before provider spend",
      "bounded Product URL-to-Video research can feed safe product facts and claim checkpoints into the planning loop",
      "short viral/niche intelligence can infer platform focus, creative mode, buyer intent, concept quality, and scene-level retention directives before spend",
      "shared audience/niche intelligence can classify messy user presentation style, niche, funnel stage, trend posture, proof strategy, share trigger, CTA strategy, and idea seeds for both Short and Long",
      "short creative-pattern learning can generate many niche, prompt, and reference-derived idea candidates, score them for hook, retention, proof, novelty, renderability, brand safety, and non-clone safety, then hand a selected idea into scene directives",
      "reference-video learning preserves reusable structure such as hook, pacing, caption rhythm, camera style, audio feel, retention mechanics, and CTA logic without copying source content",
      "durable no-spend conversation sessions can be persisted with atomic writes and client-scoped retrieval without storing raw transcript text",
      "stored conversation sessions can enter the async render-job review lifecycle without accepting client-side replacement plans",
      "accepted short-plan review evidence can hand off into the async render-job lifecycle while preserving operator-visible status",
      "session UI contracts can expose safe scene/audio/caption/claim checkpoint controls and a non-spending approval-packet shape",
      "archived short create/review operation evidence can be validated as no-spend reviewer evidence only when it is deployment-scoped, redaction-reviewed, session-bound, and explicitly confirmed by the operator",
      "archived short product-facts and media-rights evidence can be validated as no-spend operator evidence only when product facts, claim substantiation, ownership, commercial-use, attribution, redaction, and hash bindings are accepted and explicitly confirmed by the operator",
      "operator-facing draft/checklist handoffs can prepare short review-operation and product-rights evidence packets while remaining rejected as direct evidence until real review fields are filled",
      "async jobs can pause after artifact validation for pre-export artifact-bound review without rerendering or reserving provider spend again"
    ],
    behaviorChanged: [
      "rewritten into CineJelly-owned TypeScript planners, review approvals, async job state, and artifact contracts",
      "Director's Python runtime, VideoDB dependency, and frontend code are not imported or executed",
      "public conversation evidence stores message digests and redacted summaries instead of raw transcript text",
      "unbounded LLM tool routing is replaced by deterministic no-spend planning, admission control, approval gates, cost controls, and provider-safe handoff points",
      "product URL research is limited to clean HTTPS pages behind explicit live-network confirmation and publishes hashes/evidence instead of raw URLs",
      "reference-video inputs are redacted into source fingerprints and pattern guidance; clone/99%-copy requests become review-required guardrails instead of reproduction instructions",
      "video-pattern learning is represented as scored structural idea candidates rather than hardcoded scripts, exact clone templates, copied edits, copied creator identity, or raw trend URLs",
      "short-pipeline render handoff, including stored-session handoff, requires explicit confirmation before approved review evidence can queue provider spend",
      "short review operation evidence validation rejects unsafe accepted-looking notes and keeps product URL acceptance, media-rights approval, and provider submission as separate gates",
      "short product-facts/media-rights validation rejects unsafe accepted-looking notes and keeps review-operation evidence, paid render evidence, artifact validation, manual media review, and customer release as separate gates",
      "commercial launch doctor refreshes short evidence guards, non-evidence drafts, and accepted-packet validation status so missing operator packets stay explicit evidence blockers",
      "a first-party static Short create/review shell with safe checkpoint controls is provided without importing Director frontend code, while hosted playback, accepted live review operation evidence, VideoDB library controls, and complete 20+ agent parity remain future product work",
      "Short and Long now call the same deterministic audience/niche intelligence layer instead of maintaining disconnected template-like niche heuristics"
    ],
    referenceImplementationPath: "docs/reference-implementations/director-agentic-media-reasoning.md",
    cineJellyDestinationPaths: [
      "src/types/short-pipeline.ts",
      "src/types/audience-niche-intelligence.ts",
      "src/types/short-viral-intelligence.ts",
      "src/types/review-approval.ts",
      "src/core/audience-niche-intelligence.ts",
      "src/core/short-creative-pattern-learning.ts",
      "src/core/short-pipeline-conversation.ts",
      "src/core/short-pipeline-planner.ts",
      "src/core/short-viral-intelligence-planner.ts",
      "src/core/product-url-researcher.ts",
      "src/core/short-pipeline-render-handoff.ts",
      "src/core/short-mvp-ui-contract.ts",
      "src/core/review-approval-system.ts",
      "src/types/short-mvp-ui.ts",
      "src/api/short-pipeline-session-store.ts",
      "src/api/short-pipeline-create-page.ts",
      "src/api/server.ts",
      "src/api/render-job-manager.ts",
      "tests/run-short-pipeline-conversation-smoke.mjs",
      "tests/run-short-pipeline-session-store-smoke.mjs",
      "tests/run-short-pipeline-session-render-handoff-smoke.mjs",
      "tests/run-short-mvp-ui-contract-smoke.mjs",
      "scripts/create-short-review-operation-evidence-draft.mjs",
      "scripts/validate-short-review-operation-evidence.mjs",
      "tests/run-short-review-operation-evidence-guard-smoke.mjs",
      "scripts/create-short-product-rights-evidence-draft.mjs",
      "scripts/validate-short-product-rights-evidence.mjs",
      "tests/run-short-product-rights-evidence-guard-smoke.mjs",
      "tests/run-short-pipeline-smoke.mjs",
      "tests/run-short-viral-intelligence-smoke.mjs",
      "tests/run-product-url-extraction-smoke.mjs",
      "schemas/short-pipeline-conversation-smoke-report.schema.json",
      "schemas/short-pipeline-session-store-smoke-report.schema.json",
      "schemas/short-pipeline-session-render-handoff-smoke-report.schema.json",
      "schemas/short-mvp-ui-contract-smoke-report.schema.json",
      "schemas/short-review-operation-evidence-draft-report.schema.json",
      "schemas/short-review-operation-evidence.schema.json",
      "schemas/short-review-operation-validation-report.schema.json",
      "schemas/short-review-operation-evidence-guard-smoke-report.schema.json",
      "schemas/short-product-rights-evidence-draft-report.schema.json",
      "schemas/short-product-rights-evidence.schema.json",
      "schemas/short-product-rights-validation-report.schema.json",
      "schemas/short-product-rights-evidence-guard-smoke-report.schema.json",
      "schemas/short-pipeline-smoke-report.schema.json",
      "schemas/short-viral-intelligence-smoke-report.schema.json",
      "schemas/product-url-extraction-smoke-report.schema.json",
      "schemas/render-job-review-lifecycle-smoke-report.schema.json",
      "docs/SHORT_PIPELINE_AGENTIC_DESIGN.md",
      "tests/run-render-job-review-lifecycle-smoke.mjs",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "current coverage is backend planning/render-handoff/progress/review evidence plus a static create/review shell with checkpoint controls, not hosted playback or VideoDB media-library parity",
      "conversation/session routes, the static shell, and the review-operation evidence validator are no-spend backend evidence and do not yet prove managed multi-instance storage, production UI QA, or accepted live reviewer operation evidence without an operator-supplied packet",
      "viral/niche strategy is deterministic backend inference and reference-pattern adaptation; live trend intelligence or platform analytics still require a reviewed external data source",
      "reference-video learning must remain structure-only unless the operator supplies rights-cleared source assets and review evidence",
      "live paid short-pipeline media evidence is still required before claiming end-to-end Director-style workflow evidence",
      "future LLM-driven agent routing must preserve CineJelly cost, quota, redaction, approval, and artifact gates",
      "full Director-style agent catalog parity requires additional source-video, search, editing, dubbing, subtitle, upload, playback, and UI evidence"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Director-Style Benchmark Harness",
    sourceRepository: "jiaminchen-1031/DirectorBench",
    snapshotPath: "external/upstream/directorbench",
    upstreamPaths: [
      "external/upstream/directorbench/README.md",
      "external/upstream/directorbench/directorbench/schemas.py",
      "external/upstream/directorbench/directorbench/report.py"
    ],
    license: "NO-LICENSE-FOUND",
    behaviorPreserved: [
      "script, video, audio, stability, and cross-modal evaluation dimensions remain separate",
      "metrics carry normalized score, confidence, evidence, suggestions, and bottleneck reporting",
      "audio-only metrics are skipped rather than treated as failures when no audio evidence exists",
      "overall scoring uses confidence-weighted dimension scores and profile weights",
      "local media metadata and sampled-frame proxy signals can strengthen video/stability evidence without copying upstream implementation code",
      "FFmpeg scene-change transition-boundary candidates can be analyzed through redacted pre/post frame proxy signals when rendered media contains detectable cuts",
      "bounded FFmpeg volumedetect waveform/volume proxy signals can strengthen audio evidence without storing raw audio bytes",
      "FFprobe audio-video duration-delta proxy signals can strengthen cross-modal audio evidence without claiming lip-sync or ASR parity",
      "structured semantic-review checkpoints can reinforce individual visual/cross-modal metrics without importing upstream evaluator code",
      "structured audio-review checkpoints can reinforce narration, BGM, and audio cross-modal metrics without importing upstream evaluator code",
      "structured runtime-review checkpoints can reinforce ASR transcript alignment and lip-sync timing metrics without importing upstream evaluator code",
      "structured governance-review checkpoints can record accepted license boundary, code reuse boundary, runtime evaluator independence, and evaluation-asset permission evidence without importing upstream evaluator code",
      "structured semantic/audio/runtime/governance review checkpoints must be bound to the paid-render project, request, and deliverable fingerprint before they can satisfy parity rows",
      "artifact-bound semantic/audio/runtime/governance review drafts can be generated as needs_review operator handoff packets without counting as accepted evidence",
      "accepted review-evidence readiness validation can confirm all four structured review packets are present, schema/redaction safe, explicitly accepted, complete for required checkpoint names, and bound to the paid artifact before they are treated as accepted review evidence",
      "unsafe-review guard smoke can prove accepted-looking structured review packets with raw URLs, local paths, or token-like text are rejected before benchmark parity rows can consume them",
      "structured review summaries and findings are bounded to aggregate redacted text before benchmark reports can retain them",
      "generated-audio validation reports can reinforce provider-backed audio evidence through redacted spend, billing, schema, execution, output-batch, ledger, manual-review, and artifact SHA binding gates",
      "long-form validation reports can reinforce long-form duration and manual-review evidence through redacted budget, billing, paid-render, artifact, duration, cost-ledger, and artifact-fingerprint-bound manual quality-review gates",
      "benchmark runs can be appended to JSONL history without overwriting prior evidence"
    ],
    behaviorChanged: [
      "DirectorBench implementation code is not copied, imported, linked, or executed",
      "CineJelly evaluates persisted artifact-contract evidence plus local FFprobe, sampled-frame RGB proxy signals, FFmpeg scene-change transition-boundary proxy signals, bounded FFmpeg audio waveform/volume proxy signals, FFprobe audio-video duration-delta proxy signals, optional artifact-bound structured semantic/audio/runtime/governance review JSON, optional generated-audio validation report JSON with artifact evidence status and media SHA only, optional long-form validation report JSON, and a parity evidence matrix instead of running PySceneDetect, OpenCV, ASR, VLM, lip-sync analyzers, or Python LangGraph agents",
      "CineJelly can prepare artifact-bound review draft packets, but generated drafts remain needs_review and cannot satisfy parity rows until a reviewer or approved analyzer accepts them",
      "CineJelly validates the accepted semantic/audio/runtime/governance review bundle separately from draft generation and benchmark scoring, so incomplete, unsafe, unaccepted, or mismatched packets cannot be promoted into accepted review evidence",
      "reports explicitly state canClaimDirectorBenchParity=false until live long-form, accepted long-form validation, artifact-bound semantic visual review, accepted generated-audio validation with matching artifact SHA evidence, artifact-bound ASR/lip-sync runtime review, artifact-bound governance evidence, and every required parity row exists",
      "the CLI is no-spend/no-network and writes a schema-validated backend quality report"
    ],
    referenceImplementationPath: "docs/reference-implementations/director-style-benchmark-harness.md",
    cineJellyDestinationPaths: [
      "src/types/director-style-benchmark.ts",
      "src/core/director-style-benchmark.ts",
      "src/core/director-style-media-evidence.ts",
      "src/core/director-style-semantic-review.ts",
      "src/core/director-style-audio-review.ts",
      "src/core/director-style-runtime-review.ts",
      "src/core/director-style-review-text.ts",
      "src/core/director-style-review-artifact-binding.ts",
      "src/core/director-style-generated-audio-provider-evidence.ts",
      "src/core/director-style-long-form-validation-evidence.ts",
      "src/core/director-style-governance-review.ts",
      "scripts/create-director-style-review-drafts.mjs",
      "scripts/validate-director-style-review-evidence.mjs",
      "tests/run-director-style-review-evidence-guard-smoke.mjs",
      "scripts/run-director-style-benchmark.mjs",
      "schemas/director-style-benchmark-report.schema.json",
      "schemas/director-style-review-drafts-report.schema.json",
      "schemas/director-style-review-evidence-readiness-report.schema.json",
      "schemas/director-style-review-evidence-guard-smoke-report.schema.json",
      "schemas/director-style-semantic-review.schema.json",
      "schemas/director-style-audio-review.schema.json",
      "schemas/director-style-runtime-review.schema.json",
      "schemas/director-style-governance-review.schema.json",
      "scripts/validate-report-contracts.mjs",
      "package.json",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "sampled-frame, transition-boundary proxy, waveform/volume proxy, duration-sync proxy, structured semantic/audio/runtime/governance review signals, accepted review-evidence readiness reports, generated-audio validation report signals with artifact SHA binding, long-form validation report signals, and parity evidence matrix rows do not replace automated lip sync, ASR transcript alignment, real long-form paid evidence, accepted live generated-audio provider evidence, accepted legal/operator review, or full DirectorBench runtime parity",
      "full DirectorBench parity still requires accepted governance review plus dedicated VLM/ASR/audio media evaluation evidence",
      "current short no-audio paid smoke can only produce review_required benchmark evidence, not customer-release approval"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Operator Launch UI Contract",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/moneyprinterturbo",
    upstreamPaths: [
      "external/upstream/moneyprinterturbo/webui",
      "external/upstream/moneyprinterturbo/app/services/task.py",
      "external/upstream/moneyprinterturbo/app/services/state.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "operator-facing task/readiness state is compressed into dashboard-friendly status cards",
      "staged launch tasks stay visible instead of hiding behind raw logs",
      "blocked, budget-bound, and manual-review work remains explicit before spend or release"
    ],
    behaviorChanged: [
      "CineJelly exposes a deployment-token admin JSON contract and first-party operator dashboard shell instead of copying MoneyPrinterTurbo WebUI code",
      "the contract reads fixed no-spend launch reports and never accepts client-supplied report paths",
      "customer traffic remains blocked by business-readiness gates even when the dashboard contract is available"
    ],
    referenceImplementationPath: "docs/IMPLEMENTATION_ROADMAP.md",
    cineJellyDestinationPaths: [
      "src/types/operator-launch-ui.ts",
      "src/core/operator-launch-ui-contract.ts",
      "src/api/operator-launch-dashboard-page.ts",
      "src/api/server.ts",
      "tests/run-operator-launch-ui-contract-smoke.mjs",
      "schemas/operator-launch-ui-contract-smoke-report.schema.json",
      "scripts/validate-report-contracts.mjs",
      "docs/ARCHITECTURE_SPEC.md",
      "docs/IMPLEMENTATION_ROADMAP.md",
      "docs/PROJECT_CONTEXT.md",
      "package.json",
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "this is a backend dashboard contract, not a browser-rendered first-party UI",
      "dashboard readiness cannot replace real deployment, paid/live provider, operator attestation, manual review, or business-readiness evidence",
      "full WebUI parity still requires a separate frontend implementation and product-scope decision"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Long-Form Creative Intelligence Gate",
    sourceRepository: "HKUDS/ViMax",
    snapshotPath: "external/upstream/vimax",
    upstreamPaths: [
      "external/upstream/vimax/README.md",
      "external/upstream/vimax/agents/reference_image_selector.py",
      "external/upstream/vimax/agent_runtime/session_index.py"
    ],
    license: "MIT",
    behaviorPreserved: [
      "long-form work should keep story, sequence, visual, and reference consistency evidence explicit before rendering",
      "continuity-sensitive shots need stronger candidate/review treatment than generic shots",
      "director reasoning should produce repairable shot-level guidance rather than one opaque global score",
      "audience, niche, trend posture, proof strategy, objection, share trigger, and idea seeds should be explicit no-spend evidence before long-form provider spend"
    ],
    behaviorChanged: [
      "ViMax agent behavior is rewritten as deterministic CineJelly story-bible, viral-strategy, quality-finding, candidate, and repair contracts",
      "the planner makes no network, LLM, Atlas, or upstream runtime calls",
      "quality recommendations feed artifacts and review packets without bypassing cost, approval, artifact, or provider gates",
      "long-form niche strategy now consumes the shared Short/Long audience-niche planner while preserving the stable long-form UI/artifact fields"
    ],
    referenceImplementationPath: "docs/PRODUCTION_GRAPH_AND_LONG_FORM.md",
    cineJellyDestinationPaths: [
      "src/types/long-form-creative-intelligence.ts",
      "src/types/audience-niche-intelligence.ts",
      "src/types/long-director-ui.ts",
      "src/core/audience-niche-intelligence.ts",
      "src/core/long-form-creative-intelligence-planner.ts",
      "src/core/long-director-ui-contract.ts",
      "src/agents/director-agent.ts",
      "src/core/project-artifact-store.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/review-packet-builder.ts",
      "tests/run-long-form-creative-intelligence-smoke.mjs",
      "package.json",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "deterministic story/viral/quality findings do not replace full VLM/ASR/lip-sync media evaluation after render",
      "viral/niche strategy is a structured planning aid and still needs market/operator review before customer claims",
      "future VLM or LLM evaluators should attach accepted evidence to the same creative-intelligence artifact instead of bypassing it"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  }
];

export const DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS: readonly SourceLogicTranslationRecord[] =
  new SourceLogicTranslationLedger(DEFAULT_SOURCE_LOGIC_TRANSLATIONS).list();
