import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
  markdownOutputPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-checklist.md",
  businessReadinessPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json",
  businessPlanPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  liveInputsPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json",
  atlasBillingPath: "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json",
  opsConfigPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json",
  providerLiveActionsPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json"
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
    ["--business-readiness-report", "businessReadinessPath"],
    ["--business-plan-report", "businessPlanPath"],
    ["--live-inputs-report", "liveInputsPath"],
    ["--atlas-billing-report", "atlasBillingPath"],
    ["--ops-config-report", "opsConfigPath"],
    ["--provider-live-actions-report", "providerLiveActionsPath"]
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
  --business-readiness-report <path>  Default: ${defaults.businessReadinessPath}
  --business-plan-report <path>       Default: ${defaults.businessPlanPath}
  --live-inputs-report <path>         Default: ${defaults.liveInputsPath}
  --atlas-billing-report <path>       Default: ${defaults.atlasBillingPath}
  --ops-config-report <path>          Default: ${defaults.opsConfigPath}
  --provider-live-actions-report <path>
                                      Default: ${defaults.providerLiveActionsPath}
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
    businessReadiness: summarizeReport(options.businessReadinessPath),
    businessPlan: summarizeReport(options.businessPlanPath),
    liveInputs: summarizeReport(options.liveInputsPath),
    atlasBilling: summarizeReport(options.atlasBillingPath),
    opsConfig: summarizeReport(options.opsConfigPath),
    providerLiveActions: summarizeReport(options.providerLiveActionsPath)
  };
  const requiredInputs = buildRequiredInputs(reports);
  const envPlaceholders = buildEnvPlaceholders(reports, requiredInputs);
  const atlasConfigurationSummary = buildAtlasConfigurationSummary(reports);
  const evidenceCommandPlan = buildEvidenceCommandPlan(
    reports.businessPlan.value,
    reports.liveInputs.value,
    reports.providerLiveActions.value
  );
  const budgetConstrainedPaidPlan = buildBudgetConstrainedPaidPlan(reports.businessPlan.value);
  const commandPlanAudit = buildCommandPlanAudit({ evidenceCommandPlan, budgetConstrainedPaidPlan });
  const status = statusFor(requiredInputs);
  const report = {
    schemaVersion: "cinejelly.commercial-launch-inputs.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      businessReadinessPath: toRepoRelative(options.businessReadinessPath),
      businessPlanPath: toRepoRelative(options.businessPlanPath),
      liveInputsPath: toRepoRelative(options.liveInputsPath),
      atlasBillingPath: toRepoRelative(options.atlasBillingPath),
      opsConfigPath: toRepoRelative(options.opsConfigPath),
      providerLiveActionsPath: toRepoRelative(options.providerLiveActionsPath),
      markdownOutputPath: options.writeMarkdown ? toRepoRelative(options.markdownOutputPath) : undefined
    },
    sourceReports: summarizeSourceReports(reports),
    inputSummary: summarizeInputs(requiredInputs),
    requiredInputs,
    envPlaceholders,
    atlasConfigurationSummary,
    evidenceCommandPlan,
    budgetConstrainedPaidPlan,
    commandPlanAudit,
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
  const atlasBilling = reports.atlasBilling.value;
  const opsConfig = reports.opsConfig.value;
  const providerLiveActions = reports.providerLiveActions.value;
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
      filePaths: ["assets/output_deliverables/business-readiness/long-form-validation-report.json"],
      acceptance: "After the paid 2-8 minute validation run, inspect artifacts, media quality, cost ledger, review packet, and redaction evidence.",
      validationCommand: "npm.cmd run validation:long-form -- --duration-seconds 120 --max-cost-usd <approved-budget> --confirm-paid-spend --confirm-manual-quality-review",
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
      filePaths: ["assets/output_deliverables/business-readiness/generated-audio-validation-report.json"],
      acceptance: "After Atlas generated-audio execution, approve schema review, output-batch validation, ledger evidence, and manual listening review.",
      validationCommand: "npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --confirm-manual-audio-review",
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

function buildEvidenceCommandPlan(plan, live, providerLiveActions) {
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

function buildCommandPlanAudit({ evidenceCommandPlan, budgetConstrainedPaidPlan }) {
  const scripts = packageScriptSet();
  const commandItems = [
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

function commandItemsFromBudgetPlan(plan) {
  return Array.isArray(plan?.slices)
    ? plan.slices.flatMap((slice) => [
        {
          location: `budgetConstrainedPaidPlan.slices.${slice.name}.billingReadinessCommand`,
          name: `${slice.name}_billing`,
          kind: "atlas_billing_readiness",
          status: String(slice.status ?? "unknown"),
          command: String(slice.billingReadinessCommand ?? "")
        },
        {
          location: `budgetConstrainedPaidPlan.slices.${slice.name}.command`,
          name: String(slice.name ?? "unknown"),
          kind: String(slice.kind ?? "unknown"),
          status: String(slice.status ?? "unknown"),
          command: String(slice.command ?? "")
        }
      ])
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
  if (scriptName === "validation:long-form" || scriptName === "validation:paid-render") {
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
  actions.push("Refresh validation:live-inputs, validation:business-plan, validation:provider-live-actions, validation:business-readiness, and validation:report-contracts after filling inputs.");
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
