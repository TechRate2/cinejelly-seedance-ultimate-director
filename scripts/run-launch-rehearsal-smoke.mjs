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
    { confirmRenderSubmission: true },
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

  // ---------- The commercial review gate: job pauses for operator approval ----------
  const pausedJob = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, A);
  check("A_job_pauses_for_review", pausedJob.payload.status === "paused_for_review", `status=${pausedJob.payload.status}`);
  // Approve exactly like the shipped UI: checkpoints come from the session ui-contract.
  const contract = uiContract.payload.uiContract;
  const reviewedAt = new Date().toISOString();
  const requiredCheckpoints = (contract?.review?.checkpoints ?? [])
    .filter((checkpoint) => checkpoint.canApproveInUi)
    .map((checkpoint) => ({
      surface: checkpoint.surface,
      label: checkpoint.label,
      ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
      required: checkpoint.required,
      decision: "approved",
      reviewer: "operator@rehearsal",
      reviewedAt,
      notes: "duyệt trong tổng duyệt launch"
    }));
  check("A_contract_lists_review_checkpoints", requiredCheckpoints.length > 0, `count=${requiredCheckpoints.length}`);
  const reviewApprove = await api(
    "POST",
    `/v1/render-jobs/${encodeURIComponent(jobId)}/review`,
    { gate: contract?.review?.approvalPayloadContract?.gate ?? "pre_render", checkpoints: requiredCheckpoints },
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
  const meAfterFailure = await api("GET", "/v1/account/me", undefined, A);
  check(
    "A_refunded_automatically",
    meAfterFailure.payload.account?.balanceCredits === 500,
    `balance=${meAfterFailure.payload.account?.balanceCredits}`
  );
  const statement = await api("GET", "/v1/account/statement", undefined, A);
  const statementTypes = (statement.payload.entries ?? []).map((entry) => entry.type);
  check(
    "A_statement_shows_full_money_lifecycle",
    statementTypes.includes("topup") && statementTypes.includes("render_charge") && statementTypes.includes("render_refund"),
    statementTypes.join(",")
  );

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
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
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
