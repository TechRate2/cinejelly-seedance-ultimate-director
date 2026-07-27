/**
 * No-spend smoke for the keyframe-first layer.
 * Proves: per-shot keyframe image requests carry the opening-frame prompt, DNA, refs,
 * ratio, and seed; successful keyframes bind as primary first_frame references (flipping
 * the compiler into image-to-video); failed keyframes fail open; and the Atlas provider
 * exposes image-generation support gating without any network call.
 * No network, no provider calls, no spend.
 */

import { bindKeyframesToShots, planKeyframeRequests, narrowShotReferencesToCast, splitCharacterIdentities } from "../dist/core/keyframe-first-planner.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

const identityRef = {
  role: "identity",
  label: "kol_face",
  providerReference: { kind: "image", uri: "https://example.com/refs/kol.jpg", label: "kol_face", role: "identity" },
  priority: "primary"
};
const shots = [
  {
    shotId: "shot_kf_1",
    durationSeconds: 8,
    intent: "Open on the creator holding the serum",
    subject: "A creator holding a small serum bottle toward the lens",
    action: "She lifts the bottle into the light and smiles",
    camera: "Handheld phone close-up",
    lighting: "Soft window key",
    references: [identityRef],
    continuity: {},
    risks: [],
    metadata: { shortViralNiche: "beauty_skincare", shortViralCreativeMode: "ugc_review" }
  },
  {
    shotId: "shot_kf_2",
    durationSeconds: 8,
    intent: "Product texture proof",
    subject: "Serum dropper releasing one drop onto the back of a hand",
    action: "The drop lands and glides across skin",
    camera: "Macro close-up",
    lighting: "Directional soft light",
    references: [],
    continuity: {},
    risks: []
  }
];

// 1. Request planning: prompt content, refs, settings.
const plans = planKeyframeRequests({
  shots,
  provider: "atlascloud",
  imageModelId: "seedream-smoke",
  settings: { ...DEFAULT_SEEDANCE_SETTINGS, ratio: "9:16", seed: 77 }
});
check("one_request_per_shot", plans.length === 2);
const first = plans[0].request;
check("prompt_is_opening_frame", first.prompt.includes("OPENING frame") && first.prompt.includes(shots[0].subject));
check("prompt_carries_niche_dna", first.prompt.includes("Niche DNA (beauty_skincare)"));
check("identity_ref_passes_through", first.references.some((ref) => ref.role === "identity"));
// Register-aware capture authenticity: a UGC shot's keyframe reads as a real phone photo WITH
// deliberate human imperfection (research: named device + asymmetry/stray-hair beats "realistic");
// a cinematic shot's keyframe reads as a cinema frame grab, never a phone snap; neutral stays neutral.
check("ugc_keyframe_phone_capture_with_imperfection", first.prompt.includes("arm's length") && first.prompt.includes("stray hairs") && !first.prompt.includes("cinema camera"));
check("neutral_keyframe_stays_neutral", plans[1].request.prompt.includes("Real lens optics") && !plans[1].request.prompt.includes("stray hairs"));
const cinematicPlan = planKeyframeRequests({
  shots: [{ ...shots[1], shotId: "shot_kf_cine", metadata: { shortViralCreativeMode: "cinematic" } }],
  provider: "atlascloud", imageModelId: "seedream-smoke", settings: { ...DEFAULT_SEEDANCE_SETTINGS }
});
check("cinematic_keyframe_reads_as_cinema_frame", cinematicPlan[0].request.prompt.includes("frame grab from a cinema camera") && !cinematicPlan[0].request.prompt.includes("unedited phone photo"));

// ENVIRONMENT FIDELITY (paid-acceptance forensics): the customer's setting lives in
// continuity.environment and MUST reach the keyframe image prompt as a strong positive Setting line
// — before the fix it was stranded (bedroom brief rendered as a grey studio sweep).
const envShot = {
  ...shots[0], shotId: "shot_kf_env",
  continuity: { environment: "sunlit bedroom by a window, unmade bed, morning window light" }
};
const envPlan = planKeyframeRequests({ shots: [envShot], provider: "atlascloud", imageModelId: "seedream-smoke", settings: { ...DEFAULT_SEEDANCE_SETTINGS, ratio: "9:16" } });
check("keyframe_binds_environment_as_setting",
  envPlan[0].request.prompt.includes("Setting:") &&
  envPlan[0].request.prompt.includes("sunlit bedroom by a window") &&
  /never a plain studio backdrop/i.test(envPlan[0].request.prompt));
check("keyframe_without_environment_omits_setting", !plans[0].request.prompt.includes("Setting:"));

