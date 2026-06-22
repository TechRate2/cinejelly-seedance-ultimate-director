#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json";
const defaultStyleStorePath = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke/channel-styles.json";
const defaultSessionStorePath = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke/sessions.json";

function parseArgs(args) {
  const options = {
    outputPath: defaultOutput,
    styleStorePath: defaultStyleStorePath,
    sessionStorePath: defaultSessionStorePath,
    writeReport: true
  };
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
    if (arg === "--style-store") {
      options.styleStorePath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--session-store") {
      options.sessionStorePath = readRequiredValue(args, index, arg);
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
for (const path of [options.outputPath, options.styleStorePath, options.sessionStorePath]) {
  if (extname(path).toLowerCase() !== ".json") {
    throw new Error("All output/store paths must point to JSON files.");
  }
}

const styleStorePath = resolve(repoRoot, options.styleStorePath);
const sessionStorePath = resolve(repoRoot, options.sessionStorePath);
rmSync(dirname(styleStorePath), { recursive: true, force: true });
mkdirSync(dirname(styleStorePath), { recursive: true });

const clientAKey = "client-a-short-mvp-ui-key-2026";
const clientBKey = "client-b-short-mvp-ui-key-2026";
const port = 22_000 + Math.floor(Math.random() * 4_000);

process.env.PORT = String(port);
process.env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH = styleStorePath;
process.env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH = sessionStorePath;
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_CLIENTS_JSON = JSON.stringify([
  { clientId: "client_a", keySha256: sha256(clientAKey), enabled: true },
  { clientId: "client_b", keySha256: sha256(clientBKey), enabled: true }
]);

const { startServer } = await import("../dist/api/server.js");
const server = startServer(port);
const baseUrl = `http://127.0.0.1:${port}`;
const clientAHeaders = {
  "Content-Type": "application/json",
  "X-CineJelly-Api-Key": clientAKey
};
const clientBHeaders = {
  "Content-Type": "application/json",
  "X-CineJelly-Api-Key": clientBKey
};

let report;
try {
  await waitForHealth(baseUrl);

  const savedStyle = await postJson(`${baseUrl}/v1/short-pipeline/channel-styles`, clientAHeaders, channelStyleBody());
  const profileId = savedStyle.body.channelStyle?.profileId;
  const listA = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles`, clientAHeaders);
  const detailA = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles/${encodeURIComponent(profileId)}`, clientAHeaders);
  const detailB = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles/${encodeURIComponent(profileId)}`, clientBHeaders);
  const uiContract = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, planBody(profileId));
  const bothStyleSources = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, {
    ...planBody(profileId),
    channelStyle: channelStyleBody()
  });
  const clientBPlan = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientBHeaders, planBody(profileId));
  const createdSession = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions`,
    clientAHeaders,
    conversationBody(profileId)
  );
  const sessionId = createdSession.body.session?.sessionId;
  const sessionUi = await getJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/ui-contract`,
    clientAHeaders
  );
  const rawStyleStore = readFileSync(styleStorePath, "utf8");
  const rawSessionStore = readFileSync(sessionStorePath, "utf8");
  const rawLeakDetected = containsAny(`${rawStyleStore}\n${rawSessionStore}`, [
    "C:\\Users\\Admin",
    "api_key=secret",
    "token=secret",
    "sk-secret",
    "Bearer secret"
  ]);
  const ui = uiContract.body.uiContract;
  const sessionUiContract = sessionUi.body.uiContract;
  const checks = [
    savedStyle.statusCode === 201 &&
      savedStyle.body.persisted === true &&
      savedStyle.body.channelStyle?.status === "ready" &&
      savedStyle.body.storedChannelStyle?.canReuseAcrossScripts === true
      ? pass("channel_style_saved", "API stores a ready reusable channel style profile for the authenticated client.")
      : fail("channel_style_saved", "Expected channel style profile to persist as ready."),
    listA.body.channelStyles?.length === 1 &&
      detailA.statusCode === 200 &&
      detailB.statusCode === 404
      ? pass("channel_style_client_isolation", "Client-scoped style list/detail prevents another client from reading the profile.")
      : fail("channel_style_client_isolation", "Expected client B to receive 404 for client A profile."),
    uiContract.statusCode === 200 &&
      ui?.schemaVersion === "cinejelly.short-mvp-ui-contract.v1" &&
      ui?.channelStyle?.profileId === profileId &&
      ui?.duration?.recommendedWorkflowMode === "storyboard_multishot" &&
      ui?.render?.canCreateRenderJob === true &&
      ui?.render?.canSubmitToProviderNow === false &&
      ui?.backendManagedSteps?.some((step) => step.actionId === "final_mp4_assembly" && step.status === "ready")
      ? pass("ui_contract_hydrates_style_profile", "UI contract hydrates channelStyleProfileId, recommends storyboard for 28s, and keeps provider spend disabled.")
      : fail("ui_contract_hydrates_style_profile", "Expected UI contract to hydrate profileId and expose safe render controls."),
    bothStyleSources.statusCode === 400 &&
      String(bothStyleSources.body.error ?? "").includes("either channelStyle or channelStyleProfileId")
      ? pass("ambiguous_style_source_blocked", "Backend rejects requests that send both inline channelStyle and channelStyleProfileId.")
      : fail("ambiguous_style_source_blocked", "Expected ambiguous style source request to be rejected."),
    clientBPlan.statusCode === 404
      ? pass("cross_client_profile_use_blocked", "Client B cannot use client A channelStyleProfileId in plan/UI contract creation.")
      : fail("cross_client_profile_use_blocked", "Expected cross-client profile use to be blocked."),
    createdSession.statusCode === 201 &&
      sessionUi.statusCode === 200 &&
      sessionUiContract?.channelStyle?.profileId === profileId &&
      sessionUiContract?.outputContract?.finalMp4AssemblyManagedByBackend === true
      ? pass("session_ui_contract_available", "Stored conversation session exposes a UI contract with channel style and final assembly contract.")
      : fail("session_ui_contract_available", "Expected stored session UI contract to be available."),
    !rawLeakDetected
      ? pass("library_and_session_store_no_secret_leak", "Style/session stores do not contain local paths or secret-like values.")
      : fail("library_and_session_store_no_secret_leak", "Expected stores to remain free of local paths and secret-like values.")
  ];

  report = {
    schemaVersion: "cinejelly.short-mvp-ui-contract-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    noSpend: true,
    localHttpCallsMade: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins: [
      "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects-by-hereandnow-ai",
      "nirdiamant/genai_agents:ContentIntelligence",
      "gswithjeff/autogen-multi-agent-workflow",
      "YouMind-OpenLab/awesome-seedance-2-prompts",
      "ZeroLu/awesome-seedance",
      "calesthio/OpenMontage",
      "vericontext/vibeframe"
    ],
    checkedInputs: {
      outputPath: options.outputPath,
      styleStorePath: options.styleStorePath,
      sessionStorePath: options.sessionStorePath,
      endpointPaths: [
        "POST /v1/short-pipeline/channel-styles",
        "GET /v1/short-pipeline/channel-styles",
        "GET /v1/short-pipeline/channel-styles/{profileId}",
        "POST /v1/short-pipeline/ui-contract",
        "GET /v1/short-pipeline/conversation-sessions/{sessionId}/ui-contract"
      ],
      profileId,
      sessionId,
      clientIsolationCheckPassed: detailB.statusCode === 404 && clientBPlan.statusCode === 404,
      secretLeakCheckPassed: !rawLeakDetected
    },
    scenarios: {
      savedStyle: {
        profileId,
        status: savedStyle.body.channelStyle?.status,
        anchorCount: savedStyle.body.channelStyle?.styleAnchors?.length ?? 0,
        canReuseAcrossScripts: savedStyle.body.channelStyle?.memoryPolicy?.canReuseAcrossScripts,
        requiresRightsReview: savedStyle.body.channelStyle?.memoryPolicy?.requiresRightsReview
      },
      uiContract: {
        recommendedWorkflowMode: ui?.duration?.recommendedWorkflowMode,
        workflowControlCount: ui?.workflowControls?.length ?? 0,
        backendManagedStepCount: ui?.backendManagedSteps?.length ?? 0,
        userRequiredActionCount: ui?.userRequiredActions?.length ?? 0,
        canCreateRenderJob: ui?.render?.canCreateRenderJob,
        canSubmitToProviderNow: ui?.render?.canSubmitToProviderNow,
        finalMp4AssemblyManagedByBackend: ui?.outputContract?.finalMp4AssemblyManagedByBackend
      },
      sessionUiContract: {
        sessionId,
        profileId: sessionUiContract?.channelStyle?.profileId,
        readyForUiMvpIntegration: sessionUiContract?.releaseGateSummary?.readyForUiMvpIntegration,
        canReleaseToCustomerTraffic: sessionUiContract?.releaseGateSummary?.canReleaseToCustomerTraffic
      }
    },
    checks,
    releaseGateSummary: {
      shortMvpUiContractSmokePass: checks.every((check) => check.status === "pass"),
      canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
      readyForUiMvpIntegration: ui?.releaseGateSummary?.readyForUiMvpIntegration === true,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Short MVP UI contract is backend integration evidence only; paid Short render validation, artifact validation, manual media review, billing/workspace controls, and release approval remain separate gates."
    },
    nextActions: [
      "Build Create Video UI against the UI contract instead of duplicating backend workflow rules in the frontend.",
      "Use channelStyleProfileId for channel-building workflows with recurring characters, voice, setting, captions, and editing style.",
      "Run one paid 30-45s Short multishot validation after UI review wiring is ready."
    ]
  };
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function channelStyleBody() {
  return {
    channelId: "glow_lab_tiktok",
    channelName: "Glow Lab TikTok",
    seriesName: "Morning Proof Desk",
    audience: "busy skincare buyers who want credible quick routines",
    niche: "beauty ecommerce UGC ads",
    positioning: "premium but warm proof-led product explainers",
    contentPillars: ["ingredient clarity", "routine proof", "buyer objections"],
    visualStyle: "clean macro skincare table, soft highlights, product visible in first second",
    editingRhythm: "fast hook, proof close-up, calm demo, one CTA",
    captionStyle: "short premium captions with one proof idea per beat",
    musicStyle: "soft upbeat lo-fi pulse under narration",
    characters: [
      {
        characterId: "mina_host",
        name: "Mina",
        role: "trusted skincare reviewer",
        visualDescription: "late-20s creator with neat black bob, cream cardigan, warm direct eye contact",
        personality: "calm, precise, friendly",
        wardrobe: "cream cardigan and simple gold earrings",
        mustPreserve: ["black bob", "cream cardigan", "calm proof-led delivery"],
        avoid: ["overexcited hype", "medical claims"],
        referenceAssetIds: ["asset://channel/glow-lab/mina-face"]
      }
    ],
    voices: [
      {
        voiceId: "voice_mina_warm_en",
        label: "Mina warm English",
        language: "en",
        voiceStyle: "warm calm UGC narration",
        pacing: "quick but trustworthy",
        catchphrases: ["proof, not hype"],
        doNotSay: ["cures", "guaranteed"],
        referenceAssetIds: ["asset://channel/glow-lab/mina-voice"]
      }
    ],
    settings: [
      {
        settingId: "morning_vanity",
        label: "morning vanity desk",
        visualDescription: "bright bathroom vanity with clean product tray and soft daylight",
        lighting: "soft morning side light",
        colorMood: "warm white, clean peach, charcoal text",
        recurringProps: ["glass tray", "white towel", "small mirror"],
        referenceAssetIds: ["asset://channel/glow-lab/vanity-set"]
      }
    ],
    reusableAssets: [
      {
        assetId: "asset://channel/glow-lab/mina-face",
        uri: "asset://channel/glow-lab/mina-face",
        kind: "character_reference",
        label: "Mina face reference",
        rightsStatus: "operator_approved"
      },
      {
        assetId: "asset://channel/glow-lab/vanity-set",
        uri: "asset://channel/glow-lab/vanity-set",
        kind: "setting_reference",
        label: "Vanity set",
        rightsStatus: "operator_approved"
      }
    ],
    styleRules: ["Product appears in first second", "Keep proof specific and claim-reviewed"],
    doNotChange: ["Mina host identity", "warm proof-led tone", "morning vanity setting"],
    avoidPatterns: ["hard-sell countdowns", "medical promises", "generic stock footage"]
  };
}

function planBody(profileId) {
  return {
    projectId: "short_mvp_ui_contract_smoke",
    requestId: "req_short_mvp_ui_contract_001",
    userPrompt: "Create a 28 second TikTok UGC review ad for Glow Focus Serum. Keep it custom, proof-led, and easy to approve in UI.",
    product: {
      productUrl: "https://shop.example.com/products/glow-focus-serum",
      snapshot: {
        productTitle: "Glow Focus Serum",
        category: "beauty",
        metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
        priceText: "$39",
        imageUrls: ["https://cdn.example.com/glow-focus-serum/front.jpg"],
        benefits: ["Visibly improves dull-looking skin in daily routines"],
        claims: ["Visibly improves dull-looking skin"],
        targetBuyer: "busy skincare buyers",
        cta: "Shop now"
      }
    },
    brandKit: {
      brandId: "glow_lab",
      brandName: "Glow Lab",
      tone: "premium but warm",
      language: "en",
      visualStyle: "clean macro beauty",
      allowedClaims: ["visibly improves dull-looking skin"],
      forbiddenClaims: ["cures acne overnight"],
      ctaRules: ["Use one CTA only"]
    },
    channelStyleProfileId: profileId,
    targetPlatform: "tiktok",
    targetDurationSeconds: 28
  };
}

function conversationBody(profileId) {
  return {
    ...planBody(profileId),
    messages: [
      {
        role: "user",
        text: "Make this a proof-led UGC review with our recurring Mina host and morning vanity setup."
      }
    ]
  };
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server listener is ready.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Local API server did not become ready for short MVP UI contract smoke.");
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
