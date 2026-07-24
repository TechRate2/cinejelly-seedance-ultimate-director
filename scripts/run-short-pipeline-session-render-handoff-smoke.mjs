#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-pipeline-session-render-handoff-smoke-report.json";
const defaultStorePath = "assets/output_deliverables/business-readiness/short-pipeline-session-render-handoff-smoke/sessions.json";

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

const clientAKey = "client-a-session-render-handoff-key-2026";
const clientBKey = "client-b-session-render-handoff-key-2026";
const port = 18_000 + Math.floor(Math.random() * 4_000);

process.env.PORT = String(port);
process.env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH = storePath;
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
  const created = await postJson(`${baseUrl}/v1/short-pipeline/conversation-sessions`, clientAHeaders, sessionRequestBody());
  const sessionId = created.body.session.sessionId;
  const visualBibleSession = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions`,
    clientAHeaders,
    visualBibleBlockedSessionRequestBody()
  );
  const visualBibleSessionId = visualBibleSession.body.session?.sessionId;
  const pending = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    clientAHeaders,
    {
      includeGeneratedAudioIntents: false,
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      },
      metadata: {
        smoke: "session_render_handoff_pending"
      }
    }
  );
  const approvedWithoutConfirm = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    clientAHeaders,
    {
      includeGeneratedAudioIntents: false,
      reviewApprovalGate: "pre_render",
      reviewApprovalCheckpoints: approvedCheckpoints(created.body.session.plan.reviewApproval.checkpoints),
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      }
    }
  );
  const planInputOverride = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    clientAHeaders,
    {
      planInput: {
        projectId: "malicious_override",
        userPrompt: "Replace the reviewed session plan with a new unreviewed prompt."
      },
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      }
    }
  );
  const unsafeApproved = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    clientAHeaders,
    {
      includeGeneratedAudioIntents: false,
      confirmRenderSubmission: true,
      reviewApprovalGate: "pre_render",
      reviewApprovalCheckpoints: approvedCheckpoints(
        created.body.session.plan.reviewApproval.checkpoints,
        "Unsafe smoke note includes https://example.invalid/audio.wav?token=secret and must be blocked."
      ),
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      },
      metadata: {
        smoke: "session_render_handoff_unsafe_review"
      }
    }
  );
  const visualBibleSessionRender = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(visualBibleSessionId)}/render-jobs`,
    clientAHeaders,
    {
      includeGeneratedAudioIntents: false,
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      },
      metadata: {
        smoke: "session_render_handoff_visual_bible_block"
      }
    }
  );
  const visualBibleDirectRender = await postJson(
    `${baseUrl}/v1/short-pipeline/render-jobs`,
    clientAHeaders,
    {
      planInput: productionBibleBlockedPlanInput(),
      includeGeneratedAudioIntents: false,
      settings: {
        qualityMode: "economy",
        resolution: "480p"
      },
      metadata: {
        smoke: "direct_render_handoff_visual_bible_block"
      }
    }
  );
  const clientBSubmit = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    clientBHeaders,
    {}
  );
  const jobs = await getJson(`${baseUrl}/v1/render-jobs`, clientAHeaders);
  const rawStore = readFileSync(storePath, "utf8");
  const rawLeakDetected = containsAny(rawStore, [
    "https://shop.example.com/products/glow-focus-serum",
    "https://cdn.example.com/glow-focus-serum",
    "api_key=secret",
    "token=secret",
    "C:\\Users\\Admin\\secret",
    "C:\\\\Users\\\\Admin\\\\secret"
  ]);
  const checks = [
    created.statusCode === 201 &&
      created.body.persisted === true &&
      created.body.session.sessionId === sessionId
      ? pass("conversation_session_created", "API creates a persisted redacted short-pipeline conversation session.")
      : fail("conversation_session_created", "Expected persisted session creation to return 201."),
    pending.statusCode === 202 &&
      pending.body.status === "paused_for_review" &&
      pending.body.shortPipeline?.sessionId === sessionId &&
      pending.body.shortPipelineSession?.sessionId === sessionId &&
      !pending.body.clientPolicyReservation &&
      !pending.body.workspaceBillingReservation
      ? pass("pending_review_pauses_before_spend", "Submitting a stored session without accepted checkpoints creates a paused render job and does not reserve spend.")
      : fail("pending_review_pauses_before_spend", "Expected pending review to pause before provider spend."),
    approvedWithoutConfirm.statusCode === 422 &&
      String(approvedWithoutConfirm.body.error ?? "").includes("confirmRenderSubmission=true")
      ? pass("approved_review_requires_explicit_confirm", "Approved formal review evidence cannot queue render from a session unless confirmRenderSubmission=true is present.")
      : fail("approved_review_requires_explicit_confirm", "Expected approved checkpoints without confirmRenderSubmission to return 422."),
    planInputOverride.statusCode === 400 &&
      String(planInputOverride.body.error ?? "").includes("must not include planInput")
      ? pass("stored_plan_cannot_be_replaced_client_side", "Render-from-session rejects client-supplied planInput so reviewed evidence stays bound to the stored server-side plan.")
      : fail("stored_plan_cannot_be_replaced_client_side", "Expected client-supplied planInput override to return 400."),
    unsafeApproved.statusCode === 202 &&
      unsafeApproved.body.status === "blocked" &&
      unsafeApproved.body.reviewApprovalStatus === "blocked" &&
      !unsafeApproved.body.clientPolicyReservation &&
      !unsafeApproved.body.workspaceBillingReservation
      ? pass("unsafe_review_blocks_session_handoff", "Unsafe approved-looking review evidence is blocked and does not reserve spend.")
      : fail("unsafe_review_blocks_session_handoff", "Expected unsafe review evidence to create a blocked job without spend reservation."),
    // SELF-SERVE self-generation (customer-journey blocker #1 fix): a customer picking a visual-bible
    // mode (Long / UGC / >=60s) must NOT dead-end — the render proceeds and the director's keyframe
    // stage self-generates the portraits/keyframes. So a visual-bible-gated session/direct render now
    // CREATES a job (not a 422 "assets not approved" wall). The no-spend planning contract still
    // reports canUseAsRenderJobHandoff=false (unchanged; asserted in run-short-pipeline-smoke).
    visualBibleSession.statusCode === 201 &&
      visualBibleSessionRender.statusCode === 202 &&
      Boolean(visualBibleSessionRender.body.jobId) &&
      !String(visualBibleSessionRender.body.error ?? "").includes("Visual Bible/reference assets")
      ? pass("session_visual_bible_self_serve_render_proceeds", "A visual-bible-gated stored session render now creates a job (keyframe stage self-generates the assets) instead of dead-ending the customer.")
      : fail("session_visual_bible_self_serve_render_proceeds", `Expected visual-bible session render to create a job, got ${visualBibleSessionRender.statusCode} ${JSON.stringify(visualBibleSessionRender.body).slice(0,160)}.`),
    visualBibleDirectRender.statusCode === 202 &&
      Boolean(visualBibleDirectRender.body.jobId) &&
      !String(visualBibleDirectRender.body.error ?? "").includes("Visual Bible/reference assets")
      ? pass("direct_visual_bible_self_serve_render_proceeds", "The direct short render-job API also proceeds for a visual-bible mode (self-generating assets), no customer dead-end.")
      : fail("direct_visual_bible_self_serve_render_proceeds", `Expected direct visual-bible render to create a job, got ${visualBibleDirectRender.statusCode} ${JSON.stringify(visualBibleDirectRender.body).slice(0,160)}.`),
    clientBSubmit.statusCode === 404
      ? pass("client_scope_prevents_cross_session_render", "A different client key cannot render from another client's stored session.")
      : fail("client_scope_prevents_cross_session_render", "Expected client B render-from-session to return 404."),
    Array.isArray(jobs.body.jobs) &&
      jobs.body.jobs.some((job) => job.jobId === pending.body.jobId && job.status === "paused_for_review") &&
      jobs.body.jobs.some((job) => job.jobId === unsafeApproved.body.jobId && job.status === "blocked")
      ? pass("render_jobs_visible_to_owner", "Owner client can list the paused and blocked render jobs created from its session.")
      : fail("render_jobs_visible_to_owner", "Expected owner job list to include paused and blocked session handoff jobs."),
    !rawLeakDetected
      ? pass("session_store_stays_redacted", "Session store remains free of raw URLs, local paths, and secret-like values during render handoff.")
      : fail("session_store_stays_redacted", "Expected session store to remain redacted after render handoff.")
  ];

  report = {
    schemaVersion: "cinejelly.short-pipeline-session-render-handoff-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    noSpend: true,
    localHttpCallsMade: true,
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
        "POST /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs",
        "GET /v1/render-jobs"
      ],
      sessionId,
      visualBibleSessionId,
      pendingJobId: pending.body.jobId,
      unsafeReviewJobId: unsafeApproved.body.jobId,
      approvedWithoutConfirmStatusCode: approvedWithoutConfirm.statusCode,
      planInputOverrideStatusCode: planInputOverride.statusCode,
      visualBibleSessionRenderStatusCode: visualBibleSessionRender.statusCode,
      visualBibleDirectRenderStatusCode: visualBibleDirectRender.statusCode,
      clientIsolationCheckPassed: clientBSubmit.statusCode === 404,
      rawUrlLeakCheckPassed: !rawLeakDetected,
      localPathLeakCheckPassed: !rawLeakDetected,
      spendReservationCreated: Boolean(pending.body.clientPolicyReservation || unsafeApproved.body.clientPolicyReservation)
    },
    scenarios: {
      pendingSessionRender: {
        statusCode: pending.statusCode,
        jobStatus: pending.body.status,
        reviewApprovalStatus: pending.body.reviewApprovalStatus,
        queuedForProviderSpend: pending.body.status === "queued",
        hasReservation: Boolean(pending.body.clientPolicyReservation || pending.body.workspaceBillingReservation)
      },
      approvedWithoutConfirmation: {
        statusCode: approvedWithoutConfirm.statusCode,
        blockedBeforeJobCreation: approvedWithoutConfirm.statusCode === 422
      },
      planInputOverride: {
        statusCode: planInputOverride.statusCode,
        blockedBeforeJobCreation: planInputOverride.statusCode === 400
      },
      unsafeApprovedReview: {
        statusCode: unsafeApproved.statusCode,
        jobStatus: unsafeApproved.body.status,
        reviewApprovalStatus: unsafeApproved.body.reviewApprovalStatus,
        hasReservation: Boolean(unsafeApproved.body.clientPolicyReservation || unsafeApproved.body.workspaceBillingReservation)
      },
      visualBibleAssetGate: {
        sessionCreateStatusCode: visualBibleSession.statusCode,
        sessionRenderStatusCode: visualBibleSessionRender.statusCode,
        directRenderStatusCode: visualBibleDirectRender.statusCode,
        sessionBlockedBeforeJobCreation: visualBibleSessionRender.statusCode === 422,
        directBlockedBeforeJobCreation: visualBibleDirectRender.statusCode === 422
      },
      clientIsolation: {
        clientBStatusCode: clientBSubmit.statusCode,
        ownerVisibleJobCount: jobs.body.jobs?.length ?? 0
      }
    },
    checks,
    releaseGateSummary: {
      shortPipelineSessionRenderHandoffSmokePass: checks.every((check) => check.status === "pass"),
      canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Session render handoff smoke proves stored-session review gating and explicit confirmation boundaries only; live paid render, artifact validation, manual media review, deployment evidence, and business-readiness approval remain separate gates."
    },
    nextActions: [
      "Use this route from the future Review UI so user-approved session plans enter render jobs without rebuilding plans client-side.",
      "Run live short-pipeline render validation only after accepted formal review evidence, explicit spend confirmation, and an approved budget.",
      "Keep session render handoff under report-contract validation so UI/backend integrations cannot bypass confirmation or client scope."
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

function sessionRequestBody() {
  const generatedAt = "2026-06-19T00:00:00.000Z";
  return {
    projectId: "short_pipeline_session_render_handoff_smoke",
    requestId: "req_short_pipeline_session_render_handoff_001",
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
        text: "Make it educational, keep custom workflow possible, and require formal scene/audio/no-visible-text/claim review before spend."
      }
    ],
    product: {
      productUrl: "https://shop.example.com/products/glow-focus-serum",
      snapshot: {
        productTitle: "Glow Focus Serum",
        category: "beauty",
        metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
        priceText: "$39",
        imageUrls: ["https://cdn.example.com/glow-focus-serum/front.jpg?token=secret"],
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
    targetPlatform: "tiktok",
    targetDurationSeconds: 28
  };
}

function visualBibleBlockedSessionRequestBody() {
  return {
    ...sessionRequestBody(),
    requestId: "req_short_pipeline_session_render_handoff_visual_bible_001",
    userPrompt: "Create a premium UGC short, but require a reference board before render spend so KOL identity and product anchors are approved first.",
    visualBible: {
      mode: "reference_board",
      imageProviderPolicy: "provider_neutral",
      requireBeforeRender: true
    }
  };
}

function productionBibleBlockedPlanInput() {
  return {
    ...sessionRequestBody(),
    projectId: "short_pipeline_direct_visual_bible_gate_smoke",
    requestId: "req_short_pipeline_direct_production_bible_gate_001",
    userPrompt: "Create a 90 second branded mini sequence with recurring KOL identity, stable product proof beats, and approved sequence boards before render.",
    targetDurationSeconds: 90,
    visualBible: {
      mode: "production_bible",
      imageProviderPolicy: "provider_neutral",
      requireBeforeRender: true
    }
  };
}

function approvedCheckpoints(checkpoints, notes = "Approved for session render handoff smoke.") {
  return checkpoints.map((checkpoint) => ({
    surface: checkpoint.surface,
    label: checkpoint.label,
    ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
    required: checkpoint.required,
    decision: "approved",
    reviewer: "Commercial reviewer",
    reviewedAt: "2026-06-19T00:05:00.000Z",
    notes,
    issueCodes: [],
    evidence: {
      smoke: "short_pipeline_session_render_handoff"
    }
  }));
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server listener is ready.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Local API server did not become ready for session render handoff smoke.");
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
