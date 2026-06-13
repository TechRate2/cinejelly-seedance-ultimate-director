/**
 * Normalized error classes for provider calls.
 * Higher layers can route retries, user messages, and repair decisions by stable error code.
 */

export type ProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "INVALID_SCHEMA"
  | "ASSET_NOT_ACTIVE"
  | "ASSET_VALIDATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "GENERATION_FAILED"
  | "PREDICTION_CANCELED"
  | "POLLING_TIMEOUT"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "OUTPUT_MISSING"
  | "UNSUPPORTED_SETTING"
  | "NETWORK_ERROR"
  | "UNKNOWN_PROVIDER_ERROR";

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: string;
  public readonly statusCode: number | undefined;
  public readonly retryable: boolean;
  public readonly details: unknown | undefined;

  public constructor(input: {
    readonly code: ProviderErrorCode;
    readonly provider: string;
    readonly message: string;
    readonly statusCode?: number;
    readonly retryable?: boolean;
    readonly details?: unknown;
  }) {
    super(input.message);
    this.name = "ProviderError";
    this.code = input.code;
    this.provider = input.provider;
    this.statusCode = input.statusCode;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

export function normalizeHttpProviderError(provider: string, statusCode: number, details: unknown): ProviderError {
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderError({
      code: "AUTHENTICATION_FAILED",
      provider,
      statusCode,
      message: `${provider} authentication failed.`,
      details
    });
  }
  if (statusCode === 402) {
    return new ProviderError({
      code: "INSUFFICIENT_CREDITS",
      provider,
      statusCode,
      message: `${provider} account has insufficient credits.`,
      details
    });
  }
  if (statusCode === 408 || statusCode === 429) {
    return new ProviderError({
      code: "RATE_LIMITED",
      provider,
      statusCode,
      retryable: true,
      message: `${provider} request was rate limited or timed out.`,
      details
    });
  }
  if (statusCode === 400 || statusCode === 422) {
    return new ProviderError({
      code: "INVALID_SCHEMA",
      provider,
      statusCode,
      message: `${provider} rejected the request schema.`,
      details
    });
  }
  if (statusCode >= 500) {
    return new ProviderError({
      code: "NETWORK_ERROR",
      provider,
      statusCode,
      retryable: true,
      message: `${provider} service returned a server error.`,
      details
    });
  }
  return new ProviderError({
    code: "UNKNOWN_PROVIDER_ERROR",
    provider,
    statusCode,
    message: `${provider} returned an unexpected error.`,
    details
  });
}

export function asProviderError(provider: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }
  if (error instanceof Error) {
    return new ProviderError({
      code: "NETWORK_ERROR",
      provider,
      retryable: true,
      message: error.message,
      details: { name: error.name }
    });
  }
  return new ProviderError({
    code: "UNKNOWN_PROVIDER_ERROR",
    provider,
    message: `${provider} failed with a non-error exception.`,
    details: error
  });
}
