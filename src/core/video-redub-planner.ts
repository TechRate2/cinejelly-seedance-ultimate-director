/**
 * Video re-dub / re-narration planner — the full translate-a-video pipeline.
 *
 * Distilled from the leading 2026 open-source dubbing pipelines (transcribe -> translate ->
 * synthesize -> sync): take an existing video (e.g. Chinese) and produce a Vietnamese (or
 * any language) version — transcription via the configured speech model, dubbing-aware
 * translation via the subtitle translator (lines shortened to fit each spoken slot), one
 * TTS narration intent per merged speech segment via the existing generated-audio pipeline,
 * and an audio-mix plan that lowers or removes the original voice while the new narration
 * plays. Multi-language subtitle tracks ride the same translated cues for free.
 *
 * This module PLANS deterministically (no spend); execution reuses the providers already
 * in the project (SpeechProvider.transcribeAudio, SubtitleTranslator, AudioProvider
 * tts_narration intents, audio-mix-engine). Fully no-spend testable with fake providers.
 * Methodology attribution in docs/CREDITS.md.
 */

import type { LlmProvider, SpeechProvider } from "../providers/contracts.js";
import type { CaptionCue } from "../types/caption.js";
import type { GeneratedAudioIntent } from "../types/audio.js";
import { SubtitleTranslator, type TranslatedSubtitleTrack } from "./subtitle-translator.js";

export interface VideoRedubRequest {
  readonly projectId: string;
  /** Audio (or video) source to transcribe — local path or URL the speech model accepts. */
  readonly audioUri: string;
  /** Source language hint; "auto" lets the ASR/LLM infer. */
  readonly sourceLanguage?: string;
  /** The dub target language (e.g. "vi"). */
  readonly dubLanguage: string;
  /** Extra subtitle-only languages (the dub language always gets a subtitle track too). */
  readonly subtitleLanguages?: readonly string[];
  /** Narration voice style passed to the TTS model (e.g. "warm female review voice"). */
  readonly voiceStyle?: string;
  /** Keep the original bed (music/ambience) under the new voice, or replace audio fully. */
  readonly originalAudioTreatment?: "duck_under_dub" | "replace";
  readonly speechModelId: string;
  readonly llmModelId: string;
}

export interface VideoRedubPlan {
  readonly projectId: string;
  readonly sourceLanguage: string;
  readonly dubLanguage: string;
  /** Timed transcription of the original voice. */
  readonly sourceCues: readonly CaptionCue[];
  /** Dubbing-adapted translated cues driving both TTS and the dub-language subtitles. */
  readonly dubCues: readonly CaptionCue[];
  /** All subtitle tracks (dub language first, then extras). */
  readonly subtitleTracks: readonly TranslatedSubtitleTrack[];
  /** One TTS intent per merged speech segment, ready for the generated-audio pipeline. */
  readonly ttsIntents: readonly GeneratedAudioIntent[];
  /** How the mixer should treat the original track. */
  readonly originalAudioTreatment: "duck_under_dub" | "replace";
  readonly summary: {
    readonly segmentCount: number;
    readonly totalSpeechSeconds: number;
    readonly subtitleLanguages: readonly string[];
  };
}

/** Segments closer together than this merge into one TTS utterance for natural delivery. */
const SEGMENT_MERGE_GAP_SECONDS = 0.4;
/** TTS utterances longer than this split at cue boundaries to stay within model limits. */
const MAX_UTTERANCE_SECONDS = 25;

export class VideoRedubPlanner {
  private readonly speechProvider: SpeechProvider;
  private readonly translator: SubtitleTranslator;

  public constructor(input: { readonly speechProvider: SpeechProvider; readonly llmProvider: LlmProvider }) {
    this.speechProvider = input.speechProvider;
    this.translator = new SubtitleTranslator(input.llmProvider);
  }

