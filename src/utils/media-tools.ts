/**
 * Resolves FFmpeg/FFprobe command paths for runtime and preflight.
 */

export type MediaToolName = "ffmpeg" | "ffprobe";

const MEDIA_TOOL_ENV_NAMES: Record<MediaToolName, string> = {
  ffmpeg: "CINEJELLY_FFMPEG_PATH",
  ffprobe: "CINEJELLY_FFPROBE_PATH"
};

export function mediaToolEnvName(tool: MediaToolName): string {
  return MEDIA_TOOL_ENV_NAMES[tool];
}

export function readMediaToolCommand(
  tool: MediaToolName,
  env: NodeJS.ProcessEnv = process.env
): string {
  return normalizeMediaToolCommand(env[mediaToolEnvName(tool)]) ?? tool;
}

export function normalizeMediaToolCommand(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

export function mediaToolCommandHasControlCharacters(command: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(command);
}
