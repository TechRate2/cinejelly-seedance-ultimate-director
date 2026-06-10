/**
 * Request context for correlating API responses, render jobs, artifacts, and provider metadata.
 * It accepts safe caller-provided IDs or creates a UUID, without trusting arbitrary header content.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequestContext {
  readonly requestId: string;
  readonly startedAt: Date;
}

const REQUEST_ID_HEADER = "x-cinejelly-request-id";
const ALT_REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,120}$/;

export function createApiRequestContext(request: IncomingMessage): ApiRequestContext {
  return {
    requestId: readRequestId(request) ?? `req_${randomUUID()}`,
    startedAt: new Date()
  };
}

export function attachRequestContextHeaders(response: ServerResponse, context: ApiRequestContext): void {
  response.setHeader("X-CineJelly-Request-Id", context.requestId);
}

function readRequestId(request: IncomingMessage): string | undefined {
  const headerValue = readHeader(request, REQUEST_ID_HEADER) ?? readHeader(request, ALT_REQUEST_ID_HEADER);
  const normalized = headerValue?.trim();
  return normalized && REQUEST_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function readHeader(request: IncomingMessage, headerName: string): string | undefined {
  const value = request.headers[headerName];
  return typeof value === "string" ? value : undefined;
}
