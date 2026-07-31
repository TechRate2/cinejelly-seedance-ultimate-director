#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-viral-intelligence-smoke-report.json";

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
const { ShortPipelineConversationEngine } = await import("../dist/core/short-pipeline-conversation.js");
const { buildShortPipelineRenderHandoff } = await import("../dist/core/short-pipeline-render-handoff.js");
const { SHORT_PROMPT_CORPUS_COVERAGE } = await import("../dist/core/short-prompt-pattern-corpus.js");
const { SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE } = await import("../dist/core/short-platform-template-corpus.js");

const planner = new ShortPipelinePlanner();
const conversationEngine = new ShortPipelineConversationEngine({ planner });
const generatedAt = new Date("2026-06-21T00:00:00.000Z");

const viralPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_reference",
  generatedAt,
  userPrompt: "Create a 35 second TikTok/Douyin UGC review ad for busy skincare buyers. Make it native, proof-led, high retention, and suitable for Reels reposting.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 35,
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum?signature=abc123&utm_source=ad",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      metaDescription: "A lightweight serum for dull-looking morning skin.",
      imageUrls: ["https://cdn.example.com/glow-focus-serum/front.jpg"],
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
    durationSeconds: 32,
    sceneCount: 5,
    pacing: "fast handheld hook, texture proof, application demo, payoff, one CTA",
    cameraStyle: "creator handheld opening, macro product close-up, bathroom mirror payoff",
    captionStyle: "one punchy line per beat with proof words emphasized",
    audioStyle: "natural creator narration over quiet trend-compatible bed",
    retentionPattern: "hold the payoff until after the texture proof and application beat",
    ctaStyle: "soft shop-now CTA after visible payoff",
    visualMotifs: ["morning mirror", "texture close-up", "makeup-ready finish"],
    doNotCopy: true
  },
  mediaReferences: [
    {
      role: "kol",
      kind: "image",
      uri: "asset://short-viral/glow-creator",
      label: "Glow creator KOL",
      rightsStatus: "operator_approved",
      priority: "primary",
      description: "Preserve approved KOL identity only."
    },
    {
      role: "product",
      kind: "image",
      uri: "asset://short-viral/glow-focus-serum-pack",
      label: "Glow Focus Serum pack",
      rightsStatus: "operator_approved",
      priority: "primary",
      description: "Preserve product packaging geometry, label, and hero-object continuity only."
    }
  ]
});

const copyRiskPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_copy_guard",
  generatedAt,
  userPrompt: "Learn this TikTok video and copy it 99% for a product review, but make a new clip for my product.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 28,
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      cta: "Shop now"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "operator reference summary",
    sourceUrl: "https://media.example.com/reference/copy-risk",
    summary: "A creator review with exact timing, captions, and creator delivery requested for imitation.",
    doNotCopy: false
  }
});

const vietnameseCopyRiskPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_vietnamese_copy_guard",
  generatedAt,
  userPrompt: "Hoc video viral do 100% lam y het cho serum cua toi, thay bang KOL va san pham cua toi.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 26,
  product: {
    productUrl: "https://shop.example.com/products/glow-focus-serum",
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      cta: "Shop now"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "operator Vietnamese reference summary",
    sourceUrl: "https://media.example.com/reference/vietnamese-copy-risk",
    summary: "Nguoi dung yeu cau lam giong video viral va giu gan nhu toan bo cau truc cu.",
    hook: "Lam y het hook nay nhung thay bang san pham moi.",
    doNotCopy: true
  }
});

const unsafeReferencePlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_unsafe_reference",
  generatedAt,
  userPrompt: "Make a short product ad using my private local reference video.",
  targetPlatform: "tiktok",
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      cta: "Shop now"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "private local reference",
    sourceUrl: "C:\\Users\\Admin\\Videos\\secret-reference.mp4",
    summary: "Private local file should not be serialized or accepted as public planning evidence."
  }
});

const genericNichePlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_generic_niche_depth",
  generatedAt,
  userPrompt: "Make a trend-native TikTok short for a niche magnetic cable organizer for remote workers. Let a KOL adapt the structure of a viral office-life video, but replace the product, setting, proof, and story with my product. Make it oddly satisfying and a little funny.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 24
});

const beveragePlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_beverage_niche",
  generatedAt,
  userPrompt: "Create a 22 second TikTok launch short for sparkling coffee. Make the first sip oddly satisfying, social, and trend-native.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 22,
  product: {
    productUrl: "https://shop.example.com/products/spark-pop-coffee",
    snapshot: {
      productTitle: "Spark Pop Coffee",
      category: "beverage",
      benefits: ["Refreshing sparkling coffee moment for afternoon breaks"],
      claims: ["Refreshing sparkling coffee moment"],
      targetBuyer: "coffee drinkers who like novelty drinks",
      cta: "Try the flavor"
    }
  }
});

const miniTextPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_mini_text_only",
  generatedAt,
  userPrompt: "Create a 15 second TikTok short for a compact ceramic travel mug. Make it cozy, useful, and trend-native without any uploaded media.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 15
});

const qualityOverridePlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_quality_override",
  generatedAt,
  userPrompt: "Create a 24 second TikTok short for a premium travel hoodie. Make it tactile, cinematic, and conversion-ready.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 24,
  seedanceSettings: {
    resolution: "1080p-SR",
    bitrateMode: "high",
    returnLastFrame: false
  }
});

const videoRemakeMediaReferences = [
  {
    role: "kol",
    kind: "image",
    uri: "asset://short-viral/desk-kol",
    label: "Desk KOL reference",
    rightsStatus: "operator_approved",
    priority: "primary",
    description: "Preserve approved KOL identity only."
  },
  {
    role: "product",
    kind: "image",
    uri: "asset://short-viral/magsnap-product",
    label: "MagSnap product reference",
    rightsStatus: "operator_approved",
    priority: "primary",
    description: "Preserve product geometry and magnetic mechanism only."
  },
  {
    role: "background",
    kind: "image",
    uri: "asset://short-viral/desk-background",
    label: "Desk background",
    rightsStatus: "operator_approved",
    priority: "supporting",
    description: "Preserve desk layout and broad environment only."
  },
  {
    role: "source_video",
    kind: "video",
    uri: "https://media.example.com/reference/office-life-remake",
    label: "Office-life remake structure",
    rightsStatus: "operator_approved",
    priority: "supporting",
    description: "Learn rhythm, acting beats, camera grammar, retention timing, and payoff structure only."
  }
];

const videoRemakePlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_video_remake_blueprint",
  generatedAt,
  userPrompt: "Create a TikTok Video Remake for a niche magnetic cable organizer. Use the reference as edit rhythm, acting beats, camera language, and payoff timing, then replace with my KOL, product, desk background, original voice, and approved claims.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 28,
  product: {
    productUrl: "https://shop.example.com/products/magnetic-cable-organizer",
    snapshot: {
      productTitle: "MagSnap Cable Kit",
      category: "workspace accessory",
      benefits: ["Turns a messy remote-work desk into a cleaner cable routine"],
      claims: ["Helps keep daily desk cables organized"],
      targetBuyer: "remote workers with messy desk setups",
      cta: "Try the kit"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "rights-cleared office-life remake reference",
    sourceUrl: "https://media.example.com/reference/office-life-remake",
    summary: "Creator opens on a chaotic desk, shows a tiny frustration, snaps into a satisfying magnetic cable motion, reacts, and lands on a clean before-after payoff.",
    hook: "POV: your desk looks fine until every cable starts fighting you.",
    durationSeconds: 27,
    sceneCount: 5,
    pacing: "0-2s chaos hook, 2-8s frustration, 8-16s magnetic mechanism, 16-23s satisfying cleanup, 23-27s payoff",
    cameraStyle: "desk POV, fast handheld push-in, macro magnetic snap, creator reaction, locked clean final frame",
    captionStyle: "visual beat rhythm only; no generated visible text",
    audioStyle: "quick original beat accents with new guided creator narration",
    retentionPattern: "hold the clean final desk until after the macro magnetic proof beat",
    ctaStyle: "soft desk routine payoff without hard-sell text",
    visualMotifs: ["desk chaos", "magnetic snap", "clean final frame"],
    doNotCopy: true
  },
  mediaReferences: videoRemakeMediaReferences
});

const trendUploadOnlyPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_trend_upload_only",
  generatedAt,
  userPrompt: "Create a Video Remake from my uploaded viral trend video for a serum launch. Match the beat order, acting rhythm, camera grammar, and payoff timing, but replace the creator with my KOL, product with my serum, background with my bathroom set, and use original voice/audio.",
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
  mediaReferences: [
    {
      role: "kol",
      kind: "image",
      uri: "asset://short-viral/trend-upload-kol",
      label: "Trend Upload KOL",
      rightsStatus: "operator_approved",
      priority: "primary"
    },
    {
      role: "product",
      kind: "image",
      uri: "asset://short-viral/trend-upload-serum",
      label: "Trend Upload Serum",
      rightsStatus: "operator_approved",
      priority: "primary"
    },
    {
      role: "background",
      kind: "image",
      uri: "asset://short-viral/trend-upload-bathroom",
      label: "Bathroom background",
      rightsStatus: "operator_approved",
      priority: "supporting"
    },
    {
      role: "source_video",
      kind: "video",
      uri: "asset://short-viral/uploaded-trend-reference",
      label: "Uploaded trend structure",
      rightsStatus: "operator_approved",
      priority: "supporting",
      description: "5 beat source: hook reaction, product reveal, macro proof, mirror reaction, payoff."
    }
  ]
});

const newsExplainerPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_news_explainer",
  generatedAt,
  userPrompt: "Create a 30 second TikTok news commentary short explaining a breaking AI policy update. Make it fast, accurate, saveable, and not a product ad.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 30
});

const podcastClipPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_podcast_clip",
  generatedAt,
  userPrompt: "Turn a founder podcast hot take into a 32 second short with B-roll for a SaaS workflow app. Visualize the quote, show the workflow pain, then land a clear proof payoff.",
  targetPlatform: "youtube_shorts",
  targetDurationSeconds: 32,
  product: {
    snapshot: {
      productTitle: "FlowDesk App",
      category: "SaaS workflow app",
      benefits: ["Turns messy approvals into a clearer handoff workflow"],
      claims: ["Cleaner approval handoff workflow"],
      targetBuyer: "agency operators",
      cta: "Book a demo"
    }
  }
});

const fashionTryOnPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_fashion_tryon",
  generatedAt,
  userPrompt: "Create a TikTok try-on transition stack for a travel hoodie. Make it GRWM, tactile, fit-check oriented, native, and conversion-ready.",
  targetPlatform: "tiktok",
  targetDurationSeconds: 22,
  product: {
    snapshot: {
      productTitle: "CloudTrail Travel Hoodie",
      category: "fashion apparel",
      benefits: ["Soft structured fit for airport and city travel"],
      claims: ["Soft structured fit"],
      targetBuyer: "style-conscious travelers",
      cta: "Try the hoodie"
    }
  }
});

const mobileAppPlan = planner.buildPlan({
  projectId: "short_viral_smoke",
  requestId: "req_short_mobile_app_demo",
  generatedAt,
  userPrompt: "Create a 25 second app demo short for a mobile habit tracker. Do not show fake text-heavy screens; tell the app value through a real morning routine and one aha workflow.",
  targetPlatform: "instagram_reels",
  targetDurationSeconds: 25,
  product: {
    snapshot: {
      productTitle: "HabitPulse",
      category: "mobile app",
      benefits: ["Turns a scattered morning routine into one small repeatable habit loop"],
      claims: ["Helps users track small daily habits"],
      targetBuyer: "busy app users building habits",
      cta: "Try the app"
    }
  }
});

const conversation = conversationEngine.buildSession({
  projectId: "short_viral_smoke",
  requestId: "req_short_viral_conversation",
  generatedAt,
  messages: [
    {
      role: "user",
      text: "I want a TikTok UGC review ad for skincare buyers. Use my video sample as pacing inspiration, but do not copy the script or creator."
    },
    {
      role: "operator",
      text: "Keep it 30 seconds, proof-led, and make the CTA soft."
    }
  ],
  product: {
    snapshot: {
      productTitle: "Glow Focus Serum",
      category: "beauty",
      benefits: ["Lightweight texture layers cleanly under makeup"],
      cta: "Shop now"
    }
  },
  referenceVideoLearning: {
    sourceLabel: "conversation reference pattern",
    sourceUrl: "https://media.example.com/reference/conversation-pattern",
    durationSeconds: 30,
    sceneCount: 4,
    pacing: "hook, proof, demo, soft CTA",
    doNotCopy: true
  }
});

