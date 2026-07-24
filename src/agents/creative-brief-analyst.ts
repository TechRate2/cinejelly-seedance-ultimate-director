/**
 * Creative Brief Analyst — the deep-understanding stage BETWEEN intake and the scriptwriter.
 *
 * One structured LLM call that reasons about the WHOLE brief (register, story engine, emotional
 * curve, bespoke style DNA) so the Story Architect starts from an explicit creative decision instead
 * of re-deriving it per beat. Fail-open: any LLM failure returns a deterministic fallback derived
 * from the intake's existing signals, so the pipeline never blocks on this stage.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult } from "../types/agent.js";
import type { CreativeIntent } from "../types/creative-intent.js";
import type { StyleDna, StyleRegister } from "../types/prompt.js";
import { explicitStyleTagRegister, isStyleRegister, registerForCreativeMode } from "../core/register-grammar.js";
import { containsVietnameseDiacritics, normalizeSpokenLanguageCode } from "../core/spoken-language.js";

const CREATIVE_INTENT_SCHEMA = {
  type: "object",
  required: ["register", "genre", "niche", "audience", "language", "tone", "emotionArc", "pacingProfile", "visualWorld", "storyEngine"],
  properties: {
    register: { type: "string", enum: ["professional_cinematic", "natural_phone_kol"] },
    genre: { type: "string" },
    niche: { type: "string" },
    audience: { type: "string" },
    language: { type: "string" },
    tone: { type: "string" },
    emotionArc: { type: "string" },
    pacingProfile: { type: "string" },
    visualWorld: { type: "string" },
    storyEngine: {
      type: "object",
      required: ["conflict", "stakes", "payoff"],
      properties: {
        conflict: { type: "string" },
        stakes: { type: "string" },
        payoff: { type: "string" }
      }
    },
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
    }
  }
} satisfies Record<string, unknown>;

const ANALYST_SYSTEM_PROMPT =
  "You are CineJelly's Creative Brief Analyst. Read the user brief and any product/reference facts and decide the creative intent BEFORE any script is written. Return JSON only for the CreativeIntent schema. Choose ONE register: professional_cinematic (premium, filmic, motivated lighting, deliberate camera) or natural_phone_kol (a real person filmed this in one casual take on a phone — handheld sway, auto-exposure, no studio polish, never AI-looking). Write styleDna as short concrete camera/lighting/palette/motion/performance/audio direction specific to THIS brief — physical and camera-real, never marketing adjectives or booster words (no 8K, masterpiece, hyper-detailed); this replaces any fixed template. Fill storyEngine with the REAL conflict, what is at stake for the person on screen, and the payoff that resolves it, so the video holds attention. emotionArc is the whole-video feeling start -> turn -> end. Set language to the language the on-screen people SPEAK (the brief's language, e.g. 'vi' for Vietnamese); all visual direction stays English regardless. niche and genre are free text — be specific, not categorical.";

export { normalizeSpokenLanguageCode };

interface CreativeIntentJson {
  readonly register?: unknown;
  readonly genre?: unknown;
  readonly niche?: unknown;
  readonly audience?: unknown;
  readonly language?: unknown;
  readonly tone?: unknown;
  readonly emotionArc?: unknown;
  readonly pacingProfile?: unknown;
  readonly visualWorld?: unknown;
  readonly storyEngine?: unknown;
  readonly styleDna?: unknown;
}

export class CreativeBriefAnalyst {
  private readonly llmProvider: LlmProvider;
  private readonly modelId: string;

  public constructor(llmProvider: LlmProvider, modelId: string) {
    this.llmProvider = llmProvider;
    this.modelId = modelId;
  }

  public async analyze(intake: IntakeResult, signal?: AbortSignal): Promise<CreativeIntent> {
    try {
      const response = await this.llmProvider.structured<CreativeIntentJson, typeof CREATIVE_INTENT_SCHEMA>(
        {
          modelId: this.modelId,
          instruction: ANALYST_SYSTEM_PROMPT,
          schema: CREATIVE_INTENT_SCHEMA,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                userInput: intake.userInput,
                settings: intake.settings,
                references: intake.references.slice(0, 24).map((reference) => ({ role: reference.role, label: reference.label })),
                // What the uploaded assets ACTUALLY look like (vision pass) — ground palette/style/
                // visual-world in the real product/face, not just its label (#1 upgrade).
                ...(intake.referenceVisualDescriptors && intake.referenceVisualDescriptors.length > 0
                  ? { referenceVisuals: intake.referenceVisualDescriptors.slice(0, 8) }
                  : {}),
                ...(intake.metadata?.niche ? { nicheHint: intake.metadata.niche } : {}),
                ...(intake.metadata?.shortViralNiche ? { nicheHint: intake.metadata.shortViralNiche } : {}),
                ...(intake.metadata?.shortViralCreativeMode ? { creativeModeHint: intake.metadata.shortViralCreativeMode } : {})
              })
            }
          ],
          metadata: {
            ...(intake.metadata ?? {}),
            projectId: intake.projectId,
            graphNodeId: "creative_intent"
          }
        },
        signal
      );
      return this.coerce(response.value, intake);
    } catch {
      // Fail-open: deep understanding is an enhancer, never a blocker.
      return this.fallback(intake);
    }
  }

  private coerce(value: CreativeIntentJson, intake: IntakeResult): CreativeIntent {
    const fallback = this.fallback(intake);
    const text = (candidate: unknown, orElse: string): string =>
      typeof candidate === "string" && candidate.trim() ? candidate.trim() : orElse;
    // The customer's explicit "Phong cách" pick OUTRANKS the LLM's authored register (cross-audit #1).
    const register: StyleRegister = explicitStyleTagRegister(intake.userInput)
      ?? (isStyleRegister(value.register) ? value.register : fallback.register);
    const engine = value.storyEngine && typeof value.storyEngine === "object" && !Array.isArray(value.storyEngine)
      ? (value.storyEngine as Record<string, unknown>)
      : {};
    const styleDna = this.coerceStyleDna(value.styleDna, register);
    return {
      schemaVersion: "cinejelly.creative-intent.v1",
      register,
      genre: text(value.genre, fallback.genre),
      niche: text(value.niche, fallback.niche),
      audience: text(value.audience, fallback.audience),
      // Normalized to a short code ("vi", "es") so the talking-shot TTS stage can consume it as a
      // languageCode directly (audit: analyst language was orphaned and TTS fell back to a
      // Vietnamese-only diacritic regex that mis-tagged Spanish/French as "vi").
      language: normalizeSpokenLanguageCode(text(value.language, fallback.language)) ?? fallback.language,
      tone: text(value.tone, fallback.tone),
      emotionArc: text(value.emotionArc, fallback.emotionArc),
      pacingProfile: text(value.pacingProfile, fallback.pacingProfile),
      visualWorld: text(value.visualWorld, fallback.visualWorld),
      storyEngine: {
        conflict: text(engine.conflict, fallback.storyEngine.conflict),
        stakes: text(engine.stakes, fallback.storyEngine.stakes),
        payoff: text(engine.payoff, fallback.storyEngine.payoff)
      },
      ...(styleDna ? { styleDna } : {})
    };
  }

  private coerceStyleDna(value: unknown, register: StyleRegister): StyleDna | undefined {
    const payload = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const text = (key: string): string | undefined =>
      typeof payload[key] === "string" && (payload[key] as string).trim() ? (payload[key] as string).trim() : undefined;
    const list = (key: string): readonly string[] | undefined => {
      const raw = payload[key];
      if (!Array.isArray(raw)) {
        return undefined;
      }
      const cleaned = raw
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 8);
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

  /** Deterministic backfill from existing intake signals — graceful degradation to today's behavior. */
  private fallback(intake: IntakeResult): CreativeIntent {
    const creativeMode =
      typeof intake.metadata?.shortViralCreativeMode === "string" ? intake.metadata.shortViralCreativeMode
        : typeof intake.metadata?.creativeMode === "string" ? intake.metadata.creativeMode : undefined;
    const niche =
      typeof intake.metadata?.shortViralNiche === "string" ? intake.metadata.shortViralNiche
        : typeof intake.metadata?.niche === "string" ? intake.metadata.niche : "general commercial video";
    const register = registerForCreativeMode(creativeMode) ?? "natural_phone_kol";
    const language = containsVietnameseDiacritics(intake.userInput) ? "vi" : "en";
    return {
      schemaVersion: "cinejelly.creative-intent.v1",
      register,
      genre: creativeMode ?? "short-form commercial video",
      niche,
      audience: "the platform's native audience for this niche",
      language,
      tone: "warm, credible, human",
      emotionArc: "curiosity -> engagement -> satisfied resolve",
      pacingProfile: register === "natural_phone_kol" ? "fast TikTok jump-cut rhythm" : "measured cinematic build",
      visualWorld: "the everyday real-world setting implied by the brief",
      storyEngine: {
        conflict: "the everyday friction the brief implies",
        stakes: "the on-screen person's immediate comfort or credibility",
        payoff: "the visible resolution the product or story delivers"
      }
    };
  }
}
