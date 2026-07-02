import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/roadmap-closure-audit-report.json",
  markdownOutputPath: "assets/output_deliverables/business-readiness/roadmap-closure-audit.md",
  roadmapPath: "docs/IMPLEMENTATION_ROADMAP.md",
  snapshotParityPath: "docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md",
  projectContextPath: "docs/PROJECT_CONTEXT.md",
  completionAuditPath: "assets/output_deliverables/business-readiness/business-completion-audit-report.json",
  launchDoctorPath: "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  commercialInputsPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
  reportContractsPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json"
};

const requirementDefinitions = [
  requirement({
    id: "deployment_https_capture",
    label: "Real HTTPS deployment readiness capture",
    category: "deployment_evidence",
    owner: "operator",
    blockerIds: ["deployment_https_url"],
    reportPaths: ["assets/output_deliverables/business-readiness/deployment-preflight-report.json"],
    sourceAnchors: [
      anchor("roadmap", "Real deployment capture from an HTTPS non-localhost host using `validation:deployment-readiness`."),
      anchor("snapshotParity", "Capture real HTTPS deployment evidence")
    ],
    requiredAction: "Run validation:deployment-readiness against a non-localhost HTTPS host and archive the report."
  }),
  requirement({
    id: "billing_admin_quota_capture",
    label: "Billing/admin/quota launch evidence",
    category: "operations_evidence",
    owner: "operator",
    blockerIds: ["billing_admin_attestation"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
      "assets/output_deliverables/business-readiness/billing-admin-ops-report.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Real billing/admin/quota capture from an HTTPS deployment host"),
      anchor("snapshotParity", "Provide passing billing/admin/quota")
    ],
    requiredAction: "Fill and promote the billing/admin attestation, then capture billing/admin/quota evidence from the real HTTPS deployment."
  }),
  requirement({
    id: "production_operations_capture",
    label: "Production operations evidence",
    category: "operations_evidence",
    owner: "operator",
    blockerIds: ["production_operations_attestation"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
      "assets/output_deliverables/business-readiness/production-operations-report.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Real production operations capture from an HTTPS deployment host"),
      anchor("snapshotParity", "production ops")
    ],
    requiredAction: "Fill and promote the production operations attestation, then capture storage, backup, monitoring, incident, support, redaction, and retention evidence."
  }),
  requirement({
    id: "atlas_budget_approval",
    label: "Approved Atlas validation budget",
    category: "budget_approval",
    owner: "budget_owner",
    blockerIds: ["atlas_validation_budget", "source_video_atlas_llm_budget"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
      "assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "fresh Atlas billing/budget readiness"),
      anchor("snapshotParity", "Approve a budget that covers the full validation sequence")
    ],
    requiredAction: "Approve the full known paid sequence budget or explicitly keep only a smaller validated slice in scope."
  }),
  requirement({
    id: "long_form_paid_validation",
    label: "Live long-form paid Atlas validation and review",
    category: "paid_validation",
    owner: "manual_reviewer",
    blockerIds: ["long_form_paid_media_review"],
    productGapIds: ["directorbench_style_benchmark_harness"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/long-form-validation-report.json",
      "ops/long-form-manual-quality-review.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Live 2-8 minute long-form Atlas validation with an approved budget"),
      anchor("snapshotParity", "Run long-form 2-8 minute paid Atlas validation")
    ],
    requiredAction: "Run paid 2-8 minute long-form validation and complete the artifact-bound manual quality/redaction review."
  }),
  requirement({
    id: "source_video_live_validation",
    label: "Live source-video auto-analysis evidence",
    category: "source_video_evidence",
    owner: "operator",
    blockerIds: ["source_video_url", "source_video_auto_analysis_enablement"],
    reportPaths: ["assets/output_deliverables/business-readiness/source-video-validation-report.json"],
    sourceAnchors: [
      anchor("roadmap", "Live evidence run for source-video auto-analysis with a real clean HTTPS source video"),
      anchor("snapshotParity", "Run live source-video auto-analysis validation")
    ],
    requiredAction: "Provide a clean HTTPS source video, approve source-video analysis, and run the Atlas LLM source-video validation gate."
  }),
  requirement({
    id: "remote_stock_live_validation",
    label: "Live remote stock provider evidence",
    category: "remote_stock_evidence",
    owner: "operator_external_provider",
    blockerIds: ["remote_stock_provider"],
    reportPaths: ["assets/output_deliverables/business-readiness/remote-stock-validation-report.json"],
    sourceAnchors: [
      anchor("roadmap", "Live evidence run for remote stock provider validation"),
      anchor("snapshotParity", "Run live remote stock provider validation")
    ],
    requiredAction: "Enable an approved stock provider key, confirm commercial terms, and run the live remote-stock validation."
  }),
  requirement({
    id: "generated_audio_live_review",
    label: "Live generated-audio evidence and manual listening review",
    category: "generated_audio_evidence",
    owner: "manual_reviewer",
    blockerIds: ["generated_audio_paid_review"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
      "ops/generated-audio-manual-review.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Live Atlas-backed generated-audio business evidence"),
      anchor("snapshotParity", "Run live Atlas generated-audio validation")
    ],
    requiredAction: "Run generated-audio validation, then complete structured manual listening review before commercial use."
  }),
  requirement({
    id: "provider_resume_live_evidence",
    label: "Deployed provider handoff, live action, and graph-resume evidence",
    category: "runtime_resilience",
    owner: "operator",
    blockerIds: ["live_provider_action_evidence", "graph_resume_enqueue_evidence"],
    productGapIds: ["distributed_active_provider_work_resume"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json",
      "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json",
      "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Live multi-worker active provider-work resume evidence"),
      anchor("snapshotParity", "archived deployed multi-worker active provider-work resume/handoff evidence")
    ],
    requiredAction: "Capture production handoff evidence, execute live provider actions, and validate digest-only graph-resume enqueue payload evidence."
  }),
  requirement({
    id: "media_level_directorbench_evidence",
    label: "Accepted media-level DirectorBench-style evidence",
    category: "evaluation_harness",
    owner: "manual_reviewer",
    blockerIds: ["long_form_paid_media_review", "generated_audio_paid_review"],
    productGapIds: ["directorbench_style_benchmark_harness"],
    reportPaths: [
      "assets/output_deliverables/business-readiness/director-style-benchmark-report.json",
      "assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json"
    ],
    sourceAnchors: [
      anchor("roadmap", "Media-level DirectorBench-style evidence"),
      anchor("snapshotParity", "Still no automated VLM/ASR/lip-sync analyzers")
    ],
    requiredAction: "Promote real accepted semantic/audio/runtime/governance review evidence and rerun the Director-style benchmark on paid long-form artifacts."
  }),
  requirement({
    id: "commercial_scope_or_ui_decision",
    label: "Commercial scope decision or first-party UI",
    category: "product_scope",
    owner: "operator",
    blockerIds: ["commercial_offer_scope_decision"],
    productGapIds: ["first_party_web_ui"],
    reportPaths: ["assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json"],
    sourceAnchors: [
      anchor("roadmap", "API/CLI-only versus full first-party commercial Web UI scope inputs"),
      anchor("snapshotParity", "Decide whether to finish the full first-party customer-facing UI for launch or ship API/CLI/operator-report only")
    ],
    requiredAction: "Record whether the commercial launch is API/CLI-only or full first-party commercial UI-required in the launch intake."
  })
];

