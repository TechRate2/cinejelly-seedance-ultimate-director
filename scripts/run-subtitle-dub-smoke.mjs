#!/usr/bin/env node
/**
 * No-spend smoke for multi-language subtitles + video re-dub planning.
 * Fake providers prove: the Translate-Reflect-Adapt translator keeps cue count/order/
 * timing per language and falls back safely on missing lines; the re-dub planner runs the
 * full transcribe -> dubbing-fit translate -> TTS-intent -> mix-treatment pipeline, merges
 * segments into natural utterances, produces subtitle tracks for every requested language,
 * and fails clearly when speech-to-text is not configured.
 */

import { SubtitleTranslator, captionCuesToSrt } from "../dist/core/subtitle-translator.js";
import { VideoRedubPlanner } from "../dist/core/video-redub-planner.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// ---- Fake LLM: translates by tagging lines per language (deterministic). ----
const llmCalls = [];
const fakeLlm = {
  name: "fake-llm",
  async structured(request) {
    llmCalls.push(request);
    const payload = JSON.parse(request.messages[1].content);
    return {
      value: {
        tracks: payload.targetLanguages.map((language) => ({
          language,
          // Simulate one missing line (last cue of "ja") to prove fail-safe fallback.
          lines: payload.cues.map((cue, index) =>
            language === "ja" && index === payload.cues.length - 1 ? "" : `[${language}] ${cue.text}`
          )
        }))
      }
    };
  }
};

const cues = [
  { startSecond: 0, endSecond: 2.4, text: "大家好，今天开箱这款相机" },
  { startSecond: 2.5, endSecond: 5.1, text: "画质非常惊艳" },
  { startSecond: 6.2, endSecond: 9.0, text: "价格只要299美元" }
];

const translator = new SubtitleTranslator(fakeLlm);
const tracks = await translator.translate({
  cues,
  sourceLanguage: "zh",
  targetLanguages: ["vi", "en", "ja"],
  modelId: "fake-llm-model",
  mode: "subtitle"
});
check("translator_one_track_per_language", tracks.length === 3 && tracks.map((t) => t.language).join(",") === "vi,en,ja");
check("translator_keeps_cue_count", tracks.every((track) => track.cues.length === cues.length));
check(
  "translator_keeps_timing_exactly",
  tracks.every((track) => track.cues.every((cue, index) => cue.startSecond === cues[index].startSecond && cue.endSecond === cues[index].endSecond))
);
check("translator_translates_lines", tracks[0].cues[0].text.startsWith("[vi]"));
check("translator_missing_line_falls_back_to_source", tracks[2].cues[2].text === cues[2].text);
check("translator_instruction_has_three_steps", /STEP 1 TRANSLATE/.test(llmCalls[0].instruction) && /STEP 2 REFLECT/.test(llmCalls[0].instruction) && /STEP 3 ADAPT/.test(llmCalls[0].instruction));
check("translator_empty_inputs_safe", (await translator.translate({ cues: [], targetLanguages: ["vi"], modelId: "m" })).length === 0);

// ---- Silent-fallback telemetry + base-language matching (repo-fidelity gap #8). ----
// Fallbacks are now COUNTED per track (ja had one missing line above), not silent.
check("translator_counts_fallbacks", tracks[2].fallbackCueCount === 1 && tracks[0].fallbackCueCount === 0, JSON.stringify(tracks.map((t) => [t.language, t.fallbackCueCount])));
// Over-limit cues (42 chars / ~17 cps) are counted, never mutated.
const longCueTracks = await translator.translate({
  cues: [{ startSecond: 0, endSecond: 1, text: "câu này cực kỳ dài và chắc chắn vượt quá bốn mươi hai ký tự cho phép của phụ đề chuẩn" }],
  targetLanguages: ["vi"], modelId: "m", mode: "subtitle"
});
check("translator_counts_over_limit_cues", longCueTracks[0].overLimitCueCount === 1 && longCueTracks[0].cues[0].text.length > 42, `${longCueTracks[0].overLimitCueCount}`);
// A region-variant answer ("vi-VN" for requested "vi") must still match — the old exact-match lookup
// silently dropped the WHOLE translated track and shipped source-language text.
const regionLlm = {
  async structured(request) {
    const payload = JSON.parse(request.messages[1].content);
    return { value: { tracks: [{ language: "vi-VN", lines: payload.cues.map((cue) => `[vi] ${cue.text}`) }] } };
  }
};
const regionTracks = await new SubtitleTranslator(regionLlm).translate({ cues, targetLanguages: ["vi"], modelId: "m" });
check("translator_matches_region_variant_language", regionTracks[0].cues[0].text.startsWith("[vi]") && regionTracks[0].fallbackCueCount === 0, JSON.stringify(regionTracks[0].cues[0]));

