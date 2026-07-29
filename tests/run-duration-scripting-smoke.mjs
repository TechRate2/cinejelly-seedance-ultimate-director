/**
 * No-spend smoke for duration scripting and full-runtime integrity.
 * Proves: timestamped beat plans tile any duration exactly; video-level arc roles give
 * every video a designed opening and ending; crossfade-overlap/shortfall compensation
 * restores the requested total; the prompt compiler emits the runtime contract; and
 * candidate duration-shortfall probing maps to rerender-grade findings.
 * No network, no provider calls, no spend.
 */

import {
  ARC_ROLE_DIRECTIVES,
  assignVideoArcRoles,
  buildDurationScript,
  planDurationBeats,
  planDurationCompensation
} from "../dist/core/duration-scripting.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";
import { RenderedCandidateVisualInspector } from "../dist/core/rendered-candidate-visual-inspector.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// 1. Beat plans tile the full duration exactly for every renderable clip length.
for (const duration of [4, 5, 8, 10, 12, 15]) {
  const beats = planDurationBeats(duration);
  const tiles = beats.every((beat, index) => (index === 0 ? beat.startSecond === 0 : Math.abs(beat.startSecond - beats[index - 1].endSecond) < 1e-9));
  const coversEnd = Math.abs(beats[beats.length - 1].endSecond - duration) < 1e-9;
  check(`beats_tile_${duration}s`, tiles && coversEnd && beats[0].role === "hook" && beats[beats.length - 1].role === "settle");
}
const longBeats = planDurationBeats(15);
check("long_clip_gets_multiple_middle_beats", longBeats.length >= 5);

// 2. Arc roles: designed opening and ending for any shot count.
check("one_shot_full_video", assignVideoArcRoles(1)[0] === "full_video");
check("two_shots_hook_and_resolve", JSON.stringify(assignVideoArcRoles(2)) === JSON.stringify(["opening_hook", "closing_resolve"]));
const five = assignVideoArcRoles(5);
check(
  "five_shots_arc",
  five[0] === "opening_hook" && five[3] === "climax" && five[4] === "closing_resolve" && five[1] === "development"
);
check("arc_directives_cover_all_roles", ["full_video", "opening_hook", "development", "climax", "closing_resolve"].every((role) => Boolean(ARC_ROLE_DIRECTIVES[role])));

// 3. Duration script prompt lines carry the sandwich runtime contract.
const script = buildDurationScript({ durationSeconds: 8, arcRole: "full_video" });
check("script_declares_exact_runtime", script.promptLines[0].includes("exactly 8 seconds"));
check("script_ends_with_total", script.promptLines[script.promptLines.length - 1].includes("Total: 8s"));
check("script_has_timestamped_beats", script.promptLines.some((line) => line.startsWith("[0-")));

// 4. Compensation: crossfade overlap plus shortfall is restored in whole seconds.
const additions = planDurationCompensation({
  shotDurations: [8, 8, 8, 8],
  targetDurationSeconds: 34,
  transitionOverlapSeconds: 0.35,
  maxClipSeconds: 15
});
const compensatedTotal = additions.reduce((sum, add, i) => sum + add + [8, 8, 8, 8][i], 0);
// planned 32, target 34 (shortfall 2) + overlap 0.35*3=1.05 -> add ~3s
check("compensation_restores_total", compensatedTotal >= 35 && compensatedTotal <= 36, `total=${compensatedTotal}`);
check("compensation_prefers_ending", (additions[3] ?? 0) >= (additions[0] ?? 0));
const capped = planDurationCompensation({
  shotDurations: [15, 15],
  targetDurationSeconds: 40,
  transitionOverlapSeconds: 0.35,
  maxClipSeconds: 15
});
check("compensation_respects_clip_cap", capped.every((add) => add === 0));
check("compensation_no_op_when_on_target", planDurationCompensation({ shotDurations: [10], targetDurationSeconds: 10, transitionOverlapSeconds: 0.35, maxClipSeconds: 15 }).every((a) => a === 0));

