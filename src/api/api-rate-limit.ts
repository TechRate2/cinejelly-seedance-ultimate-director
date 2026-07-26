/**
 * In-process API rate limiter for credit-spending render endpoints.
 * It limits request bursts per client address before body parsing, runtime creation, queueing, or provider calls.
 */

import type { IncomingMessage } from "node:http";

export type ApiRateLimitClass = "render" | "account";

export interface ApiRateLimitSettings {
  readonly windowMs?: number;
  readonly maxRequests?: number;
  readonly disabled?: boolean;
  readonly trustProxyHeaders?: boolean;
}

export interface ApiRateLimitDecision {
  readonly allowed: boolean;
  readonly statusCode?: 429;
  readonly message?: string;
  readonly retryAfterSeconds?: number;
}

interface RateLimitBucket {
  readonly resetAtMs: number;
  count: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 6;

export class ApiRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly disabled: boolean;
  private readonly trustProxyHeaders: boolean;
  private readonly buckets = new Map<string, RateLimitBucket>();

  public constructor(settings: ApiRateLimitSettings = {}) {
    this.windowMs = positiveOrDefault(settings.windowMs, DEFAULT_WINDOW_MS);
    this.maxRequests = positiveOrDefault(settings.maxRequests, DEFAULT_MAX_REQUESTS);
    this.disabled = Boolean(settings.disabled);
    this.trustProxyHeaders = Boolean(settings.trustProxyHeaders);
  }

  public check(request: IncomingMessage, pathname: string, method: string | undefined): ApiRateLimitDecision {
    const limitClass = this.disabled ? undefined : this.limitClassFor(pathname, method);
    if (!limitClass) {
      return { allowed: true };
    }
    // Account/upload actions get their own, more generous bucket: a customer's first
    // session (register + login + a few uploads + topup) must never trip the strict
    // render limit, and render spam must never be hidden inside account traffic.
    const classMaxRequests = limitClass === "account" ? Math.max(this.maxRequests, 30) : this.maxRequests;

    const nowMs = Date.now();
    const bucketKey = `${limitClass}:${this.bucketKeyFor(request)}`;
    this.pruneExpired(nowMs);

    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAtMs <= nowMs) {
      // Belt-and-suspenders against key-explosion: even with correct client-IP keying, never
      // let the bucket map grow without bound — evict the oldest entry when at capacity.
      if (this.buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
        this.evictOldestBucket();
      }
      this.buckets.set(bucketKey, {
        count: 1,
        resetAtMs: nowMs + this.windowMs
      });
      return { allowed: true };
    }

    current.count += 1;
    if (current.count <= classMaxRequests) {
      return { allowed: true };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000));
    return {
      allowed: false,
      statusCode: 429,
      retryAfterSeconds,
      // Customer-visible on a VN-first platform — Vietnamese leads, short English tail.
      message: `Bạn thao tác quá nhanh — vui lòng đợi ${retryAfterSeconds} giây rồi thử lại. (Too many requests; retry in ${retryAfterSeconds}s.)`
    };
  }

  private limitClassFor(pathname: string, method: string | undefined): ApiRateLimitClass | undefined {
    // GET /v1/series scans every tenant's series file per request (O(all series)); flooding it is a
    // cheap-to-send / expensive-to-serve DoS, so it is the one GET that is rate-limited (audit).
    if (method === "GET") {
      return pathname === "/v1/series" ? "account" : undefined;
    }
    if (method !== "POST") {
      return undefined;
    }
    if (
      pathname === "/v1/render" ||
      pathname === "/v1/render-jobs" ||
      pathname === "/v1/short-pipeline/render-jobs" ||
      /^\/v1\/short-pipeline\/conversation-sessions\/[^/]+\/render-jobs$/.test(pathname) ||
      // Paid/work-intensive planning + execution POSTs: each spawns an ffprobe (redub) or a full
      // render (series episode), so they belong under the render limit (audit: unbounded spawn DoS).
      pathname === "/v1/redub/plans" ||
      /^\/v1\/series\/[^/]+\/episodes\/next(\/preview)?$/.test(pathname)
    ) {
      return "render";
    }
    if (
      // Brute-force/flood targets: scrypt per login attempt, store write per registration,
      // disk write per upload — limited, but generously enough for real onboarding. Also the
      // planning POSTs (session build, product-URL fetch, series create) which each do real work.
      pathname === "/v1/account/register" ||
      pathname === "/v1/account/login" ||
      pathname === "/v1/account/change-password" ||
      pathname === "/v1/account/topups" ||
      pathname === "/v1/uploads" ||
      pathname === "/v1/series" ||
      pathname === "/v1/short-pipeline/conversation-sessions" ||
      pathname === "/v1/short-pipeline/product-url-plan"
    ) {
      return "account";
    }
    return undefined;
  }

  private bucketKeyFor(request: IncomingMessage): string {
    if (this.trustProxyHeaders) {
      const forwardedFor = request.headers["x-forwarded-for"];
      if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        // SECURITY: a trusted reverse proxy APPENDS the real peer IP to the RIGHT of whatever
        // the client sent, so the left-most X-Forwarded-For value is fully client-controlled
        // (spoofable) and must never be the rate-limit key. Take the right-most hop — the one
        // the trusted proxy itself added — which the client cannot forge. (Assumes exactly one
        // trusted proxy in front, which is the bundled Caddy topology.)
        const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
        const clientHop = hops[hops.length - 1];
        if (clientHop) {
          return `xff:${clientHop}`;
        }
      }
    }
    return `remote:${request.socket.remoteAddress || "unknown"}`;
  }

  private pruneExpired(nowMs: number): void {
    for (const [bucketKey, bucket] of this.buckets.entries()) {
      if (bucket.resetAtMs <= nowMs) {
        this.buckets.delete(bucketKey);
      }
    }
  }

  private evictOldestBucket(): void {
    let oldestKey: string | undefined;
    let oldestResetAtMs = Number.POSITIVE_INFINITY;
    for (const [bucketKey, bucket] of this.buckets.entries()) {
      if (bucket.resetAtMs < oldestResetAtMs) {
        oldestResetAtMs = bucket.resetAtMs;
        oldestKey = bucketKey;
      }
    }
    if (oldestKey !== undefined) {
      this.buckets.delete(oldestKey);
    }
  }
}

/** Hard ceiling on live rate-limit buckets so distinct keys can never exhaust memory. */
const MAX_RATE_LIMIT_BUCKETS = 50_000;

export function readRateLimitDisabled(value: string | undefined): boolean {
  return readBooleanFlag("CINEJELLY_DISABLE_API_RATE_LIMIT", value);
}

export function readTrustProxyHeaders(value: string | undefined): boolean {
  return readBooleanFlag("CINEJELLY_TRUST_PROXY_HEADERS", value);
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function readBooleanFlag(name: string, value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false when set.`);
}
