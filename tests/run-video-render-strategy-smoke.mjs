#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "assets/output_deliverables/business-readiness/video-render-strategy-smoke-report.json");
const sourcePatternOrigins = ["HKUDS/VideoAgent", "vericontext/vibeframe", "harry0703/MoneyPrinterTurbo"];

const { VideoRenderStrategyPlanner } = await import("../dist/core/video-render-strategy-planner.js");
const { RenderScheduler } = await import("../dist/core/render-scheduler.js");

const planner = new VideoRenderStrategyPlanner();
const scheduler = new RenderScheduler(3);

const scenarios = {
  singleAuto: buildScenario({
    projectId: "strategy_single_auto",
    durationSeconds: 12,
    shotCount: 1
  }),
  autoMultishotNoRefs: buildScenario({
    projectId: "strategy_auto_multishot_no_refs",
    durationSeconds: 45,
    shotCount: 5
  }),
  referenceLockedProduct: buildScenario({
    projectId: "strategy_reference_locked_product",
    durationSeconds: 45,
    shotCount: 5,
    references: [reference("product", "Hero product packshot", "product-packshot.png?token=secret")]
  }),
  sourceVideoGuided: buildScenario({
    projectId: "strategy_source_video_guided",
    durationSeconds: 45,
    shotCount: 4,
    metadata: { workflowMode: "source_video" },
    sourceVideoAnalysis: sourceVideoAnalysis(),
    references: [reference("source_video_structure", "Approved source timeline", "source-video.mp4?token=secret")]
  }),
  manualStoryboardApproved: buildScenario({
    projectId: "strategy_manual_storyboard",
    durationSeconds: 60,
    shotCount: 6,
    metadata: { workflowMode: "manual_storyboard", storyboardApproval: "approved" }
  }),
  sequenceBible: buildScenario({
    projectId: "strategy_sequence_bible",
    durationSeconds: 90,
    shotCount: 6,
    metadata: { workflowMode: "sequence", renderMode: "production_bible", storyboardApproval: "approved" },
    references: [
      reference("identity", "Series KOL identity sheet", "series-kol.png?token=secret"),
      reference("product", "Series product packshot sheet", "series-product.png?token=secret"),
      reference("style", "Series style and lighting board", "series-style.png?token=secret")
    ]
  }),
  singleModeConflict: buildScenario({
    projectId: "strategy_single_conflict",
    durationSeconds: 30,
    shotCount: 3,
    metadata: { workflowMode: "single" }
  }),
  referenceLockedMissingReference: buildScenario({
    projectId: "strategy_reference_missing",
    durationSeconds: 30,
    shotCount: 3,
    metadata: { workflowMode: "reference_locked" }
  })
};

const schedulePlans = {
  autoMultishotNoRefs: scheduleFor(scenarios.autoMultishotNoRefs),
  referenceLockedProduct: scheduleFor(scenarios.referenceLockedProduct),
  sourceVideoGuided: scheduleFor(scenarios.sourceVideoGuided),
  manualStoryboardApproved: scheduleFor(scenarios.manualStoryboardApproved),
  sequenceBible: scheduleFor(scenarios.sequenceBible)
};

const serializedPlans = JSON.stringify(Object.values(scenarios).map((scenario) => scenario.plan));
const rawUrlLeakDetected = serializedPlans.includes("https://private.example") ||
  serializedPlans.includes("token=secret") ||
  serializedPlans.includes("api_key=");

