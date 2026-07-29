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
const { ShotPlanner } = await import("../dist/core/shot-planner.js");
const { SeedancePromptCompiler } = await import("../dist/prompt_compiler/prompt-compiler.js");
const { AtlasCloudProvider } = await import("../dist/providers/atlascloud/atlas-cloud-provider.js");
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
const smartShortPipePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_pipe_smart_short",
  generatedAt,
  userPrompt: "Create a 12 second TikTok idea for a funny productivity micro-story with a sharp hook, one visual twist, and an original ending.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 12
});
const productKolPipePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_pipe_product_kol",
  generatedAt,
  userPrompt: "Create a 28 second TikTok UGC serum proof video using my KOL image, product pack, and bathroom background. Keep it natural and proof-led.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 28,
  seedanceSettings: {
    resolution: "1080p-SR",
    bitrateMode: "high",
    returnLastFrame: true
  },
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      claims: ["Lightweight texture layers cleanly under makeup"],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  mediaReferences: [
    mediaReference("kol", "image", "asset://short-pipeline/kol-mina", "Mina KOL reference", "operator_approved", "primary"),
    mediaReference("product", "image", "asset://short-pipeline/glow-serum-pack", "Glow serum product pack", "operator_approved", "primary"),
    mediaReference("background", "image", "asset://short-pipeline/bathroom-set", "Bathroom vanity background", "operator_approved", "supporting")
  ]
});
const videoRemakePipePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_pipe_video_remake",
  generatedAt,
  userPrompt: "Create a Video Remake from my approved trend reference for a serum launch. Keep the beat order, acting rhythm, camera grammar, and payoff timing, but replace KOL, product, setting, voice, audio, and claims.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 24,
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      claims: ["Lightweight texture layers cleanly under makeup"],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "approved serum trend structure",
    sourceUrl: "https://media.example.com/reference/serum-trend-remake",
    summary: "Creator opens with a mirror routine interruption, moves into a product reveal, shows macro texture proof, reacts naturally, and ends on a clean routine payoff.",
    hook: "The routine looks normal until the mirror close-up reveals the real problem.",
    durationSeconds: 24,
    sceneCount: 5,
    pacing: "0-2s mirror hook, 2-7s routine problem, 7-14s serum texture proof, 14-20s KOL reaction, 20-24s payoff",
    cameraStyle: "mirror handheld, macro product push-in, reaction cut, clean final frame",
    captionStyle: "visual rhythm only; no generated visible text",
    audioStyle: "original guided narration with new beat accents",
    retentionPattern: "delay the product payoff until after the texture proof",
    ctaStyle: "soft routine payoff using approved claim language",
    visualMotifs: ["mirror routine", "macro serum texture", "clean payoff"],
    doNotCopy: true
  },
  mediaReferences: [
    mediaReference("kol", "image", "asset://short-pipeline/remake-kol", "Remake KOL reference", "operator_approved", "primary"),
    mediaReference("product", "image", "asset://short-pipeline/remake-serum-pack", "Remake serum pack", "operator_approved", "primary"),
    mediaReference("background", "image", "asset://short-pipeline/remake-bathroom-set", "Remake bathroom set", "operator_approved", "supporting"),
    mediaReference("source_video", "video", "asset://short-pipeline/approved-serum-trend", "Approved serum trend structure", "operator_approved", "supporting")
  ]
});
const cleanHttpsMediaReferences = [
  mediaReference("kol", "image", "https://cdn.example.test/refs/mina-kol.png", "Clean HTTPS KOL reference", "operator_approved", "primary"),
  mediaReference("product", "image", "https://cdn.example.test/refs/glow-serum-pack.png", "Clean HTTPS serum pack", "operator_approved", "primary"),
  mediaReference("source_video", "video", "https://media.example.test/refs/serum-trend.mp4", "Clean HTTPS source trend", "operator_approved", "supporting")
];
const cleanHttpsReferencePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_clean_https_references",
  generatedAt,
  userPrompt: "Create a 24 second Video Remake using clean HTTPS KOL, product, and source-video references. Keep the source rhythm only and replace all identity, product, audio, and claims.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 24,
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      claims: ["Lightweight texture layers cleanly under makeup"],
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    }
  },
  mediaReferences: cleanHttpsMediaReferences
});
const cleanHttpsReferenceHandoff = buildShortPipelineRenderHandoff({
  plan: cleanHttpsReferencePlan,
  mediaReferenceInputs: cleanHttpsMediaReferences,
  includeGeneratedAudioIntents: true
});
const privateMediaReferenceInputs = [
  mediaReference("kol", "image", "https://192.168.1.10/refs/private-kol.png", "Private network KOL reference", "operator_approved", "primary"),
  mediaReference("product", "image", "https://10.0.0.5/refs/private-product.png", "Private network product reference", "operator_approved", "primary"),
  mediaReference("source_video", "video", "https://media.internal/refs/private-source.mp4", "Internal source trend", "operator_approved", "supporting")
];
const privateMediaReferencePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_private_media_references",
  generatedAt,
  userPrompt: "Create a 24 second Video Remake using private-network media references. Backend must block unsafe media handoff.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 24,
  mediaReferences: privateMediaReferenceInputs
});
const privateMediaReferenceHandoff = buildShortPipelineRenderHandoff({
  plan: privateMediaReferencePlan,
  mediaReferenceInputs: privateMediaReferenceInputs,
  includeGeneratedAudioIntents: true
});
const productionBiblePipePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_pipe_production_bible",
  generatedAt,
  userPrompt: "Create a 90 second branded mini sequence for a recurring KOL and product world. Keep identity, product, lighting, sound rhythm, and ending continuity locked across clips.",
  targetPlatform: "youtube_shorts",
  targetDurationSeconds: 90,
  visualBible: {
    mode: "production_bible",
    requireBeforeRender: true
  },
  mediaReferences: [
    mediaReference("kol", "image", "asset://short-pipeline/series-kol-sheet", "Series KOL sheet", "operator_approved", "primary"),
    mediaReference("product", "image", "asset://short-pipeline/series-product-sheet", "Series product sheet", "operator_approved", "primary"),
    mediaReference("style", "image", "asset://short-pipeline/series-style-board", "Series style board", "operator_approved", "supporting")
  ]
});
const productionBibleRenderHandoff = buildShortPipelineRenderHandoff({
  plan: productionBiblePipePlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_pipeline_smoke_workspace"
  }
});
const productionBibleMaxDurationPipePlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_pipe_production_bible_480",
  generatedAt,
  userPrompt: "Create an eight minute vertical branded sequence with a recurring KOL, product world, chaptered proof beats, consistent character sheet, and resolved ending continuity.",
  targetPlatform: "youtube_shorts",
  targetDurationSeconds: 480,
  visualBible: {
    mode: "production_bible",
    requireBeforeRender: true
  },
  mediaReferences: [
    mediaReference("kol", "image", "asset://short-pipeline/series-kol-sheet-480", "Series KOL sheet 480", "operator_approved", "primary"),
    mediaReference("product", "image", "asset://short-pipeline/series-product-sheet-480", "Series product sheet 480", "operator_approved", "primary"),
    mediaReference("style", "image", "asset://short-pipeline/series-style-board-480", "Series style board 480", "operator_approved", "supporting")
  ]
});
const productionBibleMaxDurationRenderHandoff = buildShortPipelineRenderHandoff({
  plan: productionBibleMaxDurationPipePlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_pipeline_smoke_workspace"
  }
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
const vietnameseAudioPlan = planner.buildPlan({
  projectId: "short_pipeline_smoke",
  requestId: "req_short_pipeline_vietnamese_audio",
  generatedAt,
  userPrompt: "Create a 18 second TikTok UGC product review for busy skincare buyers with Vietnamese voiceover and no text in the video.",
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Helps dull-looking morning skin look fresher"],
      targetBuyer: "busy skincare buyers"
    }
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "warm calm creator",
    language: "vi",
    allowedClaims: ["helps dull-looking morning skin look fresher"]
  },
  audio: {
    mode: "voiceover",
    language: "vi"
  }
});
const vietnameseAudioHandoff = buildShortPipelineRenderHandoff({
  plan: vietnameseAudioPlan,
  includeGeneratedAudioIntents: true
});
const audioOffHandoff = buildShortPipelineRenderHandoff({
  plan: vietnameseAudioPlan,
  includeGeneratedAudioIntents: true,
  audio: {
    mode: "off"
  }
});
const chineseAudioHandoff = buildShortPipelineRenderHandoff({
  plan: vietnameseAudioPlan,
  includeGeneratedAudioIntents: true,
  audio: {
    mode: "voiceover",
    language: "zh"
  }
});
const storyArchitect = new StoryArchitect(createFakeShortLlmProvider(), "fake-short-llm");
const audioEnabledStoryboardSettings = {
  tier: "fast",
  resolution: "720p-SR",
  qualityMode: "economy",
  ratio: singleClipRenderHandoff.request.settings.ratio,
  durationTargetSeconds: singleClipRenderHandoff.request.settings.durationTargetSeconds,
  audioMode: singleClipRenderHandoff.request.settings.audioMode,
  bitrateMode: "standard",
  watermark: false,
  returnLastFrame: true
};
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
const audioEnabledStoryboardStoryPlan = await storyArchitect.plan({
  projectId: "short_pipeline_smoke_audio_storyboard",
  userInput: singleClipRenderHandoff.request.userInput,
  settings: audioEnabledStoryboardSettings,
  references: [],
  metadata: {
    ...singleClipRenderHandoff.request.metadata,
    shortPipelineSource: "agentic_short_pipeline",
    workflowMode: "storyboard"
  }
});
const shortStoryboardShots = new ShotPlanner().plan({
  projectId: "short_pipeline_smoke_audio_storyboard",
  scenes: audioEnabledStoryboardStoryPlan.scenes,
  settings: audioEnabledStoryboardSettings,
  metadata: {
    shortPipelineSource: "agentic_short_pipeline",
    workflowMode: "storyboard"
  }
});
const compiledShortStoryboardPrompts = shortStoryboardShots.map((shot) =>
  new SeedancePromptCompiler().compile({
    shot,
    settings: audioEnabledStoryboardSettings,
    modelId: "bytedance/seedance-2.0-fast/reference-to-video",
    provider: "atlascloud"
  })
);
// CI LENGTH LOCK (repo-fidelity gap #4): the first paid runs shipped 9,187–11,369-char prompts (the
// proven corpus max is 6,972) and produced the owner's bad results. Today's anatomy compiles ~5K by
// design; this lock fails the suite if any compiled prompt creeps past 6,500 so that regression can
// never ship silently again.
// Single shared ceiling with run-input-matrix-smoke (cross-audit #3 — was 6500 here vs 8000 there).
// 8000 catches the 9-11K catastrophe that ruined paid-run 2 while allowing a genuinely complex
// cinematic multi-reference shot (measured worst case ~7.1K: 2 faces + product + endpoint + timeline).
const PROMPT_LENGTH_CEILING = 8_000;
const oversizedPrompts = compiledShortStoryboardPrompts.filter((prompt) => prompt.prompt.length > PROMPT_LENGTH_CEILING);

