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

async function runNpmStep(label, args, extraEnv = {}) {
  const invocation = npmInvocation(args);
  console.log(`\n[doctor] ${label}`);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
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

// Live Atlas key + model check — a NO-SPEND GET /models (never a paid generation). This is what turns
// "doctor said PASS" into a real guarantee: a wrong/expired key or a model that doesn't exist on the
// Atlas account is caught HERE, in plain Vietnamese, instead of only when the first customer render fails.
// Fails OPEN on a network problem (warn, not fail) so an offline machine can still run the rest of doctor.
async function runAtlasLiveProbe() {
  console.log("\n[doctor] Kiểm tra key + model Atlas (KHÔNG tốn tiền — chỉ gọi danh sách model GET /models)");
  let atlasCloud;
  let validateConfiguredAtlasModels;
  try {
    const runtimeConfig = await import("../dist/config/runtime-config.js");
    const modelPreflight = await import("../dist/application/atlas-model-preflight.js");
    atlasCloud = runtimeConfig.loadRuntimeSettings(process.env).atlasCloud;
    validateConfiguredAtlasModels = modelPreflight.validateConfiguredAtlasModels;
  } catch {
    console.log("  ⚠️  Bỏ qua: chưa build được mã nguồn. Chạy `npm run build` rồi thử lại.");
    return "warn";
  }
  if (!atlasCloud?.apiKey?.trim()) {
    console.log("  ⚠️  Chưa có ATLASCLOUD_API_KEY (preflight đã báo). Điền key vào .env rồi chạy lại.");
    return "warn";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let result;
  try {
    result = await validateConfiguredAtlasModels(atlasCloud, controller.signal);
  } catch {
    console.log("  ⚠️  Không gọi được Atlas để kiểm tra (lỗi mạng?). Thử lại khi có mạng.");
    return "warn";
  } finally {
    clearTimeout(timer);
  }
  if (result.keyAuthFailed) {
    console.log("  ❌ ATLASCLOUD_API_KEY SAI hoặc HẾT HẠN (Atlas trả 401/403).");
    console.log("     → Vào Atlas Cloud tạo API key mới, dán vào dòng ATLASCLOUD_API_KEY trong .env, khởi động lại.");
    return "fail";
  }
  if (result.missing.length > 0) {
    console.log("  ❌ Có model KHÔNG tồn tại trên tài khoản Atlas của bạn:");
    for (const item of result.missing) {
      console.log(`     - ${item.field} = "${item.modelId}"  → sửa tên model ở .env (hoặc Cấu hình → Model)`);
    }
    return "fail";
  }
  if (result.probeSkipped) {
    console.log("  ⚠️  Không kết nối được Atlas để kiểm key/model (lỗi mạng?). Thử lại khi có mạng.");
    return "warn";
  }
  console.log(`  ✅ Key Atlas HỢP LỆ và ${result.checkedModelCount} model đã cấu hình đều tồn tại.`);
  return "ok";
}

async function main() {
  console.log("CineJelly doctor");
  console.log("----------------");
  console.log("This command prepares local config and runs no-spend validation only.");

  await runNpmStep("Setup local environment", ["run", "setup:local"], { CINEJELLY_RUNNING_DOCTOR: "true" });
  await runNpmStep("Run local no-spend smoke", ["run", "validation:local-smoke"]);
  printSmokeSummary();

  const atlasStatus = await runAtlasLiveProbe();
  if (atlasStatus === "fail") {
    console.log(
      "\n[doctor] ❌ CÓ VẤN ĐỀ VỚI KEY/MODEL ATLAS (xem ở trên). Sửa TRƯỚC khi mời khách — nếu không, KHÁCH TẠO VIDEO SẼ LỖI."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n[doctor] PASS. Follow docs/OPERATOR_RUNBOOK.md before any paid Atlas validation.");
  if (atlasStatus === "warn") {
    console.log("[doctor] Lưu ý: chưa kiểm tra được key/model Atlas trực tiếp (thiếu key hoặc lỗi mạng) — chạy lại khi có key + mạng.");
  }
}

main().catch((error) => {
  console.error(`\n[doctor] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  console.error("[doctor] Next: fix the reported setup/preflight issue, then rerun npm run doctor.");
  process.exitCode = 1;
});
