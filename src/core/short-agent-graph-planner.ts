/**
 * Short Agent v2 graph planner.
 * This is a deterministic, no-spend orchestration layer that turns the existing
 * short pipeline into a stateful agent run with research, memory, candidate
 * selection, critique/repair, and Seedance-specific prompt compilation.
 */

import type {
  BrandKitEvaluation,
  ProductUrlBrief,
  ShortPipelineConcept,
  ShortPipelineIntent,
  ShortPipelineScenePlan,
  WorkflowTemplateSuggestion
} from "../types/short-pipeline.js";
import type {
  ShortAgentCreativeCandidate,
  ShortAgentCritique,
  ShortAgentEvidenceItem,
  ShortAgentGraphRun,
  ShortAgentMemoryPack,
  ShortAgentMemoryPattern,
  ShortAgentRepairAction,
  ShortAgentResearchPack,
  ShortAgentResearchQuestion,
  ShortAgentStageName,
  ShortAgentStageRun,
  ShortSeedancePromptPack,
  ShortSeedanceShotPrompt
} from "../types/short-agent.js";
import type {
  ShortReferenceVideoLearningInput,
  ShortViralCreativeMode,
  ShortViralIntelligencePlan,
  ShortViralLever,
  ShortViralPlatformFocus
} from "../types/short-viral-intelligence.js";
import { createStableId } from "../utils/ids.js";

const SOURCE_PATTERN_ORIGINS = [
  "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects-by-hereandnow-ai",
  "nirdiamant/genai_agents:ContentIntelligence",
  "gswithjeff/autogen-multi-agent-workflow",
  "Shubhamsaboo/awesome-llm-apps",
  "YouMind-OpenLab/awesome-seedance-2-prompts",
  "ZeroLu/awesome-seedance"
] as const;

const GLOBAL_NEGATIVE_CONSTRAINTS = [
  "no unsupported medical, financial, or absolute claims",
  "no copied source-video faces, marks, script wording, music, or private assets",
  "no unreadable caption walls, tiny product labels, or cluttered UI overlays",
  "no slow logo intro before the viewer understands the payoff",
  "no watermark, random text artifacts, deformed hands, broken product geometry, or inconsistent packaging"
] as const;

export interface ShortAgentGraphPlannerInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly generatedAt: Date;
  readonly prompt: string;
  readonly intent: ShortPipelineIntent;
  readonly productBrief?: ProductUrlBrief;
  readonly brandKitEvaluation?: BrandKitEvaluation;
  readonly selectedTemplate?: WorkflowTemplateSuggestion;
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly viralIntelligence: ShortViralIntelligencePlan;
}

export interface ShortAgentGraphPlannerOutput {
  readonly graphRun: ShortAgentGraphRun;
  readonly seedancePromptPack: ShortSeedancePromptPack;
}

export class ShortAgentGraphPlanner {
  public build(input: ShortAgentGraphPlannerInput): ShortAgentGraphPlannerOutput {
    const researchPack = researchPackFor(input);
    const memoryPack = memoryPackFor(input);
    const candidates = candidateFactory(input, memoryPack);
    const selectedCandidate = candidates[0];
    const critiques = critiqueCouncil(input, selectedCandidate, researchPack, memoryPack);
    const repairs = repairActionsFor(critiques, selectedCandidate?.candidateId);
    const status = graphStatus(critiques, selectedCandidate);
    const seedancePromptPack = seedancePromptPackFor(input, selectedCandidate, critiques);
    const stages = stageRunsFor({
      status,
      input,
      researchPack,
      memoryPack,
      candidateCount: candidates.length,
      critiqueCount: critiques.length,
      repairCount: repairs.length,
      promptPack: seedancePromptPack
    });
    const graphRunId = createStableId(
      "short_agent_graph",
      [
        input.projectId,
        input.requestId ?? "",
        input.prompt,
        researchPack.packId,
        memoryPack.packId,
        selectedCandidate?.candidateId ?? "no_candidate",
        seedancePromptPack.promptPackId
      ].join(":")
    );

    const graphRun: ShortAgentGraphRun = {
      schemaVersion: "cinejelly.short-agent-graph-run.v1",
      graphRunId,
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt: input.generatedAt,
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      stages,
      researchPack,
      memoryPack,
      candidates,
      ...(selectedCandidate ? { selectedCandidateId: selectedCandidate.candidateId } : {}),
      critiques,
      repairs,
      seedancePromptPack,
      releaseGateSummary: {
        canUseAsNoSpendAgentEvidence: status !== "blocked",
        canRenderAfterApproval: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Short Agent v2 found a blocking issue in reference safety, claim safety, or Seedance feasibility."
          : "Short Agent v2 is no-spend planning evidence; render still requires formal review, quota/cost gates, artifact validation, and manual media review."
      },
      nextActions: nextActionsFor(status, critiques, researchPack)
    };

    return { graphRun, seedancePromptPack };
  }
}

