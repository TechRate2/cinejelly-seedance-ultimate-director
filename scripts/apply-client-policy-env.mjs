import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  envPath: ".env",
  snippetPath: "assets/output_deliverables/business-readiness/client-policy-kit/client-policy.env",
  outputPath: "assets/output_deliverables/business-readiness/client-policy-env-apply-report.json",
  backupDir: "assets/output_deliverables/business-readiness/env-backups"
};

const allowedKeys = new Set([
  "CINEJELLY_API_CLIENTS_JSON",
  "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER",
  "CINEJELLY_CLIENT_USAGE_LEDGER_PATH"
]);

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
    backup: true,
    createEnv: false
  };
  const flagMap = new Map([
    ["--env", "envPath"],
    ["--snippet", "snippetPath"],
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
    if (arg === "--no-backup") {
      options.backup = false;
      continue;
    }
    if (arg === "--create-env") {
      options.createEnv = true;
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
  console.log(`Apply a generated CineJelly client-policy env snippet to a local .env file.

Usage:
  npm.cmd run ops:apply-client-policy-env
  npm.cmd run ops:apply-client-policy-env -- --snippet assets/output_deliverables/business-readiness/client-policy-kit/client-policy.env

Options:
  --env <path>          Target env file. Default: ${defaults.envPath}
  --snippet <path>      Generated client-policy.env file. Default: ${defaults.snippetPath}
  --output <path>       Redacted report path. Default: ${defaults.outputPath}
  --backup-dir <path>   Backup directory for the old env file. Default: ${defaults.backupDir}
  --dry-run             Validate and report changes without writing the env file.
  --no-backup           Do not create an ignored backup before writing.
  --create-env          Allow creating the env file when it does not exist.

Only CINEJELLY_API_CLIENTS_JSON, CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER, and CINEJELLY_CLIENT_USAGE_LEDGER_PATH are imported from the snippet. Existing Atlas keys and deployment tokens are preserved and never printed.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const envPath = resolve(repoRoot, options.envPath);
  const snippetPath = resolve(repoRoot, options.snippetPath);
  if (!existsSync(snippetPath)) {
    throw new Error(`Snippet file does not exist: ${toRepoRelative(snippetPath)}.`);
  }
  if (!existsSync(envPath) && !options.createEnv) {
    throw new Error(`Env file does not exist: ${toRepoRelative(envPath)}. Pass --create-env to create it.`);
  }

  const snippetValues = readSnippet(snippetPath);
  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8").replace(/^\uFEFF/, "") : "";
  const merge = mergeEnv(envText, snippetValues);
  const backupPath = options.backup && existsSync(envPath)
    ? resolve(repoRoot, options.backupDir, `.env.backup.${new Date().toISOString().replace(/[:.]/g, "-")}`)
    : undefined;

  if (!options.dryRun) {
    if (backupPath) {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(envPath, backupPath);
    }
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, merge.text, "utf8");
  }

  const report = {
    schemaVersion: "cinejelly.client-policy-env-apply.v1",
    generatedAt: new Date().toISOString(),
    status: options.dryRun ? "dry_run" : "applied",
    dryRun: options.dryRun,
    targetEnvPath: toRepoRelative(envPath),
    snippetPath: toRepoRelative(snippetPath),
    backupCreated: Boolean(backupPath && !options.dryRun),
    ...(backupPath && !options.dryRun ? { backupPath: toRepoRelative(backupPath) } : {}),
    importedKeys: [...snippetValues.keys()],
    changedKeys: merge.changedKeys,
    appendedKeys: merge.appendedKeys,
    preservedExistingKeys: merge.preservedExistingKeys,
    securityNotes: [
      "Existing Atlas keys and deployment tokens were preserved.",
      "Imported client policy values are not printed in this report.",
      "CINEJELLY_API_CLIENTS_JSON contains SHA-256 client-key digests only when created by ops:create-client-policy."
    ],
    nextActions: [
      "Run npm.cmd run validation:ops-config.",
      "Run npm.cmd run validation:business-plan to refresh the remaining blocker sequence."
    ]
  };
  writeReport(options.outputPath, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return 0;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (options.envPath.includes("\u0000") || options.snippetPath.includes("\u0000") || options.backupDir.includes("\u0000")) {
    throw new Error("Paths must not contain control characters.");
  }
}

function readSnippet(path) {
  const values = new Map();
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      throw new Error(`Snippet line ${index + 1} is not KEY=value.`);
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1);
    if (!allowedKeys.has(key)) {
      throw new Error(`Snippet key ${key} is not allowed for env merge.`);
    }
    if (!value.trim()) {
      throw new Error(`Snippet key ${key} must not be empty.`);
    }
    values.set(key, value);
  }
  for (const key of allowedKeys) {
    if (!values.has(key)) {
      throw new Error(`Snippet is missing ${key}.`);
    }
  }
  validateClientPolicyJson(values.get("CINEJELLY_API_CLIENTS_JSON"));
  if (values.get("CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER")?.trim().toLowerCase() !== "true") {
    throw new Error("CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER must be true.");
  }
  return values;
}

function validateClientPolicyJson(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("CINEJELLY_API_CLIENTS_JSON in snippet is not valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CINEJELLY_API_CLIENTS_JSON in snippet must be a non-empty array.");
  }
  for (const [index, policy] of parsed.entries()) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      throw new Error(`Client policy ${index} must be an object.`);
    }
    if (typeof policy.clientId !== "string" || !/^[A-Za-z0-9_.:-]{3,80}$/.test(policy.clientId)) {
      throw new Error(`Client policy ${index} has invalid clientId.`);
    }
    if (typeof policy.keySha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(policy.keySha256)) {
      throw new Error(`Client policy ${policy.clientId} has invalid keySha256.`);
    }
  }
}

function mergeEnv(envText, snippetValues) {
  const lines = envText.split(/\r?\n/);
  const seen = new Set();
  const changedKeys = [];
  const preservedExistingKeys = [];
  const nextLines = lines.map((line) => {
    const match = /^(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=)(.*)$/.exec(line);
    if (!match) {
      return line;
    }
    const key = match[2];
    if (!snippetValues.has(key)) {
      return line;
    }
    seen.add(key);
    const nextValue = snippetValues.get(key);
    if (match[3] === nextValue) {
      preservedExistingKeys.push(key);
      return line;
    }
    changedKeys.push(key);
    return `${key}=${nextValue}`;
  });

  const appendedKeys = [];
  const missing = [...snippetValues.keys()].filter((key) => !seen.has(key));
  if (missing.length > 0 && nextLines.length > 0 && nextLines.at(-1) !== "") {
    nextLines.push("");
  }
  if (missing.length > 0) {
    nextLines.push("# CineJelly client policy quota controls");
  }
  for (const key of missing) {
    appendedKeys.push(key);
    nextLines.push(`${key}=${snippetValues.get(key)}`);
  }
  return {
    text: `${nextLines.join("\n").replace(/\n*$/, "")}\n`,
    changedKeys,
    appendedKeys,
    preservedExistingKeys
  };
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
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
        schemaVersion: "cinejelly.client-policy-env-apply.v1",
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
