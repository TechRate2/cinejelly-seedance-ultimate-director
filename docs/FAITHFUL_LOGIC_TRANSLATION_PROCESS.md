# Faithful Logic Translation Process

## Purpose

CineJelly uses upstream Git Subtree snapshots to build product behavior with high source fidelity while keeping the production implementation CineJelly-owned. Faithful Logic Translation means translating the useful behavior of an upstream component into CineJelly's TypeScript architecture without directly importing from `external/upstream/` or dropping large unchanged upstream files into `src/`.

The target is behavioral fidelity, not file fidelity. Engineers should preserve the important ordering, defaults, edge cases, scoring rules, fallback behavior, repair decisions, and quality gates from the source when those details make the product stronger.

## When This Process Is Required

Use this process before implementing or materially changing source-derived logic that affects:

- provider request compilation, polling, retry, fallback, or cost accounting
- prompt weighting, prompt ordering, negative constraints, reference binding, or repair hints
- long-form chunking, scene ordering, dependency planning, or shot scheduling
- candidate ranking, consistency checks, repair strategy, or delivery gating
- source-video analysis, material sourcing, batch generation, task progress, or postproduction flow
- any behavior claimed to be faithful to Emily2040/seedance-2.0, YouMind-OpenLab/awesome-seedance-2-prompts, ViMax, VibeFrame, VideoAgent, OpenMontage, MoneyPrinterTurbo, DirectorBench, or another upstream snapshot

Small terminology changes, original CineJelly-only utilities, and purely local refactors do not need a full Reference Implementation, but they should still preserve attribution when the source relationship is material.

## Pattern Extraction vs Faithful Logic Translation

Pattern Extraction is appropriate when the upstream source teaches a broad shape: folder organization, artifact naming, agent roles, a prompt section idea, or an operational workflow. The CineJelly implementation may differ substantially as long as attribution and license rules are followed.

Faithful Logic Translation is required when behavior matters: the upstream ordering, weighting, fallback path, duplicate handling, edge-case handling, or repair decision changes product output quality. In this mode, engineers should first capture a Reference Implementation that is close enough to compare against, then rewrite that behavior into CineJelly-owned TypeScript.

Use this rule of thumb:

- If changing the order changes output quality, use Faithful Logic Translation.
- If changing a fallback changes cost, retries, or repair scope, use Faithful Logic Translation.
- If the source only inspires naming or high-level architecture, Pattern Extraction is enough.

## The 6-Step Process

## 1. Deep Analysis

Read the upstream snapshot directly from `external/upstream/<snapshot-name>`. Capture:

- upstream repository and local snapshot path
- upstream commit or subtree refresh date when known
- relevant upstream files, docs, schemas, or examples
- license evidence and nested third-party license concerns
- input and output shapes
- state transitions, ordering, defaults, limits, and weighting rules
- failure modes, retry rules, fallback decisions, and edge cases
- product gaps where CineJelly must improve on the source

The analysis should be narrow. Study only the upstream area needed for the module being implemented.

## 2. Reference Implementation

Create a non-production Reference Implementation before writing production code when the upstream behavior is important. A Reference Implementation may be:

- a pseudocode section in the relevant design doc
- a short algorithm map under `docs/`
- a source-to-CineJelly translation table
- a structured checklist of edge cases, ordering rules, and expected decisions

Reference Implementations must not be imported by production runtime code. They are a fidelity aid, not a deployable dependency.

For critical modules, the Reference Implementation should state:

