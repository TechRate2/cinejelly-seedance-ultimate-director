import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json");

const { RenderScheduler } = await import("../dist/core/render-scheduler.js");

const sourcePatternOrigins = ["HKUDS/ViMax", "HKUDS/VideoAgent", "vericontext/vibeframe"];

const scheduler = new RenderScheduler(2);
const scenarios = {
  parallelSafe: scheduler.plan([
    item(0, shot("parallel_a")),
    item(1, shot("parallel_b")),
    item(2, shot("parallel_c"))
  ]),
  endpointAnchored: scheduler.plan([
    item(0, shot("endpoint", { references: [reference("first_frame")] }))
  ]),
  sourceVideoStructured: scheduler.plan([
    item(0, shot("source_video", {
      references: [reference("source_video_structure", { sourceSceneId: "source_scene_01", timelineIndex: 2 })]
    }))
  ]),
  continuityRisk: scheduler.plan([
    item(0, shot("product_logo", { risks: ["product_logo"] }))
  ]),
  transitionIntent: scheduler.plan([
    item(0, shot("transition", {
      risks: ["transition"],
      transitionIntent: "seamless match cut from previous shot"
    }))
  ])
};

const runOrder = [];
await scheduler.run(
  [
    item(0, shot("run_parallel_a")),
    item(1, shot("run_parallel_b")),
    item(2, shot("run_source", { references: [reference("source_video_structure")] })),
    item(3, shot("run_parallel_c"))
  ],
  async (scheduled) => {
    runOrder.push(scheduled.shot.shotId);
    return scheduled.shot.shotId;
  }
);

const checks = [
  scenarios.parallelSafe.sequentialItemCount === 0 &&
    scenarios.parallelSafe.parallelBatchCount === 2
    ? pass("parallel_safe_batches", "Continuity-safe shots are grouped into bounded parallel batches.")
    : fail("parallel_safe_batches", "Continuity-safe shots did not form the expected parallel batches."),
  hasReason(scenarios.endpointAnchored, "endpoint_reference")
    ? pass("endpoint_reference_sequential", "First/last frame references force sequential scheduling.")
    : fail("endpoint_reference_sequential", "Endpoint references did not force sequential scheduling."),
  hasReason(scenarios.sourceVideoStructured, "source_video_structure") &&
    hasReason(scenarios.sourceVideoStructured, "source_video_timeline")
    ? pass("source_video_sequential", "Source-video structure and timeline metadata force sequential scheduling.")
    : fail("source_video_sequential", "Source-video structure/timeline did not force sequential scheduling."),
  hasReason(scenarios.continuityRisk, "continuity_risk")
    ? pass("continuity_risk_sequential", "Continuity-risk shots force sequential scheduling.")
    : fail("continuity_risk_sequential", "Continuity-risk shots did not force sequential scheduling."),
  hasReason(scenarios.transitionIntent, "transition_risk") &&
    hasReason(scenarios.transitionIntent, "transition_intent")
    ? pass("transition_intent_sequential", "Transition risk and intent force sequential scheduling.")
    : fail("transition_intent_sequential", "Transition risk/intent did not force sequential scheduling."),
  runOrder.join(",") === "run_parallel_a,run_parallel_b,run_source,run_parallel_c"
    ? pass("run_order_stable", "Scheduler returns stable source order while respecting sequential barriers.")
    : fail("run_order_stable", `Unexpected run order: ${runOrder.join(",")}.`)
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.render-scheduler-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json",
    concurrency: 2,
    scenarioCount: Object.keys(scenarios).length
  },
  scenarios: summarizeScenarios(scenarios),
  checks,
  releaseGateSummary: {
    canUseAsNoSpendLongFormSchedulerEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Scheduler smoke proves no-spend scheduling guard behavior only; paid long-form media evidence and manual review remain separate gates."
      : "Render scheduler smoke failed; fix scheduling guard behavior before trusting long-form orchestration."
  },
  nextActions: status === "pass"
    ? [
        "Keep this smoke passing before live long-form paid validation.",
        "Use render-schedule.json from real paid runs to audit source-video, transition, and continuity sequencing."
      ]
    : ["Fix render scheduler guard behavior before live long-form validation."]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;

function item(index, shotValue) {
  return { index, shot: shotValue, value: shotValue.shotId };
}

function shot(shotId, overrides = {}) {
  return {
    shotId,
    durationSeconds: 8,
    intent: "Show the product benefit with clear continuity.",
    subject: "smart desk lamp",
    action: "camera glides across a workspace",
    camera: "slow dolly",
    lighting: "soft practical lighting",
    references: [],
    continuity: {},
    risks: [],
    ...overrides
  };
}

function reference(role, selection) {
  return {
    role,
    label: `${role}_reference`,
    providerReference: {
      kind: role === "source_video_structure" ? "video" : "image",
      uri: `https://assets.example.test/${role}.mp4`
    },
    priority: "supporting",
    ...(selection ? { selection } : {})
  };
}

function hasReason(plan, reason) {
  return plan.items.some((itemValue) => itemValue.sequentialReasons.includes(reason));
}

function summarizeScenarios(value) {
  return Object.fromEntries(
    Object.entries(value).map(([name, plan]) => [
      name,
      {
        itemCount: plan.itemCount,
        batchCount: plan.batchCount,
        parallelBatchCount: plan.parallelBatchCount,
        sequentialItemCount: plan.sequentialItemCount,
        items: plan.items.map((itemValue) => ({
          shotId: itemValue.shotId,
          mode: itemValue.mode,
          batchId: itemValue.batchId,
          sequentialReasons: itemValue.sequentialReasons
        }))
      }
    ])
  );
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
