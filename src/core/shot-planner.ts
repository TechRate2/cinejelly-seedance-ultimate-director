/**
 * Shot Planner for converting scene and beat plans into renderable ShotContracts.
 * It implements long-form chunking without hardcoded niche templates.
 */

import type {
  ContinuityRisk,
  PromptReference,
  ShotContract,
  ShotContinuity,
  StyleDna,
  TimelineSegment
} from "../types/prompt.js";
import type { ProviderMetadata } from "../types/provider.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";
import { planDurationChunks } from "./chunking.js";
import { assignVideoArcRoles } from "./duration-scripting.js";
import { planShotFramingSequence, type ArcRoleName } from "./shot-grammar.js";

/**
 * Sentinel phrase embedded in a continuation clip's final timeline action. The prompt compiler
 * detects it (runtime + final-frame contracts must both switch to mid-motion handoff), so producer
 * and consumers share this ONE constant — rewording the prose can never silently break detection.
 */
export const BEAT_CONTINUATION_SENTINEL = "is not the beat's end";

/**
 * Marker that starts the continuation suffix chunkAudioIntent appends to sub-clips after the first.
 * The prompt compiler strips everything from this marker before its timeline audio-delta dedup —
 * without the shared constant the dedup silently broke on continuation chunks and re-printed the
 * full base audio plan in every timeline beat (contradiction-probe #5: +~600 chars per shot,
 * one real shot compiled past the 8,000-char ceiling).
 */
export const CONTINUATION_AUDIO_MARKER = "; CONTINUATION (clip ";

export interface BeatPlan {
  readonly beatId: string;
  readonly purpose: string;
  readonly action: string;
  readonly subject: string;
  readonly camera: string;
  readonly lighting: string;
  readonly style?: string;
  readonly audioIntent?: string;
  /** Verbatim author-supplied dialogue/narration line for this beat (script-first mode). */
  readonly spokenLine?: string;
  /** One visible emotional/situational turn (state A -> state B) this beat plays (craft law). */
  readonly emotionalTurn?: string;
  /** LLM-authored style DNA for this beat (register + axis overrides). */
  readonly styleDna?: StyleDna;
  readonly durationSeconds: number;
  readonly risks: readonly ContinuityRisk[];
  readonly references: readonly PromptReference[];
  readonly continuity: ShotContinuity;
}

export interface ScenePlan {
  readonly sceneId: string;
  readonly title: string;
  readonly beats: readonly BeatPlan[];
}

export interface ShotPlanningInput {
  readonly projectId: string;
  readonly scenes: readonly ScenePlan[];
  readonly settings: FlexibleSeedanceSettings;
  readonly metadata?: ProviderMetadata;
}

interface BeatPosition {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly globalBeatIndex: number;
  readonly totalBeatCount: number;
  readonly beatStartSecond: number;
  readonly beatEndSecond: number;
  readonly targetDurationSeconds: number;
}

type StoryArcRole =
  | "hook"
  | "setup"
  | "problem"
  | "development"
  | "proof"
  | "demo"
  | "turning_point"
  | "bridge"
  | "offer"
  | "payoff"
  | "scene";

type ShortStoryRole = "hook" | "problem" | "proof" | "demo" | "offer" | "payoff" | "scene";

export class ShotPlanner {
  public plan(input: ShotPlanningInput): readonly ShotContract[] {
    const totalBeatCount = input.scenes.reduce((sum, scene) => sum + scene.beats.length, 0);
    const plannedDurationSeconds = input.scenes.reduce(
      (sceneSum, scene) => sceneSum + scene.beats.reduce((beatSum, beat) => beatSum + beat.durationSeconds, 0),
      0
    );
    const targetDurationSeconds = Number.isFinite(input.settings.durationTargetSeconds) && input.settings.durationTargetSeconds > 0
      ? input.settings.durationTargetSeconds
      : plannedDurationSeconds;
    let globalBeatIndex = 0;
    let beatStartSecond = 0;
    const shots: ShotContract[] = [];
    input.scenes.forEach((scene, sceneIndex) => {
      scene.beats.forEach((beat, beatIndex) => {
        const beatEndSecond = beatStartSecond + Math.max(0, beat.durationSeconds);
        shots.push(...this.planBeat(input.projectId, scene.sceneId, beat, input.settings, input.metadata, {
          sceneIndex,
          beatIndex,
          globalBeatIndex,
          totalBeatCount,
          beatStartSecond,
          beatEndSecond,
          targetDurationSeconds
        }));
        beatStartSecond = beatEndSecond;
        globalBeatIndex += 1;
      });
    });
    return this.withVideoArcRoles(this.withAdjacentContinuityStates(shots));
  }

