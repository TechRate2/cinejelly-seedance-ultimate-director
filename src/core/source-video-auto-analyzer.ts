/**
 * Opt-in source-video auto analysis adapter.
 * It samples bounded frames from a safe source-video reference and asks the configured LLM provider for structure.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { SourceVideoAnalyst } from "../agents/source-video-analyst.js";
import type { LlmProvider } from "../providers/contracts.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { FrameSample, FrameSamplingOptions } from "../types/media.js";
import type { PromptReference } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import type { SourceVideoAutoAnalysisSettings } from "../types/settings.js";
import { MediaInspector } from "./media-inspector.js";

export interface SourceVideoFrameSampler {
  sampleFrames(path: string, options: FrameSamplingOptions, signal?: AbortSignal): Promise<readonly FrameSample[]>;
}

export interface SourceVideoAutoAnalyzerInput {
  readonly llmProvider: LlmProvider;
  readonly defaultModelId: string;
  readonly mediaInspector?: SourceVideoFrameSampler;
  readonly sourceVideoAnalyst?: SourceVideoAnalyst;
}

type SourceVideoAnalysisJson = SourceVideoDeconstruction;

const SECRET_QUERY_KEY_PATTERN = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|auth)/i;

const SOURCE_VIDEO_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    sourceReferenceLabel: { type: "string" },
    transformationIntent: { type: "string" },
    transcript: {
      type: "array",
      items: {
        type: "object",
        required: ["startSecond", "endSecond", "text"],
        properties: {
          startSecond: { type: "number" },
          endSecond: { type: "number" },
          text: { type: "string" }
        }
      }
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        required: ["sceneId", "startSecond", "endSecond", "summary"],
        properties: {
          sceneId: { type: "string" },
          startSecond: { type: "number" },
          endSecond: { type: "number" },
          summary: { type: "string" },
          pacing: { type: "string" },
          camera: { type: "string" },
          audio: { type: "string" },
          visualStyle: { type: "string" },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              required: ["timestampSecond", "description"],
              properties: {
                timestampSecond: { type: "number" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    },
    pacingNotes: { type: "array", items: { type: "string" } },
    styleNotes: { type: "array", items: { type: "string" } },
    structuralBeats: { type: "array", items: { type: "string" } },
    safetyNotes: { type: "array", items: { type: "string" } }
  }
} satisfies Record<string, unknown>;

export class SourceVideoAutoAnalyzer {
  private readonly llmProvider: LlmProvider;
  private readonly defaultModelId: string;
  private readonly mediaInspector: SourceVideoFrameSampler;
  private readonly sourceVideoAnalyst: SourceVideoAnalyst;

  public constructor(input: SourceVideoAutoAnalyzerInput) {
    this.llmProvider = input.llmProvider;
    this.defaultModelId = input.defaultModelId;
    this.mediaInspector = input.mediaInspector ?? new MediaInspector();
    this.sourceVideoAnalyst = input.sourceVideoAnalyst ?? new SourceVideoAnalyst();
  }

  public async prepareRequest(
    request: CineJellyProjectRequest,
    settings: SourceVideoAutoAnalysisSettings,
    signal?: AbortSignal
  ): Promise<CineJellyProjectRequest> {
    if (!settings.enabled || request.sourceVideoAnalysis) {
      return request;
    }

    const sourceReference = this.sourceVideoReference(request.references ?? []);
    if (!sourceReference) {
      return request;
    }

    const sourceUri = this.safeHttpsSourceUri(sourceReference);
    if (!sourceUri) {
      return request;
    }

    try {
      const frames = await this.mediaInspector.sampleFrames(
        sourceUri,
        {
          enabled: true,
          outputDirectory: settings.workDirectory,
          intervalSeconds: settings.frameIntervalSeconds,
          maxFrames: settings.maxFrames
        },
        signal
      );
      if (frames.length === 0) {
        throw new Error("Source-video auto analysis produced no frame samples.");
      }

      const analysis = await this.analyzeFrames({
        userInput: request.userInput,
        sourceReference,
        frames: frames.slice(0, settings.maxFrames),
        signal
      });
      const normalized = this.sourceVideoAnalyst.normalize(analysis, request.references ?? []);
      if (!normalized || !this.hasUsableAnalysis(normalized)) {
        throw new Error("Source-video auto analysis returned no usable deconstruction content.");
      }
      this.assertNoFrameLeakage(normalized, frames);
      return {
        ...request,
        sourceVideoAnalysis: normalized
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (settings.failOnError) {
        throw error;
      }
      return request;
    }
  }

  private async analyzeFrames(input: {
    readonly userInput: string;
    readonly sourceReference: PromptReference;
    readonly frames: readonly FrameSample[];
    readonly signal: AbortSignal | undefined;
  }): Promise<SourceVideoAnalysisJson> {
    const frameParts = await Promise.all(
      input.frames.map(async (frame) => ({
        type: "image_url" as const,
        image_url: {
          url: await this.toDataUrl(frame.path)
        }
      }))
    );

    const response = await this.llmProvider.structured<SourceVideoAnalysisJson, typeof SOURCE_VIDEO_ANALYSIS_SCHEMA>(
      {
        modelId: this.defaultModelId,
        instruction:
          "Return bounded source-video deconstruction JSON only. Do not include local frame paths, data URLs, signed URLs, or copied transcript wording.",
        schema: SOURCE_VIDEO_ANALYSIS_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are CineJelly's source video analyst. Extract reusable structure only: pacing, camera grammar, scene rhythm, style notes, and safety constraints. Do not copy exact shots, transcript wording, likenesses, logos, brand marks, or protected expression."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  userInput: input.userInput,
                  sourceReferenceLabel: input.sourceReference.label,
                  frameCount: input.frames.length,
                  requiredOutput:
                    "Set sourceReferenceLabel to the provided label. Produce concise scenes, keyframe descriptions without uri, pacing notes, style notes, structural beats, and safety notes."
                })
              },
              ...frameParts
            ]
          }
        ],
        metadata: {
          sourceReferenceLabel: input.sourceReference.label,
          operation: "source_video_auto_analysis"
        },
        maxTokens: 3_000,
        temperature: 0.1
      },
      input.signal
    );

    return {
      ...response.value,
      sourceReferenceLabel: input.sourceReference.label
    };
  }

  private sourceVideoReference(references: readonly PromptReference[]): PromptReference | undefined {
    return references.find((reference) => reference.role === "source_video_structure");
  }

  private hasUsableAnalysis(analysis: SourceVideoDeconstruction): boolean {
    return Boolean(
      analysis.transformationIntent ||
        analysis.transcript?.length ||
        analysis.scenes?.length ||
        analysis.pacingNotes?.length ||
        analysis.styleNotes?.length ||
        analysis.structuralBeats?.length ||
        analysis.safetyNotes?.length
    );
  }

  private assertNoFrameLeakage(analysis: SourceVideoDeconstruction, frames: readonly FrameSample[]): void {
    const framePaths = new Set(frames.map((frame) => frame.path.toLowerCase()));
    for (const value of this.analysisStrings(analysis)) {
      const normalized = value.toLowerCase();
      if (normalized.includes("data:image") || normalized.includes(";base64,")) {
        throw new Error("Source-video auto analysis output must not include inline frame data.");
      }
      for (const framePath of framePaths) {
        if (framePath && normalized.includes(framePath)) {
          throw new Error("Source-video auto analysis output must not include local frame paths.");
        }
      }
    }
  }

  private analysisStrings(value: unknown): readonly string[] {
    if (typeof value === "string") {
      return [value];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.analysisStrings(item));
    }
    if (value && typeof value === "object") {
      return Object.values(value).flatMap((item) => this.analysisStrings(item));
    }
    return [];
  }

  private safeHttpsSourceUri(reference: PromptReference): string | undefined {
    let parsed: URL;
    try {
      parsed = new URL(reference.providerReference.uri);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return undefined;
    }
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_QUERY_KEY_PATTERN.test(key)) {
        return undefined;
      }
    }
    return parsed.toString();
  }

  private async toDataUrl(path: string): Promise<string> {
    const data = await readFile(path);
    return `data:${this.mimeType(path)};base64,${data.toString("base64")}`;
  }

  private mimeType(path: string): string {
    const extension = extname(path).toLowerCase();
    if (extension === ".png") {
      return "image/png";
    }
    if (extension === ".webp") {
      return "image/webp";
    }
    return "image/jpeg";
  }
}
