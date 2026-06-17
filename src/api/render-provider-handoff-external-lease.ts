/**
 * External provider handoff lease-store adapter.
 * This keeps the handoff contract provider-neutral while allowing production deployments
 * to back leases with an HTTPS service instead of the local JSON smoke store.
 */

import type {
  RenderProviderHandoffLeaseRecord,
  RenderProviderHandoffLeaseStore,
  RenderProviderLeaseAcquireResult,
  RenderProviderLeaseAcquireStatus,
  RenderProviderLeaseHeartbeatResult,
  RenderProviderLeaseHeartbeatStatus
} from "./render-provider-handoff.js";

const DEFAULT_EXTERNAL_LEASE_PATH = "v1/render-provider-handoff-leases";
const DEFAULT_EXTERNAL_LEASE_TIMEOUT_MS = 10_000;
const MIN_EXTERNAL_LEASE_TIMEOUT_MS = 1_000;
const MAX_EXTERNAL_LEASE_TIMEOUT_MS = 60_000;
const MIN_EXTERNAL_LEASE_TTL_MS = 1_000;
const MAX_EXTERNAL_LEASE_TTL_MS = 86_400_000;
const MAX_EXTERNAL_ID_LENGTH = 200;
const MAX_EXTERNAL_LEASE_RESPONSE_BYTES = 512 * 1024;

type RenderProviderExternalLeaseFetch = typeof fetch;

export interface HttpRenderProviderHandoffLeaseStoreInput {
  readonly baseUrl: string;
  readonly bearerToken?: string;
  readonly endpointPath?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: RenderProviderExternalLeaseFetch;
}

export class HttpRenderProviderHandoffLeaseStore implements RenderProviderHandoffLeaseStore {
  private readonly baseUrl: URL;
  private readonly endpointPath: string;
  private readonly bearerToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: RenderProviderExternalLeaseFetch;

