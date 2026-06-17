#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const compile = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: resolve("."),
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const { RenderJobHistoryStore } = await import("../dist/api/render-job-history-store.js");
const { RenderJobManager } = await import("../dist/api/render-job-manager.js");

const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-job-history-smoke-report.json"
);
const historyPath = resolve("assets/output_deliverables/business-readiness/render-job-history-smoke/history.json");

await rm(dirname(historyPath), { recursive: true, force: true });
await mkdir(dirname(historyPath), { recursive: true });

const store = new RenderJobHistoryStore({ historyPath, historyLimit: 20 });
store.save([
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000001",
    status: "failed",
    retentionSource: "memory",
    detailRetention: "full",
    createdAt: new Date("2026-06-17T00:00:00.000Z"),
    updatedAt: new Date("2026-06-17T00:01:00.000Z"),
    startedAt: new Date("2026-06-17T00:00:05.000Z"),
    completedAt: new Date("2026-06-17T00:01:00.000Z"),
    requestId: "req_render_history_smoke_001",
    projectId: "project_history_smoke",
    userInputPreview: "Render a safe product video while hiding token=super-secret-value from history.",
    requestedDurationSeconds: 120,
    requestedQualityMode: "economy",
    requestedResolution: "480p",
    referenceCount: 1,
    currentStage: "render",
    currentStageStatus: "failed",
    progressEventCount: 1,
    stageProgressEvents: [
      {
        sequence: 1,
        stage: "render",
        order: 4,
        status: "failed",
        recordedAt: new Date("2026-06-17T00:00:30.000Z"),
        message: "Render failed while reading C:\\Users\\Admin\\secret\\clip.mp4 with Bearer abcdef123456.",
        sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
        evidence: {
          providerAttemptCount: 1,
          artifactHint: "C:\\Users\\Admin\\secret\\artifacts"
        }
      }
    ],
    hasResult: false,
    hasCostLedger: true,
    hasProviderCheckpoint: true,
    providerCheckpoint: {
      providerOperationCount: 2,
      providers: ["atlascloud"],
      operations: ["video.submit", "video.wait_for_prediction"],
      predictionIds: ["pred_history_smoke_001"],
      assetIds: [],
      activePredictionIds: [],
      terminalPredictionIds: ["pred_history_smoke_001"],
      latestProvider: "atlascloud",
      latestOperation: "video.wait_for_prediction",
      latestProviderStatus: "failed",
      latestProviderCallStatus: "failed",
      latestPredictionId: "pred_history_smoke_001",
      lastRecordedAt: new Date("2026-06-17T00:00:45.000Z"),
      hasRetryableFailure: true,
      retryCount: 1
    },
    hasArtifacts: false,
    hasArtifactValidation: false,
    hasError: true,
    error: {
      name: "SmokeFailure",
      message: "Failure included apiKey=should-not-persist and C:\\Users\\Admin\\secret\\stack.txt"
    }
  },
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000002",
    status: "running",
    retentionSource: "memory",
    detailRetention: "full",
    createdAt: new Date("2026-06-17T00:02:00.000Z"),
    updatedAt: new Date("2026-06-17T00:03:00.000Z"),
    startedAt: new Date("2026-06-17T00:02:05.000Z"),
    requestId: "req_render_history_smoke_002",
    projectId: "project_history_smoke_active",
    userInputPreview: "Render an in-flight job that should become audit-required after restart.",
    requestedDurationSeconds: 120,
    requestedQualityMode: "economy",
    requestedResolution: "480p",
    referenceCount: 0,
    currentStage: "render",
    currentStageStatus: "running",
    progressEventCount: 1,
    stageProgressEvents: [
      {
        sequence: 1,
        stage: "render",
        order: 4,
        status: "running",
        recordedAt: new Date("2026-06-17T00:02:30.000Z"),
        message: "Render is in progress.",
        sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
        evidence: {
          providerAttemptCount: 1
        }
      }
    ],
    hasResult: false,
    hasCostLedger: true,
    hasProviderCheckpoint: true,
    providerCheckpoint: {
      providerOperationCount: 1,
      providers: ["atlascloud"],
      operations: ["video.wait_for_prediction"],
      predictionIds: ["pred_history_smoke_active"],
      assetIds: [],
      activePredictionIds: ["pred_history_smoke_active"],
      terminalPredictionIds: [],
      latestProvider: "atlascloud",
      latestOperation: "video.wait_for_prediction",
      latestProviderStatus: "running",
      latestProviderCallStatus: "succeeded",
      latestPredictionId: "pred_history_smoke_active",
      lastRecordedAt: new Date("2026-06-17T00:02:45.000Z"),
      hasRetryableFailure: false,
      retryCount: 0
    },
    hasArtifacts: false,
    hasArtifactValidation: false,
    hasError: false
  }
]);

