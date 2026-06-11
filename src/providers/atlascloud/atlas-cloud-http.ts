/**
 * Thin Atlas Cloud HTTP client built on native fetch.
 * It centralizes auth, JSON parsing, timeouts, redaction, and normalized HTTP errors.
 */

import { normalizeHttpProviderError, ProviderError } from "../../utils/errors.js";
import { redactUnknown } from "../../utils/redaction.js";

const ERROR_BODY_PREVIEW_CHARS = 500;
const DEFAULT_MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface AtlasCloudHttpClientOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxJsonResponseBytes?: number;
}

interface ResponseBodyReadResult {
  readonly text: string;
  readonly readBytes: number;
  readonly exceededLimit: boolean;
  readonly declaredContentLengthBytes?: number;
}

export class AtlasCloudHttpClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxJsonResponseBytes: number;

  public constructor(options: AtlasCloudHttpClientOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.maxJsonResponseBytes = Math.max(1, options.maxJsonResponseBytes ?? DEFAULT_MAX_JSON_RESPONSE_BYTES);
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

      const body = await this.readResponseText(response, url);
      const payload = body.exceededLimit
        ? this.responseBodyLimitDetails(body)
        : body.text
          ? this.parseJson(body.text, url, response.ok)
          : undefined;
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

  private async readResponseText(response: Response, url: string): Promise<ResponseBodyReadResult> {
    const declaredContentLengthBytes = this.parseContentLength(response.headers.get("content-length"));
    if (declaredContentLengthBytes !== undefined && declaredContentLengthBytes > this.maxJsonResponseBytes) {
      if (!response.ok) {
        return {
          text: "",
          readBytes: 0,
          exceededLimit: true,
          declaredContentLengthBytes
        };
      }
      throw this.responseTooLarge(url, declaredContentLengthBytes);
    }
    if (!response.body) {
      return { text: "", readBytes: 0, exceededLimit: false };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let readBytes = 0;

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        if (!chunk.value) {
          continue;
        }
        readBytes += chunk.value.byteLength;
        if (readBytes > this.maxJsonResponseBytes) {
          await reader.cancel().catch(() => undefined);
          if (!response.ok) {
            return {
              text: "",
              readBytes,
              exceededLimit: true,
              ...(declaredContentLengthBytes !== undefined ? { declaredContentLengthBytes } : {})
            };
          }
          throw this.responseTooLarge(url, readBytes);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return {
        text,
        readBytes,
        exceededLimit: false,
        ...(declaredContentLengthBytes !== undefined ? { declaredContentLengthBytes } : {})
      };
    } finally {
      reader.releaseLock();
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

  private parseContentLength(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }
    if (!/^(?:0|[1-9]\d*)$/.test(value)) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  private responseBodyLimitDetails(body: ResponseBodyReadResult): Record<string, number | boolean> {
    return {
      responseBodyExceededLimit: true,
      responseBodyLimitBytes: this.maxJsonResponseBytes,
      ...(body.readBytes > 0 ? { readBytes: body.readBytes } : {}),
      ...(body.declaredContentLengthBytes !== undefined ? { declaredContentLengthBytes: body.declaredContentLengthBytes } : {})
    };
  }

  private responseTooLarge(url: string, bytes: number): ProviderError {
    return new ProviderError({
      code: "UNKNOWN_PROVIDER_ERROR",
      provider: "atlascloud",
      message: `Atlas Cloud response from ${url} exceeded the configured JSON response size limit.`,
      details: {
        responseBodyLimitBytes: this.maxJsonResponseBytes,
        observedBytes: bytes
      }
    });
  }
}
