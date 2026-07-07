import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  intakePath: "ops/commercial-launch-intake.json",
  outputPath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json",
  draftPath: "assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake.draft.json",
  packetPath: "assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake-fillout.md",
  commercialInputsPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json",
  businessPlanPath: "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json",
  liveInputsPath: "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json"
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const placeholderPattern = /\b(?:todo|tbd|replace|placeholder|example\.com|your-|fill[-_ ]?me)\b/i;
const envNamePattern = /^[A-Z][A-Z0-9_]{2,80}$/;
const providerNames = new Set(["pexels", "pixabay", "coverr"]);
const scopeNames = new Set(["generated_audio_smoke", "long_form_120s_minimum", "source_video_auto_analysis", "full_business_readiness_paid_sequence"]);
const commercialOfferScopeNames = new Set(["api_cli_only", "first_party_web_ui_required"]);

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true,
    writeDraft: false,
    force: false
  };
  const flagMap = new Map([
    ["--intake", "intakePath"],
    ["--output", "outputPath"],
    ["--draft-output", "draftPath"],
    ["--packet-output", "packetPath"],
    ["--commercial-inputs-report", "commercialInputsPath"],
    ["--business-plan-report", "businessPlanPath"],
    ["--live-inputs-report", "liveInputsPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--write-draft") {
      options.writeDraft = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
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
  console.log(`Validate a secret-free commercial launch intake file before live evidence or paid Atlas runs.

Usage:
  npm.cmd run validation:launch-intake
  npm.cmd run validation:launch-intake -- --write-draft
  npm.cmd run validation:launch-intake -- --intake ops/commercial-launch-intake.json

Options:
  --intake <path>                    Default: ${defaults.intakePath}
  --write-draft                      Write a secret-free draft JSON and Markdown fill-out packet.
  --draft-output <path>              Default: ${defaults.draftPath}
  --packet-output <path>             Default: ${defaults.packetPath}
  --commercial-inputs-report <path>  Default: ${defaults.commercialInputsPath}
  --business-plan-report <path>      Default: ${defaults.businessPlanPath}
  --live-inputs-report <path>        Default: ${defaults.liveInputsPath}
  --output <path>                    Report path. Default: ${defaults.outputPath}
  --force                            Overwrite draft files when used with --write-draft.
  --no-output                        Print only; do not write the JSON report.

This command reads local files and environment shape only. It does not call Atlas, deployment hosts, stock providers, source-video URLs, FFmpeg, render routes, or billing providers.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const sourceReports = {
    commercialInputs: summarizeReport(options.commercialInputsPath),
    businessPlan: summarizeReport(options.businessPlanPath),
    liveInputs: summarizeReport(options.liveInputsPath)
  };
  const draftEvidence = options.writeDraft ? writeDrafts(options, sourceReports) : { written: false };
  const intakeRead = readJsonIfExists(options.intakePath);
  const validation = validateIntake(intakeRead, options, sourceReports);
  const checks = [
    ...validation.checks,
    ...(draftEvidence.written ? [pass("launch_intake_draft_written", `Wrote commercial launch intake draft ${draftEvidence.draftPath}.`)] : []),
    ...(draftEvidence.packetWritten ? [pass("launch_intake_packet_written", `Wrote commercial launch intake packet ${draftEvidence.packetPath}.`)] : [])
  ];
  const status = statusFor({ intakeRead, checks });
  const report = {
    schemaVersion: "cinejelly.commercial-launch-intake-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      intakePath: toRepoRelative(options.intakePath),
      outputPath: toRepoRelative(options.outputPath),
      commercialInputsPath: toRepoRelative(options.commercialInputsPath),
      businessPlanPath: toRepoRelative(options.businessPlanPath),
      liveInputsPath: toRepoRelative(options.liveInputsPath),
      writeDraft: options.writeDraft,
      ...(options.writeDraft ? { draftPath: toRepoRelative(options.draftPath), packetPath: toRepoRelative(options.packetPath) } : {})
    },
    sourceReports: summarizeSourceReports(sourceReports),
    intakeSummary: validation.summary,
    checks,
    draftEvidence,
    releaseGateSummary: buildReleaseGateSummary({ status, validation, sourceReports }),
    nextActions: nextActionsFor({ status, checks, sourceReports, options })
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (extname(options.draftPath).toLowerCase() !== ".json") {
    throw new Error("--draft-output must point to a JSON file.");
  }
  if (extname(options.packetPath).toLowerCase() !== ".md") {
    throw new Error("--packet-output must point to a Markdown file.");
  }
}

function validateIntake(read, options, sourceReports) {
  if (!read.exists) {
    return {
      checks: [fail("launch_intake_file", `Missing commercial launch intake at ${toRepoRelative(options.intakePath)}. Run with --write-draft, fill the draft, then copy it into ops/commercial-launch-intake.json.`)],
      summary: emptySummary(false)
    };
  }
  if (read.error) {
    return {
      checks: [fail("launch_intake_json", `Commercial launch intake JSON is invalid: ${read.error}.`)],
      summary: emptySummary(true)
    };
  }
  const intake = read.value;
  const checks = [
    intake?.schemaVersion === "cinejelly.commercial-launch-intake.v1"
      ? pass("launch_intake.schema", "Commercial launch intake schema is recognized.")
      : fail("launch_intake.schema", "schemaVersion must be cinejelly.commercial-launch-intake.v1."),
    ...secretSafetyChecks(intake),
    requiredTextCheck(intake?.preparedBy, "launch_intake.prepared_by", "preparedBy"),
    dateTimeCheck(intake?.preparedAt, "launch_intake.prepared_at", "preparedAt"),
    ...validateDeployment(intake?.deployment),
    ...validateOperatorEvidence(intake?.operatorEvidence),
    ...validateCommercialOfferScope(intake?.commercialOfferScope),
    ...validateBudgetApproval(intake?.budgetApproval, sourceReports.businessPlan.value),
    ...validateSourceVideo(intake?.sourceVideo),
    ...validateRemoteStock(intake?.remoteStock),
    ...validatePaidPolicy(intake?.paidValidationPolicy, intake?.budgetApproval, sourceReports.businessPlan.value),
    ...validateManualReview(intake?.manualReview)
  ];
  return {
    checks,
    summary: buildIntakeSummary(intake)
  };
}

function validateDeployment(deployment) {
  return [
    cleanHttpsUrlCheck(deployment?.baseUrl, "launch_intake.deployment.base_url", "deployment.baseUrl"),
    envNameCheck(deployment?.authTokenEnvName, "launch_intake.deployment.auth_token_env", "deployment.authTokenEnvName"),
    envConfiguredCheck(deployment?.authTokenEnvName, "launch_intake.deployment.auth_token_configured", "deployment auth token env")
  ];
}

function validateOperatorEvidence(evidence) {
  return [
    relativeOpsJsonPathCheck(evidence?.billingAttestationPath, "launch_intake.operator_evidence.billing_attestation_path", "operatorEvidence.billingAttestationPath"),
    relativeOpsJsonPathCheck(evidence?.productionAttestationPath, "launch_intake.operator_evidence.production_attestation_path", "operatorEvidence.productionAttestationPath"),
    fileExistsCheck(evidence?.billingAttestationPath, "launch_intake.operator_evidence.billing_attestation_file", "billing/admin attestation file"),
    fileExistsCheck(evidence?.productionAttestationPath, "launch_intake.operator_evidence.production_attestation_file", "production operations attestation file")
  ];
}

function validateCommercialOfferScope(scope) {
  const productSurface = String(scope?.productSurface ?? "");
  const checks = [
    commercialOfferScopeNames.has(productSurface)
      ? pass("launch_intake.offer_scope.product_surface", "Commercial offer product surface is recognized.")
      : fail("launch_intake.offer_scope.product_surface", `commercialOfferScope.productSurface must be one of: ${[...commercialOfferScopeNames].join(", ")}.`),
    requiredTextCheck(scope?.decidedBy, "launch_intake.offer_scope.decided_by", "commercialOfferScope.decidedBy"),
    dateTimeCheck(scope?.decidedAt, "launch_intake.offer_scope.decided_at", "commercialOfferScope.decidedAt")
  ];
  if (productSurface === "api_cli_only") {
    checks.push(
      scope?.apiCliOnlyAcknowledgesNoFirstPartyUi === true
        ? pass("launch_intake.offer_scope.api_cli_acknowledgement", "API/CLI-only launch explicitly acknowledges it does not rely on a full first-party commercial Web UI.")
        : fail("launch_intake.offer_scope.api_cli_acknowledgement", "commercialOfferScope.apiCliOnlyAcknowledgesNoFirstPartyUi must be true when productSurface=api_cli_only.")
    );
    checks.push(
      scope?.uiRequiredBeforeCustomerTraffic === false
        ? pass("launch_intake.offer_scope.ui_not_required", "Full first-party commercial Web UI is not required before API/CLI-only customer traffic.")
        : fail("launch_intake.offer_scope.ui_not_required", "commercialOfferScope.uiRequiredBeforeCustomerTraffic must be false when productSurface=api_cli_only.")
    );
  }
  if (productSurface === "first_party_web_ui_required") {
    checks.push(
      scope?.uiRequiredBeforeCustomerTraffic === true
        ? pass("launch_intake.offer_scope.ui_required", "Full first-party commercial Web UI is required before customer traffic by operator decision.")
        : fail("launch_intake.offer_scope.ui_required", "commercialOfferScope.uiRequiredBeforeCustomerTraffic must be true when productSurface=first_party_web_ui_required.")
    );
  }
  return checks;
}

function validateBudgetApproval(budget, plan) {
  const knownEstimate = numberOrUndefined(plan?.costPlan?.knownPaidEstimateUsd);
  const generatedAudioEstimate = numberOrUndefined(plan?.costPlan?.generatedAudio?.estimatedCostUsd);
  const sourceVideoBudget = numberOrUndefined(budget?.sourceVideoAtlasLlmBudgetUsd);
  const approved = numberOrUndefined(budget?.approvedAtlasBudgetUsd);
  const scope = String(budget?.scope ?? "");
  const checks = [
    scopeNames.has(scope)
      ? pass("launch_intake.budget.scope", "Budget scope is recognized.")
      : fail("launch_intake.budget.scope", `budgetApproval.scope must be one of: ${[...scopeNames].join(", ")}.`),
    positiveNumberCheck(approved, "launch_intake.budget.approved_atlas_budget", "budgetApproval.approvedAtlasBudgetUsd"),
    requiredTextCheck(budget?.approvedBy, "launch_intake.budget.approved_by", "budgetApproval.approvedBy"),
    dateTimeCheck(budget?.approvedAt, "launch_intake.budget.approved_at", "budgetApproval.approvedAt")
  ];
  if (scope === "generated_audio_smoke") {
    checks.push(
      generatedAudioEstimate !== undefined && approved !== undefined && approved >= generatedAudioEstimate
        ? pass("launch_intake.budget.generated_audio_scope", `Approved budget covers generated-audio estimate ${formatUsd(generatedAudioEstimate)}.`)
        : fail("launch_intake.budget.generated_audio_scope", `Approved budget must cover generated-audio estimate ${formatUsd(generatedAudioEstimate)}.`)
    );
  }
  if (scope === "full_business_readiness_paid_sequence") {
    checks.push(
      knownEstimate !== undefined && approved !== undefined && approved >= knownEstimate
        ? pass("launch_intake.budget.full_sequence_scope", `Approved budget covers known full paid estimate ${formatUsd(knownEstimate)}.`)
        : fail("launch_intake.budget.full_sequence_scope", `Approved budget must cover known full paid estimate ${formatUsd(knownEstimate)} before full paid sequence.`)
    );
  }
  if (scope === "source_video_auto_analysis" || budget?.sourceVideoAtlasLlmBudgetUsd !== undefined) {
    checks.push(
      sourceVideoBudget !== undefined && sourceVideoBudget > 0
        ? pass("launch_intake.budget.source_video_llm_budget", "Source-video Atlas LLM budget is positive.")
        : fail("launch_intake.budget.source_video_llm_budget", "budgetApproval.sourceVideoAtlasLlmBudgetUsd must be positive when source-video analysis is in scope.")
    );
  }
  return checks;
}

function validateSourceVideo(sourceVideo) {
  const enabled = sourceVideo?.enabled === true;
  if (!enabled) {
    return [
      sourceVideo?.enabled === false
        ? pass("launch_intake.source_video.disabled", "Source-video auto-analysis is intentionally disabled in the intake.")
        : fail("launch_intake.source_video.enabled", "sourceVideo.enabled must be true or false.")
    ];
  }
  return [
    pass("launch_intake.source_video.enabled", "Source-video auto-analysis is enabled in the intake."),
    cleanHttpsUrlCheck(sourceVideo?.url, "launch_intake.source_video.url", "sourceVideo.url"),
    sourceVideo?.approvedForAtlasLlmAnalysis === true
      ? pass("launch_intake.source_video.atlas_llm_approval", "Source video is approved for Atlas LLM analysis.")
      : fail("launch_intake.source_video.atlas_llm_approval", "sourceVideo.approvedForAtlasLlmAnalysis must be true when source-video analysis is enabled.")
  ];
}

function validateRemoteStock(remoteStock) {
  const enabled = remoteStock?.enabled === true;
  if (!enabled) {
    return [
      remoteStock?.enabled === false
        ? pass("launch_intake.remote_stock.disabled", "Remote stock validation is intentionally disabled in the intake.")
        : fail("launch_intake.remote_stock.enabled", "remoteStock.enabled must be true or false.")
    ];
  }
  const providers = Array.isArray(remoteStock?.providers) ? remoteStock.providers.map(String) : [];
  const keyEnvVars = Array.isArray(remoteStock?.keyEnvVars) ? remoteStock.keyEnvVars.map(String) : [];
  const unsupported = providers.filter((provider) => !providerNames.has(provider));
  return [
    pass("launch_intake.remote_stock.enabled", "Remote stock validation is enabled in the intake."),
    providers.length > 0 && unsupported.length === 0
      ? pass("launch_intake.remote_stock.providers", "Remote stock provider list is recognized.")
      : fail("launch_intake.remote_stock.providers", "remoteStock.providers must include pexels, pixabay, and/or coverr only."),
    remoteStock?.commercialTermsReviewed === true
      ? pass("launch_intake.remote_stock.terms", "Remote stock commercial terms are marked reviewed.")
      : fail("launch_intake.remote_stock.terms", "remoteStock.commercialTermsReviewed must be true when remote stock is enabled."),
    keyEnvVars.length > 0 && keyEnvVars.every((name) => envNamePattern.test(name))
      ? pass("launch_intake.remote_stock.key_env_vars", "Remote stock key env var names are present.")
      : fail("launch_intake.remote_stock.key_env_vars", "remoteStock.keyEnvVars must list env var names only, not raw keys.")
  ];
}

function validatePaidPolicy(policy, budget, plan) {
  const checks = [
    booleanCheck(policy?.allowGeneratedAudioSmoke, "launch_intake.paid_policy.generated_audio", "paidValidationPolicy.allowGeneratedAudioSmoke"),
    booleanCheck(policy?.allowLongForm, "launch_intake.paid_policy.long_form", "paidValidationPolicy.allowLongForm"),
    booleanCheck(policy?.allowSourceVideoAnalysis, "launch_intake.paid_policy.source_video", "paidValidationPolicy.allowSourceVideoAnalysis"),
    booleanCheck(policy?.allowFullSequence, "launch_intake.paid_policy.full_sequence", "paidValidationPolicy.allowFullSequence")
  ];
  const approved = numberOrUndefined(budget?.approvedAtlasBudgetUsd);
  const longFormMinimum = numberOrUndefined(plan?.costPlan?.longForm?.minimumBudgetUsdToRun);
  const knownEstimate = numberOrUndefined(plan?.costPlan?.knownPaidEstimateUsd);
  if (policy?.allowLongForm === true) {
    checks.push(
      longFormMinimum !== undefined && approved !== undefined && approved >= longFormMinimum
        ? pass("launch_intake.paid_policy.long_form_budget", `Approved budget covers long-form minimum ${formatUsd(longFormMinimum)}.`)
        : fail("launch_intake.paid_policy.long_form_budget", `allowLongForm requires approved budget at least ${formatUsd(longFormMinimum)}.`)
    );
  }
  if (policy?.allowFullSequence === true) {
    checks.push(
      knownEstimate !== undefined && approved !== undefined && approved >= knownEstimate
        ? pass("launch_intake.paid_policy.full_sequence_budget", `Approved budget covers known full paid estimate ${formatUsd(knownEstimate)}.`)
        : fail("launch_intake.paid_policy.full_sequence_budget", `allowFullSequence requires approved budget at least ${formatUsd(knownEstimate)}.`)
    );
  }
  return checks;
}

function validateManualReview(review) {
  return [
    requiredTextCheck(review?.reviewer, "launch_intake.manual_review.reviewer", "manualReview.reviewer"),
    review?.generatedAudioListeningRequired === true
      ? pass("launch_intake.manual_review.generated_audio", "Generated-audio listening review is required.")
      : fail("launch_intake.manual_review.generated_audio", "manualReview.generatedAudioListeningRequired must be true."),
    review?.longFormMediaReviewRequired === true
      ? pass("launch_intake.manual_review.long_form", "Long-form media review is required.")
      : fail("launch_intake.manual_review.long_form", "manualReview.longFormMediaReviewRequired must be true."),
    review?.redactionReviewRequired === true
      ? pass("launch_intake.manual_review.redaction", "Redaction review is required.")
      : fail("launch_intake.manual_review.redaction", "manualReview.redactionReviewRequired must be true.")
  ];
}

function buildIntakeSummary(intake) {
  return {
    present: true,
    schemaVersion: typeof intake?.schemaVersion === "string" ? intake.schemaVersion : undefined,
    commercialOfferScopeConfigured:
      commercialOfferScopeNames.has(String(intake?.commercialOfferScope?.productSurface ?? "")) &&
      typeof intake?.commercialOfferScope?.decidedBy === "string" &&
      intake.commercialOfferScope.decidedBy.trim().length > 0 &&
      Number.isFinite(Date.parse(String(intake?.commercialOfferScope?.decidedAt ?? ""))),
    commercialOfferProductSurface: commercialOfferScopeNames.has(String(intake?.commercialOfferScope?.productSurface ?? ""))
      ? String(intake.commercialOfferScope.productSurface)
      : undefined,
    uiRequiredBeforeCustomerTraffic: intake?.commercialOfferScope?.uiRequiredBeforeCustomerTraffic === true,
    selectedPaidScope: typeof intake?.budgetApproval?.scope === "string" ? intake.budgetApproval.scope : undefined,
    deploymentUrlConfigured: typeof intake?.deployment?.baseUrl === "string" && intake.deployment.baseUrl.length > 0,
    sourceVideoEnabled: intake?.sourceVideo?.enabled === true,
    remoteStockEnabled: intake?.remoteStock?.enabled === true,
    approvedAtlasBudgetUsd: numberOrUndefined(intake?.budgetApproval?.approvedAtlasBudgetUsd),
    sourceVideoAtlasLlmBudgetUsd: numberOrUndefined(intake?.budgetApproval?.sourceVideoAtlasLlmBudgetUsd),
    allowGeneratedAudioSmoke: intake?.paidValidationPolicy?.allowGeneratedAudioSmoke === true,
    allowLongForm: intake?.paidValidationPolicy?.allowLongForm === true,
    allowSourceVideoAnalysis: intake?.paidValidationPolicy?.allowSourceVideoAnalysis === true,
    allowFullSequence: intake?.paidValidationPolicy?.allowFullSequence === true,
    manualReviewReviewerConfigured: typeof intake?.manualReview?.reviewer === "string" && intake.manualReview.reviewer.trim().length > 0
  };
}

function emptySummary(present) {
  return {
    present,
    commercialOfferScopeConfigured: false,
    uiRequiredBeforeCustomerTraffic: false,
    deploymentUrlConfigured: false,
    sourceVideoEnabled: false,
    remoteStockEnabled: false,
    allowGeneratedAudioSmoke: false,
    allowLongForm: false,
    allowSourceVideoAnalysis: false,
    allowFullSequence: false,
    manualReviewReviewerConfigured: false
  };
}

function writeDrafts(options, sourceReports) {
  const draft = buildDraft(sourceReports);
  const draftPath = resolve(repoRoot, options.draftPath);
  const packetPath = resolve(repoRoot, options.packetPath);
  mkdirSync(dirname(draftPath), { recursive: true });
  mkdirSync(dirname(packetPath), { recursive: true });
  if (!existsSync(draftPath) || options.force) {
    writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  }
  if (!existsSync(packetPath) || options.force) {
    writeFileSync(packetPath, `${renderPacket(options, sourceReports, draft)}\n`, "utf8");
  }
  return {
    written: true,
    draftPath: toRepoRelative(options.draftPath),
    packetWritten: true,
    packetPath: toRepoRelative(options.packetPath)
  };
}

function buildDraft(sourceReports) {
  const plan = sourceReports.businessPlan.value;
  const generatedAudioEstimate = numberOrUndefined(plan?.costPlan?.generatedAudio?.estimatedCostUsd) ?? 0.00087;
  const longFormEstimate = numberOrUndefined(plan?.costPlan?.longForm?.minimumBudgetUsdToRun) ?? 24;
  const knownEstimate = numberOrUndefined(plan?.costPlan?.knownPaidEstimateUsd) ?? 24.00087;
  return {
    schemaVersion: "cinejelly.commercial-launch-intake.v1",
    preparedAt: "",
    preparedBy: "",
    deployment: {
      baseUrl: "",
      authTokenEnvName: "CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN"
    },
    operatorEvidence: {
      billingAttestationPath: "ops/billing-admin-attestation.json",
      productionAttestationPath: "ops/production-operations-attestation.json"
    },
    commercialOfferScope: {
      productSurface: "api_cli_only",
      decidedAt: "",
      decidedBy: "",
      apiCliOnlyAcknowledgesNoFirstPartyUi: false,
      uiRequiredBeforeCustomerTraffic: false
    },
    budgetApproval: {
      scope: "generated_audio_smoke",
      approvedAtlasBudgetUsd: 5,
      sourceVideoAtlasLlmBudgetUsd: 0,
      approvedAt: "",
      approvedBy: "",
      currentKnownPaidEstimateUsd: knownEstimate,
      currentLongFormMinimumBudgetUsd: longFormEstimate,
      currentGeneratedAudioEstimateUsd: generatedAudioEstimate
    },
    sourceVideo: {
      enabled: false,
      url: "",
      approvedForAtlasLlmAnalysis: false
    },
    remoteStock: {
      enabled: false,
      providers: [],
      commercialTermsReviewed: false,
      keyEnvVars: []
    },
    paidValidationPolicy: {
      allowGeneratedAudioSmoke: false,
      allowLongForm: false,
      allowSourceVideoAnalysis: false,
      allowFullSequence: false
    },
    manualReview: {
      reviewer: "",
      generatedAudioListeningRequired: true,
      longFormMediaReviewRequired: true,
      redactionReviewRequired: true
    }
  };
}

function renderPacket(options, sourceReports, draft) {
  const plan = sourceReports.businessPlan.value;
  return [
    "# CineJelly Commercial Launch Intake",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This packet is a no-spend operator aid. Do not paste Atlas keys, deployment tokens, provider keys, signed URLs, customer payment records, or private customer media into the intake JSON.",
    "",
    "## Files",
    "",
    `- Draft: ${toRepoRelative(options.draftPath)}`,
    `- Final ignored intake: ${toRepoRelative(options.intakePath)}`,
    `- Validation report: ${toRepoRelative(options.outputPath)}`,
    "",
    "## Budget Snapshot",
    "",
    `- Current approved ceiling default: ${formatUsd(plan?.costPlan?.maxBudgetUsd)}`,
    `- Known paid estimate: ${formatUsd(plan?.costPlan?.knownPaidEstimateUsd)}`,
    `- Long-form 120s minimum: ${formatUsd(plan?.costPlan?.longForm?.minimumBudgetUsdToRun)}`,
    `- Generated-audio smoke estimate: ${formatUsd(plan?.costPlan?.generatedAudio?.estimatedCostUsd)}`,
    "",
    "## Fill-Out Notes",
    "",
    "- Use a real clean HTTPS deployment URL without credentials, query strings, or fragments.",
    "- Keep `deployment.authTokenEnvName` as an env var name only; put the secret value in `.env`, not this JSON.",
    "- Set `commercialOfferScope.productSurface` to `api_cli_only` only when the launch is intentionally API/CLI/operator-report based and does not rely on a full first-party commercial Web UI; otherwise use `first_party_web_ui_required` and keep customer traffic blocked until the full UI exists.",
    "- Keep `remoteStock.keyEnvVars` as env var names only, such as `PEXELS_API_KEY`.",
    "- Set `budgetApproval.scope` to one of `generated_audio_smoke`, `long_form_120s_minimum`, `source_video_auto_analysis`, or `full_business_readiness_paid_sequence`.",
    "- Leave source-video disabled unless you have a credential-free HTTPS source video approved for Atlas LLM analysis.",
    "- Leave remote stock disabled unless provider keys and commercial terms are ready.",
    "- Keep all manual review booleans true before commercial launch.",
    "",
    "## Commands",
    "",
    "```powershell",
    "npm.cmd run validation:launch-intake -- --write-draft",
    "Copy-Item assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake.draft.json ops/commercial-launch-intake.json",
    "npm.cmd run validation:launch-intake",
    "npm.cmd run validation:live-inputs",
    "npm.cmd run validation:commercial-inputs",
    "npm.cmd run validation:completion-audit",
    "npm.cmd run validation:report-contracts",
    "```",
    "",
    "## Draft Shape",
    "",
    "```json",
    JSON.stringify(draft, null, 2),
    "```"
  ].join("\n");
}

function secretSafetyChecks(value) {
  const serialized = JSON.stringify(value ?? {});
  return secretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  })
    ? [fail("launch_intake.secret_scan", "Commercial launch intake contains secret-like material; keep only placeholders, clean URLs, env var names, booleans, and budget numbers.")]
    : [pass("launch_intake.secret_scan", "No secret-like values found in the commercial launch intake.")];
}

function cleanHttpsUrlCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || placeholderPattern.test(value)) {
    return fail(name, `${fieldName} must be a real HTTPS URL.`);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || isLocalHost(url.hostname)) {
      return fail(name, `${fieldName} must be a clean non-localhost HTTPS URL without credentials, query strings, or fragments.`);
    }
    return pass(name, `${fieldName} is a clean HTTPS URL.`);
  } catch {
    return fail(name, `${fieldName} must be a valid HTTPS URL.`);
  }
}

function envNameCheck(value, name, fieldName) {
  return typeof value === "string" && envNamePattern.test(value)
    ? pass(name, `${fieldName} is an env var name.`)
    : fail(name, `${fieldName} must be an uppercase env var name, not a secret value.`);
}

function envConfiguredCheck(value, name, label) {
  return typeof value === "string" && envNamePattern.test(value) && process.env[value]?.trim()
    ? pass(name, `${label} is configured in the environment.`)
    : fail(name, `${label} must be configured in .env before deployment capture.`);
}

function relativeOpsJsonPathCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || placeholderPattern.test(value)) {
    return fail(name, `${fieldName} must point to an ignored ops/*.json file.`);
  }
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("ops/") && normalized.endsWith(".json") && !normalized.includes("..")
    ? pass(name, `${fieldName} points to an ignored ops JSON file.`)
    : fail(name, `${fieldName} must be a relative ops/*.json path.`);
}

