/**
 * Semantic visual inspector powered by the configured LLM provider.
 * It reviews sampled frames against production expectations and returns machine-readable findings.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { LlmProvider } from "../providers/contracts.js";
import type {
  SemanticVisualFinding,
  SemanticVisualInspectionOptions,
  SemanticVisualInspectionReport
} from "../types/visual-inspection.js";
import type { FrameSample } from "../types/media.js";

interface VisualInspectionJson {
  readonly status: "pass" | "warn" | "fail";
  readonly findings: readonly SemanticVisualFinding[];
}

const VISUAL_INSPECTION_SCHEMA = {
  type: "object",
  required: ["status", "findings"],
  properties: {
    status: { type: "string", enum: ["pass", "warn", "fail"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "checkpoint", "evidence", "recommendation"],
        properties: {
          severity: { type: "string", enum: ["S0", "S1", "S2", "S3"] },
          checkpoint: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export class SemanticVisualInspector {
  private readonly llmProvider: LlmProvider;
  private readonly defaultModelId: string;

  public constructor(llmProvider: LlmProvider, defaultModelId: string) {
    this.llmProvider = llmProvider;
    this.defaultModelId = defaultModelId;
  }

  public async inspect(
    frames: readonly FrameSample[],
    options: SemanticVisualInspectionOptions,
    signal?: AbortSignal
  ): Promise<SemanticVisualInspectionReport> {
    if (!options.enabled) {
      return {
        status: "pass",
        frameCount: 0,
        findings: [],
        reviewedFrames: []
      };
    }
    const reviewedFrames = frames.slice(0, options.maxFrames);
    if (reviewedFrames.length === 0) {
      return {
        status: "warn",
        frameCount: 0,
        findings: [
          {
            severity: "S2",
            checkpoint: "frame_samples",
            evidence: "Semantic inspection was enabled but no frame samples were available.",
            recommendation: "Enable frameSamplingOptions or verify FFmpeg frame extraction."
          }
        ],
        reviewedFrames
      };
    }

    const frameParts = await Promise.all(
      reviewedFrames.map(async (frame) => ({
        type: "image_url" as const,
        image_url: {
          url: await this.toDataUrl(frame.path)
        }
      }))
    );

    const response = await this.llmProvider.structured<VisualInspectionJson, typeof VISUAL_INSPECTION_SCHEMA>(
      {
        modelId: options.modelId ?? this.defaultModelId,
        instruction:
          "Review sampled video frames for commercial delivery quality. Return concise JSON only and do not invent issues not visible in the frames.",
        schema: VISUAL_INSPECTION_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are CineJelly's semantic visual inspector. Check identity drift, product distortion, temporal coherence, visual artifacts, composition, and delivery blockers."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  expectations: options.expectations,
                  frameCount: reviewedFrames.length
                })
              },
              ...frameParts
            ]
          }
        ]
      },
      signal
    );

    return {
      status: response.value.status,
      frameCount: reviewedFrames.length,
      findings: response.value.findings,
      reviewedFrames
    };
  }

  private async toDataUrl(path: string): Promise<string> {
    const data = await readFile(path);
    const mime = this.mimeType(path);
    return `data:${mime};base64,${data.toString("base64")}`;
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
