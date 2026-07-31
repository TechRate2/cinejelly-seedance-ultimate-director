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
  node tests/run-render-request-contract-smoke.mjs

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
const invalidSourceVideoMediaMetricsRequestPath = resolve(fixtureDir, "invalid-source-video-media-metrics.json");
const invalidSeedanceCapabilityRequestPath = resolve(fixtureDir, "invalid-seedance-capability-settings.json");
const validSchemaReportPath = resolve(fixtureDir, "valid-provider-reference-schema-report.json");
const flatSchemaReportPath = resolve(fixtureDir, "invalid-flat-reference-schema-report.json");
const secretSchemaReportPath = resolve(fixtureDir, "secret-query-reference-schema-report.json");
const malformedSourceSchemaReportPath = resolve(fixtureDir, "invalid-source-video-shape-schema-report.json");
const mismatchedSourceSchemaReportPath = resolve(fixtureDir, "invalid-source-video-label-schema-report.json");
const emptySourceSchemaReportPath = resolve(fixtureDir, "invalid-empty-source-video-analysis-schema-report.json");
const invalidSourceVideoMediaMetricsSchemaReportPath = resolve(fixtureDir, "invalid-source-video-media-metrics-schema-report.json");
const invalidSeedanceCapabilitySchemaReportPath = resolve(fixtureDir, "invalid-seedance-capability-settings-schema-report.json");
const miniCapabilityModelId = "bytedance/seedance-2.0-mini/text-to-video";
const seedanceCapabilityAdmissionEnv = {
  ...process.env,
  ATLASCLOUD_SEEDANCE_FAST_MODEL: "bytedance/seedance-2.0-fast/reference-to-video",
  ATLASCLOUD_SEEDANCE_STANDARD_MODEL: "bytedance/seedance-2.0/reference-to-video",
  ATLASCLOUD_SEEDANCE_MINI_MODEL: miniCapabilityModelId,
  ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON: JSON.stringify([
    {
      provider: "atlascloud",
      modelId: miniCapabilityModelId,
      modes: ["text_to_video", "image_to_video", "reference_to_video"],
      durations: { min: 4, max: 15 },
      resolutions: ["480p", "720p"],
      ratios: ["9:16", "16:9", "1:1"],
      references: ["image", "product", "identity"],
      settings: {
        generateAudio: false,
        returnLastFrame: false,
        bitrateModes: ["standard"],
        watermark: false
      },
      async: true
    }
  ])
};

writeJson(validRequestPath, buildValidRequest());
writeJson(flatReferenceRequestPath, buildFlatReferenceRequest());
writeJson(secretQueryRequestPath, buildSecretQueryRequest());
writeJson(malformedSourceVideoRequestPath, buildMalformedSourceVideoRequest());
writeJson(mismatchedSourceLabelRequestPath, buildMismatchedSourceLabelRequest());
writeJson(emptySourceVideoRequestPath, buildEmptySourceVideoRequest());
writeJson(invalidSourceVideoMediaMetricsRequestPath, buildInvalidSourceVideoMediaMetricsRequest());
writeJson(invalidSeedanceCapabilityRequestPath, buildInvalidSeedanceCapabilityRequest(miniCapabilityModelId));

const { validateRenderRequestFile } = await import("../dist/application/render-request-validation-entrypoint.js");
const { buildRenderSettingsDescriptor } = await import("../dist/application/render-settings-descriptor.js");
const { AtlasCloudProvider } = await import("../dist/providers/atlascloud/atlas-cloud-provider.js");

const validSchema = validateRequestSchema("valid_provider_reference", validRequestPath, validSchemaReportPath);
const flatSchema = validateRequestSchema("invalid_flat_reference", flatReferenceRequestPath, flatSchemaReportPath);
const secretSchema = validateRequestSchema("secret_query_reference", secretQueryRequestPath, secretSchemaReportPath);
const malformedSourceSchema = validateRequestSchema("invalid_source_video_shape", malformedSourceVideoRequestPath, malformedSourceSchemaReportPath);
const mismatchedSourceSchema = validateRequestSchema("invalid_source_video_label", mismatchedSourceLabelRequestPath, mismatchedSourceSchemaReportPath);
const emptySourceSchema = validateRequestSchema("invalid_empty_source_video_analysis", emptySourceVideoRequestPath, emptySourceSchemaReportPath);
const invalidSourceVideoMediaMetricsSchema = validateRequestSchema("invalid_source_video_media_metrics", invalidSourceVideoMediaMetricsRequestPath, invalidSourceVideoMediaMetricsSchemaReportPath);
const invalidSeedanceCapabilitySchema = validateRequestSchema("invalid_seedance_capability_settings", invalidSeedanceCapabilityRequestPath, invalidSeedanceCapabilitySchemaReportPath);

