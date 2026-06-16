import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  billingSourcePath: "assets/output_deliverables/business-readiness/operator-drafts/billing-admin-attestation.draft.json",
  productionSourcePath: "assets/output_deliverables/business-readiness/operator-drafts/production-operations-attestation.draft.json",
  billingTargetPath: "ops/billing-admin-attestation.json",
  productionTargetPath: "ops/production-operations-attestation.json",
  outputPath: "assets/output_deliverables/business-readiness/operator-attestation-promotion-report.json",
  backupDir: "assets/output_deliverables/business-readiness/ops-backups"
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];

function parseArgs(args) {
  const options = {
    ...defaults,
    dryRun: false,
    force: false,
    backup: true
  };
  const flagMap = new Map([
    ["--billing-source", "billingSourcePath"],
    ["--production-source", "productionSourcePath"],
    ["--billing-target", "billingTargetPath"],
    ["--production-target", "productionTargetPath"],
    ["--output", "outputPath"],
    ["--backup-dir", "backupDir"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--no-backup") {
      options.backup = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      options[key] = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      index += equalsIndex >= 0 ? 0 : 1;
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
  console.log(`Promote completed operator attestation drafts into ignored ops/ input files.

Usage:
  npm.cmd run ops:promote-attestations
  npm.cmd run ops:promote-attestations -- --dry-run
  npm.cmd run ops:promote-attestations -- --force

Options:
  --billing-source <path>     Completed billing/admin attestation draft.
                              Default: ${defaults.billingSourcePath}
  --production-source <path>  Completed production operations attestation draft.
                              Default: ${defaults.productionSourcePath}
  --billing-target <path>     Target operator input file. Default: ${defaults.billingTargetPath}
  --production-target <path>  Target operator input file. Default: ${defaults.productionTargetPath}
  --output <path>             Redacted report path. Default: ${defaults.outputPath}
  --backup-dir <path>         Backup directory when --force replaces existing targets.
                              Default: ${defaults.backupDir}
  --dry-run                   Validate and report without writing target files.
  --force                     Allow replacing existing target files.
  --no-backup                 Do not create ignored backups when replacing targets.

The helper runs validation:ops-config against the source files before writing. It performs no network calls, no Atlas calls, no render work, and no billing-provider calls.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const preflightChecks = [
    fileCheck("billing_source", options.billingSourcePath),
    fileCheck("production_source", options.productionSourcePath),
    targetCheck("billing_target", options.billingTargetPath, options),
    targetCheck("production_target", options.productionTargetPath, options)
  ];
  const preflightFailed = preflightChecks.some((check) => check.status === "fail");
  const validation = preflightFailed ? undefined : runOpsConfigValidation(options);
  const validationPassed = validation?.exitCode === 0 && validation?.report?.status === "pass";
  const status = preflightFailed || !validationPassed ? "blocked" : options.dryRun ? "dry_run" : "promoted";
  const promotedFiles = [
    promotionEntry("billing_admin_attestation", options.billingSourcePath, options.billingTargetPath, options),
    promotionEntry("production_operations_attestation", options.productionSourcePath, options.productionTargetPath, options)
  ];

  if (status === "promoted") {
    for (const entry of promotedFiles) {
      if (entry.backupPath) {
        mkdirSync(dirname(resolve(repoRoot, entry.backupPath)), { recursive: true });
        copyFileSync(resolve(repoRoot, entry.targetPath), resolve(repoRoot, entry.backupPath));
      }
      mkdirSync(dirname(resolve(repoRoot, entry.targetPath)), { recursive: true });
      copyFileSync(resolve(repoRoot, entry.sourcePath), resolve(repoRoot, entry.targetPath));
    }
  }

  const report = {
    schemaVersion: "cinejelly.operator-attestation-promotion.v1",
    generatedAt: new Date().toISOString(),
    status,
    dryRun: options.dryRun,
    checkedInputs: {
      billingSourcePath: toRepoRelative(options.billingSourcePath),
      productionSourcePath: toRepoRelative(options.productionSourcePath),
      billingTargetPath: toRepoRelative(options.billingTargetPath),
      productionTargetPath: toRepoRelative(options.productionTargetPath),
      backupDir: toRepoRelative(options.backupDir)
    },
    checks: [
      ...preflightChecks,
      ...(validation ? validationChecks(validation) : [])
    ],
    promotedFiles: status === "promoted" || status === "dry_run" ? promotedFiles : [],
    validationSummary: validation
      ? summarizeValidation(validation)
      : { status: "not_run", reason: "Source or target preflight failed." },
    securityNotes: [
      "Target ops/*.json files are ignored by Git.",
      "Attestation files must remain non-secret and must not contain customer payment records or customer media.",
      "This helper never calls Atlas, render endpoints, deployment endpoints, or billing providers."
    ],
    nextActions: nextActionsFor(status, validation)
  };
  writeReport(options.outputPath, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "promoted" || status === "dry_run" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  for (const path of [
    options.billingSourcePath,
    options.productionSourcePath,
    options.billingTargetPath,
    options.productionTargetPath,
    options.backupDir
  ]) {
    if (path.includes("\u0000")) {
      throw new Error("Paths must not contain control characters.");
    }
  }
}

function fileCheck(name, path) {
  if (!existsSync(resolve(repoRoot, path))) {
    return fail(name, `Missing file at ${toRepoRelative(path)}.`);
  }
  try {
    JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
    return pass(name, `${toRepoRelative(path)} is valid JSON.`);
  } catch (error) {
    return fail(name, `${toRepoRelative(path)} is not valid JSON: ${redactText(error instanceof Error ? error.message : String(error))}`);
  }
}

function targetCheck(name, path, options) {
  if (!existsSync(resolve(repoRoot, path))) {
    return pass(name, `${toRepoRelative(path)} is ready to be created.`);
  }
  return options.force
    ? pass(name, `${toRepoRelative(path)} exists and will be replaced because --force is set.`)
    : fail(name, `${toRepoRelative(path)} already exists. Pass --force to replace it after review.`);
}

function runOpsConfigValidation(options) {
  const result = spawnSync(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "scripts/validate-business-readiness-ops-config.mjs",
      "--billing-attestation",
      options.billingSourcePath,
      "--production-attestation",
      options.productionSourcePath,
      "--no-output"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true
    }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    report: parseJsonOutput(result.stdout),
    spawnError: result.error ? redactText(result.error.message) : undefined
  };
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function validationChecks(validation) {
  if (validation.spawnError) {
    return [fail("ops_config_validation", validation.spawnError)];
  }
  if (!validation.report) {
    return [fail("ops_config_validation", "validation:ops-config did not return valid JSON.")];
  }
  const counts = countChecks(validation.report.checks);
  return [
    validation.exitCode === 0 && validation.report.status === "pass"
      ? pass("ops_config_validation", `Source attestation files passed ops-config validation; checks=${counts.pass}/${counts.total} pass.`)
      : fail("ops_config_validation", `Source attestation files did not pass ops-config validation; status=${validation.report.status ?? "missing"}; checks=${counts.pass}/${counts.total} pass.`)
  ];
}

function summarizeValidation(validation) {
  const report = validation.report;
  if (!report) {
    return {
      status: "invalid_output",
      exitCode: validation.exitCode,
      stderr: redactText(validation.stderr)
    };
  }
  const counts = countChecks(report.checks);
  return {
    status: report.status,
    exitCode: validation.exitCode,
    checkCounts: counts,
    firstFailures: Array.isArray(report.checks)
      ? report.checks
          .filter((check) => check?.status === "fail" && typeof check?.message === "string")
          .slice(0, 8)
          .map((check) => ({ name: check.name, message: check.message }))
      : []
  };
}

function countChecks(checks) {
  const list = Array.isArray(checks) ? checks : [];
  return {
    total: list.length,
    pass: list.filter((check) => check?.status === "pass").length,
    warn: list.filter((check) => check?.status === "warn").length,
    fail: list.filter((check) => check?.status === "fail").length
  };
}

function promotionEntry(kind, sourcePath, targetPath, options) {
  const targetExists = existsSync(resolve(repoRoot, targetPath));
  const backupPath = targetExists && options.force && options.backup
    ? `${options.backupDir.replace(/[\\/]+$/, "")}/${kind}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    : undefined;
  return {
    kind,
    sourcePath: toRepoRelative(sourcePath),
    targetPath: toRepoRelative(targetPath),
    ...(backupPath ? { backupPath: toRepoRelative(backupPath) } : {})
  };
}

function nextActionsFor(status, validation) {
  if (status === "promoted") {
    return [
      "Run npm.cmd run validation:ops-config.",
      "Run npm.cmd run validation:billing-admin-ops and validation:production-ops against the real HTTPS deployment URL."
    ];
  }
  if (status === "dry_run") {
    return ["Rerun without --dry-run to promote the validated attestation files."];
  }
  const failures = validation?.report?.checks
    ?.filter((check) => check?.status === "fail" && typeof check?.message === "string")
    ?.slice(0, 8)
    ?.map((check) => check.message) ?? [];
  return failures.length > 0
    ? [...failures, "Fill the draft attestation files with real non-secret operational details and rerun this helper."]
    : ["Fix the preflight blockers and rerun this helper."];
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), String(value));
}

function redactUnknown(value) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.operator-attestation-promotion.v1",
        generatedAt: new Date().toISOString(),
        status: "failed",
        error: redactText(error instanceof Error ? error.message : String(error))
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
