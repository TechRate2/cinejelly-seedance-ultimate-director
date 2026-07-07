#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-agent-graph-smoke-report.json";

function parseArgs(args) {
  const options = { outputPath: defaultOutput, writeReport: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

const options = parseArgs(process.argv.slice(2));
if (extname(options.outputPath).toLowerCase() !== ".json") {
  throw new Error("--output must point to a JSON file.");
}

const { ShortPipelinePlanner } = await import("../dist/core/short-pipeline-planner.js");
const { buildShortPipelineRenderHandoff } = await import("../dist/core/short-pipeline-render-handoff.js");

const planner = new ShortPipelinePlanner();
const generatedAt = new Date("2026-06-21T00:00:00.000Z");

const plan = planner.buildPlan({
  projectId: "short_agent_graph_smoke",
  requestId: "req_short_agent_graph_45s",
  generatedAt,
  userPrompt: "Create a 45 second TikTok/Douyin UGC review ad for busy skincare buyers. It must feel native, high-retention, proof-led, easy to repost on Reels, and never use hardcoded template scenes.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 45,
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum?signature=abc123&utm_source=ad",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      metaDescription: "A lightweight serum for dull-looking morning skin.",
      imageUrls: ["https://cdn.example.com/glow-focus-serum/front.jpg?token=secret"],
      benefits: [
        "Visibly improves dull-looking skin in daily routines",
        "Lightweight texture layers cleanly under makeup"
      ],
      claims: ["Visibly improves dull-looking skin"],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "native premium but warm",
    language: "en",
    visualStyle: "clean macro beauty with creator handheld proof",
    colorPalette: ["#f7e8df", "#222222", "#ffffff"],
    approvedAssetIds: ["brand/glow-lab/logo"],
    allowedClaims: ["visibly improves dull-looking skin"],
    forbiddenClaims: ["cures acne overnight"],
    ctaRules: ["Use one CTA only"],
    voicePreferences: ["confident creator review"]
  },
  referenceVideoLearning: {
    sourceLabel: "rights-cleared creator review pattern",
    sourceUrl: "https://media.example.com/reference/glow-review",
    summary: "Creator starts with a tired morning-skin problem, shows texture close-up, applies product, then reveals a clean makeup-ready finish.",
    hook: "POV: your morning skin looks tired but you still have five minutes.",
    durationSeconds: 42,
    sceneCount: 5,
    pacing: "fast handheld hook, pain beat, texture proof, application demo, payoff, soft CTA",
    cameraStyle: "creator handheld opening, macro product close-up, bathroom mirror payoff",
    captionStyle: "one punchy line per beat with proof words emphasized",
    audioStyle: "natural creator narration over quiet trend-compatible bed",
    retentionPattern: "hold the payoff until after texture proof and application demo",
    ctaStyle: "soft shop-now CTA after visible payoff",
    visualMotifs: ["morning mirror", "texture close-up", "makeup-ready finish"],
    doNotCopy: true
  }
});

const handoff = buildShortPipelineRenderHandoff({
  plan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_agent_graph_smoke_workspace"
  }
});

const serialized = JSON.stringify({ plan, handoff });
const rawSourceLeak = serialized.includes("https://shop.example.com") ||
  serialized.includes("https://media.example.com/reference/glow-review") ||
  serialized.includes("signature=abc123") ||
  serialized.includes("token=secret");

