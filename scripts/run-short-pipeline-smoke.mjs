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

const serialized = JSON.stringify({ reviewRequiredPlan, blockedPlan, naturalOnlyPlan });
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
    : fail("natural_language_only_plan", "Expected natural-language-only brief to plan without requiring a template or URL.")
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
    rawUrlLeakCheckPassed: !rawUrlLeaked
  },
  scenarios: {
    reviewRequired: summarizePlan(reviewRequiredPlan),
    blocked: summarizePlan(blockedPlan),
    naturalOnly: summarizePlan(naturalOnlyPlan)
  },
  checks,
  releaseGateSummary: {
    shortPipelineSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Short-pipeline smoke proves no-spend planning, optional templates, brand guard, product URL fingerprinting, and review checkpoints only; render, deployment, paid validation, and manual media review remain separate gates."
  },
  nextActions: [
    "Wire accepted short-pipeline plans into async render-job submission after human review approval.",
    "Add the missing video-db/Director snapshot/translation audit before claiming full source coverage.",
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
    canUseAsNoSpendPlanningEvidence: plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence,
    canReleaseToCustomerTraffic: plan.releaseGateSummary.canReleaseToCustomerTraffic
  };
}

function hasEveryReviewSurface(plan) {
  const counts = plan.reviewApproval.summary.surfaceCounts;
  return counts.scene > 0 && counts.audio > 0 && counts.caption > 0 && counts.claim > 0;
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
