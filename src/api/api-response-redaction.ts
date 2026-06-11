/**
 * API response redaction for deployment-local filesystem paths.
 * Runtime artifacts keep full paths internally, while public JSON responses expose only safe operational fields.
 */

const REDACTED_LOCAL_PATH = "[REDACTED_LOCAL_PATH]";
const REDACTED_DATA_URI = "[REDACTED_DATA_URI]";
const REDACTED_UNSAFE_URI = "[REDACTED_UNSAFE_URI]";

const DATA_URI_PATTERN = /^data:/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const CREDENTIAL_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|policy|expires|key-pair-id|x-amz-|x-goog-|x-oss-|x-ms-)/i;
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
    if (DATA_URI_PATTERN.test(value)) {
      return REDACTED_DATA_URI;
    }
    if (URI_SCHEME_PATTERN.test(value) && !isSafePublicUri(value)) {
      return REDACTED_UNSAFE_URI;
    }
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
  if (!key || !keyMayContainPath(key) || !value.trim() || isSafePublicUri(value)) {
    return false;
  }
  return looksLikeLocalPath(value);
}

function isSafePublicUri(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "asset:") {
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  for (const key of parsed.searchParams.keys()) {
    if (CREDENTIAL_QUERY_KEY_PATTERN.test(key)) {
      return false;
    }
  }
  return true;
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
