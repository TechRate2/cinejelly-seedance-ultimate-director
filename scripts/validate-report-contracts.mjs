import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json",
  maxIssuesPerContract: 20,
  allowLaunchDoctorInProgress: false
};

const defaultContracts = [
  contract("phase6_release_audit", "schemas/phase6-release-audit-report.schema.json", "assets/output_deliverables/phase6-validation/release-audit-report.json"),
  contract("phase6_paid_render", "schemas/phase6-paid-render-validation-report.schema.json", "assets/output_deliverables/phase6-validation/paid-render-report.json"),
  contract("business_readiness_audit", "schemas/business-readiness-audit-report.schema.json", "assets/output_deliverables/phase6-validation/business-readiness-report.json"),
  contract("business_readiness_plan", "schemas/business-readiness-validation-plan.schema.json", "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json"),
  contract("live_readiness_inputs", "schemas/live-readiness-inputs-report.schema.json", "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json"),
  contract("deployment_package_validation", "schemas/deployment-package-validation-report.schema.json", "assets/output_deliverables/business-readiness/deployment-package-validation-report.json"),
  contract("deployment_readiness_capture", "schemas/deployment-readiness-capture-report.schema.json", "assets/output_deliverables/business-readiness/deployment-preflight-report.json"),
  contract("local_deployment_capture_smoke", "schemas/deployment-readiness-capture-report.schema.json", "assets/output_deliverables/business-readiness/local-deployment-capture-smoke.json"),
  contract("render_job_history_smoke", "schemas/render-job-history-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-job-history-smoke-report.json"),
  contract("render_provider_reconciliation", "schemas/render-provider-reconciliation-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json"),
  contract("render_provider_handoff", "schemas/render-provider-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-handoff-report.json"),
  contract("render_provider_external_lease", "schemas/render-provider-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json"),
  contract("render_provider_lease_service_smoke", "schemas/render-provider-lease-service-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json"),
  contract("render_provider_handoff_action_ledger", "schemas/render-provider-handoff-action-ledger-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json"),
  contract("render_provider_multi_worker_handoff", "schemas/render-provider-multi-worker-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json"),
  contract("render_provider_production_handoff", "schemas/render-provider-production-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json"),
  contract("snapshot_parity_audit", "schemas/snapshot-parity-audit-report.schema.json", "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json"),
  contract("atlas_billing_readiness", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json"),
  contract("atlas_billing_generated_audio_smoke", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json"),
  contract("commercial_launch_intake", "schemas/commercial-launch-intake-validation-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json"),
  contract("commercial_launch_doctor", "schemas/commercial-launch-doctor-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json"),
  contract("commercial_launch_inputs", "schemas/commercial-launch-inputs-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json"),
  contract("business_completion_audit", "schemas/business-completion-audit-report.schema.json", "assets/output_deliverables/business-readiness/business-completion-audit-report.json"),
  contract("ops_config_validation", "schemas/business-readiness-ops-config-validation-report.schema.json", "assets/output_deliverables/business-readiness/ops-config-validation-report.json"),
  contract("long_form_validation", "schemas/long-form-validation-report.schema.json", "assets/output_deliverables/business-readiness/long-form-validation-report.json"),
  contract("source_video_validation", "schemas/source-video-auto-analysis-validation-report.schema.json", "assets/output_deliverables/business-readiness/source-video-validation-report.json"),
  contract("remote_stock_validation", "schemas/remote-stock-validation-report.schema.json", "assets/output_deliverables/business-readiness/remote-stock-validation-report.json"),
  contract("generated_audio_validation", "schemas/generated-audio-validation-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-validation-report.json"),
  contract("director_style_semantic_review", "schemas/director-style-semantic-review.schema.json", "assets/output_deliverables/business-readiness/director-style-semantic-review.json"),
  contract("director_style_audio_review", "schemas/director-style-audio-review.schema.json", "assets/output_deliverables/business-readiness/director-style-audio-review.json"),
  contract("director_style_runtime_review", "schemas/director-style-runtime-review.schema.json", "assets/output_deliverables/business-readiness/director-style-runtime-review.json"),
  contract("director_style_benchmark", "schemas/director-style-benchmark-report.schema.json", "assets/output_deliverables/business-readiness/director-style-benchmark-report.json"),
  contract("billing_admin_ops", "schemas/billing-admin-ops-report.schema.json", "assets/output_deliverables/business-readiness/billing-admin-ops-report.json"),
  contract("production_operations", "schemas/production-operations-report.schema.json", "assets/output_deliverables/business-readiness/production-operations-report.json"),
  contract("report_contract_validation", "schemas/report-contract-validation-report.schema.json", "assets/output_deliverables/business-readiness/report-contract-validation-report.json")
];

function contract(name, schemaPath, reportPath) {
  return { name, schemaPath, reportPath, required: false };
}

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    contracts: [...defaultContracts]
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--max-issues-per-contract", "maxIssuesPerContract"]
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
    if (arg === "--allow-launch-doctor-in-progress") {
      options.allowLaunchDoctorInProgress = true;
      continue;
    }
    if (arg === "--contract") {
      const value = readRequiredValue(args, index, arg);
      options.contracts.push(parseContractValue(value, true));
      index += 1;
      continue;
    }
    if (arg.startsWith("--contract=")) {
      options.contracts.push(parseContractValue(arg.slice("--contract=".length), true));
      continue;
    }
    if (arg === "--only-contract") {
      const value = readRequiredValue(args, index, arg);
      options.contracts = [parseContractValue(value, true)];
      index += 1;
      continue;
    }
    if (arg.startsWith("--only-contract=")) {
      options.contracts = [parseContractValue(arg.slice("--only-contract=".length), true)];
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = key === "maxIssuesPerContract" ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function parseContractValue(value, required) {
  const parts = String(value).split("=");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("--contract must use name:schemaPath=reportPath or schemaPath=reportPath.");
  }
  const [left, reportPath] = parts;
  const colonIndex = left.indexOf(":");
  const name = colonIndex >= 0 ? left.slice(0, colonIndex) : basenameWithoutJson(left);
  const schemaPath = colonIndex >= 0 ? left.slice(colonIndex + 1) : left;
  return { name, schemaPath, reportPath, required };
}

function basenameWithoutJson(path) {
  return String(path).split(/[\\/]/).pop()?.replace(/\.schema\.json$/i, "").replace(/\.json$/i, "") || "custom_contract";
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Validate generated CineJelly JSON reports against local JSON schema contracts without network calls.

Usage:
  npm.cmd run validation:report-contracts
  npm.cmd run validation:report-contracts -- --only-contract live:schemas/live-readiness-inputs-report.schema.json=assets/output_deliverables/business-readiness/live-readiness-inputs-report.json

Options:
  --contract <name:schema=report>          Add a required custom contract.
  --only-contract <name:schema=report>     Validate only one required custom contract.
  --max-issues-per-contract <count>        Default: ${defaults.maxIssuesPerContract}
  --output <path>                          JSON report path. Default: ${defaults.outputPath}
  --no-output                              Print only; do not write the report.

Default contracts are skipped when their report file is absent. Custom contracts are required. This command performs no provider calls, no deployment calls, no render work, and no paid validation.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const contracts = options.contracts.map((item) => validateContract(item, options));
  const status = statusForContracts(contracts);
  const report = {
    schemaVersion: "cinejelly.report-contract-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    checkedInputs: {
      contractCount: contracts.length,
      outputPath: toRepoRelative(options.outputPath),
      maxIssuesPerContract: options.maxIssuesPerContract,
      allowLaunchDoctorInProgress: options.allowLaunchDoctorInProgress
    },
    summary: {
      passed: contracts.filter((item) => item.status === "pass").length,
      failed: contracts.filter((item) => item.status === "fail").length,
      skipped: contracts.filter((item) => item.status === "skipped").length
    },
    contracts,
    releaseGateSummary: {
      reportContractsPass: status === "pass",
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Report contracts pass; this is schema/semantic contract evidence only, not commercial release approval."
        : "One or more generated reports do not match their local schema or semantic contract."
    },
    nextActions: nextActionsFor(contracts)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (!Number.isSafeInteger(options.maxIssuesPerContract) || options.maxIssuesPerContract < 1 || options.maxIssuesPerContract > 200) {
    throw new Error("--max-issues-per-contract must be an integer from 1 to 200.");
  }
}

function validateContract(item, options) {
  const schemaRead = readJsonFile(item.schemaPath);
  const reportRead = readJsonFile(item.reportPath);
  if (!schemaRead.exists) {
    return failContract(item, [`Missing schema file at ${toRepoRelative(item.schemaPath)}.`]);
  }
  if (schemaRead.error) {
    return failContract(item, [`Schema JSON is invalid: ${schemaRead.error}.`]);
  }
  if (!reportRead.exists) {
    if (item.required) {
      return failContract(item, [`Missing report file at ${toRepoRelative(item.reportPath)}.`]);
    }
    return {
      name: item.name,
      status: "skipped",
      schemaPath: toRepoRelative(item.schemaPath),
      reportPath: toRepoRelative(item.reportPath),
      message: "Report file is absent; default optional contract skipped.",
      issueCount: 0,
      issues: []
    };
  }
  if (reportRead.error) {
    return failContract(item, [`Report JSON is invalid: ${reportRead.error}.`]);
  }
  const issues = [
    ...validateAgainstSchema(schemaRead.value, reportRead.value, "$", schemaRead.value),
    ...validateSemanticContract(item, reportRead.value, options)
  ].slice(0, options.maxIssuesPerContract);
  return {
    name: item.name,
    status: issues.length === 0 ? "pass" : "fail",
    schemaPath: toRepoRelative(item.schemaPath),
    reportPath: toRepoRelative(item.reportPath),
    schemaVersion: typeof reportRead.value?.schemaVersion === "string" ? reportRead.value.schemaVersion : undefined,
    reportStatus: typeof reportRead.value?.status === "string" ? reportRead.value.status : undefined,
    issueCount: issues.length,
    issues,
    message: issues.length === 0 ? "Report matches schema and semantic contract." : "Report does not match schema or semantic contract."
  };
}

function failContract(item, issues) {
  return {
    name: item.name,
    status: "fail",
    schemaPath: toRepoRelative(item.schemaPath),
    reportPath: toRepoRelative(item.reportPath),
    issueCount: issues.length,
    issues,
    message: "Contract cannot be validated."
  };
}

function validateSemanticContract(item, report, options) {
  if (item.name === "snapshot_parity_audit") {
    return validateSnapshotParityAuditSemantics(report);
  }
  if (item.name === "commercial_launch_doctor") {
    return validateCommercialLaunchDoctorSemantics(report, {
      allowInProgress: options.allowLaunchDoctorInProgress
    });
  }
  if (item.name === "commercial_launch_inputs") {
    return validateCommercialLaunchInputsSemantics(report);
  }
  if (item.name === "business_readiness_audit") {
    return validateBusinessReadinessAuditSemantics(report);
  }
  if (item.name === "business_readiness_plan") {
    return validateBusinessReadinessPlanSemantics(report);
  }
  if (item.name === "business_completion_audit") {
    return validateBusinessCompletionAuditSemantics(report);
  }
  if (item.name === "director_style_benchmark") {
    return validateDirectorStyleBenchmarkSemantics(report);
  }
  if (item.name === "render_provider_handoff_action_ledger") {
    return validateRenderProviderHandoffActionLedgerSemantics(report);
  }
  return [];
}

const LAUNCH_DOCTOR_BASE_COMMANDS = [
  "build",
  "deployment_package",
  "snapshot_parity",
  "release_audit",
  "quality_benchmark",
  "launch_intake",
  "live_inputs",
  "business_plan",
  "commercial_inputs",
  "completion_audit",
  "business_readiness"
];

const LAUNCH_DOCTOR_FINAL_COMMANDS = [
  ...LAUNCH_DOCTOR_BASE_COMMANDS,
  "report_contracts",
  "completion_audit_after_contracts",
  "report_contracts_final"
];

const LAUNCH_DOCTOR_PROVIDER_COMMANDS = [
  ["provider_reconciliation", "providerReconciliationStatus"],
  ["provider_handoff", "providerHandoffStatus"],
  ["provider_external_lease", "providerExternalLeaseStatus"],
  ["provider_lease_service", "providerLeaseServiceStatus"],
  ["provider_handoff_actions", "providerHandoffActionsStatus"],
  ["provider_multi_worker_handoff", "providerMultiWorkerHandoffStatus"]
];

function validateCommercialLaunchDoctorSemantics(report, options = {}) {
  const issues = [];
  const commandRuns = Array.isArray(report?.commandRuns) ? report.commandRuns : [];
  const commandByName = new Map(commandRuns.map((item) => [item?.name, item]));
  const requiredCommands = options.allowInProgress ? LAUNCH_DOCTOR_BASE_COMMANDS : LAUNCH_DOCTOR_FINAL_COMMANDS;
  for (const commandName of requiredCommands) {
    if (!commandByName.has(commandName)) {
      issues.push(`$.commandRuns: expected launch doctor command '${commandName}'.`);
    }
  }
  if (report?.checkedInputs?.skipLocalSmoke !== true && !commandByName.has("local_smoke")) {
    issues.push("$.commandRuns: expected local_smoke when checkedInputs.skipLocalSmoke is false.");
  }

  const qualityRun = commandByName.get("quality_benchmark");
  if (qualityRun?.status !== "pass") {
    issues.push("$.commandRuns[quality_benchmark].status: expected pass for no-spend quality benchmark command.");
  }
  if (["missing", "skipped", undefined].includes(report?.readinessSnapshot?.qualityBenchmarkStatus)) {
    issues.push("$.readinessSnapshot.qualityBenchmarkStatus: expected a refreshed benchmark status, not missing/skipped.");
  }

  const snapshotRun = commandByName.get("snapshot_parity");
  if (snapshotRun?.status !== "pass") {
    issues.push("$.commandRuns[snapshot_parity].status: expected pass for snapshot parity guardrail command.");
  }
  if (report?.readinessSnapshot?.snapshotParityStatus !== "pass") {
    issues.push("$.readinessSnapshot.snapshotParityStatus: expected pass after refreshing snapshot parity guardrails.");
  }
  if (report?.codeWorkSummary?.snapshotParityPass !== true) {
    issues.push("$.codeWorkSummary.snapshotParityPass: expected true after refreshing snapshot parity guardrails.");
  }

  const reportContractsRun = commandByName.get("report_contracts");
  if (reportContractsRun && reportContractsRun.status !== "pass") {
    issues.push("$.commandRuns[report_contracts].status: expected pass for report-contract validation.");
  }
  const completionAfterContractsRun = commandByName.get("completion_audit_after_contracts");
  if (completionAfterContractsRun && completionAfterContractsRun.status !== "pass") {
    issues.push("$.commandRuns[completion_audit_after_contracts].status: expected pass for post-contract completion-audit refresh.");
  }
  const finalContractsRun = commandByName.get("report_contracts_final");
  if (!options.allowInProgress || finalContractsRun) {
    if (finalContractsRun?.status !== "pass") {
      issues.push("$.commandRuns[report_contracts_final].status: expected pass for final report-contract validation.");
    }
    if (report?.readinessSnapshot?.reportContractsStatus !== "pass") {
      issues.push("$.readinessSnapshot.reportContractsStatus: expected pass after final report-contract validation.");
    }
  }

  if (report?.checkedInputs?.skipProviderHandoffSmokes === true) {
    for (const [commandName, statusKey] of LAUNCH_DOCTOR_PROVIDER_COMMANDS) {
      if (commandByName.has(commandName)) {
        issues.push(`$.commandRuns: did not expect '${commandName}' when checkedInputs.skipProviderHandoffSmokes is true.`);
      }
      if (report?.readinessSnapshot?.[statusKey] !== "skipped") {
        issues.push(`$.readinessSnapshot.${statusKey}: expected skipped when provider handoff smokes are skipped.`);
      }
    }
  } else {
    for (const [commandName, statusKey] of LAUNCH_DOCTOR_PROVIDER_COMMANDS) {
      const run = commandByName.get(commandName);
      if (!run) {
        issues.push(`$.commandRuns: expected provider handoff command '${commandName}'.`);
        continue;
      }
      if (run.status !== "pass") {
        issues.push(`$.commandRuns[${commandName}].status: expected pass for provider handoff smoke command.`);
      }
      const status = report?.readinessSnapshot?.[statusKey];
      if (!["pass", "warn"].includes(status)) {
        issues.push(`$.readinessSnapshot.${statusKey}: expected pass or warn for refreshed provider handoff smoke evidence.`);
      }
    }
  }

  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic === true && report?.status !== "ready_for_customer_traffic") {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: true is only allowed when launch doctor status is ready_for_customer_traffic.");
  }
  const unexpectedFailures = Array.isArray(report?.codeWorkSummary?.unexpectedCodeCommandFailures)
    ? report.codeWorkSummary.unexpectedCodeCommandFailures
    : [];
  if (Number(report?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0) === 0 && unexpectedFailures.length > 0) {
    issues.push("$.codeWorkSummary: unexpectedCodeCommandFailures must be empty when knownCodeBlockingIssueCount is 0.");
  }
  return issues;
}

function validateSnapshotParityAuditSemantics(report) {
  const issues = [];
  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for snapshot parity guardrail evidence.");
  }
  if (report?.summary?.snapshotDirectoriesPresent !== report?.summary?.expectedSnapshotCount) {
    issues.push("$.summary.snapshotDirectoriesPresent: expected all configured snapshot directories to be present.");
  }
  if (report?.summary?.inventoryCoverageCount !== report?.summary?.expectedSnapshotCount) {
    issues.push("$.summary.inventoryCoverageCount: expected every configured snapshot to be covered by inventory docs.");
  }
  if (report?.summary?.sourceLineageCoverageCount !== report?.summary?.expectedSnapshotCount) {
    issues.push("$.summary.sourceLineageCoverageCount: expected every configured snapshot to have source-lineage coverage.");
  }
  if (Number(report?.summary?.directExternalImportFindingCount ?? 0) !== 0) {
    issues.push("$.summary.directExternalImportFindingCount: expected zero direct imports from external/upstream.");
  }
  if (Number(report?.summary?.failedChecks ?? 0) !== 0) {
    issues.push("$.summary.failedChecks: expected zero failed snapshot parity checks.");
  }
  if (report?.releaseGateSummary?.snapshotGuardrailsPass !== true) {
    issues.push("$.releaseGateSummary.snapshotGuardrailsPass: expected true for passing snapshot guardrails.");
  }
  if (report?.releaseGateSummary?.canClaimFullSnapshotParity !== false) {
    issues.push("$.releaseGateSummary.canClaimFullSnapshotParity: expected false; guardrails do not prove full upstream parity.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; snapshot guardrails are not commercial release approval.");
  }
  const failedSnapshots = Array.isArray(report?.snapshotInventory)
    ? report.snapshotInventory.filter((item) => item?.status !== "pass")
    : [];
  if (failedSnapshots.length > 0) {
    issues.push(`$.snapshotInventory: expected all snapshots to pass guardrails, found ${failedSnapshots.length} non-pass item(s).`);
  }
  const directImports = Array.isArray(report?.directExternalImports) ? report.directExternalImports : [];
  if (directImports.length > 0) {
    issues.push(`$.directExternalImports: expected zero direct external import findings, found ${directImports.length}.`);
  }
  return issues;
}

