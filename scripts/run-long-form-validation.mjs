import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/long-form-validation-report.json",
  requestPath: "assets/output_deliverables/business-readiness/long-form-request.json",
  paidReportPath: "assets/output_deliverables/business-readiness/long-form-paid-render-report.json",
  durationSeconds: 120,
  tier: "fast",
  resolution: "480p",
  qualityMode: "economy",
  ratio: "16:9",
  audioMode: "none",
  maxCostUsd: 5,
  atlasBillingReportPath: "assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json",
  atlasBillingEvidenceMaxAgeHours: Number(process.env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS || "24"),
  userInput:
    "Create a two-minute premium product story for a fictional smart desk lamp, with calm workspace lighting, consistent product identity, subtle camera motion, and no customer data.",
  timeoutMs: 7_200_000
};

const sourcePatternOrigins = [
  "HKUDS/ViMax",
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo",
  "calesthio/OpenMontage",
  "Atlas Cloud Seedance 2.0 model page"
];

const atlasDocsEvidence = {
  seedanceModelPage: "https://www.atlascloud.ai/models/seedance2",
  documentedSeedanceClipDurationSeconds: { min: 4, max: 15 },
  documentedSeedanceResolutions: ["480p", "720p"],
  documentedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  longFormTargetSeconds: { min: 120, max: 480 },
  observedInDocsAt: "2026-06-16"
};

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /apikey-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|expires|policy|sig)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|policy|expires|sig/i;

