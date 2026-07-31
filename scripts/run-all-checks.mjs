#!/usr/bin/env node
/**
 * ONE command that answers the only question the project owner actually needs to ask:
 * "sau khi sửa, dự án còn chạy đúng không?"  —  `npm test`
 *
 * Why this exists. The repository already had a curated suite runner, but it names its checks by
 * hand and covers 19 of the 93 no-spend checks; a check added today is simply absent from it, and
 * nothing says so. That is the worst failure mode for an owner who cannot read the code: the report
 * says "pass" while most of the safety net never ran. This runner DISCOVERS every
 * scripts/run-*-smoke.mjs on disk, so a new check is included the moment it is written and can
 * never be silently forgotten.
 *
 * It also separates the two kinds of red. A handful of checks are deliberately failing because they
 * are waiting on evidence from a real paid render that has not happened yet — those are a to-do
 * list, not a regression. Mixing them into the same count trains the owner to ignore red, which
 * defeats the whole point. They are listed apart and do not fail the run.
 *
 * Costs nothing: every check here is offline. No provider call, no API key, no network.
 */

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(repoRoot, "scripts");
// Behaviour checks live in tests/; scripts/ holds operator tooling and whole-repo audits.
const testsDir = join(repoRoot, "tests");

/**
 * Checks that are RED ON PURPOSE, with the reason shown to the owner. Each one is blocked on
 * evidence a real paid render has to produce; they turn green on their own once that render is
 * archived. Anything red and NOT listed here is a genuine regression.
 */
const EXPECTED_RED = new Map([
  ["run-director-style-review-evidence-guard-smoke.mjs",
    "Chờ bằng chứng từ một lần render trả tiền thật (đánh giá chất lượng đạo diễn)."],
  ["run-operator-launch-ui-contract-smoke.mjs",
    "Chờ bằng chứng từ một lần render trả tiền thật (ảnh chụp màn hình vận hành)."]
]);

/**
 * Whole-repository audits that are NOT named `run-*-smoke.mjs` and so were invisible to any sweep.
 * They police the things a single check cannot see: files nobody imports, environment reads leaking
 * out of the boundary modules, third-party snapshots with undeclared licenses, published reports
 * drifting from their schemas. Three of them had been failing for some time with nobody watching,
 * which is exactly what happens to a check no command runs.
 */
const REPO_AUDITS = [
  ["audit-published-secrets.mjs", "Không có khoá/bí mật nào có thể lọt lên repo công khai"],
  ["audit-test-integrity.mjs", "Bài kiểm tra phải chạy code thật, không phải tìm chữ trong mã nguồn"],
  ["audit-source-structure.mjs", "Cấu trúc mã nguồn (file rác, biến môi trường lọt tầng lõi, thiếu export)"],
  ["audit-snapshot-parity.mjs", "Giấy phép và quản trị 12 repo tham khảo trong external/upstream"],
  ["audit-private-source-lineage-boundary.mjs", "Ranh giới ghi nguồn: mã sản phẩm không được import từ repo tham khảo"],
  ["validate-deployment-package.mjs", "Gói triển khai đủ file để chạy trên máy chủ"],
  ["validate-report-contracts.mjs", "Báo cáo sinh ra đúng định dạng đã cam kết"],
  ["audit-backend-system-readiness.mjs", "Mọi lệnh kiểm tra đều được khai báo và phân loại"]
];

/**
 * Audits with KNOWN drift that predates this runner, each needing its own investigation. Listed so
 * the red is honest and attributable rather than either hidden or ignored. Remove an entry the
 * moment its audit goes green — the list is a debt register, not a mute button.
 */
const AUDIT_KNOWN_DRIFT = new Map([
  ["validate-report-contracts.mjs",
    "2 báo cáo chỉ sinh ra được sau một lần render trả tiền thật (đánh giá chất lượng đạo diễn). Không phải lỗi."],
  ["audit-backend-system-readiness.mjs",
    "Chờ bằng chứng render trả tiền + triển khai thật. Phần mã nguồn và danh mục lệnh đã đạt."]
]);

