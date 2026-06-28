/**
 * Long Director planner.
 * Translates Seedance shot-list/continuity behavior and checkpoint discipline into a
 * long-form-only planning artifact.
 */

import type { StoryPlan } from "../types/agent.js";
import type {
  LongDirectorFinding,
  LongDirectorNarrativeMode,
  LongDirectorPlan,
  LongDirectorPlanStatus
} from "../types/long-director.js";
import type { LongFormContinuityPlan } from "../types/long-form-continuity.js";
import type { LongFormCreativeQualityFinding, LongFormCreativeStoryBible } from "../types/long-form-creative-intelligence.js";
import type { ShotContract } from "../types/prompt.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  LONG_DIRECTOR_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_DIRECTOR_SOURCE_PATTERN_IDS);

export interface LongDirectorPlannerInput {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly continuityPlan: LongFormContinuityPlan;
  readonly storyBible: LongFormCreativeStoryBible;
  readonly shots: readonly ShotContract[];
  readonly findings: readonly LongFormCreativeQualityFinding[];
}

export class LongDirectorPlanner {
  public build(input: LongDirectorPlannerInput): LongDirectorPlan {
    const narrativeMode = narrativeModeFor(input);
    const findings = this.findings(input, narrativeMode);
    const status = statusFor(findings);
    const seriesMode = narrativeMode === "series_episode";
    const preserveAnchors = uniqueStrings([
      ...input.continuityPlan.globalAnchors.identity,
      ...input.continuityPlan.globalAnchors.product,
      ...input.continuityPlan.globalAnchors.environment,
      ...input.continuityPlan.globalAnchors.style
    ]);

    return {
      schemaVersion: "cinejelly.long-director.v1",
      directorId: createStableId(
        "long_director",
        [
          input.projectId,
          input.storyPlan.targetDurationSeconds,
          input.continuityPlan.sequenceCount,
          input.continuityPlan.shotCount,
          narrativeMode,
          preserveAnchors.join("|")
        ].join(":")
      ),
      projectId: input.projectId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      storyPlan: {
        narrativeMode,
        centralQuestionRequired: true,
        sequencePurposeRequired: true,
        payoffRequired: true,
        recommendedActs: recommendedActsFor(input, narrativeMode)
      },
      continuityPlan: {
        mode: seriesMode ? "series_bible_required" : "project_bible",
        characterBibleRequired: seriesMode || input.continuityPlan.globalAnchors.identity.length > 0,
        worldBibleRequired: seriesMode || input.continuityPlan.globalAnchors.environment.length > 0,
        bridgeEverySequence: true,
        preserveAnchors
      },
      repairPlan: {
        narrowRepairRequired: true,
        preferredOrder: ["story", "sequence", "shot", "prompt", "rerender", "postproduction"],
        rerenderOnlyAffectedShots: true
      },
      checkpointPolicy: {
        requiredStages: seriesMode
          ? ["story", "scene_plan", "references", "sample", "render", "publish"]
          : ["story", "scene_plan", "references", "render", "publish"],
        pauseBeforeProviderSpend: true,
        pauseBeforeCustomerRelease: true
      },
      findings,
      directorDirectives: directorDirectivesFor(input, narrativeMode),
      releaseGateSummary: {
        canUseAsNoSpendDirectorEvidence: true,
        canProceedToLongPlanning: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Long Director found blocked story, sequence, or continuity dependencies."
          : "Long Director is planning evidence only; release still requires render evidence, artifact validation, manual review, and business readiness."
      }
    };
  }

  private findings(input: LongDirectorPlannerInput, narrativeMode: LongDirectorNarrativeMode): readonly LongDirectorFinding[] {
    const findings: LongDirectorFinding[] = [];

    if (narrativeMode === "series_episode") {
      findings.push({
        code: "series_bible_required",
        severity: "warn",
        message: "Series-style long-form work requires a persistent character/world bible across episodes.",
        repair: "Attach or create a series bible before claiming multi-episode continuity.",
        affectedSequenceIds: input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        affectedShotIds: input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds)
      });
    }

    if (input.storyPlan.targetDurationSeconds >= 120 && input.continuityPlan.sequenceCount < 3) {
      findings.push({
        code: "long_duration_needs_hierarchical_planning",
        severity: "block",
        message: "Long-form duration needs at least setup, development, and payoff sequence movement.",
        repair: "Regenerate sequence grouping before provider spend.",
        affectedSequenceIds: input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        affectedShotIds: input.shots.map((shot) => shot.shotId)
      });
    }