- the upstream source paths and license
- the behavior being preserved
- the behavior intentionally changed by CineJelly
- the acceptance criteria for the rewritten module
- the attribution destination, usually `docs/CREDITS.md`, `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, or a focused design document

## 3. Fidelity Review

Review the Reference Implementation before production rewriting. Confirm:

- the important source behaviors are represented accurately
- license boundaries are clear before implementation starts
- AGPL or no-license material is not being copied into proprietary production code without an approved path
- upstream limitations are identified so CineJelly can improve them deliberately
- the target CineJelly contracts are known

This review should decide whether the production implementation will be a clean CineJelly rewrite, a compatible attributed adaptation, or a documentation-only influence.

## 4. CineJelly Rewriting

Write new production TypeScript under `src/`. The implementation should:

- use CineJelly-owned names, contracts, types, errors, logging, and cost tracking
- preserve the chosen source behavior at the logic level
- avoid direct imports from `external/upstream/`
- avoid copying large upstream files unchanged into `src/`
- improve reliability for commercial use, including validation, bounded inputs, redaction, deterministic IDs, cancellation, and operator-visible artifacts where relevant
- keep provider-specific details behind the Model Provider Abstraction

If a small compatible snippet is adapted from an MIT source, preserve the required license notice and attribution. Prefer rewriting into CineJelly style when the source code shape does not match local architecture.

## 5. Integration

Integrate the rewritten module through CineJelly production boundaries:

- provider logic through `src/providers`
- prompt logic through `src/prompt_compiler`
- graph, planning, guardian, sourcing, and postproduction logic through `src/core`
- orchestration through `src/agents` or `src/application`
- public contracts through `src/types`
- stable package surface through `src/index.ts`

Record source lineage in docs and, when useful for operator audit, in product artifacts. The lineage should name the source repository, local snapshot path, license, preserved behavior, and CineJelly changes.

## 6. Validation

Validate the rewritten behavior before treating it as production-ready:

- run TypeScript type checking
- review edge cases from the Reference Implementation
- verify no production code imports from `external/upstream/`
- verify redaction for secrets, filesystem paths, signed URLs, and credential-bearing URLs
- verify cost tracking and provider error handling for credit-spending paths
- verify long-form behavior with bounded chunking, dependency ordering, and repair-only regeneration where relevant
- verify attribution and license notes are updated

Do not create CineJelly-owned test, mock, demo, sample, or example files in production paths. Validation evidence can live in design notes, operator artifacts, review packets, or future approved test infrastructure if project policy changes.

## Practical Translation Examples

These examples are intentionally non-production Reference Implementations. They show the level of detail expected before changing behavior-critical code in `src/`.

Additional focused Reference Implementations may live under `docs/reference-implementations/` when they are too specific for this process overview. Current examples include provider polling/retry/cost fidelity, long-form batch workflow, material source adapters, render-job progress telemetry, API artifact validation evidence, source-video auto analysis, postproduction asset orchestration, generated-audio intent planning, generated-audio execution planning, generated-audio output validation, generated-audio provider execution contracts, and media tool binary resolution.

## Example 1: Reference Binding + Prompt Ordering

## Upstream Source

- `external/upstream/seedance-2.0/references/reference-workflow.md`
- `external/upstream/seedance-2.0/references/intent-vs-precision.md`
- `external/upstream/seedance-2.0/references/migrated/v5.2-legacy-skill-bodies/seedance-antislop.md`
- `external/upstream/awesome-seedance-2-prompts/README.md`
- `external/upstream/awesome-seedance-2-prompts/README_zh.md`

## Important Behavior To Preserve

- Assign a role to every reference before writing prompt prose.
- Put identity and product references before motion, camera, audio, and style cues.
- Keep endpoint anchors (`first_frame`, `last_frame`) before environment, motion, camera, audio, and style because they define continuity boundaries for clip stitching.
- Use text for intent, action, camera, timing, lighting, audio intent, and constraints; use references for dense visual or motion information.
- Do not let one reference control incompatible roles unless the tradeoff is explicit.
- When audio and video references compete, constrain one source: video controls camera/motion only, audio controls tempo/energy only.
- Preserve provider/reference tags exactly when the provider path requires tags.
- Compress vague language in a stable order: references first, then subject nouns, action verbs, camera move, light source, audio cue, and style/quality constraint.
- Keep source-video-structure references out of provider reference arrays unless the provider explicitly supports source-video conditioning; by default they guide planning and prompt structure only.
- Edge cases:
  - no references: prompt must say the shot contract is the source of truth
  - identity risk without identity reference: Guardian should request repair before render
  - product/logo risk without product reference: Guardian should request repair before render
  - first/last-frame workflow: endpoint anchors must outrank environment/style references
  - unsupported provider mode: compile must downgrade to the safest supported mode or block before provider spend
  - too many references: keep primary identity/product/endpoints first, then bounded support refs
  - voice/audio reference without authorization: use tempo or energy only, never likeness or song identity
  - source-video structure plus identity/product refs: source-video controls pacing/structure only; identity/product still come from owned references
  - duplicate references for the same role: primary wins; supporting refs are used only if they add non-duplicate information

## Why This Ordering Matters

Seedance-style reference workflows are sensitive to which constraint appears first. If a motion or style reference appears before the identity/product anchor, the model can transfer the wrong performer, costume, logo, environment, or color language. The CineJelly order protects commercial constraints first, then adds motion/camera/audio/style as controlled modifiers.

## Reference Implementation

```ts
type RefRole =
  | "identity"
  | "product"
  | "wardrobe"
  | "first_frame"
  | "last_frame"
  | "environment"
  | "motion"
  | "camera"
  | "audio_tempo"
  | "voice"
  | "style"
  | "source_video_structure";

