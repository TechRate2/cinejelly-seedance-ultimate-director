import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  modelId: process.env.ATLASCLOUD_GENERATED_AUDIO_MODEL || "xai/tts-v1",
  text: "Xin chao, day la ban kiem tra am thanh ngan cua CineJelly.",
  language: "vi",
  voiceId: process.env.ATLASCLOUD_GENERATED_AUDIO_VOICE_ID || "eve",
  outputFormat: "mp3",
  durationSeconds: 6,
  maxCostUsd: 0.05,
  costUsdPer1kChars: Number(process.env.ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS || "0.015"),
  atlasBillingReportPath: "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json",
  atlasBillingEvidenceMaxAgeHours: Number(process.env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS || "24"),
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
  resultCompatibilityEndpoints: [
    "https://api.atlascloud.ai/api/v1/model/result/{prediction_id}",
    "https://api.atlascloud.ai/api/v1/model/getResult?predictionId={prediction_id}"
  ],
  documentedRequestFields: ["model", "text", "language", "voice_id", "codec", "sample_rate", "bit_rate", "speed"],
  documentedOutputFormats: ["mp3", "wav", "pcm", "mulaw", "alaw"],
  documentedAsyncStatuses: ["processing", "completed", "failed"],
  documentedMaxTextCharacters: 15_000,
  documentedCostUsdPer1kCharacters: 0.015,
  observedInDocsAt: "2026-06-19"
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
    atlasBillingReportPath: defaults.atlasBillingReportPath,
    atlasBillingEvidenceMaxAgeHours: defaults.atlasBillingEvidenceMaxAgeHours,
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
    ["--atlas-billing-report", "atlasBillingReportPath"],
    ["--atlas-billing-evidence-max-age-hours", "atlasBillingEvidenceMaxAgeHours"],
    ["--timeout-ms", "timeoutMs"],
    ["--manual-audio-review", "manualAudioReviewPath"],
    ["--review-existing-report", "reviewExistingReportPath"],
    ["--resume-existing-report", "resumeExistingReportPath"],
    ["--resume-prediction-id", "resumePredictionId"],
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
  return ["durationSeconds", "maxCostUsd", "costUsdPer1kChars", "atlasBillingEvidenceMaxAgeHours", "timeoutMs"].includes(key);
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
  --atlas-billing-report <path>        Slice billing readiness report. Default: ${defaults.atlasBillingReportPath}
  --atlas-billing-evidence-max-age-hours <hours>
                                       Maximum age for Atlas billing readiness evidence. Default: ${defaults.atlasBillingEvidenceMaxAgeHours}
  --timeout-ms <ms>                    Abort live validation after this many ms. Default: ${defaults.timeoutMs}
  --manual-audio-review <path>         Optional operator review JSON/note containing accepted listening evidence.
  --review-existing-report <path>      Re-score an existing paid generated-audio report with manual review evidence without calling Atlas.
  --resume-existing-report <path>      Poll the existing report's active audio prediction without submitting a new Atlas job.
  --resume-prediction-id <id>          Poll an existing Atlas audio prediction without submitting a new Atlas job.
  --confirm-provider-spend             Required before any Atlas generated-audio provider execution can be attempted.
  --confirm-audio-schema-reviewed      Required before docs-derived Atlas audio schema can count as business evidence.
  --confirm-manual-audio-review        Operator confirms the supplied manual-review evidence was created after listening.
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
  if (options.reviewExistingReportPath) {
    return reviewExistingReport(options);
  }

  const intent = buildIntent(options);
  const costEstimate = estimatedAudioCost(options);
  const atlasBillingGate = summarizeAtlasBillingGate(options, costEstimate);
  const resolvedResumePredictionId = resolveResumePredictionId(options);
  if (!options.resumePredictionId && resolvedResumePredictionId) {
    options.resumePredictionId = resolvedResumePredictionId;
  }
  const inputChecks = [
    pass("validation_text", "Generated-audio validation text is bounded."),
    pass("output_report_path", "Output report path is JSON."),
    pass("audio_output_format", "Requested generated-audio output format is supported by CineJelly validators."),
    costEstimate <= options.maxCostUsd
      ? pass("estimated_cost_budget", `Estimated audio validation cost ${formatUsd(costEstimate)} is within maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
      : fail("estimated_cost_budget", `Estimated audio validation cost ${formatUsd(costEstimate)} exceeds maxCostUsd ${formatUsd(options.maxCostUsd)}.`),
    ...(options.resumeExistingReportPath || options.resumePredictionId
      ? [
          resolvedResumePredictionId
            ? pass("resume_prediction_id", "Existing Atlas generated-audio prediction id is available for resume polling.")
            : fail("resume_prediction_id", "Resume mode requires --resume-prediction-id or an existing report with a provider ledger predictionId.")
        ]
      : []),
    ...atlasBillingGate.checks
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
      atlasBillingGate,
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
      atlasBillingGate,
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
        : preExecutionFailures.some((check) => check.name.startsWith("atlas_billing_"))
          ? "blocked_by_atlas_billing"
        : "blocked_by_configuration",
      checks,
      costEstimate,
      spendGate: spendGate(options, costEstimate, false),
      atlasBillingGate,
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
  const liveManualAudioReview = readManualAudioReview(options, {
    checkedInputs: {
      modelId: options.modelId,
      language: options.language,
      voiceId: options.voiceId,
      outputFormat: options.outputFormat
    },
    executionRun: liveEvidence.executionRun,
    outputBatchValidation: liveEvidence.outputBatchValidation,
    providerLedger: liveEvidence.providerLedger
  });
  const checks = [
    ...inputChecks,
    ...planningEvidence.checks,
    ...liveEvidence.checks,
    liveManualAudioReview.passed
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
    atlasBillingGate,
    schemaGate: schemaGate(options),
    runtimeSettings: planningEvidence.runtimeSettings,
    planning: summarizePlan(planningEvidence.plan),
    executionRun: liveEvidence.executionRun,
    outputBatchValidation: liveEvidence.outputBatchValidation,
    providerLedger: liveEvidence.providerLedger,
    manualAudioReview: liveManualAudioReview,
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
  if (!Number.isFinite(options.atlasBillingEvidenceMaxAgeHours) || options.atlasBillingEvidenceMaxAgeHours <= 0) {
    throw new Error("--atlas-billing-evidence-max-age-hours must be a positive number.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 30_000 || options.timeoutMs > 1_800_000) {
    throw new Error("--timeout-ms must be an integer between 30000 and 1800000.");
  }
  if (options.resumePredictionId !== undefined) {
    if (typeof options.resumePredictionId !== "string" || !/^[A-Za-z0-9_-]{6,160}$/.test(options.resumePredictionId)) {
      throw new Error("--resume-prediction-id must be a prediction id containing only letters, digits, underscore, or hyphen.");
    }
  }
  if (options.resumeExistingReportPath !== undefined && extname(options.resumeExistingReportPath).toLowerCase() !== ".json") {
    throw new Error("--resume-existing-report must point to a JSON file.");
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
  const resumePredictionId = resolveResumePredictionId(options);
  const audioProvider = resumePredictionId
    ? {
        name: provider.name,
        audioCapabilities: (modelId) => provider.audioCapabilities(modelId),
        generateAudio: (request, signal) => provider.resumeAudioPrediction(request, resumePredictionId, signal)
      }
    : provider;
  const runner = new GeneratedAudioProviderExecutionRunner();
  const validator = new GeneratedAudioOutputBatchValidator();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Atlas generated-audio validation timed out.")), options.timeoutMs);

  try {
    const run = await runner.run({
      executionPlan: plan,
      audioProvider,
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

function resolveResumePredictionId(options) {
  if (options.resumePredictionId) {
    return options.resumePredictionId;
  }
  if (!options.resumeExistingReportPath) {
    return undefined;
  }
  const report = readJsonIfExists(options.resumeExistingReportPath);
  const ledgerEntries = Array.isArray(report?.providerLedger?.entries) ? report.providerLedger.entries : [];
  const activeEntry = [...ledgerEntries].reverse().find((entry) =>
    typeof entry?.predictionId === "string" &&
    entry.predictionId.trim() &&
    ["running", "queued"].includes(String(entry.providerStatus ?? ""))
  );
  const fallbackEntry = [...ledgerEntries].reverse().find((entry) =>
    typeof entry?.predictionId === "string" && entry.predictionId.trim()
  );
  return activeEntry?.predictionId ?? fallbackEntry?.predictionId;
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

function readManualAudioReview(options, sourceReport) {
  if (!options.manualAudioReviewPath) {
    return {
      present: false,
      passed: false,
      confirmManualAudioReview: options.confirmManualAudioReview,
      source: options.confirmManualAudioReview ? "operator_flag_without_evidence" : undefined,
      message: options.confirmManualAudioReview
        ? "--confirm-manual-audio-review requires --manual-audio-review evidence before generated-audio review can pass."
        : "No manual generated-audio review evidence was supplied."
    };
  }
  const absolutePath = resolve(repoRoot, options.manualAudioReviewPath);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      passed: false,
      path: toRepoRelative(options.manualAudioReviewPath),
      confirmManualAudioReview: options.confirmManualAudioReview,
      message: "Manual generated-audio review file does not exist."
    };
  }
  const text = readFileSync(absolutePath, "utf8");
  const parsed = parseManualAudioReviewJson(text);
  if (parsed) {
    return evaluateStructuredManualAudioReview({
      options,
      review: parsed,
      path: options.manualAudioReviewPath,
      sourceReport
    });
  }
  const normalized = text.toLowerCase();
  const passed =
    options.confirmManualAudioReview === true &&
    !normalized.includes("needs_review") &&
    !normalized.includes("templateonly") &&
    !normalized.includes("template only") &&
    (normalized.includes("manual audio review passes") ||
      normalized.includes("generated-audio review passed"));
  return {
    present: true,
    path: toRepoRelative(options.manualAudioReviewPath),
    source: "legacy_text_note",
    evidenceType: "legacy_text_note",
    confirmManualAudioReview: options.confirmManualAudioReview,
    passed,
    message: passed
      ? "Manual generated-audio review file contains a pass decision."
      : options.confirmManualAudioReview
        ? "Manual generated-audio review file does not contain a clear pass decision."
        : "--confirm-manual-audio-review is required with manual review evidence before generated-audio review can pass."
  };
}

function reviewExistingReport(options) {
  const existing = readJsonIfExists(options.reviewExistingReportPath);
  const manualAudioReview = readManualAudioReview(options, existing);
  const baseChecks = Array.isArray(existing?.checks)
    ? existing.checks.filter((check) => check?.name !== "manual_audio_review").map((check) => ({
        name: String(check.name ?? "unknown"),
        status: check.status === "warn" ? "warn" : check.status === "pass" ? "pass" : "fail",
        message: String(check.message ?? "")
      }))
    : [];
  const reviewChecks = [
    existing?.schemaVersion === "cinejelly.generated-audio-validation.v1"
      ? pass("review_existing_report_schema", "Existing generated-audio report schema is recognized.")
      : fail("review_existing_report_schema", `Existing generated-audio report is missing or has unrecognized schema at ${toRepoRelative(options.reviewExistingReportPath)}.`),
    existing?.spendGate?.providerNetworkCallsAllowed === true
      ? pass("review_existing_provider_spend", "Existing generated-audio report contains provider-spend evidence.")
      : fail("review_existing_provider_spend", "Existing generated-audio report does not contain provider-spend evidence."),
    existing?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true
      ? pass("review_existing_atlas_billing_gate", "Existing generated-audio report passed its Atlas billing gate.")
      : fail("review_existing_atlas_billing_gate", "Existing generated-audio report did not pass its Atlas billing gate."),
    existing?.schemaGate?.confirmAudioSchemaReviewed === true
      ? pass("review_existing_schema_gate", "Existing generated-audio report had schema review confirmation.")
      : fail("review_existing_schema_gate", "Existing generated-audio report did not have schema review confirmation."),
    existing?.executionRun?.status === "succeeded"
      ? pass("review_existing_execution", "Existing generated-audio provider execution succeeded.")
      : fail("review_existing_execution", `Existing generated-audio execution status is ${existing?.executionRun?.status ?? "missing"}.`),
    existing?.outputBatchValidation?.status === "approved" && Number(existing?.outputBatchValidation?.approvedTrackCount ?? 0) > 0
      ? pass("review_existing_output_batch", "Existing generated-audio output batch validation approved at least one track.")
      : fail("review_existing_output_batch", `Existing generated-audio output batch validation status is ${existing?.outputBatchValidation?.status ?? "missing"}.`),
    Number(existing?.providerLedger?.entryCount ?? 0) > 0
      ? pass("review_existing_provider_ledger", "Existing generated-audio report contains provider ledger evidence.")
      : fail("review_existing_provider_ledger", "Existing generated-audio report does not contain provider ledger evidence."),
    manualAudioReview.passed
      ? pass("manual_audio_review", "Operator manual generated-audio review passed.")
      : fail("manual_audio_review", "Manual generated-audio review is required before this evidence can count for business readiness.")
  ];
  const checks = [...baseChecks, ...reviewChecks];
  const status = statusForChecks(checks);
  const canUseAsBusinessReadinessGeneratedAudioEvidence =
    status === "pass" &&
    existing?.spendGate?.providerNetworkCallsAllowed === true &&
    existing?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true &&
    existing?.schemaGate?.confirmAudioSchemaReviewed === true &&
    existing?.executionRun?.status === "succeeded" &&
    existing?.outputBatchValidation?.status === "approved" &&
    Number(existing?.outputBatchValidation?.approvedTrackCount ?? 0) > 0 &&
    Number(existing?.providerLedger?.entryCount ?? 0) > 0 &&
    manualAudioReview.passed === true;
  const report = {
    schemaVersion: "cinejelly.generated-audio-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins: Array.isArray(existing?.sourcePatternOrigins) ? existing.sourcePatternOrigins : sourcePatternOrigins,
    checkedInputs: {
      modelId: existing?.checkedInputs?.modelId ?? options.modelId,
      textCharacterCount: existing?.checkedInputs?.textCharacterCount ?? options.text.length,
      language: existing?.checkedInputs?.language ?? options.language,
      voiceId: existing?.checkedInputs?.voiceId ?? options.voiceId,
      outputFormat: existing?.checkedInputs?.outputFormat ?? options.outputFormat,
      durationSeconds: existing?.checkedInputs?.durationSeconds ?? options.durationSeconds,
      estimatedCostUsd: existing?.checkedInputs?.estimatedCostUsd ?? estimatedAudioCost(options),
      reviewExistingReportPath: toRepoRelative(options.reviewExistingReportPath),
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate: existing?.spendGate ?? spendGate(options, 0, false),
    atlasBillingGate: existing?.atlasBillingGate ?? {
      path: toRepoRelative(options.atlasBillingReportPath),
      present: false,
      status: "missing",
      currentEstimatedCostUsd: 0,
      currentMaxCostUsd: options.maxCostUsd,
      maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
      canUseAsPrePaidAtlasBillingEvidence: false
    },
    schemaGate: existing?.schemaGate ?? schemaGate(options),
    checks,
    runtimeSettings: existing?.runtimeSettings ?? {
      apiKeyConfigured: false,
      llmApiKeyConfigured: false,
      generatedAudioCapabilityCount: 0,
      generatedAudioCapabilities: []
    },
    planning: existing?.planning ?? {
      status: "missing",
      intentCount: 0,
      readyCount: 0,
      blockedCount: 0,
      outputFormat: options.outputFormat,
      items: []
    },
    executionRun: existing?.executionRun ?? emptyExecutionRun(),
    outputBatchValidation: existing?.outputBatchValidation ?? emptyOutputBatchValidation(),
    providerLedger: existing?.providerLedger ?? emptyLedgerSummary(),
    manualAudioReview: {
      ...manualAudioReview,
      source: manualAudioReview.source ? `review_existing_report:${manualAudioReview.source}` : "review_existing_report"
    },
    releaseGateSummary: {
      canUseAsBusinessReadinessGeneratedAudioEvidence,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: canUseAsBusinessReadinessGeneratedAudioEvidence
        ? "Generated-audio evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
        : "Atlas generated-audio evidence is incomplete."
    },
    nextActions: nextActionsFor(status, checks)
  };
  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function parseManualAudioReviewJson(text) {
  try {
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (!trimmed.startsWith("{")) {
      return undefined;
    }
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function evaluateStructuredManualAudioReview({ options, review, path, sourceReport }) {
  const requiredCheckNames = [
    "listenedFullOutput",
    "outputIsAudible",
    "languageMatchesRequest",
    "narrationMatchesValidationText",
    "noObviousArtifacts",
    "noCredentialLeak",
    "safeForBusinessEvidence"
  ];
  const checks = review.checks && typeof review.checks === "object" && !Array.isArray(review.checks)
    ? review.checks
    : {};
  const passedCheckCount = requiredCheckNames.filter((name) => checks[name] === true).length;
  const binding = compareGeneratedAudioManualReviewBinding(review, sourceReport);
  const artifactEvidence = compareGeneratedAudioManualReviewArtifactEvidence(review);
  const issues = [];
  if (review.schemaVersion !== "cinejelly.generated-audio-manual-review.v1") {
    issues.push("schemaVersion must be cinejelly.generated-audio-manual-review.v1.");
  }
  if (!["manual", "approved_analyzer"].includes(review.reviewerType)) {
    issues.push("reviewerType must be manual or approved_analyzer.");
  }
  if (review.status !== "accepted") {
    issues.push("status must be accepted.");
  }
  if (review.decision !== "pass") {
    issues.push("decision must be pass.");
  }
  if (options.confirmManualAudioReview !== true) {
    issues.push("--confirm-manual-audio-review is required.");
  }
  if (review.redactionReviewed !== true) {
    issues.push("redactionReviewed must be true.");
  }
  if (passedCheckCount !== requiredCheckNames.length) {
    issues.push("all required audio-review checks must be true.");
  }
  if (!binding.matches) {
    issues.push(binding.message);
  }
  if (!artifactEvidence.matches) {
    issues.push(artifactEvidence.message);
  }
  return {
    present: true,
    path: toRepoRelative(path),
    source: "structured_json",
    evidenceType: "structured_json",
    confirmManualAudioReview: options.confirmManualAudioReview,
    passed: issues.length === 0,
    schemaVersion: typeof review.schemaVersion === "string" ? review.schemaVersion : undefined,
    status: typeof review.status === "string" ? review.status : undefined,
    decision: typeof review.decision === "string" ? review.decision : undefined,
    reviewerType: typeof review.reviewerType === "string" ? review.reviewerType : undefined,
    reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : undefined,
    requiredCheckCount: requiredCheckNames.length,
    passedCheckCount,
    artifactBindingChecked: binding.checked,
    artifactBindingMatchesReport: binding.matches,
    artifactEvidenceChecked: artifactEvidence.checked,
    artifactEvidenceMatchesReport: artifactEvidence.matches,
    artifactEvidenceReportPath: artifactEvidence.reportPath,
    mediaSha256: artifactEvidence.mediaSha256,
    message: issues.length === 0
      ? "Structured manual generated-audio review evidence passed."
      : `Structured manual generated-audio review evidence is incomplete: ${issues.join(" ")}`
  };
}

function compareGeneratedAudioManualReviewBinding(review, sourceReport) {
  if (!sourceReport) {
    return {
      checked: false,
      matches: true,
      message: "No generated-audio report was available for binding comparison."
    };
  }
  const binding = review.artifactBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return {
      checked: true,
      matches: false,
      message: "artifactBinding is required for review-existing-report manual evidence."
    };
  }
  const expected = generatedAudioBindingFromReport(sourceReport);
  const missingOrMismatched = Object.entries(expected)
    .filter(([, expectedValue]) => typeof expectedValue === "string" && expectedValue.trim())
    .filter(([key, expectedValue]) => binding[key] !== expectedValue)
    .map(([key]) => key);
  return {
    checked: true,
    matches: missingOrMismatched.length === 0,
    message: missingOrMismatched.length === 0
      ? "Manual review artifact binding matches the generated-audio report."
      : `artifactBinding does not match the generated-audio report for: ${missingOrMismatched.join(", ")}.`
  };
}

function compareGeneratedAudioManualReviewArtifactEvidence(review) {
  const evidence = review.artifactEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      checked: true,
      matches: false,
      message: "artifactEvidence is required for structured generated-audio manual review."
    };
  }
  const reportPath = typeof evidence.generatedAudioArtifactEvidenceReportPath === "string"
    ? evidence.generatedAudioArtifactEvidenceReportPath
    : undefined;
  if (!reportPath) {
    return {
      checked: true,
      matches: false,
      message: "artifactEvidence.generatedAudioArtifactEvidenceReportPath is required."
    };
  }
  const report = readJsonIfExists(reportPath);
  if (!report) {
    return {
      checked: true,
      matches: false,
      reportPath: toRepoRelative(reportPath),
      mediaSha256: stringOrUndefined(evidence.mediaSha256),
      message: "Generated-audio artifact evidence report is missing."
    };
  }
  const reportEvidence = report.artifactEvidence;
  const mismatches = [];
  if (report.schemaVersion !== "cinejelly.generated-audio-artifact-evidence.v1") {
    mismatches.push("schemaVersion");
  }
  if (report.status !== "pass" || report.releaseGateSummary?.canUseAsManualReviewArtifactEvidence !== true) {
    mismatches.push("status");
  }
  for (const key of ["artifactPath", "mediaSha256", "byteSize", "durationSeconds", "outputUrlPreview", "predictionId"]) {
    if (reportEvidence?.[key] !== evidence[key]) {
      mismatches.push(key);
    }
  }
  if (review.artifactBinding?.outputUrlPreview !== evidence.outputUrlPreview) {
    mismatches.push("artifactBinding.outputUrlPreview");
  }
  if (review.artifactBinding?.predictionId !== evidence.predictionId) {
    mismatches.push("artifactBinding.predictionId");
  }
  return {
    checked: true,
    matches: mismatches.length === 0,
    reportPath: toRepoRelative(reportPath),
    mediaSha256: stringOrUndefined(evidence.mediaSha256),
    message: mismatches.length === 0
      ? "Manual review artifact evidence matches the generated-audio artifact evidence report."
      : `artifactEvidence does not match the generated-audio artifact evidence report for: ${mismatches.join(", ")}.`
  };
}

function generatedAudioBindingFromReport(report) {
  const result = Array.isArray(report?.executionRun?.results)
    ? report.executionRun.results.find((item) => item?.status === "succeeded") ?? report.executionRun.results[0]
    : undefined;
  const batchReport = Array.isArray(report?.outputBatchValidation?.reports)
    ? report.outputBatchValidation.reports.find((item) => item?.status === "approved") ?? report.outputBatchValidation.reports[0]
    : undefined;
  const ledgerEntry = Array.isArray(report?.providerLedger?.entries)
    ? report.providerLedger.entries.find((item) => item?.operation === "audio.generate") ?? report.providerLedger.entries[0]
    : undefined;
  return {
    modelId: stringOrUndefined(report?.checkedInputs?.modelId),
    language: stringOrUndefined(report?.checkedInputs?.language),
    voiceId: stringOrUndefined(report?.checkedInputs?.voiceId),
    outputFormat: stringOrUndefined(report?.checkedInputs?.outputFormat),
    intentId: stringOrUndefined(result?.intentId ?? batchReport?.intentId),
    providerAssetId: stringOrUndefined(result?.providerAssetId ?? ledgerEntry?.predictionId),
    predictionId: stringOrUndefined(ledgerEntry?.predictionId ?? result?.providerAssetId),
    outputUrlPreview: stringOrUndefined(result?.outputUrlPreview ?? batchReport?.outputUrlPreview)
  };
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function summarizeAtlasBillingGate(options, estimatedCostUsd) {
  const path = toRepoRelative(options.atlasBillingReportPath);
  const report = readJsonIfExists(options.atlasBillingReportPath);
  if (!report) {
    return {
      path,
      present: false,
      status: "missing",
      currentEstimatedCostUsd: estimatedCostUsd,
      currentMaxCostUsd: options.maxCostUsd,
      maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
      canUseAsPrePaidAtlasBillingEvidence: false,
      checks: [
        fail("atlas_billing_report_present", `Missing Atlas billing readiness report for generated-audio validation at ${path}. Run validation:atlas-billing with --planned-cost-usd ${formatNumber(estimatedCostUsd)} before provider spend.`)
      ]
    };
  }

  const reportPlannedCostUsd = numberOrUndefined(report.checkedInputs?.plannedCostUsd ?? report.costPlan?.plannedCostUsd);
  const reportMaxBudgetUsd = numberOrUndefined(report.checkedInputs?.maxBudgetUsd ?? report.costPlan?.maxBudgetUsd);
  const reportGeneratedAt = typeof report.generatedAt === "string" ? report.generatedAt : undefined;
  const generatedAtMs = reportGeneratedAt ? Date.parse(reportGeneratedAt) : Number.NaN;
  const validGeneratedAt = Number.isFinite(generatedAtMs);
  const rawAgeHours = validGeneratedAt ? (Date.now() - generatedAtMs) / 3600000 : undefined;
  const reportAgeHours = typeof rawAgeHours === "number" && Number.isFinite(rawAgeHours) ? Math.max(0, rawAgeHours) : undefined;
  const clockSkewOk = typeof rawAgeHours === "number" && rawAgeHours >= -0.083333;
  const freshForPaidValidation = validGeneratedAt && clockSkewOk && reportAgeHours <= options.atlasBillingEvidenceMaxAgeHours;
  const schemaOk = report.schemaVersion === "cinejelly.atlas-billing-readiness.v1";
  const statusOk = report.status === "pass" && report.releaseGateSummary?.canUseAsPrePaidAtlasBillingEvidence === true;
  const networkOk =
    report.networkCallsMade === true &&
    report.providerCallsMade === false &&
    report.atlasBillingPublicApi?.captured === true &&
    report.atlasBillingPublicApi?.httpStatus === 200;
  const plannedCostMatches = moneyEquals(reportPlannedCostUsd, estimatedCostUsd);
  const budgetCoversMaxCost = typeof reportMaxBudgetUsd === "number" && reportMaxBudgetUsd >= options.maxCostUsd;
  const checks = [
    schemaOk
      ? pass("atlas_billing_report_schema", "Atlas billing readiness report schema is recognized.")
      : fail("atlas_billing_report_schema", "Atlas billing readiness report schemaVersion is missing or unrecognized."),
    freshForPaidValidation
      ? pass("atlas_billing_report_fresh", "Atlas billing readiness report is fresh enough for generated-audio provider spend.")
      : fail("atlas_billing_report_fresh", atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours: options.atlasBillingEvidenceMaxAgeHours, estimatedCostUsd })),
    statusOk
      ? pass("atlas_billing_report_status", "Atlas billing readiness report passed.")
      : fail("atlas_billing_report_status", `Atlas billing readiness report status is ${report.status ?? "missing"}.`),
    networkOk
      ? pass("atlas_billing_report_balance_capture", "Atlas billing readiness report captured a no-spend /balance response.")
      : fail("atlas_billing_report_balance_capture", "Atlas billing readiness report did not capture a successful no-spend /balance response."),
    plannedCostMatches
      ? pass("atlas_billing_planned_cost_matches_audio", `Atlas billing planned cost matches generated-audio estimate ${formatUsd(estimatedCostUsd)}.`)
      : fail("atlas_billing_planned_cost_matches_audio", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} does not match current generated-audio estimate ${formatUsd(estimatedCostUsd)}.`),
    budgetCoversMaxCost
      ? pass("atlas_billing_budget_covers_audio_cap", `Atlas billing approved budget covers generated-audio maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
      : fail("atlas_billing_budget_covers_audio_cap", `Atlas billing approved budget ${formatUsd(reportMaxBudgetUsd)} does not cover generated-audio maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
  ];
  return {
    path,
    present: true,
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    reportGeneratedAt,
    maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
    reportAgeHours,
    freshForPaidValidation,
    reportPlannedCostUsd,
    currentEstimatedCostUsd: estimatedCostUsd,
    plannedCostMatchesCurrentRun: plannedCostMatches,
    reportMaxBudgetUsd,
    currentMaxCostUsd: options.maxCostUsd,
    budgetCoversMaxCost,
    networkCallsMade: report.networkCallsMade === true,
    canUseAsPrePaidAtlasBillingEvidence: checks.every((check) => check.status === "pass"),
    checks
  };
}

function atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours, estimatedCostUsd }) {
  const command = `npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-audio-budget-usd> --planned-cost-usd ${formatNumber(estimatedCostUsd)} --confirm-live-network`;
  if (!validGeneratedAt) {
    return `Atlas billing readiness report is missing a valid generatedAt timestamp. Rerun ${command}.`;
  }
  if (!clockSkewOk) {
    return `Atlas billing readiness report timestamp is in the future (${reportGeneratedAt}). Rerun ${command}.`;
  }
  return `Atlas billing readiness report is too old for generated-audio provider spend: generatedAt ${reportGeneratedAt}, age ${formatHours(reportAgeHours)}, max age ${formatHours(maxAgeHours)}. Rerun ${command}.`;
}

function buildReport({
  options,
  intent,
  status,
  checks,
  costEstimate,
  spendGate,
  atlasBillingGate,
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
    atlasBillingGate.canUseAsPrePaidAtlasBillingEvidence === true &&
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
      ...(options.resumeExistingReportPath ? { resumeExistingReportPath: toRepoRelative(options.resumeExistingReportPath) } : {}),
      ...(resolveResumePredictionId(options) ? { resumePredictionId: resolveResumePredictionId(options) } : {}),
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate,
    atlasBillingGate: stripAtlasBillingGateChecks(atlasBillingGate),
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
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "0.000000";
}

function formatHours(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}h` : "unavailable";
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moneyEquals(left, right) {
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 0.000001;
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

function stripAtlasBillingGateChecks(gate) {
  const { checks, ...summary } = gate;
  return summary;
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
      Object.entries(value).map(([key, item]) => {
        const redacted = redactUnknown(item);
        return [key, secretKeyPattern.test(key) && typeof redacted === "string" ? "[REDACTED]" : redacted];
      })
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
