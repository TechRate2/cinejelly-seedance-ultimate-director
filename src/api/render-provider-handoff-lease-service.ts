/**
 * Deployment-facing lease service for render-provider handoff workers.
 * It exposes the same contract consumed by HttpRenderProviderHandoffLeaseStore,
 * backed by a serialized local store for single-service durable deployment.
 */

import { resolve } from "node:path";
import { RenderRequestAdmissionError } from "./render-request-admission.js";
import type {
  RenderProviderHandoffLeaseRecord,
  RenderProviderHandoffLeaseStore,
  RenderProviderLeaseAcquireResult,
  RenderProviderLeaseHeartbeatResult
} from "./render-provider-handoff.js";

export const RENDER_PROVIDER_HANDOFF_LEASE_SERVICE_PATH = "/v1/render-provider-handoff-leases";
const MIN_LEASE_TTL_MS = 1_000;
const MAX_LEASE_TTL_MS = 86_400_000;
const MAX_ID_LENGTH = 200;

export interface RenderProviderHandoffLeaseServiceRequest {
  readonly method: string | undefined;
  readonly operation: string;
  readonly searchParams?: URLSearchParams;
  readonly body?: unknown;
}

export interface RenderProviderHandoffLeaseServiceResponse {
  readonly statusCode: number;
  readonly payload: unknown;
}

export class SerializedRenderProviderHandoffLeaseStore implements RenderProviderHandoffLeaseStore {
  private readonly inner: RenderProviderHandoffLeaseStore;
  private pending: Promise<void> = Promise.resolve();

  public constructor(inner: RenderProviderHandoffLeaseStore) {
    this.inner = inner;
  }

  public acquireLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseAcquireResult> {
    return this.runExclusive(() => this.inner.acquireLease(input));
  }

