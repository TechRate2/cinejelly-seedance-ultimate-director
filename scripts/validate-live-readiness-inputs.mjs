import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  atlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
  generatedAudioAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json",
  longFormAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json",
  sourceVideoAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json",
  launchIntakePath: "ops/commercial-launch-intake.json",
  billingAttestationPath: "ops/billing-admin-attestation.json",
  productionAttestationPath: "ops/production-operations-attestation.json",
  deploymentBaseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  sourceVideoUrl: process.env.CINEJELLY_VALIDATION_SOURCE_VIDEO_URL,
  maxBudgetUsd: Number(process.env.CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD || "5"),
  atlasBillingEvidenceMaxAgeHours: Number(process.env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS || "24"),
  longFormDurationSeconds: 120,
  generatedAudioText: "Xin chao, day la ban kiem tra am thanh ngan cua CineJelly."
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|policy|expires|sig/i;
const envNamePattern = /^[A-Z][A-Z0-9_]{2,80}$/;

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    explicitOptions: new Set()
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--ops-config-report", "opsConfigPath"],
    ["--atlas-billing-report", "atlasBillingPath"],
    ["--generated-audio-atlas-billing-report", "generatedAudioAtlasBillingPath"],
    ["--long-form-atlas-billing-report", "longFormAtlasBillingPath"],
    ["--source-video-atlas-billing-report", "sourceVideoAtlasBillingPath"],
    ["--launch-intake", "launchIntakePath"],
    ["--billing-attestation", "billingAttestationPath"],
    ["--production-attestation", "productionAttestationPath"],
    ["--deployment-base-url", "deploymentBaseUrl"],
    ["--source-video-url", "sourceVideoUrl"],
    ["--max-budget-usd", "maxBudgetUsd"],
    ["--atlas-billing-evidence-max-age-hours", "atlasBillingEvidenceMaxAgeHours"],
    ["--long-form-duration-seconds", "longFormDurationSeconds"],
    ["--generated-audio-text", "generatedAudioText"]
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
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = numericOption(key) ? Number(rawValue) : rawValue;
      options.explicitOptions.add(key);
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function applyLaunchIntakeDefaults(options) {
  const launchIntake = summarizeLaunchIntake(options.launchIntakePath);
  const value = launchIntake.usable ? launchIntake.value : undefined;
  const next = {
    ...options,
    launchIntake
  };
  if (value) {
    const deploymentBaseUrl = typeof value.deployment?.baseUrl === "string" ? value.deployment.baseUrl : undefined;
    const sourceVideoUrl = value.sourceVideo?.enabled === true && typeof value.sourceVideo?.url === "string" ? value.sourceVideo.url : undefined;
    const approvedBudget = numberOrUndefined(value.budgetApproval?.approvedAtlasBudgetUsd);
    const billingAttestationPath = typeof value.operatorEvidence?.billingAttestationPath === "string" ? value.operatorEvidence.billingAttestationPath : undefined;
    const productionAttestationPath = typeof value.operatorEvidence?.productionAttestationPath === "string" ? value.operatorEvidence.productionAttestationPath : undefined;
    if (!next.explicitOptions.has("deploymentBaseUrl") && !next.deploymentBaseUrl && deploymentBaseUrl) {
      next.deploymentBaseUrl = deploymentBaseUrl;
      launchIntake.applied = true;
    }
    if (!next.explicitOptions.has("sourceVideoUrl") && !next.sourceVideoUrl && sourceVideoUrl) {
      next.sourceVideoUrl = sourceVideoUrl;
      launchIntake.applied = true;
    }
    if (!next.explicitOptions.has("maxBudgetUsd") && !process.env.CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD && approvedBudget !== undefined) {
      next.maxBudgetUsd = approvedBudget;
      launchIntake.applied = true;
    }
    if (!next.explicitOptions.has("billingAttestationPath") && billingAttestationPath) {
      next.billingAttestationPath = billingAttestationPath;
      launchIntake.applied = true;
    }
    if (!next.explicitOptions.has("productionAttestationPath") && productionAttestationPath) {
      next.productionAttestationPath = productionAttestationPath;
      launchIntake.applied = true;
    }
  }
  return next;
}

