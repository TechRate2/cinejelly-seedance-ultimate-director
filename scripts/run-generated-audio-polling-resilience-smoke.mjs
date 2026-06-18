#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { AtlasCloudProvider } from "../dist/providers/atlascloud/atlas-cloud-provider.js";
import { ProviderCostLedger } from "../dist/providers/cost-ledger.js";
import { ProviderError } from "../dist/utils/errors.js";

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/generated-audio-polling-resilience-smoke-report.json"
);
const predictionId = "pred_audio_polling_resilience_smoke";
const outputUrl = "https://cdn.example.invalid/cinejelly/audio-polling-resilience-smoke.mp3";
const modelId = "atlascloud/generated-audio-polling-resilience-smoke";

const ledger = new ProviderCostLedger();
const fakeHttp = new FakeAtlasHttpClient({ predictionId, outputUrl });
const provider = new AtlasCloudProvider({
  apiKey: "test-atlas-api-key",
  llmApiKey: "test-atlas-llm-api-key",
  apiBaseUrl: "https://api.atlascloud.ai/v1",
  assetBaseUrl: "https://api.atlascloud.ai/api/v1",
  models: {
    llmModel: "fake/llm",
    seedanceStandardModel: "fake/seedance-standard",
    seedanceFastModel: "fake/seedance-fast"
  },
  generatedAudioCapabilities: [
    {
      provider: "atlascloud",
      modelId,
      kinds: ["tts_narration"],
      outputFormats: ["mp3"],
      maxDurationSeconds: 30,
      async: true
    }
  ],
  requestTimeoutMs: 1_000,
  maxJsonResponseBytes: 1024 * 1024,
  pollingIntervalMs: 1,
  pollingTimeoutMs: 5_000
}, ledger);

provider.http = fakeHttp;

let result;
let unexpectedError;
try {
  result = await provider.generateAudio({
    provider: "atlascloud",
    modelId,
    intentId: "intent_audio_polling_resilience_smoke",
    kind: "tts_narration",
    prompt: "CineJelly generated audio polling resilience smoke.",
    settings: {
      outputFormat: "mp3",
      durationSeconds: 2,
      language: "vi-VN",
      voiceStyle: "voice_polling_resilience_smoke"
    },
    metadata: {
      graphNodeId: "node_audio_polling_resilience_smoke"
    }
  });
} catch (error) {
  unexpectedError = error;
}

const structuredFailure = await runStructuredFailureScenario({ modelId });
const ledgerEntries = ledger.list();
const audioEntry = ledgerEntries.find((entry) => entry.operation === "audio.generate");
const publicResult = result
  ? {
      status: result.status,
      provider: result.provider,
      modelId: result.modelId,
      intentId: result.intentId,
      kind: result.kind,
      outputUrl: result.outputUrl,
      providerAssetId: result.providerAssetId,
      durationSeconds: result.durationSeconds,
      latencyMs: result.latencyMs
    }
  : undefined;
const publicLedgerEntry = audioEntry
  ? {
      provider: audioEntry.provider,
      operation: audioEntry.operation,
      modelId: audioEntry.modelId,
      predictionId: audioEntry.predictionId,
      graphNodeId: audioEntry.graphNodeId,
      status: audioEntry.status,
      providerStatus: audioEntry.providerStatus,
      retryCount: audioEntry.retryCount,
      errorCode: audioEntry.errorCode,
      retryable: audioEntry.retryable,
      latencyMs: audioEntry.latencyMs
    }
  : undefined;
