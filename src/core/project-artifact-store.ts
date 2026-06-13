/**
 * Durable project artifact writer.
 * Extension based on VibeFrame and OpenMontage artifact discipline: every production run emits deterministic,
 * redacted JSON artifacts for review, repair, cost audit, and customer handoff.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest, DirectorRunResult } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactEntry, ProjectArtifactKind } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import { writeFileEnsuringDirectory } from "../utils/files.js";
import { createStableId } from "../utils/ids.js";
import { redactText } from "../utils/redaction.js";
import { ReviewPacketBuilder } from "./review-packet-builder.js";

interface ProjectArtifactPayload {
  readonly kind: ProjectArtifactKind;
  readonly fileName: string;
  readonly value: unknown;
}

export class ProjectArtifactStore {
  private readonly reviewPacketBuilder = new ReviewPacketBuilder();

  public async writeRunArtifacts(input: {
    readonly result: DirectorRunResult;
    readonly costLedger: readonly CostLedgerEntry[];
    readonly artifactDirectory: string;
  }): Promise<ProjectArtifactBundle> {
    const artifactDirectory = join(input.artifactDirectory, this.safePathSegment(input.result.projectId));
    const payloads = this.payloads(input.result, input.costLedger);
    const entries: ProjectArtifactEntry[] = [];

    for (const payload of payloads) {
      const entry = await this.writeJsonArtifact(artifactDirectory, payload);
      entries.push(entry);
    }

    const manifest: ProjectArtifactBundle = {
      projectId: input.result.projectId,
      artifactDirectory,
      manifestPath: join(artifactDirectory, "manifest.json"),
      entries
    };
    const manifestJson = this.safeJson(manifest);
    await writeFileEnsuringDirectory(manifest.manifestPath, manifestJson);
    return manifest;
  }

  public async writeFailureArtifacts(input: {
    readonly request: CineJellyProjectRequest;
    readonly costLedger: readonly CostLedgerEntry[];
    readonly artifactDirectory: string;
    readonly error: unknown;
    readonly stage: string;
  }): Promise<ProjectArtifactBundle> {
    const projectId = this.failureProjectId(input.request);
    const artifactDirectory = join(input.artifactDirectory, this.safePathSegment(projectId));
    const payloads: readonly ProjectArtifactPayload[] = [
      {
        kind: "failure_report",
        fileName: "failure-report.json",
        value: this.failureReport({
          projectId,
          request: input.request,
          error: input.error,
          stage: input.stage
        })
      },
      { kind: "cost_ledger", fileName: "cost-ledger.json", value: input.costLedger }
    ];
    const entries: ProjectArtifactEntry[] = [];

    for (const payload of payloads) {
      const entry = await this.writeJsonArtifact(artifactDirectory, payload);
      entries.push(entry);
    }

    const manifest: ProjectArtifactBundle = {
      projectId,
      artifactDirectory,
      manifestPath: join(artifactDirectory, "manifest.json"),
      entries
    };
    await writeFileEnsuringDirectory(manifest.manifestPath, this.safeJson(manifest));
    return manifest;
  }

  private payloads(result: DirectorRunResult, costLedger: readonly CostLedgerEntry[]): readonly ProjectArtifactPayload[] {
    const requestId = this.requestIdFromGraph(result);
    const sourceVideoAnalysis = this.sourceVideoAnalysisFromGraph(result);
    const runSummary = {
      artifactSchemaVersion: "cinejelly.artifacts.v1",
      projectId: result.projectId,
      ...(requestId ? { requestId } : {}),
      generatedAt: new Date(),
      targetDurationSeconds: result.storyPlan.targetDurationSeconds,
      hasSourceVideoAnalysis: Boolean(sourceVideoAnalysis),
      sourceVideoSceneCount: sourceVideoAnalysis?.scenes?.length ?? 0,
      sourceVideoTranscriptCueCount: sourceVideoAnalysis?.transcript?.length ?? 0,
      storyboardPanelCount: result.storyboard.panels.length,
      storyboardPreflightStatus: result.storyboardPreflight.status,
      stageStatuses: result.stagePlan.records.map((record) => ({
        stage: record.stage,
        status: record.status
      })),
      materialBriefCount: result.materialSourcingPlan.briefs.length,
      materialValidationStatus: result.materialSourceValidation.status,
      materialCandidateCount: result.materialSourceValidation.candidateCount,
      selectedMaterialCandidateCount: result.materialSourceValidation.selectedCandidateCount,
      postproductionAssetStatus: result.postproductionAssetPlan.status,
      captionCueCount: result.postproductionAssetPlan.caption.cueCount,
      audioTrackCount: result.postproductionAssetPlan.audio.trackCount,
      generatedAudioStatus: result.postproductionAssetPlan.generatedAudio.status,
      generatedAudioIntentCount: result.postproductionAssetPlan.generatedAudio.intentCount,
      postproductionAssetIssueCount: result.postproductionAssetPlan.issueCount,
      compiledPromptCount: result.compiledPrompts.length,
      renderedShotCount: result.renderedShots.length,
      plannedCandidateCount: result.costEstimate.candidateCount,
      plannedRepairAttemptCount: result.costEstimate.repairAttemptCount,
      plannedTestTakeCount: result.costEstimate.plannedTestTakeCount,
      renderedTestTakeCount: result.renderedShots.filter((shot) => shot.testTake).length,
      selectedCandidateIndexes: result.renderedShots.map((shot) => ({
        shotId: shot.compiledPrompt.shotId,
        selectedCandidateIndex: shot.selectedCandidateIndex,
        candidateCount: shot.candidates.length,
        repairAttemptCount: shot.repairAttemptCount
      })),
      costGateStatus: result.costEstimate.status,
      estimatedTotalCostUsd: result.costEstimate.estimatedTotalCostUsd,
      hasDeliverable: Boolean(result.deliverable),
      deliverablePath: result.deliverable?.outputPath,
      deliveryGateStatus: result.deliveryGate?.status,
      hasSemanticVisualInspection: Boolean(result.semanticVisualInspection)
    };
    const payloads: ProjectArtifactPayload[] = [
      { kind: "run_summary", fileName: "run-summary.json", value: runSummary },
      { kind: "review_packet", fileName: "review-packet.json", value: this.reviewPacketBuilder.build({ result, costLedger }) },
      { kind: "story_plan", fileName: "story-plan.json", value: result.storyPlan },
      { kind: "storyboard", fileName: "storyboard.json", value: result.storyboard },
      { kind: "storyboard_preflight", fileName: "storyboard-preflight.json", value: result.storyboardPreflight },
      { kind: "production_graph", fileName: "production-graph.json", value: result.productionGraph },
      { kind: "material_sourcing_plan", fileName: "material-sourcing-plan.json", value: result.materialSourcingPlan },
      { kind: "material_source_validation", fileName: "material-source-validation.json", value: result.materialSourceValidation },
      { kind: "postproduction_asset_plan", fileName: "postproduction-assets.json", value: result.postproductionAssetPlan },
      { kind: "stage_lifecycle", fileName: "stage-lifecycle.json", value: result.stagePlan },
      { kind: "cost_plan", fileName: "cost-plan.json", value: result.costEstimate },
      { kind: "compiled_prompts", fileName: "compiled-prompts.json", value: result.compiledPrompts },
      { kind: "rendered_shots", fileName: "rendered-shots.json", value: result.renderedShots },
      { kind: "cost_ledger", fileName: "cost-ledger.json", value: costLedger }
    ];

    if (sourceVideoAnalysis) {
      payloads.push({ kind: "source_video_analysis", fileName: "source-video-analysis.json", value: sourceVideoAnalysis });
    }
    if (result.deliverable) {
      payloads.push({ kind: "deliverable", fileName: "deliverable.json", value: result.deliverable });
    }
    if (result.deliveryGate) {
      payloads.push({ kind: "delivery_gate", fileName: "delivery-gate.json", value: result.deliveryGate });
    }
    if (result.semanticVisualInspection) {
      payloads.push({
        kind: "semantic_visual_inspection",
        fileName: "semantic-visual-inspection.json",
        value: result.semanticVisualInspection
      });
    }
    return payloads;
  }

  private failureReport(input: {
    readonly projectId: string;
    readonly request: CineJellyProjectRequest;
    readonly error: unknown;
    readonly stage: string;
  }): Record<string, unknown> {
    const requestId = input.request.metadata?.requestId;
    return {
      artifactSchemaVersion: "cinejelly.artifacts.v1",
      projectId: input.projectId,
      ...(requestId ? { requestId } : {}),
      generatedAt: new Date(),
      status: "failed",
      stage: input.stage,
      request: {
        userInput: input.request.userInput,
        settings: input.request.settings,
        referenceCount: input.request.references?.length ?? 0,
        hasSourceVideoAnalysis: Boolean(input.request.sourceVideoAnalysis),
        sourceVideoSceneCount: input.request.sourceVideoAnalysis?.scenes?.length ?? 0,
        sourceVideoTranscriptCueCount: input.request.sourceVideoAnalysis?.transcript?.length ?? 0,
        metadata: input.request.metadata,
        hasOutputPath: Boolean(input.request.outputPath),
        hasWorkDirectory: Boolean(input.request.workDirectory),
        hasArtifactDirectory: Boolean(input.request.artifactDirectory)
      },
      error: this.errorPayload(input.error)
    };
  }

  private requestIdFromGraph(result: DirectorRunResult): string | undefined {
    for (const node of result.productionGraph.nodes) {
      if (node.type === "project") {
        return node.data.metadata?.requestId;
      }
    }
    return undefined;
  }

  private sourceVideoAnalysisFromGraph(result: DirectorRunResult): SourceVideoDeconstruction | undefined {
    for (const node of result.productionGraph.nodes) {
      if (node.type === "project") {
        return node.data.sourceVideoAnalysis;
      }
    }
    return undefined;
  }

  private errorPayload(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message
      };
    }
    return {
      name: "UnknownError",
      message: String(error)
    };
  }

  private async writeJsonArtifact(artifactDirectory: string, payload: ProjectArtifactPayload): Promise<ProjectArtifactEntry> {
    const createdAt = new Date();
    const json = this.safeJson(payload.value);
    await writeFileEnsuringDirectory(join(artifactDirectory, payload.fileName), json);
    return {
      kind: payload.kind,
      fileName: payload.fileName,
      contentType: "application/json",
      byteSize: Buffer.byteLength(json, "utf8"),
      sha256: this.sha256(json),
      createdAt
    };
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private safeJson(value: unknown): string {
    return `${JSON.stringify(this.redactSerializable(value), undefined, 2)}\n`;
  }

  private redactSerializable(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "string") {
      return redactText(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSerializable(item));
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/api[_-]?key|access[_-]?key|token|secret|password|signature|credential|authorization/i.test(key)) {
          return [key, "[REDACTED]"] as const;
        }
        return [key, this.redactSerializable(item)] as const;
      });
      return Object.fromEntries(entries);
    }
    return value;
  }

  private safePathSegment(value: string): string {
    const safe = value.replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!safe) {
      throw new Error("Project artifact path segment cannot be empty.");
    }
    return safe;
  }

  private failureProjectId(request: CineJellyProjectRequest): string {
    const userInput = request.userInput.trim();
    try {
      const settings = normalizeSeedanceSettings(request.settings);
      return createStableId("project", `${userInput}:${settings.durationTargetSeconds}:${settings.ratio}`);
    } catch {
      return createStableId("project_failure", userInput || "invalid_request");
    }
  }
}
