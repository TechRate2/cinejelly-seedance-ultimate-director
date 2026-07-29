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
  contract("source_structure_audit", "schemas/source-structure-audit-report.schema.json", "assets/output_deliverables/business-readiness/source-structure-audit-report.json"),
  contract("api_response_redaction_smoke", "schemas/api-response-redaction-smoke-report.schema.json", "assets/output_deliverables/business-readiness/api-response-redaction-smoke-report.json"),
  contract("private_source_lineage_boundary_audit", "schemas/private-source-lineage-boundary-audit-report.schema.json", "assets/output_deliverables/business-readiness/private-source-lineage-boundary-audit-report.json"),
  contract("render_request_contract_smoke", "schemas/render-request-contract-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-request-contract-smoke-report.json"),
  contract("deployment_readiness_capture", "schemas/deployment-readiness-capture-report.schema.json", "assets/output_deliverables/business-readiness/deployment-preflight-report.json"),
  contract("local_deployment_capture_smoke", "schemas/deployment-readiness-capture-report.schema.json", "assets/output_deliverables/business-readiness/local-deployment-capture-smoke.json"),
  contract("render_job_history_smoke", "schemas/render-job-history-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-job-history-smoke-report.json"),
  contract("render_job_review_lifecycle_smoke", "schemas/render-job-review-lifecycle-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-job-review-lifecycle-smoke-report.json"),
  contract("render_scheduler_smoke", "schemas/render-scheduler-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json"),
  contract("video_render_strategy_smoke", "schemas/video-render-strategy-smoke-report.schema.json", "assets/output_deliverables/business-readiness/video-render-strategy-smoke-report.json"),
  contract("last_frame_chaining_smoke", "schemas/last-frame-chaining-smoke-report.schema.json", "assets/output_deliverables/business-readiness/last-frame-chaining-smoke-report.json"),
  contract("render_provider_reconciliation", "schemas/render-provider-reconciliation-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json"),
  contract("render_provider_handoff", "schemas/render-provider-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-handoff-report.json"),
  contract("render_provider_external_lease", "schemas/render-provider-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json"),
  contract("render_provider_lease_service_smoke", "schemas/render-provider-lease-service-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json"),
  contract("render_provider_handoff_action_ledger", "schemas/render-provider-handoff-action-ledger-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json"),
  contract("production_graph_sequence_smoke", "schemas/production-graph-sequence-smoke-report.schema.json", "assets/output_deliverables/business-readiness/production-graph-sequence-smoke-report.json"),
  contract("production_graph_resume_state", "schemas/production-graph-resume-state-report.schema.json", "assets/output_deliverables/business-readiness/production-graph-resume-state-report.json"),
  contract("production_graph_resume_queue_service", "schemas/production-graph-resume-queue-service-smoke-report.schema.json", "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json"),
  contract("render_provider_graph_resume_worker", "schemas/render-provider-graph-resume-worker-smoke-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json"),
  contract("render_provider_multi_worker_handoff", "schemas/render-provider-multi-worker-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json"),
  contract("render_provider_production_handoff", "schemas/render-provider-production-handoff-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json"),
  contract("render_provider_live_action_evidence_draft", "schemas/render-provider-live-action-evidence-draft-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-live-action-evidence-draft-report.json"),
  contract("render_provider_live_action_evidence", "schemas/render-provider-live-action-evidence.schema.json", "ops/render-provider-live-actions.json"),
  contract("render_provider_live_actions", "schemas/render-provider-live-actions-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json"),
  contract("render_provider_graph_resume_enqueue_evidence", "schemas/render-provider-graph-resume-enqueue-evidence.schema.json", "ops/render-provider-graph-resume-enqueues.json"),
  contract("render_provider_graph_resume_enqueue_evidence_draft", "schemas/render-provider-graph-resume-enqueue-evidence-draft-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueue-evidence-draft-report.json"),
  contract("render_provider_graph_resume_enqueues", "schemas/render-provider-graph-resume-enqueues-report.schema.json", "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json"),
  contract("snapshot_parity_audit", "schemas/snapshot-parity-audit-report.schema.json", "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json"),
  contract("atlas_billing_readiness", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json"),
  contract("atlas_billing_generated_audio_smoke", "schemas/atlas-billing-readiness-report.schema.json", "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json"),
  contract("commercial_launch_intake_packet", "schemas/commercial-launch-intake.schema.json", "ops/commercial-launch-intake.json"),
  contract("commercial_launch_intake", "schemas/commercial-launch-intake-validation-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json"),
  contract("commercial_launch_doctor", "schemas/commercial-launch-doctor-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json"),
  contract("commercial_launch_inputs", "schemas/commercial-launch-inputs-report.schema.json", "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json"),
  contract("business_completion_audit", "schemas/business-completion-audit-report.schema.json", "assets/output_deliverables/business-readiness/business-completion-audit-report.json"),
  contract("roadmap_closure_audit", "schemas/roadmap-closure-audit-report.schema.json", "assets/output_deliverables/business-readiness/roadmap-closure-audit-report.json"),
  contract("billing_admin_attestation_packet", "schemas/billing-admin-attestation.schema.json", "ops/billing-admin-attestation.json"),
  contract("production_operations_attestation_packet", "schemas/production-operations-attestation.schema.json", "ops/production-operations-attestation.json"),
  contract("ops_config_validation", "schemas/business-readiness-ops-config-validation-report.schema.json", "assets/output_deliverables/business-readiness/ops-config-validation-report.json"),
  contract("long_form_validation", "schemas/long-form-validation-report.schema.json", "assets/output_deliverables/business-readiness/long-form-validation-report.json"),
  contract("long_form_continuity_smoke", "schemas/long-form-continuity-smoke-report.schema.json", "assets/output_deliverables/business-readiness/long-form-continuity-smoke-report.json"),
  contract("long_form_agent_review_smoke", "schemas/long-form-agent-review-smoke-report.schema.json", "assets/output_deliverables/business-readiness/long-form-agent-review-smoke-report.json"),
  contract("long_form_timeline_smoke", "schemas/long-form-timeline-smoke-report.schema.json", "assets/output_deliverables/business-readiness/long-form-timeline-smoke-report.json"),
  contract("long_form_creative_intelligence_smoke", "schemas/long-form-creative-intelligence-smoke-report.schema.json", "assets/output_deliverables/business-readiness/long-form-creative-intelligence-smoke-report.json"),
  contract("long_form_readiness_smoke", "schemas/long-form-readiness-smoke-report.schema.json", "assets/output_deliverables/business-readiness/long-form-readiness-smoke-report.json"),
  contract("long_form_manual_quality_review", "schemas/long-form-manual-quality-review.schema.json", "ops/long-form-manual-quality-review.json"),
  contract("long_form_manual_quality_review_draft", "schemas/long-form-manual-quality-review-draft-report.schema.json", "assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json"),
  contract("long_form_manual_quality_review_readiness", "schemas/long-form-manual-quality-review-readiness-report.schema.json", "assets/output_deliverables/business-readiness/long-form-manual-quality-review-readiness-report.json"),
  contract("source_video_auto_analysis_smoke", "schemas/source-video-auto-analysis-smoke-report.schema.json", "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json"),
  contract("source_video_validation", "schemas/source-video-auto-analysis-validation-report.schema.json", "assets/output_deliverables/business-readiness/source-video-validation-report.json"),
  contract("remote_stock_adapter_smoke", "schemas/remote-stock-adapter-smoke-report.schema.json", "assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json"),
  contract("remote_stock_validation", "schemas/remote-stock-validation-report.schema.json", "assets/output_deliverables/business-readiness/remote-stock-validation-report.json"),
  contract("material_source_scoring_smoke", "schemas/material-source-scoring-smoke-report.schema.json", "assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json"),
  contract("generated_audio_validation", "schemas/generated-audio-validation-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-validation-report.json"),
  contract("generated_audio_artifact_evidence", "schemas/generated-audio-artifact-evidence-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json"),
  contract("generated_audio_manual_review", "schemas/generated-audio-manual-review.schema.json", "ops/generated-audio-manual-review.json"),
  contract("generated_audio_manual_review_draft", "schemas/generated-audio-manual-review-draft-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-manual-review-draft-report.json"),
  contract("generated_audio_manual_review_readiness", "schemas/generated-audio-manual-review-readiness-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-manual-review-readiness-report.json"),
  contract("generated_audio_mapping_smoke", "schemas/generated-audio-mapping-smoke-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json"),
  contract("generated_audio_polling_resilience", "schemas/generated-audio-polling-resilience-smoke-report.schema.json", "assets/output_deliverables/business-readiness/generated-audio-polling-resilience-smoke-report.json"),
  contract("transition_audio_continuity_smoke", "schemas/transition-audio-continuity-smoke-report.schema.json", "assets/output_deliverables/business-readiness/transition-audio-continuity-smoke-report.json"),
  contract("short_pipeline_smoke", "schemas/short-pipeline-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-pipeline-smoke-report.json"),
  contract("short_viral_intelligence_smoke", "schemas/short-viral-intelligence-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-viral-intelligence-smoke-report.json"),
  contract("short_agent_graph_smoke", "schemas/short-agent-graph-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-agent-graph-smoke-report.json"),
  contract("short_pipeline_conversation_smoke", "schemas/short-pipeline-conversation-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-pipeline-conversation-smoke-report.json"),
  contract("short_pipeline_session_store_smoke", "schemas/short-pipeline-session-store-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-pipeline-session-store-smoke-report.json"),
  contract("short_pipeline_session_render_handoff_smoke", "schemas/short-pipeline-session-render-handoff-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-pipeline-session-render-handoff-smoke-report.json"),
  contract("short_mvp_ui_contract_smoke", "schemas/short-mvp-ui-contract-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json"),
  contract("short_prompt_pattern_corpus", "schemas/short-prompt-pattern-corpus-report.schema.json", "assets/output_deliverables/business-readiness/short-prompt-pattern-corpus-report.json"),
  contract("short_platform_template_corpus", "schemas/short-platform-template-corpus-report.schema.json", "assets/output_deliverables/business-readiness/short-platform-template-corpus-report.json"),
  contract("short_backend_integration_audit", "schemas/short-backend-integration-audit-report.schema.json", "assets/output_deliverables/business-readiness/short-backend-integration-audit-report.json"),
  contract("backend_system_readiness_audit", "schemas/backend-system-readiness-audit-report.schema.json", "assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json"),
  contract("backend_system_suite", "schemas/backend-system-suite-report.schema.json", "assets/output_deliverables/business-readiness/backend-system-suite-report.json"),
  contract("short_review_operation_evidence", "schemas/short-review-operation-evidence.schema.json", "ops/short-review-operation-evidence.json"),
  contract("short_review_operation_draft", "schemas/short-review-operation-evidence-draft-report.schema.json", "assets/output_deliverables/business-readiness/short-review-operation-evidence-draft-report.json"),
  contract("short_review_operation_validation", "schemas/short-review-operation-validation-report.schema.json", "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json"),
  contract("short_review_operation_guard", "schemas/short-review-operation-evidence-guard-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-review-operation-evidence-guard-smoke-report.json"),
  contract("short_product_rights_evidence", "schemas/short-product-rights-evidence.schema.json", "ops/short-product-rights-evidence.json"),
  contract("short_product_rights_draft", "schemas/short-product-rights-evidence-draft-report.schema.json", "assets/output_deliverables/business-readiness/short-product-rights-evidence-draft-report.json"),
  contract("short_product_rights_validation", "schemas/short-product-rights-validation-report.schema.json", "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json"),
  contract("short_product_rights_guard", "schemas/short-product-rights-evidence-guard-smoke-report.schema.json", "assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke-report.json"),
  contract("operator_launch_ui_contract_smoke", "schemas/operator-launch-ui-contract-smoke-report.schema.json", "assets/output_deliverables/business-readiness/operator-launch-ui-contract-smoke-report.json"),
  contract("director_style_semantic_review", "schemas/director-style-semantic-review.schema.json", "assets/output_deliverables/business-readiness/director-style-semantic-review.json"),
  contract("director_style_audio_review", "schemas/director-style-audio-review.schema.json", "assets/output_deliverables/business-readiness/director-style-audio-review.json"),
  contract("director_style_runtime_review", "schemas/director-style-runtime-review.schema.json", "assets/output_deliverables/business-readiness/director-style-runtime-review.json"),
  contract("director_style_governance_review", "schemas/director-style-governance-review.schema.json", "assets/output_deliverables/business-readiness/director-style-governance-review.json"),
  contract("director_style_review_drafts", "schemas/director-style-review-drafts-report.schema.json", "assets/output_deliverables/business-readiness/director-style-review-drafts-report.json"),
  contract("director_style_review_evidence_readiness", "schemas/director-style-review-evidence-readiness-report.schema.json", "assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json"),
  contract("director_style_review_evidence_guard", "schemas/director-style-review-evidence-guard-smoke-report.schema.json", "assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json"),
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
  if (item.name === "source_structure_audit") {
    return validateSourceStructureAuditSemantics(report);
  }
  if (item.name === "commercial_launch_doctor") {
    return validateCommercialLaunchDoctorSemantics(report, {
      allowInProgress: options.allowLaunchDoctorInProgress
    });
  }
  if (item.name === "commercial_launch_intake_packet") {
    return validateCommercialLaunchIntakePacketSemantics(report);
  }
  if (item.name === "billing_admin_attestation_packet") {
    return validateBillingAdminAttestationPacketSemantics(report);
  }
  if (item.name === "production_operations_attestation_packet") {
    return validateProductionOperationsAttestationPacketSemantics(report);
  }
  if (item.name === "commercial_launch_intake") {
    return validateCommercialLaunchIntakeSemantics(report);
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
  if (item.name === "roadmap_closure_audit") {
    return validateRoadmapClosureAuditSemantics(report);
  }
  if (item.name === "material_source_scoring_smoke") {
    return validateMaterialSourceScoringSmokeSemantics(report);
  }
  if (item.name === "source_video_auto_analysis_smoke") {
    return validateSourceVideoAutoAnalysisSmokeSemantics(report);
  }
  if (item.name === "source_video_validation") {
    return validateSourceVideoValidationSemantics(report);
  }
  if (item.name === "remote_stock_adapter_smoke") {
    return validateRemoteStockAdapterSmokeSemantics(report);
  }
  if (item.name === "remote_stock_validation") {
    return validateRemoteStockValidationSemantics(report);
  }
  if (item.name === "director_style_semantic_review") {
    return validateDirectorStyleRawReviewSemantics(report, directorStyleRawReviewConfigs.semantic);
  }
  if (item.name === "director_style_audio_review") {
    return validateDirectorStyleRawReviewSemantics(report, directorStyleRawReviewConfigs.audio);
  }
  if (item.name === "director_style_runtime_review") {
    return validateDirectorStyleRawReviewSemantics(report, directorStyleRawReviewConfigs.runtime);
  }
  if (item.name === "director_style_governance_review") {
    return validateDirectorStyleRawReviewSemantics(report, directorStyleRawReviewConfigs.governance);
  }
  if (item.name === "director_style_benchmark") {
    return validateDirectorStyleBenchmarkSemantics(report);
  }
  if (item.name === "director_style_review_evidence_readiness") {
    return validateDirectorStyleReviewEvidenceReadinessSemantics(report);
  }
  if (item.name === "director_style_review_evidence_guard") {
    return validateDirectorStyleReviewEvidenceGuardSemantics(report);
  }
  if (item.name === "generated_audio_polling_resilience") {
    return validateGeneratedAudioPollingResilienceSemantics(report);
  }
  if (item.name === "generated_audio_mapping_smoke") {
    return validateGeneratedAudioMappingSmokeSemantics(report);
  }
  if (item.name === "generated_audio_artifact_evidence") {
    return validateGeneratedAudioArtifactEvidenceSemantics(report);
  }
  if (item.name === "generated_audio_manual_review") {
    return validateGeneratedAudioManualReviewSemantics(report);
  }
  if (item.name === "generated_audio_manual_review_readiness") {
    return validateGeneratedAudioManualReviewReadinessSemantics(report);
  }
  if (item.name === "long_form_manual_quality_review") {
    return validateLongFormManualQualityReviewSemantics(report);
  }
  if (item.name === "long_form_manual_quality_review_draft") {
    return validateLongFormManualQualityReviewDraftSemantics(report);
  }
  if (item.name === "long_form_manual_quality_review_readiness") {
    return validateLongFormManualQualityReviewReadinessSemantics(report);
  }
  if (item.name === "generated_audio_manual_review_draft") {
    return validateGeneratedAudioManualReviewDraftSemantics(report);
  }
  if (item.name === "render_provider_handoff_action_ledger") {
    return validateRenderProviderHandoffActionLedgerSemantics(report);
  }
  if (item.name === "production_graph_resume_state") {
    return validateProductionGraphResumeStateSemantics(report);
  }
  if (item.name === "production_graph_resume_queue_service") {
    return validateProductionGraphResumeQueueServiceSemantics(report);
  }
  if (item.name === "render_provider_graph_resume_worker") {
    return validateRenderProviderGraphResumeWorkerSemantics(report);
  }
  if (item.name === "render_provider_production_handoff") {
    return validateRenderProviderProductionHandoffSemantics(report);
  }
  if (item.name === "render_provider_live_actions") {
    return validateRenderProviderLiveActionsSemantics(report);
  }
  if (item.name === "render_provider_graph_resume_enqueues") {
    return validateRenderProviderGraphResumeEnqueuesSemantics(report);
  }
  if (item.name === "render_provider_graph_resume_enqueue_evidence_draft") {
    return validateRenderProviderGraphResumeEnqueueEvidenceDraftSemantics(report);
  }
  if (item.name === "render_provider_live_action_evidence_draft") {
    return validateRenderProviderLiveActionEvidenceDraftSemantics(report);
  }
  return [];
}

const LAUNCH_DOCTOR_BASE_COMMANDS = [
  "build",
  "deployment_package",
  "snapshot_parity",
  "material_source_scoring",
  "source_video_auto_analysis_smoke",
  "remote_stock_adapter_smoke",
  "generated_audio_mapping_smoke",
  "short_review_operation_guard",
  "short_product_rights_guard",
  "provider_live_actions",
  "provider_graph_resume",
  "short_review_operation_draft",
  "short_review_operation_validation",
  "short_product_rights_draft",
  "short_product_rights_validation",
  "release_audit",
  "quality_benchmark",
  "quality_review_guard",
  "quality_review_evidence",
  "generated_audio_review_readiness",
  "long_form_review_readiness",
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
  ["production_graph_resume_state", "productionGraphResumeStateStatus"],
  ["production_graph_resume_queue_service", "productionGraphResumeQueueServiceStatus"],
  ["provider_graph_resume_worker", "providerGraphResumeWorkerStatus"],
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
  const qualityReviewGuardRun = commandByName.get("quality_review_guard");
  if (qualityReviewGuardRun?.status !== "pass") {
    issues.push("$.commandRuns[quality_review_guard].status: expected pass for unsafe-review guard smoke command.");
  }
  if (report?.readinessSnapshot?.qualityReviewGuardStatus !== "pass") {
    issues.push("$.readinessSnapshot.qualityReviewGuardStatus: expected pass after refreshing unsafe-review guard smoke.");
  }
  const qualityReviewEvidenceRun = commandByName.get("quality_review_evidence");
  if (qualityReviewEvidenceRun?.status !== "pass") {
    issues.push("$.commandRuns[quality_review_evidence].status: expected pass for no-spend quality review-evidence command.");
  }
  if (["missing", "skipped", undefined].includes(report?.readinessSnapshot?.qualityReviewEvidenceStatus)) {
    issues.push("$.readinessSnapshot.qualityReviewEvidenceStatus: expected a refreshed review-evidence status, not missing/skipped.");
  }
  if (report?.readinessSnapshot?.generatedAudioValidationStatus !== report?.reportSummaries?.generatedAudioValidation?.status) {
    issues.push("$.readinessSnapshot.generatedAudioValidationStatus: expected to match reportSummaries.generatedAudioValidation.status.");
  }
  if (report?.readinessSnapshot?.generatedAudioArtifactEvidenceStatus !== report?.reportSummaries?.generatedAudioArtifactEvidence?.status) {
    issues.push("$.readinessSnapshot.generatedAudioArtifactEvidenceStatus: expected to match reportSummaries.generatedAudioArtifactEvidence.status.");
  }
  const generatedAudioReviewReadinessRun = commandByName.get("generated_audio_review_readiness");
  if (generatedAudioReviewReadinessRun?.status !== "pass") {
    issues.push("$.commandRuns[generated_audio_review_readiness].status: expected pass for generated-audio manual-review readiness command.");
  }
  if (report?.readinessSnapshot?.generatedAudioReviewReadinessStatus !== report?.reportSummaries?.generatedAudioReviewReadiness?.status) {
    issues.push("$.readinessSnapshot.generatedAudioReviewReadinessStatus: expected to match reportSummaries.generatedAudioReviewReadiness.status.");
  }
  const longFormReviewReadinessRun = commandByName.get("long_form_review_readiness");
  if (longFormReviewReadinessRun?.status !== "pass") {
    issues.push("$.commandRuns[long_form_review_readiness].status: expected pass for long-form manual-review readiness command.");
  }
  if (report?.readinessSnapshot?.longFormReviewReadinessStatus !== report?.reportSummaries?.longFormReviewReadiness?.status) {
    issues.push("$.readinessSnapshot.longFormReviewReadinessStatus: expected to match reportSummaries.longFormReviewReadiness.status.");
  }
  const materialSourceScoringRun = commandByName.get("material_source_scoring");
  if (materialSourceScoringRun?.status !== "pass") {
    issues.push("$.commandRuns[material_source_scoring].status: expected pass for material-source scoring smoke command.");
  }
  if (report?.reportSummaries?.materialSourceScoring?.status !== "pass") {
    issues.push("$.reportSummaries.materialSourceScoring.status: expected pass after refreshing material-source scoring smoke.");
  }
  const sourceVideoAutoAnalysisSmokeRun = commandByName.get("source_video_auto_analysis_smoke");
  if (sourceVideoAutoAnalysisSmokeRun?.status !== "pass") {
    issues.push("$.commandRuns[source_video_auto_analysis_smoke].status: expected pass for source-video auto-analysis smoke command.");
  }
  if (report?.reportSummaries?.sourceVideoAutoAnalysisSmoke?.status !== "pass") {
    issues.push("$.reportSummaries.sourceVideoAutoAnalysisSmoke.status: expected pass after refreshing source-video auto-analysis smoke.");
  }
  if (report?.readinessSnapshot?.sourceVideoAutoAnalysisSmokeStatus !== "pass") {
    issues.push("$.readinessSnapshot.sourceVideoAutoAnalysisSmokeStatus: expected pass after refreshing source-video auto-analysis smoke.");
  }
  const remoteStockAdapterSmokeRun = commandByName.get("remote_stock_adapter_smoke");
  if (remoteStockAdapterSmokeRun?.status !== "pass") {
    issues.push("$.commandRuns[remote_stock_adapter_smoke].status: expected pass for remote-stock adapter smoke command.");
  }
  if (report?.reportSummaries?.remoteStockAdapterSmoke?.status !== "pass") {
    issues.push("$.reportSummaries.remoteStockAdapterSmoke.status: expected pass after refreshing remote-stock adapter smoke.");
  }
  if (report?.readinessSnapshot?.remoteStockAdapterSmokeStatus !== "pass") {
    issues.push("$.readinessSnapshot.remoteStockAdapterSmokeStatus: expected pass after refreshing remote-stock adapter smoke.");
  }
  const generatedAudioMappingSmokeRun = commandByName.get("generated_audio_mapping_smoke");
  if (generatedAudioMappingSmokeRun?.status !== "pass") {
    issues.push("$.commandRuns[generated_audio_mapping_smoke].status: expected pass for generated-audio mapping smoke command.");
  }
  if (report?.reportSummaries?.generatedAudioMappingSmoke?.status !== "pass") {
    issues.push("$.reportSummaries.generatedAudioMappingSmoke.status: expected pass after refreshing generated-audio mapping smoke.");
  }
  if (report?.readinessSnapshot?.generatedAudioMappingSmokeStatus !== "pass") {
    issues.push("$.readinessSnapshot.generatedAudioMappingSmokeStatus: expected pass after refreshing generated-audio mapping smoke.");
  }

  const shortReviewOperationGuardRun = commandByName.get("short_review_operation_guard");
  if (shortReviewOperationGuardRun?.status !== "pass") {
    issues.push("$.commandRuns[short_review_operation_guard].status: expected pass for Short review operation evidence guard smoke.");
  }
  if (report?.readinessSnapshot?.shortReviewOperationGuardStatus !== "pass") {
    issues.push("$.readinessSnapshot.shortReviewOperationGuardStatus: expected pass after refreshing Short review operation guard smoke.");
  }
  const shortProductRightsGuardRun = commandByName.get("short_product_rights_guard");
  if (shortProductRightsGuardRun?.status !== "pass") {
    issues.push("$.commandRuns[short_product_rights_guard].status: expected pass for Short product/rights evidence guard smoke.");
  }
  if (report?.readinessSnapshot?.shortProductRightsGuardStatus !== "pass") {
    issues.push("$.readinessSnapshot.shortProductRightsGuardStatus: expected pass after refreshing Short product/rights guard smoke.");
  }
  for (const [commandName, summaryKey, statusKey] of [
    ["short_review_operation_draft", "shortReviewOperationDraft", "shortReviewOperationDraftStatus"],
    ["short_review_operation_validation", "shortReviewOperationValidation", "shortReviewOperationValidationStatus"],
    ["short_product_rights_draft", "shortProductRightsDraft", "shortProductRightsDraftStatus"],
    ["short_product_rights_validation", "shortProductRightsValidation", "shortProductRightsValidationStatus"]
  ]) {
    const run = commandByName.get(commandName);
    if (run?.status !== "pass") {
      issues.push(`$.commandRuns[${commandName}].status: expected pass for refreshed Short evidence command.`);
    }
    if (["missing", "skipped", undefined].includes(report?.readinessSnapshot?.[statusKey])) {
      issues.push(`$.readinessSnapshot.${statusKey}: expected a refreshed Short evidence status, not missing/skipped.`);
    }
    if (report?.readinessSnapshot?.[statusKey] !== report?.reportSummaries?.[summaryKey]?.status) {
      issues.push(`$.readinessSnapshot.${statusKey}: expected to match reportSummaries.${summaryKey}.status.`);
    }
  }

  const scopeSummary = report?.commercialOfferScopeSummary;
  if (!scopeSummary || typeof scopeSummary !== "object") {
    issues.push("$.commercialOfferScopeSummary: expected commercial offer scope summary from completion audit.");
  } else {
    if (scopeSummary.launchIntakeStatus !== report?.reportSummaries?.launchIntake?.status) {
      issues.push("$.commercialOfferScopeSummary.launchIntakeStatus: expected to match reportSummaries.launchIntake.status.");
    }
    if (report?.readinessSnapshot?.commercialOfferScopeStatus !== scopeSummary.status) {
      issues.push("$.readinessSnapshot.commercialOfferScopeStatus: expected to match commercialOfferScopeSummary.status.");
    }
    if (report?.releaseGateSummary?.commercialOfferScopeStatus !== scopeSummary.status) {
      issues.push("$.releaseGateSummary.commercialOfferScopeStatus: expected to match commercialOfferScopeSummary.status.");
    }
    if (report?.readinessSnapshot?.commercialOfferScopeConfigured !== scopeSummary.configured) {
      issues.push("$.readinessSnapshot.commercialOfferScopeConfigured: expected to match commercialOfferScopeSummary.configured.");
    }
    if (report?.readinessSnapshot?.commercialOfferScopeDecisionRequired !== scopeSummary.scopeDecisionRequired) {
      issues.push("$.readinessSnapshot.commercialOfferScopeDecisionRequired: expected to match commercialOfferScopeSummary.scopeDecisionRequired.");
    }
    if (report?.readinessSnapshot?.commercialOfferBlocksApiCliCommercialLaunch !== scopeSummary.blocksApiCliCommercialLaunch) {
      issues.push("$.readinessSnapshot.commercialOfferBlocksApiCliCommercialLaunch: expected to match commercialOfferScopeSummary.blocksApiCliCommercialLaunch.");
    }
    if (report?.releaseGateSummary?.commercialOfferBlocksApiCliCommercialLaunch !== scopeSummary.blocksApiCliCommercialLaunch) {
      issues.push("$.releaseGateSummary.commercialOfferBlocksApiCliCommercialLaunch: expected to match commercialOfferScopeSummary.blocksApiCliCommercialLaunch.");
    }
    if (scopeSummary.status === "api_cli_only_scoped" && scopeSummary.blocksApiCliCommercialLaunch !== false) {
      issues.push("$.commercialOfferScopeSummary.blocksApiCliCommercialLaunch: expected false for API/CLI-only commercial scope.");
    }
    if (scopeSummary.status === "first_party_web_ui_required" && scopeSummary.blocksApiCliCommercialLaunch !== true) {
      issues.push("$.commercialOfferScopeSummary.blocksApiCliCommercialLaunch: expected true when the full first-party commercial Web UI is required before customer traffic.");
    }
  }
  issues.push(
    ...validateOperatorHandoffSummary(
      report?.operatorHandoffSummary,
      "$.operatorHandoffSummary",
      report?.reportSummaries?.commercialInputs,
      { expectedCommandPlanPass: report?.codeWorkSummary?.commandPlanPass }
    )
  );
  issues.push(
    ...validateSnapshotParityCoverageSummary(
      report?.snapshotParityCoverageSummary,
      "$.snapshotParityCoverageSummary",
      report?.reportSummaries?.snapshotParity
    )
  );
  issues.push(
    ...validateEvidenceClosurePlan(
      report?.evidenceClosurePlan,
      "$.evidenceClosurePlan",
      { blockerSummary: report?.blockerSummary }
    )
  );

  const providerGraphResumeRun = commandByName.get("provider_graph_resume");
  if (providerGraphResumeRun?.status !== "pass") {
    issues.push("$.commandRuns[provider_graph_resume].status: expected pass for no-spend graph-resume enqueue evidence command.");
  }
  if (["missing", "skipped", undefined].includes(report?.readinessSnapshot?.providerGraphResumeStatus)) {
    issues.push("$.readinessSnapshot.providerGraphResumeStatus: expected a refreshed graph-resume enqueue status, not missing/skipped.");
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
  // Reference-only snapshots are excluded from lineage and parity expectations BY DESIGN. A lineage
  // record asserts that product logic was translated from a snapshot, and a parity estimate says how
  // much of it we reproduced — both are false claims for a snapshot whose license forbids copying.
  // Demanding them would push someone to invent one.
  const inventory = Array.isArray(report?.snapshotInventory) ? report.snapshotInventory : [];
  const translatedSnapshots = inventory.filter((item) => item?.referenceOnly !== true);
  if (report?.summary?.sourceLineageCoverageCount !== translatedSnapshots.length) {
    issues.push("$.summary.sourceLineageCoverageCount: expected every non-reference-only snapshot to have source-lineage coverage.");
  }
  const functionalEstimates = Array.isArray(report?.functionalParityEstimates) ? report.functionalParityEstimates : [];
  if (functionalEstimates.length !== translatedSnapshots.length) {
    issues.push("$.functionalParityEstimates: expected one functional parity estimate per non-reference-only snapshot.");
  }
  const referenceOnlyWithEstimate = inventory
    .filter((item) => item?.referenceOnly === true)
    .filter((item) => functionalEstimates.some((estimate) => estimate?.id === item?.id));
  if (referenceOnlyWithEstimate.length > 0) {
    issues.push(`$.functionalParityEstimates: reference-only snapshots must have NO parity estimate (${referenceOnlyWithEstimate.map((item) => item.id).join(", ")}).`);
  }
  if (Number(report?.summary?.functionalParityEstimateCount ?? -1) !== functionalEstimates.filter((item) => item?.status === "estimated").length) {
    issues.push("$.summary.functionalParityEstimateCount: expected to equal estimated functionalParityEstimates length.");
  }
  for (const snapshot of translatedSnapshots) {
    const estimate = functionalEstimates.find((item) => item?.id === snapshot?.id);
    if (!estimate) {
      issues.push(`$.functionalParityEstimates: expected estimate for snapshot ${snapshot?.id}.`);
      continue;
    }
    if (estimate.localPath !== snapshot.localPath || estimate.upstreamRepository !== snapshot.upstreamRepository) {
      issues.push(`$.functionalParityEstimates[id=${snapshot?.id}]: expected localPath/upstreamRepository to match snapshotInventory.`);
    }
  }
  for (const estimate of functionalEstimates) {
    if (estimate?.status !== "estimated") {
      issues.push(`$.functionalParityEstimates[id=${estimate?.id}].status: expected estimated.`);
    }
    if (estimate?.releaseEvidence !== false) {
      issues.push(`$.functionalParityEstimates[id=${estimate?.id}].releaseEvidence: expected false.`);
    }
    if (Number(estimate?.estimateMinPercent ?? -1) < 0 || Number(estimate?.estimateMaxPercent ?? -1) < Number(estimate?.estimateMinPercent ?? 0)) {
      issues.push(`$.functionalParityEstimates[id=${estimate?.id}]: expected valid estimate percent range.`);
    }
    if (Number(estimate?.estimateMaxPercent ?? 100) >= 100) {
      issues.push(`$.functionalParityEstimates[id=${estimate?.id}].estimateMaxPercent: expected below 100 until full parity is proven.`);
    }
    if (typeof estimate?.mainGaps !== "string" || estimate.mainGaps.trim().length === 0) {
      issues.push(`$.functionalParityEstimates[id=${estimate?.id}].mainGaps: expected explicit remaining gaps.`);
    }
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

function validateSourceStructureAuditSemantics(report) {
  const issues = [];
  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for source structure evidence.");
  }
  if (Number(report?.summary?.failedChecks ?? 0) !== 0) {
    issues.push("$.summary.failedChecks: expected zero failed source-structure checks.");
  }
  if (Number(report?.summary?.missingRootFileCount ?? 0) !== 0) {
    issues.push("$.summary.missingRootFileCount: expected zero missing root files.");
  }
  if (Number(report?.summary?.missingRuntimeDirCount ?? 0) !== 0) {
    issues.push("$.summary.missingRuntimeDirCount: expected zero missing runtime directories.");
  }
  if (Number(report?.summary?.missingDeployFileCount ?? 0) !== 0) {
    issues.push("$.summary.missingDeployFileCount: expected zero missing deploy files.");
  }
  if (Number(report?.summary?.directExternalImportFindingCount ?? 0) !== 0) {
    issues.push("$.summary.directExternalImportFindingCount: expected zero direct external imports.");
  }
  if (Number(report?.summary?.productHygieneFindingCount ?? 0) !== 0) {
    issues.push("$.summary.productHygieneFindingCount: expected zero product test/mock/demo/sample findings.");
  }
  if (Number(report?.summary?.publicExportMissingCount ?? 0) !== 0) {
    issues.push("$.summary.publicExportMissingCount: expected zero missing public exports.");
  }
  if (Number(report?.summary?.packageForbiddenFileEntryCount ?? 0) !== 0) {
    issues.push("$.summary.packageForbiddenFileEntryCount: expected zero forbidden package file entries.");
  }
  if (report?.releaseGateSummary?.sourceStructurePass !== true) {
    issues.push("$.releaseGateSummary.sourceStructurePass: expected true.");
  }
  if (report?.releaseGateSummary?.canUseAsNoSpendSourceStructureEvidence !== true) {
    issues.push("$.releaseGateSummary.canUseAsNoSpendSourceStructureEvidence: expected true.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; source structure is not commercial release approval.");
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
  const externalEvidenceProductGaps = productCodeGaps.filter((item) => item?.completionRequiresExternalEvidence === true);
  const scopeDecisionProductGaps = productCodeGaps.filter((item) => item?.scopeDecisionRequired === true);
  const blocksFullSnapshotParity = productCodeGaps.some((item) => item?.blocksFullSnapshotParity === true);
  const blocksApiCliCommercialLaunch = productCodeGaps.some((item) => item?.blocksApiCliCommercialLaunch === true);
  const scopeSummary = report?.commercialOfferScopeSummary;
  const firstPartyUiGap = productCodeGaps.find((item) => item?.id === "first_party_web_ui");

  if (!report?.sourceReports?.launchIntake) {
    issues.push("$.sourceReports.launchIntake: expected commercial launch intake report source status.");
  }

  if (Number(report?.codeWorkSummary?.knownCodeBlockingIssueCount ?? -1) !== codeBlockers.length) {
    issues.push("$.codeWorkSummary.knownCodeBlockingIssueCount: expected to equal codebase-owned blocker count.");
  }
  if (Number(report?.codeWorkSummary?.knownProductCodeGapCount ?? -1) !== productCodeGaps.length) {
    issues.push("$.codeWorkSummary.knownProductCodeGapCount: expected to equal productCodeGaps length.");
  }
  if (Number(report?.codeWorkSummary?.automatableProductCodeGapCount ?? -1) !== automatableProductGaps.length) {
    issues.push("$.codeWorkSummary.automatableProductCodeGapCount: expected to equal automatable product-code gap count.");
  }
  if (Number(report?.codeWorkSummary?.externalEvidenceProductCodeGapCount ?? -1) !== externalEvidenceProductGaps.length) {
    issues.push("$.codeWorkSummary.externalEvidenceProductCodeGapCount: expected to equal product-code gaps that require external evidence.");
  }
  if (Number(report?.codeWorkSummary?.scopeDecisionProductCodeGapCount ?? -1) !== scopeDecisionProductGaps.length) {
    issues.push("$.codeWorkSummary.scopeDecisionProductCodeGapCount: expected to equal product-code gaps that require a product-scope decision.");
  }
  if (report?.codeWorkSummary?.blocksFullSnapshotParity !== blocksFullSnapshotParity) {
    issues.push("$.codeWorkSummary.blocksFullSnapshotParity: expected to match productCodeGaps[*].blocksFullSnapshotParity.");
  }
  if (report?.codeWorkSummary?.blocksApiCliCommercialLaunch !== blocksApiCliCommercialLaunch) {
    issues.push("$.codeWorkSummary.blocksApiCliCommercialLaunch: expected to match productCodeGaps[*].blocksApiCliCommercialLaunch.");
  }
  if (!scopeSummary || typeof scopeSummary !== "object") {
    issues.push("$.commercialOfferScopeSummary: expected commercial offer scope summary.");
  } else {
    if (scopeSummary.launchIntakeStatus !== report?.sourceReports?.launchIntake?.status) {
      issues.push("$.commercialOfferScopeSummary.launchIntakeStatus: expected to match sourceReports.launchIntake.status.");
    }
    if (scopeSummary.blocksFullSnapshotParity !== true) {
      issues.push("$.commercialOfferScopeSummary.blocksFullSnapshotParity: expected true while the full first-party commercial Web UI is incomplete.");
    }
    if (firstPartyUiGap) {
      if (firstPartyUiGap.scopeDecisionRequired !== scopeSummary.scopeDecisionRequired) {
        issues.push("$.productCodeGaps[id=first_party_web_ui].scopeDecisionRequired: expected to match commercialOfferScopeSummary.scopeDecisionRequired.");
      }
      if (firstPartyUiGap.blocksApiCliCommercialLaunch !== scopeSummary.blocksApiCliCommercialLaunch) {
        issues.push("$.productCodeGaps[id=first_party_web_ui].blocksApiCliCommercialLaunch: expected to match commercialOfferScopeSummary.blocksApiCliCommercialLaunch.");
      }
      if (scopeSummary.status === "api_cli_only_scoped" && firstPartyUiGap.status !== "scoped_out_for_api_cli_launch") {
        issues.push("$.productCodeGaps[id=first_party_web_ui].status: expected scoped_out_for_api_cli_launch when commercial offer is API/CLI-only.");
      }
      if (scopeSummary.status === "first_party_web_ui_required" && firstPartyUiGap.status !== "required_before_customer_traffic") {
        issues.push("$.productCodeGaps[id=first_party_web_ui].status: expected required_before_customer_traffic when commercial offer requires Web UI.");
      }
      if (scopeSummary.status === "scope_decision_pending" && firstPartyUiGap.status !== "scope_decision_pending") {
        issues.push("$.productCodeGaps[id=first_party_web_ui].status: expected scope_decision_pending when commercial offer scope is undecided.");
      }
      if (typeof firstPartyUiGap.label === "string" && /not implemented/i.test(firstPartyUiGap.label)) {
        issues.push("$.productCodeGaps[id=first_party_web_ui].label: expected partial commercial Web UI wording, not a stale not-implemented claim.");
      }
      if (Number(firstPartyUiGap.currentCoveragePercent ?? -1) <= 0) {
        issues.push("$.productCodeGaps[id=first_party_web_ui].currentCoveragePercent: expected positive coverage because the Short Studio/operator UI shells and UI contracts exist.");
      }
      if (typeof firstPartyUiGap.sourceEvidence === "string" && !firstPartyUiGap.sourceEvidence.includes("short-mvp-ui-contract-smoke-report.json")) {
        issues.push("$.productCodeGaps[id=first_party_web_ui].sourceEvidence: expected current Short MVP UI contract evidence.");
      }
    } else {
      issues.push("$.productCodeGaps: expected first_party_web_ui product-code gap until the full first-party commercial Web UI is complete or explicitly scoped out.");
    }
  }
  issues.push(
    ...validateOperatorHandoffSummary(
      report?.operatorHandoffSummary,
      "$.operatorHandoffSummary",
      report?.sourceReports?.commercialInputs,
      { expectedCommandPlanStatus: report?.readinessSnapshot?.commandPlanAuditStatus }
    )
  );
  issues.push(
    ...validateSnapshotParityCoverageSummary(
      report?.snapshotParityCoverageSummary,
      "$.snapshotParityCoverageSummary",
      report?.sourceReports?.snapshotParity
    )
  );

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
  issues.push(
    ...validateEvidenceClosurePlan(
      report?.evidenceClosurePlan,
      "$.evidenceClosurePlan",
      { blockers, blockerSummary: report?.blockerSummary }
    )
  );

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
  for (const gap of externalEvidenceProductGaps) {
    if (gap?.canAutomateNow === true) {
      issues.push(`$.productCodeGaps[id=${gap?.id}].canAutomateNow: expected false when completionRequiresExternalEvidence=true.`);
    }
    if (!Number.isSafeInteger(gap?.remainingEvidenceGateCount) || gap.remainingEvidenceGateCount <= 0) {
      issues.push(`$.productCodeGaps[id=${gap?.id}].remainingEvidenceGateCount: expected a positive integer when external evidence is required.`);
    }
  }
  for (const gap of scopeDecisionProductGaps) {
    if (gap?.canAutomateNow === true || gap?.completionRequiresExternalEvidence === true) {
      issues.push(`$.productCodeGaps[id=${gap?.id}]: scope-decision gaps must not also be automatable or external-evidence gaps.`);
    }
    if (!Array.isArray(gap?.scopeDecisionOptions) || gap.scopeDecisionOptions.length < 2) {
      issues.push(`$.productCodeGaps[id=${gap?.id}].scopeDecisionOptions: expected at least two explicit scope options.`);
    }
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

function validateRoadmapClosureAuditSemantics(report) {
  const issues = [];
  const requirements = Array.isArray(report?.requirements) ? report.requirements : [];
  if (report?.releaseEvidence !== false) {
    issues.push("$.releaseEvidence: expected false.");
  }
  if (Number(report?.summary?.requirementCount ?? -1) !== requirements.length) {
    issues.push("$.summary.requirementCount: expected to equal requirements length.");
  }
  const satisfiedCount = requirements.filter((item) => item?.status === "satisfied").length;
  if (Number(report?.summary?.satisfiedRequirementCount ?? -1) !== satisfiedCount) {
    issues.push("$.summary.satisfiedRequirementCount: expected to equal satisfied requirement count.");
  }
  if (Number(report?.summary?.blockedRequirementCount ?? -1) !== requirements.length - satisfiedCount) {
    issues.push("$.summary.blockedRequirementCount: expected to equal unsatisfied requirement count.");
  }
  const sourceCoverage = requirements.flatMap((item) => Array.isArray(item?.sourceCoverage) ? item.sourceCoverage : []);
  const sourceAnchorIssueCount = sourceCoverage.filter((item) => item?.present !== true).length;
  if (Number(report?.summary?.sourceAnchorIssueCount ?? -1) !== sourceAnchorIssueCount) {
    issues.push("$.summary.sourceAnchorIssueCount: expected to equal missing source anchor count.");
  }
  const localPrepCount = requirements.reduce((sum, item) => sum + Number(item?.localPreparationCommandCount ?? 0), 0);
  if (Number(report?.summary?.localPreparationCommandCount ?? -1) !== localPrepCount) {
    issues.push("$.summary.localPreparationCommandCount: expected to equal phase local prep command counts.");
  }
  const directCommandCount = requirements.reduce((sum, item) => sum + Number(item?.directCommandCount ?? 0), 0);
  if (Number(report?.summary?.directCommandCount ?? -1) !== directCommandCount) {
    issues.push("$.summary.directCommandCount: expected to equal requirement direct command counts.");
  }
  const blockerIds = uniqueStrings(requirements.flatMap((item) => arrayOfStrings(item?.blockerIds)));
  if (Number(report?.summary?.blockerCount ?? -1) !== blockerIds.length) {
    issues.push("$.summary.blockerCount: expected to equal unique blocker IDs across requirements.");
  }
  const productGapIds = uniqueStrings(requirements.flatMap((item) => arrayOfStrings(item?.productGapIds)));
  if (Number(report?.summary?.productGapCount ?? -1) !== productGapIds.length) {
    issues.push("$.summary.productGapCount: expected to equal unique product gap IDs across requirements.");
  }
  issues.push(...compareCountMap("$.summary.statusCounts", report?.summary?.statusCounts, countBy(requirements, "status")));
  for (const [name, summary] of Object.entries(report?.sourceDocSummary ?? {})) {
    const coverage = sourceCoverage.filter((item) => item?.source === name);
    if (Number(summary?.anchorCount ?? -1) !== coverage.length) {
      issues.push(`$.sourceDocSummary.${name}.anchorCount: expected to equal coverage anchor count.`);
    }
    if (Number(summary?.missingAnchorCount ?? -1) !== coverage.filter((item) => item?.present !== true).length) {
      issues.push(`$.sourceDocSummary.${name}.missingAnchorCount: expected to equal missing coverage anchor count.`);
    }
  }
  for (const requirement of requirements) {
    const path = `$.requirements[id=${requirement?.id}]`;
    const blockers = Array.isArray(requirement?.blockers) ? requirement.blockers : [];
    const productGaps = Array.isArray(requirement?.productGaps) ? requirement.productGaps : [];
    const localPreparationCommands = Array.isArray(requirement?.localPreparationCommands) ? requirement.localPreparationCommands : [];
    const directCommands = Array.isArray(requirement?.directCommands) ? requirement.directCommands : [];
    const directCommandGuards = Array.isArray(requirement?.directCommandGuards) ? requirement.directCommandGuards : [];
    if (requirement?.releaseEvidence !== false) {
      issues.push(`${path}.releaseEvidence: expected false.`);
    }
    if (Number(requirement?.blockerCount ?? -1) !== blockers.length || arrayOfStrings(requirement?.blockerIds).length !== blockers.length) {
      issues.push(`${path}.blockerCount: expected to match blockers and blockerIds length.`);
    }
    if (Number(requirement?.productGapCount ?? -1) !== productGaps.length || arrayOfStrings(requirement?.productGapIds).length !== productGaps.length) {
      issues.push(`${path}.productGapCount: expected to match productGaps and productGapIds length.`);
    }
    if (Number(requirement?.localPreparationCommandCount ?? -1) !== localPreparationCommands.length) {
      issues.push(`${path}.localPreparationCommandCount: expected to match localPreparationCommands length.`);
    }
    if (Number(requirement?.directCommandCount ?? -1) !== directCommands.length) {
      issues.push(`${path}.directCommandCount: expected to match directCommands length.`);
    }
    if (directCommandGuards.length !== directCommands.length) {
      issues.push(`${path}.directCommandGuards: expected one guard per direct command.`);
    }
    const expectedCoverageStatus = (Array.isArray(requirement?.sourceCoverage) ? requirement.sourceCoverage : []).every((item) => item?.present === true) ? "pass" : "fail";
    if (requirement?.sourceCoverageStatus !== expectedCoverageStatus) {
      issues.push(`${path}.sourceCoverageStatus: expected ${expectedCoverageStatus}.`);
    }
    if (requirement?.evidenceSufficient !== (requirement?.status === "satisfied")) {
      issues.push(`${path}.evidenceSufficient: expected true only when status is satisfied.`);
    }
    if (requirement?.status === "satisfied" && (blockers.length > 0 || productGaps.some((item) => item?.blocksFullSnapshotParity === true || item?.completionRequiresExternalEvidence === true))) {
      issues.push(`${path}.status: cannot be satisfied while blocker or external product gap evidence remains.`);
    }
    for (const command of localPreparationCommands) {
      if (
        command?.releaseEvidence !== false ||
        command?.requiresLiveNetwork === true ||
        command?.requiresProviderSpend === true ||
        command?.requiresOperatorConfirmation === true ||
        command?.requiresManualReview === true ||
        command?.containsPlaceholder === true
      ) {
        issues.push(`${path}.localPreparationCommands[name=${command?.name}]: expected local prep to remain no-spend, no-live, no-confirmation, no-manual-review, placeholder-free, and non-release evidence.`);
      }
      if (command?.producesDrafts !== true || !Array.isArray(command?.draftFiles) || command.draftFiles.length === 0) {
        issues.push(`${path}.localPreparationCommands[name=${command?.name}]: expected draft-producing command with draft files.`);
      }
      issues.push(...validateEvidenceClosureFileList(command?.draftFiles, `${path}.localPreparationCommands[name=${command?.name}].draftFiles`, ["assets/output_deliverables/"]));
    }
    for (const command of directCommands) {
      if (String(command ?? "").match(/\bStep\s+\d+:/)) {
        issues.push(`${path}.directCommands: expected expanded commands without embedded Step labels.`);
      }
    }
    for (const guard of directCommandGuards) {
      const command = String(guard?.command ?? "");
      if (!directCommands.includes(command)) {
        issues.push(`${path}.directCommandGuards: expected guard command to be listed in directCommands.`);
      }
      const expectedFlags = commandGuardFlags(command);
      for (const [key, expected] of Object.entries(expectedFlags)) {
        if (guard?.[key] !== expected) {
          issues.push(`${path}.directCommandGuards[command=${command}].${key}: expected ${expected}.`);
        }
      }
    }
    if (arrayOfStrings(requirement?.blockerIds).includes("generated_audio_paid_review")) {
      const artifactIndex = directCommands.findIndex((command) => String(command).includes("validation:generated-audio-artifact"));
      const reviewDraftIndex = directCommands.findIndex((command) => String(command).includes("validation:generated-audio-review-draft"));
      const reviewExistingIndex = directCommands.findIndex((command) => String(command).includes("--review-existing-report") && String(command).includes("--manual-audio-review"));
      if (artifactIndex < 0) {
        issues.push(`${path}.directCommands: expected generated-audio artifact evidence capture command.`);
      }
      if (reviewDraftIndex < 0) {
        issues.push(`${path}.directCommands: expected generated-audio manual-review draft command.`);
      }
      if (reviewExistingIndex < 0) {
        issues.push(`${path}.directCommands: expected generated-audio review-existing manual-audio command.`);
      }
      if (artifactIndex >= 0 && reviewDraftIndex >= 0 && reviewExistingIndex >= 0 && !(artifactIndex < reviewDraftIndex && reviewDraftIndex < reviewExistingIndex)) {
        issues.push(`${path}.directCommands: expected generated-audio commands in artifact, review-draft, review-existing order.`);
      }
    }
    if (arrayOfStrings(requirement?.blockerIds).includes("long_form_paid_media_review")) {
      const reviewDraftIndex = directCommands.findIndex((command) => String(command).includes("validation:long-form-review-draft"));
      const paidRunIndex = directCommands.findIndex((command) => String(command).includes("validation:long-form") && String(command).includes("--manual-quality-review"));
      if (reviewDraftIndex < 0) {
        issues.push(`${path}.directCommands: expected long-form manual quality review draft command.`);
      }
      if (paidRunIndex < 0) {
        issues.push(`${path}.directCommands: expected long-form paid manual-quality-review command.`);
      }
      if (reviewDraftIndex >= 0 && paidRunIndex >= 0 && reviewDraftIndex > paidRunIndex) {
        issues.push(`${path}.directCommands: expected long-form commands in review-draft, paid-run order.`);
      }
    }
  }
  if (report?.status === "ready_for_customer_traffic") {
    if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== true || satisfiedCount !== requirements.length) {
      issues.push("$.status: ready_for_customer_traffic requires every requirement satisfied and releaseGateSummary.canReleaseToCustomerTraffic=true.");
    }
  }
  if (report?.status === "fail" && sourceAnchorIssueCount === 0) {
    issues.push("$.status: fail is only expected when source anchor coverage is missing.");
  }
  if (report?.status === "blocked_by_code_or_contracts" && Number(report?.releaseGateSummary?.knownCodeBlockingIssueCount ?? 0) <= 0) {
    issues.push("$.status: blocked_by_code_or_contracts requires known code blockers.");
  }
  if (report?.status === "blocked_by_external_inputs" && satisfiedCount === requirements.length) {
    issues.push("$.status: blocked_by_external_inputs requires at least one unsatisfied roadmap requirement.");
  }
  if (report?.releaseGateSummary?.canClaimFullSnapshotParity === true && requirements.some((item) => item?.productGapCount > 0 && item?.status !== "satisfied")) {
    issues.push("$.releaseGateSummary.canClaimFullSnapshotParity: expected false while product-gap requirements remain unsatisfied.");
  }
  if (report?.status !== "ready_for_customer_traffic" && (!Array.isArray(report?.nextActions) || report.nextActions.length === 0)) {
    issues.push("$.nextActions: expected next actions while roadmap closure is not ready.");
  }
  return issues;
}

function validateMaterialSourceScoringSmokeSemantics(report) {
  const issues = [];
  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for material-source scoring smoke.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend/no-network/no-provider smoke.");
  }
  if (report?.releaseGateSummary?.canUseAsLiveRemoteStockEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseAsLiveRemoteStockEvidence: expected false; smoke is not live provider evidence.");
  }
  if (report?.releaseGateSummary?.canUseAsMaterialScoringBackendEvidence !== true) {
    issues.push("$.releaseGateSummary.canUseAsMaterialScoringBackendEvidence: expected true when smoke passes.");
  }
  const evaluations = Array.isArray(report?.candidateEvaluations) ? report.candidateEvaluations : [];
  const candidateCount = Number(report?.materialValidation?.candidateCount ?? -1);
  if (evaluations.length !== candidateCount) {
    issues.push("$.candidateEvaluations: expected one candidate evaluation per synthetic candidate.");
  }
  if (Number(report?.materialValidation?.candidateEvaluationCount ?? -1) !== evaluations.length) {
    issues.push("$.materialValidation.candidateEvaluationCount: expected to match candidateEvaluations length.");
  }
  const decisions = new Set(evaluations.map((item) => String(item?.decision ?? "")));
  for (const decision of ["approved", "review_required", "rejected"]) {
    if (!decisions.has(decision) || Number(report?.materialValidation?.decisionCounts?.[decision] ?? 0) <= 0) {
      issues.push(`$.candidateEvaluations: expected ${decision} decision coverage.`);
    }
  }
  for (const [index, evaluation] of evaluations.entries()) {
    const fitScore = Number(evaluation?.fitScore);
    const maxFitScore = Number(evaluation?.maxFitScore);
    if (!Number.isFinite(fitScore) || fitScore < 0 || fitScore > 100 || maxFitScore !== 100) {
      issues.push(`$.candidateEvaluations[${index}].fitScore: expected bounded 0-100 score.`);
    }
    const scoreFactors = Array.isArray(evaluation?.scoreFactors) ? evaluation.scoreFactors : [];
    const factorScore = scoreFactors.reduce((sum, factor) => sum + Number(factor?.score ?? 0), 0);
    if (Math.min(100, factorScore) !== fitScore) {
      issues.push(`$.candidateEvaluations[${index}].fitScore: expected to equal bounded sum of scoreFactors.`);
    }
  }
  if (/https?:\/\/|asset:\/\/|token=/i.test(JSON.stringify(evaluations))) {
    issues.push("$.candidateEvaluations: expected score evidence without raw candidate URIs or token-looking text.");
  }
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (checks.length === 0 || checks.some((check) => check?.status !== "pass")) {
    issues.push("$.checks: expected all smoke checks to pass.");
  }
  return issues;
}

function validateSourceVideoAutoAnalysisSmokeSemantics(report) {
  const issues = [];
  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for source-video auto-analysis smoke.");
  }
  if (
    report?.noSpend !== true ||
    report?.networkCallsMade !== false ||
    report?.providerCallsMade !== false ||
    report?.sourceVideoFetchMade !== false
  ) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade/sourceVideoFetchMade: expected no-spend/no-network/no-provider/no-fetch smoke.");
  }
  if (report?.releaseGateSummary?.canUseAsSourceVideoAutoAnalysisBackendEvidence !== true) {
    issues.push("$.releaseGateSummary.canUseAsSourceVideoAutoAnalysisBackendEvidence: expected true when smoke passes.");
  }
  if (report?.releaseGateSummary?.canUseAsBusinessReadinessSourceVideoEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseAsBusinessReadinessSourceVideoEvidence: expected false; smoke is not live source-video evidence.");
  }
  if (report?.releaseGateSummary?.canOpenPaidCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canOpenPaidCustomerTraffic: expected false; smoke cannot open customer traffic.");
  }

  const scenarios = Array.isArray(report?.scenarioSummaries) ? report.scenarioSummaries : [];
  const scenarioByName = new Map(scenarios.map((scenario) => [String(scenario?.name ?? ""), scenario]));
  const requiredScenarios = [
    "disabled_leaves_request_unchanged",
    "existing_analysis_not_overwritten",
    "asset_reference_skipped",
    "secret_query_reference_skipped",
    "secret_query_value_reference_skipped",
    "localhost_reference_skipped",
    "clean_https_generates_bounded_analysis",
    "leaking_output_rejected_non_strict",
    "strict_empty_analysis_throws"
  ];
  for (const scenarioName of requiredScenarios) {
    if (!scenarioByName.has(scenarioName)) {
      issues.push(`$.scenarioSummaries: expected ${scenarioName} scenario.`);
    }
  }
  if (Number(report?.summary?.scenarioCount ?? -1) !== scenarios.length) {
    issues.push("$.summary.scenarioCount: expected to match scenarioSummaries length.");
  }
  if (Number(report?.summary?.passingScenarioCount ?? -1) !== scenarios.filter((scenario) => scenario?.status === "pass").length) {
    issues.push("$.summary.passingScenarioCount: expected to match passing scenarios.");
  }
  if (Number(report?.summary?.failingScenarioCount ?? -1) !== scenarios.filter((scenario) => scenario?.status === "fail").length) {
    issues.push("$.summary.failingScenarioCount: expected to match failing scenarios.");
  }
  if (Number(report?.summary?.frameSamplerCallCount ?? -1) !== scenarios.reduce((sum, scenario) => sum + Number(scenario?.frameSamplerCallCount ?? 0), 0)) {
    issues.push("$.summary.frameSamplerCallCount: expected to match scenario frame sampler calls.");
  }
  if (Number(report?.summary?.syntheticLlmCallCount ?? -1) !== scenarios.reduce((sum, scenario) => sum + Number(scenario?.syntheticLlmCallCount ?? 0), 0)) {
    issues.push("$.summary.syntheticLlmCallCount: expected to match scenario synthetic LLM calls.");
  }

  const disabled = scenarioByName.get("disabled_leaves_request_unchanged");
  if (disabled?.frameSamplerCallCount !== 0 || disabled?.syntheticLlmCallCount !== 0 || disabled?.analysisPresent !== false) {
    issues.push("$.scenarioSummaries[disabled_leaves_request_unchanged]: expected no sampler call, no LLM call, and no analysis.");
  }
  const existing = scenarioByName.get("existing_analysis_not_overwritten");
  if (existing?.preservedExistingAnalysis !== true || existing?.frameSamplerCallCount !== 0 || existing?.syntheticLlmCallCount !== 0) {
    issues.push("$.scenarioSummaries[existing_analysis_not_overwritten]: expected caller analysis to be preserved with no side effects.");
  }
  for (const scenarioName of [
    "asset_reference_skipped",
    "secret_query_reference_skipped",
    "secret_query_value_reference_skipped",
    "localhost_reference_skipped"
  ]) {
    const scenario = scenarioByName.get(scenarioName);
    if (scenario?.frameSamplerCallCount !== 0 || scenario?.syntheticLlmCallCount !== 0 || scenario?.analysisPresent !== false) {
      issues.push(`$.scenarioSummaries[${scenarioName}]: expected unsafe reference to be skipped before frame sampling.`);
    }
  }
  const cleanHttps = scenarioByName.get("clean_https_generates_bounded_analysis");
  if (
    cleanHttps?.analysisPresent !== true ||
    Number(cleanHttps?.sceneCount ?? 0) < 1 ||
    Number(cleanHttps?.keyframeCount ?? 0) < 1 ||
    cleanHttps?.noInlineFrameDataInAnalysis !== true ||
    cleanHttps?.noLocalFramePathsInAnalysis !== true
  ) {
    issues.push("$.scenarioSummaries[clean_https_generates_bounded_analysis]: expected safe bounded analysis with scenes and keyframes.");
  }
  if (
    cleanHttps?.llmImagePartCount !== cleanHttps?.llmDataImagePartCount ||
    Number(cleanHttps?.llmImagePartCount ?? 0) <= 0 ||
    Number(cleanHttps?.llmNonDataImagePartCount ?? 0) !== 0 ||
    cleanHttps?.llmLocalFramePathInPrompt !== false
  ) {
    issues.push("$.scenarioSummaries[clean_https_generates_bounded_analysis]: expected bounded data-image LLM parts without local frame paths.");
  }
  const leakGuard = scenarioByName.get("leaking_output_rejected_non_strict");
  if (leakGuard?.analysisPresent !== false || leakGuard?.frameSamplerCallCount !== 1 || leakGuard?.syntheticLlmCallCount !== 1) {
    issues.push("$.scenarioSummaries[leaking_output_rejected_non_strict]: expected leaking output to be rejected without attaching analysis.");
  }
  const strictEmpty = scenarioByName.get("strict_empty_analysis_throws");
  const strictEmptyError = String(strictEmpty?.thrownErrorRedacted ?? "");
  if (
    !strictEmptyError.includes("no usable deconstruction content") &&
    !strictEmptyError.includes("sourceVideoAnalysis must include at least one transformationIntent")
  ) {
    issues.push("$.scenarioSummaries[strict_empty_analysis_throws].thrownErrorRedacted: expected strict unusable-output error.");
  }
  if (/data:image\/[a-z0-9.+-]+;base64,/i.test(JSON.stringify(report))) {
    issues.push("$.report: expected no serialized inline frame data.");
  }
  if (/[A-Z]:\\[^\"'`\s]+/i.test(JSON.stringify(report))) {
    issues.push("$.report: expected no serialized absolute local frame paths.");
  }
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (checks.length === 0 || checks.some((check) => check?.status !== "pass")) {
    issues.push("$.checks: expected all source-video smoke checks to pass.");
  }
  return issues;
}

function validateSourceVideoValidationSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const warningChecks = checks.filter((check) => check?.status === "warn");
  const spendGate = report?.spendGate ?? {};
  const atlasBillingGate = report?.atlasBillingGate ?? {};
  const analysis = report?.analysisSummary ?? {};
  const ledger = report?.providerLedger ?? {};
  const ledgerEntries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const release = report?.releaseGateSummary ?? {};
  const expectedUsable =
    report?.status === "pass" &&
    analysis?.present === true &&
    spendGate?.providerNetworkCallsAllowed === true &&
    atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true;

  if (!cleanHttpsEvidenceUrl(report?.checkedInputs?.sourceVideoUrl)) {
    issues.push("$.checkedInputs.sourceVideoUrl: expected a clean HTTPS source-video preview URL without credentials, query, fragment, or localhost.");
  }
  if (release?.canOpenPaidCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canOpenPaidCustomerTraffic: expected false; source-video validation alone cannot open customer traffic.");
  }
  if (release?.canUseAsBusinessReadinessSourceVideoEvidence !== expectedUsable) {
    issues.push("$.releaseGateSummary.canUseAsBusinessReadinessSourceVideoEvidence: expected true only for pass reports with live spend allowed, billing evidence, and present analysis.");
  }
  if (Number(ledger?.entryCount ?? -1) !== ledgerEntries.length) {
    issues.push("$.providerLedger.entryCount: expected to match entries length.");
  }
  if (objectValueSum(ledger?.operations) !== ledgerEntries.length) {
    issues.push("$.providerLedger.operations: expected operation counts to sum to entries length.");
  }
  if (objectValueSum(ledger?.statuses) !== ledgerEntries.length) {
    issues.push("$.providerLedger.statuses: expected status counts to sum to entries length.");
  }
  if (publicPayloadHasUnsafeEvidenceLeak(report, { allowCleanHttpsUrl: true })) {
    issues.push("$.publicPayload: source-video validation report must not expose data URLs, local absolute paths, signed URLs, or credential-like text.");
  }

  if (report?.status === "blocked_by_spend_confirmation") {
    if (
      spendGate?.confirmProviderSpend !== false ||
      spendGate?.providerNetworkCallsAllowed !== false ||
      spendGate?.sourceVideoFetchAllowed !== false
    ) {
      issues.push("$.spendGate: blocked_by_spend_confirmation requires all live spend/fetch flags false.");
    }
    if (!failedChecks.some((check) => check?.name === "spend_confirmation")) {
      issues.push("$.checks: blocked_by_spend_confirmation requires a failing spend_confirmation check.");
    }
    if (analysis?.present !== false || Number(ledger?.entryCount ?? -1) !== 0) {
      issues.push("$.analysisSummary/$.providerLedger: blocked_by_spend_confirmation must not include live analysis or provider ledger entries.");
    }
  }

  if (report?.status === "blocked_by_atlas_billing") {
    if (spendGate?.confirmProviderSpend !== true || spendGate?.providerNetworkCallsAllowed !== false || spendGate?.sourceVideoFetchAllowed !== false) {
      issues.push("$.spendGate: blocked_by_atlas_billing should confirm operator spend intent but still block provider network/source fetch.");
    }
    if (atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence !== false || !failedChecks.some((check) => String(check?.name ?? "").startsWith("atlas_billing_"))) {
      issues.push("$.atlasBillingGate/$.checks: blocked_by_atlas_billing requires failed Atlas billing readiness evidence.");
    }
  }

  if (report?.status === "blocked_by_readiness") {
    if (spendGate?.confirmProviderSpend !== true || spendGate?.providerNetworkCallsAllowed !== false || spendGate?.sourceVideoFetchAllowed !== false) {
      issues.push("$.spendGate: blocked_by_readiness should keep provider network/source fetch disabled.");
    }
    if (failedChecks.length === 0) {
      issues.push("$.checks: blocked_by_readiness requires at least one readiness failure.");
    }
  }

  if (report?.status === "pass") {
    if (failedChecks.length > 0 || warningChecks.length > 0) {
      issues.push("$.checks: pass source-video validation requires zero failed or warning checks.");
    }
    if (
      spendGate?.confirmProviderSpend !== true ||
      spendGate?.providerNetworkCallsAllowed !== true ||
      spendGate?.sourceVideoFetchAllowed !== true
    ) {
      issues.push("$.spendGate: pass source-video validation requires confirmed spend plus provider network and source fetch allowance.");
    }
    if (atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence !== true || atlasBillingGate?.present !== true || atlasBillingGate?.status !== "pass") {
      issues.push("$.atlasBillingGate: pass source-video validation requires fresh passing Atlas billing evidence.");
    }
    if (analysis?.present !== true || analysis?.usableContent !== true || analysis?.noInlineFrameData !== true || analysis?.noLocalFramePaths !== true) {
      issues.push("$.analysisSummary: pass source-video validation requires usable redacted analysis without inline frames or local frame paths.");
    }
    if (Number(ledger?.entryCount ?? 0) < 1) {
      issues.push("$.providerLedger.entryCount: pass source-video validation requires at least one provider ledger entry.");
    }
  }

  if (report?.status === "warn") {
    if (failedChecks.length > 0 || warningChecks.length === 0) {
      issues.push("$.checks: warn source-video validation requires warnings and no failed checks.");
    }
  }
  if (report?.status === "fail" && failedChecks.length === 0) {
    issues.push("$.checks: fail source-video validation requires at least one failed check.");
  }
  if (report?.status !== "pass" && release?.canUseAsBusinessReadinessSourceVideoEvidence === true) {
    issues.push("$.releaseGateSummary.canUseAsBusinessReadinessSourceVideoEvidence: non-pass source-video reports cannot be business-readiness evidence.");
  }
  return issues;
}

function validateRemoteStockAdapterSmokeSemantics(report) {
  const issues = [];
  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for remote-stock adapter smoke.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend/no-network/no-real-provider smoke.");
  }
  if (report?.releaseGateSummary?.canUseAsRemoteStockAdapterBackendEvidence !== true) {
    issues.push("$.releaseGateSummary.canUseAsRemoteStockAdapterBackendEvidence: expected true when smoke passes.");
  }
  if (report?.releaseGateSummary?.canUseAsLiveRemoteStockEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseAsLiveRemoteStockEvidence: expected false; smoke is not live provider evidence.");
  }
  if (report?.releaseGateSummary?.canOpenPaidCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canOpenPaidCustomerTraffic: expected false; smoke cannot open customer traffic.");
  }

  const scenarios = Array.isArray(report?.scenarioSummaries) ? report.scenarioSummaries : [];
  const scenarioByName = new Map(scenarios.map((scenario) => [String(scenario?.name ?? ""), scenario]));
  const requiredScenarios = [
    "remote_disabled_skips_provider_fetch",
    "pexels_header_credentials_and_safe_candidate",
    "pixabay_key_query_not_artifact_candidate",
    "coverr_requires_commercial_approval",
    "coverr_approved_safe_candidate",
    "provider_error_returns_empty_candidates"
  ];
  for (const scenarioName of requiredScenarios) {
    if (!scenarioByName.has(scenarioName)) {
      issues.push(`$.scenarioSummaries: expected ${scenarioName} scenario.`);
    }
  }
  if (Number(report?.summary?.scenarioCount ?? -1) !== scenarios.length) {
    issues.push("$.summary.scenarioCount: expected to match scenarioSummaries length.");
  }
  if (Number(report?.summary?.passingScenarioCount ?? -1) !== scenarios.filter((scenario) => scenario?.status === "pass").length) {
    issues.push("$.summary.passingScenarioCount: expected to match passing scenarios.");
  }
  if (Number(report?.summary?.failingScenarioCount ?? -1) !== scenarios.filter((scenario) => scenario?.status === "fail").length) {
    issues.push("$.summary.failingScenarioCount: expected to match failing scenarios.");
  }
  if (Number(report?.summary?.syntheticFetchCallCount ?? -1) !== scenarios.reduce((sum, scenario) => sum + Number(scenario?.syntheticFetchCallCount ?? 0), 0)) {
    issues.push("$.summary.syntheticFetchCallCount: expected to match scenario fetch calls.");
  }

  const disabled = scenarioByName.get("remote_disabled_skips_provider_fetch");
  if (disabled?.syntheticFetchCallCount !== 0 || disabled?.candidateCount !== 0 || disabled?.providerSearchSkipped !== true) {
    issues.push("$.scenarioSummaries[remote_disabled_skips_provider_fetch]: expected no fetch and no candidates.");
  }
  const pexels = scenarioByName.get("pexels_header_credentials_and_safe_candidate");
  if (
    pexels?.authorizationHeaderObserved !== true ||
    pexels?.searchUrlKeyQueryObserved !== false ||
    pexels?.outboundCredentialUsedOnlyForSearch !== true ||
    pexels?.unsafeRenditionSkipped !== true ||
    pexels?.shortDurationSkipped !== true ||
    pexels?.candidateCount !== 1 ||
    pexels?.materialValidatorAccepted !== true
  ) {
    issues.push("$.scenarioSummaries[pexels_header_credentials_and_safe_candidate]: expected header credential use, unsafe/short filtering, one safe candidate, and approved material validation.");
  }
  const pixabay = scenarioByName.get("pixabay_key_query_not_artifact_candidate");
  if (
    pixabay?.searchUrlKeyQueryObserved !== true ||
    pixabay?.outboundCredentialUsedOnlyForSearch !== true ||
    pixabay?.unsafeRenditionSkipped !== true ||
    pixabay?.shortDurationSkipped !== true ||
    pixabay?.candidateCount !== 1 ||
    pixabay?.materialValidatorAccepted !== true
  ) {
    issues.push("$.scenarioSummaries[pixabay_key_query_not_artifact_candidate]: expected outbound query-key use without artifact leakage and one approved safe candidate.");
  }
  const coverrGate = scenarioByName.get("coverr_requires_commercial_approval");
  if (
    coverrGate?.syntheticFetchCallCount !== 0 ||
    coverrGate?.candidateCount !== 0 ||
    coverrGate?.coverrCommercialApprovalRequired !== true ||
    !String(coverrGate?.thrownErrorRedacted ?? "").includes("commercialUseApproved=true")
  ) {
    issues.push("$.scenarioSummaries[coverr_requires_commercial_approval]: expected constructor gate before fetch unless commercialUseApproved=true.");
  }
  const coverrApproved = scenarioByName.get("coverr_approved_safe_candidate");
  if (
    coverrApproved?.authorizationHeaderObserved !== true ||
    coverrApproved?.outboundCredentialUsedOnlyForSearch !== true ||
    coverrApproved?.candidateCount !== 1 ||
    coverrApproved?.materialValidatorAccepted !== true ||
    coverrApproved?.coverrCommercialApprovalRequired !== true
  ) {
    issues.push("$.scenarioSummaries[coverr_approved_safe_candidate]: expected explicit commercial approval, bearer search credential, and one approved safe candidate.");
  }
  const providerError = scenarioByName.get("provider_error_returns_empty_candidates");
  if (
    providerError?.syntheticFetchCallCount !== 1 ||
    providerError?.candidateCount !== 0 ||
    providerError?.providerFailureHandled !== true ||
    providerError?.materialValidationStatus !== "planned_only"
  ) {
    issues.push("$.scenarioSummaries[provider_error_returns_empty_candidates]: expected one failed fake fetch to fail closed as zero candidates.");
  }

  for (const [index, scenario] of scenarios.entries()) {
    if (scenario?.status !== "pass") {
      issues.push(`$.scenarioSummaries[${index}].status: expected pass.`);
    }
    if (scenario?.onlyCredentialFreeHttpsCandidates !== true || scenario?.noCredentialMaterialized !== true) {
      issues.push(`$.scenarioSummaries[${index}]: expected credential-free HTTPS-only candidate materialization.`);
    }
    if (scenario?.candidateCountWithinBounds !== true) {
      issues.push(`$.scenarioSummaries[${index}].candidateCountWithinBounds: expected true.`);
    }
  }

  const material = report?.materialValidation ?? {};
  const evaluations = Array.isArray(report?.candidateEvaluations) ? report.candidateEvaluations : [];
  const candidateSummaries = Array.isArray(report?.candidateSummaries) ? report.candidateSummaries : [];
  if (material.status !== "approved" || Number(material.candidateCount ?? -1) !== 3 || Number(material.approvedCandidateCount ?? -1) !== 3) {
    issues.push("$.materialValidation: expected approved aggregate validation with exactly 3 approved synthetic candidates.");
  }
  if (Number(report?.summary?.generatedCandidateCount ?? -1) !== candidateSummaries.length || candidateSummaries.length !== 3) {
    issues.push("$.candidateSummaries: expected exactly 3 public candidate summaries matching summary.generatedCandidateCount.");
  }
  if (Number(material.candidateEvaluationCount ?? -1) !== evaluations.length || evaluations.length !== candidateSummaries.length) {
    issues.push("$.candidateEvaluations: expected one aggregate evaluation per public candidate summary.");
  }
  for (const [index, evaluation] of evaluations.entries()) {
    const fitScore = Number(evaluation?.fitScore);
    const maxFitScore = Number(evaluation?.maxFitScore);
    if (evaluation?.decision !== "approved" || !Number.isFinite(fitScore) || fitScore < 80 || fitScore > 100 || maxFitScore !== 100) {
      issues.push(`$.candidateEvaluations[${index}]: expected approved decision with bounded 80-100 score.`);
    }
  }
  for (const [index, candidate] of candidateSummaries.entries()) {
    if (!/^[a-f0-9]{64}$/.test(String(candidate?.uriFingerprint ?? ""))) {
      issues.push(`$.candidateSummaries[${index}].uriFingerprint: expected SHA-256 fingerprint instead of raw URI.`);
    }
    if (candidate?.rightsStatus !== "requires_attribution" || candidate?.attributionPresent !== true || candidate?.selected !== true) {
      issues.push(`$.candidateSummaries[${index}]: expected selected attribution-required stock candidate with attribution present.`);
    }
  }

  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (checks.length === 0 || checks.some((check) => check?.status !== "pass")) {
    issues.push("$.checks: expected all remote-stock adapter smoke checks to pass.");
  }
  const text = JSON.stringify(report);
  if (/https?:\/\/|asset:\/\//i.test(text)) {
    issues.push("$.report: expected no raw URLs or asset URIs in public remote-stock adapter smoke report.");
  }
  if (/([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|sig|auth)=)|Bearer\s+[A-Za-z0-9._-]{12,}/i.test(text)) {
    issues.push("$.report: expected no bearer header or secret-like query text.");
  }
  return issues;
}

function validateRemoteStockValidationSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const warningChecks = checks.filter((check) => check?.status === "warn");
  const gate = report?.liveNetworkGate ?? {};
  const providers = Array.isArray(report?.providers) ? report.providers : [];
  const material = report?.materialValidation ?? {};
  const release = report?.releaseGateSummary ?? {};
  const providerCandidateCount = providers.reduce((sum, provider) => sum + Number(provider?.candidateCount ?? 0), 0);
  const providerSelectedCount = providers.reduce((sum, provider) => sum + Number(provider?.selectedCandidateCount ?? 0), 0);
  const providerApprovedCount = providers.reduce((sum, provider) => sum + Number(provider?.approvedCandidateCount ?? 0), 0);
  const expectedUsable =
    report?.status === "pass" &&
    gate?.providerNetworkCallsAllowed === true &&
    gate?.confirmCommercialTermsReviewed === true &&
    providers.length > 0 &&
    providers.every((provider) => provider?.status === "pass") &&
    material?.status === "approved";

  if (release?.canOpenPaidCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canOpenPaidCustomerTraffic: expected false; remote-stock validation alone cannot open customer traffic.");
  }
  if (release?.canUseAsBusinessReadinessRemoteStockEvidence !== expectedUsable) {
    issues.push("$.releaseGateSummary.canUseAsBusinessReadinessRemoteStockEvidence: expected true only for pass reports with confirmed live network, commercial terms, passing providers, and approved material validation.");
  }
  if (publicPayloadHasUnsafeEvidenceLeak(report, { allowCleanHttpsUrl: false })) {
    issues.push("$.publicPayload: remote-stock validation report must not expose raw URLs, signed URLs, local absolute paths, or credential-like text.");
  }
  if (Number(material?.candidateCount ?? -1) !== providerCandidateCount) {
    issues.push("$.materialValidation.candidateCount: expected to match summed provider candidateCount.");
  }
  if (Number(material?.selectedCandidateCount ?? -1) !== providerSelectedCount) {
    issues.push("$.materialValidation.selectedCandidateCount: expected to match summed provider selectedCandidateCount.");
  }
  if (Number(material?.approvedCandidateCount ?? -1) !== providerApprovedCount) {
    issues.push("$.materialValidation.approvedCandidateCount: expected to match summed provider approvedCandidateCount.");
  }
  if (Number(material?.candidateEvaluationCount ?? -1) !== Number(material?.candidateCount ?? -2)) {
    issues.push("$.materialValidation.candidateEvaluationCount: expected one evaluation per remote-stock candidate.");
  }
  if (report?.runtimeSettings?.providerCount !== undefined && Number(report.runtimeSettings.providerCount) !== providers.length && gate?.providerNetworkCallsAllowed === true) {
    issues.push("$.runtimeSettings.providerCount: expected to match provider summaries when live provider calls are allowed.");
  }

  if (report?.status === "blocked_by_network_confirmation") {
    if (
      gate?.confirmLiveNetwork !== false ||
      gate?.providerNetworkCallsAllowed !== false ||
      providers.length !== 0 ||
      material?.status !== "planned_only"
    ) {
      issues.push("$.liveNetworkGate/$.providers/$.materialValidation: blocked_by_network_confirmation must not include live provider evidence.");
    }
    if (!failedChecks.some((check) => check?.name === "network_confirmation")) {
      issues.push("$.checks: blocked_by_network_confirmation requires a failing network_confirmation check.");
    }
  }

  if (report?.status === "blocked_by_configuration") {
    if (gate?.confirmLiveNetwork !== true || gate?.providerNetworkCallsAllowed !== false || providers.length !== 0) {
      issues.push("$.liveNetworkGate/$.providers: blocked_by_configuration should confirm live-network intent but keep provider calls blocked.");
    }
    if (failedChecks.length === 0) {
      issues.push("$.checks: blocked_by_configuration requires at least one configuration failure.");
    }
  }

  if (report?.status === "pass") {
    if (failedChecks.length > 0 || warningChecks.length > 0) {
      issues.push("$.checks: pass remote-stock validation requires zero failed or warning checks.");
    }
    if (gate?.confirmLiveNetwork !== true || gate?.providerNetworkCallsAllowed !== true || gate?.confirmCommercialTermsReviewed !== true) {
      issues.push("$.liveNetworkGate: pass remote-stock validation requires confirmed live network and commercial terms review.");
    }
    if (providers.length === 0 || providers.some((provider) => provider?.status !== "pass" || Number(provider?.candidateCount ?? 0) <= 0 || Number(provider?.approvedCandidateCount ?? 0) <= 0)) {
      issues.push("$.providers: pass remote-stock validation requires at least one passing provider with approved candidates.");
    }
    if (material?.status !== "approved" || Number(material?.approvedCandidateCount ?? 0) <= 0) {
      issues.push("$.materialValidation: pass remote-stock validation requires approved aggregate material validation.");
    }
  }

  if (report?.status === "warn") {
    if (failedChecks.length > 0 || warningChecks.length === 0) {
      issues.push("$.checks: warn remote-stock validation requires warnings and no failed checks.");
    }
  }
  if (report?.status === "fail" && failedChecks.length === 0) {
    issues.push("$.checks: fail remote-stock validation requires at least one failed check.");
  }
  if (report?.status !== "pass" && release?.canUseAsBusinessReadinessRemoteStockEvidence === true) {
    issues.push("$.releaseGateSummary.canUseAsBusinessReadinessRemoteStockEvidence: non-pass remote-stock reports cannot be business-readiness evidence.");
  }
  return issues;
}

