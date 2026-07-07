import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json",
  workDirectory: "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-work",
  defaultModelId: "cinejelly-source-video-smoke-llm"
};

const sourcePatternOrigins = [
  "HKUDS/VideoAgent",
  "calesthio/OpenMontage",
  "HKUDS/ViMax",
  "Atlas Cloud LLM docs"
];

const requiredScenarioNames = [
  "disabled_leaves_request_unchanged",
  "existing_analysis_not_overwritten",
  "asset_reference_skipped",
  "secret_query_reference_skipped",
  "secret_query_value_reference_skipped",
  "localhost_reference_skipped",
  "clean_https_generates_bounded_analysis",
  "leaking_output_rejected_non_strict",
  "strict_empty_analysis_throws"
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--work-directory", "workDirectory"],
    ["--model-id", "defaultModelId"]
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
      options[key] = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
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
  console.log(`Run CineJelly's no-spend source-video auto-analysis smoke.

Usage:
  npm.cmd run validation:source-video-auto-analysis-smoke

Options:
  --output <path>          JSON report path. Default: ${defaults.outputPath}
  --work-directory <path>  Synthetic frame work directory. Default: ${defaults.workDirectory}
  --model-id <id>          Synthetic LLM model id. Default: ${defaults.defaultModelId}
  --no-output              Print only; do not write JSON.

This command performs no Atlas calls, no provider calls, no FFmpeg calls, and no source-video network fetches.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const { SourceVideoAutoAnalyzer } = await import("../dist/core/source-video-auto-analyzer.js");
  const context = createSmokeContext(options);
  const scenarioSummaries = [];

  scenarioSummaries.push(await runDisabledScenario(SourceVideoAutoAnalyzer, context));
  scenarioSummaries.push(await runExistingAnalysisScenario(SourceVideoAutoAnalyzer, context));
  scenarioSummaries.push(await runSkippedReferenceScenario(SourceVideoAutoAnalyzer, context, {
    name: "asset_reference_skipped",
    uri: "asset://customer-owned-source-video",
    skippedReason: "asset_reference_is_planning_only"
  }));
  scenarioSummaries.push(await runSkippedReferenceScenario(SourceVideoAutoAnalyzer, context, {
    name: "secret_query_reference_skipped",
    uri: "https://media.example.test/source-video.mp4?token=redacted",
    skippedReason: "credential_like_query_is_rejected"
  }));
  scenarioSummaries.push(await runSkippedReferenceScenario(SourceVideoAutoAnalyzer, context, {
    name: "secret_query_value_reference_skipped",
    uri: "https://media.example.test/source-video.mp4?utm=secret-token",
    skippedReason: "credential_like_query_value_is_rejected"
  }));
  scenarioSummaries.push(await runSkippedReferenceScenario(SourceVideoAutoAnalyzer, context, {
    name: "localhost_reference_skipped",
    uri: "https://localhost/source-video.mp4",
    skippedReason: "localhost_or_private_source_is_rejected"
  }));
  scenarioSummaries.push(await runCleanHttpsScenario(SourceVideoAutoAnalyzer, context));
  scenarioSummaries.push(await runLeakGuardScenario(SourceVideoAutoAnalyzer, context));
  scenarioSummaries.push(await runStrictEmptyScenario(SourceVideoAutoAnalyzer, context));

  const checks = buildChecks(scenarioSummaries, context);
  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const report = {
    schemaVersion: "cinejelly.source-video-auto-analysis-smoke.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourceVideoFetchMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      workDirectory: toRepoRelative(options.workDirectory),
      defaultModelId: options.defaultModelId,
      syntheticScenarioCount: scenarioSummaries.length,
      syntheticFrameFileCount: context.createdFrameCount,
      maxFramesPerScenario: 3
    },
    summary: {
      scenarioCount: scenarioSummaries.length,
      passingScenarioCount: scenarioSummaries.filter((scenario) => scenario.status === "pass").length,
      failingScenarioCount: scenarioSummaries.filter((scenario) => scenario.status === "fail").length,
      frameSamplerCallCount: scenarioSummaries.reduce((sum, scenario) => sum + scenario.frameSamplerCallCount, 0),
      mediaMetricsAnalyzerCallCount: scenarioSummaries.reduce((sum, scenario) => sum + scenario.mediaMetricsAnalyzerCallCount, 0),
      syntheticLlmCallCount: scenarioSummaries.reduce((sum, scenario) => sum + scenario.syntheticLlmCallCount, 0),
      analysisGeneratedScenarioCount: scenarioSummaries.filter((scenario) => scenario.analysisPresent).length,
      skippedScenarioCount: scenarioSummaries.filter((scenario) => Boolean(scenario.skippedReason)).length
    },
    scenarioSummaries,
    checks,
    releaseGateSummary: {
      canUseAsSourceVideoAutoAnalysisBackendEvidence: status === "pass",
      canUseAsBusinessReadinessSourceVideoEvidence: false,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Source-video auto-analysis backend smoke passes; live source-video URL, Atlas billing, and paid LLM evidence are still required before business-readiness source-video evidence can pass."
        : "Source-video auto-analysis smoke failed; fix adapter guard behavior before trusting source-video backend evidence."
    },
    nextActions: status === "pass"
      ? [
          "Keep this smoke passing before claiming VideoAgent-style source-video auto-analysis adapter parity.",
          "Run validation:source-video-auto-analysis with operator spend confirmation and Atlas billing evidence when live source-video evidence is needed."
        ]
      : ["Fix failing source-video auto-analysis smoke scenarios before launch-doctor can trust this backend path."]
  };

  const reportSafetyCheck = reportContainsNoFrameData(report, context);
  report.checks = [...report.checks, reportSafetyCheck];
  report.status = report.checks.every((check) => check.status === "pass") ? "pass" : "fail";
  report.releaseGateSummary.canUseAsSourceVideoAutoAnalysisBackendEvidence = report.status === "pass";
  report.releaseGateSummary.releaseBlocker = releaseBlockerForStatus(report.status);
  report.nextActions = nextActionsForStatus(report.status);

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  assertSmokeWorkDirectory(options.workDirectory, "--work-directory");
  if (!String(options.defaultModelId ?? "").trim()) {
    throw new Error("--model-id must be a non-empty string.");
  }
  const distPath = resolve(repoRoot, "dist/core/source-video-auto-analyzer.js");
  if (!existsSync(distPath)) {
    throw new Error("dist/core/source-video-auto-analyzer.js is missing. Run npm.cmd run build first.");
  }
}

function assertSmokeWorkDirectory(path, flag) {
  if (isAbsolute(path)) {
    throw new Error(`${flag} must be repo-relative so smoke cleanup cannot remove files outside the workspace.`);
  }
  const absolutePath = resolve(repoRoot, path);
  const relativeToRepo = relative(repoRoot, absolutePath);
  if (relativeToRepo.startsWith("..") || isAbsolute(relativeToRepo)) {
    throw new Error(`${flag} must stay inside the repository workspace.`);
  }
  const allowedRoot = resolve(repoRoot, defaults.workDirectory);
  const relativeToAllowedRoot = relative(allowedRoot, absolutePath);
  if (relativeToAllowedRoot && (relativeToAllowedRoot.startsWith("..") || isAbsolute(relativeToAllowedRoot))) {
    throw new Error(`${flag} must stay inside ${defaults.workDirectory} so smoke cleanup cannot remove unrelated files.`);
  }
}

function releaseBlockerForStatus(status) {
  return status === "pass"
    ? "Source-video auto-analysis backend smoke passes; live source-video URL, Atlas billing, and paid LLM evidence are still required before business-readiness source-video evidence can pass."
    : "Source-video auto-analysis smoke failed; fix adapter guard behavior before trusting source-video backend evidence.";
}

function nextActionsForStatus(status) {
  return status === "pass"
    ? [
        "Keep this smoke passing before claiming VideoAgent-style source-video auto-analysis adapter parity.",
        "Run validation:source-video-auto-analysis with operator spend confirmation and Atlas billing evidence when live source-video evidence is needed."
      ]
    : ["Fix failing source-video auto-analysis smoke scenarios before launch-doctor can trust this backend path."];
}

function createSmokeContext(options) {
  const workDirectory = resolve(repoRoot, options.workDirectory);
  rmSync(workDirectory, { recursive: true, force: true });
  mkdirSync(workDirectory, { recursive: true });
  return {
    options,
    workDirectory,
    framePaths: [],
    currentScenarioFramePaths: [],
    createdFrameCount: 0
  };
}

async function runDisabledScenario(SourceVideoAutoAnalyzer, context) {
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: "disabled_leaves_request_unchanged",
    llmValueFactory: () => validAnalysis()
  });
  const request = baseRequest();
  const prepared = await runtime.analyzer.prepareRequest(request, settings(context, { enabled: false }));
  return scenarioSummary({
    name: "disabled_leaves_request_unchanged",
    intent: "Disabled source-video auto-analysis must return the request unchanged without sampling frames or calling the LLM.",
    status: prepared === request &&
      !prepared.sourceVideoAnalysis &&
      runtime.sampler.calls.length === 0 &&
      runtime.metrics.calls.length === 0 &&
      runtime.llm.calls.length === 0 ? "pass" : "fail",
    prepared,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    skippedReason: "settings_disabled"
  });
}

async function runExistingAnalysisScenario(SourceVideoAutoAnalyzer, context) {
  const existingAnalysis = {
    sourceReferenceLabel: "smoke-source",
    structuralBeats: ["Caller-provided structure remains authoritative."]
  };
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: "existing_analysis_not_overwritten",
    llmValueFactory: () => validAnalysis()
  });
  const request = baseRequest({ sourceVideoAnalysis: existingAnalysis });
  const prepared = await runtime.analyzer.prepareRequest(request, settings(context));
  return scenarioSummary({
    name: "existing_analysis_not_overwritten",
    intent: "Caller-provided sourceVideoAnalysis must not be overwritten by automatic analysis.",
    status: prepared === request &&
      prepared.sourceVideoAnalysis === existingAnalysis &&
      runtime.sampler.calls.length === 0 &&
      runtime.metrics.calls.length === 0 &&
      runtime.llm.calls.length === 0 ? "pass" : "fail",
    prepared,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    skippedReason: "caller_analysis_present",
    preservedExistingAnalysis: prepared.sourceVideoAnalysis === existingAnalysis
  });
}

async function runSkippedReferenceScenario(SourceVideoAutoAnalyzer, context, input) {
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: input.name,
    llmValueFactory: () => validAnalysis()
  });
  const request = baseRequest({ uri: input.uri });
  const prepared = await runtime.analyzer.prepareRequest(request, settings(context));
  return scenarioSummary({
    name: input.name,
    intent: "Unsafe or planning-only source-video references must be skipped before frame sampling.",
    status: prepared === request &&
      !prepared.sourceVideoAnalysis &&
      runtime.sampler.calls.length === 0 &&
      runtime.metrics.calls.length === 0 &&
      runtime.llm.calls.length === 0 ? "pass" : "fail",
    prepared,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    skippedReason: input.skippedReason
  });
}

async function runCleanHttpsScenario(SourceVideoAutoAnalyzer, context) {
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: "clean_https_generates_bounded_analysis",
    llmValueFactory: () => validAnalysis()
  });
  const request = baseRequest();
  const prepared = await runtime.analyzer.prepareRequest(request, settings(context));
  const analysisSummary = summarizeAnalysis(prepared.sourceVideoAnalysis, runtime.sampler.framePaths);
  const llmCall = runtime.llm.calls[0];
  return scenarioSummary({
    name: "clean_https_generates_bounded_analysis",
    intent: "Clean HTTPS source-video reference must generate bounded normalized structure from synthetic frame samples.",
    status: prepared !== request &&
      analysisSummary.present &&
      analysisSummary.usableContent &&
      analysisSummary.sceneCount === 2 &&
      analysisSummary.keyframeCount === 2 &&
      analysisSummary.noInlineFrameData &&
      analysisSummary.noLocalFramePaths &&
      analysisSummary.mediaMetricsPresent &&
      analysisSummary.mediaMetricsRhythmLabel === "fast" &&
      analysisSummary.mediaMetricsSceneCutCount === 5 &&
      runtime.metrics.calls.length === 1 &&
      runtime.sampler.calls.length === 1 &&
      runtime.sampler.framePaths.length === 3 &&
      runtime.llm.calls.length === 1 &&
      llmCall?.imagePartCount === 3 &&
      llmCall?.dataImagePartCount === 3 &&
      llmCall?.nonDataImagePartCount === 0 &&
      llmCall?.mediaMetricsInPrompt === true &&
      llmCall?.rawSourceUriInPrompt === false &&
      llmCall?.localFramePathInPrompt === false ? "pass" : "fail",
    prepared,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    analysisSummary
  });
}

async function runLeakGuardScenario(SourceVideoAutoAnalyzer, context) {
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: "leaking_output_rejected_non_strict",
    llmValueFactory: () => ({
      ...validAnalysis(),
      pacingNotes: [context.currentScenarioFramePaths[0] ?? "missing-frame-path"]
    })
  });
  const request = baseRequest();
  const prepared = await runtime.analyzer.prepareRequest(request, settings(context, { failOnError: false }));
  return scenarioSummary({
    name: "leaking_output_rejected_non_strict",
    intent: "Adapter must reject source-video analysis that tries to echo local frame paths.",
    status: prepared === request &&
      !prepared.sourceVideoAnalysis &&
      runtime.sampler.calls.length === 1 &&
      runtime.metrics.calls.length === 1 &&
      runtime.llm.calls.length === 1 ? "pass" : "fail",
    prepared,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    skippedReason: "analysis_output_failed_leak_guard"
  });
}

async function runStrictEmptyScenario(SourceVideoAutoAnalyzer, context) {
  const runtime = createScenarioRuntime(SourceVideoAutoAnalyzer, context, {
    name: "strict_empty_analysis_throws",
    llmValueFactory: () => ({ sourceReferenceLabel: "smoke-source" })
  });
  const request = baseRequest();
  let thrownError;
  try {
    await runtime.analyzer.prepareRequest(request, settings(context, { failOnError: true }));
  } catch (error) {
    thrownError = error instanceof Error ? error.message : String(error);
  }
  return scenarioSummary({
    name: "strict_empty_analysis_throws",
    intent: "Strict mode must surface unusable LLM structure instead of silently claiming analysis.",
    status: unusableAnalysisError(thrownError) &&
      runtime.sampler.calls.length === 1 &&
      runtime.metrics.calls.length === 1 &&
      runtime.llm.calls.length === 1 ? "pass" : "fail",
    prepared: request,
    sampler: runtime.sampler,
    metrics: runtime.metrics,
    llm: runtime.llm,
    thrownErrorRedacted: redactText(thrownError ?? "missing expected error")
  });
}

function createScenarioRuntime(SourceVideoAutoAnalyzer, context, input) {
  const sampler = new FakeFrameSampler(context, input.name);
  const metrics = new FakeMediaMetricsAnalyzer();
  const llm = new FakeLlmProvider(context, input.name, input.llmValueFactory);
  return {
    sampler,
    metrics,
    llm,
    analyzer: new SourceVideoAutoAnalyzer({
      llmProvider: llm,
      defaultModelId: context.options.defaultModelId,
      mediaInspector: sampler,
      mediaMetricsAnalyzer: metrics
    })
  };
}

class FakeFrameSampler {
  constructor(context, scenarioName) {
    this.context = context;
    this.scenarioName = scenarioName;
    this.calls = [];
    this.framePaths = [];
  }

  async sampleFrames(sourceUri, options) {
    this.calls.push({
      sourceProtocol: safeProtocol(sourceUri),
      outputDirectory: toRepoRelative(options.outputDirectory),
      intervalSeconds: options.intervalSeconds,
      maxFrames: options.maxFrames
    });
    const scenarioDirectory = resolve(this.context.workDirectory, this.scenarioName);
    mkdirSync(scenarioDirectory, { recursive: true });
    this.framePaths = [];
    for (let index = 0; index < options.maxFrames; index += 1) {
      const path = resolve(scenarioDirectory, `frame-${String(index + 1).padStart(2, "0")}.jpg`);
      writeFileSync(path, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      this.framePaths.push(path);
      this.context.framePaths.push(path);
      this.context.createdFrameCount += 1;
    }
    this.context.currentScenarioFramePaths = [...this.framePaths];
    return this.framePaths.map((path, index) => ({ path, index }));
  }
}

class FakeMediaMetricsAnalyzer {
  constructor() {
    this.calls = [];
  }

  async analyze(sourceUri) {
    this.calls.push({
      sourceProtocol: safeProtocol(sourceUri),
      sourceUriSha256: sha256(sourceUri)
    });
    return {
      schemaVersion: "cinejelly.source-video-media-metrics.v1",
      durationSeconds: 18,
      bitrate: 2400000,
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      video: {
        codecName: "h264",
        width: 1080,
        height: 1920,
        frameRate: 30,
        aspectRatio: "9:16"
      },
      audio: {
        hasAudio: true,
        codecName: "aac",
        sampleRate: 48000,
        channelCount: 2
      },
      editRhythm: {
        sampledWindowSeconds: 18,
        sceneCutCount: 5,
        cutDensityPerMinute: 16.667,
        averageShotLengthSeconds: 3,
        rhythmLabel: "fast",
        sceneCutTimestampsSeconds: [1.2, 3.8, 7.4, 11.1, 15.5]
      },
      evidence: {
        probeSucceeded: true,
        sceneDetectionSucceeded: true,
        sourceUriSha256: sha256(sourceUri)
      }
    };
  }
}

class FakeLlmProvider {
  constructor(context, scenarioName, valueFactory) {
    this.context = context;
    this.scenarioName = scenarioName;
    this.valueFactory = valueFactory;
    this.name = "fake-no-spend-source-video-llm";
    this.calls = [];
  }

  async chat() {
    throw new Error("FakeLlmProvider.chat is not used by the source-video smoke.");
  }

  async structured(request) {
    const summary = summarizeStructuredRequest(request, this.context.framePaths);
    this.calls.push(summary);
    const value = this.valueFactory();
    return {
      provider: this.name,
      modelId: request.modelId,
      content: JSON.stringify(value),
      raw: { synthetic: true, scenarioName: this.scenarioName },
      value,
      usage: {
        estimatedCostUsd: 0,
        actualCostUsd: 0
      },
      latencyMs: 0
    };
  }

  capabilities() {
    return [];
  }
}

function summarizeStructuredRequest(request, framePaths) {
  const parts = request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []);
  const imageParts = parts.filter((part) => part?.type === "image_url");
  const serialized = JSON.stringify(request.messages);
  return {
    modelId: String(request.modelId),
    imagePartCount: imageParts.length,
    dataImagePartCount: imageParts.filter((part) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(part.image_url?.url ?? "")).length,
    nonDataImagePartCount: imageParts.filter((part) => !/^data:image\/[a-z0-9.+-]+;base64,/i.test(part.image_url?.url ?? "")).length,
    localFramePathInPrompt: framePaths.some((framePath) => serialized.includes(framePath)),
    mediaMetricsInPrompt: serialized.includes("cinejelly.source-video-media-metrics.v1") &&
      serialized.includes("rhythmLabel") &&
      serialized.includes("fast") &&
      serialized.includes("cutDensityPerMinute"),
    rawSourceUriInPrompt: serialized.includes("https://media.example.test/source-video.mp4"),
    inlineFrameDataSentToSyntheticLlm: /data:image\/[a-z0-9.+-]+;base64,/i.test(serialized),
    maxTokens: Number(request.maxTokens ?? 0),
    temperature: Number(request.temperature ?? 0)
  };
}

function baseRequest(input = {}) {
  return {
    userInput:
      "Create an original product-launch film using the source video only as abstract pacing and camera grammar.",
    references: [
      {
        role: "source_video_structure",
        label: "smoke-source",
        priority: "primary",
        providerReference: {
          kind: "video",
          uri: input.uri ?? "https://media.example.test/source-video.mp4"
        }
      }
    ],
    ...(input.sourceVideoAnalysis ? { sourceVideoAnalysis: input.sourceVideoAnalysis } : {})
  };
}

function settings(context, overrides = {}) {
  return {
    enabled: true,
    workDirectory: toRepoRelative(context.workDirectory),
    frameIntervalSeconds: 2,
    maxFrames: 3,
    failOnError: false,
    ...overrides
  };
}

function validAnalysis() {
  return {
    sourceReferenceLabel: "smoke-source",
    transformationIntent: "Translate only abstract pacing, scene rhythm, and camera grammar into an original commercial.",
    scenes: [
      {
        sceneId: "scene_opening",
        startSecond: 0,
        endSecond: 4,
        summary: "A calm opening establishes the environment and object relationship without copying a frame.",
        pacing: "measured setup",
        camera: "slow push with stable horizon",
        audio: "soft room tone and light texture",
        visualStyle: "clean daylight with controlled contrast",
        keyframes: [
          {
            timestampSecond: 1,
            description: "Wide composition showing hands preparing a work surface."
          }
        ]
      },
      {
        sceneId: "scene_payoff",
        startSecond: 4,
        endSecond: 8,
        summary: "A quicker payoff beat reveals the practical benefit through original blocking.",
        pacing: "faster proof beat",
        camera: "short lateral move into a close detail",
        audio: "subtle lift into resolved cadence",
        visualStyle: "neutral product light with crisp edges",
        keyframes: [
          {
            timestampSecond: 6,
            description: "Detail frame that emphasizes motion rhythm rather than copied imagery."
          }
        ]
      }
    ],
    pacingNotes: ["Alternate a calm setup with a compressed proof beat."],
    styleNotes: ["Use neutral practical lighting and restrained contrast."],
    structuralBeats: ["Setup", "Process", "Payoff"],
    safetyNotes: ["Use structure only; do not copy exact shots, logos, faces, or transcript wording."]
  };
}

function scenarioSummary(input) {
  const analysis = input.analysisSummary ?? summarizeAnalysis(input.prepared.sourceVideoAnalysis, input.sampler.framePaths);
  const llmCall = input.llm.calls[0];
  return {
    name: input.name,
    status: input.status,
    intent: input.intent,
    frameSamplerCallCount: input.sampler.calls.length,
    mediaMetricsAnalyzerCallCount: input.metrics?.calls.length ?? 0,
    syntheticLlmCallCount: input.llm.calls.length,
    analysisPresent: analysis.present,
    sceneCount: analysis.sceneCount,
    keyframeCount: analysis.keyframeCount,
    mediaMetricsPresent: analysis.mediaMetricsPresent,
    mediaMetricsRhythmLabel: analysis.mediaMetricsRhythmLabel,
    mediaMetricsSceneCutCount: analysis.mediaMetricsSceneCutCount,
    mediaMetricsSourceUriSha256Present: analysis.mediaMetricsSourceUriSha256Present,
    pacingNoteCount: analysis.pacingNoteCount,
    styleNoteCount: analysis.styleNoteCount,
    structuralBeatCount: analysis.structuralBeatCount,
    safetyNoteCount: analysis.safetyNoteCount,
    noInlineFrameDataInAnalysis: analysis.noInlineFrameData,
    noLocalFramePathsInAnalysis: analysis.noLocalFramePaths,
    ...(typeof input.preservedExistingAnalysis === "boolean" ? { preservedExistingAnalysis: input.preservedExistingAnalysis } : {}),
    ...(input.skippedReason ? { skippedReason: input.skippedReason } : {}),
    ...(input.thrownErrorRedacted ? { thrownErrorRedacted: input.thrownErrorRedacted } : {}),
    ...(llmCall ? {
      llmImagePartCount: llmCall.imagePartCount,
      llmDataImagePartCount: llmCall.dataImagePartCount,
      llmNonDataImagePartCount: llmCall.nonDataImagePartCount,
      llmLocalFramePathInPrompt: llmCall.localFramePathInPrompt,
      llmMediaMetricsInPrompt: llmCall.mediaMetricsInPrompt,
      llmRawSourceUriInPrompt: llmCall.rawSourceUriInPrompt
    } : {})
  };
}

function summarizeAnalysis(analysis, framePaths) {
  const strings = analysisStrings(analysis);
  const keyframeCount = Array.isArray(analysis?.scenes)
    ? analysis.scenes.reduce((sum, scene) => sum + (Array.isArray(scene?.keyframes) ? scene.keyframes.length : 0), 0)
    : 0;
  const noInlineFrameData = strings.every((value) => !/data:image\/[a-z0-9.+-]+;base64,/i.test(value));
  const noLocalFramePaths = strings.every((value) => !framePaths.some((path) => value.includes(path)));
  return {
    present: Boolean(analysis),
    usableContent: Boolean(
      analysis?.transformationIntent ||
        analysis?.transcript?.length ||
        analysis?.scenes?.length ||
        analysis?.pacingNotes?.length ||
        analysis?.styleNotes?.length ||
        analysis?.structuralBeats?.length ||
        analysis?.safetyNotes?.length
    ),
    sceneCount: Array.isArray(analysis?.scenes) ? analysis.scenes.length : 0,
    keyframeCount,
    pacingNoteCount: Array.isArray(analysis?.pacingNotes) ? analysis.pacingNotes.length : 0,
    styleNoteCount: Array.isArray(analysis?.styleNotes) ? analysis.styleNotes.length : 0,
    structuralBeatCount: Array.isArray(analysis?.structuralBeats) ? analysis.structuralBeats.length : 0,
    safetyNoteCount: Array.isArray(analysis?.safetyNotes) ? analysis.safetyNotes.length : 0,
    mediaMetricsPresent: analysis?.mediaMetrics?.schemaVersion === "cinejelly.source-video-media-metrics.v1",
    mediaMetricsRhythmLabel: analysis?.mediaMetrics?.editRhythm?.rhythmLabel,
    mediaMetricsSceneCutCount: analysis?.mediaMetrics?.editRhythm?.sceneCutCount,
    mediaMetricsSourceUriSha256Present: /^[a-f0-9]{64}$/i.test(analysis?.mediaMetrics?.evidence?.sourceUriSha256 ?? ""),
    noInlineFrameData,
    noLocalFramePaths
  };
}

function analysisStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => analysisStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => analysisStrings(item));
  }
  return [];
}

function buildChecks(scenarios, context) {
  const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
  const cleanHttpsScenario = byName.get("clean_https_generates_bounded_analysis");
  const leakGuardScenario = byName.get("leaking_output_rejected_non_strict");
  const strictEmptyScenario = byName.get("strict_empty_analysis_throws");
  return [
    pass("no_spend_controls", "Smoke uses synthetic frame files and fake LLM provider only; no network, Atlas, provider, FFmpeg, or source-video fetch is allowed."),
    requiredScenarioNames.every((name) => byName.has(name))
      ? pass("scenario_coverage", "All required source-video adapter guard scenarios are covered.")
      : fail("scenario_coverage", "One or more required source-video adapter guard scenarios are missing."),
    scenarios.every((scenario) => scenario.status === "pass")
      ? pass("scenario_statuses", "Every source-video auto-analysis smoke scenario passed.")
      : fail("scenario_statuses", "One or more source-video auto-analysis smoke scenarios failed."),
    byName.get("disabled_leaves_request_unchanged")?.frameSamplerCallCount === 0 &&
      byName.get("disabled_leaves_request_unchanged")?.syntheticLlmCallCount === 0
      ? pass("disabled_has_no_side_effects", "Disabled source-video auto-analysis does not sample frames or call the LLM.")
      : fail("disabled_has_no_side_effects", "Disabled source-video auto-analysis had side effects."),
    byName.get("existing_analysis_not_overwritten")?.preservedExistingAnalysis === true
      ? pass("existing_analysis_preserved", "Caller-provided sourceVideoAnalysis remains authoritative.")
      : fail("existing_analysis_preserved", "Caller-provided sourceVideoAnalysis was not preserved."),
    [
      "asset_reference_skipped",
      "secret_query_reference_skipped",
      "secret_query_value_reference_skipped",
      "localhost_reference_skipped"
    ].every((name) => skippedScenarioPass(byName.get(name)))
      ? pass("unsafe_sources_skipped_before_sampling", "asset://, credential-like HTTPS query, and localhost/private references are skipped before frame sampling.")
      : fail("unsafe_sources_skipped_before_sampling", "Unsafe references were not skipped before frame sampling."),
    cleanHttpsScenario?.analysisPresent === true &&
      cleanHttpsScenario.sceneCount === 2 &&
      cleanHttpsScenario.keyframeCount === 2 &&
      cleanHttpsScenario.mediaMetricsPresent === true &&
      cleanHttpsScenario.mediaMetricsRhythmLabel === "fast" &&
      cleanHttpsScenario.mediaMetricsSceneCutCount === 5 &&
      cleanHttpsScenario.mediaMetricsSourceUriSha256Present === true &&
      cleanHttpsScenario.noInlineFrameDataInAnalysis === true &&
      cleanHttpsScenario.noLocalFramePathsInAnalysis === true
      ? pass("clean_https_analysis_bounded_and_safe", "Clean HTTPS source-video reference produces bounded safe normalized analysis with deterministic media metrics.")
      : fail("clean_https_analysis_bounded_and_safe", "Clean HTTPS scenario did not produce bounded safe analysis."),
    cleanHttpsScenario?.llmImagePartCount === 3 &&
      cleanHttpsScenario.llmDataImagePartCount === 3 &&
      cleanHttpsScenario.llmNonDataImagePartCount === 0 &&
      cleanHttpsScenario.llmMediaMetricsInPrompt === true &&
      cleanHttpsScenario.llmRawSourceUriInPrompt === false &&
      cleanHttpsScenario.llmLocalFramePathInPrompt === false
      ? pass("synthetic_llm_receives_bounded_frame_parts", "Synthetic LLM received bounded frame parts and media metrics without raw source URL or local frame paths.")
      : fail("synthetic_llm_receives_bounded_frame_parts", "Synthetic LLM frame/media summary was not bounded or leaked local paths."),
    leakGuardScenario?.analysisPresent === false &&
      leakGuardScenario.frameSamplerCallCount === 1 &&
      leakGuardScenario.syntheticLlmCallCount === 1
      ? pass("leak_guard_rejects_local_frame_paths", "Output that includes local frame paths is rejected and does not attach sourceVideoAnalysis.")
      : fail("leak_guard_rejects_local_frame_paths", "Frame-path leakage was not rejected."),
    unusableAnalysisError(strictEmptyScenario?.thrownErrorRedacted)
      ? pass("strict_mode_surfaces_empty_analysis", "Strict mode throws when LLM output has no usable deconstruction content.")
      : fail("strict_mode_surfaces_empty_analysis", "Strict mode did not surface unusable LLM output."),
    context.createdFrameCount > 0
      ? pass("synthetic_frame_files_created", "Smoke created local synthetic frame files for the adapter to encode.")
      : fail("synthetic_frame_files_created", "Smoke did not create synthetic frame files.")
  ];
}

function skippedScenarioPass(scenario) {
  return scenario?.status === "pass" &&
    scenario.frameSamplerCallCount === 0 &&
    scenario.mediaMetricsAnalyzerCallCount === 0 &&
    scenario.syntheticLlmCallCount === 0 &&
    scenario.analysisPresent === false;
}

function unusableAnalysisError(value) {
  const text = String(value ?? "");
  return text.includes("no usable deconstruction content") ||
    text.includes("sourceVideoAnalysis must include at least one transformationIntent");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function reportContainsNoFrameData(report, context) {
  const serialized = JSON.stringify(report);
  if (/data:image\/[a-z0-9.+-]+;base64,/i.test(serialized)) {
    return fail("report_contains_no_inline_frame_data", "Smoke report must not serialize inline frame data.");
  }
  const leakedPath = context.framePaths.find((path) => serialized.includes(path));
  if (leakedPath) {
    return fail("report_contains_no_local_frame_paths", "Smoke report must not serialize local frame paths.");
  }
  return pass("report_redaction", "Smoke report serializes summaries only, with no local frame paths or inline frame data.");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function redactText(value) {
  return String(value ?? "")
    .replace(/[A-Z]:\\[^"'`\s]+/gi, "[local-path]")
    .replace(/\/(?:[^/"'`\s]+\/)+[^"'`\s]+/g, "[local-path]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[inline-frame-data]");
}

function safeProtocol(uri) {
  try {
    return new URL(uri).protocol.replace(":", "");
  } catch {
    return "invalid";
  }
}

function writeJson(path, data) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

try {
  const exitCode = await main();
  process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
