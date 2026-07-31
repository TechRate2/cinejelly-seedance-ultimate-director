import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json"
};

const expectedSnapshots = [
  snapshot("seedance_2_0", "external/upstream/seedance-2.0", "Emily2040/seedance-2.0", "MIT"),
  snapshot("awesome_seedance_2_prompts", "external/upstream/awesome-seedance-2-prompts", "YouMind-OpenLab/awesome-seedance-2-prompts", "CC-BY-4.0"),
  snapshot("vimax", "external/upstream/vimax", "HKUDS/ViMax", "MIT"),
  snapshot("vibeframe", "external/upstream/vibeframe", "vericontext/vibeframe", "MIT"),
  snapshot("videoagent", "external/upstream/videoagent", "HKUDS/VideoAgent", "MIT top level; nested review required"),
  snapshot("openmontage", "external/upstream/openmontage", "calesthio/OpenMontage", "AGPL-3.0"),
  snapshot("moneyprinterturbo", "external/upstream/moneyprinterturbo", "harry0703/MoneyPrinterTurbo", "MIT"),
  snapshot("directorbench", "external/upstream/directorbench", "jiaminchen-1031/DirectorBench", "No top-level license found in snapshot"),
  snapshot("director", "external/upstream/director", "video-db/Director", "MIT"),
  // Present on disk and credited in docs/CREDITS.md, but missing from this list until now — so the
  // parity audit reported "all snapshots accounted for" while three were outside its governance
  // entirely. Two of them carry NO license at all, which is the strictest possible status (all
  // rights reserved), and SkyReels ships a model-card "license: other". They stay for reference and
  // attribution ONLY: no logic may be copied from a snapshot whose license does not permit it, and
  // openmontage's AGPL-3.0 is the one that would force the whole commercial product open if code
  // from it were ever imported. See the undeclared-snapshot check below, which now makes a
  // silently-added snapshot fail the audit instead of going unnoticed.
  referenceOnlySnapshot("skyreels_v2", "external/upstream/skyreels-v2", "SkyworkAI/SkyReels-V2", "Model-card \"license: other\" — reference only, no code may be copied"),
  referenceOnlySnapshot("open_ai_ugc", "external/upstream/open-ai-ugc", "Anil-matcha/Open-AI-UGC", "No license file — all rights reserved; reference only, no code may be copied"),
  referenceOnlySnapshot("open_ai_micro_drama_generator", "external/upstream/open-ai-micro-drama-generator", "Anil-matcha/Open-AI-Micro-Drama-Generator", "No license file — all rights reserved; reference only, no code may be copied")
];

/**
 * Snapshot directories on disk that this file does not declare. An undeclared snapshot is vendored
 * third-party code nobody is tracking the license of — the exact shape of the three entries added
 * above, which sat unnoticed because the audit only ever verified that DECLARED snapshots exist and
 * never looked the other way round.
 */
function findUndeclaredSnapshots() {
  const root = resolve(repoRoot, "external/upstream");
  if (!existsSync(root)) {
    return [];
  }
  const declared = new Set(expectedSnapshots.map((item) => item.localPath.replace("external/upstream/", "")));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !declared.has(entry.name))
    .map((entry) => `external/upstream/${entry.name}`);
}

const requiredDocs = [
  "docs/EXTERNAL_SOURCE_SNAPSHOTS.md",
  "docs/SUBTREE_POLICY.md",
  "docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md",
  "docs/IMPLEMENTATION_ROADMAP.md",
  "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
  "docs/PROJECT_CONTEXT.md",
  "src/core/source-logic-translation-records.ts"
];

