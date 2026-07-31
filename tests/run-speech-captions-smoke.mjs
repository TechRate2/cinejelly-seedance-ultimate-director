/**
 * No-spend smoke for the subtitle pipeline foundations.
 * Proves: ASR segments normalize into readable, monotonic, non-overlapping cues (merge
 * micro-fragments, split overlong lines with proportional timing, clamp flash-frames);
 * the narration-script path emits perfectly-synced cues with zero transcription spend;
 * cue text cannot inject libass styling; and the speech provider contract gates itself
 * off until a speech model is configured. No network, no provider calls, no spend.
 */

import {
  buildCaptionCuesFromAudioScript,
  buildCaptionCuesFromSegments
} from "../dist/core/subtitle-caption-builder.js";
import { AtlasCloudProvider } from "../dist/providers/atlascloud/atlas-cloud-provider.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// 1. ASR word-dribble merges into readable cues.
const wordDribble = [
  { startSecond: 0.0, endSecond: 0.4, text: "Da" },
  { startSecond: 0.45, endSecond: 0.9, text: "kho" },
  { startSecond: 1.0, endSecond: 1.6, text: "can serum" },
  { startSecond: 5.0, endSecond: 5.6, text: "Ket qua sau 7 ngay" }
];
const mergedCues = buildCaptionCuesFromSegments(wordDribble);
check("micro_fragments_merge", mergedCues.length === 2, `count=${mergedCues.length}`);
check("merged_text_joined", mergedCues[0]?.text === "Da kho can serum");
check("gap_respected_as_new_cue", mergedCues[1]?.text === "Ket qua sau 7 ngay");

// 2. Overlong text splits on word boundaries with proportional, contiguous timing.
const longSegment = [
  {
    startSecond: 0,
    endSecond: 8,
    text: "Serum nay tham nhanh vao da khong gay nhon rit va giup da cang muot ro ret chi sau mot tuan su dung deu dan moi toi"
  }
];
const splitCues = buildCaptionCuesFromSegments(longSegment);
check("long_text_splits", splitCues.length >= 3, `count=${splitCues.length}`);
check("split_chunks_under_limit", splitCues.every((cue) => cue.text.length <= 42));
const contiguous = splitCues.every((cue, index) =>
  index === 0 ? cue.startSecond === 0 : Math.abs(cue.startSecond - splitCues[index - 1].endSecond) < 1e-9
);
check("split_timing_contiguous", contiguous && Math.abs(splitCues[splitCues.length - 1].endSecond - 8) < 1e-9);

// 3. Flash-frames extend to a readable minimum without overlapping the next cue.
const flash = buildCaptionCuesFromSegments([
  { startSecond: 0, endSecond: 0.1, text: "Nhin nay" },
  { startSecond: 2, endSecond: 3, text: "Truoc va sau" }
]);
check("flash_frame_extended", (flash[0]?.endSecond ?? 0) - (flash[0]?.startSecond ?? 0) >= 0.7);
const noOverlap = flash.every((cue, index) => index === 0 || cue.startSecond >= flash[index - 1].endSecond);
check("no_overlap_after_clamping", noOverlap);

// 4. Out-of-order + invalid + brace-injection input is normalized safely.
const messy = buildCaptionCuesFromSegments([
  { startSecond: 4, endSecond: 5, text: "Cau sau" },
  { startSecond: Number.NaN, endSecond: 2, text: "bo qua" },
  { startSecond: 1, endSecond: 0.5, text: "nguoc thoi gian" },
  { startSecond: 0, endSecond: 1, text: "{\\an8}Cau dau{b}" }
]);
check("messy_input_sorted_and_filtered", messy.length === 2 && messy[0].startSecond === 0);
check("libass_braces_stripped", !messy[0].text.includes("{") && !messy[0].text.includes("}"));

// 5. Narration-script path: perfectly-synced cues, zero transcription cost.
const scriptCues = buildCaptionCuesFromAudioScript([
  { startSecond: 0, endSecond: 2.4, spokenLine: "Da kho lam ban mat tu tin?" },
  { startSecond: 2.4, endSecond: 5.2, spokenLine: "Mot giot serum nay se thay doi dieu do." }
]);
check("script_lines_become_cues", scriptCues.length === 2);
check("script_timing_preserved", scriptCues[0]?.startSecond === 0 && Math.abs((scriptCues[1]?.endSecond ?? 0) - 5.2) < 1e-9);

// 6. Empty/silent input yields zero cues (assembly now skips captions instead of crashing).
check("silent_input_zero_cues", buildCaptionCuesFromSegments([]).length === 0);

// 7. Speech provider gates off without a configured model and rejects unsafe URIs.
const provider = new AtlasCloudProvider(
  {
    apiKey: "test_key_not_real",
    apiBaseUrl: "https://api.example.com/v1",
    assetBaseUrl: "https://api.example.com/api/v1",
    models: {
      llmModel: "llm-smoke",
      seedanceStandardModel: "seedance-smoke",
      seedanceFastModel: "seedance-fast-smoke"
    },
    requestTimeoutMs: 1000,
    maxJsonResponseBytes: 1024 * 1024,
    pollingIntervalMs: 10,
    pollingTimeoutMs: 100
  },
  { record: () => {} }
);
check("speech_gated_off_without_model", provider.supportsSpeechToText() === false);
let missingModelRejected = false;
try {
  await provider.transcribeAudio({ provider: "atlascloud", modelId: " ", audioUri: "https://example.com/a.mp3" });
} catch {
  missingModelRejected = true;
}
check("missing_speech_model_rejected", missingModelRejected);
let unsafeUriRejected = false;
try {
  await provider.transcribeAudio({ provider: "atlascloud", modelId: "stt-smoke", audioUri: "http://insecure.example.com/a.mp3" });
} catch {
  unsafeUriRejected = true;
}
check("insecure_audio_uri_rejected", unsafeUriRejected);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.speech-captions-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing subtitle-caption-builder.ts, the SpeechProvider contract, or the Atlas transcription mapping.",
    "Live transcription requires ATLASCLOUD_SPEECH_MODEL (verify the model id in the Atlas catalog) plus explicit operator spend confirmation; narration-script captions stay zero-cost."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
