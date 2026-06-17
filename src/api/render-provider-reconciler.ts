/**
 * Provider-state reconciliation for restored async render-job checkpoints.
 * It queries only bounded prediction IDs from compact job history and never exposes raw provider payloads.
 */

import type { VideoProvider } from "../providers/contracts.js";
import type { PredictionStatus } from "../types/provider.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import type { RenderJobProviderCheckpoint, RenderJobStatus, RenderJobSummary } from "./render-job-manager.js";

export type RenderProviderReconciliationStatus = "pass" | "warn" | "fail";
export type RenderProviderReconciliationDecision =
  | "no_checkpoint"
  | "no_active_provider_work"
  | "provider_unavailable"
  | "query_failed"
  | "still_active"
  | "terminal_succeeded"
  | "terminal_failed"
  | "terminal_canceled"
  | "terminal_timeout"
  | "mixed";

export interface RenderProviderReconciliationProvider extends Pick<VideoProvider, "name" | "getPrediction"> {}

export interface RenderProviderReconciliationInput {
  readonly jobId: string;
  readonly status: RenderJobStatus;
  readonly retentionSource?: RenderJobSummary["retentionSource"];
  readonly detailRetention?: RenderJobSummary["detailRetention"];
  readonly providerCheckpoint?: RenderJobProviderCheckpoint;
}

export interface RenderProviderPredictionReconciliation {
  readonly provider: string;
  readonly predictionId: string;
  readonly status: "pass" | "warn" | "fail";
  readonly decision: Exclude<
    RenderProviderReconciliationDecision,
    "no_checkpoint" | "no_active_provider_work" | "mixed"
  >;
  readonly checkedAt: Date;
  readonly providerStatus?: PredictionStatus;
  readonly terminal: boolean;
  readonly outputUrlCount?: number;
  readonly error?: unknown;
}

export interface RenderProviderJobReconciliation {
  readonly jobId: string;
  readonly jobStatus: RenderJobStatus;
  readonly retentionSource?: RenderJobSummary["retentionSource"];
  readonly detailRetention?: RenderJobSummary["detailRetention"];
  readonly checkpointPresent: boolean;
  readonly providerName?: string;
  readonly providerOperationCount?: number;
  readonly activePredictionIds: readonly string[];
  readonly terminalPredictionIds: readonly string[];
  readonly latestProviderStatus?: string;
  readonly decision: RenderProviderReconciliationDecision;
  readonly status: "pass" | "warn" | "fail" | "skipped";
  readonly predictions: readonly RenderProviderPredictionReconciliation[];
}

export interface RenderProviderReconciliationSummary {
  readonly checkedJobCount: number;
  readonly checkpointJobCount: number;
  readonly activePredictionIdCount: number;
  readonly queriedPredictionCount: number;
  readonly terminalPredictionCount: number;
  readonly stillActivePredictionCount: number;
  readonly providerUnavailableCount: number;
  readonly queryFailureCount: number;
  readonly skippedJobCount: number;
}

export interface RenderProviderReconciliationReport {
  readonly schemaVersion: "cinejelly.render-provider-reconciliation.v1";
  readonly generatedAt: Date;
  readonly status: RenderProviderReconciliationStatus;
  readonly summary: RenderProviderReconciliationSummary;
  readonly jobs: readonly RenderProviderJobReconciliation[];
  readonly releaseGateSummary: {
    readonly providerStateReconciliationPass: boolean;
    readonly activeProviderWorkResolved: boolean;
    readonly canClaimDistributedResume: false;
    readonly releaseBlocker: string;
  };
  readonly nextActions: readonly string[];
}

export class RenderProviderReconciler {
  private readonly providers: ReadonlyMap<string, RenderProviderReconciliationProvider>;

  public constructor(input: {
    readonly providers?: readonly RenderProviderReconciliationProvider[];
  } = {}) {
    this.providers = new Map((input.providers ?? []).map((provider) => [provider.name, provider]));
  }

