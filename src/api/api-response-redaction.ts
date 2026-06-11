/**
 * API response redaction for deployment-local filesystem paths.
 * Runtime artifacts keep full paths internally, while public JSON responses expose only safe operational fields.
 */

const REDACTED_LOCAL_PATH = "[REDACTED_LOCAL_PATH]";

const PUBLIC_URI_PATTERN = /^(https?:\/\/|asset:\/\/|data:)/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const UNC_PATH_PATTERN = /^\\\\[^\\]+\\/;
const POSIX_ABSOLUTE_PATH_PATTERN = /^\//;
const RELATIVE_PATH_PATTERN = /^\.{1,2}[\\/]/;

export function redactApiLocalPaths(value: unknown): unknown {
  return redactValue(value, undefined);
}

function redactValue(value: unknown, key: string | undefined): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return shouldRedactPathValue(key, value) ? REDACTED_LOCAL_PATH : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey)
      ])
    );
  }
  return value;
}

function shouldRedactPathValue(key: string | undefined, value: string): boolean {
  if (!key || !keyMayContainPath(key) || !value.trim() || PUBLIC_URI_PATTERN.test(value)) {
    return false;
  }
  return looksLikeLocalPath(value);
}

function keyMayContainPath(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "path" ||
    normalized === "outputurl" ||
    normalized.endsWith("path") ||
    normalized.endsWith("directory") ||
    normalized.endsWith("urlorpath")
  );
}

function looksLikeLocalPath(value: string): boolean {
  return (
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
    UNC_PATH_PATTERN.test(value) ||
    POSIX_ABSOLUTE_PATH_PATTERN.test(value) ||
    RELATIVE_PATH_PATTERN.test(value) ||
    value.includes("\\")
  );
}
