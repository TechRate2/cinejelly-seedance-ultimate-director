/**
 * Selects provider outputs that are safe to place on the final assembly timeline.
 */

import type { RenderedShot } from "../types/agent.js";
import type { AssemblyClip } from "../types/assembly.js";

const VIDEO_OUTPUT_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"] as const;
const VIDEO_OUTPUT_FORMATS = new Set(["mp4", "mov", "m4v", "webm"]);
const VIDEO_MIME_PATTERN = /^video\/(?:mp4|quicktime|webm|x-m4v)$/i;

export function selectAssemblyClipsForRenderedShots(renderedShots: readonly RenderedShot[]): readonly AssemblyClip[] {
  const clips: AssemblyClip[] = [];
  for (const [shotIndex, renderedShot] of renderedShots.entries()) {
    let videoOutputs = renderedShot.prediction.outputUrls.filter(isVideoOutputUrl);
    if (videoOutputs.length === 0) {
      // Opaque (extension-less) provider video URL: fall back to any non-image output so a fully
      // rendered (and already-charged) shot is not abandoned at assembly just because its success
      // URL carries no recognizable extension/format hint. Only a truly empty or image-only output throws.
      const nonImageOutputs = renderedShot.prediction.outputUrls.filter((url) => !isLikelyImageOutputUrl(url));
      if (nonImageOutputs.length > 0) {
        videoOutputs = nonImageOutputs;
      }
    }
    if (videoOutputs.length === 0) {
      throw new Error(
        `Rendered shot ${renderedShot.compiledPrompt.shotId} did not include a video output URL for assembly.`
      );
    }
    const transitionIntent = transitionIntentFromPrompt(renderedShot.compiledPrompt.prompt);
    for (const [outputIndex, url] of videoOutputs.entries()) {
      clips.push({
        clipId: `${renderedShot.compiledPrompt.shotId}_${outputIndex}`,
        sourceUrlOrPath: url,
        order: shotIndex + outputIndex / 100,
        ...(transitionIntent ? { transitionOutIntent: transitionIntent } : {})
      });
    }
  }
  return clips;
}

export function isVideoOutputUrl(value: string): boolean {
  const source = outputSource(value);
  if (hasVideoExtension(source.pathnameOrPath)) {
    return true;
  }
  if (!source.url) {
    return false;
  }
  for (const key of ["filename", "file", "name", "download", "response-content-disposition"]) {
    const queryValue = source.url.searchParams.get(key);
    if (queryValue && hasVideoExtension(queryValue)) {
      return true;
    }
  }
  const format = source.url.searchParams.get("format") ??
    source.url.searchParams.get("ext") ??
    source.url.searchParams.get("type");
  if (format && isVideoFormat(format)) {
    return true;
  }
  const contentType = source.url.searchParams.get("content_type") ??
    source.url.searchParams.get("content-type") ??
    source.url.searchParams.get("response-content-type");
  return Boolean(contentType && VIDEO_MIME_PATTERN.test(contentType));
}

/**
 * Conservative "is this an image output" test, used only to EXCLUDE image sidecars when falling
 * back to an opaque (extension-less) video URL. Kept local to avoid a circular import with
 * endpoint-frame-chain (which imports isVideoOutputUrl from here).
 */
function isLikelyImageOutputUrl(value: string): boolean {
  const source = outputSource(value);
  const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"];
  if (imageExtensions.some((extension) => new RegExp(`\\${extension}(?:$|[^a-z0-9])`, "i").test(source.pathnameOrPath))) {
    return true;
  }
  if (!source.url) {
    return false;
  }
  const format = (source.url.searchParams.get("format") ?? source.url.searchParams.get("ext") ?? source.url.searchParams.get("type") ?? "")
    .toLowerCase().replace(/^image\//, "").trim();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(format)) {
    return true;
  }
  const contentType = source.url.searchParams.get("content_type") ??
    source.url.searchParams.get("content-type") ??
    source.url.searchParams.get("response-content-type") ?? "";
  return /^image\//i.test(contentType);
}

function outputSource(value: string): { readonly pathnameOrPath: string; readonly url?: URL } {
  try {
    const url = new URL(value);
    return { pathnameOrPath: url.pathname, url };
  } catch {
    return { pathnameOrPath: value.split(/[?#]/, 1)[0] ?? value };
  }
}

function hasVideoExtension(value: string): boolean {
  return VIDEO_OUTPUT_EXTENSIONS.some((extension) =>
    new RegExp(`\\${extension}(?:$|[^a-z0-9])`, "i").test(value)
  );
}

function isVideoFormat(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^video\//, "").trim();
  return VIDEO_OUTPUT_FORMATS.has(normalized) || VIDEO_MIME_PATTERN.test(value);
}

function transitionIntentFromPrompt(prompt: string | undefined): string | undefined {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return undefined;
  }
  const transitionLine = cleanTransitionIntentLine(
    prompt.match(/(?:^|\n)Transition:\s*([^\n]+)/m)?.[1]
  );
  if (transitionLine) {
    return transitionLine;
  }
  return cleanTransitionIntentLine(
    prompt.match(/(?:^|\n|\. )Bridge transition intent:\s*([^\n]+)/m)?.[1]
  );
}

function cleanTransitionIntentLine(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim().replace(/[.。]+$/u, "").trim();
  return trimmed || undefined;
}
