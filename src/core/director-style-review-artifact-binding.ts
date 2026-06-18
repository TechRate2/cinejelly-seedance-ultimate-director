import type {
  DirectorStyleBenchmarkReviewArtifactBinding,
  DirectorStyleBenchmarkReviewArtifactBindingStatus
} from "../types/director-style-benchmark.js";

export interface DirectorStyleReviewArtifactBindingOptions {
  readonly expectedArtifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding | undefined;
}

export interface DirectorStyleReviewArtifactBindingResult {
  readonly artifactBinding?: DirectorStyleBenchmarkReviewArtifactBinding;
  readonly artifactBindingStatus: DirectorStyleBenchmarkReviewArtifactBindingStatus;
  readonly findings: readonly string[];
}

export function normalizeDirectorStyleReviewArtifactBinding(
  value: unknown,
  options: DirectorStyleReviewArtifactBindingOptions = {}
): DirectorStyleReviewArtifactBindingResult {
  const artifactBinding = normalizeArtifactBinding(value);
  const artifactBindingStatus = artifactBindingStatusFor(artifactBinding, options.expectedArtifactBinding);
  return {
    ...(artifactBinding ? { artifactBinding } : {}),
    artifactBindingStatus,
    findings: findingsFor(artifactBindingStatus)
  };
}

function normalizeArtifactBinding(value: unknown): DirectorStyleBenchmarkReviewArtifactBinding | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const source = isRecord(value.artifactBinding) ? value.artifactBinding : value;
  const projectId = safeIdentifier(source.projectId);
  const requestId = safeIdentifier(source.requestId);
  const deliverableSha256 = safeSha256(source.deliverableSha256 ?? source.deliverableHash ?? source.deliverableArtifactSha256);
  if (!projectId && !requestId && !deliverableSha256) {
    return undefined;
  }
  return {
    ...(projectId ? { projectId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(deliverableSha256 ? { deliverableSha256 } : {})
  };
}

function artifactBindingStatusFor(
  artifactBinding: DirectorStyleBenchmarkReviewArtifactBinding | undefined,
  expectedArtifactBinding: DirectorStyleBenchmarkReviewArtifactBinding | undefined
): DirectorStyleBenchmarkReviewArtifactBindingStatus {
  if (!artifactBinding || !expectedArtifactBinding || !hasCompleteArtifactBinding(expectedArtifactBinding)) {
    return "missing";
  }
  return artifactBinding.projectId === expectedArtifactBinding.projectId &&
    artifactBinding.requestId === expectedArtifactBinding.requestId &&
    artifactBinding.deliverableSha256 === expectedArtifactBinding.deliverableSha256
    ? "matched"
    : "mismatched";
}

function hasCompleteArtifactBinding(value: DirectorStyleBenchmarkReviewArtifactBinding): boolean {
  return typeof value.projectId === "string" && value.projectId.length > 0 &&
    typeof value.requestId === "string" && value.requestId.length > 0 &&
    typeof value.deliverableSha256 === "string" && value.deliverableSha256.length > 0;
}

function findingsFor(status: DirectorStyleBenchmarkReviewArtifactBindingStatus): readonly string[] {
  if (status === "matched") {
    return [];
  }
  if (status === "mismatched") {
    return ["Structured review artifact binding does not match the paid-render project/request/deliverable fingerprint."];
  }
  return ["Structured review artifact binding is missing; review evidence cannot satisfy artifact-bound parity rows."];
}

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(trimmed) ? trimmed : undefined;
}

function safeSha256(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
