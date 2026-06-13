/**
 * Public artifact response DTOs.
 * API responses expose audit entries and checksums without leaking server-local artifact paths.
 */

import type {
  ProjectArtifactBundle,
  ProjectArtifactEntry,
  ProjectArtifactValidationReport,
  ProjectArtifactValidationStatus
} from "../types/artifact.js";

export interface ApiProjectArtifactBundle {
  readonly projectId: string;
  readonly manifestFileName: string;
  readonly entries: readonly ProjectArtifactEntry[];
}

export interface ApiProjectArtifactValidationReport {
  readonly status: ProjectArtifactValidationStatus;
  readonly checkedAt: Date;
  readonly projectId?: string;
  readonly manifestFileName: "manifest.json";
  readonly checkCount: number;
  readonly failedCheckCount: number;
  readonly warningCheckCount: number;
  readonly checks: ProjectArtifactValidationReport["checks"];
}

export function toApiProjectArtifactBundle(bundle: ProjectArtifactBundle): ApiProjectArtifactBundle {
  return {
    projectId: bundle.projectId,
    manifestFileName: "manifest.json",
    entries: bundle.entries
  };
}

export function toApiProjectArtifactValidationReport(
  report: ProjectArtifactValidationReport
): ApiProjectArtifactValidationReport {
  const failedCheckCount = report.checks.filter((check) => check.status === "fail").length;
  const warningCheckCount = report.checks.filter((check) => check.status === "warn").length;
  return {
    status: report.status,
    checkedAt: report.checkedAt,
    ...(report.projectId ? { projectId: report.projectId } : {}),
    manifestFileName: "manifest.json",
    checkCount: report.checks.length,
    failedCheckCount,
    warningCheckCount,
    checks: report.checks
  };
}