    const expectedBridgeCount = Math.max(0, input.continuityPlan.sequenceCount - 1);
    if (input.continuityPlan.bridgeCount !== expectedBridgeCount) {
      findings.push({
        code: "sequence_bridge_required",
        severity: "block",
        message: "Every non-final long-form sequence needs bridge evidence for continuity.",
        repair: "Repair continuity bridge evidence before prompt compilation.",
        affectedSequenceIds: input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        affectedShotIds: input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds)
      });
    }

    for (const kind of ["identity", "product", "environment", "style"] as const) {
      if (input.continuityPlan.globalAnchors[kind].length === 0) {
        findings.push({
          code: "continuity_anchor_gap",
          severity: "warn",
          message: `Long-form continuity has no global ${kind} anchor.`,
          repair: `Add a ${kind} reference, story-bible rule, or continuity note when this anchor matters to the project.`,
          affectedSequenceIds: input.continuityPlan.sequences.map((sequence) => sequence.sequenceId),
          affectedShotIds: input.continuityPlan.sequences.flatMap((sequence) => sequence.shotIds)
        });
      }
    }

    if (input.findings.some((finding) => finding.severity === "block")) {
      findings.push({
        code: "blocked_dependency",
        severity: "block",
        message: "Creative intelligence has blocking findings that must be resolved before long-form render.",
        repair: "Resolve blocking creative, timeline, strategy, or agent-review findings before provider spend.",
        affectedSequenceIds: input.findings.flatMap((finding) => finding.affectedSequenceIds),
        affectedShotIds: input.findings.flatMap((finding) => finding.affectedShotIds)
      });
    }

    if (input.shots.some((shot) => shot.risks.length > 0)) {
      findings.push({
        code: "repair_scope_must_stay_narrow",
        severity: "info",
        message: "Risk-sensitive long-form shots should use narrow repair scopes instead of restarting the whole project.",
        repair: "Repair story, sequence, shot, prompt, or rerender only the affected node based on Guardian evidence.",
        affectedSequenceIds: input.continuityPlan.sequences
          .filter((sequence) => sequence.riskCodes.length > 0)
          .map((sequence) => sequence.sequenceId),
        affectedShotIds: input.shots.filter((shot) => shot.risks.length > 0).map((shot) => shot.shotId)
      });
    }

    if (input.storyPlan.targetDurationSeconds >= 90 || narrativeMode === "series_episode") {
      findings.push({
        code: "sample_checkpoint_recommended",
        severity: "info",
        message: "High-value long-form work should use a sample or preview checkpoint before full provider spend.",
        repair: "Render or review a small representative segment before committing to the full render budget.",
        affectedSequenceIds: input.continuityPlan.sequences.slice(0, 1).map((sequence) => sequence.sequenceId),
        affectedShotIds: input.continuityPlan.sequences.slice(0, 1).flatMap((sequence) => sequence.shotIds)
      });
    }

    return findings;
  }
}

function narrativeModeFor(input: LongDirectorPlannerInput): LongDirectorNarrativeMode {
  const text = `${input.storyPlan.premise} ${input.storyBible.logline} ${input.storyBible.centralQuestion}`.toLowerCase();
  if (text.includes("episode") || text.includes("series") || text.includes("drama")) return "series_episode";
  if (text.includes("documentary") || text.includes("explain") || text.includes("case study")) return "documentary_explainer";
  if (text.includes("training") || text.includes("course") || text.includes("lesson")) return "training_or_education";
  if (text.includes("brand") || text.includes("campaign") || text.includes("launch")) return "brand_film";
  return "single_long_story";
}

function recommendedActsFor(input: LongDirectorPlannerInput, narrativeMode: LongDirectorNarrativeMode): readonly string[] {
  if (narrativeMode === "series_episode") {
    return ["previous-state anchor", "episode promise", "escalation", "turning point", "episode payoff", "next-episode bridge"];
  }
  if (input.storyPlan.targetDurationSeconds >= 120) {
    return ["hook/setup", "development/proof", "payoff/resolution"];
  }
  return ["hook", "proof", "payoff"];
}

function directorDirectivesFor(input: LongDirectorPlannerInput, narrativeMode: LongDirectorNarrativeMode): readonly string[] {
  return [
    `Keep Long pipeline separate; optimize for ${narrativeMode}, not short-form viral pacing.`,
    "Write prompts only after shot list, continuity anchors, sequence purpose, and bridge evidence are stable.",
    "Preserve character, product, environment, style, and endpoint anchors across sequences.",
    "Use narrow repair scopes: story -> sequence -> shot -> prompt -> rerender -> postproduction.",
    input.storyPlan.targetDurationSeconds >= 90
      ? "Require a sample or preview checkpoint before spending the full long-form render budget."
      : "Keep story and scene-plan approval before provider spend."
  ];
}

function statusFor(findings: readonly LongDirectorFinding[]): LongDirectorPlanStatus {
  if (findings.some((finding) => finding.severity === "block")) return "blocked";
  if (findings.some((finding) => finding.severity === "warn")) return "review_required";
  return "ready";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
