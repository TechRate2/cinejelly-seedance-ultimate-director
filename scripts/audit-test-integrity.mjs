#!/usr/bin/env node
/**
 * Counts checks that assert on SOURCE TEXT instead of behaviour, and refuses to let that number grow.
 *
 * A check that reads a `.ts` file and searches it for a string is green whether or not the feature
 * works — and stays green after the feature is deleted, as long as the words survive. Several in this
 * repository were found doing exactly that while claiming to guard money, admin authorization and the
 * content gate. One file asserted, in two checks that both passed, that the same gate ran BEFORE and
 * AFTER the spend it protects.
 *
 * For an owner who cannot read the code, a false green is worse than a red: it is the difference
 * between "I do not know" and "I believe something untrue".
 *
 * Converting every one at once is not realistic — there are dozens, and each needs its own behavioural
 * replacement. So this does the next best thing and the thing that actually holds: it records where
 * the number stands and fails if it rises. New work must be behavioural, and the backlog can only
 * shrink. Lower BUDGET whenever you convert some; never raise it.
 *
 * Structural assertions are legitimate and NOT counted: "this directory contains no .env file",
 * "package.json declares this command". The line is whether the claim is about BEHAVIOUR — if the
 * feature could be deleted and the check stay green, it counts.
 *
 * Pure: reads files, no network, no spend.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(repoRoot, "tests");

/**
 * Source-text assertions remaining, measured 2026-07-31: 129, after four were deleted from
 * run-render-failure-resilience-smoke.mjs once a behavioural file covered the same rule for real.
 * Lower this when you convert some. Raising it means shipping a check that cannot fail when the
 * feature breaks.
 *
 * Worst offenders at the time of writing, and the honest note that the third one is recent work:
 *   run-input-matrix-smoke.mjs            45
 *   run-talking-duration-fill-smoke.mjs   12
 *   run-render-failure-resilience-smoke    8  <- was 11; the four that a real regression could
 *                                              not turn red were removed, not rewritten
 *   run-pipeline-upgrades-smoke.mjs       10
 * Knowing better is not the same as doing better; that is why this is a machine check and not a note.
 */
const BUDGET = 129;

/** A check line that reads product source and asserts something about the text it finds there. */
const READS_PRODUCT_SOURCE = /(?:Src|Source|source)\s*(?:\.includes\(|\.match\(|\.indexOf\()|\.test\((?:\w*(?:Src|Source|source))\)/u;

const checks = [];
const check = (id, label, pass, evidence) =>
  checks.push({ id, label, status: pass ? "pass" : "fail", ...(evidence !== undefined ? { evidence: String(evidence).slice(0, 600) } : {}) });

const files = readdirSync(testsDir).filter((name) => name.startsWith("run-") && name.endsWith("-smoke.mjs")).sort();
check("tests_are_readable", "Test files are readable", files.length > 0, `${files.length} files`);

const perFile = [];
let textAssertions = 0;
let totalChecks = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(testsDir, file), "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  let fileTextAssertions = 0;
  let fileChecks = 0;
  // A check can span lines, so scan from each `check(` to the end of its statement.
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bcheck\(/u.test(lines[index] ?? "")) {
      continue;
    }
    fileChecks += 1;
    const statement = lines.slice(index, index + 6).join("\n");
    if (READS_PRODUCT_SOURCE.test(statement)) {
      fileTextAssertions += 1;
    }
  }
  totalChecks += fileChecks;
  textAssertions += fileTextAssertions;
  if (fileTextAssertions > 0) {
    perFile.push({ file, textAssertions: fileTextAssertions, checks: fileChecks });
  }
}
perFile.sort((left, right) => right.textAssertions - left.textAssertions);

check("source_text_assertions_within_budget",
  `Source-text assertions do not exceed the recorded budget of ${BUDGET}`,
  textAssertions <= BUDGET,
  `${textAssertions} found, budget ${BUDGET}. Worst files: ` +
    perFile.slice(0, 5).map((entry) => `${entry.file} (${entry.textAssertions})`).join(", "));

// A drop is good news that must be banked, or the budget silently becomes headroom for new ones.
check("budget_is_not_stale",
  "Budget matches reality closely enough to be a real ceiling",
  textAssertions >= BUDGET - 25,
  textAssertions < BUDGET - 25
    ? `Only ${textAssertions} remain against a budget of ${BUDGET} — lower BUDGET to ${textAssertions} to bank the improvement.`
    : `${textAssertions} of ${BUDGET}`);

// The majority of checks must still run code. If that ever inverts, the suite has stopped being
// evidence regardless of what the absolute count says.
const behaviourShare = totalChecks > 0 ? (totalChecks - textAssertions) / totalChecks : 1;
check("most_checks_run_real_code",
  "At least 80% of checks exercise behaviour rather than source text",
  behaviourShare >= 0.8,
  `${Math.round(behaviourShare * 100)}% behavioural (${totalChecks - textAssertions}/${totalChecks})`);

const failed = checks.filter((entry) => entry.status !== "pass");
const report = {
  schemaVersion: "cinejelly.test-integrity-audit.v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: { testFileCount: files.length, totalChecks, budget: BUDGET },
  summary: { passedChecks: checks.length - failed.length, failedChecks: failed.length, sourceTextAssertions: textAssertions },
  worstFiles: perFile.slice(0, 10),
  checks,
  nextActions: [
    "Write new checks against behaviour: load from dist/, call the function, compare the result.",
    "When converting an existing one, prefer the checks that claim to guard money, authorization or delivery - those are the ones whose false green costs something."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