  public releaseLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId?: string;
    readonly now?: Date;
  }): Promise<boolean> {
    return this.runExclusive(() => this.inner.releaseLease(input));
  }

  public heartbeatLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseHeartbeatResult> {
    return this.runExclusive(() => this.inner.heartbeatLease(input));
  }

  public listLeases(): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    return this.runExclusive(() => this.inner.listLeases());
  }

  public listActiveLeases(now?: Date): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    return this.runExclusive(() => this.inner.listActiveLeases(now));
  }

  private runExclusive<TValue>(task: () => Promise<TValue>): Promise<TValue> {
    const run = this.pending.then(task, task);
    this.pending = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export class RenderProviderHandoffLeaseService {
  private readonly leaseStore: RenderProviderHandoffLeaseStore;

  public constructor(input: { readonly leaseStore: RenderProviderHandoffLeaseStore }) {
    this.leaseStore = input.leaseStore;
  }

  public async handle(
    request: RenderProviderHandoffLeaseServiceRequest
  ): Promise<RenderProviderHandoffLeaseServiceResponse> {
    if (request.operation === "acquire") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: this.acquireResult(await this.leaseStore.acquireLease(this.acquireInput(request.body)))
      }));
    }
    if (request.operation === "release") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: { released: await this.leaseStore.releaseLease(this.releaseInput(request.body)) }
      }));
    }
    if (request.operation === "heartbeat") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: this.heartbeatResult(await this.leaseStore.heartbeatLease(this.heartbeatInput(request.body)))
      }));
    }
    if (request.operation === "leases") {
      return this.getOnly(request, async () => ({
        statusCode: 200,
        payload: { leases: (await this.leaseStore.listLeases()).map((lease) => this.lease(lease)) }
      }));
    }
    if (request.operation === "active") {
      return this.getOnly(request, async () => ({
        statusCode: 200,
        payload: {
          leases: (await this.leaseStore.listActiveLeases(this.optionalNowFromQuery(request.searchParams))).map((lease) =>
            this.lease(lease)
          )
        }
      }));
    }
    return {
      statusCode: 404,
      payload: { error: "Render provider handoff lease operation not found." }
    };
  }

  private async postOnly(
    request: RenderProviderHandoffLeaseServiceRequest,
    callback: () => Promise<RenderProviderHandoffLeaseServiceResponse>
  ): Promise<RenderProviderHandoffLeaseServiceResponse> {
    if (request.method !== "POST") {
      return {
        statusCode: 405,
        payload: { error: "Render provider handoff lease operation requires POST." }
      };
    }
    return callback();
  }

  private async getOnly(
    request: RenderProviderHandoffLeaseServiceRequest,
    callback: () => Promise<RenderProviderHandoffLeaseServiceResponse>
  ): Promise<RenderProviderHandoffLeaseServiceResponse> {
    if (request.method !== "GET") {
      return {
        statusCode: 405,
        payload: { error: "Render provider handoff lease operation requires GET." }
      };
    }
    return callback();
  }

  private acquireInput(body: unknown): {
    readonly jobId: string;
    readonly ownerId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      jobId: this.stringValue(record, "jobId"),
      ownerId: this.stringValue(record, "ownerId"),
      ttlMs: this.ttlMs(record.ttlMs),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private releaseInput(body: unknown): {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId?: string;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      jobId: this.stringValue(record, "jobId"),
      ownerId: this.stringValue(record, "ownerId"),
      ...(record.leaseId !== undefined ? { leaseId: this.stringValue(record, "leaseId") } : {}),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private heartbeatInput(body: unknown): {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      jobId: this.stringValue(record, "jobId"),
      ownerId: this.stringValue(record, "ownerId"),
      leaseId: this.stringValue(record, "leaseId"),
      ttlMs: this.ttlMs(record.ttlMs),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private acquireResult(result: RenderProviderLeaseAcquireResult): Record<string, unknown> {
    if (result.status === "held_by_other") {
      return {
        status: result.status,
        ...(result.heldBy ? { heldBy: { expiresAt: result.heldBy.expiresAt.toISOString() } } : {})
      };
    }
    return {
      status: result.status,
      ...(result.lease ? { lease: this.lease(result.lease) } : {})
    };
  }

  private heartbeatResult(result: RenderProviderLeaseHeartbeatResult): Record<string, unknown> {
    if (result.status !== "recorded") {
      return {
        status: result.status,
        ...(result.expiresAt ? { expiresAt: result.expiresAt.toISOString() } : {})
      };
    }
    return {
      status: result.status,
      ...(result.lease ? { lease: this.lease(result.lease) } : {}),
      ...(result.heartbeatAt ? { heartbeatAt: result.heartbeatAt.toISOString() } : {})
    };
  }

  private lease(lease: RenderProviderHandoffLeaseRecord): Record<string, unknown> {
    return {
      jobId: lease.jobId,
      leaseId: lease.leaseId,
      ownerId: lease.ownerId,
      acquiredAt: lease.acquiredAt.toISOString(),
      expiresAt: lease.expiresAt.toISOString(),
      ...(lease.renewedAt ? { renewedAt: lease.renewedAt.toISOString() } : {}),
      ...(lease.releasedAt ? { releasedAt: lease.releasedAt.toISOString() } : {})
    };
  }

  private bodyRecord(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RenderRequestAdmissionError("Render provider handoff lease request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  }

  private stringValue(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new RenderRequestAdmissionError(`Render provider handoff lease ${key} must be a non-empty string.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new RenderRequestAdmissionError(`Render provider handoff lease ${key} must be a safe bounded identifier.`);
    }
    return trimmed;
  }

  private ttlMs(value: unknown): number {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < MIN_LEASE_TTL_MS ||
      value > MAX_LEASE_TTL_MS
    ) {
      throw new RenderRequestAdmissionError(
        `Render provider handoff lease ttlMs must be an integer from ${MIN_LEASE_TTL_MS} to ${MAX_LEASE_TTL_MS}.`
      );
    }
    return value;
  }

  private optionalNowFromQuery(searchParams: URLSearchParams | undefined): Date | undefined {
    const raw = searchParams?.get("now");
    return raw ? this.date(raw, "now") : undefined;
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new RenderRequestAdmissionError(`Render provider handoff lease ${label} must be an ISO date string.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new RenderRequestAdmissionError(`Render provider handoff lease ${label} must be a valid ISO date string.`);
    }
    return parsed;
  }
}

export function readRenderProviderLeasePath(env: NodeJS.ProcessEnv): string | undefined {
  const configured = env.CINEJELLY_RENDER_PROVIDER_LEASE_PATH?.trim();
  if (!configured) {
    return undefined;
  }
  if (/[\u0000-\u001f\u007f]/.test(configured)) {
    throw new Error("CINEJELLY_RENDER_PROVIDER_LEASE_PATH must not contain control characters.");
  }
  return resolve(configured);
}
