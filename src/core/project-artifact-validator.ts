/**
 * Validates durable run artifacts after real provider validation.
 * This is a production operator gate, not a test fixture or mock runtime.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  ProjectArtifactBundle,
  ProjectArtifactEntry,
  ProjectArtifactKind,
  ProjectArtifactValidationCheck,
  ProjectArtifactValidationReport,
  ProjectArtifactValidationStatus
} from "../types/artifact.js";
import { redactText } from "../utils/redaction.js";

const SUCCESS_REQUIRED_KINDS: readonly ProjectArtifactKind[] = [
  "run_summary",
  "review_packet",
  "story_plan",
  "storyboard",
  "storyboard_preflight",
  "production_graph",
  "material_sourcing_plan",
  "material_source_validation",
  "stage_lifecycle",
  "cost_plan",
  "compiled_prompts",
  "rendered_shots",
  "cost_ledger"
];

const FAILURE_REQUIRED_KINDS: readonly ProjectArtifactKind[] = ["failure_report", "cost_ledger"];
const EXPECTED_STAGE_ORDER = [
  "plan",
  "storyboard",
  "prompt",
  "source_material",
  "render",
  "inspect",
  "repair",
  "assemble",
  "deliver"
];
const MATERIAL_VALIDATION_STATUSES = new Set(["planned_only", "approved", "review_required", "rejected"]);
const MATERIAL_VALIDATION_SEVERITIES = new Set(["info", "warn", "block"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATA_URI_PATTERN = /"[^"]*data:[^"]*"/i;
const CREDENTIAL_QUERY_URI_PATTERN =
  /https?:\/\/[^"\s?]+[?][^"\s]*(?:api[_-]?key|access[_-]?key|token|secret|signature|sig|password|credential|authorization|auth|x-amz-|x-goog-|x-oss-|x-ms-)[^"\s]*/i;

interface LoadedArtifact {
  readonly entry: ProjectArtifactEntry;
  readonly text: string;
  readonly value: unknown;
}

export class ProjectArtifactValidator {
  public async validate(inputPath: string): Promise<ProjectArtifactValidationReport> {
    const artifactDirectory = resolve(inputPath);
    const checks: ProjectArtifactValidationCheck[] = [];

    try {
      const manifestRoot = await this.findManifestRoot(artifactDirectory);
      const manifestPath = join(manifestRoot, "manifest.json");
      const manifestText = await readFile(manifestPath, "utf8");
      const manifest = this.parseJson<ProjectArtifactBundle>(manifestText, "manifest.json", checks);
      if (!manifest) {
        return this.report(artifactDirectory, checks, { manifestPath });
      }

      this.validateManifestShape(manifest, checks);
      const artifacts = await this.loadArtifacts(manifestRoot, manifest, checks);
      this.validateRequiredArtifacts(artifacts, checks);
      this.validateDomainArtifacts(manifest, artifacts, checks);

      return this.report(artifactDirectory, checks, {
        manifestPath,
        ...(typeof manifest.projectId === "string" ? { projectId: manifest.projectId } : {})
      });
    } catch (error) {
      checks.push({
        name: "artifact_directory",
        status: "fail",
        message: error instanceof Error ? error.message : String(error)
      });
      return this.report(artifactDirectory, checks);
    }
  }

