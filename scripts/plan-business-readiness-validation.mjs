import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  maxBudgetUsd: 5,
  longFormDurationSeconds: 120,
  sourceVideoUrl: process.env.CINEJELLY_VALIDATION_SOURCE_VIDEO_URL,
  deploymentBaseUrl: process.env.CINEJELLY_DEPLOYMENT_BASE_URL,
  remoteStockQuery: "modern workspace desk lamp",
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

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--business-readiness-report", "businessReadinessPath"],
    ["--ops-config-report", "opsConfigPath"],
    ["--max-budget-usd", "maxBudgetUsd"],
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
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return ["maxBudgetUsd", "longFormDurationSeconds"].includes(key);
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
  --max-budget-usd <amount>                Budget ceiling for known paid validation. Default: ${defaults.maxBudgetUsd}
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
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const businessReadiness = summarizeBusinessReadiness(options.businessReadinessPath);
  const opsConfig = summarizeOpsConfig(options.opsConfigPath);
  const environment = summarizeEnvironment(options);
  const costPlan = buildCostPlan(options);
  const validationSequence = buildValidationSequence({ options, businessReadiness, opsConfig, environment, costPlan });
  const status = statusFor(validationSequence);
  const report = {
    schemaVersion: "cinejelly.business-readiness-validation-plan.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    checkedInputs: {
      businessReadinessPath: toRepoRelative(options.businessReadinessPath),
      opsConfigPath: toRepoRelative(options.opsConfigPath),
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

function summarizeEnvironment(options) {
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
    autoAnalysisEnabled: envTrue("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS"),
    atlasLlmReady: atlas.llmFallbackAvailable && atlas.llmModelConfigured
  };
  const remoteStockProviders = [
    providerEvidence("pexels", "PEXELS_API_KEY", true),
    providerEvidence("pixabay", "PIXABAY_API_KEY", true),
    providerEvidence("coverr", "COVERR_API_KEY", envTrue("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"))
  ];
  const remoteStock = {
    enabled: envTrue("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS"),
    configuredProviderCount: remoteStockProviders.filter((provider) => provider.ready).length,
    commercialTermsReviewedForCoverr: envTrue("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"),
    providers: remoteStockProviders
  };
  const generatedAudioCapabilities = jsonArrayEnv("ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON");
  const generatedAudio = {
    modelConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_MODEL"),
    voiceIdConfigured: envConfigured("ATLASCLOUD_GENERATED_AUDIO_VOICE_ID"),
    capabilitiesJsonConfigured: generatedAudioCapabilities.configured,
    capabilitiesJsonValid: generatedAudioCapabilities.valid,
    capabilityCount: generatedAudioCapabilities.count,
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
  const audioRate = numberFromEnv("ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS") ?? 0.015;
  const generatedAudioEstimate = Number(((options.generatedAudioText.length / 1000) * audioRate).toFixed(6));
  const knownPaidEstimateUsd = Number(
    [longFormEstimate, generatedAudioEstimate]
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0)
      .toFixed(6)
  );
  return {
    maxBudgetUsd: options.maxBudgetUsd,
    knownPaidEstimateUsd,
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
    unknownCostItems: [
      "source_video_auto_analysis_atlas_llm_usage",
      "remote_stock_provider_api_usage",
      "manual_review_time",
      "deployment_hosting"
    ]
  };
}

function buildValidationSequence({ options, businessReadiness, opsConfig, environment, costPlan }) {
  const deploymentReady = environment.deployment.configured && environment.deployment.valid;
  const opsReady = opsConfig.status === "pass";
  const atlasPaidReady = environment.atlas.mediaApiKeyConfigured && environment.atlas.seedanceStandardModelConfigured && environment.atlas.seedanceFastModelConfigured;
  const sourceVideoReady =
    environment.sourceVideo.cleanHttpsUrlValid &&
    environment.sourceVideo.autoAnalysisEnabled &&
    environment.sourceVideo.atlasLlmReady;
  const remoteStockReady = environment.remoteStock.enabled && environment.remoteStock.configuredProviderCount > 0;
  const generatedAudioReady =
    environment.generatedAudio.atlasMediaReady &&
    environment.generatedAudio.capabilitiesJsonValid &&
    environment.generatedAudio.capabilityCount > 0 &&
    costPlan.generatedAudio.withinBudget;

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
      status: sourceVideoReady ? "ready" : "needs_operator_input",
      command: sourceVideoReady
        ? `npm.cmd run validation:source-video-auto-analysis -- --source-video-url "${environment.sourceVideo.safeUrlPreview}" --confirm-provider-spend`
        : "npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://<clean-source-video.mp4>",
      requiredInputs: sourceVideoReady ? [] : ["clean HTTPS source video URL", "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true", "Atlas LLM key/model"],
      notes: ["Run no-spend first without --confirm-provider-spend when checking a new source URL."]
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
      status: generatedAudioReady ? "ready" : "needs_operator_input",
      command: "npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed --confirm-manual-audio-review",
      requiredInputs: generatedAudioReady ? ["manual audio review after output"] : ["ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON", "Atlas media API key", "manual schema/audio review"],
      estimatedCostUsd: costPlan.generatedAudio.estimatedCostUsd,
      notes: [`Estimated generated-audio validation cost: ${formatUsd(costPlan.generatedAudio.estimatedCostUsd)}.`]
    }),
    step({
      name: "long_form_paid_validation",
      kind: "paid_atlas_video",
      status: atlasPaidReady && costPlan.longForm.withinBudget ? "ready" : "blocked",
      command: `npm.cmd run validation:long-form -- --duration-seconds ${options.longFormDurationSeconds} --max-cost-usd ${options.maxBudgetUsd} --confirm-paid-spend --confirm-manual-quality-review`,
      requiredInputs:
        atlasPaidReady && costPlan.longForm.withinBudget
          ? ["manual long-form media/redaction review after output"]
          : ["approved long-form budget at or above the current estimate", "Atlas media API key/model config"],
      ...(costPlan.longForm.estimatedCostUsd !== undefined ? { estimatedCostUsd: costPlan.longForm.estimatedCostUsd } : {}),
      notes: [
        costPlan.longForm.estimatedCostUsd === undefined
          ? "Long-form estimate is unavailable because CINEJELLY_RENDER_COST_USD_PER_SECOND is not configured."
          : `Estimated long-form validation cost: ${formatUsd(costPlan.longForm.estimatedCostUsd)}.`
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
  return {
    canRunSomePaidValidationNow: readyPaidSteps.length > 0,
    canRunLongFormWithinBudget: costPlan.longForm.withinBudget,
    shouldDeferAtlasSpend: noSpendBlockers.length > 0 || !costPlan.longForm.withinBudget,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "This is a no-spend planning report, not business-readiness evidence."
  };
}

function nextActionsFor({ validationSequence, costPlan, environment, opsConfig }) {
  const actions = [];
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

function providerEvidence(name, envName, termsApproved) {
  const keyConfigured = envConfigured(envName);
  return {
    name,
    keyConfigured,
    commercialTermsApproved: termsApproved,
    ready: keyConfigured && termsApproved
  };
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
