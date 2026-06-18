#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  productionHandoffPath: "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json",
  evidencePath: "ops/render-provider-live-actions.json",
  outputPath: "assets/output_deliverables/business-readiness/render-provider-live-action-evidence-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/render-provider-live-actions.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/render-provider-live-actions-fillout-checklist.md"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
    ["--production-handoff-report", "productionHandoffPath"],
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
  console.log(`Create an operator template for live provider action evidence without network or provider calls.

Usage:
  npm.cmd run validation:provider-live-action-draft
  npm.cmd run validation:provider-live-action-draft -- --force

Options:
  --production-handoff-report <path>  Production handoff capture report used for checklist context.
                                      Default: ${defaults.productionHandoffPath}
  --evidence <path>                   Final ignored evidence packet path operators will fill.
                                      Default: ${defaults.evidencePath}
  --template <path>                   Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>                  Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>                     Draft generator report path. Default: ${defaults.outputPath}
  --force                             Overwrite existing template/checklist files.
  --no-drafts                         Print/report only; do not write template/checklist files.
  --no-output                         Print only; do not write the report.

The generated template is intentionally marked _templateOnly and keeps live-callback booleans false. It must not be copied directly into ops evidence or used as production proof.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const handoffRead = readJson(options.productionHandoffPath);
  const issues = [];
  if (handoffRead.error) {
    issues.push(`Production handoff report is invalid JSON: ${handoffRead.error}.`);
  }
  if (!options.writeDrafts) {
    issues.push("Template/checklist writing is disabled; rerun without --no-drafts to prepare operator files.");
  }

  const template = buildTemplate();
  const checklist = buildChecklist(options, handoffRead.value);
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
    schemaVersion: "cinejelly.render-provider-live-action-evidence-draft.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      productionHandoffPath: toRepoRelative(options.productionHandoffPath),
      evidencePath: toRepoRelative(options.evidencePath),
      outputPath: toRepoRelative(options.outputPath),
      templatePath: toRepoRelative(options.templatePath),
      checklistPath: toRepoRelative(options.checklistPath),
      writeDrafts: options.writeDrafts,
      force: options.force
    },
    productionHandoffContext: productionHandoffContextFor(handoffRead),
    template: {
      path: toRepoRelative(options.templatePath),
      written: templateWrite.written === true,
      available: templateWrite.available === true,
      templateOnly: true,
      directUseRejectedByEvidenceSchema: true,
      sampleExecutionCount: template.executions.length,
      includesResumePollingExample: true,
      includesGraphResumeExample: true,
      includesTerminalCloseExample: true,
      includesManualAuditAlternative: true,
      safeForEvidenceUse: false
    },
    checklist: {
      path: toRepoRelative(options.checklistPath),
      written: checklistWrite.written === true,
      available: checklistWrite.available === true
    },
    issues,
    releaseGateSummary: {
      canUseTemplateAsLiveProviderActionEvidence: false,
      canUseTemplateAsGraphResumeEvidence: false,
      canClaimDistributedResume: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only real deployment callback evidence validated with confirmation can count."
        : "Template/checklist could not be prepared safely."
    },
    nextActions: nextActionsFor(options, handoffRead, templateWrite, checklistWrite, issues)
  };

  if (options.writeReport) {
    writeJsonFile(options.outputPath, report, { force: true });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  for (const [flag, path] of [
    ["--production-handoff-report", options.productionHandoffPath],
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

function buildTemplate() {
  const placeholderTime = "2026-06-18T00:00:00.000Z";
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Copy this shape to ops/render-provider-live-actions.json only after replacing every replace-with-* value, setting live-callback booleans from real provider execution, and removing all underscore-prefixed template fields.",
    schemaVersion: "cinejelly.render-provider-live-action-evidence.v1",
    environmentKind: "deployment",
    deploymentBaseUrl: "https://replace-with-production-host.example",
    approvedBy: "replace-with-operator-name",
    approvedAt: placeholderTime,
    executions: [
      {
        actionId: "replace-with-live-resume-poll-action-id",
        jobId: "replace-with-live-job-id",
        action: "resume_polling",
        predictionIds: ["replace-with-live-atlas-prediction-id"],
        provider: "atlascloud",
        providerCallKind: "prediction_poll",
        providerCallMade: false,
        resultStatus: "still_active",
        executedAt: placeholderTime,
        evidenceSummary: "replace with redacted summary of live prediction poll; no URLs, local paths, secrets, raw payloads, or output URLs",
        redactionReviewed: false,
        rawProviderPayloadStored: false,
        outputUrlsStored: false
      },
      {
        actionId: "replace-with-live-graph-resume-action-id",
        jobId: "replace-with-live-job-id",
        action: "resume_polling",
        predictionIds: ["replace-with-live-atlas-prediction-id"],
        provider: "cinejelly-graph-worker",
        providerCallKind: "graph_resume_enqueue",
        providerCallMade: false,
        resultStatus: "resume_enqueued",
        executedAt: placeholderTime,
        evidenceSummary: "replace with redacted summary of live graph resume enqueue; no URLs, local paths, secrets, raw payloads, or output URLs",
        redactionReviewed: false,
        rawProviderPayloadStored: false,
        outputUrlsStored: false
      },
      {
        actionId: "replace-with-live-terminal-close-action-id",
        jobId: "replace-with-live-job-id",
        action: "close_terminal_succeeded",
        predictionIds: ["replace-with-live-atlas-prediction-id"],
        provider: "atlascloud",
        providerCallKind: "terminal_closeout",
        providerCallMade: false,
        resultStatus: "closeout_recorded",
        executedAt: placeholderTime,
        evidenceSummary: "replace with redacted summary of live terminal closeout; no URLs, local paths, secrets, raw payloads, or output URLs",
        redactionReviewed: false,
        rawProviderPayloadStored: false,
        outputUrlsStored: false
      }
    ],
    _manualAuditAlternative: {
      action: "manual_audit_required",
      providerCallKind: "manual_audit_enqueue",
      resultStatus: "manual_audit_queued"
    }
  };
}

function buildChecklist(options, productionHandoffReport) {
  const handoffStatus = typeof productionHandoffReport?.status === "string" ? productionHandoffReport.status : "missing";
  const handoffUsable = productionHandoffReport?.releaseGateSummary?.canUseAsProductionHandoffEvidence === true;
  return `# Render Provider Live Action Evidence Fill-Out Checklist

This checklist is no-spend and no-network. It is not live provider evidence by itself.

Current production handoff context:

- Production handoff report: \`${toRepoRelative(options.productionHandoffPath)}\`
- Production handoff status: \`${handoffStatus}\`
- Production handoff usable as evidence: \`${String(handoffUsable)}\`
- Final evidence packet path: \`${toRepoRelative(options.evidencePath)}\`
- Template path: \`${toRepoRelative(options.templatePath)}\`

Fill-out steps:

1. Run \`npm.cmd run validation:provider-production-handoff -- --base-url https://<your-cinejelly-host>\` against the real HTTPS deployment.
2. Run the live provider worker on the same deployment so the action ledger records real resume/close/manual-audit callback execution.
3. Copy the template shape into \`${toRepoRelative(options.evidencePath)}\`, remove every underscore-prefixed template field, and replace every \`replace-with-*\` value.
4. Use the same deployment base URL that produced the production handoff fingerprint.
5. Include at least one \`resume_polling\` + \`prediction_poll\` + \`still_active\` execution from a real provider poll.
6. Include terminal closeout or manual-audit evidence from a real callback.
7. Include \`resume_polling\` + \`graph_resume_enqueue\` + \`resume_enqueued\` only when a real worker enqueued graph resume.
8. Set \`providerCallMade=true\` and \`redactionReviewed=true\` only after checking live callback evidence.
9. Keep \`rawProviderPayloadStored=false\` and \`outputUrlsStored=false\`; archive raw payloads or signed URLs outside this report if policy requires it.
10. Run \`npm.cmd run validation:provider-live-actions -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-live-provider-actions\`.

Do not use this template to claim distributed resume. The validator can make the graph-resume evidence slice usable only after real callback evidence passes, and the release gate still keeps \`canClaimDistributedResume=false\`.
`;
}