const graph = plan.agentGraph;
const pack = plan.seedancePromptPack;
const durationContract = pack?.durationProductionContract;
const audioScript = pack?.audioScript ?? [];
const selectedIdea = plan.viralIntelligence.creativePatternLearning.candidates.find(
  (candidate) => candidate.ideaId === plan.viralIntelligence.creativePatternLearning.selectedIdeaId
);
const selectedGraphCandidate = graph?.candidates.find((candidate) => candidate.candidateId === graph.selectedCandidateId);
const generatedAudioIntents = handoff.request.generatedAudioIntents ?? [];
const checks = [
  graph?.noSpend && graph.networkCallsMade === false && graph.providerCallsMade === false &&
    pack?.schemaVersion === "cinejelly.short-seedance-prompt-pack.v1"
    ? pass("agent_graph_no_spend", "Short Agent v2 graph runs without network, provider, render, or Atlas calls.")
    : fail("agent_graph_no_spend", "Expected no-spend Short Agent v2 graph and Seedance prompt pack."),
  graph?.stages.map((stage) => stage.stage).join(">") === "intake>research_planner>evidence_curator>memory_retriever>niche_strategist>candidate_factory>critic_council>repair_loop>seedance_prompt_compiler>approval_gate>learning_writer"
    ? pass("stateful_graph_stages", "Graph exposes the full stateful workflow for UI/ops visibility.")
    : fail("stateful_graph_stages", "Expected all Short Agent v2 stages in order."),
  graph?.researchPack.questions.length >= 5 &&
    graph.researchPack.evidence.length >= 5 &&
    graph.memoryPack.retrievedPatterns.some((pattern) => pattern.source === "seedance_prompt_playbook") &&
    graph.memoryPack.retrievedPatterns.some((pattern) => pattern.source === "creative_pattern_learning") &&
    graph.memoryPack.writeIntents.length >= 3
    ? pass("research_memory_pack", "Research questions, curated evidence, Seedance playbook memory, selected idea memory, and learning writes are present.")
    : fail("research_memory_pack", "Expected research pack, evidence, memory playbooks, selected creative idea memory, and learning write intents."),
  graph?.candidates.length >= 4 &&
    Boolean(graph.selectedCandidateId) &&
    graph.candidates[0].scores.total >= graph.candidates[graph.candidates.length - 1].scores.total &&
    graph.candidates.every((candidate) => candidate.reasons.length > 0)
    ? pass("candidate_factory_ranking", "Agent generates and ranks multiple adaptive candidate arcs instead of binding to one hardcoded template.")
    : fail("candidate_factory_ranking", "Expected ranked adaptive candidate arcs."),
  Boolean(selectedIdea) &&
    selectedGraphCandidate?.label === selectedIdea.label &&
    pack?.masterPrompt.includes("Selected creative-pattern idea:") &&
    pack.masterPrompt.includes(selectedIdea.label)
    ? pass("selected_creative_idea_reaches_agent_graph", "Winning creative-pattern idea becomes graph memory, selected candidate, and Seedance master prompt guidance.")
    : fail("selected_creative_idea_reaches_agent_graph", "Expected winning creative-pattern idea to reach graph ranking and master prompt."),
  pack?.masterPrompt.includes("Reference handle discipline:") &&
    pack.masterPrompt.includes("KOL/identity @image anchors and product @image anchors outrank @video") &&
    pack.shotPrompts.every((shot) =>
      shot.referencePolicy.includes("Reference handle discipline:") &&
      shot.referencePolicy.includes("Never let @video overwrite user KOL face")
    )
    ? pass("seedance_reference_handle_discipline", "Short Agent prompt pack locks @image KOL/product anchors ahead of @video source/trend handles before render compilation.")
    : fail("seedance_reference_handle_discipline", "Expected Short Agent prompt pack and every shot reference policy to include @image/@video handle priority discipline."),
  plan.scenes.length >= 5 &&
    pack?.shotPrompts.length === plan.scenes.length &&
    pack.shotPrompts.every((shot) =>
      shot.visualPrompt.includes("Visual style:") &&
      shot.camera.length > 20 &&
      shot.action.length > 20 &&
      shot.transitionBridge?.includes("Transition bridge") &&
      shot.transitionBridge.includes("Avoid boundary artifacts") &&
      shot.negativeConstraints.length >= 5 &&
      shot.qualityChecks.length >= 3
    )
    ? pass("seedance_timecoded_prompt_pack", "Seedance prompt pack contains dynamic scene count, time-coded shots, camera/action/audio/no-visible-text/transition-bridge/negative constraints.")
    : fail("seedance_timecoded_prompt_pack", "Expected dynamic scene count and detailed Seedance shot prompts with transition bridges."),
  handoff.request.metadata?.shortAgentGraphRunId === graph?.graphRunId &&
    handoff.request.metadata?.shortSeedancePromptPackId === pack?.promptPackId &&
    handoff.request.userInput.includes("Seedance 2.0 prompt pack:") &&
    handoff.request.userInput.includes("Time-coded Seedance shots:") &&
    handoff.request.userInput.includes("Transition bridge:")
    ? pass("render_handoff_receives_prompt_pack", "Render handoff receives Short Agent graph metadata and the Seedance prompt pack with transition bridge contracts.")
    : fail("render_handoff_receives_prompt_pack", "Expected render handoff to include agent graph, Seedance prompt pack, and transition bridge contracts."),
  durationContract?.schemaVersion === "cinejelly.short-duration-production-contract.v1" &&
    durationContract.actStructure.includes("opening") &&
    durationContract.actStructure.includes("development") &&
    durationContract.actStructure.includes("payoff") &&
    durationContract.minVisualChangeCount >= plan.scenes.length &&
    pack?.shotPrompts.every((shot) =>
      shot.beatContract.act &&
      shot.beatContract.requiredVisualChange.length > 20 &&
      shot.beatContract.endpointJob.length > 20 &&
      shot.voiceoverLine.length > 20 &&
      shot.nativeAudioPrompt.includes("Native audio line:")
    )
    ? pass("duration_audio_production_contract", "Prompt pack carries a structured opening/development/payoff contract, shot-level visual changes, endpoint jobs, voiceover lines, and native-audio prompts.")
    : fail("duration_audio_production_contract", "Expected structured duration/audio production contract on the prompt pack and every shot."),
  audioScript.length === pack?.shotPrompts.length &&
    audioScript.every((line) =>
      line.externalTtsReady === true &&
      line.spokenLine.length > 20 &&
      line.endSecond > line.startSecond &&
      pack.shotPrompts.some((shot) =>
        shot.shotId === line.shotId &&
        shot.voiceoverLine === line.spokenLine &&
        shot.startSecond === line.startSecond &&
        shot.endSecond === line.endSecond
      )
    )
    ? pass("tts_ready_audio_script_matches_shots", "TTS-ready audio script lines match every Seedance shot timing and voiceover line.")
    : fail("tts_ready_audio_script_matches_shots", "Expected audio script coverage to match shot timing and spoken lines."),
  plan.audioPolicy.renderAudioMode === "hybrid" &&
    plan.audioPolicy.nativeProviderAudioEnabled === true &&
    plan.audioPolicy.externalAudioScriptEnabled === true &&
    plan.seedanceRouting.generatedAudioMode === "hybrid" &&
    handoff.request.settings.audioMode === "hybrid" &&
    handoff.request.metadata?.shortAudioNativeProviderEnabled === "true" &&
    handoff.request.metadata?.shortAudioExternalScriptEnabled === "true" &&
    handoff.request.userInput.includes("TTS-ready audio script:") &&
    handoff.request.userInput.includes("Duration production contract:")
    ? pass("hybrid_audio_handoff_default", "Short handoff defaults to hybrid model audio plus external script cues and carries both contracts into provider prompt text.")
    : fail("hybrid_audio_handoff_default", "Expected hybrid audio mode, native-provider flag, external script flag, and prompt handoff contracts."),
  generatedAudioIntents.length === audioScript.length &&
    generatedAudioIntents.every((intent) => {
      const line = audioScript.find((item) => item.spokenLine === intent.prompt);
      return Boolean(line) &&
        intent.startSecond === line.startSecond &&
        intent.endSecond === line.endSecond &&
        intent.durationSeconds === Number(Math.max(1, line.endSecond - line.startSecond).toFixed(2));
    })
    ? pass("generated_audio_intents_use_prompt_pack_timing", "Generated-audio intents reuse prompt-pack audio script timing instead of naive equal scene splitting.")
    : fail("generated_audio_intents_use_prompt_pack_timing", "Expected generated-audio intents to align with prompt-pack audio script timing."),
  !rawSourceLeak
    ? pass("raw_source_redaction", "Raw product/reference URLs and signed query tokens are not serialized in agent evidence or handoff.")
    : fail("raw_source_redaction", "Expected raw source URLs and secret-like query values to stay redacted.")
];

