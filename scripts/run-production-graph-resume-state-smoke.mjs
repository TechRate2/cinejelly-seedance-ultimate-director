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
  FileProductionGraphResumeQueueStore,
  FileProductionGraphResumeStateStore,
  ProductionGraphResumeStateBuilder
} = await import("../dist/core/production-graph-resume-state.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/production-graph-resume-state-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/production-graph-resume-state-smoke");
const statePath = resolve(workDir, "resume-state.json");
const queuePath = resolve(workDir, "resume-queue.json");
const queueName = "graph_resume_lane_primary";
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo durable task ownership and resume-state persistence",
  "vericontext/vibeframe deterministic status/report evidence before release claims",
  "HKUDS/ViMax graph-aware long-form workflow boundaries",
  "HKUDS/VideoAgent graph-style tool planning and resume context separation"
];

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const graph = fakeGraph();
const builder = new ProductionGraphResumeStateBuilder();
const capsule = builder.build({
  jobId: "render_job_00000000-0000-4000-8000-000000000701",
  actionId: "handoff_action_00000000-0000-4000-8000-000000000701",
  graph,
  providerWork: {
    providers: ["atlascloud"],
    operations: ["video.wait_for_prediction"],
    predictionIds: ["pred_resume_active", "pred_resume_terminal"],
    activePredictionIds: ["pred_resume_active"],
    terminalPredictionIds: ["pred_resume_terminal"]
  },
  now: new Date("2026-06-18T00:00:00.000Z"),
  ttlMs: 120_000
});
const secondCapsule = builder.build({
  jobId: "render_job_00000000-0000-4000-8000-000000000701",
  actionId: "handoff_action_00000000-0000-4000-8000-000000000701",
  graph,
  providerWork: {
    providers: ["atlascloud"],
    operations: ["video.wait_for_prediction"],
    predictionIds: ["pred_resume_active", "pred_resume_terminal"],
    activePredictionIds: ["pred_resume_active"],
    terminalPredictionIds: ["pred_resume_terminal"]
  },
  now: new Date("2026-06-18T00:00:00.000Z"),
  ttlMs: 120_000
});

const store = new FileProductionGraphResumeStateStore({ statePath });
await store.save(capsule);
const reloaded = await new FileProductionGraphResumeStateStore({ statePath }).list();
const reloadedByJob = await new FileProductionGraphResumeStateStore({ statePath }).findByJobId(capsule.jobId);
const persistedStore = JSON.parse(await readFile(statePath, "utf8"));
const queueStore = new FileProductionGraphResumeQueueStore({ queuePath });
const enqueueFirst = await queueStore.enqueue({
  queueName,
  capsule,
  now: new Date("2026-06-18T00:01:00.000Z")
});
const enqueueReplay = await queueStore.enqueue({
  queueName,
  capsule,
  now: new Date("2026-06-18T00:01:01.000Z")
});
const lease = await queueStore.leaseNext({
  queueName,
  workerId: "resume_worker_a",
  leaseTtlMs: 120_000,
  now: new Date("2026-06-18T00:02:00.000Z")
});
const reloadedLeasedQueue = await new FileProductionGraphResumeQueueStore({ queuePath }).list();
const ack = lease.record?.leaseId
  ? await queueStore.acknowledge({
      queueRecordId: lease.record.queueRecordId,
      leaseId: lease.record.leaseId,
      now: new Date("2026-06-18T00:03:00.000Z")
    })
  : { status: "not_found" };
