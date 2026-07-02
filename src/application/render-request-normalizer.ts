/**
 * Shared render-request normalization for API and operator validation CLI entrypoints.
 * It confines output/work/artifact paths before provider spend.
 */

import { randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CineJellyProjectRequest } from "../types/agent.js";

export class RenderRequestNormalizationError extends Error {
  public readonly statusCode = 400;

  public constructor(message: string) {
    super(message);
    this.name = "RenderRequestNormalizationError";
  }
}

export interface RenderRequestNormalizationContext {
  readonly env?: NodeJS.ProcessEnv;
  readonly requestId?: string | undefined;
  readonly now?: Date;
}

export function normalizeRenderRequest(
  body: CineJellyProjectRequest,
  context: RenderRequestNormalizationContext = {}
): CineJellyProjectRequest {
  if (!body.userInput || typeof body.userInput !== "string") {
    throw new RenderRequestNormalizationError("Request body must include userInput.");
  }
  const env = context.env ?? process.env;
  const outputRoot = resolve(env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
  const requestId = body.metadata?.requestId ?? context.requestId ?? `req_${randomUUID()}`;
  // Per-request default paths keyed by requestId: two concurrent renders (or two in the
  // same millisecond) previously shared work/artifacts dirs and could clobber the same
  // default output file. A supplied path still wins and is confined to the output root.
  const requestSlug = requestId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "req";
  const defaultWorkDirectory = join(outputRoot, "work", requestSlug);
  const workDirectory = body.workDirectory
    ? resolveInsideOutputRoot(outputRoot, body.workDirectory, "workDirectory")
    : defaultWorkDirectory;

  return {
    ...body,
    metadata: {
      ...(body.metadata ?? {}),
      requestId
    },
    outputPath: body.outputPath
      ? resolveInsideOutputRoot(outputRoot, body.outputPath, "outputPath")
      : join(defaultWorkDirectory, "cinejelly.mp4"),
    workDirectory,
    artifactDirectory: body.artifactDirectory
      ? resolveInsideOutputRoot(outputRoot, body.artifactDirectory, "artifactDirectory")
      : join(workDirectory, "artifacts")
  };
}

export function resolveInsideOutputRoot(outputRoot: string, value: string, fieldName: string): string {
  if (!value.trim()) {
    throw new RenderRequestNormalizationError(`${fieldName} cannot be empty.`);
  }
  const resolvedPath = isAbsolute(value) ? resolve(value) : resolve(outputRoot, value);
  const relativePath = relative(outputRoot, resolvedPath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedPath;
  }
  throw new RenderRequestNormalizationError(`${fieldName} must stay inside CINEJELLY_OUTPUT_DIR.`);
}
