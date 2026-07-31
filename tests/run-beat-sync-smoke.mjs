#!/usr/bin/env node
/**
 * No-spend regression for the beat-grid engine (musical-time cutting) and the per-niche beat
 * profiles. Pure arithmetic — no network, no provider, no spend.
 *  - the grid tiles [0, duration] with beats every 60/bpm and bars every beatsPerBar beats;
 *  - snapping pulls internal cuts onto grid lines while preserving total runtime and a minimum
 *    shot length;
 *  - each content family resolves to a sane tempo, and the dry formats (comedy/UGC) keep BGM off.
 */

import {
  planBeatGrid,
  snapDurationsToBeatGrid,
  normalizeBpm,
  beatCutUnitForBpm,
  beatGridDirectiveLine
} from "../dist/core/beat-grid-planner.js";
import { resolveNicheBeatProfile, nichePlaybookDirective } from "../dist/core/niche-playbooks.js";
const resolveProfileFromPlaybooks = resolveNicheBeatProfile;

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;

// ---- Part A: grid construction. ----
const grid = planBeatGrid({ bpm: 120, durationSeconds: 16, beatsPerBar: 4 });
check("beat_seconds_is_60_over_bpm", grid.beatSeconds === 0.5, grid.beatSeconds);
check("bar_seconds_is_beats_per_bar", grid.barSeconds === 2, grid.barSeconds);
check("beats_tile_full_duration", grid.beats.length === 33 && grid.beats[0] === 0 && grid.beats[grid.beats.length - 1] === 16, grid.beats.length);
check("bars_every_four_beats", grid.bars.length === 9 && grid.bars[1] === 2, grid.bars.length);
check("all_beats_multiples_of_beat_seconds", grid.beats.every((t) => onGrid(t, grid.beatSeconds)));

// BPM clamping + non-finite fallback.
check("bpm_clamped_low", normalizeBpm(5) === 40, normalizeBpm(5));
check("bpm_clamped_high", normalizeBpm(999) === 220, normalizeBpm(999));
check("bpm_nan_defaults_100", normalizeBpm(Number.NaN) === 100 && normalizeBpm(undefined) === 100);

// Cut-unit selection: energetic on beat, slow on bar.
check("fast_cuts_on_beat", beatCutUnitForBpm(150) === "beat" && beatCutUnitForBpm(115) === "beat");
check("slow_cuts_on_bar", beatCutUnitForBpm(70) === "bar" && beatCutUnitForBpm(114) === "bar");

// Directive line surfaces the tempo.
check("directive_mentions_bpm", beatGridDirectiveLine(grid, "beat").includes("120 BPM"));

// ---- Part B: snapping preserves total, lands internal cuts on grid, respects min shot. ----
const raw = [3.2, 4.7, 5.1]; // total 13.0
const snapped = snapDurationsToBeatGrid({ shotDurations: raw, grid, unit: "beat" });
const rawTotal = raw.reduce((a, b) => a + b, 0);
const snapTotal = snapped.reduce((a, b) => a + b, 0);
check("snap_preserves_total_runtime", Math.abs(snapTotal - rawTotal) < 1e-6, `${snapTotal} vs ${rawTotal}`);
// Internal boundaries (cumulative sums except the last) must sit on beats.
const boundaries = [];
let acc = 0;
for (let i = 0; i < snapped.length - 1; i += 1) { acc += snapped[i]; boundaries.push(acc); }
check("internal_cuts_land_on_beats", boundaries.every((b) => onGrid(b, grid.beatSeconds)), boundaries.join(","));
check("every_shot_at_least_min", snapped.every((d) => d >= grid.beatSeconds - 1e-6), snapped.join(","));
check("snap_same_shot_count", snapped.length === raw.length);
// Degenerate inputs are safe.
check("snap_empty_safe", snapDurationsToBeatGrid({ shotDurations: [], grid }).length === 0);
check("snap_single_shot_keeps_total", (() => { const s = snapDurationsToBeatGrid({ shotDurations: [7.3], grid }); return s.length === 1 && Math.abs(s[0] - 7.3) < 1e-6; })());

