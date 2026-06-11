/**
 * HTTP media-type helpers for public API request admission.
 * Credit-spending render endpoints only accept application JSON media types.
 */

const APPLICATION_JSON_SUFFIX_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\+json$/i;

export function isApplicationJsonMediaType(headerValue: string | undefined): boolean {
  const mediaType = headerValue?.split(";")[0]?.trim().toLowerCase();
  if (!mediaType) {
    return false;
  }

  const parts = mediaType.split("/");
  if (parts.length !== 2) {
    return false;
  }

  const [type, subtype] = parts;
  if (type !== "application" || !subtype) {
    return false;
  }

  return subtype === "json" || APPLICATION_JSON_SUFFIX_PATTERN.test(subtype);
}
