/**
 * Runtime preflight for deployment readiness.
 * It checks required environment configuration and local media tool availability without exposing secrets.
 */

import type { PreflightCheck, PreflightStatus, RuntimePreflightReport } from "../types/preflight.js";
import { runProcess } from "../utils/process.js";

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
      this.optionalUrl("ATLASCLOUD_API_BASE_URL", this.env.ATLASCLOUD_API_BASE_URL),
      this.optionalUrl("ATLASCLOUD_ASSET_BASE_URL", this.env.ATLASCLOUD_ASSET_BASE_URL),
      this.optionalPositiveInteger("CINEJELLY_REQUEST_TIMEOUT_MS", this.env.CINEJELLY_REQUEST_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_POLLING_INTERVAL_MS", this.env.CINEJELLY_POLLING_INTERVAL_MS),
      this.optionalPositiveInteger("CINEJELLY_POLLING_TIMEOUT_MS", this.env.CINEJELLY_POLLING_TIMEOUT_MS),
      this.optionalPositiveInteger("CINEJELLY_RENDER_CONCURRENCY", this.env.CINEJELLY_RENDER_CONCURRENCY),
      this.optionalNonNegativeNumber("CINEJELLY_RENDER_COST_USD_PER_SECOND", this.env.CINEJELLY_RENDER_COST_USD_PER_SECOND),
      this.optionalNonNegativeNumber("CINEJELLY_ASSET_REGISTRATION_COST_USD", this.env.CINEJELLY_ASSET_REGISTRATION_COST_USD),
      this.optionalNonNegativeNumber("CINEJELLY_LLM_PLAN_COST_USD", this.env.CINEJELLY_LLM_PLAN_COST_USD),
      this.optionalPositiveNumber("CINEJELLY_COST_BUFFER_MULTIPLIER", this.env.CINEJELLY_COST_BUFFER_MULTIPLIER),
      this.capabilityCheck(this.env.ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON)
    ];

    checks.push(await this.commandCheck("ffmpeg", ["-version"], signal));
    checks.push(await this.commandCheck("ffprobe", ["-version"], signal));

    return {
      status: this.rollup(checks),
      checkedAt: new Date(),
      checks
    };
  }

  private present(name: string, value: string | undefined): PreflightCheck {
    return value?.trim()
      ? { name, status: "pass", message: `${name} is configured.` }
      : { name, status: "fail", message: `${name} is missing.` };
  }

  private optionalUrl(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default URL will be used.` };
    }
    try {
      new URL(value);
      return { name, status: "pass", message: `${name} is a valid URL.` };
    } catch {
      return { name, status: "fail", message: `${name} must be a valid URL.` };
    }
  }

  private optionalPositiveInteger(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default value will be used.` };
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
      return { name, status: "fail", message: `${name} must be a positive integer.` };
    }
    return { name, status: "pass", message: `${name} is a positive integer.` };
  }

  private optionalNonNegativeNumber(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; cost gate will use available configured rates only.` };
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { name, status: "fail", message: `${name} must be a non-negative number.` };
    }
    return { name, status: "pass", message: `${name} is a non-negative number.` };
  }

  private optionalPositiveNumber(name: string, value: string | undefined): PreflightCheck {
    if (!value?.trim()) {
      return { name, status: "pass", message: `${name} is not set; default multiplier will be used.` };
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { name, status: "fail", message: `${name} must be greater than zero.` };
    }
    return { name, status: "pass", message: `${name} is greater than zero.` };
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
