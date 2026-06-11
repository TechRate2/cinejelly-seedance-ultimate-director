/**
 * Small retry helper for provider calls with retryable normalized errors.
 * It avoids provider-specific retry code leaking into higher-level services.
 */

import { ProviderError } from "./errors.js";
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
      const retryable = error instanceof ProviderError ? error.retryable : false;
      if (!retryable || attempt >= policy.maxAttempts) {
        throw error;
      }
      onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error
      });
      await sleep(delayMs, signal);
      delayMs = Math.min(policy.maxDelayMs, Math.ceil(delayMs * policy.backoffFactor));
    }
  }

  throw lastError;
}
