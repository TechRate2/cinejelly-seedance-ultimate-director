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
import type { ShortChannelStyleProfile } from "../types/short-channel-style.js";
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
  ShortSeedanceAudioScriptLine,
  ShortSeedanceDurationProductionContract,
  ShortSeedancePromptPack,
  ShortSeedanceProductionAct,
  ShortSeedanceShotBeatContract,
  ShortSeedanceShotPrompt
} from "../types/short-agent.js";
import type {
  ShortCreativeIdeaCandidate,
  ShortReferenceVideoLearningInput,
  ShortViralCreativeMode,
  ShortViralIntelligencePlan,
  ShortViralLever,
  ShortViralPlatformFocus
} from "../types/short-viral-intelligence.js";
import { hasCopyRiskIntent } from "../utils/copy-risk-intent.js";
import { createStableId } from "../utils/ids.js";
import { resolveSeedanceDna, SEEDANCE_ANATOMY_DIRECTIVE } from "./seedance-dna.js";
import { registerForCreativeMode } from "./register-grammar.js";
import {
  internalSourcePatternOrigins,
  SHORT_AGENT_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_AGENT_SOURCE_PATTERN_IDS);

const GLOBAL_NEGATIVE_CONSTRAINTS = [
  "no unsupported medical, financial, or absolute claims",
  "no copied source-video faces, marks, script wording, music, or private assets",
  "no on-screen text, no captions, no subtitles, no CTA cards, no typography, no lower thirds, and no fake UI text",
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
  readonly channelStyleProfile?: ShortChannelStyleProfile;
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
    question("platform", `What visual rhythm fits ${input.viralIntelligence.nicheStrategy.platformFocus} without on-screen text?`, "Adapt the same idea to platform-native retention."),
    question("claim", "Which claim-bound lines require human approval before provider spend?", "Keep commercial safety explicit.")
  ];
  const evidence = evidenceFor(input);
  const unresolvedQuestions = [
    ...(!input.productBrief ? ["product facts and approved product media are not provided"] : []),
    ...(input.productBrief?.missingFields ?? []).map((field) => `product field still missing: ${field}`),
    ...(input.brandKitEvaluation ? [] : ["brand kit tone and claim policy are not provided"]),
    ...(input.referenceVideoLearning ? referenceLearningGaps(input.referenceVideoLearning) : ["reference-video pattern is optional but not provided"])
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
  const selectedIdea = selectedCreativeIdea(input);
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
      "Compile each beat with time range, camera move, subject action, micro-detail, audio, no-visible-text policy, continuity, and negative constraints.",
      ["seedance_2", "prompt_compiler", strategy.creativeMode]
    ),
    memoryPattern(
      "seedance_prompt_playbook",
      "Reference adaptation guardrail",
      "Use reference structure, pacing, camera language, and retention mechanics only; replace script, assets, identity, claims, and brand marks.",
      ["reference_video", "originality", strategy.platformFocus]
    ),
    memoryPattern(
      "seedance_prompt_playbook",
      "Seedance reference tag binding",
      "When provider references exist, mention each reference tag before visual prose, bind KOL identity and product geometry first, then describe camera, action, light, audio, and endpoint.",
      ["reference_to_video", "@image", "identity", "product"]
    ),
    memoryPattern(
      "seedance_prompt_playbook",
      "Human-real UGC acting",
      "Direct realistic human behavior with natural blink timing, tiny eye-line shifts, hand-speed imperfections, skin texture, physical product contact, and conversational pauses; avoid mannequin poses and plastic skin.",
      ["ugc_review", "creator", "kol", "realism"]
    )
  ];
  if (input.brandKitEvaluation?.brandName || input.brandKitEvaluation?.tone) {
    patterns.push(memoryPattern(
      "brand_memory",
      "Brand voice continuity",
      `Keep the voice ${input.brandKitEvaluation?.tone ?? "brand-consistent"} and keep claim/no-visible-text rules visible in the final approval packet.`,
      ["brand", input.brandKitEvaluation?.brandName ?? "unnamed_brand"]
    ));
  }
  if (input.channelStyleProfile) {
    patterns.push(...input.channelStyleProfile.styleAnchors.slice(0, 8).map((anchorItem) =>
      memoryPattern(
        "channel_style_memory",
        `${anchorItem.kind}: ${anchorItem.label}`,
        anchorItem.instruction,
        ["channel_style", anchorItem.kind, input.channelStyleProfile?.profileId ?? "unknown_profile"]
      )
    ));
  }
  if (reference) {
    patterns.push(memoryPattern(
      "reference_pattern",
      "Reference-video pattern memory",
      `Adapt hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; text rhythm=${reference.captionPattern}; do not render text.`,
      ["reference_video", reference.patternId]
    ));
  }
  if (selectedIdea) {
    patterns.push(memoryPattern(
      "creative_pattern_learning",
      "Selected creative-pattern idea",
      `Use idea=${selectedIdea.label}; hook=${selectedIdea.hook}; proof=${selectedIdea.proofPlan}; arc=${selectedIdea.sceneArc.slice(0, 5).join(" > ")}. Keep expression original and rights-cleared.`,
      ["creative_pattern_learning", selectedIdea.ideaId, selectedIdea.patternId, strategy.niche]
    ));
  }
  const writeIntents = [
    "store accepted candidate score, final prompt pack id, review decisions, and render outcome after manual review",
    "update niche playbook with hooks, proof beats, visual rhythm, and audio choices that survived review",
    ...(input.channelStyleProfile ? ["update channel style profile with approved recurring hooks, voice notes, character continuity, and setting continuity"] : []),
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

function selectedCreativeIdea(input: ShortAgentGraphPlannerInput): ShortCreativeIdeaCandidate | undefined {
  const learning = input.viralIntelligence.creativePatternLearning;
  return learning.candidates.find((candidate) => candidate.ideaId === learning.selectedIdeaId) ?? learning.candidates[0];
}

function candidateFactory(
  input: ShortAgentGraphPlannerInput,
  memoryPack: ShortAgentMemoryPack
): readonly ShortAgentCreativeCandidate[] {
  const strategy = input.viralIntelligence.nicheStrategy;
  const selectedIdea = selectedCreativeIdea(input);
  const baseline = input.viralIntelligence.conceptScores;
  const creativeIdeaCandidate = selectedIdea ? candidateFromCreativeIdea(input, selectedIdea) : undefined;
  const conceptCandidates = input.concepts.map((concept) => {
    const viralScore = baseline.find((item) => item.conceptId === concept.conceptId);
    return candidateFromConcept(input, concept, strategy.creativeMode, strategy.platformFocus, strategy.viralLevers, viralScore?.totalScore);
  });
  const adaptiveCandidates = [
    adaptiveCandidate(input, "native proof remix", "UGC-style proof arc", "ugc_review", ["hook", "problem", "demo", "proof", "payoff"]),
    adaptiveCandidate(input, "high-clarity product demo", "Demo-first conversion arc", "demo", ["hook", "demo", "proof", "offer", "payoff"]),
    adaptiveCandidate(input, "cinematic payoff trailer", "Cinematic reveal arc", "cinematic", ["hook", "proof", "demo", "payoff"])
  ].filter((candidate) => candidate.sceneRoles.length <= Math.max(6, input.scenes.length + 1));
  return [
    ...(creativeIdeaCandidate ? [creativeIdeaCandidate] : []),
    ...conceptCandidates,
    ...adaptiveCandidates
  ]
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
    critiques.push(critique("seedance_feasibility", "warn", "Storyboard has too few visible beat changes for robust Seedance generation.", "Use at least hook, proof/demo, and payoff beats with clear visual state changes.", selectedCandidate.candidateId));
  }
  if (input.productBrief?.claimInventory.some((claim) => claim.substantiationRequired)) {
    critiques.push(critique("brand_claim", "warn", "Some product claims require substantiation before render.", "Keep claim-bound narration conservative and require human claim approval.", input.productBrief.briefId));
  }
  if (missingCommercialEvidence(input, researchPack)) {
    critiques.push(critique(
      "platform_native",
      "warn",
      "Commercial or viral short planning is missing enough product, brand, audience, or reference evidence for a high-confidence customer-ready plan.",
      "Collect product facts, brand/claim policy, target audience, and optional reference-video structure before paid render.",
      researchPack.packId
    ));
  }
  if (input.brandKitEvaluation?.status === "blocked" || input.productBrief?.status === "blocked" || input.viralIntelligence.status === "blocked") {
    critiques.push(critique("brand_claim", "block", "Plan has blocked product, brand, or reference evidence.", "Correct blocked evidence before render handoff.", input.projectId));
  }
  if (researchPack.unresolvedQuestions.length >= 4) {
    critiques.push(critique("platform_native", "warn", "The agent has limited niche/product evidence and may produce a generic short.", "Provide product facts, target audience, or reference-video summary for sharper adaptation.", researchPack.packId));
  }
  if (!memoryPack.retrievedPatterns.some((pattern) => pattern.source === "reference_pattern") && hasCopyRiskIntent(input.prompt)) {
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
  const selectedIdea = selectedCreativeIdea(input);
  const shots = shotPromptsFor(input, selectedCandidate, critiques);
  const durationProductionContract = durationProductionContractFor(input, shots);
  const audioScript = audioScriptFor(input, shots);
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
  const channelStyleLine = channelStylePromptLine(input.channelStyleProfile);
  const critiqueLine = critiques.length
    ? `Repair-aware constraints: ${critiques.map((item) => `${item.reviewer}:${item.repair}`).join(" ")}`
    : "No repair constraints beyond standard claim, reference, and continuity guardrails.";
  const masterPrompt = compactLines([
    `Seedance 2.0 short video prompt pack for ${input.intent.platform}.`,
    `Product/subject: ${product}. Brand: ${brand}. Niche: ${strategy.niche}. Audience: ${input.intent.audience}.`,
    channelStyleLine,
    `Creative mode: ${strategy.creativeMode}. Platform focus: ${strategy.platformFocus}. Target duration: ${input.intent.targetDurationSeconds}s. Aspect ratio: ${input.intent.aspectRatio}.`,
    shortDurationArcPrompt(input.intent.targetDurationSeconds, input.scenes),
    durationProductionContractLine(durationProductionContract),
    selectedCandidate ? `Winning candidate: ${selectedCandidate.label}. Hook: ${selectedCandidate.hook}. Story arc: ${selectedCandidate.storyArc}.` : "",
    selectedIdea ? `Selected creative-pattern idea: ${selectedIdea.label}. Hook: ${selectedIdea.hook}. Proof: ${selectedIdea.proofPlan}. KOL direction: ${selectedIdea.creatorOrKolDirection}.` : "",
    `Viewer desire: ${strategy.viewerDesire}. Viewer objection: ${strategy.viewerObjection}.`,
    `Use viral levers: ${strategy.viralLevers.join(", ")}.`,
    ...resolveSeedanceDna({ niche: strategy.niche, creativeMode: strategy.creativeMode }).promptLines,
    SEEDANCE_ANATOMY_DIRECTIVE,
    "Seedance quality contract: write prompt details as physical direction, not abstract marketing. Specify reference binding, subject identity, product geometry, lens distance, camera motion, lighting source, hand/action timing, material texture, background depth, audio bed, and exact final frame.",
    seedanceReferenceHandleDiscipline(input),
    "Human realism contract: natural blink timing, tiny pauses before/after product contact, believable eye-line, slight handheld correction, real skin/hand texture, and unpolished creator timing. Avoid stiff posing, plastic skin, warped fingers, floating products, overacting, and studio-commercial fakery unless user asks for cinematic mode.",
    `Native/audio contract: if model audio is enabled, produce natural room tone, voice timing, soft music/SFX, and cadence from the shot audio fields; also keep the TTS-ready audio script separate for later external voice APIs. Script lines: ${audioScript.map((line) => `${line.startSecond}-${line.endSecond}s ${line.spokenLine}`).join(" | ")}`,
    reference
      ? `Reference policy: adapt structure only from ${reference.patternId}; hook=${reference.hookPattern}; pacing=${reference.pacingPattern}; camera=${reference.cameraPattern}; text-rhythm=${reference.captionPattern}; do not render visible text.`
      : "Reference policy: no external reference video pattern supplied; use original shots from product, brand, and user brief evidence.",
    critiqueLine,
    "Render the shot list in order. Do not render any visible text, captions, subtitles, CTA cards, labels, or fake UI text; do not introduce new claims."
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
    durationProductionContract,
    audioScript,
    globalNegativeConstraints: GLOBAL_NEGATIVE_CONSTRAINTS,
    audioPlan: audioPlanFor(strategy.creativeMode, channelVoiceStyle(input.channelStyleProfile) ?? input.brandKitEvaluation?.tone),
    captionPlan: visibleTextPlanFor(strategy.platformFocus, input.brandKitEvaluation?.language, input.channelStyleProfile?.captionStyle),
    referencePolicy: reference
      ? `Use reference pattern ${reference.patternId} for timing and framing only; do not copy assets, words, identity, brand marks, music, or private material.`
      : "No source-video copying. Use only operator-provided or generated original assets.",
    sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
  };
}

function shotPromptsFor(
  input: ShortAgentGraphPlannerInput,
  selectedCandidate: ShortAgentCreativeCandidate | undefined,
  critiques: readonly ShortAgentCritique[]
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
    const action = compactLines([
      actionFor(sceneItem, input, selectedCandidate),
      timeboxedActionCueFor(sceneItem, startSecond, endSecond, input.intent.targetDurationSeconds)
    ]);
    const caption = "NO_ON_SCREEN_TEXT";
    const audio = audioForScene(sceneItem, input.viralIntelligence.nicheStrategy.creativeMode, channelVoiceStyle(input.channelStyleProfile) ?? input.brandKitEvaluation?.tone);
    const beatContract = beatContractFor(sceneItem, input, index, startSecond, endSecond);
    const voiceoverLine = voiceoverLineFor(sceneItem, input, beatContract, startSecond, endSecond);
    const musicCue = musicCueFor(sceneItem, input.viralIntelligence.nicheStrategy.creativeMode);
    const sfxCue = sfxCueFor(sceneItem, input.productBrief?.title ?? "main subject");
    const nativeAudioPrompt = nativeAudioPromptFor({
      audio,
      voiceoverLine,
      musicCue,
      sfxCue,
      beatContract
    });
    const continuity = continuityFor(sceneItem, input, index);
    const transitionBridge = transitionBridgeFor(sceneItem, input, index);
    const referencePolicy = directive?.referencePatternAlignment ??
      (input.viralIntelligence.referenceVideoPattern
        ? "Adapt reference timing and framing only; all assets and claims must be original or approved."
        : "Original shot based on user brief, product evidence, and brand kit.");
    const scopedReferencePolicy = compactLines([
      referencePolicy,
      seedanceReferenceHandleDiscipline(input)
    ]);
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
      dialogueOrNarration: voiceoverLine,
      caption,
      audio,
      beatContract,
      voiceoverLine,
      nativeAudioPrompt,
      musicCue,
      sfxCue,
      continuity,
      transitionBridge,
      referencePolicy: scopedReferencePolicy,
      negativeConstraints: negativeConstraintsFor(sceneItem, input),
      qualityChecks: uniqueStrings([
        ...(directive?.qualityChecks ?? qualityChecksFor(sceneItem)),
        ...repairChecksFor(critiques, sceneItem)
      ], 10)
    };
  });
}

