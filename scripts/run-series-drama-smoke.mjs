/**
 * No-spend smoke for the Series Drama Planner.
 * Proves: a premise plus cast becomes a full multi-episode plan with a series bible,
 * 3-second cold-open hooks, phase-mapped conflicts, cliffhanger endings on every episode
 * except the finale, an ending-state -> recap-hook chain across episodes, identity-locked
 * render requests, and a compiler prompt that swaps the settled ending for a cliffhanger
 * on the final shot. No network, no provider calls, no spend.
 */

import { episodeRenderRequestFor, planSeriesDrama } from "../dist/core/series-drama-planner.js";
import { SeedancePromptCompiler } from "../dist/prompt_compiler/prompt-compiler.js";
import { DEFAULT_SEEDANCE_SETTINGS } from "../dist/types/settings.js";
import { NICHE_DNA } from "../dist/core/seedance-dna.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

const request = {
  premise: "A dismissed housekeeper returns as the hidden heiress of the family empire",
  genre: "revenge melodrama",
  episodeCount: 8,
  episodeDurationSeconds: 60,
  cast: [
    {
      characterId: "kol_lead_female",
      name: "Lan",
      castRole: "protagonist",
      description: "mid-20s woman, calm surface with steel underneath",
      identityReferenceUri: "https://example.com/refs/lan-face.jpg"
    },
    {
      characterId: "villain_madam",
      name: "Madam Vu",
      castRole: "antagonist",
      description: "elegant matriarch who controls the family company"
    }
  ]
};

const plan = planSeriesDrama(request);

// 1. Series bible locks identity and world across episodes.
check("bible_has_consistency_contract", plan.bible.consistencyContract.length >= 4);
check("bible_locks_cast_faces", plan.bible.consistencyContract.some((line) => line.includes("kol_lead_female")));
check("macro_arc_covers_all_episodes", plan.bible.macroArc.flatMap((entry) => entry.episodeNumbers).length === 8);
check("finale_phase_assigned", plan.bible.macroArc.some((entry) => entry.phase === "finale" && entry.episodeNumbers.includes(8)));

// 2. Episode structure: hooks, twists, cliffhangers, finale resolution.
check("eight_episodes_planned", plan.episodes.length === 8);
check("every_episode_has_3s_cold_open", plan.episodes.every((ep) => ep.coldOpenHook.includes("first 3 seconds")));
check("episodes_1_to_7_cliffhanger", plan.episodes.slice(0, 7).every((ep) => ep.endingStyle === "cliffhanger"));
check("finale_resolves", plan.episodes[7].endingStyle === "resolution");
check("cliffhanger_cuts_before_resolution", plan.episodes[0].endingDirective.includes("BEFORE the resolution"));
check("beats_tile_60s", plan.episodes.every((ep) => Math.abs(ep.beats[ep.beats.length - 1].endSecond - 60) < 1e-9));

// 3. Ending-state chains into the next episode's recap hook.
check("episode_1_has_no_recap", plan.episodes[0].recapHook === undefined);
const chainHolds = plan.episodes.slice(1).every((ep, index) => ep.recapHook?.includes(plan.episodes[index].endingState));
check("recap_chain_holds_across_episodes", chainHolds);

// 4. Render request carries identity locks + series metadata.
const ep3 = episodeRenderRequestFor(plan, 3);
check("request_duration_60s", ep3.settings?.durationTargetSeconds === 60);
check("request_carries_identity_reference", (ep3.references ?? []).some((ref) => ref.role === "identity" && ref.label === "kol_lead_female"));
check("request_metadata_series", ep3.metadata?.seriesId === plan.bible.seriesId && ep3.metadata?.episodeNumber === "3");
check("request_metadata_cliffhanger", ep3.metadata?.videoEndingStyle === "cliffhanger");
check("request_metadata_drama_niche", ep3.metadata?.niche === "drama_series" && ep3.metadata?.creativeMode === "story");
check("request_brief_contains_beats", ep3.userInput.includes("Beat plan:") && ep3.userInput.includes("Cold open (first 3 seconds)"));
const finale = episodeRenderRequestFor(plan, 8);
check("finale_metadata_resolution", finale.metadata?.videoEndingStyle === "resolution");

// 5. Drama DNA exists for the niche the request declares.
check("drama_series_dna_present", Boolean(NICHE_DNA.drama_series));

