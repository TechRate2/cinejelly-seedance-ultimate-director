#!/usr/bin/env node
/**
 * No-spend, no-network regression for the "check live Atlas price" reader.
 *
 * Atlas Cloud has no pricing API, so the operator button reads their public pricing PAGE and
 * parses per-model price cards. The page is a Next.js build whose CSS-module class hashes change
 * on every deploy, so this smoke feeds a fixture that uses a DIFFERENT hash than production to
 * prove parsing keys on the stable class SUFFIX (`__priceValue`, `__listModelName`, ...), never
 * the hash. It also exercises the probe's fetch wrapper with an injected fetch (no real request),
 * covering the 503-block and empty-parse failure paths.
 */

import {
  parseAtlasPricingHtml,
  probeAtlasModelPricing,
  AtlasPricingProbeError
} from "../dist/api/atlas-pricing-probe.js";

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });
}

// A representative two-card fixture. Hash "Zz9Aa7" deliberately differs from production's "KI0yCa".
// The empty `<!-- -->` inside the discount mirrors Next.js's real markup ("-20<!-- -->%").
const HASH = "Zz9Aa7";
const c = (suffix) => `PricingModelCard-module-scss-module__${HASH}__${suffix}`;
// Structure mirrors production: the model detail <a href="/models/..."> sits at the END of the
// card (after the discount block), i.e. within the same slice as its listModelName.
const videoCard = `
  <div class="${c("trigger")}">
    <div class="${c("listModelName")}">Seedance 2.0 Mini Reference-to-Video</div>
  </div>
  <div class="${c("listStandardPrice")}">
    <span class="${c("mobileLabel")}">Standard Price</span>
    <div class="${c("cellValue")}">$0.056</div>
  </div>
  <div class="${c("listOurPrice")}">
    <span class="${c("mobileLabel")}">Our Price</span>
    <div class="${c("cellValue")}">
      <div class="${c("listPriceText")}">
        <span class="${c("startFrom")}">Start from</span>
        <div class="${c("priceWithUnit")}">
          <span class="${c("priceValue")}">$0.045</span>
          <span class="${c("priceUnit")}">/s video</span>
        </div>
      </div>
    </div>
  </div>
  <div class="${c("listDiscount")}">
    <span class="${c("mobileLabel")}">Discount</span>
    <div class="${c("cellValue")}">
      <span class="${c("discountText")} ${c("discountOrange")}">-20<!-- -->%</span>
    </div>
  </div>
  <a href="/models/bytedance/seedance-2.0-mini/reference-to-video">Details</a>`;
const imageCard = `
  <div class="${c("trigger")}">
    <div class="${c("listModelName")}">Flux 2 Pro Text-to-Image</div>
  </div>
  <div class="${c("listOurPrice")}">
    <div class="${c("priceWithUnit")}">
      <span class="${c("priceValue")}">$0.04</span>
      <span class="${c("priceUnit")}">/image</span>
    </div>
  </div>
  <a href="/models/black-forest-labs/flux-2-pro">Details</a>`;
// Third card exercises: (a) unit written as "/second" (not "/s"), (b) an EXTRA class on the
// priceValue element (multi-class tolerance), (c) a card whose price element is absent so the
// name parses but ourPriceUsd stays undefined (incomplete-parse signal).
const secondUnitCard = `
  <div class="${c("listModelName")}">Some Video Second-Unit</div>
  <div class="${c("priceWithUnit")}">
    <span class="${c("priceValue")} ${c("emphasis")}">$0.20</span>
    <span class="${c("priceUnit")}">/second</span>
  </div>`;
const brokenCard = `<div class="${c("listModelName")}">Unreadable Model</div><div>no price element here</div>`;
const FIXTURE_HTML = `<!doctype html><html><body>${videoCard}${imageCard}${secondUnitCard}${brokenCard}</body></html>`;

// ---- Part A: pure parser (hash-agnostic, fields, discount, per-second flag). ----
const models = parseAtlasPricingHtml(FIXTURE_HTML);
check("parses_all_cards", models.length === 4, `count=${models.length}`);

