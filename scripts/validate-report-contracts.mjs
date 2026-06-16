import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json",
  maxIssuesPerContract: 20
};

const defaultContracts = [
  contract("phase6_release_audit", "schemas/phase6-release-audit-report.schema.json", "assets/output_deliverables/phase6-validation/release-audit-report.json"),
  contract("phase6_paid_render", "schemas/phase6-paid-render-validation-report.schema.json", "assets/output_deliverables/phase6-validation/paid-render-report.json"),
  contract("business_readiness_audit", "schemas/business-readiness-audit-report.schema.json", "assets/output_deliverables/phase6-validation/business-readiness-report.json"),
  contract("business_readiness_plan", "schemas/business-readiness-validation-plan.schema.json", "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json"),
  contract("live_readiness_inputs", "schemas/live-readiness-inputs-report.schema.json", "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json"),
  contract("atlas_billing_readiness", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json"),
  contract("atlas_billing_generated_audio_smoke", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json"),
  contract("commercial_launch_inputs", "schemas/commercial-launch-inputs-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json"),
  contract("ops_config_validation", "schemas/business-readiness-ops-config-validation-report.schema.json", "assets/output_deliverables/business-readiness/ops-config-validation-report.json"),
  contract("long_form_validation", "schemas/long-form-validation-report.schema.json", "assets/output_deliverables/business-readiness/long-form-validation-report.json"),
  contract("source_video_validation", "schemas/source-video-auto-analysis-validation-report.schema.json", "assets/output_deliverables/business-readiness/source-video-validation-report.json"),
  contract("remote_stock_validation", "schemas/remote-stock-validation-report.schema.json", "assets/output_deliverables/business-readiness/remote-stock-validation-report.json"),
  contract("generated_audio_validation", "schemas/generated-audio-validation-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-validation-report.json"),
  contract("billing_admin_ops", "schemas/billing-admin-ops-report.schema.json", "assets/output_deliverables/business-readiness/billing-admin-ops-report.json"),
  contract("production_operations", "schemas/production-operations-report.schema.json", "assets/output_deliverables/business-readiness/production-operations-report.json"),
  contract("report_contract_validation", "schemas/report-contract-validation-report.schema.json", "assets/output_deliverables/business-readiness/report-contract-validation-report.json")
];

function contract(name, schemaPath, reportPath) {
  return { name, schemaPath, reportPath, required: false };
}

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    contracts: [...defaultContracts]
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--max-issues-per-contract", "maxIssuesPerContract"]
  ]);

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
    if (arg === "--contract") {
      const value = readRequiredValue(args, index, arg);
      options.contracts.push(parseContractValue(value, true));
      index += 1;
      continue;
    }
    if (arg.startsWith("--contract=")) {
      options.contracts.push(parseContractValue(arg.slice("--contract=".length), true));
      continue;
    }
    if (arg === "--only-contract") {
      const value = readRequiredValue(args, index, arg);
      options.contracts = [parseContractValue(value, true)];
      index += 1;
      continue;
    }
    if (arg.startsWith("--only-contract=")) {
      options.contracts = [parseContractValue(arg.slice("--only-contract=".length), true)];
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = key === "maxIssuesPerContract" ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function parseContractValue(value, required) {
  const parts = String(value).split("=");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("--contract must use name:schemaPath=reportPath or schemaPath=reportPath.");
  }
  const [left, reportPath] = parts;
  const colonIndex = left.indexOf(":");
  const name = colonIndex >= 0 ? left.slice(0, colonIndex) : basenameWithoutJson(left);
  const schemaPath = colonIndex >= 0 ? left.slice(colonIndex + 1) : left;
  return { name, schemaPath, reportPath, required };
}

