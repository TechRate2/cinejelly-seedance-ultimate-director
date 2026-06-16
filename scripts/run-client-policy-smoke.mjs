import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiAuthGuard, hashApiKey } from "../dist/api/api-auth.js";
import { ApiClientPolicyGate, ApiClientPolicyError } from "../dist/api/api-client-policy.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestWithBearer(token) {
  return {
    headers: { authorization: `Bearer ${token}` },
    socket: { remoteAddress: "127.0.0.1" }
  };
}

const clientKey = "cj_test_client_key_for_quota_smoke_0001";
const tmp = mkdtempSync(join(tmpdir(), "cinejelly-client-policy-"));
const usageLedgerPath = join(tmp, "usage-ledger.jsonl");

try {
  const gate = new ApiClientPolicyGate({
    requireClientPolicyForRender: true,
    usageLedgerPath,
    policies: [
      {
        clientId: "client-a",
        keySha256: hashApiKey(clientKey),
        enabled: true,
        monthlyRequestLimit: 2,
        monthlyReservedCostUsdLimit: 4,
        maxReservedCostUsdPerRequest: 3,
        defaultReservedCostUsdPerRequest: 1.5,
        maxDurationTargetSeconds: 60,
        allowedTiers: ["fast"],
        allowedQualityModes: ["economy", "standard"]
      }
    ]
  });
  const auth = new ApiAuthGuard({ clientKeys: gate.authClientKeys() });
  const decision = auth.authorize(requestWithBearer(clientKey), "/v1/render-jobs");
  assert(decision.allowed, "client key should authorize");
  assert(decision.principal?.kind === "client", "client key should create a client principal");
  assert(decision.principal?.clientId === "client-a", "client principal should preserve clientId");

  const request = {
    userInput: "Create a short no-spend policy smoke request.",
    settings: {
      tier: "fast",
      resolution: "480p",
      qualityMode: "standard",
      ratio: "16:9",
      durationTargetSeconds: 30,
      audioMode: "none",
      watermark: false,
      returnLastFrame: false,
      maxCostUsd: 2
    }
  };

  const first = gate.reserveRender({
    principal: decision.principal,
    request,
    requestId: "req_policy_smoke_1",
    channel: "async"
  });
  assert(first?.reservedCostUsd === 2, "first reservation should use request maxCostUsd");

  const second = gate.reserveRender({
    principal: decision.principal,
    request: {
      userInput: request.userInput,
      settings: {
        ...request.settings,
        maxCostUsd: undefined
      }
    },
    requestId: "req_policy_smoke_2",
    channel: "sync"
  });
  assert(second?.reservedCostUsd === 1.5, "second reservation should use defaultReservedCostUsdPerRequest");

  let quotaBlocked = false;
  try {
    gate.reserveRender({
      principal: decision.principal,
      request,
      requestId: "req_policy_smoke_3",
      channel: "async"
    });
  } catch (error) {
    quotaBlocked = error instanceof ApiClientPolicyError && error.statusCode === 429;
  }
  assert(quotaBlocked, "third reservation should hit monthly request quota");

  const ledgerText = readFileSync(usageLedgerPath, "utf8");
  assert(ledgerText.includes("client-a"), "usage ledger should include clientId");
  assert(!ledgerText.includes(clientKey), "usage ledger must not include raw client API key");

  console.log(JSON.stringify({
    schemaVersion: "cinejelly.client-policy-smoke.v1",
    status: "pass",
    clientId: "client-a",
    reservations: 2,
    quotaBlocked,
    usageLedgerWritten: true
  }, null, 2));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
