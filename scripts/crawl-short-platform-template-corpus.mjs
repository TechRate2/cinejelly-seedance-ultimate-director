#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-platform-template-corpus-report.json";

const publicSources = [
  {
    id: "topview_openapi",
    label: "Topview AI public OpenAPI/workflow docs",
    url: "https://www.topview.ai/openapi",
    licensePolicy: "public-docs-observation",
    requiredAnyKeywords: ["api", "video", "product", "template", "avatar"]
  },
  {
    id: "topview_docs_getting_started",
    label: "Topview AI API getting-started docs",
    url: "https://docs.topview.ai/docs/getting-started",
    licensePolicy: "public-docs-observation",
    requiredAnyKeywords: ["api", "task", "video", "image", "avatar"]
  },
  {
    id: "higgsfield_product_video_guide",
    label: "Higgsfield official product-to-video guide",
    url: "https://higgsfield.ai/blog/Create-Selling-Content-Using-Higgsfield",
    licensePolicy: "public-docs-observation",
    requiredAnyKeywords: ["product", "video", "image", "prompt", "camera"]
  },
  {
    id: "higgsfield_prompt_guide",
    label: "Higgsfield official cinematic prompt guide",
    url: "https://higgsfield.ai/blog/Prompt-Guide-to-Cinematic-AI-Videos",
    licensePolicy: "public-docs-observation",
    requiredAnyKeywords: ["prompt", "cinematic", "camera", "video", "motion"]
  },
  {
    id: "higgsfield_official_skills_license",
    label: "Higgsfield official skills MIT license",
    url: "https://raw.githubusercontent.com/higgsfield-ai/skills/main/LICENSE",
    licensePolicy: "MIT",
    requiredAnyKeywords: ["mit license", "permission is hereby granted"]
  },
  {
    id: "higgsfield_official_skills_readme",
    label: "Higgsfield official skills repository README",
    url: "https://raw.githubusercontent.com/higgsfield-ai/skills/main/README.md",
    licensePolicy: "MIT",
    requiredAnyKeywords: ["higgsfield", "marketing", "virality", "video", "product"]
  },
  {
    id: "higgsfield_prompt_skill_license",
    label: "OSideMedia Higgsfield prompt skill MIT license",
    url: "https://raw.githubusercontent.com/OSideMedia/higgsfield-ai-prompt-skill/main/LICENSE",
    licensePolicy: "MIT",
    requiredAnyKeywords: ["mit license", "permission is hereby granted"]
  },
  {
    id: "higgsfield_prompt_skill_readme",
    label: "OSideMedia Higgsfield prompt skill instructions",
    url: "https://raw.githubusercontent.com/OSideMedia/higgsfield-ai-prompt-skill/main/SKILL.md",
    licensePolicy: "MIT",
    requiredAnyKeywords: ["higgsfield", "prompt", "video", "camera", "motion"]
  }
];

