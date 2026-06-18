import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  paidRenderReportPath: "assets/output_deliverables/phase6-validation/paid-render-report.json",
  benchmarkReportPath: "assets/output_deliverables/business-readiness/director-style-benchmark-report.json",
  outputPath: "assets/output_deliverables/business-readiness/director-style-review-drafts-report.json",
  draftDir: "assets/output_deliverables/business-readiness/director-review-drafts",
  checklistPath: "assets/output_deliverables/business-readiness/director-review-drafts/director-review-fillout-checklist.md"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
    ["--paid-render-report", "paidRenderReportPath"],
    ["--benchmark-report", "benchmarkReportPath"],
    ["--output", "outputPath"],
    ["--draft-dir", "draftDir"],
    ["--checklist", "checklistPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-drafts") {
      options.writeDrafts = false;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
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
  console.log(`Create artifact-bound Director-style review JSON drafts without network or provider calls.

Usage:
  npm.cmd run validation:quality-review-drafts
  npm.cmd run validation:quality-review-drafts -- --force

Options:
  --paid-render-report <path>  Paid render report with project/request/deliverable fingerprint.
                               Default: ${defaults.paidRenderReportPath}
  --benchmark-report <path>    Optional current quality benchmark report for checklist context.
                               Default: ${defaults.benchmarkReportPath}
  --draft-dir <path>           Directory for semantic/audio/runtime/governance draft JSON.
                               Default: ${defaults.draftDir}
  --checklist <path>           Markdown fill-out checklist path. Default: ${defaults.checklistPath}
  --output <path>              Draft generator report path. Default: ${defaults.outputPath}
  --force                      Overwrite existing draft/checklist files.
  --no-drafts                  Print/report only; do not write draft files.
  --no-output                  Print only; do not write the report.

Drafts are intentionally needs_review. A reviewer must inspect real paid media and update scores/statuses before these packets can satisfy quality benchmark parity rows.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const paidRead = readJson(options.paidRenderReportPath, true);
  const benchmarkRead = readJson(options.benchmarkReportPath, false);
  const artifactBinding = expectedArtifactBindingFor(paidRead.value);
  const bindingComplete = hasCompleteArtifactBinding(artifactBinding);
  const issues = [];
  if (paidRead.error) {
    issues.push(`Paid render report is invalid JSON: ${paidRead.error}.`);
  }
  if (!bindingComplete) {
    issues.push("Paid render report must contain artifactBundle.projectId, requestId, and a deliverable artifact SHA-256 before review drafts can be bound.");
  }

  const draftPlan = bindingComplete ? buildDraftPlan(artifactBinding, options.draftDir) : [];
  const writeResults = options.writeDrafts && bindingComplete
    ? writeDrafts(options, draftPlan)
    : [];
  issues.push(...writeResults.filter((item) => item.status === "blocked").map((item) => item.message));

  const checklist = options.writeDrafts && bindingComplete
    ? writeChecklist(options, { draftPlan, writeResults, benchmarkReport: benchmarkRead.value })
    : { written: false };
  if (checklist.status === "blocked") {
    issues.push(checklist.message);
  }

  const report = {
    schemaVersion: "cinejelly.director-style-review-drafts.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      paidRenderReportPath: toRepoRelative(options.paidRenderReportPath),
      benchmarkReportPath: toRepoRelative(options.benchmarkReportPath),
      draftDir: toRepoRelative(options.draftDir),
      checklistPath: toRepoRelative(options.checklistPath),
      writeDrafts: options.writeDrafts,
      force: options.force
    },
    artifactBinding: {
      complete: bindingComplete,
      ...(artifactBinding.projectId ? { projectId: artifactBinding.projectId } : {}),
      ...(artifactBinding.requestId ? { requestId: artifactBinding.requestId } : {}),
      ...(artifactBinding.deliverableSha256 ? { deliverableSha256: artifactBinding.deliverableSha256 } : {})
    },
    benchmarkContext: benchmarkContextFor(benchmarkRead.value),
    drafts: draftPlan.map((draft) => {
      const writeResult = writeResults.find((item) => item.kind === draft.kind);
      return {
        kind: draft.kind,
        path: toRepoRelative(draft.path),
        schemaVersion: draft.content.schemaVersion,
        reviewerType: draft.content.reviewerType,
        status: draft.content.status,
        checkpointCount: Array.isArray(draft.content.metrics)
          ? draft.content.metrics.length
          : Array.isArray(draft.content.checks)
            ? draft.content.checks.length
            : 0,
        artifactBindingComplete: bindingComplete,
        written: writeResult?.status === "written"
      };
    }),
    checklist: {
      path: toRepoRelative(options.checklistPath),
      written: checklist.written === true
    },
    issues,
    releaseGateSummary: {
      canUseDraftsAsAcceptedReviewEvidence: false,
      canRunQualityBenchmarkWithDrafts: options.writeDrafts &&
        issues.length === 0 &&
        draftPlan.length > 0 &&
        writeResults.every((item) => item.status === "written"),
      canClaimDirectorBenchParity: false,
      releaseBlocker: issues.length === 0
        ? "Drafts are artifact-bound but still need human or approved analyzer review before parity rows can pass."
        : "Review drafts could not be generated safely."
    },
    nextActions: nextActionsFor(options, draftPlan, issues)
  };

  if (options.writeReport) {
    writeJsonFile(options.outputPath, report, { force: true });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function buildDraftPlan(artifactBinding, draftDir) {
  return [
    draft(draftDir, "semantic", "director-style-semantic-review.draft.json", semanticDraft(artifactBinding)),
    draft(draftDir, "audio", "director-style-audio-review.draft.json", audioDraft(artifactBinding)),
    draft(draftDir, "runtime", "director-style-runtime-review.draft.json", runtimeDraft(artifactBinding)),
    draft(draftDir, "governance", "director-style-governance-review.draft.json", governanceDraft(artifactBinding))
  ];
}

function draft(draftDir, kind, filename, content) {
  return {
    kind,
    path: resolvePath(draftDir, filename),
    content
  };
}

function semanticDraft(artifactBinding) {
  return {
    schemaVersion: "cinejelly.director-style-semantic-review.v1",
    reviewerType: "manual",
    status: "needs_review",
    artifactBinding,
    metrics: [
      metric("script_video_fidelity", "Review whether the paid video faithfully follows the approved script and storyboard."),
      metric("user_demand_fulfillment", "Review whether the paid video satisfies the operator supplied user intent."),
      metric("temporal_coherence", "Review whether shot ordering and visible motion remain coherent across the full paid artifact."),
      metric("transition_quality", "Review visible cuts, scene changes, and transition boundaries for artifacts."),
      metric("lighting_consistency", "Review whether lighting and exposure stay coherent across adjacent shots."),
      metric("text_video_consistency", "Review whether visible text and visual content match the intended narrative.")
    ],
    findings: ["Draft only; update scores after inspecting the paid deliverable and benchmark evidence."]
  };
}

function audioDraft(artifactBinding) {
  return {
    schemaVersion: "cinejelly.director-style-audio-review.v1",
    reviewerType: "manual",
    status: "needs_review",
    artifactBinding,
    metrics: [
      metric("narration_reasonableness", "Review narration timing, naturalness, and emotional fit when narration exists."),
      metric("bgm_consistency", "Review background music mood, pacing, and volume balance when music exists."),
      metric("video_audio_consistency", "Review whether audio events align with visible motion and scene timing."),
      metric("text_audio_consistency", "Review whether spoken audio matches the intended script and narration plan.")
    ],
    findings: ["Draft only; use generated-audio validation and manual listening evidence before accepting audio parity."]
  };
}

function runtimeDraft(artifactBinding) {
  return {
    schemaVersion: "cinejelly.director-style-runtime-review.v1",
    reviewerType: "hybrid",
    status: "needs_review",
    artifactBinding,
    metrics: [
      metric("asr_transcript_alignment", "Review ASR transcript alignment against intended narration without storing raw transcript text in this packet."),
      metric("lip_sync_timing", "Review lip-sync or equivalent video-audio timing evidence for the paid deliverable.")
    ],
    findings: ["Draft only; attach accepted ASR or lip-sync analyzer evidence before accepting runtime parity."]
  };
}

function governanceDraft(artifactBinding) {
  return {
    schemaVersion: "cinejelly.director-style-governance-review.v1",
    reviewerType: "hybrid",
    status: "needs_review",
    artifactBinding,
    reviewedAt: new Date().toISOString(),
    checks: [
      check("directorbench_license_boundary", "Confirm the no-license DirectorBench snapshot was used only for behavior notes and not copied or executed."),
      check("upstream_code_reuse_boundary", "Confirm no upstream implementation code or prompts were imported into the commercial runtime."),
      check("runtime_evaluator_independence", "Confirm the evaluation packet was produced by CineJelly owned code or approved reviewer evidence."),
      check("evaluation_asset_permissions", "Confirm the paid media and review assets are approved for evaluation and archival.")
    ],
    findings: ["Draft only; legal or operator reviewer must accept every check before governance parity can pass."]
  };
}

function metric(metricName, evidenceSummary) {
  return {
    metricName,
    status: "needs_review",
    score: 0.5,
    confidence: 0.5,
    evidenceSummary
  };
}

function check(checkName, evidenceSummary) {
  return {
    checkName,
    status: "needs_review",
    evidenceSummary
  };
}

function writeDrafts(options, draftPlan) {
  return draftPlan.map((item) => {
    const target = item.path;
    if (existsSync(target) && !options.force) {
      return {
        kind: item.kind,
        status: "blocked",
        message: `Draft already exists at ${toRepoRelative(target)}; pass --force to overwrite.`
      };
    }
    writeJsonFile(target, item.content, { force: true });
    return {
      kind: item.kind,
      status: "written",
      message: `Wrote ${toRepoRelative(target)}.`
    };
  });
}

function writeChecklist(options, { draftPlan, writeResults, benchmarkReport }) {
  const target = resolvePath(options.checklistPath);
  if (existsSync(target) && !options.force) {
    return {
      written: false,
      status: "blocked",
      message: `Checklist already exists at ${toRepoRelative(target)}; pass --force to overwrite.`
    };
  }
  const nonMet = benchmarkContextFor(benchmarkReport).nonMetRequirementIds;
  const lines = [
    "# Director Review Fill-Out Checklist",
    "",
    "These drafts are artifact-bound but not accepted evidence yet.",
    "",
    "## Draft Files",
    "",
    ...draftPlan.map((item) => `- ${item.kind}: \`${toRepoRelative(item.path)}\``),
    "",
    "## Current Non-Met Benchmark Requirements",
    "",
    ...(nonMet.length > 0 ? nonMet.map((id) => `- ${id}`) : ["- No benchmark context was available." ]),
    "",
    "## Required Reviewer Actions",
    "",
    "- Inspect the paid deliverable and existing benchmark report.",
    "- Replace draft scores, confidence, statuses, and evidence summaries with real review evidence.",
    "- Keep `artifactBinding` unchanged unless a new paid render report is being reviewed.",
    "- Do not mark top-level status as `accepted` until every required metric or check has accepted evidence.",
    "- Run `npm.cmd run validation:quality-benchmark -- --semantic-review <semantic> --audio-review <audio> --runtime-review <runtime> --governance-review <governance>`.",
    "- Run `npm.cmd run validation:report-contracts` before using the review packet as release evidence.",
    "",
    "## Write Evidence",
    "",
    ...writeResults.map((item) => `- ${item.message}`)
  ];
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join("\n")}\n`, "utf8");
  return { written: true, status: "written" };
}

function benchmarkContextFor(report) {
  const requirements = Array.isArray(report?.parityEvidenceMatrix?.requirements)
    ? report.parityEvidenceMatrix.requirements
    : [];
  const nonMetRequirementIds = requirements
    .filter((item) => item?.status !== "met")
    .map((item) => String(item?.id ?? "unknown"))
    .filter((id) => /^[A-Za-z0-9_.:-]{1,120}$/.test(id));
  return {
    reportPresent: isRecord(report),
    status: typeof report?.status === "string" ? report.status : undefined,
    canClaimDirectorBenchParity: report?.summary?.canClaimDirectorBenchParity === true ? true : false,
    nonMetRequirementIds
  };
}

function expectedArtifactBindingFor(paidRenderReport) {
  const deliverable = Array.isArray(paidRenderReport?.artifactBundle?.entries)
    ? paidRenderReport.artifactBundle.entries.find((entry) => entry?.kind === "deliverable")
    : undefined;
  return {
    ...(safeIdentifier(paidRenderReport?.artifactBundle?.projectId) ? { projectId: paidRenderReport.artifactBundle.projectId.trim() } : {}),
    ...(safeIdentifier(paidRenderReport?.requestId) ? { requestId: paidRenderReport.requestId.trim() } : {}),
    ...(safeSha256(deliverable?.sha256) ? { deliverableSha256: deliverable.sha256.trim().toLowerCase() } : {})
  };
}

function hasCompleteArtifactBinding(value) {
  return safeIdentifier(value?.projectId) && safeIdentifier(value?.requestId) && safeSha256(value?.deliverableSha256);
}

function nextActionsFor(options, draftPlan, issues) {
  if (issues.length > 0) {
    return [
      "Fix the paid-render artifact fingerprint or rerun with --force if existing draft files should be overwritten."
    ];
  }
  if (!options.writeDrafts) {
    return [
      "Rerun without --no-drafts when operator-owned review draft files should be written.",
      "After drafts are written, have the reviewer inspect the paid deliverable and update every metric/check from needs_review to accepted or rejected."
    ];
  }
  const byKind = new Map(draftPlan.map((item) => [item.kind, toRepoRelative(item.path)]));
  return [
    "Have the reviewer inspect the paid deliverable and update every draft metric/check from needs_review to accepted or rejected.",
    `Run npm.cmd run validation:quality-benchmark -- --semantic-review ${byKind.get("semantic")} --audio-review ${byKind.get("audio")} --runtime-review ${byKind.get("runtime")} --governance-review ${byKind.get("governance")}.`,
    "Run npm.cmd run validation:report-contracts before using the review packets as benchmark evidence."
  ];
}

function readJson(path, required) {
  const absolutePath = resolvePath(path);
  if (!existsSync(absolutePath)) {
    if (required) {
      return { exists: false, error: `Missing file at ${toRepoRelative(path)}.` };
    }
    return { exists: false, value: undefined };
  }
  try {
    return { exists: true, value: JSON.parse(readFileSync(absolutePath, "utf8")) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeJsonFile(path, value) {
  const absolutePath = resolvePath(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim());
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function resolvePath(...parts) {
  const joined = parts.length === 1 ? String(parts[0]) : parts.join("/");
  return resolve(repoRoot, joined);
}

function toRepoRelative(path) {
  return relative(repoRoot, resolvePath(path)).replace(/\\/g, "/");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
