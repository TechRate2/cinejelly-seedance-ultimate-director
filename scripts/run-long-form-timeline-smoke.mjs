#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/long-form-timeline-smoke-report.json";
const sourcePatternOrigins = ["HKUDS/ViMax", "HKUDS/VideoAgent", "vericontext/vibeframe", "harry0703/MoneyPrinterTurbo"];

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
const { LongFormTimelinePlanner } = await import("../dist/core/long-form-timeline-planner.js");
const { PostproductionAssetPlanner } = await import("../dist/core/postproduction-asset-planner.js");
const { RenderScheduler } = await import("../dist/core/render-scheduler.js");
const { ShotPlanner } = await import("../dist/core/shot-planner.js");
const { SeedancePromptCompiler } = await import("../dist/prompt_compiler/prompt-compiler.js");

const continuityPlanner = new LongFormContinuityPlanner();
const timelinePlanner = new LongFormTimelinePlanner();
const postproductionPlanner = new PostproductionAssetPlanner();
const renderScheduler = new RenderScheduler(2);

const projectId = "long_form_timeline_smoke";
const storyPlan = buildStoryPlan(projectId);
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
const shots = new ShotPlanner().plan({
  projectId,
  scenes: storyPlan.scenes,
  settings: seedanceSettings,
  metadata: {
    longFormSource: "long_form_timeline_smoke"
  }
});
const compiledLongPrompts = shots.map((shot) =>
  new SeedancePromptCompiler().compile({
    shot,
    settings: seedanceSettings,
    modelId: "bytedance/seedance-2.0-standard/reference-to-video",
    provider: "atlascloud"
  })
);
const continuityPlan = continuityPlanner.build({
  projectId,
  storyPlan,
  shots,
  sourceVideoAnalysis: sourceVideoAnalysis()
});
const renderSchedulePlan = renderScheduler.plan(shots.map((shot, index) => ({ index, shot, value: { shotId: shot.shotId } })));
const captionCues = storyPlan.scenes.map((scene, index) => ({
  startSecond: index * 20,
  endSecond: (index + 1) * 20,
  text: `Caption proof beat ${index + 1}`
}));
const generatedAudioIntents = [
  generatedAudioIntent("narration_01", "tts_narration", 0, 60),
  generatedAudioIntent("narration_02", "tts_narration", 60, 60),
  generatedAudioIntent("ambience_01", "ambience", 20, 80)
];
const postproductionAssetPlan = postproductionPlanner.plan({
  projectId,
  captionCues,
  captionOptions: { enabled: true, burnIn: false, language: "vi" },
  audioTracks: [
    {
      trackId: "licensed_bgm",
      sourceUrlOrPath: "asset://licensed/bgm/warm-proof-bed",
      role: "music",
      volume: 0.38
    }
  ],
  audioMixOptions: {
    enabled: true,
    mode: "mix",
    originalVolume: 0.8,
    outputBitrate: "192k"
  },
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
const timeline = timelinePlanner.build({
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

const blockedTimeline = timelinePlanner.build({
  projectId: `${projectId}_blocked`,
  targetDurationSeconds: storyPlan.targetDurationSeconds,
  shots,
  continuityPlan: {
    ...continuityPlan,
    projectId: `${projectId}_blocked`
  },
  renderSchedulePlan: {
    ...renderSchedulePlan,
    itemCount: renderSchedulePlan.itemCount - 1,
    items: renderSchedulePlan.items.slice(0, -1)
  },
  postproductionAssetPlan: {
    ...postproductionAssetPlan,
    projectId: `${projectId}_blocked`
  },
  captionCues,
  generatedAudioIntents,
  seedanceSettings
});

const serialized = JSON.stringify({ timeline, blockedTimeline });
const rawUrlLeakDetected = serialized.includes("https://private.example") ||
  serialized.includes("token=secret") ||
  serialized.includes("api_key=");
const sequenceSegmentCount = timeline.sequences.reduce((sum, sequence) => sum + sequence.segmentIds.length, 0);
const captionCoveredEnough = timeline.postproduction.captionCoveredSeconds >= 110;
const generatedIntentMapped = timeline.segments.some((segment) => segment.audioCoverage.generatedIntentIds.includes("narration_01")) &&
  timeline.segments.some((segment) => segment.audioCoverage.generatedIntentIds.includes("narration_02")) &&
  timeline.segments.some((segment) => segment.audioCoverage.generatedIntentIds.includes("ambience_01"));
const sequentialSegments = timeline.segments.filter((segment) => segment.renderMode === "sequential");
const storyArcRoles = new Set(timeline.segments.map((segment) => segment.storyArcRole));
const storyArcPositions = new Set(timeline.segments.map((segment) => segment.storyArcPosition));
const productionContractsReady = timeline.segments.every((segment) =>
  segment.productionContract &&
  segment.productionContract.timingGoal.includes(`${segment.startSecond}-${segment.endSecond}s`) &&
  segment.productionContract.requiredVisualChange.length > 20 &&
  segment.productionContract.voiceoverLine.split(/\s+/).filter(Boolean).length <= Math.max(3, Math.floor(segment.durationSeconds * 2.8)) &&
  segment.productionContract.nativeAudioPrompt.includes("Do not copy protected songs") &&
  segment.productionContract.endpointJob.includes("stable") &&
  segment.productionContract.providerSettingSummary.includes("bitrate=high") &&
  segment.productionContract.providerSettingSummary.includes(`audioScriptLine=${segment.audioScriptLineId}`)
);
const audioScriptReady = timeline.audioScriptLineCount === timeline.segmentCount &&
  timeline.audioScript.length === timeline.segmentCount &&
  timeline.audioScript.every((line) => {
    const segment = timeline.segments.find((item) => item.audioScriptLineId === line.lineId);
    return segment &&
      line.shotId === segment.shotId &&
      line.startSecond === segment.startSecond &&
      line.endSecond === segment.endSecond &&
      (line.language === "vi" || line.language === "auto") &&
      line.wordBudget >= line.spokenLine.split(/\s+/).filter(Boolean).length &&
      line.visualSync === segment.productionContract.requiredVisualChange;
  });
const providerSettingPolicyReady = timeline.providerSettingPolicy.resolution === "720p" &&
  timeline.providerSettingPolicy.bitrateMode === "high" &&
  timeline.providerSettingPolicy.audioMode === "hybrid" &&
  timeline.providerSettingPolicy.nativeProviderAudioEnabled === true &&
  timeline.providerSettingPolicy.externalAudioScriptEnabled === true &&
  timeline.providerSettingPolicy.returnLastFrame === true &&
  timeline.providerSettingPolicy.lastFrameChainingPreferred === true;
const compiledPromptStoryArcReady = compiledLongPrompts.every((prompt) =>
  // Compacted prompt anatomy (live-render forensics): Pacing/Boundary-choreography merged into the
  // single Runtime + Boundary contracts.
  prompt.prompt.includes("Runtime contract:") &&
  prompt.prompt.includes("Story arc:") &&
  prompt.prompt.includes("Timeline:") &&
    prompt.prompt.includes("Boundary: this clip must cut together with adjacent clips as one continuous film.") &&
    prompt.prompt.includes("do not rely on postproduction crossfade to hide mismatched endpoints")
);
const compiledPromptProviderSettingsReady = compiledLongPrompts.every((prompt) =>
  prompt.videoRequest.settings.resolution === "720p" &&
  prompt.videoRequest.settings.bitrateMode === "high" &&
  prompt.videoRequest.settings.generateAudio === true &&
  prompt.videoRequest.settings.returnLastFrame === true
);
const sourceVideoCompiledPrompts = compiledLongPrompts.filter((prompt) =>
  prompt.bindingPlan.sortedReferences.some((reference) => reference.role === "source_video_structure")
);
const sourceVideoNegativePromptReady = sourceVideoCompiledPrompts.length > 0 &&
  sourceVideoCompiledPrompts.every((prompt) =>
    prompt.negativePrompt.includes("no copied source-video face identity") &&
    prompt.negativePrompt.includes("no copied source-video transcript") &&
    prompt.negativePrompt.includes("no copied source-video music or melody") &&
    prompt.negativePrompt.includes("no source-video watermark, caption style, logo, or brand marks")
  );

const checks = [
  timeline.noSpend === true &&
    timeline.networkCallsMade === false &&
    timeline.providerCallsMade === false &&
    blockedTimeline.noSpend === true &&
    blockedTimeline.networkCallsMade === false &&
    blockedTimeline.providerCallsMade === false
    ? pass("no_spend_no_network", "Timeline planning makes no network, Atlas, render, or provider calls.")
    : fail("no_spend_no_network", "Expected no-spend/no-network/no-provider boundaries."),
  timeline.segmentCount === shots.length &&
    timeline.shotCount === shots.length &&
    sequenceSegmentCount === shots.length &&
    timeline.plannedDurationSeconds === storyPlan.targetDurationSeconds
    ? pass("segment_and_duration_coverage", "Timeline covers every shot and matches the requested 120 second duration.")
    : fail("segment_and_duration_coverage", "Timeline segment or duration coverage is incomplete."),
  storyArcRoles.has("hook") &&
    storyArcRoles.has("payoff") &&
    [...storyArcRoles].some((role) => role === "proof" || role === "development" || role === "turning_point") &&
    storyArcPositions.has("opening") &&
    storyArcPositions.has("middle_development") &&
    storyArcPositions.has("ending") &&
    timeline.segments.every((segment) => segment.storyArcContract.includes("full video")) &&
    shots.every((shot) => (shot.timeline?.length ?? 0) === 3) &&
    compiledPromptStoryArcReady
    ? pass("whole_video_story_arc_prompt_contract", "Long-form prompts and timeline segments carry opening, development/proof, payoff, and boundary-choreography contracts across the full duration.")
    : fail("whole_video_story_arc_prompt_contract", "Expected long-form ShotPlanner and PromptCompiler to preserve whole-video story arc and boundary-choreography contracts."),
  productionContractsReady &&
    audioScriptReady &&
    timeline.audioScript.some((line) => line.language === "vi") &&
    timeline.segments.some((segment) => segment.productionContract.productionAct === "opening") &&
    timeline.segments.some((segment) => segment.productionContract.productionAct === "proof") &&
    timeline.segments.some((segment) => segment.productionContract.productionAct === "payoff")
    ? pass("segment_production_audio_contract", "Every long-form segment exposes a concrete timing, visual-change, voiceover, native-audio, music/SFX, endpoint, and audio-script contract.")
    : fail("segment_production_audio_contract", "Expected every long-form segment to expose production and audio script contracts."),
  providerSettingPolicyReady &&
    compiledPromptProviderSettingsReady
    ? pass("provider_setting_policy_contract", "Long-form timeline and compiled video requests preserve 720p, high bitrate, hybrid provider audio, and last-frame return policy.")
    : fail("provider_setting_policy_contract", "Expected timeline policy and compiled requests to preserve provider setting defaults for quality, audio, and chaining."),
  timeline.sequenceCount === continuityPlan.sequenceCount &&
    timeline.sequences.every((sequence, index) => sequence.order === index && sequence.startSecond < sequence.endSecond)
    ? pass("sequence_timing_boundaries", "Timeline exposes deterministic sequence timing boundaries.")
    : fail("sequence_timing_boundaries", "Timeline sequence timing boundaries are invalid."),
  sourceVideoNegativePromptReady
    ? pass("source_video_negative_prompt_contract", "Long-form source-video guided prompts include negative constraints against copied identity, transcript, music, watermark, captions, logos, and brand marks.")
    : fail("source_video_negative_prompt_contract", "Expected long-form source-video guided prompts to include copy-prevention negative constraints."),
  timeline.segments.every((segment) => segment.renderBatchId && segment.renderMode) &&
    sequentialSegments.length > 0 &&
    sequentialSegments.every((segment) => segment.sequentialReasons.length > 0)
    ? pass("render_schedule_binding", "Timeline binds every segment to render batch and sequential reason evidence.")
    : fail("render_schedule_binding", "Timeline is missing render batch or sequential reason evidence."),
  captionCoveredEnough &&
    timeline.postproduction.captionCueCount === captionCues.length &&
    timeline.segments.every((segment) => segment.captionCoverage.cueCount > 0)
    ? pass("caption_timeline_coverage", "Caption cues are mapped across the long-form timeline.")
    : fail("caption_timeline_coverage", "Caption cues did not cover the timeline."),
  generatedIntentMapped &&
    timeline.postproduction.audioTrackCount === 1 &&
    timeline.postproduction.generatedAudioIntentCount === generatedAudioIntents.length
    ? pass("audio_timeline_coverage", "Supplied and generated-audio planning evidence is visible at segment level.")
    : fail("audio_timeline_coverage", "Audio or generated-audio timeline coverage is incomplete."),
  timeline.manualReviewSegmentCount > 0 &&
    timeline.issues.some((issue) => issue.code === "sequential_manual_review" && issue.severity === "info") &&
    timeline.releaseGateSummary.canProceedToRender === true &&
    timeline.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("manual_review_without_render_block", "Continuity-sensitive segments require manual review but do not block prompt/render scheduling.")
    : fail("manual_review_without_render_block", "Expected manual-review timeline evidence without a render block."),
  blockedTimeline.blockingIssueCount > 0 &&
    blockedTimeline.issues.some((issue) => issue.code === "missing_render_schedule_item") &&
    blockedTimeline.releaseGateSummary.canProceedToRender === false
    ? pass("missing_schedule_blocks_render", "Missing render-schedule evidence blocks before provider spend.")
    : fail("missing_schedule_blocks_render", "Expected missing schedule evidence to block render."),
  !rawUrlLeakDetected
    ? pass("no_raw_provider_url_leak", "Timeline evidence stores labels, roles, scene IDs, and timing without raw provider URLs or query secrets.")
    : fail("no_raw_provider_url_leak", "Timeline evidence leaked raw provider URL or secret-like query text."),
  timeline.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin)) &&
    blockedTimeline.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
    ? pass("source_pattern_lineage", "Timeline evidence carries ViMax, VideoAgent, VibeFrame, and MoneyPrinterTurbo lineage labels.")
    : fail("source_pattern_lineage", "Timeline source pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-form-timeline-smoke.v1",
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
    rawUrlLeakCheckPassed: !rawUrlLeakDetected
  },
  scenarios: {
    ready: summarizeTimeline(timeline),
    blocked: summarizeTimeline(blockedTimeline)
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendLongFormTimelineEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Long-form timeline smoke proves no-spend timing, render-batch, caption, audio, and blocked-schedule evidence only; paid long-form render, manual media review, and deployment evidence remain separate gates."
      : "Long-form timeline smoke failed; fix timeline orchestration evidence before paid long-form validation."
  },
  nextActions: status === "pass"
    ? [
        "Keep timeline smoke passing before paid long-form validation.",
        "Compare long-form-timeline.json from real provider runs against manual review and UI timeline expectations after paid validation."
      ]
    : ["Fix LongFormTimelinePlanner before using it as long-form orchestration evidence."]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(status === "pass" ? 0 : 1);

function buildStoryPlan(prefix) {
  return {
    premise: "A premium skincare product proof story with a precise long-form timeline, captions, audio, and continuity review.",
    targetDurationSeconds: 120,
    scenes: Array.from({ length: 6 }, (_, sceneIndex) => {
      const order = sceneIndex + 1;
      return {
        sceneId: `${prefix}_scene_${String(order).padStart(2, "0")}`,
        title: `Timeline Movement ${order}`,
        beats: [
          {
            beatId: `${prefix}_beat_${String(order).padStart(2, "0")}`,
            purpose: order === 1 ? "hook and setup" : order === 6 ? "payoff and CTA" : "proof development",
            action: `Advance proof movement ${order} while keeping product, host, and macro style consistent.`,
            subject: "Glow Focus Serum with founder host",
            camera: sceneIndex < 2 ? "slow push-in" : "controlled macro cutaway",
            lighting: "warm natural window light",
            durationSeconds: 20,
            style: "warm premium macro commercial",
            audioIntent: `Narration and soft music support proof beat ${sceneIndex + 1}.`,
            references: referencesFor(sceneIndex),
            risks: risksFor(sceneIndex),
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
  if (sceneIndex === 2) {
    return ["product_logo", "transition"];
  }
  if (sceneIndex === 4) {
    return ["face", "environment"];
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

function sourceVideoAnalysis() {
  return {
    sourceReferenceLabel: "operator-approved product walkthrough",
    transformationIntent: "Translate source-video pacing into a long-form proof arc.",
    scenes: [
      {
        sceneId: "source_scene_01",
        startSecond: 0,
        endSecond: 18,
        summary: "Opening product context and problem statement.",
        pacing: "steady",
        camera: "handheld push-in",
        visualStyle: "warm tabletop product proof"
      },
      {
        sceneId: "source_scene_02",
        startSecond: 18,
        endSecond: 42,
        summary: "Demonstration and proof structure.",
        pacing: "progressive",
        camera: "macro detail and controlled cutaway",
        visualStyle: "clean commercial explainer"
      }
    ],
    structuralBeats: ["problem", "proof", "demonstration", "CTA"],
    styleNotes: ["warm natural light", "clean product macro frames"]
  };
}

function generatedAudioIntent(intentId, kind, startSecond, durationSeconds) {
  return {
    intentId,
    kind,
    prompt: `${kind} for a premium skincare proof video.`,
    startSecond,
    durationSeconds,
    language: "vi",
    mood: "warm confident",
    volume: kind === "tts_narration" ? 0.95 : 0.35
  };
}

function summarizeTimeline(value) {
  return {
    projectId: value.projectId,
    plannedDurationSeconds: value.plannedDurationSeconds,
    sequenceCount: value.sequenceCount,
    segmentCount: value.segmentCount,
    shotCount: value.shotCount,
    transitionCount: value.transitionCount,
    sequentialSegmentCount: value.sequentialSegmentCount,
    manualReviewSegmentCount: value.manualReviewSegmentCount,
    captionCueCount: value.captionCueCount,
    audioEventCount: value.audioEventCount,
    generatedAudioEventCount: value.generatedAudioEventCount,
    audioScriptLineCount: value.audioScriptLineCount,
    providerResolution: value.providerSettingPolicy.resolution,
    providerBitrateMode: value.providerSettingPolicy.bitrateMode,
    providerAudioMode: value.providerSettingPolicy.audioMode,
    nativeProviderAudioEnabled: value.providerSettingPolicy.nativeProviderAudioEnabled,
    externalAudioScriptEnabled: value.providerSettingPolicy.externalAudioScriptEnabled,
    returnLastFrame: value.providerSettingPolicy.returnLastFrame,
    issueCount: value.issueCount,
    blockingIssueCount: value.blockingIssueCount,
    warningIssueCount: value.warningIssueCount,
    canProceedToRender: value.releaseGateSummary.canProceedToRender,
    canReleaseToCustomerTraffic: value.releaseGateSummary.canReleaseToCustomerTraffic
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
