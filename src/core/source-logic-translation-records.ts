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
      "live visual-analysis providers can later populate richer SourceVideoDeconstruction input",
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
    snapshotPath: "external/upstream/MoneyPrinterTurbo",
    upstreamPaths: [
      "external/upstream/MoneyPrinterTurbo/app/services/task.py",
      "external/upstream/MoneyPrinterTurbo/app/services/state.py",
      "external/upstream/MoneyPrinterTurbo/app/models/schema.py"
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
      "live staged batch progress remains future work beyond the Phase 5 completed-run stage lifecycle",
      "provider ledger state is not a complete job-progress UI until persisted stage updates consume it"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Provider Polling, Retry, And Cost Fidelity",
    sourceRepository: "Atlas Cloud",
    snapshotPath: "src/providers/atlascloud",
    upstreamPaths: [
      "src/providers/atlascloud/atlas-cloud-provider.ts",
      "src/providers/atlascloud/atlas-cloud-http.ts",
      "src/providers/atlascloud/atlas-cloud-mappers.ts"
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
    snapshotPath: "external/upstream/MoneyPrinterTurbo",
    upstreamPaths: [
      "external/upstream/MoneyPrinterTurbo/app/services/task.py",
      "external/upstream/MoneyPrinterTurbo/app/services/state.py",
      "external/upstream/MoneyPrinterTurbo/app/services/video.py"
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
      "actual local/stock material adapter fulfillment remains future work",
      "subtitle, TTS, and BGM orchestration are not yet translated into dedicated stage modules"
    ],
    attributionPath: "docs/EXTERNAL_SOURCE_SNAPSHOTS.md"
  },
  {
    logicName: "Material Source Adapter Validation",
    sourceRepository: "harry0703/MoneyPrinterTurbo",
    snapshotPath: "external/upstream/MoneyPrinterTurbo",
    upstreamPaths: [
      "external/upstream/MoneyPrinterTurbo/app/services/material.py",
      "external/upstream/MoneyPrinterTurbo/app/services/video.py",
      "external/upstream/MoneyPrinterTurbo/app/models/schema.py"
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
      "real stock/local material adapters still need provider-specific fulfillment implementations",
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
  }
];

export const DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS: readonly SourceLogicTranslationRecord[] =
  new SourceLogicTranslationLedger(DEFAULT_SOURCE_LOGIC_TRANSLATIONS).list();
