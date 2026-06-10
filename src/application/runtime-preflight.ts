/**
 * Runtime preflight for deployment readiness.
 * It checks required environment configuration and local media tool availability without exposing secrets.
 */

import type { RuntimeSettings } from "../types/settings.js";
import type { PreflightCheck, PreflightStatus, RuntimePreflightReport } from "../types/preflight.js";
import { runProcess } from "../utils/process.js";

export class RuntimePreflight {
  private readonly settings: RuntimeSettings;

  public constructor(settings: RuntimeSettings) {
    this.settings = settings;
  }

  public async run(signal?: AbortSignal): Promise<RuntimePreflightReport> {
    const checks: PreflightCheck[] = [
      this.present("ATLASCLOUD_API_KEY", this.settings.atlasCloud.apiKey),
      this.present("ATLASCLOUD_LLM_MODEL", this.settings.atlasCloud.models.llmModel),
      this.present("ATLASCLOUD_SEEDANCE_STANDARD_MODEL", this.settings.atlasCloud.models.seedanceStandardModel),
      this.present("ATLASCLOUD_SEEDANCE_FAST_MODEL", this.settings.atlasCloud.models.seedanceFastModel),
      this.capabilityCheck()
    ];

    checks.push(await this.commandCheck("ffmpeg", ["-version"], signal));
    checks.push(await this.commandCheck("ffprobe", ["-version"], signal));

    return {
      status: this.rollup(checks),
      checkedAt: new Date(),
      checks
    };
  }

  private present(name: string, value: string): PreflightCheck {
    return value.trim()
      ? { name, status: "pass", message: `${name} is configured.` }
      : { name, status: "fail", message: `${name} is missing.` };
  }

  private capabilityCheck(): PreflightCheck {
    const capabilities = this.settings.atlasCloud.seedanceCapabilities;
    if (!capabilities || capabilities.length === 0) {
      return {
        name: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
        status: "warn",
        message: "No explicit Seedance capability override configured; using documented defaults."
      };
    }
    return {
      name: "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
      status: "pass",
      message: `${capabilities.length} provider capability record(s) configured.`
    };
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