  public constructor(input: HttpRenderProviderHandoffLeaseStoreInput) {
    this.baseUrl = this.safeBaseUrl(input.baseUrl);
    this.endpointPath = this.safeEndpointPath(input.endpointPath ?? DEFAULT_EXTERNAL_LEASE_PATH);
    this.bearerToken = this.safeOptionalToken(input.bearerToken);
    this.timeoutMs = this.safeTimeout(input.timeoutMs ?? DEFAULT_EXTERNAL_LEASE_TIMEOUT_MS);
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  public async acquireLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseAcquireResult> {
    const payload = await this.requestJson("acquire", {
      jobId: this.safeId(input.jobId, "jobId"),
      ownerId: this.safeId(input.ownerId, "ownerId"),
      ttlMs: this.safeTtl(input.ttlMs),
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return this.acquireResult(payload);
  }

  public async releaseLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId?: string;
    readonly now?: Date;
  }): Promise<boolean> {
    const payload = await this.requestJson("release", {
      jobId: this.safeId(input.jobId, "jobId"),
      ownerId: this.safeId(input.ownerId, "ownerId"),
      ...(input.leaseId ? { leaseId: this.safeId(input.leaseId, "leaseId") } : {}),
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    const record = this.record(payload, "release response");
    if (typeof record.released !== "boolean") {
      throw new Error("External provider handoff lease release response must contain a released boolean.");
    }
    return record.released;
  }

  public async heartbeatLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseHeartbeatResult> {
    const payload = await this.requestJson("heartbeat", {
      jobId: this.safeId(input.jobId, "jobId"),
      ownerId: this.safeId(input.ownerId, "ownerId"),
      leaseId: this.safeId(input.leaseId, "leaseId"),
      ttlMs: this.safeTtl(input.ttlMs),
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return this.heartbeatResult(payload);
  }

  public async listLeases(): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    const payload = await this.requestJson("leases", undefined, "GET");
    return this.leaseList(payload, "leases response");
  }

  public async listActiveLeases(now: Date = new Date()): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    const payload = await this.requestJson(`active?now=${encodeURIComponent(now.toISOString())}`, undefined, "GET");
    return this.leaseList(payload, "active leases response");
  }

  private async requestJson(
    path: string,
    body?: Record<string, unknown>,
    method: "GET" | "POST" = "POST"
  ): Promise<unknown> {
    const url = this.url(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`External provider handoff lease service returned HTTP ${response.status}.`);
      }
      const text = await response.text();
      if (text.length > MAX_EXTERNAL_LEASE_RESPONSE_BYTES) {
        throw new Error("External provider handoff lease response exceeded the maximum JSON size.");
      }
      if (!text.trim()) {
        throw new Error("External provider handoff lease service returned an empty JSON response.");
      }
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("External provider handoff lease request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private url(path: string): URL {
    const cleanPath = path.replace(/^\/+/, "");
    return new URL(`${this.endpointPath}/${cleanPath}`, this.baseUrl);
  }

  private acquireResult(value: unknown): RenderProviderLeaseAcquireResult {
    const record = this.record(value, "acquire response");
    const status = this.acquireStatus(record.status);
    if (status === "held_by_other") {
      const heldBy = this.record(record.heldBy, "acquire response heldBy");
      return {
        status,
        heldBy: {
          expiresAt: this.date(heldBy.expiresAt, "heldBy.expiresAt")
        }
      };
    }
    return {
      status,
      lease: this.leaseRecord(record.lease, "acquire response lease")
    };
  }

  private heartbeatResult(value: unknown): RenderProviderLeaseHeartbeatResult {
    const record = this.record(value, "heartbeat response");
    const status = this.heartbeatStatus(record.status);
    if (status !== "recorded") {
      return {
        status,
        ...(record.expiresAt !== undefined ? { expiresAt: this.date(record.expiresAt, "heartbeat response expiresAt") } : {})
      };
    }
    const lease = this.leaseRecord(record.lease, "heartbeat response lease");
    return {
      status,
      lease,
      heartbeatAt: this.date(record.heartbeatAt, "heartbeat response heartbeatAt"),
      expiresAt: lease.expiresAt
    };
  }

  private leaseList(value: unknown, label: string): readonly RenderProviderHandoffLeaseRecord[] {
    const record = this.record(value, label);
    if (!Array.isArray(record.leases)) {
      throw new Error(`External provider handoff lease ${label} must contain a leases array.`);
    }
    return record.leases.map((item, index) => this.leaseRecord(item, `${label}.leases[${index}]`));
  }

  private leaseRecord(value: unknown, label: string): RenderProviderHandoffLeaseRecord {
    const record = this.record(value, label);
    return {
      jobId: this.safeId(record.jobId, `${label}.jobId`),
      leaseId: this.safeId(record.leaseId, `${label}.leaseId`),
      ownerId: this.safeId(record.ownerId, `${label}.ownerId`),
      acquiredAt: this.date(record.acquiredAt, `${label}.acquiredAt`),
      expiresAt: this.date(record.expiresAt, `${label}.expiresAt`),
      ...(record.renewedAt !== undefined ? { renewedAt: this.date(record.renewedAt, `${label}.renewedAt`) } : {}),
      ...(record.releasedAt !== undefined ? { releasedAt: this.date(record.releasedAt, `${label}.releasedAt`) } : {})
    };
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`External provider handoff lease ${label} must be a JSON object.`);
    }
    return value as Record<string, unknown>;
  }

  private acquireStatus(value: unknown): RenderProviderLeaseAcquireStatus {
    if (value === "acquired" || value === "renewed" || value === "held_by_other") {
      return value;
    }
    throw new Error("External provider handoff lease acquire response contained an invalid status.");
  }

  private heartbeatStatus(value: unknown): RenderProviderLeaseHeartbeatStatus {
    if (value === "recorded" || value === "lease_not_found" || value === "not_owner") {
      return value;
    }
    throw new Error("External provider handoff lease heartbeat response contained an invalid status.");
  }

  private safeBaseUrl(value: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("External provider handoff lease base URL must be a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("External provider handoff lease base URL must use HTTPS.");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("External provider handoff lease base URL must not contain credentials, query, or fragment.");
    }
    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return parsed;
  }

  private safeEndpointPath(value: string): string {
    const clean = value.trim().replace(/^\/+|\/+$/g, "");
    if (!clean || clean.includes("..") || /[\u0000-\u001f\u007f?#]/.test(clean)) {
      throw new Error("External provider handoff lease endpoint path must be a safe relative path.");
    }
    return clean;
  }

  private safeOptionalToken(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error("External provider handoff lease bearer token must be a safe non-empty string when configured.");
    }
    return trimmed;
  }

  private safeId(value: unknown, label: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`External provider handoff lease ${label} must be a non-empty string.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_EXTERNAL_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error(`External provider handoff lease ${label} is not a safe bounded identifier.`);
    }
    return trimmed;
  }

  private safeTtl(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_EXTERNAL_LEASE_TTL_MS || value > MAX_EXTERNAL_LEASE_TTL_MS) {
      throw new Error(
        `External provider handoff lease TTL must be an integer from ${MIN_EXTERNAL_LEASE_TTL_MS} to ${MAX_EXTERNAL_LEASE_TTL_MS} ms.`
      );
    }
    return value;
  }

  private safeTimeout(value: number): number {
    if (
      !Number.isSafeInteger(value) ||
      value < MIN_EXTERNAL_LEASE_TIMEOUT_MS ||
      value > MAX_EXTERNAL_LEASE_TIMEOUT_MS
    ) {
      throw new Error(
        `External provider handoff lease timeout must be an integer from ${MIN_EXTERNAL_LEASE_TIMEOUT_MS} to ${MAX_EXTERNAL_LEASE_TIMEOUT_MS} ms.`
      );
    }
    return value;
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new Error(`External provider handoff lease ${label} must be an ISO date string.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`External provider handoff lease ${label} must be a valid ISO date string.`);
    }
    return parsed;
  }
}
