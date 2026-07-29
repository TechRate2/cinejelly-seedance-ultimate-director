#!/usr/bin/env node
/**
 * No-spend regression for the pre-video-spend IMAGE verification stage (repo-fidelity gap #2 — the
 * ViMax economy: check the cheap image before dollars render on it). Stubbed LLM only — no network.
 * Locks: verdict mapping (pass/fail/skipped), identity references reach the vision call, abort
 * propagates, and the director's retry/keep-vs-drop policies exist in source.
 */

import { readFileSync } from "node:fs";
import { ImageAnchorVerifier } from "../dist/core/image-anchor-verifier.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const calls = [];
const llmStub = (result) => ({
  name: "stub",
  async chat() { throw new Error("not used"); },
  async structured(request) {
    calls.push(request);
    if (result instanceof Error) { throw result; }
    return { provider: "atlascloud", modelId: request.modelId, content: "{}", raw: {}, latencyMs: 0, value: result };
  },
  capabilities() { return []; }
});

// 1. Pass verdict maps through.
const passV = await new ImageAnchorVerifier(llmStub({ status: "pass", reason: "ok" }), "vision-m").verify({
  imageUrl: "https://cdn.x/portrait.png", kind: "character_portrait", expectation: "Linh — 23t, mắt kiên định"
});
check("pass_maps_through", passV.status === "pass" && passV.kind === "character_portrait");

// 2. Fail verdict maps through with reason.
const failV = await new ImageAnchorVerifier(llmStub({ status: "fail", reason: "different face than reference" }), "m").verify({
  imageUrl: "https://cdn.x/kf.png", kind: "shot_keyframe", expectation: "creator with serum",
  identityReferenceUrls: ["https://cdn.x/linh.png", "http://insecure.example/x.png"]
});
check("fail_maps_through_with_reason", failV.status === "fail" && failV.reason.includes("different face"));

// 3. Identity references: https-only, appended AFTER the generated image (order matters to the rule text).
const lastCall = calls[calls.length - 1];
const imageParts = lastCall.messages[1].content.filter((p) => p.type === "image_url").map((p) => p.image_url.url);
check("identity_refs_https_only_and_ordered", imageParts.length === 2 && imageParts[0] === "https://cdn.x/kf.png" && imageParts[1] === "https://cdn.x/linh.png", JSON.stringify(imageParts));
check("prompt_names_same_person_rule", lastCall.messages[1].content[0].text.includes("SAME person"));
check("uses_configured_model", lastCall.modelId === "m");

// 4. Provider error (no abort) -> fail-open "skipped", never a throw.
const skippedV = await new ImageAnchorVerifier(llmStub(new Error("ECONNRESET")), "m").verify({
  imageUrl: "https://cdn.x/p.png", kind: "character_portrait", expectation: "x"
});
check("provider_error_fails_open_skipped", skippedV.status === "skipped" && skippedV.reason.includes("ECONNRESET"));

// 5. A real user abort propagates (never swallowed into "skipped").
const abort = new AbortController();
abort.abort();
let aborted = false;
try {
  await new ImageAnchorVerifier(llmStub(new Error("aborted")), "m").verify(
    { imageUrl: "https://cdn.x/p.png", kind: "character_portrait", expectation: "x" },
    abort.signal
  );
} catch { aborted = true; }
check("abort_propagates", aborted);

// 5b. Uploaded identity-reference kind: rule text targets upload defects (no face / multiple people /
// blur / covered face) and the director wires it as a WARN-only pre-spend check.
const uploadV = await new ImageAnchorVerifier(llmStub({ status: "fail", reason: "two people in frame" }), "m").verify({
  imageUrl: "https://cdn.x/upload.jpg", kind: "identity_reference", expectation: "one sharp face"
});
check("identity_reference_kind_supported", uploadV.status === "fail" && uploadV.kind === "identity_reference");
check("identity_reference_rules_target_upload_defects", calls[calls.length - 1].messages[1].content[0].text.includes("customer-UPLOADED IDENTITY REFERENCE") && calls[calls.length - 1].messages[1].content[0].text.includes("multiple people"));

// 6. Director policy is wired in source (retry once; portraits KEEP on double-fail, keyframes DROP).
const directorSrc = readFileSync(new URL("../src/agents/director-agent.ts", import.meta.url), "utf8");
check("director_wires_verifier", directorSrc.includes("this.imageAnchorVerifier"));
check("portrait_policy_keep_with_warning", directorSrc.includes("kept as the video's single anchor but flagged for operator review"));
check("keyframe_policy_drop_on_double_fail", directorSrc.includes("droppedShotIds.push(entry.shotId)") && directorSrc.includes("results.splice(index, 1)"));
check("upload_quality_check_warn_only", directorSrc.includes('kind: "identity_reference"') && directorSrc.includes("identityUploadFailedCount"));
const factorySrc = readFileSync(new URL("../src/application/director-factory.ts", import.meta.url), "utf8");
check("factory_wires_verifier_on_vision_model", factorySrc.includes("new ImageAnchorVerifier(atlasProvider, settings.atlasCloud.models.llmModel)"));

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.image-anchor-verifier-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep GREEN when changing ImageAnchorVerifier or the director's portrait/keyframe verify-retry policies.",
    "The visual benefit (bad anchors caught before video spend) is provable only on a paid run."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
