#!/usr/bin/env node

/**
 * Input × Duration matrix smoke (NO SPEND).
 *
 * Drives the REAL pipeline across every realistic way a user supplies input, at every duration band
 * and language, and asserts the whole logic processes inputs and produces outputs correctly:
 *   Layer 1 (intake):  ShortPipelinePlanner.buildPlan + buildShortPipelineRenderHandoff
 *   Layer 2 (creative): StoryArchitect -> ShotPlanner -> SeedancePromptCompiler (+ character anchors)
 *
 * Pure planning + fake LLM only — no network, no Atlas, no render, no money.
 * Assertions are CONCRETE (exact expected values), not existence checks, so a regression fails loudly.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { ShortPipelinePlanner } = await import(`${base}/core/short-pipeline-planner.js`);
const { buildShortPipelineRenderHandoff } = await import(`${base}/core/short-pipeline-render-handoff.js`);
const { StoryArchitect } = await import(`${base}/agents/story-architect.js`);
const { ShotPlanner } = await import(`${base}/core/shot-planner.js`);
const { SeedancePromptCompiler } = await import(`${base}/prompt_compiler/prompt-compiler.js`);
const { planCharacterAnchors } = await import(`${base}/core/keyframe-first-planner.js`);

const gen = new Date("2026-06-19T00:00:00.000Z");
const planner = new ShortPipelinePlanner();
const compiler = new SeedancePromptCompiler();
const results = [];
let reqCounter = 0;
const check = (name, ok, detail) => { results.push({ name, status: ok ? "pass" : "fail", detail }); };
const mref = (role, kind, uri, label, priority) =>
  ({ role, kind, uri, label, rightsStatus: "operator_approved", priority: priority || "primary" });
const buildPlan = (userPrompt, extra) =>
  planner.buildPlan({ projectId: "input_matrix", requestId: `r${reqCounter++}`, generatedAt: gen, userPrompt, ...(extra || {}) });

const CLIP_MIN = 4, CLIP_MAX = 15, SHORT_MAX = 60;

// ------------------------------------------------------------------
// LAYER 1a — Duration parsing across every phrasing, language, and edge, in the real intake flow.
// Expected values are the clamped intent seconds (range [15,480]).
// ------------------------------------------------------------------
const durationCases = [
  // English integer forms
  ["Make a 30-second TikTok product ad, shop now", 30],
  ["Make a 60-second TikTok ad", 60],
  ["Make a 90-second product story", 90],
  ["Make an 8-minute branded story film", 480],
  ["Make a 5-min explainer for busy buyers", 300],
  ["Make a 2-minute founder documentary", 120],
  ["Make a 2 minute founder documentary", 120],
  ["Make a 45s UGC review", 45],
  ["Make a 120s clip", 120],
  ["Make a 3 minute recap", 180],
  ["Make a fun TikTok about my coffee brand", 30], // no duration -> default
  // English word-form
  ["Make an eight minute short film", 480],
  ["Make a two minutes ad", 120],
  ["Make a ninety second clip", 90],
  ["Make a half minute clip", 30],
  ["Make a minute and a half clip", 90],
  ["Make a thirty second ad", 30],
  // Vietnamese (the product's primary users)
  ["Tạo video 2 phút giới thiệu nhà sáng lập", 120],
  ["Làm video 90 giây review sản phẩm", 90],
  ["Làm clip 8 phút phim thương hiệu", 480],
  ["Làm video 45 giây", 45],
  ["Make a 60 giây TikTok ad", 60], // mixed EN + VI
  // Chinese
  ["制作一个3分钟的品牌故事片", 180],
  ["制作60秒的广告", 60],
  ["制作一个90秒短视频", 90],
  // Other major languages (digit + native unit)
  ["Haz un video de 2 minutos", 120], // Spanish
  ["Faça um vídeo de 30 segundos", 30], // Portuguese
  ["Fais une vidéo de 2 minutes", 120], // French
  ["Mach ein 30 Sekunden Video", 30], // German
  ["buat video 2 menit", 120], // Indonesian
  ["2分の動画を作って", 120], // Japanese
  ["2분 영상 만들어줘", 120], // Korean
  ["ทำวิดีโอ 30 วินาที", 30], // Thai
  ["сделай видео 2 минуты", 120], // Russian
  ["lam video 2 phut", 120], // Vietnamese, no diacritics
  // False-positive guards: partial words must NOT be read as durations
  ["make a 2 segment product ad", 30],
  ["a video with 2 minimum shots", 30],
  // Decimals
  ["Make a 1.5 min ad for shoes", 90],
  ["Make a 2.5 minutes story", 150],
  ["Make a 0.5 min teaser", 30],
  // Compound clock
  ["Make a 1m30s clip", 90],
  ["Make a 1 minute 30 seconds clip", 90],
  ["Make a 2 minute 15 second promo", 135],
  // Conflicting signals — the user's LAST-mentioned duration wins
  ["Make a 2 minute ad... no make it 30 seconds", 30],
  ["Make a 30 second... actually 2 minutes", 120],
  ["Give me a second — make a 30 second TikTok ad", 30],
];
for (const [prompt, expect] of durationCases) {
  let got;
  try { got = buildPlan(prompt).intent?.targetDurationSeconds; } catch (e) { got = "THROW:" + String(e.message).slice(0, 30); }
  check(`duration :: ${JSON.stringify(prompt).slice(0, 46)}`, got === expect, `expected ${expect}s, got ${got}`);
}

// Explicit targetDurationSeconds field at every band edge + band routing + handoff carry-through
for (const d of [15, 27, 45, 60, 90, 120, 180, 300, 480]) {
  const plan = buildPlan("Make a branded video", { targetDurationSeconds: d });
  const hj = buildShortPipelineRenderHandoff({ plan, includeGeneratedAudioIntents: true });
  check(`duration-field=${d} -> intent`, plan.intent?.targetDurationSeconds === d, `got ${plan.intent?.targetDurationSeconds}`);
  check(`duration-field=${d} -> handoff carries same`, hj.request?.settings?.durationTargetSeconds === d, `handoff ${hj.request?.settings?.durationTargetSeconds}`);
  const isLong = plan.videoPipePlan?.selectedMode === "production_bible";
  check(`duration=${d} band routing`, d > SHORT_MAX ? isLong : !isLong, `mode=${plan.videoPipePlan?.selectedMode}`);
}
for (const [d, exp] of [[5, 15], [8, 15], [600, 480], [1000, 480]]) {
  check(`duration clamp ${d} -> ${exp}`, buildPlan("Make a video", { targetDurationSeconds: d }).intent?.targetDurationSeconds === exp, `got ${buildPlan("Make a video", { targetDurationSeconds: d }).intent?.targetDurationSeconds}`);
}

// ------------------------------------------------------------------
// LAYER 1b — Platform inference + EXACT aspect ratio (linkedin -> 16:9, others -> 9:16)
// ------------------------------------------------------------------
const platformCases = [
  { prompt: "Make a 20 second TikTok ad", platform: "tiktok", aspect: "9:16" },
  { prompt: "Make a 20 second Instagram Reels beauty ad", platform: "instagram_reels", aspect: "9:16" },
  { prompt: "Make a 60 second YouTube Shorts ad", platform: "youtube_shorts", aspect: "9:16" },
  { prompt: "Make a 30 second LinkedIn B2B explainer", platform: "linkedin", aspect: "16:9" },
  { prompt: "Make a 18 second Douyin review", platform: "douyin", aspect: "9:16" },
];
for (const c of platformCases) {
  const plan = buildPlan(c.prompt);
  check(`platform :: ${c.platform}`, plan.intent?.platform === c.platform, `got ${plan.intent?.platform}`);
  check(`platform :: ${c.platform} aspect == ${c.aspect}`, plan.intent?.aspectRatio === c.aspect, `got ${plan.intent?.aspectRatio}`);
}

// ------------------------------------------------------------------
// LAYER 1c — Reference handling: classification, product-not-dropped, private blocked, mode routing
// ------------------------------------------------------------------
const kolProduct = buildPlan("28 second TikTok UGC serum proof with my KOL, product pack, and bathroom background", {
  targetDurationSeconds: 28,
  mediaReferences: [
    mref("kol", "image", "asset://x/kol", "KOL"),
    mref("product", "image", "asset://x/prod", "Product"),
    mref("background", "image", "asset://x/bg", "Background", "supporting"),
  ],
});
const roleStatus = Object.fromEntries((kolProduct.mediaReferencePlan || []).map((r) => [r.promptRole, r.status]));
check("refs: KOL -> identity ready", roleStatus.identity === "ready", JSON.stringify(roleStatus));
check("refs: product present + ready (not dropped)", roleStatus.product === "ready", JSON.stringify(roleStatus));
check("refs: background -> environment ready", roleStatus.environment === "ready", JSON.stringify(roleStatus));
check("refs: all three reach provider handoff", (kolProduct.mediaReferencePlan || []).filter((r) => r.includeInProviderHandoff).length >= 3,
  `handoffCount=${(kolProduct.mediaReferencePlan || []).filter((r) => r.includeInProviderHandoff).length}`);
check("refs: KOL+product routes product_kol_ugc pipe", kolProduct.videoPipePlan?.selectedMode === "product_kol_ugc", `mode=${kolProduct.videoPipePlan?.selectedMode}`);

const privatePlan = buildPlan("24s remake using my references", {
  targetDurationSeconds: 24,
  mediaReferences: [mref("kol", "image", "https://192.168.1.10/k.png", "Private KOL"), mref("product", "image", "https://10.0.0.5/p.png", "Private product")],
});
check("refs: private/internal blocked before handoff",
  (privatePlan.mediaReferencePlan || []).length > 0 && (privatePlan.mediaReferencePlan || []).every((r) => r.status === "blocked" && r.includeInProviderHandoff === false),
  JSON.stringify((privatePlan.mediaReferencePlan || []).map((r) => `${r.promptRole}:${r.status}`)));

// Clean-HTTPS operator-approved references: ready + hashed
const cleanHttps = buildPlan("28s UGC with clean HTTPS refs", {
  targetDurationSeconds: 28,
  mediaReferences: [mref("kol", "image", "https://cdn.example.test/kol.png", "KOL"), mref("product", "image", "https://cdn.example.test/prod.png", "Product")],
});
check("refs: clean-HTTPS approved -> ready + clean_https_hashed + handoff",
  (cleanHttps.mediaReferencePlan || []).length === 2 && (cleanHttps.mediaReferencePlan || []).every((r) => r.status === "ready" && r.uriPolicy === "clean_https_hashed" && r.includeInProviderHandoff === true),
  JSON.stringify((cleanHttps.mediaReferencePlan || []).map((r) => `${r.promptRole}:${r.status}:${r.uriPolicy}`)));

// Video-remake routing + source-video classification
const remake = buildPlan("Create a 24 second Video Remake from my approved reference; keep rhythm but replace KOL, product, claims", {
  targetDurationSeconds: 24,
  mediaReferences: [mref("kol", "image", "asset://x/rk", "Remake KOL"), mref("product", "image", "asset://x/rp", "Remake product"), mref("source_video", "video", "asset://x/src", "Source video", "supporting")],
});
check("refs: source_video classified", (remake.mediaReferencePlan || []).some((r) => r.promptRole === "source_video_structure"), JSON.stringify((remake.mediaReferencePlan || []).map((r) => r.promptRole)));
check("refs: video-remake routes video_remake pipe", remake.videoPipePlan?.selectedMode === "video_remake", `mode=${remake.videoPipePlan?.selectedMode}`);

// Short-mode routing: single-clip smart_short for <=15s idea, storyboard for a 30s idea
check("routing: 12s idea -> smart_short", buildPlan("Make a 12 second funny productivity micro-story", { targetDurationSeconds: 12 }).videoPipePlan?.selectedMode === "smart_short",
  `mode=${buildPlan("Make a 12 second story", { targetDurationSeconds: 12 }).videoPipePlan?.selectedMode}`);
check("routing: 30s idea -> storyboard_multishot", buildPlan("Make a 30 second branded video", { targetDurationSeconds: 30 }).videoPipePlan?.selectedMode === "storyboard_multishot",
  `mode=${buildPlan("Make a 30 second branded video", { targetDurationSeconds: 30 }).videoPipePlan?.selectedMode}`);

// Forbidden brand claim must BLOCK — via inventory AND via raw prompt only
const blockedInv = buildPlan("Make a UGC ad", { product: { productUrl: "https://shop.example.com/p", snapshot: { productTitle: "Serum", claims: ["cures acne overnight"] } }, brandKit: { brandId: "b", brandName: "B", forbiddenClaims: ["cures acne overnight"] } });
check("policy: forbidden claim (inventory) blocks", blockedInv.status === "blocked", `status=${blockedInv.status}`);
const blockedRaw = buildPlan("Make a fun TikTok about my detox tea that melts fat overnight", { brandKit: { brandId: "b", brandName: "B", forbiddenClaims: ["melts fat overnight"] } });
check("policy: forbidden claim (raw prompt only) blocks", blockedRaw.status === "blocked", `status=${blockedRaw.status}`);

// ------------------------------------------------------------------
// LAYER 1d — Audio modes: EXACT input->output mapping (disable synonyms must disable, not enable)
// ------------------------------------------------------------------
const audioExpect = [["off", "none"], ["none", "none"], ["muted", "none"], ["silent", "none"], ["voiceover", "hybrid"], ["hybrid", "hybrid"], ["native", "native"]];
for (const [mode, expect] of audioExpect) {
  const plan = buildPlan("18 second product review with narration", { targetDurationSeconds: 18, audio: { mode } });
  const hj = buildShortPipelineRenderHandoff({ plan, includeGeneratedAudioIntents: true, audio: { mode } });
  check(`audio: '${mode}' -> handoff audioMode '${expect}'`, hj.request?.settings?.audioMode === expect, `got ${hj.request?.settings?.audioMode}`);
}

// ------------------------------------------------------------------
// LAYER 2 — Deep creative: StoryArchitect -> ShotPlanner -> compiler, at every duration + quality
// ------------------------------------------------------------------
function makeBeat(n, total, opts) {
  const beat = { beatId: "b" + n, purpose: n === 1 ? "hook" : n === total ? "payoff" : "proof",
    action: "the founder demonstrates proof point " + n + " with the product", subject: "the founder",
    camera: "medium handheld", lighting: "soft daylight", durationSeconds: 15, identity: "the founder", risks: [] };
  if (opts && opts.spoken) beat.spokenLine = "This is scripted line " + n + ", kept verbatim.";
  if (opts && opts.identities) beat.identity = opts.identities[(n - 1) % opts.identities.length];
  return beat;
}
function fakeLlm(opts) {
  return { name: "fake-matrix-llm",
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() {
      const scenes = [1, 2, 3, 4].map((n) => ({ sceneId: "s" + n, title: "Scene " + n, beats: [makeBeat(n, 4, opts)] }));
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: { premise: "p", targetDurationSeconds: 60, scenes } };
    },
    capabilities() { return []; } };
}
const REQUIRED_PROMPT_LAYERS = ["Seedance mode contract:", "Timeline:", "Final-frame contract:"];
const settingsFor = (dur, quality, ratio) => ({ tier: "fast", resolution: "720p", qualityMode: quality, ratio: ratio || "9:16",
  durationTargetSeconds: dur, audioMode: "hybrid", bitrateMode: "standard", watermark: false, returnLastFrame: true });

for (const quality of ["economy", "standard", "high", "ultimate"]) {
  for (const dur of [15, 27, 45, 60, 90, 120, 180, 300, 480]) {
    const settings = settingsFor(dur, quality);
    const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "a founder product story", settings, references: [], metadata: {} });
    const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: {} });
    const tag = `${quality}/${dur}s`;

    const totalSecs = Math.round(shots.reduce((a, s) => a + s.durationSeconds, 0));
    check(`L2 ${tag}: total seconds == target`, Math.abs(totalSecs - dur) <= 2, `total=${totalSecs}`);
    check(`L2 ${tag}: shot count sane`, shots.length >= 1 && shots.length <= Math.ceil(dur / 3.5) + 2, `shots=${shots.length}`);
    // CORE provider invariant: every clip must be within the [4,15]s render window
    const outOfWindow = shots.filter((s) => s.durationSeconds < CLIP_MIN - 0.01 || s.durationSeconds > CLIP_MAX + 0.01);
    check(`L2 ${tag}: every clip within [${CLIP_MIN},${CLIP_MAX}]s`, outOfWindow.length === 0,
      outOfWindow.length ? `bad=${outOfWindow.map((s) => s.durationSeconds).join(",")}` : "ok");

    const first = shots[0]?.metadata?.videoArcRole, last = shots[shots.length - 1]?.metadata?.videoArcRole;
    check(`L2 ${tag}: opens on hook`, first === "opening_hook" || first === "full_video", `first=${first}`);
    check(`L2 ${tag}: ends on resolve`, last === "closing_resolve" || last === "full_video", `last=${last}`);

    // #3 phasing: within any beat split into multiple clips, exactly one opener + one closer
    const byBeat = new Map();
    for (const s of shots) { if (!byBeat.has(s.beatId)) byBeat.set(s.beatId, []); byBeat.get(s.beatId).push(s); }
    let phasingOk = true, phasingDetail = "";
    for (const [k, group] of byBeat) {
      if (group.length < 2) continue;
      const openers = group.filter((s) => s.timeline?.[0] && !String(s.timeline[0].action).startsWith("Continuation clip")).length;
      const closers = group.filter((s) => s.timeline?.[2] && !String(s.timeline[2].action).includes("is not the beat's end")).length;
      if (openers !== 1 || closers !== 1) { phasingOk = false; phasingDetail = `beat ${k}: openers=${openers} closers=${closers} of ${group.length}`; break; }
    }
    check(`L2 ${tag}: multi-clip beats phased (1 open, 1 settle)`, phasingOk, phasingDetail || "ok");

    const compiled = shots.map((s) => compiler.compile({ shot: s, settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }));
    const missingLayer = compiled.find((c) => REQUIRED_PROMPT_LAYERS.some((l) => !c.prompt.includes(l)));
    check(`L2 ${tag}: every prompt has required layers`, !missingLayer, missingLayer ? `shot ${missingLayer.shotId} missing a layer` : "ok");

    const anchors = planCharacterAnchors(shots);
    check(`L2 ${tag}: invented char -> 1 shared anchor`, anchors.length === 1 && anchors[0].shotIds.length === shots.length, `anchors=${anchors.length} cover=${anchors[0]?.shotIds.length}/${shots.length}`);
  }
}

// Aspect sweep — the opening HOOK frame must be composed for the requested ratio, never a foreign one
for (const ratio of ["9:16", "16:9", "1:1", "adaptive"]) {
  for (const dur of [60, 120]) {
    const settings = settingsFor(dur, "standard", ratio);
    const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "hook story", settings, references: [], metadata: {} });
    const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: {} });
    const hookPrompt = compiler.compile({ shot: shots[0], settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt;
    const foreign = ["9:16", "16:9", "1:1"].filter((r) => r !== ratio).some((r) => hookPrompt.includes(`tight ${r} readable`));
    check(`L2 aspect ${ratio}/${dur}s: no FOREIGN ratio in hook frame`, !foreign, `hookHas9:16=${hookPrompt.includes("tight 9:16")} for ${ratio}`);
    if (ratio !== "adaptive") check(`L2 aspect ${ratio}/${dur}s: hook frame uses ${ratio}`, hookPrompt.includes(`tight ${ratio} readable`), "missing correct ratio");
  }
}

// Multi-character anchors: two DISTINCT invented characters -> two distinct anchors (no merge, no fragment)
{
  const settings = settingsFor(120, "standard");
  const plan = await new StoryArchitect(fakeLlm({ identities: ["the founder", "the skeptical customer"] }), "f").plan({ projectId: "d", userInput: "two-hander", settings, references: [], metadata: {} });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: {} });
  const anchors = planCharacterAnchors(shots);
  const keys = anchors.map((a) => a.characterKey).sort();
  check("L2 multi-char: two distinct characters -> two anchors", anchors.length === 2, `anchors=${anchors.length} keys=${JSON.stringify(keys)}`);
  check("L2 multi-char: keys are the two distinct characters", keys.length === 2 && keys[0] === "founder" && keys[1] === "skeptical customer", `keys=${JSON.stringify(keys)}`);
  const coverage = anchors.reduce((a, x) => a + x.shotIds.length, 0);
  check("L2 multi-char: anchors cover all shots between them", coverage === shots.length, `coverage=${coverage}/${shots.length}`);
}

// #2 negative: a character WITH an uploaded identity reference must NOT be anchored
{
  const settings = settingsFor(120, "standard");
  const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "kol story", settings, references: [], metadata: {} });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: {} }).map((s) => ({
    ...s, references: [{ role: "identity", label: "Anna", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.x/anna.png", role: "identity", label: "Anna" } }],
  }));
  check("L2 anchors: uploaded-face char -> 0 anchors (real face wins)", planCharacterAnchors(shots).length === 0, `anchors=${planCharacterAnchors(shots).length}`);
}

// #6 script-first: each DISTINCT verbatim line preserved byte-exact and appears exactly once
{
  const settings = settingsFor(120, "standard");
  const plan = await new StoryArchitect(fakeLlm({ spoken: true }), "f").plan({ projectId: "d", userInput: "INT. KITCHEN - DAY\nFOUNDER: This is scripted line 1, kept verbatim.", settings, references: [], metadata: { scriptFirst: "true" } });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: {} });
  const promptsBlob = shots.map((s) => compiler.compile({ shot: s, settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt).join("\n");
  const lines = plan.scenes.flatMap((sc) => sc.beats.map((b) => b.spokenLine)).filter(Boolean);
  check("L2 script-first: spoken lines carried to beats", lines.length === 4, `lines=${lines.length}`);
  // Each DISTINCT authored line text must appear EXACTLY once across all compiled prompts
  const occurrences = lines.map((line) => promptsBlob.split(line).length - 1);
  check("L2 script-first: each verbatim line appears exactly once (byte-exact)", occurrences.every((n) => n === 1), `occurrences=${JSON.stringify(occurrences)}`);
}

// ------------------------------------------------------------------
// Quality-batch behaviors (image models, multi-char split, pacing, hard cuts)
// ------------------------------------------------------------------
{
  const { splitCharacterIdentities } = await import(`${base}/core/keyframe-first-planner.js`);
  // Multi-character split: "Linh, Mai" = 2 people; descriptions stay ONE person
  check("split: 'Linh, Mai' -> 2 people", splitCharacterIdentities("Linh, Mai").length === 2, JSON.stringify(splitCharacterIdentities("Linh, Mai")));
  check("split: 'Linh và Mai' -> 2 people", splitCharacterIdentities("Linh và Mai").length === 2, "");
  check("split: 'Linh, tired' stays 1 (appositive guard)", splitCharacterIdentities("Linh, tired").length === 1, JSON.stringify(splitCharacterIdentities("Linh, tired")));
  check("split: 'An, the founder' stays 1 (appositive guard)", splitCharacterIdentities("An, the founder").length === 1, "");
  check("split: 'woman with glasses' stays 1", splitCharacterIdentities("woman with glasses").length === 1, "");
  check("split: 'Linh and Linh' dedups to 1", splitCharacterIdentities("Linh and Linh").length === 1, "");

  // One beat naming two people -> 2 anchors, and the shot gets BOTH identity refs
  const { bindCharacterAnchorsToShots } = await import(`${base}/core/keyframe-first-planner.js`);
  const duoShot = (id, identity, refs) => ({ shotId: id, sceneId: "s", beatId: "b" + id, durationSeconds: 6, intent: "x",
    subject: "two friends", action: "a", camera: "m", lighting: "l", references: refs || [], continuity: { identity }, risks: [], metadata: {} });
  const duoShots = [duoShot("d1", "Linh, Mai"), duoShot("d2", "Linh, Mai")];
  const duoAnchors = planCharacterAnchors(duoShots);
  check("anchors: one beat 'Linh, Mai' x2 shots -> 2 per-person anchors", duoAnchors.length === 2 && duoAnchors.every((a) => a.shotIds.length === 2),
    JSON.stringify(duoAnchors.map((a) => a.characterKey)));
  const duoBound = bindCharacterAnchorsToShots({ shots: duoShots, anchors: [
    { characterKey: "linh", name: "Linh", uri: "https://x/linh.png" }, { characterKey: "mai", name: "Mai", uri: "https://x/mai.png" }] });
  const duoRefs = duoBound.shots[0].references.filter((r) => r.role === "identity").map((r) => r.label).sort();
  check("bind: multi-char shot carries BOTH portraits", JSON.stringify(duoRefs) === JSON.stringify(["Linh", "Mai"]), JSON.stringify(duoRefs));
  // Mixed shot: uploaded KOL (Anna) + invented co-char (Mai) -> Mai still anchored
  const annaRef = { role: "identity", label: "Anna", priority: "primary", selection: { characterId: "anna" },
    providerReference: { kind: "image", uri: "https://cdn.x/anna.png", role: "identity", label: "Anna" } };
  const mixedShots = [duoShot("m1", "Anna, Mai", [annaRef]), duoShot("m2", "Anna, Mai", [annaRef])];
  const mixedAnchors = planCharacterAnchors(mixedShots);
  check("anchors: mixed real+invented -> only invented co-char anchored", mixedAnchors.length === 1 && mixedAnchors[0].characterKey === "mai",
    JSON.stringify(mixedAnchors.map((a) => a.characterKey)));
  const mixedBound = bindCharacterAnchorsToShots({ shots: mixedShots, anchors: [{ characterKey: "mai", name: "Mai", uri: "https://x/mai.png" }] });
  const mixedRefs = mixedBound.shots[0].references.filter((r) => r.role === "identity").map((r) => r.label).sort();
  check("bind: mixed shot keeps Anna's real ref AND gains Mai's portrait", JSON.stringify(mixedRefs) === JSON.stringify(["Anna", "Mai"]), JSON.stringify(mixedRefs));
}

{
  // Transition hard-cut branch: UGC intent -> near-instant cut; negated/continuity intents stay soft
  const { TransitionEngine } = await import(`${base}/core/transition-engine.js`);
  const engine = new TransitionEngine();
  const select = (intent) => engine.selectBoundaryTransition("auto", intent);
  const ugc = select("Boundary edit: quick native hard cut between clips (TikTok jump-cut rhythm), no soft crossfade; protect the cold-open energy.");
  check("transition: UGC intent -> intent_native_hard_cut", ugc.reasonCodes.includes("intent_native_hard_cut"), JSON.stringify(ugc.reasonCodes));
  const intra = select("End with a stable visible anchor so the next chunk continues seamlessly with no visual reset.");
  check("transition: intra-beat continuity NOT hard cut", !intra.reasonCodes.includes("intent_native_hard_cut"), JSON.stringify(intra.reasonCodes));
  const negated = select("keep continuity without a jump cut across the boundary");
  check("transition: negated 'without a jump cut' NOT hard cut", !negated.reasonCodes.includes("intent_native_hard_cut"), JSON.stringify(negated.reasonCodes));
  const soft = select("Preserve clean start and end handles for seamless match cut, xfade, and last-frame chaining.");
  check("transition: non-UGC seamless intent stays dissolve", soft.kind === "dissolve", soft.kind);
}

{
  // Atlas image payload: reference-model routing + instruction-native control gating
  const { AtlasCloudProvider } = await import(`${base}/providers/atlascloud/atlas-cloud-provider.js`);
  const provider = new AtlasCloudProvider({
    apiKey: "test-key", apiBaseUrl: "https://api.atlascloud.ai/v1", assetBaseUrl: "https://api.atlascloud.ai/api/v1",
    models: { llmModel: "m", seedanceStandardModel: "v", seedanceFastModel: "vf",
      imageModel: "google/nano-banana-pro/text-to-image", imageReferenceModel: "google/nano-banana-2/reference-to-image" },
    requestTimeoutMs: 1000, maxJsonResponseBytes: 100000, pollingIntervalMs: 100, pollingTimeoutMs: 1000
  });
  const identityRef = { kind: "image", uri: "https://cdn.x/linh.png", role: "identity", label: "Linh" };
  const baseReq = { provider: "atlascloud", modelId: "google/nano-banana-pro/text-to-image", prompt: "p",
    negativePrompt: "no oversaturated colors", references: [], settings: { ratio: "9:16", guidanceScale: 7 } };
  const plain = provider.toAtlasImagePayload(baseReq);
  check("payload: no refs -> primary image model", plain.model === "google/nano-banana-pro/text-to-image", String(plain.model));
  check("payload: nano-banana folds negatives into prompt (no negative_prompt field)", plain.negative_prompt === undefined && String(plain.prompt).includes("Strictly avoid"), "");
  check("payload: nano-banana drops guidance_scale", plain.guidance_scale === undefined, "");
  const withRefs = provider.toAtlasImagePayload({ ...baseReq, references: [identityRef] });
  check("payload: ref-carrying request -> reference model", withRefs.model === "google/nano-banana-2/reference-to-image", String(withRefs.model));
  check("payload: reference_images populated", Array.isArray(withRefs.reference_images) && withRefs.reference_images.length === 1, "");
  const many = provider.toAtlasImagePayload({ ...baseReq, references: Array.from({ length: 12 }, (_, i) => ({ ...identityRef, uri: `https://cdn.x/${i}.png` })) });
  check("payload: reference_images capped at 9", many.reference_images.length === 9, String(many.reference_images.length));
  const seedream = provider.toAtlasImagePayload({ ...baseReq, modelId: "bytedance/seedream-v4.5" });
  check("payload: seedream keeps negative_prompt + guidance (diffusion)", seedream.negative_prompt === "no oversaturated colors" && seedream.guidance_scale === 7, "");
}

{
  // Prompt rewrites: anti-saturation keyframe + mid-motion entry survive
  const { planKeyframeRequests } = await import(`${base}/core/keyframe-first-planner.js`);
  const kfShot = { shotId: "k1", sceneId: "s", beatId: "b", durationSeconds: 6, intent: "x", subject: "Linh",
    action: "wipes the spill", camera: "handheld", lighting: "soft", references: [], continuity: {}, risks: [], metadata: {} };
  const kf = planKeyframeRequests({ shots: [kfShot], provider: "atlascloud", imageModelId: "m",
    settings: { tier: "fast", resolution: "720p", qualityMode: "economy", ratio: "9:16", durationTargetSeconds: 6, audioMode: "native", bitrateMode: "standard", watermark: false, returnLastFrame: true } })[0];
  check("keyframe prompt: anti-saturation color directive present", kf.request.prompt.includes("unedited smartphone photo"), "");
  check("keyframe negative: blocks oversaturation/HDR", kf.request.negativePrompt.includes("no oversaturated colors"), "");

  const settings = settingsFor(24, "economy");
  const meta = { shortViralCreativeMode: "ugc_review" };
  const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: meta });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: meta });
  const midPrompt = compiler.compile({ shot: shots[1], settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt;
  check("prompt: mid-video clip enters ALREADY MID-MOTION", midPrompt.includes("enter ALREADY MID-MOTION"), "");
  check("prompt: UGC DNA carries real-creator rhythm", midPrompt.includes("TikTok-native cut-to-cut energy"), "");
  check("prompt: word budget uses 2.8 wps (6s -> 16 words)", midPrompt.includes(`about ${Math.max(3, Math.floor(shots[1].durationSeconds * 2.8))} spoken words`), "");
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------
const passCount = results.filter((r) => r.status === "pass").length;
const failCount = results.filter((r) => r.status === "fail").length;
const report = { generatedAt: gen.toISOString(), total: results.length, pass: passCount, fail: failCount, results };
const outPath = resolve(repoRoot, "assets/output_deliverables/business-readiness/input-matrix-smoke-report.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

for (const r of results) if (r.status === "fail") console.log(`FAIL  ${r.name}  :: ${r.detail}`);
console.log(`\nInput×Duration matrix: ${passCount}/${results.length} pass, ${failCount} fail`);
if (failCount > 0) process.exit(1);
console.log("ALL PASS");