function researchPackFor(input: ShortAgentGraphPlannerInput): ShortAgentResearchPack {
  const niche = input.viralIntelligence.nicheStrategy.niche;
  const product = input.productBrief?.title ?? "the offer";
  const questions: readonly ShortAgentResearchQuestion[] = [
    question("audience", `What does ${input.intent.audience} want immediately before they would watch a ${input.intent.platform} short?`, "Anchor the first second in audience intent."),
    question("pain", `What concrete pain or hesitation makes ${product} relevant in the ${niche} niche?`, "Avoid generic hooks and make the scroll-stopper specific."),
    question("proof", `Which provided product facts can be shown visually without overstating claims?`, "Turn claims into reviewable proof beats."),
    question("platform", `What pacing and caption rhythm fits ${input.viralIntelligence.nicheStrategy.platformFocus}?`, "Adapt the same idea to platform-native retention."),
    question("claim", "Which claim-bound lines require human approval before provider spend?", "Keep commercial safety explicit.")
  ];
  const evidence = evidenceFor(input);
  const unresolvedQuestions = [
    ...(!input.productBrief ? ["product facts and approved product media are not provided"] : []),
    ...(input.productBrief?.missingFields ?? []).map((field) => `product field still missing: ${field}`),
    ...(input.brandKitEvaluation ? [] : ["brand kit tone, CTA, and claim policy are not provided"]),
    ...(input.referenceVideoLearning ? [] : ["reference-video pattern is optional but not provided"])
  ];
  const packId = createStableId(
    "short_research_pack",
    [
      input.projectId,
      input.requestId ?? "",
      questions.map((item) => item.questionId).join("|"),
      evidence.map((item) => item.evidenceId).join("|")
    ].join(":")
  );
  return {
    schemaVersion: "cinejelly.short-agent-research-pack.v1",
    packId,
    noSpend: true,
    networkCallsMade: false,
    questions,
    evidence,
    unresolvedQuestions
  };
}

function memoryPackFor(input: ShortAgentGraphPlannerInput): ShortAgentMemoryPack {
  const strategy = input.viralIntelligence.nicheStrategy;
  const reference = input.viralIntelligence.referenceVideoPattern;
  const patterns: ShortAgentMemoryPattern[] = [
    memoryPattern(
      "platform_playbook",
      `${strategy.platformFocus} retention playbook`,
      `Open with payoff or tension in the first second, then change visual information before attention drops.`,
      [strategy.platformFocus, strategy.creativeMode, input.intent.platform]
    ),
    memoryPattern(
      "seedance_prompt_playbook",
      "Seedance shot timeline prompt",
      "Compile each beat with time range, camera move, subject action, micro-detail, audio, caption, continuity, and negative constraints.",
      ["seedance_2", "prompt_compiler", strategy.creativeMode]
    ),
    memoryPattern(
      "seedance_prompt_playbook",
      "Reference adaptation guardrail",
      "Use reference structure, pacing, camera language, and retention mechanics only; replace script, assets, identity, claims, and brand marks.",
      ["reference_video", "originality", strategy.platformFocus]
    )
  ];
  if (input.brandKitEvaluation?.brandName || input.brandKitEvaluation?.tone) {
    patterns.push(memoryPattern(
      "brand_memory",
      "Brand voice continuity",
      `Keep the voice ${input.brandKitEvaluation?.tone ?? "brand-consistent"} and keep CTA rules visible in the final approval packet.`,
      ["brand", input.brandKitEvaluation?.brandName ?? "unnamed_brand"]
    ));
  }
  if (reference) {
    patterns.push(memoryPattern(
      "reference_pattern",
      "Reference-video pattern memory",
      `Adapt hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; captions=${reference.captionPattern}.`,
      ["reference_video", reference.patternId]
    ));
  }
  const writeIntents = [
    "store accepted candidate score, final prompt pack id, review decisions, and render outcome after manual review",
    "update niche playbook with hooks, proof beats, and caption patterns that survived review",
    "store rejected critiques so future plans avoid repeated weak hooks, risky claims, or pacing gaps"
  ];
  const packId = createStableId(
    "short_memory_pack",
    `${input.projectId}:${input.requestId ?? ""}:${patterns.map((item) => item.patternId).join("|")}`
  );
  return {
    schemaVersion: "cinejelly.short-agent-memory-pack.v1",
    packId,
    noSpend: true,
    retrievedPatterns: patterns,
    writeIntents
  };
}

function candidateFactory(
  input: ShortAgentGraphPlannerInput,
  memoryPack: ShortAgentMemoryPack
): readonly ShortAgentCreativeCandidate[] {
  const strategy = input.viralIntelligence.nicheStrategy;
  const baseline = input.viralIntelligence.conceptScores;
  const conceptCandidates = input.concepts.map((concept) => {
    const viralScore = baseline.find((item) => item.conceptId === concept.conceptId);
    return candidateFromConcept(input, concept, strategy.creativeMode, strategy.platformFocus, strategy.viralLevers, viralScore?.totalScore);
  });
  const adaptiveCandidates = [
    adaptiveCandidate(input, "native proof remix", "UGC-style proof arc", "ugc_review", ["hook", "problem", "demo", "proof", "cta"]),
    adaptiveCandidate(input, "high-clarity product demo", "Demo-first conversion arc", "demo", ["hook", "demo", "proof", "offer", "cta"]),
    adaptiveCandidate(input, "cinematic payoff trailer", "Cinematic reveal arc", "cinematic", ["hook", "proof", "demo", "cta"])
  ].filter((candidate) => candidate.sceneRoles.length <= Math.max(6, input.scenes.length + 1));
  return [...conceptCandidates, ...adaptiveCandidates]
    .map((candidate) => rescoreWithMemory(candidate, memoryPack))
    .sort((left, right) => right.scores.total - left.scores.total || left.candidateId.localeCompare(right.candidateId))
    .slice(0, 6);
}

