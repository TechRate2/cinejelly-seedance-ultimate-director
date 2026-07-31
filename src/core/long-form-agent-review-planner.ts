/**
 * Deterministic long-form agentic review board.
 * It translates reference-consistency and agentic-video review into CineJelly-owned no-spend evidence.
 */

import type { StoryPlan } from "../types/agent.js";
import type {
  LongFormAgentReviewDecision,
  LongFormAgentReviewFinding,
  LongFormAgentReviewPlan,
  LongFormAgentReviewRole,
  LongFormAgentReviewSeverity,
  LongFormAgentReviewStatus
} from "../types/long-form-agent-review.js";
import type { LongFormContinuityPlan, LongFormContinuitySequence } from "../types/long-form-continuity.js";
import type { ShotContract } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  LONG_FORM_REVIEW_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(LONG_FORM_REVIEW_SOURCE_PATTERN_IDS);

const REVIEW_ROLES: readonly LongFormAgentReviewRole[] = [
  "script_architect",
  "continuity_supervisor",
  "source_video_reviewer",
  "render_orchestrator",
  "commercial_risk_reviewer"
] as const;

export class LongFormAgentReviewPlanner {
  public build(input: {
    readonly projectId: string;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
    readonly continuityPlan: LongFormContinuityPlan;
    readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
  }): LongFormAgentReviewPlan {
    const findings = [
      ...this.scriptFindings(input.storyPlan, input.shots, input.continuityPlan),
      ...this.continuityFindings(input.continuityPlan),
      ...this.sourceVideoFindings(input.continuityPlan, input.sourceVideoAnalysis),
      ...this.renderOrchestrationFindings(input.continuityPlan, input.shots),
      ...this.commercialFindings(input.storyPlan, input.shots, input.continuityPlan)
    ];
    const decisions = REVIEW_ROLES.map((role) => this.decision(role, findings));
    const status = statusFor(findings);
    const directives = uniqueValues([
      ...decisions.map((decision) => decision.priorityDirective),
      ...findings.map((finding) => finding.repairDirective)
    ]);

    return {
      schemaVersion: "cinejelly.long-form-agent-review.v1",
      projectId: input.projectId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      targetDurationSeconds: input.storyPlan.targetDurationSeconds,
      agentCount: REVIEW_ROLES.length,
      reviewedSequenceCount: input.continuityPlan.sequenceCount,
      reviewedShotCount: input.shots.length,
      findingCount: findings.length,
      blockingFindingCount: findings.filter((finding) => finding.severity === "block").length,
      reviewRequiredFindingCount: findings.filter((finding) => finding.severity === "warn").length,
      decisions,
      findings,
      directives,
      releaseGateSummary: {
        canProceedToPromptCompilation: status !== "blocked",
        canUseAsNoSpendAgenticReviewEvidence: true,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Long-form agentic review found blocking planning evidence before provider spend."
          : "Long-form agentic review is no-spend planning evidence only; paid render, manual review, deployment, and commercial approval remain separate gates."
      }
    };
  }

  private scriptFindings(
    storyPlan: StoryPlan,
    shots: readonly ShotContract[],
    continuityPlan: LongFormContinuityPlan
  ): readonly LongFormAgentReviewFinding[] {
    const findings: LongFormAgentReviewFinding[] = [];
    if (storyPlan.scenes.length === 0 || shots.length === 0) {
      findings.push(finding("script_architect", "block", "empty_story_or_shots", "Story or shot plan is empty.", "Regenerate the story and shot plan before prompt compilation.", [], []));
    }
    const plannedDurationSeconds = storyPlan.scenes.reduce(
      (sum, scene) => sum + scene.beats.reduce((beatSum, beat) => beatSum + beat.durationSeconds, 0),
      0
    );
    const durationDelta = Math.abs(plannedDurationSeconds - storyPlan.targetDurationSeconds);
    if (storyPlan.targetDurationSeconds > 0 && durationDelta / storyPlan.targetDurationSeconds > 0.15) {
      findings.push(finding(
        "script_architect",
        "warn",
        "duration_drift",
        "Scene beat durations drift from the requested long-form duration.",
        "Rebalance scene and beat durations before paid validation.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        shots.map((shot) => shot.shotId),
        { plannedDurationSeconds, targetDurationSeconds: storyPlan.targetDurationSeconds }
      ));
    }
    if (storyPlan.targetDurationSeconds >= 120 && continuityPlan.sequenceCount < 3) {
      findings.push(finding(
        "script_architect",
        "block",
        "insufficient_long_form_sequences",
        "A long-form request needs at least three sequence movements.",
        "Regenerate sequence grouping so the story has setup, development, and payoff evidence.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        [],
        { sequenceCount: continuityPlan.sequenceCount }
      ));
    }
    return findings;
  }