function numericOption(key) {
  return ["maxBudgetUsd", "atlasBillingEvidenceMaxAgeHours", "longFormDurationSeconds"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Validate live-readiness inputs without network calls or provider spend.

Usage:
  npm.cmd run validation:live-inputs
  npm.cmd run validation:live-inputs -- --deployment-base-url https://cinejelly.example.com --source-video-url https://cdn.example.com/source.mp4

Options:
  --ops-config-report <path>              Default: ${defaults.opsConfigPath}
  --atlas-billing-report <path>           Default: ${defaults.atlasBillingPath}
  --generated-audio-atlas-billing-report <path>
                                           Default: ${defaults.generatedAudioAtlasBillingPath}
  --long-form-atlas-billing-report <path> Default: ${defaults.longFormAtlasBillingPath}
  --source-video-atlas-billing-report <path>
                                           Default: ${defaults.sourceVideoAtlasBillingPath}
  --launch-intake <path>                   Ignored operator intake JSON. Default: ${defaults.launchIntakePath}
  --billing-attestation <path>            Default: ${defaults.billingAttestationPath}
  --production-attestation <path>         Default: ${defaults.productionAttestationPath}
  --deployment-base-url <url>             Real CineJelly HTTPS deployment URL. Can also use CINEJELLY_DEPLOYMENT_BASE_URL.
  --source-video-url <url>                Clean HTTPS source-video URL. Can also use CINEJELLY_VALIDATION_SOURCE_VIDEO_URL.
  --max-budget-usd <amount>               Budget ceiling for known paid validation. Default: ${defaults.maxBudgetUsd}
  --atlas-billing-evidence-max-age-hours <hours>
                                           Maximum age for Atlas billing readiness evidence. Default: ${defaults.atlasBillingEvidenceMaxAgeHours}
  --long-form-duration-seconds <seconds>  Target long-form validation duration. Default: ${defaults.longFormDurationSeconds}
  --generated-audio-text <text>           Text used for generated-audio cost estimate.
  --output <path>                         JSON report path. Default: ${defaults.outputPath}
  --no-output                             Print only; do not write the report.

This command reads only local configuration and files. It does not call Atlas, deployment endpoints, source-video URLs, FFmpeg, stock providers, render routes, or billing providers.`);
}

function main() {
  const options = applyLaunchIntakeDefaults(parseArgs(process.argv.slice(2)));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const costPlan = buildCostPlan(options);
  const environment = summarizeEnvironment(options, costPlan);
  const gates = buildGates({ environment, costPlan });
  const status = statusForGates(gates);
  const report = {
    schemaVersion: "cinejelly.live-readiness-inputs.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      opsConfigPath: toRepoRelative(options.opsConfigPath),
      atlasBillingPath: toRepoRelative(options.atlasBillingPath),
      generatedAudioAtlasBillingPath: toRepoRelative(options.generatedAudioAtlasBillingPath),
      longFormAtlasBillingPath: toRepoRelative(options.longFormAtlasBillingPath),
      sourceVideoAtlasBillingPath: toRepoRelative(options.sourceVideoAtlasBillingPath),
      launchIntakePath: toRepoRelative(options.launchIntakePath),
      launchIntakePresent: options.launchIntake.present,
      launchIntakeStatus: options.launchIntake.status,
      launchIntakeApplied: options.launchIntake.applied === true,
      billingAttestationPath: toRepoRelative(options.billingAttestationPath),
      productionAttestationPath: toRepoRelative(options.productionAttestationPath),
      deploymentBaseUrlConfigured: Boolean(options.deploymentBaseUrl),
      sourceVideoUrlConfigured: Boolean(options.sourceVideoUrl),
      maxBudgetUsd: options.maxBudgetUsd,
      longFormDurationSeconds: options.longFormDurationSeconds,
      generatedAudioTextCharacterCount: options.generatedAudioText.length
    },
    environment,
    costPlan,
    gates,
    releaseGateSummary: buildReleaseGateSummary({ environment, costPlan, gates }),
    nextActions: nextActionsFor({ environment, costPlan, gates })
  };

  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "ready_for_live_validation_sequence" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (!Number.isFinite(options.maxBudgetUsd) || options.maxBudgetUsd < 0) {
    throw new Error("--max-budget-usd must be a non-negative number.");
  }
  if (!Number.isFinite(options.atlasBillingEvidenceMaxAgeHours) || options.atlasBillingEvidenceMaxAgeHours <= 0) {
    throw new Error("--atlas-billing-evidence-max-age-hours must be a positive number.");
  }
  if (!Number.isSafeInteger(options.longFormDurationSeconds) || options.longFormDurationSeconds < 120 || options.longFormDurationSeconds > 480) {
    throw new Error("--long-form-duration-seconds must be an integer from 120 to 480.");
  }
}

function summarizeEnvironment(options, costPlan) {
  const launchIntake = options.launchIntake;
  const launchIntakeValue = launchIntake?.usable ? launchIntake.value : undefined;
  const opsConfig = summarizeOpsConfig(options.opsConfigPath);
  const atlasBilling = summarizeAtlasBilling(options.atlasBillingPath, {
    maxBudgetUsd: options.maxBudgetUsd,
    plannedCostUsd: costPlan.knownPaidEstimateUsd
  }, options.atlasBillingEvidenceMaxAgeHours);
  const atlasBillingSlices = {
    generatedAudio: summarizeAtlasBilling(options.generatedAudioAtlasBillingPath, {
      maxBudgetUsd: options.maxBudgetUsd,
      plannedCostUsd: costPlan.generatedAudio.estimatedCostUsd
    }, options.atlasBillingEvidenceMaxAgeHours),
    longForm: summarizeAtlasBilling(options.longFormAtlasBillingPath, {
      maxBudgetUsd: options.maxBudgetUsd,
      plannedCostUsd: costPlan.longForm.estimatedCostUsd
    }, options.atlasBillingEvidenceMaxAgeHours),
    sourceVideo: summarizeSourceVideoAtlasBilling(options.sourceVideoAtlasBillingPath, options.atlasBillingEvidenceMaxAgeHours)
  };
  const deployment = urlEvidence(options.deploymentBaseUrl, "deployment");
  const sourceVideoUrl = urlEvidence(options.sourceVideoUrl, "source_video");
  const apiClientPolicies = jsonArrayEnv("CINEJELLY_API_CLIENTS_JSON");
  const generatedAudioCapabilities = generatedAudioCapabilitiesEnv("ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON");
  const seedanceCapabilities = jsonArrayEnv("ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON");
  const remoteStockProviders = remoteStockProviderEvidence(launchIntakeValue);
  const intakeAuthTokenEnvName = envNameOrUndefined(launchIntakeValue?.deployment?.authTokenEnvName);
  const intakeSourceVideoEnabled = launchIntakeValue?.sourceVideo?.enabled === true && launchIntakeValue?.sourceVideo?.approvedForAtlasLlmAnalysis === true;
  const intakeRemoteStockEnabled = launchIntakeValue?.remoteStock?.enabled === true;
  const intakeRemoteStockTermsReviewed = launchIntakeValue?.remoteStock?.commercialTermsReviewed === true;

  return {
    launchIntake: {
      present: launchIntake.present,
      status: launchIntake.status,
      applied: launchIntake.applied === true,
      path: launchIntake.path,
      selectedPaidScope: launchIntake.usable && typeof launchIntakeValue?.budgetApproval?.scope === "string"
        ? launchIntakeValue.budgetApproval.scope
        : undefined
    },
    atlas: {
      mediaApiKeyConfigured: envConfigured("ATLASCLOUD_API_KEY"),
      llmApiKeyConfigured: envConfigured("ATLASCLOUD_LLM_API_KEY"),
      llmFallbackAvailable: envConfigured("ATLASCLOUD_LLM_API_KEY") || envConfigured("ATLASCLOUD_API_KEY"),
      llmBaseUrlConfigured: envConfigured("ATLASCLOUD_LLM_BASE_URL"),
      mediaBaseUrlConfigured: envConfigured("ATLASCLOUD_MEDIA_BASE_URL") || envConfigured("ATLASCLOUD_BASE_URL"),
      llmModelConfigured: envConfigured("ATLASCLOUD_LLM_MODEL"),
      seedanceStandardModelConfigured: envConfigured("ATLASCLOUD_SEEDANCE_STANDARD_MODEL"),
      seedanceFastModelConfigured: envConfigured("ATLASCLOUD_SEEDANCE_FAST_MODEL"),
      seedanceCapabilitiesJsonConfigured: seedanceCapabilities.configured,
      seedanceCapabilitiesJsonValid: seedanceCapabilities.valid,
      seedanceCapabilityCount: seedanceCapabilities.count
    },
    deployment: {
      ...deployment,
      authTokenConfigured:
        (intakeAuthTokenEnvName ? envConfigured(intakeAuthTokenEnvName) : false) ||
        envConfigured("CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN") ||
        envConfigured("CINEJELLY_API_AUTH_TOKEN")
    },
    operations: {
      opsConfig,
      billingAttestationPresent: fileExists(options.billingAttestationPath),
      productionAttestationPresent: fileExists(options.productionAttestationPath),
      apiClientPoliciesConfigured: apiClientPolicies.configured,
      apiClientPoliciesValidJsonArray: apiClientPolicies.valid,
      apiClientPolicyCount: apiClientPolicies.count,
      requireClientPolicyForRender: envTrue("CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER"),
      usageLedgerConfigured: envConfigured("CINEJELLY_CLIENT_USAGE_LEDGER_PATH")
    },
    atlasBilling,
    atlasBillingSlices,
    sourceVideo: {
      cleanHttpsUrlConfigured: sourceVideoUrl.configured,
      cleanHttpsUrlValid: sourceVideoUrl.valid,
      safeUrlPreview: sourceVideoUrl.safeUrlPreview,
      autoAnalysisEnabled: envTrue("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS") || intakeSourceVideoEnabled,
      atlasLlmReady: (envConfigured("ATLASCLOUD_LLM_API_KEY") || envConfigured("ATLASCLOUD_API_KEY")) && envConfigured("ATLASCLOUD_LLM_MODEL")
    },
    remoteStock: {
      enabled: envTrue("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS") || intakeRemoteStockEnabled,
      configuredProviderCount: remoteStockProviders.filter((provider) => provider.ready).length,
      commercialTermsReviewedForCoverr: envTrue("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED") || intakeRemoteStockTermsReviewed,
      providers: remoteStockProviders
    },
    generatedAudio: {
      modelConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_MODEL"),
      voiceIdConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_VOICE_ID"),
      costRateConfigured: numberFromEnv("ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS") !== undefined,
      capabilitiesJsonConfigured: generatedAudioCapabilities.configured,
      capabilitiesJsonValid: generatedAudioCapabilities.valid,
      capabilityCount: generatedAudioCapabilities.count,
      capabilitiesMessage: generatedAudioCapabilities.message,
      atlasMediaReady: envConfigured("ATLASCLOUD_API_KEY")
    }
  };
}

function summarizeOpsConfig(path) {
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      failCount: 0
    };
  }
  const checks = Array.isArray(report.checks) ? report.checks : [];
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    failCount: checks.filter((check) => check?.status === "fail").length,
    canRunBillingAdminCapture: report.releaseGateSummary?.canRunBillingAdminCapture === true,
    canRunProductionOpsCapture: report.releaseGateSummary?.canRunProductionOpsCapture === true
  };
}

function summarizeAtlasBilling(path, expectedCostPlan, maxAgeHours) {
  if (expectedCostPlan.plannedCostUsd === undefined) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing_expected_cost",
      canUseAsPrePaidAtlasBillingEvidence: false,
      canRunAtlasSpendWithinApprovedBudget: false,
      message: "Configure the relevant cost estimate before this Atlas billing report can be evaluated."
    };
  }
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      canUseAsPrePaidAtlasBillingEvidence: false,
      canRunAtlasSpendWithinApprovedBudget: false,
      message: "Run validation:atlas-billing with the approved budget before paid Atlas validation."
    };
  }
  const reportPlan = atlasBillingReportPlan(report, expectedCostPlan);
  const reportFreshness = atlasBillingReportFreshness(report, maxAgeHours, expectedCostPlan.maxBudgetUsd);
  const failures = Array.isArray(report.checks)
    ? report.checks.filter((check) => check?.status === "fail").map((check) => String(check.message ?? check.name ?? "unknown"))
    : [];
  const messages = [
    ...(reportFreshness.freshForPaidValidation ? [] : [reportFreshness.message]),
    ...(reportPlan.matchesCurrentPlan ? [] : [reportPlan.message]),
    ...failures
  ];
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    reportMaxBudgetUsd: reportPlan.reportMaxBudgetUsd,
    reportPlannedCostUsd: reportPlan.reportPlannedCostUsd,
    currentMaxBudgetUsd: expectedCostPlan.maxBudgetUsd,
    currentPlannedCostUsd: expectedCostPlan.plannedCostUsd,
    budgetMatchesCurrentPlan: reportPlan.matchesCurrentPlan,
    reportGeneratedAt: reportFreshness.reportGeneratedAt,
    maxAgeHours: reportFreshness.maxAgeHours,
    reportAgeHours: reportFreshness.reportAgeHours,
    freshForPaidValidation: reportFreshness.freshForPaidValidation,
    canUseAsPrePaidAtlasBillingEvidence:
      reportPlan.matchesCurrentPlan &&
      reportFreshness.freshForPaidValidation &&
      report.releaseGateSummary?.canUseAsPrePaidAtlasBillingEvidence === true,
    canRunAtlasSpendWithinApprovedBudget:
      reportPlan.matchesCurrentPlan &&
      reportFreshness.freshForPaidValidation &&
      report.releaseGateSummary?.canRunAtlasSpendWithinApprovedBudget === true,
    networkCallsMade: report.networkCallsMade === true,
    failCount: messages.length,
    message: messages[0] ?? "Atlas billing readiness report is passing."
  };
}

function summarizeSourceVideoAtlasBilling(path, maxAgeHours) {
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      canUseAsPrePaidAtlasBillingEvidence: false,
      canRunAtlasSpendWithinApprovedBudget: false,
      message: "Run validation:atlas-billing with an explicit positive source-video planned cost before source-video paid validation."
    };
  }
  const reportMaxBudgetUsd = numberOrUndefined(report.checkedInputs?.maxBudgetUsd ?? report.costPlan?.maxBudgetUsd);
  const reportPlannedCostUsd = numberOrUndefined(report.checkedInputs?.plannedCostUsd ?? report.costPlan?.plannedCostUsd);
  const reportFreshness = atlasBillingReportFreshness(report, maxAgeHours, reportMaxBudgetUsd ?? reportPlannedCostUsd ?? 0);
  const budgetCapValid = typeof reportPlannedCostUsd === "number" && reportPlannedCostUsd > 0;
  const budgetCoversPlannedCost =
    typeof reportMaxBudgetUsd === "number" &&
    typeof reportPlannedCostUsd === "number" &&
    reportMaxBudgetUsd >= reportPlannedCostUsd;
  const baseReportUsable =
    report.schemaVersion === "cinejelly.atlas-billing-readiness.v1" &&
    report.status === "pass" &&
    report.releaseGateSummary?.canUseAsPrePaidAtlasBillingEvidence === true &&
    report.releaseGateSummary?.canRunAtlasSpendWithinApprovedBudget === true &&
    report.networkCallsMade === true &&
    report.providerCallsMade === false;
  const failures = [
    ...(reportFreshness.freshForPaidValidation ? [] : [reportFreshness.message]),
    ...(budgetCapValid ? [] : ["Source-video Atlas billing report must have a positive plannedCostUsd matching the approved source-video LLM budget."]),
    ...(budgetCoversPlannedCost ? [] : ["Source-video Atlas billing approved budget must cover plannedCostUsd."])
  ];
  const ready =
    baseReportUsable &&
    reportFreshness.freshForPaidValidation &&
    budgetCapValid &&
    budgetCoversPlannedCost;
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    reportMaxBudgetUsd,
    reportPlannedCostUsd,
    reportGeneratedAt: reportFreshness.reportGeneratedAt,
    maxAgeHours: reportFreshness.maxAgeHours,
    reportAgeHours: reportFreshness.reportAgeHours,
    freshForPaidValidation: reportFreshness.freshForPaidValidation,
    budgetCapValid,
    budgetCoversPlannedCost,
    canUseAsPrePaidAtlasBillingEvidence: ready,
    canRunAtlasSpendWithinApprovedBudget: ready,
    networkCallsMade: report.networkCallsMade === true,
    failCount: failures.length,
    message: failures[0] ?? "Source-video Atlas billing readiness report is passing."
  };
}

function atlasBillingReportPlan(report, expectedCostPlan) {
  const reportMaxBudgetUsd = numberOrUndefined(report.checkedInputs?.maxBudgetUsd ?? report.costPlan?.maxBudgetUsd);
  const reportPlannedCostUsd = numberOrUndefined(report.checkedInputs?.plannedCostUsd ?? report.costPlan?.plannedCostUsd);
  const maxBudgetMatches = moneyEquals(reportMaxBudgetUsd, expectedCostPlan.maxBudgetUsd);
  const plannedCostMatches = moneyEquals(reportPlannedCostUsd, expectedCostPlan.plannedCostUsd);
  const matchesCurrentPlan = maxBudgetMatches && plannedCostMatches;
  const message = matchesCurrentPlan
    ? "Atlas billing readiness report matches the current budget plan."
    : `Atlas billing readiness report is stale for the current budget plan: report budget ${formatUsd(reportMaxBudgetUsd)}, report planned cost ${formatUsd(reportPlannedCostUsd)}, current budget ${formatUsd(expectedCostPlan.maxBudgetUsd)}, current planned cost ${formatUsd(expectedCostPlan.plannedCostUsd)}. Rerun npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(expectedCostPlan.maxBudgetUsd)} --confirm-live-network.`;
  return {
    reportMaxBudgetUsd,
    reportPlannedCostUsd,
    matchesCurrentPlan,
    message
  };
}

function atlasBillingReportFreshness(report, maxAgeHours, maxBudgetUsd) {
  const rerunCommand = `npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(maxBudgetUsd)} --confirm-live-network`;
  const reportGeneratedAt = typeof report.generatedAt === "string" ? report.generatedAt : undefined;
  const generatedAtMs = reportGeneratedAt ? Date.parse(reportGeneratedAt) : Number.NaN;
  const validGeneratedAt = Number.isFinite(generatedAtMs);
  const rawAgeHours = validGeneratedAt ? (Date.now() - generatedAtMs) / 3600000 : undefined;
  const reportAgeHours = typeof rawAgeHours === "number" && Number.isFinite(rawAgeHours) ? Math.max(0, rawAgeHours) : undefined;
  const clockSkewOk = typeof rawAgeHours === "number" && rawAgeHours >= -0.083333;
  const freshForPaidValidation = validGeneratedAt && clockSkewOk && reportAgeHours <= maxAgeHours;
  let message = "Atlas billing readiness report is fresh enough for paid-validation planning.";
  if (!validGeneratedAt) {
    message = `Atlas billing readiness report is missing a valid generatedAt timestamp. Rerun ${rerunCommand}.`;
  } else if (!clockSkewOk) {
    message = `Atlas billing readiness report timestamp is in the future (${reportGeneratedAt}). Rerun ${rerunCommand}.`;
  } else if (!freshForPaidValidation) {
    message = `Atlas billing readiness report is too old for paid Atlas validation: generatedAt ${reportGeneratedAt}, age ${formatHours(reportAgeHours)}, max age ${formatHours(maxAgeHours)}. Rerun ${rerunCommand}.`;
  }
  return {
    reportGeneratedAt,
    maxAgeHours,
    reportAgeHours,
    freshForPaidValidation,
    message
  };
}

function buildCostPlan(options) {
  const renderCostUsdPerSecond = numberFromEnv("CINEJELLY_RENDER_COST_USD_PER_SECOND");
  const costBufferMultiplier = numberFromEnv("CINEJELLY_COST_BUFFER_MULTIPLIER") ?? 1;
  const longFormEstimate =
    renderCostUsdPerSecond === undefined
      ? undefined
      : Number((options.longFormDurationSeconds * renderCostUsdPerSecond * costBufferMultiplier).toFixed(6));
  const generatedAudioRate = numberFromEnv("ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS") ?? 0.015;
  const generatedAudioEstimate = Number(((options.generatedAudioText.length / 1000) * generatedAudioRate).toFixed(6));
  const knownPaidEstimateUsd = Number(
    [longFormEstimate, generatedAudioEstimate]
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0)
      .toFixed(6)
  );
  return {
    maxBudgetUsd: options.maxBudgetUsd,
    knownPaidEstimateUsd,
    budgetFit:
      longFormEstimate === undefined ? "unknown" : knownPaidEstimateUsd <= options.maxBudgetUsd ? "within_budget" : "exceeds_budget",
    longForm: {
      durationSeconds: options.longFormDurationSeconds,
      renderCostUsdPerSecond,
      costBufferMultiplier,
      estimateAvailable: longFormEstimate !== undefined,
      ...(longFormEstimate !== undefined ? { estimatedCostUsd: longFormEstimate } : {}),
      withinBudget: longFormEstimate !== undefined && longFormEstimate <= options.maxBudgetUsd,
      minimumBudgetUsdToRun: longFormEstimate
    },
    generatedAudio: {
      textCharacterCount: options.generatedAudioText.length,
      costUsdPer1kChars: generatedAudioRate,
      estimatedCostUsd: generatedAudioEstimate,
      withinBudget: generatedAudioEstimate <= options.maxBudgetUsd
    },
    unknownCostItems: [
      "source_video_auto_analysis_atlas_llm_usage",
      "remote_stock_provider_api_usage",
      "manual_media_review_time",
      "deployment_hosting"
    ]
  };
}

function buildGates({ environment, costPlan }) {
  const deploymentReady = environment.deployment.valid && environment.deployment.authTokenConfigured;
  const opsReady =
    environment.operations.opsConfig.status === "pass" &&
    environment.operations.billingAttestationPresent &&
    environment.operations.productionAttestationPresent;
  const atlasBillingReadyForApprovedSpend =
    environment.atlasBilling.canUseAsPrePaidAtlasBillingEvidence &&
    environment.atlasBilling.canRunAtlasSpendWithinApprovedBudget;
  const generatedAudioBillingReady =
    environment.atlasBillingSlices.generatedAudio.canUseAsPrePaidAtlasBillingEvidence &&
    environment.atlasBillingSlices.generatedAudio.canRunAtlasSpendWithinApprovedBudget;
  const longFormBillingReady =
    environment.atlasBillingSlices.longForm.canUseAsPrePaidAtlasBillingEvidence &&
    environment.atlasBillingSlices.longForm.canRunAtlasSpendWithinApprovedBudget;
  const sourceVideoBillingReady =
    environment.atlasBillingSlices.sourceVideo.canUseAsPrePaidAtlasBillingEvidence &&
    environment.atlasBillingSlices.sourceVideo.canRunAtlasSpendWithinApprovedBudget;
  const atlasVideoReady =
    environment.atlas.mediaApiKeyConfigured &&
    environment.atlas.seedanceStandardModelConfigured &&
    environment.atlas.seedanceFastModelConfigured;
  const sourceVideoInputReady =
    environment.sourceVideo.cleanHttpsUrlValid &&
    environment.sourceVideo.autoAnalysisEnabled &&
    environment.sourceVideo.atlasLlmReady;
  const sourceVideoReady = sourceVideoInputReady && sourceVideoBillingReady;
  const remoteStockReady = environment.remoteStock.enabled && environment.remoteStock.configuredProviderCount > 0;
  const generatedAudioInputReady =
    environment.generatedAudio.atlasMediaReady &&
    environment.generatedAudio.modelConfigured &&
    environment.generatedAudio.voiceIdConfigured &&
    environment.generatedAudio.costRateConfigured &&
    environment.generatedAudio.capabilitiesJsonValid &&
    environment.generatedAudio.capabilityCount > 0 &&
    costPlan.generatedAudio.withinBudget;
  const generatedAudioReady = generatedAudioInputReady && generatedAudioBillingReady;
  const longFormReady = atlasVideoReady && costPlan.longForm.withinBudget && longFormBillingReady;

  return [
    gate("deployment_readiness_inputs", "no_spend_network", deploymentReady, [
      boolCheck("deployment_clean_https_url", environment.deployment.valid, "Real clean HTTPS deployment URL is configured.", "CINEJELLY_DEPLOYMENT_BASE_URL must be a clean non-localhost HTTPS URL without credentials, query strings, or fragments."),
      boolCheck("deployment_auth_token", environment.deployment.authTokenConfigured, "Deployment auth token is configured.", "Set CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN or CINEJELLY_API_AUTH_TOKEN for protected validation endpoints.")
    ]),
    gate("operations_attestation_inputs", "no_spend", opsReady, [
      boolCheck("ops_config_report_pass", environment.operations.opsConfig.status === "pass", "Ops config validation report is passing.", "Run validation:ops-config after filling and promoting the operator attestation files."),
      boolCheck("billing_attestation_file", environment.operations.billingAttestationPresent, "Billing/admin attestation file exists.", "Promote a completed billing/admin attestation into ops/billing-admin-attestation.json."),
      boolCheck("production_attestation_file", environment.operations.productionAttestationPresent, "Production operations attestation file exists.", "Promote a completed production-operations attestation into ops/production-operations-attestation.json."),
      boolCheck("api_client_policy", environment.operations.apiClientPoliciesConfigured && environment.operations.apiClientPoliciesValidJsonArray && environment.operations.apiClientPolicyCount > 0, "Client policy JSON is configured.", "Configure CINEJELLY_API_CLIENTS_JSON with at least one digest-only client policy."),
      boolCheck("client_policy_required", environment.operations.requireClientPolicyForRender, "Render requests require client policy.", "Set CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true for commercial traffic."),
      boolCheck("client_usage_ledger", environment.operations.usageLedgerConfigured, "Client usage ledger path is configured.", "Set CINEJELLY_CLIENT_USAGE_LEDGER_PATH for persistent quota evidence.")
    ]),
    gate("atlas_billing_readiness_inputs", "no_spend_network", atlasBillingReadyForApprovedSpend, [
      boolCheck("atlas_billing_report_present", environment.atlasBilling.present, "Atlas billing readiness report exists.", "Run validation:atlas-billing before paid Atlas validation."),
      boolCheck("atlas_billing_live_evidence", environment.atlasBilling.canUseAsPrePaidAtlasBillingEvidence, "Atlas billing readiness can be used as pre-paid evidence.", environment.atlasBilling.message),
      boolCheck("atlas_billing_budget_approved", environment.atlasBilling.canRunAtlasSpendWithinApprovedBudget, "Atlas paid validation is within the approved budget.", environment.atlasBilling.message)
    ]),
    gate("source_video_auto_analysis_inputs", "paid_atlas_llm_and_source_fetch", sourceVideoReady, [
      boolCheck("source_video_clean_https_url", environment.sourceVideo.cleanHttpsUrlValid, "Clean HTTPS source-video URL is configured.", "Set CINEJELLY_VALIDATION_SOURCE_VIDEO_URL or pass --source-video-url with a credential-free HTTPS URL."),
      boolCheck("source_video_auto_analysis_enabled", environment.sourceVideo.autoAnalysisEnabled, "Source-video auto-analysis is enabled.", "Set CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true before live validation."),
      boolCheck("atlas_llm_ready", environment.sourceVideo.atlasLlmReady, "Atlas LLM key/model is configured.", "Set ATLASCLOUD_LLM_API_KEY or ATLASCLOUD_API_KEY plus ATLASCLOUD_LLM_MODEL."),
      boolCheck("atlas_billing_ready_for_source_video", sourceVideoBillingReady, "Atlas billing readiness is approved for source-video paid validation.", environment.atlasBillingSlices.sourceVideo.message)
    ]),
    gate("remote_stock_provider_inputs", "live_network", remoteStockReady, [
      boolCheck("remote_stock_enabled", environment.remoteStock.enabled, "Remote stock adapters are enabled.", "Set CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true when remote stock validation is in scope."),
      boolCheck("remote_stock_provider_key", environment.remoteStock.configuredProviderCount > 0, "At least one approved remote stock provider is configured.", "Set PEXELS_API_KEY, PIXABAY_API_KEY, or COVERR_API_KEY with CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true.")
    ]),
    gate("generated_audio_inputs", "paid_atlas_audio", generatedAudioReady, [
      boolCheck("atlas_media_key", environment.generatedAudio.atlasMediaReady, "Atlas media API key is configured.", "Set ATLASCLOUD_API_KEY."),
      boolCheck("generated_audio_model", environment.generatedAudio.modelConfigured, "Generated-audio model is configured.", "Set ATLASCLOUD_GENERATED_AUDIO_MODEL."),
      boolCheck("generated_audio_voice", environment.generatedAudio.voiceIdConfigured, "Generated-audio voice is configured.", "Set ATLASCLOUD_GENERATED_AUDIO_VOICE_ID."),
      boolCheck("generated_audio_capabilities", environment.generatedAudio.capabilitiesJsonValid && environment.generatedAudio.capabilityCount > 0, "Generated-audio capability JSON is valid.", environment.generatedAudio.capabilitiesMessage || "Set ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON to at least one reviewed capability record."),
      boolCheck("generated_audio_cost_budget", costPlan.generatedAudio.withinBudget, "Generated-audio sample estimate is within budget.", "Raise --max-budget-usd or reduce the generated-audio validation sample."),
      boolCheck("atlas_billing_ready_for_generated_audio", generatedAudioBillingReady, "Atlas billing readiness is approved for generated-audio paid validation.", environment.atlasBillingSlices.generatedAudio.message)
    ], costPlan.generatedAudio.estimatedCostUsd),
    gate("long_form_paid_validation_inputs", "paid_atlas_video", longFormReady, [
      boolCheck("atlas_video_keys_models", atlasVideoReady, "Atlas media key and Seedance model IDs are configured.", "Set ATLASCLOUD_API_KEY, ATLASCLOUD_SEEDANCE_STANDARD_MODEL, and ATLASCLOUD_SEEDANCE_FAST_MODEL."),
      boolCheck("long_form_cost_estimate", costPlan.longForm.estimateAvailable, "Long-form cost estimate is available.", "Set CINEJELLY_RENDER_COST_USD_PER_SECOND."),
      boolCheck("long_form_budget", costPlan.longForm.withinBudget, "Long-form validation estimate is within budget.", budgetMessage(costPlan)),
      boolCheck("atlas_billing_ready_for_long_form", longFormBillingReady, "Atlas billing readiness is approved for long-form paid validation.", environment.atlasBillingSlices.longForm.message)
    ], costPlan.longForm.estimatedCostUsd)
  ];
}

function gate(name, kind, ready, checks, estimatedCostUsd) {
  return {
    name,
    kind,
    status: ready ? "ready" : "blocked",
    checks,
    ...(typeof estimatedCostUsd === "number" ? { estimatedCostUsd } : {})
  };
}

function boolCheck(name, passed, passMessage, failMessage) {
  return {
    name,
    status: passed ? "pass" : "fail",
    message: passed ? passMessage : failMessage
  };
}

function budgetMessage(costPlan) {
  if (costPlan.longForm.minimumBudgetUsdToRun === undefined) {
    return "Configure CINEJELLY_RENDER_COST_USD_PER_SECOND so long-form spend can be estimated.";
  }
  return `Approve at least ${formatUsd(costPlan.longForm.minimumBudgetUsdToRun)} for the current ${costPlan.longForm.durationSeconds}s long-form validation, or change the cost assumptions only if they match Atlas billing.`;
}

function statusForGates(gates) {
  if (gates.some((item) => item.status === "blocked")) {
    return "blocked_by_missing_inputs";
  }
  return "ready_for_live_validation_sequence";
}

function buildReleaseGateSummary({ environment, costPlan, gates }) {
  const gateReady = (name) => gates.find((gate) => gate.name === name)?.status === "ready";
  const noSpendBlockers = gates.filter((gate) => gate.kind.startsWith("no_spend") && gate.status !== "ready");
  const paidBlockers = gates.filter((gate) => gate.kind.startsWith("paid_") && gate.status !== "ready");
  const readyPaidGates = gates.filter((gate) => gate.kind.startsWith("paid_") && gate.status === "ready").map((gate) => gate.name);
  return {
    canRunDeploymentReadinessCapture: gateReady("deployment_readiness_inputs"),
    canRunBillingAdminOpsCapture: gateReady("deployment_readiness_inputs") && gateReady("operations_attestation_inputs"),
    canRunProductionOpsCapture: gateReady("deployment_readiness_inputs") && gateReady("operations_attestation_inputs"),
    canRunSourceVideoPaidValidation: gateReady("source_video_auto_analysis_inputs"),
    canRunRemoteStockProviderValidation: gateReady("remote_stock_provider_inputs"),
    canRunGeneratedAudioPaidValidation: gateReady("generated_audio_inputs"),
    canRunLongFormWithinBudget: gateReady("long_form_paid_validation_inputs"),
    readyPaidGates,
    readyPaidGateCount: readyPaidGates.length,
    shouldDeferFullSequenceSpend: noSpendBlockers.length > 0 || paidBlockers.length > 0 || costPlan.budgetFit !== "within_budget",
    shouldDeferAtlasSpend: readyPaidGates.length === 0,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: releaseBlockerFor(environment, costPlan, gates)
  };
}

function releaseBlockerFor(environment, costPlan, gates) {
  const blocked = gates.filter((gate) => gate.status === "blocked").map((gate) => gate.name);
  if (blocked.length > 0) {
    return `Live-readiness inputs are incomplete: ${blocked.join(", ")}.`;
  }
  if (costPlan.budgetFit !== "within_budget") {
    return "Known paid validation estimates exceed the approved budget.";
  }
  if (environment.operations.opsConfig.status !== "pass") {
    return "Ops configuration must pass before customer traffic.";
  }
  return "Inputs are ready for live validation sequence, but evidence runs and manual reviews are still required.";
}

function nextActionsFor({ environment, costPlan, gates }) {
  const actions = [];
  if (!environment.launchIntake.present || environment.launchIntake.status !== "pass") {
    actions.push("Run npm.cmd run validation:launch-intake -- --write-draft, fill ops/commercial-launch-intake.json with real non-secret launch inputs, then rerun validation:launch-intake.");
  }
  for (const gate of gates) {
    const failures = gate.checks.filter((check) => check.status === "fail");
    if (failures.length > 0) {
      const messages = [...new Set(failures.map((check) => check.message))];
      actions.push(`${gate.name}: ${messages.join(" ")}`);
    }
  }
  if (!environment.operations.billingAttestationPresent || !environment.operations.productionAttestationPresent || environment.operations.opsConfig.status !== "pass") {
    actions.push("Fill the generated operator attestation drafts, run ops:promote-attestations -- --dry-run, promote them when validation passes, then rerun validation:ops-config.");
  }
  if (!environment.deployment.valid || !environment.deployment.authTokenConfigured) {
    actions.push("Provide the real HTTPS deployment URL and deployment auth token, then run validation:deployment-readiness.");
  }
  if (!costPlan.longForm.withinBudget) {
    actions.push(budgetMessage(costPlan));
  }
  actions.push("Run paid Atlas validations only after this live-input report and the relevant no-spend/network gates are ready for the specific paid gate.");
  return [...new Set(actions)];
}

function summarizeLaunchIntake(path) {
  const reportPath = toRepoRelative(path);
  const value = readJsonIfExists(path);
  if (!value) {
    return { present: false, path: reportPath, status: "missing", usable: false, applied: false };
  }
  const serialized = JSON.stringify(value);
  const secretLike = secretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  });
  const usable = value.schemaVersion === "cinejelly.commercial-launch-intake.v1" && !secretLike;
  return {
    present: true,
    path: reportPath,
    status: usable ? "pass" : "fail",
    usable,
    applied: false,
    ...(usable ? { value } : {})
  };
}

function remoteStockProviderEvidence(launchIntake) {
  const fixed = [
    providerEvidence("pexels", "PEXELS_API_KEY", true),
    providerEvidence("pixabay", "PIXABAY_API_KEY", true),
    providerEvidence("coverr", "COVERR_API_KEY", envTrue("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"))
  ];
  if (launchIntake?.remoteStock?.enabled !== true) {
    return fixed;
  }
  const selectedProviders = new Set(Array.isArray(launchIntake.remoteStock.providers) ? launchIntake.remoteStock.providers.map(String) : []);
  const keyEnvVars = Array.isArray(launchIntake.remoteStock.keyEnvVars)
    ? launchIntake.remoteStock.keyEnvVars.map(envNameOrUndefined).filter(Boolean)
    : [];
  const termsReviewed = launchIntake.remoteStock.commercialTermsReviewed === true;
  return fixed.map((provider) => {
    if (!selectedProviders.has(provider.name)) {
      return provider;
    }
    const keyConfigured = provider.keyConfigured || keyEnvVars.some((name) => envConfigured(name));
    const commercialTermsApproved = provider.commercialTermsApproved || termsReviewed;
    return {
      ...provider,
      keyConfigured,
      commercialTermsApproved,
      ready: keyConfigured && commercialTermsApproved
    };
  });
}

function providerEvidence(name, envName, termsApproved) {
  const keyConfigured = envConfigured(envName);
  return {
    name,
    keyConfigured,
    commercialTermsApproved: termsApproved,
    ready: keyConfigured && termsApproved
  };
}

function envNameOrUndefined(value) {
  return typeof value === "string" && envNamePattern.test(value) ? value : undefined;
}

function jsonArrayEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return { configured: false, valid: false, count: 0 };
  }
  try {
    const parsed = JSON.parse(raw);
    return { configured: true, valid: Array.isArray(parsed), count: Array.isArray(parsed) ? parsed.length : 0 };
  } catch {
    return { configured: true, valid: false, count: 0 };
  }
}

function generatedAudioCapabilitiesEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return {
      configured: false,
      valid: false,
      count: 0,
      message: "Set ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON to at least one reviewed capability record."
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        configured: true,
        valid: false,
        count: 0,
        message: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON must be a JSON array."
      };
    }
    const invalid = parsed.find((item) => !isGeneratedAudioCapability(item));
    if (invalid) {
      return {
        configured: true,
        valid: false,
        count: parsed.length,
        message: "Each generated-audio capability must include provider, modelId, kinds, outputFormats, maxDurationSeconds, and async."
      };
    }
    return {
      configured: true,
      valid: true,
      count: parsed.length,
      message: `${parsed.length} generated-audio capability record(s) configured.`
    };
  } catch {
    return {
      configured: true,
      valid: false,
      count: 0,
      message: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON must be valid JSON."
    };
  }
}

function isGeneratedAudioCapability(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return typeof payload.provider === "string" &&
    typeof payload.modelId === "string" &&
    Array.isArray(payload.kinds) &&
    payload.kinds.every(isGeneratedAudioKind) &&
    Array.isArray(payload.outputFormats) &&
    payload.outputFormats.every(isAudioOutputFormat) &&
    typeof payload.maxDurationSeconds === "number" &&
    Number.isFinite(payload.maxDurationSeconds) &&
    payload.maxDurationSeconds > 0 &&
    typeof payload.async === "boolean";
}

function isGeneratedAudioKind(value) {
  return value === "tts_narration" || value === "bgm" || value === "ambience" || value === "sfx";
}

function isAudioOutputFormat(value) {
  return value === "mp3" || value === "wav";
}

function urlEvidence(value, label) {
  if (!value) {
    return { configured: false, valid: false, label };
  }
  try {
    const url = new URL(value);
    const valid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !isLocalhost(url.hostname);
    return {
      configured: true,
      valid,
      label,
      safeUrlPreview: valid ? cleanUrlPreview(url) : "[invalid-url]",
      message: valid ? "Clean HTTPS URL is configured." : "URL must be HTTPS, non-localhost, and must not include credentials, query strings, or fragments."
    };
  } catch {
    return { configured: true, valid: false, label, safeUrlPreview: "[invalid-url]", message: "URL is not valid." };
  }
}

function isLocalhost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function cleanUrlPreview(url) {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  copy.search = "";
  copy.hash = "";
  return copy.toString().replace(/\/$/, "");
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
}

function fileExists(path) {
  return existsSync(resolve(repoRoot, path));
}

function envConfigured(name) {
  return Boolean(process.env[name]?.trim());
}

function envTrue(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function numberFromEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moneyEquals(left, right) {
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 0.000001;
}

function writeMaybe(options, report) {
  if (!options.writeReport) {
    return;
  }
  const absolutePath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function formatUsd(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "0.000000";
}

function formatHours(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}h` : "unavailable";
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
        schemaVersion: "cinejelly.live-readiness-inputs.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked_by_missing_inputs",
        error: redactText(error instanceof Error ? error.message : String(error))
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
