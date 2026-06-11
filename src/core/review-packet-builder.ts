/**
 * Review Packet Builder.
 * Extension based on VibeFrame/OpenMontage review-report discipline:
 * emit one commercial handoff summary that ties planning, render, cost, and delivery evidence together.
 */

import type { DirectorRunResult } from "../types/agent.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type {
  ReviewPacket,
  ReviewPacketCost,
  ReviewPacketDelivery,
  ReviewPacketRender,
  ReviewPacketStatus
} from "../types/review.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";

export class ReviewPacketBuilder {
  public build(input: {
    readonly result: DirectorRunResult;
    readonly costLedger: readonly CostLedgerEntry[];
  }): ReviewPacket {
    const requestId = this.requestIdFromGraph(input.result);
    const cost = this.cost(input.result, input.costLedger);
    const delivery = this.delivery(input.result);
    const status = this.status(input.result, cost, delivery);
    const settings = this.settingsFromGraph(input.result);
    const sourceVideoAnalysis = this.sourceVideoAnalysisFromGraph(input.result);

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
        storyboardPanelCount: input.result.storyboard.panels.length,
        storyboardPreflightStatus: input.result.storyboardPreflight.status,
        productionGraphNodeCount: input.result.productionGraph.nodes.length,
        productionGraphEdgeCount: input.result.productionGraph.edges.length,
        compiledPromptCount: input.result.compiledPrompts.length
      },
      render: this.render(input.result),
      cost,
      delivery,
      recommendations: this.recommendations(input.result, status)
    };
  }

  private render(result: DirectorRunResult): ReviewPacketRender {
    const candidates = result.renderedShots.flatMap((shot) => shot.candidates);
    return {
      renderedShotCount: result.renderedShots.length,
      renderedTestTakeCount: result.renderedShots.filter((shot) => shot.testTake).length,
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
      timeoutProviderOperationCount: costLedger.filter((entry) => entry.status === "timeout").length
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

  private status(
    result: DirectorRunResult,
    cost: ReviewPacketCost,
    delivery: ReviewPacketDelivery
  ): ReviewPacketStatus {
    if (
      result.costEstimate.status === "block" ||
      result.storyboardPreflight.status === "block" ||
      result.storyboardPreflight.status === "repair" ||
      delivery.deliveryGateStatus === "block" ||
      delivery.semanticVisualInspectionStatus === "fail" ||
      delivery.mediaInspectionStatus === "fail"
    ) {
      return "blocked";
    }
    if (
      !result.deliverable ||
      result.costEstimate.status === "warn" ||
      result.storyboardPreflight.status === "warn" ||
      delivery.deliveryGateStatus === "warn" ||
      delivery.semanticVisualInspectionStatus === "warn" ||
      delivery.mediaInspectionStatus === "warn" ||
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
    for (const finding of result.costEstimate.findings) {
      recommendations.add(finding);
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
