#!/usr/bin/env node
/**
 * No-spend regression for THE OWNER'S RULE: "clip lỗi thì render lại, vẫn trả clip hoàn chỉnh."
 * When Atlas fails a shot, re-render it and still hand the customer a complete video.
 *
 * The existing guard for this behaviour searched director-agent.ts for the TEXT
 * `isProviderRenderFailure(selectedCandidate)`. That string is present whether or not the retry
 * works. In particular it stays green if candidate ORDERING regresses — and ordering is what makes
 * the retry mean anything: the loop re-renders, then calls selectBestCandidate over every candidate
 * so far. If a failed candidate ever sorted ahead of a successful one, the loop would burn its whole
 * budget on shots it had already fixed and hand back the broken take anyway. Today the ordering is
 * correct because inspectRender rates a failure `rerender`/`block` (rank 3/4) against `pass`/`warn`
 * (rank 0/1) for a real clip — but nothing failed when that rule changed, so nothing was guarding it.
 *
 * These checks run the REAL DirectorAgent with a stub provider that fails on demand, and assert on
 * the clips that came out. No network, no provider, no spend: the video provider is a local object
 * and the story architect is fixed, so nothing reaches Atlas.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { DirectorAgent } = await import(`${base}/agents/director-agent.js`);
const { RenderProducer } = await import(`${base}/agents/render-producer.js`);
const { ConsistencyGuardian } = await import(`${base}/core/consistency-guardian.js`);
const { PROVIDER_FAILURE_RETRY_ATTEMPTS } = await import(`${base}/config/seedance-settings.js`);

const checks = [];
const check = (name, pass, detail) =>
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const SHOT_COUNT = 3;

/**
 * Fails the first `failuresPerShot` submissions of every shot, then succeeds.
 * `failureMode` picks which shape of provider failure to simulate.
 */
class FlakyVideoProvider {
  name = "atlascloud";
  requests = [];

  constructor(failuresPerShot, failureMode = "status") {
    this.failuresPerShot = failuresPerShot;
    this.failureMode = failureMode;
    this.attemptsByShot = new Map();
  }

  async generateTextToVideo(request) { return this.complete(request); }
  async generateImageToVideo(request) { return this.complete(request); }
  async generateReferenceToVideo(request) { return this.complete(request); }
  async editVideo(request) { return this.complete(request); }
  async extendVideo(request) { return this.complete(request); }
  async getPrediction(predictionId) { return this.lastPrediction ?? this.succeed("recall", 0); }
  async waitForPrediction() { return this.lastPrediction ?? this.succeed("recall", 0); }

  capabilities(modelId = "seedance-fake") {
    return [{
      provider: "atlascloud", modelId,
      modes: ["text_to_video", "image_to_video", "reference_to_video", "video_to_video", "extend", "edit"],
      durations: { min: 4, max: 15 },
      resolutions: ["480p", "720p", "1080p"],
      ratios: ["16:9", "9:16", "1:1"],
      references: ["image", "last_frame", "identity", "product", "environment", "style"],
      async: true
    }];
  }

  complete(request) {
    this.requests.push(request);
    const shotId = String(request.metadata?.shotId ?? `shot_${this.requests.length}`);
    const attempt = (this.attemptsByShot.get(shotId) ?? 0) + 1;
    this.attemptsByShot.set(shotId, attempt);
    const prediction = attempt <= this.failuresPerShot ? this.fail(shotId, attempt) : this.succeed(shotId, attempt);
    this.lastPrediction = prediction;
    return Promise.resolve(prediction);
  }

  fail(shotId, attempt) {
    const submittedAt = new Date();
    // "status" = Atlas reported the job failed. "empty" = Atlas reported success with nothing usable.
    // Both are the same thing to the customer: no clip. Both must trigger a re-render.
    return {
      provider: "atlascloud",
      predictionId: `fail_${shotId}_${attempt}`,
      modelId: "seedance-fake",
      status: this.failureMode === "empty" ? "succeeded" : "failed",
      outputUrls: [],
      raw: { simulatedFailure: this.failureMode },
      submittedAt, completedAt: submittedAt, latencyMs: 0
    };
  }