const checks = [
  scenarios.singleAuto.plan.workflowMode === "single_clip" &&
    scenarios.singleAuto.plan.continuityMode === "single_clip" &&
    scenarios.singleAuto.plan.storyboardRequired === false &&
    scenarios.singleAuto.plan.requiresSequentialRender === false
    ? pass("single_auto_mode", "Auto selects a single clip for a short one-shot request.")
    : fail("single_auto_mode", "Auto did not select the expected single-clip strategy."),
  scenarios.autoMultishotNoRefs.plan.workflowMode === "storyboard_multishot" &&
    scenarios.autoMultishotNoRefs.plan.lastFrameChaining.status === "required" &&
    scenarios.autoMultishotNoRefs.plan.requiresSequentialRender === true &&
    hasScheduleReason(schedulePlans.autoMultishotNoRefs, "strategy_last_frame_chaining")
    ? pass("auto_multishot_chaining", "Prompt-only long multishot requires last-frame chaining and sequential scheduling.")
    : fail("auto_multishot_chaining", "Prompt-only long multishot did not require endpoint chaining."),
  scenarios.referenceLockedProduct.plan.workflowMode === "reference_locked_multishot" &&
    scenarios.referenceLockedProduct.plan.continuityMode === "reference_locked" &&
    scenarios.referenceLockedProduct.plan.requiresReferenceLock === true &&
    hasScheduleReason(schedulePlans.referenceLockedProduct, "strategy_reference_lock")
    ? pass("reference_locked_product", "Product reference input selects a reference-locked multishot strategy.")
    : fail("reference_locked_product", "Reference input did not select reference-locked multishot strategy."),
  scenarios.sourceVideoGuided.plan.workflowMode === "source_video_guided" &&
    scenarios.sourceVideoGuided.plan.sourceVideoAnalysisPresent === true &&
    hasScheduleReason(schedulePlans.sourceVideoGuided, "strategy_source_video")
    ? pass("source_video_guided", "Source-video input selects source-video guided sequential strategy.")
    : fail("source_video_guided", "Source-video strategy or scheduler reason is missing."),
  scenarios.manualStoryboardApproved.plan.workflowMode === "manual_storyboard" &&
    scenarios.manualStoryboardApproved.plan.storyboardApprovalStatus === "approved" &&
    scenarios.manualStoryboardApproved.plan.requiresStoryboardApproval === false &&
    hasScheduleReason(schedulePlans.manualStoryboardApproved, "strategy_manual_storyboard")
    ? pass("manual_storyboard_approval", "Manual storyboard mode respects explicit approval metadata.")
    : fail("manual_storyboard_approval", "Manual storyboard approval handling is wrong."),
  scenarios.sequenceBible.plan.requestedMode === "sequence_bible" &&
    scenarios.sequenceBible.plan.workflowMode === "sequence_bible" &&
    scenarios.sequenceBible.plan.continuityMode === "sequence_bible" &&
    scenarios.sequenceBible.plan.storyboardApprovalStatus === "approved" &&
    scenarios.sequenceBible.plan.requiresStoryboardApproval === false &&
    scenarios.sequenceBible.plan.lastFrameChaining.status === "required" &&
    scenarios.sequenceBible.plan.requiresSequentialRender === true &&
    hasScheduleReason(schedulePlans.sequenceBible, "strategy_sequence_bible") &&
    hasScheduleReason(schedulePlans.sequenceBible, "strategy_last_frame_chaining")
    ? pass("sequence_bible_production_mode", "Production-bible sequence metadata selects sequence_bible with last-frame chaining and sequential scheduling.")
    : fail("sequence_bible_production_mode", "Production-bible sequence metadata did not select the sequence_bible render strategy."),
  scenarios.singleModeConflict.plan.blockingIssueCount === 1 &&
    scenarios.singleModeConflict.plan.releaseGateSummary.canProceedToRender === false &&
    hasIssue(scenarios.singleModeConflict.plan, "requested_single_conflicts_with_multishot_plan")
    ? pass("single_conflict_blocks_spend", "Requested single mode blocks spend when the shot plan is actually multishot.")
    : fail("single_conflict_blocks_spend", "Single-mode conflict did not block render spend."),
  scenarios.referenceLockedMissingReference.plan.blockingIssueCount === 1 &&
    hasIssue(scenarios.referenceLockedMissingReference.plan, "reference_locked_mode_missing_reference")
    ? pass("reference_locked_missing_blocks_spend", "Reference-locked mode blocks spend when no lockable references are supplied.")
    : fail("reference_locked_missing_blocks_spend", "Missing reference-locked evidence did not block render spend."),
  !rawUrlLeakDetected
    ? pass("no_raw_reference_url_leak", "Strategy artifacts keep raw provider/reference URLs out of evidence.")
    : fail("no_raw_reference_url_leak", "Strategy evidence leaked a raw provider/reference URL or secret-like query."),
  Object.values(scenarios).every((scenario) =>
    scenario.plan.noSpend === true &&
    scenario.plan.networkCallsMade === false &&
    scenario.plan.providerCallsMade === false
  )
    ? pass("no_spend_boundary", "Every strategy scenario is no-spend, no-network, and no-provider.")
    : fail("no_spend_boundary", "At least one strategy scenario crossed a spend/network/provider boundary."),
  Object.values(scenarios).every((scenario) =>
    scenario.plan.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
  )
    ? pass("source_pattern_lineage", "Strategy evidence carries the expected source-pattern lineage labels.")
    : fail("source_pattern_lineage", "Strategy source-pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.video-render-strategy-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: "assets/output_deliverables/business-readiness/video-render-strategy-smoke-report.json",
    scenarioCount: Object.keys(scenarios).length,
    rawUrlLeakCheckPassed: !rawUrlLeakDetected
  },
  scenarios: Object.fromEntries(
    Object.entries(scenarios).map(([name, scenario]) => [
      name,
      summarizeScenario(scenario, schedulePlans[name])
    ])
  ),
  checks,
  releaseGateSummary: {
    canUseAsNoSpendVideoRenderStrategyEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Strategy smoke proves no-spend workflow selection only; paid reference media, manual creative review, and deployment evidence remain separate gates."
      : "Video render strategy smoke failed; fix workflow selection before paid long-form validation."
  },
  nextActions: status === "pass"
    ? [
        "Keep strategy smoke passing before live paid long-form validation.",
        "Use video-render-strategy.json from real provider runs to confirm UI-selected modes are respected before spend.",
        "Run paid reference-locked validation after operator supplies an approved product/person/source reference."
      ]
    : ["Fix VideoRenderStrategyPlanner before continuing long backend hardening."]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;

function buildScenario(input) {
  const references = input.references ?? [];
  const storyPlan = storyPlanFor(input.projectId, input.durationSeconds, input.shotCount);
  const request = {
    userInput: `Create a ${input.durationSeconds}s commercial video for ${input.projectId}.`,
    settings: {
      tier: "fast",
      resolution: "480p",
      qualityMode: "economy",
      ratio: "16:9",
      durationTargetSeconds: input.durationSeconds,
      audioMode: "none",
      watermark: false,
      returnLastFrame: true
    },
    references,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.sourceVideoAnalysis ? { sourceVideoAnalysis: input.sourceVideoAnalysis } : {})
  };
  const shots = shotsFor(storyPlan, references);
  return {
    projectId: input.projectId,
    request,
    storyPlan,
    shots,
    plan: planner.build({
      projectId: input.projectId,
      request,
      storyPlan,
      shots
    })
  };
}

