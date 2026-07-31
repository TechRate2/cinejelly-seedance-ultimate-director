/**
 * Script Enhancer — a pre-render polish pass between the Story Architect and the shot planner
 * (mined from ViMax's script_enhancer). One structured LLM call that TIGHTENS the plan without
 * changing it: sharpen sensory specifics in `action`, make dialogue sound like real natural speech,
 * and firm up the one visible emotional turn per beat — never changing the plot, beat order, beat
 * count, or the LANGUAGE of any spoken line. It merges polished text back BY beatId, so it can only
 * refine existing beats, never restructure them. Fail-open: any error returns the plan unchanged, so
 * this stage is a pure quality enhancer that can never block or corrupt a render.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { BeatPlan, ScenePlan } from "../core/shot-planner.js";
import { capToSpeakableWords, TALKING_WORDS_PER_SECOND } from "../core/duration-scripting.js";

const ENHANCER_SCHEMA = {
  type: "object",
  required: ["beats"],
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        required: ["beatId"],
        properties: {
          beatId: { type: "string" },
          action: { type: "string" },
          spokenLine: { type: "string" },
          emotionalTurn: { type: "string" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

interface EnhancerBeatJson {
  readonly beatId?: unknown;
  readonly action?: unknown;
  readonly spokenLine?: unknown;
  readonly emotionalTurn?: unknown;
}
interface EnhancerJson {
  readonly beats?: readonly EnhancerBeatJson[];
}

export class ScriptEnhancer {
  private readonly llmProvider: LlmProvider;
  private readonly modelId: string;

  public constructor(llmProvider: LlmProvider, modelId: string) {
    this.llmProvider = llmProvider;
    this.modelId = modelId;
  }

  /**
   * @param preserveSpokenLines when true (script-first mode) the verbatim user dialogue is NEVER
   *   rewritten — only action/emotionalTurn are polished.
   */
  public async enhance(
    storyPlan: StoryPlan,
    intake: IntakeResult,
    preserveSpokenLines: boolean,
    signal?: AbortSignal
  ): Promise<StoryPlan> {
    const beats = storyPlan.scenes.flatMap((scene) => scene.beats);
    if (beats.length === 0) {
      return storyPlan;
    }
    try {
      const response = await this.llmProvider.structured<EnhancerJson, typeof ENHANCER_SCHEMA>(
        {
          modelId: this.modelId,
          instruction:
            "You are a continuity + dialogue polish expert. Improve the given video beats WITHOUT changing them structurally: sharpen each `action` into concrete, filmable sensory specifics (physical tells, not named emotions); make each `spokenLine` sound like real, natural spoken speech in its ORIGINAL language (keep Vietnamese particles nhé/nha/á/ạ and casual relationship pronouns; never translate, romanize, or change the language); and firm up `emotionalTurn` into one clearly visible state A -> state B. HUMANIZE PASS (the AI-text audit): the FIRST beat's spoken line must be at most 14 words with something concrete (a number, result, question, or contradiction) — trim greetings and wind-up; strike the AI tells wherever they appear: forced rule-of-three lists, \"không chỉ X mà còn Y / not just X but Y\" parallelism, buzzwords (nâng tầm, tối ưu, trải nghiệm đỉnh cao, elevate, seamless, game-changer); read every spoken line aloud in your head — if it reads like ad copy or a written product description, make it shorter and more direct until it sounds like a friend talking. HARD RULES: do NOT change the plot, the beat order, the number of beats, or which character speaks; do NOT invent new beats; return the SAME beatIds. For each beat return only the fields you actually improved. Keep every value short and camera-real; never add booster words (8K, cinematic, masterpiece)." +
            (preserveSpokenLines
              ? " SCRIPT-FIRST: the spoken lines are the user's own verbatim script — do NOT return spokenLine for any beat; polish only action and emotionalTurn."
              : ""),
          schema: ENHANCER_SCHEMA,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                register: intake.creativeIntent?.register,
                tone: intake.creativeIntent?.tone,
                emotionArc: intake.creativeIntent?.emotionArc,
                language: intake.creativeIntent?.language,
                beats: beats.map((beat) => ({
                  beatId: beat.beatId,
                  purpose: beat.purpose,
                  action: beat.action,
                  ...(beat.spokenLine ? { spokenLine: beat.spokenLine } : {}),
                  ...(beat.emotionalTurn ? { emotionalTurn: beat.emotionalTurn } : {})
                }))
              })
            }
          ],
          metadata: {
            ...(intake.metadata ?? {}),
            projectId: intake.projectId,
            graphNodeId: "script_enhance"
          }
        },
        signal
      );
      return this.mergePolish(storyPlan, response.value, preserveSpokenLines);
    } catch {
      // Fail-open: polish is a pure enhancer, never a blocker.
      return storyPlan;
    }
  }

  private mergePolish(storyPlan: StoryPlan, value: EnhancerJson, preserveSpokenLines: boolean): StoryPlan {
    const polishByBeatId = new Map<string, EnhancerBeatJson>();
    for (const beat of Array.isArray(value.beats) ? value.beats : []) {
      const beatId = typeof beat.beatId === "string" ? beat.beatId : "";
      if (beatId) {
        polishByBeatId.set(beatId, beat);
      }
    }
    if (polishByBeatId.size === 0) {
      return storyPlan;
    }
    const text = (candidate: unknown): string | undefined =>
      typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
    const polishBeat = (beat: BeatPlan): BeatPlan => {
      const polish = polishByBeatId.get(beat.beatId);
      if (!polish) {
        return beat;
      }
      const action = text(polish.action);
      const spokenLine = preserveSpokenLines ? undefined : text(polish.spokenLine);
      const emotionalTurn = text(polish.emotionalTurn);
      return {
        ...beat,
        ...(action ? { action } : {}),
        // Only replace an EXISTING spoken line — never add dialogue to a silent (b-roll) beat.
        // Re-cap the polished line to what the beat's runtime can speak: the enhancer runs AFTER
        // the architect's duration budgeting, so an uncapped rewrite could silently undo it
        // (adversarial-audit #5). Script-first verbatim lines never reach this branch —
        // preserveSpokenLines already zeroed `spokenLine` above.
        ...(spokenLine && beat.spokenLine ? { spokenLine: capToSpeakableWords(spokenLine, beat.durationSeconds, TALKING_WORDS_PER_SECOND) } : {}),
        ...(emotionalTurn ? { emotionalTurn } : {})
      };
    };
    const scenes: readonly ScenePlan[] = storyPlan.scenes.map((scene) => ({
      ...scene,
      beats: scene.beats.map(polishBeat)
    }));
    return { ...storyPlan, scenes };
  }
}
