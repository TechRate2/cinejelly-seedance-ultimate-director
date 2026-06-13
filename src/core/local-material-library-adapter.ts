/**
 * Local material library adapter.
 * Reads an operator-owned catalog and returns safe material candidates for the validator.
 * It never emits local filesystem paths and does not include sample/demo assets.
 */

import { readFile } from "node:fs/promises";
import type {
  LocalMaterialCatalog,
  LocalMaterialCatalogEntry,
  MaterialCandidate,
  MaterialPurpose,
  MaterialSearchTerm,
  MaterialSourceAdapter,
  MaterialSourceAdapterInput,
  MaterialSourcingBrief
} from "../types/material.js";
import { createStableId } from "../utils/ids.js";

const SECRET_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|x-amz-|x-goog-|x-oss-|x-ms-)/i;

interface RankedCatalogEntry {
  readonly entry: LocalMaterialCatalogEntry;
  readonly score: number;
  readonly productionSafe: boolean;
}

export interface LocalMaterialLibraryAdapterInput {
  readonly catalog?: LocalMaterialCatalog;
  readonly catalogPath?: string;
}

export class LocalMaterialLibraryAdapter implements MaterialSourceAdapter {
  public readonly adapterId = "local-material-library";
  public readonly source = "local_library" as const;
  private readonly catalog: LocalMaterialCatalog | undefined;
  private readonly catalogPath: string | undefined;

  public constructor(input: LocalMaterialLibraryAdapterInput) {
    if (!input.catalog && !input.catalogPath) {
      throw new Error("LocalMaterialLibraryAdapter requires a catalog or catalogPath.");
    }
    this.catalog = input.catalog ? this.normalizeCatalog(input.catalog) : undefined;
    this.catalogPath = input.catalogPath;
  }

  public async resolve(input: MaterialSourceAdapterInput): Promise<readonly MaterialCandidate[]> {
    const catalog = this.catalog ?? await this.readCatalog();
    const briefs = input.briefs ?? input.plan.briefs;
    const candidates: MaterialCandidate[] = [];

    for (const brief of briefs) {
      const ranked = catalog.entries
        .filter((entry) => this.isEligibleForBrief(entry, brief))
        .map((entry) => this.rankEntry(entry, brief))
        .sort((left, right) => this.compareRanked(left, right))
        .slice(0, brief.maxCandidates);

      for (const rankedEntry of ranked) {
        candidates.push(this.toCandidate(rankedEntry, brief));
      }
    }

    return candidates;
  }

