/**
 * Idempotent action ledger for provider handoff workers.
 * It records redacted action intents derived from handoff reports so retries
 * or restored workers can replay decisions without duplicating terminal work.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RenderProviderHandoffAction, RenderProviderHandoffJob, RenderProviderHandoffReport } from "./render-provider-handoff.js";

export const RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION = "cinejelly.render-provider-handoff-actions.v1";

const DEFAULT_MAX_ACTION_RECORDS = 1_000;
const MAX_ID_LENGTH = 240;

export type RenderProviderHandoffWorkerAction =
  | "resume_polling"
  | "close_terminal_succeeded"
  | "close_terminal_failed"
  | "close_terminal_canceled"
  | "close_terminal_timeout"
  | "close_terminal_mixed"
  | "manual_audit_required";

export type RenderProviderHandoffActionDecisionStatus = "recorded" | "replayed" | "skipped";

export interface RenderProviderHandoffActionRecord {
  readonly actionId: string;
  readonly idempotencyKey: string;
  readonly jobId: string;
  readonly action: RenderProviderHandoffWorkerAction;
  readonly sourceHandoffAction: RenderProviderHandoffAction;
  readonly predictionIds: readonly string[];
  readonly recordedAt: Date;
}

export interface RenderProviderHandoffActionDecision {
  readonly jobId: string;
  readonly status: RenderProviderHandoffActionDecisionStatus;
  readonly action?: RenderProviderHandoffWorkerAction;
  readonly sourceHandoffAction: RenderProviderHandoffAction;
  readonly idempotencyKey?: string;
  readonly actionId?: string;
  readonly predictionIds: readonly string[];
  readonly message: string;
}

export interface RenderProviderHandoffActionLedgerApplyResult {
  readonly schemaVersion: typeof RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION;
  readonly generatedAt: Date;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: {
    readonly checkedJobCount: number;
    readonly executableActionCount: number;
    readonly recordedActionCount: number;
    readonly replayedActionCount: number;
    readonly skippedActionCount: number;
    readonly persistedActionCount: number;
  };
  readonly decisions: readonly RenderProviderHandoffActionDecision[];
  readonly releaseGateSummary: {
    readonly idempotentActionLedgerPass: boolean;
    readonly canClaimDistributedResume: false;
    readonly releaseBlocker: string;
  };
}

export class FileRenderProviderHandoffActionLedger {
  private readonly ledgerPath: string;
  private readonly maxRecords: number;

  public constructor(input: {
    readonly ledgerPath: string;
    readonly maxRecords?: number;
  }) {
    this.ledgerPath = input.ledgerPath;
    this.maxRecords = Math.max(10, input.maxRecords ?? DEFAULT_MAX_ACTION_RECORDS);
  }

  public async applyHandoffReport(
    report: RenderProviderHandoffReport,
    now: Date = new Date()
  ): Promise<RenderProviderHandoffActionLedgerApplyResult> {
    const records = await this.readRecords();
    const nextRecords = [...records];
    const decisions = report.jobs.map((job) => this.applyJob(job, nextRecords, now));
    if (nextRecords.length !== records.length) {
      await this.writeRecords(nextRecords);
    }
    const summary = {
      checkedJobCount: decisions.length,
      executableActionCount: decisions.filter((item) => item.status !== "skipped").length,
      recordedActionCount: decisions.filter((item) => item.status === "recorded").length,
      replayedActionCount: decisions.filter((item) => item.status === "replayed").length,
      skippedActionCount: decisions.filter((item) => item.status === "skipped").length,
      persistedActionCount: nextRecords.slice(-this.maxRecords).length
    };
    const status = report.status === "fail"
      ? "fail"
      : decisions.some((item) => item.action === "manual_audit_required")
        ? "warn"
        : "pass";
    return {
      schemaVersion: RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION,
      generatedAt: now,
      status,
      summary,
      decisions,
      releaseGateSummary: {
        idempotentActionLedgerPass: status !== "fail",
        canClaimDistributedResume: false,
        releaseBlocker: status === "pass"
          ? "Handoff action intents are idempotently recorded for this report, but live provider execution and multi-worker deployment evidence are still required."
          : status === "warn"
            ? "Manual-audit action intents are retained; an operator or live worker must resolve them before distributed resume can be claimed."
            : "The upstream handoff report failed, so worker action execution must stop for manual audit."
      }
    };
  }

  public async listRecords(): Promise<readonly RenderProviderHandoffActionRecord[]> {
    return this.readRecords();
  }

  private applyJob(
    job: RenderProviderHandoffJob,
    records: RenderProviderHandoffActionRecord[],
    now: Date
  ): RenderProviderHandoffActionDecision {
    const action = this.workerActionFor(job.action);
    const predictionIds = this.predictionIdsFor(job);
    if (!action) {
      return {
        jobId: this.safeId(job.jobId, "jobId"),
        status: "skipped",
        sourceHandoffAction: job.action,
        predictionIds,
        message: "No provider-worker action is required for this handoff decision."
      };
    }
    const idempotencyKey = this.idempotencyKey(job.jobId, action, predictionIds);
    const existing = records.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) {
      return {
        jobId: existing.jobId,
        status: "replayed",
        action,
        sourceHandoffAction: job.action,
        idempotencyKey,
        actionId: existing.actionId,
        predictionIds: existing.predictionIds,
        message: "Existing provider-worker action intent reused by idempotency key."
      };
    }
    const record: RenderProviderHandoffActionRecord = {
      actionId: `handoff_action_${randomUUID()}`,
      idempotencyKey,
      jobId: this.safeId(job.jobId, "jobId"),
      action,
      sourceHandoffAction: job.action,
      predictionIds,
      recordedAt: now
    };
    records.push(record);
    return {
      jobId: record.jobId,
      status: "recorded",
      action,
      sourceHandoffAction: job.action,
      idempotencyKey,
      actionId: record.actionId,
      predictionIds,
      message: "Provider-worker action intent recorded once for idempotent replay."
    };
  }

  private workerActionFor(action: RenderProviderHandoffAction): RenderProviderHandoffWorkerAction | undefined {
    if (action === "continue_polling") {
      return "resume_polling";
    }
    if (action.startsWith("close_terminal_")) {
      return action as RenderProviderHandoffWorkerAction;
    }
    if (action === "manual_audit_required") {
      return "manual_audit_required";
    }
    return undefined;
  }

  private predictionIdsFor(job: RenderProviderHandoffJob): readonly string[] {
    return [...new Set([...job.activePredictionIds, ...job.terminalPredictionIds])]
      .map((value) => this.safeId(value, "predictionId"))
      .sort();
  }

  private idempotencyKey(jobId: string, action: RenderProviderHandoffWorkerAction, predictionIds: readonly string[]): string {
    const digest = createHash("sha256")
      .update(JSON.stringify({
        schemaVersion: RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION,
        jobId: this.safeId(jobId, "jobId"),
        action,
        predictionIds: [...predictionIds].sort()
      }))
      .digest("hex");
    return `handoff_action_${digest.slice(0, 32)}`;
  }

  private async readRecords(): Promise<RenderProviderHandoffActionRecord[]> {
    let text: string;
    try {
      text = await readFile(this.ledgerPath, "utf8");
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
    return this.payload(parsed).actions;
  }

  private async writeRecords(records: readonly RenderProviderHandoffActionRecord[]): Promise<void> {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    const retained = [...records].slice(-this.maxRecords);
    const payload = {
      schemaVersion: RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      actions: retained.map((item) => this.storedRecord(item))
    };
    const tempPath = `${this.ledgerPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tempPath, this.ledgerPath);
  }

  private payload(value: unknown): { readonly actions: RenderProviderHandoffActionRecord[] } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Render provider handoff action ledger must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    if (payload.schemaVersion !== RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION) {
      throw new Error(`Render provider handoff action ledger schema must be ${RENDER_PROVIDER_HANDOFF_ACTION_LEDGER_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(payload.actions)) {
      throw new Error("Render provider handoff action ledger must contain an actions array.");
    }
    return {
      actions: payload.actions.map((item, index) => this.record(item, `actions[${index}]`))
    };
  }

  private record(value: unknown, label: string): RenderProviderHandoffActionRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    const payload = value as Record<string, unknown>;
    return {
      actionId: this.safeId(payload.actionId, `${label}.actionId`),
      idempotencyKey: this.safeId(payload.idempotencyKey, `${label}.idempotencyKey`),
      jobId: this.safeId(payload.jobId, `${label}.jobId`),
      action: this.action(payload.action, `${label}.action`),
      sourceHandoffAction: this.sourceAction(payload.sourceHandoffAction, `${label}.sourceHandoffAction`),
      predictionIds: this.predictionIds(payload.predictionIds, `${label}.predictionIds`),
      recordedAt: this.date(payload.recordedAt, `${label}.recordedAt`)
    };
  }

  private storedRecord(record: RenderProviderHandoffActionRecord): Record<string, unknown> {
    return {
      actionId: record.actionId,
      idempotencyKey: record.idempotencyKey,
      jobId: record.jobId,
      action: record.action,
      sourceHandoffAction: record.sourceHandoffAction,
      predictionIds: [...record.predictionIds],
      recordedAt: record.recordedAt.toISOString()
    };
  }

  private action(value: unknown, label: string): RenderProviderHandoffWorkerAction {
    const allowed: readonly RenderProviderHandoffWorkerAction[] = [
      "resume_polling",
      "close_terminal_succeeded",
      "close_terminal_failed",
      "close_terminal_canceled",
      "close_terminal_timeout",
      "close_terminal_mixed",
      "manual_audit_required"
    ];
    if (typeof value !== "string" || !allowed.includes(value as RenderProviderHandoffWorkerAction)) {
      throw new Error(`${label} must be a supported handoff worker action.`);
    }
    return value as RenderProviderHandoffWorkerAction;
  }

  private sourceAction(value: unknown, label: string): RenderProviderHandoffAction {
    const allowed: readonly RenderProviderHandoffAction[] = [
      "skip_no_checkpoint",
      "skip_no_active_provider_work",
      "lease_unavailable",
      "continue_polling",
      "close_terminal_succeeded",
      "close_terminal_failed",
      "close_terminal_canceled",
      "close_terminal_timeout",
      "close_terminal_mixed",
      "manual_audit_required"
    ];
    if (typeof value !== "string" || !allowed.includes(value as RenderProviderHandoffAction)) {
      throw new Error(`${label} must be a supported handoff source action.`);
    }
    return value as RenderProviderHandoffAction;
  }

  private predictionIds(value: unknown, label: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array.`);
    }
    return value.map((item, index) => this.safeId(item, `${label}[${index}]`));
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
