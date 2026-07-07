/**
 * Beat-grid planner — musical-time cutting.
 *
 * Short-form video reads as "designed" when hard cuts land on the music's beat instead of on
 * arbitrary clip lengths. Because we CONTROL the tempo (the niche playbook declares a target
 * BPM and any generated BGM is asked for that same BPM), the beat grid is known a priori — we
 * do not need to analyze an audio waveform after the fact. This module turns (BPM, duration)
 * into a deterministic grid of beat and bar (downbeat) timestamps, snaps planned shot
 * durations so every internal cut lands on a beat (or a bar for slower, cinematic families),
 * and emits a hard prompt directive so the model cuts to music.
 *
 * Deterministic and no-spend: pure arithmetic, no I/O, no provider calls. Clean-room original
 * (behavior inspired by beat-driven montage tooling; no upstream code was copied).
 */

export interface BeatGrid {
  /** Clamped tempo actually used. */
  readonly bpm: number;
  /** Seconds per beat (60 / bpm). */
  readonly beatSeconds: number;
  /** Beats per bar (musical measure), 2-8. */
  readonly beatsPerBar: number;
  /** Seconds per bar (beatSeconds x beatsPerBar). */
  readonly barSeconds: number;
  /** Total covered runtime. */
  readonly durationSeconds: number;
  /** Beat timestamps tiling [0, duration]. */
  readonly beats: readonly number[];
  /** Downbeat (bar) timestamps tiling [0, duration]. */
  readonly bars: readonly number[];
}

/** A cut can land on every beat (energetic) or only on bar downbeats (slower, cinematic). */
export type BeatCutUnit = "beat" | "bar";

const MIN_BPM = 40;
const MAX_BPM = 220;
const DEFAULT_BPM = 100;
// Hard ceiling on grid duration: no real clip runs an hour. Prevents planBeatGrid from
// allocating an unbounded beats[]/bars[] array when handed a huge (mis-configured) duration.
const MAX_GRID_SECONDS = 3600;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Clamp any tempo into a musically sane range; non-finite falls back to a neutral 100 BPM. */
export function normalizeBpm(bpm: number | undefined): number {
  if (!Number.isFinite(bpm)) {
    return DEFAULT_BPM;
  }
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm as number)));
}

/**
 * Fast, energetic families cut on every beat; slower families cut only on bar downbeats so a
 * cinematic 70 BPM clip does not chop every 0.85s. The threshold sits between "underscore"
 * and "drives the edit" tempos.
 */
export function beatCutUnitForBpm(bpm: number): BeatCutUnit {
  return normalizeBpm(bpm) >= 115 ? "beat" : "bar";
}

/** Build a deterministic beat + bar grid tiling [0, duration]. */
export function planBeatGrid(input: {
  readonly bpm: number;
  readonly durationSeconds: number;
  readonly beatsPerBar?: number;
}): BeatGrid {
  const bpm = normalizeBpm(input.bpm);
  const beatSeconds = 60 / bpm;
  const beatsPerBar = Math.min(8, Math.max(2, Math.round(Number.isFinite(input.beatsPerBar) ? (input.beatsPerBar as number) : 4)));
  const barSeconds = beatSeconds * beatsPerBar;
  const requestedDuration = Number.isFinite(input.durationSeconds) ? (input.durationSeconds as number) : beatSeconds;
  const duration = Math.min(MAX_GRID_SECONDS, Math.max(beatSeconds, requestedDuration));
  const epsilon = beatSeconds * 1e-3;
  const beats: number[] = [];
  for (let t = 0; t <= duration + epsilon; t += beatSeconds) {
    beats.push(round3(t));
  }
  const bars: number[] = [];
  for (let t = 0; t <= duration + epsilon; t += barSeconds) {
    bars.push(round3(t));
  }
  return {
    bpm,
    beatSeconds: round3(beatSeconds),
    beatsPerBar,
    barSeconds: round3(barSeconds),
    durationSeconds: round3(duration),
    beats,
    bars
  };
}

/**
 * Snap planned shot durations so every internal cut lands on a beat (or bar), while preserving the
 * TOTAL runtime exactly and staying monotonic. Boundaries are computed analytically from the tempo
 * (round(cumulative / unit) * unit), so the result is always on-grid even when the grid was built
 * for a shorter duration than the shots sum to, and the FINAL boundary is pinned to the exact total
 * so runtime never drifts (the last shot absorbs the remainder). `minShotSeconds` is a soft hint;
 * total-preservation and grid-alignment take precedence. Returns one snapped duration (>= 0) per shot.
 */
export function snapDurationsToBeatGrid(input: {
  readonly shotDurations: readonly number[];
  readonly grid: BeatGrid;
  readonly unit?: BeatCutUnit;
  readonly minShotSeconds?: number;
}): readonly number[] {
  const shotCount = input.shotDurations.length;
  const sanitized = input.shotDurations.map((duration) => Math.max(0, Number.isFinite(duration) ? duration : 0));
  if (shotCount === 0) {
    return [];
  }
  const total = round3(sanitized.reduce((sum, duration) => sum + duration, 0));
  const unit = input.unit === "bar" ? input.grid.barSeconds : input.grid.beatSeconds;
  if (shotCount === 1 || total <= 0 || !(unit > 0)) {
    return sanitized.map((duration) => round3(duration));
  }
  const snapped: number[] = [];
  let previousBoundary = 0;
  let cumulative = 0;
  for (let index = 0; index < shotCount; index += 1) {
    cumulative = round3(cumulative + (sanitized[index] ?? 0));
    let boundary: number;
    if (index === shotCount - 1) {
      boundary = total; // pin the final boundary so total runtime is preserved exactly
    } else {
      boundary = round3(Math.round(cumulative / unit) * unit); // nearest beat/bar, computed analytically
      if (boundary < previousBoundary) {
        boundary = previousBoundary; // never move a cut backwards
      }
      if (boundary > total) {
        boundary = total; // never push a cut past the end
      }
    }
    snapped.push(round3(boundary - previousBoundary));
    previousBoundary = boundary;
  }
  return snapped;
}

/** Hard prompt directive telling the model to cut to music on the grid. */
export function beatGridDirectiveLine(grid: BeatGrid, unit: BeatCutUnit = "beat"): string {
  const unitSeconds = unit === "bar" ? grid.barSeconds : grid.beatSeconds;
  return `Beat grid: the soundtrack runs at ${grid.bpm} BPM (one ${unit} every ${unitSeconds}s). Land every hard cut, camera hit, and major visual accent on a ${unit} so the edit reads as cut-to-music, never arbitrary; hold the payoff across a full bar.`;
}
