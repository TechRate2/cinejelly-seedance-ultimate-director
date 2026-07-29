#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/backend-system-suite-report.json",
  timeoutMs: 180_000,
  tailBytes: 6_000
};

const suiteCommands = [
  command("build", ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { reportPath: undefined }),
  command("api_response_redaction", ["tests/run-api-response-redaction-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/api-response-redaction-smoke-report.json"
  }),
  command("private_source_lineage_boundary", ["scripts/audit-private-source-lineage-boundary.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/private-source-lineage-boundary-audit-report.json"
  }),
  command("deployment_package", ["scripts/validate-deployment-package.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/deployment-package-validation-report.json"
  }),
  command("source_structure", ["scripts/audit-source-structure.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/source-structure-audit-report.json"
  }),
  command("render_request_contract", ["tests/run-render-request-contract-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/render-request-contract-smoke-report.json"
  }),
  command("short_prompt_corpus", ["scripts/build-short-prompt-pattern-corpus.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-prompt-pattern-corpus-report.json"
  }),
  command("short_pipeline", ["tests/run-short-pipeline-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-pipeline-smoke-report.json"
  }),
  command("short_viral_intelligence", ["tests/run-short-viral-intelligence-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-viral-intelligence-smoke-report.json"
  }),
  command("short_agent_graph", ["tests/run-short-agent-graph-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-agent-graph-smoke-report.json"
  }),
  command("short_mvp_ui_contract", ["tests/run-short-mvp-ui-contract-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json",
    localHttpCallsMade: true
  }),
  command("short_backend_integration", ["scripts/audit-short-backend-integration.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/short-backend-integration-audit-report.json"
  }),
  command("long_form_timeline", ["tests/run-long-form-timeline-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/long-form-timeline-smoke-report.json"
  }),
  command("long_form_readiness", ["tests/run-long-form-readiness-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/long-form-readiness-smoke-report.json"
  }),
  command("video_render_strategy", ["tests/run-video-render-strategy-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/video-render-strategy-smoke-report.json"
  }),
  command("last_frame_chaining", ["tests/run-last-frame-chaining-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/last-frame-chaining-smoke-report.json"
  }),
  command("source_video_auto_analysis_smoke", ["tests/run-source-video-auto-analysis-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json"
  }),
  command("remote_stock_adapter_smoke", ["tests/run-remote-stock-adapter-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json"
  }),
  command("material_source_scoring", ["tests/run-material-source-scoring-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json"
  }),
  command("generated_audio_mapping", ["tests/run-generated-audio-mapping-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json"
  }),
  command("generated_audio_polling_resilience", ["tests/run-generated-audio-polling-resilience-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/generated-audio-polling-resilience-smoke-report.json"
  }),
  command("transition_audio_continuity", ["tests/run-transition-audio-continuity-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/transition-audio-continuity-smoke-report.json"
  }),
  command("render_scheduler", ["tests/run-render-scheduler-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json"
  }),
  command("production_graph_resume_queue_service", ["tests/run-production-graph-resume-queue-service-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json",
    localHttpCallsMade: true
  }),
  command("render_provider_graph_resume_worker", ["tests/run-render-provider-graph-resume-worker-smoke.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json",
    localHttpCallsMade: true
  }),
  command("backend_system_readiness", ["scripts/audit-backend-system-readiness.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json"
  }),
  command("report_contracts", ["scripts/validate-report-contracts.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json"
  })
];

