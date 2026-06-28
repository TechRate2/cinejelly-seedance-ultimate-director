/**
 * Story Architect uses the configured LLM provider to build a structured scene/beat plan.
 * It asks for universal production primitives instead of niche templates.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ContinuityRisk } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
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
          "Create a production-ready video scene plan. Use reusable production primitives, not hardcoded niche templates. For short commercial inputs, allocate the full requested duration into a complete hook/problem, proof/demo, and payoff arc.",
        schema: STORY_PLAN_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are CineJelly's Story Architect. Return JSON only. Each scene must contain beats with beatId, purpose, action, subject, camera, lighting, durationSeconds, risks, references, and continuity. For 15-60s short videos, do not waste the duration on repeated static product macro shots: the plan must include an opening hook/problem, a middle demo/proof action, and an ending payoff/result or soft next-step implication. If sourceVideoAnalysis is present, use it only for original pacing, structure, camera grammar, and style transformation; do not copy exact shots, transcript wording, likenesses, logos, or protected expression."
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: intake.userInput,
              settings: intake.settings,
              referenceCount: intake.references.length,
              ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: this.sourceVideoBrief(intake.sourceVideoAnalysis) } : {})
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
    const workflowScenes = this.singleClipRequested(intake)
      ? [this.singleClipScene(usableScenes, intake)]
      : usableScenes;
    const boundedScenes = this.limitBeatsToDurationCapacity(workflowScenes, intake);
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
    const audioIntent = typeof payload.audioIntent === "string" && payload.audioIntent.trim()
      ? payload.audioIntent.trim()
      : this.defaultAudioIntent(payload, intake);
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

  private singleClipRequested(intake: IntakeResult): boolean {
    const metadata = intake.metadata ?? {};
    const rawMode = metadata.workflowMode ?? metadata.renderMode ?? metadata.videoMode ?? metadata.mode;
    const normalized = rawMode?.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "single" || normalized === "single_clip" || normalized === "one_clip") {
      return true;
    }
    if (normalized && normalized !== "auto") {
      return false;
    }
    return metadata.shortPipelineRecommendedWorkflowMode === "single_clip";
  }

  private singleClipScene(scenes: readonly ScenePlan[], intake: IntakeResult): ScenePlan {
    const beats = scenes.flatMap((scene) => scene.beats);
    const firstBeat = beats[0] ?? this.fallbackBeat("single_clip_scene", "Single Clip", 0, 0, intake);
    const actionArc = beats
      .map((beat) => beat.action)
      .filter((action) => action.trim().length > 0)
      .slice(0, 6)
      .join(" Then ");
    const risks = [...new Set(beats.flatMap((beat) => beat.risks))];
    const continuity = beats.reduce<BeatPlan["continuity"]>((accumulator, beat) => ({
      ...accumulator,
      ...beat.continuity
    }), {});
    const sceneTitle = scenes.map((scene) => scene.title).filter(Boolean).slice(0, 3).join(" / ") || "Single Clip";
    return {
      sceneId: "single_clip_scene",
      title: sceneTitle,
      beats: [
        {
          ...firstBeat,
          beatId: "single_clip_beat_1",
          purpose: "render the approved short plan as one continuous provider clip",
          action: this.singleClipActionArc(actionArc || firstBeat.action, intake),
          durationSeconds: intake.settings.durationTargetSeconds,
          risks,
          references: intake.references,
          continuity,
          ...(intake.settings.audioMode !== "none"
            ? { audioIntent: firstBeat.audioIntent ?? "support the single-clip short with coherent ambience or narration timing" }
            : {})
        }
      ]
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

  private defaultAudioIntent(payload: Record<string, unknown>, intake: IntakeResult): string | undefined {
    if (intake.settings.audioMode === "none") {
      return undefined;
    }
    const purpose = typeof payload.purpose === "string" ? payload.purpose.toLowerCase() : "";
    if (/\bhook\b|opening|first/.test(purpose)) {
      return "guided voiceover starts immediately with a sharp hook, low-volume music bed, and no dead air";
    }
    if (/\bpayoff\b|result|cta|ending|close/.test(purpose)) {
      return "guided voiceover resolves under the visual payoff with a soft next-step line and clean music tail";
    }
    return "guided voiceover supports the visible demo or proof action, with subtle ambience and product/contact SFX where useful";
  }

  private singleClipActionArc(action: string, intake: IntakeResult): string {
    if (intake.settings.durationTargetSeconds > 60) {
      return action;
    }
    return [
      "Use the full short duration as one continuous arc:",
      "0-1s hook/problem or payoff promise;",
      "middle seconds show context plus demo/proof action;",
      "final seconds show the result, reaction, or soft next-step implication.",
      `Planned action: ${action}`
    ].join(" ");
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

  private sourceVideoBrief(value: SourceVideoDeconstruction): Record<string, unknown> {
    return {
      ...(value.sourceReferenceLabel ? { sourceReferenceLabel: value.sourceReferenceLabel } : {}),
      ...(value.transformationIntent ? { transformationIntent: value.transformationIntent } : {}),
      sceneCount: value.scenes?.length ?? 0,
      transcriptCueCount: value.transcript?.length ?? 0,
      scenes: (value.scenes ?? []).slice(0, 80).map((scene) => ({
        sceneId: scene.sceneId,
        startSecond: scene.startSecond,
        endSecond: scene.endSecond,
        summary: scene.summary,
        ...(scene.pacing ? { pacing: scene.pacing } : {}),
        ...(scene.camera ? { camera: scene.camera } : {}),
        ...(scene.audio ? { audio: scene.audio } : {}),
        ...(scene.visualStyle ? { visualStyle: scene.visualStyle } : {}),
        keyframes: (scene.keyframes ?? []).slice(0, 6).map((keyframe) => ({
          timestampSecond: keyframe.timestampSecond,
          description: keyframe.description
        }))
      })),
      transcript: (value.transcript ?? []).slice(0, 160).map((cue) => ({
        startSecond: cue.startSecond,
        endSecond: cue.endSecond,
        text: cue.text
      })),
      pacingNotes: (value.pacingNotes ?? []).slice(0, 60),
      styleNotes: (value.styleNotes ?? []).slice(0, 60),
      structuralBeats: (value.structuralBeats ?? []).slice(0, 80),
      safetyNotes: (value.safetyNotes ?? []).slice(0, 60)
    };
  }
}
