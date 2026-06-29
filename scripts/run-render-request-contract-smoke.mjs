#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/render-request-contract-smoke-report.json",
  fixtureDir: "assets/output_deliverables/business-readiness/render-request-contract-smoke"
};

function parseArgs(args) {
  const options = { ...defaults, writeReport: true };
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
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--fixture-dir") {
      options.fixtureDir = readRequiredValue(args, index, arg);
      index += 1;
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
  console.log(`Run a no-spend render-request schema/admission contract smoke.

Usage:
  node scripts/run-render-request-contract-smoke.mjs

Options:
  --output <path>        JSON report path. Default: ${defaults.outputPath}
  --fixture-dir <path>   Request fixture directory. Default: ${defaults.fixtureDir}
  --no-output            Print only; do not write the report.`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (extname(options.outputPath).toLowerCase() !== ".json") {
  throw new Error("--output must point to a JSON file.");
}

const fixtureDir = resolve(repoRoot, options.fixtureDir);
mkdirSync(fixtureDir, { recursive: true });

const validRequestPath = resolve(fixtureDir, "valid-provider-reference-1440.json");
const flatReferenceRequestPath = resolve(fixtureDir, "invalid-flat-reference.json");
const secretQueryRequestPath = resolve(fixtureDir, "invalid-secret-query-reference.json");
const malformedSourceVideoRequestPath = resolve(fixtureDir, "invalid-source-video-shape.json");
const mismatchedSourceLabelRequestPath = resolve(fixtureDir, "invalid-source-video-label.json");
const emptySourceVideoRequestPath = resolve(fixtureDir, "invalid-empty-source-video-analysis.json");
const validSchemaReportPath = resolve(fixtureDir, "valid-provider-reference-schema-report.json");
const flatSchemaReportPath = resolve(fixtureDir, "invalid-flat-reference-schema-report.json");
const secretSchemaReportPath = resolve(fixtureDir, "secret-query-reference-schema-report.json");
const malformedSourceSchemaReportPath = resolve(fixtureDir, "invalid-source-video-shape-schema-report.json");
const mismatchedSourceSchemaReportPath = resolve(fixtureDir, "invalid-source-video-label-schema-report.json");
const emptySourceSchemaReportPath = resolve(fixtureDir, "invalid-empty-source-video-analysis-schema-report.json");

writeJson(validRequestPath, buildValidRequest());
writeJson(flatReferenceRequestPath, buildFlatReferenceRequest());
writeJson(secretQueryRequestPath, buildSecretQueryRequest());
writeJson(malformedSourceVideoRequestPath, buildMalformedSourceVideoRequest());
writeJson(mismatchedSourceLabelRequestPath, buildMismatchedSourceLabelRequest());
writeJson(emptySourceVideoRequestPath, buildEmptySourceVideoRequest());

const { validateRenderRequestFile } = await import("../dist/application/render-request-validation-entrypoint.js");
const { AtlasCloudProvider } = await import("../dist/providers/atlascloud/atlas-cloud-provider.js");

const validSchema = validateRequestSchema("valid_provider_reference", validRequestPath, validSchemaReportPath);
const flatSchema = validateRequestSchema("invalid_flat_reference", flatReferenceRequestPath, flatSchemaReportPath);
const secretSchema = validateRequestSchema("secret_query_reference", secretQueryRequestPath, secretSchemaReportPath);
const malformedSourceSchema = validateRequestSchema("invalid_source_video_shape", malformedSourceVideoRequestPath, malformedSourceSchemaReportPath);
const mismatchedSourceSchema = validateRequestSchema("invalid_source_video_label", mismatchedSourceLabelRequestPath, mismatchedSourceSchemaReportPath);
const emptySourceSchema = validateRequestSchema("invalid_empty_source_video_analysis", emptySourceVideoRequestPath, emptySourceSchemaReportPath);

const validAdmission = await validateRenderRequestFile(validRequestPath, process.env);
const flatAdmission = await validateRenderRequestFile(flatReferenceRequestPath, process.env);
const secretAdmission = await validateRenderRequestFile(secretQueryRequestPath, process.env);
const malformedSourceAdmission = await validateRenderRequestFile(malformedSourceVideoRequestPath, process.env);
const mismatchedSourceAdmission = await validateRenderRequestFile(mismatchedSourceLabelRequestPath, process.env);
const emptySourceAdmission = await validateRenderRequestFile(emptySourceVideoRequestPath, process.env);
const atlasPayload = await captureAtlasVideoPayload();

const checks = [
  validSchema.exitCode === 0
    ? pass("provider_reference_schema_accepts_runtime_contract", "Schema accepts the runtime PromptReference/providerReference shape.")
    : fail("provider_reference_schema_accepts_runtime_contract", "Schema rejected the runtime PromptReference/providerReference shape."),
  validAdmission.status === "pass" && validAdmission.normalizedSummary?.referenceCount === 3
    ? pass("provider_reference_admission_accepts_runtime_contract", "Runtime admission accepts providerReference requests with source-video analysis.")
    : fail("provider_reference_admission_accepts_runtime_contract", "Runtime admission rejected the providerReference request."),
  flatSchema.exitCode !== 0
    ? pass("flat_reference_schema_rejected", "Schema rejects legacy flat references that runtime admission cannot consume.")
    : fail("flat_reference_schema_rejected", "Schema still accepts legacy flat references."),
  flatAdmission.status === "fail"
    ? pass("flat_reference_admission_rejected", "Runtime admission rejects legacy flat references before planning/provider spend.")
    : fail("flat_reference_admission_rejected", "Runtime admission accepted a legacy flat reference."),
  secretSchema.exitCode === 0 && secretAdmission.status === "fail"
    ? pass("secret_query_runtime_guard", "Schema permits generic HTTPS media while runtime admission rejects credential-like query keys.")
    : fail("secret_query_runtime_guard", "Expected runtime admission to reject credential-like HTTPS query keys."),
  validAdmission.status === "pass" &&
    validSchema.exitCode === 0 &&
    buildValidRequest().transitionSettings.targetHeight === 1440 &&
    buildValidRequest().transitionSettings.kind === "auto"
    ? pass("render_contract_supports_auto_1440_transition", "Schema and admission support auto 1440 transition settings aligned with 1440p-SR render settings.")
    : fail("render_contract_supports_auto_1440_transition", "Expected auto 1440 transition settings to be contract-valid."),
  validSchema.exitCode === 0 &&
    validAdmission.status === "pass" &&
    validAdmission.normalizedSummary?.sourceVideoAnalysisPresent === true
    ? pass("source_video_schema_accepts_bounded_deconstruction", "Schema and admission accept bounded transcript, scene, keyframe, beat, and safety source-video deconstruction.")
    : fail("source_video_schema_accepts_bounded_deconstruction", "Expected bounded source-video deconstruction to pass schema and admission."),
  malformedSourceSchema.exitCode !== 0 && malformedSourceAdmission.status === "fail"
    ? pass("malformed_source_video_schema_rejected", "Schema and admission reject malformed sourceVideoAnalysis before planning/provider spend.")
    : fail("malformed_source_video_schema_rejected", "Expected malformed sourceVideoAnalysis to be rejected by schema and admission."),
  mismatchedSourceSchema.exitCode === 0 && mismatchedSourceAdmission.status === "fail"
    ? pass("source_video_label_runtime_guard", "Runtime admission rejects sourceVideoAnalysis whose sourceReferenceLabel does not match a source_video_structure reference.")
    : fail("source_video_label_runtime_guard", "Expected runtime admission to reject mismatched sourceVideoAnalysis.sourceReferenceLabel."),
  emptySourceSchema.exitCode !== 0 && emptySourceAdmission.status === "fail"
    ? pass("empty_source_video_analysis_rejected", "Schema and admission reject empty sourceVideoAnalysis so source-video workflows require actual structure evidence.")
    : fail("empty_source_video_analysis_rejected", "Expected empty sourceVideoAnalysis to be rejected by schema and admission."),
  Array.isArray(atlasPayload.reference_images) &&
    atlasPayload.reference_images.length === 2 &&
    atlasPayload.reference_images[0] === "asset://render-contract/approved-kol" &&
    atlasPayload.reference_images[1] === "asset://render-contract/approved-product" &&
    Array.isArray(atlasPayload.reference_videos) &&
    atlasPayload.reference_videos[0] === "asset://render-contract/source-video" &&
    Array.isArray(atlasPayload.reference_audios) &&
    atlasPayload.reference_audios[0] === "asset://render-contract/voice-tempo" &&
    atlasPayload.image === "asset://render-contract/approved-kol" &&
    atlasPayload.image_url === "asset://render-contract/approved-kol" &&
    atlasPayload.video === "asset://render-contract/source-video" &&
    atlasPayload.video_url === "asset://render-contract/source-video" &&
    atlasPayload.audio === "asset://render-contract/voice-tempo" &&
    atlasPayload.audio_url === "asset://render-contract/voice-tempo" &&
    atlasPayload.return_last_frame === true
    ? pass("atlas_reference_payload_aliases", "Atlas video payload includes official reference_images/reference_videos/reference_audios arrays plus legacy single-reference aliases and return_last_frame.")
    : fail("atlas_reference_payload_aliases", "Expected Atlas video payload to preserve all reference array aliases and single-reference aliases before live provider spend.")
];

const failed = checks.filter((check) => check.status !== "pass");
const report = {
  schemaVersion: "cinejelly.render-request-contract-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: {
    schemaPath: "schemas/render-request.schema.json",
    outputPath: toRepoRelative(options.outputPath),
    fixtureDir: toRepoRelative(fixtureDir),
    validRequestPath: toRepoRelative(validRequestPath),
    flatReferenceRequestPath: toRepoRelative(flatReferenceRequestPath),
    secretQueryRequestPath: toRepoRelative(secretQueryRequestPath),
    malformedSourceVideoRequestPath: toRepoRelative(malformedSourceVideoRequestPath),
    mismatchedSourceLabelRequestPath: toRepoRelative(mismatchedSourceLabelRequestPath),
    emptySourceVideoRequestPath: toRepoRelative(emptySourceVideoRequestPath)
  },
  scenarios: {
    validProviderReference1440: summarizeScenario(validSchema, validAdmission),
    invalidFlatReference: summarizeScenario(flatSchema, flatAdmission),
    invalidSecretQueryReference: summarizeScenario(secretSchema, secretAdmission),
    invalidSourceVideoShape: summarizeScenario(malformedSourceSchema, malformedSourceAdmission),
    invalidSourceVideoLabel: summarizeScenario(mismatchedSourceSchema, mismatchedSourceAdmission),
    invalidEmptySourceVideoAnalysis: summarizeScenario(emptySourceSchema, emptySourceAdmission)
  },
  checks,
  releaseGateSummary: {
    renderRequestContractSmokePass: failed.length === 0,
    canUseAsNoSpendBackendEvidence: failed.length === 0,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: failed.length === 0
      ? "Render-request schema/admission contract is aligned for no-spend backend evidence; live provider validation and manual media review remain separate gates."
      : "Render-request schema/admission mismatch remains; fix contract drift before relying on API/UI clients."
  },
  nextActions: failed.length === 0
    ? [
        "Keep this smoke in the backend suite when changing render request schema, references, source-video analysis, or model settings.",
        "Use providerReference-shaped references for API/UI clients instead of legacy flat kind/uri references."
      ]
    : failed.map((check) => `${check.name}: ${check.message}`)
};

if (options.writeReport) {
  writeJson(resolve(repoRoot, options.outputPath), report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.status === "pass" ? 0 : 1;

function buildValidRequest() {
  return {
    userInput: "Create a 20-second UGC product short from approved KOL, product, and source-video structure references.",
    settings: {
      tier: "standard",
      resolution: "1440p-SR",
      qualityMode: "high",
      ratio: "9:16",
      durationTargetSeconds: 20,
      audioMode: "guided",
      bitrateMode: "high",
      watermark: false,
      returnLastFrame: true,
      maxCostUsd: 5
    },
    references: [
      {
        role: "identity",
        label: "Approved KOL reference",
        priority: "primary",
        providerReference: {
          kind: "identity",
          uri: "asset://short-contract/approved-kol",
          label: "Approved KOL reference"
        },
        selection: {
          characterId: "kol_mina",
          view: "front",
          authorized: true
        }
      },
      {
        role: "product",
        label: "Approved serum pack",
        priority: "primary",
        providerReference: {
          kind: "product",
          uri: "asset://short-contract/approved-serum-pack",
          label: "Approved serum pack"
        },
        selection: {
          view: "front",
          authorized: true
        }
      },
      {
        role: "source_video_structure",
        label: "Approved source trend",
        priority: "supporting",
        providerReference: {
          kind: "video",
          uri: "asset://short-contract/approved-source-trend",
          role: "source_video_structure",
          label: "Approved source trend"
        },
        selection: {
          timelineIndex: 0,
          authorized: true
        }
      }
    ],
    metadata: {
      requestId: "render_request_contract_smoke"
    },
    outputPath: "render-request-contract-smoke/final.mp4",
    workDirectory: "render-request-contract-smoke/work",
    artifactDirectory: "render-request-contract-smoke/artifacts",
    captionCues: [
      {
        startSecond: 0,
        endSecond: 2,
        text: "External review caption only; do not burn into video."
      }
    ],
    captionOptions: {
      enabled: false,
      burnIn: false,
      language: "en"
    },
    generatedAudioIntents: [
      {
        intentId: "vo_hook",
        kind: "tts_narration",
        prompt: "Warm, concise creator narration for a product proof hook.",
        startSecond: 0,
        endSecond: 4,
        durationSeconds: 4,
        language: "en",
        voiceStyle: "warm creator",
        mood: "confident",
        volume: 0.9,
        providerPreference: "atlascloud"
      }
    ],
    frameSamplingOptions: {
      enabled: true,
      outputDirectory: "render-request-contract-smoke/frames",
      intervalSeconds: 2,
      maxFrames: 12
    },
    transitionSettings: {
      enabled: true,
      kind: "auto",
      durationSeconds: 0.25,
      fps: 24,
      targetHeight: 1440,
      targetRatio: "9:16",
      preserveAudio: true
    },
    semanticVisualInspectionOptions: {
      enabled: true,
      modelId: "atlas-vision-contract-smoke",
      maxFrames: 12,
      expectations: [
        "KOL identity remains consistent across the generated clip.",
        "The serum pack is visible and not replaced by a generic bottle."
      ]
    },
    sourceVideoAnalysis: {
      sourceReferenceLabel: "Approved source trend",
      transformationIntent: "Learn source rhythm and camera grammar only; replace people, product, text, audio, and marks.",
      transcript: [
        {
          startSecond: 0,
          endSecond: 2,
          text: "Hook beat from approved source structure."
        }
      ],
      scenes: [
        {
          sceneId: "source_scene_1",
          startSecond: 0,
          endSecond: 4,
          summary: "Fast source hook with a handoff into product proof.",
          pacing: "fast hook, quick proof setup",
          camera: "handheld push-in then macro cut",
          audio: "structure only; do not reuse original audio",
          visualStyle: "native creator product proof",
          keyframes: [
            {
              timestampSecond: 1,
              description: "Creator introduces proof beat while product remains visible.",
              uri: "asset://short-contract/source-frame-1"
            }
          ]
        }
      ],
      pacingNotes: ["Open with a fast source-style pattern interrupt."],
      styleNotes: ["Use structure only, not protected visual identity."],
      structuralBeats: ["hook", "proof setup", "demo", "payoff"],
      safetyNotes: ["Do not copy source creator, captions, music, logo, or claims."]
    }
  };
}

function buildFlatReferenceRequest() {
  return {
    userInput: "Create a 15-second product short.",
    settings: {
      tier: "fast",
      resolution: "720p",
      qualityMode: "economy",
      ratio: "9:16",
      durationTargetSeconds: 15,
      audioMode: "none",
      bitrateMode: "standard",
      watermark: false,
      returnLastFrame: true,
      maxCostUsd: 1
    },
    references: [
      {
        kind: "image",
        uri: "asset://legacy-flat/reference",
        label: "Legacy flat reference",
        role: "product"
      }
    ]
  };
}

function buildSecretQueryRequest() {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_secret_query_smoke"
    },
    references: [
      {
        role: "product",
        label: "Signed product image",
        priority: "primary",
        providerReference: {
          kind: "product",
          uri: "https://cdn.example.com/product.png?token=secret",
          label: "Signed product image"
        },
        selection: {
          authorized: true
        }
      }
    ],
    sourceVideoAnalysis: undefined
  };
}

function buildMalformedSourceVideoRequest() {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_malformed_source_video_smoke"
    },
    sourceVideoAnalysis: {
      sourceReferenceLabel: "Approved source trend",
      transcript: "not-an-array",
      scenes: [
        {
          sceneId: "source_scene_1",
          startSecond: 0,
          endSecond: 4,
          summary: "Valid scene surrounded by malformed transcript."
        }
      ]
    }
  };
}

