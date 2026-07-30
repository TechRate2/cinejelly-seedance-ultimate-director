/**
 * Duration scripting engine.
 *
 * Guarantees that any requested duration gets a full-coverage, time-coded beat plan with a
 * deliberate opening hook and a settled ending, so generated clips fill their entire runtime
 * instead of ending action early or padding with frozen frames.
 *
 * Built on the highest-leverage Seedance timing techniques:
 * - timestamped beat markers act as hard editorial instructions to the model;
 * - a "sandwich" duration declaration (top and bottom of the prompt) locks total runtime;
 * - an escalation arc (hook -> development -> peak -> settle) scales to any duration.
 *
 * Source lineage: distilled from the CC BY 4.0 community Seedance prompt corpus timing
 * patterns (exact source attribution in docs/CREDITS.md) and public Seedance 2.0 prompting
 * guidance; original condensed direction, no verbatim upstream text.
 */

/**
 * Shared narration pace for every voiceover word budget (short compiler AND long-form timeline).
 * ~2.8 words/second matches natural conversational delivery; the old 2.4 forced sparse, slow
 * narration that read as stilted next to real creator speech (live-render feedback). One constant so
 * a beat's audio-script budget and its compiled video-prompt budget can never disagree.
 */
/**
 * Narration pace for MODEL-AUTHORED voiceover guidance (the "keep narration under N words" budget
 * written into a prompt). Deliberately conservative — under-filling a prompt budget is harmless.
 */
export const VOICEOVER_WORDS_PER_SECOND = 2.8;

/**
 * DIRECT SPEECH pace — a character's scripted line spoken by TTS (measured on Vietnamese
 * ElevenLabs output). This is the ONE rate that decides real delivered runtime, because an
 * avatar/OmniHuman clip lasts exactly as long as its audio. Every component that schedules,
 * re-caps, or predicts spoken-line duration MUST import this constant: when the architect
 * scheduled at 4 w/s while the script enhancer re-capped at the 2.8 narration rate, ~31% of every
 * line was silently deleted and an 18s order delivered ~12s.
 */
export const TALKING_WORDS_PER_SECOND = 4;

/** Han, kana and halfwidth-kana — scripts that carry a spoken syllable per CHARACTER, not per word. */
const SPEECH_UNIT_CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/u;

/**
 * How many spoken units a line contains — the thing the rate above is actually per-second OF.
 *
 * Splitting on whitespace is right for Vietnamese and English, where a token is roughly a syllable
 * or a short word. It is catastrophically wrong for Chinese and Japanese, which are written without
 * spaces: a whole sentence counted as ONE token, so a 60-second Chinese talking script was estimated
 * at a couple of seconds and the pre-spend duration check refused the job — with a Vietnamese error
 * telling the customer their script was too short. Chinese voiceover is a shipped, sellable option
 * in the UI, so every Chinese or Japanese talking order was rejected outright, and the message
 * blamed the customer for it.
 *
 * Counting CJK per character and everything else per whitespace token handles mixed text too
 * ("iPhone 15 很好" = 4 units), and leaves Vietnamese and English behaviour byte-identical.
 */
export function countSpeechUnits(text: string): number {
  let units = 0;
  let insideWord = false;
  for (const character of text.trim()) {
    if (/\s/u.test(character)) {
      insideWord = false;
    } else if (SPEECH_UNIT_CJK.test(character)) {
      units += 1;
      insideWord = false;
    } else if (!insideWord) {
      units += 1;
      insideWord = true;
    }
  }
  return units;
}

/** Cut a line to at most `maxUnits` spoken units, counting the same way `countSpeechUnits` does. */
function sliceToSpeechUnits(text: string, maxUnits: number): string {
  let units = 0;
  let insideWord = false;
  let cutAt = text.length;
  let index = 0;
  for (const character of text) {
    const isSpace = /\s/u.test(character);
    const isCjk = !isSpace && SPEECH_UNIT_CJK.test(character);
    if (!isSpace && (isCjk || !insideWord)) {
      if (units === maxUnits) {
        cutAt = index;
        break;
      }
      units += 1;
    }
    insideWord = !isSpace && !isCjk;
    index += character.length;
  }
  return text.slice(0, cutAt);
}

