#!/usr/bin/env node
/**
 * UI <-> API contract cross-check.
 * Static-but-exhaustive: for every page the product ships (customer studio, operator
 * top-up desk, operator launch dashboard) verify that (1) every element id the page's
 * JavaScript touches actually exists in its HTML — dead buttons and typos fail here;
 * (2) every API path the JavaScript fetches (including data-*-endpoint attributes) exists
 * as a route in the server source; (3) every data-upload-for target is a real input.
 * No server boot, no network, no spend.
 */

import { readFileSync } from "node:fs";

const { buildShortPipelineCreatePage } = await import("../dist/api/short-pipeline-create-page.js");
const { buildOperatorTopupPage } = await import("../dist/api/operator-topup-page.js");
const { buildOperatorLaunchDashboardPage } = await import("../dist/api/operator-launch-dashboard-page.js");
const serverSource = readFileSync(new URL("../src/api/server.ts", import.meta.url), "utf8");

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

const PAGES = [
  { name: "studio", html: buildShortPipelineCreatePage() },
  { name: "topup_desk", html: buildOperatorTopupPage() },
  { name: "launch_dashboard", html: buildOperatorLaunchDashboardPage() }
];

// --- 1. Every JS-referenced element id exists in the HTML.
for (const page of PAGES) {
  const referencedIds = new Set(
    [...page.html.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1])
  );
  for (const match of page.html.matchAll(/querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g)) {
    referencedIds.add(match[1]);
  }
  const missing = [...referencedIds].filter((id) => !new RegExp(`id="${id}"`).test(page.html));
  check(`${page.name}_all_js_ids_exist_in_html`, missing.length === 0, missing.slice(0, 8).join(", "));
}

