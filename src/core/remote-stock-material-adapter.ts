/**
 * Remote stock material adapter.
 * Queries approved stock providers and emits only credential-free material candidates.
 * Provider credentials are used only for outbound search requests and never copied to artifacts.
 */

import type {
  MaterialCandidate,
  MaterialSearchTerm,
  MaterialSourceAdapter,
  MaterialSourceAdapterInput,
  MaterialSourcingBrief,
  RemoteStockMaterialSource,
  RemoteStockProviderSettings
} from "../types/material.js";
import type { AspectRatio, Resolution } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";

const SECRET_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|oauth|x-amz-|x-goog-|x-oss-|x-ms-)/i;
const MAX_QUERY_LENGTH = 100;
const MAX_STOCK_JSON_BYTES = 2 * 1024 * 1024;

type RemoteStockFetch = typeof fetch;

interface StockRendition {
  readonly uri: string;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: string;
}

interface NormalizedStockItem {
  readonly providerAssetId: string;
  readonly sourcePageUrl?: string;
  readonly previewUri?: string;
  readonly durationSeconds?: number;
  readonly attribution: string;
  readonly licenseLabel: string;
  readonly renditions: readonly StockRendition[];
}

interface RankedMaterialCandidate {
  readonly candidate: MaterialCandidate;
  readonly score: number;
}

export interface RemoteStockMaterialAdapterInput {
  readonly settings: RemoteStockProviderSettings;
  readonly fetchImpl?: RemoteStockFetch;
}

export class RemoteStockMaterialAdapter implements MaterialSourceAdapter {
  public readonly adapterId: string;
  public readonly source: RemoteStockMaterialSource;
  private readonly settings: RemoteStockProviderSettings;
  private readonly fetchImpl: RemoteStockFetch;

