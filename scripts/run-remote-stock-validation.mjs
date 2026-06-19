import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/remote-stock-validation-report.json",
  query: "modern workspace desk lamp",
  aspectRatio: "16:9",
  resolution: "720p",
  minimumDurationSeconds: 4,
  targetDurationSeconds: 8,
  maxCandidates: 2,
  timeoutMs: 120_000
};

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Pexels API docs",
  "Pixabay API docs",
  "Coverr API docs"
];

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi
];
const secretKeyPattern = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

function parseArgs(args) {
  const options = {
    outputPath: defaults.outputPath,
    query: defaults.query,
    aspectRatio: defaults.aspectRatio,
    resolution: defaults.resolution,
    minimumDurationSeconds: defaults.minimumDurationSeconds,
    targetDurationSeconds: defaults.targetDurationSeconds,
    maxCandidates: defaults.maxCandidates,
    timeoutMs: defaults.timeoutMs,
    writeReport: true,
    confirmLiveNetwork: false,
    confirmCommercialTermsReviewed: false
  };

  const flagMap = new Map([
    ["--query", "query"],
    ["--aspect-ratio", "aspectRatio"],
    ["--resolution", "resolution"],
    ["--minimum-duration-seconds", "minimumDurationSeconds"],
    ["--target-duration-seconds", "targetDurationSeconds"],
    ["--max-candidates", "maxCandidates"],
    ["--timeout-ms", "timeoutMs"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--confirm-live-network") {
      options.confirmLiveNetwork = true;
      continue;
    }
    if (arg === "--confirm-commercial-terms-reviewed") {
      options.confirmCommercialTermsReviewed = true;
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
      const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = numericOption(key)
        ? Number.parseInt(value, 10)
        : value;
      index += equalsIndex >= 0 ? 0 : 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function numericOption(key) {
  return ["minimumDurationSeconds", "targetDurationSeconds", "maxCandidates", "timeoutMs"].includes(key);
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Run live remote-stock provider validation with an explicit network gate.

Usage:
  npm.cmd run validation:remote-stock -- --confirm-live-network --confirm-commercial-terms-reviewed

Options:
  --query <text>                         Search query. Default: ${defaults.query}
  --aspect-ratio <ratio>                 One of 21:9, 16:9, 4:3, 1:1, 3:4, 9:16. Default: ${defaults.aspectRatio}
  --resolution <value>                   480p, 720p, or 1080p. Default: ${defaults.resolution}
  --minimum-duration-seconds <seconds>   Required candidate duration. Default: ${defaults.minimumDurationSeconds}
  --target-duration-seconds <seconds>    Target candidate duration. Default: ${defaults.targetDurationSeconds}
  --max-candidates <count>               Max selected candidates per provider brief. Default: ${defaults.maxCandidates}
  --timeout-ms <ms>                      Abort live validation after this many ms. Default: ${defaults.timeoutMs}
  --confirm-live-network                 Required before calling Pexels, Pixabay, or Coverr.
  --confirm-commercial-terms-reviewed    Required to count provider output as commercial-readiness evidence.
  --output <path>                        JSON report path. Default: ${defaults.outputPath}
  --no-output                            Print only; do not write the report.

Without --confirm-live-network this command validates CLI inputs and writes a blocked_by_network_confirmation report without calling stock providers.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const inputChecks = [
    pass("validation_query", "Remote stock validation query is configured."),
    pass("output_report_path", "Output report path is JSON."),
    pass("material_brief_bounds", "Material brief duration and candidate bounds are positive.")
  ];

  if (!options.confirmLiveNetwork) {
    const report = buildReport({
      options,
      status: "blocked_by_network_confirmation",
      checks: [
        ...inputChecks,
        fail("network_confirmation", "--confirm-live-network is required before calling remote stock provider APIs.")
      ],
      liveNetworkGate: {
        confirmLiveNetwork: false,
        providerNetworkCallsAllowed: false,
        confirmCommercialTermsReviewed: options.confirmCommercialTermsReviewed
      },
      providerSummaries: [],
      materialValidation: emptyMaterialValidationSummary()
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const settingsEvidence = await loadRemoteStockSettingsEvidence();
  if (settingsEvidence.checks.some((check) => check.status === "fail")) {
    const report = buildReport({
      options,
      status: "blocked_by_configuration",
      checks: [...inputChecks, ...settingsEvidence.checks],
      liveNetworkGate: {
        confirmLiveNetwork: true,
        providerNetworkCallsAllowed: false,
        confirmCommercialTermsReviewed: options.confirmCommercialTermsReviewed
      },
      runtimeSettings: settingsEvidence.summary,
      providerSummaries: [],
      materialValidation: emptyMaterialValidationSummary()
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  let liveEvidence;
  try {
    liveEvidence = await runLiveValidation({ options, remoteStock: settingsEvidence.remoteStock });
  } catch (error) {
    const report = buildReport({
      options,
      status: "fail",
      checks: [
        ...inputChecks,
        ...settingsEvidence.checks,
        ...checksForCommercialTerms(options),
        fail("remote_stock_live_validation", redactText(error instanceof Error ? error.message : String(error)))
      ],
      liveNetworkGate: {
        confirmLiveNetwork: true,
        providerNetworkCallsAllowed: true,
        confirmCommercialTermsReviewed: options.confirmCommercialTermsReviewed
      },
      runtimeSettings: settingsEvidence.summary,
      providerSummaries: [],
      materialValidation: emptyMaterialValidationSummary(),
      error: redactText(error instanceof Error ? error.message : String(error))
    });
    writeMaybe(options, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }
  const checks = [
    ...inputChecks,
    ...settingsEvidence.checks,
    ...checksForCommercialTerms(options),
    ...liveEvidence.checks
  ];
  const status = statusForChecks(checks);
  const report = buildReport({
    options,
    status,
    checks,
    liveNetworkGate: {
      confirmLiveNetwork: true,
      providerNetworkCallsAllowed: true,
      confirmCommercialTermsReviewed: options.confirmCommercialTermsReviewed
    },
    runtimeSettings: settingsEvidence.summary,
    providerSummaries: liveEvidence.providerSummaries,
    materialValidation: liveEvidence.materialValidation,
    planSummary: liveEvidence.planSummary
  });
  writeMaybe(options, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  if (typeof options.query !== "string" || options.query.trim().length < 2 || options.query.length > 100) {
    throw new Error("--query must be a string between 2 and 100 characters.");
  }
  if (!["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(options.aspectRatio)) {
    throw new Error("--aspect-ratio must be one of 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16.");
  }
  if (!["480p", "720p", "1080p"].includes(options.resolution)) {
    throw new Error("--resolution must be 480p, 720p, or 1080p.");
  }
  for (const key of ["minimumDurationSeconds", "targetDurationSeconds", "maxCandidates"]) {
    if (!Number.isSafeInteger(options[key]) || options[key] <= 0) {
      throw new Error(`--${kebabCase(key)} must be a positive integer.`);
    }
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 300_000) {
    throw new Error("--timeout-ms must be an integer between 5000 and 300000.");
  }
}

async function loadRemoteStockSettingsEvidence() {
  try {
    const { loadRemoteStockRuntimeSettings } = await import("../dist/config/runtime-config.js");
    const remoteStock = loadRemoteStockRuntimeSettings(process.env);
    const checks = [];
    checks.push(
      remoteStock.enabled
        ? pass("remote_stock_enabled", "Remote stock material adapters are enabled.")
        : fail("remote_stock_enabled", "CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS must be true for live validation.")
    );
    checks.push(
      remoteStock.providers.length > 0
        ? pass("remote_stock_providers", `${remoteStock.providers.length} approved remote stock provider(s) configured.`)
        : fail("remote_stock_providers", "At least one approved Pexels, Pixabay, or Coverr provider key is required.")
    );
    return {
      remoteStock,
      checks,
      summary: {
        enabled: remoteStock.enabled,
        providerCount: remoteStock.providers.length,
        providers: remoteStock.providers.map((provider) => ({
          source: provider.source,
          apiKeyConfigured: true,
          commercialUseApproved: provider.source === "coverr" ? provider.commercialUseApproved === true : undefined,
          requestTimeoutMs: provider.requestTimeoutMs,
          maxResultsPerBrief: provider.maxResultsPerBrief
        }))
      }
    };
  } catch (error) {
    return {
      remoteStock: { enabled: false, providers: [] },
      checks: [fail("remote_stock_config", redactText(error instanceof Error ? error.message : String(error)))],
      summary: {
        enabled: false,
        providerCount: 0,
        error: redactText(error instanceof Error ? error.message : String(error))
      }
    };
  }
}

function checksForCommercialTerms(options) {
  return [
    options.confirmCommercialTermsReviewed
      ? pass("commercial_terms_reviewed", "Operator confirmed provider terms/commercial-use requirements were reviewed for this validation.")
      : fail("commercial_terms_reviewed", "--confirm-commercial-terms-reviewed is required before remote stock evidence can count for commercial readiness.")
  ];
}

async function runLiveValidation({ options, remoteStock }) {
  const [
    { RemoteStockMaterialAdapter },
    { MaterialSourceValidator }
  ] = await Promise.all([
    import("../dist/core/remote-stock-material-adapter.js"),
    import("../dist/core/material-source-validator.js")
  ]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Remote stock validation timed out.")), options.timeoutMs);
  const providerSummaries = [];
  const allCandidates = [];
  const plan = buildPlan(options, remoteStock.providers.map((provider) => provider.source));
  const validator = new MaterialSourceValidator();

  try {
    for (const provider of remoteStock.providers) {
      const providerPlan = buildPlan(options, [provider.source]);
      const adapter = new RemoteStockMaterialAdapter({ settings: provider });
      const startedAtMs = Date.now();
      const candidates = await adapter.resolve({ plan: providerPlan, signal: controller.signal });
      const validation = validator.validate({ plan: providerPlan, candidates });
      providerSummaries.push({
        source: provider.source,
        status: providerStatus(candidates, validation),
        durationMs: Date.now() - startedAtMs,
        candidateCount: candidates.length,
        selectedCandidateCount: candidates.filter((candidate) => candidate.selected).length,
        approvedCandidateCount: validation.approvedCandidateCount,
        validationStatus: validation.status,
        scoreSummary: summarizeCandidateEvaluations(validation.candidateEvaluations),
        issueCounts: countValidationIssues(validation.issues),
        sampleCandidates: sampleCandidates(candidates)
      });
      allCandidates.push(...candidates);
    }
  } finally {
    clearTimeout(timeout);
  }

  const materialValidation = validator.validate({ plan, candidates: allCandidates });
  return {
    checks: checksForLiveEvidence(providerSummaries, materialValidation),
    providerSummaries,
    materialValidation: summarizeMaterialValidation(materialValidation),
    planSummary: summarizePlan(plan)
  };
}

function buildPlan(options, sources) {
  const briefs = sources.map((source) => ({
    briefId: `remote_stock_validation_${source}`,
    projectId: "remote_stock_validation",
    shotId: `remote_stock_${source}`,
    purpose: "b_roll",
    queryTerms: [
      {
        term: options.query.trim(),
        weight: 1,
        reason: "operator validation query"
      }
    ],
    preferredSources: [source],
    aspectRatio: options.aspectRatio,
    resolution: options.resolution,
    minimumDurationSeconds: options.minimumDurationSeconds,
    targetDurationSeconds: options.targetDurationSeconds,
    maxCandidates: options.maxCandidates,
    rightsRequirement: "commercial_stock",
    allowRemoteSources: true
  }));
  return {
    planId: `remote_stock_validation_${sources.join("_") || "none"}`,
    projectId: "remote_stock_validation",
    sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo"],
    briefs
  };
}

function checksForLiveEvidence(providerSummaries, materialValidation) {
  const checks = [];
  for (const summary of providerSummaries) {
    checks.push(
      summary.candidateCount > 0
        ? pass(`provider.${summary.source}.candidates`, `${summary.source} returned ${summary.candidateCount} safe candidate(s).`)
        : fail(`provider.${summary.source}.candidates`, `${summary.source} returned no credential-free candidate videos for the validation query.`)
    );
    checks.push(
      summary.approvedCandidateCount > 0
        ? pass(`provider.${summary.source}.approved_candidates`, `${summary.source} produced approved/attribution-ready candidates.`)
        : fail(`provider.${summary.source}.approved_candidates`, `${summary.source} produced no approved or attribution-ready candidates.`)
    );
  }
  checks.push(
    materialValidation.status === "approved"
      ? pass("material_validation", "Combined remote stock material validation is approved.")
      : materialValidation.status === "review_required"
        ? warn("material_validation", "Combined remote stock material validation requires operator review.")
        : fail("material_validation", `Combined remote stock material validation status is ${materialValidation.status}.`)
  );
  return checks;
}

function providerStatus(candidates, validation) {
  if (candidates.length === 0 || validation.approvedCandidateCount === 0 || validation.status === "rejected") {
    return "fail";
  }
  if (validation.status === "review_required") {
    return "warn";
  }
  return "pass";
}

function summarizePlan(plan) {
  return {
    planId: plan.planId,
    projectId: plan.projectId,
    briefCount: plan.briefs.length,
    briefs: plan.briefs.map((brief) => ({
      briefId: brief.briefId,
      preferredSources: brief.preferredSources,
      aspectRatio: brief.aspectRatio,
      resolution: brief.resolution,
      minimumDurationSeconds: brief.minimumDurationSeconds,
      targetDurationSeconds: brief.targetDurationSeconds,
      maxCandidates: brief.maxCandidates,
      rightsRequirement: brief.rightsRequirement,
      allowRemoteSources: brief.allowRemoteSources
    }))
  };
}

function summarizeMaterialValidation(validation) {
  return {
    status: validation.status,
    planId: validation.planId,
    projectId: validation.projectId,
    candidateCount: validation.candidateCount,
    selectedCandidateCount: validation.selectedCandidateCount,
    approvedCandidateCount: validation.approvedCandidateCount,
    rejectedCandidateCount: validation.rejectedCandidateCount,
    candidateEvaluationCount: Array.isArray(validation.candidateEvaluations) ? validation.candidateEvaluations.length : 0,
    decisionCounts: countBy((validation.candidateEvaluations ?? []).map((item) => item.decision)),
    scoreSummary: summarizeCandidateEvaluations(validation.candidateEvaluations ?? []),
    issueCounts: countValidationIssues(validation.issues)
  };
}

function summarizeCandidateEvaluations(evaluations) {
  const scores = evaluations.map((item) => item.fitScore).filter((score) => typeof score === "number" && Number.isFinite(score));
  return {
    evaluationCount: evaluations.length,
    decisionCounts: countBy(evaluations.map((item) => item.decision)),
    minFitScore: scores.length > 0 ? Math.min(...scores) : 0,
    maxFitScore: scores.length > 0 ? Math.max(...scores) : 0,
    averageFitScore: scores.length > 0 ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2) : 0
  };
}

function countValidationIssues(issues) {
  return {
    total: issues.length,
    info: issues.filter((issue) => issue.severity === "info").length,
    warn: issues.filter((issue) => issue.severity === "warn").length,
    block: issues.filter((issue) => issue.severity === "block").length,
    codes: countBy(issues.map((issue) => issue.code))
  };
}

function sampleCandidates(candidates) {
  return candidates.slice(0, 3).map((candidate) => ({
    source: candidate.source,
    providerAssetId: candidate.providerAssetId,
    uriHost: hostFor(candidate.uri),
    sourcePageHost: candidate.sourcePageUrl ? hostFor(candidate.sourcePageUrl) : undefined,
    previewHost: candidate.previewUri ? hostFor(candidate.previewUri) : undefined,
    licenseLabel: candidate.licenseLabel,
    durationSeconds: candidate.durationSeconds,
    aspectRatio: candidate.aspectRatio,
    resolution: candidate.resolution,
    rightsStatus: candidate.rightsStatus,
    attributionPresent: Boolean(candidate.attribution?.trim())
  }));
}

function buildReport({
  options,
  status,
  checks,
  liveNetworkGate,
  runtimeSettings,
  providerSummaries,
  materialValidation,
  planSummary,
  error
}) {
  return {
    schemaVersion: "cinejelly.remote-stock-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    sourcePatternOrigins,
    checkedInputs: {
      query: options.query,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      minimumDurationSeconds: options.minimumDurationSeconds,
      targetDurationSeconds: options.targetDurationSeconds,
      maxCandidates: options.maxCandidates,
      outputPath: toRepoRelative(options.outputPath)
    },
    liveNetworkGate,
    checks,
    ...(runtimeSettings ? { runtimeSettings } : {}),
    ...(planSummary ? { planSummary } : {}),
    providers: providerSummaries,
    materialValidation,
    ...(error ? { error } : {}),
    releaseGateSummary: {
      canUseAsBusinessReadinessRemoteStockEvidence:
        status === "pass" &&
        liveNetworkGate.providerNetworkCallsAllowed === true &&
        liveNetworkGate.confirmCommercialTermsReviewed === true &&
        providerSummaries.length > 0 &&
        providerSummaries.every((provider) => provider.status === "pass") &&
        materialValidation.status === "approved",
      canOpenPaidCustomerTraffic: false,
      releaseBlocker:
        status === "pass"
          ? "Remote stock evidence alone is not customer-traffic approval; all other business-readiness gates must pass too."
          : "Live remote stock provider evidence is incomplete."
    },
    nextActions: nextActionsFor(status, checks)
  };
}

function emptyMaterialValidationSummary() {
  return {
    status: "planned_only",
    candidateCount: 0,
    selectedCandidateCount: 0,
    approvedCandidateCount: 0,
    rejectedCandidateCount: 0,
    candidateEvaluationCount: 0,
    decisionCounts: {},
    scoreSummary: {
      evaluationCount: 0,
      decisionCounts: {},
      minFitScore: 0,
      maxFitScore: 0,
      averageFitScore: 0
    },
    issueCounts: {
      total: 0,
      info: 0,
      warn: 0,
      block: 0,
      codes: {}
    }
  };
}

function nextActionsFor(status, checks) {
  if (status === "pass") {
    return [
      "Archive this remote stock validation report with business-readiness evidence.",
      "Continue the remaining business-readiness gates before opening paid customer traffic."
    ];
  }
  if (status === "warn") {
    return ["Review remote stock validation warnings before using provider candidates in commercial output."];
  }
  const actions = checks.filter((check) => check.status === "fail").map((check) => check.message);
  actions.push("Do not count remote stock material sourcing as business-ready evidence until this report status is pass.");
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

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function hostFor(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
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

try {
  process.exitCode = await main();
} catch (error) {
  const report = {
    schemaVersion: "cinejelly.remote-stock-validation.v1",
    generatedAt: new Date().toISOString(),
    status: "fail",
    error: redactText(error instanceof Error ? error.message : String(error))
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
}
