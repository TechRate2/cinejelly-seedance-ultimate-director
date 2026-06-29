import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/source-video-validation-report.json",
  workDirectory: "assets/output_deliverables/business-readiness/source-video-analysis-work",
  atlasBillingReportPath: "assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json",
  atlasBillingEvidenceMaxAgeHours: Number(process.env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS || "24"),
  sourceReferenceLabel: "source-video-validation",
  userInput:
    "Create an original commercial video using the supplied source video only as structural pacing and camera-grammar guidance.",
  timeoutMs: 600_000
};

const sourcePatternOrigins = [
  "HKUDS/VideoAgent",
  "calesthio/OpenMontage",
  "HKUDS/ViMax",
  "Atlas Cloud LLM docs"
];

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi
];
const secretQueryTextPattern = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|authorization|auth)/i;
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

function parseArgs(args) {
  const options = {
    outputPath: defaults.outputPath,
    workDirectory: defaults.workDirectory,
    atlasBillingReportPath: defaults.atlasBillingReportPath,
    atlasBillingEvidenceMaxAgeHours: defaults.atlasBillingEvidenceMaxAgeHours,
    sourceReferenceLabel: defaults.sourceReferenceLabel,
    userInput: defaults.userInput,
    timeoutMs: defaults.timeoutMs,
    writeReport: true,
    confirmProviderSpend: false,
    allowWarnings: false
  };

  const flagMap = new Map([
    ["--source-video-url", "sourceVideoUrl"],
    ["--request", "requestPath"],
    ["--user-input", "userInput"],
    ["--source-reference-label", "sourceReferenceLabel"],
    ["--work-directory", "workDirectory"],
    ["--frame-interval-seconds", "frameIntervalSeconds"],
    ["--max-frames", "maxFrames"],
    ["--max-cost-usd", "maxCostUsd"],
    ["--atlas-billing-report", "atlasBillingReportPath"],
    ["--atlas-billing-evidence-max-age-hours", "atlasBillingEvidenceMaxAgeHours"],
    ["--timeout-ms", "timeoutMs"],
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
    if (arg === "--allow-warnings") {
      options.allowWarnings = true;
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
      const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = numericOption(key) ? Number(value) : value;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return ["frameIntervalSeconds", "maxFrames", "maxCostUsd", "atlasBillingEvidenceMaxAgeHours", "timeoutMs"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Run live source-video auto-analysis validation with an explicit provider-spend gate.

Usage:
  npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://example.com/source.mp4
  npm.cmd run validation:source-video-auto-analysis -- --request assets/output_deliverables/business-readiness/source-video-request.json --confirm-provider-spend --max-cost-usd <approved-source-video-budget-usd>

Options:
  --source-video-url <url>             Clean HTTPS source video URL for validation.
  --request <path>                     Operator-owned request JSON containing a source_video_structure reference.
  --user-input <text>                  User prompt when --request is not supplied.
  --source-reference-label <label>     Reference label when --request is not supplied. Default: ${defaults.sourceReferenceLabel}
  --work-directory <path>              Frame sampling work directory. Default: ${defaults.workDirectory}
  --frame-interval-seconds <seconds>   Override source-video frame interval.
  --max-frames <count>                 Override max sampled frames.
  --max-cost-usd <amount>              Required in paid mode; approved source-video LLM budget cap.
  --atlas-billing-report <path>        Source-video billing readiness report. Default: ${defaults.atlasBillingReportPath}
  --atlas-billing-evidence-max-age-hours <hours>
                                       Maximum age for Atlas billing readiness evidence. Default: ${defaults.atlasBillingEvidenceMaxAgeHours}
  --timeout-ms <ms>                    Abort live validation after this many ms. Default: ${defaults.timeoutMs}
  --confirm-provider-spend             Required before FFmpeg fetches the URL or Atlas LLM is called.
  --allow-warnings                     Continue from readiness warnings after operator acceptance.
  --output <path>                      JSON report path. Default: ${defaults.outputPath}
  --no-output                          Print only; do not write the report.

Without --confirm-provider-spend this command validates inputs and writes a blocked_by_spend_confirmation report without calling Atlas, FFmpeg frame extraction, or the source video URL.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const requestEvidence = buildRequestEvidence(options);
  const initialChecks = [
    pass("request.user_input", "Validation request has bounded user input."),
    pass("source_video_reference", "Validation request includes a clean HTTPS source_video_structure reference."),
    pass("output_report_path", "Output report path is JSON."),
    pass("frame_sampling_bounds", "Frame sampling bounds are positive when configured.")
  ];

  if (!options.confirmProviderSpend) {
    const atlasBillingGate = skippedAtlasBillingGate(options);
    const report = buildReport({
      options,
      requestEvidence,
      status: "blocked_by_spend_confirmation",
      checks: [
        ...initialChecks,
        fail("spend_confirmation", "--confirm-provider-spend is required before FFmpeg source fetch or Atlas LLM calls.")
      ],
      spendGate: {
        confirmProviderSpend: false,
        providerNetworkCallsAllowed: false,
        sourceVideoFetchAllowed: false
      },
      atlasBillingGate,
      analysisSummary: emptyAnalysisSummary(requestEvidence.sourceReferenceLabel),
      providerLedger: summarizeLedger([])
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const atlasBillingGate = summarizeAtlasBillingGate(options);
  if (atlasBillingGate.checks.some((check) => check.status === "fail")) {
    const report = buildReport({
      options,
      requestEvidence,
      status: "blocked_by_atlas_billing",
      checks: [...initialChecks, ...atlasBillingGate.checks],
      spendGate: {
        confirmProviderSpend: true,
        providerNetworkCallsAllowed: false,
        sourceVideoFetchAllowed: false
      },
      atlasBillingGate,
      analysisSummary: emptyAnalysisSummary(requestEvidence.sourceReferenceLabel),
      providerLedger: summarizeLedger([])
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const readinessEvidence = await buildReadinessEvidence(options);
  const readinessChecks = checksForReadiness(readinessEvidence.readiness, options.allowWarnings);
  if (readinessChecks.some((check) => check.status === "fail")) {
    const report = buildReport({
      options,
      requestEvidence,
      status: "blocked_by_readiness",
      checks: [...initialChecks, ...readinessChecks],
      spendGate: {
        confirmProviderSpend: true,
        providerNetworkCallsAllowed: false,
        sourceVideoFetchAllowed: false
      },
      atlasBillingGate,
      readiness: readinessEvidence.summary,
      analysisSummary: emptyAnalysisSummary(requestEvidence.sourceReferenceLabel),
      providerLedger: summarizeLedger([])
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const liveEvidence = await runLiveAnalysis({
    options,
    request: requestEvidence.request,
    runtimeSettings: readinessEvidence.runtimeSettings
  });
  const checks = [
    ...initialChecks,
    ...atlasBillingGate.checks,
    ...readinessChecks,
    ...liveEvidence.checks
  ];
  const status = statusForChecks(checks);
  const report = buildReport({
    options,
    requestEvidence,
    status,
    checks,
    spendGate: {
      confirmProviderSpend: true,
      providerNetworkCallsAllowed: true,
      sourceVideoFetchAllowed: true
    },
    atlasBillingGate,
    readiness: readinessEvidence.summary,
    frameSampling: liveEvidence.frameSampling,
    analysisSummary: liveEvidence.analysisSummary,
    providerLedger: liveEvidence.providerLedger,
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
  if (options.requestPath && options.sourceVideoUrl) {
    throw new Error("Use either --request or --source-video-url, not both.");
  }
  if (!options.requestPath && !options.sourceVideoUrl) {
    throw new Error("Either --request or --source-video-url is required.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 30_000 || options.timeoutMs > 3_600_000) {
    throw new Error("--timeout-ms must be an integer between 30000 and 3600000.");
  }
  if (options.frameIntervalSeconds !== undefined && !isPositiveInteger(options.frameIntervalSeconds)) {
    throw new Error("--frame-interval-seconds must be a positive integer.");
  }
  if (options.maxFrames !== undefined && !isPositiveInteger(options.maxFrames)) {
    throw new Error("--max-frames must be a positive integer.");
  }
  if (options.maxCostUsd !== undefined && (!Number.isFinite(options.maxCostUsd) || options.maxCostUsd <= 0 || options.maxCostUsd > 25)) {
    throw new Error("--max-cost-usd must be a positive number up to 25.");
  }
  if (!Number.isFinite(options.atlasBillingEvidenceMaxAgeHours) || options.atlasBillingEvidenceMaxAgeHours <= 0) {
    throw new Error("--atlas-billing-evidence-max-age-hours must be a positive number.");
  }
}

function buildRequestEvidence(options) {
  const request = options.requestPath ? readRequest(options.requestPath) : requestFromSourceUrl(options);
  const sourceReference = sourceVideoReference(request);
  if (!sourceReference) {
    throw new Error("Validation request must include a source_video_structure reference.");
  }
  if (typeof sourceReference.label !== "string" || !sourceReference.label.trim()) {
    throw new Error("source_video_structure reference must include a non-empty label.");
  }
  if (sourceReference.providerReference?.kind !== "video") {
    throw new Error("source_video_structure reference providerReference.kind must be video.");
  }
  const sourceVideoUrl = cleanHttpsUrl(sourceReference.providerReference?.uri, "source_video_structure reference URI");
  if (typeof request.userInput !== "string" || !request.userInput.trim()) {
    throw new Error("Validation request userInput must be a non-empty string.");
  }
  return {
    request,
    sourceReferenceLabel: sourceReference.label,
    sourceVideoUrl,
    sourceVideoUrlPreview: safeUrlPreview(sourceVideoUrl),
    requestPath: options.requestPath ? toRepoRelative(options.requestPath) : undefined
  };
}

function readRequest(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Request file does not exist: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request file must contain a JSON object.");
  }
  return parsed;
}

function requestFromSourceUrl(options) {
  const sourceVideoUrl = cleanHttpsUrl(options.sourceVideoUrl, "--source-video-url");
  return {
    userInput: options.userInput,
    references: [
      {
        role: "source_video_structure",
        label: options.sourceReferenceLabel,
        priority: "primary",
        providerReference: {
          kind: "video",
          uri: sourceVideoUrl
        }
      }
    ]
  };
}

function sourceVideoReference(request) {
  const references = Array.isArray(request.references) ? request.references : [];
  return references.find((reference) => reference?.role === "source_video_structure");
}

async function buildReadinessEvidence(options) {
  const [
    { RuntimePreflight },
    { Phase6ValidationReadinessReporter },
    { loadRuntimeSettings }
  ] = await Promise.all([
    import("../dist/application/runtime-preflight.js"),
    import("../dist/application/validation-readiness-report.js"),
    import("../dist/config/runtime-config.js")
  ]);
  const preflight = await new RuntimePreflight(process.env).run();
  const readiness = new Phase6ValidationReadinessReporter().build(preflight);
  const runtimeSettings = loadRuntimeSettings(process.env);
  return {
    readiness,
    runtimeSettings,
    summary: {
      decision: readiness.decision,
      preflightStatus: readiness.preflightStatus,
      checkCounts: readiness.checkCounts,
      hardBlockers: readiness.hardBlockers,
      warnings: readiness.warnings,
      allowWarnings: options.allowWarnings
    }
  };
}

function checksForReadiness(readiness, allowWarnings) {
  if (readiness.decision === "blocked") {
    return [fail("validation_readiness", `Readiness is blocked by: ${readiness.hardBlockers.join(", ") || "unknown"}.`)];
  }
  if (readiness.decision === "review_warnings" && !allowWarnings) {
    return [
      fail(
        "validation_readiness",
        `Readiness has warnings (${readiness.warnings.join(", ") || "unknown"}); rerun with --allow-warnings after operator acceptance.`
      )
    ];
  }
  if (readiness.decision === "review_warnings") {
    return [warn("validation_readiness", "Readiness warnings were explicitly allowed for this source-video validation.")];
  }
  return [pass("validation_readiness", "Readiness is ready_for_paid_validation.")];
}

async function runLiveAnalysis({ options, request, runtimeSettings }) {
  const [
    { SourceVideoAutoAnalyzer },
    { AtlasCloudProvider },
    { ProviderCostLedger }
  ] = await Promise.all([
    import("../dist/core/source-video-auto-analyzer.js"),
    import("../dist/providers/atlascloud/atlas-cloud-provider.js"),
    import("../dist/providers/cost-ledger.js")
  ]);

  const ledger = new ProviderCostLedger();
  const provider = new AtlasCloudProvider(runtimeSettings.atlasCloud, ledger);
  const analyzer = new SourceVideoAutoAnalyzer({
    llmProvider: provider,
    defaultModelId: runtimeSettings.atlasCloud.models.llmModel
  });
  const sourceSettings = runtimeSettings.sourceVideoAutoAnalysis;
  const frameSampling = {
    workDirectory: options.workDirectory || sourceSettings.workDirectory,
    frameIntervalSeconds: options.frameIntervalSeconds ?? sourceSettings.frameIntervalSeconds,
    maxFrames: options.maxFrames ?? sourceSettings.maxFrames,
    failOnError: true
  };
  mkdirSync(resolve(repoRoot, frameSampling.workDirectory), { recursive: true });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Source-video auto-analysis validation timed out.")), options.timeoutMs);
  try {
    const prepared = await analyzer.prepareRequest(
      request,
      {
        enabled: true,
        workDirectory: frameSampling.workDirectory,
        frameIntervalSeconds: frameSampling.frameIntervalSeconds,
        maxFrames: frameSampling.maxFrames,
        failOnError: true
      },
      controller.signal
    );
    const analysisSummary = summarizeAnalysis(prepared.sourceVideoAnalysis, frameSampling.workDirectory);
    const checks = checksForAnalysis(analysisSummary);
    return {
      checks,
      frameSampling,
      analysisSummary,
      providerLedger: summarizeLedger(ledger.list())
    };
  } catch (error) {
    return {
      checks: [fail("source_video_auto_analysis", redactText(error instanceof Error ? error.message : String(error)))],
      frameSampling,
      analysisSummary: emptyAnalysisSummary(sourceVideoReference(request)?.label),
      providerLedger: summarizeLedger(ledger.list()),
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checksForAnalysis(summary) {
  const checks = [];
  checks.push(
    summary.present
      ? pass("analysis.present", "Source-video auto-analysis returned normalized structure.")
      : fail("analysis.present", "Source-video auto-analysis did not return sourceVideoAnalysis.")
  );
  checks.push(
    summary.usableContent
      ? pass("analysis.usable_content", "Analysis includes usable scenes, transcript, notes, or transformation intent.")
      : fail("analysis.usable_content", "Analysis has no usable structural content.")
  );
  checks.push(
    summary.noInlineFrameData
      ? pass("analysis.no_inline_frame_data", "Analysis does not include inline frame data.")
      : fail("analysis.no_inline_frame_data", "Analysis includes inline frame data.")
  );
  checks.push(
    summary.noLocalFramePaths
      ? pass("analysis.no_local_frame_paths", "Analysis does not include local frame paths.")
      : fail("analysis.no_local_frame_paths", "Analysis includes local frame paths.")
  );
  return checks;
}

function summarizeAnalysis(analysis, workDirectory) {
  if (!analysis || typeof analysis !== "object") {
    return emptyAnalysisSummary(undefined);
  }
  const scenes = Array.isArray(analysis.scenes) ? analysis.scenes : [];
  const transcript = Array.isArray(analysis.transcript) ? analysis.transcript : [];
  const pacingNotes = Array.isArray(analysis.pacingNotes) ? analysis.pacingNotes : [];
  const styleNotes = Array.isArray(analysis.styleNotes) ? analysis.styleNotes : [];
  const structuralBeats = Array.isArray(analysis.structuralBeats) ? analysis.structuralBeats : [];
  const safetyNotes = Array.isArray(analysis.safetyNotes) ? analysis.safetyNotes : [];
  const keyframeCount = scenes.reduce((sum, scene) => sum + (Array.isArray(scene?.keyframes) ? scene.keyframes.length : 0), 0);
  const serialized = JSON.stringify(analysis);
  const normalizedSerialized = serialized.toLowerCase();
  const normalizedWorkDirectory = String(workDirectory ?? "").toLowerCase();
  const noInlineFrameData = !normalizedSerialized.includes("data:image") && !normalizedSerialized.includes(";base64,");
  const noLocalFramePaths = !normalizedWorkDirectory || !normalizedSerialized.includes(normalizedWorkDirectory);
  const usableContent = Boolean(
    analysis.transformationIntent ||
      scenes.length ||
      transcript.length ||
      pacingNotes.length ||
      styleNotes.length ||
      structuralBeats.length ||
      safetyNotes.length
  );
  return {
    present: true,
    sourceReferenceLabel: analysis.sourceReferenceLabel,
    hasTransformationIntent: Boolean(analysis.transformationIntent),
    transcriptCueCount: transcript.length,
    sceneCount: scenes.length,
    keyframeCount,
    pacingNoteCount: pacingNotes.length,
    styleNoteCount: styleNotes.length,
    structuralBeatCount: structuralBeats.length,
    safetyNoteCount: safetyNotes.length,
    usableContent,
    noInlineFrameData,
    noLocalFramePaths
  };
}

function emptyAnalysisSummary(sourceReferenceLabel) {
  return {
    present: false,
    ...(sourceReferenceLabel ? { sourceReferenceLabel } : {}),
    hasTransformationIntent: false,
    transcriptCueCount: 0,
    sceneCount: 0,
    keyframeCount: 0,
    pacingNoteCount: 0,
    styleNoteCount: 0,
    structuralBeatCount: 0,
    safetyNoteCount: 0,
    usableContent: false,
    noInlineFrameData: true,
    noLocalFramePaths: true
  };
}

function summarizeLedger(entries) {
  const operations = countBy(entries.map((entry) => entry.operation ?? "unknown"));
  const statuses = countBy(entries.map((entry) => entry.status ?? "unknown"));
  return {
    entryCount: entries.length,
    operations,
    statuses,
    estimatedCostUsd: sumOptional(entries.map((entry) => entry.estimatedCostUsd)),
    actualCostUsd: sumOptional(entries.map((entry) => entry.actualCostUsd)),
    entries: entries.map((entry) => ({
      provider: entry.provider,
      operation: entry.operation,
      status: entry.status,
      ...(entry.modelId ? { modelId: entry.modelId } : {}),
      ...(entry.latencyMs !== undefined ? { latencyMs: entry.latencyMs } : {}),
      ...(entry.retryCount !== undefined ? { retryCount: entry.retryCount } : {}),
      ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      ...(entry.retryable !== undefined ? { retryable: entry.retryable } : {})
    }))
  };
}

function buildReport({
  options,
  requestEvidence,
  status,
  checks,
  spendGate,
  atlasBillingGate,
  readiness,
  frameSampling,
  analysisSummary,
  providerLedger,
  error
}) {
  return {
    schemaVersion: "cinejelly.source-video-auto-analysis-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins,
    checkedInputs: {
      requestPath: requestEvidence.requestPath,
      sourceReferenceLabel: requestEvidence.sourceReferenceLabel,
      sourceVideoUrl: requestEvidence.sourceVideoUrlPreview,
      atlasBillingReportPath: toRepoRelative(options.atlasBillingReportPath),
      ...(options.maxCostUsd !== undefined ? { maxCostUsd: options.maxCostUsd } : {}),
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate,
    atlasBillingGate: stripAtlasBillingGateChecks(atlasBillingGate),
    checks,
    ...(readiness ? { readiness } : {}),
    frameSampling: frameSampling ?? {
      workDirectory: toRepoRelative(options.workDirectory),
      frameIntervalSeconds: options.frameIntervalSeconds,
      maxFrames: options.maxFrames,
      failOnError: true
    },
    analysisSummary,
    providerLedger,
    ...(error ? { error } : {}),
    releaseGateSummary: {
      canUseAsBusinessReadinessSourceVideoEvidence:
        status === "pass" &&
        analysisSummary?.present === true &&
        spendGate.providerNetworkCallsAllowed === true &&
        atlasBillingGate.canUseAsPrePaidAtlasBillingEvidence === true,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker:
        status === "pass"
          ? "Source-video auto-analysis evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
          : "Live source-video auto-analysis evidence is incomplete."
    },
    nextActions: nextActionsFor(status, checks)
  };
}

function nextActionsFor(status, checks) {
  if (status === "pass") {
    return [
      "Archive this source-video auto-analysis validation report with business-readiness evidence.",
      "Continue the remaining business-readiness gates before opening paid customer traffic."
    ];
  }
  if (status === "warn") {
    return ["Review and explicitly accept every warning before using this evidence for commercial readiness."];
  }
  const actions = checks.filter((check) => check.status === "fail").map((check) => check.message);
  actions.push("Do not count source-video auto-analysis as business-ready evidence until this report status is pass.");
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

function skippedAtlasBillingGate(options) {
  return {
    path: toRepoRelative(options.atlasBillingReportPath),
    present: false,
    status: "skipped",
    currentApprovedBudgetUsd: options.maxCostUsd,
    maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
    canUseAsPrePaidAtlasBillingEvidence: false,
    checks: []
  };
}

function summarizeAtlasBillingGate(options) {
  const approvedBudgetUsd = options.maxCostUsd;
  const budgetCapValid = typeof approvedBudgetUsd === "number" && Number.isFinite(approvedBudgetUsd) && approvedBudgetUsd > 0;
  const path = toRepoRelative(options.atlasBillingReportPath);
  const budgetCapCheck = budgetCapValid
    ? pass("atlas_billing_source_video_budget_cap", `Approved source-video LLM budget cap is ${formatUsd(approvedBudgetUsd)}.`)
    : fail("atlas_billing_source_video_budget_cap", "--max-cost-usd must be supplied before source-video paid Atlas LLM validation.");
  const report = readJsonIfExists(options.atlasBillingReportPath);
  if (!report) {
    return {
      path,
      present: false,
      status: "missing",
      currentApprovedBudgetUsd: approvedBudgetUsd,
      maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
      canUseAsPrePaidAtlasBillingEvidence: false,
      checks: [
        budgetCapCheck,
        fail(
          "atlas_billing_report_present",
          `Missing Atlas billing readiness report for source-video validation at ${path}. Run validation:atlas-billing with --planned-cost-usd ${formatNumber(approvedBudgetUsd)} before Atlas LLM spend.`
        )
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
  const plannedCostMatches = budgetCapValid && moneyEquals(reportPlannedCostUsd, approvedBudgetUsd);
  const budgetCoversMaxCost = budgetCapValid && typeof reportMaxBudgetUsd === "number" && reportMaxBudgetUsd >= approvedBudgetUsd;
  const checks = [
    budgetCapCheck,
    schemaOk
      ? pass("atlas_billing_report_schema", "Atlas billing readiness report schema is recognized.")
      : fail("atlas_billing_report_schema", "Atlas billing readiness report schemaVersion is missing or unrecognized."),
    freshForPaidValidation
      ? pass("atlas_billing_report_fresh", "Atlas billing readiness report is fresh enough for source-video Atlas LLM spend.")
      : fail("atlas_billing_report_fresh", atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours: options.atlasBillingEvidenceMaxAgeHours, approvedBudgetUsd })),
    statusOk
      ? pass("atlas_billing_report_status", "Atlas billing readiness report passed.")
      : fail("atlas_billing_report_status", `Atlas billing readiness report status is ${report.status ?? "missing"}.`),
    networkOk
      ? pass("atlas_billing_report_balance_capture", "Atlas billing readiness report captured a no-spend /balance response.")
      : fail("atlas_billing_report_balance_capture", "Atlas billing readiness report did not capture a successful no-spend /balance response."),
    plannedCostMatches
      ? pass("atlas_billing_planned_cost_matches_source_video", `Atlas billing planned cost matches source-video budget cap ${formatUsd(approvedBudgetUsd)}.`)
      : fail("atlas_billing_planned_cost_matches_source_video", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} does not match current source-video budget cap ${formatUsd(approvedBudgetUsd)}.`),
    budgetCoversMaxCost
      ? pass("atlas_billing_budget_covers_source_video_cap", `Atlas billing approved budget covers source-video maxCostUsd ${formatUsd(approvedBudgetUsd)}.`)
      : fail("atlas_billing_budget_covers_source_video_cap", `Atlas billing approved budget ${formatUsd(reportMaxBudgetUsd)} does not cover source-video maxCostUsd ${formatUsd(approvedBudgetUsd)}.`)
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
    currentApprovedBudgetUsd: approvedBudgetUsd,
    plannedCostMatchesCurrentRun: plannedCostMatches,
    reportMaxBudgetUsd,
    budgetCoversMaxCost,
    networkCallsMade: report.networkCallsMade === true,
    canUseAsPrePaidAtlasBillingEvidence: checks.every((check) => check.status === "pass"),
    checks
  };
}

function atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours, approvedBudgetUsd }) {
  const command = `npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(approvedBudgetUsd)} --planned-cost-usd ${formatNumber(approvedBudgetUsd)} --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network`;
  if (!validGeneratedAt) {
    return `Atlas billing readiness report is missing a valid generatedAt timestamp. Rerun ${command}.`;
  }
  if (!clockSkewOk) {
    return `Atlas billing readiness report timestamp is in the future (${reportGeneratedAt}). Rerun ${command}.`;
  }
  return `Atlas billing readiness report is too old for source-video Atlas LLM spend: generatedAt ${reportGeneratedAt}, age ${formatHours(reportAgeHours)}, max age ${formatHours(maxAgeHours)}. Rerun ${command}.`;
}

function cleanHttpsUrl(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty HTTPS URL.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${fieldName} must not include embedded credentials.`);
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`${fieldName} must not point to localhost, private IPs, or internal hostnames.`);
  }
  for (const [key, item] of parsed.searchParams.entries()) {
    if (secretQueryTextPattern.test(key) || secretQueryTextPattern.test(item)) {
      throw new Error(`${fieldName} query contains credential-like parameter ${key}.`);
    }
  }
  parsed.hash = "";
  return parsed.toString();
}

function safeUrlPreview(value) {
  const parsed = new URL(value);
  parsed.search = "";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [first = 0, second = 0] = normalized.split(".").map((part) => Number(part));
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  if (ipVersion === 6) {
    return normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:");
  }
  return false;
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

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moneyEquals(left, right) {
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 0.000001;
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
    schemaVersion: "cinejelly.source-video-auto-analysis-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
