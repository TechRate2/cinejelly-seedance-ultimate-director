/**
 * Artifact contracts for durable CineJelly production run outputs.
 * These files support audit, review, repair, and handoff without storing secrets.
 */

export type ProjectArtifactKind =
  | "run_summary"
  | "story_plan"
  | "storyboard"
  | "production_graph"
  | "compiled_prompts"
  | "rendered_shots"
  | "deliverable"
  | "delivery_gate"
  | "failure_report"
  | "semantic_visual_inspection"
  | "cost_plan"
  | "cost_ledger"
  | "manifest";

export interface ProjectArtifactEntry {
  readonly kind: ProjectArtifactKind;
  readonly fileName: string;
  readonly contentType: "application/json";
  readonly byteSize: number;
  readonly createdAt: Date;
}

export interface ProjectArtifactBundle {
  readonly projectId: string;
  readonly artifactDirectory: string;
  readonly manifestPath: string;
  readonly entries: readonly ProjectArtifactEntry[];
}
