/**
 * Render request admission control.
 * It rejects oversized or malformed production requests before LLM planning, provider calls, or job queue occupancy.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import { SOURCE_VIDEO_ANALYSIS_LIMITS } from "../types/source-video.js";

const SECRET_QUERY_KEY_PATTERN = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|auth)/i;
const AUDIO_TRACK_ROLES = ["music", "narration", "ambience", "sfx"] as const;
const GENERATED_AUDIO_INTENT_KINDS = ["tts_narration", "bgm", "ambience", "sfx"] as const;
const AUDIO_MIX_MODES = ["mix", "replace"] as const;
const TRANSITION_KINDS = ["fade", "wipeleft", "wiperight", "slideleft", "slideright"] as const;
const TRANSITION_TARGET_HEIGHTS = [480, 720, 1080] as const;
const REFERENCE_VIEWS = ["front", "side", "back", "three_quarter", "over_the_shoulder", "unknown"] as const;
const AUDIO_BITRATE_PATTERN = /^([1-9]\d{1,3})k$/;
const MAX_FRAME_SAMPLES = 240;
const MAX_SEMANTIC_EXPECTATIONS = 32;
const MAX_SEMANTIC_FRAMES = 60;
const MAX_REFERENCE_SELECTION_TEXT = 160;
const MAX_REFERENCE_TIMELINE_INDEX = 100_000;
const MAX_GENERATED_AUDIO_PROMPT_LENGTH = 1_000;
const MAX_GENERATED_AUDIO_METADATA_LENGTH = 160;
const MAX_GENERATED_AUDIO_TIMING_SECONDS = 600;

export interface RenderRequestAdmissionSettings {
  readonly maxUserInputCharacters?: number;
  readonly maxReferences?: number;
  readonly maxCaptionCues?: number;
  readonly maxAudioTracks?: number;
  readonly maxGeneratedAudioIntents?: number;
  readonly maxMetadataEntries?: number;
  readonly maxSourceVideoScenes?: number;
  readonly maxSourceVideoTranscriptCues?: number;
  readonly maxSourceVideoKeyframesPerScene?: number;
  readonly maxSourceVideoNotes?: number;
}

export class RenderRequestAdmissionError extends Error {
  public readonly statusCode = 400;

  public constructor(message: string) {
    super(message);
    this.name = "RenderRequestAdmissionError";
  }
}

export class RenderRequestAdmission {
  private readonly maxUserInputCharacters: number;
  private readonly maxReferences: number;
  private readonly maxCaptionCues: number;
  private readonly maxAudioTracks: number;
  private readonly maxGeneratedAudioIntents: number;
  private readonly maxMetadataEntries: number;
  private readonly maxSourceVideoScenes: number;
  private readonly maxSourceVideoTranscriptCues: number;
  private readonly maxSourceVideoKeyframesPerScene: number;
  private readonly maxSourceVideoNotes: number;

  public constructor(settings: RenderRequestAdmissionSettings = {}) {
    this.maxUserInputCharacters = positiveOrDefault(settings.maxUserInputCharacters, 24_000);
    this.maxReferences = positiveOrDefault(settings.maxReferences, 24);
    this.maxCaptionCues = positiveOrDefault(settings.maxCaptionCues, 600);
    this.maxAudioTracks = positiveOrDefault(settings.maxAudioTracks, 16);
    this.maxGeneratedAudioIntents = positiveOrDefault(settings.maxGeneratedAudioIntents, 32);
    this.maxMetadataEntries = positiveOrDefault(settings.maxMetadataEntries, 50);
    this.maxSourceVideoScenes = positiveOrDefault(settings.maxSourceVideoScenes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxScenes);
    this.maxSourceVideoTranscriptCues = positiveOrDefault(
      settings.maxSourceVideoTranscriptCues,
      SOURCE_VIDEO_ANALYSIS_LIMITS.maxTranscriptCues
    );
    this.maxSourceVideoKeyframesPerScene = positiveOrDefault(
      settings.maxSourceVideoKeyframesPerScene,
      SOURCE_VIDEO_ANALYSIS_LIMITS.maxKeyframesPerScene
    );
    this.maxSourceVideoNotes = positiveOrDefault(settings.maxSourceVideoNotes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxNotes);
  }

  public assertAcceptable(body: unknown): void {
    const payload = this.objectPayload(body, "Request body must be a JSON object.");
    this.assertUserInput(payload.userInput);
    if (payload.settings !== undefined) {
      this.assertSettings(payload.settings);
    }
    this.assertMetadata(payload.metadata);
    this.assertReferences(payload.references);
    this.assertCaptionCues(payload.captionCues);
    this.assertCaptionOptions(payload.captionOptions);
    this.assertAudioTracks(payload.audioTracks);
    this.assertAudioMixOptions(payload.audioMixOptions);
    this.assertGeneratedAudioIntents(payload.generatedAudioIntents);
    this.assertFrameSamplingOptions(payload.frameSamplingOptions);
    this.assertTransitionSettings(payload.transitionSettings);
    this.assertSemanticVisualInspectionOptions(payload.semanticVisualInspectionOptions);
    this.assertSourceVideoAnalysis(payload.sourceVideoAnalysis, payload.references);
    this.assertOptionalPath(payload.outputPath, "outputPath");
    this.assertOptionalPath(payload.workDirectory, "workDirectory");
    this.assertOptionalPath(payload.artifactDirectory, "artifactDirectory");
  }

  private assertUserInput(value: unknown): void {
    if (typeof value !== "string" || !value.trim()) {
      throw new RenderRequestAdmissionError("Request body must include a non-empty userInput string.");
    }
    if (value.length > this.maxUserInputCharacters) {
      throw new RenderRequestAdmissionError(`userInput exceeds ${this.maxUserInputCharacters} characters.`);
    }
  }

  private assertSettings(value: unknown): void {
    const payload = this.objectPayload(value, "settings must be an object.");
    try {
      normalizeSeedanceSettings(payload);
    } catch (error) {
      throw new RenderRequestAdmissionError(error instanceof Error ? error.message : "settings are invalid.");
    }
  }

  private assertMetadata(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const metadata = this.objectPayload(value, "metadata must be an object.");
    const entries = Object.entries(metadata);
    if (entries.length > this.maxMetadataEntries) {
      throw new RenderRequestAdmissionError(`metadata cannot contain more than ${this.maxMetadataEntries} entries.`);
    }
    for (const [key, item] of entries) {
      if (key.length > 80) {
        throw new RenderRequestAdmissionError("metadata keys cannot exceed 80 characters.");
      }
      if (typeof item !== "string") {
        throw new RenderRequestAdmissionError("metadata values must be strings.");
      }
      if (item.length > 500) {
        throw new RenderRequestAdmissionError("metadata values cannot exceed 500 characters.");
      }
    }
  }

  private assertReferences(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("references must be an array.");
    }
    if (value.length > this.maxReferences) {
      throw new RenderRequestAdmissionError(`references cannot contain more than ${this.maxReferences} items.`);
    }
    for (const [index, item] of value.entries()) {
      const reference = this.objectPayload(item, `references[${index}] must be an object.`);
      const providerReference = this.objectPayload(
        reference.providerReference,
        `references[${index}].providerReference must be an object.`
      );
      this.assertBoundedString(providerReference.uri, `references[${index}].providerReference.uri`, 4096, true);
      this.assertReferenceUri(providerReference.uri, `references[${index}].providerReference.uri`);
      this.assertBoundedString(reference.label, `references[${index}].label`, 160, false);
      this.assertReferenceSelection(reference.selection, index);
    }
  }

  private assertReferenceSelection(value: unknown, index: number): void {
    if (value === undefined) {
      return;
    }
    const selection = this.objectPayload(value, `references[${index}].selection must be an object.`);
    this.assertBoundedString(selection.cameraId, `references[${index}].selection.cameraId`, MAX_REFERENCE_SELECTION_TEXT, false);
    this.assertBoundedString(
      selection.compositionId,
      `references[${index}].selection.compositionId`,
      MAX_REFERENCE_SELECTION_TEXT,
      false
    );
    this.assertBoundedString(
      selection.characterId,
      `references[${index}].selection.characterId`,
      MAX_REFERENCE_SELECTION_TEXT,
      false
    );
    this.assertBoundedString(
      selection.sourceShotId,
      `references[${index}].selection.sourceShotId`,
      MAX_REFERENCE_SELECTION_TEXT,
      false
    );
    this.assertBoundedString(
      selection.sourceSceneId,
      `references[${index}].selection.sourceSceneId`,
      MAX_REFERENCE_SELECTION_TEXT,
      false
    );
    if (selection.view !== undefined) {
      this.assertOption(selection.view, `references[${index}].selection.view`, REFERENCE_VIEWS);
    }
    if (selection.timelineIndex !== undefined) {
      this.assertPositiveOrZeroInteger(
        selection.timelineIndex,
        `references[${index}].selection.timelineIndex`,
        MAX_REFERENCE_TIMELINE_INDEX
      );
    }
    if (selection.authorized !== undefined) {
      this.assertBoolean(selection.authorized, `references[${index}].selection.authorized`);
    }
  }

  private assertCaptionCues(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("captionCues must be an array.");
    }
    if (value.length > this.maxCaptionCues) {
      throw new RenderRequestAdmissionError(`captionCues cannot contain more than ${this.maxCaptionCues} items.`);
    }
    for (const [index, item] of value.entries()) {
      const cue = this.objectPayload(item, `captionCues[${index}] must be an object.`);
      this.assertNonNegativeNumber(cue.startSecond, `captionCues[${index}].startSecond`);
      this.assertNonNegativeNumber(cue.endSecond, `captionCues[${index}].endSecond`);
      if (typeof cue.startSecond === "number" && typeof cue.endSecond === "number" && cue.endSecond <= cue.startSecond) {
        throw new RenderRequestAdmissionError(`captionCues[${index}].endSecond must be greater than startSecond.`);
      }
      this.assertBoundedString(cue.text, `captionCues[${index}].text`, 1000, true);
    }
  }

  private assertCaptionOptions(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const options = this.objectPayload(value, "captionOptions must be an object.");
    this.assertBoolean(options.enabled, "captionOptions.enabled");
    this.assertBoolean(options.burnIn, "captionOptions.burnIn");
    this.assertOptionalNonEmptyString(options.language, "captionOptions.language", 64);
  }

  private assertAudioTracks(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("audioTracks must be an array.");
    }
    if (value.length > this.maxAudioTracks) {
      throw new RenderRequestAdmissionError(`audioTracks cannot contain more than ${this.maxAudioTracks} items.`);
    }
    for (const [index, item] of value.entries()) {
      const track = this.objectPayload(item, `audioTracks[${index}] must be an object.`);
      this.assertBoundedString(track.trackId, `audioTracks[${index}].trackId`, 160, true);
      this.assertBoundedString(track.sourceUrlOrPath, `audioTracks[${index}].sourceUrlOrPath`, 4096, true);
      this.assertHttpsMediaUrl(track.sourceUrlOrPath, `audioTracks[${index}].sourceUrlOrPath`);
      this.assertOption(track.role, `audioTracks[${index}].role`, AUDIO_TRACK_ROLES);
      this.assertNonNegativeNumber(track.volume, `audioTracks[${index}].volume`);
      if (typeof track.volume === "number" && track.volume > 2) {
        throw new RenderRequestAdmissionError(`audioTracks[${index}].volume cannot exceed 2.`);
      }
    }
  }

  private assertAudioMixOptions(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const options = this.objectPayload(value, "audioMixOptions must be an object.");
    this.assertBoolean(options.enabled, "audioMixOptions.enabled");
    this.assertOption(options.mode, "audioMixOptions.mode", AUDIO_MIX_MODES);
    this.assertBoundedNumber(options.originalVolume, "audioMixOptions.originalVolume", 0, 2);
    this.assertAudioBitrate(options.outputBitrate, "audioMixOptions.outputBitrate");
  }

  private assertGeneratedAudioIntents(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("generatedAudioIntents must be an array.");
    }
    if (value.length > this.maxGeneratedAudioIntents) {
      throw new RenderRequestAdmissionError(`generatedAudioIntents cannot contain more than ${this.maxGeneratedAudioIntents} items.`);
    }
    for (const [index, item] of value.entries()) {
      const intent = this.objectPayload(item, `generatedAudioIntents[${index}] must be an object.`);
      this.assertBoundedString(intent.intentId, `generatedAudioIntents[${index}].intentId`, 160, true);
      this.assertOption(intent.kind, `generatedAudioIntents[${index}].kind`, GENERATED_AUDIO_INTENT_KINDS);
      this.assertBoundedString(
        intent.prompt,
        `generatedAudioIntents[${index}].prompt`,
        MAX_GENERATED_AUDIO_PROMPT_LENGTH,
        true
      );
      this.assertGeneratedAudioTiming(intent, index);
      this.assertBoundedString(
        intent.language,
        `generatedAudioIntents[${index}].language`,
        MAX_GENERATED_AUDIO_METADATA_LENGTH,
        false
      );
      this.assertBoundedString(
        intent.voiceStyle,
        `generatedAudioIntents[${index}].voiceStyle`,
        MAX_GENERATED_AUDIO_METADATA_LENGTH,
        false
      );
      this.assertBoundedString(
        intent.mood,
        `generatedAudioIntents[${index}].mood`,
        MAX_GENERATED_AUDIO_METADATA_LENGTH,
        false
      );
      this.assertBoundedString(
        intent.providerPreference,
        `generatedAudioIntents[${index}].providerPreference`,
        MAX_GENERATED_AUDIO_METADATA_LENGTH,
        false
      );
      this.assertOptionalBoundedNumber(intent.volume, `generatedAudioIntents[${index}].volume`, 0, 2);
    }
  }

  private assertGeneratedAudioTiming(intent: Record<string, unknown>, index: number): void {
    this.assertOptionalBoundedNumber(
      intent.durationSeconds,
      `generatedAudioIntents[${index}].durationSeconds`,
      0.1,
      MAX_GENERATED_AUDIO_TIMING_SECONDS
    );
    this.assertOptionalBoundedNumber(
      intent.startSecond,
      `generatedAudioIntents[${index}].startSecond`,
      0,
      MAX_GENERATED_AUDIO_TIMING_SECONDS
    );
    this.assertOptionalBoundedNumber(
      intent.endSecond,
      `generatedAudioIntents[${index}].endSecond`,
      0,
      MAX_GENERATED_AUDIO_TIMING_SECONDS
    );
    const hasStart = intent.startSecond !== undefined;
    const hasEnd = intent.endSecond !== undefined;
    if (hasStart !== hasEnd) {
      throw new RenderRequestAdmissionError(
        `generatedAudioIntents[${index}] must include both startSecond and endSecond when timing is provided.`
      );
    }
    if (
      typeof intent.startSecond === "number" &&
      typeof intent.endSecond === "number" &&
      intent.endSecond <= intent.startSecond
    ) {
      throw new RenderRequestAdmissionError(`generatedAudioIntents[${index}].endSecond must be greater than startSecond.`);
    }
  }

  private assertFrameSamplingOptions(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const options = this.objectPayload(value, "frameSamplingOptions must be an object.");
    this.assertBoolean(options.enabled, "frameSamplingOptions.enabled");
    this.assertBoundedString(options.outputDirectory, "frameSamplingOptions.outputDirectory", 512, true);
    this.assertBoundedNumber(options.intervalSeconds, "frameSamplingOptions.intervalSeconds", 0.1, 120);
    this.assertPositiveInteger(options.maxFrames, "frameSamplingOptions.maxFrames", MAX_FRAME_SAMPLES);
  }

  private assertTransitionSettings(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const settings = this.objectPayload(value, "transitionSettings must be an object.");
    this.assertBoolean(settings.enabled, "transitionSettings.enabled");
    this.assertOption(settings.kind, "transitionSettings.kind", TRANSITION_KINDS);
    this.assertBoundedNumber(settings.durationSeconds, "transitionSettings.durationSeconds", 0.001, 3);
    this.assertBoundedNumber(settings.fps, "transitionSettings.fps", 12, 60);
    this.assertOptionalNumberOption(settings.targetHeight, "transitionSettings.targetHeight", TRANSITION_TARGET_HEIGHTS);
    this.assertBoolean(settings.preserveAudio, "transitionSettings.preserveAudio");
  }

  private assertSemanticVisualInspectionOptions(value: unknown): void {
    if (value === undefined) {
      return;
    }
    const options = this.objectPayload(value, "semanticVisualInspectionOptions must be an object.");
    this.assertBoolean(options.enabled, "semanticVisualInspectionOptions.enabled");
    this.assertOptionalNonEmptyString(options.modelId, "semanticVisualInspectionOptions.modelId", 160);
    if (!Array.isArray(options.expectations)) {
      throw new RenderRequestAdmissionError("semanticVisualInspectionOptions.expectations must be an array.");
    }
    if (options.expectations.length > MAX_SEMANTIC_EXPECTATIONS) {
      throw new RenderRequestAdmissionError(
        `semanticVisualInspectionOptions.expectations cannot contain more than ${MAX_SEMANTIC_EXPECTATIONS} items.`
      );
    }
    for (const [index, expectation] of options.expectations.entries()) {
      this.assertBoundedString(expectation, `semanticVisualInspectionOptions.expectations[${index}]`, 500, true);
    }
    this.assertPositiveInteger(options.maxFrames, "semanticVisualInspectionOptions.maxFrames", MAX_SEMANTIC_FRAMES);
  }

  private assertSourceVideoAnalysis(value: unknown, references: unknown): void {
    if (value === undefined) {
      return;
    }
    const analysis = this.objectPayload(value, "sourceVideoAnalysis must be an object.");
    this.assertOptionalNonEmptyString(
      analysis.sourceReferenceLabel,
      "sourceVideoAnalysis.sourceReferenceLabel",
      SOURCE_VIDEO_ANALYSIS_LIMITS.maxLabelLength
    );
    this.assertOptionalNonEmptyString(
      analysis.transformationIntent,
      "sourceVideoAnalysis.transformationIntent",
      SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength
    );
    this.assertHasSourceVideoReference(references);
    this.assertSourceReferenceLabelMatches(analysis.sourceReferenceLabel, references);
    this.assertSourceVideoTranscript(analysis.transcript);
    this.assertSourceVideoScenes(analysis.scenes);
    this.assertStringArray(analysis.pacingNotes, "sourceVideoAnalysis.pacingNotes", this.maxSourceVideoNotes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength);
    this.assertStringArray(analysis.styleNotes, "sourceVideoAnalysis.styleNotes", this.maxSourceVideoNotes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength);
    this.assertStringArray(analysis.structuralBeats, "sourceVideoAnalysis.structuralBeats", this.maxSourceVideoNotes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength);
    this.assertStringArray(analysis.safetyNotes, "sourceVideoAnalysis.safetyNotes", this.maxSourceVideoNotes, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength);
  }

  private assertSourceReferenceLabelMatches(value: unknown, references: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(references)) {
      throw new RenderRequestAdmissionError("sourceVideoAnalysis.sourceReferenceLabel requires references to be an array.");
    }
    const matches = references.some((item) => {
      const reference = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return reference.label === value && reference.role === "source_video_structure";
    });
    if (!matches) {
      throw new RenderRequestAdmissionError(
        "sourceVideoAnalysis.sourceReferenceLabel must match a reference labeled with role source_video_structure."
      );
    }
  }

  private assertHasSourceVideoReference(references: unknown): void {
    if (!Array.isArray(references)) {
      throw new RenderRequestAdmissionError("sourceVideoAnalysis requires references to include a source_video_structure item.");
    }
    const hasSourceVideoReference = references.some((item) => {
      const reference = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return reference.role === "source_video_structure";
    });
    if (!hasSourceVideoReference) {
      throw new RenderRequestAdmissionError("sourceVideoAnalysis requires at least one reference with role source_video_structure.");
    }
  }

  private assertSourceVideoTranscript(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("sourceVideoAnalysis.transcript must be an array.");
    }
    if (value.length > this.maxSourceVideoTranscriptCues) {
      throw new RenderRequestAdmissionError(
        `sourceVideoAnalysis.transcript cannot contain more than ${this.maxSourceVideoTranscriptCues} cues.`
      );
    }
    for (const [index, item] of value.entries()) {
      const cue = this.objectPayload(item, `sourceVideoAnalysis.transcript[${index}] must be an object.`);
      this.assertNonNegativeNumber(cue.startSecond, `sourceVideoAnalysis.transcript[${index}].startSecond`);
      this.assertNonNegativeNumber(cue.endSecond, `sourceVideoAnalysis.transcript[${index}].endSecond`);
      if (typeof cue.startSecond === "number" && typeof cue.endSecond === "number" && cue.endSecond <= cue.startSecond) {
        throw new RenderRequestAdmissionError(`sourceVideoAnalysis.transcript[${index}].endSecond must be greater than startSecond.`);
      }
      this.assertBoundedString(cue.text, `sourceVideoAnalysis.transcript[${index}].text`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, true);
    }
  }

  private assertSourceVideoScenes(value: unknown): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError("sourceVideoAnalysis.scenes must be an array.");
    }
    if (value.length > this.maxSourceVideoScenes) {
      throw new RenderRequestAdmissionError(`sourceVideoAnalysis.scenes cannot contain more than ${this.maxSourceVideoScenes} items.`);
    }
    for (const [index, item] of value.entries()) {
      const scene = this.objectPayload(item, `sourceVideoAnalysis.scenes[${index}] must be an object.`);
      this.assertBoundedString(scene.sceneId, `sourceVideoAnalysis.scenes[${index}].sceneId`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxLabelLength, true);
      this.assertNonNegativeNumber(scene.startSecond, `sourceVideoAnalysis.scenes[${index}].startSecond`);
      this.assertNonNegativeNumber(scene.endSecond, `sourceVideoAnalysis.scenes[${index}].endSecond`);
      if (typeof scene.startSecond === "number" && typeof scene.endSecond === "number" && scene.endSecond <= scene.startSecond) {
        throw new RenderRequestAdmissionError(`sourceVideoAnalysis.scenes[${index}].endSecond must be greater than startSecond.`);
      }
      this.assertBoundedString(scene.summary, `sourceVideoAnalysis.scenes[${index}].summary`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, true);
      this.assertBoundedString(scene.pacing, `sourceVideoAnalysis.scenes[${index}].pacing`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, false);
      this.assertBoundedString(scene.camera, `sourceVideoAnalysis.scenes[${index}].camera`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, false);
      this.assertBoundedString(scene.audio, `sourceVideoAnalysis.scenes[${index}].audio`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, false);
      this.assertBoundedString(scene.visualStyle, `sourceVideoAnalysis.scenes[${index}].visualStyle`, SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength, false);
      this.assertSourceVideoKeyframes(scene.keyframes, index);
    }
  }

  private assertSourceVideoKeyframes(value: unknown, sceneIndex: number): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError(`sourceVideoAnalysis.scenes[${sceneIndex}].keyframes must be an array.`);
    }
    if (value.length > this.maxSourceVideoKeyframesPerScene) {
      throw new RenderRequestAdmissionError(
        `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes cannot contain more than ${this.maxSourceVideoKeyframesPerScene} items.`
      );
    }
    for (const [index, item] of value.entries()) {
      const keyframe = this.objectPayload(item, `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${index}] must be an object.`);
      this.assertNonNegativeNumber(
        keyframe.timestampSecond,
        `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${index}].timestampSecond`
      );
      this.assertBoundedString(
        keyframe.description,
        `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${index}].description`,
        SOURCE_VIDEO_ANALYSIS_LIMITS.maxTextLength,
        true
      );
      this.assertBoundedString(
        keyframe.uri,
        `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${index}].uri`,
        SOURCE_VIDEO_ANALYSIS_LIMITS.maxUriLength,
        false
      );
      if (keyframe.uri !== undefined) {
        this.assertReferenceUri(keyframe.uri, `sourceVideoAnalysis.scenes[${sceneIndex}].keyframes[${index}].uri`);
      }
    }
  }

  private assertStringArray(value: unknown, fieldName: string, maxItems: number, maxLength: number): void {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw new RenderRequestAdmissionError(`${fieldName} must be an array.`);
    }
    if (value.length > maxItems) {
      throw new RenderRequestAdmissionError(`${fieldName} cannot contain more than ${maxItems} items.`);
    }
    for (const [index, item] of value.entries()) {
      this.assertBoundedString(item, `${fieldName}[${index}]`, maxLength, true);
    }
  }

  private assertOptionalPath(value: unknown, fieldName: string): void {
    this.assertBoundedString(value, fieldName, 512, false);
  }

  private assertHttpsMediaUrl(value: unknown, fieldName: string): void {
    if (typeof value !== "string") {
      throw new RenderRequestAdmissionError(`${fieldName} must be a string.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new RenderRequestAdmissionError(`${fieldName} must be a valid HTTPS URL.`);
    }
    if (parsed.protocol !== "https:") {
      throw new RenderRequestAdmissionError(`${fieldName} must use https.`);
    }
    if (parsed.username || parsed.password) {
      throw new RenderRequestAdmissionError(`${fieldName} must not include embedded credentials.`);
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        throw new RenderRequestAdmissionError(`${fieldName} query contains credential-like parameter ${key}.`);
      }
    }
  }

  private assertReferenceUri(value: unknown, fieldName: string): void {
    if (typeof value !== "string") {
      throw new RenderRequestAdmissionError(`${fieldName} must be a string.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new RenderRequestAdmissionError(`${fieldName} must be a valid HTTPS URL or asset:// reference.`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "asset:") {
      throw new RenderRequestAdmissionError(`${fieldName} must use https or asset://.`);
    }
    if (parsed.username || parsed.password) {
      throw new RenderRequestAdmissionError(`${fieldName} must not include embedded credentials.`);
    }
    if (parsed.protocol === "asset:" && (parsed.search || parsed.hash)) {
      throw new RenderRequestAdmissionError(`${fieldName} asset:// references must not include query strings or fragments.`);
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        throw new RenderRequestAdmissionError(`${fieldName} query contains credential-like parameter ${key}.`);
      }
    }
  }

  private assertBoundedString(value: unknown, fieldName: string, maxLength: number, required: boolean): void {
    if (value === undefined && !required) {
      return;
    }
    if (typeof value !== "string" || (required && !value.trim())) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a string.`);
    }
    if (value.length > maxLength) {
      throw new RenderRequestAdmissionError(`${fieldName} cannot exceed ${maxLength} characters.`);
    }
  }

  private assertOptionalNonEmptyString(value: unknown, fieldName: string, maxLength: number): void {
    if (value === undefined) {
      return;
    }
    if (typeof value !== "string" || !value.trim()) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a non-empty string when provided.`);
    }
    if (value.length > maxLength) {
      throw new RenderRequestAdmissionError(`${fieldName} cannot exceed ${maxLength} characters.`);
    }
  }

  private assertBoolean(value: unknown, fieldName: string): void {
    if (typeof value !== "boolean") {
      throw new RenderRequestAdmissionError(`${fieldName} must be a boolean.`);
    }
  }

  private assertOption(value: unknown, fieldName: string, allowedValues: readonly string[]): void {
    if (typeof value !== "string" || !allowedValues.includes(value)) {
      throw new RenderRequestAdmissionError(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
    }
  }

  private assertOptionalNumberOption(value: unknown, fieldName: string, allowedValues: readonly number[]): void {
    if (value === undefined) {
      return;
    }
    if (typeof value !== "number" || !allowedValues.includes(value)) {
      throw new RenderRequestAdmissionError(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
    }
  }

  private assertNonNegativeNumber(value: unknown, fieldName: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a non-negative number.`);
    }
  }

  private assertBoundedNumber(value: unknown, fieldName: string, minimum: number, maximum: number): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RenderRequestAdmissionError(`${fieldName} must be between ${minimum} and ${maximum}.`);
    }
  }

  private assertOptionalBoundedNumber(value: unknown, fieldName: string, minimum: number, maximum: number): void {
    if (value === undefined) {
      return;
    }
    this.assertBoundedNumber(value, fieldName, minimum, maximum);
  }

  private assertPositiveInteger(value: unknown, fieldName: string, maximum: number): void {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > maximum) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a positive integer up to ${maximum}.`);
    }
  }

  private assertPositiveOrZeroInteger(value: unknown, fieldName: string, maximum: number): void {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a non-negative integer up to ${maximum}.`);
    }
  }

  private assertAudioBitrate(value: unknown, fieldName: string): void {
    if (typeof value !== "string") {
      throw new RenderRequestAdmissionError(`${fieldName} must be a string.`);
    }
    const match = AUDIO_BITRATE_PATTERN.exec(value);
    const kilobitsPerSecond = match ? Number.parseInt(match[1] ?? "", 10) : NaN;
    if (!Number.isFinite(kilobitsPerSecond) || kilobitsPerSecond < 32 || kilobitsPerSecond > 512) {
      throw new RenderRequestAdmissionError(`${fieldName} must be between 32k and 512k.`);
    }
  }

  private objectPayload(value: unknown, message: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new RenderRequestAdmissionError(message);
  }
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}