function parseArgs(args) {
  const options = { outputPath: defaultOutput, writeReport: true, allowNetwork: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--offline") {
      options.allowNetwork = false;
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

const { SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE, SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS } =
  await import("../dist/core/short-platform-template-corpus.js");

const sourceResults = [];
for (const source of publicSources) {
  sourceResults.push(options.allowNetwork
    ? await crawlSource(source)
    : skippedSource(source, "offline_mode"));
}

const successfulSourceCount = sourceResults.filter((source) => source.status === "pass").length;
const failedSourceCount = sourceResults.filter((source) => source.status === "fail").length;
const checks = [
  successfulSourceCount >= publicSources.length
    ? pass("public_sources_reachable", "All public platform/template training sources were reachable.")
    : fail("public_sources_reachable", `${failedSourceCount} public source(s) failed crawl or keyword validation.`),
  SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.templateArchetypeCount >= 20
    ? pass("template_archetype_depth", "Runtime platform template corpus has enough transformed archetypes.")
    : fail("template_archetype_depth", "Runtime platform template corpus has too few archetypes."),
  SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.nicheFamilyCount >= 40
    ? pass("niche_family_depth", "Runtime platform template corpus spans broad niche families.")
    : fail("niche_family_depth", "Runtime platform template corpus has too few niche families."),
  SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.declaredPatternMatrixCount >= 900
    ? pass("pattern_matrix_depth", "Runtime platform template matrix is large enough for broad candidate learning.")
    : fail("pattern_matrix_depth", "Runtime platform template matrix is too small."),
  SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.promptTextBundlingPolicy === "no_raw_third_party_template_text_runtime_uses_distilled_structure"
    ? pass("no_raw_template_bundling", "Runtime policy forbids raw third-party template text in render prompts.")
    : fail("no_raw_template_bundling", "Runtime policy must forbid raw third-party template text."),
  sourceResults.some((source) => source.licensePolicy === "MIT" && source.keywordCheckPassed)
    ? pass("mit_source_present", "At least one MIT-licensed prompt-skill source is present.")
    : fail("mit_source_present", "Expected an MIT-licensed source with a passing keyword/license check."),
  sourceResults.every((source) => source.rawContentPersisted === false)
    ? pass("raw_content_not_persisted", "Crawler report stores hashes/counts only, not raw page/template bodies.")
    : fail("raw_content_not_persisted", "Crawler report must not persist raw source content.")
];

const report = {
  schemaVersion: "cinejelly.short-platform-template-corpus-report.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: options.allowNetwork,
  providerCallsMade: false,
  sourcePatternOrigins: SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS,
  crawlPolicy: {
    allowedSourceTypes: ["public docs", "public blog guides", "MIT licensed GitHub raw files", "operator-approved user/source-video patterns"],
    forbiddenSourceTypes: ["private dashboards", "logged-in template galleries", "anti-bot bypass", "raw competitor template copying"],
    transformationPolicy: "Distill hook, beat-map, camera grammar, proof device, risk controls, and niche tags; never bundle raw third-party templates into runtime render prompts."
  },
  runtimeCoverage: SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE,
  sourceResults,
  checks,
  releaseGateSummary: {
    canUseAsNoSpendTemplateTrainingEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Template training crawl proves public-source reachability and runtime matrix coverage only; paid renders, artifact review, and rights review remain separate gates."
  },
  nextActions: [
    "Keep adding public/licensed sources as distilled structure, not raw copied templates.",
    "Add operator feedback weights after the MVP review UI captures which candidate actually won.",
    "Run short viral and UI contract smoke after every corpus expansion."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

async function crawlSource(source) {
  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      headers: {
        "user-agent": "CineJelly short-template-corpus-audit/1.0"
      },
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    const lower = text.toLowerCase();
    const matchedKeywords = source.requiredAnyKeywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    const keywordCheckPassed = matchedKeywords.length > 0;
    return {
      id: source.id,
      label: source.label,
      url: source.url,
      status: response.ok && keywordCheckPassed ? "pass" : "fail",
      httpStatus: response.status,
      licensePolicy: source.licensePolicy,
      contentBytes: Buffer.byteLength(text, "utf8"),
      contentSha256: sha256(text),
      keywordCheckPassed,
      matchedKeywords,
      rawContentPersisted: false
    };
  } catch (error) {
    return {
      id: source.id,
      label: source.label,
      url: source.url,
      status: "fail",
      licensePolicy: source.licensePolicy,
      error: error instanceof Error ? error.message.slice(0, 240) : "unknown crawl error",
      keywordCheckPassed: false,
      matchedKeywords: [],
      rawContentPersisted: false
    };
  }
}

function skippedSource(source, reason) {
  return {
    id: source.id,
    label: source.label,
    url: source.url,
    status: "skipped",
    licensePolicy: source.licensePolicy,
    skippedReason: reason,
    keywordCheckPassed: false,
    matchedKeywords: [],
    rawContentPersisted: false
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