function validateBusinessCompletionAuditSemantics(report) {
  const issues = [];
  const blockers = Array.isArray(report?.blockers) ? report.blockers : [];
  const productCodeGaps = Array.isArray(report?.productCodeGaps) ? report.productCodeGaps : [];
  const codeBlockers = blockers.filter((item) => item?.owner === "codebase");
  const automatableBlockers = blockers.filter((item) => item?.canAutomateNow === true);
  const externalOrPaidBlockers = blockers.filter((item) => item?.canAutomateNow !== true);
  const automatableProductGaps = productCodeGaps.filter((item) => item?.canAutomateNow === true);
  const blocksFullSnapshotParity = productCodeGaps.some((item) => item?.blocksFullSnapshotParity === true);
  const blocksApiCliCommercialLaunch = productCodeGaps.some((item) => item?.blocksApiCliCommercialLaunch === true);

  if (Number(report?.codeWorkSummary?.knownCodeBlockingIssueCount ?? -1) !== codeBlockers.length) {
    issues.push("$.codeWorkSummary.knownCodeBlockingIssueCount: expected to equal codebase-owned blocker count.");
  }
  if (Number(report?.codeWorkSummary?.knownProductCodeGapCount ?? -1) !== productCodeGaps.length) {
    issues.push("$.codeWorkSummary.knownProductCodeGapCount: expected to equal productCodeGaps length.");
  }
  if (Number(report?.codeWorkSummary?.automatableProductCodeGapCount ?? -1) !== automatableProductGaps.length) {
    issues.push("$.codeWorkSummary.automatableProductCodeGapCount: expected to equal automatable product-code gap count.");
  }
  if (report?.codeWorkSummary?.blocksFullSnapshotParity !== blocksFullSnapshotParity) {
    issues.push("$.codeWorkSummary.blocksFullSnapshotParity: expected to match productCodeGaps[*].blocksFullSnapshotParity.");
  }
  if (report?.codeWorkSummary?.blocksApiCliCommercialLaunch !== blocksApiCliCommercialLaunch) {
    issues.push("$.codeWorkSummary.blocksApiCliCommercialLaunch: expected to match productCodeGaps[*].blocksApiCliCommercialLaunch.");
  }

  if (Number(report?.blockerSummary?.total ?? -1) !== blockers.length) {
    issues.push("$.blockerSummary.total: expected to equal blockers length.");
  }
  if (Number(report?.blockerSummary?.automatableNow ?? -1) !== automatableBlockers.length) {
    issues.push("$.blockerSummary.automatableNow: expected to equal blockers with canAutomateNow=true.");
  }
  if (Number(report?.blockerSummary?.externalOrPaid ?? -1) !== externalOrPaidBlockers.length) {
    issues.push("$.blockerSummary.externalOrPaid: expected to equal blockers with canAutomateNow=false.");
  }
  issues.push(...compareCountMap("$.blockerSummary.byOwner", report?.blockerSummary?.byOwner, countBy(blockers, "owner")));
  issues.push(...compareCountMap("$.blockerSummary.byCategory", report?.blockerSummary?.byCategory, countBy(blockers, "category")));

  const readyPaidGateCount = Array.isArray(report?.readinessSnapshot?.readyPaidGates)
    ? report.readinessSnapshot.readyPaidGates.length
    : 0;
  if (Number(report?.readinessSnapshot?.readyPaidGateCount ?? -1) !== readyPaidGateCount) {
    issues.push("$.readinessSnapshot.readyPaidGateCount: expected to equal readinessSnapshot.readyPaidGates length.");
  }
  const releaseReadyPaidGateCount = Array.isArray(report?.releaseGateSummary?.readyPaidGates)
    ? report.releaseGateSummary.readyPaidGates.length
    : 0;
  if (Number(report?.releaseGateSummary?.readyPaidGateCount ?? -1) !== releaseReadyPaidGateCount) {
    issues.push("$.releaseGateSummary.readyPaidGateCount: expected to equal releaseGateSummary.readyPaidGates length.");
  }
  if (Number(report?.releaseGateSummary?.productCodeGapCount ?? -1) !== productCodeGaps.length) {
    issues.push("$.releaseGateSummary.productCodeGapCount: expected to equal productCodeGaps length.");
  }

  if (report?.codeWorkSummary?.snapshotParityPass !== (report?.readinessSnapshot?.snapshotParityStatus === "pass")) {
    issues.push("$.codeWorkSummary.snapshotParityPass: expected to match readinessSnapshot.snapshotParityStatus === 'pass'.");
  }
  if (report?.codeWorkSummary?.reportContractsPass !== (report?.readinessSnapshot?.reportContractsStatus === "pass")) {
    issues.push("$.codeWorkSummary.reportContractsPass: expected to match readinessSnapshot.reportContractsStatus === 'pass'.");
  }
  if (report?.codeWorkSummary?.releaseAuditReady !== (report?.readinessSnapshot?.releaseAuditStatus === "release_ready")) {
    issues.push("$.codeWorkSummary.releaseAuditReady: expected to match readinessSnapshot.releaseAuditStatus === 'release_ready'.");
  }
  if (report?.codeWorkSummary?.commercialCommandPlanPass !== (report?.readinessSnapshot?.commandPlanAuditStatus === "pass")) {
    issues.push("$.codeWorkSummary.commercialCommandPlanPass: expected to match readinessSnapshot.commandPlanAuditStatus === 'pass'.");
  }

  const expectedCanClaimFullSnapshotParity = blocksFullSnapshotParity !== true;
  if (report?.releaseGateSummary?.canClaimFullSnapshotParity !== expectedCanClaimFullSnapshotParity) {
    issues.push("$.releaseGateSummary.canClaimFullSnapshotParity: expected to be false while product-code gaps block full snapshot parity.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic === true && report?.status !== "ready_for_customer_traffic") {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: true is only allowed when completion audit status is ready_for_customer_traffic.");
  }
  if (report?.status === "ready_for_customer_traffic" && report?.releaseGateSummary?.canReleaseToCustomerTraffic !== true) {
    issues.push("$.status: ready_for_customer_traffic requires releaseGateSummary.canReleaseToCustomerTraffic=true.");
  }
  if (report?.releaseGateSummary?.safeToRunFullPaidAtlasSequenceNow === true) {
    if (report?.releaseGateSummary?.canRunFullKnownPaidSequence !== true) {
      issues.push("$.releaseGateSummary.safeToRunFullPaidAtlasSequenceNow: true requires canRunFullKnownPaidSequence=true.");
    }
    if (Number(report?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0) !== 0) {
      issues.push("$.releaseGateSummary.safeToRunFullPaidAtlasSequenceNow: true requires zero known code blockers.");
    }
  }
  return issues;
}

function validateBusinessReadinessAuditSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const totalWeight = checks.reduce((sum, check) => sum + Number(check?.weight ?? 0), 0);
  const completedWeight = checks.reduce((sum, check) => {
    const weight = Number(check?.weight ?? 0);
    if (check?.status === "pass") {
      return sum + weight;
    }
    if (check?.status === "warn") {
      return sum + weight / 2;
    }
    return sum;
  }, 0);
  const expectedEvidenceCompletionPercent = totalWeight > 0
    ? Math.round((completedWeight / totalWeight) * 100)
    : 0;

  if (Number(report?.completion?.totalWeight ?? -1) !== totalWeight) {
    issues.push("$.completion.totalWeight: expected to equal the sum of checks[*].weight.");
  }
  if (Number(report?.completion?.completedWeight ?? -1) !== completedWeight) {
    issues.push("$.completion.completedWeight: expected to match pass/warn weighted check completion.");
  }
  if (Number(report?.completion?.evidenceCompletionPercent ?? -1) !== expectedEvidenceCompletionPercent) {
    issues.push("$.completion.evidenceCompletionPercent: expected to match rounded completedWeight/totalWeight.");
  }

  const expectedStatus = businessReadinessStatusForChecks(checks);
  if (report?.status !== expectedStatus) {
    issues.push(`$.status: expected ${expectedStatus} from checks[*].status.`);
  }

  const readyPaidGateCount = Array.isArray(report?.releaseGateSummary?.readyPaidGates)
    ? report.releaseGateSummary.readyPaidGates.length
    : 0;
  if (Number(report?.releaseGateSummary?.readyPaidGateCount ?? -1) !== readyPaidGateCount) {
    issues.push("$.releaseGateSummary.readyPaidGateCount: expected to equal releaseGateSummary.readyPaidGates length.");
  }

  const canRunAdditionalPaidValidation = [
    "release_audit_and_source_hygiene",
    "short_paid_render_and_artifacts",
    "manual_short_media_redaction_review",
    "atlas_billing_readiness"
  ].every((name) => findCheckStatus(checks, name) === "pass");
  if (report?.releaseGateSummary?.canRunAdditionalPaidValidation !== canRunAdditionalPaidValidation) {
    issues.push("$.releaseGateSummary.canRunAdditionalPaidValidation: expected to match required release/short-render/manual-review/Atlas-billing pass checks.");
  }
  if (report?.releaseGateSummary?.canRunLongFormValidation !== canRunAdditionalPaidValidation) {
    issues.push("$.releaseGateSummary.canRunLongFormValidation: expected to match canRunAdditionalPaidValidation.");
  }

  const expectedCanReleaseToCustomerTraffic = expectedStatus === "ready_for_limited_customer_traffic";
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== expectedCanReleaseToCustomerTraffic) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected to be true only when all business-readiness checks pass.");
  }
  if (expectedCanReleaseToCustomerTraffic) {
    if (Number(report?.completion?.evidenceCompletionPercent ?? 0) !== 100) {
      issues.push("$.completion.evidenceCompletionPercent: customer traffic readiness requires 100 percent evidence completion.");
    }
    if (typeof report?.releaseGateSummary?.releaseBlocker === "string") {
      issues.push("$.releaseGateSummary.releaseBlocker: expected no release blocker when customer traffic is ready.");
    }
  } else if (typeof report?.releaseGateSummary?.releaseBlocker !== "string" || report.releaseGateSummary.releaseBlocker.length === 0) {
    issues.push("$.releaseGateSummary.releaseBlocker: expected a clear blocker unless customer traffic is ready.");
  }

  const hasFailingChecks = checks.some((check) => check?.status === "fail");
  if (hasFailingChecks && report?.releaseGateSummary?.canReleaseToCustomerTraffic === true) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: cannot be true while any check is fail.");
  }
  return issues;
}