/**
 * Trim spoken text to what `durationSeconds` can physically deliver, cutting at a word boundary
 * (keeps the opening — the hook carries the most important words) and stripping any punctuation
 * left dangling at the cut. Under-budget text passes through untouched (original internal spacing
 * preserved). Non-finite durations cap nothing: silently deleting all dialogue on a bad input is
 * worse than an over-long line (adversarial-audit #7).
 *
 * `wordsPerSecond` MUST match the rate the caller used to SCHEDULE that duration. Pass
 * TALKING_WORDS_PER_SECOND for a character's scripted line (TTS/avatar); the 2.8 narration default
 * only fits model-authored voiceover budgets.
 */
export function capToSpeakableWords(
  text: string,
  durationSeconds: number,
  wordsPerSecond: number = VOICEOVER_WORDS_PER_SECOND
): string {
  const trimmed = text.trim();
  if (!Number.isFinite(durationSeconds)) {
    return trimmed;
  }
  const rate = Number.isFinite(wordsPerSecond) && wordsPerSecond > 0 ? wordsPerSecond : VOICEOVER_WORDS_PER_SECOND;
  const maxUnits = Math.max(6, Math.floor(durationSeconds * rate));
  if (countSpeechUnits(trimmed) <= maxUnits) {
    return trimmed;
  }
  const clipped = sliceToSpeechUnits(trimmed, maxUnits);
  // Prefer the last SENTENCE boundary inside the budget. A word-boundary cut leaves the line ending
  // mid-thought, and the compiler then hands that fragment to the model under a "deliver word-for-word,
  // do not shorten" contract — so the actor is instructed to perform half a sentence, faithfully.
  // Ending one sentence early reads as deliberate; ending mid-clause reads as broken.
  //
  // Only accepted when it keeps most of the budget: a line whose first sentence ends very early would
  // otherwise throw away speech the runtime was already paid to carry.
  const lastSentenceEnd = Math.max(
    clipped.lastIndexOf("."), clipped.lastIndexOf("!"), clipped.lastIndexOf("?"),
    clipped.lastIndexOf("…")
  );
  if (lastSentenceEnd >= Math.floor(clipped.length * 0.6)) {
    return clipped.slice(0, lastSentenceEnd + 1).trim();
  }
  return clipped.replace(/[,;:—-]+$/, "").trim();
}

export type DurationBeatRole = "hook" | "development" | "proof_peak" | "settle";

export interface DurationBeat {
  readonly role: DurationBeatRole;
  readonly startSecond: number;
  readonly endSecond: number;
  readonly directive: string;
}

export interface DurationScriptPlan {
  readonly durationSeconds: number;
  readonly beats: readonly DurationBeat[];
  /** Ready-to-embed prompt lines enforcing full-duration coverage with time-coded beats. */
  readonly promptLines: readonly string[];
}

/** Video-level arc role for a shot inside a multi-shot video. */
export type VideoArcRole = "full_video" | "opening_hook" | "development" | "climax" | "closing_resolve";

