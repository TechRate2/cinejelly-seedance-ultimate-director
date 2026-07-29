#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/production-graph-sequence-smoke-report.json";

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

const { ProductionGraphBuilder } = await import("../dist/core/production-graph-builder.js");
const builder = new ProductionGraphBuilder();

const scenarios = {
  singleScene: analyzeScenario("sequence_single_scene", 30, 1),
  twoMinute: analyzeScenario("sequence_two_minute", 120, 6),
  eightMinute: analyzeScenario("sequence_eight_minute", 480, 12)
};

const checks = [
  scenarios.singleScene.sequenceCount === 1 &&
    scenarios.singleScene.everySceneHasSequenceParent &&
    scenarios.singleScene.everySequenceHasStoryParent
    ? pass("single_scene_sequence", "A one-scene story still receives one explicit sequence parent.")
    : fail("single_scene_sequence", "Expected one sequence parent for the one-scene story."),
  scenarios.twoMinute.sequenceCountWithinDocumentedRange
    ? pass("two_minute_sequence_count", `A 120 second story is grouped into ${scenarios.twoMinute.sequenceCount} narrative sequences, within the documented 3-6 range (semantic segmentation, not fixed windows).`)
    : fail("two_minute_sequence_count", `Expected 3-6 sequences for 120 seconds, saw ${scenarios.twoMinute.sequenceCount}.`),
  scenarios.eightMinute.sequenceCount >= 8 &&
    scenarios.eightMinute.sequenceCount <= 16 &&
    scenarios.eightMinute.sequenceCountWithinDocumentedRange
    ? pass("eight_minute_sequence_count", "A 480 second story is grouped inside the documented 8-16 sequence range.")
    : fail("eight_minute_sequence_count", `Expected 8-16 sequences for 480 seconds, saw ${scenarios.eightMinute.sequenceCount}.`),
  Object.values(scenarios).every((scenario) => scenario.everySceneHasSequenceParent)
    ? pass("scene_sequence_parent_edges", "Every scene depends on a sequence node instead of depending directly on the story arc.")
    : fail("scene_sequence_parent_edges", "At least one scene is missing a sequence parent."),
  Object.values(scenarios).every((scenario) => scenario.everySequenceHasStoryParent)
    ? pass("story_sequence_parent_edges", "Every sequence depends on the story arc.")
    : fail("story_sequence_parent_edges", "At least one sequence is missing a story-arc parent."),
  Object.values(scenarios).every((scenario) => scenario.sequenceOrdersContiguous && scenario.sceneOrdersContiguous)
    ? pass("deterministic_ordering", "Sequence and scene order fields are deterministic and contiguous.")
    : fail("deterministic_ordering", "Sequence or scene ordering is not deterministic and contiguous."),
  Object.values(scenarios).every((scenario) => scenario.directStoryToSceneEdgeCount === 0)
    ? pass("no_direct_story_scene_edge", "Production Graph no longer skips story_arc -> sequence -> scene hierarchy.")
    : fail("no_direct_story_scene_edge", "Found direct story_arc -> scene dependency edges."),
  Object.values(scenarios).every((scenario) => scenario.shotCount === scenario.expectedShotCount)
    ? pass("shot_count_preserved", "Adding sequences preserves all shot nodes.")
    : fail("shot_count_preserved", "Shot node count changed while adding sequence hierarchy.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.production-graph-sequence-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: ["HKUDS/ViMax", "vericontext/vibeframe"],
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: Object.keys(scenarios).length,
    expectedHierarchy: "project -> story_arc -> sequence -> scene -> beat -> shot"
  },
  scenarios,
  checks,
  releaseGateSummary: {
    canUseAsNoSpendLongFormSequenceGraphEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Sequence graph smoke proves deterministic no-spend hierarchy only; paid long-form render, manual review, and deployment evidence remain separate gates."
      : "Sequence graph smoke failed; fix graph hierarchy before trusting long-form continuity planning."
  },
  nextActions: status === "pass"
    ? [
        "Keep sequence graph smoke passing before paid long-form validation.",
        "Use production-graph.json from real paid long-form runs to audit sequence, scene, beat, and shot lineage."
      ]
    : ["Fix ProductionGraphBuilder sequence hierarchy before paid long-form validation."]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(status === "pass" ? 0 : 1);

function analyzeScenario(projectId, targetDurationSeconds, sceneCount) {
  const storyPlan = buildStoryPlan(projectId, targetDurationSeconds, sceneCount);
  const shots = shotsFor(storyPlan);
  const graph = builder.build({
    intake: {
      projectId,
      userInput: `Create a ${targetDurationSeconds} second long-form validation story.`,
      settings: {
        durationTargetSeconds: targetDurationSeconds,
        ratio: "16:9"
      },
      references: []
    },
    storyPlan,
    shots
  });
  const storyIds = idsFor(graph, "story_arc");
  const sequenceIds = idsFor(graph, "sequence");
  const sceneIds = idsFor(graph, "scene");
  const sequences = nodesFor(graph, "sequence");
  const scenes = nodesFor(graph, "scene");
  const directStoryToSceneEdgeCount = graph.edges.filter((edge) =>
    edge.type === "depends_on" &&
    storyIds.has(edge.fromNodeId) &&
    sceneIds.has(edge.toNodeId)
  ).length;

  return {
    targetDurationSeconds,
    sceneCount,
    sequenceCount: sequences.length,
    expectedShotCount: shots.length,
    shotCount: nodesFor(graph, "shot").length,
    beatCount: nodesFor(graph, "beat").length,
    directStoryToSceneEdgeCount,
    everySceneHasSequenceParent: scenes.every((scene) => hasParent(graph, sequenceIds, scene.id)),
    everySequenceHasStoryParent: sequences.every((sequence) => hasParent(graph, storyIds, sequence.id)),
    sequenceOrdersContiguous: ordersContiguous(sequences),
    sceneOrdersContiguous: ordersContiguous(scenes),
    sequenceCountWithinDocumentedRange: documentedRangeCheck(targetDurationSeconds, sequences.length),
    hierarchySummary: {
      storyArcCount: storyIds.size,
      sequenceIds: [...sequenceIds],
      sceneIds: [...sceneIds].slice(0, 8)
    }
  };
}

function buildStoryPlan(projectId, targetDurationSeconds, sceneCount) {
  const sceneDuration = targetDurationSeconds / sceneCount;
  return {
    premise: `${projectId} deterministic long-form continuity premise`,
    targetDurationSeconds,
    scenes: Array.from({ length: sceneCount }, (_, sceneIndex) => ({
      sceneId: `${projectId}_scene_${String(sceneIndex + 1).padStart(2, "0")}`,
      title: `Story Movement ${sceneIndex + 1}`,
      beats: [
        {
          beatId: `${projectId}_beat_${String(sceneIndex + 1).padStart(2, "0")}`,
          purpose: sceneIndex === 0 ? "hook and setup" : "develop continuity",
          action: `Advance story movement ${sceneIndex + 1}`,
          durationSeconds: Number(sceneDuration.toFixed(2))
        }
      ]
    }))
  };
}

function shotsFor(storyPlan) {
  return storyPlan.scenes.flatMap((scene) =>
    scene.beats.map((beat) => ({
      shotId: `${beat.beatId}_shot`,
      sceneId: scene.sceneId,
      beatId: beat.beatId,
      durationSeconds: beat.durationSeconds,
      intent: beat.purpose,
      subject: scene.title,
      action: beat.action,
      camera: "controlled cinematic dolly",
      lighting: "motivated natural light",
      references: [],
      continuity: {},
      risks: []
    }))
  );
}

function idsFor(graph, type) {
  return new Set(nodesFor(graph, type).map((node) => node.id));
}

function nodesFor(graph, type) {
  return graph.nodes.filter((node) => node.type === type);
}

function hasParent(graph, parentIds, nodeId) {
  return graph.edges.some((edge) =>
    edge.type === "depends_on" &&
    parentIds.has(edge.fromNodeId) &&
    edge.toNodeId === nodeId
  );
}

function ordersContiguous(nodes) {
  const orders = nodes
    .map((node) => node.data?.order)
    .filter((order) => Number.isInteger(order))
    .sort((left, right) => left - right);
  return orders.length === nodes.length && orders.every((order, index) => order === index);
}

function documentedRangeCheck(targetDurationSeconds, sequenceCount) {
  if (targetDurationSeconds <= 150) {
    return sequenceCount >= 3 && sequenceCount <= 6;
  }
  if (targetDurationSeconds >= 420) {
    return sequenceCount >= 8 && sequenceCount <= 16;
  }
  return sequenceCount >= 1;
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
