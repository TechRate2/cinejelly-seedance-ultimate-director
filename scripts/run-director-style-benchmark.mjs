import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  paidRenderReportPath: "assets/output_deliverables/phase6-validation/paid-render-report.json",
  requestPath: "assets/output_deliverables/phase6-validation/request.json",
  manualReviewPath: "assets/output_deliverables/phase6-validation/manual-review-report.md",
  semanticReviewPath: "assets/output_deliverables/business-readiness/director-style-semantic-review.json",
  audioReviewPath: "assets/output_deliverables/business-readiness/director-style-audio-review.json",
  runtimeReviewPath: "assets/output_deliverables/business-readiness/director-style-runtime-review.json",
  governanceReviewPath: "assets/output_deliverables/business-readiness/director-style-governance-review.json",
  generatedAudioValidationPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  longFormValidationPath: "assets/output_deliverables/business-readiness/long-form-validation-report.json",
  mediaPath: "assets/output_deliverables/phase6-validation/final.mp4",
  outputPath: "assets/output_deliverables/business-readiness/director-style-benchmark-report.json",
  jsonlPath: "assets/output_deliverables/business-readiness/director-style-benchmark-results.jsonl",
  profile: "balanced",
  minPassingScore: 0.7,
  minConfidence: 0.6,
  frameSamplingIntervalSeconds: 3,
  maxFrameSamples: 8,
  sceneChangeThreshold: 0.12,
  transitionBoundaryWindowSeconds: 0.12,
  maxTransitionBoundaries: 8
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeOutput: true,
    appendJsonl: true,
    useRequest: true,
    useManualReview: true,
    useSemanticReview: true,
    useAudioReview: true,
    useRuntimeReview: true,
    useGovernanceReview: true,
    useGeneratedAudioValidation: true,
    useLongFormValidation: true,
    useMedia: true,
    buildFirst: false
  };
  const flagMap = new Map([
    ["--paid-render-report", "paidRenderReportPath"],
    ["--request", "requestPath"],
    ["--manual-review", "manualReviewPath"],
    ["--semantic-review", "semanticReviewPath"],
    ["--audio-review", "audioReviewPath"],
    ["--runtime-review", "runtimeReviewPath"],
    ["--governance-review", "governanceReviewPath"],
    ["--generated-audio-validation", "generatedAudioValidationPath"],
    ["--long-form-validation", "longFormValidationPath"],
    ["--media", "mediaPath"],
    ["--output", "outputPath"],
    ["--jsonl", "jsonlPath"],
    ["--profile", "profile"],
    ["--min-passing-score", "minPassingScore"],
    ["--min-confidence", "minConfidence"],
    ["--frame-sampling-interval-seconds", "frameSamplingIntervalSeconds"],
    ["--max-frame-samples", "maxFrameSamples"],
    ["--scene-change-threshold", "sceneChangeThreshold"],
    ["--transition-boundary-window-seconds", "transitionBoundaryWindowSeconds"],
    ["--max-transition-boundaries", "maxTransitionBoundaries"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeOutput = false;
      continue;
    }
    if (arg === "--no-jsonl") {
      options.appendJsonl = false;
      continue;
    }
    if (arg === "--no-request") {
      options.useRequest = false;
      continue;
    }
    if (arg === "--no-manual-review") {
      options.useManualReview = false;
      continue;
    }
    if (arg === "--no-semantic-review") {
      options.useSemanticReview = false;
      continue;
    }
    if (arg === "--no-audio-review") {
      options.useAudioReview = false;
      continue;
    }
    if (arg === "--no-runtime-review") {
      options.useRuntimeReview = false;
      continue;
    }
    if (arg === "--no-governance-review") {
      options.useGovernanceReview = false;
      continue;
    }
    if (arg === "--no-generated-audio-validation") {
      options.useGeneratedAudioValidation = false;
      continue;
    }
    if (arg === "--no-long-form-validation") {
      options.useLongFormValidation = false;
      continue;
    }
    if (arg === "--no-media") {
      options.useMedia = false;
      continue;
    }
    if (arg === "--build") {
      options.buildFirst = true;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = [
        "minPassingScore",
        "minConfidence",
        "frameSamplingIntervalSeconds",
        "maxFrameSamples",
        "sceneChangeThreshold",
        "transitionBoundaryWindowSeconds",
        "maxTransitionBoundaries"
      ].includes(key) ? Number(rawValue) : rawValue;
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
  console.log(`Run a CineJelly-owned DirectorBench-style backend quality benchmark from existing render evidence.

Usage:
  npm.cmd run validation:quality-benchmark
  npm.cmd run validation:quality-benchmark -- --paid-render-report assets/output_deliverables/phase6-validation/paid-render-report.json --request assets/output_deliverables/phase6-validation/request.json

Options:
  --paid-render-report <path>     Paid render validation report. Default: ${defaults.paidRenderReportPath}
  --request <path>                Original render request JSON. Default: ${defaults.requestPath}
  --manual-review <path>          Optional manual review note. Default: ${defaults.manualReviewPath}
  --semantic-review <path>        Optional structured semantic review JSON. Default: ${defaults.semanticReviewPath}
  --audio-review <path>           Optional structured audio review JSON. Default: ${defaults.audioReviewPath}
  --runtime-review <path>         Optional structured ASR/lip-sync runtime review JSON. Default: ${defaults.runtimeReviewPath}
  --governance-review <path>      Optional structured license/runtime permission review JSON. Default: ${defaults.governanceReviewPath}
  --generated-audio-validation <path>
                                  Optional generated-audio validation report JSON. Default: ${defaults.generatedAudioValidationPath}
  --long-form-validation <path>   Optional long-form validation report JSON. Default: ${defaults.longFormValidationPath}
  --media <path>                  Optional local rendered media for probe/frame-signal evidence. Default: ${defaults.mediaPath}
  --profile <name>                balanced, story_first, visual_heavy, audio_emotion, sync_perfectionist. Default: balanced
  --min-passing-score <number>    Default: ${defaults.minPassingScore}
  --min-confidence <number>       Default: ${defaults.minConfidence}
  --frame-sampling-interval-seconds <n> Default: ${defaults.frameSamplingIntervalSeconds}
  --max-frame-samples <n>         Default: ${defaults.maxFrameSamples}
  --scene-change-threshold <n>    FFmpeg scene-change threshold 0-1. Default: ${defaults.sceneChangeThreshold}
  --transition-boundary-window-seconds <n> Pre/post sample window. Default: ${defaults.transitionBoundaryWindowSeconds}
  --max-transition-boundaries <n> Max detected boundaries to analyze. Default: ${defaults.maxTransitionBoundaries}
  --output <path>                 JSON report path. Default: ${defaults.outputPath}
  --jsonl <path>                  Append-only JSONL history path. Default: ${defaults.jsonlPath}
  --no-request                    Do not read request evidence.
  --no-manual-review              Do not read manual review evidence.
  --no-semantic-review            Do not read structured semantic review evidence.
  --no-audio-review               Do not read structured audio review evidence.
  --no-runtime-review             Do not read structured runtime review evidence.
  --no-governance-review          Do not read structured governance review evidence.
  --no-generated-audio-validation Do not read generated-audio validation report evidence.
  --no-long-form-validation       Do not read long-form validation report evidence.
  --no-media                      Do not inspect local rendered media.
  --build                         Build TypeScript before importing the benchmark evaluator.
  --no-output                     Print only; do not write the JSON report.
  --no-jsonl                      Do not append the JSONL history.

This benchmark performs no provider calls, no media downloads, no deployment calls, and no paid validation.
It evaluates persisted CineJelly artifact-contract evidence plus optional local media probe/frame signals, emits a parityEvidenceMatrix, and does not claim full DirectorBench parity.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);
  if (options.buildFirst) {
    const build = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
      cwd: repoRoot,
      stdio: "inherit"
    });
    if (typeof build.status === "number" && build.status !== 0) {
      return build.status;
    }
    if (build.error) {
      throw build.error;
    }
  }

  const paidRenderReport = readJson(options.paidRenderReportPath, true);
  const expectedArtifactBinding = expectedArtifactBindingFor(paidRenderReport);
  const request = options.useRequest ? readJson(options.requestPath, false) : undefined;
  const manualReviewText = options.useManualReview ? readText(options.manualReviewPath, false) : undefined;
  const semanticReviewEvidence = options.useSemanticReview ? await collectSemanticReviewEvidence(options, expectedArtifactBinding) : undefined;
  const audioReviewEvidence = options.useAudioReview ? await collectAudioReviewEvidence(options, expectedArtifactBinding) : undefined;
  const runtimeReviewEvidence = options.useRuntimeReview ? await collectRuntimeReviewEvidence(options, expectedArtifactBinding) : undefined;
  const governanceReviewEvidence = options.useGovernanceReview ? await collectGovernanceReviewEvidence(options, expectedArtifactBinding) : undefined;
  const generatedAudioProviderEvidence = options.useGeneratedAudioValidation ? await collectGeneratedAudioProviderEvidence(options) : undefined;
  const longFormValidationEvidence = options.useLongFormValidation ? await collectLongFormValidationEvidence(options) : undefined;
  const mediaEvidence = options.useMedia ? await collectMediaEvidence(options) : undefined;
  const facts = factsFrom({
    paidRenderReport,
    request,
    manualReviewText,
    semanticReviewEvidence,
    audioReviewEvidence,
    runtimeReviewEvidence,
    governanceReviewEvidence,
    generatedAudioProviderEvidence,
    longFormValidationEvidence,
    mediaEvidence,
    options
  });
  const { DirectorStyleBenchmarkEvaluator } = await import("../dist/core/director-style-benchmark.js");
  const evaluator = new DirectorStyleBenchmarkEvaluator();
  const report = evaluator.evaluate({
    facts,
    profile: options.profile,
    minPassingScore: options.minPassingScore,
    minConfidence: options.minConfidence,
    ...(options.useMedia ? { mediaPath: toRepoRelative(options.mediaPath) } : {}),
    ...(options.useMedia ? { frameSamplingIntervalSeconds: options.frameSamplingIntervalSeconds } : {}),
    ...(options.useMedia ? { maxFrameSamples: options.maxFrameSamples } : {}),
    ...(options.useMedia ? { sceneChangeThreshold: options.sceneChangeThreshold } : {}),
    ...(options.useMedia ? { transitionBoundaryWindowSeconds: options.transitionBoundaryWindowSeconds } : {}),
    ...(options.useMedia ? { maxTransitionBoundaries: options.maxTransitionBoundaries } : {}),
    ...(semanticReviewEvidence ? { semanticReviewPath: toRepoRelative(options.semanticReviewPath) } : {}),
    ...(audioReviewEvidence ? { audioReviewPath: toRepoRelative(options.audioReviewPath) } : {}),
    ...(runtimeReviewEvidence ? { runtimeReviewPath: toRepoRelative(options.runtimeReviewPath) } : {}),
    ...(governanceReviewEvidence ? { governanceReviewPath: toRepoRelative(options.governanceReviewPath) } : {}),
    ...(generatedAudioProviderEvidence ? { generatedAudioValidationPath: toRepoRelative(options.generatedAudioValidationPath) } : {}),
    ...(longFormValidationEvidence ? { longFormValidationPath: toRepoRelative(options.longFormValidationPath) } : {}),
    ...(options.writeOutput ? { outputPath: toRepoRelative(options.outputPath) } : {}),
    ...(options.appendJsonl ? { jsonlPath: toRepoRelative(options.jsonlPath) } : {})
  });

  if (options.writeOutput) {
    writeJson(options.outputPath, report);
  }
  if (options.appendJsonl) {
    appendJsonl(options.jsonlPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "blocked" ? 1 : 0;
}

async function collectMediaEvidence(options) {
  const absoluteMediaPath = resolve(repoRoot, options.mediaPath);
  if (!existsSync(absoluteMediaPath)) {
    return {
      status: "unavailable",
      source: "local_file",
      mediaPath: toRepoRelative(options.mediaPath),
      mediaFileName: String(options.mediaPath).split(/[\\/]/).pop(),
      findings: [`Media file is absent at ${toRepoRelative(options.mediaPath)}.`]
    };
  }
  const { collectDirectorStyleMediaEvidence } = await import("../dist/core/director-style-media-evidence.js");
  return collectDirectorStyleMediaEvidence({
    mediaPath: absoluteMediaPath,
    mediaPathForReport: toRepoRelative(options.mediaPath),
    frameSamplingIntervalSeconds: options.frameSamplingIntervalSeconds,
    maxFrameSamples: options.maxFrameSamples,
    sceneChangeThreshold: options.sceneChangeThreshold,
    transitionBoundaryWindowSeconds: options.transitionBoundaryWindowSeconds,
    maxTransitionBoundaries: options.maxTransitionBoundaries
  });
}

async function collectSemanticReviewEvidence(options, expectedArtifactBinding) {
  const absolutePath = resolve(repoRoot, options.semanticReviewPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.semanticReviewPath, true);
  const { normalizeDirectorStyleSemanticReviewEvidence } = await import("../dist/core/director-style-semantic-review.js");
  return normalizeDirectorStyleSemanticReviewEvidence(raw, {
    sourcePath: toRepoRelative(options.semanticReviewPath),
    expectedArtifactBinding
  });
}

async function collectAudioReviewEvidence(options, expectedArtifactBinding) {
  const absolutePath = resolve(repoRoot, options.audioReviewPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.audioReviewPath, true);
  const { normalizeDirectorStyleAudioReviewEvidence } = await import("../dist/core/director-style-audio-review.js");
  return normalizeDirectorStyleAudioReviewEvidence(raw, {
    sourcePath: toRepoRelative(options.audioReviewPath),
    expectedArtifactBinding
  });
}

async function collectRuntimeReviewEvidence(options, expectedArtifactBinding) {
  const absolutePath = resolve(repoRoot, options.runtimeReviewPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.runtimeReviewPath, true);
  const { normalizeDirectorStyleRuntimeReviewEvidence } = await import("../dist/core/director-style-runtime-review.js");
  return normalizeDirectorStyleRuntimeReviewEvidence(raw, {
    sourcePath: toRepoRelative(options.runtimeReviewPath),
    expectedArtifactBinding
  });
}

async function collectGovernanceReviewEvidence(options, expectedArtifactBinding) {
  const absolutePath = resolve(repoRoot, options.governanceReviewPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.governanceReviewPath, true);
  const { normalizeDirectorStyleGovernanceReviewEvidence } = await import("../dist/core/director-style-governance-review.js");
  return normalizeDirectorStyleGovernanceReviewEvidence(raw, {
    sourcePath: toRepoRelative(options.governanceReviewPath),
    expectedArtifactBinding
  });
}

function expectedArtifactBindingFor(paidRenderReport) {
  const deliverable = Array.isArray(paidRenderReport?.artifactBundle?.entries)
    ? paidRenderReport.artifactBundle.entries.find((entry) => entry?.kind === "deliverable")
    : undefined;
  const projectId = typeof paidRenderReport?.artifactBundle?.projectId === "string"
    ? paidRenderReport.artifactBundle.projectId
    : undefined;
  const requestId = typeof paidRenderReport?.requestId === "string"
    ? paidRenderReport.requestId
    : undefined;
  const deliverableSha256 = typeof deliverable?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(deliverable.sha256)
    ? deliverable.sha256.toLowerCase()
    : undefined;
  return {
    ...(projectId ? { projectId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(deliverableSha256 ? { deliverableSha256 } : {})
  };
}

async function collectGeneratedAudioProviderEvidence(options) {
  const absolutePath = resolve(repoRoot, options.generatedAudioValidationPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.generatedAudioValidationPath, true);
  const { normalizeDirectorStyleGeneratedAudioProviderEvidence } = await import("../dist/core/director-style-generated-audio-provider-evidence.js");
  return normalizeDirectorStyleGeneratedAudioProviderEvidence(raw, { sourcePath: toRepoRelative(options.generatedAudioValidationPath) });
}

async function collectLongFormValidationEvidence(options) {
  const absolutePath = resolve(repoRoot, options.longFormValidationPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const raw = readJson(options.longFormValidationPath, true);
  const { normalizeDirectorStyleLongFormValidationEvidence } = await import("../dist/core/director-style-long-form-validation-evidence.js");
  return normalizeDirectorStyleLongFormValidationEvidence(raw, { sourcePath: toRepoRelative(options.longFormValidationPath) });
}

function validateOptions(options) {
  const profiles = new Set(["balanced", "story_first", "visual_heavy", "audio_emotion", "sync_perfectionist"]);
  if (!profiles.has(options.profile)) {
    throw new Error("--profile must be balanced, story_first, visual_heavy, audio_emotion, or sync_perfectionist.");
  }
  for (const [name, value] of [
    ["--min-passing-score", options.minPassingScore],
    ["--min-confidence", options.minConfidence]
  ]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be a number from 0 to 1.`);
    }
  }
  if (
    typeof options.sceneChangeThreshold !== "number" ||
    !Number.isFinite(options.sceneChangeThreshold) ||
    options.sceneChangeThreshold <= 0 ||
    options.sceneChangeThreshold >= 1
  ) {
    throw new Error("--scene-change-threshold must be a number greater than 0 and less than 1.");
  }
  if (
    typeof options.transitionBoundaryWindowSeconds !== "number" ||
    !Number.isFinite(options.transitionBoundaryWindowSeconds) ||
    options.transitionBoundaryWindowSeconds <= 0 ||
    options.transitionBoundaryWindowSeconds > 2
  ) {
    throw new Error("--transition-boundary-window-seconds must be a number greater than 0 and at most 2.");
  }
  for (const [name, value] of [
    ["--frame-sampling-interval-seconds", options.frameSamplingIntervalSeconds],
    ["--max-frame-samples", options.maxFrameSamples],
    ["--max-transition-boundaries", options.maxTransitionBoundaries]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 60) {
      throw new Error(`${name} must be an integer from 1 to 60.`);
    }
  }
  for (const [name, value] of [
    ["--paid-render-report", options.paidRenderReportPath],
    ["--request", options.requestPath],
    ["--semantic-review", options.semanticReviewPath],
    ["--audio-review", options.audioReviewPath],
    ["--runtime-review", options.runtimeReviewPath],
    ["--governance-review", options.governanceReviewPath],
    ["--generated-audio-validation", options.generatedAudioValidationPath],
    ["--long-form-validation", options.longFormValidationPath],
    ["--media", options.mediaPath],
    ["--output", options.outputPath],
    ["--jsonl", options.jsonlPath]
  ]) {
    if (name === "--media") {
      continue;
    }
    if (name !== "--jsonl" && extname(value).toLowerCase() !== ".json") {
      throw new Error(`${name} must point to a JSON file.`);
    }
    if (name === "--jsonl" && extname(value).toLowerCase() !== ".jsonl") {
      throw new Error("--jsonl must point to a JSONL file.");
    }
  }
}

