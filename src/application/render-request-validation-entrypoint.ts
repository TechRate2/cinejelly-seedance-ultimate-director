/**
 * Production CLI entrypoint for validating an operator render request before paid validation.
 * It performs request admission and path normalization only; it never creates runtime providers.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactApiLocalPaths } from "../api/api-response-redaction.js";
import { renderRequestAdmissionFromEnv } from "../api/render-request-admission.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import { writeFileEnsuringDirectory } from "../utils/files.js";
import { redactUnknown } from "../utils/redaction.js";
import { normalizeRenderRequest } from "./render-request-normalizer.js";

type RenderRequestValidationStatus = "pass" | "fail";

interface RenderRequestValidationCliOptions {
  readonly requestPath: string;
  readonly outputPath?: string;
}

interface RenderRequestValidationIssue {
  readonly code: string;
  readonly message: string;
}

interface RenderRequestValidationReport {
  readonly schemaVersion: "cinejelly.phase6.render-request-validation.v1";
  readonly generatedAt: Date;
  readonly status: RenderRequestValidationStatus;
  readonly sourcePatternOrigins: readonly string[];
  readonly requestId?: string | undefined;
  readonly normalizedSummary?: RenderRequestNormalizedSummary;
  readonly issues: readonly RenderRequestValidationIssue[];
  readonly nextActions: readonly string[];
}

interface RenderRequestNormalizedSummary {
  readonly hasOutputPath: boolean;
  readonly hasWorkDirectory: boolean;
  readonly hasArtifactDirectory: boolean;
  readonly referenceCount: number;
  readonly captionCueCount: number;
  readonly audioTrackCount: number;
  readonly generatedAudioIntentCount: number;
  readonly sourceVideoAnalysisPresent: boolean;
  readonly semanticVisualInspectionEnabled: boolean;
}

const SOURCE_PATTERN_ORIGINS = [
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo",
  "calesthio/OpenMontage"
] as const;

export async function runRenderRequestValidationCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const options = parseOptions(args);
  const report = await validateRenderRequestFile(options.requestPath, env);
  await emitReport(report, options);
  return report.status === "pass" ? 0 : 1;
}

export async function validateRenderRequestFile(
  requestPath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<RenderRequestValidationReport> {
  let request: CineJellyProjectRequest;
  try {
    request = await readRequestJson(requestPath);
  } catch (error) {
    return failureReport("request_json_invalid", errorSummary(error), undefined);
  }

  try {
    renderRequestAdmissionFromEnv(env).assertAcceptable(request);
    const normalized = normalizeRenderRequest(request, {
      env,
      requestId: request.metadata?.requestId
    });
    return {
      schemaVersion: "cinejelly.phase6.render-request-validation.v1",
      generatedAt: new Date(),
      status: "pass",
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      requestId: normalized.metadata?.requestId,
      normalizedSummary: summarizeRequest(normalized),
      issues: [],
      nextActions: [
        "Run npm.cmd run validation:readiness.",
        "Run npm.cmd run validation:paid-render -- --request <request-json> --confirm-paid-spend only when readiness allows paid validation and the operator has approved Atlas credit spend."
      ]
    };
  } catch (error) {
    return failureReport("request_admission_failed", errorSummary(error), request.metadata?.requestId);
  }
}

function parseOptions(args: readonly string[]): RenderRequestValidationCliOptions {
  let requestPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
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
    throw new Error(`Unknown render request validation option: ${arg}`);
  }

  if (!requestPath) {
    throw new Error(
      "Usage: npm.cmd run validation:render-request -- --request <request-json-path> [--output <report-path>]"
    );
  }
  return {
    requestPath,
    ...(outputPath ? { outputPath } : {})
  };
}

function readOptionValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Usage: npm.cmd run validation:render-request -- ${flag} <value>`);
  }
  return value;
}

async function readRequestJson(requestPath: string): Promise<CineJellyProjectRequest> {
  const raw = (await readFile(requestPath, "utf8")).replace(/^\uFEFF/, "");
  if (!raw.trim()) {
    throw new Error("Render request file cannot be empty.");
  }
  try {
    return JSON.parse(raw) as CineJellyProjectRequest;
  } catch {
    throw new Error("Render request file must contain valid JSON.");
  }
}

function summarizeRequest(request: CineJellyProjectRequest): RenderRequestNormalizedSummary {
  return {
    hasOutputPath: Boolean(request.outputPath),
    hasWorkDirectory: Boolean(request.workDirectory),
    hasArtifactDirectory: Boolean(request.artifactDirectory),
    referenceCount: request.references?.length ?? 0,
    captionCueCount: request.captionCues?.length ?? 0,
    audioTrackCount: request.audioTracks?.length ?? 0,
    generatedAudioIntentCount: request.generatedAudioIntents?.length ?? 0,
    sourceVideoAnalysisPresent: Boolean(request.sourceVideoAnalysis),
    semanticVisualInspectionEnabled: request.semanticVisualInspectionOptions?.enabled === true
  };
}

function failureReport(
  code: string,
  message: string,
  requestId: string | undefined
): RenderRequestValidationReport {
  return {
    schemaVersion: "cinejelly.phase6.render-request-validation.v1",
    generatedAt: new Date(),
    status: "fail",
    sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
    ...(requestId ? { requestId } : {}),
    issues: [
      {
        code,
        message
      }
    ],
    nextActions: [
      "Fix the request file.",
      "Rerun npm.cmd run validation:render-request -- --request <request-json> before paid validation."
    ]
  };
}

async function emitReport(
  report: RenderRequestValidationReport,
  options: RenderRequestValidationCliOptions
): Promise<void> {
  const safeReport = redactApiLocalPaths(redactUnknown(report));
  const serialized = `${JSON.stringify(safeReport, null, 2)}\n`;
  if (options.outputPath) {
    await writeFileEnsuringDirectory(options.outputPath, serialized);
  }
  process.stdout.write(serialized);
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runRenderRequestValidationCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify(
          {
            status: "fail",
            error: redactApiLocalPaths(redactUnknown(error instanceof Error ? error.message : String(error)))
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    });
}
