/**
 * Multi-language subtitle translation — Translate → Reflect → Adapt.
 *
 * Distilled from the leading 2026 open-source subtitle pipelines: instead of one raw
 * machine-translation pass, the LLM performs three steps in a single structured call —
 * (1) translate each cue faithfully, (2) reflect on context, terminology consistency, and
 * register across the whole cue list, (3) adapt each line to broadcast subtitle limits
 * (single line, character-per-second cap, natural phrasing in the target language, keep
 * numbers/brand names intact). Timing is never touched: the source cue timing IS the
 * output timing, so translated tracks stay perfectly synced. For dubbing, a stricter
 * duration-fit mode also shortens lines to fit the spoken slot.
 *
 * Deterministic scaffolding + provider-injected LLM: fully no-spend testable with a fake
 * provider. Original implementation; methodology attribution in docs/CREDITS.md.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { CaptionCue } from "../types/caption.js";

export interface SubtitleTranslationInput {
  readonly cues: readonly CaptionCue[];
  /** Source language hint (BCP-47-ish, e.g. "zh", "en"); "auto" lets the LLM infer. */
  readonly sourceLanguage?: string;
  /** Target languages, e.g. ["vi", "en", "ja"]. */
  readonly targetLanguages: readonly string[];
  readonly modelId: string;
  /** "subtitle" keeps reading-speed limits; "dubbing" additionally fits spoken duration. */
  readonly mode?: "subtitle" | "dubbing";
  /** Optional domain glossary the reflection step must keep consistent. */
  readonly glossary?: Readonly<Record<string, string>>;
}

export interface TranslatedSubtitleTrack {
  readonly language: string;
  readonly cues: readonly CaptionCue[];
}

const MAX_CUES_PER_CALL = 80;
const MAX_LINE_CHARACTERS = 42;
/** Broadcast-standard comfortable reading speed. */
const MAX_CHARACTERS_PER_SECOND = 17;

const TRANSLATION_SCHEMA = {
  type: "object",
  required: ["tracks"],
  properties: {
    tracks: {
      type: "array",
      items: {
        type: "object",
        required: ["language", "lines"],
        properties: {
          language: { type: "string" },
          lines: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

interface TranslationResponse {
  readonly tracks: readonly { readonly language: string; readonly lines: readonly string[] }[];
}

export class SubtitleTranslator {
  private readonly llmProvider: LlmProvider;

  public constructor(llmProvider: LlmProvider) {
    this.llmProvider = llmProvider;
  }

  public async translate(input: SubtitleTranslationInput, signal?: AbortSignal): Promise<readonly TranslatedSubtitleTrack[]> {
    if (input.cues.length === 0 || input.targetLanguages.length === 0) {
      return [];
    }
    const targetLanguages = [...new Set(input.targetLanguages.map((language) => language.trim().toLowerCase()).filter(Boolean))];
    const batches = chunk(input.cues, MAX_CUES_PER_CALL);
    const trackCues = new Map<string, CaptionCue[]>(targetLanguages.map((language) => [language, []]));

    for (const batch of batches) {
      const response = await this.llmProvider.structured<TranslationResponse, typeof TRANSLATION_SCHEMA>(
        {
          modelId: input.modelId,
          instruction: this.instruction(input, targetLanguages, batch),
          schema: TRANSLATION_SCHEMA,
          messages: [
            {
              role: "system",
              content:
                "You are a professional subtitle localization team. Return JSON only. For each requested target language return exactly one line per numbered source cue, same order, same count. Never merge, split, or reorder cues."
            },
            {
              role: "user",
              content: JSON.stringify({
                sourceLanguage: input.sourceLanguage ?? "auto",
                targetLanguages,
                ...(input.glossary ? { glossary: input.glossary } : {}),
                cues: batch.map((cue, index) => ({
                  index,
                  seconds: round1(cue.endSecond - cue.startSecond),
                  text: cue.text
                }))
              })
            }
          ],
          metadata: { subtitleTranslation: true }
        },
        signal
      );
      this.mergeBatch(trackCues, targetLanguages, batch, response.value);
    }

    return targetLanguages.map((language) => ({
      language,
      cues: trackCues.get(language) ?? []
    }));
  }

  private instruction(
    input: SubtitleTranslationInput,
    targetLanguages: readonly string[],
    batch: readonly CaptionCue[]
  ): string {
    const dubbing = input.mode === "dubbing";
    return [
      `Localize ${batch.length} subtitle cues into: ${targetLanguages.join(", ")}.`,
      "Work in three internal steps before answering:",
      "STEP 1 TRANSLATE: faithful translation of each cue.",
      "STEP 2 REFLECT: re-read the whole list as one script — fix terminology consistency, pronouns, register, idioms, and any cue that reads machine-translated; keep numbers, prices, units, product and brand names exactly as in the source.",
      dubbing
        ? `STEP 3 ADAPT FOR DUBBING: each line must be comfortably SPEAKABLE within its cue's seconds — prefer shorter natural phrasing, contractions, and dropped filler; never change meaning.`
        : `STEP 3 ADAPT FOR SUBTITLES: single line per cue, at most ${MAX_LINE_CHARACTERS} characters, readable within the cue's seconds (~${MAX_CHARACTERS_PER_SECOND} chars/second); compress naturally rather than truncate.`,
      "Return one translated line per cue per language, same order and count as the input."
    ].join(" ");
  }

  private mergeBatch(
    trackCues: Map<string, CaptionCue[]>,
    targetLanguages: readonly string[],
    batch: readonly CaptionCue[],
    response: TranslationResponse
  ): void {
    for (const language of targetLanguages) {
      const track = response.tracks.find((candidate) => candidate.language.trim().toLowerCase() === language);
      const lines = track?.lines ?? [];
      const merged = trackCues.get(language) as CaptionCue[];
      batch.forEach((cue, index) => {
        const translated = typeof lines[index] === "string" ? lines[index].trim() : "";
        merged.push({
          ...cue,
          // Fail-safe: an empty/missing translation falls back to the source line so a
          // track can never silently lose a cue or drift out of sync.
          text: translated || cue.text
        });
      });
    }
  }
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size) as T[]);
  }
  return chunks;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