function factsFrom({
  paidRenderReport,
  request,
  manualReviewText,
  semanticReviewEvidence,
  audioReviewEvidence,
  runtimeReviewEvidence,
  governanceReviewEvidence,
  generatedAudioProviderEvidence,
  longFormValidationEvidence,
  mediaEvidence,
  options
}) {
  const artifactEntries = Array.isArray(paidRenderReport?.artifactBundle?.entries)
    ? paidRenderReport.artifactBundle.entries
    : [];
  const artifactKinds = artifactEntries
    .map((entry) => entry?.kind)
    .filter((kind) => typeof kind === "string")
    .sort((left, right) => left.localeCompare(right));
  const requestSettings = request && typeof request === "object" ? request.settings : undefined;
  const audioMode = typeof requestSettings?.audioMode === "string" ? requestSettings.audioMode : undefined;
  const targetDurationSeconds =
    typeof requestSettings?.durationTargetSeconds === "number" ? requestSettings.durationTargetSeconds : undefined;
  const hasAudioEvidence =
    audioMode !== undefined && audioMode !== "none" ||
    artifactKinds.includes("generated_audio_output_batch_validation") ||
    mediaEvidence?.audio?.hasAudio === true ||
    audioReviewEvidence !== undefined ||
    generatedAudioProviderEvidence?.status === "accepted";
  const manualReviewProvided = typeof manualReviewText === "string" && manualReviewText.trim().length > 0;
  const manualReviewAccepted =
    manualReviewProvided && /\b(pass|passed|approved|accepted|ok)\b/i.test(manualReviewText ?? "");
  const artifactDirectory = typeof request?.artifactDirectory === "string" ? request.artifactDirectory : undefined;
  const sourcePatternOrigins = Array.isArray(paidRenderReport?.sourcePatternOrigins)
    ? paidRenderReport.sourcePatternOrigins.filter((origin) => typeof origin === "string")
    : [];

  return {
    sourceReportPath: toRepoRelative(options.paidRenderReportPath),
    ...(options.useRequest && existsSync(resolve(repoRoot, options.requestPath))
      ? { requestPath: toRepoRelative(options.requestPath) }
      : {}),
    ...(artifactDirectory ? { artifactDirectory } : {}),
    ...(typeof paidRenderReport?.status === "string" ? { renderStatus: paidRenderReport.status } : {}),
    ...(typeof paidRenderReport?.readiness?.decision === "string"
      ? { readinessDecision: paidRenderReport.readiness.decision }
      : {}),
    ...(typeof paidRenderReport?.artifactValidation?.status === "string"
      ? { artifactValidationStatus: paidRenderReport.artifactValidation.status }
      : {}),
    ...(typeof paidRenderReport?.artifactBundle?.projectId === "string"
      ? { projectId: paidRenderReport.artifactBundle.projectId }
      : {}),
    ...(typeof paidRenderReport?.requestId === "string" ? { requestId: paidRenderReport.requestId } : {}),
    ...(targetDurationSeconds !== undefined ? { targetDurationSeconds } : {}),
    ...(mediaEvidence?.durationSeconds !== undefined
      ? { finalDurationSeconds: mediaEvidence.durationSeconds }
      : longFormValidationEvidence?.status === "accepted" &&
          longFormValidationEvidence.finalDurationSeconds !== undefined
        ? { finalDurationSeconds: longFormValidationEvidence.finalDurationSeconds }
        : {}),
    hasAudioEvidence,
    manualReviewProvided,
    manualReviewAccepted,
    ...(typeof paidRenderReport?.costLedgerEntryCount === "number"
      ? { costLedgerEntryCount: paidRenderReport.costLedgerEntryCount }
      : {}),
    artifactKinds,
    sourcePatternOrigins,
    ...(semanticReviewEvidence ? { semanticReviewEvidence } : {}),
    ...(audioReviewEvidence ? { audioReviewEvidence } : {}),
    ...(runtimeReviewEvidence ? { runtimeReviewEvidence } : {}),
    ...(governanceReviewEvidence ? { governanceReviewEvidence } : {}),
    ...(generatedAudioProviderEvidence ? { generatedAudioProviderEvidence } : {}),
    ...(longFormValidationEvidence ? { longFormValidationEvidence } : {}),
    ...(mediaEvidence ? { mediaEvidence } : {})
  };
}

function readJson(path, required) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    if (required) {
      throw new Error(`Missing JSON file: ${toRepoRelative(path)}.`);
    }
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Invalid JSON at ${toRepoRelative(path)}: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

function readText(path, required) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    if (required) {
      throw new Error(`Missing text file: ${toRepoRelative(path)}.`);
    }
    return undefined;
  }
  return readFileSync(absolutePath, "utf8");
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendJsonl(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  appendFileSync(absolutePath, `${JSON.stringify(value)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)
    ? relativePath
    : `external:${basename(path) || "input"}`;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.director-style-benchmark.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
}
