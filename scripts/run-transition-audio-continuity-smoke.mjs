#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/transition-audio-continuity-smoke-report.json";
const workRoot = resolve(repoRoot, "assets/output_deliverables/business-readiness");
const workDirectory = resolve(workRoot, "transition-audio-continuity-smoke");

const sourcePatternOrigins = [
  "FFmpeg xfade/acrossfade assembly contract",
  "CineJelly Seedance transition bridge prompt contract",
  "CineJelly generated-audio continuity policy"
];

function parseArgs(args) {
  const options = { outputPath: defaultOutput, writeReport: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

const options = parseArgs(process.argv.slice(2));
if (extname(options.outputPath).toLowerCase() !== ".json") {
  throw new Error("--output must point to a JSON file.");
}

assertSafeWorkDirectory(workDirectory);
rmSync(workDirectory, { recursive: true, force: true });
mkdirSync(workDirectory, { recursive: true });

const { TransitionEngine } = await import("../dist/core/transition-engine.js");
const { MediaInspector } = await import("../dist/core/media-inspector.js");
const { readMediaToolCommand } = await import("../dist/utils/media-tools.js");
const { runProcess } = await import("../dist/utils/process.js");

const ffmpeg = readMediaToolCommand("ffmpeg");
const clipWithAudio = resolve(workDirectory, "clip-with-audio.mp4");
const clipWithoutAudio = resolve(workDirectory, "clip-without-audio.mp4");
const outputVideo = resolve(workDirectory, "transition-output.mp4");

await runProcess(ffmpeg, [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=320x180:rate=30:duration=2",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=660:sample_rate=48000:duration=2",
  "-shortest",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  clipWithAudio
]);

await runProcess(ffmpeg, [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=black:size=320x180:rate=30:duration=2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-an",
  clipWithoutAudio
]);

const inspector = new MediaInspector();
const transition = await new TransitionEngine(inspector).assemble({
  inputPaths: [clipWithAudio, clipWithoutAudio],
  outputPath: outputVideo,
  settings: {
    enabled: true,
    kind: "fade",
    durationSeconds: 0.3,
    fps: 30,
    targetHeight: 480,
    targetRatio: "16:9",
    preserveAudio: true
  }
});
const outputMetadata = await inspector.probe(outputVideo);
const audioReport = inspector.inspectAudio(outputMetadata);
const videoStream = outputMetadata.streams.find((stream) => stream.type === "video");

const checks = [
  transition.usedAudioCrossfade
    ? pass("transition_uses_audio_crossfade", "Transition engine preserved audio during xfade assembly.")
    : fail("transition_uses_audio_crossfade", "Expected transition engine to preserve audio when any source clip has audio."),
  transition.audioPreservationMode === "crossfade_with_silence_fill"
    ? pass("missing_clip_audio_filled", "A silent bed was generated for the clip without source audio.")
    : fail("missing_clip_audio_filled", `Expected crossfade_with_silence_fill but got ${transition.audioPreservationMode}.`),
  transition.silentAudioFillCount === 1
    ? pass("silent_fill_count", "Exactly one missing audio segment was filled.")
    : fail("silent_fill_count", `Expected one silent fill but got ${transition.silentAudioFillCount}.`),
  audioReport.hasAudio
    ? pass("output_audio_stream_present", "The assembled transition output keeps an audio stream.")
    : fail("output_audio_stream_present", "The assembled transition output has no audio stream."),
  videoStream?.height === 480
    ? pass("output_canvas_normalized", "The transition output normalized the canvas height.")
    : fail("output_canvas_normalized", `Expected output height 480 but got ${videoStream?.height ?? "missing"}.`)
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.transition-audio-continuity-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: toRepoRelative(options.outputPath),
    syntheticClipCount: 2,
    sourceAudioClipCount: 1,
    silentSourceClipCount: 1,
    transitionKind: transition.settings.kind,
    transitionDurationSeconds: transition.settings.durationSeconds
  },
  transition: {
    transitionCount: transition.transitionCount,
    usedAudioCrossfade: transition.usedAudioCrossfade,
    audioPreservationMode: transition.audioPreservationMode,
    silentAudioFillCount: transition.silentAudioFillCount,
    targetHeight: transition.settings.targetHeight,
    targetRatio: transition.settings.targetRatio
  },
  outputInspection: {
    durationSeconds: outputMetadata.durationSeconds,
    videoStreamCount: outputMetadata.streams.filter((stream) => stream.type === "video").length,
    audioStreamCount: outputMetadata.streams.filter((stream) => stream.type === "audio").length,
    audio: {
      hasAudio: audioReport.hasAudio,
      durationSeconds: audioReport.durationSeconds,
      sampleRate: audioReport.sampleRate,
      channelCount: audioReport.channelCount,
      findingCount: audioReport.findings.length
    }
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendTransitionAudioEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Local synthetic transition audio smoke passed; paid media/manual review remains required before commercial release claims."
      : "Transition audio continuity smoke failed; fix assembly audio preservation before trusting multishot outputs."
  }
};

if (options.writeReport) {
  const outputPath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;

function assertSafeWorkDirectory(path) {
  const normalizedWorkRoot = workRoot.endsWith(sep) ? workRoot : `${workRoot}${sep}`;
  if (!path.startsWith(normalizedWorkRoot)) {
    throw new Error(`Refusing to clear transition smoke work directory outside ${workRoot}.`);
  }
}

function toRepoRelative(path) {
  return resolve(repoRoot, path).replace(`${repoRoot}${sep}`, "").replace(/\\/g, "/");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