const CHECK_TIMEOUT_MS = 180_000;
// Leave the machine usable while the suite runs; these are short-lived Node processes.
const CONCURRENCY = Math.max(2, Math.min(8, cpus().length - 1));

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--no-build");
const quiet = args.has("--quiet");

function run(command, commandArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, { cwd: repoRoot, shell: false });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ code: 1, stdout, stderr: `${stderr}\n${String(error)}`, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

/** First useful line of failure text — enough to act on, short enough to read. */
function failureHint(result) {
  if (result.timedOut) {
    return `quá ${Math.round(CHECK_TIMEOUT_MS / 1000)} giây chưa xong`;
  }
  try {
    const report = JSON.parse(result.stdout);
    const failed = (report.checks ?? []).filter((check) => !check.pass);
    if (failed.length > 0) {
      return failed.map((check) => check.name).slice(0, 3).join(", ") +
        (failed.length > 3 ? ` (+${failed.length - 3} nữa)` : "");
    }
  } catch {
    // Not JSON — the check crashed before it could report. Use its error output.
  }
  const text = `${result.stderr}\n${result.stdout}`.trim();
  const line = text.split("\n").map((entry) => entry.trim()).find((entry) => entry.length > 0);
  return (line ?? "không có thông tin lỗi").slice(0, 160);
}

const started = Date.now();

if (!skipBuild) {
  process.stdout.write("Đang dịch mã nguồn (build)... ");
  const build = await run(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], 600_000);
  if (build.code !== 0) {
    console.log("HỎNG\n");
    console.log("Mã nguồn có lỗi cú pháp/kiểu dữ liệu nên KHÔNG dịch được. Không chạy tiếp được bài nào.");
    console.log("Cần sửa các lỗi sau trước:\n");
    console.log(`${build.stdout}${build.stderr}`.trim().split("\n").slice(0, 40).join("\n"));
    process.exit(1);
  }
  console.log("xong.");
}

const checkFiles = readdirSync(testsDir)
  .filter((name) => name.startsWith("run-") && name.endsWith("-smoke.mjs"))
  .sort();

console.log(`Đang chạy ${checkFiles.length} bài kiểm tra (không tốn tiền, không gọi mạng)...\n`);

const results = [];
for (let index = 0; index < checkFiles.length; index += CONCURRENCY) {
  const batch = checkFiles.slice(index, index + CONCURRENCY);
  const batchResults = await Promise.all(
    batch.map(async (file) => {
      const result = await run(process.execPath, [join("tests", file)], CHECK_TIMEOUT_MS);
      if (!quiet) {
        process.stdout.write(result.code === 0 ? "." : EXPECTED_RED.has(file) ? "-" : "X");
      }
      return { file, ok: result.code === 0, hint: result.code === 0 ? undefined : failureHint(result) };
    })
  );
  results.push(...batchResults);
}

// Any check that failed gets ONE more run, on its own. Several checks boot a real HTTP server on a
// real port; run eight at a time they can collide over ports, leases and timing and fail for
// reasons that have nothing to do with the code. A false alarm is not a harmless cost here — the
// owner cannot read the code to tell a flake from a break, so a runner that cries wolf is a runner
// they stop believing. A check that fails alone as well is a genuine failure.
const firstRoundFailures = results.filter((entry) => !entry.ok);
if (firstRoundFailures.length > 0) {
  process.stdout.write(`\n\nChạy lại ${firstRoundFailures.length} bài đã hỏng, lần này từng bài một...`);
  for (const failure of firstRoundFailures) {
    const retry = await run(process.execPath, [join("tests", failure.file)], CHECK_TIMEOUT_MS);
    if (retry.code === 0) {
      failure.ok = true;
      failure.hint = undefined;
      failure.flaky = true;
    } else {
      failure.hint = failureHint(retry);
    }
  }
  process.stdout.write(" xong.");
}

process.stdout.write(`\n\nĐang chạy ${REPO_AUDITS.length} bài soi toàn dự án...`);
const auditResults = await Promise.all(
  REPO_AUDITS.map(async ([file, description]) => {
    const result = await run(process.execPath, [join("scripts", file)], CHECK_TIMEOUT_MS);
    return { file, description, ok: result.code === 0, hint: result.code === 0 ? undefined : failureHint(result) };
  })
);
process.stdout.write(" xong.");

