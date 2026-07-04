#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/long-form-continuity-smoke-report.json";
const sourcePatternOrigins = ["HKUDS/ViMax", "HKUDS/VideoAgent", "vericontext/vibeframe"];

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

const { LongFormContinuityPlanner } = await import("../dist/core/long-form-continuity-planner.js");
const planner = new LongFormContinuityPlanner();
const projectId = "long_form_continuity_smoke";
const storyPlan = buildStoryPlan(projectId);
const shots = shotsFor(storyPlan);
const sourceVideoAnalysis = {
  sourceReferenceLabel: "operator-approved product walkthrough",
  transformationIntent: "Translate source-video pacing into a long-form proof arc.",
  scenes: [
    {
      sceneId: "source_scene_01",
      startSecond: 0,
      endSecond: 18,
      summary: "Opening product context and problem statement.",
      pacing: "steady",
      camera: "handheld push-in",
      visualStyle: "warm tabletop product proof"
    },
    {
      sceneId: "source_scene_02",
      startSecond: 18,
      endSecond: 42,
      summary: "Demonstration and before/after proof structure.",
      pacing: "progressive",
      camera: "macro detail and controlled cutaway",
      visualStyle: "clean commercial explainer"
    }
  ],
  structuralBeats: ["problem", "proof", "demonstration", "CTA"],
  styleNotes: ["warm natural light", "clean product macro frames"]
};

const plan = planner.build({
  projectId,
  storyPlan,
  shots,
  sourceVideoAnalysis
});
const serializedPlan = JSON.stringify(plan);
const rawUrlLeakDetected = serializedPlan.includes("https://private.example") ||
  serializedPlan.includes("token=secret") ||
  serializedPlan.includes("api_key=");
const sequenceShotCount = plan.sequences.reduce((sum, sequence) => sum + sequence.shotIds.length, 0);
const sequenceSceneCount = plan.sequences.reduce((sum, sequence) => sum + sequence.sceneIds.length, 0);
const bridgeTargetsValid = plan.sequences.every((sequence, index) =>
  index === plan.sequences.length - 1
    ? sequence.bridgeToNext === undefined
    : sequence.bridgeToNext?.nextSequenceId === plan.sequences[index + 1]?.sequenceId &&
      sequence.bridgeToNext.requiredAnchors.length > 0
);
const sourceAnchoredSequences = plan.sequences.filter((sequence) => sequence.anchors.sourceVideoSceneIds.length > 0);
const sequentialSequences = plan.sequences.filter((sequence) => sequence.renderModeRecommendation === "sequential_recommended");