function critiqueCouncil(
  input: ShortAgentGraphPlannerInput,
  selectedCandidate: ShortAgentCreativeCandidate | undefined,
  researchPack: ShortAgentResearchPack,
  memoryPack: ShortAgentMemoryPack
): readonly ShortAgentCritique[] {
  const critiques: ShortAgentCritique[] = [];
  if (!selectedCandidate) {
    critiques.push(critique("continuity", "block", "No creative candidate was generated.", "Regenerate concepts before render."));
    return critiques;
  }
  if (selectedCandidate.scores.hook < 0.72) {
    critiques.push(critique("viral", "warn", "Selected hook is useful but not sharp enough for a TikTok/Douyin-first short.", "Add a contradiction, POV, mistake, or visible proof promise in the first second.", selectedCandidate.candidateId));
  }
  if (selectedCandidate.scores.seedanceFeasibility < 0.7 || input.scenes.length < 3) {
    critiques.push(critique("seedance_feasibility", "warn", "Storyboard has too few visible beat changes for robust Seedance generation.", "Use at least hook, proof/demo, and CTA beats with clear visual state changes.", selectedCandidate.candidateId));
  }
  if (input.productBrief?.claimInventory.some((claim) => claim.substantiationRequired)) {
    critiques.push(critique("brand_claim", "warn", "Some product claims require substantiation before render.", "Keep claim-bound narration conservative and require human claim approval.", input.productBrief.briefId));
  }
  if (input.brandKitEvaluation?.status === "blocked" || input.productBrief?.status === "blocked" || input.viralIntelligence.status === "blocked") {
    critiques.push(critique("brand_claim", "block", "Plan has blocked product, brand, or reference evidence.", "Correct blocked evidence before render handoff.", input.projectId));
  }
  if (researchPack.unresolvedQuestions.length >= 4) {
    critiques.push(critique("platform_native", "warn", "The agent has limited niche/product evidence and may produce a generic short.", "Provide product facts, target audience, or reference-video summary for sharper adaptation.", researchPack.packId));
  }
  if (!memoryPack.retrievedPatterns.some((pattern) => pattern.source === "reference_pattern") && /copy|clone|99%|same video/i.test(input.prompt)) {
    critiques.push(critique("continuity", "warn", "The brief asks for source imitation without a safe reference pattern.", "Use reference-video learning for structure only and forbid copying source assets.", selectedCandidate.candidateId));
  }
  return critiques;
}

function repairActionsFor(
  critiques: readonly ShortAgentCritique[],
  selectedCandidateId: string | undefined
): readonly ShortAgentRepairAction[] {
  return critiques
    .filter((item) => item.severity !== "info")
    .map((item) => {
      const targetId = item.targetId ?? selectedCandidateId ?? item.critiqueId;
      return {
        actionId: createStableId("short_repair", `${item.critiqueId}:${targetId}:${item.repair}`),
        targetId,
        change: item.repair,
        reason: item.message,
        applied: true as const
      };
    });
}

function seedancePromptPackFor(
  input: ShortAgentGraphPlannerInput,
  selectedCandidate: ShortAgentCreativeCandidate | undefined,
  critiques: readonly ShortAgentCritique[]
): ShortSeedancePromptPack {
  const strategy = input.viralIntelligence.nicheStrategy;
  const reference = input.viralIntelligence.referenceVideoPattern;
  const shots = shotPromptsFor(input, selectedCandidate);
  const promptPackId = createStableId(
    "short_seedance_pack",
    [
      input.projectId,
      input.requestId ?? "",
      selectedCandidate?.candidateId ?? "no_candidate",
      shots.map((shot) => shot.shotId).join("|")
    ].join(":")
  );
  const product = input.productBrief?.title ?? "operator-provided product or subject";
  const brand = input.brandKitEvaluation?.brandName ?? "operator-provided brand";
  const critiqueLine = critiques.length
    ? `Repair-aware constraints: ${critiques.map((item) => `${item.reviewer}:${item.repair}`).join(" ")}`
    : "No repair constraints beyond standard claim, reference, and continuity guardrails.";
  const masterPrompt = compactLines([
    `Seedance 2.0 short video prompt pack for ${input.intent.platform}.`,
    `Product/subject: ${product}. Brand: ${brand}. Niche: ${strategy.niche}. Audience: ${input.intent.audience}.`,
    `Creative mode: ${strategy.creativeMode}. Platform focus: ${strategy.platformFocus}. Target duration: ${input.intent.targetDurationSeconds}s. Aspect ratio: ${input.intent.aspectRatio}.`,
    selectedCandidate ? `Winning candidate: ${selectedCandidate.label}. Hook: ${selectedCandidate.hook}. Story arc: ${selectedCandidate.storyArc}.` : "",
    `Viewer desire: ${strategy.viewerDesire}. Viewer objection: ${strategy.viewerObjection}.`,
    `Use viral levers: ${strategy.viralLevers.join(", ")}.`,
    reference
      ? `Reference policy: adapt structure only from ${reference.patternId}; hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; captions=${reference.captionPattern}.`
      : "Reference policy: no external reference video pattern supplied; use original shots from product, brand, and user brief evidence.",
    critiqueLine,
    "Render the shot list in order. Keep captions readable and do not introduce new claims."
  ]);
  return {
    schemaVersion: "cinejelly.short-seedance-prompt-pack.v1",
    promptPackId,
    projectId: input.projectId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    platform: input.intent.platform,
    platformFocus: strategy.platformFocus,
    creativeMode: strategy.creativeMode,
    targetDurationSeconds: input.intent.targetDurationSeconds,
    aspectRatio: input.intent.aspectRatio,
    masterPrompt,
    shotPrompts: shots,
    globalNegativeConstraints: GLOBAL_NEGATIVE_CONSTRAINTS,
    audioPlan: audioPlanFor(strategy.creativeMode, input.brandKitEvaluation?.tone),
    captionPlan: captionPlanFor(strategy.platformFocus, input.brandKitEvaluation?.language),
    referencePolicy: reference
      ? `Use reference pattern ${reference.patternId} for timing and framing only; do not copy assets, words, identity, brand marks, music, or private material.`
      : "No source-video copying. Use only operator-provided or generated original assets.",
    sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
  };
}

