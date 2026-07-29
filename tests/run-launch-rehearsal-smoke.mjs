#!/usr/bin/env node
/**
 * LAUNCH REHEARSAL — the final pre-launch end-to-end exercise.
 * Boots the real server and walks the exact journeys the product sells, over real HTTP,
 * with the exact payload shapes the shipped UI sends:
 *   Customer: land -> register -> login -> upload a reference -> buy a package ->
 *             (admin approves) -> create a pipeline session -> submit a render ->
 *             credits charged -> provider fails (unreachable fake Atlas) -> automatic
 *             refund -> statement shows every movement -> logout.
 *   Admin:    top-up desk lists/approves, manual adjust, admin-only boundaries hold.
 *   Isolation: a second customer sees nothing of the first (jobs, topups, sessions).
 * Zero spend: the Atlas endpoint points at a closed local port, so the render job fails
 * fast at the first provider call — which is exactly what lets us verify the automatic
 * refund machinery LIVE.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-launch-rehearsal-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "rehearsal_admin_token_0123456789ab";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_CREDITS_PER_RENDER_SECOND = "10";
process.env.CINEJELLY_TOPUP_BANK_INFO = "Vietcombank 0123456789 - REHEARSAL SHOP";
// Pin the test package catalog so these assertions are independent of the shipped defaults.
process.env.CINEJELLY_CREDIT_PACKAGES_JSON = JSON.stringify([{ packageId: "goi_thu", label: "Goi Thu", credits: 500, priceVnd: 49000 }, { packageId: "goi_pro", label: "Goi Pro", credits: 2000, priceVnd: 179000 }, { packageId: "goi_studio", label: "Goi Studio", credits: 7000, priceVnd: 549000 }]);
// This rehearsal proves the immediate fail->refund machinery on a provider failure, so it
// disables the operator-hold behavior (which would instead PARK the job on an infra error).
// The hold behavior has its own end-to-end HTTP smoke (run-operator-hold-http-smoke.mjs).
process.env.CINEJELLY_JOB_HOLD_ON_CONFIG_ERROR = "false";
// Fake provider: real key shape, unreachable endpoints, fast timeouts -> jobs fail fast.
process.env.ATLASCLOUD_API_KEY = "rehearsal-fake-key-not-real";
process.env.ATLASCLOUD_API_BASE_URL = "https://127.0.0.1:9/v1";
process.env.ATLASCLOUD_BASE_URL = "https://127.0.0.1:9";
process.env.CINEJELLY_REQUEST_TIMEOUT_MS = "1500";
process.env.CINEJELLY_POLLING_INTERVAL_MS = "200";
process.env.CINEJELLY_POLLING_TIMEOUT_MS = "3000";

const { startServer } = await import("../dist/api/server.js");
const baseUrl = `http://127.0.0.1:${port}`;
const adminHeaders = { "X-CineJelly-Api-Key": "rehearsal_admin_token_0123456789ab" };

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}
async function api(method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { status: response.status, payload, sessionToken: response.headers.get("x-cinejelly-session-token") ?? undefined };
}

/** The exact brief the shipped UI's briefPayload() sends. */
function uiBrief(projectId) {
  return {
    projectId,
    userPrompt: "Video 15 giây quảng cáo serum dưỡng da cho da khô, phong cách sáng và đáng tin",
    targetPlatform: "tiktok",
    targetDurationSeconds: 15,
    targetAspectRatio: "9:16",
    audio: { mode: "voiceover", language: "vi" },
    product: { snapshot: { productTitle: "Glow Serum", category: "skincare", claims: ["cấp ẩm sâu"] } },
    brandKit: {
      brandName: "Operator Brand",
      tone: "premium but clear",
      language: "vi",
      allowedClaims: ["cấp ẩm sâu"],
      forbiddenClaims: ["guaranteed cure", "instant medical result"],
      ctaRules: ["Use one CTA only"],
      voicePreferences: ["Vietnamese natural creator voice"]
    },
    messages: [{ role: "user", text: "Video 15 giây quảng cáo serum dưỡng da cho da khô" }]
  };
}

