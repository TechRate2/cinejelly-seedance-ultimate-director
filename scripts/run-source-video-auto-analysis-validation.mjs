import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/source-video-validation-report.json",
  workDirectory: "assets/output_deliverables/business-readiness/source-video-analysis-work",
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
const secretQueryKeyPattern = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|auth)/i;
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

function parseArgs(args) {
  const options = {
    outputPath: defaults.outputPath,
    workDirectory: defaults.workDirectory,
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
      options[key] =
        key === "frameIntervalSeconds" || key === "maxFrames" || key === "timeoutMs"
          ? Number.parseInt(value, 10)
          : value;
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
  console.log(`Run live source-video auto-analysis validation with an explicit provider-spend gate.

Usage:
  npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://example.com/source.mp4
  npm.cmd run validation:source-video-auto-analysis -- --request assets/output_deliverables/business-readiness/source-video-request.json --confirm-provider-spend

Options:
  --source-video-url <url>             Clean HTTPS source video URL for validation.
  --request <path>                     Operator-owned request JSON containing a source_video_structure reference.
  --user-input <text>                  User prompt when --request is not supplied.
  --source-reference-label <label>     Reference label when --request is not supplied. Default: ${defaults.sourceReferenceLabel}
  --work-directory <path>              Frame sampling work directory. Default: ${defaults.workDirectory}
  --frame-interval-seconds <seconds>   Override source-video frame interval.
  --max-frames <count>                 Override max sampled frames.
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
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate,
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
        status === "pass" && analysisSummary?.present === true && spendGate.providerNetworkCallsAllowed === true,
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
  for (const key of parsed.searchParams.keys()) {
    if (secretQueryKeyPattern.test(key)) {
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
    schemaVersion: "cinejelly.source-video-auto-analysis-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
