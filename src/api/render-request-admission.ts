/**
 * Render request admission control.
 * It rejects oversized or malformed production requests before LLM planning, provider calls, or job queue occupancy.
 */

import { normalizeSeedanceSettings } from "../config/seedance-settings.js";

export interface RenderRequestAdmissionSettings {
  readonly maxUserInputCharacters?: number;
  readonly maxReferences?: number;
  readonly maxCaptionCues?: number;
  readonly maxAudioTracks?: number;
  readonly maxMetadataEntries?: number;
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
  private readonly maxMetadataEntries: number;

  public constructor(settings: RenderRequestAdmissionSettings = {}) {
    this.maxUserInputCharacters = positiveOrDefault(settings.maxUserInputCharacters, 24_000);
    this.maxReferences = positiveOrDefault(settings.maxReferences, 24);
    this.maxCaptionCues = positiveOrDefault(settings.maxCaptionCues, 600);
    this.maxAudioTracks = positiveOrDefault(settings.maxAudioTracks, 16);
    this.maxMetadataEntries = positiveOrDefault(settings.maxMetadataEntries, 50);
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
    this.assertAudioTracks(payload.audioTracks);
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
      this.assertBoundedString(reference.label, `references[${index}].label`, 160, false);
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
      this.assertNonNegativeNumber(track.volume, `audioTracks[${index}].volume`);
      if (typeof track.volume === "number" && track.volume > 2) {
        throw new RenderRequestAdmissionError(`audioTracks[${index}].volume cannot exceed 2.`);
      }
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

  private assertNonNegativeNumber(value: unknown, fieldName: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RenderRequestAdmissionError(`${fieldName} must be a non-negative number.`);
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