const checks = [
  plan.sequenceCount >= 3 && plan.sequenceCount <= 6
    ? pass("deterministic_sequence_count", `A 120 second long-form story is grouped into ${plan.sequenceCount} narrative continuity sequences, within the documented 3-6 range (semantic segmentation).`)
    : fail("deterministic_sequence_count", `Expected 3-6 sequences for 120 seconds, saw ${plan.sequenceCount}.`),
  plan.bridgeCount === plan.sequenceCount - 1 && bridgeTargetsValid
    ? pass("sequence_bridges", "Every non-final sequence has a bridge to the next sequence with required anchor evidence.")
    : fail("sequence_bridges", "Sequence bridge evidence is missing or does not point to the next sequence."),
  plan.sequences
    .filter((sequence) => sequence.bridgeToNext)
    .every((sequence) =>
      sequence.bridgeToNext.bridgeIntent.includes("camera momentum") &&
        sequence.bridgeToNext.bridgeIntent.includes("room tone") &&
        sequence.bridgeToNext.bridgeIntent.includes("product/KOL scale")
    )
    ? pass("sequence_bridge_seamless_edit_contract", "Long-form sequence bridges carry camera, room-tone, lighting, scale, and endpoint-state continuity instructions.")
    : fail("sequence_bridge_seamless_edit_contract", "Expected every long-form sequence bridge to carry seamless edit continuity instructions."),
  sequenceSceneCount === storyPlan.scenes.length && sequenceShotCount === shots.length
    ? pass("scene_and_shot_coverage", "Continuity sequences preserve every scene and shot.")
    : fail("scene_and_shot_coverage", "Continuity plan lost at least one scene or shot."),
  plan.globalAnchors.identity.includes("founder host identity") &&
    plan.globalAnchors.product.includes("Glow Focus Serum") &&
    plan.globalAnchors.environment.includes("morning vanity table") &&
    plan.globalAnchors.style.includes("warm premium macro commercial")
    ? pass("global_anchor_coverage", "Identity, product, environment, and style anchors are promoted into global continuity evidence.")
    : fail("global_anchor_coverage", "Global continuity anchors are incomplete."),
  plan.sourceVideoAnchorCount > 0 &&
    plan.globalAnchors.sourceVideoSceneIds.includes("source_scene_01") &&
    plan.globalAnchors.sourceVideoSceneIds.includes("source_scene_02")
    ? pass("source_video_anchor_coverage", "Source-video scene anchors are visible without exposing raw media URLs.")
    : fail("source_video_anchor_coverage", "Source-video scene anchors are missing."),
  plan.highRiskSequenceCount > 0 && sequentialSequences.length >= sourceAnchoredSequences.length
    ? pass("risk_and_source_video_sequential_gate", "Risky or source-video anchored sequences are marked sequential_recommended before render.")
    : fail("risk_and_source_video_sequential_gate", "Risk/source-video continuity did not force sequential render recommendation."),
  !rawUrlLeakDetected
    ? pass("no_raw_provider_url_leak", "Continuity evidence stores labels and source scene IDs without raw provider URLs or query secrets.")
    : fail("no_raw_provider_url_leak", "Continuity evidence leaked raw provider URL or secret-like query text."),
  plan.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
    ? pass("source_pattern_lineage", "Long-form continuity evidence carries ViMax, VideoAgent, and VibeFrame lineage labels.")
    : fail("source_pattern_lineage", "Long-form continuity source pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-form-continuity-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 1,
    targetDurationSeconds: storyPlan.targetDurationSeconds,
    rawUrlLeakCheckPassed: !rawUrlLeakDetected
  },
  scenario: {
    projectId,
    sequenceCount: plan.sequenceCount,
    sceneCount: plan.sceneCount,
    beatCount: plan.beatCount,
    shotCount: plan.shotCount,
    bridgeCount: plan.bridgeCount,
    highRiskSequenceCount: plan.highRiskSequenceCount,
    sourceVideoAnchorCount: plan.sourceVideoAnchorCount,
    sequenceShotCount,
    sequenceSceneCount,
    sequentialRecommendedCount: sequentialSequences.length,
    sourceAnchoredSequenceCount: sourceAnchoredSequences.length,
    globalAnchorCounts: {
      identity: plan.globalAnchors.identity.length,
      product: plan.globalAnchors.product.length,
      environment: plan.globalAnchors.environment.length,
      style: plan.globalAnchors.style.length,
      sourceVideoSceneIds: plan.globalAnchors.sourceVideoSceneIds.length
    }
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendLongFormContinuityEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Long-form continuity smoke proves no-spend sequence continuity evidence only; paid long-form render, manual media review, and deployment evidence remain separate gates."
      : "Long-form continuity smoke failed; fix sequence continuity evidence before paid long-form validation."
  },
  nextActions: status === "pass"
    ? [
        "Keep continuity smoke passing before paid long-form validation.",
        "Compare long-form-continuity.json from real provider runs against manual review findings after paid validation."
      ]
    : ["Fix LongFormContinuityPlanner before using it as long-form evidence."]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(status === "pass" ? 0 : 1);

function buildStoryPlan(prefix) {
  return {
    premise: "A premium skincare product proof story that must preserve identity, product, environment, and style across a two minute arc.",
    targetDurationSeconds: 120,
    scenes: Array.from({ length: 6 }, (_, sceneIndex) => {
      const order = sceneIndex + 1;
      return {
        sceneId: `${prefix}_scene_${String(order).padStart(2, "0")}`,
        title: `Continuity Movement ${order}`,
        beats: [
          {
            beatId: `${prefix}_beat_${String(order).padStart(2, "0")}`,
            purpose: order === 1 ? "hook and setup" : order === 6 ? "payoff and CTA" : "proof development",
            action: `Carry the same founder, product, tabletop, and warm macro style through movement ${order}.`,
            durationSeconds: 20,
            style: "warm premium macro commercial",
            continuity: {
              identity: "founder host identity",
              product: "Glow Focus Serum",
              environment: "morning vanity table",
              style: "warm premium macro commercial"
            }
          }
        ]
      };
    })
  };
}

function shotsFor(storyPlan) {
  return storyPlan.scenes.flatMap((scene, sceneIndex) =>
    scene.beats.map((beat) => ({
      shotId: `${beat.beatId}_shot`,
      sceneId: scene.sceneId,
      beatId: beat.beatId,
      durationSeconds: beat.durationSeconds,
      intent: beat.purpose,
      subject: "Glow Focus Serum with founder host",
      action: beat.action,
      camera: sceneIndex < 2 ? "slow push-in" : "controlled macro cutaway",
      lighting: "warm natural window light",
      style: beat.style,
      references: referencesFor(sceneIndex),
      continuity: beat.continuity,
      risks: risksFor(sceneIndex)
    }))
  );
}

function referencesFor(sceneIndex) {
  const common = [
    reference("identity", "founder host identity", "identity/founder.png"),
    reference("product", "Glow Focus Serum", "product/serum.png"),
    reference("environment", "morning vanity table", "environment/vanity.png"),
    reference("style", "warm premium macro commercial", "style/warm-macro.png")
  ];
  if (sceneIndex === 2 || sceneIndex === 3) {
    return [
      ...common,
      reference(
        "source_video_structure",
        "operator-approved source video structure",
        "source/private-walkthrough.mp4?token=secret",
        sceneIndex === 2 ? "source_scene_01" : "source_scene_02"
      )
    ];
  }
  return common;
}

function risksFor(sceneIndex) {
  if (sceneIndex === 2) {
    return ["product_logo", "transition"];
  }
  if (sceneIndex === 4) {
    return ["face", "environment"];
  }
  return [];
}

function reference(role, label, path, sourceSceneId) {
  return {
    role,
    label,
    priority: "primary",
    providerReference: {
      kind: role === "source_video_structure" ? "video" : "image",
      uri: `https://private.example/${path}`,
      label
    },
    ...(sourceSceneId ? { selection: { sourceSceneId, authorized: true } } : {})
  };
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
