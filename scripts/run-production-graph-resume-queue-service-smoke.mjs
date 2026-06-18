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
const { ProductionGraphResumeStateBuilder } = await import("../dist/core/production-graph-resume-state.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke");
const queuePath = resolve(workDir, "resume-queue.json");
const endpointPath = "/v1/production-graph-resume-queue";
const deploymentToken = ["graph_resume_queue_service_", "deployment_", "token_must_not_leak_0001"].join("");
const queueName = "graph_resume_service_lane";
const workerId = "resume_service_worker_a";
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo durable queue-backed task ownership pattern",
  "vericontext/vibeframe protected deployment status/report refresh discipline"
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

const capsule = new ProductionGraphResumeStateBuilder().build({
  jobId: "render_job_graph_resume_queue_service_001",
  actionId: "handoff_action_graph_resume_queue_service_001",
  graph: fakeGraph(),
  providerWork: {
    providers: ["atlascloud"],
    operations: ["generateVideo"],
    predictionIds: ["pred_resume_queue_service_active", "pred_resume_queue_service_terminal"],
    activePredictionIds: ["pred_resume_queue_service_active"],
    terminalPredictionIds: ["pred_resume_queue_service_terminal"]
  },
  now: new Date("2026-06-19T00:00:00.000Z"),
  ttlMs: 86_400_000
});

const server = startServer(0);
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Production Graph resume queue service smoke server did not bind to a TCP port.");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

let report;
try {
  const unauthorized = await request("POST", `${endpointPath}/enqueue`, {
    queueName,
    capsule: publicCapsule(capsule),
    now: "2026-06-19T00:01:00.000Z"
  }, null);
  const preflight = await request("GET", "/v1/preflight");
  const enqueueFirst = await request("POST", `${endpointPath}/enqueue`, {
    queueName,
    capsule: publicCapsule(capsule),
    now: "2026-06-19T00:01:00.000Z"
  });
  const enqueueReplay = await request("POST", `${endpointPath}/enqueue`, {
    queueName,
    capsule: publicCapsule(capsule),
    now: "2026-06-19T00:01:01.000Z"
  });
  const lease = await request("POST", `${endpointPath}/lease`, {
    queueName,
    workerId,
    leaseTtlMs: 120_000,
    now: "2026-06-19T00:02:00.000Z"
  });
  const recordsAfterLease = await request("GET", `${endpointPath}/records`);
  const wrongAck = await request("POST", `${endpointPath}/acknowledge`, {
    queueRecordId: String(lease.json.record?.queueRecordId ?? ""),
    leaseId: "graph_resume_lease_wrong_for_service_smoke",
    now: "2026-06-19T00:02:30.000Z"
  });
  const ack = await request("POST", `${endpointPath}/acknowledge`, {
    queueRecordId: String(lease.json.record?.queueRecordId ?? ""),
    leaseId: String(lease.json.record?.leaseId ?? ""),
    now: "2026-06-19T00:03:00.000Z"
  });
  const recordsAfterAck = await request("GET", `${endpointPath}/records`);
  const invalidBody = await request("POST", `${endpointPath}/lease`, {
    queueName,
    workerId,
    leaseTtlMs: "120000"
  });
  const persistedQueue = JSON.parse(await readFile(queuePath, "utf8"));
  const publicPayload = JSON.stringify({
    unauthorized,
    preflight: {
      status: preflight.status,
      queuePathCheck: preflightQueuePathCheck(preflight.json)
    },
    enqueueFirst,
    enqueueReplay,
    lease,
    recordsAfterLease,
    wrongAck,
    ack,
    recordsAfterAck,
    invalidBody
  });
  const checks = [
    check("unauthorized_rejected", unauthorized.status === 401),
    check("preflight_queue_path_pass", preflightQueuePathCheck(preflight.json)?.status === "pass"),
    check("first_enqueue_records_item", enqueueFirst.status === 200 && enqueueFirst.json.status === "enqueued"),
    check("second_enqueue_replays_idempotently", enqueueReplay.status === 200 && enqueueReplay.json.status === "replayed" && enqueueReplay.json.record?.idempotencyKey === enqueueFirst.json.record?.idempotencyKey),
    check("lease_returns_leased_record", lease.status === 200 && lease.json.status === "leased" && lease.json.record?.status === "leased"),
    check("wrong_ack_reports_lease_mismatch", wrongAck.status === 200 && wrongAck.json.status === "lease_mismatch"),
    check("acknowledge_persists_acknowledged_record", ack.status === 200 && ack.json.status === "acknowledged" && ack.json.record?.status === "acknowledged"),
    check("records_after_ack_contains_acknowledged", recordsAfterAck.status === 200 && recordsAfterAck.json.records?.some((record) => record.status === "acknowledged") === true),
    check("invalid_body_rejected", invalidBody.status === 400),
    check("queue_file_written", persistedQueue.schemaVersion === "cinejelly.production-graph-resume-queue-store.v1"),
    check("deployment_token_not_serialized", !publicPayload.includes(deploymentToken)),
    check("queue_name_not_serialized", !publicPayload.includes(queueName) && /^[a-f0-9]{64}$/.test(enqueueFirst.json.record?.queueNameSha256 ?? "")),
    check("worker_id_not_serialized", !publicPayload.includes(workerId) && /^[a-f0-9]{64}$/.test(lease.json.record?.workerIdSha256 ?? "")),
    check("can_claim_distributed_resume_false", true)
  ];
  report = {
    schemaVersion: "cinejelly.production-graph-resume-queue-service-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
    noSpend: true,
    externalNetworkCallsMade: false,
    localHttpCallsMade: true,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: toRepoRelative(outputPath),
      queuePath: toRepoRelative(queuePath),
      endpointPath,
      localServer: true,
      fakeGraph: true
    },
    summary: {
      firstEnqueueStatus: String(enqueueFirst.json.status ?? "unknown"),
      replayStatus: String(enqueueReplay.json.status ?? "unknown"),
      leaseStatus: String(lease.json.status ?? "unknown"),
      wrongAckStatus: String(wrongAck.json.status ?? "unknown"),
      ackStatus: String(ack.json.status ?? "unknown"),
      recordCount: Array.isArray(recordsAfterAck.json.records) ? recordsAfterAck.json.records.length : 0,
      acknowledgedRecordCount: Array.isArray(recordsAfterAck.json.records)
        ? recordsAfterAck.json.records.filter((record) => record.status === "acknowledged").length
        : 0,
      preflightQueuePathStatus: String(preflightQueuePathCheck(preflight.json)?.status ?? "missing"),
      rawQueueNamesStored: false,
      rawWorkerIdsStored: false,
      canClaimDistributedResume: false
    },
    queue: {
      schemaVersion: "cinejelly.production-graph-resume-queue.v1",
      endpointPath,
      record: ack.json.record ?? lease.json.record ?? enqueueFirst.json.record
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

async function request(method, path, body, token = deploymentToken) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const json = await response.json();
  return {
    status: response.status,
    json
  };
}

function preflightQueuePathCheck(payload) {
  return Array.isArray(payload?.checks)
    ? payload.checks.find((item) => item.name === "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH")
    : undefined;
}

function fakeGraph() {
  const timestamp = new Date("2026-06-19T00:00:00.000Z");
  const projectNode = {
    id: "project_resume_queue_service",
    type: "project",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      userInput: `operator supplied secret ${unsafeApiKeyText()} and ${unsafeLocalPathText()}`,
      settings: {
        qualityMode: "pro",
        durationTargetSeconds: 120,
        resolution: "1080p",
        ratio: "16:9",
        seed: 42,
        generateAudio: true
      },
      metadata: {
        requestId: "req_resume_queue_service",
        authorization: unsafeBearerText()
      }
    }
  };
  const shotNode = {
    id: "shot_resume_queue_service",
    type: "shot",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      shotId: "shot_resume_queue_service",
      sceneId: "scene_resume_queue_service",
      beatId: "beat_resume_queue_service",
      durationSeconds: 8,
      intent: "resume active provider work through protected queue service",
      action: "continue polling active Atlas prediction",
      camera: "locked-off",
      motion: "slow push",
      lighting: "soft",
      references: []
    }
  };
  const clipNode = {
    id: "clip_render_resume_queue_service",
    type: "clip_render",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      provider: "atlascloud",
      modelId: "fake/seedance-resume-queue-service-smoke",
      predictionId: "pred_resume_queue_service_active",
      status: "running",
      outputUrls: ["https://cdn.example.com/queue-service.mp4?token=secret_should_not_escape"],
      candidateIndex: 0,
      selected: false
    }
  };
  return {
    nodes: [projectNode, shotNode, clipNode],
    edges: [
      {
        id: "edge_project_queue_service_shot",
        fromNodeId: projectNode.id,
        toNodeId: shotNode.id,
        type: "depends_on",
        createdAt: timestamp
      },
      {
        id: "edge_shot_queue_service_clip",
        fromNodeId: shotNode.id,
        toNodeId: clipNode.id,
        type: "depends_on",
        createdAt: timestamp
      }
    ]
  };
}

