/**
 * Consistency Guardian types.
 * Reports are machine-readable so agents can route repair-only regeneration decisions.
 */

import type { ShotContract } from "./prompt.js";
import type { Prediction } from "./provider.js";
import type { Storyboard } from "./storyboard.js";

export type GuardianStage = "storyboard" | "preflight" | "test_take" | "render" | "timeline";

export type GuardianStatus = "pass" | "warn" | "repair" | "rerender" | "block";

export type GuardianSeverity = "S0" | "S1" | "S2" | "S3";

export interface GuardianFinding {
  readonly stage: GuardianStage;
  readonly status: GuardianStatus;
  readonly severity: GuardianSeverity;
  readonly checkpoint: string;
  readonly evidence: string;
  readonly repair: string;
}

export interface GuardianReport {
  readonly nodeId: string;
  readonly stage: GuardianStage;
  readonly status: GuardianStatus;
  readonly findings: readonly GuardianFinding[];
}

export interface CharacterBible {
  readonly characterId: string;
  readonly identityDescription: string;
  readonly requiredReferenceLabels: readonly string[];
}

export interface StyleBible {
  readonly styleId: string;
  readonly visualRules: readonly string[];
  readonly prohibitedDrift: readonly string[];
}

export interface ContinuityLedger {
  readonly characters: readonly CharacterBible[];
  readonly styles: readonly StyleBible[];
  readonly approvedShotIds: readonly string[];
}

export interface PreflightInput {
  readonly shot: ShotContract;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly ledger: ContinuityLedger;
}

export interface StoryboardInspectionInput {
  readonly storyboard: Storyboard;
  readonly shots: readonly ShotContract[];
}

export interface RenderInspectionInput {
  readonly shot: ShotContract;
  readonly prediction: Prediction;
}
