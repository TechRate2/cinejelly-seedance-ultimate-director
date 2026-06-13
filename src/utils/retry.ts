/**
 * Small retry helper for provider calls with retryable normalized errors.
 * It avoids provider-specific retry code leaking into higher-level services.
 */

import { ProviderError } from "./errors.js";
import { redactText } from "./redaction.js";
import { sleep } from "./time.js";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
}

export interface RetryAttempt {
  readonly failedAttempt: number;
  readonly nextAttempt: number;
  readonly delayMs: number;
  readonly error: unknown;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5_000,
  backoffFactor: 2
};

const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "POLLING_TIMEOUT"
]);

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  signal?: AbortSignal,
  onRetry?: (attempt: RetryAttempt) => void
): Promise<T> {
  let attempt = 0;
  let delayMs = policy.initialDelayMs;
  let lastError: unknown;

  while (attempt < policy.maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = thisCallCanRetry(error, signal);
      if (!retryable || attempt >= policy.maxAttempts) {
        throw error;
      }
      onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error
      });
      try {
        await sleep(delayMs, signal);
      } catch (abortError) {
        throw retryAbortError(error, abortError);
      }
      delayMs = Math.min(policy.maxDelayMs, Math.ceil(delayMs * policy.backoffFactor));
    }
  }

  throw lastError;
}

function thisCallCanRetry(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return false;
  }
  if (!(error instanceof ProviderError)) {
    return false;
  }
  return error.retryable && RETRYABLE_PROVIDER_ERROR_CODES.has(error.code);
}

function retryAbortError(error: unknown, abortError: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return new ProviderError({
      code: "REQUEST_ABORTED",
      provider: error.provider,
      message: `${error.provider} retry wait was aborted.`,
      details: abortDetails(abortError)
    });
  }
  return new ProviderError({
    code: "REQUEST_ABORTED",
    provider: "provider",
    message: "Provider retry wait was aborted.",
    details: abortDetails(abortError)
  });
}

function abortDetails(error: unknown): Record<string, string> | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactText(error.message)
    };
  }
  if (typeof error === "string" && error.trim()) {
    return {
      message: redactText(error)
    };
  }
  return undefined;
}
