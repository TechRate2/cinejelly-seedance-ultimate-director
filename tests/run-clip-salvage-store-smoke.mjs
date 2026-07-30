#!/usr/bin/env node
/**
 * No-spend regression for the rendered-clip salvage store.
 *
 * What it protects: a retry of a failed job must not pay again for clips it already bought. Renders
 * run concurrently, so when shot 7 of 10 fails inspection the earlier clips are already rendered and
 * billed, and they used to vanish with the exception — roughly $49 of finished work on a 60-second
 * cinematic order.
 *
 * Two properties matter more than the happy path, and both are asserted here:
 *   - ISOLATION. The Studio sends a hard-coded projectId ("short_create_shell") for every customer,
 *     which is why this store keys on requestId and cross-checks clientId. A record must be
 *     unreadable by any other account even if its requestId is known.
 *   - CONCURRENCY. Shots finish at the same time and each appends to one file. Without write
 *     serialization the second write drops the first shot, losing the very clip being protected.
 *
 * Pure: no network, no provider, no spend. Uses a throwaway temp directory.
 */

import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { RenderedClipSalvageStore, CLIP_SALVAGE_RETENTION_DAYS } =
  await import(`${base}/core/rendered-clip-salvage-store.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const roots = [];
function freshStore() {
  const root = mkdtempSync(join(tmpdir(), "clip-salvage-"));
  roots.push(root);
  return { store: new RenderedClipSalvageStore({ outputRoot: root }), root };
}

// --- 1. THE CORE PROMISE: what was rendered is what comes back.
{
  const { store } = freshStore();
  for (const index of [1, 2, 3]) {
    await store.recordShot({
      requestId: "req_alpha", clientId: "user_1",
      shotId: `shot_${index}`, predictionId: `pred_${index}`, modelId: "seedance-fast"
    });
  }
  const reusable = await store.reusableShots({ requestId: "req_alpha", clientId: "user_1" });
  check("records_every_successful_shot", reusable.size === 3, `size=${reusable.size}`);
  check("keeps_prediction_id", reusable.get("shot_2")?.predictionId === "pred_2", reusable.get("shot_2")?.predictionId);
  check("keeps_model_id_for_polling", reusable.get("shot_2")?.modelId === "seedance-fast");
  check("unknown_shot_is_absent", reusable.get("shot_9") === undefined);
}

// --- 2. ISOLATION. This is the check that matters most: projectId is shared by every Studio
// customer, so a store keyed carelessly would hand one customer another's footage.
{
  const { store } = freshStore();
  await store.recordShot({ requestId: "req_shared", clientId: "user_1", shotId: "shot_1", predictionId: "pred_secret", modelId: "m" });
  const otherUser = await store.reusableShots({ requestId: "req_shared", clientId: "user_2" });
  check("another_account_gets_nothing_even_with_the_request_id", otherUser.size === 0, `size=${otherUser.size}`);
  const anonymous = await store.reusableShots({ requestId: "req_shared" });
  check("anonymous_read_of_an_owned_record_gets_nothing", anonymous.size === 0, `size=${anonymous.size}`);
  const owner = await store.reusableShots({ requestId: "req_shared", clientId: "user_1" });
  check("owner_still_gets_their_own_clip", owner.size === 1);
  // An operator/CLI run has no clientId; it may read only other unowned records.
  await store.recordShot({ requestId: "req_cli", shotId: "shot_1", predictionId: "pred_cli", modelId: "m" });
  check("unowned_record_readable_by_unowned_run", (await store.reusableShots({ requestId: "req_cli" })).size === 1);
  check("unowned_record_not_readable_by_a_customer", (await store.reusableShots({ requestId: "req_cli", clientId: "user_1" })).size === 0);
}

// --- 3. A DIFFERENT JOB SHARES NOTHING. There is no content matching by design: a customer who
// edits their brief gets a new request and pays for it, rather than being served yesterday's video.
{
  const { store } = freshStore();
  await store.recordShot({ requestId: "req_one", clientId: "user_1", shotId: "shot_1", predictionId: "pred_one", modelId: "m" });
  check("a_second_job_reuses_nothing", (await store.reusableShots({ requestId: "req_two", clientId: "user_1" })).size === 0);
}

// --- 4. CONCURRENCY. Shots finish together; every one must survive.
{
  const { store } = freshStore();
  await Promise.all(Array.from({ length: 12 }, (_unused, index) =>
    store.recordShot({
      requestId: "req_parallel", clientId: "user_1",
      shotId: `shot_${index}`, predictionId: `pred_${index}`, modelId: "m"
    })));
  const reusable = await store.reusableShots({ requestId: "req_parallel", clientId: "user_1" });
  check("concurrent_writes_lose_no_shot", reusable.size === 12, `size=${reusable.size}`);
  const ids = [...reusable.values()].map((shot) => shot.predictionId);
  check("concurrent_writes_keep_the_right_ids", new Set(ids).size === 12);
}

// --- 5. RE-RECORDING A SHOT keeps the newest render — that is the one a retry should reuse.
{
  const { store } = freshStore();
  await store.recordShot({ requestId: "req_re", clientId: "user_1", shotId: "shot_1", predictionId: "pred_old", modelId: "m" });
  await store.recordShot({ requestId: "req_re", clientId: "user_1", shotId: "shot_1", predictionId: "pred_new", modelId: "m" });
  const reusable = await store.reusableShots({ requestId: "req_re", clientId: "user_1" });
  check("re_recording_replaces_not_duplicates", reusable.size === 1, `size=${reusable.size}`);
  check("re_recording_keeps_the_newest", reusable.get("shot_1")?.predictionId === "pred_new");
}

// --- 6. SEVEN-DAY LIFETIME (owner decision). Older records are neither served nor kept.
{
  const { store, root } = freshStore();
  check("retention_is_seven_days", CLIP_SALVAGE_RETENTION_DAYS === 7, String(CLIP_SALVAGE_RETENTION_DAYS));
  const stale = new Date(Date.now() - (CLIP_SALVAGE_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const dir = join(root, "clip-salvage");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "req_stale.json"), JSON.stringify({
    schemaVersion: "cinejelly.clip-salvage.v1",
    requestId: "req_stale", clientId: "user_1",
    createdAt: stale, updatedAt: stale,
    shots: [{ shotId: "shot_1", predictionId: "pred_stale", modelId: "m", recordedAt: stale }]
  }), "utf8");
  check("expired_record_is_not_reused", (await store.reusableShots({ requestId: "req_stale", clientId: "user_1" })).size === 0);
  await store.recordShot({ requestId: "req_fresh", clientId: "user_1", shotId: "shot_1", predictionId: "pred_fresh", modelId: "m" });
  const removed = await store.sweepExpired();
  check("sweep_removes_the_expired_record", removed === 1, `removed=${removed}`);
  check("sweep_keeps_the_fresh_record", (await store.reusableShots({ requestId: "req_fresh", clientId: "user_1" })).size === 1);
}

// --- 7. CORRUPTION AND ABUSE must degrade to "re-render", never to "reuse something wrong".
{
  const { store, root } = freshStore();
  const dir = join(root, "clip-salvage");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "req_corrupt.json"), "{ not json", "utf8");
  check("corrupt_record_reuses_nothing", (await store.reusableShots({ requestId: "req_corrupt", clientId: "user_1" })).size === 0);
  writeFileSync(join(dir, "req_nodate.json"), JSON.stringify({
    schemaVersion: "cinejelly.clip-salvage.v1", requestId: "req_nodate", clientId: "user_1",
    createdAt: "not-a-date", updatedAt: "not-a-date",
    shots: [{ shotId: "shot_1", predictionId: "p", modelId: "m", recordedAt: "not-a-date" }]
  }), "utf8");
  check("undateable_record_reuses_nothing", (await store.reusableShots({ requestId: "req_nodate", clientId: "user_1" })).size === 0);
  // A path-traversal requestId must not escape the store directory.
  await store.recordShot({ requestId: "../../escaped", clientId: "user_1", shotId: "shot_1", predictionId: "p", modelId: "m" });
  const escapedOutside = readdirSync(root).filter((entry) => entry !== "clip-salvage");
  check("request_id_cannot_escape_the_store_directory", escapedOutside.length === 0, escapedOutside.join(","));
  // Empty/blank identifiers are ignored rather than creating junk files.
  await store.recordShot({ requestId: "  ", clientId: "user_1", shotId: "s", predictionId: "p", modelId: "m" });
  await store.recordShot({ requestId: "req_blank", clientId: "user_1", shotId: "s", predictionId: "  ", modelId: "m" });
  check("blank_identifiers_are_ignored", (await store.reusableShots({ requestId: "req_blank", clientId: "user_1" })).size === 0);
}

// --- 8. Bookkeeping must never break a paid render. recordShot runs on the success path of a render
// that is already billed; an unwritable directory has to degrade to "not salvageable", not throw.
{
  const store = new RenderedClipSalvageStore({ outputRoot: " invalid-root" });
  let threw = false;
  try {
    await store.recordShot({ requestId: "req_x", clientId: "user_1", shotId: "s", predictionId: "p", modelId: "m" });
  } catch {
    threw = true;
  }
  check("record_failure_never_throws", threw === false);
  check("forget_never_throws", await store.forget("req_x").then(() => true).catch(() => false));
  check("sweep_never_throws_on_a_missing_directory", await store.sweepExpired().then((n) => n === 0).catch(() => false));
}

for (const root of roots) {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* temp dir */ }
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.clip-salvage-store-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "The isolation checks are the load-bearing ones: projectId is shared across all Studio customers, so any future change to the store key must keep them passing.",
    "Do not extend this into a content-addressed cache. Matching by prompt would let an edited brief return the previous video and let clips cross accounts - both were considered and rejected."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
