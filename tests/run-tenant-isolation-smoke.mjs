#!/usr/bin/env node
/**
 * No-spend regression for TENANT ISOLATION of shared resources.
 *
 * A security audit reproduced three attacks, all the same shape: a shared ceiling enforced globally
 * with no per-customer partition, so one free zero-credit account could destroy other customers' data
 * or take the product offline for everyone.
 *
 *   1. Channel-style library — 205 profiles from one account evicted the victim's saved profile
 *      entirely; their own profile id then returned 404.
 *   2. Conversation sessions — same eviction, and worse than data loss: the render route resolves its
 *      plan from the stored session, so the victim could no longer render a video they had planned.
 *   3. Uploads — the shared ceiling bounds bytes AND file count, but the per-account quota bounded
 *      bytes only. 4,999 one-byte files consumed the shared 5,000-file ceiling using 0.0005% of one
 *      account's 1 GB quota, and every other customer's upload then failed 507 permanently, because
 *      the retention janitor deliberately never touches uploads/.
 *
 * The rule these encode: a cap is a per-customer product limit, never a race between customers for a
 * shared pool. Pure: no network, no provider, no spend.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { retainNewestPerClient } = await import(`${base}/api/tenant-scoped-retention.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000);

// --- 1. THE ATTACK. One customer floods past the cap; the victim's single record must survive.
{
  const victim = { clientId: "victim", id: "v1", updatedAt: at(500) };
  const attacker = Array.from({ length: 205 }, (_unused, index) => ({
    clientId: "attacker", id: `a${index}`, updatedAt: at(200 - index * 0.1)
  }));
  const kept = retainNewestPerClient([...attacker, victim], 200);
  const victimKept = kept.filter((record) => record.clientId === "victim");
  const attackerKept = kept.filter((record) => record.clientId === "attacker");
  check("flood_does_not_evict_the_victim", victimKept.length === 1, `victim records kept=${victimKept.length}`);
  check("victim_record_is_the_same_one", victimKept[0]?.id === "v1", victimKept[0]?.id);
  check("attacker_is_trimmed_to_their_own_limit", attackerKept.length === 200, `attacker kept=${attackerKept.length}`);
}

// --- 2. The victim's record is the OLDEST in the file, which is exactly what a global newest-N trim
// throws away first. That ordering is the whole attack, so it is asserted directly.
{
  const oldestVictim = { clientId: "victim", id: "old", updatedAt: at(10_000) };
  const fresh = Array.from({ length: 300 }, (_unused, index) => ({
    clientId: "attacker", id: `a${index}`, updatedAt: at(index)
  }));
  const kept = retainNewestPerClient([...fresh, oldestVictim], 200);
  check("oldest_record_in_the_file_survives_if_its_owner_is_under_cap",
    kept.some((record) => record.id === "old"));
}

// --- 3. Many customers each keep their own allowance; nobody's writes shrink anyone else.
{
  const records = [];
  for (const owner of ["a", "b", "c", "d"]) {
    for (let index = 0; index < 250; index += 1) {
      records.push({ clientId: owner, id: `${owner}${index}`, updatedAt: at(index) });
    }
  }
  const kept = retainNewestPerClient(records, 200);
  const perOwner = new Map();
  for (const record of kept) {
    perOwner.set(record.clientId, (perOwner.get(record.clientId) ?? 0) + 1);
  }
  check("every_customer_keeps_their_full_allowance",
    [...perOwner.values()].every((count) => count === 200) && perOwner.size === 4,
    JSON.stringify([...perOwner]));
}

// --- 4. Unowned records (operator/CLI writes) are their own partition, not a bucket a customer can
// flood into or be evicted from.
{
  const kept = retainNewestPerClient([
    { id: "cli1", updatedAt: at(9000) },
    { id: "cli2", updatedAt: at(8000) },
    ...Array.from({ length: 205 }, (_unused, index) => ({ clientId: "attacker", id: `a${index}`, updatedAt: at(index) }))
  ], 200);
  check("unowned_records_are_their_own_partition",
    kept.filter((record) => record.clientId === undefined).length === 2);
}

// --- 5. Edge cases must degrade to "keep something sane", never to "keep nothing".
{
  check("empty_input_is_empty_output", retainNewestPerClient([], 200).length === 0);
  check("zero_limit_still_keeps_one_per_owner",
    retainNewestPerClient([{ clientId: "a", id: "1", updatedAt: at(1) }], 0).length === 1);
  const dupTimes = Array.from({ length: 5 }, (_unused, index) => ({ clientId: "a", id: `x${index}`, updatedAt: at(1) }));
  check("identical_timestamps_do_not_lose_records", retainNewestPerClient(dupTimes, 200).length === 5);
  check("output_is_newest_first", (() => {
    const kept = retainNewestPerClient([
      { clientId: "a", id: "old", updatedAt: at(100) },
      { clientId: "b", id: "new", updatedAt: at(1) }
    ], 200);
    return kept[0]?.id === "new";
  })());
}

// --- 6. BOTH STORES must actually use it. The helper being correct is worthless if a store still
// trims globally, and that is a one-line regression away.
const styleSource = readFileSync(resolve(repoRoot, "src/api/short-channel-style-library-store.ts"), "utf8");
const sessionSource = readFileSync(resolve(repoRoot, "src/api/short-pipeline-session-store.ts"), "utf8");
for (const [label, source] of [["channel_style", styleSource], ["session", sessionSource]]) {
  check(`${label}_store_uses_per_client_retention`, source.includes("retainNewestPerClient("));
  check(`${label}_store_has_no_global_slice`, !/\.slice\(0,\s*this\.max/u.test(source),
    (source.match(/\.slice\(0,\s*this\.max\w+\)/u) ?? ["none"])[0]);
}

// --- 7. UPLOADS: the per-account quota must bound FILE COUNT, not only bytes.
const serverSource = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
check("uploads_track_per_user_file_count", /perUserFiles/.test(serverSource));
check("uploads_enforce_a_per_user_file_quota",
  /perUserFiles\.get\(uploaderId\)[^\n]*>\s*perUserMaxFiles/.test(serverSource),
  (serverSource.match(/perUserFiles\.get\(uploaderId\)[^\n]{0,60}/u) ?? ["missing"])[0]);
check("per_user_file_quota_is_configurable",
  /CINEJELLY_UPLOADS_PER_USER_MAX_FILES/.test(serverSource));
check("per_user_file_quota_is_below_the_shared_ceiling", (() => {
  const perUser = Number((serverSource.match(/DEFAULT_UPLOADS_PER_USER_MAX_FILES = ([\d_]+)/u) ?? [])[1]?.replace(/_/g, ""));
  const shared = Number((serverSource.match(/DEFAULT_UPLOADS_MAX_FILES = ([\d_]+)/u) ?? [])[1]?.replace(/_/g, ""));
  return Number.isFinite(perUser) && Number.isFinite(shared) && perUser > 0 && perUser < shared;
})(), (() => {
  const perUser = (serverSource.match(/DEFAULT_UPLOADS_PER_USER_MAX_FILES = ([\d_]+)/u) ?? [])[1];
  const shared = (serverSource.match(/DEFAULT_UPLOADS_MAX_FILES = ([\d_]+)/u) ?? [])[1];
  return `per-user=${perUser} shared=${shared}`;
})());
// The per-user count check must run on the SAME request path as the byte check, or one of them is
// reachable while the other is not.
const uploadBlock = serverSource.slice(
  serverSource.indexOf("const perUserMaxBytes"),
  serverSource.indexOf("const perUserMaxBytes") + 1600
);
check("both_upload_quotas_are_on_the_same_path",
  uploadBlock.includes("perUserMaxBytes") && uploadBlock.includes("perUserMaxFiles"));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.tenant-isolation-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Any shared ceiling needs a per-customer partition. If you add another shared store, add it here.",
    "The file grows with customer count rather than being globally bounded - that is deliberate. Bounded storage is an operator task with a scheduled answer; cross-customer deletion is a defect with none."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
