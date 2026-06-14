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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime } from "../application/director-factory.js";
import {
  normalizeRenderRequest,
  RenderRequestNormalizationError
} from "../application/render-request-normalizer.js";
import { buildRenderSettingsDescriptor } from "../application/render-settings-descriptor.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "../application/validation-readiness-report.js";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactValidationReport } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
import { toApiProjectArtifactBundle, toApiProjectArtifactValidationReport } from "./artifact-response.js";
import { ApiAuthGuard, readApiAuthDisabled } from "./api-auth.js";
import { ApiConcurrencyGate } from "./api-concurrency-gate.js";
import { ApiRateLimiter, readRateLimitDisabled, readTrustProxyHeaders } from "./api-rate-limit.js";
import { ApiShutdownCoordinator, createHttpRequestLifecycle } from "./http-lifecycle.js";
import { isApplicationJsonMediaType } from "./media-type.js";
import {
  RenderJobCapacityError,
  RenderJobIdempotencyConflictError,
  RenderJobManager
} from "./render-job-manager.js";
import { renderRequestAdmissionFromEnv, RenderRequestAdmissionError } from "./render-request-admission.js";
import {
  attachRequestContextHeaders,
  createApiRequestContext,
  type ApiRequestContext
} from "./request-context.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,160}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

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

class RequestBodyTooLargeError extends Error {
  public readonly statusCode = 413;

  public constructor(maxBodyBytes: number) {
    super(`Request body exceeds maximum size of ${maxBodyBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export function startServer(port = readPort(process.env.PORT)): void {
  const maxBodyBytes = readPositiveInteger(process.env.CINEJELLY_API_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const preflight = new RuntimePreflight();
  const validationReadinessReporter = new Phase6ValidationReadinessReporter();
  const artifactStore = new ProjectArtifactStore();
  const artifactValidator = new ProjectArtifactValidator();
  const requestAdmission = renderRequestAdmissionFromEnv(process.env);
  const apiAuthGuard = new ApiAuthGuard({
    disabled: readApiAuthDisabled(process.env.CINEJELLY_DISABLE_API_AUTH),
    ...(process.env.CINEJELLY_API_AUTH_TOKEN ? { sharedKey: process.env.CINEJELLY_API_AUTH_TOKEN } : {})
  });
  const apiRateLimiter = new ApiRateLimiter({
    windowMs: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS, 6),
    disabled: readRateLimitDisabled(process.env.CINEJELLY_DISABLE_API_RATE_LIMIT),
    trustProxyHeaders: readTrustProxyHeaders(process.env.CINEJELLY_TRUST_PROXY_HEADERS)
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
      const rateLimitDecision = apiRateLimiter.check(request, requestUrl.pathname, request.method);
      if (!rateLimitDecision.allowed) {
        sendJson(response, rateLimitDecision.statusCode ?? 429, {
          error: rateLimitDecision.message ?? "Too many requests.",
          retryAfterSeconds: rateLimitDecision.retryAfterSeconds
        }, requestContext, retryAfterHeaders(rateLimitDecision.retryAfterSeconds));
        return;
      }
      const authDecision = apiAuthGuard.authorize(request, requestUrl.pathname);
      if (!authDecision.allowed) {
        sendJson(response, authDecision.statusCode ?? 401, { error: authDecision.message ?? "Unauthorized." }, requestContext);
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
      if (request.method === "GET" && requestUrl.pathname === "/v1/validation-readiness") {
        const report = validationReadinessReporter.build(await preflight.run(requestLifecycle.signal));
        sendJson(response, report.decision === "blocked" ? 503 : 200, report, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/render-settings") {
        sendJson(response, 200, buildRenderSettingsDescriptor(process.env), requestContext);
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
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        requestAdmission.assertAcceptable(body);
        const idempotencyKeyDigest = readIdempotencyKeyDigest(request);
        const requestFingerprint = idempotencyKeyDigest ? createRequestFingerprint(body) : undefined;
        const normalizedRequest = normalizeRenderRequest(body, {
          requestId: requestContext.requestId,
          env: process.env
        });
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
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        requestAdmission.assertAcceptable(body);
        const normalizedRequest = normalizeRenderRequest(body, {
          requestId: requestContext.requestId,
          env: process.env
        });
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
          const artifactValidation = await validateArtifactsForApi(artifactValidator, artifacts);
          sendJson(response, 200, {
            ...result,
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts),
            artifactValidation: toApiProjectArtifactValidationReport(artifactValidation)
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
          const artifactValidation = await validateArtifactsForApi(artifactValidator, artifacts);
          sendJson(response, 500, {
            error: redactUnknown(renderError instanceof Error ? renderError.message : String(renderError)),
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts),
            artifactValidation: toApiProjectArtifactValidationReport(artifactValidation)
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

async function validateArtifactsForApi(
  artifactValidator: ProjectArtifactValidator,
  artifacts: ProjectArtifactBundle
): Promise<ProjectArtifactValidationReport> {
  try {
    return await artifactValidator.validate(artifacts.artifactDirectory);
  } catch (error) {
    return {
      status: "fail",
      checkedAt: new Date(),
      artifactDirectory: artifacts.artifactDirectory,
      manifestPath: artifacts.manifestPath,
      projectId: artifacts.projectId,
      checks: [
        {
          name: "artifact_validation_runtime",
          status: "fail",
          message: error instanceof Error ? error.message : "Artifact validation failed."
        }
      ]
    };
  }
}

async function readJsonBody<TValue>(request: IncomingMessage, maxBodyBytes: number): Promise<TValue> {
  const declaredContentLength = readContentLength(request);
  if (declaredContentLength !== undefined && declaredContentLength > maxBodyBytes) {
    throw new RequestBodyTooLargeError(maxBodyBytes);
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new RequestBodyTooLargeError(maxBodyBytes);
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
  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`PORT must be a TCP port between ${MIN_PORT} and ${MAX_PORT}.`);
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
    error instanceof RenderRequestNormalizationError ||
    error instanceof RenderJobCapacityError ||
    error instanceof RenderJobIdempotencyConflictError ||
    error instanceof UnsupportedMediaTypeError ||
    error instanceof RequestBodyTooLargeError
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

function readContentLength(request: IncomingMessage): number | undefined {
  const value = readHeader(request, "content-length")?.trim();
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function assertJsonContentType(request: IncomingMessage): void {
  if (!isApplicationJsonMediaType(readHeader(request, "content-type"))) {
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
