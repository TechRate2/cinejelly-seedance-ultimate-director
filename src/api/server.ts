/**
 * Production HTTP entrypoint for CineJelly's one-input render pipeline.
 * It exposes a small JSON API without adding framework dependencies.
 */

import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse
} from "node:http";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime } from "../application/director-factory.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { CostLedgerEntry } from "../types/provider.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import { toApiProjectArtifactBundle } from "./artifact-response.js";
import { ApiAuthGuard, readApiAuthDisabled } from "./api-auth.js";
import { ApiConcurrencyGate } from "./api-concurrency-gate.js";
import { ApiRateLimiter, readRateLimitDisabled } from "./api-rate-limit.js";
import { ApiShutdownCoordinator, createHttpRequestLifecycle } from "./http-lifecycle.js";
import {
  RenderJobCapacityError,
  RenderJobIdempotencyConflictError,
  RenderJobManager
} from "./render-job-manager.js";
import { RenderRequestAdmission, RenderRequestAdmissionError } from "./render-request-admission.js";
import {
  attachRequestContextHeaders,
  createApiRequestContext,
  type ApiRequestContext
} from "./request-context.js";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,160}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

interface RenderRequestBody extends CineJellyProjectRequest {
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
}

class UnsupportedMediaTypeError extends Error {
  public readonly statusCode = 415;

  public constructor() {
    super("Render request Content-Type must be application/json.");
    this.name = "UnsupportedMediaTypeError";
  }
}

