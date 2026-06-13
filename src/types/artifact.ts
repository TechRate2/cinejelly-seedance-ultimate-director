/**
 * Artifact contracts for durable CineJelly production run outputs.
 * These files support audit, review, repair, and handoff without storing secrets.
 */

export type ProjectArtifactKind =
  | "run_summary"
  | "story_plan"
  | "source_video_analysis"
  | "storyboard"
  | "storyboard_preflight"
  | "production_graph"
  | "material_sourcing_plan"
  | "material_source_validation"
  | "postproduction_asset_plan"
  | "stage_lifecycle"
  | "review_packet"
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
  readonly sha256: string;
  readonly createdAt: Date;
}

export interface ProjectArtifactBundle {
  readonly projectId: string;
  readonly artifactDirectory: string;
  readonly manifestPath: string;
  readonly entries: readonly ProjectArtifactEntry[];
}

export type ProjectArtifactValidationStatus = "pass" | "warn" | "fail";

export interface ProjectArtifactValidationCheck {
  readonly name: string;
  readonly status: ProjectArtifactValidationStatus;
  readonly message: string;
  readonly fileName?: string;
}

export interface ProjectArtifactValidationReport {
  readonly status: ProjectArtifactValidationStatus;
  readonly checkedAt: Date;
  readonly artifactDirectory: string;
  readonly manifestPath?: string;
  readonly projectId?: string;
  readonly checks: readonly ProjectArtifactValidationCheck[];
}
