/**
 * Story Architect uses the configured LLM provider to build a structured scene/beat plan.
 * It asks for universal production primitives instead of niche templates.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ContinuityRisk } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import type { BeatPlan, ScenePlan } from "../core/shot-planner.js";
import { USER_SCRIPT_OPEN_MARKER } from "../core/simple-brief-resolver.js";
import { nichePlaybookDirective, SEEDANCE_MASTERY_DIRECTIVE } from "../core/niche-playbooks.js";
import { antiSlopDirective } from "../core/anti-slop-lexicon.js";
import { isStyleRegister, registerForCreativeMode } from "../core/register-grammar.js";
import type { StyleDna, StyleRegister } from "../types/prompt.js";

/**
 * Detect a pasted, already-written script inside free-form user input so the planner can
 * switch to script-first mode. Explicit marker wins; otherwise a conservative heuristic:
 * several lines that look like scene headings, dialogue, or numbered shots.
 */
export function looksLikeUserScript(userInput: string): boolean {
  if (userInput.includes(USER_SCRIPT_OPEN_MARKER)) {
    return true;
  }
  const lines = userInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 4) {
    return false;
  }
  const scriptLike = lines.filter(
    (line) =>
      /^(INT\.|EXT\.|SCENE\b|CẢNH\b|SHOT\b|\d+[.)]\s)/iu.test(line) ||
      /^[\p{Lu}][\p{L} .'-]{1,30}:\s/u.test(line) ||
      /^\[\d{1,2}:?\d{0,2}\s*[-–]\s*\d{1,2}:?\d{0,2}s?\]/u.test(line)
  );
  return scriptLike.length >= 3;
}

const SCRIPT_FIRST_DIRECTIVE =
  "SCRIPT-FIRST MODE: the user input contains a finished script. Treat it as the authoritative screenplay: keep its scene order, events, and any dialogue/narration lines VERBATIM in their original language (do not rewrite, translate, paraphrase, or invent new lines). Put each beat's exact spoken dialogue/narration line into that beat's `spokenLine` field word-for-word (leave `spokenLine` empty for beats with no spoken line); use `action` only for the visual staging, never to paraphrase the spoken line. Your job is only to decompose the script into scenes/beats with timing and to design the visual staging (subject state, camera, lighting, audio rhythm) around the user's own lines.";

/**
 * Hard language contract (final-upgrade design, mined from real paid-run artifacts): visual fields in
 * English (video models follow English direction most reliably), spoken lines ONLY in the user's
 * language with full diacritics and natural SPOKEN register — the split that previously happened by
 * accident is now law. Vietnamese-specific spoken markers included because it is the primary market.
 */
export const LANGUAGE_CONTRACT_DIRECTIVE =
  "LANGUAGE CONTRACT (obey exactly): Write EVERY visual and production field — premise, title, purpose, action, subject, camera, lighting, style, audioIntent, and all continuity values — in ENGLISH, because the video model follows English direction most reliably. Write each beat's `spokenLine` ONLY in the user's language (the language of the user's brief or pasted script), reproduced with FULL correct diacritics and natural spoken punctuation; never translate, romanize, or strip diacritics from it. Write spoken lines the way a real person TALKS to a phone camera, not the way text is WRITTEN: short breathing clauses, everyday words, natural sentence-final particles. For Vietnamese use spoken markers (nhé, nha, đấy, đó, luôn, á, ạ, mà, thôi), relationship-correct casual pronouns (mình/tớ/cậu; chị/em, anh/em — not the flat written tôi/bạn), and real spoken openers (Ôi, Ơ, Trời ơi). Stiff written-formal sentences read as AI instantly — forbidden.";

/**
 * Scriptwriting craft law (mined from ViMax/micro-drama screenwriter prompts, SkyReels expression
 * grammar, and the top community Seedance prompts): the difference between an alive script and a
 * stiff one is one visible emotional turn per beat, physical tells instead of named emotions, and
 * dialogue with subtext. Register-aware so one engine serves cinematic AND phone-KOL output.
 */
