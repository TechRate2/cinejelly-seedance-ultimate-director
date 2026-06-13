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
  }
];

export const DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS: readonly SourceLogicTranslationRecord[] =
  new SourceLogicTranslationLedger(DEFAULT_SOURCE_LOGIC_TRANSLATIONS).list();
