/**
 * Subtitle caption builder.
 *
 * Turns raw timed text into broadcast-quality caption cues through one normalizing
 * pipeline: sort -> merge micro-fragments -> split overlong lines on word boundaries with
 * proportional timing -> clamp too-short cues -> enforce monotonic non-overlap.
 *
 * Two entry points feed it:
 * - `buildCaptionCuesFromSegments`: speech-to-text (ASR) segments from user audio.
 * - `buildCaptionCuesFromAudioScript`: the narration script CineJelly itself wrote for
 *   TTS — since we authored both the words and the timing, these captions are perfectly
 *   synced by construction and cost zero transcription spend.
 */

import type { CaptionCue } from "../types/caption.js";
import type { SpeechTranscriptSegment } from "../types/provider.js";

export interface CaptionBuildOptions {
  /** Maximum characters per cue before splitting on word boundaries. */
  readonly maxCharsPerCue?: number;
  /** Fragments closer than this many seconds merge into one cue (ASR word-dribble). */
  readonly mergeGapSeconds?: number;
  /** Cues shorter than this are extended (viewers cannot read flash-frames). */
  readonly minDurationSeconds?: number;
  /** Cues longer than this are split even when under the character limit. */
  readonly maxDurationSeconds?: number;
}

const DEFAULTS: Required<CaptionBuildOptions> = {
  maxCharsPerCue: 42,
  mergeGapSeconds: 0.3,
  minDurationSeconds: 0.7,
  maxDurationSeconds: 6
};

export interface AudioScriptCaptionLine {
  readonly startSecond: number;
  readonly endSecond: number;
  readonly spokenLine?: string;
  readonly text?: string;
}

/** Build subtitle cues from speech-to-text segments (user-supplied audio path). */
export function buildCaptionCuesFromSegments(
  segments: readonly SpeechTranscriptSegment[],
  options: CaptionBuildOptions = {}
): readonly CaptionCue[] {
  const resolved = { ...DEFAULTS, ...options };
  const cleaned = segments
    .map((segment) => ({
      startSecond: segment.startSecond,
      endSecond: segment.endSecond,
      text: cleanText(segment.text)
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.startSecond) &&
        Number.isFinite(segment.endSecond) &&
        segment.endSecond > segment.startSecond &&
        segment.startSecond >= 0 &&
        segment.text.length > 0
    )
    .sort((left, right) => left.startSecond - right.startSecond || left.endSecond - right.endSecond);
  const merged = mergeFragments(cleaned, resolved);
  const split = merged.flatMap((cue) => splitLongCue(cue, resolved));
  return enforceReadability(split, resolved);
}

/**
 * Build perfectly-synced subtitle cues from the narration audio script CineJelly planned
 * for TTS. No transcription call is needed: the words and the per-line timings are ours.
 */
export function buildCaptionCuesFromAudioScript(
  lines: readonly AudioScriptCaptionLine[],
  options: CaptionBuildOptions = {}
): readonly CaptionCue[] {
  return buildCaptionCuesFromSegments(
    lines.map((line) => ({
      startSecond: line.startSecond,
      endSecond: line.endSecond,
      text: (line.spokenLine ?? line.text ?? "").trim()
    })),
    options
  );
}

function cleanText(text: string): string {
  // Newlines flatten (the caption engine renders single-line cues) and libass override
  // braces are stripped so cue text can never inject styling into burn-in.
  return text.replace(/\s+/g, " ").replace(/[{}]/g, "").trim();
}

function mergeFragments(
  segments: readonly { startSecond: number; endSecond: number; text: string }[],
  options: Required<CaptionBuildOptions>
): { startSecond: number; endSecond: number; text: string }[] {
  const merged: { startSecond: number; endSecond: number; text: string }[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const combinedLength = previous ? previous.text.length + 1 + segment.text.length : segment.text.length;
    if (
      previous &&
      segment.startSecond - previous.endSecond <= options.mergeGapSeconds &&
      combinedLength <= options.maxCharsPerCue &&
      segment.endSecond - previous.startSecond <= options.maxDurationSeconds
    ) {
      merged[merged.length - 1] = {
        startSecond: previous.startSecond,
        endSecond: Math.max(previous.endSecond, segment.endSecond),
        text: `${previous.text} ${segment.text}`
      };
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

function splitLongCue(
  cue: { startSecond: number; endSecond: number; text: string },
  options: Required<CaptionBuildOptions>
): { startSecond: number; endSecond: number; text: string }[] {
  const tooManyChars = cue.text.length > options.maxCharsPerCue;
  const tooLong = cue.endSecond - cue.startSecond > options.maxDurationSeconds;
  if (!tooManyChars && !tooLong) {
    return [cue];
  }
  const chunks = chunkOnWordBoundaries(cue.text, options.maxCharsPerCue);
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
  const totalDuration = cue.endSecond - cue.startSecond;
  const result: { startSecond: number; endSecond: number; text: string }[] = [];
  let cursor = cue.startSecond;
  for (const [index, chunk] of chunks.entries()) {
    const share = chunk.length / totalChars;
    const isLast = index === chunks.length - 1;
    const end = isLast ? cue.endSecond : round3(cursor + totalDuration * share);
    result.push({ startSecond: round3(cursor), endSecond: end, text: chunk });
    cursor = end;
  }
  return result;
}

function chunkOnWordBoundaries(text: string, maxChars: number): string[] {
  const words = text.split(" ").filter((word) => word.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text];
}

function enforceReadability(
  cues: readonly { startSecond: number; endSecond: number; text: string }[],
  options: Required<CaptionBuildOptions>
): readonly CaptionCue[] {
  const result: { startSecond: number; endSecond: number; text: string }[] = [];
  for (const cue of cues) {
    const previous = result[result.length - 1];
    let startSecond = cue.startSecond;
    // No overlaps: a cue can never start before the previous one ends.
    if (previous && startSecond < previous.endSecond) {
      startSecond = previous.endSecond;
    }
    let endSecond = Math.max(cue.endSecond, startSecond);
    // Extend flash-frames to a readable minimum without swallowing the next cue.
    if (endSecond - startSecond < options.minDurationSeconds) {
      endSecond = round3(startSecond + options.minDurationSeconds);
    }
    if (endSecond <= startSecond) {
      continue;
    }
    result.push({ startSecond: round3(startSecond), endSecond, text: cue.text });
  }
  // Second pass: a minimum-duration extension may have pushed into the next cue; re-clip.
  for (let index = 0; index < result.length - 1; index += 1) {
    const current = result[index];
    const next = result[index + 1];
    if (current && next && current.endSecond > next.startSecond) {
      current.endSecond = next.startSecond;
    }
  }
  return result.filter((cue) => cue.endSecond > cue.startSecond);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
