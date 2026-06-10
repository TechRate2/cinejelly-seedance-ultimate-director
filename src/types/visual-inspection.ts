/**
 * Semantic visual inspection types.
 * These reports are generated from frame samples by a configured multimodal LLM provider.
 */

import type { FrameSample } from "./media.js";

export interface SemanticVisualInspectionOptions {
  readonly enabled: boolean;
  readonly modelId?: string;
  readonly expectations: readonly string[];
  readonly maxFrames: number;
}

export interface SemanticVisualFinding {
  readonly severity: "S0" | "S1" | "S2" | "S3";
  readonly checkpoint: string;
  readonly evidence: string;
  readonly recommendation: string;
}

export interface SemanticVisualInspectionReport {
  readonly status: "pass" | "warn" | "fail";
  readonly frameCount: number;
  readonly findings: readonly SemanticVisualFinding[];
  readonly reviewedFrames: readonly FrameSample[];
}