const renderHandoff = buildShortPipelineRenderHandoff({
  plan: viralPlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_viral_smoke_workspace"
  }
});

const videoRemakeHandoff = buildShortPipelineRenderHandoff({
  plan: videoRemakePlan,
  mediaReferenceInputs: videoRemakeMediaReferences,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_viral_remake_workspace"
  }
});

const trendUploadHandoff = buildShortPipelineRenderHandoff({
  plan: trendUploadOnlyPlan,
  includeGeneratedAudioIntents: true,
  metadata: {
    workspaceId: "short_trend_upload_workspace"
  }
});

const redactedRenderHandoff = redactHandoffProviderReferenceUris(renderHandoff);
const redactedVideoRemakeHandoff = redactHandoffProviderReferenceUris(videoRemakeHandoff);
const redactedTrendUploadHandoff = redactHandoffProviderReferenceUris(trendUploadHandoff);
const serialized = JSON.stringify({
  viralPlan,
  copyRiskPlan,
  vietnameseCopyRiskPlan,
  unsafeReferencePlan,
  genericNichePlan,
  beveragePlan,
  miniTextPlan,
  videoRemakePlan,
  trendUploadOnlyPlan,
  newsExplainerPlan,
  podcastClipPlan,
  fashionTryOnPlan,
  mobileAppPlan,
  conversation,
  renderHandoff: redactedRenderHandoff,
  videoRemakeHandoff: redactedVideoRemakeHandoff,
  trendUploadHandoff: redactedTrendUploadHandoff
});
const rawReferenceLeak = serialized.includes("https://media.example.com/reference/glow-review") ||
  serialized.includes("https://media.example.com/reference/copy-risk") ||
  serialized.includes("https://media.example.com/reference/vietnamese-copy-risk") ||
  serialized.includes("https://media.example.com/reference/office-life-remake") ||
  serialized.includes("https://media.example.com/reference/conversation-pattern") ||
  serialized.includes("C:\\Users\\Admin\\Videos\\secret-reference.mp4") ||
  serialized.includes("signature=abc123");
const audienceNiche = viralPlan.viralIntelligence.nicheStrategy.audienceNicheIntelligence;
const creativeLearning = viralPlan.viralIntelligence.creativePatternLearning;
const selectedIdea = creativeLearning.candidates.find((candidate) => candidate.ideaId === creativeLearning.selectedIdeaId);
const promptCorpusPatternCount = creativeLearning.patterns.filter((pattern) => pattern.source === "seedance_prompt_corpus").length;
const platformTemplatePatternCount = creativeLearning.patterns.filter((pattern) => pattern.source === "platform_template_corpus").length;
const genericCreativeLearning = genericNichePlan.viralIntelligence.creativePatternLearning;
const genericSelectedIdea = genericCreativeLearning.candidates.find((candidate) => candidate.ideaId === genericCreativeLearning.selectedIdeaId);
const beverageCreativeLearning = beveragePlan.viralIntelligence.creativePatternLearning;
const beverageSelectedIdea = beverageCreativeLearning.candidates.find((candidate) => candidate.ideaId === beverageCreativeLearning.selectedIdeaId);
const miniCreativeLearning = miniTextPlan.viralIntelligence.creativePatternLearning;
const videoRemakeBlueprint = videoRemakePlan.referenceRemakeBlueprint;
const trendUploadBlueprint = trendUploadOnlyPlan.referenceRemakeBlueprint;
const vietnameseCreativeLearning = vietnameseCopyRiskPlan.viralIntelligence.creativePatternLearning;
const vietnameseSelectedIdea = vietnameseCreativeLearning.candidates.find((candidate) => candidate.ideaId === vietnameseCreativeLearning.selectedIdeaId);
const newTaxonomyPlans = [newsExplainerPlan, podcastClipPlan, fashionTryOnPlan, mobileAppPlan];

// EXPLICIT style tag (customer "Phong cách" select): a review-worded brief with [style:cinematic]
// must come out CINEMATIC — the tag has absolute priority over keyword heuristics.
const explicitStylePlan = planner.buildPlan({
  projectId: "short_viral_style_tag",
  requestId: "req_short_viral_style_tag",
  generatedAt,
  userPrompt: "Create a 20 second review ad for busy skincare buyers, native creator energy. [style:cinematic]",
  targetPlatform: "tiktok",
  targetDurationSeconds: 20
});

