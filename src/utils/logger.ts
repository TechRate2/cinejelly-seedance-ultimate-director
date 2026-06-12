/**
 * Minimal redacted logger used by production services.
 * It gives future provider, prompt, graph, and guardian modules a shared logging contract.
 */

import type { LogContext, LogError, LogEvent, Logger, LogLevel } from "../types/logging.js";
import { redactText, redactUnknown } from "./redaction.js";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class ConsoleLogger implements Logger {
  public constructor(private readonly minimumLevel: LogLevel = "info") {}

  public debug(message: string, context?: LogContext): void {
    this.emit("debug", message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.emit("info", message, context);
  }

  public warn(message: string, context?: LogContext, error?: unknown): void {
    this.emit("warn", message, context, error);
  }

  public error(message: string, context?: LogContext, error?: unknown): void {
    this.emit("error", message, context, error);
  }

  private emit(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minimumLevel]) {
      return;
    }

    const event = createLogEvent(level, message, context, error);
    const serialized = JSON.stringify(event);

    if (level === "error") {
      console.error(serialized);
      return;
    }
    if (level === "warn") {
      console.warn(serialized);
      return;
    }
    console.log(serialized);
  }
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export function createLogEvent(level: LogLevel, message: string, context?: LogContext, error?: unknown): LogEvent {
  const redactedContext = context ? (redactUnknown(context) as LogContext) : undefined;
  const redactedError = toLogError(error);

  return {
    level,
    message: redactText(message),
    timestamp: new Date().toISOString(),
    ...(redactedContext ? { context: redactedContext } : {}),
    ...(redactedError ? { error: redactedError } : {})
  };
}

function toLogError(error: unknown): LogError | undefined {
  if (!error) {
    return undefined;
  }
  if (error instanceof Error) {
    const maybeProvider = error as Error & { readonly code?: unknown; readonly retryable?: unknown };
    return {
      name: redactText(error.name),
      message: redactText(error.message),
      ...(typeof maybeProvider.code === "string" ? { code: redactText(maybeProvider.code) } : {}),
      ...(typeof maybeProvider.retryable === "boolean" ? { retryable: maybeProvider.retryable } : {})
    };
  }

  const redacted = redactUnknown(error);
  return {
    name: typeof error,
    message: typeof redacted === "string" ? redacted : JSON.stringify(redacted)
  };
}
