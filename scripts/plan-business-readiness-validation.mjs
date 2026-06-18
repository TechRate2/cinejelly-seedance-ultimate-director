import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  atlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
  generatedAudioAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json",
  longFormAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json",
  sourceVideoAtlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json",
  launchIntakePath: "ops/commercial-launch-intake.json",
  maxBudgetUsd: Number(process.env.CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD || "5"),
  atlasBillingEvidenceMaxAgeHours: Number(process.env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS || "24"),
  longFormDurationSeconds: 120,
  sourceVideoUrl: process.env.CINEJELLY_VALIDATION_SOURCE_VIDEO_URL,
  deploymentBaseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  remoteStockQuery: "modern workspace desk lamp",
  generatedAudioText: "Xin chao, day la ban kiem tra am thanh ngan cua CineJelly."
};
const generatedAudioBillingReportPath = "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json";

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
    ["--business-readiness-report", "businessReadinessPath"],
    ["--ops-config-report", "opsConfigPath"],
    ["--atlas-billing-report", "atlasBillingPath"],
    ["--generated-audio-atlas-billing-report", "generatedAudioAtlasBillingPath"],
    ["--long-form-atlas-billing-report", "longFormAtlasBillingPath"],
    ["--source-video-atlas-billing-report", "sourceVideoAtlasBillingPath"],
    ["--launch-intake", "launchIntakePath"],
    ["--max-budget-usd", "maxBudgetUsd"],
    ["--atlas-billing-evidence-max-age-hours", "atlasBillingEvidenceMaxAgeHours"],
    ["--long-form-duration-seconds", "longFormDurationSeconds"],
    ["--deployment-base-url", "deploymentBaseUrl"],
    ["--source-video-url", "sourceVideoUrl"],
    ["--remote-stock-query", "remoteStockQuery"],
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
  console.log(`Plan CineJelly's remaining business-readiness validation without network or provider spend.

Usage:
  npm.cmd run validation:business-plan
  npm.cmd run validation:business-plan -- --deployment-base-url https://cinejelly.example.com --source-video-url https://cdn.example.com/source.mp4

Options:
  --business-readiness-report <path>       Default: ${defaults.businessReadinessPath}
  --ops-config-report <path>               Default: ${defaults.opsConfigPath}
  --atlas-billing-report <path>            Default: ${defaults.atlasBillingPath}
  --generated-audio-atlas-billing-report <path>
                                           Default: ${defaults.generatedAudioAtlasBillingPath}
  --long-form-atlas-billing-report <path>  Default: ${defaults.longFormAtlasBillingPath}
  --source-video-atlas-billing-report <path>
                                           Default: ${defaults.sourceVideoAtlasBillingPath}
  --launch-intake <path>                   Ignored operator intake JSON. Default: ${defaults.launchIntakePath}
  --max-budget-usd <amount>                Budget ceiling for known paid validation. Default: ${defaults.maxBudgetUsd}
  --atlas-billing-evidence-max-age-hours <hours>
                                            Maximum age for Atlas billing readiness evidence. Default: ${defaults.atlasBillingEvidenceMaxAgeHours}
  --long-form-duration-seconds <seconds>   Target long-form validation duration. Default: ${defaults.longFormDurationSeconds}
  --deployment-base-url <url>              Real CineJelly HTTPS deployment URL. Can also use CINEJELLY_DEPLOYMENT_BASE_URL.
  --source-video-url <url>                 Clean HTTPS source-video URL. Can also use CINEJELLY_VALIDATION_SOURCE_VIDEO_URL.
  --remote-stock-query <text>              Query shown in the planned remote-stock command. Default: "${defaults.remoteStockQuery}"
  --generated-audio-text <text>            Text used for generated-audio cost planning.
  --output <path>                          JSON report path. Default: ${defaults.outputPath}
  --no-output                              Print only; do not write the report.

This command reads reports and environment shape only. It does not call Atlas, stock providers, deployment endpoints, FFmpeg, or render routes.`);
}

