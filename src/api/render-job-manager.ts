/**
 * In-process render job manager for long-running CineJelly productions.
 * It lets API clients submit a render, poll status, and retrieve the final result without holding one HTTP request open.
 */

import { randomUUID } from "node:crypto";
import { relative, resolve, sep } from "node:path";
import { createDirectorRuntime } from "../application/director-factory.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import { ReviewApprovalSystem } from "../core/review-approval-system.js";
import type { CineJellyProjectRequest, DirectorRunResult } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactValidationReport, ProjectArtifactValidationStatus } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type {
  ReviewApprovalCheckpointInput,
  ReviewApprovalGate,
  ReviewApprovalReport,
  ReviewApprovalStatus
} from "../types/review-approval.js";
import type { ProductionStageName, ProductionStageProgressEvent, ProductionStageStatus } from "../types/stage.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import {
  toApiProjectArtifactBundle,
  toApiProjectArtifactValidationReport,
  type ApiProjectArtifactBundle,
  type ApiProjectArtifactValidationReport
} from "./artifact-response.js";
import type { RenderJobHistoryStore, RenderJobStoredSummary } from "./render-job-history-store.js";

export type RenderJobStatus =
  | "queued"
  | "running"
  | "paused_for_review"
  | "paused_for_revision"
  // Held because of an admin-side/infrastructure problem (missing API key, provider down,
  // rate limit). Non-terminal: the customer's money stays reserved and the job auto-retries
  // once the operator fixes the configuration. From the customer's side it reads as "still
  // processing"; the real reason is shown only to the operator.
  | "paused_for_operator"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled"
  | "rejected";