const roleWeight: Record<RefRole, number> = {
  identity: 0,
  product: 1,
  wardrobe: 2,
  first_frame: 3,
  last_frame: 4,
  environment: 5,
  motion: 6,
  camera: 7,
  audio_tempo: 8,
  voice: 9,
  style: 10,
  source_video_structure: 11
};

function referenceBindingPromptPlan(shot: ShotContract): PromptPlan {
  const sorted = [...shot.references].sort((left, right) => {
    const byRole = roleWeight[left.role] - roleWeight[right.role];
    if (byRole !== 0) return byRole;
    if (left.priority !== right.priority) return left.priority === "primary" ? -1 : 1;
    return left.label.localeCompare(right.label);
  });

  const findings: TranslationFinding[] = [];
  const roles = new Set(sorted.map((reference) => reference.role));

  if (shot.risks.includes("face") && !roles.has("identity")) {
    findings.push({ severity: "repair", reason: "identity-risk-needs-identity-reference" });
  }
  if (shot.risks.includes("product_logo") && !roles.has("product")) {
    findings.push({ severity: "repair", reason: "product-risk-needs-product-reference" });
  }
  if (roles.has("audio_tempo") && (roles.has("motion") || roles.has("camera"))) {
    findings.push({ severity: "warn", reason: "audio-video-reference-scope-must-be-explicit" });
  }
  if (roles.has("source_video_structure") && (roles.has("identity") || roles.has("product"))) {
    findings.push({ severity: "info", reason: "source-video-controls-structure-only" });
  }

  const referenceLines =
    sorted.length === 0
      ? ["References: no external reference assets; follow the approved shot contract only."]
      : sorted.map((reference) => {
          const scope = scopeFor(reference.role);
          return `${reference.role}: ${reference.label} controls ${scope}; priority=${reference.priority}`;
        });

  const sections = [
    `Shot ${shot.shotId}, ${shot.durationSeconds}s`,
    workflowLine(roles),
    ...referenceLines,
    continuityLine(shot),
    `Subject: ${shot.subject}`,
    `Action: ${shot.action}`,
    `Camera: ${shot.camera}`,
    `Lighting: ${shot.lighting}`,
    timelineLine(shot),
    audioLine(shot),
    constraintLine(shot)
  ].filter(Boolean);

  return {
    promptSections: compressByProductionOrder(sections),
    findings,
    providerReferences: sorted
      .filter((reference) => reference.role !== "source_video_structure")
      .slice(0, providerReferenceLimit(shot))
  };
}
```

## CineJelly Rewrite Path

- Current production anchor: `src/prompt_compiler/reference-binding.ts` already implements role priority, primary-before-supporting ordering, and stable label tie-breaks.
- Current production anchor: `src/prompt_compiler/prompt-compiler.ts` already emits references before continuity, subject, action, camera, lighting, timeline, audio, transition, and quality instruction.
- Current production anchor: `src/core/consistency-guardian.ts` already blocks or repairs missing identity/product references for risky shots.
- Next faithful implementation step: create a `PromptBindingPlan` contract that records conflict findings, role scopes, and compression decisions before prompt text is assembled.
- Next faithful implementation step: add provider-capability-aware reference filtering so source-video structure and unsupported reference kinds never leak into provider requests.
- Attribution: record the translation in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` and, when implemented, in `SourceLogicTranslationLedger`.