function durationProductionContractFor(
  input: ShortAgentGraphPlannerInput,
  shots: readonly ShortSeedanceShotPrompt[]
): ShortSeedanceDurationProductionContract {
  const actStructure = shots.map((shot) => shot.beatContract.act);
  const sceneRoleOrder = input.scenes.map((sceneItem) => sceneItem.role);
  const targetDurationSeconds = input.intent.targetDurationSeconds;
  const minVisualChangeCount = Math.max(
    input.scenes.length,
    targetDurationSeconds <= 15
      ? 4
      : targetDurationSeconds <= 30
        ? 8
        : Math.min(24, Math.ceil(targetDurationSeconds / 3))
  );
  const hasOpening = actStructure.includes("opening");
  const hasDevelopment = actStructure.includes("development");
  const hasPayoff = actStructure.includes("payoff");
  const timingRisk: ShortSeedanceDurationProductionContract["timingRisk"] =
    hasOpening && hasDevelopment && hasPayoff && shots.length >= 3
      ? "low"
      : shots.length >= 2
        ? "medium"
        : "high";
  return {
    schemaVersion: "cinejelly.short-duration-production-contract.v1",
    targetDurationSeconds,
    actStructure,
    sceneRoleOrder,
    minVisualChangeCount,
    completionRule: completionRuleFor(targetDurationSeconds, sceneRoleOrder),
    timingRisk
  };
}

