/**
 * Story Architect uses the configured LLM provider to build a structured scene/beat plan.
 * It asks for universal production primitives instead of niche templates.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ContinuityRisk } from "../types/prompt.js";

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
          beats: { type: "array" }
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
    return {
      premise: value.premise,
      targetDurationSeconds: value.targetDurationSeconds || intake.settings.durationTargetSeconds,
      scenes: value.scenes.map((scene, sceneIndex) => this.coerceScene(scene, sceneIndex, intake))
    };
  }

  private coerceScene(scene: unknown, sceneIndex: number, intake: IntakeResult): StoryPlan["scenes"][number] {
    const payload = scene && typeof scene === "object" ? (scene as Record<string, unknown>) : {};
    const rawBeats = Array.isArray(payload.beats) ? payload.beats : [];
    return {
      sceneId: typeof payload.sceneId === "string" ? payload.sceneId : `scene_${sceneIndex + 1}`,
      title: typeof payload.title === "string" ? payload.title : `Scene ${sceneIndex + 1}`,
      beats: rawBeats.map((beat, beatIndex) => this.coerceBeat(beat, sceneIndex, beatIndex, intake))
    };
  }

  private coerceBeat(
    beat: unknown,
    sceneIndex: number,
    beatIndex: number,
    intake: IntakeResult
  ): StoryPlan["scenes"][number]["beats"][number] {
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
