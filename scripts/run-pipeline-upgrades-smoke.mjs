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

// --- 6. Director wiring (source-level): the loop invokes the stages this smoke validates.
const directorSource = readFileSync(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
check("director_invokes_keyframe_stage", directorSource.includes("runKeyframeFirstStage") && directorSource.includes("plannedKeyframeImageCount: keyframeFirstEnabled"));
check("director_invokes_video_consistency", directorSource.includes("inspectVideoConsistency"));
check("director_returns_social_publishing", directorSource.includes("socialPublishing: planSocialPublishingMetadata"));

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
