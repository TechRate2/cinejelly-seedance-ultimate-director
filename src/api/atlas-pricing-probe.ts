/**
 * On-demand reader for Atlas Cloud's public model pricing page.
 *
 * Atlas Cloud does NOT expose a machine-readable pricing API — prices are published only on the
 * marketing pricing page (https://www.atlascloud.ai/pricing/models). To give operators a "check
 * live Atlas price" button, we fetch that PUBLIC page (no API key, no billable call) with
 * browser-like headers (Cloudflare 503s bare clients) and parse the per-model price cards.
 *
 * The page is a Next.js build with hashed CSS-module class names (e.g. `__KI0yCa__priceValue`).
 * The hash changes on every Atlas deploy, so we match on the STABLE suffix (`__priceValue`,
 * `__listModelName`, ...) and never on the hash. If Atlas restructures the markup, parsing yields
 * zero models and the caller surfaces an honest "could not read — open the page manually" state
 * instead of showing a wrong number.
 */

export const ATLAS_PRICING_PAGE_URL = "https://www.atlascloud.ai/pricing/models";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 6 * 1024 * 1024;
const MAX_CARD_CHARS = 6_000;

export interface AtlasModelPrice {
  /** Display name, e.g. "Seedance 2.0 Mini Reference-to-Video". */
  readonly name: string;
  /** Model slug from its detail link, e.g. "bytedance/seedance-2.0-mini/reference-to-video". */
  readonly slug: string | undefined;
  /** Billing unit exactly as shown, e.g. "/s video", "/image", "/1M tokens". */
  readonly unit: string;
  /** Discounted "Our Price" figure Atlas actually charges, parsed to a number (USD). */
  readonly ourPriceUsd: number | undefined;
  /** Undiscounted list "Standard Price" (USD), when shown. */
  readonly standardPriceUsd: number | undefined;
  /** Active discount percentage (positive integer), when a promo is running. */
  readonly discountPercent: number | undefined;
  /** Raw price strings as displayed, preserved for auditing/fallback. */
  readonly rawOurPrice: string | undefined;
  readonly rawStandardPrice: string | undefined;
  /** True when billed per second of video — the models CineJelly resells. */
  readonly perSecond: boolean;
  /**
   * When list price, discounted price, AND % are all shown: whether they agree
   * (our ≈ standard × (1 − pct/100)). false = the three figures disagree, so the displayed
   * cost may be mis-read — surface a warning rather than trust it. undefined = not enough data.
   */
  readonly discountConsistent: boolean | undefined;
}

export interface AtlasPricingProbeResult {
  readonly sourceUrl: string;
  readonly fetchedAtIso: string;
  readonly models: readonly AtlasModelPrice[];
  /** Cards that were detected but whose price could not be read — a partial-parse signal. */
  readonly incompletePriceCount: number;
}

export interface AtlasPricingProbeOptions {
  readonly timeoutMs?: number;
  /** Injectable fetch for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable clock for tests; defaults to () => new Date(). */
  readonly now?: () => Date;
}

export class AtlasPricingProbeError extends Error {
  public constructor(
    message: string,
    public readonly sourceUrl: string = ATLAS_PRICING_PAGE_URL
  ) {
    super(message);
    this.name = "AtlasPricingProbeError";
  }
}

/** Fetch and parse the live Atlas pricing page. Throws AtlasPricingProbeError on any failure. */
export async function probeAtlasModelPricing(
  options: AtlasPricingProbeOptions = {}
): Promise<AtlasPricingProbeResult> {
  const html = await fetchPricingHtml(options);
  const models = parseAtlasPricingHtml(html);
  if (models.length === 0) {
    throw new AtlasPricingProbeError(
      "Đọc được trang giá Atlas nhưng không nhận ra bảng giá (có thể Atlas đã đổi giao diện). Hãy mở trang giá Atlas để xem trực tiếp."
    );
  }
  const now = options.now ?? (() => new Date());
  const incompletePriceCount = models.filter((model) => model.ourPriceUsd === undefined).length;
  return {
    sourceUrl: ATLAS_PRICING_PAGE_URL,
    fetchedAtIso: now().toISOString(),
    models,
    incompletePriceCount
  };
}

