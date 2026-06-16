import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  modelId: process.env.ATLASCLOUD_GENERATED_AUDIO_MODEL || "xai/tts-v1",
  text: "Xin chao, day la ban kiem tra am thanh ngan cua CineJelly.",
  language: "vi",
  voiceId: process.env.ATLASCLOUD_GENERATED_AUDIO_VOICE_ID || "mai",
  outputFormat: "mp3",
  durationSeconds: 6,
  maxCostUsd: 0.05,
  costUsdPer1kChars: Number(process.env.ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS || "0.015"),
  timeoutMs: 300_000
};

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Atlas Cloud xai/tts-v1 model page",
  "Atlas Cloud Predictions docs"
];

const atlasDocsEvidence = {
  modelPage: "https://www.atlascloud.ai/models/xai/tts-v1",
  docsModelId: "xai/tts-v1",
  submitEndpoint: "https://api.atlascloud.ai/api/v1/model/generateAudio",
  predictionEndpoint: "https://api.atlascloud.ai/api/v1/model/prediction/{prediction_id}",
  documentedRequestFields: ["model", "text", "language", "voice_id", "codec", "sample_rate", "bit_rate", "speed"],
  documentedOutputFormats: ["mp3", "wav", "pcm", "mulaw", "alaw"],
  documentedAsyncStatuses: ["processing", "completed", "failed"],
  documentedMaxTextCharacters: 15_000,
  documentedCostUsdPer1kCharacters: 0.015,
  observedInDocsAt: "2026-06-16"
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
    outputPath: defaults.outputPath,
    modelId: defaults.modelId,
    text: defaults.text,
    language: defaults.language,
    voiceId: defaults.voiceId,
    outputFormat: defaults.outputFormat,
    durationSeconds: defaults.durationSeconds,
    maxCostUsd: defaults.maxCostUsd,
    costUsdPer1kChars: defaults.costUsdPer1kChars,
    timeoutMs: defaults.timeoutMs,
    confirmProviderSpend: false,
    confirmAudioSchemaReviewed: false,
    confirmManualAudioReview: false,
    writeReport: true
  };

  const flagMap = new Map([
    ["--model", "modelId"],
    ["--text", "text"],
    ["--language", "language"],
    ["--voice-id", "voiceId"],
    ["--output-format", "outputFormat"],
    ["--duration-seconds", "durationSeconds"],
    ["--max-cost-usd", "maxCostUsd"],
    ["--cost-usd-per-1k-chars", "costUsdPer1kChars"],
    ["--timeout-ms", "timeoutMs"],
    ["--manual-audio-review", "manualAudioReviewPath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-provider-spend") {
      options.confirmProviderSpend = true;
      continue;
    }
    if (arg === "--confirm-audio-schema-reviewed") {
      options.confirmAudioSchemaReviewed = true;
      continue;
    }
    if (arg === "--confirm-manual-audio-review") {
      options.confirmManualAudioReview = true;
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
  return ["durationSeconds", "maxCostUsd", "costUsdPer1kChars", "timeoutMs"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Run Atlas generated-audio validation with explicit spend and schema gates.

Usage:
  npm.cmd run validation:generated-audio
  npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed

Options:
  --model <id>                         Atlas audio model. Default: ${defaults.modelId}
  --text <text>                        Bounded validation text. Default: "${defaults.text}"
  --language <code>                    Language code for schema evidence. Default: ${defaults.language}
  --voice-id <id>                      Voice identifier for schema evidence. Default: ${defaults.voiceId}
  --output-format <mp3|wav>            Required output format. Default: ${defaults.outputFormat}
  --duration-seconds <seconds>         Expected validation duration evidence. Default: ${defaults.durationSeconds}
  --max-cost-usd <amount>              Local budget ceiling for this audio validation. Default: ${defaults.maxCostUsd}
  --cost-usd-per-1k-chars <amount>     Cost assumption from current Atlas docs. Default: ${defaults.costUsdPer1kChars}
  --timeout-ms <ms>                    Abort live validation after this many ms. Default: ${defaults.timeoutMs}
  --manual-audio-review <path>         Optional operator review note containing a pass decision.
  --confirm-provider-spend             Required before any Atlas generated-audio provider execution can be attempted.
  --confirm-audio-schema-reviewed      Required before docs-derived Atlas audio schema can count as business evidence.
  --confirm-manual-audio-review        Operator confirms the generated audio output was listened to and accepted.
  --output <path>                      JSON report path. Default: ${defaults.outputPath}
  --no-output                          Print only; do not write the report.

Without --confirm-provider-spend this command validates inputs, runtime capability wiring, and planning only; it does not call Atlas.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const intent = buildIntent(options);
  const costEstimate = estimatedAudioCost(options);
  const inputChecks = [
    pass("validation_text", "Generated-audio validation text is bounded."),
    pass("output_report_path", "Output report path is JSON."),
    pass("audio_output_format", "Requested generated-audio output format is supported by CineJelly validators."),
    costEstimate <= options.maxCostUsd
      ? pass("estimated_cost_budget", `Estimated audio validation cost ${formatUsd(costEstimate)} is within maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
      : fail("estimated_cost_budget", `Estimated audio validation cost ${formatUsd(costEstimate)} exceeds maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
  ];
  const planningEvidence = await buildPlanningEvidence({ options, intent });
  const manualAudioReview = readManualAudioReview(options);

  if (!options.confirmProviderSpend) {
    const checks = [
      ...inputChecks,
      ...planningEvidence.checks,
      fail("spend_confirmation", "--confirm-provider-spend is required before Atlas generated-audio provider execution.")
    ];
    const report = buildReport({
      options,
      intent,
      status: "blocked_by_spend_confirmation",
      checks,
      costEstimate,
      spendGate: spendGate(options, costEstimate, false),
      schemaGate: schemaGate(options),
      runtimeSettings: planningEvidence.runtimeSettings,
      planning: summarizePlan(planningEvidence.plan),
      executionRun: emptyExecutionRun(),
      outputBatchValidation: emptyOutputBatchValidation(),
      providerLedger: emptyLedgerSummary(),
      manualAudioReview
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  if (!options.confirmAudioSchemaReviewed) {
    const checks = [
      ...inputChecks,
      ...planningEvidence.checks,
      fail("audio_schema_review", "--confirm-audio-schema-reviewed is required before Atlas generated-audio schema can count as business-readiness evidence.")
    ];
    const report = buildReport({
      options,
      intent,
      status: "blocked_by_schema_review",
      checks,
      costEstimate,
      spendGate: spendGate(options, costEstimate, false),
      schemaGate: schemaGate(options),
      runtimeSettings: planningEvidence.runtimeSettings,
      planning: summarizePlan(planningEvidence.plan),
      executionRun: emptyExecutionRun(),
      outputBatchValidation: emptyOutputBatchValidation(),
      providerLedger: emptyLedgerSummary(),
      manualAudioReview
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const preExecutionFailures = [
    ...inputChecks,
    ...planningEvidence.checks
  ].filter((check) => check.status === "fail");
  if (preExecutionFailures.length > 0 || planningEvidence.plan.readyCount === 0 || !planningEvidence.runtimeSettingsRaw) {
    const checks = [
      ...inputChecks,
      ...planningEvidence.checks,
      planningEvidence.plan.readyCount > 0
        ? pass("generated_audio_execution_plan", "Generated-audio validation intent is ready for provider execution.")
        : fail("generated_audio_execution_plan", "Generated-audio validation intent is not ready for provider execution.")
    ];
    const report = buildReport({
      options,
      intent,
      status: preExecutionFailures.some((check) => check.name === "estimated_cost_budget")
        ? "blocked_by_budget"
        : "blocked_by_configuration",
      checks,
      costEstimate,
      spendGate: spendGate(options, costEstimate, false),
      schemaGate: schemaGate(options),
      runtimeSettings: planningEvidence.runtimeSettings,
      planning: summarizePlan(planningEvidence.plan),
      executionRun: emptyExecutionRun(),
      outputBatchValidation: emptyOutputBatchValidation(),
      providerLedger: emptyLedgerSummary(),
      manualAudioReview
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const liveEvidence = await runGeneratedAudioValidation({
    options,
    intent,
    plan: planningEvidence.plan,
    runtimeSettings: planningEvidence.runtimeSettingsRaw
  });
  const checks = [
    ...inputChecks,
    ...planningEvidence.checks,
    ...liveEvidence.checks,
    manualAudioReview.passed
      ? pass("manual_audio_review", "Operator manual generated-audio review passed.")
      : fail("manual_audio_review", "Manual generated-audio review is required before this evidence can count for business readiness.")
  ];
  const status = statusForChecks(checks);
  const report = buildReport({
    options,
    intent,
    status,
    checks,
    costEstimate,
    spendGate: spendGate(options, costEstimate, true),
    schemaGate: schemaGate(options),
    runtimeSettings: planningEvidence.runtimeSettings,
    planning: summarizePlan(planningEvidence.plan),
    executionRun: liveEvidence.executionRun,
    outputBatchValidation: liveEvidence.outputBatchValidation,
    providerLedger: liveEvidence.providerLedger,
    manualAudioReview,
    error: liveEvidence.error
  });
  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (typeof options.modelId !== "string" || !options.modelId.trim() || options.modelId.length > 120) {
    throw new Error("--model must be a non-empty string up to 120 characters.");
  }
  if (typeof options.text !== "string" || !options.text.trim() || options.text.length > atlasDocsEvidence.documentedMaxTextCharacters) {
    throw new Error(`--text must be between 1 and ${atlasDocsEvidence.documentedMaxTextCharacters} characters.`);
  }
  if (typeof options.language !== "string" || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$|^auto$/.test(options.language)) {
    throw new Error("--language must be auto or a short BCP-47 language code.");
  }
  if (typeof options.voiceId !== "string" || !options.voiceId.trim() || options.voiceId.length > 80) {
    throw new Error("--voice-id must be a non-empty string up to 80 characters.");
  }
  if (!["mp3", "wav"].includes(options.outputFormat)) {
    throw new Error("--output-format must be mp3 or wav.");
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0 || options.durationSeconds > 3_600) {
    throw new Error("--duration-seconds must be a number between 1 and 3600.");
  }
  if (!Number.isFinite(options.maxCostUsd) || options.maxCostUsd < 0 || options.maxCostUsd > 5) {
    throw new Error("--max-cost-usd must be a number between 0 and 5.");
  }
  if (!Number.isFinite(options.costUsdPer1kChars) || options.costUsdPer1kChars < 0 || options.costUsdPer1kChars > 1) {
    throw new Error("--cost-usd-per-1k-chars must be a number between 0 and 1.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 30_000 || options.timeoutMs > 1_800_000) {
    throw new Error("--timeout-ms must be an integer between 30000 and 1800000.");
  }
}

function buildIntent(options) {
  return {
    intentId: "atlas_generated_audio_validation_tts",
    kind: "tts_narration",
    prompt: options.text.trim(),
    durationSeconds: options.durationSeconds,
    language: options.language,
    voiceStyle: options.voiceId,
    volume: 1,
    providerPreference: "atlascloud"
  };
}

async function buildPlanningEvidence({ options, intent }) {
  const [{ GeneratedAudioExecutionPlanner }, { loadAtlasCloudSettings }] = await Promise.all([
    import("../dist/core/generated-audio-execution-planner.js"),
    import("../dist/config/runtime-config.js")
  ]);
  let runtimeSettingsRaw;
  let capabilities = [];
  const checks = [];
  let runtimeSettings;

  try {
    runtimeSettingsRaw = loadAtlasCloudSettings(process.env);
    capabilities = runtimeSettingsRaw.generatedAudioCapabilities ?? [];
    runtimeSettings = {
      apiKeyConfigured: true,
      llmApiKeyConfigured: Boolean(runtimeSettingsRaw.llmApiKey),
      apiBaseUrl: runtimeSettingsRaw.apiBaseUrl,
      assetBaseUrl: runtimeSettingsRaw.assetBaseUrl,
      generatedAudioCapabilityCount: capabilities.length,
      generatedAudioCapabilities: summarizeCapabilities(capabilities)
    };
    checks.push(
      capabilities.length > 0
        ? pass("generated_audio_capability_config", `${capabilities.length} Atlas generated-audio capability record(s) configured.`)
        : fail("generated_audio_capability_config", "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON must include at least one verified Atlas generated-audio capability.")
    );
  } catch (error) {
    checks.push(fail("runtime_config", redactText(error instanceof Error ? error.message : String(error))));
    runtimeSettings = {
      apiKeyConfigured: Boolean(process.env.ATLASCLOUD_API_KEY?.trim()),
      llmApiKeyConfigured: Boolean(process.env.ATLASCLOUD_LLM_API_KEY?.trim()),
      generatedAudioCapabilityCount: 0,
      generatedAudioCapabilities: [],
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  }

  const planner = new GeneratedAudioExecutionPlanner();
  const plan = planner.plan({
    intents: [intent],
    capabilities,
    metadata: {
      projectId: "atlas_generated_audio_validation",
      requestId: "atlas_generated_audio_validation"
    },
    options: { outputFormat: options.outputFormat }
  });
  checks.push(
    plan.readyCount > 0
      ? pass("generated_audio_planning", "Generated-audio validation intent can be planned against configured capability.")
      : fail("generated_audio_planning", "Generated-audio validation intent is blocked before provider execution.")
  );

  return {
    runtimeSettingsRaw,
    runtimeSettings,
    plan,
    checks
  };
}

async function runGeneratedAudioValidation({ options, intent, plan, runtimeSettings }) {
  const [
    { AtlasCloudProvider },
    { ProviderCostLedger },
    { GeneratedAudioProviderExecutionRunner },
    { GeneratedAudioOutputBatchValidator }
  ] = await Promise.all([
    import("../dist/providers/atlascloud/atlas-cloud-provider.js"),
    import("../dist/providers/cost-ledger.js"),
    import("../dist/core/generated-audio-provider-execution-runner.js"),
    import("../dist/core/generated-audio-output-batch-validator.js")
  ]);

  const ledger = new ProviderCostLedger();
  const provider = new AtlasCloudProvider(runtimeSettings, ledger);
  const runner = new GeneratedAudioProviderExecutionRunner();
  const validator = new GeneratedAudioOutputBatchValidator();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Atlas generated-audio validation timed out.")), options.timeoutMs);

  try {
    const run = await runner.run({
      executionPlan: plan,
      audioProvider: provider,
      signal: controller.signal
    });
    const batch = validator.validate({
      intents: [intent],
      executionPlan: plan,
      results: run.results
    });
    const checks = checksForLiveEvidence(run, batch, ledger.list());
    return {
      checks,
      executionRun: summarizeExecutionRun(run),
      outputBatchValidation: summarizeOutputBatchValidation(batch),
      providerLedger: summarizeLedger(ledger.list())
    };
  } catch (error) {
    return {
      checks: [fail("generated_audio_live_validation", redactText(error instanceof Error ? error.message : String(error)))],
      executionRun: emptyExecutionRun(),
      outputBatchValidation: emptyOutputBatchValidation(),
      providerLedger: summarizeLedger(ledger.list()),
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checksForLiveEvidence(run, batch, ledgerEntries) {
  return [
    run.status === "succeeded"
      ? pass("generated_audio_execution", "Generated-audio provider execution succeeded.")
      : run.status === "partial"
        ? warn("generated_audio_execution", "Generated-audio provider execution partially succeeded.")
        : fail("generated_audio_execution", `Generated-audio provider execution status is ${run.status}.`),
    batch.status === "approved" && batch.approvedTrackCount > 0
      ? pass("generated_audio_output_batch_validation", "Generated-audio output batch validation approved at least one track.")
      : batch.status === "review_required" || batch.status === "partially_approved"
        ? warn("generated_audio_output_batch_validation", `Generated-audio output batch validation status is ${batch.status}.`)
        : fail("generated_audio_output_batch_validation", `Generated-audio output batch validation status is ${batch.status}.`),
    ledgerEntries.length > 0
      ? pass("provider_ledger", `${ledgerEntries.length} provider ledger entr${ledgerEntries.length === 1 ? "y" : "ies"} captured for generated-audio validation.`)
      : fail("provider_ledger", "Generated-audio validation did not capture provider ledger evidence.")
  ];
}

function estimatedAudioCost(options) {
  return Number(((options.text.length / 1000) * options.costUsdPer1kChars).toFixed(6));
}

function spendGate(options, estimatedCostUsd, providerNetworkCallsAllowed) {
  return {
    confirmProviderSpend: options.confirmProviderSpend,
    providerNetworkCallsAllowed,
    estimatedCostUsd,
    maxCostUsd: options.maxCostUsd,
    costUsdPer1kChars: options.costUsdPer1kChars
  };
}

function schemaGate(options) {
  return {
    confirmAudioSchemaReviewed: options.confirmAudioSchemaReviewed,
    atlasDocsEvidence,
    docsDerivedModelMatchesRequest: options.modelId === atlasDocsEvidence.docsModelId,
    requestedModelId: options.modelId,
    requestedLanguage: options.language,
    requestedVoiceId: options.voiceId,
    requestedCodec: options.outputFormat
  };
}

function readManualAudioReview(options) {
  if (options.confirmManualAudioReview) {
    return {
      present: true,
      source: "operator_flag",
      passed: true,
      message: "Operator confirmed generated-audio manual review passed."
    };
  }
  if (!options.manualAudioReviewPath) {
    return {
      present: false,
      passed: false,
      message: "No manual generated-audio review evidence was supplied."
    };
  }
  const absolutePath = resolve(repoRoot, options.manualAudioReviewPath);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      passed: false,
      path: toRepoRelative(options.manualAudioReviewPath),
      message: "Manual generated-audio review file does not exist."
    };
  }
  const text = readFileSync(absolutePath, "utf8");
  const normalized = text.toLowerCase();
  const passed =
    normalized.includes("manual audio review passes") ||
    (normalized.includes("decision") && normalized.includes("pass")) ||
    normalized.includes("generated-audio review passed");
  return {
    present: true,
    path: toRepoRelative(options.manualAudioReviewPath),
    passed,
    message: passed
      ? "Manual generated-audio review file contains a pass decision."
      : "Manual generated-audio review file does not contain a clear pass decision."
  };
}

function buildReport({
  options,
  intent,
  status,
  checks,
  costEstimate,
  spendGate,
  schemaGate,
  runtimeSettings,
  planning,
  executionRun,
  outputBatchValidation,
  providerLedger,
  manualAudioReview,
  error
}) {
  const canUseAsBusinessReadinessGeneratedAudioEvidence =
    status === "pass" &&
    spendGate.providerNetworkCallsAllowed === true &&
    schemaGate.confirmAudioSchemaReviewed === true &&
    executionRun.status === "succeeded" &&
    outputBatchValidation.status === "approved" &&
    outputBatchValidation.approvedTrackCount > 0 &&
    manualAudioReview.passed === true;

  return {
    schemaVersion: "cinejelly.generated-audio-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins,
    checkedInputs: {
      modelId: options.modelId,
      textCharacterCount: options.text.length,
      language: options.language,
      voiceId: options.voiceId,
      outputFormat: options.outputFormat,
      durationSeconds: options.durationSeconds,
      estimatedCostUsd: costEstimate,
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate,
    schemaGate,
    checks,
    runtimeSettings,
    planning,
    executionRun,
    outputBatchValidation,
    providerLedger,
    manualAudioReview,
    ...(error ? { error } : {}),
    releaseGateSummary: {
      canUseAsBusinessReadinessGeneratedAudioEvidence,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: canUseAsBusinessReadinessGeneratedAudioEvidence
        ? "Generated-audio evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
        : "Atlas generated-audio evidence is incomplete."
    },
    nextActions: nextActionsFor(status, checks)
  };
}

function summarizeCapabilities(capabilities) {
  return capabilities.map((capability) => ({
    provider: capability.provider,
    modelId: capability.modelId,
    kinds: capability.kinds,
    outputFormats: capability.outputFormats,
    maxDurationSeconds: capability.maxDurationSeconds,
    async: capability.async
  }));
}

function summarizePlan(plan) {
  return {
    status: plan.status,
    intentCount: plan.intentCount,
    readyCount: plan.readyCount,
    blockedCount: plan.blockedCount,
    requestedDurationSeconds: plan.requestedDurationSeconds,
    outputFormat: plan.outputFormat,
    items: plan.items.map((item) => ({
      intentId: item.intentId,
      kind: item.kind,
      status: item.status,
      ...(item.providerPreference ? { providerPreference: item.providerPreference } : {}),
      ...(item.requestedDurationSeconds !== undefined ? { requestedDurationSeconds: item.requestedDurationSeconds } : {}),
      ...(item.status === "ready_for_provider"
        ? {
            provider: item.provider,
            modelId: item.modelId,
            maxDurationSeconds: item.maxDurationSeconds
          }
        : {
            reason: item.reason,
            message: item.message,
            candidateProviderCount: item.candidateProviderCount,
            candidateKindCount: item.candidateKindCount
          })
    }))
  };
}

function summarizeExecutionRun(run) {
  return {
    status: run.status,
    readyItemCount: run.readyItemCount,
    attemptedCount: run.attemptedCount,
    succeededCount: run.succeededCount,
    failedCount: run.failedCount,
    timeoutCount: run.timeoutCount,
    canceledCount: run.canceledCount,
    results: run.results.map((result) => ({
      provider: result.provider,
      modelId: result.modelId,
      intentId: result.intentId,
      kind: result.kind,
      status: result.status,
      ...(result.providerAssetId ? { providerAssetId: result.providerAssetId } : {}),
      ...(result.outputUrl ? { outputUrlPreview: safeUrlPreview(result.outputUrl) } : {}),
      ...(result.durationSeconds !== undefined ? { durationSeconds: result.durationSeconds } : {}),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      ...(result.raw && typeof result.raw === "object" && "errorCode" in result.raw
        ? { errorCode: result.raw.errorCode }
        : {})
    }))
  };
}

function summarizeOutputBatchValidation(batch) {
  return {
    status: batch.status,
    intentCount: batch.intentCount,
    readyIntentCount: batch.readyIntentCount,
    resultCount: batch.resultCount,
    approvedTrackCount: batch.approvedTrackCount,
    reviewRequiredReportCount: batch.reviewRequiredReportCount,
    rejectedReportCount: batch.rejectedReportCount,
    missingResultCount: batch.missingResultCount,
    unexpectedResultCount: batch.unexpectedResultCount,
    duplicateResultCount: batch.duplicateResultCount,
    issueCount: batch.issueCount,
    issueCounts: countBy(batch.issues.map((issue) => issue.code)),
    reports: batch.reports.map((report) => ({
      status: report.status,
      intentId: report.intentId,
      kind: report.kind,
      provider: report.provider,
      modelId: report.modelId,
      ...(report.outputUrl ? { outputUrlPreview: safeUrlPreview(report.outputUrl) } : {}),
      ...(report.durationSeconds !== undefined ? { durationSeconds: report.durationSeconds } : {}),
      issueCount: report.issueCount,
      issueCounts: countBy(report.issues.map((issue) => issue.code)),
      audioTrackApproved: Boolean(report.audioTrack)
    }))
  };
}

function emptyExecutionRun() {
  return {
    status: "not_run",
    readyItemCount: 0,
    attemptedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    timeoutCount: 0,
    canceledCount: 0,
    results: []
  };
}

function emptyOutputBatchValidation() {
  return {
    status: "not_requested",
    intentCount: 0,
    readyIntentCount: 0,
    resultCount: 0,
    approvedTrackCount: 0,
    reviewRequiredReportCount: 0,
    rejectedReportCount: 0,
    missingResultCount: 0,
    unexpectedResultCount: 0,
    duplicateResultCount: 0,
    issueCount: 0,
    issueCounts: {},
    reports: []
  };
}

function summarizeLedger(entries) {
  return {
    entryCount: entries.length,
    operations: countBy(entries.map((entry) => entry.operation ?? "unknown")),
    statuses: countBy(entries.map((entry) => entry.status ?? "unknown")),
    estimatedCostUsd: sumOptional(entries.map((entry) => entry.estimatedCostUsd)),
    actualCostUsd: sumOptional(entries.map((entry) => entry.actualCostUsd)),
    entries: entries.map((entry) => ({
      provider: entry.provider,
      operation: entry.operation,
      status: entry.status,
      ...(entry.modelId ? { modelId: entry.modelId } : {}),
      ...(entry.predictionId ? { predictionId: entry.predictionId } : {}),
      ...(entry.providerStatus ? { providerStatus: entry.providerStatus } : {}),
      ...(entry.latencyMs !== undefined ? { latencyMs: entry.latencyMs } : {}),
      ...(entry.retryCount !== undefined ? { retryCount: entry.retryCount } : {}),
      ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      ...(entry.retryable !== undefined ? { retryable: entry.retryable } : {})
    }))
  };
}

function emptyLedgerSummary() {
  return {
    entryCount: 0,
    operations: {},
    statuses: {},
    entries: []
  };
}

function nextActionsFor(status, checks) {
  if (status === "pass") {
    return [
      "Archive this generated-audio validation report with business-readiness evidence.",
      "Continue the remaining business-readiness gates before opening paid customer traffic."
    ];
  }
  if (status === "warn") {
    return ["Review generated-audio validation warnings and manual audio quality before using this evidence commercially."];
  }
  const actions = checks.filter((check) => check.status === "fail").map((check) => check.message);
  actions.push("Do not count Atlas generated-audio as business-ready evidence until this report status is pass.");
  return [...new Set(actions)];
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

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sumOptional(values) {
  const present = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) {
    return undefined;
  }
  return Number(present.reduce((sum, value) => sum + value, 0).toFixed(6));
}

function safeUrlPreview(value) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

function formatUsd(value) {
  return `$${Number(value).toFixed(6)}`;
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function warn(name, message) {
  return { name, status: "warn", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
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
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, secretKeyPattern.test(key) ? "[REDACTED]" : redactUnknown(item)])
    );
  }
  return value;
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

try {
  process.exitCode = await main();
} catch (error) {
  const report = {
    schemaVersion: "cinejelly.generated-audio-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
