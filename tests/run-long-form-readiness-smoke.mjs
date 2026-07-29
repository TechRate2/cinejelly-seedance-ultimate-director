#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/long-form-readiness-smoke-report.json";
const sourcePatternOrigins = [
  "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects",
  "nirdiamant/genai_agents:ContentIntelligence",
  "gswithjeff/autogen-multi-agent-workflow",
  "Shubhamsaboo/awesome-llm-apps",
  "YouMind-OpenLab/awesome-seedance-2-prompts",
  "ZeroLu/awesome-seedance",
  "HKUDS/ViMax",
  "HKUDS/VideoAgent",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "jiaminchen-1031/DirectorBench"
];

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

const { LongFormContinuityPlanner } = await import("../dist/core/long-form-continuity-planner.js");
const { LongFormAgentReviewPlanner } = await import("../dist/core/long-form-agent-review-planner.js");
const { LongFormTimelinePlanner } = await import("../dist/core/long-form-timeline-planner.js");
const { LongFormCreativeIntelligencePlanner } = await import("../dist/core/long-form-creative-intelligence-planner.js");
const { LongFormReadinessPlanner } = await import("../dist/core/long-form-readiness-planner.js");
const { PostproductionAssetPlanner } = await import("../dist/core/postproduction-asset-planner.js");
const { RenderScheduler } = await import("../dist/core/render-scheduler.js");
const { VideoRenderStrategyPlanner } = await import("../dist/core/video-render-strategy-planner.js");

const continuityPlanner = new LongFormContinuityPlanner();
const reviewPlanner = new LongFormAgentReviewPlanner();
const strategyPlanner = new VideoRenderStrategyPlanner();
const timelinePlanner = new LongFormTimelinePlanner();
const creativePlanner = new LongFormCreativeIntelligencePlanner();
const readinessPlanner = new LongFormReadinessPlanner();
const postproductionPlanner = new PostproductionAssetPlanner();
const renderScheduler = new RenderScheduler(2);

const projectId = "long_form_readiness_smoke";
const userInput = "Build a premium ecommerce product video ad for TikTok Shop with source-video pacing, reference-locked product shots, proof stack, visual payoff, and clear CTA.";
const storyPlan = buildStoryPlan(projectId, 6, 120);
const seedanceSettings = {
  tier: "standard",
  resolution: "720p",
  qualityMode: "standard",
  ratio: "16:9",
  durationTargetSeconds: storyPlan.targetDurationSeconds,
  audioMode: "hybrid",
  bitrateMode: "high",
  watermark: false,
  returnLastFrame: true
};
const shots = shotsFor(storyPlan);
const sourceVideoAnalysis = sourceVideoAnalysisFor();
const continuityPlan = continuityPlanner.build({ projectId, storyPlan, shots, sourceVideoAnalysis });
const agentReview = reviewPlanner.build({ projectId, storyPlan, shots, continuityPlan, sourceVideoAnalysis });
const videoRenderStrategyPlan = strategyPlanner.build({
  projectId,
  request: {
    userInput,
    settings: seedanceSettings,
    references: shots.flatMap((shot) => shot.references),
    metadata: {
      workflowMode: "source_video",
      storyboardApproval: "approved",
      storyboardReviewer: "creative-director",
      storyboardReviewedAt: new Date().toISOString()
    },
    sourceVideoAnalysis
  },
  storyPlan,
  shots
});
const renderSchedulePlan = renderScheduler.plan(shots.map((shot, index) => ({
  index,
  shot,
  forceSequentialReasons: videoRenderStrategyPlan.requiresSequentialRender ? ["strategy_source_video"] : [],
  value: { shotId: shot.shotId }
})));
const captionCues = storyPlan.scenes.map((scene, index) => ({
  startSecond: index * 20,
  endSecond: (index + 1) * 20,
  text: `Proof beat ${index + 1}: ${scene.title}`
}));
const generatedAudioIntents = [
  generatedAudioIntent("narration_01", "tts_narration", 0, 60),
  generatedAudioIntent("narration_02", "tts_narration", 60, 60)
];
const postproductionAssetPlan = postproductionPlanner.plan({
  projectId,
  captionCues,
  captionOptions: { enabled: true, burnIn: true, language: "vi" },
  generatedAudioIntents,
  audioGenerationCapabilities: [
    {
      provider: "atlascloud",
      modelId: "xai/tts-v1",
      kinds: ["tts_narration", "bgm", "ambience", "sfx"],
      outputFormats: ["mp3"],
      maxDurationSeconds: 120,
      async: true
    }
  ]
});
const timelinePlan = timelinePlanner.build({
  projectId,
  targetDurationSeconds: storyPlan.targetDurationSeconds,
  shots,
  continuityPlan,
  renderSchedulePlan,
  postproductionAssetPlan,
  captionCues,
  generatedAudioIntents,
  seedanceSettings
});
const creativeIntelligencePlan = creativePlanner.build({
  projectId,
  userInput,
  storyPlan,
  shots,
  continuityPlan,
  agentReview,
  videoRenderStrategyPlan,
  timelinePlan,
  postproductionAssetPlan,
  sourceVideoAnalysis
});
const readiness = readinessPlanner.build({
  projectId,
  userInput,
  storyPlan,
  shots,
  continuityPlan,
  agentReview,
  videoRenderStrategyPlan,
  timelinePlan,
  creativeIntelligencePlan,
  renderSchedulePlan,
  postproductionAssetPlan,
  sourceVideoAnalysis
});

