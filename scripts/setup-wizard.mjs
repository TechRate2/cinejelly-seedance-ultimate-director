#!/usr/bin/env node
/**
 * `npm run setup` — trình cài đặt hỏi-đáp tiếng Việt. Hỏi vài câu, tự tạo khóa quản trị mạnh, rồi
 * ghi file .env cho bạn — KHÔNG cần tự sửa file. Logic ghép/kiểm tra .env nằm ở dist/application/
 * env-setup.js (đã có test riêng); ở đây chỉ hỏi + ghi file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  composeEnvContent,
  validateEnvSetupAnswers,
  generateAdminToken
} from "../dist/application/env-setup.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(repoRoot, ".env.production.template");
const envPath = resolve(repoRoot, ".env");
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (question, fallback = "") => {
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
};

async function main() {
  console.log("\n=== CÀI ĐẶT CINEJELLY (hỏi-đáp, không cần sửa file) ===\n");
  if (!existsSync(templatePath)) {
    console.error("Không tìm thấy .env.production.template — chạy lệnh này ở thư mục gốc của dự án.");
    process.exit(1);
  }
  if (existsSync(envPath)) {
    const overwrite = await ask("Đã có file .env rồi. Ghi đè? (gõ 'co' để ghi đè, Enter để hủy): ");
    if (overwrite.toLowerCase() !== "co") {
      console.log("Đã hủy — giữ nguyên .env cũ.");
      rl.close();
      return;
    }
  }

  const atlasApiKey = await ask("1) Dán KEY ATLAS CLOUD (thứ tốn tiền để tạo video): ");
  const generatedToken = generateAdminToken();
  const adminToken = await ask(`2) KHÓA QUẢN TRỊ (Enter để tự dùng khóa mạnh đã tạo sẵn):\n   [${generatedToken}]\n   > `, generatedToken);
  const bankInfo = await ask("3) THÔNG TIN CHUYỂN KHOẢN để khách nạp tiền (VD: VCB 0123456789 - NGUYEN VAN A): ");
  const publicHost = await ask("4) TÊN MIỀN của bạn (VD: shop.com — Enter nếu chưa có): ");
  const dbAnswer = (await ask("5) LƯU DỮ LIỆU: gõ 'json' (mặc định, dễ nhất), 'sqlite', hoặc 'postgres' (Neon) [json]: ", "json")).toLowerCase();
  const databaseKind = dbAnswer === "sqlite" || dbAnswer === "postgres" ? dbAnswer : "json";
  const postgresUrl = databaseKind === "postgres" ? await ask("   Chuỗi kết nối Neon/Postgres (postgresql://...): ") : "";

  const answers = {
    atlasApiKey,
    adminToken,
    bankInfo,
    ...(publicHost ? { publicHost } : {}),
    databaseKind,
    ...(postgresUrl ? { postgresUrl } : {})
  };
  const errors = validateEnvSetupAnswers(answers);
  if (errors.length > 0) {
    console.error("\n❌ Chưa đủ thông tin:");
    for (const error of errors) {
      console.error("   - " + error);
    }
    console.error("\nChạy lại 'npm run setup' và điền đủ.");
    rl.close();
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf8");
  writeFileSync(envPath, composeEnvContent(template, answers), "utf8");
  rl.close();

  console.log("\n✅ Đã ghi file .env.");
  console.log("   Bước tiếp theo:");
  console.log("   1) npm run build");
  console.log('   2) npm run doctor   (kiểm tra key/model Atlas thật + cơ sở dữ liệu + ổ đĩa — sửa nếu có ô đỏ)');
  console.log("   3) npm start   (hoặc: docker compose up -d)");
  if (databaseKind !== "json") {
    console.log(`   • Bạn chọn ${databaseKind}: nếu đã có dữ liệu ở file json cũ, chạy 'npm run db:migrate' để chuyển sang.`);
  }
  console.log("");
}

main().catch((error) => {
  try { rl.close(); } catch { /* ignore */ }
  console.error(`\n[setup] Lỗi: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
