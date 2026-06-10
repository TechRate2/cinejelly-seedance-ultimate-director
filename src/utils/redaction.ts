/**
 * Redaction utilities for logs, ledger metadata, and provider error messages.
 * They keep operational diagnostics useful without exposing customer or provider secrets.
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /sk-[A-Za-z0-9_\-]+/g,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s]+/gi
];

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/api[_-]?key|token|secret|password|authorization/i.test(key)) {
        return [key, "[REDACTED]"] as const;
      }
      return [key, redactUnknown(item)] as const;
    });
    return Object.fromEntries(entries);
  }
  return value;
}
