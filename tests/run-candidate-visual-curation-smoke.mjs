/**
 * No-spend smoke for per-candidate visual curation.
 * Proves severity->status mapping, fail-safe degradation, report merging, and that a
 * visually bad candidate ranks worse than a clean one under the existing comparator
 * semantics. Uses injected fakes only: no ffmpeg, no LLM, no network, no spend.
 */

import {
  mergeGuardianReports,
  RenderedCandidateVisualInspector
} from "../dist/core/rendered-candidate-visual-inspector.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

const shot = { shotId: "shot_vc_smoke_1" };
const compiledPrompt = {
  shotId: "shot_vc_smoke_1",
  inspectionExpectations: ["product geometry stays locked", "no identity drift"]
};
const prediction = {
  provider: "atlascloud",
  predictionId: "pred_vc_smoke",
  modelId: "seedance-2-0-smoke",
  status: "succeeded",
  outputUrls: ["https://example.com/clips/candidate.mp4"],
  raw: {},
  submittedAt: new Date(),
  completedAt: new Date(),
  latencyMs: 1200
};
const curation = {
  options: { enabled: true, expectations: ["frame is commercially usable"], maxFrames: 3 },
  workDirectory: "C:/tmp/vc-smoke-work"
};
const fakeFrames = [{ path: "C:/tmp/vc-smoke-work/frame_1.jpg", index: 0 }];
const framesSampler = { sampleFrames: async () => fakeFrames };

function inspectorWith(semanticReport, sampler = framesSampler) {
  return new RenderedCandidateVisualInspector({
    mediaInspector: sampler,
    semanticVisualInspector: { inspect: async (frames) => ({ ...semanticReport, frameCount: frames.length, reviewedFrames: frames }) }
  });
}

// 1. S1 identity drift -> rerender status, checkpoint prefixed, recommendation becomes repair text.
const failing = await inspectorWith({
  status: "fail",
  findings: [
    {
      severity: "S1",
      checkpoint: "identity drift",
      evidence: "Creator face changes between frame 1 and frame 3.",
      recommendation: "Re-render with the identity reference locked as the primary anchor."
    }
  ]
}).inspectCandidate({ shot, compiledPrompt, prediction, candidateIndex: 1, curation });
check("s1_maps_to_rerender", failing.status === "rerender");
check("visual_checkpoint_prefixed", failing.findings[0]?.checkpoint === "visual_identity_drift");
check("recommendation_becomes_repair", failing.findings[0]?.repair.includes("identity reference"));
check("report_stage_is_render", failing.stage === "render" && failing.nodeId === "shot_vc_smoke_1");

// 2. Severity ladder: S2 -> repair, S3 -> warn, clean pass -> pass.
const s2 = await inspectorWith({
  status: "warn",
  findings: [{ severity: "S2", checkpoint: "product blur", evidence: "Label soft in frame 2.", recommendation: "Hold product steady in final second." }]
}).inspectCandidate({ shot, compiledPrompt, prediction, candidateIndex: 2, curation });
check("s2_maps_to_repair", s2.status === "repair");
const s3 = await inspectorWith({
  status: "warn",
  findings: [{ severity: "S3", checkpoint: "minor grain", evidence: "Slight grain in shadows.", recommendation: "Acceptable; monitor." }]
}).inspectCandidate({ shot, compiledPrompt, prediction, candidateIndex: 3, curation });
check("s3_maps_to_warn", s3.status === "warn");
const clean = await inspectorWith({ status: "pass", findings: [] }).inspectCandidate({
  shot,
  compiledPrompt,
  prediction,
  candidateIndex: 4,
  curation
});
check("clean_maps_to_pass", clean.status === "pass" && clean.findings.length === 0);

// 3. Fail-safe: sampler infrastructure failure degrades to warn, never blocks.
const broken = await inspectorWith(
  { status: "pass", findings: [] },
  { sampleFrames: async () => { throw new Error("ffmpeg missing"); } }
).inspectCandidate({ shot, compiledPrompt, prediction, candidateIndex: 5, curation });
check("infra_failure_degrades_to_warn", broken.status === "warn" && broken.findings[0]?.checkpoint === "visual_curation_unavailable");

// 4. Image-only outputs degrade to warn (nothing to sample).
const imageOnly = await inspectorWith({ status: "pass", findings: [] }).inspectCandidate({
  shot,
  compiledPrompt,
  prediction: { ...prediction, outputUrls: ["https://example.com/last_frame.png"] },
  candidateIndex: 6,
  curation
});
check("image_only_output_warns", imageOnly.status === "warn" && imageOnly.findings[0]?.checkpoint === "visual_no_video_output");

// 5. Merging: deterministic pass + visual rerender -> rerender with concatenated findings;
//    visually clean candidate stays pass, so the existing comparator prefers it.
const deterministicPass = {
  nodeId: "shot_vc_smoke_1",
  stage: "render",
  status: "pass",
  findings: [],
  repairScope: "none",
  affectedNodeIds: ["shot_vc_smoke_1"],
  sourceCheckpoints: [],
  recommendedNextStep: "Proceed."
};
const merged = mergeGuardianReports(deterministicPass, failing);
check("merge_takes_worst_status", merged.status === "rerender");
check("merge_concatenates_findings", merged.findings.length === failing.findings.length);
check("merge_repair_scope_render", merged.repairScope === "render");
const mergedClean = mergeGuardianReports(deterministicPass, clean);
check("merge_clean_stays_pass", mergedClean.status === "pass");
const statusRank = { pass: 0, warn: 1, repair: 2, rerender: 3, block: 4 };
check("comparator_prefers_clean_candidate", statusRank[mergedClean.status] < statusRank[merged.status]);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.candidate-visual-curation-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing rendered-candidate-visual-inspector.ts or the DirectorAgent candidate loop.",
    "Live visual curation runs only when a render request enables semanticVisualInspectionOptions and provides a work directory; that path uses provider spend and needs operator confirmation."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
