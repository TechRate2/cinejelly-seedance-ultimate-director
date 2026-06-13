/**
 * Builds deterministic stage lifecycle evidence for long-form and batch-aware runs.
 * Inspired by VibeFrame status/report discipline and MoneyPrinterTurbo stage progress,
 * rewritten as CineJelly-owned TypeScript.
 */

import type { StoryPlan, RenderedShot } from "../types/agent.js";
import type { DeliveryGateReport } from "../types/delivery.js";
import type { ProductionGraphSnapshot } from "../types/graph.js";
import type { GuardianReport, GuardianStatus } from "../types/guardian.js";
import type { MaterialSourcingPlan } from "../types/material.js";
import type { CompiledPrompt, ShotContract } from "../types/prompt.js";
import type {
  ProductionStageEvidenceValue,
  ProductionStageName,
  ProductionStagePlan,
  ProductionStageRecord,
  ProductionStageStatus
} from "../types/stage.js";
import type { Storyboard } from "../types/storyboard.js";
import { createStableId } from "../utils/ids.js";

const STAGE_ORIGINS: Readonly<Record<ProductionStageName, readonly string[]>> = {
  plan: ["HKUDS/ViMax", "vericontext/vibeframe"],
  storyboard: ["HKUDS/ViMax", "vericontext/vibeframe"],
  prompt: ["Emily2040/seedance-2.0", "YouMind-OpenLab/awesome-seedance-2-prompts"],
  source_material: ["harry0703/MoneyPrinterTurbo"],
  render: ["HKUDS/ViMax", "vericontext/vibeframe"],
  inspect: ["vericontext/vibeframe"],
  repair: ["HKUDS/ViMax", "vericontext/vibeframe"],
  assemble: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
  deliver: ["vericontext/vibeframe"]
};

export interface ProductionStagePlannerInput {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly shots: readonly ShotContract[];
  readonly storyboard: Storyboard;
  readonly storyboardPreflight: GuardianReport;
  readonly materialSourcingPlan: MaterialSourcingPlan;
  readonly compiledPrompts: readonly CompiledPrompt[];
  readonly renderedShots: readonly RenderedShot[];
  readonly deliverablePresent: boolean;
  readonly deliveryGate?: DeliveryGateReport;
  readonly productionGraph: ProductionGraphSnapshot;
}

