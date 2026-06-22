#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-pipeline-smoke-report.json";

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
const {
  buildShortPipelineRenderHandoff,
  reviewInputCanQueueRender
} = await import("../dist/core/short-pipeline-render-handoff.js");
const { StoryArchitect } = await import("../dist/agents/story-architect.js");
const planner = new ShortPipelinePlanner();
const generatedAt = new Date("2026-06-19T00:00:00.000Z");

const reviewRequiredPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_review",
  generatedAt,
  userPrompt: "Create a premium TikTok product ad for busy skincare buyers, 28 seconds, shop now, with a proof-led hook and human review before render.",
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum?signature=abc123&utm_source=ad",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
      priceText: "$39",
      imageUrls: [
        "https://cdn.example.com/glow-focus-serum/front.jpg?token=secret",
        "https://cdn.example.com/glow-focus-serum/texture.jpg"
      ],
      benefits: [
        "Visibly improves dull-looking skin in daily routines",
        "Lightweight texture layers cleanly under makeup"
      ],
      claims: [
        "Visibly improves dull-looking skin",
        "Supports a smoother morning routine"
      ],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "premium but warm",
    language: "en",
    visualStyle: "clean macro beauty with soft highlights",
    colorPalette: ["#f7e8df", "#222222", "#ffffff"],
    logoAssetUris: ["asset://brand/glow-lab/logo"],
    approvedAssetIds: ["brand/glow-lab/logo"],
    allowedClaims: ["visibly improves dull-looking skin"],
    forbiddenClaims: ["cures acne overnight"],
    ctaRules: ["Use one CTA only"],
    voicePreferences: ["calm confident narration"]
  },
  channelStyle: {
    channelId: "glow_lab_daily",
    channelName: "Glow Lab Daily",
    seriesName: "Morning Proof Rituals",
    audience: "busy skincare buyers",
    niche: "beauty",
    positioning: "premium skincare proof explained through warm creator-led routines",
    contentPillars: ["morning routine proof", "ingredient clarity", "busy buyer confidence"],
    visualStyle: "clean macro beauty, soft highlights, consistent cream background, product texture hero shots",
    editingRhythm: "fast first-second hook, one proof shift every 3-5 seconds, calm CTA landing",
    captionStyle: "short premium captions with one claim or proof idea per beat",
    musicStyle: "soft confident bed under calm narration",
    characters: [{
      characterId: "host_mina",
      name: "Mina",
      role: "recurring skincare guide",
      visualDescription: "warm creator host, neat neutral wardrobe, hands-on product routine framing",
      personality: "credible, calm, specific",
      mustPreserve: ["warm creator tone", "product visible early"],
      referenceAssetIds: ["asset://channel/glow-lab/host-mina"]
    }],
    voices: [{
      voiceId: "glow_lab_calm_voice",
      label: "Glow Lab calm guide",
      language: "en",
      voiceStyle: "calm confident narration with warm expert clarity",
      pacing: "medium-fast first line, relaxed proof explanation",
      catchphrases: ["proof, not hype"],
      referenceAssetIds: ["asset://channel/glow-lab/voice-calm-guide"]
    }],
    settings: [{
      settingId: "cream_countertop",
      label: "cream countertop routine set",
      visualDescription: "cream countertop, soft daylight, clean towel, serum texture close-up",
      lighting: "soft daylight with gentle specular highlights",
      colorMood: "cream, white, soft rose",
      recurringProps: ["clean towel", "serum dropper", "mirror edge"],
      referenceAssetIds: ["asset://channel/glow-lab/cream-countertop"]
    }],
    reusableAssets: [
      { assetId: "asset://channel/glow-lab/host-mina", kind: "character_reference", rightsStatus: "operator_approved" },
      { assetId: "asset://channel/glow-lab/voice-calm-guide", kind: "voice_reference", rightsStatus: "operator_approved" },
      { assetId: "asset://channel/glow-lab/cream-countertop", kind: "setting_reference", rightsStatus: "operator_approved" },
      { assetId: "asset://channel/glow-lab/style-board", kind: "style_reference", rightsStatus: "operator_approved" }
    ],
    styleRules: ["product visible in the first second", "proof beats before offer", "no loud meme edits"],
    doNotChange: ["Mina host identity", "cream countertop routine set", "calm proof-first voice"],
    avoidPatterns: ["hard-sell coupon spam", "unsupported before-after claims"]
  }
});

const blockedPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_blocked",
  generatedAt,
  userPrompt: "Make a UGC ad that says this cures acne overnight.",
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum",
    snapshot: {
      productTitle: "Glow Focus Serum",
      claims: ["cures acne overnight"],
      benefits: ["Cures acne overnight for every user"]
    }
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "premium but warm",
    forbiddenClaims: ["cures acne overnight"],
    ctaRules: ["Use one CTA only"]
  }
});

const naturalOnlyPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_natural_only",
  generatedAt,
  userPrompt: "Create a warm 20 second explainer for a founder-led B2B product launch. No template if the idea needs a custom workflow."
});

const douyinTestimonialPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_douyin_testimonial",
  generatedAt,
  userPrompt: "Create a 8 second Douyin customer testimonial proof short for a skincare offer. Keep it native, trustworthy, and review-bound.",
  targetPlatform: "douyin",
  targetDurationSeconds: 8,
  preferredTemplateId: "testimonial",
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Helps dull-looking morning skin look fresher"],
      claims: ["Helps dull-looking morning skin look fresher"],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "trustworthy native creator voice",
    language: "en",
    allowedClaims: ["helps dull-looking morning skin look fresher"],
    ctaRules: ["Use one CTA only"]
  }
});

const douyinChinesePromptPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_douyin_chinese_prompt",
  generatedAt,
  userPrompt: "Create a 18 second \u6296\u97f3 UGC review short for a skincare offer with a fast hook, proof beat, and native CTA.",
  allowTemplateSuggestions: true
});

const pendingRenderHandoff = buildShortPipelineRenderHandoff({
  plan: reviewRequiredPlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_pipeline_smoke_workspace"
  }
});
const approvedRenderHandoff = buildShortPipelineRenderHandoff({
  plan: reviewRequiredPlan,
  reviewApproval: {
    gate: "pre_render",
    checkpoints: reviewRequiredPlan.reviewApproval.checkpoints.map((checkpoint) => ({
      surface: checkpoint.surface,
      label: checkpoint.label,
      ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
      required: checkpoint.required,
      decision: "approved",
      reviewer: "short_pipeline_smoke",
      reviewedAt: generatedAt,
      notes: "Approved in no-spend short-pipeline handoff smoke.",
      issueCodes: checkpoint.issueCodes,
      evidence: checkpoint.evidence
    }))
  },
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_pipeline_smoke_workspace"
  }
});
const singleClipRenderHandoff = buildShortPipelineRenderHandoff({
  plan: douyinTestimonialPlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_pipeline_smoke_workspace"
  }
});
const storyArchitect = new StoryArchitect(createFakeShortLlmProvider(), "fake-short-llm");
const singleClipStoryPlan = await storyArchitect.plan({
  projectId: "short_pipeline_smoke_single_clip",
  userInput: singleClipRenderHandoff.request.userInput,
  settings: {
    tier: "fast",
    resolution: "480p",
    qualityMode: "economy",
    ratio: singleClipRenderHandoff.request.settings.ratio,
    durationTargetSeconds: singleClipRenderHandoff.request.settings.durationTargetSeconds,
    audioMode: "none",
    watermark: false,
    returnLastFrame: true
  },
  references: [],
  metadata: singleClipRenderHandoff.request.metadata
});
const explicitStoryboardStoryPlan = await storyArchitect.plan({
  projectId: "short_pipeline_smoke_explicit_storyboard",
  userInput: singleClipRenderHandoff.request.userInput,
  settings: {
    tier: "fast",
    resolution: "480p",
    qualityMode: "economy",
    ratio: singleClipRenderHandoff.request.settings.ratio,
    durationTargetSeconds: singleClipRenderHandoff.request.settings.durationTargetSeconds,
    audioMode: "none",
    watermark: false,
    returnLastFrame: true
  },
  references: [],
  metadata: {
    shortPipelineRecommendedWorkflowMode: "single_clip",
    workflowMode: "storyboard"
  }
});

