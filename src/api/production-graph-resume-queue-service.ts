/**
 * Deployment-facing Production Graph resume queue service.
 * It exposes the local digest-only queue lifecycle through a deployment-token
 * protected HTTP contract so future workers can enqueue/lease/ack resume work
 * without storing raw graph state, raw queue names, or worker IDs.
 */

import { resolve } from "node:path";
import {
  FileProductionGraphResumeQueueStore,
  parseProductionGraphResumeStateCapsule,
  serializeProductionGraphResumeQueueRecord,
  type ProductionGraphResumeQueueAckResult,
  type ProductionGraphResumeQueueEnqueueResult,
  type ProductionGraphResumeQueueLeaseResult,
  type ProductionGraphResumeQueueRecord,
  type ProductionGraphResumeStateCapsule
} from "../core/production-graph-resume-state.js";
import { RenderRequestAdmissionError } from "./render-request-admission.js";

export const PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH = "/v1/production-graph-resume-queue";

const MIN_LEASE_TTL_MS = 60_000;
const MAX_LEASE_TTL_MS = 7 * 86_400_000;
const MAX_ID_LENGTH = 240;
const SECRET_OR_PATH_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

export interface ProductionGraphResumeQueueStore {
  enqueue(input: {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueEnqueueResult>;
  leaseNext(input: {
    readonly queueName: string;
    readonly workerId: string;
    readonly leaseTtlMs: number;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueLeaseResult>;
  acknowledge(input: {
    readonly queueRecordId: string;
    readonly leaseId: string;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueAckResult>;
  list(): Promise<readonly ProductionGraphResumeQueueRecord[]>;
}

export interface ProductionGraphResumeQueueServiceRequest {
  readonly method: string | undefined;
  readonly operation: string;
  readonly body?: unknown;
}

export interface ProductionGraphResumeQueueServiceResponse {
  readonly statusCode: number;
  readonly payload: unknown;
}

export class SerializedProductionGraphResumeQueueStore implements ProductionGraphResumeQueueStore {
  private readonly inner: ProductionGraphResumeQueueStore;
  private pending: Promise<void> = Promise.resolve();

  public constructor(inner: ProductionGraphResumeQueueStore) {
    this.inner = inner;
  }

  public enqueue(input: {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueEnqueueResult> {
    return this.runExclusive(() => this.inner.enqueue(input));
  }

  public leaseNext(input: {
    readonly queueName: string;
    readonly workerId: string;
    readonly leaseTtlMs: number;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueLeaseResult> {
    return this.runExclusive(() => this.inner.leaseNext(input));
  }

  public acknowledge(input: {
    readonly queueRecordId: string;
    readonly leaseId: string;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueAckResult> {
    return this.runExclusive(() => this.inner.acknowledge(input));
  }

  public list(): Promise<readonly ProductionGraphResumeQueueRecord[]> {
    return this.runExclusive(() => this.inner.list());
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

export class ProductionGraphResumeQueueService {
  private readonly queueStore: ProductionGraphResumeQueueStore;

  public constructor(input: { readonly queueStore: ProductionGraphResumeQueueStore }) {
    this.queueStore = input.queueStore;
  }

  public async handle(request: ProductionGraphResumeQueueServiceRequest): Promise<ProductionGraphResumeQueueServiceResponse> {
    if (request.operation === "enqueue") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: this.enqueueResult(await this.queueStore.enqueue(this.enqueueInput(request.body)))
      }));
    }
    if (request.operation === "lease") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: this.leaseResult(await this.queueStore.leaseNext(this.leaseInput(request.body)))
      }));
    }
    if (request.operation === "acknowledge") {
      return this.postOnly(request, async () => ({
        statusCode: 200,
        payload: this.ackResult(await this.queueStore.acknowledge(this.ackInput(request.body)))
      }));
    }
    if (request.operation === "records") {
      return this.getOnly(request, async () => ({
        statusCode: 200,
        payload: {
          records: (await this.queueStore.list()).map((record) => this.record(record))
        }
      }));
    }
    return {
      statusCode: 404,
      payload: { error: "Production Graph resume queue operation not found." }
    };
  }

  private async postOnly(
    request: ProductionGraphResumeQueueServiceRequest,
    callback: () => Promise<ProductionGraphResumeQueueServiceResponse>
  ): Promise<ProductionGraphResumeQueueServiceResponse> {
    if (request.method !== "POST") {
      return {
        statusCode: 405,
        payload: { error: "Production Graph resume queue operation requires POST." }
      };
    }
    return callback();
  }

  private async getOnly(
    request: ProductionGraphResumeQueueServiceRequest,
    callback: () => Promise<ProductionGraphResumeQueueServiceResponse>
  ): Promise<ProductionGraphResumeQueueServiceResponse> {
    if (request.method !== "GET") {
      return {
        statusCode: 405,
        payload: { error: "Production Graph resume queue operation requires GET." }
      };
    }
    return callback();
  }

  private enqueueInput(body: unknown): {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      queueName: this.safeLabel(record.queueName, "queueName"),
      capsule: parseProductionGraphResumeStateCapsule(record.capsule, "capsule"),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private leaseInput(body: unknown): {
    readonly queueName: string;
    readonly workerId: string;
    readonly leaseTtlMs: number;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      queueName: this.safeLabel(record.queueName, "queueName"),
      workerId: this.safeId(record.workerId, "workerId"),
      leaseTtlMs: this.ttlMs(record.leaseTtlMs),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private ackInput(body: unknown): {
    readonly queueRecordId: string;
    readonly leaseId: string;
    readonly now?: Date;
  } {
    const record = this.bodyRecord(body);
    return {
      queueRecordId: this.safeId(record.queueRecordId, "queueRecordId"),
      leaseId: this.safeId(record.leaseId, "leaseId"),
      ...(record.now !== undefined ? { now: this.date(record.now, "now") } : {})
    };
  }

  private enqueueResult(result: ProductionGraphResumeQueueEnqueueResult): Record<string, unknown> {
    return {
      status: result.status,
      record: this.record(result.record)
    };
  }

  private leaseResult(result: ProductionGraphResumeQueueLeaseResult): Record<string, unknown> {
    return {
      status: result.status,
      ...(result.record ? { record: this.record(result.record) } : {})
    };
  }

  private ackResult(result: ProductionGraphResumeQueueAckResult): Record<string, unknown> {
    return {
      status: result.status,
      ...(result.record ? { record: this.record(result.record) } : {})
    };
  }

  private record(record: ProductionGraphResumeQueueRecord): Record<string, unknown> {
    return serializeProductionGraphResumeQueueRecord(record);
  }

  private bodyRecord(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RenderRequestAdmissionError("Production Graph resume queue request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  }

  private safeId(value: unknown, label: string): string {
    return this.safeString(value, label, "identifier");
  }

  private safeLabel(value: unknown, label: string): string {
    return this.safeString(value, label, "label");
  }

  private safeString(value: unknown, label: string, kind: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new RenderRequestAdmissionError(`Production Graph resume queue ${label} must be a non-empty string.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed) || SECRET_OR_PATH_PATTERN.test(trimmed)) {
      throw new RenderRequestAdmissionError(`Production Graph resume queue ${label} must be a safe bounded ${kind}.`);
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
        `Production Graph resume queue leaseTtlMs must be an integer from ${MIN_LEASE_TTL_MS} to ${MAX_LEASE_TTL_MS}.`
      );
    }
    return value;
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new RenderRequestAdmissionError(`Production Graph resume queue ${label} must be an ISO date string.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new RenderRequestAdmissionError(`Production Graph resume queue ${label} must be a valid ISO date string.`);
    }
    return parsed;
  }
}

export function createProductionGraphResumeQueueService(input: {
  readonly queuePath: string;
  readonly maxRecords?: number;
}): ProductionGraphResumeQueueService {
  return new ProductionGraphResumeQueueService({
    queueStore: new SerializedProductionGraphResumeQueueStore(
      new FileProductionGraphResumeQueueStore({
        queuePath: input.queuePath,
        ...(input.maxRecords ? { maxRecords: input.maxRecords } : {})
      })
    )
  });
}

export function readProductionGraphResumeQueuePath(env: NodeJS.ProcessEnv): string | undefined {
  const configured = env.CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH?.trim();
  if (!configured) {
    return undefined;
  }
  if (/[\u0000-\u001f\u007f]/.test(configured)) {
    throw new Error("CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH must not contain control characters.");
  }
  return resolve(configured);
}
