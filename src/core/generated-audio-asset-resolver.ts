/**
 * Resolves reviewed generated-audio asset:// references into safe HTTPS delivery URLs.
 * It does not call providers, fetch media, inspect files, or mint delivery URLs.
 */

import type { GeneratedAudioIntent } from "../types/audio.js";
import type { GeneratedAudioExecutionReadyItem } from "../types/generated-audio-execution.js";
import type {
  GeneratedAudioAssetResolutionCatalog,
  GeneratedAudioAssetResolutionEntry,
  GeneratedAudioAssetResolutionIssue,
  GeneratedAudioAssetResolutionIssueCode,
  GeneratedAudioAssetResolutionReport,
  GeneratedAudioAssetResolutionSeverity,
  GeneratedAudioAssetResolutionStatus
} from "../types/generated-audio-asset.js";
import type { AudioGenerationResult } from "../types/provider.js";

const SECRET_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|policy|expires|key-pair-id|x-amz-|x-goog-|x-oss-|x-ms-)/i;
const DURATION_TOLERANCE_SECONDS = 1;
const GENERATED_AUDIO_KINDS = new Set(["tts_narration", "bgm", "ambience", "sfx"]);

export interface GeneratedAudioAssetResolverInput {
  readonly assetUri: string;
  readonly intent: GeneratedAudioIntent;
  readonly plannedItem: GeneratedAudioExecutionReadyItem;
  readonly result: AudioGenerationResult;
}

export interface GeneratedAudioAssetResolverLike {
  resolve(input: GeneratedAudioAssetResolverInput): GeneratedAudioAssetResolutionReport;
}

export interface GeneratedAudioAssetResolverOptions {
  readonly entries: readonly GeneratedAudioAssetResolutionEntry[];
}

export class GeneratedAudioAssetResolver implements GeneratedAudioAssetResolverLike {
  private readonly entries: readonly GeneratedAudioAssetResolutionEntry[];

  public static fromCatalog(value: unknown): GeneratedAudioAssetResolver {
    return new GeneratedAudioAssetResolver({ entries: normalizeCatalog(value).entries });
  }

  public static normalizeCatalog(value: unknown): GeneratedAudioAssetResolutionCatalog {
    return normalizeCatalog(value);
  }

  public constructor(options: GeneratedAudioAssetResolverOptions) {
    this.entries = normalizeEntries(options.entries);
  }

  public resolve(input: GeneratedAudioAssetResolverInput): GeneratedAudioAssetResolutionReport {
    const issues: GeneratedAudioAssetResolutionIssue[] = [];
    const normalizedAssetUri = this.assetUri(input.assetUri, issues);
    if (!normalizedAssetUri) {
      return this.report(input.assetUri, undefined, issues);
    }
    const entry = this.findEntry(normalizedAssetUri);

    if (!entry) {
      issues.push(this.issue(
        "asset_resolution_not_found",
        "warn",
        "Generated-audio asset URI has no approved resolver entry.",
        "Attach an operator-reviewed resolver entry before mixing this generated-audio asset."
      ));
      return this.report(normalizedAssetUri, undefined, issues);
    }

    this.validateEntry(entry, input, issues);
    const resolvedUrl = this.resolvedUrl(entry.resolvedUrl, issues);
    const status = this.status(issues);

    return {
      status,
      assetUri: normalizedAssetUri,
      ...(status === "resolved" && resolvedUrl ? { resolvedUrl } : {}),
      ...(entry.providerAssetId ? { providerAssetId: entry.providerAssetId } : {}),
      ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
      issueCount: issues.length,
      issues
    };
  }

  private findEntry(assetUri: string): GeneratedAudioAssetResolutionEntry | undefined {
    return this.entries.find((entry) => entry.assetUri === assetUri);
  }

