#!/usr/bin/env node
/**
 * No-spend regression for the guided `.env` setup core (the interactive `npm run setup` wraps it).
 * Proves setEnvLine replaces active/commented lines and appends when absent, composeEnvContent fills
 * the required keys, validateEnvSetupAnswers catches missing inputs, and the admin token is strong.
 */

import { setEnvLine, composeEnvContent, validateEnvSetupAnswers, generateAdminToken } from "../dist/application/env-setup.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// setEnvLine: active line replaced, commented line uncommented+set, absent key appended.
check("set_replaces_active", setEnvLine("A=1\nB=2\n", "A", "9") === "A=9\nB=2\n");
check("set_uncomments", setEnvLine("# A=1\nB=2\n", "A", "9") === "A=9\nB=2\n");
check("set_appends_when_absent", setEnvLine("B=2\n", "A", "9") === "B=2\nA=9\n");
check("set_flattens_multiline_value", !setEnvLine("A=\n", "A", "line1\nline2").includes("\nline2"));

// composeEnvContent from a template resembling .env.production.template.
const template = [
  "# comment",
  "ATLASCLOUD_API_KEY=",
  "CINEJELLY_API_AUTH_TOKEN=",
  "CINEJELLY_TOPUP_BANK_INFO=",
  "# CINEJELLY_PUBLIC_HOST=tenmien.com",
  "# CINEJELLY_DATABASE_KIND=json"
].join("\n") + "\n";

const answersJson = { atlasApiKey: "sk-real-key", adminToken: "a".repeat(30), bankInfo: "VCB 0123 - NGUYEN VAN A" };
const envJson = composeEnvContent(template, answersJson);
check("compose_sets_api_key", /^ATLASCLOUD_API_KEY=sk-real-key$/m.test(envJson));
check("compose_sets_token", new RegExp("^CINEJELLY_API_AUTH_TOKEN=" + "a".repeat(30) + "$", "m").test(envJson));
check("compose_sets_bank", /^CINEJELLY_TOPUP_BANK_INFO=VCB 0123 - NGUYEN VAN A$/m.test(envJson));
check("compose_json_has_no_postgres_url", !/CINEJELLY_POSTGRES_URL=/.test(envJson));

const answersPg = { atlasApiKey: "k", adminToken: "b".repeat(24), bankInfo: "bank", publicHost: "shop.com", databaseKind: "postgres", postgresUrl: "postgresql://x@neon/db" };
const envPg = composeEnvContent(template, answersPg);
check("compose_pg_sets_kind_and_url", /^CINEJELLY_DATABASE_KIND=postgres$/m.test(envPg) && /^CINEJELLY_POSTGRES_URL=postgresql:\/\/x@neon\/db$/m.test(envPg) && /^CINEJELLY_PUBLIC_HOST=shop.com$/m.test(envPg));

// validateEnvSetupAnswers.
check("valid_answers_pass", validateEnvSetupAnswers(answersJson).length === 0);
check("missing_key_flagged", validateEnvSetupAnswers({ ...answersJson, atlasApiKey: "" }).some((e) => e.includes("key Atlas")));
check("short_token_flagged", validateEnvSetupAnswers({ ...answersJson, adminToken: "short" }).some((e) => e.includes("24 ký tự")));
check("missing_bank_flagged", validateEnvSetupAnswers({ ...answersJson, bankInfo: "" }).some((e) => e.includes("chuyển khoản")));
check("postgres_without_url_flagged", validateEnvSetupAnswers({ ...answersJson, databaseKind: "postgres" }).some((e) => e.includes("POSTGRES_URL")));

// generateAdminToken is strong by construction.
const token = generateAdminToken();
check("token_strong", token.length >= 24 && /^[0-9a-f]+$/.test(token));

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.env-setup-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