function shotPromptsFor(
  input: ShortAgentGraphPlannerInput,
  selectedCandidate: ShortAgentCreativeCandidate | undefined
): readonly ShortSeedanceShotPrompt[] {
  const durations = durationsFor(input.scenes, input.intent.targetDurationSeconds);
  let cursor = 0;
  return input.scenes.map((sceneItem, index) => {
    const directive = input.viralIntelligence.sceneDirectives.find((item) => item.sceneId === sceneItem.sceneId);
    const duration = durations[index] ?? 1;
    const startSecond = roundSeconds(cursor);
    const endSecond = roundSeconds(Math.min(input.intent.targetDurationSeconds, cursor + duration));
    cursor = endSecond;
    const firstFrame = directive?.firstFrameRule ?? firstFrameFor(sceneItem, input);
    const camera = directive?.cameraCue ?? cameraFor(sceneItem, input.viralIntelligence.nicheStrategy.creativeMode);
    const action = actionFor(sceneItem, input, selectedCandidate);
    const caption = directive?.captionCue ?? sceneItem.caption;
    const audio = audioForScene(sceneItem, input.viralIntelligence.nicheStrategy.creativeMode, input.brandKitEvaluation?.tone);
    const continuity = continuityFor(sceneItem, input, index);
    const referencePolicy = directive?.referencePatternAlignment ??
      (input.viralIntelligence.referenceVideoPattern
        ? "Adapt reference timing and framing only; all assets and claims must be original or approved."
        : "Original shot based on user brief, product evidence, and brand kit.");
    const shotId = createStableId("short_seedance_shot", `${input.projectId}:${sceneItem.sceneId}:${startSecond}:${endSecond}:${action}`);
    return {
      shotId,
      sceneId: sceneItem.sceneId,
      order: sceneItem.order,
      role: sceneItem.role,
      startSecond,
      endSecond,
      durationSeconds: roundSeconds(Math.max(0.5, endSecond - startSecond)),
      firstFrame,
      visualPrompt: visualPromptFor(sceneItem, input, firstFrame, action),
      camera,
      action,
      dialogueOrNarration: sceneItem.narration,
      caption,
      audio,
      continuity,
      referencePolicy,
      negativeConstraints: negativeConstraintsFor(sceneItem, input),
      qualityChecks: directive?.qualityChecks ?? qualityChecksFor(sceneItem)
    };
  });
}

