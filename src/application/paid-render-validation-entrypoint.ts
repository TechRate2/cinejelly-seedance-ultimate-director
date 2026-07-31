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
import { validateConfiguredAtlasModels } from "./atlas-model-preflight.js";
import { loadAtlasCloudSettings } from "../config/runtime-config.js";
import { normalizeRenderRequest } from "./render-request-normalizer.js";
import { RuntimePreflight } from "./runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "./validation-readiness-report.js";
import {
  internalSourcePatternOrigins,
  PHASE6_RENDER_VALIDATION_SOURCE_PATTERN_IDS
} from "../core/private-source-pattern-registry.js";

type PaidRenderValidationStatus =
  | "blocked_by_readiness"
  | "blocked_by_readiness_warnings"
  | "blocked_by_spend_confirmation"
  | "blocked_by_atlas_billing"
  | "blocked_by_model_validation"
  | "completed"
  | "completed_with_artifact_validation_warning"
  | "completed_with_artifact_validation_failure"
  | "render_failed"
  | "failed";

interface PaidRenderValidationCliOptions {
  readonly requestPath: string;
  readonly outputPath?: string;
  readonly allowWarnings: boolean;
  readonly confirmPaidSpend: boolean;
  readonly atlasBillingReportPath: string;
  readonly atlasBillingEvidenceMaxAgeHours: number;
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
  readonly atlasBillingGate?: AtlasBillingGateSummary;
  readonly costLedgerEntryCount?: number;
  readonly renderStartedAt?: Date;
  readonly renderFinishedAt?: Date;
  readonly renderDurationMs?: number;
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

interface AtlasBillingGateSummary {
  readonly path: string;
  readonly present: boolean;
  readonly status: string;
  readonly schemaVersion?: string;
  readonly reportGeneratedAt?: string;
  readonly maxAgeHours: number;
  readonly reportAgeHours?: number;
  readonly freshForPaidValidation?: boolean;
  readonly reportPlannedCostUsd?: number;
  readonly currentMaxCostUsd?: number;
  readonly plannedCostWithinRequestCap?: boolean;
  readonly reportMaxBudgetUsd?: number;
  readonly budgetCoversRequestCap?: boolean;
  readonly networkCallsMade?: boolean;
  readonly canUseAsPrePaidAtlasBillingEvidence: boolean;
  readonly checks: readonly AtlasBillingGateCheck[];
}

interface AtlasBillingGateCheck {
  readonly name: string;
  readonly status: "pass" | "fail";
  readonly message: string;
}

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(PHASE6_RENDER_VALIDATION_SOURCE_PATTERN_IDS);

const DEFAULT_ATLAS_BILLING_REPORT_PATH = "assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json";
const DEFAULT_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS = 24;

export async function runPaidRenderValidationCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const options = parseOptions(args, env);
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
  if (!options.confirmPaidSpend) {
    const atlasBillingGate = skippedAtlasBillingGate(options, requestMaxCostUsd(normalizedRequest));
    return emitReport(report({
      status: "blocked_by_spend_confirmation",
      readiness,
      requestId: normalizedRequest.metadata?.requestId,
      atlasBillingGate,
      nextActions: [
        "Review the request file, local smoke report, readiness report, expected Atlas credit spend, and operator approval.",
        "Refresh Atlas billing readiness with validation:atlas-billing before enabling paid render spend.",
        "Rerun with --confirm-paid-spend only after explicit approval to spend Atlas credits.",
        "Do not use this flag for routine local smoke or request validation."
      ]
    }), options);
  }