function parseArgs(args) {
  const options = {
    ...defaults,
    confirmPaidSpend: false,
    allowWarnings: false,
    confirmManualQualityReview: false,
    writeReport: true
  };

  const flagMap = new Map([
    ["--request", "requestPath"],
    ["--output", "outputPath"],
    ["--paid-report", "paidReportPath"],
    ["--duration-seconds", "durationSeconds"],
    ["--tier", "tier"],
    ["--resolution", "resolution"],
    ["--quality", "qualityMode"],
    ["--ratio", "ratio"],
    ["--audio-mode", "audioMode"],
    ["--max-cost-usd", "maxCostUsd"],
    ["--atlas-billing-report", "atlasBillingReportPath"],
    ["--atlas-billing-evidence-max-age-hours", "atlasBillingEvidenceMaxAgeHours"],
    ["--user-input", "userInput"],
    ["--manual-quality-review", "manualQualityReviewPath"],
    ["--timeout-ms", "timeoutMs"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-paid-spend") {
      options.confirmPaidSpend = true;
      continue;
    }
    if (arg === "--allow-warnings") {
      options.allowWarnings = true;
      continue;
    }
    if (arg === "--confirm-manual-quality-review") {
      options.confirmManualQualityReview = true;
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
      options[key] = numericOption(key) ? Number(rawValue) : rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return ["durationSeconds", "maxCostUsd", "atlasBillingEvidenceMaxAgeHours", "timeoutMs"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Run CineJelly long-form validation with an explicit paid-spend gate.

Usage:
  npm.cmd run validation:long-form
  npm.cmd run validation:long-form -- --duration-seconds 120
  npm.cmd run validation:long-form -- --request assets/output_deliverables/business-readiness/long-form-request.json --confirm-paid-spend

Options:
  --request <path>                       Operator-owned request JSON. Default writes/uses ${defaults.requestPath}
  --duration-seconds <seconds>           Long-form target duration, 120-480. Default: ${defaults.durationSeconds}
  --tier <fast|standard>                 Default: ${defaults.tier}
  --resolution <480p|720p|1080p>         Default: ${defaults.resolution}
  --quality <economy|standard|high|ultimate> Default: ${defaults.qualityMode}
  --ratio <ratio>                        Default: ${defaults.ratio}
  --audio-mode <mode>                    Default: ${defaults.audioMode}
  --max-cost-usd <amount>                Local budget ceiling. Default: ${defaults.maxCostUsd}
  --atlas-billing-report <path>          Long-form billing readiness report. Default: ${defaults.atlasBillingReportPath}
  --atlas-billing-evidence-max-age-hours <hours>
                                         Maximum age for Atlas billing readiness evidence. Default: ${defaults.atlasBillingEvidenceMaxAgeHours}
  --user-input <text>                    Used only when creating the default request.
  --paid-report <path>                   Nested paid-render report path. Default: ${defaults.paidReportPath}
  --manual-quality-review <path>         Operator review JSON/text with pass decision and artifact fingerprints.
  --confirm-paid-spend                   Required before invoking the paid render validation runner.
  --allow-warnings                       Pass through readiness warnings after operator acceptance.
  --confirm-manual-quality-review        Operator attests the supplied manual review was completed after output review.
  --output <path>                        JSON report path. Default: ${defaults.outputPath}
  --no-output                            Print only; do not write the report.

Without --confirm-paid-spend this command creates/validates a long-form request, checks readiness, plans provider-safe chunks, and writes a blocked no-spend report.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const requestEvidence = readOrCreateRequest(options);
  const modules = await loadRuntimeModules();
  const normalizedRequest = normalizeRequest(requestEvidence.request, modules);
  const normalizedSettings = modules.normalizeSeedanceSettings(normalizedRequest.settings ?? {});
  const requestValidation = await modules.validateRenderRequestFile(requestEvidence.absoluteRequestPath, process.env);
  const readiness = new modules.Phase6ValidationReadinessReporter().build(await new modules.RuntimePreflight(process.env).run());
  const durationSeconds = normalizedSettings.durationTargetSeconds;
  const costEstimate = estimateCost(durationSeconds);
  const atlasBillingGate = summarizeAtlasBillingGate(options, costEstimate);
  const chunkPlan = buildChunkPlan(modules, normalizedSettings);
  const manualQualityReviewInput = readManualQualityReview(options);
  const baseChecks = [
    ...checksForRequest(requestEvidence, normalizedSettings, requestValidation),
    ...checksForReadiness(readiness, options.allowWarnings),
    ...checksForBudget(costEstimate, options.maxCostUsd),
    ...atlasBillingGate.checks,
    ...checksForChunkPlan(chunkPlan)
  ];

  if (baseChecks.some((check) => check.name === "estimated_cost_budget" && check.status === "fail")) {
    const report = buildReport({
      options,
      status: "blocked_by_budget",
      requestEvidence,
      requestValidation,
      readiness,
      durationSeconds,
      costEstimate,
      chunkPlan,
      checks: baseChecks,
      spendGate: spendGate(options, costEstimate, false),
      atlasBillingGate,
      paidRender: emptyPaidRenderSummary(),
      artifactEvidence: emptyArtifactEvidence(),
      manualQualityReview: manualQualityReviewInput
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  if (!options.confirmPaidSpend) {
    const checks = [
      ...baseChecks,
      fail("spend_confirmation", "--confirm-paid-spend is required before running a 2-8 minute Atlas validation render.")
    ];
    const report = buildReport({
      options,
      status: "blocked_by_spend_confirmation",
      requestEvidence,
      requestValidation,
      readiness,
      durationSeconds,
      costEstimate,
      chunkPlan,
      checks,
      spendGate: spendGate(options, costEstimate, false),
      atlasBillingGate,
      paidRender: emptyPaidRenderSummary(),
      artifactEvidence: emptyArtifactEvidence(),
      manualQualityReview: manualQualityReviewInput
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const preSpendFailures = baseChecks.filter((check) => check.status === "fail");
  if (preSpendFailures.length > 0) {
    const atlasBillingFailed = preSpendFailures.some((check) => check.name.startsWith("atlas_billing_"));
    const report = buildReport({
      options,
      status: atlasBillingFailed ? "blocked_by_atlas_billing" : "blocked_by_readiness",
      requestEvidence,
      requestValidation,
      readiness,
      durationSeconds,
      costEstimate,
      chunkPlan,
      checks: baseChecks,
      spendGate: spendGate(options, costEstimate, false),
      atlasBillingGate,
      paidRender: emptyPaidRenderSummary(),
      artifactEvidence: emptyArtifactEvidence(),
      manualQualityReview: manualQualityReviewInput
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const liveEvidence = await runPaidLongFormValidation({
    options,
    modules,
    requestPath: requestEvidence.absoluteRequestPath,
    normalizedRequest
  });
  const manualQualityReview = bindManualQualityReviewToArtifact(manualQualityReviewInput, liveEvidence.artifactEvidence);
  const checks = [
    ...baseChecks,
    ...liveEvidence.checks,
    manualQualityReview.passed
      ? pass("manual_quality_review", "Operator manual long-form quality/redaction review passed.")
      : fail("manual_quality_review", "Manual long-form quality/redaction review is required before this evidence can count for business readiness."),
    manualQualityReview.artifactBindingStatus === "matched"
      ? pass("manual_quality_review_artifact_binding", "Manual long-form quality review is bound to the paid artifact fingerprints.")
      : fail("manual_quality_review_artifact_binding", manualQualityReview.message)
  ];
  const status = statusForChecks(checks);
  const report = buildReport({
    options,
    status,
    requestEvidence,
    requestValidation,
    readiness,
    durationSeconds,
    costEstimate,
    chunkPlan,
    checks,
    spendGate: spendGate(options, costEstimate, true),
    atlasBillingGate,
    paidRender: liveEvidence.paidRender,
    artifactEvidence: liveEvidence.artifactEvidence,
    manualQualityReview,
    error: liveEvidence.error
  });
  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (extname(options.requestPath).toLowerCase() !== ".json") {
    throw new Error("--request must point to a JSON file.");
  }
  if (extname(options.paidReportPath).toLowerCase() !== ".json") {
    throw new Error("--paid-report must point to a JSON file.");
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 120 || options.durationSeconds > 480) {
    throw new Error("--duration-seconds must be between 120 and 480.");
  }
  if (!["fast", "standard"].includes(options.tier)) {
    throw new Error("--tier must be fast or standard.");
  }
  if (!["480p", "720p", "1080p"].includes(options.resolution)) {
    throw new Error("--resolution must be 480p, 720p, or 1080p.");
  }
  if (!["economy", "standard", "high", "ultimate"].includes(options.qualityMode)) {
    throw new Error("--quality must be economy, standard, high, or ultimate.");
  }
  if (!["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(options.ratio)) {
    throw new Error("--ratio must be adaptive, 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16.");
  }
  if (!["none", "native", "guided", "post", "hybrid"].includes(options.audioMode)) {
    throw new Error("--audio-mode must be none, native, guided, post, or hybrid.");
  }
  if (!Number.isFinite(options.maxCostUsd) || options.maxCostUsd < 0 || options.maxCostUsd > 500) {
    throw new Error("--max-cost-usd must be between 0 and 500.");
  }
  if (!Number.isFinite(options.atlasBillingEvidenceMaxAgeHours) || options.atlasBillingEvidenceMaxAgeHours <= 0) {
    throw new Error("--atlas-billing-evidence-max-age-hours must be a positive number.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 60_000 || options.timeoutMs > 21_600_000) {
    throw new Error("--timeout-ms must be an integer between 60000 and 21600000.");
  }
}

async function loadRuntimeModules() {
  const [
    seedanceSettings,
    renderValidation,
    readinessModule,
    preflightModule,
    normalizerModule,
    paidRenderModule,
    chunkingModule
  ] = await Promise.all([
    import("../dist/config/seedance-settings.js"),
    import("../dist/application/render-request-validation-entrypoint.js"),
    import("../dist/application/validation-readiness-report.js"),
    import("../dist/application/runtime-preflight.js"),
    import("../dist/application/render-request-normalizer.js"),
    import("../dist/application/paid-render-validation-entrypoint.js"),
    import("../dist/core/chunking.js")
  ]);
  return {
    normalizeSeedanceSettings: seedanceSettings.normalizeSeedanceSettings,
    validateRenderRequestFile: renderValidation.validateRenderRequestFile,
    Phase6ValidationReadinessReporter: readinessModule.Phase6ValidationReadinessReporter,
    RuntimePreflight: preflightModule.RuntimePreflight,
    normalizeRenderRequest: normalizerModule.normalizeRenderRequest,
    runPaidRenderValidationCli: paidRenderModule.runPaidRenderValidationCli,
    planDurationChunks: chunkingModule.planDurationChunks
  };
}

function readOrCreateRequest(options) {
  const absoluteRequestPath = resolve(repoRoot, options.requestPath);
  if (existsSync(absoluteRequestPath)) {
    const request = readJson(absoluteRequestPath);
    return {
      request,
      absoluteRequestPath,
      requestPath: toRepoRelative(absoluteRequestPath),
      created: false
    };
  }

  const request = {
    userInput: options.userInput,
    settings: {
      tier: options.tier,
      resolution: options.resolution,
      qualityMode: options.qualityMode,
      ratio: options.ratio,
      durationTargetSeconds: options.durationSeconds,
      audioMode: options.audioMode,
      watermark: false,
      returnLastFrame: true,
      maxCostUsd: options.maxCostUsd
    },
    outputPath: "business-readiness/long-form-final.mp4",
    workDirectory: "business-readiness/long-form-work",
    artifactDirectory: "business-readiness/long-form-artifacts"
  };
  mkdirSync(dirname(absoluteRequestPath), { recursive: true });
  writeFileSync(absoluteRequestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return {
    request,
    absoluteRequestPath,
    requestPath: toRepoRelative(absoluteRequestPath),
    created: true
  };
}

function normalizeRequest(request, modules) {
  return modules.normalizeRenderRequest(request, {
    env: process.env,
    requestId: request.metadata?.requestId
  });
}

function buildChunkPlan(modules, settings) {
  const chunks = modules.planDurationChunks({
    totalDurationSeconds: settings.durationTargetSeconds,
    qualityMode: settings.qualityMode,
    highRisk: settings.requiresStrictInspection
  });
  return {
    status: chunks.every((chunk) => chunk.durationSeconds >= 4 && chunk.durationSeconds <= 15)
      ? "pass"
      : "fail",
    totalDurationSeconds: settings.durationTargetSeconds,
    clipCount: chunks.length,
    minClipDurationSeconds: Math.min(...chunks.map((chunk) => chunk.durationSeconds)),
    maxClipDurationSeconds: Math.max(...chunks.map((chunk) => chunk.durationSeconds)),
    providerClipDurationSeconds: { min: 4, max: 15 },
    qualityMode: settings.qualityMode,
    requiresStrictInspection: settings.requiresStrictInspection,
    candidateCount: settings.candidateCount,
    repairAttemptCount: settings.repairAttemptCount,
    plannedCandidateRenderCount: chunks.length * settings.candidateCount,
    plannedRepairRenderCount: chunks.length * settings.repairAttemptCount,
    chunks: chunks.map((chunk) => ({
      index: chunk.index,
      startSecond: chunk.startSecond,
      endSecond: chunk.endSecond,
      durationSeconds: chunk.durationSeconds
    }))
  };
}

function checksForRequest(requestEvidence, settings, requestValidation) {
  return [
    requestEvidence.created
      ? pass("long_form_request_created", "Default long-form validation request was created.")
      : pass("long_form_request_loaded", "Operator long-form validation request was loaded."),
    requestValidation.status === "pass"
      ? pass("render_request_validation", "Long-form render request passes no-spend admission validation.")
      : fail("render_request_validation", requestValidation.issues?.[0]?.message ?? "Long-form render request validation failed."),
    settings.durationTargetSeconds >= 120 && settings.durationTargetSeconds <= 480
      ? pass("long_form_duration_target", `Long-form target duration is ${settings.durationTargetSeconds}s.`)
      : fail("long_form_duration_target", `Long-form target duration ${settings.durationTargetSeconds}s is outside 120-480s.`),
    settings.maxCostUsd !== undefined
      ? pass("request_cost_ceiling", `Render request has maxCostUsd ${formatUsd(settings.maxCostUsd)}.`)
      : fail("request_cost_ceiling", "Long-form validation request must include settings.maxCostUsd.")
  ];
}

function checksForReadiness(readiness, allowWarnings) {
  if (readiness.decision === "blocked") {
    return [fail("validation_readiness", `Readiness is blocked by: ${readiness.hardBlockers.join(", ") || "unknown"}.`)];
  }
  if (readiness.decision === "review_warnings" && !allowWarnings) {
    return [
      fail(
        "validation_readiness",
        `Readiness has warnings (${readiness.warnings.join(", ") || "unknown"}); rerun with --allow-warnings after operator acceptance.`
      )
    ];
  }
  if (readiness.decision === "review_warnings") {
    return [warn("validation_readiness", "Readiness warnings were explicitly allowed for this long-form validation.")];
  }
  return [pass("validation_readiness", "Readiness is ready_for_paid_validation.")];
}

function checksForBudget(costEstimate, maxCostUsd) {
  return [
    costEstimate.estimatedTotalCostUsd !== undefined && costEstimate.estimatedTotalCostUsd <= maxCostUsd
      ? pass("estimated_cost_budget", `Estimated long-form cost ${formatUsd(costEstimate.estimatedTotalCostUsd)} is within maxCostUsd ${formatUsd(maxCostUsd)}.`)
      : fail("estimated_cost_budget", `Estimated long-form cost ${formatUsd(costEstimate.estimatedTotalCostUsd)} exceeds maxCostUsd ${formatUsd(maxCostUsd)} or is unavailable.`)
  ];
}

function checksForChunkPlan(chunkPlan) {
  return [
    chunkPlan.status === "pass"
      ? pass("provider_safe_chunk_plan", `${chunkPlan.clipCount} planned clip(s) all stay inside 4-15s.`)
      : fail("provider_safe_chunk_plan", "Long-form chunk plan contains clip durations outside the provider-safe 4-15s range.")
  ];
}

async function runPaidLongFormValidation({ options, modules, requestPath, normalizedRequest }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Long-form validation timed out.")), options.timeoutMs);
  void controller;
  try {
    const paidArgs = [
      "--request",
      requestPath,
      "--output",
      resolve(repoRoot, options.paidReportPath),
      "--atlas-billing-report",
      resolve(repoRoot, options.atlasBillingReportPath),
      "--atlas-billing-evidence-max-age-hours",
      String(options.atlasBillingEvidenceMaxAgeHours),
      "--confirm-paid-spend",
      ...(options.allowWarnings ? ["--allow-warnings"] : [])
    ];
    const exitCode = await modules.runPaidRenderValidationCli(paidArgs, process.env);
    const paidReport = readJson(resolve(repoRoot, options.paidReportPath));
    const artifactEvidence = readArtifactEvidence({
      outputRoot: resolve(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables"),
      artifactDirectory: normalizedRequest.artifactDirectory,
      projectId: paidReport.artifactBundle?.projectId
    });
    const checks = checksForPaidEvidence(paidReport, artifactEvidence, exitCode);
    return {
      checks,
      paidRender: summarizePaidRender(paidReport, exitCode),
      artifactEvidence,
      ...(exitCode === 0 ? {} : { error: `Paid-render validation exited ${exitCode}.` })
    };
  } catch (error) {
    return {
      checks: [fail("long_form_paid_validation", redactText(error instanceof Error ? error.message : String(error)))],
      paidRender: emptyPaidRenderSummary(),
      artifactEvidence: emptyArtifactEvidence(),
      error: redactText(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checksForPaidEvidence(paidReport, artifactEvidence, exitCode) {
  const finalDuration = artifactEvidence.finalDurationSeconds;
  return [
    exitCode === 0 && (paidReport.status === "completed" || paidReport.status === "completed_with_artifact_validation_warning")
      ? pass("paid_render_completed", `Paid render validation completed with status ${paidReport.status}.`)
      : fail("paid_render_completed", `Paid render validation status is ${paidReport.status ?? "missing"}; exitCode=${exitCode}.`),
    paidReport.artifactValidation?.status === "pass"
      ? pass("artifact_validation", "Long-form artifact validation passed.")
      : paidReport.artifactValidation?.status === "warn"
        ? warn("artifact_validation", "Long-form artifact validation has warnings requiring operator review.")
        : fail("artifact_validation", `Long-form artifact validation status is ${paidReport.artifactValidation?.status ?? "missing"}.`),
    finalDuration !== undefined && finalDuration >= 120 && finalDuration <= 480
      ? pass("final_duration", `Final long-form duration is ${finalDuration}s.`)
      : fail("final_duration", `Final long-form duration is ${finalDuration ?? "missing"}; expected 120-480s.`),
    artifactEvidence.renderedShotCount > 0
      ? pass("rendered_shot_count", `Artifact evidence includes ${artifactEvidence.renderedShotCount} rendered shot(s).`)
      : fail("rendered_shot_count", "Artifact evidence does not include rendered shot count.")
  ];
}

function readArtifactEvidence({ outputRoot, artifactDirectory, projectId }) {
  if (!projectId) {
    return emptyArtifactEvidence();
  }
  const candidates = [];
  if (artifactDirectory) {
    candidates.push(resolve(artifactDirectory, sanitizePathSegment(projectId)));
  }
  candidates.push(...findArtifactDirectories(outputRoot, projectId));
  const artifactRoot = candidates.find((candidate) => existsSync(join(candidate, "manifest.json")));
  if (!artifactRoot) {
    return {
      ...emptyArtifactEvidence(),
      projectId,
      present: false,
      message: "No artifact manifest directory found for paid long-form project."
    };
  }
  const runSummary = readJsonIfExists(join(artifactRoot, "run-summary.json"));
  const manifestPath = join(artifactRoot, "manifest.json");
  const deliverablePath = join(artifactRoot, "deliverable.json");
  const deliverable = readJsonIfExists(deliverablePath);
  return {
    present: true,
    projectId,
    artifactRoot: evidencePathForArtifactRoot(artifactRoot, projectId),
    manifestSha256: sha256File(manifestPath),
    targetDurationSeconds: numberOrUndefined(runSummary?.targetDurationSeconds),
    finalDurationSeconds:
      numberOrUndefined(deliverable?.inspection?.metadata?.durationSeconds) ??
      numberOrUndefined(runSummary?.targetDurationSeconds),
    renderedShotCount: numberOrUndefined(runSummary?.renderedShotCount) ?? 0,
    compiledPromptCount: numberOrUndefined(runSummary?.compiledPromptCount) ?? 0,
    deliverablePresent: Boolean(deliverable),
    ...(deliverable ? { deliverableSha256: sha256File(deliverablePath) } : {}),
    deliveryGateStatus: typeof runSummary?.deliveryGateStatus === "string" ? runSummary.deliveryGateStatus : undefined,
    costGateStatus: typeof runSummary?.costGateStatus === "string" ? runSummary.costGateStatus : undefined
  };
}

function findArtifactDirectories(root, projectId) {
  const matches = [];
  const safeProjectId = sanitizePathSegment(projectId);
  const stack = [{ path: root, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || current.depth > 4 || !existsSync(current.path)) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childPath = join(current.path, entry.name);
      if (entry.name === safeProjectId && existsSync(join(childPath, "manifest.json"))) {
        matches.push(childPath);
      } else {
        stack.push({ path: childPath, depth: current.depth + 1 });
      }
    }
  }
  return matches.sort((left, right) => mtimeMs(right) - mtimeMs(left));
}

function buildReport({
  options,
  status,
  requestEvidence,
  requestValidation,
  readiness,
  durationSeconds,
  costEstimate,
  chunkPlan,
  checks,
  spendGate,
  atlasBillingGate,
  paidRender,
  artifactEvidence,
  manualQualityReview,
  error
}) {
  const finalDuration = artifactEvidence.finalDurationSeconds;
  const canUseAsBusinessReadinessLongFormEvidence =
    status === "pass" &&
    spendGate.providerSpendAllowed === true &&
    atlasBillingGate.canUseAsPrePaidAtlasBillingEvidence === true &&
    paidRender.status === "completed" &&
    paidRender.artifactValidationStatus === "pass" &&
    finalDuration !== undefined &&
    finalDuration >= 120 &&
    finalDuration <= 480 &&
    chunkPlan.status === "pass" &&
    artifactEvidence.renderedShotCount > 0 &&
    manualQualityReview.passed === true &&
    manualQualityReview.artifactBindingStatus === "matched";

  return {
    schemaVersion: "cinejelly.long-form-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins,
    atlasDocsEvidence,
    checkedInputs: {
      requestPath: requestEvidence.requestPath,
      requestCreated: requestEvidence.created,
      durationSeconds,
      outputPath: toRepoRelative(options.outputPath)
    },
    spendGate,
    atlasBillingGate: stripAtlasBillingGateChecks(atlasBillingGate),
    requestValidation: summarizeRequestValidation(requestValidation),
    readiness: summarizeReadiness(readiness, options.allowWarnings),
    costEstimate,
    chunkPlan,
    checks,
    paidRender,
    artifactEvidence,
    manualQualityReview,
    ...(error ? { error } : {}),
    releaseGateSummary: {
      canUseAsBusinessReadinessLongFormEvidence,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: canUseAsBusinessReadinessLongFormEvidence
        ? "Long-form evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
        : "Long-form paid validation evidence is incomplete."
    },
    nextActions: nextActionsFor(status, checks)
  };
}

function summarizeRequestValidation(report) {
  return {
    status: report.status,
    requestId: report.requestId,
    normalizedSummary: report.normalizedSummary,
    issueCount: report.issues?.length ?? 0,
    issues: report.issues ?? []
  };
}

function summarizeReadiness(readiness, allowWarnings) {
  return {
    decision: readiness.decision,
    preflightStatus: readiness.preflightStatus,
    checkCounts: readiness.checkCounts,
    hardBlockers: readiness.hardBlockers,
    warnings: readiness.warnings,
    allowWarnings
  };
}

function summarizePaidRender(report, exitCode) {
  return {
    status: report.status ?? "not_run",
    exitCode,
    requestId: report.requestId,
    artifactValidationStatus: report.artifactValidation?.status,
    costLedgerEntryCount: report.costLedgerEntryCount,
    estimatedCostUsd: report.estimatedCostUsd,
    actualCostUsd: report.actualCostUsd,
    projectId: report.artifactBundle?.projectId
  };
}

function emptyPaidRenderSummary() {
  return {
    status: "not_run",
    exitCode: undefined,
    artifactValidationStatus: undefined,
    costLedgerEntryCount: 0
  };
}

function emptyArtifactEvidence() {
  return {
    present: false,
    renderedShotCount: 0,
    compiledPromptCount: 0,
    deliverablePresent: false
  };
}

function readManualQualityReview(options) {
  if (!options.manualQualityReviewPath) {
    return {
      present: options.confirmManualQualityReview,
      ...(options.confirmManualQualityReview ? { source: "operator_flag" } : {}),
      passed: false,
      bindingMatched: false,
      artifactBindingStatus: options.confirmManualQualityReview ? "unbound_operator_flag" : "not_evaluated",
      message: options.confirmManualQualityReview
        ? "Operator flag was supplied without a manual review file bound to the paid artifact fingerprints."
        : "No manual long-form quality/redaction review evidence was supplied."
    };
  }
  const absolutePath = resolve(repoRoot, options.manualQualityReviewPath);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      passed: false,
      bindingMatched: false,
      artifactBindingStatus: "not_evaluated",
      path: toRepoRelative(options.manualQualityReviewPath),
      message: "Manual long-form review file does not exist."
    };
  }
  const text = readFileSync(absolutePath, "utf8");
  const parsed = parseManualQualityReviewJson(text);
  if (parsed) {
    const schemaSupported = parsed.schemaVersion === "cinejelly.long-form-manual-quality-review.v1";
    const templateOnly = parsed._templateOnly === true || parsed._doNotSubmitDirectly !== undefined;
    const qualityChecksAccepted = qualityChecksPassed(parsed.qualityChecks);
    const passed =
      schemaSupported &&
      !templateOnly &&
      parseReviewPass(parsed.decision ?? parsed.status ?? parsed.qualityReviewDecision) &&
      booleanOrPassString(parsed.redactionReviewPassed ?? parsed.redactionReview ?? parsed.redactionStatus) &&
      qualityChecksAccepted &&
      options.confirmManualQualityReview === true;
    return {
      present: true,
      source: "operator_review_json",
      path: toRepoRelative(options.manualQualityReviewPath),
      passed,
      bindingMatched: false,
      artifactBindingStatus: "not_evaluated",
      ...(safeFingerprint(parsed.reviewedProjectId ?? parsed.projectId) ? { reviewedProjectId: safeFingerprint(parsed.reviewedProjectId ?? parsed.projectId) } : {}),
      ...(safeSha256(parsed.reviewedManifestSha256 ?? parsed.manifestSha256) ? { reviewedManifestSha256: safeSha256(parsed.reviewedManifestSha256 ?? parsed.manifestSha256) } : {}),
      ...(safeSha256(parsed.reviewedDeliverableSha256 ?? parsed.deliverableSha256) ? { reviewedDeliverableSha256: safeSha256(parsed.reviewedDeliverableSha256 ?? parsed.deliverableSha256) } : {}),
      message: passed
        ? "Manual long-form review JSON contains a confirmed pass decision and redaction review."
        : manualQualityReviewJsonFailureMessage({ schemaSupported, templateOnly, qualityChecksAccepted, confirmManualQualityReview: options.confirmManualQualityReview })
    };
  }
  const normalized = text.toLowerCase();
  const textBinding = parseManualQualityReviewTextBinding(text);
  const passed =
    options.confirmManualQualityReview === true &&
    (
      normalized.includes("manual long-form review passes") ||
      normalized.includes("long-form quality review passes") ||
      (normalized.includes("decision") && normalized.includes("pass") && normalized.includes("redaction"))
    );
  return {
    present: true,
    source: "operator_review_text",
    path: toRepoRelative(options.manualQualityReviewPath),
    passed,
    bindingMatched: false,
    artifactBindingStatus: "not_evaluated",
    ...(textBinding.reviewedProjectId ? { reviewedProjectId: textBinding.reviewedProjectId } : {}),
    ...(textBinding.reviewedManifestSha256 ? { reviewedManifestSha256: textBinding.reviewedManifestSha256 } : {}),
    ...(textBinding.reviewedDeliverableSha256 ? { reviewedDeliverableSha256: textBinding.reviewedDeliverableSha256 } : {}),
    message: passed
      ? "Manual long-form review file contains a pass decision."
      : "Manual long-form review file does not contain a confirmed pass decision and redaction review."
  };
}

function bindManualQualityReviewToArtifact(review, artifactEvidence) {
  if (!review.present) {
    return review;
  }
  if (!artifactEvidence.present) {
    return {
      ...review,
      passed: false,
      bindingMatched: false,
      artifactBindingStatus: "missing_artifact_evidence",
      message: "Manual long-form review cannot be bound because paid artifact evidence is missing."
    };
  }
  if (review.source === "operator_flag") {
    return {
      ...review,
      passed: false,
      bindingMatched: false,
      artifactBindingStatus: "unbound_operator_flag",
      message: "Operator flag is not enough; provide a manual review file with project, manifest, and deliverable fingerprints."
    };
  }
  const requiredReviewBindingPresent =
    Boolean(review.reviewedProjectId) &&
    Boolean(review.reviewedManifestSha256) &&
    Boolean(review.reviewedDeliverableSha256);
  const artifactBindingPresent =
    Boolean(artifactEvidence.projectId) &&
    Boolean(artifactEvidence.manifestSha256) &&
    Boolean(artifactEvidence.deliverableSha256);
  if (!requiredReviewBindingPresent || !artifactBindingPresent) {
    return {
      ...review,
      passed: false,
      bindingMatched: false,
      artifactBindingStatus: "missing_review_binding",
      message: "Manual long-form review must include reviewedProjectId, reviewedManifestSha256, and reviewedDeliverableSha256 matching the paid artifact."
    };
  }
  const bindingMatched =
    review.reviewedProjectId === artifactEvidence.projectId &&
    review.reviewedManifestSha256 === artifactEvidence.manifestSha256 &&
    review.reviewedDeliverableSha256 === artifactEvidence.deliverableSha256;
  return {
    ...review,
    passed: review.passed === true && bindingMatched,
    bindingMatched,
    artifactBindingStatus: bindingMatched ? "matched" : "mismatch",
    message: bindingMatched
      ? "Manual long-form review is bound to the paid artifact project, manifest, and deliverable fingerprints."
      : "Manual long-form review fingerprints do not match the paid artifact evidence."
  };
}

function parseManualQualityReviewJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  try {
    const value = JSON.parse(trimmed);
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseManualQualityReviewTextBinding(text) {
  return {
    reviewedProjectId: safeFingerprint(captureKeyValue(text, "reviewedProjectId") ?? captureKeyValue(text, "projectId")),
    reviewedManifestSha256: safeSha256(captureKeyValue(text, "reviewedManifestSha256") ?? captureKeyValue(text, "manifestSha256")),
    reviewedDeliverableSha256: safeSha256(captureKeyValue(text, "reviewedDeliverableSha256") ?? captureKeyValue(text, "deliverableSha256"))
  };
}

function captureKeyValue(text, key) {
  const pattern = new RegExp(`(?:^|\\n)\\s*${key}\\s*[:=]\\s*([^\\s,;]+)`, "i");
  return text.match(pattern)?.[1];
}

function parseReviewPass(value) {
  if (value === true) {
    return true;
  }
  return typeof value === "string" && ["pass", "passed", "accepted"].includes(value.trim().toLowerCase());
}

function qualityChecksPassed(value) {
  if (value === undefined) {
    return false;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const checks = Object.values(value);
  return checks.length > 0 && checks.every((item) => item === true);
}

function manualQualityReviewJsonFailureMessage({ schemaSupported, templateOnly, qualityChecksAccepted, confirmManualQualityReview }) {
  if (!schemaSupported) {
    return "Manual long-form review JSON must use schemaVersion cinejelly.long-form-manual-quality-review.v1.";
  }
  if (templateOnly) {
    return "Manual long-form review JSON still contains template-only fields.";
  }
  if (!qualityChecksAccepted) {
    return "Manual long-form review JSON must mark every declared quality check true before it can pass.";
  }
  if (!confirmManualQualityReview) {
    return "Manual long-form review JSON requires --confirm-manual-quality-review after operator review.";
  }
  return "Manual long-form review JSON must pass quality and redaction review.";
}

function booleanOrPassString(value) {
  if (value === true) {
    return true;
  }
  return typeof value === "string" && ["pass", "passed", "accepted"].includes(value.trim().toLowerCase());
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

function safeFingerprint(value) {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,160}$/i.test(value.trim()) ? value.trim() : undefined;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function summarizeAtlasBillingGate(options, costEstimate) {
  const estimatedCostUsd = costEstimate.estimatedTotalCostUsd;
  const path = toRepoRelative(options.atlasBillingReportPath);
  const report = readJsonIfExists(resolve(repoRoot, options.atlasBillingReportPath));
  if (!report) {
    return {
      path,
      present: false,
      status: "missing",
      currentEstimatedCostUsd: estimatedCostUsd,
      currentMaxCostUsd: options.maxCostUsd,
      maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
      canUseAsPrePaidAtlasBillingEvidence: false,
      checks: [
        fail("atlas_billing_report_present", `Missing Atlas billing readiness report for long-form validation at ${path}. Run validation:atlas-billing with --planned-cost-usd ${formatNumber(estimatedCostUsd)} before paid render spend.`)
      ]
    };
  }

  const reportPlannedCostUsd = numberOrUndefined(report.checkedInputs?.plannedCostUsd ?? report.costPlan?.plannedCostUsd);
  const reportMaxBudgetUsd = numberOrUndefined(report.checkedInputs?.maxBudgetUsd ?? report.costPlan?.maxBudgetUsd);
  const reportGeneratedAt = typeof report.generatedAt === "string" ? report.generatedAt : undefined;
  const generatedAtMs = reportGeneratedAt ? Date.parse(reportGeneratedAt) : Number.NaN;
  const validGeneratedAt = Number.isFinite(generatedAtMs);
  const rawAgeHours = validGeneratedAt ? (Date.now() - generatedAtMs) / 3600000 : undefined;
  const reportAgeHours = typeof rawAgeHours === "number" && Number.isFinite(rawAgeHours) ? Math.max(0, rawAgeHours) : undefined;
  const clockSkewOk = typeof rawAgeHours === "number" && rawAgeHours >= -0.083333;
  const freshForPaidValidation = validGeneratedAt && clockSkewOk && reportAgeHours <= options.atlasBillingEvidenceMaxAgeHours;
  const schemaOk = report.schemaVersion === "cinejelly.atlas-billing-readiness.v1";
  const statusOk = report.status === "pass" && report.releaseGateSummary?.canUseAsPrePaidAtlasBillingEvidence === true;
  const networkOk =
    report.networkCallsMade === true &&
    report.providerCallsMade === false &&
    report.atlasBillingPublicApi?.captured === true &&
    report.atlasBillingPublicApi?.httpStatus === 200;
  const plannedCostMatches = moneyEquals(reportPlannedCostUsd, estimatedCostUsd);
  const budgetCoversMaxCost = typeof reportMaxBudgetUsd === "number" && reportMaxBudgetUsd >= options.maxCostUsd;
  const checks = [
    schemaOk
      ? pass("atlas_billing_report_schema", "Atlas billing readiness report schema is recognized.")
      : fail("atlas_billing_report_schema", "Atlas billing readiness report schemaVersion is missing or unrecognized."),
    freshForPaidValidation
      ? pass("atlas_billing_report_fresh", "Atlas billing readiness report is fresh enough for long-form paid render spend.")
      : fail("atlas_billing_report_fresh", atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours: options.atlasBillingEvidenceMaxAgeHours, estimatedCostUsd })),
    statusOk
      ? pass("atlas_billing_report_status", "Atlas billing readiness report passed.")
      : fail("atlas_billing_report_status", `Atlas billing readiness report status is ${report.status ?? "missing"}.`),
    networkOk
      ? pass("atlas_billing_report_balance_capture", "Atlas billing readiness report captured a no-spend /balance response.")
      : fail("atlas_billing_report_balance_capture", "Atlas billing readiness report did not capture a successful no-spend /balance response."),
    plannedCostMatches
      ? pass("atlas_billing_planned_cost_matches_long_form", `Atlas billing planned cost matches long-form estimate ${formatUsd(estimatedCostUsd)}.`)
      : fail("atlas_billing_planned_cost_matches_long_form", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} does not match current long-form estimate ${formatUsd(estimatedCostUsd)}.`),
    budgetCoversMaxCost
      ? pass("atlas_billing_budget_covers_long_form_cap", `Atlas billing approved budget covers long-form maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
      : fail("atlas_billing_budget_covers_long_form_cap", `Atlas billing approved budget ${formatUsd(reportMaxBudgetUsd)} does not cover long-form maxCostUsd ${formatUsd(options.maxCostUsd)}.`)
  ];
  return {
    path,
    present: true,
    schemaVersion: report.schemaVersion,
    status: String(report.status ?? "unknown"),
    reportGeneratedAt,
    maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
    reportAgeHours,
    freshForPaidValidation,
    reportPlannedCostUsd,
    currentEstimatedCostUsd: estimatedCostUsd,
    plannedCostMatchesCurrentRun: plannedCostMatches,
    reportMaxBudgetUsd,
    currentMaxCostUsd: options.maxCostUsd,
    budgetCoversMaxCost,
    networkCallsMade: report.networkCallsMade === true,
    canUseAsPrePaidAtlasBillingEvidence: checks.every((check) => check.status === "pass"),
    checks
  };
}

function atlasBillingFreshnessMessage({ reportGeneratedAt, validGeneratedAt, clockSkewOk, reportAgeHours, maxAgeHours, estimatedCostUsd }) {
  const command = `npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-long-form-budget-usd> --planned-cost-usd ${formatNumber(estimatedCostUsd)} --confirm-live-network`;
  if (!validGeneratedAt) {
    return `Atlas billing readiness report is missing a valid generatedAt timestamp. Rerun ${command}.`;
  }
  if (!clockSkewOk) {
    return `Atlas billing readiness report timestamp is in the future (${reportGeneratedAt}). Rerun ${command}.`;
  }
  return `Atlas billing readiness report is too old for long-form paid render spend: generatedAt ${reportGeneratedAt}, age ${formatHours(reportAgeHours)}, max age ${formatHours(maxAgeHours)}. Rerun ${command}.`;
}

function estimateCost(durationSeconds) {
  const renderCostUsdPerSecond = numberFromEnv("CINEJELLY_RENDER_COST_USD_PER_SECOND");
  const costBufferMultiplier = numberFromEnv("CINEJELLY_COST_BUFFER_MULTIPLIER") ?? 1;
  const estimatedTotalCostUsd =
    renderCostUsdPerSecond === undefined
      ? undefined
      : Number((durationSeconds * renderCostUsdPerSecond * costBufferMultiplier).toFixed(6));
  return {
    durationSeconds,
    renderCostUsdPerSecond,
    costBufferMultiplier,
    ...(estimatedTotalCostUsd !== undefined ? { estimatedTotalCostUsd } : {}),
    estimateAvailable: estimatedTotalCostUsd !== undefined
  };
}

function spendGate(options, costEstimate, providerSpendAllowed) {
  return {
    confirmPaidSpend: options.confirmPaidSpend,
    providerSpendAllowed,
    maxCostUsd: options.maxCostUsd,
    ...(costEstimate.estimatedTotalCostUsd !== undefined ? { estimatedTotalCostUsd: costEstimate.estimatedTotalCostUsd } : {})
  };
}

function nextActionsFor(status, checks) {
  if (status === "pass") {
    return [
      "Archive this long-form validation report with business-readiness evidence.",
      "Continue the remaining business-readiness gates before opening paid customer traffic."
    ];
  }
  if (status === "warn") {
    return ["Review long-form validation warnings and manual media quality before using this evidence commercially."];
  }
  const actions = checks.filter((check) => check.status === "fail").map((check) => check.message);
  actions.push("Do not count long-form rendering as business-ready evidence until this report status is pass.");
  return [...new Set(actions)];
}

function statusForChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function warn(name, message) {
  return { name, status: "warn", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function readJson(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return readJson(path);
  } catch {
    return undefined;
  }
}

function numberFromEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function moneyEquals(left, right) {
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 0.000001;
}

function sanitizePathSegment(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function formatUsd(value) {
  return value !== undefined && Number.isFinite(value) ? `$${Number(value).toFixed(6)}` : "unavailable";
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "0.000000";
}

function formatHours(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}h` : "unavailable";
}

function stripAtlasBillingGateChecks(gate) {
  const { checks, ...summary } = gate;
  return summary;
}

function redactText(value) {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}

function redactUnknown(value) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const redacted = redactUnknown(item);
        return [key, secretKeyPattern.test(key) && typeof redacted === "string" ? "[REDACTED]" : redacted];
      })
    );
  }
  return value;
}

function writeMaybe(options, report) {
  if (!options.writeReport) {
    return;
  }
  const absolutePath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(redactUnknown(report), null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

function evidencePathForArtifactRoot(path, projectId) {
  const absolutePath = resolve(repoRoot, path);
  if (absolutePath.startsWith(repoRoot)) {
    return absolutePath.slice(repoRoot.length + 1);
  }
  return `[configured-output-root]/${sanitizePathSegment(projectId)}`;
}

try {
  process.exitCode = await main();
} catch (error) {
  const report = {
    schemaVersion: "cinejelly.long-form-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