// ANTI-STUDIO ANCHOR: the identity portrait (attached as the identity ref on every shot) must no
// longer seed the word "studio" — reference-to-image copied that backdrop across the whole video.
const { planCastPortraitRequests: planPortraits } = await import("../dist/core/keyframe-first-planner.js");
const antiStudioPortraits = planPortraits({
  cast: [{ characterId: "linh", name: "Linh", description: "Vietnamese woman", staticFeatures: "oval face", isPrimary: true }],
  provider: "atlascloud", imageModelId: "seedream-smoke", seed: 3
});
check("portrait_no_longer_seeds_studio", !antiStudioPortraits[0].request.prompt.includes("studio light") && antiStudioPortraits[0].request.prompt.includes("identity-isolation reference only"));

// VERBATIM IDENTITY LOCK: the same character's exact appearance sheet is restated word-for-word in
// EVERY shot's keyframe (the fix for face/wardrobe drift by shot 3-4 seen in the real render).
const appearanceSheet = "Vietnamese woman, late 20s, oval face, straight black hair with a centre part, cream ribbed knit sweater";
const castMap = new Map([["linh", appearanceSheet]]);
const identityRefShared = { role: "identity", label: "Linh", providerReference: { kind: "image", uri: "https://cdn.example.com/linh.png", role: "identity", label: "Linh" } };
const lockShot = (id) => ({ shotId: id, sceneId: "sc1", intent: "demo", subject: "the creator", action: `beat ${id}`, camera: "handheld phone", lighting: "window", durationSeconds: 6, risks: [], references: [identityRefShared], continuity: { identity: "Linh" }, metadata: {} });
const lockPlans = planKeyframeRequests({ shots: [lockShot("k1"), lockShot("k2")], provider: "atlascloud", imageModelId: "seedream-smoke", settings: { ...DEFAULT_SEEDANCE_SETTINGS }, castAppearance: castMap });
check("identity_lock_present_in_keyframe", lockPlans[0].request.prompt.includes("Identity lock") && lockPlans[0].request.prompt.includes(appearanceSheet));
check("identity_lock_verbatim_identical_across_shots",
  lockPlans[0].request.prompt.includes(appearanceSheet) && lockPlans[1].request.prompt.includes(appearanceSheet));
// No cast map (uploaded-face flow) -> fail-open to the generic clause, no lock line.
const noLock = planKeyframeRequests({ shots: [lockShot("k3")], provider: "atlascloud", imageModelId: "seedream-smoke", settings: { ...DEFAULT_SEEDANCE_SETTINGS } });
check("identity_lock_fail_open_without_cast", !noLock[0].request.prompt.includes("Identity lock"));
// Multi-character shot restates BOTH sheets.
const twoCast = new Map([["linh", appearanceSheet], ["mai", "Vietnamese woman, 30s, round face, shoulder bob, navy blazer"]]);
const twoShot = { ...lockShot("k4"), continuity: { identity: "Linh, Mai" } };
const twoPlan = planKeyframeRequests({ shots: [twoShot], provider: "atlascloud", imageModelId: "seedream-smoke", settings: { ...DEFAULT_SEEDANCE_SETTINGS }, castAppearance: twoCast });
check("identity_lock_covers_all_characters_in_multi_shot", twoPlan[0].request.prompt.includes("cream ribbed knit sweater") && twoPlan[0].request.prompt.includes("navy blazer"));

// AVATAR prompt carries the environment too (OmniHuman keeps the room while animating).
const { buildAvatarPrompt } = await import("../dist/core/avatar-shot-planner.js");
check("avatar_prompt_carries_environment", buildAvatarPrompt(envShot).includes("Set inside:") && buildAvatarPrompt(envShot).includes("sunlit bedroom"));
check("avatar_prompt_without_environment_omits_it", !buildAvatarPrompt(shots[1]).includes("Set inside:"));
// Avatar hint carries the beat's emotional turn + register performance (quality scan): the thin
// avatar hint replaces the rich compiled prompt on talking shots, so these must ride along.
const perfShot = { ...envShot, emotionalTurn: "tò mò -> thích thú", styleDna: { register: "natural_phone_kol", performance: "spontaneous, filler words, small restless movements" } };
check("avatar_prompt_carries_emotional_turn", buildAvatarPrompt(perfShot).includes("emotional turn") && buildAvatarPrompt(perfShot).includes("tò mò"));
check("avatar_prompt_carries_performance", buildAvatarPrompt(perfShot).includes("Performance:") && buildAvatarPrompt(perfShot).includes("filler words"));
// Full visual DNA (optics/lighting/palette/motion) + avoid ride into the avatar hint, not just performance.
const dnaShot = { ...envShot, styleDna: { register: "natural_phone_kol", optics: "grainy 26mm phone lens", lighting: "window daylight", palette: "muted warm tones", motion: "handheld micro-shake", avoid: ["studio gloss", "beauty filter"] } };
const dnaPrompt = buildAvatarPrompt(dnaShot);
check("avatar_prompt_carries_full_look", dnaPrompt.includes("Look:") && dnaPrompt.includes("grainy 26mm phone lens") && dnaPrompt.includes("window daylight") && dnaPrompt.includes("handheld micro-shake"));
check("avatar_prompt_carries_avoid", dnaPrompt.includes("Avoid:") && dnaPrompt.includes("beauty filter"));
check("avatar_prompt_ugc_clause_never_truncated", buildAvatarPrompt(dnaShot).startsWith("Natural spontaneous UGC delivery"));

