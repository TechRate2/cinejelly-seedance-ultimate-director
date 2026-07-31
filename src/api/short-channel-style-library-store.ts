/**
 * Optional file-backed channel style library for Short UI/workspace flows.
 * It stores structured style memory for reuse across scripts, not raw training data.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ShortChannelStyleProfileEvaluator } from "../core/short-channel-style-profile.js";
import type {
  ShortChannelStyleProfile,
  ShortChannelStyleProfileInput
} from "../types/short-channel-style.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import { retainNewestPerClient } from "./tenant-scoped-retention.js";

export const SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION = "cinejelly.short-channel-style-library.v1";
export const SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION = "cinejelly.short-channel-style-library-record.v1";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const PROFILE_ID_PATTERN = /^short_channel_style_[a-f0-9]{16}$/;
const SAFE_CLIENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
const RAW_LOCAL_PATH_PATTERN =
  /\b[A-Za-z]:[\\/][^\s"',;)]*|\\\\[^\s"',;)]+|(^|\s)(\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+)/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:bearer\s+|api[_-]?key\s*[:=]|access[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|authorization\s*[:=])[^"',\s&]+/gi;
const SECRET_QUERY_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi;
const MAX_STYLE_RECORDS = 1_000;
const DEFAULT_STYLE_RECORDS = 200;
const DEFAULT_OUTPUT_DIR = "assets/output_deliverables";
const DEFAULT_STYLE_LIBRARY_FILE = "short-channel-styles.json";

export interface ShortChannelStyleLibraryRecord {
  readonly schemaVersion: typeof SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION;
  readonly profileId: string;
  readonly clientId?: string;
  readonly storedAt: Date;
  readonly updatedAt: Date;
  readonly input: ShortChannelStyleProfileInput;
  readonly profile: ShortChannelStyleProfile;
}

export interface ShortChannelStyleLibrarySummary {
  readonly profileId: string;
  readonly clientId?: string;
  readonly storedAt: Date;
  readonly updatedAt: Date;
  readonly status: ShortChannelStyleProfile["status"];
  readonly channelName?: string;
  readonly seriesName?: string;
  readonly niche?: string;
  readonly anchorCount: number;
  readonly characterCount: number;
  readonly voiceCount: number;
  readonly settingCount: number;
  readonly approvedAssetCount: number;
  readonly requiresRightsReview: boolean;
  readonly canReuseAcrossScripts: boolean;
  readonly canBindReferenceAssets: boolean;
}

interface ShortChannelStyleLibraryFile {
  readonly schemaVersion: typeof SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION;
  readonly writtenAt: string;
  readonly styles: readonly unknown[];
}

export class ShortChannelStyleLibraryStore {
  public readonly storePath: string;
  private readonly maxProfiles: number;
  private readonly evaluator = new ShortChannelStyleProfileEvaluator();

  public constructor(input: { readonly storePath: string; readonly maxProfiles?: number }) {
    const configuredPath = input.storePath.trim();
    if (!configuredPath) {
      throw new Error("CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH cannot be empty when configured.");
    }
    if (CONTROL_CHARACTER_PATTERN.test(configuredPath)) {
      throw new Error("CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH must not contain control characters.");
    }
    this.storePath = resolve(configuredPath);
    this.maxProfiles = Math.min(Math.max(10, input.maxProfiles ?? DEFAULT_STYLE_RECORDS), MAX_STYLE_RECORDS);
  }

  public saveProfile(
    input: ShortChannelStyleProfileInput,
    options: { readonly clientId?: string } = {}
  ): ShortChannelStyleLibraryRecord {
    const safeInput = this.safeProfileInput(input);
    const profile = this.evaluator.evaluate(safeInput);
    if (!profile) {
      throw new Error("Channel style profile input is required.");
    }
    const now = new Date();
    const existing = this.loadRecords();
    const prior = existing.find((record) =>
      record.profileId === profile.profileId && this.recordMatchesClient(record, options.clientId)
    );
    const record: ShortChannelStyleLibraryRecord = {
      schemaVersion: SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION,
      profileId: this.profileId(profile.profileId),
      ...(options.clientId ? { clientId: this.safeClientId(options.clientId) } : {}),
      storedAt: prior?.storedAt ?? now,
      updatedAt: now,
      input: safeInput,
      profile
    };
    // Per-CUSTOMER retention. Trimming the global list to the newest N let one customer's writes
    // evict every other customer's saved profiles — reproduced with a free account posting 205
    // profiles in 2.7s, after which the victim's own profile returned 404.
    const merged = retainNewestPerClient(
      [
        record,
        ...existing.filter((item) =>
          !(item.profileId === record.profileId && item.clientId === record.clientId)
        )
      ],
      this.maxProfiles
    );
    this.writeRecords(merged);
    return record;
  }

  public loadRecords(): readonly ShortChannelStyleLibraryRecord[] {
    let text: string;
    try {
      text = readFileSync(this.storePath, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) {
        return [];
      }
      throw new Error(`Short channel style library cannot be read: ${errorMessage(error)}`);
    }
    if (!text.trim()) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Short channel style library must be valid JSON.");
    }
    const storeFile = this.storeFile(parsed);
    // Per-CUSTOMER on the READ path too, and this is the more dangerous half: a global trim here
    // hides other customers' records from every reader, and the next save then writes back only what
    // was loaded — turning "invisible" into "permanently deleted".
    return retainNewestPerClient(
      storeFile.styles.map((record) => this.storedRecord(record)),
      this.maxProfiles
    );
  }

  public list(options: { readonly clientId?: string } = {}): readonly ShortChannelStyleLibrarySummary[] {
    return this.loadRecords()
      .filter((record) => this.recordMatchesClient(record, options.clientId))
      .map((record) => this.summaryFor(record));
  }

  public get(
    profileId: string,
    options: { readonly clientId?: string } = {}
  ): ShortChannelStyleLibraryRecord | undefined {
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      return undefined;
    }
    const normalizedProfileId = this.profileId(profileId);
    return this.loadRecords().find((record) =>
      record.profileId === normalizedProfileId && this.recordMatchesClient(record, options.clientId)
    );
  }

  public summaryFor(record: ShortChannelStyleLibraryRecord): ShortChannelStyleLibrarySummary {
    return {
      profileId: record.profileId,
      ...(record.clientId ? { clientId: record.clientId } : {}),
      storedAt: record.storedAt,
      updatedAt: record.updatedAt,
      status: record.profile.status,
      ...(record.profile.channelName ? { channelName: record.profile.channelName } : {}),
      ...(record.profile.seriesName ? { seriesName: record.profile.seriesName } : {}),
      ...(record.profile.niche ? { niche: record.profile.niche } : {}),
      anchorCount: record.profile.styleAnchors.length,
      characterCount: record.profile.characterCount,
      voiceCount: record.profile.voiceCount,
      settingCount: record.profile.settingCount,
      approvedAssetCount: record.profile.approvedAssetCount,
      requiresRightsReview: record.profile.memoryPolicy.requiresRightsReview,
      canReuseAcrossScripts: record.profile.memoryPolicy.canReuseAcrossScripts,
      canBindReferenceAssets: record.profile.memoryPolicy.canBindReferenceAssets
    };
  }

  private writeRecords(records: readonly ShortChannelStyleLibraryRecord[]): void {
    const payload = {
      schemaVersion: SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      styles: records.map((record) => this.serializableRecord(record))
    };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    this.assertNoSensitiveResidue(serialized);
    mkdirSync(dirname(this.storePath), { recursive: true });
    const tempPath = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, serialized, "utf8");
    renameSync(tempPath, this.storePath);
  }

  private serializableRecord(record: ShortChannelStyleLibraryRecord): Record<string, unknown> {
    return {
      schemaVersion: record.schemaVersion,
      profileId: record.profileId,
      ...(record.clientId ? { clientId: record.clientId } : {}),
      storedAt: record.storedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      input: record.input,
      profile: record.profile
    };
  }

  private safeProfileInput(input: ShortChannelStyleProfileInput): ShortChannelStyleProfileInput {
    const redacted = scrubSensitiveStrings(redactApiLocalPaths(redactUnknown(input)));
    const serialized = JSON.stringify(redacted);
    this.assertNoSensitiveResidue(serialized);
    return this.objectRecord(redacted, "Short channel style profile input") as unknown as ShortChannelStyleProfileInput;
  }

  private assertNoSensitiveResidue(serialized: string): void {
    if (
      containsPattern(RAW_LOCAL_PATH_PATTERN, serialized) ||
      containsPattern(SECRET_ASSIGNMENT_PATTERN, serialized) ||
      containsPattern(SECRET_QUERY_PATTERN, serialized)
    ) {
      throw new Error("Short channel style library refused to persist local paths or secret-like data.");
    }
  }

  private storeFile(value: unknown): ShortChannelStyleLibraryFile {
    const payload = this.objectRecord(value, "Short channel style library");
    if (payload.schemaVersion !== SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION) {
      throw new Error(`Short channel style library schemaVersion must be ${SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.styles)) {
      throw new Error("Short channel style library styles must be an array.");
    }
    if (typeof payload.writtenAt !== "string" || Number.isNaN(Date.parse(payload.writtenAt))) {
      throw new Error("Short channel style library writtenAt must be an ISO timestamp.");
    }
    return {
      schemaVersion: SHORT_CHANNEL_STYLE_LIBRARY_SCHEMA_VERSION,
      writtenAt: payload.writtenAt,
      styles: payload.styles
    };
  }

  private storedRecord(value: unknown): ShortChannelStyleLibraryRecord {
    const payload = this.objectRecord(value, "Short channel style library record");
    if (payload.schemaVersion !== SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION) {
      throw new Error(
        `Short channel style library record schemaVersion must be ${SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION}.`
      );
    }
    const input = this.objectRecord(scrubSensitiveStrings(payload.input), "Short channel style library input") as unknown as ShortChannelStyleProfileInput;
    const profile = this.objectRecord(scrubSensitiveStrings(payload.profile), "Short channel style library profile") as unknown as ShortChannelStyleProfile;
    this.assertNoSensitiveResidue(JSON.stringify({ input, profile }));
    return {
      schemaVersion: SHORT_CHANNEL_STYLE_LIBRARY_RECORD_SCHEMA_VERSION,
      profileId: this.profileId(payload.profileId),
      ...(typeof payload.clientId === "string" && payload.clientId.trim()
        ? { clientId: this.safeClientId(payload.clientId) }
        : {}),
      storedAt: this.date(payload.storedAt, "storedAt"),
      updatedAt: this.date(payload.updatedAt, "updatedAt"),
      input,
      profile
    };
  }

  private recordMatchesClient(record: ShortChannelStyleLibraryRecord, clientId: string | undefined): boolean {
    return !clientId || record.clientId === clientId;
  }

  private profileId(value: unknown): string {
    if (typeof value !== "string" || !PROFILE_ID_PATTERN.test(value)) {
      throw new Error("Short channel style profileId is invalid.");
    }
    return value;
  }

  private safeClientId(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || !SAFE_CLIENT_ID_PATTERN.test(value.trim())) {
      throw new Error("Short channel style clientId is invalid.");
    }
    return value.trim();
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new Error(`Short channel style library ${label} must be an ISO timestamp.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Short channel style library ${label} must be an ISO timestamp.`);
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

export function readShortChannelStyleLibraryPath(env: NodeJS.ProcessEnv): string {
  const configuredPath = env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH?.trim();
  const storePath = configuredPath || join(readShortChannelStyleOutputDir(env), DEFAULT_STYLE_LIBRARY_FILE);
  if (CONTROL_CHARACTER_PATTERN.test(storePath)) {
    throw new Error("CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH must not contain control characters.");
  }
  return storePath;
}

function readShortChannelStyleOutputDir(env: NodeJS.ProcessEnv): string {
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
      .replace(SECRET_ASSIGNMENT_PATTERN, "[REDACTED_SECRET]")
      .replace(SECRET_QUERY_PATTERN, "$1[REDACTED_SECRET]")
      .replace(RAW_LOCAL_PATH_PATTERN, "[REDACTED_LOCAL_PATH]");
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