function main() {
  const options = applyLaunchIntakeDefaults(parseArgs(process.argv.slice(2)));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const costPlan = buildCostPlan(options);
  const businessReadiness = summarizeBusinessReadiness(options.businessReadinessPath);
  const opsConfig = summarizeOpsConfig(options.opsConfigPath);
  const atlasBilling = summarizeAtlasBilling(options.atlasBillingPath, {
    maxBudgetUsd: options.maxBudgetUsd,
    plannedCostUsd: costPlan.knownPaidEstimateUsd
  }, options.atlasBillingEvidenceMaxAgeHours);
  const generatedAudioAtlasBilling = summarizeAtlasBilling(options.generatedAudioAtlasBillingPath, {
    maxBudgetUsd: options.maxBudgetUsd,
    plannedCostUsd: costPlan.generatedAudio.estimatedCostUsd
  }, options.atlasBillingEvidenceMaxAgeHours);
  const longFormAtlasBilling = summarizeAtlasBilling(options.longFormAtlasBillingPath, {
    maxBudgetUsd: options.maxBudgetUsd,
    plannedCostUsd: costPlan.longForm.estimatedCostUsd
  }, options.atlasBillingEvidenceMaxAgeHours);
  const sourceVideoAtlasBilling = summarizeSourceVideoAtlasBilling(
    options.sourceVideoAtlasBillingPath,
    options.atlasBillingEvidenceMaxAgeHours
  );
  const environment = summarizeEnvironment(options);
  const validationSequence = buildValidationSequence({
    options,
    businessReadiness,
    opsConfig,
    atlasBilling,
    generatedAudioAtlasBilling,
    longFormAtlasBilling,
    sourceVideoAtlasBilling,
    environment,
    costPlan
  });
  const status = statusFor(validationSequence);
  const report = {
    schemaVersion: "cinejelly.business-readiness-validation-plan.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    checkedInputs: {
      businessReadinessPath: toRepoRelative(options.businessReadinessPath),
      opsConfigPath: toRepoRelative(options.opsConfigPath),
      atlasBillingPath: toRepoRelative(options.atlasBillingPath),
      generatedAudioAtlasBillingPath: toRepoRelative(options.generatedAudioAtlasBillingPath),
      longFormAtlasBillingPath: toRepoRelative(options.longFormAtlasBillingPath),
      sourceVideoAtlasBillingPath: toRepoRelative(options.sourceVideoAtlasBillingPath),
      launchIntakePath: toRepoRelative(options.launchIntakePath),
      launchIntakePresent: options.launchIntake.present,
      launchIntakeStatus: options.launchIntake.status,
      launchIntakeApplied: options.launchIntake.applied === true,
      maxBudgetUsd: options.maxBudgetUsd,
      longFormDurationSeconds: options.longFormDurationSeconds,
      deploymentBaseUrlConfigured: Boolean(options.deploymentBaseUrl),
      sourceVideoUrlConfigured: Boolean(options.sourceVideoUrl),
      remoteStockQuery: redactText(options.remoteStockQuery)
    },
    currentBusinessReadiness: businessReadiness,
    environment,
    costPlan,
    validationSequence,
    releaseGateSummary: buildReleaseGateSummary({ validationSequence, costPlan }),
    nextActions: nextActionsFor({ validationSequence, costPlan, environment, opsConfig })
  };
  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "ready_for_paid_sequence" ? 0 : 1;
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
  validateOptionalCleanHttpsUrl(options.deploymentBaseUrl, "--deployment-base-url", { allowQuery: false, forbidLocalhost: true });
  validateOptionalCleanHttpsUrl(options.sourceVideoUrl, "--source-video-url", { allowQuery: false, forbidLocalhost: true });
}

function summarizeBusinessReadiness(path) {
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      evidenceCompletionPercent: 0,
      failingChecks: ["business_readiness_report_missing"]
    };
  }
  const failingChecks = Array.isArray(report.checks)
    ? report.checks.filter((check) => check?.status === "fail").map((check) => String(check.name ?? "unknown"))
    : [];
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    evidenceCompletionPercent: Number(report.completion?.evidenceCompletionPercent ?? 0),
    canRunAdditionalPaidValidation: report.releaseGateSummary?.canRunAdditionalPaidValidation === true,
    canRunLongFormValidation: report.releaseGateSummary?.canRunLongFormValidation === true,
    canReleaseToCustomerTraffic: report.releaseGateSummary?.canReleaseToCustomerTraffic === true,
    failingChecks
  };
}

function summarizeOpsConfig(path) {
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      failCount: 0,
      nextActions: ["Run npm.cmd run validation:ops-config -- --write-drafts."]
    };
  }
  const failures = Array.isArray(report.checks)
    ? report.checks.filter((check) => check?.status === "fail").map((check) => String(check.message ?? check.name ?? "unknown"))
    : [];
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    failCount: failures.length,
    canRunBillingAdminCapture: report.releaseGateSummary?.canRunBillingAdminCapture === true,
    canRunProductionOpsCapture: report.releaseGateSummary?.canRunProductionOpsCapture === true,
    nextActions: failures.slice(0, 8)
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
      nextActions: ["Configure the relevant paid validation cost estimate before this Atlas billing report can be evaluated."]
    };
  }
  const report = readJsonIfExists(path);
  if (!report) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing",
      canUseAsPrePaidAtlasBillingEvidence: false,
      nextActions: ["Run npm.cmd run validation:atlas-billing, then rerun with --confirm-live-network when a no-spend Atlas billing API call is approved."]
    };
  }
  const reportPlan = atlasBillingReportPlan(report, expectedCostPlan);
  const reportFreshness = atlasBillingReportFreshness(report, maxAgeHours, expectedCostPlan.maxBudgetUsd);
  const failures = Array.isArray(report.checks)
    ? report.checks.filter((check) => check?.status === "fail").map((check) => String(check.message ?? check.name ?? "unknown"))
    : [];
  const nextActions = [
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
    nextActions: nextActions.slice(0, 8)
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
      nextActions: [
        "Run npm.cmd run validation:atlas-billing with --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json and an explicit source-video --planned-cost-usd before source-video paid validation."
      ]
    };
  }
  const reportMaxBudgetUsd = numberOrUndefined(report.checkedInputs?.maxBudgetUsd ?? report.costPlan?.maxBudgetUsd);
  const reportPlannedCostUsd = numberOrUndefined(report.checkedInputs?.plannedCostUsd ?? report.costPlan?.plannedCostUsd);
  const reportFreshness = atlasBillingReportFreshness(report, maxAgeHours, reportMaxBudgetUsd ?? reportPlannedCostUsd);
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
  const nextActions = [
    ...(reportFreshness.freshForPaidValidation ? [] : [reportFreshness.message]),
    ...(budgetCapValid ? [] : ["Source-video Atlas billing report must have a positive plannedCostUsd matching the approved source-video LLM budget."]),
    ...(budgetCoversPlannedCost ? [] : ["Source-video Atlas billing approved budget must cover plannedCostUsd."])
  ];
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
    canUseAsPrePaidAtlasBillingEvidence:
      baseReportUsable &&
      reportFreshness.freshForPaidValidation &&
      budgetCapValid &&
      budgetCoversPlannedCost,
    nextActions: nextActions.slice(0, 8)
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

