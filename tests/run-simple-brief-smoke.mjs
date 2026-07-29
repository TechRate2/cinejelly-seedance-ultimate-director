/**
 * No-spend smoke for the simple brief resolver.
 * Proves: one idea resolves into full quality-first settings with plain-language default
 * explanations; platform matrix sets ratio/duration; face/product uploads become identity/
 * product references; advanced overrides win; unsafe URIs and empty ideas are rejected.
 * No network, no provider calls, no spend.
 */

import { resolveSimpleBrief } from "../dist/core/simple-brief-resolver.js";
import { normalizeSeedanceSettings } from "../dist/config/seedance-settings.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// 1. Minimal input: just an idea.
const minimal = resolveSimpleBrief({ idea: "Video review kem duong da cho da kho" });
check("platform_defaults_tiktok", minimal.platform === "tiktok");
check("vertical_ratio_default", minimal.settings.ratio === "9:16");
check("duration_default_27s", minimal.settings.durationTargetSeconds === 27);
check("resolution_defaults_1080p", minimal.settings.resolution === "1080p");
check("defaults_are_explained", minimal.appliedDefaults.length >= 5);
check("no_refs_hint_present", minimal.appliedDefaults.some((line) => line.includes("face/KOL or product photo")));
let normalizes = true;
try {
  normalizeSeedanceSettings(minimal.settings);
} catch {
  normalizes = false;
}
check("resolved_settings_are_valid", normalizes);

// 2. Uploads become correctly-roled references.
const withMedia = resolveSimpleBrief({
  idea: "Gioi thieu serum moi",
  platform: "Instagram Reels",
  mediaReferences: [
    { kind: "face", uri: "https://example.com/me.jpg", label: "my_face" },
    { kind: "product", uri: "asset://serum-bottle" }
  ],
  voice: { language: "vi" }
});
check("reels_platform_detected", withMedia.platform === "reels" && withMedia.settings.durationTargetSeconds === 22);
check("face_becomes_identity_primary", withMedia.references.some((ref) => ref.role === "identity" && ref.priority === "primary"));
check("product_reference_built", withMedia.references.some((ref) => ref.role === "product" && ref.providerReference.uri === "asset://serum-bottle"));
check("voice_language_carried", withMedia.voiceLanguage === "vi");

// 3. Advanced overrides win and are reported.
const advanced = resolveSimpleBrief({
  idea: "Quang cao giay sneaker",
  platform: "youtube",
  advanced: { qualityMode: "ultimate", resolution: "1440p-SR", seed: 1234 }
});
check("youtube_landscape_long", advanced.settings.ratio === "16:9" && advanced.settings.durationTargetSeconds === 120);
check("advanced_quality_wins", advanced.settings.qualityMode === "ultimate" && advanced.settings.resolution === "1440p-SR");
check("advanced_seed_wins", advanced.settings.seed === 1234);
check("overrides_reported", advanced.advancedOverrides.length === 3);

// 4. Duration clamping and validation guards.
const clamped = resolveSimpleBrief({ idea: "Test", durationSeconds: 5 });
check("short_duration_clamped_up", clamped.settings.durationTargetSeconds === 15);
let emptyRejected = false;
try {
  resolveSimpleBrief({ idea: "   " });
} catch {
  emptyRejected = true;
}
check("empty_idea_rejected", emptyRejected);
let badUriRejected = false;
try {
  resolveSimpleBrief({ idea: "x", mediaReferences: [{ kind: "face", uri: "http://insecure.example.com/a.jpg" }] });
} catch {
  badUriRejected = true;
}
check("insecure_uri_rejected", badUriRejected);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.simple-brief-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing simple-brief-resolver.ts or the platform default matrix.",
    "The create UI should surface appliedDefaults as friendly copy and tuck advanced overrides behind an optional panel."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