export function startServer(port = readPort(process.env.PORT)): void {
  const preflight = new RuntimePreflight();
  const artifactStore = new ProjectArtifactStore();
  const requestAdmission = new RenderRequestAdmission({
    maxUserInputCharacters: readPositiveInteger(process.env.CINEJELLY_MAX_USER_INPUT_CHARS, 24_000),
    maxReferences: readPositiveInteger(process.env.CINEJELLY_MAX_REFERENCES, 24),
    maxCaptionCues: readPositiveInteger(process.env.CINEJELLY_MAX_CAPTION_CUES, 600),
    maxAudioTracks: readPositiveInteger(process.env.CINEJELLY_MAX_AUDIO_TRACKS, 16),
    maxMetadataEntries: readPositiveInteger(process.env.CINEJELLY_MAX_METADATA_ENTRIES, 50)
  });
  const apiAuthGuard = new ApiAuthGuard({
    disabled: readApiAuthDisabled(process.env.CINEJELLY_DISABLE_API_AUTH),
    ...(process.env.CINEJELLY_API_AUTH_TOKEN ? { sharedKey: process.env.CINEJELLY_API_AUTH_TOKEN } : {})
  });
  const apiRateLimiter = new ApiRateLimiter({
    windowMs: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS, 6),
    disabled: readRateLimitDisabled(process.env.CINEJELLY_DISABLE_API_RATE_LIMIT)
  });
  const syncRenderGate = new ApiConcurrencyGate({
    maxConcurrent: readPositiveInteger(process.env.CINEJELLY_API_SYNC_RENDER_CONCURRENCY, 1)
  });
  const jobManager = new RenderJobManager({
    artifactStore,
    maxConcurrentJobs: readPositiveInteger(process.env.CINEJELLY_API_JOB_CONCURRENCY, 1),
    historyLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_HISTORY_LIMIT, 100),
    queueLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_QUEUE_LIMIT, 50)
  });
  const shutdownCoordinator = new ApiShutdownCoordinator();

  const server = createServer(async (request, response) => {
    const requestContext = createApiRequestContext(request);
    const requestLifecycle = createHttpRequestLifecycle(request, response);
    const unregisterLifecycle = shutdownCoordinator.register(requestLifecycle);
    attachRequestContextHeaders(response, requestContext);
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const authDecision = apiAuthGuard.authorize(request, requestUrl.pathname);
      if (!authDecision.allowed) {
        sendJson(response, authDecision.statusCode ?? 401, { error: authDecision.message ?? "Unauthorized." }, requestContext);
        return;
      }
      const rateLimitDecision = apiRateLimiter.check(request, requestUrl.pathname, request.method);
      if (!rateLimitDecision.allowed) {
        sendJson(response, rateLimitDecision.statusCode ?? 429, {
          error: rateLimitDecision.message ?? "Too many requests.",
          retryAfterSeconds: rateLimitDecision.retryAfterSeconds
        }, requestContext, retryAfterHeaders(rateLimitDecision.retryAfterSeconds));
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, { status: "ok" }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/preflight") {
        const report = await preflight.run(requestLifecycle.signal);
        sendJson(response, report.status === "fail" ? 503 : 200, report, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/render-jobs") {
        sendJson(response, 200, { queue: jobManager.stats(), jobs: jobManager.list() }, requestContext);
        return;
      }
      const jobMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobManager.get(decodeURIComponent(jobMatch[1] ?? ""));
        sendJson(response, job ? 200 : 404, job ?? { error: "Render job not found." }, requestContext);
        return;
      }
      if (request.method === "DELETE" && jobMatch) {
        const job = jobManager.cancel(decodeURIComponent(jobMatch[1] ?? ""));
        sendJson(response, job ? 202 : 404, job ?? { error: "Render job not found." }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render-jobs") {
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request);
        requestAdmission.assertAcceptable(body);
        const idempotencyKeyDigest = readIdempotencyKeyDigest(request);
        const requestFingerprint = idempotencyKeyDigest ? createRequestFingerprint(body) : undefined;
        const normalizedRequest = normalizeRenderRequest(body, requestContext);
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {})
        });
        sendJson(response, 202, {
          ...submission.summary,
          ...(submission.idempotentReplay ? { idempotentReplay: true } : {}),
          statusUrl: `/v1/render-jobs/${encodeURIComponent(submission.summary.jobId)}`
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render") {
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request);
        requestAdmission.assertAcceptable(body);
        const normalizedRequest = normalizeRenderRequest(body, requestContext);
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const renderLease = syncRenderGate.tryAcquire();
        if (!renderLease.allowed) {
          sendJson(response, renderLease.statusCode, {
            error: renderLease.message,
            retryAfterSeconds: renderLease.retryAfterSeconds
          }, requestContext, retryAfterHeaders(renderLease.retryAfterSeconds));
          return;
        }
        let costLedger: readonly CostLedgerEntry[] = [];
        let runtime: ReturnType<typeof createDirectorRuntime> | undefined;
        try {
          runtime = createDirectorRuntime();
          const result = await runtime.director.run(normalizedRequest, requestLifecycle.signal);
          costLedger = runtime.ledger.list();
          const artifacts = await artifactStore.writeRunArtifacts({
            result,
            costLedger,
            artifactDirectory
          });
          sendJson(response, 200, {
            ...result,
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts)
          }, requestContext);
        } catch (renderError: unknown) {
          costLedger = runtime?.ledger.list() ?? costLedger;
          const artifacts = await artifactStore.writeFailureArtifacts({
            request: normalizedRequest,
            costLedger,
            artifactDirectory,
            error: renderError,
            stage: "render_pipeline"
          });
          sendJson(response, 500, {
            error: redactUnknown(renderError instanceof Error ? renderError.message : String(renderError)),
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts)
          }, requestContext);
        } finally {
          renderLease.release();
        }
        return;
      }
      sendJson(response, 404, { error: "Not found" }, requestContext);
    } catch (error) {
      const retryAfterSeconds = retryAfterSecondsFor(error);
      sendJson(response, errorStatusCode(error), {
        error: redactUnknown(error instanceof Error ? error.message : String(error)),
        ...(retryAfterSeconds ? { retryAfterSeconds } : {})
      }, requestContext, retryAfterHeaders(retryAfterSeconds));
    } finally {
      requestLifecycle.complete();
      requestLifecycle.dispose();
      unregisterLifecycle();
    }
  });

  server.listen(port, () => {
    console.log(`CineJelly API listening on port ${port}`);
  });
  registerShutdownHandlers(server, jobManager, shutdownCoordinator);
}