function validateBusinessReadinessPlanSemantics(report) {
  const issues = [];
  const costPlan = report?.costPlan ?? {};
  const longForm = costPlan.longForm ?? {};
  const generatedAudio = costPlan.generatedAudio ?? {};
  const budgetSlices = costPlan.budgetConstrainedSlices ?? {};
  const slices = Array.isArray(budgetSlices.slices) ? budgetSlices.slices : [];
  const sliceByName = new Map(slices.map((slice) => [slice?.name, slice]));
  const requiredSliceNames = [
    "generated_audio_smoke",
    "long_form_120s_minimum",
    "full_business_readiness_paid_sequence",
    "source_video_auto_analysis"
  ];

  for (const name of requiredSliceNames) {
    if (!sliceByName.has(name)) {
      issues.push(`$.costPlan.budgetConstrainedSlices.slices: expected required paid slice '${name}'.`);
    }
  }

  const duplicateSliceNames = duplicateStrings(slices.map((slice) => slice?.name).filter((name) => typeof name === "string"));
  for (const name of duplicateSliceNames) {
    issues.push(`$.costPlan.budgetConstrainedSlices.slices[name=${name}]: expected unique slice name.`);
  }

  const maxBudgetUsd = numberOrUndefined(costPlan.maxBudgetUsd);
  const knownPaidEstimateUsd = numberOrUndefined(costPlan.knownPaidEstimateUsd);
  if (!moneyEquals(budgetSlices.maxBudgetUsd, maxBudgetUsd)) {
    issues.push("$.costPlan.budgetConstrainedSlices.maxBudgetUsd: expected to match costPlan.maxBudgetUsd.");
  }
  if (!moneyEquals(budgetSlices.knownPaidEstimateUsd, knownPaidEstimateUsd)) {
    issues.push("$.costPlan.budgetConstrainedSlices.knownPaidEstimateUsd: expected to match costPlan.knownPaidEstimateUsd.");
  }

  const longFormEstimateAvailable = longForm.estimateAvailable === true;
  const missingCostEstimateItems = Array.isArray(costPlan.missingCostEstimateItems)
    ? costPlan.missingCostEstimateItems
    : [];
  if (costPlan.knownPaidEstimateComplete !== (missingCostEstimateItems.length === 0)) {
    issues.push("$.costPlan.knownPaidEstimateComplete: expected to match missingCostEstimateItems length.");
  }
  if (longFormEstimateAvailable && missingCostEstimateItems.includes("long_form_paid_validation")) {
    issues.push("$.costPlan.missingCostEstimateItems: did not expect long_form_paid_validation when longForm.estimateAvailable=true.");
  }
  if (!longFormEstimateAvailable && !missingCostEstimateItems.includes("long_form_paid_validation")) {
    issues.push("$.costPlan.missingCostEstimateItems: expected long_form_paid_validation when longForm.estimateAvailable=false.");
  }

  const expectedBudgetFit = !longFormEstimateAvailable
    ? "unknown"
    : knownPaidEstimateUsd !== undefined && maxBudgetUsd !== undefined && knownPaidEstimateUsd <= maxBudgetUsd
      ? "within_budget"
      : "exceeds_budget";
  if (costPlan.budgetFit !== expectedBudgetFit) {
    issues.push(`$.costPlan.budgetFit: expected ${expectedBudgetFit} from long-form estimate availability and known paid estimate.`);
  }
  if (budgetSlices.fullKnownPaidSequenceWithinBudget !== (costPlan.budgetFit === "within_budget")) {
    issues.push("$.costPlan.budgetConstrainedSlices.fullKnownPaidSequenceWithinBudget: expected true only when costPlan.budgetFit is within_budget.");
  }

  const generatedAudioSlice = sliceByName.get("generated_audio_smoke");
  const generatedAudioEstimate = numberOrUndefined(generatedAudio.estimatedCostUsd);
  const expectedGeneratedAudioStatus = statusForEstimate(generatedAudioEstimate, maxBudgetUsd);
  if (generatedAudioSlice && generatedAudioSlice.status !== expectedGeneratedAudioStatus) {
    issues.push(`$.costPlan.budgetConstrainedSlices.slices[name=generated_audio_smoke].status: expected ${expectedGeneratedAudioStatus}.`);
  }
  if (generatedAudioSlice && !moneyEquals(generatedAudioSlice.estimatedCostUsd, generatedAudioEstimate)) {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=generated_audio_smoke].estimatedCostUsd: expected to match generatedAudio.estimatedCostUsd.");
  }

  const longFormSlice = sliceByName.get("long_form_120s_minimum");
  const longFormEstimate = numberOrUndefined(longForm.estimatedCostUsd);
  const expectedLongFormStatus = longFormEstimateAvailable ? statusForEstimate(longFormEstimate, maxBudgetUsd) : "unknown_cost";
  if (longFormSlice && longFormSlice.status !== expectedLongFormStatus) {
    issues.push(`$.costPlan.budgetConstrainedSlices.slices[name=long_form_120s_minimum].status: expected ${expectedLongFormStatus}.`);
  }
  if (longFormEstimateAvailable && longFormSlice && !moneyEquals(longFormSlice.estimatedCostUsd, longFormEstimate)) {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=long_form_120s_minimum].estimatedCostUsd: expected to match longForm.estimatedCostUsd.");
  }
  if (!longFormEstimateAvailable && longFormSlice && "estimatedCostUsd" in longFormSlice) {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=long_form_120s_minimum].estimatedCostUsd: expected absent when long-form estimate is unavailable.");
  }

  const fullSequenceSlice = sliceByName.get("full_business_readiness_paid_sequence");
  const expectedFullSequenceStatus = costPlan.budgetFit === "unknown"
    ? "unknown_cost"
    : costPlan.budgetFit === "within_budget"
      ? "within_budget"
      : "blocked_by_budget";
  if (fullSequenceSlice && fullSequenceSlice.status !== expectedFullSequenceStatus) {
    issues.push(`$.costPlan.budgetConstrainedSlices.slices[name=full_business_readiness_paid_sequence].status: expected ${expectedFullSequenceStatus}.`);
  }
  if (costPlan.budgetFit === "unknown" && fullSequenceSlice && "estimatedCostUsd" in fullSequenceSlice) {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=full_business_readiness_paid_sequence].estimatedCostUsd: expected absent when full sequence estimate is incomplete.");
  }
  if (costPlan.budgetFit !== "unknown" && fullSequenceSlice && !moneyEquals(fullSequenceSlice.estimatedCostUsd, knownPaidEstimateUsd)) {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=full_business_readiness_paid_sequence].estimatedCostUsd: expected to match knownPaidEstimateUsd when estimate is complete.");
  }

  const sourceVideoSlice = sliceByName.get("source_video_auto_analysis");
  if (sourceVideoSlice && sourceVideoSlice.status !== "unknown_cost") {
    issues.push("$.costPlan.budgetConstrainedSlices.slices[name=source_video_auto_analysis].status: expected unknown_cost until operator approves a source-video LLM budget.");
  }

  const paidSteps = Array.isArray(report?.validationSequence)
    ? report.validationSequence.filter((step) => typeof step?.kind === "string" && step.kind.startsWith("paid_"))
    : [];
  const readyPaidSteps = paidSteps.filter((step) => step?.status === "ready");
  const readyPaidGates = Array.isArray(report?.releaseGateSummary?.readyPaidGates)
    ? report.releaseGateSummary.readyPaidGates
    : [];
  if (Number(report?.releaseGateSummary?.readyPaidGateCount ?? -1) !== readyPaidGates.length) {
    issues.push("$.releaseGateSummary.readyPaidGateCount: expected to equal releaseGateSummary.readyPaidGates length.");
  }
  if (report?.releaseGateSummary?.canRunSomePaidValidationNow !== (readyPaidSteps.length > 0)) {
    issues.push("$.releaseGateSummary.canRunSomePaidValidationNow: expected to match ready paid validation steps.");
  }
  if (readyPaidGates.length !== readyPaidSteps.length || readyPaidSteps.some((step) => !readyPaidGates.includes(step.name))) {
    issues.push("$.releaseGateSummary.readyPaidGates: expected to list exactly the ready paid validation steps.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false because the business plan is no-spend planning evidence only.");
  }
  return issues;
}