export class ProductionStagePlanner {
  public plan(input: ProductionStagePlannerInput): ProductionStagePlan {
    return {
      planId: createStableId("stage_plan", input.projectId),
      projectId: input.projectId,
      records: [
        this.record(input, "plan", 0, this.planStatus(input), {
          sceneCount: input.storyPlan.scenes.length,
          shotCount: input.shots.length,
          targetDurationSeconds: input.storyPlan.targetDurationSeconds
        }),
        this.record(input, "storyboard", 1, this.guardianStageStatus(input.storyboardPreflight.status), {
          storyboardPanelCount: input.storyboard.panels.length,
          storyboardPreflightStatus: input.storyboardPreflight.status
        }),
        this.record(input, "prompt", 2, input.compiledPrompts.length > 0 ? "succeeded" : "failed", {
          compiledPromptCount: input.compiledPrompts.length
        }),
        this.record(input, "source_material", 3, input.materialSourcingPlan.briefs.length > 0 ? "succeeded" : "skipped", {
          materialBriefCount: input.materialSourcingPlan.briefs.length,
          remoteSourcesAllowed: input.materialSourcingPlan.briefs.some((brief) => brief.allowRemoteSources),
          rightsRequirements: this.unique(input.materialSourcingPlan.briefs.map((brief) => brief.rightsRequirement)),
          preferredSources: this.unique(input.materialSourcingPlan.briefs.flatMap((brief) => brief.preferredSources))
        }),
        this.record(input, "render", 4, this.renderStatus(input.renderedShots), {
          renderedShotCount: input.renderedShots.length,
          renderedTestTakeCount: input.renderedShots.filter((shot) => shot.testTake).length,
          totalCandidateCount: this.totalCandidateCount(input.renderedShots)
        }),
        this.record(input, "inspect", 5, this.inspectStatus(input.renderedShots), {
          blockingInspectionCount: input.renderedShots.filter((shot) => this.isBlockingStatus(shot.renderInspection.status)).length,
          warningInspectionCount: input.renderedShots.filter((shot) => shot.renderInspection.status === "warn").length
        }),
        this.record(input, "repair", 6, this.repairStatus(input.renderedShots), {
          repairAttemptCount: input.renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0)
        }),
        this.record(input, "assemble", 7, input.deliverablePresent ? "succeeded" : "skipped", {
          hasDeliverable: input.deliverablePresent
        }),
        this.record(input, "deliver", 8, this.deliveryStatus(input.deliveryGate), {
          deliveryGateStatus: input.deliveryGate?.status ?? "not_run"
        })
      ]
    };
  }

  private record(
    input: ProductionStagePlannerInput,
    stage: ProductionStageName,
    order: number,
    status: ProductionStageStatus,
    evidence: Readonly<Record<string, ProductionStageEvidenceValue>>
  ): ProductionStageRecord {
    const blockingReason = this.blockingReason(stage, status, evidence);
    return {
      stage,
      order,
      status,
      graphNodeIds: this.graphNodeIds(input.productionGraph, stage),
      evidence,
      sourcePatternOrigins: STAGE_ORIGINS[stage],
      ...(blockingReason ? { blockingReason } : {})
    };
  }

  private planStatus(input: ProductionStagePlannerInput): ProductionStageStatus {
    return input.storyPlan.scenes.length > 0 && input.shots.length > 0 ? "succeeded" : "failed";
  }

  private guardianStageStatus(status: GuardianStatus): ProductionStageStatus {
    switch (status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "repair":
      case "rerender":
      case "block":
        return "blocked";
    }
  }

  private renderStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "failed";
    }
    if (renderedShots.some((shot) => shot.prediction.status !== "succeeded")) {
      return "failed";
    }
    return "succeeded";
  }

  private inspectStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "skipped";
    }
    if (renderedShots.some((shot) => this.isBlockingStatus(shot.renderInspection.status))) {
      return "blocked";
    }
    if (renderedShots.some((shot) => shot.renderInspection.status === "warn")) {
      return "warn";
    }
    return "succeeded";
  }

  private repairStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    const repairAttemptCount = renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0);
    if (repairAttemptCount === 0) {
      return "skipped";
    }
    return renderedShots.some((shot) => this.isBlockingStatus(shot.renderInspection.status)) ? "blocked" : "succeeded";
  }

  private deliveryStatus(deliveryGate: DeliveryGateReport | undefined): ProductionStageStatus {
    if (!deliveryGate) {
      return "skipped";
    }
    switch (deliveryGate.status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "block":
        return "blocked";
    }
  }

  private isBlockingStatus(status: GuardianStatus): boolean {
    return status === "block" || status === "repair" || status === "rerender";
  }

  private totalCandidateCount(renderedShots: readonly RenderedShot[]): number {
    return renderedShots.reduce((sum, shot) => sum + shot.candidates.length, 0);
  }

  private graphNodeIds(graph: ProductionGraphSnapshot, stage: ProductionStageName): readonly string[] {
    const nodeTypes = this.nodeTypesForStage(stage);
    return graph.nodes.filter((node) => nodeTypes.has(node.type)).map((node) => node.id);
  }

  private nodeTypesForStage(stage: ProductionStageName): ReadonlySet<string> {
    switch (stage) {
      case "plan":
        return new Set(["project", "story_arc", "sequence", "scene", "beat", "shot"]);
      case "storyboard":
        return new Set(["storyboard_panel"]);
      case "prompt":
        return new Set(["reference_selection"]);
      case "source_material":
        return new Set(["material_sourcing"]);
      case "render":
        return new Set(["clip_render"]);
      case "inspect":
        return new Set(["inspection_report"]);
      case "repair":
        return new Set(["repair_action"]);
      case "assemble":
      case "deliver":
        return new Set(["deliverable"]);
    }
  }

  private unique(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort();
  }

  private blockingReason(
    stage: ProductionStageName,
    status: ProductionStageStatus,
    evidence: Readonly<Record<string, ProductionStageEvidenceValue>>
  ): string | undefined {
    if (status !== "blocked" && status !== "failed") {
      return undefined;
    }
    return `${stage} stage ${status}: ${JSON.stringify(evidence)}`;
  }
}
