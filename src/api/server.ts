/**
 * Production HTTP entrypoint for CineJelly's one-input render pipeline.
 * It exposes a small JSON API without adding framework dependencies.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime, type DirectorRuntime } from "../application/director-factory.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import { redactUnknown } from "../utils/redaction.js";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

interface RenderRequestBody extends CineJellyProjectRequest {
  readonly outputPath?: string;
  readonly workDirectory?: string;
}

export function startServer(port = readPort(process.env.PORT)): void {
  const preflight = new RuntimePreflight();
  let runtime: DirectorRuntime | undefined;
  const getRuntime = (): DirectorRuntime => {
    runtime ??= createDirectorRuntime();
    return runtime;
  };

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
      const runtime = getRuntime();
      const result = await runtime.director.run(normalizedRequest);
      sendJson(response, 200, {
        ...result,
        costLedger: runtime.ledger.list()
      });
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

  return {
    ...body,
    outputPath: body.outputPath || join(outputRoot, safeName),
    workDirectory: body.workDirectory || join(outputRoot, "work")
  };
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
