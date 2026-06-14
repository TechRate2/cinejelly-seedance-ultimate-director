import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSmokeReportPath = "assets/output_deliverables/phase6-validation/local-smoke-report.json";
const defaultPaidReportPath = "assets/output_deliverables/phase6-validation/paid-render-report.json";
const defaultOutputPath = "assets/output_deliverables/phase6-validation/release-audit-report.json";

const SECRET_PATTERNS = [
  { name: "atlascloud_api_key", regex: /apikey-[A-Za-z0-9]{20,}/g },
  { name: "openai_style_key", regex: /\bsk-[A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]{12,}/g },
  {
    name: "sensitive_env_assignment",
    regex: /\b(?:ATLASCLOUD_API_KEY|ATLASCLOUD_LLM_API_KEY|CINEJELLY_API_AUTH_TOKEN)[ \t]*=[ \t]*\S+/g
  }
];

const IMPORT_BOUNDARY_PATTERN = /\b(?:from\s+["'][^"']*external|import\s+[^;]*["'][^"']*external|require\(\s*["'][^"']*external)/;

function parseArgs(args) {
  const options = {
    smokeReportPath: defaultSmokeReportPath,
    paidReportPath: defaultPaidReportPath,
    outputPath: defaultOutputPath,
    writeReport: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--smoke-report") {
      options.smokeReportPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--smoke-report=")) {
      options.smokeReportPath = arg.slice("--smoke-report=".length);
      continue;
    }
    if (arg === "--paid-report") {
      options.paidReportPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--paid-report=")) {
      options.paidReportPath = arg.slice("--paid-report=".length);
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
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
  console.log(`Run CineJelly's no-spend release audit.

Usage:
  npm.cmd run validation:release-audit
  npm.cmd run validation:release-audit -- --paid-report phase6-validation/paid-render-report.json

Options:
  --smoke-report <path>  Local smoke report path. Default: ${defaultSmokeReportPath}
  --paid-report <path>   Paid-render validation report path. Default: ${defaultPaidReportPath}
  --output <path>        Release audit report path. Default: ${defaultOutputPath}
  --no-output            Print only; do not write the report.

This command does not call Atlas, create providers, run paid render, or inspect media quality.`);
}

function git(args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function readJsonFile(path) {
  const absolutePath = resolve(repoRoot, path);
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function checkLocalSmoke(path) {
  if (!existsSync(resolve(repoRoot, path))) {
    return fail("local_smoke_report", `Missing local smoke report at ${path}. Run npm.cmd run doctor first.`);
  }
  try {
    const report = readJsonFile(path);
    const readiness = report.apiSmoke?.readiness;
    if (report.status !== "pass") {
      return fail("local_smoke_report", `Local smoke status is ${report.status ?? "unknown"}.`);
    }
    if (readiness?.decision !== "ready_for_paid_validation" && readiness?.decision !== "review_warnings") {
      return fail("local_smoke_report", `Validation readiness decision is ${readiness?.decision ?? "missing"}.`);
    }
    if (readiness?.canRunPaidValidation !== true) {
      return fail("local_smoke_report", "Local readiness does not allow paid validation.");
    }
    const counts = readiness.checkCounts ?? {};
    return pass(
      "local_smoke_report",
      `Local smoke passed; readiness=${readiness.decision}; checks=${counts.pass ?? "?"}/${counts.total ?? "?"} pass.`
    );
  } catch {
    return fail("local_smoke_report", `Local smoke report at ${path} is not valid JSON.`);
  }
}

function checkPaidReport(path) {
  if (!existsSync(resolve(repoRoot, path))) {
    return fail("paid_render_report", `Missing paid-render validation report at ${path}.`);
  }
  try {
    const report = readJsonFile(path);
    if (report.schemaVersion !== "cinejelly.phase6.paid-render-validation.v1") {
      return fail("paid_render_report", "Paid-render report schemaVersion is not recognized.");
    }
    if (report.status === "completed") {
      return pass("paid_render_report", "Paid-render validation completed.");
    }
    if (report.status === "completed_with_artifact_validation_warning") {
      return warn("paid_render_report", "Paid-render validation completed with artifact warnings requiring operator review.");
    }
    return fail("paid_render_report", `Paid-render validation status is ${report.status ?? "missing"}.`);
  } catch {
    return fail("paid_render_report", `Paid-render report at ${path} is not valid JSON.`);
  }
}

function checkPaidArtifactValidation(path) {
  if (!existsSync(resolve(repoRoot, path))) {
    return fail("paid_artifact_validation", "Paid-render report is missing, so artifact validation evidence is missing.");
  }
  try {
    const report = readJsonFile(path);
    const status = report.artifactValidation?.status;
    if (status === "pass") {
      return pass("paid_artifact_validation", "Paid-render artifact validation passed.");
    }
    if (status === "warn") {
      return warn("paid_artifact_validation", "Paid-render artifact validation has warnings requiring operator review.");
    }
    return fail("paid_artifact_validation", `Paid-render artifact validation status is ${status ?? "missing"}.`);
  } catch {
    return fail("paid_artifact_validation", `Paid-render report at ${path} is not valid JSON.`);
  }
}

function checkGitClean() {
  const result = git(["status", "--short"]);
  if (result.status !== 0) {
    return warn("tracked_worktree_clean", "Could not inspect git status.");
  }
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return pass("tracked_worktree_clean", "Tracked worktree is clean.");
  }
  return fail("tracked_worktree_clean", `${lines.length} tracked or untracked source item(s) are pending commit.`);
}

function checkIgnored(paths, name) {
  for (const path of paths) {
    const result = git(["check-ignore", "-q", path]);
    if (result.status === 0) {
      return pass(name, `${path} is ignored by Git.`);
    }
  }
  return fail(name, `${paths.join(" or ")} is not ignored by Git.`);
}

function trackedFilesFor(paths) {
  const result = git(["ls-files", "--", ...paths]);
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function checkSecretScan() {
  const files = trackedFilesFor(["README.md", "docs", "src", "scripts", "package.json", "schemas", ".env.production.template"]);
  const findings = [];
  for (const file of files) {
    const text = readTextIfPossible(file);
    if (text === undefined) {
      continue;
    }
    for (const pattern of SECRET_PATTERNS) {
      const matches = text.match(pattern.regex);
      if (matches?.length) {
        findings.push({ file, pattern: pattern.name, count: matches.length });
      }
    }
  }
  if (findings.length === 0) {
    return pass("tracked_secret_scan", `No tracked secret-like values found across ${files.length} file(s).`);
  }
  const affectedFiles = [...new Set(findings.map((finding) => finding.file))];
  return fail("tracked_secret_scan", `${findings.length} secret-like finding group(s) in ${affectedFiles.length} tracked file(s).`, {
    findings
  });
}

function checkImportBoundary() {
  const files = trackedFilesFor(["src", "scripts"]);
  const findings = [];
  for (const file of files) {
    const text = readTextIfPossible(file);
    if (text !== undefined && IMPORT_BOUNDARY_PATTERN.test(text)) {
      findings.push({ file });
    }
  }
  if (findings.length === 0) {
    return pass("external_import_boundary", `No production/script snapshot-boundary imports found across ${files.length} file(s).`);
  }
  return fail("external_import_boundary", `${findings.length} file(s) contain snapshot-boundary imports.`, { findings });
}

function readTextIfPossible(path) {
  try {
    return readFileSync(resolve(repoRoot, path), "utf8");
  } catch {
    return undefined;
  }
}

function pass(name, message, extra = {}) {
  return { name, status: "pass", message, ...extra };
}

function warn(name, message, extra = {}) {
  return { name, status: "warn", message, ...extra };
}

function fail(name, message, extra = {}) {
  return { name, status: "fail", message, ...extra };
}

function statusForChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "blocked";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "review_warnings";
  }
  return "release_ready";
}

function nextActionsFor(status, checks, options) {
  if (status === "release_ready") {
    return [
      "Complete manual video quality, artifact, and redaction review before opening customer traffic.",
      "Record the paid validation date and evidence location in docs/PROJECT_CONTEXT.md and docs/IMPLEMENTATION_ROADMAP.md."
    ];
  }
  const actions = [];
  if (checks.some((check) => check.name === "local_smoke_report" && check.status === "fail")) {
    actions.push("Run npm.cmd run doctor and resolve no-spend readiness blockers.");
  }
  if (checks.some((check) => check.name === "paid_render_report" && check.status === "fail")) {
    actions.push(`Run paid validation only after approval: npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend --output "${options.paidReportPath}"`);
  }
  if (checks.some((check) => check.name === "tracked_worktree_clean" && check.status === "fail")) {
    actions.push("Commit or intentionally discard source changes before release audit.");
  }
  if (checks.some((check) => check.name === "tracked_secret_scan" && check.status === "fail")) {
    actions.push("Remove secret-like values from tracked files before release.");
  }
  if (checks.some((check) => check.name === "external_import_boundary" && check.status === "fail")) {
    actions.push("Remove runtime snapshot-boundary imports; rewrite behavior into CineJelly-owned source.");
  }
  actions.push("Do not open customer traffic until this audit is release_ready and manual media review is complete.");
  return actions;
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const checks = [
    checkLocalSmoke(options.smokeReportPath),
    checkPaidReport(options.paidReportPath),
    checkPaidArtifactValidation(options.paidReportPath),
    checkGitClean(),
    checkIgnored([".env"], "env_file_ignored"),
    checkIgnored(["assets/output_deliverables/phase6-validation/local-smoke-report.json"], "output_deliverables_ignored"),
    checkSecretScan(),
    checkImportBoundary()
  ];

  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.phase6.release-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins: [
      "vericontext/vibeframe",
      "harry0703/MoneyPrinterTurbo",
      "calesthio/OpenMontage"
    ],
    checkedInputs: {
      smokeReportPath: options.smokeReportPath,
      paidReportPath: options.paidReportPath
    },
    checks,
    releaseGateSummary: {
      canRunPaidValidation: checks.find((check) => check.name === "local_smoke_report")?.status === "pass",
      canReleaseToCustomerTraffic: status === "release_ready",
      releaseBlocker: status === "release_ready"
        ? undefined
        : "Release audit is not ready; paid render evidence, artifact validation, source hygiene, or manual review blockers remain."
    },
    nextActions: nextActionsFor(status, checks, options)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "release_ready" ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: "cinejelly.phase6.release-audit.v1",
      generatedAt: new Date().toISOString(),
      status: "blocked",
      error: error instanceof Error ? error.message : String(error)
    }, null, 2)}\n`
  );
  process.exitCode = 1;
}