const checks = [
  explicitStylePlan.viralIntelligence.nicheStrategy.creativeMode === "cinematic"
    ? pass("explicit_style_tag_overrides_keywords", "A review-worded brief with [style:cinematic] plans as cinematic — the customer's style choice always wins.")
    : fail("explicit_style_tag_overrides_keywords", `Expected cinematic, got ${explicitStylePlan.viralIntelligence.nicheStrategy.creativeMode}.`),
  viralPlan.noSpend && !viralPlan.networkCallsMade && !viralPlan.providerCallsMade &&
    viralPlan.viralIntelligence.noSpend && !viralPlan.viralIntelligence.networkCallsMade && !viralPlan.viralIntelligence.providerCallsMade
    ? pass("no_spend_no_network", "Short viral intelligence runs as deterministic no-spend planning evidence.")
    : fail("no_spend_no_network", "Expected viral intelligence to avoid network, provider, Atlas, and render paths."),
  viralPlan.viralIntelligence.nicheStrategy.platformFocus === "tiktok_douyin" &&
    viralPlan.viralIntelligence.nicheStrategy.creativeMode === "ugc_review" &&
    viralPlan.viralIntelligence.nicheStrategy.viralLevers.includes("fast_hook") &&
    viralPlan.viralIntelligence.nicheStrategy.viralLevers.includes("visual_retention")
    ? pass("tiktok_douyin_ugc_strategy", "TikTok/Douyin UGC strategy, visual-retention levers, and niche intent are inferred.")
    : fail("tiktok_douyin_ugc_strategy", "Expected TikTok/Douyin-first UGC strategy with retention levers."),
  audienceNiche?.schemaVersion === "cinejelly.audience-niche-intelligence.v1" &&
    audienceNiche.noSpend === true &&
    audienceNiche.networkCallsMade === false &&
    audienceNiche.providerCallsMade === false &&
    audienceNiche.userPresentationStyle === "product_url_or_facts" &&
    audienceNiche.trendPosture === "trend_native" &&
    audienceNiche.ideaSeeds.length >= 4 &&
    renderHandoff.request.metadata?.shortAudienceNicheTrendPosture === audienceNiche.trendPosture &&
    renderHandoff.request.userInput.includes("Audience intelligence:") &&
    renderHandoff.request.userInput.includes("Idea seeds:")
    ? pass("shared_audience_niche_intelligence", "Short planning and render handoff receive shared user-intent, niche, trend, hook, proof, and idea-seed intelligence.")
    : fail("shared_audience_niche_intelligence", "Expected shared audience/niche intelligence to be present in plan metadata and render prompt."),
  creativeLearning?.schemaVersion === "cinejelly.short-creative-pattern-learning.v1" &&
    creativeLearning.noSpend === true &&
    creativeLearning.networkCallsMade === false &&
    creativeLearning.providerCallsMade === false &&
    creativeLearning.patternCount >= 14 &&
    creativeLearning.candidateCount >= 14 &&
    Boolean(selectedIdea) &&
    selectedIdea.score.totalScore >= 0.65 &&
    selectedIdea.score.nonCloneSafety >= 0.7 &&
    selectedIdea.riskControls.some((item) => item.includes("no visible captions")) &&
    renderHandoff.request.metadata?.shortCreativePatternLearningId === creativeLearning.learningId &&
    renderHandoff.request.userInput.includes("Creative pattern learning:") &&
    renderHandoff.request.userInput.includes("Selected idea:")
    ? pass("creative_pattern_learning_candidates", "Short viral planning generates many niche/reference-aware idea candidates, scores them, selects a non-clone idea, and hands it to render.")
    : fail("creative_pattern_learning_candidates", "Expected creative pattern learning with scored candidates, selected idea, guardrails, and render handoff lineage."),
  promptCorpusPatternCount >= 4 &&
    SHORT_PROMPT_CORPUS_COVERAGE.declaredPromptCount === 3817 &&
    SHORT_PROMPT_CORPUS_COVERAGE.runtimePatternCount >= 80 &&
    SHORT_PROMPT_CORPUS_COVERAGE.taxonomyFamilyCount >= 40 &&
    creativeLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus" && pattern.fitReasons.some((reason) => reason.includes("license=CC-BY-4.0"))) &&
    creativeLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus" && pattern.fitReasons.some((reason) => reason.includes("corpus_declared_prompts=3817"))) &&
    creativeLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus" && pattern.riskControls.some((risk) => risk.includes("do not reproduce upstream prompt wording"))) &&
    genericCreativeLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus") &&
    beverageCreativeLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus") &&
    renderHandoff.request.userInput.includes("Prompt corpus guidance:")
    ? pass("seedance_prompt_corpus_rag", "Prompt corpus RAG retrieves rights-aware Seedance/ad/UGC pattern DNA across niches, carries 3817-prompt lineage, and hands distilled guidance to render without verbatim prompt copying.")
    : fail("seedance_prompt_corpus_rag", "Expected Seedance prompt corpus coverage, license lineage, no-copy guardrails, cross-niche retrieval, and render prompt guidance."),
  platformTemplatePatternCount >= 4 &&
    SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.templateArchetypeCount >= 20 &&
    SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.nicheFamilyCount >= 40 &&
    SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.declaredPatternMatrixCount >= 900 &&
    creativeLearning.patterns.some((pattern) => pattern.source === "platform_template_corpus" && pattern.fitReasons.some((reason) => reason.includes("pattern_matrix="))) &&
    creativeLearning.patterns.some((pattern) => pattern.source === "platform_template_corpus" && pattern.riskControls.some((risk) => risk.includes("do not reproduce third-party template wording"))) &&
    newTaxonomyPlans.every((plan) => plan.viralIntelligence.creativePatternLearning.patterns.some((pattern) => pattern.source === "platform_template_corpus")) &&
    renderHandoff.request.userInput.includes("Platform template guidance:")
    ? pass("platform_template_training_corpus", "Platform template corpus retrieves public/licensed workflow structure across niches and hands no-copy template guidance to render.")
    : fail("platform_template_training_corpus", "Expected platform template matrix coverage, cross-niche retrieval, no-copy guardrails, and render prompt guidance."),
  newTaxonomyPlans.every((plan) =>
    plan.viralIntelligence.creativePatternLearning.patterns.some((pattern) => pattern.source === "seedance_prompt_corpus") &&
    plan.viralIntelligence.creativePatternLearning.patternCount >= 24 &&
    plan.viralIntelligence.creativePatternLearning.candidateCount >= 24
  ) &&
    newsExplainerPlan.viralIntelligence.nicheStrategy.niche === "news_commentary" &&
    podcastClipPlan.viralIntelligence.nicheStrategy.niche === "podcast_clip" &&
    fashionTryOnPlan.viralIntelligence.nicheStrategy.niche === "fashion_apparel" &&
    mobileAppPlan.viralIntelligence.nicheStrategy.niche === "mobile_app"
    ? pass("expanded_taxonomy_multi_niche", "Expanded taxonomy retrieves corpus patterns for news, podcast, fashion try-on, and mobile-app short formats.")
    : fail("expanded_taxonomy_multi_niche", "Expected expanded taxonomy plans to classify correctly and retrieve many corpus-backed candidates."),
  viralPlan.viralIntelligence.referenceVideoPattern?.sourceUrlSha256 &&
    viralPlan.viralIntelligence.referenceVideoPattern.safetyStatus === "learned_pattern" &&
    viralPlan.viralIntelligence.referenceVideoPattern.originalityGuardrails.length >= 3 &&
    !rawReferenceLeak
    ? pass("reference_pattern_learning_redacted", "Reference video learning stores a pattern fingerprint and originality guardrails without raw URL/path leakage.")
    : fail("reference_pattern_learning_redacted", "Expected redacted reference pattern learning with guardrails and no raw source leakage."),
  viralPlan.viralIntelligence.conceptScores.length >= 2 &&
    Boolean(viralPlan.viralIntelligence.winningConceptId) &&
    viralPlan.viralIntelligence.sceneDirectives.length === viralPlan.scenes.length &&
    viralPlan.viralIntelligence.sceneDirectives.every((directive) => directive.viralLevers.length > 0 && directive.qualityChecks.length >= 3)
    ? pass("concept_scoring_scene_directives", "Concept scoring selects a winning angle and each scene receives viral directives plus quality checks.")
    : fail("concept_scoring_scene_directives", "Expected concept scores, winner, scene directives, levers, and quality checks."),
  copyRiskPlan.viralIntelligence.status === "review_required" &&
    copyRiskPlan.viralIntelligence.findings.some((finding) => finding.code === "reference_video_copy_risk") &&
    copyRiskPlan.viralIntelligence.referenceVideoPattern?.originalityGuardrails.some((guardrail) => guardrail.includes("do not copy"))
    ? pass("copy_risk_guardrail", "Copy/99% requests are converted into review-required structure learning instead of clone instructions.")
    : fail("copy_risk_guardrail", "Expected copy-risk requests to produce guardrails and review-required status."),
  vietnameseCopyRiskPlan.viralIntelligence.status === "review_required" &&
    vietnameseCopyRiskPlan.viralIntelligence.findings.some((finding) => finding.code === "reference_video_copy_risk") &&
    vietnameseCopyRiskPlan.viralIntelligence.referenceVideoPattern?.safetyStatus === "review_required" &&
    Boolean(vietnameseSelectedIdea) &&
    vietnameseSelectedIdea.score.nonCloneSafety <= 0.6 &&
    vietnameseSelectedIdea.riskControls.some((item) => item.includes("copy-risk review"))
    ? pass("vietnamese_copy_risk_guardrail", "Vietnamese/no-accent 100% y-het clone intent is detected and downgraded to structure-only review.")
    : fail("vietnamese_copy_risk_guardrail", "Expected Vietnamese 100% clone intent to trigger copy-risk review and lower non-clone safety."),
  unsafeReferencePlan.status === "blocked" &&
    unsafeReferencePlan.viralIntelligence.status === "blocked" &&
    unsafeReferencePlan.viralIntelligence.findings.some((finding) => finding.code === "reference_video_unsafe_source") &&
    !rawReferenceLeak
    ? pass("unsafe_reference_blocks_plan", "Unsafe local/private reference sources block the plan without serializing raw paths.")
    : fail("unsafe_reference_blocks_plan", "Expected unsafe reference source to block planning and stay redacted."),
  beveragePlan.viralIntelligence.nicheStrategy.niche === "food_beverage" &&
    beverageCreativeLearning.patterns.some((pattern) => pattern.nicheTags.includes("food_beverage")) &&
    Boolean(beverageSelectedIdea) &&
    !beveragePlan.viralIntelligence.nicheStrategy.niche.includes("beauty") &&
    beverageSelectedIdea.score.totalScore >= 0.65
    ? pass("beverage_niche_boundary_classifier", "Sparkling coffee is classified as food/beverage and no longer trips beauty spa substring logic.")
    : fail("beverage_niche_boundary_classifier", "Expected sparkling coffee to classify as food_beverage, not beauty/skincare."),
  genericNichePlan.viralIntelligence.nicheStrategy.niche === "workspace_accessory" &&
    genericCreativeLearning.patterns.some((pattern) => pattern.nicheTags.includes("workspace_accessory")) &&
    genericCreativeLearning.patternCount >= 8 &&
    genericCreativeLearning.candidateCount >= 8 &&
    Boolean(genericSelectedIdea) &&
    genericSelectedIdea.score.totalScore >= 0.65 &&
    genericSelectedIdea.score.nonCloneSafety >= 0.7 &&
    genericCreativeLearning.patterns.some((pattern) => pattern.source === "audience_niche") &&
    genericCreativeLearning.patterns.some((pattern) => pattern.source === "prompt_signal")
    ? pass("workspace_niche_pattern_depth", "Workspace/cable organizer niches receive specialist desk-setup patterns plus audience seeds and prompt signals.")
    : fail("workspace_niche_pattern_depth", "Expected workspace/cable organizer planning to produce specialist safe, scored creative pattern candidates."),
  videoRemakeBlueprint?.userFacingModeLabel === "Video Remake" &&
    videoRemakeBlueprint.mode === "structure_remake" &&
    videoRemakeBlueprint.status === "ready" &&
    videoRemakeBlueprint.fidelityTarget === "structure_locked" &&
    videoRemakeBlueprint.trendVideoIntakeMode === "uploaded_or_clean_https_reference" &&
    videoRemakeBlueprint.replacementSlots.includes("KOL/creator") &&
    videoRemakeBlueprint.adherenceTargets.length >= 5 &&
    videoRemakeBlueprint.sourceBeatMap.length >= 4 &&
    videoRemakeBlueprint.providerExecutionPlan.length >= 4 &&
    videoRemakeBlueprint.lockedElements.length >= 4 &&
    videoRemakeBlueprint.remakeGuardrails.some((guardrail) => guardrail.includes("replace KOL")) &&
    videoRemakePlan.viralIntelligence.referenceVideoPattern?.safetyStatus === "learned_pattern" &&
    videoRemakePlan.viralIntelligence.nicheStrategy.viralLevers.includes("trend_transfer") &&
    videoRemakePlan.agentGraph?.memoryPack.retrievedPatterns.some((pattern) => pattern.source === "reference_pattern") &&
    videoRemakeHandoff.request.metadata?.workflowMode === "source_video" &&
    videoRemakeHandoff.request.metadata?.renderMode === "video_remake" &&
    videoRemakeHandoff.request.metadata?.shortReferenceRemakeBlueprintId === videoRemakeBlueprint.blueprintId &&
    videoRemakeHandoff.request.metadata?.shortReferenceRemakeTrendIntakeMode === videoRemakeBlueprint.trendVideoIntakeMode &&
    videoRemakeHandoff.request.userInput.includes("Video Remake blueprint:") &&
    videoRemakeHandoff.request.userInput.includes("Video Remake adherence targets:") &&
    videoRemakeHandoff.request.userInput.includes("Video Remake source beat map:") &&
    videoRemakeHandoff.request.userInput.includes("Video Remake replacement slots:") &&
    !rawReferenceLeak
    ? pass("video_remake_blueprint_handoff", "Video Remake builds a reviewable beat-map blueprint, keeps source redacted, and hands adherence/remake mode to render metadata/prompt.")
    : fail("video_remake_blueprint_handoff", "Expected Video Remake blueprint, adherence targets, beat map, replacement slots, trend transfer, graph memory, and render handoff metadata."),
  trendUploadBlueprint?.trendVideoIntakeMode === "uploaded_or_clean_https_reference" &&
    trendUploadBlueprint.status === "ready" &&
    trendUploadBlueprint.sourceBeatMap.length >= 4 &&
    trendUploadBlueprint.adherenceTargets.some((target) => target.includes("camera grammar")) &&
    trendUploadOnlyPlan.mediaReferencePlan.some((reference) => reference.promptRole === "source_video_structure" && reference.includeInProviderHandoff === true) &&
    trendUploadOnlyPlan.seedanceRouting.referenceTags.some((reference) => reference.role === "source_video_structure" && reference.providerKind === "video") &&
    trendUploadHandoff.request.references?.some((reference) => reference.role === "source_video_structure") &&
    trendUploadHandoff.request.userInput.includes("Video Remake source beat map:")
    ? pass("trend_video_upload_intake", "A raw uploaded source-video media reference now creates a Video Remake beat-map blueprint and provider-scoped source-video handoff without manual summary input.")
    : fail("trend_video_upload_intake", "Expected upload-only source_video intake to synthesize learning, blueprint, @video handoff, and render prompt beat map."),
  viralPlan.seedanceRouting.recommendedProviderMode === "reference_to_video" &&
    viralPlan.seedanceRouting.preferredTier === "standard" &&
    viralPlan.seedanceRouting.resolution === "720p" &&
    viralPlan.seedanceRouting.superResolution === false &&
    viralPlan.seedanceRouting.bitrateMode === "high" &&
    viralPlan.seedanceRouting.promptRecipe.name === "reference_to_video_remake_blueprint" &&
    viralPlan.visualBiblePlan.status === "recommended" &&
    viralPlan.visualBiblePlan.recommendedPipe === "video_remake_pipe" &&
    viralPlan.seedanceRouting.referenceTags.length >= 2 &&
    viralPlan.mediaReferencePlan.some((reference) => reference.promptTag === "@image1" && reference.promptRole === "identity") &&
    viralPlan.mediaReferencePlan.some((reference) => reference.promptRole === "product" && reference.includeInProviderHandoff === true) &&
    renderHandoff.request.references?.length >= 2 &&
    renderHandoff.request.metadata?.shortSeedanceProviderMode === "reference_to_video" &&
    renderHandoff.request.metadata?.shortSeedancePreferredTier === "standard" &&
    renderHandoff.request.settings?.resolution === "720p" &&
    renderHandoff.request.settings?.bitrateMode === "high" &&
    renderHandoff.request.userInput.includes("Seedance routing:") &&
    renderHandoff.request.userInput.includes("Media reference binding:")
    ? pass("seedance_reference_routing_handoff", "KOL/product assets route to Seedance reference-to-video with visual-bible evidence, @image tags, standard tier, 720p/high-bitrate defaults, metadata, prompt, and provider references.")
    : fail("seedance_reference_routing_handoff", "Expected KOL/product media references to drive reference-to-video routing and render handoff references."),
  viralPlan.videoPipePlan?.schemaVersion === "cinejelly.short-video-pipe-plan.v1" &&
    viralPlan.videoPipePlan.selectedMode === "video_remake" &&
    viralPlan.videoPipePlan.selectedBackendPipe === "video_remake_pipe" &&
    viralPlan.videoPipePlan.pipeOptions.length === 5 &&
    miniTextPlan.videoPipePlan.selectedMode === "smart_short" &&
    genericNichePlan.videoPipePlan.selectedMode === "storyboard_multishot" &&
    genericNichePlan.videoPipePlan.selectionReasonCodes.length > 0 &&
    renderHandoff.request.metadata?.shortVideoPipePlanId === viralPlan.videoPipePlan.pipePlanId &&
    renderHandoff.request.metadata?.shortVideoPipeSelectedMode === "video_remake" &&
    renderHandoff.request.metadata?.shortVideoPipeVisualBibleAlignment === "aligned" &&
    renderHandoff.request.userInput.includes("Video pipe plan:") &&
    renderHandoff.request.userInput.includes("Video pipe alignment:") &&
    renderHandoff.request.userInput.includes("Available video pipes:")
    ? pass("core_video_pipe_plan_handoff", "Five product-level video pipes, selection reason codes, and Visual Bible alignment now flow into render metadata/prompt.")
    : fail("core_video_pipe_plan_handoff", "Expected core videoPipePlan with five options, selected modes per scenario, and render handoff metadata/prompt."),
  miniTextPlan.seedanceRouting.recommendedProviderMode === "text_to_video" &&
    miniTextPlan.seedanceRouting.preferredTier === "mini" &&
    miniTextPlan.seedanceRouting.resolution === "720p" &&
    miniTextPlan.seedanceRouting.promptRecipe.name === "text_to_video_niche_short" &&
    miniTextPlan.mediaReferencePlan.length === 0 &&
    miniCreativeLearning.candidateCount >= 8
    ? pass("seedance_mini_text_only_routing", "Text-only compact shorts route to Seedance Mini with the 720p default without asking the user to choose a model.")
    : fail("seedance_mini_text_only_routing", "Expected compact text-only short to route to mini text-to-video with no media references."),
  qualityOverridePlan.seedanceRouting.resolution === "1080p-SR" &&
    qualityOverridePlan.seedanceRouting.bitrateMode === "high" &&
    qualityOverridePlan.seedanceRouting.returnLastFrame === false &&
    qualityOverridePlan.seedanceRouting.reasonCodes.includes("user_resolution_1080p-SR") &&
    qualityOverridePlan.seedanceRouting.reasonCodes.includes("user_bitrate_high") &&
    qualityOverridePlan.seedanceRouting.reasonCodes.includes("user_return_last_frame_false")
    ? pass("seedance_quality_override", "Short plan accepts user quality overrides for resolution, bitrate, and last-frame continuity.")
    : fail("seedance_quality_override", "Expected user quality overrides to survive planner routing."),
  conversation.plan.viralIntelligence.referenceVideoPattern?.sourceUrlSha256 &&
    conversation.plan.viralIntelligence.sceneDirectives.length === conversation.plan.scenes.length &&
    conversation.rawTranscriptStored === false
    ? pass("conversation_preserves_viral_intelligence", "Conversation sessions preserve reference-video learning, scene directives, and transcript redaction.")
    : fail("conversation_preserves_viral_intelligence", "Expected conversation session to preserve viral intelligence and redaction."),
  renderHandoff.request.metadata?.shortViralIntelligenceId === viralPlan.viralIntelligence.intelligenceId &&
    renderHandoff.request.metadata?.shortViralPlatformFocus === "tiktok_douyin" &&
    renderHandoff.request.userInput.includes("Short viral strategy:") &&
    renderHandoff.request.userInput.includes("Viral scene directives:") &&
    renderHandoff.request.userInput.includes(viralPlan.viralIntelligence.referenceVideoPattern.patternId) &&
    !rawReferenceLeak
    ? pass("render_handoff_receives_viral_strategy", "Render handoff receives viral strategy, reference guardrails, metadata, and scene directives.")
    : fail("render_handoff_receives_viral_strategy", "Expected render handoff prompt and metadata to include viral intelligence.")
];