// --- 2. Every fetched API path maps to a server route.
function routeExists(path) {
  const normalized = path.replace(/\{[^}]+\}/g, "([^/]+)");
  if (serverSource.includes(`"${path}"`)) {
    return true;
  }
  // Parameterized endpoints: match against the server's regex route definitions.
  const fragments = normalized.split("([^/]+)").filter((fragment) => fragment.length > 1);
  return fragments.every((fragment) => serverSource.includes(fragment.replace(/\//g, "\\/")) || serverSource.includes(fragment));
}
for (const page of PAGES) {
  const endpoints = new Set();
  for (const match of page.html.matchAll(/fetch\(\s*["'](\/[^"']+)["']/g)) {
    endpoints.add(match[1].split("?")[0]);
  }
  for (const match of page.html.matchAll(/fetch\(\s*["'](\/[^"']+?)["']\s*\+/g)) {
    endpoints.add(match[1].split("?")[0] + "{param}");
  }
  for (const match of page.html.matchAll(/data-[a-z-]*endpoint="([^"]+)"/g)) {
    endpoints.add(match[1]);
  }
  const unroutable = [...endpoints].filter((endpoint) => {
    const cleaned = endpoint.replace(/\{param\}$/, "").replace(/\/$/, "");
    return !routeExists(endpoint) && !routeExists(cleaned);
  });
  check(`${page.name}_all_fetched_paths_have_routes`, unroutable.length === 0, unroutable.slice(0, 6).join(", "));
}

// --- 3. Upload buttons target real inputs; modal close buttons target real modals.
const studio = PAGES[0].html;
const uploadTargets = [...studio.matchAll(/data-upload-for="([^"]+)"/g)].map((match) => match[1]);
check(
  "studio_upload_targets_exist",
  uploadTargets.length >= 7 && uploadTargets.every((id) => studio.includes(`id="${id}"`)),
  uploadTargets.filter((id) => !studio.includes(`id="${id}"`)).join(", ")
);
const closeTargets = [...studio.matchAll(/data-close-modal="([^"]+)"/g)].map((match) => match[1]);
check("studio_modal_close_targets_exist", closeTargets.length >= 2 && closeTargets.every((id) => studio.includes(`id="${id}"`)));

// --- 4. The customer journey controls all exist on the studio page.
const REQUIRED_STUDIO_IDS = [
  "open-auth", "auth-modal", "auth-email", "auth-password", "auth-submit", "tab-login", "tab-register",
  "open-topup", "topup-modal", "package-grid", "topup-submit", "balance-status", "credit-estimate",
  "prompt", "duration", "platform", "submit-render", "confirm-render", "logout-btn"
];
const missingRequired = REQUIRED_STUDIO_IDS.filter((id) => !studio.includes(`id="${id}"`));
check("studio_customer_journey_controls_present", missingRequired.length === 0, missingRequired.join(", "));

// --- 5b. Money copy must not promise unconditional auto-refund (default policy is manual).
check("studio_refund_copy_is_policy_aware", studio.includes('refundPolicy === "auto"') && !studio.includes("credits đã được hoàn tự động. Hãy thử lại"));

// --- 5. No template-literal leakage into browser JS (String.raw hazards).
for (const page of PAGES) {
  check(`${page.name}_no_unescaped_template_leakage`, !page.html.includes("undefined${") && !page.html.includes("[object Object]"));
}

// --- 6. Redub feature + 3-language i18n + collapsible help ship on the studio page.
const REQUIRED_REDUB_IDS = [
  "open-redub-top", "redub-modal", "redub-source", "redub-source-language", "redub-dub-language",
  "redub-subtitle-langs", "redub-voice-style", "redub-audio-treatment", "redub-price-line",
  "redub-error", "redub-run", "redub-result", "redub-job-line", "lang-switch"
];
const missingRedub = REQUIRED_REDUB_IDS.filter((id) => !studio.includes(`id="${id}"`));
check("studio_redub_controls_present", missingRedub.length === 0, missingRedub.join(", "));
check("studio_redub_calls_server_route", studio.includes('fetch("/v1/redub/plans"') && serverSource.includes('"/v1/redub/plans"'));
check(
  "studio_i18n_three_languages",
  studio.includes("const I18N") && ["vi: {", "en: {", "zh: {"].every((markers) => studio.includes(markers)) &&
    (studio.match(/data-i18n=/g) || []).length >= 120,
  `attrs=${(studio.match(/data-i18n=/g) || []).length}`
);
check("studio_language_switcher_persists", studio.includes("cinejelly_lang"));
check("studio_collapsible_help_blocks", (studio.match(/class="cj-help"/g) || []).length >= 6, `count=${(studio.match(/class="cj-help"/g) || []).length}`);
check("studio_redub_srt_download_client_side", studio.includes('"subtitle_" + (track.language || "xx") + ".srt"'));
check("studio_redub_per_job_button", studio.includes("openRedubForJob"));

// --- 6b. Redub route (money): the long synchronous paid work must be tied to the client
// connection so a disconnect refunds/queues instead of silently keeping the charge, and the
// charge/refund plumbing must bracket the provider work.
check(
  "server_redub_wires_client_disconnect_to_abort",
  serverSource.includes('response.on("close", onRedubClientGone)') && serverSource.includes("redubAbort.abort("),
  "redub route must abort provider work when the client disconnects"
);
check(
  "server_redub_guards_delivery_before_charge_kept",
  serverSource.includes("redubAbort.signal.aborted || response.writableEnded || response.destroyed"),
  "redub route must not keep the charge when it cannot deliver the result"
);
check(
  "server_redub_refunds_on_failure",
  serverSource.includes("userAccountStore.refundRender({ userId: redubCharge.userId") &&
    serverSource.includes("userAccountStore.queueRefundRequest({ userId: redubCharge.userId"),
  "redub failure must refund (auto) or queue (manual) the charge"
);
check(
  "server_redub_settlement_matches_refund_policy",
  // Under refundPolicy "off" the redub charge must be kept like a failed render — the queue
  // path is gated on "manual" only, never the catch-all else that would leak an "off" refund.
  serverSource.includes('redubPolicy === "auto"') && serverSource.includes('redubPolicy === "manual"'),
  "redub failure settlement must be three-way (auto/manual/off), not auto-vs-else"
);

// --- 7. Every shipped page's <script> parses as valid JavaScript (String.raw templates
// can hide browser-only syntax errors that no TypeScript check catches).
{
  const { writeFileSync, rmSync: rmTemp } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  for (const page of PAGES) {
    const scriptMatch = page.html.match(/<script>([\s\S]*)<\/script>/);
    let parses = false;
    let detail = "no <script> found";
    if (scriptMatch) {
      const tmpUrl = new URL(`./.tmp-${page.name}-script.mjs`, import.meta.url);
      const tmpPath = fileURLToPath(tmpUrl);
      try {
        writeFileSync(tmpPath, scriptMatch[1]);
        execFileSync(process.execPath, ["--check", tmpPath], { stdio: "pipe" });
        parses = true;
        detail = "";
      } catch (error) {
        detail = String(error.stderr ?? error.message).slice(0, 160);
      } finally {
        try { rmTemp(tmpPath, { force: true }); } catch { /* best effort */ }
      }
    }
    check(`${page.name}_page_script_parses`, parses, detail);
  }
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.ui-contract-crosscheck-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this cross-check passing whenever page JS, element ids, or API routes change.",
    "A failure here means a button or call in the shipped UI cannot work — fix before launch."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
