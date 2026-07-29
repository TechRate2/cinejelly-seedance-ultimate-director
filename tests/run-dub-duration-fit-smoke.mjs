#!/usr/bin/env node
/**
 * No-spend regression for dubbing DURATION-FIT (repo-fidelity audit gap #1): overlong synthesized
 * dub segments must be measured and sped up (atempo, natural cap) so they never play over the next
 * segment. Covers the pure planner, the executor integration (stub prober/engine — no network, no
 * ffmpeg), and the mix-engine atempo filtergraph placement.
 */

import { planDubDurationFit, MAX_NATURAL_TEMPO } from "../dist/core/dub-duration-fit.js";
import { RedubExecutor } from "../dist/core/redub-executor.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// ---- Pure planner ----
// Segment windows: s1 starts 0 next 5 (window 5), s2 starts 5 next 12 (7), s3 starts 12, video 20 (8).
const plan = planDubDurationFit({
  segments: [
    { intentId: "s1", startSecond: 0, measuredDurationSeconds: 4.9 },   // fits
    { intentId: "s2", startSecond: 5, measuredDurationSeconds: 8.4 },   // needs 1.2x -> tempo_fitted
    { intentId: "s3", startSecond: 12, measuredDurationSeconds: 14 }    // needs 1.75x -> capped + warning
  ],
  videoDurationSeconds: 20
});
const byId = Object.fromEntries(plan.segments.map((s) => [s.intentId, s]));
check("fits_within_tolerance_untouched", byId.s1.status === "fits" && byId.s1.tempo === 1);
check("overlong_gets_tempo", byId.s2.status === "tempo_fitted" && byId.s2.tempo === 1.2, JSON.stringify(byId.s2));
check("fitted_duration_lands_in_window", byId.s2.fittedDurationSeconds <= 7 + 0.01);
check("extreme_overrun_capped_with_warning", byId.s3.status === "overflow_warning" && byId.s3.tempo === MAX_NATURAL_TEMPO && byId.s3.residualOverflowSeconds > 0, JSON.stringify(byId.s3));
check("warning_is_vietnamese_actionable", plan.warnings.length === 1 && plan.warnings[0].includes("s3") && plan.warnings[0].includes("rút gọn"));
check("summary_counts", plan.fittedCount === 2 && plan.overflowWarningCount === 1 && plan.maxTempoApplied === MAX_NATURAL_TEMPO);

// Tiny overrun inside tolerance (window 10, measured 10.1) stays untouched.
const tol = planDubDurationFit({ segments: [
  { intentId: "a", startSecond: 0, measuredDurationSeconds: 10.1 },
  { intentId: "b", startSecond: 10, measuredDurationSeconds: 1 }
], videoDurationSeconds: 20 });
check("tolerance_absorbs_tiny_overrun", tol.segments[0].status === "fits" && tol.segments[0].tempo === 1);

// Unknown window (no startSecond / unknown video end) is never guessed at.
const unknown = planDubDurationFit({ segments: [
  { intentId: "u1", measuredDurationSeconds: 30 },
  { intentId: "u2", startSecond: 3, measuredDurationSeconds: 30 }
] });
check("unknown_windows_left_alone", unknown.segments.every((s) => s.status === "unknown_window" && s.tempo === 1));

// Out-of-order input still computes windows by wall-clock order.
const unordered = planDubDurationFit({ segments: [
  { intentId: "late", startSecond: 10, measuredDurationSeconds: 2 },
  { intentId: "early", startSecond: 0, measuredDurationSeconds: 16 } // window 10 -> needs 1.6 -> cap
], videoDurationSeconds: 30 });
check("wall_clock_order_not_array_order", unordered.segments.find((s) => s.intentId === "early").status === "overflow_warning");

