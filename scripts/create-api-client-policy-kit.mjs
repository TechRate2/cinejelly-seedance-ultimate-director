import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputDir: "assets/output_deliverables/business-readiness/client-policy-kit",
  clientId: "pilot-client",
  monthlyRequestLimit: 10,
  monthlyReservedCostUsdLimit: 50,
  maxReservedCostUsdPerRequest: 5,
  defaultReservedCostUsdPerRequest: 5,
  maxDurationTargetSeconds: 120,
  allowedTiers: "fast",
  allowedQualityModes: "economy",
  usageLedgerPath: "assets/output_deliverables/business-readiness/client-usage-ledger.jsonl"
};

const clientIdPattern = /^[A-Za-z0-9_.:-]{3,80}$/;
const clientKeyPattern = /^[A-Za-z0-9_.:-]{24,160}$/;
const allowedTiers = new Set(["fast", "standard"]);
const allowedQualityModes = new Set(["economy", "standard", "high", "ultimate"]);
const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|password|signature|credential|authorization|expires|sig|sha256/i;

function parseArgs(args) {
  const options = {
    ...defaults,
    writeSecretFile: true,
    force: false
  };
  const flagMap = new Map([
    ["--output-dir", "outputDir"],
    ["--client-id", "clientId"],
    ["--client-key", "clientKey"],
    ["--existing-policy-json", "existingPolicyJsonPath"],
    ["--monthly-request-limit", "monthlyRequestLimit"],
    ["--monthly-reserved-cost-usd-limit", "monthlyReservedCostUsdLimit"],
    ["--max-reserved-cost-usd-per-request", "maxReservedCostUsdPerRequest"],
    ["--default-reserved-cost-usd-per-request", "defaultReservedCostUsdPerRequest"],
    ["--max-duration-target-seconds", "maxDurationTargetSeconds"],
    ["--allowed-tiers", "allowedTiers"],
    ["--allowed-quality-modes", "allowedQualityModes"],
    ["--usage-ledger-path", "usageLedgerPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-secret-file") {
      options.writeSecretFile = false;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = numericOption(key) ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return [
    "monthlyRequestLimit",
    "monthlyReservedCostUsdLimit",
    "maxReservedCostUsdPerRequest",
    "defaultReservedCostUsdPerRequest",
    "maxDurationTargetSeconds"
  ].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Create a no-spend CineJelly API client policy kit.

Usage:
  npm.cmd run ops:create-client-policy
  npm.cmd run ops:create-client-policy -- --client-id customer-a --monthly-request-limit 20
  npm.cmd run ops:create-client-policy -- --existing-policy-json ops/client-policy.json --client-id customer-b

Options:
  --client-id <id>                              Default: ${defaults.clientId}
  --client-key <key>                            Optional existing raw client key. Must be at least 24 safe characters.
  --existing-policy-json <path>                 Optional existing policy JSON array to append to.
  --monthly-request-limit <count>               Default: ${defaults.monthlyRequestLimit}
  --monthly-reserved-cost-usd-limit <amount>    Default: ${defaults.monthlyReservedCostUsdLimit}
  --max-reserved-cost-usd-per-request <amount>  Default: ${defaults.maxReservedCostUsdPerRequest}
  --default-reserved-cost-usd-per-request <amount> Default: ${defaults.defaultReservedCostUsdPerRequest}
  --max-duration-target-seconds <seconds>       Default: ${defaults.maxDurationTargetSeconds}
  --allowed-tiers <csv>                         fast,standard. Default: ${defaults.allowedTiers}
  --allowed-quality-modes <csv>                 economy,standard,high,ultimate. Default: ${defaults.allowedQualityModes}
  --usage-ledger-path <path>                    Default: ${defaults.usageLedgerPath}
  --output-dir <path>                           Default: ${defaults.outputDir}
  --no-secret-file                              Do not write the raw client API key file.
  --force                                       Overwrite generated files in output-dir.

This command does not call Atlas, deployment endpoints, render routes, or billing providers. It stores only a SHA-256 digest in client-policy JSON. When a raw key is generated, keep the .secret.txt file outside source control and share it through your secure customer onboarding channel.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const clientKey = options.clientKey ?? generateClientKey();
  const keySha256 = hashApiKey(clientKey);
  const existingPolicies = readExistingPolicies(options.existingPolicyJsonPath);
  const policy = buildPolicy(options, keySha256);
  assertNoDuplicates([...existingPolicies, policy]);
  const policies = [...existingPolicies, policy];
  const outputDir = resolve(repoRoot, options.outputDir);
  mkdirSync(outputDir, { recursive: true });

  const clientPolicyPath = resolve(outputDir, "client-policy.json");
  const envSnippetPath = resolve(outputDir, "client-policy.env");
  const secretPath = resolve(outputDir, "client-api-key.secret.txt");
  const reportPath = resolve(outputDir, "client-policy-kit-report.json");
  assertWritableTarget(clientPolicyPath, options.force);
  assertWritableTarget(envSnippetPath, options.force);
  assertWritableTarget(reportPath, options.force);
  if (options.writeSecretFile) {
    assertWritableTarget(secretPath, options.force);
  }

  writeFileSync(clientPolicyPath, `${JSON.stringify(policies, null, 2)}\n`, "utf8");
  writeFileSync(envSnippetPath, envSnippet(policies, options), "utf8");
  if (options.writeSecretFile) {
    writeFileSync(secretPath, `${clientKey}\n`, "utf8");
  }

  const report = {
    schemaVersion: "cinejelly.api-client-policy-kit.v1",
    generatedAt: new Date().toISOString(),
    status: "created",
    noSpend: true,
    outputFiles: {
      clientPolicyJsonPath: toRepoRelative(clientPolicyPath),
      envSnippetPath: toRepoRelative(envSnippetPath),
      secretFileWritten: options.writeSecretFile,
      ...(options.writeSecretFile ? { secretFilePath: toRepoRelative(secretPath) } : {}),
      reportPath: toRepoRelative(reportPath)
    },
    clientPolicy: {
      clientId: policy.clientId,
      enabled: policy.enabled,
      monthlyRequestLimit: policy.monthlyRequestLimit,
      monthlyReservedCostUsdLimit: policy.monthlyReservedCostUsdLimit,
      maxReservedCostUsdPerRequest: policy.maxReservedCostUsdPerRequest,
      defaultReservedCostUsdPerRequest: policy.defaultReservedCostUsdPerRequest,
      maxDurationTargetSeconds: policy.maxDurationTargetSeconds,
      allowedTiers: policy.allowedTiers,
      allowedQualityModes: policy.allowedQualityModes,
      policyCountAfterWrite: policies.length
    },
    env: {
      requireClientPolicyForRender: true,
      usageLedgerPath: options.usageLedgerPath
    },
    securityNotes: [
      "Raw client API key is never written into client-policy.json, env snippet, or this report.",
      "client-policy.json stores only the SHA-256 key digest required by CINEJELLY_API_CLIENTS_JSON.",
      "If secretFileWritten is true, move the .secret.txt value into your secure customer onboarding system and do not commit it."
    ],
    nextActions: [
      "Copy the client-policy.env values into the deployment environment.",
      "Run npm.cmd run validation:ops-config -- --client-policy-json <client-policy.json> before deployment capture.",
      "After deploying the same policy env, run validation:billing-admin-ops against the real HTTPS deployment."
    ]
  };
  writeFileSync(reportPath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return 0;
}

function validateOptions(options) {
  if (!clientIdPattern.test(options.clientId)) {
    throw new Error("--client-id must match /^[A-Za-z0-9_.:-]{3,80}$/.");
  }
  if (options.clientKey !== undefined && !clientKeyPattern.test(options.clientKey)) {
    throw new Error("--client-key must be 24-160 characters and contain only letters, numbers, underscore, dot, colon, or hyphen.");
  }
  positiveInteger(options.monthlyRequestLimit, "--monthly-request-limit");
  nonNegativeNumber(options.monthlyReservedCostUsdLimit, "--monthly-reserved-cost-usd-limit");
  nonNegativeNumber(options.maxReservedCostUsdPerRequest, "--max-reserved-cost-usd-per-request");
  nonNegativeNumber(options.defaultReservedCostUsdPerRequest, "--default-reserved-cost-usd-per-request");
  positiveInteger(options.maxDurationTargetSeconds, "--max-duration-target-seconds");
  parseCsvOptions(options.allowedTiers, allowedTiers, "--allowed-tiers");
  parseCsvOptions(options.allowedQualityModes, allowedQualityModes, "--allowed-quality-modes");
  if (typeof options.usageLedgerPath !== "string" || !options.usageLedgerPath.trim() || /[\u0000-\u001f\u007f]/.test(options.usageLedgerPath)) {
    throw new Error("--usage-ledger-path must be a non-empty path without control characters.");
  }
  if (options.existingPolicyJsonPath && extname(options.existingPolicyJsonPath).toLowerCase() !== ".json") {
    throw new Error("--existing-policy-json must point to a JSON file.");
  }
}

function buildPolicy(options, keySha256) {
  return {
    clientId: options.clientId,
    keySha256,
    enabled: true,
    monthlyRequestLimit: options.monthlyRequestLimit,
    monthlyReservedCostUsdLimit: roundMoney(options.monthlyReservedCostUsdLimit),
    maxReservedCostUsdPerRequest: roundMoney(options.maxReservedCostUsdPerRequest),
    defaultReservedCostUsdPerRequest: roundMoney(options.defaultReservedCostUsdPerRequest),
    maxDurationTargetSeconds: options.maxDurationTargetSeconds,
    allowedTiers: parseCsvOptions(options.allowedTiers, allowedTiers, "--allowed-tiers"),
    allowedQualityModes: parseCsvOptions(options.allowedQualityModes, allowedQualityModes, "--allowed-quality-modes")
  };
}

function envSnippet(policies, options) {
  return [
    "# Generated by scripts/create-api-client-policy-kit.mjs",
    "# Keep raw client API keys out of this file. It contains SHA-256 digests only.",
    `CINEJELLY_API_CLIENTS_JSON=${JSON.stringify(policies)}`,
    "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true",
    `CINEJELLY_CLIENT_USAGE_LEDGER_PATH=${options.usageLedgerPath}`,
    ""
  ].join("\n");
}

function readExistingPolicies(path) {
  if (!path) {
    return [];
  }
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Existing policy JSON does not exist: ${toRepoRelative(absolutePath)}.`);
  }
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) {
    throw new Error("--existing-policy-json must contain a JSON array.");
  }
  return parsed;
}

function assertNoDuplicates(policies) {
  const ids = new Set();
  const digests = new Set();
  for (const [index, policy] of policies.entries()) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      throw new Error(`Client policy ${index} must be an object.`);
    }
    if (typeof policy.clientId !== "string" || !clientIdPattern.test(policy.clientId)) {
      throw new Error(`Client policy ${index} has invalid clientId.`);
    }
    if (typeof policy.keySha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(policy.keySha256)) {
      throw new Error(`Client policy ${policy.clientId} has invalid keySha256.`);
    }
    if (ids.has(policy.clientId)) {
      throw new Error(`Duplicate clientId ${policy.clientId}.`);
    }
    if (digests.has(policy.keySha256.toLowerCase())) {
      throw new Error("Duplicate keySha256 digest.");
    }
    ids.add(policy.clientId);
    digests.add(policy.keySha256.toLowerCase());
  }
}

function assertWritableTarget(path, force) {
  if (existsSync(path) && !force) {
    throw new Error(`${toRepoRelative(path)} already exists. Pass --force to overwrite it.`);
  }
}

function generateClientKey() {
  return `cj_live_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsvOptions(value, allowed, flag) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${flag} must be a comma-separated list.`);
  }
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length === 0) {
    throw new Error(`${flag} must include at least one value.`);
  }
  for (const item of items) {
    if (!allowed.has(item)) {
      throw new Error(`${flag} contains unsupported value ${item}.`);
    }
  }
  return items;
}

function positiveInteger(value, flag) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
}

function nonNegativeNumber(value, flag) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative number.`);
  }
}

function roundMoney(value) {
  return Math.round(value * 10000) / 10000;
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
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const redacted = redactUnknown(item);
        return [key, secretKeyPattern.test(key) && typeof redacted === "string" ? "[REDACTED]" : redacted];
      })
    );
  }
  return value;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.api-client-policy-kit.v1",
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
