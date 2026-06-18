import { createHash } from "node:crypto";
import type { RenderProviderHandoffActionRecord } from "./render-provider-handoff-action-ledger.js";
import type {
  ProductionGraphResumeQueueClientEnqueueResult,
  ProductionGraphResumeQueueClientRecord
} from "./production-graph-resume-queue-client.js";
import type { ProductionGraphResumeStateCapsule } from "../core/production-graph-resume-state.js";

export const RENDER_PROVIDER_GRAPH_RESUME_WORKER_SCHEMA_VERSION = "cinejelly.render-provider-graph-resume-worker.v1";

export type RenderProviderGraphResumeWorkerDecisionStatus =
  | "enqueued"
  | "replayed"
  | "skipped_not_resume_action"
  | "skipped_missing_capsule"
  | "failed";

export interface RenderProviderGraphResumeCapsuleStore {
  findByJobId(jobId: string): Promise<ProductionGraphResumeStateCapsule | undefined>;
}

export interface RenderProviderGraphResumeQueueEnqueueClient {
  enqueue(input: {
    readonly queueName: string;
    readonly capsule: ProductionGraphResumeStateCapsule;
    readonly now?: Date;
  }): Promise<ProductionGraphResumeQueueClientEnqueueResult>;
}

export interface RenderProviderGraphResumeWorkerDecision {
  readonly jobId: string;
  readonly actionId: string;
  readonly action: RenderProviderHandoffActionRecord["action"];
  readonly status: RenderProviderGraphResumeWorkerDecisionStatus;
  readonly predictionIdCount: number;
  readonly predictionIdsSha256: string;
  readonly capsuleId?: string;
  readonly capsuleSha256?: string;
  readonly queueRecord?: RenderProviderGraphResumeWorkerQueueRecordSummary;
  readonly message: string;
}

export interface RenderProviderGraphResumeWorkerQueueRecordSummary {
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
}

export interface RenderProviderGraphResumeWorkerReport {
  readonly schemaVersion: typeof RENDER_PROVIDER_GRAPH_RESUME_WORKER_SCHEMA_VERSION;
  readonly generatedAt: Date;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: {
    readonly checkedActionCount: number;
    readonly resumeActionCount: number;
    readonly enqueuedCount: number;
    readonly replayedCount: number;
    readonly skippedCount: number;
    readonly missingCapsuleCount: number;
    readonly failedCount: number;
    readonly queueRecordCount: number;
    readonly realProviderCallCount: 0;
  };
  readonly decisions: readonly RenderProviderGraphResumeWorkerDecision[];
  readonly releaseGateSummary: {
    readonly graphResumeWorkerBridgePass: boolean;
    readonly canUseAsLiveProviderActionEvidence: false;
    readonly canUseAsGraphResumePayloadEvidence: false;
    readonly canClaimDistributedResume: false;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}

export class RenderProviderGraphResumeWorker {
  private readonly queueName: string;
  private readonly capsuleStore: RenderProviderGraphResumeCapsuleStore;
  private readonly queueClient: RenderProviderGraphResumeQueueEnqueueClient;

  public constructor(input: {
    readonly queueName: string;
    readonly capsuleStore: RenderProviderGraphResumeCapsuleStore;
    readonly queueClient: RenderProviderGraphResumeQueueEnqueueClient;
  }) {
    this.queueName = this.safeLabel(input.queueName, "queueName");
    this.capsuleStore = input.capsuleStore;
    this.queueClient = input.queueClient;
  }

  public async run(
    actions: readonly RenderProviderHandoffActionRecord[],
    now: Date = new Date()
  ): Promise<RenderProviderGraphResumeWorkerReport> {
    const decisions: RenderProviderGraphResumeWorkerDecision[] = [];
    for (const action of actions) {
      decisions.push(await this.actionDecision(action, now));
    }
    const summary = {
      checkedActionCount: decisions.length,
      resumeActionCount: decisions.filter((item) => item.action === "resume_polling").length,
      enqueuedCount: decisions.filter((item) => item.status === "enqueued").length,
      replayedCount: decisions.filter((item) => item.status === "replayed").length,
      skippedCount: decisions.filter((item) => item.status.startsWith("skipped_")).length,
      missingCapsuleCount: decisions.filter((item) => item.status === "skipped_missing_capsule").length,
      failedCount: decisions.filter((item) => item.status === "failed").length,
      queueRecordCount: decisions.filter((item) => item.queueRecord).length,
      realProviderCallCount: 0 as const
    };
    const status = summary.failedCount > 0
      ? "fail"
      : summary.missingCapsuleCount > 0 || summary.enqueuedCount + summary.replayedCount < summary.resumeActionCount
        ? "warn"
        : "pass";
    return {
      schemaVersion: RENDER_PROVIDER_GRAPH_RESUME_WORKER_SCHEMA_VERSION,
      generatedAt: now,
      status,
      summary,
      decisions,
      releaseGateSummary: {
        graphResumeWorkerBridgePass: status !== "fail",
        canUseAsLiveProviderActionEvidence: false,
        canUseAsGraphResumePayloadEvidence: false,
        canClaimDistributedResume: false,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "pass"
          ? "Graph-resume worker bridge enqueued digest-only resume capsules, but live provider action evidence, graph-resume payload evidence, deployed multi-worker proof, and business-readiness gates are still required."
          : status === "warn"
            ? "Graph-resume worker bridge did not enqueue every resume action; missing capsules or skipped work must be resolved before live validation."
            : "Graph-resume worker bridge failed; stop before live provider handoff execution."
      },
      nextActions: [
        "Run this bridge inside the real deployment worker after production handoff capture passes.",
        "Archive live provider action evidence and graph-resume enqueue payload evidence separately before any distributed-resume claim."
      ]
    };
  }

