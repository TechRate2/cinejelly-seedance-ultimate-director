/**
 * In-process render job manager for long-running CineJelly productions.
 * It lets API clients submit a render, poll status, and retrieve the final result without holding one HTTP request open.
 */

import { randomUUID } from "node:crypto";
import { createDirectorRuntime } from "../application/director-factory.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import type { CineJellyProjectRequest, DirectorRunResult } from "../types/agent.js";
import type { ProjectArtifactBundle } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import { redactUnknown } from "../utils/redaction.js";

export type RenderJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export class RenderJobCapacityError extends Error {
  public readonly statusCode = 503;

  public constructor(queueLimit: number) {
    super(
      `Render job queue is full at ${queueLimit} queued or running job(s). Retry later or increase CINEJELLY_API_JOB_QUEUE_LIMIT.`
    );
    this.name = "RenderJobCapacityError";
  }
}

export interface RenderJobSummary {
  readonly jobId: string;
  readonly requestId?: string;
  readonly status: RenderJobStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly projectId?: string;
  readonly userInputPreview: string;
  readonly requestedDurationSeconds?: number;
  readonly requestedQualityMode?: string;
  readonly requestedResolution?: string;
  readonly referenceCount: number;
  readonly artifactDirectory: string;
  readonly hasResult: boolean;
  readonly hasCostLedger: boolean;
  readonly hasArtifacts: boolean;
  readonly error?: unknown;
  readonly costLedger?: readonly CostLedgerEntry[];
  readonly artifacts?: ProjectArtifactBundle;
  readonly result?: DirectorRunResult;
}

interface RenderJobRecord extends RenderJobSummary {
  readonly request: CineJellyProjectRequest;
  readonly abortController: AbortController;
}

export class RenderJobManager {
  private readonly artifactStore: ProjectArtifactStore;
  private readonly maxConcurrentJobs: number;
  private readonly historyLimit: number;
  private readonly queueLimit: number;
  private readonly jobs = new Map<string, RenderJobRecord>();
  private readonly queue: string[] = [];
  private activeJobCount = 0;

  public constructor(input: {
    readonly artifactStore?: ProjectArtifactStore;
    readonly maxConcurrentJobs?: number;
    readonly historyLimit?: number;
    readonly queueLimit?: number;
  } = {}) {
    this.artifactStore = input.artifactStore ?? new ProjectArtifactStore();
    this.maxConcurrentJobs = Math.max(1, input.maxConcurrentJobs ?? 1);
    this.historyLimit = Math.max(10, input.historyLimit ?? 100);
    this.queueLimit = Math.max(1, input.queueLimit ?? 50);
  }

  public submit(input: {
    readonly request: CineJellyProjectRequest;
    readonly artifactDirectory: string;
  }): RenderJobSummary {
    this.assertQueueCapacity();
    const now = new Date();
    const jobId = `render_job_${randomUUID()}`;
    const record: RenderJobRecord = {
      jobId,
      ...(input.request.metadata?.requestId ? { requestId: input.request.metadata.requestId } : {}),
      status: "queued",
      createdAt: now,
      updatedAt: now,
      userInputPreview: this.preview(input.request.userInput),
      referenceCount: input.request.references?.length ?? 0,
      artifactDirectory: input.artifactDirectory,
      hasResult: false,
      hasCostLedger: false,
      hasArtifacts: false,
      request: input.request,
      abortController: new AbortController(),
      ...(input.request.settings?.durationTargetSeconds !== undefined
        ? { requestedDurationSeconds: input.request.settings.durationTargetSeconds }
        : {}),
      ...(input.request.settings?.qualityMode ? { requestedQualityMode: input.request.settings.qualityMode } : {}),
      ...(input.request.settings?.resolution ? { requestedResolution: input.request.settings.resolution } : {})
    };

    this.jobs.set(jobId, record);
    this.queue.push(jobId);
    this.pruneHistory();
    this.pumpQueue();
    return this.toSummary(record, { includeDetails: false });
  }

  public get(jobId: string): RenderJobSummary | undefined {
    const record = this.jobs.get(jobId);
    return record ? this.toSummary(record, { includeDetails: true }) : undefined;
  }

  public list(): readonly RenderJobSummary[] {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((record) => this.toSummary(record, { includeDetails: false }));
  }

  public cancel(jobId: string): RenderJobSummary | undefined {
    return this.cancelWithReason(jobId, "Render job was canceled by API request.");
  }

  public cancelAll(reason: string): readonly RenderJobSummary[] {
    const canceled: RenderJobSummary[] = [];
    for (const record of this.jobs.values()) {
      if (this.isTerminal(record.status)) {
        continue;
      }
      const summary = this.cancelWithReason(record.jobId, reason);
      if (summary) {
        canceled.push(summary);
      }
    }
    return canceled;
  }

