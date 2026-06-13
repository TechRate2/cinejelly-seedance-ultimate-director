/**
 * API authentication guard for protecting endpoints that can spend provider credits or reveal run metadata.
 * It uses a single deployment token from the environment and never logs or returns the configured token.
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface ApiAuthDecision {
  readonly allowed: boolean;
  readonly statusCode?: 401 | 503;
  readonly message?: string;
}

export interface ApiAuthGuardSettings {
  readonly sharedKey?: string;
  readonly disabled?: boolean;
}

const MIN_TOKEN_LENGTH = 24;
const BEARER_AUTHORIZATION_PATTERN = /^Bearer\s+(.+)$/i;

export class ApiAuthGuard {
  private readonly expectedKey: string | undefined;
  private readonly disabled: boolean;

  public constructor(settings: ApiAuthGuardSettings = {}) {
    this.expectedKey = settings.sharedKey?.trim();
    this.disabled = Boolean(settings.disabled);
  }

  public authorize(request: IncomingMessage, pathname: string): ApiAuthDecision {
    if (pathname === "/health" || this.disabled) {
      return { allowed: true };
    }
    if (!pathname.startsWith("/v1/")) {
      return { allowed: true };
    }
    if (!this.expectedKey) {
      if (this.isPublicDiagnosticEndpoint(pathname)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        statusCode: 503,
        message: "CINEJELLY_API_AUTH_TOKEN is required before protected API endpoints can be used."
      };
    }
    if (this.expectedKey.length < MIN_TOKEN_LENGTH) {
      return {
        allowed: false,
        statusCode: 503,
        message: `CINEJELLY_API_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`
      };
    }
    if (this.matchesKey(this.readPresentedKey(request))) {
      return { allowed: true };
    }

    return {
      allowed: false,
      statusCode: 401,
      message: "Unauthorized."
    };
  }

  private isPublicDiagnosticEndpoint(pathname: string): boolean {
    return pathname === "/v1/preflight" || pathname === "/v1/validation-readiness";
  }

  private readPresentedKey(request: IncomingMessage): string | undefined {
    const authorization = request.headers.authorization;
    const bearerMatch = typeof authorization === "string" ? BEARER_AUTHORIZATION_PATTERN.exec(authorization.trim()) : undefined;
    if (bearerMatch) {
      return bearerMatch[1]?.trim();
    }
    const apiKeyHeader = request.headers["x-cinejelly-api-key"];
    if (typeof apiKeyHeader === "string") {
      return apiKeyHeader.trim();
    }
    return undefined;
  }

  private matchesKey(presentedKey: string | undefined): boolean {
    if (!this.expectedKey || !presentedKey) {
      return false;
    }
    const expected = Buffer.from(this.expectedKey);
    const actual = Buffer.from(presentedKey);
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }
}

export function readApiAuthDisabled(value: string | undefined): boolean {
  return readBooleanFlag("CINEJELLY_DISABLE_API_AUTH", value);
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