  private continuityFindings(continuityPlan: LongFormContinuityPlan): readonly LongFormAgentReviewFinding[] {
    const findings: LongFormAgentReviewFinding[] = [];
    const missingAnchorKinds = (["identity", "product", "environment", "style"] as const).filter(
      (kind) => continuityPlan.globalAnchors[kind].length === 0
    );
    if (missingAnchorKinds.length > 0) {
      findings.push(finding(
        "continuity_supervisor",
        "warn",
        "missing_global_anchors",
        "Long-form continuity is missing one or more global anchor classes.",
        "Add identity, product, environment, and style anchors before paid long-form validation.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
        { missingAnchorKindCount: missingAnchorKinds.length }
      ));
    }
    for (const sequence of continuityPlan.sequences) {
      if (sequence.order < continuityPlan.sequenceCount - 1 && !sequence.bridgeToNext) {
        findings.push(finding(
          "continuity_supervisor",
          "block",
          "missing_sequence_bridge",
          "A non-final sequence is missing bridge-to-next continuity evidence.",
          "Regenerate long-form continuity bridges before prompt compilation.",
          [sequence.sequenceId],
          sequence.shotIds,
          { sequenceOrder: sequence.order }
        ));
      }
      if (sequence.riskCodes.length > 0 && sequence.renderModeRecommendation !== "sequential_recommended") {
        findings.push(finding(
          "continuity_supervisor",
          "block",
          "risk_not_sequential",
          "A risky sequence is not marked sequential_recommended.",
          "Keep risky identity, product, transition, and source-video sequences in sequential render mode.",
          [sequence.sequenceId],
          sequence.shotIds,
          { riskCodeCount: sequence.riskCodes.length }
        ));
      }
    }
    return findings;
  }

  private sourceVideoFindings(
    continuityPlan: LongFormContinuityPlan,
    sourceVideoAnalysis: SourceVideoDeconstruction | undefined
  ): readonly LongFormAgentReviewFinding[] {
    if (!sourceVideoAnalysis?.scenes?.length) {
      return [];
    }
    const anchoredSourceSceneCount = continuityPlan.globalAnchors.sourceVideoSceneIds.length;
    if (anchoredSourceSceneCount === 0) {
      return [
        finding(
          "source_video_reviewer",
          "warn",
          "source_video_not_anchored",
          "Source-video analysis exists but continuity evidence has no source scene anchors.",
          "Bind source-video scene IDs into sequence continuity before paid source-video validation.",
          continuityPlan.sequences.map((sequence) => sequence.sequenceId),
          continuityPlan.sequences.flatMap((sequence) => sequence.shotIds),
          { sourceVideoSceneCount: sourceVideoAnalysis.scenes.length }
        )
      ];
    }
    return [
      finding(
        "source_video_reviewer",
        "info",
        "source_video_anchor_ready",
        "Source-video scene structure is present in continuity evidence.",
        "Preserve source scene IDs as planning evidence and do not serialize raw source media URLs.",
        continuityPlan.sequences.filter((sequence) => sequence.anchors.sourceVideoSceneIds.length > 0).map((sequence) => sequence.sequenceId),
        [],
        { sourceVideoSceneCount: sourceVideoAnalysis.scenes.length, anchoredSourceSceneCount }
      )
    ];
  }

  private renderOrchestrationFindings(
    continuityPlan: LongFormContinuityPlan,
    shots: readonly ShotContract[]
  ): readonly LongFormAgentReviewFinding[] {
    const findings: LongFormAgentReviewFinding[] = [];
    const expectedBridgeCount = Math.max(0, continuityPlan.sequenceCount - 1);
    if (continuityPlan.bridgeCount !== expectedBridgeCount) {
      findings.push(finding(
        "render_orchestrator",
        "block",
        "bridge_count_mismatch",
        "Continuity bridge count does not match sequence count.",
        "Repair sequence bridge evidence before render scheduling.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        [],
        { bridgeCount: continuityPlan.bridgeCount, expectedBridgeCount }
      ));
    }
    const sequenceShotCount = continuityPlan.sequences.reduce((sum, sequence) => sum + sequence.shotIds.length, 0);
    if (sequenceShotCount !== shots.length) {
      findings.push(finding(
        "render_orchestrator",
        "block",
        "shot_coverage_mismatch",
        "Continuity sequences do not cover every planned shot.",
        "Regenerate continuity evidence so every planned shot belongs to exactly one sequence.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        shots.map((shot) => shot.shotId),
        { sequenceShotCount, plannedShotCount: shots.length }
      ));
    }
    return findings;
  }