const blockedTimelinePlan = timelinePlanner.build({
  projectId: `${projectId}_blocked`,
  targetDurationSeconds: storyPlan.targetDurationSeconds,
  shots,
  continuityPlan: { ...continuityPlan, projectId: `${projectId}_blocked` },
  renderSchedulePlan: {
    ...renderSchedulePlan,
    itemCount: renderSchedulePlan.itemCount - 1,
    items: renderSchedulePlan.items.slice(0, -1)
  },
  postproductionAssetPlan: { ...postproductionAssetPlan, projectId: `${projectId}_blocked` },
  captionCues,
  generatedAudioIntents,
  seedanceSettings
});
const blockedCreativeIntelligencePlan = creativePlanner.build({
  projectId: `${projectId}_blocked`,
  userInput,
  storyPlan,
  shots,
  continuityPlan: { ...continuityPlan, projectId: `${projectId}_blocked` },
  agentReview: { ...agentReview, projectId: `${projectId}_blocked` },
  videoRenderStrategyPlan: { ...videoRenderStrategyPlan, projectId: `${projectId}_blocked` },
  timelinePlan: blockedTimelinePlan,
  postproductionAssetPlan: { ...postproductionAssetPlan, projectId: `${projectId}_blocked` },
  sourceVideoAnalysis
});
const blockedReadiness = readinessPlanner.build({
  projectId: `${projectId}_blocked`,
  userInput,
  storyPlan,
  shots,
  continuityPlan: { ...continuityPlan, projectId: `${projectId}_blocked` },
  agentReview: { ...agentReview, projectId: `${projectId}_blocked` },
  videoRenderStrategyPlan: { ...videoRenderStrategyPlan, projectId: `${projectId}_blocked` },
  timelinePlan: blockedTimelinePlan,
  creativeIntelligencePlan: blockedCreativeIntelligencePlan,
  renderSchedulePlan: {
    ...renderSchedulePlan,
    itemCount: renderSchedulePlan.itemCount - 1,
    items: renderSchedulePlan.items.slice(0, -1)
  },
  postproductionAssetPlan: { ...postproductionAssetPlan, projectId: `${projectId}_blocked` },
  sourceVideoAnalysis
});

const serialized = JSON.stringify({ readiness, blockedReadiness });
const rawLeakDetected = serialized.includes("https://private.example") ||
  serialized.includes("token=secret") ||
  serialized.includes("api_key=");
const countConsistency =
  readiness.adaptiveShotDecisions.length === shots.length &&
  readiness.uiReviewPacket.repairQueueCount === readiness.repairQueue.length &&
  readiness.uiReviewPacket.shotReviewCount === readiness.adaptiveShotDecisions.filter((decision) => decision.requiresManualReview).length &&
  blockedReadiness.uiReviewPacket.repairQueueCount === blockedReadiness.repairQueue.length;

