import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json",
  markdownOutputPath: "assets/output_deliverables/business-readiness/commercial-launch-doctor.md",
  timeoutMs: 180_000
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    writeMarkdown: true,
    skipLocalSmoke: false
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--markdown-output", "markdownOutputPath"],
    ["--timeout-ms", "timeoutMs"]
  ]);

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
    if (arg === "--no-markdown") {
      options.writeMarkdown = false;
      continue;
    }
    if (arg === "--skip-local-smoke") {
      options.skipLocalSmoke = true;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = key === "timeoutMs" ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
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
  console.log(`Run the no-spend CineJelly commercial launch doctor.

Usage:
  npm.cmd run validation:launch-doctor
  npm.cmd run validation:launch-doctor -- --skip-local-smoke

Options:
  --skip-local-smoke             Skip the slower temporary local API smoke.
  --timeout-ms <ms>              Per-command timeout. Default: ${defaults.timeoutMs}
  --output <path>                JSON report path. Default: ${defaults.outputPath}
  --markdown-output <path>       Markdown report path. Default: ${defaults.markdownOutputPath}
  --no-markdown                  Do not write the Markdown report.
  --no-output                    Print only; do not write JSON.

The doctor performs no Atlas model calls, no paid render, no remote stock calls, and no deployment calls.
It may start a temporary localhost API during local smoke unless --skip-local-smoke is set.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const commandRuns = [];
  for (const command of buildCommands(options)) {
    const run = runCommand(command, options);
    commandRuns.push(run);
  }

  let report = buildReport(options, commandRuns);
  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }

  const reportContracts = runCommand(reportContractCommand(), options);
  const finalCommandRuns = [...commandRuns, reportContracts];
  report = buildReport(options, finalCommandRuns);
  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "ready_for_customer_traffic" ? 0 : report.releaseGateSummary.knownCodeBlockingIssueCount === 0 ? 1 : 2;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (extname(options.markdownOutputPath).toLowerCase() !== ".md") {
    throw new Error("--markdown-output must point to a Markdown file.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 900_000) {
    throw new Error("--timeout-ms must be an integer from 5000 to 900000.");
  }
}

function buildCommands(options) {
  const commands = [
    command("build", ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
      reportPath: undefined,
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("deployment_package", ["scripts/validate-deployment-package.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/deployment-package-validation-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    })
  ];
  if (!options.skipLocalSmoke) {
    commands.push(
      command("local_smoke", ["scripts/run-local-validation-smoke.mjs"], {
        reportPath: "assets/output_deliverables/phase6-validation/local-smoke-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      })
    );
  }
  commands.push(
    command("release_audit", ["scripts/run-release-audit.mjs"], {
      reportPath: "assets/output_deliverables/phase6-validation/release-audit-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("launch_intake", ["--env-file-if-exists=.env", "scripts/validate-commercial-launch-intake.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("live_inputs", ["--env-file-if-exists=.env", "scripts/validate-live-readiness-inputs.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("business_plan", ["--env-file-if-exists=.env", "scripts/plan-business-readiness-validation.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("commercial_inputs", ["scripts/prepare-commercial-launch-inputs.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("completion_audit", ["scripts/summarize-business-completion-audit.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/business-completion-audit-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("business_readiness", ["scripts/run-business-readiness-audit.mjs"], {
      reportPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    })
  );
  return commands;
}

function reportContractCommand() {
  return command("report_contracts", ["scripts/validate-report-contracts.mjs"], {
    reportPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json",
    expectedExitCodes: [0],
    blocksCodeReadiness: true
  });
}

function command(name, args, options) {
  return {
    name,
    executable: process.execPath,
    args,
    reportPath: options.reportPath,
    expectedExitCodes: options.expectedExitCodes,
    blocksCodeReadiness: options.blocksCodeReadiness
  };
}

function runCommand(commandItem, options) {
  const startedAt = new Date();
  const result = spawnSync(commandItem.executable, commandItem.args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 8
  });
  const finishedAt = new Date();
  const exitCode = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  const expectedExit = commandItem.expectedExitCodes.includes(exitCode);
  const reportSummary = commandItem.reportPath ? publicReportSummary(summarizeReport(commandItem.reportPath)) : undefined;
  return {
    name: commandItem.name,
    command: [commandItem.executable, ...commandItem.args].join(" "),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode,
    expectedExit,
    status: expectedExit ? "pass" : "fail",
    blocksCodeReadiness: commandItem.blocksCodeReadiness,
    ...(result.error ? { error: result.error.message } : {}),
    ...(result.signal ? { signal: result.signal } : {}),
    ...(reportSummary ? { report: reportSummary } : {}),
    ...(expectedExit ? {} : { diagnostic: summarizeProcessOutput(result.stderr || result.stdout) })
  };
}

function buildReport(options, commandRuns) {
  const reportSummaries = {
    releaseAudit: summarizeReport("assets/output_deliverables/phase6-validation/release-audit-report.json"),
    businessReadiness: summarizeReport("assets/output_deliverables/phase6-validation/business-readiness-report.json"),
    liveInputs: summarizeReport("assets/output_deliverables/business-readiness/live-readiness-inputs-report.json"),
    businessPlan: summarizeReport("assets/output_deliverables/business-readiness/business-readiness-validation-plan.json"),
    commercialInputs: summarizeReport("assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json"),
    completionAudit: summarizeReport("assets/output_deliverables/business-readiness/business-completion-audit-report.json"),
    reportContracts: summarizeReport("assets/output_deliverables/business-readiness/report-contract-validation-report.json"),
    launchIntake: summarizeReport("assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json")
  };
  const completion = reportSummaries.completionAudit.value;
  const business = reportSummaries.businessReadiness.value;
  const codeBlockingRuns = commandRuns.filter((item) => item.blocksCodeReadiness && item.status !== "pass");
  const knownCodeBlockingIssueCount = Number(completion?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0) + codeBlockingRuns.length;
  const canReleaseToCustomerTraffic = business?.releaseGateSummary?.canReleaseToCustomerTraffic === true;
  const readyForLiveEvidence = completion?.status === "ready_for_live_evidence_sequence";
  const status = statusFor({
    canReleaseToCustomerTraffic,
    readyForLiveEvidence,
    knownCodeBlockingIssueCount
  });
  const readyPaidGates = arrayOfStrings(
    completion?.releaseGateSummary?.readyPaidGates ??
      business?.releaseGateSummary?.readyPaidGates ??
      reportSummaries.liveInputs.value?.releaseGateSummary?.readyPaidGates
  );
  const nextActions = buildNextActions({ completion, business, reportSummaries, codeBlockingRuns });

  return {
    schemaVersion: "cinejelly.commercial-launch-doctor.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      markdownOutputPath: options.writeMarkdown ? toRepoRelative(options.markdownOutputPath) : undefined,
      skipLocalSmoke: options.skipLocalSmoke,
      timeoutMs: options.timeoutMs,
      commandCount: commandRuns.length
    },
    commandRuns,
    reportSummaries: summarizeSourceReports(reportSummaries),
    readinessSnapshot: {
      evidenceCompletionPercent: numberOrZero(business?.completion?.evidenceCompletionPercent ?? completion?.readinessSnapshot?.evidenceCompletionPercent),
      businessReadinessStatus: reportSummaries.businessReadiness.status,
      releaseAuditStatus: reportSummaries.releaseAudit.status,
      reportContractsStatus: reportSummaries.reportContracts.status,
      commercialInputsStatus: reportSummaries.commercialInputs.status,
      liveInputsStatus: reportSummaries.liveInputs.status,
      launchIntakeStatus: reportSummaries.launchIntake.status,
      readyPaidGates,
      readyPaidGateCount: readyPaidGates.length,
      approvedBudgetUsd: numberOrUndefined(completion?.readinessSnapshot?.budget?.approvedBudgetUsd ?? reportSummaries.businessPlan.value?.costPlan?.maxBudgetUsd),
      knownPaidEstimateUsd: numberOrUndefined(completion?.readinessSnapshot?.budget?.knownPaidEstimateUsd ?? reportSummaries.businessPlan.value?.costPlan?.knownPaidEstimateUsd),
      canRunGeneratedAudioPaidSlice: completion?.releaseGateSummary?.canRunGeneratedAudioPaidSlice === true,
      canRunFullKnownPaidSequence: completion?.releaseGateSummary?.canRunFullKnownPaidSequence === true,
      shouldDeferFullSequenceSpend:
        completion?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
        business?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
        true,
      canReleaseToCustomerTraffic
    },
    codeWorkSummary: {
      commandPlanPass: completion?.codeWorkSummary?.commercialCommandPlanPass === true,
      releaseAuditReady: reportSummaries.releaseAudit.status === "release_ready",
      reportContractsPass: reportSummaries.reportContracts.status === "pass",
      knownCodeBlockingIssueCount,
      unexpectedCodeCommandFailures: codeBlockingRuns.map((item) => item.name),
      message: knownCodeBlockingIssueCount === 0
        ? "No current code/schema/command-plan blocker is known from launch doctor evidence."
        : "One or more code/schema/command-plan blockers are still present."
    },
    blockerSummary: completion?.blockerSummary ?? {
      total: 0,
      automatableNow: 0,
      externalOrPaid: 0,
      byOwner: {},
      byCategory: {}
    },
    releaseGateSummary: {
      canReleaseToCustomerTraffic,
      canRunNoSpendPrep: true,
      canRunLiveNetworkEvidence: completion?.releaseGateSummary?.canRunLiveNetworkEvidence === true,
      canRunGeneratedAudioPaidSlice: completion?.releaseGateSummary?.canRunGeneratedAudioPaidSlice === true,
      canRunFullKnownPaidSequence: completion?.releaseGateSummary?.canRunFullKnownPaidSequence === true,
      readyPaidGates,
      readyPaidGateCount: readyPaidGates.length,
      shouldDeferFullSequenceSpend:
        completion?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
        business?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
        true,
      knownCodeBlockingIssueCount,
      releaseBlocker: releaseBlockerFor({ status, knownCodeBlockingIssueCount, completion, business })
    },
    nextActions
  };
}

function statusFor({ canReleaseToCustomerTraffic, readyForLiveEvidence, knownCodeBlockingIssueCount }) {
  if (canReleaseToCustomerTraffic) {
    return "ready_for_customer_traffic";
  }
  if (knownCodeBlockingIssueCount > 0) {
    return "blocked_by_code_or_contracts";
  }
  if (readyForLiveEvidence) {
    return "ready_for_live_evidence_sequence";
  }
  return "blocked_by_external_inputs";
}

function summarizeReport(path) {
  const value = readJsonIfExists(path);
  if (!value) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing"
    };
  }
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : undefined,
    status: String(value.status ?? "unknown"),
    value
  };
}

function publicReportSummary(summary) {
  return {
    present: summary.present,
    path: summary.path,
    ...(summary.schemaVersion ? { schemaVersion: summary.schemaVersion } : {}),
    status: summary.status
  };
}

function summarizeSourceReports(reports) {
  return Object.fromEntries(
    Object.entries(reports).map(([name, item]) => [
      name,
      {
        present: item.present,
        path: item.path,
        schemaVersion: item.schemaVersion,
        status: item.status
      }
    ])
  );
}

function releaseBlockerFor({ status, knownCodeBlockingIssueCount, completion, business }) {
  if (status === "ready_for_customer_traffic") {
    return "Business-readiness gate allows customer traffic.";
  }
  if (knownCodeBlockingIssueCount > 0) {
    return "Code/schema/command-plan blockers must be fixed before launch evidence can be trusted.";
  }
  return completion?.releaseGateSummary?.releaseBlocker ??
    business?.releaseGateSummary?.releaseBlocker ??
    "Commercial launch still requires external evidence, budget approval, paid validation, or manual review.";
}

function buildNextActions({ completion, business, reportSummaries, codeBlockingRuns }) {
  const actions = [];
  if (codeBlockingRuns.length > 0) {
    actions.push(`Fix unexpected command failure(s): ${codeBlockingRuns.map((item) => item.name).join(", ")}.`);
  }
  if (reportSummaries.launchIntake.status === "missing_intake") {
    actions.push("Run validation:launch-intake -- --write-draft, fill the ignored secret-free intake, then rerun validation:launch-doctor.");
  }
  for (const action of arrayOfStrings(completion?.nextActions ?? business?.nextActions)) {
    actions.push(action);
  }
  if (actions.length === 0) {
    actions.push("Rerun validation:launch-doctor after each ENV, deployment, budget, paid-validation, or manual-review update.");
  }
  return [...new Set(actions)];
}

function renderMarkdown(report) {
  return [
    "# CineJelly Commercial Launch Doctor",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${report.status}`,
    "",
    "## Snapshot",
    "",
    `- Evidence completion: ${report.readinessSnapshot.evidenceCompletionPercent}%`,
    `- Business-readiness: ${report.readinessSnapshot.businessReadinessStatus}`,
    `- Release audit: ${report.readinessSnapshot.releaseAuditStatus}`,
    `- Report contracts: ${report.readinessSnapshot.reportContractsStatus}`,
    `- Launch intake: ${report.readinessSnapshot.launchIntakeStatus}`,
    `- Approved budget: ${formatUsd(report.readinessSnapshot.approvedBudgetUsd)}`,
    `- Known paid estimate: ${formatUsd(report.readinessSnapshot.knownPaidEstimateUsd)}`,
    `- Ready paid gates: ${report.readinessSnapshot.readyPaidGates.length === 0 ? "none" : report.readinessSnapshot.readyPaidGates.join(", ")}`,
    "",
    "## Code-Side Status",
    "",
    `- Known code blockers: ${report.codeWorkSummary.knownCodeBlockingIssueCount}`,
    `- Release audit ready: ${report.codeWorkSummary.releaseAuditReady}`,
    `- Report contracts pass: ${report.codeWorkSummary.reportContractsPass}`,
    `- Command plan pass: ${report.codeWorkSummary.commandPlanPass}`,
    `- ${report.codeWorkSummary.message}`,
    "",
    "## Command Runs",
    "",
    ...report.commandRuns.map((item) => `- ${item.name}: ${item.status} (exit ${item.exitCode}, ${item.durationMs}ms)`),
    "",
    "## Release Gate",
    "",
    `- canReleaseToCustomerTraffic: ${report.releaseGateSummary.canReleaseToCustomerTraffic}`,
    `- canRunLiveNetworkEvidence: ${report.releaseGateSummary.canRunLiveNetworkEvidence}`,
    `- canRunGeneratedAudioPaidSlice: ${report.releaseGateSummary.canRunGeneratedAudioPaidSlice}`,
    `- canRunFullKnownPaidSequence: ${report.releaseGateSummary.canRunFullKnownPaidSequence}`,
    `- shouldDeferFullSequenceSpend: ${report.releaseGateSummary.shouldDeferFullSequenceSpend}`,
    `- ${report.releaseGateSummary.releaseBlocker}`,
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function summarizeProcessOutput(value) {
  const text = String(value ?? "").replace(/\r/g, "").trim();
  if (!text) {
    return "No process output was captured.";
  }
  const lines = text.split("\n").slice(-20);
  return lines.join("\n");
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberOrZero(value) {
  return numberOrUndefined(value) ?? 0;
}

function formatUsd(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(path, report) {
  writeText(path, `${JSON.stringify(report, null, 2)}\n`);
}

function writeText(path, content) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.commercial-launch-doctor.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked_by_code_or_contracts",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 2;
}
