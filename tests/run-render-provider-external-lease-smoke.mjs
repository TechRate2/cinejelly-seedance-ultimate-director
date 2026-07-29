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

const {
  HttpRenderProviderHandoffLeaseStore
} = await import("../dist/api/render-provider-handoff-external-lease.js");
const {
  RenderProviderHandoffCoordinator
} = await import("../dist/api/render-provider-handoff.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json"
);
const externalLeaseBaseUrl = "https://lease.example.test/cinejelly/";
const externalLeasePath = "v1/render-provider-handoff-leases";
const externalLeaseToken = "external-lease-token-must-not-leak";
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo Redis task/state backend pattern",
  "vericontext/vibeframe status refresh/report discipline",
  "Atlas Cloud Predictions docs"
];

const fakeService = createFakeExternalLeaseService();
const leaseStore = new HttpRenderProviderHandoffLeaseStore({
  baseUrl: externalLeaseBaseUrl,
  bearerToken: externalLeaseToken,
  endpointPath: externalLeasePath,
  fetchImpl: fakeService.fetch
});

const fakeProvider = {
  name: "atlascloud",
  async getPrediction(predictionId) {
    const statusById = {
      pred_external_terminal: "succeeded",
      pred_external_active: "running",
      pred_external_held: "running"
    };
    const status = statusById[predictionId];
    if (!status) {
      throw new Error(`Unknown fake prediction ${predictionId}.`);
    }
    return {
      provider: "atlascloud",
      predictionId,
      modelId: "fake/seedance-external-lease-smoke",
      status,
      outputUrls: status === "succeeded" ? ["https://cdn.example.com/external-lease.mp4"] : [],
      raw: {
        secret: "raw-external-lease-provider-payload-must-not-be-serialized",
        token: externalLeaseToken
      },
      submittedAt: new Date("2026-06-17T00:00:00.000Z"),
      ...(status === "succeeded" ? { completedAt: new Date("2026-06-17T00:01:00.000Z") } : {})
    };
  }
};

const summaries = [
  checkpointJob("render_job_00000000-0000-4000-8000-000000000301", "pred_external_terminal"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000302", "pred_external_active"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000303", "pred_external_held"),
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000304",
    status: "failed",
    retentionSource: "history_store",
    detailRetention: "compact_restored"
  }
];

const coordinator = new RenderProviderHandoffCoordinator({
  leaseStore,
  providers: [fakeProvider],
  ownerId: "external_handoff_worker",
  leaseTtlMs: 120_000
});
const handoff = await coordinator.run(summaries);
const externalLeases = await leaseStore.listLeases();
const activeExternalLeases = await leaseStore.listActiveLeases(new Date());
const terminalJob = handoff.jobs.find((job) => job.jobId.endsWith("301"));
const activeJob = handoff.jobs.find((job) => job.jobId.endsWith("302"));
const heldJob = handoff.jobs.find((job) => job.jobId.endsWith("303"));
const skippedJob = handoff.jobs.find((job) => job.jobId.endsWith("304"));
const unsafeBaseRejected = checkUnsafeBaseUrlRejected(HttpRenderProviderHandoffLeaseStore);