// 6. Compiler swaps settled ending for cliffhanger on the final shot.
const compiler = new SeedancePromptCompiler();
function compileClosingShot(videoEndingStyle) {
  return compiler.compile({
    shot: {
      shotId: "shot_series_smoke",
      durationSeconds: 10,
      intent: "Final confrontation of the episode",
      subject: "Lan facing Madam Vu across the dinner table",
      action: "Lan slides the hidden document across the table; Madam Vu freezes mid-reach",
      camera: "Slow push-in to a two-shot, then tight close-up",
      lighting: "Warm chandelier key with hard rim",
      references: [],
      continuity: {},
      risks: [],
      metadata: { videoArcRole: "closing_resolve", ...(videoEndingStyle ? { videoEndingStyle } : {}) }
    },
    settings: { ...DEFAULT_SEEDANCE_SETTINGS },
    modelId: "seedance-2-0-smoke",
    provider: "atlascloud"
  });
}
const cliffPrompt = compileClosingShot("cliffhanger").prompt;
check("compiler_emits_cliffhanger_directive", cliffPrompt.includes("cut BEFORE the resolution lands"));
check("compiler_drops_settled_ending", !cliffPrompt.includes("feels finished"));
check("compiler_holds_unresolved_final_beat", cliffPrompt.includes("holds the unresolved cliffhanger frame at 10s"));
const settledPrompt = compileClosingShot(undefined).prompt;
check("default_closing_still_settles", settledPrompt.includes("Video ending: this is the final shot"));

// 7. Validation guards.
let rejected = false;
try {
  planSeriesDrama({ ...request, cast: [] });
} catch {
  rejected = true;
}
check("empty_cast_rejected", rejected);
let badUriRejected = false;
try {
  planSeriesDrama({
    ...request,
    cast: [{ characterId: "x", name: "X", castRole: "protagonist", description: "d", identityReferenceUri: "http://insecure.example.com/a.jpg" }]
  });
} catch {
  badUriRejected = true;
}
check("insecure_identity_uri_rejected", badUriRejected);
const single = planSeriesDrama({ ...request, episodeCount: 1 });
check("single_episode_resolves", single.episodes[0].endingStyle === "resolution");


// --- FACE PINNING ACROSS EPISODES (Phase 1). An invented character used to get a brand-new face
// every episode: the store had the identityReferenceUri slot and already reused it, but nothing
// ever wrote it (only customer uploads did). The director now returns the portraits it actually
// bound, and recordEpisode backfills them append-only — episode 1 locks the face, later episodes
// can never overwrite it.
const { SeriesContinuityStore } = await import("../dist/core/series-continuity-store.js");
const { mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join: joinPath } = await import("node:path");
const seriesRoot = mkdtempSync(joinPath(tmpdir(), "series-face-smoke-"));
const faceStore = new SeriesContinuityStore({ outputRoot: seriesRoot });
const faceBible = {
  seriesId: "face_s1", title: "T", world: "w", tone: "t", consistencyContract: "c",
  cast: [{ characterId: "linh", name: "Linh", castRole: "lead", description: "nu chinh" }]
};
await faceStore.create({ seriesId: "face_s1", premise: "p", episodeCount: 5 }, faceBible);
const epState = (n, phase) => ({ episodeNumber: n, projectId: `p${n}`, summary: "s", endState: "e", macroPhase: phase, recordedAt: new Date().toISOString() });
await faceStore.recordEpisode("face_s1", epState(1, "setup"), [], [{ characterKey: "linh", label: "Linh", uri: "https://cdn.example/linh-ep1.png" }]);
const afterEp1 = await faceStore.load("face_s1");
check("series_pins_face_from_first_episode", afterEp1.cast[0].identityReferenceUri === "https://cdn.example/linh-ep1.png", String(afterEp1.cast[0].identityReferenceUri));
await faceStore.recordEpisode("face_s1", epState(2, "escalation"), [], [{ characterKey: "linh", label: "Linh", uri: "https://cdn.example/linh-DIFFERENT.png" }]);
const afterEp2 = await faceStore.load("face_s1");
check("series_never_overwrites_a_pinned_face", afterEp2.cast[0].identityReferenceUri === "https://cdn.example/linh-ep1.png", String(afterEp2.cast[0].identityReferenceUri));
// A character discovered mid-series also gets its face pinned on the episode it appears in.
await faceStore.recordEpisode("face_s1", epState(3, "escalation"),
  [{ characterId: "mai", name: "Mai", castRole: "support", description: "ban than" }],
  [{ characterKey: "mai", label: "Mai", uri: "https://cdn.example/mai-ep3.png" }]);
const afterEp3 = await faceStore.load("face_s1");
check("series_pins_face_for_midseries_character", afterEp3.cast.find((m) => m.characterId === "mai")?.identityReferenceUri === "https://cdn.example/mai-ep3.png");
// The director must actually expose what it bound, or nothing above can ever be fed.
const { readFileSync: readSrc } = await import("node:fs");
const directorSrc = readSrc(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
check("director_returns_bound_character_anchors", directorSrc.includes("characterAnchors: boundCharacterAnchors"));
const episodeDirectorSrc = readSrc(new URL("../src/application/series-episode-director.ts", import.meta.url), "utf8");
check("episode_director_persists_anchors", episodeDirectorSrc.includes("result.characterAnchors"));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.series-drama-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing series-drama-planner.ts, the cliffhanger compiler seam, or duration-scripting arc roles.",
    "Rendering a planned episode still passes the normal review/cost/confirmation gates; no provider spend happens from planning."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
