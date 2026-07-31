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
const {
  FileRenderProviderHandoffActionLedger
} = await import("../dist/api/render-provider-handoff-action-ledger.js");

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json"
);
const workDir = resolve("assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-smoke");
const leasePath = resolve(workDir, "leases.json");
const ledgerPath = resolve(workDir, "actions.json");
const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo Redis task ownership and resume safety pattern",
  "vericontext/vibeframe deterministic status/report refresh discipline",
  "Atlas Cloud prediction status evidence"
];

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const fakeProvider = {
  name: "atlascloud",
  async getPrediction(predictionId) {
    const statusById = {
      pred_action_terminal: "succeeded",
      pred_action_active: "running",
      pred_action_error: "failed"
    };
    const status = statusById[predictionId];
    if (!status) {
      throw new Error(`Unknown fake prediction ${predictionId}.`);
    }
    return {
      provider: "atlascloud",
      predictionId,
      modelId: "fake/seedance-action-ledger-smoke",
      status,
      outputUrls: status === "succeeded" ? ["https://cdn.example.com/action-ledger.mp4"] : [],
      errorMessage: status === "failed" ? "redacted fake failure" : undefined,
      raw: {
        secret: "raw-action-ledger-provider-payload-must-not-be-serialized",
        localPath: "C:\\Users\\Admin\\secret\\action-ledger-provider.json"
      },
      submittedAt: new Date("2026-06-17T00:00:00.000Z"),
      ...(status !== "running" ? { completedAt: new Date("2026-06-17T00:01:00.000Z") } : {})
    };
  }
};

const summaries = [
  checkpointJob("render_job_00000000-0000-4000-8000-000000000501", "pred_action_terminal"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000502", "pred_action_active"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000503", "pred_action_error"),
  checkpointJob("render_job_00000000-0000-4000-8000-000000000504", "pred_action_manual_audit"),
  {
    jobId: "render_job_00000000-0000-4000-8000-000000000505",
    status: "failed",
    retentionSource: "history_store",
    detailRetention: "compact_restored"
  }
];