const reloadedAckedQueue = await new FileProductionGraphResumeQueueStore({ queuePath }).list();
const persistedQueue = JSON.parse(await readFile(queuePath, "utf8"));
const publicPayload = JSON.stringify({ capsule, reloaded, persistedStore, enqueueFirst, enqueueReplay, lease, ack, persistedQueue });
const checks = [
  check("capsule_schema_version_is_current", capsule.schemaVersion === "cinejelly.production-graph-resume-state.v1"),
  check("capsule_digest_is_stable_for_same_inputs", capsule.capsuleSha256 === secondCapsule.capsuleSha256),
  check("store_reload_preserves_one_capsule", reloaded.length === 1 && reloadedByJob?.capsuleSha256 === capsule.capsuleSha256),
  check("queue_first_enqueue_records_one_item", enqueueFirst.status === "enqueued" && persistedQueue.records?.length === 1),
  check("queue_second_enqueue_replays_idempotently", enqueueReplay.status === "replayed" && enqueueReplay.record.idempotencyKey === enqueueFirst.record.idempotencyKey),
  check("queue_lease_marks_record_leased", lease.status === "leased" && lease.record?.status === "leased" && reloadedLeasedQueue[0]?.status === "leased"),
  check("queue_ack_persists_acknowledged_state", ack.status === "acknowledged" && reloadedAckedQueue[0]?.status === "acknowledged"),
  check("queue_stores_digests_not_raw_queue_names", !publicPayload.includes(queueName) && /^[a-f0-9]{64}$/.test(enqueueFirst.record.queueNameSha256)),
  check("queue_stores_digests_not_worker_ids", !publicPayload.includes("resume_worker_a") && /^[a-f0-9]{64}$/.test(lease.record?.workerIdSha256 ?? "")),
  check("graph_counts_match_source_snapshot", capsule.graphSummary.nodeCount === graph.nodes.length && capsule.graphSummary.edgeCount === graph.edges.length),
  check("active_clip_cursor_selected", capsule.resumeCursor.nextNodeType === "clip_render" && capsule.resumeCursor.activeClipRenderCount === 1),
  check("provider_prediction_ids_are_digest_only", capsule.providerWorkSummary.predictionIdCount === 2 && !publicPayload.includes("pred_resume_active")),
  check("raw_graph_state_not_stored", capsule.redactionSummary.rawGraphStateStored === false && !publicPayload.includes("operator supplied secret")),
  check("output_urls_not_stored", capsule.redactionSummary.outputUrlsStored === false && !publicPayload.includes("cdn.example.com/final.mp4")),
  check("local_paths_not_stored", capsule.redactionSummary.localPathsStored === false && !publicPayload.includes("C:\\Users\\Admin\\secret")),
  check("secrets_not_stored", capsule.redactionSummary.secretLikeTextStored === false && !/api[_-]?key|sk_live|Bearer/i.test(publicPayload)),
  check("provider_payload_not_stored", capsule.redactionSummary.rawProviderPayloadStored === false && !publicPayload.includes("raw provider payload")),
  check("release_claims_remain_false", capsule.releaseGateSummary.canClaimDistributedResume === false && capsule.releaseGateSummary.canReleaseToCustomerTraffic === false),
  check("requires_action_ledger_prediction_ids", capsule.providerWorkSummary.requiresActionLedgerPredictionIds === true),
  check("store_uses_current_schema", persistedStore.schemaVersion === "cinejelly.production-graph-resume-state-store.v1")
];

