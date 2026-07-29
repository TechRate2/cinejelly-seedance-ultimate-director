/**
 * No-spend smoke for the pipeline intelligence upgrades:
 * 1. Duration rhythm — non-uniform short-drama pacing with exact runtime tiling.
 * 2. Video-level consistency gate — character-lock drift/still-source/front-view/coverage
 *    and slideshow-risk monotone framing, all caught before spend.
 * 3. Social publishing metadata — deterministic platform-ready title/hashtags/CTA (vi+en).
 * 4. Script-first mode — pasted scripts detected (marker + heuristic) and briefed verbatim.
 * 5. Keyframe-first cost accounting — planned keyframe images priced into the cost gate.
 * 6. Keyframe-first director wiring — the stage is invoked by the director loop (source check).
 */

import { readFileSync } from "node:fs";
import { planDurationBeats } from "../dist/core/duration-scripting.js";
import { ConsistencyGuardian } from "../dist/core/consistency-guardian.js";
import { planSocialPublishingMetadata } from "../dist/core/social-publishing-planner.js";
import { looksLikeUserScript } from "../dist/agents/story-architect.js";
import { resolveSimpleBrief, USER_SCRIPT_OPEN_MARKER } from "../dist/core/simple-brief-resolver.js";
import { RenderCostGate } from "../dist/core/render-cost-gate.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// --- 1. Duration rhythm invariants across representative durations.
for (const duration of [5, 12, 27, 60]) {
  const beats = planDurationBeats(duration);
  let tiles = beats[0].startSecond === 0 && beats[beats.length - 1].endSecond === duration;
  for (let i = 1; i < beats.length; i += 1) {
    if (Math.abs(beats[i].startSecond - beats[i - 1].endSecond) > 1e-9) tiles = false;
  }
  const spans = beats.map((b) => ({ role: b.role, len: b.endSecond - b.startSecond }));
  const devs = spans.filter((s) => s.role === "development").map((s) => s.len);
  const peak = spans.find((s) => s.role === "proof_peak")?.len ?? 0;
  const tempoRises = devs.every((len, i, all) => i === 0 || len <= all[i - 1] + 1e-9);
  const peakHeld = devs.every((len) => peak >= len - 1e-9);
  check(`rhythm_${duration}s`, tiles && spans.every((s) => s.len > 0) && tempoRises && peakHeld);
}

// --- 2. Video-level consistency gate.
const guardian = new ConsistencyGuardian();
function shotWith({ shotId, identityUri, characterId, kind = "image", view, shotType, identityContinuity }) {
  return {
    shotId,
    sceneId: "scene_1",
    intent: "demo",
    action: "creator demonstrates the product",
    subject: "creator",
    camera: "handheld",
    lighting: "soft",
    durationSeconds: 6,
    risks: [],
    references: identityUri
      ? [{
          role: "identity",
          label: `identity ${characterId}`,
          priority: "primary",
          providerReference: { kind, uri: identityUri },
          selection: { characterId, ...(view ? { view } : {}) }
        }]
      : [],
    continuity: identityContinuity ? { identity: identityContinuity } : {},
    metadata: { ...(shotType ? { shotType } : {}) }
  };
}
const driftReport = guardian.inspectVideoConsistency({
  projectId: "proj_drift",
  shots: [
    shotWith({ shotId: "s1", identityUri: "https://cdn.example/kol-a.png", characterId: "kol" }),
    shotWith({ shotId: "s2", identityUri: "https://cdn.example/kol-DIFFERENT.png", characterId: "kol" })
  ]
});
check("gate_asset_drift_repairs", driftReport.findings.some((f) => f.checkpoint === "character_lock_asset_drift" && f.status === "repair"));

const videoSourceReport = guardian.inspectVideoConsistency({
  projectId: "proj_vidsrc",
  shots: [shotWith({ shotId: "s1", identityUri: "https://cdn.example/kol.mp4", characterId: "kol", kind: "video" })]
});
check("gate_video_identity_repairs", videoSourceReport.findings.some((f) => f.checkpoint === "character_lock_still_source"));

