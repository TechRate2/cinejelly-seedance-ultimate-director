/**
 * Production CLI entrypoint for Phase 6 paid render validation.
 * It runs readiness, one operator-supplied render request, artifact writing, and artifact validation.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactApiLocalPaths } from "../api/api-response-redaction.js";
import { renderRequestAdmissionFromEnv } from "../api/render-request-admission.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type {
  ProjectArtifactBundle,
  ProjectArtifactEntry,
  ProjectArtifactValidationCheck,
  ProjectArtifactValidationReport
} from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type { Phase6ValidationReadinessReport } from "../types/preflight.js";
import { writeFileEnsuringDirectory } from "../utils/files.js";
import { redactUnknown } from "../utils/redaction.js";
import { createDirectorRuntime } from "./director-factory.js";
import { normalizeRenderRequest } from "./render-request-normalizer.js";
import { RuntimePreflight } from "./runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "./validation-readiness-report.js";

type PaidRenderValidationStatus =
  | "blocked_by_readiness"
  | "blocked_by_readiness_warnings"
  | "completed"
  | "completed_with_artifact_validation_warning"
  | "completed_with_artifact_validation_failure"
  | "render_failed"
  | "failed";

interface PaidRenderValidationCliOptions {
  readonly requestPath: string;
  readonly outputPath?: string;
  readonly allowWarnings: boolean;
}

interface PaidRenderValidationReport {
  readonly schemaVersion: "cinejelly.phase6.paid-render-validation.v1";
  readonly generatedAt: Date;
  readonly status: PaidRenderValidationStatus;
  readonly sourcePatternOrigins: readonly string[];
  readonly requestId?: string | undefined;
  readonly readiness: Phase6ValidationReadinessReport;
  readonly artifactBundle?: ProjectArtifactBundleSummary;
  readonly artifactValidation?: ProjectArtifactValidationSummary;
  readonly costLedgerEntryCount?: number;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
  readonly error?: {
    readonly name: string;
    readonly message: string;
  };
  readonly nextActions: readonly string[];
}

interface ProjectArtifactBundleSummary {
  readonly projectId: string;
  readonly manifestFileName: "manifest.json";
  readonly entries: readonly ProjectArtifactEntry[];
}

interface ProjectArtifactValidationSummary {
  readonly status: ProjectArtifactValidationReport["status"];
  readonly checkedAt: Date;
  readonly projectId?: string;
  readonly checks: readonly ProjectArtifactValidationCheck[];
}

const SOURCE_PATTERN_ORIGINS = [
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo",
  "calesthio/OpenMontage"
] as const;

export async function runPaidRenderValidationCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const options = parseOptions(args);
  const requestBody = await readRequestJson(options.requestPath);
  renderRequestAdmissionFromEnv(env).assertAcceptable(requestBody);
  const normalizedRequest = normalizeRenderRequest(requestBody as CineJellyProjectRequest, {
    env,
    requestId: requestBody.metadata?.requestId
  });

  const readiness = new Phase6ValidationReadinessReporter().build(await new RuntimePreflight(env).run());
  if (readiness.decision === "blocked") {
    return emitReport(report({
      status: "blocked_by_readiness",
      readiness,
      requestId: normalizedRequest.metadata?.requestId,
      nextActions: readiness.nextActions
    }), options);
  }
  if (readiness.decision === "review_warnings" && !options.allowWarnings) {
    return emitReport(report({
      status: "blocked_by_readiness_warnings",
      readiness,
      requestId: normalizedRequest.metadata?.requestId,
      nextActions: [
        "Review readiness warnings.",
        "Rerun with --allow-warnings only when the operator accepts the warning state.",
        ...readiness.nextActions
      ]
    }), options);
  }

  return runPaidRender(normalizedRequest, readiness, options, env);
}

async function runPaidRender(
  request: CineJellyProjectRequest,
  readiness: Phase6ValidationReadinessReport,
  options: PaidRenderValidationCliOptions,
  env: NodeJS.ProcessEnv
): Promise<number> {
  const artifactStore = new ProjectArtifactStore();
  const artifactValidator = new ProjectArtifactValidator();
  const runtime = createDirectorRuntime(env);

  try {
    const result = await runtime.director.run(request);
    const costLedger = runtime.ledger.list();
    const artifacts = await artifactStore.writeRunArtifacts({
      result,
      costLedger,
      artifactDirectory: request.artifactDirectory as string
    });
    const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);
    return emitReport(report({
      status: statusForSuccessfulRender(artifactValidation),
      readiness,
      requestId: request.metadata?.requestId,
      artifactBundle: summarizeArtifacts(artifacts),
      artifactValidation: summarizeArtifactValidation(artifactValidation),
      costLedger,
      nextActions: nextActionsForArtifactValidation(artifactValidation)
    }), options);
  } catch (error) {
    const costLedger = runtime.ledger.list();
    try {
      const artifacts = await artifactStore.writeFailureArtifacts({
        request,
        costLedger,
        artifactDirectory: request.artifactDirectory as string,
        error,
        stage: "paid_validation_render_pipeline"
      });
      const artifactValidation = await artifactValidator.validate(artifacts.artifactDirectory);
      return emitReport(report({
        status: "render_failed",
        readiness,
        requestId: request.metadata?.requestId,
        artifactBundle: summarizeArtifacts(artifacts),
        artifactValidation: summarizeArtifactValidation(artifactValidation),
        costLedger,
        error: errorSummary(error),
        nextActions: [
          "Inspect failure-report.json, cost-ledger.json, and artifact validation output.",
          "Repair configuration, provider, prompt, reference, or media-tool blockers before rerunning paid validation."
        ]
      }), options);
    } catch (artifactError) {
      return emitReport(report({
        status: "failed",
        readiness,
        requestId: request.metadata?.requestId,
        costLedger,
        error: errorSummary(artifactError),
        nextActions: [
          "Artifact writing or validation failed after the render attempt.",
          "Inspect local operator logs and rerun validation only after artifact storage is writable."
        ]
      }), options);
    }
  }
}

function parseOptions(args: readonly string[]): PaidRenderValidationCliOptions {
  let requestPath: string | undefined;
  let outputPath: string | undefined;
  let allowWarnings = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--allow-warnings") {
      allowWarnings = true;
      continue;
    }
    if (arg === "--request") {
      requestPath = readOptionValue(args, index, "--request");
      index += 1;
      continue;
    }
    if (arg.startsWith("--request=")) {
      requestPath = arg.slice("--request=".length);
      continue;
    }
    if (arg === "--output") {
      outputPath = readOptionValue(args, index, "--output");
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
      continue;
    }
    throw new Error(`Unknown paid render validation option: ${arg}`);
  }

  if (!requestPath) {
    throw new Error(
      "Usage: npm.cmd run validation:paid-render -- --request <request-json-path> [--allow-warnings] [--output <report-path>]"
    );
  }
  return {
    requestPath,
    ...(outputPath ? { outputPath } : {}),
    allowWarnings
  };
}

function readOptionValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(
      `Usage: npm.cmd run validation:paid-render -- ${flag} <value>`
    );
  }
  return value;
}

async function readRequestJson(requestPath: string): Promise<CineJellyProjectRequest> {
  const raw = (await readFile(requestPath, "utf8")).replace(/^\uFEFF/, "");
  if (!raw.trim()) {
    throw new Error("Paid render validation request file cannot be empty.");
  }
  try {
    return JSON.parse(raw) as CineJellyProjectRequest;
  } catch {
    throw new Error("Paid render validation request file must contain valid JSON.");
  }
}

function report(input: {
  readonly status: PaidRenderValidationStatus;
  readonly readiness: Phase6ValidationReadinessReport;
  readonly requestId?: string | undefined;
  readonly artifactBundle?: ProjectArtifactBundleSummary;
  readonly artifactValidation?: ProjectArtifactValidationSummary;
  readonly costLedger?: readonly CostLedgerEntry[];
  readonly error?: {
    readonly name: string;
    readonly message: string;
  };
  readonly nextActions: readonly string[];
}): PaidRenderValidationReport {
  const costSummary = summarizeCost(input.costLedger ?? []);
  return {
    schemaVersion: "cinejelly.phase6.paid-render-validation.v1",
    generatedAt: new Date(),
    status: input.status,
    sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    readiness: input.readiness,
    ...(input.artifactBundle ? { artifactBundle: input.artifactBundle } : {}),
    ...(input.artifactValidation ? { artifactValidation: input.artifactValidation } : {}),
    ...(input.costLedger ? { costLedgerEntryCount: input.costLedger.length } : {}),
    ...(costSummary.estimatedCostUsd !== undefined ? { estimatedCostUsd: costSummary.estimatedCostUsd } : {}),
    ...(costSummary.actualCostUsd !== undefined ? { actualCostUsd: costSummary.actualCostUsd } : {}),
    ...(input.error ? { error: input.error } : {}),
    nextActions: input.nextActions
  };
}

async function emitReport(reportValue: PaidRenderValidationReport, options: PaidRenderValidationCliOptions): Promise<number> {
  const safeReport = redactApiLocalPaths(redactUnknown(reportValue));
  const serialized = `${JSON.stringify(safeReport, null, 2)}\n`;
  if (options.outputPath) {
    await writeFileEnsuringDirectory(options.outputPath, serialized);
  }
  process.stdout.write(serialized);
  return exitCodeForStatus(reportValue.status);
}

function exitCodeForStatus(status: PaidRenderValidationStatus): number {
  return status === "completed" || status === "completed_with_artifact_validation_warning" ? 0 : 1;
}

function statusForSuccessfulRender(reportValue: ProjectArtifactValidationReport): PaidRenderValidationStatus {
  if (reportValue.status === "fail") {
    return "completed_with_artifact_validation_failure";
  }
  if (reportValue.status === "warn") {
    return "completed_with_artifact_validation_warning";
  }
  return "completed";
}

function nextActionsForArtifactValidation(reportValue: ProjectArtifactValidationReport): readonly string[] {
  if (reportValue.status === "pass") {
    return [
      "Inspect review-packet.json, run-summary.json, cost-ledger.json, deliverable metadata, and rendered media quality.",
      "Do not release to customer traffic until manual artifact/redaction review is complete."
    ];
  }
  if (reportValue.status === "warn") {
    return [
      "Review artifact validation warnings manually.",
      "Resolve or explicitly accept warnings before release approval."
    ];
  }
  return [
    "Fix artifact validation failures.",
    "Rerun paid validation after artifact evidence passes or warnings are explicitly accepted."
  ];
}

function summarizeArtifacts(artifacts: ProjectArtifactBundle): ProjectArtifactBundleSummary {
  return {
    projectId: artifacts.projectId,
    manifestFileName: "manifest.json",
    entries: artifacts.entries
  };
}

function summarizeArtifactValidation(reportValue: ProjectArtifactValidationReport): ProjectArtifactValidationSummary {
  return {
    status: reportValue.status,
    checkedAt: reportValue.checkedAt,
    ...(reportValue.projectId ? { projectId: reportValue.projectId } : {}),
    checks: reportValue.checks
  };
}

function summarizeCost(costLedger: readonly CostLedgerEntry[]): {
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
} {
  const estimatedCostUsd = sumOptional(costLedger.map((entry) => entry.estimatedCostUsd));
  const actualCostUsd = sumOptional(costLedger.map((entry) => entry.actualCostUsd));
  return {
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    ...(actualCostUsd !== undefined ? { actualCostUsd } : {})
  };
}

function sumOptional(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) {
    return undefined;
  }
  return Number(present.reduce((sum, value) => sum + value, 0).toFixed(6));
}

function errorSummary(error: unknown): {
  readonly name: string;
  readonly message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return {
    name: "UnknownError",
    message: String(error)
  };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runPaidRenderValidationCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify(
          {
            status: "failed",
            error: redactApiLocalPaths(redactUnknown(error instanceof Error ? error.message : String(error)))
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    });
}
