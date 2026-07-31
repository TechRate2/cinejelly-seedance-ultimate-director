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
import { planDubDurationFit, type DubFitPlan } from "./dub-duration-fit.js";

/** The one slice of MediaInspector the duration-fit needs (injectable for no-network tests). */
export interface RedubMediaProber {
  probe(path: string, signal?: AbortSignal): Promise<{ readonly durationSeconds?: number }>;
}

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
  /**
   * When provided, enables DURATION-FIT: each synthesized segment is downloaded, measured with
   * ffprobe, and sped up (atempo, capped at a natural ratio) when it would overlap the next segment
   * — the enforcement layer the dubbing methodology requires (Vietnamese renderings of dense source
   * speech routinely run long). Omitted = legacy behavior (no fit), so existing callers/tests are
   * unchanged; the server passes a real MediaInspector.
   */
  readonly mediaProber?: RedubMediaProber;
  readonly signal?: AbortSignal;
}

export interface RedubExecutionResult {
  readonly outputPath: string;
  readonly narrationTrackCount: number;
  readonly originalAudioTreatment: "duck_under_dub" | "replace";
  readonly mixMode: "mix" | "replace";
  /** Present when duration-fit ran (mediaProber supplied): what was measured/sped/warned. */
  readonly durationFit?: DubFitPlan;
}

export class RedubExecutor {
  public async execute(input: RedubExecutionInput): Promise<RedubExecutionResult> {
    const intents = input.plan.ttsIntents.filter((intent) => intent.kind === "tts_narration");
    if (intents.length === 0) {
      throw new Error("Redub plan has no narration segments to synthesize.");
    }

    // FAIL-FAST all-or-nothing: the dub is worthless with even one silent hole, so the first
    // failed segment aborts the whole execution IMMEDIATELY — buying TTS for the remaining
    // segments after a failure would be pure wasted provider spend (cross-audit).
    const tracks: AudioMixTrack[] = [];
    for (const intent of intents) {
      let audioUrl: string | undefined;
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
        audioUrl = speech.status === "succeeded"
          ? speech.outputUrls.find((url) => /^https:\/\//.test(url))
          : undefined;
      } catch (error) {
        if (input.signal?.aborted) {
          throw error;
        }
        throw new Error(
          `Redub voice synthesis failed at segment ${intent.intentId} (${tracks.length}/${intents.length} done); a dub with silent holes is not deliverable. ${String(error)}`
        );
      }
      if (!audioUrl) {
        throw new Error(
          `Redub voice synthesis returned no audio for segment ${intent.intentId} (${tracks.length}/${intents.length} done); a dub with silent holes is not deliverable.`
        );
      }
      tracks.push({
        trackId: intent.intentId,
        sourceUrlOrPath: audioUrl,
        role: "narration",
        volume: intent.volume ?? 1,
        ...(intent.startSecond !== undefined ? { startSeconds: intent.startSecond } : {})
      });
    }

    // DURATION-FIT (methodology enforcement): download + measure each synthesized segment, then
    // speed up any segment that would overlap its successor. Without this, an overlong Vietnamese
    // rendering of dense source speech plays OVER the next segment (repo-fidelity audit gap #1).
    let durationFit: DubFitPlan | undefined;
    let materializedTrackPaths: readonly string[] | undefined;
    const mixEngine = input.audioMixEngine ?? new AudioMixEngine({});
    if (input.mediaProber) {
      materializedTrackPaths = await mixEngine.materializeTracks(
        input.plan.projectId,
        input.workDirectory,
        tracks,
        input.signal
      );
      const measured = await Promise.all(
        materializedTrackPaths.map((path) => input.mediaProber!.probe(path, input.signal))
      );
      const videoDuration = (await input.mediaProber.probe(input.sourceVideoPath, input.signal)).durationSeconds;
      durationFit = planDubDurationFit({
        segments: tracks.map((track, index) => ({
          intentId: track.trackId,
          ...(track.startSeconds !== undefined ? { startSecond: track.startSeconds } : {}),
          measuredDurationSeconds: measured[index]?.durationSeconds ?? 0
        })),
        ...(videoDuration !== undefined ? { videoDurationSeconds: videoDuration } : {})
      });
      const tempoByIntentId = new Map(durationFit.segments.map((segment) => [segment.intentId, segment.tempo]));
      for (let index = 0; index < tracks.length; index += 1) {
        const tempo = tempoByIntentId.get(tracks[index]!.trackId);
        if (tempo !== undefined && tempo > 1) {
          tracks[index] = { ...tracks[index]!, tempo };
        }
      }
    }

    const treatment = input.plan.originalAudioTreatment;
    const mixMode: "mix" | "replace" = treatment === "replace" ? "replace" : "mix";
    const mixed = await mixEngine.mix(
      {
        projectId: input.plan.projectId,
        inputVideoPath: input.sourceVideoPath,
        outputVideoPath: input.outputVideoPath,
        workDirectory: input.workDirectory,
        tracks,
        ...(materializedTrackPaths ? { materializedTrackPaths } : {}),
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
      mixMode,
      ...(durationFit ? { durationFit } : {})
    };
  }
}