const serialized = JSON.stringify({
  reviewRequiredPlan,
  blockedPlan,
  naturalOnlyPlan,
  douyinTestimonialPlan,
  douyinChinesePromptPlan,
  pendingRenderHandoff,
  approvedRenderHandoff,
  singleClipRenderHandoff
});
const rawUrlLeaked = serialized.includes("https://shop.example.com") ||
  serialized.includes("signature=abc123") ||
  serialized.includes("token=secret");

const checks = [
  reviewRequiredPlan.noSpend && !reviewRequiredPlan.networkCallsMade && !reviewRequiredPlan.providerCallsMade
    ? pass("no_spend_no_network", "Short-pipeline planning does not call network, Atlas, render, or provider paths.")
    : fail("no_spend_no_network", "Expected no-spend, no-network, no-provider planning."),
  reviewRequiredPlan.productBrief?.source.sourceUrlSha256 && reviewRequiredPlan.productBrief.source.status === "unsafe_query_redacted" && !rawUrlLeaked
    ? pass("product_url_fingerprint_no_raw_url", "Product URL evidence is fingerprinted and raw signed/query URLs are not serialized.")
    : fail("product_url_fingerprint_no_raw_url", "Expected product URL fingerprint evidence without raw URL leakage."),
  reviewRequiredPlan.templatePolicy === "suggested_optional" &&
    reviewRequiredPlan.dynamicWorkflowRequired &&
    reviewRequiredPlan.templateSuggestions.every((item) => item.usePolicy === "optional_accelerator")
    ? pass("template_optional_dynamic_workflow", "Templates are optional accelerators and dynamic workflow remains required.")
    : fail("template_optional_dynamic_workflow", "Expected optional template suggestions with dynamic workflow still required."),
  reviewRequiredPlan.commercialReadiness.schemaVersion === "cinejelly.short-commercial-readiness.v1" &&
    reviewRequiredPlan.commercialReadiness.status === "review_required" &&
    reviewRequiredPlan.commercialReadiness.crawlerPolicy.bypassPolicy === "never_bypass_access_controls" &&
    reviewRequiredPlan.commercialReadiness.checks.some((check) => check.code === "channel_style_memory" && check.status === "ready") &&
    reviewRequiredPlan.commercialReadiness.outcomeMemory.status === "ready_to_write_after_review" &&
    reviewRequiredPlan.commercialReadiness.releaseGateSummary.canRenderNow === false
    ? pass("commercial_readiness_contract", "Short plans include no-spend commercial readiness, channel-style memory, crawler-safe policy, outcome-memory contract, and render-now block.")
    : fail("commercial_readiness_contract", "Expected short commercial readiness contract with crawler/memory/review safeguards."),
  reviewRequiredPlan.channelStyleProfile?.status === "ready" &&
    reviewRequiredPlan.agentGraph?.memoryPack.retrievedPatterns.some((pattern) => pattern.source === "channel_style_memory") &&
    pendingRenderHandoff.request.metadata?.shortChannelStyleProfileId === reviewRequiredPlan.channelStyleProfile.profileId
    ? pass("channel_style_memory_profile", "Reusable channel style profile flows through plan, Short Agent memory, readiness, and render handoff lineage.")
    : fail("channel_style_memory_profile", "Expected reusable channel style profile evidence in plan, memory, readiness, and render handoff."),
  hasEveryReviewSurface(reviewRequiredPlan)
    ? pass("review_surfaces_present", "Scene, audio, caption, and claim checkpoints are present before render.")
    : fail("review_surfaces_present", "Expected scene, audio, caption, and claim checkpoints."),
  reviewRequiredPlan.reviewApproval.status === "approval_required" &&
    reviewRequiredPlan.releaseGateSummary.canRenderAfterApproval === false &&
    reviewRequiredPlan.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("human_review_blocks_render", "Initial short plan pauses for human approval and never claims customer traffic.")
    : fail("human_review_blocks_render", "Expected initial short plan to require approval before render."),
  blockedPlan.status === "blocked" &&
    blockedPlan.brandKitEvaluation?.issues.some((issue) => issue.code === "forbidden_claim_present") &&
    blockedPlan.releaseGateSummary.canUseAsNoSpendPlanningEvidence === false
    ? pass("brand_forbidden_claim_blocks", "Brand-kit forbidden claims block the plan instead of silently rewriting it.")
    : fail("brand_forbidden_claim_blocks", "Expected forbidden brand claim to block the plan."),
  naturalOnlyPlan.status === "approval_required" &&
    naturalOnlyPlan.dynamicWorkflowRequired &&
    naturalOnlyPlan.reviewApproval.summary.surfaceCounts.scene > 0 &&
    naturalOnlyPlan.reviewApproval.summary.surfaceCounts.claim > 0
    ? pass("natural_language_only_plan", "Natural-language-only briefs can create a custom workflow with review checkpoints.")
    : fail("natural_language_only_plan", "Expected natural-language-only brief to plan without requiring a template or URL."),
  pendingRenderHandoff.request.metadata?.shortPipelinePlanId === reviewRequiredPlan.planId &&
    pendingRenderHandoff.request.captionCues?.length === reviewRequiredPlan.scenes.length &&
    pendingRenderHandoff.request.generatedAudioIntents?.length === reviewRequiredPlan.scenes.length &&
    pendingRenderHandoff.request.userInput.includes("Scene plan:") &&
    !reviewInputCanQueueRender(pendingRenderHandoff.reviewApproval) &&
    !rawUrlLeaked
    ? pass("render_handoff_request_contract", "Short plan can become a redacted render request with captions, generated-audio intents, lineage metadata, and pending review still blocking queue.")
    : fail("render_handoff_request_contract", "Expected short-plan render handoff to preserve lineage, captions, generated-audio intents, redaction, and pending review block."),
  approvedRenderHandoff.summary.canUseAsRenderJobHandoff &&
    reviewInputCanQueueRender(approvedRenderHandoff.reviewApproval) &&
    approvedRenderHandoff.request.settings?.durationTargetSeconds === reviewRequiredPlan.intent.targetDurationSeconds &&
    approvedRenderHandoff.request.settings?.ratio === reviewRequiredPlan.intent.aspectRatio &&
    approvedRenderHandoff.request.metadata?.shortPipelineSource === "agentic_short_pipeline"
    ? pass("approved_handoff_ready_for_confirmed_async_submission", "Approved short-pipeline review evidence is ready for the API render-job handoff path after explicit render confirmation.")
    : fail("approved_handoff_ready_for_confirmed_async_submission", "Expected approved short-pipeline handoff to be ready for confirmed async render-job submission."),
  douyinTestimonialPlan.intent.platform === "douyin" &&
    douyinTestimonialPlan.intent.targetDurationSeconds === 15 &&
    douyinTestimonialPlan.selectedTemplate?.templateId === "testimonial" &&
    douyinTestimonialPlan.viralIntelligence.nicheStrategy.platformFocus === "tiktok_douyin"
    ? pass("douyin_testimonial_duration_policy", "Douyin testimonial requests are supported and sub-15s inputs clamp to the commercial-safe 15s render minimum.")
    : fail("douyin_testimonial_duration_policy", "Expected Douyin testimonial support with 15s commercial-safe duration clamp."),
  douyinChinesePromptPlan.intent.platform === "douyin" &&
    douyinChinesePromptPlan.intent.targetDurationSeconds === 18 &&
    douyinChinesePromptPlan.viralIntelligence.nicheStrategy.platformFocus === "tiktok_douyin"
    ? pass("douyin_chinese_prompt_inference", "Chinese Douyin prompts are inferred as Douyin without requiring an explicit targetPlatform override.")
    : fail("douyin_chinese_prompt_inference", "Expected Chinese Douyin prompt text to infer platform=douyin and TikTok/Douyin strategy."),
  singleClipRenderHandoff.request.metadata?.workflowMode === "single" &&
    singleClipRenderHandoff.request.metadata?.renderMode === "single_clip" &&
    singleClipRenderHandoff.request.metadata?.shortPipelineRecommendedWorkflowMode === "single_clip"
    ? pass("single_clip_handoff_mode_metadata", "15s short handoff declares single-clip workflow metadata for the Story Architect and strategy planner.")
    : fail("single_clip_handoff_mode_metadata", "Expected 15s handoff to declare single-clip workflow metadata."),
  singleClipStoryPlan.scenes.length === 1 &&
    singleClipStoryPlan.scenes[0]?.beats.length === 1 &&
    singleClipStoryPlan.scenes[0]?.beats[0]?.durationSeconds === 15
    ? pass("story_architect_single_clip_collapse", "Story Architect collapses 15s single-clip short handoff into one provider clip plan.")
    : fail("story_architect_single_clip_collapse", "Expected Story Architect to collapse single-clip short handoff into one scene/beat."),
  explicitStoryboardStoryPlan.scenes.length > 1
    ? pass("explicit_storyboard_mode_overrides_single_recommendation", "Explicit storyboard mode from UI/operator wins over the 15s single-clip recommendation.")
    : fail("explicit_storyboard_mode_overrides_single_recommendation", "Expected explicit storyboard mode to preserve multi-scene planning."),
  pendingRenderHandoff.request.metadata?.workflowMode === "storyboard" &&
    pendingRenderHandoff.request.metadata?.renderMode === "storyboard_multishot" &&
    pendingRenderHandoff.request.metadata?.shortPipelineRecommendedWorkflowMode === "storyboard_multishot"
    ? pass("storyboard_handoff_mode_metadata", "Longer short handoff declares storyboard/multishot workflow metadata before provider spend.")
    : fail("storyboard_handoff_mode_metadata", "Expected >15s handoff to declare storyboard/multishot workflow metadata."),
  audioCheckpointTargetDuration(reviewRequiredPlan) === reviewRequiredPlan.intent.targetDurationSeconds
    ? pass("audio_checkpoint_uses_intent_duration", "Audio review evidence now records the requested short duration instead of deriving a rough scene-count duration.")
    : fail("audio_checkpoint_uses_intent_duration", "Expected audio checkpoint evidence to use the plan target duration.")
];

