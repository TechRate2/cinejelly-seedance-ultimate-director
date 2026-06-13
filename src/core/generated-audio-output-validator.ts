/**
 * Validates provider-generated audio results before they can become mix tracks.
 * Inspired by MoneyPrinterTurbo audio-stage artifacts and VibeFrame validation-before-release discipline.
 */

import type { AudioMixTrack, AudioTrackRole, GeneratedAudioIntent, GeneratedAudioIntentKind } from "../types/audio.js";
import type { GeneratedAudioExecutionReadyItem } from "../types/generated-audio-execution.js";
import type {
  GeneratedAudioOutputValidationIssue,
  GeneratedAudioOutputValidationIssueCode,
  GeneratedAudioOutputValidationReport,
  GeneratedAudioOutputValidationSeverity,
  GeneratedAudioOutputValidationStatus
} from "../types/generated-audio-output.js";
import type { AudioGenerationResult } from "../types/provider.js";
import { createStableId } from "../utils/ids.js";

const SECRET_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|policy|expires|key-pair-id|x-amz-|x-goog-|x-oss-|x-ms-)/i;
const DEFAULT_VOLUME = 1;
const MAX_VOLUME = 2;
const DURATION_TOLERANCE_SECONDS = 1;

export interface GeneratedAudioOutputValidatorInput {
  readonly intent: GeneratedAudioIntent;
  readonly plannedItem: GeneratedAudioExecutionReadyItem;
  readonly result: AudioGenerationResult;
}

export class GeneratedAudioOutputValidator {
  public validate(input: GeneratedAudioOutputValidatorInput): GeneratedAudioOutputValidationReport {
    const issues: GeneratedAudioOutputValidationIssue[] = [];
    this.validateIdentity(input, issues);
    this.validateDuration(input, issues);
    const outputUrl = input.result.outputUrl;
    const urlApprovedForTrack = this.validateOutputUrl(outputUrl, issues);
    const volume = this.volume(input.intent.volume, issues);
    const status = this.status(issues);
    const audioTrack = status === "approved" && outputUrl && urlApprovedForTrack
      ? this.audioTrack(input.intent, outputUrl, volume)
      : undefined;

    return {
      status,
      intentId: input.intent.intentId,
      kind: input.intent.kind,
      provider: input.result.provider,
      modelId: input.result.modelId,
      ...(outputUrl ? { outputUrl } : {}),
      ...(input.result.providerAssetId ? { providerAssetId: input.result.providerAssetId } : {}),
      ...(input.result.durationSeconds !== undefined ? { durationSeconds: input.result.durationSeconds } : {}),
      issueCount: issues.length,
      issues,
      ...(audioTrack ? { audioTrack } : {})
    };
  }

  private validateIdentity(
    input: GeneratedAudioOutputValidatorInput,
    issues: GeneratedAudioOutputValidationIssue[]
  ): void {
    if (input.result.status !== "succeeded") {
      issues.push(this.issue(
        "provider_result_not_succeeded",
        "block",
        "Generated-audio provider result is not succeeded.",
        "Retry or repair the generated-audio request before adding it to the audio mix."
      ));
    }
    if (input.result.intentId !== input.intent.intentId || input.result.intentId !== input.plannedItem.intentId) {
      issues.push(this.issue(
        "intent_mismatch",
        "block",
        "Generated-audio result intent ID does not match the planned intent.",
        "Discard the result and rerun the matching generated-audio intent."
      ));
    }
    if (input.result.kind !== input.intent.kind || input.result.kind !== input.plannedItem.kind) {
      issues.push(this.issue(
        "kind_mismatch",
        "block",
        "Generated-audio result kind does not match the planned intent kind.",
        "Discard the result and rerun with the correct generated-audio kind."
      ));
    }
    if (input.result.provider !== input.plannedItem.provider) {
      issues.push(this.issue(
        "provider_mismatch",
        "block",
        "Generated-audio result provider does not match the planned provider.",
        "Use the result from the planned provider or regenerate the audio with a reviewed plan."
      ));
    }
    if (input.result.modelId !== input.plannedItem.modelId) {
      issues.push(this.issue(
        "model_mismatch",
        "block",
        "Generated-audio result model ID does not match the planned model.",
        "Use the result from the planned model or regenerate the audio with a reviewed plan."
      ));
    }
  }