  private validateEntry(
    entry: GeneratedAudioAssetResolutionEntry,
    input: GeneratedAudioAssetResolverInput,
    issues: GeneratedAudioAssetResolutionIssue[]
  ): void {
    if (!entry.approvedForMix) {
      issues.push(this.issue(
        "asset_not_approved_for_mix",
        "warn",
        "Generated-audio asset resolver entry is not approved for final mixing.",
        "Review and approve the generated-audio asset before allowing it into the audio mix."
      ));
    }
    if (entry.intentId !== undefined && entry.intentId !== input.result.intentId) {
      issues.push(this.issue(
        "asset_intent_mismatch",
        "block",
        "Generated-audio asset resolver entry intent ID does not match the provider result.",
        "Use the resolver entry for the matching generated-audio intent or regenerate the asset."
      ));
    }
    if (entry.kind !== undefined && entry.kind !== input.result.kind) {
      issues.push(this.issue(
        "asset_kind_mismatch",
        "block",
        "Generated-audio asset resolver entry kind does not match the provider result.",
        "Use an asset resolver entry for the matching generated-audio kind."
      ));
    }
    if (entry.provider !== undefined && entry.provider !== input.result.provider) {
      issues.push(this.issue(
        "asset_provider_mismatch",
        "block",
        "Generated-audio asset resolver entry provider does not match the provider result.",
        "Use the resolver entry produced by the same generated-audio provider."
      ));
    }
    if (entry.modelId !== undefined && entry.modelId !== input.result.modelId) {
      issues.push(this.issue(
        "asset_model_mismatch",
        "block",
        "Generated-audio asset resolver entry model ID does not match the provider result.",
        "Use the resolver entry produced by the same generated-audio model."
      ));
    }
    if (
      entry.providerAssetId !== undefined &&
      input.result.providerAssetId !== undefined &&
      entry.providerAssetId !== input.result.providerAssetId
    ) {
      issues.push(this.issue(
        "asset_provider_asset_mismatch",
        "block",
        "Generated-audio asset resolver entry provider asset ID does not match the provider result.",
        "Use the resolver entry for the exact provider asset returned by the generated-audio result."
      ));
    }
    if (entry.durationSeconds !== undefined) {
      if (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0) {
        issues.push(this.issue(
          "asset_duration_invalid",
          "block",
          "Generated-audio asset resolver entry duration must be greater than zero seconds.",
          "Inspect the generated-audio asset and record a positive duration before mixing."
        ));
      } else if (
        input.result.durationSeconds !== undefined &&
        Math.abs(entry.durationSeconds - input.result.durationSeconds) > DURATION_TOLERANCE_SECONDS
      ) {
        issues.push(this.issue(
          "asset_duration_mismatch",
          "block",
          "Generated-audio asset resolver entry duration does not match the provider result duration.",
          "Review the generated-audio asset evidence before mixing."
        ));
      }
    }
  }

  private assetUri(value: string, issues: GeneratedAudioAssetResolutionIssue[]): string | undefined {
    const normalized = this.safeAssetUri(value);
    if (normalized) {
      return normalized;
    }
    issues.push(this.issue(
      "asset_uri_invalid",
      "block",
      "Generated-audio output asset URI must be a clean asset:// URI.",
      "Use an asset:// URI without embedded credentials, query strings, or fragments."
    ));
    return undefined;
  }

  private safeAssetUri(value: string): string | undefined {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "asset:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return undefined;
    }
    return parsed.toString();
  }

  private resolvedUrl(value: string, issues: GeneratedAudioAssetResolutionIssue[]): string | undefined {
    if (/^data:/i.test(value)) {
      issues.push(this.issue(
        "resolved_url_unsafe",
        "block",
        "Generated-audio resolved URL must not be an inline data URI.",
        "Resolve the asset to a credential-free HTTPS audio URL."
      ));
      return undefined;
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      issues.push(this.issue(
        "resolved_url_invalid",
        "block",
        "Generated-audio resolved URL is not a valid URL.",
        "Use a valid credential-free HTTPS audio URL."
      ));
      return undefined;
    }

    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      issues.push(this.issue(
        "resolved_url_unsafe",
        "block",
        "Generated-audio resolved URL must be HTTPS and must not include embedded credentials.",
        "Use a credential-free HTTPS delivery URL before mixing generated audio."
      ));
      return undefined;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        issues.push(this.issue(
          "resolved_url_unsafe",
          "block",
          `Generated-audio resolved URL contains credential-like query parameter ${key}.`,
          "Use a credential-free delivery URL before mixing generated audio."
        ));
        return undefined;
      }
    }
    return parsed.toString();
  }

  private report(
    assetUri: string,
    entry: GeneratedAudioAssetResolutionEntry | undefined,
    issues: readonly GeneratedAudioAssetResolutionIssue[]
  ): GeneratedAudioAssetResolutionReport {
    return {
      status: this.status(issues),
      assetUri,
      ...(entry?.providerAssetId ? { providerAssetId: entry.providerAssetId } : {}),
      ...(entry?.contentHash ? { contentHash: entry.contentHash } : {}),
      issueCount: issues.length,
      issues
    };
  }

  private status(issues: readonly GeneratedAudioAssetResolutionIssue[]): GeneratedAudioAssetResolutionStatus {
    if (issues.some((issue) => issue.severity === "block")) {
      return "rejected";
    }
    if (issues.some((issue) => issue.severity === "warn")) {
      return "review_required";
    }
    return "resolved";
  }

  private issue(
    code: GeneratedAudioAssetResolutionIssueCode,
    severity: GeneratedAudioAssetResolutionSeverity,
    message: string,
    repair: string
  ): GeneratedAudioAssetResolutionIssue {
    return { code, severity, message, repair };
  }
}