  /**
   * Stamp the video-level arc role AND a deliberately varied framing (shot size/angle/
   * position) onto each shot. Arc roles design openings/endings; the framing sequence gives
   * the whole video cinematic variety instead of the monotone same-size shots that read as
   * a cheap AI video. The prompt compiler then emits both as hard framing instructions.
   */
  private withVideoArcRoles(shots: readonly ShotContract[]): readonly ShotContract[] {
    const arcRoles = assignVideoArcRoles(shots.length);
    const creativeMode = this.creativeModeFor(shots);
    const framing = planShotFramingSequence({
      arcRoles: arcRoles as readonly ArcRoleName[],
      // A shot carrying a verbatim spokenLine gets avatar/lip-sync routed downstream, so its
      // framing must keep the face toward camera — the position planner needs to know which
      // beats those are before it spends any coverage variety on them.
      // `spokenLineContinuation` counts too: a long line is chunked across several shots and only
      // the FIRST carries the text, but the later chunks are the same person still mid-sentence —
      // cutting behind them halfway through a spoken line is the same physical nonsense.
      speakingBeats: shots.map((shot) => Boolean(shot.spokenLine?.trim()) || shot.spokenLineContinuation === true),
      ...(creativeMode ? { creativeMode } : {})
    });
    return shots.map((shot, index) => {
      const shotFraming = framing[index];
      return {
        ...shot,
        metadata: {
          ...(shot.metadata ?? {}),
          videoArcRole: arcRoles[index] ?? "development",
          // Only auto-assign framing when the caller has not already pinned a specific shot
          // grammar, so an explicit request still wins. cameraMotion MUST be carried too —
          // shotGrammarFromMetadata reads metadata.cameraMotion, and dropping it here left the
          // structured (arc-varied) camera moves dormant, so motion reached Seedance only as
          // unconstrained prose (a monotone-camera risk).
          ...(shotFraming && typeof shot.metadata?.shotType !== "string"
            ? {
                shotType: shotFraming.shotType,
                shotAngle: shotFraming.shotAngle,
                shotPosition: shotFraming.shotPosition,
                ...(shotFraming.cameraMotion ? { cameraMotion: shotFraming.cameraMotion } : {}),
                ...(shotFraming.subjectExpression ? { subjectExpression: shotFraming.subjectExpression } : {})
              }
            : {})
        }
      };
    });
  }

