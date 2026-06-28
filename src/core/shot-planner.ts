/**
 * Shot Planner for converting scene and beat plans into renderable ShotContracts.
 * It implements long-form chunking without hardcoded niche templates.
 */

import type {
  ContinuityRisk,
  PromptReference,
  ShotContract,
  ShotContinuity,
  TimelineSegment
} from "../types/prompt.js";
import type { ProviderMetadata } from "../types/provider.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";
import { planDurationChunks } from "./chunking.js";

export interface BeatPlan {
  readonly beatId: string;
  readonly purpose: string;
  readonly action: string;
  readonly subject: string;
  readonly camera: string;
  readonly lighting: string;
  readonly style?: string;
  readonly audioIntent?: string;
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
    return shots;
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
        ...(beat.audioIntent ? { audioIntent: beat.audioIntent } : {}),
        timeline: this.timelineForChunk(beat, storyRole, chunk.durationSeconds, settings.audioMode !== "none"),
        transitionIntent: this.transitionIntentForChunk(chunk.index, chunks.length),
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
    audioEnabled: boolean
  ): readonly TimelineSegment[] {
    const openingEnd = this.roundSeconds(Math.max(0.8, Math.min(1.2, durationSeconds * 0.22)));
    const endingStart = this.roundSeconds(Math.max(openingEnd + 0.8, durationSeconds - Math.max(0.8, Math.min(1.3, durationSeconds * 0.24))));
    const duration = this.roundSeconds(durationSeconds);
    return [
      {
        startSecond: 0,
        endSecond: openingEnd,
        action: this.openingTimelineAction(role, beat),
        camera: this.timelineCamera(role, "opening", beat),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "opening", beat) } : {})
      },
      {
        startSecond: openingEnd,
        endSecond: endingStart,
        action: this.middleTimelineAction(role, beat),
        camera: this.timelineCamera(role, "middle", beat),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "middle", beat) } : {})
      },
      {
        startSecond: endingStart,
        endSecond: duration,
        action: this.endingTimelineAction(role, beat),
        camera: this.timelineCamera(role, "ending", beat),
        ...(audioEnabled ? { audioCue: this.timelineAudioCue(role, "ending", beat) } : {})
      }
    ];
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

  private timelineCamera(role: StoryArcRole, phase: "opening" | "middle" | "ending", beat: BeatPlan): string {
    if (phase === "opening" && role === "hook") {
      return "tight 9:16 readable first frame, slight handheld motion toward the subject";
    }
    if (phase === "ending" && role === "payoff") {
      return "steady final framing with product or result held in view";
    }
    return beat.camera;
  }

  private timelineAudioCue(
    role: StoryArcRole,
    phase: "opening" | "middle" | "ending",
    beat: BeatPlan
  ): string {
    const base = beat.audioIntent ?? "guided voiceover with low music bed and natural room tone";
    if (phase === "opening") {
      return role === "hook"
        ? `${base}; spoken hook starts immediately, no dead air`
        : `${base}; audio begins on action, not after the visual`;
    }
    if (phase === "ending") {
      return role === "payoff"
        ? `${base}; music resolves under the visual payoff`
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

  private transitionIntentForChunk(chunkIndex: number, totalChunks: number): string {
    if (totalChunks === 1) {
      return "Preserve clean start and end handles for editing.";
    }
    if (chunkIndex === 0) {
      return "End with a stable state that can anchor the next chunk.";
    }
    if (chunkIndex === totalChunks - 1) {
      return "Start from the previous chunk state and end with an edit-safe handle.";
    }
    return "Maintain continuous motion from the previous chunk into the next chunk.";
  }
}