function basenameWithoutJson(path) {
  return String(path).split(/[\\/]/).pop()?.replace(/\.schema\.json$/i, "").replace(/\.json$/i, "") || "custom_contract";
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Validate generated CineJelly JSON reports against local JSON schema contracts without network calls.

Usage:
  npm.cmd run validation:report-contracts
  npm.cmd run validation:report-contracts -- --only-contract live:schemas/live-readiness-inputs-report.schema.json=assets/output_deliverables/business-readiness/live-readiness-inputs-report.json

Options:
  --contract <name:schema=report>          Add a required custom contract.
  --only-contract <name:schema=report>     Validate only one required custom contract.
  --max-issues-per-contract <count>        Default: ${defaults.maxIssuesPerContract}
  --output <path>                          JSON report path. Default: ${defaults.outputPath}
  --no-output                              Print only; do not write the report.

Default contracts are skipped when their report file is absent. Custom contracts are required. This command performs no provider calls, no deployment calls, no render work, and no paid validation.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const contracts = options.contracts.map((item) => validateContract(item, options));
  const status = statusForContracts(contracts);
  const report = {
    schemaVersion: "cinejelly.report-contract-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    checkedInputs: {
      contractCount: contracts.length,
      outputPath: toRepoRelative(options.outputPath),
      maxIssuesPerContract: options.maxIssuesPerContract
    },
    summary: {
      passed: contracts.filter((item) => item.status === "pass").length,
      failed: contracts.filter((item) => item.status === "fail").length,
      skipped: contracts.filter((item) => item.status === "skipped").length
    },
    contracts,
    releaseGateSummary: {
      reportContractsPass: status === "pass",
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Report contracts pass; this is schema-shape evidence only, not commercial release approval."
        : "One or more generated reports do not match their local schema contract."
    },
    nextActions: nextActionsFor(contracts)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (!Number.isSafeInteger(options.maxIssuesPerContract) || options.maxIssuesPerContract < 1 || options.maxIssuesPerContract > 200) {
    throw new Error("--max-issues-per-contract must be an integer from 1 to 200.");
  }
}

function validateContract(item, options) {
  const schemaRead = readJsonFile(item.schemaPath);
  const reportRead = readJsonFile(item.reportPath);
  if (!schemaRead.exists) {
    return failContract(item, [`Missing schema file at ${toRepoRelative(item.schemaPath)}.`]);
  }
  if (schemaRead.error) {
    return failContract(item, [`Schema JSON is invalid: ${schemaRead.error}.`]);
  }
  if (!reportRead.exists) {
    if (item.required) {
      return failContract(item, [`Missing report file at ${toRepoRelative(item.reportPath)}.`]);
    }
    return {
      name: item.name,
      status: "skipped",
      schemaPath: toRepoRelative(item.schemaPath),
      reportPath: toRepoRelative(item.reportPath),
      message: "Report file is absent; default optional contract skipped.",
      issueCount: 0,
      issues: []
    };
  }
  if (reportRead.error) {
    return failContract(item, [`Report JSON is invalid: ${reportRead.error}.`]);
  }
  const issues = validateAgainstSchema(schemaRead.value, reportRead.value, "$", schemaRead.value)
    .slice(0, options.maxIssuesPerContract);
  return {
    name: item.name,
    status: issues.length === 0 ? "pass" : "fail",
    schemaPath: toRepoRelative(item.schemaPath),
    reportPath: toRepoRelative(item.reportPath),
    schemaVersion: typeof reportRead.value?.schemaVersion === "string" ? reportRead.value.schemaVersion : undefined,
    reportStatus: typeof reportRead.value?.status === "string" ? reportRead.value.status : undefined,
    issueCount: issues.length,
    issues,
    message: issues.length === 0 ? "Report matches schema contract." : "Report does not match schema contract."
  };
}

function failContract(item, issues) {
  return {
    name: item.name,
    status: "fail",
    schemaPath: toRepoRelative(item.schemaPath),
    reportPath: toRepoRelative(item.reportPath),
    issueCount: issues.length,
    issues,
    message: "Contract cannot be validated."
  };
}