  const atlasBillingGate = await summarizeAtlasBillingGate(options, normalizedRequest);
  if (atlasBillingGate.checks.some((check) => check.status === "fail")) {
    return emitReport(report({
      status: "blocked_by_atlas_billing",
      readiness,
      requestId: normalizedRequest.metadata?.requestId,
      atlasBillingGate,
      nextActions: atlasBillingGate.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.message)
    }), options);
  }

  // Pre-spend model-existence probe (no spend): a stale-but-well-formed model id passes readiness and
  // the billing gate but fails at the first live provider call after burning the LLM plan call and
  // keyframe images. Block a confirmed-missing model id here instead (final live-audit gap #6).
  const modelValidation = await validateConfiguredAtlasModels(loadAtlasCloudSettings(env));
  if (!modelValidation.ok) {
    return emitReport(report({
      status: "blocked_by_model_validation",
      readiness,
      requestId: normalizedRequest.metadata?.requestId,
      atlasBillingGate,
      nextActions: [
        ...modelValidation.missing.map(
          (missing) =>
            `Configured ${missing.field} "${missing.modelId}" is not on the account's ${missing.endpoint} model list; set a valid model id (GET /models to list available ids) before paid render.`
        ),
        ...modelValidation.notes
      ]
    }), options);
  }

  return runPaidRender(normalizedRequest, readiness, options, env, atlasBillingGate);
}

async function runPaidRender(
  request: CineJellyProjectRequest,
  readiness: Phase6ValidationReadinessReport,
  options: PaidRenderValidationCliOptions,
  env: NodeJS.ProcessEnv,
  atlasBillingGate: AtlasBillingGateSummary
): Promise<number> {
  const artifactStore = new ProjectArtifactStore();
  const artifactValidator = new ProjectArtifactValidator();
  const runtime = createDirectorRuntime(env);
  const renderStartedAt = new Date();

  try {
    const result = await runtime.director.run(request);
    const renderFinishedAt = new Date();
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
      atlasBillingGate,
      artifactBundle: summarizeArtifacts(artifacts),
      artifactValidation: summarizeArtifactValidation(artifactValidation),
      costLedger,
      renderStartedAt,
      renderFinishedAt,
      ...(result.costEstimate.estimatedTotalCostUsd !== undefined
        ? { estimatedCostUsd: result.costEstimate.estimatedTotalCostUsd }
        : {}),
      nextActions: nextActionsForArtifactValidation(artifactValidation)
    }), options);
  } catch (error) {
    const renderFinishedAt = new Date();
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
        atlasBillingGate,
        artifactBundle: summarizeArtifacts(artifacts),
        artifactValidation: summarizeArtifactValidation(artifactValidation),
        costLedger,
        renderStartedAt,
        renderFinishedAt,
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
        atlasBillingGate,
        costLedger,
        renderStartedAt,
        renderFinishedAt,
        error: errorSummary(artifactError),
        nextActions: [
          "Artifact writing or validation failed after the render attempt.",
          "Inspect local operator logs and rerun validation only after artifact storage is writable."
        ]
      }), options);
    }
  }
}

