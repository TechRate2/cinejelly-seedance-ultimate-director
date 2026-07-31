#!/usr/bin/env node
/**
 * End-to-end HTTP smoke for the operator-hold ("treo chờ admin") feature with the REAL
 * server and a deliberately-unreachable fake Atlas endpoint (zero spend).
 *
 * Proves the shipped behavior a customer and operator actually experience:
 *  - a customer render that hits an infra/config failure is HELD (paused_for_operator), not
 *    failed; the customer's credits stay debited (reserved), and the customer's own view of
 *    the job carries NO internal error/reason (only "still processing");
 *  - the operator's /v1/admin/operator-holds queue shows the job WITH the real reason;
 *  - "retry now" re-runs it (and, while still broken, re-holds — money still reserved);
 *  - cancelling a held job settles it and lands the refund in the manual queue, which the
 *    operator approves to restore the customer's balance.
 *
 * The auto-retry sweep interval is set high so the test drives retries explicitly; the
 * deadline->auto-fail->refund path is covered deterministically in run-operator-hold-smoke.mjs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-operator-hold-http-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "hold_admin_token_0123456789abcd";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_CREDITS_PER_RENDER_SECOND = "10";
process.env.CINEJELLY_TOPUP_BANK_INFO = "Vietcombank 0123456789 - HOLD SHOP";
// Pin the test package catalog so these assertions are independent of the shipped defaults.
process.env.CINEJELLY_CREDIT_PACKAGES_JSON = JSON.stringify([{ packageId: "goi_thu", label: "Goi Thu", credits: 500, priceVnd: 49000 }, { packageId: "goi_pro", label: "Goi Pro", credits: 2000, priceVnd: 179000 }, { packageId: "goi_studio", label: "Goi Studio", credits: 7000, priceVnd: 549000 }]);
// Operator-hold ON (the default), but sweep rarely so the test controls retries.
process.env.CINEJELLY_JOB_HOLD_ON_CONFIG_ERROR = "true";
process.env.CINEJELLY_JOB_HOLD_RETRY_INTERVAL_MS = "3600000";
process.env.CINEJELLY_JOB_HOLD_MAX_HOURS = "24";
// Unreachable fake Atlas -> every render fails with an infra error (NETWORK_ERROR) -> HOLD.
process.env.ATLASCLOUD_API_KEY = "hold-fake-key-not-real";
process.env.ATLASCLOUD_API_BASE_URL = "https://127.0.0.1:9/v1";
process.env.ATLASCLOUD_BASE_URL = "https://127.0.0.1:9";
process.env.CINEJELLY_REQUEST_TIMEOUT_MS = "1500";
process.env.CINEJELLY_POLLING_INTERVAL_MS = "200";
process.env.CINEJELLY_POLLING_TIMEOUT_MS = "3000";

const { startServer } = await import("../dist/api/server.js");
const baseUrl = `http://127.0.0.1:${port}`;
const adminHeaders = { "X-CineJelly-Api-Key": "hold_admin_token_0123456789abcd" };
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
      brandName: "Hold Brand",
      tone: "premium but clear",
      language: "vi",
      allowedClaims: ["cấp ẩm sâu"],
      forbiddenClaims: ["guaranteed cure"],
      ctaRules: ["Use one CTA only"],
      voicePreferences: ["Vietnamese natural creator voice"]
    },
    messages: [{ role: "user", text: "Video 15 giây quảng cáo serum" }]
  };
}
async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Server did not become healthy.");
}
async function waitForJobStatus(jobId, headers, statuses, attempts = 120) {
  const wanted = new Set(statuses);
  let last = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const job = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, headers);
    last = job.payload.status ?? "";
    if (wanted.has(last)) return job;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { status: 200, payload: { status: last } };
}
async function approveRenderThroughReview(sessionId, session) {
  const render = await api(
    "POST",
    `/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    {
      confirmRenderSubmission: true,
      reviewApprovalGate: "pre_render",
      reviewApprovalCheckpoints: [{ surface: "scene", label: "tu duyet", decision: "approved", reviewer: "khach.hold@shop.vn" }]
    },
    session
  );
  const jobId = render.payload.jobId;
  const paused = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, session);
  const report = paused.payload.preRenderReviewApproval ?? paused.payload.reviewApproval;
  const reviewedAt = new Date().toISOString();
  const checkpoints = (report?.checkpoints ?? []).map((checkpoint) => ({
    surface: checkpoint.surface,
    label: checkpoint.label,
    ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
    required: checkpoint.required !== false,
    decision: "approved",
    reviewer: "operator-desk",
    reviewedAt,
    notes: "duyet"
  }));
  const approve = await api(
    "POST",
    `/v1/render-jobs/${encodeURIComponent(jobId)}/review`,
    { gate: report?.gate ?? "pre_render", checkpoints },
    adminHeaders
  );
  return { jobId, renderStatus: render.status, approveStatus: approve.status, queued: approve.payload?.queuedForRender, checkpointCount: checkpoints.length, approveError: approve.payload?.error };
}

const server = startServer(port);
try {
  await waitForHealth();

  // --- Customer setup: register -> top up -> admin approves -> 500 credits. ---
  const register = await api("POST", "/v1/account/register", { email: "khach.hold@shop.vn", password: "matkhau123", displayName: "Khách Hold" });
  const session = { "X-CineJelly-Session": register.sessionToken };
  check("customer_registers", register.status === 201 && Boolean(register.sessionToken));
  const topup = await api("POST", "/v1/account/topups", { packageId: "goi_thu" }, session);
  const pending = await api("GET", "/v1/admin/topups", undefined, adminHeaders);
  const pendingTopup = (pending.payload.pending ?? []).find((item) => item.topupId === topup.payload.topup.topupId);
  await api("POST", "/v1/admin/topups/decide", { topupId: pendingTopup?.topupId, approve: true }, adminHeaders);
  check("customer_funded_500", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 500);

  // --- Submit a render; operator approves it through review; provider is unreachable. ---
  const sess = await api("POST", "/v1/short-pipeline/conversation-sessions", uiBrief("proj_hold_a"), session);
  const sessionId = sess.payload.session?.sessionId ?? "";
  const approval = await approveRenderThroughReview(sessionId, session);
  const { jobId, renderStatus } = approval;
  check("render_accepted_and_charged", renderStatus === 202 && (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 350, `charge check`);
  check("operator_review_queues_job", approval.queued === true, `approveStatus=${approval.approveStatus} queued=${approval.queued} checkpoints=${approval.checkpointCount} err=${approval.approveError}`);

  // --- Infra failure HOLDS the job (does not fail it). ---
  const heldJob = await waitForJobStatus(jobId, session, ["paused_for_operator", "failed", "canceled", "succeeded"]);
  check("infra_failure_holds_job", heldJob.payload.status === "paused_for_operator", `status=${heldJob.payload.status}`);

  // --- Customer view carries NO internal error/reason (only "processing"). ---
  check(
    "customer_sees_no_internal_error",
    heldJob.payload.hasError === false && heldJob.payload.error === undefined && heldJob.payload.operatorHoldReason === undefined,
    `hasError=${heldJob.payload.hasError} reason=${heldJob.payload.operatorHoldReason}`
  );

  // --- Charge stays reserved while held (not refunded, not lost). ---
  check("held_charge_stays_reserved", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 350);

  // --- Operator queue shows the job WITH the real reason. ---
  const holds = await api("GET", "/v1/admin/operator-holds", undefined, adminHeaders);
  const heldEntry = (holds.payload.holds ?? []).find((item) => item.jobId === jobId);
  check("operator_sees_hold_with_reason", Boolean(heldEntry) && typeof heldEntry.operatorHoldReason === "string" && heldEntry.operatorHoldReason.length > 0, JSON.stringify(heldEntry?.operatorHoldReason));
  check("customer_cannot_see_operator_holds", (await api("GET", "/v1/admin/operator-holds", undefined, session)).status === 403);

  // --- "Retry now": re-runs; still broken -> re-holds; money still reserved. ---
  const retry = await api("POST", "/v1/admin/operator-holds/retry", { jobId }, adminHeaders);
  check("operator_retry_requeues", retry.status === 200 && retry.payload.requeued === 1, `requeued=${retry.payload.requeued}`);
  const reHeld = await waitForJobStatus(jobId, session, ["paused_for_operator", "failed", "succeeded"]);
  check("still_broken_reholds", reHeld.payload.status === "paused_for_operator", `status=${reHeld.payload.status}`);
  check("rehold_charge_still_reserved", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 350);

  // --- Customer cancels their own held job: the response must NOT leak the internal reason
  // or diagnostics (they bypass the GET path), and the refund lands in the manual queue. ---
  const cancel = await api("DELETE", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, session);
  check("customer_cancels_held_job", cancel.status === 202 && cancel.payload.status === "canceled", `httpStatus=${cancel.status} status=${cancel.payload.status}`);
  check(
    "cancel_response_hides_internal_diagnostics",
    cancel.payload.operatorHoldReason === undefined &&
      cancel.payload.error === undefined &&
      cancel.payload.costLedger === undefined &&
      cancel.payload.operatorHoldAttempts === undefined,
    `reason=${cancel.payload.operatorHoldReason} attempts=${cancel.payload.operatorHoldAttempts}`
  );
  // The operator, in contrast, DOES see the full reason on their own view (operator-only).
  const operatorView = await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, adminHeaders);
  check("operator_view_keeps_reason", typeof operatorView.payload.operatorHoldReason === "string" && operatorView.payload.operatorHoldReason.length > 0);
  const refundQueue = await api("GET", "/v1/admin/refunds", undefined, adminHeaders);
  const refundReq = (refundQueue.payload.pending ?? []).find((item) => item.jobId === jobId);
  check("cancel_queues_refund", Boolean(refundReq), `pending=${(refundQueue.payload.pending ?? []).length}`);
  await api("POST", "/v1/admin/refunds/decide", { refundRequestId: refundReq?.refundRequestId, approve: true }, adminHeaders);
  check("approved_refund_restores_balance", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 500);
} finally {
  await new Promise((resolve) => server.close(resolve)).catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.operator-hold-http-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing operator-hold routing, customer error-stripping, or the admin hold desk.",
    "Live behavior (a real key fix resuming a held job to success) is confirmed on a real paid run."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