function stageRunsFor(input: {
  readonly status: ShortAgentGraphRun["status"];
  readonly input: ShortAgentGraphPlannerInput;
  readonly researchPack: ShortAgentResearchPack;
  readonly memoryPack: ShortAgentMemoryPack;
  readonly candidateCount: number;
  readonly critiqueCount: number;
  readonly repairCount: number;
  readonly promptPack: ShortSeedancePromptPack;
}): readonly ShortAgentStageRun[] {
  const finalStatus = stageStatus(input.status);
  return [
    stage("intake", "Orchestrator", "Normalized prompt, product, brand, platform, duration, and reference-video learning into graph state.", [input.input.projectId], "research_planner"),
    stage("research_planner", "Research Agent", `Created ${input.researchPack.questions.length} research questions with no live calls.`, [input.researchPack.packId], "evidence_curator"),
    stage("evidence_curator", "Evidence Curator", `Curated ${input.researchPack.evidence.length} evidence items and ${input.researchPack.unresolvedQuestions.length} unresolved questions.`, input.researchPack.evidence.map((item) => item.evidenceId), "memory_retriever"),
    stage("memory_retriever", "Memory/RAG Agent", `Retrieved ${input.memoryPack.retrievedPatterns.length} playbook patterns and prepared ${input.memoryPack.writeIntents.length} learning writes.`, [input.memoryPack.packId], "niche_strategist"),
    stage("niche_strategist", "Niche Strategist", `Selected ${input.input.viralIntelligence.nicheStrategy.creativeMode} for ${input.input.viralIntelligence.nicheStrategy.platformFocus}.`, [input.input.viralIntelligence.intelligenceId], "candidate_factory"),
    stage("candidate_factory", "Creative Candidate Factory", `Generated and ranked ${input.candidateCount} candidate arcs instead of binding to one hardcoded template.`, [], "critic_council"),
    stage("critic_council", "Critic Council", `Ran viral, brand/claim, Seedance feasibility, continuity, and platform-native reviews with ${input.critiqueCount} findings.`, [], "repair_loop"),
    stage("repair_loop", "Repair Agent", `Applied ${input.repairCount} repair instructions into prompt constraints and review evidence.`, [], "seedance_prompt_compiler"),
    stage("seedance_prompt_compiler", "Seedance Prompt Engineer", `Compiled ${input.promptPack.shotPrompts.length} time-coded Seedance shots with camera, action, audio, captions, continuity, and negatives.`, [input.promptPack.promptPackId], "approval_gate"),
    stage("approval_gate", finalStatus === "blocked" ? "Safety Gate" : "Human Approval Gate", finalStatus === "blocked" ? "Blocked before render until unsafe evidence is corrected." : "Requires human approval before any provider spend or render queue.", [input.promptPack.promptPackId], "learning_writer"),
    stage("learning_writer", "Memory Curator", "Prepared post-review learning writes for accepted/rejected candidate, prompt pack, and render outcome.", [input.memoryPack.packId])
  ].map((item) => ({
    ...item,
    status: item.stage === "approval_gate" || item.stage === "learning_writer" ? finalStatus : "completed" as const
  }));
}

function evidenceFor(input: ShortAgentGraphPlannerInput): readonly ShortAgentEvidenceItem[] {
  const product = input.productBrief;
  const brand = input.brandKitEvaluation;
  const reference = input.viralIntelligence.referenceVideoPattern;
  const values: ShortAgentEvidenceItem[] = [
    evidence("prompt", 0.72, `User intent: ${safeText(input.prompt, 220) || input.intent.businessGoal}`, false),
    evidence("platform", 0.78, `Platform=${input.intent.platform}; duration=${input.intent.targetDurationSeconds}s; aspect=${input.intent.aspectRatio}.`, false),
    evidence("platform", 0.86, `Viral mode=${input.viralIntelligence.nicheStrategy.creativeMode}; focus=${input.viralIntelligence.nicheStrategy.platformFocus}.`, input.viralIntelligence.status !== "ready")
  ];
  if (product) {
    values.push(evidence("product", product.status === "ready" ? 0.82 : 0.62, `Product ${product.title ?? "untitled"} has ${product.benefits.length} benefits, ${product.claimInventory.length} claims, and ${product.images.length} image records.`, product.status !== "ready"));
  }
  if (brand) {
    values.push(evidence("brand", brand.status === "ready" ? 0.82 : 0.58, `Brand ${brand.brandName ?? "unnamed"} tone=${brand.tone ?? "missing"} claimPolicy=${brand.allowedClaimCount + brand.forbiddenClaimCount}.`, brand.status !== "ready"));
  }
  if (reference) {
    values.push(evidence("reference", reference.safetyStatus === "learned_pattern" ? 0.78 : 0.52, `Reference pattern ${reference.patternId} supplies hook, pacing, camera, caption, and CTA structure only.`, reference.safetyStatus !== "learned_pattern"));
  }
  for (const claim of product?.claimInventory ?? []) {
    values.push(evidence("claim", claim.risk === "low" ? 0.76 : 0.48, `Claim ${claim.claimId} risk=${claim.risk}; substantiationRequired=${claim.substantiationRequired}.`, claim.substantiationRequired));
  }
  return values;
}

function question(
  focus: ShortAgentResearchQuestion["focus"],
  questionText: string,
  reason: string
): ShortAgentResearchQuestion {
  return {
    questionId: createStableId("short_question", `${focus}:${questionText}`),
    focus,
    question: questionText,
    reason,
    toolPolicy: "live_research_optional_after_cost_gate"
  };
}

function evidence(
  kind: ShortAgentEvidenceItem["kind"],
  confidence: number,
  summary: string,
  reviewRequired: boolean
): ShortAgentEvidenceItem {
  return {
    evidenceId: createStableId("short_evidence", `${kind}:${summary}:${reviewRequired}`),
    kind,
    confidence: clampScore(confidence),
    summary,
    reviewRequired
  };
}

function memoryPattern(
  source: ShortAgentMemoryPattern["source"],
  label: string,
  instruction: string,
  appliesTo: readonly string[]
): ShortAgentMemoryPattern {
  return {
    patternId: createStableId("short_memory", `${source}:${label}:${instruction}:${appliesTo.join("|")}`),
    source,
    label,
    instruction,
    appliesTo: appliesTo.map((item) => safeText(item, 80) ?? "unknown")
  };
}

