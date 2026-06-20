/**
 * Selects provider outputs that are safe to place on the final assembly timeline.
 */

import type { RenderedShot } from "../types/agent.js";
import type { AssemblyClip } from "../types/assembly.js";

const VIDEO_OUTPUT_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"] as const;

export function selectAssemblyClipsForRenderedShots(renderedShots: readonly RenderedShot[]): readonly AssemblyClip[] {
  const clips: AssemblyClip[] = [];
  for (const [shotIndex, renderedShot] of renderedShots.entries()) {
    const videoOutputs = renderedShot.prediction.outputUrls.filter(isVideoOutputUrl);
    if (videoOutputs.length === 0) {
      throw new Error(
        `Rendered shot ${renderedShot.compiledPrompt.shotId} did not include a video output URL for assembly.`
      );
    }
    for (const [outputIndex, url] of videoOutputs.entries()) {
      clips.push({
        clipId: `${renderedShot.compiledPrompt.shotId}_${outputIndex}`,
        sourceUrlOrPath: url,
        order: shotIndex + outputIndex / 100
      });
    }
  }
  return clips;
}

export function isVideoOutputUrl(value: string): boolean {
  const path = outputPathname(value).toLowerCase();
  return VIDEO_OUTPUT_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function outputPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}