  succeed(shotId, attempt) {
    const submittedAt = new Date();
    return {
      provider: "atlascloud",
      predictionId: `ok_${shotId}_${attempt}`,
      modelId: "seedance-fake",
      status: "succeeded",
      // A real Seedance success carries the clip plus a last-frame still; the next shot chains from
      // that still, so omitting it fails the run for a reason that has nothing to do with retries.
      outputUrls: [
        `https://cdn.example.test/retry/${shotId}-attempt-${attempt}.mp4`,
        `https://cdn.example.test/retry/${shotId}-attempt-${attempt}-last-frame.png`
      ],
      raw: { simulatedFailure: false },
      submittedAt, completedAt: submittedAt, latencyMs: 0
    };
  }
}

class FixedStoryArchitect {
  async plan(intake) {
    return {
      premise: "A product proof told across three shots.",
      targetDurationSeconds: intake.settings.durationTargetSeconds,
      scenes: Array.from({ length: SHOT_COUNT }, (_unused, index) => ({
        sceneId: `scene_${index + 1}`,
        title: `Movement ${index + 1}`,
        beats: [{
          beatId: `beat_${index + 1}`,
          purpose: index === 0 ? "hook" : index === SHOT_COUNT - 1 ? "payoff" : "proof",
          action: `Continue one product motion across movement ${index + 1}.`,
          subject: "smart product on a clean studio desk",
          camera: "slow controlled dolly",
          lighting: "soft premium studio lighting",
          style: "clean premium commercial realism",
          durationSeconds: 10,
          risks: [], references: [],
          continuity: {
            product: "same smart product",
            environment: "same clean studio desk",
            style: "clean premium commercial realism"
          }
        }]
      }))
    };
  }
}

/** Loopback base URL: even a mistake in wiring cannot reach a paid endpoint from here. */
const atlasSettings = () => ({
  apiKey: "test-atlas-api-key",
  llmApiKey: "test-atlas-llm-api-key",
  apiBaseUrl: "http://127.0.0.1:9/api/v1",
  assetBaseUrl: "http://127.0.0.1:9/api/v1",
  models: { llmModel: "deepseek-v3-0324", seedanceStandardModel: "seedance-fake", seedanceFastModel: "seedance-fake" },
  seedanceCapabilities: [], generatedAudioCapabilities: [],
  requestTimeoutMs: 30000, maxJsonResponseBytes: 1000000, pollingIntervalMs: 1, pollingTimeoutMs: 30000
});

const runDirector = async (provider) =>
  new DirectorAgent({
    storyArchitect: new FixedStoryArchitect(),
    renderProducer: new RenderProducer(provider),
    atlasSettings: atlasSettings()
  }).run({
    userInput: "Create a 30 second multi-shot product proof video.",
    settings: {
      // economy buys ZERO content repairs, so anything that recovers here is the provider-failure
      // budget doing its job and nothing else.
      tier: "fast", resolution: "480p", qualityMode: "economy", ratio: "16:9",
      durationTargetSeconds: 30, audioMode: "none", watermark: false
    },
    metadata: {
      workflowMode: "auto", storyboardApproval: "approved",
      storyboardReviewer: "Provider retry smoke", storyboardReviewedAt: "2026-06-20T00:00:00.000Z"
    }
  });

check("provider_failure_budget_is_bounded_and_real", PROVIDER_FAILURE_RETRY_ATTEMPTS >= 1 && PROVIDER_FAILURE_RETRY_ATTEMPTS <= 3,
  String(PROVIDER_FAILURE_RETRY_ATTEMPTS));