const requiredReferenceImplementations = [
  "docs/reference-implementations/prompt-reference-binding-plan.md",
  "docs/reference-implementations/guardian-repair-decision-provenance.md",
  "docs/reference-implementations/reference-selection-scoring.md",
  "docs/reference-implementations/source-video-auto-analysis-adapter.md",
  "docs/reference-implementations/provider-polling-retry-cost.md",
  "docs/reference-implementations/long-form-planning-batch-workflow.md",
  "docs/reference-implementations/render-job-history-persistence.md",
  "docs/reference-implementations/render-provider-handoff.md",
  "docs/reference-implementations/director-style-benchmark-harness.md",
  "docs/reference-implementations/report-contract-validation.md",
  "docs/reference-implementations/business-completion-audit.md",
  "docs/reference-implementations/commercial-launch-doctor.md",
  "docs/reference-implementations/director-agentic-media-reasoning.md"
];

const sourceScanRoots = ["src", "scripts"];
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx"]);
const productOwnedHygieneRoots = ["src", "scripts", "schemas", "docs"];
const pathHygienePattern =
  /(^|\/)(test|tests|__tests__|__pycache__|mock|mocks|fixture|fixtures|sample|samples|demo|demos|example|examples)(\/|\.|$)|(^|\/)(build|temp|tmp|data\/processed|dataset\/presentation_style|resource\/fonts|resource\/songs)\/|(^|\/).+\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$|mock|fixture|stub|dummy|fake|\.(mp4|mov|mkv|avi|webm|mp3|wav|flac|aac|jpg|jpeg|png|gif|webp|ipynb|npy|npz|gz|zip|tar|tgz|ttc|ttf|otf|woff|woff2|bin|onnx|pt|pth|ckpt|safetensors|csv|jsonl|tiktoken|pyc|tsbuildinfo|ds_store|sample|example|snap)$/iu;

function snapshot(id, localPath, upstreamRepository, license) {
  return { id, localPath, upstreamRepository, license, referenceOnly: false };
}

/**
 * A snapshot kept for READING ONLY, whose license does not permit copying code into the product
 * (no license file at all, or a non-standard one). It must still be inventoried and policed, but
 * requiring a source-lineage record would be a false claim — a lineage record asserts that product
 * logic was translated from it, which is exactly what must never happen here. The no-copy promise
 * is enforced instead by the direct-import scan, which fails if src/ ever imports from a snapshot.
 */
function referenceOnlySnapshot(id, localPath, upstreamRepository, license) {
  return { id, localPath, upstreamRepository, license, referenceOnly: true };
}

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
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