function normalizeRenderRequest(body: RenderRequestBody, requestContext: ApiRequestContext): CineJellyProjectRequest {
  if (!body.userInput || typeof body.userInput !== "string") {
    throw new RenderRequestAdmissionError("Request body must include userInput.");
  }
  const outputRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
  const safeName = `${Date.now()}_cinejelly.mp4`;
  const workDirectory = body.workDirectory
    ? resolveInsideOutputRoot(outputRoot, body.workDirectory, "workDirectory")
    : join(outputRoot, "work");

  return {
    ...body,
    metadata: {
      ...(body.metadata ?? {}),
      requestId: body.metadata?.requestId ?? requestContext.requestId
    },
    outputPath: body.outputPath
      ? resolveInsideOutputRoot(outputRoot, body.outputPath, "outputPath")
      : join(outputRoot, safeName),
    workDirectory,
    artifactDirectory: body.artifactDirectory
      ? resolveInsideOutputRoot(outputRoot, body.artifactDirectory, "artifactDirectory")
      : join(workDirectory, "artifacts")
  };
}

function resolveInsideOutputRoot(outputRoot: string, value: string, fieldName: string): string {
  if (!value.trim()) {
    throw new RenderRequestAdmissionError(`${fieldName} cannot be empty.`);
  }
  const resolvedPath = isAbsolute(value) ? resolve(value) : resolve(outputRoot, value);
  const relativePath = relative(outputRoot, resolvedPath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedPath;
  }
  throw new RenderRequestAdmissionError(`${fieldName} must stay inside CINEJELLY_OUTPUT_DIR.`);
}

async function readJsonBody<TValue>(request: IncomingMessage): Promise<TValue> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RenderRequestAdmissionError("Request body exceeds maximum size.");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new RenderRequestAdmissionError("Request body cannot be empty.");
  }
  try {
    return JSON.parse(raw) as TValue;
  } catch {
    throw new RenderRequestAdmissionError("Request body must be valid JSON.");
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  requestContext: ApiRequestContext,
  headers: OutgoingHttpHeaders = {}
): void {
  if (response.destroyed) {
    return;
  }
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(redactApiLocalPaths(redactUnknown(withRequestContext(payload, requestContext)))));
}

function readPort(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_PORT;
  }
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error("PORT must be a positive integer.");
  }
  const port = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer.");
  }
  return port;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error("API job settings must be positive integers.");
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("API job settings must be positive integers.");
  }
  return parsed;
}

function errorStatusCode(error: unknown): number {
  return error instanceof RenderRequestAdmissionError ||
    error instanceof RenderJobCapacityError ||
    error instanceof RenderJobIdempotencyConflictError ||
    error instanceof UnsupportedMediaTypeError
    ? error.statusCode
    : 500;
}

function retryAfterSecondsFor(error: unknown): number | undefined {
  return error instanceof RenderJobCapacityError ? error.retryAfterSeconds : undefined;
}

function retryAfterHeaders(retryAfterSeconds: number | undefined): OutgoingHttpHeaders {
  return retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
}

function withRequestContext(payload: unknown, requestContext: ApiRequestContext): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      requestId: requestContext.requestId,
      ...payload
    };
  }
  return {
    requestId: requestContext.requestId,
    data: payload
  };
}

function readIdempotencyKeyDigest(request: IncomingMessage): string | undefined {
  const raw = readHeader(request, "idempotency-key");
  const normalized = raw?.trim();
  if (!normalized) {
    return undefined;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new RenderRequestAdmissionError(
      "Idempotency-Key must be 8 to 160 characters using only letters, digits, underscore, dot, colon, or hyphen."
    );
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function createRequestFingerprint(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function readHeader(request: IncomingMessage, headerName: string): string | undefined {
  const value = request.headers[headerName];
  return typeof value === "string" ? value : undefined;
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = readHeader(request, "content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || (contentType !== "application/json" && !contentType.endsWith("+json"))) {
    throw new UnsupportedMediaTypeError();
  }
}

function registerShutdownHandlers(
  server: Server,
  jobManager: RenderJobManager,
  shutdownCoordinator: ApiShutdownCoordinator
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const reason = `CineJelly API received ${signal}; canceling active render work for deployment shutdown.`;
    const abortedRequestCount = shutdownCoordinator.abortActiveRequests(reason);
    const canceledJobs = jobManager.cancelAll(reason);
    console.log(
      `CineJelly API shutting down after ${signal}; aborted ${abortedRequestCount} active request(s), canceled ${canceledJobs.length} render job(s).`
    );
    server.close((error) => {
      if (error) {
        console.error("CineJelly API shutdown failed.", error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  startServer();
}
