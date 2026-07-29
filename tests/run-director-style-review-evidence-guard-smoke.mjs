#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(".");
const outputPath = resolve(
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1] ?? ""
    : "assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json"
);
const paidRenderReportPath = resolve("assets/output_deliverables/phase6-validation/paid-render-report.json");
const workDir = resolve("assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke");
const safeDir = resolve(workDir, "safe");
const unsafeDir = resolve(workDir, "unsafe");
const safeReportPath = resolve(workDir, "safe-review-evidence-readiness-report.json");
const unsafeReportPath = resolve(workDir, "unsafe-review-evidence-readiness-report.json");
const unsafeNeedle = "https://review.example.invalid/frame.png?token=director_guard_secret";

// This guard validates review-evidence bindings AGAINST A REAL PAID-RENDER REPORT — it is a release
// gate that stays red BY DESIGN until `npm run validation:paid-render` has produced that evidence.
// Fail with a self-explaining report instead of a raw ENOENT stack (operability).
if (!existsSync(paidRenderReportPath)) {
  const blockedReport = {
    schemaVersion: "cinejelly.director-style-review-evidence-guard-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: "blocked_missing_paid_render_evidence",
    noSpend: true,
    message:
      "THIẾU BẰNG CHỨNG: chưa có assets/output_deliverables/phase6-validation/paid-render-report.json. " +
      "Đây là cổng phát hành — nó chỉ XANH sau khi chạy nghiệm thu tiền thật (npm run validation:paid-render, cần xác nhận chi phí). " +
      "Không phải lỗi code.",
    nextActions: [
      "Run `npm run validation:paid-render -- --request <request.json>` (paid, requires explicit confirmation) to produce the evidence this guard validates.",
      "Until then this suite failing is EXPECTED and correct — do not force it green."
    ]
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(blockedReport, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(blockedReport, null, 2));
  process.exit(1);
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(safeDir, { recursive: true });
mkdirSync(unsafeDir, { recursive: true });

const binding = expectedArtifactBindingFor(readJson(paidRenderReportPath));
const safeReviews = buildReviews(binding);
const safePaths = writeReviewBundle(safeDir, safeReviews);
const unsafeReviews = {
  ...safeReviews,
  semantic: {
    ...safeReviews.semantic,
    metrics: safeReviews.semantic.metrics.map((metric, index) =>
      index === 0
        ? { ...metric, evidenceSummary: `Unsafe reviewer note includes ${unsafeNeedle}` }
        : metric
    )
  }
};
const unsafePaths = writeReviewBundle(unsafeDir, unsafeReviews);

const safeRun = runValidator(safePaths, safeReportPath);
const unsafeRun = runValidator(unsafePaths, unsafeReportPath);
const safeReport = readJson(safeReportPath);
const unsafeReport = readJson(unsafeReportPath);
const publicPayload = JSON.stringify({ safeRun, unsafeRun, safeReport: publicReadiness(safeReport), unsafeReport: publicReadiness(unsafeReport) });
const checks = [
  check("safe_reviews_pass_readiness", safeRun.exitCode === 0 && safeReport.status === "pass"),
  check("unsafe_review_rejected", unsafeRun.exitCode === 1 && unsafeReport.status === "fail"),
  check("unsafe_review_schema_invalid", unsafeReport.reviews?.some((review) => review.kind === "semantic" && review.present === true && review.jsonValid === true && review.schemaValid === false)),
  check("unsafe_review_never_unlocks_evidence", unsafeReport.summary?.canUseAsAcceptedDirectorReviewEvidence === false && unsafeReport.releaseGateSummary?.canUseAsAcceptedDirectorReviewEvidence === false),
  check("guard_reports_do_not_echo_unsafe_url_or_token", !publicPayload.includes(unsafeNeedle) && !publicPayload.includes("director_guard_secret"))
];
const report = {
  schemaVersion: "cinejelly.director-style-review-evidence-guard-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.some((item) => item.status === "fail") ? "fail" : "pass",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: ["jiaminchen-1031/DirectorBench", "vericontext/vibeframe"],
  checkedInputs: {
    paidRenderReportPath: toRepoRelative(paidRenderReportPath),
    workDir: toRepoRelative(workDir),
    safeReportPath: toRepoRelative(safeReportPath),
    unsafeReportPath: toRepoRelative(unsafeReportPath),
    outputPath: toRepoRelative(outputPath)
  },
  summary: {
    safeExitCode: safeRun.exitCode,
    safeStatus: safeReport.status,
    unsafeExitCode: unsafeRun.exitCode,
    unsafeStatus: unsafeReport.status,
    unsafeSemanticSchemaValid: unsafeReport.reviews?.find((review) => review.kind === "semantic")?.schemaValid === true,
    canUseUnsafeAsAcceptedDirectorReviewEvidence: unsafeReport.summary?.canUseAsAcceptedDirectorReviewEvidence === true
  },
  safeReadiness: publicReadiness(safeReport),
  unsafeReadiness: publicReadiness(unsafeReport),
  checks,
  releaseGateSummary: {
    reviewEvidenceGuardPass: checks.every((item) => item.status === "pass"),
    canUseAsAcceptedDirectorReviewEvidence: false,
    canClaimDirectorBenchParity: false,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Guard smoke proves schema/redaction enforcement only; real accepted reviewer evidence and benchmark parity rows are still required."
  },
  nextActions: [
    "Keep running validation:quality-review-evidence before quality-benchmark when operator review packets are supplied.",
    "Do not accept structured review packets that fail schema/redaction guard checks."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  output: outputPath,
  checkCount: checks.length,
  failedCheckCount: checks.filter((item) => item.status === "fail").length
}, null, 2));

if (report.status === "fail") {
  process.exitCode = 1;
}

function runValidator(paths, reportPath) {
  const result = spawnSync(process.execPath, [
    "scripts/validate-director-style-review-evidence.mjs",
    "--paid-render-report",
    toRepoRelative(paidRenderReportPath),
    "--semantic-review",
    toRepoRelative(paths.semantic),
    "--audio-review",
    toRepoRelative(paths.audio),
    "--runtime-review",
    toRepoRelative(paths.runtime),
    "--governance-review",
    toRepoRelative(paths.governance),
    "--output",
    toRepoRelative(reportPath)
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });
  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? undefined
  };
}

