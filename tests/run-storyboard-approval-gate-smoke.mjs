#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "assets/output_deliverables/business-readiness/storyboard-approval-gate-smoke-report.json");
const sourcePatternOrigins = ["calesthio/OpenMontage", "HKUDS/ViMax", "HKUDS/VideoAgent", "vericontext/vibeframe"];

const { DirectorAgent } = await import("../dist/agents/director-agent.js");
const { RenderProducer } = await import("../dist/agents/render-producer.js");
const { ProjectArtifactStore } = await import("../dist/core/project-artifact-store.js");
const { ProjectArtifactValidator } = await import("../dist/core/project-artifact-validator.js");
const { StoryboardApprovalGate } = await import("../dist/core/storyboard-approval-gate.js");
const { VideoRenderStrategyPlanner } = await import("../dist/core/video-render-strategy-planner.js");

async function main() {
  const gate = new StoryboardApprovalGate();
  const planner = new VideoRenderStrategyPlanner();
  const planInput = fixedPlanInput();
  const strategy = planner.build(planInput);
  const storyboard = fixedStoryboard(planInput.projectId);
  const pending = gate.evaluate({
    projectId: planInput.projectId,
    request: planInput.request,
    storyboard,
    strategy,
    generatedAt: new Date("2026-06-20T00:00:00.000Z")
  });
  const approved = gate.evaluate({
    projectId: planInput.projectId,
    request: {
      ...planInput.request,
      metadata: {
        ...planInput.request.metadata,
        storyboardApproval: "approved",
        storyboardReviewer: "Long smoke reviewer",
        storyboardReviewedAt: "2026-06-20T00:00:00.000Z"
      }
    },
    storyboard,
    strategy,
    generatedAt: new Date("2026-06-20T00:00:00.000Z")
  });
  const unsafeApproved = gate.evaluate({
    projectId: planInput.projectId,
    request: {
      ...planInput.request,
      metadata: {
        ...planInput.request.metadata,
        storyboardApproval: "approved",
        storyboardReviewedAt: "2026-06-20T00:00:00.000Z"
      }
    },
    storyboard,
    strategy,
    generatedAt: new Date("2026-06-20T00:00:00.000Z")
  });

  const blockedProvider = new FakeVideoProvider();
  let blockedBeforeProviderSpend = false;
  try {
    await director(blockedProvider).run(planInput.request);
  } catch (error) {
    blockedBeforeProviderSpend = /Storyboard approval gate blocked provider spend/i.test(String(error?.message ?? error));
  }

  const approvedProvider = new FakeVideoProvider();
  const approvedResult = await director(approvedProvider).run({
    ...planInput.request,
    metadata: {
      ...planInput.request.metadata,
      storyboardApproval: "approved",
      storyboardReviewer: "Long smoke reviewer",
      storyboardReviewedAt: "2026-06-20T00:00:00.000Z"
    }
  });
  const artifacts = await new ProjectArtifactStore().writeRunArtifacts({
    result: approvedResult,
    costLedger: fakeCostLedger(),
    artifactDirectory: resolve(repoRoot, "assets/output_deliverables/business-readiness/storyboard-approval-gate-artifacts")
  });
  const artifactValidation = await new ProjectArtifactValidator().validate(artifacts.artifactDirectory);

  // Launch-blocker source invariant: CUSTOMER_AUTO_RUN must ALSO stamp storyboardApproval, or the
  // in-director storyboard gate throws on every >1-shot customer render (auto-run only skipped the
  // job-level review pause). Both customer render routes must feed normalizeRenderRequest through
  // stampAutoRunStoryboardApproval; the stamp adds storyboardApproval:"approved" only when auto-run.
  const serverSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "src/api/server.ts"), "utf8");
  const stampSites = (serverSource.match(/stampAutoRunStoryboardApproval\(\s*\n?\s*normalizeRenderRequest\(handoff\.request/g) || []).length;
  const stampDefines = serverSource.includes('storyboardApproval: "approved"') && serverSource.includes('storyboardApprovalSource: "customer_auto_run"');

  const checks = [
    stampSites === 2 && stampDefines
      ? pass("auto_run_stamps_storyboard_approval", "Both customer render routes stamp storyboard approval under CUSTOMER_AUTO_RUN so multi-shot renders are not gate-blocked.")
      : fail("auto_run_stamps_storyboard_approval", `Expected 2 stamped customer routes + the auto-run stamp helper; saw sites=${stampSites} defines=${stampDefines}.`),
    pending?.status === "approval_required" && pending.releaseGateSummary.canRenderAfterReview === false
      ? pass("pending_blocks_render", "Pending storyboard checkpoints pause before render.")
      : fail("pending_blocks_render", "Expected pending storyboard checkpoints to block render."),
    approved?.status === "approved" && approved.releaseGateSummary.canRenderAfterReview === true
      ? pass("approved_allows_render", "Approved storyboard checkpoints allow pre-render continuation.")
      : fail("approved_allows_render", "Expected approved storyboard checkpoints to allow render."),
    unsafeApproved?.status === "blocked" &&
      unsafeApproved.checkpoints.every((checkpoint) => checkpoint.issueCodes.includes("approved_without_reviewer_or_timestamp"))
      ? pass("approved_requires_reviewer_timestamp", "Approved storyboard checkpoints require reviewer and timestamp evidence.")
      : fail("approved_requires_reviewer_timestamp", "Expected approved-without-reviewer evidence to block."),
    blockedBeforeProviderSpend && blockedProvider.requests.length === 0
      ? pass("director_blocks_before_provider", "Director blocks storyboard-required render before fake provider spend.")
      : fail("director_blocks_before_provider", `Expected Director to block before provider; saw ${blockedProvider.requests.length} fake requests.`),
    approvedResult.storyboardApprovalReport?.status === "approved" &&
      approvedResult.storyboardApprovalReport.releaseGateSummary.canRenderAfterReview === true &&
      approvedProvider.requests.length === 2
      ? pass("director_renders_after_approval", "Director renders approved storyboard workflow and retains approval evidence.")
      : fail("director_renders_after_approval", "Director did not render after approved storyboard evidence."),
    approvedResult.stagePlan.records.some((record) =>
      record.stage === "storyboard" &&
      record.evidence.storyboardApprovalStatus === "approved" &&
      record.evidence.storyboardApprovalCanRender === true
    )
      ? pass("stage_lifecycle_records_approval", "Stage lifecycle stores storyboard approval status and canRender evidence.")
      : fail("stage_lifecycle_records_approval", "Stage lifecycle is missing storyboard approval evidence."),
    artifacts.entries.some((entry) => entry.kind === "storyboard_approval" && entry.fileName === "storyboard-approval.json") &&
      artifactValidation.status !== "fail"
      ? pass("artifact_bundle_validates_approval", "Artifact bundle includes storyboard approval and passes validator without failures.")
      : fail("artifact_bundle_validates_approval", "Artifact bundle did not include valid storyboard approval evidence."),
    artifacts.entries.some((entry) => entry.kind === "long_director_ui_contract" && entry.fileName === "long-director-ui-contract.json") &&
      artifactValidation.status !== "fail"
      ? pass("artifact_bundle_validates_long_director_ui", "Artifact bundle includes the Long Director UI contract and passes validator without failures.")
      : fail("artifact_bundle_validates_long_director_ui", "Artifact bundle did not include valid Long Director UI contract evidence.")
  ];

  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const report = {
    schemaVersion: "cinejelly.storyboard-approval-gate-smoke.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    fakeProviderCallsMade: true,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: "assets/output_deliverables/business-readiness/storyboard-approval-gate-smoke-report.json",
      targetDurationSeconds: planInput.storyPlan.targetDurationSeconds,
      plannedShotCount: planInput.shots.length
    },
    scenarios: {
      pending: summarize(pending),
      approved: summarize(approved),
      unsafeApproved: summarize(unsafeApproved),
      directorBlockedProviderRequestCount: blockedProvider.requests.length,
      directorApprovedProviderRequestCount: approvedProvider.requests.length,
      directorApprovedStageEvidence: approvedResult.stagePlan.records.find((record) => record.stage === "storyboard")?.evidence,
      artifactEntryKinds: artifacts.entries.map((entry) => entry.kind).sort(),
      artifactValidationStatus: artifactValidation.status,
      artifactValidationChecks: artifactValidation.checks.map((check) => ({
        name: check.name,
        status: check.status,
        message: check.message
      }))
    },
    checks,
    releaseGateSummary: {
      canUseAsNoSpendStoryboardApprovalEvidence: status === "pass",
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Storyboard approval gate smoke proves no-spend approval enforcement with a fake provider only; paid Atlas media validation and manual media review remain separate gates."
        : "Storyboard approval gate smoke failed; fix pre-render approval enforcement before paid long-form validation."
    },
    nextActions: status === "pass"
      ? [
          "Keep storyboard approval evidence in real multishot artifacts before building UI scene approval controls.",
          "Run paid Atlas validation only with explicit approved storyboard metadata or approved render-job review checkpoints.",
          "Use storyboard-approval.json as the UI/Admin source for pre-render approval state."
        ]
      : ["Fix storyboard approval gate enforcement before continuing long backend hardening."]
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = status === "pass" ? 0 : 1;
}

function fixedPlanInput() {
  const request = {
    userInput: "Create a 24 second two-shot product story with a coherent setup and payoff.",
    settings: {
      tier: "fast",
      resolution: "480p",
      qualityMode: "economy",
      ratio: "16:9",
      durationTargetSeconds: 24,
      audioMode: "none",
      watermark: false,
      returnLastFrame: true
    },
    metadata: {
      workflowMode: "auto",
      requestId: "storyboard_approval_gate_smoke"
    }
  };
  const storyPlan = {
    premise: "A two-shot product story with one setup and one payoff.",
    targetDurationSeconds: 24,
    scenes: [1, 2].map((number) => ({
      sceneId: `scene_${number}`,
      title: number === 1 ? "Setup" : "Payoff",
      beats: [
        {
          beatId: `beat_${number}`,
          purpose: number === 1 ? "hook" : "proof",
          action: number === 1 ? "Reveal the product problem." : "Show the product solving the problem.",
          subject: "smart product on a clean studio desk",
          camera: "slow controlled dolly",
          lighting: "soft premium studio lighting",
          style: "clean premium commercial realism",
          durationSeconds: 12,
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
  const shots = [1, 2].map((number, index) => ({
    shotId: `shot_${number}`,
    sceneId: `scene_${number}`,
    beatId: `beat_${number}`,
    order: index,
    durationSeconds: 12,
    subject: "smart product on a clean studio desk",
    action: number === 1 ? "Reveal the product problem." : "Show the product solving the problem.",
    camera: "slow controlled dolly",
    lighting: "soft premium studio lighting",
    style: "clean premium commercial realism",
    negativeConstraints: [],
    risks: [],
    references: [],
    continuity: {
      characterState: "none",
      productState: "same smart product",
      environmentState: "same clean studio desk",
      previousShotEndState: number === 1 ? undefined : "Continue from the first shot endpoint.",
      nextShotStartHint: number === 1 ? "Second shot begins from the product endpoint." : undefined
    },
    metadata: {}
  }));
  return {
    projectId: "storyboard_approval_gate_smoke",
    request,
    storyPlan,
    shots
  };
}

function fixedStoryboard(projectId) {
  return {
    projectId,
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    panels: [1, 2].map((number, index) => ({
      panelId: `panel_${number}`,
      shotId: `shot_${number}`,
      sceneId: `scene_${number}`,
      beatId: `beat_${number}`,
      order: index,
      durationSeconds: 12,
      visualDescription: number === 1 ? "Setup product moment." : "Payoff product moment.",
      action: number === 1 ? "Reveal the product problem." : "Show the product solving the problem.",
      camera: "slow controlled dolly",
      lighting: "soft premium studio lighting",
      continuity: {
        characterState: "none",
        productState: "same smart product",
        environmentState: "same clean studio desk",
        previousShotEndState: number === 1 ? undefined : "Continue from the first shot endpoint.",
        nextShotStartHint: number === 1 ? "Second shot begins from the product endpoint." : undefined
      },
      referenceBindings: [],
      inspectionFocus: ["product continuity", "camera continuity"]
    }))
  };
}

function director(provider) {
  return new DirectorAgent({
    storyArchitect: new FixedStoryArchitect(),
    renderProducer: new RenderProducer(provider),
    atlasSettings: atlasSettings()
  });
}

class FixedStoryArchitect {
  async plan(intake) {
    return fixedPlanInput().storyPlan;
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
        references: ["image", "first_frame", "last_frame", "identity", "product", "environment", "style"],
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
        `https://cdn.example.test/storyboard-approval/shot-${index + 1}.mp4`,
        `https://cdn.example.test/storyboard-approval/shot-${index + 1}-last-frame.png`
      ],
      raw: { fake: true },
      submittedAt,
      completedAt: submittedAt,
      latencyMs: 0
    };
  }
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

function fakeCostLedger() {
  return [
    {
      provider: "atlascloud",
      operation: "fake_storyboard_approval_smoke_render",
      status: "succeeded",
      retryCount: 0,
      recordedAt: new Date("2026-06-20T00:00:00.000Z"),
      actualCostUsd: 0
    }
  ];
}

function summarize(report) {
  if (!report) {
    return { status: "not_required" };
  }
  return {
    status: report.status,
    gate: report.gate,
    checkpointCount: report.summary.checkpointCount,
    approvedRequiredCount: report.summary.approvedRequiredCount,
    issueCount: report.summary.issueCount,
    canRenderAfterReview: report.releaseGateSummary.canRenderAfterReview
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

await main();