function productionHandoffContextFor(read) {
  const report = read.value;
  const fingerprint = typeof report?.checkedInputs?.deploymentBaseUrlSha256 === "string"
    ? report.checkedInputs.deploymentBaseUrlSha256
    : "";
  return {
    reportPresent: read.exists === true,
    status: typeof report?.status === "string" ? report.status : "missing",
    usableAsProductionHandoffEvidence: report?.releaseGateSummary?.canUseAsProductionHandoffEvidence === true,
    deploymentBaseUrlSha256Present: /^[a-f0-9]{64}$/.test(fingerprint),
    deploymentBindingRequired: true
  };
}

function nextActionsFor(options, handoffRead, templateWrite, checklistWrite, issues) {
  const actions = [];
  if (!handoffRead.exists) {
    actions.push(`Create production handoff evidence first with validation:provider-production-handoff against a real HTTPS deployment; expected report path is ${toRepoRelative(options.productionHandoffPath)}.`);
  } else if (handoffRead.value?.releaseGateSummary?.canUseAsProductionHandoffEvidence !== true) {
    actions.push("Refresh production handoff capture until it is a passing deployment evidence report before expecting live action evidence to pass.");
  }
  if (templateWrite.available !== true || checklistWrite.available !== true) {
    actions.push("Rerun this draft helper with --force or writable output paths so the operator template and checklist are available.");
  }
  actions.push(`After live provider callbacks execute, fill ${toRepoRelative(options.evidencePath)} from real deployment data and remove _templateOnly fields.`);
  actions.push(`Run npm.cmd run validation:provider-live-actions -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-live-provider-actions.`);
  actions.push("Keep distributed-resume parity unclaimed until production multi-worker ownership handoff and live graph-resume evidence are both proven.");
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
      value: JSON.parse(readFileSync(absolutePath, "utf8"))
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