// continuity.identity ARRAY shape must not crash any reader (cross-audit #2): the guardian handled it,
// but splitCharacterIdentities (used by narrowing + ledger) threw on `.trim()`. Both shapes normalize now.
check("split_identities_accepts_array_shape", JSON.stringify(splitCharacterIdentities(["Linh", "Mai"])) === JSON.stringify(["Linh", "Mai"]) && JSON.stringify(splitCharacterIdentities("Linh and Mai")) === JSON.stringify(["Linh", "Mai"]) && splitCharacterIdentities(undefined).length === 0 && splitCharacterIdentities({}).length === 0);
check("ratio_and_seed_propagate", first.settings.ratio === "9:16" && first.settings.seed === 77);
check("negative_prompt_blocks_artifacts", (first.negativePrompt ?? "").includes("warped hands"));
check("metadata_marks_keyframe_first", first.metadata?.keyframeFirst === true && first.metadata?.shotId === "shot_kf_1");
let missingModelRejected = false;
try {
  planKeyframeRequests({ shots, provider: "atlascloud", imageModelId: " ", settings: { ...DEFAULT_SEEDANCE_SETTINGS } });
} catch {
  missingModelRejected = true;
}
check("missing_image_model_rejected", missingModelRejected);

// 2. Binding: success injects primary first_frame; failure fails open.
const prediction = (id, status, urls) => ({
  provider: "atlascloud",
  predictionId: id,
  modelId: "seedream-smoke",
  status,
  outputUrls: urls,
  raw: {},
  submittedAt: new Date(),
  completedAt: new Date(),
  latencyMs: 800
});
const binding = bindKeyframesToShots({
  shots,
  results: [
    { shotId: "shot_kf_1", prediction: prediction("p1", "succeeded", ["https://example.com/frames/kf1.png"]) },
    { shotId: "shot_kf_2", prediction: prediction("p2", "failed", []) }
  ]
});
check("bound_and_skipped_tracked", binding.boundShotIds.includes("shot_kf_1") && binding.skippedShotIds.includes("shot_kf_2"));
const boundShot = binding.shots[0];
check(
  "first_frame_injected_primary",
  boundShot.references[0]?.role === "first_frame" && boundShot.references[0]?.priority === "primary"
);
check("identity_ref_retained", boundShot.references.some((ref) => ref.role === "identity"));
check("failed_shot_unchanged", binding.shots[1].references.length === 0);
check("keyframe_metadata_recorded", boundShot.metadata?.keyframePredictionId === "p1");
const videoOnlyBinding = bindKeyframesToShots({
  shots: [shots[1]],
  results: [{ shotId: "shot_kf_2", prediction: prediction("pv", "succeeded", ["https://example.com/clips/only-video.mp4"]) }]
});
check("video_only_output_skipped", videoOnlyBinding.skippedShotIds.includes("shot_kf_2") && videoOnlyBinding.shots[0].references.length === 0);
const duplicateBinding = bindKeyframesToShots({
  shots: [shots[0]],
  results: [
    { shotId: "shot_kf_1", prediction: prediction("pd1", "succeeded", ["https://example.com/frames/first.png"]) },
    { shotId: "shot_kf_1", prediction: prediction("pd2", "failed", []) }
  ]
});
check("duplicate_results_prefer_success", duplicateBinding.boundShotIds.includes("shot_kf_1"));

