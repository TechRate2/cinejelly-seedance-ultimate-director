#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tsc = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
  cwd: repoRoot,
  stdio: "inherit"
});
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

const smoke = spawnSync(process.execPath, ["tests/run-short-viral-intelligence-smoke.mjs"], {
  cwd: repoRoot,
  stdio: "inherit"
});
process.exit(smoke.status ?? 1);
