import { createHash } from "node:crypto";
import type { RenderedShot } from "../types/agent.js";
import type { PromptReference } from "../types/prompt.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
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
  const path = outputPathname(value);
  if (!path) {
    return false;
  }
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex < 0) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.slice(dotIndex).toLowerCase());
}

function outputPathname(value: string): string | undefined {
  try {
    return new URL(value).pathname;
  } catch {
    return undefined;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
