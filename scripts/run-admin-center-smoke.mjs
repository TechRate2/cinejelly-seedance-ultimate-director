#!/usr/bin/env node
/**
 * No-spend smoke for the Admin Center: runtime settings + manual refund policy.
 * Boots the real server and proves the operator can, from the admin API, edit render
 * pricing and packages (which the customer /me immediately reflects), switch the refund
 * policy, manage the refund queue, and that all admin routes are deployment-token-only.
 * Also directly exercises the manual-policy refund queue on the account store and the
 * settings store's validation. No provider calls, no spend.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cinejelly-admin-smoke-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "admin_center_token_0123456789abcd";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_CREDITS_PER_RENDER_SECOND = "10";
process.env.CINEJELLY_TOPUP_BANK_INFO = "Vietcombank 000 - ADMIN SMOKE";

const { startServer } = await import("../dist/api/server.js");
const { AdminSettingsStore } = await import("../dist/api/admin-settings-store.js");
const { UserAccountStore, loadRenderCreditPricing } = await import("../dist/api/user-account-store.js");

const baseUrl = `http://127.0.0.1:${port}`;
const admin = { "X-CineJelly-Api-Key": "admin_center_token_0123456789abcd" };
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}
async function req(method, path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, payload, sessionToken: res.headers.get("x-cinejelly-session-token") ?? undefined };
}

// ---- Settings store validation (direct) ----
const settings = new AdminSettingsStore({ settingsPath: join(workDir, "settings-direct.json"), env: { CINEJELLY_OUTPUT_DIR: workDir } });
check("settings_default_refund_policy_is_manual", settings.refundPolicy() === "manual");
let rejectedBadPrice = false;
try {
  settings.update({ creditsPerRenderSecond: -5 }, "test");
} catch {
  rejectedBadPrice = true;
}
check("settings_rejects_negative_price", rejectedBadPrice);
let rejectedBadPackage = false;
try {
  settings.update({ packages: [{ packageId: "Bad Id!", label: "x", credits: 10, priceVnd: 1000 }] }, "test");
} catch {
  rejectedBadPackage = true;
}
check("settings_rejects_bad_package_id", rejectedBadPackage);
let rejectedBadModel = false;
try {
  settings.update({ models: { videoModel: "has spaces and $" } }, "test");
} catch {
  rejectedBadModel = true;
}
check("settings_rejects_bad_model_id", rejectedBadModel);
settings.update({ creditsPerRenderSecond: 20, refundPolicy: "auto" }, "test");
check("settings_persist_and_read_back", settings.pricing().creditsPerRenderSecond === 20 && settings.refundPolicy() === "auto");
// Owner "never refund credits" policy is a valid, persisted choice.
settings.update({ refundPolicy: "off" }, "test");
check("settings_accept_refund_policy_off", settings.refundPolicy() === "off");
let rejectedBadPolicy = false;
try { settings.update({ refundPolicy: "nonsense" }, "test"); } catch { rejectedBadPolicy = true; }
check("settings_reject_bad_refund_policy", rejectedBadPolicy);
settings.update({ refundPolicy: "manual" }, "test");
check("settings_audit_trail_records", settings.snapshot().auditTrail.length >= 1);

// ---- Model overrides MERGE, never wipe (data-loss guard) ----
// Enable Sub/Dub by setting only the speech model (as the Model tab / a direct API PUT does).
settings.update({ models: { speechModel: "openai/whisper-large-v3" } }, "test");
check("settings_speech_model_set", settings.snapshot().models.speechModel === "openai/whisper-large-v3");
// Now a stale/partial Settings save that carries only some model fields (blank speech box)
// must NOT wipe the speech model — a merge, not a replace.
settings.update({ models: { llmModel: "deepseek-ai/DeepSeek-V3", videoModel: "", imageModel: "" } }, "test");
check(
  "settings_partial_model_update_preserves_speech_model",
  settings.snapshot().models.speechModel === "openai/whisper-large-v3" && settings.snapshot().models.llmModel === "deepseek-ai/DeepSeek-V3",
  JSON.stringify(settings.snapshot().models)
);
// And it applied the speech model to the environment so the redub route sees it.
check("settings_speech_model_applied_to_env", (process.env.ATLASCLOUD_SPEECH_MODEL ?? "") === "openai/whisper-large-v3");

// ---- Account store: manual-policy refund queue (direct) ----
const store = new UserAccountStore({ storePath: join(workDir, "acct-direct.json"), pricing: loadRenderCreditPricing(process.env) });
const u = store.register({ email: "q@shop.vn", password: "matkhau123" });
store.adminAdjust({ email: "q@shop.vn", credits: 1000 });
store.chargeRender({ userId: u.user.userId, jobId: "job_q1", credits: 300 });
const queued = store.queueRefundRequest({ userId: u.user.userId, jobId: "job_q1", reason: "video lỗi" });
check("refund_queue_creates_pending", Boolean(queued) && store.balanceOf(u.user.userId) === 700, `balance=${store.balanceOf(u.user.userId)}`);
check("refund_queue_idempotent", !store.queueRefundRequest({ userId: u.user.userId, jobId: "job_q1", reason: "again" }));
check("refund_queue_lists_pending", store.pendingRefundRequests().some((r) => r.jobId === "job_q1"));
const decided = store.decideRefundRequest({ refundRequestId: queued.refundRequestId, approve: true });
check("refund_approve_credits_customer", decided.status === "refunded" && store.balanceOf(u.user.userId) === 1000, `balance=${store.balanceOf(u.user.userId)}`);
check("refund_decide_twice_conflicts", (() => { try { store.decideRefundRequest({ refundRequestId: queued.refundRequestId, approve: true }); return false; } catch { return true; } })());
// Dismiss path keeps the money.
store.chargeRender({ userId: u.user.userId, jobId: "job_q2", credits: 300 });
const queued2 = store.queueRefundRequest({ userId: u.user.userId, jobId: "job_q2", reason: "loi" });
store.decideRefundRequest({ refundRequestId: queued2.refundRequestId, approve: false });
check("refund_dismiss_keeps_money", store.balanceOf(u.user.userId) === 700, `balance=${store.balanceOf(u.user.userId)}`);

const server = startServer(port);
try {
  await waitForHealth();

  // ---- Admin routes are deployment-token-only ----
  const customer = await req("POST", "/v1/account/register", { email: "cust@shop.vn", password: "matkhau123" });
  const custSession = { "X-CineJelly-Session": customer.sessionToken };
  check("customer_cannot_read_settings", (await req("GET", "/v1/admin/settings", undefined, custSession)).status === 403);
  check("customer_cannot_write_settings", (await req("PUT", "/v1/admin/settings", { creditsPerRenderSecond: 1 }, custSession)).status === 403);
  check("customer_cannot_read_refunds", (await req("GET", "/v1/admin/refunds", undefined, custSession)).status === 403);
  check("anon_cannot_read_settings", (await req("GET", "/v1/admin/settings")).status >= 401);

  // ---- Operator edits pricing + packages; the customer sees it immediately ----
  const beforeMe = await req("GET", "/v1/account/me", undefined, custSession);
  check("customer_sees_default_price", beforeMe.payload.renderPricing?.creditsPerRenderSecond === 10, `${beforeMe.payload.renderPricing?.creditsPerRenderSecond}`);
  const put = await req("PUT", "/v1/admin/settings", {
    creditsPerRenderSecond: 25,
    packages: [{ packageId: "goi_test", label: "Gói Test", credits: 999, priceVnd: 12345 }]
  }, admin);
  check("operator_edits_settings", put.status === 200 && put.payload.settings.pricing.creditsPerRenderSecond === 25);
  const afterMe = await req("GET", "/v1/account/me", undefined, custSession);
  check("customer_sees_new_price_live", afterMe.payload.renderPricing?.creditsPerRenderSecond === 25, `${afterMe.payload.renderPricing?.creditsPerRenderSecond}`);
  check("customer_sees_new_package_live", (afterMe.payload.packages ?? []).some((p) => p.packageId === "goi_test"));

  // ---- Refund policy switch is honored by the settings snapshot ----
  await req("PUT", "/v1/admin/settings", { refundPolicy: "auto" }, admin);
  check("operator_switches_refund_policy", (await req("GET", "/v1/admin/settings", undefined, admin)).payload.settings.refundPolicy === "auto");
  await req("PUT", "/v1/admin/settings", { refundPolicy: "manual" }, admin);
  check("operator_switches_back_to_manual", (await req("GET", "/v1/admin/settings", undefined, admin)).payload.settings.refundPolicy === "manual");

  // ---- Studio content edit + announcement reaches the customer /me ----
  await req("PUT", "/v1/admin/settings", { studio: { announcement: "Khuyến mãi Tết!" } }, admin);
  const meWithAnnounce = await req("GET", "/v1/account/me", undefined, custSession);
  check("customer_sees_announcement", meWithAnnounce.payload.announcement === "Khuyến mãi Tết!");

  // ---- Admin Center page ships and leaks no secret ----
  const page = await fetch(`${baseUrl}/operator/topups`);
  const html = await page.text();
  check("admin_center_page_ships", page.status === 200 && html.includes("Trung tâm quản trị") && html.includes("panel-settings"));
  check("admin_center_has_all_tabs", html.includes('data-tab="money"') && html.includes('data-tab="customers"') && html.includes('data-tab="settings"'));
  check("admin_center_no_secret_leak", !html.includes("admin_center_token_0123456789abcd"));
  check("admin_alias_route_serves", (await fetch(`${baseUrl}/operator/admin`)).status === 200);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(workDir, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Server did not become healthy in time.");
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.admin-center-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing admin settings, the refund queue, or the Admin Center page.",
    "Runtime settings override .env; a fresh deploy still boots from the single .env file."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
