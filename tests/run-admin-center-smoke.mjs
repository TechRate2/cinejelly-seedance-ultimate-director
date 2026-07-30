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

// DEFAULT-DENY INVARIANT (security audit MED-1): the /v1 auth guard only AUTHENTICATES; per-route
// authorization lives in each handler. That is fail-open by construction — a future /v1/admin route
// added without assertDeploymentPrincipal would be silently reachable by any paying customer. This
// source invariant fails the suite the moment an admin route ships without its deployment guard.
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
// Loss guard: a regular package selling credits BELOW provider cost (e.g. a dropped-zero typo:
// 28000 credits for $1) must be rejected so the operator can't accidentally save a money-losing price.
let rejectedLossPackage = false;
try {
  settings.update({ packages: [{ packageId: "goi_lo", label: "Lỗ", credits: 28000, priceUsd: 1 }] }, "test");
} catch {
  rejectedLossPackage = true;
}
check("settings_rejects_below_cost_package", rejectedLossPackage);
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

// pipelineCost markup is now UI-editable (admin audit B1: was .env-only) — persists + applies + validates.
settings.update({ pipelineCost: { overheadMultiplier: 1.5, minimumChargeCredits: 50 } }, "test");
check("pipeline_cost_markup_persists_and_applies", settings.pipelineCost().overheadMultiplier === 1.5 && settings.pipelineCost().minimumChargeCredits === 50 && settings.snapshot().pipelineCost.overheadMultiplier === 1.5);
let rejectedBadOverhead = false;
try { settings.update({ pipelineCost: { overheadMultiplier: 0.5 } }, "test"); } catch { rejectedBadOverhead = true; }
check("pipeline_cost_rejects_below_cost_markup", rejectedBadOverhead && settings.pipelineCost().overheadMultiplier === 1.5);

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
const u = await store.register({ email: "q@shop.vn", password: "matkhau123" });
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

const adminServerSource = (await import("node:fs")).readFileSync(new URL("../src/api/server.ts", import.meta.url), "utf8");
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

  // EVERY admin route, proven by asking. This replaces a check that decided whether a route was
  // guarded by looking 1,500 characters forward in the source for the word assertDeploymentPrincipal
  // — a guess that answers wrongly in both directions: a route whose guard sits further away reads as
  // unguarded, and a genuinely unguarded route sitting near a guarded one reads as safe. The only
  // honest question is what the server does when a customer asks, so it is asked, on every route.
  const adminRoutes = [...adminServerSource.matchAll(/pathname === "(\/v1\/admin\/[^"]*)"/g)].map((match) => match[1]);
  check("admin_route_list_is_not_empty", adminRoutes.length >= 10, `routes=${adminRoutes.length}`);
  const reachableByCustomer = [];
  for (const route of adminRoutes) {
    for (const method of ["GET", "POST", "PUT"]) {
      const attempt = await req(method, route, method === "GET" ? undefined : {}, custSession);
      // 403 is the guard doing its job; 401/404/405 also mean the customer got nothing. Any 2xx means
      // a paying customer reached an operator surface.
      if (attempt.status >= 200 && attempt.status < 300) {
        reachableByCustomer.push(`${method} ${route} -> ${attempt.status}`);
      }
    }
  }
  check("no_admin_route_answers_a_customer", reachableByCustomer.length === 0,
    reachableByCustomer.slice(0, 5).join(" | ") || `all ${adminRoutes.length} routes refused`);

  // ---- System-health tab: operator-only, returns plain-VN rows + overall ----
  check("customer_cannot_read_system_health", (await req("GET", "/v1/admin/system-health", undefined, custSession)).status === 403);
  check("anon_cannot_read_system_health", (await req("GET", "/v1/admin/system-health")).status >= 401);
  const health = await req("GET", "/v1/admin/system-health", undefined, admin);
  check("operator_reads_system_health", health.status === 200 && ["ok", "warn", "fail"].includes(health.payload.overall) && Array.isArray(health.payload.rows) && health.payload.rows.length > 0, `overall=${health.payload?.overall} rows=${health.payload?.rows?.length}`);
  check("system_health_has_atlas_and_database_rows", (health.payload.rows || []).some((r) => r.key === "atlas") && (health.payload.rows || []).some((r) => r.key === "database"));
  check("system_health_leaks_no_admin_token", !JSON.stringify(health.payload).includes("admin_center_token"));

  // ---- Operator edits pricing + packages; the customer sees it immediately ----
  const beforeMe = await req("GET", "/v1/account/me", undefined, custSession);
  check("customer_sees_default_price", beforeMe.payload.renderPricing?.creditsPerRenderSecond === 10, `${beforeMe.payload.renderPricing?.creditsPerRenderSecond}`);
  const put = await req("PUT", "/v1/admin/settings", {
    creditsPerRenderSecond: 25,
    usdToVnd: 27000,
    packages: [{ packageId: "goi_test", label: "Gói Test", credits: 200, priceUsd: 3 }]
  }, admin);
  check("operator_edits_settings", put.status === 200 && put.payload.settings.pricing.creditsPerRenderSecond === 25);
  const afterMe = await req("GET", "/v1/account/me", undefined, custSession);
  check("customer_sees_new_price_live", afterMe.payload.renderPricing?.creditsPerRenderSecond === 25, `${afterMe.payload.renderPricing?.creditsPerRenderSecond}`);
  const liveTestPkg = (afterMe.payload.packages ?? []).find((p) => p.packageId === "goi_test");
  check("customer_sees_new_package_live", Boolean(liveTestPkg));
  // USD is the source of truth; the customer sees the VND transfer amount = USD × rate.
  check("package_usd_converts_to_vnd", liveTestPkg?.priceUsd === 3 && liveTestPkg?.priceVnd === 81000 && afterMe.payload.usdToVnd === 27000, `usd=${liveTestPkg?.priceUsd} vnd=${liveTestPkg?.priceVnd} rate=${afterMe.payload.usdToVnd}`);
  // Change ONLY the exchange rate: every pack re-prices in VND with no package edit.
  await req("PUT", "/v1/admin/settings", { usdToVnd: 25000 }, admin);
  const afterRate = await req("GET", "/v1/account/me", undefined, custSession);
  const rePriced = (afterRate.payload.packages ?? []).find((p) => p.packageId === "goi_test");
  check("exchange_rate_reprices_all_packs", rePriced?.priceVnd === 75000 && afterRate.payload.usdToVnd === 25000, `vnd=${rePriced?.priceVnd} rate=${afterRate.payload.usdToVnd}`);
  await req("PUT", "/v1/admin/settings", { usdToVnd: 27000 }, admin);

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