  public async reconcileSummaries(
    summaries: readonly RenderProviderReconciliationInput[],
    signal?: AbortSignal
  ): Promise<RenderProviderReconciliationReport> {
    const jobs: RenderProviderJobReconciliation[] = [];
    for (const summary of summaries) {
      jobs.push(await this.reconcileSummary(summary, signal));
    }
    const reportSummary = this.reportSummary(jobs);
    const status = this.reportStatus(jobs);
    return {
      schemaVersion: "cinejelly.render-provider-reconciliation.v1",
      generatedAt: new Date(),
      status,
      summary: reportSummary,
      jobs,
      releaseGateSummary: {
        providerStateReconciliationPass: status !== "fail",
        activeProviderWorkResolved: reportSummary.stillActivePredictionCount === 0 &&
          reportSummary.queryFailureCount === 0 &&
          reportSummary.providerUnavailableCount === 0,
        canClaimDistributedResume: false,
        releaseBlocker: status === "pass"
          ? "Provider checkpoint reconciliation passed for the supplied summaries, but this is not a durable distributed queue or automatic resume engine."
          : status === "warn"
            ? "Some provider predictions are still active; operators or a future worker must continue polling before claiming work is resolved."
            : "Provider checkpoint reconciliation failed for at least one active prediction or provider lookup."
      },
      nextActions: this.nextActions(status, reportSummary)
    };
  }

  private async reconcileSummary(
    summary: RenderProviderReconciliationInput,
    signal?: AbortSignal
  ): Promise<RenderProviderJobReconciliation> {
    const checkpoint = summary.providerCheckpoint;
    if (!checkpoint) {
      return {
        jobId: summary.jobId,
        jobStatus: summary.status,
        ...(summary.retentionSource ? { retentionSource: summary.retentionSource } : {}),
        ...(summary.detailRetention ? { detailRetention: summary.detailRetention } : {}),
        checkpointPresent: false,
        activePredictionIds: [],
        terminalPredictionIds: [],
        decision: "no_checkpoint",
        status: "skipped",
        predictions: []
      };
    }

    const providerName = this.safeProviderString(checkpoint.latestProvider ?? checkpoint.providers[0] ?? "");
    const activePredictionIds = checkpoint.activePredictionIds.map((item) => this.safeProviderString(item));
    const terminalPredictionIds = checkpoint.terminalPredictionIds.map((item) => this.safeProviderString(item));
    const base = {
      jobId: summary.jobId,
      jobStatus: summary.status,
      ...(summary.retentionSource ? { retentionSource: summary.retentionSource } : {}),
      ...(summary.detailRetention ? { detailRetention: summary.detailRetention } : {}),
      checkpointPresent: true,
      ...(providerName ? { providerName } : {}),
      providerOperationCount: checkpoint.providerOperationCount,
      activePredictionIds,
      terminalPredictionIds,
      ...(checkpoint.latestProviderStatus
        ? { latestProviderStatus: this.safeProviderString(checkpoint.latestProviderStatus) }
        : {})
    };

    if (activePredictionIds.length === 0) {
      return {
        ...base,
        decision: "no_active_provider_work",
        status: "pass",
        predictions: []
      };
    }

    const provider = providerName ? this.providers.get(providerName) : undefined;
    if (!provider) {
      return {
        ...base,
        decision: "provider_unavailable",
        status: "fail",
        predictions: activePredictionIds.map((predictionId) => this.unavailablePrediction(providerName, predictionId))
      };
    }

    const predictions: RenderProviderPredictionReconciliation[] = [];
    for (const predictionId of activePredictionIds) {
      predictions.push(await this.reconcilePrediction(provider, predictionId, signal));
    }
    return {
      ...base,
      decision: this.jobDecision(predictions),
      status: this.jobStatus(predictions),
      predictions
    };
  }

  private async reconcilePrediction(
    provider: RenderProviderReconciliationProvider,
    predictionId: string,
    signal?: AbortSignal
  ): Promise<RenderProviderPredictionReconciliation> {
    const checkedAt = new Date();
    try {
      const prediction = await provider.getPrediction(predictionId, signal);
      const decision = this.predictionDecision(prediction.status);
      return {
        provider: this.safeProviderString(provider.name),
        predictionId,
        status: this.predictionCheckStatus(decision),
        decision,
        checkedAt,
        providerStatus: prediction.status,
        terminal: this.predictionStatusIsTerminal(prediction.status),
        outputUrlCount: prediction.outputUrls.length
      };
    } catch (error) {
      return {
        provider: this.safeProviderString(provider.name),
        predictionId,
        status: "fail",
        decision: "query_failed",
        checkedAt,
        terminal: false,
        error: this.errorPayload(error)
      };
    }
  }