function writeReviewBundle(dir, reviews) {
  const paths = {
    semantic: resolve(dir, "director-style-semantic-review.json"),
    audio: resolve(dir, "director-style-audio-review.json"),
    runtime: resolve(dir, "director-style-runtime-review.json"),
    governance: resolve(dir, "director-style-governance-review.json")
  };
  for (const [kind, path] of Object.entries(paths)) {
    writeFileSync(path, `${JSON.stringify(reviews[kind], null, 2)}\n`, "utf8");
  }
  return paths;
}

function buildReviews(binding) {
  return {
    semantic: {
      schemaVersion: "cinejelly.director-style-semantic-review.v1",
      reviewerType: "manual",
      status: "accepted",
      artifactBinding: binding,
      metrics: [
        semanticMetric("script_video_fidelity"),
        semanticMetric("user_demand_fulfillment"),
        semanticMetric("temporal_coherence"),
        semanticMetric("transition_quality"),
        semanticMetric("lighting_consistency"),
        semanticMetric("text_video_consistency")
      ],
      findings: ["Accepted aggregate semantic review evidence for guard smoke."]
    },
    audio: {
      schemaVersion: "cinejelly.director-style-audio-review.v1",
      reviewerType: "manual",
      status: "accepted",
      artifactBinding: binding,
      metrics: [
        audioMetric("narration_reasonableness"),
        audioMetric("bgm_consistency"),
        audioMetric("video_audio_consistency"),
        audioMetric("text_audio_consistency")
      ],
      findings: ["Accepted aggregate audio review evidence for guard smoke."]
    },
    runtime: {
      schemaVersion: "cinejelly.director-style-runtime-review.v1",
      reviewerType: "hybrid",
      status: "accepted",
      artifactBinding: binding,
      metrics: [
        runtimeMetric("asr_transcript_alignment"),
        runtimeMetric("lip_sync_timing")
      ],
      findings: ["Accepted aggregate runtime review evidence for guard smoke."]
    },
    governance: {
      schemaVersion: "cinejelly.director-style-governance-review.v1",
      reviewerType: "hybrid",
      status: "accepted",
      artifactBinding: binding,
      reviewedAt: "2026-06-19T02:00:00.000Z",
      checks: [
        governanceCheck("directorbench_license_boundary"),
        governanceCheck("upstream_code_reuse_boundary"),
        governanceCheck("runtime_evaluator_independence"),
        governanceCheck("evaluation_asset_permissions")
      ],
      findings: ["Accepted aggregate governance review evidence for guard smoke."]
    }
  };
}

function semanticMetric(metricName) {
  return metric(metricName, "Accepted aggregate semantic checkpoint evidence.");
}

function audioMetric(metricName) {
  return metric(metricName, "Accepted aggregate audio checkpoint evidence.");
}

function runtimeMetric(metricName) {
  return metric(metricName, "Accepted aggregate runtime checkpoint evidence.");
}

function metric(metricName, evidenceSummary) {
  return {
    metricName,
    status: "accepted",
    score: 0.86,
    confidence: 0.82,
    evidenceSummary
  };
}

function governanceCheck(checkName) {
  return {
    checkName,
    status: "accepted",
    reviewerType: "hybrid",
    evidenceSummary: "Accepted aggregate governance checkpoint evidence.",
    reviewedAt: "2026-06-19T02:00:00.000Z"
  };
}

function expectedArtifactBindingFor(report) {
  const deliverable = Array.isArray(report?.artifactBundle?.entries)
    ? report.artifactBundle.entries.find((entry) => entry?.kind === "deliverable")
    : undefined;
  const projectId = report?.artifactBundle?.projectId;
  const requestId = report?.requestId;
  const deliverableSha256 = deliverable?.sha256;
  if (!safeIdentifier(projectId) || !safeIdentifier(requestId) || !safeSha256(deliverableSha256)) {
    throw new Error("Paid render report does not expose a complete artifact binding for guard smoke.");
  }
  return {
    projectId: projectId.trim(),
    requestId: requestId.trim(),
    deliverableSha256: deliverableSha256.trim().toLowerCase()
  };
}

function publicReadiness(readiness) {
  return {
    status: readiness?.status,
    summary: readiness?.summary,
    reviews: Array.isArray(readiness?.reviews)
      ? readiness.reviews.map((review) => ({
          kind: review.kind,
          present: review.present,
          jsonValid: review.jsonValid,
          schemaValid: review.schemaValid,
          status: review.status,
          artifactBindingStatus: review.artifactBindingStatus,
          accepted: review.accepted,
          issueCount: Array.isArray(review.issues) ? review.issues.length : 0
        }))
      : []
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function check(name, pass) {
  return {
    name,
    status: pass ? "pass" : "fail",
    message: pass ? "Check passed." : "Check failed."
  };
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim());
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function toRepoRelative(value) {
  const resolved = resolve(value);
  const relative = resolved.startsWith(repoRoot)
    ? resolved.slice(repoRoot.length).replace(/^[/\\]/, "")
    : resolved;
  return relative.replace(/\\/g, "/");
}
