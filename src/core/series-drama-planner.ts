/**
 * Series Drama Planner.
 *
 * Turns one premise plus cast references into a complete multi-episode short-drama plan
 * (duanju-style): a series bible that locks characters/world/tone across episodes, and a
 * per-episode plan with a 3-second cold-open hook, escalating conflict beats, a late twist,
 * and a cliffhanger that cuts before resolution — with only the finale allowed to resolve.
 * Episode ending state chains into the next episode's recap hook so a whole season plays
 * as one continuous story.
 *
 * The retention formula encoded here follows widely documented short-drama practice:
 * hook inside the first 3 seconds (action, never scenery), reversal/twist around 70-80%
 * of the runtime, cliffhanger cut in the final seconds before the payoff lands, whole-arc
 * planning before episode one, and minimal dialogue reliance. Plans are deterministic and
 * no-spend; rendering happens later through the normal request/review/render gates.
 */

import type { CineJellyProjectRequest } from "../types/agent.js";
import type { AspectRatio } from "../types/settings.js";
import type { PromptReference } from "../types/prompt.js";
import { assignVideoArcRoles, planDurationBeats, type DurationBeat } from "./duration-scripting.js";
import { isLocalHost } from "../utils/ssrf-guard.js";
import { createStableId } from "../utils/ids.js";

export type SeriesMacroPhase = "setup" | "escalation" | "midpoint_reversal" | "crisis" | "finale";

export type EpisodeEndingStyle = "cliffhanger" | "resolution";

export interface SeriesCastMember {
  readonly characterId: string;
  readonly name: string;
  readonly castRole: "protagonist" | "antagonist" | "love_interest" | "support";
  readonly description: string;
  /**
   * Unchanging identity anchor (face shape, hair, build, age impression). This is what
   * every episode must keep identical; used for auto-portrait prompts when no image exists.
   */
  readonly staticFeatures?: string;
  /** Per-episode changeable presentation (wardrobe, props, styling). */
  readonly dynamicFeatures?: string;
  /** Optional clean https:// or asset:// image of the real face/KOL to lock identity. */
  readonly identityReferenceUri?: string;
}

export interface SeriesDramaRequest {
  readonly premise: string;
  readonly genre?: string;
  readonly tone?: string;
  readonly world?: string;
  readonly language?: string;
  readonly episodeCount: number;
  readonly episodeDurationSeconds: number;
  readonly aspectRatio?: AspectRatio;
  readonly cast: readonly SeriesCastMember[];
  readonly seriesId?: string;
}

export interface SeriesBible {
  readonly seriesId: string;
  readonly premise: string;
  readonly genre: string;
  readonly tone: string;
  readonly world: string;
  readonly language: string;
  readonly cast: readonly SeriesCastMember[];
  /** Consistency contract lines every episode must obey. */
  readonly consistencyContract: readonly string[];
  readonly macroArc: readonly { readonly phase: SeriesMacroPhase; readonly episodeNumbers: readonly number[] }[];
}

export interface EpisodeBeat extends DurationBeat {
  readonly dramaDirective: string;
}

export interface EpisodePlan {
  readonly episodeNumber: number;
  readonly episodeId: string;
  readonly title: string;
  readonly logline: string;
  readonly macroPhase: SeriesMacroPhase;
  /** One-line visual recap that reconnects returning viewers inside the cold open. */
  readonly recapHook?: string;
  /** First-3-seconds directive: open mid-action or mid-confrontation, never scenery. */
  readonly coldOpenHook: string;
  readonly beats: readonly EpisodeBeat[];
  readonly twist: string;
  readonly endingStyle: EpisodeEndingStyle;
  /** Final-seconds directive; cliffhangers cut before the payoff lands. */
  readonly endingDirective: string;
  /** Story state at cut-to-black; becomes the next episode's recap hook. */
  readonly endingState: string;
  readonly continuityAnchors: readonly string[];
}

