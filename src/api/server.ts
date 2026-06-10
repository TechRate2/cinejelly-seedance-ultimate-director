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
import { redactUnknown } from "../utils/redaction.js";

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

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (request.method === "GET" && request.url === "/v1/preflight") {
        const report = await preflight.run();
        sendJson(response, report.status === "fail" ? 503 : 200, report);
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/render") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      const body = await readJsonBody<RenderRequestBody>(request);
      const normalizedRequest = normalizeRenderRequest(body);
      const runtime = createDirectorRuntime();
      const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
      try {
        const result = await runtime.director.run(normalizedRequest);
        const costLedger = runtime.ledger.list();
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
        const costLedger = runtime.ledger.list();
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
    } catch (error) {
      sendJson(response, 500, {
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
    throw new Error("Request body must include userInput.");
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
    throw new Error(`${fieldName} cannot be empty.`);
  }
  const resolvedPath = isAbsolute(value) ? resolve(value) : resolve(outputRoot, value);
  const relativePath = relative(outputRoot, resolvedPath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedPath;
  }
  throw new Error(`${fieldName} must stay inside CINEJELLY_OUTPUT_DIR.`);
}

async function readJsonBody<TValue>(request: IncomingMessage): Promise<TValue> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body exceeds maximum size.");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("Request body cannot be empty.");
  }
  return JSON.parse(raw) as TValue;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
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

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  startServer();
}