  /** Read the creative mode carried on request metadata so framing can adapt to the format. */
  private creativeModeFor(shots: readonly ShotContract[]): string | undefined {
    for (const shot of shots) {
      const value =
        shot.metadata?.shortViralCreativeMode ??
        shot.metadata?.creativeMode ??
        shot.metadata?.shortDirectorCreativeMode;
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return undefined;
  }

  private withAdjacentContinuityStates(shots: readonly ShotContract[]): readonly ShotContract[] {
    return shots.map((shot, index) => {
      const previous = shots[index - 1];
      const next = shots[index + 1];
      if (!previous && !next) {
        return shot;
      }
      return {
        ...shot,
        continuity: {
          ...shot.continuity,
          ...(previous && !shot.continuity.previousShotEndState
            ? { previousShotEndState: this.endpointState(previous, "end") }
            : {}),
          ...(next && !shot.continuity.nextShotStartState
            ? { nextShotStartState: this.endpointState(next, "start") }
            : {})
        }
      };
    });
  }

  private endpointState(shot: ShotContract, phase: "start" | "end"): string {
    const anchors = [
      shot.continuity.identity ? `identity=${shot.continuity.identity}` : undefined,
      shot.continuity.product ? `product=${shot.continuity.product}` : undefined,
      shot.continuity.environment ? `environment=${shot.continuity.environment}` : undefined,
      shot.continuity.style ? `style=${shot.continuity.style}` : undefined
    ].filter((anchor): anchor is string => Boolean(anchor));
    const anchorLine = anchors.length > 0 ? anchors.join("; ") : `subject=${shot.subject}`;
    // Neutral phrasing: no leading directional verb. The compiler adds the direction via its label
    // ("Continue from the previous shot's end: ..." / "Hand off to the next shot's start: ..."), so
    // the old "Start state: end on identity=Mai" inversion can no longer occur (live-render fix).
    return phase === "start"
      ? `${anchorLine} — motion continuing with matching camera direction, lighting, and product/KOL scale`
      : `${anchorLine} — a stable edit handle with product/KOL/result legible`;
  }

  private planBeat(
    projectId: string,
    sceneId: string,
    beat: BeatPlan,
    settings: FlexibleSeedanceSettings,
    metadata: ProviderMetadata | undefined,
    position: BeatPosition
  ): readonly ShotContract[] {
    const highRisk = beat.risks.length > 0;
    const chunks = planDurationChunks({
      totalDurationSeconds: beat.durationSeconds,
      qualityMode: settings.qualityMode,
      highRisk
    });
    const storyRole = this.storyArcRole(beat, position);
    const isShortRequest = this.isShortRequest(settings, metadata);

    return chunks.map((chunk) => {
      const arcStartSecond = this.roundSeconds(position.beatStartSecond + chunk.startSecond);
      const arcEndSecond = this.roundSeconds(position.beatStartSecond + chunk.endSecond);
      return {
        shotId: createStableId("shot", `${projectId}:${sceneId}:${beat.beatId}:${chunk.index}`),
        sceneId,
        beatId: beat.beatId,
        durationSeconds: chunk.durationSeconds,
        intent: beat.purpose,
        subject: beat.subject,
        action: this.chunkAction(beat.action, chunk.index, chunks.length),
        camera: beat.camera,
        lighting: beat.lighting,
        ...(beat.style ? { style: beat.style } : {}),
        ...(beat.audioIntent ? { audioIntent: this.chunkAudioIntent(beat.audioIntent, chunk.index, chunks.length) } : {}),
        // A verbatim scripted line belongs to the beat as a whole; assign it to the FIRST clip only
        // so it is spoken exactly once and never re-delivered across the beat's sub-clips. Later
        // sub-clips carry the continuation flag instead, so the compiler knows they are still
        // delivering that scripted narration and must not re-apply word caps to it
        // (contradiction-probe #5: "continue the same narration" + "keep under 16 words" clashed).
        ...(beat.spokenLine && chunk.index === 0 ? { spokenLine: beat.spokenLine } : {}),
        ...(beat.spokenLine && chunk.index > 0 ? { spokenLineContinuation: true } : {}),
        ...(beat.emotionalTurn ? { emotionalTurn: beat.emotionalTurn } : {}),
        ...(beat.styleDna ? { styleDna: beat.styleDna } : {}),
        timeline: this.timelineForChunk(beat, storyRole, chunk.durationSeconds, settings.audioMode !== "none", chunk.index, chunks.length, settings.ratio),
        transitionIntent: this.transitionIntentForChunk(beat, storyRole, chunk.index, chunks.length, this.creativeModeFromMetadata(metadata)),
        references: beat.references,
        continuity: beat.continuity,
        risks: beat.risks,
        metadata: {
          ...(metadata ?? {}),
          projectId,
          graphNodeId: `${sceneId}:${beat.beatId}`,
          storyArcRole: storyRole,
          storyArcPosition: this.storyArcPosition(arcStartSecond, arcEndSecond, position.targetDurationSeconds),
          storyArcStartSecond: arcStartSecond,
          storyArcEndSecond: arcEndSecond,
          storyArcTargetDurationSeconds: this.roundSeconds(position.targetDurationSeconds),
          ...(isShortRequest ? { shortStoryRole: this.shortCompatibleRole(storyRole) } : {}),
          shotId: `${beat.beatId}:${chunk.index}`
        }
      };
    });
  }

  private isShortRequest(settings: FlexibleSeedanceSettings, metadata: ProviderMetadata | undefined): boolean {
    return settings.durationTargetSeconds <= 60 ||
      metadata?.shortPipelineSource === "agentic_short_pipeline" ||
      Boolean(metadata?.shortViralIntelligenceId);
  }

  private storyArcRole(beat: BeatPlan, position: BeatPosition): StoryArcRole {
    const text = `${beat.beatId} ${beat.purpose} ${beat.action} ${beat.style ?? ""}`.toLowerCase();
    if (/\bhook\b|opening|first\s*frame|stop\s*the\s*scroll|pattern\s*interrupt/.test(text)) return "hook";
    if (/\bproblem\b|pain|objection|friction|before-state|before state/.test(text)) return "problem";
    if (/\bpayoff\b|result|after-state|after state|final|ending|close/.test(text)) return "payoff";
    if (/\boffer\b|price|shop|buy|cta|next step/.test(text)) return "offer";
    if (/\bbridge\b|transition|turning\s*point|reversal|twist|escalat/.test(text)) return "turning_point";
    if (/\bproof\b|evidence|claim|fact|review-bound|review bound/.test(text)) return "proof";
    if (/\bdemo\b|demonstrate|usage|use step|how it works|application|apply/.test(text)) return "demo";
    if (position.totalBeatCount <= 1) return "scene";
    if (position.globalBeatIndex === 0) return "hook";
    if (position.globalBeatIndex === position.totalBeatCount - 1) return "payoff";
    const midpoint = position.targetDurationSeconds > 0
      ? ((position.beatStartSecond + position.beatEndSecond) / 2) / position.targetDurationSeconds
      : position.globalBeatIndex / Math.max(1, position.totalBeatCount - 1);
    if (midpoint < 0.25) return "setup";
    if (midpoint > 0.72) return "payoff";
    if (midpoint > 0.58 && position.totalBeatCount >= 4) return "turning_point";
    return "development";
  }

  private shortCompatibleRole(role: StoryArcRole): ShortStoryRole {
    switch (role) {
      case "hook":
      case "problem":
      case "proof":
      case "demo":
      case "offer":
      case "payoff":
      case "scene":
        return role;
      case "setup":
        return "problem";
      case "development":
      case "bridge":
      case "turning_point":
        return "demo";
    }
  }

  private storyArcPosition(startSecond: number, endSecond: number, targetDurationSeconds: number): string {
    if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) {
      return "unknown";
    }
    const midpoint = ((startSecond + endSecond) / 2) / targetDurationSeconds;
    if (midpoint <= 0.2) return "opening";
    if (midpoint < 0.35) return "early_development";
    if (midpoint < 0.65) return "middle_development";
    if (midpoint < 0.8) return "late_development";
    return "ending";
  }

