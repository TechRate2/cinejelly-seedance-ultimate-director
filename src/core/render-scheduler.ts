/**
 * Render scheduler for long-form production.
 * It parallelizes only shots that do not declare endpoint, source-video, transition,
 * or continuity-sensitive dependencies.
 */

import type { ShotContract } from "../types/prompt.js";
import {
  internalSourcePatternOrigins,
  RENDER_SCHEDULER_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(RENDER_SCHEDULER_SOURCE_PATTERN_IDS);

export type RenderScheduleMode = "parallel" | "sequential";

export type RenderScheduleSequentialReason =
  | "endpoint_reference"
  | "endpoint_continuity"
  | "source_video_structure"
  | "source_video_timeline"
  | "continuity_risk"
  | "transition_risk"
  | "transition_intent"
  | "strategy_reference_lock"
  | "strategy_last_frame_chaining"
  | "strategy_source_video"
  | "strategy_sequence_bible"
  | "strategy_manual_storyboard";

export interface RenderScheduleItem<TValue> {
  readonly index: number;
  readonly shot: ShotContract;
  readonly value: TValue;
  readonly forceSequentialReasons?: readonly RenderScheduleSequentialReason[];
}

export interface RenderScheduleResult<TValue> {
  readonly index: number;
  readonly value: TValue;
}

export interface RenderSchedulePlanItem {
  readonly index: number;
  readonly shotId: string;
  readonly mode: RenderScheduleMode;
  readonly batchId: string;
  readonly sequentialReasons: readonly RenderScheduleSequentialReason[];
  readonly referenceRoles: readonly string[];
  readonly riskCodes: readonly string[];
  readonly continuityFields: readonly string[];
}

export interface RenderScheduleBatch {
  readonly batchId: string;
  readonly mode: RenderScheduleMode;
  readonly itemIndexes: readonly number[];
  readonly shotIds: readonly string[];
  readonly sequentialReasons: readonly RenderScheduleSequentialReason[];
}

export interface RenderSchedulePlan {
  readonly concurrency: number;
  readonly itemCount: number;
  readonly batchCount: number;
  readonly parallelBatchCount: number;
  readonly sequentialItemCount: number;
  readonly items: readonly RenderSchedulePlanItem[];
  readonly batches: readonly RenderScheduleBatch[];
  readonly sourcePatternOrigins: readonly string[];
}

interface InternalScheduledItem<TValue> {
  readonly item: RenderScheduleItem<TValue>;
  readonly sequentialReasons: readonly RenderScheduleSequentialReason[];
}

interface InternalScheduledBatch<TValue> {
  readonly batchId: string;
  readonly mode: RenderScheduleMode;
  readonly items: readonly InternalScheduledItem<TValue>[];
}

export class RenderScheduler {
  private readonly concurrency: number;

  public constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
      throw new Error("Render scheduler concurrency must be a positive integer.");
    }
    this.concurrency = concurrency;
  }

  public plan<TValue>(items: readonly RenderScheduleItem<TValue>[]): RenderSchedulePlan {
    const batches = this.createSchedule(items);
    const planItems = batches.flatMap((batch) =>
      batch.items.map((scheduled) => ({
        index: scheduled.item.index,
        shotId: scheduled.item.shot.shotId,
        mode: batch.mode,
        batchId: batch.batchId,
        sequentialReasons: scheduled.sequentialReasons,
        referenceRoles: this.referenceRoles(scheduled.item.shot),
        riskCodes: scheduled.item.shot.risks,
        continuityFields: this.continuityFields(scheduled.item.shot)
      }))
    );
    return {
      concurrency: this.concurrency,
      itemCount: items.length,
      batchCount: batches.length,
      parallelBatchCount: batches.filter((batch) => batch.mode === "parallel").length,
      sequentialItemCount: planItems.filter((item) => item.mode === "sequential").length,
      items: planItems.sort((left, right) => left.index - right.index),
      batches: batches.map((batch) => ({
        batchId: batch.batchId,
        mode: batch.mode,
        itemIndexes: batch.items.map((scheduled) => scheduled.item.index),
        shotIds: batch.items.map((scheduled) => scheduled.item.shot.shotId),
        sequentialReasons: this.uniqueReasons(batch.items.flatMap((scheduled) => scheduled.sequentialReasons))
      })),
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
  }

  public explainSequentialReasons(
    shot: ShotContract,
    forceSequentialReasons: readonly RenderScheduleSequentialReason[] = []
  ): readonly RenderScheduleSequentialReason[] {
    return this.sequentialReasons(shot, forceSequentialReasons);
  }

  public async run<TInput, TOutput>(
    items: readonly RenderScheduleItem<TInput>[],
    worker: (item: RenderScheduleItem<TInput>) => Promise<TOutput>
  ): Promise<readonly RenderScheduleResult<TOutput>[]> {
    const results: RenderScheduleResult<TOutput>[] = [];
    for (const batch of this.createSchedule(items)) {
      if (batch.mode === "sequential") {
        const scheduled = batch.items[0];
        if (!scheduled) {
          continue;
        }
        results.push({
          index: scheduled.item.index,
          value: await worker(scheduled.item)
        });
      } else {
        await this.flushParallelBatch(batch.items.map((scheduled) => scheduled.item), worker, results);
      }
    }
    return results.sort((left, right) => left.index - right.index);
  }

  private createSchedule<TValue>(items: readonly RenderScheduleItem<TValue>[]): readonly InternalScheduledBatch<TValue>[] {
    const batches: InternalScheduledBatch<TValue>[] = [];
    let parallelBatch: InternalScheduledItem<TValue>[] = [];
    let batchIndex = 0;

    const flushParallelBatch = (): void => {
      if (parallelBatch.length === 0) {
        return;
      }
      batches.push({
        batchId: this.batchId(batchIndex),
        mode: "parallel",
        items: parallelBatch
      });
      batchIndex += 1;
      parallelBatch = [];
    };

    for (const item of items) {
      const sequentialReasons = this.sequentialReasons(item.shot, item.forceSequentialReasons ?? []);
      const scheduled = { item, sequentialReasons };
      if (sequentialReasons.length > 0) {
        flushParallelBatch();
        batches.push({
          batchId: this.batchId(batchIndex),
          mode: "sequential",
          items: [scheduled]
        });
        batchIndex += 1;
        continue;
      }

      parallelBatch.push(scheduled);
      if (parallelBatch.length >= this.concurrency) {
        flushParallelBatch();
      }
    }

    flushParallelBatch();
    return batches;
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

  private sequentialReasons(
    shot: ShotContract,
    forceSequentialReasons: readonly RenderScheduleSequentialReason[] = []
  ): readonly RenderScheduleSequentialReason[] {
    const reasons: RenderScheduleSequentialReason[] = [];
    const roles = new Set(shot.references.map((reference) => reference.role));
    if (roles.has("first_frame") || roles.has("last_frame")) {
      reasons.push("endpoint_reference");
    }
    if (roles.has("source_video_structure")) {
      reasons.push("source_video_structure");
      if (shot.references.some((reference) =>
        reference.role === "source_video_structure" &&
        (
          reference.selection?.sourceShotId ||
          reference.selection?.sourceSceneId ||
          reference.selection?.timelineIndex !== undefined
        )
      )) {
        reasons.push("source_video_timeline");
      }
    }
    if (shot.continuity.previousShotEndState || shot.continuity.nextShotStartState) {
      reasons.push("endpoint_continuity");
    }
    if (shot.risks.some((risk) => risk !== "transition")) {
      reasons.push("continuity_risk");
    }
    if (shot.risks.includes("transition")) {
      reasons.push("transition_risk");
    }
    const transitionIntent = shot.transitionIntent?.toLowerCase() ?? "";
    if (/previous|next|anchor|continuous|match cut|bridge|seamless/.test(transitionIntent)) {
      reasons.push("transition_intent");
    }
    reasons.push(...forceSequentialReasons);
    return this.uniqueReasons(reasons);
  }

  private batchId(index: number): string {
    return `render_batch_${String(index).padStart(3, "0")}`;
  }

  private referenceRoles(shot: ShotContract): readonly string[] {
    return [...new Set(shot.references.map((reference) => reference.role))].sort();
  }

  private continuityFields(shot: ShotContract): readonly string[] {
    return Object.entries(shot.continuity)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .sort();
  }

  private uniqueReasons(reasons: readonly RenderScheduleSequentialReason[]): readonly RenderScheduleSequentialReason[] {
    return [...new Set(reasons)].sort();
  }
}