export interface SeriesDramaPlan {
  readonly schemaVersion: "cinejelly.series-drama-plan.v1";
  readonly bible: SeriesBible;
  readonly episodes: readonly EpisodePlan[];
  readonly noSpend: true;
}

const MIN_EPISODES = 1;
const MAX_EPISODES = 200;
const MIN_EPISODE_SECONDS = 15;
const MAX_EPISODE_SECONDS = 480;
const MAX_CAST_MEMBERS = 40;

const PHASE_CONFLICT: Record<SeriesMacroPhase, string> = {
  setup:
    "introduce the central desire and the first visible obstacle through action; plant one foreshadowing detail in frame without explaining it",
  escalation:
    "raise the cost of the conflict with a new visible pressure (rival move, deadline, discovery); the protagonist's usual tactic fails on camera",
  midpoint_reversal:
    "flip the audience's understanding: an ally betrays, an identity is revealed, or the goal turns out to be a trap; play the reversal on faces, not narration",
  crisis:
    "push the protagonist to the lowest visible point; strip a resource, relationship, or disguise on camera and force an impossible choice",
  finale:
    "pay off the planted foreshadowing, confront the antagonist directly, and let the protagonist's changed behavior win the moment on screen"
};

const ENDING_CLIFFHANGER_DIRECTIVE =
  "Cliffhanger ending: in the final seconds, cut BEFORE the resolution lands — freeze the confrontation, the reveal half-seen, or the reply unspoken; hold a clean readable frame of the unresolved moment so the viewer must watch the next episode. Do not resolve, do not fade to a settled afterglow.";

const ENDING_RESOLUTION_DIRECTIVE =
  "Finale ending: land the full payoff on screen, give the emotional afterglow one held readable beat, and settle into a clean finished end frame that closes the whole series.";

export function planSeriesDrama(request: SeriesDramaRequest): SeriesDramaPlan {
  validateRequest(request);
  const seriesId = request.seriesId?.trim() || createStableId("series", `${request.premise}:${request.episodeCount}`);
  const bible = buildBible(seriesId, request);
  const episodes: EpisodePlan[] = [];
  for (let episodeNumber = 1; episodeNumber <= request.episodeCount; episodeNumber += 1) {
    const previous = episodes[episodes.length - 1];
    episodes.push(buildEpisode({ request, bible, episodeNumber, previous }));
  }
  return {
    schemaVersion: "cinejelly.series-drama-plan.v1",
    bible,
    episodes,
    noSpend: true
  };
}

/**
 * Convert one planned episode into a render request for the normal pipeline. The request
 * carries the series/episode metadata (so prompts get drama DNA plus the correct ending
 * style) and the cast identity references (so faces stay locked across every episode).
 * No provider call happens here; the request still passes review/cost/confirmation gates.
 */
