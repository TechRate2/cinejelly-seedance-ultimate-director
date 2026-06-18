#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  liveActionsReportPath: "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json",
  evidencePath: "ops/render-provider-graph-resume-enqueues.json",
  outputPath: "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueue-evidence-draft-report.json",
  templatePath: "assets/output_deliverables/business-readiness/operator-drafts/render-provider-graph-resume-enqueues.template.json",
  checklistPath: "assets/output_deliverables/business-readiness/operator-drafts/render-provider-graph-resume-enqueues-fillout-checklist.md"
};

function parseArgs(args) {
  const options = {
    ...defaults,
    writeDrafts: true,
    writeReport: true,
    force: false
  };
  const flagMap = new Map([
    ["--live-actions-report", "liveActionsReportPath"],
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
  console.log(`Create an operator template for graph-resume enqueue payload evidence without network/provider/queue calls.

Usage:
  npm.cmd run validation:provider-graph-resume-draft
  npm.cmd run validation:provider-graph-resume-draft -- --force

Options:
  --live-actions-report <path>  Live provider action report used for action/job binding context.
                                Default: ${defaults.liveActionsReportPath}
  --evidence <path>             Final ignored enqueue evidence packet path operators will fill.
                                Default: ${defaults.evidencePath}
  --template <path>             Template JSON path. Default: ${defaults.templatePath}
  --checklist <path>            Markdown checklist path. Default: ${defaults.checklistPath}
  --output <path>               Draft generator report path. Default: ${defaults.outputPath}
  --force                       Overwrite existing template/checklist files.
  --no-drafts                   Print/report only; do not write template/checklist files.
  --no-output                   Print only; do not write the report.

The generated template is intentionally invalid as final evidence until a deployment worker has really enqueued graph resume, an operator replaces every placeholder with digest-only live values, removes template-only fields, and validates the packet with validation:provider-graph-resume -- --confirm-graph-resume-enqueues.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const liveActionsRead = readJson(options.liveActionsReportPath);
  const sourceContext = liveActionContextFor(liveActionsRead);
  const issues = [];
  if (liveActionsRead.error) {
    issues.push(`Live action report is invalid JSON: ${liveActionsRead.error}.`);
  }
  if (!options.writeDrafts) {
    issues.push("Template/checklist writing is disabled; rerun without --no-drafts to prepare operator files.");
  }

  const template = buildTemplate(options, sourceContext);
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
    schemaVersion: "cinejelly.render-provider-graph-resume-enqueue-evidence-draft.v1",
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? "pass" : "blocked",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    queueCallsMade: false,
    checkedInputs: {
      liveActionsReportPath: toRepoRelative(options.liveActionsReportPath),
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
      directUseRejectedByEvidenceSchema: true,
      safeForEvidenceUse: false,
      prefilledFromLiveActions: sourceContext.graphResumeExecutionCount > 0
    },
    checklist: {
      path: toRepoRelative(options.checklistPath),
      written: checklistWrite.written === true,
      available: checklistWrite.available === true
    },
    issues,
    releaseGateSummary: {
      canUseTemplateAsGraphResumePayloadEvidence: false,
      canUseAsDistributedResumeEvidence: false,
      canClaimDistributedResume: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: issues.length === 0
        ? "Template and checklist are available, but only digest-only live enqueue payload evidence validated with explicit confirmation can count."
        : "Graph-resume enqueue payload template/checklist could not be prepared safely."
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
    ["--live-actions-report", options.liveActionsReportPath],
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

function liveActionContextFor(read) {
  const report = read.value;
  const executions = liveGraphResumeExecutionsFor(report);
  const first = executions[0];
  return {
    reportPresent: read.exists === true,
    schemaVersion: typeof report?.schemaVersion === "string" ? report.schemaVersion : "missing",
    status: typeof report?.status === "string" ? report.status : "missing",
    graphResumeExecutionCount: executions.length,
    liveActionsGraphResumeEvidenceUsable: report?.summary?.canUseAsGraphResumeEvidence === true,
    deploymentBaseUrlSha256Present: /^[a-f0-9]{64}$/.test(String(report?.evidence?.deploymentBaseUrlSha256 ?? "")),
    canUseAsDistributedResumeEvidence: report?.releaseGateSummary?.canUseAsDistributedResumeEvidence === true,
    sampleActionBinding: {
      actionId: typeof first?.actionId === "string" ? first.actionId : "replace-with-live-graph-resume-action-id",
      jobId: typeof first?.jobId === "string" ? first.jobId : "replace-with-live-job-id"
    }
  };
}

function liveGraphResumeExecutionsFor(report) {
  const executions = Array.isArray(report?.executions) ? report.executions : [];
  return executions.filter((item) =>
    item?.action === "resume_polling" &&
    item?.providerCallKind === "graph_resume_enqueue" &&
    item?.resultStatus === "resume_enqueued" &&
    item?.providerCallMade === true
  );
}

function buildTemplate(options, sourceContext) {
  const placeholderTime = "2026-06-18T00:00:00.000Z";
  return {
    _templateOnly: true,
    _doNotSubmitDirectly: "Copy this shape to ops/render-provider-graph-resume-enqueues.json only after replacing every placeholder with digest-only live deployment enqueue evidence, setting redactionReviewed=true after review, and removing all underscore-prefixed template fields.",
    schemaVersion: "cinejelly.render-provider-graph-resume-enqueue-evidence.v1",
    environmentKind: "deployment",
    deploymentBaseUrl: "https://replace-with-production-host.example",
    approvedBy: "replace-with-operator-name",
    approvedAt: placeholderTime,
    enqueues: [
      {
        enqueueId: "replace-with-live-enqueue-id",
        actionId: sourceContext.sampleActionBinding.actionId,
        jobId: sourceContext.sampleActionBinding.jobId,
        graphRunKind: "provider_work_resume",
        idempotencyKey: "replace-with-live-queue-idempotency-key",
        queueNameSha256: "replace-with-lowercase-sha256",
        graphStateSha256: "replace-with-lowercase-sha256",
        resumeCursorSha256: "replace-with-lowercase-sha256",
        predictionIdsSha256: "replace-with-lowercase-sha256",
        predictionIdCount: 1,
        resultStatus: "resume_enqueued",
        enqueuedAt: placeholderTime,
        evidenceSummary: "replace with redacted digest-only summary; no URLs, local paths, raw queue names, raw graph state, raw prediction IDs, provider payloads, output URLs, or secrets",
        redactionReviewed: false,
        rawGraphStateStored: false,
        rawProviderPayloadStored: false,
        outputUrlsStored: false
      }
    ]
  };
}

function buildChecklist(options, sourceContext) {
  return `# Graph-Resume Enqueue Evidence Fill-Out Checklist

This checklist is no-spend and no-network. It is not graph-resume enqueue evidence by itself.

Current live-action context:

- Live action report: \`${toRepoRelative(options.liveActionsReportPath)}\`
- Live action report status: \`${sourceContext.status}\`
- Usable graph-resume action evidence: \`${String(sourceContext.liveActionsGraphResumeEvidenceUsable)}\`
- Graph-resume execution count: \`${sourceContext.graphResumeExecutionCount}\`
- Deployment fingerprint present: \`${String(sourceContext.deploymentBaseUrlSha256Present)}\`
- Suggested actionId: \`${sourceContext.sampleActionBinding.actionId}\`
- Suggested jobId: \`${sourceContext.sampleActionBinding.jobId}\`
- Final evidence packet path: \`${toRepoRelative(options.evidencePath)}\`
- Template path: \`${toRepoRelative(options.templatePath)}\`

Fill-out steps:

1. Run or refresh \`npm.cmd run validation:provider-live-actions -- --evidence ops/render-provider-live-actions.json --confirm-live-provider-actions\` after the real deployment worker records a \`resume_polling\` + \`graph_resume_enqueue\` + \`resume_enqueued\` live action.
2. Copy the template shape into \`${toRepoRelative(options.evidencePath)}\`.
3. Remove every underscore-prefixed template field.
4. Use the same deployment base URL that produced the live-action deployment fingerprint.
5. Keep \`actionId\` and \`jobId\` matched to a passing live-action graph-resume execution.
6. Store only lower-case SHA-256 digests for queue name, graph state, resume cursor, and prediction IDs.
7. Set \`predictionIdCount\` to the number of live prediction IDs represented by \`predictionIdsSha256\`.
8. Keep \`rawGraphStateStored=false\`, \`rawProviderPayloadStored=false\`, and \`outputUrlsStored=false\`.
9. Set \`redactionReviewed=true\` only after checking that the packet contains no URLs, local paths, raw queue names, raw graph state, raw prediction IDs, provider payloads, output URLs, or secrets.
10. Run \`npm.cmd run validation:provider-graph-resume -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-graph-resume-enqueues\`.

This packet can make only the graph-resume payload evidence slice usable. It still cannot claim distributed resume, customer traffic, or automatic graph replay without deployed multi-worker ownership proof and the full business-readiness gate.
`;
}

function nextActionsFor(options, sourceContext, templateWrite, checklistWrite, issues) {
  const actions = [];
  if (!sourceContext.reportPresent) {
    actions.push(`Create live provider action evidence first with validation:provider-live-actions; expected report path is ${toRepoRelative(options.liveActionsReportPath)}.`);
  } else if (!sourceContext.liveActionsGraphResumeEvidenceUsable) {
    actions.push("Refresh live provider action evidence until it passes and includes usable graph-resume enqueue execution evidence.");
  }
  if (templateWrite.available !== true || checklistWrite.available !== true) {
    actions.push("Rerun this draft helper with --force or writable output paths so the graph-resume enqueue template and checklist are available.");
  }
  actions.push(`After live graph-resume enqueue executes, fill ${toRepoRelative(options.evidencePath)} from digest-only deployment evidence and remove _templateOnly fields.`);
  actions.push(`Run npm.cmd run validation:provider-graph-resume -- --evidence ${toRepoRelative(options.evidencePath)} --confirm-graph-resume-enqueues.`);
  actions.push("Keep distributed-resume parity unclaimed until production multi-worker ownership handoff and full business-readiness evidence pass.");
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
