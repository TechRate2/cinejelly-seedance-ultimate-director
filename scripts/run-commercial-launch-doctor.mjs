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
    skipLocalSmoke: false,
    skipProviderHandoffSmokes: false
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
    if (arg === "--skip-provider-handoff-smokes") {
      options.skipProviderHandoffSmokes = true;
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
  --skip-provider-handoff-smokes Skip provider resume/handoff no-spend smokes.
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
  let finalCommandRuns = [...commandRuns, reportContracts];
  report = buildReport(options, finalCommandRuns);
  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }

  const completionAuditRefresh = runCommand(completionAuditCommand("completion_audit_after_contracts"), options);
  finalCommandRuns = [...finalCommandRuns, completionAuditRefresh];
  report = buildReport(options, finalCommandRuns);
  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }

  const finalReportContracts = runCommand(reportContractCommand("report_contracts_final"), options);
  finalCommandRuns = [...finalCommandRuns, finalReportContracts];
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
    }),
    command("snapshot_parity", ["scripts/audit-snapshot-parity.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("material_source_scoring", ["tests/run-material-source-scoring-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("source_video_auto_analysis_smoke", ["tests/run-source-video-auto-analysis-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("remote_stock_adapter_smoke", ["tests/run-remote-stock-adapter-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("generated_audio_mapping_smoke", ["tests/run-generated-audio-mapping-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("short_review_operation_guard", ["tests/run-short-review-operation-evidence-guard-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/short-review-operation-evidence-guard-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("short_product_rights_guard", ["tests/run-short-product-rights-evidence-guard-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    })
  ];
  if (!options.skipLocalSmoke) {
    commands.push(
      command("local_smoke", ["tests/run-local-validation-smoke.mjs"], {
        reportPath: "assets/output_deliverables/phase6-validation/local-smoke-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      })
    );
  }
  if (!options.skipProviderHandoffSmokes) {
    commands.push(
      command("provider_reconciliation", ["tests/run-render-provider-reconciliation-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_handoff", ["tests/run-render-provider-handoff-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-handoff-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_external_lease", ["tests/run-render-provider-external-lease-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_lease_service", ["tests/run-render-provider-lease-service-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_handoff_actions", ["tests/run-render-provider-handoff-action-ledger-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("production_graph_resume_state", ["tests/run-production-graph-resume-state-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/production-graph-resume-state-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("production_graph_resume_queue_service", ["tests/run-production-graph-resume-queue-service-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_graph_resume_worker", ["tests/run-render-provider-graph-resume-worker-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      }),
      command("provider_multi_worker_handoff", ["tests/run-render-provider-multi-worker-handoff-smoke.mjs"], {
        reportPath: "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json",
        expectedExitCodes: [0],
        blocksCodeReadiness: true
      })
    );
  }
  commands.push(
    command("provider_live_action_draft", ["scripts/create-render-provider-live-action-evidence-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/render-provider-live-action-evidence-draft-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("provider_live_actions", ["scripts/validate-render-provider-live-actions.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("provider_graph_resume_draft", ["scripts/create-render-provider-graph-resume-enqueue-evidence-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueue-evidence-draft-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("provider_graph_resume", ["scripts/validate-render-provider-graph-resume-enqueues.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("short_review_operation_draft", ["scripts/create-short-review-operation-evidence-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/short-review-operation-evidence-draft-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: false
    }),
    command("short_review_operation_validation", ["scripts/validate-short-review-operation-evidence.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("short_product_rights_draft", ["scripts/create-short-product-rights-evidence-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/short-product-rights-evidence-draft-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: false
    }),
    command("short_product_rights_validation", ["scripts/validate-short-product-rights-evidence.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("release_audit", ["scripts/run-release-audit.mjs"], {
      reportPath: "assets/output_deliverables/phase6-validation/release-audit-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("quality_benchmark", ["scripts/run-director-style-benchmark.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/director-style-benchmark-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("quality_review_drafts", ["scripts/create-director-style-review-drafts.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/director-style-review-drafts-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("quality_review_guard", ["tests/run-director-style-review-evidence-guard-smoke.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json",
      expectedExitCodes: [0],
      blocksCodeReadiness: true
    }),
    command("quality_review_evidence", ["scripts/validate-director-style-review-evidence.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("generated_audio_review_draft", ["scripts/create-generated-audio-manual-review-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/generated-audio-manual-review-draft-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("generated_audio_review_readiness", ["scripts/validate-generated-audio-manual-review-readiness.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/generated-audio-manual-review-readiness-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("long_form_review_draft", ["scripts/create-long-form-manual-quality-review-draft.mjs", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("long_form_review_readiness", ["scripts/validate-long-form-manual-review-readiness.mjs"], {
      reportPath: "assets/output_deliverables/business-readiness/long-form-manual-quality-review-readiness-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("launch_intake", ["--env-file-if-exists=.env", "scripts/validate-commercial-launch-intake.mjs", "--write-draft", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    }),
    command("ops_config", ["--env-file-if-exists=.env", "scripts/validate-business-readiness-ops-config.mjs", "--write-drafts", "--force"], {
      reportPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
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
    completionAuditCommand("completion_audit"),
    roadmapClosureCommand("roadmap_closure_audit"),
    command("business_readiness", ["scripts/run-business-readiness-audit.mjs"], {
      reportPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
      expectedExitCodes: [0, 1],
      blocksCodeReadiness: false
    })
  );
  return commands;
}

function completionAuditCommand(name) {
  return command(name, ["scripts/summarize-business-completion-audit.mjs", "--skip-launch-doctor-report"], {
    reportPath: "assets/output_deliverables/business-readiness/business-completion-audit-report.json",
    expectedExitCodes: [0, 1],
    blocksCodeReadiness: false
  });
}

function roadmapClosureCommand(name) {
  return command(name, ["scripts/audit-roadmap-closure.mjs", "--skip-launch-doctor-report"], {
    reportPath: "assets/output_deliverables/business-readiness/roadmap-closure-audit-report.json",
    expectedExitCodes: [0, 1],
    blocksCodeReadiness: false
  });
}

function reportContractCommand(name = "report_contracts") {
  return command(name, ["scripts/validate-report-contracts.mjs", "--allow-launch-doctor-in-progress"], {
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
    qualityBenchmark: summarizeReport("assets/output_deliverables/business-readiness/director-style-benchmark-report.json"),
    qualityReviewDrafts: summarizeReport("assets/output_deliverables/business-readiness/director-style-review-drafts-report.json"),
    qualityReviewGuard: summarizeReport("assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json"),
    qualityReviewEvidence: summarizeReport("assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json"),
    generatedAudioValidation: summarizeReport("assets/output_deliverables/business-readiness/generated-audio-validation-report.json"),
    generatedAudioArtifactEvidence: summarizeReport("assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json"),
    generatedAudioReviewDraft: summarizeReport("assets/output_deliverables/business-readiness/generated-audio-manual-review-draft-report.json"),
    generatedAudioReviewReadiness: summarizeReport("assets/output_deliverables/business-readiness/generated-audio-manual-review-readiness-report.json"),
    longFormReviewDraft: summarizeReport("assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json"),
    longFormReviewReadiness: summarizeReport("assets/output_deliverables/business-readiness/long-form-manual-quality-review-readiness-report.json"),
    snapshotParity: summarizeReport("assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json"),
    materialSourceScoring: summarizeReport("assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json"),
    sourceVideoAutoAnalysisSmoke: summarizeReport("assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json"),
    remoteStockAdapterSmoke: summarizeReport("assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json"),
    generatedAudioMappingSmoke: summarizeReport("assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json"),
    shortReviewOperationGuard: summarizeReport("assets/output_deliverables/business-readiness/short-review-operation-evidence-guard-smoke-report.json"),
    shortReviewOperationDraft: summarizeReport("assets/output_deliverables/business-readiness/short-review-operation-evidence-draft-report.json"),
    shortReviewOperationValidation: summarizeReport("assets/output_deliverables/business-readiness/short-review-operation-validation-report.json"),
    shortProductRightsGuard: summarizeReport("assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke-report.json"),
    shortProductRightsDraft: summarizeReport("assets/output_deliverables/business-readiness/short-product-rights-evidence-draft-report.json"),
    shortProductRightsValidation: summarizeReport("assets/output_deliverables/business-readiness/short-product-rights-validation-report.json"),
    providerReconciliation: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json"),
    providerHandoff: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-handoff-report.json"),
    providerExternalLease: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json"),
    providerLeaseService: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json"),
    providerHandoffActions: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json"),
    productionGraphResumeState: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/production-graph-resume-state-report.json"),
    productionGraphResumeQueueService: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json"),
    providerGraphResumeWorker: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json"),
    providerMultiWorkerHandoff: summarizeProviderReport(options, "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json"),
    providerLiveActionDraft: summarizeReport("assets/output_deliverables/business-readiness/render-provider-live-action-evidence-draft-report.json"),
    providerLiveActions: summarizeReport("assets/output_deliverables/business-readiness/render-provider-live-actions-report.json"),
    providerGraphResumeDraft: summarizeReport("assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueue-evidence-draft-report.json"),
    providerGraphResume: summarizeReport("assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json"),
    reportContracts: summarizeReport("assets/output_deliverables/business-readiness/report-contract-validation-report.json"),
    launchIntake: summarizeReport("assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json"),
    opsConfig: summarizeReport("assets/output_deliverables/business-readiness/ops-config-validation-report.json")
  };
  const completion = reportSummaries.completionAudit.value;
  const business = reportSummaries.businessReadiness.value;
  const codeBlockingRuns = commandRuns.filter((item) => item.blocksCodeReadiness && item.status !== "pass");
  const knownCodeBlockingIssueCount = Number(completion?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0) + codeBlockingRuns.length;
  const canReleaseToCustomerTraffic = business?.releaseGateSummary?.canReleaseToCustomerTraffic === true;
  const readyForLiveEvidence = completion?.status === "ready_for_live_evidence_sequence";
  const commercialOfferScopeSummary = buildCommercialOfferScopeSummary(completion, reportSummaries.launchIntake);
  const operatorHandoffSummary = buildOperatorHandoffSummary(reportSummaries.commercialInputs.value);
  const snapshotParityCoverageSummary = buildSnapshotParityCoverageSummary(reportSummaries.snapshotParity.value, reportSummaries.snapshotParity);
  const evidenceClosurePlan = buildEvidenceClosurePlan(completion);
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
      skipProviderHandoffSmokes: options.skipProviderHandoffSmokes,
      timeoutMs: options.timeoutMs,
      commandCount: commandRuns.length
    },
    commandRuns,
    reportSummaries: summarizeSourceReports(reportSummaries),
    commercialOfferScopeSummary,
    operatorHandoffSummary,
    snapshotParityCoverageSummary,
    evidenceClosurePlan,
    readinessSnapshot: {
      evidenceCompletionPercent: numberOrZero(business?.completion?.evidenceCompletionPercent ?? completion?.readinessSnapshot?.evidenceCompletionPercent),
      businessReadinessStatus: reportSummaries.businessReadiness.status,
      releaseAuditStatus: reportSummaries.releaseAudit.status,
      snapshotParityStatus: reportSummaries.snapshotParity.status,
      sourceVideoAutoAnalysisSmokeStatus: reportSummaries.sourceVideoAutoAnalysisSmoke.status,
      remoteStockAdapterSmokeStatus: reportSummaries.remoteStockAdapterSmoke.status,
      generatedAudioMappingSmokeStatus: reportSummaries.generatedAudioMappingSmoke.status,
      shortReviewOperationGuardStatus: reportSummaries.shortReviewOperationGuard.status,
      shortReviewOperationDraftStatus: reportSummaries.shortReviewOperationDraft.status,
      shortReviewOperationValidationStatus: reportSummaries.shortReviewOperationValidation.status,
      shortProductRightsGuardStatus: reportSummaries.shortProductRightsGuard.status,
      shortProductRightsDraftStatus: reportSummaries.shortProductRightsDraft.status,
      shortProductRightsValidationStatus: reportSummaries.shortProductRightsValidation.status,
      qualityBenchmarkStatus: reportSummaries.qualityBenchmark.status,
      qualityReviewDraftsStatus: reportSummaries.qualityReviewDrafts.status,
      qualityReviewGuardStatus: reportSummaries.qualityReviewGuard.status,
      qualityReviewEvidenceStatus: reportSummaries.qualityReviewEvidence.status,
      generatedAudioValidationStatus: reportSummaries.generatedAudioValidation.status,
      generatedAudioArtifactEvidenceStatus: reportSummaries.generatedAudioArtifactEvidence.status,
      generatedAudioReviewDraftStatus: reportSummaries.generatedAudioReviewDraft.status,
      generatedAudioReviewReadinessStatus: reportSummaries.generatedAudioReviewReadiness.status,
      longFormReviewDraftStatus: reportSummaries.longFormReviewDraft.status,
      longFormReviewReadinessStatus: reportSummaries.longFormReviewReadiness.status,
      providerReconciliationStatus: reportSummaries.providerReconciliation.status,
      providerHandoffStatus: reportSummaries.providerHandoff.status,
      providerExternalLeaseStatus: reportSummaries.providerExternalLease.status,
      providerLeaseServiceStatus: reportSummaries.providerLeaseService.status,
      providerHandoffActionsStatus: reportSummaries.providerHandoffActions.status,
      productionGraphResumeStateStatus: reportSummaries.productionGraphResumeState.status,
      productionGraphResumeQueueServiceStatus: reportSummaries.productionGraphResumeQueueService.status,
      providerGraphResumeWorkerStatus: reportSummaries.providerGraphResumeWorker.status,
      providerMultiWorkerHandoffStatus: reportSummaries.providerMultiWorkerHandoff.status,
      providerLiveActionDraftStatus: reportSummaries.providerLiveActionDraft.status,
      providerLiveActionsStatus: reportSummaries.providerLiveActions.status,
      providerGraphResumeDraftStatus: reportSummaries.providerGraphResumeDraft.status,
      providerGraphResumeStatus: reportSummaries.providerGraphResume.status,
      reportContractsStatus: reportSummaries.reportContracts.status,
      commercialInputsStatus: reportSummaries.commercialInputs.status,
      opsConfigStatus: reportSummaries.opsConfig.status,
      liveInputsStatus: reportSummaries.liveInputs.status,
      launchIntakeStatus: reportSummaries.launchIntake.status,
      commercialOfferScopeStatus: commercialOfferScopeSummary.status,
      commercialOfferScopeConfigured: commercialOfferScopeSummary.configured,
      ...(commercialOfferScopeSummary.productSurface ? { commercialOfferProductSurface: commercialOfferScopeSummary.productSurface } : {}),
      uiRequiredBeforeCustomerTraffic: commercialOfferScopeSummary.uiRequiredBeforeCustomerTraffic,
      commercialOfferScopeDecisionRequired: commercialOfferScopeSummary.scopeDecisionRequired,
      commercialOfferBlocksApiCliCommercialLaunch: commercialOfferScopeSummary.blocksApiCliCommercialLaunch,
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
      snapshotParityPass: reportSummaries.snapshotParity.status === "pass",
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
      commercialOfferScopeStatus: commercialOfferScopeSummary.status,
      commercialOfferBlocksApiCliCommercialLaunch: commercialOfferScopeSummary.blocksApiCliCommercialLaunch,
      releaseBlocker: releaseBlockerFor({ status, knownCodeBlockingIssueCount, completion, business })
    },
    nextActions
  };
}

function buildCommercialOfferScopeSummary(completion, launchIntakeSummary) {
  const completionSummary = completion?.commercialOfferScopeSummary;
  if (completionSummary && typeof completionSummary === "object") {
    return {
      launchIntakePresent: completionSummary.launchIntakePresent === true,
      launchIntakeStatus: String(completionSummary.launchIntakeStatus ?? launchIntakeSummary.status),
      configured: completionSummary.configured === true,
      status: String(completionSummary.status ?? "scope_decision_pending"),
      ...(typeof completionSummary.productSurface === "string" ? { productSurface: completionSummary.productSurface } : {}),
      uiRequiredBeforeCustomerTraffic: completionSummary.uiRequiredBeforeCustomerTraffic === true,
      scopeDecisionRequired: completionSummary.scopeDecisionRequired !== false,
      blocksApiCliCommercialLaunch: completionSummary.blocksApiCliCommercialLaunch === true,
      blocksFullSnapshotParity: completionSummary.blocksFullSnapshotParity !== false,
      sourceReport: String(completionSummary.sourceReport ?? launchIntakeSummary.path),
      message: String(completionSummary.message ?? "Commercial offer scope is summarized from completion audit.")
    };
  }
  return {
    launchIntakePresent: launchIntakeSummary.present === true,
    launchIntakeStatus: launchIntakeSummary.status,
    configured: false,
    status: launchIntakeSummary.present === true ? "scope_decision_pending" : "missing_launch_intake_report",
    uiRequiredBeforeCustomerTraffic: false,
    scopeDecisionRequired: true,
    blocksApiCliCommercialLaunch: false,
    blocksFullSnapshotParity: true,
    sourceReport: launchIntakeSummary.path,
    message: "Commercial offer scope is unavailable from completion audit; rerun validation:completion-audit after validation:launch-intake."
  };
}

function buildOperatorHandoffSummary(commercialInputs) {
  const manifest = commercialInputs?.operatorHandoffManifest;
  const summary = manifest?.summary ?? {};
  const safety = manifest?.safety ?? {};
  const operatorInputFiles = Array.isArray(manifest?.operatorInputFiles)
    ? manifest.operatorInputFiles.map((item) => String(item?.path ?? "")).filter(Boolean)
    : [];
  const blockedInputIds = Array.isArray(manifest?.blockedInputIds)
    ? manifest.blockedInputIds.map(String)
    : [];
  const refreshCommands = Array.isArray(manifest?.refreshCommands)
    ? manifest.refreshCommands.map(String)
    : [];
  return {
    source: manifest ? "commercial_launch_inputs" : "missing_commercial_launch_inputs_manifest",
    status: String(manifest?.status ?? commercialInputs?.status ?? "unknown"),
    safeToShareWithOperators: safety.shareableWithOperators === true,
    releaseEvidence: safety.releaseEvidence === true,
    secretValuesIncluded: safety.secretValuesIncluded === true,
    rawProviderPayloadsIncluded: safety.rawProviderPayloadsIncluded === true,
    localAbsolutePathsIncluded: safety.localAbsolutePathsIncluded === true,
    customerMediaIncluded: safety.customerMediaIncluded === true,
    requiredInputCount: numberOrZero(summary.requiredInputCount),
    configuredInputCount: numberOrZero(summary.configuredInputCount),
    missingOrBlockedInputCount: numberOrZero(summary.missingOrBlockedInputCount),
    pendingAfterPaidRunCount: numberOrZero(summary.pendingAfterPaidRunCount),
    operatorInputFileCount: numberOrZero(summary.operatorInputFileCount),
    draftFileCount: numberOrZero(summary.draftFileCount),
    reportArchiveFileCount: numberOrZero(summary.reportArchiveFileCount),
    commandCount: numberOrZero(summary.commandCount),
    readyCommandCount: numberOrZero(summary.readyCommandCount),
    blockedCommandCount: numberOrZero(summary.blockedCommandCount),
    paidCommandCount: numberOrZero(summary.paidCommandCount),
    readyPaidCommandCount: numberOrZero(summary.readyPaidCommandCount),
    commandPlanAuditStatus: String(summary.commandPlanAuditStatus ?? commercialInputs?.commandPlanAudit?.status ?? "unknown"),
    blockedInputIds,
    operatorInputFiles,
    refreshCommands
  };
}

function buildSnapshotParityCoverageSummary(snapshotParity, sourceReport) {
  const estimates = Array.isArray(snapshotParity?.functionalParityEstimates)
    ? snapshotParity.functionalParityEstimates
    : [];
  const sourceEstimates = estimates.map((item) => ({
    id: String(item?.id ?? ""),
    localPath: String(item?.localPath ?? ""),
    upstreamRepository: String(item?.upstreamRepository ?? ""),
    estimateMinPercent: numberOrZero(item?.estimateMinPercent),
    estimateMaxPercent: numberOrZero(item?.estimateMaxPercent),
    estimateText: String(item?.estimateText ?? ""),
    mainGaps: String(item?.mainGaps ?? "")
  })).filter((item) => item.id && item.upstreamRepository);
  return {
    source: estimates.length > 0 ? "snapshot_parity_audit" : "missing_snapshot_parity_estimates",
    status: String(snapshotParity?.status ?? sourceReport?.status ?? "unknown"),
    guardrailsPass: snapshotParity?.releaseGateSummary?.snapshotGuardrailsPass === true,
    canClaimFullSnapshotParity: snapshotParity?.releaseGateSummary?.canClaimFullSnapshotParity === true,
    releaseEvidence: false,
    sourceEstimateCount: sourceEstimates.length,
    estimatedSourceCount: numberOrZero(snapshotParity?.summary?.functionalParityEstimateCount ?? sourceEstimates.length),
    lowestEstimatePercent: numberOrZero(snapshotParity?.summary?.lowestSnapshotParityEstimatePercent),
    highestEstimatePercent: numberOrZero(snapshotParity?.summary?.highestSnapshotParityEstimatePercent),
    averageEstimateMinPercent: numberOrZero(snapshotParity?.summary?.averageSnapshotParityEstimateMinPercent),
    averageEstimateMaxPercent: numberOrZero(snapshotParity?.summary?.averageSnapshotParityEstimateMaxPercent),
    sourceEstimates
  };
}

function buildEvidenceClosurePlan(completion) {
  const plan = completion?.evidenceClosurePlan;
  if (plan && typeof plan === "object") {
    return {
      status: String(plan.status ?? "blocked"),
      releaseEvidence: false,
      blockerCount: numberOrZero(plan.blockerCount),
      codeActionCount: numberOrZero(plan.codeActionCount),
      externalOrPaidActionCount: numberOrZero(plan.externalOrPaidActionCount),
      paidDependencyCount: numberOrZero(plan.paidDependencyCount),
      phaseCount: numberOrZero(plan.phaseCount),
      phases: Array.isArray(plan.phases)
        ? plan.phases.map((phase) => ({
            id: String(phase?.id ?? ""),
            order: numberOrZero(phase?.order),
            label: String(phase?.label ?? ""),
            owner: String(phase?.owner ?? ""),
            status: String(phase?.status ?? "blocked"),
            blockerCount: numberOrZero(phase?.blockerCount),
            blockerIds: arrayOfStrings(phase?.blockerIds),
            productGapCount: numberOrZero(phase?.productGapCount),
            productGapIds: arrayOfStrings(phase?.productGapIds),
            requiredInputCount: numberOrZero(phase?.requiredInputCount),
            requiredInputIds: arrayOfStrings(phase?.requiredInputIds),
            envVarCount: numberOrZero(phase?.envVarCount),
            envVars: arrayOfStrings(phase?.envVars),
            envPlaceholders: Array.isArray(phase?.envPlaceholders)
              ? phase.envPlaceholders.map((item) => ({
                  name: String(item?.name ?? ""),
                  sensitivity: String(item?.sensitivity ?? "unknown"),
                  required: item?.required === true,
                  configured: item?.configured === true,
                  purpose: String(item?.purpose ?? "")
                })).filter((item) => item.name)
              : [],
            operatorInputFiles: arrayOfStrings(phase?.operatorInputFiles),
            draftFiles: arrayOfStrings(phase?.draftFiles),
            reportArchiveFiles: arrayOfStrings(phase?.reportArchiveFiles),
            commands: arrayOfStrings(phase?.commands),
            commandGuards: Array.isArray(phase?.commandGuards)
              ? phase.commandGuards.map((item) => ({
                  command: String(item?.command ?? ""),
                  source: String(item?.source ?? "unknown"),
                  runnable: item?.runnable === true,
                  requiresLiveNetwork: item?.requiresLiveNetwork === true,
                  requiresProviderSpend: item?.requiresProviderSpend === true,
                  requiresOperatorConfirmation: item?.requiresOperatorConfirmation === true,
                  requiresManualReview: item?.requiresManualReview === true,
                  containsPlaceholder: item?.containsPlaceholder === true
                })).filter((item) => item.command)
              : [],
            localPreparationCommands: normalizeLocalPreparationCommands(phase?.localPreparationCommands),
            executionReadiness: normalizeExecutionReadiness(phase?.executionReadiness),
            releaseImpact: String(phase?.releaseImpact ?? "")
          })).filter((phase) => phase.id && phase.label)
        : []
    };
  }
  return {
    status: "blocked",
    releaseEvidence: false,
    blockerCount: numberOrZero(completion?.blockerSummary?.total),
    codeActionCount: numberOrZero(completion?.blockerSummary?.byOwner?.codebase),
    externalOrPaidActionCount: numberOrZero(completion?.blockerSummary?.externalOrPaid),
    paidDependencyCount: 0,
    phaseCount: 0,
    phases: []
  };
}

function normalizeLocalPreparationCommands(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      name: String(item?.name ?? ""),
      command: String(item?.command ?? ""),
      source: String(item?.source ?? "unknown"),
      sourceInputIds: arrayOfStrings(item?.sourceInputIds),
      runnable: item?.runnable === true,
      producesDrafts: item?.producesDrafts === true,
      releaseEvidence: item?.releaseEvidence === true,
      draftFiles: arrayOfStrings(item?.draftFiles),
      requiresLiveNetwork: item?.requiresLiveNetwork === true,
      requiresProviderSpend: item?.requiresProviderSpend === true,
      requiresOperatorConfirmation: item?.requiresOperatorConfirmation === true,
      requiresManualReview: item?.requiresManualReview === true,
      containsPlaceholder: item?.containsPlaceholder === true
    }))
    .filter((item) => item.name && item.command);
}

function normalizeExecutionReadiness(value) {
  const inputStatusCounts = value?.inputStatusCounts && typeof value.inputStatusCounts === "object"
    ? Object.fromEntries(Object.entries(value.inputStatusCounts).map(([key, count]) => [key, numberOrZero(count)]))
    : {};
  const guardSummary = value?.guardSummary && typeof value.guardSummary === "object"
    ? {
        commandCount: numberOrZero(value.guardSummary.commandCount),
        runnableCommandCount: numberOrZero(value.guardSummary.runnableCommandCount),
        liveNetworkCommandCount: numberOrZero(value.guardSummary.liveNetworkCommandCount),
        providerSpendCommandCount: numberOrZero(value.guardSummary.providerSpendCommandCount),
        operatorConfirmationCommandCount: numberOrZero(value.guardSummary.operatorConfirmationCommandCount),
        manualReviewCommandCount: numberOrZero(value.guardSummary.manualReviewCommandCount),
        placeholderCommandCount: numberOrZero(value.guardSummary.placeholderCommandCount)
      }
    : {
        commandCount: 0,
        runnableCommandCount: 0,
        liveNetworkCommandCount: 0,
        providerSpendCommandCount: 0,
        operatorConfirmationCommandCount: 0,
        manualReviewCommandCount: 0,
        placeholderCommandCount: 0
      };
  return {
    status: String(value?.status ?? "blocked"),
    canAttemptNow: value?.canAttemptNow === true,
    blockingReasonCount: numberOrZero(value?.blockingReasonCount),
    blockingReasons: arrayOfStrings(value?.blockingReasons),
    inputStatusCounts,
    missingRequiredEnvVars: arrayOfStrings(value?.missingRequiredEnvVars),
    optionalUnconfiguredEnvVars: arrayOfStrings(value?.optionalUnconfiguredEnvVars),
    missingOperatorInputFiles: arrayOfStrings(value?.missingOperatorInputFiles),
    missingReportArchiveFiles: arrayOfStrings(value?.missingReportArchiveFiles),
    guardSummary
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

function summarizeProviderReport(options, path) {
  if (options.skipProviderHandoffSmokes) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "skipped"
    };
  }
  return summarizeReport(path);
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
  if (reportSummaries.opsConfig.status !== "pass") {
    actions.push("Fill the ignored billing/admin and production-operations attestation drafts, then rerun validation:ops-config and validation:launch-doctor.");
  }
  if (reportSummaries.providerLiveActions.status !== "pass") {
    actions.push("After production handoff capture passes, archive live provider callback evidence in ops/render-provider-live-actions.json and rerun validation:provider-live-actions with --confirm-live-provider-actions.");
  }
  if (reportSummaries.providerGraphResume.status !== "pass") {
    actions.push("After live graph-resume enqueue executes, archive digest-only enqueue payload evidence in ops/render-provider-graph-resume-enqueues.json and rerun validation:provider-graph-resume with --confirm-graph-resume-enqueues.");
  }
  if (reportSummaries.shortReviewOperationValidation.status !== "pass") {
    actions.push("Run validation:short-review-operation-draft -- --force, archive accepted Short create/review operation evidence in ops/short-review-operation-evidence.json, then run validation:short-review-operation with --confirm-accepted-review-operation before paid Short render evidence can count.");
  }
  if (reportSummaries.shortProductRightsValidation.status !== "pass") {
    actions.push("Run validation:short-product-rights-draft -- --force, archive accepted Short product-facts/media-rights evidence in ops/short-product-rights-evidence.json, then run validation:short-product-rights with --confirm-accepted-product-rights before paid Short render evidence can count.");
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
    `- Snapshot parity: ${report.readinessSnapshot.snapshotParityStatus}`,
    `- Source-video auto-analysis smoke: ${report.readinessSnapshot.sourceVideoAutoAnalysisSmokeStatus}`,
    `- Remote-stock adapter smoke: ${report.readinessSnapshot.remoteStockAdapterSmokeStatus}`,
    `- Generated-audio mapping smoke: ${report.readinessSnapshot.generatedAudioMappingSmokeStatus}`,
    `- Short review operation guard: ${report.readinessSnapshot.shortReviewOperationGuardStatus}`,
    `- Short review operation draft: ${report.readinessSnapshot.shortReviewOperationDraftStatus}`,
    `- Short review operation validation: ${report.readinessSnapshot.shortReviewOperationValidationStatus}`,
    `- Short product/rights guard: ${report.readinessSnapshot.shortProductRightsGuardStatus}`,
    `- Short product/rights draft: ${report.readinessSnapshot.shortProductRightsDraftStatus}`,
    `- Short product/rights validation: ${report.readinessSnapshot.shortProductRightsValidationStatus}`,
    `- Quality benchmark: ${report.readinessSnapshot.qualityBenchmarkStatus}`,
    `- Quality review drafts: ${report.readinessSnapshot.qualityReviewDraftsStatus}`,
    `- Quality review guard: ${report.readinessSnapshot.qualityReviewGuardStatus}`,
    `- Quality review evidence: ${report.readinessSnapshot.qualityReviewEvidenceStatus}`,
    `- Generated-audio validation: ${report.readinessSnapshot.generatedAudioValidationStatus}`,
    `- Generated-audio artifact evidence: ${report.readinessSnapshot.generatedAudioArtifactEvidenceStatus}`,
    `- Generated-audio review draft: ${report.readinessSnapshot.generatedAudioReviewDraftStatus}`,
    `- Generated-audio review readiness: ${report.readinessSnapshot.generatedAudioReviewReadinessStatus}`,
    `- Long-form review draft: ${report.readinessSnapshot.longFormReviewDraftStatus}`,
    `- Long-form review readiness: ${report.readinessSnapshot.longFormReviewReadinessStatus}`,
    `- Provider reconciliation: ${report.readinessSnapshot.providerReconciliationStatus}`,
    `- Provider handoff: ${report.readinessSnapshot.providerHandoffStatus}`,
    `- Provider external lease: ${report.readinessSnapshot.providerExternalLeaseStatus}`,
    `- Provider lease service: ${report.readinessSnapshot.providerLeaseServiceStatus}`,
    `- Provider handoff actions: ${report.readinessSnapshot.providerHandoffActionsStatus}`,
    `- Production graph resume state: ${report.readinessSnapshot.productionGraphResumeStateStatus}`,
    `- Production graph resume queue service: ${report.readinessSnapshot.productionGraphResumeQueueServiceStatus}`,
    `- Provider graph resume worker: ${report.readinessSnapshot.providerGraphResumeWorkerStatus}`,
    `- Provider multi-worker handoff: ${report.readinessSnapshot.providerMultiWorkerHandoffStatus}`,
    `- Provider live-action draft: ${report.readinessSnapshot.providerLiveActionDraftStatus}`,
    `- Provider live actions: ${report.readinessSnapshot.providerLiveActionsStatus}`,
    `- Provider graph-resume draft: ${report.readinessSnapshot.providerGraphResumeDraftStatus}`,
    `- Provider graph resume: ${report.readinessSnapshot.providerGraphResumeStatus}`,
    `- Report contracts: ${report.readinessSnapshot.reportContractsStatus}`,
    `- Ops config: ${report.readinessSnapshot.opsConfigStatus}`,
    `- Launch intake: ${report.readinessSnapshot.launchIntakeStatus}`,
    `- Commercial offer scope: ${report.readinessSnapshot.commercialOfferScopeStatus}`,
    `- Approved budget: ${formatUsd(report.readinessSnapshot.approvedBudgetUsd)}`,
    `- Known paid estimate: ${formatUsd(report.readinessSnapshot.knownPaidEstimateUsd)}`,
    `- Ready paid gates: ${report.readinessSnapshot.readyPaidGates.length === 0 ? "none" : report.readinessSnapshot.readyPaidGates.join(", ")}`,
    "",
    "## Commercial Offer Scope",
    "",
    `- Status: ${report.commercialOfferScopeSummary.status}`,
    `- Configured: ${report.commercialOfferScopeSummary.configured}`,
    `- Product surface: ${report.commercialOfferScopeSummary.productSurface ?? "not_decided"}`,
    `- UI required before customer traffic: ${report.commercialOfferScopeSummary.uiRequiredBeforeCustomerTraffic}`,
    `- Blocks API/CLI commercial launch: ${report.commercialOfferScopeSummary.blocksApiCliCommercialLaunch}`,
    `- ${report.commercialOfferScopeSummary.message}`,
    "",
    "## Snapshot Parity Coverage",
    "",
    ...markdownSnapshotParityCoverageSummary(report.snapshotParityCoverageSummary),
    "",
    "## Operator Handoff",
    "",
    ...markdownOperatorHandoffSummary(report.operatorHandoffSummary),
    "",
    "## Code-Side Status",
    "",
    `- Known code blockers: ${report.codeWorkSummary.knownCodeBlockingIssueCount}`,
    `- Release audit ready: ${report.codeWorkSummary.releaseAuditReady}`,
    `- Snapshot parity pass: ${report.codeWorkSummary.snapshotParityPass}`,
    `- Report contracts pass: ${report.codeWorkSummary.reportContractsPass}`,
    `- Command plan pass: ${report.codeWorkSummary.commandPlanPass}`,
    `- ${report.codeWorkSummary.message}`,
    "",
    "## Evidence Closure Plan",
    "",
    ...markdownEvidenceClosurePlan(report.evidenceClosurePlan),
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
    `- commercialOfferScopeStatus: ${report.releaseGateSummary.commercialOfferScopeStatus}`,
    `- commercialOfferBlocksApiCliCommercialLaunch: ${report.releaseGateSummary.commercialOfferBlocksApiCliCommercialLaunch}`,
    `- shouldDeferFullSequenceSpend: ${report.releaseGateSummary.shouldDeferFullSequenceSpend}`,
    `- ${report.releaseGateSummary.releaseBlocker}`,
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function markdownSnapshotParityCoverageSummary(summary) {
  if (!summary) {
    return ["- Snapshot parity coverage summary unavailable."];
  }
  return [
    `- Source: ${summary.source}`,
    `- Status: ${summary.status}; guardrails pass: ${summary.guardrailsPass}; can claim full parity: ${summary.canClaimFullSnapshotParity}`,
    `- Estimates: ${summary.sourceEstimateCount}; range: ${summary.lowestEstimatePercent}-${summary.highestEstimatePercent}%; average: ${summary.averageEstimateMinPercent}-${summary.averageEstimateMaxPercent}%`,
    ...(summary.sourceEstimates.length === 0
      ? ["- Source estimates: none"]
      : summary.sourceEstimates.map((item) => `- ${item.upstreamRepository}: ${item.estimateText} (${item.mainGaps})`))
  ];
}

function markdownOperatorHandoffSummary(summary) {
  if (!summary) {
    return ["- Operator handoff summary unavailable."];
  }
  return [
    `- Source: ${summary.source}`,
    `- Status: ${summary.status}`,
    `- Safe to share: ${summary.safeToShareWithOperators}; release evidence: ${summary.releaseEvidence}`,
    `- Inputs: ${summary.requiredInputCount}; missing/blocked: ${summary.missingOrBlockedInputCount}; pending after paid: ${summary.pendingAfterPaidRunCount}`,
    `- Operator files: ${summary.operatorInputFileCount}; drafts/templates: ${summary.draftFileCount}; report archives: ${summary.reportArchiveFileCount}`,
    `- Commands: ${summary.commandCount}; ready: ${summary.readyCommandCount}; paid commands: ${summary.paidCommandCount}`,
    `- Blocked input IDs: ${summary.blockedInputIds.length === 0 ? "none" : summary.blockedInputIds.join(", ")}`,
    ...(summary.operatorInputFiles.length === 0
      ? ["- Operator input files: none"]
      : summary.operatorInputFiles.map((item) => `- Operator input: ${item}`))
  ];
}

function markdownEvidenceClosurePlan(plan) {
  if (!plan) {
    return ["- Evidence closure plan unavailable."];
  }
  return [
    `- Status: ${plan.status}`,
    `- Blockers: ${plan.blockerCount}; code actions: ${plan.codeActionCount}; external/paid actions: ${plan.externalOrPaidActionCount}; paid dependencies: ${plan.paidDependencyCount}`,
    ...plan.phases.map((phase) => {
      const commands = phase.commands.length === 0 ? "no direct command" : phase.commands.join(" | ");
      const blockers = phase.blockerIds.length === 0 ? "no blocker ids" : phase.blockerIds.join(", ");
      const gaps = phase.productGapIds.length === 0 ? "no product gaps" : phase.productGapIds.join(", ");
      const inputs = phase.requiredInputIds.length === 0 ? "no operator inputs" : phase.requiredInputIds.join(", ");
      const env = phase.envVars.length === 0 ? "no env placeholders" : phase.envVars.join(", ");
      const files = [...phase.operatorInputFiles, ...phase.draftFiles, ...phase.reportArchiveFiles];
      const packet = files.length === 0 ? "no operator packet files" : files.join(", ");
      const guards = phase.commandGuards.length === 0
        ? "no command guards"
        : phase.commandGuards.map((item) => guardSummary(item)).join(" | ");
      const localPrep = phase.localPreparationCommands.length === 0
        ? "no local prep command"
        : phase.localPreparationCommands.map((item) => `${item.name}: ${item.command}`).join(" | ");
      const readiness = phase.executionReadiness
        ? `${phase.executionReadiness.status}/${phase.executionReadiness.canAttemptNow ? "can-attempt" : "cannot-attempt"} (${phase.executionReadiness.blockingReasonCount} blockers)`
        : "readiness unavailable";
      return `- ${phase.order}. ${phase.label}: ${phase.status}; readiness: ${readiness}; blockers: ${blockers}; product gaps: ${gaps}; inputs: ${inputs}; env: ${env}; files: ${packet}; guards: ${guards}; local prep: ${localPrep}; commands: ${commands}`;
    })
  ];
}

function guardSummary(item) {
  const flags = [
    item.requiresLiveNetwork ? "live-network" : undefined,
    item.requiresProviderSpend ? "provider-spend" : undefined,
    item.requiresOperatorConfirmation ? "confirmation" : undefined,
    item.requiresManualReview ? "manual-review" : undefined,
    item.containsPlaceholder ? "placeholder" : undefined
  ].filter(Boolean);
  return `${item.source}:${item.runnable ? "runnable" : "blocked"}:${flags.length === 0 ? "no-extra-guard" : flags.join("+")}`;
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