function candidateFromConcept(
  input: ShortAgentGraphPlannerInput,
  concept: ShortPipelineConcept,
  mode: ShortViralCreativeMode,
  platformFit: ShortViralPlatformFocus,
  viralLevers: readonly ShortViralLever[],
  inheritedScore: number | undefined
): ShortAgentCreativeCandidate {
  const sceneRoles = input.scenes.map((sceneItem) => sceneItem.role);
  const hook = concept.hook;
  const storyArc = `${concept.angle} Resolve the viewer objection: ${input.viralIntelligence.nicheStrategy.viewerObjection}.`;
  const base = inheritedScore ?? 0.68;
  const hookScore = scoreHook(hook);
  const nicheFit = input.productBrief ? 0.8 : 0.58;
  const retention = clampScore(0.62 + viralLevers.length * 0.03 + (sceneRoles.length >= 4 ? 0.08 : 0));
  const brandSafety = input.brandKitEvaluation?.status === "blocked" ? 0.2 : input.brandKitEvaluation?.status === "ready" ? 0.86 : 0.66;
  const seedanceFeasibility = seedanceFeasibilityFor(sceneRoles, mode);
  const total = weightedTotal({ hookScore, nicheFit, retention, brandSafety, seedanceFeasibility, base });
  return {
    candidateId: createStableId("short_candidate", `${concept.conceptId}:${storyArc}:${sceneRoles.join("|")}`),
    sourceConceptId: concept.conceptId,
    label: concept.label,
    hook,
    storyArc,
    creativeMode: mode,
    platformFit,
    sceneRoles,
    viralLevers,
    scores: {
      hook: hookScore,
      nicheFit,
      retention,
      brandSafety,
      seedanceFeasibility,
      total
    },
    reasons: [
      `inherits concept score ${base.toFixed(2)}`,
      `${sceneRoles.length} scene beats with ${viralLevers.slice(0, 3).join(", ")}`,
      input.productBrief ? "uses product evidence" : "needs product evidence before commercial render"
    ]
  };
}

function adaptiveCandidate(
  input: ShortAgentGraphPlannerInput,
  label: string,
  arcLabel: string,
  mode: ShortViralCreativeMode,
  roles: readonly ShortPipelineScenePlan["role"][]
): ShortAgentCreativeCandidate {
  const strategy = input.viralIntelligence.nicheStrategy;
  const product = input.productBrief?.title ?? "the offer";
  const desire = strategy.viewerDesire;
  const hook = hookForMode(mode, product, desire, strategy.viewerObjection);
  const sceneRoles = roles.filter((role, index) => index === 0 || role !== roles[index - 1]);
  const hookScore = scoreHook(hook);
  const nicheFit = input.productBrief ? 0.82 : 0.56;
  const retention = clampScore(0.66 + sceneRoles.length * 0.035 + (strategy.platformFocus === "tiktok_douyin" ? 0.05 : 0));
  const brandSafety = input.brandKitEvaluation?.status === "blocked" ? 0.18 : input.brandKitEvaluation ? 0.72 : 0.58;
  const seedanceFeasibility = seedanceFeasibilityFor(sceneRoles, mode);
  const total = weightedTotal({ hookScore, nicheFit, retention, brandSafety, seedanceFeasibility, base: 0.72 });
  return {
    candidateId: createStableId("short_candidate", `${label}:${mode}:${input.projectId}:${input.prompt}:${sceneRoles.join("|")}`),
    label,
    hook,
    storyArc: `${arcLabel}: ${desire}; overcome objection: ${strategy.viewerObjection}.`,
    creativeMode: mode,
    platformFit: strategy.platformFocus,
    sceneRoles,
    viralLevers: strategy.viralLevers,
    scores: {
      hook: hookScore,
      nicheFit,
      retention,
      brandSafety,
      seedanceFeasibility,
      total
    },
    reasons: [
      "generated by adaptive candidate factory, not a fixed template",
      `fits ${strategy.platformFocus} with ${sceneRoles.length} beat changes`,
      `targets ${mode} creative mode`
    ]
  };
}

function rescoreWithMemory(
  candidate: ShortAgentCreativeCandidate,
  memoryPack: ShortAgentMemoryPack
): ShortAgentCreativeCandidate {
  const hasReferencePattern = memoryPack.retrievedPatterns.some((item) => item.source === "reference_pattern");
  const hasSeedancePattern = memoryPack.retrievedPatterns.some((item) => item.source === "seedance_prompt_playbook");
  const total = clampScore(candidate.scores.total + (hasReferencePattern ? 0.02 : 0) + (hasSeedancePattern ? 0.02 : 0));
  return {
    ...candidate,
    scores: {
      ...candidate.scores,
      total
    },
    reasons: [
      ...candidate.reasons,
      ...(hasReferencePattern ? ["uses safe reference-pattern memory"] : []),
      ...(hasSeedancePattern ? ["aligned to Seedance prompt playbook"] : [])
    ]
  };
}

function critique(
  reviewer: ShortAgentCritique["reviewer"],
  severity: ShortAgentCritique["severity"],
  message: string,
  repair: string,
  targetId?: string
): ShortAgentCritique {
  return {
    critiqueId: createStableId("short_critique", `${reviewer}:${severity}:${message}:${targetId ?? ""}`),
    reviewer,
    severity,
    message,
    repair,
    ...(targetId ? { targetId } : {})
  };
}

function graphStatus(
  critiques: readonly ShortAgentCritique[],
  selectedCandidate: ShortAgentCreativeCandidate | undefined
): ShortAgentGraphRun["status"] {
  if (!selectedCandidate || critiques.some((item) => item.severity === "block")) {
    return "blocked";
  }
  if (critiques.some((item) => item.severity === "warn") || selectedCandidate.scores.total < 0.78) {
    return "review_required";
  }
  return "ready";
}

