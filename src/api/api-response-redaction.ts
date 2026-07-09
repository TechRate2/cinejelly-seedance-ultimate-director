/**
 * API response redaction for deployment-local filesystem paths and internal source lineage.
 * Runtime artifacts keep full audit evidence internally, while public JSON responses expose
 * only safe operational fields.
 */

import {
  containsPrivateSourcePatternText,
  redactPrivateSourcePatternText
} from "../core/private-source-pattern-registry.js";
import { isUploadUri } from "../core/upload-reference.js";

const REDACTED_LOCAL_PATH = "[REDACTED_LOCAL_PATH]";
const REDACTED_DATA_URI = "[REDACTED_DATA_URI]";
const REDACTED_UNSAFE_URI = "[REDACTED_UNSAFE_URI]";
const REDACTED_SOURCE_PATTERN = "[REDACTED_SOURCE_PATTERN]";
const OMIT_VALUE = Symbol("omit_api_response_value");

const DATA_URI_PATTERN = /^data:/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const CREDENTIAL_QUERY_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|policy|expires|key-pair-id|x-amz-|x-goog-|x-oss-|x-ms-)/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const UNC_PATH_PATTERN = /^\\\\[^\\]+\\/;
const POSIX_ABSOLUTE_PATH_PATTERN = /^\//;
const RELATIVE_PATH_PATTERN = /^\.{1,2}[\\/]/;
const PRIVATE_SOURCE_FIELD_NAMES = new Set([
  "sourcePatternOrigins",
  "sourcePatternOrigin",
  "sourcePatternId",
  "sourcePatternIds",
  "sourceRepository",
  "sourceRepositories",
  "upstreamPaths",
  "upstreamPath",
  "snapshotPath"
]);

export function redactApiLocalPaths(value: unknown): unknown {
  return redactValue(value, undefined, false);
}

const EMBEDDED_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\s"',;)]*/g;
const EMBEDDED_UNC_PATH_PATTERN = /\\\\[^\s"',;)]*/g;
// Match an absolute POSIX path regardless of the delimiter before the leading slash (Node fs errors
// quote them: open '/path'), and include the Docker/Linux deploy roots (/app is CINEJELLY_OUTPUT_DIR
// in the shipped image). The negative lookbehind still excludes mid-URL slashes (host/seg) and paths
// glued to a word char, so real https URLs are left for the separate URI redactor.
const EMBEDDED_POSIX_PATH_PATTERN = /(?<![A-Za-z0-9_.~/])\/(?:Users|home|root|srv|data|app|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s"',;)]+/g;

/**
 * Redact absolute local paths embedded ANYWHERE inside a string (not only whole-string paths),
 * e.g. an OS error message like "ENOENT: ... open 'C:\\Users\\...\\file'". Used on outbound
 * error strings so no route or catch handler can leak deployment filesystem paths to a client.
 */
export function redactEmbeddedLocalPaths(text: string): string {
  return text
    .replace(EMBEDDED_WINDOWS_PATH_PATTERN, REDACTED_LOCAL_PATH)
    .replace(EMBEDDED_UNC_PATH_PATTERN, REDACTED_LOCAL_PATH)
    .replace(EMBEDDED_POSIX_PATH_PATTERN, REDACTED_LOCAL_PATH);
}

export function redactApiResponse(value: unknown): unknown {
  return redactValue(value, undefined, true);
}

function redactValue(value: unknown, key: string | undefined, redactPrivateSources: boolean): unknown | typeof OMIT_VALUE {
  if (redactPrivateSources && key && PRIVATE_SOURCE_FIELD_NAMES.has(key)) {
    return OMIT_VALUE;
  }
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
    if (shouldRedactPathValue(key, value)) {
      return REDACTED_LOCAL_PATH;
    }
    return redactPrivateSources ? redactPrivateSourcePatternValue(value) : value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => redactValue(item, undefined, redactPrivateSources))
      .filter((item) => item !== OMIT_VALUE);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey, redactPrivateSources)] as const)
        .filter(([, entryValue]) => entryValue !== OMIT_VALUE)
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
  if (parsed.protocol === "upload:") {
    // Server-generated opaque handle (random hex name, no credentials or query).
    return isUploadUri(value);
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

function redactPrivateSourcePatternValue(value: string): string {
  const redacted = redactPrivateSourcePatternText(value);
  if (redacted === value) {
    return value;
  }
  const trimmed = redacted.trim();
  return trimmed && !containsPrivateSourcePatternText(trimmed) ? trimmed : REDACTED_SOURCE_PATTERN;
}
