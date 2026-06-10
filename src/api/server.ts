/**
 * Production HTTP entrypoint for CineJelly's one-input render pipeline.
 * It exposes a small JSON API without adding framework dependencies.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime } from "../application/director-factory.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { CostLedgerEntry } from "../types/provider.js";
import { redactUnknown } from "../utils/redaction.js";
import { ApiAuthGuard, readApiAuthDisabled } from "./api-auth.js";
import { ApiRateLimiter, readRateLimitDisabled } from "./api-rate-limit.js";
import { RenderJobManager } from "./render-job-manager.js";
import { RenderRequestAdmission, RenderRequestAdmissionError } from "./render-request-admission.js";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

interface RenderRequestBody extends CineJellyProjectRequest {
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
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
  const jobManager = new RenderJobManager({
    artifactStore,
    maxConcurrentJobs: readPositiveInteger(process.env.CINEJELLY_API_JOB_CONCURRENCY, 1),
    historyLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_HISTORY_LIMIT, 100)
  });

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const authDecision = apiAuthGuard.authorize(request, requestUrl.pathname);
      if (!authDecision.allowed) {
        sendJson(response, authDecision.statusCode ?? 401, { error: authDecision.message ?? "Unauthorized." });
        return;
      }
      const rateLimitDecision = apiRateLimiter.check(request, requestUrl.pathname, request.method);
      if (!rateLimitDecision.allowed) {
        sendJson(response, rateLimitDecision.statusCode ?? 429, {
          error: rateLimitDecision.message ?? "Too many requests.",
          retryAfterSeconds: rateLimitDecision.retryAfterSeconds
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/preflight") {
        const report = await preflight.run();
        sendJson(response, report.status === "fail" ? 503 : 200, report);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/render-jobs") {
        sendJson(response, 200, { jobs: jobManager.list() });
        return;
      }
      const jobMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobManager.get(decodeURIComponent(jobMatch[1] ?? ""));
        sendJson(response, job ? 200 : 404, job ?? { error: "Render job not found." });
        return;
      }
      if (request.method === "DELETE" && jobMatch) {
        const job = jobManager.cancel(decodeURIComponent(jobMatch[1] ?? ""));
        sendJson(response, job ? 202 : 404, job ?? { error: "Render job not found." });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render-jobs") {
        const body = await readJsonBody<RenderRequestBody>(request);
        requestAdmission.assertAcceptable(body);
        const normalizedRequest = normalizeRenderRequest(body);
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const job = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory
        });
        sendJson(response, 202, {
          ...job,
          statusUrl: `/v1/render-jobs/${encodeURIComponent(job.jobId)}`
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render") {
        const body = await readJsonBody<RenderRequestBody>(request);
        requestAdmission.assertAcceptable(body);
        const normalizedRequest = normalizeRenderRequest(body);
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        let costLedger: readonly CostLedgerEntry[] = [];
        try {
          const runtime = createDirectorRuntime();
          const result = await runtime.director.run(normalizedRequest);
          costLedger = runtime.ledger.list();
          const artifacts = await artifactStore.writeRunArtifacts({
            result,
            costLedger,
            artifactDirectory
          });
          sendJson(response, 200, {
            ...result,
            costLedger,
            artifacts
          });
        } catch (renderError: unknown) {
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
            artifacts
          });
        }
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, errorStatusCode(error), {
        error: redactUnknown(error instanceof Error ? error.message : String(error))
      });
    }
  });

  server.listen(port, () => {
    console.log(`CineJelly API listening on port ${port}`);
  });
}

function normalizeRenderRequest(body: RenderRequestBody): CineJellyProjectRequest {
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

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(redactUnknown(payload)));
}

function readPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive integer.");
  }
  return port;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new Error("API job settings must be positive integers.");
  }
  return parsed;
}

function errorStatusCode(error: unknown): number {
  return error instanceof RenderRequestAdmissionError ? error.statusCode : 500;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  startServer();
}