function durationProductionContractLine(contract: ShortSeedanceDurationProductionContract): string {
  return [
    "Duration production contract:",
    `target=${contract.targetDurationSeconds}s`,
    `acts=${contract.actStructure.join(">")}`,
    `roles=${contract.sceneRoleOrder.join(">")}`,
    `minVisualChanges=${contract.minVisualChangeCount}`,
    `timingRisk=${contract.timingRisk}`,
    contract.completionRule
  ].join(" ");
}

function completionRuleFor(
  targetDurationSeconds: number,
  roles: readonly ShortPipelineScenePlan["role"][]
): string {
  const roleLine = roles.join(" > ");
  if (targetDurationSeconds <= 15) {
    return `Complete the whole promise inside ${targetDurationSeconds}s: opening hook, proof/demo development, and payoff ending must all be visible; role order ${roleLine}.`;
  }
  if (targetDurationSeconds <= 30) {
    return `Complete a compact three-act short inside ${targetDurationSeconds}s with no dead scene: hook, context, proof/demo, and ending payoff; role order ${roleLine}.`;
  }
  return `Sustain the short across ${targetDurationSeconds}s with repeated information changes, but still resolve the original hook in the final act; role order ${roleLine}.`;
}

function beatContractFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  index: number,
  startSecond: number,
  endSecond: number
): ShortSeedanceShotBeatContract {
  const product = input.productBrief?.title ?? "main subject";
  const act = productionActFor(sceneItem, index, input.scenes.length);
  return {
    act,
    timingGoal: timeboxedActionCueFor(sceneItem, startSecond, endSecond, input.intent.targetDurationSeconds),
    requiredVisualChange: visualChangeFor(sceneItem, product),
    narrationJob: narrationJobFor(sceneItem, product),
    audioJob: audioJobFor(sceneItem, act),
    endpointJob: endpointJobFor(sceneItem, input, index)
  };
}

