import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  generatedAudioReportPath: "assets/output_deliverables/business-readiness/generated-audio-validation-report.json",
  artifactEvidenceReportPath: "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json",
  evidencePath: "ops/generated-audio-manual-review.json",
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-manual-review-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/generated-audio-manual-review.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/generated-audio-manual-review-fillout-checklist.md"
};

const sourcePatternOrigins = [
  "harry0703/MoneyPrinterTurbo",
  "vericontext/vibeframe",
  "calesthio/OpenMontage",
  "Atlas Cloud xai/tts-v1 model page",
  "Atlas Cloud Predictions docs"
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
    ["--generated-audio-report", "generatedAudioReportPath"],
    ["--artifact-evidence-report", "artifactEvidenceReportPath"],
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
  console.log(`Create an operator template for generated-audio manual review without network or provider calls.

Usage:
  npm.cmd run validation:generated-audio-review-draft
  npm.cmd run validation:generated-audio-review-draft -- --force

Options:
  --generated-audio-report <path>  Existing Atlas generated-audio validation report.
                                  Default: ${defaults.generatedAudioReportPath}
  --artifact-evidence-report <path>
                                  Optional generated-audio artifact evidence report.
                                  Default: ${defaults.artifactEvidenceReportPath}
  --evidence <path>                Final ignored evidence packet path operators will fill.
                                  Default: ${defaults.evidencePath}
  --template <path>                Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>               Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>                  Draft generator report path. Default: ${defaults.outputPath}
  --force                          Overwrite existing template/checklist files.
  --no-drafts                      Print/report only; do not write template/checklist files.
  --no-output                      Print only; do not write the report.

The generated template is intentionally needs_review. It is not generated-audio manual review evidence until an operator listens to the provider output, fills every required field, removes template-only fields, and reruns validation:generated-audio with --manual-audio-review and --confirm-manual-audio-review.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const sourceRead = readJson(options.generatedAudioReportPath);
  const sourceContext = generatedAudioContextFor(sourceRead);
  const artifactEvidenceRead = readJson(options.artifactEvidenceReportPath);
  const artifactEvidenceContext = generatedAudioArtifactEvidenceContextFor(artifactEvidenceRead, sourceContext);
  const issues = [];
  if (sourceRead.error) {
    issues.push(`Generated-audio report is invalid JSON: ${sourceRead.error}.`);
  }
  if (!sourceContext.readyForManualReview) {
    issues.push("Generated-audio report must contain provider-spend, billing, schema, succeeded execution, approved output-batch, provider ledger, and an output URL before manual review drafts can be evidence-bound.");
  }
  if (!options.writeDrafts) {
    issues.push("Template/checklist writing is disabled; rerun without --no-drafts to prepare operator files.");
  }

  const template = buildTemplate(options, sourceContext, artifactEvidenceContext);
  const checklist = buildChecklist(options, sourceContext, artifactEvidenceContext);
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
    schemaVersion: "cinejelly.generated-audio-manual-review-draft.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      generatedAudioReportPath: toRepoRelative(options.generatedAudioReportPath),
      artifactEvidenceReportPath: toRepoRelative(options.artifactEvidenceReportPath),
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      templatePath: toRepoRelative(options.templatePath),
      checklistPath: toRepoRelative(options.checklistPath),
      writeDrafts: options.writeDrafts,
      force: options.force
    },
    sourceReportContext: sourceContext,
    artifactEvidenceContext,
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
      canUseTemplateAsManualAudioReviewEvidence: false,
      canUseAsBusinessReadinessGeneratedAudioEvidence: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only a filled operator review file validated against the paid output can count."
        : "Manual review draft could not be prepared safely."
    },
    nextActions: nextActionsFor(options, sourceContext, artifactEvidenceContext, templateWrite, checklistWrite, issues)
  };

  if (options.writeReport) {
    writeJsonFile(options.outputPath, report, { force: true });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--generated-audio-report", options.generatedAudioReportPath],
    ["--evidence", options.evidencePath],
    ["--output", options.outputPath],
    ["--template", options.templatePath]
  ]) {
    if (extname(path).toLowerCase() !== ".json") {
      throw new Error(`${flag} must point to a JSON file.`);
    }
  }
  if (extname(options.checklistPath).toLowerCase() !== ".md") {
    throw new Error("--checklist must point to a Markdown file.");
  }
}

function generatedAudioContextFor(read) {
  const report = read.value;
  const binding = generatedAudioBindingFromReport(report);
  const outputUrlClean = typeof binding.outputUrlPreview === "string" &&
    /^https:\/\//i.test(binding.outputUrlPreview) &&
    !/[?&#]/.test(binding.outputUrlPreview);
  const providerExecutionSucceeded = report?.executionRun?.status === "succeeded";
  const outputBatchApproved =
    report?.outputBatchValidation?.status === "approved" &&
    Number(report?.outputBatchValidation?.approvedTrackCount ?? 0) > 0;
  const providerLedgerEntryCount = Number(report?.providerLedger?.entryCount ?? 0);
  const readyForManualReview =
    read.exists === true &&
    report?.schemaVersion === "cinejelly.generated-audio-validation.v1" &&
    report?.spendGate?.providerNetworkCallsAllowed === true &&
    report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true &&
    report?.schemaGate?.confirmAudioSchemaReviewed === true &&
    providerExecutionSucceeded &&
    outputBatchApproved &&
    providerLedgerEntryCount > 0 &&
    outputUrlClean;
  return {
    reportPresent: read.exists === true,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    providerSpendEvidence: report?.spendGate?.providerNetworkCallsAllowed === true,
    atlasBillingEvidence: report?.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true,
    schemaReviewEvidence: report?.schemaGate?.confirmAudioSchemaReviewed === true,
    providerExecutionSucceeded,
    outputBatchApproved,
    approvedTrackCount: Number(report?.outputBatchValidation?.approvedTrackCount ?? 0),
    providerLedgerEntryCount,
    outputUrlClean,
    manualReviewPassed: report?.manualAudioReview?.passed === true,
    canUseAsBusinessReadinessGeneratedAudioEvidence: report?.releaseGateSummary?.canUseAsBusinessReadinessGeneratedAudioEvidence === true,
    readyForManualReview,
    artifactBinding: binding
  };
}

function generatedAudioArtifactEvidenceContextFor(read, sourceContext) {
  const report = read.value;
  const evidence = report?.artifactEvidence;
  const reportPassed = report?.schemaVersion === "cinejelly.generated-audio-artifact-evidence.v1" &&
    report?.status === "pass" &&
    report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence === true;
  const bindingMatches = reportPassed &&
    evidence?.outputUrlPreview === sourceContext.artifactBinding.outputUrlPreview &&
    evidence?.predictionId === sourceContext.artifactBinding.predictionId &&
    evidence?.providerAssetId === sourceContext.artifactBinding.providerAssetId;
  return {
    reportPresent: read.exists === true,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    canUseAsManualReviewArtifactEvidence: report?.releaseGateSummary?.canUseAsManualReviewArtifactEvidence === true,
    bindingMatchesSourceReport: bindingMatches === true,
    readyForManualReviewBinding: reportPassed && bindingMatches === true,
    artifactEvidence: reportPassed && evidence && typeof evidence === "object"
      ? {
          generatedAudioArtifactEvidenceReportPath: read.path,
          artifactPath: stringOrPlaceholder(evidence.artifactPath, "replace-with-artifact-path"),
          mediaSha256: stringOrPlaceholder(evidence.mediaSha256, "replace-with-media-sha256"),
          byteSize: typeof evidence.byteSize === "number" ? evidence.byteSize : 0,
          durationSeconds: typeof evidence.durationSeconds === "number" ? evidence.durationSeconds : 0,
          outputUrlPreview: stringOrPlaceholder(evidence.outputUrlPreview, sourceContext.artifactBinding.outputUrlPreview),
          predictionId: stringOrPlaceholder(evidence.predictionId, sourceContext.artifactBinding.predictionId)
        }
      : undefined
  };
}

function generatedAudioBindingFromReport(report) {
  const result = Array.isArray(report?.executionRun?.results)
    ? report.executionRun.results.find((item) => item?.status === "succeeded") ?? report.executionRun.results[0]
    : undefined;
  const batchReport = Array.isArray(report?.outputBatchValidation?.reports)
    ? report.outputBatchValidation.reports.find((item) => item?.status === "approved") ?? report.outputBatchValidation.reports[0]
    : undefined;
  const ledgerEntry = Array.isArray(report?.providerLedger?.entries)
    ? report.providerLedger.entries.find((item) => item?.operation === "audio.generate") ?? report.providerLedger.entries[0]
    : undefined;
  return {
    modelId: stringOrPlaceholder(report?.checkedInputs?.modelId, "replace-with-model-id"),
    language: stringOrPlaceholder(report?.checkedInputs?.language, "replace-with-language"),
    voiceId: stringOrPlaceholder(report?.checkedInputs?.voiceId, "replace-with-voice-id"),
    outputFormat: stringOrPlaceholder(report?.checkedInputs?.outputFormat, "replace-with-output-format"),
    intentId: stringOrPlaceholder(result?.intentId ?? batchReport?.intentId, "replace-with-intent-id"),
    providerAssetId: stringOrPlaceholder(result?.providerAssetId ?? ledgerEntry?.predictionId, "replace-with-provider-asset-id"),
    predictionId: stringOrPlaceholder(ledgerEntry?.predictionId ?? result?.providerAssetId, "replace-with-prediction-id"),
    outputUrlPreview: stringOrPlaceholder(result?.outputUrlPreview ?? batchReport?.outputUrlPreview, "replace-with-clean-output-url")
  };
}

function stringOrPlaceholder(value, placeholder) {
  return typeof value === "string" && value.trim() ? value : placeholder;
}

function buildTemplate(options, sourceContext, artifactEvidenceContext) {
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Fill this file after listening to the generated audio, remove underscore-prefixed fields, change status/decision only from real review, and store the final packet at ops/generated-audio-manual-review.json.",
    schemaVersion: "cinejelly.generated-audio-manual-review.v1",
    reviewerType: "manual",
    status: "needs_review",
    decision: "needs_review",
    reviewedAt: "replace-with-review-time-iso8601",
    reviewerId: "replace-with-reviewer-name-or-team",
    sourceGeneratedAudioReportPath: toRepoRelative(options.generatedAudioReportPath),
    artifactBinding: sourceContext.artifactBinding,
    artifactEvidence: artifactEvidenceContext.artifactEvidence ?? {
      generatedAudioArtifactEvidenceReportPath: toRepoRelative(options.artifactEvidenceReportPath),
      artifactPath: "replace-with-captured-artifact-path",
      mediaSha256: "replace-with-64-character-sha256",
      byteSize: 0,
      durationSeconds: 0,
      outputUrlPreview: sourceContext.artifactBinding.outputUrlPreview,
      predictionId: sourceContext.artifactBinding.predictionId
    },
    checks: {
      listenedFullOutput: false,
      outputIsAudible: false,
      languageMatchesRequest: false,
      narrationMatchesValidationText: false,
      noObviousArtifacts: false,
      noCredentialLeak: false,
      safeForBusinessEvidence: false
    },
    findings: [
      "Replace this draft note with a concise non-secret listening summary."
    ],
    redactionReviewed: false
  };
}

function buildChecklist(options, sourceContext, artifactEvidenceContext) {
  const binding = sourceContext.artifactBinding;
  const artifactEvidenceStatus = artifactEvidenceContext.readyForManualReviewBinding
    ? "ready"
    : "missing_or_not_bound";
  return `# Generated Audio Manual Review Fill-Out Checklist

This checklist is no-spend and no-network. It is not generated-audio review evidence by itself.

Current generated-audio context:

- Generated-audio report: \`${toRepoRelative(options.generatedAudioReportPath)}\`
- Existing report status: \`${sourceContext.status}\`
- Provider execution succeeded: \`${String(sourceContext.providerExecutionSucceeded)}\`
- Output batch approved: \`${String(sourceContext.outputBatchApproved)}\`
- Provider ledger entries: \`${sourceContext.providerLedgerEntryCount}\`
- Output URL to listen to: ${binding.outputUrlPreview}
- Artifact evidence report: \`${toRepoRelative(options.artifactEvidenceReportPath)}\`
- Artifact evidence status: \`${artifactEvidenceStatus}\`
- Final evidence packet path: \`${toRepoRelative(options.evidencePath)}\`
- Template path: \`${toRepoRelative(options.templatePath)}\`

Fill-out steps:

1. If artifact evidence is not ready, run \`npm.cmd run validation:generated-audio-artifact -- --confirm-live-network\`.
2. Open the output URL above and listen to the full generated audio.
3. Copy the template shape into \`${toRepoRelative(options.evidencePath)}\`.
4. Remove every underscore-prefixed template field.
5. Keep the artifact binding and artifact evidence values unchanged unless the generated-audio report or artifact evidence report was refreshed.
6. Set every check only from direct listening and redaction inspection.
7. Keep findings concise and do not paste provider payloads, signed URLs, secrets, or local filesystem paths.
8. Run \`npm.cmd run validation:generated-audio -- --review-existing-report ${toRepoRelative(options.generatedAudioReportPath)} --manual-audio-review ${toRepoRelative(options.evidencePath)} --confirm-manual-audio-review\`.

This review can unlock only the generated-audio evidence slice. It does not approve long-form video quality, deployment, billing/admin controls, production operations, source-video validation, remote-stock validation, or customer traffic.
`;
}

function nextActionsFor(options, sourceContext, artifactEvidenceContext, templateWrite, checklistWrite, issues) {
  const actions = [];
  if (!sourceContext.reportPresent) {
    actions.push(`Run validation:generated-audio with provider spend first; expected report path is ${toRepoRelative(options.generatedAudioReportPath)}.`);
  } else if (!sourceContext.readyForManualReview) {
    actions.push("Refresh generated-audio validation until provider spend, billing, schema, execution, output-batch, ledger, and clean output URL evidence are present.");
  }
  if (templateWrite.available !== true || checklistWrite.available !== true) {
    actions.push("Rerun this draft helper with --force or writable output paths so the operator template and checklist are available.");
  }
  if (artifactEvidenceContext.readyForManualReviewBinding !== true) {
    actions.push(`Run npm.cmd run validation:generated-audio-artifact -- --confirm-live-network so the manual review packet can bind to SHA-256/duration evidence from ${toRepoRelative(options.artifactEvidenceReportPath)}.`);
  }
  actions.push(`After listening to the output, fill ${toRepoRelative(options.evidencePath)} from real review data and remove _templateOnly fields.`);
  actions.push(`Run npm.cmd run validation:generated-audio -- --review-existing-report ${toRepoRelative(options.generatedAudioReportPath)} --manual-audio-review ${toRepoRelative(options.evidencePath)} --confirm-manual-audio-review.`);
  actions.push("Keep generated-audio business evidence unclaimed until the review-existing report status is pass.");
  return [...new Set([...issues, ...actions])];
}

function readJson(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false, path: toRepoRelative(path) };
  }
  try {
    return {
      exists: true,
      path: toRepoRelative(path),
      value: JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""))
    };
  } catch (error) {
    return {
      exists: true,
      path: toRepoRelative(path),
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
