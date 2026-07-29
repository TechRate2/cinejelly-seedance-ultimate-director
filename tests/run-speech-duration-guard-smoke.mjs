#!/usr/bin/env node
/**
 * No-spend regression for the MEASURED-speech duration guard.
 *
 * Why this exists: a talking clip runs for exactly as long as its voice track, so an under-written
 * script silently produces a short video. Until this guard, the only thing that noticed was the
 * DELIVERY gate — which fires after every keyframe, every voice track AND every avatar render is
 * already paid for. A real 18s acceptance render died exactly there at 7.274s, with the whole
 * pipeline billed and nothing deliverable.
 *
 * The guard runs inside the talking-shot stage, straight after TTS (cents) and before the avatar
 * renders (dollars each), on the ffprobe-MEASURED length of the voice tracks rather than any
 * words-per-second estimate. These checks drive the real DirectorAgent with stub providers: no
 * network, no ffprobe, no spend.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { DirectorAgent } = await import(`${base}/agents/director-agent.js`);
const { DURATION_SHORT_BLOCK_TOLERANCE } = await import(`${base}/core/delivery-gate.js`);
const { DEFAULT_TRANSITION_SETTINGS } = await import(`${base}/core/transition-engine.js`);

// The delivered file is the sum of the clips MINUS one crossfade per boundary. Every expectation
// below derives from this, rather than hard-coding numbers that silently rot when the assembler's
// transition defaults change.
const overlapFor = (shotCount) =>
  shotCount > 1 && DEFAULT_TRANSITION_SETTINGS.enabled ? (shotCount - 1) * DEFAULT_TRANSITION_SETTINGS.durationSeconds : 0;
const DELIVERY_FLOOR_18S = 18 * (1 - DURATION_SHORT_BLOCK_TOLERANCE);
/** Per-shot voice length that makes a 3-shot render DELIVER exactly `deliveredSeconds`. */
const perShotForDelivered = (deliveredSeconds) => (deliveredSeconds + overlapFor(3)) / 3;

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

function atlasSettings() {
  return {
    apiKey: "test-atlas-api-key",
    llmApiKey: "test-atlas-llm-api-key",
    apiBaseUrl: "https://api.atlascloud.ai/api/v1",
    assetBaseUrl: "https://api.atlascloud.ai/api/v1",
    models: {
      llmModel: "deepseek-v3-0324",
      seedanceStandardModel: "seedance-fake",
      seedanceFastModel: "seedance-fake",
      ttsModel: "tts-fake",
      avatarModel: "avatar-fake"
    },
    seedanceCapabilities: [],
    generatedAudioCapabilities: [],
    requestTimeoutMs: 30000,
    maxJsonResponseBytes: 1000000,
    pollingIntervalMs: 1000,
    pollingTimeoutMs: 30000
  };
}

/** Three 6s talking shots — an 18s order, the exact shape of the acceptance render that failed. */
function talkingShots(count = 3, durationSeconds = 6) {
  return Array.from({ length: count }, (_unused, index) => ({
    shotId: `shot_${index + 1}`,
    sceneId: "scene_1",
    beatId: `beat_${index + 1}`,
    order: index,
    durationSeconds,
    prompt: "A creator talks to camera.",
    spokenLine: "Mình dùng cái này ba tuần rồi và da mình thay đổi thật sự luôn á mọi người.",
    references: [
      { role: "first_frame", label: "keyframe", providerReference: { kind: "image", uri: `https://cdn.example/kf_${index}.png`, role: "first_frame", label: "keyframe" } }
    ],
    metadata: {},
    continuity: {}
  }));
}

const compiledPromptsFor = (shots) => shots.map((shot) => ({ shotId: shot.shotId, prompt: shot.prompt, negativePrompt: "", metadata: {} }));

class StubSpeechProvider {
  callCount = 0;
  async synthesizeSpeech() {
    this.callCount += 1;
    return { provider: "atlascloud", predictionId: `tts_${this.callCount}`, modelId: "tts-fake", status: "succeeded", outputUrls: ["https://cdn.example/voice.mp3"], raw: {}, submittedAt: new Date() };
  }
}

/** Reports a fixed measured length for every voice track, standing in for ffprobe. */
const proberOf = (seconds) => ({ probe: async () => (seconds === undefined ? {} : { durationSeconds: seconds }) });

async function runStage({ measuredSeconds, targetDurationSeconds, shots = talkingShots(), prober = true }) {
  const target = targetDurationSeconds === null ? undefined : targetDurationSeconds ?? 18;
  const speechProvider = new StubSpeechProvider();
  const agent = new DirectorAgent({
    atlasSettings: atlasSettings(),
    speechProvider,
    ...(prober ? { speechDurationProber: proberOf(measuredSeconds) } : {})
  });
  const compiledPrompts = compiledPromptsFor(shots);
  let error;
  try {
    // TS `private` is compile-time only; the stage is reachable on the built class.
    await agent.runTalkingShotStage({ shots, compiledPrompts, settings: { ...(target !== undefined ? { durationTargetSeconds: target } : {}) } });
  } catch (caught) {
    error = caught;
  }
  return { error, compiledPrompts, speechProvider };
}

