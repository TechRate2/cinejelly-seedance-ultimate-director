/**
 * Source Video Analyst normalizes caller-supplied video deconstruction metadata.
 * It supports source-video structure analysis without copying upstream code or requiring live repos.
 */

import { isIP } from "node:net";
import type { PromptReference } from "../types/prompt.js";
import {
  SOURCE_VIDEO_ANALYSIS_LIMITS,
  type SourceVideoDeconstruction,
  type SourceVideoKeyframe,
  type SourceVideoMediaMetrics,
  type SourceVideoSceneDeconstruction,
  type SourceVideoTranscriptCue
} from "../types/source-video.js";

const SECRET_QUERY_TEXT_PATTERN = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|authorization|auth)/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export class SourceVideoAnalyst {
  public normalize(
    value: SourceVideoDeconstruction | undefined,
    references: readonly PromptReference[]
  ): SourceVideoDeconstruction | undefined {
    if (!value) {
      return undefined;
    }

    const sourceReferenceLabel = this.sourceReferenceLabel(value.sourceReferenceLabel, references);
    const transformationIntent = this.cleanOptionalText(value.transformationIntent, "transformationIntent");
    const transcript = this.normalizeTranscript(value.transcript);
    const scenes = this.normalizeScenes(value.scenes);
    const pacingNotes = this.normalizeNotes(value.pacingNotes, "pacingNotes");
    const styleNotes = this.normalizeNotes(value.styleNotes, "styleNotes");
    const structuralBeats = this.normalizeNotes(value.structuralBeats, "structuralBeats");
    const safetyNotes = this.normalizeNotes(value.safetyNotes, "safetyNotes");
    const mediaMetrics = this.normalizeMediaMetrics(value.mediaMetrics);

    const normalized = {
      ...(sourceReferenceLabel ? { sourceReferenceLabel } : {}),
      ...(transformationIntent ? { transformationIntent } : {}),
      ...(transcript.length > 0 ? { transcript } : {}),
      ...(scenes.length > 0 ? { scenes } : {}),
      ...(mediaMetrics ? { mediaMetrics } : {}),
      ...(pacingNotes.length > 0 ? { pacingNotes } : {}),
      ...(styleNotes.length > 0 ? { styleNotes } : {}),
      ...(structuralBeats.length > 0 ? { structuralBeats } : {}),
      ...(safetyNotes.length > 0 ? { safetyNotes } : {})
    };
    if (!this.hasUsableAnalysis(normalized)) {
      throw new Error(
        "sourceVideoAnalysis must include at least one transformationIntent, transcript cue, scene, pacing/style note, structural beat, or safety note."
      );
    }
    return normalized;
  }

  private hasUsableAnalysis(value: SourceVideoDeconstruction): boolean {
    return Boolean(
      value.transformationIntent ||
        value.transcript?.length ||
        value.scenes?.length ||
        value.mediaMetrics ||
        value.pacingNotes?.length ||
        value.styleNotes?.length ||
        value.structuralBeats?.length ||
        value.safetyNotes?.length
    );
  }

  private sourceReferenceLabel(value: string | undefined, references: readonly PromptReference[]): string | undefined {
    const explicit = this.cleanOptionalText(value, "sourceReferenceLabel");
    const sourceVideoReferences = references.filter((reference) => reference.role === "source_video_structure");
    if (explicit) {
      if (!sourceVideoReferences.some((reference) => reference.label === explicit)) {
        throw new Error(`sourceVideoAnalysis.sourceReferenceLabel must match a source_video_structure reference label: ${explicit}.`);
      }
      return explicit;
    }
    if (sourceVideoReferences.length === 0) {
      throw new Error("sourceVideoAnalysis requires at least one source_video_structure reference.");
    }
    return sourceVideoReferences[0]?.label;
  }

  private normalizeTranscript(value: readonly SourceVideoTranscriptCue[] | undefined): readonly SourceVideoTranscriptCue[] {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error("sourceVideoAnalysis.transcript must be an array.");
    }
    if (value.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxTranscriptCues) {
      throw new Error(`sourceVideoAnalysis.transcript cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxTranscriptCues} cues.`);
    }
    return value.map((cue, index) => ({
      startSecond: this.nonNegativeNumber(cue.startSecond, `sourceVideoAnalysis.transcript[${index}].startSecond`),
      endSecond: this.endSecond(cue.endSecond, cue.startSecond, `sourceVideoAnalysis.transcript[${index}].endSecond`),
      text: this.requiredText(cue.text, `sourceVideoAnalysis.transcript[${index}].text`)
    }));
  }

  private normalizeScenes(value: readonly SourceVideoSceneDeconstruction[] | undefined): readonly SourceVideoSceneDeconstruction[] {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error("sourceVideoAnalysis.scenes must be an array.");
    }
    if (value.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxScenes) {
      throw new Error(`sourceVideoAnalysis.scenes cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxScenes} items.`);
    }
    return value.map((scene, index) => {
      const startSecond = this.nonNegativeNumber(scene.startSecond, `sourceVideoAnalysis.scenes[${index}].startSecond`);
      const keyframes = this.normalizeKeyframes(scene.keyframes, index);
      return {
        sceneId: this.requiredLabel(scene.sceneId, `sourceVideoAnalysis.scenes[${index}].sceneId`),
        startSecond,
        endSecond: this.endSecond(scene.endSecond, startSecond, `sourceVideoAnalysis.scenes[${index}].endSecond`),
        summary: this.requiredText(scene.summary, `sourceVideoAnalysis.scenes[${index}].summary`),
        ...this.optionalText("pacing", scene.pacing, `sourceVideoAnalysis.scenes[${index}].pacing`),
        ...this.optionalText("camera", scene.camera, `sourceVideoAnalysis.scenes[${index}].camera`),
        ...this.optionalText("audio", scene.audio, `sourceVideoAnalysis.scenes[${index}].audio`),
        ...this.optionalText("visualStyle", scene.visualStyle, `sourceVideoAnalysis.scenes[${index}].visualStyle`),
        ...(keyframes.length > 0 ? { keyframes } : {})
      };
    });
  }

  private normalizeKeyframes(value: readonly SourceVideoKeyframe[] | undefined, sceneIndex: number): readonly SourceVideoKeyframe[] {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(`sourceVideoAnalysis.scenes[${sceneIndex}].keyframes must be an array.`);
    }
    if (value.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxKeyframesPerScene) {
      throw new Error(
        `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxKeyframesPerScene} items.`
      );
    }
    return value.map((keyframe, keyframeIndex) => {
      const uri = this.cleanOptionalText(keyframe.uri, `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${keyframeIndex}].uri`);
      if (uri) {
        this.assertSafeReferenceUri(uri, `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${keyframeIndex}].uri`);
      }
      return {
        timestampSecond: this.nonNegativeNumber(
          keyframe.timestampSecond,
          `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${keyframeIndex}].timestampSecond`
        ),
        description: this.requiredText(
          keyframe.description,
          `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${keyframeIndex}].description`
        ),
        ...(uri ? { uri } : {})
      };
    });
  }

  private normalizeNotes(value: readonly string[] | undefined, fieldName: string): readonly string[] {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(`sourceVideoAnalysis.${fieldName} must be an array.`);
    }
    if (value.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxNotes) {
      throw new Error(`sourceVideoAnalysis.${fieldName} cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxNotes} items.`);
    }
    return value.map((item, index) => this.requiredText(item, `sourceVideoAnalysis.${fieldName}[${index}]`));
  }

  private normalizeMediaMetrics(value: SourceVideoMediaMetrics | undefined): SourceVideoMediaMetrics | undefined {
    if (!value) {
      return undefined;
    }
    if (value.schemaVersion !== "cinejelly.source-video-media-metrics.v1") {
      throw new Error("sourceVideoAnalysis.mediaMetrics has an invalid schemaVersion.");
    }
    const durationSeconds = value.durationSeconds !== undefined
      ? this.positiveNumber(value.durationSeconds, "sourceVideoAnalysis.mediaMetrics.durationSeconds")
      : undefined;
    const bitrate = value.bitrate !== undefined
      ? this.positiveNumber(value.bitrate, "sourceVideoAnalysis.mediaMetrics.bitrate")
      : undefined;
    const video = value.video;
    const audio = value.audio;
    const editRhythm = value.editRhythm;
    if (!audio || typeof audio.hasAudio !== "boolean") {
      throw new Error("sourceVideoAnalysis.mediaMetrics.audio.hasAudio must be boolean.");
    }
    if (!editRhythm || typeof editRhythm.sceneCutCount !== "number") {
      throw new Error("sourceVideoAnalysis.mediaMetrics.editRhythm.sceneCutCount must be a number.");
    }
    const sceneCutTimestampsSeconds = this.normalizeSceneCutTimestamps(editRhythm.sceneCutTimestampsSeconds);
    return {
      schemaVersion: "cinejelly.source-video-media-metrics.v1",
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(bitrate !== undefined ? { bitrate } : {}),
      ...(value.formatName ? { formatName: this.requiredText(value.formatName, "sourceVideoAnalysis.mediaMetrics.formatName") } : {}),
      ...(video ? {
        video: {
          ...(video.codecName ? { codecName: this.requiredText(video.codecName, "sourceVideoAnalysis.mediaMetrics.video.codecName") } : {}),
          ...(video.width !== undefined ? { width: this.positiveInteger(video.width, "sourceVideoAnalysis.mediaMetrics.video.width") } : {}),
          ...(video.height !== undefined ? { height: this.positiveInteger(video.height, "sourceVideoAnalysis.mediaMetrics.video.height") } : {}),
          ...(video.frameRate !== undefined ? { frameRate: this.positiveNumber(video.frameRate, "sourceVideoAnalysis.mediaMetrics.video.frameRate") } : {}),
          ...(video.aspectRatio ? { aspectRatio: this.requiredText(video.aspectRatio, "sourceVideoAnalysis.mediaMetrics.video.aspectRatio") } : {})
        }
      } : {}),
      audio: {
        hasAudio: audio.hasAudio,
        ...(audio.codecName ? { codecName: this.requiredText(audio.codecName, "sourceVideoAnalysis.mediaMetrics.audio.codecName") } : {}),
        ...(audio.sampleRate !== undefined ? { sampleRate: this.positiveInteger(audio.sampleRate, "sourceVideoAnalysis.mediaMetrics.audio.sampleRate") } : {}),
        ...(audio.channelCount !== undefined ? { channelCount: this.positiveInteger(audio.channelCount, "sourceVideoAnalysis.mediaMetrics.audio.channelCount") } : {})
      },
      editRhythm: {
        ...(editRhythm.sampledWindowSeconds !== undefined ? { sampledWindowSeconds: this.positiveNumber(editRhythm.sampledWindowSeconds, "sourceVideoAnalysis.mediaMetrics.editRhythm.sampledWindowSeconds") } : {}),
        sceneCutCount: this.nonNegativeInteger(editRhythm.sceneCutCount, "sourceVideoAnalysis.mediaMetrics.editRhythm.sceneCutCount"),
        ...(editRhythm.cutDensityPerMinute !== undefined ? { cutDensityPerMinute: this.nonNegativeNumber(editRhythm.cutDensityPerMinute, "sourceVideoAnalysis.mediaMetrics.editRhythm.cutDensityPerMinute") } : {}),
        ...(editRhythm.averageShotLengthSeconds !== undefined ? { averageShotLengthSeconds: this.positiveNumber(editRhythm.averageShotLengthSeconds, "sourceVideoAnalysis.mediaMetrics.editRhythm.averageShotLengthSeconds") } : {}),
        rhythmLabel: this.rhythmLabel(editRhythm.rhythmLabel),
        ...(sceneCutTimestampsSeconds.length > 0 ? { sceneCutTimestampsSeconds } : {})
      },
      evidence: {
        probeSucceeded: Boolean(value.evidence?.probeSucceeded),
        sceneDetectionSucceeded: Boolean(value.evidence?.sceneDetectionSucceeded),
        sourceUriSha256: this.hashText(value.evidence?.sourceUriSha256, "sourceVideoAnalysis.mediaMetrics.evidence.sourceUriSha256")
      }
    };
  }

  private normalizeSceneCutTimestamps(value: readonly number[] | undefined): readonly number[] {
    if (!value) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error("sourceVideoAnalysis.mediaMetrics.editRhythm.sceneCutTimestampsSeconds must be an array.");
    }
    return value.slice(0, SOURCE_VIDEO_ANALYSIS_LIMITS.maxScenes).map((timestamp, index) =>
      this.nonNegativeNumber(timestamp, `sourceVideoAnalysis.mediaMetrics.editRhythm.sceneCutTimestampsSeconds[${index}]`)
    );
  }

  private rhythmLabel(value: SourceVideoMediaMetrics["editRhythm"]["rhythmLabel"]): SourceVideoMediaMetrics["editRhythm"]["rhythmLabel"] {
    if (["unknown", "slow", "balanced", "fast", "very_fast"].includes(value)) {
      return value;
    }
    throw new Error("sourceVideoAnalysis.mediaMetrics.editRhythm.rhythmLabel is invalid.");
  }

  private optionalText<TKey extends string>(key: TKey, value: string | undefined, fieldName: string): { readonly [K in TKey]?: string } {
    const text = this.cleanOptionalText(value, fieldName);
    return text ? { [key]: text } as { readonly [K in TKey]?: string } : {};
  }

  private requiredLabel(value: string, fieldName: string): string {
    const text = this.requiredText(value, fieldName);
    if (text.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxLabelLength) {
      throw new Error(`${fieldName} cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxLabelLength} characters.`);
    }
    return text;
  }

  private requiredText(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${fieldName} must be a non-empty string.`);
    }
    const text = value.trim();
    if (CONTROL_CHARACTER_PATTERN.test(text)) {
      throw new Error(`${fieldName} must not contain control characters.`);
    }
    if (text.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength) {
      throw new Error(`${fieldName} cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength} characters.`);
    }
    return text;
  }

  private cleanOptionalText(value: string | undefined, fieldName: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.requiredText(value, fieldName);
  }

  private nonNegativeNumber(value: number, fieldName: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${fieldName} must be a non-negative number.`);
    }
    return value;
  }

  private positiveNumber(value: number, fieldName: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${fieldName} must be a positive number.`);
    }
    return value;
  }

  private positiveInteger(value: number, fieldName: string): number {
    const parsed = this.positiveNumber(value, fieldName);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${fieldName} must be an integer.`);
    }
    return parsed;
  }

  private nonNegativeInteger(value: number, fieldName: string): number {
    const parsed = this.nonNegativeNumber(value, fieldName);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${fieldName} must be an integer.`);
    }
    return parsed;
  }

  private hashText(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
      throw new Error(`${fieldName} must be a sha256 hex digest.`);
    }
    return value.toLowerCase();
  }

  private endSecond(value: number, startSecond: number, fieldName: string): number {
    const endSecond = this.nonNegativeNumber(value, fieldName);
    if (endSecond <= startSecond) {
      throw new Error(`${fieldName} must be greater than startSecond.`);
    }
    return endSecond;
  }

  private assertSafeReferenceUri(uri: string, fieldName: string): void {
    if (uri.length > SOURCE_VIDEO_ANALYSIS_LIMITS.maxUriLength) {
      throw new Error(`${fieldName} cannot exceed ${SOURCE_VIDEO_ANALYSIS_LIMITS.maxUriLength} characters.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`${fieldName} must be a valid HTTPS URL or asset:// reference.`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "asset:") {
      throw new Error(`${fieldName} must use https or asset://.`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`${fieldName} must not include embedded credentials.`);
    }
    if (parsed.protocol === "https:" && isBlockedHostname(parsed.hostname)) {
      throw new Error(`${fieldName} must not point to localhost, private IPs, or internal hostnames.`);
    }
    if (parsed.protocol === "asset:" && (parsed.search || parsed.hash)) {
      throw new Error(`${fieldName} asset:// references must not include query strings or fragments.`);
    }
    for (const [key, value] of parsed.searchParams.entries()) {
      if (SECRET_QUERY_TEXT_PATTERN.test(key) || SECRET_QUERY_TEXT_PATTERN.test(value)) {
        throw new Error(`${fieldName} query contains credential-like parameter ${key}.`);
      }
    }
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [first = 0, second = 0] = normalized.split(".").map((part) => Number(part));
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  if (ipVersion === 6) {
    return normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:");
  }
  return false;
}
