#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const { FileRenderProviderHandoffActionLedger } = await import("../dist/api/render-provider-handoff-action-ledger.js");
const { ProductionGraphResumeQueueHttpClient } = await import("../dist/api/production-graph-resume-queue-client.js");
const { RenderProviderGraphResumeWorker } = await import("../dist/api/render-provider-graph-resume-worker.js");
const {
  FileProductionGraphResumeStateStore,
  ProductionGraphResumeStateBuilder
} = await import("../dist/core/production-graph-resume-state.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke");
const ledgerPath = resolve(workDir, "actions.json");
const statePath = resolve(workDir, "resume-state.json");
const queuePath = resolve(workDir, "resume-queue.json");
const queueName = "graph_resume_worker_lane";
const deploymentToken = ["graph_resume_worker_", "deployment_", "token_must_not_leak_0001"].join("");
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo durable worker task handoff pattern",
  "vericontext/vibeframe deterministic worker evidence refresh discipline"
];

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const restoredEnv = preserveEnv([
  "CINEJELLY_API_AUTH_TOKEN",
  "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH",
  "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_MAX_RECORDS",
  "CINEJELLY_DISABLE_API_RATE_LIMIT"
]);
process.env.CINEJELLY_API_AUTH_TOKEN = deploymentToken;
process.env.CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH = queuePath;
process.env.CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_MAX_RECORDS = "50";
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";

