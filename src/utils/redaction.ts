/**
 * Redaction utilities for logs, ledger metadata, and provider error messages.
 * They keep operational diagnostics useful without exposing customer or provider secrets.
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  // Bearer / scheme + token (value may follow a space): consume the whole credential.
  /(Bearer|Basic|Digest)\s+[^\s"',]+/gi,
  // Known high-entropy token prefixes (OpenAI sk-, GitHub ghp_/gho_, Slack xox, Google AIza, AWS AKIA).
  /\b(?:sk-[A-Za-z0-9_\-]{8,}|gh[oprsu]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_\-]{20,}|AKIA[A-Z0-9]{12,})\b/g,
  // keyword = value / keyword : value, including JSON form "keyword":"value" (quote before colon).
  /(api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|token|secret|password|passwd|pwd|signature|credential|authorization)["']?\s*[:=]\s*["']?[^"',\s&}]+/gi,
  // URL query credentials.
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi,
  // PEM private-key blocks.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

const SECRET_KEY_PATTERN =
  /api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|token|secret|password|passwd|pwd|signature|credential|authorization/i;

/** Truncate pathological strings before regex work to bound worst-case redaction cost. */
const MAX_REDACT_TEXT_LENGTH = 200_000;
/** Depth cap so a hostile/cyclic object can never overflow the stack inside the logger. */
const MAX_REDACT_DEPTH = 12;

export function redactText(value: string): string {
  const bounded = value.length > MAX_REDACT_TEXT_LENGTH ? value.slice(0, MAX_REDACT_TEXT_LENGTH) : value;
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), bounded);
}

/**
 * Detect whether text contains a real secret, scanning the FULL string (no length truncation).
 * Used by artifact validation instead of `redactText(text) !== text`, which truncates at
 * MAX_REDACT_TEXT_LENGTH and therefore falsely flags ANY artifact larger than that limit even when
 * it holds no secret (final live-audit gap #3).
 */
export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function redactUnknown(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet());
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  // Cycle guard: return a marker instead of recursing forever (would crash the logger).
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= MAX_REDACT_DEPTH) {
    return "[Truncated]";
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, depth + 1, seen));
    }
    // Preserve Error diagnostics (message/stack are non-enumerable) with redaction.
    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactText(value.message),
        ...(value.stack ? { stack: redactText(value.stack) } : {})
      };
    }
    // Surface Map/Set contents (Object.entries would otherwise drop them).
    if (value instanceof Map) {
      return {
        __type: "Map",
        entries: [...value.entries()].map(([key, item]) => [
          redactValue(key, depth + 1, seen),
          // Only redact STRING values under a secret-like key. Real credentials are strings; a numeric
          // value under a key that merely CONTAINS "token" (e.g. completion_tokens usage counts) is not
          // a secret and wiping it destroys cost-audit data (final live-audit gap #5).
          SECRET_KEY_PATTERN.test(String(key)) && typeof item === "string" ? "[REDACTED]" : redactValue(item, depth + 1, seen)
        ])
      };
    }
    if (value instanceof Set) {
      return { __type: "Set", values: [...value.values()].map((item) => redactValue(item, depth + 1, seen)) };
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      // Only redact STRING values under a secret-like key (see the Map branch above) — this preserves
      // numeric usage counters like completion_tokens/total_tokens for cost auditing (gap #5).
      if (SECRET_KEY_PATTERN.test(key) && typeof item === "string") {
        return [key, "[REDACTED]"] as const;
      }
      return [key, redactValue(item, depth + 1, seen)] as const;
    });
    return Object.fromEntries(entries);
  } finally {
    seen.delete(value);
  }
}