const checks = [
  check("provider_result_succeeds_after_transient_polling_errors", result?.status === "succeeded"),
  check("output_url_preserved", result?.outputUrl === outputUrl),
  check("prediction_id_preserved", result?.providerAssetId === predictionId),
  check("submit_called_once", fakeHttp.postCalls.length === 1),
  check("polling_continued_after_retry_exhaustion", fakeHttp.getCalls.length >= 5),
  check("transient_polling_errors_observed", fakeHttp.transientPollingErrorCount === 3),
  check("ledger_records_success_not_failure", audioEntry?.status === "succeeded"),
  check("ledger_keeps_running_or_terminal_provider_status", ["running", "succeeded"].includes(String(audioEntry?.providerStatus))),
  check("ledger_records_retries", Number(audioEntry?.retryCount ?? 0) >= 2),
  check("structured_failed_prediction_payload_is_terminal", structuredFailure.errorCode === "GENERATION_FAILED"),
  check("structured_failed_prediction_records_failed_status", structuredFailure.ledgerEntry?.status === "failed" && structuredFailure.ledgerEntry?.providerStatus === "failed"),
  check("structured_failed_prediction_does_not_poll_until_timeout", structuredFailure.getPredictionCallCount >= 1 && structuredFailure.getPredictionCallCount <= 3),
  check("no_raw_api_key_in_report", !JSON.stringify({ publicResult, publicLedgerEntry }).includes("test-atlas-api-key"))
];
const status = checks.some((item) => item.status === "fail") || unexpectedError ? "fail" : "pass";
const report = {
  schemaVersion: "cinejelly.generated-audio-polling-resilience-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: [
    "Atlas Cloud async prediction polling contract",
    "jiaminchen-1031/DirectorBench runtime evaluation evidence discipline"
  ],
  checkedInputs: {
    outputPath: toRepoRelative(outputPath),
    fakeProvider: true,
    predictionId,
    modelId,
    pollingTimeoutMs: 5_000,
    pollingIntervalMs: 1
  },
  summary: {
    submittedPredictionStatus: "running",
    transientPollingErrorCount: fakeHttp.transientPollingErrorCount,
    getPredictionCallCount: fakeHttp.getCalls.length,
    postGenerateAudioCallCount: fakeHttp.postCalls.length,
    finalResultStatus: result?.status ?? "missing",
    finalProviderStatus: audioEntry?.providerStatus ?? "missing",
    ledgerEntryCount: ledgerEntries.length,
    retryCount: audioEntry?.retryCount ?? 0,
    toleratedRetryablePollingFailure: result?.status === "succeeded" && fakeHttp.transientPollingErrorCount > 0,
    structuredFailureErrorCode: structuredFailure.errorCode ?? "missing",
    structuredFailureProviderStatus: structuredFailure.ledgerEntry?.providerStatus ?? "missing",
    structuredFailureGetPredictionCallCount: structuredFailure.getPredictionCallCount
  },
  execution: {
    result: publicResult,
    ledgerEntry: publicLedgerEntry,
    structuredFailure,
    unexpectedError: publicError(unexpectedError)
  },
  checks,
  releaseGateSummary: {
    generatedAudioPollingResiliencePass: status === "pass",
    canUseAsNoSpendBackendEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "This smoke proves retryable polling resilience only; live generated-audio output and manual audio review are still required before customer traffic."
  },
  nextActions: [
    "Run validation:generated-audio only after prepaid Atlas billing evidence is fresh and the operator approves provider spend.",
    "After a live output succeeds, run the manual generated-audio review command against the existing report rather than creating another paid provider job."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  output: toRepoRelative(outputPath),
  checkCount: checks.length,
  failedCheckCount: checks.filter((item) => item.status === "fail").length
}, null, 2));

if (status === "fail") {
  process.exitCode = 1;
}

function FakeAtlasHttpClient(options) {
  this.predictionId = options.predictionId;
  this.outputUrl = options.outputUrl;
  this.postCalls = [];
  this.getCalls = [];
  this.transientPollingErrorCount = 0;
  this.postJson = async (url, body) => {
    this.postCalls.push({ url, body });
    return {
      data: {
        id: this.predictionId,
        status: "running"
      }
    };
  };
  this.getJson = async (url) => {
    this.getCalls.push({ url });
    if (this.getCalls.length === 1) {
      return {
        data: {
          id: this.predictionId,
          status: "running"
        }
      };
    }
    if (this.getCalls.length <= 4) {
      this.transientPollingErrorCount += 1;
      throw new ProviderError({
        code: "NETWORK_ERROR",
        provider: "atlascloud",
        retryable: true,
        message: "Simulated transient Atlas polling network error."
      });
    }
    return {
      data: {
        id: this.predictionId,
        status: "completed",
        output: {
          url: this.outputUrl
        }
      }
    };
  };
}