function summarizeEnvironment(options) {
  const launchIntake = options.launchIntake;
  const launchIntakeValue = launchIntake?.usable ? launchIntake.value : undefined;
  const deploymentUrl = urlEvidence(options.deploymentBaseUrl, "deployment");
  const sourceVideoUrl = urlEvidence(options.sourceVideoUrl, "source_video");
  const atlas = {
    mediaApiKeyConfigured: envConfigured("ATLASCLOUD_API_KEY"),
    llmApiKeyConfigured: envConfigured("ATLASCLOUD_LLM_API_KEY"),
    llmFallbackAvailable: envConfigured("ATLASCLOUD_LLM_API_KEY") || envConfigured("ATLASCLOUD_API_KEY"),
    llmModelConfigured: envConfigured("ATLASCLOUD_LLM_MODEL"),
    seedanceStandardModelConfigured: envConfigured("ATLASCLOUD_SEEDANCE_STANDARD_MODEL"),
    seedanceFastModelConfigured: envConfigured("ATLASCLOUD_SEEDANCE_FAST_MODEL"),
    seedanceCapabilitiesConfigured: jsonArrayEnv("ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON").valid,
    mediaBaseUrlConfigured: envConfigured("ATLASCLOUD_MEDIA_BASE_URL") || envConfigured("ATLASCLOUD_BASE_URL"),
    llmBaseUrlConfigured: envConfigured("ATLASCLOUD_LLM_BASE_URL")
  };
  const sourceVideo = {
    cleanHttpsUrlConfigured: sourceVideoUrl.configured,
    cleanHttpsUrlValid: sourceVideoUrl.valid,
    safeUrlPreview: sourceVideoUrl.safeUrlPreview,
    autoAnalysisEnabled:
      envTrue("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS") ||
      (launchIntakeValue?.sourceVideo?.enabled === true && launchIntakeValue?.sourceVideo?.approvedForAtlasLlmAnalysis === true),
    atlasLlmReady: atlas.llmFallbackAvailable && atlas.llmModelConfigured
  };
  const remoteStockProviders = remoteStockProviderEvidence(launchIntakeValue);
  const remoteStock = {
    enabled: envTrue("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS") || launchIntakeValue?.remoteStock?.enabled === true,
    configuredProviderCount: remoteStockProviders.filter((provider) => provider.ready).length,
    commercialTermsReviewedForCoverr:
      envTrue("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED") || launchIntakeValue?.remoteStock?.commercialTermsReviewed === true,
    providers: remoteStockProviders
  };
  const generatedAudioCapabilities = generatedAudioCapabilitiesEnv("ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON");
  const generatedAudio = {
    modelConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_MODEL"),
    voiceIdConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_VOICE_ID"),
    capabilitiesJsonConfigured: generatedAudioCapabilities.configured,
    capabilitiesJsonValid: generatedAudioCapabilities.valid,
    capabilityCount: generatedAudioCapabilities.count,
    capabilitiesMessage: generatedAudioCapabilities.message,
    costRateConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS"),
    atlasMediaReady: atlas.mediaApiKeyConfigured
  };
  const apiClients = jsonArrayEnv("CINEJELLY_API_CLIENTS_JSON");
  const operations = {
    apiClientPoliciesConfigured: apiClients.configured,
    apiClientPoliciesValidJsonArray: apiClients.valid,
    apiClientPolicyCount: apiClients.count,
    requireClientPolicyForRender: envTrue("CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER"),
    usageLedgerConfigured: envConfigured("CINEJELLY_CLIENT_USAGE_LEDGER_PATH"),
    billingAttestationPresent: existsSync(resolve(repoRoot, "ops/billing-admin-attestation.json")),
    productionAttestationPresent: existsSync(resolve(repoRoot, "ops/production-operations-attestation.json"))
  };
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
    atlas,
    deployment: deploymentUrl,
    sourceVideo,
    remoteStock,
    generatedAudio,
    operations
  };
}