// ---- Fake speech provider for the re-dub planner. ----
const fakeSpeech = {
  name: "fake-speech",
  supportsSpeechToText: () => true,
  async transcribeAudio() {
    return {
      provider: "atlascloud",
      modelId: "fake-stt",
      language: "zh",
      text: "…",
      segments: [
        { startSecond: 0, endSecond: 2.4, text: "大家好，今天开箱这款相机" },
        { startSecond: 2.5, endSecond: 5.1, text: "画质非常惊艳" }, // gap 0.1s -> merges
        { startSecond: 9.0, endSecond: 11.5, text: "价格只要299美元" }, // gap 3.9s -> new utterance
        { startSecond: 12.0, endSecond: 12.05, text: "  " } // blank -> dropped
      ],
      raw: {}
    };
  }
};

const planner = new VideoRedubPlanner({ speechProvider: fakeSpeech, llmProvider: fakeLlm });
const plan = await planner.plan({
  projectId: "proj_redub",
  audioUri: "upload://up_0123456789abcdef.mp4",
  sourceLanguage: "zh",
  dubLanguage: "vi",
  subtitleLanguages: ["en", "vi"],
  voiceStyle: "giọng nữ review ấm",
  speechModelId: "fake-stt",
  llmModelId: "fake-llm-model"
});
check("redub_detects_source_language", plan.sourceLanguage === "zh");
check("redub_source_cues_drop_blanks", plan.sourceCues.length === 3);
check("redub_merges_close_segments", plan.summary.segmentCount === 2, `segments=${plan.summary.segmentCount}`);
check("redub_tts_intents_match_utterances", plan.ttsIntents.length === 2 && plan.ttsIntents.every((intent) => intent.kind === "tts_narration"));
check("redub_tts_carries_language_and_voice", plan.ttsIntents[0].language === "vi" && plan.ttsIntents[0].voiceStyle === "giọng nữ review ấm");
check("redub_tts_timing_covers_speech", plan.ttsIntents[0].startSecond === 0 && plan.ttsIntents[1].startSecond === 9);
check("redub_subtitle_tracks_dub_first_dedup", plan.subtitleTracks.length === 2 && plan.subtitleTracks[0].language === "vi" && plan.subtitleTracks[1].language === "en");
check("redub_dub_cues_translated", plan.dubCues[0].text.startsWith("[vi]"));
check("redub_default_keeps_original_bed", plan.originalAudioTreatment === "duck_under_dub");

// ---- .srt rendering: standard numbering, comma-millisecond timestamps, blank-line cues. ----
const srt = captionCuesToSrt([
  { startSecond: 0, endSecond: 2.4, text: "Xin chào" },
  { startSecond: 61.25, endSecond: 3661.999, text: "Dòng hai" }
]);
check(
  "srt_standard_format",
  srt.startsWith("1\n00:00:00,000 --> 00:00:02,400\nXin chào\n\n2\n") && srt.includes("00:01:01,250 --> 01:01:01,999\nDòng hai"),
  JSON.stringify(srt.slice(0, 60))
);
check("srt_empty_input_empty_output", captionCuesToSrt([]) === "");

// STT not configured -> clear error.
const noSttPlanner = new VideoRedubPlanner({
  speechProvider: { name: "none", supportsSpeechToText: () => false, transcribeAudio: async () => { throw new Error("x"); } },
  llmProvider: fakeLlm
});
let sttError = "";
try {
  await noSttPlanner.plan({ projectId: "p", audioUri: "x", dubLanguage: "vi", speechModelId: "m", llmModelId: "m" });
} catch (error) {
  sttError = String(error.message);
}
check("redub_clear_error_without_stt", /ATLASCLOUD_SPEECH_MODEL/.test(sttError), sttError.slice(0, 80));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.subtitle-dub-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing the subtitle translator, re-dub planner, or their provider contracts.",
    "Live quality (real ASR/TTS voices) is confirmed on a real paid run with the speech/audio models configured."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
