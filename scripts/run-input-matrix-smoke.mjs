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
  // Register-aware since the capture-authenticity upgrade: a NEUTRAL (no-register) shot gets the
  // neutral anti-saturation wording; the "unedited phone photo" phrasing now belongs to the
  // natural_phone_kol register only (asserted in run-keyframe-first-smoke).
  check("keyframe prompt: anti-saturation color directive present", kf.request.prompt.includes("restrained saturation") && kf.request.prompt.includes("no vivid mode"), "");
  check("keyframe negative: blocks oversaturation/HDR", kf.request.negativePrompt.includes("no oversaturated colors"), "");

  const settings = settingsFor(24, "economy");
  const meta = { shortViralCreativeMode: "ugc_review" };
  const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: meta });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: meta });
  const midPrompt = compiler.compile({ shot: shots[1], settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt;
  check("prompt: mid-video clip enters ALREADY MID-MOTION", midPrompt.includes("enter ALREADY MID-MOTION"), "");
  check("prompt: UGC DNA carries real-creator rhythm", midPrompt.includes("TikTok-native cut-to-cut energy"), "");
  check("prompt: word budget uses 2.8 wps (6s -> 16 words)", midPrompt.includes(`about ${Math.max(3, Math.floor(shots[1].durationSeconds * 2.8))} spoken words`), "");

  // Prompt COMPACTION contract (live-render forensics): every functional signal exactly once, no
  // duplication, no inverted labels, and a hard length budget so bloat regressions surface here.
  const compiledAll = shots.map((s) => compiler.compile({ shot: s, settings, modelId: "bytedance/seedance-2.0/reference-to-video", provider: "atlascloud" }).prompt);
  check("compaction: every prompt <= 8000 chars (was 9-11k in paid run 2)", compiledAll.every((p) => p.length <= 8000),
    `max=${Math.max(...compiledAll.map((p) => p.length))}`);
  check("compaction: no double periods", compiledAll.every((p) => !/[^.]\.\.(?!\.)/.test(p)), "");
  check("compaction: no 'Atlas aliases' plumbing in prompt", compiledAll.every((p) => !p.includes("Atlas aliases")), "");
  check("compaction: no inverted 'Start state: end on'", compiledAll.every((p) => !p.includes("Start state:") && !p.includes("End state: start from")), "");
  check("compaction: home camera stated at most twice (Camera line + <=1 delta)", compiledAll.every((p, i) => p.split(shots[i].camera.trim()).length - 1 <= 2),
    "");
}

// ------------------------------------------------------------------
// Talking-shot avatar routing (Topview-class architecture): spoken shots -> TTS-first + avatar model
// ------------------------------------------------------------------
{
  const { decideAvatarShot, buildAvatarPrompt, avatarOutputResolution } = await import(`${base}/core/avatar-shot-planner.js`);
  const { RenderProducer } = await import(`${base}/agents/render-producer.js`);
  const avShot = (over) => ({ shotId: "s1", sceneId: "sc", beatId: "b", durationSeconds: 8, intent: "x", subject: "Linh",
    action: "talks to camera", camera: "selfie handheld", lighting: "soft", references: [], continuity: { identity: "Linh" }, risks: [], metadata: {}, ...over });
  const kfRef = { role: "first_frame", label: "kf", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.x/kf.png", role: "first_frame", label: "kf" } };
  const identityRef = { role: "identity", label: "Linh", priority: "primary", providerReference: { kind: "image", uri: "https://cdn.x/linh.png", role: "identity", label: "Linh" } };
  const talk = decideAvatarShot(avShot({ spokenLine: "Ồ, mềm thật!", references: [kfRef, identityRef] }));
  check("avatar: spoken shot -> talking, in-scene keyframe preferred", talk.talking && talk.imageUrl === "https://cdn.x/kf.png", JSON.stringify(talk));
  check("avatar: identity portrait fallback", decideAvatarShot(avShot({ spokenLine: "Hi", references: [identityRef] })).imageUrl === "https://cdn.x/linh.png", "");
  check("avatar: no spokenLine -> broll", decideAvatarShot(avShot({ references: [kfRef] })).talking === false, "");
  check("avatar: no https image -> broll (fail-open)", decideAvatarShot(avShot({ spokenLine: "Hi" })).talking === false, "");
  const hint = buildAvatarPrompt(avShot({ spokenLine: "Hi", references: [kfRef] }));
  check("avatar: hint compact, no timing contracts", hint.length <= 2000 && !hint.includes("Runtime contract"), "");
  check("avatar: resolution map", avatarOutputResolution({ resolution: "720p" }) === 720 && avatarOutputResolution({ resolution: "1080p-SR" }) === 1080, "");

  const routed = [];
  const stub = { name: "atlascloud",
    generateAvatarVideo: async (req) => { routed.push(["avatar", req.audioUrl]); return { provider: "atlascloud", predictionId: "p1", modelId: req.modelId, status: "succeeded", outputUrls: ["https://cdn.x/clip.mp4"], raw: {} }; },
    generateImageToVideo: async (req) => { routed.push(["i2v", null]); return { provider: "atlascloud", predictionId: "p2", modelId: req.modelId, status: "succeeded", outputUrls: ["https://cdn.x/b.mp4"], raw: {} }; },
    generateTextToVideo: async () => { throw new Error("x"); }, generateReferenceToVideo: async () => { throw new Error("x"); },
    editVideo: async () => { throw new Error("x"); }, extendVideo: async () => { throw new Error("x"); },
    getPrediction: async () => { throw new Error("x"); }, waitForPrediction: async () => { throw new Error("no poll needed"); },
    capabilities: () => [{ modelId: "m", provider: "atlascloud", modes: ["image_to_video"], ratios: ["9:16"], resolutions: ["720p"], durations: [8], references: ["image", "first_frame"], maxDurationSeconds: 15 }] };
  const producer = new RenderProducer(stub);
  const cp = { shotId: "s1", prompt: "p", negativePrompt: "n", references: [], bindingPlan: { providerReferences: [], sortedReferences: [], roleScopes: [], conflicts: [] }, inspectionExpectations: [], repairHints: [],
    videoRequest: { provider: "atlascloud", modelId: "m", mode: "image_to_video", prompt: "p", references: [], settings: { durationSeconds: 8, resolution: "720p", ratio: "9:16", generateAudio: true, bitrateMode: "standard", watermark: false, returnLastFrame: true }, metadata: {} } };
  const avatarRun = await producer.render({ ...cp, avatarPlan: { modelId: "bytedance/avatar-omni-human-v1.5", imageUrl: "https://cdn.x/kf.png", audioUrl: "https://cdn.x/voice.mp3", outputResolution: 720 } });
  check("avatar routing: avatarPlan -> generateAvatarVideo with the TTS audio", routed.length === 1 && routed[0][0] === "avatar" && routed[0][1] === "https://cdn.x/voice.mp3", JSON.stringify(routed));
  check("avatar routing: prediction flows back", avatarRun.prediction.outputUrls[0] === "https://cdn.x/clip.mp4", "");
  await producer.render(cp);
  check("avatar routing: no avatarPlan -> normal video path", routed.length === 2 && routed[1][0] === "i2v", JSON.stringify(routed));
}

// ------------------------------------------------------------------
// Two-register style engine (final upgrade): register frame + styleDna precedence
// ------------------------------------------------------------------
{
  const { registerForCreativeMode, registerGrammarPromptLine } = await import(`${base}/core/register-grammar.js`);
  check("register: ugc_review -> natural_phone_kol", registerForCreativeMode("ugc_review") === "natural_phone_kol", "");
  check("register: product_ad -> professional_cinematic", registerForCreativeMode("product_ad") === "professional_cinematic", "");
  check("register: unknown mode -> undefined (legacy fallback)", registerForCreativeMode("mystery_mode") === undefined, "");
  const kolLine = registerGrammarPromptLine("natural_phone_kol");
  check("register: KOL frame is anti-cinematic", kolLine.includes("NO cinematic bokeh") && kolLine.includes("NO scored music"), "");

  const settings = settingsFor(24, "economy");
  const meta = { shortViralCreativeMode: "ugc_review", shortViralNiche: "household_goods" };
  const plan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: meta });
  const shots = new ShotPlanner().plan({ projectId: "d", scenes: plan.scenes, settings, metadata: meta });
  const p1 = compiler.compile({ shot: shots[0], settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("register: compiled ugc prompt carries the KOL register frame", p1.includes("Style register: natural phone-shot / KOL."), "");
  check("register: legacy DNA still fires when LLM authored no styleDna axes", p1.includes("Creative-mode DNA"), "");
  // Authored styleDna suppresses legacy tables and emits axis overrides
  const dnaShot = { ...shots[0], styleDna: { register: "natural_phone_kol", optics: "macro tissue-fiber close focus", avoid: ["studio gloss"] } };
  const p2 = compiler.compile({ shot: dnaShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("register: authored styleDna emits axis override", p2.includes("Optics (this video): macro tissue-fiber close focus"), "");
  check("register: authored styleDna suppresses legacy DNA tables", !p2.includes("Creative-mode DNA"), "");
  // Vietnamese spoken line triggers the dialogue-light clause
  const viShot = { ...shots[0], spokenLine: "Ồ, mềm mà không rách thật!" };
  const p3 = compiler.compile({ shot: viShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("register: VN spoken line appends dialogue-light clause", p3.includes("Dialogue-light language mode"), "");

  // Register-derived craft fallbacks (audit #6): when the LLM omits camera/lighting, the coerced beat
  // gets the REGISTER's concrete language, not the old "stable cinematic camera" platitude — a phone
  // register never receives a cinematic word, and the fallback text itself is slop-free.
  const omittingLlm = {
    name: "fake-omitting-llm",
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() {
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0,
        value: { premise: "p", targetDurationSeconds: 12, scenes: [{ sceneId: "s1", title: "S1", beats: [
          { beatId: "b1", purpose: "hook", action: "creator shows the product", subject: "creator", durationSeconds: 12, risks: [] }
        ] }] } };
    },
    capabilities() { return []; }
  };
  const kolFallbackPlan = await new StoryArchitect(omittingLlm, "f").plan({ projectId: "d", userInput: "kol", settings: settingsFor(12, "economy"), references: [], metadata: { shortViralCreativeMode: "ugc_review" } });
  const kolBeat = kolFallbackPlan.scenes[0]?.beats[0];
  check("fallback craft: KOL register -> phone camera default", Boolean(kolBeat?.camera.includes("handheld phone framing")) && !/cinematic/i.test(kolBeat?.camera ?? ""), kolBeat?.camera ?? "");
  check("fallback craft: KOL register -> found-light default", Boolean(kolBeat?.lighting.includes("found window or room light")), kolBeat?.lighting ?? "");
  const cineFallbackPlan = await new StoryArchitect(omittingLlm, "f").plan({ projectId: "d", userInput: "ad", settings: settingsFor(12, "economy"), references: [], metadata: { shortViralCreativeMode: "product_ad" } });
  const cineBeat = cineFallbackPlan.scenes[0]?.beats[0];
  check("fallback craft: cinematic register -> motivated-move default", Boolean(cineBeat?.camera.includes("one motivated move")), cineBeat?.camera ?? "");
  check("fallback craft: defaults carry no slop terms", !/\b(cinematic|stunning|epic|masterpiece)\b/i.test(`${kolBeat?.camera} ${kolBeat?.lighting} ${cineBeat?.camera} ${cineBeat?.lighting}`), "");

  // EXPLICIT "Phong cách" lock (cross-audit #1): a review-worded brief with [style:cinematic] where
  // the LLM AUTHORS the OPPOSITE register (natural_phone_kol) must still resolve to
  // professional_cinematic — the customer's pick outranks the model. Asserted on the RESOLVED register
  // (beat.styleDna.register), not just the classifier's creativeMode.
  const wrongRegisterLlm = {
    name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() {
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: {
        premise: "p", targetDurationSeconds: 12, register: "natural_phone_kol",
        scenes: [{ sceneId: "s1", title: "S1", beats: [
          { beatId: "b1", purpose: "hook", action: "creator reviews the serum", subject: "creator", durationSeconds: 12, risks: [], styleDna: { optics: "handheld phone" } }
        ] }]
      } };
    }
  };
  const lockPlan = await new StoryArchitect(wrongRegisterLlm, "f").plan({ projectId: "d", userInput: "native creator review of the serum [style:cinematic]", settings: settingsFor(12, "economy"), references: [], metadata: {} });
  const lockBeat = lockPlan.scenes[0]?.beats[0];
  check("explicit style tag overrides LLM-authored register (architect)", lockBeat?.styleDna?.register === "professional_cinematic", `got ${lockBeat?.styleDna?.register}`);
  // No tag -> the LLM's authored register is respected (lock only fires on an explicit pick).
  const noLockPlan = await new StoryArchitect(wrongRegisterLlm, "f").plan({ projectId: "d", userInput: "native creator review of the serum", settings: settingsFor(12, "economy"), references: [], metadata: {} });
  check("no tag -> LLM register respected", noLockPlan.scenes[0]?.beats[0]?.styleDna?.register === "natural_phone_kol", `got ${noLockPlan.scenes[0]?.beats[0]?.styleDna?.register}`);

  const { CreativeBriefAnalyst: CBA } = await import(`${base}/agents/creative-brief-analyst.js`);
  const analystWrongRegisterLlm = {
    name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() {
      return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: {
        register: "natural_phone_kol", genre: "review", niche: "skincare", audience: "buyers", language: "vi",
        tone: "warm", emotionArc: "a -> b", pacingProfile: "fast", visualWorld: "bathroom",
        storyEngine: { conflict: "c", stakes: "s", payoff: "p" }
      } };
    }
  };
  const lockedIntent = await new CBA(analystWrongRegisterLlm, "f").analyze({ projectId: "d", userInput: "review of the serum [style:cinematic]", settings: settingsFor(12, "economy"), references: [], metadata: {} });
  check("explicit style tag overrides LLM-authored register (analyst)", lockedIntent.register === "professional_cinematic", `got ${lockedIntent.register}`);
}

// ------------------------------------------------------------------
// Creative Brief Analyst (deep-brief understanding stage): coercion + deterministic fallback
// ------------------------------------------------------------------
{
  const { CreativeBriefAnalyst } = await import(`${base}/agents/creative-brief-analyst.js`);
  const intake = { projectId: "d", userInput: "Làm video quảng cáo giấy ăn Topgia cho mẹ bỉm", settings: settingsFor(24, "economy"), references: [], metadata: { shortViralCreativeMode: "ugc_review" } };
  const goodLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() { return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: {
      register: "professional_cinematic", genre: "family melodrama ad", niche: "household tissue for young mothers",
      audience: "Vietnamese moms 25-35", language: "vi", tone: "tender, warm", emotionArc: "tired -> touched -> relieved",
      pacingProfile: "slow-burn cinematic", visualWorld: "small Hanoi apartment kitchen at dusk",
      storyEngine: { conflict: "a exhausted mother facing one more mess", stakes: "her patience in front of her child", payoff: "one strong tissue saves the moment" },
      styleDna: { optics: "50mm close focus on hands", moodWords: ["tender", "quiet"] } } }; } };
  const analyst = new CreativeBriefAnalyst(goodLlm, "f");
  const intent = await analyst.analyze(intake);
  check("analyst: coerces full intent", intent.register === "professional_cinematic" && intent.language === "vi" && intent.storyEngine.payoff.includes("tissue"), JSON.stringify(intent.storyEngine));
  check("analyst: styleDna carried with register", intent.styleDna?.register === "professional_cinematic" && intent.styleDna?.optics === "50mm close focus on hands", "");
  const badLlm = { name: "f", capabilities: () => [], async chat() { throw new Error("down"); }, async structured() { throw new Error("down"); } };
  const fallbackIntent = await new CreativeBriefAnalyst(badLlm, "f").analyze(intake);
  check("analyst: LLM failure -> deterministic fallback (fail-open)", fallbackIntent.register === "natural_phone_kol" && fallbackIntent.language === "vi", JSON.stringify({ r: fallbackIntent.register, l: fallbackIntent.language }));

  // Story Architect honors the analyst's register as the beat styleDna fallback register
  const scriptLlm = fakeLlm({});
  const plan = await new StoryArchitect(scriptLlm, "f").plan({ ...intake, creativeIntent: intent });
  const beat = plan.scenes[0]?.beats[0];
  check("analyst->architect: intent register beats creativeMode for styleDna base", !beat?.styleDna || beat.styleDna.register === "professional_cinematic", JSON.stringify(beat?.styleDna || null));
}

// ------------------------------------------------------------------
// Total-audit regression locks (Topview-V2 deep audit): 11 confirmed defects, each pinned here
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const settings = settingsFor(24, "economy");
  const bareShot = (over) => ({ shotId: "a1", sceneId: "sc", beatId: "b", durationSeconds: 8, intent: "x", subject: "Linh",
    action: "pours water into a glass", camera: "handheld medium", lighting: "soft window light", references: [], continuity: {}, risks: [], metadata: {}, ...over });

  // audit#7 — runtime contract must agree with the final-frame contract on continuation clips
  const contShot = bareShot({ timeline: [
    { startSecond: 0, endSecond: 4, action: "keeps pouring steadily" },
    { startSecond: 4, endSecond: 8, action: "the pour continues; this exit is not the beat's end" }
  ] });
  const contPrompt = compiler.compile({ shot: contShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#7: continuation clip runtime does NOT order settling", !contPrompt.includes("settles cleanly"), "");
  check("audit#7: continuation clip runtime orders mid-motion handoff", contPrompt.includes("keeps the action visibly in progress"), "");
  const settleShot = bareShot({ timeline: [{ startSecond: 0, endSecond: 8, action: "finishes the pour and sets the glass down" }] });
  const settlePrompt = compiler.compile({ shot: settleShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#7: settling clip still orders a clean settle", settlePrompt.includes("settles cleanly"), "");

  // audit#8 — realism guardrails follow the register instead of always speaking cinema
  const kolShot = bareShot({ styleDna: { register: "natural_phone_kol" } });
  const kolPrompt = compiler.compile({ shot: kolShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#8: KOL guardrails speak phone capture", kolPrompt.includes("photoreal phone-camera capture"), "");
  check("audit#8: KOL guardrails drop cinematic speculars", !kolPrompt.includes("physically based speculars"), "");
  const cineShot = bareShot({ styleDna: { register: "professional_cinematic" } });
  const cinePrompt = compiler.compile({ shot: cineShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#8: cinematic guardrails keep cinematic capture", cinePrompt.includes("photoreal cinematic capture"), "");

  // audit#16 — authored audioFeel REPLACES the register audio axis; overrides end with periods
  const audioDnaShot = bareShot({ metadata: { shortViralCreativeMode: "ugc_review" },
    styleDna: { register: "natural_phone_kol", optics: "grainy 26mm phone lens", audioFeel: "raw phone mic hiss" } });
  const audioPrompt = compiler.compile({ shot: audioDnaShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#16: authored audioFeel emitted once as override", audioPrompt.includes("Audio-feel: raw phone mic hiss."), "");
  check("audit#16: register audio axis suppressed when audioFeel authored", !audioPrompt.includes("In-camera sound only"), "");
  check("audit#16: override axes end with sentence periods", audioPrompt.includes("Optics (this video): grainy 26mm phone lens."), "");
  const noAudioDnaShot = bareShot({ styleDna: { register: "natural_phone_kol", optics: "grainy 26mm phone lens" } });
  const noAudioPrompt = compiler.compile({ shot: noAudioDnaShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#16: register audio axis present when no override", noAudioPrompt.includes("In-camera sound only"), "");
  // Camera+lens gear anchor (mined ai-shortfilm): named real gear reaches the compiled prompt per register.
  check("gear anchor: phone register names a real phone camera", noAudioPrompt.includes("flagship phone's main camera") && noAudioPrompt.includes("iPhone 15 Pro-class"), "");
  const cineGearShot = bareShot({ styleDna: { register: "professional_cinematic" } });
  const cineGearPrompt = compiler.compile({ shot: cineGearShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("gear anchor: cinematic register names a real cinema camera+lens", cineGearPrompt.includes("professional cinema camera") && /ARRI Alexa|Cooke|anamorphic/.test(cineGearPrompt), "");

  // audit#17 — verbatim spoken lines get the delivery-only dialogue-light clause
  const verbatimShot = bareShot({ styleDna: { register: "natural_phone_kol" }, spokenLine: "Ồ, mềm mà không rách thật luôn á!" });
  const verbatimPrompt = compiler.compile({ shot: verbatimShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  // The verbatim delivery mandate lives ONCE in the audio section ("Spoken line (VERBATIM ...");
  // the dialogue-light clause now carries only its unique signal (lip-shape approximate + reads
  // with sound off) instead of restating the mandate a third time (redundancy-audit R3).
  check("audit#17: verbatim mandate lives in the audio section", verbatimPrompt.includes("Spoken line (VERBATIM"), "");
  check("audit#17: dialogue-light keeps its unique lip-shape signal", verbatimPrompt.includes("treat lip-shape matching as approximate"), "");
  check("audit#17: dialogue-light no longer restates the delivery mandate", !verbatimPrompt.includes("deliver the scripted line in full exactly as written"), "");
  check("audit#17: verbatim line never told to keep it short", !verbatimPrompt.includes("keep any spoken line short and front-loaded"), "");
  const viNoLineShot = bareShot({ styleDna: { register: "natural_phone_kol" }, metadata: { voiceLanguage: "vi" } });
  const viNoLinePrompt = compiler.compile({ shot: viNoLineShot, settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#17: VN audio without scripted line keeps the short-and-front-loaded rule", viNoLinePrompt.includes("keep any spoken line short and front-loaded"), "");

  // audit#1/#2 — analyst styleDna inherited by beats; bare register still reaches the compiler
  const intentBase = { schemaVersion: "cinejelly.creative-intent.v1", register: "professional_cinematic", genre: "g", niche: "n",
    audience: "a", language: "vi", tone: "t", emotionArc: "e", pacingProfile: "p", visualWorld: "v",
    storyEngine: { conflict: "c", stakes: "s", payoff: "pay" } };
  const intentWithDna = { ...intentBase, styleDna: { register: "professional_cinematic", optics: "50mm close focus on hands" } };
  const inheritPlan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: {}, creativeIntent: intentWithDna });
  const inheritBeat = inheritPlan.scenes[0]?.beats[0];
  check("audit#1: analyst styleDna inherited when scriptwriter authors none",
    inheritBeat?.styleDna?.optics === "50mm close focus on hands" && inheritBeat?.styleDna?.register === "professional_cinematic",
    JSON.stringify(inheritBeat?.styleDna || null));
  const barePlan = await new StoryArchitect(fakeLlm({}), "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: {}, creativeIntent: intentBase });
  const bareShots = new ShotPlanner().plan({ projectId: "d", scenes: barePlan.scenes, settings, metadata: {} });
  const barePrompt = compiler.compile({ shot: bareShots[0], settings, modelId: "m", provider: "atlascloud" }).prompt;
  check("audit#2: intent register reaches the compiler with no creativeMode metadata and no axes",
    barePrompt.includes("Style register: professional cinematic."), "");

  // audit#4 — script-first precedence clause fires only for pasted scripts
  let recordedSystem = "";
  const recorderLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured(req) {
      recordedSystem = (req.messages || []).find((m) => m.role === "system")?.content ?? "";
      return fakeLlm({}).structured();
    } };
  const scriptInput = ["INT. BẾP - TỐI", "LINH: Ôi, hết giấy ăn rồi!", "MAI: Dùng thử Topgia đi.", "LINH: Mềm thật đấy!"].join("\n");
  await new StoryArchitect(recorderLlm, "f").plan({ projectId: "d", userInput: scriptInput, settings, references: [], metadata: {} });
  check("audit#4: pasted script -> PRECEDENCE clause overrides spoken-line rewriting", recordedSystem.includes("PRECEDENCE: SCRIPT-FIRST MODE"), "");
  await new StoryArchitect(recorderLlm, "f").plan({ projectId: "d", userInput: "một video về trà sen", settings, references: [], metadata: {} });
  check("audit#4: plain brief -> no script-first precedence clause", !recordedSystem.includes("PRECEDENCE: SCRIPT-FIRST MODE"), "");

  // audit#5 — single-clip collapse keeps every beat's verbatim line, in order
  const singleLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() { return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: { premise: "p", targetDurationSeconds: 12, scenes: [{ sceneId: "s1", title: "S", beats: [
      { beatId: "b1", purpose: "hook", action: "a1", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 4, spokenLine: "Một.", emotionalTurn: "tired -> curious" },
      { beatId: "b2", purpose: "demo", action: "a2", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 4, spokenLine: "Hai.", emotionalTurn: "curious -> surprised" },
      { beatId: "b3", purpose: "payoff", action: "a3", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 4, spokenLine: "Ba.", emotionalTurn: "surprised -> relieved" }
    ] }] } }; } };
  const singlePlan = await new StoryArchitect(singleLlm, "f").plan({ projectId: "d", userInput: "x", settings: settingsFor(12, "economy"), references: [], metadata: { workflowMode: "single" } });
  const singleBeat = singlePlan.scenes[0]?.beats[0];
  check("audit#5: single-clip collapse concatenates ALL spoken lines in order", singleBeat?.spokenLine === "Một. Hai. Ba.", String(singleBeat?.spokenLine));
  check("audit#5: single-clip emotional turn spans the whole arc", singleBeat?.emotionalTurn === "tired -> relieved", String(singleBeat?.emotionalTurn));
  check("audit#5: single-clip is one beat at full duration", singlePlan.scenes.length === 1 && singlePlan.scenes[0].beats.length === 1 && singleBeat?.durationSeconds === 12, "");

  // audit#6 — analyst language normalized to a code and threaded toward TTS
  const { normalizeSpokenLanguageCode, CreativeBriefAnalyst } = await import(`${base}/agents/creative-brief-analyst.js`);
  check("audit#6: language name normalizes to code", normalizeSpokenLanguageCode("Spanish") === "es" && normalizeSpokenLanguageCode("Tiếng Việt") === "vi", "");
  check("audit#6: regioned/bare codes pass through", normalizeSpokenLanguageCode("es-MX") === "es" && normalizeSpokenLanguageCode("ja") === "ja", "");
  check("audit#6: unknown language stays undefined (fallback keeps working)", normalizeSpokenLanguageCode("klingon") === undefined, "");
  const esLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() { return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: {
      register: "natural_phone_kol", genre: "g", niche: "n", audience: "a", language: "Spanish", tone: "t",
      emotionArc: "e", pacingProfile: "p", visualWorld: "v", storyEngine: { conflict: "c", stakes: "s", payoff: "p" } } }; } };
  const esIntent = await new CreativeBriefAnalyst(esLlm, "f").analyze({ projectId: "d", userInput: "haz un video del producto", settings, references: [], metadata: {} });
  check("audit#6: analyst coerces 'Spanish' -> 'es'", esIntent.language === "es", esIntent.language);
  const directorSrc = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");
  check("audit#6: director stamps analyst language as analystVoiceLanguage metadata", directorSrc.includes("analystVoiceLanguage") && directorSrc.includes("|| analystLanguage"), "");
  check("audit#6: per-line VN diacritics outrank the analyst whole-video language at TTS",
    /containsVietnameseDiacritics\(spokenLine\) \? "vi" : ""\)\s*\|\|\s*analystLanguage/.test(directorSrc), "");

  // audit#9 — talking-shot TTS + avatar spend is inside the pre-spend cost gate
  const { RenderCostGate } = await import(`${base}/core/render-cost-gate.js`);
  const gatePromptStub = (id, dur) => ({ shotId: id, prompt: "p", negativePrompt: "n", references: [],
    bindingPlan: { providerReferences: [], sortedReferences: [], roleScopes: [], conflicts: [] }, inspectionExpectations: [], repairHints: [],
    videoRequest: { provider: "atlascloud", modelId: "m", mode: "text_to_video", prompt: "p", references: [],
      settings: { durationSeconds: dur, resolution: "720p", ratio: "9:16", generateAudio: true, bitrateMode: "standard", watermark: false, returnLastFrame: true } } });
  const costGate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, llmPlanCostUsd: 0.05, ttsSynthesisCostUsd: 0.05, avatarRenderCostUsdPerSecond: 0.12, costBufferMultiplier: 1 });
  const talkEst = costGate.estimate({ compiledPrompts: [gatePromptStub("s1", 8), gatePromptStub("s2", 8)], settings: { qualityMode: "economy" },
    plannedTalkingShotCount: 2, plannedAvatarRenderSeconds: 16, plannedLlmPlanCallCount: 2 });
  const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-9;
  check("audit#9: TTS cost counted per talking shot", near(talkEst.estimatedTtsCostUsd, 0.1), String(talkEst.estimatedTtsCostUsd));
  check("audit#9: avatar seconds costed at the avatar rate", near(talkEst.estimatedAvatarRenderCostUsd, 1.92), String(talkEst.estimatedAvatarRenderCostUsd));
  check("audit#9: LLM plan cost scales by call count (architect + analyst)", near(talkEst.estimatedLlmCostUsd, 0.1), String(talkEst.estimatedLlmCostUsd));
  check("audit#9: total includes talking-shot spend", near(talkEst.estimatedTotalCostUsd, (talkEst.estimatedRenderCostUsd ?? 0) + 0.1 + 1.92 + 0.1), String(talkEst.estimatedTotalCostUsd));
  const blockEst = costGate.estimate({ compiledPrompts: [gatePromptStub("s1", 8)], settings: { qualityMode: "economy", maxCostUsd: 1 },
    plannedTalkingShotCount: 1, plannedAvatarRenderSeconds: 8, plannedLlmPlanCallCount: 2 });
  check("audit#9: maxCostUsd now blocks on avatar-driven overflow", blockEst.status === "block", blockEst.status);
  const bareGate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, costBufferMultiplier: 1 });
  const warnEst = bareGate.estimate({ compiledPrompts: [gatePromptStub("s1", 8)], settings: { qualityMode: "economy" }, plannedTalkingShotCount: 1, plannedAvatarRenderSeconds: 8 });
  check("audit#9: unpriced talking spend surfaces as a loud finding", warnEst.findings.some((f) => f.includes("spend is not counted in the USD estimate")) && warnEst.status !== "block", warnEst.status);
  check("audit#9: director wires talking counts into the gate", directorSrc.includes("plannedTalkingShotCount: plannedTalkingShots.length") && directorSrc.includes("const plannedLlmPlanCallCount =") && directorSrc.includes("this.creativeBriefAnalyst ? 1 : 0"), "");

  // Cross-review round (adversarial review of the audit fixes): 7 confirmed follow-up defects
  const { normalizeSpokenLanguageCode: norm2, containsVietnameseDiacritics: hasVn } = await import(`${base}/core/spoken-language.js`);
  check("review: country codes corrected to language codes", norm2("VN") === "vi" && norm2("jp") === "ja" && norm2("KR") === "ko" && norm2("cn") === "zh", "");
  // Vietnamese detector must catch REAL Vietnamese (horn/breve/đ/dot-below tones) but NOT accented
  // European text — the over-broad à-ỹ range used to tag Spanish/French/etc as Vietnamese and voice
  // them with a Vietnamese TTS model (audit HIGH-F).
  check("lang: real Vietnamese detected", hasVn("được người dùng") && hasVn("Tôi rất thích sản phẩm này") && hasVn("chương trình khuyến mãi"), "");
  check("lang: accented European NOT mis-tagged Vietnamese",
    !hasVn("Está increíble") && !hasVn("C'est déjà l'été très bête") && !hasVn("solução prática") && !hasVn("Schöner größere") && !hasVn("È così più però") && !hasVn("çünkü bugün"), "");
  // Gate must BLOCK when a hard cap is set but talking spend is unpriced (cap unenforceable)
  const capEst = bareGate.estimate({ compiledPrompts: [gatePromptStub("s1", 8)], settings: { qualityMode: "economy", maxCostUsd: 50 }, plannedTalkingShotCount: 1, plannedAvatarRenderSeconds: 8 });
  check("review: maxCostUsd + unpriced talking spend -> BLOCK (cap not enforceable)", capEst.status === "block" && capEst.findings.some((f) => f.includes("cannot bound talking-shot spend")), capEst.status);
  // Per-rate accuracy: only the missing rate is named
  const ttsOnlyGate = new RenderCostGate({ renderCostUsdPerSecond: 0.1, ttsSynthesisCostUsd: 0.05, costBufferMultiplier: 1 });
  const ttsOnlyEst = ttsOnlyGate.estimate({ compiledPrompts: [gatePromptStub("s1", 8)], settings: { qualityMode: "economy" }, plannedTalkingShotCount: 1, plannedAvatarRenderSeconds: 8 });
  check("review: one configured rate is counted and NOT reported missing",
    near(ttsOnlyEst.estimatedTtsCostUsd, 0.05) && ttsOnlyEst.findings.some((f) => f.includes("AVATAR_COST_USD_PER_SECOND") && !f.includes("CINEJELLY_TTS_COST_USD")), JSON.stringify(ttsOnlyEst.findings));
  // Gate only counts avatar spend on plausible routes (keyframe-first OR an existing https image)
  check("review: gate counts avatar spend only for plausible image routes", directorSrc.includes("keyframeFirstEnabled || decideAvatarShot(shot).talking"), "");
  // Register precedence (adversarial-audit #2): the deterministic hint (analyst intent) that chose
  // the playbook/directive also decides the FINAL register — the LLM's self-authored register can no
  // longer defy it (a script written under the phone-KOL playbook must compile under the phone
  // frame). With hint and final register agreeing, the intent's DNA axes are inherited.
  const kolIntentDna = { ...intentBase, register: "natural_phone_kol", styleDna: { register: "natural_phone_kol", optics: "grainy 26mm phone lens" } };
  const cineOverrideLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() { const r = await fakeLlm({}).structured(); return { ...r, value: { ...r.value, register: "professional_cinematic" } }; } };
  const clashPlan = await new StoryArchitect(cineOverrideLlm, "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: {}, creativeIntent: kolIntentDna });
  const clashBeat = clashPlan.scenes[0]?.beats[0];
  check("review: deterministic hint outranks LLM-authored register; matching intent DNA inherited",
    clashBeat?.styleDna?.register === "natural_phone_kol" && clashBeat?.styleDna?.optics === "grainy 26mm phone lens", JSON.stringify(clashBeat?.styleDna || null));
  // The LLM-authored register still fills in when NO deterministic signal exists (no tag/intent/mode).
  const noHintPlan = await new StoryArchitect(cineOverrideLlm, "f").plan({ projectId: "d", userInput: "x", settings, references: [], metadata: {} });
  check("review: LLM-authored register used when no deterministic hint exists",
    noHintPlan.scenes[0]?.beats[0]?.styleDna?.register === "professional_cinematic", JSON.stringify(noHintPlan.scenes[0]?.beats[0]?.styleDna || null));
  // Unicode arrow in emotional turns still merges to a clean two-state arc
  const arrowLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured() { return { provider: "atlascloud", modelId: "f", content: "{}", raw: {}, latencyMs: 0, value: { premise: "p", targetDurationSeconds: 12, scenes: [{ sceneId: "s1", title: "S", beats: [
      { beatId: "b1", purpose: "hook", action: "a1", subject: "L", camera: "c", lighting: "l", durationSeconds: 4, emotionalTurn: "tired → curious" },
      { beatId: "b2", purpose: "payoff", action: "a2", subject: "L", camera: "c", lighting: "l", durationSeconds: 4, emotionalTurn: "surprised ⇒ relieved" }
    ] }] } }; } };
  const arrowPlan = await new StoryArchitect(arrowLlm, "f").plan({ projectId: "d", userInput: "x", settings: settingsFor(12, "economy"), references: [], metadata: { workflowMode: "single" } });
  check("review: unicode-arrow turns merge to a two-state arc", arrowPlan.scenes[0]?.beats[0]?.emotionalTurn === "tired -> relieved", String(arrowPlan.scenes[0]?.beats[0]?.emotionalTurn));
  // Shared sentinel: producer prose and compiler detection use one constant
  const { BEAT_CONTINUATION_SENTINEL } = await import(`${base}/core/shot-planner.js`);
  check("review: continuation sentinel is a shared constant", typeof BEAT_CONTINUATION_SENTINEL === "string" &&
    readFileSync(resolve(repoRoot, "src/prompt_compiler/prompt-compiler.ts"), "utf8").includes("BEAT_CONTINUATION_SENTINEL"), "");

  // audit#3 — no playbook demands a cut cadence below the 4s provider floor
  const playbookSrc = readFileSync(resolve(repoRoot, "src/core/niche-playbooks.ts"), "utf8");
  const forbiddenCadence = ["1-2s", "2-3s", "3-5s", "2s beats", "1-1.5s", "~3s each", "every 0.5s"];
  check("audit#3: playbook templates respect the 4s beat floor", forbiddenCadence.every((c) => !playbookSrc.includes(c)),
    forbiddenCadence.filter((c) => playbookSrc.includes(c)).join(","));
}

// ------------------------------------------------------------------
// Dub/sub executor (lồng tiếng review-phim) + series continuity (batch 4)
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const { RedubExecutor, DUB_ORIGINAL_BED_VOLUME } = await import(`${base}/core/redub-executor.js`);
  const ttsCalls = [];
  const speechStub = {
    async synthesizeSpeech(req) {
      ttsCalls.push({ text: req.text, languageCode: req.languageCode, voice: req.voice });
      if (req.text.includes("FAIL_ME")) { throw new Error("provider down"); }
      return { provider: "atlascloud", predictionId: "t", modelId: req.modelId, status: "succeeded", outputUrls: [`https://cdn.x/${ttsCalls.length}.mp3`], raw: {} };
    }
  };
  let mixInput;
  const mixStub = { async mix(input) { mixInput = input; return { outputPath: input.outputVideoPath, trackCount: input.tracks.length, mixedAt: new Date(), mode: input.options.mode }; } };
  const dubPlan = (treatment) => ({
    projectId: "redub_t", sourceLanguage: "zh", dubLanguage: "vi", sourceCues: [], dubCues: [], subtitleTracks: [],
    originalAudioTreatment: treatment,
    ttsIntents: [
      { intentId: "seg1", kind: "tts_narration", prompt: "Cô ấy mở hộp quà.", startSecond: 1.2, language: "vi", volume: 1 },
      { intentId: "seg2", kind: "tts_narration", prompt: "Và mọi thứ thay đổi.", startSecond: 8.5, language: "vi" }
    ],
    summary: { segmentCount: 2, totalSpeechSeconds: 6, subtitleLanguages: ["vi"] }
  });
  const dubRun = await new RedubExecutor().execute({
    plan: dubPlan("duck_under_dub"), sourceVideoPath: "C:/src.mp4", workDirectory: "C:/wd", outputVideoPath: "C:/out/dubbed.mp4",
    speechProvider: speechStub, ttsModelId: "elevenlabs/v3/text-to-speech", ttsVoice: "Jessica", audioMixEngine: mixStub
  });
  check("dub: every narration segment synthesized in the dub language", ttsCalls.length === 2 && ttsCalls.every((c) => c.languageCode === "vi" && c.voice === "Jessica"), JSON.stringify(ttsCalls));
  check("dub: narration tracks keep per-segment timing", mixInput.tracks.length === 2 && mixInput.tracks[0].startSeconds === 1.2 && mixInput.tracks[1].startSeconds === 8.5 && mixInput.tracks.every((t) => t.role === "narration"), "");
  check("dub: duck_under_dub keeps original audio low under the voice", mixInput.options.mode === "mix" && mixInput.includeOriginalAudio === true && mixInput.options.originalVolume === DUB_ORIGINAL_BED_VOLUME, "");
  check("dub: result reports the mixed file", dubRun.outputPath === "C:/out/dubbed.mp4" && dubRun.narrationTrackCount === 2, "");
  await new RedubExecutor().execute({
    plan: dubPlan("replace"), sourceVideoPath: "C:/src.mp4", workDirectory: "C:/wd", outputVideoPath: "C:/out/dubbed.mp4",
    speechProvider: speechStub, ttsModelId: "m", audioMixEngine: mixStub
  });
  check("dub: replace drops the original audio entirely", mixInput.options.mode === "replace" && mixInput.includeOriginalAudio === false && mixInput.options.originalVolume === 0, "");
  let dubFailed = false;
  try {
    await new RedubExecutor().execute({
      plan: { ...dubPlan("duck_under_dub"), ttsIntents: [ ...dubPlan("duck_under_dub").ttsIntents, { intentId: "seg3", kind: "tts_narration", prompt: "FAIL_ME", startSecond: 12 } ] },
      sourceVideoPath: "C:/src.mp4", workDirectory: "C:/wd", outputVideoPath: "C:/out/dubbed.mp4",
      speechProvider: speechStub, ttsModelId: "m", audioMixEngine: mixStub
    });
  } catch (error) { dubFailed = String(error).includes("silent holes"); }
  check("dub: any failed segment fails the whole dub (no silent holes)", dubFailed, "");
  const serverSrc = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
  check("dub: redub route executes renderVideo via RedubExecutor + persists SRT files",
    serverSrc.includes("new RedubExecutor().execute") && serverSrc.includes("subtitles-${track.language}.srt") && serverSrc.includes("ATLASCLOUD_TTS_MODEL") , "");

  // --- Series continuity: store + episode director ---
  const { SeriesContinuityStore } = await import(`${base}/core/series-continuity-store.js`);
  const { SeriesEpisodeDirector } = await import(`${base}/application/series-episode-director.js`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const storeRoot = mkdtempSync(resolve(tmpdir(), "cinejelly-series-"));
  const store = new SeriesContinuityStore({ outputRoot: storeRoot });
  const seriesRequest = {
    premise: "Nữ giúp việc bị coi thường hoá ra là ái nữ tập đoàn.",
    genre: "revenge melodrama", language: "vi", episodeCount: 3, episodeDurationSeconds: 60,
    cast: [
      { characterId: "linh_lead", name: "Linh", castRole: "protagonist", description: "23t, mắt kiên định", identityReferenceUri: "https://cdn.x/linh.png" },
      { characterId: "ba_tran", name: "Bà Trần", castRole: "antagonist", description: "quản gia khắc nghiệt" }
    ]
  };
  const runs = [];
  const directorStub = {
    async run(request) {
      runs.push(request);
      return {
        projectId: `ep_${runs.length}`,
        storyPlan: {
          premise: `Tập ${runs.length} premise`, targetDurationSeconds: 60, scenes: [],
          episodeSummary: `Tập ${runs.length}: Linh phát hiện bí mật thứ ${runs.length}.`,
          episodeEndState: `Linh đứng trước cửa phòng ${runs.length}, tay cầm chìa khoá.`,
          ...(runs.length < 3 ? { cliffhanger: `Cánh cửa ${runs.length} hé mở.` } : {})
        }
      };
    }
  };
  const episodeDirector = new SeriesEpisodeDirector({ director: directorStub, store });
  const created = await episodeDirector.startSeries(seriesRequest);
  check("series: continuity record created with cast ledger", created.cast.length === 2 && created.cast[0].firstAppearedEpisode === 1 && created.episodeStates.length === 0, "");
  const ep1 = await episodeDirector.renderNextEpisode(created.seriesId);
  check("series: ep1 has no PREVIOUSLY ON block", ep1.episodeNumber === 1 && !runs[0].userInput.includes("PREVIOUSLY ON"), "");
  check("series: ep1 carries pinned identity reference", (runs[0].references ?? []).some((r) => r.label === "linh_lead" && r.providerReference?.uri === "https://cdn.x/linh.png"), "");
  check("series: ep1 recorded from the architect's REAL fields", ep1.record.episodeStates[0].summary.includes("bí mật thứ 1") && ep1.record.episodeStates[0].endState.includes("phòng 1") && ep1.record.episodeStates[0].cliffhanger === "Cánh cửa 1 hé mở.", JSON.stringify(ep1.record.episodeStates[0]));
  const ep2 = await episodeDirector.renderNextEpisode(created.seriesId);
  check("series: ep2 brief resumes EXACTLY from ep1's real end state", runs[1].userInput.includes("PREVIOUSLY ON") && runs[1].userInput.includes("phòng 1") && runs[1].userInput.includes("Cánh cửa 1 hé mở."), "");
  check("series: ep2 metadata carries the recap", typeof runs[1].metadata?.seriesRecap === "string" && runs[1].metadata.seriesRecap.includes("phòng 1"), "");
  await episodeDirector.renderNextEpisode(created.seriesId);
  check("series: episode numbering advances and persists", ep2.episodeNumber === 2 && (await store.load(created.seriesId)).episodeStates.length === 3, "");
  let seriesDone = false;
  try { await episodeDirector.renderNextEpisode(created.seriesId); } catch (error) { seriesDone = String(error).includes("complete"); }
  check("series: finished series refuses a 4th episode", seriesDone, "");
  let dupRejected = false;
  try { await store.recordEpisode(created.seriesId, { episodeNumber: 2, projectId: "x", summary: "s", endState: "e", macroPhase: "escalation", recordedAt: new Date().toISOString() }); } catch { dupRejected = true; }
  check("series: duplicate episode recording rejected", dupRejected, "");
  check("series: recap keeps rolling window shape", (store.recapFor((await store.load(created.seriesId)))).includes("Resume EXACTLY from this state:"), "");

  // Cross-episode VISUAL conditioning (fidelity gap #3): composing the next episode after a recorded
  // one attempts the end-frame extraction FAIL-OPEN — recorded videoPaths in this smoke point at
  // nonexistent files, so extraction fails and the compose must still succeed WITHOUT the style ref.
  // (Real extraction requires ffmpeg + a real video; the wiring itself is asserted in source below.)
  const secondSeries = await episodeDirector.startSeries({ ...seriesRequest, premise: "Bản sao kiểm tra khung hình cuối." });
  await store.recordEpisode(secondSeries.seriesId, { episodeNumber: 1, projectId: "p1", summary: "s", endState: "e", macroPhase: "setup", videoPath: "C:/nonexistent/ep1.mp4", recordedAt: new Date().toISOString() });
  const composed2 = await episodeDirector.composeNextEpisode(secondSeries.seriesId);
  check("series: end-frame extraction fails open (missing video still composes)", composed2.episodeNumber === 2 && !composed2.request.metadata?.seriesPreviousEndFrame, "");
  const episodeDirectorSrc = (await import("node:fs")).readFileSync(resolve(repoRoot, "src/application/series-episode-director.ts"), "utf8");
  check("series: end-frame wired as STYLE ref (not first_frame)", episodeDirectorSrc.includes("extractEpisodeEndFrame") && episodeDirectorSrc.includes('role: "style"') && !episodeDirectorSrc.includes('role: "first_frame"'), "");

  // Architect series-mode fields: schema requested + coerced when metadata.seriesId present
  let seriesSystem = "";
  const seriesLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "atlascloud", modelId: "f" }; },
    async structured(req) {
      seriesSystem = (req.messages || []).find((m) => m.role === "system")?.content ?? "";
      const r = await fakeLlm({}).structured();
      return { ...r, value: { ...r.value, episodeSummary: "Tóm tắt tập.", episodeEndState: "Cô đứng im.", cliffhanger: "Tiếng gõ cửa." } };
    } };
  const seriesPlan = await new StoryArchitect(seriesLlm, "f").plan({ projectId: "d", userInput: "x", settings: settingsFor(60, "economy"), references: [], metadata: { seriesId: "series_t", episodeNumber: "2" } });
  check("series: architect asked for episode fields in series mode", seriesSystem.includes("SERIES MODE"), "");
  // Hook + flow law (retention research): 14-word hook cap, But/Therefore beat joins, AI-text tells
  // banned — must reach the writer's system prompt on every plan.
  check("architect: hook law + flow spine + AI-tell bans injected", seriesSystem.includes("HOOK LAW") && seriesSystem.includes("AT MOST 14 words") && seriesSystem.includes("BUT or THEREFORE") && seriesSystem.includes("không chỉ X mà còn Y"), "");
  const enhancerSrc2 = (await import("node:fs")).readFileSync(resolve(repoRoot, "src/agents/script-enhancer.ts"), "utf8");
  check("enhancer: humanize pass enforces hook cap + AI-tell strike list", enhancerSrc2.includes("HUMANIZE PASS") && enhancerSrc2.includes("at most 14 words") && enhancerSrc2.includes("game-changer"), "");
  check("series: architect coerces episodeSummary/endState/cliffhanger", seriesPlan.episodeSummary === "Tóm tắt tập." && seriesPlan.episodeEndState === "Cô đứng im." && seriesPlan.cliffhanger === "Tiếng gõ cửa.", "");
  await new StoryArchitect(seriesLlm, "f").plan({ projectId: "d", userInput: "x", settings: settingsFor(30, "economy"), references: [], metadata: {} });
  check("series: non-series briefs get no SERIES MODE directive", !seriesSystem.includes("SERIES MODE"), "");
}

// ------------------------------------------------------------------
// UI+backend commercial round (workflow audit + self-verified candidates): regression locks
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const pageSrc = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
  const serverSrc2 = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
  const mixSrc = readFileSync(resolve(repoRoot, "src/core/audio-mix-engine.ts"), "utf8");
  const directorSrc2 = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");

  // amix loudness: no 1/N auto-scaling + limiter guard
  check("uiround: amix disables 1/N normalize and adds a limiter", mixSrc.includes("normalize=0") && mixSrc.includes("alimiter=limit=0.97"), "");

  // RedubExecutor fail-fast: segment 2 fails -> segment 3's TTS is never bought
  const { RedubExecutor } = await import(`${base}/core/redub-executor.js`);
  const boughtTexts = [];
  const failFastSpeech = { async synthesizeSpeech(req) {
    boughtTexts.push(req.text);
    if (req.text === "FAIL_ME") { throw new Error("down"); }
    return { provider: "atlascloud", predictionId: "t", modelId: req.modelId, status: "succeeded", outputUrls: ["https://cdn.x/a.mp3"], raw: {} };
  } };
  let failFast = false;
  try {
    await new RedubExecutor().execute({
      plan: { projectId: "r", sourceLanguage: "zh", dubLanguage: "vi", sourceCues: [], dubCues: [], subtitleTracks: [], originalAudioTreatment: "duck_under_dub",
        ttsIntents: [
          { intentId: "s1", kind: "tts_narration", prompt: "ok một" },
          { intentId: "s2", kind: "tts_narration", prompt: "FAIL_ME" },
          { intentId: "s3", kind: "tts_narration", prompt: "không bao giờ mua" }
        ], summary: { segmentCount: 3, totalSpeechSeconds: 9, subtitleLanguages: [] } },
      sourceVideoPath: "C:/s.mp4", workDirectory: "C:/w", outputVideoPath: "C:/o.mp4",
      speechProvider: failFastSpeech, ttsModelId: "m", audioMixEngine: { async mix() { throw new Error("must not mix"); } }
    });
  } catch (error) { failFast = String(error).includes("silent holes"); }
  check("uiround: dub fail-fast stops buying TTS after the first failure", failFast && boughtTexts.length === 2 && !boughtTexts.includes("không bao giờ mua"), JSON.stringify(boughtTexts));

  // Server: renderVideo surcharge + owner-scoped download route + downloads payload
  check("uiround: renderVideo billed with surcharge", serverSrc2.includes("REDUB_RENDER_VIDEO_SURCHARGE") && serverSrc2.includes("redubBillableSeconds * redubSurcharge"), "");
  check("uiround: redub outputs delivered as authenticated download URLs", serverSrc2.includes("/files/dubbed.mp4") && serverSrc2.includes("owner.json") && serverSrc2.includes("REDUB_DOWNLOADABLE_FILE"), "");

  // Create page: paid-confirm and captions are separate labels; dead tabs wired; quality + channel-style live
  check("uiround: confirm-render and caption-toggle have their own labels", pageSrc.includes('for="confirm-render"') && pageSrc.includes('for="caption-toggle"'), "");
  check("uiround: top tabs wired (My Creations/History)", pageSrc.includes('getElementById("tab-mine").addEventListener') && pageSrc.includes('getElementById("tab-history").addEventListener'), "");
  check("uiround: gallery filter tabs wired via data-template-filter", pageSrc.includes("data-template-filter") && pageSrc.includes("dataset.templateFilter"), "");
  check("uiround: template cards carry data-category", (pageSrc.match(/data-category="/g) || []).length >= 7, "");
  check("uiround: quality select sends settings.qualityMode and drives the estimate",
    pageSrc.includes('id="quality-mode"') && pageSrc.includes("settings: { qualityMode }") && pageSrc.includes("meteredCredits(seconds, estimateTier, selectedQuality)"), "");
  check("uiround: channel style select feeds channelStyleProfileId", pageSrc.includes('id="channel-style"') && pageSrc.includes("channelStyleProfileId ? { channelStyleProfileId }"), "");
  check("uiround: redub modal can execute the real dub and download it",
    pageSrc.includes('id="redub-render-video"') && pageSrc.includes("body.renderVideo = true") && pageSrc.includes("redub.downloadVideo"), "");
  check("uiround: help.redub no longer denies auto-dub in any locale", !pageSrc.includes("KHÔNG tự lồng tiếng") && !pageSrc.includes("does NOT auto-voice") && !pageSrc.includes("不会自动为视频配音"), "");
  check("uiround: talking-shot milestone surfaced to customers", serverSrc2.includes("progressHighlights") && pageSrc.includes("job.progressHighlights"), "");

  // Series routes: operator-gated, preview no-spend, renders recorded back into continuity
  check("uiround: series routes exist with ownership + quote/ack billing for customers",
    serverSrc2.includes('requestUrl.pathname === "/v1/series"') && serverSrc2.includes("assertSeriesOwnership") &&
    serverSrc2.includes("episodes\\/next(\\/preview)?") && serverSrc2.includes('status: "quote"') &&
    serverSrc2.includes("series_${seriesId}_ep") && serverSrc2.includes('reason: "tập phim render lỗi"'), "");
  check("uiround: customers cannot inject series metadata; storyboard stamped server-side",
    serverSrc2.includes("...(seriesUserId ? {} : body.metadata ?? {})") && serverSrc2.includes('seriesUserId ? { storyboardApproval: "operator_approved" }'), "");
  const pageSrc2 = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
  check("uiround: main nav has 4 destinations wired", ["nav-create", "nav-series", "nav-dub", "nav-mine"].every((id) => pageSrc2.includes('id="' + id + '"') && pageSrc2.includes('getElementById("' + id + '").addEventListener')), "");
  check("uiround: series studio UI flow create->preview->quote->render", pageSrc2.includes('id="series-panel"') && pageSrc2.includes('"/v1/series/"') && pageSrc2.includes("acknowledgedCredits: quoted.quote.credits"), "");
  check("uiround: series render goes through normalize+admission and records the episode",
    serverSrc2.includes("normalizeRenderRequest(episodeRequest") && serverSrc2.includes("recordRenderedEpisode("), "");
  check("uiround: talking-shot stage rethrows on abort", directorSrc2.includes("A real user abort must stop the whole stage"), "");

  // Series behavior: cast growth from real scenes + per-series serialization of concurrent calls
  const { SeriesContinuityStore } = await import(`${base}/core/series-continuity-store.js`);
  const { SeriesEpisodeDirector } = await import(`${base}/application/series-episode-director.js`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const growthStore = new SeriesContinuityStore({ outputRoot: mkdtempSync(resolve(tmpdir(), "cinejelly-series2-")) });
  let growthRuns = 0;
  const growthDirector = new SeriesEpisodeDirector({
    store: growthStore,
    director: { async run() {
      growthRuns += 1;
      return { projectId: `ep_${growthRuns}`, storyPlan: {
        premise: "p", targetDurationSeconds: 60,
        episodeSummary: `Tập ${growthRuns} xong.`, episodeEndState: `Trạng thái ${growthRuns}.`,
        scenes: [{ sceneId: "s1", title: "S", beats: [{ beatId: "b1", purpose: "x", action: "a", subject: "s", camera: "c", lighting: "l", durationSeconds: 4, risks: [], references: [], continuity: { identity: "Linh, Cô Hàng Xóm" } }] }]
      } };
    } }
  });
  const growthRecord = await growthDirector.startSeries({
    premise: "Người giúp việc bí ẩn.", episodeCount: 2, episodeDurationSeconds: 60, language: "vi",
    cast: [{ characterId: "linh_lead", name: "Linh", castRole: "protagonist", description: "23t" }]
  });
  const [g1, g2] = await Promise.all([
    growthDirector.renderNextEpisode(growthRecord.seriesId),
    growthDirector.renderNextEpisode(growthRecord.seriesId)
  ]);
  const growthFinal = await growthStore.load(growthRecord.seriesId);
  check("uiround: concurrent next-episode calls serialize to eps 1 and 2",
    [g1.episodeNumber, g2.episodeNumber].sort().join(",") === "1,2" && growthFinal.episodeStates.length === 2, JSON.stringify([g1.episodeNumber, g2.episodeNumber]));
  check("uiround: mid-series cast growth recorded name-only with stable label",
    growthFinal.cast.some((member) => member.name === "Cô Hàng Xóm" && member.firstAppearedEpisode >= 1) &&
    growthFinal.cast.filter((member) => member.name === "Cô Hàng Xóm").length === 1 &&
    !growthFinal.cast.some((member) => member.name.toLowerCase() === "linh" && member.characterId !== "linh_lead"),
    JSON.stringify(growthFinal.cast.map((member) => member.characterId)));
}

// ------------------------------------------------------------------
// Tri-role audit (hacker/user/admin) regression locks
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const serverSrc3 = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
  const pageSrc3 = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");

  // HACKER#1: series id namespaced per owner + ownership re-check on create (no cross-tenant read/squat)
  check("tri: series id namespaced per owner + create ownership re-check",
    serverSrc3.includes("`u${seriesUserId.replace") && serverSrc3.includes("const createdOwnerOk = seriesUserId ? record.ownerUserId === seriesUserId"), "");
  // HACKER#2 / ADMIN#2: per-series in-flight lock before charge, released in finally
  check("tri: per-series render in-flight lock (before charge) + release",
    serverSrc3.includes("seriesRenderInFlight.has(seriesId)") && serverSrc3.includes("seriesRenderInFlight.add(seriesId)") && serverSrc3.includes("seriesRenderInFlight.delete(seriesId)"), "");
  check("tri: in-flight check precedes chargeRender", serverSrc3.indexOf("seriesRenderInFlight.has(seriesId)") < serverSrc3.indexOf("jobId: episodeJobId, credits: episodeCharge.credits"), "");
  // ADMIN#1: per-attempt episode jobId so refund pairs per attempt (retry no longer double-charges)
  check("tri: episode jobId unique per attempt (requestId suffix)", serverSrc3.includes("`series_${seriesId}_ep${composed.episodeNumber}_${requestContext.requestId}`"), "");

  // chargeRender: reuses only an OUTSTANDING (non-refunded) charge; refunded charge -> genuine retry charges again
  const { UserAccountStore } = await import(`${base}/api/user-account-store.js`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinPath } = await import("node:path");
  const acctStore = new UserAccountStore({ storePath: joinPath(mkdtempSync(resolve(tmpdir(), "cinejelly-acct-")), "acct.json") });
  const acct = await acctStore.register({ email: "audit@cinejelly.test", password: "pw123456" });
  const acctId = acct.user.userId;
  acctStore.adminAdjust({ email: "audit@cinejelly.test", credits: 1000, note: "seed" });
  acctStore.chargeRender({ userId: acctId, jobId: "job_x", credits: 200 });
  acctStore.chargeRender({ userId: acctId, jobId: "job_x", credits: 200 });
  check("tri: concurrent same-job charge dedupes (outstanding charge reused)", acctStore.balanceOf(acctId) === 800, String(acctStore.balanceOf(acctId)));
  acctStore.refundRender({ userId: acctId, jobId: "job_x", reason: "fail" });
  check("tri: refund restores balance", acctStore.balanceOf(acctId) === 1000, String(acctStore.balanceOf(acctId)));
  acctStore.chargeRender({ userId: acctId, jobId: "job_x", credits: 200 });
  check("tri: retry after refund charges again (no free render)", acctStore.balanceOf(acctId) === 800, String(acctStore.balanceOf(acctId)));

  // USER#1: channel-style dropdown reads real summary fields; USER#2: no duplicate set.quality label collision
  check("tri: channel-style dropdown reads channelName/seriesName/niche", pageSrc3.includes("profile.channelName || profile.seriesName || profile.niche"), "");
  check("tri: quality field uses its own i18n key (no set.quality collision)",
    pageSrc3.includes('data-i18n="set.renderPasses"') && (pageSrc3.match(/data-i18n="set\.quality"/g) || []).length === 1, "");
  ["set.renderPasses"].forEach((key) => {
    const perLocale = (pageSrc3.match(new RegExp('"' + key.replace(".", "\\.") + '":', "g")) || []).length;
    check(`tri: i18n key ${key} present in all 3 locales`, perLocale === 3, String(perLocale));
  });
}

// ------------------------------------------------------------------
// Series customer surface completion: listByOwner + episode videoPath + download route
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const { SeriesContinuityStore } = await import(`${base}/core/series-continuity-store.js`);
  const { SeriesEpisodeDirector } = await import(`${base}/application/series-episode-director.js`);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const storeRoot = mkdtempSync(resolve(tmpdir(), "cinejelly-serieslist-"));
  const store = new SeriesContinuityStore({ outputRoot: storeRoot });

  // Two owners, one series each + one operator series → listByOwner isolates per owner
  const reqA = { premise: "A phim", episodeCount: 2, episodeDurationSeconds: 60, cast: [{ characterId: "a", name: "An", castRole: "protagonist", description: "x" }] };
  const dirA = new SeriesEpisodeDirector({ store, director: { run: async () => { throw new Error("no"); } } });
  const recA = await dirA.startSeries({ ...reqA, seriesId: "uAAA_one" }, "userA");
  await dirA.startSeries({ ...reqA, seriesId: "uBBB_two", premise: "B phim" }, "userB");
  await dirA.startSeries({ ...reqA, seriesId: "op_three", premise: "Op phim" }); // operator, no owner
  const listA = await store.listByOwner("userA");
  check("series-list: listByOwner returns only that owner's series", listA.length === 1 && listA[0].seriesId === "uAAA_one", JSON.stringify(listA.map((r) => r.seriesId)));
  check("series-list: operator series excluded from any customer listing", (await store.listByOwner("userB")).every((r) => r.ownerUserId === "userB"), "");

  // episodeStateFrom records the deliverable video path
  const recordDir = new SeriesEpisodeDirector({
    store,
    director: { async run() {
      return { projectId: "ep_1", storyPlan: { premise: "p", targetDurationSeconds: 60, episodeSummary: "Tập 1.", episodeEndState: "Cuối 1.", scenes: [] },
        deliverable: { projectId: "ep_1", outputPath: `${storeRoot}/series/uAAA_one/ep1/final.mp4`, outputByteSize: 1, outputSha256: "x", clipCount: 1, assembledAt: new Date(), inspection: {} } };
    } }
  });
  const rendered = await recordDir.renderNextEpisode("uAAA_one");
  const st = rendered.record.episodeStates[0];
  check("series-list: episode records the deliverable videoPath", st.videoPath === `${storeRoot}/series/uAAA_one/ep1/final.mp4`, String(st.videoPath));

  // Route wiring + security in server source
  const serverSrc4 = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
  check("series-list: GET /v1/series list route (owner-scoped)", serverSrc4.includes('request.method === "GET" && requestUrl.pathname === "/v1/series"') && serverSrc4.includes("seriesStore.listByOwner(seriesUserId)"), "");
  check("series-list: episode video download route present + ownership + path-confined",
    serverSrc4.includes("seriesVideoMatch") && serverSrc4.includes("episodes\\/(\\d{1,4})\\/video") &&
    serverSrc4.includes("assertSeriesOwnership(videoRecord)") && serverSrc4.includes("resolvedVideoPath.startsWith(seriesVideoRoot + sep)"), "");
  check("series-list: episode render lands the video under the series output folder",
    serverSrc4.includes('resolve(seriesOutputRoot, "series", seriesId, `ep${composed.episodeNumber}`)') && serverSrc4.includes('outputPath: join(episodeDir, "final.mp4")'), "");
  const pageSrc4 = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
  check("series-list: UI loads my series + authed per-episode download", pageSrc4.includes("function loadMySeries") && pageSrc4.includes("authedDownload(ep.videoUrl") && pageSrc4.includes('id="series-list"'), "");
  ["series.mine", "series.downloadEp", "series.resume"].forEach((key) => {
    const n = (pageSrc4.match(new RegExp('"' + key.replace(".", "\\.") + '":', "g")) || []).length;
    check(`series-list: i18n ${key} in all 3 locales`, n === 3, String(n));
  });
}

// ------------------------------------------------------------------
// FINAL LAUNCH AUDIT (user/admin/hacker) — quality + UI + security regression locks
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const { StoryArchitect } = await import(`${base}/agents/story-architect.js`);
  const { planCharacterAnchors, planKeyframeRequests, planCastPortraitRequests } = await import(`${base}/core/keyframe-first-planner.js`);
  const { registerGrammarPromptLine } = await import(`${base}/core/register-grammar.js`);

  // Q1: StoryArchitect coerces the per-character cast appearance sheet
  const castLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured() { return { provider: "x", modelId: "m", content: "{}", raw: {}, latencyMs: 0, value: {
      premise: "p", targetDurationSeconds: 20, register: "natural_phone_kol",
      cast: [{ label: "Linh", appearance: "Vietnamese woman, late 20s, oval face, long black hair, small mole left cheek" }, { label: "Linh", appearance: "dup should drop" }, { label: "", appearance: "no label drop" }],
      scenes: [{ sceneId: "s1", title: "T", beats: [{ beatId: "b1", purpose: "hook", action: "a", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 6, identity: "Linh" }] }] } }; } };
  const castPlan = await new StoryArchitect(castLlm, "m").plan({ projectId: "q", userInput: "x", settings: settingsFor(20, "economy"), references: [], metadata: {} });
  check("launch Q1: cast appearance sheet coerced, deduped, empties dropped", Array.isArray(castPlan.cast) && castPlan.cast.length === 1 && castPlan.cast[0].label === "Linh" && castPlan.cast[0].appearance.includes("oval face"), JSON.stringify(castPlan.cast));

  // Q1: planCharacterAnchors uses the appearance map as staticFeatures; portrait prompt uses it as the anchor
  const anchorShots = [1, 2].map((n) => ({ shotId: "s" + n, sceneId: "sc", beatId: "b" + n, durationSeconds: 6, intent: "x", subject: "a young woman at a sink", action: "act", camera: "c", lighting: "l", references: [], continuity: { identity: "Linh" }, risks: [], metadata: {} }));
  const appearanceMap = new Map([["linh", "Vietnamese woman late 20s oval face long black hair"]]);
  const anchors = planCharacterAnchors(anchorShots, undefined, appearanceMap);
  check("launch Q1: anchor uses appearance sheet as staticFeatures (not scene subject)", anchors.length === 1 && anchors[0].staticFeatures === "Vietnamese woman late 20s oval face long black hair", JSON.stringify(anchors[0] || null));
  const portraitPlans = planCastPortraitRequests({ cast: [{ characterId: "linh", name: "Linh", description: "a young woman at a sink", staticFeatures: "Vietnamese woman late 20s oval face" }], provider: "atlascloud", imageModelId: "google/nano-banana-pro/text-to-image" });
  check("launch Q1: portrait 'Locked identity anchor' uses the clean face sheet", portraitPlans[0].request.prompt.includes("Locked identity anchor: Vietnamese woman late 20s oval face"), "");

  // Q2: per-shot keyframe prompt carries the identity-preservation clause when an identity image is bound
  const kfIdShot = { ...anchorShots[0], references: [{ role: "identity", label: "Linh", providerReference: { kind: "image", uri: "https://cdn.x/linh.png", role: "identity", label: "Linh" }, priority: "primary" }] };
  const kfPlans = planKeyframeRequests({ shots: [kfIdShot], provider: "atlascloud", imageModelId: "google/nano-banana-pro/text-to-image", settings: settingsFor(20, "economy") });
  check("launch Q2: keyframe prompt instructs exact-face preservation when identity ref present", kfPlans[0].request.prompt.includes("EXACT same individuals") && kfPlans[0].request.prompt.includes("do NOT beautify"), "");
  const kfNoId = planKeyframeRequests({ shots: [anchorShots[0]], provider: "atlascloud", imageModelId: "google/nano-banana-pro/text-to-image", settings: settingsFor(20, "economy") });
  check("launch Q2: no identity clause when no identity ref (b-roll)", !kfNoId[0].request.prompt.includes("EXACT same individuals"), "");

  // Q3: scriptwriter system prompt shows the analyst styleDna as a STYLE BIBLE
  let sysCap = "";
  const bibleLlm = { name: "f", capabilities: () => [],
    async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured(req) { sysCap = (req.messages || []).find((m) => m.role === "system")?.content ?? ""; return castLlm.structured(); } };
  await new StoryArchitect(bibleLlm, "m").plan({ projectId: "q", userInput: "x", settings: settingsFor(20, "economy"), references: [], metadata: {}, creativeIntent: { schemaVersion: "v1", register: "natural_phone_kol", genre: "g", niche: "n", audience: "a", language: "vi", tone: "t", emotionArc: "e", pacingProfile: "p", visualWorld: "v", storyEngine: { conflict: "c", stakes: "s", payoff: "p" }, styleDna: { register: "natural_phone_kol", optics: "26mm phone lens", lighting: "window light" } } });
  check("launch Q3: analyst styleDna passed to scriptwriter as STYLE BIBLE", sysCap.includes("STYLE BIBLE") && sysCap.includes("26mm phone lens"), "");
  check("launch Q3+Q1: scriptwriter asked for CAST APPEARANCE sheet", sysCap.includes("CAST APPEARANCE"), "");

  // Q4: register axes are NOT double-printed when styleDna overrides them
  const cShot = { shotId: "z", sceneId: "sc", beatId: "b", durationSeconds: 8, intent: "x", subject: "s", action: "a", camera: "c", lighting: "l", references: [], continuity: {}, risks: [], metadata: {}, styleDna: { register: "natural_phone_kol", optics: "grainy 26mm phone lens", lighting: "harsh noon sun" } };
  const cPrompt = compiler.compile({ shot: cShot, settings: settingsFor(20, "economy"), modelId: "m", provider: "atlascloud" }).prompt;
  check("launch Q4: authored optics override present", cPrompt.includes("Optics (this video): grainy 26mm phone lens."), "");
  check("launch Q4: register default optics NOT also printed (deduped)", !cPrompt.includes("near-deep focus with only mild natural depth"), "");
  const noDnaLine = registerGrammarPromptLine("natural_phone_kol");
  check("launch Q4: full register frame still emits all axes when nothing omitted", noDnaLine.includes("near-deep focus") && noDnaLine.includes("In-camera sound only"), "");

  // Q6: LANGUAGE_CONTRACT carries the concrete VN forbidden->required exemplar
  const architectSrc = readFileSync(resolve(repoRoot, "src/agents/story-architect.ts"), "utf8");
  check("launch Q6: VN spoken exemplar (forbidden vs required) in language contract", architectSrc.includes("FORBIDDEN (written/stiff") && architectSrc.includes("mình xài mê luôn"), "");

  // Q9: creative-intent line leads with the emotional turn when present
  const turnShot = { ...cShot, emotionalTurn: "skeptical -> delighted" };
  const turnPrompt = compiler.compile({ shot: turnShot, settings: settingsFor(20, "economy"), modelId: "m", provider: "atlascloud" }).prompt;
  check("launch Q9: creative intent leads with the emotional turn", turnPrompt.includes("Creative intent: land the shift skeptical -> delighted"), "");

  // U1/U2: create-flow confirm dialog + dead-checkbox hide + estimate refresh
  const pageSrc = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
  check("launch U1: customer render shows a cost confirm dialog before charging", pageSrc.includes("confirm.renderPrefix") && pageSrc.includes("window.confirm(msg)"), "");
  check("launch U1: confirm-render checkbox hidden for customers (operator-only)", pageSrc.includes("confirmRenderLabel.style.display = operatorMode"), "");
  check("launch U2: credit estimate refreshes after template + mode change", (pageSrc.match(/updateCreditEstimate\(\);/g) || []).length >= 3, "");

  // S1: product-url researcher uses ssrfSafeFetch (per-hop guard), not redirect:follow
  const researcherSrc = readFileSync(resolve(repoRoot, "src/core/product-url-researcher.ts"), "utf8");
  check("launch S1: product-url fetch routed through ssrfSafeFetch (no blind redirect follow)", researcherSrc.includes("return ssrfSafeFetch(url, safeInit"), "");

  // S2/S3: rate limiter covers redub/series/planning POSTs + GET /v1/series
  const rlSrc = readFileSync(resolve(repoRoot, "src/api/api-rate-limit.ts"), "utf8");
  check("launch S2: redub + series-episode POSTs rate-limited under render class", rlSrc.includes('pathname === "/v1/redub/plans"') && rlSrc.includes("episodes\\/next(\\/preview)?"), "");
  check("launch S3: GET /v1/series rate-limited (anti tenant-scan flood)", rlSrc.includes('method === "GET"') && rlSrc.includes('pathname === "/v1/series" ? "account"'), "");
}

// ------------------------------------------------------------------
// QUALITY UPGRADES (niche custom playbook, micro-drama, script-enhancer, reference-vision)
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const { nichePlaybookDirective, resolveNichePlaybookMatch } = await import(`${base}/core/niche-playbooks.js`);
  const { ScriptEnhancer } = await import(`${base}/agents/script-enhancer.js`);
  const { ReferenceVisionAnalyst } = await import(`${base}/agents/reference-vision-analyst.js`);

  // #3 smart niche: unknown niche -> custom playbook composed from intent; known niche -> fixed family
  check("upg#3: unknown niche does NOT match a fixed family", resolveNichePlaybookMatch({ niche: "real estate walkthrough" }).matched === false, "");
  check("upg#3: known niche still matches its family", resolveNichePlaybookMatch({ creativeMode: "ugc_review" }).matched === true, "");
  const customDir = nichePlaybookDirective({ niche: "luxury apartment walkthrough", creativeIntent: {
    register: "professional_cinematic", genre: "real-estate tour", niche: "luxury apartment walkthrough", tone: "aspirational", emotionArc: "curious -> impressed",
    pacingProfile: "measured", visualWorld: "sunlit apartment", storyEngine: { conflict: "buyers can't picture living there", stakes: "the sale", payoff: "they see themselves home" },
    styleDna: { optics: "wide 24mm gliding dolly", audioFeel: "quiet room tone" } } });
  check("upg#3: unknown niche gets a TAILORED custom playbook (not generic grounded)", customDir.includes("custom:luxury_apartment_walkthrough") && customDir.includes("buyers can't picture living there") && customDir.includes("wide 24mm gliding dolly"), "");
  check("upg#3: without intent, unknown niche falls back to grounded (no crash)", nichePlaybookDirective({ niche: "totally unknown xyz" }).includes("grounded_general"), "");

  // #5 micro-drama: talking-head naturalness clause fires only for spoken shots
  const talkShot = { shotId: "s", sceneId: "sc", beatId: "b", durationSeconds: 8, intent: "x", subject: "Linh", action: "talks", camera: "selfie", lighting: "window", references: [], continuity: {}, risks: [], metadata: {}, spokenLine: "Ôi mềm thật nha", styleDna: { register: "natural_phone_kol" } };
  const talkP = compiler.compile({ shot: talkShot, settings: settingsFor(20, "economy"), modelId: "m", provider: "atlascloud" }).prompt;
  check("upg#5: talking shot gets naturalness clause (small mouth, no music under line)", talkP.includes("keep mouth movement small") && talkP.includes("no music swelling under the line"), "");
  const brollP = compiler.compile({ shot: { ...talkShot, spokenLine: undefined }, settings: settingsFor(20, "economy"), modelId: "m", provider: "atlascloud" }).prompt;
  check("upg#5: b-roll (no line) gets NO talking-head clause", !brollP.includes("keep mouth movement small"), "");

  // #2 script-enhancer: merge-by-beatId, structure-preserving, script-first-safe, fail-open
  const enhPlan = { premise: "p", targetDurationSeconds: 20, scenes: [{ sceneId: "s1", title: "S", beats: [
    { beatId: "b1", purpose: "hook", action: "she is happy", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 6, spokenLine: "Tôi thích cái này", emotionalTurn: "x", risks: [], references: [], continuity: {} },
    { beatId: "b2", purpose: "demo", action: "product shown", subject: "Linh", camera: "c", lighting: "l", durationSeconds: 6, risks: [], references: [], continuity: {} }
  ] }] };
  const enhIntake = { projectId: "q", userInput: "x", settings: {}, references: [], creativeIntent: { register: "natural_phone_kol", tone: "gần gũi", emotionArc: "e", language: "vi" } };
  const enhLlm = { name: "f", capabilities: () => [], async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured() { return { provider: "x", modelId: "m", content: "{}", raw: {}, latencyMs: 0, value: { beats: [
      { beatId: "b1", action: "she clenches a fist, eyes crinkling", spokenLine: "Ôi mình mê luôn á", emotionalTurn: "dửng dưng -> mê" },
      { beatId: "b2", spokenLine: "MUST NOT be added", action: "hands rotate the bottle" },
      { beatId: "ghost", action: "ignored" }
    ] } }; } };
  const enhanced = await new ScriptEnhancer(enhLlm, "m").enhance(enhPlan, enhIntake, false);
  const eb1 = enhanced.scenes[0].beats[0], eb2 = enhanced.scenes[0].beats[1];
  check("upg#2: enhancer polishes action/spokenLine/turn by beatId", eb1.action.includes("clenches a fist") && eb1.spokenLine.includes("mê luôn á") && eb1.emotionalTurn.includes("->"), "");
  check("upg#2: enhancer never adds dialogue to a silent b-roll beat", eb2.spokenLine === undefined && eb2.action.includes("rotate the bottle"), "");
  check("upg#2: enhancer preserves structure + ignores ghost beats", enhanced.scenes.length === 1 && enhanced.scenes[0].beats.length === 2, "");
  const enhScriptFirst = await new ScriptEnhancer(enhLlm, "m").enhance(enhPlan, enhIntake, true);
  check("upg#2: script-first keeps verbatim spokenLine, still polishes action", enhScriptFirst.scenes[0].beats[0].spokenLine === "Tôi thích cái này" && enhScriptFirst.scenes[0].beats[0].action.includes("clenches"), "");
  const enhBad = { name: "f", capabilities: () => [], async chat() { throw new Error("x"); }, async structured() { throw new Error("x"); } };
  const enhFail = await new ScriptEnhancer(enhBad, "m").enhance(enhPlan, enhIntake, false);
  check("upg#2: enhancer fail-open returns original plan unchanged", enhFail.scenes[0].beats[0].action === "she is happy", "");

  // #1 reference-vision: only https images sent, coerce known labels, fail-open, no-image = no cost
  let visSent = 0;
  const visLlm = { name: "f", capabilities: () => [], async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured(req) { const parts = req.messages[0].content; visSent = Array.isArray(parts) ? parts.filter((p) => p.type === "image_url").length : 0;
      return { provider: "x", modelId: "m", content: "{}", raw: {}, latencyMs: 0, value: { assets: [ { label: "serum", descriptor: "frosted glass, teal label AQUA" }, { label: "ghost", descriptor: "drop me" } ] } }; } };
  const visRefs = [
    { role: "product", label: "serum", providerReference: { kind: "image", uri: "https://cdn.x/s.png", role: "product", label: "serum" } },
    { role: "identity", label: "linh", providerReference: { kind: "image", uri: "asset://linh" } },
    { role: "style", label: "mb", providerReference: { kind: "video", uri: "https://cdn.x/v.mp4" } }
  ];
  const visDesc = await new ReferenceVisionAnalyst(visLlm, "m").describe(visRefs, {});
  check("upg#1: vision sends ONLY https image refs (1 of 3)", visSent === 1, String(visSent));
  check("upg#1: vision coerces known-label descriptor, drops unknown", visDesc.length === 1 && visDesc[0].label === "serum" && visDesc[0].descriptor.includes("AQUA"), "");
  // Role-prefixed / index-prefixed label echo still binds to the canonical label (cross-audit LOW #3)
  const visLlm2 = { name: "f", capabilities: () => [], async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured() { return { provider: "x", modelId: "m", content: "{}", raw: {}, latencyMs: 0, value: { assets: [ { label: 'product:"serum"', descriptor: "teal bottle" } ] } }; } };
  const visDesc2 = await new ReferenceVisionAnalyst(visLlm2, "m").describe(visRefs, {});
  check("upg#1: role-prefixed label echo still binds to canonical label", visDesc2.length === 1 && visDesc2[0].label === "serum", JSON.stringify(visDesc2));
  check("upg#1: vision no https image -> empty (zero extra cost)", (await new ReferenceVisionAnalyst(visLlm, "m").describe([{ role: "product", label: "x", providerReference: { kind: "image", uri: "asset://x" } }], {})).length === 0, "");
  check("upg#1: vision fail-open -> empty", (await new ReferenceVisionAnalyst(enhBad, "m").describe(visRefs, {})).length === 0, "");

  // Wiring: analyst reads vision descriptors; director runs vision->analyst->enhancer; cost counts them
  const analystSrc = readFileSync(resolve(repoRoot, "src/agents/creative-brief-analyst.js".replace(".js", ".ts")), "utf8");
  check("upg#1: analyst payload includes referenceVisuals", analystSrc.includes("referenceVisuals"), "");
  const dirSrc = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");
  check("upg: director runs vision -> analyst -> enhancer, all fail-open", /referenceVisionAnalyst!?\.describe/.test(dirSrc) && dirSrc.includes("this.scriptEnhancer.enhance") && dirSrc.includes("visionEligible"), "");
  check("upg: cost gate counts analyst+enhancer+vision LLM calls (vision counted when CALL made)", dirSrc.includes("this.scriptEnhancer ? 1 : 0") && dirSrc.includes("visionEligible ? 1 : 0"), "");
  check("upg#2 fix: known metadata niche fed FIRST for fixed-family match", readFileSync(resolve(repoRoot, "src/agents/story-architect.ts"), "utf8").includes("intake.metadata?.shortViralNiche ?? intake.metadata?.niche ?? intake.creativeIntent?.niche"), "");
}

// ------------------------------------------------------------------
// DEEP-AUDIT FIXES (pre-launch): SSRF, series atomicity/lock, abort, avatarPlan, DoS bounds
// ------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const { isLocalHost } = await import(`${base}/utils/ssrf-guard.js`);
  // SSRF host classification incl. CGNAT + benchmark ranges
  check("da-ssrf: private/internal hosts classified (incl CGNAT 100.64/10, 198.18/15)",
    isLocalHost("169.254.169.254") && isLocalHost("10.0.0.5") && isLocalHost("127.0.0.1") && isLocalHost("100.64.0.1") && isLocalHost("198.18.0.1") && isLocalHost("localhost") && isLocalHost("::1"), "");
  check("da-ssrf: public hosts NOT blocked", !isLocalHost("cdn.example.com") && !isLocalHost("8.8.8.8") && !isLocalHost("99.99.99.99"), "");
  // Reference-vision analyst skips internal-host images (SSRF), keeps public
  const { ReferenceVisionAnalyst } = await import(`${base}/agents/reference-vision-analyst.js`);
  let visImages = 0;
  const visSpy = { name: "f", capabilities: () => [], async chat() { return { content: "{}", raw: {}, latencyMs: 0, provider: "x", modelId: "m" }; },
    async structured(req) { const parts = req.messages[0].content; visImages = Array.isArray(parts) ? parts.filter((p) => p.type === "image_url").length : 0; return { provider: "x", modelId: "m", content: "{}", raw: {}, latencyMs: 0, value: { assets: [] } }; } };
  const mixedRefs = [
    { role: "product", label: "ok", providerReference: { kind: "image", uri: "https://cdn.example.com/p.png", role: "product", label: "ok" } },
    { role: "identity", label: "evil", providerReference: { kind: "image", uri: "https://169.254.169.254/", role: "identity", label: "evil" } },
    { role: "product", label: "evil2", providerReference: { kind: "image", uri: "https://10.0.0.5/x.png", role: "product", label: "evil2" } }
  ];
  await new ReferenceVisionAnalyst(visSpy, "m").describe(mixedRefs, {});
  check("da-ssrf: vision analyst skips internal-host images, sends only the public one", visImages === 1, String(visImages));
  // Admission rejects internal-host https reference; series cast rejects internal + bounds size
  const admissionSrc = readFileSync(resolve(repoRoot, "src/api/render-request-admission.ts"), "utf8");
  check("da-ssrf: admission blocks internal-host https reference URI", admissionSrc.includes("isLocalHost(parsed.hostname)"), "");
  const dramaSrc = readFileSync(resolve(repoRoot, "src/core/series-drama-planner.ts"), "utf8");
  check("da-ssrf+dos: series cast blocks internal host + MAX_CAST bound", dramaSrc.includes("MAX_CAST_MEMBERS") && dramaSrc.includes("isLocalHost(host)"), "");
  const { planSeriesDrama } = await import(`${base}/core/series-drama-planner.js`);
  let castRejected = false;
  try { planSeriesDrama({ premise: "p", episodeCount: 2, episodeDurationSeconds: 60, cast: Array.from({ length: 41 }, (_, i) => ({ characterId: "c" + i, name: "N" + i, castRole: "support", description: "d" })) }); } catch { castRejected = true; }
  check("da-dos: >40 cast members rejected at plan time", castRejected, "");
  let evilUriRejected = false;
  try { planSeriesDrama({ premise: "p", episodeCount: 2, episodeDurationSeconds: 60, cast: [{ characterId: "c", name: "N", castRole: "protagonist", description: "d", identityReferenceUri: "https://169.254.169.254/" }] }); } catch { evilUriRejected = true; }
  check("da-ssrf: series cast internal identity URI rejected", evilUriRejected, "");

  // Series render: chargeRender is INSIDE the try (finally always releases lock+slot)
  const serverSrc5 = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
  check("da-series: chargeRender moved inside try (no lock/slot leak on 402)",
    serverSrc5.includes("chargeRender re-validates balance and can THROW 402; it MUST be inside the try"), "");
  check("da-series: GET /v1/series/:id returns curated DTO, not raw record", serverSrc5.includes("Project a curated DTO — never echo raw episodeState.videoPath"), "");

  // Series store: unique temp path + per-series write lock + load distinguishes ENOENT vs corrupt
  const { SeriesContinuityStore } = await import(`${base}/core/series-continuity-store.js`);
  const { SeriesEpisodeDirector } = await import(`${base}/application/series-episode-director.js`);
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinP } = await import("node:path");
  const daRoot = mkdtempSync(resolve(tmpdir(), "cinejelly-da-"));
  const daStore = new SeriesContinuityStore({ outputRoot: daRoot });
  const storeSrc = readFileSync(resolve(repoRoot, "src/core/series-continuity-store.ts"), "utf8");
  check("da-store: unique temp path per write (pid+counter)", storeSrc.includes("`${path}.${process.pid}.${this.tempCounter}.tmp`"), "");
  check("da-store: per-series write lock serializes RMW", storeSrc.includes("withSeriesLock") && storeSrc.includes("this.writeLocks"), "");
  check("da-store: load distinguishes ENOENT (absent) from corrupt (surface)", storeSrc.includes('error as NodeJS.ErrnoException).code === "ENOENT"'), "");
  // Concurrent recordEpisode serialize (no dropped episode) via the store lock
  const daDir = new SeriesEpisodeDirector({ store: daStore, director: { async run() { throw new Error("no"); } } });
  const rec = await daDir.startSeries({ premise: "P", episodeCount: 3, episodeDurationSeconds: 60, cast: [{ characterId: "a", name: "A", castRole: "protagonist", description: "x" }] }, "u1");
  await Promise.all([
    daStore.recordEpisode(rec.seriesId, { episodeNumber: 1, projectId: "p1", summary: "s1", endState: "e1", macroPhase: "setup", recordedAt: new Date().toISOString() }),
    daStore.recordEpisode(rec.seriesId, { episodeNumber: 2, projectId: "p2", summary: "s2", endState: "e2", macroPhase: "setup", recordedAt: new Date().toISOString() })
  ]);
  const daFinal = await daStore.load(rec.seriesId);
  check("da-store: concurrent recordEpisode keeps BOTH episodes (no lost update)", daFinal.episodeStates.length === 2, String(daFinal.episodeStates.length));
  // Corrupt file surfaces (not silently 'absent')
  writeFileSync(daStore.pathFor("corrupt_series"), "{ this is not json", "utf8");
  let corruptSurfaced = false;
  try { await daStore.load("corrupt_series"); } catch { corruptSurfaced = true; }
  check("da-store: corrupt-but-present series surfaces (never treated as absent/reset)", corruptSurfaced, "");

  // Image-abort rethrow (mirror talking stage) + avatarPlan carried across chaining
  const dirSrc2 = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");
  check("da-abort: image + portrait gen rethrow on signal.aborted", (dirSrc2.match(/if \(input\.signal\?\.aborted\) \{\s*throw error;/g) || []).length >= 2, "");
  check("da-avatar: avatarPlan carried onto recompiled chained/fallback prompt", dirSrc2.includes("chainedAvatarPlan") && dirSrc2.includes("fallbackAvatarPlan"), "");

  // Duck dub original bed apad; job history resilient load; register re-check
  const mixSrc2 = readFileSync(resolve(repoRoot, "src/core/audio-mix-engine.ts"), "utf8");
  check("da-dub: duck original bed apad'd so dub spans full video", mixSrc2.includes("volume=${this.safeVolume(input.options.originalVolume)},apad[a0]"), "");
  const jobMgrSrc = readFileSync(resolve(repoRoot, "src/api/render-job-manager.ts"), "utf8");
  check("da-boot: restoreHistory degrades to empty on load failure, skips bad records", jobMgrSrc.includes("degrade to an empty history") && jobMgrSrc.includes("Skip a single malformed record"), "");
  const acctSrc = readFileSync(resolve(repoRoot, "src/api/user-account-store.ts"), "utf8");
  check("da-race: register re-checks email after scrypt await", acctSrc.includes("Re-check AFTER the scrypt await"), "");
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
