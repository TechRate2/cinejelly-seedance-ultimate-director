/**
 * Pure helpers for the guided `.env` setup (the interactive `npm run setup` wraps these). Kept pure so
 * the composition + validation are testable without stdin: the wizard only does the prompting + file I/O.
 */

import { randomBytes } from "node:crypto";

export type EnvDatabaseKind = "json" | "sqlite" | "postgres";

export interface EnvSetupAnswers {
  readonly atlasApiKey: string;
  readonly adminToken: string;
  readonly bankInfo: string;
  readonly publicHost?: string;
  readonly databaseKind?: EnvDatabaseKind;
  readonly postgresUrl?: string;
}

/** A strong admin token by construction (48 hex chars, well over the 24-char minimum the server enforces). */
export function generateAdminToken(): string {
  return randomBytes(24).toString("hex");
}

/** Plain-Vietnamese validation of the operator's answers. Empty array = ready to write. */
export function validateEnvSetupAnswers(answers: EnvSetupAnswers): readonly string[] {
  const errors: string[] = [];
  if (!answers.atlasApiKey.trim()) {
    errors.push("Thiếu key Atlas (ATLASCLOUD_API_KEY) — dán key thật từ Atlas Cloud.");
  }
  if (answers.adminToken.trim().length < 24) {
    errors.push("Khóa quản trị phải ít nhất 24 ký tự.");
  }
  if (!answers.bankInfo.trim()) {
    errors.push("Thiếu thông tin chuyển khoản (số tài khoản nhận tiền nạp).");
  }
  if (answers.databaseKind === "postgres" && !answers.postgresUrl?.trim()) {
    errors.push('Chọn cơ sở dữ liệu "postgres" thì phải có CINEJELLY_POSTGRES_URL (chuỗi kết nối Neon).');
  }
  return errors;
}

/** Set `KEY=value` in an .env body: replace an existing active OR commented line, else append. */
export function setEnvLine(text: string, key: string, value: string): string {
  // Values are single-line in .env; collapse any newline so a pasted multi-line bank blurb stays valid.
  const safeValue = value.replace(/[\r\n]+/g, " ").trimEnd();
  const line = `${key}=${safeValue}`;
  const active = new RegExp(`^${key}=.*$`, "m");
  const commented = new RegExp(`^#\\s*${key}=.*$`, "m");
  if (active.test(text)) {
    return text.replace(active, line);
  }
  if (commented.test(text)) {
    return text.replace(commented, line);
  }
  return `${text.replace(/\n*$/, "")}\n${line}\n`;
}

/** Fill the required (and any provided optional) keys into the template, returning the finished .env body. */
export function composeEnvContent(template: string, answers: EnvSetupAnswers): string {
  let out = template;
  out = setEnvLine(out, "ATLASCLOUD_API_KEY", answers.atlasApiKey.trim());
  out = setEnvLine(out, "CINEJELLY_API_AUTH_TOKEN", answers.adminToken.trim());
  out = setEnvLine(out, "CINEJELLY_TOPUP_BANK_INFO", answers.bankInfo.trim());
  if (answers.publicHost?.trim()) {
    out = setEnvLine(out, "CINEJELLY_PUBLIC_HOST", answers.publicHost.trim());
  }
  if (answers.databaseKind) {
    out = setEnvLine(out, "CINEJELLY_DATABASE_KIND", answers.databaseKind);
  }
  if (answers.databaseKind === "postgres" && answers.postgresUrl?.trim()) {
    out = setEnvLine(out, "CINEJELLY_POSTGRES_URL", answers.postgresUrl.trim());
  }
  return out;
}