function parseOptions(args: readonly string[], env: NodeJS.ProcessEnv): PaidRenderValidationCliOptions {
  let requestPath: string | undefined;
  let outputPath: string | undefined;
  let allowWarnings = false;
  let confirmPaidSpend = false;
  let atlasBillingReportPath = DEFAULT_ATLAS_BILLING_REPORT_PATH;
  let atlasBillingEvidenceMaxAgeHours = parsePositiveNumber(
    env.CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS,
    DEFAULT_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS
  );

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--allow-warnings") {
      allowWarnings = true;
      continue;
    }
    if (arg === "--confirm-paid-spend") {
      confirmPaidSpend = true;
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
    if (arg === "--atlas-billing-report") {
      atlasBillingReportPath = readOptionValue(args, index, "--atlas-billing-report");
      index += 1;
      continue;
    }
    if (arg.startsWith("--atlas-billing-report=")) {
      atlasBillingReportPath = arg.slice("--atlas-billing-report=".length);
      continue;
    }
    if (arg === "--atlas-billing-evidence-max-age-hours") {
      atlasBillingEvidenceMaxAgeHours = Number(readOptionValue(args, index, "--atlas-billing-evidence-max-age-hours"));
      index += 1;
      continue;
    }
    if (arg.startsWith("--atlas-billing-evidence-max-age-hours=")) {
      atlasBillingEvidenceMaxAgeHours = Number(arg.slice("--atlas-billing-evidence-max-age-hours=".length));
      continue;
    }
    throw new Error(`Unknown paid render validation option: ${arg}`);
  }

  if (!requestPath) {
    throw new Error(
      "Usage: npm.cmd run validation:paid-render -- --request <request-json-path> --confirm-paid-spend [--allow-warnings] [--atlas-billing-report <report-path>] [--output <report-path>]"
    );
  }
  if (!Number.isFinite(atlasBillingEvidenceMaxAgeHours) || atlasBillingEvidenceMaxAgeHours <= 0) {
    throw new Error("--atlas-billing-evidence-max-age-hours must be a positive number.");
  }
  return {
    requestPath,
    ...(outputPath ? { outputPath } : {}),
    allowWarnings,
    confirmPaidSpend,
    atlasBillingReportPath,
    atlasBillingEvidenceMaxAgeHours
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

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
    if (!raw.trim()) {
      return undefined;
    }
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

function skippedAtlasBillingGate(
  options: PaidRenderValidationCliOptions,
  currentMaxCostUsd: number | undefined
): AtlasBillingGateSummary {
  return {
    path: options.atlasBillingReportPath,
    present: false,
    status: "skipped",
    ...(currentMaxCostUsd !== undefined ? { currentMaxCostUsd } : {}),
    maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
    canUseAsPrePaidAtlasBillingEvidence: false,
    checks: []
  };
}

async function summarizeAtlasBillingGate(
  options: PaidRenderValidationCliOptions,
  request: CineJellyProjectRequest
): Promise<AtlasBillingGateSummary> {
  const currentMaxCostUsd = requestMaxCostUsd(request);
  const budgetCapValid = currentMaxCostUsd !== undefined && currentMaxCostUsd > 0;
  const budgetCapCheck = budgetCapValid
    ? pass("atlas_billing_paid_render_request_cost_cap", `Paid render request maxCostUsd is ${formatUsd(currentMaxCostUsd)}.`)
    : fail("atlas_billing_paid_render_request_cost_cap", "The request settings.maxCostUsd must be a positive number before paid render validation.");
  const reportValue = await readJsonIfExists(options.atlasBillingReportPath);
  if (!reportValue) {
    return {
      path: options.atlasBillingReportPath,
      present: false,
      status: "missing",
      ...(currentMaxCostUsd !== undefined ? { currentMaxCostUsd } : {}),
      maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
      canUseAsPrePaidAtlasBillingEvidence: false,
      checks: [
        budgetCapCheck,
        fail(
          "atlas_billing_report_present",
          `Missing Atlas billing readiness report for paid render validation at ${options.atlasBillingReportPath}. Run validation:atlas-billing with --max-budget-usd ${formatNumber(currentMaxCostUsd)} --planned-cost-usd <estimated-paid-render-cost-usd> before provider spend.`
        )
      ]
    };
  }

  const releaseGateSummary = asObject(reportValue.releaseGateSummary);
  const atlasBillingPublicApi = asObject(reportValue.atlasBillingPublicApi);
  const checkedInputs = asObject(reportValue.checkedInputs);
  const costPlan = asObject(reportValue.costPlan);
  const reportPlannedCostUsd = numberOrUndefined(checkedInputs?.plannedCostUsd ?? costPlan?.plannedCostUsd);
  const reportMaxBudgetUsd = numberOrUndefined(checkedInputs?.maxBudgetUsd ?? costPlan?.maxBudgetUsd);
  const reportGeneratedAt = typeof reportValue.generatedAt === "string" ? reportValue.generatedAt : undefined;
  const generatedAtMs = reportGeneratedAt ? Date.parse(reportGeneratedAt) : Number.NaN;
  const validGeneratedAt = Number.isFinite(generatedAtMs);
  const rawAgeHours = validGeneratedAt ? (Date.now() - generatedAtMs) / 3600000 : undefined;
  const reportAgeHours = typeof rawAgeHours === "number" && Number.isFinite(rawAgeHours) ? Math.max(0, rawAgeHours) : undefined;
  const clockSkewOk = typeof rawAgeHours === "number" && rawAgeHours >= -0.083333;
  const freshForPaidValidation =
    validGeneratedAt && clockSkewOk && reportAgeHours !== undefined && reportAgeHours <= options.atlasBillingEvidenceMaxAgeHours;
  const schemaOk = reportValue.schemaVersion === "cinejelly.atlas-billing-readiness.v1";
  const statusOk = reportValue.status === "pass" && releaseGateSummary?.canUseAsPrePaidAtlasBillingEvidence === true;
  const networkOk =
    reportValue.networkCallsMade === true &&
    reportValue.providerCallsMade === false &&
    atlasBillingPublicApi?.captured === true &&
    atlasBillingPublicApi?.httpStatus === 200;
  const plannedCostPositive = reportPlannedCostUsd !== undefined && reportPlannedCostUsd > 0;
  const plannedCostWithinRequestCap = Boolean(
    budgetCapValid &&
      plannedCostPositive &&
      reportPlannedCostUsd !== undefined &&
      reportPlannedCostUsd <= currentMaxCostUsd + 0.000001
  );
  const budgetCoversRequestCap = Boolean(
    budgetCapValid &&
      reportMaxBudgetUsd !== undefined &&
      reportMaxBudgetUsd >= currentMaxCostUsd - 0.000001
  );
  const checks = [
    budgetCapCheck,
    schemaOk
      ? pass("atlas_billing_report_schema", "Atlas billing readiness report schema is recognized.")
      : fail("atlas_billing_report_schema", "Atlas billing readiness report schemaVersion is missing or unrecognized."),
    freshForPaidValidation
      ? pass("atlas_billing_report_fresh", "Atlas billing readiness report is fresh enough for paid render spend.")
      : fail(
        "atlas_billing_report_fresh",
        atlasBillingFreshnessMessage({
          reportGeneratedAt,
          validGeneratedAt,
          clockSkewOk,
          reportAgeHours,
          maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
          currentMaxCostUsd
        })
      ),
    statusOk
      ? pass("atlas_billing_report_status", "Atlas billing readiness report passed.")
      : fail("atlas_billing_report_status", `Atlas billing readiness report status is ${String(reportValue.status ?? "missing")}.`),
    networkOk
      ? pass("atlas_billing_report_balance_capture", "Atlas billing readiness report captured a no-spend /balance response.")
      : fail("atlas_billing_report_balance_capture", "Atlas billing readiness report did not capture a successful no-spend /balance response."),
    plannedCostPositive
      ? pass("atlas_billing_planned_cost_positive", `Atlas billing planned cost is ${formatUsd(reportPlannedCostUsd)}.`)
      : fail("atlas_billing_planned_cost_positive", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} must be positive for paid render validation.`),
    plannedCostWithinRequestCap
      ? pass("atlas_billing_planned_cost_within_paid_render_cap", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} is within request maxCostUsd ${formatUsd(currentMaxCostUsd)}.`)
      : fail("atlas_billing_planned_cost_within_paid_render_cap", `Atlas billing planned cost ${formatUsd(reportPlannedCostUsd)} exceeds or cannot be compared with request maxCostUsd ${formatUsd(currentMaxCostUsd)}.`),
    budgetCoversRequestCap
      ? pass("atlas_billing_budget_covers_paid_render_cap", `Atlas billing approved budget covers request maxCostUsd ${formatUsd(currentMaxCostUsd)}.`)
      : fail("atlas_billing_budget_covers_paid_render_cap", `Atlas billing approved budget ${formatUsd(reportMaxBudgetUsd)} does not cover request maxCostUsd ${formatUsd(currentMaxCostUsd)}.`)
  ];
  return {
    path: options.atlasBillingReportPath,
    present: true,
    ...(typeof reportValue.schemaVersion === "string" ? { schemaVersion: reportValue.schemaVersion } : {}),
    status: String(reportValue.status ?? "unknown"),
    ...(reportGeneratedAt ? { reportGeneratedAt } : {}),
    maxAgeHours: options.atlasBillingEvidenceMaxAgeHours,
    ...(reportAgeHours !== undefined ? { reportAgeHours } : {}),
    freshForPaidValidation,
    ...(reportPlannedCostUsd !== undefined ? { reportPlannedCostUsd } : {}),
    ...(currentMaxCostUsd !== undefined ? { currentMaxCostUsd } : {}),
    plannedCostWithinRequestCap,
    ...(reportMaxBudgetUsd !== undefined ? { reportMaxBudgetUsd } : {}),
    budgetCoversRequestCap,
    networkCallsMade: reportValue.networkCallsMade === true,
    canUseAsPrePaidAtlasBillingEvidence: checks.every((check) => check.status === "pass"),
    checks
  };
}