function validateAgainstSchema(schema, value, path, rootSchema) {
  if (schema === true || schema === undefined) {
    return [];
  }
  if (schema === false) {
    return [`${path}: schema forbids this value.`];
  }
  if (typeof schema !== "object" || schema === null) {
    return [];
  }

  const dereferenced = resolveRef(schema, rootSchema);
  if (dereferenced !== schema) {
    return validateAgainstSchema(dereferenced, value, path, rootSchema);
  }

  const issues = [];
  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      issues.push(...validateAgainstSchema(subSchema, value, path, rootSchema));
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter((subSchema) => validateAgainstSchema(subSchema, value, path, rootSchema).length === 0);
    if (matches.length === 0) {
      issues.push(`${path}: value does not match any allowed schema.`);
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((subSchema) => validateAgainstSchema(subSchema, value, path, rootSchema).length === 0);
    if (matches.length !== 1) {
      issues.push(`${path}: value must match exactly one schema but matched ${matches.length}.`);
    }
  }
  if (schema.not && validateAgainstSchema(schema.not, value, path, rootSchema).length === 0) {
    issues.push(`${path}: value matches a forbidden schema.`);
  }
  if (schema.if && validateAgainstSchema(schema.if, value, path, rootSchema).length === 0 && schema.then) {
    issues.push(...validateAgainstSchema(schema.then, value, path, rootSchema));
  }

  if ("const" in schema && !jsonEqual(value, schema.const)) {
    issues.push(`${path}: expected constant ${JSON.stringify(schema.const)}.`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    issues.push(`${path}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}.`);
  }
  if (schema.type && !matchesType(value, schema.type)) {
    issues.push(`${path}: expected type ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}.`);
    return issues;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push(`${path}: expected number >= ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push(`${path}: expected number <= ${schema.maximum}.`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push(`${path}: expected string length >= ${schema.minLength}.`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      issues.push(`${path}: expected string length <= ${schema.maxLength}.`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${path}: string does not match pattern ${schema.pattern}.`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      issues.push(`${path}: string is not a valid date-time.`);
    }
    if (schema.format === "uri" && !isUri(value)) {
      issues.push(`${path}: string is not a valid URI.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push(`${path}: expected at least ${schema.minItems} item(s).`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push(`${path}: expected at most ${schema.maxItems} item(s).`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        issues.push(...validateAgainstSchema(schema.items, item, `${path}[${index}]`, rootSchema));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          issues.push(`${path}: missing required property ${key}.`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        issues.push(...validateAgainstSchema(propertySchema, value[key], `${path}.${escapePath(key)}`, rootSchema));
      }
    }
    const knownKeys = new Set(Object.keys(properties));
    for (const key of Object.keys(value)) {
      if (!knownKeys.has(key)) {
        if (schema.additionalProperties === false) {
          issues.push(`${path}: unexpected property ${key}.`);
        } else if (isPlainObject(schema.additionalProperties) || schema.additionalProperties === true || schema.additionalProperties === false) {
          if (isPlainObject(schema.additionalProperties)) {
            issues.push(...validateAgainstSchema(schema.additionalProperties, value[key], `${path}.${escapePath(key)}`, rootSchema));
          }
        }
      }
    }
  }
  return issues;
}

function resolveRef(schema, rootSchema) {
  if (typeof schema.$ref !== "string") {
    return schema;
  }
  if (!schema.$ref.startsWith("#/")) {
    throw new Error(`Unsupported external $ref: ${schema.$ref}`);
  }
  const parts = schema.$ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = rootSchema;
  for (const part of parts) {
    current = current?.[part];
  }
  if (current === undefined) {
    throw new Error(`Unresolvable $ref: ${schema.$ref}`);
  }
  return current;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => {
    if (item === "array") {
      return Array.isArray(value);
    }
    if (item === "object") {
      return isPlainObject(value);
    }
    if (item === "integer") {
      return Number.isInteger(value);
    }
    if (item === "number") {
      return typeof value === "number" && Number.isFinite(value);
    }
    if (item === "string") {
      return typeof value === "string";
    }
    if (item === "boolean") {
      return typeof value === "boolean";
    }
    if (item === "null") {
      return value === null;
    }
    return true;
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isUri(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol);
  } catch {
    return false;
  }
}

function escapePath(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

function statusForContracts(contracts) {
  return contracts.some((item) => item.status === "fail") ? "fail" : "pass";
}

function nextActionsFor(contracts) {
  const actions = [];
  for (const item of contracts) {
    if (item.status === "fail") {
      actions.push(`${item.name}: fix ${item.issueCount} schema contract issue(s) in ${item.reportPath}.`);
    }
  }
  if (actions.length === 0) {
    actions.push("Keep running validation:report-contracts after refreshing readiness reports and before sharing release evidence.");
  }
  return actions;
}

function readJsonFile(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return { exists: true, value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.report-contract-validation.v1",
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