  private async findManifestRoot(inputPath: string): Promise<string> {
    const directManifestPath = join(inputPath, "manifest.json");
    if (await this.pathExists(directManifestPath)) {
      return inputPath;
    }

    const children = await readdir(inputPath, { withFileTypes: true });
    const roots: string[] = [];
    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }
      const candidate = join(inputPath, child.name);
      if (await this.pathExists(join(candidate, "manifest.json"))) {
        roots.push(candidate);
      }
    }
    if (roots.length === 1) {
      const root = roots[0];
      if (root) {
        return root;
      }
    }
    if (roots.length > 1) {
      throw new Error("Multiple artifact manifests found. Pass the specific project artifact directory.");
    }
    throw new Error("No manifest.json found in the artifact directory or its direct child directories.");
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private parseJson<TValue>(
    text: string,
    fileName: string,
    checks: ProjectArtifactValidationCheck[]
  ): TValue | undefined {
    try {
      return JSON.parse(text) as TValue;
    } catch (error) {
      checks.push({
        name: "json_parse",
        status: "fail",
        fileName,
        message: error instanceof Error ? error.message : "JSON parse failed."
      });
      return undefined;
    }
  }

  private validateManifestShape(manifest: ProjectArtifactBundle, checks: ProjectArtifactValidationCheck[]): void {
    if (!this.isRecord(manifest)) {
      checks.push({ name: "manifest_shape", status: "fail", message: "Manifest is not a JSON object." });
      return;
    }
    if (typeof manifest.projectId !== "string" || !manifest.projectId.trim()) {
      checks.push({ name: "manifest_project_id", status: "fail", message: "Manifest projectId is missing." });
    }
    if (!Array.isArray(manifest.entries)) {
      checks.push({ name: "manifest_entries", status: "fail", message: "Manifest entries must be an array." });
      return;
    }
    const seenFileNames = new Set<string>();
    const seenKinds = new Set<string>();
    for (const entry of manifest.entries) {
      if (!this.isRecord(entry)) {
        checks.push({ name: "manifest_entry_shape", status: "fail", message: "Manifest entry is not an object." });
        continue;
      }
      const fileName = typeof entry.fileName === "string" ? entry.fileName : undefined;
      const kind = typeof entry.kind === "string" ? entry.kind : undefined;
      if (!kind) {
        checks.push({ name: "manifest_entry_kind", status: "fail", message: "Manifest entry kind is missing." });
      } else if (seenKinds.has(kind)) {
        checks.push({ name: "manifest_duplicate_kind", status: "fail", message: `Duplicate artifact kind ${kind}.` });
      } else {
        seenKinds.add(kind);
      }
      if (!fileName || !this.isSafeArtifactFileName(fileName)) {
        checks.push({
          name: "manifest_entry_filename",
          status: "fail",
          message: `Unsafe or missing artifact file name: ${fileName ?? "<missing>"}.`
        });
      } else if (seenFileNames.has(fileName)) {
        checks.push({ name: "manifest_duplicate_filename", status: "fail", fileName, message: "Duplicate artifact file name." });
      } else {
        seenFileNames.add(fileName);
      }
      if (entry.contentType !== "application/json") {
        checks.push({
          name: "manifest_entry_content_type",
          status: "fail",
          ...(fileName ? { fileName } : {}),
          message: "Artifact contentType must be application/json."
        });
      }
      const byteSize = entry.byteSize;
      if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 0) {
        checks.push({
          name: "manifest_entry_byte_size",
          status: "fail",
          ...(fileName ? { fileName } : {}),
          message: "Artifact byteSize is invalid."
        });
      }
      if (typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) {
        checks.push({
          name: "manifest_entry_sha256",
          status: "fail",
          ...(fileName ? { fileName } : {}),
          message: "Artifact sha256 is invalid."
        });
      }
    }
  }

  private async loadArtifacts(
    manifestRoot: string,
    manifest: ProjectArtifactBundle,
    checks: ProjectArtifactValidationCheck[]
  ): Promise<ReadonlyMap<ProjectArtifactKind, LoadedArtifact>> {
    const artifacts = new Map<ProjectArtifactKind, LoadedArtifact>();
    if (!Array.isArray(manifest.entries)) {
      return artifacts;
    }

    for (const entry of manifest.entries) {
      if (!this.isArtifactEntry(entry) || !this.isSafeArtifactFileName(entry.fileName)) {
        continue;
      }
      const path = join(manifestRoot, entry.fileName);
      try {
        const bytes = await readFile(path);
        const text = bytes.toString("utf8");
        this.validateArtifactBytes(entry, bytes, text, checks);
        const value = this.parseJson<unknown>(text, entry.fileName, checks);
        if (value !== undefined) {
          artifacts.set(entry.kind, { entry, text, value });
        }
      } catch (error) {
        checks.push({
          name: "artifact_read",
          status: "fail",
          fileName: entry.fileName,
          message: error instanceof Error ? error.message : "Artifact read failed."
        });
      }
    }
    return artifacts;
  }

  private validateArtifactBytes(
    entry: ProjectArtifactEntry,
    bytes: Buffer,
    text: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (bytes.byteLength !== entry.byteSize) {
      checks.push({
        name: "artifact_byte_size",
        status: "fail",
        fileName: entry.fileName,
        message: `Artifact byteSize mismatch: manifest=${entry.byteSize}, actual=${bytes.byteLength}.`
      });
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) {
      checks.push({
        name: "artifact_sha256",
        status: "fail",
        fileName: entry.fileName,
        message: "Artifact SHA-256 does not match manifest."
      });
    }
    if (redactText(text) !== text) {
      checks.push({
        name: "artifact_secret_redaction",
        status: "fail",
        fileName: entry.fileName,
        message: "Artifact contains secret-like text that redaction would alter."
      });
    }
    if (DATA_URI_PATTERN.test(text)) {
      checks.push({
        name: "artifact_data_uri",
        status: "fail",
        fileName: entry.fileName,
        message: "Artifact contains an inline data URI."
      });
    }
    if (CREDENTIAL_QUERY_URI_PATTERN.test(text)) {
      checks.push({
        name: "artifact_credential_uri",
        status: "fail",
        fileName: entry.fileName,
        message: "Artifact contains a URL with credential-like query parameters."
      });
    }
  }

  private validateRequiredArtifacts(
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const failureBundle = artifacts.has("failure_report");
    const requiredKinds = failureBundle ? FAILURE_REQUIRED_KINDS : SUCCESS_REQUIRED_KINDS;
    for (const kind of requiredKinds) {
      if (!artifacts.has(kind)) {
        checks.push({
          name: "required_artifact",
          status: "fail",
          message: `Missing required ${failureBundle ? "failure" : "success"} artifact: ${kind}.`
        });
      }
    }
    if (!failureBundle && !artifacts.has("deliverable")) {
      checks.push({
        name: "deliverable_artifact",
        status: "warn",
        message: "No deliverable.json artifact was found. This is acceptable only for a non-assembly validation run."
      });
    }
  }

  private validateDomainArtifacts(
    manifest: ProjectArtifactBundle,
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    this.validateRunSummary(manifest, artifacts.get("run_summary"), checks);
    this.validateReviewPacket(manifest, artifacts.get("review_packet"), checks);
    this.validateStageLifecycle(manifest, artifacts.get("stage_lifecycle"), checks);
    this.validateMaterialSourcingPlan(artifacts.get("material_sourcing_plan"), checks);
    this.validateMaterialSourceValidation(manifest, artifacts.get("material_source_validation"), checks);
    this.validateCostLedger(artifacts.get("cost_ledger"), artifacts.has("failure_report"), checks);
    this.validateProductionGraph(artifacts.get("production_graph"), artifacts, checks);
    this.validateDeliverable(artifacts.get("deliverable"), checks);
    this.validateFailureReport(manifest, artifacts.get("failure_report"), checks);
  }

  private validateRunSummary(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "run_summary_shape", status: "fail", fileName: artifact.entry.fileName, message: "run-summary must be an object." });
      return;
    }
    if (value.artifactSchemaVersion !== "cinejelly.artifacts.v1") {
      checks.push({ name: "run_summary_schema", status: "fail", fileName: artifact.entry.fileName, message: "Unexpected run-summary schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "run_summary_project", status: "fail", fileName: artifact.entry.fileName, message: "run-summary projectId does not match manifest." });
    }
    if (!Array.isArray(value.stageStatuses)) {
      checks.push({ name: "run_summary_stages", status: "fail", fileName: artifact.entry.fileName, message: "run-summary stageStatuses are missing." });
    }
  }

  private validateReviewPacket(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "review_packet_shape", status: "fail", fileName: artifact.entry.fileName, message: "review-packet must be an object." });
      return;
    }
    if (value.artifactSchemaVersion !== "cinejelly.review_packet.v1") {
      checks.push({ name: "review_packet_schema", status: "fail", fileName: artifact.entry.fileName, message: "Unexpected review-packet schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "review_packet_project", status: "fail", fileName: artifact.entry.fileName, message: "review-packet projectId does not match manifest." });
    }
    this.requireArray(value.sourceLineage, "review_packet_source_lineage", artifact.entry.fileName, checks);
    this.requireArray(value.repairProvenance, "review_packet_repair_provenance", artifact.entry.fileName, checks);
    this.requireArray(value.stageLifecycle, "review_packet_stage_lifecycle", artifact.entry.fileName, checks);
  }

  private validateStageLifecycle(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "stage_lifecycle_shape", status: "fail", fileName: artifact.entry.fileName, message: "stage-lifecycle must be an object." });
      return;
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "stage_lifecycle_project", status: "fail", fileName: artifact.entry.fileName, message: "stage-lifecycle projectId does not match manifest." });
    }
    if (!Array.isArray(value.records)) {
      checks.push({ name: "stage_lifecycle_records", status: "fail", fileName: artifact.entry.fileName, message: "stage-lifecycle records are missing." });
      return;
    }
    for (const [index, expectedStage] of EXPECTED_STAGE_ORDER.entries()) {
      const record = value.records[index];
      if (!this.isRecord(record) || record.stage !== expectedStage || record.order !== index) {
        checks.push({
          name: "stage_lifecycle_order",
          status: "fail",
          fileName: artifact.entry.fileName,
          message: `Stage ${index} must be ${expectedStage}.`
        });
      }
    }
  }

  private validateMaterialSourcingPlan(
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value) || !Array.isArray(value.briefs)) {
      checks.push({ name: "material_plan_shape", status: "fail", fileName: artifact.entry.fileName, message: "material-sourcing-plan briefs are missing." });
      return;
    }
    for (const [index, brief] of value.briefs.entries()) {
      if (!this.isRecord(brief)) {
        checks.push({ name: "material_brief_shape", status: "fail", fileName: artifact.entry.fileName, message: `Material brief ${index} is not an object.` });
        continue;
      }
      if (typeof brief.rightsRequirement !== "string" || !brief.rightsRequirement) {
        checks.push({ name: "material_rights", status: "fail", fileName: artifact.entry.fileName, message: `Material brief ${index} is missing rightsRequirement.` });
      }
      if (!Array.isArray(brief.preferredSources) || brief.preferredSources.length === 0) {
        checks.push({ name: "material_sources", status: "fail", fileName: artifact.entry.fileName, message: `Material brief ${index} is missing preferredSources.` });
      }
      const targetDurationSeconds = brief.targetDurationSeconds;
      if (typeof targetDurationSeconds !== "number" || !Number.isFinite(targetDurationSeconds)) {
        checks.push({ name: "material_duration", status: "fail", fileName: artifact.entry.fileName, message: `Material brief ${index} has invalid targetDurationSeconds.` });
      }
      const maxCandidates = brief.maxCandidates;
      if (typeof maxCandidates !== "number" || !Number.isInteger(maxCandidates) || maxCandidates <= 0) {
        checks.push({ name: "material_candidates", status: "fail", fileName: artifact.entry.fileName, message: `Material brief ${index} has invalid maxCandidates.` });
      }
    }
  }

  private validateMaterialSourceValidation(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "material_validation_shape", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation must be an object." });
      return;
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "material_validation_project", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation projectId does not match manifest." });
    }
    if (typeof value.planId !== "string" || !value.planId) {
      checks.push({ name: "material_validation_plan", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation planId is missing." });
    }
    if (typeof value.status !== "string" || !MATERIAL_VALIDATION_STATUSES.has(value.status)) {
      checks.push({ name: "material_validation_status", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation status is invalid." });
    }
    for (const field of ["candidateCount", "selectedCandidateCount", "approvedCandidateCount", "rejectedCandidateCount"] as const) {
      if (typeof value[field] !== "number" || !Number.isInteger(value[field]) || value[field] < 0) {
        checks.push({ name: "material_validation_count", status: "fail", fileName: artifact.entry.fileName, message: `material-source-validation ${field} is invalid.` });
      }
    }
    if (!Array.isArray(value.candidates)) {
      checks.push({ name: "material_validation_candidates", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation candidates must be an array." });
    }
    if (!Array.isArray(value.issues)) {
      checks.push({ name: "material_validation_issues", status: "fail", fileName: artifact.entry.fileName, message: "material-source-validation issues must be an array." });
      return;
    }
    const hasBlockingIssue = value.issues.some((issue) => this.isRecord(issue) && issue.severity === "block");
    if (value.status === "rejected" && !hasBlockingIssue) {
      checks.push({ name: "material_validation_rejected_issue", status: "fail", fileName: artifact.entry.fileName, message: "Rejected material validation must include a blocking issue." });
    }
    for (const [index, issue] of value.issues.entries()) {
      if (!this.isRecord(issue)) {
        checks.push({ name: "material_validation_issue_shape", status: "fail", fileName: artifact.entry.fileName, message: `Material validation issue ${index} is not an object.` });
        continue;
      }
      if (typeof issue.code !== "string" || !issue.code) {
        checks.push({ name: "material_validation_issue_code", status: "fail", fileName: artifact.entry.fileName, message: `Material validation issue ${index} is missing code.` });
      }
      if (typeof issue.severity !== "string" || !MATERIAL_VALIDATION_SEVERITIES.has(issue.severity)) {
        checks.push({ name: "material_validation_issue_severity", status: "fail", fileName: artifact.entry.fileName, message: `Material validation issue ${index} has invalid severity.` });
      }
      if (typeof issue.message !== "string" || !issue.message || typeof issue.repair !== "string" || !issue.repair) {
        checks.push({ name: "material_validation_issue_text", status: "fail", fileName: artifact.entry.fileName, message: `Material validation issue ${index} is missing message or repair.` });
      }
    }
  }

  private validateCostLedger(
    artifact: LoadedArtifact | undefined,
    failureBundle: boolean,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    if (!Array.isArray(artifact.value)) {
      checks.push({ name: "cost_ledger_shape", status: "fail", fileName: artifact.entry.fileName, message: "cost-ledger must be an array." });
      return;
    }
    if (!failureBundle && artifact.value.length === 0) {
      checks.push({ name: "cost_ledger_empty", status: "fail", fileName: artifact.entry.fileName, message: "Successful provider validation must include cost ledger entries." });
    }
    for (const [index, entry] of artifact.value.entries()) {
      if (!this.isRecord(entry)) {
        checks.push({ name: "cost_ledger_entry", status: "fail", fileName: artifact.entry.fileName, message: `Cost ledger entry ${index} is not an object.` });
        continue;
      }
      for (const field of ["provider", "operation", "status"] as const) {
        if (typeof entry[field] !== "string" || !entry[field]) {
          checks.push({ name: "cost_ledger_field", status: "fail", fileName: artifact.entry.fileName, message: `Cost ledger entry ${index} is missing ${field}.` });
        }
      }
      const retryCount = entry.retryCount;
      if (typeof retryCount !== "number" || !Number.isInteger(retryCount) || retryCount < 0) {
        checks.push({ name: "cost_ledger_retry", status: "fail", fileName: artifact.entry.fileName, message: `Cost ledger entry ${index} has invalid retryCount.` });
      }
    }
  }

  private validateProductionGraph(
    artifact: LoadedArtifact | undefined,
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      checks.push({ name: "production_graph_shape", status: "fail", fileName: artifact.entry.fileName, message: "production-graph nodes/edges are missing." });
      return;
    }
    const nodeTypes = new Set(
      value.nodes
        .filter((node): node is Record<string, unknown> => this.isRecord(node))
        .map((node) => node.type)
        .filter((type): type is string => typeof type === "string")
    );
    for (const type of ["project", "shot", "material_sourcing"] as const) {
      if (!nodeTypes.has(type)) {
        checks.push({ name: "production_graph_node_type", status: "fail", fileName: artifact.entry.fileName, message: `production-graph is missing ${type} node evidence.` });
      }
    }
    if (artifacts.has("rendered_shots") && !nodeTypes.has("clip_render")) {
      checks.push({ name: "production_graph_render_nodes", status: "warn", fileName: artifact.entry.fileName, message: "production-graph has rendered_shots artifact but no clip_render node." });
    }
  }

  private validateDeliverable(
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "deliverable_shape", status: "fail", fileName: artifact.entry.fileName, message: "deliverable must be an object." });
      return;
    }
    const outputByteSize = value.outputByteSize;
    if (typeof outputByteSize !== "number" || !Number.isInteger(outputByteSize) || outputByteSize <= 0) {
      checks.push({ name: "deliverable_size", status: "fail", fileName: artifact.entry.fileName, message: "deliverable outputByteSize is invalid." });
    }
    if (typeof value.outputSha256 !== "string" || !SHA256_PATTERN.test(value.outputSha256)) {
      checks.push({ name: "deliverable_sha256", status: "fail", fileName: artifact.entry.fileName, message: "deliverable outputSha256 is invalid." });
    }
  }

  private validateFailureReport(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "failure_report_shape", status: "fail", fileName: artifact.entry.fileName, message: "failure-report must be an object." });
      return;
    }
    if (value.artifactSchemaVersion !== "cinejelly.artifacts.v1") {
      checks.push({ name: "failure_report_schema", status: "fail", fileName: artifact.entry.fileName, message: "Unexpected failure-report schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "failure_report_project", status: "fail", fileName: artifact.entry.fileName, message: "failure-report projectId does not match manifest." });
    }
    if (!this.isRecord(value.error) || typeof value.error.message !== "string") {
      checks.push({ name: "failure_report_error", status: "fail", fileName: artifact.entry.fileName, message: "failure-report error payload is missing a stack-free message." });
    }
    if (this.isRecord(value.error) && "stack" in value.error) {
      checks.push({ name: "failure_report_stack", status: "fail", fileName: artifact.entry.fileName, message: "failure-report must not expose stack traces." });
    }
  }

  private requireArray(
    value: unknown,
    name: string,
    fileName: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!Array.isArray(value)) {
      checks.push({ name, status: "fail", fileName, message: `${name} must be an array.` });
    }
  }

  private isArtifactEntry(value: unknown): value is ProjectArtifactEntry {
    return (
      this.isRecord(value) &&
      typeof value.kind === "string" &&
      typeof value.fileName === "string" &&
      value.contentType === "application/json" &&
      Number.isInteger(value.byteSize) &&
      typeof value.sha256 === "string"
    );
  }

  private isSafeArtifactFileName(fileName: string): boolean {
    return basename(fileName) === fileName && !fileName.includes("..") && fileName.endsWith(".json");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private report(
    artifactDirectory: string,
    checks: readonly ProjectArtifactValidationCheck[],
    metadata: { readonly manifestPath?: string; readonly projectId?: string } = {}
  ): ProjectArtifactValidationReport {
    const reportedChecks =
      checks.length > 0
        ? checks
        : [
            {
              name: "artifact_validation",
              status: "pass" as const,
              message: "Artifact manifest, hashes, required files, and domain checks passed."
            }
          ];
    return {
      status: this.rollup(reportedChecks),
      checkedAt: new Date(),
      artifactDirectory,
      ...(metadata.manifestPath ? { manifestPath: metadata.manifestPath } : {}),
      ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
      checks: reportedChecks
    };
  }

  private rollup(checks: readonly ProjectArtifactValidationCheck[]): ProjectArtifactValidationStatus {
    if (checks.some((check) => check.status === "fail")) {
      return "fail";
    }
    if (checks.some((check) => check.status === "warn")) {
      return "warn";
    }
    return "pass";
  }
}
