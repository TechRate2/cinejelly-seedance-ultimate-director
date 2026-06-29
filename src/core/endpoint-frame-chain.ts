import { createHash } from "node:crypto";
import type { RenderedShot } from "../types/agent.js";
import type { PromptReference } from "../types/prompt.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IMAGE_MIME_PATTERN = /^image\/(?:jpeg|jpg|png|webp)$/i;
const PREFERRED_LAST_FRAME_PATTERN = /(?:last|end|final)[_-]?(?:frame|image|still)|frame[-_]?last/i;

export interface EndpointFrameReferenceSelection {
  readonly sourceShotId: string;
  readonly targetShotId: string;
  readonly outputIndex: number;
  readonly outputUrlSha256: string;
  readonly reference: PromptReference;
}

export function selectLastFrameReference(input: {
  readonly renderedShot: RenderedShot;
  readonly targetShotId: string;
}): EndpointFrameReferenceSelection | undefined {
  const candidates = input.renderedShot.prediction.outputUrls
    .map((url, index) => ({ url, index, preferred: PREFERRED_LAST_FRAME_PATTERN.test(url) }))
    .filter((candidate) => isImageOutputUrl(candidate.url));
  const selected = [...candidates].sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return left.preferred ? -1 : 1;
    }
    return right.index - left.index;
  })[0];
  if (!selected) {
    return undefined;
  }

  const sourceShotId = input.renderedShot.compiledPrompt.shotId;
  return {
    sourceShotId,
    targetShotId: input.targetShotId,
    outputIndex: selected.index,
    outputUrlSha256: sha256(selected.url),
    reference: {
      role: "first_frame",
      label: `Continuity frame from ${sourceShotId}`,
      providerReference: {
        kind: "image",
        uri: selected.url,
        label: `Continuity frame from ${sourceShotId}`,
        role: "first_frame"
      },
      priority: "primary",
      selection: {
        sourceShotId,
        authorized: true
      }
    }
  };
}

export function isImageOutputUrl(value: string): boolean {
  const parsed = outputUrl(value);
  if (!parsed) {
    return false;
  }
  if (hasImageExtension(parsed.pathname)) {
    return true;
  }
  for (const key of ["filename", "file", "name", "download", "response-content-disposition"]) {
    const queryValue = parsed.searchParams.get(key);
    if (queryValue && hasImageExtension(queryValue)) {
      return true;
    }
  }
  const format = parsed.searchParams.get("format") ?? parsed.searchParams.get("ext") ?? parsed.searchParams.get("type");
  if (format && IMAGE_EXTENSIONS.has(`.${format.toLowerCase().replace(/^image\//, "")}`)) {
    return true;
  }
  const contentType = parsed.searchParams.get("content_type") ??
    parsed.searchParams.get("content-type") ??
    parsed.searchParams.get("response-content-type");
  if (contentType && IMAGE_MIME_PATTERN.test(contentType)) {
    return true;
  }
  return PREFERRED_LAST_FRAME_PATTERN.test(parsed.pathname) &&
    !/\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(parsed.pathname);
}

function outputUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function hasImageExtension(value: string): boolean {
  const normalized = value.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(normalized.slice(dotIndex));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