const BEAT_DIRECTIVES: Record<DurationBeatRole, string> = {
  hook:
    "instantly readable hook already in motion (mid-action or mid-reaction, never a slow settle-in or empty establishing frame)",
  development:
    "continuous cause-and-effect action that adds new visible information every beat (no repeated poses, no idle holds, no filler)",
  proof_peak:
    "the peak proof/payoff moment fully on screen (the state change, result, or emotional turn lands here)",
  settle:
    "action resolves and settles into a stable, legible final frame with the subject/product still visible (no mid-blink, blur, whip, or unfinished motion)"
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Build a full-coverage, time-coded beat plan for any clip duration.
 * Beat count scales with duration (about one beat per 2.5-3s, min 2, max 6) and the
 * segments always tile [0, durationSeconds] exactly, so the model receives hard timing
 * instructions covering the entire runtime.
 *
 * Pacing is deliberately non-uniform (short-drama tempo): development beats get
 * progressively SHORTER so the cutting rhythm accelerates toward the peak, and the
 * proof/payoff beat is held LONGER than any development beat so the moment that sells
 * the video gets room to land. Uniform beat lengths read as metronomic and cheap.
 */
export function planDurationBeats(durationSeconds: number): readonly DurationBeat[] {
  const duration = Math.max(1, durationSeconds);
  const hookSeconds = round1(Math.min(1.5, duration * 0.25));
  const settleSeconds = round1(Math.min(1.5, Math.max(0.5, duration * 0.12)));
  const middleStart = hookSeconds;
  const middleEnd = round1(duration - settleSeconds);
  const middleSpan = Math.max(0, middleEnd - middleStart);
  const middleBeatCount = Math.min(4, Math.max(1, Math.round(middleSpan / 3)));

  // Rising-tempo weights: each development beat is shorter than the one before it, and
  // the final (proof_peak) beat is the longest so the payoff breathes.
  const developmentCount = middleBeatCount - 1;
  const weights: number[] = [];
  for (let index = 0; index < developmentCount; index += 1) {
    const rampProgress = developmentCount > 1 ? index / (developmentCount - 1) : 0;
    weights.push(round1(1.15 - 0.3 * rampProgress));
  }
  weights.push(1.4);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  const beats: DurationBeat[] = [
    { role: "hook", startSecond: 0, endSecond: hookSeconds, directive: BEAT_DIRECTIVES.hook }
  ];
  let cursor = middleStart;
  let weightConsumed = 0;
  for (let index = 0; index < middleBeatCount; index += 1) {
    const isLastMiddle = index === middleBeatCount - 1;
    weightConsumed += weights[index] ?? 1;
    const end = isLastMiddle ? middleEnd : round1(middleStart + (middleSpan * weightConsumed) / weightTotal);
    beats.push({
      role: isLastMiddle ? "proof_peak" : "development",
      startSecond: cursor,
      endSecond: end,
      directive: isLastMiddle ? BEAT_DIRECTIVES.proof_peak : BEAT_DIRECTIVES.development
    });
    cursor = end;
  }
  beats.push({
    role: "settle",
    startSecond: middleEnd,
    endSecond: duration,
    directive: BEAT_DIRECTIVES.settle
  });
  return beats;
}

/**
 * Build the full-duration prompt contract for one clip: a sandwich duration declaration
 * plus timestamped beats. `arcRole` tunes the hook/settle language to the shot's position
 * inside the whole video so openings open and endings end. `endingStyle: "cliffhanger"`
 * swaps the settled ending for a cut-before-resolution hold (serial episodes).
 */
export function buildDurationScript(input: {
  readonly durationSeconds: number;
  readonly arcRole?: VideoArcRole;
  readonly endingStyle?: "settle" | "cliffhanger";
}): DurationScriptPlan {
  const cliffhanger = input.endingStyle === "cliffhanger";
  // Keep the contract text, Total marker, and beats on the same clamped duration so
  // sub-1s or invalid inputs cannot produce a self-contradictory runtime contract.
  const durationSeconds = Math.max(1, Number.isFinite(input.durationSeconds) ? input.durationSeconds : 1);
  const beats = planDurationBeats(durationSeconds);
  const beatLines = beats.map((beat) => {
    const directive = cliffhanger && beat.role === "settle"
      ? "drive tension upward and cut before the resolution lands; hold a clean readable frame of the unresolved moment"
      : beat.directive;
    return `[${beat.startSecond}-${beat.endSecond}s] ${beat.role.replace(/_/g, " ")}: ${directive}.`;
  });
  const arcLine = cliffhanger
    ? CLIFFHANGER_ENDING_ARC_DIRECTIVE
    : input.arcRole
      ? ARC_ROLE_DIRECTIVES[input.arcRole]
      : undefined;
  const finalBeatClause = cliffhanger
    ? `the final beat holds the unresolved cliffhanger frame at ${durationSeconds}s`
    : `the final beat must still be purposeful motion that settles cleanly at ${durationSeconds}s`;
  const promptLines = [
    `Runtime contract: this clip runs exactly ${durationSeconds} seconds and the action must fill the entire runtime; treat the timestamped beats as hard editorial instructions.`,
    ...beatLines,
    arcLine,
    `Do not finish the action early, freeze on a static frame, loop, or pad; ${finalBeatClause}. Total: ${durationSeconds}s.`
  ].filter((line): line is string => Boolean(line));
  return {
    durationSeconds,
    beats,
    promptLines
  };
}

/**
 * Serial-episode ending override: instead of settling, the final shot cuts before the
 * payoff lands so the viewer must return for the next episode (short-drama retention).
 * Applied by the prompt compiler when shot metadata carries videoEndingStyle=cliffhanger.
 */
export const CLIFFHANGER_ENDING_ARC_DIRECTIVE =
  "Video ending (cliffhanger): this is the final shot of the episode; drive the tension upward to the last second and cut BEFORE the resolution lands — hold a clean readable frame of the unresolved moment (the reveal half-seen, the blow mid-swing, the reply unspoken). Do not settle into a finished afterglow and do not resolve the confrontation.";

/** Video-level opening/ending direction so multi-shot videos open strong and end resolved. */
export const ARC_ROLE_DIRECTIVES: Record<VideoArcRole, string> = {
  full_video:
    "Whole video in one clip: the first frames are the scroll-stopping hook (open mid-action with the strongest visual tension) AND the final beat is the designed ending (payoff lands, action resolves, clean settled end frame that feels finished).",
  opening_hook:
    "Video opening: this is the first shot of the video; the very first frames are the scroll-stopping hook, so open mid-action with the strongest visual tension and establish subject and stakes immediately.",
  development:
    "Video middle: advance the story with new visible information and keep momentum from the previous shot; do not re-introduce the subject or restart the scene.",
  climax:
    "Video climax: this shot carries the peak proof/payoff of the whole video; make the result unmistakably visible before handing off.",
  closing_resolve:
    "Video ending: this is the final shot of the video; resolve the story, give the payoff/afterglow a held readable moment, and settle into a clean end frame that feels finished (no cliffhanger cut, no abrupt stop)."
};

/**
 * Plan integer per-shot duration additions so the assembled video hits the requested
 * target despite crossfade overlap and planning shortfall.
 *
 * Crossfade assembly consumes `transitionOverlapSeconds` at every clip boundary, so a
 * video assembled from N clips loses overlap x (N-1) seconds; if the planned clip sum is
 * also below target, the delivered video is short twice over. This returns whole-second
 * additions (distributed from the last shot backward, respecting the per-clip maximum)
 * that restore the full runtime.
 */
export function planDurationCompensation(input: {
  readonly shotDurations: readonly number[];
  readonly targetDurationSeconds: number;
  readonly transitionOverlapSeconds: number;
  readonly maxClipSeconds?: number;
}): readonly number[] {
  const maxClip = input.maxClipSeconds ?? 15;
  const shotCount = input.shotDurations.length;
  const additions = input.shotDurations.map(() => 0);
  if (shotCount === 0) {
    return additions;
  }
  const plannedTotal = input.shotDurations.reduce((sum, duration) => sum + duration, 0);
  const overlapBudget = Math.max(0, input.transitionOverlapSeconds) * Math.max(0, shotCount - 1);
  const shortfall = Math.max(0, input.targetDurationSeconds - plannedTotal);
  let remaining = Math.round(overlapBudget + shortfall);
  if (remaining <= 0) {
    return additions;
  }
  // Distribute one second at a time from the last shot backward so the ending gains the
  // most breathing room; skip shots already at the clip maximum.
  let guard = remaining * shotCount + shotCount;
  while (remaining > 0 && guard > 0) {
    let placed = false;
    for (let index = shotCount - 1; index >= 0 && remaining > 0; index -= 1) {
      const current = (input.shotDurations[index] ?? 0) + (additions[index] ?? 0);
      if (current + 1 <= maxClip) {
        additions[index] = (additions[index] ?? 0) + 1;
        remaining -= 1;
        placed = true;
      }
    }
    if (!placed) {
      break;
    }
    guard -= 1;
  }
  return additions;
}

/**
 * Assign video-level arc roles across the ordered shots of one video for any shot count,
 * so every video gets a designed opening and ending regardless of duration.
 */
export function assignVideoArcRoles(shotCount: number): readonly VideoArcRole[] {
  if (shotCount <= 0) {
    return [];
  }
  if (shotCount === 1) {
    return ["full_video"];
  }
  if (shotCount === 2) {
    return ["opening_hook", "closing_resolve"];
  }
  const roles: VideoArcRole[] = ["opening_hook"];
  for (let index = 1; index < shotCount - 2; index += 1) {
    roles.push("development");
  }
  roles.push("climax");
  roles.push("closing_resolve");
  return roles;
}
