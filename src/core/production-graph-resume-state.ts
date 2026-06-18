/**
 * Secure Production Graph resume-state capsule foundation.
 * It records the minimum redacted/digest-only graph resume facts a durable
 * worker queue can reference without serializing raw graph state or URLs.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GraphNodeType, ProductionGraphSnapshot } from "../types/graph.js";

export const PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION = "cinejelly.production-graph-resume-state.v1";
export const PRODUCTION_GRAPH_RESUME_STATE_STORE_SCHEMA_VERSION = "cinejelly.production-graph-resume-state-store.v1";
export const PRODUCTION_GRAPH_RESUME_QUEUE_SCHEMA_VERSION = "cinejelly.production-graph-resume-queue.v1";
export const PRODUCTION_GRAPH_RESUME_QUEUE_STORE_SCHEMA_VERSION = "cinejelly.production-graph-resume-queue-store.v1";

const DEFAULT_TTL_MS = 86_400_000;
const DEFAULT_MAX_CAPSULES = 500;
const DEFAULT_MAX_QUEUE_RECORDS = 1_000;
const MAX_ID_LENGTH = 240;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 7 * 86_400_000;

const SECRET_OR_PATH_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

const ACTIVE_PROVIDER_STATUSES = new Set(["queued", "running"]);

export interface ProductionGraphResumeProviderWorkInput {
  readonly providers?: readonly string[];
  readonly operations?: readonly string[];
  readonly predictionIds?: readonly string[];
  readonly activePredictionIds?: readonly string[];
  readonly terminalPredictionIds?: readonly string[];
}

export interface ProductionGraphResumeStateNodeSummary {
  readonly nodeIdSha256: string;
  readonly type: GraphNodeType;
  readonly dataSha256: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductionGraphResumeStateEdgeSummary {
  readonly edgeIdSha256: string;
  readonly fromNodeIdSha256: string;
  readonly toNodeIdSha256: string;
  readonly type: string;
  readonly createdAt: Date;
}

export interface ProductionGraphResumeStateCursor {
  readonly kind: "provider_work_resume";
  readonly cursorId: string;
  readonly nextNodeIdSha256: string;
  readonly nextNodeType: GraphNodeType | "manual_audit";
  readonly activeClipRenderCount: number;
  readonly pendingRepairActionCount: number;
  readonly terminalDeliverablePresent: boolean;
}

export interface ProductionGraphResumeStateCapsule {
  readonly schemaVersion: typeof PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION;
  readonly capsuleId: string;
  readonly jobId: string;
  readonly actionId?: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly sourceGraphSha256: string;
  readonly redactedGraphSha256: string;
  readonly capsuleSha256: string;
  readonly graphSummary: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly nodeTypeCounts: Readonly<Record<string, number>>;
    readonly nodes: readonly ProductionGraphResumeStateNodeSummary[];
    readonly edges: readonly ProductionGraphResumeStateEdgeSummary[];
  };
  readonly providerWorkSummary: {
    readonly providers: readonly string[];
    readonly operations: readonly string[];
    readonly predictionIdCount: number;
    readonly activePredictionIdCount: number;
    readonly terminalPredictionIdCount: number;
    readonly predictionIdsSha256: string;
    readonly activePredictionIdsSha256: string;
    readonly terminalPredictionIdsSha256: string;
    readonly requiresActionLedgerPredictionIds: true;
  };
  readonly resumeCursor: ProductionGraphResumeStateCursor;
  readonly redactionSummary: {
    readonly rawGraphStateStored: false;
    readonly rawProviderPayloadStored: false;
    readonly outputUrlsStored: false;
    readonly localPathsStored: false;
    readonly secretLikeTextStored: false;
    readonly publicPayloadSha256: string;
  };
  readonly releaseGateSummary: {
    readonly resumeStateCapsulePass: boolean;
    readonly canClaimDistributedResume: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}

export interface ProductionGraphResumeStateStoreRecord {
  readonly writtenAt: Date;
  readonly capsules: readonly ProductionGraphResumeStateCapsule[];
}

export type ProductionGraphResumeQueueRecordStatus = "queued" | "leased" | "acknowledged";
export type ProductionGraphResumeQueueEnqueueStatus = "enqueued" | "replayed";
export type ProductionGraphResumeQueueLeaseStatus = "leased" | "empty";
export type ProductionGraphResumeQueueAckStatus = "acknowledged" | "not_found" | "not_leased" | "lease_mismatch";

export interface ProductionGraphResumeQueueRecord {
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
  readonly status: ProductionGraphResumeQueueRecordStatus;
  readonly enqueuedAt: Date;
  readonly attemptCount: number;
  readonly leaseId?: string;
  readonly workerIdSha256?: string;
  readonly leasedAt?: Date;
  readonly leaseExpiresAt?: Date;
  readonly acknowledgedAt?: Date;
}

export interface ProductionGraphResumeQueueEnqueueResult {
  readonly status: ProductionGraphResumeQueueEnqueueStatus;
  readonly record: ProductionGraphResumeQueueRecord;
}

export interface ProductionGraphResumeQueueLeaseResult {
  readonly status: ProductionGraphResumeQueueLeaseStatus;
  readonly record?: ProductionGraphResumeQueueRecord;
}

export interface ProductionGraphResumeQueueAckResult {
  readonly status: ProductionGraphResumeQueueAckStatus;
  readonly record?: ProductionGraphResumeQueueRecord;
}

export interface ProductionGraphResumeQueueStoreRecord {
  readonly writtenAt: Date;
  readonly records: readonly ProductionGraphResumeQueueRecord[];
}

export function parseProductionGraphResumeStateCapsule(value: unknown, label = "capsule"): ProductionGraphResumeStateCapsule {
  return parseCapsule(value, label);
}

export function serializeProductionGraphResumeStateCapsule(capsule: ProductionGraphResumeStateCapsule): Record<string, unknown> {
  return storedCapsule(capsule);
}

export function serializeProductionGraphResumeQueueRecord(record: ProductionGraphResumeQueueRecord): Record<string, unknown> {
  return storedQueueRecord(record);
}

export class ProductionGraphResumeStateBuilder {
  public build(input: {
    readonly jobId: string;
    readonly graph: ProductionGraphSnapshot;
    readonly actionId?: string;
    readonly providerWork?: ProductionGraphResumeProviderWorkInput;
    readonly now?: Date;
    readonly ttlMs?: number;
  }): ProductionGraphResumeStateCapsule {
    const now = input.now ?? new Date();
    const ttlMs = this.safeTtl(input.ttlMs ?? DEFAULT_TTL_MS);
    const jobId = this.safeId(input.jobId, "jobId");
    const actionId = input.actionId ? this.safeId(input.actionId, "actionId") : undefined;
    const nodes = [...input.graph.nodes].sort((left, right) => left.id.localeCompare(right.id));
    const edges = [...input.graph.edges].sort((left, right) => left.id.localeCompare(right.id));
    const nodeSummaries = nodes.map((node) => ({
      nodeIdSha256: sha256(node.id),
      type: node.type,
      dataSha256: sha256(canonicalJson(node.data)),
      createdAt: dateFrom(node.createdAt, `${node.id}.createdAt`),
      updatedAt: dateFrom(node.updatedAt, `${node.id}.updatedAt`)
    }));
    const edgeSummaries = edges.map((edge) => ({
      edgeIdSha256: sha256(edge.id),
      fromNodeIdSha256: sha256(edge.fromNodeId),
      toNodeIdSha256: sha256(edge.toNodeId),
      type: edge.type,
      createdAt: dateFrom(edge.createdAt, `${edge.id}.createdAt`)
    }));
    const providerWork = this.providerWorkSummary(input.providerWork);
    const resumeCursor = this.resumeCursor({
      nodes,
      nodeSummaries,
      predictionActiveCount: providerWork.activePredictionIdCount
    });
    const nodeTypeCounts = nodeSummaries.reduce<Record<string, number>>((counts, node) => {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
      return counts;
    }, {});
    const redactedPayload = {
      schemaVersion: PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION,
      jobId,
      ...(actionId ? { actionId } : {}),
      graphSummary: {
        nodeCount: nodeSummaries.length,
        edgeCount: edgeSummaries.length,
        nodeTypeCounts,
        nodes: nodeSummaries,
        edges: edgeSummaries
      },
      providerWorkSummary: providerWork,
      resumeCursor
    };
    const sourceGraphSha256 = sha256(canonicalJson(input.graph));
    const redactedGraphSha256 = sha256(canonicalJson(redactedPayload.graphSummary));
    const capsuleBody = {
      ...redactedPayload,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      sourceGraphSha256,
      redactedGraphSha256
    };
    const capsuleSha256 = sha256(canonicalJson(capsuleBody));
    const publicPayloadSha256 = sha256(canonicalJson({ ...capsuleBody, capsuleSha256 }));
    return {
      schemaVersion: PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION,
      capsuleId: `graph_resume_state_${randomUUID()}`,
      jobId,
      ...(actionId ? { actionId } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      sourceGraphSha256,
      redactedGraphSha256,
      capsuleSha256,
      graphSummary: redactedPayload.graphSummary,
      providerWorkSummary: providerWork,
      resumeCursor,
      redactionSummary: {
        rawGraphStateStored: false,
        rawProviderPayloadStored: false,
        outputUrlsStored: false,
        localPathsStored: false,
        secretLikeTextStored: false,
        publicPayloadSha256
      },
      releaseGateSummary: {
        resumeStateCapsulePass: true,
        canClaimDistributedResume: false,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: "Resume-state capsule is digest-only local evidence; live queue enqueue, deployed worker ownership, and provider callback evidence are still required."
      }
    };
  }

  private providerWorkSummary(input: ProductionGraphResumeProviderWorkInput | undefined): ProductionGraphResumeStateCapsule["providerWorkSummary"] {
    const predictionIds = sortedSafeIds(input?.predictionIds ?? [], "predictionId");
    const activePredictionIds = sortedSafeIds(input?.activePredictionIds ?? [], "activePredictionId");
    const terminalPredictionIds = sortedSafeIds(input?.terminalPredictionIds ?? [], "terminalPredictionId");
    return {
      providers: sortedSafeLabels(input?.providers ?? [], "provider"),
      operations: sortedSafeLabels(input?.operations ?? [], "operation"),
      predictionIdCount: predictionIds.length,
      activePredictionIdCount: activePredictionIds.length,
      terminalPredictionIdCount: terminalPredictionIds.length,
      predictionIdsSha256: digestList(predictionIds),
      activePredictionIdsSha256: digestList(activePredictionIds),
      terminalPredictionIdsSha256: digestList(terminalPredictionIds),
      requiresActionLedgerPredictionIds: true
    };
  }

  private resumeCursor(input: {
    readonly nodes: readonly ProductionGraphSnapshot["nodes"][number][];
    readonly nodeSummaries: readonly ProductionGraphResumeStateNodeSummary[];
    readonly predictionActiveCount: number;
  }): ProductionGraphResumeStateCursor {
    const activeClip = input.nodes.find((node) =>
      node.type === "clip_render" &&
      ACTIVE_PROVIDER_STATUSES.has(String(node.data.status))
    );
    const repair = input.nodes.find((node) => node.type === "repair_action");
    const fallback = input.nodes.find((node) => node.type === "shot") ?? input.nodes[0];
    const nextNode = activeClip ?? repair ?? fallback;
    const nextNodeSummary = nextNode
      ? input.nodeSummaries.find((item) => item.nodeIdSha256 === sha256(nextNode.id))
      : undefined;
    return {
      kind: "provider_work_resume",
      cursorId: `graph_resume_cursor_${sha256(`${nextNode?.id ?? "manual_audit"}:${input.predictionActiveCount}`).slice(0, 24)}`,
      nextNodeIdSha256: nextNodeSummary?.nodeIdSha256 ?? sha256("manual_audit"),
      nextNodeType: nextNode?.type ?? "manual_audit",
      activeClipRenderCount: input.nodes.filter((node) =>
        node.type === "clip_render" &&
        ACTIVE_PROVIDER_STATUSES.has(String(node.data.status))
      ).length,
      pendingRepairActionCount: input.nodes.filter((node) => node.type === "repair_action").length,
      terminalDeliverablePresent: input.nodes.some((node) => node.type === "deliverable")
    };
  }

  private safeId(value: string, label: string): string {
    return safeId(value, label);
  }

  private safeTtl(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_TTL_MS || value > MAX_TTL_MS) {
      throw new Error(`Resume-state TTL must be an integer from ${MIN_TTL_MS} to ${MAX_TTL_MS} ms.`);
    }
    return value;
  }
}

export class FileProductionGraphResumeStateStore {
  private readonly statePath: string;
  private readonly maxCapsules: number;

  public constructor(input: {
    readonly statePath: string;
    readonly maxCapsules?: number;
  }) {
    this.statePath = input.statePath;
    this.maxCapsules = Math.max(10, input.maxCapsules ?? DEFAULT_MAX_CAPSULES);
  }

  public async save(capsule: ProductionGraphResumeStateCapsule): Promise<void> {
    const current = await this.readStore();
    const capsules = [
      ...current.capsules.filter((item) => item.capsuleId !== capsule.capsuleId),
      capsule
    ].slice(-this.maxCapsules);
    await this.writeStore({
      writtenAt: new Date(),
      capsules
    });
  }

  public async list(): Promise<readonly ProductionGraphResumeStateCapsule[]> {
    return (await this.readStore()).capsules;
  }

  public async findByJobId(jobId: string): Promise<ProductionGraphResumeStateCapsule | undefined> {
    const safeJobId = safeId(jobId, "jobId");
    const capsules = await this.list();
    return [...capsules]
      .filter((item) => item.jobId === safeJobId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  }

  private async readStore(): Promise<ProductionGraphResumeStateStoreRecord> {
    let text: string;
    try {
      text = await readFile(this.statePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {
          writtenAt: new Date(0),
          capsules: []
        };
      }
      throw error;
    }
    if (!text.trim()) {
      return {
        writtenAt: new Date(0),
        capsules: []
      };
    }
    return this.parseStore(JSON.parse(text) as unknown);
  }

  private async writeStore(record: ProductionGraphResumeStateStoreRecord): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = {
      schemaVersion: PRODUCTION_GRAPH_RESUME_STATE_STORE_SCHEMA_VERSION,
      writtenAt: record.writtenAt.toISOString(),
      capsules: record.capsules.map((capsule) => storedCapsule(capsule))
    };
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tempPath, this.statePath);
  }

  private parseStore(value: unknown): ProductionGraphResumeStateStoreRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Production Graph resume-state store must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    if (payload.schemaVersion !== PRODUCTION_GRAPH_RESUME_STATE_STORE_SCHEMA_VERSION) {
      throw new Error(`Production Graph resume-state store schema must be ${PRODUCTION_GRAPH_RESUME_STATE_STORE_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.capsules)) {
      throw new Error("Production Graph resume-state store must contain a capsules array.");
    }
    return {
      writtenAt: dateFrom(payload.writtenAt, "writtenAt"),
      capsules: payload.capsules.map((item, index) => parseCapsule(item, `capsules[${index}]`))
    };
  }
}

export class FileProductionGraphResumeQueueStore {
  private readonly queuePath: string;
  private readonly maxRecords: number;

  public constructor(input: {
    readonly queuePath: string;
    readonly maxRecords?: number;
  }) {
    this.queuePath = input.queuePath;
    this.maxRecords = Math.max(10, input.maxRecords ?? DEFAULT_MAX_QUEUE_RECORDS);
  }

  public async enqueue(input: {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueEnqueueResult> {
    const now = input.now ?? new Date();
    const queueNameSha256 = sha256(safeLabel(input.queueName, "queueName"));
    const idempotencyKey = this.idempotencyKey(queueNameSha256, input.capsule);
    const current = await this.readStore();
    const existing = current.records.find((record) => record.idempotencyKey === idempotencyKey);
    if (existing) {
      return {
        status: "replayed",
        record: existing
      };
    }
    const record: ProductionGraphResumeQueueRecord = {
      queueRecordId: `graph_resume_queue_${randomUUID()}`,
      idempotencyKey,
      queueNameSha256,
      capsuleId: safeId(input.capsule.capsuleId, "capsuleId"),
      capsuleSha256: sha256Value(input.capsule.capsuleSha256, "capsuleSha256"),
      jobId: safeId(input.capsule.jobId, "jobId"),
      ...(input.capsule.actionId ? { actionId: safeId(input.capsule.actionId, "actionId") } : {}),
      graphStateSha256: sha256Value(input.capsule.redactedGraphSha256, "redactedGraphSha256"),
      resumeCursorSha256: sha256(canonicalJson(input.capsule.resumeCursor)),
      predictionIdsSha256: sha256Value(input.capsule.providerWorkSummary.predictionIdsSha256, "predictionIdsSha256"),
      predictionIdCount: integerValue(input.capsule.providerWorkSummary.predictionIdCount, "predictionIdCount"),
      activePredictionIdCount: integerValue(input.capsule.providerWorkSummary.activePredictionIdCount, "activePredictionIdCount"),
      status: "queued",
      enqueuedAt: now,
      attemptCount: 0
    };
    await this.writeStore({
      writtenAt: new Date(),
      records: [...current.records, record].slice(-this.maxRecords)
    });
    return {
      status: "enqueued",
      record
    };
  }

  public async leaseNext(input: {
    readonly queueName: string;
    readonly workerId: string;
    readonly leaseTtlMs: number;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueLeaseResult> {
    const now = input.now ?? new Date();
    const ttlMs = safeTtl(input.leaseTtlMs, "leaseTtlMs");
    const queueNameSha256 = sha256(safeLabel(input.queueName, "queueName"));
    const workerIdSha256 = sha256(safeId(input.workerId, "workerId"));
    const current = await this.readStore();
    const candidate = [...current.records]
      .filter((record) =>
        record.queueNameSha256 === queueNameSha256 &&
        record.status !== "acknowledged" &&
        (record.status === "queued" || !record.leaseExpiresAt || record.leaseExpiresAt.getTime() <= now.getTime())
      )
      .sort((left, right) => left.enqueuedAt.getTime() - right.enqueuedAt.getTime())[0];
    if (!candidate) {
      return {
        status: "empty"
      };
    }
    const leased: ProductionGraphResumeQueueRecord = {
      ...candidate,
      status: "leased",
      leaseId: `graph_resume_lease_${randomUUID()}`,
      workerIdSha256,
      leasedAt: now,
      leaseExpiresAt: new Date(now.getTime() + ttlMs),
      attemptCount: candidate.attemptCount + 1
    };
    await this.writeStore({
      writtenAt: new Date(),
      records: current.records.map((record) =>
        record.queueRecordId === candidate.queueRecordId ? leased : record
      )
    });
    return {
      status: "leased",
      record: leased
    };
  }

  public async acknowledge(input: {
    readonly queueRecordId: string;
    readonly leaseId: string;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueAckResult> {
    const queueRecordId = safeId(input.queueRecordId, "queueRecordId");
    const leaseId = safeId(input.leaseId, "leaseId");
    const now = input.now ?? new Date();
    const current = await this.readStore();
    const target = current.records.find((record) => record.queueRecordId === queueRecordId);
    if (!target) {
      return { status: "not_found" };
    }
    if (target.status !== "leased") {
      return {
        status: "not_leased",
        record: target
      };
    }
    if (target.leaseId !== leaseId) {
      return {
        status: "lease_mismatch",
        record: target
      };
    }
    const acknowledged: ProductionGraphResumeQueueRecord = {
      ...target,
      status: "acknowledged",
      acknowledgedAt: now
    };
    await this.writeStore({
      writtenAt: new Date(),
      records: current.records.map((record) =>
        record.queueRecordId === target.queueRecordId ? acknowledged : record
      )
    });
    return {
      status: "acknowledged",
      record: acknowledged
    };
  }

  public async list(): Promise<readonly ProductionGraphResumeQueueRecord[]> {
    return (await this.readStore()).records;
  }

  private idempotencyKey(queueNameSha256: string, capsule: ProductionGraphResumeStateCapsule): string {
    return `graph_resume_enqueue_${sha256(canonicalJson({
      schemaVersion: PRODUCTION_GRAPH_RESUME_QUEUE_SCHEMA_VERSION,
      queueNameSha256,
      capsuleSha256: capsule.capsuleSha256,
      jobId: capsule.jobId,
      actionId: capsule.actionId ?? ""
    })).slice(0, 32)}`;
  }

  private async readStore(): Promise<ProductionGraphResumeQueueStoreRecord> {
    let text: string;
    try {
      text = await readFile(this.queuePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {
          writtenAt: new Date(0),
          records: []
        };
      }
      throw error;
    }
    if (!text.trim()) {
      return {
        writtenAt: new Date(0),
        records: []
      };
    }
    return this.parseStore(JSON.parse(text) as unknown);
  }

  private async writeStore(record: ProductionGraphResumeQueueStoreRecord): Promise<void> {
    await mkdir(dirname(this.queuePath), { recursive: true });
    const tempPath = `${this.queuePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = {
      schemaVersion: PRODUCTION_GRAPH_RESUME_QUEUE_STORE_SCHEMA_VERSION,
      writtenAt: record.writtenAt.toISOString(),
      records: record.records.map((item) => storedQueueRecord(item))
    };
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tempPath, this.queuePath);
  }

  private parseStore(value: unknown): ProductionGraphResumeQueueStoreRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Production Graph resume queue store must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    if (payload.schemaVersion !== PRODUCTION_GRAPH_RESUME_QUEUE_STORE_SCHEMA_VERSION) {
      throw new Error(`Production Graph resume queue store schema must be ${PRODUCTION_GRAPH_RESUME_QUEUE_STORE_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.records)) {
      throw new Error("Production Graph resume queue store must contain a records array.");
    }
    return {
      writtenAt: dateFrom(payload.writtenAt, "writtenAt"),
      records: payload.records.map((item, index) => queueRecord(item, `records[${index}]`))
    };
  }
}

function parseCapsule(value: unknown, label: string): ProductionGraphResumeStateCapsule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION) {
    throw new Error(`${label}.schemaVersion must be ${PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION}.`);
  }
  return {
    schemaVersion: PRODUCTION_GRAPH_RESUME_STATE_SCHEMA_VERSION,
    capsuleId: safeId(payload.capsuleId, `${label}.capsuleId`),
    jobId: safeId(payload.jobId, `${label}.jobId`),
    ...(payload.actionId !== undefined ? { actionId: safeId(payload.actionId, `${label}.actionId`) } : {}),
    createdAt: dateFrom(payload.createdAt, `${label}.createdAt`),
    expiresAt: dateFrom(payload.expiresAt, `${label}.expiresAt`),
    sourceGraphSha256: sha256Value(payload.sourceGraphSha256, `${label}.sourceGraphSha256`),
    redactedGraphSha256: sha256Value(payload.redactedGraphSha256, `${label}.redactedGraphSha256`),
    capsuleSha256: sha256Value(payload.capsuleSha256, `${label}.capsuleSha256`),
    graphSummary: graphSummary(payload.graphSummary, `${label}.graphSummary`),
    providerWorkSummary: providerWorkSummary(payload.providerWorkSummary, `${label}.providerWorkSummary`),
    resumeCursor: resumeCursor(payload.resumeCursor, `${label}.resumeCursor`),
    redactionSummary: redactionSummary(payload.redactionSummary, `${label}.redactionSummary`),
    releaseGateSummary: releaseGateSummary(payload.releaseGateSummary, `${label}.releaseGateSummary`)
  };
}

function graphSummary(value: unknown, label: string): ProductionGraphResumeStateCapsule["graphSummary"] {
  const payload = objectValue(value, label);
  return {
    nodeCount: integerValue(payload.nodeCount, `${label}.nodeCount`),
    edgeCount: integerValue(payload.edgeCount, `${label}.edgeCount`),
    nodeTypeCounts: recordOfNumbers(payload.nodeTypeCounts, `${label}.nodeTypeCounts`),
    nodes: arrayValue(payload.nodes, `${label}.nodes`).map((item, index) => nodeSummary(item, `${label}.nodes[${index}]`)),
    edges: arrayValue(payload.edges, `${label}.edges`).map((item, index) => edgeSummary(item, `${label}.edges[${index}]`))
  };
}

function nodeSummary(value: unknown, label: string): ProductionGraphResumeStateNodeSummary {
  const payload = objectValue(value, label);
  return {
    nodeIdSha256: sha256Value(payload.nodeIdSha256, `${label}.nodeIdSha256`),
    type: safeLabel(payload.type, `${label}.type`) as GraphNodeType,
    dataSha256: sha256Value(payload.dataSha256, `${label}.dataSha256`),
    createdAt: dateFrom(payload.createdAt, `${label}.createdAt`),
    updatedAt: dateFrom(payload.updatedAt, `${label}.updatedAt`)
  };
}

function edgeSummary(value: unknown, label: string): ProductionGraphResumeStateEdgeSummary {
  const payload = objectValue(value, label);
  return {
    edgeIdSha256: sha256Value(payload.edgeIdSha256, `${label}.edgeIdSha256`),
    fromNodeIdSha256: sha256Value(payload.fromNodeIdSha256, `${label}.fromNodeIdSha256`),
    toNodeIdSha256: sha256Value(payload.toNodeIdSha256, `${label}.toNodeIdSha256`),
    type: safeLabel(payload.type, `${label}.type`),
    createdAt: dateFrom(payload.createdAt, `${label}.createdAt`)
  };
}

function providerWorkSummary(value: unknown, label: string): ProductionGraphResumeStateCapsule["providerWorkSummary"] {
  const payload = objectValue(value, label);
  return {
    providers: arrayValue(payload.providers, `${label}.providers`).map((item, index) => safeLabel(item, `${label}.providers[${index}]`)),
    operations: arrayValue(payload.operations, `${label}.operations`).map((item, index) => safeLabel(item, `${label}.operations[${index}]`)),
    predictionIdCount: integerValue(payload.predictionIdCount, `${label}.predictionIdCount`),
    activePredictionIdCount: integerValue(payload.activePredictionIdCount, `${label}.activePredictionIdCount`),
    terminalPredictionIdCount: integerValue(payload.terminalPredictionIdCount, `${label}.terminalPredictionIdCount`),
    predictionIdsSha256: sha256Value(payload.predictionIdsSha256, `${label}.predictionIdsSha256`),
    activePredictionIdsSha256: sha256Value(payload.activePredictionIdsSha256, `${label}.activePredictionIdsSha256`),
    terminalPredictionIdsSha256: sha256Value(payload.terminalPredictionIdsSha256, `${label}.terminalPredictionIdsSha256`),
    requiresActionLedgerPredictionIds: true
  };
}

function resumeCursor(value: unknown, label: string): ProductionGraphResumeStateCursor {
  const payload = objectValue(value, label);
  if (payload.kind !== "provider_work_resume") {
    throw new Error(`${label}.kind must be provider_work_resume.`);
  }
  return {
    kind: "provider_work_resume",
    cursorId: safeId(payload.cursorId, `${label}.cursorId`),
    nextNodeIdSha256: sha256Value(payload.nextNodeIdSha256, `${label}.nextNodeIdSha256`),
    nextNodeType: safeLabel(payload.nextNodeType, `${label}.nextNodeType`) as GraphNodeType | "manual_audit",
    activeClipRenderCount: integerValue(payload.activeClipRenderCount, `${label}.activeClipRenderCount`),
    pendingRepairActionCount: integerValue(payload.pendingRepairActionCount, `${label}.pendingRepairActionCount`),
    terminalDeliverablePresent: payload.terminalDeliverablePresent === true
  };
}

function redactionSummary(value: unknown, label: string): ProductionGraphResumeStateCapsule["redactionSummary"] {
  const payload = objectValue(value, label);
  if (
    payload.rawGraphStateStored !== false ||
    payload.rawProviderPayloadStored !== false ||
    payload.outputUrlsStored !== false ||
    payload.localPathsStored !== false ||
    payload.secretLikeTextStored !== false
  ) {
    throw new Error(`${label} must keep all raw-storage booleans false.`);
  }
  return {
    rawGraphStateStored: false,
    rawProviderPayloadStored: false,
    outputUrlsStored: false,
    localPathsStored: false,
    secretLikeTextStored: false,
    publicPayloadSha256: sha256Value(payload.publicPayloadSha256, `${label}.publicPayloadSha256`)
  };
}

function releaseGateSummary(value: unknown, label: string): ProductionGraphResumeStateCapsule["releaseGateSummary"] {
  const payload = objectValue(value, label);
  if (payload.canClaimDistributedResume !== false || payload.canReleaseToCustomerTraffic !== false) {
    throw new Error(`${label} must keep release claim booleans false.`);
  }
  return {
    resumeStateCapsulePass: payload.resumeStateCapsulePass === true,
    canClaimDistributedResume: false,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: safeMessage(payload.releaseBlocker, `${label}.releaseBlocker`)
  };
}

function storedCapsule(capsule: ProductionGraphResumeStateCapsule): Record<string, unknown> {
  return {
    ...capsule,
    createdAt: capsule.createdAt.toISOString(),
    expiresAt: capsule.expiresAt.toISOString(),
    graphSummary: {
      ...capsule.graphSummary,
      nodes: capsule.graphSummary.nodes.map((node) => ({
        ...node,
        createdAt: node.createdAt.toISOString(),
        updatedAt: node.updatedAt.toISOString()
      })),
      edges: capsule.graphSummary.edges.map((edge) => ({
        ...edge,
        createdAt: edge.createdAt.toISOString()
      }))
    }
  };
}

function queueRecord(value: unknown, label: string): ProductionGraphResumeQueueRecord {
  const payload = objectValue(value, label);
  return {
    queueRecordId: safeId(payload.queueRecordId, `${label}.queueRecordId`),
    idempotencyKey: safeId(payload.idempotencyKey, `${label}.idempotencyKey`),
    queueNameSha256: sha256Value(payload.queueNameSha256, `${label}.queueNameSha256`),
    capsuleId: safeId(payload.capsuleId, `${label}.capsuleId`),
    capsuleSha256: sha256Value(payload.capsuleSha256, `${label}.capsuleSha256`),
    jobId: safeId(payload.jobId, `${label}.jobId`),
    ...(payload.actionId !== undefined ? { actionId: safeId(payload.actionId, `${label}.actionId`) } : {}),
    graphStateSha256: sha256Value(payload.graphStateSha256, `${label}.graphStateSha256`),
    resumeCursorSha256: sha256Value(payload.resumeCursorSha256, `${label}.resumeCursorSha256`),
    predictionIdsSha256: sha256Value(payload.predictionIdsSha256, `${label}.predictionIdsSha256`),
    predictionIdCount: integerValue(payload.predictionIdCount, `${label}.predictionIdCount`),
    activePredictionIdCount: integerValue(payload.activePredictionIdCount, `${label}.activePredictionIdCount`),
    status: queueRecordStatus(payload.status, `${label}.status`),
    enqueuedAt: dateFrom(payload.enqueuedAt, `${label}.enqueuedAt`),
    attemptCount: integerValue(payload.attemptCount, `${label}.attemptCount`),
    ...(payload.leaseId !== undefined ? { leaseId: safeId(payload.leaseId, `${label}.leaseId`) } : {}),
    ...(payload.workerIdSha256 !== undefined ? { workerIdSha256: sha256Value(payload.workerIdSha256, `${label}.workerIdSha256`) } : {}),
    ...(payload.leasedAt !== undefined ? { leasedAt: dateFrom(payload.leasedAt, `${label}.leasedAt`) } : {}),
    ...(payload.leaseExpiresAt !== undefined ? { leaseExpiresAt: dateFrom(payload.leaseExpiresAt, `${label}.leaseExpiresAt`) } : {}),
    ...(payload.acknowledgedAt !== undefined ? { acknowledgedAt: dateFrom(payload.acknowledgedAt, `${label}.acknowledgedAt`) } : {})
  };
}

function storedQueueRecord(record: ProductionGraphResumeQueueRecord): Record<string, unknown> {
  return {
    queueRecordId: record.queueRecordId,
    idempotencyKey: record.idempotencyKey,
    queueNameSha256: record.queueNameSha256,
    capsuleId: record.capsuleId,
    capsuleSha256: record.capsuleSha256,
    jobId: record.jobId,
    ...(record.actionId ? { actionId: record.actionId } : {}),
    graphStateSha256: record.graphStateSha256,
    resumeCursorSha256: record.resumeCursorSha256,
    predictionIdsSha256: record.predictionIdsSha256,
    predictionIdCount: record.predictionIdCount,
    activePredictionIdCount: record.activePredictionIdCount,
    status: record.status,
    enqueuedAt: record.enqueuedAt.toISOString(),
    attemptCount: record.attemptCount,
    ...(record.leaseId ? { leaseId: record.leaseId } : {}),
    ...(record.workerIdSha256 ? { workerIdSha256: record.workerIdSha256 } : {}),
    ...(record.leasedAt ? { leasedAt: record.leasedAt.toISOString() } : {}),
    ...(record.leaseExpiresAt ? { leaseExpiresAt: record.leaseExpiresAt.toISOString() } : {}),
    ...(record.acknowledgedAt ? { acknowledgedAt: record.acknowledgedAt.toISOString() } : {})
  };
}

function queueRecordStatus(value: unknown, label: string): ProductionGraphResumeQueueRecordStatus {
  const allowed: readonly ProductionGraphResumeQueueRecordStatus[] = ["queued", "leased", "acknowledged"];
  if (typeof value !== "string" || !allowed.includes(value as ProductionGraphResumeQueueRecordStatus)) {
    throw new Error(`${label} must be a supported resume queue record status.`);
  }
  return value as ProductionGraphResumeQueueRecordStatus;
}

function sortedSafeIds(values: readonly string[], label: string): readonly string[] {
  return [...new Set(values.map((item, index) => safeId(item, `${label}[${index}]`)))].sort();
}

function sortedSafeLabels(values: readonly string[], label: string): readonly string[] {
  return [...new Set(values.map((item, index) => safeLabel(item, `${label}[${index}]`)))].sort();
}

function digestList(values: readonly string[]): string {
  return sha256(canonicalJson([...values].sort()));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function recordOfNumbers(value: unknown, label: string): Readonly<Record<string, number>> {
  const payload = objectValue(value, label);
  return Object.fromEntries(
    Object.entries(payload).map(([key, item]) => {
      return [safeLabel(key, `${label}.key`), integerValue(item, `${label}.${key}`)];
    })
  );
}

function dateFrom(value: unknown, label: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${label} must be a valid date.`);
    }
    return value;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be an ISO date string.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }
  return parsed;
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed) || SECRET_OR_PATH_PATTERN.test(trimmed)) {
    throw new Error(`${label} is not a safe bounded identifier.`);
  }
  return trimmed;
}

function safeLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed) || SECRET_OR_PATH_PATTERN.test(trimmed)) {
    throw new Error(`${label} is not a safe bounded label.`);
  }
  return trimmed;
}

function safeMessage(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 600 || /[\u0000-\u001f\u007f]/.test(trimmed) || SECRET_OR_PATH_PATTERN.test(trimmed)) {
    throw new Error(`${label} is not a safe bounded message.`);
  }
  return trimmed;
}

function safeTtl(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < MIN_TTL_MS || value > MAX_TTL_MS) {
    throw new Error(`${label} must be an integer from ${MIN_TTL_MS} to ${MAX_TTL_MS} ms.`);
  }
  return value;
}

function sha256Value(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  }
  return value;
}
