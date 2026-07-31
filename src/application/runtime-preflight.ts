/**
 * Runtime preflight for deployment readiness.
 * It checks required environment configuration and local media tool availability without exposing secrets.
 */

import { constants } from "node:fs";
import { access, mkdir, readFile, statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { RenderJobHistoryStore } from "../api/render-job-history-store.js";
import { FileRenderProviderHandoffLeaseStore } from "../api/render-provider-handoff.js";
import { readRenderProviderLeasePath } from "../api/render-provider-handoff-lease-service.js";
import { parseApiClientPoliciesJson } from "../api/api-client-policy.js";
import { readProductionGraphResumeQueuePath } from "../api/production-graph-resume-queue-service.js";
import {
  readShortChannelStyleLibraryPath,
  ShortChannelStyleLibraryStore
} from "../api/short-channel-style-library-store.js";
import {
  readShortPipelineSessionStorePath,
  ShortPipelineSessionStore
} from "../api/short-pipeline-session-store.js";
import { GeneratedAudioAssetResolver } from "../core/generated-audio-asset-resolver.js";
import { LocalMaterialLibraryAdapter } from "../core/local-material-library-adapter.js";
import { FileProductionGraphResumeQueueStore } from "../core/production-graph-resume-state.js";
import type { LocalMaterialCatalog } from "../types/material.js";
import type { PreflightCheck, PreflightStatus, RuntimePreflightReport } from "../types/preflight.js";
import {
  mediaToolCommandHasControlCharacters,
  mediaToolEnvName,
  normalizeMediaToolCommand,
  readMediaToolCommand,
  type MediaToolName
} from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ATLAS_CANONICAL_HOST = "api.atlascloud.ai";
const ATLAS_LLM_PATH = "/v1";
const ATLAS_MEDIA_PATH = "/api/v1";
const ATLAS_PUBLIC_BILLING_PATH = "/public/v1";
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const DEFAULT_SOURCE_VIDEO_ANALYSIS_WORK_DIR = "assets/output_deliverables/source-video-analysis-work";

export class RuntimePreflight {
  private readonly env: NodeJS.ProcessEnv;

  public constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  public async run(signal?: AbortSignal): Promise<RuntimePreflightReport> {
    const checks: PreflightCheck[] = [
      this.present("ATLASCLOUD_API_KEY", this.env.ATLASCLOUD_API_KEY),
      this.optionalSecret("ATLASCLOUD_LLM_API_KEY", this.env.ATLASCLOUD_LLM_API_KEY),
      this.present("ATLASCLOUD_LLM_MODEL", this.env.ATLASCLOUD_LLM_MODEL),
      this.present("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", this.env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL),
      this.present("ATLASCLOUD_SEEDANCE_FAST_MODEL", this.env.ATLASCLOUD_SEEDANCE_FAST_MODEL),
      this.optionalModelId("ATLASCLOUD_SEEDANCE_MINI_MODEL", this.env.ATLASCLOUD_SEEDANCE_MINI_MODEL),
      // Feature models: each gates an ADVANCED capability. Absent = that feature is simply off
      // (never a hard fail), but the operator must see WHICH features are live before launch —
      // e.g. a missing ATLASCLOUD_SPEECH_MODEL silently 503s the whole Dub/Subtitle surface.
      this.featureModel("ATLASCLOUD_IMAGE_MODEL", this.env.ATLASCLOUD_IMAGE_MODEL, "Keyframe-first ảnh mở đầu (khóa nhận diện nhân vật/sản phẩm)"),
      this.featureModel("ATLASCLOUD_IMAGE_REFERENCE_MODEL", this.env.ATLASCLOUD_IMAGE_REFERENCE_MODEL, "Keyframe theo ảnh tham chiếu tải lên"),
      this.featureModel("ATLASCLOUD_AVATAR_MODEL", this.env.ATLASCLOUD_AVATAR_MODEL, "Cảnh nhân vật nói — avatar khớp môi (OmniHuman)"),
      this.featureModel("ATLASCLOUD_TTS_MODEL", this.env.ATLASCLOUD_TTS_MODEL, "Đọc giọng thuyết minh (TTS) cho talking-shot + lồng tiếng video"),
      this.featureModel("ATLASCLOUD_SPEECH_MODEL", this.env.ATLASCLOUD_SPEECH_MODEL, "Lồng tiếng / Phụ đề: nhận dạng giọng nói (STT) từ video có sẵn"),
      this.apiAuthCheck(),
      this.optionalPort("PORT", this.env.PORT),
      this.optionalAtlasEndpointUrl("ATLASCLOUD_LLM_BASE_URL", this.env.ATLASCLOUD_LLM_BASE_URL, ATLAS_LLM_PATH),
      this.optionalAtlasEndpointUrl("ATLASCLOUD_API_BASE_URL", this.env.ATLASCLOUD_API_BASE_URL, ATLAS_LLM_PATH),
      this.optionalAtlasEndpointUrl("ATLASCLOUD_MEDIA_BASE_URL", this.env.ATLASCLOUD_MEDIA_BASE_URL, ATLAS_MEDIA_PATH),
      this.optionalAtlasEndpointUrl("ATLASCLOUD_BASE_URL", this.env.ATLASCLOUD_BASE_URL, ATLAS_MEDIA_PATH),
      this.optionalAtlasEndpointUrl("ATLASCLOUD_ASSET_BASE_URL", this.env.ATLASCLOUD_ASSET_BASE_URL, ATLAS_MEDIA_PATH),
      this.atlasCloudDocsConformanceCheck(),
      this.optionalPositiveInteger("CINEJELLY_REQUEST_TIMEOUT_MS", this.env.CINEJELLY_REQUEST_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES", this.env.CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES),
      this.optionalPositiveInteger("CINEJELLY_POLLING_INTERVAL_MS", this.env.CINEJELLY_POLLING_INTERVAL_MS),
      this.optionalPositiveInteger("CINEJELLY_POLLING_TIMEOUT_MS", this.env.CINEJELLY_POLLING_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_RENDER_CONCURRENCY", this.env.CINEJELLY_RENDER_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_SYNC_RENDER_CONCURRENCY", this.env.CINEJELLY_API_SYNC_RENDER_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_CONCURRENCY", this.env.CINEJELLY_API_JOB_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_HISTORY_LIMIT", this.env.CINEJELLY_API_JOB_HISTORY_LIMIT),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_QUEUE_LIMIT", this.env.CINEJELLY_API_JOB_QUEUE_LIMIT),
      this.optionalPositiveInteger("CINEJELLY_RENDER_PROVIDER_LEASE_MAX_RECORDS", this.env.CINEJELLY_RENDER_PROVIDER_LEASE_MAX_RECORDS),
      this.optionalPositiveInteger("CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_MAX_RECORDS", this.env.CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_MAX_RECORDS),
      this.optionalPositiveInteger("CINEJELLY_API_MAX_BODY_BYTES", this.env.CINEJELLY_API_MAX_BODY_BYTES),
      this.optionalPositiveInteger("CINEJELLY_API_RATE_LIMIT_WINDOW_MS", this.env.CINEJELLY_API_RATE_LIMIT_WINDOW_MS),
      this.optionalPositiveInteger("CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS", this.env.CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS),
      this.optionalBooleanFlag("CINEJELLY_DISABLE_API_RATE_LIMIT", this.env.CINEJELLY_DISABLE_API_RATE_LIMIT),
      this.optionalBooleanFlag("CINEJELLY_TRUST_PROXY_HEADERS", this.env.CINEJELLY_TRUST_PROXY_HEADERS),
      this.optionalBooleanFlag("CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER", this.env.CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER),
      this.clientPolicyCheck(),
      this.optionalPositiveInteger("CINEJELLY_MAX_USER_INPUT_CHARS", this.env.CINEJELLY_MAX_USER_INPUT_CHARS),
      this.optionalPositiveInteger("CINEJELLY_MAX_REFERENCES", this.env.CINEJELLY_MAX_REFERENCES),
      this.optionalPositiveInteger("CINEJELLY_MAX_CAPTION_CUES", this.env.CINEJELLY_MAX_CAPTION_CUES),
      this.optionalPositiveInteger("CINEJELLY_MAX_AUDIO_TRACKS", this.env.CINEJELLY_MAX_AUDIO_TRACKS),
      this.optionalPositiveInteger("CINEJELLY_MAX_GENERATED_AUDIO_INTENTS", this.env.CINEJELLY_MAX_GENERATED_AUDIO_INTENTS),
      this.optionalPositiveInteger("CINEJELLY_MAX_METADATA_ENTRIES", this.env.CINEJELLY_MAX_METADATA_ENTRIES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_SCENES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_SCENES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE", this.env.CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_NOTES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_NOTES),
      this.optionalPositiveInteger("CINEJELLY_MAX_RENDERED_CLIP_BYTES", this.env.CINEJELLY_MAX_RENDERED_CLIP_BYTES),
      this.optionalPositiveInteger("CINEJELLY_MAX_AUDIO_TRACK_BYTES", this.env.CINEJELLY_MAX_AUDIO_TRACK_BYTES),
      this.optionalBooleanFlag("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS", this.env.CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS),
      this.optionalPositiveInteger("CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS", this.env.CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF", this.env.CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF),
      this.optionalBooleanFlag("CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED", this.env.CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED),
      this.remoteStockMaterialCheck(),
      this.optionalBooleanFlag("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS", this.env.CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS),
      this.optionalPositiveInteger(
        "CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS",
        this.env.CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS
      ),
      this.optionalPositiveInteger("CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES", this.env.CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES),
      this.optionalBooleanFlag("CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR", this.env.CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR),
      this.optionalNonNegativeNumber("CINEJELLY_RENDER_COST_USD_PER_SECOND", this.env.CINEJELLY_RENDER_COST_USD_PER_SECOND),
      this.optionalNonNegativeNumber("CINEJELLY_ASSET_REGISTRATION_COST_USD", this.env.CINEJELLY_ASSET_REGISTRATION_COST_USD),
      this.optionalNonNegativeNumber("CINEJELLY_LLM_PLAN_COST_USD", this.env.CINEJELLY_LLM_PLAN_COST_USD),
      this.optionalPositiveNumber("CINEJELLY_COST_BUFFER_MULTIPLIER", this.env.CINEJELLY_COST_BUFFER_MULTIPLIER),
      this.capabilityCheck(this.env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON),
      this.generatedAudioCapabilityCheck(this.env.ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON)
    ];

    checks.push(await this.outputDirectoryCheck("CINEJELLY_OUTPUT_DIR", this.env.CINEJELLY_OUTPUT_DIR));
    checks.push(await this.databaseBackendCheck());
    checks.push(await this.freeDiskCheck());
    checks.push(await this.shortPipelineSessionStoreCheck());
    checks.push(await this.shortChannelStyleLibraryStoreCheck());
    checks.push(await this.renderJobHistoryStoreCheck());
    checks.push(await this.renderProviderLeaseStoreCheck());
    checks.push(await this.productionGraphResumeQueueStoreCheck());
    checks.push(await this.sourceVideoAutoAnalysisCheck());
    checks.push(await this.localMaterialCatalogCheck(
      "CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH",
      this.env.CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH
    ));
    checks.push(await this.generatedAudioAssetResolutionCatalogCheck(
      "CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH",
      this.env.CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH
    ));
    checks.push(await this.mediaToolCheck("ffmpeg", signal));
    checks.push(await this.mediaToolCheck("ffprobe", signal));

    return {
      status: this.rollup(checks),
      checkedAt: new Date(),
      checks
    };
  }

  private async localMaterialCatalogCheck(name: string, value: string | undefined): Promise<PreflightCheck> {
    const configured = value?.trim();
    if (!configured) {
      return {
        name,
        status: "pass",
        message: `${name} is not set; local material adapter is disabled.`
      };
    }
    if (/[\u0000-\u001f\u007f]/.test(configured)) {
      return { name, status: "fail", message: `${name} must not contain control characters.` };
    }
    try {
      const text = await readFile(configured, "utf8");
      const parsed = JSON.parse(text) as unknown;
      const catalog = this.catalogRecord(parsed);
      new LocalMaterialLibraryAdapter({ catalog: catalog as LocalMaterialCatalog });
      return {
        name,
        status: "pass",
        message: `${catalog.entries.length} local material catalog entr${catalog.entries.length === 1 ? "y" : "ies"} configured.`
      };
    } catch (error) {
      return {
        name,
        status: "fail",
        message: error instanceof Error
          ? `${name} must point to a readable valid local material catalog JSON file: ${error.message}`
          : `${name} must point to a readable valid local material catalog JSON file.`
      };
    }
  }

  private catalogRecord(value: unknown): { readonly catalogId?: string; readonly entries: readonly unknown[] } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Catalog must be a JSON object.");
    }
    const payload = value as Record<string, unknown>;
    if (payload.catalogId !== undefined && typeof payload.catalogId !== "string") {
      throw new Error("catalogId must be a string when set.");
    }
    if (!Array.isArray(payload.entries)) {
      throw new Error("entries must be an array.");
    }
    return {
      ...(typeof payload.catalogId === "string" ? { catalogId: payload.catalogId } : {}),
      entries: payload.entries
    };
  }

  private async generatedAudioAssetResolutionCatalogCheck(
    name: string,
    value: string | undefined
  ): Promise<PreflightCheck> {
    const configured = value?.trim();
    if (!configured) {
      return {
        name,
        status: "pass",
        message: `${name} is not set; generated-audio asset resolution catalog is disabled.`
      };
    }
    if (/[\u0000-\u001f\u007f]/.test(configured)) {
      return { name, status: "fail", message: `${name} must not contain control characters.` };
    }
    try {
      const text = await readFile(configured, "utf8");
      const parsed = JSON.parse(text) as unknown;
      const catalog = GeneratedAudioAssetResolver.normalizeCatalog(parsed);
      return {
        name,
        status: "pass",
        message: `${catalog.entries.length} generated-audio asset resolution entr${catalog.entries.length === 1 ? "y" : "ies"} configured.`
      };
    } catch (error) {
      return {
        name,
        status: "fail",
        message: error instanceof Error
          ? `${name} must point to a readable valid generated-audio asset resolution catalog JSON file: ${error.message}`
          : `${name} must point to a readable valid generated-audio asset resolution catalog JSON file.`
      };
    }
  }

  private async renderJobHistoryStoreCheck(): Promise<PreflightCheck> {
    const configured = this.env.CINEJELLY_API_JOB_HISTORY_PATH?.trim();
    if (!configured) {
      return {
        name: "CINEJELLY_API_JOB_HISTORY_PATH",
        status: "pass",
        message: "CINEJELLY_API_JOB_HISTORY_PATH is not set; async job history is in-memory only."
      };
    }
    if (/[\u0000-\u001f\u007f]/.test(configured)) {
      return {
        name: "CINEJELLY_API_JOB_HISTORY_PATH",
        status: "fail",
        message: "CINEJELLY_API_JOB_HISTORY_PATH must not contain control characters."
      };
    }
    try {
      const historyPath = resolve(configured);
      await mkdir(dirname(historyPath), { recursive: true });
      await access(dirname(historyPath), constants.W_OK);
      new RenderJobHistoryStore({ historyPath }).load();
      return {
        name: "CINEJELLY_API_JOB_HISTORY_PATH",
        status: "pass",
        message: "CINEJELLY_API_JOB_HISTORY_PATH points to a writable compact job-history file."
      };
    } catch (error) {
      return {
        name: "CINEJELLY_API_JOB_HISTORY_PATH",
        status: "fail",
        message: error instanceof Error
          ? `CINEJELLY_API_JOB_HISTORY_PATH is not usable: ${error.message}`
          : "CINEJELLY_API_JOB_HISTORY_PATH is not usable."
      };
    }
  }

  private async shortPipelineSessionStoreCheck(): Promise<PreflightCheck> {
    let storePath: string;
    try {
      storePath = readShortPipelineSessionStorePath(this.env);
    } catch (error) {
      return {
        name: "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
        status: "fail",
        message: error instanceof Error ? error.message : "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH is invalid."
      };
    }
    try {
      await mkdir(dirname(resolve(storePath)), { recursive: true });
      await access(dirname(resolve(storePath)), constants.W_OK);
      new ShortPipelineSessionStore({ storePath }).loadRecords();
      return {
        name: "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
        status: "pass",
        message: this.env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH?.trim()
          ? "Short pipeline session store points to a writable redacted session file."
          : "Short pipeline session store uses the default writable file under CINEJELLY_OUTPUT_DIR."
      };
    } catch (error) {
      return {
        name: "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
        status: "fail",
        message: error instanceof Error
          ? `Short pipeline session store is not usable: ${error.message}`
          : "Short pipeline session store is not usable."
      };
    }
  }

  private async shortChannelStyleLibraryStoreCheck(): Promise<PreflightCheck> {
    let storePath: string;
    try {
      storePath = readShortChannelStyleLibraryPath(this.env);
    } catch (error) {
      return {
        name: "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
        status: "fail",
        message: error instanceof Error ? error.message : "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH is invalid."
      };
    }
    try {
      await mkdir(dirname(resolve(storePath)), { recursive: true });
      await access(dirname(resolve(storePath)), constants.W_OK);
      new ShortChannelStyleLibraryStore({ storePath }).loadRecords();
      return {
        name: "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
        status: "pass",
        message: this.env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH?.trim()
          ? "Short channel-style library points to a writable redacted profile file."
          : "Short channel-style library uses the default writable file under CINEJELLY_OUTPUT_DIR."
      };
    } catch (error) {
      return {
        name: "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
        status: "fail",
        message: error instanceof Error
          ? `Short channel-style library is not usable: ${error.message}`
          : "Short channel-style library is not usable."
      };
    }
  }

  private async renderProviderLeaseStoreCheck(): Promise<PreflightCheck> {
    let leasePath: string | undefined;
    try {
      leasePath = readRenderProviderLeasePath(this.env);
    } catch (error) {
      return {
        name: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH",
        status: "fail",
        message: error instanceof Error ? error.message : "CINEJELLY_RENDER_PROVIDER_LEASE_PATH is invalid."
      };
    }
    if (!leasePath) {
      return {
        name: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH",
        status: "pass",
        message: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH is not set; render-provider lease service is disabled."
      };
    }
    try {
      await mkdir(dirname(leasePath), { recursive: true });
      await access(dirname(leasePath), constants.W_OK);
      await new FileRenderProviderHandoffLeaseStore({ leasePath }).listLeases();
      return {
        name: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH",
        status: "pass",
        message: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH points to a writable render-provider lease file."
      };
    } catch (error) {
      return {
        name: "CINEJELLY_RENDER_PROVIDER_LEASE_PATH",
        status: "fail",
        message: error instanceof Error
          ? `CINEJELLY_RENDER_PROVIDER_LEASE_PATH is not usable: ${error.message}`
          : "CINEJELLY_RENDER_PROVIDER_LEASE_PATH is not usable."
      };
    }
  }

  private async productionGraphResumeQueueStoreCheck(): Promise<PreflightCheck> {
    let queuePath: string | undefined;
    try {
      queuePath = readProductionGraphResumeQueuePath(this.env);
    } catch (error) {
      return {
        name: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH",
        status: "fail",
        message: error instanceof Error ? error.message : "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH is invalid."
      };
    }
    if (!queuePath) {
      return {
        name: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH",
        status: "pass",
        message: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH is not set; Production Graph resume queue service is disabled."
      };
    }
    try {
      await mkdir(dirname(queuePath), { recursive: true });
      await access(dirname(queuePath), constants.W_OK);
      await new FileProductionGraphResumeQueueStore({ queuePath }).list();
      return {
        name: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH",
        status: "pass",
        message: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH points to a writable Production Graph resume queue file."
      };
    } catch (error) {
      return {
        name: "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH",
        status: "fail",
        message: error instanceof Error
          ? `CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH is not usable: ${error.message}`
          : "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH is not usable."
      };
    }
  }

  private remoteStockMaterialCheck(): PreflightCheck {
    const enabled = this.booleanEnv("CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS", this.env.CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS);
    if (enabled === "invalid") {
      return {
        name: "remote_stock_materials",
        status: "fail",
        message: "CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS must be true or false when set."
      };
    }
    if (!enabled) {
      return {
        name: "remote_stock_materials",
        status: "pass",
        message: "Remote stock material adapters are disabled."
      };
    }

    const providers: string[] = [];
    const keyFailures: string[] = [];
    this.collectRemoteProvider("PEXELS_API_KEY", "pexels", providers, keyFailures);
    this.collectRemoteProvider("PIXABAY_API_KEY", "pixabay", providers, keyFailures);
    const coverrApproved = this.booleanEnv(
      "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED",
      this.env.CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED
    );
    if (coverrApproved === "invalid") {
      return {
        name: "remote_stock_materials",
        status: "fail",
        message: "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED must be true or false when set."
      };
    }
    if (coverrApproved) {
      this.collectRemoteProvider("COVERR_API_KEY", "coverr", providers, keyFailures);
    }
    if (keyFailures.length > 0) {
      return {
        name: "remote_stock_materials",
        status: "fail",
        message: `Remote stock provider key configuration is invalid for ${keyFailures.join(", ")}.`
      };
    }
    if (providers.length === 0) {
      return {
        name: "remote_stock_materials",
        status: "fail",
        message: "Remote stock material adapters are enabled but no approved provider key is configured."
      };
    }
    return {
      name: "remote_stock_materials",
      status: "pass",
      message: `Remote stock material adapters configured for ${providers.join(", ")}.`
    };
  }

  private clientPolicyCheck(): PreflightCheck {
    const requireClientPolicy = this.booleanEnv(
      "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER",
      this.env.CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER
    );
    if (requireClientPolicy === "invalid") {
      return {
        name: "api_client_policy",
        status: "fail",
        message: "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER must be true or false when set."
      };
    }
    let policies: ReturnType<typeof parseApiClientPoliciesJson>;
    try {
      policies = parseApiClientPoliciesJson(this.env.CINEJELLY_API_CLIENTS_JSON);
    } catch (error) {
      return {
        name: "api_client_policy",
        status: "fail",
        message: error instanceof Error ? error.message : "CINEJELLY_API_CLIENTS_JSON is invalid."
      };
    }
    if (policies.length === 0) {
      return requireClientPolicy
        ? {
            name: "api_client_policy",
            status: "fail",
            message: "CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER is true but CINEJELLY_API_CLIENTS_JSON has no clients."
          }
        : {
            name: "api_client_policy",
            status: "pass",
            message: "CINEJELLY_API_CLIENTS_JSON is not set; per-client render quota policy is disabled."
          };
    }
    const enabledCount = policies.filter((policy) => policy.enabled).length;
    if (enabledCount === 0) {
      return {
        name: "api_client_policy",
        status: "fail",
        message: "CINEJELLY_API_CLIENTS_JSON is configured but every client is disabled."
      };
    }
    const usageLedgerPath = this.env.CINEJELLY_CLIENT_USAGE_LEDGER_PATH?.trim();
    if (usageLedgerPath && /[\u0000-\u001f\u007f]/.test(usageLedgerPath)) {
      return {
        name: "api_client_policy",
        status: "fail",
        message: "CINEJELLY_CLIENT_USAGE_LEDGER_PATH must not contain control characters."
      };
    }
    if (requireClientPolicy && !usageLedgerPath) {
      return {
        name: "api_client_policy",
        status: "warn",
        message: `${enabledCount} enabled API client polic${enabledCount === 1 ? "y" : "ies"} configured, but CINEJELLY_CLIENT_USAGE_LEDGER_PATH is not set; quota reservations are in-memory only.`
      };
    }
    return {
      name: "api_client_policy",
      status: "pass",
      message: `${enabledCount} enabled API client polic${enabledCount === 1 ? "y" : "ies"} configured.`
    };
  }

  private async sourceVideoAutoAnalysisCheck(): Promise<PreflightCheck> {
    const enabled = this.booleanEnv(
      "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS",
      this.env.CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS
    );
    if (enabled === "invalid") {
      return {
        name: "source_video_auto_analysis",
        status: "fail",
        message: "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS must be true or false when set."
      };
    }
    const workDirectory = this.env.CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR?.trim();
    if (!enabled) {
      if (workDirectory && /[\u0000-\u001f\u007f]/.test(workDirectory)) {
        return {
          name: "source_video_auto_analysis",
          status: "fail",
          message: "CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR must not contain control characters."
        };
      }
      return {
        name: "source_video_auto_analysis",
        status: "pass",
        message: "Source-video auto analysis is disabled."
      };
    }
    const directoryCheck = await this.outputDirectoryCheck(
      "CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR",
      workDirectory || DEFAULT_SOURCE_VIDEO_ANALYSIS_WORK_DIR
    );
    if (directoryCheck.status === "fail") {
      return {
        name: "source_video_auto_analysis",
        status: "fail",
        message: directoryCheck.message
      };
    }
    return {
      name: "source_video_auto_analysis",
      status: "pass",
      message: "Source-video auto analysis is enabled and the frame work directory is writable."
    };
  }

  private collectRemoteProvider(
    envName: string,
    provider: string,
    providers: string[],
    keyFailures: string[]
  ): void {
    const value = this.env[envName]?.trim();
    if (!value) {
      return;
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      keyFailures.push(provider);
      return;
    }
    providers.push(provider);
  }

  private booleanEnv(_name: string, value: string | undefined): boolean | "invalid" {
    if (!value?.trim()) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      return "invalid";
    }
    return normalized === "true";
  }

  private present(name: string, value: string | undefined): PreflightCheck {
    return value?.trim()
      ? { name, status: "pass", message: `${name} is configured.` }
      : { name, status: "fail", message: `${name} is missing.` };
  }

  private optionalSecret(name: string, value: string | undefined): PreflightCheck {
    return value?.trim()
      ? { name, status: "pass", message: `${name} is configured.` }
      : { name, status: "pass", message: `${name} is not set; shared Atlas API key will be used.` };
  }

  private optionalModelId(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; capability fallback will be used when needed.` };
    }
    const issues = this.modelIdIssues(name, [value.trim()]);
    return issues.length > 0
      ? { name, status: "fail", message: issues.join(" ") }
      : { name, status: "pass", message: `${name} is configured.` };
  }

  /**
   * Advanced-feature model: reports whether the feature it gates is live. Absent is a WARN (the
   * feature is off, the rest of the platform works), a malformed id is a FAIL.
   */
  private featureModel(name: string, value: string | undefined, feature: string): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "warn", message: `${name} chưa đặt → TÍNH NĂNG TẮT: ${feature}. (Đặt model tương ứng trong .env để bật.)` };
    }
    const issues = this.modelIdIssues(name, [value.trim()]);
    return issues.length > 0
      ? { name, status: "fail", message: issues.join(" ") }
      : { name, status: "pass", message: `${name} bật: ${feature}.` };
  }

  private apiAuthCheck(): PreflightCheck {
    const disabledAuth = this.env.CINEJELLY_DISABLE_API_AUTH?.trim().toLowerCase();
    if (disabledAuth && disabledAuth !== "true" && disabledAuth !== "false") {
      return {
        name: "CINEJELLY_DISABLE_API_AUTH",
        status: "fail",
        message: "CINEJELLY_DISABLE_API_AUTH must be true or false when set."
      };
    }
    if (disabledAuth === "true") {
      return {
        name: "CINEJELLY_API_AUTH_TOKEN",
        status: "warn",
        message: "API auth is disabled; use only behind a private trusted network."
      };
    }
    const value = this.env.CINEJELLY_API_AUTH_TOKEN;
    if (!value?.trim()) {
      return {
        name: "CINEJELLY_API_AUTH_TOKEN",
        status: "fail",
        message: "CINEJELLY_API_AUTH_TOKEN is missing."
      };
    }
    if (value.trim().length < 24) {
      return {
        name: "CINEJELLY_API_AUTH_TOKEN",
        status: "fail",
        message: "CINEJELLY_API_AUTH_TOKEN must be at least 24 characters."
      };
    }
    return {
      name: "CINEJELLY_API_AUTH_TOKEN",
      status: "pass",
      message: "CINEJELLY_API_AUTH_TOKEN is configured."
    };
  }

  private optionalHttpsUrl(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default HTTPS URL will be used.` };
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") {
        return { name, status: "fail", message: `${name} must use https.` };
      }
      if (parsed.username || parsed.password) {
        return { name, status: "fail", message: `${name} must not include embedded credentials.` };
      }
      if (parsed.search || parsed.hash) {
        return { name, status: "fail", message: `${name} must not include query strings or fragments.` };
      }
      return { name, status: "pass", message: `${name} is a valid HTTPS URL.` };
    } catch {
      return { name, status: "fail", message: `${name} must be a valid HTTPS URL.` };
    }
  }

  private optionalAtlasEndpointUrl(name: string, value: string | undefined, expectedAtlasPath: string): PreflightCheck {
    const check = this.optionalHttpsUrl(name, value);
    if (check.status !== "pass" || !value?.trim()) {
      return check;
    }
    const parsed = new URL(value);
    if (parsed.hostname === "api.atlascloud.ai" && this.normalizedPath(parsed.pathname) !== expectedAtlasPath) {
      return {
        name,
        status: "fail",
        message: `${name} must use ${expectedAtlasPath} on api.atlascloud.ai.`
      };
    }
    return check;
  }

  private atlasCloudDocsConformanceCheck(): PreflightCheck {
    const issues: string[] = [];
    const warnings: string[] = [];

    const mediaKey = this.env.ATLASCLOUD_API_KEY?.trim();
    const llmKey = this.env.ATLASCLOUD_LLM_API_KEY?.trim();
    if (!mediaKey) {
      issues.push("ATLASCLOUD_API_KEY is required for Atlas media/model endpoints.");
    }
    if (!llmKey) {
      warnings.push("ATLASCLOUD_LLM_API_KEY is not configured; LLM calls will share the media key instead of the documented Coding Plan key.");
    }
    if (mediaKey && llmKey && mediaKey === llmKey) {
      warnings.push(
        "ATLASCLOUD_API_KEY and ATLASCLOUD_LLM_API_KEY currently share the same value; this is allowed only as an operator-approved fallback until a separate Coding Plan key is restored."
      );
    }

    const llmEndpoint = this.resolveAtlasDocsEndpoint(
      ["ATLASCLOUD_LLM_BASE_URL", "ATLASCLOUD_API_BASE_URL"],
      `https://${ATLAS_CANONICAL_HOST}${ATLAS_LLM_PATH}`,
      ATLAS_LLM_PATH
    );
    const mediaEndpoint = this.resolveAtlasDocsEndpoint(
      ["ATLASCLOUD_MEDIA_BASE_URL", "ATLASCLOUD_BASE_URL", "ATLASCLOUD_ASSET_BASE_URL"],
      `https://${ATLAS_CANONICAL_HOST}${ATLAS_MEDIA_PATH}`,
      ATLAS_MEDIA_PATH
    );
    issues.push(...llmEndpoint.issues, ...mediaEndpoint.issues);
    warnings.push(...llmEndpoint.warnings, ...mediaEndpoint.warnings);

    if (llmEndpoint.url) {
      this.assertAtlasDocsEndpointPath(llmEndpoint.url, "/chat/completions", "/v1/chat/completions", issues);
    }
    if (mediaEndpoint.url) {
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/uploadMedia", "/api/v1/model/uploadMedia", issues);
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/generateVideo", "/api/v1/model/generateVideo", issues);
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/generateAudio", "/api/v1/model/generateAudio", issues);
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/prediction/request_id", "/api/v1/model/prediction/request_id", issues);
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/result/request_id", "/api/v1/model/result/request_id", issues);
      this.assertAtlasDocsEndpointPath(mediaEndpoint.url, "/model/getResult?predictionId=request_id", "/api/v1/model/getResult", issues);
    }
    this.assertAtlasDocsEndpointPath(
      `https://${ATLAS_CANONICAL_HOST}${ATLAS_PUBLIC_BILLING_PATH}`,
      "/balance",
      "/public/v1/balance",
      issues
    );

    const configuredSeedanceModels = this.configuredSeedanceModelIds();
    issues.push(...this.modelIdIssues("ATLASCLOUD_SEEDANCE_*_MODEL", configuredSeedanceModels));
    issues.push(...this.seedanceCapabilityCoverageIssues(configuredSeedanceModels));
    issues.push(...this.generatedAudioCapabilityProviderIssues());

    if (issues.length > 0) {
      return {
        name: "atlascloud_docs_conformance",
        status: "fail",
        message: `Atlas Cloud docs conformance failed: ${issues.join(" ")}`
      };
    }
    if (warnings.length > 0) {
      return {
        name: "atlascloud_docs_conformance",
        status: "warn",
        message: `Atlas Cloud docs conformance has warnings: ${warnings.join(" ")}`
      };
    }
    return {
      name: "atlascloud_docs_conformance",
      status: "pass",
      message: `Atlas Cloud docs conformance passed for Coding Plan LLM, media model, billing, and ${configuredSeedanceModels.length} configured Seedance model ID(s).`
    };
  }

  private resolveAtlasDocsEndpoint(
    names: readonly string[],
    fallback: string,
    expectedAtlasPath: string
  ): { readonly url?: string; readonly issues: readonly string[]; readonly warnings: readonly string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];
    const selectedName = names.find((name) => this.env[name]?.trim());
    const value = selectedName ? this.env[selectedName]?.trim() : fallback;
    if (!value) {
      issues.push(`${names[0] ?? "Atlas endpoint"} could not be resolved.`);
      return { issues, warnings };
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      issues.push(`${selectedName ?? names[0]} must be a valid HTTPS URL.`);
      return { issues, warnings };
    }
    if (parsed.protocol !== "https:") {
      issues.push(`${selectedName ?? names[0]} must use https.`);
    }
    if (parsed.username || parsed.password) {
      issues.push(`${selectedName ?? names[0]} must not include embedded credentials.`);
    }
    if (parsed.search || parsed.hash) {
      issues.push(`${selectedName ?? names[0]} must not include query strings or fragments.`);
    }
    if (parsed.hostname === ATLAS_CANONICAL_HOST && this.normalizedPath(parsed.pathname) !== expectedAtlasPath) {
      issues.push(`${selectedName ?? names[0]} must use ${expectedAtlasPath} on ${ATLAS_CANONICAL_HOST}.`);
    }
    if (parsed.hostname !== ATLAS_CANONICAL_HOST) {
      warnings.push(`${selectedName ?? names[0]} uses a custom host; verify it proxies Atlas ${expectedAtlasPath} without changing request paths.`);
    }
    return {
      url: parsed.toString().replace(/\/$/, ""),
      issues,
      warnings
    };
  }

  private assertAtlasDocsEndpointPath(baseUrl: string, suffix: string, expectedPath: string, issues: string[]): void {
    try {
      const parsed = new URL(`${baseUrl.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`);
      if (this.normalizedPath(parsed.pathname) !== expectedPath) {
        issues.push(`Atlas endpoint path ${expectedPath} could not be constructed from configured base URLs.`);
      }
    } catch {
      issues.push(`Atlas endpoint path ${expectedPath} could not be constructed from configured base URLs.`);
    }
  }

  private configuredSeedanceModelIds(): readonly string[] {
    return [
      this.env.ATLASCLOUD_SEEDANCE_MINI_MODEL?.trim(),
      this.env.ATLASCLOUD_SEEDANCE_FAST_MODEL?.trim(),
      this.env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL?.trim()
    ].filter((value): value is string => Boolean(value));
  }

  private modelIdIssues(label: string, modelIds: readonly string[]): readonly string[] {
    const issues: string[] = [];
    for (const modelId of modelIds) {
      if (/[\u0000-\u001f\u007f\s]/.test(modelId)) {
        issues.push(`${label} values must not contain whitespace or control characters.`);
        break;
      }
      if (/^https?:\/\//i.test(modelId) || /^apikey-/i.test(modelId)) {
        issues.push(`${label} values must be Atlas model IDs, not URLs or API keys.`);
        break;
      }
    }
    return issues;
  }

  private seedanceCapabilityCoverageIssues(configuredSeedanceModels: readonly string[]): readonly string[] {
    const raw = this.env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON;
    if (!raw?.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      const capabilityModels = new Set<string>();
      const issues: string[] = [];
      for (const item of parsed) {
        const payload = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        if (payload.provider !== "atlascloud") {
          issues.push("Seedance capability records must use provider atlascloud.");
          break;
        }
        if (typeof payload.modelId === "string" && payload.modelId.trim()) {
          capabilityModels.add(payload.modelId.trim());
        }
      }
      const missingModels = configuredSeedanceModels.filter((modelId) => !capabilityModels.has(modelId));
      if (missingModels.length > 0) {
        issues.push("ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON must include every configured Seedance model ID.");
      }
      return issues;
    } catch {
      return [];
    }
  }

  private generatedAudioCapabilityProviderIssues(): readonly string[] {
    const raw = this.env.ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON;
    if (!raw?.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.some((item) => {
        const payload = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        return payload.provider !== "atlascloud";
      })
        ? ["Generated-audio capability records must use provider atlascloud."]
        : [];
    } catch {
      return [];
    }
  }

  private normalizedPath(value: string): string {
    const trimmed = value.replace(/\/+$/, "");
    return trimmed || "/";
  }

  private optionalPositiveInteger(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default value will be used.` };
    }
    const trimmed = value.trim();
    if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
      return { name, status: "fail", message: `${name} must be a positive integer.` };
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return { name, status: "fail", message: `${name} must be a positive integer.` };
    }
    return { name, status: "pass", message: `${name} is a positive integer.` };
  }

  private optionalPort(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default API port will be used.` };
    }
    const trimmed = value.trim();
    if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
      return { name, status: "fail", message: `${name} must be a TCP port between ${MIN_PORT} and ${MAX_PORT}.` };
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
      return { name, status: "fail", message: `${name} must be a TCP port between ${MIN_PORT} and ${MAX_PORT}.` };
    }
    return { name, status: "pass", message: `${name} is a valid TCP port.` };
  }

  private optionalBooleanFlag(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set.` };
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      return { name, status: "fail", message: `${name} must be true or false when set.` };
    }
    return { name, status: normalized === "true" ? "warn" : "pass", message: `${name} is set to ${normalized}.` };
  }

  private optionalNonNegativeNumber(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; cost gate will use available configured rates only.` };
    }
    const trimmed = value.trim();
    if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
      return { name, status: "fail", message: `${name} must be a non-negative decimal number.` };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { name, status: "fail", message: `${name} must be a non-negative decimal number.` };
    }
    return { name, status: "pass", message: `${name} is a non-negative decimal number.` };
  }

  private optionalPositiveNumber(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default multiplier will be used.` };
    }
    const trimmed = value.trim();
    if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
      return { name, status: "fail", message: `${name} must be a decimal number greater than zero.` };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { name, status: "fail", message: `${name} must be a decimal number greater than zero.` };
    }
    return { name, status: "pass", message: `${name} is a decimal number greater than zero.` };
  }

  private async outputDirectoryCheck(name: string, value: string | undefined): Promise<PreflightCheck> {
    const configured = value?.trim();
    if (configured && /[\u0000-\u001f\u007f]/.test(configured)) {
      return { name, status: "fail", message: `${name} must not contain control characters.` };
    }
    const outputDirectory = resolve(configured || "assets/output_deliverables");
    try {
      await mkdir(outputDirectory, { recursive: true });
      await access(outputDirectory, constants.W_OK);
      return configured
        ? { name, status: "pass", message: `${name} can be prepared and written.` }
        : { name, status: "pass", message: `${name} is not set; default output directory can be prepared and written.` };
    } catch {
      return {
        name,
        status: "fail",
        message: `${name} must point to a directory that can be created and written by the API process.`
      };
    }
  }

  private async databaseBackendCheck(): Promise<PreflightCheck> {
    const name = "CINEJELLY_DATABASE_KIND";
    const raw = this.env.CINEJELLY_DATABASE_KIND?.trim().toLowerCase() || "json";
    if (raw !== "json" && raw !== "sqlite" && raw !== "postgres") {
      return { name, status: "fail", message: `CINEJELLY_DATABASE_KIND phải là "json", "sqlite" hoặc "postgres" (hiện: "${raw}"). Sửa trong .env.` };
    }
    if (raw === "json") {
      return { name, status: "pass", message: "Lưu dữ liệu: JSON (mặc định, không cần cài thêm gì)." };
    }
    if (raw === "sqlite") {
      const parts = process.versions.node.split(".").map((part) => Number(part));
      const major = parts[0] ?? 0;
      const minor = parts[1] ?? 0;
      if (major < 22 || (major === 22 && minor < 5)) {
        return {
          name,
          status: "fail",
          message: `Lưu dữ liệu SQLite cần Node >= 22.5 nhưng đang chạy Node ${process.versions.node}. Nâng Node lên 22+, hoặc đặt CINEJELLY_DATABASE_KIND=json hoặc postgres.`
        };
      }
      return { name, status: "pass", message: `Lưu dữ liệu: SQLite (Node ${process.versions.node} hỗ trợ node:sqlite).` };
    }
    // postgres
    if (!this.env.CINEJELLY_POSTGRES_URL?.trim()) {
      return {
        name,
        status: "fail",
        message: "CINEJELLY_DATABASE_KIND=postgres cần CINEJELLY_POSTGRES_URL (chuỗi kết nối Neon/Postgres, dạng postgresql://...). Điền vào .env."
      };
    }
    try {
      // Computed specifier so the compiler doesn't require pg types when postgres isn't chosen.
      const pgModuleName = "pg";
      await import(pgModuleName);
    } catch {
      return { name, status: "fail", message: 'CINEJELLY_DATABASE_KIND=postgres cần gói "pg": chạy `npm install pg` trên máy chủ (một lần), rồi khởi động lại.' };
    }
    return {
      name,
      status: "warn",
      message: "Lưu dữ liệu: Postgres — cấu hình có URL và gói pg. LƯU Ý: preflight KHÔNG kết nối thử; khi máy chủ chạy hãy mở /health để xem trạng thái kết nối cơ sở dữ liệu thật (Neon có thể đang ngủ)."
    };
  }

  private async freeDiskCheck(): Promise<PreflightCheck> {
    const name = "Ổ đĩa trống (thư mục lưu video)";
    const outputDirectory = resolve(this.env.CINEJELLY_OUTPUT_DIR?.trim() || "assets/output_deliverables");
    try {
      await mkdir(outputDirectory, { recursive: true });
      const stats = await statfs(outputDirectory);
      const freeGb = (stats.bavail * stats.bsize) / 1024 ** 3;
      const minGb = 2;
      if (freeGb < minGb) {
        return {
          name,
          status: "warn",
          message: `Ổ đĩa gần đầy: chỉ còn ${freeGb.toFixed(1)} GB. Xóa bớt video/file cũ trong thư mục output (hoặc bật tự-dọn CINEJELLY_OUTPUT_RETENTION_DAYS); khi hết chỗ, render và cả việc lưu tài khoản sẽ lỗi.`
        };
      }
      return { name, status: "pass", message: `Ổ đĩa còn ${freeGb.toFixed(1)} GB trống.` };
    } catch {
      return { name, status: "warn", message: `Không đọc được dung lượng ổ đĩa cho thư mục ${outputDirectory}.` };
    }
  }

  private capabilityCheck(value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return {
        name: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
        status: "warn",
        message: "No explicit Seedance capability override configured; using documented defaults."
      };
    }
    const parsed = this.parseCapabilityJson(value);
    if (!parsed.valid) {
      return {
        name: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
        status: "fail",
        message: parsed.message
      };
    }
    return {
      name: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
      status: "pass",
      message: `${parsed.count} provider capability record(s) configured.`
    };
  }

  private generatedAudioCapabilityCheck(value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return {
        name: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON",
        status: "pass",
        message: "No explicit generated-audio capability override configured; Atlas generated-audio execution remains disabled."
      };
    }
    const parsed = this.parseGeneratedAudioCapabilityJson(value);
    if (!parsed.valid) {
      return {
        name: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON",
        status: "fail",
        message: parsed.message
      };
    }
    return {
      name: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON",
      status: "pass",
      message: `${parsed.count} generated-audio capability record(s) configured.`
    };
  }

  private parseCapabilityJson(value: string): { readonly valid: true; readonly count: number } | { readonly valid: false; readonly message: string } {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return { valid: false, message: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON must be a JSON array." };
      }
      for (const item of parsed) {
        const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const durations = payload.durations && typeof payload.durations === "object" ? (payload.durations as Record<string, unknown>) : {};
        if (
          typeof payload.provider !== "string" ||
          typeof payload.modelId !== "string" ||
          !Array.isArray(payload.modes) ||
          !Array.isArray(payload.resolutions) ||
          !Array.isArray(payload.ratios) ||
          !Array.isArray(payload.references) ||
          typeof durations.min !== "number" ||
          typeof durations.max !== "number"
        ) {
          return { valid: false, message: "Each provider capability must include provider, modelId, modes, durations, resolutions, ratios, and references." };
        }
        const settingsIssue = this.providerCapabilitySettingsIssue(payload.settings);
        if (settingsIssue) {
          return { valid: false, message: settingsIssue };
        }
      }
      return { valid: true, count: parsed.length };
    } catch {
      return { valid: false, message: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON must be valid JSON." };
    }
  }

  private providerCapabilitySettingsIssue(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    const settings = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
    if (!settings) {
      return "Provider capability settings must be an object when provided.";
    }
    for (const name of ["generateAudio", "returnLastFrame", "watermark"] as const) {
      if (settings[name] !== undefined && typeof settings[name] !== "boolean") {
        return `Provider capability settings.${name} must be boolean when provided.`;
      }
    }
    if (
      settings.bitrateModes !== undefined &&
      (!Array.isArray(settings.bitrateModes) || !settings.bitrateModes.every((item) => item === "standard" || item === "high"))
    ) {
      return "Provider capability settings.bitrateModes must contain standard and/or high when provided.";
    }
    return undefined;
  }

  private parseGeneratedAudioCapabilityJson(value: string): { readonly valid: true; readonly count: number } | { readonly valid: false; readonly message: string } {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return { valid: false, message: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON must be a JSON array." };
      }
      for (const item of parsed) {
        const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        if (
          typeof payload.provider !== "string" ||
          typeof payload.modelId !== "string" ||
          !Array.isArray(payload.kinds) ||
          !payload.kinds.every((kind) => this.isGeneratedAudioKind(kind)) ||
          !Array.isArray(payload.outputFormats) ||
          !payload.outputFormats.every((format) => this.isAudioOutputFormat(format)) ||
          typeof payload.maxDurationSeconds !== "number" ||
          !Number.isFinite(payload.maxDurationSeconds) ||
          payload.maxDurationSeconds <= 0 ||
          typeof payload.async !== "boolean"
        ) {
          return {
            valid: false,
            message: "Each generated-audio capability must include provider, modelId, kinds, outputFormats, maxDurationSeconds, and async."
          };
        }
      }
      return { valid: true, count: parsed.length };
    } catch {
      return { valid: false, message: "ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON must be valid JSON." };
    }
  }

  private isGeneratedAudioKind(value: unknown): boolean {
    return value === "tts_narration" || value === "bgm" || value === "ambience" || value === "sfx";
  }

  private isAudioOutputFormat(value: unknown): boolean {
    return value === "mp3" || value === "wav";
  }

  private async mediaToolCheck(tool: MediaToolName, signal?: AbortSignal): Promise<PreflightCheck> {
    const envName = mediaToolEnvName(tool);
    const configured = normalizeMediaToolCommand(this.env[envName]);
    const checkName = configured ? envName : tool;
    if (configured && mediaToolCommandHasControlCharacters(configured)) {
      return {
        name: checkName,
        status: "fail",
        message: `${envName} must not contain control characters.`
      };
    }
    try {
      await runProcess(readMediaToolCommand(tool, this.env), ["-version"], signal);
      return {
        name: checkName,
        status: "pass",
        message: configured ? `${envName} is configured and executable.` : `${tool} is available on PATH.`
      };
    } catch (error) {
      return {
        name: checkName,
        status: "fail",
        message: configured
          ? `${envName} is configured but the command could not be executed.`
          : error instanceof Error ? error.message : `${tool} failed.`
      };
    }
  }

  private rollup(checks: readonly PreflightCheck[]): PreflightStatus {
    if (checks.some((check) => check.status === "fail")) {
      return "fail";
    }
    if (checks.some((check) => check.status === "warn")) {
      return "warn";
    }
    return "pass";
  }
}
