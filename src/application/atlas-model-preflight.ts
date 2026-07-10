/**
 * Pre-spend Atlas model validation.
 *
 * RuntimePreflight only checks that model-id env vars are present and well-FORMED — a stale but
 * well-formed id (e.g. a model that was renamed/removed on the account) passes every readiness gate
 * and only fails at the first LIVE provider call, after burning the LLM plan call and any keyframe
 * images (final live-audit gap #6/#11/#12). This probe lists the account's actually-available model
 * ids (a no-spend GET /models on each endpoint) and reports any configured id that is missing, so a
 * bad model config fails cheaply BEFORE paid work starts.
 *
 * It fails OPEN on a probe/network error (returns ok with a note) so a transient /models hiccup never
 * blocks a legitimate render — it only blocks on a CONFIRMED-missing model id.
 */

import type { AtlasCloudRuntimeSettings } from "../types/settings.js";

export interface MissingModel {
  readonly field: "llmModel" | "seedanceStandardModel" | "seedanceFastModel" | "imageModel";
  readonly modelId: string;
  readonly endpoint: "llm" | "media";
}

export interface AtlasModelValidationResult {
  readonly ok: boolean;
  readonly checkedModelCount: number;
  readonly missing: readonly MissingModel[];
  readonly probeSkipped: boolean;
  readonly notes: readonly string[];
}

async function fetchModelIds(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<Set<string> | undefined> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      ...(signal ? { signal } : {})
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { data?: unknown; models?: unknown };
    const rows = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
    const ids = new Set<string>();
    for (const row of rows) {
      const id = row && typeof row === "object" ? (row as Record<string, unknown>).id ?? (row as Record<string, unknown>).model : undefined;
      if (typeof id === "string" && id.trim()) {
        ids.add(id.trim());
      }
    }
    return ids;
  } catch {
    return undefined;
  }
}

export async function validateConfiguredAtlasModels(
  settings: AtlasCloudRuntimeSettings,
  signal?: AbortSignal
): Promise<AtlasModelValidationResult> {
  const [llmIds, mediaIds] = await Promise.all([
    fetchModelIds(settings.apiBaseUrl, settings.llmApiKey ?? settings.apiKey, signal),
    fetchModelIds(settings.assetBaseUrl, settings.apiKey, signal)
  ]);

  const notes: string[] = [];
  if (!llmIds) {
    notes.push("Could not list LLM models (GET {apiBaseUrl}/models); llmModel existence not verified.");
  }
  if (!mediaIds) {
    notes.push("Could not list media models (GET {assetBaseUrl}/models); video/image model existence not verified.");
  }

  const missing: MissingModel[] = [];
  let checked = 0;
  const checkLlm = (field: MissingModel["field"], id: string | undefined): void => {
    if (!id || !llmIds) {
      return;
    }
    checked += 1;
    if (!llmIds.has(id)) {
      missing.push({ field, modelId: id, endpoint: "llm" });
    }
  };
  const checkMedia = (field: MissingModel["field"], id: string | undefined): void => {
    if (!id || !mediaIds) {
      return;
    }
    checked += 1;
    if (!mediaIds.has(id)) {
      missing.push({ field, modelId: id, endpoint: "media" });
    }
  };

  checkLlm("llmModel", settings.models.llmModel);
  checkMedia("seedanceStandardModel", settings.models.seedanceStandardModel);
  checkMedia("seedanceFastModel", settings.models.seedanceFastModel);
  checkMedia("imageModel", settings.models.imageModel);

  return {
    ok: missing.length === 0,
    checkedModelCount: checked,
    missing,
    probeSkipped: !llmIds && !mediaIds,
    notes
  };
}
