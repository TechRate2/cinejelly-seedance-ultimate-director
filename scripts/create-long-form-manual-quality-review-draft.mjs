#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  longFormReportPath: "assets/output_deliverables/business-readiness/long-form-validation-report.json",
  evidencePath: "ops/long-form-manual-quality-review.json",
  outputPath: "assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/long-form-manual-quality-review.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/long-form-manual-quality-review-fillout-checklist.md"
};

const sourcePatternOrigins = [
  "HKUDS/ViMax",
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo",
  "calesthio/OpenMontage",
  "jiaminchen-1031/DirectorBench"
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
    ["--long-form-report", "longFormReportPath"],
    ["--evidence", "evidencePath"],
    ["--output", "outputPath"],
    ["--template", "templatePath"],
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
      const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = value;
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
  console.log(`Create an operator template for long-form manual quality/redaction review without network or provider calls.

Usage:
  npm.cmd run validation:long-form-review-draft
  npm.cmd run validation:long-form-review-draft -- --force

Options:
  --long-form-report <path>  Existing long-form validation report used for artifact fingerprints.
                             Default: ${defaults.longFormReportPath}
  --evidence <path>          Final ignored review packet path operators will fill.
                             Default: ${defaults.evidencePath}
  --template <path>          Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>         Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>            Draft generator report path. Default: ${defaults.outputPath}
  --force                    Overwrite existing template/checklist files.
  --no-drafts                Print/report only; do not write template/checklist files.
  --no-output                Print only; do not write the report.

The generated template is intentionally needs_review and redactionReviewPassed=false. It is not long-form evidence until an operator reviews the paid 2-8 minute artifact, fills every field, removes template-only fields, and reruns validation:long-form with --manual-quality-review and --confirm-manual-quality-review.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const sourceRead = readJson(options.longFormReportPath);
  const sourceContext = longFormContextFor(sourceRead);
  const issues = [];
  if (sourceRead.error) {
    issues.push(`Long-form validation report is invalid JSON: ${sourceRead.error}.`);
  }
  if (!sourceContext.readyForManualReview) {
    issues.push("Long-form report must include paid provider spend, accepted Atlas billing, completed paid render, passing artifact validation, 120-480s final duration, cost ledger, and artifact fingerprints before manual-review drafts can be evidence-bound.");
  }
  if (!options.writeDrafts) {
    issues.push("Template/checklist writing is disabled; rerun without --no-drafts to prepare operator files.");
  }

  const template = buildTemplate(sourceContext);
  const checklist = buildChecklist(options, sourceContext);
  const templateWrite = options.writeDrafts
    ? writeJsonFile(options.templatePath, template, { force: options.force })
    : { status: "skipped", available: false, written: false };
  const checklistWrite = options.writeDrafts
    ? writeTextFile(options.checklistPath, checklist, { force: options.force })
    : { status: "skipped", available: false, written: false };

  for (const item of [templateWrite, checklistWrite]) {
    if (item.status === "blocked") {
      issues.push(item.message);
    }
  }

  const report = {
    schemaVersion: "cinejelly.long-form-manual-quality-review-draft.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      longFormReportPath: toRepoRelative(options.longFormReportPath),
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      templatePath: toRepoRelative(options.templatePath),
      checklistPath: toRepoRelative(options.checklistPath),
      writeDrafts: options.writeDrafts,
      force: options.force
    },
    sourceReportContext: sourceContext,
    template: {
      path: toRepoRelative(options.templatePath),
      written: templateWrite.written === true,
      available: templateWrite.available === true,
      templateOnly: true,
      directUseRejectedByValidation: true,
      safeForEvidenceUse: false
    },
    checklist: {
      path: toRepoRelative(options.checklistPath),
      written: checklistWrite.written === true,
      available: checklistWrite.available === true
    },
    issues,
    releaseGateSummary: {
      canUseTemplateAsManualQualityReviewEvidence: false,
      canUseAsBusinessReadinessLongFormEvidence: false,
      canClaimDirectorBenchParity: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only a filled operator review file validated against the paid long-form artifact can count."
        : "Manual quality/redaction review draft could not be prepared safely."
    },
    nextActions: nextActionsFor(options, sourceContext, templateWrite, checklistWrite, issues)
  };

  if (options.writeReport) {
    writeJsonFile(options.outputPath, report, { force: true });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--long-form-report", options.longFormReportPath],
    ["--evidence", options.evidencePath],
    ["--output", options.outputPath],
    ["--template", options.templatePath]
  ]) {
    if (extname(path).toLowerCase() !== ".json") {
      throw new Error(`${flag} must point to a JSON file.`);
    }
    if (!isInsideRepo(path)) {
      throw new Error(`${flag} must resolve inside the repository workspace.`);
    }
  }
  if (extname(options.checklistPath).toLowerCase() !== ".md") {
    throw new Error("--checklist must point to a Markdown file.");
  }
  if (!isInsideRepo(options.checklistPath)) {
    throw new Error("--checklist must resolve inside the repository workspace.");
  }
}

function longFormContextFor(read) {
  const report = read.value;
  const artifactBinding = artifactBindingFromReport(report);
  const providerSpendAllowed = report?.spendGate?.providerSpendAllowed === true;
  const atlasBillingReady = report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true;
  const paidRenderCompleted = report?.paidRender?.status === "completed";
  const artifactValidationPassed = report?.paidRender?.artifactValidationStatus === "pass";
  const artifactEvidencePresent = report?.artifactEvidence?.present === true;
  const deliverablePresent = report?.artifactEvidence?.deliverablePresent === true;
  const finalDurationSeconds = numberOrUndefined(report?.artifactEvidence?.finalDurationSeconds);
  const costLedgerEntryCount = numberOrUndefined(report?.paidRender?.costLedgerEntryCount) ?? 0;
  const readyForManualReview =
    read.exists === true &&
    report?.schemaVersion === "cinejelly.long-form-validation.v1" &&
    providerSpendAllowed &&
    atlasBillingReady &&
    paidRenderCompleted &&
    artifactValidationPassed &&
    artifactEvidencePresent &&
    deliverablePresent &&
    isLongFormDuration(finalDurationSeconds) &&
    costLedgerEntryCount > 0 &&
    hasCompleteArtifactBinding(artifactBinding);
  return {
    reportPresent: read.exists === true,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    providerSpendAllowed,
    atlasBillingReady,
    paidRenderCompleted,
    artifactValidationPassed,
    artifactEvidencePresent,
    deliverablePresent,
    finalDurationSeconds: finalDurationSeconds ?? 0,
    costLedgerEntryCount,
    manualQualityReviewPassed: report?.manualQualityReview?.passed === true,
    manualReviewArtifactBindingStatus: typeof report?.manualQualityReview?.artifactBindingStatus === "string"
      ? report.manualQualityReview.artifactBindingStatus
      : "missing",
    canUseAsBusinessReadinessLongFormEvidence: report?.releaseGateSummary?.canUseAsBusinessReadinessLongFormEvidence === true,
    readyForManualReview,
    artifactBinding
  };
}

function artifactBindingFromReport(report) {
  return {
    reviewedProjectId: safeIdentifier(report?.artifactEvidence?.projectId) ? report.artifactEvidence.projectId.trim() : "replace-with-paid-project-id",
    reviewedManifestSha256: safeSha256(report?.artifactEvidence?.manifestSha256) ? report.artifactEvidence.manifestSha256.trim().toLowerCase() : "replace-with-lowercase-sha256",
    reviewedDeliverableSha256: safeSha256(report?.artifactEvidence?.deliverableSha256) ? report.artifactEvidence.deliverableSha256.trim().toLowerCase() : "replace-with-lowercase-sha256"
  };
}

function buildTemplate(sourceContext) {
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Copy this shape to ops/long-form-manual-quality-review.json only after reviewing the paid 2-8 minute deliverable, replacing every placeholder, setting decision=pass only when quality passes, setting redactionReviewPassed=true only after redaction review, and removing all underscore-prefixed template fields.",
    schemaVersion: "cinejelly.long-form-manual-quality-review.v1",
    decision: "needs_review",
    redactionReviewPassed: false,
    reviewedProjectId: sourceContext.artifactBinding.reviewedProjectId,
    reviewedManifestSha256: sourceContext.artifactBinding.reviewedManifestSha256,
    reviewedDeliverableSha256: sourceContext.artifactBinding.reviewedDeliverableSha256,
    reviewer: "replace-with-operator-or-reviewer-name",
    reviewedAt: "2026-06-18T00:00:00.000Z",
    qualityChecks: {
      durationAndPacingAccepted: false,
      shotContinuityAccepted: false,
      visualArtifactsAccepted: false,
      promptFidelityAccepted: false,
      audioSyncAccepted: false,
      noUnsafeContentObserved: false
    },
    notes: "replace with safe review summary; no URLs, local paths, raw provider payloads, customer data, transcripts, secrets, or signed links"
  };
}

function buildChecklist(options, sourceContext) {
  return `# Long-Form Manual Quality Review Fill-Out Checklist

This checklist is no-spend and no-network. It is not long-form manual review evidence by itself.

Current long-form context:

- Long-form report: \`${toRepoRelative(options.longFormReportPath)}\`
- Long-form report status: \`${sourceContext.status}\`
- Ready for manual review: \`${String(sourceContext.readyForManualReview)}\`
- Paid render completed: \`${String(sourceContext.paidRenderCompleted)}\`
- Artifact validation passed: \`${String(sourceContext.artifactValidationPassed)}\`
- Final duration seconds: \`${sourceContext.finalDurationSeconds}\`
- Cost ledger entry count: \`${sourceContext.costLedgerEntryCount}\`
- Reviewed project ID: \`${sourceContext.artifactBinding.reviewedProjectId}\`
- Reviewed manifest SHA-256: \`${sourceContext.artifactBinding.reviewedManifestSha256}\`
- Reviewed deliverable SHA-256: \`${sourceContext.artifactBinding.reviewedDeliverableSha256}\`
- Final review packet path: \`${toRepoRelative(options.evidencePath)}\`
- Template path: \`${toRepoRelative(options.templatePath)}\`

Fill-out steps:

1. Run paid long-form validation only after the slice-specific Atlas billing report passes and spend is explicitly approved.
2. Inspect the paid 2-8 minute deliverable, artifact manifest, cost ledger, rendered-shot evidence, and redaction state.
3. Copy the template shape into \`${toRepoRelative(options.evidencePath)}\`.
4. Remove every underscore-prefixed template field.
5. Keep \`reviewedProjectId\`, \`reviewedManifestSha256\`, and \`reviewedDeliverableSha256\` matched to the paid long-form report artifact evidence.
6. Set every quality check to true only after the reviewer verifies that area.
7. Set \`decision=pass\` only when the paid artifact passes quality review.
8. Set \`redactionReviewPassed=true\` only after checking there are no secrets, signed URLs, local paths, raw provider payloads, unsafe customer data, or unreleasable content in archived evidence.
9. Run \`npm.cmd run validation:long-form -- --request assets/output_deliverables/business-readiness/long-form-request.json --max-cost-usd <approved-budget> --confirm-paid-spend --manual-quality-review ${toRepoRelative(options.evidencePath)} --confirm-manual-quality-review\`.
10. Rerun \`npm.cmd run validation:quality-benchmark -- --long-form-validation assets/output_deliverables/business-readiness/long-form-validation-report.json\` and \`npm.cmd run validation:report-contracts\`.

This packet can make only the long-form manual review slice usable when bound to a passing paid long-form report. It still cannot claim DirectorBench parity or customer traffic without every other benchmark and business-readiness gate.
`;
}

function nextActionsFor(options, sourceContext, templateWrite, checklistWrite, issues) {
  const actions = [];
  if (!sourceContext.reportPresent) {
    actions.push(`Create the long-form validation report first with validation:long-form; expected report path is ${toRepoRelative(options.longFormReportPath)}.`);
  } else if (!sourceContext.readyForManualReview) {
    actions.push("Refresh long-form validation after approved paid spend until it contains passing paid-render, artifact, duration, cost-ledger, and artifact fingerprint evidence.");
  }
  if (templateWrite.available !== true || checklistWrite.available !== true) {
    actions.push("Rerun this draft helper with --force or writable output paths so the long-form manual review template and checklist are available.");
  }
  actions.push(`After paid long-form review, fill ${toRepoRelative(options.evidencePath)} from the paid artifact fingerprints and remove _templateOnly fields.`);
  actions.push(`Run validation:long-form with --manual-quality-review ${toRepoRelative(options.evidencePath)} --confirm-manual-quality-review.`);
  actions.push("Keep DirectorBench parity and customer traffic unclaimed until the full benchmark and business-readiness gates pass.");
  return [...new Set([...issues, ...actions])];
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false };
  }
  try {
    return {
      exists: true,
      value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""))
    };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function writeJsonFile(path, value, options) {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

function writeTextFile(path, content, options) {
  const absolutePath = resolve(repoRoot, path);
  if (existsSync(absolutePath) && !options.force) {
    return {
      status: "already_exists",
      available: true,
      written: false,
      message: `${toRepoRelative(path)} already exists; rerun with --force to refresh it.`
    };
  }
  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
    return { status: "written", available: true, written: true };
  } catch (error) {
    return {
      status: "blocked",
      available: false,
      written: false,
      message: `Could not write ${toRepoRelative(path)}: ${error instanceof Error ? error.message : String(error)}.`
    };
  }
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim());
}

function safeSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function hasCompleteArtifactBinding(value) {
  return safeIdentifier(value?.reviewedProjectId) &&
    safeSha256(value?.reviewedManifestSha256) &&
    safeSha256(value?.reviewedDeliverableSha256);
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isLongFormDuration(value) {
  return typeof value === "number" && value >= 120 && value <= 480;
}

function isInsideRepo(path) {
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const resolved = resolve(repoRoot, path).replace(/\\/g, "/").toLowerCase();
  return resolved === normalizedRoot || resolved.startsWith(`${normalizedRoot}/`);
}

function toRepoRelative(value) {
  const resolved = resolve(repoRoot, value);
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedResolved = resolved.replace(/\\/g, "/");
  const normalizedResolvedLower = normalizedResolved.toLowerCase();
  if (normalizedResolvedLower === normalizedRoot) {
    return ".";
  }
  if (normalizedResolvedLower.startsWith(`${normalizedRoot}/`)) {
    return normalizedResolved.slice(normalizedRoot.length + 1);
  }
  return "[outside-repo]";
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