  private async readCatalog(): Promise<LocalMaterialCatalog> {
    if (!this.catalogPath) {
      throw new Error("Local material catalog path is not configured.");
    }
    const text = await readFile(this.catalogPath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return this.normalizeCatalog(parsed);
  }

  private normalizeCatalog(value: unknown): LocalMaterialCatalog {
    const payload = this.record(value, "Local material catalog must be a JSON object.");
    const catalogId = this.optionalString(payload.catalogId, "catalog.catalogId", 160);
    if (!Array.isArray(payload.entries)) {
      throw new Error("Local material catalog entries must be an array.");
    }
    const entries = payload.entries.map((entry, index) => this.normalizeEntry(entry, index));
    return {
      ...(catalogId ? { catalogId } : {}),
      entries
    };
  }

  private normalizeEntry(value: unknown, index: number): LocalMaterialCatalogEntry {
    const payload = this.record(value, `Local material catalog entries[${index}] must be an object.`);
    const assetId = this.requiredString(payload.assetId, `entries[${index}].assetId`, 160);
    const label = this.requiredString(payload.label, `entries[${index}].label`, 240);
    const assetUri = this.safeAssetUri(payload.assetUri, `entries[${index}].assetUri`);
    const source = this.parseSource(payload.source, index);
    const purposes = this.optionalPurposes(payload.purposes, index);
    const tags = this.optionalStringArray(payload.tags, `entries[${index}].tags`, 64, 120);
    const durationSeconds = this.optionalPositiveNumber(payload.durationSeconds, `entries[${index}].durationSeconds`);
    const aspectRatio = this.optionalString(payload.aspectRatio, `entries[${index}].aspectRatio`, 16);
    const resolution = this.optionalString(payload.resolution, `entries[${index}].resolution`, 16);
    const rightsStatus = this.rightsStatus(payload.rightsStatus, index);
    const attribution = this.optionalString(payload.attribution, `entries[${index}].attribution`, 500);
    const contentHash = this.optionalString(payload.contentHash, `entries[${index}].contentHash`, 160);

    const normalizedAspectRatio = this.isAspectRatio(aspectRatio) ? aspectRatio : undefined;
    const normalizedResolution = this.isResolution(resolution) ? resolution : undefined;

    return {
      assetId,
      label,
      assetUri,
      source,
      ...(purposes.length > 0 ? { purposes } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(normalizedAspectRatio !== undefined ? { aspectRatio: normalizedAspectRatio } : {}),
      ...(normalizedResolution !== undefined ? { resolution: normalizedResolution } : {}),
      rightsStatus,
      ...(attribution ? { attribution } : {}),
      ...(contentHash ? { contentHash } : {})
    };
  }

  private isEligibleForBrief(entry: LocalMaterialCatalogEntry, brief: MaterialSourcingBrief): boolean {
    if (!brief.preferredSources.includes(entry.source)) {
      return false;
    }
    if (entry.purposes?.length && !entry.purposes.includes(brief.purpose)) {
      return false;
    }
    return true;
  }

  private rankEntry(entry: LocalMaterialCatalogEntry, brief: MaterialSourcingBrief): RankedCatalogEntry {
    const searchable = this.searchableText(entry);
    const termScore = brief.queryTerms.reduce(
      (score, term) => score + this.termScore(term, searchable),
      0
    );
    const score =
      termScore +
      (entry.purposes?.includes(brief.purpose) ? 40 : 10) +
      (entry.durationSeconds !== undefined && entry.durationSeconds >= brief.minimumDurationSeconds ? 12 : 0) +
      (entry.aspectRatio === brief.aspectRatio ? 8 : 0) +
      (entry.resolution === brief.resolution ? 8 : 0) +
      this.rightsScore(entry);

    return {
      entry,
      score,
      productionSafe: this.productionSafe(entry, brief)
    };
  }

  private termScore(term: MaterialSearchTerm, searchable: string): number {
    const normalizedTerm = this.normalized(term.term);
    if (!normalizedTerm) {
      return 0;
    }
    return searchable.includes(normalizedTerm) ? term.weight * 20 : 0;
  }

  private productionSafe(entry: LocalMaterialCatalogEntry, brief: MaterialSourcingBrief): boolean {
    if (entry.rightsStatus === "rejected" || entry.rightsStatus === "unverified") {
      return false;
    }
    if (entry.rightsStatus === "requires_attribution" && !entry.attribution?.trim()) {
      return false;
    }
    if (brief.rightsRequirement === "user_owned" && entry.rightsStatus === "requires_attribution") {
      return false;
    }
    if (entry.durationSeconds !== undefined && entry.durationSeconds < brief.minimumDurationSeconds) {
      return false;
    }
    return true;
  }

  private rightsScore(entry: LocalMaterialCatalogEntry): number {
    switch (entry.rightsStatus) {
      case "approved":
        return 20;
      case "requires_attribution":
        return entry.attribution?.trim() ? 10 : -30;
      case "unverified":
        return -40;
      case "rejected":
        return -100;
    }
  }

  private compareRanked(left: RankedCatalogEntry, right: RankedCatalogEntry): number {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const labelDelta = left.entry.label.localeCompare(right.entry.label);
    if (labelDelta !== 0) {
      return labelDelta;
    }
    return left.entry.assetId.localeCompare(right.entry.assetId);
  }

  private toCandidate(ranked: RankedCatalogEntry, brief: MaterialSourcingBrief): MaterialCandidate {
    return {
      candidateId: createStableId("material_candidate", `${brief.briefId}:${ranked.entry.assetId}`),
      briefId: brief.briefId,
      source: ranked.entry.source,
      uri: ranked.entry.assetUri,
      ...(ranked.entry.durationSeconds !== undefined ? { durationSeconds: ranked.entry.durationSeconds } : {}),
      ...(ranked.entry.aspectRatio ? { aspectRatio: ranked.entry.aspectRatio } : {}),
      ...(ranked.entry.resolution ? { resolution: ranked.entry.resolution } : {}),
      rightsStatus: ranked.entry.rightsStatus,
      ...(ranked.entry.attribution ? { attribution: ranked.entry.attribution } : {}),
      ...(ranked.entry.contentHash ? { contentHash: ranked.entry.contentHash } : {}),
      selected: ranked.productionSafe,
      ...(!ranked.productionSafe ? { rejectionReason: "Candidate requires material source validation review." } : {})
    };
  }

  private searchableText(entry: LocalMaterialCatalogEntry): string {
    return this.normalized([entry.label, ...(entry.tags ?? []), ...(entry.purposes ?? [])].join(" "));
  }

  private safeAssetUri(value: unknown, fieldName: string): string {
    const uri = this.requiredString(value, fieldName, 4_096);
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`${fieldName} must be a valid asset:// or HTTPS URI.`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`${fieldName} must not include embedded credentials.`);
    }
    if (parsed.protocol === "asset:") {
      if (parsed.search || parsed.hash) {
        throw new Error(`${fieldName} asset:// URI must not include query strings or fragments.`);
      }
      return uri;
    }
    if (parsed.protocol !== "https:") {
      throw new Error(`${fieldName} must use asset:// or https://.`);
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        throw new Error(`${fieldName} query contains credential-like parameter ${key}.`);
      }
    }
    return uri;
  }

  private parseSource(value: unknown, index: number): "local_library" | "user_provided" {
    if (value === "local_library" || value === "user_provided") {
      return value;
    }
    throw new Error(`entries[${index}].source must be local_library or user_provided.`);
  }

  private rightsStatus(value: unknown, index: number): LocalMaterialCatalogEntry["rightsStatus"] {
    if (
      value === "unverified" ||
      value === "approved" ||
      value === "requires_attribution" ||
      value === "rejected"
    ) {
      return value;
    }
    throw new Error(`entries[${index}].rightsStatus is invalid.`);
  }

  private optionalPurposes(value: unknown, index: number): readonly MaterialPurpose[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(`entries[${index}].purposes must be an array.`);
    }
    return value.map((item, purposeIndex) => this.purpose(item, `entries[${index}].purposes[${purposeIndex}]`));
  }

  private purpose(value: unknown, fieldName: string): MaterialPurpose {
    if (
      value === "reference_plate" ||
      value === "stock_insert" ||
      value === "b_roll" ||
      value === "product_plate" ||
      value === "audio_bed" ||
      value === "subtitle_asset"
    ) {
      return value;
    }
    throw new Error(`${fieldName} is not a supported material purpose.`);
  }

  private optionalStringArray(
    value: unknown,
    fieldName: string,
    maxItems: number,
    maxLength: number
  ): readonly string[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array.`);
    }
    if (value.length > maxItems) {
      throw new Error(`${fieldName} cannot contain more than ${maxItems} items.`);
    }
    return value.map((item, index) => this.requiredString(item, `${fieldName}[${index}]`, maxLength));
  }

  private optionalPositiveNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${fieldName} must be a positive number.`);
    }
    return value;
  }

  private optionalString(value: unknown, fieldName: string, maxLength: number): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.requiredString(value, fieldName, maxLength);
  }

  private requiredString(value: unknown, fieldName: string, maxLength: number): string {
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

  private record(value: unknown, message: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new Error(message);
  }

  private isAspectRatio(value: string | undefined): value is LocalMaterialCatalogEntry["aspectRatio"] {
    return value === "adaptive" || value === "21:9" || value === "16:9" || value === "4:3" || value === "1:1" || value === "3:4" || value === "9:16";
  }

  private isResolution(value: string | undefined): value is LocalMaterialCatalogEntry["resolution"] {
    return value === "480p" || value === "720p" || value === "1080p";
  }

  private normalized(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase();
  }
}