function fileExistsCheck(value, name, label) {
  return typeof value === "string" && existsSync(resolve(repoRoot, value))
    ? pass(name, `${label} exists.`)
    : fail(name, `${label} is missing.`);
}

function requiredTextCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || placeholderPattern.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    return fail(name, `${fieldName} must be real non-placeholder text without control characters.`);
  }
  return pass(name, `${fieldName} is configured.`);
}

function dateTimeCheck(value, name, fieldName) {
  if (typeof value !== "string" || !value.trim() || placeholderPattern.test(value)) {
    return fail(name, `${fieldName} must be an ISO date-time string.`);
  }
  return Number.isFinite(Date.parse(value))
    ? pass(name, `${fieldName} is a valid date-time string.`)
    : fail(name, `${fieldName} must be a valid ISO date-time string.`);
}

function positiveNumberCheck(value, name, fieldName) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? pass(name, `${fieldName} is positive.`)
    : fail(name, `${fieldName} must be a positive number.`);
}

function booleanCheck(value, name, fieldName) {
  return typeof value === "boolean"
    ? pass(name, `${fieldName} is boolean.`)
    : fail(name, `${fieldName} must be true or false.`);
}

function summarizeReport(path) {
  const read = readJsonIfExists(path);
  if (!read.exists || read.error) {
    return {
      present: false,
      path: toRepoRelative(path),
      status: read.error ? "invalid" : "missing",
      ...(read.error ? { error: read.error } : {})
    };
  }
  return {
    present: true,
    path: toRepoRelative(path),
    schemaVersion: typeof read.value?.schemaVersion === "string" ? read.value.schemaVersion : undefined,
    status: String(read.value?.status ?? "unknown"),
    value: read.value
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

function statusFor({ intakeRead, checks }) {
  if (!intakeRead.exists) {
    return "missing_intake";
  }
  return checks.some((check) => check.status === "fail") ? "fail" : "pass";
}

function buildReleaseGateSummary({ status, validation, sourceReports }) {
  return {
    intakePass: status === "pass",
    canUseForLiveEvidencePrep: status === "pass",
    canRunPaidAtlasValidation: false,
    canReleaseToCustomerTraffic: false,
    selectedPaidScope: validation.summary.selectedPaidScope,
    readyPaidGates: Array.isArray(sourceReports.commercialInputs.value?.releaseGateSummary?.readyPaidGates)
      ? sourceReports.commercialInputs.value.releaseGateSummary.readyPaidGates.map(String)
      : [],
    releaseBlocker:
      status === "pass"
        ? "Commercial launch intake is internally consistent; live evidence, Atlas billing, paid validation, manual review, and business-readiness gates still control release."
        : "Commercial launch intake is missing or incomplete."
  };
}

function nextActionsFor({ status, checks, sourceReports, options }) {
  const actions = [];
  if (status === "missing_intake") {
    actions.push("Run npm.cmd run validation:launch-intake -- --write-draft, fill the draft, and copy it to ops/commercial-launch-intake.json.");
  }
  for (const check of checks) {
    if (check.status === "fail") {
      actions.push(check.message);
    }
  }
  if (sourceReports.commercialInputs.value?.releaseGateSummary?.readyPaidGates?.includes("generated_audio_validation")) {
    actions.push("Generated-audio smoke remains the only currently budget-ready paid Atlas slice; it still requires explicit paid execution and manual listening review.");
  }
  actions.push(`Keep ${toRepoRelative(options.intakePath)} ignored and secret-free.`);
  actions.push("After intake passes, rerun validation:live-inputs, validation:commercial-inputs, validation:completion-audit, and validation:report-contracts.");
  return [...new Set(actions)];
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return { exists: true, value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { exists: true, error: redactText(error instanceof Error ? error.message : String(error)) };
  }
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(value), null, 2)}\n`, "utf8");
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatUsd(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "unavailable";
}

function isLocalHost(hostname) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.endsWith(".local");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), String(value));
}

function redactUnknown(value) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message: redactText(message) };
}

try {
  process.exitCode = main();
} catch (error) {
  const report = {
    schemaVersion: "cinejelly.commercial-launch-intake-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
