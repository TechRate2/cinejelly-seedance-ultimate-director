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
    releaseAudit: summarizeReport(options.releaseAuditPath),
    snapshotParity: summarizeReport(options.snapshotParityPath),
    reportContracts: summarizeReport(options.reportContractsPath),
    commercialLaunchDoctor: options.skipLaunchDoctorReport
      ? skippedReport(options.commercialLaunchDoctorPath, "skipped_launch_doctor_in_progress")
      : summarizeReport(options.commercialLaunchDoctorPath),
    opsConfig: summarizeReport(options.opsConfigPath)
  };
  const blockers = buildBlockers(reports);
  const productCodeGaps = buildProductCodeGaps();
  const readinessSnapshot = buildReadinessSnapshot(reports);
  const codeWorkSummary = buildCodeWorkSummary(reports, blockers, productCodeGaps);
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
    codeWorkSummary,
    productCodeGaps,
    blockerSummary: summarizeBlockers(blockers),
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

function buildProductCodeGaps() {
  return [
    {
      id: "first_party_web_ui",
      label: "First-party web UI is not implemented",
      category: "operator_surface",
      status: "not_implemented",
      currentCoveragePercent: 0,
      sourceEvidence: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
      sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo"],
      requiredAction:
        "Build and validate a first-party customer/operator UI, or explicitly scope the commercial offer as API/CLI-only before claiming launch completeness.",
      canAutomateNow: false,
      localPreparationAvailable: false,
      completionRequiresExternalEvidence: false,
      remainingEvidenceGateCount: 0,
      blocksApiCliCommercialLaunch: false,
      blocksFullSnapshotParity: true,
      releaseImpact:
        "Blocks 100% source-parity/product-completeness claims; API/CLI-only customer traffic still depends on business-readiness evidence."
    },
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
      blocksApiCliCommercialLaunch: false,
      blocksFullSnapshotParity: true,
      releaseImpact:
        "A CineJelly-owned no-spend benchmark now emits script/video/audio/stability/cross-modal checkpoint evidence, bottlenecks, report contracts, FFprobe media metadata, sampled-frame proxy signals, FFmpeg scene-change transition-boundary proxy evidence when boundaries are detected, bounded FFmpeg audio waveform/volume proxy evidence, FFprobe audio-video duration-sync proxy evidence when audio is present, optional structured semantic/audio/runtime/governance review checkpoints with paid-artifact binding checks for parity rows, artifact-bound needs_review draft packets for reviewer handoff, an accepted review-evidence readiness validator for the four-packet review bundle with self-contained schema/redaction enforcement, an unsafe-review guard smoke, a long-form manual quality/redaction review draft gate with schema/report contracts, optional generated-audio validation report checkpoints, optional long-form validation report checkpoints, and a contract-validated parity evidence matrix, but it still cannot replace accepted live generated-audio provider evidence, real accepted ASR/lip-sync evidence from paid media, accepted legal/operator governance review, accepted paid long-form validation evidence, or full DirectorBench runtime parity."
    }
  ];
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
    "## Code-Side Status",
    "",
    `- Report contracts pass: ${report.codeWorkSummary.reportContractsPass}`,
    `- Release audit ready: ${report.codeWorkSummary.releaseAuditReady}`,
    `- Snapshot parity pass: ${report.codeWorkSummary.snapshotParityPass}`,
    `- Commercial command plan pass: ${report.codeWorkSummary.commercialCommandPlanPass}`,
    `- Known code blockers: ${report.codeWorkSummary.knownCodeBlockingIssueCount}`,
    `- Product-code gaps: ${report.codeWorkSummary.knownProductCodeGapCount}`,
    `- Product-code gaps requiring external evidence: ${report.codeWorkSummary.externalEvidenceProductCodeGapCount}`,
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

function markdownProductCodeGaps(items) {
  if (items.length === 0) {
    return ["- None."];
  }
  return items.map((item) => {
    const evidenceNote = item.completionRequiresExternalEvidence
      ? `; external evidence gates: ${item.remainingEvidenceGateCount}`
      : "";
    const localPrepNote = item.localPreparationAvailable ? "; local prep available" : "";
    return `- ${item.label} [${item.status}; ${item.currentCoveragePercent}%${localPrepNote}${evidenceNote}]: ${item.requiredAction}`;
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
