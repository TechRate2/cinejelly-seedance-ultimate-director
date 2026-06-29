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
    const videoOutputs = renderedShot.prediction.outputUrls.filter(isVideoOutputUrl);
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
  const transitionLine = prompt.match(/(?:^|\n)Transition:\s*([^\n]+?)(?:\.|\n|$)/m)?.[1]?.trim();
  if (transitionLine) {
    return transitionLine;
  }
  const bridgeLine = prompt.match(/(?:^|\n|\. )Bridge transition intent:\s*([^\n]+?)(?:\.|\n|$)/m)?.[1]?.trim();
  return bridgeLine || undefined;
}
