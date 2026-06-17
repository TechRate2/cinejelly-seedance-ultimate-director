/**
 * Optional file-backed retained job history for API operators.
 * It persists compact, redacted job summaries only; raw requests, local artifact paths, and provider payloads stay out.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PRODUCTION_STAGE_ORDER,
  type ProductionStageName,
  type ProductionStageStatus
} from "../types/stage.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import type { RenderJobProviderCheckpoint, RenderJobStatus, RenderJobSummary } from "./render-job-manager.js";

export const RENDER_JOB_HISTORY_SCHEMA_VERSION = "cinejelly.render-job-history.v1";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const JOB_ID_PATTERN = /^render_job_[0-9a-fA-F-]{36}$/;
const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_.:-]{8,160}$/;
const MAX_PREVIEW_CHARS = 160;
const MAX_STAGE_PROGRESS_EVENTS = 200;
const MAX_PROVIDER_CHECKPOINT_ITEMS = 50;
const EMBEDDED_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\s"',;)]*/g;
const EMBEDDED_UNC_PATH_PATTERN = /\\\\[^\s"',;)]*/g;
const EMBEDDED_POSIX_PATH_PATTERN = /(^|\s)(\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+)/g;
const PRODUCTION_STAGE_STATUSES: readonly ProductionStageStatus[] = [
  "pending",
  "running",
  "succeeded",
  "warn",
  "blocked",
  "failed",
  "skipped"
];

export interface RenderJobStoredSummary {
  readonly jobId: string;
  readonly clientId?: string;
  readonly requestId?: string;
  readonly status: RenderJobStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly projectId?: string;
  readonly userInputPreview: string;
  readonly requestedDurationSeconds?: number;
  readonly requestedQualityMode?: string;
  readonly requestedResolution?: string;
  readonly referenceCount: number;
  readonly stageProgressEvents: readonly RenderJobStoredProgressEvent[];
  readonly hasResult: boolean;
  readonly hasCostLedger: boolean;
  readonly providerCheckpoint?: RenderJobProviderCheckpoint;
  readonly hasArtifacts: boolean;
  readonly hasArtifactValidation: boolean;
  readonly artifactValidationStatus?: "pass" | "warn" | "fail";
  readonly hasError: boolean;
  readonly error?: unknown;
}

export interface RenderJobStoredProgressEvent {
  readonly sequence: number;
  readonly stage: ProductionStageName;
  readonly order: number;
  readonly status: ProductionStageStatus;
  readonly recordedAt: Date;
  readonly message: string;
  readonly sourcePatternOrigins: readonly string[];
  readonly evidence?: Readonly<Record<string, string | number | boolean | readonly string[] | readonly number[]>>;
}

interface RenderJobHistoryFile {
  readonly schemaVersion: typeof RENDER_JOB_HISTORY_SCHEMA_VERSION;
  readonly writtenAt: string;
  readonly jobs: readonly unknown[];
}

export class RenderJobHistoryStore {
  public readonly historyPath: string;
  private readonly historyLimit: number;

  public constructor(input: { readonly historyPath: string; readonly historyLimit?: number }) {
    const configuredPath = input.historyPath.trim();
    if (!configuredPath) {
      throw new Error("CINEJELLY_API_JOB_HISTORY_PATH cannot be empty when configured.");
    }
    if (CONTROL_CHARACTER_PATTERN.test(configuredPath)) {
      throw new Error("CINEJELLY_API_JOB_HISTORY_PATH must not contain control characters.");
    }
    this.historyPath = resolve(configuredPath);
    this.historyLimit = Math.max(10, input.historyLimit ?? 100);
  }

  public load(): readonly RenderJobStoredSummary[] {
    let text: string;
    try {
      text = readFileSync(this.historyPath, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) {
        return [];
      }
      throw new Error(`Render job history file cannot be read: ${errorMessage(error)}`);
    }
    if (!text.trim()) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Render job history file must be valid JSON.");
    }
    const history = this.historyFile(parsed);
    return history.jobs
      .map((job) => this.storedSummary(job))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, this.historyLimit);
  }

  public save(summaries: readonly RenderJobSummary[]): void {
    const jobs = summaries
      .map((summary) => this.publicStoredSummary(summary))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, this.historyLimit);
    const payload = {
      schemaVersion: RENDER_JOB_HISTORY_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      jobs: jobs.map((job) => this.serializableStoredSummary(job))
    };
    mkdirSync(dirname(this.historyPath), { recursive: true });
    const tempPath = `${this.historyPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.historyPath);
  }

  private publicStoredSummary(summary: RenderJobSummary): RenderJobStoredSummary {
    const redacted = this.redactHistoryValue(summary) as Record<string, unknown>;
    return this.storedSummary(redacted);
  }

  private serializableStoredSummary(summary: RenderJobStoredSummary): Record<string, unknown> {
    return {
      jobId: summary.jobId,
      ...(summary.clientId ? { clientId: summary.clientId } : {}),
      ...(summary.requestId ? { requestId: summary.requestId } : {}),
      status: summary.status,
      createdAt: summary.createdAt.toISOString(),
      updatedAt: summary.updatedAt.toISOString(),
      ...(summary.startedAt ? { startedAt: summary.startedAt.toISOString() } : {}),
      ...(summary.completedAt ? { completedAt: summary.completedAt.toISOString() } : {}),
      ...(summary.projectId ? { projectId: summary.projectId } : {}),
      userInputPreview: summary.userInputPreview,
      ...(summary.requestedDurationSeconds !== undefined
        ? { requestedDurationSeconds: summary.requestedDurationSeconds }
        : {}),
      ...(summary.requestedQualityMode ? { requestedQualityMode: summary.requestedQualityMode } : {}),
      ...(summary.requestedResolution ? { requestedResolution: summary.requestedResolution } : {}),
      referenceCount: summary.referenceCount,
      stageProgressEvents: summary.stageProgressEvents.map((event) => ({
        ...event,
        recordedAt: event.recordedAt.toISOString()
      })),
      hasResult: summary.hasResult,
      hasCostLedger: summary.hasCostLedger,
      ...(summary.providerCheckpoint
        ? { providerCheckpoint: this.serializableProviderCheckpoint(summary.providerCheckpoint) }
        : {}),
      hasArtifacts: summary.hasArtifacts,
      hasArtifactValidation: summary.hasArtifactValidation,
      ...(summary.artifactValidationStatus ? { artifactValidationStatus: summary.artifactValidationStatus } : {}),
      hasError: summary.hasError,
      ...(summary.error !== undefined ? { error: summary.error } : {})
    };
  }

  private historyFile(value: unknown): RenderJobHistoryFile {
    const payload = this.objectRecord(value, "Render job history file");
    if (payload.schemaVersion !== RENDER_JOB_HISTORY_SCHEMA_VERSION) {
      throw new Error(`Render job history schemaVersion must be ${RENDER_JOB_HISTORY_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.jobs)) {
      throw new Error("Render job history jobs must be an array.");
    }
    if (typeof payload.writtenAt !== "string" || Number.isNaN(Date.parse(payload.writtenAt))) {
      throw new Error("Render job history writtenAt must be an ISO timestamp.");
    }
    return {
      schemaVersion: RENDER_JOB_HISTORY_SCHEMA_VERSION,
      writtenAt: payload.writtenAt,
      jobs: payload.jobs
    };
  }

  private storedSummary(value: unknown): RenderJobStoredSummary {
    const payload = this.objectRecord(value, "Render job history job");
    const status = this.jobStatus(payload.status);
    const userInputPreview = this.safeOptionalString(payload.userInputPreview, "userInputPreview") ?? "";
    const stageProgressEvents = this.stageProgressEvents(payload.stageProgressEvents);
    const summary: RenderJobStoredSummary = {
      jobId: this.jobId(payload.jobId),
      ...(typeof payload.clientId === "string" && payload.clientId.trim()
        ? { clientId: this.safeString(payload.clientId, "clientId") }
        : {}),
      ...(typeof payload.requestId === "string" && payload.requestId.trim()
        ? { requestId: this.requestId(payload.requestId) }
        : {}),
      status,
      createdAt: this.date(payload.createdAt, "createdAt"),
      updatedAt: this.date(payload.updatedAt, "updatedAt"),
      ...(payload.startedAt !== undefined ? { startedAt: this.date(payload.startedAt, "startedAt") } : {}),
      ...(payload.completedAt !== undefined ? { completedAt: this.date(payload.completedAt, "completedAt") } : {}),
      ...(typeof payload.projectId === "string" && payload.projectId.trim()
        ? { projectId: this.safeString(payload.projectId, "projectId") }
        : {}),
      userInputPreview: userInputPreview.length <= MAX_PREVIEW_CHARS
        ? userInputPreview
        : `${userInputPreview.slice(0, MAX_PREVIEW_CHARS - 3)}...`,
      ...(payload.requestedDurationSeconds !== undefined
        ? { requestedDurationSeconds: this.nonNegativeInteger(payload.requestedDurationSeconds, "requestedDurationSeconds") }
        : {}),
      ...(typeof payload.requestedQualityMode === "string" && payload.requestedQualityMode.trim()
        ? { requestedQualityMode: this.safeString(payload.requestedQualityMode, "requestedQualityMode") }
        : {}),
      ...(typeof payload.requestedResolution === "string" && payload.requestedResolution.trim()
        ? { requestedResolution: this.safeString(payload.requestedResolution, "requestedResolution") }
        : {}),
      referenceCount: this.nonNegativeInteger(payload.referenceCount, "referenceCount"),
      stageProgressEvents,
      hasResult: this.booleanValue(payload.hasResult, "hasResult"),
      hasCostLedger: this.booleanValue(payload.hasCostLedger, "hasCostLedger"),
      ...(payload.providerCheckpoint !== undefined
        ? { providerCheckpoint: this.providerCheckpoint(payload.providerCheckpoint) }
        : {}),
      hasArtifacts: this.booleanValue(payload.hasArtifacts, "hasArtifacts"),
      hasArtifactValidation: this.booleanValue(payload.hasArtifactValidation, "hasArtifactValidation"),
      ...(payload.artifactValidationStatus !== undefined
        ? { artifactValidationStatus: this.artifactValidationStatus(payload.artifactValidationStatus) }
        : {}),
      hasError: this.booleanValue(payload.hasError, "hasError"),
      ...(payload.error !== undefined ? { error: this.redactHistoryValue(payload.error) } : {})
    };
    return summary;
  }

  private serializableProviderCheckpoint(checkpoint: RenderJobProviderCheckpoint): Record<string, unknown> {
    return {
      providerOperationCount: checkpoint.providerOperationCount,
      providers: checkpoint.providers,
      operations: checkpoint.operations,
      predictionIds: checkpoint.predictionIds,
      assetIds: checkpoint.assetIds,
      activePredictionIds: checkpoint.activePredictionIds,
      terminalPredictionIds: checkpoint.terminalPredictionIds,
      ...(checkpoint.latestProvider ? { latestProvider: checkpoint.latestProvider } : {}),
      ...(checkpoint.latestOperation ? { latestOperation: checkpoint.latestOperation } : {}),
      ...(checkpoint.latestProviderStatus ? { latestProviderStatus: checkpoint.latestProviderStatus } : {}),
      ...(checkpoint.latestProviderCallStatus ? { latestProviderCallStatus: checkpoint.latestProviderCallStatus } : {}),
      ...(checkpoint.latestPredictionId ? { latestPredictionId: checkpoint.latestPredictionId } : {}),
      ...(checkpoint.latestAssetId ? { latestAssetId: checkpoint.latestAssetId } : {}),
      ...(checkpoint.lastRecordedAt ? { lastRecordedAt: checkpoint.lastRecordedAt.toISOString() } : {}),
      hasRetryableFailure: checkpoint.hasRetryableFailure,
      retryCount: checkpoint.retryCount
    };
  }

  private providerCheckpoint(value: unknown): RenderJobProviderCheckpoint {
    const payload = this.objectRecord(value, "providerCheckpoint");
    return {
      providerOperationCount: this.nonNegativeInteger(
        payload.providerOperationCount,
        "providerCheckpoint.providerOperationCount"
      ),
      providers: this.boundedStringArray(payload.providers, "providerCheckpoint.providers"),
      operations: this.boundedStringArray(payload.operations, "providerCheckpoint.operations"),
      predictionIds: this.boundedStringArray(payload.predictionIds, "providerCheckpoint.predictionIds"),
      assetIds: this.boundedStringArray(payload.assetIds, "providerCheckpoint.assetIds"),
      activePredictionIds: this.boundedStringArray(
        payload.activePredictionIds,
        "providerCheckpoint.activePredictionIds"
      ),
      terminalPredictionIds: this.boundedStringArray(
        payload.terminalPredictionIds,
        "providerCheckpoint.terminalPredictionIds"
      ),
      ...(typeof payload.latestProvider === "string" && payload.latestProvider.trim()
        ? { latestProvider: this.safeString(payload.latestProvider, "providerCheckpoint.latestProvider") }
        : {}),
      ...(typeof payload.latestOperation === "string" && payload.latestOperation.trim()
        ? { latestOperation: this.safeString(payload.latestOperation, "providerCheckpoint.latestOperation") }
        : {}),
      ...(typeof payload.latestProviderStatus === "string" && payload.latestProviderStatus.trim()
        ? { latestProviderStatus: this.safeString(payload.latestProviderStatus, "providerCheckpoint.latestProviderStatus") }
        : {}),
      ...(typeof payload.latestProviderCallStatus === "string" && payload.latestProviderCallStatus.trim()
        ? {
            latestProviderCallStatus: this.safeString(
              payload.latestProviderCallStatus,
              "providerCheckpoint.latestProviderCallStatus"
            )
          }
        : {}),
      ...(typeof payload.latestPredictionId === "string" && payload.latestPredictionId.trim()
        ? { latestPredictionId: this.safeString(payload.latestPredictionId, "providerCheckpoint.latestPredictionId") }
        : {}),
      ...(typeof payload.latestAssetId === "string" && payload.latestAssetId.trim()
        ? { latestAssetId: this.safeString(payload.latestAssetId, "providerCheckpoint.latestAssetId") }
        : {}),
      ...(payload.lastRecordedAt !== undefined
        ? { lastRecordedAt: this.date(payload.lastRecordedAt, "providerCheckpoint.lastRecordedAt") }
        : {}),
      hasRetryableFailure: this.booleanValue(payload.hasRetryableFailure, "providerCheckpoint.hasRetryableFailure"),
      retryCount: this.nonNegativeInteger(payload.retryCount, "providerCheckpoint.retryCount")
    };
  }

  private stageProgressEvents(value: unknown): readonly RenderJobStoredProgressEvent[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error("stageProgressEvents must be an array.");
    }
    return value.slice(-MAX_STAGE_PROGRESS_EVENTS).map((item) => this.stageProgressEvent(item));
  }

  private stageProgressEvent(value: unknown): RenderJobStoredProgressEvent {
    const payload = this.objectRecord(value, "stageProgressEvent");
    return {
      sequence: this.nonNegativeInteger(payload.sequence, "stageProgressEvent.sequence"),
      stage: this.stageName(payload.stage),
      order: this.nonNegativeInteger(payload.order, "stageProgressEvent.order"),
      status: this.stageStatus(payload.status),
      recordedAt: this.date(payload.recordedAt, "stageProgressEvent.recordedAt"),
      message: this.safeString(payload.message, "stageProgressEvent.message"),
      sourcePatternOrigins: this.stringArray(payload.sourcePatternOrigins, "stageProgressEvent.sourcePatternOrigins"),
      ...(payload.evidence !== undefined ? { evidence: this.evidenceRecord(payload.evidence) } : {})
    };
  }

  private evidenceRecord(value: unknown): Readonly<Record<string, string | number | boolean | readonly string[] | readonly number[]>> {
    const payload = this.objectRecord(value, "stageProgressEvent.evidence");
    const evidence: Record<string, string | number | boolean | readonly string[] | readonly number[]> = {};
    for (const [key, item] of Object.entries(payload)) {
      if (typeof item === "string") {
        evidence[key] = this.safeString(item, `stageProgressEvent.evidence.${key}`);
      } else if (typeof item === "number" && Number.isFinite(item)) {
        evidence[key] = item;
      } else if (typeof item === "boolean") {
        evidence[key] = item;
      } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
        evidence[key] = item.map((entry) => this.safeString(entry, `stageProgressEvent.evidence.${key}`));
      } else if (Array.isArray(item) && item.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
        evidence[key] = item;
      }
    }
    return evidence;
  }

  private objectRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return value as Record<string, unknown>;
  }

  private jobId(value: unknown): string {
    const jobId = this.safeString(value, "jobId");
    if (!JOB_ID_PATTERN.test(jobId)) {
      throw new Error("jobId must be a render_job UUID.");
    }
    return jobId;
  }

  private requestId(value: unknown): string {
    const requestId = this.safeString(value, "requestId");
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new Error("requestId must be a safe request ID.");
    }
    return requestId;
  }

  private jobStatus(value: unknown): RenderJobStatus {
    if (
      value === "queued" ||
      value === "running" ||
      value === "succeeded" ||
      value === "failed" ||
      value === "canceled"
    ) {
      return value;
    }
    throw new Error("Render job history status must use the render job status vocabulary.");
  }

  private artifactValidationStatus(value: unknown): "pass" | "warn" | "fail" {
    if (value === "pass" || value === "warn" || value === "fail") {
      return value;
    }
    throw new Error("artifactValidationStatus must be pass, warn, or fail.");
  }

  private booleanValue(value: unknown, label: string): boolean {
    if (typeof value !== "boolean") {
      throw new Error(`${label} must be a boolean.`);
    }
    return value;
  }

  private nonNegativeInteger(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
    return value;
  }

  private date(value: unknown, label: string): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value !== "string") {
      throw new Error(`${label} must be an ISO timestamp.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${label} must be an ISO timestamp.`);
    }
    return parsed;
  }

  private stringArray(value: unknown, label: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array.`);
    }
    return value.map((item) => this.safeString(item, label));
  }

  private boundedStringArray(value: unknown, label: string): readonly string[] {
    return this.stringArray(value, label).slice(-MAX_PROVIDER_CHECKPOINT_ITEMS);
  }

  private safeOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.safeString(value, label);
  }

  private safeString(value: unknown, label: string): string {
    if (typeof value !== "string") {
      throw new Error(`${label} must be a string.`);
    }
    const redacted = this.redactHistoryValue(value);
    if (typeof redacted !== "string") {
      throw new Error(`${label} must be a string.`);
    }
    if (CONTROL_CHARACTER_PATTERN.test(redacted)) {
      throw new Error(`${label} must not contain control characters.`);
    }
    return redacted;
  }

  private redactHistoryValue(value: unknown): unknown {
    return this.redactEmbeddedLocalPathText(redactApiLocalPaths(redactUnknown(value)));
  }

  private redactEmbeddedLocalPathText(value: unknown): unknown {
    if (typeof value === "string") {
      return value
        .replace(EMBEDDED_WINDOWS_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
        .replace(EMBEDDED_UNC_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
        .replace(EMBEDDED_POSIX_PATH_PATTERN, "$1[REDACTED_LOCAL_PATH]");
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactEmbeddedLocalPathText(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.redactEmbeddedLocalPathText(item)
        ])
      );
    }
    return value;
  }

  private stageName(value: unknown): ProductionStageName {
    const stage = this.safeString(value, "stageProgressEvent.stage");
    if (!PRODUCTION_STAGE_ORDER.includes(stage as ProductionStageName)) {
      throw new Error("stageProgressEvent.stage must use the production stage vocabulary.");
    }
    return stage as ProductionStageName;
  }

  private stageStatus(value: unknown): ProductionStageStatus {
    const status = this.safeString(value, "stageProgressEvent.status");
    if (!PRODUCTION_STAGE_STATUSES.includes(status as ProductionStageStatus)) {
      throw new Error("stageProgressEvent.status must use the production stage status vocabulary.");
    }
    return status as ProductionStageStatus;
  }
}

export function readRenderJobHistoryPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.CINEJELLY_API_JOB_HISTORY_PATH?.trim();
  if (!value) {
    return undefined;
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error("CINEJELLY_API_JOB_HISTORY_PATH must not contain control characters.");
  }
  return value;
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