function scheduleFor(scenario) {
  const reasons = strategySequentialReasons(scenario.plan);
  return scheduler.plan(
    scenario.shots.map((shot, index) => ({
      index,
      shot,
      value: shot.shotId,
      ...(reasons.length > 0 ? { forceSequentialReasons: reasons } : {})
    }))
  );
}

function strategySequentialReasons(plan) {
  if (!plan.requiresSequentialRender) {
    return [];
  }
  const reasons = [];
  if (plan.workflowMode === "reference_locked_multishot") {
    reasons.push("strategy_reference_lock");
  }
  if (plan.workflowMode === "source_video_guided") {
    reasons.push("strategy_source_video");
  }
  if (plan.workflowMode === "sequence_bible") {
    reasons.push("strategy_sequence_bible");
  }
  if (plan.workflowMode === "manual_storyboard") {
    reasons.push("strategy_manual_storyboard");
  }
  if (plan.lastFrameChaining.status === "required" || plan.lastFrameChaining.status === "recommended") {
    reasons.push("strategy_last_frame_chaining");
  }
  return [...new Set(reasons)].sort();
}

function storyPlanFor(projectId, durationSeconds, shotCount) {
  const shotDuration = durationSeconds / shotCount;
  return {
    premise: `Strategy smoke for ${projectId}.`,
    targetDurationSeconds: durationSeconds,
    scenes: Array.from({ length: shotCount }, (_, index) => ({
      sceneId: `${projectId}_scene_${String(index + 1).padStart(2, "0")}`,
      title: `Scene ${index + 1}`,
      beats: [
        {
          beatId: `${projectId}_beat_${String(index + 1).padStart(2, "0")}`,
          purpose: index === 0 ? "hook" : index === shotCount - 1 ? "payoff" : "proof",
          action: `Advance beat ${index + 1} with coherent commercial action.`,
          durationSeconds: shotDuration,
          style: "premium commercial realism",
          continuity: {
            product: "same hero product",
            environment: "same clean studio",
            style: "premium commercial realism"
          }
        }
      ]
    }))
  };
}