export const SCRIPT_CRAFT_DIRECTIVE =
  "You are a professional screenwriter, not a shot-list generator. REGISTER — pick ONE writing voice for the whole video and never mix: professional_cinematic (composed performances, motivated blocking, designed light, restrained dialogue with subtext, one deliberate camera move per beat — the craft is invisible) or natural_phone_kol (a real person talking to their own phone — selfie framing, genuine micro-shake, in-camera sound, filler words and self-interruption in speech, no scored music, no grade, no slow-motion — it must look UN-crafted, like a friend's clip). If not told, infer: review/testimonial/how-to/vlog -> natural_phone_kol; story/brand-film/drama/product-hero -> professional_cinematic. ONE-TURN RULE: every beat carries exactly ONE visible emotional or situational turn (state A -> state B the viewer can SEE); write it into the beat's `emotionalTurn` field (e.g. \"skeptical -> quietly impressed\"), and each beat must pick up the emotional state the previous beat ended on so the whole video traces one feeling, not a montage. SHOW DON'T TELL: never name an emotion in `action` — convert it to a physical tell (not \"she is angry\" but \"she clenches her fist, nails digging into her palm\"; not \"surprised\" but \"a 0.3s freeze, then her eyes widen\"). No metaphors or similes in action/camera — write only what the lens physically sees. DIALOGUE: spoken lines are real speech — one breath long, subtext over statement (a character says less than they mean), never brochure copy, never a feature list; micro-pauses and self-corrections are welcome.";

