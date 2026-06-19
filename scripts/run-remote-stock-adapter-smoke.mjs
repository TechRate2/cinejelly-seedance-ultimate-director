import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json"
};

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Pexels API docs",
  "Pixabay API docs",
  "Coverr API docs"
];

const requiredScenarioNames = [
  "remote_disabled_skips_provider_fetch",
  "pexels_header_credentials_and_safe_candidate",
  "pixabay_key_query_not_artifact_candidate",
  "coverr_requires_commercial_approval",
  "coverr_approved_safe_candidate",
  "provider_error_returns_empty_candidates"
];

const fakeKeys = {
  pexels: "smoke-pexels-key-value",
  pixabay: "smoke-pixabay-key-value",
  coverr: "smoke-coverr-key-value"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([["--output", "outputPath"]]);
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
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      options[key] = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
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
  console.log(`Run CineJelly's no-spend remote-stock adapter smoke.

Usage:
  npm.cmd run validation:remote-stock-adapter-smoke

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write JSON.

This command uses fake provider payloads and fake fetch only. It performs no Pexels, Pixabay, Coverr, Atlas, deployment, source-video, or billing calls.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const { RemoteStockMaterialAdapter } = await import("../dist/core/remote-stock-material-adapter.js");
  const { MaterialSourceValidator } = await import("../dist/core/material-source-validator.js");

  const scenarioSummaries = [];
  scenarioSummaries.push(await runDisabledScenario(RemoteStockMaterialAdapter, MaterialSourceValidator));
  scenarioSummaries.push(await runPexelsScenario(RemoteStockMaterialAdapter, MaterialSourceValidator));
  scenarioSummaries.push(await runPixabayScenario(RemoteStockMaterialAdapter, MaterialSourceValidator));
  scenarioSummaries.push(await runCoverrApprovalScenario(RemoteStockMaterialAdapter));
  scenarioSummaries.push(await runCoverrApprovedScenario(RemoteStockMaterialAdapter, MaterialSourceValidator));
  scenarioSummaries.push(await runProviderErrorScenario(RemoteStockMaterialAdapter, MaterialSourceValidator));

  const adapterCandidates = scenarioSummaries.flatMap((scenario) => scenario.__candidates ?? []);
  const aggregatePlan = buildAggregatePlan();
  const aggregateValidation = new MaterialSourceValidator().validate({
    plan: aggregatePlan,
    candidates: adapterCandidates
  });

  const publicScenarios = scenarioSummaries.map(({ __candidates, ...scenario }) => scenario);
  const checks = buildChecks(publicScenarios, aggregateValidation);
  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const report = {
    schemaVersion: "cinejelly.remote-stock-adapter-smoke.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      syntheticProviderCount: 3,
      syntheticScenarioCount: publicScenarios.length,
      syntheticBriefCount: aggregatePlan.briefs.length,
      syntheticCandidateCount: adapterCandidates.length
    },
    summary: {
      scenarioCount: publicScenarios.length,
      passingScenarioCount: publicScenarios.filter((scenario) => scenario.status === "pass").length,
      failingScenarioCount: publicScenarios.filter((scenario) => scenario.status === "fail").length,
      syntheticFetchCallCount: publicScenarios.reduce((sum, scenario) => sum + scenario.syntheticFetchCallCount, 0),
      generatedCandidateCount: adapterCandidates.length,
      aggregateMaterialValidationStatus: aggregateValidation.status,
      aggregateApprovedCandidateCount: aggregateValidation.approvedCandidateCount
    },
    scenarioSummaries: publicScenarios,
    materialValidation: summarizeValidation(aggregateValidation),
    candidateSummaries: adapterCandidates.map(candidateSummary),
    candidateEvaluations: aggregateValidation.candidateEvaluations,
    checks,
    releaseGateSummary: {
      canUseAsRemoteStockAdapterBackendEvidence: status === "pass",
      canUseAsLiveRemoteStockEvidence: false,
      canOpenPaidCustomerTraffic: false,
      releaseBlocker: releaseBlockerForStatus(status)
    },
    nextActions: nextActionsForStatus(status)
  };

  const safetyCheck = reportSafetyCheck(report);
  report.checks = [...report.checks, safetyCheck];
  report.status = report.checks.every((check) => check.status === "pass") ? "pass" : "fail";
  report.summary.passingScenarioCount = report.scenarioSummaries.filter((scenario) => scenario.status === "pass").length;
  report.summary.failingScenarioCount = report.scenarioSummaries.filter((scenario) => scenario.status === "fail").length;
  report.releaseGateSummary.canUseAsRemoteStockAdapterBackendEvidence = report.status === "pass";
  report.releaseGateSummary.releaseBlocker = releaseBlockerForStatus(report.status);
  report.nextActions = nextActionsForStatus(report.status);

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  const adapterPath = resolve(repoRoot, "dist/core/remote-stock-material-adapter.js");
  const validatorPath = resolve(repoRoot, "dist/core/material-source-validator.js");
  if (!existsSync(adapterPath) || !existsSync(validatorPath)) {
    throw new Error("dist remote-stock adapter or material-source validator is missing. Run npm.cmd run build first.");
  }
}

async function runDisabledScenario(RemoteStockMaterialAdapter, MaterialSourceValidator) {
  const source = "pexels";
  const { fetchImpl, calls } = fakeFetch(() => responseJson({ videos: [] }));
  const adapter = new RemoteStockMaterialAdapter({
    settings: settingsFor(source),
    fetchImpl
  });
  const brief = briefFor(source, {
    briefId: "remote_stock_disabled_brief",
    allowRemoteSources: false
  });
  const plan = planFor([brief]);
  const candidates = await adapter.resolve({ plan });
  const validation = new MaterialSourceValidator().validate({ plan, candidates });
  return scenarioSummary({
    name: "remote_disabled_skips_provider_fetch",
    intent: "A brief with allowRemoteSources=false must skip provider search before any fetch call.",
    provider: source,
    calls,
    candidates,
    validation,
    extra: {
      providerSearchSkipped: calls.length === 0,
      materialValidatorAccepted: validation.status === "planned_only"
    },
    passWhen: candidates.length === 0 && calls.length === 0 && validation.status === "planned_only"
  });
}

async function runPexelsScenario(RemoteStockMaterialAdapter, MaterialSourceValidator) {
  const source = "pexels";
  const { fetchImpl, calls } = fakeFetch((url, init) => {
    return responseJson({
      videos: [
        {
          id: 101,
          duration: 8,
          url: "https://www.pexels.example/video/safe-workspace",
          image: "https://images.pexels.example/safe-workspace.jpg",
          user: { name: "Pexels Smoke Creator" },
          video_files: [
            {
              link: "https://videos.pexels.example/safe-workspace-1080p.mp4",
              width: 1920,
              height: 1080,
              quality: "hd"
            },
            {
              link: "https://videos.pexels.example/signed-workspace.mp4?token=should-not-survive",
              width: 1920,
              height: 1080,
              quality: "hd"
            },
            {
              link: "http://videos.pexels.example/http-workspace.mp4",
              width: 1920,
              height: 1080,
              quality: "hd"
            }
          ]
        },
        {
          id: 102,
          duration: 2,
          url: "https://www.pexels.example/video/too-short",
          image: "https://images.pexels.example/too-short.jpg",
          user: { name: "Short Clip Creator" },
          video_files: [
            {
              link: "https://videos.pexels.example/too-short.mp4",
              width: 1920,
              height: 1080,
              quality: "hd"
            }
          ]
        },
        {
          id: 103,
          duration: 9,
          url: "https://www.pexels.example/video/unsafe-only",
          image: "https://images.pexels.example/unsafe-only.jpg",
          user: { name: "Unsafe Clip Creator" },
          video_files: [
            {
              link: "https://videos.pexels.example/unsafe-only.mp4?signature=should-not-survive",
              width: 1920,
              height: 1080,
              quality: "hd"
            }
          ]
        }
      ]
    });
  });
  const adapter = new RemoteStockMaterialAdapter({ settings: settingsFor(source), fetchImpl });
  const brief = briefFor(source, { briefId: "remote_stock_pexels_brief" });
  const plan = planFor([brief]);
  const candidates = await adapter.resolve({ plan });
  const validation = new MaterialSourceValidator().validate({ plan, candidates });
  const call = calls[0];
  const providerAssetIds = new Set(candidates.map((candidate) => candidate.providerAssetId));
  const pexelsHeaderObserved = call?.authorizationHeaderMatchesKey === true;
  const pexelsKeyAbsentFromSearchUrl = call?.searchUrlContainsKey !== true;
  return scenarioSummary({
    name: "pexels_header_credentials_and_safe_candidate",
    intent: "Pexels credentials must stay in the Authorization header, unsafe/short results must be skipped, and one safe attributed candidate should pass validation.",
    provider: source,
    calls,
    candidates,
    validation,
    extra: {
      authorizationHeaderObserved: pexelsHeaderObserved,
      searchUrlKeyQueryObserved: false,
      outboundCredentialUsedOnlyForSearch: pexelsHeaderObserved && pexelsKeyAbsentFromSearchUrl,
      unsafeRenditionSkipped: allCredentialFreeHttps(candidates) && !providerAssetIds.has("103"),
      shortDurationSkipped: !providerAssetIds.has("102"),
      materialValidatorAccepted: validation.status === "approved"
    },
    passWhen:
      candidates.length === 1 &&
      providerAssetIds.has("101") &&
      pexelsHeaderObserved &&
      pexelsKeyAbsentFromSearchUrl &&
      allCredentialFreeHttps(candidates) &&
      allAttributionPreserved(candidates) &&
      validation.status === "approved"
  });
}

async function runPixabayScenario(RemoteStockMaterialAdapter, MaterialSourceValidator) {
  const source = "pixabay";
  const { fetchImpl, calls } = fakeFetch(() => {
    return responseJson({
      hits: [
        {
          id: 201,
          duration: 8,
          pageURL: "https://pixabay.example/videos/safe-stock-201",
          user: "Pixabay Smoke Creator",
          videos: {
            large: {
              url: "https://videos.pixabay.example/safe-stock-1080p.mp4",
              width: 1920,
              height: 1080,
              thumbnail: "https://images.pixabay.example/safe-stock.jpg"
            },
            medium: {
              url: "https://videos.pixabay.example/signed-stock.mp4?signature=should-not-survive",
              width: 1280,
              height: 720,
              thumbnail: "https://images.pixabay.example/signed-stock.jpg"
            }
          }
        },
        {
          id: 202,
          duration: 1,
          pageURL: "https://pixabay.example/videos/too-short-202",
          user: "Pixabay Short Creator",
          videos: {
            large: {
              url: "https://videos.pixabay.example/too-short.mp4",
              width: 1920,
              height: 1080,
              thumbnail: "https://images.pixabay.example/too-short.jpg"
            }
          }
        }
      ]
    });
  });
  const adapter = new RemoteStockMaterialAdapter({ settings: settingsFor(source), fetchImpl });
  const brief = briefFor(source, { briefId: "remote_stock_pixabay_brief" });
  const plan = planFor([brief]);
  const candidates = await adapter.resolve({ plan });
  const validation = new MaterialSourceValidator().validate({ plan, candidates });
  const call = calls[0];
  const providerAssetIds = new Set(candidates.map((candidate) => candidate.providerAssetId));
  const pixabayKeyObserved = call?.searchUrlContainsKey === true && call?.authorizationHeaderPresent !== true;
  return scenarioSummary({
    name: "pixabay_key_query_not_artifact_candidate",
    intent: "Pixabay can use an outbound search key, but that key and signed media URLs must not appear in adapter candidates or report artifacts.",
    provider: source,
    calls,
    candidates,
    validation,
    extra: {
      searchUrlKeyQueryObserved: pixabayKeyObserved,
      outboundCredentialUsedOnlyForSearch: pixabayKeyObserved && allCredentialFreeHttps(candidates),
      unsafeRenditionSkipped: allCredentialFreeHttps(candidates),
      shortDurationSkipped: !providerAssetIds.has("202"),
      materialValidatorAccepted: validation.status === "approved"
    },
    passWhen:
      candidates.length === 1 &&
      providerAssetIds.has("201") &&
      pixabayKeyObserved &&
      allCredentialFreeHttps(candidates) &&
      allAttributionPreserved(candidates) &&
      validation.status === "approved"
  });
}

async function runCoverrApprovalScenario(RemoteStockMaterialAdapter) {
  let thrownErrorRedacted;
  try {
    new RemoteStockMaterialAdapter({
      settings: {
        ...settingsFor("coverr"),
        commercialUseApproved: false
      },
      fetchImpl: async () => responseJson({ hits: [] })
    });
  } catch (error) {
    thrownErrorRedacted = redactError(error);
  }
  const passed = String(thrownErrorRedacted ?? "").includes("commercialUseApproved=true");
  return {
    name: "coverr_requires_commercial_approval",
    status: passed ? "pass" : "fail",
    intent: "Coverr must not be enabled without an explicit commercial-use approval setting.",
    provider: "coverr",
    syntheticFetchCallCount: 0,
    candidateCount: 0,
    materialValidationStatus: "planned_only",
    approvedCandidateCount: 0,
    rejectedCandidateCount: 0,
    onlyCredentialFreeHttpsCandidates: true,
    noCredentialMaterialized: true,
    candidateCountWithinBounds: true,
    attributionPreserved: false,
    outboundCredentialUsedOnlyForSearch: false,
    materialValidatorAccepted: false,
    coverrCommercialApprovalRequired: passed,
    thrownErrorRedacted
  };
}

async function runCoverrApprovedScenario(RemoteStockMaterialAdapter, MaterialSourceValidator) {
  const source = "coverr";
  const { fetchImpl, calls } = fakeFetch(() => {
    return responseJson({
      hits: [
        {
          id: "coverr-safe-301",
          duration: "00:00:08",
          url: "https://coverr.example/videos/safe-stock-301",
          poster: "https://images.coverr.example/safe-stock-301.jpg",
          title: "Safe Stock 301",
          urls: {
            mp4_download: "https://videos.coverr.example/safe-stock-301.mp4",
            mp4: "https://videos.coverr.example/signed-stock-301.mp4?sig=should-not-survive"
          }
        }
      ]
    });
  });
  const adapter = new RemoteStockMaterialAdapter({ settings: settingsFor(source), fetchImpl });
  const brief = briefFor(source, { briefId: "remote_stock_coverr_brief" });
  const plan = planFor([brief]);
  const candidates = await adapter.resolve({ plan });
  const validation = new MaterialSourceValidator().validate({ plan, candidates });
  const call = calls[0];
  const coverrBearerObserved = call?.authorizationBearerHeaderObserved === true;
  return scenarioSummary({
    name: "coverr_approved_safe_candidate",
    intent: "Coverr can emit attributed candidates only after commercial approval and only from credential-free HTTPS media URLs.",
    provider: source,
    calls,
    candidates,
    validation,
    extra: {
      authorizationHeaderObserved: coverrBearerObserved,
      outboundCredentialUsedOnlyForSearch: coverrBearerObserved,
      unsafeRenditionSkipped: allCredentialFreeHttps(candidates),
      materialValidatorAccepted: validation.status === "approved",
      coverrCommercialApprovalRequired: true
    },
    passWhen:
      candidates.length === 1 &&
      candidates[0]?.providerAssetId === "coverr-safe-301" &&
      coverrBearerObserved &&
      allCredentialFreeHttps(candidates) &&
      allAttributionPreserved(candidates) &&
      validation.status === "approved"
  });
}

async function runProviderErrorScenario(RemoteStockMaterialAdapter, MaterialSourceValidator) {
  const source = "pexels";
  const { fetchImpl, calls } = fakeFetch(() => ({
    ok: false,
    status: 503,
    async text() {
      return JSON.stringify({ error: "synthetic unavailable" });
    }
  }));
  const adapter = new RemoteStockMaterialAdapter({ settings: settingsFor(source), fetchImpl });
  const brief = briefFor(source, { briefId: "remote_stock_provider_error_brief" });
  const plan = planFor([brief]);
  const candidates = await adapter.resolve({ plan });
  const validation = new MaterialSourceValidator().validate({ plan, candidates });
  return scenarioSummary({
    name: "provider_error_returns_empty_candidates",
    intent: "Provider HTTP failures should fail closed as zero candidates without leaking provider response details into public evidence.",
    provider: source,
    calls,
    candidates,
    validation,
    extra: {
      providerFailureHandled: candidates.length === 0 && calls.length === 1,
      materialValidatorAccepted: validation.status === "planned_only"
    },
    passWhen: candidates.length === 0 && calls.length === 1 && validation.status === "planned_only"
  });
}

function scenarioSummary(input) {
  const candidateCount = input.candidates.length;
  const summary = {
    name: input.name,
    status: input.passWhen ? "pass" : "fail",
    intent: input.intent,
    provider: input.provider,
    syntheticFetchCallCount: input.calls.length,
    candidateCount,
    materialValidationStatus: input.validation.status,
    approvedCandidateCount: input.validation.approvedCandidateCount,
    rejectedCandidateCount: input.validation.rejectedCandidateCount,
    onlyCredentialFreeHttpsCandidates: allCredentialFreeHttps(input.candidates),
    noCredentialMaterialized: noCredentialMaterialized(input.candidates),
    candidateCountWithinBounds: candidateCount <= maxCandidatesForProvider(input.provider),
    attributionPreserved: candidateCount > 0 && allAttributionPreserved(input.candidates),
    outboundCredentialUsedOnlyForSearch: false,
    materialValidatorAccepted: input.validation.status === "approved",
    ...input.extra,
    candidateSummaries: input.candidates.map(candidateSummary),
    __candidates: input.candidates
  };
  return summary;
}

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const headerRecord = normalizeHeaders(init.headers);
    const authorization = headerRecord.get("authorization");
    const key = parsed.searchParams.get("key");
    calls.push({
      hostHash: digest(parsed.host),
      pathHash: digest(parsed.pathname),
      method: String(init.method ?? "GET"),
      authorizationHeaderPresent: Boolean(authorization),
      authorizationHeaderMatchesKey: authorization === fakeKeys.pexels,
      authorizationBearerHeaderObserved: authorization === `Bearer ${fakeKeys.coverr}`,
      searchUrlContainsKey: key === fakeKeys.pixabay,
      secretLikeQueryKeyCount: [...parsed.searchParams.keys()].filter((item) => /token|secret|signature|sig|password|credential|authorization|auth/i.test(item)).length
    });
    return handler(parsed, init);
  };
  return { fetchImpl, calls };
}

function normalizeHeaders(headers) {
  const record = new Map();
  if (!headers) {
    return record;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => record.set(key.toLowerCase(), value));
    return record;
  }
  for (const [key, value] of Object.entries(headers)) {
    record.set(key.toLowerCase(), String(value));
  }
  return record;
}

function responseJson(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function settingsFor(source) {
  return {
    source,
    apiKey: fakeKeys[source],
    ...(source === "coverr" ? { commercialUseApproved: true } : {}),
    requestTimeoutMs: 5_000,
    maxResultsPerBrief: 1
  };
}

function briefFor(source, overrides = {}) {
  return {
    briefId: `${source}_smoke_brief`,
    projectId: "remote_stock_adapter_smoke",
    shotId: `${source}_smoke_shot`,
    purpose: "b_roll",
    queryTerms: [
      { term: "clean studio workspace", weight: 1, reason: "adapter smoke weighted search" },
      { term: "unsafe token bait", weight: 0.1, reason: "adapter smoke sanitization coverage" }
    ],
    preferredSources: [source],
    aspectRatio: "16:9",
    resolution: "1080p",
    minimumDurationSeconds: 4,
    targetDurationSeconds: 8,
    maxCandidates: 1,
    rightsRequirement: "commercial_stock",
    allowRemoteSources: true,
    ...overrides
  };
}

function planFor(briefs) {
  return {
    planId: "remote_stock_adapter_smoke_plan",
    projectId: "remote_stock_adapter_smoke",
    sourcePatternOrigins,
    briefs
  };
}

function buildAggregatePlan() {
  return planFor([
    briefFor("pexels", { briefId: "remote_stock_pexels_brief" }),
    briefFor("pixabay", { briefId: "remote_stock_pixabay_brief" }),
    briefFor("coverr", { briefId: "remote_stock_coverr_brief" })
  ]);
}

function maxCandidatesForProvider(provider) {
  return provider === "coverr" || provider === "pixabay" || provider === "pexels" ? 1 : 0;
}

function summarizeValidation(validation) {
  const fitScores = validation.candidateEvaluations.map((item) => item.fitScore);
  return {
    status: validation.status,
    planId: validation.planId,
    projectId: validation.projectId,
    candidateCount: validation.candidateCount,
    selectedCandidateCount: validation.selectedCandidateCount,
    approvedCandidateCount: validation.approvedCandidateCount,
    rejectedCandidateCount: validation.rejectedCandidateCount,
    candidateEvaluationCount: validation.candidateEvaluations.length,
    decisionCounts: countBy(validation.candidateEvaluations, (item) => item.decision),
    issueCounts: countBy(validation.issues, (item) => item.severity),
    issueCodeCounts: countBy(validation.issues, (item) => item.code),
    minFitScore: fitScores.length > 0 ? Math.min(...fitScores) : 0,
    maxFitScore: fitScores.length > 0 ? Math.max(...fitScores) : 0
  };
}

function countBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = String(keyFn(item));
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function candidateSummary(candidate) {
  return {
    candidateId: candidate.candidateId,
    briefId: candidate.briefId,
    source: candidate.source,
    providerAssetId: candidate.providerAssetId ?? "missing",
    uriFingerprint: digest(candidate.uri),
    sourcePageUrlPresent: Boolean(candidate.sourcePageUrl),
    previewUriPresent: Boolean(candidate.previewUri),
    licenseLabelPresent: Boolean(candidate.licenseLabel),
    durationSeconds: candidate.durationSeconds ?? 0,
    aspectRatio: candidate.aspectRatio ?? "unknown",
    resolution: candidate.resolution ?? "unknown",
    rightsStatus: candidate.rightsStatus,
    attributionPresent: Boolean(candidate.attribution?.trim()),
    selected: candidate.selected
  };
}

function buildChecks(scenarios, aggregateValidation) {
  const scenarioByName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
  const checks = [
    requiredScenarioNames.every((name) => scenarioByName.has(name))
      ? pass("scenario_coverage", "Remote-stock adapter smoke covers disabled, Pexels, Pixabay, Coverr approval, Coverr success, and provider failure cases.")
      : fail("scenario_coverage", "Remote-stock adapter smoke is missing one or more required scenarios."),
    scenarios.every((scenario) => scenario.status === "pass")
      ? pass("scenario_passes", "Every remote-stock adapter smoke scenario passed.")
      : fail("scenario_passes", "One or more remote-stock adapter smoke scenarios failed."),
    aggregateValidation.status === "approved" && aggregateValidation.candidateCount === 3
      ? pass("aggregate_material_validation", "Adapter candidates from Pexels, Pixabay, and Coverr pass MaterialSourceValidator as commercial stock with attribution.")
      : fail("aggregate_material_validation", `Expected approved aggregate material validation with 3 candidates; got ${aggregateValidation.status}/${aggregateValidation.candidateCount}.`),
    aggregateValidation.candidateEvaluations.every((item) => item.decision === "approved" && item.fitScore >= 80 && item.fitScore <= 100)
      ? pass("aggregate_scoring_bounds", "Every aggregate candidate evaluation is approved with a bounded 0-100 fit score.")
      : fail("aggregate_scoring_bounds", "Aggregate candidate scoring must be approved and bounded."),
    scenarios.every((scenario) => scenario.noCredentialMaterialized && scenario.onlyCredentialFreeHttpsCandidates)
      ? pass("candidate_uri_safety", "No scenario materialized credential-bearing or non-HTTPS candidate URIs.")
      : fail("candidate_uri_safety", "One or more scenarios emitted unsafe candidate URI evidence."),
    scenarioByName.get("remote_disabled_skips_provider_fetch")?.syntheticFetchCallCount === 0
      ? pass("disabled_skip", "Disabled remote-source brief skipped provider fetch.")
      : fail("disabled_skip", "Disabled remote-source brief should not call provider fetch."),
    scenarioByName.get("coverr_requires_commercial_approval")?.coverrCommercialApprovalRequired === true
      ? pass("coverr_commercial_approval", "Coverr constructor requires explicit commercialUseApproved=true.")
      : fail("coverr_commercial_approval", "Coverr should be blocked without explicit commercial approval."),
    scenarioByName.get("provider_error_returns_empty_candidates")?.providerFailureHandled === true
      ? pass("provider_error_fail_closed", "Provider HTTP failure returned zero candidates without throwing public raw payloads.")
      : fail("provider_error_fail_closed", "Provider HTTP failure should fail closed as zero candidates.")
  ];
  return checks;
}

function reportSafetyCheck(report) {
  const text = JSON.stringify(report);
  const leakedFakeKey = Object.values(fakeKeys).some((key) => text.includes(key));
  const leakedRawUrl = /https?:\/\/|asset:\/\//i.test(text);
  const leakedSecretQuery = /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|sig|auth)=)|Bearer\s+[A-Za-z0-9._-]{12,}/i.test(text);
  return !leakedFakeKey && !leakedRawUrl && !leakedSecretQuery
    ? pass("report_redaction", "Public smoke report contains no fake keys, raw URLs, asset URIs, authorization header values, or secret-like query text.")
    : fail("report_redaction", "Public smoke report must not contain fake keys, raw URLs, asset URIs, bearer headers, or secret-like query text.");
}

function allCredentialFreeHttps(candidates) {
  return candidates.every((candidate) => isCredentialFreeHttps(candidate.uri) &&
    (!candidate.sourcePageUrl || isCredentialFreeHttps(candidate.sourcePageUrl)) &&
    (!candidate.previewUri || isCredentialFreeHttps(candidate.previewUri)));
}

function isCredentialFreeHttps(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return false;
  }
  return [...parsed.searchParams.keys()].every((key) => !/api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|sig|auth/i.test(key));
}

function noCredentialMaterialized(candidates) {
  const text = JSON.stringify(candidates);
  return !Object.values(fakeKeys).some((key) => text.includes(key)) &&
    !/([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization|sig|auth)=)|Bearer\s+[A-Za-z0-9._-]{12,}/i.test(text);
}

function allAttributionPreserved(candidates) {
  return candidates.every((candidate) => candidate.rightsStatus === "requires_attribution" && Boolean(candidate.attribution?.trim()));
}

function redactError(error) {
  return String(error instanceof Error ? error.message : error)
    .replaceAll(fakeKeys.pexels, "[redacted]")
    .replaceAll(fakeKeys.pixabay, "[redacted]")
    .replaceAll(fakeKeys.coverr, "[redacted]")
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted-url]");
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function releaseBlockerForStatus(status) {
  return status === "pass"
    ? "Remote-stock adapter smoke passes; live provider validation with real approved provider terms is still required before business-readiness remote-stock evidence can pass."
    : "Remote-stock adapter smoke failed; fix adapter normalization, credential redaction, or material validation behavior before trusting this backend path.";
}

function nextActionsForStatus(status) {
  return status === "pass"
    ? [
        "Keep this smoke passing before claiming MoneyPrinterTurbo-style remote-stock adapter parity.",
        "Run validation:remote-stock with explicit live-network and commercial-terms confirmations when live provider evidence is needed."
      ]
    : ["Fix failing remote-stock adapter smoke scenarios before launch-doctor can trust this backend path."];
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${redactError(error)}\n`);
  process.exitCode = 1;
}