const report = {
  schemaVersion: "cinejelly.short-viral-intelligence-smoke.v1",
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
    "vericontext/vibeframe",
    "YouMind-OpenLab/awesome-seedance-2-prompts:distilled-3817-cc-by-4.0",
    "Emily2040/seedance-2.0:seedance-skill-os-mit",
    "ZeroLu/awesome-seedance:prompt-pattern-attribution",
    "Topview AI public API/docs:workflow-structure-observation",
    "Higgsfield official product-to-video guide:public-structure-observation",
    "Higgsfield official cinematic prompt guide:public-structure-observation",
    "OSideMedia/higgsfield-ai-prompt-skill:mit-licensed-structure"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 16,
    referenceRawLeakCheckPassed: !rawReferenceLeak,
    endpointsCovered: [
      "/v1/short-pipeline/plan",
      "/v1/short-pipeline/conversation",
      "/v1/short-pipeline/render-jobs"
    ]
  },
  scenarios: {
    viralPlan: summarizePlan(viralPlan),
    copyRisk: summarizePlan(copyRiskPlan),
    vietnameseCopyRisk: summarizePlan(vietnameseCopyRiskPlan),
    unsafeReference: summarizePlan(unsafeReferencePlan),
    genericNiche: summarizePlan(genericNichePlan),
    beverageNiche: summarizePlan(beveragePlan),
    miniTextOnly: summarizePlan(miniTextPlan),
    qualityOverride: summarizePlan(qualityOverridePlan),
    videoRemake: summarizePlan(videoRemakePlan),
    trendUploadOnly: summarizePlan(trendUploadOnlyPlan),
    newsExplainer: summarizePlan(newsExplainerPlan),
    podcastClip: summarizePlan(podcastClipPlan),
    fashionTryOn: summarizePlan(fashionTryOnPlan),
    mobileAppDemo: summarizePlan(mobileAppPlan),
    conversation: {
      sessionId: conversation.sessionId,
      rawTranscriptStored: conversation.rawTranscriptStored,
      planStatus: conversation.plan.status,
      viralStatus: conversation.plan.viralIntelligence.status,
      referencePatternIdPresent: Boolean(conversation.plan.viralIntelligence.referenceVideoPattern?.patternId),
      sceneDirectiveCount: conversation.plan.viralIntelligence.sceneDirectives.length,
      canUseAsNoSpendConversationEvidence: conversation.releaseGateSummary.canUseAsNoSpendConversationEvidence
    },
    renderHandoff: {
      planId: renderHandoff.summary.planId,
      metadataHasViralLineage: renderHandoff.request.metadata?.shortViralIntelligenceId === viralPlan.viralIntelligence.intelligenceId,
      metadataHasCreativePatternLineage: renderHandoff.request.metadata?.shortCreativePatternLearningId === viralPlan.viralIntelligence.creativePatternLearning.learningId,
      metadataHasSeedanceRouting: Boolean(renderHandoff.request.metadata?.shortSeedanceRoutingId),
      seedanceProviderMode: renderHandoff.request.metadata?.shortSeedanceProviderMode,
      seedancePreferredTier: renderHandoff.request.metadata?.shortSeedancePreferredTier,
      seedanceResolution: renderHandoff.request.metadata?.shortSeedanceResolution,
      requestReferenceCount: renderHandoff.request.references?.length ?? 0,
      requestSettingsTier: renderHandoff.request.settings?.tier,
      requestSettingsResolution: renderHandoff.request.settings?.resolution,
      requestSettingsReturnLastFrame: renderHandoff.request.settings?.returnLastFrame,
      promptHasViralStrategy: renderHandoff.request.userInput.includes("Short viral strategy:"),
      promptHasCreativePatternLearning: renderHandoff.request.userInput.includes("Creative pattern learning:"),
      promptHasSeedanceRouting: renderHandoff.request.userInput.includes("Seedance routing:"),
      metadataHasVideoPipePlan: renderHandoff.request.metadata?.shortVideoPipePlanId === viralPlan.videoPipePlan.pipePlanId,
      videoPipeSelectedMode: renderHandoff.request.metadata?.shortVideoPipeSelectedMode,
      promptHasVideoPipePlan: renderHandoff.request.userInput.includes("Video pipe plan:"),
      promptHasMediaReferenceBinding: renderHandoff.request.userInput.includes("Media reference binding:"),
      promptHasSelectedIdea: renderHandoff.request.userInput.includes("Selected idea:"),
      promptHasSceneDirectives: renderHandoff.request.userInput.includes("Viral scene directives:"),
      promptHasReferenceGuardrail: renderHandoff.request.userInput.includes("do not copy source script wording"),
      remakeMetadataHasSourceVideoMode: videoRemakeHandoff.request.metadata?.workflowMode === "source_video",
      remakeMetadataHasVideoRemakeMode: videoRemakeHandoff.request.metadata?.renderMode === "video_remake",
      promptHasVideoRemakeBlueprint: videoRemakeHandoff.request.userInput.includes("Video Remake blueprint:"),
      promptHasVideoRemakeBeatMap: videoRemakeHandoff.request.userInput.includes("Video Remake source beat map:"),
      trendUploadRequestReferenceCount: trendUploadHandoff.request.references?.length ?? 0,
      trendUploadHasSourceVideoReference: trendUploadHandoff.request.references?.some((reference) => reference.role === "source_video_structure") ?? false,
      captionCueCount: renderHandoff.summary.captionCueCount,
      generatedAudioIntentCount: renderHandoff.summary.generatedAudioIntentCount,
      canReleaseToCustomerTraffic: renderHandoff.summary.canReleaseToCustomerTraffic
    }
  },
  checks,
  releaseGateSummary: {
    shortViralIntelligenceSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Short viral intelligence smoke proves backend strategy, reference-pattern learning, copy guardrails, and render handoff only; paid media validation and manual artifact review remain separate gates."
  },
  nextActions: [
    "Use this intelligence layer as the default short-plan brain for TikTok/Douyin-first ads, UGC, reviews, and product demos.",
    "When the UI is added, expose reference-video learning as a structured sample analysis form, not as raw clone instructions.",
    "Run live short-pipeline media validation only after explicit paid budget approval and formal review evidence."
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
    viralStatus: plan.viralIntelligence.status,
    platformFocus: plan.viralIntelligence.nicheStrategy.platformFocus,
    creativeMode: plan.viralIntelligence.nicheStrategy.creativeMode,
    niche: plan.viralIntelligence.nicheStrategy.niche,
    buyerIntent: plan.viralIntelligence.nicheStrategy.buyerIntent,
    presentationStyle: plan.viralIntelligence.nicheStrategy.audienceNicheIntelligence.userPresentationStyle,
    trendPosture: plan.viralIntelligence.nicheStrategy.audienceNicheIntelligence.trendPosture,
    ideaSeedCount: plan.viralIntelligence.nicheStrategy.audienceNicheIntelligence.ideaSeeds.length,
    creativePatternCount: plan.viralIntelligence.creativePatternLearning.patternCount,
    ideaCandidateCount: plan.viralIntelligence.creativePatternLearning.candidateCount,
    platformTemplatePatternCount: plan.viralIntelligence.creativePatternLearning.patterns.filter((pattern) => pattern.source === "platform_template_corpus").length,
    winningIdeaIdPresent: Boolean(plan.viralIntelligence.winningIdeaId),
    selectedIdeaScore: plan.viralIntelligence.creativePatternLearning.candidates.find((candidate) => candidate.ideaId === plan.viralIntelligence.winningIdeaId)?.score.totalScore ?? 0,
    viralLeverCount: plan.viralIntelligence.nicheStrategy.viralLevers.length,
    conceptScoreCount: plan.viralIntelligence.conceptScores.length,
    winningConceptIdPresent: Boolean(plan.viralIntelligence.winningConceptId),
    sceneDirectiveCount: plan.viralIntelligence.sceneDirectives.length,
    findingCodes: plan.viralIntelligence.findings.map((finding) => finding.code),
    referencePatternIdPresent: Boolean(plan.viralIntelligence.referenceVideoPattern?.patternId),
    referenceSafetyStatus: plan.viralIntelligence.referenceVideoPattern?.safetyStatus ?? "not_provided",
    referenceSourceUrlSha256Present: Boolean(plan.viralIntelligence.referenceVideoPattern?.sourceUrlSha256),
    referenceRemakeBlueprintPresent: Boolean(plan.referenceRemakeBlueprint?.blueprintId),
    referenceRemakeStatus: plan.referenceRemakeBlueprint?.status ?? "not_provided",
    referenceRemakeTrendVideoIntakeMode: plan.referenceRemakeBlueprint?.trendVideoIntakeMode ?? "not_provided",
    referenceRemakeReplacementSlotCount: plan.referenceRemakeBlueprint?.replacementSlots?.length ?? 0,
    referenceRemakeAdherenceTargetCount: plan.referenceRemakeBlueprint?.adherenceTargets?.length ?? 0,
    referenceRemakeSourceBeatMapCount: plan.referenceRemakeBlueprint?.sourceBeatMap?.length ?? 0,
    referenceRemakeLockedElementCount: plan.referenceRemakeBlueprint?.lockedElements?.length ?? 0,
    referenceRemakeGuardrailCount: plan.referenceRemakeBlueprint?.remakeGuardrails?.length ?? 0,
    visualBibleStatus: plan.visualBiblePlan.status,
    visualBibleMode: plan.visualBiblePlan.requestedMode,
    visualBibleRecommendedPipe: plan.visualBiblePlan.recommendedPipe,
    visualBibleDurationBand: plan.visualBiblePlan.durationBand,
    visualBibleAssetPlanCount: plan.visualBiblePlan.assetPlans.length,
    visualBibleBoardCount: plan.visualBiblePlan.sequencePlan.boardCount,
    visualBibleTargetClipCount: plan.visualBiblePlan.sequencePlan.targetClipCount,
    visualBibleBlocksRender: plan.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved,
    videoPipePlanIdPresent: Boolean(plan.videoPipePlan?.pipePlanId),
    videoPipeSelectedMode: plan.videoPipePlan?.selectedMode,
    videoPipeSelectedBackendPipe: plan.videoPipePlan?.selectedBackendPipe,
    videoPipeSelectionReasonCodeCount: plan.videoPipePlan?.selectionReasonCodes?.length ?? 0,
    videoPipeVisualBibleAlignmentStatus: plan.videoPipePlan?.visualBibleAlignment?.status,
    videoPipeOptionCount: plan.videoPipePlan?.pipeOptions?.length ?? 0,
    mediaReferenceCount: plan.mediaReferencePlan.length,
    mediaProviderHandoffCount: plan.mediaReferencePlan.filter((reference) => reference.includeInProviderHandoff).length,
    seedanceRecommendedProviderMode: plan.seedanceRouting.recommendedProviderMode,
    seedancePreferredTier: plan.seedanceRouting.preferredTier,
    seedanceResolution: plan.seedanceRouting.resolution,
    seedanceReturnLastFrame: plan.seedanceRouting.returnLastFrame,
    seedanceReferenceTagCount: plan.seedanceRouting.referenceTags.length,
    seedancePromptRecipeName: plan.seedanceRouting.promptRecipe.name,
    rawReferenceSerialized: false,
    canUseAsNoSpendViralEvidence: plan.viralIntelligence.releaseGateSummary.canUseAsNoSpendViralEvidence,
    canReleaseToCustomerTraffic: plan.viralIntelligence.releaseGateSummary.canReleaseToCustomerTraffic
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function redactHandoffProviderReferenceUris(handoff) {
  return {
    ...handoff,
    request: {
      ...handoff.request,
      references: (handoff.request.references ?? []).map((reference) => ({
        ...reference,
        providerReference: {
          ...reference.providerReference,
          uri: "[PROVIDER_REFERENCE_URI_REDACTED]"
        }
      }))
    }
  };
}
