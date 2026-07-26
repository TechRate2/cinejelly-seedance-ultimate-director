#!/usr/bin/env node
/**
 * Sao lưu dữ liệu tiền + tài khoản (chạy: npm run backup:data).
 * Copies the customer money data (user-accounts.json / .sqlite, render-job history, and
 * the uploads folder listing) into backups/<timestamp>/ with a Vietnamese restore note.
 * Read-only with respect to live data; safe to run while the server is up.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.env.CINEJELLY_OUTPUT_DIR?.trim() || "assets/output_deliverables";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join("backups", stamp);
mkdirSync(backupDir, { recursive: true });

// Resolve the render-job history path exactly like the server does: honor the override,
// default to <outputDir>/render-jobs/job-history.json, and skip when explicitly turned off.
function resolveJobHistoryPath() {
  const override = process.env.CINEJELLY_API_JOB_HISTORY_PATH?.trim();
  if (override) {
    const lowered = override.toLowerCase();
    if (lowered === "off" || lowered === "false" || lowered === "none") {
      return undefined;
    }
    return override;
  }
  return join(outputDir, "render-jobs", "job-history.json");
}

const jobHistoryPath = resolveJobHistoryPath();
const targets = [
  { source: process.env.CINEJELLY_USER_ACCOUNT_STORE_PATH?.trim() || join(outputDir, "user-accounts.json"), label: "Sổ tài khoản + credits (JSON)" },
  { source: process.env.CINEJELLY_SQLITE_PATH?.trim() || join(outputDir, "user-accounts.sqlite"), label: "Sổ tài khoản + credits (SQLite)" },
  ...(process.env.CINEJELLY_SQLITE_PATH?.trim() || existsSync(join(outputDir, "user-accounts.sqlite"))
    ? [
        { source: (process.env.CINEJELLY_SQLITE_PATH?.trim() || join(outputDir, "user-accounts.sqlite")) + "-wal", label: "SQLite WAL (ghi chưa checkpoint)" },
        { source: (process.env.CINEJELLY_SQLITE_PATH?.trim() || join(outputDir, "user-accounts.sqlite")) + "-shm", label: "SQLite SHM" }
      ]
    : []),
  ...(jobHistoryPath ? [{ source: jobHistoryPath, label: "Lịch sử job render (video khách đã tạo)" }] : []),
  { source: process.env.CINEJELLY_ADMIN_SETTINGS_PATH?.trim() || join(outputDir, "admin-settings.json"), label: "Cấu hình admin (giá/gói/model/bank)" },
  // DEFAULT paths too, not only env overrides (launch-ops audit: with no env override these two
  // stores were silently SKIPPED while the script still printed "ok").
  { source: process.env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH?.trim() || join(outputDir, "short-pipeline-sessions.json"), label: "Phiên tạo video (bản nháp)" },
  { source: process.env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH?.trim() || join(outputDir, "short-channel-styles.json"), label: "Thư viện phong cách kênh" }
];
// Phim dài tập: toàn bộ trạng thái series trả tiền (bible + cast + tiến độ tập) nằm trong thư mục
// series/ — mất nó là mất tính liên tục mọi bộ phim của khách (launch-ops audit: lỗ hổng backup
// nặng nhất).
const seriesDirectory = join(outputDir, "series");

const copied = [];
for (const target of targets) {
  if (existsSync(target.source)) {
    const fileName = target.source.split(/[\\/]/).pop();
    cpSync(target.source, join(backupDir, fileName));
    copied.push(`${target.label}: ${fileName}`);
  }
}
const uploadsDir = join(outputDir, "uploads");
let uploadCount = 0;
if (existsSync(uploadsDir)) {
  uploadCount = readdirSync(uploadsDir).length;
  cpSync(uploadsDir, join(backupDir, "uploads"), { recursive: true });
  copied.push(`Ảnh/video khách tải lên: ${uploadCount} file`);
}
if (existsSync(seriesDirectory)) {
  const seriesCount = readdirSync(seriesDirectory).length;
  cpSync(seriesDirectory, join(backupDir, "series"), { recursive: true });
  copied.push(`Phim dài tập (bible + tiến độ): ${seriesCount} mục`);
}
// Postgres không nằm trong file nào ở đây — cảnh báo TO thay vì im lặng in "ok" (launch-ops audit).
if ((process.env.CINEJELLY_DATABASE_KIND || "").trim() === "postgres") {
  console.warn(
    "[CẢNH BÁO] Đang dùng CINEJELLY_DATABASE_KIND=postgres: sổ tài khoản + credits KHÔNG nằm trong bản backup này. " +
      "Phải chạy pg_dump riêng (xem HUONG-DAN-PHUC-HOI.txt), nếu không mất máy chủ Postgres là mất tiền của khách."
  );
}

writeFileSync(
  join(backupDir, "HUONG-DAN-PHUC-HOI.txt"),
  [
    "CÁCH PHỤC HỒI (khi máy chủ mới hoặc mất dữ liệu):",
    "1. Dừng server (Ctrl+C hoặc: docker compose down).",
    `2. Chép các file trong thư mục này về lại: ${outputDir}/`,
    "   - user-accounts.json hoặc .sqlite -> đặt đúng tên cũ ngay trong thư mục trên",
    "   - job-history.json -> đặt vào thư mục con: " + outputDir + "/render-jobs/",
    "   - admin-settings.json -> ngay trong thư mục trên; thư mục uploads -> uploads/",
    "   - short-pipeline-sessions.json + short-channel-styles.json -> ngay trong thư mục trên",
    "   - thư mục series -> " + outputDir + "/series/ (phim dài tập: mất là mất tính liên tục các bộ phim)",
    "3. Bật lại server. Số dư + tài khoản + lịch sử video khách trở lại nguyên vẹn.",
    "",
    "Nên chạy backup mỗi ngày (Windows Task Scheduler / cron): npm run backup:data",
    "QUAN TRONG: chep thu muc backups/ nay sang o dia/may khac — de chung 1 may voi du lieu goc thi hong may la mat ca hai.",
    "",
    "NEU CHAY BANG DOCKER: du lieu nam trong volume 'cinejelly-output', KHONG thay trong thu muc du an.",
    "  - Backup:  docker run --rm -v cinejelly-output:/data -v \"$PWD/backups\":/backup alpine tar czf /backup/cinejelly-data.tgz -C /data .",
    "  - Phuc hoi: docker run --rm -v cinejelly-output:/data -v \"$PWD/backups\":/backup alpine tar xzf /backup/cinejelly-data.tgz -C /data",
    "Postgres: neu dung CINEJELLY_DATABASE_KIND=postgres, backup bang cong cu cua Postgres (pg_dump), khong nam trong file nay."
  ].join("\n"),
  "utf8"
);

console.log(JSON.stringify({ status: "ok", backupDir, copied }, null, 2));
if (copied.length === 0) {
  console.log("Chưa có dữ liệu để sao lưu (server chưa có khách hàng nào).");
}