  private async actionDecision(
    action: RenderProviderHandoffActionRecord,
    now: Date
  ): Promise<RenderProviderGraphResumeWorkerDecision> {
    const base = {
      jobId: this.safeId(action.jobId, "jobId"),
      actionId: this.safeId(action.actionId, "actionId"),
      action: action.action,
      predictionIdCount: action.predictionIds.length,
      predictionIdsSha256: digestList(action.predictionIds)
    };
    if (action.action !== "resume_polling") {
      return {
        ...base,
        status: "skipped_not_resume_action",
        message: "Action is not resume_polling, so graph-resume enqueue is not required."
      };
    }
    const capsule = await this.capsuleStore.findByJobId(action.jobId);
    if (!capsule || capsule.actionId !== action.actionId) {
      return {
        ...base,
        status: "skipped_missing_capsule",
        message: "No matching digest-only resume-state capsule was available for this resume action."
      };
    }
    try {
      const result = await this.queueClient.enqueue({
        queueName: this.queueName,
        capsule,
        now
      });
      return {
        ...base,
        status: result.status,
        capsuleId: capsule.capsuleId,
        capsuleSha256: capsule.capsuleSha256,
        queueRecord: this.queueRecord(result.record),
        message: result.status === "enqueued"
          ? "Resume action enqueued a digest-only graph-resume capsule."
          : "Resume action replayed an existing graph-resume queue record by idempotency key."
      };
    } catch (error) {
      return {
        ...base,
        status: "failed",
        message: this.safeErrorMessage(error)
      };
    }
  }

  private queueRecord(record: ProductionGraphResumeQueueClientRecord): RenderProviderGraphResumeWorkerQueueRecordSummary {
    return {
      queueRecordId: this.safeId(record.queueRecordId, "queueRecordId"),
      idempotencyKey: this.safeId(record.idempotencyKey, "idempotencyKey"),
      queueNameSha256: this.sha256(record.queueNameSha256, "queueNameSha256"),
      capsuleId: this.safeId(record.capsuleId, "capsuleId"),
      capsuleSha256: this.sha256(record.capsuleSha256, "capsuleSha256"),
      jobId: this.safeId(record.jobId, "jobId"),
      ...(record.actionId ? { actionId: this.safeId(record.actionId, "actionId") } : {}),
      graphStateSha256: this.sha256(record.graphStateSha256, "graphStateSha256"),
      resumeCursorSha256: this.sha256(record.resumeCursorSha256, "resumeCursorSha256"),
      predictionIdsSha256: this.sha256(record.predictionIdsSha256, "predictionIdsSha256"),
      predictionIdCount: this.nonNegativeInteger(record.predictionIdCount, "predictionIdCount"),
      activePredictionIdCount: this.nonNegativeInteger(record.activePredictionIdCount, "activePredictionIdCount"),
      status: this.safeId(record.status, "status")
    };
  }

  private safeId(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 240 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error(`${label} must be a safe bounded identifier.`);
    }
    return trimmed;
  }

  private safeLabel(value: string, label: string): string {
    const trimmed = this.safeId(value, label);
    if (/[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i.test(trimmed)) {
      throw new Error(`${label} must not include URLs, local paths, or credential-like text.`);
    }
    return trimmed;
  }

  private sha256(value: string, label: string): string {
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`${label} must be a SHA-256 digest.`);
    }
    return value;
  }

  private nonNegativeInteger(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return value;
  }

  private safeErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/[A-Za-z]:\\[^\s]+|https?:\/\/[^\s]+|bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|token\s*[:=]\s*\S+/gi, "[REDACTED]").slice(0, 500) || "Graph-resume worker bridge failed.";
  }
}

function digestList(values: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...new Set(values)].sort()))
    .digest("hex");
}
