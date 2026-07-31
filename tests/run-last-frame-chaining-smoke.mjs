#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "assets/output_deliverables/business-readiness/last-frame-chaining-smoke-report.json");
const sourcePatternOrigins = ["HKUDS/VideoAgent", "vericontext/vibeframe", "MoneyPrinterTurbo"];

const { DirectorAgent } = await import("../dist/agents/director-agent.js");
const { RenderProducer } = await import("../dist/agents/render-producer.js");
const { isImageOutputUrl, selectOrExtractLastFrameReference } = await import("../dist/core/endpoint-frame-chain.js");
const { readMediaToolCommand } = await import("../dist/utils/media-tools.js");
const { runProcess } = await import("../dist/utils/process.js");

async function main() {
const provider = new FakeVideoProvider();
const director = new DirectorAgent({
  storyArchitect: new FixedStoryArchitect(),
  renderProducer: new RenderProducer(provider),
  atlasSettings: atlasSettings()
});

const result = await director.run({
  userInput: "Create a coherent 30 second multi-shot product proof video with one continuous visual idea.",
  settings: {
    tier: "fast",
    resolution: "480p",
    qualityMode: "economy",
    ratio: "16:9",
    durationTargetSeconds: 30,
    audioMode: "none",
    watermark: false,
    returnLastFrame: true
  },
  metadata: {
    workflowMode: "auto",
    storyboardApproval: "approved",
    storyboardReviewer: "Long smoke reviewer",
    storyboardReviewedAt: "2026-06-20T00:00:00.000Z"
  }
});

const publicRequests = provider.requests.map((request, index) => ({
  index,
  mode: request.mode,
  referenceRoles: request.references.map((reference) => reference.role ?? reference.kind).sort(),
  referenceKinds: request.references.map((reference) => reference.kind).sort(),
  hasFirstFrameReference: request.references.some((reference) => reference.role === "first_frame" || reference.kind === "first_frame"),
  chainedFromShotId: request.metadata?.chainedFromShotId,
  chainReferenceUrlSha256: request.metadata?.chainReferenceUrlSha256,
  chainEndpointFrameStrategy: request.metadata?.chainEndpointFrameStrategy,
  chainEndpointFrameCandidateCount: request.metadata?.chainEndpointFrameCandidateCount,
  chainEndpointFrameQualityScore: request.metadata?.chainEndpointFrameQualityScore,
  promptMentionsContinuityFrame: /Continuity frame from shot/i.test(request.prompt)
}));
const renderedPromptSummaries = result.compiledPrompts.map((prompt, index) => ({
  index,
  shotId: prompt.shotId,
  mode: prompt.videoRequest.mode,
  hasFirstFrameReference: prompt.videoRequest.references.some((reference) => reference.role === "first_frame" || reference.kind === "first_frame"),
  chainedFromShotId: prompt.videoRequest.metadata?.chainedFromShotId,
  chainReferenceUrlSha256: prompt.videoRequest.metadata?.chainReferenceUrlSha256,
  chainEndpointFrameStrategy: prompt.videoRequest.metadata?.chainEndpointFrameStrategy,
  chainEndpointFrameCandidateCount: prompt.videoRequest.metadata?.chainEndpointFrameCandidateCount,
  chainEndpointFrameQualityScore: prompt.videoRequest.metadata?.chainEndpointFrameQualityScore
}));
const serializedPublicReport = JSON.stringify({ publicRequests, renderedPromptSummaries });
const rawUrlLeakDetected = serializedPublicReport.includes("https://cdn.example.test") ||
  serializedPublicReport.includes("token=secret") ||
  serializedPublicReport.includes("api_key=");
const fallbackExtraction = await runFallbackExtractionScenario();
const localSidecarSelection = await runLocalSidecarSelectionScenario();

const checks = [
  result.videoRenderStrategyPlan.workflowMode === "storyboard_multishot" &&
    result.videoRenderStrategyPlan.lastFrameChaining.status === "required" &&
    result.videoRenderStrategyPlan.requiresSequentialRender === true
    ? pass("strategy_requires_chaining", "Auto multishot without references requires last-frame chaining and sequential render.")
    : fail("strategy_requires_chaining", "Strategy did not require last-frame chaining for prompt-only multishot."),
  result.storyboardApprovalReport?.status === "approved" &&
    result.storyboardApprovalReport.releaseGateSummary.canRenderAfterReview === true
    ? pass("storyboard_approval_allows_render", "Approved storyboard evidence allows fake provider spend.")
    : fail("storyboard_approval_allows_render", "Storyboard approval evidence did not allow render."),
  provider.requests.length === 3
    ? pass("provider_request_count", "Fake provider received one render request per planned shot.")
    : fail("provider_request_count", `Expected 3 provider requests, saw ${provider.requests.length}.`),
  publicRequests[0]?.hasFirstFrameReference === false &&
    publicRequests.slice(1).every((request) => request.hasFirstFrameReference)
    ? pass("first_frame_injected_after_first_shot", "Shot 2+ provider requests received first-frame references from previous shot endpoint frames.")
    : fail("first_frame_injected_after_first_shot", "Shot 2+ did not receive first-frame references."),
  publicRequests.slice(1).every((request) => request.referenceKinds.includes("image") && !request.referenceKinds.includes("first_frame"))
    ? pass("chained_reference_uses_provider_image_kind", "Chained first-frame references use provider-compatible image kind while retaining first_frame role semantics.")
    : fail("chained_reference_uses_provider_image_kind", "Expected chained references to use image kind instead of provider-specific first_frame kind."),
  publicRequests.slice(1).every((request) => request.mode === "image_to_video")
    ? pass("provider_mode_switches_to_image_to_video", "Chained shot requests switch to image-to-video mode.")
    : fail("provider_mode_switches_to_image_to_video", "Chained shot requests did not switch to image-to-video mode."),
  renderedPromptSummaries.slice(1).every((prompt) => prompt.chainedFromShotId && prompt.chainReferenceUrlSha256)
    ? pass("compiled_prompt_chain_metadata", "Rendered compiled prompts preserve chain source metadata and URL digest evidence.")
    : fail("compiled_prompt_chain_metadata", "Compiled prompt chain metadata is missing."),
  renderedPromptSummaries.slice(1).every((prompt) =>
    prompt.chainEndpointFrameStrategy === "provider_sidecar" &&
    Number(prompt.chainEndpointFrameCandidateCount) >= 1 &&
    Number(prompt.chainEndpointFrameQualityScore) > 0
  )
    ? pass("endpoint_frame_quality_metadata", "Chained prompts carry endpoint-frame selection strategy, candidate count, and quality score evidence.")
    : fail("endpoint_frame_quality_metadata", "Expected endpoint-frame quality metadata on chained prompts."),
  result.renderSchedulePlan.sequentialItemCount === 3 &&
    result.renderSchedulePlan.items.every((item) => item.sequentialReasons.includes("strategy_last_frame_chaining"))
    ? pass("schedule_forces_sequential_chaining", "Render schedule marks every shot sequential for last-frame chaining.")
    : fail("schedule_forces_sequential_chaining", "Render schedule did not force sequential chaining."),
  result.renderedShots.length === 3 &&
    result.renderedShots.every((shot) => shot.prediction.status === "succeeded")
    ? pass("rendered_shots_succeeded", "All fake provider shots succeeded.")
    : fail("rendered_shots_succeeded", "At least one fake provider shot failed."),
  !rawUrlLeakDetected
    ? pass("public_report_redacts_raw_urls", "Smoke report stores only role/mode/hash evidence, not raw provider output URLs.")
    : fail("public_report_redacts_raw_urls", "Smoke report leaked raw output URLs or secret-like query text."),
  fallbackExtraction.extracted &&
    fallbackExtraction.outputExists &&
    fallbackExtraction.providerKind === "image" &&
    fallbackExtraction.role === "first_frame" &&
    fallbackExtraction.qualityStrategy === "ffmpeg_multi_offset" &&
    fallbackExtraction.qualityCandidateCount >= 1 &&
    fallbackExtraction.selectedFileSizeBytes > 0 &&
    fallbackExtraction.qualityScore > 0
    ? pass("ffmpeg_last_frame_fallback_extracts_image", "When no provider sidecar image exists, the fallback extracts scored endpoint-frame candidates and selects a first-frame image reference.")
    : fail("ffmpeg_last_frame_fallback_extracts_image", "Expected ffmpeg fallback to extract a scored first-frame image reference from a video output."),
  localSidecarSelection.recognizedAsImage &&
    localSidecarSelection.selected &&
    localSidecarSelection.extracted === false &&
    localSidecarSelection.outputIndex === 1 &&
    localSidecarSelection.providerKind === "image" &&
    localSidecarSelection.role === "first_frame" &&
    localSidecarSelection.qualityStrategy === "provider_sidecar"
    ? pass("local_last_frame_sidecar_selected_without_fallback", "Local image sidecar outputs are recognized and selected directly for first-frame chaining without ffmpeg fallback.")
    : fail("local_last_frame_sidecar_selected_without_fallback", "Expected local last-frame image sidecar output to be selected directly.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.last-frame-chaining-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  fakeProviderCallsMade: true,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: "assets/output_deliverables/business-readiness/last-frame-chaining-smoke-report.json",
    targetDurationSeconds: 30,
    plannedShotCount: result.storyboard.panels.length,
    storyboardApprovalStatus: result.storyboardApprovalReport?.status,
    rawUrlLeakCheckPassed: !rawUrlLeakDetected
  },
  fallbackExtraction: {
    extracted: fallbackExtraction.extracted,
    outputExists: fallbackExtraction.outputExists,
    providerKind: fallbackExtraction.providerKind,
    role: fallbackExtraction.role,
    sourceVideoOutputIndex: fallbackExtraction.sourceVideoOutputIndex,
    outputUrlSha256Present: Boolean(fallbackExtraction.outputUrlSha256),
    qualityStrategy: fallbackExtraction.qualityStrategy,
    qualityCandidateCount: fallbackExtraction.qualityCandidateCount,
    selectedOffsetSeconds: fallbackExtraction.selectedOffsetSeconds,
    selectedFileSizeBytes: fallbackExtraction.selectedFileSizeBytes,
    qualityScore: fallbackExtraction.qualityScore
  },
  localSidecarSelection: {
    recognizedAsImage: localSidecarSelection.recognizedAsImage,
    selected: localSidecarSelection.selected,
    extracted: localSidecarSelection.extracted,
    outputIndex: localSidecarSelection.outputIndex,
    outputUrlSha256Present: Boolean(localSidecarSelection.outputUrlSha256),
    providerKind: localSidecarSelection.providerKind,
    role: localSidecarSelection.role,
    qualityStrategy: localSidecarSelection.qualityStrategy,
    qualityCandidateCount: localSidecarSelection.qualityCandidateCount,
    qualityScore: localSidecarSelection.qualityScore
  },
  strategy: {
    requestedMode: result.videoRenderStrategyPlan.requestedMode,
    workflowMode: result.videoRenderStrategyPlan.workflowMode,
    continuityMode: result.videoRenderStrategyPlan.continuityMode,
    lastFrameChainingStatus: result.videoRenderStrategyPlan.lastFrameChaining.status,
    requiresSequentialRender: result.videoRenderStrategyPlan.requiresSequentialRender
  },
  publicRequests,
  renderedPromptSummaries,
  renderSchedule: {
    batchCount: result.renderSchedulePlan.batchCount,
    parallelBatchCount: result.renderSchedulePlan.parallelBatchCount,
    sequentialItemCount: result.renderSchedulePlan.sequentialItemCount,
    sequentialReasons: [...new Set(result.renderSchedulePlan.items.flatMap((item) => item.sequentialReasons))].sort()
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendLastFrameChainingEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Last-frame chaining smoke proves no-spend director orchestration with a fake provider only; paid Atlas reference-locked validation and manual media review remain separate gates."
      : "Last-frame chaining smoke failed; fix director orchestration before paid long-form reference validation."
  },
  nextActions: status === "pass"
    ? [
        "Run paid reference-locked validation with an approved product/person/source reference.",
        "Inspect compiled-prompts.json from the next paid multishot run for first_frame chain metadata.",
        "Keep this smoke passing before building UI scene retry controls."
      ]
    : ["Fix last-frame chaining orchestration before continuing long backend hardening."]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;
}

class FixedStoryArchitect {
  async plan(intake) {
    return {
      premise: "A coherent product proof built as three chained shots.",
      targetDurationSeconds: intake.settings.durationTargetSeconds,
      scenes: [1, 2, 3].map((number) => ({
        sceneId: `scene_${number}`,
        title: `Proof movement ${number}`,
        beats: [
          {
            beatId: `beat_${number}`,
            purpose: number === 1 ? "hook" : number === 3 ? "payoff" : "proof",
            action: `Continue one product motion across movement ${number}.`,
            subject: "smart product on a clean studio desk",
            camera: "slow controlled dolly",
            lighting: "soft premium studio lighting",
            style: "clean premium commercial realism",
            durationSeconds: 10,
            risks: [],
            references: [],
            continuity: {
              product: "same smart product",
              environment: "same clean studio desk",
              style: "clean premium commercial realism"
            }
          }
        ]
      }))
    };
  }
}

class FakeVideoProvider {
  name = "atlascloud";
  requests = [];

  async generateTextToVideo(request) {
    return this.complete(request);
  }

  async generateImageToVideo(request) {
    return this.complete(request);
  }

  async generateReferenceToVideo(request) {
    return this.complete(request);
  }

  async editVideo(request) {
    return this.complete(request);
  }

  async extendVideo(request) {
    return this.complete(request);
  }

  async getPrediction(predictionId) {
    return this.prediction(predictionId, "seedance-fake", this.requests.length);
  }

  async waitForPrediction(predictionId, signal, context) {
    return this.prediction(predictionId, context?.modelId ?? "seedance-fake", this.requests.length);
  }

  capabilities(modelId = "seedance-fake") {
    return [
      {
        provider: "atlascloud",
        modelId,
        modes: ["text_to_video", "image_to_video", "reference_to_video", "video_to_video", "extend", "edit"],
        durations: { min: 4, max: 15 },
        resolutions: ["480p", "720p", "1080p"],
        ratios: ["16:9", "9:16", "1:1"],
        references: ["image", "last_frame", "identity", "product", "environment", "style"],
        async: true
      }
    ];
  }

  complete(request) {
    const index = this.requests.length;
    this.requests.push(request);
    return Promise.resolve(this.prediction(`fake_prediction_${index + 1}`, request.modelId, index));
  }

  prediction(predictionId, modelId, index) {
    const submittedAt = new Date();
    return {
      provider: "atlascloud",
      predictionId,
      modelId,
      status: "succeeded",
      outputUrls: [
        `https://cdn.example.test/chaining/shot-${index + 1}.mp4`,
        `https://cdn.example.test/chaining/download/shot-${index + 1}-last-frame?format=png&token=secret_${index + 1}`
      ],
      raw: { fake: true },
      submittedAt,
      completedAt: submittedAt,
      latencyMs: 0
    };
  }
}

async function runFallbackExtractionScenario() {
  const workDirectory = mkdtempSync(join(tmpdir(), "cinejelly-last-frame-"));
  const videoPath = join(workDirectory, "source.mp4");
  await runProcess(
    readMediaToolCommand("ffmpeg"),
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64:d=1",
      "-vf",
      "format=yuv420p",
      videoPath
    ]
  );
  const selection = await selectOrExtractLastFrameReference({
    renderedShot: renderedShotForFallback(videoPath),
    targetShotId: "fallback_target",
    workDirectory
  });
  const outputPath = selection?.reference.providerReference.uri;
  return {
    extracted: selection?.extracted === true,
    outputExists: outputPath ? existsSync(outputPath) : false,
    providerKind: selection?.reference.providerReference.kind,
    role: selection?.reference.providerReference.role,
    sourceVideoOutputIndex: selection?.outputIndex,
    outputUrlSha256: selection?.outputUrlSha256,
    qualityStrategy: selection?.quality?.strategy,
    qualityCandidateCount: selection?.quality?.candidateCount,
    selectedOffsetSeconds: selection?.quality?.selectedOffsetSeconds,
    selectedFileSizeBytes: selection?.quality?.selectedFileSizeBytes,
    qualityScore: selection?.quality?.score
  };
}

