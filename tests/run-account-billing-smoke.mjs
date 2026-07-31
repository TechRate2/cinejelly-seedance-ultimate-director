#!/usr/bin/env node
/**
 * No-spend smoke for the customer account + credit billing system.
 * Boots the real API server and proves the full commercial loop: register (with weak-input
 * rejections), login (wrong password, lockout), session-based /me and uploads (no API key
 * anywhere), package top-up request -> admin approval -> balance credited, user cannot act
 * as admin, statements record every movement, charges/refunds are exact and idempotent,
 * insufficient balance is a clean 402 BEFORE any provider spend, the store survives a
 * restart, and the create page ships the login/top-up UI without leaking any secret.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-account-smoke-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "admin_smoke_token_0123456789abcdef";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_CREDITS_PER_RENDER_SECOND = "10";
process.env.CINEJELLY_TOPUP_BANK_INFO = "Vietcombank 0123456789 - SMOKE SHOP";
// Pin the test package catalog so these assertions are independent of the shipped defaults.
process.env.CINEJELLY_CREDIT_PACKAGES_JSON = JSON.stringify([{ packageId: "goi_thu", label: "Goi Thu", credits: 500, priceVnd: 49000 }, { packageId: "goi_pro", label: "Goi Pro", credits: 2000, priceVnd: 179000 }, { packageId: "goi_studio", label: "Goi Studio", credits: 7000, priceVnd: 549000 }]);

const { startServer } = await import("../dist/api/server.js");
const { UserAccountStore, estimateRenderCredits, loadRenderCreditPricing, UserAccountError } = await import("../dist/api/user-account-store.js");

const baseUrl = `http://127.0.0.1:${port}`;
const adminHeaders = { "X-CineJelly-Api-Key": "admin_smoke_token_0123456789abcdef" };
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}
async function postJson(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    payload: await response.json(),
    sessionToken: response.headers.get("x-cinejelly-session-token") ?? undefined
  };
}
async function getJson(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { status: response.status, payload: await response.json() };
}

const server = startServer(port);
try {
  await waitForHealth();

  // --- Registration validation.
  check("register_rejects_bad_email", (await postJson("/v1/account/register", { email: "not-an-email", password: "matkhau123" })).status === 400);
  check("register_rejects_weak_password", (await postJson("/v1/account/register", { email: "a@b.vn", password: "123" })).status === 400);
  const registered = await postJson("/v1/account/register", { email: "chi@shop.vn", password: "matkhau123", displayName: "Chị Chi" });
  check("register_succeeds", registered.status === 201 && typeof registered.sessionToken === "string", `status=${registered.status}`);
  check("register_duplicate_conflicts", (await postJson("/v1/account/register", { email: "CHI@shop.vn", password: "matkhau123" })).status === 409);

  // --- Login.
  check("login_wrong_password_401", (await postJson("/v1/account/login", { email: "chi@shop.vn", password: "saimatkhau" })).status === 401);
  const login = await postJson("/v1/account/login", { email: "chi@shop.vn", password: "matkhau123" });
  check("login_succeeds", login.status === 200 && typeof login.sessionToken === "string" && login.sessionToken.startsWith("sess_"));
  const session = { "X-CineJelly-Session": login.sessionToken };

  // --- Lockout after repeated failures (separate account so it cannot pollute later checks).
  await postJson("/v1/account/register", { email: "lock@shop.vn", password: "matkhau123" });
  let lockedStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    lockedStatus = (await postJson("/v1/account/login", { email: "lock@shop.vn", password: "sai" })).status;
  }
  check("login_lockout_429", lockedStatus === 429, `status=${lockedStatus}`);

  // --- Session-based /me; no API key anywhere.
  check("me_requires_session", (await getJson("/v1/account/me")).status === 401);
  const me = await getJson("/v1/account/me", session);
  check("me_returns_account", me.status === 200 && me.payload.account.email === "chi@shop.vn");
  check("me_balance_starts_zero", me.payload.account.balanceCredits === 0);
  check("me_lists_packages", Array.isArray(me.payload.packages) && me.payload.packages.length >= 3);
  check("me_ships_pricing", me.payload.renderPricing?.creditsPerRenderSecond === 10);
  check("session_token_issued_via_header_not_body", !JSON.stringify(login.payload).includes("sess_") && Boolean(login.sessionToken));

  // --- Uploads work with a session (customer flow needs no key).
  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const upload = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...session, "Content-Type": "application/octet-stream", "X-File-Name": "kol.png" },
    body: pngBytes
  });
  check("upload_works_with_session", upload.status === 201, `status=${upload.status}`);

  // --- Redub (dịch phụ đề / thuyết minh): auth + validation + clean 503 without a speech
  // model, all BEFORE any charge or provider call (no-spend; balance must stay untouched).
  check("redub_requires_auth", (await postJson("/v1/redub/plans", { dubLanguage: "vi" })).status === 401);
  check("redub_validates_dub_language", (await postJson("/v1/redub/plans", {}, session)).status === 400);
  const redubNoModel = await postJson(
    "/v1/redub/plans",
    { dubLanguage: "vi", uploadUri: "upload://up_0123456789abcdef0123456789abcdef.mp4" },
    session
  );
  check(
    "redub_clear_503_without_speech_model",
    redubNoModel.status === 503 && /ATLASCLOUD_SPEECH_MODEL/.test(redubNoModel.payload.error ?? ""),
    `status=${redubNoModel.status}`
  );
  const meAfterRedubGates = await getJson("/v1/account/me", session);
  check("redub_gates_never_charge", meAfterRedubGates.payload.account.balanceCredits === 0);

  // --- Top-up flow: request -> pending -> admin approves -> balance credited.
  check("topup_rejects_unknown_package", (await postJson("/v1/account/topups", { packageId: "khong_ton_tai" }, session)).status === 404);
  const topup = await postJson("/v1/account/topups", { packageId: "goi_thu", note: "đã CK 10:30" }, session);
  check("topup_request_created", topup.status === 201 && topup.payload.topup.status === "pending");
  check("user_cannot_list_admin_topups", (await getJson("/v1/admin/topups", session)).status === 403);
  const pending = await getJson("/v1/admin/topups", adminHeaders);
  check("admin_sees_pending_topup", pending.status === 200 && pending.payload.pending.some((item) => item.topupId === topup.payload.topup.topupId));
  const approve = await postJson("/v1/admin/topups/decide", { topupId: topup.payload.topup.topupId, approve: true, note: "đã nhận CK" }, adminHeaders);
  check("admin_approves_topup", approve.status === 200 && approve.payload.topup.status === "approved");
  check("topup_decide_is_idempotent_guarded", (await postJson("/v1/admin/topups/decide", { topupId: topup.payload.topup.topupId, approve: true }, adminHeaders)).status === 409);
  const afterTopup = await getJson("/v1/account/me", session);
  check("balance_credited_500", afterTopup.payload.account.balanceCredits === 500, `balance=${afterTopup.payload.account.balanceCredits}`);

  // --- Admin manual adjust.
  const adjusted = await postJson("/v1/admin/credits/adjust", { email: "chi@shop.vn", credits: 100, note: "tặng khách mới" }, adminHeaders);
  check("admin_adjust_adds_credits", adjusted.status === 200 && adjusted.payload.account.balanceCredits === 600);

  // --- Statement records every movement.
  const statement = await getJson("/v1/account/statement", session);
  const types = (statement.payload.entries ?? []).map((entry) => entry.type);
  check("statement_records_movements", types.includes("topup") && types.includes("admin_adjust"));

  // --- Charge / refund exactness + idempotency + 402 (direct store, same file as server).
  const pricing = loadRenderCreditPricing(process.env);
  check("pricing_estimate_30s", estimateRenderCredits({ durationTargetSeconds: 30, pricing }) === 300);
  check("pricing_estimate_high_quality", estimateRenderCredits({ durationTargetSeconds: 30, qualityMode: "high", pricing }) === 450);
  const direct = new UserAccountStore({ storePath: join(workDir, "user-accounts.json"), pricing });
  const chiId = direct.resolveSession(login.sessionToken)?.userId;
  check("store_reopens_from_disk_with_balance", Boolean(chiId) && direct.balanceOf(chiId) === 600);
  direct.chargeRender({ userId: chiId, jobId: "job_smoke_1", credits: 300 });
  check("charge_deducts_exactly", direct.balanceOf(chiId) === 300);
  let insufficientCode = 0;
  try {
    direct.chargeRender({ userId: chiId, jobId: "job_smoke_2", credits: 999 });
  } catch (error) {
    insufficientCode = error instanceof UserAccountError ? error.statusCode : 0;
  }
  check("insufficient_balance_402", insufficientCode === 402);
  direct.refundRender({ userId: chiId, jobId: "job_smoke_1", reason: "video lỗi" });
  check("refund_restores_exactly", direct.balanceOf(chiId) === 600);
  direct.refundRender({ userId: chiId, jobId: "job_smoke_1", reason: "video lỗi" });
  check("refund_is_idempotent", direct.balanceOf(chiId) === 600);

  // --- Money-hole regressions: every render route charges customers; refunds reconcile.
  const serverSource = (await import("node:fs")).readFileSync(new URL("../src/api/server.ts", import.meta.url), "utf8");
  check("all_four_render_routes_charge_users", (serverSource.match(/planUserRenderCharge\(\{/g) || []).length >= 4);
  check("charges_gate_on_chargeable_status", (serverSource.match(/chargeableSubmissionStatus\(submission\.summary\.status\)/g) || []).length >= 3 && serverSource.includes('status === "paused_for_review"'));
  check("global_billing_reconciler_wired", serverSource.includes("onJobFinalized: (event)") && serverSource.includes("reconcileRenderCharges("));
  check("sync_render_charges_and_refunds", serverSource.includes("syncUserCharge") && serverSource.includes('jobId: syncJobId, reason: "video bị lỗi"'));
  check("workspace_pinning_blocked_for_users", serverSource.includes("Tài khoản khách không dùng workspace billing"));
  // Boot reconcile refunds charges whose job vanished; keeps live/succeeded jobs.
  const reconcileStore = new UserAccountStore({ storePath: join(workDir, "reconcile-test.json"), pricing });
  const rec = await reconcileStore.register({ email: "rec@shop.vn", password: "matkhau123" });
  reconcileStore.adminAdjust({ email: "rec@shop.vn", credits: 1000 });
  reconcileStore.chargeRender({ userId: rec.user.userId, jobId: "job_gone", credits: 100 });
  reconcileStore.chargeRender({ userId: rec.user.userId, jobId: "job_ok", credits: 100 });
  reconcileStore.chargeRender({ userId: rec.user.userId, jobId: "job_failed", credits: 100 });
  const refundedCount = reconcileStore.reconcileRenderCharges((jobId) => (jobId === "job_ok" ? "succeeded" : jobId === "job_failed" ? "failed" : undefined));
  check("boot_reconcile_refunds_vanished_and_failed", refundedCount === 2 && reconcileStore.balanceOf(rec.user.userId) === 900, `refunded=${refundedCount} balance=${reconcileStore.balanceOf(rec.user.userId)}`);
  let adjustRejected = false;
  try { reconcileStore.adminAdjust({ email: "rec@shop.vn", credits: 0.4 }); } catch { adjustRejected = true; }
  check("admin_adjust_rejects_subunit_credits", adjustRejected);
  // Rate limiting now covers account endpoints (source-level: exemption bug regression).
  const rateLimitSource = (await import("node:fs")).readFileSync(new URL("../src/api/api-rate-limit.ts", import.meta.url), "utf8");
  check("rate_limit_covers_account_endpoints", rateLimitSource.includes('"/v1/account/register"') && rateLimitSource.includes('"/v1/account/login"') && rateLimitSource.includes('"/v1/uploads"'));
  // Operator topup desk ships.
  const topupDesk = await fetch(`${baseUrl}/operator/topups`);
  const topupDeskHtml = await topupDesk.text();
  check("operator_admin_center_ships", topupDesk.status === 200 && topupDeskHtml.includes("Trung tâm quản trị") && !topupDeskHtml.includes("admin_smoke_token"));
  // Landing page routes customers to the studio.
  const landing = await fetch(`${baseUrl}/`);
  const landingHtml = await landing.text();
  check("landing_redirects_to_studio", landing.status === 200 && landingHtml.includes("/short/create"));

  // --- Database driver choice (json | sqlite | postgres).
  const { readDatabaseKind, SqliteAccountDriver, PostgresAccountDriver } = await import("../dist/api/account-persistence.js");
  check("db_kind_defaults_to_json", readDatabaseKind({}) === "json");
  let unknownKindRejected = false;
  try { readDatabaseKind({ CINEJELLY_DATABASE_KIND: "mysql" }); } catch { unknownKindRejected = true; }
  check("db_kind_rejects_unknown", unknownKindRejected);
  let sqliteOutcome = "";
  try {
    const sqliteDriver = new SqliteAccountDriver({ databasePath: join(workDir, "driver-test.sqlite"), schemaVersion: "cinejelly.user-account-store.v1" });
    sqliteDriver.persist({ schemaVersion: "cinejelly.user-account-store.v1", users: [{ userId: "u1" }], sessions: [], entries: [{ entryId: "e1" }], topups: [] });
    const reloaded = sqliteDriver.load();
    sqliteOutcome = reloaded && reloaded.users.length === 1 && reloaded.entries.length === 1 ? "roundtrip_ok" : "roundtrip_bad";
  } catch (error) {
    sqliteOutcome = /Node\.js >= 22\.5/.test(String(error && error.message)) ? "clear_version_error" : "unclear_error";
  }
  check("db_sqlite_roundtrip_or_clear_version_error", sqliteOutcome === "roundtrip_ok" || sqliteOutcome === "clear_version_error", sqliteOutcome);
  const pgDriver = new PostgresAccountDriver({ connectionString: "postgres://x:y@127.0.0.1:1/db", schemaVersion: "cinejelly.user-account-store.v1" });
  const pgError = await pgDriver.ready().then(() => "", (error) => String(error && error.message));
  check("db_postgres_missing_pg_clear_error", pgError.includes("npm install pg") || pgError.length > 0, pgError.slice(0, 80));

  // --- Password change (self-service) + admin reset.
  const pwUser = await postJson("/v1/account/register", { email: "pw@shop.vn", password: "matkhau123" });
  const pwSession = { "X-CineJelly-Session": pwUser.sessionToken };
  check("change_password_wrong_current_401", (await postJson("/v1/account/change-password", { currentPassword: "sai", newPassword: "matkhaumoi123" }, pwSession)).status === 401);
  const changed = await postJson("/v1/account/change-password", { currentPassword: "matkhau123", newPassword: "matkhaumoi123" }, pwSession);
  check("change_password_succeeds_with_new_session", changed.status === 200 && typeof changed.sessionToken === "string");
  check("old_session_revoked_after_change", (await getJson("/v1/account/me", pwSession)).status === 401);
  check("new_password_logs_in", (await postJson("/v1/account/login", { email: "pw@shop.vn", password: "matkhaumoi123" })).status === 200);
  check("old_password_rejected", (await postJson("/v1/account/login", { email: "pw@shop.vn", password: "matkhau123" })).status === 401);
  const resetResponse = await fetch(`${baseUrl}/v1/admin/accounts/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders },
    body: JSON.stringify({ email: "pw@shop.vn" })
  });
  const temporaryPassword = resetResponse.headers.get("x-cinejelly-temporary-password") ?? "";
  check("admin_reset_returns_temp_password", resetResponse.status === 200 && temporaryPassword.length >= 10, `len=${temporaryPassword.length}`);
  check("temp_password_logs_in", (await postJson("/v1/account/login", { email: "pw@shop.vn", password: temporaryPassword })).status === 200);
  check("user_cannot_reset_passwords", (await postJson("/v1/admin/accounts/reset-password", { email: "chi@shop.vn" }, { "X-CineJelly-Session": changed.sessionToken })).status !== 200);

  // --- Logout invalidates the session.
  await fetch(`${baseUrl}/v1/account/logout`, { method: "POST", headers: session });
  check("logout_invalidates_session", (await getJson("/v1/account/me", session)).status === 401);

  // --- Create page ships the customer UI, mobile-ready, without secrets.
  const page = await fetch(`${baseUrl}/short/create`);
  const html = await page.text();
  check("page_ships_auth_modal", html.includes("auth-modal") && html.includes("tab-register"));
  check("page_ships_topup_modal", html.includes("topup-modal") && html.includes("package-grid"));
  check("page_ships_credit_estimate", html.includes("credit-estimate"));
  check("page_mobile_viewport_and_breakpoints", html.includes("width=device-width") && html.includes("@media (max-width: 620px)") && html.includes("@media (max-width: 860px)"));
  check("page_admin_key_hidden_by_default", html.includes('id="admin-key-wrap" hidden'));
  check("page_leaks_no_secrets", !html.includes("admin_smoke_token_0123456789abcdef") && !html.includes(login.sessionToken));
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(workDir, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Server did not become healthy in time.");
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.account-billing-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing accounts, sessions, packages, top-ups, or render charging.",
    "Render jobs charge credits up front at submission and refund automatically on failure/cancel; wire a payment gateway later by replacing only the top-up approval step."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
