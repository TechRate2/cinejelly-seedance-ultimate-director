import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
  markdownOutputPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-checklist.md",
  backendReadinessPath: "assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  businessPlanPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  liveInputsPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json",
  launchIntakePath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
  atlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  providerLiveActionsPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json",
  providerGraphResumePath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json",
  shortReviewOperationPath: "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json",
  shortProductRightsPath: "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    writeMarkdown: true
  };
  const flagMap = new Map([
    ["--output", "outputPath"],
    ["--markdown-output", "markdownOutputPath"],
    ["--backend-readiness-report", "backendReadinessPath"],
    ["--business-readiness-report", "businessReadinessPath"],
    ["--business-plan-report", "businessPlanPath"],
    ["--live-inputs-report", "liveInputsPath"],
    ["--launch-intake-report", "launchIntakePath"],
    ["--atlas-billing-report", "atlasBillingPath"],
    ["--ops-config-report", "opsConfigPath"],
    ["--provider-live-actions-report", "providerLiveActionsPath"],
    ["--provider-graph-resume-report", "providerGraphResumePath"],
    ["--short-review-operation-report", "shortReviewOperationPath"],
    ["--short-product-rights-report", "shortProductRightsPath"]
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
  console.log(`Prepare a no-spend commercial launch input checklist from current readiness reports.

Usage:
  npm.cmd run validation:commercial-inputs

Options:
  --backend-readiness-report <path>   Default: ${defaults.backendReadinessPath}
  --business-readiness-report <path>  Default: ${defaults.businessReadinessPath}
  --business-plan-report <path>       Default: ${defaults.businessPlanPath}
  --live-inputs-report <path>         Default: ${defaults.liveInputsPath}
  --launch-intake-report <path>       Default: ${defaults.launchIntakePath}
  --atlas-billing-report <path>       Default: ${defaults.atlasBillingPath}
  --ops-config-report <path>          Default: ${defaults.opsConfigPath}
  --provider-live-actions-report <path>
                                      Default: ${defaults.providerLiveActionsPath}
  --provider-graph-resume-report <path>
                                      Default: ${defaults.providerGraphResumePath}
  --short-review-operation-report <path>
                                      Default: ${defaults.shortReviewOperationPath}
  --short-product-rights-report <path>
                                      Default: ${defaults.shortProductRightsPath}
  --output <path>                     JSON report path. Default: ${defaults.outputPath}
  --markdown-output <path>            Markdown checklist path. Default: ${defaults.markdownOutputPath}
  --no-markdown                       Do not write the Markdown checklist.
  --no-output                         Print only; do not write the JSON report.

This command reads local reports only. It does not call Atlas, deployment endpoints, stock providers, source URLs, FFmpeg, render routes, or billing providers.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const reports = {
    backendReadiness: summarizeReport(options.backendReadinessPath),
    businessReadiness: summarizeReport(options.businessReadinessPath),
    businessPlan: summarizeReport(options.businessPlanPath),
    liveInputs: summarizeReport(options.liveInputsPath),
    launchIntake: summarizeReport(options.launchIntakePath),
    atlasBilling: summarizeReport(options.atlasBillingPath),
    opsConfig: summarizeReport(options.opsConfigPath),
    providerLiveActions: summarizeReport(options.providerLiveActionsPath),
    providerGraphResume: summarizeReport(options.providerGraphResumePath),
    shortReviewOperation: summarizeReport(options.shortReviewOperationPath),
    shortProductRights: summarizeReport(options.shortProductRightsPath)
  };
  const requiredInputs = buildRequiredInputs(reports);
  const envPlaceholders = buildEnvPlaceholders(reports, requiredInputs);
  const atlasConfigurationSummary = buildAtlasConfigurationSummary(reports);
  const evidenceCommandPlan = buildEvidenceCommandPlan(
    reports.businessPlan.value,
    reports.liveInputs.value,
    reports.providerLiveActions.value,
    reports.providerGraphResume.value,
    reports.shortReviewOperation.value,
    reports.shortProductRights.value
  );
  const budgetConstrainedPaidPlan = buildBudgetConstrainedPaidPlan(reports.businessPlan.value);
  const backendReadinessPhasePlan = buildBackendReadinessPhasePlan(reports.backendReadiness.value);
  const commandPlanAudit = buildCommandPlanAudit({ requiredInputs, evidenceCommandPlan, budgetConstrainedPaidPlan });
  const status = statusFor(requiredInputs);
  const sourceReports = summarizeSourceReports(reports);
  const inputSummary = summarizeInputs(requiredInputs);
  const operatorHandoffManifest = buildOperatorHandoffManifest({
    status,
    sourceReports,
    inputSummary,
    requiredInputs,
    envPlaceholders,
    evidenceCommandPlan,
    budgetConstrainedPaidPlan,
    backendReadinessPhasePlan,
    commandPlanAudit
  });
  const report = {
    schemaVersion: "cinejelly.commercial-launch-inputs.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      backendReadinessPath: toRepoRelative(options.backendReadinessPath),
      businessReadinessPath: toRepoRelative(options.businessReadinessPath),
      businessPlanPath: toRepoRelative(options.businessPlanPath),
      liveInputsPath: toRepoRelative(options.liveInputsPath),
      launchIntakePath: toRepoRelative(options.launchIntakePath),
      atlasBillingPath: toRepoRelative(options.atlasBillingPath),
      opsConfigPath: toRepoRelative(options.opsConfigPath),
      providerLiveActionsPath: toRepoRelative(options.providerLiveActionsPath),
      providerGraphResumePath: toRepoRelative(options.providerGraphResumePath),
      shortReviewOperationPath: toRepoRelative(options.shortReviewOperationPath),
      shortProductRightsPath: toRepoRelative(options.shortProductRightsPath),
      markdownOutputPath: options.writeMarkdown ? toRepoRelative(options.markdownOutputPath) : undefined
    },
    sourceReports,
    inputSummary,
    requiredInputs,
    envPlaceholders,
    atlasConfigurationSummary,
    evidenceCommandPlan,
    budgetConstrainedPaidPlan,
    commandPlanAudit,
    operatorHandoffManifest,
    releaseGateSummary: buildReleaseGateSummary({ status, reports, requiredInputs }),
    nextActions: nextActionsFor(requiredInputs, reports.liveInputs.value)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  if (options.writeMarkdown) {
    writeText(options.markdownOutputPath, renderMarkdown(report));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "ready_for_live_evidence_sequence" ? 0 : 1;
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
    schemaVersion: read.schemaVersion,
    status: String(read.status ?? "unknown"),
    value: read
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

function buildRequiredInputs(reports) {
  const business = reports.businessReadiness.value;
  const plan = reports.businessPlan.value;
  const live = reports.liveInputs.value;
  const launchIntake = reports.launchIntake.value;
  const atlasBilling = reports.atlasBilling.value;
  const opsConfig = reports.opsConfig.value;
  const providerLiveActions = reports.providerLiveActions.value;
  const providerGraphResume = reports.providerGraphResume.value;
  const shortReviewOperation = reports.shortReviewOperation.value;
  const shortProductRights = reports.shortProductRights.value;
  const liveGate = gateFinder(live?.gates);
  const opsEnvironment = live?.environment?.operations;
  const deployment = live?.environment?.deployment;
  const sourceVideo = live?.environment?.sourceVideo;
  const remoteStock = live?.environment?.remoteStock;
  const atlasBillingSummary = live?.environment?.atlasBilling;
  const generatedAudioPaidReady = live?.releaseGateSummary?.canRunGeneratedAudioPaidValidation === true;
  const costPlan = plan?.costPlan ?? live?.costPlan ?? {};
  const approvedBudget = numberOrUndefined(costPlan.maxBudgetUsd ?? atlasBilling?.costPlan?.maxBudgetUsd);
  const plannedCost = numberOrUndefined(costPlan.knownPaidEstimateUsd ?? atlasBilling?.costPlan?.plannedCostUsd);
  const minimumLongFormBudget = numberOrUndefined(costPlan.longForm?.minimumBudgetUsdToRun ?? costPlan.longForm?.estimatedCostUsd);
  const atlasBudgetBlockerMessage = atlasBillingSummary?.message ?? failingMessage(business, "atlas_billing_readiness");
  const sourceVideoValidationStep = validationStep(plan, "source_video_auto_analysis_validation");

  return [
    input({
      id: "deployment_https_url",
      label: "Real HTTPS CineJelly deployment URL",
      category: "deployment",
      status: deployment?.valid === true ? "configured" : "missing",
      sensitivity: "public_url",
      requiredFor: ["deployment_preflight_archive", "billing_admin_quota_controls", "production_storage_observability_support"],
      envVars: ["CINEJELLY_DEPLOYMENT_BASE_URL"],
      filePaths: [],
      acceptance: "Use a non-localhost HTTPS URL with no embedded credentials, query string, or fragment.",
      validationCommand: "npm.cmd run validation:deployment-readiness -- --base-url https://<your-cinejelly-host>",
      blockerMessage: firstFailure(liveGate("deployment_readiness_inputs")) ?? failingMessage(business, "deployment_preflight_archive")
    }),
    input({
      id: "deployment_auth_token",
      label: "Deployment validation auth token",
      category: "deployment",
      status: deployment?.authTokenConfigured === true ? "configured" : "missing",
      sensitivity: "secret_env",
      requiredFor: ["deployment_preflight_archive", "billing_admin_quota_controls", "production_storage_observability_support"],
      envVars: ["CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN", "CINEJELLY_API_AUTH_TOKEN"],
      filePaths: [],
      acceptance: "Configure a deployment token for protected validation endpoints; do not paste the token into reports or docs.",
      validationCommand: "npm.cmd run validation:deployment-readiness -- --base-url https://<your-cinejelly-host>",
      blockerMessage: failureByName(liveGate("deployment_readiness_inputs"), "deployment_auth_token")
    }),
    input({
      id: "billing_admin_attestation",
      label: "Billing/admin/quota attestation",
      category: "operations",
      status: opsEnvironment?.billingAttestationPresent === true && opsConfig?.status === "pass" ? "configured" : "missing",
      sensitivity: "non_secret_operator_attestation",
      requiredFor: ["billing_admin_quota_controls"],
      envVars: [],
      filePaths: ["ops/billing-admin-attestation.json"],
      acceptance: "Fill billing provider, terms/privacy/refund URLs, account lifecycle, support, tax, and spend-control fields with real procedures.",
      validationCommand: "npm.cmd run validation:ops-config -- --write-drafts",
      blockerMessage: failingMessage(business, "billing_admin_quota_controls") ?? firstFailure(liveGate("operations_attestation_inputs"))
    }),
    input({
      id: "production_operations_attestation",
      label: "Production operations attestation",
      category: "operations",
      status: opsEnvironment?.productionAttestationPresent === true && opsConfig?.status === "pass" ? "configured" : "missing",
      sensitivity: "non_secret_operator_attestation",
      requiredFor: ["production_storage_observability_support"],
      envVars: [],
      filePaths: ["ops/production-operations-attestation.json"],
      acceptance: "Fill durable storage, retention, backups, restore test, monitoring, incident response, support, redaction, rotation, and data-retention fields.",
      validationCommand: "npm.cmd run validation:ops-config -- --write-drafts",
      blockerMessage: failingMessage(business, "production_storage_observability_support") ?? firstFailure(liveGate("operations_attestation_inputs"))
    }),
    input({
      id: "commercial_offer_scope_decision",
      label: "Commercial offer scope decision",
      category: "product_scope",
      status:
        reports.launchIntake.status === "pass" &&
        launchIntake?.intakeSummary?.commercialOfferScopeConfigured === true
          ? "configured"
          : "missing",
      sensitivity: "operator_decision",
      requiredFor: ["first_party_web_ui_scope_decision", "commercial_offer_positioning"],
      envVars: [],
      filePaths: ["ops/commercial-launch-intake.json"],
      acceptance:
        "Decide whether this launch is intentionally API/CLI/operator-report only, or whether the full first-party commercial Web UI is required before customer traffic. Record the decision in commercialOfferScope and rerun validation:launch-intake.",
      validationCommand: "npm.cmd run validation:launch-intake -- --write-draft",
      blockerMessage:
        launchIntake?.intakeSummary?.commercialOfferScopeConfigured === true
          ? undefined
          : "Commercial offer scope is not yet decided; the full first-party commercial Web UI remains a product-scope blocker for full product parity until the intake records API/CLI-only scope or UI-required scope."
    }),
    input({
      id: "live_provider_action_evidence",
      label: "Live provider action evidence packet",
      category: "operations",
      status: providerLiveActions?.status === "pass" ? "configured" : "missing",
      sensitivity: "manual_review",
      requiredFor: ["distributed_active_provider_work_resume"],
      envVars: [],
      filePaths: [
        "ops/render-provider-live-actions.json",
        "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json"
      ],
      acceptance: "After a real deployment worker executes provider handoff actions, archive the ignored evidence packet and validate it with explicit confirmation; it must include resume-polling plus terminal-closeout or manual-audit evidence with redaction review.",
      validationCommand: "npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions",
      blockerMessage: providerLiveActions?.releaseGateSummary?.releaseBlocker ?? "Live provider action evidence is missing, unconfirmed, or incomplete."
    }),
    input({
      id: "graph_resume_enqueue_evidence",
      label: "Graph-resume enqueue payload evidence",
      category: "operations",
      status: providerGraphResume?.status === "pass" ? "configured" : "missing",
      sensitivity: "manual_review",
      requiredFor: ["distributed_active_provider_work_resume"],
      envVars: [],
      filePaths: [
        "ops/render-provider-graph-resume-enqueues.json",
        "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json"
      ],
      acceptance: "After a real deployment worker enqueues graph resume, archive digest-only payload evidence bound to the passing live action report; do not store raw graph state, provider payloads, output URLs, local paths, or secrets.",
      validationCommand: "npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues",
      blockerMessage: providerGraphResume?.releaseGateSummary?.releaseBlocker ?? "Graph-resume enqueue payload evidence is missing, unconfirmed, unsafe, or not bound to usable live action graph-resume evidence."
    }),
    input({
      id: "short_review_operation_evidence",
      label: "Accepted Short create/review operation evidence",
      category: "manual_review",
      status: shortReviewOperation?.status === "pass" ? "configured" : "missing",
      sensitivity: "manual_review",
      requiredFor: ["short_paid_render_and_artifacts", "manual_short_media_redaction_review"],
      envVars: [],
      filePaths: [
        "ops/short-review-operation-evidence.json",
        "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json"
      ],
      acceptance: "After a real deployment reviewer accepts scene, audio, caption, and claim checkpoints, archive the ignored digest-only review operation packet and validate it with explicit confirmation.",
      validationCommand: "Step 1: npm.cmd run validation:short-review-operation-draft -- --force. Step 2: npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation",
      blockerMessage: shortReviewOperation?.releaseGateSummary?.releaseBlocker ?? "Accepted Short create/review operation evidence is missing, unconfirmed, unsafe, or incomplete."
    }),
    input({
      id: "short_product_rights_evidence",
      label: "Accepted Short product facts and media-rights evidence",
      category: "manual_review",
      status: shortProductRights?.status === "pass" ? "configured" : "missing",
      sensitivity: "manual_review",
      requiredFor: ["short_paid_render_and_artifacts", "manual_short_media_redaction_review"],
      envVars: [],
      filePaths: [
        "ops/short-product-rights-evidence.json",
        "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json"
      ],
      acceptance: "After live product extraction and product/legal review, archive accepted product facts, claim substantiation, media rights, commercial-use, attribution, redaction, and hash binding evidence with explicit confirmation.",
      validationCommand: "Step 1: npm.cmd run validation:short-product-rights-draft -- --force. Step 2: npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights",
      blockerMessage: shortProductRights?.releaseGateSummary?.releaseBlocker ?? "Accepted Short product-facts and media-rights evidence is missing, unconfirmed, unsafe, or incomplete."
    }),
    input({
      id: "atlas_validation_budget",
      label: "Approved Atlas validation budget",
      category: "budget",
      status: atlasBillingSummary?.canRunAtlasSpendWithinApprovedBudget === true ? "configured" : "blocked_by_budget",
      sensitivity: "budget_approval",
      requiredFor: [
        "atlas_billing_readiness",
        "long_form_paid_validation",
        ...(generatedAudioPaidReady ? [] : ["atlas_generated_audio_validation"])
      ],
      envVars: [],
      filePaths: [],
      acceptance: generatedAudioPaidReady
        ? `Approve at least ${formatUsd(plannedCost ?? minimumLongFormBudget ?? 0)} for the current full video/audio validation plan, or keep only the generated-audio slice in scope for the current paid run. This excludes usage-dependent source-video LLM cost.`
        : `Approve at least ${formatUsd(plannedCost ?? minimumLongFormBudget ?? 0)} for the current known video/audio validation plan, or intentionally re-plan a narrower validation slice. This excludes usage-dependent source-video LLM cost.`,
      validationCommand: `npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(plannedCost ?? approvedBudget ?? 5)} --confirm-live-network`,
      blockerMessage: atlasBudgetBlockerMessage,
      currentValue: approvedBudget === undefined ? undefined : formatUsd(approvedBudget),
      requiredValue: plannedCost === undefined ? undefined : formatUsd(plannedCost)
    }),
    input({
      id: "source_video_atlas_llm_budget",
      label: "Approved source-video Atlas LLM budget",
      category: "budget",
      status: sourceVideoValidationStep?.status === "ready" ? "configured" : "blocked_by_budget",
      sensitivity: "budget_approval",
      requiredFor: ["source_video_auto_analysis_validation"],
      envVars: [],
      filePaths: ["assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json"],
      acceptance: "Approve an explicit source-video LLM budget for the selected clean source video, then capture a slice-specific Atlas billing report whose plannedCostUsd matches that budget.",
      validationCommand:
        "npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-source-video-budget-usd> --planned-cost-usd <approved-source-video-budget-usd> --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network",
      blockerMessage:
        sourceVideoValidationStep?.requiredInputs?.find((item) => String(item).includes("source-video Atlas billing")) ??
        "Source-video paid validation requires a fresh atlas-billing-source-video-report.json matching --max-cost-usd before FFmpeg source fetch or Atlas LLM calls."
    }),
    input({
      id: "source_video_url",
      label: "Clean source video URL",
      category: "source_video",
      status: sourceVideo?.cleanHttpsUrlValid === true ? "configured" : "missing",
      sensitivity: "public_url",
      requiredFor: ["source_video_auto_analysis_validation"],
      envVars: ["CINEJELLY_VALIDATION_SOURCE_VIDEO_URL"],
      filePaths: [],
      acceptance: "Use a credential-free HTTPS MP4 URL with no query string, fragment, or embedded credentials.",
      validationCommand: "npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://<clean-source-video.mp4>",
      blockerMessage: failureByName(liveGate("source_video_auto_analysis_inputs"), "source_video_clean_https_url") ?? failingMessage(business, "source_video_auto_analysis_validation")
    }),
    input({
      id: "source_video_auto_analysis_enablement",
      label: "Source-video auto-analysis enablement",
      category: "source_video",
      status: sourceVideo?.autoAnalysisEnabled === true ? "configured" : "missing",
      sensitivity: "boolean_env",
      requiredFor: ["source_video_auto_analysis_validation"],
      envVars: ["CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS"],
      filePaths: [],
      acceptance: "Set to true only when the source video is approved for Atlas LLM analysis.",
      validationCommand: "npm.cmd run validation:source-video-auto-analysis -- --source-video-url https://<clean-source-video.mp4>",
      blockerMessage: failureByName(liveGate("source_video_auto_analysis_inputs"), "source_video_auto_analysis_enabled")
    }),
    input({
      id: "remote_stock_provider",
      label: "Remote stock provider key and commercial terms",
      category: "remote_stock",
      status: remoteStock?.enabled === true && Number(remoteStock?.configuredProviderCount ?? 0) > 0 ? "configured" : "missing",
      sensitivity: "secret_env",
      requiredFor: ["remote_stock_provider_validation"],
      envVars: ["CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS", "PEXELS_API_KEY", "PIXABAY_API_KEY", "COVERR_API_KEY", "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"],
      filePaths: [],
      acceptance: "Enable remote stock only when at least one approved provider key is configured and commercial terms have been reviewed.",
      validationCommand: "npm.cmd run validation:remote-stock -- --query \"modern workspace desk lamp\" --confirm-live-network --confirm-commercial-terms-reviewed",
      blockerMessage: firstFailure(liveGate("remote_stock_provider_inputs")) ?? failingMessage(business, "remote_stock_provider_validation")
    }),
    input({
      id: "long_form_paid_media_review",
      label: "Manual long-form media and redaction review",
      category: "manual_review",
      status: businessCheckPass(business, "long_form_paid_validation") ? "configured" : "pending_after_paid_run",
      sensitivity: "manual_review",
      requiredFor: ["long_form_paid_validation"],
      envVars: [],
      filePaths: ["assets/output_deliverables/business-readiness/long-form-validation-report.json", "ops/long-form-manual-quality-review.json"],
      acceptance: "After the paid 2-8 minute validation run, run validation:long-form-review-draft, inspect artifacts, media quality, cost ledger, review packet, and redaction evidence; bind the review JSON to the paid projectId, manifestSha256, and deliverableSha256.",
      validationCommand: "Step 1: npm.cmd run validation:long-form-review-draft -- --force. Step 2: npm.cmd run validation:long-form -- --duration-seconds 120 --max-cost-usd <approved-budget> --confirm-paid-spend --manual-quality-review ops/long-form-manual-quality-review.json --confirm-manual-quality-review",
      blockerMessage: failingMessage(business, "long_form_paid_validation")
    }),
    input({
      id: "generated_audio_paid_review",
      label: "Manual generated-audio schema and listening review",
      category: "manual_review",
      status: businessCheckPass(business, "atlas_generated_audio_validation") ? "configured" : "pending_after_paid_run",
      sensitivity: "manual_review",
      requiredFor: ["atlas_generated_audio_validation"],
      envVars: [],
      filePaths: [
        "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
        "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json",
        "ops/generated-audio-manual-review.json"
      ],
      acceptance: "After Atlas generated-audio execution, capture SHA-256/duration artifact evidence from the clean output URL, create the review draft, listen to the output, fill the structured review JSON, and approve schema review, output-batch validation, ledger evidence, artifact binding, and manual listening review.",
      validationCommand: "Step 1: npm.cmd run validation:generated-audio-artifact -- --confirm-live-network. Step 2: npm.cmd run validation:generated-audio-review-draft -- --force. Step 3: npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review",
      blockerMessage: failingMessage(business, "atlas_generated_audio_validation")
    })
  ];
}

function input(value) {
  return {
    id: value.id,
    label: value.label,
    category: value.category,
    status: value.status,
    sensitivity: value.sensitivity,
    requiredFor: value.requiredFor,
    envVars: value.envVars,
    filePaths: value.filePaths,
    acceptance: value.acceptance,
    validationCommand: value.validationCommand,
    ...(value.blockerMessage ? { blockerMessage: value.blockerMessage } : {}),
    ...(value.currentValue ? { currentValue: value.currentValue } : {}),
    ...(value.requiredValue ? { requiredValue: value.requiredValue } : {})
  };
}

function buildEnvPlaceholders(reports, requiredInputs) {
  const live = reports.liveInputs.value;
  const configured = {
    CINEJELLY_DEPLOYMENT_BASE_URL: live?.environment?.deployment?.configured === true,
    CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN: live?.environment?.deployment?.authTokenConfigured === true,
    CINEJELLY_VALIDATION_SOURCE_VIDEO_URL: live?.environment?.sourceVideo?.cleanHttpsUrlConfigured === true,
    CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS: live?.environment?.sourceVideo?.autoAnalysisEnabled === true,
    CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS: live?.environment?.remoteStock?.enabled === true,
    PEXELS_API_KEY: providerReady(live, "pexels"),
    PIXABAY_API_KEY: providerReady(live, "pixabay"),
    COVERR_API_KEY: providerKeyConfigured(live, "coverr"),
    CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED: live?.environment?.remoteStock?.commercialTermsReviewedForCoverr === true
  };
  const requiredVars = new Set(requiredInputs.flatMap((item) => item.envVars));
  return [
    placeholder("CINEJELLY_DEPLOYMENT_BASE_URL", "public_url", "https://<your-cinejelly-host>", "Real HTTPS deployment used by no-spend deployment captures."),
    placeholder("CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN", "secret", "<deployment-validation-token>", "Bearer/API token for protected validation endpoints."),
    placeholder("CINEJELLY_VALIDATION_SOURCE_VIDEO_URL", "public_url", "https://<clean-source-video.mp4>", "Approved source video for source-video auto-analysis validation."),
    placeholder("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS", "boolean", "true", "Enables source-video auto-analysis only after source approval."),
    placeholder("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS", "boolean", "true", "Enables live remote stock provider validation when in scope."),
    placeholder("PEXELS_API_KEY", "secret", "<pexels-key>", "Optional approved remote stock provider key."),
    placeholder("PIXABAY_API_KEY", "secret", "<pixabay-key>", "Optional approved remote stock provider key."),
    placeholder("COVERR_API_KEY", "secret", "<coverr-key>", "Optional approved Coverr provider key."),
    placeholder("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED", "boolean", "true", "Required before Coverr is considered commercially approved.")
  ].map((item) => {
    const providerChoice = ["PEXELS_API_KEY", "PIXABAY_API_KEY", "COVERR_API_KEY", "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"].includes(item.name);
    return {
      ...item,
      required: requiredVars.has(item.name) && !providerChoice,
      configured: configured[item.name] === true
    };
  });
}

function placeholder(name, sensitivity, exampleValue, purpose) {
  return { name, sensitivity, exampleValue, purpose };
}

function buildAtlasConfigurationSummary(reports) {
  const live = reports.liveInputs.value;
  const atlas = live?.environment?.atlas ?? {};
  const generatedAudio = live?.environment?.generatedAudio ?? {};
  const atlasBilling = live?.environment?.atlasBilling ?? {};
  const generatedAudioBilling = live?.environment?.atlasBillingSlices?.generatedAudio ?? {};
  const seedanceVideoReady =
    atlas.mediaApiKeyConfigured === true &&
    atlas.seedanceStandardModelConfigured === true &&
    atlas.seedanceFastModelConfigured === true &&
    atlas.seedanceCapabilitiesJsonValid === true &&
    Number(atlas.seedanceCapabilityCount ?? 0) > 0;
  const generatedAudioReady =
    generatedAudio.atlasMediaReady === true &&
    generatedAudio.modelConfigured === true &&
    generatedAudio.voiceIdConfigured === true &&
    generatedAudio.costRateConfigured === true &&
    generatedAudio.capabilitiesJsonValid === true &&
    Number(generatedAudio.capabilityCount ?? 0) > 0 &&
    generatedAudioBilling.canUseAsPrePaidAtlasBillingEvidence === true &&
    generatedAudioBilling.canRunAtlasSpendWithinApprovedBudget === true;
  const llmReady = atlas.llmFallbackAvailable === true && atlas.llmModelConfigured === true;
  const mediaReady = atlas.mediaApiKeyConfigured === true;
  return {
    source: live ? "live_readiness_inputs" : "missing_live_inputs_report",
    docsAlignment: {
      apiKeyModel: "Atlas docs use an Authorization bearer API key; CineJelly reports only configured booleans and never writes key values.",
      llmBaseUrl: "https://api.atlascloud.ai/v1",
      mediaBaseUrl: "https://api.atlascloud.ai/api/v1",
      billingBaseUrl: "https://api.atlascloud.ai/public/v1"
    },
    keys: {
      mediaApiKeyConfigured: atlas.mediaApiKeyConfigured === true,
      llmApiKeyConfigured: atlas.llmApiKeyConfigured === true,
      llmFallbackAvailable: atlas.llmFallbackAvailable === true,
      billingReportPresent: atlasBilling.present === true,
      billingReportNetworkCaptured: atlasBilling.networkCallsMade === true,
      generatedAudioBillingReportPresent: generatedAudioBilling.present === true,
      generatedAudioBillingApproved: generatedAudioBilling.canRunAtlasSpendWithinApprovedBudget === true
    },
    endpoints: {
      llmBaseUrlConfigured: atlas.llmBaseUrlConfigured === true,
      mediaBaseUrlConfigured: atlas.mediaBaseUrlConfigured === true
    },
    models: {
      llmModelConfigured: atlas.llmModelConfigured === true,
      seedanceStandardModelConfigured: atlas.seedanceStandardModelConfigured === true,
      seedanceFastModelConfigured: atlas.seedanceFastModelConfigured === true,
      seedanceCapabilitiesJsonValid: atlas.seedanceCapabilitiesJsonValid === true,
      seedanceCapabilityCount: Number(atlas.seedanceCapabilityCount ?? 0),
      generatedAudioModelConfigured: generatedAudio.modelConfigured === true,
      generatedAudioVoiceConfigured: generatedAudio.voiceIdConfigured === true,
      generatedAudioCapabilitiesJsonValid: generatedAudio.capabilitiesJsonValid === true,
      generatedAudioCapabilityCount: Number(generatedAudio.capabilityCount ?? 0)
    },
    readiness: {
      mediaReady,
      llmReady,
      seedanceVideoReady,
      generatedAudioReady,
      generatedAudioPaidSliceReady: live?.releaseGateSummary?.canRunGeneratedAudioPaidValidation === true,
      fullPaidSequenceWithinBudget: live?.costPlan?.budgetFit === "within_budget"
    },
    operatorMessage:
      mediaReady && llmReady
        ? "Atlas key/model configuration is present; remaining commercial blockers are deployment, operator attestations, live evidence, and budget gates."
        : "Atlas key/model configuration is incomplete; fill Atlas env first, then rerun validation:live-inputs and validation:commercial-inputs."
  };
}

function buildEvidenceCommandPlan(plan, live, providerLiveActions, providerGraphResume, shortReviewOperation, shortProductRights) {
  const sequence = Array.isArray(plan?.validationSequence) ? plan.validationSequence : [];
  return {
    noSpendLocal: commandsFor(sequence, (step) => step.kind === "no_spend"),
    noSpendNetwork: commandsFor(sequence, (step) => step.kind === "no_spend_network"),
    liveNetwork: commandsFor(sequence, (step) => step.kind === "live_network"),
    paidAtlas: applyLivePaidGateOverrides(
      commandsFor(sequence, (step) => typeof step.kind === "string" && step.kind.startsWith("paid_")),
      live
    ),
    finalAudit: [
      {
        name: "live_provider_action_evidence",
        status: providerLiveActions?.status === "pass" ? "ready" : "blocked",
        command: "npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions"
      },
      {
        name: "graph_resume_enqueue_evidence",
        status: providerGraphResume?.status === "pass" ? "ready" : "blocked",
        command: "npm.cmd run validation:provider-graph-resume -- --evidence ops/render-provider-graph-resume-enqueues.json --confirm-graph-resume-enqueues"
      },
      {
        name: "short_review_operation_evidence",
        status: shortReviewOperation?.status === "pass" ? "ready" : "blocked",
        command: "npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation"
      },
      {
        name: "short_product_rights_evidence",
        status: shortProductRights?.status === "pass" ? "ready" : "blocked",
        command: "npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights"
      },
      {
        name: "final_business_readiness_audit",
        status: "blocked",
        command: "npm.cmd run validation:business-readiness"
      },
      {
        name: "report_contract_validation",
        status: "ready",
        command: "npm.cmd run validation:report-contracts"
      }
    ]
  };
}

function applyLivePaidGateOverrides(commands, live) {
  if (live?.releaseGateSummary?.canRunGeneratedAudioPaidValidation !== true) {
    return commands;
  }
  return commands.map((command) => {
    if (command.name !== "generated_audio_validation") {
      return command;
    }
    return {
      ...command,
      status: "ready",
      requiredInputs: []
    };
  });
}

function validationStep(plan, name) {
  const sequence = Array.isArray(plan?.validationSequence) ? plan.validationSequence : [];
  return sequence.find((step) => step?.name === name);
}

function buildBudgetConstrainedPaidPlan(plan) {
  const source = plan?.costPlan?.budgetConstrainedSlices;
  const slices = Array.isArray(source?.slices) ? source.slices : [];
  const normalizedSlices = slices.map((slice) => ({
    name: String(slice.name ?? "unknown"),
    kind: String(slice.kind ?? "unknown"),
    status: String(slice.status ?? "unknown"),
    ...(numberOrUndefined(slice.maxBudgetUsd) !== undefined ? { maxBudgetUsd: numberOrUndefined(slice.maxBudgetUsd) } : {}),
    ...(numberOrUndefined(slice.estimatedCostUsd) !== undefined ? { estimatedCostUsd: numberOrUndefined(slice.estimatedCostUsd) } : {}),
    ...(typeof slice.billingReadinessCommand === "string" ? { billingReadinessCommand: slice.billingReadinessCommand } : {}),
    command: String(slice.command ?? ""),
    prerequisites: Array.isArray(slice.prerequisites) ? slice.prerequisites.map(String) : [],
    limitations: Array.isArray(slice.limitations) ? slice.limitations.map(String) : []
  }));
  const withinBudget = normalizedSlices.filter((slice) => slice.status === "within_budget");
  const blocked = normalizedSlices.filter((slice) => slice.status !== "within_budget");
  return {
    present: Boolean(source),
    ...(numberOrUndefined(source?.maxBudgetUsd ?? plan?.costPlan?.maxBudgetUsd) !== undefined
      ? { maxBudgetUsd: numberOrUndefined(source?.maxBudgetUsd ?? plan?.costPlan?.maxBudgetUsd) }
      : {}),
    ...(numberOrUndefined(source?.knownPaidEstimateUsd ?? plan?.costPlan?.knownPaidEstimateUsd) !== undefined
      ? { knownPaidEstimateUsd: numberOrUndefined(source?.knownPaidEstimateUsd ?? plan?.costPlan?.knownPaidEstimateUsd) }
      : {}),
    fullKnownPaidSequenceWithinBudget: source?.fullKnownPaidSequenceWithinBudget === true,
    recommendedSliceName: typeof source?.recommendedSliceName === "string" ? source.recommendedSliceName : withinBudget[0]?.name,
    withinBudgetCount: withinBudget.length,
    blockedOrUnknownCount: blocked.length,
    slices: normalizedSlices
  };
}

function buildBackendReadinessPhasePlan(backendReadiness) {
  const source = backendReadiness?.externalEvidencePhasePlan;
  const phases = Array.isArray(source?.phases)
    ? source.phases.map((phase) => ({
        phase: Number(phase.phase ?? 0),
        label: String(phase.label ?? "Unknown phase"),
        status: String(phase.status ?? "unknown"),
        blockerCount: Number(phase.blockerCount ?? 0),
        requiredEvidenceKinds: arrayOfStrings(phase.requiredEvidenceKinds),
        actionIds: arrayOfStrings(phase.actionIds),
        validationCommands: arrayOfStrings(phase.validationCommands),
        reportPaths: arrayOfStrings(phase.reportPaths),
        requiresOperatorInput: phase.requiresOperatorInput === true,
        requiresPaidProviderOrNetwork: phase.requiresPaidProviderOrNetwork === true,
        requiresManualReview: phase.requiresManualReview === true,
        readyWhen: String(phase.readyWhen ?? "Complete the listed evidence for this phase.")
      }))
    : [];
  return {
    source: source ? "backend_system_readiness_audit" : "missing_backend_system_readiness_audit",
    status: String(source?.status ?? "missing"),
    phasePolicy: String(source?.phasePolicy ?? "unavailable"),
    phaseCount: phases.length,
    blockerCount: phases.reduce((sum, phase) => sum + phase.blockerCount, 0),
    phases
  };
}

function commandsFor(sequence, predicate) {
  return sequence
    .filter(predicate)
    .map((step) => ({
      name: String(step.name ?? "unknown"),
      status: String(step.status ?? "unknown"),
      kind: String(step.kind ?? "unknown"),
      command: String(step.command ?? ""),
      requiredInputs: Array.isArray(step.requiredInputs) ? step.requiredInputs.map(String) : []
    }));
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function buildCommandPlanAudit({ requiredInputs, evidenceCommandPlan, budgetConstrainedPaidPlan }) {
  const scripts = packageScriptSet();
  const commandItems = [
    ...commandItemsFromRequiredInputs(requiredInputs),
    ...commandItemsFromEvidencePlan(evidenceCommandPlan),
    ...commandItemsFromBudgetPlan(budgetConstrainedPaidPlan)
  ];
  const issues = commandItems.flatMap((item) => auditCommandItem(item, scripts));
  const status = issues.some((issue) => issue.severity === "fail")
    ? "fail"
    : issues.some((issue) => issue.severity === "warn")
      ? "warn"
      : "pass";
  return {
    status,
    checkedCommandCount: commandItems.length,
    npmScriptCount: scripts.size,
    issues
  };
}

function buildOperatorHandoffManifest({
  status,
  sourceReports,
  inputSummary,
  requiredInputs,
  envPlaceholders,
  evidenceCommandPlan,
  budgetConstrainedPaidPlan,
  backendReadinessPhasePlan,
  commandPlanAudit
}) {
  const operatorInputFiles = buildOperatorInputFiles(requiredInputs);
  const draftFiles = buildDraftFiles(requiredInputs);
  const reportArchiveFiles = buildReportArchiveFiles(sourceReports, requiredInputs);
  const commandRunbook = buildCommandRunbook(evidenceCommandPlan, budgetConstrainedPaidPlan);
  const inputValidationRunbook = buildInputValidationRunbook(requiredInputs);
  const readyCommandCount = commandRunbook.filter((item) => isRunnableStatus(item.status)).length;
  const paidCommands = commandRunbook.filter((item) => item.requiresProviderSpend);
  const manualReviewInputCommands = inputValidationRunbook.filter((item) => item.requiresManualReview);
  return {
    purpose:
      "Secret-free operator handoff manifest for the remaining commercial launch evidence sequence.",
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    safety: {
      shareableWithOperators: true,
      secretValuesIncluded: false,
      rawProviderPayloadsIncluded: false,
      localAbsolutePathsIncluded: false,
      customerMediaIncluded: false,
      releaseEvidence: false,
      operatorInstruction:
        "Use this manifest to locate draft files, ignored operator input files, report archives, and guarded commands; keep raw secrets only in environment variables or ignored ops files."
    },
    summary: {
      requiredInputCount: inputSummary.total,
      configuredInputCount: inputSummary.configured,
      missingOrBlockedInputCount: inputSummary.missing + inputSummary.blockedByBudget,
      pendingAfterPaidRunCount: inputSummary.pendingAfterPaidRun,
      operatorInputFileCount: operatorInputFiles.length,
      draftFileCount: draftFiles.length,
      reportArchiveFileCount: reportArchiveFiles.length,
      commandCount: commandRunbook.length,
      readyCommandCount,
      blockedCommandCount: commandRunbook.length - readyCommandCount,
      paidCommandCount: paidCommands.length,
      readyPaidCommandCount: paidCommands.filter((item) => isRunnableStatus(item.status)).length,
      inputValidationCommandCount: inputValidationRunbook.length,
      manualReviewInputValidationCommandCount: manualReviewInputCommands.length,
      commandPlanAuditStatus: String(commandPlanAudit?.status ?? "unknown"),
      backendReadinessPhaseStatus: backendReadinessPhasePlan.status,
      backendReadinessPhaseCount: backendReadinessPhasePlan.phaseCount,
      backendReadinessPhaseBlockerCount: backendReadinessPhasePlan.blockerCount,
      secretEnvPlaceholderCount: envPlaceholders.filter((item) => item.sensitivity === "secret").length
    },
    blockedInputIds: requiredInputs
      .filter((item) => item.status === "missing" || item.status === "blocked_by_budget")
      .map((item) => item.id),
    operatorInputFiles,
    draftFiles,
    reportArchiveFiles,
    envPlaceholders: envPlaceholders.map((item) => ({
      name: item.name,
      sensitivity: item.sensitivity,
      required: item.required,
      configured: item.configured,
      purpose: item.purpose
    })),
    externalEvidencePhasePlan: backendReadinessPhasePlan,
    commandRunbook,
    inputValidationRunbook,
    refreshCommands: [
      "npm.cmd run validation:live-inputs",
      "npm.cmd run validation:business-plan",
      "npm.cmd run validation:commercial-inputs",
      "npm.cmd run validation:completion-audit",
      "npm.cmd run validation:report-contracts"
    ]
  };
}

function buildOperatorInputFiles(requiredInputs) {
  const byPath = new Map();
  for (const item of requiredInputs) {
    for (const path of item.filePaths.filter((filePath) => filePath.startsWith("ops/"))) {
      const existing = byPath.get(path);
      const sourceInputIds = [...(existing?.sourceInputIds ?? []), item.id];
      byPath.set(path, {
        path,
        sourceInputIds,
        purpose: existing?.purpose ?? item.label,
        status: combineStatuses(existing?.status, item.status),
        sensitivity: strongestSensitivity(existing?.sensitivity, item.sensitivity),
        validationCommand: existing?.validationCommand ?? item.validationCommand,
        present: existsSync(resolve(repoRoot, path)),
        evidenceRole: "ignored_operator_input"
      });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function buildDraftFiles(requiredInputs) {
  const items = [];
  for (const input of requiredInputs) {
    const drafts = draftFilesForInput(input.id);
    for (const draft of drafts) {
      items.push({
        sourceInputId: input.id,
        path: draft.path,
        kind: draft.kind,
        present: existsSync(resolve(repoRoot, draft.path)),
        copyTo: draft.copyTo,
        evidenceRole: "draft_only_not_release_evidence"
      });
    }
  }
  return items.sort((left, right) => left.path.localeCompare(right.path));
}

function draftFilesForInput(inputId) {
  const operatorDraftRoot = "assets/output_deliverables/business-readiness/operator-drafts";
  const drafts = {
    billing_admin_attestation: [
      {
        path: `${operatorDraftRoot}/billing-admin-attestation.draft.json`,
        kind: "json_draft",
        copyTo: "ops/billing-admin-attestation.json"
      },
      {
        path: `${operatorDraftRoot}/operator-attestation-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/billing-admin-attestation.json"
      }
    ],
    production_operations_attestation: [
      {
        path: `${operatorDraftRoot}/production-operations-attestation.draft.json`,
        kind: "json_draft",
        copyTo: "ops/production-operations-attestation.json"
      },
      {
        path: `${operatorDraftRoot}/operator-attestation-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/production-operations-attestation.json"
      }
    ],
    commercial_offer_scope_decision: [
      {
        path: `${operatorDraftRoot}/commercial-launch-intake.draft.json`,
        kind: "json_draft",
        copyTo: "ops/commercial-launch-intake.json"
      },
      {
        path: `${operatorDraftRoot}/commercial-launch-intake-fillout.md`,
        kind: "markdown_checklist",
        copyTo: "ops/commercial-launch-intake.json"
      }
    ],
    live_provider_action_evidence: [
      {
        path: `${operatorDraftRoot}/render-provider-live-actions.template.json`,
        kind: "json_template",
        copyTo: "ops/render-provider-live-actions.json"
      },
      {
        path: `${operatorDraftRoot}/render-provider-live-actions-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/render-provider-live-actions.json"
      }
    ],
    graph_resume_enqueue_evidence: [
      {
        path: `${operatorDraftRoot}/render-provider-graph-resume-enqueues.template.json`,
        kind: "json_template",
        copyTo: "ops/render-provider-graph-resume-enqueues.json"
      },
      {
        path: `${operatorDraftRoot}/render-provider-graph-resume-enqueues-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/render-provider-graph-resume-enqueues.json"
      }
    ],
    short_review_operation_evidence: [
      {
        path: `${operatorDraftRoot}/short-review-operation-evidence.template.json`,
        kind: "json_template",
        copyTo: "ops/short-review-operation-evidence.json"
      },
      {
        path: `${operatorDraftRoot}/short-review-operation-evidence-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/short-review-operation-evidence.json"
      }
    ],
    short_product_rights_evidence: [
      {
        path: `${operatorDraftRoot}/short-product-rights-evidence.template.json`,
        kind: "json_template",
        copyTo: "ops/short-product-rights-evidence.json"
      },
      {
        path: `${operatorDraftRoot}/short-product-rights-evidence-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/short-product-rights-evidence.json"
      }
    ],
    long_form_paid_media_review: [
      {
        path: `${operatorDraftRoot}/long-form-manual-quality-review.template.json`,
        kind: "json_template",
        copyTo: "ops/long-form-manual-quality-review.json"
      },
      {
        path: `${operatorDraftRoot}/long-form-manual-quality-review-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/long-form-manual-quality-review.json"
      }
    ],
    generated_audio_paid_review: [
      {
        path: `${operatorDraftRoot}/generated-audio-manual-review.template.json`,
        kind: "json_template",
        copyTo: "ops/generated-audio-manual-review.json"
      },
      {
        path: `${operatorDraftRoot}/generated-audio-manual-review-fillout-checklist.md`,
        kind: "markdown_checklist",
        copyTo: "ops/generated-audio-manual-review.json"
      }
    ]
  };
  return drafts[inputId] ?? [];
}