function atlasBillingFreshnessMessage(input: {
  readonly reportGeneratedAt: string | undefined;
  readonly validGeneratedAt: boolean;
  readonly clockSkewOk: boolean;
  readonly reportAgeHours: number | undefined;
  readonly maxAgeHours: number;
  readonly currentMaxCostUsd: number | undefined;
}): string {
  const command = `npm.cmd run validation:atlas-billing -- --max-budget-usd ${formatNumber(input.currentMaxCostUsd)} --planned-cost-usd <estimated-paid-render-cost-usd> --output ${DEFAULT_ATLAS_BILLING_REPORT_PATH} --confirm-live-network`;
  if (!input.validGeneratedAt) {
    return `Atlas billing readiness report is missing a valid generatedAt timestamp. Rerun ${command}.`;
  }
  if (!input.clockSkewOk) {
    return `Atlas billing readiness report timestamp is in the future (${input.reportGeneratedAt}). Rerun ${command}.`;
  }
  return `Atlas billing readiness report is too old for paid render spend: generatedAt ${input.reportGeneratedAt}, age ${formatHours(input.reportAgeHours)}, max age ${formatHours(input.maxAgeHours)}. Rerun ${command}.`;
}

function requestMaxCostUsd(request: CineJellyProjectRequest): number | undefined {
  return numberOrUndefined(request.settings?.maxCostUsd);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pass(name: string, message: string): AtlasBillingGateCheck {
  return { name, status: "pass", message };
}

function fail(name: string, message: string): AtlasBillingGateCheck {
  return { name, status: "fail", message };
}

function formatUsd(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "unavailable" : `$${formatNumber(value)}`;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  return Number(value.toFixed(6)).toString();
}

function formatHours(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  return `${Number(value.toFixed(2))}h`;
}

function report(input: {
  readonly status: PaidRenderValidationStatus;
  readonly readiness: Phase6ValidationReadinessReport;
  readonly requestId?: string | undefined;
  readonly artifactBundle?: ProjectArtifactBundleSummary;
  readonly artifactValidation?: ProjectArtifactValidationSummary;
  readonly atlasBillingGate?: AtlasBillingGateSummary;
  readonly costLedger?: readonly CostLedgerEntry[];
  readonly renderStartedAt?: Date;
  readonly renderFinishedAt?: Date;
  readonly estimatedCostUsd?: number;
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
    ...(input.atlasBillingGate ? { atlasBillingGate: input.atlasBillingGate } : {}),
    ...(input.costLedger ? { costLedgerEntryCount: input.costLedger.length } : {}),
    ...(input.renderStartedAt ? { renderStartedAt: input.renderStartedAt } : {}),
    ...(input.renderFinishedAt ? { renderFinishedAt: input.renderFinishedAt } : {}),
    ...(input.renderStartedAt && input.renderFinishedAt
      ? { renderDurationMs: Math.max(0, input.renderFinishedAt.getTime() - input.renderStartedAt.getTime()) }
      : {}),
    ...(costSummary.estimatedCostUsd !== undefined || input.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: costSummary.estimatedCostUsd ?? input.estimatedCostUsd }
      : {}),
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