const rawHistory = await readFile(historyPath, "utf8");
const restored = store.load();
const manager = new RenderJobManager({
  historyStore: new RenderJobHistoryStore({ historyPath, historyLimit: 20 })
});
const list = manager.list();
const detail = manager.get("render_job_00000000-0000-4000-8000-000000000001");
const staleActiveDetail = manager.get("render_job_00000000-0000-4000-8000-000000000002");
const rewrittenHistory = await readFile(historyPath, "utf8");
const rewrittenPayload = JSON.parse(rewrittenHistory);
const rewrittenStaleActive = rewrittenPayload.jobs.find(
  (job) => job.jobId === "render_job_00000000-0000-4000-8000-000000000002"
);
const rewrittenTerminal = rewrittenPayload.jobs.find(
  (job) => job.jobId === "render_job_00000000-0000-4000-8000-000000000001"
);

const checks = [
  check("history_file_written", rawHistory.includes("cinejelly.render-job-history.v1")),
  check("secret_redacted", !rawHistory.includes("super-secret-value") && !rawHistory.includes("should-not-persist")),
  check("bearer_redacted", !rawHistory.includes("Bearer abcdef123456")),
  check("local_path_redacted", !includesLocalPathLeak(rawHistory)),
  check("store_loads_two_jobs", restored.length === 2),
  check("manager_restores_two_jobs", list.length === 2),
  check("restored_summaries_mark_compact_history", list.every((job) => job.retentionSource === "history_store" && job.detailRetention === "compact_restored")),
  check("restored_detail_keeps_stage_progress", detail?.stageProgressEvents?.length === 1),
  check("restored_provider_checkpoint_kept", detail?.providerCheckpoint?.predictionIds?.includes("pred_history_smoke_001") === true),
  check("restored_terminal_status", detail?.status === "failed"),
  check("stale_active_restores_as_canceled", staleActiveDetail?.status === "canceled"),
  check("stale_active_has_audit_error", JSON.stringify(staleActiveDetail?.error ?? "").includes("not resumed automatically")),
  check("stale_active_provider_checkpoint_kept", staleActiveDetail?.providerCheckpoint?.activePredictionIds?.includes("pred_history_smoke_active") === true),
  check("stale_active_history_rewritten_as_canceled", rewrittenStaleActive?.status === "canceled"),
  check("rewritten_history_keeps_provider_checkpoint", rewrittenTerminal?.providerCheckpoint?.predictionIds?.includes("pred_history_smoke_001") === true),
  check("rewritten_history_redacts_local_paths", !includesLocalPathLeak(rewrittenHistory))
];

const report = {
  schemaVersion: "cinejelly.render-job-history-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((item) => item.status === "pass") ? "pass" : "fail",
  historyPath,
  checks
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  output: outputPath,
  checkCount: checks.length,
  failedCheckCount: checks.filter((item) => item.status === "fail").length
}, null, 2));

if (report.status !== "pass") {
  process.exitCode = 1;
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail"
  };
}

function includesLocalPathLeak(text) {
  return text.includes("C:\\Users\\Admin\\secret") || text.includes("C:\\\\Users\\\\Admin\\\\secret");
}
