#!/usr/bin/env node
/**
 * `npm run update` — cập nhật an toàn cho người không rành code: SAO LƯU trước → tải bản mới → build →
 * kiểm tra (doctor). Dừng ngay nếu có bước lỗi (dữ liệu đã được sao lưu ở bước đầu).
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(`\n[cập nhật] ${label}...`);
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${label} lỗi (mã ${code ?? "?"}).`));
      }
    });
  });
}

async function main() {
  console.log("=== CẬP NHẬT CINEJELLY (sao lưu → tải bản mới → build → kiểm tra) ===");
  await run("Sao lưu dữ liệu tiền + tài khoản", npmCmd, ["run", "backup:data"]);
  await run("Tải bản mới (git pull)", "git", ["pull"]);
  await run("Biên dịch bản mới (build)", npmCmd, ["run", "build"]);
  await run("Kiểm tra sau cập nhật (doctor)", npmCmd, ["run", "doctor"]);
  console.log("\n✅ CẬP NHẬT XONG. Khởi động lại máy chủ để dùng bản mới:");
  console.log("   • npm start   (hoặc)   docker compose up -d --build");
}

main().catch((error) => {
  console.error(`\n[cập nhật] DỪNG: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Dữ liệu đã được SAO LƯU ở bước đầu. Sửa lỗi rồi chạy lại 'npm run update'. Chưa khởi động lại thì bản đang chạy vẫn nguyên.");
  process.exit(1);
});
