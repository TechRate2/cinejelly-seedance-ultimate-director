#!/usr/bin/env node
/**
 * No-spend regression for the WIRE CONTRACT between the Studio page and the server.
 *
 * Why this exists: making the product name configurable rewrote every "CineJelly" in the Studio page
 * to an interpolated brand variable — including four that were not display text at all but HTTP
 * HEADER NAMES. `X-CineJelly-Session` became `X-AI Video Studio-Session`, which the server never
 * reads and which is not even a legal header name. Login broke completely, and nothing caught it:
 * every existing check exercised the server or the planner, and none compared the two sides of the
 * wire. The build was clean, the suite was green, and no customer could sign in.
 *
 * The lesson generalises past branding. Any identifier shared between the page and the server —
 * header names, storage keys, status strings — is a contract, and a contract only holds if something
 * checks both ends. That is what this file does.
 *
 * Pure: reads both sources, no network, no spend.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
const serverSource = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
const authSource = readFileSync(resolve(repoRoot, "src/api/api-auth.ts"), "utf8");

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// --- 1. NO HEADER NAME MAY BE INTERPOLATED. A header name is a fixed wire token; the moment it
// contains a template expression it depends on configuration, and a rebrand silently breaks auth.
const interpolatedHeaders = [...pageSource.matchAll(/["'`]X-[^"'`\n]*\$\{[^"'`\n]*["'`]/g)].map((match) => match[0]);
check("no_header_name_is_built_from_a_variable", interpolatedHeaders.length === 0,
  interpolatedHeaders.join(" | ") || "none");

// A header name with a space in it is never valid, whatever produced it.
const spacedHeaders = [...pageSource.matchAll(/["'`]X-[A-Za-z0-9-]* [^"'`\n]*["'`]/g)].map((match) => match[0]);
check("no_header_name_contains_a_space", spacedHeaders.length === 0, spacedHeaders.join(" | ") || "none");

// --- 2. EVERY HEADER THE PAGE SENDS MUST BE ONE THE SERVER READS.
// Node lowercases incoming header names, so the comparison is case-insensitive by design.
const pageSentHeaders = [...pageSource.matchAll(/headers\[["'`](X-[A-Za-z0-9-]+)["'`]\]/g)]
  .map((match) => match[1].toLowerCase());
const uniqueSent = [...new Set(pageSentHeaders)];
check("page_sends_at_least_the_session_and_key_headers", uniqueSent.length >= 2, uniqueSent.join(","));
const unreadBySever = uniqueSent.filter((header) =>
  !serverSource.toLowerCase().includes(`"${header}"`) && !authSource.toLowerCase().includes(`"${header}"`));
check("every_header_the_page_sends_is_read_somewhere", unreadBySever.length === 0,
  unreadBySever.join(",") || "all read");

// --- 3. EVERY HEADER THE PAGE READS BACK MUST BE ONE THE SERVER SENDS.
// This is the direction that broke: the page read a response header name the server never wrote, so
// the login "succeeded" and then threw "Máy chủ không trả phiên đăng nhập".
const pageReadHeaders = [...pageSource.matchAll(/headers\.get\(["'`](X-[A-Za-z0-9-]+)["'`]\)/g)]
  .map((match) => match[1].toLowerCase());
const uniqueRead = [...new Set(pageReadHeaders)];
check("page_reads_the_session_token_header", uniqueRead.includes("x-cinejelly-session-token"), uniqueRead.join(","));
const neverSent = uniqueRead.filter((header) => !serverSource.toLowerCase().includes(`"${header}"`));
check("every_header_the_page_reads_is_sent_by_the_server", neverSent.length === 0,
  neverSent.join(",") || "all sent");

// --- 4. BROWSER STORAGE KEYS are the same kind of contract with the customer's own browser:
// renaming one signs everybody out. They must stay literal too.
const storageCalls = [...pageSource.matchAll(/localStorage\.(?:get|set|remove)Item\(([^)]*)\)/g)].map((match) => match[1]);
const interpolatedStorage = storageCalls.filter((argument) => argument.includes("${"));
check("no_storage_key_is_built_from_a_variable", interpolatedStorage.length === 0,
  interpolatedStorage.join(" | ") || "none");

// --- 5. The brand variable must still reach the places it SHOULD: visible copy.
check("brand_still_used_in_the_page_title", /<title>\$\{brandStudio\}<\/title>/.test(pageSource));
check("brand_still_used_in_the_header", /class="brand-name">\$\{brand\}</.test(pageSource));
check("brand_comes_from_config", /from "\.\.\/config\/product-identity\.js"/.test(pageSource));
// And no literal old brand name should remain in customer-visible copy.
const visibleBrandLeaks = pageSource
  .split("\n")
  .map((line, index) => ({ line, number: index + 1 }))
  .filter((entry) => /CineJelly/.test(entry.line))
  .filter((entry) => !/X-CineJelly-|cinejelly_[a-z]/.test(entry.line));
check("no_literal_brand_left_in_visible_copy", visibleBrandLeaks.length === 0,
  visibleBrandLeaks.map((entry) => `${entry.number}: ${entry.line.trim().slice(0, 70)}`).join(" | ") || "none");

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.wire-contract-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Any identifier shared between the page and the server is a contract: header names, storage keys, status strings. Add it here when you add one.",
    "Display text may be interpolated from config. Wire tokens may not - that distinction is the whole point of this file."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
