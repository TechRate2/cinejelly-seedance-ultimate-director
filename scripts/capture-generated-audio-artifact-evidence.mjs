import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  generatedAudioReportPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json",
  artifactPath: "assets/output_deliverables/business-readiness/generated-audio-artifacts/generated-audio-validation.mp3",
  maxBytes: 10 * 1024 * 1024,
  timeoutMs: 60_000
};

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Atlas Cloud xai/tts-v1 model page",
  "Atlas Cloud Predictions docs"
];

function parseArgs(args) {
  const options = {
    ...defaults,
    confirmLiveNetwork: false,
    writeReport: true
  };
  const flagMap = new Map([
    ["--generated-audio-report", "generatedAudioReportPath"],
    ["--output", "outputPath"],
    ["--artifact", "artifactPath"],
    ["--max-bytes", "maxBytes"],
    ["--timeout-ms", "timeoutMs"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-live-network") {
      options.confirmLiveNetwork = true;
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
      options[key] = ["maxBytes", "timeoutMs"].includes(key) ? Number(rawValue) : rawValue;
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
  console.log(`Capture generated-audio artifact evidence without calling providers.

Usage:
  npm.cmd run validation:generated-audio-artifact
  npm.cmd run validation:generated-audio-artifact -- --confirm-live-network

Options:
  --generated-audio-report <path>  Existing generated-audio validation report.
                                  Default: ${defaults.generatedAudioReportPath}
  --artifact <path>                Ignored local audio artifact path. Default: ${defaults.artifactPath}
  --max-bytes <bytes>              Maximum audio download size. Default: ${defaults.maxBytes}
  --timeout-ms <ms>                HTTPS fetch timeout. Default: ${defaults.timeoutMs}
  --confirm-live-network           Required before fetching the clean output URL.
  --output <path>                  JSON report path. Default: ${defaults.outputPath}
  --no-output                      Print only; do not write the report.

This command never calls Atlas model endpoints. With --confirm-live-network it downloads the already-generated clean HTTPS audio URL, records SHA-256, byte size, and ffprobe metadata, and keeps the report as review support rather than manual-review approval.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const sourceRead = readJson(options.generatedAudioReportPath);
  const sourceReportContext = generatedAudioContextFor(sourceRead);
  const checks = [
    sourceRead.exists
      ? pass("generated_audio_report_present", "Generated-audio validation report is present.")
      : fail("generated_audio_report_present", `Generated-audio validation report is missing at ${toRepoRelative(options.generatedAudioReportPath)}.`),
    sourceRead.value?.schemaVersion === "cinejelly.generated-audio-validation.v1"
      ? pass("generated_audio_report_schema", "Generated-audio validation report schema is recognized.")
      : fail("generated_audio_report_schema", "Generated-audio validation report schema is missing or unrecognized."),
    sourceReportContext.readyForArtifactCapture
      ? pass("generated_audio_output_ready", "Generated-audio report has provider spend, billing, schema, succeeded execution, approved output-batch, provider ledger, and clean HTTPS output URL evidence.")
      : fail("generated_audio_output_ready", "Generated-audio output is not ready for artifact capture."),
    options.confirmLiveNetwork
      ? pass("live_network_confirmation", "Operator confirmed fetching the already-generated clean HTTPS output URL.")
      : fail("live_network_confirmation", "--confirm-live-network is required before downloading generated-audio media."),
    Number.isFinite(options.maxBytes) && options.maxBytes > 0
      ? pass("max_bytes", "Maximum download size is positive.")
      : fail("max_bytes", "--max-bytes must be a positive number."),
    extname(options.artifactPath).toLowerCase() === `.${sourceReportContext.artifactBinding.outputFormat ?? "mp3"}`
      ? pass("artifact_extension", "Artifact path extension matches requested output format.")
      : fail("artifact_extension", "Artifact path extension must match the generated-audio output format.")
  ];

  let artifactEvidence;
  let diagnostics = {
    ffprobeAvailable: false,
    ffprobeStatus: "not_run"
  };

  const canFetch = checks.every((check) => check.status === "pass");
  if (canFetch) {
    const capture = await captureArtifact(options, sourceReportContext.artifactBinding.outputUrlPreview);
    checks.push(...capture.checks);
    artifactEvidence = capture.artifactEvidence;
    diagnostics = capture.diagnostics;
  }

  const status = statusForChecks(checks);
  const report = {
    schemaVersion: "cinejelly.generated-audio-artifact-evidence.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: options.confirmLiveNetwork === true,
    providerCallsMade: false,
    releaseEvidence: false,
    sourcePatternOrigins,
    checkedInputs: {
      generatedAudioReportPath: toRepoRelative(options.generatedAudioReportPath),
      outputPath: toRepoRelative(options.outputPath),
      artifactPath: toRepoRelative(options.artifactPath),
      maxBytes: options.maxBytes,
      timeoutMs: options.timeoutMs,
      confirmLiveNetwork: options.confirmLiveNetwork
    },
    sourceReportContext,
    checks,
    artifactEvidence,
    diagnostics,
    releaseGateSummary: {
      canUseAsManualReviewArtifactEvidence: status === "pass",
      canUseAsBusinessReadinessGeneratedAudioEvidence: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Generated-audio artifact evidence is captured, but manual listening review is still required."
        : "Generated-audio artifact evidence is not captured yet."
    },
    nextActions: nextActionsFor(status, options, sourceReportContext)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--generated-audio-report", options.generatedAudioReportPath],
    ["--output", options.outputPath]
  ]) {
    if (extname(path).toLowerCase() !== ".json") {
      throw new Error(`${flag} must point to a JSON file.`);
    }
  }
  const artifactExt = extname(options.artifactPath).toLowerCase();
  if (![".mp3", ".wav"].includes(artifactExt)) {
    throw new Error("--artifact must point to an .mp3 or .wav file.");
  }
}

function generatedAudioContextFor(read) {
  const report = read.value;
  const binding = generatedAudioBindingFromReport(report);
  const outputUrlClean = typeof binding.outputUrlPreview === "string" &&
    /^https:\/\//i.test(binding.outputUrlPreview) &&
    !/[?&#]/.test(binding.outputUrlPreview);
  const providerExecutionSucceeded = report?.executionRun?.status === "succeeded";
  const outputBatchApproved =
    report?.outputBatchValidation?.status === "approved" &&
    Number(report?.outputBatchValidation?.approvedTrackCount ?? 0) > 0;
  const providerLedgerEntryCount = Number(report?.providerLedger?.entryCount ?? 0);
  const readyForArtifactCapture =
    read.exists === true &&
    report?.schemaVersion === "cinejelly.generated-audio-validation.v1" &&
    report?.spendGate?.providerNetworkCallsAllowed === true &&
    report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true &&
    report?.schemaGate?.confirmAudioSchemaReviewed === true &&
    providerExecutionSucceeded &&
    outputBatchApproved &&
    providerLedgerEntryCount > 0 &&
    outputUrlClean;
  return {
    reportPresent: read.exists === true,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    providerSpendEvidence: report?.spendGate?.providerNetworkCallsAllowed === true,
    atlasBillingEvidence: report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true,
    schemaReviewEvidence: report?.schemaGate?.confirmAudioSchemaReviewed === true,
    providerExecutionSucceeded,
    outputBatchApproved,
    approvedTrackCount: Number(report?.outputBatchValidation?.approvedTrackCount ?? 0),
    providerLedgerEntryCount,
    outputUrlClean,
    readyForArtifactCapture,
    artifactBinding: binding
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

async function captureArtifact(options, outputUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const checks = [];
  try {
    const response = await fetch(outputUrl, {
      signal: controller.signal,
      redirect: "follow"
    });
    checks.push(response.ok
      ? pass("media_fetch", "Generated-audio artifact URL fetched successfully.")
      : fail("media_fetch", `Generated-audio artifact URL returned HTTP ${response.status}.`));
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > options.maxBytes) {
      checks.push(fail("content_length", `Generated-audio artifact content-length ${contentLength} exceeds maxBytes ${options.maxBytes}.`));
      return { checks, diagnostics: { ffprobeAvailable: false, ffprobeStatus: "not_run" } };
    }
    const contentType = response.headers.get("content-type") ?? "unknown";
    const bytes = Buffer.from(await response.arrayBuffer());
    checks.push(bytes.byteLength > 0
      ? pass("media_bytes", "Generated-audio artifact bytes were downloaded.")
      : fail("media_bytes", "Generated-audio artifact download returned zero bytes."));
    checks.push(bytes.byteLength <= options.maxBytes
      ? pass("media_size_limit", `Generated-audio artifact size ${bytes.byteLength} bytes is within the configured limit.`)
      : fail("media_size_limit", `Generated-audio artifact size ${bytes.byteLength} bytes exceeds maxBytes ${options.maxBytes}.`));
    mkdirSync(dirname(resolve(repoRoot, options.artifactPath)), { recursive: true });
    writeFileSync(resolve(repoRoot, options.artifactPath), bytes);
    const mediaSha256 = createHash("sha256").update(bytes).digest("hex");
    const probe = probeAudio(options.artifactPath);
    checks.push(...probe.checks);
    const binding = generatedAudioContextFor(readJson(options.generatedAudioReportPath)).artifactBinding;
    return {
      checks,
      artifactEvidence: {
        generatedAudioReportPath: toRepoRelative(options.generatedAudioReportPath),
        artifactPath: toRepoRelative(options.artifactPath),
        mediaSha256,
        byteSize: bytes.byteLength,
        contentType,
        outputUrlPreview: outputUrl,
        modelId: binding.modelId,
        language: binding.language,
        voiceId: binding.voiceId,
        outputFormat: binding.outputFormat,
        intentId: binding.intentId,
        providerAssetId: binding.providerAssetId,
        predictionId: binding.predictionId,
        ...probe.artifactEvidence
      },
      diagnostics: probe.diagnostics
    };
  } catch (error) {
    checks.push(fail("media_fetch", `Generated-audio artifact fetch failed: ${error instanceof Error ? error.message : String(error)}.`));
    return {
      checks,
      diagnostics: {
        ffprobeAvailable: false,
        ffprobeStatus: "not_run"
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function probeAudio(path) {
  const command = readMediaToolCommand("ffprobe");
  const result = spawnSync(command, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    resolve(repoRoot, path)
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  const diagnostics = {
    ffprobeAvailable: !result.error,
    ffprobeStatus: typeof result.status === "number" ? String(result.status) : result.error ? "error" : "unknown"
  };
  if (result.error || result.status !== 0) {
    return {
      checks: [fail("ffprobe_audio_metadata", `ffprobe could not inspect generated-audio artifact: ${result.error?.message ?? result.stderr ?? "unknown error"}.`)],
      diagnostics
    };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const audioStream = Array.isArray(parsed.streams)
      ? parsed.streams.find((stream) => stream.codec_type === "audio")
      : undefined;
    const durationSeconds = numberOrUndefined(audioStream?.duration ?? parsed.format?.duration);
    const codecName = stringOrUndefined(audioStream?.codec_name);
    const sampleRate = numberOrUndefined(audioStream?.sample_rate);
    const channels = numberOrUndefined(audioStream?.channels);
    const bitRate = numberOrUndefined(audioStream?.bit_rate ?? parsed.format?.bit_rate);
    return {
      checks: [
        audioStream
          ? pass("ffprobe_audio_stream", "ffprobe found an audio stream.")
          : fail("ffprobe_audio_stream", "ffprobe did not find an audio stream."),
        typeof durationSeconds === "number" && durationSeconds > 0
          ? pass("ffprobe_audio_duration", "ffprobe reported a positive audio duration.")
          : fail("ffprobe_audio_duration", "ffprobe did not report a positive audio duration.")
      ],
      artifactEvidence: {
        durationSeconds,
        formatName: stringOrUndefined(parsed.format?.format_name),
        codecName,
        sampleRate,
        channels,
        bitRate
      },
      diagnostics: {
        ...diagnostics,
        ffprobeFormatName: stringOrUndefined(parsed.format?.format_name),
        ffprobeStreamCount: Array.isArray(parsed.streams) ? parsed.streams.length : 0
      }
    };
  } catch (error) {
    return {
      checks: [fail("ffprobe_audio_metadata", `ffprobe JSON output could not be parsed: ${error instanceof Error ? error.message : String(error)}.`)],
      diagnostics
    };
  }
}

function statusForChecks(checks) {
  if (checks.some((check) => check.name === "live_network_confirmation" && check.status === "fail")) {
    return "blocked_by_live_network_confirmation";
  }
  if (checks.some((check) => check.name === "generated_audio_output_ready" && check.status === "fail")) {
    return "blocked_by_source_report";
  }
  return checks.every((check) => check.status === "pass") ? "pass" : "fail";
}

function nextActionsFor(status, options, context) {
  if (status === "pass") {
    return [
      `Fill ops/generated-audio-manual-review.json after listening to ${context.artifactBinding.outputUrlPreview}.`,
      `Keep artifactEvidence.mediaSha256 and artifactEvidence.generatedAudioArtifactEvidenceReportPath from ${toRepoRelative(options.outputPath)} unchanged in the manual review packet.`,
      `Run npm.cmd run validation:generated-audio -- --review-existing-report ${toRepoRelative(options.generatedAudioReportPath)} --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review.`
    ];
  }
  if (status === "blocked_by_live_network_confirmation") {
    return [
      "Rerun with --confirm-live-network to fetch the already-generated clean HTTPS audio URL and capture SHA-256/ffprobe evidence.",
      "Do not count generated-audio manual review until artifact capture and listening review both pass."
    ];
  }
  if (status === "blocked_by_source_report") {
    return [
      "Refresh validation:generated-audio until provider spend, Atlas billing, schema, execution, output-batch, provider ledger, and clean output URL evidence are present."
    ];
  }
  return [
    "Fix the failed capture checks, then rerun the artifact capture before manual generated-audio review."
  ];
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""))
    };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(omitUndefined(value), null, 2)}\n`, "utf8");
}

function readMediaToolCommand(tool) {
  const envName = tool === "ffmpeg" ? "CINEJELLY_FFMPEG_PATH" : "CINEJELLY_FFPROBE_PATH";
  const configured = process.env[envName]?.trim();
  if (!configured) {
    return tool;
  }
  if ((configured.startsWith("\"") && configured.endsWith("\"")) || (configured.startsWith("'") && configured.endsWith("'"))) {
    return configured.slice(1, -1).trim() || tool;
  }
  return configured;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function omitUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(omitUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, omitUndefined(item)])
    );
  }
  return value;
}

function toRepoRelative(value) {
  const resolved = resolve(repoRoot, value);
  const relativePath = relative(repoRoot, resolved);
  return relativePath && !relativePath.startsWith("..")
    ? relativePath.replace(/\\/g, "/")
    : "[outside-repo]";
}

try {
  process.exit(await main());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