export function episodeRenderRequestFor(
  plan: SeriesDramaPlan,
  episodeNumber: number
): CineJellyProjectRequest {
  const episode = plan.episodes.find((item) => item.episodeNumber === episodeNumber);
  if (!episode) {
    throw new Error(`Episode ${episodeNumber} is not part of series ${plan.bible.seriesId}.`);
  }
  const references = castIdentityReferences(plan.bible.cast);
  const beatLines = episode.beats.map(
    (beat) => `[${beat.startSecond}-${beat.endSecond}s] ${beat.role.replace(/_/g, " ")}: ${beat.dramaDirective}`
  );
  const userInput = [
    `Short-drama episode ${episode.episodeNumber} of ${plan.episodes.length}: "${episode.title}" (${plan.bible.genre}, ${plan.bible.tone}).`,
    `Series premise: ${plan.bible.premise}`,
    `World: ${plan.bible.world}`,
    `Cast: ${plan.bible.cast.map((member) => `${member.name} (${member.castRole}) — ${member.description}`).join("; ")}.`,
    episode.recapHook ? `Cold-open recap beat: ${episode.recapHook}` : undefined,
    `Cold open (first 3 seconds): ${episode.coldOpenHook}`,
    `Episode logline: ${episode.logline}`,
    `Beat plan: ${beatLines.join(" | ")}`,
    `Twist: ${episode.twist}`,
    episode.endingDirective,
    `Continuity contract: ${plan.bible.consistencyContract.join(" ")}`,
    `Continuity anchors this episode: ${episode.continuityAnchors.join("; ")}.`,
    "Keep spoken dialogue minimal and action-forward; play emotion on faces, hands, and staging. Every scripted line must describe a concrete visible shot."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return {
    userInput,
    settings: {
      durationTargetSeconds: clampEpisodeSeconds(episodeDurationOf(plan)),
      // Vertical-first: short drama lives on TikTok/Reels/Shorts feeds.
      ratio: "9:16"
    },
    ...(references.length > 0 ? { references } : {}),
    metadata: {
      seriesId: plan.bible.seriesId,
      episodeNumber: String(episode.episodeNumber),
      episodeCount: String(plan.episodes.length),
      seriesMacroPhase: episode.macroPhase,
      videoEndingStyle: episode.endingStyle,
      niche: "drama_series",
      creativeMode: "story",
      seriesEndingState: episode.endingState
    }
  };
}

function buildBible(seriesId: string, request: SeriesDramaRequest): SeriesBible {
  const genre = request.genre?.trim() || "revenge melodrama";
  const tone = request.tone?.trim() || "high-tension, emotionally charged, premium vertical drama";
  const world = request.world?.trim() || "contemporary city with sharp class contrast";
  const language = request.language?.trim() || "vi";
  const consistencyContract = [
    ...request.cast.map(
      (member) =>
        `${member.name} keeps the same face, hair, body, and signature wardrobe in every episode; identity reference "${member.characterId}" is the source of truth.${member.staticFeatures ? ` Locked identity anchor: ${member.staticFeatures}.` : ""}${member.dynamicFeatures ? ` Current presentation (may evolve on camera): ${member.dynamicFeatures}.` : ""}`
    ),
    "Recurring locations keep the same spatial layout, dressing, and lighting mood between episodes.",
    "Wardrobe, props, injuries, and relationship states persist between episodes unless a beat changes them on camera.",
    "Color grade, lens language, and pacing style stay consistent across the whole series."
  ];
  return {
    seriesId,
    premise: request.premise.trim(),
    genre,
    tone,
    world,
    language,
    cast: request.cast,
    consistencyContract,
    macroArc: macroArcFor(request.episodeCount)
  };
}

function buildEpisode(input: {
  readonly request: SeriesDramaRequest;
  readonly bible: SeriesBible;
  readonly episodeNumber: number;
  readonly previous: EpisodePlan | undefined;
}): EpisodePlan {
  const { request, bible, episodeNumber, previous } = input;
  const macroPhase = phaseForEpisode(episodeNumber, request.episodeCount);
  const isFinale = episodeNumber === request.episodeCount;
  const endingStyle: EpisodeEndingStyle = isFinale ? "resolution" : "cliffhanger";
  const protagonist = bible.cast.find((member) => member.castRole === "protagonist") ?? bible.cast[0];
  const antagonist = bible.cast.find((member) => member.castRole === "antagonist");
  const conflict = PHASE_CONFLICT[macroPhase];

  const beats = planDurationBeats(request.episodeDurationSeconds).map((beat): EpisodeBeat => {
    switch (beat.role) {
      case "hook":
        return {
          ...beat,
          dramaDirective: `cold open mid-action: ${protagonist ? protagonist.name : "the lead"} is already inside the episode's sharpest moment (confrontation, discovery, or public humiliation) — never open on scenery, walking, or slow establishing`
        };
      case "development":
        return { ...beat, dramaDirective: conflict };
      case "proof_peak":
        return {
          ...beat,
          dramaDirective: `the reversal lands here: ${twistFor(macroPhase, protagonist?.name, antagonist?.name)} — play it on faces and staging, not narration`
        };
      case "settle":
        return {
          ...beat,
          dramaDirective: endingStyle === "cliffhanger"
            ? "drive into the cliffhanger: cut before the resolution lands and hold the unresolved frame"
            : "land the finale payoff and settle into a finished end frame"
        };
    }
  });

  const twist = twistFor(macroPhase, protagonist?.name, antagonist?.name);
  const endingState = endingStateFor(macroPhase, episodeNumber, request.episodeCount, protagonist?.name, antagonist?.name);
  return {
    episodeNumber,
    episodeId: createStableId("episode", `${bible.seriesId}:${episodeNumber}`),
    title: `Episode ${episodeNumber}: ${titleFor(macroPhase, episodeNumber)}`,
    logline: `${bible.premise} — ${conflict}.`,
    macroPhase,
    ...(previous ? { recapHook: `Reopen inside the consequence of: ${previous.endingState}` } : {}),
    coldOpenHook:
      "Within the first 3 seconds show a charged physical action or confrontation already in motion; the main character and the stakes must be readable before second three.",
    beats,
    twist,
    endingStyle,
    endingDirective: endingStyle === "cliffhanger" ? ENDING_CLIFFHANGER_DIRECTIVE : ENDING_RESOLUTION_DIRECTIVE,
    endingState,
    continuityAnchors: [
      ...bible.cast.map((member) => `${member.name}: same face/hair/signature wardrobe as identity reference ${member.characterId}`),
      "carry forward props, injuries, and relationship states from the previous episode",
      `macro phase: ${macroPhase}`
    ]
  };
}

function macroArcFor(episodeCount: number): readonly { readonly phase: SeriesMacroPhase; readonly episodeNumbers: readonly number[] }[] {
  const phases: SeriesMacroPhase[] = ["setup", "escalation", "midpoint_reversal", "crisis", "finale"];
  const grouped = new Map<SeriesMacroPhase, number[]>(phases.map((phase) => [phase, []]));
  for (let episode = 1; episode <= episodeCount; episode += 1) {
    grouped.get(phaseForEpisode(episode, episodeCount))?.push(episode);
  }
  return phases
    .map((phase) => ({ phase, episodeNumbers: grouped.get(phase) ?? [] }))
    .filter((entry) => entry.episodeNumbers.length > 0);
}

function phaseForEpisode(episodeNumber: number, episodeCount: number): SeriesMacroPhase {
  if (episodeCount === 1) {
    return "finale";
  }
  if (episodeNumber === episodeCount) {
    return "finale";
  }
  // Episode 1 always establishes the story: short series (2-4 episodes) would otherwise
  // never hit the <=0.2 progress band and open mid-escalation with no setup.
  if (episodeNumber === 1) {
    return "setup";
  }
  const progress = episodeNumber / episodeCount;
  if (progress <= 0.2) {
    return "setup";
  }
  if (progress <= 0.5) {
    return "escalation";
  }
  if (progress <= 0.65) {
    return "midpoint_reversal";
  }
  return "crisis";
}

function twistFor(phase: SeriesMacroPhase, protagonistName?: string, antagonistName?: string): string {
  const lead = protagonistName ?? "the lead";
  const rival = antagonistName ?? "the rival";
  switch (phase) {
    case "setup":
      return `${lead} discovers the first hidden card: something in frame proves the situation is not what it seemed`;
    case "escalation":
      return `${rival} strikes through a proxy; the help ${lead} trusted has a second loyalty`;
    case "midpoint_reversal":
      return `the identity/secret at the heart of the series is half-revealed to the audience before ${lead} sees it`;
    case "crisis":
      return `${lead} loses the protective mask or resource in public; ${rival} appears to have total control`;
    case "finale":
      return `the planted foreshadowing pays off and flips the power between ${lead} and ${rival} on camera`;
  }
}

function endingStateFor(
  phase: SeriesMacroPhase,
  episodeNumber: number,
  episodeCount: number,
  protagonistName?: string,
  antagonistName?: string
): string {
  if (episodeNumber === episodeCount) {
    return `series resolved: ${protagonistName ?? "the lead"} stands in the changed power position; final image closes the premise`;
  }
  return `${twistFor(phase, protagonistName, antagonistName)} — frozen at the moment of maximum uncertainty, unresolved into episode ${episodeNumber + 1}`;
}

function titleFor(phase: SeriesMacroPhase, episodeNumber: number): string {
  switch (phase) {
    case "setup":
      return "The Hidden Card";
    case "escalation":
      return "The Price Goes Up";
    case "midpoint_reversal":
      return "The Mask Slips";
    case "crisis":
      return "Nothing Left";
    case "finale":
      return episodeNumber === 1 ? "One-Shot Story" : "The Turn";
  }
}

function castIdentityReferences(cast: readonly SeriesCastMember[]): readonly PromptReference[] {
  return cast
    .filter((member): member is SeriesCastMember & { identityReferenceUri: string } =>
      Boolean(member.identityReferenceUri?.trim())
    )
    .map((member) => ({
      role: "identity",
      label: member.characterId,
      providerReference: {
        kind: "image",
        uri: member.identityReferenceUri,
        label: member.characterId,
        role: "identity"
      },
      priority: "primary",
      selection: { characterId: member.characterId, authorized: true }
    }));
}

function episodeDurationOf(plan: SeriesDramaPlan): number {
  const beat = plan.episodes[0]?.beats[plan.episodes[0].beats.length - 1];
  return beat ? beat.endSecond : MIN_EPISODE_SECONDS;
}

function clampEpisodeSeconds(value: number): number {
  return Math.min(MAX_EPISODE_SECONDS, Math.max(MIN_EPISODE_SECONDS, Math.round(value)));
}

function validateRequest(request: SeriesDramaRequest): void {
  if (!request.premise?.trim()) {
    throw new Error("Series premise is required.");
  }
  if (
    !Number.isInteger(request.episodeCount) ||
    request.episodeCount < MIN_EPISODES ||
    request.episodeCount > MAX_EPISODES
  ) {
    throw new Error(`episodeCount must be an integer between ${MIN_EPISODES} and ${MAX_EPISODES}.`);
  }
  if (
    !Number.isFinite(request.episodeDurationSeconds) ||
    request.episodeDurationSeconds < MIN_EPISODE_SECONDS ||
    request.episodeDurationSeconds > MAX_EPISODE_SECONDS
  ) {
    throw new Error(`episodeDurationSeconds must be between ${MIN_EPISODE_SECONDS} and ${MAX_EPISODE_SECONDS}.`);
  }
  if (!Array.isArray(request.cast) || request.cast.length === 0) {
    throw new Error("At least one cast member is required so identity can stay locked across episodes.");
  }
  // Bound cast size: planSeriesDrama rebuilds every episode's continuity anchors over the full cast
  // on every (free) preview/compose, so an unbounded cast is an event-loop DoS (deep-audit MEDIUM).
  if (request.cast.length > MAX_CAST_MEMBERS) {
    throw new Error(`A series can have at most ${MAX_CAST_MEMBERS} cast members.`);
  }
  for (const member of request.cast) {
    if (!member.characterId?.trim() || !member.name?.trim() || !member.description?.trim()) {
      throw new Error("Every cast member needs characterId, name, and description.");
    }
    const uri = member.identityReferenceUri?.trim();
    if (uri) {
      if (!/^(https:\/\/|asset:\/\/)/.test(uri)) {
        throw new Error(`Cast identity reference for ${member.characterId} must be a clean https:// or asset:// URI.`);
      }
      // SSRF: this URI later becomes an image param the model fetches — reject internal/private hosts.
      let host = "";
      try { host = new URL(uri).hostname; } catch { host = ""; }
      if (uri.startsWith("https://") && (!host || isLocalHost(host))) {
        throw new Error(`Cast identity reference for ${member.characterId} must not point at an internal or private host.`);
      }
    }
  }
}