function requirement(value) {
  return {
    productGapIds: [],
    reportPaths: [],
    ...value
  };
}

function anchor(source, text) {
  return { source, text };
}

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
    ["--roadmap", "roadmapPath"],
    ["--snapshot-parity", "snapshotParityPath"],
    ["--project-context", "projectContextPath"],
    ["--completion-audit", "completionAuditPath"],
    ["--launch-doctor", "launchDoctorPath"],
    ["--business-readiness", "businessReadinessPath"],
    ["--commercial-inputs", "commercialInputsPath"],
    ["--report-contracts", "reportContractsPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-markdown") {
      options.writeMarkdown = false;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      options.writeMarkdown = false;
      continue;
    }
    if (arg === "--skip-launch-doctor-report") {
      options.skipLaunchDoctorReport = true;
      continue;
    }
    const key = flagMap.get(arg);
    if (key) {
      index += 1;
      if (index >= args.length) {
        throw new Error(`Missing value for ${arg}.`);
      }
      options[key] = args[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/audit-roadmap-closure.mjs [options]\n
Options:
  --output <path>                 JSON report path.
  --markdown-output <path>        Markdown report path.
  --no-output                     Print only; do not write JSON or Markdown reports.
  --no-markdown                   Do not write the Markdown report.
  --skip-launch-doctor-report     Treat the launch-doctor report as skipped.
\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const docs = {
    roadmap: readTextSummary(options.roadmapPath),
    snapshotParity: readTextSummary(options.snapshotParityPath),
    projectContext: readTextSummary(options.projectContextPath)
  };
  const reports = {
    completionAudit: readJsonSummary(options.completionAuditPath),
    launchDoctor: options.skipLaunchDoctorReport
      ? skippedReport(options.launchDoctorPath)
      : readJsonSummary(options.launchDoctorPath),
    businessReadiness: readJsonSummary(options.businessReadinessPath),
    commercialInputs: readJsonSummary(options.commercialInputsPath),
    reportContracts: readJsonSummary(options.reportContractsPath)
  };

  const requirements = buildRequirements({ docs, reports });
  const summary = summarizeRequirements(requirements);
  const sourceDocSummary = summarizeSourceDocs(docs, requirements);
  const completion = reports.completionAudit.value;
  const doctor = reports.launchDoctor.value;
  const knownCodeBlockingIssueCount = Number(completion?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0) +
    Number(doctor?.codeWorkSummary?.knownCodeBlockingIssueCount ?? 0);
  const status = statusFor({
    sourceAnchorIssueCount: summary.sourceAnchorIssueCount,
    knownCodeBlockingIssueCount,
    readyRequirementCount: summary.satisfiedRequirementCount,
    requirementCount: summary.requirementCount,
    canReleaseToCustomerTraffic: completion?.releaseGateSummary?.canReleaseToCustomerTraffic === true ||
      reports.businessReadiness.value?.releaseGateSummary?.canReleaseToCustomerTraffic === true
  });
  const releaseGateSummary = {
    canReleaseToCustomerTraffic: status === "ready_for_customer_traffic",
    canRunNoSpendPrep: requirements.some((item) => item.localPreparationCommandCount > 0),
    canRunLiveNetworkEvidence: completion?.releaseGateSummary?.canRunLiveNetworkEvidence === true,
    canRunGeneratedAudioPaidSlice: completion?.releaseGateSummary?.canRunGeneratedAudioPaidSlice === true,
    canRunFullKnownPaidSequence: completion?.releaseGateSummary?.canRunFullKnownPaidSequence === true,
    canClaimFullSnapshotParity: completion?.releaseGateSummary?.canClaimFullSnapshotParity === true,
    knownCodeBlockingIssueCount,
    releaseBlocker: releaseBlockerFor(status, summary, completion)
  };
  const report = {
    schemaVersion: "cinejelly.roadmap-closure-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    releaseEvidence: false,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      markdownOutputPath: options.writeMarkdown ? toRepoRelative(options.markdownOutputPath) : undefined,
      skipLaunchDoctorReport: options.skipLaunchDoctorReport,
      sourceDocs: {
        roadmap: publicTextSummary(docs.roadmap),
        snapshotParity: publicTextSummary(docs.snapshotParity),
        projectContext: publicTextSummary(docs.projectContext)
      },
      sourceReports: Object.fromEntries(
        Object.entries(reports).map(([name, item]) => [name, publicReportSummary(item)])
      )
    },
    sourceDocSummary,
    summary,
    requirements,
    releaseGateSummary,
    nextActions: nextActionsFor(requirements, summary, releaseGateSummary)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeReport && options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "ready_for_customer_traffic" ? 0 : 1;
}

function buildRequirements({ docs, reports }) {
  const completion = reports.completionAudit.value ?? {};
  const blockerById = new Map((Array.isArray(completion.blockers) ? completion.blockers : []).map((item) => [String(item?.id ?? ""), item]));
  const productGapById = new Map((Array.isArray(completion.productCodeGaps) ? completion.productCodeGaps : []).map((item) => [String(item?.id ?? ""), item]));
  const phases = Array.isArray(completion.evidenceClosurePlan?.phases) ? completion.evidenceClosurePlan.phases : [];
  return requirementDefinitions.map((definition, order) => {
    const blockers = definition.blockerIds
      .map((id) => blockerById.get(id))
      .filter(Boolean)
      .map(normalizeBlocker);
    const productGaps = definition.productGapIds
      .map((id) => productGapById.get(id))
      .filter(Boolean)
      .map(normalizeProductGap);
    const sourceCoverage = definition.sourceAnchors.map((item) => sourceCoverageItem(item, docs));
    const relatedPhases = phasesForRequirement(phases, definition);
    const localPreparationCommands = uniqueLocalPreparationCommands(relatedPhases, definition);
    const directCommands = directCommandsForRequirement({ relatedPhases, definition, commercialInputs: reports.commercialInputs.value });
    const directCommandGuards = commandGuardsForCommands(directCommands, relatedPhases);
    const evidenceReports = definition.reportPaths.map((path) => publicReportSummary(readJsonSummary(path)));
    const status = requirementStatus({ blockers, productGaps, sourceCoverage, evidenceReports });
    return {
      id: definition.id,
      order: order + 1,
      label: definition.label,
      category: definition.category,
      owner: definition.owner,
      status,
      releaseEvidence: false,
      evidenceSufficient: status === "satisfied",
      sourceCoverageStatus: sourceCoverage.every((item) => item.present) ? "pass" : "fail",
      sourceCoverage,
      blockerCount: blockers.length,
      blockerIds: blockers.map((item) => item.id),
      blockers,
      productGapCount: productGaps.length,
      productGapIds: productGaps.map((item) => item.id),
      productGaps,
      evidenceReports,
      phaseIds: uniqueSortedStrings(relatedPhases.map((phase) => phase?.id)),
      localPreparationCommandCount: localPreparationCommands.length,
      localPreparationCommands,
      directCommandCount: directCommands.length,
      directCommands,
      directCommandGuards,
      requiredAction: definition.requiredAction
    };
  });
}

function sourceCoverageItem(anchorItem, docs) {
  const source = docs[anchorItem.source];
  const present = source.present === true && source.text.includes(anchorItem.text);
  return {
    source: anchorItem.source,
    path: source.path,
    anchor: anchorItem.text,
    present
  };
}

function phasesForRequirement(phases, definition) {
  return phases.filter((phase) => {
    const blockerIds = arrayOfStrings(phase?.blockerIds);
    const productGapIds = arrayOfStrings(phase?.productGapIds);
    return definition.blockerIds.some((id) => blockerIds.includes(id)) ||
      definition.productGapIds.some((id) => productGapIds.includes(id));
  });
}

function uniqueLocalPreparationCommands(phases, definition) {
  const byCommand = new Map();
  for (const phase of phases) {
    for (const item of Array.isArray(phase?.localPreparationCommands) ? phase.localPreparationCommands : []) {
      const sourceInputIds = arrayOfStrings(item?.sourceInputIds);
      const belongsToRequirement = sourceInputIds.some((id) => definition.blockerIds.includes(id)) ||
        (sourceInputIds.length === 0 && definition.productGapIds.some((id) => arrayOfStrings(phase?.productGapIds).includes(id)));
      if (!belongsToRequirement) {
        continue;
      }
      byCommand.set(String(item?.command ?? ""), {
        name: String(item?.name ?? ""),
        command: String(item?.command ?? ""),
        sourceInputIds,
        runnable: item?.runnable === true,
        producesDrafts: item?.producesDrafts === true,
        releaseEvidence: item?.releaseEvidence === true,
        draftFiles: arrayOfStrings(item?.draftFiles),
        requiresLiveNetwork: item?.requiresLiveNetwork === true,
        requiresProviderSpend: item?.requiresProviderSpend === true,
        requiresOperatorConfirmation: item?.requiresOperatorConfirmation === true,
        requiresManualReview: item?.requiresManualReview === true,
        containsPlaceholder: item?.containsPlaceholder === true
      });
    }
  }
  return [...byCommand.values()].filter((item) => item.command).sort((left, right) => left.name.localeCompare(right.name));
}

function commandGuardsForCommands(commands, phases) {
  const phaseGuards = new Map();
  for (const phase of phases) {
    for (const guard of Array.isArray(phase?.commandGuards) ? phase.commandGuards : []) {
      const command = String(guard?.command ?? "");
      if (!command) {
        continue;
      }
      phaseGuards.set(command, guard);
    }
  }
  return commands.map((command) => {
    const guard = phaseGuards.get(command);
    const flags = commandGuardFlags(command);
    return {
      command,
      source: guard ? "evidence_closure_plan" : "derived_from_command_text",
      runnable: guard?.runnable === true,
      ...flags
    };
  });
}

function directCommandsForRequirement({ relatedPhases, definition, commercialInputs }) {
  const manifest = commercialInputs?.operatorHandoffManifest;
  const inputValidationRunbook = Array.isArray(manifest?.inputValidationRunbook)
    ? manifest.inputValidationRunbook
    : [];
  const inputCommands = inputValidationRunbook
    .filter((item) => definition.blockerIds.includes(String(item?.sourceInputId ?? "")))
    .map((item) => String(item?.command ?? ""))
    .filter(Boolean);
  if (inputCommands.length > 0) {
    return uniqueOrderedStrings(inputCommands);
  }
  return uniqueOrderedStrings(relatedPhases.flatMap((phase) => arrayOfStrings(phase?.commands)));
}

function commandGuardFlags(command) {
  const text = String(command ?? "");
  return {
    requiresLiveNetwork: text.includes("--confirm-live-network"),
    requiresProviderSpend: text.includes("--confirm-paid-spend") || text.includes("--confirm-provider-spend"),
    requiresOperatorConfirmation: text.includes("--confirm-"),
    requiresManualReview: text.includes("manual-review") || text.includes("manual-audio-review") || text.includes("manual-quality-review"),
    containsPlaceholder: text.includes("<")
  };
}

function requirementStatus({ blockers, productGaps, sourceCoverage, evidenceReports }) {
  if (sourceCoverage.some((item) => item.present !== true)) {
    return "docs_anchor_missing";
  }
  if (blockers.some((item) => item.status === "blocked_by_budget")) {
    return "blocked_by_budget";
  }
  if (blockers.some((item) => item.status === "pending_after_paid_run")) {
    return "pending_after_paid_run";
  }
  if (blockers.some((item) => item.category === "product_scope") || productGaps.some((item) => item.scopeDecisionRequired === true)) {
    return "scope_decision_required";
  }
  if (blockers.some((item) => item.status === "missing")) {
    return "blocked_by_external_inputs";
  }
  if (blockers.length > 0 || productGaps.some((item) => item.blocksFullSnapshotParity === true || item.completionRequiresExternalEvidence === true)) {
    return "blocked_by_external_inputs";
  }
  if (evidenceReports.length > 0 && evidenceReports.some((item) => item.present === true && !["pass", "release_ready", "completed", "ready_for_customer_traffic"].includes(String(item.status ?? "")))) {
    return "blocked_by_external_inputs";
  }
  return "satisfied";
}

function summarizeRequirements(requirements) {
  const statusCounts = countBy(requirements, "status");
  const sourceAnchorIssueCount = requirements.flatMap((item) => item.sourceCoverage).filter((item) => item.present !== true).length;
  return {
    requirementCount: requirements.length,
    satisfiedRequirementCount: Number(statusCounts.satisfied ?? 0),
    blockedRequirementCount: requirements.length - Number(statusCounts.satisfied ?? 0),
    sourceAnchorIssueCount,
    localPreparationCommandCount: requirements.reduce((sum, item) => sum + item.localPreparationCommandCount, 0),
    directCommandCount: requirements.reduce((sum, item) => sum + item.directCommandCount, 0),
    blockerCount: uniqueSortedStrings(requirements.flatMap((item) => item.blockerIds)).length,
    productGapCount: uniqueSortedStrings(requirements.flatMap((item) => item.productGapIds)).length,
    statusCounts
  };
}

function summarizeSourceDocs(docs, requirements) {
  return Object.fromEntries(
    Object.entries(docs).map(([name, item]) => {
      const coverage = requirements.flatMap((requirementItem) => requirementItem.sourceCoverage).filter((coverageItem) => coverageItem.source === name);
      return [
        name,
        {
          path: item.path,
          present: item.present,
          anchorCount: coverage.length,
          missingAnchorCount: coverage.filter((coverageItem) => coverageItem.present !== true).length
        }
      ];
    })
  );
}

function statusFor({ sourceAnchorIssueCount, knownCodeBlockingIssueCount, readyRequirementCount, requirementCount, canReleaseToCustomerTraffic }) {
  if (sourceAnchorIssueCount > 0) {
    return "fail";
  }
  if (knownCodeBlockingIssueCount > 0) {
    return "blocked_by_code_or_contracts";
  }
  if (readyRequirementCount === requirementCount && canReleaseToCustomerTraffic) {
    return "ready_for_customer_traffic";
  }
  return "blocked_by_external_inputs";
}

function releaseBlockerFor(status, summary, completion) {
  if (status === "ready_for_customer_traffic") {
    return "Roadmap closure requirements and customer traffic gate are satisfied.";
  }
  if (status === "fail") {
    return "Roadmap closure audit cannot be trusted until every expected roadmap/snapshot anchor is present.";
  }
  if (status === "blocked_by_code_or_contracts") {
    return "Code, schema, launch-doctor, or report-contract blockers must be fixed before roadmap closure can be trusted.";
  }
  return completion?.releaseGateSummary?.releaseBlocker ??
    `Roadmap closure still has ${summary.blockedRequirementCount} unsatisfied external, paid, manual, or scope requirements.`;
}

function nextActionsFor(requirements, summary, releaseGateSummary) {
  const actions = [];
  if (summary.sourceAnchorIssueCount > 0) {
    actions.push("Restore the expected roadmap and snapshot parity anchors before trusting closure status.");
  }
  for (const item of requirements.filter((requirementItem) => requirementItem.status !== "satisfied")) {
    const prep = item.localPreparationCommands.length > 0
      ? ` Local prep: ${item.localPreparationCommands.map((command) => command.command).join(" | ")}.`
      : "";
    const evidence = item.directCommands.length > 0
      ? ` Evidence commands: ${item.directCommands.join(" | ")}.`
      : "";
    actions.push(`${item.label}: ${item.requiredAction}${prep}${evidence}`);
  }
  if (actions.length === 0 && releaseGateSummary.canReleaseToCustomerTraffic !== true) {
    actions.push("Rerun business-readiness and launch-doctor before claiming customer traffic readiness.");
  }
  return actions;
}

function normalizeBlocker(value) {
  return {
    id: String(value?.id ?? ""),
    label: String(value?.label ?? ""),
    owner: String(value?.owner ?? "unknown"),
    category: String(value?.category ?? "unknown"),
    status: String(value?.status ?? "unknown"),
    paidImpact: String(value?.paidImpact ?? "none"),
    validationCommand: typeof value?.validationCommand === "string" ? value.validationCommand : undefined
  };
}

function normalizeProductGap(value) {
  return {
    id: String(value?.id ?? ""),
    label: String(value?.label ?? ""),
    category: String(value?.category ?? "unknown"),
    status: String(value?.status ?? "unknown"),
    blocksFullSnapshotParity: value?.blocksFullSnapshotParity === true,
    completionRequiresExternalEvidence: value?.completionRequiresExternalEvidence === true,
    localPreparationAvailable: value?.localPreparationAvailable === true,
    scopeDecisionRequired: value?.scopeDecisionRequired === true,
    currentCoveragePercent: typeof value?.currentCoveragePercent === "number" ? value.currentCoveragePercent : undefined
  };
}

function renderMarkdown(report) {
  return [
    "# CineJelly Roadmap Closure Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${report.status}`,
    "",
    `Requirements: ${report.summary.satisfiedRequirementCount}/${report.summary.requirementCount} satisfied`,
    `Source anchor issues: ${report.summary.sourceAnchorIssueCount}`,
    `Known code blockers: ${report.releaseGateSummary.knownCodeBlockingIssueCount}`,
    "",
    "## Requirements",
    "",
    ...report.requirements.map((item) => `- ${item.order}. ${item.label}: ${item.status}; blockers=${item.blockerIds.length === 0 ? "none" : item.blockerIds.join(", ")}; productGaps=${item.productGapIds.length === 0 ? "none" : item.productGapIds.join(", ")}; prep=${item.localPreparationCommands.length === 0 ? "none" : item.localPreparationCommands.map((command) => command.name).join(", ")}; evidenceCommands=${item.directCommandCount}`),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function readTextSummary(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      path: toRepoRelative(path),
      text: ""
    };
  }
  const text = readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
  return {
    present: true,
    path: toRepoRelative(path),
    text
  };
}

function readJsonSummary(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: "missing"
    };
  }
  try {
    const value = JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""));
    return {
      present: true,
      path: toRepoRelative(path),
      schemaVersion: typeof value.schemaVersion === "string" ? value.schemaVersion : undefined,
      status: String(value.status ?? "unknown"),
      value
    };
  } catch (error) {
    return {
      present: true,
      path: toRepoRelative(path),
      status: "invalid_json",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skippedReport(path) {
  return {
    present: false,
    path: toRepoRelative(path),
    status: "skipped"
  };
}

function publicTextSummary(value) {
  return {
    present: value.present,
    path: value.path
  };
}

function publicReportSummary(value) {
  return {
    present: value.present,
    path: value.path,
    ...(value.schemaVersion ? { schemaVersion: value.schemaVersion } : {}),
    status: value.status,
    ...(value.error ? { error: value.error } : {})
  };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${value}\n`, "utf8");
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
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "")).filter(Boolean)
    : [];
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "")).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function uniqueOrderedStrings(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values.map((item) => String(item ?? "")).filter(Boolean)) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)
    ? relativePath
    : String(path);
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.roadmap-closure-audit.v1",
        generatedAt: new Date().toISOString(),
        status: "fail",
        noSpend: true,
        networkCallsMade: false,
        providerCallsMade: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
