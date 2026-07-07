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
  const duration = Math.max(beatSeconds, Number.isFinite(input.durationSeconds) ? input.durationSeconds : beatSeconds);
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

/** Nearest grid line to `target` that is still at least `floor`; falls back to `target`. */
function nearestGridLine(lines: readonly number[], target: number, floor: number): number {
  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line < floor) {
      continue;
    }
    const distance = Math.abs(line - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = line;
    }
  }
  return best ?? Math.max(target, floor);
}

/**
 * Snap a sequence of planned shot durations so every internal cut lands on a beat (or bar).
 *
 * The running boundary after each shot is pulled to the nearest grid line that still leaves the
 * shot at least `minShotSeconds` long; the FINAL boundary is kept exact so the total runtime is
 * preserved (the last shot absorbs any remainder). Returns one snapped duration per input shot.
 */
export function snapDurationsToBeatGrid(input: {
  readonly shotDurations: readonly number[];
  readonly grid: BeatGrid;
  readonly unit?: BeatCutUnit;
  readonly minShotSeconds?: number;
}): readonly number[] {
  const grid = input.grid;
  const lines = input.unit === "bar" ? grid.bars : grid.beats;
  const minShot = Math.max(0.1, Number.isFinite(input.minShotSeconds) ? (input.minShotSeconds as number) : grid.beatSeconds);
  const shotCount = input.shotDurations.length;
  if (shotCount === 0 || lines.length < 2) {
    return input.shotDurations.map((duration) => round3(Math.max(0, duration)));
  }
  const snapped: number[] = [];
  let previousBoundary = 0;
  let cumulative = 0;
  for (let index = 0; index < shotCount; index += 1) {
    cumulative += Math.max(0, input.shotDurations[index] ?? 0);
    const isLast = index === shotCount - 1;
    let boundary = isLast ? cumulative : nearestGridLine(lines, cumulative, previousBoundary + minShot);
    if (boundary < previousBoundary + minShot) {
      boundary = previousBoundary + minShot;
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
