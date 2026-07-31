#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/long-form-agent-review-smoke-report.json";
const sourcePatternOrigins = ["HKUDS/ViMax", "HKUDS/VideoAgent", "vericontext/vibeframe"];
const expectedRoles = [
  "script_architect",
  "continuity_supervisor",
  "source_video_reviewer",
  "render_orchestrator",
  "commercial_risk_reviewer"
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

const { LongFormContinuityPlanner } = await import("../dist/core/long-form-continuity-planner.js");
const { LongFormAgentReviewPlanner } = await import("../dist/core/long-form-agent-review-planner.js");

const continuityPlanner = new LongFormContinuityPlanner();
const reviewPlanner = new LongFormAgentReviewPlanner();

const projectId = "long_form_agent_review_smoke";
const storyPlan = buildStoryPlan(projectId, 6, 120);
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
      summary: "Demonstration and proof structure.",
      pacing: "progressive",
      camera: "macro detail and controlled cutaway",
      visualStyle: "clean commercial explainer"
    }
  ],
  structuralBeats: ["problem", "proof", "demonstration", "CTA"],
  styleNotes: ["warm natural light", "clean product macro frames"]
};

const continuityPlan = continuityPlanner.build({
  projectId,
  storyPlan,
  shots,
  sourceVideoAnalysis
});
const review = reviewPlanner.build({
  projectId,
  storyPlan,
  shots,
  continuityPlan,
  sourceVideoAnalysis
});

const blockedProjectId = "long_form_agent_review_blocked_smoke";
const blockedStoryPlan = buildStoryPlan(blockedProjectId, 1, 120);
const blockedShots = shotsFor(blockedStoryPlan);
const blockedContinuityPlan = continuityPlanner.build({
  projectId: blockedProjectId,
  storyPlan: blockedStoryPlan,
  shots: blockedShots
});
const blockedReview = reviewPlanner.build({
  projectId: blockedProjectId,
  storyPlan: blockedStoryPlan,
  shots: blockedShots,
  continuityPlan: blockedContinuityPlan
});

const serialized = JSON.stringify({ review, blockedReview });
const rawUrlLeakDetected = serialized.includes("https://private.example") ||
  serialized.includes("token=secret") ||
  serialized.includes("api_key=");
const roleCoverage = expectedRoles.every((role) => review.decisions.some((decision) => decision.role === role));
const countsConsistent =
  review.findingCount === review.findings.length &&
  review.blockingFindingCount === review.findings.filter((finding) => finding.severity === "block").length &&
  review.reviewRequiredFindingCount === review.findings.filter((finding) => finding.severity === "warn").length;
const blockedCountsConsistent =
  blockedReview.findingCount === blockedReview.findings.length &&
  blockedReview.blockingFindingCount === blockedReview.findings.filter((finding) => finding.severity === "block").length &&
  blockedReview.reviewRequiredFindingCount === blockedReview.findings.filter((finding) => finding.severity === "warn").length;

const checks = [
  review.noSpend === true &&
    review.networkCallsMade === false &&
    review.providerCallsMade === false &&
    blockedReview.noSpend === true &&
    blockedReview.networkCallsMade === false &&
    blockedReview.providerCallsMade === false
    ? pass("no_spend_no_network", "Agentic long-form review makes no network, Atlas, or provider calls.")
    : fail("no_spend_no_network", "Expected no-spend/no-network/no-provider boundaries."),
  review.agentCount === expectedRoles.length && roleCoverage
    ? pass("five_role_review_board", "The review board covers script, continuity, source-video, render orchestration, and commercial-risk roles.")
    : fail("five_role_review_board", "Expected one decision for every review role."),
  review.status === "review_required" &&
    review.releaseGateSummary.canProceedToPromptCompilation === true &&
    review.releaseGateSummary.canReleaseToCustomerTraffic === false
    ? pass("review_required_without_provider_block", "A structurally valid long-form plan can proceed to prompt compilation while keeping manual review required.")
    : fail("review_required_without_provider_block", "Expected normal long-form fixture to be review_required and prompt-compilation safe."),
  review.findings.some((finding) => finding.role === "source_video_reviewer" && finding.code === "source_video_anchor_ready")
    ? pass("source_video_anchor_review", "Source-video scene anchors are reviewed without exposing raw source URLs.")
    : fail("source_video_anchor_review", "Expected source-video reviewer anchor evidence."),
  review.findings.some((finding) => finding.role === "commercial_risk_reviewer" && finding.code === "manual_review_required_for_high_risk_sequences")
    ? pass("commercial_manual_review_gate", "High-risk long-form sequences keep manual media review as a business gate.")
    : fail("commercial_manual_review_gate", "Expected commercial-risk manual-review finding."),
  blockedReview.status === "blocked" &&
    blockedReview.releaseGateSummary.canProceedToPromptCompilation === false &&
    blockedReview.findings.some((finding) => finding.code === "insufficient_long_form_sequences")
    ? pass("blocked_fixture_stops_prompt_compilation", "An under-sequenced 120 second story blocks before provider spend.")
    : fail("blocked_fixture_stops_prompt_compilation", "Expected insufficient long-form sequence fixture to block."),
  countsConsistent && blockedCountsConsistent
    ? pass("count_consistency", "Finding, blocking, and review-required counts match finding rows.")
    : fail("count_consistency", "Finding counts do not match row evidence."),
  !rawUrlLeakDetected
    ? pass("no_raw_provider_url_leak", "Agentic review evidence stores labels and source scene IDs without raw provider URLs or query secrets.")
    : fail("no_raw_provider_url_leak", "Agentic review evidence leaked raw provider URL or secret-like query text."),
  review.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin)) &&
    blockedReview.sourcePatternOrigins.every((origin) => sourcePatternOrigins.includes(origin))
    ? pass("source_pattern_lineage", "Long-form agentic review evidence carries ViMax, VideoAgent, and VibeFrame lineage labels.")
    : fail("source_pattern_lineage", "Long-form agentic review source pattern origins are incomplete.")
];

