#!/usr/bin/env node
/**
 * No-spend regression for metered "total pipeline cost" pricing + the anti-farm trial pack.
 *  - the estimator bills video render-seconds × the quality's candidate passes × the tier's rate,
 *    + overhead, floored at the minimum charge (a re-render pass is billed, never eaten);
 *  - the once-per-account paid trial can be claimed exactly once (farm-proof), while regular
 *    packs stay claimable; the default catalog keeps exactly one loss-leader trial + a 4-pack
 *    margin-positive ladder.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimatePipelineRenderCredits,
  loadPipelineCostConfig,
  loadRenderCreditPricing,
  UserAccountStore,
  DEFAULT_CREDIT_PACKAGES
} from "../dist/api/user-account-store.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}

// ---- Part A: metered estimator (pure). ----
const config = loadPipelineCostConfig({});
const credits = (o) => estimatePipelineRenderCredits({ ...o, config }).credits;
// Values track the default config (basis 0.01, standard 0.09/s, overhead 1.15). Compute the
// expected economy credits from the config so the checks aren't brittle to overhead/rate tuning.
const rate = (tier) => config.videoCostUsdPerSecondByTier[tier];
const expectedEconomy = (sec, tier) =>
  Math.max(config.minimumChargeCredits, Math.ceil((sec * 1 * rate(tier) * config.overheadMultiplier) / config.creditCostBasisUsd));
// 15s economy (1 pass, no repair/test-take) standard tier = 156 at the shipped default.
check("estimate_15s_economy_standard", credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "standard" }) === expectedEconomy(15, "standard"),
  credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "standard" }));
// 15s standard bills candidates(2) + repairs(1) + test-takes(3 shots × 4s = 12) = 57 render-sec = 590.
check("estimate_15s_standard_bills_repairs_and_testtakes", credits({ durationTargetSeconds: 15, qualityMode: "standard", tier: "standard" }) === 590,
  credits({ durationTargetSeconds: 15, qualityMode: "standard", tier: "standard" }));
// 15s ultimate bills candidates(4) + repairs(3) + test-takes(12) = 117 render-sec = 1211.
check("estimate_15s_ultimate_bills_all_passes", credits({ durationTargetSeconds: 15, qualityMode: "ultimate", tier: "standard" }) === 1211,
  credits({ durationTargetSeconds: 15, qualityMode: "ultimate", tier: "standard" }));
// The higher tiers must bill MORE than N×economy would (margin can't invert on high/ultimate).
check("higher_quality_bills_above_candidates_only",
  credits({ durationTargetSeconds: 15, qualityMode: "standard", tier: "standard" }) > expectedEconomy(15, "standard") * 2 &&
  credits({ durationTargetSeconds: 15, qualityMode: "ultimate", tier: "standard" }) > expectedEconomy(15, "standard") * 4);
// economy is untouched (no repair/test-take passes) — the cheap, competitive default.
check("economy_has_no_repair_or_testtake", credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "standard" }) === expectedEconomy(15, "standard"));
// mini tier is the cheapest teaser.
check("estimate_mini_is_cheapest", credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "mini" }) === expectedEconomy(15, "mini"),
  credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "mini" }));
check("mini_cheaper_than_standard", credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "mini" }) < credits({ durationTargetSeconds: 15, qualityMode: "economy", tier: "standard" }));
// A longer clip costs proportionally more (30s economy = 2× 15s economy).
check("estimate_scales_with_duration", credits({ durationTargetSeconds: 30, qualityMode: "economy", tier: "standard" }) === expectedEconomy(30, "standard"));
// Unknown quality must never bill fewer passes than standard.
check("estimate_unknown_quality_not_cheaper", credits({ durationTargetSeconds: 15, qualityMode: "bogus", tier: "standard" }) >= 590);
// NaN/absent duration coerces to the 15s default (never NaN credits).
check("estimate_nan_duration_safe", credits({ durationTargetSeconds: Number.NaN, qualityMode: "economy" }) === expectedEconomy(15, "standard"));
// Minimum-charge floor on a 1-second clip.
check("estimate_min_charge_floor", credits({ durationTargetSeconds: 1, qualityMode: "economy", tier: "mini" }) >= config.minimumChargeCredits);

// ---- Part B: default catalog shape. ----
const trials = DEFAULT_CREDIT_PACKAGES.filter((p) => p.oncePerAccount === true);
const regular = DEFAULT_CREDIT_PACKAGES.filter((p) => !p.oncePerAccount);
check("one_trial_pack", trials.length === 1, `count=${trials.length}`);
check("trial_is_loss_leader", trials.every((p) => p.priceUsd / p.credits <= 0.0105), trials.map((p) => (p.priceUsd / p.credits).toFixed(4)).join(","));
check("regular_ladder_of_four", regular.length === 4, `count=${regular.length}`);
check("regular_packs_margin_positive", regular.every((p) => p.priceUsd / p.credits > 0.01), regular.map((p) => (p.priceUsd / p.credits).toFixed(4)).join(" "));

// ---- Part C: anti-farm — the trial pack is claimable ONCE per account. ----
const workDir = mkdtempSync(join(tmpdir(), "cinejelly-pipeline-pricing-"));
try {
  const store = new UserAccountStore({ storePath: join(workDir, "accounts.json"), pricing: loadRenderCreditPricing(process.env) });
  const registered = await store.register({ email: "farmer@test.local", password: "Farm-Test-1234" });
  const userId = registered.user.userId;
  const trialPack = trials[0];
  const first = store.requestTopupForPackage({ userId, creditPackage: trialPack });
  store.decideTopup({ topupId: first.topupId, approve: true });
  check("trial_first_claim_credits", store.balanceOf(userId) === trialPack.credits, `balance=${store.balanceOf(userId)}`);
  // Second claim of the same once-per-account pack must be rejected (farm-proof).
  let secondBlocked = false;
  try {
    store.requestTopupForPackage({ userId, creditPackage: trialPack });
  } catch (error) {
    secondBlocked = (error.statusCode === 409) || /1 l[aầ]n/i.test(error.message || "");
  }
  check("trial_second_claim_blocked", secondBlocked);
  // A regular pack is still claimable after the trial.
  const regularTopup = store.requestTopupForPackage({ userId, creditPackage: regular[0] });
  check("regular_pack_still_claimable", regularTopup.status === "pending", `status=${regularTopup.status}`);

  // REGRESSION (anti-farm HIGH): even if the catalog drops the oncePerAccount FLAG (as admin
  // Settings / env-JSON re-saves used to), the protected trial ID stays once-per-account via the
  // server-side ID set — a fresh account can't re-claim goi_dungthu without the flag.
  const registered2 = await store.register({ email: "farmer2@test.local", password: "Farm2-Test-1234" });
  const userId2 = registered2.user.userId;
  const flaglessTrial = { packageId: "goi_dungthu", label: "Trial (no flag)", credits: 400, priceUsd: 3, priceVnd: 81000 };
  const t2a = store.requestTopupForPackage({ userId: userId2, creditPackage: flaglessTrial });
  store.decideTopup({ topupId: t2a.topupId, approve: true });
  let flaglessBlocked = false;
  try {
    store.requestTopupForPackage({ userId: userId2, creditPackage: flaglessTrial });
  } catch (error) {
    flaglessBlocked = (error.statusCode === 409) || /1 l[aầ]n/i.test(error.message || "");
  }
  check("protected_id_enforced_without_flag", flaglessBlocked);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

// ---- Part D: client/server PRICE PARITY (finding F4). ----
// Faithful replica of the studio's meteredCredits + the descriptor's derived rate. The client must
// show the SAME credits the server charges (repair passes + test-takes included), or a customer is
// quoted a low number and then hit with a surprise 402.
function descriptorRate(cfg, tier) {
  const overhead = cfg.overheadMultiplier >= 1 ? cfg.overheadMultiplier : 1;
  const basis = cfg.creditCostBasisUsd > 0 ? cfg.creditCostBasisUsd : 0.01;
  const usd = cfg.videoCostUsdPerSecondByTier[tier];
  return Math.round(((usd * overhead) / basis) * 1000) / 1000;
}
function clientMeteredCredits(cfg, seconds, tier, quality) {
  const rate = descriptorRate(cfg, tier);
  const cand = cfg.candidateCountByQuality[quality] || 2;
  const repair = cfg.repairCountByQuality[quality] != null ? cfg.repairCountByQuality[quality] : 0;
  const avgShot = cfg.avgSecondsPerShot > 0 ? cfg.avgSecondsPerShot : 5;
  const testPer = cfg.testTakeSecondsPerShot > 0 ? cfg.testTakeSecondsPerShot : 0;
  const testTake = (quality !== "economy" && testPer > 0) ? Math.ceil(seconds / Math.max(1, avgShot)) * testPer : 0;
  const billed = seconds * (cand + repair) + testTake;
  return Math.max(cfg.minimumChargeCredits || 20, Math.ceil(billed * rate));
}
for (const [sec, quality, tier] of [
  [15, "economy", "standard"], [15, "standard", "standard"], [15, "high", "standard"],
  [30, "ultimate", "standard"], [15, "economy", "mini"], [45, "standard", "standard"]
]) {
  const client = clientMeteredCredits(config, sec, tier, quality);
  const server = estimatePipelineRenderCredits({ durationTargetSeconds: sec, qualityMode: quality, tier, config }).credits;
  check(`price_parity_${sec}s_${quality}_${tier}`, client === server, `client=${client} server=${server}`);
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.pipeline-pricing-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep this green when changing the metered estimator, unit costs, the credit basis, or the trial-pack anti-farm rule.",
    "The customer charge (planUserRenderCharge) uses this estimator only when CINEJELLY_PIPELINE_PRICING=true."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