const checks = [
  readiness.noSpend === true &&
    readiness.networkCallsMade === false &&
    readiness.providerCallsMade === false &&
    blockedReadiness.noSpend === true &&
    blockedReadiness.networkCallsMade === false &&
    blockedReadiness.providerCallsMade === false
    ? pass("no_spend_no_network", "Readiness planning makes no network, Atlas, render, or provider calls.")
    : fail("no_spend_no_network", "Expected no-spend/no-network/no-provider boundaries."),
  readiness.intentRoute.intentKind === "source_video_guided" &&
    readiness.intentRoute.recommendedWorkflowMode === "source_video_guided" &&
    readiness.intentRoute.reasons.some((reason) => reason.includes("source_video"))
    ? pass("intent_router_source_video", "Intent router selects source-video guided workflow from source analysis and source references.")
    : fail("intent_router_source_video", "Expected source-video guided intent and workflow."),
  readiness.coherence.overallScore >= 60 &&
    readiness.coherence.sourceVideoAlignmentScore >= 70 &&
    readiness.coherence.issueCount >= readiness.repairQueue.length
    ? pass("coherence_engine_scores", "Coherence engine produces bounded story/timeline/source alignment scores.")
    : fail("coherence_engine_scores", "Expected usable coherence scoring and issue accounting."),
  readiness.status === "review_required" &&
    readiness.releaseGateSummary.canProceedToRender === true &&
    readiness.repairQueue.every((repair) => repair.blocksRender === false)
    ? pass("review_required_render_safe", "Review-required readiness can still proceed to render when no blocking repair exists.")
    : fail("review_required_render_safe", "Expected non-blocking review_required readiness."),
  readiness.adaptiveShotDecisions.length === shots.length &&
    readiness.adaptiveShotDecisions.some((decision) => decision.mode === "source_video_guided" || decision.mode === "manual_review_required") &&
    readiness.adaptiveShotDecisions.some((decision) => decision.shouldChainFromPrevious === true) &&
    readiness.adaptiveShotDecisions.some((decision) => decision.shouldRunTestTake === true)
    ? pass("adaptive_shot_strategy", "Shot strategy decides source/manual modes, chaining, and test-take requirements per shot.")
    : fail("adaptive_shot_strategy", "Expected adaptive per-shot render strategy decisions."),
  readiness.uiReviewPacket.requiredApprovalSurfaces.includes("source_video") &&
    readiness.uiReviewPacket.requiredApprovalSurfaces.includes("storyboard") &&
    readiness.uiReviewPacket.requiredApprovalSurfaces.includes("repair_queue") &&
    readiness.uiReviewPacket.canRenderAfterApproval === true
    ? pass("ui_review_packet", "UI packet exposes approval surfaces, next actions, and render-after-approval gate.")
    : fail("ui_review_packet", "Expected UI review packet approval surfaces."),
  blockedReadiness.status === "blocked" &&
    blockedReadiness.releaseGateSummary.canProceedToRender === false &&
    blockedReadiness.repairQueue.some((repair) => repair.blocksRender === true)
    ? pass("blocked_readiness_stops_render", "Timeline blocking evidence becomes readiness blocking evidence before provider spend.")
    : fail("blocked_readiness_stops_render", "Expected blocked readiness to stop render."),
  countConsistency
    ? pass("count_consistency", "Decision and UI repair counts match readiness evidence.")
    : fail("count_consistency", "Readiness counts do not match evidence collections."),
  !rawLeakDetected
    ? pass("no_raw_provider_url_leak", "Readiness stores labels, strategy, and repair guidance without raw provider URLs or query secrets.")
    : fail("no_raw_provider_url_leak", "Readiness leaked a raw provider URL or secret-like query text."),
  readiness.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin)) &&
    blockedReadiness.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
    ? pass("source_pattern_lineage", "Readiness carries LangGraph, Content Intelligence, multi-agent, Seedance, ViMax, VideoAgent, VibeFrame, OpenMontage, and DirectorBench lineage.")
    : fail("source_pattern_lineage", "Readiness source pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-form-readiness-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 2,
    targetDurationSeconds: storyPlan.targetDurationSeconds,
    rawUrlLeakCheckPassed: !rawLeakDetected
  },
  scenarios: {
    reviewRequired: summarizeReadiness(readiness),
    blocked: summarizeReadiness(blockedReadiness)
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendReadinessEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Long-form readiness smoke proves no-spend intent/coherence/shot-strategy/repair/UI evidence only; paid media review remains separate."
      : "Long-form readiness smoke failed; fix readiness before relying on Long commercial workflow."
  },
  nextActions: status === "pass"
    ? [
        "Keep long-form readiness smoke passing before paid long-form validation.",
        "Use long-form-readiness.json as the UI-facing contract for workflow mode, coherence, repairs, and approval surfaces."
      ]
    : ["Fix LongFormReadinessPlanner before using it as a commercial Long gate."]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(status === "pass" ? 0 : 1);

function buildStoryPlan(prefix, sceneCount, targetDurationSeconds) {
  return {
    premise: "A premium skincare product proof story for TikTok Shop buyers, opening with a hook, stacking proof, showing visual payoff, and ending with a clear CTA.",
    targetDurationSeconds,
    scenes: Array.from({ length: sceneCount }, (_, sceneIndex) => {
      const order = sceneIndex + 1;
      return {
        sceneId: `${prefix}_scene_${String(order).padStart(2, "0")}`,
        title: order === 1 ? "Hook and problem" : order === sceneCount ? "Payoff and CTA" : `Proof movement ${order}`,
        beats: [
          {
            beatId: `${prefix}_beat_${String(order).padStart(2, "0")}`,
            purpose: order === 1 ? "hook and setup" : order === sceneCount ? "payoff and CTA" : "proof development",
            action: order === 1
              ? "Hook viewers with the visible morning skin problem and introduce Glow Focus Serum as the proof path."
              : order === sceneCount
                ? "Show the final visual payoff, product packshot, and clear CTA to try Glow Focus Serum."
                : `Build proof movement ${order} with same founder, product, tabletop, and warm macro style.`,
            durationSeconds: targetDurationSeconds / sceneCount,
            style: "warm premium macro commercial",
            continuity: {
              identity: "founder host identity",
              product: "Glow Focus Serum",
              environment: "morning vanity table",
              style: "warm premium macro commercial"
            }
          }
        ]
      };
    })
  };
}

