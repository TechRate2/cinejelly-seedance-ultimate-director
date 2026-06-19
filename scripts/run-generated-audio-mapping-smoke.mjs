#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json"
};

const roleByKind = new Map([
  ["tts_narration", "narration"],
  ["bgm", "music"],
  ["ambience", "ambience"],
  ["sfx", "sfx"]
]);

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([["--output", "outputPath"]]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      options[key] = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      index += equalsIndex >= 0 ? 0 : 1;
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

function printHelp() {
  console.log(`Run CineJelly's no-spend generated-audio mapping smoke.

Usage:
  npm.cmd run validation:generated-audio-mapping

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write JSON.

This command makes no Atlas calls, no provider calls, no network calls, and creates no audio files.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const { GeneratedAudioExecutionPlanner } = await import("../dist/core/generated-audio-execution-planner.js");
  const { GeneratedAudioOutputValidator } = await import("../dist/core/generated-audio-output-validator.js");
  const planner = new GeneratedAudioExecutionPlanner();
  const validator = new GeneratedAudioOutputValidator();
  const scenarios = buildScenarios(planner, validator);
  const checks = buildChecks(scenarios);
  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const report = {
    schemaVersion: "cinejelly.generated-audio-mapping-smoke.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins: [
      "harry0703/MoneyPrinterTurbo",
      "vericontext/vibeframe",
      "calesthio/OpenMontage"
    ],
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      syntheticIntentCount: scenarios.allKindsReady.plan.intentCount,
      syntheticCapabilityCount: buildCapabilities().length,
      scenarioCount: Object.keys(scenarios).length,
      outputFormat: "mp3"
    },
    summary: summarizeScenarios(scenarios),
    plans: {
      allKindsReady: summarizePlan(scenarios.allKindsReady.plan),
      partialKindBoundary: summarizePlan(scenarios.partialKindBoundary.plan),
      providerPreferenceBinding: summarizePlan(scenarios.providerPreferenceBinding.plan),
      durationBoundary: summarizePlan(scenarios.durationBoundary.plan)
    },
    outputValidation: scenarios.outputValidation,
    checks,
    releaseGateSummary: {
      generatedAudioMappingSmokePass: status === "pass",
      canUseAsNoSpendBackendEvidence: status === "pass",
      canUseAsLiveGeneratedAudioEvidence: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Generated-audio mapping smoke proves narration/BGM/ambience/SFX kind boundaries and mix-role mapping only; live provider output, artifact evidence, and manual listening review are still required."
        : "Generated-audio mapping smoke failed; fix kind routing, provider preference, duration, or output validation boundaries before live generated-audio validation."
    },
    nextActions: [
      "Keep validation:generated-audio-mapping passing before claiming MoneyPrinterTurbo-style BGM/SFX execution mapping coverage.",
      "Run paid generated-audio validation only after Atlas billing readiness and manual review gates are prepared."
    ]
  };
  const finalText = JSON.stringify(report);
  const leakage = unsafeTextFinding(finalText);
  if (leakage) {
    report.status = "fail";
    report.checks = [
      ...checks,
      fail("report_redaction", `Generated-audio mapping report contains unsafe ${leakage} text.`)
    ];
    report.releaseGateSummary.generatedAudioMappingSmokePass = false;
    report.releaseGateSummary.canUseAsNoSpendBackendEvidence = false;
  }

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
  for (const path of [
    "dist/core/generated-audio-execution-planner.js",
    "dist/core/generated-audio-output-validator.js"
  ]) {
    if (!existsSync(resolve(repoRoot, path))) {
      throw new Error(`${path} is missing. Run npm.cmd run build first.`);
    }
  }
}

function buildScenarios(planner, validator) {
  const capabilities = buildCapabilities();
  const allKindIntents = buildAllKindIntents();
  const allKindsReady = planner.plan({
    intents: allKindIntents,
    capabilities,
    metadata: {
      projectId: "generated_audio_mapping_smoke",
      requestId: "generated_audio_mapping_request"
    }
  });

  const partialKindBoundary = planner.plan({
    intents: [allKindIntents[0], { ...allKindIntents[3], providerPreference: "atlascloud" }],
    capabilities: capabilities.filter((capability) => capability.modelId === "atlascloud/tts-mapping-smoke")
  });

  const providerPreferenceBinding = planner.plan({
    intents: [
      {
        intentId: "intent_bgm_provider_binding",
        kind: "bgm",
        prompt: "Provider binding smoke background music.",
        durationSeconds: 12,
        mood: "calm",
        providerPreference: "atlascloud"
      }
    ],
    capabilities: capabilities.filter((capability) => capability.provider !== "atlascloud")
  });

  const durationBoundary = planner.plan({
    intents: [
      {
        intentId: "intent_sfx_duration_boundary",
        kind: "sfx",
        prompt: "Duration boundary smoke SFX.",
        durationSeconds: 12,
        providerPreference: "studio_audio"
      }
    ],
    capabilities: [
      {
        provider: "studio_audio",
        modelId: "studio/fx-short-mapping-smoke",
        kinds: ["sfx"],
        outputFormats: ["mp3"],
        maxDurationSeconds: 5,
        async: true
      }
    ]
  });

  const approvedTracks = allKindsReady.items
    .filter((item) => item.status === "ready_for_provider")
    .map((item) => {
      const intent = allKindIntents.find((candidate) => candidate.intentId === item.intentId);
      if (!intent) {
        throw new Error(`Missing intent fixture for ${item.intentId}.`);
      }
      const report = validator.validate({
        intent,
        plannedItem: item,
        result: succeededResult(item)
      });
      return summarizeOutputValidation(report);
    });
  const sfxReadyItem = allKindsReady.items.find((item) => item.status === "ready_for_provider" && item.kind === "sfx");
  const sfxIntent = allKindIntents.find((intent) => intent.kind === "sfx");
  if (!sfxReadyItem || !sfxIntent) {
    throw new Error("SFX ready fixture is missing.");
  }
  const kindMismatch = validator.validate({
    intent: sfxIntent,
    plannedItem: sfxReadyItem,
    result: {
      ...succeededResult(sfxReadyItem),
      kind: "bgm"
    }
  });

  return {
    allKindsReady: { plan: allKindsReady },
    partialKindBoundary: { plan: partialKindBoundary },
    providerPreferenceBinding: { plan: providerPreferenceBinding },
    durationBoundary: { plan: durationBoundary },
    outputValidation: {
      approvedTracks,
      kindMismatch: {
        status: kindMismatch.status,
        issueCodes: kindMismatch.issues.map((issue) => issue.code).sort(),
        audioTrackCreated: Boolean(kindMismatch.audioTrack)
      }
    }
  };
}

function buildCapabilities() {
  return [
    {
      provider: "atlascloud",
      modelId: "atlascloud/tts-mapping-smoke",
      kinds: ["tts_narration"],
      outputFormats: ["mp3"],
      maxDurationSeconds: 30,
      async: true
    },
    {
      provider: "atlascloud",
      modelId: "atlascloud/bgm-mapping-smoke",
      kinds: ["bgm"],
      outputFormats: ["mp3"],
      maxDurationSeconds: 120,
      async: true
    },
    {
      provider: "studio_audio",
      modelId: "studio/ambient-fx-mapping-smoke",
      kinds: ["ambience", "sfx"],
      outputFormats: ["mp3", "wav"],
      maxDurationSeconds: 12,
      async: true
    }
  ];
}

function buildAllKindIntents() {
  return [
    {
      intentId: "intent_tts_mapping",
      kind: "tts_narration",
      prompt: "Narration mapping smoke.",
      durationSeconds: 6,
      language: "vi-VN",
      voiceStyle: "warm_director",
      volume: 1,
      providerPreference: "atlascloud"
    },
    {
      intentId: "intent_bgm_mapping",
      kind: "bgm",
      prompt: "Background music mapping smoke.",
      startSecond: 0,
      endSecond: 18,
      mood: "cinematic_uplift",
      volume: 0.35,
      providerPreference: "atlascloud"
    },
    {
      intentId: "intent_ambience_mapping",
      kind: "ambience",
      prompt: "Soft room tone ambience mapping smoke.",
      durationSeconds: 10,
      mood: "subtle",
      volume: 0.25,
      providerPreference: "studio_audio"
    },
    {
      intentId: "intent_sfx_mapping",
      kind: "sfx",
      prompt: "Small interface chime SFX mapping smoke.",
      startSecond: 4,
      endSecond: 5.2,
      volume: 0.7,
      providerPreference: "studio_audio"
    }
  ];
}

function succeededResult(item) {
  return {
    provider: item.provider,
    modelId: item.modelId,
    intentId: item.intentId,
    kind: item.kind,
    status: "succeeded",
    outputUrl: `https://media.example.invalid/cinejelly/generated-audio/${item.intentId}.mp3`,
    providerAssetId: `asset_${item.intentId}`,
    durationSeconds: item.request.settings.durationSeconds ?? 1,
    raw: { redacted: true },
    submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    completedAt: new Date("2026-01-01T00:00:01.000Z"),
    latencyMs: 1000
  };
}

function summarizeOutputValidation(report) {
  return {
    intentId: report.intentId,
    kind: report.kind,
    status: report.status,
    issueCount: report.issueCount,
    role: report.audioTrack?.role,
    volume: report.audioTrack?.volume,
    outputUrlSha256: report.audioTrack ? sha256(report.audioTrack.sourceUrlOrPath) : undefined
  };
}

function summarizePlan(plan) {
  return {
    status: plan.status,
    intentCount: plan.intentCount,
    readyCount: plan.readyCount,
    blockedCount: plan.blockedCount,
    requestedDurationSeconds: round(plan.requestedDurationSeconds),
    outputFormat: plan.outputFormat,
    readyItems: plan.items
      .filter((item) => item.status === "ready_for_provider")
      .map((item) => ({
        intentId: item.intentId,
        kind: item.kind,
        provider: item.provider,
        modelId: item.modelId,
        maxDurationSeconds: item.maxDurationSeconds,
        requestedDurationSeconds: optionalRound(item.requestedDurationSeconds),
        requestOutputFormat: item.request.settings.outputFormat
      })),
    blockedItems: plan.items
      .filter((item) => item.status === "blocked")
      .map((item) => ({
        intentId: item.intentId,
        kind: item.kind,
        providerPreference: item.providerPreference,
        reason: item.reason,
        requestedDurationSeconds: optionalRound(item.requestedDurationSeconds),
        candidateProviderCount: item.candidateProviderCount,
        candidateKindCount: item.candidateKindCount
      }))
  };
}

function summarizeScenarios(scenarios) {
  const allKindsPlan = scenarios.allKindsReady.plan;
  const approvedTracks = scenarios.outputValidation.approvedTracks;
  return {
    intentKindCoverage: [...new Set(allKindsPlan.items.map((item) => item.kind))].sort(),
    readyKindCounts: countBy(allKindsPlan.items.filter((item) => item.status === "ready_for_provider").map((item) => item.kind)),
    approvedTrackRoleCounts: countBy(approvedTracks.map((item) => item.role).filter(Boolean)),
    blockedReasonCounts: countBy([
      ...scenarios.partialKindBoundary.plan.items,
      ...scenarios.providerPreferenceBinding.plan.items,
      ...scenarios.durationBoundary.plan.items
    ].filter((item) => item.status === "blocked").map((item) => item.reason)),
    outputValidationApprovedCount: approvedTracks.filter((item) => item.status === "approved").length,
    kindMismatchRejected: scenarios.outputValidation.kindMismatch.status === "rejected",
    rawOutputUrlStored: false,
    rawPromptStored: false
  };
}

function buildChecks(scenarios) {
  const allKindsPlan = scenarios.allKindsReady.plan;
  const approvedTracks = scenarios.outputValidation.approvedTracks;
  const readyKinds = new Set(allKindsPlan.items.filter((item) => item.status === "ready_for_provider").map((item) => item.kind));
  const roles = new Set(approvedTracks.map((item) => item.role));
  const partialBlockedReasons = scenarios.partialKindBoundary.plan.items
    .filter((item) => item.status === "blocked")
    .map((item) => item.reason);
  const providerBlockedReasons = scenarios.providerPreferenceBinding.plan.items
    .filter((item) => item.status === "blocked")
    .map((item) => item.reason);
  const durationBlockedReasons = scenarios.durationBoundary.plan.items
    .filter((item) => item.status === "blocked")
    .map((item) => item.reason);
  const readyRequestKindsMatch = allKindsPlan.items.every(
    (item) => item.status !== "ready_for_provider" || item.request.kind === item.kind
  );
  const roleMappingPass = approvedTracks.every((item) => roleByKind.get(item.kind) === item.role);
  return [
    allKindsPlan.status === "ready_for_provider" && allKindsPlan.readyCount === 4 && allKindsPlan.blockedCount === 0
      ? pass("all_audio_kinds_ready", "Narration, BGM, ambience, and SFX all map to verified provider capabilities.")
      : fail("all_audio_kinds_ready", `Expected 4 ready items, got ${allKindsPlan.readyCount} ready and ${allKindsPlan.blockedCount} blocked.`),
    ["tts_narration", "bgm", "ambience", "sfx"].every((kind) => readyKinds.has(kind))
      ? pass("kind_coverage", "All generated-audio intent kinds are covered by ready requests.")
      : fail("kind_coverage", "Generated-audio mapping smoke must cover tts_narration, bgm, ambience, and sfx."),
    readyRequestKindsMatch
      ? pass("request_kind_identity", "Every provider request preserves the original generated-audio intent kind.")
      : fail("request_kind_identity", "One or more provider requests changed the generated-audio intent kind."),
    approvedTracks.length === 4 && approvedTracks.every((item) => item.status === "approved" && item.issueCount === 0)
      ? pass("output_validation_approves_safe_results", "Safe synthetic provider results become approved track summaries.")
      : fail("output_validation_approves_safe_results", "Expected every safe synthetic provider result to approve."),
    ["narration", "music", "ambience", "sfx"].every((role) => roles.has(role)) && roleMappingPass
      ? pass("mix_role_mapping", "Generated-audio kinds map to narration/music/ambience/SFX mix roles.")
      : fail("mix_role_mapping", "Generated-audio kind-to-role mapping is incomplete or incorrect."),
    scenarios.partialKindBoundary.plan.status === "partially_ready" && partialBlockedReasons.includes("kind_not_supported")
      ? pass("partial_ready_kind_boundary", "SFX remains blocked when the preferred provider only supports narration.")
      : fail("partial_ready_kind_boundary", "Expected partially_ready with kind_not_supported for unsupported SFX."),
    scenarios.providerPreferenceBinding.plan.status === "planned_only" && providerBlockedReasons.includes("provider_preference_unavailable")
      ? pass("provider_preference_binding", "Provider preference is binding and blocks instead of silently rerouting.")
      : fail("provider_preference_binding", "Expected provider_preference_unavailable when the preferred BGM provider is absent."),
    scenarios.durationBoundary.plan.status === "planned_only" && durationBlockedReasons.includes("duration_exceeds_capability")
      ? pass("duration_boundary", "Intent duration that exceeds capability is blocked before provider spend.")
      : fail("duration_boundary", "Expected duration_exceeds_capability for overlong SFX."),
    scenarios.outputValidation.kindMismatch.status === "rejected" &&
      scenarios.outputValidation.kindMismatch.issueCodes.includes("kind_mismatch") &&
      scenarios.outputValidation.kindMismatch.audioTrackCreated === false
      ? pass("kind_mismatch_rejected", "Output validation rejects kind-mismatched provider results before mixing.")
      : fail("kind_mismatch_rejected", "Expected kind_mismatch rejection without an audio track.")
  ];
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function unsafeTextFinding(text) {
  if (/https?:\/\//i.test(text)) return "url";
  if (/[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\//i.test(text)) return "path";
  if (/bearer\s+|api[_-]?key|secret|token|password|authorization/i.test(text)) return "credential";
  return undefined;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function round(value) {
  return Number(value.toFixed(3));
}

function optionalRound(value) {
  return value === undefined ? undefined : round(value);
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  return resolve(repoRoot, path).startsWith(repoRoot)
    ? resolve(repoRoot, path).slice(repoRoot.length + 1).replace(/\\/g, "/")
    : path;
}

main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
