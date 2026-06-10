/**
 * Render Producer submits compiled prompts to the selected video provider and waits for async completion.
 * It keeps render orchestration separate from prompt compilation and story planning.
 */

import type { VideoProvider } from "../providers/contracts.js";
import type { CompiledPrompt } from "../types/prompt.js";
import type { Prediction } from "../types/provider.js";

export class RenderProducer {
  private readonly videoProvider: VideoProvider;

  public constructor(videoProvider: VideoProvider) {
    this.videoProvider = videoProvider;
  }

  public async render(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<Prediction> {
    const initialPrediction = await this.submit(compiledPrompt, signal);
    if (initialPrediction.status === "succeeded") {
      return initialPrediction;
    }
    return this.videoProvider.waitForPrediction(initialPrediction.predictionId, signal);
  }

  private submit(compiledPrompt: CompiledPrompt, signal?: AbortSignal): Promise<Prediction> {
    switch (compiledPrompt.videoRequest.mode) {
      case "text_to_video":
        return this.videoProvider.generateTextToVideo(compiledPrompt.videoRequest, signal);
      case "image_to_video":
        return this.videoProvider.generateImageToVideo(compiledPrompt.videoRequest, signal);
      case "reference_to_video":
        return this.videoProvider.generateReferenceToVideo(compiledPrompt.videoRequest, signal);
      case "edit":
        return this.videoProvider.editVideo(compiledPrompt.videoRequest, signal);
      case "extend":
        return this.videoProvider.extendVideo(compiledPrompt.videoRequest, signal);
      case "video_to_video":
        return this.videoProvider.generateReferenceToVideo(compiledPrompt.videoRequest, signal);
    }
  }
}