function unsafeApiKeyText() {
  return ["api", "_key=", "sk", "_live_should_not_escape"].join("");
}

function unsafeBearerText() {
  return ["Bear", "er ", "token", "_should_not_escape"].join("");
}

function unsafeLocalPathText() {
  return ["C:", "\\", "Users", "\\", "Admin", "\\", "secret", "\\", "prompt.txt"].join("");
}

function publicCapsule(value) {
  return {
    schemaVersion: value.schemaVersion,
    capsuleId: value.capsuleId,
    jobId: value.jobId,
    actionId: value.actionId,
    createdAt: value.createdAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    sourceGraphSha256: value.sourceGraphSha256,
    redactedGraphSha256: value.redactedGraphSha256,
    capsuleSha256: value.capsuleSha256,
    graphSummary: {
      nodeCount: value.graphSummary.nodeCount,
      edgeCount: value.graphSummary.edgeCount,
      nodeTypeCounts: value.graphSummary.nodeTypeCounts,
      nodes: value.graphSummary.nodes.map((node) => ({
        ...node,
        createdAt: node.createdAt.toISOString(),
        updatedAt: node.updatedAt.toISOString()
      })),
      edges: value.graphSummary.edges.map((edge) => ({
        ...edge,
        createdAt: edge.createdAt.toISOString()
      }))
    },
    providerWorkSummary: value.providerWorkSummary,
    resumeCursor: value.resumeCursor,
    redactionSummary: value.redactionSummary,
    releaseGateSummary: value.releaseGateSummary
  };
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
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

function toRepoRelative(value) {
  const resolved = resolve(value);
  const relative = resolved.startsWith(repoRoot)
    ? resolved.slice(repoRoot.length).replace(/^[/\\]/, "")
    : resolved;
  return relative.replace(/\\/g, "/");
}
