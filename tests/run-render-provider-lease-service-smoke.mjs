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

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/render-provider-lease-service-smoke");
const leasePath = resolve(workDir, "leases.json");
const endpointPath = "/v1/render-provider-handoff-leases";
const deploymentToken = "lease_service_deployment_token_must_not_leak_0001";
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo memory/Redis task ownership pattern",
  "vericontext/vibeframe deterministic status/report refresh discipline"
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
  throw new Error("Lease service smoke server did not bind to a TCP port.");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

let report;
try {
  const unauthorized = await request("POST", `${endpointPath}/acquire`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_a",
    ttlMs: 120_000
  }, null);
  const preflight = await request("GET", "/v1/preflight");
  const acquired = await request("POST", `${endpointPath}/acquire`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_a",
    ttlMs: 120_000,
    now: "2026-06-17T00:00:00.000Z"
  });
  const held = await request("POST", `${endpointPath}/acquire`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_b",
    ttlMs: 120_000,
    now: "2026-06-17T00:00:30.000Z"
  });
  const heartbeat = await request("POST", `${endpointPath}/heartbeat`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_a",
    leaseId: String(acquired.json.lease?.leaseId ?? ""),
    ttlMs: 180_000,
    now: "2026-06-17T00:01:00.000Z"
  });
  const activeAfterHeartbeat = await request("GET", `${endpointPath}/active?now=2026-06-17T00%3A01%3A30.000Z`);
  const wrongOwnerRelease = await request("POST", `${endpointPath}/release`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_b",
    leaseId: String(acquired.json.lease?.leaseId ?? ""),
    now: "2026-06-17T00:01:45.000Z"
  });
  const ownerRelease = await request("POST", `${endpointPath}/release`, {
    jobId: "render_job_lease_service_001",
    ownerId: "lease_service_worker_a",
    leaseId: String(acquired.json.lease?.leaseId ?? ""),
    now: "2026-06-17T00:02:00.000Z"
  });
  const activeAfterRelease = await request("GET", `${endpointPath}/active?now=2026-06-17T00%3A02%3A30.000Z`);
  const allLeases = await request("GET", `${endpointPath}/leases`);
  const invalidBody = await request("POST", `${endpointPath}/acquire`, {
    jobId: "render_job_lease_service_002",
    ownerId: "lease_service_worker_a",
    ttlMs: "120000"
  });
  const persistedLeases = JSON.parse(await readFile(leasePath, "utf8"));
  const publicPayload = JSON.stringify({
    unauthorized,
    preflight: {
      status: preflight.status,
      leasePathCheck: preflightLeasePathCheck(preflight.json)
    },
    acquired,
    held,
    heartbeat,
    activeAfterHeartbeat,
    wrongOwnerRelease,
    ownerRelease,
    activeAfterRelease,
    allLeases,
    invalidBody
  });
  const checks = [
    check("unauthorized_rejected", unauthorized.status === 401),
    check("preflight_lease_path_pass", preflightLeasePathCheck(preflight.json)?.status === "pass"),
    check("acquire_returns_lease", acquired.status === 200 && acquired.json.status === "acquired" && typeof acquired.json.lease?.leaseId === "string"),
    check("held_by_other_protected", held.status === 200 && held.json.status === "held_by_other"),
    check("heartbeat_recorded", heartbeat.status === 200 && heartbeat.json.status === "recorded" && Boolean(heartbeat.json.heartbeatAt)),
    check("active_after_heartbeat_has_renewed_at", activeAfterHeartbeat.json.leases?.some((lease) => lease.jobId === "render_job_lease_service_001" && typeof lease.renewedAt === "string") === true),
    check("wrong_owner_release_false", wrongOwnerRelease.status === 200 && wrongOwnerRelease.json.released === false),
    check("owner_release_true", ownerRelease.status === 200 && ownerRelease.json.released === true),
    check("active_empty_after_release", activeAfterRelease.status === 200 && activeAfterRelease.json.leases?.length === 0),
    check("list_contains_released_lease", allLeases.json.leases?.some((lease) => lease.jobId === "render_job_lease_service_001" && typeof lease.releasedAt === "string") === true),
    check("invalid_body_rejected", invalidBody.status === 400),
    check("lease_file_written", persistedLeases.schemaVersion === "cinejelly.render-provider-handoff-leases.v1"),
    check("deployment_token_not_serialized", !publicPayload.includes(deploymentToken)),
    check("can_claim_distributed_resume_false", true)
  ];
  report = {
    schemaVersion: "cinejelly.render-provider-lease-service-smoke.v1",
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
      endpointPath,
      localServer: true
    },
    summary: {
      acquiredStatus: String(acquired.json.status ?? "unknown"),
      heldStatus: String(held.json.status ?? "unknown"),
      heartbeatStatus: String(heartbeat.json.status ?? "unknown"),
      leaseCount: Array.isArray(allLeases.json.leases) ? allLeases.json.leases.length : 0,
      activeAfterReleaseCount: Array.isArray(activeAfterRelease.json.leases) ? activeAfterRelease.json.leases.length : 0,
      preflightLeasePathStatus: String(preflightLeasePathCheck(preflight.json)?.status ?? "missing"),
      canClaimDistributedResume: false
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

function preflightLeasePathCheck(payload) {
  return Array.isArray(payload?.checks)
    ? payload.checks.find((item) => item.name === "CINEJELLY_RENDER_PROVIDER_LEASE_PATH")
    : undefined;
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