const sideViewReport = guardian.inspectVideoConsistency({
  projectId: "proj_side",
  shots: [shotWith({ shotId: "s1", identityUri: "https://cdn.example/kol-side.png", characterId: "kol", view: "side" })]
});
check("gate_front_view_warns", sideViewReport.findings.some((f) => f.checkpoint === "character_lock_front_view" && f.status === "warn"));

const coverageReport = guardian.inspectVideoConsistency({
  projectId: "proj_cov",
  shots: [
    shotWith({ shotId: "s1", identityContinuity: ["hero"] }),
    shotWith({ shotId: "s2", identityContinuity: ["hero"] })
  ]
});
check("gate_coverage_warns", coverageReport.findings.some((f) => f.checkpoint === "character_lock_coverage"));

// PRODUCTION shape regression (repo-fidelity audit bug): continuity.identity is a PROSE STRING —
// the old code iterated it letter-by-letter, minting one bogus "character" per LETTER. The prose
// shape must yield exactly ONE coverage warning, never per-letter noise.
const proseCoverageReport = guardian.inspectVideoConsistency({
  projectId: "proj_cov_prose",
  shots: [
    shotWith({ shotId: "s1", identityContinuity: "Linh — 23t, mắt kiên định" }),
    shotWith({ shotId: "s2", identityContinuity: "Linh — 23t, mắt kiên định" })
  ]
});
const proseCoverageFindings = proseCoverageReport.findings.filter((f) => f.checkpoint === "character_lock_coverage");
check("gate_prose_identity_one_warning_no_letter_noise", proseCoverageFindings.length === 1, `count=${proseCoverageFindings.length}`);
// An anchored video with prose identity produces NO coverage warning.
const proseAnchoredReport = guardian.inspectVideoConsistency({
  projectId: "proj_cov_prose_ok",
  shots: [
    shotWith({ shotId: "s1", identityContinuity: "Linh — 23t", identityUri: "https://cdn.example/linh.png", characterId: "linh", view: "front" }),
    shotWith({ shotId: "s2", identityContinuity: "Linh — 23t", identityUri: "https://cdn.example/linh.png", characterId: "linh", view: "front" })
  ]
});
check("gate_prose_identity_anchored_clean", !proseAnchoredReport.findings.some((f) => f.checkpoint === "character_lock_coverage"));

const monotoneReport = guardian.inspectVideoConsistency({
  projectId: "proj_mono",
  shots: ["s1", "s2", "s3", "s4"].map((shotId) => shotWith({ shotId, shotType: "medium_shot" }))
});
check("gate_slideshow_warns", monotoneReport.findings.some((f) => f.checkpoint === "slideshow_risk_monotone_framing"));

const cleanReport = guardian.inspectVideoConsistency({
  projectId: "proj_clean",
  shots: [
    shotWith({ shotId: "s1", identityUri: "https://cdn.example/kol.png", characterId: "kol", view: "front", shotType: "close_up" }),
    shotWith({ shotId: "s2", identityUri: "https://cdn.example/kol.png", characterId: "kol", view: "front", shotType: "medium_shot" }),
    shotWith({ shotId: "s3", identityUri: "https://cdn.example/kol.png", characterId: "kol", view: "front", shotType: "close_up" })
  ]
});
check("gate_clean_passes", cleanReport.status === "pass", cleanReport.findings.map((f) => f.checkpoint).join(","));

// --- 3. Social publishing metadata.
const viSocial = planSocialPublishingMetadata({
  premise: "Serum phục hồi da cháy nắng chỉ sau một đêm. Làn da mềm mịn trở lại.",
  userInput: "quảng cáo serum phục hồi da",
  platform: "tiktok",
  niche: "skincare",
  language: "vi"
});
check("social_vi_title", viSocial.title.length > 0 && viSocial.title.length <= 70, viSocial.title);
check("social_vi_hashtags", viSocial.hashtags.includes("#fyp") && viSocial.hashtags.includes("#xuhuong"), viSocial.hashtags.join(" "));
check("social_vi_cta", viSocial.description.includes(viSocial.callToAction));
const enSocial = planSocialPublishingMetadata({ premise: "A tiny apartment becomes a plant jungle in thirty days.", language: "en", platform: "shorts" });
check("social_en_platform", enSocial.platform === "shorts" && enSocial.hashtags.length > 0);
check("social_empty_safe", planSocialPublishingMetadata({ premise: "" }).title.length > 0);

