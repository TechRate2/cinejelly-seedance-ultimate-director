#!/usr/bin/env node
/**
 * No-spend regression for the shared SSRF guard (src/utils/ssrf-guard.ts) that every server-side
 * media fetch (audio-mix, assembly, product-URL redirect) now runs before fetch(). Uses IP
 * LITERALS only so no real DNS/network is touched (hostnameResolvesToPrivate short-circuits on a
 * literal IP). Verifies private/loopback/link-local ranges are rejected and public literals pass.
 */

import { isPrivateIpLiteral, isLocalHost, assertPublicHttpsFetchTarget, ssrfSafeFetch } from "../dist/utils/ssrf-guard.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}
async function throws(url) {
  try { await assertPublicHttpsFetchTarget(url); return false; } catch { return true; }
}

// ---- private/loopback/link-local IP literals rejected ----
for (const ip of ["10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "127.0.0.1", "169.254.1.1", "0.0.0.0", "::1", "::", "fd00::1", "fc00::1", "fe80::1"]) {
  check(`private_${ip}`, isPrivateIpLiteral(ip) === true, ip);
}
// ---- public IP literals allowed ----
for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.9", "2606:4700:4700::1111"]) {
  check(`public_${ip}`, isPrivateIpLiteral(ip) === false, ip);
}
// 172.15/172.32 are NOT in the private 172.16-31 block.
check("172_15_public", isPrivateIpLiteral("172.15.0.1") === false);
check("172_32_public", isPrivateIpLiteral("172.32.0.1") === false);

// ---- isLocalHost covers names + literals ----
check("localhost_name", isLocalHost("localhost") === true);
check("dot_local", isLocalHost("printer.local") === true);
check("dot_internal", isLocalHost("api.internal") === true);
check("private_literal_host", isLocalHost("10.0.0.5") === true);
check("public_name_not_local", isLocalHost("example.com") === false);

// ---- assertPublicHttpsFetchTarget: reject unsafe, allow public literal (no DNS on literals) ----
check("reject_http", await throws("http://example.com/x"));
check("reject_creds", await throws("https://user:pass@example.com/x"));
check("reject_private_ip", await throws("https://10.0.0.5/internal"));
check("reject_loopback_v6", await throws("https://[::1]/x"));
check("reject_localhost", await throws("https://localhost/x"));
check("reject_linklocal_metadata", await throws("https://169.254.169.254/latest/meta-data"));
check("reject_invalid_url", await throws("not a url"));
check("allow_public_ip_literal", (await throws("https://8.8.8.8/ok")) === false);

// ---- IPv4-mapped / compat IPv6 must NOT bypass the guard (pre-spend final-audit finding [1]) ----
for (const mapped of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.5", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:192.168.1.1"]) {
  check(`mapped_private_${mapped}`, isPrivateIpLiteral(mapped) === true, mapped);
}
check("mapped_public_8888_allowed", isPrivateIpLiteral("::ffff:8.8.8.8") === false);
check("linklocal_febf", isPrivateIpLiteral("febf::1") === true);
check("ula_fd", isPrivateIpLiteral("fd12:3456::1") === true);
check("public_v6_allowed", isPrivateIpLiteral("2606:4700:4700::1111") === false);
check("reject_mapped_loopback_url", await throws("https://[::ffff:127.0.0.1]/x"));
check("reject_mapped_metadata_url", await throws("https://[::ffff:169.254.169.254]/latest"));
// ssrfSafeFetch validates BEFORE any network — a private target rejects without issuing a request.
let safeFetchRejected = false;
try { await ssrfSafeFetch("https://10.0.0.5/internal"); } catch { safeFetchRejected = true; }
check("ssrfSafeFetch_rejects_private_pre_network", safeFetchRejected);
let safeFetchRejectsHttp = false;
try { await ssrfSafeFetch("http://example.com/x"); } catch { safeFetchRejectsHttp = true; }
check("ssrfSafeFetch_rejects_http", safeFetchRejectsHttp);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.ssrf-guard-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep green when touching src/utils/ssrf-guard.ts or the fetch call sites in audio-mix-engine/assembly-engine/product-url-researcher.",
    "assertPublicHttpsFetchTarget must run before every server-side fetch of a caller-influenced URL."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
