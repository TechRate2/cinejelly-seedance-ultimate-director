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
  const now = context.now ?? new Date();
  const safeName = `${now.getTime()}_cinejelly.mp4`;
  const workDirectory = body.workDirectory
    ? resolveInsideOutputRoot(outputRoot, body.workDirectory, "workDirectory")
    : join(outputRoot, "work");
  const requestId = body.metadata?.requestId ?? context.requestId ?? `req_${randomUUID()}`;

  return {
    ...body,
    metadata: {
      ...(body.metadata ?? {}),
      requestId
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
