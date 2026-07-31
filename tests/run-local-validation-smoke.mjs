import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRequestPath = "assets/output_deliverables/phase6-validation/request.json";
const defaultReportPath = "assets/output_deliverables/phase6-validation/local-smoke-report.json";
const defaultAtlasBillingReportPath =
  "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json";
const tscPath = resolve(repoRoot, "node_modules", "typescript", "bin", "tsc");

function parseArgs(args) {
  const options = {
    requestPath: defaultRequestPath,
    reportPath: defaultReportPath,
    createRequest: true,
    apiSmoke: true,
    writeReport: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--request") {
      options.requestPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--request=")) {
      options.requestPath = arg.slice("--request=".length);
      continue;
    }
    if (arg === "--no-create-request") {
      options.createRequest = false;
      continue;
    }
    if (arg === "--report") {
      options.reportPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length);
      continue;
    }
    if (arg === "--no-report") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--skip-api-smoke") {
      options.apiSmoke = false;
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
  console.log(`Run CineJelly's local no-spend validation smoke.

Usage:
  npm run validation:local-smoke
  npm run validation:local-smoke -- --request assets/output_deliverables/phase6-validation/request.json

Options:
  --request <path>       Request path to create and validate. Default: ${defaultRequestPath}
  --report <path>        Local smoke report path. Default: ${defaultReportPath}
  --no-create-request    Validate an existing request instead of creating the safe default.
  --no-report            Do not write a local smoke report.
  --skip-api-smoke       Skip starting the local API and checking diagnostic readiness.

This command does not call Atlas render, run paid validation, create providers for rendering, or write render artifacts.`);
}

async function runCommand(label, command, args, shell = false) {
  console.log(`\n[local-smoke] ${label}`);
  const startedAt = new Date();
  const startedAtMs = Date.now();
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
  return {
    label,
    status: "pass",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs
  };
}

async function runNode(label, args) {
  return runCommand(label, process.execPath, args, false);
}

async function runTsc(label, args) {
  return runNode(label, [tscPath, ...args]);
}

function readEnvFile() {
  const path = resolve(repoRoot, ".env");
  if (!existsSync(path)) {
    return new Map();
  }
  const values = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    values.set(trimmed.slice(0, index), trimmed.slice(index + 1));
  }
  return values;
}

function apiPort(envValues) {
  const value = envValues.get("PORT") || process.env.PORT || "8787";
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be a valid TCP port before API smoke can run.");
  }
  return parsed;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON from ${url}; status ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForHealth(baseUrl, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const health = await fetchJson(`${baseUrl}/health`);
      if (health.status === "ok") {
        return health;
      }
      lastError = new Error(`Health endpoint returned ${JSON.stringify(health)}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for API health.");
}

async function runApiSmoke() {
  console.log("\n[local-smoke] API diagnostic smoke");
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const envValues = readEnvFile();
  const port = apiPort(envValues);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = envValues.get("CINEJELLY_API_AUTH_TOKEN") || process.env.CINEJELLY_API_AUTH_TOKEN;

  let ownedServer;
  let serverMode = "existing";
  try {
    try {
      await fetchJson(`${baseUrl}/health`);
      console.log(`[local-smoke] Using existing API server on ${baseUrl}.`);
    } catch {
      serverMode = "temporary";
      ownedServer = spawn(process.execPath, ["--env-file-if-exists=.env", "dist/api/server.js"], {
        cwd: repoRoot,
        stdio: "ignore",
        shell: false
      });
      ownedServer.on("error", (error) => {
        throw error;
      });
      await waitForHealth(baseUrl);
      console.log(`[local-smoke] Started temporary API server on ${baseUrl}.`);
    }

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const readiness = await fetchJson(`${baseUrl}/v1/validation-readiness`, headers);
    if (readiness.decision !== "ready_for_paid_validation" && readiness.decision !== "review_warnings") {
      throw new Error(`API validation-readiness decision is ${readiness.decision}.`);
    }
    console.log(
      `[local-smoke] API readiness: ${readiness.decision}; checks ${readiness.checkCounts?.pass ?? "?"}/${readiness.checkCounts?.total ?? "?"} pass.`
    );
    return {
      label: "API diagnostic smoke",
      status: "pass",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      serverMode,
      baseUrl,
      readiness: {
        decision: readiness.decision,
        preflightStatus: readiness.preflightStatus,
        checkCounts: readiness.checkCounts,
        warnings: Array.isArray(readiness.warnings) ? readiness.warnings : [],
        hardBlockers: Array.isArray(readiness.hardBlockers) ? readiness.hardBlockers : [],
        canRunPaidValidation: readiness.releaseGateSummary?.canRunPaidValidation === true,
        canReleaseToCustomerTraffic: readiness.releaseGateSummary?.canReleaseToCustomerTraffic === true
      }
    };
  } finally {
    await stopOwnedServer(ownedServer);
  }
}

async function stopOwnedServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolvePromise) => {
    let settled = false;
    const timeout = setTimeout(done, 2_000);
    function done() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolvePromise();
    }
    child.once("exit", done);
    child.once("close", done);
    child.once("error", done);
    child.kill();
  });
}

function toRepoRelativePath(path) {
  return relative(repoRoot, resolve(repoRoot, path));
}

function writeSmokeReport(reportPath, report) {
  const absolutePath = resolve(repoRoot, reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[local-smoke] Wrote report: ${toRepoRelativePath(reportPath)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const startedAt = new Date();
  const steps = [];
  let apiSmoke;

  if (options.createRequest) {
    steps.push(await runNode("Create safe validation request", [
      "scripts/create-validation-request.mjs",
      "--safe-default",
      "--output",
      options.requestPath
    ]));
  }

  steps.push(await runTsc("Typecheck", ["--noEmit"]));
  steps.push(await runTsc("Build", ["-p", "tsconfig.json"]));
  steps.push(await runNode("Client policy quota smoke", [
    "tests/run-client-policy-smoke.mjs"
  ]));
  steps.push(await runNode("Validation readiness", [
    "--env-file-if-exists=.env",
    "dist/application/validation-readiness-entrypoint.js"
  ]));
  steps.push(await runNode("No-spend request validation", [
    "--env-file-if-exists=.env",
    "dist/application/render-request-validation-entrypoint.js",
    "--request",
    options.requestPath
  ]));

  if (options.apiSmoke) {
    apiSmoke = await runApiSmoke();
  }

  const report = {
    schemaVersion: "cinejelly.phase6.local-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: "pass",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    requestPath: toRepoRelativePath(options.requestPath),
    createdRequest: options.createRequest,
    apiSmokeEnabled: options.apiSmoke,
    steps,
    ...(apiSmoke ? { apiSmoke } : {}),
    releaseGateSummary: {
      canRunPaidValidation: apiSmoke?.readiness?.canRunPaidValidation === true,
      canReleaseToCustomerTraffic: false,
      releaseBlocker:
        "Local smoke evidence is not customer-release approval; release still requires paid-render evidence, artifact validation, artifact inspection, and manual redaction review."
    },
    nextActions: [
      "Run or reuse paid Atlas validation only after explicit operator approval.",
      `Run npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report ${defaultAtlasBillingReportPath} only for the approved paid validation request.`,
      "Run npm run validate:artifacts -- <artifact-directory> after artifacts are written.",
      "Complete manual artifact, video, and redaction review before customer traffic."
    ]
  };
  if (options.writeReport) {
    writeSmokeReport(options.reportPath, report);
  }

  console.log("\n[local-smoke] PASS. This is no-spend evidence, not customer-release approval.");
  process.exit(0);
}

main().catch((error) => {
  console.error(`\n[local-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
