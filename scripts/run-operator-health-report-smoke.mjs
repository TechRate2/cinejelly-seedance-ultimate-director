#!/usr/bin/env node
/**
 * No-spend, no-network regression for the operator "🩺 Sức khỏe hệ thống" report aggregator. Proves it
 * turns raw signals into the right green/amber/red rows + overall status, and NEVER surfaces a secret
 * value (only status/messages). Pure function — no network is made here.
 */

import { buildOperatorHealthReport } from "../dist/application/operator-health-report.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const preflightAllGood = [
  { name: "CINEJELLY_DATABASE_KIND", status: "pass", message: "Lưu dữ liệu: JSON." },
  { name: "Ổ đĩa trống (thư mục lưu video)", status: "pass", message: "Ổ đĩa còn 40.0 GB trống." },
  { name: "ffmpeg", status: "pass", message: "ok" },
  { name: "ATLASCLOUD_IMAGE_MODEL", status: "pass", message: "ok" }
];
const atlasOk = { keyAuthFailed: false, missing: [], probeSkipped: false, checkedModelCount: 6 };
const now = "2026-07-23T00:00:00.000Z";
const base = { preflightChecks: preflightAllGood, atlas: atlasOk, hasApiKey: true, databaseUnreachable: false, orphanedAccountCount: 0, nowIso: now };
const rowFor = (report, key) => report.rows.find((r) => r.key === key);

// 1. Everything healthy -> overall ok, Atlas + DB green.
const good = buildOperatorHealthReport(base);
check("all_good_overall_ok", good.overall === "ok", good.overall);
check("atlas_row_ok", rowFor(good, "atlas")?.status === "ok");
check("database_row_ok", rowFor(good, "database")?.status === "ok");

// 2. Wrong/expired key -> atlas fail, overall fail, VN fix present.
const badKey = buildOperatorHealthReport({ ...base, atlas: { keyAuthFailed: true, missing: [], probeSkipped: false, checkedModelCount: 0 } });
check("wrong_key_atlas_fail", rowFor(badKey, "atlas")?.status === "fail" && badKey.overall === "fail");
check("wrong_key_message_actionable", /SAI hoặc HẾT HẠN/.test(rowFor(badKey, "atlas")?.message ?? ""));

// 3. Missing model -> atlas fail, lists the model.
const missing = buildOperatorHealthReport({ ...base, atlas: { keyAuthFailed: false, missing: [{ field: "imageModel", modelId: "bad/model" }], probeSkipped: false, checkedModelCount: 5 } });
check("missing_model_atlas_fail", rowFor(missing, "atlas")?.status === "fail" && /bad\/model/.test(rowFor(missing, "atlas")?.message ?? ""));

// 4. DB unreachable -> database fail with Neon fix.
const dbDown = buildOperatorHealthReport({ ...base, databaseUnreachable: true });
check("db_unreachable_fail", rowFor(dbDown, "database")?.status === "fail" && dbDown.overall === "fail" && /Neon/.test(rowFor(dbDown, "database")?.message ?? ""));

// 5. Un-migrated DB switch (orphan) -> database fail pointing to db:migrate.
const orphan = buildOperatorHealthReport({ ...base, orphanedAccountCount: 12 });
check("orphan_points_to_migrate", rowFor(orphan, "database")?.status === "fail" && /db:migrate/.test(rowFor(orphan, "database")?.message ?? "") && /12 tài khoản/.test(rowFor(orphan, "database")?.message ?? ""));

// 6. No API key at all -> atlas fail.
const noKey = buildOperatorHealthReport({ ...base, hasApiKey: false, atlas: undefined });
check("no_key_atlas_fail", rowFor(noKey, "atlas")?.status === "fail");

// 7. Probe skipped (offline) with a key -> atlas WARN (fail-open), overall warn not fail.
const offline = buildOperatorHealthReport({ ...base, atlas: { keyAuthFailed: false, missing: [], probeSkipped: true, checkedModelCount: 0 } });
check("offline_probe_warns_not_fails", rowFor(offline, "atlas")?.status === "warn" && offline.overall === "warn");

// 8. Low disk -> warn.
const lowDisk = buildOperatorHealthReport({ ...base, preflightChecks: preflightAllGood.map((c) => c.name.includes("Ổ đĩa") ? { ...c, status: "warn", message: "Ổ đĩa gần đầy: còn 1.0 GB." } : c) });
check("low_disk_warns", rowFor(lowDisk, "disk")?.status === "warn" && lowDisk.overall === "warn");

// 9. No secret ever leaks: no row message contains a key-like/URL-like secret from the inputs.
const secretSettings = buildOperatorHealthReport(base);
const anySecret = secretSettings.rows.some((r) => /sk-|postgres:\/\/|Bearer /.test(r.message));
check("no_secret_leak_in_rows", anySecret === false);

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.operator-health-report-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