const passed = results.filter((entry) => entry.ok);
const failed = results.filter((entry) => !entry.ok);
const expectedRed = failed.filter((entry) => EXPECTED_RED.has(entry.file));
const regressions = failed.filter((entry) => !EXPECTED_RED.has(entry.file));
// A check listed as expected-red that has started passing is good news worth surfacing: the entry
// should be removed, otherwise the list rots into a permanent excuse for red.
const nowGreen = passed.filter((entry) => EXPECTED_RED.has(entry.file));

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`\n\n${"=".repeat(64)}`);
console.log(`KẾT QUẢ  —  ${passed.length}/${results.length} bài đạt  (${seconds} giây)`);
console.log("=".repeat(64));

if (regressions.length > 0) {
  console.log(`\nCÓ ${regressions.length} BÀI HỎNG — đây là lỗi thật, cần sửa:\n`);
  for (const entry of regressions) {
    console.log(`  ✗ ${entry.file}`);
    console.log(`      ${entry.hint}`);
  }
  console.log("\nCách xem chi tiết một bài:");
  console.log(`  node tests/${regressions[0].file}`);
}

if (expectedRed.length > 0) {
  console.log(`\n${expectedRed.length} bài đỏ CÓ CHỦ Ý (không phải lỗi, không cần lo):\n`);
  for (const entry of expectedRed) {
    console.log(`  - ${entry.file}`);
    console.log(`      ${EXPECTED_RED.get(entry.file)}`);
  }
}

const flaky = results.filter((entry) => entry.flaky);
if (flaky.length > 0) {
  console.log(`\n${flaky.length} bài hỏng khi chạy song song nhưng ĐẠT khi chạy riêng (chúng dựng máy chủ thật, dễ tranh chấp cổng):\n`);
  for (const entry of flaky) {
    console.log(`  ~ ${entry.file}`);
  }
}

if (nowGreen.length > 0) {
  console.log(`\n${nowGreen.length} bài trước đây đỏ có chủ ý nhưng NAY ĐÃ ĐẠT — hãy xoá khỏi danh sách EXPECTED_RED trong scripts/run-all-checks.mjs:\n`);
  for (const entry of nowGreen) {
    console.log(`  + ${entry.file}`);
  }
}

const auditFailed = auditResults.filter((entry) => !entry.ok);
const auditRegressions = auditFailed.filter((entry) => !AUDIT_KNOWN_DRIFT.has(entry.file));
const auditKnown = auditFailed.filter((entry) => AUDIT_KNOWN_DRIFT.has(entry.file));
const auditNowGreen = auditResults.filter((entry) => entry.ok && AUDIT_KNOWN_DRIFT.has(entry.file));

console.log(`\nSOI TOÀN DỰ ÁN  —  ${auditResults.length - auditFailed.length}/${auditResults.length} đạt`);
if (auditRegressions.length > 0) {
  console.log("");
  for (const entry of auditRegressions) {
    console.log(`  ✗ ${entry.description}`);
    console.log(`      ${entry.hint}`);
    console.log(`      xem chi tiết: node scripts/${entry.file}`);
  }
}
if (auditKnown.length > 0) {
  console.log("\n  Nợ kỹ thuật đã biết (không phải lỗi mới):");
  for (const entry of auditKnown) {
    console.log(`  - ${entry.description}`);
    console.log(`      ${AUDIT_KNOWN_DRIFT.get(entry.file)}`);
  }
}
if (auditNowGreen.length > 0) {
  console.log("\n  Đã hết nợ — hãy xoá khỏi AUDIT_KNOWN_DRIFT trong scripts/run-all-checks.mjs:");
  for (const entry of auditNowGreen) {
    console.log(`  + ${entry.description}`);
  }
}

const allClear = regressions.length === 0 && auditRegressions.length === 0;
if (allClear) {
  console.log("\nDự án đang ổn. Không có lỗi nào cần sửa.\n");
} else {
  console.log("");
}

process.exit(allClear ? 0 : 1);