function productionActFor(
  sceneItem: ShortPipelineScenePlan,
  index: number,
  sceneCount: number
): ShortSeedanceProductionAct {
  if (index === 0 || sceneItem.role === "hook") {
    return "opening";
  }
  if (index === sceneCount - 1 || sceneItem.role === "payoff" || sceneItem.role === "offer") {
    return "payoff";
  }
  return "development";
}

function visualChangeFor(sceneItem: ShortPipelineScenePlan, product: string): string {
  switch (sceneItem.role) {
    case "hook":
      return `viewer sees ${product} or the problem/result promise before the first second ends`;
    case "problem":
      return "viewer sees the friction become specific through a human action or before-state";
    case "proof":
      return `viewer sees concrete evidence, texture, comparison, or product behavior for ${product}`;
    case "demo":
      return `viewer sees before-state, product contact/action, and after-state for ${product}`;
    case "offer":
      return "viewer sees why acting now follows naturally from the proof without a text card";
    case "payoff":
      return `viewer sees the resolved result, human reaction, or product-in-result frame for ${product}`;
  }
}

function narrationJobFor(sceneItem: ShortPipelineScenePlan, product: string): string {
  switch (sceneItem.role) {
    case "hook":
      return `say the problem or result promise in one natural spoken line about ${product}`;
    case "problem":
      return "name the viewer friction without exaggeration";
    case "proof":
      return "explain only the evidence visible in-frame";
    case "demo":
      return "talk through the use step while the action is happening";
    case "offer":
      return "make the next step feel earned, not pushy";
    case "payoff":
      return "resolve the original promise and stop before adding a new claim";
  }
}

function audioJobFor(sceneItem: ShortPipelineScenePlan, act: ShortSeedanceProductionAct): string {
  const base = act === "opening"
    ? "audio starts immediately with no dead air"
    : act === "payoff"
      ? "audio resolves cleanly under the final visual"
      : "audio keeps pace with the visible action";
  if (sceneItem.role === "demo" || sceneItem.role === "proof") {
    return `${base}; product/contact SFX may clarify the action but must not cover speech`;
  }
  return `${base}; music stays low and uncopyrighted`;
}

function endpointJobFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  index: number
): string {
  const product = input.productBrief?.title ?? "main subject";
  const next = input.scenes[index + 1];
  if (!next) {
    return `finish on resolved ${product}/result frame with audio tail clean enough for final delivery`;
  }
  return `hold a stable ${product}/KOL/result frame that can become the first-frame reference for the next ${next.role} shot`;
}

function voiceoverLineFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  beatContract: ShortSeedanceShotBeatContract,
  startSecond: number,
  endSecond: number
): string {
  const product = input.productBrief?.title ?? "this";
  const base = safeText(sceneItem.narration, 180);
  const timing = `${startSecond}-${endSecond}s`;
  if (base && base !== "NO_ON_SCREEN_TEXT") {
    return `${base} (${timing}; ${beatContract.narrationJob})`;
  }
  switch (sceneItem.role) {
    case "hook":
      return `Watch what changes when ${product} enters the routine. (${timing}; immediate spoken hook)`;
    case "problem":
      return `This is the part that usually makes people hesitate. (${timing}; human context)`;
    case "proof":
      return `Here is the visible proof I would actually check. (${timing}; evidence only)`;
    case "demo":
      return `I use it like this, then look for the result in-frame. (${timing}; action-led demo)`;
    case "offer":
      return `If this matches your routine, this is the moment to compare it. (${timing}; soft next step)`;
    case "payoff":
      return `That is the before-to-after feeling the video promised. (${timing}; resolved ending)`;
  }
}

