#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const compile = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: resolve("."),
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const { RenderProviderReconciler } = await import("../dist/api/render-provider-reconciler.js");

const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json"
);

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "Atlas Cloud Predictions docs"
];

const fakeProvider = {
  name: "atlascloud",
  async getPrediction(predictionId) {
    const statusById = {
      pred_reconcile_terminal: "succeeded",
      pred_reconcile_active: "running"
    };
    const status = statusById[predictionId];
    if (!status) {
      throw new Error(`Unknown fake prediction ${predictionId}.`);
    }
    return {
      provider: "atlascloud",
      predictionId,
      modelId: "fake/seedance-reconciliation-smoke",
      status,
      outputUrls: status === "succeeded" ? ["https://cdn.example.com/reconciled.mp4"] : [],
      raw: {
        secret: "raw-provider-payload-must-not-be-serialized",
        localPath: "C:\\Users\\Admin\\secret\\provider.json"
      },
      submittedAt: new Date("2026-06-17T00:00:00.000Z"),
      ...(status === "succeeded" ? { completedAt: new Date("2026-06-17T00:01:00.000Z") } : {})
    };
  }
};

const summaries = [
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000101",
    status: "canceled",
    retentionSource: "history_store",
    detailRetention: "compact_restored",
    providerCheckpoint: {
      providerOperationCount: 2,
      providers: ["atlascloud"],
      operations: ["video.submit", "video.wait_for_prediction"],
      predictionIds: ["pred_reconcile_terminal"],
      assetIds: [],
      activePredictionIds: ["pred_reconcile_terminal"],
      terminalPredictionIds: [],
      latestProvider: "atlascloud",
      latestOperation: "video.wait_for_prediction",
      latestProviderStatus: "running",
      latestProviderCallStatus: "succeeded",
      latestPredictionId: "pred_reconcile_terminal",
      lastRecordedAt: new Date("2026-06-17T00:00:45.000Z"),
      hasRetryableFailure: false,
      retryCount: 0
    }
  },
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000102",
    status: "canceled",
    retentionSource: "history_store",
    detailRetention: "compact_restored",
    providerCheckpoint: {
      providerOperationCount: 1,
      providers: ["atlascloud"],
      operations: ["video.wait_for_prediction"],
      predictionIds: ["pred_reconcile_active"],
      assetIds: [],
      activePredictionIds: ["pred_reconcile_active"],
      terminalPredictionIds: [],
      latestProvider: "atlascloud",
      latestOperation: "video.wait_for_prediction",
      latestProviderStatus: "running",
      latestProviderCallStatus: "succeeded",
      latestPredictionId: "pred_reconcile_active",
      lastRecordedAt: new Date("2026-06-17T00:02:45.000Z"),
      hasRetryableFailure: false,
      retryCount: 0
    }
  },
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000103",
    status: "failed",
    retentionSource: "history_store",
    detailRetention: "compact_restored"
  }
];

const reconciler = new RenderProviderReconciler({ providers: [fakeProvider] });
const reconciliation = await reconciler.reconcileSummaries(summaries);
const checks = [
  check("schema_version", reconciliation.schemaVersion === "cinejelly.render-provider-reconciliation.v1"),
  check("warns_when_prediction_still_active", reconciliation.status === "warn"),
  check("checks_three_jobs", reconciliation.summary.checkedJobCount === 3),
  check("queries_two_active_predictions", reconciliation.summary.queriedPredictionCount === 2),
  check("terminal_prediction_reconciled", reconciliation.summary.terminalPredictionCount === 1),
  check("still_active_prediction_retained", reconciliation.summary.stillActivePredictionCount === 1),
  check("missing_checkpoint_skipped", reconciliation.summary.skippedJobCount === 1),
  check("does_not_claim_distributed_resume", reconciliation.releaseGateSummary.canClaimDistributedResume === false),
  check("raw_provider_payload_not_serialized", !JSON.stringify(reconciliation).includes("raw-provider-payload")),
  check("local_provider_path_not_serialized", !JSON.stringify(reconciliation).includes("C:\\Users\\Admin\\secret"))
];

const report = {
  ...reconciliation,
  generatedAt: reconciliation.generatedAt.toISOString(),
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath,
    fakeProvider: true,
    jobCount: summaries.length,
    providerCount: 1
  },
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

if (checks.some((item) => item.status === "fail")) {
  process.exitCode = 1;
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
  };
}
