#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/long-form-creative-intelligence-smoke-report.json";
const sourcePatternOrigins = [
  "HKUDS/ViMax",
  "HKUDS/VideoAgent",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "jiaminchen-1031/DirectorBench",
  "harry0703/MoneyPrinterTurbo",
  "YouMind-OpenLab/awesome-seedance-2-prompts"
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
const { buildLongDirectorUiContract } = await import("../dist/core/long-director-ui-contract.js");
const { PostproductionAssetPlanner } = await import("../dist/core/postproduction-asset-planner.js");
const { RenderScheduler } = await import("../dist/core/render-scheduler.js");
const { VideoRenderStrategyPlanner } = await import("../dist/core/video-render-strategy-planner.js");

const continuityPlanner = new LongFormContinuityPlanner();
const reviewPlanner = new LongFormAgentReviewPlanner();
const strategyPlanner = new VideoRenderStrategyPlanner();
const timelinePlanner = new LongFormTimelinePlanner();
const creativePlanner = new LongFormCreativeIntelligencePlanner();
const postproductionPlanner = new PostproductionAssetPlanner();
const renderScheduler = new RenderScheduler(2);

const projectId = "long_form_creative_intelligence_smoke";
const userInput = "Build a premium ecommerce product video ad for skincare buyers on TikTok Shop with a strong hook, proof stack, visual payoff, and clear CTA.";
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
      workflowMode: "storyboard",
      storyboardApproval: "approved",
      storyboardReviewer: "creative-director",
      storyboardReviewedAt: new Date().toISOString()
    },
    sourceVideoAnalysis
  },
  storyPlan,
  shots
});
const renderSchedulePlan = renderScheduler.plan(shots.map((shot, index) => ({ index, shot, value: { shotId: shot.shotId } })));
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
const creative = creativePlanner.build({
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
const longDirectorUiContract = buildLongDirectorUiContract(creative);

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
const blockedCreative = creativePlanner.build({
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
const blockedLongDirectorUiContract = buildLongDirectorUiContract(blockedCreative);
const apiPort = 26_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(apiPort);
process.env.CINEJELLY_DISABLE_API_AUTH = "true";
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
const { startServer } = await import("../dist/api/server.js");
const apiServer = startServer(apiPort);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
let apiContract;
let blockedApiContract;
let invalidApiContract;
try {
  await waitForHealth(apiBaseUrl);
  apiContract = await postJson(`${apiBaseUrl}/v1/long-form/director-ui-contract`, {
    longFormCreativeIntelligencePlan: creative
  });
  blockedApiContract = await postJson(`${apiBaseUrl}/v1/long-form/director-ui-contract`, {
    longFormCreativeIntelligencePlan: blockedCreative
  });
  invalidApiContract = await postJson(`${apiBaseUrl}/v1/long-form/director-ui-contract`, {
    longFormCreativeIntelligencePlan: {
      ...creative,
      noSpend: false
    }
  });
} finally {
  await new Promise((resolveClose) => apiServer.close(resolveClose));
}

const serialized = JSON.stringify({ creative, blockedCreative, longDirectorUiContract, blockedLongDirectorUiContract, apiContract, blockedApiContract });
const rawLeakDetected = serialized.includes("https://private.example") ||
  serialized.includes("token=secret") ||
  serialized.includes("api_key=");
const privateSourcePatternLineageLeakDetected = await containsPrivateSourcePatternTextForSmoke(JSON.stringify({
  longDirectorUiContract,
  blockedLongDirectorUiContract,
  apiUiContract: apiContract.body.uiContract,
  blockedApiUiContract: blockedApiContract.body.uiContract
}));
const directiveCountsConsistent =
  creative.findingCount === creative.findings.length &&
  creative.shotDirectiveCount === creative.shotDirectives.length &&
  creative.candidateDirectiveCount === creative.candidateDirectives.length &&
  creative.repairDirectiveCount === creative.repairDirectives.length;
const blockedCountsConsistent =
  blockedCreative.findingCount === blockedCreative.findings.length &&
  blockedCreative.blockingFindingCount === blockedCreative.findings.filter((finding) => finding.severity === "block").length &&
  blockedCreative.reviewRequiredFindingCount === blockedCreative.findings.filter((finding) => finding.severity === "warn").length;
const audienceNiche = creative.nicheStrategy.audienceNicheIntelligence;
const selectedIdeaCandidate = creative.ideaCandidates.find((candidate) => candidate.selectedForRender);
const blockedSelectedIdeaCandidate = blockedCreative.ideaCandidates.find((candidate) => candidate.selectedForRender);
const ideaCandidateSources = new Set(creative.ideaCandidates.map((candidate) => candidate.source));
const ideaCandidatesReady =
  creative.ideaCandidateCount === creative.ideaCandidates.length &&
  blockedCreative.ideaCandidateCount === blockedCreative.ideaCandidates.length &&
  Boolean(selectedIdeaCandidate) &&
  Boolean(blockedSelectedIdeaCandidate) &&
  creative.selectedIdeaCandidateId === selectedIdeaCandidate?.ideaId &&
  blockedCreative.selectedIdeaCandidateId === blockedSelectedIdeaCandidate?.ideaId &&
  ideaCandidateSources.has("audience_niche") &&
  ideaCandidateSources.has("story_bible") &&
  ideaCandidateSources.has("timeline_production_contract") &&
  ideaCandidateSources.has("source_video_structure") &&
  ideaCandidateSources.has("director_repair") &&
  creative.ideaCandidates.every((candidate) =>
    candidate.score.totalScore >= 0 &&
    candidate.score.totalScore <= 100 &&
    candidate.sequenceArc.length > 0 &&
    candidate.openingHook.length > 0 &&
    candidate.proofPlan.length > 0 &&
    candidate.audioNarrationPlan.length > 0 &&
    (candidate.source !== "source_video_structure" || candidate.sourceVideoAdaptationRule.includes("Replace"))
  );

const checks = [
  creative.noSpend === true &&
    creative.networkCallsMade === false &&
    creative.providerCallsMade === false &&
    blockedCreative.noSpend === true &&
    blockedCreative.networkCallsMade === false &&
    blockedCreative.providerCallsMade === false
    ? pass("no_spend_no_network", "Creative intelligence planning makes no network, Atlas, render, or provider calls.")
    : fail("no_spend_no_network", "Expected no-spend/no-network/no-provider boundaries."),
  creative.nicheStrategy.niche === "ecommerce_product_video" &&
    creative.nicheStrategy.viralLevers.includes("fast_hook") &&
    creative.nicheStrategy.viralLevers.includes("proof_stack") &&
    creative.nicheStrategy.viralLevers.includes("source_style_match")
    ? pass("niche_and_viral_strategy", "Creative intelligence derives niche, platform, retention, viral, and source-style strategy.")
    : fail("niche_and_viral_strategy", "Expected ecommerce/TikTok/source-style creative strategy."),
  audienceNiche?.schemaVersion === "cinejelly.audience-niche-intelligence.v1" &&
    audienceNiche.noSpend === true &&
    audienceNiche.networkCallsMade === false &&
    audienceNiche.providerCallsMade === false &&
    audienceNiche.trendPosture === "trend_native" &&
    audienceNiche.ideaSeeds.length >= 4 &&
    creative.nicheStrategy.trendPosture === audienceNiche.trendPosture &&
    longDirectorUiContract.creative.trendPosture === creative.nicheStrategy.trendPosture &&
    longDirectorUiContract.creative.ideaSeedCount === audienceNiche.ideaSeeds.length
    ? pass("shared_audience_niche_intelligence", "Long creative intelligence and UI contract carry shared user-intent, niche, trend, proof, objection, and idea-seed strategy.")
    : fail("shared_audience_niche_intelligence", "Expected shared audience/niche intelligence to be present in Long creative and UI contract evidence."),
  ideaCandidatesReady &&
    longDirectorUiContract.creative.ideaCandidateCount === creative.ideaCandidateCount &&
    longDirectorUiContract.creative.selectedIdeaCandidateId === creative.selectedIdeaCandidateId &&
    creative.ideaCandidateCount >= audienceNiche.ideaSeeds.length
    ? pass("long_form_idea_candidate_engine", "Long creative intelligence now emits selected, scored idea candidates from audience, story bible, source-video, timeline, and repair signals.")
    : fail("long_form_idea_candidate_engine", "Expected selected/scored long-form idea candidates with diversified evidence sources."),
  creative.storyBible.characterAnchors.length > 0 &&
    creative.storyBible.productAnchors.length > 0 &&
    creative.storyBible.environmentAnchors.length > 0 &&
    creative.storyBible.styleAnchors.length > 0 &&
    creative.storyBible.emotionalArc.length === continuityPlan.sequenceCount
    ? pass("story_bible_anchor_coverage", "Story bible carries character/product/environment/style anchors and sequence emotional arc.")
    : fail("story_bible_anchor_coverage", "Story bible anchors or emotional arc are incomplete."),
  creative.directorPlan?.schemaVersion === "cinejelly.long-director.v1" &&
    creative.directorPlan.storyPlan.sequencePurposeRequired === true &&
    creative.directorPlan.continuityPlan.bridgeEverySequence === true &&
    creative.directorPlan.repairPlan.rerenderOnlyAffectedShots === true &&
    creative.directorPlan.checkpointPolicy.pauseBeforeProviderSpend === true
    ? pass("long_director_plan_integrated", "Long Director V2 emits story/continuity/checkpoint/narrow-repair policy inside creative intelligence.")
    : fail("long_director_plan_integrated", "Expected Long Director V2 plan evidence inside creative intelligence."),
  longDirectorUiContract.schemaVersion === "cinejelly.long-director-ui-contract.v1" &&
    longDirectorUiContract.noSpend === true &&
    longDirectorUiContract.director.directorId === creative.directorPlan.directorId &&
    longDirectorUiContract.director.pauseBeforeProviderSpend === true &&
    longDirectorUiContract.director.pauseBeforeCustomerRelease === true &&
    longDirectorUiContract.duration.sequenceCount === continuityPlan.sequenceCount &&
    longDirectorUiContract.outputContract.canSubmitToProviderNow === false &&
    longDirectorUiContract.outputContract.longFormManualQualityReviewRequired === true &&
    longDirectorUiContract.outputContract.benchmarkEvidenceRequired === true
    ? pass("long_director_ui_contract_available", "Long Director UI contract exposes story, continuity, candidate, repair, and manual-review gates.")
    : fail("long_director_ui_contract_available", "Expected Long Director UI contract to expose no-spend review-console gates."),
  creative.status === "review_required" &&
    creative.releaseGateSummary.canProceedToRender === true &&
    creative.qualityScore > 0 &&
    creative.findings.some((finding) => finding.code === "shot_duration_risk")
    ? pass("review_required_without_provider_block", "Creative quality warnings create repair directives without blocking safe render scheduling.")
    : fail("review_required_without_provider_block", "Expected shot-duration review warning without provider block."),
  creative.shotDirectives.length === shots.length &&
    creative.candidateDirectives.length > 0 &&
    creative.candidateDirectives.some((directive) => directive.candidateCount >= 3)
    ? pass("shot_candidate_directives", "Creative intelligence emits shot-level quality and multi-candidate directives.")
    : fail("shot_candidate_directives", "Expected candidate directives for hook/payoff/risky shots."),
  creative.audioCaptionQuality.captionCoverageRatio >= 0.95 &&
    creative.audioCaptionQuality.generatedAudioIntentCount === generatedAudioIntents.length
    ? pass("audio_caption_quality", "Caption and generated-audio timing quality are summarized for review/export.")
    : fail("audio_caption_quality", "Expected caption/audio quality coverage."),
  blockedCreative.status === "blocked" &&
    blockedCreative.releaseGateSummary.canProceedToRender === false &&
    blockedCreative.findings.some((finding) => finding.code === "timeline_blocked") &&
    blockedLongDirectorUiContract.outputContract.canProceedToRenderAfterApproval === false
    ? pass("blocked_timeline_stops_render", "Timeline blocking evidence is promoted into creative intelligence before provider spend.")
    : fail("blocked_timeline_stops_render", "Expected blocked creative intelligence when timeline is blocked."),
  apiContract.statusCode === 200 &&
    apiContract.body.uiContract?.schemaVersion === "cinejelly.long-director-ui-contract.v1" &&
    apiContract.body.uiContract?.projectId === creative.projectId &&
    apiContract.body.uiContract?.director?.directorId === creative.directorPlan.directorId &&
    apiContract.body.uiContract?.outputContract?.canSubmitToProviderNow === false &&
    apiContract.body.releaseGateSummary?.canUseAsNoSpendLongDirectorUiContractEvidence === true
    ? pass("long_director_ui_contract_api_ready", "API returns a no-spend Long Director UI contract from creative intelligence evidence.")
    : fail("long_director_ui_contract_api_ready", "Expected API to return a Long Director UI contract for review-required creative evidence."),
  blockedApiContract.statusCode === 422 &&
    blockedApiContract.body.uiContract?.status === "blocked" &&
    blockedApiContract.body.uiContract?.outputContract?.canProceedToRenderAfterApproval === false &&
    blockedApiContract.body.uiContract?.releaseGateSummary?.readyForLongReviewUiIntegration === false
    ? pass("long_director_ui_contract_api_blocks_blocked_plan", "API preserves blocked Long Director evidence and returns 422 without provider spend.")
    : fail("long_director_ui_contract_api_blocks_blocked_plan", "Expected API to return 422 with blocked UI evidence."),
  invalidApiContract.statusCode === 400 &&
    String(invalidApiContract.body.error ?? "").includes("no-spend/no-network/no-provider")
    ? pass("long_director_ui_contract_api_rejects_spend_boundary_drift", "API rejects creative evidence that violates no-spend/no-network/no-provider boundaries.")
    : fail("long_director_ui_contract_api_rejects_spend_boundary_drift", "Expected API to reject spend-boundary drift before building a UI contract."),
  directiveCountsConsistent && blockedCountsConsistent
    ? pass("count_consistency", "Finding/directive counts match collection evidence.")
    : fail("count_consistency", "Finding/directive counts do not match collection evidence."),
  !rawLeakDetected
    ? pass("no_raw_provider_url_leak", "Creative intelligence evidence stores labels and strategy without raw provider URLs or query secrets.")
    : fail("no_raw_provider_url_leak", "Creative intelligence evidence leaked a raw provider URL or secret-like query text."),
  !privateSourcePatternLineageLeakDetected
    ? pass("long_director_ui_hides_private_source_pattern_lineage", "Long Director UI contracts do not expose private source-pattern repo, platform, or upstream workflow labels.")
    : fail("long_director_ui_hides_private_source_pattern_lineage", "Expected Long Director UI contracts to hide private source-pattern lineage."),
  creative.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin)) &&
    blockedCreative.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
    ? pass("source_pattern_lineage", "Creative intelligence carries ViMax, VideoAgent, VibeFrame, OpenMontage, DirectorBench, MoneyPrinterTurbo, and Seedance prompt-pattern lineage.")
    : fail("source_pattern_lineage", "Creative intelligence source pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-form-creative-intelligence-smoke.v1",
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
    reviewRequired: summarizeCreative(creative, longDirectorUiContract),
    blocked: summarizeCreative(blockedCreative, blockedLongDirectorUiContract)
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendCreativeIntelligenceEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Long-form creative intelligence smoke proves no-spend story/niche/viral/quality/repair/candidate evidence only; paid media review remains a separate gate."
      : "Long-form creative intelligence smoke failed; fix the director-quality layer before relying on it in Long."
  },
  nextActions: status === "pass"
    ? [
        "Keep creative intelligence smoke passing before paid long-form validation.",
        "Use long-form-creative-intelligence.json for rich director-quality evidence and long-director-ui-contract.json as the stable review-console contract."
      ]
    : ["Fix LongFormCreativeIntelligencePlanner before using it as Long director-quality evidence."]
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

function summarizeCreative(value, uiContract) {
  return {
    projectId: value.projectId,
    status: value.status,
    qualityScore: value.qualityScore,
    longDirectorUiContractReady: uiContract.releaseGateSummary.readyForLongReviewUiIntegration,
    directorNarrativeMode: uiContract.director.narrativeMode,
    directorCheckpointStageCount: uiContract.director.checkpointStages.length,
    manualQualityReviewRequired: uiContract.outputContract.longFormManualQualityReviewRequired,
    directorBenchEvidenceRequired: uiContract.outputContract.benchmarkEvidenceRequired,
    canSubmitToProviderNow: uiContract.outputContract.canSubmitToProviderNow,
    repairQueueCount: uiContract.outputContract.repairQueueCount,
    niche: value.nicheStrategy.niche,
    platformIntent: value.nicheStrategy.platformIntent,
    trendPosture: value.nicheStrategy.trendPosture,
    viewerObjection: value.nicheStrategy.viewerObjection,
    ideaSeedCount: value.nicheStrategy.audienceNicheIntelligence.ideaSeeds.length,
    ideaCandidateCount: value.ideaCandidateCount,
    selectedIdeaCandidateIdPresent: Boolean(value.selectedIdeaCandidateId),
    selectedIdeaCandidateScore: value.ideaCandidates.find((candidate) => candidate.ideaId === value.selectedIdeaCandidateId)?.score.totalScore ?? 0,
    findingCount: value.findingCount,
    blockingFindingCount: value.blockingFindingCount,
    reviewRequiredFindingCount: value.reviewRequiredFindingCount,
    shotDirectiveCount: value.shotDirectiveCount,
    candidateDirectiveCount: value.candidateDirectiveCount,
    repairDirectiveCount: value.repairDirectiveCount,
    canProceedToRender: value.releaseGateSummary.canProceedToRender
  };
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be binding the random local port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Timed out waiting for local API health endpoint.");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

const PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS = [
  "Topview",
  "Higgsfield",
  "OpenMontage",
  "VideoAgent",
  "ViMax",
  "vibeframe",
  "YouMind-OpenLab",
  "ZeroLu",
  "Emily2040",
  "higgsfield-ai",
  "OSideMedia",
  "calesthio/",
  "HKUDS/",
  "video-db/",
  "vericontext/",
  "harry0703/",
  "MoneyPrinterTurbo",
  "moneyprinterturbo",
  "jiaminchen-1031/",
  "DirectorBench",
  "directorbench",
  "nirdiamant/",
  "gswithjeff/",
  "Shubhamsaboo/",
  "hereandnowai/",
  "Anil-matcha/"
];

async function containsPrivateSourcePatternTextForSmoke(value) {
  try {
    const registry = await import("../dist/core/private-source-pattern-registry.js");
    if (typeof registry.containsPrivateSourcePatternText === "function") {
      return registry.containsPrivateSourcePatternText(value);
    }
  } catch {
    // A clean checkout may run this script before build output exists.
  }
  const lowered = value.toLowerCase();
  return PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS.some((fragment) =>
    lowered.includes(fragment.toLowerCase())
  );
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
