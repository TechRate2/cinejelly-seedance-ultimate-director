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

    return {
      allowed: false,
      statusCode: 429,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000)),
      message: "Too many render requests. Retry after the current rate-limit window."
    };
  }

  private limitClassFor(pathname: string, method: string | undefined): ApiRateLimitClass | undefined {
    if (method !== "POST") {
      return undefined;
    }
    if (
      pathname === "/v1/render" ||
      pathname === "/v1/render-jobs" ||
      pathname === "/v1/short-pipeline/render-jobs" ||
      /^\/v1\/short-pipeline\/conversation-sessions\/[^/]+\/render-jobs$/.test(pathname)
    ) {
      return "render";
    }
    if (
      // Brute-force/flood targets: scrypt per login attempt, store write per registration,
      // disk write per upload — limited, but generously enough for real onboarding.
      pathname === "/v1/account/register" ||
      pathname === "/v1/account/login" ||
      pathname === "/v1/account/change-password" ||
      pathname === "/v1/account/topups" ||
      pathname === "/v1/uploads"
    ) {
      return "account";
    }
    return undefined;
  }

  private bucketKeyFor(request: IncomingMessage): string {
    if (this.trustProxyHeaders) {
      const forwardedFor = request.headers["x-forwarded-for"];
      if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return `xff:${forwardedFor.split(",")[0]?.trim() || "unknown"}`;
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
}

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