const validAdmission = await validateRenderRequestFile(validRequestPath, process.env);
const flatAdmission = await validateRenderRequestFile(flatReferenceRequestPath, process.env);
const secretAdmission = await validateRenderRequestFile(secretQueryRequestPath, process.env);
const malformedSourceAdmission = await validateRenderRequestFile(malformedSourceVideoRequestPath, process.env);
const mismatchedSourceAdmission = await validateRenderRequestFile(mismatchedSourceLabelRequestPath, process.env);
const emptySourceAdmission = await validateRenderRequestFile(emptySourceVideoRequestPath, process.env);
const invalidSourceVideoMediaMetricsAdmission = await validateRenderRequestFile(invalidSourceVideoMediaMetricsRequestPath, process.env);
const invalidSeedanceCapabilityAdmission = await validateRenderRequestFile(
  invalidSeedanceCapabilityRequestPath,
  seedanceCapabilityAdmissionEnv
);
const atlasPayload = await captureAtlasVideoPayload();
const atlasCapabilityGuard = await validateAtlasCapabilitySettingsGuard();
const renderSettingsDescriptorGuard = validateRenderSettingsDescriptorCapabilitySupport();
const safeDefaultValidationRequest = createSafeDefaultValidationRequest();

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
    validAdmission.normalizedSummary?.sourceVideoAnalysisPresent === true &&
    buildValidRequest().sourceVideoAnalysis.mediaMetrics?.schemaVersion === "cinejelly.source-video-media-metrics.v1"
    ? pass("source_video_schema_accepts_bounded_deconstruction", "Schema and admission accept bounded transcript, scene, keyframe, media metrics, beat, and safety source-video deconstruction.")
    : fail("source_video_schema_accepts_bounded_deconstruction", "Expected bounded source-video deconstruction with media metrics to pass schema and admission."),
  malformedSourceSchema.exitCode !== 0 && malformedSourceAdmission.status === "fail"
    ? pass("malformed_source_video_schema_rejected", "Schema and admission reject malformed sourceVideoAnalysis before planning/provider spend.")
    : fail("malformed_source_video_schema_rejected", "Expected malformed sourceVideoAnalysis to be rejected by schema and admission."),
  mismatchedSourceSchema.exitCode === 0 && mismatchedSourceAdmission.status === "fail"
    ? pass("source_video_label_runtime_guard", "Runtime admission rejects sourceVideoAnalysis whose sourceReferenceLabel does not match a source_video_structure reference.")
    : fail("source_video_label_runtime_guard", "Expected runtime admission to reject mismatched sourceVideoAnalysis.sourceReferenceLabel."),
  emptySourceSchema.exitCode !== 0 && emptySourceAdmission.status === "fail"
    ? pass("empty_source_video_analysis_rejected", "Schema and admission reject empty sourceVideoAnalysis so source-video workflows require actual structure evidence.")
    : fail("empty_source_video_analysis_rejected", "Expected empty sourceVideoAnalysis to be rejected by schema and admission."),
  invalidSourceVideoMediaMetricsSchema.exitCode !== 0 && invalidSourceVideoMediaMetricsAdmission.status === "fail"
    ? pass("invalid_source_video_media_metrics_rejected", "Schema and admission reject invalid source-video media metrics before remake/story planning.")
    : fail("invalid_source_video_media_metrics_rejected", "Expected invalid source-video media metrics to be rejected by schema and admission."),
  invalidSeedanceCapabilitySchema.exitCode === 0 &&
    invalidSeedanceCapabilityAdmission.status === "fail" &&
    /not supported by Seedance model/i.test(invalidSeedanceCapabilityAdmission.issues?.[0]?.message ?? "")
    ? pass("seedance_model_capability_admission_guard", "Runtime admission rejects model-specific Seedance settings that schema can express but the selected model cannot support.")
    : fail("seedance_model_capability_admission_guard", "Expected runtime admission to reject unsupported Mini resolution/audio/last-frame/bitrate settings before planning/provider spend."),
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
    atlasPayload.generate_audio === true &&
    atlasPayload.bitrate_mode === "high" &&
    atlasPayload.return_last_frame === true
    ? pass("atlas_reference_payload_aliases", "Atlas video payload includes reference arrays, single-reference aliases, native audio, high bitrate, and return_last_frame.")
    : fail("atlas_reference_payload_aliases", "Expected Atlas video payload to preserve reference aliases plus audio/high-bitrate/last-frame settings before live provider spend."),
  atlasCapabilityGuard.status === "pass"
    ? pass("atlas_capability_settings_guard", "Atlas provider blocks unsupported native audio, last-frame, and high-bitrate settings before any network call.")
    : fail("atlas_capability_settings_guard", atlasCapabilityGuard.message),
  renderSettingsDescriptorGuard.status === "pass"
    ? pass("render_settings_descriptor_capability_support", "Render settings descriptor exposes model-level capability support for audio, last-frame, bitrate, references, and mini resolution bounds.")
    : fail("render_settings_descriptor_capability_support", renderSettingsDescriptorGuard.message),
  safeDefaultValidationRequest.status === "pass"
    ? pass("safe_default_validation_request_uses_production_defaults", "validation:create-request safe default now emits 720p standard quality, hybrid audio, high bitrate, and last-frame return.")
    : fail("safe_default_validation_request_uses_production_defaults", safeDefaultValidationRequest.message)
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
    emptySourceVideoRequestPath: toRepoRelative(emptySourceVideoRequestPath),
    invalidSourceVideoMediaMetricsRequestPath: toRepoRelative(invalidSourceVideoMediaMetricsRequestPath),
    invalidSeedanceCapabilityRequestPath: toRepoRelative(invalidSeedanceCapabilityRequestPath)
  },
  scenarios: {
    validProviderReference1440: {
      ...summarizeScenario(validSchema, validAdmission),
      sourceVideoMediaMetricsPresent: true
    },
    invalidFlatReference: summarizeScenario(flatSchema, flatAdmission),
    invalidSecretQueryReference: summarizeScenario(secretSchema, secretAdmission),
    invalidSourceVideoShape: summarizeScenario(malformedSourceSchema, malformedSourceAdmission),
    invalidSourceVideoLabel: summarizeScenario(mismatchedSourceSchema, mismatchedSourceAdmission),
    invalidEmptySourceVideoAnalysis: summarizeScenario(emptySourceSchema, emptySourceAdmission),
    invalidSourceVideoMediaMetrics: summarizeScenario(invalidSourceVideoMediaMetricsSchema, invalidSourceVideoMediaMetricsAdmission),
    invalidSeedanceCapabilitySettings: summarizeScenario(invalidSeedanceCapabilitySchema, invalidSeedanceCapabilityAdmission)
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
      safetyNotes: ["Do not copy source creator, captions, music, logo, or claims."],
      mediaMetrics: {
        schemaVersion: "cinejelly.source-video-media-metrics.v1",
        durationSeconds: 18,
        bitrate: 3200000,
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
          sceneCutTimestampsSeconds: [1.2, 3.6, 7.4, 11.2, 14.8]
        },
        evidence: {
          probeSucceeded: true,
          sceneDetectionSucceeded: true,
          sourceUriSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      }
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

function buildInvalidSourceVideoMediaMetricsRequest() {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_invalid_source_video_media_metrics_smoke"
    },
    sourceVideoAnalysis: {
      ...request.sourceVideoAnalysis,
      mediaMetrics: {
        ...request.sourceVideoAnalysis.mediaMetrics,
        editRhythm: {
          ...request.sourceVideoAnalysis.mediaMetrics.editRhythm,
          rhythmLabel: "too_fast_to_validate"
        },
        evidence: {
          ...request.sourceVideoAnalysis.mediaMetrics.evidence,
          sourceUriSha256: "https://source.example.com/video.mp4"
        }
      }
    }
  };
}

