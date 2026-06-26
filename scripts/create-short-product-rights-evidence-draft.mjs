#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  evidencePath: "ops/short-product-rights-evidence.json",
  outputPath: "assets/output_deliverables/business-readiness/short-product-rights-evidence-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/short-product-rights-evidence.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/short-product-rights-evidence-fillout-checklist.md"
};

const sourcePatternOrigins = [
  "video-db/Director product review workflow",
  "CineJelly ProductUrlResearcher evidence binding",
  "CineJelly Short product facts and media rights gate"
];

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
  console.log(`Create an operator template for accepted Short product-facts and media-rights evidence without network or provider calls.

Usage:
  npm.cmd run validation:short-product-rights-draft
  npm.cmd run validation:short-product-rights-draft -- --force

Options:
  --evidence <path>    Final ignored evidence packet operators will fill. Default: ${defaults.evidencePath}
  --template <path>    Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>   Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>      Draft generator report path. Default: ${defaults.outputPath}
  --force              Overwrite existing template/checklist files.
  --no-drafts          Print/report only; do not write template/checklist files.
  --no-output          Print only; do not write the report.

The generated template is intentionally unsafe for direct evidence use. Operators must fill clean hashes and accepted product/media decisions, remove template-only fields, then run validation:short-product-rights with --confirm-accepted-product-rights.`);
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
    schemaVersion: "cinejelly.short-product-rights-evidence-draft.v1",
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
      validatorCommand: `npm.cmd run validation:short-product-rights -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-accepted-product-rights`,
      confirmationFlag: "--confirm-accepted-product-rights",
      requiresOperatorReview: true
    },
    issues,
    releaseGateSummary: {
      canUseTemplateAsAcceptedProductRightsEvidence: false,
      canUseAsShortBackendReleaseEvidence: false,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only a filled operator packet validated with explicit confirmation can count."
        : "Short product/rights evidence draft could not be prepared safely."
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
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Fill every replace-with value, change review booleans only after real product/legal review, remove all keys that start with underscore, then validate the final packet.",
    _finalEvidencePath: toRepoRelative(options.evidencePath),
    schemaVersion: "cinejelly.short-product-rights-evidence.v1",
    environmentKind: "deployment",
    deploymentBaseUrl: "https://replace-with-clean-deployment-host.invalid",
    sessionId: "short_session_replace",
    reviewer: {
      reviewerId: "replace-with-reviewer-id",
      reviewerRole: "legal",
      reviewedAt: "replace-with-review-timestamp",
      redactionReviewed: false
    },
    productFacts: {
      productUrlSha256: "replace-with-lowercase-sha256",
      productHostSha256: "replace-with-lowercase-sha256",
      productPathSha256: "replace-with-lowercase-sha256",
      liveExtractionReportSha256: "replace-with-lowercase-sha256",
      productTitleAccepted: false,
      productCategoryAccepted: false,
      productBenefitsAccepted: false,
      productCtaAccepted: false,
      claimSubstantiationAccepted: false,
      productSnapshotMatchesPlan: false,
      missingRequiredFactCount: 1,
      unsupportedClaimCount: 1,
      rawProductUrlStored: false,
      rawMediaUrlsStored: false,
      secretsStored: false,
      notes: "replace-with-digest-only-product-facts-note"
    },
    mediaRights: {
      productMediaApprovedForUse: false,
      commercialUseApproved: false,
      usageScopeReviewed: false,
      ownershipDecision: "needs_review",
      modelReleaseStatus: "needs_review",
      trademarkUsageApproved: false,
      restrictedThirdPartyMarksAbsent: false,
      attributionStatus: "needs_review",
      attributionSummarySha256: "replace-with-lowercase-sha256",
      rightsReviewerRole: "legal",
      rightsReviewedAt: "replace-with-review-timestamp",
      redactionReviewed: false,
      notes: "replace-with-digest-only-media-rights-note"
    },
    operationBoundary: {
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      canQueueProviderSpendFromEvidence: false,
      renderJobQueued: false,
      spendReservationCreated: false,
      canReleaseToCustomerTraffic: false
    },
    evidenceBinding: {
      productFactsReviewSha256: "replace-with-lowercase-sha256",
      mediaRightsReviewSha256: "replace-with-lowercase-sha256",
      productUrlExtractionReportSha256: "replace-with-lowercase-sha256",
      sessionUiContractSha256: "replace-with-lowercase-sha256",
      storedSessionPlanSha256: "replace-with-lowercase-sha256",
      clientScoped: true,
      serverSidePlanUsed: true,
      redactionReviewed: false,
      shortReviewOperationEvidenceIncluded: false,
      paidRenderEvidenceIncluded: false
    },
    _filloutRules: [
      "Use SHA-256 hashes from the live product URL extraction report, product facts review, media rights review, session UI contract, and stored session plan.",
      "Accept product facts only after title, category, benefits, CTA metadata, claims, and product snapshot match the plan.",
      "Accept media rights only after ownership, commercial use, model release, trademark, third-party mark, attribution, and redaction review pass.",
      "Do not include raw product URL, raw media URL, customer media, provider payload, local path, or secret values.",
      "Run the validator with --confirm-accepted-product-rights after the real product/legal review is accepted."
    ]
  };
}

function buildChecklist(options) {
  return [
    "# Short Product Rights Evidence Fillout Checklist",
    "",
    `Final ignored packet: \`${toRepoRelative(options.evidencePath)}\``,
    `Template: \`${toRepoRelative(options.templatePath)}\``,
    "",
    "- Capture live product URL extraction evidence and bind only SHA-256 hashes in the final packet.",
    "- Confirm product title, category, benefits, CTA metadata, claim substantiation, and product snapshot match the approved Short plan.",
    "- Confirm media ownership, commercial-use scope, model release status, trademark usage, restricted third-party marks, attribution, and redaction review.",
    "- Keep operation boundary no-spend: no network calls, no provider calls, no render job queued, no spend reservation, no customer-traffic release.",
    "- Remove every template-only key that starts with `_` before placing the final JSON under `ops/`.",
    "- Run `npm.cmd run validation:short-product-rights -- --evidence ops/short-product-rights-evidence.json --confirm-accepted-product-rights`.",
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
      "Do not copy template-only JSON into ops without filling accepted product/legal review evidence and removing underscore-prefixed fields."
    ];
  }
  const actions = [];
  if (templateWrite.written) {
    actions.push(`Fill ${toRepoRelative(options.templatePath)} from accepted product/legal review evidence, then save the final packet at ${toRepoRelative(options.evidencePath)}.`);
  } else {
    actions.push(`Use the existing template at ${toRepoRelative(options.templatePath)} or rerun with --force to refresh it.`);
  }
  if (checklistWrite.available) {
    actions.push(`Follow ${toRepoRelative(options.checklistPath)} before running validation:short-product-rights.`);
  }
  actions.push(`Run npm.cmd run validation:short-product-rights -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-accepted-product-rights.`);
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