const report = {
  schemaVersion: "cinejelly.production-graph-resume-state-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  queueCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: toRepoRelative(outputPath),
    statePath: toRepoRelative(statePath),
    queuePath: toRepoRelative(queuePath),
    fakeGraph: true,
    graphNodeCount: graph.nodes.length,
    graphEdgeCount: graph.edges.length
  },
  summary: {
    createdCapsuleCount: 1,
    restoredCapsuleCount: reloaded.length,
    enqueuedRecordCount: persistedQueue.records?.length ?? 0,
    idempotentReplayCount: enqueueReplay.status === "replayed" ? 1 : 0,
    leasedRecordCount: reloadedLeasedQueue.filter((item) => item.status === "leased").length,
    acknowledgedRecordCount: reloadedAckedQueue.filter((item) => item.status === "acknowledged").length,
    nodeCount: capsule.graphSummary.nodeCount,
    edgeCount: capsule.graphSummary.edgeCount,
    sourceGraphSha256: capsule.sourceGraphSha256,
    redactedGraphSha256: capsule.redactedGraphSha256,
    capsuleSha256: capsule.capsuleSha256,
    activeClipRenderCount: capsule.resumeCursor.activeClipRenderCount,
    activePredictionIdCount: capsule.providerWorkSummary.activePredictionIdCount,
    rawGraphStateStored: capsule.redactionSummary.rawGraphStateStored,
    rawProviderPayloadStored: capsule.redactionSummary.rawProviderPayloadStored,
    outputUrlsStored: capsule.redactionSummary.outputUrlsStored,
    localPathsStored: capsule.redactionSummary.localPathsStored,
    secretLikeTextStored: capsule.redactionSummary.secretLikeTextStored,
    canClaimDistributedResume: capsule.releaseGateSummary.canClaimDistributedResume,
    canReleaseToCustomerTraffic: capsule.releaseGateSummary.canReleaseToCustomerTraffic
  },
  capsule: publicCapsule(capsule),
  queue: {
    schemaVersion: "cinejelly.production-graph-resume-queue.v1",
    firstEnqueueStatus: enqueueFirst.status,
    replayStatus: enqueueReplay.status,
    leaseStatus: lease.status,
    ackStatus: ack.status,
    record: publicQueueRecord(ack.record ?? lease.record ?? enqueueFirst.record)
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

if (report.status === "fail") {
  process.exitCode = 1;
}

function fakeGraph() {
  const timestamp = new Date("2026-06-18T00:00:00.000Z");
  const projectNode = {
    id: "project_resume_state",
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
      targetDurationSeconds: 120,
      metadata: {
        requestId: "req_resume_state",
        authorization: unsafeBearerText()
      }
    }
  };
  const shotNode = {
    id: "shot_resume_state",
    type: "shot",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      shotId: "shot_resume_state",
      sceneId: "scene_resume_state",
      beatId: "beat_resume_state",
      durationSeconds: 8,
      intent: "resume active provider work",
      action: "continue polling active Atlas prediction",
      camera: "locked-off",
      motion: "slow push",
      lighting: "soft",
      references: []
    }
  };
  const clipNode = {
    id: "clip_render_resume_state",
    type: "clip_render",
    createdAt: timestamp,
    updatedAt: timestamp,
    data: {
      provider: "atlascloud",
      modelId: "fake/seedance-resume-state-smoke",
      predictionId: "pred_resume_active",
      status: "running",
      outputUrls: ["https://cdn.example.com/final.mp4?token=secret_should_not_escape"],
      candidateIndex: 0,
      selected: false
    }
  };
  const edge = {
    id: "edge_project_shot",
    fromNodeId: projectNode.id,
    toNodeId: shotNode.id,
    type: "depends_on",
    createdAt: timestamp
  };
  const renderEdge = {
    id: "edge_shot_clip",
    fromNodeId: shotNode.id,
    toNodeId: clipNode.id,
    type: "depends_on",
    createdAt: timestamp
  };
  return {
    nodes: [projectNode, shotNode, clipNode],
    edges: [edge, renderEdge]
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

function publicQueueRecord(value) {
  return {
    queueRecordId: value.queueRecordId,
    idempotencyKey: value.idempotencyKey,
    queueNameSha256: value.queueNameSha256,
    capsuleId: value.capsuleId,
    capsuleSha256: value.capsuleSha256,
    jobId: value.jobId,
    actionId: value.actionId,
    graphStateSha256: value.graphStateSha256,
    resumeCursorSha256: value.resumeCursorSha256,
    predictionIdsSha256: value.predictionIdsSha256,
    predictionIdCount: value.predictionIdCount,
    activePredictionIdCount: value.activePredictionIdCount,
    status: value.status,
    enqueuedAt: value.enqueuedAt.toISOString(),
    attemptCount: value.attemptCount,
    leaseId: value.leaseId,
    workerIdSha256: value.workerIdSha256,
    leasedAt: value.leasedAt?.toISOString(),
    leaseExpiresAt: value.leaseExpiresAt?.toISOString(),
    acknowledgedAt: value.acknowledgedAt?.toISOString()
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
