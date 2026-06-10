/**
 * Render scheduler for long-form production.
 * It parallelizes only shots that do not declare endpoint or transition dependencies.
 */

import type { ShotContract } from "../types/prompt.js";

export interface RenderScheduleItem<TValue> {
  readonly index: number;
  readonly shot: ShotContract;
  readonly value: TValue;
}

export interface RenderScheduleResult<TValue> {
  readonly index: number;
  readonly value: TValue;
}

export class RenderScheduler {
  private readonly concurrency: number;

  public constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
      throw new Error("Render scheduler concurrency must be a positive integer.");
    }
    this.concurrency = concurrency;
  }

  public async run<TInput, TOutput>(
    items: readonly RenderScheduleItem<TInput>[],
    worker: (item: RenderScheduleItem<TInput>) => Promise<TOutput>
  ): Promise<readonly RenderScheduleResult<TOutput>[]> {
    const results: RenderScheduleResult<TOutput>[] = [];
    let parallelBatch: RenderScheduleItem<TInput>[] = [];

    for (const item of items) {
      if (this.requiresSequentialRender(item.shot)) {
        await this.flushParallelBatch(parallelBatch, worker, results);
        parallelBatch = [];
        results.push({
          index: item.index,
          value: await worker(item)
        });
        continue;
      }

      parallelBatch.push(item);
      if (parallelBatch.length >= this.concurrency) {
        await this.flushParallelBatch(parallelBatch, worker, results);
        parallelBatch = [];
      }
    }

    await this.flushParallelBatch(parallelBatch, worker, results);
    return results.sort((left, right) => left.index - right.index);
  }

  private async flushParallelBatch<TInput, TOutput>(
    batch: readonly RenderScheduleItem<TInput>[],
    worker: (item: RenderScheduleItem<TInput>) => Promise<TOutput>,
    results: RenderScheduleResult<TOutput>[]
  ): Promise<void> {
    if (batch.length === 0) {
      return;
    }
    const batchResults = await Promise.all(
      batch.map(async (item) => ({
        index: item.index,
        value: await worker(item)
      }))
    );
    results.push(...batchResults);
  }

  private requiresSequentialRender(shot: ShotContract): boolean {
    const roles = new Set(shot.references.map((reference) => reference.role));
    if (roles.has("first_frame") || roles.has("last_frame")) {
      return true;
    }
    if (shot.continuity.previousShotEndState || shot.continuity.nextShotStartState) {
      return true;
    }
    if (shot.risks.includes("transition")) {
      return true;
    }
    const transitionIntent = shot.transitionIntent?.toLowerCase() ?? "";
    return /previous|next|anchor|continuous/.test(transitionIntent);
  }
}