function shotsFor(storyPlan, references) {
  return storyPlan.scenes.flatMap((scene, index) =>
    scene.beats.map((beat) => ({
      shotId: `${beat.beatId}_shot`,
      sceneId: scene.sceneId,
      beatId: beat.beatId,
      durationSeconds: beat.durationSeconds,
      intent: beat.purpose,
      subject: "hero product in a clean commercial environment",
      action: beat.action,
      camera: index === 0 ? "slow push-in" : "controlled product cutaway",
      lighting: "soft premium studio light",
      style: beat.style,
      references,
      continuity: beat.continuity,
      risks: index > 0 ? ["transition"] : []
    }))
  );
}

function sourceVideoAnalysis() {
  return {
    sourceReferenceLabel: "approved source video",
    transformationIntent: "Translate source pacing and scene structure into a new commercial.",
    scenes: [
      {
        sceneId: "source_scene_01",
        startSecond: 0,
        endSecond: 15,
        summary: "Source hook and product setup.",
        pacing: "steady",
        camera: "handheld push-in",
        visualStyle: "clean commercial"
      }
    ],
    structuralBeats: ["hook", "proof", "CTA"],
    styleNotes: ["clean product lighting"]
  };
}

function reference(role, label, path) {
  return {
    role,
    label,
    providerReference: {
      kind: role === "source_video_structure" ? "video" : "image",
      uri: `https://private.example/${path}`
    },
    priority: "primary",
    selection: {
      authorized: true,
      ...(role === "source_video_structure" ? { sourceSceneId: "source_scene_01", timelineIndex: 0 } : {})
    }
  };
}

function summarizeScenario(scenario, schedulePlan) {
  return {
    projectId: scenario.projectId,
    requestedMode: scenario.plan.requestedMode,
    workflowMode: scenario.plan.workflowMode,
    continuityMode: scenario.plan.continuityMode,
    targetDurationSeconds: scenario.plan.targetDurationSeconds,
    plannedShotCount: scenario.plan.plannedShotCount,
    requiresSequentialRender: scenario.plan.requiresSequentialRender,
    requiresStoryboardApproval: scenario.plan.requiresStoryboardApproval,
    storyboardApprovalStatus: scenario.plan.storyboardApprovalStatus,
    lastFrameChainingStatus: scenario.plan.lastFrameChaining.status,
    issueCount: scenario.plan.issueCount,
    warningIssueCount: scenario.plan.warningIssueCount,
    blockingIssueCount: scenario.plan.blockingIssueCount,
    issueCodes: scenario.plan.issues.map((issue) => issue.code),
    schedule: schedulePlan
      ? {
          batchCount: schedulePlan.batchCount,
          parallelBatchCount: schedulePlan.parallelBatchCount,
          sequentialItemCount: schedulePlan.sequentialItemCount,
          sequentialReasons: [...new Set(schedulePlan.items.flatMap((item) => item.sequentialReasons))].sort()
        }
      : undefined
  };
}

function hasIssue(plan, code) {
  return plan.issues.some((issue) => issue.code === code);
}

function hasScheduleReason(plan, reason) {
  return plan.items.some((item) => item.sequentialReasons.includes(reason));
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
