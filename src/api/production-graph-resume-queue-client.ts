import { PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH } from "./production-graph-resume-queue-service.js";
import { serializeProductionGraphResumeStateCapsule, type ProductionGraphResumeStateCapsule } from "../core/production-graph-resume-state.js";

export type ProductionGraphResumeQueueClientEnqueueStatus = "enqueued" | "replayed";
export type ProductionGraphResumeQueueClientLeaseStatus = "leased" | "empty";
export type ProductionGraphResumeQueueClientAckStatus = "acknowledged" | "not_found" | "lease_mismatch";

export interface ProductionGraphResumeQueueClientRecord {
  readonly queueRecordId: string;
  readonly idempotencyKey: string;
  readonly queueNameSha256: string;
  readonly capsuleId: string;
  readonly capsuleSha256: string;
  readonly jobId: string;
  readonly actionId?: string;
  readonly graphStateSha256: string;
  readonly resumeCursorSha256: string;
  readonly predictionIdsSha256: string;
  readonly predictionIdCount: number;
  readonly activePredictionIdCount: number;
  readonly status: string;
  readonly enqueuedAt: string;
  readonly attemptCount: number;
  readonly leaseId?: string;
  readonly workerIdSha256?: string;
  readonly leasedAt?: string;
  readonly leaseExpiresAt?: string;
  readonly acknowledgedAt?: string;
}

export interface ProductionGraphResumeQueueClientEnqueueResult {
  readonly status: ProductionGraphResumeQueueClientEnqueueStatus;
  readonly record: ProductionGraphResumeQueueClientRecord;
}

export interface ProductionGraphResumeQueueClientLeaseResult {
  readonly status: ProductionGraphResumeQueueClientLeaseStatus;
  readonly record?: ProductionGraphResumeQueueClientRecord;
}

export interface ProductionGraphResumeQueueClientAckResult {
  readonly status: ProductionGraphResumeQueueClientAckStatus;
  readonly record?: ProductionGraphResumeQueueClientRecord;
}

export interface ProductionGraphResumeQueueClientListResult {
  readonly records: readonly ProductionGraphResumeQueueClientRecord[];
}