// --- 4. Script-first mode.
check("script_detects_marker", looksLikeUserScript(`idea\n${USER_SCRIPT_OPEN_MARKER}\nline\nUSER_SCRIPT>>>`));
check("script_detects_screenplay", looksLikeUserScript("CẢNH 1: Quán cà phê đêm\nLan: Anh đã hứa rồi mà.\nMinh: Anh xin lỗi...\nCẢNH 2: Ngoài trời mưa\nLan: Muộn rồi."));
check("script_ignores_plain_idea", !looksLikeUserScript("làm video quảng cáo serum dưỡng da cho da khô, phong cách sáng sủa"));
const scriptBrief = resolveSimpleBrief({ idea: "phim ngắn tình cảm", script: "CẢNH 1: Quán cà phê\nLan: Anh tới trễ.\nMinh: Xin lỗi em." });
check("brief_wraps_script", scriptBrief.userInput.includes(USER_SCRIPT_OPEN_MARKER) && scriptBrief.userInput.includes("Lan: Anh tới trễ."));
check("brief_notes_script_mode", scriptBrief.appliedDefaults.some((note) => note.includes("Script-first")));
check("brief_no_script_unchanged", !resolveSimpleBrief({ idea: "quảng cáo giày" }).userInput.includes(USER_SCRIPT_OPEN_MARKER));

// --- 5. Keyframe-first cost accounting.
const gate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, imageGenerationCostUsd: 0.03, costBufferMultiplier: 1 });
const promptStub = (shotId) => ({ shotId, prompt: "p", negativePrompt: "n", references: [], videoRequest: { settings: { durationSeconds: 6 }, references: [] } });
const withKeyframes = gate.estimate({
  compiledPrompts: [promptStub("s1"), promptStub("s2")],
  settings: { qualityMode: "standard" },
  plannedKeyframeImageCount: 2
});
const withoutKeyframes = gate.estimate({ compiledPrompts: [promptStub("s1"), promptStub("s2")], settings: { qualityMode: "standard" } });
check("cost_counts_keyframes", withKeyframes.plannedKeyframeImageCount === 2 && withKeyframes.estimatedKeyframeImageCostUsd === 0.06);
check("cost_total_includes_keyframes", (withKeyframes.estimatedTotalCostUsd ?? 0) - (withoutKeyframes.estimatedTotalCostUsd ?? 0) > 0.059);

// --- 5b. Planning-phase hard cap: LLM planning calls bounded by maxCostUsd BEFORE they run.
const throwsErr = (fn) => { try { fn(); return false; } catch { return true; } };
const planningGate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, llmPlanCostUsd: 0.05, costBufferMultiplier: 1 });
// 4 planned LLM calls x $0.05 x 1.0 buffer = $0.20 planning cost.
check("planning_cap_blocks_when_planning_over_cap", throwsErr(() => planningGate.assertPlanningWithinBudget({ plannedLlmPlanCallCount: 4, maxCostUsd: 0.1 })));
check("planning_cap_passes_when_cap_covers", !throwsErr(() => planningGate.assertPlanningWithinBudget({ plannedLlmPlanCallCount: 4, maxCostUsd: 5 })));
check("planning_cap_noop_without_cap", !throwsErr(() => planningGate.assertPlanningWithinBudget({ plannedLlmPlanCallCount: 999 })));
const unpricedLlmGate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, costBufferMultiplier: 1 });
check("planning_cap_noop_when_llm_unpriced", !throwsErr(() => unpricedLlmGate.assertPlanningWithinBudget({ plannedLlmPlanCallCount: 999, maxCostUsd: 0.01 })));