const server = startServer(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Render provider graph-resume worker smoke server did not bind to a TCP port.");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

let report;
try {
  const ledger = new FileRenderProviderHandoffActionLedger({ ledgerPath });
  const firstApply = await ledger.applyHandoffReport(fakeHandoffReport(), new Date("2026-06-19T01:00:00.000Z"));
  const actionRecords = await ledger.listRecords();
  const resumeAction = actionRecords.find((item) => item.action === "resume_polling");
  if (!resumeAction) {
    throw new Error("Smoke fixture did not produce a resume_polling action.");
  }

  const capsule = new ProductionGraphResumeStateBuilder().build({
    jobId: resumeAction.jobId,
    actionId: resumeAction.actionId,
    graph: fakeGraph(),
    providerWork: {
      providers: ["atlascloud"],
      operations: ["video.wait_for_prediction"],
      predictionIds: [...resumeAction.predictionIds],
      activePredictionIds: [...resumeAction.predictionIds],
      terminalPredictionIds: []
    },
    now: new Date("2026-06-19T01:00:30.000Z"),
    ttlMs: 86_400_000
  });
  const stateStore = new FileProductionGraphResumeStateStore({ statePath });
  await stateStore.save(capsule);

  const queueClient = new ProductionGraphResumeQueueHttpClient({
    baseUrl,
    authToken: deploymentToken
  });
  const worker = new RenderProviderGraphResumeWorker({
    queueName,
    capsuleStore: stateStore,
    queueClient
  });
  const firstRun = await worker.run(actionRecords, new Date("2026-06-19T01:01:00.000Z"));
  const secondRun = await worker.run(actionRecords, new Date("2026-06-19T01:01:05.000Z"));
  const records = await queueClient.list();
  const persistedQueue = JSON.parse(await readFile(queuePath, "utf8"));
  const publicPayload = JSON.stringify({ firstRun, secondRun, records });
  const checks = [
    check("action_ledger_records_resume_action", firstApply.summary.recordedActionCount === 3 && actionRecords.some((item) => item.action === "resume_polling")),
    check("first_run_enqueues_one_resume_action", firstRun.status === "pass" && firstRun.summary.enqueuedCount === 1 && firstRun.summary.replayedCount === 0),
    check("first_run_skips_non_resume_actions", firstRun.summary.skippedCount === 2),
    check("second_run_replays_existing_queue_record", secondRun.status === "pass" && secondRun.summary.enqueuedCount === 0 && secondRun.summary.replayedCount === 1),
    check("queue_service_contains_one_record", records.records.length === 1 && persistedQueue.records?.length === 1),
    check("queue_record_matches_worker_action", records.records[0]?.actionId === resumeAction.actionId && records.records[0]?.jobId === resumeAction.jobId),
    check("queue_record_digest_matches_capsule", records.records[0]?.capsuleSha256 === capsule.capsuleSha256 && records.records[0]?.predictionIdsSha256 === capsule.providerWorkSummary.predictionIdsSha256),
    check("worker_report_never_claims_live_evidence", firstRun.releaseGateSummary.canUseAsLiveProviderActionEvidence === false && firstRun.releaseGateSummary.canUseAsGraphResumePayloadEvidence === false),
    check("worker_report_never_claims_distributed_resume", firstRun.releaseGateSummary.canClaimDistributedResume === false && secondRun.releaseGateSummary.canClaimDistributedResume === false),
    check("no_real_provider_calls", firstRun.summary.realProviderCallCount === 0 && secondRun.summary.realProviderCallCount === 0),
    check("deployment_token_not_serialized", !publicPayload.includes(deploymentToken)),
    check("queue_name_not_serialized", !publicPayload.includes(queueName)),
    check("raw_prediction_id_not_serialized", !publicPayload.includes("pred_graph_resume_worker_active")),
    check("raw_url_not_serialized", !publicPayload.includes("cdn.example.com/graph-resume-worker.mp4")),
    check("local_path_not_serialized", !publicPayload.includes("C:\\Users\\Admin\\secret"))
  ];
  report = {
    schemaVersion: "cinejelly.render-provider-graph-resume-worker-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
    noSpend: true,
    networkCallsMade: false,
    localHttpCallsMade: true,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: toRepoRelative(outputPath),
      ledgerPath: toRepoRelative(ledgerPath),
      statePath: toRepoRelative(statePath),
      queuePath: toRepoRelative(queuePath),
      localServer: true,
      fakeGraph: true
    },
    summary: {
      actionLedgerStatus: firstApply.status,
      checkedActionCount: firstRun.summary.checkedActionCount,
      resumeActionCount: firstRun.summary.resumeActionCount,
      firstRunStatus: firstRun.status,
      secondRunStatus: secondRun.status,
      firstEnqueuedCount: firstRun.summary.enqueuedCount,
      secondReplayedCount: secondRun.summary.replayedCount,
      skippedNonResumeCount: firstRun.summary.skippedCount,
      queueRecordCount: records.records.length,
      realProviderCallCount: 0,
      canUseAsLiveProviderActionEvidence: false,
      canUseAsGraphResumePayloadEvidence: false,
      canClaimDistributedResume: false
    },
    firstRun: publicWorkerReport(firstRun),
    secondRun: publicWorkerReport(secondRun),
    queue: {
      recordCount: records.records.length,
      record: records.records[0] ? publicQueueRecord(records.records[0]) : undefined
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

function fakeHandoffReport() {
  return {
    schemaVersion: "cinejelly.render-provider-handoff.v1",
    generatedAt: new Date("2026-06-19T01:00:00.000Z"),
    status: "warn",
    summary: {},
    reconciliation: {},
    jobs: [
      {
        jobId: "render_job_graph_resume_worker_001",
        status: "warn",
        action: "continue_polling",
        leaseRetained: true,
        leaseReleased: false,
        activePredictionIds: ["pred_graph_resume_worker_active"],
        terminalPredictionIds: [],
        predictionStatuses: []
      },
      {
        jobId: "render_job_graph_resume_worker_002",
        status: "pass",
        action: "close_terminal_succeeded",
        leaseRetained: false,
        leaseReleased: true,
        activePredictionIds: [],
        terminalPredictionIds: ["pred_graph_resume_worker_terminal"],
        predictionStatuses: []
      },
      {
        jobId: "render_job_graph_resume_worker_003",
        status: "warn",
        action: "manual_audit_required",
        leaseRetained: false,
        leaseReleased: true,
        activePredictionIds: ["pred_graph_resume_worker_manual"],
        terminalPredictionIds: [],
        predictionStatuses: []
      }
    ],
    releaseGateSummary: { canClaimDistributedResume: false },
    nextActions: []
  };
}

function fakeGraph() {
  const timestamp = new Date("2026-06-19T01:00:00.000Z");
  const shotNode = {
    id: "shot_graph_resume_worker",
    type: "shot",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      shotId: "shot_graph_resume_worker",
      sceneId: "scene_graph_resume_worker",
      beatId: "beat_graph_resume_worker",
      durationSeconds: 8,
      intent: "resume active provider work from worker bridge",
      action: "continue polling active Atlas prediction",
      camera: "locked-off",
      motion: "slow push",
      lighting: "soft",
      references: []
    }
  };
  const clipNode = {
    id: "clip_graph_resume_worker",
    type: "clip_render",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      provider: "atlascloud",
      modelId: "fake/seedance-graph-resume-worker-smoke",
      predictionId: "pred_graph_resume_worker_active",
      status: "running",
      outputUrls: ["https://cdn.example.com/graph-resume-worker.mp4?token=secret_should_not_escape"],
      localPath: "C:\\Users\\Admin\\secret\\graph-resume-worker.mp4",
      candidateIndex: 0,
      selected: false
    }
  };
  return {
    nodes: [shotNode, clipNode],
    edges: [
      {
        id: "edge_graph_resume_worker",
        fromNodeId: shotNode.id,
        toNodeId: clipNode.id,
        type: "depends_on",
        createdAt: timestamp
      }
    ]
  };
}

function publicWorkerReport(workerReport) {
  return {
    schemaVersion: workerReport.schemaVersion,
    generatedAt: workerReport.generatedAt.toISOString(),
    status: workerReport.status,
    summary: workerReport.summary,
    decisions: workerReport.decisions,
    releaseGateSummary: workerReport.releaseGateSummary
  };
}

function publicQueueRecord(record) {
  return {
    queueRecordId: record.queueRecordId,
    idempotencyKey: record.idempotencyKey,
    queueNameSha256: record.queueNameSha256,
    capsuleId: record.capsuleId,
    capsuleSha256: record.capsuleSha256,
    jobId: record.jobId,
    actionId: record.actionId,
    graphStateSha256: record.graphStateSha256,
    resumeCursorSha256: record.resumeCursorSha256,
    predictionIdsSha256: record.predictionIdsSha256,
    predictionIdCount: record.predictionIdCount,
    activePredictionIdCount: record.activePredictionIdCount,
    status: record.status
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

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
  };
}

function toRepoRelative(value) {
  const resolved = resolve(value);
  const relative = resolved.startsWith(repoRoot)
    ? resolved.slice(repoRoot.length).replace(/^[/\\]/, "")
    : resolved;
  return relative.replace(/\\/g, "/");
}
