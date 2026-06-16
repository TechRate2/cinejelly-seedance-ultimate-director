import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  billingAttestationPath: "ops/billing-admin-attestation.json",
  productionAttestationPath: "ops/production-operations-attestation.json",
  outputPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  draftDir: "assets/output_deliverables/business-readiness/operator-drafts",
  operatorPacketPath: "assets/output_deliverables/business-readiness/operator-drafts/operator-attestation-fillout-checklist.md"
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const todoPattern = /\b(?:todo|tbd|replace|placeholder|example\.com|your-|fill[-_ ]?me)\b/i;
const sha256HexPattern = /^[a-fA-F0-9]{64}$/;
const clientIdPattern = /^[A-Za-z0-9_.:-]{3,80}$/;

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    writeDrafts: false,
    force: false
  };
  const flagMap = new Map([
    ["--billing-attestation", "billingAttestationPath"],
    ["--production-attestation", "productionAttestationPath"],
    ["--client-policy-json", "clientPolicyJsonPath"],
    ["--output", "outputPath"],
    ["--draft-dir", "draftDir"],
    ["--operator-packet", "operatorPacketPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--write-drafts") {
      options.writeDrafts = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = rawValue;
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
  console.log(`Validate no-spend business-readiness operations configuration.

Usage:
  npm.cmd run validation:ops-config
  npm.cmd run validation:ops-config -- --write-drafts
  npm.cmd run validation:ops-config -- --client-policy-json ops/client-policy.json

Options:
  --billing-attestation <path>      Default: ${defaults.billingAttestationPath}
  --production-attestation <path>   Default: ${defaults.productionAttestationPath}
  --client-policy-json <path>       Optional JSON file with the CINEJELLY_API_CLIENTS_JSON array.
  --write-drafts                    Write non-secret draft JSON files with empty fields.
  --draft-dir <path>                Draft output directory. Default: ${defaults.draftDir}
  --operator-packet <path>          Markdown fill-out packet written with --write-drafts.
                                    Default: ${defaults.operatorPacketPath}
  --force                           Overwrite existing draft files when used with --write-drafts.
  --output <path>                   Report path. Default: ${defaults.outputPath}
  --no-output                       Print only; do not write the report.

This command performs no network calls, no Atlas calls, no render work, and no billing-provider calls.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const draftFileEvidence = options.writeDrafts ? writeDrafts(options) : { written: false, files: [] };
  const clientPolicy = await validateClientPolicy(options);
  const billing = validateBillingAttestation(options.billingAttestationPath);
  const production = validateProductionAttestation(options.productionAttestationPath);
  const checksWithoutPacket = [
    ...clientPolicy.checks,
    ...billing.checks,
    ...production.checks,
    ...draftFileEvidence.files.map((file) => pass("ops_draft_written", `Prepared draft ${toRepoRelative(file)}.`))
  ];
  const operatorPacket = options.writeDrafts
    ? writeOperatorPacket(options, { draftEvidence: draftFileEvidence, checks: checksWithoutPacket })
    : { written: false };
  const checks = [
    ...checksWithoutPacket,
    ...(operatorPacket.written ? [pass("ops_operator_packet_written", `Wrote operator fill-out packet ${operatorPacket.path}.`)] : [])
  ];
  const draftEvidence = {
    ...draftFileEvidence,
    operatorPacket
  };
  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.business-readiness-ops-config-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    checkedInputs: {
      billingAttestationPath: toRepoRelative(options.billingAttestationPath),
      productionAttestationPath: toRepoRelative(options.productionAttestationPath),
      clientPolicySource: options.clientPolicyJsonPath ? toRepoRelative(options.clientPolicyJsonPath) : "CINEJELLY_API_CLIENTS_JSON",
      draftDir: toRepoRelative(options.draftDir),
      writeDrafts: options.writeDrafts
    },
    checks,
    clientPolicy: clientPolicy.summary,
    billingAttestation: billing.summary,
    productionAttestation: production.summary,
    draftEvidence,
    releaseGateSummary: {
      canRunBillingAdminCapture: status === "pass",
      canRunProductionOpsCapture: status === "pass",
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Ops configuration shape is ready for real deployment captures; this is not business-readiness approval."
        : "Ops configuration is incomplete."
    },
    nextActions: nextActionsFor(checks)
  };

  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

async function validateClientPolicy(options) {
  let policies = [];
  const checks = [];
  if (options.clientPolicyJsonPath) {
    const fileResult = readJsonIfExists(options.clientPolicyJsonPath);
    if (!fileResult.exists) {
      return {
        checks: [fail("client_policy_json", `Client policy JSON file is missing at ${toRepoRelative(options.clientPolicyJsonPath)}.`)],
        summary: { configured: false, source: toRepoRelative(options.clientPolicyJsonPath) }
      };
    }
    if (fileResult.error) {
      return {
        checks: [fail("client_policy_json", `Client policy JSON is invalid: ${fileResult.error}.`)],
        summary: { configured: false, source: toRepoRelative(options.clientPolicyJsonPath) }
      };
    }
    policies = Array.isArray(fileResult.value) ? fileResult.value : [];
    checks.push(
      Array.isArray(fileResult.value)
        ? pass("client_policy_json", "Client policy JSON file is an array.")
        : fail("client_policy_json", "Client policy JSON file must contain an array.")
    );
  } else {
    try {
      const { parseApiClientPoliciesJson } = await import("../dist/api/api-client-policy.js");
      policies = [...parseApiClientPoliciesJson(process.env.CINEJELLY_API_CLIENTS_JSON)];
      checks.push(
        policies.length > 0
          ? pass("client_policy_env", `${policies.length} client polic${policies.length === 1 ? "y is" : "ies are"} configured in CINEJELLY_API_CLIENTS_JSON.`)
          : fail("client_policy_env", "CINEJELLY_API_CLIENTS_JSON is not configured.")
      );
    } catch (error) {
      return {
        checks: [fail("client_policy_env", redactText(error instanceof Error ? error.message : String(error)))],
        summary: { configured: false, source: "CINEJELLY_API_CLIENTS_JSON" }
      };
    }
  }

  checks.push(...validatePolicyArray(policies));
  checks.push(
    process.env.CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER?.trim().toLowerCase() === "true"
      ? pass("client_policy_required_env", "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER is true.")
      : fail("client_policy_required_env", "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER must be true for commercial traffic.")
  );
  checks.push(
    process.env.CINEJELLY_CLIENT_USAGE_LEDGER_PATH?.trim()
      ? pass("client_usage_ledger_env", "CINEJELLY_CLIENT_USAGE_LEDGER_PATH is configured.")
      : fail("client_usage_ledger_env", "CINEJELLY_CLIENT_USAGE_LEDGER_PATH is required for persistent quota evidence.")
  );
  return {
    checks,
    summary: {
      configured: policies.length > 0,
      source: options.clientPolicyJsonPath ? toRepoRelative(options.clientPolicyJsonPath) : "CINEJELLY_API_CLIENTS_JSON",
      clientCount: policies.length,
      enabledClientCount: policies.filter((policy) => policy?.enabled !== false).length,
      requireClientPolicyForRender: process.env.CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER?.trim().toLowerCase() === "true",
      usageLedgerConfigured: Boolean(process.env.CINEJELLY_CLIENT_USAGE_LEDGER_PATH?.trim()),
      clients: policies.map((policy) => ({
        clientId: typeof policy?.clientId === "string" ? policy.clientId : "invalid",
        enabled: policy?.enabled !== false,
        keyDigestConfigured: typeof policy?.keySha256 === "string" && sha256HexPattern.test(policy.keySha256),
        monthlyRequestLimitConfigured: Number.isInteger(policy?.monthlyRequestLimit),
        monthlyReservedCostUsdLimitConfigured: typeof policy?.monthlyReservedCostUsdLimit === "number",
        maxReservedCostUsdPerRequestConfigured: typeof policy?.maxReservedCostUsdPerRequest === "number",
        defaultReservedCostUsdPerRequestConfigured: typeof policy?.defaultReservedCostUsdPerRequest === "number",
        maxDurationTargetSecondsConfigured: Number.isInteger(policy?.maxDurationTargetSeconds),
        allowedTiersConfigured: Array.isArray(policy?.allowedTiers) && policy.allowedTiers.length > 0,
        allowedQualityModesConfigured: Array.isArray(policy?.allowedQualityModes) && policy.allowedQualityModes.length > 0
      }))
    }
  };
}

function validatePolicyArray(policies) {
  const checks = [];
  checks.push(
    policies.length > 0
      ? pass("client_policy_count", "At least one client policy is configured.")
      : fail("client_policy_count", "At least one client policy is required.")
  );
  const enabled = policies.filter((policy) => policy?.enabled !== false);
  checks.push(
    enabled.length > 0
      ? pass("client_policy_enabled_count", "At least one client policy is enabled.")
      : fail("client_policy_enabled_count", "At least one enabled client policy is required.")
  );
  const ids = new Set();
  const digests = new Set();
  for (const [index, policy] of policies.entries()) {
    const label = typeof policy?.clientId === "string" ? policy.clientId : `index_${index}`;
    checks.push(
      typeof policy?.clientId === "string" && clientIdPattern.test(policy.clientId)
        ? pass(`client_policy.${label}.client_id`, "Client ID is valid.")
        : fail(`client_policy.${label}.client_id`, `Client policy ${index} must include a valid clientId.`)
    );
    checks.push(
      typeof policy?.keySha256 === "string" && sha256HexPattern.test(policy.keySha256)
        ? pass(`client_policy.${label}.key_digest`, "Client key digest is a SHA-256 hex string.")
        : fail(`client_policy.${label}.key_digest`, `Client policy ${label} must include keySha256 as a SHA-256 hex string.`)
    );
    checks.push(...requiredPolicyLimitChecks(policy, label));
    if (typeof policy?.clientId === "string") {
      checks.push(
        ids.has(policy.clientId)
          ? fail(`client_policy.${label}.unique_client_id`, `Duplicate clientId ${policy.clientId}.`)
          : pass(`client_policy.${label}.unique_client_id`, "Client ID is unique.")
      );
      ids.add(policy.clientId);
    }
    if (typeof policy?.keySha256 === "string") {
      checks.push(
        digests.has(policy.keySha256)
          ? fail(`client_policy.${label}.unique_key_digest`, "Duplicate keySha256 value.")
          : pass(`client_policy.${label}.unique_key_digest`, "Client key digest is unique.")
      );
      digests.add(policy.keySha256);
    }
  }
  return checks;
}

function requiredPolicyLimitChecks(policy, label) {
  return [
    positiveIntegerCheck(policy?.monthlyRequestLimit, `client_policy.${label}.monthly_request_limit`, "monthlyRequestLimit"),
    nonNegativeNumberCheck(policy?.monthlyReservedCostUsdLimit, `client_policy.${label}.monthly_reserved_cost_limit`, "monthlyReservedCostUsdLimit"),
    nonNegativeNumberCheck(policy?.maxReservedCostUsdPerRequest, `client_policy.${label}.per_request_cost_limit`, "maxReservedCostUsdPerRequest"),
    nonNegativeNumberCheck(policy?.defaultReservedCostUsdPerRequest, `client_policy.${label}.default_request_cost`, "defaultReservedCostUsdPerRequest"),
    positiveIntegerCheck(policy?.maxDurationTargetSeconds, `client_policy.${label}.duration_limit`, "maxDurationTargetSeconds"),
    enumArrayCheck(policy?.allowedTiers, ["fast", "standard"], `client_policy.${label}.allowed_tiers`, "allowedTiers"),
    enumArrayCheck(policy?.allowedQualityModes, ["economy", "standard", "high", "ultimate"], `client_policy.${label}.allowed_quality_modes`, "allowedQualityModes")
  ];
}

function validateBillingAttestation(path) {
  const read = readJsonIfExists(path);
  if (!read.exists) {
    return {
      checks: [fail("billing_attestation_file", `Missing billing/admin attestation at ${toRepoRelative(path)}.`)],
      summary: { configured: false, path: toRepoRelative(path) }
    };
  }
  if (read.error) {
    return {
      checks: [fail("billing_attestation_file", `Billing/admin attestation JSON is invalid: ${read.error}.`)],
      summary: { configured: false, path: toRepoRelative(path) }
    };
  }
  const attestation = read.value;
  const checks = [
    attestation?.schemaVersion === "cinejelly.billing-admin-attestation.v1"
      ? pass("billing_attestation.schema", "Billing/admin attestation schema is recognized.")
      : fail("billing_attestation.schema", "schemaVersion must be cinejelly.billing-admin-attestation.v1."),
    ...requiredStrings(attestation, [
      ["approvedBy", "billing_attestation.approved_by"],
      ["taxHandlingOwner", "billing_attestation.tax_owner"],
      ["supportContact", "billing_attestation.support_contact"]
    ]),
    dateTimeCheck(attestation?.approvedAt, "billing_attestation.approved_at", "approvedAt"),
    enumCheck(attestation?.customerTrafficMode, ["paid_customer", "pilot_contract"], "billing_attestation.customer_traffic_mode", "customerTrafficMode"),
    enumCheck(attestation?.billingProvider, ["stripe", "paddle", "lemonsqueezy", "manual_contract", "external"], "billing_attestation.billing_provider", "billingProvider"),
    httpsUrlCheck(attestation?.termsUrl, "billing_attestation.terms_url", "termsUrl"),
    httpsUrlCheck(attestation?.privacyUrl, "billing_attestation.privacy_url", "privacyUrl"),
    httpsUrlCheck(attestation?.refundPolicyUrl, "billing_attestation.refund_policy_url", "refundPolicyUrl"),
    ...requiredNestedStrings(attestation?.accountLifecycle, "billing_attestation.lifecycle", [
      "provisioning",
      "suspension",
      "apiKeyRotation",
      "refundHandling",
      "chargebackHandling"
    ]),
    attestation?.spendControls?.requiresClientPolicy === true
      ? pass("billing_attestation.spend_controls.require_client_policy", "spendControls.requiresClientPolicy is true.")
      : fail("billing_attestation.spend_controls.require_client_policy", "spendControls.requiresClientPolicy must be true."),
    ...requiredNestedStrings(attestation?.spendControls, "billing_attestation.spend_controls", [
      "emergencyDisableProcedure",
      "quotaReviewCadence"
    ])
  ];
  return {
    checks,
    summary: {
      configured: true,
      path: toRepoRelative(path),
      schemaVersion: attestation?.schemaVersion,
      billingProvider: attestation?.billingProvider,
      customerTrafficMode: attestation?.customerTrafficMode
    }
  };
}

function validateProductionAttestation(path) {
  const read = readJsonIfExists(path);
  if (!read.exists) {
    return {
      checks: [fail("production_attestation_file", `Missing production operations attestation at ${toRepoRelative(path)}.`)],
      summary: { configured: false, path: toRepoRelative(path) }
    };
  }
  if (read.error) {
    return {
      checks: [fail("production_attestation_file", `Production operations attestation JSON is invalid: ${read.error}.`)],
      summary: { configured: false, path: toRepoRelative(path) }
    };
  }
  const attestation = read.value;
  const checks = [
    attestation?.schemaVersion === "cinejelly.production-operations-attestation.v1"
      ? pass("production_attestation.schema", "Production operations attestation schema is recognized.")
      : fail("production_attestation.schema", "schemaVersion must be cinejelly.production-operations-attestation.v1."),
    ...requiredStrings(attestation, [
      ["approvedBy", "production_attestation.approved_by"],
      ["operationsOwner", "production_attestation.operations_owner"],
      ["supportContact", "production_attestation.support_contact"],
      ["securityContact", "production_attestation.security_contact"],
      ["incidentEscalationContact", "production_attestation.incident_escalation"]
    ]),
    dateTimeCheck(attestation?.approvedAt, "production_attestation.approved_at", "approvedAt"),
    enumCheck(attestation?.storage?.provider, ["s3", "gcs", "azure_blob", "r2", "managed_platform", "external"], "production_attestation.storage.provider", "storage.provider"),
    booleanTrueCheck(attestation?.storage?.durableStorage, "production_attestation.storage.durable", "storage.durableStorage"),
    minIntegerCheck(attestation?.storage?.artifactRetentionDays, 30, "production_attestation.storage.retention_days", "storage.artifactRetentionDays"),
    booleanTrueCheck(attestation?.storage?.backupEnabled, "production_attestation.storage.backup_enabled", "storage.backupEnabled"),
    requiredTextCheck(attestation?.storage?.backupCadence, "production_attestation.storage.backup_cadence", "storage.backupCadence"),
    dateTimeCheck(attestation?.storage?.restoreTestedAt, "production_attestation.storage.restore_tested_at", "storage.restoreTestedAt"),
    httpsUrlCheck(attestation?.storage?.restoreRunbookUrl, "production_attestation.storage.restore_runbook_url", "storage.restoreRunbookUrl"),
    ...requiredNestedStrings(attestation?.observability, "production_attestation.observability", [
      "provider",
      "onCallSchedule",
      "requestIdSearchProcedure"
    ]),
    httpsUrlCheck(attestation?.observability?.dashboardUrl, "production_attestation.observability.dashboard_url", "observability.dashboardUrl"),
    booleanTrueCheck(attestation?.observability?.alertingEnabled, "production_attestation.observability.alerting", "observability.alertingEnabled"),
    httpsUrlCheck(attestation?.incidentResponse?.runbookUrl, "production_attestation.incident.runbook_url", "incidentResponse.runbookUrl"),
    ...requiredNestedStrings(attestation?.incidentResponse, "production_attestation.incident", [
      "severityPolicy",
      "rollbackProcedure",
      "postIncidentReviewProcedure"
    ]),
    httpsUrlCheck(attestation?.supportWorkflow?.supportRunbookUrl, "production_attestation.support.runbook_url", "supportWorkflow.supportRunbookUrl"),
    ...requiredNestedStrings(attestation?.supportWorkflow, "production_attestation.support", [
      "responseSlo",
      "customerEscalationProcedure"
    ]),
    booleanTrueCheck(attestation?.dataProtection?.logRedactionReviewPassed, "production_attestation.data.log_redaction", "dataProtection.logRedactionReviewPassed"),
    ...requiredNestedStrings(attestation?.dataProtection, "production_attestation.data", [
      "secretRotationProcedure",
      "customerArtifactDeletionProcedure"
    ]),
    httpsUrlCheck(attestation?.dataProtection?.dataRetentionPolicyUrl, "production_attestation.data.retention_policy_url", "dataProtection.dataRetentionPolicyUrl")
  ];
  return {
    checks,
    summary: {
      configured: true,
      path: toRepoRelative(path),
      schemaVersion: attestation?.schemaVersion,
      storageProvider: attestation?.storage?.provider,
      observabilityProvider: attestation?.observability?.provider
    }
  };
}

function writeDrafts(options) {
  const dir = resolve(repoRoot, options.draftDir);
  mkdirSync(dir, { recursive: true });
  const files = [
    ["billing-admin-attestation.draft.json", billingDraft()],
    ["production-operations-attestation.draft.json", productionDraft()],
    ["client-policy.draft.json", clientPolicyDraft()]
  ].map(([name, value]) => {
    const path = resolve(dir, name);
    if (existsSync(path) && !options.force) {
      return path;
    }
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return path;
  });
  return { written: true, directory: toRepoRelative(options.draftDir), files: files.map((file) => toRepoRelative(file)) };
}

function billingDraft() {
  return {
    schemaVersion: "cinejelly.billing-admin-attestation.v1",
    approvedAt: "",
    approvedBy: "",
    customerTrafficMode: "pilot_contract",
    billingProvider: "manual_contract",
    termsUrl: "",
    privacyUrl: "",
    refundPolicyUrl: "",
    taxHandlingOwner: "",
    supportContact: "",
    accountLifecycle: {
      provisioning: "",
      suspension: "",
      apiKeyRotation: "",
      refundHandling: "",
      chargebackHandling: ""
    },
    spendControls: {
      requiresClientPolicy: true,
      emergencyDisableProcedure: "",
      quotaReviewCadence: ""
    }
  };
}

function productionDraft() {
  return {
    schemaVersion: "cinejelly.production-operations-attestation.v1",
    approvedAt: "",
    approvedBy: "",
    operationsOwner: "",
    supportContact: "",
    securityContact: "",
    incidentEscalationContact: "",
    storage: {
      provider: "managed_platform",
      durableStorage: true,
      artifactRetentionDays: 30,
      backupEnabled: true,
      backupCadence: "",
      restoreTestedAt: "",
      restoreRunbookUrl: ""
    },
    observability: {
      provider: "",
      dashboardUrl: "",
      alertingEnabled: true,
      onCallSchedule: "",
      requestIdSearchProcedure: ""
    },
    incidentResponse: {
      runbookUrl: "",
      severityPolicy: "",
      rollbackProcedure: "",
      postIncidentReviewProcedure: ""
    },
    supportWorkflow: {
      supportRunbookUrl: "",
      responseSlo: "",
      customerEscalationProcedure: ""
    },
    dataProtection: {
      logRedactionReviewPassed: true,
      secretRotationProcedure: "",
      customerArtifactDeletionProcedure: "",
      dataRetentionPolicyUrl: ""
    }
  };
}

function clientPolicyDraft() {
  return [
    {
      clientId: "",
      keySha256: "",
      enabled: true,
      monthlyRequestLimit: 10,
      monthlyReservedCostUsdLimit: 50,
      maxReservedCostUsdPerRequest: 5,
      defaultReservedCostUsdPerRequest: 5,
      maxDurationTargetSeconds: 120,
      allowedTiers: ["fast"],
      allowedQualityModes: ["economy"]
    }
  ];
}

function writeOperatorPacket(options, { draftEvidence, checks }) {
  if (extname(options.operatorPacketPath).toLowerCase() !== ".md") {
    throw new Error("--operator-packet must point to a Markdown file.");
  }
  const absolutePath = resolve(repoRoot, options.operatorPacketPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const markdown = renderOperatorPacket(options, { draftEvidence, checks });
  writeFileSync(absolutePath, `${redactText(markdown)}\n`, "utf8");
  return {
    written: true,
    path: toRepoRelative(options.operatorPacketPath)
  };
}

function renderOperatorPacket(options, { draftEvidence, checks }) {
  const failures = checks.filter((check) => check.status === "fail").slice(0, 16);
  const files = draftEvidence.files.length > 0 ? draftEvidence.files : [
    `${defaults.draftDir}/billing-admin-attestation.draft.json`,
    `${defaults.draftDir}/production-operations-attestation.draft.json`,
    `${defaults.draftDir}/client-policy.draft.json`
  ];
  return [
    "# CineJelly Operator Attestation Fill-Out Packet",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This packet is a no-spend operator aid. It is not release evidence, does not call Atlas, does not call deployment hosts, and must not contain API keys, customer payment records, customer media, or raw customer secrets.",
    "",
    "## Draft Files",
    "",
    ...files.map((file) => `- ${file}`),
    "",
    "## Fill Billing/Admin Attestation",
    "",
    `Edit \`${defaults.draftDir}/billing-admin-attestation.draft.json\` with real non-secret procedures, then promote it to \`${toRepoRelative(options.billingAttestationPath)}\`. Required fields:`,
    "",
    "- `approvedAt`: ISO timestamp of approval.",
    "- `approvedBy`: accountable business/operations owner.",
    "- `customerTrafficMode`: `pilot_contract` or `paid_customer`.",
    "- `billingProvider`: `stripe`, `paddle`, `lemonsqueezy`, `manual_contract`, or `external`.",
    "- `termsUrl`, `privacyUrl`, `refundPolicyUrl`: clean HTTPS URLs without query strings or fragments.",
    "- `taxHandlingOwner` and `supportContact`: real owner/contact strings.",
    "- `accountLifecycle`: provisioning, suspension, API key rotation, refund handling, chargeback handling.",
    "- `spendControls`: `requiresClientPolicy=true`, emergency disable procedure, quota review cadence.",
    "",
    "## Fill Production Operations Attestation",
    "",
    `Edit \`${defaults.draftDir}/production-operations-attestation.draft.json\` with real non-secret operations controls, then promote it to \`${toRepoRelative(options.productionAttestationPath)}\`. Required areas:`,
    "",
    "- approval owners and support/security/incident contacts.",
    "- durable storage provider, retention days, backups, restore test timestamp, restore runbook URL.",
    "- observability provider, dashboard URL, alerting, on-call schedule, request-ID search procedure.",
    "- incident response runbook, severity policy, rollback procedure, post-incident review procedure.",
    "- support runbook, response SLO, customer escalation procedure.",
    "- log redaction review, secret rotation procedure, customer artifact deletion procedure, data-retention URL.",
    "",
    "## Client Policy",
    "",
    "Use `npm.cmd run ops:create-client-policy -- --client-id <pilot-client-id>` for real customer/pilot keys. The draft client-policy JSON is a shape reference only; do not paste raw client keys into it.",
    "",
    "## Validation Loop",
    "",
    "Run these after filling the draft JSON files:",
    "",
    "```powershell",
    "npm.cmd run ops:promote-attestations -- --dry-run",
    "npm.cmd run ops:promote-attestations",
    "npm.cmd run validation:ops-config",
    "```",
    "",
    "After ops config passes and the API is deployed behind a real HTTPS host:",
    "",
    "```powershell",
    "npm.cmd run validation:deployment-readiness -- --base-url https://<your-cinejelly-host>",
    "npm.cmd run validation:billing-admin-ops -- --base-url https://<your-cinejelly-host> --attestation ops/billing-admin-attestation.json",
    "npm.cmd run validation:production-ops -- --base-url https://<your-cinejelly-host> --attestation ops/production-operations-attestation.json",
    "npm.cmd run validation:business-readiness",
    "```",
    "",
    "## Current Blocking Checks",
    "",
    ...(failures.length > 0
      ? failures.map((check) => `- ${check.name}: ${check.message}`)
      : ["- None in the current ops-config check."]),
    "",
    "## Guardrails",
    "",
    "- Keep completed attestation files non-secret.",
    "- Keep `ops/*.json` ignored by Git.",
    "- Do not mark this packet as customer-release evidence.",
    "- Business readiness still requires real deployment captures and the remaining paid/live validation gates."
  ].join("\n");
}

function requiredStrings(object, fields) {
  return fields.map(([field, name]) => requiredTextCheck(object?.[field], name, field));
}

function requiredNestedStrings(object, prefix, fields) {
  return fields.map((field) => requiredTextCheck(object?.[field], `${prefix}.${toSnake(field)}`, field));
}

function requiredTextCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    return fail(name, `${fieldName} must be a non-empty string.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value) || todoPattern.test(value)) {
    return fail(name, `${fieldName} must be real non-placeholder text without control characters.`);
  }
  return pass(name, `${fieldName} is configured.`);
}

function dateTimeCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || todoPattern.test(value)) {
    return fail(name, `${fieldName} must be an ISO date-time string.`);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? pass(name, `${fieldName} is a valid date-time string.`)
    : fail(name, `${fieldName} must be a valid ISO date-time string.`);
}

function httpsUrlCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || todoPattern.test(value)) {
    return fail(name, `${fieldName} must be a real HTTPS URL.`);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return fail(name, `${fieldName} must be HTTPS and must not include credentials, query strings, or fragments.`);
    }
    return pass(name, `${fieldName} is a clean HTTPS URL.`);
  } catch {
    return fail(name, `${fieldName} must be a valid HTTPS URL.`);
  }
}

function enumCheck(value, allowed, name, fieldName) {
  return allowed.includes(value)
    ? pass(name, `${fieldName} is supported.`)
    : fail(name, `${fieldName} must be one of: ${allowed.join(", ")}.`);
}

function enumArrayCheck(value, allowed, name, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(name, `${fieldName} must be a non-empty array.`);
  }
  const unsupported = value.find((item) => !allowed.includes(item));
  return unsupported === undefined
    ? pass(name, `${fieldName} is configured.`)
    : fail(name, `${fieldName} contains unsupported value ${String(unsupported)}.`);
}

function booleanTrueCheck(value, name, fieldName) {
  return value === true
    ? pass(name, `${fieldName} is true.`)
    : fail(name, `${fieldName} must be true.`);
}

function positiveIntegerCheck(value, name, fieldName) {
  return Number.isInteger(value) && value > 0
    ? pass(name, `${fieldName} is configured.`)
    : fail(name, `${fieldName} must be a positive integer.`);
}

function minIntegerCheck(value, min, name, fieldName) {
  return Number.isInteger(value) && value >= min
    ? pass(name, `${fieldName} is at least ${min}.`)
    : fail(name, `${fieldName} must be an integer at least ${min}.`);
}

function nonNegativeNumberCheck(value, name, fieldName) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? pass(name, `${fieldName} is configured.`)
    : fail(name, `${fieldName} must be a non-negative number.`);
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return { exists: true, value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { exists: true, error: redactText(error instanceof Error ? error.message : String(error)) };
  }
}

function statusForChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function nextActionsFor(checks) {
  const actions = checks.filter((check) => check.status === "fail").map((check) => check.message);
  if (actions.length > 0) {
    actions.push("Fill the non-secret attestation files with real deployment/business procedures before running deployment captures.");
    actions.push("Configure CINEJELLY_API_CLIENTS_JSON, CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true, and CINEJELLY_CLIENT_USAGE_LEDGER_PATH before paid customer traffic.");
  } else {
    actions.push("Run validation:billing-admin-ops and validation:production-ops against the real HTTPS deployment host.");
  }
  return [...new Set(actions)];
}

function writeMaybe(options, report) {
  if (!options.writeReport) {
    return;
  }
  const absolutePath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
}

function toSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
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

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

try {
  process.exitCode = await main();
} catch (error) {
  const report = {
    schemaVersion: "cinejelly.business-readiness-ops-config-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