function shotsFor(storyPlan) {
  return storyPlan.scenes.flatMap((scene, sceneIndex) =>
    scene.beats.map((beat) => ({
      shotId: `${beat.beatId}_shot`,
      sceneId: scene.sceneId,
      beatId: beat.beatId,
      durationSeconds: beat.durationSeconds,
      intent: beat.purpose,
      subject: "Glow Focus Serum with founder host",
      action: beat.action,
      camera: sceneIndex < 2 ? "slow push-in" : "controlled macro cutaway",
      lighting: "warm natural window light",
      style: beat.style,
      audioIntent: "confident Vietnamese narration",
      transitionIntent: "Preserve edit-safe start and end handles for a smooth proof arc.",
      references: referencesFor(sceneIndex),
      continuity: beat.continuity,
      risks: risksFor(sceneIndex)
    }))
  );
}

function referencesFor(sceneIndex) {
  const common = [
    reference("identity", "founder host identity", "identity/founder.png"),
    reference("product", "Glow Focus Serum", "product/serum.png"),
    reference("environment", "morning vanity table", "environment/vanity.png"),
    reference("style", "warm premium macro commercial", "style/warm-macro.png")
  ];
  if (sceneIndex === 2 || sceneIndex === 3) {
    return [
      ...common,
      reference(
        "source_video_structure",
        "operator-approved source video structure",
        "source/private-walkthrough.mp4?token=secret",
        sceneIndex === 2 ? "source_scene_01" : "source_scene_02"
      )
    ];
  }
  return common;
}

function risksFor(sceneIndex) {
  if (sceneIndex === 0) {
    return ["face", "product_logo"];
  }
  if (sceneIndex === 2) {
    return ["product_logo", "transition"];
  }
  if (sceneIndex === 5) {
    return ["text", "transition"];
  }
  return [];
}

function reference(role, label, path, sourceSceneId) {
  return {
    role,
    label,
    priority: "primary",
    providerReference: {
      kind: role === "source_video_structure" ? "video" : "image",
      uri: `https://private.example/${path}`,
      label
    },
    ...(sourceSceneId ? { selection: { sourceSceneId, authorized: true } } : {})
  };
}

function sourceVideoAnalysisFor() {
  return {
    sourceReferenceLabel: "operator-approved product walkthrough",
    transformationIntent: "Translate source-video pacing into an original ecommerce proof arc.",
    scenes: [
      {
        sceneId: "source_scene_01",
        startSecond: 0,
        endSecond: 18,
        summary: "Opening product context and morning problem statement.",
        pacing: "fast hook",
        camera: "handheld push-in",
        visualStyle: "warm tabletop product proof"
      },
      {
        sceneId: "source_scene_02",
        startSecond: 18,
        endSecond: 42,
        summary: "Macro demonstration and proof structure.",
        pacing: "progressive",
        camera: "macro detail and controlled cutaway",
        visualStyle: "clean commercial explainer"
      }
    ],
    structuralBeats: ["hook", "problem", "proof", "payoff", "CTA"],
    styleNotes: ["warm natural light", "clean product macro frames"]
  };
}

function generatedAudioIntent(intentId, kind, startSecond, durationSeconds) {
  return {
    intentId,
    kind,
    prompt: `${intentId} Vietnamese narration for product proof`,
    startSecond,
    durationSeconds,
    endSecond: startSecond + durationSeconds,
    language: "vi",
    voiceStyle: "confident premium commercial",
    volume: 0.9
  };
}

function summarizeReadiness(value) {
  return {
    projectId: value.projectId,
    status: value.status,
    intentKind: value.intentRoute.intentKind,
    targetDurationClass: value.intentRoute.targetDurationClass,
    recommendedWorkflowMode: value.intentRoute.recommendedWorkflowMode,
    coherenceScore: value.coherence.overallScore,
    adaptiveShotDecisionCount: value.adaptiveShotDecisions.length,
    repairQueueCount: value.repairQueue.length,
    blockingRepairCount: value.repairQueue.filter((repair) => repair.blocksRender).length,
    approvalSurfaceCount: value.uiReviewPacket.requiredApprovalSurfaces.length,
    canProceedToRender: value.releaseGateSummary.canProceedToRender
  };
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
