#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";

const compile = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: resolve("."),
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const { startServer } = await import("../dist/api/server.js");
const { RenderProviderHandoffCoordinator } = await import("../dist/api/render-provider-handoff.js");
const { FileRenderProviderHandoffActionLedger } = await import("../dist/api/render-provider-handoff-action-ledger.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-smoke");
const leasePath = resolve(workDir, "leases.json");
const actionLedgerPath = resolve(workDir, "actions.json");
const endpointPath = "/v1/render-provider-handoff-leases";
const deploymentToken = "multi_worker_handoff_deployment_token_must_not_leak_0001";
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo memory/Redis task ownership pattern",
  "vericontext/vibeframe deterministic status/report refresh discipline",
  "Atlas Cloud prediction status evidence"
];

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const restoredEnv = preserveEnv([
  "CINEJELLY_API_AUTH_TOKEN",
  "CINEJELLY_RENDER_PROVIDER_LEASE_PATH",
  "CINEJELLY_RENDER_PROVIDER_LEASE_MAX_RECORDS",
  "CINEJELLY_DISABLE_API_RATE_LIMIT"
]);
process.env.CINEJELLY_API_AUTH_TOKEN = deploymentToken;
process.env.CINEJELLY_RENDER_PROVIDER_LEASE_PATH = leasePath;
process.env.CINEJELLY_RENDER_PROVIDER_LEASE_MAX_RECORDS = "50";
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";

