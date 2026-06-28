/**
 * Review Packet Builder.
 * Extension based on storyboard-video review-report discipline:
 * emit one commercial handoff summary that ties planning, render, cost, and delivery evidence together.
 */

import type { DirectorRunResult } from "../types/agent.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type {
  ReviewPacket,
  ReviewPacketCost,
  ReviewPacketDelivery,
  ReviewPacketRepairProvenance,
  ReviewPacketRender,
  ReviewPacketSourceLineage,
  ReviewPacketStatus
} from "../types/review.js";
import type { GuardianReport } from "../types/guardian.js";
import type { SourceLogicTranslationRecord } from "../types/source-translation.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import { buildLongDirectorUiContract } from "./long-director-ui-contract.js";
import { DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS } from "./source-logic-translation-records.js";

export class ReviewPacketBuilder {
  public build(input: {
    readonly result: DirectorRunResult;
    readonly costLedger: readonly CostLedgerEntry[];
    readonly sourceLogicTranslations?: readonly SourceLogicTranslationRecord[];
  }): ReviewPacket {
    const requestId = this.requestIdFromGraph(input.result);
    const cost = this.cost(input.result, input.costLedger);
    const delivery = this.delivery(input.result);
    const status = this.status(input.result, cost, delivery);
    const settings = this.settingsFromGraph(input.result);
    const sourceVideoAnalysis = this.sourceVideoAnalysisFromGraph(input.result);
    const longDirectorUiContract = buildLongDirectorUiContract(input.result.longFormCreativeIntelligencePlan);

    return {
      artifactSchemaVersion: "cinejelly.review_packet.v1",
      projectId: input.result.projectId,
      ...(requestId ? { requestId } : {}),
      generatedAt: new Date(),
      status,
      summary: {
        premise: input.result.storyPlan.premise,
        targetDurationSeconds: input.result.storyPlan.targetDurationSeconds,
        ...(input.result.deliverable ? { deliverablePath: input.result.deliverable.outputPath } : {}),
        hasDeliverable: Boolean(input.result.deliverable)
      },
      settings: {
        tier: settings.tier,
        resolution: settings.resolution,
        qualityMode: settings.qualityMode,
        ratio: settings.ratio
      },
      planning: {
        hasSourceVideoAnalysis: Boolean(sourceVideoAnalysis),
        sourceVideoSceneCount: sourceVideoAnalysis?.scenes?.length ?? 0,
        sourceVideoTranscriptCueCount: sourceVideoAnalysis?.transcript?.length ?? 0,
        longFormSequenceCount: input.result.longFormContinuityPlan.sequenceCount,
        longFormContinuityBridgeCount: input.result.longFormContinuityPlan.bridgeCount,
        longFormHighRiskSequenceCount: input.result.longFormContinuityPlan.highRiskSequenceCount,
        longFormSourceVideoAnchorCount: input.result.longFormContinuityPlan.sourceVideoAnchorCount,
        longFormAgentReviewStatus: input.result.longFormAgentReview.status,
        longFormAgentReviewFindingCount: input.result.longFormAgentReview.findingCount,
        longFormAgentReviewBlockingFindingCount: input.result.longFormAgentReview.blockingFindingCount,
        longFormAgentReviewRequiredBeforeRenderCount: input.result.longFormAgentReview.decisions.reduce(
          (sum, decision) => sum + decision.requiredBeforeRender.length,
          0
        ),
        videoRenderRequestedMode: input.result.videoRenderStrategyPlan.requestedMode,
        videoRenderWorkflowMode: input.result.videoRenderStrategyPlan.workflowMode,
        videoRenderContinuityMode: input.result.videoRenderStrategyPlan.continuityMode,
        videoRenderRequiresSequentialRender: input.result.videoRenderStrategyPlan.requiresSequentialRender,
        videoRenderRequiresStoryboardApproval: input.result.videoRenderStrategyPlan.requiresStoryboardApproval,
        videoRenderStrategyIssueCount: input.result.videoRenderStrategyPlan.issueCount,
        videoRenderStrategyBlockingIssueCount: input.result.videoRenderStrategyPlan.blockingIssueCount,
        longFormTimelineSegmentCount: input.result.longFormTimelinePlan.segmentCount,
        longFormTimelineSequentialSegmentCount: input.result.longFormTimelinePlan.sequentialSegmentCount,
        longFormTimelineManualReviewSegmentCount: input.result.longFormTimelinePlan.manualReviewSegmentCount,
        longFormTimelineIssueCount: input.result.longFormTimelinePlan.issueCount,
        longFormTimelineBlockingIssueCount: input.result.longFormTimelinePlan.blockingIssueCount,
        longFormCreativeStatus: input.result.longFormCreativeIntelligencePlan.status,
        longFormCreativeQualityScore: input.result.longFormCreativeIntelligencePlan.qualityScore,
        longFormCreativeFindingCount: input.result.longFormCreativeIntelligencePlan.findingCount,
        longFormCreativeBlockingFindingCount: input.result.longFormCreativeIntelligencePlan.blockingFindingCount,
        longFormCreativeReviewRequiredFindingCount: input.result.longFormCreativeIntelligencePlan.reviewRequiredFindingCount,
        longFormCreativeShotDirectiveCount: input.result.longFormCreativeIntelligencePlan.shotDirectiveCount,
        longFormCreativeCandidateDirectiveCount: input.result.longFormCreativeIntelligencePlan.candidateDirectiveCount,
        longFormCreativeRepairDirectiveCount: input.result.longFormCreativeIntelligencePlan.repairDirectiveCount,
        longFormCreativeNiche: input.result.longFormCreativeIntelligencePlan.nicheStrategy.niche,
        longFormCreativePlatformIntent: input.result.longFormCreativeIntelligencePlan.nicheStrategy.platformIntent,
        longDirectorUiContractReady: longDirectorUiContract.releaseGateSummary.readyForLongReviewUiIntegration,
        longDirectorNarrativeMode: longDirectorUiContract.director.narrativeMode,
        longDirectorCheckpointStageCount: longDirectorUiContract.director.checkpointStages.length,
        longDirectorManualQualityReviewRequired: longDirectorUiContract.outputContract.longFormManualQualityReviewRequired,
        longDirectorBenchEvidenceRequired: longDirectorUiContract.outputContract.benchmarkEvidenceRequired,
        longDirectorCanSubmitToProviderNow: longDirectorUiContract.outputContract.canSubmitToProviderNow,
        longDirectorCanProceedToRenderAfterApproval: longDirectorUiContract.outputContract.canProceedToRenderAfterApproval,
        longDirectorRepairQueueCount: longDirectorUiContract.outputContract.repairQueueCount,
        longFormReadinessStatus: input.result.longFormReadinessPlan.status,
        longFormReadinessIntentKind: input.result.longFormReadinessPlan.intentRoute.intentKind,
        longFormReadinessCoherenceScore: input.result.longFormReadinessPlan.coherence.overallScore,
        longFormReadinessRepairQueueCount: input.result.longFormReadinessPlan.repairQueue.length,
        longFormReadinessBlockingRepairCount: input.result.longFormReadinessPlan.repairQueue.filter((repair) => repair.blocksRender).length,
        longFormReadinessManualShotReviewCount: input.result.longFormReadinessPlan.adaptiveShotDecisions.filter((decision) => decision.requiresManualReview).length,
        longFormReadinessApprovalSurfaceCount: input.result.longFormReadinessPlan.uiReviewPacket.requiredApprovalSurfaces.length,
        longFormReadinessCanRenderAfterApproval: input.result.longFormReadinessPlan.uiReviewPacket.canRenderAfterApproval,
        storyboardPanelCount: input.result.storyboard.panels.length,
        storyboardPreflightStatus: input.result.storyboardPreflight.status,
        hasStoryboardApprovalReport: Boolean(input.result.storyboardApprovalReport),
        ...(input.result.storyboardApprovalReport
          ? {
              storyboardApprovalStatus: input.result.storyboardApprovalReport.status,
              storyboardApprovalCheckpointCount: input.result.storyboardApprovalReport.summary.checkpointCount,
              storyboardApprovalCanRender: input.result.storyboardApprovalReport.releaseGateSummary.canRenderAfterReview
            }
          : {}),
        productionGraphNodeCount: input.result.productionGraph.nodes.length,
        productionGraphEdgeCount: input.result.productionGraph.edges.length,
        compiledPromptCount: input.result.compiledPrompts.length,
        materialBriefCount: input.result.materialSourcingPlan.briefs.length,
        materialValidationStatus: input.result.materialSourceValidation.status,
        materialCandidateCount: input.result.materialSourceValidation.candidateCount,
        selectedMaterialCandidateCount: input.result.materialSourceValidation.selectedCandidateCount,
        postproductionAssetStatus: input.result.postproductionAssetPlan.status,
        captionCueCount: input.result.postproductionAssetPlan.caption.cueCount,
        audioTrackCount: input.result.postproductionAssetPlan.audio.trackCount,
        generatedAudioStatus: input.result.postproductionAssetPlan.generatedAudio.status,
        generatedAudioIntentCount: input.result.postproductionAssetPlan.generatedAudio.intentCount,
        generatedAudioReadyIntentCount: input.result.postproductionAssetPlan.generatedAudio.readyIntentCount,
        generatedAudioBlockedIntentCount: input.result.postproductionAssetPlan.generatedAudio.blockedIntentCount,
        hasGeneratedAudioOutputBatchValidation: Boolean(input.result.generatedAudioOutputBatchValidation),
        ...(input.result.generatedAudioOutputBatchValidation
          ? {
              generatedAudioOutputBatchStatus: input.result.generatedAudioOutputBatchValidation.status,
              generatedAudioResultCount: input.result.generatedAudioOutputBatchValidation.resultCount,
              generatedAudioApprovedTrackCount: input.result.generatedAudioOutputBatchValidation.approvedTrackCount,
              generatedAudioOutputBatchIssueCount: input.result.generatedAudioOutputBatchValidation.issueCount
            }
          : {}),
        postproductionAssetIssueCount: input.result.postproductionAssetPlan.issueCount
      },
      render: this.render(input.result),
      cost,
      delivery,
      stageLifecycle: input.result.stagePlan.records,
      sourceLineage: this.sourceLineage(input.sourceLogicTranslations ?? DEFAULT_SOURCE_LOGIC_TRANSLATION_RECORDS),
      repairProvenance: this.repairProvenance(input.result),
      recommendations: this.recommendations(input.result, status)
    };
  }

