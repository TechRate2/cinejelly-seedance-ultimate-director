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
    // Unicode normalization belongs HERE, once, at the boundary — not scattered across every reader.
    // Vietnamese arrives decomposed from mainstream sources (Unikey's "Unicode tổ hợp" mode, and
    // anything typed or pasted from macOS/iOS), and a decomposed brief is a different string to the
    // precomposed one everywhere downstream: it failed the Vietnamese-language detector, so the job
    // was labelled English and the customer received a video written and voiced in English. From
    // this line on, one sentence has exactly one spelling.
    userInput: body.userInput.normalize("NFC"),
    // Metadata contract is Record<string,string>, but this route accepts raw JSON where a client
    // can pass booleans/numbers (e.g. scriptFirst: true) that then fail every `=== "string"` /
    // `=== "true"` check downstream (adversarial-audit #4). Stringify non-string values exactly
    // like the short-pipeline route's safeMetadata does; drop null/undefined.
    metadata: {
      ...Object.fromEntries(
        Object.entries(body.metadata ?? {})
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, typeof value === "string" ? value : String(value)])
      ),
      requestId
    },
    outputPath: body.outputPath
      ? resolveInsideOutputRoot(outputRoot, body.outputPath, "outputPath")
      : join(defaultWorkDirectory, "cinejelly.mp4"),
    workDirectory,
    artifactDirectory: body.artifactDirectory
      ? resolveInsideOutputRoot(outputRoot, body.artifactDirectory, "artifactDirectory")
      : join(workDirectory, "artifacts"),
    // Frame-sampling output was operator-supplied but never confined, so it could escape the output
    // root and diverge from the deliverable's directory (final live-audit gap #4). Confine it too.
    ...(body.frameSamplingOptions?.outputDirectory
      ? {
          frameSamplingOptions: {
            ...body.frameSamplingOptions,
            outputDirectory: resolveInsideOutputRoot(
              outputRoot,
              body.frameSamplingOptions.outputDirectory,
              "frameSamplingOptions.outputDirectory"
            )
          }
        }
      : {})
  };
}

function isInsideOutputRoot(outputRoot: string, candidate: string): boolean {
  const relativePath = relative(outputRoot, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function resolveInsideOutputRoot(outputRoot: string, value: string, fieldName: string): string {
  if (!value.trim()) {
    throw new RenderRequestNormalizationError(`${fieldName} cannot be empty.`);
  }
  let resolvedPath: string;
  if (isAbsolute(value)) {
    resolvedPath = resolve(value);
  } else {
    // A relative value may be written either relative to the output root ("case/final.mp4") OR with
    // the output-root prefix already baked in ("assets/output_deliverables/case/final.mp4"). Prefer
    // the cwd-relative reading when it already lands inside the root, so a root-prefixed path is not
    // silently DOUBLED (assets/output_deliverables/assets/output_deliverables/...) — the exact bug
    // that put the first real render's MP4 one directory too deep (final live-audit gap #2).
    const cwdResolved = resolve(value);
    resolvedPath = isInsideOutputRoot(outputRoot, cwdResolved) ? cwdResolved : resolve(outputRoot, value);
  }
  if (isInsideOutputRoot(outputRoot, resolvedPath)) {
    return resolvedPath;
  }
  throw new RenderRequestNormalizationError(`${fieldName} must stay inside CINEJELLY_OUTPUT_DIR.`);
}