async function runStructuredFailureScenario({ modelId }) {
  const failurePredictionId = "pred_audio_structured_failure_smoke";
  const failureLedger = new ProviderCostLedger();
  const provider = new AtlasCloudProvider({
    apiKey: "test-atlas-api-key",
    llmApiKey: "test-atlas-llm-api-key",
    apiBaseUrl: "https://api.atlascloud.ai/v1",
    assetBaseUrl: "https://api.atlascloud.ai/api/v1",
    models: {
      llmModel: "fake/llm",
      seedanceStandardModel: "fake/seedance-standard",
      seedanceFastModel: "fake/seedance-fast"
    },
    generatedAudioCapabilities: [
      {
        provider: "atlascloud",
        modelId,
        kinds: ["tts_narration"],
        outputFormats: ["mp3"],
        maxDurationSeconds: 30,
        async: true
      }
    ],
    requestTimeoutMs: 1_000,
    maxJsonResponseBytes: 1024 * 1024,
    pollingIntervalMs: 1,
    pollingTimeoutMs: 5_000
  }, failureLedger);
  const fakeFailureHttp = new FakeStructuredFailureHttpClient({ predictionId: failurePredictionId });
  provider.http = fakeFailureHttp;

  let error;
  try {
    await provider.generateAudio({
      provider: "atlascloud",
      modelId,
      intentId: "intent_audio_structured_failure_smoke",
      kind: "tts_narration",
      prompt: "CineJelly structured failed prediction smoke.",
      settings: {
        outputFormat: "mp3",
        durationSeconds: 2,
        language: "vi-VN",
        voiceStyle: "voice_structured_failure_smoke"
      },
      metadata: {
        graphNodeId: "node_audio_structured_failure_smoke"
      }
    });
  } catch (caught) {
    error = caught;
  }
  const ledgerEntry = failureLedger.list().find((entry) => entry.operation === "audio.generate");
  return {
    errorCode: error instanceof ProviderError ? error.code : undefined,
    retryable: error instanceof ProviderError ? error.retryable : undefined,
    getPredictionCallCount: fakeFailureHttp.getCalls.length,
    ledgerEntry: ledgerEntry
      ? {
          provider: ledgerEntry.provider,
          operation: ledgerEntry.operation,
          modelId: ledgerEntry.modelId,
          predictionId: ledgerEntry.predictionId,
          graphNodeId: ledgerEntry.graphNodeId,
          status: ledgerEntry.status,
          providerStatus: ledgerEntry.providerStatus,
          retryCount: ledgerEntry.retryCount,
          errorCode: ledgerEntry.errorCode,
          retryable: ledgerEntry.retryable,
          latencyMs: ledgerEntry.latencyMs
        }
      : undefined
  };
}

function FakeStructuredFailureHttpClient(options) {
  this.predictionId = options.predictionId;
  this.postCalls = [];
  this.getCalls = [];
  this.postJson = async (url, body) => {
    this.postCalls.push({ url, body });
    return {
      data: {
        id: this.predictionId,
        status: "running"
      }
    };
  };
  this.getJson = async (url) => {
    this.getCalls.push({ url });
    throw new ProviderError({
      code: "NETWORK_ERROR",
      provider: "atlascloud",
      statusCode: 500,
      retryable: true,
      message: "Simulated Atlas structured failed prediction response.",
      details: {
        data: {
          id: this.predictionId,
          model: "xai/tts-v1",
          outputs: [],
          status: "failed",
          error: "Simulated provider terminal failure.",
          error_code: "simulated_voice_not_found"
        }
      }
    });
  };
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
  };
}

function publicError(error) {
  if (!error) {
    return undefined;
  }
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof ProviderError
      ? {
          code: error.code,
          retryable: error.retryable,
          statusCode: error.statusCode
        }
      : {})
  };
}

function toRepoRelative(path) {
  return relative(repoRoot, resolve(path)).replaceAll("\\", "/");
}