  private validateDuration(
    input: GeneratedAudioOutputValidatorInput,
    issues: GeneratedAudioOutputValidationIssue[]
  ): void {
    const duration = input.result.durationSeconds;
    if (duration === undefined) {
      issues.push(this.issue(
        "missing_duration",
        "block",
        "Generated-audio result is missing duration evidence.",
        "Inspect the generated audio and record a positive duration before mixing."
      ));
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      issues.push(this.issue(
        "invalid_duration",
        "block",
        "Generated-audio result duration must be greater than zero seconds.",
        "Discard the result or inspect the generated audio before mixing."
      ));
      return;
    }
    const plannedDuration = input.plannedItem.request.settings.durationSeconds;
    if (plannedDuration !== undefined && duration > plannedDuration + DURATION_TOLERANCE_SECONDS) {
      issues.push(this.issue(
        "duration_exceeds_plan",
        "block",
        "Generated-audio result duration exceeds the planned duration tolerance.",
        "Regenerate shorter audio or revise the generated-audio execution plan before mixing."
      ));
    }
  }

  private validateOutputUrl(
    outputUrl: string | undefined,
    issues: GeneratedAudioOutputValidationIssue[]
  ): boolean {
    if (!outputUrl) {
      issues.push(this.issue(
        "missing_output_url",
        "block",
        "Generated-audio result is missing an output URL.",
        "Do not mix the result until the provider returns a safe output URL."
      ));
      return false;
    }
    if (/^data:/i.test(outputUrl)) {
      issues.push(this.issue(
        "unsafe_output_url",
        "block",
        "Generated-audio output URL must not be an inline data URI.",
        "Use a credential-free HTTPS audio URL or resolve the asset through a reviewed internal asset resolver."
      ));
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(outputUrl);
    } catch {
      issues.push(this.issue(
        "invalid_output_url",
        "block",
        "Generated-audio output URL is not a valid URL.",
        "Use a valid credential-free HTTPS audio URL."
      ));
      return false;
    }

    if (parsed.username || parsed.password) {
      issues.push(this.issue(
        "unsafe_output_url",
        "block",
        "Generated-audio output URL must not include embedded credentials.",
        "Regenerate or proxy the audio through a credential-free delivery URL."
      ));
      return false;
    }
    if (parsed.protocol === "asset:") {
      if (parsed.search || parsed.hash) {
        issues.push(this.issue(
          "unsafe_output_url",
          "block",
          "Generated-audio asset URI must not include query strings or fragments.",
          "Use a clean asset:// URI and resolve it through an approved asset resolver."
        ));
        return false;
      }
      issues.push(this.issue(
        "asset_resolution_required",
        "warn",
        "Generated-audio asset URI requires an audio asset resolver before mixing.",
        "Resolve the asset to a credential-free HTTPS URL through a reviewed audio asset resolver."
      ));
      return false;
    }
    if (parsed.protocol !== "https:") {
      issues.push(this.issue(
        "unsafe_output_url",
        "block",
        "Generated-audio output URL must use HTTPS.",
        "Use a credential-free HTTPS audio URL."
      ));
      return false;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        issues.push(this.issue(
          "unsafe_output_url",
          "block",
          `Generated-audio output URL contains credential-like query parameter ${key}.`,
          "Use a credential-free delivery URL before adding generated audio to the mix."
        ));
        return false;
      }
    }
    return true;
  }

  private volume(value: number | undefined, issues: GeneratedAudioOutputValidationIssue[]): number {
    const volume = value ?? DEFAULT_VOLUME;
    if (!Number.isFinite(volume) || volume < 0 || volume > MAX_VOLUME) {
      issues.push(this.issue(
        "invalid_volume",
        "block",
        "Generated-audio volume must be a finite number between 0 and 2.",
        "Adjust the generated-audio intent volume before mixing."
      ));
      return DEFAULT_VOLUME;
    }
    return volume;
  }

  private audioTrack(intent: GeneratedAudioIntent, outputUrl: string, volume: number): AudioMixTrack {
    return {
      trackId: createStableId("generated_audio_track", intent.intentId),
      sourceUrlOrPath: outputUrl,
      role: this.roleForKind(intent.kind),
      volume
    };
  }

  private roleForKind(kind: GeneratedAudioIntentKind): AudioTrackRole {
    switch (kind) {
      case "tts_narration":
        return "narration";
      case "bgm":
        return "music";
      case "ambience":
        return "ambience";
      case "sfx":
        return "sfx";
    }
  }

  private status(issues: readonly GeneratedAudioOutputValidationIssue[]): GeneratedAudioOutputValidationStatus {
    if (issues.some((issue) => issue.severity === "block")) {
      return "rejected";
    }
    if (issues.some((issue) => issue.severity === "warn")) {
      return "review_required";
    }
    return "approved";
  }

  private issue(
    code: GeneratedAudioOutputValidationIssueCode,
    severity: GeneratedAudioOutputValidationSeverity,
    message: string,
    repair: string
  ): GeneratedAudioOutputValidationIssue {
    return { code, severity, message, repair };
  }
}