// 3. Compiler flips to image-to-video once the keyframe is bound.
const compiler = new SeedancePromptCompiler();
const compiled = compiler.compile({
  shot: boundShot,
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("compiler_mode_image_to_video", compiled.videoRequest.mode === "image_to_video");
check("compiled_request_carries_keyframe", compiled.videoRequest.references.some((ref) => ref.role === "first_frame"));

// 4. Cast portraits: generated only for members without an identity image; binding
//    fills identityReferenceUri; existing/failed members stay unchanged (fail-open).
const { planCastPortraitRequests, bindPortraitsToCast } = await import("../dist/core/keyframe-first-planner.js");
const cast = [
  { characterId: "lead", name: "Lan", description: "mid-20s woman, calm steel", staticFeatures: "oval face, long black hair, light build" },
  { characterId: "villain", name: "Madam Vu", description: "elegant matriarch", identityReferenceUri: "https://example.com/refs/vu.jpg" }
];
const portraitPlans = planCastPortraitRequests({ cast, provider: "atlascloud", imageModelId: "seedream-smoke", seed: 9 });
check("portrait_only_for_missing_identity", portraitPlans.length === 1 && portraitPlans[0].characterId === "lead");
check("portrait_prompt_uses_static_features", portraitPlans[0].request.prompt.includes("oval face, long black hair"));
check("portrait_marked_as_source_of_truth", portraitPlans[0].request.prompt.includes("single source of truth"));
const boundCast = bindPortraitsToCast({
  cast,
  results: [{ characterId: "lead", prediction: prediction("pp1", "succeeded", ["https://example.com/portraits/lan.png"]) }]
});
check("portrait_binds_identity_uri", boundCast[0].identityReferenceUri === "https://example.com/portraits/lan.png");
check("existing_identity_untouched", boundCast[1].identityReferenceUri === "https://example.com/refs/vu.jpg");
const failedBind = bindPortraitsToCast({
  cast: [cast[0]],
  results: [{ characterId: "lead", prediction: prediction("pp2", "failed", []) }]
});
check("failed_portrait_fails_open", failedBind[0].identityReferenceUri === undefined);

// 5. Shot grammar: compiler emits framing lock only when metadata carries valid enums.
const grammarShot = {
  ...shots[0],
  shotId: "shot_kf_grammar",
  metadata: { shotType: "close_up", shotAngle: "low_angle", shotPosition: "front_view" }
};
const grammarCompiled = compiler.compile({
  shot: grammarShot,
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("grammar_section_emitted", grammarCompiled.prompt.includes("Framing grammar (hold exactly):") && grammarCompiled.prompt.includes("below the subject looking up"));
const noGrammarCompiled = compiler.compile({
  shot: shots[1],
  settings: { ...DEFAULT_SEEDANCE_SETTINGS },
  modelId: "seedance-2-0-smoke",
  provider: "atlascloud"
});
check("grammar_absent_without_metadata", !noGrammarCompiled.prompt.includes("Framing grammar"));

// --- Multi-character reference narrowing (audit HIGH-E): a beat cast as one character must not carry
// every uploaded face into its keyframe/render (which blends them). Fail-safe when ambiguous.
const idRef = (name) => ({ role: "identity", label: name, priority: "primary", providerReference: { kind: "image", uri: `https://cdn.example/${name}.png` }, selection: { characterId: name.toLowerCase() } });
const productRef = { role: "product", label: "Serum", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.example/serum.png" } };
const castShot = (identity, references) => ({ shotId: "s1", sceneId: "sc1", intent: "demo", action: "a", subject: "creator", camera: "handheld", lighting: "soft", durationSeconds: 6, risks: [], references, continuity: identity ? { identity } : {}, metadata: {} });
const rolesOf = (shot) => shot.references.map((r) => `${r.role}:${r.label}`);

// Two uploaded faces, beat cast as "Linh" -> only Linh's face kept, product kept.
const narrowed = narrowShotReferencesToCast(castShot("Linh", [idRef("Linh"), idRef("Mai"), productRef]));
check("narrow_multiface_keeps_only_cast_identity", JSON.stringify(rolesOf(narrowed).sort()) === JSON.stringify(["identity:Linh", "product:Serum"].sort()), rolesOf(narrowed).join(","));
// Beat cast as "Linh, Mai" -> both faces kept.
const narrowedBoth = narrowShotReferencesToCast(castShot("Linh, Mai", [idRef("Linh"), idRef("Mai"), productRef]));
check("narrow_multicast_keeps_all_named", narrowedBoth.references.filter((r) => r.role === "identity").length === 2);
// Single identity ref -> untouched (nothing to disambiguate).
const single = narrowShotReferencesToCast(castShot("Linh", [idRef("Linh"), productRef]));
check("narrow_singleface_untouched", single.references.length === 2);
// Cast label matches no uploaded face -> keep ALL identities (never drop on a guess).
const noMatch = narrowShotReferencesToCast(castShot("young woman", [idRef("Linh"), idRef("Mai"), productRef]));
check("narrow_no_match_keeps_all_failsafe", noMatch.references.filter((r) => r.role === "identity").length === 2);
// No cast identity at all -> untouched.
const noCast = narrowShotReferencesToCast(castShot(undefined, [idRef("Linh"), idRef("Mai")]));
check("narrow_no_cast_untouched", noCast.references.length === 2);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.keyframe-first-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing keyframe-first-planner.ts, the ImageProvider contract, or the Atlas image payload.",
    "Live keyframe generation requires ATLASCLOUD_IMAGE_MODEL plus explicit operator spend confirmation; planning stays no-spend."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