/** Provider/config error codes that mean "admin-fixable or transient" -> hold, don't fail. */
const OPERATOR_HOLD_ERROR_CODES: ReadonlySet<string> = new Set([
  "AUTHENTICATION_FAILED",
  "INSUFFICIENT_CREDITS",
  "RATE_LIMITED",
  "MODEL_UNAVAILABLE",
  "POLLING_TIMEOUT",
  "REQUEST_TIMEOUT",
  "NETWORK_ERROR",
  "UNKNOWN_PROVIDER_ERROR"
]);
const MAX_STAGE_PROGRESS_EVENTS = 200;
const MAX_PROVIDER_CHECKPOINT_IDS = 50;
const EMBEDDED_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\s"',;)]*/g;
const EMBEDDED_UNC_PATH_PATTERN = /\\\\[^\s"',;)]*/g;
const EMBEDDED_POSIX_PATH_PATTERN = /(^|\s)(\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+)/g;

export interface RenderJobProviderCheckpoint {
  readonly providerOperationCount: number;
  readonly providers: readonly string[];
  readonly operations: readonly string[];
  readonly predictionIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly activePredictionIds: readonly string[];
  readonly terminalPredictionIds: readonly string[];
  readonly latestProvider?: string;
  readonly latestOperation?: string;
  readonly latestProviderStatus?: string;
  readonly latestProviderCallStatus?: string;
  readonly latestPredictionId?: string;
  readonly latestAssetId?: string;
  readonly lastRecordedAt?: Date;
  readonly hasRetryableFailure: boolean;
  readonly retryCount: number;
}

export class RenderJobCapacityError extends Error {
  public readonly statusCode = 503;
  public readonly retryAfterSeconds = 30;

  public constructor(queueLimit: number) {
    super(
      `Render job queue is full at ${queueLimit} queued or running job(s). Retry later or increase CINEJELLY_API_JOB_QUEUE_LIMIT.`
    );
    this.name = "RenderJobCapacityError";
  }
}

export class RenderJobIdempotencyConflictError extends Error {
  public readonly statusCode = 409;

  public constructor() {
    super("Idempotency-Key was already used for a different render job request.");
    this.name = "RenderJobIdempotencyConflictError";
  }
}

export class RenderJobReviewStateError extends Error {
  public readonly statusCode = 409;

  public constructor(message: string) {
    super(message);
    this.name = "RenderJobReviewStateError";
  }
}

export interface RenderJobReviewInput {
  readonly gate?: ReviewApprovalGate;
  readonly checkpoints: readonly ReviewApprovalCheckpointInput[];
}

export interface RenderJobApprovedForRenderInput {
  readonly request: CineJellyProjectRequest;
  readonly summary: RenderJobSummary;
  readonly reviewApproval: ReviewApprovalReport;
}

export interface RenderJobReviewSubmission {
  readonly summary: RenderJobSummary;
  readonly queuedForRender: boolean;
  readonly approvedForExport?: boolean;
}

export interface RenderJobSummary {
  readonly jobId: string;
  readonly clientId?: string;
  readonly requestId?: string;
  /** Deliverable path relative to the output root; survives restarts via job history. */
  readonly deliverableRelativePath?: string;
  readonly status: RenderJobStatus;
  readonly retentionSource: "memory" | "history_store";
  readonly detailRetention: "full" | "compact_restored";
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
  readonly currentStage?: ProductionStageName;
  readonly currentStageStatus?: ProductionStageStatus;
  readonly progressEventCount: number;
  readonly stageProgressEvents?: readonly ProductionStageProgressEvent[];
  readonly hasResult: boolean;
  readonly hasCostLedger: boolean;
  readonly hasProviderCheckpoint: boolean;
  readonly hasArtifacts: boolean;
  readonly hasArtifactValidation: boolean;
  readonly artifactValidationStatus?: ProjectArtifactValidationStatus;
  readonly hasReviewApproval: boolean;
  readonly reviewApprovalStatus?: ReviewApprovalStatus;
  readonly reviewApprovalLifecycleAction?: ReviewApprovalReport["lifecycle"]["action"];
  readonly hasPreRenderReviewApproval: boolean;
  readonly preRenderReviewApprovalStatus?: ReviewApprovalStatus;
  readonly preRenderReviewApprovalLifecycleAction?: ReviewApprovalReport["lifecycle"]["action"];
  readonly hasPreExportReviewApproval: boolean;
  readonly preExportReviewApprovalStatus?: ReviewApprovalStatus;
  readonly preExportReviewApprovalLifecycleAction?: ReviewApprovalReport["lifecycle"]["action"];
  readonly hasError: boolean;
  readonly error?: unknown;
  /** Operator-only: why the job is on hold (missing key, provider down…). Never shown to customers. */
  readonly operatorHoldReason?: string;
  readonly operatorHoldAttempts?: number;
  readonly firstOperatorHoldAt?: Date;
  readonly lastOperatorHoldAt?: Date;
  readonly costLedger?: readonly CostLedgerEntry[];
  readonly providerCheckpoint?: RenderJobProviderCheckpoint;
  readonly artifacts?: ApiProjectArtifactBundle;
  readonly artifactValidation?: ApiProjectArtifactValidationReport;
  readonly reviewApproval?: ReviewApprovalReport;
  readonly preRenderReviewApproval?: ReviewApprovalReport;
  readonly preExportReviewApproval?: ReviewApprovalReport;
  readonly result?: DirectorRunResult;
}

export interface RenderJobQueueStats {
  readonly retainedJobCount: number;
  readonly queuedJobCount: number;
  readonly runningJobCount: number;
  readonly pausedJobCount: number;
  readonly terminalJobCount: number;
  readonly maxConcurrentJobs: number;
  readonly queueLimit: number;
  readonly availableQueueSlots: number;
}

export interface RenderJobSubmission {
  readonly summary: RenderJobSummary;
  readonly idempotentReplay: boolean;
}

interface RenderJobRecordBase extends Omit<
  RenderJobSummary,
  "artifacts" | "hasError" | "currentStage" | "currentStageStatus" | "progressEventCount" | "stageProgressEvents"
  | "hasProviderCheckpoint" | "artifactValidation" | "hasReviewApproval" | "reviewApprovalStatus"
  | "reviewApprovalLifecycleAction" | "reviewApproval" | "hasPreRenderReviewApproval"
  | "preRenderReviewApprovalStatus" | "preRenderReviewApprovalLifecycleAction" | "preRenderReviewApproval"
  | "hasPreExportReviewApproval" | "preExportReviewApprovalStatus"
  | "preExportReviewApprovalLifecycleAction" | "preExportReviewApproval"
> {
  readonly artifacts?: ProjectArtifactBundle;
  readonly artifactValidation?: ProjectArtifactValidationReport;
  readonly reviewApproval?: ReviewApprovalReport;
  readonly preRenderReviewApproval?: ReviewApprovalReport;
  readonly preExportReviewApproval?: ReviewApprovalReport;
  readonly preExportReviewInput?: RenderJobReviewInput;
  readonly stageProgressEvents: readonly ProductionStageProgressEvent[];
}

interface ActiveRenderJobRecord extends RenderJobRecordBase {
  readonly retentionSource: "memory";
  readonly detailRetention: "full";
  readonly artifactDirectory: string;
  readonly request: CineJellyProjectRequest;
  readonly abortController: AbortController;
  /** Invoked when the job is canceled while still queued so reservations can be returned. */
  readonly onCanceledBeforeRun?: () => void;
  /** Invoked once when a run reaches a terminal status, so billing can settle or refund. */
  readonly onFinished?: (status: RenderJobStatus) => void;
}

interface RestoredRenderJobRecord extends RenderJobRecordBase {
  readonly retentionSource: "history_store";
  readonly detailRetention: "compact_restored";
  readonly status: "succeeded" | "failed" | "canceled" | "rejected";
}

type RenderJobRecord = ActiveRenderJobRecord | RestoredRenderJobRecord;

interface RenderJobIdempotencyRecord {
  readonly jobId: string;
  readonly requestFingerprint: string;
}

export interface RenderJobRuntimeFactoryInput {
  readonly stageProgressReporter?: (event: ProductionStageProgressEvent) => void;
  readonly providerLedgerReporter?: (entry: CostLedgerEntry) => void;
}

export type RenderJobRuntimeFactory = (input?: RenderJobRuntimeFactoryInput) => ReturnType<typeof createDirectorRuntime>;

export class RenderJobManager {
  private readonly artifactStore: ProjectArtifactStore;
  private readonly artifactValidator: ProjectArtifactValidator;
  private readonly reviewApprovalSystem = new ReviewApprovalSystem();
  private readonly runtimeFactory: RenderJobRuntimeFactory;
  private readonly historyStore: RenderJobHistoryStore | undefined;
  private readonly maxConcurrentJobs: number;
  private readonly historyLimit: number;
  private readonly queueLimit: number;
  private readonly jobs = new Map<string, RenderJobRecord>();
  private readonly idempotencyIndex = new Map<string, RenderJobIdempotencyRecord>();
  private readonly queue: string[] = [];
  private activeJobCount = 0;
  private readonly onJobFinalized:
    | ((event: { readonly jobId: string; readonly clientId?: string; readonly status: RenderJobStatus }) => void)
    | undefined;
  /** When true, config/transient failures HOLD the job (customer sees "processing") instead
   * of failing it; false restores the old immediate fail+refund behavior. */
  private readonly operatorHoldEnabled: boolean;
  /** Max time a job may stay on operator-hold before it is force-failed and refunded, so a
   * customer's money is never held indefinitely against a job that will never run. */
  private readonly operatorHoldMaxMs: number;
  /** How often the background sweep retries held jobs and enforces the deadline. */
  private readonly operatorHoldRetryIntervalMs: number;
  private operatorHoldTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(input: {
    readonly artifactStore?: ProjectArtifactStore;
    readonly maxConcurrentJobs?: number;
    readonly historyLimit?: number;
    readonly queueLimit?: number;
    readonly runtimeFactory?: RenderJobRuntimeFactory;
    readonly artifactValidator?: ProjectArtifactValidator;
    readonly historyStore?: RenderJobHistoryStore;
    readonly operatorHoldEnabled?: boolean;
    readonly operatorHoldMaxMs?: number;
    readonly operatorHoldRetryIntervalMs?: number;
    /** Invoked once per job at EVERY terminal transition (billing settlement seam). */
    readonly onJobFinalized?: (event: { readonly jobId: string; readonly clientId?: string; readonly status: RenderJobStatus }) => void;
  } = {}) {
    this.artifactStore = input.artifactStore ?? new ProjectArtifactStore();
    this.artifactValidator = input.artifactValidator ?? new ProjectArtifactValidator();
    this.runtimeFactory =
      input.runtimeFactory ?? ((runtimeInput) => createDirectorRuntime(process.env, runtimeInput ?? {}));
    this.historyStore = input.historyStore;
    this.onJobFinalized = input.onJobFinalized;
    this.maxConcurrentJobs = Math.max(1, input.maxConcurrentJobs ?? 1);
    this.historyLimit = Math.max(10, input.historyLimit ?? 100);
    this.queueLimit = Math.max(1, input.queueLimit ?? 50);
    this.operatorHoldEnabled = input.operatorHoldEnabled ?? true;
    this.operatorHoldMaxMs = Math.max(60_000, input.operatorHoldMaxMs ?? 24 * 60 * 60 * 1000);
    this.operatorHoldRetryIntervalMs = Math.max(15_000, input.operatorHoldRetryIntervalMs ?? 3 * 60 * 1000);
    this.restoreHistory();
  }

  public submit(input: {
    readonly request: CineJellyProjectRequest;
    readonly artifactDirectory: string;
    readonly clientId?: string;
    readonly idempotencyKeyDigest?: string;
    readonly requestFingerprint?: string;
    readonly reviewApproval?: RenderJobReviewInput;
    readonly preExportReviewApproval?: RenderJobReviewInput;
    readonly onAccepted?: (summary: RenderJobSummary) => void;
    /** Called if the job is canceled while still queued (never ran) — release quota here. */
    readonly onCanceledBeforeRun?: () => void;
    /** Called once when the run reaches a terminal status, so billing can settle or refund. */
    readonly onFinished?: (status: RenderJobStatus) => void;
  }): RenderJobSubmission {
    const replayedJob = this.findIdempotentReplay(input.idempotencyKeyDigest, input.requestFingerprint, input.clientId);
    if (replayedJob) {
      return {
        summary: replayedJob,
        idempotentReplay: true
      };
    }

    const now = new Date();
    const jobId = `render_job_${randomUUID()}`;
    const preRenderReviewInput = input.reviewApproval?.gate === "pre_export" ? undefined : input.reviewApproval;
    const preExportReviewInput = this.normalizedPreExportReviewInput(
      input.preExportReviewApproval ?? (input.reviewApproval?.gate === "pre_export" ? input.reviewApproval : undefined)
    );
    const preRenderReviewApproval = this.evaluateReviewApproval(jobId, input.request, preRenderReviewInput, now);
    const initialStatus = this.initialStatusForReviewApproval(preRenderReviewApproval);
    const recordRequest = this.requestWithPreRenderApprovalMetadata(input.request, preRenderReviewApproval);
    if (initialStatus === "queued") {
      this.assertQueueCapacity();
    } else if (this.isReviewable(initialStatus)) {
      // Paused/blocked jobs are retained, unreserved, and never pruned as terminal, so
      // without their own bound a client could grow the job map without limit.
      this.assertPausedCapacity();
    }
    const record: RenderJobRecord = {
      jobId,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(recordRequest.metadata?.requestId ? { requestId: recordRequest.metadata.requestId } : {}),
      status: initialStatus,
      retentionSource: "memory",
      detailRetention: "full",
      createdAt: now,
      updatedAt: now,
      ...(initialStatus === "rejected" ? { completedAt: now } : {}),
      ...(recordRequest.metadata?.projectId ? { projectId: recordRequest.metadata.projectId } : {}),
      userInputPreview: this.preview(recordRequest.userInput),
      referenceCount: recordRequest.references?.length ?? 0,
      artifactDirectory: input.artifactDirectory,
      stageProgressEvents: [],
      hasResult: false,
      hasCostLedger: false,
      hasArtifacts: false,
      hasArtifactValidation: false,
      ...(preRenderReviewApproval
        ? {
            reviewApproval: preRenderReviewApproval,
            preRenderReviewApproval
          }
        : {}),
      ...(preExportReviewInput ? { preExportReviewInput } : {}),
      ...(initialStatus === "rejected"
        ? { error: this.errorPayload(new Error("Render job was rejected by required review approval checkpoint.")) }
        : {}),
      request: recordRequest,
      abortController: new AbortController(),
      ...(input.onCanceledBeforeRun ? { onCanceledBeforeRun: input.onCanceledBeforeRun } : {}),
      ...(input.onFinished ? { onFinished: input.onFinished } : {}),
      ...(recordRequest.settings?.durationTargetSeconds !== undefined
        ? { requestedDurationSeconds: recordRequest.settings.durationTargetSeconds }
        : {}),
      ...(recordRequest.settings?.qualityMode ? { requestedQualityMode: recordRequest.settings.qualityMode } : {}),
      ...(recordRequest.settings?.resolution ? { requestedResolution: recordRequest.settings.resolution } : {})
    };

    if (initialStatus === "queued") {
      input.onAccepted?.(this.toSummary(record, { includeDetails: false }));
    }
    this.jobs.set(jobId, record);
    if (initialStatus === "rejected") {
      this.emitJobFinalized(record, "rejected");
    }
    if (input.idempotencyKeyDigest && input.requestFingerprint) {
      this.idempotencyIndex.set(`${input.clientId ?? ""}:${input.idempotencyKeyDigest}`, {
        jobId,
        requestFingerprint: input.requestFingerprint
      });
    }
    if (initialStatus === "queued") {
      this.queue.push(jobId);
    }
    this.persistHistory({ immediate: true });
    this.pruneHistory();
    if (initialStatus === "queued") {
      this.pumpQueue();
    }
    return {
      summary: this.toSummary(record, { includeDetails: false }),
      idempotentReplay: false
    };
  }

  public get(jobId: string, filter: { readonly clientId?: string } = {}): RenderJobSummary | undefined {
    const record = this.jobs.get(jobId);
    if (record && filter.clientId && record.clientId !== filter.clientId) {
      return undefined;
    }
    return record ? this.toSummary(record, { includeDetails: true }) : undefined;
  }

  public list(filter: { readonly clientId?: string } = {}): readonly RenderJobSummary[] {
    return [...this.jobs.values()]
      .filter((record) => !filter.clientId || record.clientId === filter.clientId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((record) => this.toSummary(record, { includeDetails: false }));
  }

  public stats(): RenderJobQueueStats {
    const counts = this.queueCounts();
    return {
      retainedJobCount: this.jobs.size,
      queuedJobCount: counts.queued,
      runningJobCount: counts.running,
      pausedJobCount: counts.paused,
      terminalJobCount: counts.terminal,
      maxConcurrentJobs: this.maxConcurrentJobs,
      queueLimit: this.queueLimit,
      availableQueueSlots: Math.max(0, this.queueLimit - counts.queued - counts.running)
    };
  }

  public review(
    jobId: string,
    input: RenderJobReviewInput,
    filter: { readonly clientId?: string } = {},
    options: {
      readonly onApprovedForRender?: (input: RenderJobApprovedForRenderInput) => void;
    } = {}
  ): RenderJobReviewSubmission | undefined {
    const record = this.jobs.get(jobId);
    if (!record) {
      return undefined;
    }
    if (filter.clientId && record.clientId !== filter.clientId) {
      return undefined;
    }
    if (record.retentionSource !== "memory") {
      throw new RenderJobReviewStateError("Restored compact render jobs cannot be resumed from review; resubmit the render request with approval evidence.");
    }
    if (!this.isReviewable(record.status)) {
      throw new RenderJobReviewStateError("Only paused or blocked render jobs can receive manual review decisions.");
    }

    const now = new Date();
    const reviewInput = this.reviewInputForRecord(record, input);
    const reviewApproval = this.evaluateReviewApproval(jobId, record.request, reviewInput, now);
    if (!reviewApproval) {
      throw new RenderJobReviewStateError("Manual review requires at least one approval checkpoint.");
    }
    if (reviewApproval.gate === "pre_export") {
      return this.applyPreExportReview(record, reviewApproval, now);
    }
    const nextStatus = this.initialStatusForReviewApproval(reviewApproval);

    if (nextStatus === "queued") {
      this.assertQueueCapacity();
      const approvedRequest = this.requestWithPreRenderApprovalMetadata(record.request, reviewApproval);
      options.onApprovedForRender?.({
        request: approvedRequest,
        summary: this.toSummary(record, { includeDetails: false }),
        reviewApproval
      });
      this.updateJob(jobId, {
        status: "queued",
        updatedAt: now,
        reviewApproval,
        preRenderReviewApproval: reviewApproval,
        request: approvedRequest,
        error: undefined
      });
      this.queue.push(jobId);
      this.pumpQueue();
      return {
        summary: this.get(jobId) ?? this.toSummary(record, { includeDetails: false }),
        queuedForRender: true
      };
    }

    this.updateJob(jobId, {
      status: nextStatus,
      updatedAt: now,
      ...(nextStatus === "rejected" ? { completedAt: now } : {}),
      reviewApproval,
      preRenderReviewApproval: reviewApproval,
      ...(nextStatus === "rejected"
        ? { error: this.errorPayload(new Error("Render job was rejected by required review approval checkpoint.")) }
        : {}),
      ...(nextStatus === "blocked"
        ? { error: this.errorPayload(new Error("Render job approval is blocked by unsafe or inconsistent review evidence.")) }
        : {}),
      ...(nextStatus === "paused_for_review" || nextStatus === "paused_for_revision" ? { error: undefined } : {})
    });
    if (nextStatus === "rejected") {
      // Pre-render rejection is terminal (the job will never run) — settle billing now.
      // "blocked" stays re-reviewable, so its charge is kept until a true terminal.
      this.emitJobFinalized(record, "rejected");
    }
    return {
      summary: this.get(jobId) ?? this.toSummary(record, { includeDetails: false }),
      queuedForRender: false
    };
  }

  public cancel(jobId: string, filter: { readonly clientId?: string } = {}): RenderJobSummary | undefined {
    return this.cancelWithReason(jobId, "Render job was canceled by API request.", filter);
  }

  /** Jobs currently held for an operator fix — the operator's attention queue. */
  public listOperatorHolds(): readonly RenderJobSummary[] {
    return [...this.jobs.values()]
      .filter((record) => record.status === "paused_for_operator")
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
      .map((record) => this.toSummary(record, { includeDetails: true }));
  }

  /** Operator "retry now": push a held job back into the queue immediately (e.g. right after
   * fixing the API key) instead of waiting for the next sweep. Returns held jobs re-queued. */
  public retryOperatorHolds(jobId?: string): number {
    let requeued = 0;
    for (const record of this.jobs.values()) {
      if (record.status !== "paused_for_operator") {
        continue;
      }
      if (jobId && record.jobId !== jobId) {
        continue;
      }
      if (this.queueCounts().queued + this.queueCounts().running >= this.queueLimit) {
        break;
      }
      this.updateJob(record.jobId, { status: "queued", updatedAt: new Date() });
      this.queue.push(record.jobId);
      requeued += 1;
    }
    if (requeued > 0) {
      this.pumpQueue();
    }
    return requeued;
  }

  /**
   * Background maintenance for operator-held jobs: force-fail (and thus refund) any job held
   * past the deadline so a customer's money is never stuck forever, then retry the rest so a
   * fixed configuration resumes on its own. Safe to call on a timer; also directly callable
   * from tests. `now` is injectable for deterministic testing.
   */
  public sweepOperatorHolds(now: Date = new Date()): void {
    const held = [...this.jobs.values()].filter((record) => record.status === "paused_for_operator");
    for (const record of held) {
      const firstHeldAt = record.firstOperatorHoldAt ?? record.updatedAt;
      if (now.getTime() - firstHeldAt.getTime() >= this.operatorHoldMaxMs) {
        // Deadline reached: settle as failed and let the billing seam apply the current refund
        // policy (auto refunds, manual queues, "off" keeps the credits). The job is never held
        // indefinitely — but whether the customer gets credits back depends on the policy.
        this.updateJob(record.jobId, {
          status: "failed",
          updatedAt: now,
          completedAt: now,
          error: this.errorPayload(
            new Error(
              `Render job held for operator ${Math.round(this.operatorHoldMaxMs / 3_600_000)}h without a fix; auto-failed (billing settles per refund policy).`
            )
          )
        });
        this.emitJobFinalized(record, this.jobs.get(record.jobId)?.status ?? "failed");
      }
    }
    // Retry the still-held jobs (a fixed API key/model makes them succeed on the next run).
    this.retryOperatorHolds();
  }

  /** Start the periodic operator-hold sweep. Unref'd so it never keeps the process alive. */
  public startOperatorHoldSweep(): void {
    if (!this.operatorHoldEnabled || this.operatorHoldTimer) {
      return;
    }
    this.operatorHoldTimer = setInterval(() => {
      try {
        this.sweepOperatorHolds();
      } catch {
        // A sweep error must never crash the server; the next tick retries.
      }
    }, this.operatorHoldRetryIntervalMs);
    this.operatorHoldTimer.unref?.();
  }

  public stopOperatorHoldSweep(): void {
    if (this.operatorHoldTimer) {
      clearInterval(this.operatorHoldTimer);
      this.operatorHoldTimer = undefined;
    }
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

  private cancelWithReason(
    jobId: string,
    reason: string,
    filter: { readonly clientId?: string } = {}
  ): RenderJobSummary | undefined {
    const record = this.jobs.get(jobId);
    if (!record) {
      return undefined;
    }
    if (filter.clientId && record.clientId !== filter.clientId) {
      return undefined;
    }
    if (this.isTerminal(record.status)) {
      return this.toSummary(record, { includeDetails: true });
    }
    if (record.retentionSource !== "memory") {
      return this.toSummary(record, { includeDetails: true });
    }

    record.abortController.abort(new Error(reason));
    const completedAt = new Date();
    if (record.status === "queued") {
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1);
      }
      // The job never ran and no provider work happened: return the commercial
      // reservation so monthly quota is not consumed by a canceled queue entry.
      if (record.onCanceledBeforeRun) {
        try {
          record.onCanceledBeforeRun();
        } catch {
          // Reservation release is best-effort; cancellation itself must not fail.
        }
      }
      this.updateJob(jobId, {
        status: "canceled",
        updatedAt: completedAt,
        completedAt,
        error: this.errorPayload(record.abortController.signal.reason)
      });
      this.emitJobFinalized(record, "canceled");
    } else {
      this.updateJob(jobId, {
        status: "canceled",
        updatedAt: completedAt,
        error: this.errorPayload(record.abortController.signal.reason)
      });
      // Running jobs reach their terminal status (and settlement) through runJob's
      // catch path once the abort lands; paused jobs never ran, so settle here.
      if (record.status !== "running") {
        this.emitJobFinalized(record, "canceled");
      }
    }

    return this.get(jobId);
  }

  /**
   * Local filesystem path of a succeeded job's final deliverable, for the guarded
   * download/stream route. Returns undefined unless the job belongs to the caller,
   * finished successfully, and still holds full in-memory detail.
   */
  public deliverablePathFor(jobId: string, filter: { readonly clientId?: string } = {}): string | undefined {
    const record = this.jobs.get(jobId);
    if (!record) {
      return undefined;
    }
    if (filter.clientId && record.clientId !== filter.clientId) {
      return undefined;
    }
    if (record.status !== "succeeded") {
      return undefined;
    }
    if (record.retentionSource === "memory") {
      return record.result?.deliverable?.outputPath ?? this.deliverableAbsolutePath(record.deliverableRelativePath);
    }
    // Restored after a restart: the customer already paid for this video; serve it from
    // the persisted relative path (the route re-validates output-root confinement).
    return this.deliverableAbsolutePath(record.deliverableRelativePath);
  }

  private deliverableAbsolutePath(relativePath: string | undefined): string | undefined {
    if (!relativePath) {
      return undefined;
    }
    const outputRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR?.trim() || "assets/output_deliverables");
    const absolute = resolve(outputRoot, relativePath);
    return absolute.startsWith(outputRoot + sep) ? absolute : undefined;
  }

  /**
   * Deliverable path relative to the output root, safe to persist in job history (leaks no
   * machine paths) and to re-serve after a restart through the confined download route.
   */
  private deliverableRelativePathFor(result: { readonly deliverable?: { readonly outputPath?: string } } | undefined): string | undefined {
    const outputPath = result?.deliverable?.outputPath;
    if (!outputPath) {
      return undefined;
    }
    const outputRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR?.trim() || "assets/output_deliverables");
    const relativePath = relative(outputRoot, resolve(outputPath));
    if (!relativePath || relativePath.startsWith("..") || relativePath.includes(":")) {
      return undefined;
    }
    return relativePath.split(sep).join("/");
  }

  private isTerminal(status: RenderJobStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "canceled" || status === "rejected";
  }

  private isReviewable(status: RenderJobStatus): boolean {
    return status === "paused_for_review" || status === "paused_for_revision" || status === "blocked";
  }

  private assertQueueCapacity(): void {
    const counts = this.queueCounts();
    if (counts.queued + counts.running >= this.queueLimit) {
      throw new RenderJobCapacityError(this.queueLimit);
    }
  }

  private assertPausedCapacity(): void {
    // Reviewable (paused/blocked) jobs wait on humans, so allow more of them than active
    // queue slots — but still bound them to keep retained state and history writes finite.
    const pausedLimit = Math.max(this.queueLimit * 4, 20);
    const counts = this.queueCounts();
    if (counts.paused >= pausedLimit) {
      throw new RenderJobCapacityError(pausedLimit);
    }
  }

  private queueCounts(): {
    readonly queued: number;
    readonly running: number;
    readonly paused: number;
    readonly terminal: number;
  } {
    let queued = 0;
    let running = 0;
    let paused = 0;
    let terminal = 0;
    for (const record of this.jobs.values()) {
      if (record.status === "queued") {
        queued += 1;
      } else if (record.status === "running") {
        running += 1;
      } else if (this.isReviewable(record.status) || record.status === "paused_for_operator") {
        // Operator-held jobs are non-terminal and wait on an admin fix, exactly like review
        // pauses — count them in the same bounded bucket so they can't grow the map forever.
        paused += 1;
      } else {
        terminal += 1;
      }
    }
    return { queued, running, paused, terminal };
  }

  private normalizedPreExportReviewInput(
    input: RenderJobReviewInput | undefined
  ): RenderJobReviewInput | undefined {
    if (!input) {
      return undefined;
    }
    if (input.gate !== undefined && input.gate !== "pre_export") {
      throw new RenderJobReviewStateError("Pre-export review input must use gate=pre_export.");
    }
    return {
      ...input,
      gate: "pre_export"
    };
  }

  private reviewInputForRecord(record: RenderJobRecord, input: RenderJobReviewInput): RenderJobReviewInput {
    const hasRenderedArtifacts = record.hasResult || record.hasArtifacts || Boolean(record.result) || Boolean(record.artifacts);
    if (hasRenderedArtifacts) {
      if (input.gate !== undefined && input.gate !== "pre_export") {
        throw new RenderJobReviewStateError("Rendered jobs can only receive gate=pre_export review decisions.");
      }
      return {
        ...input,
        gate: "pre_export"
      };
    }
    if (input.gate === "pre_export") {
      throw new RenderJobReviewStateError("Pre-export review can only be submitted after render artifacts exist.");
    }
    return input;
  }

  private applyPreExportReview(
    record: ActiveRenderJobRecord,
    reviewApproval: ReviewApprovalReport,
    reviewedAt: Date
  ): RenderJobReviewSubmission {
    if (!record.result || !record.artifacts || !record.artifactValidation) {
      throw new RenderJobReviewStateError("Pre-export review requires completed render artifacts and artifact validation.");
    }
    const nextStatus = this.statusForPreExportReviewApproval(reviewApproval);
    this.updateJob(record.jobId, {
      status: nextStatus,
      updatedAt: reviewedAt,
      ...(nextStatus === "succeeded" || nextStatus === "rejected" ? { completedAt: reviewedAt } : {}),
      reviewApproval,
      preExportReviewApproval: reviewApproval,
      ...(nextStatus === "rejected"
        ? { error: this.errorPayload(new Error("Render job export was rejected by required pre-export review checkpoint.")) }
        : {}),
      ...(nextStatus === "blocked"
        ? { error: this.errorPayload(new Error("Render job export approval is blocked by unsafe or inconsistent review evidence.")) }
        : {}),
      ...(nextStatus === "succeeded" || nextStatus === "paused_for_review" || nextStatus === "paused_for_revision"
        ? { error: undefined }
        : {})
    });
    if (nextStatus === "succeeded" || nextStatus === "rejected" || nextStatus === "blocked") {
      this.emitJobFinalized(record, nextStatus);
    }
    return {
      summary: this.get(record.jobId) ?? this.toSummary(record, { includeDetails: false }),
      queuedForRender: false,
      approvedForExport: nextStatus === "succeeded"
    };
  }

  private statusForPreExportReviewApproval(reviewApproval: ReviewApprovalReport | undefined): RenderJobStatus {
    if (!reviewApproval) {
      return "succeeded";
    }
    switch (reviewApproval.status) {
      case "approved":
        return "succeeded";
      case "approval_required":
        return "paused_for_review";
      case "changes_requested":
        return "paused_for_revision";
      case "rejected":
        return "rejected";
      case "blocked":
        return "blocked";
    }
  }

  private evaluateReviewApproval(
    jobId: string,
    request: CineJellyProjectRequest,
    reviewApproval: RenderJobReviewInput | undefined,
    generatedAt: Date
  ): ReviewApprovalReport | undefined {
    if (!reviewApproval || reviewApproval.checkpoints.length === 0) {
      return undefined;
    }
    return this.reviewApprovalSystem.evaluate({
      projectId: request.metadata?.projectId ?? jobId,
      ...(request.metadata?.requestId ? { requestId: request.metadata.requestId } : {}),
      gate: reviewApproval.gate ?? "pre_render",
      checkpoints: reviewApproval.checkpoints,
      generatedAt
    });
  }

  private initialStatusForReviewApproval(reviewApproval: ReviewApprovalReport | undefined): RenderJobStatus {
    if (!reviewApproval) {
      return "queued";
    }
    switch (reviewApproval.status) {
      case "approved":
        return "queued";
      case "approval_required":
        return "paused_for_review";
      case "changes_requested":
        return "paused_for_revision";
      case "rejected":
        return "rejected";
      case "blocked":
        return "blocked";
    }
  }

  private requestWithPreRenderApprovalMetadata(
    request: CineJellyProjectRequest,
    reviewApproval: ReviewApprovalReport | undefined
  ): CineJellyProjectRequest {
    if (!reviewApproval || reviewApproval.gate !== "pre_render" || reviewApproval.status !== "approved") {
      return request;
    }
    return {
      ...request,
      metadata: {
        ...(request.metadata ?? {}),
        storyboardApproval: "approved",
        storyboardReviewer: this.approvalReviewerSummary(reviewApproval),
        storyboardReviewedAt: this.approvalReviewedAt(reviewApproval).toISOString(),
        storyboardApprovalId: reviewApproval.approvalId,
        storyboardApprovalSource: "render_job_pre_render_review"
      }
    };
  }

  private approvalReviewerSummary(reviewApproval: ReviewApprovalReport): string {
    const reviewers = [
      ...new Set(
        reviewApproval.checkpoints
          .map((checkpoint) => checkpoint.reviewer)
          .filter((reviewer): reviewer is string => Boolean(reviewer))
      )
    ].sort((left, right) => left.localeCompare(right));
    return reviewers.slice(0, 3).join(", ") || "Commercial reviewer";
  }

  private approvalReviewedAt(reviewApproval: ReviewApprovalReport): Date {
    return reviewApproval.checkpoints.reduce((latest, checkpoint) => {
      if (!checkpoint.reviewedAt || checkpoint.reviewedAt.getTime() <= latest.getTime()) {
        return latest;
      }
      return checkpoint.reviewedAt;
    }, reviewApproval.generatedAt);
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

  private async runJob(record: ActiveRenderJobRecord): Promise<void> {
    const startedAt = new Date();
    this.updateJob(record.jobId, {
      status: "running",
      startedAt,
      updatedAt: startedAt
    });

    let costLedger: readonly CostLedgerEntry[] = [];
    let runtime: ReturnType<typeof createDirectorRuntime> | undefined;
    try {
      runtime = this.runtimeFactory({
        stageProgressReporter: (event) => this.appendStageProgressEvent(record.jobId, event),
        providerLedgerReporter: (entry) => this.appendProviderLedgerEntry(record.jobId, entry)
      });
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
      const artifactValidation = await this.validateArtifacts(artifacts);
      const providerCheckpoint = this.finalProviderCheckpoint(record.jobId, costLedger);
      const completedAt = new Date();
      const preExportReviewApproval = this.evaluateReviewApproval(
        record.jobId,
        record.request,
        record.preExportReviewInput,
        completedAt
      );
      const finalStatus = this.statusForPreExportReviewApproval(preExportReviewApproval);
      this.updateJob(record.jobId, {
        status: finalStatus,
        updatedAt: completedAt,
        ...(finalStatus === "succeeded" || finalStatus === "rejected" ? { completedAt } : {}),
        projectId: result.projectId,
        ...(() => {
          const deliverableRelativePath = this.deliverableRelativePathFor(result);
          return deliverableRelativePath ? { deliverableRelativePath } : {};
        })(),
        result,
        costLedger,
        ...(providerCheckpoint ? { providerCheckpoint } : {}),
        artifacts,
        artifactValidation,
        ...(preExportReviewApproval
          ? {
              reviewApproval: preExportReviewApproval,
              preExportReviewApproval
            }
          : {}),
        ...(finalStatus === "rejected"
          ? { error: this.errorPayload(new Error("Render job export was rejected by required pre-export review checkpoint.")) }
          : {}),
        ...(finalStatus === "blocked"
          ? { error: this.errorPayload(new Error("Render job export approval is blocked by unsafe or inconsistent review evidence.")) }
          : {})
      });
      // Settle on the status that actually STUCK, not the computed finalStatus. If a cancel
      // landed while the artifacts above were being written, updateJob kept "canceled" via
      // the terminal guard; emitting finalStatus ("succeeded") here would tell billing the
      // job succeeded and skip the refund, leaving the customer charged with no downloadable
      // video until the next restart's reconcile. Read the stored status instead.
      this.notifyFinished(record, this.jobs.get(record.jobId)?.status ?? finalStatus);
    } catch (error) {
      costLedger = runtime?.ledger.list() ?? costLedger;
      const artifacts = await this.tryWriteFailureArtifacts({
        request: record.request,
        costLedger,
        artifactDirectory: record.artifactDirectory,
        error
      });
      const artifactValidation = artifacts ? await this.validateArtifacts(artifacts) : undefined;
      const completedAt = new Date();
      const providerCheckpoint = this.finalProviderCheckpoint(record.jobId, costLedger);

      // HOLD, don't fail: an admin-side / infrastructure problem (missing API key, provider
      // down, rate limit) must NOT burn the customer's video. The job stays non-terminal —
      // money reserved, customer sees "still processing", operator sees the real reason — and
      // the background sweep retries it once the operator fixes the setup. A cancel that
      // raced this failure (signal aborted) always wins and settles; and a job that has been
      // held past the deadline falls through to a real fail+refund so money is never stuck.
      if (!record.abortController.signal.aborted && this.operatorHoldEnabled && this.isOperatorHoldError(error)) {
        const held = this.jobs.get(record.jobId);
        const firstOperatorHoldAt = held?.firstOperatorHoldAt ?? completedAt;
        const withinDeadline = completedAt.getTime() - firstOperatorHoldAt.getTime() < this.operatorHoldMaxMs;
        if (withinDeadline) {
          this.updateJob(record.jobId, {
            status: "paused_for_operator",
            updatedAt: completedAt,
            firstOperatorHoldAt,
            lastOperatorHoldAt: completedAt,
            operatorHoldAttempts: (held?.operatorHoldAttempts ?? 0) + 1,
            operatorHoldReason: this.operatorHoldReasonFor(error),
            error: this.errorPayload(error),
            costLedger,
            ...(providerCheckpoint ? { providerCheckpoint } : {}),
            ...(artifacts ? { artifacts } : {}),
            ...(artifactValidation ? { artifactValidation } : {})
          });
          // Non-terminal: do NOT notifyFinished (no settlement, money stays reserved).
          return;
        }
      }

      const status: RenderJobStatus = record.abortController.signal.aborted ? "canceled" : "failed";
      this.updateJob(record.jobId, {
        status,
        updatedAt: completedAt,
        completedAt,
        error: this.errorPayload(error),
        costLedger,
        ...(providerCheckpoint ? { providerCheckpoint } : {}),
        ...(artifacts ? { artifacts } : {}),
        ...(artifactValidation ? { artifactValidation } : {})
      });
      // Same guard as the success path: emit whatever status actually stuck (a cancel that
      // raced this failure keeps "canceled"), never a computed status the store rejected.
      this.notifyFinished(record, this.jobs.get(record.jobId)?.status ?? status);
    }
  }

  private isOperatorHoldError(error: unknown): boolean {
    if (error && typeof error === "object" && (error as { name?: string }).name === "ProviderError") {
      return OPERATOR_HOLD_ERROR_CODES.has(String((error as { code?: string }).code ?? ""));
    }
    // Plain configuration errors thrown before the provider is even reached (missing env vars,
    // unreachable host) are also admin-fixable — hold rather than burn the customer's job.
    const message = error instanceof Error ? error.message : String(error);
    return /Missing required environment variable|ATLASCLOUD_|is required|not configured|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|fetch failed/i.test(
      message
    );
  }

  private operatorHoldReasonFor(error: unknown): string {
    const code =
      error && typeof error === "object" && (error as { name?: string }).name === "ProviderError"
        ? String((error as { code?: string }).code ?? "")
        : "CONFIG_ERROR";
    const REASONS: Record<string, string> = {
      AUTHENTICATION_FAILED: "Thiếu hoặc sai API key Atlas (kiểm tra ATLASCLOUD_API_KEY).",
      INSUFFICIENT_CREDITS: "Tài khoản Atlas của bạn hết credits — nạp thêm cho nhà cung cấp.",
      RATE_LIMITED: "Nhà cung cấp đang giới hạn tần suất — hệ thống sẽ tự thử lại.",
      MODEL_UNAVAILABLE: "Model chưa cấu hình đúng (kiểm tra tên model trong catalog Atlas).",
      POLLING_TIMEOUT: "Nhà cung cấp phản hồi chậm/quá giờ — hệ thống sẽ tự thử lại.",
      REQUEST_TIMEOUT: "Kết nối tới nhà cung cấp quá giờ — hệ thống sẽ tự thử lại.",
      NETWORK_ERROR: "Lỗi mạng/nhà cung cấp tạm thời — hệ thống sẽ tự thử lại.",
      UNKNOWN_PROVIDER_ERROR: "Nhà cung cấp báo lỗi chưa rõ — hãy kiểm tra cấu hình."
    };
    return REASONS[code] ?? "Cấu hình hệ thống chưa đủ (kiểm tra .env / Trung tâm quản trị).";
  }

  private notifyFinished(record: ActiveRenderJobRecord, status: RenderJobStatus): void {
    this.emitJobFinalized(record, status);
    if (!record.onFinished) {
      return;
    }
    try {
      record.onFinished(status);
    } catch {
      // Billing settlement callbacks must never take down the job pipeline.
    }
  }

  private emitJobFinalized(record: { readonly jobId: string; readonly clientId?: string }, status: RenderJobStatus): void {
    if (!this.onJobFinalized) {
      return;
    }
    try {
      this.onJobFinalized({ jobId: record.jobId, ...(record.clientId ? { clientId: record.clientId } : {}), status });
    } catch {
      // Billing settlement callbacks must never take down the job pipeline.
    }
  }

  /** Unscoped status lookup for boot-time billing reconciliation only. */
  public statusOfAny(jobId: string): RenderJobStatus | undefined {
    return this.jobs.get(jobId)?.status;
  }

  /** Cheap health signal for the no-auth /health endpoint: failed jobs updated since `sinceMs`. */
  public countFailedSince(sinceMs: number): number {
    let count = 0;
    for (const record of this.jobs.values()) {
      if (record.status === "failed" && record.updatedAt.getTime() >= sinceMs) {
        count += 1;
      }
    }
    return count;
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

  private async validateArtifacts(artifacts: ProjectArtifactBundle): Promise<ProjectArtifactValidationReport> {
    try {
      return await this.artifactValidator.validate(artifacts.artifactDirectory);
    } catch (error) {
      return {
        status: "fail",
        checkedAt: new Date(),
        artifactDirectory: artifacts.artifactDirectory,
        manifestPath: artifacts.manifestPath,
        projectId: artifacts.projectId,
        checks: [
          {
            name: "artifact_validation_runtime",
            status: "fail",
            message: error instanceof Error ? error.message : "Artifact validation failed."
          }
        ]
      };
    }
  }

  private appendStageProgressEvent(jobId: string, event: ProductionStageProgressEvent): void {
    const current = this.jobs.get(jobId);
    if (!current || this.isTerminal(current.status)) {
      return;
    }
    const retainedEvents = [...current.stageProgressEvents, this.redactedStageProgressEvent(event)].slice(
      -MAX_STAGE_PROGRESS_EVENTS
    );
    this.jobs.set(jobId, {
      ...current,
      updatedAt: new Date(),
      stageProgressEvents: retainedEvents
    });
    this.persistHistory();
  }

  private appendProviderLedgerEntry(jobId: string, entry: CostLedgerEntry): void {
    const current = this.jobs.get(jobId);
    if (!current || this.isTerminal(current.status)) {
      return;
    }
    const providerCheckpoint = this.providerCheckpointWithEntry(current.providerCheckpoint, entry);
    this.jobs.set(jobId, {
      ...current,
      updatedAt: new Date(),
      providerCheckpoint
    });
    this.persistHistory();
  }

  private finalProviderCheckpoint(
    jobId: string,
    costLedger: readonly CostLedgerEntry[]
  ): RenderJobProviderCheckpoint | undefined {
    return this.providerCheckpointFromLedger(costLedger) ?? this.jobs.get(jobId)?.providerCheckpoint;
  }

  private providerCheckpointFromLedger(
    costLedger: readonly CostLedgerEntry[]
  ): RenderJobProviderCheckpoint | undefined {
    let checkpoint: RenderJobProviderCheckpoint | undefined;
    for (const entry of costLedger) {
      checkpoint = this.providerCheckpointWithEntry(checkpoint, entry);
    }
    return checkpoint;
  }

  private providerCheckpointWithEntry(
    current: RenderJobProviderCheckpoint | undefined,
    entry: CostLedgerEntry
  ): RenderJobProviderCheckpoint {
    const provider = this.safeProviderCheckpointString(entry.provider);
    const operation = this.safeProviderCheckpointString(entry.operation);
    const predictionId = this.safeOptionalProviderCheckpointString(entry.predictionId);
    const assetId = this.safeOptionalProviderCheckpointString(entry.assetId);
    const providerStatus = this.safeOptionalProviderCheckpointString(entry.providerStatus);
    const providerCallStatus = this.safeProviderCheckpointString(entry.status);
    const recordedAt = entry.completedAt ?? entry.requestedAt;
    const activeProviderState = this.providerStatusIsActive(entry.providerStatus);
    const terminalProviderState = this.providerStatusIsTerminal(entry.providerStatus);
    const activePredictionIds = predictionId
      ? activeProviderState
        ? this.appendBoundedUnique(this.removeValue(current?.activePredictionIds ?? [], predictionId), predictionId)
        : terminalProviderState
          ? this.removeValue(current?.activePredictionIds ?? [], predictionId)
          : current?.activePredictionIds ?? []
      : current?.activePredictionIds ?? [];
    const terminalPredictionIds = predictionId
      ? terminalProviderState
        ? this.appendBoundedUnique(this.removeValue(current?.terminalPredictionIds ?? [], predictionId), predictionId)
        : activeProviderState
          ? this.removeValue(current?.terminalPredictionIds ?? [], predictionId)
          : current?.terminalPredictionIds ?? []
      : current?.terminalPredictionIds ?? [];

    return {
      providerOperationCount: (current?.providerOperationCount ?? 0) + 1,
      providers: this.appendBoundedUnique(current?.providers ?? [], provider),
      operations: this.appendBoundedUnique(current?.operations ?? [], operation),
      predictionIds: predictionId
        ? this.appendBoundedUnique(current?.predictionIds ?? [], predictionId)
        : current?.predictionIds ?? [],
      assetIds: assetId ? this.appendBoundedUnique(current?.assetIds ?? [], assetId) : current?.assetIds ?? [],
      activePredictionIds,
      terminalPredictionIds,
      latestProvider: provider,
      latestOperation: operation,
      ...(providerStatus ? { latestProviderStatus: providerStatus } : {}),
      latestProviderCallStatus: providerCallStatus,
      ...(predictionId ? { latestPredictionId: predictionId } : {}),
      ...(assetId ? { latestAssetId: assetId } : {}),
      ...(recordedAt ? { lastRecordedAt: recordedAt } : {}),
      hasRetryableFailure: Boolean(
        current?.hasRetryableFailure ||
        ((entry.status === "failed" || entry.status === "timeout" || entry.status === "canceled") && entry.retryable)
      ),
      retryCount: (current?.retryCount ?? 0) + Math.max(0, entry.retryCount)
    };
  }

  private providerStatusIsActive(status: CostLedgerEntry["providerStatus"]): boolean {
    return status === "queued" || status === "running" || status === "pending" || status === "processing";
  }

  private providerStatusIsTerminal(status: CostLedgerEntry["providerStatus"]): boolean {
    return (
      status === "succeeded" ||
      status === "failed" ||
      status === "canceled" ||
      status === "timeout" ||
      status === "active" ||
      status === "deleted"
    );
  }

  private appendBoundedUnique(values: readonly string[], value: string): readonly string[] {
    const unique = [...values.filter((item) => item !== value), value];
    return unique.slice(-MAX_PROVIDER_CHECKPOINT_IDS);
  }

  private removeValue(values: readonly string[], value: string): readonly string[] {
    return values.filter((item) => item !== value);
  }

  private safeOptionalProviderCheckpointString(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return this.safeProviderCheckpointString(value);
  }

  private safeProviderCheckpointString(value: string): string {
    const redacted = this.redactStageProgressLocalPathText(
      redactApiLocalPaths(redactUnknown(value))
    );
    return typeof redacted === "string" ? redacted : "[REDACTED]";
  }

  private redactedStageProgressEvent(event: ProductionStageProgressEvent): ProductionStageProgressEvent {
    const redacted = this.redactStageProgressLocalPathText(
      redactApiLocalPaths(redactUnknown(event))
    ) as Omit<ProductionStageProgressEvent, "recordedAt"> & {
      readonly recordedAt: string | Date;
    };
    return {
      ...redacted,
      recordedAt: redacted.recordedAt instanceof Date ? redacted.recordedAt : new Date(redacted.recordedAt)
    };
  }

  private redactStageProgressLocalPathText(value: unknown): unknown {
    if (typeof value === "string") {
      return this.redactEmbeddedLocalPathText(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactStageProgressLocalPathText(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.redactStageProgressLocalPathText(item)
        ])
      );
    }
    return value;
  }

  private redactEmbeddedLocalPathText(value: string): string {
    return value
      .replace(EMBEDDED_WINDOWS_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
      .replace(EMBEDDED_UNC_PATH_PATTERN, "[REDACTED_LOCAL_PATH]")
      .replace(EMBEDDED_POSIX_PATH_PATTERN, "$1[REDACTED_LOCAL_PATH]");
  }

  private updateJob(jobId: string, patch: Partial<RenderJobRecord>): void {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    // Terminal states are final: a cancel that lands while the run loop is writing
    // artifacts must not be overwritten to succeeded/failed afterwards. Non-status
    // fields (artifacts, ledger) may still attach for audit.
    let effectivePatch = patch;
    if (
      this.isTerminal(current.status) &&
      patch.status !== undefined &&
      patch.status !== current.status
    ) {
      const { status: _ignoredStatus, completedAt: _ignoredCompletedAt, ...rest } = patch;
      effectivePatch = rest;
    }
    this.jobs.set(jobId, {
      ...current,
      ...effectivePatch
    } as RenderJobRecord);
    // Status changes (especially INTO a terminal state) must hit disk immediately — boot reconcile
    // reads this file to decide refunds. Detail-only patches (artifacts, ledger) may coalesce.
    const statusChanged = effectivePatch.status !== undefined && effectivePatch.status !== current.status;
    this.persistHistory(statusChanged ? { immediate: true } : undefined);
  }

  private pruneHistory(): void {
    if (this.jobs.size <= this.historyLimit) {
      return;
    }
    const removable = [...this.jobs.values()]
      .filter((record) => this.isTerminal(record.status))
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime());

    for (const record of removable) {
      if (this.jobs.size <= this.historyLimit) {
        return;
      }
      this.jobs.delete(record.jobId);
      this.deleteIdempotencyForJob(record.jobId);
    }
    this.persistHistory({ immediate: true });
  }

  private restoreHistory(): void {
    if (!this.historyStore) {
      return;
    }
    // Never let one corrupt/drifted history record throw out of the manager CONSTRUCTOR and break
    // boot (deep-audit MEDIUM): degrade to an empty history if the whole file is unreadable, and
    // skip individual records that fail to reconstruct rather than losing the entire job list.
    let restored: ReturnType<NonNullable<typeof this.historyStore>["load"]>;
    try {
      restored = this.historyStore.load();
    } catch {
      return;
    }
    let restoredCount = 0;
    for (const summary of restored) {
      try {
        this.jobs.set(summary.jobId, this.fromStoredSummary(summary));
        restoredCount += 1;
      } catch {
        // Skip a single malformed record; keep the rest of the customer's job history usable.
      }
    }
    if (restoredCount > 0) {
      this.persistHistory({ immediate: true });
    }
  }

  // Debounced history persistence (durability-audit F4): stage-progress events and provider-ledger
  // entries fired a FULL history rebuild+write per event — write amplification that stalls the event
  // loop as retained jobs accumulate. Money-relevant writes (terminal status transitions, prune,
  // restore) stay IMMEDIATE so boot reconcile never sees a stale terminal state; telemetry churn
  // coalesces into one write per 500ms window. The timer is unref'd (never keeps the process alive)
  // and a pending flush is folded into any immediate write.
  private historyPersistTimer: NodeJS.Timeout | undefined;

  private persistHistory(options?: { readonly immediate?: boolean }): void {
    if (!this.historyStore) {
      return;
    }
    if (options?.immediate) {
      if (this.historyPersistTimer) {
        clearTimeout(this.historyPersistTimer);
        this.historyPersistTimer = undefined;
      }
      this.flushHistoryNow();
      return;
    }
    if (this.historyPersistTimer) {
      return;
    }
    this.historyPersistTimer = setTimeout(() => {
      this.historyPersistTimer = undefined;
      this.flushHistoryNow();
    }, 500);
    this.historyPersistTimer.unref?.();
  }

  private flushHistoryNow(): void {
    if (!this.historyStore) {
      return;
    }
    this.historyStore.save([...this.jobs.values()].map((record) => this.toSummary(record, { includeDetails: true })));
  }

  private fromStoredSummary(summary: RenderJobStoredSummary): RestoredRenderJobRecord {
    const staleActive =
      summary.status === "queued" ||
      summary.status === "running" ||
      summary.status === "paused_for_review" ||
      summary.status === "paused_for_revision" ||
      summary.status === "paused_for_operator" ||
      summary.status === "blocked";
    const restoredAt = new Date();
    const restoredStatus = staleActive ? "canceled" : this.restorableTerminalStatus(summary.status);
    return {
      jobId: summary.jobId,
      ...(summary.clientId ? { clientId: summary.clientId } : {}),
      ...(summary.deliverableRelativePath ? { deliverableRelativePath: summary.deliverableRelativePath } : {}),
      ...(summary.requestId ? { requestId: summary.requestId } : {}),
      status: restoredStatus,
      retentionSource: "history_store",
      detailRetention: "compact_restored",
      createdAt: summary.createdAt,
      updatedAt: staleActive ? restoredAt : summary.updatedAt,
      ...(summary.startedAt ? { startedAt: summary.startedAt } : {}),
      ...(staleActive ? { completedAt: restoredAt } : summary.completedAt ? { completedAt: summary.completedAt } : {}),
      ...(summary.projectId ? { projectId: summary.projectId } : {}),
      userInputPreview: summary.userInputPreview,
      ...(summary.requestedDurationSeconds !== undefined
        ? { requestedDurationSeconds: summary.requestedDurationSeconds }
        : {}),
      ...(summary.requestedQualityMode ? { requestedQualityMode: summary.requestedQualityMode } : {}),
      ...(summary.requestedResolution ? { requestedResolution: summary.requestedResolution } : {}),
      referenceCount: summary.referenceCount,
      stageProgressEvents: summary.stageProgressEvents.map((event) => ({
        ...event,
        stage: event.stage as ProductionStageName,
        status: event.status as ProductionStageStatus
      })),
      hasResult: summary.hasResult,
      hasCostLedger: summary.hasCostLedger,
      ...(summary.providerCheckpoint ? { providerCheckpoint: summary.providerCheckpoint } : {}),
      hasArtifacts: summary.hasArtifacts,
      hasArtifactValidation: summary.hasArtifactValidation,
      ...(summary.artifactValidationStatus ? { artifactValidationStatus: summary.artifactValidationStatus } : {}),
      ...(summary.reviewApproval
        ? {
            reviewApproval: summary.reviewApproval,
            ...(summary.reviewApproval.gate === "pre_render"
              ? { preRenderReviewApproval: summary.reviewApproval }
              : { preExportReviewApproval: summary.reviewApproval })
          }
        : {}),
      ...(staleActive
        ? {
            error: this.errorPayload(
              new Error(
                `Render job was ${summary.status} when the API process stopped; active provider work is not resumed automatically and must be audited manually.`
              )
            )
          }
        : summary.error !== undefined ? { error: summary.error } : {})
    };
  }

  private restorableTerminalStatus(status: RenderJobStatus): RestoredRenderJobRecord["status"] {
    if (status === "succeeded" || status === "failed" || status === "canceled" || status === "rejected") {
      return status;
    }
    return "canceled";
  }

  private findIdempotentReplay(
    idempotencyKeyDigest: string | undefined,
    requestFingerprint: string | undefined,
    clientId: string | undefined
  ): RenderJobSummary | undefined {
    if (!idempotencyKeyDigest || !requestFingerprint) {
      return undefined;
    }
    // Tenant-scoped: the same idempotency key from a different client must never replay
    // (and leak) another tenant's job summary.
    const indexed = this.idempotencyIndex.get(`${clientId ?? ""}:${idempotencyKeyDigest}`);
    if (!indexed) {
      return undefined;
    }
    const record = this.jobs.get(indexed.jobId);
    if (!record) {
      this.idempotencyIndex.delete(`${clientId ?? ""}:${idempotencyKeyDigest}`);
      return undefined;
    }
    if (indexed.requestFingerprint !== requestFingerprint) {
      throw new RenderJobIdempotencyConflictError();
    }
    return this.toSummary(record, { includeDetails: false });
  }

  private deleteIdempotencyForJob(jobId: string): void {
    for (const [key, value] of this.idempotencyIndex.entries()) {
      if (value.jobId === jobId) {
        this.idempotencyIndex.delete(key);
      }
    }
  }

  private toSummary(
    record: RenderJobRecord,
    options: { readonly includeDetails: boolean }
  ): RenderJobSummary {
    const {
      jobId,
      clientId,
      requestId,
      status,
      retentionSource,
      detailRetention,
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
      stageProgressEvents,
      error,
      operatorHoldReason,
      operatorHoldAttempts,
      firstOperatorHoldAt,
      lastOperatorHoldAt,
      costLedger,
      providerCheckpoint,
      artifacts,
      artifactValidation,
      reviewApproval,
      preRenderReviewApproval,
      preExportReviewApproval,
      result
    } = record;
    const currentStageProgress = stageProgressEvents[stageProgressEvents.length - 1];
    const effectivePreRenderReviewApproval =
      preRenderReviewApproval ?? (reviewApproval?.gate === "pre_render" ? reviewApproval : undefined);
    const effectivePreExportReviewApproval =
      preExportReviewApproval ?? (reviewApproval?.gate === "pre_export" ? reviewApproval : undefined);
    const effectiveReviewApproval =
      effectivePreExportReviewApproval ?? effectivePreRenderReviewApproval ?? reviewApproval;
    return {
      jobId,
      ...(clientId ? { clientId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(record.deliverableRelativePath ? { deliverableRelativePath: record.deliverableRelativePath } : {}),
      status,
      retentionSource,
      detailRetention,
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
      ...(currentStageProgress ? { currentStage: currentStageProgress.stage } : {}),
      ...(currentStageProgress ? { currentStageStatus: currentStageProgress.status } : {}),
      progressEventCount: stageProgressEvents.length,
      ...(options.includeDetails ? { stageProgressEvents } : {}),
      hasResult: Boolean(result),
      hasCostLedger: Boolean(costLedger),
      hasProviderCheckpoint: Boolean(providerCheckpoint),
      hasArtifacts: Boolean(artifacts),
      hasArtifactValidation: Boolean(artifactValidation),
      ...(artifactValidation ? { artifactValidationStatus: artifactValidation.status } : {}),
      hasReviewApproval: Boolean(effectiveReviewApproval),
      ...(effectiveReviewApproval ? { reviewApprovalStatus: effectiveReviewApproval.status } : {}),
      ...(effectiveReviewApproval ? { reviewApprovalLifecycleAction: effectiveReviewApproval.lifecycle.action } : {}),
      hasPreRenderReviewApproval: Boolean(effectivePreRenderReviewApproval),
      ...(effectivePreRenderReviewApproval
        ? { preRenderReviewApprovalStatus: effectivePreRenderReviewApproval.status }
        : {}),
      ...(effectivePreRenderReviewApproval
        ? { preRenderReviewApprovalLifecycleAction: effectivePreRenderReviewApproval.lifecycle.action }
        : {}),
      hasPreExportReviewApproval: Boolean(effectivePreExportReviewApproval),
      ...(effectivePreExportReviewApproval
        ? { preExportReviewApprovalStatus: effectivePreExportReviewApproval.status }
        : {}),
      ...(effectivePreExportReviewApproval
        ? { preExportReviewApprovalLifecycleAction: effectivePreExportReviewApproval.lifecycle.action }
        : {}),
      hasError: error !== undefined,
      ...(options.includeDetails && error !== undefined ? { error } : {}),
      ...(operatorHoldReason ? { operatorHoldReason } : {}),
      ...(operatorHoldAttempts !== undefined ? { operatorHoldAttempts } : {}),
      ...(firstOperatorHoldAt ? { firstOperatorHoldAt } : {}),
      ...(lastOperatorHoldAt ? { lastOperatorHoldAt } : {}),
      ...(options.includeDetails && costLedger ? { costLedger } : {}),
      ...(options.includeDetails && providerCheckpoint ? { providerCheckpoint } : {}),
      ...(options.includeDetails && artifacts ? { artifacts: toApiProjectArtifactBundle(artifacts) } : {}),
      ...(options.includeDetails && artifactValidation
        ? { artifactValidation: toApiProjectArtifactValidationReport(artifactValidation) }
        : {}),
      ...(options.includeDetails && effectiveReviewApproval ? { reviewApproval: effectiveReviewApproval } : {}),
      ...(options.includeDetails && effectivePreRenderReviewApproval
        ? { preRenderReviewApproval: effectivePreRenderReviewApproval }
        : {}),
      ...(options.includeDetails && effectivePreExportReviewApproval
        ? { preExportReviewApproval: effectivePreExportReviewApproval }
        : {}),
      ...(options.includeDetails && result ? { result } : {})
    };
  }

  private errorPayload(error: unknown): unknown {
    if (error instanceof Error) {
      return this.redactStageProgressLocalPathText(
        redactApiLocalPaths(redactUnknown({
          name: error.name,
          message: error.message
        }))
      );
    }
    return this.redactStageProgressLocalPathText(
      redactApiLocalPaths(redactUnknown({
        name: "UnknownError",
        message: String(error)
      }))
    );
  }

  private preview(value: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
  }
}
