#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-backend-integration-audit-report.json";

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

const sourceFiles = listFiles(resolve(repoRoot, "src"))
  .filter((filePath) => filePath.endsWith(".ts"))
  .map(toRepoPath)
  .sort();
const scriptFiles = listFiles(resolve(repoRoot, "scripts"))
  .filter((filePath) => filePath.endsWith(".mjs"))
  .map(toRepoPath)
  .sort();
const sourceSet = new Set(sourceFiles);
const graph = new Map(sourceFiles.map((filePath) => [filePath, sourceImports(filePath, sourceSet)]));
const inbound = new Map(sourceFiles.map((filePath) => [filePath, 0]));
for (const imports of graph.values()) {
  for (const imported of imports) {
    inbound.set(imported, (inbound.get(imported) ?? 0) + 1);
  }
}

const sourceRoots = [
  "src/index.ts",
  "src/api/server.ts",
  "src/application/preflight-entrypoint.ts",
  "src/application/render-request-validation-entrypoint.ts",
  "src/application/paid-render-validation-entrypoint.ts",
  "src/application/validation-readiness-entrypoint.ts",
  "src/application/artifact-validation-entrypoint.ts",
  ...scriptDistRoots(scriptFiles, sourceSet)
].filter((filePath, index, values) => sourceSet.has(filePath) && values.indexOf(filePath) === index);

const reachable = reachableFrom(sourceRoots, graph);
const scopedFiles = sourceFiles.filter(isShortScoped);
const disconnectedScopedFiles = scopedFiles.filter((filePath) => !reachable.has(filePath));
const zeroInboundScopedFiles = scopedFiles.filter((filePath) => (inbound.get(filePath) ?? 0) === 0 && !sourceRoots.includes(filePath));
const newCorpusFiles = [
  "src/core/short-prompt-pattern-corpus.ts",
  "src/core/short-platform-template-corpus.ts"
];
const newCorpusReachability = newCorpusFiles.map((filePath) => ({
  filePath,
  exists: sourceSet.has(filePath),
  reachableFromBackendOrValidation: reachable.has(filePath),
  inboundImportCount: inbound.get(filePath) ?? 0
}));

const checks = [
  disconnectedScopedFiles.length === 0
    ? pass("short_scoped_files_reachable", "All short/source-video scoped TypeScript files are reachable from backend or validation roots.")
    : fail("short_scoped_files_reachable", `${disconnectedScopedFiles.length} scoped file(s) are not reachable from configured roots.`),
  newCorpusReachability.every((item) => item.exists && item.reachableFromBackendOrValidation && item.inboundImportCount > 0)
    ? pass("new_corpus_files_connected", "New prompt/template corpus files are imported by the backend planning/render path.")
    : fail("new_corpus_files_connected", "One or more corpus files are missing or not imported."),
  zeroInboundScopedFiles.filter((filePath) => !sourceRoots.includes(filePath)).length === 0
    ? pass("no_unreferenced_scoped_sources", "No short/source-video scoped source file has zero inbound imports outside roots.")
    : fail("no_unreferenced_scoped_sources", `${zeroInboundScopedFiles.length} scoped file(s) have zero inbound imports.`)
];

const report = {
  schemaVersion: "cinejelly.short-backend-integration-audit.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: {
    sourceFileCount: sourceFiles.length,
    scriptFileCount: scriptFiles.length,
    sourceRootCount: sourceRoots.length,
    scopedFileCount: scopedFiles.length,
    reachableScopedFileCount: scopedFiles.length - disconnectedScopedFiles.length
  },
  sourceRoots,
  newCorpusReachability,
  disconnectedScopedFiles,
  zeroInboundScopedFiles,
  checks,
  releaseGateSummary: {
    canUseAsNoSpendBackendIntegrationEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Import graph audit proves source connectivity only; it does not replace build, smoke tests, paid render validation, artifact review, or production UI QA."
  }
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function listFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = resolve(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      output.push(...listFiles(absolutePath));
    } else if (stats.isFile()) {
      output.push(absolutePath);
    }
  }
  return output;
}

function sourceImports(filePath, sourceSet) {
  const text = readFileSync(resolve(repoRoot, filePath), "utf8");
  const imports = new Set();
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier?.startsWith(".")) {
      continue;
    }
    const resolved = resolveRelativeSource(filePath, specifier, sourceSet);
    if (resolved) {
      imports.add(resolved);
    }
  }
  return [...imports].sort();
}

function scriptDistRoots(files, sourceSet) {
  const roots = new Set();
  const distImportPattern = /["']\.\.\/dist\/([^"']+)\.js["']/g;
  for (const filePath of files) {
    const text = readFileSync(resolve(repoRoot, filePath), "utf8");
    for (const match of text.matchAll(distImportPattern)) {
      const candidate = `src/${match[1]}.ts`.replaceAll("\\", "/");
      if (sourceSet.has(candidate)) {
        roots.add(candidate);
      }
    }
  }
  return [...roots].sort();
}

function resolveRelativeSource(fromFile, specifier, sourceSet) {
  const base = resolve(repoRoot, dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    resolve(base, "index.ts"),
    base.endsWith(".js") ? `${base.slice(0, -3)}.ts` : "",
    base.endsWith(".ts") ? base : ""
  ].filter(Boolean).map(toRepoPath);
  return candidates.find((candidate) => sourceSet.has(candidate));
}

function reachableFrom(roots, graph) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const next of graph.get(current) ?? []) {
      if (!seen.has(next)) {
        queue.push(next);
      }
    }
  }
  return seen;
}

function isShortScoped(filePath) {
  return /^src\/(?:core|api|types)\/short/.test(filePath) ||
    /^src\/(?:core|agents|types)\/source-video/.test(filePath) ||
    filePath === "src/config/seedance-settings.ts";
}

function toRepoPath(absolutePath) {
  return relative(repoRoot, absolutePath).replaceAll("\\", "/");
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
