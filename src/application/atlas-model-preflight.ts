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
  readonly field:
    | "llmModel"
    | "creativeLlmModel"
    | "seedanceStandardModel"
    | "seedanceFastModel"
    | "imageModel"
    | "imageReferenceModel"
    | "avatarModel"
    | "ttsModel"
    | "speechModel";
  readonly modelId: string;
  readonly endpoint: "llm" | "media";
}

export interface AtlasModelValidationResult {
  readonly ok: boolean;
  readonly checkedModelCount: number;
  readonly missing: readonly MissingModel[];
  readonly probeSkipped: boolean;
  /** True when Atlas rejected the API key (HTTP 401/403) — a wrong/expired key, not a network blip. */
  readonly keyAuthFailed: boolean;
  readonly notes: readonly string[];
}

type ModelListResult =
  | { readonly status: "ok"; readonly ids: Set<string> }
  | { readonly status: "auth_failed" }
  | { readonly status: "unreachable" };

async function fetchModelIds(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<ModelListResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      ...(signal ? { signal } : {})
    });
    // 401/403 = the key itself is wrong/expired — a distinct, actionable failure (vs a network blip).
    if (response.status === 401 || response.status === 403) {
      return { status: "auth_failed" };
    }
    if (!response.ok) {
      return { status: "unreachable" };
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
    return { status: "ok", ids };
  } catch {
    return { status: "unreachable" };
  }
}

export async function validateConfiguredAtlasModels(
  settings: AtlasCloudRuntimeSettings,
  signal?: AbortSignal
): Promise<AtlasModelValidationResult> {
  const [llm, media] = await Promise.all([
    fetchModelIds(settings.apiBaseUrl, settings.llmApiKey ?? settings.apiKey, signal),
    fetchModelIds(settings.assetBaseUrl, settings.apiKey, signal)
  ]);
  const llmIds = llm.status === "ok" ? llm.ids : undefined;
  const mediaIds = media.status === "ok" ? media.ids : undefined;
  const keyAuthFailed = llm.status === "auth_failed" || media.status === "auth_failed";

  const notes: string[] = [];
  if (keyAuthFailed) {
    notes.push("Atlas rejected the API key (401/403): ATLASCLOUD_API_KEY sai hoặc hết hạn.");
  }
  if (!llmIds && !keyAuthFailed) {
    notes.push("Could not list LLM models (GET {apiBaseUrl}/models); llmModel existence not verified.");
  }
  if (!mediaIds && !keyAuthFailed) {
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
  checkLlm("creativeLlmModel", settings.models.creativeLlmModel);
  checkMedia("seedanceStandardModel", settings.models.seedanceStandardModel);
  checkMedia("seedanceFastModel", settings.models.seedanceFastModel);
  checkMedia("imageModel", settings.models.imageModel);
  checkMedia("imageReferenceModel", settings.models.imageReferenceModel);
  checkMedia("avatarModel", settings.models.avatarModel);
  checkMedia("ttsModel", settings.models.ttsModel);
  checkMedia("speechModel", settings.models.speechModel);

  return {
    ok: missing.length === 0 && !keyAuthFailed,
    checkedModelCount: checked,
    missing,
    probeSkipped: !llmIds && !mediaIds,
    keyAuthFailed,
    notes
  };
}