const report = {
  schemaVersion: "cinejelly.short-agent-graph-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: graph?.sourcePatternOrigins ?? [],
  checkedInputs: {
    outputPath: options.outputPath,
    targetDurationSeconds: plan.intent.targetDurationSeconds,
    sceneCount: plan.scenes.length,
    candidateCount: graph?.candidates.length ?? 0,
    promptShotCount: pack?.shotPrompts.length ?? 0,
    durationProductionContractPresent: durationContract?.schemaVersion === "cinejelly.short-duration-production-contract.v1",
    audioScriptLineCount: audioScript.length,
    hybridAudioDefault: plan.seedanceRouting.generatedAudioMode === "hybrid" && handoff.request.settings.audioMode === "hybrid",
    selectedCreativeIdeaCandidatePresent: selectedGraphCandidate?.label === selectedIdea?.label,
    rawSourceLeakCheckPassed: !rawSourceLeak
  },
  graphSummary: {
    graphRunId: graph?.graphRunId,
    graphStatus: graph?.status,
    selectedCandidateId: graph?.selectedCandidateId,
    researchQuestionCount: graph?.researchPack.questions.length ?? 0,
    evidenceCount: graph?.researchPack.evidence.length ?? 0,
    memoryPatternCount: graph?.memoryPack.retrievedPatterns.length ?? 0,
    critiqueCount: graph?.critiques.length ?? 0,
    repairCount: graph?.repairs.length ?? 0,
    selectedCreativeIdeaId: selectedIdea?.ideaId ?? "missing",
    selectedCandidateLabel: selectedGraphCandidate?.label ?? "missing",
    promptPackId: pack?.promptPackId,
    durationProductionTimingRisk: durationContract?.timingRisk ?? "missing",
    audioScriptExternalTtsReady: audioScript.length > 0 && audioScript.every((line) => line.externalTtsReady === true),
    handoffAudioMode: String(handoff.request.settings.audioMode ?? "missing"),
    handoffHasPromptPack: handoff.request.userInput.includes("Seedance 2.0 prompt pack:")
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendShortAgentEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Short Agent v2 smoke proves no-spend graph intelligence and prompt-pack handoff only; paid render, artifact validation, and manual media review remain separate gates."
  },
  nextActions: [
    "Connect optional live research behind cost/quota policy instead of calling web tools from no-spend planning.",
    "Persist post-review outcome memory after the UI approval loop and render artifact review exist.",
    "Run a 30-45s paid validation only after formal review evidence and budget approval."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