function businessReadinessStatusForChecks(checks) {
  if (checks.some((check) => check?.status === "fail")) {
    return "blocked";
  }
  if (checks.some((check) => check?.status === "warn")) {
    return "review_warnings";
  }
  return "ready_for_limited_customer_traffic";
}

function findCheckStatus(checks, name) {
  return checks.find((check) => check?.name === name)?.status;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = String(item?.[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function compareCountMap(path, actual, expected) {
  const issues = [];
  const actualMap = actual && typeof actual === "object" && !Array.isArray(actual) ? actual : {};
  const keys = new Set([...Object.keys(actualMap), ...Object.keys(expected)]);
  for (const key of keys) {
    if (Number(actualMap[key] ?? 0) !== Number(expected[key] ?? 0)) {
      issues.push(`${path}.${key}: expected ${Number(expected[key] ?? 0)}, found ${Number(actualMap[key] ?? 0)}.`);
    }
  }
  return issues;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moneyEquals(left, right) {
  const normalizedLeft = numberOrUndefined(left);
  const normalizedRight = numberOrUndefined(right);
  if (normalizedLeft === undefined || normalizedRight === undefined) {
    return normalizedLeft === normalizedRight;
  }
  return Math.abs(normalizedLeft - normalizedRight) < 0.000001;
}

function statusForEstimate(estimateUsd, maxBudgetUsd) {
  if (estimateUsd === undefined || maxBudgetUsd === undefined) {
    return "unknown_cost";
  }
  return estimateUsd <= maxBudgetUsd ? "within_budget" : "blocked_by_budget";
}

function duplicateStrings(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function validateDirectorStyleBenchmarkSemantics(report) {
  const issues = [];
  if (report?.summary?.canClaimDirectorBenchParity !== false) {
    issues.push("$.summary.canClaimDirectorBenchParity: expected false for artifact-contract benchmark evidence.");
  }
  if (report?.parityEvidenceMatrix?.canClaimDirectorBenchParity !== false) {
    issues.push("$.parityEvidenceMatrix.canClaimDirectorBenchParity: expected false until every required parity evidence item is met.");
  }
  if (report?.releaseGateSummary?.canClaimDirectorBenchParity !== false) {
    issues.push("$.releaseGateSummary.canClaimDirectorBenchParity: expected false until media-level DirectorBench parity evidence exists.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; benchmark evidence is not commercial release approval.");
  }
  const requirements = Array.isArray(report?.parityEvidenceMatrix?.requirements)
    ? report.parityEvidenceMatrix.requirements
    : [];
  const metCount = requirements.filter((item) => item?.status === "met").length;
  const partialCount = requirements.filter((item) => item?.status === "partial").length;
  const missingCount = requirements.filter((item) => item?.status === "missing").length;
  const requiredForParity = requirements.filter((item) => item?.requiredForDirectorBenchParity === true);
  const requiredForParityMetCount = requiredForParity.filter((item) => item?.status === "met").length;
  if (Number(report?.parityEvidenceMatrix?.requirementCount ?? -1) !== requirements.length) {
    issues.push("$.parityEvidenceMatrix.requirementCount: expected to match requirements length.");
  }
  if (Number(report?.parityEvidenceMatrix?.metCount ?? -1) !== metCount) {
    issues.push("$.parityEvidenceMatrix.metCount: expected to match requirements with status=met.");
  }
  if (Number(report?.parityEvidenceMatrix?.partialCount ?? -1) !== partialCount) {
    issues.push("$.parityEvidenceMatrix.partialCount: expected to match requirements with status=partial.");
  }
  if (Number(report?.parityEvidenceMatrix?.missingCount ?? -1) !== missingCount) {
    issues.push("$.parityEvidenceMatrix.missingCount: expected to match requirements with status=missing.");
  }
  if (Number(report?.parityEvidenceMatrix?.requiredForParityCount ?? -1) !== requiredForParity.length) {
    issues.push("$.parityEvidenceMatrix.requiredForParityCount: expected to match requiredForDirectorBenchParity requirements.");
  }
  if (Number(report?.parityEvidenceMatrix?.requiredForParityMetCount ?? -1) !== requiredForParityMetCount) {
    issues.push("$.parityEvidenceMatrix.requiredForParityMetCount: expected to match met required-for-parity requirements.");
  }
  if (requiredForParity.length > 0 && requiredForParityMetCount === requiredForParity.length) {
    issues.push("$.parityEvidenceMatrix: expected at least one unmet required parity evidence item while canClaimDirectorBenchParity=false.");
  }
  const requirementIds = new Set();
  for (const requirement of requirements) {
    if (requirementIds.has(requirement?.id)) {
      issues.push(`$.parityEvidenceMatrix.requirements[id=${requirement?.id}]: expected unique requirement id.`);
    }
    requirementIds.add(requirement?.id);
    if (requirement?.status === "met" && Array.isArray(requirement?.missingEvidence) && requirement.missingEvidence.length > 0) {
      issues.push(`$.parityEvidenceMatrix.requirements[id=${requirement?.id}].missingEvidence: expected empty when status=met.`);
    }
    if ((requirement?.status === "missing" || requirement?.status === "partial") && (!Array.isArray(requirement?.missingEvidence) || requirement.missingEvidence.length === 0)) {
      issues.push(`$.parityEvidenceMatrix.requirements[id=${requirement?.id}].missingEvidence: expected at least one item when status is not met.`);
    }
  }
  const requirementById = new Map(requirements.map((requirement) => [requirement?.id, requirement]));
  const runtimeMetrics = Array.isArray(report?.facts?.runtimeReviewEvidence?.metrics)
    ? report.facts.runtimeReviewEvidence.metrics
    : [];
  const acceptedAsrRuntimeReview =
    report?.facts?.runtimeReviewEvidence?.status === "accepted" &&
    runtimeMetrics.some((metric) => metric?.metricName === "asr_transcript_alignment" && metric?.status === "accepted");
  const acceptedLipSyncRuntimeReview =
    report?.facts?.runtimeReviewEvidence?.status === "accepted" &&
    runtimeMetrics.some((metric) => metric?.metricName === "lip_sync_timing" && metric?.status === "accepted");
  if ((requirementById.get("asr_transcript_alignment")?.status === "met") !== acceptedAsrRuntimeReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=asr_transcript_alignment].status: expected met only with accepted runtime ASR transcript-alignment evidence.");
  }
  if ((requirementById.get("lip_sync_evidence")?.status === "met") !== acceptedLipSyncRuntimeReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=lip_sync_evidence].status: expected met only with accepted runtime lip-sync timing evidence.");
  }
  return issues;
}

function validateRenderProviderHandoffActionLedgerSemantics(report) {
  const issues = [];
  const firstApplySummary = report?.firstApply?.summary ?? {};
  const secondApplySummary = report?.secondApply?.summary ?? {};
  const firstExecutionSummary = report?.firstExecution?.summary ?? {};
  const secondExecutionSummary = report?.secondExecution?.summary ?? {};

  if (report?.providerCallsMade !== false) {
    issues.push("$.providerCallsMade: expected false for no-spend action-ledger smoke evidence.");
  }
  if (Number(report?.summary?.firstRecordedActionCount ?? -1) !== Number(firstApplySummary.recordedActionCount ?? -2)) {
    issues.push("$.summary.firstRecordedActionCount: expected to match firstApply.summary.recordedActionCount.");
  }
  if (Number(report?.summary?.secondReplayedActionCount ?? -1) !== Number(secondApplySummary.replayedActionCount ?? -2)) {
    issues.push("$.summary.secondReplayedActionCount: expected to match secondApply.summary.replayedActionCount.");
  }
  if (Number(report?.summary?.firstExecutedActionCount ?? -1) !== Number(firstExecutionSummary.executedActionCount ?? -2)) {
    issues.push("$.summary.firstExecutedActionCount: expected to match firstExecution.summary.executedActionCount.");
  }
  if (Number(report?.summary?.secondAlreadyExecutedActionCount ?? -1) !== Number(secondExecutionSummary.alreadyExecutedActionCount ?? -2)) {
    issues.push("$.summary.secondAlreadyExecutedActionCount: expected to match secondExecution.summary.alreadyExecutedActionCount.");
  }
  if (Number(report?.summary?.persistedExecutedActionCount ?? -1) !== Number(secondExecutionSummary.persistedExecutedActionCount ?? -2)) {
    issues.push("$.summary.persistedExecutedActionCount: expected to match secondExecution.summary.persistedExecutedActionCount.");
  }
  const expectedRealProviderCallCount =
    Number(firstExecutionSummary.providerCallMadeCount ?? 0) + Number(secondExecutionSummary.providerCallMadeCount ?? 0);
  if (Number(report?.summary?.realProviderCallCount ?? -1) !== expectedRealProviderCallCount) {
    issues.push("$.summary.realProviderCallCount: expected to match first/second execution providerCallMadeCount total.");
  }
  for (const path of ["firstApply", "secondApply", "firstExecution", "secondExecution"]) {
    if (report?.[path]?.releaseGateSummary?.canClaimDistributedResume !== false) {
      issues.push(`$.${path}.releaseGateSummary.canClaimDistributedResume: expected false for local no-spend handoff action evidence.`);
    }
  }
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  if (report?.status === "pass" && failedChecks.length > 0) {
    issues.push("$.checks: status pass requires zero failed checks.");
  }
  const providerCallDecisions = [
    ...(Array.isArray(report?.firstExecution?.decisions) ? report.firstExecution.decisions : []),
    ...(Array.isArray(report?.secondExecution?.decisions) ? report.secondExecution.decisions : [])
  ].filter((decision) => decision?.providerCallMade === true);
  if (providerCallDecisions.length > 0) {
    issues.push("$.firstExecution/secondExecution.decisions: expected zero real provider-call decisions in no-spend smoke evidence.");
  }
  return issues;
}

function validateCommercialLaunchInputsSemantics(report) {
  const issues = [];
  if (report?.commandPlanAudit?.status !== "pass") {
    issues.push("$.commandPlanAudit.status: expected pass before sharing commercial launch commands.");
  }
  if (Array.isArray(report?.commandPlanAudit?.issues) && report.commandPlanAudit.issues.length > 0) {
    issues.push(`$.commandPlanAudit.issues: expected no command-plan audit issues, found ${report.commandPlanAudit.issues.length}.`);
  }
  return issues;
}

function validateAgainstSchema(schema, value, path, rootSchema) {
  if (schema === true || schema === undefined) {
    return [];
  }
  if (schema === false) {
    return [`${path}: schema forbids this value.`];
  }
  if (typeof schema !== "object" || schema === null) {
    return [];
  }

  const dereferenced = resolveRef(schema, rootSchema);
  if (dereferenced !== schema) {
    return validateAgainstSchema(dereferenced, value, path, rootSchema);
  }

  const issues = [];
  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      issues.push(...validateAgainstSchema(subSchema, value, path, rootSchema));
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter((subSchema) => validateAgainstSchema(subSchema, value, path, rootSchema).length === 0);
    if (matches.length === 0) {
      issues.push(`${path}: value does not match any allowed schema.`);
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((subSchema) => validateAgainstSchema(subSchema, value, path, rootSchema).length === 0);
    if (matches.length !== 1) {
      issues.push(`${path}: value must match exactly one schema but matched ${matches.length}.`);
    }
  }
  if (schema.not && validateAgainstSchema(schema.not, value, path, rootSchema).length === 0) {
    issues.push(`${path}: value matches a forbidden schema.`);
  }
  if (schema.if && validateAgainstSchema(schema.if, value, path, rootSchema).length === 0 && schema.then) {
    issues.push(...validateAgainstSchema(schema.then, value, path, rootSchema));
  }

  if ("const" in schema && !jsonEqual(value, schema.const)) {
    issues.push(`${path}: expected constant ${JSON.stringify(schema.const)}.`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    issues.push(`${path}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}.`);
  }
  if (schema.type && !matchesType(value, schema.type)) {
    issues.push(`${path}: expected type ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}.`);
    return issues;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push(`${path}: expected number >= ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push(`${path}: expected number <= ${schema.maximum}.`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push(`${path}: expected string length >= ${schema.minLength}.`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      issues.push(`${path}: expected string length <= ${schema.maxLength}.`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${path}: string does not match pattern ${schema.pattern}.`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      issues.push(`${path}: string is not a valid date-time.`);
    }
    if (schema.format === "uri" && !isUri(value)) {
      issues.push(`${path}: string is not a valid URI.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push(`${path}: expected at least ${schema.minItems} item(s).`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push(`${path}: expected at most ${schema.maxItems} item(s).`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        issues.push(...validateAgainstSchema(schema.items, item, `${path}[${index}]`, rootSchema));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          issues.push(`${path}: missing required property ${key}.`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        issues.push(...validateAgainstSchema(propertySchema, value[key], `${path}.${escapePath(key)}`, rootSchema));
      }
    }
    const knownKeys = new Set(Object.keys(properties));
    for (const key of Object.keys(value)) {
      if (!knownKeys.has(key)) {
        if (schema.additionalProperties === false) {
          issues.push(`${path}: unexpected property ${key}.`);
        } else if (isPlainObject(schema.additionalProperties) || schema.additionalProperties === true || schema.additionalProperties === false) {
          if (isPlainObject(schema.additionalProperties)) {
            issues.push(...validateAgainstSchema(schema.additionalProperties, value[key], `${path}.${escapePath(key)}`, rootSchema));
          }
        }
      }
    }
  }
  return issues;
}

function resolveRef(schema, rootSchema) {
  if (typeof schema.$ref !== "string") {
    return schema;
  }
  if (!schema.$ref.startsWith("#/")) {
    throw new Error(`Unsupported external $ref: ${schema.$ref}`);
  }
  const parts = schema.$ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = rootSchema;
  for (const part of parts) {
    current = current?.[part];
  }
  if (current === undefined) {
    throw new Error(`Unresolvable $ref: ${schema.$ref}`);
  }
  return current;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => {
    if (item === "array") {
      return Array.isArray(value);
    }
    if (item === "object") {
      return isPlainObject(value);
    }
    if (item === "integer") {
      return Number.isInteger(value);
    }
    if (item === "number") {
      return typeof value === "number" && Number.isFinite(value);
    }
    if (item === "string") {
      return typeof value === "string";
    }
    if (item === "boolean") {
      return typeof value === "boolean";
    }
    if (item === "null") {
      return value === null;
    }
    return true;
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isUri(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol);
  } catch {
    return false;
  }
}

function escapePath(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

function statusForContracts(contracts) {
  return contracts.some((item) => item.status === "fail") ? "fail" : "pass";
}

function nextActionsFor(contracts) {
  const actions = [];
  for (const item of contracts) {
    if (item.status === "fail") {
      actions.push(`${item.name}: fix ${item.issueCount} schema/semantic contract issue(s) in ${item.reportPath}.`);
    }
  }
  if (actions.length === 0) {
    actions.push("Keep running validation:report-contracts after refreshing readiness reports and before sharing release evidence.");
  }
  return actions;
}

function readJsonFile(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return { exists: true, value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)
    ? relativePath
    : `external:${basename(path) || "input"}`;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.report-contract-validation.v1",
        generatedAt: new Date().toISOString(),
        status: "fail",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