// --- 1. SHORT SPEECH IS BLOCKED, and blocked in the stage that comes BEFORE the avatar renders.
// 3 shots x 2.4s = 7.2s against an 18s order — the acceptance render's exact failure.
const short = await runStage({ measuredSeconds: 2.4 });
check("short_measured_speech_blocks", short.error !== undefined, short.error?.message ?? "no error thrown");
check("short_block_is_customer_actionable", short.error?.name === "CustomerActionableError", short.error?.name);
check("short_block_message_is_vietnamese_and_actionable",
  typeof short.error?.message === "string" && short.error.message.includes("giây") && short.error.message.includes("tạo lại"));
// The message must quote the DELIVERED length (clips minus crossfades), which is what the customer
// would actually have received — not the raw sum, which no one ever sees.
const shortDelivered = (Math.round((2.4 * 3 - overlapFor(3)) * 10) / 10).toString();
check("short_block_states_delivered_length", short.error?.message?.includes(shortDelivered),
  `expected "${shortDelivered}" in: ${short.error?.message}`);
// The voice tracks were bought (cents) but the guard fired before the stage handed anything to the
// renderer — proof the expensive half is what gets saved.
check("short_block_happens_after_tts_but_before_render", short.speechProvider.callCount === 3, short.speechProvider.callCount);

// --- 2. ADEQUATE SPEECH PASSES. 3 x 6s = 18s exactly.
const exact = await runStage({ measuredSeconds: 6 });
check("adequate_measured_speech_passes", exact.error === undefined, exact.error?.message);
check("adequate_speech_routes_all_shots_to_avatar",
  exact.compiledPrompts.every((prompt) => prompt.avatarPlan?.audioUrl === "https://cdn.example/voice.mp3"));

// --- 3. INSIDE the delivery gate's own tolerance must NOT block — otherwise the guard rejects
// renders the gate itself would have accepted.
const justInside = perShotForDelivered(DELIVERY_FLOOR_18S + 0.3);
const inside = await runStage({ measuredSeconds: justInside });
check("within_delivery_tolerance_does_not_block", inside.error === undefined,
  `delivers ${(justInside * 3 - overlapFor(3)).toFixed(2)}s vs floor ${DELIVERY_FLOOR_18S.toFixed(2)}s: ${inside.error?.message ?? "passed"}`);
const justOutside = perShotForDelivered(DELIVERY_FLOOR_18S - 0.5);
const outside = await runStage({ measuredSeconds: justOutside });
check("just_outside_delivery_tolerance_blocks", outside.error !== undefined,
  `delivers ${(justOutside * 3 - overlapFor(3)).toFixed(2)}s vs floor ${DELIVERY_FLOOR_18S.toFixed(2)}s`);

// --- 4. FAIL-OPEN. Measurement is advisory infrastructure: no prober, or a prober that cannot read
// the file, must never manufacture a shortfall and block a paying customer's render.
const noProber = await runStage({ measuredSeconds: 2.4, prober: false });
check("missing_prober_never_blocks", noProber.error === undefined, noProber.error?.message);
const unreadable = await runStage({ measuredSeconds: undefined });
check("unreadable_audio_never_blocks", unreadable.error === undefined, unreadable.error?.message);

// --- 5. Unmeasured shots count at their PLANNED length, so a partially-readable batch is judged on
// what it actually knows rather than treating silence as zero.
class FlakyProber {
  calls = 0;
  async probe() {
    this.calls += 1;
    return this.calls === 1 ? { durationSeconds: 5 } : {};
  }
}
const flakyAgent = new DirectorAgent({ atlasSettings: atlasSettings(), speechProvider: new StubSpeechProvider(), speechDurationProber: new FlakyProber() });
const flakyShots = talkingShots();
let flakyError;
try {
  await flakyAgent.runTalkingShotStage({ shots: flakyShots, compiledPrompts: compiledPromptsFor(flakyShots), settings: { durationTargetSeconds: 18 } });
} catch (caught) {
  flakyError = caught;
}
// 5s measured + 6 + 6 planned = 17s, at/above the 16.2s floor for an 18s order -> must pass.
// (2.4s measured would give 14.4s and SHOULD block: the one measurement we have proves it short.)
check("unmeasured_shots_count_at_planned_duration", flakyError === undefined, flakyError?.message);

// --- 6. No target duration = nothing to compare against; the guard must stay silent.
const noTarget = await runStage({ measuredSeconds: 0.5, targetDurationSeconds: null });
check("no_target_duration_never_blocks", noTarget.error === undefined, noTarget.error?.message);

