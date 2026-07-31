/**
 * Creative intent — the deep-brief-understanding contract produced BEFORE any script is written.
 *
 * Mined from the reference pipelines (micro-drama: idea -> develop_story {premise/protagonist/
 * conflict/arc/climax/resolution} BEFORE scenes; ViMax: global_information_planner before the
 * screenwriter; the seedance-2.0 operating loop's intake step): every battle-tested pipeline inserts
 * an explicit understanding stage between intake and scripting. CineJelly previously jumped straight
 * from deterministic regex intake to the scriptwriter — the analyst closes that gap, and its
 * LLM-authored styleDna replaces fixed per-niche lookup tables.
 */

import type { StyleDna, StyleRegister } from "./prompt.js";

export interface CreativeStoryEngine {
  /** The real dramatic conflict/friction the video plays on. */
  readonly conflict: string;
  /** What is at stake for the person on screen (why the viewer cares). */
  readonly stakes: string;
  /** The payoff that resolves the conflict — the ending must land this. */
  readonly payoff: string;
}

export interface CreativeIntent {
  readonly schemaVersion: "cinejelly.creative-intent.v1";
  /** cinematic vs phone-authentic writing/render voice for the WHOLE video. */
  readonly register: StyleRegister;
  /** Free-text genre, e.g. "skincare UGC testimonial", "family melodrama episode". */
  readonly genre: string;
  /** FREE TEXT niche — replaces fixed NICHE_DNA key lookup. */
  readonly niche: string;
  readonly audience: string;
  /** Language the on-screen people SPEAK (BCP-47-ish: "vi", "en"). Visual direction stays English. */
  readonly language: string;
  /** One-line tonal label. */
  readonly tone: string;
  /** Whole-video emotional movement, start -> turn -> end (the beats trace this curve). */
  readonly emotionArc: string;
  /** Pacing profile, e.g. "fast TikTok jump-cut", "slow-burn cinematic". */
  readonly pacingProfile: string;
  /** The concrete visual world: place, time, textures the video lives in. */
  readonly visualWorld: string;
  readonly storyEngine: CreativeStoryEngine;
  /** LLM-authored per-request style DNA (primary style source; tables are fallback). */
  readonly styleDna?: StyleDna;
}