function normalizeCatalog(value: unknown): GeneratedAudioAssetResolutionCatalog {
  const payload = record(value, "Generated-audio asset resolution catalog must be a JSON object.");
  const catalogId = optionalString(payload.catalogId, "catalog.catalogId", 160);
  if (!Array.isArray(payload.entries)) {
    throw new Error("Generated-audio asset resolution catalog entries must be an array.");
  }
  return {
    ...(catalogId ? { catalogId } : {}),
    entries: normalizeEntries(payload.entries)
  };
}

function normalizeEntries(entries: readonly unknown[]): readonly GeneratedAudioAssetResolutionEntry[] {
  const normalized = entries.map((entry, index) => normalizeEntry(entry, index));
  const seen = new Set<string>();
  for (const entry of normalized) {
    if (seen.has(entry.assetUri)) {
      throw new Error(`Generated-audio asset resolution catalog contains duplicate assetUri ${entry.assetUri}.`);
    }
    seen.add(entry.assetUri);
  }
  return normalized;
}

function normalizeEntry(value: unknown, index: number): GeneratedAudioAssetResolutionEntry {
  const payload = record(value, `Generated-audio asset resolution entries[${index}] must be an object.`);
  const assetUri = cleanAssetUri(requiredString(payload.assetUri, `entries[${index}].assetUri`, 4_096));
  const resolvedUrl = cleanHttpsUrl(requiredString(payload.resolvedUrl, `entries[${index}].resolvedUrl`, 4_096));
  if (typeof payload.approvedForMix !== "boolean") {
    throw new Error(`entries[${index}].approvedForMix must be a boolean.`);
  }
  const intentId = optionalString(payload.intentId, `entries[${index}].intentId`, 160);
  const kind = optionalKind(payload.kind, `entries[${index}].kind`);
  const provider = optionalString(payload.provider, `entries[${index}].provider`, 160);
  const modelId = optionalString(payload.modelId, `entries[${index}].modelId`, 160);
  const providerAssetId = optionalString(payload.providerAssetId, `entries[${index}].providerAssetId`, 240);
  const durationSeconds = optionalPositiveNumber(payload.durationSeconds, `entries[${index}].durationSeconds`);
  const contentHash = optionalString(payload.contentHash, `entries[${index}].contentHash`, 160);
  const approvedBy = optionalString(payload.approvedBy, `entries[${index}].approvedBy`, 160);
  const approvedAt = optionalString(payload.approvedAt, `entries[${index}].approvedAt`, 80);

  return {
    assetUri,
    resolvedUrl,
    approvedForMix: payload.approvedForMix,
    ...(intentId ? { intentId } : {}),
    ...(kind ? { kind } : {}),
    ...(provider ? { provider } : {}),
    ...(modelId ? { modelId } : {}),
    ...(providerAssetId ? { providerAssetId } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(contentHash ? { contentHash } : {}),
    ...(approvedBy ? { approvedBy } : {}),
    ...(approvedAt ? { approvedAt } : {})
  };
}

function cleanAssetUri(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Generated-audio asset resolution assetUri must be a valid asset:// URI.");
  }
  if (parsed.protocol !== "asset:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Generated-audio asset resolution assetUri must be a clean asset:// URI without credentials, query strings, or fragments.");
  }
  return parsed.toString();
}

function cleanHttpsUrl(value: string): string {
  if (/^data:/i.test(value)) {
    throw new Error("Generated-audio asset resolution resolvedUrl must not be a data URI.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Generated-audio asset resolution resolvedUrl must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Generated-audio asset resolution resolvedUrl must be HTTPS and must not include embedded credentials.");
  }
  for (const key of parsed.searchParams.keys()) {
    if (SECRET_QUERY_KEY_PATTERN.test(key)) {
      throw new Error(`Generated-audio asset resolution resolvedUrl contains credential-like query parameter ${key}.`);
    }
  }
  return parsed.toString();
}

function optionalKind(value: unknown, fieldName: string): GeneratedAudioAssetResolutionEntry["kind"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !GENERATED_AUDIO_KINDS.has(value)) {
    throw new Error(`${fieldName} must be one of: tts_narration, bgm, ambience, sfx.`);
  }
  return value as GeneratedAudioAssetResolutionEntry["kind"];
}

function optionalPositiveNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, fieldName, maxLength);
}

function requiredString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  const text = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`${fieldName} must not contain control characters.`);
  }
  if (text.length > maxLength) {
    throw new Error(`${fieldName} cannot exceed ${maxLength} characters.`);
  }
  return text;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(message);
}
