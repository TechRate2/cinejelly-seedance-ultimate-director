#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/product-url-extraction-smoke-report.json";

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

const {
  ProductUrlResearcher,
  mergeProductUrlSnapshots,
  safeProductUrlResearchSummary
} = await import("../dist/core/product-url-researcher.js");
const { ShortPipelinePlanner } = await import("../dist/core/short-pipeline-planner.js");

const cleanProductUrl = "https://shop.example.com/products/glow-focus-serum";
const unsafeProductUrl = "https://shop.example.com/products/glow-focus-serum?token=secret";
const generatedAt = new Date("2026-06-19T00:00:00.000Z");
const html = String.raw`<!doctype html>
<html>
  <head>
    <title>Glow Focus Serum | Glow Lab</title>
    <meta name="description" content="A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.">
    <meta property="og:image" content="https://cdn.example.com/glow-focus-serum/front.jpg">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Glow Focus Serum",
        "description": "A lightweight serum for busy skincare buyers. Visibly improves dull-looking skin and layers cleanly under makeup.",
        "category": "Beauty serum",
        "slogan": "Premium daily glow support",
        "image": [
          "https://cdn.example.com/glow-focus-serum/front.jpg",
          "https://cdn.example.com/glow-focus-serum/texture.jpg"
        ],
        "offers": {
          "@type": "Offer",
          "price": "39",
          "priceCurrency": "USD"
        }
      }
    </script>
  </head>
  <body>
    <h1>Glow Focus Serum</h1>
    <p>Made for busy skincare buyers who want a premium but simple morning routine.</p>
    <p>Visibly improves dull-looking skin in daily routines. Lightweight texture layers cleanly under makeup.</p>
    <p>Shop now for a cleaner, smoother looking morning routine.</p>
  </body>
</html>`;

const fakeFetchCalls = [];
const researcher = new ProductUrlResearcher({
  fetch: async (url, init) => {
    fakeFetchCalls.push({
      url,
      method: init.method,
      accept: init.headers.Accept,
      userAgent: init.headers["User-Agent"]
    });
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null;
        }
      },
      text: async () => html
    };
  }
});
const planner = new ShortPipelinePlanner();

const cleanExtractionResearch = await researcher.research({
  productUrl: cleanProductUrl,
  userPrompt: "Create a premium TikTok product ad for busy skincare buyers, 28 seconds, shop now.",
  confirmLiveNetwork: true,
  maxBytes: 256_000,
  timeoutMs: 2_000,
  fetchedAt: generatedAt
});
const cleanSafeResearch = safeProductUrlResearchSummary(cleanExtractionResearch);
const mergedSnapshot = cleanExtractionResearch.snapshot
  ? mergeProductUrlSnapshots(cleanExtractionResearch.snapshot, {
      targetBuyer: "busy skincare buyers",
      cta: "Shop now"
    })
  : undefined;
const cleanPlan = planner.buildPlan({
  projectId: "product_url_extraction_smoke",
  requestId: "req_product_url_extraction_clean",
  generatedAt,
  userPrompt: "Create a premium TikTok product ad for busy skincare buyers, 28 seconds, shop now.",
  product: {
    productUrl: cleanProductUrl,
    ...(mergedSnapshot ? { snapshot: mergedSnapshot } : {})
  },
  brandKit: {
    brandId: "glow_lab",
    brandName: "Glow Lab",
    tone: "premium but warm",
    language: "en",
    visualStyle: "clean macro beauty with soft highlights",
    allowedClaims: ["visibly improves dull-looking skin"],
    forbiddenClaims: ["cures acne overnight"],
    ctaRules: ["Use one CTA only"]
  }
});

const fetchCallsAfterClean = fakeFetchCalls.length;
const noConfirmationResearch = await researcher.research({
  productUrl: cleanProductUrl,
  confirmLiveNetwork: false,
  fetchedAt: generatedAt
});
const fetchCallsAfterNoConfirmation = fakeFetchCalls.length;
const unsafeResearch = await researcher.research({
  productUrl: unsafeProductUrl,
  confirmLiveNetwork: true,
  fetchedAt: generatedAt
});
const fetchCallsAfterUnsafe = fakeFetchCalls.length;

const serialized = JSON.stringify({
  cleanSafeResearch,
  cleanPlan,
  noConfirmation: safeProductUrlResearchSummary(noConfirmationResearch),
  unsafe: safeProductUrlResearchSummary(unsafeResearch)
});
const rawUrlLeaked = serialized.includes(cleanProductUrl) ||
  serialized.includes("token=secret") ||
  serialized.includes("https://cdn.example.com/glow-focus-serum");

