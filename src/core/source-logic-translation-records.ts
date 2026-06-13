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
      "negative and anti-slop guidance stays distinct from positive prompt prose"
    ],
    behaviorChanged: [
      "generalized prompt structure into CineJelly shot contracts",
      "exact community prompt text is not bundled in production code",
      "compression notes are emitted as metadata for operator review"
    ],
    referenceImplementationPath: "docs/reference-implementations/prompt-reference-binding-plan.md",
    cineJellyDestinationPaths: [
      "src/types/prompt.ts",
      "src/prompt_compiler/reference-binding.ts",
      "src/prompt_compiler/prompt-compiler.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "exact prompt examples require attribution/product review before bundling",
      "provider-specific prompt tags should be checked against current Atlas docs"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
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
      "continuity-sensitive dependencies remain explicit in scheduling and graph evidence",
      "candidate and repair evidence remains traceable by shot"
    ],
    behaviorChanged: [
      "long-form lifecycle is represented through CineJelly ProductionStagePlan records",
      "material sourcing is separated from reference scoring and render selection",
      "stage evidence is emitted in review packets and durable artifacts"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/core/production-stage-planner.ts",
      "src/core/render-scheduler.ts",
      "src/core/production-graph-builder.ts",
      "src/agents/director-agent.ts"
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
      "artifact order preserves planning, storyboard, graph, cost, render, review, and delivery evidence",
      "repair and inspection stages are separate lifecycle records"
    ],
    behaviorChanged: [
      "CLI project-loop status is rewritten into typed stage lifecycle records",
      "stage lifecycle is exposed through review packets and JSON artifacts",
      "CineJelly keeps Atlas Cloud as provider default instead of adopting upstream provider routing"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/stage.ts",
      "src/core/production-stage-planner.ts",
      "src/core/project-artifact-store.ts",
      "src/types/review.ts",
      "src/core/review-packet-builder.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "stage records currently describe a completed run rather than a persisted live task monitor",
      "future resumable long-running builds should preserve this stage schema"
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
      "batch candidates and final deliverable evidence are visible to operators"
    ],
    behaviorChanged: [
      "MoneyPrinterTurbo task progress is adapted into CineJelly stage lifecycle records",
      "material sourcing is represented as governed briefs rather than immediate stock downloads",
      "batch render candidates remain Seedance/Atlas render candidates with graph and review evidence"
    ],
    referenceImplementationPath: "docs/reference-implementations/long-form-planning-batch-workflow.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/core/material-sourcing-planner.ts",
      "src/types/graph.ts",
      "src/core/production-graph-builder.ts",
      "src/core/project-artifact-store.ts",
      "src/agents/director-agent.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live remote stock provider validation with real keys remains pending",
      "provider-backed TTS generation and BGM search/generation remain future dedicated modules"
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
      "candidate URIs must be credential-free HTTPS and pass CineJelly MaterialSourceValidator"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/types/material.ts",
      "src/types/settings.ts",
      "src/core/remote-stock-material-adapter.ts",
      "src/config/runtime-config.ts",
      "src/application/director-factory.ts",
      "src/application/runtime-preflight.ts",
      "src/agents/director-agent.ts"
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
      "remote stock adapter output stays behind centralized material validation"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/remote-stock-material-adapter.ts",
      "src/application/runtime-preflight.ts",
      "src/core/material-source-validator.ts",
      "src/core/review-packet-builder.ts"
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
      "Coverr commercial-use approval is explicit before that provider can be enabled"
    ],
    referenceImplementationPath: "docs/reference-implementations/remote-stock-material-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/remote-stock-material-adapter.ts",
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
      "caller-provided sourceVideoAnalysis remains authoritative and is never overwritten by auto-analysis"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/types/source-video.ts",
      "src/types/settings.ts",
      "src/core/source-video-auto-analyzer.ts",
      "src/config/runtime-config.ts",
      "src/application/director-factory.ts",
      "src/application/runtime-preflight.ts",
      "src/agents/director-agent.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live Atlas multimodal model behavior must be validated with real video frames before release",
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
      "local frame paths and base64 payloads are forbidden from returned analysis and artifacts"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/source-video-auto-analyzer.ts",
      "src/agents/source-video-analyst.ts",
      "src/application/runtime-preflight.ts"
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
      "auto-analysis is opt-in and fails closed or skips based on operator configuration"
    ],
    referenceImplementationPath: "docs/reference-implementations/source-video-auto-analysis-adapter.md",
    cineJellyDestinationPaths: [
      "src/core/source-video-auto-analyzer.ts",
      "src/agents/source-video-reference-metadata-enricher.ts",
      "src/core/reference-selection-planner.ts"
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
      "Atlas Cloud generated-audio execution is safely blocked until verified provider schema and capability mapping exist",
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
      "src/index.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "live Atlas generated-audio execution remains blocked until current provider schema, model IDs, pricing, and output format behavior are verified"
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
      "batch validation owns approval before generated-audio results can become mix tracks"
    ],
    referenceImplementationPath: "docs/reference-implementations/generated-audio-provider-execution-runner.md",
    cineJellyDestinationPaths: [
      "src/types/generated-audio-execution.ts",
      "src/core/generated-audio-provider-execution-runner.ts",
      "src/core/generated-audio-output-batch-validator.ts",
      "src/agents/director-agent.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "paid provider validation must later confirm real provider status mapping, cost ledger entries, and output evidence"
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
      "src/types/postproduction-assets.ts",
      "src/core/postproduction-asset-planner.ts",
      "src/core/project-artifact-validator.ts",
      "src/core/source-logic-translation-records.ts"
    ],
    validationStatus: "implemented",
    fidelityRisks: [
      "actual provider-backed generation remains pending verified provider schema and paid validation",
      "future execution orchestration must preserve item-level ready/blocked evidence"
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
      "actual provider-backed generated-audio execution remains pending verified provider schema and paid validation",
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
      "actual provider-backed generated-audio execution remains pending verified provider schema and paid validation",
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
      "actual provider-backed generated-audio execution remains pending verified provider schema and paid validation",
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
      "actual provider-backed generated-audio execution remains pending verified provider schema and paid validation"
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
  }
];

export const DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS: readonly SourceLogicTranslationRecord[] =
  new SourceLogicTranslationLedger(DEFAULT_SOURCE_LOGIC_TRANSLATIONS).list();