function musicCueFor(sceneItem: ShortPipelineScenePlan, mode: ShortViralCreativeMode): string {
  if (mode === "cinematic") {
    return sceneItem.role === "payoff"
      ? "restrained cinematic bed resolves softly"
      : "premium low-volume cinematic pulse under dialogue";
  }
  // Every phone-register mode (ugc_review, testimonial, …) gets the platform-native cue — the
  // register's audio axis allows at most a single trending/platform bed, never a scored ad bed;
  // testimonial used to fall through to the generic "music bed" default (contradiction-probe #1).
  if (registerForCreativeMode(mode) === "natural_phone_kol") {
    return sceneItem.role === "hook"
      ? "quiet platform-native bed starts under the first word"
      : "low-volume social bed stays behind natural creator speech";
  }
  return "light low-volume music bed, no copyrighted melody, never louder than speech";
}

function sfxCueFor(sceneItem: ShortPipelineScenePlan, product: string): string {
  if (sceneItem.role === "demo" || sceneItem.role === "proof") {
    return `subtle real contact SFX for ${product} only when touch/action is visible`;
  }
  if (sceneItem.role === "payoff") {
    return "small room-tone tail or soft resolve, no loud whoosh";
  }
  return "natural room tone, no distracting stings";
}

function nativeAudioPromptFor(input: {
  readonly audio: string;
  readonly voiceoverLine: string;
  readonly musicCue: string;
  readonly sfxCue: string;
  readonly beatContract: ShortSeedanceShotBeatContract;
}): string {
  return compactLines([
    input.audio,
    `Native audio line: ${input.voiceoverLine}`,
    `Music cue: ${input.musicCue}`,
    `SFX cue: ${input.sfxCue}`,
    `Audio job: ${input.beatContract.audioJob}`
  ]);
}

function audioScriptFor(
  input: ShortAgentGraphPlannerInput,
  shots: readonly ShortSeedanceShotPrompt[]
): readonly ShortSeedanceAudioScriptLine[] {
  const languageHint = input.brandKitEvaluation?.language ?? "user-requested language";
  const voiceStyle = channelVoiceStyle(input.channelStyleProfile) ?? input.brandKitEvaluation?.tone ?? (
    input.viralIntelligence.nicheStrategy.creativeMode === "ugc_review"
      ? "natural creator voice"
      : "clear short-form narration"
  );
  return shots.map((shot) => ({
    shotId: shot.shotId,
    sceneId: shot.sceneId,
    startSecond: shot.startSecond,
    endSecond: shot.endSecond,
    languageHint,
    voiceStyle,
    spokenLine: shot.voiceoverLine,
    delivery: deliveryFor(shot.beatContract.act, shot.role),
    musicCue: shot.musicCue,
    sfxCue: shot.sfxCue,
    externalTtsReady: true as const
  }));
}

function deliveryFor(
  act: ShortSeedanceProductionAct,
  role: ShortPipelineScenePlan["role"]
): string {
  if (act === "opening") {
    return "start immediately, natural and clear, no intro pause";
  }
  if (act === "payoff") {
    return "slower final cadence, resolve the promise, do not add a new claim";
  }
  return role === "demo" || role === "proof"
    ? "match speech rhythm to visible hand/product action"
    : "keep speech conversational and paced for retention";
}

