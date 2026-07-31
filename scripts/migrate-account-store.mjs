#!/usr/bin/env node
/**
 * `npm run db:migrate` — chuyển dữ liệu tài khoản/tiền từ file JSON sang cơ sở dữ liệu SQL (sqlite
 * hoặc postgres/Neon) khi bạn đổi CINEJELLY_DATABASE_KIND.
 *
 * AN TOÀN:
 *   - CHỈ ghi khi cơ sở dữ liệu đích đang RỖNG. Nếu đích đã có tài khoản, script DỪNG (không ghi đè).
 *   - KHÔNG bao giờ xóa file JSON cũ — nó được giữ lại làm bản sao lưu.
 *   - Verify lại số tài khoản/dòng sổ sau khi chuyển; nếu không khớp, báo lỗi và bảo bạn không dùng đích.
 * Không tốn tiền, không gọi Atlas.
 */

import {
  readDatabaseKind,
  createAccountPersistenceDriver,
  JsonFileAccountDriver
} from "../dist/api/account-persistence.js";
import { readUserAccountStorePath, STORE_SCHEMA_VERSION } from "../dist/api/user-account-store.js";
import { migrateAccountStore } from "../dist/api/account-store-migration.js";

const env = process.env;
const log = (message) => console.log(message);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const kind = readDatabaseKind(env);
if (kind === "json") {
  log(
    "Đang dùng CINEJELLY_DATABASE_KIND=json — không cần migrate.\n" +
      "Muốn chuyển sang SQL: đặt CINEJELLY_DATABASE_KIND=sqlite (Node ≥ 22.5) hoặc =postgres (kèm CINEJELLY_POSTGRES_URL + `npm install pg`), rồi chạy lại lệnh này."
  );
  process.exit(0);
}

const jsonPath = readUserAccountStorePath(env);
let sourceState;
try {
  sourceState = new JsonFileAccountDriver(jsonPath).load();
} catch (error) {
  fail(`Không đọc được file JSON tài khoản (${jsonPath}): ${error instanceof Error ? error.message : error}`);
}

let target;
try {
  target = createAccountPersistenceDriver({ env, jsonStorePath: jsonPath, schemaVersion: STORE_SCHEMA_VERSION });
  await target.ready();
} catch (error) {
  fail(`Không kết nối được cơ sở dữ liệu đích (${kind}): ${error instanceof Error ? error.message : error}`);
}

let result;
try {
  result = await migrateAccountStore({
    sourceState,
    target,
    // Verify by reading back through a FRESH connection (postgres load() returns the boot snapshot).
    reloadTargetState: async () => {
      const verifyDriver = createAccountPersistenceDriver({ env, jsonStorePath: jsonPath, schemaVersion: STORE_SCHEMA_VERSION });
      await verifyDriver.ready();
      return verifyDriver.load();
    }
  });
} catch (error) {
  fail(`Lỗi khi chuyển dữ liệu: ${error instanceof Error ? error.message : error}`);
}

if (result.status === "nothing_to_migrate") {
  log(`Không có tài khoản nào trong ${jsonPath} để chuyển (file trống hoặc chưa có khách). Không làm gì.`);
  process.exit(0);
}
log(`Nguồn (JSON): ${jsonPath} — ${result.sourceUserCount} tài khoản · ${result.sourceEntryCount} dòng sổ credits.`);

if (result.status === "target_not_empty") {
  fail(
    `DỪNG: cơ sở dữ liệu đích (${kind}) ĐÃ CÓ tài khoản — không ghi đè để tránh mất dữ liệu.\n` +
      "Nếu chắc chắn muốn migrate lại từ đầu, hãy xóa/đổi tên các bảng account_* ở đích trước, rồi chạy lại."
  );
}
if (result.status === "verify_mismatch") {
  fail(
    `KIỂM TRA SAU KHI CHUYỂN KHÔNG KHỚP (tài khoản ${result.migratedUserCount}/${result.sourceUserCount}, sổ ${result.migratedEntryCount}/${result.sourceEntryCount}).\n` +
      "KHÔNG khởi động lại với đích này — kiểm tra lại cấu hình cơ sở dữ liệu rồi chạy lại."
  );
}
log(
  `✅ ĐÃ CHUYỂN sang ${kind}: ${result.migratedUserCount} tài khoản · ${result.migratedEntryCount} dòng sổ.\n` +
    `   File JSON cũ (${jsonPath}) ĐƯỢC GIỮ LẠI làm bản sao lưu — KHÔNG bị xóa.\n` +
    `   Bước cuối: khởi động lại máy chủ để bắt đầu dùng ${kind}.`
);
process.exit(0);
