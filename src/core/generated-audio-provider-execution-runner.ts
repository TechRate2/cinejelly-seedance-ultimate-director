/**
 * Executes verified generated-audio provider requests.
 * The runner preserves per-intent evidence and leaves output approval to the batch validator.
 */

import type { AudioProvider } from "../providers/contracts.js";
import type {
  GeneratedAudioExecutionPlan,
  GeneratedAudioExecutionReadyItem,
  GeneratedAudioExecutionRun,
  GeneratedAudioExecutionRunStatus
} from "../types/generated-audio-execution.js";
import type { AudioGenerationResult, ProviderCallStatus } from "../types/provider.js";
import { asProviderError, ProviderError, type ProviderErrorCode } from "../utils/errors.js";

export interface GeneratedAudioProviderExecutionRunnerInput {
  readonly executionPlan: GeneratedAudioExecutionPlan;
  readonly audioProvider: AudioProvider;
  readonly signal?: AbortSignal;
}

export class GeneratedAudioProviderExecutionRunner {
  public async run(input: GeneratedAudioProviderExecutionRunnerInput): Promise<GeneratedAudioExecutionRun> {
    const readyItems = input.executionPlan.items.filter(isReadyItem);
    const results: AudioGenerationResult[] = [];

    for (const item of readyItems) {
      if (input.signal?.aborted) {
        break;
      }
      results.push(await this.runItem(item, input.audioProvider, input.signal));
      if (results[results.length - 1]?.status === "canceled") {
        break;
      }
    }

    return this.report(readyItems.length, results);
  }

  private async runItem(
    item: GeneratedAudioExecutionReadyItem,
    audioProvider: AudioProvider,
    signal: AbortSignal | undefined
  ): Promise<AudioGenerationResult> {
    const startedAt = new Date();
    try {
      this.assertProviderMatchesPlan(item, audioProvider);
      return await audioProvider.generateAudio(item.request, signal);
    } catch (error) {
      const providerError = asProviderError(audioProvider.name, error);
      return this.failedResult(item, providerError, this.statusForError(providerError.code), startedAt);
    }
  }

  private assertProviderMatchesPlan(item: GeneratedAudioExecutionReadyItem, audioProvider: AudioProvider): void {
    if (item.provider === audioProvider.name && item.request.provider === audioProvider.name) {
      return;
    }
    throw new ProviderError({
      code: "UNSUPPORTED_SETTING",
      provider: audioProvider.name,
      message: `Generated-audio execution item ${item.intentId} targets provider ${item.provider}, but runner received ${audioProvider.name}.`
    });
  }

  private failedResult(
    item: GeneratedAudioExecutionReadyItem,
    error: ProviderError,
    status: ProviderCallStatus,
    startedAt: Date
  ): AudioGenerationResult {
    return {
      provider: item.provider,
      modelId: item.modelId,
      intentId: item.intentId,
      kind: item.kind,
      status,
      raw: {
        errorCode: error.code,
        retryable: error.retryable,
        message: error.message
      },
      submittedAt: startedAt,
      completedAt: new Date()
    };
  }

  private statusForError(code: ProviderErrorCode): ProviderCallStatus {
    if (code === "REQUEST_ABORTED" || code === "PREDICTION_CANCELED") {
      return "canceled";
    }
    if (code === "POLLING_TIMEOUT" || code === "REQUEST_TIMEOUT") {
      return "timeout";
    }
    return "failed";
  }

  private report(
    readyItemCount: number,
    results: readonly AudioGenerationResult[]
  ): GeneratedAudioExecutionRun {
    const succeededCount = results.filter((result) => result.status === "succeeded").length;
    const failedCount = results.filter((result) => result.status === "failed").length;
    const timeoutCount = results.filter((result) => result.status === "timeout").length;
    const canceledCount = results.filter((result) => result.status === "canceled").length;
    return {
      status: this.runStatus({
        readyItemCount,
        attemptedCount: results.length,
        succeededCount,
        failedCount,
        timeoutCount,
        canceledCount
      }),
      readyItemCount,
      attemptedCount: results.length,
      succeededCount,
      failedCount,
      timeoutCount,
      canceledCount,
      results
    };
  }

  private runStatus(input: {
    readonly readyItemCount: number;
    readonly attemptedCount: number;
    readonly succeededCount: number;
    readonly failedCount: number;
    readonly timeoutCount: number;
    readonly canceledCount: number;
  }): GeneratedAudioExecutionRunStatus {
    if (input.readyItemCount === 0 || input.attemptedCount === 0) {
      return "not_run";
    }
    if (input.succeededCount === input.readyItemCount && input.attemptedCount === input.readyItemCount) {
      return "succeeded";
    }
    if (input.succeededCount > 0) {
      return "partial";
    }
    if (input.canceledCount > 0 && input.failedCount === 0 && input.timeoutCount === 0) {
      return "canceled";
    }
    return "failed";
  }
}

function isReadyItem(item: GeneratedAudioExecutionPlan["items"][number]): item is GeneratedAudioExecutionReadyItem {
  return item.status === "ready_for_provider";
}