// 5. Prompt compiler emits the runtime contract and arc directive.
const compiler = new SeedancePromptCompiler();
const compiled = compiler.compile({
  shot: {
    shotId: "shot_duration_smoke",
    durationSeconds: 12,
    intent: "Show the product filling the full runtime",
    subject: "A ceramic mug on a walnut desk",
    action: "Hand lifts the mug, steam rises, slow rotate to label, settle",
    camera: "Slow push-in, shallow depth",
    lighting: "Warm window key light",
    references: [],
    continuity: {},
    risks: [],
    metadata: { videoArcRole: "closing_resolve" }
  },
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("compiler_emits_runtime_contract", compiled.prompt.includes("Runtime contract: this clip runs exactly 12 seconds"));
check("compiler_emits_ending_directive", compiled.prompt.includes("Video ending: this is the final shot"));
check("compiler_emits_no_early_finish", compiled.prompt.includes("Do not finish the action early"));
check("compiler_emits_total_marker", compiled.prompt.includes("Total: 12s"));

// 6. Candidate duration-shortfall probe maps to rerender/warn findings, fail-safe on errors.
const basePrediction = {
  provider: "atlascloud",
  predictionId: "p_dur",
  modelId: "m",
  status: "succeeded",
  outputUrls: ["https://example.com/clip.mp4"],
  raw: {},
  submittedAt: new Date(),
  completedAt: new Date(),
  latencyMs: 900
};
const compiledPromptFixture = {
  shotId: "shot_duration_smoke",
  inspectionExpectations: [],
  videoRequest: { settings: { durationSeconds: 10 } }
};
function proberInspector(probeSeconds, opts = {}) {
  return new RenderedCandidateVisualInspector({
    mediaInspector: { sampleFrames: async () => [{ path: "C:/tmp/f.jpg", index: 0 }] },
    semanticVisualInspector: { inspect: async (frames) => ({ status: "pass", findings: [], frameCount: frames.length, reviewedFrames: frames }) },
    mediaProber: {
      probe: async () => {
        if (opts.throwError) {
          throw new Error("probe failed");
        }
        return { durationSeconds: probeSeconds };
      }
    }
  });
}
const curation = { options: { enabled: true, expectations: [], maxFrames: 2 }, workDirectory: "C:/tmp/dur-smoke" };
const shot = { shotId: "shot_duration_smoke" };
const shortClip = await proberInspector(8).inspectCandidate({ shot, compiledPrompt: compiledPromptFixture, prediction: basePrediction, candidateIndex: 1, curation });
check("short_clip_triggers_rerender", shortClip.status === "rerender" && shortClip.findings.some((f) => f.checkpoint === "visual_duration_shortfall"));
const slightlyShort = await proberInspector(9.2).inspectCandidate({ shot, compiledPrompt: compiledPromptFixture, prediction: basePrediction, candidateIndex: 2, curation });
check("slight_shortfall_warns", slightlyShort.status === "warn" && slightlyShort.findings.some((f) => f.checkpoint === "visual_duration_shortfall"));
const fullClip = await proberInspector(10.02).inspectCandidate({ shot, compiledPrompt: compiledPromptFixture, prediction: basePrediction, candidateIndex: 3, curation });
check("full_clip_passes", fullClip.status === "pass");
const probeError = await proberInspector(0, { throwError: true }).inspectCandidate({ shot, compiledPrompt: compiledPromptFixture, prediction: basePrediction, candidateIndex: 4, curation });
check("probe_error_fail_safe", probeError.status === "pass");

// AVATAR shots (paid-acceptance forensics 2026-07-26): the clip's authoritative runtime is the TTS
// AUDIO length, not the planned beat seconds — a 4s-planned beat whose speech lasts ~3s correctly
// returns a ~3s clip and must PASS. A clip shorter than its OWN audio still trips the gate.
const avatarPromptFixture = {
  shotId: "shot_avatar_dur",
  inspectionExpectations: [],
  videoRequest: { settings: { durationSeconds: 4 } },
  avatarPlan: { modelId: "avatar-m", imageUrl: "https://example.com/kf.png", audioUrl: "https://example.com/voice.mp3" }
};
function avatarProberInspector(byUrl) {
  return new RenderedCandidateVisualInspector({
    mediaInspector: { sampleFrames: async () => [{ path: "C:/tmp/f.jpg", index: 0 }] },
    semanticVisualInspector: { inspect: async (frames) => ({ status: "pass", findings: [], frameCount: frames.length, reviewedFrames: frames }) },
    mediaProber: { probe: async (url) => ({ durationSeconds: byUrl(url) }) }
  });
}
// Clip 3.0s vs planned 4s but audio 3.0s -> matches its speech -> PASS (this exact case S1-failed the real run).
const avatarMatchesAudio = await avatarProberInspector((url) => (url.endsWith(".mp3") ? 3.0 : 3.0))
  .inspectCandidate({ shot: { shotId: "shot_avatar_dur" }, compiledPrompt: avatarPromptFixture, prediction: basePrediction, candidateIndex: 5, curation });
check("avatar_clip_matching_audio_passes", avatarMatchesAudio.status === "pass", avatarMatchesAudio.status);
// Clip 1.8s vs its own 3.0s audio -> genuinely truncated speech -> rerender.
const avatarTruncated = await avatarProberInspector((url) => (url.endsWith(".mp3") ? 3.0 : 1.8))
  .inspectCandidate({ shot: { shotId: "shot_avatar_dur" }, compiledPrompt: avatarPromptFixture, prediction: basePrediction, candidateIndex: 6, curation });
check("avatar_clip_shorter_than_audio_rerenders", avatarTruncated.status === "rerender" && avatarTruncated.findings.some((f) => f.checkpoint === "visual_duration_shortfall"), avatarTruncated.status);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.duration-scripting-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing duration-scripting.ts, the prompt compiler runtime contract, shot-planner arc roles, or candidate duration probing.",
    "Full-duration integrity also depends on the delivery gate short-side block and DirectorAgent duration compensation; re-run the regression sweep after touching those."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