function durationsFor(scenes: readonly ShortPipelineScenePlan[], targetDurationSeconds: number): readonly number[] {
  if (scenes.length === 0) {
    return [];
  }
  const weights = scenes.map((sceneItem) => {
    switch (sceneItem.role) {
      case "hook": return 0.55;
      case "problem": return 0.95;
      case "proof": return 1.15;
      case "demo": return 1.18;
      case "offer": return 0.8;
      case "cta": return 0.7;
    }
  });
  const totalWeight = weights.reduce((sum, item) => sum + item, 0);
  const minDuration = targetDurationSeconds <= 15 ? 1.2 : 1.8;
  const raw = weights.map((weight) => Math.max(minDuration, targetDurationSeconds * (weight / totalWeight)));
  const rawTotal = raw.reduce((sum, item) => sum + item, 0);
  return raw.map((item) => roundSeconds(item * (targetDurationSeconds / rawTotal)));
}

function firstFrameFor(sceneItem: ShortPipelineScenePlan, input: ShortAgentGraphPlannerInput): string {
  const product = input.productBrief?.title ?? input.viralIntelligence.nicheStrategy.niche;
  if (sceneItem.role === "hook") {
    return `First frame shows ${product} or the viewer problem instantly with one readable payoff promise.`;
  }
  if (sceneItem.role === "cta") {
    return `Final frame keeps ${product} and one CTA visible with clean negative space.`;
  }
  return "First frame continues the previous beat with visible movement and a clear subject.";
}

function cameraFor(sceneItem: ShortPipelineScenePlan, mode: ShortViralCreativeMode): string {
  if (mode === "ugc_review") {
    return sceneItem.role === "hook"
      ? "native creator handheld framing with a slight move toward the product or result"
      : "creator handheld close-up, natural movement, no overproduced studio feel";
  }
  if (mode === "cinematic") {
    return "premium motivated camera move, macro texture detail, clean product-safe framing";
  }
  return "clear product/result framing, one deliberate camera move, readable caption-safe space";
}

function actionFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  selectedCandidate: ShortAgentCreativeCandidate | undefined
): string {
  const product = input.productBrief?.title ?? "the product or subject";
  const desire = input.viralIntelligence.nicheStrategy.viewerDesire;
  const candidateCue = selectedCandidate ? ` The beat serves: ${selectedCandidate.storyArc}` : "";
  switch (sceneItem.role) {
    case "hook":
      return `Show the scroll-stopping problem or payoff for ${product}; make the visual legible before narration finishes.${candidateCue}`;
    case "problem":
      return `Depict the viewer hesitation: ${input.viralIntelligence.nicheStrategy.viewerObjection}; keep it specific and human.`;
    case "proof":
      return `Show a review-bound proof beat for ${desire}; use product evidence without exaggeration.`;
    case "demo":
      return `Demonstrate one simple use step for ${product}; show before-state, action, and after-state clearly.`;
    case "offer":
      return `Introduce the offer or reason to act as a natural continuation of the proof.`;
    case "cta":
      return `Close with one clear next step and no new claims.`;
  }
}

function visualPromptFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  firstFrame: string,
  action: string
): string {
  const style = input.brandKitEvaluation?.visualStyle ?? input.intent.emotion.replace(/_/g, " ");
  const product = input.productBrief?.title ?? "operator-provided product or subject";
  return compactLines([
    `${sceneItem.role.toUpperCase()} shot for ${product}.`,
    firstFrame,
    action,
    `Visual style: ${style}.`,
    `Scene direction: ${sceneItem.visualDirection}.`,
    `Keep composition ${input.intent.aspectRatio}, caption-safe, and product/subject consistent.`
  ]);
}

function audioForScene(
  sceneItem: ShortPipelineScenePlan,
  mode: ShortViralCreativeMode,
  tone: string | undefined
): string {
  const voice = tone ?? (mode === "ugc_review" ? "natural creator voice" : "clear commercial narration");
  if (sceneItem.role === "hook") {
    return `${voice}; immediate spoken hook, light bed, no loud intro sting.`;
  }
  if (sceneItem.role === "cta") {
    return `${voice}; music resolves under one CTA, keep words clean for TTS or native audio.`;
  }
  return `${voice}; narration supports the visual proof, with subtle SFX only when it clarifies action.`;
}

function continuityFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  index: number
): string {
  const product = input.productBrief?.title ?? "main subject";
  if (index === 0) {
    return `Establish ${product}, caption style, lighting, and viewer problem for all following shots.`;
  }
  if (sceneItem.role === "cta") {
    return `Return to ${product}, same visual identity, same claim policy, one CTA only.`;
  }
  return `Preserve ${product}, brand tone, color palette, caption rhythm, and claim wording from prior shots.`;
}

function negativeConstraintsFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput
): readonly string[] {
  return [
    ...GLOBAL_NEGATIVE_CONSTRAINTS,
    ...(sceneItem.claimIds.length > 0 ? ["do not strengthen claim language beyond approved claim inventory"] : []),
    ...(input.viralIntelligence.referenceVideoPattern ? ["do not recreate source-video identity, script, captions, music, or exact edit timing"] : [])
  ];
}