// --- 1. THE OWNER'S CASE. Atlas fails every shot once; the customer must still get every clip.
{
  const provider = new FlakyVideoProvider(1, "status");
  let result;
  let threw;
  try {
    result = await runDirector(provider);
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  check("one_failure_per_shot_still_finishes", Boolean(result), threw ?? "completed");
  if (result) {
    const shots = result.renderedShots ?? [];
    check("every_shot_came_back", shots.length === SHOT_COUNT, `${shots.length} of ${SHOT_COUNT}`);
    check("every_delivered_clip_is_a_real_clip",
      shots.length > 0 && shots.every((shot) => shot.prediction.status === "succeeded" && shot.prediction.outputUrls.length > 0),
      shots.map((shot) => `${shot.prediction.predictionId}:${shot.prediction.outputUrls.length}`).join(", "));
    // The retry is what fixed it: a successful attempt only exists from attempt 2 onward.
    check("the_failed_take_was_not_the_one_delivered",
      shots.every((shot) => !shot.prediction.predictionId.startsWith("fail_")),
      shots.map((shot) => shot.prediction.predictionId).join(", "));
    check("provider_was_actually_re_submitted", provider.requests.length > SHOT_COUNT,
      `${provider.requests.length} submissions for ${SHOT_COUNT} shots`);
  }
}

// --- 2. SUCCESS WITH NO OUTPUT is the same failure. Atlas says "succeeded", hands back nothing.
{
  const provider = new FlakyVideoProvider(1, "empty");
  let result;
  try {
    result = await runDirector(provider);
  } catch {
    result = undefined;
  }
  check("empty_output_is_treated_as_a_failure_and_retried", Boolean(result) && provider.requests.length > SHOT_COUNT,
    `${provider.requests.length} submissions`);
  if (result) {
    check("empty_output_run_delivers_usable_clips",
      (result.renderedShots ?? []).every((shot) => shot.prediction.outputUrls.length > 0));
  }
}

// --- 3. A GENUINE OUTAGE must stop, not spin through the customer's balance.
{
  const provider = new FlakyVideoProvider(Number.POSITIVE_INFINITY, "status");
  let threw = false;
  try {
    await runDirector(provider);
  } catch {
    threw = true;
  }
  check("a_total_outage_fails_instead_of_delivering_a_broken_video", threw);
  // 1 first take + PROVIDER_FAILURE_RETRY_ATTEMPTS retries, for the first shot, then stop.
  const ceiling = SHOT_COUNT * (1 + PROVIDER_FAILURE_RETRY_ATTEMPTS);
  check("a_total_outage_is_bounded_by_the_retry_budget", provider.requests.length <= ceiling,
    `${provider.requests.length} submissions, ceiling ${ceiling}`);
}

// --- 4. THE ORDERING RULE the retry depends on, asserted directly on the real guardian.
{
  const guardian = new ConsistencyGuardian();
  const shot = {
    shotId: "s1", sceneId: "sc1", beatId: "b1", durationSeconds: 10,
    prompt: "test", references: [], risks: [], continuity: {}
  };
  const at = new Date();
  const failedReport = guardian.inspectRender({
    shot, prediction: { provider: "atlascloud", predictionId: "p", modelId: "m", status: "failed", outputUrls: [], raw: {}, submittedAt: at, completedAt: at, latencyMs: 0 }
  });
  const emptyReport = guardian.inspectRender({
    shot, prediction: { provider: "atlascloud", predictionId: "p", modelId: "m", status: "succeeded", outputUrls: [], raw: {}, submittedAt: at, completedAt: at, latencyMs: 0 }
  });
  const goodReport = guardian.inspectRender({
    shot, prediction: { provider: "atlascloud", predictionId: "p", modelId: "m", status: "succeeded", outputUrls: ["https://cdn.example.test/a.mp4"], raw: {}, submittedAt: at, completedAt: at, latencyMs: 0 }
  });
  const rank = { pass: 0, warn: 1, repair: 2, rerender: 3, block: 4 };
  check("a_failed_render_ranks_worse_than_a_real_clip", rank[failedReport.status] > rank[goodReport.status],
    `${failedReport.status} vs ${goodReport.status}`);
  check("an_empty_output_ranks_worse_than_a_real_clip", rank[emptyReport.status] > rank[goodReport.status],
    `${emptyReport.status} vs ${goodReport.status}`);
  check("a_real_clip_is_never_ranked_unusable", rank[goodReport.status] < rank.rerender, goodReport.status);
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.provider-retry-behaviour-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  nextActions: [
    "If you change candidate ordering, this file is the one that should go red. Ordering is what makes the retry worth its money.",
    "Retrying is only half the rule: the other half is that a total outage stops. Unbounded retries spend the customer's balance on an endpoint that is down."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