const shortStoryboardPromptContractDiagnostics = compiledShortStoryboardPrompts.map((prompt) => ({
  shotId: prompt.shotId,
  hasSeedanceMode: prompt.prompt.includes("Seedance mode contract:"),
  // Compacted prompt anatomy: Pacing/Motion-continuity/Inter-shot-bridge/Boundary-choreography
  // merged into single Runtime + Boundary contracts (live-render forensics).
  hasRuntimeContract: prompt.prompt.includes("Runtime contract:"),
  hasTimeline: prompt.prompt.includes("Timeline:"),
  hasBoundaryContract: prompt.prompt.includes("Boundary: this clip must cut together with adjacent clips as one continuous film."),
  hasFinalFrameContract: prompt.prompt.includes("Final-frame contract:"),
  hasAudioProductionPlan: prompt.prompt.includes("Audio production plan:"),
  hasOriginalAudioGuidance: prompt.prompt.includes("Generate only original ambience/music/voice on this shot's timing"),
  hasShotNarrationBudget: prompt.prompt.includes("Keep narration under about"),
  hasBeatSpokenWordBudget: prompt.prompt.includes("words for this beat"),
  generateAudio: prompt.videoRequest.settings.generateAudio
}));
const seedanceCapabilityProvider = new AtlasCloudProvider({
  apiKey: "test-key",
  apiBaseUrl: "https://api.atlascloud.ai/v1",
  assetBaseUrl: "https://api.atlascloud.ai",
  models: {
    llmModel: "fake-short-llm",
    seedanceMiniModel: "bytedance/seedance-2.0-mini/reference-to-video",
    seedanceStandardModel: "bytedance/seedance-2.0/reference-to-video",
    seedanceFastModel: "bytedance/seedance-2.0-fast/reference-to-video"
  },
  requestTimeoutMs: 1000,
  maxJsonResponseBytes: 100000,
  pollingIntervalMs: 100,
  pollingTimeoutMs: 1000
});
const fallbackMiniCapabilities = seedanceCapabilityProvider.capabilities("bytedance/seedance-2.0-mini/reference-to-video");
const fallbackStandardCapabilities = seedanceCapabilityProvider.capabilities("bytedance/seedance-2.0/reference-to-video");
const fallbackMiniCapability = fallbackMiniCapabilities[0];
const fallbackStandardCapability = fallbackStandardCapabilities[0];
const authorizedSourceVideoPrompt = new SeedancePromptCompiler().compile({
  shot: sourceVideoBindingShot("authorized"),
  settings: audioEnabledStoryboardSettings,
  modelId: "bytedance/seedance-2.0/reference-to-video",
  provider: "atlascloud",
  providerSupportedReferenceKinds: ["image", "video", "audio", "first_frame", "last_frame", "identity", "product", "environment", "motion", "camera", "style"]
});
const planningOnlySourceVideoPrompt = new SeedancePromptCompiler().compile({
  shot: sourceVideoBindingShot("planning_only"),
  settings: audioEnabledStoryboardSettings,
  modelId: "bytedance/seedance-2.0/reference-to-video",
  provider: "atlascloud",
  providerSupportedReferenceKinds: ["image", "video", "audio", "first_frame", "last_frame", "identity", "product", "environment", "motion", "camera", "style"]
});
const providerFamilyLimitPrompt = new SeedancePromptCompiler().compile({
  shot: sourceVideoFamilyLimitShot(),
  settings: audioEnabledStoryboardSettings,
  modelId: "bytedance/seedance-2.0/reference-to-video",
  provider: "atlascloud",
  providerSupportedReferenceKinds: ["image", "video", "audio", "first_frame", "last_frame", "identity", "product", "environment", "motion", "camera", "style"],
  maxProviderReferences: 12
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
const pipeMatrixPlans = {
  smartShort: smartShortPipePlan,
  productKol: productKolPipePlan,
  storyboard: reviewRequiredPlan,
  videoRemake: videoRemakePipePlan,
  productionBible: productionBiblePipePlan
};
const storyboardPipePlan = pipeMatrixPlans.storyboard;
const pipeMatrixExpected = [
  ["smartShort", "smart_short", "normal_short_pipe"],
  ["productKol", "product_kol_ugc", "product_kol_reference_pipe"],
  ["storyboard", "storyboard_multishot", "storyboard_board_pipe"],
  ["videoRemake", "video_remake", "video_remake_pipe"],
  ["productionBible", "production_bible", "long_sequence_bible_pipe"]
];
const canonicalPipeOptions = productKolPipePlan.videoPipePlan.pipeOptions;
const expectedPipeDurations = new Map([
  ["smart_short", [5, 20, 8, 15, false]],
  ["product_kol_ugc", [15, 60, 20, 45, false]],
  ["storyboard_multishot", [15, 60, 25, 60, false]],
  ["video_remake", [5, 60, 15, 45, false]],
  ["production_bible", [60, 480, 60, 180, true]]
]);
const expectedVisualBibleExecutionModes = new Map([
  ["smartShort", ["text_only_no_board", "text_to_video", "single_clip"]],
  ["productKol", ["reference_board_to_seedance", "reference_to_video", "multi_clip_last_frame_chaining"]],
  ["storyboard", ["reference_board_to_seedance", "reference_to_video", "multi_clip_last_frame_chaining"]],
  ["videoRemake", ["video_remake_to_seedance", "reference_to_video", "multi_clip_last_frame_chaining"]],
  ["productionBible", ["production_bible_to_seedance", "reference_to_video", "sequence_bible_last_frame_chaining"]]
]);
const requiredPipeSettingIds = [
  "duration_seconds",
  "aspect_ratio",
  "resolution",
  "seedance_tier",
  "provider_mode",
  "return_last_frame",
  "audio_mode",
  "visual_bible_mode"
];

const checks = [
  reviewRequiredPlan.noSpend && !reviewRequiredPlan.networkCallsMade && !reviewRequiredPlan.providerCallsMade
    ? pass("no_spend_no_network", "Short-pipeline planning does not call network, Atlas, render, or provider paths.")
    : fail("no_spend_no_network", "Expected no-spend, no-network, no-provider planning."),
  oversizedPrompts.length === 0
    ? pass("compiled_prompt_length_lock", `All ${compiledShortStoryboardPrompts.length} compiled prompts under ${PROMPT_LENGTH_CEILING} chars (max ${Math.max(...compiledShortStoryboardPrompts.map((p) => p.prompt.length))}).`)
    : fail("compiled_prompt_length_lock", `${oversizedPrompts.length} compiled prompt(s) exceed ${PROMPT_LENGTH_CEILING} chars: ${oversizedPrompts.map((p) => `${p.shotId}=${p.prompt.length}`).join(", ")} — the 9-11K bloat that ruined the paid runs is creeping back.`),
  reviewRequiredPlan.directorPlan?.schemaVersion === "cinejelly.short-director.v1" &&
    reviewRequiredPlan.directorPlan.recommendedWorkflowMode === "storyboard_multishot" &&
    reviewRequiredPlan.directorPlan.reviewPolicy.checkpointPolicy === "pause_before_provider_spend" &&
    reviewRequiredPlan.directorPlan.referencePolicy.sourceVideoControlsStructureOnly === true &&
    pendingRenderHandoff.request.metadata?.shortDirectorPlanId === reviewRequiredPlan.directorPlan.directorId
    ? pass("short_director_plan_integrated", "Short Director V2 emits hook/pacing/reference/review policy and flows into render handoff metadata.")
    : fail("short_director_plan_integrated", "Expected Short Director V2 plan evidence and handoff lineage metadata."),
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
  fallbackMiniCapability?.resolutions.length === 2 &&
    fallbackMiniCapability.resolutions.includes("480p") &&
    fallbackMiniCapability.resolutions.includes("720p") &&
    !fallbackMiniCapability.resolutions.includes("1080p") &&
    !fallbackMiniCapability.resolutions.some((resolution) => resolution.endsWith("-SR")) &&
    fallbackStandardCapability?.resolutions.includes("1080p-SR")
    ? pass("seedance_mini_fallback_capability_guard", "Atlas fallback capabilities keep Seedance Mini on 480p/720p only while broader tiers retain higher/SR options.")
    : fail("seedance_mini_fallback_capability_guard", "Expected fallback capability mapping to prevent Mini from advertising unsupported high/SR resolutions."),
  authorizedSourceVideoPrompt.videoRequest.references.some((reference) => reference.role === "source_video_structure" && reference.kind === "video") &&
    authorizedSourceVideoPrompt.videoRequest.mode === "reference_to_video" &&
    authorizedSourceVideoPrompt.prompt.startsWith("Reference handles: @image1 -> identity/image=Remake KOL; @image2 -> product/image=Remake serum pack; @video1 -> source_video_structure/video=Approved trend source video.") &&
    authorizedSourceVideoPrompt.prompt.includes("Seedance mode contract: reference-to-video") &&
    authorizedSourceVideoPrompt.prompt.includes("Source/reference-video boundary:") &&
    authorizedSourceVideoPrompt.prompt.includes("@image1 -> identity/image") &&
    authorizedSourceVideoPrompt.prompt.includes("@image2 -> product/image") &&
    authorizedSourceVideoPrompt.prompt.includes("@video1 -> source_video_structure/video") &&
    authorizedSourceVideoPrompt.prompt.includes("Primary anchors: lock identity, product, and endpoint references before style, motion, camera, audio, or source-video structure.") &&
    authorizedSourceVideoPrompt.prompt.includes("Supporting references (@video1) guide rhythm, camera, style, and audio only after primary anchors are stable.") &&
    authorizedSourceVideoPrompt.prompt.includes("Use source/reference video only for rhythm") &&
    authorizedSourceVideoPrompt.negativePrompt.includes("no copied source-video face identity") &&
    authorizedSourceVideoPrompt.negativePrompt.includes("no copied source-video transcript") &&
    authorizedSourceVideoPrompt.negativePrompt.includes("no copied source-video music or melody") &&
    authorizedSourceVideoPrompt.negativePrompt.includes("no source-video watermark, caption style, logo, or brand marks") &&
    planningOnlySourceVideoPrompt.videoRequest.references.every((reference) => reference.role !== "source_video_structure") &&
    planningOnlySourceVideoPrompt.prompt.startsWith("Reference handles: @image1 -> identity/image=Remake KOL; @image2 -> product/image=Remake serum pack.") &&
    !planningOnlySourceVideoPrompt.prompt.includes("@video1 -> source_video_structure/video") &&
    planningOnlySourceVideoPrompt.bindingPlan.conflicts.some((conflict) => conflict.code === "source_video_structure_planning_only") &&
    planningOnlySourceVideoPrompt.prompt.includes("Planning-only references:") &&
    planningOnlySourceVideoPrompt.prompt.includes("Source/reference-video boundary:") &&
    planningOnlySourceVideoPrompt.negativePrompt.includes("no copied source-video transcript")
    ? pass("source_video_authorized_provider_binding", "Authorized source-video structure references compile as reference-to-video provider inputs with front-loaded @image/@video handle bindings, primary-anchor priority, source-boundary prompt/negative-prompt contracts, while unapproved source-video references stay planning-only without a provider @video handle.")
    : fail("source_video_authorized_provider_binding", "Expected source-video provider binding to require authorization, provider video capability, reference-to-video mode, front-loaded @image/@video handle bindings, primary-anchor priority, source-boundary prompt/negative-prompt contract, and planning-only source-video prompt constraints."),
  providerFamilyLimitPrompt.videoRequest.references.filter((reference) => reference.kind === "video" || reference.role === "source_video_structure").length === 3 &&
    providerFamilyLimitPrompt.prompt.includes("@video1 -> source_video_structure/video=Trend source video 1") &&
    providerFamilyLimitPrompt.prompt.includes("@video2 -> source_video_structure/video=Trend source video 2") &&
    providerFamilyLimitPrompt.prompt.includes("@video3 -> source_video_structure/video=Trend source video 3") &&
    !providerFamilyLimitPrompt.prompt.includes("@video4") &&
    providerFamilyLimitPrompt.bindingPlan.conflicts.filter((conflict) => conflict.code === "provider_reference_family_limit_exceeded").length === 2 &&
    providerFamilyLimitPrompt.bindingPlan.roleScopes.filter((scope) => scope.role === "source_video_structure" && !scope.providerIncluded).length === 2
    ? pass("provider_reference_family_limit_guard", "Prompt binding caps provider video references at Atlas's documented family limit so prompts never mention @video handles that are absent from provider payload arrays.")
    : fail("provider_reference_family_limit_guard", "Expected provider binding to keep only three video handles, retain overflow source videos as planning-only references, and record family-limit conflicts."),
  cleanHttpsReferencePlan.mediaReferencePlan.filter((reference) =>
    ["identity", "product", "source_video_structure"].includes(reference.promptRole)
  ).every((reference) =>
    reference.includeInProviderHandoff === true &&
      reference.uriPolicy === "clean_https_hashed" &&
      !reference.providerUri &&
      !reference.providerAssetId
  ) &&
    cleanHttpsReferenceHandoff.request.references?.some((reference) => reference.role === "identity" && reference.providerReference.uri.startsWith("https://")) &&
    cleanHttpsReferenceHandoff.request.references?.some((reference) => reference.role === "product" && reference.providerReference.uri.startsWith("https://")) &&
    cleanHttpsReferenceHandoff.request.references?.some((reference) => reference.role === "source_video_structure" && reference.providerReference.kind === "video" && reference.providerReference.uri.startsWith("https://"))
    ? pass("clean_https_media_provider_handoff", "Operator-approved clean HTTPS KOL, product, and source-video references stay hashed in the plan and reach provider handoff only from the raw render input.")
    : fail("clean_https_media_provider_handoff", "Expected clean HTTPS media references to remain redacted in the plan and reach render handoff after operator approval."),
  privateMediaReferencePlan.mediaReferencePlan.length === 3 &&
    privateMediaReferencePlan.mediaReferencePlan.every((reference) =>
      reference.status === "blocked" &&
        reference.uriPolicy === "blocked_unsafe_or_private" &&
        reference.includeInProviderHandoff === false &&
        reference.issues.includes("unsafe_or_private_media_reference")
    ) &&
    privateMediaReferenceHandoff.request.references === undefined
    ? pass("private_media_references_blocked_before_handoff", "Private/internal KOL, product, and source-video media references are blocked before provider handoff even when marked operator-approved.")
    : fail("private_media_references_blocked_before_handoff", "Expected private/internal media references to be blocked before provider handoff."),
  [pendingRenderHandoff, cleanHttpsReferenceHandoff, productionBibleRenderHandoff].every((handoff) =>
    handoff.request.userInput.includes("Seamless multishot edit contract:") &&
      handoff.request.userInput.includes("start from the prior endpoint") &&
      handoff.request.userInput.includes("room tone") &&
      handoff.request.userInput.includes("stable product/KOL/result handle")
  ) &&
    cleanHttpsReferenceHandoff.request.userInput.includes("For Video Remake, inherit source rhythm and performance timing only")
    ? pass("short_handoff_seamless_edit_contract", "Short render handoff carries a multishot continuity contract for normal short, Video Remake, and Production Bible workflows before StoryArchitect/ShotPlanner.")
    : fail("short_handoff_seamless_edit_contract", "Expected short render handoff prompts to preserve seamless multishot edit contracts and Video Remake boundary rules."),
  hasEveryReviewSurface(reviewRequiredPlan)
    ? pass("review_surfaces_present", "Scene, audio, no-visible-text, and claim checkpoints are present before render.")
    : fail("review_surfaces_present", "Expected scene, audio, no-visible-text, and claim checkpoints."),
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
    pendingRenderHandoff.request.captionCues?.length === 0 &&
    pendingRenderHandoff.request.captionOptions?.enabled === false &&
    pendingRenderHandoff.request.captionOptions?.burnIn === false &&
    pendingRenderHandoff.request.metadata?.shortOnScreenTextAllowed === "false" &&
    pendingRenderHandoff.request.metadata?.shortCaptionBurnInAllowed === "false" &&
    pendingRenderHandoff.request.metadata?.shortCtaCardsAllowed === "false" &&
    pendingRenderHandoff.request.generatedAudioIntents?.length === reviewRequiredPlan.scenes.length &&
    pendingRenderHandoff.request.generatedAudioIntents?.every((intent) => intent.language === reviewRequiredPlan.audioPolicy.language) &&
    pendingRenderHandoff.request.settings?.audioMode === "hybrid" &&
    pendingRenderHandoff.request.userInput.includes("Scene plan:") &&
    pendingRenderHandoff.request.userInput.includes("No visible text") &&
    pendingRenderHandoff.request.userInput.includes("Visual Bible image prompt packs:") &&
    pendingRenderHandoff.request.userInput.includes("single_image_reference_sheet") &&
    pendingRenderHandoff.request.userInput.includes("Image prompt:") &&
    pendingRenderHandoff.request.userInput.includes("Negative prompt:") &&
    pendingRenderHandoff.request.userInput.includes("Seedance binding:") &&
    !reviewInputCanQueueRender(pendingRenderHandoff.reviewApproval) &&
    !rawUrlLeaked
    ? pass("render_handoff_request_contract", "Short plan can become a redacted render request with no caption burn-in, generated-audio intents, Visual Bible image prompt packs, lineage metadata, and pending review still blocking queue.")
    : fail("render_handoff_request_contract", "Expected short-plan render handoff to preserve lineage, no-visible-text policy, generated-audio intents, Visual Bible image prompt packs, redaction, and pending review block."),
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
  pipeMatrixExpected.every(([key, expectedMode, expectedBackendPipe]) => {
    const plan = pipeMatrixPlans[key];
    const recommendedOptions = plan.videoPipePlan.pipeOptions.filter((option) => option.recommended);
    return plan.videoPipePlan.selectedMode === expectedMode &&
      plan.videoPipePlan.selectedBackendPipe === expectedBackendPipe &&
      recommendedOptions.length === 1 &&
      recommendedOptions[0]?.mode === expectedMode &&
      recommendedOptions[0]?.backendPipe === expectedBackendPipe;
  })
    ? pass("video_pipe_routing_matrix", "Short backend selects the correct product-level pipe for smart short, Product/KOL UGC, storyboard multishot, Video Remake, and Production Bible scenarios.")
    : fail("video_pipe_routing_matrix", "Expected each product-level pipe scenario to select exactly one matching backend pipe."),
  productKolPipePlan.videoPipePlan.visualBibleAlignment.status === "aligned" &&
    storyboardPipePlan.videoPipePlan.visualBibleAlignment.status === "storyboard_until_references" &&
    storyboardPipePlan.videoPipePlan.selectionReasonCodes.includes("visual_bible_product_reference_needs_assets") &&
    productionBiblePipePlan.videoPipePlan.visualBibleAlignment.status === "aligned" &&
    Object.values(pipeMatrixPlans).every((plan) => plan.videoPipePlan.selectionReasonCodes.length > 0)
    ? pass("video_pipe_visual_bible_alignment_contract", "Video pipe plans explain when Visual Bible matches the canonical pipe and when storyboard is used until product/KOL references are supplied.")
    : fail("video_pipe_visual_bible_alignment_contract", "Expected video pipe plans to expose visual-bible alignment and selection reason codes."),
  canonicalPipeOptions.length === 5 &&
    canonicalPipeOptions.every((option) => {
      const expected = expectedPipeDurations.get(option.mode);
      return Boolean(expected) &&
        option.durationSupport.minSeconds === expected[0] &&
        option.durationSupport.maxSeconds === expected[1] &&
        option.durationSupport.idealRangeSeconds[0] === expected[2] &&
        option.durationSupport.idealRangeSeconds[1] === expected[3] &&
        option.durationSupport.supportsLongSequence === expected[4];
    })
    ? pass("video_pipe_duration_support_matrix", "Every short video pipe publishes its exact supported duration band and long-sequence capability.")
    : fail("video_pipe_duration_support_matrix", "Expected all five video pipes to expose stable min/max/ideal duration support."),
  Object.values(pipeMatrixPlans).every((plan) =>
    plan.videoPipePlan.pipeOptions.every((option) => {
      const selected = option.mode === plan.videoPipePlan.selectedMode;
      return requiredPipeSettingIds.every((settingId) => option.settings.some((setting) => setting.settingId === settingId)) &&
        option.defaultResolution === "720p" &&
        option.audioDefault === plan.seedanceRouting.generatedAudioMode &&
        option.returnLastFrameDefault === plan.seedanceRouting.returnLastFrame &&
        (!selected || (
          option.effectiveSettings?.resolvedForCurrentPlan === true &&
          option.effectiveSettings.providerMode === plan.seedanceRouting.recommendedProviderMode &&
          option.effectiveSettings.tier === plan.seedanceRouting.preferredTier &&
          option.effectiveSettings.resolution === plan.seedanceRouting.resolution &&
          option.effectiveSettings.bitrateMode === plan.seedanceRouting.bitrateMode &&
          option.effectiveSettings.superResolution === plan.seedanceRouting.superResolution &&
          option.effectiveSettings.audioMode === plan.seedanceRouting.generatedAudioMode &&
          option.effectiveSettings.returnLastFrame === plan.seedanceRouting.returnLastFrame &&
          option.effectiveSettings.promptRecipeName === plan.seedanceRouting.promptRecipe.name
        )) &&
        (selected || option.effectiveSettings === undefined) &&
        option.settings.some((setting) => setting.settingId === "resolution" && setting.userAdjustable === true && setting.backendManaged === false) &&
        option.settings.some((setting) => setting.settingId === "provider_mode" && setting.userAdjustable === false && setting.backendManaged === true) &&
        option.settings.some((setting) => setting.settingId === "audio_mode" && setting.userAdjustable === true && setting.backendManaged === true);
    })
  )
    ? pass("video_pipe_settings_contract", "Each pipe carries default navigation settings plus selected-pipe effective model, resolution, audio, and return-last-frame settings.")
    : fail("video_pipe_settings_contract", "Expected every pipe option to expose complete settings and the selected pipe to match effective Seedance routing."),
  Object.entries(pipeMatrixPlans).every(([key, plan]) => {
    const expected = expectedVisualBibleExecutionModes.get(key);
    const blueprint = plan.visualBiblePlan.executionBlueprint;
    return Boolean(expected) &&
      blueprint.schemaVersion === "cinejelly.short-visual-bible-execution-blueprint.v1" &&
      blueprint.mode === expected[0] &&
      blueprint.seedanceSubmissionMode === expected[1] &&
      blueprint.clipExecutionStrategy === expected[2] &&
      blueprint.durationCoverage.targetDurationSeconds === plan.intent.targetDurationSeconds &&
      blueprint.durationCoverage.targetClipCount === plan.visualBiblePlan.sequencePlan.targetClipCount &&
      blueprint.steps.length >= 3 &&
      (blueprint.mode === "text_only_no_board" || blueprint.referenceTagBindingOrder.length > 0) &&
      blueprint.steps.some((step) => step.stage === "seedance_clip_rendering") &&
      blueprint.steps.some((step) => step.stage === "continuity_review" && step.requiresHumanApproval === true);
  })
    ? pass("visual_bible_execution_blueprint_contract", "Every pipe emits a structured reference-board/Seedance execution blueprint with mode, clip strategy, binding order, duration coverage, render step, and review step.")
    : fail("visual_bible_execution_blueprint_contract", "Expected all five pipe scenarios to expose a complete visual-bible execution blueprint."),
  Object.values(pipeMatrixPlans).every((plan) => visualBibleImagePromptPacksReady(plan))
    ? pass("visual_bible_image_prompt_pack_contract", "Visual Bible assets carry provider-neutral image prompt packs with layout, negative prompt, Seedance binding instruction, and approval checklist.")
    : fail("visual_bible_image_prompt_pack_contract", "Expected every Visual Bible asset to expose a complete image prompt pack before Seedance handoff."),
  smartShortPipePlan.seedanceRouting.recommendedProviderMode === "text_to_video" &&
    smartShortPipePlan.visualBiblePlan.status === "not_needed" &&
    smartShortPipePlan.visualBiblePlan.recommendedPipe === "normal_short_pipe" &&
    productKolPipePlan.seedanceRouting.recommendedProviderMode === "reference_to_video" &&
    productKolPipePlan.seedanceRouting.resolution === "1080p-SR" &&
    productKolPipePlan.seedanceRouting.superResolution === true &&
    productKolPipePlan.seedanceRouting.bitrateMode === "high" &&
    productKolPipePlan.videoPipePlan.pipeOptions.find((option) => option.mode === "product_kol_ugc")?.defaultResolution === "720p" &&
    productKolPipePlan.videoPipePlan.pipeOptions.find((option) => option.mode === "product_kol_ugc")?.effectiveSettings?.resolution === "1080p-SR" &&
    productKolPipePlan.seedanceRouting.generatedAudioMode === "hybrid" &&
    productKolPipePlan.seedanceRouting.referenceTags.some((tag) => tag.role === "identity" && tag.tag === "@image1") &&
    productKolPipePlan.seedanceRouting.referenceTags.some((tag) => tag.role === "product") &&
    videoRemakePipePlan.seedanceRouting.promptRecipe.name === "reference_to_video_remake_blueprint" &&
    videoRemakePipePlan.referenceRemakeBlueprint?.reviewRequiredBeforeRender === true &&
    videoRemakePipePlan.mediaReferencePlan.some((reference) => reference.promptRole === "source_video_structure") &&
    productionBiblePipePlan.videoPipePlan.pipeOptions.some((option) => option.mode === "production_bible" && option.durationSupport.supportsLongSequence === true) &&
    productionBiblePipePlan.visualBiblePlan.recommendedPipe === "long_sequence_bible_pipe" &&
    productionBiblePipePlan.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved === true
    ? pass("video_pipe_model_reference_contract", "Smart short stays text-to-video without references, while reference-heavy pipes select reference-to-video routing with 720p default, hybrid audio, @image bindings, Video Remake blueprint review, and Production Bible asset gating.")
    : fail("video_pipe_model_reference_contract", "Expected Smart Short text-to-video routing plus Product/KOL, Video Remake, and Production Bible model/reference/gating contracts."),
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
  shortStoryboardShots.length === 3 &&
    shortStoryboardShots.every((shot) => (shot.timeline?.length ?? 0) === 3) &&
    compiledShortStoryboardPrompts.every((prompt) => prompt.prompt.includes("Seedance mode contract:") && prompt.prompt.includes("Runtime contract:") && prompt.prompt.includes("Timeline:")) &&
  compiledShortStoryboardPrompts.every((prompt) =>
    // Compacted prompt anatomy (live-render forensics): the old Pacing/Motion-continuity/Inter-shot
    // bridge/Boundary-choreography quartet merged into single Runtime + Boundary contracts.
    prompt.prompt.includes("Runtime contract:") &&
    prompt.prompt.includes("Boundary: this clip must cut together with adjacent clips as one continuous film.") &&
    prompt.prompt.includes("do not rely on postproduction crossfade to hide mismatched endpoints") &&
    prompt.prompt.includes("Final-frame contract:")
  ) &&
    compiledShortStoryboardPrompts.every((prompt) => prompt.negativePrompt.includes("no visible captions") && prompt.negativePrompt.includes("no frozen static product pose")) &&
    shortStoryboardShots[0]?.continuity.nextShotStartState &&
    shortStoryboardShots[1]?.continuity.previousShotEndState &&
    shortStoryboardShots[1]?.continuity.nextShotStartState &&
    shortStoryboardShots[2]?.continuity.previousShotEndState &&
    compiledShortStoryboardPrompts.every((prompt) => prompt.videoRequest.settings.generateAudio === true) &&
    compiledShortStoryboardPrompts.every((prompt) =>
      prompt.prompt.includes("Audio production plan:") &&
      prompt.prompt.includes("Generate only original ambience/music/voice on this shot's timing") &&
      prompt.prompt.includes("Keep narration under about") &&
      prompt.prompt.includes("words for this beat") &&
      !prompt.prompt.includes("Audio: Silent")
    )
    ? pass("short_storyboard_pacing_audio_prompt_contract", "Short storyboard prompts include provider mode, duration-aware timeline beats, clean pacing/motion/edit/choreography/end-frame guidance, adjacent shot state, and duration-budgeted audio-on provider settings by default.")
    : fail("short_storyboard_pacing_audio_prompt_contract", "Expected short storyboard prompt compilation to include provider mode, timeline, pacing, motion/edit/choreography/end-frame guidance, adjacent shot state, and duration-budgeted enabled audio."),
  pendingRenderHandoff.request.metadata?.workflowMode === "storyboard" &&
    pendingRenderHandoff.request.metadata?.renderMode === "storyboard_multishot" &&
    pendingRenderHandoff.request.metadata?.shortPipelineRecommendedWorkflowMode === "storyboard_multishot"
    ? pass("storyboard_handoff_mode_metadata", "Longer short handoff declares storyboard/multishot workflow metadata before provider spend.")
    : fail("storyboard_handoff_mode_metadata", "Expected >15s handoff to declare storyboard/multishot workflow metadata."),
  productionBibleRenderHandoff.request.settings?.durationTargetSeconds === 90 &&
    productionBibleRenderHandoff.request.metadata?.workflowMode === "sequence" &&
    productionBibleRenderHandoff.request.metadata?.renderMode === "production_bible" &&
    productionBibleRenderHandoff.request.metadata?.shortVideoPipeSelectedMode === "production_bible" &&
    productionBibleRenderHandoff.request.metadata?.shortVideoPipeSelectedBackendPipe === "long_sequence_bible_pipe" &&
    productionBibleRenderHandoff.request.metadata?.shortVideoPipeDurationMaxSeconds === "480" &&
    productionBibleRenderHandoff.request.metadata?.shortVideoPipeSupportsLongSequence === "true" &&
    productionBibleRenderHandoff.request.metadata?.shortVideoPipeTargetWithinDurationRange === "true" &&
    productionBibleRenderHandoff.request.metadata?.shortVisualBibleBlocksRender === "true" &&
  productionBibleRenderHandoff.summary.canUseAsRenderJobHandoff === false
    ? pass("production_bible_handoff_duration_and_asset_gate", "90s Production Bible handoff carries selected-pipe duration metadata and remains blocked until Visual Bible assets are approved.")
    : fail("production_bible_handoff_duration_and_asset_gate", "Expected Production Bible handoff to expose sequence metadata, selected-pipe duration range, and Visual Bible render block."),
  productionBibleMaxDurationPipePlan.intent.targetDurationSeconds === 480 &&
    productionBibleMaxDurationPipePlan.videoPipePlan.selectedMode === "production_bible" &&
    productionBibleMaxDurationPipePlan.videoPipePlan.selectedBackendPipe === "long_sequence_bible_pipe" &&
    productionBibleMaxDurationPipePlan.visualBiblePlan.sequencePlan.targetClipCount >= 32 &&
    productionBibleMaxDurationPipePlan.visualBiblePlan.executionBlueprint.durationCoverage.targetDurationSeconds === 480 &&
    productionBibleMaxDurationPipePlan.visualBiblePlan.executionBlueprint.durationCoverage.targetClipCount === productionBibleMaxDurationPipePlan.visualBiblePlan.sequencePlan.targetClipCount &&
    productionBibleMaxDurationRenderHandoff.request.settings?.durationTargetSeconds === 480 &&
    productionBibleMaxDurationRenderHandoff.request.metadata?.workflowMode === "sequence" &&
    productionBibleMaxDurationRenderHandoff.request.metadata?.renderMode === "production_bible" &&
    productionBibleMaxDurationRenderHandoff.request.metadata?.shortVideoPipeDurationMaxSeconds === "480" &&
    productionBibleMaxDurationRenderHandoff.request.metadata?.shortVideoPipeTargetWithinDurationRange === "true" &&
    productionBibleMaxDurationRenderHandoff.request.metadata?.shortVideoPipeSupportsLongSequence === "true" &&
    productionBibleMaxDurationRenderHandoff.summary.canUseAsRenderJobHandoff === false
    ? pass("production_bible_max_duration_boundary", "480s Production Bible stays in the long-sequence pipe, exposes full duration coverage, and remains asset-gated before spend.")
    : fail("production_bible_max_duration_boundary", "Expected 480s Production Bible to preserve long-sequence pipe routing, coverage, and asset-gated handoff."),
  audioCheckpointTargetDuration(reviewRequiredPlan) === reviewRequiredPlan.intent.targetDurationSeconds
    ? pass("audio_checkpoint_uses_intent_duration", "Audio review evidence now records the requested short duration instead of deriving a rough scene-count duration.")
    : fail("audio_checkpoint_uses_intent_duration", "Expected audio checkpoint evidence to use the plan target duration."),
  vietnameseAudioPlan.audioPolicy.mode === "voiceover" &&
    vietnameseAudioPlan.audioPolicy.language === "vi" &&
    vietnameseAudioPlan.audioPolicy.renderAudioMode === "hybrid" &&
    vietnameseAudioPlan.audioPolicy.nativeProviderAudioEnabled === true &&
    vietnameseAudioHandoff.request.settings?.audioMode === "hybrid" &&
    vietnameseAudioHandoff.request.generatedAudioIntents?.length === vietnameseAudioPlan.scenes.length &&
    vietnameseAudioHandoff.request.generatedAudioIntents?.every((intent) => intent.language === "vi") &&
    chineseAudioHandoff.request.settings?.audioMode === "hybrid" &&
    chineseAudioHandoff.request.generatedAudioIntents?.length === vietnameseAudioPlan.scenes.length &&
    chineseAudioHandoff.request.generatedAudioIntents?.every((intent) => intent.language === "zh") &&
    audioOffHandoff.request.settings?.audioMode === "none" &&
    audioOffHandoff.summary.generatedAudioIntentCount === 0 &&
    audioOffHandoff.request.generatedAudioIntents === undefined
    ? pass("short_audio_language_and_off_policy", "Short handoff supports Vietnamese/Chinese hybrid model-audio plus TTS-ready script cues, and explicit audio-off mode.")
    : fail("short_audio_language_and_off_policy", "Expected multilingual hybrid audio and explicit audio-off handoff policies.")
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
    scenarioCount: 11,
    pipeScenarioCount: pipeMatrixExpected.length,
    endpointPath: "/v1/short-pipeline/plan",
    renderHandoffEndpointPath: "/v1/short-pipeline/render-jobs",
    rawUrlLeakCheckPassed: !rawUrlLeaked
  },
  scenarios: {
    reviewRequired: summarizePlan(reviewRequiredPlan),
    blocked: summarizePlan(blockedPlan),
    naturalOnly: summarizePlan(naturalOnlyPlan),
    cleanHttpsReferences: summarizeCleanHttpsReferences(cleanHttpsReferencePlan, cleanHttpsReferenceHandoff),
    privateMediaReferences: summarizePrivateMediaReferences(privateMediaReferencePlan, privateMediaReferenceHandoff),
    pipeMatrix: summarizePipeMatrix(pipeMatrixPlans),
    renderHandoff: summarizeHandoff(pendingRenderHandoff, approvedRenderHandoff),
    productionBibleRenderHandoff: summarizeProductionBibleHandoff(productionBibleRenderHandoff),
    productionBibleMaxDuration: summarizeProductionBibleBoundary(productionBibleMaxDurationPipePlan, productionBibleMaxDurationRenderHandoff),
    audioPolicies: {
      vietnamesePlanLanguage: vietnameseAudioPlan.audioPolicy.language,
      vietnameseHandoffAudioMode: vietnameseAudioHandoff.request.settings?.audioMode,
      vietnameseIntentCount: vietnameseAudioHandoff.summary.generatedAudioIntentCount,
      chineseHandoffAudioMode: chineseAudioHandoff.request.settings?.audioMode,
      chineseIntentLanguage: chineseAudioHandoff.request.generatedAudioIntents?.[0]?.language,
      audioOffHandoffAudioMode: audioOffHandoff.request.settings?.audioMode,
      audioOffIntentCount: audioOffHandoff.summary.generatedAudioIntentCount
    },
    shortStoryboardPromptContractDiagnostics
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

function sourceVideoBindingShot(mode) {
  const authorized = mode === "authorized";
  return {
    shotId: `source_video_binding_${mode}`,
    durationSeconds: 8,
    intent: "prove source-video remake binding without provider spend",
    subject: "approved KOL demonstrates the replacement serum using source-video rhythm only",
    action: "match the uploaded trend rhythm, camera push, hand timing, and payoff endpoint while replacing performer, product, background, voice, music, captions, and claims",
    camera: "handheld mirror-to-macro push with a clean final product-in-hand frame",
    lighting: "soft bathroom vanity light with stable skin tone and product highlights",
    audioIntent: "guided original voiceover with new licensed audio energy",
    transitionIntent: "start from the source rhythm and end on a stable transition handle",
    timeline: [
      { startSecond: 0, endSecond: 2, action: "KOL enters the same rhythm with new product context" },
      { startSecond: 2, endSecond: 6, action: "serum texture proof and hand motion replace the source product" },
      { startSecond: 6, endSecond: 8, action: "settle on original payoff frame with replacement product visible" }
    ],
    references: [
      promptReference("identity", "Remake KOL", "image", "asset://short-pipeline/remake-kol", "primary", true),
      promptReference("product", "Remake serum pack", "image", "asset://short-pipeline/remake-serum-pack", "primary", true),
      promptReference("source_video_structure", "Approved trend source video", "video", "asset://short-pipeline/approved-serum-trend", "supporting", authorized)
    ],
    continuity: {
      identity: "Remake KOL",
      product: "Glow Focus Serum",
      environment: "approved bathroom vanity"
    },
    risks: ["face", "product_logo", "transition"],
    metadata: {
      storyArcRole: "video remake proof"
    }
  };
}

function sourceVideoFamilyLimitShot() {
  return {
    ...sourceVideoBindingShot("authorized"),
    shotId: "source_video_family_limit",
    references: [
      promptReference("identity", "Limit KOL", "image", "asset://short-pipeline/limit-kol", "primary", true),
      promptReference("product", "Limit serum pack", "image", "asset://short-pipeline/limit-serum-pack", "primary", true),
      ...Array.from({ length: 5 }, (_, index) =>
        promptReference(
          "source_video_structure",
          `Trend source video ${index + 1}`,
          "video",
          `asset://short-pipeline/trend-source-${index + 1}`,
          "supporting",
          true
        )
      )
    ]
  };
}

function promptReference(role, label, kind, uri, priority, authorized) {
  const providerAssetId = uri.startsWith("asset://") ? uri.slice("asset://".length) : undefined;
  return {
    role,
    label,
    priority,
    providerReference: {
      kind,
      uri,
      role,
      ...(providerAssetId ? { providerAssetId } : {}),
      label
    },
    selection: {
      authorized
    }
  };
}

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

function summarizeCleanHttpsReferences(plan, handoff) {
  const planned = plan.mediaReferencePlan.filter((reference) =>
    ["identity", "product", "source_video_structure"].includes(reference.promptRole)
  );
  const handoffReferences = handoff.request.references ?? [];
  return {
    planId: plan.planId,
    plannedReferenceCount: planned.length,
    plannedProviderHandoffCount: planned.filter((reference) => reference.includeInProviderHandoff).length,
    plannedCleanHttpsCount: planned.filter((reference) => reference.uriPolicy === "clean_https_hashed").length,
    plannedProviderUriCount: planned.filter((reference) => Boolean(reference.providerUri)).length,
    plannedProviderAssetIdCount: planned.filter((reference) => Boolean(reference.providerAssetId)).length,
    handoffReferenceCount: handoffReferences.length,
    handoffCleanHttpsRoleCount: handoffReferences.filter((reference) =>
      ["identity", "product", "source_video_structure"].includes(reference.role) &&
        reference.providerReference.uri.startsWith("https://")
    ).length,
    sourceVideoHandoffPresent: handoffReferences.some((reference) =>
      reference.role === "source_video_structure" &&
        reference.providerReference.kind === "video" &&
        reference.providerReference.uri.startsWith("https://")
    )
  };
}

function summarizePrivateMediaReferences(plan, handoff) {
  return {
    planId: plan.planId,
    plannedReferenceCount: plan.mediaReferencePlan.length,
    blockedReferenceCount: plan.mediaReferencePlan.filter((reference) => reference.status === "blocked").length,
    providerHandoffCount: plan.mediaReferencePlan.filter((reference) => reference.includeInProviderHandoff).length,
    handoffReferenceCount: handoff.request.references?.length ?? 0,
    uriPolicies: plan.mediaReferencePlan.map((reference) => reference.uriPolicy)
  };
}

function summarizePipeMatrix(plans) {
  return Object.fromEntries(
    Object.entries(plans).map(([name, plan]) => {
      const selectedPipe = plan.videoPipePlan.pipeOptions.find((option) => option.mode === plan.videoPipePlan.selectedMode);
      return [
        name,
        {
        planId: plan.planId,
        selectedMode: plan.videoPipePlan.selectedMode,
        selectedBackendPipe: plan.videoPipePlan.selectedBackendPipe,
        selectionReasonCodeCount: plan.videoPipePlan.selectionReasonCodes.length,
        visualBibleAlignmentStatus: plan.videoPipePlan.visualBibleAlignment.status,
        visualBibleAlignmentExplanation: plan.videoPipePlan.visualBibleAlignment.explanation,
        recommendedPipeCount: plan.videoPipePlan.pipeOptions.filter((option) => option.recommended).length,
        seedanceMode: plan.seedanceRouting.recommendedProviderMode,
        resolution: plan.seedanceRouting.resolution,
        bitrateMode: plan.seedanceRouting.bitrateMode,
        superResolution: plan.seedanceRouting.superResolution,
        generatedAudioMode: plan.seedanceRouting.generatedAudioMode,
        selectedPipeDefaultResolution: selectedPipe?.defaultResolution,
        selectedPipeEffectiveResolution: selectedPipe?.effectiveSettings?.resolution,
        selectedPipeEffectiveBitrateMode: selectedPipe?.effectiveSettings?.bitrateMode,
        selectedPipeEffectiveSuperResolution: selectedPipe?.effectiveSettings?.superResolution,
        selectedPipeEffectiveProviderMode: selectedPipe?.effectiveSettings?.providerMode,
        selectedPipeEffectivePromptRecipeName: selectedPipe?.effectiveSettings?.promptRecipeName,
        visualBibleRecommendedPipe: plan.visualBiblePlan.recommendedPipe,
        visualBibleExecutionMode: plan.visualBiblePlan.executionBlueprint.mode,
        visualBibleSeedanceSubmissionMode: plan.visualBiblePlan.executionBlueprint.seedanceSubmissionMode,
        visualBibleClipStrategy: plan.visualBiblePlan.executionBlueprint.clipExecutionStrategy,
        visualBibleReferenceBindingOrderCount: plan.visualBiblePlan.executionBlueprint.referenceTagBindingOrder.length,
        visualBibleExecutionStepCount: plan.visualBiblePlan.executionBlueprint.steps.length,
        visualBibleDurationCoverageRule: plan.visualBiblePlan.executionBlueprint.durationCoverage.coverageRule,
        visualBibleBlocksRenderUntilAssetsApproved: plan.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved,
        referenceTagRoles: plan.seedanceRouting.referenceTags.map((tag) => tag.role),
        sourceVideoReferencePresent: plan.mediaReferencePlan.some((reference) => reference.promptRole === "source_video_structure"),
        pipeOptionCount: plan.videoPipePlan.pipeOptions.length
      }
      ];
    })
  );
}

function visualBibleImagePromptPacksReady(plan) {
  const assets = plan.visualBiblePlan.assetPlans ?? [];
  if (plan.visualBiblePlan.status === "not_needed") {
    return assets.length === 0;
  }
  const assetPacksReady = assets.length > 0 && assets.every((asset) => {
    const pack = asset.imagePromptPack;
    return pack?.schemaVersion === "cinejelly.short-visual-bible-image-prompt.v1" &&
      pack.provider === "provider_neutral_image_model" &&
      pack.outputPolicy === "single_image_reference_sheet" &&
      pack.minPanelOrViewCount === asset.minimumViewCount &&
      pack.maxPanelOrViewCount === asset.maximumImageCount &&
      typeof pack.prompt === "string" &&
      pack.prompt.includes("Seedance") &&
      pack.prompt.includes("single image reference sheet") &&
      typeof pack.negativePrompt === "string" &&
      pack.negativePrompt.includes("visible text") &&
      pack.negativePrompt.includes("watermarks") &&
      typeof pack.seedanceBindingInstruction === "string" &&
      pack.seedanceBindingInstruction.includes("Seedance") &&
      Array.isArray(pack.approvalChecklist) &&
      pack.approvalChecklist.length >= 4 &&
      pack.approvalChecklist.some((item) => item.includes("visible captions"));
  });
  const imageModelStepsReady = plan.visualBiblePlan.executionBlueprint.steps
    .filter((step) => step.stage === "reference_asset_planning")
    .every((step) =>
      step.instruction.includes("Image prompt:") &&
      step.instruction.includes("Negative prompt:") &&
      step.instruction.includes("Seedance binding:") &&
      step.instruction.includes("Approval checklist:")
    );
  return assetPacksReady && imageModelStepsReady;
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

function summarizeProductionBibleHandoff(handoff) {
  return {
    planId: handoff.summary.planId,
    canUseAsRenderJobHandoff: handoff.summary.canUseAsRenderJobHandoff,
    requestDurationSeconds: handoff.request.settings?.durationTargetSeconds,
    workflowMode: handoff.request.metadata?.workflowMode,
    renderMode: handoff.request.metadata?.renderMode,
    selectedMode: handoff.request.metadata?.shortVideoPipeSelectedMode,
    selectedBackendPipe: handoff.request.metadata?.shortVideoPipeSelectedBackendPipe,
    selectedPipeDurationMaxSeconds: Number(handoff.request.metadata?.shortVideoPipeDurationMaxSeconds ?? 0),
    selectedPipeSupportsLongSequence: handoff.request.metadata?.shortVideoPipeSupportsLongSequence === "true",
    targetWithinSelectedPipeDurationRange: handoff.request.metadata?.shortVideoPipeTargetWithinDurationRange === "true",
    visualBibleBlocksRender: handoff.request.metadata?.shortVisualBibleBlocksRender === "true",
    releaseBlocker: handoff.summary.releaseBlocker
  };
}

function summarizeProductionBibleBoundary(plan, handoff) {
  return {
    planId: plan.planId,
    targetDurationSeconds: plan.intent.targetDurationSeconds,
    selectedMode: plan.videoPipePlan.selectedMode,
    selectedBackendPipe: plan.videoPipePlan.selectedBackendPipe,
    sequenceTargetClipCount: plan.visualBiblePlan.sequencePlan.targetClipCount,
    executionTargetClipCount: plan.visualBiblePlan.executionBlueprint.durationCoverage.targetClipCount,
    executionCoverageSeconds: plan.visualBiblePlan.executionBlueprint.durationCoverage.targetDurationSeconds,
    workflowMode: handoff.request.metadata?.workflowMode,
    renderMode: handoff.request.metadata?.renderMode,
    requestDurationSeconds: handoff.request.settings?.durationTargetSeconds,
    selectedPipeDurationMaxSeconds: Number(handoff.request.metadata?.shortVideoPipeDurationMaxSeconds ?? 0),
    selectedPipeSupportsLongSequence: handoff.request.metadata?.shortVideoPipeSupportsLongSequence === "true",
    targetWithinSelectedPipeDurationRange: handoff.request.metadata?.shortVideoPipeTargetWithinDurationRange === "true",
    visualBibleBlocksRender: handoff.request.metadata?.shortVisualBibleBlocksRender === "true",
    canUseAsRenderJobHandoff: handoff.summary.canUseAsRenderJobHandoff
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function mediaReference(role, kind, uri, label, rightsStatus, priority) {
  return { role, kind, uri, label, rightsStatus, priority };
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