const leaseStore = new FileRenderProviderHandoffLeaseStore({ leasePath });
const coordinator = new RenderProviderHandoffCoordinator({
  leaseStore,
  providers: [fakeProvider],
  ownerId: "action_ledger_worker_a",
  leaseTtlMs: 120_000
});
const handoff = await coordinator.run(summaries);
const ledger = new FileRenderProviderHandoffActionLedger({ ledgerPath });
const firstApply = await ledger.applyHandoffReport(handoff, new Date("2026-06-17T00:02:00.000Z"));
const secondApply = await ledger.applyHandoffReport(handoff, new Date("2026-06-17T00:03:00.000Z"));
const fakeExecutionCalls = [];
const fakeExecutor = {
  async executeAction(record) {
    fakeExecutionCalls.push({
      actionId: record.actionId,
      action: record.action,
      predictionIds: record.predictionIds
    });
    if (record.action === "resume_polling") {
      await fakeProvider.getPrediction(record.predictionIds[0]);
      return {
        status: "executed",
        providerCallMade: false,
        message: "Fake resume polling callback refreshed one active prediction."
      };
    }
    if (record.action.startsWith("close_terminal_")) {
      return {
        status: "executed",
        providerCallMade: false,
        message: "Fake terminal close callback retained provider closeout evidence."
      };
    }
    return {
      status: "executed",
      providerCallMade: false,
      message: "Fake manual-audit callback retained operator handoff evidence."
    };
  }
};
const firstExecution = await ledger.executeRecordedActions(fakeExecutor, new Date("2026-06-17T00:04:00.000Z"));
const secondExecution = await ledger.executeRecordedActions(fakeExecutor, new Date("2026-06-17T00:05:00.000Z"));
const persistedLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
const reloadedRecords = await new FileRenderProviderHandoffActionLedger({ ledgerPath }).listRecords();
const publicPayload = JSON.stringify({ handoff, firstApply, secondApply, firstExecution, secondExecution, persistedLedger });
const firstActionIds = new Set(firstApply.decisions.filter((item) => item.actionId).map((item) => item.actionId));
const replayedActionIds = secondApply.decisions.filter((item) => item.actionId).map((item) => item.actionId);
const checks = [
  check("handoff_report_warns_for_active_or_failed_work", handoff.status === "warn" || handoff.status === "fail"),
  check("first_apply_records_four_actions", firstApply.summary.recordedActionCount === 4),
  check("first_apply_skips_missing_checkpoint", firstApply.summary.skippedActionCount === 1),
  check("second_apply_replays_four_actions", secondApply.summary.replayedActionCount === 4),
  check("second_apply_records_no_new_actions", secondApply.summary.recordedActionCount === 0),
  check("persisted_action_count_stable", persistedLedger.actions?.length === 4 && reloadedRecords.length === 4),
  check("stable_action_ids_reused", replayedActionIds.length === 4 && replayedActionIds.every((actionId) => firstActionIds.has(actionId))),
  check("terminal_close_action_recorded", firstApply.decisions.some((item) => item.action === "close_terminal_succeeded" && item.status === "recorded")),
  check("resume_polling_action_recorded", firstApply.decisions.some((item) => item.action === "resume_polling" && item.status === "recorded")),
  check("manual_audit_action_recorded", firstApply.decisions.some((item) => item.action === "manual_audit_required" && item.status === "recorded")),
  check("first_execution_executes_four_actions", firstExecution.summary.executedActionCount === 4 && firstExecution.summary.failedActionCount === 0),
  check("second_execution_reuses_four_persisted_executions", secondExecution.summary.alreadyExecutedActionCount === 4 && fakeExecutionCalls.length === 4),
  check("execution_persistence_survives_reload", reloadedRecords.filter((item) => item.execution?.status === "executed").length === 4),
  check("execution_does_not_claim_distributed_resume", firstExecution.releaseGateSummary.canClaimDistributedResume === false && secondExecution.releaseGateSummary.canClaimDistributedResume === false),
  check("execution_reports_no_real_provider_calls", firstExecution.summary.providerCallMadeCount === 0 && secondExecution.summary.providerCallMadeCount === 0),
  check("idempotency_keys_are_stable", secondApply.decisions.every((item) => item.status === "skipped" || firstApply.decisions.some((first) => first.idempotencyKey === item.idempotencyKey))),
  check("ledger_does_not_claim_distributed_resume", firstApply.releaseGateSummary.canClaimDistributedResume === false && secondApply.releaseGateSummary.canClaimDistributedResume === false),
  check("raw_provider_payload_not_serialized", !publicPayload.includes("raw-action-ledger-provider-payload")),
  check("local_provider_path_not_serialized", !publicPayload.includes("C:\\Users\\Admin\\secret")),
  check("output_urls_not_serialized", !publicPayload.includes("cdn.example.com/action-ledger.mp4"))
];

const report = {
  schemaVersion: "cinejelly.render-provider-handoff-action-ledger-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: toRepoRelative(outputPath),
    leasePath: toRepoRelative(leasePath),
    ledgerPath: toRepoRelative(ledgerPath),
    fakeProvider: true,
    jobCount: summaries.length,
    providerCount: 1
  },
  summary: {
    firstApplyStatus: firstApply.status,
    secondApplyStatus: secondApply.status,
    firstRecordedActionCount: firstApply.summary.recordedActionCount,
    secondReplayedActionCount: secondApply.summary.replayedActionCount,
    persistedActionCount: persistedLedger.actions?.length ?? 0,
    firstExecutedActionCount: firstExecution.summary.executedActionCount,
    secondAlreadyExecutedActionCount: secondExecution.summary.alreadyExecutedActionCount,
    persistedExecutedActionCount: reloadedRecords.filter((item) => item.execution?.status === "executed").length,
    realProviderCallCount: firstExecution.summary.providerCallMadeCount + secondExecution.summary.providerCallMadeCount,
    canClaimDistributedResume: false
  },
  firstApply: publicApply(firstApply),
  secondApply: publicApply(secondApply),
  firstExecution: publicExecution(firstExecution),
  secondExecution: publicExecution(secondExecution),
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

function publicApply(applyResult) {
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

function publicExecution(executionResult) {
  return {
    schemaVersion: executionResult.schemaVersion,
    generatedAt: executionResult.generatedAt.toISOString(),
    status: executionResult.status,
    summary: executionResult.summary,
    decisions: executionResult.decisions.map((item) => ({
      jobId: item.jobId,
      actionId: item.actionId,
      status: item.status,
      action: item.action,
      predictionIds: item.predictionIds,
      message: item.message,
      providerCallMade: item.providerCallMade
    })),
    releaseGateSummary: executionResult.releaseGateSummary
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