const publicHandoffJson = JSON.stringify(handoff);
const checks = [
  check("schema_version", handoff.schemaVersion === "cinejelly.render-provider-handoff.v1"),
  check("warns_for_active_or_held_work", handoff.status === "warn"),
  check("external_acquire_calls_used", fakeService.requests.filter((item) => item.path.endsWith("/acquire")).length === 3),
  check("external_release_called_for_terminal", fakeService.requests.some((item) => item.path.endsWith("/release") && item.jobId.endsWith("301"))),
  check("external_heartbeat_called_for_active", fakeService.requests.some((item) => item.path.endsWith("/heartbeat") && item.jobId.endsWith("302"))),
  check("external_bearer_header_sent", fakeService.requests.every((item) => item.hasBearerAuth)),
  check("terminal_job_released", terminalJob?.action === "close_terminal_succeeded" && terminalJob.leaseRetained === false && terminalJob.leaseReleased === true),
  check("active_job_retains_external_lease", activeJob?.action === "continue_polling" && activeJob.leaseRetained === true && activeJob.leaseReleased === false),
  check("active_job_external_heartbeat_recorded", activeJob?.leaseHeartbeatStatus === "recorded" && Boolean(activeJob.leaseHeartbeatAt)),
  check("external_heartbeat_count_recorded", handoff.summary.heartbeatRecordedCount === 1),
  check("held_job_not_stolen", heldJob?.action === "lease_unavailable" && heldJob.leaseStatus === "held_by_other"),
  check("missing_checkpoint_skipped", skippedJob?.action === "skip_no_checkpoint"),
  check("external_list_leases_available", externalLeases.some((lease) => lease.jobId.endsWith("302"))),
  check("external_active_lease_available", activeExternalLeases.some((lease) => lease.jobId.endsWith("302"))),
  check("external_active_lease_renewed", activeExternalLeases.some((lease) => lease.jobId.endsWith("302") && lease.renewedAt instanceof Date)),
  check("unsafe_base_url_rejected", unsafeBaseRejected),
  check("does_not_claim_distributed_resume", handoff.releaseGateSummary.canClaimDistributedResume === false),
  check("external_owner_id_not_serialized", !publicHandoffJson.includes("external_handoff_worker") && !publicHandoffJson.includes("other_external_worker")),
  check("external_token_not_serialized", !publicHandoffJson.includes(externalLeaseToken)),
  check("raw_provider_payload_not_serialized", !publicHandoffJson.includes("raw-external-lease-provider-payload")),
  check("output_urls_not_serialized", !publicHandoffJson.includes("cdn.example.com/external-lease.mp4"))
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
    leasePath: `external:${externalLeaseBaseUrl}${externalLeasePath}`,
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

function createFakeExternalLeaseService() {
  const serviceNow = new Date();
  const leases = new Map();
  const requests = [];
  const heldLease = makeLease(
    "render_job_00000000-0000-4000-8000-000000000303",
    "other_external_worker",
    serviceNow,
    120_000
  );
  leases.set(heldLease.jobId, heldLease);

  async function fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers ?? {});
    const body = init.body ? JSON.parse(String(init.body)) : {};
    requests.push({
      path: url.pathname,
      method,
      jobId: typeof body.jobId === "string" ? body.jobId : "",
      hasBearerAuth: headers.get("authorization") === `Bearer ${externalLeaseToken}`
    });
    if (!url.href.startsWith(`${externalLeaseBaseUrl}${externalLeasePath}`)) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (method === "POST" && url.pathname.endsWith("/acquire")) {
      const jobId = String(body.jobId);
      const ownerId = String(body.ownerId);
      const ttlMs = Number(body.ttlMs);
      const now = body.now ? new Date(String(body.now)) : new Date();
      const active = activeLeaseFor(leases, jobId, now);
      if (active && active.ownerId !== ownerId) {
        return jsonResponse({
          status: "held_by_other",
          heldBy: {
            expiresAt: active.expiresAt
          }
        });
      }
      if (active) {
        active.renewedAt = now.toISOString();
        active.expiresAt = new Date(now.getTime() + ttlMs).toISOString();
        return jsonResponse({
          status: "renewed",
          lease: active
        });
      }
      const lease = makeLease(jobId, ownerId, now, ttlMs);
      leases.set(jobId, lease);
      return jsonResponse({
        status: "acquired",
        lease
      });
    }
    if (method === "POST" && url.pathname.endsWith("/release")) {
      const jobId = String(body.jobId);
      const ownerId = String(body.ownerId);
      const leaseId = typeof body.leaseId === "string" ? body.leaseId : undefined;
      const now = body.now ? new Date(String(body.now)) : new Date();
      const active = activeLeaseFor(leases, jobId, now);
      const released = Boolean(active && active.ownerId === ownerId && (!leaseId || active.leaseId === leaseId));
      if (active && released) {
        active.releasedAt = now.toISOString();
      }
      return jsonResponse({ released });
    }
    if (method === "POST" && url.pathname.endsWith("/heartbeat")) {
      const jobId = String(body.jobId);
      const ownerId = String(body.ownerId);
      const leaseId = String(body.leaseId);
      const ttlMs = Number(body.ttlMs);
      const now = body.now ? new Date(String(body.now)) : new Date();
      const active = activeLeaseFor(leases, jobId, now);
      if (!active || active.leaseId !== leaseId) {
        return jsonResponse({
          status: active && active.ownerId !== ownerId ? "not_owner" : "lease_not_found",
          ...(active ? { expiresAt: active.expiresAt } : {})
        });
      }
      if (active.ownerId !== ownerId) {
        return jsonResponse({
          status: "not_owner",
          expiresAt: active.expiresAt
        });
      }
      active.renewedAt = now.toISOString();
      active.expiresAt = new Date(now.getTime() + ttlMs).toISOString();
      return jsonResponse({
        status: "recorded",
        lease: active,
        heartbeatAt: now.toISOString()
      });
    }
    if (method === "GET" && url.pathname.endsWith("/leases")) {
      return jsonResponse({ leases: [...leases.values()] });
    }
    if (method === "GET" && url.pathname.endsWith("/active")) {
      const now = url.searchParams.get("now") ? new Date(String(url.searchParams.get("now"))) : new Date();
      return jsonResponse({
        leases: [...leases.values()].filter((lease) => !lease.releasedAt && new Date(lease.expiresAt).getTime() > now.getTime())
      });
    }
    return jsonResponse({ error: "not_found" }, 404);
  }

  return { fetch, requests };
}

function makeLease(jobId, ownerId, now, ttlMs) {
  return {
    jobId,
    ownerId,
    leaseId: `external_lease_${jobId.slice(-3)}`,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString()
  };
}

function activeLeaseFor(leases, jobId, now) {
  const lease = leases.get(jobId);
  if (!lease || lease.releasedAt || new Date(lease.expiresAt).getTime() <= now.getTime()) {
    return undefined;
  }
  return lease;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function checkUnsafeBaseUrlRejected(StoreClass) {
  try {
    new StoreClass({
      baseUrl: "http://lease.example.test",
      fetchImpl: async () => jsonResponse({})
    });
    return false;
  } catch {
    return true;
  }
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
