#!/usr/bin/env node
/**
 * Refuses to let a secret reach a public repository.
 *
 * This project is published publicly, its `.env` holds real paid API keys, and it is maintained by
 * an owner who does not read code and an assistant that edits many files at once. That combination
 * is exactly how keys leak: not by anyone deciding to commit one, but by a wildcard `git add -A`
 * picking up a file nobody thought about.
 *
 * GitHub's own push protection is enabled on the remote and is the real backstop. This runs EARLIER,
 * inside `npm test`, so the answer arrives before a push rather than as a rejected push — and it
 * checks two things GitHub's scanner does not: that no secret-bearing FILE is tracked at all, and
 * that the published config template still has empty values where keys belong.
 *
 * Scans what git actually tracks, which is what would be published. Untracked working files are
 * deliberately ignored: a local `.env` is meant to exist.
 *
 * Pure: no network, no spend.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];
const check = (id, label, pass, evidence) =>
  checks.push({ id, label, status: pass ? "pass" : "fail", ...(evidence !== undefined ? { evidence: String(evidence).slice(0, 400) } : {}) });

function tracked() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const files = tracked();
check("git_is_readable", "Repository file list is readable", files.length > 0, `${files.length} tracked files`);

// --- 1. NO SECRET-BEARING FILE MAY BE TRACKED, whatever is inside it.
// Names, not contents: a file called .env is a mistake even when today it happens to be empty.
const FORBIDDEN_NAMES = [
  /(^|\/)\.env$/u, /(^|\/)\.env\.(?!production\.template$)/u,
  /\.pem$/u, /\.key$/u, /\.p8$/u, /\.p12$/u, /\.pfx$/u, /\.crt$/u, /\.cer$/u, /\.jks$/u, /\.keystore$/u,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/u, /\.ppk$/u,
  /(^|\/)\.npmrc$/u, /(^|\/)\.netrc$/u, /(^|\/)\.aws\//u, /(^|\/)\.ssh\//u,
  /(^|\/)credentials?\.json$/u, /(^|\/)service-account.*\.json$/u
];
const forbidden = files.filter((file) => FORBIDDEN_NAMES.some((pattern) => pattern.test(file)));
check("no_secret_file_is_tracked", "No credential-bearing file is committed", forbidden.length === 0,
  forbidden.join(", ") || "none");

// --- 2. NO REAL KEY MAY APPEAR IN ANY TRACKED FILE.
// Provider-specific shapes only. A generic "long random string" rule would fire on every hash and
// teach the reader to ignore this audit, which is worse than not having it.
const KEY_SHAPES = [
  ["atlas_or_generic_apikey", /\bapikey-[A-Za-z0-9]{16,}/u],
  ["openai_style", /\bsk-[A-Za-z0-9]{20,}/u],
  ["stripe_live", /\bsk_live_[A-Za-z0-9]{16,}/u],
  ["github_token", /\b(gh[pousr]_[A-Za-z0-9]{20,})/u],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}/u],
  ["slack_token", /\bxox[baprs]-[0-9A-Za-z-]{10,}/u],
  ["private_key_block", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u],
  ["jwt_with_payload", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./u]
];
const SKIP_BINARY = /\.(png|jpe?g|gif|webp|mp4|mov|mp3|wav|woff2?|ttf|otf|ico|pdf|zip|gz|onnx|bin|pt|pth|safetensors)$/iu;
const leaks = [];
for (const file of files) {
  if (SKIP_BINARY.test(file)) {
    continue;
  }
  let text;
  try {
    text = readFileSync(join(repoRoot, file), "utf8");
  } catch {
    continue;
  }
  if (text.length > 4_000_000) {
    continue;
  }
  for (const [shape, pattern] of KEY_SHAPES) {
    const match = pattern.exec(text);
    if (match) {
      // The template documents the SHAPE of a key in a comment; that is not a key.
      const redacted = `${match[0].slice(0, 8)}…`;
      leaks.push(`${file}: ${shape} (${redacted})`);
      break;
    }
  }
}
check("no_real_key_in_any_tracked_file", "No provider key appears in committed content", leaks.length === 0,
  leaks.slice(0, 8).join(" | ") || "none");

// --- 3. THE PUBLISHED TEMPLATE MUST STILL BE EMPTY where a key belongs.
// It is committed on purpose, so it is the single most likely file to be filled in by accident.
const MUST_BE_EMPTY = [
  "ATLASCLOUD_API_KEY", "ATLASCLOUD_LLM_API_KEY", "CINEJELLY_API_AUTH_TOKEN",
  "CINEJELLY_DEPLOYMENT_TOKEN", "CINEJELLY_ADMIN_TOKEN"
];
let template = "";
try {
  template = readFileSync(join(repoRoot, ".env.production.template"), "utf8");
} catch {
  // Handled by the check below.
}
check("config_template_exists", "Config template is present", template.length > 0);
const filledIn = MUST_BE_EMPTY.filter((name) => {
  // HORIZONTAL whitespace only. `\s` also matches newlines, so on an empty slot (`NAME=`) it swallowed
  // the line break and captured the NEXT LINE as the value — this audit reported three empty keys as
  // filled in. It happened to fail safe, but the same flaw could just as easily read past a real key
  // and report nothing. A security check that cries wolf gets ignored, which is the same as absent.
  const match = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(\\S.*)$`, "mu").exec(template);
  return match !== null && match[1].trim().length > 0;
});
check("config_template_has_no_filled_secrets", "Config template still has empty key slots", filledIn.length === 0,
  filledIn.join(", ") || "all empty");

// --- 4. .gitignore MUST STILL COVER the things that keep secrets out.
// A rule deleted here is invisible until the next `git add -A` publishes something.
let gitignore = "";
try {
  gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
} catch {
  // Handled below.
}
const REQUIRED_IGNORES = [".env", "*.pem", "*.key"];
const missingIgnores = REQUIRED_IGNORES.filter((rule) => !gitignore.split("\n").some((line) => line.trim() === rule));
check("gitignore_still_blocks_secrets", ".gitignore still excludes credential files", missingIgnores.length === 0,
  missingIgnores.join(", ") || "all present");
// Customer media and operator evidence must stay out too: those directories hold real render output
// and real payment evidence.
for (const path of ["assets/output_deliverables", "ops"]) {
  const isTracked = files.some((file) => file.startsWith(`${path}/`));
  check(`no_customer_data_tracked_${path.replace(/[^a-z]/gu, "_")}`,
    `${path}/ is not committed`, !isTracked,
    isTracked ? `${files.filter((file) => file.startsWith(`${path}/`)).length} files tracked` : "none");
}

const failed = checks.filter((entry) => entry.status !== "pass");
const report = {
  schemaVersion: "cinejelly.published-secrets-audit.v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: { trackedFileCount: files.length, keyShapeCount: KEY_SHAPES.length },
  summary: { passedChecks: checks.length - failed.length, failedChecks: failed.length },
  checks,
  nextActions: failed.length === 0
    ? ["No secret is publishable from this repository."]
    : ["A secret is reachable from a public push. Remove the file, rotate the key, and re-run before pushing."]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
