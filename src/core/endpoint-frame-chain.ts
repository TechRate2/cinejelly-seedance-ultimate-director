/**
 * Picks the still that the NEXT shot starts from, so a multi-shot video looks like one continuous
 * take instead of a slideshow of unrelated clips.
 *
 * Seedance can return a last-frame image alongside the clip. When it does, this chooses it by name
 * and by real image evidence rather than trusting the order of the output list. When it does not,
 * ffmpeg extracts the true final frame from the rendered clip — the fallback is what keeps the chain
 * unbroken on shots the provider returns bare, and a broken chain is visible to the customer as a
 * jump cut in the middle of a video they paid for.
 *
 * Also extracts the closing frame of a finished episode so the next episode of a series can open
 * where the last one ended.
 *
 * Remote reads go through the shared SSRF guard: the URL comes from a provider response, which is
 * outside data, and this module fetches it.
 */
import { createHash } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RenderedShot } from "../types/agent.js";
import type { PromptReference } from "../types/prompt.js";
import { ensureDirectory } from "../utils/files.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";
import { isVideoOutputUrl } from "./assembly-output-selector.js";
import { assertPublicHttpsFetchTarget } from "../utils/ssrf-guard.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IMAGE_MIME_PATTERN = /^image\/(?:jpeg|jpg|png|webp)$/i;
const PREFERRED_LAST_FRAME_PATTERN = /(?:last|end|final)[_-]?(?:frame|image|still)|frame[-_]?last/i;
const ENDPOINT_FRAME_EXTRACTION_OFFSETS_SECONDS = [0.1, 0.3, 0.6, 1] as const;
const MIN_EXTRACTED_ENDPOINT_FRAME_BYTES = 128;

export interface EndpointFrameQualityEvidence {
  readonly strategy: "provider_sidecar" | "ffmpeg_multi_offset";
  readonly candidateCount: number;
  readonly selectedOffsetSeconds?: number;
  readonly selectedFileSizeBytes?: number;
  readonly score?: number;
}

export interface EndpointFrameReferenceSelection {
  readonly sourceShotId: string;
  readonly targetShotId: string;
  readonly outputIndex: number;
  readonly outputUrlSha256: string;
  readonly reference: PromptReference;
  readonly extracted?: boolean;
  readonly quality?: EndpointFrameQualityEvidence;
}