const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
const report = {
  schemaVersion: "cinejelly.long-form-agent-review-smoke.v1",
  generatedAt: new Date().toISOString(),
  status,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins,
  checkedInputs: {
    outputPath: options.outputPath,
    scenarioCount: 2,
    targetDurationSeconds: storyPlan.targetDurationSeconds,
    rawUrlLeakCheckPassed: !rawUrlLeakDetected
  },
  scenarios: {
    reviewRequired: summarizeReview(review),
    blocked: summarizeReview(blockedReview)
  },
  checks,
  releaseGateSummary: {
    canUseAsNoSpendAgenticReviewEvidence: status === "pass",
    canReleaseToCustomerTraffic: false,
    releaseBlocker: status === "pass"
      ? "Long-form agentic review smoke proves no-spend multi-role review evidence only; paid long-form render, manual media review, and deployment evidence remain separate gates."
      : "Long-form agentic review smoke failed; fix review board evidence before paid long-form validation."
  },
  nextActions: status === "pass"
    ? [
        "Keep long-form agentic review smoke passing before paid long-form validation.",
        "Compare long-form-agent-review.json from real provider runs against manual review findings after paid validation."
      ]
    : ["Fix LongFormAgentReviewPlanner before using it as long-form evidence."]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(status === "pass" ? 0 : 1);

function buildStoryPlan(prefix, sceneCount, targetDurationSeconds) {
  return {
    premise: "A premium skincare product proof story that must preserve identity, product, environment, and style across a long-form arc.",
    targetDurationSeconds,
    scenes: Array.from({ length: sceneCount }, (_, sceneIndex) => {
      const order = sceneIndex + 1;
      return {
        sceneId: `${prefix}_scene_${String(order).padStart(2, "0")}`,
        title: `Continuity Movement ${order}`,
        beats: [
          {
            beatId: `${prefix}_beat_${String(order).padStart(2, "0")}`,
            purpose: order === 1 ? "hook and setup" : order === sceneCount ? "payoff and CTA" : "proof development",
            action: `Carry the same founder, product, tabletop, and warm macro style through movement ${order}.`,
            durationSeconds: targetDurationSeconds / sceneCount,
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

function reference(role, label, uri, sourceVideoSceneId) {
  return {
    id: `${role}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    role,
    label,
    uri,
    ...(sourceVideoSceneId ? { sourceVideoSceneId } : {})
  };
}

function summarizeReview(value) {
  return {
    projectId: value.projectId,
    status: value.status,
    agentCount: value.agentCount,
    reviewedSequenceCount: value.reviewedSequenceCount,
    reviewedShotCount: value.reviewedShotCount,
    findingCount: value.findingCount,
    blockingFindingCount: value.blockingFindingCount,
    reviewRequiredFindingCount: value.reviewRequiredFindingCount,
    decisionCount: value.decisions.length,
    directiveCount: value.directives.length,
    canProceedToPromptCompilation: value.releaseGateSummary.canProceedToPromptCompilation,
    canReleaseToCustomerTraffic: value.releaseGateSummary.canReleaseToCustomerTraffic
  };
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const resolved = resolve(repoRoot, path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