const video = models.find((m) => m.name.startsWith("Seedance"));
check("video_name_extracted", video && video.name === "Seedance 2.0 Mini Reference-to-Video", video && video.name);
check("video_our_price_number", video && video.ourPriceUsd === 0.045, video && video.ourPriceUsd);
check("video_standard_price_number", video && video.standardPriceUsd === 0.056, video && video.standardPriceUsd);
check("video_unit_per_second", video && video.unit === "/s video", video && video.unit);
check("video_per_second_flag", video && video.perSecond === true, video && String(video.perSecond));
check("video_discount_20", video && video.discountPercent === 20, video && video.discountPercent);
check("video_slug_extracted", video && video.slug === "bytedance/seedance-2.0-mini/reference-to-video", video && video.slug);
// 0.045 ≈ 0.056 × (1 − 0.20) = 0.0448 → the three shown figures agree.
check("video_discount_consistent", video && video.discountConsistent === true, video && String(video.discountConsistent));

const image = models.find((m) => m.name.startsWith("Flux"));
check("image_our_price_number", image && image.ourPriceUsd === 0.04, image && image.ourPriceUsd);
check("image_not_per_second", image && image.perSecond === false, image && String(image.perSecond));
check("image_no_discount", image && image.discountPercent === undefined, image && String(image.discountPercent));
check("image_discount_consistent_undefined", image && image.discountConsistent === undefined, image && String(image.discountConsistent));

// "/second" unit + a SECOND class on the price element (hash-agnostic multi-class tolerance).
const secondUnit = models.find((m) => m.name.startsWith("Some Video"));
check("second_unit_per_second_flag", secondUnit && secondUnit.perSecond === true, secondUnit && `${secondUnit.unit}=${secondUnit.perSecond}`);
check("multi_class_price_parsed", secondUnit && secondUnit.ourPriceUsd === 0.2, secondUnit && secondUnit.ourPriceUsd);

// A card whose price element is missing still yields the model (name) but with no price — this is
// the partial-parse signal the caller surfaces as a warning instead of a silently-short table.
const broken = models.find((m) => m.name.startsWith("Unreadable"));
check("broken_card_name_only", broken && broken.ourPriceUsd === undefined, broken && String(broken.ourPriceUsd));

// Empty / unrelated HTML must yield zero models (caller then shows an honest fallback, not a fake price).
check("empty_html_zero_models", parseAtlasPricingHtml("<html><body>no pricing here</body></html>").length === 0);

// ---- Part B: probe wrapper with injected fetch (no real network). ----
const fixedNow = () => new Date("2026-07-05T00:00:00.000Z");
function fakeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    body: null,
    text: async () => body
  };
}

const probed = await probeAtlasModelPricing({
  fetchImpl: async () => fakeResponse(FIXTURE_HTML),
  now: fixedNow
});
check("probe_returns_models", probed.models.length === 4, `count=${probed.models.length}`);
check("probe_stamps_fetched_at", probed.fetchedAtIso === "2026-07-05T00:00:00.000Z", probed.fetchedAtIso);
check("probe_source_url", probed.sourceUrl === "https://www.atlascloud.ai/pricing/models", probed.sourceUrl);
// The one price-less card is reported so the operator sees "some rows unreadable", not a short table.
check("probe_incomplete_count", probed.incompletePriceCount === 1, `incomplete=${probed.incompletePriceCount}`);

// Cloudflare 503 to a bare client → surfaced as a clear error, never a fabricated price.
let blockedThrew = false;
try {
  await probeAtlasModelPricing({ fetchImpl: async () => fakeResponse("blocked", 503), now: fixedNow });
} catch (error) {
  blockedThrew = error instanceof AtlasPricingProbeError && /503/.test(error.message);
}
check("probe_503_throws_probe_error", blockedThrew);

// 200 but unrecognisable markup → explicit parse-failure error (no silent empty success).
let parseFailThrew = false;
try {
  await probeAtlasModelPricing({ fetchImpl: async () => fakeResponse("<html>changed layout</html>"), now: fixedNow });
} catch (error) {
  parseFailThrew = error instanceof AtlasPricingProbeError;
}
check("probe_unparseable_throws", parseFailThrew);

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.atlas-pricing-probe-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "If Atlas restructures its pricing page, update parseAtlasPricingHtml and refresh this fixture.",
    "The operator button reads Atlas's PUBLIC page only — it never calls the billable Atlas API."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
