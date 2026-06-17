/**
 * Provider handoff foundation for restored async render jobs.
 * It adds bounded lease ownership around provider reconciliation without claiming distributed queue parity.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  RenderProviderReconciler,
  type RenderProviderJobReconciliation,
  type RenderProviderPredictionReconciliation,
  type RenderProviderReconciliationInput,
  type RenderProviderReconciliationProvider,
  type RenderProviderReconciliationReport
} from "./render-provider-reconciler.js";

export const RENDER_PROVIDER_HANDOFF_LEASE_SCHEMA_VERSION = "cinejelly.render-provider-handoff-leases.v1";
export const RENDER_PROVIDER_HANDOFF_REPORT_SCHEMA_VERSION = "cinejelly.render-provider-handoff.v1";

const DEFAULT_LEASE_TTL_MS = 120_000;
const DEFAULT_MAX_LEASE_RECORDS = 500;
const MIN_LEASE_TTL_MS = 1_000;
const MAX_LEASE_TTL_MS = 86_400_000;
const MAX_ID_LENGTH = 200;

export type RenderProviderLeaseAcquireStatus = "acquired" | "renewed" | "held_by_other";
export type RenderProviderLeaseHeartbeatStatus = "recorded" | "lease_not_found" | "not_owner";
export type RenderProviderHandoffAction =
  | "skip_no_checkpoint"
  | "skip_no_active_provider_work"
  | "lease_unavailable"
  | "continue_polling"
  | "close_terminal_succeeded"
  | "close_terminal_failed"
  | "close_terminal_canceled"
  | "close_terminal_timeout"
  | "close_terminal_mixed"
  | "manual_audit_required";

export interface RenderProviderHandoffLeaseRecord {
  readonly jobId: string;
  readonly leaseId: string;
  readonly ownerId: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date;
  readonly renewedAt?: Date;
  readonly releasedAt?: Date;
}

export interface RenderProviderLeaseAcquireResult {
  readonly status: RenderProviderLeaseAcquireStatus;
  readonly lease?: RenderProviderHandoffLeaseRecord;
  readonly heldBy?: {
    readonly expiresAt: Date;
  };
}

export interface RenderProviderLeaseHeartbeatResult {
  readonly status: RenderProviderLeaseHeartbeatStatus;
  readonly lease?: RenderProviderHandoffLeaseRecord;
  readonly heartbeatAt?: Date;
  readonly expiresAt?: Date;
}

export interface RenderProviderHandoffLeaseStore {
  acquireLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseAcquireResult>;
  releaseLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId?: string;
    readonly now?: Date;
  }): Promise<boolean>;
  heartbeatLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseHeartbeatResult>;
  listLeases(): Promise<readonly RenderProviderHandoffLeaseRecord[]>;
  listActiveLeases(now?: Date): Promise<readonly RenderProviderHandoffLeaseRecord[]>;
}

export interface RenderProviderHandoffJob {
  readonly jobId: string;
  readonly status: "pass" | "warn" | "fail" | "skipped";
  readonly action: RenderProviderHandoffAction;
  readonly leaseStatus?: RenderProviderLeaseAcquireStatus | "not_required";
  readonly leaseHeartbeatStatus?: RenderProviderLeaseHeartbeatStatus | "not_required";
  readonly leaseId?: string;
  readonly leaseExpiresAt?: Date;
  readonly leaseHeartbeatAt?: Date;
  readonly leaseRetained: boolean;
  readonly leaseReleased: boolean;
  readonly activePredictionIds: readonly string[];
  readonly terminalPredictionIds: readonly string[];
  readonly reconciliationDecision?: RenderProviderJobReconciliation["decision"];
  readonly predictionStatuses: readonly RenderProviderPredictionReconciliation[];
}

export interface RenderProviderHandoffReport {
  readonly schemaVersion: typeof RENDER_PROVIDER_HANDOFF_REPORT_SCHEMA_VERSION;
  readonly generatedAt: Date;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: {
    readonly checkedJobCount: number;
    readonly leasedJobCount: number;
    readonly leaseUnavailableCount: number;
    readonly retainedLeaseCount: number;
    readonly releasedLeaseCount: number;
    readonly heartbeatRecordedCount: number;
    readonly terminalCloseCount: number;
    readonly stillActiveCount: number;
    readonly manualAuditCount: number;
    readonly skippedJobCount: number;
  };
  readonly reconciliation: RenderProviderReconciliationReport;
  readonly jobs: readonly RenderProviderHandoffJob[];
  readonly releaseGateSummary: {
    readonly handoffFoundationPass: boolean;
    readonly activeProviderWorkLeased: boolean;
    readonly activeProviderWorkResolved: boolean;
    readonly canClaimDistributedResume: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}

export class FileRenderProviderHandoffLeaseStore implements RenderProviderHandoffLeaseStore {
  private readonly leasePath: string;
  private readonly maxRecords: number;

  public constructor(input: {
    readonly leasePath: string;
    readonly maxRecords?: number;
  }) {
    this.leasePath = input.leasePath;
    this.maxRecords = Math.max(10, input.maxRecords ?? DEFAULT_MAX_LEASE_RECORDS);
  }

  public async acquireLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseAcquireResult> {
    const jobId = this.safeId(input.jobId, "jobId");
    const ownerId = this.safeId(input.ownerId, "ownerId");
    const ttlMs = this.safeTtl(input.ttlMs);
    const now = input.now ?? new Date();
    const records = await this.readRecords();
    const active = this.activeLeaseFor(records, jobId, now);
    if (active && active.ownerId !== ownerId) {
      return {
        status: "held_by_other",
        heldBy: {
          expiresAt: active.expiresAt
        }
      };
    }
    if (active) {
      const renewed = {
        ...active,
        renewedAt: now,
        expiresAt: new Date(now.getTime() + ttlMs)
      };
      await this.writeRecords(records.map((item) => item.leaseId === active.leaseId ? renewed : item));
      return {
        status: "renewed",
        lease: renewed
      };
    }
    const lease: RenderProviderHandoffLeaseRecord = {
      jobId,
      leaseId: `handoff_lease_${randomUUID()}`,
      ownerId,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + ttlMs)
    };
    await this.writeRecords([...records, lease]);
    return {
      status: "acquired",
      lease
    };
  }

  public async releaseLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId?: string;
    readonly now?: Date;
  }): Promise<boolean> {
    const jobId = this.safeId(input.jobId, "jobId");
    const ownerId = this.safeId(input.ownerId, "ownerId");
    const now = input.now ?? new Date();
    const records = await this.readRecords();
    const target = records.find((item) =>
      item.jobId === jobId &&
      item.ownerId === ownerId &&
      !item.releasedAt &&
      (!input.leaseId || item.leaseId === input.leaseId)
    );
    if (!target) {
      return false;
    }
    await this.writeRecords(records.map((item) =>
      item.leaseId === target.leaseId
        ? {
            ...item,
            releasedAt: now
          }
        : item
    ));
    return true;
  }

  public async heartbeatLease(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly leaseId: string;
    readonly ttlMs: number;
    readonly now?: Date;
  }): Promise<RenderProviderLeaseHeartbeatResult> {
    const jobId = this.safeId(input.jobId, "jobId");
    const ownerId = this.safeId(input.ownerId, "ownerId");
    const leaseId = this.safeId(input.leaseId, "leaseId");
    const ttlMs = this.safeTtl(input.ttlMs);
    const now = input.now ?? new Date();
    const records = await this.readRecords();
    const active = this.activeLeaseFor(records, jobId, now);
    if (!active || active.leaseId !== leaseId) {
      return {
        status: active && active.ownerId !== ownerId ? "not_owner" : "lease_not_found",
        ...(active ? { expiresAt: active.expiresAt } : {})
      };
    }
    if (active.ownerId !== ownerId) {
      return {
        status: "not_owner",
        expiresAt: active.expiresAt
      };
    }
    const renewed = {
      ...active,
      renewedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs)
    };
    await this.writeRecords(records.map((item) => item.leaseId === active.leaseId ? renewed : item));
    return {
      status: "recorded",
      lease: renewed,
      heartbeatAt: now,
      expiresAt: renewed.expiresAt
    };
  }

  public async listLeases(): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    return this.readRecords();
  }

  public async listActiveLeases(now: Date = new Date()): Promise<readonly RenderProviderHandoffLeaseRecord[]> {
    const records = await this.readRecords();
    return records.filter((item) => !item.releasedAt && item.expiresAt.getTime() > now.getTime());
  }

  private activeLeaseFor(
    records: readonly RenderProviderHandoffLeaseRecord[],
    jobId: string,
    now: Date
  ): RenderProviderHandoffLeaseRecord | undefined {
    return [...records]
      .filter((item) => item.jobId === jobId && !item.releasedAt && item.expiresAt.getTime() > now.getTime())
      .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0];
  }

  private async readRecords(): Promise<RenderProviderHandoffLeaseRecord[]> {
    let text: string;
    try {
      text = await readFile(this.leasePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    if (!text.trim()) {
      return [];
    }
    const parsed = JSON.parse(text) as unknown;
    return this.payload(parsed).leases;
  }

  private async writeRecords(records: readonly RenderProviderHandoffLeaseRecord[]): Promise<void> {
    await mkdir(dirname(this.leasePath), { recursive: true });
    const retained = [...records].slice(-this.maxRecords);
    const payload = {
      schemaVersion: RENDER_PROVIDER_HANDOFF_LEASE_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      leases: retained.map((item) => this.storedLease(item))
    };
    const tempPath = `${this.leasePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tempPath, this.leasePath);
  }

  private payload(value: unknown): { readonly leases: RenderProviderHandoffLeaseRecord[] } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Render provider handoff lease file must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    if (payload.schemaVersion !== RENDER_PROVIDER_HANDOFF_LEASE_SCHEMA_VERSION) {
      throw new Error(`Render provider handoff lease schema must be ${RENDER_PROVIDER_HANDOFF_LEASE_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.leases)) {
      throw new Error("Render provider handoff lease file must contain a leases array.");
    }
    return {
      leases: payload.leases.map((item, index) => this.leaseRecord(item, `leases[${index}]`))
    };
  }

  private leaseRecord(value: unknown, label: string): RenderProviderHandoffLeaseRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    const payload = value as Record<string, unknown>;
    return {
      jobId: this.safeId(payload.jobId, `${label}.jobId`),
      leaseId: this.safeId(payload.leaseId, `${label}.leaseId`),
      ownerId: this.safeId(payload.ownerId, `${label}.ownerId`),
      acquiredAt: this.date(payload.acquiredAt, `${label}.acquiredAt`),
      expiresAt: this.date(payload.expiresAt, `${label}.expiresAt`),
      ...(payload.renewedAt !== undefined ? { renewedAt: this.date(payload.renewedAt, `${label}.renewedAt`) } : {}),
      ...(payload.releasedAt !== undefined ? { releasedAt: this.date(payload.releasedAt, `${label}.releasedAt`) } : {})
    };
  }

  private storedLease(lease: RenderProviderHandoffLeaseRecord): Record<string, unknown> {
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

  private safeId(value: unknown, label: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} must be a non-empty string.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error(`${label} is not a safe bounded identifier.`);
    }
    return trimmed;
  }

  private safeTtl(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_LEASE_TTL_MS || value > MAX_LEASE_TTL_MS) {
      throw new Error(`Lease TTL must be an integer from ${MIN_LEASE_TTL_MS} to ${MAX_LEASE_TTL_MS} ms.`);
    }
    return value;
  }

  private date(value: unknown, label: string): Date {
    if (typeof value !== "string") {
      throw new Error(`${label} must be an ISO date string.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${label} must be a valid ISO date string.`);
    }
    return parsed;
  }
}

export class RenderProviderHandoffCoordinator {
  private readonly leaseStore: RenderProviderHandoffLeaseStore;
  private readonly reconciler: RenderProviderReconciler;
  private readonly ownerId: string;
  private readonly leaseTtlMs: number;

  public constructor(input: {
    readonly leaseStore: RenderProviderHandoffLeaseStore;
    readonly providers?: readonly RenderProviderReconciliationProvider[];
    readonly reconciler?: RenderProviderReconciler;
    readonly ownerId?: string;
    readonly leaseTtlMs?: number;
  }) {
    this.leaseStore = input.leaseStore;
    this.reconciler = input.reconciler ?? new RenderProviderReconciler({ providers: input.providers ?? [] });
    this.ownerId = this.safeOwnerId(input.ownerId ?? `handoff_worker_${randomUUID()}`);
    this.leaseTtlMs = this.safeTtl(input.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS);
  }

  public async run(
    summaries: readonly RenderProviderReconciliationInput[],
    signal?: AbortSignal
  ): Promise<RenderProviderHandoffReport> {
    const reconciliation = await this.reconciler.reconcileSummaries(summaries, signal);
    const jobs: RenderProviderHandoffJob[] = [];
    for (const job of reconciliation.jobs) {
      jobs.push(await this.handoffJob(job));
    }
    const summary = this.summary(jobs);
    const status = this.reportStatus(jobs);
    return {
      schemaVersion: RENDER_PROVIDER_HANDOFF_REPORT_SCHEMA_VERSION,
      generatedAt: new Date(),
      status,
      summary,
      reconciliation,
      jobs,
      releaseGateSummary: {
        handoffFoundationPass: status !== "fail",
        activeProviderWorkLeased: summary.stillActiveCount === summary.retainedLeaseCount,
        activeProviderWorkResolved: summary.stillActiveCount === 0 &&
          summary.manualAuditCount === 0 &&
          summary.leaseUnavailableCount === 0,
        canClaimDistributedResume: false,
        releaseBlocker: status === "pass"
          ? "Provider handoff foundation passed for supplied summaries, but external durable queues and live worker evidence are still required for distributed resume claims."
          : status === "warn"
            ? "Provider handoff foundation retained or skipped some active work; continue polling or move the lease to a durable worker."
            : "Provider handoff foundation hit query, provider, or lease failures that require manual audit."
      },
      nextActions: this.nextActions(status, summary)
    };
  }

  private async handoffJob(job: RenderProviderJobReconciliation): Promise<RenderProviderHandoffJob> {
    if (!job.checkpointPresent) {
      return this.skippedJob(job, "skip_no_checkpoint");
    }
    if (job.activePredictionIds.length === 0) {
      return this.skippedJob(job, "skip_no_active_provider_work", "pass");
    }
    const lease = await this.leaseStore.acquireLease({
      jobId: job.jobId,
      ownerId: this.ownerId,
      ttlMs: this.leaseTtlMs
    });
    if (lease.status === "held_by_other") {
      return {
        jobId: job.jobId,
        status: "warn",
        action: "lease_unavailable",
        leaseStatus: "held_by_other",
        leaseHeartbeatStatus: "not_required",
        ...(lease.heldBy ? { leaseExpiresAt: lease.heldBy.expiresAt } : {}),
        leaseRetained: false,
        leaseReleased: false,
        activePredictionIds: job.activePredictionIds,
        terminalPredictionIds: job.terminalPredictionIds,
        reconciliationDecision: job.decision,
        predictionStatuses: job.predictions
      };
    }

    const decision = this.actionFor(job);
    const retainLease = decision === "continue_polling";
    let heartbeat: RenderProviderLeaseHeartbeatResult | undefined;
    if (retainLease && lease.lease) {
      heartbeat = await this.leaseStore.heartbeatLease({
        jobId: job.jobId,
        ownerId: this.ownerId,
        leaseId: lease.lease.leaseId,
        ttlMs: this.leaseTtlMs
      });
      if (heartbeat.status !== "recorded") {
        return {
          jobId: job.jobId,
          status: "fail",
          action: "manual_audit_required",
          leaseStatus: lease.status,
          leaseHeartbeatStatus: heartbeat.status,
          leaseId: lease.lease.leaseId,
          leaseExpiresAt: heartbeat.expiresAt ?? lease.lease.expiresAt,
          leaseRetained: false,
          leaseReleased: false,
          activePredictionIds: job.activePredictionIds,
          terminalPredictionIds: job.terminalPredictionIds,
          reconciliationDecision: job.decision,
          predictionStatuses: job.predictions
        };
      }
    }
    if (!retainLease && lease.lease) {
      const released = await this.leaseStore.releaseLease({
        jobId: job.jobId,
        ownerId: this.ownerId,
        leaseId: lease.lease.leaseId
      });
      if (!released) {
        return {
          jobId: job.jobId,
          status: "fail",
          action: "manual_audit_required",
          leaseStatus: lease.status,
          leaseHeartbeatStatus: "not_required",
          leaseId: lease.lease.leaseId,
          leaseExpiresAt: lease.lease.expiresAt,
          leaseRetained: false,
          leaseReleased: false,
          activePredictionIds: job.activePredictionIds,
          terminalPredictionIds: job.terminalPredictionIds,
          reconciliationDecision: job.decision,
          predictionStatuses: job.predictions
        };
      }
    }
    return {
      jobId: job.jobId,
      status: this.handoffStatus(job, decision),
      action: decision,
      leaseStatus: lease.status,
      leaseHeartbeatStatus: heartbeat?.status ?? "not_required",
      ...(lease.lease ? {
        leaseId: lease.lease.leaseId,
        leaseExpiresAt: heartbeat?.expiresAt ?? lease.lease.expiresAt
      } : {}),
      ...(heartbeat?.heartbeatAt ? { leaseHeartbeatAt: heartbeat.heartbeatAt } : {}),
      leaseRetained: retainLease && Boolean(lease.lease),
      leaseReleased: !retainLease && Boolean(lease.lease),
      activePredictionIds: job.activePredictionIds,
      terminalPredictionIds: job.terminalPredictionIds,
      reconciliationDecision: job.decision,
      predictionStatuses: job.predictions
    };
  }

  private skippedJob(
    job: RenderProviderJobReconciliation,
    action: Extract<RenderProviderHandoffAction, "skip_no_checkpoint" | "skip_no_active_provider_work">,
    status: "pass" | "skipped" = "skipped"
  ): RenderProviderHandoffJob {
    return {
      jobId: job.jobId,
      status,
      action,
      leaseStatus: "not_required",
      leaseHeartbeatStatus: "not_required",
      leaseRetained: false,
      leaseReleased: false,
      activePredictionIds: job.activePredictionIds,
      terminalPredictionIds: job.terminalPredictionIds,
      reconciliationDecision: job.decision,
      predictionStatuses: job.predictions
    };
  }

  private actionFor(job: RenderProviderJobReconciliation): RenderProviderHandoffAction {
    if (job.status === "fail") {
      return "manual_audit_required";
    }
    if (job.predictions.some((item) => item.decision === "still_active")) {
      return "continue_polling";
    }
    const terminalDecisions = new Set(job.predictions.map((item) => item.decision));
    if (terminalDecisions.size > 1) {
      return "close_terminal_mixed";
    }
    if (terminalDecisions.has("terminal_succeeded")) {
      return "close_terminal_succeeded";
    }
    if (terminalDecisions.has("terminal_failed")) {
      return "close_terminal_failed";
    }
    if (terminalDecisions.has("terminal_canceled")) {
      return "close_terminal_canceled";
    }
    if (terminalDecisions.has("terminal_timeout")) {
      return "close_terminal_timeout";
    }
    return "manual_audit_required";
  }

  private handoffStatus(
    job: RenderProviderJobReconciliation,
    action: RenderProviderHandoffAction
  ): "pass" | "warn" | "fail" {
    if (action === "manual_audit_required") {
      return "fail";
    }
    if (action === "continue_polling" || job.status === "warn") {
      return "warn";
    }
    return "pass";
  }

  private summary(jobs: readonly RenderProviderHandoffJob[]): RenderProviderHandoffReport["summary"] {
    return {
      checkedJobCount: jobs.length,
      leasedJobCount: jobs.filter((job) => job.leaseStatus === "acquired" || job.leaseStatus === "renewed").length,
      leaseUnavailableCount: jobs.filter((job) => job.action === "lease_unavailable").length,
      retainedLeaseCount: jobs.filter((job) => job.leaseRetained).length,
      releasedLeaseCount: jobs.filter((job) => job.leaseReleased).length,
      heartbeatRecordedCount: jobs.filter((job) => job.leaseHeartbeatStatus === "recorded").length,
      terminalCloseCount: jobs.filter((job) => job.action.startsWith("close_terminal_")).length,
      stillActiveCount: jobs.filter((job) => job.action === "continue_polling").length,
      manualAuditCount: jobs.filter((job) => job.action === "manual_audit_required").length,
      skippedJobCount: jobs.filter((job) => job.status === "skipped").length
    };
  }

  private reportStatus(jobs: readonly RenderProviderHandoffJob[]): "pass" | "warn" | "fail" {
    if (jobs.some((job) => job.status === "fail")) {
      return "fail";
    }
    if (jobs.some((job) => job.status === "warn")) {
      return "warn";
    }
    return "pass";
  }

  private nextActions(
    status: "pass" | "warn" | "fail",
    summary: RenderProviderHandoffReport["summary"]
  ): readonly string[] {
    if (status === "fail") {
      return [
        "Inspect manual-audit handoff jobs and provider query failures before marking restored work closed.",
        "Keep raw provider payloads out of reports and use the stored prediction IDs for live provider diagnostics."
      ];
    }
    if (summary.stillActiveCount > 0 || summary.leaseUnavailableCount > 0) {
      return [
        "Continue polling retained leases or wait for held leases to expire before another worker attempts handoff.",
        "Replace the local file lease foundation with an external lease backend before claiming multi-process resume parity."
      ];
    }
    return [
      "Archive the handoff report with job-history and reconciliation evidence.",
      "Add external durable queue leasing plus live Atlas handoff validation before claiming distributed resume parity."
    ];
  }

  private safeOwnerId(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error("Provider handoff ownerId must be a safe bounded string.");
    }
    return trimmed;
  }

  private safeTtl(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_LEASE_TTL_MS || value > MAX_LEASE_TTL_MS) {
      throw new Error(`Provider handoff lease TTL must be an integer from ${MIN_LEASE_TTL_MS} to ${MAX_LEASE_TTL_MS} ms.`);
    }
    return value;
  }
}
