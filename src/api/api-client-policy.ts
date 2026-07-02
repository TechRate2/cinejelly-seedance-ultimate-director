/**
 * Per-client render policy and quota reservations.
 * This is intentionally enforced before runtime creation or provider calls.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { QualityMode, SpeedTier } from "../types/settings.js";
import { normalizeSeedanceSettings, QUALITY_MODES, SPEED_TIERS } from "../config/seedance-settings.js";
import type { ApiAuthClientKey, ApiAuthPrincipal } from "./api-auth.js";

export type ApiClientPolicyErrorStatusCode = 400 | 403 | 429 | 503;

export class ApiClientPolicyError extends Error {
  public readonly statusCode: ApiClientPolicyErrorStatusCode;
  public readonly retryAfterSeconds?: number;

  public constructor(message: string, statusCode: ApiClientPolicyErrorStatusCode, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiClientPolicyError";
    this.statusCode = statusCode;
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}

export interface ApiClientPolicy {
  readonly clientId: string;
  readonly keySha256: string;
  readonly enabled: boolean;
  readonly monthlyRequestLimit?: number;
  readonly monthlyReservedCostUsdLimit?: number;
  readonly maxReservedCostUsdPerRequest?: number;
  readonly defaultReservedCostUsdPerRequest?: number;
  readonly maxDurationTargetSeconds?: number;
  readonly allowedTiers?: readonly SpeedTier[];
  readonly allowedQualityModes?: readonly QualityMode[];
}

export interface ApiClientPolicySettings {
  readonly policies: readonly ApiClientPolicy[];
  readonly requireClientPolicyForRender: boolean;
  readonly usageLedgerPath?: string;
}

export interface ApiClientPolicyReservation {
  readonly clientId: string;
  readonly monthKey: string;
  readonly requestCountAfterReservation: number;
  readonly reservedCostUsd: number;
  readonly reservedCostUsdAfterReservation: number;
}

interface UsageTotals {
  requestCount: number;
  reservedCostUsd: number;
}

interface UsageLedgerRecord {
  readonly schemaVersion: "cinejelly.client-usage-ledger.v1";
  readonly recordedAt: string;
  readonly monthKey: string;
  readonly clientId: string;
  readonly requestId: string;
  readonly operation: "render.reserve" | "render.release";
  readonly channel: "sync" | "async";
  readonly reservedCostUsd: number;
  readonly durationTargetSeconds: number;
  readonly qualityMode: QualityMode;
  readonly tier: SpeedTier;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,80}$/;
const SHA256_HEX_PATTERN = /^[a-fA-F0-9]{64}$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class ApiClientPolicyGate {
  private readonly policies: ReadonlyMap<string, ApiClientPolicy>;
  private readonly requireClientPolicyForRender: boolean;
  private readonly usageLedgerPath: string | undefined;
  private readonly usageByClientMonth = new Map<string, UsageTotals>();

  public constructor(settings: ApiClientPolicySettings) {
    this.policies = new Map(settings.policies.map((policy) => [policy.clientId, policy]));
    this.requireClientPolicyForRender = settings.requireClientPolicyForRender;
    this.usageLedgerPath = settings.usageLedgerPath;
    this.loadUsageLedger();
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): ApiClientPolicyGate {
    return new ApiClientPolicyGate(loadApiClientPolicySettingsFromEnv(env));
  }

  public authClientKeys(): readonly ApiAuthClientKey[] {
    return [...this.policies.values()].map((policy) => ({
      clientId: policy.clientId,
      keySha256: policy.keySha256,
      enabled: policy.enabled
    }));
  }

  public reserveRender(input: {
    readonly principal: ApiAuthPrincipal | undefined;
    readonly request: CineJellyProjectRequest;
    readonly requestId: string;
    readonly channel: "sync" | "async";
  }): ApiClientPolicyReservation | undefined {
    if (this.policies.size === 0) {
      if (this.requireClientPolicyForRender) {
        throw new ApiClientPolicyError(
          "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER is true but no client policy is configured.",
          503
        );
      }
      return undefined;
    }

    if (input.principal?.kind !== "client") {
      if (this.requireClientPolicyForRender) {
        throw new ApiClientPolicyError("Render requests must use a configured client API key.", 403);
      }
      return undefined;
    }

    const policy = this.policies.get(input.principal.clientId ?? "");
    if (!policy || !policy.enabled) {
      throw new ApiClientPolicyError("Client API key is disabled or not configured for rendering.", 403);
    }

    const settings = normalizeSeedanceSettings(input.request.settings ?? {});
    this.assertSettingsAllowed(policy, settings);
    const reservedCostUsd = this.reservedCostUsdFor(policy, input.request);
    this.assertRequestCostAllowed(policy, reservedCostUsd);

    const monthKey = monthKeyFor(new Date());
    const usageKey = this.usageKey(policy.clientId, monthKey);
    const current = this.usageByClientMonth.get(usageKey) ?? { requestCount: 0, reservedCostUsd: 0 };
    const next: UsageTotals = {
      requestCount: current.requestCount + 1,
      reservedCostUsd: roundMoney(current.reservedCostUsd + reservedCostUsd)
    };
    this.assertMonthlyLimits(policy, next);
    this.usageByClientMonth.set(usageKey, next);
    this.writeUsageRecord({
      schemaVersion: "cinejelly.client-usage-ledger.v1",
      recordedAt: new Date().toISOString(),
      monthKey,
      clientId: policy.clientId,
      requestId: input.requestId,
      operation: "render.reserve",
      channel: input.channel,
      reservedCostUsd,
      durationTargetSeconds: settings.durationTargetSeconds,
      qualityMode: settings.qualityMode,
      tier: settings.tier
    });

    return {
      clientId: policy.clientId,
      monthKey,
      requestCountAfterReservation: next.requestCount,
      reservedCostUsd,
      reservedCostUsdAfterReservation: next.reservedCostUsd
    };
  }

  /**
   * Return a reservation for a job canceled while still queued (no provider work
   * happened). Decrements the same month bucket the reservation was taken from and
   * appends a render.release ledger line so usage stays auditable.
   */
  public releaseRender(input: {
    readonly reservation: ApiClientPolicyReservation;
    readonly request: CineJellyProjectRequest;
    readonly requestId: string;
    readonly channel: "sync" | "async";
  }): void {
    const usageKey = this.usageKey(input.reservation.clientId, input.reservation.monthKey);
    const current = this.usageByClientMonth.get(usageKey);
    if (!current) {
      return;
    }
    this.usageByClientMonth.set(usageKey, {
      requestCount: Math.max(0, current.requestCount - 1),
      reservedCostUsd: roundMoney(Math.max(0, current.reservedCostUsd - input.reservation.reservedCostUsd))
    });
    const settings = normalizeSeedanceSettings(input.request.settings ?? {});
    this.writeUsageRecord({
      schemaVersion: "cinejelly.client-usage-ledger.v1",
      recordedAt: new Date().toISOString(),
      monthKey: input.reservation.monthKey,
      clientId: input.reservation.clientId,
      requestId: input.requestId,
      operation: "render.release",
      channel: input.channel,
      reservedCostUsd: input.reservation.reservedCostUsd,
      durationTargetSeconds: settings.durationTargetSeconds,
      qualityMode: settings.qualityMode,
      tier: settings.tier
    });
  }

  public summary(): unknown {
    const monthKey = monthKeyFor(new Date());
    return {
      enabled: this.policies.size > 0,
      requireClientPolicyForRender: this.requireClientPolicyForRender,
      usageLedgerConfigured: Boolean(this.usageLedgerPath),
      clientCount: this.policies.size,
      enabledClientCount: [...this.policies.values()].filter((policy) => policy.enabled).length,
      clients: [...this.policies.values()].map((policy) => {
        const usage = this.usageByClientMonth.get(this.usageKey(policy.clientId, monthKey));
        return {
          clientId: policy.clientId,
          enabled: policy.enabled,
          monthlyRequestLimit: policy.monthlyRequestLimit,
          monthlyReservedCostUsdLimit: policy.monthlyReservedCostUsdLimit,
          maxReservedCostUsdPerRequest: policy.maxReservedCostUsdPerRequest,
          defaultReservedCostUsdPerRequest: policy.defaultReservedCostUsdPerRequest,
          maxDurationTargetSeconds: policy.maxDurationTargetSeconds,
          allowedTiers: policy.allowedTiers,
          allowedQualityModes: policy.allowedQualityModes,
          usage: {
            monthKey,
            requestCount: usage?.requestCount ?? 0,
            reservedCostUsd: usage?.reservedCostUsd ?? 0
          }
        };
      })
    };
  }

  private assertSettingsAllowed(
    policy: ApiClientPolicy,
    settings: ReturnType<typeof normalizeSeedanceSettings>
  ): void {
    if (
      policy.maxDurationTargetSeconds !== undefined &&
      settings.durationTargetSeconds > policy.maxDurationTargetSeconds
    ) {
      throw new ApiClientPolicyError(
        `Requested duration ${settings.durationTargetSeconds}s exceeds client limit ${policy.maxDurationTargetSeconds}s.`,
        403
      );
    }
    if (policy.allowedTiers && !policy.allowedTiers.includes(settings.tier)) {
      throw new ApiClientPolicyError(`Client is not allowed to use tier ${settings.tier}.`, 403);
    }
    if (policy.allowedQualityModes && !policy.allowedQualityModes.includes(settings.qualityMode)) {
      throw new ApiClientPolicyError(`Client is not allowed to use quality mode ${settings.qualityMode}.`, 403);
    }
  }

  private reservedCostUsdFor(policy: ApiClientPolicy, request: CineJellyProjectRequest): number {
    const requestedMaxCostUsd = request.settings?.maxCostUsd;
    if (requestedMaxCostUsd !== undefined) {
      return roundMoney(requestedMaxCostUsd);
    }
    if (policy.defaultReservedCostUsdPerRequest !== undefined) {
      return roundMoney(policy.defaultReservedCostUsdPerRequest);
    }
    if (policy.monthlyReservedCostUsdLimit !== undefined || policy.maxReservedCostUsdPerRequest !== undefined) {
      throw new ApiClientPolicyError(
        "Client render requests must include settings.maxCostUsd or the client policy must define defaultReservedCostUsdPerRequest.",
        400
      );
    }
    return 0;
  }

  private assertRequestCostAllowed(policy: ApiClientPolicy, reservedCostUsd: number): void {
    if (
      policy.maxReservedCostUsdPerRequest !== undefined &&
      reservedCostUsd > policy.maxReservedCostUsdPerRequest
    ) {
      throw new ApiClientPolicyError(
        `Reserved request cost ${reservedCostUsd} USD exceeds client per-request limit ${policy.maxReservedCostUsdPerRequest} USD.`,
        403
      );
    }
  }

  private assertMonthlyLimits(policy: ApiClientPolicy, usage: UsageTotals): void {
    if (policy.monthlyRequestLimit !== undefined && usage.requestCount > policy.monthlyRequestLimit) {
      throw new ApiClientPolicyError("Client monthly request quota has been reached.", 429, secondsUntilNextMonth());
    }
    if (
      policy.monthlyReservedCostUsdLimit !== undefined &&
      usage.reservedCostUsd > policy.monthlyReservedCostUsdLimit
    ) {
      throw new ApiClientPolicyError("Client monthly reserved-cost quota has been reached.", 429, secondsUntilNextMonth());
    }
  }

  private loadUsageLedger(): void {
    if (!this.usageLedgerPath || !existsSync(this.usageLedgerPath)) {
      return;
    }
    const text = readFileSync(this.usageLedgerPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const record = JSON.parse(line) as Partial<UsageLedgerRecord>;
        if (
          record.schemaVersion !== "cinejelly.client-usage-ledger.v1" ||
          record.operation !== "render.reserve" ||
          typeof record.clientId !== "string" ||
          typeof record.monthKey !== "string" ||
          typeof record.reservedCostUsd !== "number"
        ) {
          continue;
        }
        const key = this.usageKey(record.clientId, record.monthKey);
        const current = this.usageByClientMonth.get(key) ?? { requestCount: 0, reservedCostUsd: 0 };
        this.usageByClientMonth.set(key, {
          requestCount: current.requestCount + 1,
          reservedCostUsd: roundMoney(current.reservedCostUsd + Math.max(0, record.reservedCostUsd))
        });
      } catch {
        continue;
      }
    }
  }

  private writeUsageRecord(record: UsageLedgerRecord): void {
    if (!this.usageLedgerPath) {
      return;
    }
    mkdirSync(dirname(resolve(this.usageLedgerPath)), { recursive: true });
    appendFileSync(this.usageLedgerPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private usageKey(clientId: string, monthKey: string): string {
    return `${clientId}:${monthKey}`;
  }
}

export function loadApiClientPolicySettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ApiClientPolicySettings {
  const policies = parseApiClientPoliciesJson(env.CINEJELLY_API_CLIENTS_JSON);
  return {
    policies,
    requireClientPolicyForRender: readBooleanFlag(
      "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER",
      env.CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER
    ),
    ...(env.CINEJELLY_CLIENT_USAGE_LEDGER_PATH?.trim()
      ? { usageLedgerPath: env.CINEJELLY_CLIENT_USAGE_LEDGER_PATH.trim() }
      : {})
  };
}

export function parseApiClientPoliciesJson(value: string | undefined): readonly ApiClientPolicy[] {
  if (!value?.trim()) {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("CINEJELLY_API_CLIENTS_JSON must be a JSON array.");
  }
  const clientIds = new Set<string>();
  const keyDigests = new Set<string>();
  return parsed.map((item, index) => {
    const policy = parsePolicy(item, index);
    if (clientIds.has(policy.clientId)) {
      throw new Error(`CINEJELLY_API_CLIENTS_JSON has duplicate clientId ${policy.clientId}.`);
    }
    if (keyDigests.has(policy.keySha256)) {
      throw new Error("CINEJELLY_API_CLIENTS_JSON has duplicate keySha256 values.");
    }
    clientIds.add(policy.clientId);
    keyDigests.add(policy.keySha256);
    return policy;
  });
}

function parsePolicy(value: unknown, index: number): ApiClientPolicy {
  const payload = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
  if (!payload) {
    throw new Error(`CINEJELLY_API_CLIENTS_JSON[${index}] must be an object.`);
  }
  const clientId = requiredString(payload.clientId, `CINEJELLY_API_CLIENTS_JSON[${index}].clientId`);
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error(`CINEJELLY_API_CLIENTS_JSON[${index}].clientId is invalid.`);
  }
  const keySha256 = requiredString(payload.keySha256, `CINEJELLY_API_CLIENTS_JSON[${index}].keySha256`).toLowerCase();
  if (!SHA256_HEX_PATTERN.test(keySha256)) {
    throw new Error(`CINEJELLY_API_CLIENTS_JSON[${index}].keySha256 must be a SHA-256 hex digest.`);
  }
  return {
    clientId,
    keySha256,
    enabled: optionalBoolean(payload.enabled, true, `CINEJELLY_API_CLIENTS_JSON[${index}].enabled`),
    ...optionalPositiveInteger(payload.monthlyRequestLimit, `CINEJELLY_API_CLIENTS_JSON[${index}].monthlyRequestLimit`),
    ...optionalMoney(payload.monthlyReservedCostUsdLimit, `CINEJELLY_API_CLIENTS_JSON[${index}].monthlyReservedCostUsdLimit`),
    ...optionalMoney(payload.maxReservedCostUsdPerRequest, `CINEJELLY_API_CLIENTS_JSON[${index}].maxReservedCostUsdPerRequest`),
    ...optionalMoney(payload.defaultReservedCostUsdPerRequest, `CINEJELLY_API_CLIENTS_JSON[${index}].defaultReservedCostUsdPerRequest`),
    ...optionalPositiveInteger(payload.maxDurationTargetSeconds, `CINEJELLY_API_CLIENTS_JSON[${index}].maxDurationTargetSeconds`),
    ...optionalOptionArray(payload.allowedTiers, SPEED_TIERS, "allowedTiers", `CINEJELLY_API_CLIENTS_JSON[${index}].allowedTiers`),
    ...optionalOptionArray(
      payload.allowedQualityModes,
      QUALITY_MODES,
      "allowedQualityModes",
      `CINEJELLY_API_CLIENTS_JSON[${index}].allowedQualityModes`
    )
  };
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${fieldName} must not contain control characters.`);
  }
  return value.trim();
}

function optionalBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return { [fieldName.split(".").at(-1) ?? fieldName]: value };
}

function optionalMoney(value: unknown, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
  return { [fieldName.split(".").at(-1) ?? fieldName]: roundMoney(value) };
}

function optionalOptionArray<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  outputKey: string,
  fieldName: string
): object {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array.`);
  }
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item as TValue)) {
      throw new Error(`${fieldName} contains unsupported value ${String(item)}.`);
    }
  }
  return { [outputKey]: value as readonly TValue[] };
}

function readBooleanFlag(name: string, value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false when set.`);
}

function monthKeyFor(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function secondsUntilNextMonth(now = new Date()): number {
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / 1000));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}