## Example 2: Repair Strategy + Consistency Checkpoint

## Upstream Source

- `external/upstream/vimax/agents/reference_image_selector.py`
- `external/upstream/vimax/agent_runtime/session_index.py`
- `external/upstream/vimax/agent_runtime/prompts.py`
- `external/upstream/vibeframe/README.md`
- `external/upstream/vibeframe/docs/cli-reference.md`

## Important Behavior To Preserve

- Do not render before structured planning artifacts exist.
- Validate storyboard/shot dependencies before provider spend.
- Prefer recent prior-frame references when continuity depends on previous shots.
- Prefer same-camera or same-composition references before generic portraits, unless a new character requires an identity portrait.
- Limit selected reference images or visual anchors to a bounded count to avoid prompt overload.
- Detect duplicate or redundant references and keep the most useful one.
- Keep repair scope narrow: fix storyboard, prompt, reference binding, or one render node rather than restarting the full project.
- Preserve VibeFrame-style loop ordering: validate -> plan/cost -> dry-run or preflight -> build/render -> inspect -> repair -> refresh status.
- Record provenance for every repair decision: upstream source, checkpoint, affected graph node, selected action, and CineJelly destination module.
- Edge cases:
  - missing storyboard panel: block render
  - duplicate storyboard panel: repair storyboard before render
  - provider status failed/canceled/timeout: rerender only the affected shot
  - output URL missing: block delivery and rerender affected shot after diagnostics
  - prompt too dense or negative constraints too broad: repair prompt before provider spend
  - stale dependency artifact: repair or regenerate the stale dependency before child shots render
  - multiple candidate clips: select best candidate first; rerender only when no candidate passes the blocking checkpoints
  - warnings should not block delivery, but they must be recorded for review packets and routing

## Reference Implementation

