/**
 * Redaction utilities for logs, ledger metadata, and provider error messages.
 * They keep operational diagnostics useful without exposing customer or provider secrets.
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /sk-[A-Za-z0-9_\-]+/g,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi
];

const SECRET_KEY_PATTERN = /api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i;

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}

export function redactUnknown(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (SECRET_KEY_PATTERN.test(key)) {
        return [key, "[REDACTED]"] as const;
      }
      return [key, redactUnknown(item)] as const;
    });
    return Object.fromEntries(entries);
  }
  return value;
}
