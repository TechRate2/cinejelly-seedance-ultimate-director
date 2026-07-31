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

const {
  FileRenderProviderHandoffLeaseStore,
  RenderProviderHandoffCoordinator
} = await import("../dist/api/render-provider-handoff.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-handoff-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/render-provider-handoff-smoke");
const leasePath = resolve(workDir, "leases.json");

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "Atlas Cloud Predictions docs"
];

const fakeProvider = {
  name: "atlascloud",
  async getPrediction(predictionId) {
    const statusById = {
      pred_handoff_terminal: "succeeded",
      pred_handoff_active: "running",
      pred_handoff_held: "running"
    };
    const status = statusById[predictionId];
    if (!status) {
      throw new Error(`Unknown fake prediction ${predictionId}.`);
    }
    return {
      provider: "atlascloud",
      predictionId,
      modelId: "fake/seedance-handoff-smoke",
      status,
      outputUrls: status === "succeeded" ? ["https://cdn.example.com/handoff.mp4"] : [],
      raw: {
        secret: "raw-handoff-provider-payload-must-not-be-serialized",
        localPath: "C:\\Users\\Admin\\secret\\handoff-provider.json"
      },
      submittedAt: new Date("2026-06-17T00:00:00.000Z"),
      ...(status === "succeeded" ? { completedAt: new Date("2026-06-17T00:01:00.000Z") } : {})
    };
  }
};

const summaries = [
  checkpointJob("render_job_00000000-0000-4000-8000-000000000201", "pred_handoff_terminal"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000202", "pred_handoff_active"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000203", "pred_handoff_held"),
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000204",
    status: "failed",
    retentionSource: "history_store",
    detailRetention: "compact_restored"
  }
];

const leaseStore = new FileRenderProviderHandoffLeaseStore({ leasePath });
const smokeStartedAt = new Date();
await leaseStore.acquireLease({
  jobId: "render_job_00000000-0000-4000-8000-000000000203",
  ownerId: "other_handoff_worker",
  ttlMs: 120_000,
  now: smokeStartedAt
});

const coordinator = new RenderProviderHandoffCoordinator({
  leaseStore,
  providers: [fakeProvider],
  ownerId: "smoke_handoff_worker",
  leaseTtlMs: 120_000
});
const handoff = await coordinator.run(summaries);
const persistedLeases = JSON.parse(await readFile(leasePath, "utf8"));
const reloadedStore = new FileRenderProviderHandoffLeaseStore({ leasePath });
const activeLeases = await reloadedStore.listActiveLeases(new Date());
const terminalJob = handoff.jobs.find((job) => job.jobId.endsWith("201"));
const activeJob = handoff.jobs.find((job) => job.jobId.endsWith("202"));
const heldJob = handoff.jobs.find((job) => job.jobId.endsWith("203"));
const skippedJob = handoff.jobs.find((job) => job.jobId.endsWith("204"));

const checks = [
  check("schema_version", handoff.schemaVersion === "cinejelly.render-provider-handoff.v1"),
  check("warns_for_active_or_held_work", handoff.status === "warn"),
  check("terminal_job_released", terminalJob?.action === "close_terminal_succeeded" && terminalJob.leaseRetained === false && terminalJob.leaseReleased === true),
  check("active_job_retains_lease", activeJob?.action === "continue_polling" && activeJob.leaseRetained === true && activeJob.leaseReleased === false),
  check("active_job_heartbeat_recorded", activeJob?.leaseHeartbeatStatus === "recorded" && Boolean(activeJob.leaseHeartbeatAt)),
  check("heartbeat_count_recorded", handoff.summary.heartbeatRecordedCount === 1),
  check("held_job_not_stolen", heldJob?.action === "lease_unavailable" && heldJob.leaseStatus === "held_by_other"),
  check("missing_checkpoint_skipped", skippedJob?.action === "skip_no_checkpoint"),
  check("lease_file_written", persistedLeases.schemaVersion === "cinejelly.render-provider-handoff-leases.v1"),
  check("active_lease_survives_reload", activeLeases.some((lease) => lease.jobId.endsWith("202"))),
  check("active_lease_renewed_at_survives_reload", activeLeases.some((lease) => lease.jobId.endsWith("202") && lease.renewedAt instanceof Date)),
  check("terminal_lease_not_active_after_release", !activeLeases.some((lease) => lease.jobId.endsWith("201"))),
  check("does_not_claim_distributed_resume", handoff.releaseGateSummary.canClaimDistributedResume === false),
  check("raw_provider_payload_not_serialized", !JSON.stringify(handoff).includes("raw-handoff-provider-payload")),
  check("local_provider_path_not_serialized", !JSON.stringify(handoff).includes("C:\\Users\\Admin\\secret"))
];

const report = {
  ...handoff,
  generatedAt: handoff.generatedAt.toISOString(),
  reconciliation: {
    ...handoff.reconciliation,
    generatedAt: handoff.reconciliation.generatedAt.toISOString()
  },
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: toRepoRelative(outputPath),
    leasePath: toRepoRelative(leasePath),
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

function checkpointJob(jobId, predictionId) {
  return {
    jobId,
    status: "canceled",
    retentionSource: "history_store",
    detailRetention: "compact_restored",
    providerCheckpoint: {
      providerOperationCount: 1,
      providers: ["atlascloud"],
      operations: ["video.wait_for_prediction"],
      predictionIds: [predictionId],
      assetIds: [],
      activePredictionIds: [predictionId],
      terminalPredictionIds: [],
      latestProvider: "atlascloud",
      latestOperation: "video.wait_for_prediction",
      latestProviderStatus: "running",
      latestProviderCallStatus: "succeeded",
      latestPredictionId: predictionId,
      lastRecordedAt: new Date("2026-06-17T00:00:45.000Z"),
      hasRetryableFailure: false,
      retryCount: 0
    }
  };
}

function toRepoRelative(value) {
  const resolved = resolve(value);
  const relative = resolved.startsWith(repoRoot)
    ? resolved.slice(repoRoot.length).replace(/^[/\\]/, "")
    : resolved;
  return relative.replace(/\\/g, "/");
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
  };
}
