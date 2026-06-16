/**
 * API authentication guard for protecting endpoints that can spend provider credits or reveal run metadata.
 * It uses a single deployment token from the environment and never logs or returns the configured token.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export type ApiAuthPrincipalKind = "public" | "auth_disabled" | "deployment" | "client";

export interface ApiAuthPrincipal {
  readonly kind: ApiAuthPrincipalKind;
  readonly clientId?: string;
}

export interface ApiAuthDecision {
  readonly allowed: boolean;
  readonly statusCode?: 401 | 503;
  readonly message?: string;
  readonly principal?: ApiAuthPrincipal;
}

export interface ApiAuthClientKey {
  readonly clientId: string;
  readonly keySha256: string;
  readonly enabled: boolean;
}

export interface ApiAuthGuardSettings {
  readonly sharedKey?: string;
  readonly disabled?: boolean;
  readonly clientKeys?: readonly ApiAuthClientKey[];
}

const MIN_TOKEN_LENGTH = 24;
const BEARER_AUTHORIZATION_PATTERN = /^Bearer\s+(.+)$/i;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export class ApiAuthGuard {
  private readonly expectedKey: string | undefined;
  private readonly disabled: boolean;
  private readonly clientKeys: readonly ApiAuthClientKey[];

  public constructor(settings: ApiAuthGuardSettings = {}) {
    this.expectedKey = settings.sharedKey?.trim();
    this.disabled = Boolean(settings.disabled);
    this.clientKeys = settings.clientKeys ?? [];
  }

  public authorize(request: IncomingMessage, pathname: string): ApiAuthDecision {
    if (pathname === "/health" || this.disabled) {
      return { allowed: true, principal: { kind: pathname === "/health" ? "public" : "auth_disabled" } };
    }
    if (!pathname.startsWith("/v1/")) {
      return { allowed: true, principal: { kind: "public" } };
    }
    if (!this.expectedKey && this.clientKeys.length === 0) {
      if (this.isPublicDiagnosticEndpoint(pathname)) {
        return { allowed: true, principal: { kind: "public" } };
      }
      return {
        allowed: false,
        statusCode: 503,
        message: "CINEJELLY_API_AUTH_TOKEN is required before protected API endpoints can be used."
      };
    }
    if (this.expectedKey && this.expectedKey.length < MIN_TOKEN_LENGTH) {
      return {
        allowed: false,
        statusCode: 503,
        message: `CINEJELLY_API_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`
      };
    }
    const presentedKey = this.readPresentedKey(request);
    if (this.matchesDeploymentKey(presentedKey)) {
      return { allowed: true, principal: { kind: "deployment" } };
    }
    const clientPrincipal = this.clientPrincipalFor(presentedKey);
    if (clientPrincipal) {
      return { allowed: true, principal: clientPrincipal };
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

  private matchesDeploymentKey(presentedKey: string | undefined): boolean {
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

  private clientPrincipalFor(presentedKey: string | undefined): ApiAuthPrincipal | undefined {
    if (!presentedKey || this.clientKeys.length === 0) {
      return undefined;
    }
    const digest = hashApiKey(presentedKey);
    for (const clientKey of this.clientKeys) {
      if (!SHA256_HEX_PATTERN.test(clientKey.keySha256)) {
        continue;
      }
      const expected = Buffer.from(clientKey.keySha256, "hex");
      const actual = Buffer.from(digest, "hex");
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        return clientKey.enabled ? { kind: "client", clientId: clientKey.clientId } : undefined;
      }
    }
    return undefined;
  }
}

export function readApiAuthDisabled(value: string | undefined): boolean {
  return readBooleanFlag("CINEJELLY_DISABLE_API_AUTH", value);
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