  private cancelWithReason(jobId: string, reason: string): RenderJobSummary | undefined {
    const record = this.jobs.get(jobId);
    if (!record) {
      return undefined;
    }
    if (this.isTerminal(record.status)) {
      return this.toSummary(record, { includeDetails: true });
    }

    record.abortController.abort(new Error(reason));
    const completedAt = new Date();
    if (record.status === "queued") {
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1);
      }
      this.updateJob(jobId, {
        status: "canceled",
        updatedAt: completedAt,
        completedAt,
        error: this.errorPayload(record.abortController.signal.reason)
      });
    } else {
      this.updateJob(jobId, {
        status: "canceled",
        updatedAt: completedAt,
        error: this.errorPayload(record.abortController.signal.reason)
      });
    }

    return this.get(jobId);
  }

  private isTerminal(status: RenderJobStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "canceled";
  }

  private assertQueueCapacity(): void {
    let queuedOrRunningJobs = 0;
    for (const record of this.jobs.values()) {
      if (record.status === "queued" || record.status === "running") {
        queuedOrRunningJobs += 1;
      }
    }

    if (queuedOrRunningJobs >= this.queueLimit) {
      throw new RenderJobCapacityError(this.queueLimit);
    }
  }

  private pumpQueue(): void {
    while (this.activeJobCount < this.maxConcurrentJobs && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) {
        return;
      }
      const record = this.jobs.get(jobId);
      if (!record || record.status !== "queued" || record.abortController.signal.aborted) {
        continue;
      }
      this.activeJobCount += 1;
      void this.runJob(record).finally(() => {
        this.activeJobCount -= 1;
        this.pruneHistory();
        this.pumpQueue();
      });
    }
  }

  private async runJob(record: RenderJobRecord): Promise<void> {
    const startedAt = new Date();
    this.updateJob(record.jobId, {
      status: "running",
      startedAt,
      updatedAt: startedAt
    });

    let costLedger: readonly CostLedgerEntry[] = [];
    let runtime: ReturnType<typeof createDirectorRuntime> | undefined;
    try {
      runtime = createDirectorRuntime();
      const result = await runtime.director.run(record.request, record.abortController.signal);
      if (record.abortController.signal.aborted) {
        throw record.abortController.signal.reason;
      }
      costLedger = runtime.ledger.list();
      const artifacts = await this.artifactStore.writeRunArtifacts({
        result,
        costLedger,
        artifactDirectory: record.artifactDirectory
      });
      const completedAt = new Date();
      this.updateJob(record.jobId, {
        status: "succeeded",
        updatedAt: completedAt,
        completedAt,
        projectId: result.projectId,
        result,
        costLedger,
        artifacts
      });
    } catch (error) {
      costLedger = runtime?.ledger.list() ?? costLedger;
      const artifacts = await this.tryWriteFailureArtifacts({
        request: record.request,
        costLedger,
        artifactDirectory: record.artifactDirectory,
        error
      });
      const completedAt = new Date();
      const status: RenderJobStatus = record.abortController.signal.aborted ? "canceled" : "failed";
      this.updateJob(record.jobId, {
        status,
        updatedAt: completedAt,
        completedAt,
        error: this.errorPayload(error),
        costLedger,
        ...(artifacts ? { artifacts } : {})
      });
    }
  }

  private async tryWriteFailureArtifacts(input: {
    readonly request: CineJellyProjectRequest;
    readonly costLedger: readonly CostLedgerEntry[];
    readonly artifactDirectory: string;
    readonly error: unknown;
  }): Promise<ProjectArtifactBundle | undefined> {
    try {
      return await this.artifactStore.writeFailureArtifacts({
        request: input.request,
        costLedger: input.costLedger,
        artifactDirectory: input.artifactDirectory,
        error: input.error,
        stage: "render_job_pipeline"
      });
    } catch {
      return undefined;
    }
  }

  private updateJob(jobId: string, patch: Partial<RenderJobSummary>): void {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    this.jobs.set(jobId, {
      ...current,
      ...patch
    });
  }

  private pruneHistory(): void {
    if (this.jobs.size <= this.historyLimit) {
      return;
    }
    const removable = [...this.jobs.values()]
      .filter((record) => record.status === "succeeded" || record.status === "failed" || record.status === "canceled")
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime());

    for (const record of removable) {
      if (this.jobs.size <= this.historyLimit) {
        return;
      }
      this.jobs.delete(record.jobId);
    }
  }

  private toSummary(
    record: RenderJobRecord,
    options: { readonly includeDetails: boolean }
  ): RenderJobSummary {
    const {
      jobId,
      requestId,
      status,
      createdAt,
      updatedAt,
      startedAt,
      completedAt,
      projectId,
      userInputPreview,
      requestedDurationSeconds,
      requestedQualityMode,
      requestedResolution,
      referenceCount,
      artifactDirectory,
      error,
      costLedger,
      artifacts,
      result
    } = record;
    return {
      jobId,
      ...(requestId ? { requestId } : {}),
      status,
      createdAt,
      updatedAt,
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(projectId ? { projectId } : {}),
      userInputPreview,
      ...(requestedDurationSeconds !== undefined ? { requestedDurationSeconds } : {}),
      ...(requestedQualityMode ? { requestedQualityMode } : {}),
      ...(requestedResolution ? { requestedResolution } : {}),
      referenceCount,
      artifactDirectory,
      hasResult: Boolean(result),
      hasCostLedger: Boolean(costLedger),
      hasArtifacts: Boolean(artifacts),
      ...(error !== undefined ? { error } : {}),
      ...(options.includeDetails && costLedger ? { costLedger } : {}),
      ...(options.includeDetails && artifacts ? { artifacts } : {}),
      ...(options.includeDetails && result ? { result } : {})
    };
  }

  private errorPayload(error: unknown): unknown {
    if (error instanceof Error) {
      return redactUnknown({
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return redactUnknown({
      name: "UnknownError",
      message: String(error)
    });
  }

  private preview(value: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
  }
}
