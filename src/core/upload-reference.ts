/**
 * Uploaded-reference handles.
 *
 * Files uploaded through the UI are stored in a confined uploads directory and referenced
 * everywhere else as an opaque `upload://<random-name>` handle. The handle carries zero
 * server information (random hex name only), so it is safe to return to API clients and to
 * keep in plans/prompts; at provider-registration time the handle is resolved back to the
 * local file and the bytes are uploaded directly to the provider, so no public host is
 * required for user references.
 */

import { join, resolve, sep } from "node:path";

export const UPLOAD_URI_PREFIX = "upload://";

/** Server-generated names only: `up_` + 16 hex chars + a whitelisted media extension. */
export const UPLOAD_FILE_NAME_PATTERN = /^up_[a-f0-9]{16,64}\.(png|jpg|webp|mp4|mov|mp3|wav|m4a)$/;

export function buildUploadUri(fileName: string): string {
  return `${UPLOAD_URI_PREFIX}${fileName}`;
}

export function uploadFileNameFromUri(uri: string): string | undefined {
  if (!uri.startsWith(UPLOAD_URI_PREFIX)) {
    return undefined;
  }
  const fileName = uri.slice(UPLOAD_URI_PREFIX.length);
  return UPLOAD_FILE_NAME_PATTERN.test(fileName) ? fileName : undefined;
}

export function isUploadUri(uri: string): boolean {
  return uploadFileNameFromUri(uri) !== undefined;
}

export function uploadsDirectoryFor(outputRoot: string): string {
  return join(resolve(outputRoot), "uploads");
}

/**
 * Resolve an upload:// handle to its confined local file path.
 * Returns undefined for anything that is not a strictly valid handle, and never resolves
 * outside the uploads directory.
 */
export function resolveUploadUriToPath(uri: string, outputRoot: string): string | undefined {
  const fileName = uploadFileNameFromUri(uri);
  if (!fileName) {
    return undefined;
  }
  const uploadsRoot = uploadsDirectoryFor(outputRoot);
  const resolved = resolve(uploadsRoot, fileName);
  if (!resolved.startsWith(uploadsRoot + sep)) {
    return undefined;
  }
  return resolved;
}