function buildCostPlan(options) {
  const renderCostUsdPerSecond = numberFromEnv("CINEJELLY_RENDER_COST_USD_PER_SECOND");
  const costBufferMultiplier = numberFromEnv("CINEJELLY_COST_BUFFER_MULTIPLIER") ?? 1;
  const longFormEstimate =
    renderCostUsdPerSecond === undefined
      ? undefined
      : Number((options.longFormDurationSeconds * renderCostUsdPerSecond * costBufferMultiplier).toFixed(6));
  const missingCostEstimateItems = [
    ...(longFormEstimate === undefined ? ["long_form_paid_validation"] : [])
  ];
  const knownPaidEstimateComplete = missingCostEstimateItems.length === 0;
  const audioRate = numberFromEnv("ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS") ?? 0.015;
  const generatedAudioEstimate = Number(((options.generatedAudioText.length / 1000) * audioRate).toFixed(6));
  const knownPaidEstimateUsd = Number(
    [longFormEstimate, generatedAudioEstimate]
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0)
      .toFixed(6)
  );
  const budgetConstrainedSlices = buildBudgetConstrainedSlices({
    maxBudgetUsd: options.maxBudgetUsd,
    knownPaidEstimateUsd,
    longFormDurationSeconds: options.longFormDurationSeconds,
    longFormEstimate,
    generatedAudioEstimate,
    generatedAudioText: options.generatedAudioText,
    generatedAudioCostUsdPer1kChars: audioRate
  });
  return {
    maxBudgetUsd: options.maxBudgetUsd,
    knownPaidEstimateUsd,
    knownPaidEstimateComplete,
    missingCostEstimateItems,
    budgetFit: longFormEstimate === undefined
      ? "unknown"
      : knownPaidEstimateUsd <= options.maxBudgetUsd
        ? "within_budget"
        : "exceeds_budget",
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
      costUsdPer1kChars: audioRate,
      estimatedCostUsd: generatedAudioEstimate,
      withinBudget: generatedAudioEstimate <= options.maxBudgetUsd
    },
    budgetConstrainedSlices,
    unknownCostItems: [
      "source_video_auto_analysis_atlas_llm_usage",
      "remote_stock_provider_api_usage",
      "manual_review_time",
      "deployment_hosting"
    ]
  };
}

function buildBudgetConstrainedSlices({
  maxBudgetUsd,
  knownPaidEstimateUsd,
  longFormDurationSeconds,
  longFormEstimate,
  generatedAudioEstimate,
  generatedAudioText,
  generatedAudioCostUsdPer1kChars
}) {
  const fullKnownPaidEstimateUsd = typeof longFormEstimate === "number" && Number.isFinite(longFormEstimate)
    ? knownPaidEstimateUsd
    : undefined;
  const slices = [
    budgetSlice({
      name: "generated_audio_smoke",
      kind: "paid_atlas_audio",
      estimatedCostUsd: generatedAudioEstimate,
      maxBudgetUsd,
      billingReadinessCommand: atlasBillingSliceCommand({
        maxBudgetUsd,
        plannedCostUsd: generatedAudioEstimate,
        outputPath: generatedAudioBillingReportPath
      }),
      command: generatedAudioProviderCommand({
        maxBudgetUsd,
        text: generatedAudioText,
        costUsdPer1kChars: generatedAudioCostUsdPer1kChars,
        atlasBillingReportPath: generatedAudioBillingReportPath
      }),
      prerequisites: [
        "fresh Atlas billing readiness captured for this narrower budget slice",
        "ATLASCLOUD_GENERATED_AUDIO_MODEL",
        "ATLASCLOUD_GENERATED_AUDIO_VOICE_ID",
        "reviewed ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON",
        "after output review, fill ops/generated-audio-manual-review.json and run npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review"
      ],
      limitations: [
        "does not validate Seedance video generation",
        "does not validate source-video auto-analysis",
        "does not validate long-form assembly",
        "cannot approve customer traffic by itself"
      ]
    }),
    budgetSlice({
      name: "long_form_120s_minimum",
      kind: "paid_atlas_video",
      estimatedCostUsd: longFormEstimate,
      maxBudgetUsd,
      billingReadinessCommand: atlasBillingSliceCommand({
        maxBudgetUsd,
        plannedCostUsd: longFormEstimate,
        outputPath: "assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json"
      }),
      command: `npm.cmd run validation:long-form -- --duration-seconds ${longFormDurationSeconds} --max-cost-usd ${formatNumber(maxBudgetUsd)} --confirm-paid-spend --manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review`,
      prerequisites: [
        "fresh Atlas billing readiness captured for the long-form budget",
        "Atlas media API key and Seedance model configuration",
        "after the paid output report writes artifact fingerprints, run npm.cmd run validation:long-form-review-draft, inspect media/redaction, then fill ops/long-form-manual-quality-review.json with matching projectId, manifestSha256, and deliverableSha256"
      ],
      limitations: [
        "requires a 120-480s paid render budget",
        "does not replace deployment, operations, source-video, remote-stock, or generated-audio evidence"
      ]
    }),
    budgetSlice({
      name: "full_business_readiness_paid_sequence",
      kind: "paid_atlas_full_sequence",
      estimatedCostUsd: fullKnownPaidEstimateUsd,
      maxBudgetUsd,
      billingReadinessCommand: atlasBillingSliceCommand({
        maxBudgetUsd: fullKnownPaidEstimateUsd,
        plannedCostUsd: fullKnownPaidEstimateUsd,
        outputPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json"
      }),
      command: "Run the no-spend/live-network gates, then execute the ready paid Atlas validations in sequence.",
      prerequisites: [
        "operator approval for the full known paid estimate",
        "fresh Atlas billing readiness for the full sequence",
        "all no-spend and live-network prerequisites for the targeted gates"
      ],
      limitations: [
        "known paid estimate excludes unknown source-video LLM usage, remote stock provider usage, hosting, and manual review time"
      ]
    }),
    budgetSlice({
      name: "source_video_auto_analysis",
      kind: "paid_atlas_llm_and_source_fetch",
      estimatedCostUsd: undefined,
      maxBudgetUsd,
      billingReadinessCommand:
        "npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-source-video-budget-usd> --planned-cost-usd <approved-source-video-budget-usd> --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network",
      command:
        "npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://<clean-source-video.mp4> --confirm-provider-spend --max-cost-usd <approved-source-video-budget-usd> --atlas-billing-report assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json",
      prerequisites: [
        "clean credential-free HTTPS source video URL",
        "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true",
        "Atlas LLM key and model configuration",
        "fresh Atlas billing readiness after operator approves an explicit source-video LLM budget"
      ],
      limitations: [
        "cost is usage-dependent and must not be auto-approved from the fixed video/audio estimate",
        "cannot approve customer traffic by itself"
      ]
    })
  ];
  const affordableKnownCostSlices = slices.filter((slice) => slice.status === "within_budget" && slice.estimatedCostUsd !== undefined);
  return {
    maxBudgetUsd,
    knownPaidEstimateUsd,
    fullKnownPaidSequenceWithinBudget: fullKnownPaidEstimateUsd !== undefined && fullKnownPaidEstimateUsd <= maxBudgetUsd,
    recommendedSliceName: affordableKnownCostSlices[0]?.name,
    slices
  };
}