function buildInvalidSeedanceCapabilityRequest(modelId) {
  const request = buildValidRequest();
  return {
    ...request,
    metadata: {
      requestId: "render_request_contract_invalid_seedance_capability_smoke"
    },
    modelPreferences: {
      seedanceModelId: modelId
    },
    settings: {
      ...request.settings,
      tier: "mini",
      resolution: "1080p",
      audioMode: "native",
      bitrateMode: "high",
      returnLastFrame: true
    },
    sourceVideoAnalysis: undefined
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
        bitrateMode: "high",
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

async function validateAtlasCapabilitySettingsGuard() {
  const cases = [
    {
      name: "native_audio",
      capabilitySettings: { generateAudio: false, returnLastFrame: true, bitrateModes: ["standard", "high"], watermark: true },
      requestSettings: { generateAudio: true, returnLastFrame: false, bitrateMode: "standard", watermark: false }
    },
    {
      name: "return_last_frame",
      capabilitySettings: { generateAudio: true, returnLastFrame: false, bitrateModes: ["standard", "high"], watermark: true },
      requestSettings: { generateAudio: false, returnLastFrame: true, bitrateMode: "standard", watermark: false }
    },
    {
      name: "high_bitrate",
      capabilitySettings: { generateAudio: true, returnLastFrame: true, bitrateModes: ["standard"], watermark: true },
      requestSettings: { generateAudio: false, returnLastFrame: false, bitrateMode: "high", watermark: false }
    }
  ];
  const failures = [];
  for (const item of cases) {
    const result = await validateAtlasCapabilitySettingsCase(item);
    if (result.status !== "pass") {
      failures.push(result.message);
    }
  }
  return failures.length === 0
    ? { status: "pass", message: "All Atlas capability setting guards passed." }
    : { status: "fail", message: failures.join("; ") };
}

async function validateAtlasCapabilitySettingsCase(item) {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        id: "pred_unexpected_capability_guard_call",
        status: "succeeded",
        output: ["https://cdn.example.com/unexpected.mp4"]
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
        seedanceStandardModel: "capability-guard-model",
        seedanceFastModel: "capability-guard-model"
      },
      seedanceCapabilities: [
        {
          provider: "atlascloud",
          modelId: "capability-guard-model",
          modes: ["reference_to_video"],
          durations: { min: 4, max: 15 },
          resolutions: ["720p"],
          ratios: ["9:16"],
          references: ["image", "product"],
          settings: item.capabilitySettings,
          async: true
        }
      ],
      requestTimeoutMs: 5_000,
      maxJsonResponseBytes: 1024 * 1024,
      pollingIntervalMs: 1,
      pollingTimeoutMs: 10_000
    });
    await provider.generateReferenceToVideo({
      provider: "atlascloud",
      modelId: "capability-guard-model",
      mode: "reference_to_video",
      prompt: "Capability guard should reject this request before network.",
      references: [
        { kind: "image", uri: "asset://capability-guard/product", role: "product", label: "Product" }
      ],
      settings: {
        durationSeconds: 8,
        resolution: "720p",
        ratio: "9:16",
        ...item.requestSettings
      }
    });
    return {
      status: "fail",
      message: `${item.name} was accepted unexpectedly.`
    };
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "UNSUPPORTED_SETTING" && fetchCalls === 0) {
      return { status: "pass", message: `${item.name} rejected before network.` };
    }
    return {
      status: "fail",
      message: `${item.name} expected UNSUPPORTED_SETTING before network, got ${code || String(error)} with ${fetchCalls} fetch call(s).`
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function validateRenderSettingsDescriptorCapabilitySupport() {
  const standardModelId = "bytedance/seedance-2.0/reference-to-video";
  const miniModelId = "bytedance/seedance-2.0-mini/text-to-video";
  const descriptor = buildRenderSettingsDescriptor({
    ATLASCLOUD_LLM_MODEL: "atlas-llm-smoke",
    ATLASCLOUD_SEEDANCE_STANDARD_MODEL: standardModelId,
    ATLASCLOUD_SEEDANCE_FAST_MODEL: "bytedance/seedance-2.0-fast/reference-to-video",
    ATLASCLOUD_SEEDANCE_MINI_MODEL: miniModelId,
    ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON: JSON.stringify([
      {
        provider: "atlascloud",
        modelId: standardModelId,
        modes: ["reference_to_video"],
        durations: { min: 4, max: 12 },
        resolutions: ["720p", "1080p"],
        ratios: ["9:16"],
        references: ["image", "video", "product"],
        settings: {
          generateAudio: false,
          returnLastFrame: true,
          bitrateModes: ["standard"],
          watermark: false
        },
        async: true
      }
    ])
  });
  const selectableModels = descriptor.modelSelection.seedance.selectableModels;
  const standard = selectableModels.find((model) => model.modelId === standardModelId);
  const mini = selectableModels.find((model) => model.modelId === miniModelId);
  const failures = [];
  if (!standard) {
    failures.push("configured standard model is missing from selectableModels");
  } else {
    if (standard.capabilitySupport.capabilitySource !== "capability_json") {
      failures.push("standard model did not use capability_json support");
    }
    if (standard.capabilitySupport.durations.max !== 12) {
      failures.push("standard model duration override was not exposed");
    }
    if (standard.capabilitySupport.effectiveSettings.generateAudio !== false) {
      failures.push("standard model audio override was not exposed");
    }
    if (standard.capabilitySupport.effectiveSettings.returnLastFrame !== true) {
      failures.push("standard model returnLastFrame support was not exposed");
    }
    if (standard.capabilitySupport.effectiveSettings.bitrateModes.join(",") !== "standard") {
      failures.push("standard model bitrate override was not exposed");
    }
    if (standard.capabilitySupport.effectiveSettings.watermark !== false) {
      failures.push("standard model watermark override was not exposed");
    }
    if (!standard.capabilitySupport.references.includes("product")) {
      failures.push("standard model product reference support was not exposed");
    }
  }
  if (!mini) {
    failures.push("configured mini model is missing from selectableModels");
  } else {
    if (mini.capabilitySupport.capabilitySource !== "documented_default") {
      failures.push("mini model should use documented default support when no capability record is configured");
    }
    if (mini.capabilitySupport.resolutions.join(",") !== "480p,720p") {
      failures.push("mini documented default resolutions should stay bounded to 480p and 720p");
    }
    if (!mini.capabilitySupport.effectiveSettings.generateAudio || !mini.capabilitySupport.effectiveSettings.returnLastFrame) {
      failures.push("mini documented defaults should expose audio and returnLastFrame support");
    }
    if (!mini.capabilitySupport.effectiveSettings.bitrateModes.includes("high")) {
      failures.push("mini documented defaults should expose high bitrate support");
    }
  }
  return failures.length === 0
    ? { status: "pass", message: "Render settings descriptor capability support passed." }
    : { status: "fail", message: failures.join("; ") };
}

function createSafeDefaultValidationRequest() {
  const outputPath = resolve(fixtureDir, "safe-default-validation-request.json");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/create-validation-request.mjs",
      "--safe-default",
      "--output",
      toRepoRelative(outputPath)
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  );
  if ((result.status ?? 1) !== 0) {
    return {
      status: "fail",
      message: `safe-default request creation failed: ${tail(result.stderr || result.stdout, 400)}`
    };
  }
  let request;
  try {
    request = JSON.parse(readFileSync(outputPath, "utf8"));
  } catch (error) {
    return {
      status: "fail",
      message: `safe-default request JSON could not be read: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  const settings = request.settings ?? {};
  const passDefaults =
    settings.tier === "standard" &&
    settings.resolution === "720p" &&
    settings.qualityMode === "standard" &&
    settings.audioMode === "hybrid" &&
    settings.bitrateMode === "high" &&
    settings.returnLastFrame === true &&
    settings.watermark === false;
  return passDefaults
    ? { status: "pass", message: "Safe-default validation request settings are production aligned." }
    : {
        status: "fail",
        message: `safe-default settings drifted: ${JSON.stringify(settings)}`
      };
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