  public constructor(input: RemoteStockMaterialAdapterInput) {
    this.settings = this.normalizeSettings(input.settings);
    this.source = this.settings.source;
    this.adapterId = `remote-stock-${this.source}`;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  public async resolve(input: MaterialSourceAdapterInput): Promise<readonly MaterialCandidate[]> {
    const briefs = input.briefs ?? input.plan.briefs;
    const candidates: MaterialCandidate[] = [];

    for (const brief of briefs) {
      if (!this.shouldSearchBrief(brief)) {
        continue;
      }
      const query = this.queryForBrief(brief);
      if (!query) {
        continue;
      }
      const items = await this.safeSearchProvider(query, brief, input.signal);
      const ranked = items
        .flatMap((item) => this.toRankedCandidate(item, brief))
        .sort((left, right) => this.compareRanked(left, right))
        .slice(0, Math.min(brief.maxCandidates, this.settings.maxResultsPerBrief));

      for (const item of ranked) {
        candidates.push(item.candidate);
      }
    }

    return candidates;
  }

  private async safeSearchProvider(
    query: string,
    brief: MaterialSourcingBrief,
    signal?: AbortSignal
  ): Promise<readonly NormalizedStockItem[]> {
    try {
      return await this.searchProvider(query, brief, signal);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      return [];
    }
  }

  private shouldSearchBrief(brief: MaterialSourcingBrief): boolean {
    return brief.allowRemoteSources && brief.preferredSources.includes(this.source);
  }

  private async searchProvider(
    query: string,
    brief: MaterialSourcingBrief,
    signal?: AbortSignal
  ): Promise<readonly NormalizedStockItem[]> {
    switch (this.source) {
      case "pexels":
        return this.searchPexels(query, brief, signal);
      case "pixabay":
        return this.searchPixabay(query, brief, signal);
      case "coverr":
        return this.searchCoverr(query, brief, signal);
    }
  }

  private async searchPexels(
    query: string,
    brief: MaterialSourcingBrief,
    signal?: AbortSignal
  ): Promise<readonly NormalizedStockItem[]> {
    const url = new URL("https://api.pexels.com/v1/videos/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(80, this.settings.maxResultsPerBrief * 4)));
    const orientation = this.orientationForAspect(brief.aspectRatio);
    if (orientation) {
      url.searchParams.set("orientation", orientation);
    }
    const payload = await this.fetchJson(url, { Authorization: this.settings.apiKey }, signal);
    const videos = this.array((payload as Record<string, unknown>).videos);
    return videos.map((item) => this.normalizePexelsItem(item)).filter((item) => item !== undefined);
  }

  private async searchPixabay(
    query: string,
    brief: MaterialSourcingBrief,
    signal?: AbortSignal
  ): Promise<readonly NormalizedStockItem[]> {
    const target = this.targetDimensions(brief.aspectRatio, brief.resolution);
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", this.settings.apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("video_type", "all");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("per_page", String(Math.min(200, Math.max(3, this.settings.maxResultsPerBrief * 4))));
    url.searchParams.set("min_width", String(target.width));
    url.searchParams.set("min_height", String(target.height));
    const payload = await this.fetchJson(url, {}, signal);
    const hits = this.array((payload as Record<string, unknown>).hits);
    return hits.map((item) => this.normalizePixabayItem(item)).filter((item) => item !== undefined);
  }

  private async searchCoverr(
    query: string,
    brief: MaterialSourcingBrief,
    signal?: AbortSignal
  ): Promise<readonly NormalizedStockItem[]> {
    if (!this.settings.commercialUseApproved) {
      return [];
    }
    const url = new URL("https://api.coverr.co/videos");
    url.searchParams.set("query", query);
    url.searchParams.set("urls", "true");
    url.searchParams.set("page", "1");
    url.searchParams.set("per_page", String(Math.min(50, this.settings.maxResultsPerBrief * 4)));
    const payload = await this.fetchJson(url, { Authorization: `Bearer ${this.settings.apiKey}` }, signal);
    const record = this.record(payload);
    const items = this.array(record.hits ?? record.videos ?? record.data);
    return items.map((item) => this.normalizeCoverrItem(item, brief)).filter((item) => item !== undefined);
  }

  private normalizePexelsItem(value: unknown): NormalizedStockItem | undefined {
    const item = this.record(value);
    const providerAssetId = this.optionalId(item.id);
    const durationSeconds = this.optionalPositiveNumber(item.duration);
    if (!providerAssetId || durationSeconds === undefined) {
      return undefined;
    }
    const sourcePageUrl = this.safeOptionalHttps(item.url);
    const previewUri = this.safeOptionalHttps(item.image);
    const user = this.recordOrUndefined(item.user);
    const author = this.optionalString(user?.name) ?? "Pexels contributor";
    const renditions = this.array(item.video_files)
      .map((file) => this.pexelsRendition(file))
      .filter((file) => file !== undefined);
    return {
      providerAssetId,
      ...(sourcePageUrl ? { sourcePageUrl } : {}),
      ...(previewUri ? { previewUri } : {}),
      durationSeconds,
      attribution: sourcePageUrl ? `Video by ${author} on Pexels (${sourcePageUrl})` : `Video by ${author} on Pexels`,
      licenseLabel: "Pexels API Guidelines",
      renditions
    };
  }

  private pexelsRendition(value: unknown): StockRendition | undefined {
    const file = this.record(value);
    const uri = this.safeOptionalHttps(file.link);
    if (!uri) {
      return undefined;
    }
    const width = this.optionalPositiveNumber(file.width);
    const height = this.optionalPositiveNumber(file.height);
    const quality = this.optionalString(file.quality);
    return {
      uri,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(quality ? { quality } : {})
    };
  }

  private normalizePixabayItem(value: unknown): NormalizedStockItem | undefined {
    const item = this.record(value);
    const providerAssetId = this.optionalId(item.id);
    const durationSeconds = this.optionalPositiveNumber(item.duration);
    if (!providerAssetId || durationSeconds === undefined) {
      return undefined;
    }
    const sourcePageUrl = this.safeOptionalHttps(item.pageURL);
    const user = this.optionalString(item.user) ?? "Pixabay contributor";
    const videos = this.recordOrUndefined(item.videos);
    const videoEntries = videos ? Object.values(videos) : [];
    const renditions = videoEntries.map((file) => this.pixabayRendition(file)).filter((file) => file !== undefined);
    const previewUri = videoEntries
      .map((file) => this.safeOptionalHttps(this.record(file).thumbnail))
      .find((uri) => uri !== undefined);
    return {
      providerAssetId,
      ...(sourcePageUrl ? { sourcePageUrl } : {}),
      ...(previewUri ? { previewUri } : {}),
      durationSeconds,
      attribution: sourcePageUrl ? `Video by ${user} on Pixabay (${sourcePageUrl})` : `Video by ${user} on Pixabay`,
      licenseLabel: "Pixabay Content License",
      renditions: renditions.filter((rendition) => rendition.quality !== "thumbnail")
    };
  }

  private pixabayRendition(value: unknown): StockRendition | undefined {
    const file = this.record(value);
    const uri = this.safeOptionalHttps(file.url);
    if (!uri) {
      return undefined;
    }
    const width = this.optionalPositiveNumber(file.width);
    const height = this.optionalPositiveNumber(file.height);
    return {
      uri,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {})
    };
  }

  private normalizeCoverrItem(value: unknown, brief: MaterialSourcingBrief): NormalizedStockItem | undefined {
    const item = this.record(value);
    const providerAssetId = this.optionalId(item.id ?? item.uuid ?? item.slug);
    if (!providerAssetId) {
      return undefined;
    }
    const durationSeconds = this.optionalDuration(item.duration ?? item.videoDuration);
    const sourcePageUrl = this.safeOptionalHttps(item.url ?? item.video_url ?? item.link);
    const previewUri = this.safeOptionalHttps(item.poster ?? item.thumbnail ?? item.image);
    const urls = this.recordOrUndefined(item.urls);
    const renditions = [
      urls?.mp4_download,
      urls?.mp4,
      item.mp4_download,
      item.download_url,
      item.video_file
    ]
      .map((candidate) => this.safeOptionalHttps(candidate))
      .filter((uri) => uri !== undefined)
      .map((uri) => ({ uri, ...this.targetDimensions(brief.aspectRatio, brief.resolution) }));
    const title = this.optionalString(item.title ?? item.name) ?? providerAssetId;
    return {
      providerAssetId,
      ...(sourcePageUrl ? { sourcePageUrl } : {}),
      ...(previewUri ? { previewUri } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      attribution: sourcePageUrl ? `Video "${title}" from Coverr (${sourcePageUrl})` : `Video "${title}" from Coverr`,
      licenseLabel: "Coverr API Terms",
      renditions
    };
  }

  private toRankedCandidate(item: NormalizedStockItem, brief: MaterialSourcingBrief): readonly RankedMaterialCandidate[] {
    if (item.durationSeconds !== undefined && item.durationSeconds < brief.minimumDurationSeconds) {
      return [];
    }
    const ranked = item.renditions
      .filter((rendition) => this.isSafeCandidateUri(rendition.uri))
      .map((rendition) => this.toCandidate(item, rendition, brief))
      .sort((left, right) => this.compareRanked(left, right));
    const best = ranked[0];
    return best ? [best] : [];
  }

  private toCandidate(
    item: NormalizedStockItem,
    rendition: StockRendition,
    brief: MaterialSourcingBrief
  ): RankedMaterialCandidate {
    const aspectRatio = this.aspectRatioForDimensions(rendition.width, rendition.height);
    const resolution = this.resolutionForHeight(rendition.height);
    const durationScore = item.durationSeconds === undefined
      ? 0
      : Math.max(0, 30 - Math.abs(item.durationSeconds - brief.targetDurationSeconds));
    const aspectScore = aspectRatio === brief.aspectRatio ? 12 : 0;
    const resolutionScore = resolution === brief.resolution ? 10 : this.resolutionMeetsTarget(resolution, brief.resolution) ? 6 : 0;
    const score = durationScore + aspectScore + resolutionScore + (rendition.quality === "hd" ? 4 : 0);
    const candidate: MaterialCandidate = {
      candidateId: createStableId(
        "material_candidate",
        `${this.source}:${brief.briefId}:${item.providerAssetId}:${rendition.uri}`
      ),
      briefId: brief.briefId,
      source: this.source,
      uri: rendition.uri,
      providerAssetId: item.providerAssetId,
      ...(item.sourcePageUrl ? { sourcePageUrl: item.sourcePageUrl } : {}),
      ...(item.previewUri ? { previewUri: item.previewUri } : {}),
      licenseLabel: item.licenseLabel,
      ...(item.durationSeconds !== undefined ? { durationSeconds: item.durationSeconds } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(resolution ? { resolution } : {}),
      rightsStatus: "requires_attribution",
      attribution: item.attribution,
      selected: true
    };
    return { candidate, score };
  }

  private compareRanked(left: RankedMaterialCandidate, right: RankedMaterialCandidate): number {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.candidate.candidateId.localeCompare(right.candidate.candidateId);
  }

  private async fetchJson(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal | undefined
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    const timeout = setTimeout(() => controller.abort(), this.settings.requestTimeoutMs);
    if (signal?.aborted) {
      controller.abort(signal.reason);
    } else {
      signal?.addEventListener("abort", abort, { once: true });
    }

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "CineJelly/0.1",
          ...headers
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`${this.source} stock search failed with HTTP ${response.status}.`);
      }
      const text = await response.text();
      if (text.length > MAX_STOCK_JSON_BYTES) {
        throw new Error(`${this.source} stock search response exceeded JSON size limit.`);
      }
      return JSON.parse(text) as unknown;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private queryForBrief(brief: MaterialSourcingBrief): string {
    return brief.queryTerms
      .slice()
      .sort((left, right) => right.weight - left.weight)
      .map((term) => this.normalizedTerm(term))
      .filter((term) => term.length > 0)
      .slice(0, 3)
      .join(" ")
      .slice(0, MAX_QUERY_LENGTH)
      .trim();
  }

  private normalizedTerm(term: MaterialSearchTerm): string {
    return term.term
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeSettings(settings: RemoteStockProviderSettings): RemoteStockProviderSettings {
    if (!settings.apiKey.trim()) {
      throw new Error("Remote stock provider apiKey must be configured.");
    }
    if (settings.requestTimeoutMs <= 0 || !Number.isSafeInteger(settings.requestTimeoutMs)) {
      throw new Error("Remote stock provider requestTimeoutMs must be a positive integer.");
    }
    if (settings.maxResultsPerBrief <= 0 || !Number.isSafeInteger(settings.maxResultsPerBrief)) {
      throw new Error("Remote stock provider maxResultsPerBrief must be a positive integer.");
    }
    if (settings.source === "coverr" && !settings.commercialUseApproved) {
      throw new Error("Coverr remote stock provider requires explicit commercialUseApproved=true.");
    }
    return settings;
  }

  private targetDimensions(aspectRatio: AspectRatio, resolution: Resolution): { readonly width: number; readonly height: number } {
    const height = this.resolutionHeight(resolution);
    switch (aspectRatio) {
      case "21:9":
        return { width: Math.round(height * 21 / 9), height };
      case "16:9":
      case "adaptive":
        return { width: Math.round(height * 16 / 9), height };
      case "4:3":
        return { width: Math.round(height * 4 / 3), height };
      case "1:1":
        return { width: height, height };
      case "3:4":
        return { width: Math.round(height * 3 / 4), height };
      case "9:16":
        return { width: Math.round(height * 9 / 16), height };
    }
  }

  private orientationForAspect(aspectRatio: AspectRatio): "landscape" | "portrait" | "square" | undefined {
    switch (aspectRatio) {
      case "21:9":
      case "16:9":
      case "4:3":
        return "landscape";
      case "9:16":
      case "3:4":
        return "portrait";
      case "1:1":
        return "square";
      case "adaptive":
        return undefined;
    }
  }

  private aspectRatioForDimensions(width: number | undefined, height: number | undefined): AspectRatio | undefined {
    if (!width || !height) {
      return undefined;
    }
    const ratio = width / height;
    const candidates: readonly { readonly value: AspectRatio; readonly ratio: number }[] = [
      { value: "21:9", ratio: 21 / 9 },
      { value: "16:9", ratio: 16 / 9 },
      { value: "4:3", ratio: 4 / 3 },
      { value: "1:1", ratio: 1 },
      { value: "3:4", ratio: 3 / 4 },
      { value: "9:16", ratio: 9 / 16 }
    ];
    const match = candidates
      .map((candidate) => ({ value: candidate.value, delta: Math.abs(candidate.ratio - ratio) }))
      .sort((left, right) => left.delta - right.delta)[0];
    return match && match.delta <= 0.12 ? match.value : "adaptive";
  }

  private resolutionForHeight(height: number | undefined): Resolution | undefined {
    if (!height) {
      return undefined;
    }
    if (height >= 1080) {
      return "1080p";
    }
    if (height >= 720) {
      return "720p";
    }
    return "480p";
  }

  private resolutionMeetsTarget(candidate: Resolution | undefined, target: Resolution): boolean {
    if (!candidate) {
      return false;
    }
    return this.resolutionHeight(candidate) >= this.resolutionHeight(target);
  }

  private resolutionHeight(resolution: Resolution): number {
    switch (resolution) {
      case "480p":
        return 480;
      case "720p":
        return 720;
      case "1080p":
        return 1080;
    }
  }

  private isSafeCandidateUri(uri: string): boolean {
    return this.safeOptionalHttps(uri) !== undefined;
  }

  private safeOptionalHttps(value: unknown): string | undefined {
    const text = this.optionalString(value);
    if (!text) {
      return undefined;
    }
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return undefined;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        return undefined;
      }
    }
    return text;
  }

  private optionalDuration(value: unknown): number | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    if (typeof value === "string") {
      const parts = value.split(":").map((part) => Number.parseFloat(part));
      if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
        return undefined;
      }
      if (parts.length === 3) {
        return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
      }
      if (parts.length === 2) {
        return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
      }
      return parts[0] && parts[0] > 0 ? parts[0] : undefined;
    }
    return undefined;
  }

  private optionalPositiveNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private optionalId(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return String(value);
    }
    return this.optionalString(value);
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }

  private array(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
  }
}