const checks = [
  cleanExtractionResearch.status === "ready" &&
    cleanExtractionResearch.snapshot &&
    cleanSafeResearch.summary.titlePresent &&
    cleanSafeResearch.summary.descriptionPresent &&
    cleanSafeResearch.summary.imageCount >= 1 &&
    cleanSafeResearch.summary.pricePresent
    ? pass("extracts_product_facts", "Confirmed product research extracts title, description, image evidence, price, benefits, and claims from bounded HTML.")
    : fail("extracts_product_facts", "Expected clean product URL research to extract product facts from bounded HTML."),
  fetchCallsAfterClean === 1 &&
    cleanExtractionResearch.fetch.attempted &&
    cleanExtractionResearch.fetch.byteCount > 0 &&
    cleanExtractionResearch.fetch.byteCount <= 256_000
    ? pass("bounded_confirmed_fetch", "Research makes exactly one bounded fake fetch after explicit live-network confirmation.")
    : fail("bounded_confirmed_fetch", "Expected one bounded fetch only after explicit confirmation."),
  cleanPlan.status === "approval_required" &&
    cleanPlan.productBrief?.status === "review_required" &&
    cleanPlan.scenes.length > 0 &&
    cleanPlan.reviewApproval.summary.surfaceCounts.claim > 0 &&
    cleanPlan.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("feeds_short_pipeline_plan", "Extracted facts feed the short-pipeline planner with scenes and claim checkpoints while still requiring review.")
    : fail("feeds_short_pipeline_plan", "Expected extracted product facts to produce a review-gated short-pipeline plan."),
  noConfirmationResearch.status === "blocked_by_live_network_confirmation" &&
    noConfirmationResearch.fetch.attempted === false &&
    fetchCallsAfterNoConfirmation === fetchCallsAfterClean
    ? pass("blocks_without_confirmation", "Research refuses product URL fetching until confirmLiveNetwork=true is supplied.")
    : fail("blocks_without_confirmation", "Expected product URL research to block before network confirmation."),
  unsafeResearch.status === "blocked_by_unsafe_url" &&
    unsafeResearch.fetch.attempted === false &&
    fetchCallsAfterUnsafe === fetchCallsAfterNoConfirmation
    ? pass("blocks_unsafe_query_url", "Research refuses credential-like product URL query values before any fetch.")
    : fail("blocks_unsafe_query_url", "Expected unsafe product URL query values to block before fetch."),
  !rawUrlLeaked &&
    cleanPlan.productBrief?.source.sourceUrlSha256 &&
    cleanPlan.productBrief.images.every((image) => image.imageUrlSha256 && !("rawUrl" in image))
    ? pass("redacts_raw_urls", "Public research and plan evidence contain hashed source/image evidence without raw product or media URLs.")
    : fail("redacts_raw_urls", "Expected public evidence to avoid raw product, query, and media URL leakage.")
];

const report = {
  schemaVersion: "cinejelly.product-url-extraction-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  liveProductFetchMade: false,
  sourcePatternOrigins: [
    "calesthio/OpenMontage",
    "HKUDS/VideoAgent",
    "video-db/Director",
    "vericontext/vibeframe"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 3,
    endpointPath: "/v1/short-pipeline/product-url-plan",
    rawUrlLeakCheckPassed: !rawUrlLeaked,
    simulatedFetchCallCount: fakeFetchCalls.length
  },
  scenarios: {
    cleanExtraction: summarizeResearchAndPlan(cleanSafeResearch, cleanPlan, fetchCallsAfterClean),
    noConfirmation: summarizeResearch(noConfirmationResearch, fetchCallsAfterNoConfirmation),
    unsafeUrlBlocked: summarizeResearch(unsafeResearch, fetchCallsAfterUnsafe)
  },
  checks,
  releaseGateSummary: {
    productUrlExtractionSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsProductUrlToVideoBackendEvidence: checks.every((check) => check.status === "pass"),
    canUseAsBusinessReadinessProductUrlEvidence: false,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Product URL extraction smoke proves backend parsing, fetch gating, planner handoff, and redaction using a fake fetch only; archived live URL evidence, media rights review, and manual output review remain separate gates."
  },
  nextActions: [
    "Run archived live Product URL-to-Video evidence only after an operator supplies an approved public product URL and accepts crawl/media-rights policy.",
    "Add first-party UI review controls for extracted facts, claims, images, captions, and scene approval before render spend.",
    "Keep this smoke in report-contract validation so URL-to-video backend changes cannot silently regress."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function summarizeResearchAndPlan(research, plan, fetchCallCount) {
  return {
    researchStatus: research.status,
    fetchAttempted: research.fetch.attempted,
    simulatedFetchCallCount: fetchCallCount,
    sourceStatus: research.source.status,
    sourceHostPresent: Boolean(research.source.sourceHost),
    sourceUrlSha256Present: Boolean(research.source.sourceUrlSha256),
    titlePresent: research.summary.titlePresent,
    descriptionPresent: research.summary.descriptionPresent,
    benefitCount: research.summary.benefitCount,
    claimCount: research.summary.claimCount,
    imageCount: research.summary.imageCount,
    pricePresent: research.summary.pricePresent,
    planStatus: plan.status,
    planSceneCount: plan.scenes.length,
    productBriefStatus: plan.productBrief?.status,
    claimCheckpointCount: plan.reviewApproval.summary.surfaceCounts.claim,
    canUseAsProductUrlToVideoBackendEvidence: research.summary.canUseAsProductUrlToVideoBackendEvidence,
    canReleaseToCustomerTraffic: false
  };
}

function summarizeResearch(research, fetchCallCount) {
  return {
    researchStatus: research.status,
    fetchAttempted: research.fetch.attempted,
    simulatedFetchCallCount: fetchCallCount,
    sourceStatus: research.source.status,
    sourceUrlSha256Present: Boolean(research.source.sourceUrlSha256),
    issueCount: research.issues.length,
    canUseAsProductUrlToVideoBackendEvidence: research.summary.canUseAsProductUrlToVideoBackendEvidence,
    canReleaseToCustomerTraffic: false
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
