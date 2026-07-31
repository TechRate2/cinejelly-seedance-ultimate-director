#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-pipeline-session-store-smoke-report.json";
const defaultStorePath = "assets/output_deliverables/business-readiness/short-pipeline-session-store-smoke/sessions.json";

function parseArgs(args) {
  const options = { outputPath: defaultOutput, storePath: defaultStorePath, writeReport: true };
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
    if (arg === "--store") {
      options.storePath = readRequiredValue(args, index, arg);
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
if (extname(options.storePath).toLowerCase() !== ".json") {
  throw new Error("--store must point to a JSON file.");
}
assertSmokeStorePath(options.storePath, "--store", dirname(defaultStorePath));

const storePath = resolve(repoRoot, options.storePath);
rmSync(dirname(storePath), { recursive: true, force: true });
mkdirSync(dirname(storePath), { recursive: true });

function assertSmokeStorePath(path, flag, allowedDir) {
  if (isAbsolute(path)) {
    throw new Error(`${flag} must be repo-relative so smoke cleanup cannot remove files outside the workspace.`);
  }
  const absolutePath = resolve(repoRoot, path);
  const relativeToRepo = relative(repoRoot, absolutePath);
  if (relativeToRepo.startsWith("..") || isAbsolute(relativeToRepo)) {
    throw new Error(`${flag} must stay inside the repository workspace.`);
  }
  const absoluteAllowedDir = resolve(repoRoot, allowedDir);
  const parentDir = dirname(absolutePath);
  const relativeToAllowedDir = relative(absoluteAllowedDir, parentDir);
  if (relativeToAllowedDir && (relativeToAllowedDir.startsWith("..") || isAbsolute(relativeToAllowedDir))) {
    throw new Error(`${flag} parent directory must stay inside ${allowedDir} so smoke cleanup cannot remove unrelated files.`);
  }
}

const { ShortPipelineConversationEngine } = await import("../dist/core/short-pipeline-conversation.js");
const { ShortPipelineSessionStore } = await import("../dist/api/short-pipeline-session-store.js");

const generatedAt = new Date("2026-06-19T00:00:00.000Z");
const engine = new ShortPipelineConversationEngine();
const product = {
  productUrl: "https://shop.example.com/products/glow-focus-serum?api_key=secret",
  snapshot: {
    productTitle: "Glow Focus Serum",
    category: "beauty",
    metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
    priceText: "$39",
    imageUrls: [
      "https://cdn.example.com/glow-focus-serum/front.jpg?token=secret",
      "https://cdn.example.com/glow-focus-serum/texture.jpg"
    ],
    benefits: [
      "Visibly improves dull-looking skin in daily routines",
      "Lightweight texture layers cleanly under makeup"
    ],
    claims: [
      "Visibly improves dull-looking skin"
    ],
    targetBuyer: "busy skincare buyers",
    cta: "Shop now"
  }
};
const brandKit = {
  brandId: "glow_lab",
  brandName: "Glow Lab",
  tone: "premium but warm",
  language: "en",
  visualStyle: "clean macro beauty with soft highlights",
  colorPalette: ["#f7e8df", "#222222", "#ffffff"],
  allowedClaims: ["visibly improves dull-looking skin"],
  forbiddenClaims: ["cures acne overnight"],
  ctaRules: ["Use one CTA only"],
  voicePreferences: ["calm confident narration"]
};

const session = engine.buildSession({
  projectId: "short_pipeline_session_store_smoke",
  requestId: "req_short_pipeline_session_store_001",
  generatedAt,
  messages: [
    {
      role: "user",
      createdAt: generatedAt,
      text: "Create a premium TikTok product ad. Product page is https://shop.example.com/products/glow-focus-serum?api_key=secret and local draft is C:\\Users\\Admin\\secret\\draft.txt."
    },
    {
      role: "user",
      createdAt: generatedAt,
      text: "Revise it to be more educational, avoid templates, and keep formal scene/audio/no-visible-text/claim approval before spend."
    }
  ],
  product,
  brandKit,
  targetPlatform: "tiktok",
  targetDurationSeconds: 28
});

const store = new ShortPipelineSessionStore({ storePath, maxSessions: 20 });
const saved = store.saveSession(session, { clientId: "client_a" });
const rawStore = readFileSync(storePath, "utf8");
const restoredStore = new ShortPipelineSessionStore({ storePath, maxSessions: 20 });
const restoredRecords = restoredStore.loadRecords();
const listForClientA = restoredStore.list({ clientId: "client_a" });
const listForClientB = restoredStore.list({ clientId: "client_b" });
const detailForClientA = restoredStore.get(session.sessionId, { clientId: "client_a" });
const detailForClientB = restoredStore.get(session.sessionId, { clientId: "client_b" });
const invalidDetail = restoredStore.get("not-a-session-id", { clientId: "client_a" });

const rawLeakDetected = containsAny(rawStore, [
  "https://shop.example.com/products/glow-focus-serum",
  "https://cdn.example.com/glow-focus-serum",
  "api_key=secret",
  "token=secret",
  "C:\\Users\\Admin\\secret",
  "C:\\\\Users\\\\Admin\\\\secret"
]);
const savedSessionText = JSON.stringify(saved.session);
const safeSessionShape =
  saved.session.rawTranscriptStored === false &&
  saved.session.noSpend === true &&
  saved.session.networkCallsMade === false &&
  saved.session.providerCallsMade === false;

const checks = [
  saved.sessionId === session.sessionId &&
    restoredRecords.length === 1 &&
    restoredRecords[0]?.sessionId === session.sessionId
    ? pass("save_reload_round_trip", "Durable store writes one redacted session and reloads it with stable session identity.")
    : fail("save_reload_round_trip", "Expected the persisted session to reload with stable identity."),
  listForClientA.length === 1 &&
    detailForClientA?.sessionId === session.sessionId &&
    listForClientB.length === 0 &&
    detailForClientB === undefined &&
    invalidDetail === undefined
    ? pass("client_scope_isolation", "Client-scoped list/detail reads only return sessions owned by the presented client key.")
    : fail("client_scope_isolation", "Expected client B and invalid session lookups to return no records."),
  safeSessionShape &&
    !rawLeakDetected &&
    !savedSessionText.includes("https://shop.example.com/products/glow-focus-serum") &&
    !savedSessionText.includes("C:\\Users\\Admin\\secret") &&
    !savedSessionText.includes("api_key=secret")
    ? pass("redacted_public_session_only", "The persisted payload keeps no-spend public session evidence and excludes raw transcript, raw URLs, local paths, and secret-like values.")
    : fail("redacted_public_session_only", "Expected the store to redact raw transcript, URLs, local paths, and secret-like values."),
  listForClientA[0]?.rawTranscriptStored === false &&
    listForClientA[0]?.noSpend === true &&
    listForClientA[0]?.networkCallsMade === false &&
    listForClientA[0]?.providerCallsMade === false &&
    listForClientA[0]?.canReleaseToCustomerTraffic === false &&
    listForClientA[0]?.turnCount === 2
    ? pass("summary_contract_is_commercial_safe", "Session summaries expose only safe operational fields for future UI list views.")
    : fail("summary_contract_is_commercial_safe", "Expected summary fields to remain no-spend, no-network, and customer-traffic blocked."),
  saved.session.plan?.reviewApproval?.status === "approval_required" &&
    saved.session.releaseGateSummary?.canRenderAfterFormalApproval === false
    ? pass("formal_review_gate_preserved", "Persisting a session does not weaken formal scene/audio/no-visible-text/claim approval gates.")
    : fail("formal_review_gate_preserved", "Expected formal approval gates to remain required after persistence.")
];

const report = {
  schemaVersion: "cinejelly.short-pipeline-session-store-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  sourcePatternOrigins: [
    "calesthio/OpenMontage",
    "HKUDS/ViMax",
    "HKUDS/VideoAgent",
    "video-db/Director",
    "vericontext/vibeframe"
  ],
  checkedInputs: {
    outputPath: options.outputPath,
    storePath: options.storePath,
    endpointPaths: [
      "POST /v1/short-pipeline/conversation-sessions",
      "GET /v1/short-pipeline/conversation-sessions",
      "GET /v1/short-pipeline/conversation-sessions/{sessionId}"
    ],
    persistedRecordCount: restoredRecords.length,
    clientIsolationCheckPassed: listForClientA.length === 1 && listForClientB.length === 0 && detailForClientB === undefined,
    rawTranscriptLeakCheckPassed: !rawLeakDetected,
    rawUrlLeakCheckPassed: !rawLeakDetected,
    localPathLeakCheckPassed: !rawLeakDetected
  },
  scenarios: {
    savedSession: {
      sessionId: saved.sessionId,
      projectId: saved.projectId,
      clientId: saved.clientId,
      turnCount: Array.isArray(saved.session.turns) ? saved.session.turns.length : 0,
      rawTranscriptStored: saved.session.rawTranscriptStored,
      planStatus: saved.session.plan?.status,
      reviewApprovalStatus: saved.session.plan?.reviewApproval?.status,
      userReviewState: saved.session.analysis?.userReviewState,
      templatePreference: saved.session.analysis?.templatePreference,
      canRenderAfterFormalApproval: saved.session.releaseGateSummary?.canRenderAfterFormalApproval,
      canReleaseToCustomerTraffic: saved.session.releaseGateSummary?.canReleaseToCustomerTraffic
    },
    clientScopedList: {
      clientAVisibleCount: listForClientA.length,
      clientBVisibleCount: listForClientB.length,
      invalidLookupVisible: invalidDetail !== undefined
    }
  },
  checks,
  releaseGateSummary: {
    shortPipelineSessionStoreSmokePass: checks.every((check) => check.status === "pass"),
    canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
    canReleaseToCustomerTraffic: false,
    releaseBlocker: "Durable session storage is backend evidence for future UI continuity only; customer traffic still requires HTTPS deployment, real provider evidence, manual media review, billing/customer workspace controls, and release operations attestations."
  },
  nextActions: [
    "Wire the durable session routes into the first-party Create Video and Review UI once commercial-core backend gates are closed.",
    "Back the session store with managed storage in production if multiple API instances are deployed.",
    "Keep raw transcript retention, if ever needed, in a separate encrypted operator-owned store outside public evidence."
  ]
};

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
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