  private render(result: DirectorRunResult): ReviewPacketRender {
    const candidates = result.renderedShots.flatMap((shot) => shot.candidates);
    return {
      renderedShotCount: result.renderedShots.length,
      renderedTestTakeCount: result.renderedShots.filter((shot) => shot.testTake).length,
      lastFrameChainedPromptCount: result.compiledPrompts.filter((prompt) =>
        prompt.videoRequest.references.some((reference) => reference.role === "first_frame") ||
        typeof prompt.videoRequest.metadata?.chainedFromShotId === "string"
      ).length,
      selectedCandidateIndexes: result.renderedShots.map((shot) => ({
        shotId: shot.compiledPrompt.shotId,
        selectedCandidateIndex: shot.selectedCandidateIndex,
        candidateCount: shot.candidates.length,
        repairAttemptCount: shot.repairAttemptCount
      })),
      totalCandidateCount: candidates.length,
      totalRepairAttemptCount: result.renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0),
      failedPredictionCount: candidates.filter((candidate) => candidate.prediction.status === "failed").length,
      outputUrlCount: result.renderedShots.reduce((sum, shot) => sum + shot.prediction.outputUrls.length, 0)
    };
  }

  private cost(result: DirectorRunResult, costLedger: readonly CostLedgerEntry[]): ReviewPacketCost {
    const actualTotalCostUsd = this.sumDefined(costLedger.map((entry) => entry.actualCostUsd));
    return {
      costGateStatus: result.costEstimate.status,
      plannedRenderSeconds: result.costEstimate.plannedRenderSeconds,
      ...(result.costEstimate.estimatedTotalCostUsd !== undefined
        ? { estimatedTotalCostUsd: result.costEstimate.estimatedTotalCostUsd }
        : {}),
      ...(actualTotalCostUsd !== undefined ? { actualTotalCostUsd } : {}),
      providerOperationCount: costLedger.length,
      failedProviderOperationCount: costLedger.filter((entry) => entry.status === "failed").length,
      timeoutProviderOperationCount: costLedger.filter((entry) => entry.status === "timeout").length,
      canceledProviderOperationCount: costLedger.filter((entry) => entry.status === "canceled").length
    };
  }

  private delivery(result: DirectorRunResult): ReviewPacketDelivery {
    const videoStream = result.deliverable?.inspection.metadata.streams.find((stream) => stream.type === "video");
    return {
      ...(result.deliveryGate ? { deliveryGateStatus: result.deliveryGate.status } : {}),
      ...(result.semanticVisualInspection ? { semanticVisualInspectionStatus: result.semanticVisualInspection.status } : {}),
      ...(result.deliverable ? { mediaInspectionStatus: result.deliverable.inspection.status } : {}),
      ...(result.deliverable ? { clipCount: result.deliverable.clipCount } : {}),
      ...(result.deliverable ? { outputByteSize: result.deliverable.outputByteSize } : {}),
      ...(result.deliverable ? { outputSha256: result.deliverable.outputSha256 } : {}),
      ...(result.deliverable?.inspection.metadata.durationSeconds !== undefined
        ? { durationSeconds: result.deliverable.inspection.metadata.durationSeconds }
        : {}),
      ...(videoStream?.width && videoStream.height ? { resolution: `${videoStream.width}x${videoStream.height}` } : {})
    };
  }

  private sourceLineage(records: readonly SourceLogicTranslationRecord[]): readonly ReviewPacketSourceLineage[] {
    return records.map((record) => ({
      logicName: record.logicName,
      sourceRepository: record.sourceRepository,
      license: record.license,
      validationStatus: record.validationStatus,
      ...(record.referenceImplementationPath
        ? { referenceImplementationPath: record.referenceImplementationPath }
        : {}),
      ...(record.attributionPath ? { attributionPath: record.attributionPath } : {}),
      destinationPaths: record.cineJellyDestinationPaths
    }));
  }

  private repairProvenance(result: DirectorRunResult): readonly ReviewPacketRepairProvenance[] {
    return this.guardianReports(result)
      .filter(
        (report) =>
          report.status !== "pass" ||
          report.repairScope !== "none" ||
          report.sourceCheckpoints.length > 0
      )
      .map((report) => ({
        nodeId: report.nodeId,
        stage: report.stage,
        status: report.status,
        repairScope: report.repairScope,
        affectedNodeIds: report.affectedNodeIds,
        recommendedNextStep: report.recommendedNextStep,
        checkpoints: report.findings.map((finding) => finding.checkpoint),
        sourceRepositories: [...new Set(report.sourceCheckpoints.map((checkpoint) => checkpoint.sourceRepository))].sort(
          (left, right) => left.localeCompare(right)
        )
      }));
  }

  private guardianReports(result: DirectorRunResult): readonly GuardianReport[] {
    const reports: GuardianReport[] = [result.storyboardPreflight];
    for (const renderedShot of result.renderedShots) {
      reports.push(renderedShot.preflight, renderedShot.renderInspection);
      if (renderedShot.testTake) {
        reports.push(renderedShot.testTake.renderInspection);
      }
      for (const candidate of renderedShot.candidates) {
        reports.push(candidate.renderInspection);
      }
    }
    return reports;
  }

  private status(
    result: DirectorRunResult,
    cost: ReviewPacketCost,
    delivery: ReviewPacketDelivery
  ): ReviewPacketStatus {
    if (
      result.costEstimate.status === "block" ||
      result.storyboardPreflight.status === "block" ||
      result.storyboardPreflight.status === "repair" ||
      (result.videoRenderStrategyPlan.storyboardRequired &&
        !result.storyboardApprovalReport?.releaseGateSummary.canRenderAfterReview) ||
      delivery.deliveryGateStatus === "block" ||
      delivery.semanticVisualInspectionStatus === "fail" ||
      delivery.mediaInspectionStatus === "fail" ||
      result.materialSourceValidation.status === "rejected" ||
      result.generatedAudioOutputBatchValidation?.status === "rejected" ||
      result.longFormAgentReview.status === "blocked" ||
      result.videoRenderStrategyPlan.blockingIssueCount > 0 ||
      result.longFormTimelinePlan.blockingIssueCount > 0 ||
      result.longFormCreativeIntelligencePlan.status === "blocked" ||
      result.longFormReadinessPlan.status === "blocked"
    ) {
      return "blocked";
    }
    if (
      !result.deliverable ||
      result.costEstimate.status === "warn" ||
      result.storyboardPreflight.status === "warn" ||
      result.storyboardApprovalReport?.status === "approval_required" ||
      result.storyboardApprovalReport?.status === "changes_requested" ||
      delivery.deliveryGateStatus === "warn" ||
      delivery.semanticVisualInspectionStatus === "warn" ||
      delivery.mediaInspectionStatus === "warn" ||
      result.materialSourceValidation.status === "review_required" ||
      result.postproductionAssetPlan.status === "review_required" ||
      result.longFormAgentReview.status === "review_required" ||
      result.videoRenderStrategyPlan.warningIssueCount > 0 ||
      result.longFormTimelinePlan.warningIssueCount > 0 ||
      result.longFormTimelinePlan.manualReviewSegmentCount > 0 ||
      result.longFormCreativeIntelligencePlan.status === "review_required" ||
      result.longFormReadinessPlan.status === "review_required" ||
      result.generatedAudioOutputBatchValidation?.status === "review_required" ||
      result.generatedAudioOutputBatchValidation?.status === "partially_approved" ||
      cost.failedProviderOperationCount > 0 ||
      cost.timeoutProviderOperationCount > 0
    ) {
      return "review_required";
    }
    return "ready";
  }

  private recommendations(result: DirectorRunResult, status: ReviewPacketStatus): readonly string[] {
    const recommendations = new Set<string>();
    if (status === "ready") {
      recommendations.add("Deliverable passed automated gates; perform final customer review before publication.");
    }
    if (!result.deliverable) {
      recommendations.add("No deliverable was assembled; provide outputPath and workDirectory for customer-facing video export.");
    }
    for (const finding of result.storyboardPreflight.findings) {
      recommendations.add(finding.repair);
    }
    for (const action of result.storyboardApprovalReport?.nextActions ?? []) {
      recommendations.add(action);
    }
    for (const provenance of this.repairProvenance(result)) {
      recommendations.add(provenance.recommendedNextStep);
    }
    for (const finding of result.costEstimate.findings) {
      recommendations.add(finding);
    }
    for (const issue of result.materialSourceValidation.issues) {
      recommendations.add(issue.repair);
    }
    for (const issue of result.postproductionAssetPlan.issues) {
      recommendations.add(issue.repair);
    }
    for (const issue of result.generatedAudioOutputBatchValidation?.issues ?? []) {
      recommendations.add(issue.repair);
    }
    for (const directive of result.longFormAgentReview.directives) {
      recommendations.add(directive);
    }
    for (const issue of result.videoRenderStrategyPlan.issues) {
      recommendations.add(issue.repair);
    }
    for (const issue of result.longFormTimelinePlan.issues) {
      recommendations.add(issue.repair);
    }
    for (const directive of result.longFormCreativeIntelligencePlan.repairDirectives) {
      recommendations.add(directive.action);
    }
    for (const recommendation of result.longFormCreativeIntelligencePlan.audioCaptionQuality.recommendations) {
      recommendations.add(recommendation);
    }
    for (const repair of result.longFormReadinessPlan.repairQueue) {
      recommendations.add(repair.action);
    }
    for (const action of result.longFormReadinessPlan.uiReviewPacket.nextActions) {
      recommendations.add(action);
    }
    for (const report of result.generatedAudioOutputBatchValidation?.reports ?? []) {
      for (const issue of report.issues) {
        recommendations.add(issue.repair);
      }
    }
    for (const finding of result.deliveryGate?.findings ?? []) {
      recommendations.add(finding.repair);
    }
    for (const finding of result.semanticVisualInspection?.findings ?? []) {
      recommendations.add(finding.recommendation);
    }
    return [...recommendations];
  }

  private settingsFromGraph(result: DirectorRunResult): {
    readonly tier: ReviewPacket["settings"]["tier"];
    readonly resolution: ReviewPacket["settings"]["resolution"];
    readonly qualityMode: ReviewPacket["settings"]["qualityMode"];
    readonly ratio: ReviewPacket["settings"]["ratio"];
  } {
    const projectNodeData = this.projectNodeData(result);
    return {
      tier: projectNodeData.settings.tier,
      resolution: projectNodeData.settings.resolution,
      qualityMode: projectNodeData.settings.qualityMode,
      ratio: projectNodeData.settings.ratio
    };
  }

  private requestIdFromGraph(result: DirectorRunResult): string | undefined {
    const projectNode = result.productionGraph.nodes.find((node) => node.type === "project");
    return projectNode?.data.metadata?.requestId;
  }

  private sourceVideoAnalysisFromGraph(result: DirectorRunResult): SourceVideoDeconstruction | undefined {
    return this.projectNodeData(result).sourceVideoAnalysis;
  }

  private projectNodeData(result: DirectorRunResult): Extract<DirectorRunResult["productionGraph"]["nodes"][number], { type: "project" }>["data"] {
    const projectNode = result.productionGraph.nodes.find((node) => node.type === "project");
    if (!projectNode) {
      throw new Error("Review packet requires a project node in the Production Graph.");
    }
    return projectNode.data;
  }

  private sumDefined(values: readonly (number | undefined)[]): number | undefined {
    const defined = values.filter((value): value is number => value !== undefined);
    if (defined.length === 0) {
      return undefined;
    }
    return defined.reduce((sum, value) => sum + value, 0);
  }
}