async function fetchPricingHtml(options: AtlasPricingProbeOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Atlas pricing request timed out.")), timeoutMs);
  try {
    const response = await fetchImpl(ATLAS_PRICING_PAGE_URL, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      // Cloudflare returns 503 to bare clients; a browser-shaped request is served normally.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    // Defense-in-depth for the fixed target: if a redirect ever lands off the Atlas host,
    // refuse to read the body (blocks a redirect-based SSRF even though the URL is hardcoded).
    assertAtlasHost(response.url);
    if (!response.ok) {
      throw new AtlasPricingProbeError(`Trang giá Atlas trả về mã ${response.status}.`);
    }
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) {
      throw new AtlasPricingProbeError("Trang giá Atlas quá lớn để đọc an toàn.");
    }
    return await readCappedText(response);
  } catch (error) {
    if (error instanceof AtlasPricingProbeError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new AtlasPricingProbeError("Hết thời gian chờ khi đọc trang giá Atlas.");
    }
    const detail = error instanceof Error ? error.message : "lỗi không rõ";
    throw new AtlasPricingProbeError(`Không kết nối được trang giá Atlas: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

function assertAtlasHost(finalUrl: string | undefined): void {
  // response.url is empty in some fetch mocks; treat empty as "no redirect happened" (safe).
  if (!finalUrl) {
    return;
  }
  let hostname: string;
  try {
    hostname = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    throw new AtlasPricingProbeError("URL trang giá Atlas không hợp lệ.");
  }
  if (hostname !== "atlascloud.ai" && !hostname.endsWith(".atlascloud.ai")) {
    throw new AtlasPricingProbeError("Trang giá Atlas chuyển hướng tới máy chủ lạ — đã dừng để an toàn.");
  }
}

async function readCappedText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    // Enforce the byte cap on the fallback path too (a null body still shouldn't be unbounded).
    if (text.length > MAX_PAGE_BYTES) {
      throw new AtlasPricingProbeError("Trang giá Atlas quá lớn để đọc an toàn.");
    }
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let readBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      readBytes += chunk.value.byteLength;
      if (readBytes > MAX_PAGE_BYTES) {
        throw new AtlasPricingProbeError("Trang giá Atlas quá lớn để đọc an toàn.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse the pricing HTML into per-model rows. Exported so a no-network smoke can exercise it
 * against a saved fixture. Returns [] when nothing recognisable is found (never throws).
 */
export function parseAtlasPricingHtml(rawHtml: string): AtlasModelPrice[] {
  // Next.js splits some text with empty comments ("-20<!-- -->%"); drop them before matching.
  const html = rawHtml.replace(/<!--.*?-->/g, "");
  // Tolerate extra classes/attributes after the marker class (Next.js elements often carry more
  // than one class), so a card is still detected if Atlas appends a class to the name element.
  const nameMarker = /__listModelName(?:\s[^"]*)?"[^>]*>/g;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = nameMarker.exec(html)) !== null) {
    starts.push(match.index);
  }
  const models: AtlasModelPrice[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i] ?? 0;
    const nextStart = starts[i + 1] ?? html.length;
    const end = Math.min(nextStart, start + MAX_CARD_CHARS);
    const parsed = parseCard(html.slice(start, end));
    if (parsed) {
      models.push(parsed);
    }
  }
  return models;
}

// Match `__<suffix>` whether the element carries only that class (`…__x"`) or extra classes /
// attributes after it (`…__x other"` / `…__x" data-…`), then capture the element's text.
function classText(chunk: string, suffix: string): string | undefined {
  const re = new RegExp("__" + suffix + "(?:\\s[^\"]*)?\"[^>]*>\\s*([^<]*?)\\s*<");
  return firstGroup(chunk, re)?.trim() || undefined;
}

function parseCard(chunk: string): AtlasModelPrice | undefined {
  const name = classText(chunk, "listModelName");
  if (!name) {
    return undefined;
  }
  const rawOurPrice = classText(chunk, "priceValue");
  const unit = (classText(chunk, "priceUnit") ?? "").replace(/\s+/g, " ");
  const rawStandardPrice =
    firstGroup(chunk, /__listStandardPrice"[\s\S]*?__cellValue(?:\s[^"]*)?"[^>]*>\s*([^<]*?)\s*</)?.trim() ||
    undefined;
  const discountPercent = parseDiscount(chunk);
  const slug = firstGroup(chunk, /href="\/models\/([^"?#]+)"/)?.trim() || undefined;
  const ourPriceUsd = parseUsd(rawOurPrice);
  const standardPriceUsd = parseUsd(rawStandardPrice);
  return {
    name,
    slug,
    unit,
    ourPriceUsd,
    standardPriceUsd,
    discountPercent,
    rawOurPrice,
    rawStandardPrice,
    // Cover "/s", "/s video", "/sec", "/second(s)", and "per second" phrasings; not "/image".
    perSecond: /\/\s*s(ec(ond)?s?)?\b/i.test(unit) || /per\s*sec/i.test(unit),
    discountConsistent: discountConsistency(ourPriceUsd, standardPriceUsd, discountPercent)
  };
}

// When list price, discounted price, and % are all present, confirm they agree so a mis-read of
// which figure is the real cost surfaces as a warning instead of a silently-wrong margin.
function discountConsistency(
  our: number | undefined,
  standard: number | undefined,
  pct: number | undefined
): boolean | undefined {
  if (our === undefined || standard === undefined || pct === undefined || standard <= 0) {
    return undefined;
  }
  const expected = standard * (1 - pct / 100);
  const tolerance = Math.max(0.005, expected * 0.05);
  return Math.abs(our - expected) <= tolerance;
}

function parseDiscount(chunk: string): number | undefined {
  const raw = firstGroup(chunk, /__discountText[^>]*>\s*-?\s*([0-9]{1,3})\s*%/);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : undefined;
}

function parseUsd(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return undefined;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function firstGroup(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[1];
}
