import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json"
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
  console.log(`Run CineJelly's no-spend material-source scoring smoke.

Usage:
  npm.cmd run validation:material-source-scoring

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write JSON.

This command reads no external URLs and makes no provider, stock, Atlas, or deployment calls.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const { MaterialSourceValidator } = await import("../dist/core/material-source-validator.js");
  const validator = new MaterialSourceValidator();
  const plan = buildPlan();
  const candidates = buildCandidates();
  const validation = validator.validate({ plan, candidates });
  const checks = buildChecks(validation);
  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const report = {
    schemaVersion: "cinejelly.material-source-scoring-smoke.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins: [
      "harry0703/MoneyPrinterTurbo",
      "vericontext/vibeframe",
      "calesthio/OpenMontage"
    ],
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      syntheticBriefCount: plan.briefs.length,
      syntheticCandidateCount: candidates.length
    },
    materialValidation: summarizeValidation(validation),
    candidateEvaluations: validation.candidateEvaluations,
    checks,
    releaseGateSummary: {
      canUseAsMaterialScoringBackendEvidence: status === "pass",
      canUseAsLiveRemoteStockEvidence: false,
      releaseBlocker: status === "pass"
        ? "Material-source scoring smoke passes; live provider evidence is still required for remote-stock business readiness."
        : "Material-source scoring smoke failed and must be fixed before trusting material-source artifacts."
    },
    nextActions: status === "pass"
      ? ["Keep this smoke passing before claiming OpenMontage-style provider scoring parity."]
      : ["Fix material-source scoring, evaluation counts, or decision coverage before launch-doctor can trust source-material evidence."]
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  const distPath = resolve(repoRoot, "dist/core/material-source-validator.js");
  if (!existsSync(distPath)) {
    throw new Error("dist/core/material-source-validator.js is missing. Run npm.cmd run build first.");
  }
}

function buildPlan() {
  return {
    planId: "material_source_scoring_smoke_plan",
    projectId: "material_source_scoring_smoke",
    sourcePatternOrigins: [
      "harry0703/MoneyPrinterTurbo",
      "vericontext/vibeframe",
      "calesthio/OpenMontage"
    ],
    briefs: [
      {
        briefId: "smoke_remote_stock",
        projectId: "material_source_scoring_smoke",
        shotId: "shot_remote_stock",
        purpose: "b_roll",
        queryTerms: [{ term: "modern workspace desk lamp", weight: 1, reason: "scoring smoke query" }],
        preferredSources: ["pexels"],
        aspectRatio: "16:9",
        resolution: "1080p",
        minimumDurationSeconds: 4,
        targetDurationSeconds: 8,
        maxCandidates: 1,
        rightsRequirement: "commercial_stock",
        allowRemoteSources: true
      },
      {
        briefId: "smoke_local_vertical",
        projectId: "material_source_scoring_smoke",
        shotId: "shot_local_vertical",
        purpose: "product_plate",
        queryTerms: [{ term: "vertical product plate", weight: 1, reason: "scoring smoke query" }],
        preferredSources: ["local_library", "user_provided"],
        aspectRatio: "9:16",
        resolution: "1080p",
        minimumDurationSeconds: 5,
        targetDurationSeconds: 10,
        maxCandidates: 1,
        rightsRequirement: "user_owned",
        allowRemoteSources: false
      }
    ]
  };
}

function buildCandidates() {
  return [
    {
      candidateId: "candidate_remote_approved",
      briefId: "smoke_remote_stock",
      source: "pexels",
      uri: "https://media.example.test/approved-workspace-1080p.mp4",
      providerAssetId: "pexels-approved-1",
      sourcePageUrl: "https://www.pexels.com/video/approved-workspace",
      previewUri: "https://images.example.test/approved-workspace.jpg",
      licenseLabel: "Pexels API Guidelines",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "1080p",
      rightsStatus: "requires_attribution",
      attribution: "Video by Example Creator on Pexels",
      selected: true
    },
    {
      candidateId: "candidate_local_review_required",
      briefId: "smoke_local_vertical",
      source: "local_library",
      uri: "asset://local-product-plate",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      rightsStatus: "approved",
      selected: true
    },
    {
      candidateId: "candidate_remote_rejected",
      briefId: "smoke_remote_stock",
      source: "pexels",
      uri: "https://media.example.test/rejected.mp4?token=redacted",
      providerAssetId: "pexels-rejected-1",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "1080p",
      rightsStatus: "rejected",
      selected: false
    }
  ];
}

function buildChecks(validation) {
  const decisions = new Set(validation.candidateEvaluations.map((item) => item.decision));
  const text = JSON.stringify({ candidateEvaluations: validation.candidateEvaluations });
  return [
    validation.status === "rejected"
      ? pass("expected_rejected_fixture", "Synthetic fixture remains rejected because one candidate has blocking issues.")
      : fail("expected_rejected_fixture", `Expected rejected validation status, got ${validation.status}.`),
    validation.candidateEvaluations.length === validation.candidateCount
      ? pass("evaluation_count", "Every candidate has one scoring evaluation.")
      : fail("evaluation_count", "Candidate evaluation count does not match candidateCount."),
    decisions.has("approved") && decisions.has("review_required") && decisions.has("rejected")
      ? pass("decision_coverage", "Scoring smoke covers approved, review_required, and rejected decisions.")
      : fail("decision_coverage", "Scoring smoke must cover approved, review_required, and rejected decisions."),
    validation.candidateEvaluations.every((item) => item.fitScore >= 0 && item.fitScore <= item.maxFitScore && item.maxFitScore === 100)
      ? pass("score_range", "All material fit scores are bounded from 0 to 100.")
      : fail("score_range", "One or more material fit scores are outside the 0-100 range."),
    !/https?:\/\/|token=|asset:\/\//i.test(text)
      ? pass("secret_free_evaluations", "Candidate evaluations contain score evidence without raw candidate URIs.")
      : fail("secret_free_evaluations", "Candidate evaluations must not include raw candidate URIs or token-looking text.")
  ];
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
    decisionCounts: countBy(validation.candidateEvaluations.map((item) => item.decision)),
    issueCounts: countBy(validation.issues.map((issue) => issue.severity)),
    issueCodeCounts: countBy(validation.issues.map((issue) => issue.code)),
    minFitScore: fitScores.length > 0 ? Math.min(...fitScores) : 0,
    maxFitScore: fitScores.length > 0 ? Math.max(...fitScores) : 0
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = String(value ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const relativePath = absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
  return relativePath || path;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
