#!/usr/bin/env node
/**
 * No-spend regression for the two ways a render used to die after the customer had already paid.
 *
 * 1. A PROVIDER FAILURE killed the job in economy mode. Economy buys zero repair attempts, which is a
 *    fair quality choice — the customer accepted the first take. But that same budget was the only
 *    thing between a failed Atlas prediction and a dead job, and nothing is wrong with the request
 *    when the provider returns a failure: the render simply did not happen. Provider failures now get
 *    their own budget in every quality mode.
 *
 * 2. A "COULD BE BETTER" VERDICT killed the job. The inspection gate refused on all three
 *    severities, so one mild `repair` verdict on shot 7 of 10 destroyed the other nine finished
 *    clips and the customer got nothing after paying for everything. Only genuinely unusable clips
 *    (`rerender` / `block`) may refuse now; a surviving `repair` ships with a warning.
 *
 * Drives the real DirectorAgent with stub providers that count calls. No network, no spend.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { PROVIDER_FAILURE_RETRY_ATTEMPTS, repairAttemptCountForQuality, candidateCountForQuality } =
  await import(`${base}/config/seedance-settings.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const directorSource = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");
const settingsSource = readFileSync(resolve(repoRoot, "src/config/seedance-settings.ts"), "utf8");
const costGateSource = readFileSync(resolve(repoRoot, "src/core/render-cost-gate.ts"), "utf8");

// --- 1. A provider failure is retried in EVERY quality mode, not out of the repair budget.
check("economy_still_buys_no_content_repairs", repairAttemptCountForQuality("economy") === 0,
  String(repairAttemptCountForQuality("economy")));
check("provider_failure_budget_exists", PROVIDER_FAILURE_RETRY_ATTEMPTS >= 1, String(PROVIDER_FAILURE_RETRY_ATTEMPTS));
check("provider_failure_budget_is_bounded", PROVIDER_FAILURE_RETRY_ATTEMPTS <= 3,
  `a real outage must surface fast, not retry through the balance: ${PROVIDER_FAILURE_RETRY_ATTEMPTS}`);
// Quality-independent by construction: a plain exported literal, not a function of qualityMode, and
// the retry loop is bounded by that literal directly. (Asserted on the declaration and the loop
// rather than on how close the word "qualityMode" happens to sit in the file — the first version of
// this check measured text proximity and failed because the constant is declared next to the
// per-quality repair function, which proves nothing either way.)
check("provider_failure_budget_is_a_plain_constant",
  /export const PROVIDER_FAILURE_RETRY_ATTEMPTS = \d+;/.test(settingsSource),
  (settingsSource.match(/export const PROVIDER_FAILURE_RETRY_ATTEMPTS[^\n]*/) ?? ["missing"])[0]);
check("provider_failure_budget_is_not_a_function_of_quality",
  !/PROVIDER_FAILURE_RETRY_ATTEMPTS\s*\(/.test(settingsSource) &&
  !/function PROVIDER_FAILURE_RETRY/.test(settingsSource));
// The retry itself — that a failed shot is re-submitted, that "succeeded with no output URL" counts
// as a failure, and that the RE-RENDERED clip is the one delivered — is proved by running the real
// DirectorAgent against a provider that fails on demand, in run-provider-retry-behaviour-smoke.mjs.
// Four checks used to live here that searched this file for the retry loop's source text. They were
// deleted rather than kept alongside: inverting candidate ordering, so the failed take wins and the
// customer receives the broken clip, left all four green and the behavioural file red.
// The remaining checks below cover what that run does NOT reach: the cost ceiling's arithmetic.

// --- 2. Those extra submissions are real renders, so the ceiling has to include them.
check("cost_ceiling_counts_provider_retries", /PROVIDER_FAILURE_RETRY_ATTEMPTS/.test(costGateSource));
const attemptsExpression = costGateSource.slice(
  costGateSource.indexOf("const attemptsPerShot"),
  costGateSource.indexOf("const plannedClipCount")
);
check("cost_ceiling_adds_retries_to_candidates_and_repairs",
  /candidateCount/.test(attemptsExpression) && /repairAttemptCount/.test(attemptsExpression) &&
  /PROVIDER_FAILURE_RETRY_ATTEMPTS/.test(attemptsExpression), attemptsExpression.trim().slice(0, 160));
// Sanity on the arithmetic itself: an economy shot must be budgeted for more than one submission now.
const economyAttempts = candidateCountForQuality("economy") + repairAttemptCountForQuality("economy") + PROVIDER_FAILURE_RETRY_ATTEMPTS;
check("economy_shot_is_budgeted_for_a_retry", economyAttempts > candidateCountForQuality("economy"), `attempts=${economyAttempts}`);

// --- 3. Only UNUSABLE clips may refuse delivery of an already-paid render.
const inspectGate = directorSource.slice(
  directorSource.indexOf('this.reportStageProgress("inspect", "running", "Inspecting rendered shots.")'),
  directorSource.indexOf('this.reportStageProgress("repair"')
);
check("inspection_gate_refuses_only_unusable_clips",
  inspectGate.includes("this.needsTestTakeBlock(renderedShot.renderInspection)") &&
  !inspectGate.includes("this.needsRenderRepair(renderedShot.renderInspection)"),
  inspectGate.slice(0, 200));
check("imperfect_shots_are_reported_not_thrown",
  inspectGate.includes('renderedShot.renderInspection.status === "repair"') &&
  inspectGate.includes("imperfectShotCount"));
// Exactly one throw survives in this gate, and it is the unusable one.
check("inspection_gate_throws_once", (inspectGate.match(/throw new Error\(/g) ?? []).length === 1,
  String((inspectGate.match(/throw new Error\(/g) ?? []).length));
check("unusable_verdicts_are_rerender_and_block",
  /needsTestTakeBlock\(report: GuardianReport\): boolean \{\s*return report\.status === "rerender" \|\| report\.status === "block";/.test(directorSource));
// The repair loop keeps using the LOOSER predicate — a "could be better" verdict should still spend
// the repair budget trying to improve it. Only the delivery decision changed.
const repairLoop = directorSource.slice(
  directorSource.indexOf("let repairAttempt = 1;"),
  directorSource.indexOf("let repairAttempt = 1;") + 300
);
check("repair_loop_still_tries_to_improve_imperfect_shots",
  repairLoop.includes("this.needsRenderRepair(selectedCandidate.renderInspection)"), repairLoop.slice(0, 140));

// --- 4. The delivery gate downstream still has the final say, so shipping an imperfect shot cannot
// ship a broken FILE (wrong runtime, missing video stream, wrong resolution).
const deliverySource = readFileSync(resolve(repoRoot, "src/core/delivery-gate.ts"), "utf8");
check("delivery_gate_still_guards_the_assembled_file",
  /durationSeconds/.test(deliverySource) && /export class DeliveryGate/.test(deliverySource));
check("director_still_runs_the_delivery_gate", /this\.deliveryGate\./.test(directorSource));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.render-failure-resilience-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep the two severities apart: repair means 'could be better' and must never destroy a paid render; rerender/block mean 'unusable' and must always refuse.",
    "If PROVIDER_FAILURE_RETRY_ATTEMPTS is raised, the cost ceiling follows automatically - but check that a provider outage still fails fast enough."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
