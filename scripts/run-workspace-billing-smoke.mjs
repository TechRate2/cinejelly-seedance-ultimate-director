#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const compile = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: resolve("."),
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const {
  ApiWorkspaceBillingError,
  ApiWorkspaceBillingGate,
  parseApiWorkspacePoliciesJson
} = await import("../dist/api/workspace-billing-policy.js");
const { startServer } = await import("../dist/api/server.js");

const tmp = mkdtempSync(join(tmpdir(), "cinejelly-workspace-billing-"));
const usageLedgerPath = join(tmp, "workspace-usage-ledger.jsonl");

try {
  const workspacePolicy = {
    workspaceId: "workspace-agency-a",
    enabled: true,
    displayName: "Agency A",
    planId: "agency-growth",
    clientIds: ["client-a"],
    monthlyRequestLimit: 2,
    monthlyReservedCostUsdLimit: 4,
    maxReservedCostUsdPerRequest: 3,
    defaultReservedCostUsdPerRequest: 1.5,
    creditBalanceUsd: 3.5,
    projects: [
      {
        projectId: "project-product-launch",
        enabled: true,
        displayName: "Product Launch",
        monthlyRequestLimit: 2,
        monthlyReservedCostUsdLimit: 3.5,
        maxReservedCostUsdPerRequest: 2.5,
        defaultReservedCostUsdPerRequest: 1.25
      }
    ]
  };
  const parsed = parseApiWorkspacePoliciesJson(JSON.stringify([workspacePolicy]));
  const gate = new ApiWorkspaceBillingGate({
    requireWorkspaceForRender: true,
    usageLedgerPath,
    workspaces: parsed
  });
  const principal = { kind: "client", clientId: "client-a" };

  const first = gate.reserveRender({
    principal,
    request: request({ maxCostUsd: 2 }),
    requestId: "req_workspace_billing_001",
    channel: "async"
  });
  const second = gate.reserveRender({
    principal,
    request: request({ maxCostUsd: undefined }),
    requestId: "req_workspace_billing_002",
    channel: "sync"
  });

  const quotaBlocked = catchesWorkspaceError(() => gate.reserveRender({
    principal,
    request: request({ maxCostUsd: 0.1 }),
    requestId: "req_workspace_billing_003",
    channel: "async"
  }), 429);
  const wrongClientBlocked = catchesWorkspaceError(() => gate.assertRenderAllowed({
    principal: { kind: "client", clientId: "client-b" },
    request: request({ maxCostUsd: 0.1 }),
    requestId: "req_workspace_billing_wrong_client",
    channel: "async"
  }), 403);
  const wrongProjectBlocked = catchesWorkspaceError(() => gate.assertRenderAllowed({
    principal,
    request: request({ maxCostUsd: 0.1, projectId: "project-missing" }),
    requestId: "req_workspace_billing_wrong_project",
    channel: "async"
  }), 403);
  const perProjectCostBlocked = catchesWorkspaceError(() => gate.assertRenderAllowed({
    principal,
    request: request({ maxCostUsd: 2.75 }),
    requestId: "req_workspace_billing_project_cost",
    channel: "async"
  }), 403);

  const reloadedGate = new ApiWorkspaceBillingGate({
    requireWorkspaceForRender: true,
    usageLedgerPath,
    workspaces: parsed
  });
  const reloadedSummary = reloadedGate.summary();
  const apiSmoke = await runApiSmoke(workspacePolicy, tmp);

  const ledgerText = existsSync(usageLedgerPath) ? readFileSync(usageLedgerPath, "utf8") : "";
  const checks = [
    check("first_reservation_uses_request_cost", first?.reservedCostUsd === 2),
    check("second_reservation_uses_project_default_cost", second?.reservedCostUsd === 1.25),
    check("workspace_credit_balance_after_reservations", second?.creditBalanceUsdAfterReservation === 0.25),
    check("workspace_monthly_quota_blocks_third", quotaBlocked),
    check("workspace_client_membership_blocks_wrong_client", wrongClientBlocked),
    check("workspace_project_policy_blocks_unknown_project", wrongProjectBlocked),
    check("project_per_request_cost_blocks_excess", perProjectCostBlocked),
    check("usage_ledger_written", ledgerText.includes("cinejelly.workspace-usage-ledger.v1")),
    check("usage_ledger_has_workspace_and_project", ledgerText.includes("workspace-agency-a") && ledgerText.includes("project-product-launch")),
    check("usage_ledger_excludes_user_prompt", !ledgerText.includes("Create a workspace billing smoke")),
    check("usage_ledger_reload_restores_usage", reloadedSummary.workspaces?.[0]?.usage?.requestCount === 2),
    check("api_missing_workspace_rejected", apiSmoke.missingWorkspaceStatusCode === 400),
    check("api_pending_review_accepts_workspace_project", apiSmoke.pendingStatusCode === 202 && apiSmoke.pendingStatus === "paused_for_review"),
    check("api_pending_review_does_not_reserve_workspace", apiSmoke.pendingHasWorkspaceReservation === false)
  ];

  const report = {
    schemaVersion: "cinejelly.workspace-billing-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((item) => item.status === "pass") ? "pass" : "fail",
    noExternalNetworkCallsMade: true,
    localHttpCallsMade: true,
    providerCallsMade: 0,
    checkedInputs: {
      workspaceId: workspacePolicy.workspaceId,
      projectId: workspacePolicy.projects[0].projectId,
      usageLedgerPath
    },
    reservations: {
      first,
      second
    },
    apiSmoke,
    checks,
    releaseGateSummary: {
      canUseAsNoSpendBackendEvidence: checks.every((item) => item.status === "pass"),
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Workspace billing smoke proves quota/ledger semantics only; real billing provider, terms, refunds, support, HTTPS deployment, and operator attestations are still required."
    }
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.status === "pass" ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function request({ maxCostUsd, projectId = "project-product-launch" }) {
  return {
    userInput: "Create a workspace billing smoke product video.",
    metadata: {
      workspaceId: "workspace-agency-a",
      projectId
    },
    settings: {
      tier: "fast",
      resolution: "480p",
      qualityMode: "economy",
      ratio: "16:9",
      durationTargetSeconds: 30,
      audioMode: "none",
      watermark: false,
      returnLastFrame: false,
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {})
    }
  };
}

async function runApiSmoke(workspacePolicy, tmp) {
  const previousEnv = {
    CINEJELLY_DISABLE_API_AUTH: process.env.CINEJELLY_DISABLE_API_AUTH,
    CINEJELLY_DISABLE_API_RATE_LIMIT: process.env.CINEJELLY_DISABLE_API_RATE_LIMIT,
    CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER: process.env.CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER,
    CINEJELLY_WORKSPACES_JSON: process.env.CINEJELLY_WORKSPACES_JSON,
    CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH: process.env.CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH,
    CINEJELLY_OUTPUT_DIR: process.env.CINEJELLY_OUTPUT_DIR
  };
  const apiLedgerPath = join(tmp, "api-workspace-usage-ledger.jsonl");
  process.env.CINEJELLY_DISABLE_API_AUTH = "true";
  process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
  process.env.CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER = "true";
  process.env.CINEJELLY_WORKSPACES_JSON = JSON.stringify([workspacePolicy]);
  process.env.CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH = apiLedgerPath;
  process.env.CINEJELLY_OUTPUT_DIR = join(tmp, "api-output");

  const server = startServer(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const missingWorkspace = await postJson(`${baseUrl}/v1/render-jobs`, {
      userInput: "Missing workspace should fail before job creation.",
      reviewApprovalCheckpoints: [
        { surface: "scene", label: "Scene plan approved", subjectId: "scene_001" }
      ]
    });
    const pending = await postJson(`${baseUrl}/v1/render-jobs`, {
      userInput: "Workspace pending review should not reserve spend.",
      metadata: {
        workspaceId: workspacePolicy.workspaceId,
        projectId: workspacePolicy.projects[0].projectId
      },
      reviewApprovalCheckpoints: [
        { surface: "scene", label: "Scene plan approved", subjectId: "scene_001" }
      ]
    });
    return {
      missingWorkspaceStatusCode: missingWorkspace.statusCode,
      missingWorkspaceError: missingWorkspace.body.error,
      pendingStatusCode: pending.statusCode,
      pendingStatus: pending.body.status,
      pendingHasWorkspaceReservation: Object.hasOwn(pending.body, "workspaceBillingReservation"),
      apiLedgerWritten: existsSync(apiLedgerPath)
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
    restoreEnv(previousEnv);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

function catchesWorkspaceError(fn, statusCode) {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof ApiWorkspaceBillingError && error.statusCode === statusCode;
  }
}

function check(name, pass) {
  return { name, status: pass ? "pass" : "fail" };
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
