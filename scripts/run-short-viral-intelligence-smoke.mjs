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
  }
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

const serialized = JSON.stringify({
  viralPlan,
  copyRiskPlan,
  unsafeReferencePlan,
  conversation,
  renderHandoff
});
const rawReferenceLeak = serialized.includes("https://media.example.com/reference/glow-review") ||
  serialized.includes("https://media.example.com/reference/copy-risk") ||
  serialized.includes("https://media.example.com/reference/conversation-pattern") ||
  serialized.includes("C:\\Users\\Admin\\Videos\\secret-reference.mp4") ||
  serialized.includes("signature=abc123");

const checks = [
  viralPlan.noSpend && !viralPlan.networkCallsMade && !viralPlan.providerCallsMade &&
    viralPlan.viralIntelligence.noSpend && !viralPlan.viralIntelligence.networkCallsMade && !viralPlan.viralIntelligence.providerCallsMade
    ? pass("no_spend_no_network", "Short viral intelligence runs as deterministic no-spend planning evidence.")
    : fail("no_spend_no_network", "Expected viral intelligence to avoid network, provider, Atlas, and render paths."),
  viralPlan.viralIntelligence.nicheStrategy.platformFocus === "tiktok_douyin" &&
    viralPlan.viralIntelligence.nicheStrategy.creativeMode === "ugc_review" &&
    viralPlan.viralIntelligence.nicheStrategy.viralLevers.includes("fast_hook") &&
    viralPlan.viralIntelligence.nicheStrategy.viralLevers.includes("caption_retention")
    ? pass("tiktok_douyin_ugc_strategy", "TikTok/Douyin UGC strategy, retention levers, and niche intent are inferred.")
    : fail("tiktok_douyin_ugc_strategy", "Expected TikTok/Douyin-first UGC strategy with retention levers."),
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
  unsafeReferencePlan.status === "blocked" &&
    unsafeReferencePlan.viralIntelligence.status === "blocked" &&
    unsafeReferencePlan.viralIntelligence.findings.some((finding) => finding.code === "reference_video_unsafe_source") &&
    !rawReferenceLeak
    ? pass("unsafe_reference_blocks_plan", "Unsafe local/private reference sources block the plan without serializing raw paths.")
    : fail("unsafe_reference_blocks_plan", "Expected unsafe reference source to block planning and stay redacted."),
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
    "vericontext/vibeframe"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 5,
    referenceRawLeakCheckPassed: !rawReferenceLeak,
    endpointsCovered: [
      "/v1/short-pipeline/plan",
      "/v1/short-pipeline/conversation",
      "/v1/short-pipeline/product-url-plan",
      "/v1/short-pipeline/render-jobs"
    ]
  },
  scenarios: {
    viralPlan: summarizePlan(viralPlan),
    copyRisk: summarizePlan(copyRiskPlan),
    unsafeReference: summarizePlan(unsafeReferencePlan),
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
      promptHasViralStrategy: renderHandoff.request.userInput.includes("Short viral strategy:"),
      promptHasSceneDirectives: renderHandoff.request.userInput.includes("Viral scene directives:"),
      promptHasReferenceGuardrail: renderHandoff.request.userInput.includes("do not copy source script wording"),
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
    viralLeverCount: plan.viralIntelligence.nicheStrategy.viralLevers.length,
    conceptScoreCount: plan.viralIntelligence.conceptScores.length,
    winningConceptIdPresent: Boolean(plan.viralIntelligence.winningConceptId),
    sceneDirectiveCount: plan.viralIntelligence.sceneDirectives.length,
    findingCodes: plan.viralIntelligence.findings.map((finding) => finding.code),
    referencePatternIdPresent: Boolean(plan.viralIntelligence.referenceVideoPattern?.patternId),
    referenceSafetyStatus: plan.viralIntelligence.referenceVideoPattern?.safetyStatus ?? "not_provided",
    referenceSourceUrlSha256Present: Boolean(plan.viralIntelligence.referenceVideoPattern?.sourceUrlSha256),
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
