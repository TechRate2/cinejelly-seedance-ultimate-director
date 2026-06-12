/**
 * Logging contracts for production services.
 * Log payloads are intentionally provider-neutral and should be redacted before emission.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface LogError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly retryable?: boolean;
}

export interface LogEvent {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context?: LogContext;
  readonly error?: LogError;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext, error?: unknown): void;
  error(message: string, context?: LogContext, error?: unknown): void;
}
