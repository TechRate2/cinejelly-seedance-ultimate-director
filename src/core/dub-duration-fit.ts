/**
 * Dubbing duration-fit planner (pure math, no I/O).
 *
 * The redub methodology (KrillinAI/VideoLingo lineage, docs/CREDITS.md) requires dubbed speech to FIT
 * its timing window — Vietnamese renderings of dense Chinese speech routinely run LONGER than the
 * source utterance, and an unfitted segment plays over the next one (the mix is time-disjoint only if
 * every segment ends before its successor starts). The prompt politely asks the LLM to keep dub text
 * short, but nothing enforced it at execution (repo-fidelity audit gap #1). This planner turns each
 * segment's MEASURED synthesized duration into an ffmpeg atempo ratio:
 *
 *   window(segment) = next segment's start − this segment's start   (last: video end − start)
 *   tempo           = measured / window, applied only above a small tolerance, capped at
 *                     MAX_NATURAL_TEMPO (beyond ~1.35 speech audibly chipmunks)
 *
 * A segment that cannot fully fit even at the cap is still sped to the cap and reported as a WARNING
 * (residual overlap in seconds) — a slightly-overlapped dub is a degraded deliverable, not a broken
 * one (the all-or-nothing rule stays reserved for silent holes).
 */

export interface DubFitSegmentInput {
  readonly intentId: string;
  /** Planned wall-clock start (seconds). Segments without a start cannot be fitted (window unknown). */
  readonly startSecond?: number;
  /** MEASURED duration of the synthesized audio file (ffprobe), seconds. */
  readonly measuredDurationSeconds: number;
}

export interface DubFitSegmentPlan {
  readonly intentId: string;
  readonly status: "fits" | "tempo_fitted" | "overflow_warning" | "unknown_window";
  /** Timing window this segment must fit inside (seconds); undefined when unknowable. */
  readonly windowSeconds?: number;
  /** atempo ratio to apply (1 = unchanged). Never above MAX_NATURAL_TEMPO. */
  readonly tempo: number;
  /** Duration after tempo is applied (seconds). */
  readonly fittedDurationSeconds: number;
  /** Seconds still spilling past the window after the cap (0 unless overflow_warning). */
  readonly residualOverflowSeconds: number;
}

export interface DubFitPlan {
  readonly segments: readonly DubFitSegmentPlan[];
  readonly fittedCount: number;
  readonly overflowWarningCount: number;
  readonly maxTempoApplied: number;
  /** Human-readable Vietnamese warnings for the deliverable summary (empty when everything fits). */
  readonly warnings: readonly string[];
}

/** Above this ratio sped-up speech stops sounding natural (KrillinAI-lineage pipelines cap similarly). */
export const MAX_NATURAL_TEMPO = 1.35;
/** Overruns below max(2% of window, 0.15s) ride natural inter-utterance gaps — no re-tempo needed. */
const WINDOW_TOLERANCE_FLOOR_SECONDS = 0.15;
const WINDOW_TOLERANCE_RATIO = 0.02;
/** Ratios this close to 1 are not worth an atempo stage. */
const MIN_ACTIONABLE_TEMPO = 1.03;

export function planDubDurationFit(input: {
  readonly segments: readonly DubFitSegmentInput[];
  /** Total source video duration (seconds); bounds the LAST segment's window when known. */
  readonly videoDurationSeconds?: number;
}): DubFitPlan {
  // Windows are defined by wall-clock ORDER, not array order.
  const ordered = input.segments
    .map((segment, index) => ({ segment, index }))
    .filter((item) => item.segment.startSecond !== undefined)
    .sort((a, b) => (a.segment.startSecond ?? 0) - (b.segment.startSecond ?? 0));
  const windowByIntentId = new Map<string, number | undefined>();
  ordered.forEach((item, position) => {
    const start = item.segment.startSecond ?? 0;
    const nextStart = ordered[position + 1]?.segment.startSecond;
    const end = nextStart ?? input.videoDurationSeconds;
    windowByIntentId.set(
      item.segment.intentId,
      end !== undefined && end > start ? end - start : undefined
    );
  });

  const segments: DubFitSegmentPlan[] = input.segments.map((segment) => {
    const measured = Math.max(0, segment.measuredDurationSeconds);
    if (segment.startSecond === undefined) {
      return {
        intentId: segment.intentId,
        status: "unknown_window",
        tempo: 1,
        fittedDurationSeconds: measured,
        residualOverflowSeconds: 0
      };
    }
    const window = windowByIntentId.get(segment.intentId);
    if (window === undefined) {
      // Last segment with unknown video duration: nothing to fit against.
      return {
        intentId: segment.intentId,
        status: "unknown_window",
        tempo: 1,
        fittedDurationSeconds: measured,
        residualOverflowSeconds: 0
      };
    }
    const tolerance = Math.max(WINDOW_TOLERANCE_FLOOR_SECONDS, window * WINDOW_TOLERANCE_RATIO);
    if (measured <= window + tolerance) {
      return {
        intentId: segment.intentId,
        status: "fits",
        windowSeconds: window,
        tempo: 1,
        fittedDurationSeconds: measured,
        residualOverflowSeconds: 0
      };
    }
    const neededTempo = measured / window;
    if (neededTempo <= MAX_NATURAL_TEMPO) {
      const tempo = Math.max(MIN_ACTIONABLE_TEMPO, Math.round(neededTempo * 1000) / 1000);
      return {
        intentId: segment.intentId,
        status: "tempo_fitted",
        windowSeconds: window,
        tempo,
        fittedDurationSeconds: measured / tempo,
        residualOverflowSeconds: 0
      };
    }
    const fitted = measured / MAX_NATURAL_TEMPO;
    return {
      intentId: segment.intentId,
      status: "overflow_warning",
      windowSeconds: window,
      tempo: MAX_NATURAL_TEMPO,
      fittedDurationSeconds: fitted,
      residualOverflowSeconds: Math.round((fitted - window) * 100) / 100
    };
  });

  const fitted = segments.filter((segment) => segment.status === "tempo_fitted");
  const overflow = segments.filter((segment) => segment.status === "overflow_warning");
  return {
    segments,
    fittedCount: fitted.length + overflow.length,
    overflowWarningCount: overflow.length,
    maxTempoApplied: segments.reduce((max, segment) => Math.max(max, segment.tempo), 1),
    warnings: overflow.map((segment) =>
      `Đoạn lồng tiếng ${segment.intentId} dài hơn khung thời gian ${segment.windowSeconds?.toFixed(1)}s ngay cả khi đã tăng tốc ${MAX_NATURAL_TEMPO}x — sẽ tràn khoảng ${segment.residualOverflowSeconds.toFixed(1)}s sang đoạn sau. Nên rút gọn lời dịch đoạn này.`
    )
  };
}