export class ProductionGraphResumeQueueHttpClient {
  private readonly baseUrl: URL;
  private readonly authToken: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(input: {
    readonly baseUrl: string;
    readonly authToken: string;
    readonly fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = this.readBaseUrl(input.baseUrl);
    this.authToken = this.safeToken(input.authToken);
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  public async enqueue(input: {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueClientEnqueueResult> {
    const payload = await this.post("enqueue", {
      queueName: input.queueName,
      capsule: serializeProductionGraphResumeStateCapsule(input.capsule),
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return {
      status: this.status(payload.status, ["enqueued", "replayed"], "status"),
      record: this.record(payload.record, "record")
    };
  }

  public async leaseNext(input: {
    readonly queueName: string;
    readonly workerId: string;
    readonly leaseTtlMs: number;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueClientLeaseResult> {
    const payload = await this.post("lease", {
      queueName: input.queueName,
      workerId: input.workerId,
      leaseTtlMs: input.leaseTtlMs,
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return {
      status: this.status(payload.status, ["leased", "empty"], "status"),
      ...(payload.record ? { record: this.record(payload.record, "record") } : {})
    };
  }

  public async acknowledge(input: {
    readonly queueRecordId: string;
    readonly leaseId: string;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueClientAckResult> {
    const payload = await this.post("acknowledge", {
      queueRecordId: input.queueRecordId,
      leaseId: input.leaseId,
      ...(input.now ? { now: input.now.toISOString() } : {})
    });
    return {
      status: this.status(payload.status, ["acknowledged", "not_found", "lease_mismatch"], "status"),
      ...(payload.record ? { record: this.record(payload.record, "record") } : {})
    };
  }

  public async list(): Promise<ProductionGraphResumeQueueClientListResult> {
    const response = await this.fetchImpl(this.url("records"), {
      method: "GET",
      headers: this.headers()
    });
    const payload = await this.responsePayload(response, "records");
    if (!Array.isArray(payload.records)) {
      throw new Error("Production Graph resume queue records response must contain records.");
    }
    return {
      records: payload.records.map((item, index) => this.record(item, `records[${index}]`))
    };
  }

  private async post(operation: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(this.url(operation), {
      method: "POST",
      headers: {
        ...this.headers(),
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return this.responsePayload(response, operation);
  }

  private async responsePayload(response: Response, operation: string): Promise<Record<string, unknown>> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`Production Graph resume queue ${operation} response was not JSON.`);
    }
    if (!response.ok) {
      throw new Error(`Production Graph resume queue ${operation} failed with HTTP ${response.status}.`);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`Production Graph resume queue ${operation} response must be a JSON object.`);
    }
    return payload as Record<string, unknown>;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.authToken}`
    };
  }

  private url(operation: string): string {
    return new URL(`${PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH}/${operation}`, this.baseUrl).toString();
  }

  private readBaseUrl(value: string): URL {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Production Graph resume queue base URL must be HTTP or HTTPS.");
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  }

  private safeToken(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error("Production Graph resume queue auth token must be a safe non-empty value.");
    }
    return trimmed;
  }

  private record(value: unknown, label: string): ProductionGraphResumeQueueClientRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Production Graph resume queue ${label} must be an object.`);
    }
    const payload = value as Record<string, unknown>;
    return {
      queueRecordId: this.string(payload.queueRecordId, `${label}.queueRecordId`),
      idempotencyKey: this.string(payload.idempotencyKey, `${label}.idempotencyKey`),
      queueNameSha256: this.sha256(payload.queueNameSha256, `${label}.queueNameSha256`),
      capsuleId: this.string(payload.capsuleId, `${label}.capsuleId`),
      capsuleSha256: this.sha256(payload.capsuleSha256, `${label}.capsuleSha256`),
      jobId: this.string(payload.jobId, `${label}.jobId`),
      ...(payload.actionId !== undefined ? { actionId: this.string(payload.actionId, `${label}.actionId`) } : {}),
      graphStateSha256: this.sha256(payload.graphStateSha256, `${label}.graphStateSha256`),
      resumeCursorSha256: this.sha256(payload.resumeCursorSha256, `${label}.resumeCursorSha256`),
      predictionIdsSha256: this.sha256(payload.predictionIdsSha256, `${label}.predictionIdsSha256`),
      predictionIdCount: this.integer(payload.predictionIdCount, `${label}.predictionIdCount`),
      activePredictionIdCount: this.integer(payload.activePredictionIdCount, `${label}.activePredictionIdCount`),
      status: this.string(payload.status, `${label}.status`),
      enqueuedAt: this.string(payload.enqueuedAt, `${label}.enqueuedAt`),
      attemptCount: this.integer(payload.attemptCount, `${label}.attemptCount`),
      ...(payload.leaseId !== undefined ? { leaseId: this.string(payload.leaseId, `${label}.leaseId`) } : {}),
      ...(payload.workerIdSha256 !== undefined ? { workerIdSha256: this.sha256(payload.workerIdSha256, `${label}.workerIdSha256`) } : {}),
      ...(payload.leasedAt !== undefined ? { leasedAt: this.string(payload.leasedAt, `${label}.leasedAt`) } : {}),
      ...(payload.leaseExpiresAt !== undefined ? { leaseExpiresAt: this.string(payload.leaseExpiresAt, `${label}.leaseExpiresAt`) } : {}),
      ...(payload.acknowledgedAt !== undefined ? { acknowledgedAt: this.string(payload.acknowledgedAt, `${label}.acknowledgedAt`) } : {})
    };
  }

  private string(value: unknown, label: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
  }

  private sha256(value: unknown, label: string): string {
    const text = this.string(value, label);
    if (!/^[a-f0-9]{64}$/.test(text)) {
      throw new Error(`${label} must be a SHA-256 digest.`);
    }
    return text;
  }

  private integer(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return value;
  }

  private status<TValue extends string>(value: unknown, allowed: readonly TValue[], label: string): TValue {
    if (typeof value !== "string" || !allowed.includes(value as TValue)) {
      throw new Error(`Production Graph resume queue ${label} is not supported.`);
    }
    return value as TValue;
  }
}