function seedanceReferenceHandleDiscipline(input: ShortAgentGraphPlannerInput): string {
  const hasReferencePattern = Boolean(input.viralIntelligence.referenceVideoPattern || input.referenceVideoLearning);
  const sourceVideoClause = hasReferencePattern
    ? "Source-video @video handles may guide structure, pacing, camera grammar, acting energy, and payoff timing only."
    : "If no @video source pattern exists, do not invent one.";
  return [
    "Reference handle discipline: when render routing exposes @image/@video/@audio handles, bind each handle by role before visual prose.",
    "KOL/identity @image anchors and product @image anchors outrank @video trend/source handles, style references, camera references, and audio references.",
    sourceVideoClause,
    "Never let @video overwrite user KOL face, product geometry, background replacement, claim wording, audio, or CTA."
  ].join(" ");
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
    stage("seedance_prompt_compiler", "Seedance Prompt Engineer", `Compiled ${input.promptPack.shotPrompts.length} time-coded Seedance shots with camera, action, audio, no-visible-text policy, continuity, and negatives.`, [input.promptPack.promptPackId], "approval_gate"),
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
  if (input.channelStyleProfile) {
    const profile = input.channelStyleProfile;
    values.push(evidence(
      "channel_style",
      profile.status === "ready" ? 0.86 : profile.status === "review_required" ? 0.64 : 0.28,
      `Channel style ${profile.channelName ?? profile.profileId} has ${profile.styleAnchors.length} anchors, ${profile.characterCount} characters, ${profile.voiceCount} voices, and ${profile.settingCount} settings.`,
      profile.status !== "ready"
    ));
  }
  if (reference) {
    values.push(evidence("reference", reference.safetyStatus === "learned_pattern" ? 0.78 : 0.52, `Reference pattern ${reference.patternId} supplies hook, pacing, camera, visual rhythm, and payoff structure only; visible text is forbidden.`, reference.safetyStatus !== "learned_pattern"));
  }
  if (input.referenceVideoLearning) {
    const gaps = referenceLearningGaps(input.referenceVideoLearning);
    values.push(evidence(
      "reference",
      gaps.length === 0 ? 0.74 : 0.46,
      `Operator reference summary completeness: ${gaps.length === 0 ? "complete enough for structure transfer" : `${gaps.length} missing fields`}.`,
      gaps.length > 0
    ));
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

function referenceLearningGaps(input: ShortReferenceVideoLearningInput): readonly string[] {
  const gaps: string[] = [];
  if (!input.summary?.trim()) gaps.push("reference-video summary is missing");
  if (!input.hook?.trim()) gaps.push("reference hook pattern is missing");
  if (!input.pacing?.trim()) gaps.push("reference pacing pattern is missing");
  if (!input.cameraStyle?.trim()) gaps.push("reference camera style is missing");
  if (!input.captionStyle?.trim()) gaps.push("reference caption style is missing");
  if (!input.audioStyle?.trim()) gaps.push("reference audio style is missing");
  if (!input.retentionPattern?.trim()) gaps.push("reference retention pattern is missing");
  return gaps;
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

function candidateFromCreativeIdea(
  input: ShortAgentGraphPlannerInput,
  idea: ShortCreativeIdeaCandidate
): ShortAgentCreativeCandidate {
  const strategy = input.viralIntelligence.nicheStrategy;
  const sceneRoles = input.scenes.map((sceneItem) => sceneItem.role);
  const storyArc = `${idea.logline} Scene arc: ${idea.sceneArc.slice(0, 6).join(" > ")}.`;
  const seedanceFeasibility = clampScore((idea.score.renderability + seedanceFeasibilityFor(sceneRoles, strategy.creativeMode)) / 2);
  const total = clampScore(idea.score.totalScore + 0.07);
  return {
    candidateId: createStableId("short_candidate", `${idea.ideaId}:${storyArc}:${sceneRoles.join("|")}`),
    label: idea.label,
    hook: idea.hook,
    storyArc,
    creativeMode: strategy.creativeMode,
    platformFit: strategy.platformFocus,
    sceneRoles,
    viralLevers: strategy.viralLevers,
    scores: {
      hook: idea.score.hookPotential,
      nicheFit: idea.score.nicheFit,
      retention: idea.score.retentionPotential,
      brandSafety: idea.score.brandSafety,
      seedanceFeasibility,
      total
    },
    reasons: uniqueStrings([
      `selected creative-pattern idea ${idea.ideaId}`,
      `proof plan: ${idea.proofPlan}`,
      `creator/KOL: ${idea.creatorOrKolDirection}`,
      `nonClone=${idea.score.nonCloneSafety}; renderability=${idea.score.renderability}`,
      ...idea.reasons
    ], 8)
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
  const hasCreativePattern = memoryPack.retrievedPatterns.some((item) => item.source === "creative_pattern_learning");
  const candidateUsesSelectedIdea = candidate.reasons.some((reason) => reason.startsWith("selected creative-pattern idea "));
  const total = clampScore(candidate.scores.total +
    (hasReferencePattern ? 0.02 : 0) +
    (hasSeedancePattern ? 0.02 : 0) +
    (hasCreativePattern && candidateUsesSelectedIdea ? 0.03 : 0));
  return {
    ...candidate,
    scores: {
      ...candidate.scores,
      total
    },
    reasons: [
      ...candidate.reasons,
      ...(hasReferencePattern ? ["uses safe reference-pattern memory"] : []),
      ...(hasSeedancePattern ? ["aligned to Seedance prompt playbook"] : []),
      ...(hasCreativePattern && candidateUsesSelectedIdea ? ["uses selected creative-pattern memory"] : [])
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

function missingCommercialEvidence(
  input: ShortAgentGraphPlannerInput,
  researchPack: ShortAgentResearchPack
): boolean {
  const commercialOrViralIntent = /ad|ads|ugc|review|shop|buy|sell|conversion|cta|lead|product|offer|viral|trend|niche|tiktok|douyin|reels/i.test(input.prompt);
  if (!commercialOrViralIntent) {
    return false;
  }
  if (!input.productBrief || !input.brandKitEvaluation) {
    return true;
  }
  if (input.productBrief.missingFields.length >= 2 || input.productBrief.claimInventory.some((claim) => claim.substantiationRequired)) {
    return true;
  }
  if (input.brandKitEvaluation.status !== "ready") {
    return true;
  }
  return researchPack.unresolvedQuestions.length >= 2;
}

function repairChecksFor(
  critiques: readonly ShortAgentCritique[],
  sceneItem: ShortPipelineScenePlan
): readonly string[] {
  const checks: string[] = [];
  for (const critiqueItem of critiques) {
    if (critiqueItem.severity === "info") continue;
    if (critiqueItem.reviewer === "viral" && sceneItem.role === "hook") {
      checks.push(`repair applied: ${critiqueItem.repair}`);
    }
    if (critiqueItem.reviewer === "brand_claim" && sceneItem.claimIds.length > 0) {
      checks.push(`repair applied: ${critiqueItem.repair}`);
    }
    if (critiqueItem.reviewer === "seedance_feasibility") {
      checks.push(`repair applied: ${critiqueItem.repair}`);
    }
    if (critiqueItem.reviewer === "platform_native" && (sceneItem.role === "hook" || sceneItem.role === "proof")) {
      checks.push(`repair applied: ${critiqueItem.repair}`);
    }
    if (critiqueItem.reviewer === "continuity" && sceneItem.role !== "hook") {
      checks.push(`repair applied: ${critiqueItem.repair}`);
    }
  }
  return checks;
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
      case "payoff": return 0.7;
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
    return `First frame shows ${product} or the viewer problem instantly with a clear visual payoff promise, no text.`;
  }
  if (sceneItem.role === "payoff") {
    return `Final frame keeps ${product} or the result visible with clean composition and no text overlay.`;
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
  return "clear product/result framing, one deliberate camera move, no text-safe composition";
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
    case "payoff":
      return `Close with one clear result or next-step implication and no new claims or CTA card.`;
  }
}

function shortDurationArcPrompt(
  targetDurationSeconds: number,
  scenes: readonly ShortPipelineScenePlan[]
): string {
  const roles = scenes.map((sceneItem) => sceneItem.role).join(" > ");
  if (targetDurationSeconds <= 15) {
    return `15s completion contract: first second must hook with problem/result promise; middle must show context plus demo/proof action; final seconds must show payoff/result/soft next step. Planned roles: ${roles}. Do not make three product-only macros.`;
  }
  if (targetDurationSeconds <= 30) {
    return `Short pacing contract: complete hook, context, proof/demo, payoff, and soft next step inside ${targetDurationSeconds}s with visible information change every 1-3s. Planned roles: ${roles}.`;
  }
  return `Short pacing contract: every scene must move the viewer from hook to proof to payoff across ${targetDurationSeconds}s; avoid filler, repeated angles, and unresolved endings. Planned roles: ${roles}.`;
}

function timeboxedActionCueFor(
  sceneItem: ShortPipelineScenePlan,
  startSecond: number,
  endSecond: number,
  targetDurationSeconds: number
): string {
  const window = `${startSecond}-${endSecond}s of ${targetDurationSeconds}s`;
  switch (sceneItem.role) {
    case "hook":
      return `Timing ${window}: opening act, show problem or payoff promise before 1s and end ready for proof.`;
    case "problem":
      return `Timing ${window}: setup act, make the friction human and specific, then point toward the product need.`;
    case "proof":
      return `Timing ${window}: proof act, show evidence or product behavior with visible state change.`;
    case "demo":
      return `Timing ${window}: demo act, include before-state, product contact/action, and after-state inside this beat.`;
    case "offer":
      return `Timing ${window}: decision act, make the next step feel earned by the proof, without a text card.`;
    case "payoff":
      return `Timing ${window}: ending act, resolve the hook with result/reaction/product-in-result frame and no new claim.`;
  }
}

function visualPromptFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  firstFrame: string,
  action: string
): string {
  const style = input.channelStyleProfile?.visualStyle ?? input.brandKitEvaluation?.visualStyle ?? input.intent.emotion.replace(/_/g, " ");
  const product = input.productBrief?.title ?? "operator-provided product or subject";
  const realism = realismDirectionFor(sceneItem, input.viralIntelligence.nicheStrategy.creativeMode);
  const texture = textureDirectionFor(sceneItem, input);
  const ending = endingFrameFor(sceneItem, product);
  const channelAnchors = input.channelStyleProfile?.styleAnchors.length
    ? `Channel anchors: ${input.channelStyleProfile.styleAnchors.slice(0, 4).map((anchorItem) => `${anchorItem.kind}=${anchorItem.instruction}`).join(" ")}`
    : "";
  return compactLines([
    `${sceneItem.role.toUpperCase()} shot for ${product}.`,
    firstFrame,
    action,
    channelAnchors,
    `Visual style: ${style}.`,
    `Realism direction: ${realism}`,
    `Physical detail: ${texture}`,
    `Scene direction: ${sceneItem.visualDirection}.`,
    `Ending frame: ${ending}`,
    `Keep composition ${input.intent.aspectRatio}, no-visible-text safe, and product/subject consistent.`
  ]);
}

function audioForScene(
  sceneItem: ShortPipelineScenePlan,
  mode: ShortViralCreativeMode,
  tone: string | undefined
): string {
  const voice = tone ?? (mode === "ugc_review" ? "natural creator voice" : "clear commercial narration");
  if (sceneItem.role === "hook") {
    return `${voice}; immediate spoken hook, low-volume platform-native bed, believable room tone, no loud intro sting, no copyrighted music.`;
  }
  if (sceneItem.role === "payoff") {
    return `${voice}; music resolves under the visual payoff, keep narration clean for TTS, natural breathing cadence, avoid hard-sell CTA wording.`;
  }
  return `${voice}; narration supports the visual proof, with subtle product/contact SFX only when it clarifies action and never covers speech.`;
}

function continuityFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  index: number
): string {
  const product = input.productBrief?.title ?? "main subject";
  if (index === 0) {
    return `Establish ${product}, visual rhythm, lighting, creator eye-line, and viewer problem for all following shots.`;
  }
  if (sceneItem.role === "payoff") {
    return `Return to ${product}, same visual identity, same claim policy, coherent hand/face/wardrobe continuity, no text overlay.`;
  }
  return `Preserve ${product}, creator identity, brand tone, color palette, visual rhythm, and claim wording from prior shots.`;
}

function transitionBridgeFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput,
  index: number
): string {
  const scenes = input.scenes;
  const product = input.productBrief?.title ?? "main subject";
  const previous = scenes[index - 1];
  const next = scenes[index + 1];
  const currentWindow = `${sceneItem.role} ${sceneItem.order}`;
  const previousLine = previous
    ? `Start as if cutting from ${previous.role}: keep ${product}, KOL face, hand position, lighting color, room tone, and screen direction continuous.`
    : `Start with a clean handle: ${product} or viewer problem is readable immediately, with no dead air or slow logo lead-in.`;
  const nextLine = next
    ? `End by setting up ${next.role}: hold a stable product/KOL/result frame that can become the next clip first frame.`
    : `End with a resolved last frame: ${product} or result remains visible, audio resolves, and no new claim appears.`;
  const actionLine = sceneItem.role === "hook"
    ? "The edit must feel like an intentional cold open, then hand off to proof without a jump."
    : sceneItem.role === "payoff"
      ? "The edit must close the arc and make the ending feel earned by earlier proof."
      : "The edit must preserve motion direction and continue the viewer's information path without resetting the scene.";
  return compactLines([
    `Transition bridge for ${currentWindow}.`,
    previousLine,
    nextLine,
    actionLine,
    "Avoid boundary artifacts: sudden face/product drift, new background, color-temperature jump, mismatched hand pose, audio bed drop, or unrelated camera angle."
  ]);
}

function negativeConstraintsFor(
  sceneItem: ShortPipelineScenePlan,
  input: ShortAgentGraphPlannerInput
): readonly string[] {
  return [
    ...GLOBAL_NEGATIVE_CONSTRAINTS,
    "no waxy faces, frozen expressions, robotic gestures, floating products, impossible reflections, or unnatural hand-object contact",
    ...(sceneItem.claimIds.length > 0 ? ["do not strengthen claim language beyond approved claim inventory"] : []),
    ...(input.viralIntelligence.referenceVideoPattern ? ["do not recreate source-video identity, script, captions, music, or exact edit timing"] : [])
  ];
}

function qualityChecksFor(sceneItem: ShortPipelineScenePlan): readonly string[] {
  return [
    "first frame is understandable without sound",
    "no visible text appears in the generated video",
    "visual action changes during the shot",
    "human motion feels candid with believable micro-pauses and product contact",
    "product shape, label, color, and size stay stable",
    sceneItem.claimIds.length > 0 ? "claim wording matches review inventory" : "no new claim introduced"
  ];
}

function realismDirectionFor(sceneItem: ShortPipelineScenePlan, mode: ShortViralCreativeMode): string {
  if (mode === "ugc_review") {
    return sceneItem.role === "hook"
      ? "creator starts mid-action, quick eye-line to lens, one small handheld correction, natural blink, product enters frame from real hand"
      : "creator moves like a real take: micro-pause before touching product, imperfect hand speed, visible contact, natural reaction";
  }
  if (mode === "cinematic") {
    return "motivated premium motion with realistic texture, shallow depth, stable product geometry, no artificial gloss";
  }
  return "natural body mechanics, believable hand-object contact, clear product/result motion, no stiff staged posing";
}

function textureDirectionFor(sceneItem: ShortPipelineScenePlan, input: ShortAgentGraphPlannerInput): string {
  const product = input.productBrief?.title ?? "product";
  if (sceneItem.role === "proof" || sceneItem.role === "demo") {
    return `show tactile evidence for ${product}: surface texture, contact shadow, tiny reflections, realistic hand pressure, and stable packaging geometry`;
  }
  if (sceneItem.role === "hook") {
    return `make ${product} or the viewer problem readable in the first second with real lighting and non-perfect handheld framing`;
  }
  return `keep ${product} materially consistent with natural light, contact shadows, background depth, and no artificial labels`;
}

function endingFrameFor(sceneItem: ShortPipelineScenePlan, product: string): string {
  if (sceneItem.role === "payoff") {
    return `${product} remains visible with a calm human reaction and a usable last frame for chaining.`;
  }
  if (sceneItem.role === "demo" || sceneItem.role === "proof") {
    return `end on the completed action, ${product} still visible, ready for last-frame continuity into the next shot.`;
  }
  return `end with motion still readable and ${product} or viewer tension visible, avoiding hard freeze or text overlay.`;
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

function visibleTextPlanFor(platform: ShortViralPlatformFocus, language: string | undefined, channelCaptionStyle: string | undefined): string {
  const lang = language ?? "user-requested language";
  const style = channelCaptionStyle ? ` Treat channel caption style as pacing reference only, never as visible text: ${channelCaptionStyle}.` : "";
  return platform === "tiktok_douyin"
    ? `Use ${lang} for narration/audio only. No on-screen captions, subtitles, CTA cards, labels, or typography; communicate beat changes through visuals and audio.${style}`
    : `Use ${lang} for narration/audio only. Keep every scene free of visible text and claim-expanding overlays.${style}`;
}

function channelStylePromptLine(profile: ShortChannelStyleProfile | undefined): string {
  if (!profile) {
    return "";
  }
  const anchors = profile.styleAnchors
    .slice(0, 8)
    .map((anchorItem) => `${anchorItem.kind}:${anchorItem.label}=${anchorItem.instruction}`)
    .join(" | ");
  const rules = [
    profile.styleRules.length ? `rules=${profile.styleRules.slice(0, 6).join("; ")}` : "",
    profile.doNotChange.length ? `do_not_change=${profile.doNotChange.slice(0, 6).join("; ")}` : "",
    profile.avoidPatterns.length ? `avoid=${profile.avoidPatterns.slice(0, 6).join("; ")}` : ""
  ].filter(Boolean).join(" ");
  return `Channel style profile ${profile.profileId}: ${profile.channelName ?? "unnamed channel"}${profile.seriesName ? ` / ${profile.seriesName}` : ""}. Reuse identity across scripts without cloning external media. Anchors: ${anchors || "none"}. ${rules}`;
}

function channelVoiceStyle(profile: ShortChannelStyleProfile | undefined): string | undefined {
  return profile?.styleAnchors.find((anchorItem) => anchorItem.kind === "voice")?.instruction;
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
    ...(critiques.some((item) => item.severity === "warn") ? ["Review repair actions and approve claim, reference, no-visible-text, and Seedance prompt constraints."] : []),
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
  if (roles[0] === "hook" && roles[roles.length - 1] === "payoff") score += 0.06;
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

function uniqueStrings(values: readonly string[], limit: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(2));
}