function atlasBillingSliceCommand({ maxBudgetUsd, plannedCostUsd, outputPath }) {
  if (typeof plannedCostUsd !== "number" || !Number.isFinite(plannedCostUsd)) {
    return undefined;
  }
  return `npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(maxBudgetUsd)} --planned-cost-usd ${formatNumber(plannedCostUsd)} --output ${outputPath} --confirm-live-network`;
}

function generatedAudioProviderCommand({ maxBudgetUsd, text, costUsdPer1kChars, atlasBillingReportPath }) {
  const maxCostUsd = Math.min(maxBudgetUsd, 0.05);
  return [
    "npm.cmd run validation:generated-audio --",
    "--confirm-provider-spend",
    "--confirm-audio-schema-reviewed",
    `--max-cost-usd ${formatNumber(maxCostUsd)}`,
    `--cost-usd-per-1k-chars ${formatNumber(costUsdPer1kChars)}`,
    `--atlas-billing-report ${atlasBillingReportPath}`,
    `--text "${escapeCommandText(text)}"`
  ].join(" ");
}

function budgetSlice({ name, kind, estimatedCostUsd, maxBudgetUsd, billingReadinessCommand, command, prerequisites, limitations }) {
  const hasEstimate = typeof estimatedCostUsd === "number" && Number.isFinite(estimatedCostUsd);
  const status = hasEstimate
    ? estimatedCostUsd <= maxBudgetUsd
      ? "within_budget"
      : "blocked_by_budget"
    : "unknown_cost";
  return {
    name,
    kind,
    status,
    maxBudgetUsd,
    ...(hasEstimate ? { estimatedCostUsd } : {}),
    ...(typeof billingReadinessCommand === "string" ? { billingReadinessCommand } : {}),
    command,
    prerequisites,
    limitations
  };
}

