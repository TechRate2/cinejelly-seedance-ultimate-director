import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeReportPath = resolve(repoRoot, "assets/output_deliverables/phase6-validation/local-smoke-report.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false
    };
  }
  return {
    command: npmCommand,
    args,
    shell: process.platform === "win32"
  };
}

async function runNpmStep(label, args) {
  const invocation = npmInvocation(args);
  console.log(`\n[doctor] ${label}`);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: invocation.shell
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

function printSmokeSummary() {
  if (!existsSync(smokeReportPath)) {
    console.log("\n[doctor] Local smoke report was not found.");
    return;
  }

  const report = JSON.parse(readFileSync(smokeReportPath, "utf8"));
  const readiness = report.apiSmoke?.readiness;
  console.log("\n[doctor] Summary");
  console.log(`status: ${report.status ?? "unknown"}`);
  if (readiness) {
    console.log(`readiness: ${readiness.decision}`);
    console.log(
      `checks: ${readiness.checkCounts?.pass ?? "?"}/${readiness.checkCounts?.total ?? "?"} pass, ` +
      `${readiness.checkCounts?.warn ?? "?"} warn, ${readiness.checkCounts?.fail ?? "?"} fail`
    );
    console.log(`canRunPaidValidation: ${readiness.canRunPaidValidation === true ? "yes" : "no"}`);
  }
  console.log(`canReleaseToCustomerTraffic: ${report.releaseGateSummary?.canReleaseToCustomerTraffic === true ? "yes" : "no"}`);
  if (report.releaseGateSummary?.releaseBlocker) {
    console.log(`releaseBlocker: ${report.releaseGateSummary.releaseBlocker}`);
  }
  console.log("\n[doctor] No paid Atlas render was run.");
}

async function main() {
  console.log("CineJelly doctor");
  console.log("----------------");
  console.log("This command prepares local config and runs no-spend validation only.");

  await runNpmStep("Setup local environment", ["run", "setup:local"]);
  await runNpmStep("Run local no-spend smoke", ["run", "validation:local-smoke"]);
  printSmokeSummary();

  console.log("\n[doctor] PASS. Follow docs/OPERATOR_RUNBOOK.md before any paid Atlas validation.");
}

main().catch((error) => {
  console.error(`\n[doctor] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  console.error("[doctor] Next: fix the reported setup/preflight issue, then rerun npm.cmd run doctor.");
  process.exitCode = 1;
});