  private timelineForChunk(
    beat: BeatPlan,
    role: StoryArcRole,
    durationSeconds: number,
    audioEnabled: boolean,
    chunkIndex: number,
    totalChunks: number,
    ratio: string
  ): readonly TimelineSegment[] {
    const openingEnd = this.roundSeconds(Math.max(0.8, Math.min(1.2, durationSeconds * 0.22)));
    const endingStart = this.roundSeconds(Math.max(openingEnd + 0.8, durationSeconds - Math.max(0.8, Math.min(1.3, durationSeconds * 0.24))));
    const duration = this.roundSeconds(durationSeconds);
    // A beat that spans multiple provider clips must be PHASED across them, not replayed in each:
    // only the FIRST clip establishes the opening and only the LAST clip settles/resolves, so the
    // assembled long-form video progresses instead of showing N re-takes of the same moment with a
    // full open->settle arc every time (final-audit gap #3, the biggest 120-480s quality failure).
    const opensBeat = totalChunks <= 1 || chunkIndex === 0;
    const closesBeat = totalChunks <= 1 || chunkIndex === totalChunks - 1;
    return [
      {
        startSecond: 0,
        endSecond: openingEnd,
        action: opensBeat
          ? this.openingTimelineAction(role, beat)
          : this.continuationOpeningAction(beat, chunkIndex, totalChunks),
        camera: this.timelineCamera(role, "opening", beat, opensBeat, closesBeat, ratio),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "opening", beat, opensBeat, closesBeat) } : {})
      },
      {
        startSecond: openingEnd,
        endSecond: endingStart,
        action: this.middleTimelineAction(role, beat),
        camera: this.timelineCamera(role, "middle", beat, opensBeat, closesBeat, ratio),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "middle", beat, opensBeat, closesBeat) } : {})
      },
      {
        startSecond: endingStart,
        endSecond: duration,
        action: closesBeat
          ? this.endingTimelineAction(role, beat)
          : this.continuationHandleAction(beat, chunkIndex, totalChunks),
        camera: this.timelineCamera(role, "ending", beat, opensBeat, closesBeat, ratio),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "ending", beat, opensBeat, closesBeat) } : {})
      }
    ];
  }

  // A sub-clip that is NOT the first of its beat: resume mid-motion, render only the next portion,
  // and never replay the beat's opening — this is what stops long-form clips looking like re-takes.
  private continuationOpeningAction(beat: BeatPlan, chunkIndex: number, totalChunks: number): string {
    return `Continuation clip ${chunkIndex + 1} of ${totalChunks} inside one unbroken beat: resume exactly at the previous clip's end state — the subject pose, product, and framing are already established — and render ONLY the next portion of the action. Do not reset, re-introduce the subject, or replay the beat's opening. Advance from mid-motion: ${beat.action}`;
  }

  // A sub-clip that is NOT the last of its beat: leave the action unresolved so the next clip continues.
  private continuationHandleAction(beat: BeatPlan, chunkIndex: number, totalChunks: number): string {
    return `Clip ${chunkIndex + 1} of ${totalChunks} ${BEAT_CONTINUATION_SENTINEL}: leave the action mid-progress on a clean continuation handle so the next clip picks up seamlessly. Do not settle, resolve, or return to a neutral end frame — keep advancing the same continuous action: ${beat.action}`;
  }

  // Per-shot audio intent for a chunked beat: continuation clips must not re-deliver lines already
  // spoken earlier in the same beat, otherwise a scripted line is instructed N times across sub-clips.
  // The suffix explicitly OVERRIDES any "starts/opening hook" phrasing in the base intent — the base
  // was written for the whole beat, and on clip 2+ "start with a sharp hook" beside "continue
  // seamlessly, do not restart" was a direct self-contradiction (contradiction-probe #5).
  private chunkAudioIntent(audioIntent: string, chunkIndex: number, totalChunks: number): string {
    if (totalChunks <= 1 || chunkIndex === 0) {
      return audioIntent;
    }
    return `${audioIntent}${CONTINUATION_AUDIO_MARKER}${chunkIndex + 1} of ${totalChunks}) — this continuation note overrides any "starts/opening hook" phrasing above: continue the same narration seamlessly from the previous clip, do not restart the delivery, and do not repeat any line already spoken earlier in this beat`;
  }

  private openingTimelineAction(role: StoryArcRole, beat: BeatPlan): string {
    switch (role) {
      case "hook":
        return "Opening hook: show the viewer problem or payoff promise immediately; product or result is readable before 1s";
      case "problem":
        return "Opening problem: show the before-state or friction first, not a neutral product pose";
      case "setup":
        return "Opening setup: establish context, stakes, and the next proof question without drifting from the main promise";
      case "proof":
        return "Opening proof: reveal the evidence object, product detail, or claim-safe test setup";
      case "demo":
        return "Opening demo: show the before-state and the product entering real contact";
      case "development":
        return "Opening development: pick up from the prior beat and advance the story with a new visible detail";
      case "turning_point":
        return "Opening turning point: reveal the contrast, obstacle, or shift that changes the viewer's understanding";
      case "bridge":
        return "Opening bridge: preserve the previous end state while orienting the viewer toward the next sequence";
      case "offer":
        return "Opening offer: keep the proven result visible before any next-step implication";
      case "payoff":
        return "Opening payoff: connect back to the hook with the result or human reaction already visible";
      case "scene":
        return `Opening beat: make the first visual state clear before advancing the action: ${beat.action}`;
    }
  }

  private middleTimelineAction(role: StoryArcRole, beat: BeatPlan): string {
    switch (role) {
      case "hook":
        return `Middle hook: move from curiosity to context through one clear action, not a static hold: ${beat.action}`;
      case "problem":
        return `Middle problem: show why the friction matters through a human gesture or object state change: ${beat.action}`;
      case "setup":
        return `Middle setup: connect the context to a concrete reason to keep watching: ${beat.action}`;
      case "proof":
        return `Middle proof: demonstrate the reviewed evidence with visible material change or readable product behavior: ${beat.action}`;
      case "demo":
        return `Middle demo: perform the main use step with before-action-after continuity inside the shot: ${beat.action}`;
      case "development":
        return `Middle development: add new information, action, or proof so the overall film moves forward: ${beat.action}`;
      case "turning_point":
        return `Middle turning point: show the decisive shift, reveal, comparison, or complication clearly: ${beat.action}`;
      case "bridge":
        return `Middle bridge: carry continuity anchors across the edit and prepare the next sequence: ${beat.action}`;
      case "offer":
        return `Middle offer: show the product/result relationship and keep the offer implied by usefulness: ${beat.action}`;
      case "payoff":
        return `Middle payoff: show the finished result, creator reaction, or final product context without introducing a new claim: ${beat.action}`;
      case "scene":
        return `Middle beat: advance the planned action with visible change: ${beat.action}`;
    }
  }

  private endingTimelineAction(role: StoryArcRole, beat: BeatPlan): string {
    switch (role) {
      case "hook":
        return "Ending hook: leave a clean endpoint that tees up proof, not another intro frame";
      case "problem":
        return "Ending problem: settle on the need for the product or proof beat";
      case "setup":
        return "Ending setup: hand off a clear unresolved question, promise, or proof need to the next beat";
      case "proof":
        return "Ending proof: hold the evidence/result long enough for the viewer to understand it";
      case "demo":
        return "Ending demo: show the after-state or next physical state clearly before the cut";
      case "development":
        return "Ending development: close on a changed state that makes the next beat necessary";
      case "turning_point":
        return "Ending turning point: land the reveal and leave a strong edit point into resolution or proof";
      case "bridge":
        return "Ending bridge: hold the shared anchor that lets the next sequence start cleanly";
      case "offer":
        return "Ending offer: land on product plus result, no text card and no hard-sell gesture";
      case "payoff":
        return "Ending payoff: final frame resolves the story with product/result visible and no new information";
      case "scene":
        return "Ending beat: complete the visual action and hold an edit-safe end frame";
    }
  }

  private timelineCamera(
    role: StoryArcRole,
    phase: "opening" | "middle" | "ending",
    beat: BeatPlan,
    opensBeat: boolean,
    closesBeat: boolean,
    ratio: string
  ): string {
    // Only the clip that actually opens the beat gets the hook first-frame treatment, and only the
    // clip that actually closes it gets the settled payoff framing — mid-beat continuation clips keep
    // the beat's own camera so they read as one continuous move, not repeated hook/payoff frames.
    if (phase === "opening" && role === "hook" && opensBeat) {
      // Compose the load-bearing hook frame for the ACTUAL requested aspect, not a hardcoded 9:16 —
      // a landscape/square deliverable must not have its most important frame framed for portrait
      // (final-audit input-matrix gap). "adaptive" stays ratio-neutral (the model decides).
      const aspect = ratio && ratio !== "adaptive" ? `${ratio} ` : "";
      return `tight ${aspect}readable first frame, slight handheld motion toward the subject`;
    }
    if (phase === "ending" && role === "payoff" && closesBeat) {
      return "steady final framing with product or result held in view";
    }
    return beat.camera;
  }

  // Register-aware (contradiction-probe #1/#4): under the phone-KOL register the audio axis is
  // "in-camera sound only, NO scored music" — the fallback base and the payoff/handle notes must not
  // re-introduce a music bed the register just forbade in the same prompt.
  private timelineAudioCue(
    role: StoryArcRole,
    phase: "opening" | "middle" | "ending",
    beat: BeatPlan,
    opensBeat: boolean,
    closesBeat: boolean
  ): string {
    const phone = beat.styleDna?.register === "natural_phone_kol";
    const base = beat.audioIntent ?? (phone
      ? "guided voiceover over real in-camera room tone — no music bed"
      : "guided voiceover with low music bed and natural room tone");
    if (phase === "opening") {
      if (!opensBeat) {
        return `${base}; continue the narration seamlessly from the previous clip, no restart and no dead air`;
      }
      return role === "hook"
        ? `${base}; spoken hook starts immediately, no dead air`
        : `${base}; audio begins on action, not after the visual`;
    }
    if (phase === "ending") {
      if (!closesBeat) {
        return phone
          ? `${base}; leave a clean transition handle, do not resolve the voiceover yet`
          : `${base}; leave a clean transition handle, do not resolve the music or voiceover yet`;
      }
      return role === "payoff"
        ? (phone
            ? `${base}; the voice lands the payoff over in-camera sound, natural settle`
            : `${base}; music resolves under the visual payoff`)
        : `${base}; leave a clean transition handle`;
    }
    return `${base}; narration supports visible action and leaves space for product/contact SFX`;
  }

  private roundSeconds(value: number): number {
    return Number(value.toFixed(2));
  }

  private chunkAction(action: string, chunkIndex: number, totalChunks: number): string {
    if (totalChunks === 1) {
      return action;
    }
    if (chunkIndex === 0) {
      return `${action}; establish the beginning of the beat with clear subject state`;
    }
    if (chunkIndex === totalChunks - 1) {
      return `${action}; complete the beat and settle into the planned end state`;
    }
    return `${action}; continue the beat without changing identity, product, or environment anchors`;
  }

  /** Creator-style formats cut hard between clips; soft dissolves read as slow/produced/fake. */
  private creativeModeFromMetadata(metadata: ProviderMetadata | undefined): string | undefined {
    const value =
      metadata?.shortViralCreativeMode ?? metadata?.creativeMode ?? metadata?.shortDirectorCreativeMode;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private isNativeCutCreativeMode(creativeMode: string | undefined): boolean {
    return creativeMode === "ugc_review" || creativeMode === "testimonial" || creativeMode === "demo";
  }

  private transitionIntentForChunk(
    beat: BeatPlan,
    storyRole: StoryArcRole,
    chunkIndex: number,
    totalChunks: number,
    creativeMode?: string
  ): string {
    const motionIntent = this.transitionMotionIntent(beat);
    const roleIntent = storyRole === "hook"
      ? "protect the cold-open energy while handing off to the next proof beat"
      : storyRole === "payoff"
        ? "land on a resolved product/result frame with no visual reset"
        : "preserve viewer information flow across the edit boundary";
    if (totalChunks === 1) {
      // UGC/creator formats: request a native hard cut so assembly picks a near-instant boundary
      // (TikTok jump-cut rhythm) instead of a soft dissolve that reads as slow and produced. The
      // motion-bridge suggestion is OMITTED for hard-cut formats — telling the model to build a
      // zoom/whip bridge AND hard-cut the boundary is contradictory (live-render forensics).
      if (this.isNativeCutCreativeMode(creativeMode)) {
        return `Boundary edit: quick native hard cut between clips (TikTok jump-cut rhythm), no soft crossfade; ${roleIntent}.`;
      }
      return [
        motionIntent,
        `Preserve clean start and end handles for seamless match cut, xfade, and last-frame chaining; ${roleIntent}.`
      ].filter(Boolean).join(" ");
    }
    if (chunkIndex === 0) {
      return [
        motionIntent,
        // Phrased without the words "jump cut" so the transition engine's hard-cut intent regex can
        // never mistake this intra-beat continuity request for an editorial cut instruction.
        "End with a stable visible anchor so the next chunk continues seamlessly with no visual reset."
      ].filter(Boolean).join(" ");
    }
    if (chunkIndex === totalChunks - 1) {
      return [
        motionIntent,
        "Start from the previous chunk state and end with an edit-safe stable handle."
      ].filter(Boolean).join(" ");
    }
    return [
      motionIntent,
      "Maintain continuous motion, camera direction, lighting, and anchor scale from the previous chunk into the next chunk."
    ].filter(Boolean).join(" ");
  }

  private transitionMotionIntent(beat: BeatPlan): string | undefined {
    const text = `${beat.action} ${beat.camera} ${beat.lighting} ${beat.style ?? ""}`.toLowerCase();
    if (/whip|snap pan|fast pan|speed ramp|motion blur|rush/.test(text)) {
      return "Use a whip-pan motion-blur bridge only if it preserves subject scale, screen direction, and product/KOL anchors.";
    }
    if (/flash|flare|strobe|light burst|bright burst|white out/.test(text)) {
      return "Use a brief light-flash bridge only as motivated lighting, never to hide identity or product drift.";
    }
    if (/zoom|push in|push-in|macro|punch in|rush in/.test(text)) {
      return "Use a zoom or macro-push bridge that keeps the product/result anchored through the boundary.";
    }
    if (/wipe|swipe|cover|hand pass|hand-pass|product pass|object pass|reveal/.test(text)) {
      return "Use an object-wipe reveal bridge motivated by hand/product movement, with the next frame already readable.";
    }
    if (/slide|tracking|truck|dolly|pan|camera move|move through/.test(text)) {
      return "Use a smooth camera-motion bridge that continues lens distance, direction, and lighting across the boundary.";
    }
    return undefined;
  }
}
