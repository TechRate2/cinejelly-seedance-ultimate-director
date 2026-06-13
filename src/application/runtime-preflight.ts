/**
 * Runtime preflight for deployment readiness.
 * It checks required environment configuration and local media tool availability without exposing secrets.
 */

import { constants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LocalMaterialLibraryAdapter } from "../core/local-material-library-adapter.js";
import type { LocalMaterialCatalog } from "../types/material.js";
import type { PreflightCheck, PreflightStatus, RuntimePreflightReport } from "../types/preflight.js";
import { runProcess } from "../utils/process.js";

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

export class RuntimePreflight {
  private readonly env: NodeJS.ProcessEnv;

  public constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  public async run(signal?: AbortSignal): Promise<RuntimePreflightReport> {
    const checks: PreflightCheck[] = [
      this.present("ATLASCLOUD_API_KEY", this.env.ATLASCLOUD_API_KEY),
      this.present("ATLASCLOUD_LLM_MODEL", this.env.ATLASCLOUD_LLM_MODEL),
      this.present("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", this.env.ATLASCLOUD_SEEDANCE_STANDARD_MODEL),
      this.present("ATLASCLOUD_SEEDANCE_FAST_MODEL", this.env.ATLASCLOUD_SEEDANCE_FAST_MODEL),
      this.apiAuthCheck(),
      this.optionalPort("PORT", this.env.PORT),
      this.optionalHttpsUrl("ATLASCLOUD_API_BASE_URL", this.env.ATLASCLOUD_API_BASE_URL),
      this.optionalHttpsUrl("ATLASCLOUD_ASSET_BASE_URL", this.env.ATLASCLOUD_ASSET_BASE_URL),
      this.optionalPositiveInteger("CINEJELLY_REQUEST_TIMEOUT_MS", this.env.CINEJELLY_REQUEST_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES", this.env.CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES),
      this.optionalPositiveInteger("CINEJELLY_POLLING_INTERVAL_MS", this.env.CINEJELLY_POLLING_INTERVAL_MS),
      this.optionalPositiveInteger("CINEJELLY_POLLING_TIMEOUT_MS", this.env.CINEJELLY_POLLING_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_RENDER_CONCURRENCY", this.env.CINEJELLY_RENDER_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_SYNC_RENDER_CONCURRENCY", this.env.CINEJELLY_API_SYNC_RENDER_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_CONCURRENCY", this.env.CINEJELLY_API_JOB_CONCURRENCY),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_HISTORY_LIMIT", this.env.CINEJELLY_API_JOB_HISTORY_LIMIT),
      this.optionalPositiveInteger("CINEJELLY_API_JOB_QUEUE_LIMIT", this.env.CINEJELLY_API_JOB_QUEUE_LIMIT),
      this.optionalPositiveInteger("CINEJELLY_API_MAX_BODY_BYTES", this.env.CINEJELLY_API_MAX_BODY_BYTES),
      this.optionalPositiveInteger("CINEJELLY_API_RATE_LIMIT_WINDOW_MS", this.env.CINEJELLY_API_RATE_LIMIT_WINDOW_MS),
      this.optionalPositiveInteger("CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS", this.env.CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS),
      this.optionalBooleanFlag("CINEJELLY_DISABLE_API_RATE_LIMIT", this.env.CINEJELLY_DISABLE_API_RATE_LIMIT),
      this.optionalBooleanFlag("CINEJELLY_TRUST_PROXY_HEADERS", this.env.CINEJELLY_TRUST_PROXY_HEADERS),
      this.optionalPositiveInteger("CINEJELLY_MAX_USER_INPUT_CHARS", this.env.CINEJELLY_MAX_USER_INPUT_CHARS),
      this.optionalPositiveInteger("CINEJELLY_MAX_REFERENCES", this.env.CINEJELLY_MAX_REFERENCES),
      this.optionalPositiveInteger("CINEJELLY_MAX_CAPTION_CUES", this.env.CINEJELLY_MAX_CAPTION_CUES),
      this.optionalPositiveInteger("CINEJELLY_MAX_AUDIO_TRACKS", this.env.CINEJELLY_MAX_AUDIO_TRACKS),
      this.optionalPositiveInteger("CINEJELLY_MAX_METADATA_ENTRIES", this.env.CINEJELLY_MAX_METADATA_ENTRIES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_SCENES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_SCENES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE", this.env.CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE),
      this.optionalPositiveInteger("CINEJELLY_MAX_SOURCE_VIDEO_NOTES", this.env.CINEJELLY_MAX_SOURCE_VIDEO_NOTES),
      this.optionalPositiveInteger("CINEJELLY_MAX_RENDERED_CLIP_BYTES", this.env.CINEJELLY_MAX_RENDERED_CLIP_BYTES),
      this.optionalPositiveInteger("CINEJELLY_MAX_AUDIO_TRACK_BYTES", this.env.CINEJELLY_MAX_AUDIO_TRACK_BYTES),
      this.optionalNonNegativeNumber("CINEJELLY_RENDER_COST_USD_PER_SECOND", this.env.CINEJELLY_RENDER_COST_USD_PER_SECOND),
      this.optionalNonNegativeNumber("CINEJELLY_ASSET_REGISTRATION_COST_USD", this.env.CINEJELLY_ASSET_REGISTRATION_COST_USD),
      this.optionalNonNegativeNumber("CINEJELLY_LLM_PLAN_COST_USD", this.env.CINEJELLY_LLM_PLAN_COST_USD),
      this.optionalPositiveNumber("CINEJELLY_COST_BUFFER_MULTIPLIER", this.env.CINEJELLY_COST_BUFFER_MULTIPLIER),
      this.capabilityCheck(this.env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON)
    ];

    checks.push(await this.outputDirectoryCheck("CINEJELLY_OUTPUT_DIR", this.env.CINEJELLY_OUTPUT_DIR));
    checks.push(await this.localMaterialCatalogCheck(
      "CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH",
      this.env.CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH
    ));
    checks.push(await this.commandCheck("ffmpeg", ["-version"], signal));
    checks.push(await this.commandCheck("ffprobe", ["-version"], signal));

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

  private present(name: string, value: string | undefined): PreflightCheck {
    return value?.trim()
      ? { name, status: "pass", message: `${name} is configured.` }
      : { name, status: "fail", message: `${name} is missing.` };
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
      }
      return { valid: true, count: parsed.length };
    } catch {
      return { valid: false, message: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON must be valid JSON." };
    }
  }

  private async commandCheck(command: string, args: readonly string[], signal?: AbortSignal): Promise<PreflightCheck> {
    try {
      await runProcess(command, args, signal);
      return {
        name: command,
        status: "pass",
        message: `${command} is available on PATH.`
      };
    } catch (error) {
      return {
        name: command,
        status: "fail",
        message: error instanceof Error ? error.message : `${command} failed.`
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