// --- 7. A pure b-roll plan has no talking shots at all: the stage returns before any TTS, so no
// voice is bought and nothing is measured.
const silentShots = talkingShots().map(({ spokenLine: _drop, ...rest }) => rest);
const silent = await runStage({ measuredSeconds: 1, shots: silentShots });
check("b_roll_only_plan_buys_no_voice", silent.error === undefined && silent.speechProvider.callCount === 0, silent.speechProvider.callCount);

// --- 8. CROSSFADE BLIND SPOT. The delivered file is the sum of the clips MINUS one transition per
// boundary, so a guard that compares the raw sum against the gate's floor passes a batch the gate
// then rejects — after every avatar render is paid for. The guard and the delivery gate must reach
// the same verdict at every point across the band, or the money is spent for nothing.
const bandMismatches = [];
for (const perShot of [5.30, 5.35, 5.40, 5.45, 5.50, 5.55, 5.60, 5.65, 5.70, 6.0]) {
  const guardBlocked = (await runStage({ measuredSeconds: perShot })).error !== undefined;
  // What the finished file will actually measure, by the same arithmetic the assembler uses.
  const deliveredSeconds = perShot * 3 - overlapFor(3);
  const gateWouldBlock = deliveredSeconds < 18 * (1 - DURATION_SHORT_BLOCK_TOLERANCE);
  if (guardBlocked !== gateWouldBlock) {
    bandMismatches.push(`${perShot}s/shot -> delivered ${deliveredSeconds.toFixed(2)}s: guard=${guardBlocked} gate=${gateWouldBlock}`);
  }
}
check("guard_agrees_with_delivery_gate_across_the_band", bandMismatches.length === 0, bandMismatches.join(" | ") || "all 10 points agree");
// The exact point the audit found: 3 x 5.45s = 16.35s raw (above the 16.2s floor) but 15.65s
// delivered (below it). The raw-sum guard let this through and the render was bought in full.
const crossfadeTrap = await runStage({ measuredSeconds: 5.45 });
check("crossfade_trap_is_blocked_before_spend", crossfadeTrap.error !== undefined,
  `raw ${(5.45 * 3).toFixed(2)}s, delivered ${(5.45 * 3 - overlapFor(3)).toFixed(2)}s`);

// --- 9. A STALLED READ MUST NOT PIN THE JOB. ffprobe reads the provider URL over the network and
// the shared runner's default deadline is 30 MINUTES; with one worker, one stalled read freezes the
// queue for every other customer too. The stage must give up quickly and carry on unmeasured.
class HangingProber {
  calls = 0;
  async probe(_url, signal) {
    this.calls += 1;
    return new Promise((_resolve, reject) => {
      if (signal) {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }
      // Never resolves on its own — only the deadline can end it.
    });
  }
}
const hangingProber = new HangingProber();
const hangingAgent = new DirectorAgent({ atlasSettings: atlasSettings(), speechProvider: new StubSpeechProvider(), speechDurationProber: hangingProber });
const hangingShots = talkingShots(3);
const startedAt = Date.now();
let hangingError;
try {
  await hangingAgent.runTalkingShotStage({ shots: hangingShots, compiledPrompts: compiledPromptsFor(hangingShots), settings: { durationTargetSeconds: 18 } });
} catch (caught) {
  hangingError = caught;
}
const elapsedMs = Date.now() - startedAt;
check("stalled_probe_gives_up_quickly", elapsedMs < 25_000, `${elapsedMs}ms`);
check("stalled_probe_does_not_block_the_render", hangingError === undefined, hangingError?.message);
check("stalled_probe_still_attempted_every_track", hangingProber.calls === 3, hangingProber.calls);

// --- 10. Measurement runs in parallel rather than one blocking read per shot end to end.
class SlowProber {
  inFlight = 0;
  peak = 0;
  async probe() {
    this.inFlight += 1;
    this.peak = Math.max(this.peak, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 60));
    this.inFlight -= 1;
    return { durationSeconds: 6 };
  }
}
const slowProber = new SlowProber();
const slowShots = talkingShots(6);
await new DirectorAgent({ atlasSettings: atlasSettings(), speechProvider: new StubSpeechProvider(), speechDurationProber: slowProber })
  .runTalkingShotStage({ shots: slowShots, compiledPrompts: compiledPromptsFor(slowShots), settings: { durationTargetSeconds: 36 } });
check("voice_tracks_are_measured_in_parallel", slowProber.peak > 1, `peak concurrency ${slowProber.peak}`);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.speech-duration-guard-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when touching the talking-shot stage, the avatar routing order, or DURATION_SHORT_BLOCK_TOLERANCE.",
    "The guard saves the avatar spend only; keyframes and TTS are already bought when it fires. Recovering those needs the cache/salvage work."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