function buildReportArchiveFiles(sourceReports, requiredInputs) {
  const byPath = new Map();
  for (const [name, report] of Object.entries(sourceReports ?? {})) {
    if (typeof report?.path !== "string" || !report.path) {
      continue;
    }
    byPath.set(report.path, {
      path: report.path,
      source: name,
      status: String(report.status ?? "unknown"),
      present: report.present === true,
      evidenceRole: "source_report"
    });
  }
  for (const input of requiredInputs) {
    for (const path of input.filePaths.filter((filePath) => filePath.startsWith("assets/output_deliverables/"))) {
      const existing = byPath.get(path);
      byPath.set(path, {
        path,
        source: existing?.source ?? input.id,
        status: existing?.status ?? input.status,
        present: existsSync(resolve(repoRoot, path)),
        evidenceRole: existing?.evidenceRole ?? "required_evidence_report"
      });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function buildCommandRunbook(evidenceCommandPlan, budgetConstrainedPaidPlan) {
  const evidenceCommands = Object.entries(evidenceCommandPlan ?? {}).flatMap(([section, commands]) =>
    Array.isArray(commands)
      ? commands.map((item, index) => commandRunbookItem({
          section,
          index,
          name: item.name,
          kind: item.kind ?? section,
          status: item.status,
          command: item.command,
          source: `evidenceCommandPlan.${section}`
        }))
      : []
  );
  const budgetCommands = Array.isArray(budgetConstrainedPaidPlan?.slices)
    ? budgetConstrainedPaidPlan.slices.flatMap((slice, index) => {
        const items = [];
        if (typeof slice.billingReadinessCommand === "string") {
          items.push(commandRunbookItem({
            section: "paidBudgetSlice",
            index: index * 2,
            name: `${slice.name}_billing`,
            kind: "atlas_billing_readiness",
            status: slice.status,
            command: slice.billingReadinessCommand,
            source: `budgetConstrainedPaidPlan.slices.${slice.name}.billingReadinessCommand`
          }));
        }
        items.push(commandRunbookItem({
          section: "paidBudgetSlice",
          index: index * 2 + 1,
          name: slice.name,
          kind: slice.kind,
          status: slice.status,
          command: slice.command,
          source: `budgetConstrainedPaidPlan.slices.${slice.name}.command`
        }));
        return items;
      })
    : [];
  return [...evidenceCommands, ...budgetCommands];
}

function buildInputValidationRunbook(requiredInputs) {
  return Array.isArray(requiredInputs)
    ? requiredInputs.flatMap((inputItem, inputIndex) =>
        validationCommandSteps(inputItem.validationCommand).map((step) =>
          commandRunbookItem({
            section: "requiredInput",
            index: inputIndex * 10 + step.stepIndex,
            name: step.stepCount > 1 ? `${inputItem.id}_step_${step.stepIndex}` : inputItem.id,
            kind: inputCommandKind(inputItem, step.command),
            status: commandStatusForInput(inputItem.status),
            command: step.command,
            source: `requiredInputs.${inputItem.id}.validationCommand`,
            sourceInputId: inputItem.id,
            stepIndex: step.stepIndex,
            stepCount: step.stepCount
          })
        )
      )
    : [];
}

function commandRunbookItem({ section, index, name, kind, status, command, source, sourceInputId, stepIndex, stepCount }) {
  const normalizedCommand = String(command ?? "");
  const normalizedKind = String(kind ?? "unknown");
  const normalizedStatus = String(status ?? "unknown");
  return {
    section,
    index,
    name: String(name ?? "unknown"),
    kind: normalizedKind,
    status: normalizedStatus,
    command: normalizedCommand,
    source,
    ...(sourceInputId ? { sourceInputId } : {}),
    ...(Number.isInteger(stepIndex) ? { stepIndex } : {}),
    ...(Number.isInteger(stepCount) ? { stepCount } : {}),
    runnable: isRunnableStatus(normalizedStatus),
    requiresLiveNetwork: section === "liveNetwork" || normalizedCommand.includes("--confirm-live-network"),
    requiresProviderSpend:
      normalizedKind.startsWith("paid_") ||
      normalizedCommand.includes("--confirm-paid-spend") ||
      normalizedCommand.includes("--confirm-provider-spend"),
    requiresOperatorConfirmation: normalizedCommand.includes("--confirm-"),
    requiresManualReview:
      normalizedCommand.includes("manual-review") ||
      normalizedCommand.includes("manual-audio-review") ||
      normalizedCommand.includes("manual-quality-review"),
    containsPlaceholder: normalizedCommand.includes("<")
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

function inputCommandKind(inputItem, command) {
  const scriptName = extractNpmScriptName(String(command ?? ""));
  if (scriptName === "validation:long-form") {
    return "paid_atlas_video";
  }
  if (scriptName === "validation:generated-audio" && !String(command ?? "").includes("--review-existing-report")) {
    return "paid_atlas_audio";
  }
  if (scriptName === "validation:source-video-auto-analysis" && String(command ?? "").includes("--confirm-provider-spend")) {
    return "paid_atlas_llm_and_source_fetch";
  }
  return String(inputItem?.category ?? "operator_input");
}

function commandStatusForInput(status) {
  return String(status ?? "unknown");
}

function combineStatuses(left, right) {
  if (!left) {
    return right;
  }
  const rank = new Map([
    ["blocked_by_budget", 4],
    ["missing", 3],
    ["pending_after_paid_run", 2],
    ["configured", 1]
  ]);
  return (rank.get(right) ?? 0) > (rank.get(left) ?? 0) ? right : left;
}

function strongestSensitivity(left, right) {
  if (!left) {
    return right;
  }
  const rank = new Map([
    ["secret_env", 6],
    ["budget_approval", 5],
    ["manual_review", 4],
    ["operator_decision", 3],
    ["non_secret_operator_attestation", 2],
    ["public_url", 1],
    ["boolean_env", 1]
  ]);
  return (rank.get(right) ?? 0) > (rank.get(left) ?? 0) ? right : left;
}

function packageScriptSet() {
  const packageJson = readJsonIfExists("package.json");
  return new Set(Object.keys(packageJson?.scripts ?? {}));
}

function commandItemsFromEvidencePlan(plan) {
  return Object.entries(plan ?? {}).flatMap(([section, commands]) =>
    Array.isArray(commands)
      ? commands.map((item) => ({
          location: `evidenceCommandPlan.${section}.${item.name}`,
          name: String(item.name ?? "unknown"),
          kind: String(item.kind ?? section),
          status: String(item.status ?? "unknown"),
          command: String(item.command ?? "")
        }))
      : []
  );
}

function commandItemsFromRequiredInputs(requiredInputs) {
  return Array.isArray(requiredInputs)
    ? requiredInputs.flatMap((inputItem) =>
        validationCommandSteps(inputItem.validationCommand).map((step) => ({
          location: `requiredInputs.${inputItem.id}.validationCommand.step${step.stepIndex}`,
          name: step.stepCount > 1 ? `${inputItem.id}_step_${step.stepIndex}` : String(inputItem.id ?? "unknown"),
          kind: inputCommandKind(inputItem, step.command),
          status: commandStatusForInput(inputItem.status),
          command: step.command
        }))
      )
    : [];
}

function commandItemsFromBudgetPlan(plan) {
  return Array.isArray(plan?.slices)
    ? plan.slices.flatMap((slice) => {
        const status = String(slice.status ?? "unknown");
        const billingCommand = typeof slice.billingReadinessCommand === "string"
          ? slice.billingReadinessCommand
          : "";
        const items = [];
        if (billingCommand || isRunnableStatus(status)) {
          items.push({
            location: `budgetConstrainedPaidPlan.slices.${slice.name}.billingReadinessCommand`,
            name: `${slice.name}_billing`,
            kind: "atlas_billing_readiness",
            status,
            command: billingCommand
          });
        }
        items.push({
          location: `budgetConstrainedPaidPlan.slices.${slice.name}.command`,
          name: String(slice.name ?? "unknown"),
          kind: String(slice.kind ?? "unknown"),
          status,
          command: String(slice.command ?? "")
        });
        return items;
      })
    : [];
}

function auditCommandItem(item, scripts) {
  const command = item.command.trim();
  if (!command) {
    return [commandIssue("fail", item, "Command is empty.")];
  }
  const scriptName = extractNpmScriptName(command);
  if (!scriptName) {
    return isRunnableStatus(item.status)
      ? [commandIssue("warn", item, "Ready command is not directly expressed as npm run <script>.")]
      : [];
  }
  const issues = [];
  if (!scripts.has(scriptName)) {
    issues.push(commandIssue("fail", item, `Package script ${scriptName} does not exist.`));
  }
  if (isRunnableStatus(item.status) && command.includes("<")) {
    issues.push(commandIssue("fail", item, "Ready command still contains placeholder values."));
  }
  if (scriptName === "validation:atlas-billing" && !command.includes("--confirm-live-network")) {
    issues.push(commandIssue("fail", item, "Atlas billing readiness command must include --confirm-live-network."));
  }
  if (isPaidCommandKind(item.kind) && isRunnableStatus(item.status)) {
    issues.push(...paidCommandIssues(item, scriptName, command));
  }
  return issues;
}

function paidCommandIssues(item, scriptName, command) {
  if (scriptName === "validation:generated-audio") {
    return requiredFlagIssues(item, command, [
      "--confirm-provider-spend",
      "--confirm-audio-schema-reviewed",
      "--atlas-billing-report",
      "--max-cost-usd"
    ]);
  }
  if (scriptName === "validation:long-form") {
    return requiredFlagIssues(item, command, ["--confirm-paid-spend", "--max-cost-usd", "--manual-quality-review", "--confirm-manual-quality-review"]);
  }
  if (scriptName === "validation:paid-render") {
    return requiredFlagIssues(item, command, ["--confirm-paid-spend", "--max-cost-usd"]);
  }
  if (scriptName === "validation:source-video-auto-analysis") {
    return requiredFlagIssues(item, command, ["--confirm-provider-spend", "--max-cost-usd", "--atlas-billing-report"]);
  }
  return [];
}

function requiredFlagIssues(item, command, flags) {
  return flags
    .filter((flag) => !command.includes(flag))
    .map((flag) => commandIssue("fail", item, `Paid command must include ${flag}.`));
}

function extractNpmScriptName(command) {
  return command.match(/\bnpm(?:\.cmd)?\s+run\s+([^\s`]+)/)?.[1];
}

function isRunnableStatus(status) {
  return status === "ready" || status === "within_budget";
}

function isPaidCommandKind(kind) {
  return String(kind).startsWith("paid_");
}

function commandIssue(severity, item, message) {
  return {
    severity,
    location: item.location,
    commandName: item.name,
    command: item.command,
    message
  };
}

function statusFor(requiredInputs) {
  return requiredInputs.some((item) => item.status === "missing" || item.status === "blocked_by_budget")
    ? "blocked_by_operator_inputs"
    : "ready_for_live_evidence_sequence";
}

function summarizeInputs(requiredInputs) {
  return {
    total: requiredInputs.length,
    configured: requiredInputs.filter((item) => item.status === "configured").length,
    missing: requiredInputs.filter((item) => item.status === "missing").length,
    blockedByBudget: requiredInputs.filter((item) => item.status === "blocked_by_budget").length,
    pendingAfterPaidRun: requiredInputs.filter((item) => item.status === "pending_after_paid_run").length
  };
}

function buildReleaseGateSummary({ status, reports, requiredInputs }) {
  const business = reports.businessReadiness.value;
  const plan = reports.businessPlan.value;
  const live = reports.liveInputs.value;
  const missing = requiredInputs.filter((item) => item.status === "missing" || item.status === "blocked_by_budget");
  const readyPaidGates = readyPaidGatesFrom(live, plan);
  const hasReadyPaidGate = readyPaidGates.length > 0;
  const shouldDeferFullSequenceSpend =
    live?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
    plan?.releaseGateSummary?.shouldDeferFullSequenceSpend ??
    true;
  return {
    canRunNoSpendPrep: true,
    canRunLiveNetworkEvidence: status === "ready_for_live_evidence_sequence",
    canRunPaidAtlasValidation:
      hasReadyPaidGate ||
      (plan?.releaseGateSummary?.canRunSomePaidValidationNow === true && status === "ready_for_live_evidence_sequence"),
    readyPaidGates,
    readyPaidGateCount: readyPaidGates.length,
    shouldDeferFullSequenceSpend,
    canReleaseToCustomerTraffic: business?.releaseGateSummary?.canReleaseToCustomerTraffic === true,
    releaseBlocker:
      missing.length > 0
        ? `Commercial launch inputs are incomplete: ${missing.map((item) => item.id).join(", ")}.`
        : "Inputs are ready for live evidence sequence, but evidence runs and manual reviews still control release."
  };
}

function readyPaidGatesFrom(live, plan) {
  const liveReady = Array.isArray(live?.releaseGateSummary?.readyPaidGates)
    ? live.releaseGateSummary.readyPaidGates.map(normalizeReadyPaidGateName)
    : [];
  if (liveReady.length > 0) {
    return liveReady;
  }
  const planReady = Array.isArray(plan?.releaseGateSummary?.readyPaidGates)
    ? plan.releaseGateSummary.readyPaidGates.map(normalizeReadyPaidGateName)
    : [];
  return planReady;
}

function normalizeReadyPaidGateName(name) {
  const normalized = String(name);
  const aliases = new Map([
    ["generated_audio_inputs", "generated_audio_validation"],
    ["long_form_paid_validation_inputs", "long_form_paid_validation"],
    ["source_video_auto_analysis_inputs", "source_video_auto_analysis_validation"]
  ]);
  return aliases.get(normalized) ?? normalized;
}

function nextActionsFor(requiredInputs, live) {
  const actions = [];
  for (const item of requiredInputs) {
    if (item.status === "missing" || item.status === "blocked_by_budget") {
      actions.push(`${item.label}: ${item.acceptance}`);
    }
  }
  actions.push("Refresh validation:live-inputs, validation:business-plan, validation:provider-live-actions, validation:provider-graph-resume, validation:business-readiness, and validation:report-contracts after filling inputs.");
  if (live?.releaseGateSummary?.canRunGeneratedAudioPaidValidation === true) {
    actions.push("Generated-audio paid smoke is the only currently ready Atlas paid slice; run it only when intentionally spending Atlas budget, then complete the manual audio review.");
  } else {
    actions.push("Run paid Atlas validations only after no-spend/live prerequisites are ready and the approved Atlas budget covers the planned validation sequence.");
  }
  return [...new Set(actions)];
}

function renderMarkdown(report) {
  const missing = report.requiredInputs.filter((item) => item.status === "missing" || item.status === "blocked_by_budget");
  const pending = report.requiredInputs.filter((item) => item.status === "pending_after_paid_run");
  const configured = report.requiredInputs.filter((item) => item.status === "configured");
  return [
    "# CineJelly Commercial Launch Inputs",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${report.status}`,
    "",
    "## Operator Handoff Manifest",
    "",
    ...markdownOperatorHandoffManifest(report.operatorHandoffManifest),
    "",
    "## Atlas Configuration",
    "",
    ...markdownAtlasConfiguration(report.atlasConfigurationSummary),
    "",
    "## Missing Or Blocked Inputs",
    "",
    ...markdownItems(missing),
    "",
    "## Pending After Paid Runs",
    "",
    ...markdownItems(pending),
    "",
    "## Already Configured",
    "",
    ...markdownItems(configured),
    "",
    "## Environment Placeholders",
    "",
    ...report.envPlaceholders
      .filter((item) => item.required)
      .map((item) => `- ${item.name}=${item.exampleValue} (${item.sensitivity}; configured=${item.configured})`),
    "",
    "## Next Commands",
    "",
    "### No-Spend Local",
    "",
    ...markdownCommands(report.evidenceCommandPlan.noSpendLocal),
    "",
    "### No-Spend Network",
    "",
    ...markdownCommands(report.evidenceCommandPlan.noSpendNetwork),
    "",
    "### Live Network",
    "",
    ...markdownCommands(report.evidenceCommandPlan.liveNetwork),
    "",
    "### Paid Atlas",
    "",
    ...markdownCommands(report.evidenceCommandPlan.paidAtlas),
    "",
    "## Paid Budget Slice",
    "",
    ...markdownBudgetSlices(report.budgetConstrainedPaidPlan),
    "",
    "## Command Plan Audit",
    "",
    ...markdownCommandPlanAudit(report.commandPlanAudit),
    "",
    "## Release Gate",
    "",
    `canReleaseToCustomerTraffic: ${report.releaseGateSummary.canReleaseToCustomerTraffic}`,
    `readyPaidGates: ${report.releaseGateSummary.readyPaidGates.length === 0 ? "none" : report.releaseGateSummary.readyPaidGates.join(", ")}`,
    `shouldDeferFullSequenceSpend: ${report.releaseGateSummary.shouldDeferFullSequenceSpend}`,
    "",
    report.releaseGateSummary.releaseBlocker,
    ""
  ].join("\n");
}

function markdownOperatorHandoffManifest(manifest) {
  if (!manifest) {
    return ["- Operator handoff manifest unavailable. Rerun `npm.cmd run validation:commercial-inputs`."];
  }
  const summary = manifest.summary;
  const operatorFiles = manifest.operatorInputFiles.length === 0
    ? ["- Operator input files: none."]
    : manifest.operatorInputFiles.map((item) => `- ${item.path} (${item.status}; ${item.sensitivity}; present=${item.present})`);
  return [
    `- Status: ${manifest.status}`,
    `- Required inputs: ${summary.requiredInputCount}; missing/blocked: ${summary.missingOrBlockedInputCount}; pending after paid runs: ${summary.pendingAfterPaidRunCount}`,
    `- Operator files: ${summary.operatorInputFileCount}; draft/template files: ${summary.draftFileCount}; archive reports: ${summary.reportArchiveFileCount}`,
    `- Commands: ${summary.commandCount}; ready: ${summary.readyCommandCount}; paid-spend commands: ${summary.paidCommandCount}`,
    `- Required-input validation commands: ${summary.inputValidationCommandCount}; manual-review guarded: ${summary.manualReviewInputValidationCommandCount}`,
    `- Backend evidence phases: ${summary.backendReadinessPhaseCount}; phase blockers: ${summary.backendReadinessPhaseBlockerCount}; phase status: ${summary.backendReadinessPhaseStatus}`,
    `- Safe to share: ${manifest.safety.shareableWithOperators}; release evidence: ${manifest.safety.releaseEvidence}`,
    ...markdownBackendEvidencePhases(manifest.externalEvidencePhasePlan),
    ...operatorFiles
  ];
}

function markdownBackendEvidencePhases(phasePlan) {
  if (!phasePlan || !Array.isArray(phasePlan.phases) || phasePlan.phases.length === 0) {
    return ["- Backend evidence phases: unavailable. Rerun `npm.cmd run validation:backend-system-readiness`."];
  }
  return phasePlan.phases.map((phase) => {
    const commands = phase.validationCommands.length === 0 ? "none" : phase.validationCommands.join(", ");
    return `- Phase ${phase.phase} ${phase.label}: ${phase.blockerCount} blocker(s); commands=${commands}; manualReview=${phase.requiresManualReview}; paidOrLive=${phase.requiresPaidProviderOrNetwork}`;
  });
}

function markdownCommandPlanAudit(audit) {
  if (!audit) {
    return ["- Command plan audit unavailable."];
  }
  return [
    `- Status: ${audit.status}`,
    `- Checked commands: ${audit.checkedCommandCount}`,
    `- Package scripts visible: ${audit.npmScriptCount}`,
    ...(audit.issues.length === 0
      ? ["- Issues: none"]
      : audit.issues.map((issue) => `- ${issue.severity}: ${issue.location}: ${issue.message}`))
  ];
}

function markdownAtlasConfiguration(summary) {
  if (!summary) {
    return ["- Atlas configuration summary unavailable. Rerun `npm.cmd run validation:live-inputs`."];
  }
  return [
    `- Source: ${summary.source}`,
    `- Media key configured: ${summary.keys.mediaApiKeyConfigured}`,
    `- LLM key configured: ${summary.keys.llmApiKeyConfigured}; LLM fallback available: ${summary.keys.llmFallbackAvailable}`,
    `- Endpoint shape: LLM ${summary.docsAlignment.llmBaseUrl}; media ${summary.docsAlignment.mediaBaseUrl}; billing ${summary.docsAlignment.billingBaseUrl}`,
    `- Seedance models/capabilities ready: ${summary.readiness.seedanceVideoReady} (${summary.models.seedanceCapabilityCount} capability record(s))`,
    `- Generated-audio paid slice ready: ${summary.readiness.generatedAudioPaidSliceReady}`,
    `- Full paid sequence within budget: ${summary.readiness.fullPaidSequenceWithinBudget}`,
    `- ${summary.operatorMessage}`
  ];
}

function markdownBudgetSlices(plan) {
  if (!plan?.present) {
    return ["- No budget-constrained paid slice plan is available. Rerun `npm.cmd run validation:business-plan`."];
  }
  const lines = [
    `- Approved budget ceiling: ${formatUsd(plan.maxBudgetUsd)}`,
    `- Current known full paid estimate: ${formatUsd(plan.knownPaidEstimateUsd)}`,
    `- Full known paid sequence within budget: ${plan.fullKnownPaidSequenceWithinBudget}`,
    `- Recommended narrow slice: ${plan.recommendedSliceName ?? "none"}`
  ];
  for (const slice of plan.slices) {
    const cost = slice.estimatedCostUsd === undefined ? "unknown" : formatUsd(slice.estimatedCostUsd);
    lines.push(`- ${slice.name} [${slice.status}; ${cost}]: billing \`${slice.billingReadinessCommand ?? "not available"}\`; run \`${slice.command}\``);
  }
  return lines;
}

function markdownItems(items) {
  if (items.length === 0) {
    return ["- None."];
  }
  return items.map((item) => `- ${item.label} (${item.status}): ${item.acceptance}`);
}

function markdownCommands(commands) {
  if (commands.length === 0) {
    return ["- None."];
  }
  return commands.map((item) => `- ${item.name} [${item.status}]: \`${item.command}\``);
}

function gateFinder(gates) {
  const items = Array.isArray(gates) ? gates : [];
  return (name) => items.find((gate) => gate?.name === name);
}

function firstFailure(gate) {
  if (!gate || !Array.isArray(gate.checks)) {
    return undefined;
  }
  return gate.checks.find((check) => check?.status === "fail")?.message;
}

function failureByName(gate, name) {
  if (!gate || !Array.isArray(gate.checks)) {
    return undefined;
  }
  return gate.checks.find((check) => check?.name === name && check?.status === "fail")?.message;
}

function failingMessage(report, checkName) {
  if (!Array.isArray(report?.checks)) {
    return undefined;
  }
  return report.checks.find((check) => check?.name === checkName && check?.status === "fail")?.message;
}

function businessCheckPass(report, checkName) {
  if (!Array.isArray(report?.checks)) {
    return false;
  }
  return report.checks.find((check) => check?.name === checkName)?.status === "pass";
}

function providerReady(live, name) {
  return live?.environment?.remoteStock?.providers?.find((provider) => provider?.name === name)?.ready === true;
}

function providerKeyConfigured(live, name) {
  return live?.environment?.remoteStock?.providers?.find((provider) => provider?.name === name)?.keyConfigured === true;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatUsd(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function formatNumber(value) {
  return Number(value).toFixed(6);
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
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedAbsoluteLower = normalizedAbsolute.toLowerCase();
  if (normalizedAbsoluteLower === normalizedRoot) {
    return ".";
  }
  if (normalizedAbsoluteLower.startsWith(`${normalizedRoot}/`)) {
    return normalizedAbsolute.slice(normalizedRoot.length + 1);
  }
  return "[outside-repo]";
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.commercial-launch-inputs.v1",
        generatedAt: new Date().toISOString(),
        status: "blocked_by_operator_inputs",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