const report = {
  schemaVersion: "cinejelly.short-pipeline-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: [
    "calesthio/OpenMontage",
    "HKUDS/ViMax",
    "HKUDS/VideoAgent",
    "video-db/Director",
    "vericontext/vibeframe"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 3,
    endpointPath: "/v1/short-pipeline/plan",
    renderHandoffEndpointPath: "/v1/short-pipeline/render-jobs",
    rawUrlLeakCheckPassed: !rawUrlLeaked
  },
  scenarios: {
    reviewRequired: summarizePlan(reviewRequiredPlan),
    blocked: summarizePlan(blockedPlan),
    naturalOnly: summarizePlan(naturalOnlyPlan),
    renderHandoff: summarizeHandoff(pendingRenderHandoff, approvedRenderHandoff)
  },
  checks,
  releaseGateSummary: {
    shortPipelineSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Short-pipeline smoke proves no-spend planning, optional templates, brand guard, product URL fingerprinting, review checkpoints, and render-job handoff contracts only; deployment, paid validation, and manual media review remain separate gates."
  },
  nextActions: [
    "Build the first-party chat/review UI and media-library evidence before claiming Director-style product parity.",
    "Run live short-pipeline render validation only after explicit operator confirmation, budget approval, and accepted review evidence.",
    "Replace no-network product snapshots with a reviewed crawler/extractor only after URL privacy and rights policies are accepted."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function summarizePlan(plan) {
  return {
    planId: plan.planId,
    status: plan.status,
    templatePolicy: plan.templatePolicy,
    dynamicWorkflowRequired: plan.dynamicWorkflowRequired,
    templateSuggestionCount: plan.templateSuggestions.length,
    sceneCount: plan.scenes.length,
    reviewApprovalStatus: plan.reviewApproval.status,
    reviewCheckpointCount: plan.reviewApproval.summary.checkpointCount,
    reviewIssueCount: plan.reviewApproval.summary.issueCount,
    productBriefStatus: plan.productBrief?.status,
    productSourceStatus: plan.productBrief?.source.status,
    productSourceUrlSha256Present: Boolean(plan.productBrief?.source.sourceUrlSha256),
    productRawUrlSerialized: false,
    brandKitStatus: plan.brandKitEvaluation?.status,
    brandIssueCodes: plan.brandKitEvaluation?.issues.map((issue) => issue.code) ?? [],
    commercialReadinessStatus: plan.commercialReadiness.status,
    commercialReadinessScore: plan.commercialReadiness.qualityScore,
    crawlerPolicyStatus: plan.commercialReadiness.crawlerPolicy.status,
    referenceAnalysisStatus: plan.commercialReadiness.referenceAnalysis.status,
    outcomeMemoryStatus: plan.commercialReadiness.outcomeMemory.status,
    readinessCheckCount: plan.commercialReadiness.checks.length,
    channelStyleProfileStatus: plan.channelStyleProfile?.status,
    channelStyleAnchorCount: plan.channelStyleProfile?.styleAnchors.length ?? 0,
    channelStyleMemoryPatternCount: plan.agentGraph?.memoryPack.retrievedPatterns.filter((pattern) => pattern.source === "channel_style_memory").length ?? 0,
    canUseAsNoSpendPlanningEvidence: plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence,
    canReleaseToCustomerTraffic: plan.releaseGateSummary.canReleaseToCustomerTraffic
  };
}

function hasEveryReviewSurface(plan) {
  const counts = plan.reviewApproval.summary.surfaceCounts;
  return counts.scene > 0 && counts.audio > 0 && counts.caption > 0 && counts.claim > 0;
}

function audioCheckpointTargetDuration(plan) {
  const checkpoint = plan.reviewApproval.checkpoints.find((item) => item.surface === "audio");
  return checkpoint?.evidence?.targetDurationSeconds;
}

function summarizeHandoff(pending, approved) {
  return {
    planId: pending.summary.planId,
    pendingReviewCanQueueRender: reviewInputCanQueueRender(pending.reviewApproval),
    approvedReviewCanQueueRender: reviewInputCanQueueRender(approved.reviewApproval),
    canUseAsRenderJobHandoff: approved.summary.canUseAsRenderJobHandoff,
    captionCueCount: pending.summary.captionCueCount,
    generatedAudioIntentCount: pending.summary.generatedAudioIntentCount,
    requestHasPlanLineage: pending.request.metadata?.shortPipelinePlanId === pending.summary.planId,
    requestHasWorkspaceLineage: pending.request.metadata?.workspaceId === "short_pipeline_smoke_workspace",
    requestHasCommercialReadinessLineage: Boolean(pending.request.metadata?.shortCommercialReadinessId),
    commercialReadinessStatus: pending.request.metadata?.shortCommercialReadinessStatus,
    crawlerPolicyStatus: pending.request.metadata?.shortCrawlerPolicyStatus,
    outcomeMemoryStatus: pending.request.metadata?.shortOutcomeMemoryStatus,
    requestHasChannelStyleLineage: Boolean(pending.request.metadata?.shortChannelStyleProfileId),
    requestDurationSeconds: pending.request.settings?.durationTargetSeconds,
    requestAspectRatio: pending.request.settings?.ratio,
    requestRawUrlSerialized: false,
    canReleaseToCustomerTraffic: pending.summary.canReleaseToCustomerTraffic
  };
}

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

function createFakeShortLlmProvider() {
  return {
    name: "fake-short-llm",
    async chat() {
      return {
        provider: "atlascloud",
        modelId: "fake-short-llm",
        content: "{}",
        raw: {},
        latencyMs: 0
      };
    },
    async structured() {
      const scenes = [1, 2, 3].map((number) => ({
        sceneId: `scene_${number}`,
        title: `Short beat ${number}`,
        beats: [
          {
            beatId: `beat_${number}`,
            purpose: number === 1 ? "hook" : number === 2 ? "proof" : "cta",
            action: `Show short proof beat ${number}.`,
            subject: "approved short product subject",
            camera: "vertical handheld commercial camera",
            lighting: "clean soft studio lighting",
            durationSeconds: 5,
            risks: []
          }
        ]
      }));
      return {
        provider: "atlascloud",
        modelId: "fake-short-llm",
        content: JSON.stringify({ premise: "Fake short plan", targetDurationSeconds: 15, scenes }),
        raw: {},
        latencyMs: 0,
        value: {
          premise: "Fake short plan",
          targetDurationSeconds: 15,
          scenes
        }
      };
    },
    capabilities() {
      return [];
    }
  };
}
