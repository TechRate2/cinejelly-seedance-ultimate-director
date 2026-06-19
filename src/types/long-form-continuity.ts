/**
 * Long-form continuity contracts.
 * They keep sequence-level story, reference, source-video, and risk anchors explicit before provider spend.
 */

import type { ContinuityRisk } from "./prompt.js";

export type LongFormSequenceRenderModeRecommendation = "parallel_safe" | "sequential_recommended";

export interface LongFormContinuityAnchors {
  readonly identity: readonly string[];
  readonly product: readonly string[];
  readonly environment: readonly string[];
  readonly style: readonly string[];
  readonly sourceVideoSceneIds: readonly string[];
}

export interface LongFormSequenceBridge {
  readonly nextSequenceId: string;
  readonly bridgeIntent: string;
  readonly requiredAnchors: readonly string[];
}

export interface LongFormContinuitySequence {
  readonly sequenceId: string;
  readonly title: string;
  readonly purpose: string;
  readonly order: number;
  readonly targetDurationSeconds: number;
  readonly sceneIds: readonly string[];
  readonly beatIds: readonly string[];
  readonly shotIds: readonly string[];
  readonly openingBeat: string;
  readonly closingBeat: string;
  readonly anchors: LongFormContinuityAnchors;
  readonly riskCodes: readonly ContinuityRisk[];
  readonly renderModeRecommendation: LongFormSequenceRenderModeRecommendation;
  readonly bridgeToNext?: LongFormSequenceBridge;
}

export interface LongFormContinuityPlan {
  readonly schemaVersion: "cinejelly.long-form-continuity.v1";
  readonly projectId: string;
  readonly targetDurationSeconds: number;
  readonly sourcePatternOrigins: readonly string[];
  readonly sequenceCount: number;
  readonly sceneCount: number;
  readonly beatCount: number;
  readonly shotCount: number;
  readonly highRiskSequenceCount: number;
  readonly sourceVideoAnchorCount: number;
  readonly bridgeCount: number;
  readonly globalAnchors: LongFormContinuityAnchors;
  readonly sequences: readonly LongFormContinuitySequence[];
}
