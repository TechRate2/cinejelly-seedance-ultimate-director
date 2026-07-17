/**
 * Redub Executor — the missing second half of the dub/subtitle pipeline.
 *
 * VideoRedubPlanner already transcribes, translates, and plans one TTS narration intent per
 * utterance (thuyết minh / lồng tiếng, review-film style). This executor SPEAKS those intents
 * through the speech provider (ElevenLabs via Atlas — strong Vietnamese) and mixes the narration
 * over the source video with the existing AudioMixEngine:
 *   - duck_under_dub -> keep the original audio low under the narration (review-film feel)
 *   - replace        -> drop the original audio entirely (full dub)
 *
 * Accuracy policy is ALL-OR-NOTHING: a dub with silent holes is a broken deliverable, so any
 * failed segment fails the whole execution (the caller's refund policy then applies).
 */

import type { VideoRedubPlan } from "./video-redub-planner.js";
import type { AudioMixTrack } from "../types/audio.js";
import type { SpeechSynthesisProvider } from "../providers/contracts.js";
import { AudioMixEngine } from "./audio-mix-engine.js";

/** Original-audio bed level under the narration for duck_under_dub (review-film convention). */
export const DUB_ORIGINAL_BED_VOLUME = 0.2;

export interface RedubExecutionInput {
  readonly plan: VideoRedubPlan;
  /** Local source video path (already confined to the output root by the caller). */
  readonly sourceVideoPath: string;
  readonly workDirectory: string;
  readonly outputVideoPath: string;
  readonly speechProvider: SpeechSynthesisProvider;
  readonly ttsModelId: string;
  readonly ttsVoice?: string;
  readonly audioMixEngine?: AudioMixEngine;
  readonly signal?: AbortSignal;
}

export interface RedubExecutionResult {
  readonly outputPath: string;
  readonly narrationTrackCount: number;
  readonly originalAudioTreatment: "duck_under_dub" | "replace";
  readonly mixMode: "mix" | "replace";
}

export class RedubExecutor {
  public async execute(input: RedubExecutionInput): Promise<RedubExecutionResult> {
    const intents = input.plan.ttsIntents.filter((intent) => intent.kind === "tts_narration");
    if (intents.length === 0) {
      throw new Error("Redub plan has no narration segments to synthesize.");
    }

    const tracks: AudioMixTrack[] = [];
    const failedIntentIds: string[] = [];
    for (const intent of intents) {
      try {
        const speech = await input.speechProvider.synthesizeSpeech(
          {
            provider: "atlascloud",
            modelId: input.ttsModelId,
            text: intent.prompt,
            ...(input.ttsVoice ? { voice: input.ttsVoice } : {}),
            languageCode: intent.language ?? input.plan.dubLanguage,
            metadata: {
              projectId: input.plan.projectId,
              redubIntentId: intent.intentId,
              redub: "true"
            }
          },
          input.signal
        );
        const audioUrl = speech.status === "succeeded"
          ? speech.outputUrls.find((url) => /^https:\/\//.test(url))
          : undefined;
        if (!audioUrl) {
          failedIntentIds.push(intent.intentId);
          continue;
        }
        tracks.push({
          trackId: intent.intentId,
          sourceUrlOrPath: audioUrl,
          role: "narration",
          volume: intent.volume ?? 1,
          ...(intent.startSecond !== undefined ? { startSeconds: intent.startSecond } : {})
        });
      } catch (error) {
        if (input.signal?.aborted) {
          throw error;
        }
        failedIntentIds.push(intent.intentId);
      }
    }
    if (failedIntentIds.length > 0) {
      throw new Error(
        `Redub voice synthesis failed for ${failedIntentIds.length}/${intents.length} segment(s) (${failedIntentIds.slice(0, 5).join(", ")}); a dub with silent holes is not deliverable.`
      );
    }

    const treatment = input.plan.originalAudioTreatment;
    const mixMode: "mix" | "replace" = treatment === "replace" ? "replace" : "mix";
    const mixEngine = input.audioMixEngine ?? new AudioMixEngine({});
    const mixed = await mixEngine.mix(
      {
        projectId: input.plan.projectId,
        inputVideoPath: input.sourceVideoPath,
        outputVideoPath: input.outputVideoPath,
        workDirectory: input.workDirectory,
        tracks,
        options: {
          enabled: true,
          mode: mixMode,
          originalVolume: treatment === "replace" ? 0 : DUB_ORIGINAL_BED_VOLUME,
          outputBitrate: "192k"
        },
        includeOriginalAudio: treatment !== "replace"
      },
      input.signal
    );

    return {
      outputPath: mixed.outputPath,
      narrationTrackCount: tracks.length,
      originalAudioTreatment: treatment,
      mixMode
    };
  }
}