  private unavailablePrediction(
    providerName: string | undefined,
    predictionId: string
  ): RenderProviderPredictionReconciliation {
    return {
      provider: providerName || "unknown",
      predictionId,
      status: "fail",
      decision: "provider_unavailable",
      checkedAt: new Date(),
      terminal: false,
      error: {
        name: "ProviderUnavailable",
        message: "No provider adapter was supplied for this checkpoint provider."
      }
    };
  }

  private predictionDecision(status: PredictionStatus): RenderProviderPredictionReconciliation["decision"] {
    if (status === "succeeded") {
      return "terminal_succeeded";
    }
    if (status === "failed") {
      return "terminal_failed";
    }
    if (status === "canceled") {
      return "terminal_canceled";
    }
    if (status === "timeout") {
      return "terminal_timeout";
    }
    return "still_active";
  }

  private predictionCheckStatus(decision: RenderProviderPredictionReconciliation["decision"]): "pass" | "warn" | "fail" {
    if (decision === "still_active") {
      return "warn";
    }
    if (decision === "query_failed" || decision === "provider_unavailable") {
      return "fail";
    }
    return "pass";
  }

  private predictionStatusIsTerminal(status: PredictionStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "canceled" || status === "timeout";
  }

  private jobDecision(
    predictions: readonly RenderProviderPredictionReconciliation[]
  ): RenderProviderReconciliationDecision {
    const decisions = new Set(predictions.map((item) => item.decision));
    if (decisions.has("query_failed")) {
      return "query_failed";
    }
    if (decisions.has("provider_unavailable")) {
      return "provider_unavailable";
    }
    if (decisions.size === 1) {
      return predictions[0]?.decision ?? "no_active_provider_work";
    }
    return "mixed";
  }

  private jobStatus(predictions: readonly RenderProviderPredictionReconciliation[]): "pass" | "warn" | "fail" {
    if (predictions.some((item) => item.status === "fail")) {
      return "fail";
    }
    if (predictions.some((item) => item.status === "warn")) {
      return "warn";
    }
    return "pass";
  }

  private reportSummary(jobs: readonly RenderProviderJobReconciliation[]): RenderProviderReconciliationSummary {
    const predictions = jobs.flatMap((job) => [...job.predictions]);
    return {
      checkedJobCount: jobs.length,
      checkpointJobCount: jobs.filter((job) => job.checkpointPresent).length,
      activePredictionIdCount: jobs.reduce((total, job) => total + job.activePredictionIds.length, 0),
      queriedPredictionCount: predictions.filter((item) => item.decision !== "provider_unavailable").length,
      terminalPredictionCount: predictions.filter((item) => item.terminal).length,
      stillActivePredictionCount: predictions.filter((item) => item.decision === "still_active").length,
      providerUnavailableCount: predictions.filter((item) => item.decision === "provider_unavailable").length,
      queryFailureCount: predictions.filter((item) => item.decision === "query_failed").length,
      skippedJobCount: jobs.filter((job) => job.status === "skipped").length
    };
  }

  private reportStatus(jobs: readonly RenderProviderJobReconciliation[]): RenderProviderReconciliationStatus {
    if (jobs.some((job) => job.status === "fail")) {
      return "fail";
    }
    if (jobs.some((job) => job.status === "warn")) {
      return "warn";
    }
    return "pass";
  }

  private nextActions(
    status: RenderProviderReconciliationStatus,
    summary: RenderProviderReconciliationSummary
  ): readonly string[] {
    if (status === "fail") {
      return [
        "Supply provider adapters for every checkpoint provider and rerun reconciliation before manual closeout.",
        "Investigate query failures without exposing raw provider payloads, local paths, or credentials."
      ];
    }
    if (summary.stillActivePredictionCount > 0) {
      return [
        "Continue polling still-active prediction IDs or hand them to a durable provider reconciliation worker.",
        "Do not claim distributed resume parity until active provider work can be resumed or reconciled automatically."
      ];
    }
    return [
      "Archive the reconciliation report with job-history evidence.",
      "Add an external durable lease backend plus live worker provider-state handoff before claiming distributed resume parity."
    ];
  }

  private safeProviderString(value: string): string {
    const redacted = redactApiLocalPaths(redactUnknown(value));
    return typeof redacted === "string" ? redacted : "[REDACTED]";
  }

  private errorPayload(error: unknown): unknown {
    if (error instanceof Error) {
      return redactApiLocalPaths(redactUnknown({
        name: error.name,
        message: error.message
      }));
    }
    return redactApiLocalPaths(redactUnknown({
      name: "UnknownError",
      message: String(error)
    }));
  }
}
