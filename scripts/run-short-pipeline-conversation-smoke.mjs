#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-pipeline-conversation-smoke-report.json";

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

const { ShortPipelineConversationEngine } = await import("../dist/core/short-pipeline-conversation.js");
const engine = new ShortPipelineConversationEngine();
const generatedAt = new Date("2026-06-19T00:00:00.000Z");

const product = {
  productUrl: "https://shop.example.com/products/glow-focus-serum",
  snapshot: {
    productTitle: "Glow Focus Serum",
    category: "beauty",
    metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
    priceText: "$39",
    imageUrls: [
      "https://cdn.example.com/glow-focus-serum/front.jpg",
      "https://cdn.example.com/glow-focus-serum/texture.jpg"
    ],
    benefits: [
      "Visibly improves dull-looking skin in daily routines",
      "Lightweight texture layers cleanly under makeup"
    ],
    claims: [
      "Visibly improves dull-looking skin"
    ],
    targetBuyer: "busy skincare buyers",
    cta: "Shop now"
  }
};
const brandKit = {
  brandId: "glow_lab",
  brandName: "Glow Lab",
  tone: "premium but warm",
  language: "en",
  visualStyle: "clean macro beauty with soft highlights",
  colorPalette: ["#f7e8df", "#222222", "#ffffff"],
  allowedClaims: ["visibly improves dull-looking skin"],
  forbiddenClaims: ["cures acne overnight"],
  ctaRules: ["Use one CTA only"],
  voicePreferences: ["calm confident narration"]
};

const naturalChat = engine.buildSession({
  projectId: "short_pipeline_conversation_smoke",
  requestId: "req_conversation_natural",
  generatedAt,
  messages: [
    {
      role: "user",
      createdAt: generatedAt,
      text: "Create a premium TikTok product ad for busy skincare buyers with a trustworthy, proof-led concept and clear review checkpoints before render."
    }
  ],
  product,
  brandKit,
  targetPlatform: "tiktok",
  targetDurationSeconds: 28
});

const revisionNoTemplate = engine.buildSession({
  projectId: "short_pipeline_conversation_smoke",
  requestId: "req_conversation_revision",
  generatedAt,
  messages: [
    {
      role: "user",
      createdAt: generatedAt,
      text: "Create a premium TikTok product ad for busy skincare buyers. Suggest ideas but keep the workflow flexible."
    },
    {
      role: "user",
      createdAt: generatedAt,
      text: "Revise it: make it more educational, remove discount language, and use a custom workflow without templates."
    }
  ],
  product,
  brandKit,
  targetPlatform: "tiktok",
  targetDurationSeconds: 28
});

const approvalIntent = engine.buildSession({
  projectId: "short_pipeline_conversation_smoke",
  requestId: "req_conversation_approval_intent",
  generatedAt,
  messages: [
    {
      role: "user",
      createdAt: generatedAt,
      text: "Create a clean product ad. Product page is https://shop.example.com/products/glow-focus-serum?api_key=secret and the local draft is C:\\Users\\Admin\\secret.txt."
    },
    {
      role: "user",
      createdAt: generatedAt,
      text: "Approved, looks good to render, but keep all formal checkpoints before spend."
    }
  ],
  product,
  brandKit,
  targetPlatform: "tiktok",
  targetDurationSeconds: 24
});

const serialized = JSON.stringify({ naturalChat, revisionNoTemplate, approvalIntent });
const rawTranscriptLeaked = serialized.includes("api_key=secret") ||
  serialized.includes("C:\\Users\\Admin\\secret.txt") ||
  serialized.includes("Product page is https://shop.example.com");
const rawUrlLeaked = serialized.includes("https://shop.example.com/products/glow-focus-serum") ||
  serialized.includes("https://cdn.example.com/glow-focus-serum");

