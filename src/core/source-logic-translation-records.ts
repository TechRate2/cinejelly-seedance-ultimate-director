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
  }
];

export const DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS: readonly SourceLogicTranslationRecord[] =
  new SourceLogicTranslationLedger(DEFAULT_SOURCE_LOGIC_TRANSLATIONS).list();