function buildMismatchedSourceLabelRequest() {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_mismatched_source_label_smoke"
    },
    sourceVideoAnalysis: {
      ...request.sourceVideoAnalysis,
      sourceReferenceLabel: "Unmatched source trend label"
    }
  };
}

function buildEmptySourceVideoRequest() {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_empty_source_video_analysis_smoke"
    },
    sourceVideoAnalysis: {
      sourceReferenceLabel: "Approved source trend"
    }
  };
}

function validateRequestSchema(name, requestPath, outputPath) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/validate-report-contracts.mjs",
      "--only-contract",
      `${name}:schemas/render-request.schema.json=${toRepoRelative(requestPath)}`,
      "--output",
      toRepoRelative(outputPath),
      "--max-issues-per-contract",
      "8"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    }
  );
  return {
    exitCode: result.status ?? 1,
    status: result.status === 0 ? "pass" : "fail",
    reportPath: toRepoRelative(outputPath),
    stdoutTail: tail(result.stdout, 1200),
    stderrTail: tail(result.stderr, 1200),
    issueCount: readIssueCount(outputPath)
  };
}

async function captureAtlasVideoPayload() {
  const captured = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if (typeof init?.body === "string") {
      captured.push(JSON.parse(init.body));
    }
    return new Response(
      JSON.stringify({
        id: "pred_render_contract_payload_smoke",
        status: "succeeded",
        output: ["https://cdn.example.com/render-contract-payload.mp4"]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };
  try {
    const provider = new AtlasCloudProvider({
      apiKey: "test_api_key",
      apiBaseUrl: "https://api.atlascloud.ai/v1",
      assetBaseUrl: "https://api.atlascloud.ai/api/v1",
      models: {
        llmModel: "atlas-llm-smoke",
        seedanceStandardModel: "bytedance/seedance-2.0/reference-to-video",
        seedanceFastModel: "bytedance/seedance-2.0-fast/reference-to-video",
        seedanceMiniModel: "bytedance/seedance-2.0-mini/text-to-video"
      },
      requestTimeoutMs: 5_000,
      maxJsonResponseBytes: 1024 * 1024,
      pollingIntervalMs: 1,
      pollingTimeoutMs: 10_000
    });
    await provider.generateReferenceToVideo({
      provider: "atlascloud",
      modelId: "bytedance/seedance-2.0/reference-to-video",
      mode: "reference_to_video",
      prompt: "Use @image1/image 1 as KOL, @image2/image 2 as product, @video1/video 1 as structure, and @audio1/audio 1 as tempo only.",
      negativePrompt: "no copied source face, no copied source music",
      references: [
        { kind: "image", uri: "asset://render-contract/approved-kol", role: "identity", label: "Approved KOL" },
        { kind: "product", uri: "asset://render-contract/approved-product", role: "product", label: "Approved product" },
        { kind: "video", uri: "asset://render-contract/source-video", role: "source_video_structure", label: "Source structure" },
        { kind: "audio", uri: "asset://render-contract/voice-tempo", role: "audio_tempo", label: "Voice tempo" }
      ],
      settings: {
        durationSeconds: 8,
        resolution: "720p",
        ratio: "9:16",
        generateAudio: true,
        bitrateMode: "standard",
        watermark: false,
        returnLastFrame: true
      },
      metadata: {
        graphNodeId: "render-contract-payload-smoke"
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const payload = captured[0];
  if (!payload) {
    throw new Error("Atlas payload smoke did not capture a video payload.");
  }
  return payload;
}

function readIssueCount(outputPath) {
  try {
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    return Number(report.summary?.failed ?? 0);
  } catch {
    return undefined;
  }
}

function summarizeScenario(schemaRun, admissionReport) {
  return {
    schemaStatus: schemaRun.status,
    schemaExitCode: schemaRun.exitCode,
    schemaReportPath: schemaRun.reportPath,
    admissionStatus: admissionReport.status,
    normalizedReferenceCount: admissionReport.normalizedSummary?.referenceCount ?? 0,
    sourceVideoAnalysisPresent: admissionReport.normalizedSummary?.sourceVideoAnalysisPresent === true,
    semanticVisualInspectionEnabled: admissionReport.normalizedSummary?.semanticVisualInspectionEnabled === true,
    issueCodes: admissionReport.issues?.map((issue) => issue.code) ?? [],
    firstIssueMessage: admissionReport.issues?.[0]?.message
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function toRepoRelative(path) {
  return resolve(path).startsWith(repoRoot)
    ? resolve(path).slice(repoRoot.length + 1)
    : path;
}

function tail(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `...[truncated]\n${text.slice(-max)}` : text;
}
