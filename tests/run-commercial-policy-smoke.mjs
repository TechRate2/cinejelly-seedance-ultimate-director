#!/usr/bin/env node
/**
 * No-spend smoke for the owner's commercial policy choices:
 *  - the shipped default package ladder is margin-positive and volume-discounted (per-credit
 *    price drops as the pack grows) with exactly one "most popular" pack;
 *  - CINEJELLY_CUSTOMER_AUTO_RUN=true makes a customer render skip the review pause and run
 *    immediately (charged at submit, no "chờ duyệt");
 *  - CINEJELLY_REFUND_POLICY=off never returns credits on a failed render (cash is never
 *    returned under any policy anyway), and nothing lands in the refund queue.
 *
 * Zero spend: the Atlas endpoint points at a closed port so the render fails fast; hold is
 * off here so the failure is terminal (the hold behavior has its own smokes).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// ---- Part A: the shipped default package ladder (no server needed). ----
const { DEFAULT_CREDIT_PACKAGES } = await import("../dist/api/user-account-store.js");
// The catalog splits into a once-per-account paid TRIAL hook (anti-farm loss-leader) and the
// regular volume-discount LADDER. Metered pipeline pricing sets 1 credit ≈ $0.01 of provider cost.
const COST_BASIS_USD_PER_CREDIT = 0.01;
const trialPacks = DEFAULT_CREDIT_PACKAGES.filter((pkg) => pkg.oncePerAccount === true);
const regularPacks = DEFAULT_CREDIT_PACKAGES.filter((pkg) => !pkg.oncePerAccount);
check("one_once_per_account_trial", trialPacks.length === 1, `count=${trialPacks.length}`);
check("trial_is_farm_proof_loss_leader",
  trialPacks.every((pkg) => pkg.priceUsd / pkg.credits <= COST_BASIS_USD_PER_CREDIT + 0.0005),
  trialPacks.map((p) => (p.priceUsd / p.credits).toFixed(4)).join(","));
check("regular_ladder_of_four", regularPacks.length === 4, `count=${regularPacks.length}`);
// USD is the source of truth (Higgsfield-style tiers); VND is derived at the exchange rate.
check("every_pack_has_usd_price", DEFAULT_CREDIT_PACKAGES.every((pkg) => Number(pkg.priceUsd) > 0), DEFAULT_CREDIT_PACKAGES.map((p) => p.priceUsd).join(","));
const ascendingCredits = regularPacks.every((pkg, index) => index === 0 || pkg.credits > regularPacks[index - 1].credits);
const ascendingPrice = regularPacks.every((pkg, index) => index === 0 || pkg.priceUsd > regularPacks[index - 1].priceUsd);
check("packages_scale_up", ascendingCredits && ascendingPrice);
const perCreditUsd = regularPacks.map((pkg) => pkg.priceUsd / pkg.credits);
const volumeDiscount = perCreditUsd.every((value, index) => index === 0 || value < perCreditUsd[index - 1]);
check("bigger_pack_is_cheaper_per_credit", volumeDiscount, perCreditUsd.map((v) => v.toFixed(4)).join(" -> "));
// Every REGULAR pack must sell credits ABOVE the provider-cost basis (margin-positive); only the
// trial hook is allowed to sit at/below cost.
check("every_regular_pack_margin_positive", perCreditUsd.every((value) => value > COST_BASIS_USD_PER_CREDIT), `min=$${Math.min(...perCreditUsd).toFixed(4)}/credit`);
const popularCount = DEFAULT_CREDIT_PACKAGES.filter((pkg) => String(pkg.label).includes("⭐")).length;
check("exactly_one_popular_anchor", popularCount === 1, `count=${popularCount}`);
// Verify the exchange conversion: served packages must carry a VND transfer amount = USD × rate.
const { withComputedVnd, DEFAULT_USD_TO_VND } = await import("../dist/api/user-account-store.js");
const converted = withComputedVnd(DEFAULT_CREDIT_PACKAGES[1], 27000);
check("usd_to_vnd_conversion_correct", converted.priceVnd === Math.round(DEFAULT_CREDIT_PACKAGES[1].priceUsd * 27000) && DEFAULT_USD_TO_VND === 27000, `vnd=${converted.priceVnd}`);

// ---- Part B: auto-run + refund-off over real HTTP. ----
const workDir = mkdtempSync(join(tmpdir(), "cinejelly-commercial-policy-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "policy_admin_token_0123456789ab";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_CREDITS_PER_RENDER_SECOND = "10";
process.env.CINEJELLY_TOPUP_BANK_INFO = "Vietcombank 0123456789 - POLICY SHOP";
process.env.CINEJELLY_CREDIT_PACKAGES_JSON = JSON.stringify([{ packageId: "goi_thu", label: "Goi Thu", credits: 500, priceVnd: 49000 }]);
process.env.CINEJELLY_CUSTOMER_AUTO_RUN = "true";
process.env.CINEJELLY_REFUND_POLICY = "off";
process.env.CINEJELLY_JOB_HOLD_ON_CONFIG_ERROR = "false"; // failure is terminal here
process.env.ATLASCLOUD_API_KEY = "policy-fake-key-not-real";
process.env.ATLASCLOUD_API_BASE_URL = "https://127.0.0.1:9/v1";
process.env.ATLASCLOUD_BASE_URL = "https://127.0.0.1:9";
process.env.CINEJELLY_REQUEST_TIMEOUT_MS = "1500";
process.env.CINEJELLY_POLLING_INTERVAL_MS = "200";
process.env.CINEJELLY_POLLING_TIMEOUT_MS = "3000";

const { startServer } = await import("../dist/api/server.js");
const baseUrl = `http://127.0.0.1:${port}`;
const adminHeaders = { "X-CineJelly-Api-Key": "policy_admin_token_0123456789ab" };
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
    userPrompt: "Video 15 giây quảng cáo serum dưỡng da cho da khô, sáng và đáng tin",
    targetPlatform: "tiktok",
    targetDurationSeconds: 15,
    targetAspectRatio: "9:16",
    audio: { mode: "voiceover", language: "vi" },
    product: { snapshot: { productTitle: "Glow Serum", category: "skincare", claims: ["cấp ẩm sâu"] } },
    brandKit: { brandName: "Policy Brand", tone: "clear", language: "vi", allowedClaims: ["cấp ẩm sâu"], forbiddenClaims: ["guaranteed cure"], ctaRules: ["one CTA"], voicePreferences: ["vi"] },
    messages: [{ role: "user", text: "Video 15 giây serum" }]
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

const server = startServer(port);
try {
  await waitForHealth();
  const register = await api("POST", "/v1/account/register", { email: "khach.policy@shop.vn", password: "matkhau123", displayName: "Khách Policy" });
  const session = { "X-CineJelly-Session": register.sessionToken };
  const topup = await api("POST", "/v1/account/topups", { packageId: "goi_thu" }, session);
  const pending = await api("GET", "/v1/admin/topups", undefined, adminHeaders);
  await api("POST", "/v1/admin/topups/decide", { topupId: (pending.payload.pending ?? []).find((i) => i.topupId === topup.payload.topup.topupId)?.topupId, approve: true }, adminHeaders);
  check("customer_funded_500", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 500);

  const sess = await api("POST", "/v1/short-pipeline/conversation-sessions", uiBrief("proj_policy"), session);
  const sessionId = sess.payload.session?.sessionId ?? "";
  // Auto-run: submit WITHOUT any review approval; the job must NOT pause for review.
  const render = await api(
    "POST",
    `/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/render-jobs`,
    { confirmRenderSubmission: true },
    session
  );
  const jobId = render.payload.jobId;
  check("auto_run_render_accepted", render.status === 202 && Boolean(jobId), `status=${render.status}`);
  check("auto_run_charged_at_submit", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 350, "150 credits charged");
  const firstStatus = (await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, session)).payload.status;
  check("auto_run_skips_review_pause", firstStatus !== "paused_for_review", `status=${firstStatus}`);

  // Wait for the terminal failure (provider unreachable, hold off).
  let finalStatus = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    finalStatus = (await api("GET", `/v1/render-jobs/${encodeURIComponent(jobId)}`, undefined, session)).payload.status ?? "";
    if (["failed", "canceled", "succeeded", "rejected"].includes(finalStatus)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  check("job_reaches_terminal_failure", finalStatus === "failed", `status=${finalStatus}`);

  // Refund policy OFF: credits are NOT returned, and nothing queues.
  check("refund_off_keeps_credits", (await api("GET", "/v1/account/me", undefined, session)).payload.account?.balanceCredits === 350, "no refund");
  const refundQueue = await api("GET", "/v1/admin/refunds", undefined, adminHeaders);
  check("refund_off_queues_nothing", (refundQueue.payload.pending ?? []).length === 0, `pending=${(refundQueue.payload.pending ?? []).length}`);
} finally {
  await new Promise((resolve) => server.close(resolve)).catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.commercial-policy-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing the default packages, auto-run, or the refund policy.",
    "Verify the real Atlas cost per video on your dashboard and tune the package ladder in the admin Settings tab."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
