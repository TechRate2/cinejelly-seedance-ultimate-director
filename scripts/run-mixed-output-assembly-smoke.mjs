#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/mixed-output-assembly-smoke-report.json";
const sourcePatternOrigins = [
  "Atlas Cloud Seedance 2.0 model page",
  "vericontext/vibeframe",
  "harry0703/MoneyPrinterTurbo"
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

const { transitionIntentsForAssemblyClips } = await import("../dist/core/assembly-engine.js");
const { selectAssemblyClipsForRenderedShots, isVideoOutputUrl } = await import("../dist/core/assembly-output-selector.js");
const { DeliveryGate } = await import("../dist/core/delivery-gate.js");

const mixedRenderedShots = [
  renderedShot("shot_a", [
    "https://cdn.example.test/project/download/shot-a?format=mp4&Expires=redacted",
    "https://cdn.example.test/project/shot-a-last-frame.png?Expires=redacted",
    "https://cdn.example.test/project/shot-a-preview.jpg"
  ], "Inter-shot bridge: this clip must cut into the proof scene. Bridge transition intent: seamless match cut from serum closeup to proof demo. Keep screen direction."),
  renderedShot("shot_b", [
    "https://cdn.example.test/project/shot-b-last-frame.PNG",
    "C:\\media\\shot-b.MOV?token=redacted",
    "https://cdn.example.test/project/shot-b-alt.WEBM#fragment"
  ], "Transition: wipe reveal into final result. Keep product scale stable.")
];
const selectedClips = selectAssemblyClipsForRenderedShots(mixedRenderedShots);
const boundaryTransitionIntents = transitionIntentsForAssemblyClips([
  {
    clipId: "clip_a",
    sourceUrlOrPath: "clip-a.mp4",
    order: 0,
    transitionOutIntent: "seamless xfade from mirror hook to serum proof"
  },
  {
    clipId: "clip_b",
    sourceUrlOrPath: "clip-b.mp4",
    order: 1,
    transitionInIntent: "continue exact hand motion and product scale from prior endpoint",
    transitionOutIntent: "wipe reveal into final packshot"
  },
  {
    clipId: "clip_c",
    sourceUrlOrPath: "clip-c.mp4",
    order: 2,
    transitionInIntent: "wipe reveal into final packshot"
  }
]);
let missingVideoError = "";
try {
  selectAssemblyClipsForRenderedShots([
    renderedShot("shot_without_video", [
      "https://cdn.example.test/project/shot-without-video.png",
      "https://cdn.example.test/project/shot-without-video.jpeg"
    ])
  ]);
} catch (error) {
  missingVideoError = error instanceof Error ? error.message : String(error);
}

const durationGate = new DeliveryGate();
const durationScenarios = {
  pass: durationGate.evaluate({ deliverable: deliverable(43.5), settings: settings(45) }),
  warn: durationGate.evaluate({ deliverable: deliverable(41), settings: settings(45) }),
  block: durationGate.evaluate({ deliverable: deliverable(36), settings: settings(45) })
};

const checks = [
  selectedClips.length === 3
    ? pass("video_only_clip_selection", "Mixed provider outputs produce only video assembly clips.")
    : fail("video_only_clip_selection", `Expected 3 video clips but selected ${selectedClips.length}.`),
  selectedClips.map((clip) => clip.clipId).join(",") === "shot_a_0,shot_b_0,shot_b_1"
    ? pass("stable_clip_ids", "Selected clip IDs remain stable per shot and per video output.")
    : fail("stable_clip_ids", "Selected clip IDs did not match the expected shot/output sequence."),
  selectedClips.map((clip) => clip.order).join(",") === "0,1,1.01"
    ? pass("stable_clip_order", "Selected clip order preserves shot order and multiple video outputs.")
    : fail("stable_clip_order", "Selected clip order drifted from expected timeline order."),
  selectedClips[0]?.transitionOutIntent === "seamless match cut from serum closeup to proof demo. Keep screen direction" &&
    selectedClips.slice(1).every((clip) => clip.transitionOutIntent === "wipe reveal into final result. Keep product scale stable")
    ? pass("transition_intent_extraction", "Assembly clips inherit full-line transition intent from both paragraph bridge prompts and explicit Transition lines.")
    : fail("transition_intent_extraction", "Assembly clips did not inherit full-line transition intent from compiled prompt text."),
  boundaryTransitionIntents.length === 2 &&
    boundaryTransitionIntents[0] === "outgoing: seamless xfade from mirror hook to serum proof | incoming: continue exact hand motion and product scale from prior endpoint" &&
    boundaryTransitionIntents[1] === "wipe reveal into final packshot"
    ? pass("boundary_transition_intent_merge", "Assembly boundaries merge outgoing and incoming transition intent without duplicating identical adjacent intent.")
    : fail("boundary_transition_intent_merge", "Expected assembly boundary transition intent to preserve both sides and collapse duplicates."),
  !isVideoOutputUrl("https://cdn.example.test/project/last-frame.png?Expires=redacted") &&
    isVideoOutputUrl("https://cdn.example.test/project/clip.MP4?Expires=redacted") &&
    isVideoOutputUrl("C:\\media\\clip.webm?token=redacted") &&
    isVideoOutputUrl("https://cdn.example.test/provider/download?id=clip123&format=mp4") &&
    isVideoOutputUrl("https://cdn.example.test/provider/download?id=clip456&response-content-type=video%2Fmp4") &&
    !isVideoOutputUrl("https://cdn.example.test/provider/download?id=frame123&format=png")
    ? pass("extension_classifier", "The media classifier accepts video extensions and provider download URLs while rejecting image sidecars.")
    : fail("extension_classifier", "The media classifier did not handle video/image provider output URL variants."),
  missingVideoError.includes("did not include a video output URL")
    ? pass("missing_video_blocks_assembly", "Shots without video output fail before assembly.")
    : fail("missing_video_blocks_assembly", "Shots without video output did not produce the expected assembly blocker."),
  durationScenarios.pass.status === "pass"
    ? pass("duration_gate_pass", "A 45s target with 43.5s inspected output passes the duration gate.")
    : fail("duration_gate_pass", `Expected duration pass but got ${durationScenarios.pass.status}.`),
  durationScenarios.warn.status === "warn" &&
    durationScenarios.warn.findings.some((finding) => finding.checkpoint === "target_duration")
    ? pass("duration_gate_warn", "Moderate final-duration drift becomes an operator warning.")
    : fail("duration_gate_warn", "Moderate final-duration drift did not become a target_duration warning."),
  durationScenarios.block.status === "block" &&
    durationScenarios.block.findings.some((finding) => finding.checkpoint === "target_duration")
    ? pass("duration_gate_block", "Large final-duration drift blocks customer delivery.")
    : fail("duration_gate_block", "Large final-duration drift did not block target_duration delivery.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.mixed-output-assembly-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: options.outputPath,
    renderedShotCount: mixedRenderedShots.length,
    providerOutputUrlCount: mixedRenderedShots.reduce((sum, shot) => sum + shot.prediction.outputUrls.length, 0),
    selectedAssemblyClipCount: selectedClips.length,
    rawOutputUrlsStoredInReport: false
  },
  scenarios: {
    mixedProviderOutputs: {
      renderedShotCount: mixedRenderedShots.length,
      providerOutputUrlCount: 6,
      selectedAssemblyClipCount: selectedClips.length,
      selectedClipIds: selectedClips.map((clip) => clip.clipId),
      selectedClipOrders: selectedClips.map((clip) => clip.order),
      selectedClipTransitionIntentCount: selectedClips.filter((clip) => clip.transitionOutIntent).length,
      boundaryTransitionIntents,
      rejectedSidecarCount: 3
    },
    missingVideoOutput: {
      blocked: Boolean(missingVideoError),
      errorMessage: missingVideoError
    },
    durationGate: summarizeDurationGate(durationScenarios)
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendMixedOutputAssemblyEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Mixed-output assembly smoke proves deterministic no-spend guard behavior only; paid media review and long-form business validation remain separate gates."
      : "Mixed-output assembly smoke failed; fix media selection or duration gate behavior before trusting long-form assembly."
  },
  nextActions: status === "pass"
    ? [
        "Keep this smoke passing before live long-form paid validation.",
        "Use paid run artifacts to confirm provider sidecar images remain evidence/reference material, not timeline clips."
      ]
    : ["Fix mixed-output assembly guard behavior before live long-form validation."]
};

if (options.writeReport) {
  const outputPath = resolve(repoRoot, options.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = status === "pass" ? 0 : 1;

function renderedShot(shotId, outputUrls, prompt = "") {
  return {
    compiledPrompt: { shotId, prompt },
    prediction: { outputUrls }
  };
}

function settings(durationTargetSeconds) {
  return {
    model: "seedance-v1-pro",
    tier: "fast",
    ratio: "16:9",
    resolution: "480p",
    durationTargetSeconds,
    qualityMode: "economy",
    audioMode: "none",
    fps: 30,
    seed: 1,
    returnLastFrame: true
  };
}

function deliverable(durationSeconds) {
  return {
    projectId: "mixed_output_assembly_smoke",
    outputPath: "not-written.mp4",
    outputByteSize: 1,
    outputSha256: "0".repeat(64),
    clipCount: 3,
    assembledAt: new Date(),
    inspection: {
      status: "pass",
      findings: [],
      metadata: {
        durationSeconds,
        streams: [
          {
            type: "video",
            width: 854,
            height: 480
          }
        ]
      },
      audio: { hasAudio: false }
    }
  };
}

function summarizeDurationGate(scenarios) {
  return Object.fromEntries(
    Object.entries(scenarios).map(([name, gate]) => [
      name,
      {
        status: gate.status,
        findingCount: gate.findings.length,
        checkpoints: gate.findings.map((finding) => finding.checkpoint)
      }
    ])
  );
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
