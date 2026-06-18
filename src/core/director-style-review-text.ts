const MAX_REVIEW_TEXT_LENGTH = 500;

const UNSAFE_REVIEW_TEXT_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /apikey-[A-Za-z0-9]{20,}/gi,
  /(api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)\s*[:=]\s*["']?[^"',\s&]+/gi,
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization)=)[^&#\s]+/gi,
  /[A-Za-z]:\\[^\s"'<>]+/g,
  /\/(?:home|Users|var|tmp)\/[^\s"'<>]+/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /(?:file|s3|gs|ftp):\/\/[^\s"'<>]+/gi,
  /data:[^\s"'<>]+/gi
];

export function safeDirectorStyleReviewText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();
  if (text.length === 0 || text.length > MAX_REVIEW_TEXT_LENGTH || /[\u0000-\u001f\u007f]/.test(text)) {
    return undefined;
  }
  return containsUnsafeReviewText(text) ? undefined : text;
}

export function safeDirectorStyleReviewFindings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => safeDirectorStyleReviewText(item))
    .filter((item): item is string => item !== undefined);
}

export function containsUnsafeReviewText(value: string): boolean {
  return UNSAFE_REVIEW_TEXT_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
