/**
 * Optional file-backed short-pipeline conversation session store.
 * It persists redacted planning sessions only; raw transcript text, product URLs, media URLs,
 * secrets, and local filesystem paths are not allowed into the retained store.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  ShortPipelineConversationSession,
  ShortPipelineTemplatePreference,
  ShortPipelineUserReviewState
} from "../types/short-pipeline.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import { retainNewestPerClient } from "./tenant-scoped-retention.js";

export const SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION = "cinejelly.short-pipeline-session-store.v1";
export const SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION = "cinejelly.short-pipeline-session-record.v1";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SESSION_ID_PATTERN = /^short_session_[a-f0-9]{16}$/;
const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_.:-]{8,160}$/;
const SAFE_CLIENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const RAW_HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s"',;)]*/gi;
const EMBEDDED_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\s"',;)]*/g;
const EMBEDDED_UNC_PATH_PATTERN = /\\\\[^\s"',;)]*/g;
const EMBEDDED_POSIX_PATH_PATTERN = /(^|\s)(\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+)/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:bearer\s+|api[_-]?key\s*[:=]|access[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|authorization\s*[:=])[^"',\s&]+/gi;
const SECRET_QUERY_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi;
const MAX_SESSION_RECORDS = 1_000;
const DEFAULT_SESSION_RECORDS = 200;
const DEFAULT_OUTPUT_DIR = "assets/output_deliverables";
const DEFAULT_SESSION_STORE_FILE = "short-pipeline-sessions.json";

export interface ShortPipelineStoredSessionRecord {
  readonly schemaVersion: typeof SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly clientId?: string;
  readonly storedAt: Date;
  readonly updatedAt: Date;
  readonly session: Record<string, unknown>;
}

export interface ShortPipelineStoredSessionSummary {
  readonly sessionId: string;
  readonly projectId: string;
  readonly requestId?: string;
  readonly clientId?: string;
  readonly storedAt: Date;
  readonly updatedAt: Date;
  readonly generatedAt?: Date;
  readonly turnCount: number;
  readonly rawTranscriptStored: false;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly planStatus?: string;
  readonly reviewApprovalStatus?: string;
  readonly userReviewState?: ShortPipelineUserReviewState;
  readonly templatePreference?: ShortPipelineTemplatePreference;
  readonly canRenderAfterFormalApproval?: boolean;
  readonly canReleaseToCustomerTraffic: false;
}

interface ShortPipelineSessionStoreFile {
  readonly schemaVersion: typeof SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION;
  readonly writtenAt: string;
  readonly sessions: readonly unknown[];
}

export class ShortPipelineSessionStore {
  public readonly storePath: string;
  private readonly maxSessions: number;
  /**
   * mtime/size-keyed cache of the parsed store so hot list/get requests do not re-read,
   * re-parse, and re-run redaction scrubbing over the whole file on every call. External
   * file changes are still picked up because the stat fingerprint is checked first.
   */
  private recordsCache:
    | { readonly mtimeMs: number; readonly sizeBytes: number; readonly records: readonly ShortPipelineStoredSessionRecord[] }
    | undefined;

  public constructor(input: { readonly storePath: string; readonly maxSessions?: number }) {
    const configuredPath = input.storePath.trim();
    if (!configuredPath) {
      throw new Error("CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH cannot be empty when configured.");
    }
    if (CONTROL_CHARACTER_PATTERN.test(configuredPath)) {
      throw new Error("CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH must not contain control characters.");
    }
    this.storePath = resolve(configuredPath);
    this.maxSessions = Math.min(Math.max(10, input.maxSessions ?? DEFAULT_SESSION_RECORDS), MAX_SESSION_RECORDS);
  }

  public loadRecords(): readonly ShortPipelineStoredSessionRecord[] {
    let fingerprint: { readonly mtimeMs: number; readonly sizeBytes: number } | undefined;
    try {
      const stats = statSync(this.storePath);
      fingerprint = { mtimeMs: stats.mtimeMs, sizeBytes: stats.size };
    } catch (error) {
      if (isFileNotFound(error)) {
        this.recordsCache = undefined;
        return [];
      }
      throw new Error(`Short-pipeline session store cannot be read: ${errorMessage(error)}`);
    }
    if (
      this.recordsCache &&
      this.recordsCache.mtimeMs === fingerprint.mtimeMs &&
      this.recordsCache.sizeBytes === fingerprint.sizeBytes
    ) {
      return this.recordsCache.records;
    }
    let text: string;
    try {
      text = readFileSync(this.storePath, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) {
        this.recordsCache = undefined;
        return [];
      }
      throw new Error(`Short-pipeline session store cannot be read: ${errorMessage(error)}`);
    }
    if (!text.trim()) {
      this.recordsCache = { ...fingerprint, records: [] };
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Short-pipeline session store must be valid JSON.");
    }
    const storeFile = this.storeFile(parsed);
    // Per-CUSTOMER on the READ path too — a global trim here hides other customers' sessions from
    // every reader, and the next save writes back only what was loaded, making the loss permanent.
    const records = Object.freeze(
      retainNewestPerClient(
        storeFile.sessions.map((session) => this.storedRecord(session)),
        this.maxSessions
      )
    );
    this.recordsCache = { ...fingerprint, records };
    return records;
  }

  public saveSession(
    session: ShortPipelineConversationSession,
    options: { readonly clientId?: string } = {}
  ): ShortPipelineStoredSessionRecord {
    const now = new Date();
    const existing = this.loadRecords();
    const prior = existing.find((record) => record.sessionId === session.sessionId);
    const record: ShortPipelineStoredSessionRecord = {
      schemaVersion: SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION,
      sessionId: this.sessionId(session.sessionId),
      projectId: this.safeProjectId(session.projectId),
      ...(session.requestId ? { requestId: this.requestId(session.requestId) } : {}),
      ...(options.clientId ? { clientId: this.safeClientId(options.clientId) } : {}),
      storedAt: prior?.storedAt ?? now,
      updatedAt: now,
      session: this.safeSessionPayload(session)
    };
    // Per-CUSTOMER retention. The global trim let one customer evict everyone else's sessions, and
    // that is worse than data loss here: the render route resolves its plan from the stored session,
    // so an evicted victim could no longer render the video they had already planned and paid to plan.
    const merged = retainNewestPerClient(
      [record, ...existing.filter((item) => item.sessionId !== record.sessionId)],
      this.maxSessions
    );
    this.writeRecords(merged);
    return record;
  }

  public list(options: { readonly clientId?: string } = {}): readonly ShortPipelineStoredSessionSummary[] {
    return this.loadRecords()
      .filter((record) => this.recordMatchesClient(record, options.clientId))
      .map((record) => this.summaryFor(record));
  }

  public get(
    sessionId: string,
    options: { readonly clientId?: string } = {}
  ): ShortPipelineStoredSessionRecord | undefined {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return undefined;
    }
    const normalizedSessionId = this.sessionId(sessionId);
    return this.loadRecords().find((record) =>
      record.sessionId === normalizedSessionId && this.recordMatchesClient(record, options.clientId)
    );
  }

  public summaryFor(record: ShortPipelineStoredSessionRecord): ShortPipelineStoredSessionSummary {
    const session = record.session;
    const plan = objectOrUndefined(session.plan);
    const reviewApproval = objectOrUndefined(plan?.reviewApproval);
    const analysis = objectOrUndefined(session.analysis);
    const releaseGate = objectOrUndefined(session.releaseGateSummary);
    const turns = Array.isArray(session.turns) ? session.turns : [];
    const generatedAt = dateOrUndefined(session.generatedAt);
    return {
      sessionId: record.sessionId,
      projectId: record.projectId,
      ...(record.requestId ? { requestId: record.requestId } : {}),
      ...(record.clientId ? { clientId: record.clientId } : {}),
      storedAt: record.storedAt,
      updatedAt: record.updatedAt,
      ...(generatedAt ? { generatedAt } : {}),
      turnCount: turns.length,
      rawTranscriptStored: false,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      ...(typeof plan?.status === "string" ? { planStatus: plan.status } : {}),
      ...(typeof reviewApproval?.status === "string" ? { reviewApprovalStatus: reviewApproval.status } : {}),
      ...(isUserReviewState(analysis?.userReviewState) ? { userReviewState: analysis.userReviewState } : {}),
      ...(isTemplatePreference(analysis?.templatePreference) ? { templatePreference: analysis.templatePreference } : {}),
      ...(typeof releaseGate?.canRenderAfterFormalApproval === "boolean"
        ? { canRenderAfterFormalApproval: releaseGate.canRenderAfterFormalApproval }
        : {}),
      canReleaseToCustomerTraffic: false
    };
  }

  private writeRecords(records: readonly ShortPipelineStoredSessionRecord[]): void {
    const payload = {
      schemaVersion: SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      sessions: records.map((record) => this.serializableRecord(record))
    };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    this.assertNoSensitiveResidue(serialized);
    mkdirSync(dirname(this.storePath), { recursive: true });
    const tempPath = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, serialized, "utf8");
    renameSync(tempPath, this.storePath);
    try {
      const stats = statSync(this.storePath);
      this.recordsCache = { mtimeMs: stats.mtimeMs, sizeBytes: stats.size, records };
    } catch {
      this.recordsCache = undefined;
    }
  }

  private serializableRecord(record: ShortPipelineStoredSessionRecord): Record<string, unknown> {
    return {
      schemaVersion: record.schemaVersion,
      sessionId: record.sessionId,
      projectId: record.projectId,
      ...(record.requestId ? { requestId: record.requestId } : {}),
      ...(record.clientId ? { clientId: record.clientId } : {}),
      storedAt: record.storedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      session: record.session
    };
  }

  private safeSessionPayload(session: ShortPipelineConversationSession): Record<string, unknown> {
    const jsonSafe = JSON.parse(JSON.stringify(session)) as unknown;
    const redacted = scrubSensitiveStrings(redactApiLocalPaths(redactUnknown(jsonSafe)));
    const serialized = JSON.stringify(redacted);
    this.assertNoSensitiveResidue(serialized);
    const payload = this.objectRecord(redacted, "Short-pipeline conversation session");
    if (payload.rawTranscriptStored !== false) {
      throw new Error("Short-pipeline session store refuses sessions that store raw transcript text.");
    }
    if (payload.noSpend !== true || payload.networkCallsMade !== false || payload.providerCallsMade !== false) {
      throw new Error("Short-pipeline session store only accepts no-spend, no-network conversation sessions.");
    }
    return payload;
  }

  private assertNoSensitiveResidue(serialized: string): void {
    if (
      containsPattern(RAW_HTTP_URL_PATTERN, serialized) ||
      containsPattern(EMBEDDED_WINDOWS_PATH_PATTERN, serialized) ||
      containsPattern(EMBEDDED_UNC_PATH_PATTERN, serialized) ||
      containsPattern(EMBEDDED_POSIX_PATH_PATTERN, serialized) ||
      containsPattern(SECRET_ASSIGNMENT_PATTERN, serialized) ||
      containsPattern(SECRET_QUERY_PATTERN, serialized)
    ) {
      throw new Error("Short-pipeline session store refused to persist unredacted URL, path, or secret-like data.");
    }
  }

  private storeFile(value: unknown): ShortPipelineSessionStoreFile {
    const payload = this.objectRecord(value, "Short-pipeline session store");
    if (payload.schemaVersion !== SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION) {
      throw new Error(`Short-pipeline session store schemaVersion must be ${SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.sessions)) {
      throw new Error("Short-pipeline session store sessions must be an array.");
    }
    if (typeof payload.writtenAt !== "string" || Number.isNaN(Date.parse(payload.writtenAt))) {
      throw new Error("Short-pipeline session store writtenAt must be an ISO timestamp.");
    }
    return {
      schemaVersion: SHORT_PIPELINE_SESSION_STORE_SCHEMA_VERSION,
      writtenAt: payload.writtenAt,
      sessions: payload.sessions
    };
  }

  private storedRecord(value: unknown): ShortPipelineStoredSessionRecord {
    const payload = this.objectRecord(value, "Short-pipeline session record");
    if (payload.schemaVersion !== SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION) {
      throw new Error(
        `Short-pipeline session record schemaVersion must be ${SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION}.`
      );
    }
    const session = this.objectRecord(scrubSensitiveStrings(payload.session), "Short-pipeline stored session payload");
    this.assertNoSensitiveResidue(JSON.stringify(session));
    return {
      schemaVersion: SHORT_PIPELINE_SESSION_RECORD_SCHEMA_VERSION,
      sessionId: this.sessionId(payload.sessionId),
      projectId: this.safeProjectId(payload.projectId),
      ...(typeof payload.requestId === "string" && payload.requestId.trim()
        ? { requestId: this.requestId(payload.requestId) }
        : {}),
      ...(typeof payload.clientId === "string" && payload.clientId.trim()
        ? { clientId: this.safeClientId(payload.clientId) }
        : {}),
      storedAt: this.date(payload.storedAt, "storedAt"),
      updatedAt: this.date(payload.updatedAt, "updatedAt"),
      session
    };
  }

  private recordMatchesClient(record: ShortPipelineStoredSessionRecord, clientId: string | undefined): boolean {
    return !clientId || record.clientId === clientId;
  }

  private sessionId(value: unknown): string {
    if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
      throw new Error("Short-pipeline sessionId is invalid.");
    }
    return value;
  }

  private requestId(value: unknown): string {
    if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
      throw new Error("Short-pipeline session requestId is invalid.");
    }
    return value;
  }

  private safeProjectId(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 160 || CONTROL_CHARACTER_PATTERN.test(value)) {
      throw new Error("Short-pipeline session projectId is invalid.");
    }
    return value.trim();
  }

  private safeClientId(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || !SAFE_CLIENT_ID_PATTERN.test(value.trim())) {
      throw new Error("Short-pipeline session clientId is invalid.");
    }
    return value.trim();
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new Error(`Short-pipeline session ${label} must be an ISO timestamp.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Short-pipeline session ${label} must be an ISO timestamp.`);
    }
    return parsed;
  }

  private objectRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    return value as Record<string, unknown>;
  }
}

export function readShortPipelineSessionStorePath(env: NodeJS.ProcessEnv): string {
  const configuredPath = env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH?.trim();
  const storePath = configuredPath || join(readShortPipelineOutputDir(env), DEFAULT_SESSION_STORE_FILE);
  if (CONTROL_CHARACTER_PATTERN.test(storePath)) {
    throw new Error("CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH must not contain control characters.");
  }
  return storePath;
}

function readShortPipelineOutputDir(env: NodeJS.ProcessEnv): string {
  const configuredOutputDir = env.CINEJELLY_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIR;
  if (CONTROL_CHARACTER_PATTERN.test(configuredOutputDir)) {
    throw new Error("CINEJELLY_OUTPUT_DIR must not contain control characters.");
  }
  return configuredOutputDir;
}

function scrubSensitiveStrings(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value
      .replace(RAW_HTTP_URL_PATTERN, "[REDACTED_URL]")
      .replace(SECRET_ASSIGNMENT_PATTERN, "[REDACTED_SECRET]")
      .replace(SECRET_QUERY_PATTERN, "$1[REDACTED_SECRET]")
      .replace(EMBEDDED_WINDOWS_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
      .replace(EMBEDDED_UNC_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
      .replace(EMBEDDED_POSIX_PATH_PATTERN, "$1[REDACTED_LOCAL_PATH]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, scrubSensitiveStrings(item)])
    );
  }
  return value;
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function dateOrUndefined(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function isUserReviewState(value: unknown): value is ShortPipelineUserReviewState {
  return value === "needs_review" || value === "revision_requested" || value === "approval_intent_detected";
}

function isTemplatePreference(value: unknown): value is ShortPipelineTemplatePreference {
  return value === "suggest_optional" || value === "user_requested_template" || value === "user_rejected_templates";
}

function containsPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
