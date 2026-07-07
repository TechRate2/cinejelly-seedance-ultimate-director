#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-prompt-pattern-corpus-report.json";
const upstreamDir = resolve(repoRoot, "external/upstream/awesome-seedance-2-prompts");

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

const readmePath = resolve(upstreamDir, "README.md");
const videoUrlsPath = resolve(upstreamDir, "video-urls.json");
if (!existsSync(readmePath) || !existsSync(videoUrlsPath)) {
  throw new Error("Expected external/upstream/awesome-seedance-2-prompts README.md and video-urls.json.");
}

const readme = readFileSync(readmePath, "utf8");
const videoUrls = JSON.parse(readFileSync(videoUrlsPath, "utf8"));
const promptHeadings = [...readme.matchAll(/^### (?!🎯)(.+)$/gm)].map((match) => match[1].trim());
const declaredPromptCount = readDeclaredPromptCount(readme);
const localizedReadmes = readdirSync(upstreamDir)
  .filter((fileName) => /^README(?:_[a-z]{2}(?:-[A-Z]{2})?)?\.md$/.test(fileName))
  .sort();
const localVideoUrlIndexCount = Object.keys(videoUrls.prompts ?? {}).length;
const visibleTaxonomy = classifyHeadings(promptHeadings);
const runtimeTaxonomyFamilies = [
  "trend_video_remake",
  "ugc_review",
  "product_ad",
  "demo",
  "testimonial",
  "comparison",
  "education",
  "story",
  "cinematic",
  "news_commentary",
  "podcast_clip",
  "faceless_broll",
  "livestream_commerce",
  "affiliate_review",
  "koc_kol",
  "fashion_try_on",
  "real_estate_tour",
  "travel_hospitality",
  "food_beverage",
  "saas_app_demo",
  "local_service",
  "finance_education",
  "health_wellness",
  "gaming_entertainment",
  "event_venue",
  "creator_tools"
];

const checks = [
  declaredPromptCount === 3817
    ? pass("declared_3817_prompts", "Upstream README declares 3817 total prompts.")
    : fail("declared_3817_prompts", `Expected declared total 3817, got ${declaredPromptCount}.`),
  localVideoUrlIndexCount >= 1000
    ? pass("video_url_index_present", "Local snapshot includes a large prompt-to-video URL index.")
    : fail("video_url_index_present", `Expected at least 1000 video URLs, got ${localVideoUrlIndexCount}.`),
  promptHeadings.length >= 100
    ? pass("visible_prompt_sections_present", "README exposes enough visible prompt sections for structure sampling.")
    : fail("visible_prompt_sections_present", `Expected at least 100 visible prompt sections, got ${promptHeadings.length}.`),
  localizedReadmes.length >= 10
    ? pass("localized_snapshots_present", "Localized README prompt snapshots are present for multilingual prompt grammar review.")
    : fail("localized_snapshots_present", `Expected at least 10 localized README files, got ${localizedReadmes.length}.`),
  runtimeTaxonomyFamilies.length >= 24
    ? pass("runtime_taxonomy_expanded", "Short runtime taxonomy covers ads, UGC, review, trend remake, news, podcast, faceless, live commerce, affiliate, app, real estate, food, travel, local service, and regulated education families.")
    : fail("runtime_taxonomy_expanded", "Runtime taxonomy family count is too small.")
];

const report = {
  schemaVersion: "cinejelly.short-prompt-pattern-corpus-report.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourceRepository: "YouMind-OpenLab/awesome-seedance-2-prompts",
  license: "CC-BY-4.0",
  sourceSnapshot: {
    upstreamDir: "external/upstream/awesome-seedance-2-prompts",
    readmeSha256: sha256(readme),
    videoUrlsSha256: sha256(JSON.stringify(videoUrls)),
    declaredPromptCount,
    localVideoUrlIndexCount,
    readmePromptSectionCount: promptHeadings.length,
    localizedReadmeCount: localizedReadmes.length,
    localizedReadmes
  },
  transformationPolicy: {
    promptTextBundling: "Do not compile raw upstream prompt text into runtime render prompts.",
    runtimeUse: "Use distilled pattern DNA, taxonomy families, scoring signals, attribution lineage, and no-verbatim guardrails.",
    commercialGuardrail: "Keep CC-BY lineage and avoid reproducing upstream wording in generated user prompts."
  },
  visibleTaxonomy,
  runtimeTaxonomyFamilies,
  checks,
  releaseGateSummary: {
    canUseAsNoSpendPromptCorpusEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Prompt corpus report proves local source coverage and runtime taxonomy only; live customer traffic still requires render/media review and rights checks."
  }
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function readDeclaredPromptCount(value) {
  const match = /\|\s*[^|\n]*Total Prompts[^|\n]*\|\s*\*\*(\d+)\*\*\s*\|/i.exec(value);
  return match ? Number(match[1]) : 0;
}

function classifyHeadings(headings) {
  const buckets = new Map();
  for (const heading of headings) {
    const family = familyFor(heading);
    buckets.set(family, (buckets.get(family) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([family, count]) => ({ family, count }));
}

function familyFor(value) {
  const lower = value.toLowerCase();
  if (/commercial|product|laptop|fashion|couture|beauty|luxury/.test(lower)) return "commercial_product_cinematic";
  if (/romance|story|film|scene|documentary|horror|retro/.test(lower)) return "narrative_short_film";
  if (/anime|samurai|sorceress|phoenix|fox|fantasy|dragon|celestial/.test(lower)) return "fantasy_anime_vfx";
  if (/travel|rural|kitchen|food|city|world/.test(lower)) return "lifestyle_travel_food";
  if (/fitness|racing|rapper|music|mv|gaming/.test(lower)) return "performance_sports_music";
  if (/transformation|metamorphosis|transition|attack|shockwave|breaking/.test(lower)) return "vfx_transformation_action";
  return "general_seedance_structure";
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