  public async plan(request: VideoRedubRequest, signal?: AbortSignal): Promise<VideoRedubPlan> {
    if (!request.dubLanguage?.trim()) {
      throw new Error("dubLanguage is required (e.g. \"vi\").");
    }
    if (!this.speechProvider.supportsSpeechToText()) {
      throw new Error("Speech-to-text model is not configured (ATLASCLOUD_SPEECH_MODEL); transcription is required for re-dubbing.");
    }

    // 1. Transcribe the original voice with timing.
    const transcription = await this.speechProvider.transcribeAudio(
      {
        provider: "atlascloud",
        modelId: request.speechModelId,
        audioUri: request.audioUri,
        ...(request.sourceLanguage && request.sourceLanguage !== "auto" ? { language: request.sourceLanguage } : {}),
        metadata: { projectId: request.projectId, videoRedub: true }
      },
      signal
    );
    const sourceCues: CaptionCue[] = transcription.segments
      .filter((segment) => segment.text.trim().length > 0)
      .map((segment) => ({
        startSecond: round2(segment.startSecond),
        endSecond: round2(Math.max(segment.endSecond, segment.startSecond + 0.2)),
        text: segment.text.trim()
      }));
    if (sourceCues.length === 0) {
      throw new Error("Transcription returned no speech segments; nothing to re-dub.");
    }

    // 2. Dubbing-aware translation (duration-fit) + extra subtitle languages in one pass.
    const dubLanguage = request.dubLanguage.trim().toLowerCase();
    const extraLanguages = (request.subtitleLanguages ?? [])
      .map((language) => language.trim().toLowerCase())
      .filter((language) => language && language !== dubLanguage);
    const dubTracks = await this.translator.translate(
      {
        cues: sourceCues,
        ...(request.sourceLanguage ? { sourceLanguage: request.sourceLanguage } : {}),
        targetLanguages: [dubLanguage],
        modelId: request.llmModelId,
        mode: "dubbing"
      },
      signal
    );
    const dubCues = dubTracks[0]?.cues ?? [];
    const subtitleOnlyTracks = extraLanguages.length
      ? await this.translator.translate(
          {
            cues: sourceCues,
            ...(request.sourceLanguage ? { sourceLanguage: request.sourceLanguage } : {}),
            targetLanguages: extraLanguages,
            modelId: request.llmModelId,
            mode: "subtitle"
          },
          signal
        )
      : [];

    // 3. Merge cues into natural utterances and emit one TTS intent per utterance.
    const utterances = mergeIntoUtterances(dubCues);
    const ttsIntents: GeneratedAudioIntent[] = utterances.map((utterance, index) => ({
      intentId: `redub_tts_${index + 1}`,
      kind: "tts_narration",
      prompt: utterance.text,
      startSecond: utterance.startSecond,
      endSecond: utterance.endSecond,
      durationSeconds: round2(utterance.endSecond - utterance.startSecond),
      language: dubLanguage,
      ...(request.voiceStyle?.trim() ? { voiceStyle: request.voiceStyle.trim() } : {})
    }));

    return {
      projectId: request.projectId,
      sourceLanguage: transcription.language ?? request.sourceLanguage ?? "auto",
      dubLanguage,
      sourceCues,
      dubCues,
      subtitleTracks: [{ language: dubLanguage, cues: dubCues }, ...subtitleOnlyTracks],
      ttsIntents,
      originalAudioTreatment: request.originalAudioTreatment ?? "duck_under_dub",
      summary: {
        segmentCount: utterances.length,
        totalSpeechSeconds: round2(utterances.reduce((sum, utterance) => sum + (utterance.endSecond - utterance.startSecond), 0)),
        subtitleLanguages: [dubLanguage, ...extraLanguages]
      }
    };
  }
}

interface Utterance {
  readonly startSecond: number;
  readonly endSecond: number;
  readonly text: string;
}

function mergeIntoUtterances(cues: readonly CaptionCue[]): readonly Utterance[] {
  const utterances: Utterance[] = [];
  for (const cue of cues) {
    const last = utterances[utterances.length - 1];
    const gap = last ? cue.startSecond - last.endSecond : Number.POSITIVE_INFINITY;
    const mergedLength = last ? cue.endSecond - last.startSecond : 0;
    if (last && gap <= SEGMENT_MERGE_GAP_SECONDS && mergedLength <= MAX_UTTERANCE_SECONDS) {
      utterances[utterances.length - 1] = {
        startSecond: last.startSecond,
        endSecond: cue.endSecond,
        text: `${last.text} ${cue.text}`.trim()
      };
    } else {
      utterances.push({ startSecond: cue.startSecond, endSecond: cue.endSecond, text: cue.text });
    }
  }
  return utterances;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