const checks = [
  naturalChat.noSpend && !naturalChat.networkCallsMade && !naturalChat.providerCallsMade &&
    naturalChat.plan.scenes.length > 0 &&
    naturalChat.analysis.userReviewState === "needs_review"
    ? pass("natural_chat_creates_reviewable_plan", "Natural-language chat creates a no-spend concept, scene plan, and review-gated short-pipeline plan.")
    : fail("natural_chat_creates_reviewable_plan", "Expected natural chat to create a reviewable no-spend short-pipeline plan."),
  naturalChat.plan.dynamicWorkflowRequired &&
    naturalChat.plan.templatePolicy === "suggested_optional" &&
    naturalChat.plan.templateSuggestions.every((item) => item.usePolicy === "optional_accelerator")
    ? pass("templates_are_optional_accelerators", "Template suggestions remain optional accelerators and dynamic workflow stays required.")
    : fail("templates_are_optional_accelerators", "Expected optional template suggestions without forcing template mode."),
  revisionNoTemplate.analysis.userReviewState === "revision_requested" &&
    revisionNoTemplate.analysis.requestedChanges.length > 0 &&
    revisionNoTemplate.analysis.templatePreference === "user_rejected_templates" &&
    revisionNoTemplate.plan.templatePolicy === "none" &&
    revisionNoTemplate.plan.dynamicWorkflowRequired
    ? pass("revision_can_reject_templates", "Conversation revisions are tracked and a user can explicitly reject templates while preserving dynamic planning.")
    : fail("revision_can_reject_templates", "Expected revision turn to reject templates and preserve dynamic planning."),
  approvalIntent.analysis.userReviewState === "approval_intent_detected" &&
    approvalIntent.plan.reviewApproval.status === "approval_required" &&
    approvalIntent.releaseGateSummary.canRenderAfterFormalApproval === false &&
    approvalIntent.releaseGateSummary.releaseBlocker.includes("formal")
    ? pass("approval_intent_still_requires_formal_checkpoints", "A conversational approval phrase does not bypass formal scene/audio/no-visible-text/claim checkpoint evidence.")
    : fail("approval_intent_still_requires_formal_checkpoints", "Expected approval intent to remain blocked from render until formal checkpoints are accepted."),
  naturalChat.rawTranscriptStored === false &&
    revisionNoTemplate.rawTranscriptStored === false &&
    approvalIntent.rawTranscriptStored === false &&
    naturalChat.turns.every((turn) => turn.rawMessageStored === false) &&
    revisionNoTemplate.turns.every((turn) => turn.rawMessageStored === false) &&
    approvalIntent.turns.every((turn) => turn.rawMessageStored === false) &&
    !rawTranscriptLeaked &&
    !rawUrlLeaked
    ? pass("transcript_and_url_redaction", "Conversation evidence stores digests and redacted summaries without raw transcript, raw product URLs, local paths, or secret-like values.")
    : fail("transcript_and_url_redaction", "Expected public conversation evidence to avoid raw transcript, product URLs, local paths, and secret-like values."),
  naturalChat.releaseGateSummary.canReleaseToCustomerTraffic === false &&
    revisionNoTemplate.releaseGateSummary.canReleaseToCustomerTraffic === false &&
    approvalIntent.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("never_claims_customer_traffic", "Conversation evidence never claims customer-traffic readiness.")
    : fail("never_claims_customer_traffic", "Expected all conversation evidence to keep customer traffic blocked.")
];

const report = {
  schemaVersion: "cinejelly.short-pipeline-conversation-smoke.v1",
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
    endpointPath: "/v1/short-pipeline/conversation",
    rawTranscriptLeakCheckPassed: !rawTranscriptLeaked,
    rawUrlLeakCheckPassed: !rawUrlLeaked
  },
  scenarios: {
    naturalChat: summarizeSession(naturalChat),
    revisionNoTemplate: summarizeSession(revisionNoTemplate),
    approvalIntent: summarizeSession(approvalIntent)
  },
  checks,
  releaseGateSummary: {
    shortPipelineConversationSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Conversation smoke proves natural-language session planning, revision tracking, optional templates, formal review gating, and redaction only; UI, live paid render, deployment, and manual media review remain separate gates."
  },
  nextActions: [
    "Build first-party Create Video and Review UI screens on top of /v1/short-pipeline/conversation.",
    "Persist operator-owned conversation state outside public evidence if product scope requires multi-device sessions.",
    "Run live short-pipeline render validation only after formal review decisions, explicit spend confirmation, and artifact review are accepted."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function summarizeSession(session) {
  return {
    sessionId: session.sessionId,
    turnCount: session.turns.length,
    rawTranscriptStored: session.rawTranscriptStored,
    analysisUserReviewState: session.analysis.userReviewState,
    templatePreference: session.analysis.templatePreference,
    requestedChangeCount: session.analysis.requestedChanges.length,
    riskSignalCount: session.analysis.riskSignals.length,
    planStatus: session.plan.status,
    templatePolicy: session.plan.templatePolicy,
    dynamicWorkflowRequired: session.plan.dynamicWorkflowRequired,
    sceneCount: session.plan.scenes.length,
    reviewApprovalStatus: session.plan.reviewApproval.status,
    reviewCheckpointCount: session.plan.reviewApproval.summary.checkpointCount,
    canUseAsNoSpendConversationEvidence: session.releaseGateSummary.canUseAsNoSpendConversationEvidence,
    canRenderAfterFormalApproval: session.releaseGateSummary.canRenderAfterFormalApproval,
    canReleaseToCustomerTraffic: session.releaseGateSummary.canReleaseToCustomerTraffic
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
