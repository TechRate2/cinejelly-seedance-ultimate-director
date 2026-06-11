/**
 * Run the interactive setup wizard from the current checkout with an isolated
 * HOME. This avoids the install.sh/update loop while developing setup UX.
 *
 * Usage:
 *   pnpm dev:setup
 *   pnpm dev:setup -- --scope project
 *   VIBE_SETUP_DEBUG_HOME=/tmp/vibe-home pnpm dev:setup
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home =
  process.env.VIBE_SETUP_DEBUG_HOME ??
  mkdtempSync(join(tmpdir(), "vibeframe-setup-home-"));
const cwd = process.env.VIBE_SETUP_DEBUG_CWD ?? repoRoot;
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const cli = resolve(repoRoot, "packages/cli/src/index.ts");
const args = process.argv.slice(2);
if (args[0] === "--") {
  args.shift();
}

console.log(`VibeFrame setup debug`);
console.log(`  CLI:  ${cli}`);
console.log(`  HOME: ${home}`);
console.log(`  CWD:  ${cwd}`);
console.log(`  Args: ${args.length > 0 ? args.join(" ") : "setup"}`);
console.log();

const result = spawnSync(tsx, [cli, "setup", ...args], {
  cwd,
  env: {
    ...process.env,
    HOME: home,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