function buildValidationSequence({
  options,
  businessReadiness,
  opsConfig,
  atlasBilling,
  generatedAudioAtlasBilling,
  longFormAtlasBilling,
  sourceVideoAtlasBilling,
  environment,
  costPlan
}) {
  const deploymentReady = environment.deployment.configured && environment.deployment.valid;
  const opsReady = opsConfig.status === "pass";
  const atlasPaidReady = environment.atlas.mediaApiKeyConfigured && environment.atlas.seedanceStandardModelConfigured && environment.atlas.seedanceFastModelConfigured;
  const generatedAudioBillingReady =
    generatedAudioAtlasBilling.canUseAsPrePaidAtlasBillingEvidence &&
    generatedAudioAtlasBilling.canRunAtlasSpendWithinApprovedBudget;
  const generatedAudioBillingGateInput = "fresh generated-audio Atlas billing readiness matching the generated-audio planned cost";
  const generatedAudioBillingGateNote =
    "Run validation:atlas-billing with --output assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json and the exact generated-audio --planned-cost-usd before adding --confirm-provider-spend.";
  const longFormBillingReady =
    longFormAtlasBilling.canUseAsPrePaidAtlasBillingEvidence &&
    longFormAtlasBilling.canRunAtlasSpendWithinApprovedBudget;
  const longFormBillingGateInput = "fresh long-form Atlas billing readiness matching the approved long-form budget";
  const longFormBillingGateNote =
    "Run validation:atlas-billing with --output assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json and the exact long-form --planned-cost-usd before adding --confirm-paid-spend.";
  const sourceVideoBillingGateInput = "fresh source-video Atlas billing readiness matching the approved source-video LLM budget";
  const sourceVideoBillingGateNote =
    "Source-video LLM usage is usage-dependent; run validation:atlas-billing with --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json and the exact --planned-cost-usd before adding --confirm-provider-spend.";
  const sourceVideoInputReady =
    environment.sourceVideo.cleanHttpsUrlValid &&
    environment.sourceVideo.autoAnalysisEnabled &&
    environment.sourceVideo.atlasLlmReady;
  const sourceVideoReady = sourceVideoInputReady && sourceVideoAtlasBilling.canUseAsPrePaidAtlasBillingEvidence === true;
  const sourceVideoApprovedBudgetUsd = sourceVideoAtlasBilling.reportPlannedCostUsd;
  const remoteStockReady = environment.remoteStock.enabled && environment.remoteStock.configuredProviderCount > 0;
  const launchIntakeReady = environment.launchIntake.present && environment.launchIntake.status === "pass";
  const generatedAudioInputReady =
    environment.generatedAudio.atlasMediaReady &&
    environment.generatedAudio.modelConfigured &&
    environment.generatedAudio.voiceIdConfigured &&
    environment.generatedAudio.capabilitiesJsonValid &&
    environment.generatedAudio.capabilityCount > 0 &&
    costPlan.generatedAudio.withinBudget;
  const generatedAudioReady = generatedAudioInputReady && generatedAudioBillingReady;
  const generatedAudioInputRequirements = [
    ...(environment.generatedAudio.atlasMediaReady ? [] : ["Atlas media API key"]),
    ...(environment.generatedAudio.modelConfigured ? [] : ["ATLASCLOUD_GENERATED_AUDIO_MODEL"]),
    ...(environment.generatedAudio.voiceIdConfigured ? [] : ["ATLASCLOUD_GENERATED_AUDIO_VOICE_ID"]),
    ...(environment.generatedAudio.capabilitiesJsonValid && environment.generatedAudio.capabilityCount > 0
      ? []
      : [environment.generatedAudio.capabilitiesMessage || "Set ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON to at least one reviewed capability record."]),
    ...(costPlan.generatedAudio.withinBudget ? [] : ["approved generated-audio validation budget"]),
    "manual schema/audio review"
  ];
  const longFormInputReady = atlasPaidReady && costPlan.longForm.withinBudget;
  const longFormReady = longFormInputReady && longFormBillingReady;

  return [
    step({
      name: "current_business_readiness_audit",
      kind: "no_spend",
      status: businessReadiness.present ? "ready" : "needs_operator_input",
      command: "npm.cmd run validation:business-readiness",
      evidencePath: businessReadiness.path,
      notes: [`Current evidence completion: ${businessReadiness.evidenceCompletionPercent}%.`]
    }),
    step({
      name: "commercial_launch_intake_precheck",
      kind: "no_spend",
      status: launchIntakeReady ? "ready" : "needs_operator_input",
      command: launchIntakeReady
        ? "npm.cmd run validation:launch-intake"
        : "npm.cmd run validation:launch-intake -- --write-draft",
      evidencePath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
      requiredInputs: launchIntakeReady ? [] : ["ops/commercial-launch-intake.json with secret-free deployment, source-video, budget, provider, and manual-review values"],
      notes: launchIntakeReady
        ? ["Commercial launch intake is present and can feed no-spend readiness planning."]
        : ["Writes a draft intake and validates operator-provided launch values before live evidence or paid Atlas commands."]
    }),
    step({
      name: "client_policy_kit_generation",
      kind: "no_spend",
      status: environment.operations.apiClientPoliciesConfigured ? "ready" : "needs_operator_input",
      command: "npm.cmd run ops:create-client-policy -- --client-id pilot-client",
      requiredInputs: environment.operations.apiClientPoliciesConfigured ? [] : ["client ID and quota limits for the first pilot/customer account"],
      notes: [
        environment.operations.apiClientPoliciesConfigured
          ? "CINEJELLY_API_CLIENTS_JSON is already configured."
          : "Creates a digest-only client policy JSON, env snippet, and optional ignored raw-key secret file without provider spend."
      ]
    }),
    step({
      name: "ops_config_precheck",
      kind: "no_spend",
      status: opsReady ? "ready" : "needs_operator_input",
      command: "npm.cmd run validation:ops-config -- --write-drafts",
      evidencePath: opsConfig.path,
      requiredInputs: opsReady ? [] : ["CINEJELLY_API_CLIENTS_JSON", "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true", "CINEJELLY_CLIENT_USAGE_LEDGER_PATH", "ops/billing-admin-attestation.json", "ops/production-operations-attestation.json"],
      notes: opsReady
        ? opsConfig.nextActions
        : [
            ...opsConfig.nextActions,
            "After filling the generated drafts, run npm.cmd run ops:promote-attestations -- --dry-run and then npm.cmd run ops:promote-attestations when validation passes."
          ]
    }),
    step({
      name: "atlas_billing_public_api_probe",
      kind: "no_spend_network",
      status: atlasBilling.canUseAsPrePaidAtlasBillingEvidence ? "ready" : "needs_operator_input",
      command: "npm.cmd run validation:atlas-billing -- --confirm-live-network",
      evidencePath: atlasBilling.path,
      requiredInputs: atlasBilling.canUseAsPrePaidAtlasBillingEvidence ? [] : ["Atlas billing-capable API key", "no-spend live-network confirmation", "approved validation budget"],
      notes: atlasBilling.present
        ? [
            `Current Atlas billing readiness status: ${atlasBilling.status}.`,
            ...atlasBilling.nextActions
          ]
        : atlasBilling.nextActions
    }),
    step({
      name: "deployment_readiness_capture",
      kind: "no_spend_network",
      status: deploymentReady ? "ready" : "needs_operator_input",
      command: deploymentReady
        ? `npm.cmd run validation:deployment-readiness -- --base-url "${environment.deployment.safeUrlPreview}"`
        : "npm.cmd run validation:deployment-readiness -- --base-url https://<your-cinejelly-host>",
      requiredInputs: deploymentReady ? [] : ["real HTTPS CineJelly deployment URL", "deployment API auth token"],
      notes: ["Calls only /health, /v1/preflight, /v1/validation-readiness, and /v1/render-settings."]
    }),
    step({
      name: "billing_admin_quota_capture",
      kind: "no_spend_network",
      status: deploymentReady && opsReady ? "ready" : "blocked",
      command: deploymentReady
        ? `npm.cmd run validation:billing-admin-ops -- --base-url "${environment.deployment.safeUrlPreview}" --attestation ops/billing-admin-attestation.json`
        : "npm.cmd run validation:billing-admin-ops -- --base-url https://<your-cinejelly-host> --attestation ops/billing-admin-attestation.json",
      requiredInputs: deploymentReady && opsReady ? [] : ["passing ops-config precheck", "real HTTPS deployment URL"],
      notes: ["Does not call Atlas or payment provider APIs."]
    }),
    step({
      name: "production_operations_capture",
      kind: "no_spend_network",
      status: deploymentReady && opsReady ? "ready" : "blocked",
      command: deploymentReady
        ? `npm.cmd run validation:production-ops -- --base-url "${environment.deployment.safeUrlPreview}" --attestation ops/production-operations-attestation.json`
        : "npm.cmd run validation:production-ops -- --base-url https://<your-cinejelly-host> --attestation ops/production-operations-attestation.json",
      requiredInputs: deploymentReady && opsReady ? [] : ["passing ops-config precheck", "real HTTPS deployment URL"],
      notes: ["Requires durable storage, backup/restore, monitoring, incident/support, redaction, and retention attestation."]
    }),
    step({
      name: "source_video_auto_analysis_validation",
      kind: "paid_atlas_llm_and_source_fetch",
      status: sourceVideoReady ? "ready" : sourceVideoInputReady ? "blocked" : "needs_operator_input",
      command: sourceVideoReady
        ? `npm.cmd run validation:source-video-auto-analysis -- --source-video-url "${environment.sourceVideo.safeUrlPreview}" --confirm-provider-spend --max-cost-usd ${formatNumber(sourceVideoApprovedBudgetUsd)} --atlas-billing-report ${sourceVideoAtlasBilling.path}`
        : "npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://<clean-source-video.mp4>",
      requiredInputs: sourceVideoReady
        ? []
        : [
            ...(sourceVideoInputReady ? [] : ["clean HTTPS source video URL", "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true", "Atlas LLM key/model"]),
            ...(sourceVideoAtlasBilling.canUseAsPrePaidAtlasBillingEvidence ? [] : [sourceVideoBillingGateInput])
          ],
      notes: [
        "Run no-spend first without --confirm-provider-spend when checking a new source URL.",
        ...(sourceVideoAtlasBilling.canUseAsPrePaidAtlasBillingEvidence ? [] : [sourceVideoBillingGateNote, ...sourceVideoAtlasBilling.nextActions])
      ]
    }),
    step({
      name: "remote_stock_provider_validation",
      kind: "live_network",
      status: remoteStockReady ? "ready" : "needs_operator_input",
      command: `npm.cmd run validation:remote-stock -- --query "${escapeCommandText(options.remoteStockQuery)}" --confirm-live-network --confirm-commercial-terms-reviewed`,
      requiredInputs: remoteStockReady ? [] : ["CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true", "at least one approved Pexels/Pixabay/Coverr provider key", "commercial terms review"],
      notes: ["Does not call Atlas, but it does call configured stock provider APIs when confirmed."]
    }),
    step({
      name: "generated_audio_validation",
      kind: "paid_atlas_audio",
      status: generatedAudioReady ? "ready" : generatedAudioInputReady ? "blocked" : "needs_operator_input",
      command: generatedAudioProviderCommand({
        maxBudgetUsd: options.maxBudgetUsd,
        text: options.generatedAudioText,
        costUsdPer1kChars: costPlan.generatedAudio.costUsdPer1kChars,
        atlasBillingReportPath: generatedAudioBillingReportPath
      }),
      requiredInputs: generatedAudioReady
        ? ["manual audio review after output"]
        : [
            ...(generatedAudioInputReady ? [] : generatedAudioInputRequirements),
            ...(generatedAudioBillingReady ? [] : [generatedAudioBillingGateInput])
          ],
      estimatedCostUsd: costPlan.generatedAudio.estimatedCostUsd,
      notes: [
        `Estimated generated-audio validation cost: ${formatUsd(costPlan.generatedAudio.estimatedCostUsd)}.`,
        "After the provider run writes output evidence, run npm.cmd run validation:generated-audio-review-draft, listen to the result, fill ops/generated-audio-manual-review.json, then run npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review to update manual review without another Atlas call.",
        ...(generatedAudioBillingReady ? [] : [generatedAudioBillingGateNote, ...generatedAudioAtlasBilling.nextActions])
      ]
    }),
    step({
      name: "long_form_paid_validation",
      kind: "paid_atlas_video",
      status: longFormReady ? "ready" : "blocked",
      command: `npm.cmd run validation:long-form -- --duration-seconds ${options.longFormDurationSeconds} --max-cost-usd ${options.maxBudgetUsd} --confirm-paid-spend --manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review`,
      requiredInputs:
        longFormReady
          ? ["manual long-form media/redaction review JSON bound to the paid projectId, manifestSha256, and deliverableSha256 after output; use npm.cmd run validation:long-form-review-draft after the paid report writes artifact fingerprints"]
          : [
              ...(longFormInputReady ? [] : ["approved long-form budget at or above the current estimate", "Atlas media API key/model config"]),
              ...(longFormBillingReady ? [] : [longFormBillingGateInput])
            ],
      ...(costPlan.longForm.estimatedCostUsd !== undefined ? { estimatedCostUsd: costPlan.longForm.estimatedCostUsd } : {}),
      notes: [
        costPlan.longForm.estimatedCostUsd === undefined
          ? "Long-form estimate is unavailable because CINEJELLY_RENDER_COST_USD_PER_SECOND is not configured."
          : `Estimated long-form validation cost: ${formatUsd(costPlan.longForm.estimatedCostUsd)}.`,
        "After the paid long-form run writes artifact evidence, run npm.cmd run validation:long-form-review-draft, inspect the deliverable, fill ops/long-form-manual-quality-review.json, then rerun validation:long-form with --manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review.",
        ...(longFormBillingReady ? [] : [longFormBillingGateNote, ...longFormAtlasBilling.nextActions])
      ]
    }),
    step({
      name: "final_business_readiness_audit",
      kind: "no_spend",
      status: "blocked",
      command: "npm.cmd run validation:business-readiness",
      requiredInputs: ["all prior evidence reports passing"],
      notes: ["This is the only report that can mark the full commercial platform ready_for_limited_customer_traffic."]
    })
  ];
}

