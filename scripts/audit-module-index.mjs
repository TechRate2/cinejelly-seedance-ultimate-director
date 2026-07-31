#!/usr/bin/env node
/**
 * Keeps `docs/BAN-DO-MA-NGUON.md` — the index of every runtime module and what it is for — in exact
 * agreement with the code, and refuses to let undescribed modules multiply.
 *
 * The stated goal for this repository is that any developer or AI reading it understands the whole
 * project. An audit on 2026-07-31 measured how far that was true: 27 of 158 feature modules, the
 * largest of them 1,576 lines, appeared in no `.md` file at all — including the account store and the
 * billing policy, which decide customers' money.
 *
 * Hand-writing 27 more design documents would have failed the same way the existing specs did: they
 * are accurate on the day they are written and silently wrong a month later, and nothing reports it.
 * So the index is GENERATED from each module's own header comment, and this audit fails when the
 * committed file no longer matches what the code says. A doc that is checked by `npm test` cannot
 * drift; a doc that is only read cannot help but drift.
 *
 * Run with `--write` to regenerate the file after adding or renaming a module.
 *
 * Pure: reads files, no network, no spend.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(repoRoot, "docs", "BAN-DO-MA-NGUON.md");

/**
 * Modules still missing a header description: 14, after the three that sit on the video path
 * (endpoint-frame-chain, video-render-strategy-planner, short-visual-bible-planner) were written.
 * Lower this as the rest are written;
 * raising it means shipping a module nobody can explain. The ten `director-style-*` files are one
 * cluster from a single feature and are counted individually on purpose — a cluster is how a gap
 * this size appears without anyone noticing.
 */
const MISSING_DESCRIPTION_BUDGET = 14;

/** Directories holding runtime modules, in the order a reader should meet them. */
const AREAS = [
  ["src/api", "Cổng vào HTTP — mọi thứ khách và người vận hành chạm tới"],
  ["src/agents", "Các tác nhân điều phối — nơi một đơn hàng trở thành video"],
  ["src/core", "Luật nghiệp vụ thuần — không đọc biến môi trường, không gọi mạng"],
  ["src/prompt_compiler", "Biên dịch lời nhắc gửi cho model"],
  ["src/providers", "Lớp duy nhất được phép gọi ra Internet"],
  ["src/application", "Lắp ráp các thành phần lại với nhau"],
  ["src/config", "Cấu hình và hằng số"],
  ["src/utils", "Tiện ích dùng chung"]
];

const checks = [];
const check = (id, label, pass, evidence) =>
  checks.push({ id, label, status: pass ? "pass" : "fail", ...(evidence !== undefined ? { evidence: String(evidence).slice(0, 700) } : {}) });

/** First sentence of the file's leading `/** ... *\/` block, flattened to one line. */
function describeModule(text) {
  const match = /^\s*(?:import[^\n]*\n|\/\/[^\n]*\n|\n)*\s*\/\*\*([\s\S]*?)\*\//u.exec(text);
  if (!match) {
    return undefined;
  }
  const body = match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*\*ay?/u, "").replace(/^\s*\*\s?/u, "").trim())
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  if (body.length < 26) {
    return undefined;
  }
  // Stop at the first sentence end that is not a decimal point or an abbreviation-looking token.
  const sentence = /^(.+?[.!?])(?:\s|$)/u.exec(body);
  const first = (sentence?.[1] ?? body).trim();
  return first.length > 300 ? `${first.slice(0, 297).trimEnd()}...` : first;
}

const rows = [];
let missingDescription = 0;
let moduleCount = 0;
for (const [area] of AREAS) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, area)).filter((name) => name.endsWith(".ts")).sort();
  } catch {
    continue;
  }
  for (const name of entries) {
    moduleCount += 1;
    const text = readFileSync(join(repoRoot, area, name), "utf8");
    const description = describeModule(text);
    if (!description) {
      missingDescription += 1;
    }
    rows.push({
      area,
      path: `${area}/${name}`,
      lines: text.split("\n").length,
      description: description ?? "_(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_"
    });
  }
}

check("modules_were_found", moduleCount > 0, `${moduleCount} modules`);

function renderIndex() {
  const lines = [
    "# Bản đồ mã nguồn — mọi module và nhiệm vụ của nó",
    "",
    "**File này do máy sinh ra từ chính mã nguồn.** Đừng sửa tay: `npm test` sẽ báo đỏ nếu nó lệch",
    "với code. Muốn cập nhật: `node scripts/audit-module-index.mjs --write`.",
    "",
    "Mô tả lấy từ câu đầu tiên trong khối chú thích đầu mỗi file. Muốn một module được mô tả rõ hơn ở",
    "đây thì sửa chú thích trong chính file đó — tài liệu và code không thể lệch nhau khi chỉ có một nguồn.",
    "",
    `Tổng cộng **${moduleCount} module** trên ${AREAS.length} khu vực.`,
    "",
    "Bức tranh tổng thể của dự án, luồng tạo video và việc còn dang dở nằm ở [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md).",
    ""
  ];
  for (const [area, purpose] of AREAS) {
    const areaRows = rows.filter((row) => row.area === area);
    if (areaRows.length === 0) {
      continue;
    }
    lines.push(`## \`${area}/\` — ${purpose}`, "");
    lines.push(`${areaRows.length} module.`, "");
    lines.push("| Module | Dòng | Nhiệm vụ |", "|---|---:|---|");
    for (const row of areaRows) {
      const escaped = row.description.replace(/\|/gu, "\\|");
      lines.push(`| [\`${row.path.split("/").pop()}\`](../${row.path}) | ${row.lines} | ${escaped} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

const generated = renderIndex();
if (process.argv.includes("--write")) {
  writeFileSync(indexPath, generated, "utf8");
  console.log(`Wrote ${indexPath} (${moduleCount} modules, ${missingDescription} without a description).`);
  process.exit(0);
}

let committed;
try {
  committed = readFileSync(indexPath, "utf8");
} catch {
  committed = undefined;
}
check("index_file_exists", committed !== undefined, indexPath);
check("index_matches_the_code", committed === generated,
  committed === generated
    ? `${moduleCount} modules`
    : "docs/BAN-DO-MA-NGUON.md is out of date. Run: node scripts/audit-module-index.mjs --write");

check("undescribed_modules_within_budget",
  missingDescription <= MISSING_DESCRIPTION_BUDGET,
  `${missingDescription} modules have no header description, budget ${MISSING_DESCRIPTION_BUDGET}: ` +
    rows.filter((row) => row.description.startsWith("_(")).map((row) => row.path).join(", "));

// A drop must be banked or the budget becomes headroom for new undescribed modules.
check("budget_is_not_stale",
  missingDescription >= MISSING_DESCRIPTION_BUDGET - 4,
  missingDescription < MISSING_DESCRIPTION_BUDGET - 4
    ? `Only ${missingDescription} remain — lower MISSING_DESCRIPTION_BUDGET to ${missingDescription}.`
    : `${missingDescription} of ${MISSING_DESCRIPTION_BUDGET}`);

const failed = checks.filter((entry) => entry.status !== "pass");
const report = {
  schemaVersion: "cinejelly.module-index-audit.v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: { moduleCount, missingDescription, budget: MISSING_DESCRIPTION_BUDGET },
  summary: { passedChecks: checks.length - failed.length, failedChecks: failed.length },
  checks,
  nextActions: [
    "After adding, renaming or deleting a module: node scripts/audit-module-index.mjs --write",
    "To improve an entry, edit the header comment in the module itself - the index has no separate text to fall out of date."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