// ---- Executor integration (stub prober + stub engine; no network, no ffmpeg) ----
const ttsUrls = [];
const speechStub = {
  async synthesizeSpeech(req) {
    ttsUrls.push(req.text);
    return { provider: "atlascloud", predictionId: "t", modelId: req.modelId, status: "succeeded", outputUrls: [`https://cdn.x/${ttsUrls.length}.mp3`], raw: {} };
  }
};
let mixInput;
const engineStub = {
  async materializeTracks(projectId, workDirectory, tracks) {
    return tracks.map((t, i) => `${workDirectory}/local_${i}.mp3`);
  },
  async mix(input) { mixInput = input; return { outputPath: input.outputVideoPath, trackCount: input.tracks.length, mixedAt: new Date(), mode: input.options.mode }; }
};
// Durations: source video 20s; seg1 window 8 (0->8) measured 9.9 -> tempo ~1.238; seg2 window 12 (8->20) measured 6 -> fits.
const proberStub = {
  async probe(path) {
    if (path.endsWith("local_0.mp3")) { return { durationSeconds: 9.9 }; }
    if (path.endsWith("local_1.mp3")) { return { durationSeconds: 6 }; }
    return { durationSeconds: 20 }; // source video
  }
};
const dubPlan = {
  projectId: "fit_t", sourceLanguage: "zh", dubLanguage: "vi", sourceCues: [], dubCues: [], subtitleTracks: [],
  originalAudioTreatment: "duck_under_dub",
  ttsIntents: [
    { intentId: "seg1", kind: "tts_narration", prompt: "Đoạn dài.", startSecond: 0, language: "vi" },
    { intentId: "seg2", kind: "tts_narration", prompt: "Đoạn vừa.", startSecond: 8, language: "vi" }
  ],
  summary: { segmentCount: 2, totalSpeechSeconds: 16, subtitleLanguages: ["vi"] }
};
const executed = await new RedubExecutor().execute({
  plan: dubPlan, sourceVideoPath: "C:/src.mp4", workDirectory: "C:/wd", outputVideoPath: "C:/out/dubbed.mp4",
  speechProvider: speechStub, ttsModelId: "m", audioMixEngine: engineStub, mediaProber: proberStub
});
check("executor_reports_duration_fit", Boolean(executed.durationFit) && executed.durationFit.fittedCount === 1, JSON.stringify(executed.durationFit ?? null));
const seg1Track = mixInput.tracks.find((t) => t.trackId === "seg1");
const seg2Track = mixInput.tracks.find((t) => t.trackId === "seg2");
check("overlong_track_carries_tempo", Boolean(seg1Track?.tempo) && seg1Track.tempo > 1.2 && seg1Track.tempo <= MAX_NATURAL_TEMPO, JSON.stringify(seg1Track));
check("fitting_track_untouched", seg2Track.tempo === undefined);
check("materialized_paths_passed_to_mix", Array.isArray(mixInput.materializedTrackPaths) && mixInput.materializedTrackPaths.length === 2);

// Without a prober the executor behaves exactly as before (no fit, no materialized paths).
let legacyMixInput;
const legacyEngine = { async mix(input) { legacyMixInput = input; return { outputPath: input.outputVideoPath, trackCount: input.tracks.length, mixedAt: new Date(), mode: input.options.mode }; } };
const legacy = await new RedubExecutor().execute({
  plan: dubPlan, sourceVideoPath: "C:/src.mp4", workDirectory: "C:/wd", outputVideoPath: "C:/out/dubbed.mp4",
  speechProvider: speechStub, ttsModelId: "m", audioMixEngine: legacyEngine
});
check("no_prober_no_fit_legacy_path", legacy.durationFit === undefined && legacyMixInput.materializedTrackPaths === undefined && legacyMixInput.tracks.every((t) => t.tempo === undefined));

// ---- Generated-audio narration tempo-fit (MPT-invariant completion): a fittable overrun is
// tempo-fitted with a WARN instead of hard-rejected; beyond the natural cap still blocks. ----
const { GeneratedAudioOutputValidator } = await import("../dist/core/generated-audio-output-validator.js");
const gaValidator = new GeneratedAudioOutputValidator();
const gaCase = (measuredSeconds) => ({
  intent: { intentId: "n1", kind: "tts_narration", prompt: "x", volume: 1, startSecond: 2 },
  plannedItem: {
    intentId: "n1", kind: "tts_narration", provider: "atlascloud", modelId: "tts-m",
    request: { provider: "atlascloud", modelId: "tts-m", prompt: "x", settings: { durationSeconds: 8, outputFormat: "mp3" } }
  },
  result: {
    intentId: "n1", kind: "tts_narration", provider: "atlascloud", modelId: "tts-m",
    status: "succeeded", outputUrl: "https://cdn.x/n1.mp3", durationSeconds: measuredSeconds, raw: {}
  }
});
const fitted = gaValidator.validate(gaCase(9.6)); // 1.2x -> fit
check("narration_overrun_tempo_fitted_not_rejected",
  fitted.status === "approved" && fitted.tempoFit?.ratio === 1.2 && fitted.audioTrack?.tempo === 1.2,
  JSON.stringify({ status: fitted.status, tempoFit: fitted.tempoFit, tempo: fitted.audioTrack?.tempo }));
const chipmunk = gaValidator.validate(gaCase(12.5)); // ~1.56x -> beyond cap
check("narration_extreme_overrun_still_blocks",
  chipmunk.status === "rejected" && chipmunk.issues.some((i) => i.code === "duration_exceeds_plan"), JSON.stringify(chipmunk.issues.map((i) => i.code)));
const exact = gaValidator.validate(gaCase(8.4)); // within 1s tolerance -> untouched
check("narration_within_tolerance_untouched", exact.status === "approved" && exact.audioTrack?.tempo === undefined);

// ---- Mix-engine filtergraph: atempo sits between volume and adelay (content scaled, placement not) ----
import { readFileSync } from "node:fs";
check("engine_applies_atempo_before_adelay", /volume=\$\{[^}]+\}\$\{tempoFilter\}\$\{delay\}/.test(readFileSync(new URL("../src/core/audio-mix-engine.ts", import.meta.url), "utf8")));

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.dub-duration-fit-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep GREEN when changing planDubDurationFit, RedubExecutor fit integration, or the mix-engine atempo chain.",
    "Audible verification of the fitted dub still requires one real redub run (needs TTS model configured)."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