const server = startServer(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Multi-worker handoff smoke server did not bind to a TCP port.");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

class LocalProtectedLeaseStore {
  constructor(input) {
    this.baseUrl = input.baseUrl;
    this.token = input.token;
  }

  async acquireLease(input) {
    const payload = await this.post("acquire", {
      jobId: input.jobId,
      ownerId: input.ownerId,
      ttlMs: input.ttlMs,
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return {
      status: String(payload.status),
      ...(payload.lease ? { lease: this.lease(payload.lease) } : {}),
      ...(payload.heldBy ? { heldBy: { expiresAt: new Date(String(payload.heldBy.expiresAt)) } } : {})
    };
  }

  async releaseLease(input) {
    const payload = await this.post("release", {
      jobId: input.jobId,
      ownerId: input.ownerId,
      ...(input.leaseId ? { leaseId: input.leaseId } : {}),
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return payload.released === true;
  }

  async heartbeatLease(input) {
    const payload = await this.post("heartbeat", {
      jobId: input.jobId,
      ownerId: input.ownerId,
      leaseId: input.leaseId,
      ttlMs: input.ttlMs,
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return {
      status: String(payload.status),
      ...(payload.lease ? { lease: this.lease(payload.lease) } : {}),
      ...(payload.heartbeatAt ? { heartbeatAt: new Date(String(payload.heartbeatAt)) } : {}),
      ...(payload.expiresAt ? { expiresAt: new Date(String(payload.expiresAt)) } : {})
    };
  }

  async listLeases() {
    const payload = await this.get("leases");
    return Array.isArray(payload.leases) ? payload.leases.map((item) => this.lease(item)) : [];
  }

  async listActiveLeases(now) {
    const suffix = now ? `?now=${encodeURIComponent(now.toISOString())}` : "";
    const payload = await this.get(`active${suffix}`);
    return Array.isArray(payload.leases) ? payload.leases.map((item) => this.lease(item)) : [];
  }

  async post(operation, body) {
    return this.request(`${endpointPath}/${operation}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  async get(operationAndQuery) {
    return this.request(`${endpointPath}/${operationAndQuery}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.token}`
      }
    });
  }

  async request(path, init) {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Protected lease service returned HTTP ${response.status}.`);
    }
    return payload;
  }

  lease(value) {
    return {
      jobId: String(value.jobId),
      leaseId: String(value.leaseId),
      ownerId: String(value.ownerId),
      acquiredAt: new Date(String(value.acquiredAt)),
      expiresAt: new Date(String(value.expiresAt)),
      ...(value.renewedAt ? { renewedAt: new Date(String(value.renewedAt)) } : {}),
      ...(value.releasedAt ? { releasedAt: new Date(String(value.releasedAt)) } : {})
    };
  }
}

let report;
try {
  const fakeProvider = {
    name: "atlascloud",
    async getPrediction(predictionId) {
      if (predictionId !== "pred_multi_worker_active") {
        throw new Error(`Unknown fake prediction ${predictionId}.`);
      }
      return {
        provider: "atlascloud",
        predictionId,
        modelId: "fake/seedance-multi-worker-handoff-smoke",
        status: "running",
        outputUrls: ["https://cdn.example.com/multi-worker-active.mp4"],
        raw: {
          secret: "raw-multi-worker-provider-payload-must-not-be-serialized",
          localPath: "C:\\Users\\Admin\\secret\\multi-worker-provider.json"
        },
        submittedAt: new Date("2026-06-17T00:00:00.000Z")
      };
    }
  };
  const summary = checkpointJob("render_job_00000000-0000-4000-8000-000000000601", "pred_multi_worker_active");
  const actionLedger = new FileRenderProviderHandoffActionLedger({ ledgerPath: actionLedgerPath });
  const workerAStore = new LocalProtectedLeaseStore({ baseUrl, token: deploymentToken });
  const workerBStore = new LocalProtectedLeaseStore({ baseUrl, token: deploymentToken });
  const workerA = new RenderProviderHandoffCoordinator({
    leaseStore: workerAStore,
    providers: [fakeProvider],
    ownerId: "multi_worker_owner_a_must_not_leak",
    leaseTtlMs: 1_000
  });
  const workerB = new RenderProviderHandoffCoordinator({
    leaseStore: workerBStore,
    providers: [fakeProvider],
    ownerId: "multi_worker_owner_b_must_not_leak",
    leaseTtlMs: 1_000
  });

  const workerAReport = await workerA.run([summary]);
  const firstActionApply = await actionLedger.applyHandoffReport(workerAReport, new Date("2026-06-17T00:01:00.000Z"));
  const workerBImmediateReport = await workerB.run([summary]);
  const immediateActionApply = await actionLedger.applyHandoffReport(workerBImmediateReport, new Date("2026-06-17T00:01:01.000Z"));
  await delay(1_150);
  const workerBAfterExpiryReport = await workerB.run([summary]);
  const afterExpiryActionApply = await actionLedger.applyHandoffReport(workerBAfterExpiryReport, new Date("2026-06-17T00:01:03.000Z"));
  const activeLeases = await workerBStore.listActiveLeases();
  const allLeases = await workerBStore.listLeases();
  const actionRecords = await actionLedger.listRecords();
  const publicPayload = JSON.stringify({
    workerAReport,
    workerBImmediateReport,
    workerBAfterExpiryReport,
    firstActionApply,
    immediateActionApply,
    afterExpiryActionApply
  });
  const checks = [
    check("worker_a_retains_active_lease", workerAReport.jobs[0]?.action === "continue_polling" && workerAReport.jobs[0]?.leaseRetained === true),
    check("worker_a_heartbeat_recorded", workerAReport.jobs[0]?.leaseHeartbeatStatus === "recorded"),
    check("worker_b_immediate_held_by_other", workerBImmediateReport.jobs[0]?.action === "lease_unavailable" && workerBImmediateReport.jobs[0]?.leaseStatus === "held_by_other"),
    check("worker_b_after_expiry_acquires_lease", workerBAfterExpiryReport.jobs[0]?.action === "continue_polling" && workerBAfterExpiryReport.jobs[0]?.leaseStatus === "acquired"),
    check("worker_b_after_expiry_heartbeat_recorded", workerBAfterExpiryReport.jobs[0]?.leaseHeartbeatStatus === "recorded"),
    check("first_action_apply_records_resume", firstActionApply.summary.recordedActionCount === 1 && firstActionApply.decisions[0]?.action === "resume_polling"),
    check("immediate_held_action_skipped", immediateActionApply.summary.skippedActionCount === 1 && immediateActionApply.summary.recordedActionCount === 0),
    check("after_expiry_action_replayed", afterExpiryActionApply.summary.replayedActionCount === 1 && afterExpiryActionApply.summary.recordedActionCount === 0),
    check("action_ledger_persisted_single_intent", actionRecords.length === 1),
    check("active_lease_owned_after_handoff", activeLeases.length === 1 && activeLeases[0]?.jobId === summary.jobId),
    check("expired_and_current_leases_retained_for_audit", allLeases.length >= 2),
    check("does_not_claim_distributed_resume", [
      workerAReport,
      workerBImmediateReport,
      workerBAfterExpiryReport,
      firstActionApply,
      immediateActionApply,
      afterExpiryActionApply
    ].every((item) => item.releaseGateSummary?.canClaimDistributedResume === false)),
    check("owner_ids_not_serialized", !publicPayload.includes("multi_worker_owner_a_must_not_leak") && !publicPayload.includes("multi_worker_owner_b_must_not_leak")),
    check("deployment_token_not_serialized", !publicPayload.includes(deploymentToken)),
    check("raw_provider_payload_not_serialized", !publicPayload.includes("raw-multi-worker-provider-payload")),
    check("output_urls_not_serialized", !publicPayload.includes("cdn.example.com/multi-worker-active.mp4")),
    check("local_provider_path_not_serialized", !publicPayload.includes("C:\\Users\\Admin\\secret"))
  ];
  report = {
    schemaVersion: "cinejelly.render-provider-multi-worker-handoff-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
    noSpend: true,
    externalNetworkCallsMade: false,
    localHttpCallsMade: true,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: toRepoRelative(outputPath),
      leasePath: toRepoRelative(leasePath),
      actionLedgerPath: toRepoRelative(actionLedgerPath),
      endpointPath,
      localServer: true,
      workerCount: 2,
      fakeProvider: true
    },
    summary: {
      workerAAction: String(workerAReport.jobs[0]?.action ?? "missing"),
      workerBImmediateAction: String(workerBImmediateReport.jobs[0]?.action ?? "missing"),
      workerBAfterExpiryAction: String(workerBAfterExpiryReport.jobs[0]?.action ?? "missing"),
      firstRecordedActionCount: firstActionApply.summary.recordedActionCount,
      afterExpiryReplayedActionCount: afterExpiryActionApply.summary.replayedActionCount,
      activeLeaseCount: activeLeases.length,
      totalLeaseRecordCount: allLeases.length,
      actionRecordCount: actionRecords.length,
      canClaimDistributedResume: false
    },
    workerReports: {
      workerA: publicHandoff(workerAReport),
      workerBImmediate: publicHandoff(workerBImmediateReport),
      workerBAfterExpiry: publicHandoff(workerBAfterExpiryReport)
    },
    actionLedger: {
      firstApply: publicActionApply(firstActionApply),
      immediateApply: publicActionApply(immediateActionApply),
      afterExpiryApply: publicActionApply(afterExpiryActionApply)
    },
    checks
  };
} finally {
  await closeServer(server);
  restoreEnv(restoredEnv);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  output: outputPath,
  checkCount: report.checks.length,
  failedCheckCount: report.checks.filter((item) => item.status === "fail").length
}, null, 2));

if (report.status === "fail") {
  process.exitCode = 1;
}

function publicHandoff(report) {
  return {
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt.toISOString(),
    status: report.status,
    summary: report.summary,
    jobs: report.jobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      action: job.action,
      leaseStatus: job.leaseStatus,
      leaseHeartbeatStatus: job.leaseHeartbeatStatus,
      leaseRetained: job.leaseRetained,
      leaseReleased: job.leaseReleased,
      activePredictionIds: job.activePredictionIds,
      terminalPredictionIds: job.terminalPredictionIds,
      reconciliationDecision: job.reconciliationDecision
    })),
    releaseGateSummary: report.releaseGateSummary
  };
}

function publicActionApply(applyResult) {
  return {
    schemaVersion: applyResult.schemaVersion,
    generatedAt: applyResult.generatedAt.toISOString(),
    status: applyResult.status,
    summary: applyResult.summary,
    decisions: applyResult.decisions.map((item) => ({
      jobId: item.jobId,
      status: item.status,
      ...(item.action ? { action: item.action } : {}),
      sourceHandoffAction: item.sourceHandoffAction,
      ...(item.idempotencyKey ? { idempotencyKey: item.idempotencyKey } : {}),
      ...(item.actionId ? { actionId: item.actionId } : {}),
      predictionIds: item.predictionIds,
      message: item.message
    })),
    releaseGateSummary: applyResult.releaseGateSummary
  };
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

function preserveEnv(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function delay(ms) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
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
