/**
 * Product URL researcher for short-pipeline URL-to-video planning.
 * It fetches bounded public HTML only after explicit live-network confirmation,
 * extracts safe product facts, and leaves raw source URLs out of public evidence.
 */

import { createHash } from "node:crypto";
import type {
  ProductUrlSnapshotInput,
  ProductUrlSourceEvidence
} from "../types/short-pipeline.js";
import { internalSourcePatternOrigins } from "./private-source-pattern-registry.js";
import { isLocalHost, hostnameResolvesToPrivate, ssrfSafeFetch } from "../utils/ssrf-guard.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins([
  "calesthio_openmontage",
  "hkuds_videoagent",
  "video_db_director",
  "vericontext_vibeframe"
]);

const UNSAFE_QUERY_PATTERN = /token|signature|sig|key|apikey|api_key|secret|password|auth|credential|expires|policy/i;
const DEFAULT_MAX_BYTES = 512_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_HTML_TEXT_FOR_EXTRACTION = 24_000;
const MAX_PAGE_TEXT = 1_200;

export type ProductUrlResearchStatus =
  | "ready"
  | "blocked_by_live_network_confirmation"
  | "blocked_by_unsafe_url"
  | "blocked_unsafe_redirect"
  | "fetch_failed"
  | "unsupported_content_type"
  | "response_too_large"
  | "extraction_empty";

export interface ProductUrlResearchInput {
  readonly productUrl: string;
  readonly userPrompt?: string;
  readonly confirmLiveNetwork?: boolean;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly fetchedAt?: Date;
}

export interface ProductUrlResearchFetchSummary {
  readonly attempted: boolean;
  readonly statusCode?: number;
  readonly contentType?: string;
  readonly byteCount: number;
  readonly maxBytes: number;
  readonly truncated: boolean;
}

export interface ProductUrlResearchResult {
  readonly schemaVersion: "cinejelly.product-url-research.v1";
  readonly status: ProductUrlResearchStatus;
  readonly noSpend: true;
  readonly networkCallsMade: boolean;
  readonly providerCallsMade: false;
  readonly sourcePatternOrigins: readonly string[];
  readonly fetchedAt: Date;
  readonly source: ProductUrlSourceEvidence;
  readonly fetch: ProductUrlResearchFetchSummary;
  readonly snapshot?: ProductUrlSnapshotInput;
  readonly summary: {
    readonly titlePresent: boolean;
    readonly descriptionPresent: boolean;
    readonly benefitCount: number;
    readonly claimCount: number;
    readonly imageCount: number;
    readonly pricePresent: boolean;
    readonly ctaPresent: boolean;
    readonly pageTextCharacterCount: number;
    readonly rawSourceUrlSerialized: false;
    readonly canUseAsProductUrlToVideoBackendEvidence: boolean;
    readonly canReleaseToCustomerTraffic: false;
  };
  readonly issues: readonly string[];
  readonly nextActions: readonly string[];
}

interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  /** Final URL after any redirects (used to re-validate the destination host). */
  readonly url?: string;
  readonly headers: {
    get(name: string): string | null;
  };
  readonly body?: ReadableStream<Uint8Array> | null;
  text?(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

type FetchLike = (url: string, init: {
  readonly method: "GET";
  readonly redirect: "follow";
  readonly signal: AbortSignal;
  readonly headers: Record<string, string>;
}) => Promise<ResponseLike>;

export interface ProductUrlResearcherOptions {
  readonly fetch?: FetchLike;
}

export class ProductUrlResearcher {
  private readonly fetchImpl: FetchLike;

  public constructor(options: ProductUrlResearcherOptions = {}) {
    this.fetchImpl = options.fetch ?? globalFetch;
  }

  public async research(input: ProductUrlResearchInput): Promise<ProductUrlResearchResult> {
    const fetchedAt = input.fetchedAt ?? new Date();
    const maxBytes = boundedInteger(input.maxBytes, DEFAULT_MAX_BYTES, 16_000, 2_000_000);
    const timeoutMs = boundedInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 30_000);
    const source = sourceEvidence(input.productUrl);
    if (input.confirmLiveNetwork !== true) {
      return this.result({
        status: "blocked_by_live_network_confirmation",
        fetchedAt,
        source,
        fetch: { attempted: false, byteCount: 0, maxBytes, truncated: false },
        issues: ["confirmLiveNetwork=true is required before fetching a product URL."]
      });
    }
    if (source.status !== "clean_https") {
      return this.result({
        status: "blocked_by_unsafe_url",
        fetchedAt,
        source,
        fetch: { attempted: false, byteCount: 0, maxBytes, truncated: false },
        issues: ["Product URL must be clean HTTPS with no local host, embedded credentials, or credential-like query values before live extraction."]
      });
    }
    // SSRF note: the DNS-resolution guard (reject a public host that resolves to a private IP)
    // lives in the real network layer (globalFetch), so it protects live fetches without
    // running a real DNS lookup on the injected fake fetch used by no-spend tests.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(input.productUrl.trim(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
          "User-Agent": "CineJellyProductResearch/1.0"
        }
      });
      // Re-validate the FINAL URL after redirects: hygiene ran only on the original URL,
      // so a public page 302-ing to an internal/metadata host (or downgrading to http)
      // would otherwise be fetched and its body extracted. Block it before reading any body.
      const finalUrlRaw = typeof response.url === "string" && response.url ? response.url : input.productUrl.trim();
      let finalUrlHostUnsafe = false;
      try {
        const finalParsed = new URL(finalUrlRaw);
        finalUrlHostUnsafe =
          finalParsed.protocol !== "https:" ||
          isLocalHost(finalParsed.hostname) ||
          Boolean(finalParsed.username) ||
          Boolean(finalParsed.password) ||
          // DNS-resolve the POST-redirect host too: a public-looking domain can 302 to an
          // internal host whose A record is private, which the string-only checks above miss.
          (await hostnameResolvesToPrivate(finalParsed.hostname));
      } catch {
        finalUrlHostUnsafe = true;
      }
      if (finalUrlHostUnsafe) {
        return this.result({
          status: "blocked_unsafe_redirect",
          fetchedAt,
          source,
          fetch: { attempted: true, statusCode: response.status, byteCount: 0, maxBytes, truncated: false },
          issues: ["Product URL redirected to an unsafe or non-public destination; extraction was blocked before reading the body."]
        });
      }
      const contentType = cleanText(response.headers.get("content-type") ?? undefined, 160);
      if (!response.ok) {
        return this.result({
          status: "fetch_failed",
          fetchedAt,
          source,
          fetch: {
            attempted: true,
            statusCode: response.status,
            ...(contentType ? { contentType } : {}),
            byteCount: 0,
            maxBytes,
            truncated: false
          },
          issues: [`Product URL fetch returned HTTP ${response.status}.`]
        });
      }
      if (contentType && !/text\/html|application\/xhtml\+xml|application\/json|text\/plain/i.test(contentType)) {
        return this.result({
          status: "unsupported_content_type",
          fetchedAt,
          source,
          fetch: {
            attempted: true,
            statusCode: response.status,
            contentType,
            byteCount: 0,
            maxBytes,
            truncated: false
          },
          issues: ["Product URL response must be HTML, XHTML, JSON-LD-bearing HTML, JSON, or plain text."]
        });
      }
      const body = await readBoundedResponseText(response, maxBytes);
      if (body.truncated) {
        return this.result({
          status: "response_too_large",
          fetchedAt,
          source,
          fetch: {
            attempted: true,
            statusCode: response.status,
            ...(contentType ? { contentType } : {}),
            byteCount: body.byteCount,
            maxBytes,
            truncated: true
          },
          issues: [`Product URL response exceeded ${maxBytes} bytes.`]
        });
      }
      const snapshot = snapshotFromHtml(body.text, input.productUrl, input.userPrompt ?? "");
      if (!snapshot.productTitle && !snapshot.pageTitle && !snapshot.metaDescription && !snapshot.pageText) {
        return this.result({
          status: "extraction_empty",
          fetchedAt,
          source,
          fetch: {
            attempted: true,
            statusCode: response.status,
            ...(contentType ? { contentType } : {}),
            byteCount: body.byteCount,
            maxBytes,
            truncated: false
          },
          issues: ["Product URL extraction did not find usable product title, description, or page text."]
        });
      }
      return this.result({
        status: "ready",
        fetchedAt,
        source,
        fetch: {
          attempted: true,
          statusCode: response.status,
          ...(contentType ? { contentType } : {}),
          byteCount: body.byteCount,
          maxBytes,
          truncated: false
        },
        snapshot,
        issues: []
      });
    } catch (error) {
      return this.result({
        status: "fetch_failed",
        fetchedAt,
        source,
        fetch: { attempted: true, byteCount: 0, maxBytes, truncated: false },
        issues: [`Product URL fetch failed: ${safeErrorMessage(error)}.`]
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private result(input: {
    readonly status: ProductUrlResearchStatus;
    readonly fetchedAt: Date;
    readonly source: ProductUrlSourceEvidence;
    readonly fetch: ProductUrlResearchFetchSummary;
    readonly snapshot?: ProductUrlSnapshotInput;
    readonly issues: readonly string[];
  }): ProductUrlResearchResult {
    const summary = summaryFromSnapshot(input.snapshot, input.status);
    return {
      schemaVersion: "cinejelly.product-url-research.v1",
      status: input.status,
      noSpend: true,
      networkCallsMade: input.fetch.attempted,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      fetchedAt: input.fetchedAt,
      source: input.source,
      fetch: input.fetch,
      ...(input.snapshot ? { snapshot: input.snapshot } : {}),
      summary,
      issues: input.issues,
      nextActions: nextActionsFor(input.status)
    };
  }
}

export function mergeProductUrlSnapshots(
  extracted: ProductUrlSnapshotInput,
  override: ProductUrlSnapshotInput | undefined
): ProductUrlSnapshotInput {
  if (!override) {
    return extracted;
  }
  const productTitle = cleanText(override.productTitle, 160) ?? extracted.productTitle;
  const pageTitle = cleanText(override.pageTitle, 160) ?? extracted.pageTitle;
  const metaDescription = cleanText(override.metaDescription, 320) ?? extracted.metaDescription;
  const category = cleanText(override.category, 120) ?? extracted.category;
  const priceText = cleanText(override.priceText, 80) ?? extracted.priceText;
  const imageUrls = uniqueClean([...(override.imageUrls ?? []), ...(extracted.imageUrls ?? [])], 12, 500);
  const benefits = uniqueClean([...(override.benefits ?? []), ...(extracted.benefits ?? [])], 8, 180);
  const claims = uniqueClean([...(override.claims ?? []), ...(extracted.claims ?? [])], 12, 180);
  const targetBuyer = cleanText(override.targetBuyer, 160) ?? extracted.targetBuyer;
  const cta = cleanText(override.cta, 80) ?? extracted.cta;
  const pageText = cleanText(override.pageText, MAX_PAGE_TEXT) ?? extracted.pageText;
  return {
    ...(productTitle ? { productTitle } : {}),
    ...(pageTitle ? { pageTitle } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(category ? { category } : {}),
    ...(priceText ? { priceText } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(benefits.length > 0 ? { benefits } : {}),
    ...(claims.length > 0 ? { claims } : {}),
    ...(targetBuyer ? { targetBuyer } : {}),
    ...(cta ? { cta } : {}),
    ...(pageText ? { pageText } : {})
  };
}

export function safeProductUrlResearchSummary(result: ProductUrlResearchResult): Omit<ProductUrlResearchResult, "snapshot"> {
  const { snapshot: _snapshot, ...safe } = result;
  return safe;
}

function sourceEvidence(rawUrl: string | undefined): ProductUrlSourceEvidence {
  const normalized = rawUrl?.trim();
  if (!normalized) {
    return {
      status: "not_provided",
      queryKeyCount: 0,
      unsafeQueryKeyCount: 0
    };
  }
  const sourceUrlSha256 = sha256(normalized);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      status: "invalid_url",
      sourceUrlSha256,
      queryKeyCount: 0,
      unsafeQueryKeyCount: 0
    };
  }
  const queryEntries = [...parsed.searchParams.entries()];
  const unsafeQueryKeyCount = queryEntries.filter(([key, value]) =>
    UNSAFE_QUERY_PATTERN.test(key) || UNSAFE_QUERY_PATTERN.test(value)
  ).length;
  const base = {
    sourceUrlSha256,
    sourceHost: parsed.hostname.toLowerCase(),
    sourcePathSha256: sha256(parsed.pathname || "/"),
    queryKeyCount: queryEntries.length,
    unsafeQueryKeyCount
  };
  if (parsed.protocol !== "https:") {
    return { ...base, status: "blocked_non_https" };
  }
  if (isLocalHost(parsed.hostname)) {
    return { ...base, status: "blocked_localhost" };
  }
  if (parsed.username || parsed.password) {
    return { ...base, status: "blocked_embedded_credentials" };
  }
  return {
    ...base,
    status: unsafeQueryKeyCount > 0 ? "unsafe_query_redacted" : "clean_https"
  };
}

async function readBoundedResponseText(response: ResponseLike, maxBytes: number): Promise<{
  readonly text: string;
  readonly byteCount: number;
  readonly truncated: boolean;
}> {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let byteCount = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          text += decoder.decode();
          return { text, byteCount, truncated: false };
        }
        if (value) {
          byteCount += value.byteLength;
          if (byteCount > maxBytes) {
            await reader.cancel();
            return { text, byteCount, truncated: true };
          }
          text += decoder.decode(value, { stream: true });
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (response.arrayBuffer) {
    const buffer = await response.arrayBuffer();
    return {
      text: buffer.byteLength > maxBytes ? "" : new TextDecoder().decode(buffer),
      byteCount: buffer.byteLength,
      truncated: buffer.byteLength > maxBytes
    };
  }
  if (response.text) {
    const text = await response.text();
    const byteCount = new TextEncoder().encode(text).byteLength;
    return {
      text: byteCount > maxBytes ? "" : text,
      byteCount,
      truncated: byteCount > maxBytes
    };
  }
  return { text: "", byteCount: 0, truncated: false };
}

function snapshotFromHtml(html: string, sourceUrl: string, userPrompt: string): ProductUrlSnapshotInput {
  const boundedHtml = html.slice(0, MAX_HTML_TEXT_FOR_EXTRACTION);
  const structured = structuredProductData(boundedHtml);
  const bodyText = cleanText(stripTags(removeScriptsAndStyles(boundedHtml)), MAX_PAGE_TEXT);
  const metaDescription = cleanText(
    structured.description ??
    metaContent(boundedHtml, "description") ??
    metaContent(boundedHtml, "og:description") ??
    metaContent(boundedHtml, "twitter:description") ??
    undefined,
    320
  );
  const title = cleanText(
    structured.name ??
    metaContent(boundedHtml, "og:title") ??
    metaContent(boundedHtml, "twitter:title") ??
    titleTag(boundedHtml) ??
    undefined,
    160
  );
  const imageUrls = uniqueClean([
    ...structured.images,
    metaContent(boundedHtml, "og:image"),
    metaContent(boundedHtml, "twitter:image")
  ].map((value) => cleanHttpsUrl(value, sourceUrl)), 12, 500);
  const priceText = cleanText(structured.price, 80);
  const category = cleanText(structured.category, 120) ?? categoryFromText(`${sourceUrl} ${title ?? ""} ${bodyText ?? ""} ${userPrompt}`);
  const benefits = uniqueClean([
    ...sentences(metaDescription),
    ...sentences(bodyText),
    ...sentences(userPrompt)
  ], 6, 180);
  const claims = uniqueClean([
    ...structured.claims,
    ...claimLikeFragments(metaDescription ?? ""),
    ...claimLikeFragments(bodyText ?? ""),
    ...claimLikeFragments(userPrompt)
  ], 10, 180);
  const cta = detectCta(bodyText ?? "", userPrompt);
  return {
    ...(title ? { productTitle: title, pageTitle: title } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(category ? { category } : {}),
    ...(priceText ? { priceText } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(benefits.length > 0 ? { benefits } : {}),
    ...(claims.length > 0 ? { claims } : {}),
    ...(cta ? { cta } : {}),
    ...(bodyText ? { pageText: bodyText } : {})
  };
}

function structuredProductData(html: string): {
  readonly name?: string;
  readonly description?: string;
  readonly category?: string;
  readonly price?: string;
  readonly images: readonly string[];
  readonly claims: readonly string[];
} {
  const products = jsonLdValues(html)
    .flatMap((value) => flattenJsonLd(value))
    .filter((value) => hasProductType(value));
  const product = products[0];
  if (!product) {
    return { images: [], claims: [] };
  }
  const images = arrayStrings(product.image).slice(0, 12);
  const offers = firstObject(product.offers);
  const price = priceText(offers);
  const name = stringValue(product.name);
  const description = stringValue(product.description);
  const category = stringValue(product.category);
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    ...(price ? { price } : {}),
    images,
    claims: arrayStrings(product.slogan).slice(0, 4)
  };
}

function jsonLdValues(html: string): readonly unknown[] {
  const values: unknown[] = [];
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = decodeHtml(match[1] ?? "").trim();
    if (!raw || raw.length > 120_000) {
      continue;
    }
    try {
      values.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return values;
}

function flattenJsonLd(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  return [
    record,
    ...flattenJsonLd(record["@graph"])
  ];
}

function hasProductType(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  return typeof type === "string"
    ? type.toLowerCase().includes("product")
    : Array.isArray(type) && type.some((item) => typeof item === "string" && item.toLowerCase().includes("product"));
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    return value.find((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function priceText(offer: Record<string, unknown> | undefined): string | undefined {
  if (!offer) {
    return undefined;
  }
  const price = stringValue(offer.price);
  const currency = stringValue(offer.priceCurrency);
  return cleanText([price, currency].filter(Boolean).join(" "), 80);
}

function metaContent(html: string, nameOrProperty: string): string | undefined {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])[^>]*content=["']([^"']{1,1200})["'][^>]*>`, "i");
  return cleanText(decodeHtml(pattern.exec(html)?.[1] ?? ""), 400);
}

function titleTag(html: string): string | undefined {
  return cleanText(decodeHtml(/<title\b[^>]*>([\s\S]{1,400})<\/title>/i.exec(html)?.[1] ?? ""), 160);
}

function removeScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

/** Guard String.fromCodePoint against out-of-range values (a hostile entity would throw). */
function safeCodePoint(code: number, original: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return original;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (match, code) => safeCodePoint(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => safeCodePoint(Number.parseInt(code, 16), match));
}

function cleanHttpsUrl(value: string | undefined, baseUrl: string): string | undefined {
  const normalized = cleanText(value, 500);
  if (!normalized) {
    return undefined;
  }
  try {
    const parsed = new URL(normalized, baseUrl);
    if (parsed.protocol !== "https:" || isLocalHost(parsed.hostname) || parsed.username || parsed.password) {
      return undefined;
    }
    const unsafeQuery = [...parsed.searchParams.entries()].some(([key, item]) =>
      UNSAFE_QUERY_PATTERN.test(key) || UNSAFE_QUERY_PATTERN.test(item)
    );
    return unsafeQuery ? undefined : parsed.toString();
  } catch {
    return undefined;
  }
}

function sentences(value: string | undefined): readonly string[] {
  const normalized = cleanText(value, 1_600);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/[.;!?]\s+|(?:\s+-\s+)/)
    .map((part) => cleanText(part, 180))
    .filter((part): part is string => Boolean(part && part.split(/\s+/).length >= 3));
}

function claimLikeFragments(value: string): readonly string[] {
  return sentences(value).filter((part) => /guarantee|guaranteed|proven|clinical|safe|best|#1|increase|reduce|boost|faster|stronger|premium|save|discount|limited/i.test(part));
}

function detectCta(pageText: string, userPrompt: string): string | undefined {
  const combined = `${pageText} ${userPrompt}`.toLowerCase();
  if (/book (a )?demo|request demo|schedule/.test(combined)) return "Book a demo";
  if (/shop now|add to cart|buy now/.test(combined)) return "Shop now";
  if (/learn more|read more/.test(combined)) return "Learn more";
  return undefined;
}

function categoryFromText(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (/serum|skincare|cosmetic|beauty/.test(lower)) return "beauty";
  if (/course|training|lesson|education/.test(lower)) return "education";
  if (/software|saas|app|platform/.test(lower)) return "software";
  if (/supplement|fitness|workout/.test(lower)) return "wellness";
  if (/shirt|fashion|apparel/.test(lower)) return "fashion";
  return undefined;
}

function summaryFromSnapshot(
  snapshot: ProductUrlSnapshotInput | undefined,
  status: ProductUrlResearchStatus
): ProductUrlResearchResult["summary"] {
  return {
    titlePresent: Boolean(snapshot?.productTitle || snapshot?.pageTitle),
    descriptionPresent: Boolean(snapshot?.metaDescription || snapshot?.pageText),
    benefitCount: snapshot?.benefits?.length ?? 0,
    claimCount: snapshot?.claims?.length ?? 0,
    imageCount: snapshot?.imageUrls?.length ?? 0,
    pricePresent: Boolean(snapshot?.priceText),
    ctaPresent: Boolean(snapshot?.cta),
    pageTextCharacterCount: snapshot?.pageText?.length ?? 0,
    rawSourceUrlSerialized: false,
    canUseAsProductUrlToVideoBackendEvidence: status === "ready",
    canReleaseToCustomerTraffic: false
  };
}

function nextActionsFor(status: ProductUrlResearchStatus): readonly string[] {
  switch (status) {
    case "ready":
      return [
        "Feed the extracted snapshot into short-pipeline planning and keep claim/image-rights review checkpoints active.",
        "Run live commercial evidence only after operator approval and manual review of product facts and media rights."
      ];
    case "blocked_by_live_network_confirmation":
      return ["Set confirmLiveNetwork=true only after the operator approves fetching the clean public product URL."];
    case "blocked_by_unsafe_url":
      return ["Provide a canonical clean HTTPS product URL without credentials, local hosts, or credential-like query values."];
    case "blocked_unsafe_redirect":
      return ["The product URL redirected to a non-public or non-HTTPS destination; provide a direct canonical HTTPS product URL that does not redirect off the public web."];
    case "fetch_failed":
      return ["Check the product page availability or provide a reviewed product snapshot manually."];
    case "unsupported_content_type":
      return ["Provide an HTML product page or a reviewed product snapshot."];
    case "response_too_large":
      return ["Provide a smaller canonical product page or lower the extraction scope before retrying."];
    case "extraction_empty":
      return ["Provide product title, benefits, media rights, and claims manually before planning."];
  }
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function arrayStrings(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? cleanText(String(value), 240)
    : undefined;
}

function uniqueClean(values: readonly (string | undefined)[], limit: number, maxLength: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function cleanText(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/\S+|bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|token\s*[:=]\s*\S+/gi, "[redacted]");
}

// SSRF host classification (isLocalHost / hostnameResolvesToPrivate, with IPv4-mapped-IPv6 + CIDR
// hardening) is shared from ../utils/ssrf-guard.js so the guard logic lives in exactly one place.

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function globalFetch(url: string, init: {
  readonly method: "GET";
  readonly redirect: "follow";
  readonly signal: AbortSignal;
  readonly headers: Record<string, string>;
}): Promise<ResponseLike> {
  // SSRF hardening at the network boundary. redirect:"follow" is UNSAFE here — a public-looking
  // page can 302 to an internal host and the request to that host is issued before any post-fetch
  // check sees it (security audit). ssrfSafeFetch re-validates EVERY hop (https + public DNS)
  // with redirect:"manual" before issuing it — the same guard audio-mix/assembly already use.
  const { redirect: _redirect, ...safeInit } = init;
  void _redirect;
  return ssrfSafeFetch(url, safeInit, { label: "Product URL" });
}