function step(value) {
  return {
    name: value.name,
    kind: value.kind,
    status: value.status,
    command: value.command,
    ...(value.evidencePath ? { evidencePath: value.evidencePath } : {}),
    ...(Array.isArray(value.requiredInputs) ? { requiredInputs: value.requiredInputs } : {}),
    ...(typeof value.estimatedCostUsd === "number" ? { estimatedCostUsd: value.estimatedCostUsd } : {}),
    notes: value.notes ?? []
  };
}

function statusFor(sequence) {
  if (sequence.some((item) => item.status === "needs_operator_input")) {
    return "blocked_by_missing_inputs";
  }
  if (sequence.some((item) => item.status === "blocked")) {
    return "blocked_by_budget_or_sequence";
  }
  return "ready_for_paid_sequence";
}

function buildReleaseGateSummary({ validationSequence, costPlan }) {
  const paidSteps = validationSequence.filter((step) => step.kind.startsWith("paid_"));
  const readyPaidSteps = paidSteps.filter((step) => step.status === "ready");
  const noSpendBlockers = validationSequence.filter((step) => step.kind.startsWith("no_spend") && step.status !== "ready");
  const readyPaidGates = readyPaidSteps.map((step) => step.name);
  const shouldDeferFullSequenceSpend =
    noSpendBlockers.length > 0 ||
    paidSteps.some((step) => step.status !== "ready") ||
    costPlan.budgetFit !== "within_budget";
  return {
    canRunSomePaidValidationNow: readyPaidSteps.length > 0,
    canRunLongFormWithinBudget: costPlan.longForm.withinBudget,
    readyPaidGates,
    readyPaidGateCount: readyPaidGates.length,
    shouldDeferFullSequenceSpend,
    shouldDeferAtlasSpend: readyPaidGates.length === 0,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "This is a no-spend planning report, not business-readiness evidence."
  };
}