function printHelp() {
  console.log(`Audit CineJelly subtree snapshot parity guardrails without network or provider calls.

Usage:
  npm.cmd run validation:snapshot-parity

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write the report.

This validates snapshot inventory, source-lineage coverage, reference implementation anchors, and direct-import boundaries. It does not claim customer release readiness or full upstream parity.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const docs = readDocs(requiredDocs);
  const snapshotInventory = expectedSnapshots.map((item) => buildSnapshotStatus(item, docs));
  const referenceImplementations = requiredReferenceImplementations.map((path) => buildReferenceImplementationStatus(path));
  const directExternalImports = findDirectExternalImports();
  const sourceHygiene = buildSourceHygiene();
  const functionalParityEstimates = buildFunctionalParityEstimates(docs, snapshotInventory);
  const undeclaredSnapshots = findUndeclaredSnapshots();
  const checks = buildChecks({ docs, snapshotInventory, referenceImplementations, directExternalImports, sourceHygiene, functionalParityEstimates });
  // Built with the shared check() helper so the entry matches the report schema every other check
  // uses — a hand-rolled object here published a report the contract validator then rejected.
  checks.push(check({
    id: "no_undeclared_snapshots",
    label: "Every snapshot directory on disk is declared with its license",
    status: undeclaredSnapshots.length === 0 ? "pass" : "fail",
    evidence: undeclaredSnapshots.length === 0
      ? `${expectedSnapshots.length} declared, 0 undeclared`
      : undeclaredSnapshots.join(", "),
    blocker: undeclaredSnapshots.length === 0
      ? undefined
      : "Vendored third-party code with no declared license. Declare it in expectedSnapshots with its real license, or remove it."
  }));
  const summary = buildSummary({ snapshotInventory, referenceImplementations, directExternalImports, sourceHygiene, functionalParityEstimates, checks });
  const status = checks.some((check) => check.status === "fail") ? "fail" : checks.some((check) => check.status === "warn") ? "warn" : "pass";

  const report = {
    schemaVersion: "cinejelly.snapshot-parity-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      expectedSnapshotCount: expectedSnapshots.length,
      requiredDocumentCount: requiredDocs.length,
      requiredReferenceImplementationCount: requiredReferenceImplementations.length,
      scannedSourceRoots: sourceScanRoots,
      sourceHygieneRoots: productOwnedHygieneRoots,
      outputPath: toRepoRelative(options.outputPath)
    },
    summary,
    snapshotInventory,
    functionalParityEstimates,
    referenceImplementations,
    directExternalImports,
    sourceHygiene,
    checks,
    undeclaredSnapshots,
    releaseGateSummary: {
      snapshotGuardrailsPass: status !== "fail",
      canClaimFullSnapshotParity: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker:
        status === "fail"
          ? "Snapshot parity guardrails failed; fix snapshot inventory, source-lineage, reference implementation, or external import drift before trusting parity claims."
          : "Snapshot parity guardrails pass, but this does not prove full upstream parity or customer traffic readiness."
    },
    nextActions: buildNextActions({ status, checks })
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function buildFunctionalParityEstimates(docs, snapshotInventory) {
  const parityText = docs["docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md"]?.text ?? "";
  // Reference-only snapshots are excluded: a functional-parity estimate answers "how much of this
  // upstream's behaviour have we reproduced", and for a snapshot whose license forbids reuse the
  // honest answer is "none, deliberately". Demanding a coverage number there would invite someone
  // to raise it.
  return snapshotInventory.filter((snapshot) => !snapshot.referenceOnly).map((snapshot) => {
    const row = findMarkdownTableRow(parityText, snapshot.upstreamRepository);
    const capability = row?.[1] ?? "";
    const implementedCoverage = row?.[2] ?? "";
    const estimateText = row?.[3] ?? "";
    const estimate = parseEstimateRange(estimateText);
    const mainGaps = row?.[4] ?? "";
    const coverageStatus = row && estimate ? "estimated" : "missing_estimate";
    return {
      id: snapshot.id,
      localPath: snapshot.localPath,
      upstreamRepository: snapshot.upstreamRepository,
      status: coverageStatus,
      estimateMinPercent: estimate?.min ?? 0,
      estimateMaxPercent: estimate?.max ?? 0,
      estimateText,
      mainCapability: cleanMarkdownCell(capability),
      implementedCoverage: cleanMarkdownCell(implementedCoverage),
      mainGaps: cleanMarkdownCell(mainGaps),
      sourceAuditPath: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
      releaseEvidence: false
    };
  });
}

function findMarkdownTableRow(markdown, firstCellText) {
  const rows = markdown.split(/\r?\n/);
  for (const line of rows) {
    if (!line.startsWith("|") || !line.includes(firstCellText)) {
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length >= 5 && cleanMarkdownCell(cells[0]) === firstCellText) {
      return cells.map(cleanMarkdownCell);
    }
  }
  return undefined;
}

function parseEstimateRange(value) {
  const matches = Array.from(String(value).matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((match) => Number(match[1]));
  if (matches.length === 0 || matches.some((item) => !Number.isFinite(item))) {
    return undefined;
  }
  return {
    min: Math.min(...matches),
    max: Math.max(...matches)
  };
}

function cleanMarkdownCell(value) {
  return String(value ?? "")
    .replace(/`/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
}

function readDocs(paths) {
  return Object.fromEntries(
    paths.map((path) => {
      const absolutePath = resolve(repoRoot, path);
      if (!existsSync(absolutePath)) {
        return [path, { path, present: false, text: "" }];
      }
      return [path, { path, present: true, text: readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "") }];
    })
  );
}