function objectValueSum(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  return Object.values(value).reduce((sum, item) => sum + Number(item ?? 0), 0);
}

function cleanHttpsEvidenceUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !isEvidenceLocalhost(url.hostname);
  } catch {
    return false;
  }
}

function isEvidenceLocalhost(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function publicPayloadHasUnsafeEvidenceLeak(value, { allowCleanHttpsUrl }) {
  const text = JSON.stringify(value ?? "");
  const unsafePatterns = [
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /sk-[A-Za-z0-9_-]{8,}/i,
    /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/i,
    /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|sig|auth)=)[^&#\s"'<>]+/i,
    /data:image\/[a-z0-9.+-]+;base64,/i,
    /;base64,/i,
    /[A-Za-z]:\\[^"'`\s<>]+/i,
    /\/(?:home|Users|var|tmp)\/[^"'`\s<>]+/i,
    /(?:file|s3|gs|ftp):\/\/[^"'`\s<>]+/i
  ];
  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    return true;
  }
  const urls = text.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? [];
  if (!allowCleanHttpsUrl && urls.length > 0) {
    return true;
  }
  return urls.some((url) => !cleanHttpsEvidenceUrl(url));
}

function validateEvidenceClosurePlan(plan, path, context = {}) {
  const issues = [];
  if (!plan || typeof plan !== "object") {
    return [`${path}: expected evidence closure plan.`];
  }
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const blockerSummary = context.blockerSummary ?? {};
  const blockers = Array.isArray(context.blockers) ? context.blockers : undefined;
  if (plan.releaseEvidence !== false) {
    issues.push(`${path}.releaseEvidence: expected false.`);
  }
  if (Number(plan.phaseCount ?? -1) !== phases.length) {
    issues.push(`${path}.phaseCount: expected to equal phases length.`);
  }
  if (Number(plan.blockerCount ?? -1) !== Number(blockerSummary.total ?? plan.blockerCount)) {
    issues.push(`${path}.blockerCount: expected to match blockerSummary.total.`);
  }
  if (Number(plan.codeActionCount ?? -1) !== Number(blockerSummary.byOwner?.codebase ?? 0)) {
    issues.push(`${path}.codeActionCount: expected to match codebase blocker count.`);
  }
  if (Number(plan.externalOrPaidActionCount ?? -1) !== Number(blockerSummary.externalOrPaid ?? 0)) {
    issues.push(`${path}.externalOrPaidActionCount: expected to match blockerSummary.externalOrPaid.`);
  }
  if (Number(plan.blockerCount ?? 0) === 0 && plan.status !== "clear") {
    issues.push(`${path}.status: expected clear when blockerCount is 0.`);
  }
  if (Number(plan.blockerCount ?? 0) > 0 && plan.status !== "blocked") {
    issues.push(`${path}.status: expected blocked when blockerCount is positive.`);
  }
  const phaseBlockerIds = phases.flatMap((phase) => Array.isArray(phase?.blockerIds) ? phase.blockerIds : []);
  if (phaseBlockerIds.length !== Number(plan.blockerCount ?? -1)) {
    issues.push(`${path}.phases[*].blockerIds: expected flattened blocker ID count to equal blockerCount.`);
  }
  if (new Set(phaseBlockerIds).size !== phaseBlockerIds.length) {
    issues.push(`${path}.phases[*].blockerIds: expected each blocker ID to appear only once.`);
  }
  if (blockers) {
    const blockerIds = blockers.map((item) => item?.id).filter(Boolean);
    const missing = blockerIds.filter((id) => !phaseBlockerIds.includes(id));
    const unexpected = phaseBlockerIds.filter((id) => !blockerIds.includes(id));
    if (missing.length > 0) {
      issues.push(`${path}.phases[*].blockerIds: missing blocker IDs ${missing.join(", ")}.`);
    }
    if (unexpected.length > 0) {
      issues.push(`${path}.phases[*].blockerIds: unexpected blocker IDs ${unexpected.join(", ")}.`);
    }
    const paidDependencyCount = blockers.filter((item) => item?.paidImpact && item.paidImpact !== "none").length;
    if (Number(plan.paidDependencyCount ?? -1) !== paidDependencyCount) {
      issues.push(`${path}.paidDependencyCount: expected to equal blockers with paidImpact.`);
    }
  }
  for (const phase of phases) {
    const blockerIds = Array.isArray(phase?.blockerIds) ? phase.blockerIds : [];
    const productGapIds = Array.isArray(phase?.productGapIds) ? phase.productGapIds : [];
    const requiredInputIds = Array.isArray(phase?.requiredInputIds) ? phase.requiredInputIds : [];
    const envVars = Array.isArray(phase?.envVars) ? phase.envVars : [];
    const envPlaceholders = Array.isArray(phase?.envPlaceholders) ? phase.envPlaceholders : [];
    const commands = Array.isArray(phase?.commands) ? phase.commands : [];
    const commandGuards = Array.isArray(phase?.commandGuards) ? phase.commandGuards : [];
    const localPreparationCommands = Array.isArray(phase?.localPreparationCommands) ? phase.localPreparationCommands : [];
    if (Number(phase?.blockerCount ?? -1) !== blockerIds.length) {
      issues.push(`${path}.phases[id=${phase?.id}].blockerCount: expected to equal blockerIds length.`);
    }
    if (Number(phase?.productGapCount ?? -1) !== productGapIds.length) {
      issues.push(`${path}.phases[id=${phase?.id}].productGapCount: expected to equal productGapIds length.`);
    }
    if (Number(phase?.requiredInputCount ?? -1) !== requiredInputIds.length) {
      issues.push(`${path}.phases[id=${phase?.id}].requiredInputCount: expected to equal requiredInputIds length.`);
    }
    if (Number(phase?.envVarCount ?? -1) !== envVars.length) {
      issues.push(`${path}.phases[id=${phase?.id}].envVarCount: expected to equal envVars length.`);
    }
    const orphanInputIds = requiredInputIds.filter((id) => !blockerIds.includes(id));
    if (orphanInputIds.length > 0) {
      issues.push(`${path}.phases[id=${phase?.id}].requiredInputIds: expected every required input to also be a phase blocker (${orphanInputIds.join(", ")}).`);
    }
    const placeholderNames = envPlaceholders.map((item) => item?.name).filter(Boolean);
    const orphanPlaceholderNames = placeholderNames.filter((name) => !envVars.includes(name));
    if (orphanPlaceholderNames.length > 0) {
      issues.push(`${path}.phases[id=${phase?.id}].envPlaceholders: expected placeholder names to be listed in envVars (${orphanPlaceholderNames.join(", ")}).`);
    }
    for (const envName of envVars) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(String(envName))) {
        issues.push(`${path}.phases[id=${phase?.id}].envVars: expected safe env var names, found ${envName}.`);
      }
    }
    issues.push(...validateEvidenceClosureFileList(phase?.operatorInputFiles, `${path}.phases[id=${phase?.id}].operatorInputFiles`, ["ops/"]));
    issues.push(...validateEvidenceClosureFileList(phase?.draftFiles, `${path}.phases[id=${phase?.id}].draftFiles`, ["assets/output_deliverables/"]));
    issues.push(...validateEvidenceClosureFileList(phase?.reportArchiveFiles, `${path}.phases[id=${phase?.id}].reportArchiveFiles`, ["assets/output_deliverables/"]));
    if (commandGuards.length !== commands.length) {
      issues.push(`${path}.phases[id=${phase?.id}].commandGuards: expected one guard per command.`);
    }
    for (const command of commands) {
      if (String(command ?? "").match(/\bStep\s+\d+:/)) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected expanded validation commands without embedded Step labels.`);
      }
    }
    for (const guard of commandGuards) {
      const command = String(guard?.command ?? "");
      if (!commands.includes(command)) {
        issues.push(`${path}.phases[id=${phase?.id}].commandGuards: expected guard command to be listed in commands.`);
      }
      const expectedFlags = commandGuardFlags(command);
      for (const [key, expected] of Object.entries(expectedFlags)) {
        if (guard?.[key] !== expected) {
          issues.push(`${path}.phases[id=${phase?.id}].commandGuards[command=${command}].${key}: expected ${expected}.`);
        }
      }
    }
    if (requiredInputIds.includes("generated_audio_paid_review")) {
      if (!commands.some((command) => String(command).includes("validation:generated-audio-artifact"))) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected generated-audio artifact evidence capture command.`);
      }
      if (!commands.some((command) => String(command).includes("validation:generated-audio-review-draft"))) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected generated-audio manual-review draft command.`);
      }
      if (!commands.some((command) => String(command).includes("--review-existing-report") && String(command).includes("--manual-audio-review"))) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected generated-audio review-existing manual-audio command.`);
      }
    }
    if (requiredInputIds.includes("long_form_paid_media_review")) {
      if (!commands.some((command) => String(command).includes("validation:long-form-review-draft"))) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected long-form manual quality review draft command.`);
      }
      if (!commands.some((command) => String(command).includes("validation:long-form") && String(command).includes("--manual-quality-review"))) {
        issues.push(`${path}.phases[id=${phase?.id}].commands: expected long-form paid manual-quality-review command.`);
      }
    }
    issues.push(...validateEvidenceClosureLocalPreparationCommands(phase, `${path}.phases[id=${phase?.id}].localPreparationCommands`, localPreparationCommands));
    issues.push(...validateEvidenceClosureExecutionReadiness(phase, `${path}.phases[id=${phase?.id}].executionReadiness`, commandGuards));
    if (typeof phase?.releaseImpact !== "string" || phase.releaseImpact.trim().length === 0) {
      issues.push(`${path}.phases[id=${phase?.id}].releaseImpact: expected a non-empty release impact.`);
    }
  }
  return issues;
}

function validateEvidenceClosureLocalPreparationCommands(phase, path, commands) {
  const issues = [];
  if (!Array.isArray(phase?.localPreparationCommands)) {
    return [`${path}: expected an array.`];
  }
  const phaseDraftFiles = Array.isArray(phase?.draftFiles) ? phase.draftFiles : [];
  const requiredInputIds = Array.isArray(phase?.requiredInputIds) ? phase.requiredInputIds : [];
  if (phaseDraftFiles.length > 0 && commands.length === 0) {
    issues.push(`${path}: expected at least one local prep command when phase has draft/template files.`);
  }
  const names = commands.map((item) => String(item?.name ?? "")).filter(Boolean);
  const commandTexts = commands.map((item) => String(item?.command ?? "")).filter(Boolean);
  if (duplicateStrings(names).length > 0) {
    issues.push(`${path}: expected unique local prep command names.`);
  }
  if (duplicateStrings(commandTexts).length > 0) {
    issues.push(`${path}: expected unique local prep commands.`);
  }
  for (const item of commands) {
    const name = String(item?.name ?? "");
    const command = String(item?.command ?? "");
    const sourceInputIds = arrayOfStrings(item?.sourceInputIds);
    const draftFiles = arrayOfStrings(item?.draftFiles);
    if (!name) {
      issues.push(`${path}: expected local prep command name.`);
    }
    if (!command) {
      issues.push(`${path}[name=${name || "unknown"}].command: expected non-empty command.`);
    }
    if (sourceInputIds.length === 0) {
      issues.push(`${path}[name=${name || "unknown"}].sourceInputIds: expected at least one source input id.`);
    }
    const orphanInputs = sourceInputIds.filter((id) => !requiredInputIds.includes(id));
    if (orphanInputs.length > 0) {
      issues.push(`${path}[name=${name || "unknown"}].sourceInputIds: expected ids to belong to phase required inputs (${orphanInputs.join(", ")}).`);
    }
    if (item?.producesDrafts !== true) {
      issues.push(`${path}[name=${name || "unknown"}].producesDrafts: expected true.`);
    }
    if (item?.releaseEvidence !== false) {
      issues.push(`${path}[name=${name || "unknown"}].releaseEvidence: expected false.`);
    }
    if (draftFiles.length === 0) {
      issues.push(`${path}[name=${name || "unknown"}].draftFiles: expected at least one draft/template file.`);
    }
    issues.push(...validateEvidenceClosureFileList(draftFiles, `${path}[name=${name || "unknown"}].draftFiles`, ["assets/output_deliverables/"]));
    const orphanDraftFiles = draftFiles.filter((filePath) => !phaseDraftFiles.includes(filePath));
    if (orphanDraftFiles.length > 0) {
      issues.push(`${path}[name=${name || "unknown"}].draftFiles: expected every draft file to belong to the phase (${orphanDraftFiles.join(", ")}).`);
    }
    const expectedFlags = commandGuardFlags(command);
    for (const [key, expected] of Object.entries(expectedFlags)) {
      if (item?.[key] !== expected) {
        issues.push(`${path}[name=${name || "unknown"}].${key}: expected ${expected}.`);
      }
    }
    if (
      item?.requiresLiveNetwork === true ||
      item?.requiresProviderSpend === true ||
      item?.requiresOperatorConfirmation === true ||
      item?.requiresManualReview === true ||
      item?.containsPlaceholder === true
    ) {
      issues.push(`${path}[name=${name || "unknown"}]: local prep commands must stay no-spend, no-live-network, no-confirmation, no-manual-review, and placeholder-free.`);
    }
    const expectedRunnable =
      item?.requiresLiveNetwork !== true &&
      item?.requiresProviderSpend !== true &&
      item?.requiresOperatorConfirmation !== true &&
      item?.requiresManualReview !== true &&
      item?.containsPlaceholder !== true;
    if (item?.runnable !== expectedRunnable) {
      issues.push(`${path}[name=${name || "unknown"}].runnable: expected ${expectedRunnable}.`);
    }
  }
  return issues;
}

function validateEvidenceClosureExecutionReadiness(phase, path, commandGuards) {
  const issues = [];
  const readiness = phase?.executionReadiness;
  if (!readiness || typeof readiness !== "object") {
    return [`${path}: expected phase execution readiness.`];
  }
  const blockingReasons = Array.isArray(readiness.blockingReasons) ? readiness.blockingReasons : [];
  const inputStatusCounts = readiness.inputStatusCounts && typeof readiness.inputStatusCounts === "object"
    ? readiness.inputStatusCounts
    : {};
  const guardSummary = readiness.guardSummary && typeof readiness.guardSummary === "object"
    ? readiness.guardSummary
    : {};
  if (Number(readiness.blockingReasonCount ?? -1) !== blockingReasons.length) {
    issues.push(`${path}.blockingReasonCount: expected to equal blockingReasons length.`);
  }
  if (Number(guardSummary.commandCount ?? -1) !== commandGuards.length) {
    issues.push(`${path}.guardSummary.commandCount: expected to equal commandGuards length.`);
  }
  const guardCountChecks = {
    runnableCommandCount: commandGuards.filter((item) => item?.runnable === true).length,
    liveNetworkCommandCount: commandGuards.filter((item) => item?.requiresLiveNetwork === true).length,
    providerSpendCommandCount: commandGuards.filter((item) => item?.requiresProviderSpend === true).length,
    operatorConfirmationCommandCount: commandGuards.filter((item) => item?.requiresOperatorConfirmation === true).length,
    manualReviewCommandCount: commandGuards.filter((item) => item?.requiresManualReview === true).length,
    placeholderCommandCount: commandGuards.filter((item) => item?.containsPlaceholder === true).length
  };
  for (const [key, expected] of Object.entries(guardCountChecks)) {
    if (Number(guardSummary[key] ?? -1) !== expected) {
      issues.push(`${path}.guardSummary.${key}: expected ${expected}.`);
    }
  }
  const requiredInputIds = Array.isArray(phase?.requiredInputIds) ? phase.requiredInputIds : [];
  const countedInputs = Object.values(inputStatusCounts).reduce((sum, value) => sum + Number(value ?? 0), 0);
  if (countedInputs !== requiredInputIds.length) {
    issues.push(`${path}.inputStatusCounts: expected counts to equal requiredInputIds length.`);
  }
  if (readiness.canAttemptNow === true && (blockingReasons.length > 0 || commandGuards.some((item) => item?.runnable !== true))) {
    issues.push(`${path}.canAttemptNow: expected false while blocking reasons remain or commands are not runnable.`);
  }
  const expectedStatus = expectedExecutionReadinessStatus({
    blockingReasons,
    inputStatusCounts,
    guardSummary,
    blockerCount: Number(phase?.blockerCount ?? 0)
  });
  if (readiness.status !== expectedStatus) {
    issues.push(`${path}.status: expected ${expectedStatus}.`);
  }
  return issues;
}

function expectedExecutionReadinessStatus({ blockingReasons, inputStatusCounts, guardSummary, blockerCount }) {
  if (blockerCount === 0) {
    return "ready_to_attempt";
  }
  if (Number(inputStatusCounts.blocked_by_budget ?? 0) > 0) {
    return "blocked_by_budget";
  }
  if (Number(inputStatusCounts.pending_after_paid_run ?? 0) > 0) {
    return "pending_after_paid_run";
  }
  if (
    blockingReasons.some((item) =>
      String(item).startsWith("required_env_missing:") ||
      String(item).startsWith("operator_input_file_missing:") ||
      item === "operator_input_missing"
    )
  ) {
    return "needs_operator_input";
  }
  if (Number(guardSummary.placeholderCommandCount ?? 0) > 0) {
    return "needs_resolved_placeholders";
  }
  if (
    Number(guardSummary.providerSpendCommandCount ?? 0) > 0 ||
    Number(guardSummary.liveNetworkCommandCount ?? 0) > 0 ||
    Number(guardSummary.operatorConfirmationCommandCount ?? 0) > 0
  ) {
    return "requires_confirmation";
  }
  if (blockingReasons.length > 0) {
    return "blocked";
  }
  return "ready_to_attempt";
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

function validateEvidenceClosureFileList(value, path, allowedPrefixes) {
  const issues = [];
  if (!Array.isArray(value)) {
    return [`${path}: expected an array.`];
  }
  if (duplicateStrings(value).length > 0) {
    issues.push(`${path}: expected unique file paths.`);
  }
  for (const filePath of value) {
    const normalized = String(filePath ?? "").replace(/\\/g, "/");
    if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      issues.push(`${path}: expected ${normalized} to start with ${allowedPrefixes.join(" or ")}.`);
    }
    if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || normalized.includes("://")) {
      issues.push(`${path}: expected relative operator/evidence paths only, found ${normalized}.`);
    }
    if (/[?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=/i.test(normalized)) {
      issues.push(`${path}: expected paths without credential-like query parameters.`);
    }
  }
  return issues;
}

function validateSnapshotParityCoverageSummary(summary, path, snapshotParitySummary) {
  const issues = [];
  if (!summary || typeof summary !== "object") {
    return [`${path}: expected snapshot parity coverage summary.`];
  }
  if (typeof snapshotParitySummary?.status === "string" && summary.status !== snapshotParitySummary.status) {
    issues.push(`${path}.status: expected to match snapshot parity report status.`);
  }
  const sourceEstimates = Array.isArray(summary.sourceEstimates) ? summary.sourceEstimates : [];
  const expectedSource = sourceEstimates.length > 0 ? "snapshot_parity_audit" : "missing_snapshot_parity_estimates";
  if (summary.source !== expectedSource) {
    issues.push(`${path}.source: expected ${expectedSource}.`);
  }
  if (summary.releaseEvidence !== false) {
    issues.push(`${path}.releaseEvidence: expected false.`);
  }
  if (summary.canClaimFullSnapshotParity !== false) {
    issues.push(`${path}.canClaimFullSnapshotParity: expected false until all product/external parity evidence gates close.`);
  }
  if (Number(summary.sourceEstimateCount ?? -1) !== sourceEstimates.length) {
    issues.push(`${path}.sourceEstimateCount: expected to equal sourceEstimates length.`);
  }
  if (Number(summary.estimatedSourceCount ?? -1) !== sourceEstimates.length) {
    issues.push(`${path}.estimatedSourceCount: expected to equal sourceEstimates length.`);
  }
  if (snapshotParitySummary?.status === "pass" && summary.guardrailsPass !== true) {
    issues.push(`${path}.guardrailsPass: expected true when snapshot parity status is pass.`);
  }
  if (snapshotParitySummary?.present === true && snapshotParitySummary?.status === "pass" && sourceEstimates.length === 0) {
    issues.push(`${path}.sourceEstimates: expected functional estimates when snapshot parity report is present and passing.`);
  }
  const minValues = sourceEstimates.map((item) => Number(item?.estimateMinPercent ?? 0));
  const maxValues = sourceEstimates.map((item) => Number(item?.estimateMaxPercent ?? 0));
  if (minValues.length > 0) {
    if (Number(summary.lowestEstimatePercent ?? -1) !== Math.min(...minValues)) {
      issues.push(`${path}.lowestEstimatePercent: expected to match source estimate minimum.`);
    }
    if (Number(summary.highestEstimatePercent ?? -1) !== Math.max(...maxValues)) {
      issues.push(`${path}.highestEstimatePercent: expected to match source estimate maximum.`);
    }
  }
  for (const estimate of sourceEstimates) {
    if (Number(estimate?.estimateMaxPercent ?? 100) >= 100) {
      issues.push(`${path}.sourceEstimates[id=${estimate?.id}].estimateMaxPercent: expected below 100.`);
    }
    if (Number(estimate?.estimateMaxPercent ?? -1) < Number(estimate?.estimateMinPercent ?? 0)) {
      issues.push(`${path}.sourceEstimates[id=${estimate?.id}]: expected max estimate to be >= min estimate.`);
    }
    if (typeof estimate?.mainGaps !== "string" || estimate.mainGaps.trim().length === 0) {
      issues.push(`${path}.sourceEstimates[id=${estimate?.id}].mainGaps: expected explicit remaining gaps.`);
    }
  }
  return issues;
}

function validateOperatorHandoffSummary(summary, path, commercialInputsSummary, options = {}) {
  const issues = [];
  if (!summary || typeof summary !== "object") {
    return [`${path}: expected operator handoff summary from commercial launch inputs.`];
  }
  const commercialInputsPresent = commercialInputsSummary?.present === true;
  const expectedSource = commercialInputsPresent
    ? "commercial_launch_inputs"
    : "missing_commercial_launch_inputs_manifest";
  if (summary.source !== expectedSource) {
    issues.push(`${path}.source: expected ${expectedSource}.`);
  }
  if (typeof commercialInputsSummary?.status === "string" && summary.status !== commercialInputsSummary.status) {
    issues.push(`${path}.status: expected to match commercial inputs status.`);
  }
  if (summary.safeToShareWithOperators !== true) {
    issues.push(`${path}.safeToShareWithOperators: expected true for the redacted operator handoff summary.`);
  }
  for (const [key, expected] of [
    ["releaseEvidence", false],
    ["secretValuesIncluded", false],
    ["rawProviderPayloadsIncluded", false],
    ["localAbsolutePathsIncluded", false],
    ["customerMediaIncluded", false]
  ]) {
    if (summary[key] !== expected) {
      issues.push(`${path}.${key}: expected ${expected}.`);
    }
  }

  const requiredInputCount = Number(summary.requiredInputCount ?? 0);
  const configuredInputCount = Number(summary.configuredInputCount ?? 0);
  const missingOrBlockedInputCount = Number(summary.missingOrBlockedInputCount ?? 0);
  const pendingAfterPaidRunCount = Number(summary.pendingAfterPaidRunCount ?? 0);
  if (requiredInputCount !== configuredInputCount + missingOrBlockedInputCount + pendingAfterPaidRunCount) {
    issues.push(`${path}: input counts must equal configured + missing/blocked + pending-after-paid.`);
  }
  const blockedInputIds = Array.isArray(summary.blockedInputIds) ? summary.blockedInputIds : [];
  if (blockedInputIds.length !== missingOrBlockedInputCount) {
    issues.push(`${path}.blockedInputIds: expected length to match missingOrBlockedInputCount.`);
  }
  const operatorInputFiles = Array.isArray(summary.operatorInputFiles) ? summary.operatorInputFiles : [];
  if (operatorInputFiles.length !== Number(summary.operatorInputFileCount ?? -1)) {
    issues.push(`${path}.operatorInputFiles: expected length to match operatorInputFileCount.`);
  }

  const commandCount = Number(summary.commandCount ?? 0);
  const readyCommandCount = Number(summary.readyCommandCount ?? 0);
  const blockedCommandCount = Number(summary.blockedCommandCount ?? 0);
  const paidCommandCount = Number(summary.paidCommandCount ?? 0);
  const readyPaidCommandCount = Number(summary.readyPaidCommandCount ?? 0);
  if (commandCount !== readyCommandCount + blockedCommandCount) {
    issues.push(`${path}: command counts must equal ready + blocked command counts.`);
  }
  if (readyPaidCommandCount > paidCommandCount || paidCommandCount > commandCount) {
    issues.push(`${path}: paid command counts must be bounded by total command count.`);
  }
  if (!Array.isArray(summary.refreshCommands) || summary.refreshCommands.length === 0) {
    issues.push(`${path}.refreshCommands: expected at least one refresh command.`);
  }
  if (
    typeof options.expectedCommandPlanStatus === "string" &&
    summary.commandPlanAuditStatus !== options.expectedCommandPlanStatus
  ) {
    issues.push(`${path}.commandPlanAuditStatus: expected to match readinessSnapshot.commandPlanAuditStatus.`);
  }
  if (options.expectedCommandPlanPass === true && summary.commandPlanAuditStatus !== "pass") {
    issues.push(`${path}.commandPlanAuditStatus: expected pass when codeWorkSummary.commandPlanPass is true.`);
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

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "")).filter(Boolean)
    : [];
}

function uniqueStrings(values) {
  return [...new Set(values.map((item) => String(item ?? "")).filter(Boolean))];
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

const unsafeDirectorReviewTextPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /apikey-[A-Za-z0-9]{20,}/gi,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi,
  /[A-Za-z]:\\[^\s"'<>]+/g,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/gi,
  /data:[^\s"'<>]+/gi
];

const directorStyleRawReviewConfigs = {
  semantic: {
    kind: "semantic",
    collectionKey: "metrics",
    nameKey: "metricName",
    requiredNames: [
      "script_video_fidelity",
      "user_demand_fulfillment",
      "temporal_coherence",
      "transition_quality",
      "lighting_consistency",
      "text_video_consistency"
    ],
    countKeys: ["reviewedShotCount", "reviewedBoundaryCount"]
  },
  audio: {
    kind: "audio",
    collectionKey: "metrics",
    nameKey: "metricName",
    requiredNames: [
      "narration_reasonableness",
      "bgm_consistency",
      "video_audio_consistency",
      "text_audio_consistency"
    ],
    countKeys: ["reviewedSegmentCount", "reviewedBoundaryCount"]
  },
  runtime: {
    kind: "runtime",
    collectionKey: "metrics",
    nameKey: "metricName",
    requiredNames: [
      "asr_transcript_alignment",
      "lip_sync_timing"
    ],
    countKeys: ["reviewedSegmentCount", "reviewedBoundaryCount"]
  },
  governance: {
    kind: "governance",
    collectionKey: "checks",
    nameKey: "checkName",
    requiredNames: [
      "directorbench_license_boundary",
      "upstream_code_reuse_boundary",
      "runtime_evaluator_independence",
      "evaluation_asset_permissions"
    ],
    countKeys: []
  }
};

function validateDirectorStyleRawReviewSemantics(report, config) {
  const issues = [];
  const collection = Array.isArray(report?.[config.collectionKey]) ? report[config.collectionKey] : [];
  const topStatus = typeof report?.status === "string" ? report.status : "missing";
  const names = collection.map((item) => String(item?.[config.nameKey] ?? "")).filter(Boolean);
  const duplicateNames = duplicateStrings(names);
  if (duplicateNames.length > 0) {
    issues.push(`$.${config.collectionKey}: expected unique ${config.nameKey} values, duplicated ${duplicateNames.join(", ")}.`);
  }

  issues.push(...unsafeDirectorReviewTextIssues(report, "$"));

  const itemAcceptedNames = collection
    .filter((item) => item?.status === "accepted")
    .map((item) => item?.[config.nameKey])
    .filter(Boolean);
  if (topStatus !== "accepted" && itemAcceptedNames.length > 0) {
    issues.push(`$.status: expected accepted when any ${config.kind} checkpoint is accepted.`);
  }
  if (topStatus === "accepted") {
    const missing = config.requiredNames.filter((name) => !names.includes(name));
    const nonAccepted = config.requiredNames.filter((name) => {
      const item = collection.find((entry) => entry?.[config.nameKey] === name);
      return item?.status !== "accepted";
    });
    if (missing.length > 0) {
      issues.push(`$.${config.collectionKey}: accepted ${config.kind} review is missing required checkpoint(s): ${missing.join(", ")}.`);
    }
    if (nonAccepted.length > 0) {
      issues.push(`$.${config.collectionKey}: accepted ${config.kind} review has non-accepted required checkpoint(s): ${nonAccepted.join(", ")}.`);
    }
    if (!directorStyleArtifactBindingComplete(report?.artifactBinding)) {
      issues.push("$.artifactBinding: accepted Director-style review packets must include projectId, requestId, and deliverableSha256.");
    }
    for (const countKey of config.countKeys) {
      if (Number(report?.[countKey] ?? 0) <= 0) {
        issues.push(`$.${countKey}: accepted ${config.kind} review requires a positive reviewed evidence count.`);
      }
    }
  }
  return issues;
}

function directorStyleArtifactBindingComplete(binding) {
  return binding &&
    typeof binding === "object" &&
    typeof binding.projectId === "string" &&
    binding.projectId.trim().length > 0 &&
    typeof binding.requestId === "string" &&
    binding.requestId.trim().length > 0 &&
    /^[a-f0-9]{64}$/.test(String(binding.deliverableSha256 ?? ""));
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
  for (const [name, evidence] of [
    ["semanticReviewEvidence", report?.facts?.semanticReviewEvidence],
    ["audioReviewEvidence", report?.facts?.audioReviewEvidence],
    ["runtimeReviewEvidence", report?.facts?.runtimeReviewEvidence],
    ["governanceReviewEvidence", report?.facts?.governanceReviewEvidence]
  ]) {
    issues.push(...unsafeDirectorReviewTextIssues(evidence, `$.facts.${name}`));
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
  const acceptedSemanticReview =
    report?.facts?.semanticReviewEvidence?.status === "accepted" &&
    report.facts.semanticReviewEvidence.artifactBindingStatus === "matched" &&
    Number(report.facts.semanticReviewEvidence.metricCount ?? 0) >= 4;
  const acceptedAudioReview =
    report?.facts?.audioReviewEvidence?.status === "accepted" &&
    report.facts.audioReviewEvidence.artifactBindingStatus === "matched" &&
    Number(report.facts.audioReviewEvidence.metricCount ?? 0) >= 4;
  const runtimeMetrics = Array.isArray(report?.facts?.runtimeReviewEvidence?.metrics)
    ? report.facts.runtimeReviewEvidence.metrics
    : [];
  const acceptedAsrRuntimeReview =
    report?.facts?.runtimeReviewEvidence?.status === "accepted" &&
    report.facts.runtimeReviewEvidence.artifactBindingStatus === "matched" &&
    runtimeMetrics.some((metric) => metric?.metricName === "asr_transcript_alignment" && metric?.status === "accepted");
  const acceptedLipSyncRuntimeReview =
    report?.facts?.runtimeReviewEvidence?.status === "accepted" &&
    report.facts.runtimeReviewEvidence.artifactBindingStatus === "matched" &&
    runtimeMetrics.some((metric) => metric?.metricName === "lip_sync_timing" && metric?.status === "accepted");
  const governanceChecks = Array.isArray(report?.facts?.governanceReviewEvidence?.checks)
    ? report.facts.governanceReviewEvidence.checks
    : [];
  const acceptedGovernanceReview =
    report?.facts?.governanceReviewEvidence?.status === "accepted" &&
    report.facts.governanceReviewEvidence.artifactBindingStatus === "matched" &&
    [
      "directorbench_license_boundary",
      "upstream_code_reuse_boundary",
      "runtime_evaluator_independence",
      "evaluation_asset_permissions"
    ].every((name) =>
      governanceChecks.some((check) => check?.checkName === name && check?.status === "accepted")
    );
  const acceptedGeneratedAudioProviderEvidence =
    report?.facts?.generatedAudioProviderEvidence?.status === "accepted" &&
    report.facts.generatedAudioProviderEvidence.canUseAsBusinessReadinessGeneratedAudioEvidence === true &&
    report.facts.generatedAudioProviderEvidence.providerNetworkCallsAllowed === true &&
    report.facts.generatedAudioProviderEvidence.atlasBillingReady === true &&
    report.facts.generatedAudioProviderEvidence.schemaReviewed === true &&
    report.facts.generatedAudioProviderEvidence.executionStatus === "succeeded" &&
    report.facts.generatedAudioProviderEvidence.outputBatchStatus === "approved" &&
    Number(report.facts.generatedAudioProviderEvidence.approvedTrackCount ?? 0) > 0 &&
    Number(report.facts.generatedAudioProviderEvidence.providerLedgerEntryCount ?? 0) > 0 &&
    report.facts.generatedAudioProviderEvidence.manualReviewPassed === true &&
    report.facts.generatedAudioProviderEvidence.artifactEvidenceChecked === true &&
    report.facts.generatedAudioProviderEvidence.artifactEvidenceMatchesReport === true &&
    /^[a-f0-9]{64}$/.test(String(report.facts.generatedAudioProviderEvidence.mediaSha256 ?? ""));
  const acceptedLongFormValidationEvidence =
    report?.facts?.longFormValidationEvidence?.status === "accepted" &&
    report.facts.longFormValidationEvidence.canUseAsBusinessReadinessLongFormEvidence === true &&
    report.facts.longFormValidationEvidence.providerSpendAllowed === true &&
    report.facts.longFormValidationEvidence.atlasBillingReady === true &&
    report.facts.longFormValidationEvidence.requestValidationStatus === "pass" &&
    report.facts.longFormValidationEvidence.chunkPlanStatus === "pass" &&
    report.facts.longFormValidationEvidence.paidRenderStatus === "completed" &&
    report.facts.longFormValidationEvidence.artifactValidationStatus === "pass" &&
    report.facts.longFormValidationEvidence.artifactEvidencePresent === true &&
    report.facts.longFormValidationEvidence.deliverablePresent === true &&
    Number(report.facts.longFormValidationEvidence.costLedgerEntryCount ?? 0) > 0 &&
    report.facts.longFormValidationEvidence.manualQualityReviewPassed === true &&
    report.facts.longFormValidationEvidence.manualReviewArtifactBindingMatched === true &&
    report.facts.longFormValidationEvidence.manualReviewArtifactBindingStatus === "matched" &&
    Number(report.facts.longFormValidationEvidence.finalDurationSeconds ?? 0) >= 120 &&
    Number(report.facts.longFormValidationEvidence.finalDurationSeconds ?? 0) <= 480;
  const measuredLongFormDuration =
    Number(report?.facts?.finalDurationSeconds ?? 0) >= 120 &&
    Number(report?.facts?.finalDurationSeconds ?? 0) <= 480;
  const acceptedLongFormManualReview =
    acceptedLongFormValidationEvidence ||
    (report?.facts?.manualReviewAccepted === true && (measuredLongFormDuration || acceptedLongFormValidationEvidence));
  if ((requirementById.get("semantic_visual_review")?.status === "met") !== acceptedSemanticReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=semantic_visual_review].status: expected met only with accepted artifact-bound semantic visual review evidence.");
  }
  if ((requirementById.get("structured_audio_review")?.status === "met") !== acceptedAudioReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=structured_audio_review].status: expected met only with accepted artifact-bound structured audio review evidence.");
  }
  if ((requirementById.get("asr_transcript_alignment")?.status === "met") !== acceptedAsrRuntimeReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=asr_transcript_alignment].status: expected met only with accepted artifact-bound runtime ASR transcript-alignment evidence.");
  }
  if ((requirementById.get("generated_audio_provider_evidence")?.status === "met") !== acceptedGeneratedAudioProviderEvidence) {
    issues.push("$.parityEvidenceMatrix.requirements[id=generated_audio_provider_evidence].status: expected met only with accepted generated-audio provider evidence.");
  }
  if ((requirementById.get("long_form_duration")?.status === "met") !== (measuredLongFormDuration || acceptedLongFormValidationEvidence)) {
    issues.push("$.parityEvidenceMatrix.requirements[id=long_form_duration].status: expected met only with measured 2-8 minute media duration or accepted long-form validation evidence.");
  }
  if ((requirementById.get("manual_long_form_media_review")?.status === "met") !== acceptedLongFormManualReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=manual_long_form_media_review].status: expected met only with accepted long-form manual review evidence tied to 2-8 minute media.");
  }
  if ((requirementById.get("lip_sync_evidence")?.status === "met") !== acceptedLipSyncRuntimeReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=lip_sync_evidence].status: expected met only with accepted artifact-bound runtime lip-sync timing evidence.");
  }
  if ((requirementById.get("license_and_runtime_permission_review")?.status === "met") !== acceptedGovernanceReview) {
    issues.push("$.parityEvidenceMatrix.requirements[id=license_and_runtime_permission_review].status: expected met only with accepted artifact-bound governance permission evidence.");
  }
  return issues;
}

function validateDirectorStyleReviewEvidenceReadinessSemantics(report) {
  const issues = [];
  const reviews = Array.isArray(report?.reviews) ? report.reviews : [];
  const presentCount = reviews.filter((review) => review?.present === true).length;
  const acceptedCount = reviews.filter((review) => review?.accepted === true).length;
  const artifactBoundCount = reviews.filter((review) => review?.artifactBindingStatus === "matched").length;
  const passReady = report?.status === "pass";

  if (report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.networkCallsMade/$.providerCallsMade: expected false; review-evidence readiness must be no-network/no-provider.");
  }
  if (Number(report?.summary?.requiredReviewCount ?? -1) !== 4 || reviews.length !== 4) {
    issues.push("$.summary.requiredReviewCount/$.reviews: expected exactly four Director-style review kinds.");
  }
  if (Number(report?.summary?.presentReviewCount ?? -1) !== presentCount) {
    issues.push("$.summary.presentReviewCount: expected to match reviews with present=true.");
  }
  if (Number(report?.summary?.acceptedReviewCount ?? -1) !== acceptedCount) {
    issues.push("$.summary.acceptedReviewCount: expected to match reviews with accepted=true.");
  }
  if (Number(report?.summary?.artifactBoundReviewCount ?? -1) !== artifactBoundCount) {
    issues.push("$.summary.artifactBoundReviewCount: expected to match reviews with artifactBindingStatus=matched.");
  }
  if (report?.summary?.canClaimDirectorBenchParity !== false || report?.releaseGateSummary?.canClaimDirectorBenchParity !== false) {
    issues.push("$.summary/releaseGateSummary.canClaimDirectorBenchParity: expected false for review readiness evidence.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; review readiness is not customer-release approval.");
  }
  if (report?.summary?.canUseAsAcceptedDirectorReviewEvidence !== passReady ||
      report?.summary?.canRunQualityBenchmarkWithAcceptedReviews !== passReady ||
      report?.releaseGateSummary?.acceptedDirectorReviewEvidencePass !== passReady ||
      report?.releaseGateSummary?.canUseAsAcceptedDirectorReviewEvidence !== passReady) {
    issues.push("$.summary/releaseGateSummary accepted-review flags: expected true only when status=pass.");
  }
  if (passReady) {
    if (report?.expectedArtifactBinding?.complete !== true) {
      issues.push("$.expectedArtifactBinding.complete: status pass requires complete paid-artifact binding.");
    }
    if (!reviews.every((review) =>
      review?.present === true &&
      review?.jsonValid === true &&
      review?.schemaValid === true &&
      review?.status === "accepted" &&
      review?.artifactBindingStatus === "matched" &&
      review?.accepted === true &&
      Number(review?.acceptedCheckpointCount ?? -1) === Number(review?.requiredCheckpointCount ?? -2) &&
      Array.isArray(review?.missingCheckpointNames) &&
      review.missingCheckpointNames.length === 0 &&
      Array.isArray(review?.nonAcceptedCheckpointNames) &&
      review.nonAcceptedCheckpointNames.length === 0
    )) {
      issues.push("$.reviews: status pass requires every review to be present, schema-valid, accepted, artifact-bound, and complete.");
    }
  }
  if (!passReady && (
    report?.summary?.canUseAsAcceptedDirectorReviewEvidence === true ||
    report?.releaseGateSummary?.acceptedDirectorReviewEvidencePass === true ||
    report?.releaseGateSummary?.canUseAsAcceptedDirectorReviewEvidence === true
  )) {
    issues.push("$.summary/releaseGateSummary: non-pass readiness reports cannot expose accepted review evidence flags.");
  }
  return issues;
}

function validateDirectorStyleReviewEvidenceGuardSemantics(report) {
  const issues = [];
  const publicPayload = JSON.stringify(report ?? {});
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const safeReviews = Array.isArray(report?.safeReadiness?.reviews) ? report.safeReadiness.reviews : [];
  const unsafeReviews = Array.isArray(report?.unsafeReadiness?.reviews) ? report.unsafeReadiness.reviews : [];
  const unsafeSemantic = unsafeReviews.find((review) => review?.kind === "semantic");

  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend/no-network guard smoke.");
  }
  if (report?.summary?.safeExitCode !== 0 || report?.summary?.safeStatus !== "pass") {
    issues.push("$.summary.safe*: expected safe accepted review bundle to pass readiness.");
  }
  if (report?.summary?.unsafeExitCode !== 1 || report?.summary?.unsafeStatus !== "fail") {
    issues.push("$.summary.unsafe*: expected unsafe review bundle to be rejected with failure.");
  }
  if (unsafeSemantic?.schemaValid !== false || unsafeSemantic?.accepted !== false) {
    issues.push("$.unsafeReadiness.reviews[semantic]: expected unsafe semantic packet to be schema-invalid and not accepted.");
  }
  if (report?.summary?.canUseUnsafeAsAcceptedDirectorReviewEvidence !== false) {
    issues.push("$.summary.canUseUnsafeAsAcceptedDirectorReviewEvidence: expected false.");
  }
  if (!safeReviews.every((review) => review?.present === true && review?.jsonValid === true && review?.schemaValid === true && review?.accepted === true)) {
    issues.push("$.safeReadiness.reviews: expected every safe review to be present, schema-valid, and accepted.");
  }
  if (failedChecks.length > 0) {
    issues.push("$.checks: guard smoke status pass requires zero failed checks.");
  }
  if (
    report?.releaseGateSummary?.reviewEvidenceGuardPass !== true ||
    report?.releaseGateSummary?.canUseAsAcceptedDirectorReviewEvidence !== false ||
    report?.releaseGateSummary?.canClaimDirectorBenchParity !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: guard smoke must pass while keeping accepted-review, parity, and customer-release claims false.");
  }
  if (/review\.example\.invalid|director_guard_secret|https?:\/\/(?!cinejelly\.local\/schemas)/i.test(publicPayload)) {
    issues.push("$.publicPayload: guard smoke report must not echo the raw unsafe review URL or token-like text.");
  }
  return issues;
}

function validateGeneratedAudioMappingSmokeSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status !== "pass");
  const publicPayload = JSON.stringify(report ?? {});
  const readyKindCounts = report?.summary?.readyKindCounts ?? {};
  const roleCounts = report?.summary?.approvedTrackRoleCounts ?? {};
  const blockedReasonCounts = report?.summary?.blockedReasonCounts ?? {};
  const allKindsReady = report?.plans?.allKindsReady;
  const partialKindBoundary = report?.plans?.partialKindBoundary;
  const providerPreferenceBinding = report?.plans?.providerPreferenceBinding;
  const durationBoundary = report?.plans?.durationBoundary;
  const kindMismatch = report?.outputValidation?.kindMismatch;

  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for generated-audio mapping smoke.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend/no-network/no-provider mapping smoke.");
  }
  for (const kind of ["tts_narration", "bgm", "ambience", "sfx"]) {
    if (Number(readyKindCounts[kind] ?? 0) !== 1) {
      issues.push(`$.summary.readyKindCounts.${kind}: expected exactly one ready mapping.`);
    }
  }
  for (const role of ["narration", "music", "ambience", "sfx"]) {
    if (Number(roleCounts[role] ?? 0) !== 1) {
      issues.push(`$.summary.approvedTrackRoleCounts.${role}: expected exactly one approved mix role.`);
    }
  }
  if (Number(report?.summary?.outputValidationApprovedCount ?? 0) !== 4) {
    issues.push("$.summary.outputValidationApprovedCount: expected four approved safe output validations.");
  }
  if (report?.summary?.kindMismatchRejected !== true) {
    issues.push("$.summary.kindMismatchRejected: expected true.");
  }
  if (report?.summary?.rawOutputUrlStored !== false || report?.summary?.rawPromptStored !== false) {
    issues.push("$.summary.rawOutputUrlStored/rawPromptStored: expected false.");
  }
  if (allKindsReady?.status !== "ready_for_provider" || Number(allKindsReady?.readyCount ?? 0) !== 4 || Number(allKindsReady?.blockedCount ?? -1) !== 0) {
    issues.push("$.plans.allKindsReady: expected ready_for_provider with four ready items and zero blocked items.");
  }
  const readyItems = Array.isArray(allKindsReady?.readyItems) ? allKindsReady.readyItems : [];
  for (const item of readyItems) {
    if (item?.kind && item?.requestOutputFormat !== "mp3") {
      issues.push("$.plans.allKindsReady.readyItems: expected every request output format to remain mp3.");
    }
  }
  if (partialKindBoundary?.status !== "partially_ready" || Number(blockedReasonCounts.kind_not_supported ?? 0) < 1) {
    issues.push("$.plans.partialKindBoundary: expected partially_ready with a kind_not_supported blocked item.");
  }
  if (providerPreferenceBinding?.status !== "planned_only" || Number(blockedReasonCounts.provider_preference_unavailable ?? 0) < 1) {
    issues.push("$.plans.providerPreferenceBinding: expected planned_only with provider_preference_unavailable.");
  }
  if (durationBoundary?.status !== "planned_only" || Number(blockedReasonCounts.duration_exceeds_capability ?? 0) < 1) {
    issues.push("$.plans.durationBoundary: expected planned_only with duration_exceeds_capability.");
  }
  if (kindMismatch?.status !== "rejected" || kindMismatch?.audioTrackCreated !== false || !arrayOfStrings(kindMismatch?.issueCodes).includes("kind_mismatch")) {
    issues.push("$.outputValidation.kindMismatch: expected rejected kind_mismatch without audioTrack creation.");
  }
  if (failedChecks.length > 0) {
    issues.push("$.checks: expected every generated-audio mapping smoke check to pass.");
  }
  if (
    report?.releaseGateSummary?.generatedAudioMappingSmokePass !== true ||
    report?.releaseGateSummary?.canUseAsNoSpendBackendEvidence !== true ||
    report?.releaseGateSummary?.canUseAsLiveGeneratedAudioEvidence !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: expected backend evidence pass while keeping live/customer-release claims false.");
  }
  if (/https?:\/\/|[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|apikey-|sk_[A-Za-z0-9]|bearer\s+/i.test(publicPayload)) {
    issues.push("$.publicPayload: generated-audio mapping smoke report must not include raw URLs, local paths, or credential-like text.");
  }
  return issues;
}

function validateGeneratedAudioPollingResilienceSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status !== "pass");
  const publicPayload = JSON.stringify(report ?? {});

  if (report?.status !== "pass") {
    issues.push("$.status: expected pass for generated-audio polling resilience smoke.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected fake-provider no-spend smoke.");
  }
  if (report?.checkedInputs?.fakeProvider !== true) {
    issues.push("$.checkedInputs.fakeProvider: expected true for no-spend polling resilience evidence.");
  }
  if (Number(report?.summary?.transientPollingErrorCount ?? 0) < 1) {
    issues.push("$.summary.transientPollingErrorCount: expected at least one simulated retryable polling error.");
  }
  if (Number(report?.summary?.getPredictionCallCount ?? 0) < 5) {
    issues.push("$.summary.getPredictionCallCount: expected polling to continue after retry exhaustion.");
  }
  if (report?.summary?.finalResultStatus !== "succeeded" || report?.execution?.result?.status !== "succeeded") {
    issues.push("$.summary/execution.result: expected generated audio to succeed after transient polling errors.");
  }
  if (report?.execution?.ledgerEntry?.status !== "succeeded" || Number(report?.execution?.ledgerEntry?.retryCount ?? 0) < 2) {
    issues.push("$.execution.ledgerEntry: expected succeeded provider ledger entry with retry count preserved.");
  }
  if (report?.summary?.toleratedRetryablePollingFailure !== true) {
    issues.push("$.summary.toleratedRetryablePollingFailure: expected true.");
  }
  if (
    report?.summary?.structuredFailureErrorCode !== "GENERATION_FAILED" ||
    report?.summary?.structuredFailureProviderStatus !== "failed" ||
    Number(report?.summary?.structuredFailureGetPredictionCallCount ?? 0) < 1 ||
    Number(report?.summary?.structuredFailureGetPredictionCallCount ?? 0) > 3
  ) {
    issues.push("$.summary.structuredFailure*: expected structured failed prediction payload to become terminal GENERATION_FAILED without polling until timeout.");
  }
  if (
    report?.execution?.structuredFailure?.ledgerEntry?.status !== "failed" ||
    report?.execution?.structuredFailure?.ledgerEntry?.providerStatus !== "failed" ||
    report?.execution?.structuredFailure?.ledgerEntry?.errorCode !== "GENERATION_FAILED"
  ) {
    issues.push("$.execution.structuredFailure.ledgerEntry: expected failed ledger entry from structured terminal provider body.");
  }
  if (failedChecks.length > 0) {
    issues.push("$.checks: expected every smoke check to pass.");
  }
  if (
    report?.releaseGateSummary?.generatedAudioPollingResiliencePass !== true ||
    report?.releaseGateSummary?.canUseAsNoSpendBackendEvidence !== true ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: expected backend evidence pass while keeping customer-release claim false.");
  }
  if (/test-atlas-api-key|test-atlas-llm-api-key|apikey-|sk_[A-Za-z0-9]/.test(publicPayload)) {
    issues.push("$.publicPayload: polling resilience smoke report must not include API keys or credential-like text.");
  }
  return issues;
}

function validateGeneratedAudioArtifactEvidenceSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (report?.noSpend !== true || report?.providerCallsMade !== false || report?.releaseEvidence !== false) {
    issues.push("$.noSpend/providerCallsMade/releaseEvidence: expected no-spend, no provider calls, and non-release artifact support evidence.");
  }
  const expectedStatus = generatedAudioArtifactEvidenceStatusForChecks(checks);
  if (report?.status !== expectedStatus) {
    issues.push(`$.status: expected ${expectedStatus} from checks.`);
  }
  if (report?.status === "pass") {
    if (report?.networkCallsMade !== true || report?.checkedInputs?.confirmLiveNetwork !== true) {
      issues.push("$.networkCallsMade/$.checkedInputs.confirmLiveNetwork: pass artifact evidence requires explicit live-network capture.");
    }
    if (!report?.artifactEvidence || typeof report.artifactEvidence !== "object") {
      issues.push("$.artifactEvidence: pass artifact evidence requires captured media metadata.");
    }
    if (report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence !== true) {
      issues.push("$.releaseGateSummary.canUseAsManualReviewArtifactEvidence: expected true only for pass reports.");
    }
  } else if (report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseAsManualReviewArtifactEvidence: expected false unless status is pass.");
  }
  if (
    report?.releaseGateSummary?.canUseAsBusinessReadinessGeneratedAudioEvidence !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: artifact capture must not unlock generated-audio business evidence or customer traffic by itself.");
  }
  const binding = report?.sourceReportContext?.artifactBinding;
  const evidence = report?.artifactEvidence;
  if (evidence && binding && typeof binding === "object") {
    for (const key of ["modelId", "language", "voiceId", "outputFormat", "intentId", "providerAssetId", "predictionId", "outputUrlPreview"]) {
      if (binding[key] !== evidence[key]) {
        issues.push(`$.artifactEvidence.${key}: expected to match sourceReportContext.artifactBinding.${key}.`);
      }
    }
  }
  if (evidence) {
    if (typeof evidence.outputUrlPreview === "string" && /[?&#]/.test(evidence.outputUrlPreview)) {
      issues.push("$.artifactEvidence.outputUrlPreview: expected credential-free URL preview without query or fragment.");
    }
    if (Number(evidence.byteSize ?? 0) <= 0) {
      issues.push("$.artifactEvidence.byteSize: expected positive byte size.");
    }
    if (Number(evidence.durationSeconds ?? 0) <= 0) {
      issues.push("$.artifactEvidence.durationSeconds: expected positive duration.");
    }
  }
  return issues;
}

function generatedAudioArtifactEvidenceStatusForChecks(checks) {
  if (checks.some((check) => check?.name === "live_network_confirmation" && check?.status === "fail")) {
    return "blocked_by_live_network_confirmation";
  }
  if (checks.some((check) => check?.name === "generated_audio_output_ready" && check?.status === "fail")) {
    return "blocked_by_source_report";
  }
  return checks.every((check) => check?.status === "pass") ? "pass" : "fail";
}

function validateGeneratedAudioManualReviewSemantics(report) {
  const issues = [];
  const requiredChecks = [
    "listenedFullOutput",
    "outputIsAudible",
    "languageMatchesRequest",
    "narrationMatchesValidationText",
    "noObviousArtifacts",
    "noCredentialLeak",
    "safeForBusinessEvidence"
  ];
  if (report?.status !== "accepted" || report?.decision !== "pass") {
    issues.push("$.status/decision: generated-audio manual review evidence must be accepted/pass.");
  }
  if (report?.redactionReviewed !== true) {
    issues.push("$.redactionReviewed: expected true for accepted generated-audio manual review evidence.");
  }
  for (const checkName of requiredChecks) {
    if (report?.checks?.[checkName] !== true) {
      issues.push(`$.checks.${checkName}: expected true for accepted generated-audio manual review evidence.`);
    }
  }
  for (const [path, value] of [
    ["$.reviewerId", report?.reviewerId],
    ...((Array.isArray(report?.findings) ? report.findings : []).map((finding, index) => [`$.findings[${index}]`, finding]))
  ]) {
    if (!isSafeManualReviewText(value)) {
      issues.push(`${path}: expected real redacted non-placeholder review text without URLs, local paths, data URIs, bearer tokens, or credential-like strings.`);
    }
  }

  if (!isGeneratedAudioReviewRepoPath(report?.sourceGeneratedAudioReportPath, ["assets/output_deliverables/business-readiness/"], ["generated-audio-validation-report.json"])) {
    issues.push("$.sourceGeneratedAudioReportPath: expected a relative generated-audio validation report path under assets/output_deliverables/business-readiness/.");
  }
  const binding = report?.artifactBinding ?? {};
  const evidence = report?.artifactEvidence ?? {};
  if (!isLaunchIntakePacketCleanHttpsUrl(binding.outputUrlPreview)) {
    issues.push("$.artifactBinding.outputUrlPreview: expected a clean non-localhost HTTPS URL without credentials, query string, or fragment.");
  }
  if (!isLaunchIntakePacketCleanHttpsUrl(evidence.outputUrlPreview)) {
    issues.push("$.artifactEvidence.outputUrlPreview: expected a clean non-localhost HTTPS URL without credentials, query string, or fragment.");
  }
  for (const key of ["outputUrlPreview", "predictionId"]) {
    if (binding[key] !== evidence[key]) {
      issues.push(`$.artifactEvidence.${key}: expected to match artifactBinding.${key}.`);
    }
  }
  if (!isGeneratedAudioReviewRepoPath(evidence.generatedAudioArtifactEvidenceReportPath, ["assets/output_deliverables/business-readiness/"], ["generated-audio-artifact-evidence-report.json"])) {
    issues.push("$.artifactEvidence.generatedAudioArtifactEvidenceReportPath: expected a relative generated-audio artifact evidence report path under assets/output_deliverables/business-readiness/.");
  }
  if (!isGeneratedAudioReviewRepoPath(evidence.artifactPath, ["assets/output_deliverables/business-readiness/generated-audio-artifacts/"], [".mp3", ".wav"])) {
    issues.push("$.artifactEvidence.artifactPath: expected a relative generated-audio artifact path under assets/output_deliverables/business-readiness/generated-audio-artifacts/.");
  }
  if (!/^[a-f0-9]{64}$/.test(String(evidence.mediaSha256 ?? ""))) {
    issues.push("$.artifactEvidence.mediaSha256: expected SHA-256 media fingerprint.");
  }
  if (Number(evidence.byteSize ?? 0) <= 0) {
    issues.push("$.artifactEvidence.byteSize: expected positive byte size.");
  }
  if (Number(evidence.durationSeconds ?? 0) <= 0) {
    issues.push("$.artifactEvidence.durationSeconds: expected positive duration.");
  }
  return issues;
}

function isGeneratedAudioReviewRepoPath(value, allowedPrefixes, allowedSuffixes) {
  if (typeof value !== "string" || !value.trim() || containsUnsafeDirectorReviewText(value)) {
    return false;
  }
  const normalized = value.replace(/\\/g, "/");
  return allowedPrefixes.some((prefix) => normalized.startsWith(prefix)) &&
    allowedSuffixes.some((suffix) => normalized.endsWith(suffix)) &&
    !normalized.includes("..") &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !/^https?:\/\//i.test(normalized);
}

function isSafeManualReviewText(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !launchIntakePacketPlaceholderPattern.test(value) &&
    !containsUnsafeDirectorReviewText(value) &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validateGeneratedAudioManualReviewReadinessSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const sourceReady = report?.sourceReportContext?.readyForArtifactAndManualReview === true;
  const artifactReady = report?.artifactEvidenceContext?.readyForManualReviewBinding === true;
  const manualPresent = report?.manualReviewContext?.present === true;
  const manualPassed = report?.manualReviewContext?.passed === true;
  let expectedStatus = "ready_for_manual_review";
  if (!sourceReady) {
    expectedStatus = "blocked_by_generated_audio_report";
  } else if (!artifactReady) {
    expectedStatus = "blocked_by_artifact_evidence";
  } else if (manualPassed) {
    expectedStatus = "accepted_manual_review";
  } else if (manualPresent) {
    expectedStatus = "blocked_by_manual_review";
  }
  if (report?.status !== expectedStatus) {
    issues.push(`$.status: expected ${expectedStatus} from source/artifact/manual review readiness.`);
  }
  if (
    report?.noSpend !== true ||
    report?.networkCallsMade !== false ||
    report?.providerCallsMade !== false ||
    report?.releaseEvidence !== false
  ) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade/releaseEvidence: expected no-spend, no-network, no-provider, non-release readiness evidence.");
  }
  if (sourceReady && report?.sourceReportContext?.outputUrlClean !== true) {
    issues.push("$.sourceReportContext.outputUrlClean: expected clean HTTPS output URL when source is ready.");
  }
  if (artifactReady) {
    if (report?.artifactEvidenceContext?.bindingMatchesSourceReport !== true) {
      issues.push("$.artifactEvidenceContext.bindingMatchesSourceReport: expected true when artifact evidence is ready.");
    }
    if (Number(report?.artifactEvidenceContext?.byteSize ?? 0) <= 0) {
      issues.push("$.artifactEvidenceContext.byteSize: expected positive byte size when artifact evidence is ready.");
    }
    if (Number(report?.artifactEvidenceContext?.durationSeconds ?? 0) <= 0) {
      issues.push("$.artifactEvidenceContext.durationSeconds: expected positive duration when artifact evidence is ready.");
    }
  }
  if (manualPassed) {
    if (report?.manualReviewContext?.status !== "accepted" || report?.manualReviewContext?.decision !== "pass") {
      issues.push("$.manualReviewContext.status/decision: expected accepted/pass when manual review passes.");
    }
    if (report?.manualReviewContext?.artifactBindingMatchesReport !== true || report?.manualReviewContext?.artifactEvidenceMatchesReport !== true) {
      issues.push("$.manualReviewContext artifact binding/evidence: expected matches when manual review passes.");
    }
    if (report?.releaseGateSummary?.canUseManualReviewAsGeneratedAudioEvidence !== true) {
      issues.push("$.releaseGateSummary.canUseManualReviewAsGeneratedAudioEvidence: expected true for accepted manual review.");
    }
  } else if (report?.releaseGateSummary?.canUseManualReviewAsGeneratedAudioEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseManualReviewAsGeneratedAudioEvidence: expected false until manual review is accepted.");
  }
  if (
    report?.releaseGateSummary?.canUseAsBusinessReadinessGeneratedAudioEvidence !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: readiness evidence must not unlock business-readiness generated audio or customer traffic by itself.");
  }
  if (checks.filter((check) => check?.status === "fail").length > 0 && ["ready_for_manual_review", "accepted_manual_review"].includes(report?.status)) {
    issues.push("$.checks: ready/accepted readiness reports must not contain failed checks.");
  }
  return issues;
}

function validateLongFormManualQualityReviewSemantics(report) {
  const issues = [];
  const requiredQualityCheckNames = [
    "durationAndPacingAccepted",
    "shotContinuityAccepted",
    "visualArtifactsAccepted",
    "promptFidelityAccepted",
    "audioSyncAccepted",
    "noUnsafeContentObserved"
  ];
  const qualityChecks = report?.qualityChecks && typeof report.qualityChecks === "object"
    ? report.qualityChecks
    : [];
  if (report?.decision === "pass") {
    if (report?.redactionReviewPassed !== true) {
      issues.push("$.redactionReviewPassed: pass reviews must include accepted redaction review.");
    }
    for (const checkName of requiredQualityCheckNames) {
      if (qualityChecks?.[checkName] !== true) {
        issues.push(`$.qualityChecks.${checkName}: expected true when decision=pass.`);
      }
    }
    if (!isSafeManualReviewText(report?.reviewer)) {
      issues.push("$.reviewer: pass reviews must include real redacted non-placeholder reviewer text.");
    }
    if (typeof report?.reviewedAt !== "string" || Number.isNaN(Date.parse(report.reviewedAt))) {
      issues.push("$.reviewedAt: pass reviews must include a valid review timestamp.");
    }
  }
  if (report?.decision === "needs_review" && report?.redactionReviewPassed === true) {
    issues.push("$.redactionReviewPassed: needs_review packets must not mark redaction review passed.");
  }
  for (const [path, value] of [
    ["$.reviewer", report?.reviewer],
    ["$.notes", report?.notes]
  ]) {
    if (value !== undefined && !isSafeManualReviewText(value)) {
      issues.push(`${path}: expected redacted non-placeholder review text without URLs, local paths, data URIs, bearer tokens, or credential-like strings.`);
    }
  }
  return issues;
}

function validateLongFormManualQualityReviewDraftSemantics(report) {
  const issues = [];
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend, no-network long-form review draft generation.");
  }
  if (report?.template?.templateOnly !== true || report?.template?.directUseRejectedByValidation !== true) {
    issues.push("$.template: expected template-only output that is rejected by final long-form validation if used directly.");
  }
  if (report?.template?.safeForEvidenceUse !== false) {
    issues.push("$.template.safeForEvidenceUse: expected false for long-form review draft template.");
  }
  if (
    report?.releaseGateSummary?.canUseTemplateAsManualQualityReviewEvidence !== false ||
    report?.releaseGateSummary?.canUseAsBusinessReadinessLongFormEvidence !== false ||
    report?.releaseGateSummary?.canClaimDirectorBenchParity !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: long-form review drafts must not unlock long-form, DirectorBench, or customer-release claims.");
  }
  if (report?.status === "pass") {
    if (report?.sourceReportContext?.readyForManualReview !== true) {
      issues.push("$.sourceReportContext.readyForManualReview: pass draft reports require paid long-form artifact evidence ready for operator review.");
    }
    if (report?.template?.available !== true || report?.checklist?.available !== true) {
      issues.push("$.template/$.checklist: pass draft reports must have an available template and checklist.");
    }
    if (Array.isArray(report?.issues) && report.issues.length > 0) {
      issues.push("$.issues: pass draft reports must not carry issues.");
    }
  }
  return issues;
}

function validateLongFormManualQualityReviewReadinessSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const sourceReady = report?.sourceReportContext?.readyForManualReview === true;
  const manualPresent = report?.manualReviewContext?.present === true;
  const manualPassed = report?.manualReviewContext?.passed === true;
  let expectedStatus = "ready_for_manual_review";
  if (!sourceReady) {
    expectedStatus = "blocked_by_long_form_report";
  } else if (manualPassed) {
    expectedStatus = "accepted_manual_review";
  } else if (manualPresent) {
    expectedStatus = "blocked_by_manual_review";
  }
  if (report?.status !== expectedStatus) {
    issues.push(`$.status: expected ${expectedStatus} from long-form/manual review readiness.`);
  }
  if (
    report?.noSpend !== true ||
    report?.networkCallsMade !== false ||
    report?.providerCallsMade !== false ||
    report?.releaseEvidence !== false
  ) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade/releaseEvidence: expected no-spend, no-network, no-provider, non-release readiness evidence.");
  }
  if (sourceReady) {
    if (report?.sourceReportContext?.providerSpendAllowed !== true) {
      issues.push("$.sourceReportContext.providerSpendAllowed: expected true when source is ready.");
    }
    if (report?.sourceReportContext?.atlasBillingReady !== true) {
      issues.push("$.sourceReportContext.atlasBillingReady: expected true when source is ready.");
    }
    if (report?.sourceReportContext?.paidRenderCompleted !== true) {
      issues.push("$.sourceReportContext.paidRenderCompleted: expected true when source is ready.");
    }
    if (report?.sourceReportContext?.artifactValidationPassed !== true) {
      issues.push("$.sourceReportContext.artifactValidationPassed: expected true when source is ready.");
    }
    if (report?.sourceReportContext?.artifactEvidencePresent !== true || report?.sourceReportContext?.deliverablePresent !== true) {
      issues.push("$.sourceReportContext artifact/deliverable readiness: expected true when source is ready.");
    }
    const finalDurationSeconds = Number(report?.sourceReportContext?.finalDurationSeconds ?? 0);
    if (finalDurationSeconds < 120 || finalDurationSeconds > 480) {
      issues.push("$.sourceReportContext.finalDurationSeconds: expected 120-480s when source is ready.");
    }
    if (Number(report?.sourceReportContext?.renderedShotCount ?? 0) <= 0 || Number(report?.sourceReportContext?.compiledPromptCount ?? 0) <= 0) {
      issues.push("$.sourceReportContext renderedShotCount/compiledPromptCount: expected positive counts when source is ready.");
    }
    if (Number(report?.sourceReportContext?.costLedgerEntryCount ?? 0) <= 0) {
      issues.push("$.sourceReportContext.costLedgerEntryCount: expected positive count when source is ready.");
    }
    if (report?.sourceReportContext?.artifactBindingComplete !== true) {
      issues.push("$.sourceReportContext.artifactBindingComplete: expected true when source is ready.");
    }
  }
  if (manualPassed) {
    if (report?.manualReviewContext?.decision !== "pass" || report?.manualReviewContext?.redactionReviewPassed !== true) {
      issues.push("$.manualReviewContext.decision/redactionReviewPassed: expected pass/true when manual review passes.");
    }
    if (report?.manualReviewContext?.artifactBindingMatchesReport !== true) {
      issues.push("$.manualReviewContext.artifactBindingMatchesReport: expected true when manual review passes.");
    }
    if (Number(report?.manualReviewContext?.passedCheckCount ?? 0) !== Number(report?.manualReviewContext?.requiredCheckCount ?? -1)) {
      issues.push("$.manualReviewContext.passedCheckCount: expected every required quality check to pass.");
    }
    if (report?.manualReviewContext?.templateFieldsPresent !== false || Number(report?.manualReviewContext?.unsafeTextFieldCount ?? 0) !== 0) {
      issues.push("$.manualReviewContext template/unsafe text guards: expected no template fields and no unsafe text.");
    }
    if (report?.releaseGateSummary?.canUseManualReviewAsLongFormEvidence !== true) {
      issues.push("$.releaseGateSummary.canUseManualReviewAsLongFormEvidence: expected true for accepted manual review.");
    }
  } else if (report?.releaseGateSummary?.canUseManualReviewAsLongFormEvidence !== false) {
    issues.push("$.releaseGateSummary.canUseManualReviewAsLongFormEvidence: expected false until manual review is accepted.");
  }
  if (
    report?.releaseGateSummary?.canUseAsBusinessReadinessLongFormEvidence !== false ||
    report?.releaseGateSummary?.canClaimDirectorBenchParity !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: readiness evidence must not unlock long-form business evidence, DirectorBench parity, or customer traffic by itself.");
  }
  if (checks.filter((check) => check?.status === "fail").length > 0 && ["ready_for_manual_review", "accepted_manual_review"].includes(report?.status)) {
    issues.push("$.checks: ready/accepted readiness reports must not contain failed checks.");
  }
  return issues;
}

function validateGeneratedAudioManualReviewDraftSemantics(report) {
  const issues = [];
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade: expected no-spend, no-network draft generation.");
  }
  if (report?.template?.templateOnly !== true || report?.template?.directUseRejectedByValidation !== true) {
    issues.push("$.template: expected template-only output that is rejected by final manual-review validation if used directly.");
  }
  if (report?.template?.safeForEvidenceUse !== false) {
    issues.push("$.template.safeForEvidenceUse: expected false for draft template.");
  }
  if (
    report?.releaseGateSummary?.canUseTemplateAsManualAudioReviewEvidence !== false ||
    report?.releaseGateSummary?.canUseAsBusinessReadinessGeneratedAudioEvidence !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: manual-review drafts must not unlock generated-audio evidence or customer traffic.");
  }
  if (report?.status === "pass") {
    if (report?.sourceReportContext?.readyForManualReview !== true) {
      issues.push("$.sourceReportContext.readyForManualReview: pass draft reports require provider/output/ledger evidence ready for operator listening.");
    }
    if (report?.template?.available !== true || report?.checklist?.available !== true) {
      issues.push("$.template/$.checklist: pass draft reports must have an available template and checklist.");
    }
    if (Array.isArray(report?.issues) && report.issues.length > 0) {
      issues.push("$.issues: pass draft reports must not carry issues.");
    }
  }
  const binding = report?.sourceReportContext?.artifactBinding;
  if (binding && typeof binding === "object") {
    if (typeof binding.outputUrlPreview === "string" && /[?&#]/.test(binding.outputUrlPreview)) {
      issues.push("$.sourceReportContext.artifactBinding.outputUrlPreview: expected credential-free URL preview without query or fragment.");
    }
  }
  const artifactContext = report?.artifactEvidenceContext;
  if (
    artifactContext?.canUseAsManualReviewArtifactEvidence === true &&
    artifactContext?.bindingMatchesSourceReport !== true
  ) {
    issues.push("$.artifactEvidenceContext.bindingMatchesSourceReport: expected true when artifact evidence is available for manual-review binding.");
  }
  return issues;
}

function unsafeDirectorReviewTextIssues(value, path) {
  const issues = [];
  collectUnsafeDirectorReviewTextIssues(value, path, issues);
  return issues;
}

function collectUnsafeDirectorReviewTextIssues(value, path, issues) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsafeDirectorReviewTextIssues(item, `${path}[${index}]`, issues));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${escapePath(key)}`;
    if (key === "evidenceSummary" && typeof item === "string" && containsUnsafeDirectorReviewText(item)) {
      issues.push(`${itemPath}: expected redacted aggregate review text without local paths, URLs, data URIs, bearer tokens, or credential-like strings.`);
      continue;
    }
    if (key === "findings" && Array.isArray(item)) {
      item.forEach((finding, index) => {
        if (typeof finding === "string" && containsUnsafeDirectorReviewText(finding)) {
          issues.push(`${itemPath}[${index}]: expected redacted aggregate review finding without local paths, URLs, data URIs, bearer tokens, or credential-like strings.`);
        }
      });
      continue;
    }
    collectUnsafeDirectorReviewTextIssues(item, itemPath, issues);
  }
}

