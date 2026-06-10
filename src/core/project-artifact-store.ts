/**
 * Durable project artifact writer.
 * Extension based on VibeFrame and OpenMontage artifact discipline: every production run emits deterministic,
 * redacted JSON artifacts for review, repair, cost audit, and customer handoff.
 */

import { join } from "node:path";
import type { DirectorRunResult } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactEntry, ProjectArtifactKind } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import { writeFileEnsuringDirectory } from "../utils/files.js";
import { redactText } from "../utils/redaction.js";

interface ProjectArtifactPayload {
  readonly kind: ProjectArtifactKind;
  readonly fileName: string;
  readonly value: unknown;
}

export class ProjectArtifactStore {
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

  private payloads(result: DirectorRunResult, costLedger: readonly CostLedgerEntry[]): readonly ProjectArtifactPayload[] {
    const runSummary = {
      artifactSchemaVersion: "cinejelly.artifacts.v1",
      projectId: result.projectId,
      generatedAt: new Date(),
      targetDurationSeconds: result.storyPlan.targetDurationSeconds,
      compiledPromptCount: result.compiledPrompts.length,
      renderedShotCount: result.renderedShots.length,
      costGateStatus: result.costEstimate.status,
      estimatedTotalCostUsd: result.costEstimate.estimatedTotalCostUsd,
      hasDeliverable: Boolean(result.deliverable),
      deliverablePath: result.deliverable?.outputPath,
      hasSemanticVisualInspection: Boolean(result.semanticVisualInspection)
    };
    const payloads: ProjectArtifactPayload[] = [
      { kind: "run_summary", fileName: "run-summary.json", value: runSummary },
      { kind: "story_plan", fileName: "story-plan.json", value: result.storyPlan },
      { kind: "production_graph", fileName: "production-graph.json", value: result.productionGraph },
      { kind: "cost_plan", fileName: "cost-plan.json", value: result.costEstimate },
      { kind: "compiled_prompts", fileName: "compiled-prompts.json", value: result.compiledPrompts },
      { kind: "rendered_shots", fileName: "rendered-shots.json", value: result.renderedShots },
      { kind: "cost_ledger", fileName: "cost-ledger.json", value: costLedger }
    ];

    if (result.deliverable) {
      payloads.push({ kind: "deliverable", fileName: "deliverable.json", value: result.deliverable });
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

  private async writeJsonArtifact(artifactDirectory: string, payload: ProjectArtifactPayload): Promise<ProjectArtifactEntry> {
    const createdAt = new Date();
    const json = this.safeJson(payload.value);
    await writeFileEnsuringDirectory(join(artifactDirectory, payload.fileName), json);
    return {
      kind: payload.kind,
      fileName: payload.fileName,
      contentType: "application/json",
      byteSize: Buffer.byteLength(json, "utf8"),
      createdAt
    };
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
        if (/api[_-]?key|token|secret|password|authorization/i.test(key)) {
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
}