async function runLocalSidecarSelectionScenario() {
  const workDirectory = mkdtempSync(join(tmpdir(), "cinejelly-local-sidecar-"));
  const videoPath = join(workDirectory, "source.mp4");
  const localSidecarPath = join(workDirectory, "source-last-frame.png");
  writeFileSync(localSidecarPath, "local sidecar image placeholder", "utf8");
  const renderedShot = renderedShotForFallback(videoPath);
  renderedShot.prediction.outputUrls = [videoPath, localSidecarPath];
  const selection = await selectOrExtractLastFrameReference({
    renderedShot,
    targetShotId: "local_sidecar_target"
  });
  return {
    recognizedAsImage: isImageOutputUrl(localSidecarPath),
    selected: Boolean(selection),
    extracted: selection?.extracted === true,
    outputIndex: selection?.outputIndex,
    outputUrlSha256: selection?.outputUrlSha256,
    providerKind: selection?.reference.providerReference.kind,
    role: selection?.reference.providerReference.role,
    qualityStrategy: selection?.quality?.strategy,
    qualityCandidateCount: selection?.quality?.candidateCount,
    qualityScore: selection?.quality?.score
  };
}

function renderedShotForFallback(videoPath) {
  const submittedAt = new Date();
  return {
    compiledPrompt: {
      shotId: "fallback_source",
      prompt: "fallback source",
      negativePrompt: "",
      references: [],
      bindingPlan: {
        sortedReferences: [],
        providerReferences: [],
        roleScopes: [],
        conflicts: [],
        referenceLines: [],
        compressionNotes: []
      },
      inspectionExpectations: [],
      repairHints: [],
      videoRequest: {
        provider: "atlascloud",
        modelId: "seedance-fake",
        mode: "text_to_video",
        prompt: "fallback source",
        negativePrompt: "",
        references: [],
        settings: {
          durationSeconds: 4,
          resolution: "480p",
          ratio: "16:9",
          generateAudio: false,
          bitrateMode: "high",
          watermark: false,
          returnLastFrame: true
        },
        metadata: {
          shotId: "fallback_source"
        }
      }
    },
    preflight: report("preflight", "pass"),
    prediction: {
      provider: "atlascloud",
      predictionId: "fallback_prediction",
      modelId: "seedance-fake",
      status: "succeeded",
      outputUrls: [videoPath],
      raw: { fake: true },
      submittedAt,
      completedAt: submittedAt,
      latencyMs: 0
    },
    renderInspection: report("render", "pass"),
    candidates: [],
    selectedCandidateIndex: 1,
    repairAttemptCount: 0
  };
}

function report(stage, status) {
  return {
    stage,
    status,
    nodeId: `${stage}_${status}`,
    findings: [],
    repairScope: "none",
    affectedNodeIds: [],
    sourceCheckpoints: [],
    recommendedNextStep: "continue"
  };
}

function atlasSettings() {
  return {
    apiKey: "test-atlas-api-key",
    llmApiKey: "test-atlas-llm-api-key",
    apiBaseUrl: "https://api.atlascloud.ai/api/v1",
    assetBaseUrl: "https://api.atlascloud.ai/api/v1",
    models: {
      llmModel: "deepseek-v3-0324",
      seedanceStandardModel: "seedance-fake",
      seedanceFastModel: "seedance-fake"
    },
    seedanceCapabilities: [],
    generatedAudioCapabilities: [],
    requestTimeoutMs: 30000,
    maxJsonResponseBytes: 1000000,
    pollingIntervalMs: 1000,
    pollingTimeoutMs: 30000
  };
}

await main();

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