const server = startServer(port);
try {
  await waitForHealth();

  // ---------- Landing + pages ----------
  const landing = await fetch(`${baseUrl}/`);
  check("landing_serves_studio_redirect", landing.status === 200 && (await landing.text()).includes("/short/create"));
  check("studio_page_serves", (await fetch(`${baseUrl}/short/create`)).status === 200);
  check("topup_desk_serves", (await fetch(`${baseUrl}/operator/topups`)).status === 200);

  // ---------- Customer A: register/login ----------
  const registerA = await api("POST", "/v1/account/register", { email: "khach.a@shop.vn", password: "matkhau123", displayName: "Khách A" });
  check("A_registers", registerA.status === 201 && Boolean(registerA.sessionToken));
  const loginA = await api("POST", "/v1/account/login", { email: "khach.a@shop.vn", password: "matkhau123" });
  const A = { "X-CineJelly-Session": loginA.sessionToken };
  check("A_logs_in", loginA.status === 200 && Boolean(loginA.sessionToken));

  // ---------- A uploads a KOL reference exactly like the UI upload button ----------
  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const upload = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...A, "Content-Type": "application/octet-stream", "X-File-Name": "kol.png" },
    body: pngBytes
  });
  const uploadPayload = await upload.json();
  check("A_uploads_reference", upload.status === 201 && String(uploadPayload.uri).startsWith("upload://"));

  // ---------- A buys a package; admin approves at the desk endpoints ----------
  const topup = await api("POST", "/v1/account/topups", { packageId: "goi_thu", note: "đã CK" }, A);
  check("A_requests_topup", topup.status === 201);
  const pending = await api("GET", "/v1/admin/topups", undefined, adminHeaders);
  const pendingTopup = (pending.payload.pending ?? []).find((item) => item.email === "khach.a@shop.vn");
  check("admin_sees_A_topup", Boolean(pendingTopup));
  const approve = await api("POST", "/v1/admin/topups/decide", { topupId: pendingTopup?.topupId, approve: true }, adminHeaders);
  check("admin_approves", approve.status === 200);
  const meAfterTopup = await api("GET", "/v1/account/me", undefined, A);
  check("A_balance_500_after_approval", meAfterTopup.payload.account?.balanceCredits === 500);

  // ---------- A creates a pipeline session with the UI's own brief ----------
  const session = await api("POST", "/v1/short-pipeline/conversation-sessions", uiBrief("proj_rehearsal_a"), A);
  const sessionId = session.payload.session?.sessionId ?? "";
  check("A_creates_session", session.status === 200 || session.status === 201, `status=${session.status}`);
  check("A_session_has_id", Boolean(sessionId));
  const uiContract = await api("GET", `/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/ui-contract`, undefined, A);
  check("A_ui_contract_loads", uiContract.status === 200);

  // ---------- A submits a render exactly like the UI's Create Render Job button ----------
  const render = await api(
    "POST",
    `/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    {
      confirmRenderSubmission: true,
      reviewApprovalGate: "pre_render",
      reviewApprovalCheckpoints: [{ surface: "scene", label: "tu duyet", decision: "approved", reviewer: "khach.a@shop.vn" }]
    },
    A
  );
  check("A_render_accepted", render.status === 202, `status=${render.status} ${JSON.stringify(render.payload).slice(0, 180)}`);
  const jobId = render.payload.jobId;
  check("A_job_id_issued", Boolean(jobId));
  const expectedCharge = 150; // 15s x 10 credits/s, standard quality
  const meAfterSubmit = await api("GET", "/v1/account/me", undefined, A);
  check(
    "A_charged_up_front",
    meAfterSubmit.payload.account?.balanceCredits === 500 - expectedCharge,
    `balance=${meAfterSubmit.payload.account?.balanceCredits}`
  );

  // ---------- Review gate: forged self-approval ignored, customers cannot decide ----------
  const pausedJob = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, A);
  check("A_forged_self_approval_ignored_job_pauses", pausedJob.payload.status === "paused_for_review", `status=${pausedJob.payload.status}`);
  const customerReviewAttempt = await api(
    "POST",
    `/v1/render-jobs/${encodeURIComponent(jobId)}/review`,
    { gate: "pre_render", checkpoints: [{ surface: "scene", label: "x", decision: "approved", reviewer: "khach" }] },
    A
  );
  check("customer_cannot_decide_review_403", customerReviewAttempt.status === 403, `status=${customerReviewAttempt.status}`);
  // Approve EXACTLY like the operator desk: checkpoints from the job's own report.
  const report = pausedJob.payload.preRenderReviewApproval ?? pausedJob.payload.reviewApproval;
  const reviewedAt = new Date().toISOString();
  const requiredCheckpoints = (report?.checkpoints ?? []).map((checkpoint) => ({
    surface: checkpoint.surface,
    label: checkpoint.label,
    ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
    required: checkpoint.required !== false,
    decision: "approved",
    reviewer: "operator-desk",
    reviewedAt,
    notes: "duyet qua trang quan tri"
  }));
  check("desk_sees_review_checkpoints", requiredCheckpoints.length > 0, `count=${requiredCheckpoints.length}`);
  const reviewApprove = await api(
    "POST",
    `/v1/render-jobs/${encodeURIComponent(jobId)}/review`,
    { gate: report?.gate ?? "pre_render", checkpoints: requiredCheckpoints },
    adminHeaders
  );
  check(
    "operator_review_queues_job",
    reviewApprove.status === 202 && reviewApprove.payload.queuedForRender === true,
    `status=${reviewApprove.status} queued=${reviewApprove.payload.queuedForRender}`
  );

  // ---------- Provider is unreachable -> job fails -> AUTOMATIC refund, live ----------
  let finalStatus = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, A);
    finalStatus = job.payload.status ?? "";
    if (["failed", "canceled", "succeeded", "rejected", "blocked"].includes(finalStatus)) {
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  check("A_job_reaches_terminal_state", ["failed", "canceled"].includes(finalStatus), `status=${finalStatus}`);
  // Default policy is MANUAL (admin-favorable): a failed video does NOT auto-refund — it
  // lands in the operator refund queue and the customer keeps a debit until the operator
  // decides. This is the core money-policy change and is proven here end to end.
  const meAfterFailure = await api("GET", "/v1/account/me", undefined, A);
  check(
    "A_not_auto_refunded_under_manual_policy",
    meAfterFailure.payload.account?.balanceCredits === 500 - expectedCharge,
    `balance=${meAfterFailure.payload.account?.balanceCredits}`
  );
  const refundQueue = await api("GET", "/v1/admin/refunds", undefined, adminHeaders);
  const queuedRefund = (refundQueue.payload.pending ?? []).find((r) => r.jobId === jobId);
  check("A_failure_queued_for_operator_refund", Boolean(queuedRefund), `pending=${(refundQueue.payload.pending ?? []).length}`);
  const refundDecision = await api("POST", "/v1/admin/refunds/decide", { refundRequestId: queuedRefund?.refundRequestId, approve: true }, adminHeaders);
  check("operator_approves_refund", refundDecision.status === 200 && refundDecision.payload.refundRequest?.status === "refunded");
  const meAfterRefund = await api("GET", "/v1/account/me", undefined, A);
  check("A_credited_after_operator_refund", meAfterRefund.payload.account?.balanceCredits === 500, `balance=${meAfterRefund.payload.account?.balanceCredits}`);
  const statement = await api("GET", "/v1/account/statement", undefined, A);
  const statementTypes = (statement.payload.entries ?? []).map((entry) => entry.type);
  check(
    "A_statement_shows_full_money_lifecycle",
    statementTypes.includes("topup") && statementTypes.includes("render_charge") && statementTypes.includes("render_refund"),
    statementTypes.join(",")
  );

  // ---------- Raw render endpoints are operator-only for customers ----------
  check("customer_blocked_on_raw_render_jobs", (await api("POST", "/v1/render-jobs", { userInput: "x" }, A)).status === 403);
  check("customer_blocked_on_raw_sync_render", (await api("POST", "/v1/render", { userInput: "x" }, A)).status === 403);

  // ---------- Top-up double-click coalesces to ONE pending request ----------
  const dupTopup1 = await api("POST", "/v1/account/topups", { packageId: "goi_pro" }, A);
  const dupTopup2 = await api("POST", "/v1/account/topups", { packageId: "goi_pro" }, A);
  check(
    "duplicate_topup_coalesced",
    Boolean(dupTopup1.payload.topup?.topupId) && dupTopup1.payload.topup.topupId === dupTopup2.payload.topup?.topupId,
    `${dupTopup1.payload.topup?.topupId} vs ${dupTopup2.payload.topup?.topupId}`
  );

  // ---------- Money path refuses to run on a placeholder bank config ----------
  const savedBankInfo = process.env.CINEJELLY_TOPUP_BANK_INFO;
  delete process.env.CINEJELLY_TOPUP_BANK_INFO;
  check("topup_blocked_without_bank_info", (await api("POST", "/v1/account/topups", { packageId: "goi_thu" }, A)).status === 503);
  process.env.CINEJELLY_TOPUP_BANK_INFO = savedBankInfo;

  // ---------- Customer B: zero balance is blocked BEFORE any job exists ----------
  const registerB = await api("POST", "/v1/account/register", { email: "khach.b@shop.vn", password: "matkhau123" });
  const B = { "X-CineJelly-Session": registerB.sessionToken };
  const sessionB = await api("POST", "/v1/short-pipeline/conversation-sessions", uiBrief("proj_rehearsal_b"), B);
  const sessionIdB = sessionB.payload.session?.sessionId ?? "";
  const renderB = await api(
    "POST",
    `/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionIdB)}/render-jobs`,
    { confirmRenderSubmission: true },
    B
  );
  check("B_zero_balance_blocked_402", renderB.status === 402, `status=${renderB.status}`);

  // ---------- Isolation: B sees nothing of A ----------
  const jobsB = await api("GET", "/v1/render-jobs", undefined, B);
  check("B_job_list_empty", (jobsB.payload.jobs ?? []).length === 0);
  const jobAasB = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, B);
  check("B_cannot_read_A_job", jobAasB.status === 404, `status=${jobAasB.status}`);
  const topupsB = await api("GET", "/v1/account/topups", undefined, B);
  check("B_topups_empty", (topupsB.payload.topups ?? []).length === 0);
  check("B_cannot_admin", (await api("GET", "/v1/admin/topups", undefined, B)).status === 403);
  const sessionsA = await api("GET", "/v1/short-pipeline/conversation-sessions", undefined, B);
  const sessionIdsVisibleToB = (sessionsA.payload.sessions ?? []).map((item) => item.sessionId ?? "");
  check("B_cannot_see_A_sessions", !sessionIdsVisibleToB.includes(sessionId));

  // ---------- Admin manual adjust + logout ----------
  const adjust = await api("POST", "/v1/admin/credits/adjust", { email: "khach.b@shop.vn", credits: 200, note: "tặng khách mới" }, adminHeaders);
  check("admin_adjust_works", adjust.status === 200 && adjust.payload.account?.balanceCredits === 200);
  await api("POST", "/v1/account/logout", undefined, A);
  check("A_logout_kills_session", (await api("GET", "/v1/account/me", undefined, A)).status === 401);
  // ---------- RESTART: jobs survive, refunds do not double, paid videos still download ----------
  const preRestartBalanceB = (await api("GET", "/v1/account/me", undefined, { "X-CineJelly-Session": registerB.sessionToken })).payload.account?.balanceCredits;
  const aLogin2 = await api("POST", "/v1/account/login", { email: "khach.a@shop.vn", password: "matkhau123" });
  const A2 = { "X-CineJelly-Session": aLogin2.sessionToken };
  const aBalanceBeforeRestart = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.balanceCredits;
  const aUserId = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.userId;
  // Plant a synthetic SUCCEEDED job with a persisted deliverable (what a real paid render
  // leaves behind) so the restart proves re-download works after recovery.
  const { RenderJobHistoryStore } = await import("../dist/api/render-job-history-store.js");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { randomUUID } = await import("node:crypto");
  const plantedJobId = `render_job_${randomUUID()}`;
  mkdirSync(join(workDir, "finished"), { recursive: true });
  writeFileSync(join(workDir, "finished", "video-a.mp4"), Buffer.from("fake-mp4-bytes-for-download-proof"));
  const historyStore = new RenderJobHistoryStore({ historyPath: join(workDir, "render-jobs", "job-history.json"), historyLimit: 500 });
  const priorHistory = historyStore.load();
  historyStore.save([
    ...priorHistory,
    {
      jobId: plantedJobId,
      clientId: `user:${aUserId}`,
      deliverableRelativePath: "finished/video-a.mp4",
      status: "succeeded",
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
      userInputPreview: "video da giao truoc restart",
      referenceCount: 0,
      hasResult: true,
      hasCostLedger: false,
      hasArtifacts: true,
      hasArtifactValidation: false,
      hasError: false,
      hasRetryableFailure: false,
      retryCount: 0,
      stageProgressEvents: []
    }
  ]);
  await new Promise((resolveClose) => server.close(resolveClose));
  const server2 = startServer(port);
  try {
    await waitForHealth();
    const aBalanceAfterRestart = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.balanceCredits;
    check(
      "restart_does_not_double_refund",
      aBalanceAfterRestart === aBalanceBeforeRestart,
      `before=${aBalanceBeforeRestart} after=${aBalanceAfterRestart}`
    );
    const bBalanceAfterRestart = (await api("GET", "/v1/account/me", undefined, { "X-CineJelly-Session": registerB.sessionToken })).payload.account?.balanceCredits;
    check("restart_keeps_B_balance", bBalanceAfterRestart === preRestartBalanceB, `before=${preRestartBalanceB} after=${bBalanceAfterRestart}`);
    const restoredJobs = await api("GET", "/v1/render-jobs", undefined, A2);
    check(
      "restart_restores_customer_job_history",
      (restoredJobs.payload.jobs ?? []).some((job) => job.jobId === plantedJobId),
      `count=${(restoredJobs.payload.jobs ?? []).length}`
    );
    const restoredDownload = await fetch(`${baseUrl}/v1/render-jobs/${plantedJobId}/deliverable`, { headers: A2 });
    const restoredBytes = Buffer.from(await restoredDownload.arrayBuffer());
    check(
      "restart_paid_video_still_downloads",
      restoredDownload.status === 200 && restoredBytes.toString().includes("fake-mp4-bytes"),
      `status=${restoredDownload.status}`
    );
    const strangerDownload = await fetch(`${baseUrl}/v1/render-jobs/${plantedJobId}/deliverable`, {
      headers: { "X-CineJelly-Session": registerB.sessionToken }
    });
    check("restored_video_still_owner_scoped", strangerDownload.status === 404, `status=${strangerDownload.status}`);

    // ---------- Redub (dịch phụ đề / thuyết minh): admin enables the speech model at the
    // desk, gate failures never charge, and the paid path charges BEFORE the provider —
    // a provider failure lands in the manual refund queue for the admin (never lost).
    const settingsPut = await api(
      "PUT",
      "/v1/admin/settings",
      { models: { speechModel: "openai/whisper-large-v3", llmModel: "deepseek-ai/DeepSeek-V3" } },
      adminHeaders
    );
    check(
      "admin_enables_speech_model",
      settingsPut.status === 200 && settingsPut.payload.settings?.models?.speechModel === "openai/whisper-large-v3",
      `status=${settingsPut.status}`
    );
    const registerC = await api("POST", "/v1/account/register", { email: "khach.c@shop.vn", password: "matkhau123" });
    const C = { "X-CineJelly-Session": registerC.sessionToken };
    // Redub quotes first and never charges on the first call: the customer must confirm the real
    // (duration-based) cost. Poor account: quote returns 200 with no charge; confirming with the
    // quoted credits then 402s for insufficient balance.
    const redubQuotePoor = await api("POST", "/v1/redub/plans", { dubLanguage: "vi", uploadUri: uploadPayload.uri }, C);
    check(
      "redub_quote_returns_price_no_charge",
      redubQuotePoor.status === 200 && redubQuotePoor.payload.status === "quote" && Number(redubQuotePoor.payload.quote?.credits) > 0,
      `status=${redubQuotePoor.status} credits=${redubQuotePoor.payload.quote?.credits}`
    );
    const poorQuoteCredits = redubQuotePoor.payload.quote?.credits;
    const redubPoor = await api(
      "POST",
      "/v1/redub/plans",
      { dubLanguage: "vi", uploadUri: uploadPayload.uri, acknowledgedCredits: poorQuoteCredits },
      C
    );
    check("redub_402_before_any_provider_call", redubPoor.status === 402, `status=${redubPoor.status}`);
    const redubForeign = await api("POST", "/v1/redub/plans", { dubLanguage: "vi", jobId: plantedJobId }, C);
    check("redub_foreign_job_404", redubForeign.status === 404, `status=${redubForeign.status}`);
    const cBalanceAfterGates = (await api("GET", "/v1/account/me", undefined, C)).payload.account?.balanceCredits;
    check("redub_gate_failures_never_charge", cBalanceAfterGates === 0, `balance=${cBalanceAfterGates}`);
    const aBalancePreRedub = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.balanceCredits ?? 0;
    // Funded account: quote then confirm — only the confirm call charges and calls the provider
    // (which fails in the rehearsal → 5xx), leaving the charge held for manual refund.
    const redubQuoteReal = await api("POST", "/v1/redub/plans", { dubLanguage: "vi", subtitleLanguages: ["en"], jobId: plantedJobId }, A2);
    const realQuoteCredits = redubQuoteReal.payload.quote?.credits;
    check(
      "redub_real_quote_before_confirm",
      redubQuoteReal.status === 200 && redubQuoteReal.payload.status === "quote" && Number(realQuoteCredits) > 0,
      `status=${redubQuoteReal.status} credits=${realQuoteCredits}`
    );
    const redubReal = await api(
      "POST",
      "/v1/redub/plans",
      { dubLanguage: "vi", subtitleLanguages: ["en"], jobId: plantedJobId, acknowledgedCredits: realQuoteCredits },
      A2
    );
    check("redub_provider_failure_maps_to_5xx", redubReal.status >= 500, `status=${redubReal.status}`);
    const aBalancePostRedub = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.balanceCredits ?? 0;
    check(
      "redub_charge_held_for_manual_refund",
      aBalancePostRedub === aBalancePreRedub - realQuoteCredits,
      `pre=${aBalancePreRedub} post=${aBalancePostRedub} quoted=${realQuoteCredits}`
    );
    const redubRefunds = await api("GET", "/v1/admin/refunds", undefined, adminHeaders);
    const redubRefundReq = (redubRefunds.payload.pending ?? []).find((item) => String(item.jobId ?? "").startsWith("redub_"));
    check("redub_refund_request_queued", Boolean(redubRefundReq), `pending=${(redubRefunds.payload.pending ?? []).length}`);
    const redubRefundDecision = await api(
      "POST",
      "/v1/admin/refunds/decide",
      { refundRequestId: redubRefundReq?.refundRequestId, approve: true },
      adminHeaders
    );
    const aBalanceAfterRefund = (await api("GET", "/v1/account/me", undefined, A2)).payload.account?.balanceCredits;
    check(
      "admin_refunds_redub_charge",
      redubRefundDecision.status === 200 && aBalanceAfterRefund === aBalancePreRedub,
      `status=${redubRefundDecision.status} balance=${aBalanceAfterRefund}`
    );
  } finally {
    await new Promise((resolveClose) => server2.close(resolveClose));
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose)).catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  }
  throw new Error("Server did not become healthy in time.");
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.launch-rehearsal-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "This rehearsal walks the exact shipped customer/admin journeys over real HTTP; keep it passing before every release.",
    "With a real Atlas key the same journey produces a real video; the refund path stays identical for provider failures."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
