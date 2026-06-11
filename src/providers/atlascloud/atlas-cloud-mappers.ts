/**
 * Atlas Cloud response mappers keep provider payload differences outside the core interfaces.
 * They accept loose JSON because Atlas model schemas can vary by selected model.
 */

import type {
  AssetRegistration,
  AssetStatus,
  Prediction,
  PredictionStatus,
  ProviderUsage
} from "../../types/provider.js";

type JsonObject = Record<string, unknown>;

const OUTPUT_CONTAINER_KEYS = [
  "output",
  "outputs",
  "result",
  "results",
  "data",
  "video",
  "videos",
  "file",
  "files",
  "media"
];

const OUTPUT_URL_KEYS = [
  "output_urls",
  "outputUrls",
  "urls",
  "url",
  "video_url",
  "videoUrl",
  "video",
  "download_url",
  "downloadUrl",
  "signed_url",
  "signedUrl",
  "asset_url",
  "assetUrl"
];

function readString(payload: JsonObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumber(payload: JsonObject, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readOutputUrls(payload: JsonObject): readonly string[] {
  const urls = new Set<string>();
  collectOutputUrls(payload, urls, 0);
  return [...urls];
}

function collectOutputUrls(value: unknown, urls: Set<string>, depth: number): void {
  if (depth > 4 || value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    if (isLikelyMediaOutputUrl(value)) {
      urls.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectOutputUrls(item, urls, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const payload = value as JsonObject;
  for (const key of OUTPUT_URL_KEYS) {
    collectOutputUrls(payload[key], urls, depth + 1);
  }
  for (const key of OUTPUT_CONTAINER_KEYS) {
    collectOutputUrls(payload[key], urls, depth + 1);
  }
}

function isLikelyMediaOutputUrl(value: string): boolean {
  if (!value.trim()) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function mapPredictionStatus(value: unknown): PredictionStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (["queued", "pending", "created"].includes(normalized)) {
    return "queued";
  }
  if (["running", "processing", "in_progress", "starting"].includes(normalized)) {
    return "running";
  }
  if (["succeeded", "success", "completed", "complete"].includes(normalized)) {
    return "succeeded";
  }
  if (["canceled", "cancelled"].includes(normalized)) {
    return "canceled";
  }
  if (["failed", "error"].includes(normalized)) {
    return "failed";
  }
  return "running";
}

export function mapAssetStatus(value: unknown): AssetStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (["active", "ready", "succeeded", "success", "completed"].includes(normalized)) {
    return "active";
  }
  if (["failed", "error", "invalid"].includes(normalized)) {
    return "failed";
  }
  if (["deleted", "removed"].includes(normalized)) {
    return "deleted";
  }
  if (["processing", "running", "in_progress"].includes(normalized)) {
    return "processing";
  }
  return "pending";
}

export function mapUsage(payload: JsonObject): ProviderUsage | undefined {
  const usage = payload.usage && typeof payload.usage === "object" ? (payload.usage as JsonObject) : payload;
  const inputTokens = readNumber(usage, ["prompt_tokens", "input_tokens"]);
  const outputTokens = readNumber(usage, ["completion_tokens", "output_tokens"]);
  const totalTokens = readNumber(usage, ["total_tokens"]);
  const estimatedCostUsd = readNumber(usage, ["estimated_cost_usd", "estimatedCostUsd"]);
  const actualCostUsd = readNumber(usage, ["cost_usd", "actual_cost_usd", "actualCostUsd"]);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    estimatedCostUsd === undefined &&
    actualCostUsd === undefined
  ) {
    return undefined;
  }

  const usageResult: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
  } = {};
  if (inputTokens !== undefined) {
    usageResult.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    usageResult.outputTokens = outputTokens;
  }
  if (totalTokens !== undefined) {
    usageResult.totalTokens = totalTokens;
  }
  if (estimatedCostUsd !== undefined) {
    usageResult.estimatedCostUsd = estimatedCostUsd;
  }
  if (actualCostUsd !== undefined) {
    usageResult.actualCostUsd = actualCostUsd;
  }
  return usageResult;
}

export function mapPrediction(payload: unknown, modelId: string, submittedAt: Date): Prediction {
  const objectPayload = payload && typeof payload === "object" ? (payload as JsonObject) : {};
  const predictionId =
    readString(objectPayload, ["id", "prediction_id", "predictionId", "task_id", "request_id"]) ?? "unknown";
  const status = mapPredictionStatus(objectPayload.status);
  const completedAt = status === "succeeded" || status === "failed" || status === "canceled" ? new Date() : undefined;

  const prediction: Prediction = {
    provider: "atlascloud",
    predictionId,
    modelId,
    status,
    outputUrls: readOutputUrls(objectPayload),
    raw: payload,
    submittedAt
  };
  const usage = mapUsage(objectPayload);
  if (completedAt) {
    if (usage) {
      return {
        ...prediction,
        completedAt,
        latencyMs: Math.max(0, completedAt.getTime() - submittedAt.getTime()),
        usage
      };
    }
    return {
      ...prediction,
      completedAt,
      latencyMs: Math.max(0, completedAt.getTime() - submittedAt.getTime())
    };
  }
  return usage ? { ...prediction, usage } : prediction;
}

export function mapAssetRegistration(payload: unknown): AssetRegistration {
  const objectPayload = payload && typeof payload === "object" ? (payload as JsonObject) : {};
  const assetId = readString(objectPayload, ["asset_id", "assetId", "id"]) ?? "unknown";
  const uri = readString(objectPayload, ["uri", "url", "asset_url", "assetUrl"]);

  return {
    provider: "atlascloud",
    assetId,
    status: mapAssetStatus(objectPayload.status),
    ...(uri ? { uri } : {}),
    raw: payload
  };
}

export function readChatContent(payload: unknown): string {
  const objectPayload = payload && typeof payload === "object" ? (payload as JsonObject) : {};
  const choices = objectPayload.choices;
  if (Array.isArray(choices)) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === "object") {
      const message = (firstChoice as JsonObject).message;
      if (message && typeof message === "object") {
        const content = (message as JsonObject).content;
        if (typeof content === "string") {
          return content;
        }
      }
      const text = (firstChoice as JsonObject).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }
  const content = objectPayload.content;
  return typeof content === "string" ? content : "";
}