// ---- Part C: per-niche beat profiles. ----
check("anime_is_fast", resolveNicheBeatProfile({ niche: "anime" }).bpm === 150);
check("cinematic_is_slow", resolveNicheBeatProfile({ creativeMode: "cinematic" }).bpm === 70);
check("comedy_runs_dry", resolveNicheBeatProfile({ niche: "comedy" }).scoresToMusic === false);
check("ugc_runs_dry", resolveNicheBeatProfile({ creativeMode: "ugc_review" }).scoresToMusic === false);
check("commercial_uses_bgm", resolveNicheBeatProfile({ creativeMode: "product_ad" }).scoresToMusic === true);
check("unknown_niche_grounded", (() => { const p = resolveNicheBeatProfile({ niche: "zzz-nonexistent-niche" }); return p.bpm === 105 && p.scoresToMusic === true; })());
// Same resolver is re-exported from the niche-playbooks barrel (single source of truth).
check("profile_reexport_matches", resolveProfileFromPlaybooks({ niche: "anime" }).bpm === 150);
// Every family profile is musically sane.
for (const niche of ["cinematic", "anime", "product_ad", "action", "food_beverage", "music_video", "sports", "travel_hospitality", "transformation", "kids_family", "education", "meme", "ugc_review"]) {
  const p = resolveNicheBeatProfile({ niche });
  if (p.bpm < 40 || p.bpm > 220) { check(`bpm_in_range_${niche}`, false, p.bpm); }
}
check("all_family_bpm_in_range", checks.filter((c) => c.name.startsWith("bpm_in_range_")).length === 0);

// ---- Part D2: directive wiring (integration — the beat line actually reaches the prompt). ----
const animeDirective = nichePlaybookDirective({ niche: "anime" });
check("directive_appends_beat_line_for_scoring", /Beat sync:/.test(animeDirective) && /150 BPM/.test(animeDirective), animeDirective.slice(-70));
check("directive_omits_beat_line_for_dry", !/Beat sync:/.test(nichePlaybookDirective({ niche: "comedy" })));

// ---- Part E2: snap total-preservation + on-grid edge cases (from the adversarial audit). ----
const g10 = planBeatGrid({ bpm: 120, durationSeconds: 10 });
const snapTiny = snapDurationsToBeatGrid({ shotDurations: [3, 0.01], grid: g10 });
check("snap_preserves_total_tiny_last", Math.abs(snapTiny.reduce((a, b) => a + b, 0) - 3.01) < 1e-6, snapTiny.join(","));
const snapAllTiny = snapDurationsToBeatGrid({ shotDurations: [0.01, 0.01, 0.01, 0.01, 0.01], grid: g10 });
check("snap_preserves_total_all_tiny", Math.abs(snapAllTiny.reduce((a, b) => a + b, 0) - 0.05) < 1e-6, snapAllTiny.join(","));
const snapBig = snapDurationsToBeatGrid({ shotDurations: [100, 1, 1], grid: g10 });
const bigBoundaries = []; { let ba = 0; for (let i = 0; i < snapBig.length - 1; i += 1) { ba += snapBig[i]; bigBoundaries.push(ba); } }
check("snap_on_grid_beyond_grid_span", bigBoundaries.every((b) => onGrid(b, g10.beatSeconds)) && Math.abs(snapBig.reduce((a, b) => a + b, 0) - 102) < 1e-6, bigBoundaries.join(","));

// ---- Part F2: planBeatGrid clamps a huge duration (no unbounded-array DoS). ----
const huge = planBeatGrid({ bpm: 220, durationSeconds: 1e9 });
check("huge_duration_clamped", huge.durationSeconds === 3600 && huge.beats.length < 20000, `${huge.durationSeconds}:${huge.beats.length}`);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.beat-sync-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep green when changing the beat-grid math, the snapping rule, or the per-niche BPM/BGM profiles.",
    "beatGridDirectiveLine feeds the compiled prompt; snapDurationsToBeatGrid feeds shot-duration planning."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