export async function selectOrExtractLastFrameReference(input: {
  readonly renderedShot: RenderedShot;
  readonly targetShotId: string;
  readonly workDirectory?: string;
  readonly signal?: AbortSignal;
}): Promise<EndpointFrameReferenceSelection | undefined> {
  const providerSidecar = selectLastFrameReference(input);
  if (providerSidecar) {
    return providerSidecar;
  }
  if (!input.workDirectory) {
    return undefined;
  }

  const selectedVideo = selectVideoOutput(input.renderedShot);
  if (!selectedVideo) {
    return undefined;
  }

  const sourceShotId = input.renderedShot.compiledPrompt.shotId;
  const selectedFrame = await extractBestLastFrameImage({
    sourceUrlOrPath: selectedVideo.url,
    sourceShotId,
    targetShotId: input.targetShotId,
    workDirectory: input.workDirectory,
    ...(input.signal ? { signal: input.signal } : {})
  });
  if (!selectedFrame) {
    return undefined;
  }

  return {
    sourceShotId,
    targetShotId: input.targetShotId,
    outputIndex: selectedVideo.index,
    outputUrlSha256: sha256(selectedVideo.url),
    extracted: true,
    quality: {
      strategy: "ffmpeg_multi_offset",
      candidateCount: selectedFrame.candidateCount,
      selectedOffsetSeconds: selectedFrame.offsetSeconds,
      selectedFileSizeBytes: selectedFrame.fileSizeBytes,
      score: selectedFrame.score
    },
    reference: {
      role: "first_frame",
      label: `Extracted continuity frame from ${sourceShotId} (${selectedFrame.offsetSeconds}s from end)`,
      providerReference: {
        kind: "image",
        uri: selectedFrame.outputPath,
        label: `Extracted continuity frame from ${sourceShotId}`,
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
    quality: {
      strategy: "provider_sidecar",
      candidateCount: candidates.length,
      score: selected.preferred ? 1 : 0.92
    },
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

function selectVideoOutput(renderedShot: RenderedShot): { readonly url: string; readonly index: number } | undefined {
  const outputs = renderedShot.prediction.outputUrls.map((url, index) => ({ url, index }));
  let videos = outputs.filter((candidate) => isVideoOutputUrl(candidate.url));
  if (videos.length === 0) {
    // Opaque (extension-less) provider video URL: treat any non-image output as the video so a
    // REQUIRED last-frame chain can still extract its endpoint frame instead of throwing and
    // abandoning an already-charged sequential batch mid-render.
    videos = outputs.filter((candidate) => !isImageOutputUrl(candidate.url));
  }
  return videos.sort((left, right) => right.index - left.index)[0];
}

interface ExtractedEndpointFrameCandidate {
  readonly outputPath: string;
  readonly offsetSeconds: number;
  readonly fileSizeBytes: number;
  readonly score: number;
}

/**
 * Cross-EPISODE end-frame extraction (repo-fidelity gap #3): mine a finished episode's video for its
 * best final frame so the NEXT episode can carry real wardrobe/location/grade continuity instead of
 * prose-only recaps. Reuses the exact multi-offset + detail-scored machinery the shot-to-shot chain
 * trusts. Returns the local frame path, or undefined when the video yields no usable frame.
 */
export async function extractEpisodeEndFrame(input: {
  readonly videoPath: string;
  readonly episodeNumber: number;
  readonly workDirectory: string;
  readonly signal?: AbortSignal;
}): Promise<{ readonly outputPath: string; readonly offsetSeconds: number; readonly score: number } | undefined> {
  const selected = await extractBestLastFrameImage({
    sourceUrlOrPath: input.videoPath,
    sourceShotId: `episode_${input.episodeNumber}`,
    targetShotId: `episode_${input.episodeNumber + 1}`,
    workDirectory: input.workDirectory,
    ...(input.signal ? { signal: input.signal } : {})
  });
  if (!selected) {
    return undefined;
  }
  return { outputPath: selected.outputPath, offsetSeconds: selected.offsetSeconds, score: selected.score };
}

async function extractBestLastFrameImage(input: {
  readonly sourceUrlOrPath: string;
  readonly sourceShotId: string;
  readonly targetShotId: string;
  readonly workDirectory: string;
  readonly signal?: AbortSignal;
}): Promise<(ExtractedEndpointFrameCandidate & { readonly candidateCount: number }) | undefined> {
  const candidates: ExtractedEndpointFrameCandidate[] = [];
  const sourceHash = sha256(input.sourceUrlOrPath).slice(0, 12);

  for (const offsetSeconds of ENDPOINT_FRAME_EXTRACTION_OFFSETS_SECONDS) {
    const outputPath = join(
      input.workDirectory,
      "endpoint-frames",
      [
        safeFileStem(input.sourceShotId),
        "to",
        safeFileStem(input.targetShotId),
        sourceHash,
        `offset_${String(Math.round(offsetSeconds * 1000)).padStart(4, "0")}ms.jpg`
      ].join("__")
    );
    try {
      await extractLastFrameImage(input.sourceUrlOrPath, outputPath, offsetSeconds, input.signal);
      const fileSizeBytes = (await stat(outputPath)).size;
      if (fileSizeBytes >= MIN_EXTRACTED_ENDPOINT_FRAME_BYTES) {
        candidates.push({
          outputPath,
          offsetSeconds,
          fileSizeBytes,
          score: endpointFrameScore(fileSizeBytes, offsetSeconds)
        });
      } else {
        await removeIfUnselected(outputPath);
      }
    } catch {
      await removeIfUnselected(outputPath);
    }
  }

  const selected = [...candidates].sort((left, right) =>
    right.score - left.score ||
    right.fileSizeBytes - left.fileSizeBytes ||
    left.offsetSeconds - right.offsetSeconds
  )[0];
  if (!selected) {
    return undefined;
  }

  await Promise.all(candidates
    .filter((candidate) => candidate.outputPath !== selected.outputPath)
    .map((candidate) => removeIfUnselected(candidate.outputPath)));

  return {
    ...selected,
    candidateCount: candidates.length
  };
}

async function extractLastFrameImage(
  sourceUrlOrPath: string,
  outputPath: string,
  offsetSeconds: number,
  signal?: AbortSignal
): Promise<void> {
  // SSRF guard: ffmpeg fetches a remote -i input itself, so validate a remote URL (https-only,
  // reject private/internal/DNS-to-private) before handing it over. Local file paths pass through.
  if (/^https?:\/\//i.test(sourceUrlOrPath)) {
    await assertPublicHttpsFetchTarget(sourceUrlOrPath, "Endpoint frame source");
  }
  await ensureDirectory(dirname(outputPath));
  await runProcess(
    readMediaToolCommand("ffmpeg"),
    [
      "-y",
      "-sseof",
      `-${offsetSeconds}`,
      "-i",
      sourceUrlOrPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath
    ],
    { ...(signal ? { signal } : {}), maxOutputBytes: 512 * 1024 }
  );
}

function endpointFrameScore(fileSizeBytes: number, offsetSeconds: number): number {
  const detailScore = Math.min(0.98, Math.log10(Math.max(10, fileSizeBytes)) / 5);
  const recencyPenalty = Math.min(0.08, offsetSeconds * 0.02);
  return Number(Math.max(0.01, detailScore - recencyPenalty).toFixed(4));
}

async function removeIfUnselected(path: string): Promise<void> {
  await rm(path, { force: true });
}

export function isImageOutputUrl(value: string): boolean {
  const source = outputSource(value);
  if (hasImageExtension(source.pathnameOrPath)) {
    return true;
  }
  const parsed = source.url;
  if (!parsed) {
    return false;
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

function outputSource(value: string): { readonly pathnameOrPath: string; readonly url?: URL } {
  try {
    const url = new URL(value);
    return { pathnameOrPath: url.pathname, url };
  } catch {
    return { pathnameOrPath: value.split(/[?#]/, 1)[0] ?? value };
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

function safeFileStem(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "shot";
}
