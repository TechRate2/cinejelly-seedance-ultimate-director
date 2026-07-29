#!/usr/bin/env node
/**
 * No-spend regression for the security hardening applied after the adversarial red-team:
 *  - the per-IP rate limiter keys on the RIGHT-most X-Forwarded-For hop (the one the trusted
 *    proxy appends), so spoofing the left-most value no longer mints a fresh bucket per request;
 *  - the uploads directory enforces a total-size ceiling (disk-exhaustion guard);
 *  - outbound error strings have embedded absolute filesystem paths redacted;
 *  - the product-URL SSRF guard blocks private/loopback IP hosts.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// ---- Part A: pure-function / class units (no server). ----
const { redactEmbeddedLocalPaths } = await import("../dist/api/api-response-redaction.js");
const winLeak = redactEmbeddedLocalPaths("ENOSPC: no space left, open 'C:\\Users\\Admin\\secret\\up_ab.mp4'");
check("redact_windows_path_in_error", !winLeak.includes("C:\\Users") && winLeak.includes("[REDACTED_LOCAL_PATH]"), winLeak);
const posixLeak = redactEmbeddedLocalPaths("EACCES open /home/deploy/app/assets/output_deliverables/x");
check("redact_posix_path_in_error", !posixLeak.includes("/home/deploy") && posixLeak.includes("[REDACTED_LOCAL_PATH]"), posixLeak);
check("redact_keeps_clean_text", redactEmbeddedLocalPaths("Balance not enough: need 50 credits.") === "Balance not enough: need 50 credits.");

// SSRF: private/loopback IP-literal hosts must be blocked before any fetch leaves the box.
const { ProductUrlResearcher } = await import("../dist/core/product-url-researcher.js");
let fetchCalled = false;
const researcher = new ProductUrlResearcher({
  fetch: async () => {
    fetchCalled = true;
    return { url: "https://8.8.8.8/", status: 200, headers: new Map(), body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {}, releaseLock: () => {} }) } };
  }
});
const loopback = await researcher.research({ productUrl: "https://127.0.0.1/p", confirmLiveNetwork: true });
check("ssrf_blocks_loopback_ip", loopback.status === "blocked_localhost" || loopback.status === "blocked_by_unsafe_url", `status=${loopback.status}`);
const privateIp = await researcher.research({ productUrl: "https://10.0.0.5/admin", confirmLiveNetwork: true });
check("ssrf_blocks_private_ip", privateIp.status === "blocked_localhost" || privateIp.status === "blocked_by_unsafe_url", `status=${privateIp.status}`);
check("ssrf_never_fetched_private_hosts", fetchCalled === false);

// ---- Part B: rate-limit keying + upload cap over real HTTP. ----
const workDir = mkdtempSync(join(tmpdir(), "cinejelly-security-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
// Rate limiter ENABLED, proxy headers trusted (the shipped Docker topology).
delete process.env.CINEJELLY_DISABLE_API_RATE_LIMIT;
process.env.CINEJELLY_TRUST_PROXY_HEADERS = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "security_admin_token_0123456789ab";
process.env.CINEJELLY_TOPUP_BANK_INFO = "VCB 0123456789 - SECURITY";
process.env.CINEJELLY_OUTPUT_DIR = workDir;
process.env.CINEJELLY_UPLOADS_TOTAL_MAX_BYTES = "120"; // tiny cap to prove the disk guard

const { startServer } = await import("../dist/api/server.js");
const baseUrl = `http://127.0.0.1:${port}`;
const server = startServer(port);
try {
  await waitForHealth();

  // XFF: a flood with rotating LEFT-most hop but a FIXED right-most (real client) hop must be
  // rate-limited — the attacker cannot mint a fresh bucket by spoofing the left value.
  let sawLimit = false;
  for (let i = 0; i < 40; i += 1) {
    const res = await fetch(`${baseUrl}/v1/account/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `9.9.${i}.1, 203.0.113.7` },
      body: JSON.stringify({ email: "not-an-email", password: "x" }) // 400 fast, no scrypt
    });
    if (res.status === 429) { sawLimit = true; break; }
  }
  check("xff_leftmost_spoof_does_not_bypass_limit", sawLimit);

  // Control: rotating the RIGHT-most (real) hop is a genuinely different client each time and
  // must NOT be collapsed into one bucket — i.e. keying is on the right-most hop.
  let distinctClientsLimited = false;
  for (let i = 0; i < 40; i += 1) {
    const res = await fetch(`${baseUrl}/v1/account/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `9.9.9.9, 198.51.100.${i}` },
      body: JSON.stringify({ email: "not-an-email", password: "x" })
    });
    if (res.status === 429) { distinctClientsLimited = true; break; }
  }
  check("xff_distinct_real_clients_not_collapsed", distinctClientsLimited === false);

  // Upload total-size cap: first small upload fits under 120 bytes, the second exceeds it -> 507.
  const reg = await fetch(`${baseUrl}/v1/account/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `1.1.1.1, 8.8.4.4` },
    body: JSON.stringify({ email: "up@shop.vn", password: "matkhau123" })
  });
  const session = reg.headers.get("x-cinejelly-session-token");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  async function upload(clientIp) {
    return fetch(`${baseUrl}/v1/uploads`, {
      method: "POST",
      headers: { "X-CineJelly-Session": session, "Content-Type": "application/octet-stream", "X-File-Name": "k.png", "X-Forwarded-For": `1.1.1.1, ${clientIp}` },
      body: png
    });
  }
  const firstUpload = await upload("8.8.4.5");
  check("first_upload_under_cap_ok", firstUpload.status === 201, `status=${firstUpload.status}`);
  const secondUpload = await upload("8.8.4.6");
  check("second_upload_over_total_cap_507", secondUpload.status === 507, `status=${secondUpload.status}`);
} finally {
  await new Promise((resolve) => server.close(resolve)).catch(() => {});
  rmSync(workDir, { recursive: true, force: true });
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

const failed = checks.filter((item) => !item.pass);
// ---- Part D: the page Content-Security-Policy. ----
// Nothing checked the CSP, which is how it shipped locking the product's own main feature: the
// Studio fetches the finished MP4 and plays it from a blob: URL, and with no media-src directive
// that load fell through to `default-src 'none'` and the browser blocked it silently — the "Xem"
// button opened a player that never started. Both halves are asserted: the policy must stay
// deny-by-default AND must permit exactly the media the product itself serves.
const { readFileSync: readServerSource } = await import("node:fs");
const serverSource = readServerSource(new URL("../src/api/server.ts", import.meta.url), "utf8");
const cspBlock = serverSource.slice(
  serverSource.indexOf("const HTML_CONTENT_SECURITY_POLICY"),
  serverSource.indexOf("].join(\"; \");", serverSource.indexOf("const HTML_CONTENT_SECURITY_POLICY"))
);
check("csp_is_deny_by_default", cspBlock.includes("default-src 'none'"), cspBlock.slice(0, 120));
check("csp_allows_blob_media_so_the_player_works", /media-src[^"]*blob:/u.test(cspBlock),
  "media-src directive: " + (cspBlock.match(/"media-src[^"]*"/u)?.[0] ?? "MISSING"));
check("csp_media_src_is_not_wide_open", !/media-src[^"]*\*/u.test(cspBlock));
check("csp_still_blocks_framing", cspBlock.includes("frame-ancestors 'none'"));
check("csp_still_blocks_form_hijack", cspBlock.includes("form-action 'self'"));
// The player only ever plays media this server produced; if that changes the directive must be
// revisited deliberately rather than widened by accident.
check("studio_player_uses_blob_url",
  readServerSource(new URL("../src/api/short-pipeline-create-page.ts", import.meta.url), "utf8")
    .includes("video.src = objectUrl"));

const report = {
  schemaVersion: "cinejelly.security-hardening-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this passing when changing rate-limit keying, upload limits, error redaction, or the SSRF guard.",
    "Re-run the full adversarial red-team after any change to auth, money, or the request pipeline."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