function qualityChecksFor(sceneItem: ShortPipelineScenePlan): readonly string[] {
  return [
    "first frame is understandable without sound",
    "caption expresses one idea only",
    "visual action changes during the shot",
    sceneItem.claimIds.length > 0 ? "claim wording matches review inventory" : "no new claim introduced"
  ];
}

function audioPlanFor(mode: ShortViralCreativeMode, tone: string | undefined): string {
  if (mode === "ugc_review") {
    return `Use ${tone ?? "natural"} creator narration, low-volume trend-compatible bed, and clean TTS-ready lines.`;
  }
  if (mode === "cinematic") {
    return `Use premium restrained narration or minimal VO, soft cinematic bed, and motivated SFX.`;
  }
  return `Use clear narration, light music bed, and SFX only where they clarify product action.`;
}

function captionPlanFor(platform: ShortViralPlatformFocus, language: string | undefined): string {
  const lang = language ?? "user-requested language";
  return platform === "tiktok_douyin"
    ? `Use ${lang}, one punchy caption per beat, high contrast, short line breaks, and first-second payoff text.`
    : `Use ${lang}, readable captions with one idea per scene and no claim expansion.`;
}

function stage(
  stageName: ShortAgentStageName,
  agentRole: string,
  summary: string,
  evidenceIds: readonly string[],
  nextNode?: ShortAgentStageName
): ShortAgentStageRun {
  return {
    stage: stageName,
    status: "completed",
    agentRole,
    summary,
    evidenceIds,
    ...(nextNode ? { nextNode } : {})
  };
}

function stageStatus(status: ShortAgentGraphRun["status"]): ShortAgentStageRun["status"] {
  return status === "blocked" ? "blocked" : status === "review_required" ? "review_required" : "completed";
}

function nextActionsFor(
  status: ShortAgentGraphRun["status"],
  critiques: readonly ShortAgentCritique[],
  researchPack: ShortAgentResearchPack
): readonly string[] {
  if (status === "blocked") {
    return [
      "Correct blocked product, brand, claim, or reference-video evidence before rendering.",
      "Regenerate Short Agent v2 graph evidence after unsafe inputs are removed."
    ];
  }
  return [
    ...(researchPack.unresolvedQuestions.length > 0 ? ["Add missing product, brand, audience, or reference evidence to improve niche adaptation."] : []),
    ...(critiques.some((item) => item.severity === "warn") ? ["Review repair actions and approve claim, reference, caption, and Seedance prompt constraints."] : []),
    "After approval, pass the Seedance prompt pack through normal render cost/quota gates.",
    "Write accepted/rejected creative outcome back to memory after manual media review."
  ];
}

function hookForMode(
  mode: ShortViralCreativeMode,
  product: string,
  desire: string,
  objection: string
): string {
  switch (mode) {
    case "ugc_review":
      return `POV: you want ${desire}, but ${objection}.`;
    case "demo":
      return `Watch ${product} solve this in one visible step.`;
    case "comparison":
      return `Old way vs ${product}: the difference is visible fast.`;
    case "education":
      return `Most people miss this before they try ${product}.`;
    case "story":
      return `The moment ${product} starts making sense.`;
    case "cinematic":
      return `${product}, revealed through the result first.`;
    case "testimonial":
      return `I did not trust ${product} until I saw this proof.`;
    case "problem_solution":
      return `If ${objection}, this is the simpler next step.`;
    case "product_ad":
      return `Stop scrolling if you want ${desire}.`;
  }
}

function scoreHook(hook: string): number {
  let score = 0.58;
  if (/\b(pov|stop|watch|why|mistake|proof|real|before|after|old way|secret)\b/i.test(hook)) score += 0.18;
  if (/[?!:]/.test(hook)) score += 0.05;
  if (hook.length <= 130) score += 0.06;
  return clampScore(score);
}

function seedanceFeasibilityFor(
  roles: readonly ShortPipelineScenePlan["role"][],
  mode: ShortViralCreativeMode
): number {
  let score = roles.length >= 3 ? 0.76 : 0.56;
  if (roles.includes("demo") || roles.includes("proof")) score += 0.08;
  if (roles[0] === "hook" && roles[roles.length - 1] === "cta") score += 0.06;
  if (mode === "cinematic" && roles.length > 5) score -= 0.08;
  return clampScore(score);
}

function weightedTotal(input: {
  readonly hookScore: number;
  readonly nicheFit: number;
  readonly retention: number;
  readonly brandSafety: number;
  readonly seedanceFeasibility: number;
  readonly base: number;
}): number {
  return clampScore(
    input.hookScore * 0.23 +
    input.nicheFit * 0.18 +
    input.retention * 0.22 +
    input.brandSafety * 0.16 +
    input.seedanceFeasibility * 0.15 +
    input.base * 0.06
  );
}

function safeText(value: string | undefined, maxLength: number): string | undefined {
  const clean = value
    ?.replace(/\bhttps?:\/\/[^\s)>,"]+/gi, "[redacted-url]")
    .replace(/[A-Za-z]:\\[^\s]+|\\\\[^\s]+|(?:^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s]+/gi, " [redacted-path]")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function compactLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}