  private commercialFindings(
    storyPlan: StoryPlan,
    shots: readonly ShotContract[],
    continuityPlan: LongFormContinuityPlan
  ): readonly LongFormAgentReviewFinding[] {
    const findings: LongFormAgentReviewFinding[] = [];
    if (storyPlan.targetDurationSeconds > 480) {
      findings.push(finding(
        "commercial_risk_reviewer",
        "block",
        "duration_over_commercial_gate",
        "Target duration exceeds the current 8-minute commercial validation envelope.",
        "Split the request or approve a new validation envelope before provider spend.",
        continuityPlan.sequences.map((sequence) => sequence.sequenceId),
        shots.map((shot) => shot.shotId),
        { targetDurationSeconds: storyPlan.targetDurationSeconds }
      ));
    } else if (storyPlan.targetDurationSeconds >= 120 && continuityPlan.highRiskSequenceCount > 0) {
      findings.push(finding(
        "commercial_risk_reviewer",
        "warn",
        "manual_review_required_for_high_risk_sequences",
        "Long-form high-risk sequences need manual media review after paid validation.",
        "Keep long-form manual quality/redaction review as a required business gate.",
        continuityPlan.sequences.filter((sequence) => sequence.renderModeRecommendation === "sequential_recommended").map((sequence) => sequence.sequenceId),
        continuityPlan.sequences
          .filter((sequence) => sequence.renderModeRecommendation === "sequential_recommended")
          .flatMap((sequence) => sequence.shotIds),
        { highRiskSequenceCount: continuityPlan.highRiskSequenceCount }
      ));
    }
    return findings;
  }

  private decision(
    role: LongFormAgentReviewRole,
    findings: readonly LongFormAgentReviewFinding[]
  ): LongFormAgentReviewDecision {
    const roleFindings = findings.filter((findingItem) => findingItem.role === role);
    const status = statusFor(roleFindings);
    return {
      role,
      status,
      findingCount: roleFindings.length,
      blockingFindingCount: roleFindings.filter((findingItem) => findingItem.severity === "block").length,
      requiredBeforeRender: uniqueValues(roleFindings.filter((findingItem) => findingItem.severity !== "info").map((findingItem) => findingItem.repairDirective)),
      priorityDirective: priorityDirective(role, status, roleFindings)
    };
  }
}

function finding(
  role: LongFormAgentReviewRole,
  severity: LongFormAgentReviewSeverity,
  code: string,
  message: string,
  repairDirective: string,
  affectedSequenceIds: readonly string[],
  affectedShotIds: readonly string[],
  evidence: Record<string, string | number | boolean> = {}
): LongFormAgentReviewFinding {
  return {
    findingId: createStableId("agent_finding", `${role}:${severity}:${code}:${message}:${affectedSequenceIds.join("|")}:${affectedShotIds.join("|")}`),
    role,
    severity,
    code,
    message,
    repairDirective,
    affectedSequenceIds,
    affectedShotIds,
    evidence
  };
}

function statusFor(findings: readonly LongFormAgentReviewFinding[]): LongFormAgentReviewStatus {
  if (findings.some((findingItem) => findingItem.severity === "block")) {
    return "blocked";
  }
  if (findings.some((findingItem) => findingItem.severity === "warn")) {
    return "review_required";
  }
  return "ready";
}

function priorityDirective(
  role: LongFormAgentReviewRole,
  status: LongFormAgentReviewStatus,
  findings: readonly LongFormAgentReviewFinding[]
): string {
  const firstActionable = findings.find((findingItem) => findingItem.severity !== "info");
  if (firstActionable) {
    return firstActionable.repairDirective;
  }
  if (status === "blocked") {
    return "Repair blocking long-form planning evidence before provider spend.";
  }
  switch (role) {
    case "script_architect":
      return "Story structure is ready for prompt compilation.";
    case "continuity_supervisor":
      return "Continuity anchors and bridges are ready for render planning.";
    case "source_video_reviewer":
      return "Source-video structure is bounded to planning evidence.";
    case "render_orchestrator":
      return "Sequence coverage is ready for render scheduling.";
    case "commercial_risk_reviewer":
      return "Commercial-risk gates remain locked until paid media and manual review evidence exist.";
  }
}

function uniqueValues(values: readonly (string | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}