function command(id, args, options = {}) {
  return {
    id,
    args,
    reportPath: options.reportPath,
    expectedExitCodes: options.expectedExitCodes ?? [0],
    localHttpCallsMade: options.localHttpCallsMade === true
  };
}

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number(readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--tail-bytes") {
      options.tailBytes = Number(readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Run CineJelly's local no-spend backend system validation suite.

Usage:
  npm.cmd run validation:backend-system-suite

Options:
  --output <path>       JSON report path. Default: ${defaults.outputPath}
  --timeout-ms <ms>     Per-command timeout. Default: ${defaults.timeoutMs}
  --tail-bytes <bytes>  Captured stdout/stderr tail bytes. Default: ${defaults.tailBytes}
  --no-output           Print only; do not write the report.

This suite performs no Atlas model calls, no remote stock calls, no deployment calls, and no paid render calls.
It may start temporary localhost API servers for local smoke tests.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const startedAt = new Date();
  const runs = [];
  for (const item of suiteCommands) {
    const run = runCommand(item, options);
    runs.push(run);
  }
  const finishedAt = new Date();
  const backendReadiness = summarizeJsonReport("assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json");
  const reportContracts = summarizeJsonReport("assets/output_deliverables/business-readiness/report-contract-validation-report.json");
  const failedRuns = runs.filter((item) => item.status === "fail");
  const report = {
    schemaVersion: "cinejelly.backend-system-suite.v1",
    generatedAt: finishedAt.toISOString(),
    status: failedRuns.length === 0 ? "pass" : "fail",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    localHttpCallsMade: runs.some((item) => item.localHttpCallsMade),
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      commandCount: suiteCommands.length,
      timeoutMs: options.timeoutMs,
      tailBytes: options.tailBytes
    },
    summary: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      commandCount: runs.length,
      passedCommandCount: runs.filter((item) => item.status === "pass").length,
      failedCommandCount: failedRuns.length,
      backendReadinessStatus: backendReadiness.status,
      backendReadinessCodeIssueCount: numberOrZero(backendReadiness.value?.blockerSummary?.codeIssueCount),
      backendReadinessExternalEvidenceBlockerCount: numberOrZero(backendReadiness.value?.blockerSummary?.externalEvidenceBlockerCount),
      reportContractsStatus: reportContracts.status,
      reportContractsFailedCount: numberOrZero(reportContracts.value?.summary?.failed)
    },
    commands: runs,
    releaseGateSummary: {
      backendSystemSuitePass: failedRuns.length === 0,
      canUseAsNoSpendBackendEvidence: failedRuns.length === 0,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: failedRuns.length === 0
        ? "Backend no-spend suite passed; live paid/provider/operator evidence remains a separate commercial readiness gate."
        : "One or more backend no-spend suite commands failed; fix these before using local backend readiness evidence."
    },
    nextActions: failedRuns.length === 0
      ? [
          "Keep validation:backend-system-suite passing before paid/live validation.",
          "Complete live paid/provider/operator evidence before claiming commercial readiness."
        ]
      : failedRuns.map((item) => `${item.id}: exit ${item.exitCode}; inspect ${item.reportPath ?? "command output"}.`)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 900_000) {
    throw new Error("--timeout-ms must be an integer from 5000 to 900000.");
  }
  if (!Number.isSafeInteger(options.tailBytes) || options.tailBytes < 200 || options.tailBytes > 200_000) {
    throw new Error("--tail-bytes must be an integer from 200 to 200000.");
  }
}

function runCommand(item, options) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, item.args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env }
  });
  const finishedAt = Date.now();
  const exitCode = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const expected = item.expectedExitCodes.includes(exitCode) && !timedOut;
  const reportSummary = item.reportPath ? summarizeJsonReport(item.reportPath) : {};
  return {
    id: item.id,
    command: [process.execPath, ...item.args].join(" "),
    expectedExitCodes: item.expectedExitCodes,
    exitCode,
    status: expected ? "pass" : "fail",
    timedOut,
    durationMs: finishedAt - startedAt,
    reportPath: item.reportPath,
    reportSchemaVersion: reportSummary.schemaVersion,
    reportStatus: reportSummary.status,
    localHttpCallsMade: item.localHttpCallsMade,
    stdoutTail: tail(result.stdout ?? "", options.tailBytes),
    stderrTail: tail(result.stderr ?? "", options.tailBytes)
  };
}

function summarizeJsonReport(path) {
  const value = readJsonIfExists(path);
  if (!value) {
    return { status: "missing" };
  }
  return {
    schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : undefined,
    status: String(value.status ?? value.reportStatus ?? "unknown"),
    value
  };
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tail(value, maxBytes) {
  const text = String(value);
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }
  return `...[truncated]\n${Buffer.from(text, "utf8").subarray(-maxBytes).toString("utf8")}`;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toRepoRelative(path) {
  return resolve(repoRoot, path).replace(repoRoot, "").replace(/^[/\\]/, "").replace(/\\/g, "/");
}

process.exitCode = main();