function nextActionsFor({ validationSequence, costPlan, environment, opsConfig }) {
  const actions = [];
  if (!environment.launchIntake.present || environment.launchIntake.status !== "pass") {
    actions.push("Run npm.cmd run validation:launch-intake -- --write-draft, fill ops/commercial-launch-intake.json without secrets, then rerun validation:live-inputs and validation:business-plan.");
  }
  if (opsConfig.status !== "pass") {
    actions.push(
      environment.operations.apiClientPoliciesConfigured
        ? "Fill the generated billing/admin and production-operations attestation drafts, run npm.cmd run ops:promote-attestations -- --dry-run, promote them when validation passes, then rerun npm.cmd run validation:ops-config."
        : "Run npm.cmd run ops:create-client-policy for the first pilot/customer key, fill the generated operator draft files, and rerun npm.cmd run validation:ops-config."
    );
  }
  if (!environment.deployment.valid) {
    actions.push("Provide a real clean HTTPS deployment URL and deployment auth token, then run validation:deployment-readiness.");
  }
  if (!costPlan.longForm.withinBudget) {
    const minimum = costPlan.longForm.minimumBudgetUsdToRun;
    actions.push(
      minimum === undefined
        ? "Configure CINEJELLY_RENDER_COST_USD_PER_SECOND so long-form spend can be estimated before paid validation."
        : `Approve a long-form validation budget of at least ${formatUsd(minimum)} for the current ${costPlan.longForm.durationSeconds}s configuration, or lower the configured cost assumptions only if they match Atlas billing.`
    );
  }
  for (const item of validationSequence) {
    if (item.status === "needs_operator_input" && Array.isArray(item.requiredInputs) && item.requiredInputs.length > 0) {
      actions.push(`${item.name}: ${item.requiredInputs.join(", ")}.`);
    }
  }
  actions.push("Run paid Atlas validations only after the no-spend/network prerequisites for that specific gate are ready and the budget is explicitly approved.");
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

function validateOptionalCleanHttpsUrl(value, flag, policy) {
  if (!value) {
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${flag} must be a valid URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${flag} must use HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error(`${flag} must not include embedded credentials.`);
  }
  if (!policy.allowQuery && (url.search || url.hash)) {
    throw new Error(`${flag} must not include query strings or fragments.`);
  }
  if (policy.forbidLocalhost && isLocalhost(url.hostname)) {
    throw new Error(`${flag} must not be localhost.`);
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

function escapeCommandText(value) {
  return String(value).replace(/["\r\n]/g, " ").trim();
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
        schemaVersion: "cinejelly.business-readiness-validation-plan.v1",
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