function buildSnapshotStatus(item, docs) {
  const absolutePath = resolve(repoRoot, item.localPath);
  const directoryPresent = existsSync(absolutePath) && statSync(absolutePath).isDirectory();
  const fileCount = directoryPresent ? countFiles(absolutePath) : 0;
  const inventoryText = docs["docs/EXTERNAL_SOURCE_SNAPSHOTS.md"]?.text ?? "";
  const subtreePolicyText = docs["docs/SUBTREE_POLICY.md"]?.text ?? "";
  const parityText = docs["docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md"]?.text ?? "";
  const contextText = docs["docs/PROJECT_CONTEXT.md"]?.text ?? "";
  const lineageText = docs["src/core/source-logic-translation-records.ts"]?.text ?? "";
  const inventoryCovered = includesAll(inventoryText, [item.localPath, item.upstreamRepository]);
  const subtreePolicyCovered = subtreePolicyText.includes(item.localPath);
  const parityAuditCovered = parityText.includes(item.localPath) || parityText.includes(item.upstreamRepository);
  const projectContextCovered = contextText.includes(item.upstreamRepository) || contextText.includes(item.localPath);
  const sourceLineageCovered = lineageText.includes(item.localPath);
  // A reference-only snapshot must be inventoried and policed like any other, but must NOT carry a
  // source-lineage record: that record asserts product logic was translated from it, and for these
  // the whole point is that nothing was. Its no-copy promise is covered by the direct-import scan.
  const status = item.referenceOnly
    ? (directoryPresent && fileCount > 0 && inventoryCovered && subtreePolicyCovered && !sourceLineageCovered ? "pass" : "fail")
    : (directoryPresent && fileCount > 0 && inventoryCovered && subtreePolicyCovered && parityAuditCovered && sourceLineageCovered ? "pass" : "fail");
  return {
    id: item.id,
    localPath: item.localPath,
    upstreamRepository: item.upstreamRepository,
    license: item.license,
    referenceOnly: item.referenceOnly === true,
    status,
    directoryPresent,
    fileCount,
    inventoryCovered,
    subtreePolicyCovered,
    parityAuditCovered,
    projectContextCovered,
    sourceLineageCovered
  };
}

function buildReferenceImplementationStatus(path) {
  const absolutePath = resolve(repoRoot, path);
  const present = existsSync(absolutePath) && statSync(absolutePath).isFile();
  const text = present ? readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "") : "";
  return {
    path,
    present,
    hasPurposeSection:
      /^## Purpose/m.test(text) ||
      /^## Status/m.test(text) ||
      /^## Upstream Sources/m.test(text) ||
      /^## Source Logic/m.test(text) ||
      /^## Behavior To Preserve/m.test(text),
    hasAcceptanceSection:
      /^## Acceptance/m.test(text) ||
      /^## Acceptance Criteria/m.test(text) ||
      /^## Acceptance Checks/m.test(text) ||
      /^## Milestone/m.test(text) ||
      /^## Validation/m.test(text) ||
      /^## Edge Cases/m.test(text)
  };
}

function findDirectExternalImports() {
  const files = sourceScanRoots.flatMap((root) => listSourceFiles(resolve(repoRoot, root)));
  const findings = [];
  const patterns = [
    /\bfrom\s+["'][^"']*external[\\/]+upstream/iu,
    /\bimport\s*\(\s*["'][^"']*external[\\/]+upstream/iu,
    /\brequire\s*\(\s*["'][^"']*external[\\/]+upstream/iu
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push({
          path: toRepoRelative(file),
          line: index + 1,
          kind: "direct_external_upstream_import"
        });
      }
    });
  }
  return findings;
}

function buildSourceHygiene() {
  const productOwnedFiles = productOwnedHygieneRoots
    .flatMap((root) => listAllFiles(resolve(repoRoot, root)).map(toRepoRelative))
    .sort();
  const productOwnedFindings = productOwnedFiles.filter((path) => pathHygienePattern.test(path));
  const externalFiles = listAllFiles(resolve(repoRoot, "external/upstream")).map(toRepoRelative).sort();
  const externalPrunableFiles = externalFiles.filter((path) => pathHygienePattern.test(path));
  const status = productOwnedFindings.length === 0 && externalPrunableFiles.length === 0 ? "pass" : "fail";
  return {
    status,
    hygienePolicy: "product_source_keeps_no_test_mock_demo_sample_files_and_external_snapshots_are_pruned",
    productOwnedScannedRoots: productOwnedHygieneRoots,
    productOwnedFileCount: productOwnedFiles.length,
    productOwnedTestMockFindingCount: productOwnedFindings.length,
    productOwnedTestMockFindingsSample: productOwnedFindings.slice(0, 50),
    externalSnapshotFileCount: externalFiles.length,
    externalSnapshotPrunableFileCount: externalPrunableFiles.length,
    externalSnapshotPrunableFilesSample: externalPrunableFiles.slice(0, 50)
  };
}

function listSourceFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const stat = statSync(root);
  if (stat.isFile()) {
    return sourceExtensions.has(extname(root).toLowerCase()) ? [root] : [];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(child));
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(child);
    }
  }
  return files;
}

function listAllFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const stat = statSync(root);
  if (stat.isFile()) {
    return [root];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listAllFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function buildChecks({ docs, snapshotInventory, referenceImplementations, directExternalImports, sourceHygiene, functionalParityEstimates }) {
  const checks = [];
  for (const doc of Object.values(docs)) {
    checks.push(check({
      id: `doc_present_${slug(doc.path)}`,
      label: `${doc.path} exists`,
      status: doc.present ? "pass" : "fail",
      evidence: doc.path,
      blocker: doc.present ? undefined : "Required snapshot/parity document is missing."
    }));
  }
  for (const item of snapshotInventory) {
    checks.push(check({
      id: `snapshot_guard_${item.id}`,
      label: `${item.localPath} inventory and lineage guardrails`,
      status: item.status,
      evidence: item.localPath,
      blocker: item.status === "pass" ? undefined : "Snapshot directory, docs coverage, or runtime lineage coverage is incomplete."
    }));
  }
  for (const item of referenceImplementations) {
    const status = item.present && item.hasPurposeSection && item.hasAcceptanceSection ? "pass" : "fail";
    checks.push(check({
      id: `reference_impl_${slug(item.path)}`,
      label: `${item.path} has basic RI structure`,
      status,
      evidence: item.path,
      blocker: status === "pass" ? undefined : "Reference Implementation file is missing Purpose or Acceptance evidence."
    }));
  }
  checks.push(check({
    id: "direct_external_import_boundary",
    label: "Production scripts/source do not import directly from external/upstream",
    status: directExternalImports.length === 0 ? "pass" : "fail",
    evidence: `${directExternalImports.length} direct import finding(s)`,
    blocker: directExternalImports.length === 0 ? undefined : "Production code must translate upstream behavior into owned modules instead of importing snapshot files."
  }));
  checks.push(check({
    id: "source_hygiene_pruned_snapshots",
    label: "Product source has no test/mock/demo files and external snapshots are pruned",
    status: sourceHygiene.status,
    evidence: `${sourceHygiene.productOwnedTestMockFindingCount} product finding(s), ${sourceHygiene.externalSnapshotPrunableFileCount} external snapshot pruning finding(s)`,
    blocker: sourceHygiene.status === "pass"
      ? undefined
      : "Remove product-owned test/mock/demo files or prune upstream snapshot tests/examples/build/temp/media before commercial handoff."
  }));
  const missingFunctionalEstimates = functionalParityEstimates.filter((item) => item.status !== "estimated");
  checks.push(check({
    id: "functional_parity_estimate_coverage",
    label: "Static parity audit has functional estimates for every configured snapshot",
    status: missingFunctionalEstimates.length === 0 ? "pass" : "fail",
    evidence: `${functionalParityEstimates.length - missingFunctionalEstimates.length}/${snapshotInventory.filter((item) => !item.referenceOnly).length} estimate row(s) covered (reference-only snapshots excluded by design)`,
    blocker: missingFunctionalEstimates.length === 0
      ? undefined
      : "Every configured snapshot must have a parseable functional parity estimate before operator reports can compare upstream coverage."
  }));
  const unsafeFullEstimate = functionalParityEstimates.find((item) => item.estimateMaxPercent >= 100 || item.releaseEvidence !== false);
  checks.push(check({
    id: "functional_parity_estimates_keep_no_release_claim",
    label: "Functional parity estimates remain below 100% and non-release evidence",
    status: unsafeFullEstimate ? "fail" : "pass",
    evidence: unsafeFullEstimate ? unsafeFullEstimate.id : "all estimates below 100% and releaseEvidence=false",
    blocker: unsafeFullEstimate
      ? "Functional parity estimates must not become 100% or release evidence without external/live proof."
      : undefined
  }));
  const parityText = docs["docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md"]?.text ?? "";
  const staticParityAuditRefusesFullClaim = parityText.includes("No claim of 100% parity");
  checks.push(check({
    id: "static_parity_audit_keeps_no_100_percent_claim",
    label: "Static parity audit refuses 100% parity claim",
    status: staticParityAuditRefusesFullClaim ? "pass" : "fail",
    evidence: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
    blocker: staticParityAuditRefusesFullClaim ? undefined : "Snapshot parity audit must keep full-parity limits explicit."
  }));
  return checks;
}

function check(value) {
  return {
    id: value.id,
    label: value.label,
    status: value.status,
    evidence: value.evidence,
    ...(value.blocker ? { blocker: value.blocker } : {})
  };
}

function buildSummary({ snapshotInventory, referenceImplementations, directExternalImports, sourceHygiene, functionalParityEstimates, checks }) {
  const estimatedItems = functionalParityEstimates.filter((item) => item.status === "estimated");
  const minValues = estimatedItems.map((item) => item.estimateMinPercent);
  const maxValues = estimatedItems.map((item) => item.estimateMaxPercent);
  return {
    snapshotDirectoriesPresent: snapshotInventory.filter((item) => item.directoryPresent).length,
    expectedSnapshotCount: snapshotInventory.length,
    inventoryCoverageCount: snapshotInventory.filter((item) => item.inventoryCovered).length,
    sourceLineageCoverageCount: snapshotInventory.filter((item) => item.sourceLineageCovered).length,
    functionalParityEstimateCount: estimatedItems.length,
    lowestSnapshotParityEstimatePercent: minValues.length > 0 ? Math.min(...minValues) : 0,
    highestSnapshotParityEstimatePercent: maxValues.length > 0 ? Math.max(...maxValues) : 0,
    averageSnapshotParityEstimateMinPercent: averageRounded(minValues),
    averageSnapshotParityEstimateMaxPercent: averageRounded(maxValues),
    referenceImplementationCount: referenceImplementations.filter((item) => item.present).length,
    directExternalImportFindingCount: directExternalImports.length,
    productOwnedTestMockFindingCount: sourceHygiene.productOwnedTestMockFindingCount,
    externalSnapshotPrunableFileCount: sourceHygiene.externalSnapshotPrunableFileCount,
    passedChecks: checks.filter((item) => item.status === "pass").length,
    warningChecks: checks.filter((item) => item.status === "warn").length,
    failedChecks: checks.filter((item) => item.status === "fail").length
  };
}

function averageRounded(values) {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildNextActions({ status, checks }) {
  const failed = checks.filter((item) => item.status === "fail");
  if (status === "fail") {
    return failed.map((item) => `${item.label}: ${item.blocker}`);
  }
  return [
    "Keep running validation:snapshot-parity before parity claims, launch doctor refreshes, and release evidence handoff.",
    "Do not claim full upstream parity until productCodeGaps and external/live evidence gates are closed."
  ];
}

function countFiles(root) {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue;
    }
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(child);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function writeJson(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const repoRelative = relative(repoRoot, absolutePath);
  return repoRelative && !repoRelative.startsWith("..") ? repoRelative : path;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.snapshot-parity-audit.v1",
        generatedAt: new Date().toISOString(),
        status: "fail",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