interface StoryPlanJson {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly register?: unknown;
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
    register: { type: "string", enum: ["professional_cinematic", "natural_phone_kol"] },
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
                spokenLine: { type: "string" },
                emotionalTurn: { type: "string" },
                styleDna: {
                  type: "object",
                  properties: {
                    optics: { type: "string" },
                    lighting: { type: "string" },
                    palette: { type: "string" },
                    motion: { type: "string" },
                    performance: { type: "string" },
                    audioFeel: { type: "string" },
                    moodWords: { type: "array", items: { type: "string" } },
                    avoid: { type: "array", items: { type: "string" } }
                  }
                },
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
    // Script-time niche intelligence: the matching content-family playbook (mined from the
    // proven Seedance prompt corpus) plus cross-family mastery rules become part of the
    // planning instruction, so scripts are born with the winning hook/beats/audio/reference
    // strategy for their niche instead of a generic arc.
    const playbookDirective = nichePlaybookDirective({
      ...(intake.metadata?.shortViralNiche ?? intake.metadata?.niche
        ? { niche: (intake.metadata.shortViralNiche ?? intake.metadata.niche) as string }
        : {}),
      ...(intake.metadata?.shortViralCreativeMode ?? intake.metadata?.creativeMode
        ? { creativeMode: (intake.metadata.shortViralCreativeMode ?? intake.metadata.creativeMode) as string }
        : {})
    });
    const response = await this.llmProvider.structured<StoryPlanJson, typeof STORY_PLAN_SCHEMA>(
      {
        modelId: this.modelId,
        instruction:
          "Create a production-ready video scene plan. Use reusable production primitives, not hardcoded niche templates. Allocate the full requested duration into a complete beginning, middle, and ending: short commercial inputs need hook/problem, proof/demo, and payoff/soft next-step; long-form inputs need setup, development, proof escalation, and resolved close. Every beat must include a concrete visible state change, timed audio intent when audio is enabled, and an endpoint that the next beat can continue without a visible jump cut. " +
          `${playbookDirective} ${SEEDANCE_MASTERY_DIRECTIVE} ${antiSlopDirective()}`,
        schema: STORY_PLAN_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              (looksLikeUserScript(intake.userInput) || intake.metadata?.scriptFirst === "true"
                ? `${SCRIPT_FIRST_DIRECTIVE} `
                : "") +
              `${SCRIPT_CRAFT_DIRECTIVE} ${LANGUAGE_CONTRACT_DIRECTIVE} ` +
              "STYLE DNA: return your chosen register in the top-level `register` field, and for each beat author `styleDna` — SHORT concrete niche specifics for optics, lighting, palette, motion, performance, and audioFeel (e.g. macro serum-on-skin glisten for beauty; fabric drape in motion for fashion). This is where ALL category detail lives — physical, camera-real wording only; never booster words like 8K, masterpiece, or hyper-detailed. " +
              "You are CineJelly's Story Architect. Return JSON only. Each scene must contain beats with beatId, purpose, action, subject, camera, lighting, durationSeconds, risks, references, continuity, and audioIntent when audio is not none. For 15-60s short videos, do not waste the duration on repeated static product macro shots: the plan must include an opening hook/problem, a middle demo/proof action, and an ending payoff/result or soft next-step implication. For longer videos, avoid a loose montage: each section must advance the argument, proof, emotion, or product understanding. Make every action concrete enough to film: visible subject state, physical product contact or proof action, camera movement, audio rhythm, and an endpoint that can cut or crossfade into the next beat. Keep voiceover concise enough for the beat duration. The `references` array lists every uploaded asset the user supplied, each with its role (identity=a specific character, product, environment, wardrobe, voice, style) and label; treat it as the cast and prop roster. Deliberately schedule these across beats — set each beat's continuity.identity/product/environment to the matching reference label so a distinct character enters/leaves on purpose (e.g. character A in the opening beats, character B enters at the turn) and the hero product is bound to the beats where it must appear; never merge two identity references into one character. Give EACH distinct character (including invented ones with no uploaded reference) a SHORT STABLE label — a name or role such as \"Linh\" or \"the founder\" — and set every beat's `identity` to that EXACT same label for every beat the character appears in. Never describe the same recurring person with two different identity strings (e.g. \"young woman\" in one beat and \"the girl\" in another); reuse the one label verbatim, so the pipeline recognizes it as one person and keeps their face consistent across shots. When a beat features SEVERAL characters, list their labels separated by commas (e.g. identity: \"Linh, Mai\") — never invent a combined name; each listed person keeps their own locked face. If sourceVideoAnalysis is present, use it only for original pacing, structure, camera grammar, and style transformation; do not copy exact shots, transcript wording, likenesses, logos, or protected expression."
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: intake.userInput,
              settings: intake.settings,
              // Surface the reference ROSTER (role + label), not just a count, so the planner can
              // deliberately cast distinct identities/products/environments across beats instead of
              // planning blind (final-audit gap #4). Bounded to keep the payload small.
              references: intake.references
                .slice(0, 24)
                .map((reference) => ({ role: reference.role, label: reference.label })),
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
    const register: StyleRegister | undefined = isStyleRegister(value.register)
      ? value.register
      : registerForCreativeMode(
          typeof intake.metadata?.shortViralCreativeMode === "string"
            ? intake.metadata.shortViralCreativeMode
            : typeof intake.metadata?.creativeMode === "string" ? intake.metadata.creativeMode : undefined
        );
    const scenes = value.scenes.map((scene, sceneIndex) => this.coerceScene(scene, sceneIndex, intake, register));
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

  /** LLM-authored per-beat style DNA; requires a resolved register to anchor the axes. */
  private coerceStyleDna(value: unknown, register: StyleRegister | undefined): StyleDna | undefined {
    if (!register) {
      return undefined;
    }
    const payload = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const text = (key: string): string | undefined =>
      typeof payload[key] === "string" && (payload[key] as string).trim() ? (payload[key] as string).trim() : undefined;
    const list = (key: string): readonly string[] | undefined => {
      const raw = payload[key];
      if (!Array.isArray(raw)) {
        return undefined;
      }
      const cleaned = raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8);
      return cleaned.length > 0 ? cleaned : undefined;
    };
    const optics = text("optics");
    const lighting = text("lighting");
    const palette = text("palette");
    const motion = text("motion");
    const performance = text("performance");
    const audioFeel = text("audioFeel");
    const moodWords = list("moodWords");
    const avoid = list("avoid");
    // A register alone is NOT authored DNA — without at least one axis the legacy niche/mode tables
    // must still fire under the register frame, or briefs where the LLM skips styleDna lose all
    // category color (caught by the input-matrix harness).
    if (!optics && !lighting && !palette && !motion && !performance && !audioFeel && !moodWords && !avoid) {
      return undefined;
    }
    return {
      register,
      ...(optics ? { optics } : {}),
      ...(lighting ? { lighting } : {}),
      ...(palette ? { palette } : {}),
      ...(motion ? { motion } : {}),
      ...(performance ? { performance } : {}),
      ...(audioFeel ? { audioFeel } : {}),
      ...(moodWords ? { moodWords } : {}),
      ...(avoid ? { avoid } : {})
    };
  }

  private coerceScene(scene: unknown, sceneIndex: number, intake: IntakeResult, register?: StyleRegister): ScenePlan {
    const payload = scene && typeof scene === "object" ? (scene as Record<string, unknown>) : {};
    const rawBeats = Array.isArray(payload.beats) ? payload.beats : [];
    const sceneId = typeof payload.sceneId === "string" ? payload.sceneId : `scene_${sceneIndex + 1}`;
    const title = typeof payload.title === "string" ? payload.title : `Scene ${sceneIndex + 1}`;
    const beats = rawBeats.length > 0
      ? rawBeats.map((beat, beatIndex) => this.coerceBeat(beat, sceneIndex, beatIndex, intake, register))
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
    intake: IntakeResult,
    register?: StyleRegister
  ): BeatPlan {
    const payload = beat && typeof beat === "object" ? (beat as Record<string, unknown>) : {};
    const style = typeof payload.style === "string" ? payload.style : undefined;
    const audioIntent = typeof payload.audioIntent === "string" && payload.audioIntent.trim()
      ? payload.audioIntent.trim()
      : this.defaultAudioIntent(payload, intake);
    const identity = typeof payload.identity === "string" ? payload.identity : undefined;
    const product = typeof payload.product === "string" ? payload.product : undefined;
    const environment = typeof payload.environment === "string" ? payload.environment : undefined;
    // Verbatim scripted line: preserved EXACTLY as the model returned it (only outer whitespace
    // trimmed) so a script-first user's dialogue/narration is never paraphrased downstream (gap #6).
    const spokenLine = typeof payload.spokenLine === "string" && payload.spokenLine.trim()
      ? payload.spokenLine.trim()
      : undefined;
    const emotionalTurn = typeof payload.emotionalTurn === "string" && payload.emotionalTurn.trim()
      ? payload.emotionalTurn.trim()
      : undefined;
    const styleDna = this.coerceStyleDna(payload.styleDna, register);

    return {
      beatId: typeof payload.beatId === "string" ? payload.beatId : `scene_${sceneIndex + 1}_beat_${beatIndex + 1}`,
      purpose: this.readString(payload.purpose, "advance the story with a clear commercial beat"),
      action: this.readString(payload.action, "show a clear visual action that fulfills the beat"),
      subject: this.readString(payload.subject, "the primary subject described by the user"),
      camera: this.readString(payload.camera, "stable cinematic camera with clear composition"),
      lighting: this.readString(payload.lighting, "coherent cinematic lighting"),
      ...(style ? { style } : {}),
      ...(audioIntent ? { audioIntent } : {}),
      ...(spokenLine ? { spokenLine } : {}),
      ...(emotionalTurn ? { emotionalTurn } : {}),
      ...(styleDna ? { styleDna } : {}),
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
      "final seconds show the result, reaction, or soft next-step implication;",
      "end on a stable frame that can be exported directly or chained into the next clip.",
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
      ...(value.mediaMetrics ? { mediaMetrics: this.sourceVideoMediaMetricsBrief(value.mediaMetrics) } : {}),
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

  private sourceVideoMediaMetricsBrief(value: NonNullable<SourceVideoDeconstruction["mediaMetrics"]>): Record<string, unknown> {
    return {
      ...(value.durationSeconds !== undefined ? { durationSeconds: value.durationSeconds } : {}),
      ...(value.video ? { video: value.video } : {}),
      audio: value.audio,
      editRhythm: {
        sceneCutCount: value.editRhythm.sceneCutCount,
        cutDensityPerMinute: value.editRhythm.cutDensityPerMinute,
        averageShotLengthSeconds: value.editRhythm.averageShotLengthSeconds,
        rhythmLabel: value.editRhythm.rhythmLabel,
        sceneCutTimestampsSeconds: (value.editRhythm.sceneCutTimestampsSeconds ?? []).slice(0, 24)
      },
      evidence: {
        probeSucceeded: value.evidence.probeSucceeded,
        sceneDetectionSucceeded: value.evidence.sceneDetectionSucceeded,
        sourceUriSha256: value.evidence.sourceUriSha256
      }
    };
  }
}