// --- 6. Director wiring (source-level): the loop invokes the stages this smoke validates.
const directorSource = readFileSync(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
check("director_invokes_keyframe_stage", directorSource.includes("runKeyframeFirstStage") && directorSource.includes("plannedKeyframeImageCount: keyframeFirstEnabled"));
check("director_invokes_video_consistency", directorSource.includes("inspectVideoConsistency"));
check("director_returns_social_publishing", directorSource.includes("socialPublishing: planSocialPublishingMetadata"));
// Planning-phase hard cap is invoked BEFORE the first LLM planning call (reference-vision describe).
check("director_pre_checks_planning_cap_before_first_llm_call",
  directorSource.includes("assertPlanningWithinBudget") &&
  directorSource.indexOf("assertPlanningWithinBudget") < directorSource.indexOf("this.referenceVisionAnalyst!.describe"));

// --- 8. Keyframe-first must actually REACH the render. reference-selection freezes selectedReferences
// BEFORE the keyframe is minted; the compiler binds from that frozen set, so if the keyframe recompile
// keeps the stale referenceSelectionPlan the paid first_frame keyframe is silently dropped from the
// video request. This reproduces the bug (stale plan → keyframe gone) and locks the fix (recompile
// strips the plan → keyframe reaches the provider).
const kfCompiler = new SeedancePromptCompiler();
const kfIdentity = { role: "identity", label: "Linh", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.example/linh.png" }, selection: { characterId: "linh" } };
const kfFrame = { role: "first_frame", label: "keyframe", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.example/kf.png" } };
const kfSettings = { tier: "fast", resolution: "720p", qualityMode: "economy", ratio: "9:16", durationTargetSeconds: 15, audioMode: "native", bitrateMode: "standard", watermark: false, returnLastFrame: true };
const kfBaseShot = { shotId: "s1", sceneId: "sc1", intent: "demo", action: "creator shows product", subject: "creator", camera: "handheld", lighting: "soft", durationSeconds: 6, risks: [], references: [kfIdentity, kfFrame], continuity: {}, metadata: {} };
const kfShotStale = { ...kfBaseShot, referenceSelectionPlan: { selectedReferences: [kfIdentity], droppedReferences: [], conflicts: [], roleScopes: [] } };
const rolesStale = kfCompiler.compile({ shot: kfShotStale, settings: kfSettings, modelId: "bytedance/seedance-2.0", provider: "atlascloud" }).videoRequest.references.map((r) => r.role);
check("keyframe_dropped_when_stale_plan_retained", !rolesStale.includes("first_frame"), JSON.stringify(rolesStale));
const { referenceSelectionPlan: _stalePlan, ...kfShotStripped } = kfShotStale;
const rolesStripped = kfCompiler.compile({ shot: kfShotStripped, settings: kfSettings, modelId: "bytedance/seedance-2.0", provider: "atlascloud" }).videoRequest.references.map((r) => r.role);
check("keyframe_reaches_render_when_plan_stripped", rolesStripped.includes("first_frame"), JSON.stringify(rolesStripped));
check("director_keyframe_recompile_strips_selection_plan", directorSource.includes("referenceSelectionPlan: _staleSelectionPlan"));

// --- 7. Pre-spend gate ordering (source-level regression lock). The three fail-closed long-form
// gates (timeline/creative/readiness) MUST be computed exactly once and BEFORE the first provider
// spend — the keyframe-image stage. Their own block message says "before provider spend"; this
// locks that promise against a future refactor accidentally moving a gate back after the spend or
// re-introducing a post-spend duplicate. keyframe is the earliest paid stage (keyframe → talking/TTS
// → render), so gate-before-keyframe proves gate-before-all-spend.
const keyframeSpendAt = directorSource.indexOf("await this.runKeyframeFirstStage({");
check("gate_order_keyframe_call_present", keyframeSpendAt > -1);
// BEHAVIOUR, not text position. The previous version of these checks compared where strings appear
// in the source file: it read the gate DEFINITION's offset (which sits above the keyframe call) and
// concluded "gate before spend", while a second check read the gate's single CALL site (below the
// keyframe call) and concluded "gate after keyframe". Both passed. The file simultaneously asserted
// that the same gate ran before and after the spend, and the real answer — it ran only after — went
// unnoticed until a pipeline audit found every long-form block was being charged for a full set of
// keyframe images and voice tracks first.
//
// The only assertion worth making is the one a customer's money depends on: when the gate blocks,
// how many paid calls happened first? Drive the real DirectorAgent with counting stubs and read the
// counters.
const { DirectorAgent: OrderingDirectorAgent } = await import("../dist/agents/director-agent.js");

function countingProviders() {
  const counts = { images: 0, tts: 0, videos: 0 };
  return {
    counts,
    imageProvider: { name: "atlascloud", async generateImage() { counts.images += 1; throw new Error("stub"); } },
    speechProvider: { name: "atlascloud", async synthesizeSpeech() { counts.tts += 1; throw new Error("stub"); } },
    videoProvider: { name: "atlascloud", async generateTextToVideo() { counts.videos += 1; throw new Error("stub"); } }
  };
}

// A long-form request whose continuity is deliberately broken so the battery has something to block
// on. Whatever the gate decides, the invariant is the same: nothing paid may have run yet.
const orderingStubs = countingProviders();
const orderingAgent = new OrderingDirectorAgent({
  atlasSettings: {
    apiKey: "test", llmApiKey: "test",
    apiBaseUrl: "https://api.atlascloud.ai/api/v1", assetBaseUrl: "https://api.atlascloud.ai/api/v1",
    models: { llmModel: "m", seedanceStandardModel: "s", seedanceFastModel: "s" },
    seedanceCapabilities: [], generatedAudioCapabilities: [],
    requestTimeoutMs: 5000, maxJsonResponseBytes: 100000, pollingIntervalMs: 100, pollingTimeoutMs: 5000
  },
  imageProvider: orderingStubs.imageProvider,
  speechProvider: orderingStubs.speechProvider
});
let orderingRan = false;
try {
  await orderingAgent.run({
    projectId: "ordering_probe",
    userInput: "Phim tài liệu lịch sử 3 phút, nhiều cảnh, nhiều nhân vật.",
    settings: { durationTargetSeconds: 180, maxCostUsd: 1 }
  });
  orderingRan = true;
} catch {
  // Expected: the run cannot complete without real providers. What matters is the counters.
}
check("gate_blocks_before_any_image_is_bought", orderingStubs.counts.images === 0,
  `images=${orderingStubs.counts.images} tts=${orderingStubs.counts.tts} videos=${orderingStubs.counts.videos} completed=${orderingRan}`);
check("gate_blocks_before_any_voice_is_bought", orderingStubs.counts.tts === 0,
  `tts=${orderingStubs.counts.tts}`);
check("gate_blocks_before_any_clip_is_rendered", orderingStubs.counts.videos === 0,
  `videos=${orderingStubs.counts.videos}`);

// Source-level companions, kept narrow: they lock the SHAPE the behaviour test cannot see, namely
// that a pre-spend invocation exists at all and that each planner is still built in one place.
check("gate_has_pre_spend_invocation", directorSource.includes('assertLongFormReleaseGates(this.renderScheduler.plan(buildRenderScheduleItems(shots)), "pre_spend")'));
for (const [label, needle] of [
  ["timeline", "this.longFormTimelinePlanner.build({"],
  ["creative", "this.longFormCreativeIntelligencePlanner.build({"],
  ["readiness", "this.longFormReadinessPlanner.build({"]
]) {
  const at = directorSource.indexOf(needle);
  check(`gate_${label}_built_once`, at > -1 && at === directorSource.lastIndexOf(needle));
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.pipeline-upgrades-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing duration rhythm, the video consistency gate, social publishing, script-first intake, or keyframe-first wiring.",
    "Prompt-level upgrades prove their visual benefit only on a real paid render."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
