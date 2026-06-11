/**
 * Public artifact response DTOs.
 * API responses expose audit entries and checksums without leaking server-local artifact paths.
 */

import type { ProjectArtifactBundle, ProjectArtifactEntry } from "../types/artifact.js";

export interface ApiProjectArtifactBundle {
  readonly projectId: string;
  readonly manifestFileName: string;
  readonly entries: readonly ProjectArtifactEntry[];
}

export function toApiProjectArtifactBundle(bundle: ProjectArtifactBundle): ApiProjectArtifactBundle {
  return {
    projectId: bundle.projectId,
    manifestFileName: "manifest.json",
    entries: bundle.entries
  };
}
