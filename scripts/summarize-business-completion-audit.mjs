import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/business-completion-audit-report.json",
  markdownOutputPath: "assets/output_deliverables/business-readiness/business-completion-audit.md",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  businessPlanPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  liveInputsPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json",
  commercialInputsPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
  launchIntakePath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
  releaseAuditPath: "assets/output_deliverables/phase6-validation/release-audit-report.json",
  snapshotParityPath: "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json",
  reportContractsPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json",
  commercialLaunchDoctorPath: "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    writeMarkdown: true,
    skipLaunchDoctorReport: false
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--markdown-output", "markdownOutputPath"],
    ["--business-readiness-report", "businessReadinessPath"],
    ["--business-plan-report", "businessPlanPath"],
    ["--live-inputs-report", "liveInputsPath"],
    ["--commercial-inputs-report", "commercialInputsPath"],
    ["--launch-intake-report", "launchIntakePath"],
    ["--release-audit-report", "releaseAuditPath"],
    ["--snapshot-parity-report", "snapshotParityPath"],
    ["--report-contracts-report", "reportContractsPath"],
    ["--launch-doctor-report", "commercialLaunchDoctorPath"],
    ["--ops-config-report", "opsConfigPath"]
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
    if (arg === "--skip-launch-doctor-report") {
      options.skipLaunchDoctorReport = true;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = rawValue;
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
  console.log(`Summarize CineJelly business completion and blocker ownership without network or provider calls.

Usage:
  npm.cmd run validation:completion-audit

Options:
  --business-readiness-report <path>  Default: ${defaults.businessReadinessPath}
  --business-plan-report <path>       Default: ${defaults.businessPlanPath}
  --live-inputs-report <path>         Default: ${defaults.liveInputsPath}
  --commercial-inputs-report <path>   Default: ${defaults.commercialInputsPath}
  --launch-intake-report <path>       Default: ${defaults.launchIntakePath}
  --release-audit-report <path>       Default: ${defaults.releaseAuditPath}
  --snapshot-parity-report <path>     Default: ${defaults.snapshotParityPath}
  --report-contracts-report <path>    Default: ${defaults.reportContractsPath}
  --launch-doctor-report <path>       Default: ${defaults.commercialLaunchDoctorPath}
  --ops-config-report <path>          Default: ${defaults.opsConfigPath}
  --skip-launch-doctor-report         Do not read the launch-doctor report. Used only while launch-doctor is still in progress.
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --markdown-output <path>            Markdown summary path. Default: ${defaults.markdownOutputPath}
  --no-markdown                       Do not write the Markdown summary.
  --no-output                         Print only; do not write the JSON report.

This command reads local JSON reports only. It does not call Atlas, deployment endpoints, stock providers, source URLs, FFmpeg, render routes, or billing providers.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const reports = {
    businessReadiness: summarizeReport(options.businessReadinessPath),
    businessPlan: summarizeReport(options.businessPlanPath),
    liveInputs: summarizeReport(options.liveInputsPath),
    commercialInputs: summarizeReport(options.commercialInputsPath),
    launchIntake: summarizeReport(options.launchIntakePath),
    releaseAudit: summarizeReport(options.releaseAuditPath),
    snapshotParity: summarizeReport(options.snapshotParityPath),
    reportContracts: summarizeReport(options.reportContractsPath),
    commercialLaunchDoctor: options.skipLaunchDoctorReport
      ? skippedReport(options.commercialLaunchDoctorPath, "skipped_launch_doctor_in_progress")
      : summarizeReport(options.commercialLaunchDoctorPath),
    opsConfig: summarizeReport(options.opsConfigPath)
  };
  const commercialOfferScopeSummary = buildCommercialOfferScopeSummary(reports);
  const blockers = buildBlockers(reports);
  const productCodeGaps = buildProductCodeGaps(commercialOfferScopeSummary);
  const readinessSnapshot = buildReadinessSnapshot(reports);
  const codeWorkSummary = buildCodeWorkSummary(reports, blockers, productCodeGaps);
  const operatorHandoffSummary = buildOperatorHandoffSummary(reports.commercialInputs.value);
  const snapshotParityCoverageSummary = buildSnapshotParityCoverageSummary(reports.snapshotParity.value, reports.snapshotParity);
  const evidenceClosurePlan = buildEvidenceClosurePlan(blockers, productCodeGaps, reports.commercialInputs.value);
  const status = statusFor({ reports, blockers, codeWorkSummary });
  const report = {
    schemaVersion: "cinejelly.business-completion-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      businessReadinessPath: toRepoRelative(options.businessReadinessPath),
      businessPlanPath: toRepoRelative(options.businessPlanPath),
      liveInputsPath: toRepoRelative(options.liveInputsPath),
      commercialInputsPath: toRepoRelative(options.commercialInputsPath),
      launchIntakePath: toRepoRelative(options.launchIntakePath),
      releaseAuditPath: toRepoRelative(options.releaseAuditPath),
      snapshotParityPath: toRepoRelative(options.snapshotParityPath),
      reportContractsPath: toRepoRelative(options.reportContractsPath),
      commercialLaunchDoctorPath: toRepoRelative(options.commercialLaunchDoctorPath),
      commercialLaunchDoctorSkipped: options.skipLaunchDoctorReport,
      opsConfigPath: toRepoRelative(options.opsConfigPath),
      markdownOutputPath: options.writeMarkdown ? toRepoRelative(options.markdownOutputPath) : undefined
    },
    sourceReports: summarizeSourceReports(reports),
    readinessSnapshot,
    commercialOfferScopeSummary,
    operatorHandoffSummary,
    snapshotParityCoverageSummary,
    codeWorkSummary,
    productCodeGaps,
    blockerSummary: summarizeBlockers(blockers),
    evidenceClosurePlan,
    blockers,
    releaseGateSummary: buildReleaseGateSummary({ reports, readinessSnapshot, codeWorkSummary, blockers }),
    nextActions: buildNextActions({ reports, readinessSnapshot, codeWorkSummary, blockers })
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "ready_for_customer_traffic" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (extname(options.markdownOutputPath).toLowerCase() !== ".md") {
    throw new Error("--markdown-output must point to a Markdown file.");
  }
}

function summarizeReport(path) {
  const read = readJsonIfExists(path);
  if (!read) {
    return { present: false, path: toRepoRelative(path), status: "missing" };
  }
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: typeof read.schemaVersion === "string" ? read.schemaVersion : undefined,
    status: String(read.status ?? "unknown"),
    value: read
  };
}

function skippedReport(path, status) {
  return {
    present: true,
    path: toRepoRelative(path),
    status
  };
}

function summarizeSourceReports(reports) {
  return Object.fromEntries(
    Object.entries(reports).map(([name, report]) => [
      name,
      {
        present: report.present,
        path: report.path,
        schemaVersion: report.schemaVersion,
        status: report.status
      }
    ])
  );
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

function buildReadinessSnapshot(reports) {
  const business = reports.businessReadiness.value;
  const plan = reports.businessPlan.value;
  const live = reports.liveInputs.value;
  const commercial = reports.commercialInputs.value;
  const launchDoctor = reports.commercialLaunchDoctor.value;
  const atlas = commercial?.atlasConfigurationSummary;
  const planCost = plan?.costPlan ?? {};
  const liveCost = live?.costPlan ?? {};
  const readyPaidGates = normalizeReadyPaidGates(
    commercial?.releaseGateSummary?.readyPaidGates ??
      business?.releaseGateSummary?.readyPaidGates ??
      live?.releaseGateSummary?.readyPaidGates ??
      plan?.releaseGateSummary?.readyPaidGates ??
      []
  );

  return {
    evidenceCompletionPercent: numberOrZero(business?.completion?.evidenceCompletionPercent),
    businessReadinessStatus: reports.businessReadiness.status,
    releaseAuditStatus: reports.releaseAudit.status,
    snapshotParityStatus: reports.snapshotParity.status,
    reportContractsStatus: reports.reportContracts.status,
    commercialInputsStatus: reports.commercialInputs.status,
    launchDoctorStatus: reports.commercialLaunchDoctor.status,
    opsConfigStatus: reports.opsConfig.status,
    launchDoctorKnownCodeBlockingIssueCount: numberOrZero(launchDoctor?.releaseGateSummary?.knownCodeBlockingIssueCount),
    commandPlanAuditStatus: String(commercial?.commandPlanAudit?.status ?? "unknown"),
    atlas: {
      mediaApiKeyConfigured: atlas?.keys?.mediaApiKeyConfigured === true,
      llmApiKeyConfigured: atlas?.keys?.llmApiKeyConfigured === true,
      llmFallbackAvailable: atlas?.keys?.llmFallbackAvailable === true,
      mediaReady: atlas?.readiness?.mediaReady === true,
      llmReady: atlas?.readiness?.llmReady === true,
      seedanceVideoReady: atlas?.readiness?.seedanceVideoReady === true,
      generatedAudioReady: atlas?.readiness?.generatedAudioReady === true,
      generatedAudioPaidSliceReady: atlas?.readiness?.generatedAudioPaidSliceReady === true,
      fullPaidSequenceWithinBudget: atlas?.readiness?.fullPaidSequenceWithinBudget === true
    },
    budget: {
      approvedBudgetUsd: numberOrUndefined(planCost.maxBudgetUsd ?? liveCost.maxBudgetUsd),
      knownPaidEstimateUsd: numberOrUndefined(planCost.knownPaidEstimateUsd ?? liveCost.knownPaidEstimateUsd),
      budgetFit: String(planCost.budgetFit ?? liveCost.budgetFit ?? "unknown"),
      longFormMinimumBudgetUsd: numberOrUndefined(planCost.longForm?.minimumBudgetUsdToRun ?? liveCost.longForm?.minimumBudgetUsdToRun),
      generatedAudioEstimatedCostUsd: numberOrUndefined(planCost.generatedAudio?.estimatedCostUsd ?? liveCost.generatedAudio?.estimatedCostUsd),
      unknownCostItems: arrayOfStrings(planCost.unknownCostItems ?? liveCost.unknownCostItems)
    },
    readyPaidGates,
    readyPaidGateCount: readyPaidGates.length,
    shouldDeferFullSequenceSpend:
      commercial?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
      business?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
      live?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
      true,
    canRunGeneratedAudioPaidSlice:
      readyPaidGates.includes("generated_audio_validation") || live?.releaseGateSummary?.canRunGeneratedAudioPaidValidation === true,
    canRunFullKnownPaidSequence:
      commercial?.budgetConstrainedPaidPlan?.fullKnownPaidSequenceWithinBudget === true ||
      atlas?.readiness?.fullPaidSequenceWithinBudget === true,
    canReleaseToCustomerTraffic: business?.releaseGateSummary?.canReleaseToCustomerTraffic === true
  };
}

function buildCommercialOfferScopeSummary(reports) {
  const launchIntake = reports.launchIntake;
  const intakeSummary = launchIntake.value?.intakeSummary;
  const productSurface = typeof intakeSummary?.commercialOfferProductSurface === "string"
    ? intakeSummary.commercialOfferProductSurface
    : undefined;
  const configured = launchIntake.status === "pass" && intakeSummary?.commercialOfferScopeConfigured === true;
  if (configured && productSurface === "api_cli_only") {
    return {
      launchIntakePresent: launchIntake.present === true,
      launchIntakeStatus: launchIntake.status,
      configured: true,
      status: "api_cli_only_scoped",
      productSurface,
      uiRequiredBeforeCustomerTraffic: false,
      scopeDecisionRequired: false,
      blocksApiCliCommercialLaunch: false,
      blocksFullSnapshotParity: true,
      sourceReport: launchIntake.path,
      message:
        "Commercial launch scope is explicitly API/CLI/operator-report only; the current first-party Short Studio/operator shells remain partial product surfaces and do not block the scoped API/CLI launch path, but a full commercial Web UI still blocks complete WebUI/source-parity claims."
    };
  }
  if (configured && productSurface === "first_party_web_ui_required") {
    return {
      launchIntakePresent: launchIntake.present === true,
      launchIntakeStatus: launchIntake.status,
      configured: true,
      status: "first_party_web_ui_required",
      productSurface,
      uiRequiredBeforeCustomerTraffic: true,
      scopeDecisionRequired: false,
      blocksApiCliCommercialLaunch: true,
      blocksFullSnapshotParity: true,
      sourceReport: launchIntake.path,
      message:
        "Commercial launch scope requires a full first-party commercial Web UI before customer traffic; the existing Short Studio/operator shells are useful foundations but are not an approved scope escape hatch by themselves."
    };
  }
  return {
    launchIntakePresent: launchIntake.present === true,
    launchIntakeStatus: launchIntake.status,
    configured: false,
    status: launchIntake.present === true ? "scope_decision_pending" : "missing_launch_intake_report",
    uiRequiredBeforeCustomerTraffic: false,
    scopeDecisionRequired: true,
    blocksApiCliCommercialLaunch: false,
    blocksFullSnapshotParity: true,
    sourceReport: launchIntake.path,
    message:
      "Commercial launch scope is not yet decided; the existing first-party Short Studio/operator shells are partial, and the full customer/commercial Web UI remains a product-scope decision before any completeness claim."
  };
}

function buildCodeWorkSummary(reports, blockers, productCodeGaps) {
  const commercial = reports.commercialInputs.value;
  const codeBlockingIssues = blockers.filter((item) => item.owner === "codebase");
  const blocksApiCliCommercialLaunch = productCodeGaps.some((item) => item.blocksApiCliCommercialLaunch === true);
  return {
    reportContractsPass: reports.reportContracts.status === "pass",
    releaseAuditReady: reports.releaseAudit.status === "release_ready",
    snapshotParityPass: reports.snapshotParity.status === "pass",
    commercialInputsGenerated: reports.commercialInputs.present === true,
    commercialCommandPlanPass: commercial?.commandPlanAudit?.status === "pass" && Array.isArray(commercial?.commandPlanAudit?.issues) && commercial.commandPlanAudit.issues.length === 0,
    atlasKeyAndModelConfigPresent:
      commercial?.atlasConfigurationSummary?.readiness?.mediaReady === true &&
      commercial?.atlasConfigurationSummary?.readiness?.llmReady === true &&
      commercial?.atlasConfigurationSummary?.readiness?.seedanceVideoReady === true,
    knownCodeBlockingIssueCount: codeBlockingIssues.length,
    knownProductCodeGapCount: productCodeGaps.length,
    automatableProductCodeGapCount: productCodeGaps.filter((item) => item.canAutomateNow === true).length,
    externalEvidenceProductCodeGapCount: productCodeGaps.filter((item) => item.completionRequiresExternalEvidence === true).length,
    scopeDecisionProductCodeGapCount: productCodeGaps.filter((item) => item.scopeDecisionRequired === true).length,
    blocksFullSnapshotParity: productCodeGaps.some((item) => item.blocksFullSnapshotParity === true),
    blocksApiCliCommercialLaunch,
    message:
      codeBlockingIssues.length === 0
        ? productCodeGaps.length === 0
          ? "No current code/schema/command-plan blocker is known from the local reports; remaining blockers require operator input, external live evidence, budget, paid validation, or manual review."
          : "No current schema/command-plan blocker is known from the local reports, but product-code gaps still block any 100% upstream-parity claim."
        : `Code-side blockers remain: ${codeBlockingIssues.map((item) => item.id).join(", ")}.`
  };
}

function buildProductCodeGaps(commercialOfferScopeSummary) {
  const firstPartyUiGap = buildFirstPartyWebUiGap(commercialOfferScopeSummary);
  return [
    firstPartyUiGap,
    {
      id: "distributed_active_provider_work_resume",
      label: "Distributed active provider-work resume is not fully implemented",
      category: "runtime_resilience",
      status: "worker_bridge_contract_ready",
      currentCoveragePercent: 99,
      sourceEvidence: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
      sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
      requiredAction:
        "Run validation:graph-resume-state, validation:graph-resume-queue-service, and validation:provider-graph-resume-worker to refresh the digest-only capsule, protected queue-service lifecycle, and worker bridge enqueue/replay smokes; run validation:provider-live-action-draft and validation:provider-graph-resume-draft to prepare the operator fill-out checklists; run validation:provider-production-handoff against the real HTTPS deployment lease service; archive the production acquire/held/heartbeat/release handoff evidence; then run a live provider worker on the same deployment that maps persisted action-ledger execution callbacks and queued resume-state records to real Atlas close/resume/manual-audit behavior and graph_resume_enqueue evidence. Validate archived callbacks with validation:provider-live-actions -- --confirm-live-provider-actions, archive digest-only graph-resume enqueue payload evidence in ops/render-provider-graph-resume-enqueues.json, then validate it with validation:provider-graph-resume -- --confirm-graph-resume-enqueues. Keep the documented boundary until deployed multi-worker ownership handoff, live queue enqueue evidence, graph-resume enqueue payload evidence, and live provider action evidence all pass.",
      canAutomateNow: false,
      localPreparationAvailable: true,
      completionRequiresExternalEvidence: true,
      remainingEvidenceGateCount: 4,
      scopeDecisionRequired: false,
      scopeDecisionOptions: [],
      blocksApiCliCommercialLaunch: false,
      blocksFullSnapshotParity: true,
      releaseImpact:
        "Provider prediction checkpoints, reconciliation reports, local handoff smoke, HTTPS external lease heartbeat contract evidence, a deployment-token-protected lease-service route, idempotent action-ledger execution replay, digest-only resume-state capsules, protected HTTP enqueue/replay/lease/ack queue-service evidence, a no-spend graph-resume worker bridge that enqueues and replays resume capsules through the protected service, local two-worker handoff evidence, launch-doctor evidence refresh, a production handoff capture runner, non-evidence live provider action and graph-resume enqueue template/checklists, a live provider action evidence contract, and a separate graph-resume enqueue payload evidence contract improve post-restart auditability. The live action contract now requires consistent action/providerCallKind/resultStatus tuples and a matching production-handoff deployment fingerprint before graph-resume evidence can count, and the payload validator requires digest-only queue/graph/resume/prediction evidence bound to the same live action execution, but distributed/HA runtime parity still requires archived real deployment evidence, production multi-worker ownership handoff evidence, live queue execution, live provider action execution, and live Atlas handoff validation."
    },
    {
      id: "directorbench_style_benchmark_harness",
      label: "DirectorBench-style benchmark harness is partial",
      category: "evaluation_harness",
      status: "long_form_validation_contract_ready",
      currentCoveragePercent: 90,
      sourceEvidence: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
      sourcePatternOrigins: ["jiaminchen-1031/DirectorBench"],
      requiredAction:
        "Run validation:quality-review-drafts to prepare artifact-bound reviewer packets, run validation:quality-review-guard to confirm the accepted-review readiness gate rejects unsafe review text, replace needs_review checkpoints with real accepted review decisions, run validation:quality-review-evidence to verify the accepted semantic/audio/runtime/governance review bundle is complete, schema/redaction safe, and bound to the paid artifact, run validation:long-form-review-draft after the paid 2-8 minute long-form report has artifact fingerprints so the manual quality/redaction review packet is bound correctly, then run validation:quality-benchmark on real 2-8 minute paid artifacts and close every unmet parityEvidenceMatrix requirement: actual detected transition boundaries, waveform-analyzed and duration-sync-checked audio, accepted structured semantic/audio/runtime review JSON, accepted structured governance-review JSON, accepted generated-audio validation report evidence, accepted long-form validation report evidence, accepted ASR transcript alignment and lip-sync timing checkpoints, accepted artifact-bound long-form manual review, and accepted permission/legal review before claiming DirectorBench-style parity.",
      canAutomateNow: false,
      localPreparationAvailable: true,
      completionRequiresExternalEvidence: true,
      remainingEvidenceGateCount: 8,
      scopeDecisionRequired: false,
      scopeDecisionOptions: [],
      blocksApiCliCommercialLaunch: false,
      blocksFullSnapshotParity: true,
      releaseImpact:
        "A CineJelly-owned no-spend benchmark now emits script/video/audio/stability/cross-modal checkpoint evidence, bottlenecks, report contracts, FFprobe media metadata, sampled-frame proxy signals, FFmpeg scene-change transition-boundary proxy evidence when boundaries are detected, bounded FFmpeg audio waveform/volume proxy evidence, FFprobe audio-video duration-sync proxy evidence when audio is present, optional structured semantic/audio/runtime/governance review checkpoints with paid-artifact binding checks for parity rows, artifact-bound needs_review draft packets for reviewer handoff, an accepted review-evidence readiness validator for the four-packet review bundle with self-contained schema/redaction enforcement, an unsafe-review guard smoke, a long-form manual quality/redaction review draft gate with schema/report contracts, optional generated-audio validation report checkpoints, optional long-form validation report checkpoints, and a contract-validated parity evidence matrix, but it still cannot replace accepted live generated-audio provider evidence, real accepted ASR/lip-sync evidence from paid media, accepted legal/operator governance review, accepted paid long-form validation evidence, or full DirectorBench runtime parity."
    }
  ];
}

function buildFirstPartyWebUiGap(scopeSummary) {
  const base = {
    id: "first_party_web_ui",
    label: "First-party commercial Web UI is partial",
    category: "operator_surface",
    currentCoveragePercent: 35,
    sourceEvidence: "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json",
    sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo"],
    canAutomateNow: false,
    localPreparationAvailable: true,
    completionRequiresExternalEvidence: false,
    remainingEvidenceGateCount: 0,
    blocksFullSnapshotParity: true
  };
  if (scopeSummary.status === "api_cli_only_scoped") {
    return {
      ...base,
      status: "scoped_out_for_api_cli_launch",
      requiredAction:
        "Keep the full first-party commercial Web UI visible as a snapshot parity gap; the current commercial intake explicitly scopes the offer as API/CLI/operator-report only while the partial Short Studio/operator shells remain backend-integration surfaces.",
      scopeDecisionRequired: false,
      scopeDecisionOptions: [],
      blocksApiCliCommercialLaunch: false,
      releaseImpact:
        "Does not block the explicitly scoped API/CLI commercial launch path, but still blocks 100% MoneyPrinterTurbo-style WebUI/source-parity claims until the full commercial UI is finished and validated."
    };
  }
  if (scopeSummary.status === "first_party_web_ui_required") {
    return {
      ...base,
      status: "required_before_customer_traffic",
      requiredAction:
        "Finish and validate the full first-party customer/operator Web UI before customer traffic, using the existing Short Studio/operator shells and backend UI contracts as the starting point, or update the commercial launch intake to an approved API/CLI-only scope.",
      scopeDecisionRequired: false,
      scopeDecisionOptions: [],
      blocksApiCliCommercialLaunch: true,
      releaseImpact:
        "Blocks the current scoped commercial launch because the operator decision requires a full first-party commercial Web UI before customer traffic; the current shells are not enough for that scope."
    };
  }
  return {
    ...base,
    status: "scope_decision_pending",
    requiredAction:
      "Decide whether the existing Short Studio/operator shells are only internal/backend-integration surfaces for this launch, or finish a full first-party customer/operator UI before claiming launch completeness.",
    scopeDecisionRequired: true,
    scopeDecisionOptions: ["build_first_party_web_ui", "scope_commercial_offer_api_cli_only"],
    blocksApiCliCommercialLaunch: false,
    releaseImpact:
      "Blocks 100% source-parity/product-completeness claims; API/CLI-only customer traffic still depends on business-readiness evidence and an explicit commercial scope decision."
  };
}

function buildBlockers(reports) {
  const blockers = [];
  const missingReports = Object.entries(reports)
    .filter(([, report]) => !report.present)
    .map(([name, report]) =>
      blocker({
        id: `missing_report_${name}`,
        label: `Missing ${name} report`,
        owner: "codebase",
        category: "local_report",
        status: "missing_report",
        sourceReport: report.path,
        requiredAction: `Run the command that produces ${report.path}.`,
        canAutomateNow: true
      })
    );
  blockers.push(...missingReports);

  const commercial = reports.commercialInputs.value;
  if (reports.reportContracts.present && reports.reportContracts.status !== "pass") {
    blockers.push(
      blocker({
        id: "report_contracts_not_pass",
        label: "Report contract validation is not passing",
        owner: "codebase",
        category: "schema_or_contract",
        status: reports.reportContracts.status,
        sourceReport: reports.reportContracts.path,
        requiredAction: "Fix schema/semantic contract drift and rerun validation:report-contracts.",
        canAutomateNow: true
      })
    );
  }
  if (reports.snapshotParity.present && reports.snapshotParity.status === "fail") {
    blockers.push(
      blocker({
        id: "snapshot_parity_not_pass",
        label: "Snapshot parity guardrail audit is not passing",
        owner: "codebase",
        category: "snapshot_parity",
        status: reports.snapshotParity.status,
        sourceReport: reports.snapshotParity.path,
        requiredAction: "Fix subtree inventory, source-lineage, reference implementation, or import-boundary drift and rerun validation:snapshot-parity.",
        canAutomateNow: true
      })
    );
  }
  if (commercial?.commandPlanAudit?.status && commercial.commandPlanAudit.status !== "pass") {
    blockers.push(
      blocker({
        id: "commercial_command_plan_not_pass",
        label: "Commercial launch command plan audit is not passing",
        owner: "codebase",
        category: "command_contract",
        status: String(commercial.commandPlanAudit.status),
        sourceReport: reports.commercialInputs.path,
        requiredAction: "Fix missing scripts/placeholders/paid-spend guard flags and rerun validation:commercial-inputs.",
        canAutomateNow: true
      })
    );
  }
  const launchDoctorKnownCodeBlockingIssueCount = numberOrZero(
    reports.commercialLaunchDoctor.value?.releaseGateSummary?.knownCodeBlockingIssueCount
  );
  if (
    reports.commercialLaunchDoctor.present &&
    (reports.commercialLaunchDoctor.status === "blocked_by_code_or_contracts" || launchDoctorKnownCodeBlockingIssueCount > 0)
  ) {
    blockers.push(
      blocker({
        id: "launch_doctor_code_blockers",
        label: "Commercial launch doctor reports code-side blockers",
        owner: "codebase",
        category: "launch_doctor",
        status: reports.commercialLaunchDoctor.status,
        sourceReport: reports.commercialLaunchDoctor.path,
        requiredAction: "Fix the launch-doctor code/schema/source-hygiene failures and rerun validation:launch-doctor.",
        canAutomateNow: true
      })
    );
  }

  const requiredInputs = Array.isArray(commercial?.requiredInputs) ? commercial.requiredInputs : [];
  for (const input of requiredInputs) {
    if (input?.status === "configured") {
      continue;
    }
    blockers.push(blockerFromRequiredInput(input, reports.commercialInputs.path));
  }
  return blockers;
}

function blockerFromRequiredInput(input, sourceReport) {
  const id = String(input?.id ?? "unknown_input");
  const category = categoryForInput(input);
  const owner = ownerForInput(input);
  return blocker({
    id,
    label: String(input?.label ?? id),
    owner,
    category,
    status: String(input?.status ?? "unknown"),
    sourceReport,
    sourceCheck: id,
    requiredAction: String(input?.acceptance ?? input?.blockerMessage ?? "Provide the required evidence and rerun the readiness audits."),
    validationCommand: typeof input?.validationCommand === "string" ? input.validationCommand : undefined,
    canAutomateNow: false,
    paidImpact: paidImpactForInput(input)
  });
}

function categoryForInput(input) {
  const category = String(input?.category ?? "unknown");
  if (category === "deployment") {
    return "deployment_evidence";
  }
  if (category === "operations") {
    return "operations_evidence";
  }
  if (category === "budget") {
    return "budget_approval";
  }
  if (category === "source_video") {
    return "source_video_evidence";
  }
  if (category === "remote_stock") {
    return "remote_stock_evidence";
  }
  if (category === "manual_review") {
    return "manual_review_after_paid";
  }
  return category;
}

function ownerForInput(input) {
  const status = String(input?.status ?? "unknown");
  const category = String(input?.category ?? "unknown");
  if (status === "blocked_by_budget" || category === "budget") {
    return "budget_owner";
  }
  if (status === "pending_after_paid_run" || category === "manual_review") {
    return "manual_reviewer";
  }
  if (category === "remote_stock") {
    return "operator_external_provider";
  }
  return "operator";
}

function paidImpactForInput(input) {
  const requiredFor = arrayOfStrings(input?.requiredFor);
  if (requiredFor.some((name) => name.includes("long_form") || name.includes("atlas_generated_audio") || name.includes("source_video"))) {
    return "blocks_paid_validation_or_manual_review";
  }
  if (String(input?.status ?? "") === "blocked_by_budget") {
    return "blocks_paid_validation_budget";
  }
  return "none";
}

function blocker(value) {
  return {
    id: value.id,
    label: value.label,
    owner: value.owner,
    category: value.category,
    status: value.status,
    sourceReport: value.sourceReport,
    ...(value.sourceCheck ? { sourceCheck: value.sourceCheck } : {}),
    requiredAction: value.requiredAction,
    ...(value.validationCommand ? { validationCommand: value.validationCommand } : {}),
    canAutomateNow: value.canAutomateNow,
    paidImpact: value.paidImpact ?? "none"
  };
}

const evidencePhaseDefinitions = [
  phaseDefinition("code_contract_fix", "Code/schema/contract fixes", "codebase"),
  phaseDefinition("scope_decision", "Commercial scope decision", "operator"),
  phaseDefinition("operator_attestation_prep", "Operator attestation prep", "operator"),
  phaseDefinition("deployment_evidence", "HTTPS deployment evidence", "operator"),
  phaseDefinition("live_provider_evidence", "Live provider and graph-resume evidence", "operator"),
  phaseDefinition("source_video_input", "Source-video input and analysis evidence", "operator"),
  phaseDefinition("remote_stock_live_terms", "Remote stock provider terms and live evidence", "operator_external_provider"),
  phaseDefinition("budget_approval", "Atlas budget and billing approval", "budget_owner"),
  phaseDefinition("post_paid_manual_review", "Post-paid manual review", "manual_reviewer")
];

function phaseDefinition(id, label, owner) {
  return { id, label, owner };
}

const localPreparationCommandsByInputId = new Map([
  [
    "commercial_offer_scope_decision",
    [
      localPreparationDefinition({
        name: "commercial_launch_intake_draft",
        command: "npm.cmd run validation:launch-intake -- --write-draft"
      })
    ]
  ],
  [
    "billing_admin_attestation",
    [
      localPreparationDefinition({
        name: "ops_config_attestation_drafts",
        command: "npm.cmd run validation:ops-config -- --write-drafts"
      })
    ]
  ],
  [
    "production_operations_attestation",
    [
      localPreparationDefinition({
        name: "ops_config_attestation_drafts",
        command: "npm.cmd run validation:ops-config -- --write-drafts"
      })
    ]
  ],
  [
    "live_provider_action_evidence",
    [
      localPreparationDefinition({
        name: "live_provider_action_evidence_template",
        command: "npm.cmd run validation:provider-live-action-draft"
      })
    ]
  ],
  [
    "graph_resume_enqueue_evidence",
    [
      localPreparationDefinition({
        name: "graph_resume_enqueue_evidence_template",
        command: "npm.cmd run validation:provider-graph-resume-draft"
      })
    ]
  ],
  [
    "long_form_paid_media_review",
    [
      localPreparationDefinition({
        name: "long_form_manual_quality_review_template",
        command: "npm.cmd run validation:long-form-review-draft -- --force"
      })
    ]
  ],
  [
    "generated_audio_paid_review",
    [
      localPreparationDefinition({
        name: "generated_audio_manual_review_template",
        command: "npm.cmd run validation:generated-audio-review-draft"
      })
    ]
  ]
]);

function localPreparationDefinition(value) {
  return {
    name: value.name,
    command: value.command
  };
}

function buildEvidenceClosurePlan(blockers, productCodeGaps, commercialInputs) {
  const blockersByPhase = groupBy(blockers, phaseForBlocker);
  const productGapsByPhase = groupBy(productCodeGaps, phaseForProductGap);
  const operatorPacketIndex = buildOperatorPacketIndex(commercialInputs);
  const phases = evidencePhaseDefinitions
    .map((definition, index) => {
      const phaseBlockers = blockersByPhase.get(definition.id) ?? [];
      const phaseProductGaps = productGapsByPhase.get(definition.id) ?? [];
      const operatorPacket = operatorPacketForPhase(phaseBlockers, operatorPacketIndex);
      const commands = commandsForPhaseBlockers(phaseBlockers, operatorPacketIndex);
      const commandGuards = commandGuardsForCommands(commands, operatorPacketIndex.commandGuardRunbook);
      const localPreparationCommands = localPreparationCommandsForPhase(operatorPacket, operatorPacketIndex);
      const executionReadiness = buildPhaseExecutionReadiness({
        blockers: phaseBlockers,
        operatorPacket,
        commandGuards
      });
      return {
        id: definition.id,
        order: index + 1,
        label: definition.label,
        owner: definition.owner,
        status: phaseStatusFor(phaseBlockers, phaseProductGaps),
        blockerCount: phaseBlockers.length,
        blockerIds: phaseBlockers.map((item) => item.id),
        productGapCount: phaseProductGaps.length,
        productGapIds: phaseProductGaps.map((item) => item.id),
        requiredInputCount: operatorPacket.requiredInputIds.length,
        requiredInputIds: operatorPacket.requiredInputIds,
        envVarCount: operatorPacket.envVars.length,
        envVars: operatorPacket.envVars,
        envPlaceholders: operatorPacket.envPlaceholders,
        operatorInputFiles: operatorPacket.operatorInputFiles,
        draftFiles: operatorPacket.draftFiles,
        reportArchiveFiles: operatorPacket.reportArchiveFiles,
        commands,
        commandGuards,
        localPreparationCommands,
        executionReadiness,
        releaseImpact: releaseImpactForPhase(definition.id, phaseBlockers, phaseProductGaps)
      };
    })
    .filter((phase) => phase.blockerCount > 0 || phase.productGapCount > 0);
  return {
    status: blockers.length === 0 ? "clear" : "blocked",
    releaseEvidence: false,
    blockerCount: blockers.length,
    codeActionCount: blockers.filter((item) => item.owner === "codebase").length,
    externalOrPaidActionCount: blockers.filter((item) => item.owner !== "codebase").length,
    paidDependencyCount: blockers.filter((item) => item.paidImpact !== "none").length,
    phaseCount: phases.length,
    phases
  };
}

function buildPhaseExecutionReadiness({ blockers, operatorPacket, commandGuards }) {
  const inputStatusCounts = countBy(blockers.filter((item) => operatorPacket.requiredInputIds.includes(item.id)), "status");
  const missingRequiredEnvVars = operatorPacket.envPlaceholders
    .filter((item) => item.required === true && item.configured !== true)
    .map((item) => item.name);
  const optionalUnconfiguredEnvVars = operatorPacket.envPlaceholders
    .filter((item) => item.required !== true && item.configured !== true)
    .map((item) => item.name);
  const missingOperatorInputFiles = operatorPacket.operatorInputFileRecords
    .filter((item) => item.present !== true)
    .map((item) => item.path);
  const missingReportArchiveFiles = operatorPacket.reportArchiveFileRecords
    .filter((item) => item.present !== true)
    .map((item) => item.path);
  const guardSummary = {
    commandCount: commandGuards.length,
    runnableCommandCount: commandGuards.filter((item) => item.runnable === true).length,
    liveNetworkCommandCount: commandGuards.filter((item) => item.requiresLiveNetwork === true).length,
    providerSpendCommandCount: commandGuards.filter((item) => item.requiresProviderSpend === true).length,
    operatorConfirmationCommandCount: commandGuards.filter((item) => item.requiresOperatorConfirmation === true).length,
    manualReviewCommandCount: commandGuards.filter((item) => item.requiresManualReview === true).length,
    placeholderCommandCount: commandGuards.filter((item) => item.containsPlaceholder === true).length
  };
  const blockingReasons = [
    ...missingRequiredEnvVars.map((name) => `required_env_missing:${name}`),
    ...missingOperatorInputFiles.map((path) => `operator_input_file_missing:${path}`),
    ...missingReportArchiveFiles.map((path) => `report_archive_missing:${path}`),
    ...(Number(inputStatusCounts.blocked_by_budget ?? 0) > 0 ? ["budget_blocked"] : []),
    ...(Number(inputStatusCounts.pending_after_paid_run ?? 0) > 0 ? ["pending_after_paid_run"] : []),
    ...(Number(inputStatusCounts.missing ?? 0) > 0 ? ["operator_input_missing"] : []),
    ...(guardSummary.placeholderCommandCount > 0 ? ["command_placeholder_unresolved"] : [])
  ];
  return {
    status: phaseExecutionStatus({
      blockers,
      blockingReasons,
      inputStatusCounts,
      guardSummary,
      missingRequiredEnvVars,
      missingOperatorInputFiles
    }),
    canAttemptNow: blockingReasons.length === 0 && commandGuards.every((item) => item.runnable === true),
    blockingReasonCount: blockingReasons.length,
    blockingReasons,
    inputStatusCounts,
    missingRequiredEnvVars,
    optionalUnconfiguredEnvVars,
    missingOperatorInputFiles,
    missingReportArchiveFiles,
    guardSummary
  };
}

function phaseExecutionStatus({ blockers, blockingReasons, inputStatusCounts, guardSummary, missingRequiredEnvVars, missingOperatorInputFiles }) {
  if (blockers.length === 0) {
    return "ready_to_attempt";
  }
  if (Number(inputStatusCounts.blocked_by_budget ?? 0) > 0) {
    return "blocked_by_budget";
  }
  if (Number(inputStatusCounts.pending_after_paid_run ?? 0) > 0) {
    return "pending_after_paid_run";
  }
  if (missingRequiredEnvVars.length > 0 || missingOperatorInputFiles.length > 0 || Number(inputStatusCounts.missing ?? 0) > 0) {
    return "needs_operator_input";
  }
  if (guardSummary.placeholderCommandCount > 0) {
    return "needs_resolved_placeholders";
  }
  if (guardSummary.providerSpendCommandCount > 0 || guardSummary.liveNetworkCommandCount > 0 || guardSummary.operatorConfirmationCommandCount > 0) {
    return "requires_confirmation";
  }
  if (blockingReasons.length > 0) {
    return "blocked";
  }
  return "ready_to_attempt";
}

function buildOperatorPacketIndex(commercialInputs) {
  const requiredInputs = Array.isArray(commercialInputs?.requiredInputs) ? commercialInputs.requiredInputs : [];
  const requiredInputIds = new Set(
    requiredInputs.map((item) => String(item?.id ?? "")).filter(Boolean)
  );
  const reportArchiveFilesByInputId = new Map(
    requiredInputs.map((item) => [
      String(item?.id ?? ""),
      arrayOfStrings(item?.filePaths).filter((filePath) => filePath.startsWith("assets/output_deliverables/"))
    ])
  );
  const envVarsByInputId = new Map(
    requiredInputs.map((item) => [
      String(item?.id ?? ""),
      arrayOfStrings(item?.envVars)
    ])
  );
  const manifest = commercialInputs?.operatorHandoffManifest ?? {};
  const envPlaceholdersByName = new Map(
    Array.isArray(manifest.envPlaceholders)
      ? manifest.envPlaceholders.map((item) => [String(item?.name ?? ""), item]).filter(([name]) => name)
      : []
  );
  return {
    requiredInputIds,
    reportArchiveFilesByInputId,
    envVarsByInputId,
    envPlaceholdersByName,
    operatorInputFiles: Array.isArray(manifest.operatorInputFiles) ? manifest.operatorInputFiles : [],
    draftFiles: Array.isArray(manifest.draftFiles) ? manifest.draftFiles : [],
    reportArchiveFiles: Array.isArray(manifest.reportArchiveFiles) ? manifest.reportArchiveFiles : [],
    commandRunbook: Array.isArray(manifest.commandRunbook) ? manifest.commandRunbook : [],
    inputValidationRunbook: Array.isArray(manifest.inputValidationRunbook) ? manifest.inputValidationRunbook : [],
    commandGuardRunbook: [
      ...(Array.isArray(manifest.commandRunbook) ? manifest.commandRunbook : []),
      ...(Array.isArray(manifest.inputValidationRunbook) ? manifest.inputValidationRunbook : [])
    ]
  };
}

function commandsForPhaseBlockers(phaseBlockers, index) {
  const commands = [];
  for (const item of phaseBlockers) {
    const inputId = String(item?.id ?? "");
    const inputRunbookCommands = index.inputValidationRunbook
      .filter((entry) => String(entry?.sourceInputId ?? "") === inputId)
      .map((entry) => String(entry?.command ?? ""))
      .filter(Boolean);
    if (inputRunbookCommands.length > 0) {
      commands.push(...inputRunbookCommands);
      continue;
    }
    commands.push(...validationCommandSteps(item?.validationCommand).map((step) => step.command));
  }
  return [...new Set(commands.filter(Boolean))];
}

function operatorPacketForPhase(blockers, index) {
  const requiredInputIds = blockers
    .map((item) => item.id)
    .filter((id) => index.requiredInputIds.has(id));
  const inputIdSet = new Set(requiredInputIds);
  const envVars = uniqueSortedStrings(requiredInputIds.flatMap((id) => index.envVarsByInputId.get(id) ?? []));
  const operatorInputFileRecords = uniqueFileRecords(
    index.operatorInputFiles
      .filter((item) => arrayOfStrings(item?.sourceInputIds).some((id) => inputIdSet.has(id)))
      .map((item) => normalizeFileRecord(item))
      .filter(Boolean)
  );
  const reportArchiveFileRecords = uniqueFileRecords(
    [
      ...requiredInputIds.flatMap((id) => (index.reportArchiveFilesByInputId.get(id) ?? []).map((path) => normalizeFileRecord({ path, present: false }))),
      ...index.reportArchiveFiles
        .filter((item) => inputIdSet.has(String(item?.source ?? "")))
        .map((item) => normalizeFileRecord(item))
    ].filter(Boolean)
  );
  return {
    requiredInputIds,
    envVars,
    envPlaceholders: envVars
      .map((name) => normalizeEnvPlaceholder(index.envPlaceholdersByName.get(name), name))
      .filter(Boolean),
    operatorInputFiles: operatorInputFileRecords.map((item) => item.path),
    operatorInputFileRecords,
    draftFiles: uniqueSortedStrings(
      index.draftFiles
        .filter((item) => inputIdSet.has(String(item?.sourceInputId ?? "")))
        .map((item) => item?.path)
    ),
    reportArchiveFiles: reportArchiveFileRecords.map((item) => item.path),
    reportArchiveFileRecords
  };
}

function localPreparationCommandsForPhase(operatorPacket, index) {
  const byCommand = new Map();
  for (const inputId of operatorPacket.requiredInputIds) {
    const definitions = localPreparationCommandsByInputId.get(inputId) ?? [];
    for (const definition of definitions) {
      const draftFiles = draftFilesForInput(index.draftFiles, inputId);
      const existing = byCommand.get(definition.command);
      byCommand.set(definition.command, {
        name: existing?.name ?? definition.name,
        command: definition.command,
        sourceInputIds: uniqueSortedStrings([...(existing?.sourceInputIds ?? []), inputId]),
        draftFiles: uniqueSortedStrings([...(existing?.draftFiles ?? []), ...draftFiles])
      });
    }
  }
  return [...byCommand.values()]
    .map((item) => normalizeLocalPreparationCommand(item, index.commandRunbook))
    .filter((item) => item.draftFiles.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function draftFilesForInput(draftFiles, inputId) {
  return uniqueSortedStrings(
    draftFiles
      .filter((item) => String(item?.sourceInputId ?? "") === inputId)
      .map((item) => item?.path)
  );
}

function normalizeLocalPreparationCommand(value, commandRunbook) {
  const command = String(value?.command ?? "");
  const manifestItem = commandRunbook.find((item) => String(item?.command ?? "") === command);
  const flags = commandGuardFlags(command);
  return {
    name: String(value?.name ?? "unknown"),
    command,
    source: manifestItem ? "operator_handoff_manifest" : "phase_input_mapping",
    sourceInputIds: uniqueSortedStrings(value?.sourceInputIds ?? []),
    runnable:
      flags.requiresLiveNetwork !== true &&
      flags.requiresProviderSpend !== true &&
      flags.requiresOperatorConfirmation !== true &&
      flags.requiresManualReview !== true &&
      flags.containsPlaceholder !== true,
    producesDrafts: true,
    releaseEvidence: false,
    draftFiles: uniqueSortedStrings(value?.draftFiles ?? []),
    ...flags
  };
}

function normalizeFileRecord(value) {
  const path = String(value?.path ?? "");
  if (!path) {
    return undefined;
  }
  return {
    path,
    present: value?.present === true
  };
}

function uniqueFileRecords(values) {
  const byPath = new Map();
  for (const item of values) {
    const existing = byPath.get(item.path);
    byPath.set(item.path, {
      path: item.path,
      present: existing?.present === true || item.present === true
    });
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeEnvPlaceholder(value, fallbackName) {
  const name = String(value?.name ?? fallbackName ?? "");
  if (!name) {
    return undefined;
  }
  return {
    name,
    sensitivity: String(value?.sensitivity ?? "unknown"),
    required: value?.required === true,
    configured: value?.configured === true,
    purpose: String(value?.purpose ?? "")
  };
}

function commandGuardsForCommands(commands, commandRunbook) {
  return commands.map((command) => {
    const manifestItem = commandRunbook.find((item) => String(item?.command ?? "") === command);
    const flags = commandGuardFlags(command);
    if (manifestItem) {
      return {
        command,
        source: "operator_handoff_manifest",
        runnable: manifestItem.runnable === true,
        ...flags
      };
    }
    return {
      command,
      source: "derived_from_command_text",
      runnable: false,
      ...flags
    };
  });
}

function commandGuardFlags(command) {
  return {
    requiresLiveNetwork: command.includes("--confirm-live-network"),
    requiresProviderSpend: command.includes("--confirm-paid-spend") || command.includes("--confirm-provider-spend"),
    requiresOperatorConfirmation: command.includes("--confirm-"),
    requiresManualReview: command.includes("manual-review") || command.includes("manual-audio-review") || command.includes("manual-quality-review"),
    containsPlaceholder: command.includes("<")
  };
}

function validationCommandSteps(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return [];
  }
  const matches = [...normalized.matchAll(/\bStep\s+(\d+):\s*([\s\S]*?)(?=\s+\bStep\s+\d+:\s*|$)/g)];
  if (matches.length === 0) {
    return [{ stepIndex: 1, stepCount: 1, command: normalized }];
  }
  return matches.map((match, index) => ({
    stepIndex: Number(match[1] ?? index + 1),
    stepCount: matches.length,
    command: match[2].trim().replace(/\.$/, "")
  }));
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function phaseForBlocker(blockerItem) {
  if (blockerItem.owner === "codebase") {
    return "code_contract_fix";
  }
  if (blockerItem.category === "product_scope") {
    return "scope_decision";
  }
  if (blockerItem.category === "deployment_evidence") {
    return "deployment_evidence";
  }
  if (blockerItem.category === "operations_evidence") {
    return blockerItem.validationCommand?.includes("--write-drafts")
      ? "operator_attestation_prep"
      : "live_provider_evidence";
  }
  if (blockerItem.category === "source_video_evidence") {
    return "source_video_input";
  }
  if (blockerItem.category === "remote_stock_evidence") {
    return "remote_stock_live_terms";
  }
  if (blockerItem.category === "budget_approval") {
    return "budget_approval";
  }
  if (blockerItem.category === "manual_review_after_paid") {
    return "post_paid_manual_review";
  }
  return "operator_attestation_prep";
}

function phaseForProductGap(gap) {
  if (gap.id === "first_party_web_ui") {
    return "scope_decision";
  }
  if (gap.id === "distributed_active_provider_work_resume") {
    return "live_provider_evidence";
  }
  if (gap.id === "directorbench_style_benchmark_harness") {
    return "post_paid_manual_review";
  }
  return "code_contract_fix";
}

function phaseStatusFor(blockers, productGaps) {
  if (blockers.length > 0) {
    if (blockers.every((item) => item.status === "pending_after_paid_run")) {
      return "pending_after_paid_run";
    }
    if (blockers.some((item) => item.status === "blocked_by_budget")) {
      return "blocked_by_budget";
    }
    return "blocked";
  }
  if (productGaps.length > 0) {
    return "requires_external_evidence";
  }
  return "not_required";
}

function releaseImpactForPhase(phaseId, blockers, productGaps) {
  if (blockers.length === 0 && productGaps.length === 0) {
    return "No current action in this phase.";
  }
  if (phaseId === "code_contract_fix") {
    return "Code/schema/contract blockers must be fixed before live or paid evidence can be trusted.";
  }
  if (phaseId === "scope_decision") {
    return "Commercial launch cannot be fully interpreted until the API/CLI-only versus first-party Web UI decision is recorded.";
  }
  if (phaseId === "budget_approval") {
    return "Paid validation must stay bounded by approved Atlas budget and fresh billing evidence.";
  }
  if (phaseId === "post_paid_manual_review") {
    return "Customer traffic remains blocked until paid artifacts and audio outputs receive accepted manual review.";
  }
  if (productGaps.some((item) => item.completionRequiresExternalEvidence === true)) {
    return "Full parity remains blocked until live external evidence is archived and validated.";
  }
  return "Commercial launch remains blocked until this evidence phase passes.";
}

function groupBy(items, keyFn) {
  const result = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = result.get(key) ?? [];
    bucket.push(item);
    result.set(key, bucket);
  }
  return result;
}

function summarizeBlockers(blockers) {
  return {
    total: blockers.length,
    automatableNow: blockers.filter((item) => item.canAutomateNow).length,
    externalOrPaid: blockers.filter((item) => !item.canAutomateNow).length,
    byOwner: countBy(blockers, "owner"),
    byCategory: countBy(blockers, "category")
  };
}

function buildReleaseGateSummary({ reports, readinessSnapshot, codeWorkSummary, blockers }) {
  const externalBlockers = blockers.filter((item) => item.owner !== "codebase");
  const canClaimFullSnapshotParity = codeWorkSummary.blocksFullSnapshotParity !== true;
  const releaseBlocker =
    readinessSnapshot.canReleaseToCustomerTraffic === true
      ? "Business-readiness gate allows customer traffic."
      : codeWorkSummary.knownCodeBlockingIssueCount > 0
        ? "Code/schema/command-plan blockers remain before live or paid evidence can be trusted."
        : externalBlockers.length > 0
          ? "API key/model configuration is present, but commercial release still needs external evidence, budget approval, paid validation, and manual review."
          : "No blocker is listed, but business-readiness has not approved customer traffic.";
  return {
    canReleaseToCustomerTraffic: readinessSnapshot.canReleaseToCustomerTraffic,
    canRunNoSpendPrep: true,
    canRunLiveNetworkEvidence: reports.commercialInputs.value?.releaseGateSummary?.canRunLiveNetworkEvidence === true,
    canRunGeneratedAudioPaidSlice: readinessSnapshot.canRunGeneratedAudioPaidSlice,
    canRunFullKnownPaidSequence: readinessSnapshot.canRunFullKnownPaidSequence,
    canClaimFullSnapshotParity,
    productCodeGapCount: codeWorkSummary.knownProductCodeGapCount,
    readyPaidGates: readinessSnapshot.readyPaidGates,
    readyPaidGateCount: readinessSnapshot.readyPaidGateCount,
    shouldDeferFullSequenceSpend: readinessSnapshot.shouldDeferFullSequenceSpend,
    safeToRunFullPaidAtlasSequenceNow:
      readinessSnapshot.canRunFullKnownPaidSequence === true &&
      codeWorkSummary.knownCodeBlockingIssueCount === 0 &&
      externalBlockers.filter((item) => item.category !== "manual_review_after_paid").length === 0,
    releaseBlocker
  };
}

function buildNextActions({ reports, readinessSnapshot, codeWorkSummary, blockers }) {
  const actions = [];
  if (codeWorkSummary.knownCodeBlockingIssueCount > 0) {
    actions.push("Fix the code/schema/command-plan blockers first, then rerun validation:report-contracts and validation:completion-audit.");
  }
  if (codeWorkSummary.atlasKeyAndModelConfigPresent) {
    actions.push("No additional Atlas key is required by the current local reports; keep values in ignored .env and rotate them before production launch.");
  } else {
    actions.push("Complete Atlas media/LLM key and model configuration, then rerun validation:live-inputs and validation:commercial-inputs.");
  }
  if (codeWorkSummary.knownProductCodeGapCount > 0) {
    actions.push("Do not claim 100% upstream parity until the product-code gaps in productCodeGaps are implemented, explicitly scoped out, or verified by their own evidence gates.");
  }
  for (const item of blockers.filter((blockerItem) => blockerItem.owner !== "codebase")) {
    actions.push(`${item.label}: ${item.requiredAction}`);
  }
  if (readinessSnapshot.canRunGeneratedAudioPaidSlice) {
    actions.push("Generated-audio is the only currently budget-ready Atlas paid slice; it does not validate Seedance video or approve customer traffic by itself.");
  }
  if (readinessSnapshot.shouldDeferFullSequenceSpend) {
    actions.push("Defer the full Atlas paid sequence until the approved budget covers the known estimate and the remaining live/operator gates are ready.");
  }
  actions.push("After each operator input or evidence refresh, rerun validation:live-inputs, validation:business-plan, validation:provider-live-actions, validation:provider-graph-resume, validation:commercial-inputs, validation:completion-audit, and validation:report-contracts.");
  return [...new Set(actions)];
}

function statusFor({ reports, blockers, codeWorkSummary }) {
  if (reports.businessReadiness.value?.releaseGateSummary?.canReleaseToCustomerTraffic === true) {
    return "ready_for_customer_traffic";
  }
  if (Object.values(reports).some((report) => !report.present)) {
    return "missing_prerequisite_reports";
  }
  if (codeWorkSummary.knownCodeBlockingIssueCount > 0) {
    return "blocked_by_code_or_contracts";
  }
  if (blockers.length === 0 && reports.commercialInputs.value?.releaseGateSummary?.canRunLiveNetworkEvidence === true) {
    return "ready_for_live_evidence_sequence";
  }
  return "blocked_by_external_inputs";
}

function renderMarkdown(report) {
  const codeBlockers = report.blockers.filter((item) => item.owner === "codebase");
  const externalBlockers = report.blockers.filter((item) => item.owner !== "codebase");
  const productCodeGaps = report.productCodeGaps ?? [];
  return [
    "# CineJelly Business Completion Audit",
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
    `- Report contracts: ${report.readinessSnapshot.reportContractsStatus}`,
    `- Commercial inputs: ${report.readinessSnapshot.commercialInputsStatus}`,
    `- Launch doctor: ${report.readinessSnapshot.launchDoctorStatus}`,
    `- Ops config: ${report.readinessSnapshot.opsConfigStatus}`,
    `- Launch-doctor code blockers: ${report.readinessSnapshot.launchDoctorKnownCodeBlockingIssueCount}`,
    `- Atlas media/LLM/Seedance ready: ${report.readinessSnapshot.atlas.mediaReady}/${report.readinessSnapshot.atlas.llmReady}/${report.readinessSnapshot.atlas.seedanceVideoReady}`,
    `- Approved budget: ${formatUsd(report.readinessSnapshot.budget.approvedBudgetUsd)}`,
    `- Known paid estimate: ${formatUsd(report.readinessSnapshot.budget.knownPaidEstimateUsd)}`,
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
    `- Report contracts pass: ${report.codeWorkSummary.reportContractsPass}`,
    `- Release audit ready: ${report.codeWorkSummary.releaseAuditReady}`,
    `- Snapshot parity pass: ${report.codeWorkSummary.snapshotParityPass}`,
    `- Commercial command plan pass: ${report.codeWorkSummary.commercialCommandPlanPass}`,
    `- Known code blockers: ${report.codeWorkSummary.knownCodeBlockingIssueCount}`,
    `- Product-code gaps: ${report.codeWorkSummary.knownProductCodeGapCount}`,
    `- Product-code gaps requiring external evidence: ${report.codeWorkSummary.externalEvidenceProductCodeGapCount}`,
    `- Product-code gaps requiring scope decision: ${report.codeWorkSummary.scopeDecisionProductCodeGapCount}`,
    `- Blocks full snapshot parity: ${report.codeWorkSummary.blocksFullSnapshotParity}`,
    `- ${report.codeWorkSummary.message}`,
    "",
    "## Product Code Gaps",
    "",
    ...markdownProductCodeGaps(productCodeGaps),
    "",
    "## Code Blockers",
    "",
    ...markdownBlockers(codeBlockers),
    "",
    "## External Or Paid Blockers",
    "",
    ...markdownBlockers(externalBlockers),
    "",
    "## Evidence Closure Plan",
    "",
    ...markdownEvidenceClosurePlan(report.evidenceClosurePlan),
    "",
    "## Release Gate",
    "",
    `- canReleaseToCustomerTraffic: ${report.releaseGateSummary.canReleaseToCustomerTraffic}`,
    `- canRunGeneratedAudioPaidSlice: ${report.releaseGateSummary.canRunGeneratedAudioPaidSlice}`,
    `- canRunFullKnownPaidSequence: ${report.releaseGateSummary.canRunFullKnownPaidSequence}`,
    `- canClaimFullSnapshotParity: ${report.releaseGateSummary.canClaimFullSnapshotParity}`,
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
      const readiness = phase.executionReadiness
        ? `${phase.executionReadiness.status}/${phase.executionReadiness.canAttemptNow ? "can-attempt" : "cannot-attempt"} (${phase.executionReadiness.blockingReasonCount} blockers)`
        : "readiness unavailable";
      return `- ${phase.order}. ${phase.label}: ${phase.status}; readiness: ${readiness}; blockers: ${blockers}; product gaps: ${gaps}; inputs: ${inputs}; env: ${env}; files: ${packet}; guards: ${guards}; commands: ${commands}`;
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

function markdownProductCodeGaps(items) {
  if (items.length === 0) {
    return ["- None."];
  }
  return items.map((item) => {
    const evidenceNote = item.completionRequiresExternalEvidence
      ? `; external evidence gates: ${item.remainingEvidenceGateCount}`
      : "";
    const localPrepNote = item.localPreparationAvailable ? "; local prep available" : "";
    const scopeNote = item.scopeDecisionRequired ? `; scope decision: ${item.scopeDecisionOptions.join(" or ")}` : "";
    return `- ${item.label} [${item.status}; ${item.currentCoveragePercent}%${localPrepNote}${evidenceNote}${scopeNote}]: ${item.requiredAction}`;
  });
}

function markdownBlockers(items) {
  if (items.length === 0) {
    return ["- None."];
  }
  return items.map((item) => `- ${item.label} [${item.owner}; ${item.status}]: ${item.requiredAction}`);
}

function normalizeReadyPaidGates(values) {
  return arrayOfStrings(values).map((name) => {
    const aliases = new Map([
      ["generated_audio_inputs", "generated_audio_validation"],
      ["long_form_paid_validation_inputs", "long_form_paid_validation"],
      ["source_video_auto_analysis_inputs", "source_video_auto_analysis_validation"]
    ]);
    return aliases.get(name) ?? name;
  });
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = String(item?.[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
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
        schemaVersion: "cinejelly.business-completion-audit.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked_by_code_or_contracts",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
