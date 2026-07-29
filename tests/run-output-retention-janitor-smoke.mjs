#!/usr/bin/env node
/**
 * No-spend safety regression for the auto disk-janitor. It MUST delete old render output (work/redub
 * child dirs past the retention window) while NEVER touching the money/state files or customer data
 * that share the output root: user-accounts.json, admin-settings.json, uploads/, backups/, series/.
 * Also proves it is inert when disabled (retentionDays = 0) and skips recent (in-progress) renders.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OutputRetentionJanitor } from "../dist/core/output-retention-janitor.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}

const root = join(tmpdir(), `cinejelly-janitor-${process.pid}-${Math.floor(Math.random() * 1e6)}`);
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const seedFile = (rel, ageDays) => {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "x");
  const t = new Date(now - ageDays * DAY);
  utimesSync(p, t, t);
};
const seedDir = (rel, ageDays) => {
  const p = join(root, rel);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "content.mp4"), "video");
  const t = new Date(now - ageDays * DAY);
  utimesSync(p, t, t); // set the DIR mtime (what the janitor checks)
};

try {
  // STATE / customer data under the root — must ALL survive any sweep.
  seedFile("user-accounts.json", 400);
  seedFile("admin-settings.json", 400);
  seedFile("uploads/kol-face.png", 400);
  seedFile("backups/2024.json", 400);
  seedFile("series/u1_drama/ep1/final.mp4", 400); // customer episode (series/ not in the allowlist)
  seedFile("business-readiness/report.json", 400);
  // RENDER OUTPUT — old ones should be cleaned, recent ones (in-progress) skipped.
  seedDir("work/old_render_req", 40);
  seedDir("work/active_render_req", 1);
  seedDir("redub/redub_old_uuid", 40);
  seedDir("redub/redub_recent_uuid", 2);

  // 1. Disabled janitor (retentionDays 0) deletes NOTHING.
  const off = new OutputRetentionJanitor({ outputRoot: root, retentionDays: 0 });
  check("janitor_disabled_by_default", off.enabled === false);
  const offResult = await off.sweep(now);
  check("disabled_deletes_nothing", offResult.deletedCount === 0 && existsSync(join(root, "work/old_render_req")));

  // 2. Enabled at 30 days: deletes old render output only.
  const janitor = new OutputRetentionJanitor({ outputRoot: root, retentionDays: 30 });
  const result = await janitor.sweep(now);
  check("deletes_old_render_output", result.deletedCount === 2, `deleted=${result.deletedCount}`);
  check("old_work_dir_deleted", !existsSync(join(root, "work/old_render_req")));
  check("old_redub_dir_deleted", !existsSync(join(root, "redub/redub_old_uuid")));
  // 3. Recent (in-progress) renders are skipped.
  check("recent_work_dir_kept", existsSync(join(root, "work/active_render_req")));
  check("recent_redub_dir_kept", existsSync(join(root, "redub/redub_recent_uuid")));
  // 4. THE CRITICAL SAFETY INVARIANT — money/state/customer data is untouched.
  check("accounts_db_survives", existsSync(join(root, "user-accounts.json")));
  check("admin_settings_survives", existsSync(join(root, "admin-settings.json")));
  check("uploads_survive", existsSync(join(root, "uploads/kol-face.png")));
  check("backups_survive", existsSync(join(root, "backups/2024.json")));
  check("series_episodes_survive", existsSync(join(root, "series/u1_drama/ep1/final.mp4")));
  check("business_readiness_survives", existsSync(join(root, "business-readiness/report.json")));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.output-retention-janitor-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this GREEN whenever changing OutputRetentionJanitor — the state/customer-data survival checks are the safety guarantee.",
    "The janitor is allowlist-only (work/, redub/): to clean another render-output dir, add its name explicitly and re-run this test."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
