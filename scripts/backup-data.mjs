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

const targets = [
  { source: process.env.CINEJELLY_USER_ACCOUNT_STORE_PATH?.trim() || join(outputDir, "user-accounts.json"), label: "Sổ tài khoản + credits (JSON)" },
  { source: process.env.CINEJELLY_SQLITE_PATH?.trim() || join(outputDir, "user-accounts.sqlite"), label: "Sổ tài khoản + credits (SQLite)" },
  { source: join(outputDir, "render-job-history.json"), label: "Lịch sử job render" }
];

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

writeFileSync(
  join(backupDir, "HUONG-DAN-PHUC-HOI.txt"),
  [
    "CÁCH PHỤC HỒI (khi máy chủ mới hoặc mất dữ liệu):",
    "1. Dừng server (Ctrl+C hoặc: docker compose down).",
    `2. Chép các file trong thư mục này về lại: ${outputDir}/`,
    "   (user-accounts.json hoặc .sqlite -> đặt đúng tên cũ; thư mục uploads -> uploads/)",
    "3. Bật lại server. Số dư + tài khoản khách trở lại nguyên vẹn.",
    "",
    "Nên chạy backup mỗi ngày (Windows Task Scheduler / cron): npm run backup:data"
  ].join("\n"),
  "utf8"
);

console.log(JSON.stringify({ status: "ok", backupDir, copied }, null, 2));
if (copied.length === 0) {
  console.log("Chưa có dữ liệu để sao lưu (server chưa có khách hàng nào).");
}
