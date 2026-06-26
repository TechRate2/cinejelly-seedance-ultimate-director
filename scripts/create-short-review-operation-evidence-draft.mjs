#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/short-review-operation-evidence.json",
  outputPath: "assets/output_deliverables/business-readiness/short-review-operation-evidence-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/short-review-operation-evidence.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/short-review-operation-evidence-fillout-checklist.md"
};

const sourcePatternOrigins = [
  "video-db/Director",
  "calesthio/OpenMontage checkpoint protocol",
  "CineJelly Short create/review approval packet"
];

const checkpointSurfaces = ["scene", "audio", "caption", "claim"];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
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
  console.log(`Create an operator template for accepted Short create/review operation evidence without network or provider calls.

Usage:
  npm.cmd run validation:short-review-operation-draft
  npm.cmd run validation:short-review-operation-draft -- --force

Options:
  --evidence <path>    Final ignored evidence packet operators will fill. Default: ${defaults.evidencePath}
  --template <path>    Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>   Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>      Draft generator report path. Default: ${defaults.outputPath}
  --force              Overwrite existing template/checklist files.
  --no-drafts          Print/report only; do not write template/checklist files.
  --no-output          Print only; do not write the report.

The generated template is intentionally unsafe for direct evidence use. Operators must fill the deployment host, session binding, reviewer decision, hashes, and checkpoint decisions, remove template-only fields, then run validation:short-review-operation with --confirm-accepted-review-operation.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const issues = [];
  if (!options.writeDrafts) {
    issues.push("Template/checklist writing is disabled; rerun without --no-drafts to prepare operator files.");
  }

  const template = buildTemplate(options);
  const checklist = buildChecklist(options);
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
    schemaVersion: "cinejelly.short-review-operation-evidence-draft.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins,
    checkedInputs: {
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      templatePath: toRepoRelative(options.templatePath),
      checklistPath: toRepoRelative(options.checklistPath),
      writeDrafts: options.writeDrafts,
      force: options.force
    },
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
    finalEvidence: {
      path: toRepoRelative(options.evidencePath),
      validatorCommand: `npm.cmd run validation:short-review-operation -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-accepted-review-operation`,
      confirmationFlag: "--confirm-accepted-review-operation",
      requiresOperatorReview: true
    },
    issues,
    releaseGateSummary: {
      canUseTemplateAsAcceptedReviewOperationEvidence: false,
      canUseAsShortBackendReleaseEvidence: false,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only a filled operator packet validated with explicit confirmation can count."
        : "Short review operation evidence draft could not be prepared safely."
    },
    nextActions: nextActionsFor(options, templateWrite, checklistWrite, issues)
  };

  if (options.writeReport) {
    writeJsonFile(options.outputPath, report, { force: true });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
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

function buildTemplate(options) {
  const sessionPlaceholder = "short_session_replace";
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Fill every replace-with value, change decisions to approved after real review, remove all keys that start with underscore, then validate the final packet.",
    _finalEvidencePath: toRepoRelative(options.evidencePath),
    schemaVersion: "cinejelly.short-review-operation-evidence.v1",
    environmentKind: "deployment",
    deploymentBaseUrl: "https://replace-with-clean-deployment-host.invalid",
    sessionId: sessionPlaceholder,
    reviewer: {
      reviewerId: "replace-with-reviewer-id",
      reviewerRole: "operator",
      reviewedAt: "replace-with-review-timestamp",
      redactionReviewed: false
    },
    operation: {
      endpointPath: `/v1/short-pipeline/conversation-sessions/${sessionPlaceholder}/render-jobs`,
      reviewApprovalGate: "pre_render",
      confirmRenderSubmission: false,
      canQueueProviderSpendFromEvidence: false,
      renderJobQueued: false,
      spendReservationCreated: false,
      providerCallsMade: false,
      networkCallsMade: false,
      noSpend: true,
      rawTranscriptStored: false,
      rawUrlsStored: false,
      localPathsStored: false,
      secretsStored: false
    },
    checkpoints: checkpointSurfaces.map((surface) => ({
      surface,
      checkpointId: `${surface}_approval_checkpoint`,
      label: `${surface} checkpoint from accepted Short UI contract`,
      required: true,
      decision: "needs_review",
      reviewerRequiredForApproval: true,
      reviewedAtRequiredForApproval: true,
      evidenceKeyCount: 0,
      notes: "replace-with-digest-only-review-note"
    })),
    evidenceBinding: {
      approvalPacketSha256: "replace-with-lowercase-sha256",
      sessionUiContractSha256: "replace-with-lowercase-sha256",
      storedSessionPlanSha256: "replace-with-lowercase-sha256",
      clientScoped: true,
      serverSidePlanUsed: true,
      redactionReviewed: false,
      acceptedProductUrlEvidenceIncluded: false,
      mediaRightsApprovalIncluded: false
    },
    _filloutRules: [
      "Use only a clean HTTPS deployment host without query strings.",
      "Bind endpointPath and sessionId to the same short_session identifier.",
      "Keep confirmRenderSubmission false; this packet proves accepted review only, not provider submission.",
      "Do not include raw transcript, raw URL, local path, customer media, provider payload, or secret values.",
      "Run the validator with --confirm-accepted-review-operation after the real review is accepted."
    ]
  };
}

function buildChecklist(options) {
  return [
    "# Short Review Operation Evidence Fillout Checklist",
    "",
    `Final ignored packet: \`${toRepoRelative(options.evidencePath)}\``,
    `Template: \`${toRepoRelative(options.templatePath)}\``,
    "",
    "- Capture the deployment-scoped Short create/review session UI contract and stored server-side plan hashes.",
    "- Confirm scene, audio, caption, and claim checkpoints are actually approved by an allowed reviewer role.",
    "- Keep `confirmRenderSubmission=false`, `renderJobQueued=false`, provider calls false, network calls false, and spend reservation false.",
    "- Remove every template-only key that starts with `_` before placing the final JSON under `ops/`.",
    "- Keep only digest identifiers and safe reviewer IDs. Do not store raw transcript, raw URL, local path, customer media, or provider payload.",
    "- Run `npm.cmd run validation:short-review-operation -- --evidence ops/short-review-operation-evidence.json --confirm-accepted-review-operation`.",
    "",
    "This draft is not release evidence and cannot approve customer traffic."
  ].join("\n");
}