```ts
type RepairAction = "pass" | "warn" | "repair_contract" | "rerender_shot" | "block_delivery";

function consistencyRepairDecision(input: RepairInput): RepairDecision {
  const findings: Finding[] = [];

  findings.push(...checkStoryboardCoverage(input.storyboard, input.shots));
  findings.push(...checkShotContracts(input.shots));
  findings.push(...checkPromptDensity(input.compiledPrompts));
  findings.push(...checkReferenceSelection(input.referenceHistory, input.shots));

  if (input.renderPrediction) {
    if (input.renderPrediction.status !== "succeeded") {
      findings.push({
        severity: "S1",
        checkpoint: "provider_status",
        action: "rerender_shot",
        nodeId: input.shotId
      });
    }
    if (input.renderPrediction.outputUrls.length === 0) {
      findings.push({
        severity: "S0",
        checkpoint: "output_presence",
        action: "block_delivery",
        nodeId: input.shotId
      });
    }
  }

  return {
    action: rollup(findings),
    affectedNodeIds: affectedNodes(findings),
    repairScope: narrowestScope(findings),
    provenance: findings.map((finding) => ({
      sourceRepositories: findingSources(finding.checkpoint),
      checkpoint: finding.checkpoint,
      affectedNodeId: finding.nodeId,
      action: finding.action,
      destinationModule: destinationFor(finding.action)
    })),
    findings
  };
}

function rollup(findings: readonly Finding[]): RepairAction {
  if (findings.some((finding) => finding.action === "block_delivery")) return "block_delivery";
  if (findings.some((finding) => finding.action === "rerender_shot")) return "rerender_shot";
  if (findings.some((finding) => finding.action === "repair_contract")) return "repair_contract";
  if (findings.some((finding) => finding.action === "warn")) return "warn";
  return "pass";
}

function checkReferenceSelection(history: ReferenceHistory, shots: readonly ShotContract[]): Finding[] {
  return shots.flatMap((shot) => {
    const candidates = history.referencesFor(shot).sort((left, right) => {
      const sameCamera = Number(right.cameraId === shot.camera) - Number(left.cameraId === shot.camera);
      if (sameCamera !== 0) return sameCamera;
      const byRecency = right.timelineIndex - left.timelineIndex;
      if (byRecency !== 0) return byRecency;
      return Number(right.isPortrait) - Number(left.isPortrait);
    });
    const selected = dedupeByCharacterAndRole(candidates).slice(0, 8);
    return selected.length === 0 && shot.risks.includes("face")
      ? [{ severity: "S1", checkpoint: "reference_selection", action: "repair_contract", nodeId: shot.shotId }]
      : [];
  });
}

function narrowestScope(findings: readonly Finding[]): "none" | "prompt" | "storyboard" | "shot" | "delivery" {
  if (findings.some((finding) => finding.action === "block_delivery")) return "delivery";
  if (findings.some((finding) => finding.checkpoint.startsWith("storyboard_"))) return "storyboard";
  if (findings.some((finding) => finding.checkpoint.includes("prompt"))) return "prompt";
  if (findings.some((finding) => finding.action === "rerender_shot")) return "shot";
  return findings.length > 0 ? "shot" : "none";
}
```

## CineJelly Rewrite Path

- Current production anchor: `src/core/consistency-guardian.ts` already validates storyboard coverage, duplicate panels, panel/shot alignment, prompt density, timeline bounds, provider status, and missing output URLs.
- Current production anchor: `src/core/render-scheduler.ts` and `src/agents/director-agent.ts` already support dependency-aware rendering and targeted repair-only rerendering.
- Current production anchor: `src/core/production-graph-run-recorder.ts` records selected, rejected, and repair render candidates.
- Next faithful implementation step: add explicit reference-selection scoring records so candidate choice can preserve ViMax ordering: same composition/camera, recent prior frame, non-duplicate character view, bounded maximum.
- Next faithful implementation step: add repair-decision provenance to Guardian reports so VibeFrame-style inspect/repair loops are reviewable in `review-packet.json`.
- Next faithful implementation step: include `repairScope`, `affectedNodeIds`, and source-derived checkpoint provenance in the artifact path so operators can see why only one shot, prompt, or storyboard node was repaired.
- Attribution: record ViMax/VibeFrame source paths and CineJelly changes through `SourceLogicTranslationLedger` when this logic is productized.

## Shared Validation Checklist

Use this checklist after every source-derived logic rewrite:

