/**
 * Thin Atlas Cloud HTTP client built on native fetch.
 * It centralizes auth, JSON parsing, timeouts, redaction, and normalized HTTP errors.
 */

import { normalizeHttpProviderError, ProviderError } from "../../utils/errors.js";
import { redactUnknown } from "../../utils/redaction.js";

const ERROR_BODY_PREVIEW_CHARS = 500;

export interface AtlasCloudHttpClientOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
}

export class AtlasCloudHttpClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  public constructor(options: AtlasCloudHttpClientOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  public async getJson<TValue>(url: string, signal?: AbortSignal): Promise<TValue> {
    return this.requestJson<TValue>(url, { method: "GET" }, signal);
  }

  public async postJson<TValue>(url: string, body: unknown, signal?: AbortSignal): Promise<TValue> {
    return this.requestJson<TValue>(
      url,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      signal
    );
  }

  public async deleteJson<TValue>(url: string, signal?: AbortSignal): Promise<TValue> {
    return this.requestJson<TValue>(url, { method: "DELETE" }, signal);
  }

  private async requestJson<TValue>(
    url: string,
    init: RequestInit,
    signal?: AbortSignal
  ): Promise<TValue> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Atlas Cloud request timed out.")), this.timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {})
        }
      });

      const rawText = await response.text();
      const payload = rawText ? this.parseJson(rawText, url, response.ok) : undefined;
      if (!response.ok) {
        throw normalizeHttpProviderError("atlascloud", response.status, redactUnknown(payload));
      }
      return payload as TValue;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError({
          code: "NETWORK_ERROR",
          provider: "atlascloud",
          retryable: true,
          message: "Atlas Cloud request was aborted or timed out."
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private parseJson(rawText: string, url: string, responseOk: boolean): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      const redactedPreview = redactUnknown(rawText.slice(0, ERROR_BODY_PREVIEW_CHARS));
      if (!responseOk) {
        return {
          nonJsonBodyPreview: redactedPreview
        };
      }
      throw new ProviderError({
        code: "UNKNOWN_PROVIDER_ERROR",
        provider: "atlascloud",
        message: `Atlas Cloud returned non-JSON response from ${url}.`,
        details: { nonJsonBodyPreview: redactedPreview }
      });
    }
  }
}