function nextActionsFor(options, templateWrite, checklistWrite, issues) {
  if (issues.length > 0) {
    return [
      options.writeDrafts
        ? "Review existing template/checklist files or rerun with --force if overwriting operator drafts is intended."
        : "Rerun without --no-drafts to prepare operator files.",
      "Do not copy template-only JSON into ops without filling accepted review evidence and removing underscore-prefixed fields."
    ];
  }
  const actions = [];
  if (templateWrite.written) {
    actions.push(`Fill ${toRepoRelative(options.templatePath)} from accepted deployment review evidence, then save the final packet at ${toRepoRelative(options.evidencePath)}.`);
  } else {
    actions.push(`Use the existing template at ${toRepoRelative(options.templatePath)} or rerun with --force to refresh it.`);
  }
  if (checklistWrite.available) {
    actions.push(`Follow ${toRepoRelative(options.checklistPath)} before running validation:short-review-operation.`);
  }
  actions.push(`Run npm.cmd run validation:short-review-operation -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-accepted-review-operation.`);
  return actions;
}

function writeJsonFile(path, value, { force }) {
  const absolutePath = resolve(repoRoot, path);
  if (existsSync(absolutePath) && !force) {
    return {
      status: "blocked",
      available: true,
      written: false,
      message: `${toRepoRelative(path)} already exists; rerun with --force to overwrite.`
    };
  }
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
  return { status: "written", available: true, written: true };
}

function writeTextFile(path, value, { force }) {
  const absolutePath = resolve(repoRoot, path);
  if (existsSync(absolutePath) && !force) {
    return {
      status: "blocked",
      available: true,
      written: false,
      message: `${toRepoRelative(path)} already exists; rerun with --force to overwrite.`
    };
  }
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${value}\n`);
  return { status: "written", available: true, written: true };
}

function isInsideRepo(path) {
  if (isAbsolute(path)) {
    return false;
  }
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "[outside-repo]";
  }
  return relativePath.replace(/\\/g, "/");
}

process.exitCode = main();
