/**
 * Decides HOW a job is rendered before any money is spent: one continuous clip or several chained
 * shots, whether last-frame chaining is on, and which reference roles the plan is actually allowed
 * to use.
 *
 * The decision is derived from the customer's request, the authored story plan and the shot list
 * together, because no one of those knows enough alone — a request may ask for a single take that
 * the duration cannot hold, and a shot list may imply chaining that the selected references cannot
 * support. Disagreements are returned as issues rather than resolved silently, so a job that cannot
 * be rendered the way it was asked for is reported instead of quietly rendered a different way.
 */
import type { CineJellyProjectRequest, StoryPlan } from "../types/agent.js";
import type { ReferenceRole, ShotContract } from "../types/prompt.js";
import type {
  LastFrameChainingStatus,
  VideoRenderContinuityMode,
  VideoRenderRequestedMode,
  VideoRenderStrategyDecision,
  VideoRenderStrategyIssue,
  VideoRenderStrategyPlan,
  VideoRenderWorkflowMode
} from "../types/video-render-strategy.js";
import {
  internalSourcePatternOrigins,
  VIDEO_RENDER_STRATEGY_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SINGLE_CLIP_MAX_SECONDS = 20;
const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(VIDEO_RENDER_STRATEGY_SOURCE_PATTERN_IDS);
const REFERENCE_LOCK_ROLES = new Set<ReferenceRole>([
  "identity",
  "product",
  "wardrobe",
  "environment",
  "motion",
  "camera",
  "style",
  "first_frame",
  "last_frame"
]);

export class VideoRenderStrategyPlanner {
  public build(input: {
    readonly projectId: string;
    readonly request: CineJellyProjectRequest;
    readonly storyPlan: StoryPlan;
    readonly shots: readonly ShotContract[];
  }): VideoRenderStrategyPlan {
    const targetDurationSeconds = this.targetDurationSeconds(input.storyPlan, input.shots);
    const requestedMode = this.requestedMode(input.request.metadata);
    const selectedRoles = this.selectedRoles(input.shots);
    const requestedRoles = this.requestedRoles(input.request);
    const sourceVideoAnalysisPresent = Boolean(input.request.sourceVideoAnalysis);
    const sourceVideoReferencePresent = requestedRoles.includes("source_video_structure") ||
      selectedRoles.includes("source_video_structure");
    const hasSourceVideo = sourceVideoAnalysisPresent || sourceVideoReferencePresent;
    const requestedReferenceCount = input.request.references?.length ?? 0;
    const selectedReferenceCount = input.shots.reduce((sum, shot) => sum + shot.references.length, 0);
    const hasReferenceLock = this.hasReferenceLock(requestedRoles, selectedRoles);
    const singleClipEligible = input.shots.length <= 1 && targetDurationSeconds <= SINGLE_CLIP_MAX_SECONDS && !hasSourceVideo;
    const workflowMode = this.workflowMode({
      requestedMode,
      singleClipEligible,
      hasSourceVideo,
      hasReferenceLock,
      plannedShotCount: input.shots.length
    });
    const continuityMode = this.continuityMode(workflowMode, hasReferenceLock);
    const storyboardRequired = this.storyboardRequired(workflowMode, input.shots.length);
    const storyboardApprovalStatus = this.storyboardApprovalStatus(input.request.metadata, storyboardRequired);
    const requiresStoryboardApproval = storyboardApprovalStatus === "missing";
    const requiresReferenceLock = workflowMode === "reference_locked_single_clip" ||
      workflowMode === "reference_locked_multishot" ||
      requestedMode === "reference_locked";
    const lastFrameChaining = this.lastFrameChaining({
      workflowMode,
      continuityMode,
      shotCount: input.shots.length,
      returnLastFrame: input.request.settings?.returnLastFrame
    });
    const requiresSequentialRender = this.requiresSequentialRender({
      workflowMode,
      lastFrameChainingStatus: lastFrameChaining.status,
      shotCount: input.shots.length
    });
    const decisions = this.decisions({
      requestedMode,
      workflowMode,
      continuityMode,
      storyboardRequired,
      requiresStoryboardApproval,
      requiresSequentialRender,
      lastFrameChainingStatus: lastFrameChaining.status
    });
    const issues = this.issues({
      requestedMode,
      workflowMode,
      plannedShotCount: input.shots.length,
      hasSourceVideo,
      hasReferenceLock,
      storyboardRequired,
      requiresStoryboardApproval,
      continuityMode,
      lastFrameChainingStatus: lastFrameChaining.status,
      returnLastFrame: input.request.settings?.returnLastFrame
    });
    const blockingIssueCount = issues.filter((issue) => issue.severity === "block").length;
    const warningIssueCount = issues.filter((issue) => issue.severity === "warn").length;

    return {
      schemaVersion: "cinejelly.video-render-strategy.v1",
      projectId: input.projectId,
      generatedAt: new Date(),
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      requestedMode,
      workflowMode,
      continuityMode,
      targetDurationSeconds,
      plannedShotCount: input.shots.length,
      singleClipEligible,
      storyboardRequired,
      requiresStoryboardApproval,
      storyboardApprovalStatus,
      requiresReferenceLock,
      requiresSequentialRender,
      sourceVideoAnalysisPresent,
      referenceSummary: {
        requestedReferenceCount,
        selectedReferenceCount,
        requestedRoles,
        selectedRoles,
        primaryReferenceLabels: this.primaryReferenceLabels(input.request, input.shots)
      },
      lastFrameChaining,
      modelPolicy: {
        requestField: "modelPreferences.seedanceModelId",
        selectionPolicy: "admin_allowlist",
        ...(input.request.modelPreferences?.seedanceModelId
          ? { requestedModelId: input.request.modelPreferences.seedanceModelId }
          : {}),
        note: "UI may request a model, but runtime selection must stay inside the admin allowlist and provider capability matrix."
      },
      issueCount: issues.length,
      warningIssueCount,
      blockingIssueCount,
      issues,
      decisions,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      releaseGateSummary: {
        canProceedToPlanning: true,
        canProceedToRender: blockingIssueCount === 0,
        canUseAsNoSpendStrategyEvidence: true,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: blockingIssueCount === 0
          ? "Strategy planning is no-spend evidence only; customer traffic still requires storyboard approval, paid media validation, manual review, and deployment evidence."
          : "Strategy planning found blocking issues that must be repaired before provider spend."
      }
    };
  }

  private requestedMode(metadata: Record<string, string> | undefined): VideoRenderRequestedMode {
    const rawMode = [
      metadata?.workflowMode,
      metadata?.renderMode,
      metadata?.videoMode,
      metadata?.mode
    ].find((value): value is string => Boolean(value));
    const normalized = rawMode?.trim().toLowerCase().replace(/[\s-]+/g, "_");
    switch (normalized) {
      case "single":
      case "single_clip":
      case "one_clip":
        return "single";
      case "storyboard":
      case "storyboard_multishot":
        return "storyboard";
      case "multi_shot":
      case "multishot":
      case "multi":
        return "multishot";
      case "reference":
      case "reference_locked":
      case "ref_locked":
        return "reference_locked";
      case "source":
      case "source_video":
      case "source_video_guided":
        return "source_video";
      case "sequence":
      case "sequence_bible":
      case "production_bible":
      case "long_sequence_bible":
        return "sequence_bible";
      case "manual":
      case "manual_storyboard":
        return "manual_storyboard";
      case "auto":
      case undefined:
      case "":
        return "auto";
      default:
        return "auto";
    }
  }

  private workflowMode(input: {
    readonly requestedMode: VideoRenderRequestedMode;
    readonly singleClipEligible: boolean;
    readonly hasSourceVideo: boolean;
    readonly hasReferenceLock: boolean;
    readonly plannedShotCount: number;
  }): VideoRenderWorkflowMode {
    switch (input.requestedMode) {
      case "single":
        return input.hasReferenceLock ? "reference_locked_single_clip" : "single_clip";
      case "storyboard":
      case "multishot":
        return input.hasReferenceLock ? "reference_locked_multishot" : "storyboard_multishot";
      case "reference_locked":
        return input.singleClipEligible ? "reference_locked_single_clip" : "reference_locked_multishot";
      case "source_video":
        return "source_video_guided";
      case "sequence_bible":
        return "sequence_bible";
      case "manual_storyboard":
        return "manual_storyboard";
      case "auto":
        if (input.hasSourceVideo) {
          return "source_video_guided";
        }
        if (input.singleClipEligible) {
          return input.hasReferenceLock ? "reference_locked_single_clip" : "single_clip";
        }
        return input.hasReferenceLock ? "reference_locked_multishot" : "storyboard_multishot";
    }
  }

  private continuityMode(workflowMode: VideoRenderWorkflowMode, hasReferenceLock: boolean): VideoRenderContinuityMode {
    switch (workflowMode) {
      case "single_clip":
        return "single_clip";
      case "reference_locked_single_clip":
      case "reference_locked_multishot":
        return "reference_locked";
      case "source_video_guided":
        return "source_video_guided";
      case "sequence_bible":
        return "sequence_bible";
      case "manual_storyboard":
        return "manual_locked";
      case "storyboard_multishot":
        return hasReferenceLock ? "reference_locked" : "last_frame_chaining";
    }
  }

  private storyboardRequired(workflowMode: VideoRenderWorkflowMode, plannedShotCount: number): boolean {
    return plannedShotCount > 1 ||
      workflowMode === "storyboard_multishot" ||
      workflowMode === "reference_locked_multishot" ||
      workflowMode === "source_video_guided" ||
      workflowMode === "sequence_bible" ||
      workflowMode === "manual_storyboard";
  }

  private storyboardApprovalStatus(
    metadata: Record<string, string> | undefined,
    storyboardRequired: boolean
  ): "not_required" | "missing" | "approved" {
    if (!storyboardRequired) {
      return "not_required";
    }
    const rawValue = metadata?.storyboardApproval ?? metadata?.reviewApproval ?? metadata?.approvalStatus;
    const normalized = rawValue?.trim().toLowerCase();
    return normalized === "approved" || normalized === "operator_approved" ? "approved" : "missing";
  }

  private lastFrameChaining(input: {
    readonly workflowMode: VideoRenderWorkflowMode;
    readonly continuityMode: VideoRenderContinuityMode;
    readonly shotCount: number;
    readonly returnLastFrame: boolean | undefined;
  }): VideoRenderStrategyPlan["lastFrameChaining"] {
    if (input.shotCount <= 1 || input.workflowMode === "single_clip" || input.workflowMode === "reference_locked_single_clip") {
      return {
        status: "not_needed",
        eligibleShotCount: 0,
        requiresReturnLastFrame: false,
        reason: "Single-clip workflows do not need inter-shot endpoint chaining."
      };
    }
    const eligibleShotCount = Math.max(0, input.shotCount - 1);
    const requiresReturnLastFrame = input.continuityMode === "last_frame_chaining" ||
      input.workflowMode === "source_video_guided" ||
      input.workflowMode === "sequence_bible";
    if (requiresReturnLastFrame && input.returnLastFrame === false) {
      return {
        status: "blocked",
        eligibleShotCount,
        requiresReturnLastFrame,
        reason: "The selected workflow needs provider last-frame output, but returnLastFrame is disabled."
      };
    }
    if (input.continuityMode === "last_frame_chaining" || input.workflowMode === "sequence_bible") {
      return {
        status: "required",
        eligibleShotCount,
        requiresReturnLastFrame,
        reason: input.workflowMode === "sequence_bible"
          ? "Production-bible sequences need last-frame chaining to preserve recurring anchors across Seedance clips."
          : "Prompt-only multishot workflows need last-frame chaining to preserve continuity between generated clips."
      };
    }
    if (input.workflowMode === "reference_locked_multishot" || input.workflowMode === "source_video_guided") {
      return {
        status: "recommended",
        eligibleShotCount,
        requiresReturnLastFrame,
        reason: "Reference or source-video guided multishot workflows benefit from endpoint chaining for smoother transitions."
      };
    }
    return {
      status: "not_needed",
      eligibleShotCount: 0,
      requiresReturnLastFrame: false,
      reason: "The selected workflow does not require endpoint chaining."
    };
  }

  private requiresSequentialRender(input: {
    readonly workflowMode: VideoRenderWorkflowMode;
    readonly lastFrameChainingStatus: LastFrameChainingStatus;
    readonly shotCount: number;
  }): boolean {
    if (input.shotCount <= 1) {
      return false;
    }
    return input.workflowMode === "reference_locked_multishot" ||
      input.workflowMode === "source_video_guided" ||
      input.workflowMode === "sequence_bible" ||
      input.workflowMode === "manual_storyboard" ||
      input.lastFrameChainingStatus === "required" ||
      input.lastFrameChainingStatus === "recommended";
  }

  private decisions(input: {
    readonly requestedMode: VideoRenderRequestedMode;
    readonly workflowMode: VideoRenderWorkflowMode;
    readonly continuityMode: VideoRenderContinuityMode;
    readonly storyboardRequired: boolean;
    readonly requiresStoryboardApproval: boolean;
    readonly requiresSequentialRender: boolean;
    readonly lastFrameChainingStatus: LastFrameChainingStatus;
  }): readonly VideoRenderStrategyDecision[] {
    const decisions: VideoRenderStrategyDecision[] = [
      {
        code: "requested_mode_respected",
        message: `Requested mode '${input.requestedMode}' resolved to workflow '${input.workflowMode}'.`
      }
    ];
    switch (input.workflowMode) {
      case "single_clip":
        decisions.push({
          code: "auto_single_clip_selected",
          message: "A single render clip is sufficient for the requested duration and shot plan."
        });
        break;
      case "storyboard_multishot":
        decisions.push({
          code: "auto_storyboard_multishot_selected",
          message: "A storyboard multishot workflow is selected for a multi-beat video."
        });
        break;
      case "reference_locked_single_clip":
      case "reference_locked_multishot":
        decisions.push({
          code: "reference_lock_selected",
          message: "Reference-locked workflow is selected to preserve supplied identity, product, environment, or style anchors."
        });
        break;
      case "source_video_guided":
        decisions.push({
          code: "source_video_guided_selected",
          message: "Source-video guided workflow is selected because source structure evidence is present or explicitly requested."
        });
        break;
      case "sequence_bible":
        decisions.push({
          code: "sequence_bible_selected",
          message: "Production-bible sequence workflow is selected for multi-clip continuity, recurring anchors, and boundary review."
        });
        break;
      case "manual_storyboard":
        decisions.push({
          code: "manual_storyboard_selected",
          message: "Manual storyboard workflow is selected for operator-controlled scene approval."
        });
        break;
    }
    if (input.lastFrameChainingStatus === "required") {
      decisions.push({
        code: "last_frame_chaining_required",
        message: "Last-frame chaining is required before paid multishot rendering to reduce continuity drift."
      });
    }
    if (input.lastFrameChainingStatus === "recommended") {
      decisions.push({
        code: "last_frame_chaining_recommended",
        message: "Last-frame chaining is recommended for smoother multishot transitions."
      });
    }
    if (input.storyboardRequired && input.requiresStoryboardApproval) {
      decisions.push({
        code: "storyboard_approval_required",
        message: "Storyboard approval should be captured before customer-facing paid render."
      });
    }
    if (input.requiresSequentialRender) {
      decisions.push({
        code: "strategy_forces_sequential_render",
        message: "The selected strategy forces sequential render scheduling for continuity-sensitive shots."
      });
    }
    return decisions;
  }

  private issues(input: {
    readonly requestedMode: VideoRenderRequestedMode;
    readonly workflowMode: VideoRenderWorkflowMode;
    readonly plannedShotCount: number;
    readonly hasSourceVideo: boolean;
    readonly hasReferenceLock: boolean;
    readonly storyboardRequired: boolean;
    readonly requiresStoryboardApproval: boolean;
    readonly continuityMode: VideoRenderContinuityMode;
    readonly lastFrameChainingStatus: LastFrameChainingStatus;
    readonly returnLastFrame: boolean | undefined;
  }): readonly VideoRenderStrategyIssue[] {
    const issues: VideoRenderStrategyIssue[] = [];
    if (input.requestedMode === "single" && input.plannedShotCount > 1) {
      issues.push({
        severity: "block",
        code: "requested_single_conflicts_with_multishot_plan",
        message: "The user requested single mode, but planning produced more than one shot.",
        repair: "Regenerate the story/shot plan as one shot, or switch the request mode to storyboard/multishot before paid render."
      });
    }
    if (input.requestedMode === "source_video" && !input.hasSourceVideo) {
      issues.push({
        severity: "block",
        code: "requested_source_video_missing_source",
        message: "Source-video mode was requested without source video analysis or source-video reference evidence.",
        repair: "Attach a source video or run source-video auto analysis before paid render."
      });
    }
    if (input.requestedMode === "reference_locked" && !input.hasReferenceLock) {
      issues.push({
        severity: "block",
        code: "reference_locked_mode_missing_reference",
        message: "Reference-locked mode was requested without lockable reference roles.",
        repair: "Attach identity, product, environment, style, first-frame, or last-frame references before paid render."
      });
    }
    if (input.lastFrameChainingStatus === "blocked") {
      issues.push({
        severity: "block",
        code: "last_frame_chaining_requested_without_last_frame_output",
        message: "The selected workflow needs last-frame chaining but returnLastFrame is disabled.",
        repair: "Enable settings.returnLastFrame or change the workflow to an approved single-clip/reference-only mode."
      });
    }
    if (input.continuityMode === "last_frame_chaining" && input.plannedShotCount > 1) {
      issues.push({
        severity: "warn",
        code: "multishot_prompt_only_continuity_risk",
        message: "Prompt-only multishot can drift creatively without reference assets.",
        repair: "For commercial work, attach product/identity/style references or manually approve the storyboard and first paid proof."
      });
    }
    if (input.storyboardRequired && input.requiresStoryboardApproval) {
      issues.push({
        severity: "warn",
        code: "storyboard_approval_missing",
        message: "Storyboard approval evidence is missing for a workflow that should be reviewed before spend.",
        repair: "Capture operator/customer storyboard approval in metadata.storyboardApproval before customer-facing paid render."
      });
    }
    return issues;
  }

  private hasReferenceLock(requestedRoles: readonly ReferenceRole[], selectedRoles: readonly ReferenceRole[]): boolean {
    return [...requestedRoles, ...selectedRoles].some((role) => REFERENCE_LOCK_ROLES.has(role));
  }

  private requestedRoles(request: CineJellyProjectRequest): readonly ReferenceRole[] {
    return this.uniqueRoles((request.references ?? []).map((reference) => reference.role));
  }

  private selectedRoles(shots: readonly ShotContract[]): readonly ReferenceRole[] {
    return this.uniqueRoles(shots.flatMap((shot) => shot.references.map((reference) => reference.role)));
  }

  private primaryReferenceLabels(request: CineJellyProjectRequest, shots: readonly ShotContract[]): readonly string[] {
    const labels = [
      ...(request.references ?? []),
      ...shots.flatMap((shot) => shot.references)
    ]
      .filter((reference) => reference.priority === "primary")
      .map((reference) => reference.label)
      .filter((label) => label.trim().length > 0);
    return [...new Set(labels)].sort();
  }

  private uniqueRoles(roles: readonly ReferenceRole[]): readonly ReferenceRole[] {
    return [...new Set(roles)].sort();
  }

  private targetDurationSeconds(storyPlan: StoryPlan, shots: readonly ShotContract[]): number {
    if (Number.isFinite(storyPlan.targetDurationSeconds) && storyPlan.targetDurationSeconds > 0) {
      return storyPlan.targetDurationSeconds;
    }
    const shotDuration = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    return Number.isFinite(shotDuration) && shotDuration > 0 ? shotDuration : 0;
  }
}