- Source and license are recorded: upstream repository, local snapshot path, upstream files, license, and nested-license notes.
- Pattern Extraction vs Faithful Logic Translation decision is explicit.
- Reference Implementation exists for behavior-critical logic and is not placed under `src/`.
- Preserved behavior is listed: ordering, weighting, edge cases, fallback, repair decision, scoring, and limits.
- Changed behavior is listed: CineJelly-specific contract, stricter safety boundary, provider abstraction, cost gate, or long-form extension.
- Production code lives only under CineJelly-owned `src/`, `data/`, or `docs/`; runtime code does not import from `external/upstream/`.
- Type contracts are updated before implementation if the existing contract cannot express the source behavior.
- Error handling uses stable error/status codes and does not expose provider secrets, local paths, signed URLs, or raw stack traces to public responses.
- Cost tracking is preserved for any provider call, retry, polling loop, or paid media operation.
- Logging is redacted and includes request/project/graph/source lineage when available.
- Production Graph integration records affected nodes, dependencies, candidate selection, repair action, and deliverable evidence where relevant.
- Validation includes `npm.cmd run typecheck`, import-boundary check, redacted secret audit, and a focused manual review of Reference Implementation edge cases.
- Documentation is updated: `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, `docs/CREDITS.md` when attribution changes, and the focused design doc or source map.

## How To Start Translating A New Logic

1. Pick one behavior, not a whole repository.
2. Read `docs/PROJECT_CONTEXT.md`, this file, and the focused design doc for the target layer.
3. Re-open the relevant upstream files under `external/upstream/`.
4. Decide whether the task is Pattern Extraction or Faithful Logic Translation.
5. Create a source map under `docs/reference-implementations/<area>-<logic-name>.md` when behavior fidelity matters.
6. Record the upstream path, license, preserved ordering/edge cases, and expected CineJelly destination files.
7. Add or adjust TypeScript contracts in `src/types` only if the existing contract cannot represent the behavior.
8. Rewrite the behavior into the correct `src/` layer using CineJelly names, errors, logging, cost tracking, graph lineage, and provider abstractions.
9. Record lineage through docs and, where useful, `SourceLogicTranslationLedger`.
10. Validate and update the roadmap milestone before claiming the logic is source-faithful.

## Reference Implementation Organization

Inline examples in this file are acceptable for cross-cutting policy. For actual feature work, use one focused source map per behavior:

```text
docs/reference-implementations/<area>-<logic-name>.md
```

Recommended sections:

- Upstream sources and license
- Behavior to preserve
- Edge cases and ordering rules
- Reference Implementation pseudocode
- CineJelly destination files
- Fidelity review notes
- Validation checklist

Do not place Reference Implementations in `src/`, and do not import them at runtime.

## License-Aware Translation Rules

## MIT Sources

MIT sources can inform implementation and can be adapted into production code with the required copyright and license notice. CineJelly still prefers a local rewrite when the source file is large, framework-specific, or not aligned with product contracts.

Primary MIT snapshots include Emily2040/seedance-2.0, ViMax, VibeFrame, VideoAgent top-level code, and MoneyPrinterTurbo.

## CC BY Sources

CC BY sources can be used with attribution. Exact prompt text, community examples, and prompt corpora require product review before bundling because provenance and downstream rights may vary by contribution.

The primary CC BY snapshot is YouMind-OpenLab/awesome-seedance-2-prompts.

## AGPL Sources

AGPL sources can be studied for architecture, workflows, and behavior. Direct implementation reuse must follow AGPL obligations or an approved legal path. When CineJelly does not accept AGPL obligations for a module, use clean CineJelly rewriting from behavioral notes rather than copying implementation code.

The primary AGPL snapshot is OpenMontage.

## No-License Sources

No-license sources should remain in the snapshot/audit layer unless permission or a compatible reuse path is established. They can inform evaluation dimensions, vocabulary, and product planning notes, but production implementation should not copy protected expression from them.

The current no-license snapshot is DirectorBench.

## First Logic Areas To Translate

The highest-value early translation targets are:

- Emily2040/seedance-2.0 and YouMind prompt ordering, reference roles, prompt weights, negative constraints, and repair prompt structure
- ViMax long-form chunking, storyboard segmentation, reference selection, and consistency checkpoints
- VibeFrame deterministic artifact discipline, cost gates, build reports, and repair loop ordering
- VideoAgent intent decomposition, graph planning, and source-video understanding boundaries
- OpenMontage approval gates, reference-video analysis, provider scoring, and self-review as license-reviewed behavioral notes
- MoneyPrinterTurbo staged pipeline, material sourcing, task progress, batch candidate handling, subtitles, TTS, BGM, and one-input workflow ergonomics

Each translated area should produce a short source map before production changes begin.
