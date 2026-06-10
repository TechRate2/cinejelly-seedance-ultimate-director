/**
 * Story Architect uses the configured LLM provider to build a structured scene/beat plan.
 * It asks for universal production primitives instead of niche templates.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ContinuityRisk } from "../types/prompt.js";
import type { BeatPlan, ScenePlan } from "../core/shot-planner.js";

interface StoryPlanJson {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly scenes: readonly unknown[];
}

const KNOWN_RISKS = new Set<string>([
  "face",
  "product_logo",
  "wardrobe",
  "environment",
  "physics",
  "text",
  "multi_character_blocking",
  "audio_sync",
  "transition"
]);
const MIN_BEAT_DURATION_SECONDS = 4;

const STORY_PLAN_SCHEMA = {
  type: "object",
  required: ["premise", "targetDurationSeconds", "scenes"],
  properties: {
    premise: { type: "string" },
    targetDurationSeconds: { type: "number" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        required: ["sceneId", "title", "beats"],
        properties: {
          sceneId: { type: "string" },
          title: { type: "string" },
          beats: {
            type: "array",
            items: {
              type: "object",
              required: ["beatId", "purpose", "action", "subject", "camera", "lighting", "durationSeconds"],
              properties: {
                beatId: { type: "string" },
                purpose: { type: "string" },
                action: { type: "string" },
                subject: { type: "string" },
                camera: { type: "string" },
                lighting: { type: "string" },
                style: { type: "string" },
                audioIntent: { type: "string" },
                durationSeconds: { type: "number" },
                risks: { type: "array", items: { type: "string" } },
                identity: { type: "string" },
                product: { type: "string" },
                environment: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export class StoryArchitect {
  private readonly llmProvider: LlmProvider;
  private readonly modelId: string;

  public constructor(llmProvider: LlmProvider, modelId: string) {
    this.llmProvider = llmProvider;
    this.modelId = modelId;
  }

  public async plan(intake: IntakeResult, signal?: AbortSignal): Promise<StoryPlan> {
    const response = await this.llmProvider.structured<StoryPlanJson, typeof STORY_PLAN_SCHEMA>(
      {
        modelId: this.modelId,
        instruction:
          "Create a production-ready long-form video scene plan. Use reusable production primitives, not hardcoded niche templates.",
        schema: STORY_PLAN_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are CineJelly's Story Architect. Return JSON only. Each scene must contain beats with beatId, purpose, action, subject, camera, lighting, durationSeconds, risks, references, and continuity."
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: intake.userInput,
              settings: intake.settings,
              referenceCount: intake.references.length
            })
          }
        ],
        metadata: {
          ...(intake.metadata ?? {}),
          projectId: intake.projectId,
          graphNodeId: "story_plan"
        }
      },
      signal
    );

    return this.coerceStoryPlan(response.value, intake);
  }

  private coerceStoryPlan(value: StoryPlanJson, intake: IntakeResult): StoryPlan {
    if (!value.premise || !Array.isArray(value.scenes)) {
      throw new Error("Story Architect response is missing premise or scenes.");
    }
    const scenes = value.scenes.map((scene, sceneIndex) => this.coerceScene(scene, sceneIndex, intake));
    const usableScenes = scenes.length > 0 ? scenes : [this.fallbackScene(intake, 0)];
    const boundedScenes = this.limitBeatsToDurationCapacity(usableScenes, intake);
    const normalizedScenes = this.normalizeDurations(boundedScenes, intake.settings.durationTargetSeconds);

    return {
      premise: value.premise,
      targetDurationSeconds: intake.settings.durationTargetSeconds,
      scenes: normalizedScenes
    };
  }

  private coerceScene(scene: unknown, sceneIndex: number, intake: IntakeResult): ScenePlan {
    const payload = scene && typeof scene === "object" ? (scene as Record<string, unknown>) : {};
    const rawBeats = Array.isArray(payload.beats) ? payload.beats : [];
    const sceneId = typeof payload.sceneId === "string" ? payload.sceneId : `scene_${sceneIndex + 1}`;
    const title = typeof payload.title === "string" ? payload.title : `Scene ${sceneIndex + 1}`;
    const beats = rawBeats.length > 0
      ? rawBeats.map((beat, beatIndex) => this.coerceBeat(beat, sceneIndex, beatIndex, intake))
      : [this.fallbackBeat(sceneId, title, sceneIndex, 0, intake)];

    return {
      sceneId,
      title,
      beats
    };
  }

  private coerceBeat(
    beat: unknown,
    sceneIndex: number,
    beatIndex: number,
    intake: IntakeResult
  ): BeatPlan {
    const payload = beat && typeof beat === "object" ? (beat as Record<string, unknown>) : {};
    const style = typeof payload.style === "string" ? payload.style : undefined;
    const audioIntent = typeof payload.audioIntent === "string" ? payload.audioIntent : undefined;
    const identity = typeof payload.identity === "string" ? payload.identity : undefined;
    const product = typeof payload.product === "string" ? payload.product : undefined;
    const environment = typeof payload.environment === "string" ? payload.environment : undefined;

    return {
      beatId: typeof payload.beatId === "string" ? payload.beatId : `scene_${sceneIndex + 1}_beat_${beatIndex + 1}`,
      purpose: this.readString(payload.purpose, "advance the story with a clear commercial beat"),
      action: this.readString(payload.action, "show a clear visual action that fulfills the beat"),
      subject: this.readString(payload.subject, "the primary subject described by the user"),
      camera: this.readString(payload.camera, "stable cinematic camera with clear composition"),
      lighting: this.readString(payload.lighting, "coherent cinematic lighting"),
      ...(style ? { style } : {}),
      ...(audioIntent ? { audioIntent } : {}),
      durationSeconds: this.readNumber(payload.durationSeconds, Math.max(8, Math.min(15, intake.settings.durationTargetSeconds / 12))),
      risks: this.readRisks(payload.risks),
      references: intake.references,
      continuity: {
        ...(identity ? { identity } : {}),
        ...(product ? { product } : {}),
        ...(environment ? { environment } : {}),
        ...(style ? { style } : {})
      }
    };
  }

  private fallbackScene(intake: IntakeResult, sceneIndex: number): ScenePlan {
    const sceneId = `scene_${sceneIndex + 1}`;
    return {
      sceneId,
      title: "Core Production Scene",
      beats: [this.fallbackBeat(sceneId, "Core Production Scene", sceneIndex, 0, intake)]
    };
  }

  private fallbackBeat(sceneId: string, sceneTitle: string, sceneIndex: number, beatIndex: number, intake: IntakeResult): BeatPlan {
    return {
      beatId: `${sceneId}_beat_${beatIndex + 1}`,
      purpose: "turn the user's input into a clear commercial visual beat",
      action: `visualize the main idea from the user input with a coherent beginning, middle, and end: ${intake.userInput}`,
      subject: "the primary subject described by the user",
      camera: "stable cinematic camera with clear subject framing",
      lighting: "coherent commercial cinematic lighting",
      style: sceneTitle,
      durationSeconds: intake.settings.durationTargetSeconds,
      risks: [],
      references: intake.references,
      continuity: {
        environment: `maintain the setting established in ${sceneTitle}`
      },
      ...(intake.settings.audioMode !== "none" ? { audioIntent: "support the visual pacing with coherent ambience or music" } : {})
    };
  }

  private normalizeDurations(scenes: readonly ScenePlan[], targetDurationSeconds: number): readonly ScenePlan[] {
    const allBeats = scenes.flatMap((scene) => scene.beats);
    if (allBeats.length === 0) {
      return scenes;
    }
    const minTotal = allBeats.length * MIN_BEAT_DURATION_SECONDS;
    const distributableSeconds = Math.max(0, Math.round(targetDurationSeconds - minTotal));
    const weights = allBeats.map((beat) => Math.max(0, beat.durationSeconds - MIN_BEAT_DURATION_SECONDS));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const exactExtras = weights.map((weight) =>
      weightTotal > 0 ? (distributableSeconds * weight) / weightTotal : distributableSeconds / allBeats.length
    );
    const floorExtras = exactExtras.map((extra) => Math.floor(extra));
    let remainder = distributableSeconds - floorExtras.reduce((sum, extra) => sum + extra, 0);
    const fractionalOrder = exactExtras
      .map((extra, index) => ({ index, fraction: extra - Math.floor(extra) }))
      .sort((left, right) => right.fraction - left.fraction);

    for (const item of fractionalOrder) {
      if (remainder <= 0) {
        break;
      }
      floorExtras[item.index] = (floorExtras[item.index] ?? 0) + 1;
      remainder -= 1;
    }

    let beatCursor = 0;
    return scenes.map((scene, sceneIndex) => ({
      ...scene,
      beats: scene.beats.map((beat) => {
        const durationSeconds = MIN_BEAT_DURATION_SECONDS + (floorExtras[beatCursor] ?? 0);
        beatCursor += 1;
        return {
          ...beat,
          durationSeconds
        };
      })
    }));
  }

  private limitBeatsToDurationCapacity(scenes: readonly ScenePlan[], intake: IntakeResult): readonly ScenePlan[] {
    const maxBeats = Math.max(1, Math.floor(intake.settings.durationTargetSeconds / MIN_BEAT_DURATION_SECONDS));
    let remaining = maxBeats;
    const bounded: ScenePlan[] = [];

    for (const scene of scenes) {
      if (remaining <= 0) {
        break;
      }
      const beats = scene.beats.slice(0, remaining);
      remaining -= beats.length;
      if (beats.length > 0) {
        bounded.push({ ...scene, beats });
      }
    }

    return bounded.length > 0 ? bounded : [this.fallbackScene(intake, 0)];
  }

  private readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  private readNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private readRisks(value: unknown): readonly ContinuityRisk[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((risk): risk is ContinuityRisk => typeof risk === "string" && KNOWN_RISKS.has(risk));
  }
}