function containsUnsafeDirectorReviewText(value) {
  return unsafeDirectorReviewTextPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
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

function validateProductionGraphResumeStateSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const publicPayload = JSON.stringify(report ?? {});
  const unsafePatterns = [
    /https?:\/\//i,
    /data:/i,
    /[A-Za-z]:\\/,
    /\\\\/,
    /(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\//i,
    /bearer\s+/i,
    /api[_-]?key/i,
    /sk_live/i,
    /token_should_not_escape/i,
    /pred_resume_active/i,
    /graph_resume_lane_primary/i,
    /resume_worker_a/i,
    /cdn\.example\.com/i
  ];

  if (report?.status === "pass" && failedChecks.length > 0) {
    issues.push("$.checks: status pass requires zero failed checks.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.providerCallsMade !== false || report?.queueCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/providerCallsMade/queueCallsMade: expected no-spend local smoke evidence.");
  }
  if (report?.summary?.rawGraphStateStored !== false || report?.capsule?.redactionSummary?.rawGraphStateStored !== false) {
    issues.push("$.summary.rawGraphStateStored: expected false for digest-only resume-state capsule.");
  }
  if (report?.summary?.rawProviderPayloadStored !== false || report?.capsule?.redactionSummary?.rawProviderPayloadStored !== false) {
    issues.push("$.summary.rawProviderPayloadStored: expected false for digest-only resume-state capsule.");
  }
  if (report?.summary?.outputUrlsStored !== false || report?.capsule?.redactionSummary?.outputUrlsStored !== false) {
    issues.push("$.summary.outputUrlsStored: expected false for digest-only resume-state capsule.");
  }
  if (report?.summary?.localPathsStored !== false || report?.capsule?.redactionSummary?.localPathsStored !== false) {
    issues.push("$.summary.localPathsStored: expected false for digest-only resume-state capsule.");
  }
  if (report?.summary?.secretLikeTextStored !== false || report?.capsule?.redactionSummary?.secretLikeTextStored !== false) {
    issues.push("$.summary.secretLikeTextStored: expected false for digest-only resume-state capsule.");
  }
  if (report?.summary?.canClaimDistributedResume !== false || report?.capsule?.releaseGateSummary?.canClaimDistributedResume !== false) {
    issues.push("$.summary.canClaimDistributedResume: expected false until live distributed worker evidence exists.");
  }
  if (report?.summary?.canReleaseToCustomerTraffic !== false || report?.capsule?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.summary.canReleaseToCustomerTraffic: expected false for local resume-state smoke evidence.");
  }
  if (Number(report?.summary?.nodeCount ?? -1) !== Number(report?.capsule?.graphSummary?.nodeCount ?? -2)) {
    issues.push("$.summary.nodeCount: expected to match capsule.graphSummary.nodeCount.");
  }
  if (Number(report?.summary?.edgeCount ?? -1) !== Number(report?.capsule?.graphSummary?.edgeCount ?? -2)) {
    issues.push("$.summary.edgeCount: expected to match capsule.graphSummary.edgeCount.");
  }
  if (Number(report?.summary?.activePredictionIdCount ?? -1) !== Number(report?.capsule?.providerWorkSummary?.activePredictionIdCount ?? -2)) {
    issues.push("$.summary.activePredictionIdCount: expected to match capsule.providerWorkSummary.activePredictionIdCount.");
  }
  if (Number(report?.summary?.activeClipRenderCount ?? -1) !== Number(report?.capsule?.resumeCursor?.activeClipRenderCount ?? -2)) {
    issues.push("$.summary.activeClipRenderCount: expected to match capsule.resumeCursor.activeClipRenderCount.");
  }
  if (report?.queue?.firstEnqueueStatus !== "enqueued" || report?.queue?.replayStatus !== "replayed") {
    issues.push("$.queue: expected first enqueue to record and second enqueue to replay by idempotency key.");
  }
  if (report?.queue?.leaseStatus !== "leased" || report?.queue?.ackStatus !== "acknowledged" || report?.queue?.record?.status !== "acknowledged") {
    issues.push("$.queue: expected lease and acknowledgement lifecycle to complete.");
  }
  if (Number(report?.summary?.enqueuedRecordCount ?? -1) < 1 || Number(report?.summary?.idempotentReplayCount ?? -1) < 1) {
    issues.push("$.summary.enqueuedRecordCount/idempotentReplayCount: expected local queue enqueue plus idempotent replay evidence.");
  }
  if (Number(report?.summary?.leasedRecordCount ?? -1) < 1 || Number(report?.summary?.acknowledgedRecordCount ?? -1) < 1) {
    issues.push("$.summary.leasedRecordCount/acknowledgedRecordCount: expected local queue lease and ack evidence.");
  }
  if (report?.queue?.record?.predictionIdsSha256 !== report?.capsule?.providerWorkSummary?.predictionIdsSha256) {
    issues.push("$.queue.record.predictionIdsSha256: expected to match capsule.providerWorkSummary.predictionIdsSha256.");
  }
  if (report?.queue?.record?.graphStateSha256 !== report?.capsule?.redactedGraphSha256) {
    issues.push("$.queue.record.graphStateSha256: expected to match capsule.redactedGraphSha256.");
  }
  if (report?.capsule?.providerWorkSummary?.requiresActionLedgerPredictionIds !== true) {
    issues.push("$.capsule.providerWorkSummary.requiresActionLedgerPredictionIds: expected true so raw prediction IDs stay outside the capsule.");
  }
  if (unsafePatterns.some((pattern) => pattern.test(publicPayload))) {
    issues.push("$.capsule: public resume-state report must not contain raw URLs, local paths, token-like text, or raw prediction IDs.");
  }
  return issues;
}

function validateProductionGraphResumeQueueServiceSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const publicPayload = JSON.stringify(report ?? {});
  const unsafePatterns = [
    /https?:\/\/(?!cinejelly\.local\/schemas)/i,
    /data:/i,
    /[A-Za-z]:\\/,
    /\\\\/,
    /(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\//i,
    /bearer\s+/i,
    /api[_-]?key/i,
    /sk_live/i,
    /token_should_not_escape/i,
    /pred_resume_queue_service_active/i,
    /graph_resume_service_lane/i,
    /resume_service_worker_a/i,
    /graph_resume_queue_service_deployment/i,
    /cdn\.example\.com/i
  ];

  if (report?.status === "pass" && failedChecks.length > 0) {
    issues.push("$.checks: status pass requires zero failed checks.");
  }
  if (report?.noSpend !== true || report?.externalNetworkCallsMade !== false || report?.localHttpCallsMade !== true || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/externalNetworkCallsMade/localHttpCallsMade/providerCallsMade: expected local no-spend HTTP smoke evidence.");
  }
  if (report?.summary?.firstEnqueueStatus !== "enqueued" || report?.summary?.replayStatus !== "replayed") {
    issues.push("$.summary: expected enqueue then idempotent replay lifecycle.");
  }
  if (report?.summary?.leaseStatus !== "leased" || report?.summary?.wrongAckStatus !== "lease_mismatch" || report?.summary?.ackStatus !== "acknowledged") {
    issues.push("$.summary: expected lease, lease-mismatch rejection, and acknowledgement lifecycle.");
  }
  if (Number(report?.summary?.recordCount ?? -1) < 1 || Number(report?.summary?.acknowledgedRecordCount ?? -1) < 1) {
    issues.push("$.summary.recordCount/acknowledgedRecordCount: expected acknowledged queue record evidence.");
  }
  if (report?.summary?.preflightQueuePathStatus !== "pass") {
    issues.push("$.summary.preflightQueuePathStatus: expected preflight to validate the configured queue path.");
  }
  if (report?.summary?.rawQueueNamesStored !== false || report?.summary?.rawWorkerIdsStored !== false) {
    issues.push("$.summary.rawQueueNamesStored/rawWorkerIdsStored: expected false.");
  }
  if (report?.summary?.canClaimDistributedResume !== false) {
    issues.push("$.summary.canClaimDistributedResume: expected false until live distributed worker evidence exists.");
  }
  if (report?.queue?.record?.status !== "acknowledged") {
    issues.push("$.queue.record.status: expected acknowledged final record.");
  }
  if (typeof report?.queue?.record?.queueNameSha256 !== "string" || !/^[a-f0-9]{64}$/.test(report.queue.record.queueNameSha256)) {
    issues.push("$.queue.record.queueNameSha256: expected queue name hash.");
  }
  if (typeof report?.queue?.record?.workerIdSha256 !== "string" || !/^[a-f0-9]{64}$/.test(report.queue.record.workerIdSha256)) {
    issues.push("$.queue.record.workerIdSha256: expected worker ID hash.");
  }
  if (unsafePatterns.some((pattern) => pattern.test(publicPayload))) {
    issues.push("$.queue: public queue-service report must not contain raw URLs, local paths, token-like text, raw prediction IDs, raw queue names, raw worker IDs, or deployment tokens.");
  }
  return issues;
}

function validateRenderProviderGraphResumeWorkerSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const publicPayload = JSON.stringify(report ?? {});
  const unsafePatterns = [
    /https?:\/\/(?!cinejelly\.local\/schemas)/i,
    /data:/i,
    /[A-Za-z]:\\/,
    /\\\\/,
    /(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\//i,
    /bearer\s+/i,
    /api[_-]?key/i,
    /token_must_not_leak/i,
    /secret_should_not_escape/i,
    /graph_resume_worker_lane/i,
    /pred_graph_resume_worker_active/i,
    /pred_graph_resume_worker_terminal/i,
    /pred_graph_resume_worker_manual/i,
    /cdn\.example\.com/i
  ];

  if (report?.status === "pass" && failedChecks.length > 0) {
    issues.push("$.checks: status pass requires zero failed checks.");
  }
  if (report?.noSpend !== true || report?.networkCallsMade !== false || report?.localHttpCallsMade !== true || report?.providerCallsMade !== false) {
    issues.push("$.noSpend/networkCallsMade/localHttpCallsMade/providerCallsMade: expected no-spend local HTTP worker bridge evidence.");
  }
  if (report?.summary?.firstRunStatus !== "pass" || report?.summary?.secondRunStatus !== "pass") {
    issues.push("$.summary.firstRunStatus/secondRunStatus: expected both worker runs to pass.");
  }
  if (report?.summary?.firstEnqueuedCount !== 1 || report?.summary?.secondReplayedCount !== 1 || report?.summary?.skippedNonResumeCount !== 2) {
    issues.push("$.summary: expected first enqueue, second replay, and two non-resume skips.");
  }
  if (report?.summary?.queueRecordCount !== 1 || report?.queue?.recordCount !== 1) {
    issues.push("$.summary.queueRecordCount/$.queue.recordCount: expected one digest-only queue record.");
  }
  if (report?.summary?.realProviderCallCount !== 0) {
    issues.push("$.summary.realProviderCallCount: expected zero for no-spend worker bridge smoke.");
  }
  if (
    report?.summary?.canUseAsLiveProviderActionEvidence !== false ||
    report?.summary?.canUseAsGraphResumePayloadEvidence !== false ||
    report?.summary?.canClaimDistributedResume !== false
  ) {
    issues.push("$.summary release flags: expected false for live-action, graph-resume-payload, and distributed-resume claims.");
  }
  const firstDecisions = Array.isArray(report?.firstRun?.decisions) ? report.firstRun.decisions : [];
  const secondDecisions = Array.isArray(report?.secondRun?.decisions) ? report.secondRun.decisions : [];
  if (!firstDecisions.some((item) => item?.action === "resume_polling" && item?.status === "enqueued" && item?.queueRecord)) {
    issues.push("$.firstRun.decisions: expected resume_polling enqueue decision with queue record.");
  }
  if (!secondDecisions.some((item) => item?.action === "resume_polling" && item?.status === "replayed" && item?.queueRecord)) {
    issues.push("$.secondRun.decisions: expected resume_polling replay decision with queue record.");
  }
  const queueRecord = report?.queue?.record;
  if (typeof queueRecord?.queueNameSha256 !== "string" || !/^[a-f0-9]{64}$/.test(queueRecord.queueNameSha256)) {
    issues.push("$.queue.record.queueNameSha256: expected queue name hash.");
  }
  if (typeof queueRecord?.predictionIdsSha256 !== "string" || !/^[a-f0-9]{64}$/.test(queueRecord.predictionIdsSha256)) {
    issues.push("$.queue.record.predictionIdsSha256: expected prediction ID hash.");
  }
  if (queueRecord?.status !== "queued") {
    issues.push("$.queue.record.status: expected queued bridge output.");
  }
  if (unsafePatterns.some((pattern) => pattern.test(publicPayload))) {
    issues.push("$.worker: public graph-resume worker report must not contain raw URLs, local paths, token-like text, raw prediction IDs, raw queue names, or deployment tokens.");
  }
  return issues;
}

function validateRenderProviderProductionHandoffSemantics(report) {
  const issues = [];
  const operations = Array.isArray(report?.operations) ? report.operations : [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const failedOrSkippedOperations = operations.filter((operation) => operation?.status === "fail" || operation?.status === "skipped");
  const requiredOperationNames = [
    "worker_a_acquire",
    "worker_b_immediate_acquire",
    "worker_a_heartbeat",
    "worker_a_release",
    "worker_b_after_release_acquire",
    "worker_b_release",
    "active_after_cleanup",
    "list_leases_after_cleanup"
  ];

  if (report?.providerCallsMade !== false || report?.renderCallsMade !== false || report?.noSpend !== true) {
    issues.push("$.providerCallsMade/$.renderCallsMade/$.noSpend: production handoff capture must remain no-spend and must not call provider/render endpoints.");
  }
  if (report?.externalNetworkCallsMade !== (report?.environmentKind === "deployment" && operations.length > 0)) {
    issues.push("$.externalNetworkCallsMade: expected true only for deployment captures with attempted endpoint operations.");
  }
  if (report?.localHttpCallsMade !== (report?.environmentKind === "local" && operations.length > 0)) {
    issues.push("$.localHttpCallsMade: expected true only for local captures with attempted endpoint operations.");
  }
  if (Number(report?.summary?.operationCount ?? -1) !== operations.length) {
    issues.push("$.summary.operationCount: expected to match operations length.");
  }
  if (Number(report?.summary?.failedOperationCount ?? -1) !== operations.filter((operation) => operation?.status === "fail").length) {
    issues.push("$.summary.failedOperationCount: expected to match failed operations.");
  }
  if (Number(report?.summary?.skippedOperationCount ?? -1) !== operations.filter((operation) => operation?.status === "skipped").length) {
    issues.push("$.summary.skippedOperationCount: expected to match skipped operations.");
  }
  for (const name of requiredOperationNames) {
    if (!operations.some((operation) => operation?.name === name)) {
      issues.push(`$.operations: missing required production handoff operation ${name}.`);
    }
  }
  const rawJobIdPaths = collectForbiddenKeyPaths(operations, "$.operations", "jobId");
  if (rawJobIdPaths.length > 0) {
    issues.push(`${rawJobIdPaths[0]}: raw lease job IDs must not be serialized in production handoff reports.`);
  }
  if (report?.environmentKind === "deployment" && !String(report?.checkedInputs?.baseUrl ?? "").startsWith("https://[deployment-host]")) {
    issues.push("$.checkedInputs.baseUrl: deployment reports must redact the hostname as https://[deployment-host].");
  }
  if (report?.environmentKind === "local" && report?.releaseGateSummary?.canUseAsProductionHandoffEvidence === true) {
    issues.push("$.releaseGateSummary.canUseAsProductionHandoffEvidence: local captures cannot be usable production handoff evidence.");
  }
  const usableExpected = report?.status === "pass" &&
    report?.environmentKind === "deployment" &&
    failedChecks.length === 0 &&
    failedOrSkippedOperations.length === 0 &&
    rawJobIdPaths.length === 0;
  if (report?.releaseGateSummary?.canUseAsProductionHandoffEvidence !== usableExpected) {
    issues.push("$.releaseGateSummary.canUseAsProductionHandoffEvidence: expected true only for pass deployment captures with complete redacted operations.");
  }
  if (report?.releaseGateSummary?.productionHandoffCapturePass !== usableExpected) {
    issues.push("$.releaseGateSummary.productionHandoffCapturePass: expected to match usable production handoff evidence.");
  }
  if (report?.releaseGateSummary?.canClaimDistributedResume !== false || report?.summary?.canClaimDistributedResume !== false) {
    issues.push("$.releaseGateSummary.canClaimDistributedResume/$.summary.canClaimDistributedResume: expected false; production handoff alone is not distributed resume parity.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; production handoff evidence is not customer-release approval.");
  }
  if (report?.status === "pass" && (failedChecks.length > 0 || failedOrSkippedOperations.length > 0)) {
    issues.push("$.status: pass requires zero failed checks and zero failed/skipped operations.");
  }
  return issues;
}

function collectForbiddenKeyPaths(value, path, forbiddenKey) {
  const matches = [];
  collectForbiddenKeyPathsInto(value, path, forbiddenKey, matches);
  return matches;
}

function collectForbiddenKeyPathsInto(value, path, forbiddenKey, matches) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeyPathsInto(item, `${path}[${index}]`, forbiddenKey, matches));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${escapePath(key)}`;
    if (key === forbiddenKey) {
      matches.push(itemPath);
    }
    collectForbiddenKeyPathsInto(item, itemPath, forbiddenKey, matches);
  }
}

function validateRenderProviderLiveActionsSemantics(report) {
  const issues = [];
  const executions = Array.isArray(report?.executions) ? report.executions : [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const providerCallEvidenceCount = executions.filter((item) => item?.providerCallMade === true).length;
  const resumePollingEvidenceCount = executions.filter((item) => item?.action === "resume_polling").length;
  const graphResumeEvidenceCount = executions.filter(isValidLiveActionGraphResumeExecution).length;
  const terminalCloseEvidenceCount = executions.filter((item) => typeof item?.action === "string" && item.action.startsWith("close_terminal_")).length;
  const manualAuditEvidenceCount = executions.filter((item) => item?.action === "manual_audit_required").length;
  const redactionReviewedCount = executions.filter((item) => item?.redactionReviewed === true).length;
  const unsafeStoredEvidenceCount = executions.filter((item) => item?.rawProviderPayloadStored === true || item?.outputUrlsStored === true).length;
  const graphResumeEvidencePass = report?.status === "pass" && graphResumeEvidenceCount > 0;

  if (report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.networkCallsMade/$.providerCallsMade: expected false; this validator must only read archived evidence.");
  }
  if (Number(report?.summary?.evidenceExecutionCount ?? -1) !== executions.length) {
    issues.push("$.summary.evidenceExecutionCount: expected to match executions length.");
  }
  if (Number(report?.summary?.providerCallEvidenceCount ?? -1) !== providerCallEvidenceCount) {
    issues.push("$.summary.providerCallEvidenceCount: expected to match executions with providerCallMade=true.");
  }
  if (Number(report?.summary?.resumePollingEvidenceCount ?? -1) !== resumePollingEvidenceCount) {
    issues.push("$.summary.resumePollingEvidenceCount: expected to match resume_polling executions.");
  }
  if (Number(report?.summary?.graphResumeEvidenceCount ?? -1) !== graphResumeEvidenceCount) {
    issues.push("$.summary.graphResumeEvidenceCount: expected to match graph_resume_enqueue/resume_enqueued executions.");
  }
  if (Number(report?.summary?.terminalCloseEvidenceCount ?? -1) !== terminalCloseEvidenceCount) {
    issues.push("$.summary.terminalCloseEvidenceCount: expected to match close_terminal_* executions.");
  }
  if (Number(report?.summary?.manualAuditEvidenceCount ?? -1) !== manualAuditEvidenceCount) {
    issues.push("$.summary.manualAuditEvidenceCount: expected to match manual_audit_required executions.");
  }
  if (Number(report?.summary?.redactionReviewedCount ?? -1) !== redactionReviewedCount) {
    issues.push("$.summary.redactionReviewedCount: expected to match executions with redactionReviewed=true.");
  }
  if (unsafeStoredEvidenceCount > 0) {
    issues.push("$.executions: raw provider payloads and output URLs must not be stored in live action reports.");
  }
  for (const [index, execution] of executions.entries()) {
    if (!liveActionExecutionRelationshipValid(execution)) {
      issues.push(`$.executions[${index}]: expected action/providerCallKind/resultStatus to be internally consistent.`);
    }
  }
  if (report?.releaseGateSummary?.canClaimDistributedResume !== false || report?.summary?.canClaimDistributedResume !== false) {
    issues.push("$.releaseGateSummary.canClaimDistributedResume/$.summary.canClaimDistributedResume: expected false until deployed graph-resume parity exists.");
  }
  if (report?.releaseGateSummary?.graphResumeEvidencePass !== graphResumeEvidencePass) {
    issues.push("$.releaseGateSummary.graphResumeEvidencePass: expected true only when a pass report includes graph-resume enqueue evidence.");
  }
  if (report?.summary?.canUseAsGraphResumeEvidence !== graphResumeEvidencePass) {
    issues.push("$.summary.canUseAsGraphResumeEvidence: expected true only when a pass report includes graph-resume enqueue evidence.");
  }
  if (report?.releaseGateSummary?.canUseAsDistributedResumeEvidence !== graphResumeEvidencePass) {
    issues.push("$.releaseGateSummary.canUseAsDistributedResumeEvidence: expected true only for pass reports with graph-resume enqueue evidence.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; live action evidence is not customer-release approval.");
  }
  if (report?.status === "pass") {
    if (failedChecks.length > 0) {
      issues.push("$.checks: status pass requires zero failed checks.");
    }
    if (report?.checkedInputs?.confirmLiveProviderActions !== true) {
      issues.push("$.checkedInputs.confirmLiveProviderActions: status pass requires explicit live-provider-action confirmation.");
    }
    if (report?.summary?.productionHandoffUsable !== true || report?.summary?.productionHandoffStatus !== "pass") {
      issues.push("$.summary.productionHandoff*: status pass requires a usable passing production handoff capture.");
    }
    if (report?.summary?.productionHandoffDeploymentMatch !== true) {
      issues.push("$.summary.productionHandoffDeploymentMatch: status pass requires live action evidence to match the production handoff deployment fingerprint.");
    }
    if (providerCallEvidenceCount < 1 || resumePollingEvidenceCount < 1 || terminalCloseEvidenceCount + manualAuditEvidenceCount < 1) {
      issues.push("$.executions: status pass requires provider-call, resume-polling, and terminal-close/manual-audit evidence.");
    }
    if (redactionReviewedCount !== executions.length) {
      issues.push("$.executions: status pass requires every live action evidence item to be redaction reviewed.");
    }
    if (report?.summary?.canUseAsLiveProviderActionEvidence !== true || report?.releaseGateSummary?.liveProviderActionEvidencePass !== true) {
      issues.push("$.summary/releaseGateSummary: status pass requires live action evidence usability flags to be true.");
    }
  }
  if (report?.status !== "pass" && (
    report?.summary?.canUseAsLiveProviderActionEvidence === true ||
    report?.summary?.canUseAsGraphResumeEvidence === true ||
    report?.releaseGateSummary?.canUseAsDistributedResumeEvidence === true ||
    report?.releaseGateSummary?.graphResumeEvidencePass === true
  )) {
    issues.push("$.summary/releaseGateSummary: non-pass live action report cannot be usable live-action or graph-resume evidence.");
  }
  return issues;
}

function validateRenderProviderGraphResumeEnqueuesSemantics(report) {
  const issues = [];
  const enqueues = Array.isArray(report?.enqueues) ? report.enqueues : [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failedChecks = checks.filter((check) => check?.status === "fail");
  const redactionReviewedCount = enqueues.filter((item) => item?.redactionReviewed === true).length;
  const unsafeStoredEvidenceCount = enqueues.filter((item) =>
    item?.rawGraphStateStored === true ||
    item?.rawProviderPayloadStored === true ||
    item?.outputUrlsStored === true
  ).length;
  const passReady = report?.status === "pass";

  if (report?.networkCallsMade !== false || report?.providerCallsMade !== false || report?.queueCallsMade !== false) {
    issues.push("$.networkCallsMade/$.providerCallsMade/$.queueCallsMade: expected false; graph-resume enqueue validation must only read archived evidence.");
  }
  if (Number(report?.summary?.enqueueCount ?? -1) !== enqueues.length) {
    issues.push("$.summary.enqueueCount: expected to match enqueues length.");
  }
  if (Number(report?.summary?.redactionReviewedCount ?? -1) !== redactionReviewedCount) {
    issues.push("$.summary.redactionReviewedCount: expected to match enqueues with redactionReviewed=true.");
  }
  if (Number(report?.summary?.matchedLiveGraphResumeExecutionCount ?? -1) > enqueues.length) {
    issues.push("$.summary.matchedLiveGraphResumeExecutionCount: cannot exceed enqueue count.");
  }
  if (unsafeStoredEvidenceCount > 0) {
    issues.push("$.enqueues: raw graph state, raw provider payloads, and output URLs must not be stored.");
  }
  if (report?.summary?.canClaimDistributedResume !== false ||
      report?.releaseGateSummary?.canClaimDistributedResume !== false ||
      report?.releaseGateSummary?.canUseAsDistributedResumeEvidence !== false) {
    issues.push("$.summary/releaseGateSummary: graph-resume payload evidence must not claim distributed resume by itself.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: expected false; graph-resume payload evidence is not customer-release approval.");
  }
  if (report?.summary?.canUseAsGraphResumePayloadEvidence !== passReady ||
      report?.releaseGateSummary?.graphResumePayloadEvidencePass !== passReady ||
      report?.releaseGateSummary?.canUseAsGraphResumePayloadEvidence !== passReady) {
    issues.push("$.summary/releaseGateSummary graph-resume payload flags: expected true only when status=pass.");
  }
  if (passReady) {
    if (failedChecks.length > 0) {
      issues.push("$.checks: status pass requires zero failed checks.");
    }
    if (report?.checkedInputs?.confirmGraphResumeEnqueues !== true) {
      issues.push("$.checkedInputs.confirmGraphResumeEnqueues: status pass requires explicit graph-resume enqueue confirmation.");
    }
    if (report?.summary?.liveActionsStatus !== "pass" || report?.summary?.liveActionsGraphResumeEvidenceUsable !== true) {
      issues.push("$.summary.liveActions*: status pass requires a passing live action report with usable graph-resume evidence.");
    }
    if (report?.summary?.deploymentBindingMatch !== true) {
      issues.push("$.summary.deploymentBindingMatch: status pass requires matching deployment fingerprint.");
    }
    if (enqueues.length < 1 ||
        Number(report?.summary?.matchedLiveGraphResumeExecutionCount ?? -1) !== enqueues.length ||
        redactionReviewedCount !== enqueues.length) {
      issues.push("$.enqueues: status pass requires every enqueue to match live graph-resume execution evidence and be redaction reviewed.");
    }
  }
  if (!passReady && (
    report?.summary?.canUseAsGraphResumePayloadEvidence === true ||
    report?.releaseGateSummary?.graphResumePayloadEvidencePass === true ||
    report?.releaseGateSummary?.canUseAsGraphResumePayloadEvidence === true
  )) {
    issues.push("$.summary/releaseGateSummary: non-pass graph-resume enqueue reports cannot expose usable payload evidence flags.");
  }
  return issues;
}

function validateRenderProviderGraphResumeEnqueueEvidenceDraftSemantics(report) {
  const issues = [];
  if (report?.networkCallsMade !== false || report?.providerCallsMade !== false || report?.queueCallsMade !== false) {
    issues.push("$.networkCallsMade/$.providerCallsMade/$.queueCallsMade: expected false; graph-resume enqueue draft helper must not call network, providers, or queues.");
  }
  if (report?.template?.templateOnly !== true || report?.template?.directUseRejectedByEvidenceSchema !== true) {
    issues.push("$.template: expected template-only output that is rejected by final graph-resume enqueue evidence validation if used directly.");
  }
  if (report?.template?.safeForEvidenceUse !== false) {
    issues.push("$.template.safeForEvidenceUse: expected false for graph-resume enqueue templates.");
  }
  if (
    report?.releaseGateSummary?.canUseTemplateAsGraphResumePayloadEvidence !== false ||
    report?.releaseGateSummary?.canUseAsDistributedResumeEvidence !== false ||
    report?.releaseGateSummary?.canClaimDistributedResume !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: graph-resume enqueue drafts must not unlock graph-resume payload, distributed-resume, or customer-release claims.");
  }
  if (report?.status === "pass") {
    if (report?.template?.available !== true || report?.checklist?.available !== true) {
      issues.push("$.template/$.checklist: pass draft reports must have an available template and checklist.");
    }
    if (Array.isArray(report?.issues) && report.issues.length > 0) {
      issues.push("$.issues: pass draft reports must not carry issues.");
    }
  }
  return issues;
}

function validateRenderProviderLiveActionEvidenceDraftSemantics(report) {
  const issues = [];
  if (report?.networkCallsMade !== false || report?.providerCallsMade !== false) {
    issues.push("$.networkCallsMade/$.providerCallsMade: expected false; draft helper must be no-network/no-provider.");
  }
  if (report?.template?.templateOnly !== true || report?.template?.directUseRejectedByEvidenceSchema !== true) {
    issues.push("$.template: draft template must stay template-only and rejected by the evidence schema if copied directly.");
  }
  if (report?.template?.safeForEvidenceUse !== false) {
    issues.push("$.template.safeForEvidenceUse: expected false for operator templates.");
  }
  if (
    report?.releaseGateSummary?.canUseTemplateAsLiveProviderActionEvidence !== false ||
    report?.releaseGateSummary?.canUseTemplateAsGraphResumeEvidence !== false ||
    report?.releaseGateSummary?.canClaimDistributedResume !== false ||
    report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false
  ) {
    issues.push("$.releaseGateSummary: draft reports must not unlock live-action, graph-resume, distributed-resume, or customer-traffic claims.");
  }
  if (report?.status === "pass") {
    if (report?.template?.available !== true || report?.checklist?.available !== true) {
      issues.push("$.template/$.checklist: pass draft reports must have an available template and checklist.");
    }
    if (Array.isArray(report?.issues) && report.issues.length > 0) {
      issues.push("$.issues: pass draft reports must not carry issues.");
    }
  }
  return issues;
}

function isValidLiveActionGraphResumeExecution(item) {
  return item?.action === "resume_polling" &&
    item?.providerCallKind === "graph_resume_enqueue" &&
    item?.resultStatus === "resume_enqueued" &&
    item?.providerCallMade === true;
}

function liveActionExecutionRelationshipValid(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  if (item.action === "resume_polling") {
    if (item.providerCallKind === "graph_resume_enqueue") {
      return item.resultStatus === "resume_enqueued";
    }
    return item.providerCallKind === "prediction_poll" && item.resultStatus === "still_active";
  }
  if (typeof item.action === "string" && item.action.startsWith("close_terminal_")) {
    const kindOk = item.providerCallKind === "terminal_closeout" || item.providerCallKind === "provider_cancel_or_close";
    const statusOk = item.action === "close_terminal_succeeded"
      ? item.resultStatus === "closeout_recorded" || item.resultStatus === "succeeded"
      : item.resultStatus === "closeout_recorded" || item.resultStatus === "terminal_failed";
    return kindOk && statusOk;
  }
  if (item.action === "manual_audit_required") {
    return item.providerCallKind === "manual_audit_enqueue" && item.resultStatus === "manual_audit_queued";
  }
  return false;
}

function validateCommercialLaunchInputsSemantics(report) {
  const issues = [];
  if (report?.commandPlanAudit?.status !== "pass") {
    issues.push("$.commandPlanAudit.status: expected pass before sharing commercial launch commands.");
  }
  if (Array.isArray(report?.commandPlanAudit?.issues) && report.commandPlanAudit.issues.length > 0) {
    issues.push(`$.commandPlanAudit.issues: expected no command-plan audit issues, found ${report.commandPlanAudit.issues.length}.`);
  }
  if (!report?.sourceReports?.providerLiveActions) {
    issues.push("$.sourceReports.providerLiveActions: expected live provider action report source status.");
  }
  if (!report?.sourceReports?.providerGraphResume) {
    issues.push("$.sourceReports.providerGraphResume: expected graph-resume enqueue report source status.");
  }
  if (!report?.sourceReports?.launchIntake) {
    issues.push("$.sourceReports.launchIntake: expected commercial launch intake source status.");
  }
  const requiredInputs = Array.isArray(report?.requiredInputs) ? report.requiredInputs : [];
  const manifest = report?.operatorHandoffManifest;
  if (!manifest) {
    issues.push("$.operatorHandoffManifest: expected secret-free operator handoff manifest.");
  } else {
    if (manifest.status !== report.status) {
      issues.push("$.operatorHandoffManifest.status: expected to match report status.");
    }
    if (
      manifest.noSpend !== true ||
      manifest.networkCallsMade !== false ||
      manifest.providerCallsMade !== false
    ) {
      issues.push("$.operatorHandoffManifest: expected no-spend/no-network/no-provider-call flags.");
    }
    if (
      manifest.safety?.secretValuesIncluded !== false ||
      manifest.safety?.rawProviderPayloadsIncluded !== false ||
      manifest.safety?.localAbsolutePathsIncluded !== false ||
      manifest.safety?.releaseEvidence !== false
    ) {
      issues.push("$.operatorHandoffManifest.safety: expected secret-free non-release handoff flags.");
    }
    const requiredInputCount = requiredInputs.length;
    if (manifest.summary?.requiredInputCount !== requiredInputCount) {
      issues.push("$.operatorHandoffManifest.summary.requiredInputCount: expected to match requiredInputs length.");
    }
    if (manifest.summary?.commandPlanAuditStatus !== report?.commandPlanAudit?.status) {
      issues.push("$.operatorHandoffManifest.summary.commandPlanAuditStatus: expected to match commandPlanAudit.status.");
    }
    const expectedBlockedInputIds = requiredInputs
      .filter((item) => item?.status === "missing" || item?.status === "blocked_by_budget")
      .map((item) => item.id);
    const manifestBlockedInputIds = Array.isArray(manifest.blockedInputIds) ? manifest.blockedInputIds : [];
    if (JSON.stringify(manifestBlockedInputIds) !== JSON.stringify(expectedBlockedInputIds)) {
      issues.push("$.operatorHandoffManifest.blockedInputIds: expected missing/blocked required input IDs in requiredInputs order.");
    }
    const manifestOperatorFiles = new Set(
      Array.isArray(manifest.operatorInputFiles)
        ? manifest.operatorInputFiles.map((item) => item?.path).filter(Boolean)
        : []
    );
    const expectedOperatorFiles = new Set(
      requiredInputs.flatMap((item) =>
        Array.isArray(item?.filePaths)
          ? item.filePaths.filter((filePath) => typeof filePath === "string" && filePath.startsWith("ops/"))
          : []
      )
    );
    for (const expectedPath of expectedOperatorFiles) {
      if (!manifestOperatorFiles.has(expectedPath)) {
        issues.push(`$.operatorHandoffManifest.operatorInputFiles: expected ${expectedPath}.`);
      }
    }
    const manifestDraftFiles = new Set(
      Array.isArray(manifest.draftFiles)
        ? manifest.draftFiles.map((item) => item?.path).filter(Boolean)
        : []
    );
    for (const expectedDraft of [
      "assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake.draft.json",
      "assets/output_deliverables/business-readiness/operator-drafts/render-provider-live-actions.template.json",
      "assets/output_deliverables/business-readiness/operator-drafts/render-provider-graph-resume-enqueues.template.json"
    ]) {
      if (!manifestDraftFiles.has(expectedDraft)) {
        issues.push(`$.operatorHandoffManifest.draftFiles: expected ${expectedDraft}.`);
      }
    }
    const commandRunbook = Array.isArray(manifest.commandRunbook) ? manifest.commandRunbook : [];
    const inputValidationRunbook = Array.isArray(manifest.inputValidationRunbook) ? manifest.inputValidationRunbook : [];
    if (manifest.summary?.commandCount !== commandRunbook.length) {
      issues.push("$.operatorHandoffManifest.summary.commandCount: expected to match commandRunbook length.");
    }
    if (manifest.summary?.readyCommandCount !== commandRunbook.filter((item) => item?.runnable === true).length) {
      issues.push("$.operatorHandoffManifest.summary.readyCommandCount: expected to match runnable command count.");
    }
    if (manifest.summary?.paidCommandCount !== commandRunbook.filter((item) => item?.requiresProviderSpend === true).length) {
      issues.push("$.operatorHandoffManifest.summary.paidCommandCount: expected to match provider-spend command count.");
    }
    if (manifest.summary?.inputValidationCommandCount !== inputValidationRunbook.length) {
      issues.push("$.operatorHandoffManifest.summary.inputValidationCommandCount: expected to match inputValidationRunbook length.");
    }
    if (
      manifest.summary?.manualReviewInputValidationCommandCount !==
      inputValidationRunbook.filter((item) => item?.requiresManualReview === true).length
    ) {
      issues.push("$.operatorHandoffManifest.summary.manualReviewInputValidationCommandCount: expected to match manual-review guarded input command count.");
    }
    const evidenceCommandCount = Object.values(report?.evidenceCommandPlan ?? {}).reduce(
      (count, commands) => count + (Array.isArray(commands) ? commands.length : 0),
      0
    );
    const budgetCommandCount = Array.isArray(report?.budgetConstrainedPaidPlan?.slices)
      ? report.budgetConstrainedPaidPlan.slices.reduce(
          (count, slice) => count + 1 + (typeof slice?.billingReadinessCommand === "string" ? 1 : 0),
          0
        )
      : 0;
    if (commandRunbook.length !== evidenceCommandCount + budgetCommandCount) {
      issues.push("$.operatorHandoffManifest.commandRunbook: expected flattened evidence command plan plus budget slice commands.");
    }
    const requiredInputCommandCount = requiredInputs.reduce(
      (count, item) => count + splitValidationCommandSteps(item?.validationCommand).length,
      0
    );
    if (inputValidationRunbook.length !== requiredInputCommandCount) {
      issues.push("$.operatorHandoffManifest.inputValidationRunbook: expected expanded requiredInputs validationCommand steps.");
    }
    if (report?.commandPlanAudit?.checkedCommandCount !== evidenceCommandCount + budgetCommandCount + requiredInputCommandCount) {
      issues.push("$.commandPlanAudit.checkedCommandCount: expected required-input, evidence-plan, and budget-slice commands to be audited.");
    }
    for (const item of inputValidationRunbook) {
      if (String(item?.command ?? "").match(/\bStep\s+\d+:/)) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook.command: expected step-expanded command without embedded Step labels.");
      }
    }
    const generatedAudioInputCommands = inputValidationRunbook.filter((item) => item?.sourceInputId === "generated_audio_paid_review");
    if (generatedAudioInputCommands.length !== 3) {
      issues.push("$.operatorHandoffManifest.inputValidationRunbook[generated_audio_paid_review]: expected three generated-audio manual review steps.");
    } else {
      if (!generatedAudioInputCommands[0]?.command?.includes("validation:generated-audio-artifact") || generatedAudioInputCommands[0]?.requiresLiveNetwork !== true) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook[generated_audio_paid_review].step1: expected generated-audio artifact live-network capture.");
      }
      if (!generatedAudioInputCommands[1]?.command?.includes("validation:generated-audio-review-draft")) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook[generated_audio_paid_review].step2: expected generated-audio manual-review draft command.");
      }
      if (
        !generatedAudioInputCommands[2]?.command?.includes("--review-existing-report") ||
        generatedAudioInputCommands[2]?.requiresManualReview !== true
      ) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook[generated_audio_paid_review].step3: expected review-existing manual-audio review command.");
      }
    }
    const longFormInputCommands = inputValidationRunbook.filter((item) => item?.sourceInputId === "long_form_paid_media_review");
    if (longFormInputCommands.length !== 2) {
      issues.push("$.operatorHandoffManifest.inputValidationRunbook[long_form_paid_media_review]: expected two long-form manual review steps.");
    } else {
      if (!longFormInputCommands[0]?.command?.includes("validation:long-form-review-draft")) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook[long_form_paid_media_review].step1: expected long-form review draft command.");
      }
      if (
        !longFormInputCommands[1]?.command?.includes("validation:long-form") ||
        longFormInputCommands[1]?.requiresProviderSpend !== true ||
        longFormInputCommands[1]?.requiresManualReview !== true
      ) {
        issues.push("$.operatorHandoffManifest.inputValidationRunbook[long_form_paid_media_review].step2: expected paid long-form manual quality review command.");
      }
    }
    const refreshCommands = Array.isArray(manifest.refreshCommands) ? manifest.refreshCommands : [];
    for (const expectedCommand of [
      "npm.cmd run validation:commercial-inputs",
      "npm.cmd run validation:report-contracts"
    ]) {
      if (!refreshCommands.includes(expectedCommand)) {
        issues.push(`$.operatorHandoffManifest.refreshCommands: expected ${expectedCommand}.`);
      }
    }
  }
  const scopeDecisionInput = requiredInputs.find((item) => item?.id === "commercial_offer_scope_decision");
  if (!scopeDecisionInput) {
    issues.push("$.requiredInputs: expected commercial_offer_scope_decision checklist item.");
  } else {
    if (scopeDecisionInput.category !== "product_scope" || scopeDecisionInput.sensitivity !== "operator_decision") {
      issues.push("$.requiredInputs[commercial_offer_scope_decision]: expected product_scope/operator_decision classification.");
    }
    if (!Array.isArray(scopeDecisionInput.filePaths) || !scopeDecisionInput.filePaths.includes("ops/commercial-launch-intake.json")) {
      issues.push("$.requiredInputs[commercial_offer_scope_decision].filePaths: expected ops/commercial-launch-intake.json.");
    }
    if (scopeDecisionInput.validationCommand !== "npm.cmd run validation:launch-intake -- --write-draft") {
      issues.push("$.requiredInputs[commercial_offer_scope_decision].validationCommand: expected launch-intake draft command.");
    }
  }
  const liveActionInput = requiredInputs.find((item) => item?.id === "live_provider_action_evidence");
  if (!liveActionInput) {
    issues.push("$.requiredInputs: expected live_provider_action_evidence checklist item.");
  } else {
    if (!Array.isArray(liveActionInput.filePaths) || !liveActionInput.filePaths.includes("ops/render-provider-live-actions.json")) {
      issues.push("$.requiredInputs[live_provider_action_evidence].filePaths: expected ops/render-provider-live-actions.json.");
    }
    if (liveActionInput.validationCommand !== "npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions") {
      issues.push("$.requiredInputs[live_provider_action_evidence].validationCommand: expected provider-live-actions confirmation command.");
    }
  }
  const graphResumeInput = requiredInputs.find((item) => item?.id === "graph_resume_enqueue_evidence");
  if (!graphResumeInput) {
    issues.push("$.requiredInputs: expected graph_resume_enqueue_evidence checklist item.");
  } else {
    if (!Array.isArray(graphResumeInput.filePaths) || !graphResumeInput.filePaths.includes("ops/render-provider-graph-resume-enqueues.json")) {
      issues.push("$.requiredInputs[graph_resume_enqueue_evidence].filePaths: expected ops/render-provider-graph-resume-enqueues.json.");
    }
    if (graphResumeInput.validationCommand !== "npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues") {
      issues.push("$.requiredInputs[graph_resume_enqueue_evidence].validationCommand: expected provider-graph-resume confirmation command.");
    }
  }
  const shortReviewInput = requiredInputs.find((item) => item?.id === "short_review_operation_evidence");
  if (!shortReviewInput) {
    issues.push("$.requiredInputs: expected short_review_operation_evidence checklist item.");
  } else {
    if (!Array.isArray(shortReviewInput.filePaths) || !shortReviewInput.filePaths.includes("ops/short-review-operation-evidence.json")) {
      issues.push("$.requiredInputs[short_review_operation_evidence].filePaths: expected ops/short-review-operation-evidence.json.");
    }
    if (!String(shortReviewInput.validationCommand ?? "").includes("validation:short-review-operation-draft") ||
        !String(shortReviewInput.validationCommand ?? "").includes("validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation")) {
      issues.push("$.requiredInputs[short_review_operation_evidence].validationCommand: expected draft plus accepted review-operation confirmation command.");
    }
  }
  const shortProductRightsInput = requiredInputs.find((item) => item?.id === "short_product_rights_evidence");
  if (!shortProductRightsInput) {
    issues.push("$.requiredInputs: expected short_product_rights_evidence checklist item.");
  } else {
    if (!Array.isArray(shortProductRightsInput.filePaths) || !shortProductRightsInput.filePaths.includes("ops/short-product-rights-evidence.json")) {
      issues.push("$.requiredInputs[short_product_rights_evidence].filePaths: expected ops/short-product-rights-evidence.json.");
    }
    if (!String(shortProductRightsInput.validationCommand ?? "").includes("validation:short-product-rights-draft") ||
        !String(shortProductRightsInput.validationCommand ?? "").includes("validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights")) {
      issues.push("$.requiredInputs[short_product_rights_evidence].validationCommand: expected draft plus accepted product-rights confirmation command.");
    }
  }
  const finalAuditCommands = Array.isArray(report?.evidenceCommandPlan?.finalAudit) ? report.evidenceCommandPlan.finalAudit : [];
  const liveActionCommand = finalAuditCommands.find((item) => item?.name === "live_provider_action_evidence");
  if (!liveActionCommand) {
    issues.push("$.evidenceCommandPlan.finalAudit: expected live_provider_action_evidence command.");
  } else if (liveActionCommand.command !== "npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions") {
    issues.push("$.evidenceCommandPlan.finalAudit[live_provider_action_evidence].command: expected provider-live-actions confirmation command.");
  }
  const graphResumeCommand = finalAuditCommands.find((item) => item?.name === "graph_resume_enqueue_evidence");
  if (!graphResumeCommand) {
    issues.push("$.evidenceCommandPlan.finalAudit: expected graph_resume_enqueue_evidence command.");
  } else if (graphResumeCommand.command !== "npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues") {
    issues.push("$.evidenceCommandPlan.finalAudit[graph_resume_enqueue_evidence].command: expected provider-graph-resume confirmation command.");
  }
  const shortReviewCommand = finalAuditCommands.find((item) => item?.name === "short_review_operation_evidence");
  if (!shortReviewCommand) {
    issues.push("$.evidenceCommandPlan.finalAudit: expected short_review_operation_evidence command.");
  } else if (shortReviewCommand.command !== "npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation") {
    issues.push("$.evidenceCommandPlan.finalAudit[short_review_operation_evidence].command: expected Short review-operation confirmation command.");
  }
  const shortProductRightsCommand = finalAuditCommands.find((item) => item?.name === "short_product_rights_evidence");
  if (!shortProductRightsCommand) {
    issues.push("$.evidenceCommandPlan.finalAudit: expected short_product_rights_evidence command.");
  } else if (shortProductRightsCommand.command !== "npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights") {
    issues.push("$.evidenceCommandPlan.finalAudit[short_product_rights_evidence].command: expected Short product-rights confirmation command.");
  }
  return issues;
}

function splitValidationCommandSteps(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return [];
  }
  const matches = [...normalized.matchAll(/\bStep\s+(\d+):\s*([\s\S]*?)(?=\s+\bStep\s+\d+:\s*|$)/g)];
  if (matches.length === 0) {
    return [normalized];
  }
  return matches.map((match) => match[2].trim().replace(/\.$/, ""));
}

const launchIntakePacketSecretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/gi,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];

const launchIntakePacketPlaceholderPattern = /\b(?:todo|tbd|replace|placeholder|example\.com|your-|fill[-_ ]?me)\b/i;
const launchIntakePacketEnvNamePattern = /^[A-Z][A-Z0-9_]{2,80}$/;
const launchIntakePacketProviderNames = new Set(["pexels", "pixabay", "coverr"]);

function validateCommercialLaunchIntakePacketSemantics(report) {
  const issues = [];
  const serialized = JSON.stringify(report ?? {});
  if (launchIntakePacketSecretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  })) {
    issues.push("$: expected secret-free launch intake without API keys, bearer tokens, signed URL query values, or raw credentials.");
  }

  if (!isLaunchIntakePacketCleanHttpsUrl(report?.deployment?.baseUrl)) {
    issues.push("$.deployment.baseUrl: expected a clean non-localhost HTTPS URL without credentials, query string, or fragment.");
  }
  if (!launchIntakePacketEnvNamePattern.test(String(report?.deployment?.authTokenEnvName ?? ""))) {
    issues.push("$.deployment.authTokenEnvName: expected an environment variable name, not a token value.");
  }
  for (const [path, value] of [
    ["$.operatorEvidence.billingAttestationPath", report?.operatorEvidence?.billingAttestationPath],
    ["$.operatorEvidence.productionAttestationPath", report?.operatorEvidence?.productionAttestationPath]
  ]) {
    if (!isLaunchIntakePacketOpsJsonPath(value)) {
      issues.push(`${path}: expected a relative ops/*.json path without traversal, URL, or absolute path syntax.`);
    }
  }

  const productSurface = report?.commercialOfferScope?.productSurface;
  if (productSurface === "api_cli_only") {
    if (report?.commercialOfferScope?.apiCliOnlyAcknowledgesNoFirstPartyUi !== true) {
      issues.push("$.commercialOfferScope.apiCliOnlyAcknowledgesNoFirstPartyUi: expected true for API/CLI-only commercial scope.");
    }
    if (report?.commercialOfferScope?.uiRequiredBeforeCustomerTraffic !== false) {
      issues.push("$.commercialOfferScope.uiRequiredBeforeCustomerTraffic: expected false for API/CLI-only commercial scope.");
    }
  } else if (productSurface === "first_party_web_ui_required") {
    if (report?.commercialOfferScope?.uiRequiredBeforeCustomerTraffic !== true) {
      issues.push("$.commercialOfferScope.uiRequiredBeforeCustomerTraffic: expected true when the full first-party commercial Web UI is required.");
    }
  }

  const approvedBudgetUsd = numberOrUndefined(report?.budgetApproval?.approvedAtlasBudgetUsd);
  const currentKnownPaidEstimateUsd = numberOrUndefined(report?.budgetApproval?.currentKnownPaidEstimateUsd);
  const currentLongFormMinimumBudgetUsd = numberOrUndefined(report?.budgetApproval?.currentLongFormMinimumBudgetUsd);
  const currentGeneratedAudioEstimateUsd = numberOrUndefined(report?.budgetApproval?.currentGeneratedAudioEstimateUsd);
  const scope = report?.budgetApproval?.scope;
  if (scope === "generated_audio_smoke" && currentGeneratedAudioEstimateUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentGeneratedAudioEstimateUsd)) {
    issues.push("$.budgetApproval.approvedAtlasBudgetUsd: expected to cover currentGeneratedAudioEstimateUsd when scope=generated_audio_smoke.");
  }
  if (scope === "long_form_120s_minimum" && currentLongFormMinimumBudgetUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentLongFormMinimumBudgetUsd)) {
    issues.push("$.budgetApproval.approvedAtlasBudgetUsd: expected to cover currentLongFormMinimumBudgetUsd when scope=long_form_120s_minimum.");
  }
  if (scope === "full_business_readiness_paid_sequence" && currentKnownPaidEstimateUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentKnownPaidEstimateUsd)) {
    issues.push("$.budgetApproval.approvedAtlasBudgetUsd: expected to cover currentKnownPaidEstimateUsd when scope=full_business_readiness_paid_sequence.");
  }

  if (report?.sourceVideo?.enabled === true) {
    if (!isLaunchIntakePacketCleanHttpsUrl(report?.sourceVideo?.url)) {
      issues.push("$.sourceVideo.url: expected a clean non-localhost HTTPS video URL when source-video analysis is enabled.");
    }
    if (report?.sourceVideo?.approvedForAtlasLlmAnalysis !== true) {
      issues.push("$.sourceVideo.approvedForAtlasLlmAnalysis: expected true when source-video analysis is enabled.");
    }
  }

  const providers = Array.isArray(report?.remoteStock?.providers) ? report.remoteStock.providers.map(String) : [];
  const keyEnvVars = Array.isArray(report?.remoteStock?.keyEnvVars) ? report.remoteStock.keyEnvVars.map(String) : [];
  if (report?.remoteStock?.enabled === true) {
    if (providers.length === 0 || providers.some((provider) => !launchIntakePacketProviderNames.has(provider))) {
      issues.push("$.remoteStock.providers: expected one or more supported provider names when remote stock is enabled.");
    }
    if (report?.remoteStock?.commercialTermsReviewed !== true) {
      issues.push("$.remoteStock.commercialTermsReviewed: expected true when remote stock is enabled.");
    }
    if (keyEnvVars.length === 0 || keyEnvVars.some((name) => !launchIntakePacketEnvNamePattern.test(name))) {
      issues.push("$.remoteStock.keyEnvVars: expected one or more env var names when remote stock is enabled.");
    }
  }

  const sourceVideoBudgetUsd = numberOrUndefined(report?.budgetApproval?.sourceVideoAtlasLlmBudgetUsd);
  if (report?.paidValidationPolicy?.allowGeneratedAudioSmoke === true && currentGeneratedAudioEstimateUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentGeneratedAudioEstimateUsd)) {
    issues.push("$.paidValidationPolicy.allowGeneratedAudioSmoke: expected approved budget to cover generated-audio estimate.");
  }
  if (report?.paidValidationPolicy?.allowLongForm === true && currentLongFormMinimumBudgetUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentLongFormMinimumBudgetUsd)) {
    issues.push("$.paidValidationPolicy.allowLongForm: expected approved budget to cover long-form minimum.");
  }
  if (report?.paidValidationPolicy?.allowSourceVideoAnalysis === true && (report?.sourceVideo?.enabled !== true || sourceVideoBudgetUsd === undefined || sourceVideoBudgetUsd <= 0)) {
    issues.push("$.paidValidationPolicy.allowSourceVideoAnalysis: expected enabled source-video inputs and positive source-video Atlas LLM budget.");
  }
  if (report?.paidValidationPolicy?.allowFullSequence === true && currentKnownPaidEstimateUsd !== undefined && (approvedBudgetUsd === undefined || approvedBudgetUsd < currentKnownPaidEstimateUsd)) {
    issues.push("$.paidValidationPolicy.allowFullSequence: expected approved budget to cover full known paid estimate.");
  }

  if (
    report?.manualReview?.generatedAudioListeningRequired !== true ||
    report?.manualReview?.longFormMediaReviewRequired !== true ||
    report?.manualReview?.redactionReviewRequired !== true
  ) {
    issues.push("$.manualReview: expected generated-audio, long-form media, and redaction review requirements to stay true.");
  }
  for (const [path, value] of [
    ["$.preparedBy", report?.preparedBy],
    ["$.commercialOfferScope.decidedBy", report?.commercialOfferScope?.decidedBy],
    ["$.budgetApproval.approvedBy", report?.budgetApproval?.approvedBy],
    ["$.manualReview.reviewer", report?.manualReview?.reviewer]
  ]) {
    if (typeof value !== "string" || !value.trim() || launchIntakePacketPlaceholderPattern.test(value)) {
      issues.push(`${path}: expected real non-placeholder operator text.`);
    }
  }
  return issues;
}

function isLaunchIntakePacketCleanHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim() || launchIntakePacketPlaceholderPattern.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function isLaunchIntakePacketOpsJsonPath(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("ops/") &&
    normalized.endsWith(".json") &&
    !normalized.includes("..") &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !/^https?:\/\//i.test(normalized);
}

function validateBillingAdminAttestationPacketSemantics(report) {
  const issues = [];
  const serialized = JSON.stringify(report ?? {});
  if (launchIntakePacketSecretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  })) {
    issues.push("$: expected non-secret billing/admin attestation without API keys, bearer tokens, signed URL query values, or raw credentials.");
  }

  for (const [path, value] of [
    ["$.termsUrl", report?.termsUrl],
    ["$.privacyUrl", report?.privacyUrl],
    ["$.refundPolicyUrl", report?.refundPolicyUrl]
  ]) {
    if (!isLaunchIntakePacketCleanHttpsUrl(value)) {
      issues.push(`${path}: expected a clean non-localhost HTTPS URL without credentials, query string, or fragment.`);
    }
  }

  for (const [path, value] of [
    ["$.approvedBy", report?.approvedBy],
    ["$.taxHandlingOwner", report?.taxHandlingOwner],
    ["$.supportContact", report?.supportContact],
    ["$.accountLifecycle.provisioning", report?.accountLifecycle?.provisioning],
    ["$.accountLifecycle.suspension", report?.accountLifecycle?.suspension],
    ["$.accountLifecycle.apiKeyRotation", report?.accountLifecycle?.apiKeyRotation],
    ["$.accountLifecycle.refundHandling", report?.accountLifecycle?.refundHandling],
    ["$.accountLifecycle.chargebackHandling", report?.accountLifecycle?.chargebackHandling],
    ["$.spendControls.emergencyDisableProcedure", report?.spendControls?.emergencyDisableProcedure],
    ["$.spendControls.quotaReviewCadence", report?.spendControls?.quotaReviewCadence]
  ]) {
    if (!isOperatorPacketText(value)) {
      issues.push(`${path}: expected real non-placeholder non-secret procedure text.`);
    }
  }

  if (report?.spendControls?.requiresClientPolicy !== true) {
    issues.push("$.spendControls.requiresClientPolicy: expected true before commercial customer traffic.");
  }
  return issues;
}

function validateProductionOperationsAttestationPacketSemantics(report) {
  const issues = [];
  const serialized = JSON.stringify(report ?? {});
  if (launchIntakePacketSecretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  })) {
    issues.push("$: expected non-secret production-operations attestation without API keys, bearer tokens, signed URL query values, or raw credentials.");
  }

  for (const [path, value] of [
    ["$.storage.restoreRunbookUrl", report?.storage?.restoreRunbookUrl],
    ["$.observability.dashboardUrl", report?.observability?.dashboardUrl],
    ["$.incidentResponse.runbookUrl", report?.incidentResponse?.runbookUrl],
    ["$.supportWorkflow.supportRunbookUrl", report?.supportWorkflow?.supportRunbookUrl],
    ["$.dataProtection.dataRetentionPolicyUrl", report?.dataProtection?.dataRetentionPolicyUrl]
  ]) {
    if (!isLaunchIntakePacketCleanHttpsUrl(value)) {
      issues.push(`${path}: expected a clean non-localhost HTTPS URL without credentials, query string, or fragment.`);
    }
  }

  for (const [path, value] of [
    ["$.approvedBy", report?.approvedBy],
    ["$.operationsOwner", report?.operationsOwner],
    ["$.supportContact", report?.supportContact],
    ["$.securityContact", report?.securityContact],
    ["$.incidentEscalationContact", report?.incidentEscalationContact],
    ["$.storage.backupCadence", report?.storage?.backupCadence],
    ["$.observability.provider", report?.observability?.provider],
    ["$.observability.onCallSchedule", report?.observability?.onCallSchedule],
    ["$.observability.requestIdSearchProcedure", report?.observability?.requestIdSearchProcedure],
    ["$.incidentResponse.severityPolicy", report?.incidentResponse?.severityPolicy],
    ["$.incidentResponse.rollbackProcedure", report?.incidentResponse?.rollbackProcedure],
    ["$.incidentResponse.postIncidentReviewProcedure", report?.incidentResponse?.postIncidentReviewProcedure],
    ["$.supportWorkflow.responseSlo", report?.supportWorkflow?.responseSlo],
    ["$.supportWorkflow.customerEscalationProcedure", report?.supportWorkflow?.customerEscalationProcedure],
    ["$.dataProtection.secretRotationProcedure", report?.dataProtection?.secretRotationProcedure],
    ["$.dataProtection.customerArtifactDeletionProcedure", report?.dataProtection?.customerArtifactDeletionProcedure]
  ]) {
    if (!isOperatorPacketText(value)) {
      issues.push(`${path}: expected real non-placeholder non-secret operations text.`);
    }
  }

  if (report?.storage?.durableStorage !== true) {
    issues.push("$.storage.durableStorage: expected true before commercial production operations evidence.");
  }
  if (report?.storage?.backupEnabled !== true) {
    issues.push("$.storage.backupEnabled: expected true before commercial production operations evidence.");
  }
  if (Number(report?.storage?.artifactRetentionDays ?? 0) < 30) {
    issues.push("$.storage.artifactRetentionDays: expected at least 30 days.");
  }
  if (report?.observability?.alertingEnabled !== true) {
    issues.push("$.observability.alertingEnabled: expected true before commercial production operations evidence.");
  }
  if (report?.dataProtection?.logRedactionReviewPassed !== true) {
    issues.push("$.dataProtection.logRedactionReviewPassed: expected true before commercial production operations evidence.");
  }
  return issues;
}

function isOperatorPacketText(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !launchIntakePacketPlaceholderPattern.test(value) &&
    !launchIntakePacketSecretPatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(value);
    }) &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validateCommercialLaunchIntakeSemantics(report) {
  const issues = [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const hasFailingChecks = checks.some((check) => check?.status === "fail");
  if (report?.status === "pass" && hasFailingChecks) {
    issues.push("$.status: pass is not allowed while any launch-intake check is fail.");
  }
  if (report?.status === "pass" && report?.intakeSummary?.commercialOfferScopeConfigured !== true) {
    issues.push("$.intakeSummary.commercialOfferScopeConfigured: expected true when launch intake passes.");
  }
  if (report?.status === "missing_intake") {
    if (report?.intakeSummary?.present !== false) {
      issues.push("$.intakeSummary.present: expected false when launch intake is missing.");
    }
    if (report?.intakeSummary?.commercialOfferScopeConfigured !== false) {
      issues.push("$.intakeSummary.commercialOfferScopeConfigured: expected false when launch intake is missing.");
    }
  }
  if (report?.intakeSummary?.commercialOfferProductSurface === "api_cli_only" && report?.intakeSummary?.uiRequiredBeforeCustomerTraffic !== false) {
    issues.push("$.intakeSummary.uiRequiredBeforeCustomerTraffic: expected false for API/CLI-only commercial scope.");
  }
  if (report?.intakeSummary?.commercialOfferProductSurface === "first_party_web_ui_required" && report?.intakeSummary?.uiRequiredBeforeCustomerTraffic !== true) {
    issues.push("$.intakeSummary.uiRequiredBeforeCustomerTraffic: expected true for full first-party commercial Web UI required scope.");
  }
  if (report?.releaseGateSummary?.canRunPaidAtlasValidation !== false) {
    issues.push("$.releaseGateSummary.canRunPaidAtlasValidation: launch intake must not authorize paid Atlas execution by itself.");
  }
  if (report?.releaseGateSummary?.canReleaseToCustomerTraffic !== false) {
    issues.push("$.releaseGateSummary.canReleaseToCustomerTraffic: launch intake must not authorize customer traffic by itself.");
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
