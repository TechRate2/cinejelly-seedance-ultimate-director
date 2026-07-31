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
import { containsSecret } from "../utils/redaction.js";

const SUCCESS_REQUIRED_KINDS: readonly ProjectArtifactKind[] = [
  "run_summary",
  "review_packet",
  "story_plan",
  "storyboard",
  "storyboard_preflight",
  "production_graph",
  "long_form_continuity",
  "long_form_agent_review",
  "video_render_strategy",
  "long_form_timeline",
  "long_form_creative_intelligence",
  "long_form_readiness",
  "material_sourcing_plan",
  "material_source_validation",
  "postproduction_asset_plan",
  "render_schedule",
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
const MATERIAL_CANDIDATE_EVALUATION_DECISIONS = new Set(["approved", "review_required", "rejected"]);
const POSTPRODUCTION_ASSET_STATUSES = new Set(["disabled", "planned", "review_required"]);
const POSTPRODUCTION_CAPTION_DELIVERY_MODES = new Set(["disabled", "sidecar", "burn_in"]);
const POSTPRODUCTION_ASSET_SEVERITIES = new Set(["info", "warn", "block"]);
const POSTPRODUCTION_AUDIO_ROLES = new Set(["music", "narration", "ambience", "sfx"]);
const POSTPRODUCTION_GENERATED_AUDIO_STATUSES = new Set([
  "not_requested",
  "planned_only",
  "ready_for_provider",
  "partially_ready"
]);
const POSTPRODUCTION_GENERATED_AUDIO_KINDS = new Set(["tts_narration", "bgm", "ambience", "sfx"]);
const RENDER_SCHEDULE_MODES = new Set(["parallel", "sequential"]);
const RENDER_SCHEDULE_SEQUENTIAL_REASONS = new Set([
  "endpoint_reference",
  "endpoint_continuity",
  "source_video_structure",
  "source_video_timeline",
  "continuity_risk",
  "transition_risk",
  "transition_intent",
  "strategy_reference_lock",
  "strategy_last_frame_chaining",
  "strategy_source_video",
  "strategy_sequence_bible",
  "strategy_manual_storyboard"
]);
const GENERATED_AUDIO_OUTPUT_BATCH_STATUSES = new Set([
  "not_requested",
  "approved",
  "review_required",
  "partially_approved",
  "rejected"
]);
const GENERATED_AUDIO_OUTPUT_VALIDATION_STATUSES = new Set(["approved", "review_required", "rejected"]);
const GENERATED_AUDIO_OUTPUT_ISSUE_SEVERITIES = new Set(["info", "warn", "block"]);
const REVIEW_APPROVAL_STATUSES = new Set(["approved", "approval_required", "changes_requested", "rejected", "blocked"]);
const REVIEW_APPROVAL_GATES = new Set(["pre_render", "pre_export"]);
const LONG_FORM_AGENT_REVIEW_STATUSES = new Set(["ready", "review_required", "blocked"]);
const LONG_FORM_CREATIVE_STATUSES = new Set(["ready", "review_required", "blocked"]);
const LONG_DIRECTOR_UI_WORKFLOW_MODES = new Set([
  "story_bible",
  "sequence_board",
  "continuity_review",
  "candidate_review",
  "repair_queue",
  "manual_quality_review"
]);
const LONG_DIRECTOR_UI_ACTION_STATUSES = new Set(["ready", "needs_review", "blocked", "optional"]);
const LONG_DIRECTOR_UI_ACTION_HANDLERS = new Set(["backend", "user", "operator"]);
const LONG_DIRECTOR_NARRATIVE_MODES = new Set([
  "single_long_story",
  "documentary_explainer",
  "training_or_education",
  "brand_film",
  "series_episode"
]);
const LONG_DIRECTOR_CONTINUITY_MODES = new Set(["project_bible", "series_bible_required"]);
const LONG_DIRECTOR_CHECKPOINT_STAGES = new Set(["story", "scene_plan", "references", "sample", "render", "publish"]);
const LONG_FORM_READINESS_STATUSES = new Set(["ready", "review_required", "blocked"]);
const LONG_FORM_READINESS_INTENT_KINDS = new Set([
  "commercial_ad",
  "cinematic_story",
  "documentary",
  "education_training",
  "long_explainer",
  "reference_product_story",
  "source_video_guided",
  "short_story",
  "general_long_form"
]);
const LONG_FORM_READINESS_DURATION_CLASSES = new Set([
  "under_45_seconds",
  "short_45_90_seconds",
  "medium_90_180_seconds",
  "long_3_8_minutes",
  "extended_over_8_minutes"
]);
const LONG_FORM_READINESS_USER_CONTROL_MODES = new Set([
  "auto",
  "single",
  "storyboard",
  "multishot",
  "reference_locked",
  "source_video",
  "sequence_bible",
  "manual_storyboard"
]);
const LONG_FORM_READINESS_RENDER_UNIT_MODES = new Set([
  "single_clip",
  "storyboard_multishot",
  "reference_locked",
  "source_video_guided",
  "sequence_bible",
  "manual_review_required"
]);
const LONG_FORM_READINESS_REPAIR_CATEGORIES = new Set([
  "intent",
  "story",
  "coherence",
  "shot_strategy",
  "timeline",
  "audio_caption",
  "source_video",
  "review"
]);
const LONG_FORM_READINESS_REPAIR_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const LONG_FORM_CREATIVE_SEVERITIES = new Set(["info", "warn", "block"]);
const LONG_FORM_CREATIVE_REPAIR_SCOPES = new Set(["story", "sequence", "shot", "prompt", "postproduction", "timeline"]);
const LONG_FORM_CREATIVE_REPAIR_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const LONG_FORM_AGENT_REVIEW_ROLES = new Set([
  "script_architect",
  "continuity_supervisor",
  "source_video_reviewer",
  "render_orchestrator",
  "commercial_risk_reviewer"
]);
const LONG_FORM_AGENT_REVIEW_SEVERITIES = new Set(["info", "warn", "block"]);
const LONG_FORM_TIMELINE_ISSUE_SEVERITIES = new Set(["info", "warn", "block"]);
const VIDEO_RENDER_REQUESTED_MODES = new Set([
  "auto",
  "single",
  "storyboard",
  "multishot",
  "reference_locked",
  "source_video",
  "manual_storyboard"
]);
const VIDEO_RENDER_WORKFLOW_MODES = new Set([
  "single_clip",
  "reference_locked_single_clip",
  "storyboard_multishot",
  "reference_locked_multishot",
  "source_video_guided",
  "sequence_bible",
  "manual_storyboard"
]);
const VIDEO_RENDER_CONTINUITY_MODES = new Set([
  "single_clip",
  "prompt_only",
  "reference_locked",
  "last_frame_chaining",
  "source_video_guided",
  "sequence_bible",
  "manual_locked"
]);
const VIDEO_RENDER_LAST_FRAME_STATUSES = new Set(["not_needed", "recommended", "required", "blocked"]);
const VIDEO_RENDER_ISSUE_SEVERITIES = new Set(["info", "warn", "block"]);
const LONG_FORM_TIMELINE_ISSUE_CODES = new Set([
  "duration_drift",
  "sequence_duration_drift",
  "missing_render_schedule_item",
  "caption_coverage_gap",
  "caption_out_of_range",
  "generated_audio_timing_gap",
  "generated_audio_blocked",
  "sequential_manual_review"
]);
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
    if (containsSecret(text)) {
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
    this.validatePostproductionAssetPlan(manifest, artifacts.get("postproduction_asset_plan"), checks);
    this.validateLongFormContinuity(manifest, artifacts.get("long_form_continuity"), checks);
    this.validateLongFormAgentReview(manifest, artifacts.get("long_form_agent_review"), checks);
    this.validateVideoRenderStrategy(manifest, artifacts.get("video_render_strategy"), checks);
    this.validateStoryboardApproval(manifest, artifacts.get("storyboard_approval"), checks);
    this.validateLongFormTimeline(manifest, artifacts.get("long_form_timeline"), checks);
    this.validateLongFormCreativeIntelligence(manifest, artifacts.get("long_form_creative_intelligence"), checks);
    this.validateLongDirectorUiContract(manifest, artifacts, checks);
    this.validateLongFormReadiness(manifest, artifacts.get("long_form_readiness"), checks);
    this.validateRenderSchedule(artifacts.get("render_schedule"), checks);
    this.validateGeneratedAudioOutputBatchValidation(artifacts.get("generated_audio_output_batch_validation"), checks);
    this.validatePostproductionAssetConsistency(artifacts, checks);
    this.validateGeneratedAudioOutputBatchConsistency(artifacts, checks);
    this.validateStoryboardApprovalConsistency(artifacts, checks);
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
    const planning = this.isRecord(value.planning) ? value.planning : undefined;
    if (!planning || typeof planning.longFormSequenceCount !== "number" || typeof planning.longFormContinuityBridgeCount !== "number") {
      checks.push({ name: "review_packet_long_form_continuity", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning is missing long-form continuity counts." });
    }
    if (
      !planning ||
      typeof planning.longFormAgentReviewStatus !== "string" ||
      !LONG_FORM_AGENT_REVIEW_STATUSES.has(planning.longFormAgentReviewStatus) ||
      typeof planning.longFormAgentReviewFindingCount !== "number" ||
      typeof planning.longFormAgentReviewBlockingFindingCount !== "number"
    ) {
      checks.push({ name: "review_packet_long_form_agent_review", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning is missing long-form agent review evidence." });
    }
    if (
      !planning ||
      typeof planning.longFormTimelineSegmentCount !== "number" ||
      typeof planning.longFormTimelineSequentialSegmentCount !== "number" ||
      typeof planning.longFormTimelineManualReviewSegmentCount !== "number" ||
      typeof planning.longFormTimelineIssueCount !== "number" ||
      typeof planning.longFormTimelineBlockingIssueCount !== "number"
    ) {
      checks.push({ name: "review_packet_long_form_timeline", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning is missing long-form timeline evidence." });
    }
    if (
      planning &&
      planning.longFormCreativeStatus !== undefined &&
      (
        typeof planning.longFormCreativeStatus !== "string" ||
        !LONG_FORM_CREATIVE_STATUSES.has(planning.longFormCreativeStatus) ||
        typeof planning.longFormCreativeQualityScore !== "number" ||
        typeof planning.longFormCreativeFindingCount !== "number" ||
        typeof planning.longFormCreativeBlockingFindingCount !== "number" ||
        typeof planning.longFormCreativeReviewRequiredFindingCount !== "number" ||
        typeof planning.longFormCreativeShotDirectiveCount !== "number" ||
        typeof planning.longFormCreativeCandidateDirectiveCount !== "number" ||
        typeof planning.longFormCreativeRepairDirectiveCount !== "number" ||
        typeof planning.longFormCreativeNiche !== "string" ||
        typeof planning.longFormCreativePlatformIntent !== "string"
      )
    ) {
      checks.push({ name: "review_packet_long_form_creative", status: "fail", fileName: artifact.entry.fileName, message: "review-packet long-form creative intelligence fields are invalid." });
    }
    if (
      planning &&
      planning.longDirectorUiContractReady !== undefined &&
      (
        typeof planning.longDirectorUiContractReady !== "boolean" ||
        typeof planning.longDirectorNarrativeMode !== "string" ||
        !LONG_DIRECTOR_NARRATIVE_MODES.has(planning.longDirectorNarrativeMode) ||
        typeof planning.longDirectorCheckpointStageCount !== "number" ||
        planning.longDirectorCheckpointStageCount < 1 ||
        typeof planning.longDirectorManualQualityReviewRequired !== "boolean" ||
        typeof planning.longDirectorBenchEvidenceRequired !== "boolean" ||
        typeof planning.longDirectorCanSubmitToProviderNow !== "boolean" ||
        typeof planning.longDirectorCanProceedToRenderAfterApproval !== "boolean" ||
        typeof planning.longDirectorRepairQueueCount !== "number" ||
        planning.longDirectorRepairQueueCount < 0
      )
    ) {
      checks.push({ name: "review_packet_long_director_ui", status: "fail", fileName: artifact.entry.fileName, message: "review-packet Long Director UI contract fields are invalid." });
    }
    if (
      !planning ||
      typeof planning.longFormReadinessStatus !== "string" ||
      !LONG_FORM_READINESS_STATUSES.has(planning.longFormReadinessStatus) ||
      typeof planning.longFormReadinessIntentKind !== "string" ||
      !LONG_FORM_READINESS_INTENT_KINDS.has(planning.longFormReadinessIntentKind) ||
      typeof planning.longFormReadinessCoherenceScore !== "number" ||
      planning.longFormReadinessCoherenceScore < 0 ||
      planning.longFormReadinessCoherenceScore > 100 ||
      typeof planning.longFormReadinessRepairQueueCount !== "number" ||
      typeof planning.longFormReadinessBlockingRepairCount !== "number" ||
      typeof planning.longFormReadinessManualShotReviewCount !== "number" ||
      typeof planning.longFormReadinessApprovalSurfaceCount !== "number" ||
      typeof planning.longFormReadinessCanRenderAfterApproval !== "boolean"
    ) {
      checks.push({ name: "review_packet_long_form_readiness", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning is missing long-form readiness evidence." });
    }
    if (
      !planning ||
      typeof planning.videoRenderRequestedMode !== "string" ||
      !VIDEO_RENDER_REQUESTED_MODES.has(planning.videoRenderRequestedMode) ||
      typeof planning.videoRenderWorkflowMode !== "string" ||
      !VIDEO_RENDER_WORKFLOW_MODES.has(planning.videoRenderWorkflowMode) ||
      typeof planning.videoRenderContinuityMode !== "string" ||
      !VIDEO_RENDER_CONTINUITY_MODES.has(planning.videoRenderContinuityMode) ||
      typeof planning.videoRenderRequiresSequentialRender !== "boolean" ||
      typeof planning.videoRenderRequiresStoryboardApproval !== "boolean" ||
      typeof planning.videoRenderStrategyIssueCount !== "number" ||
      typeof planning.videoRenderStrategyBlockingIssueCount !== "number"
    ) {
      checks.push({ name: "review_packet_video_render_strategy", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning is missing video render strategy evidence." });
    }
    if (!planning || typeof planning.hasStoryboardApprovalReport !== "boolean") {
      checks.push({ name: "review_packet_storyboard_approval", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning must declare storyboard approval evidence." });
    } else if (
      planning.hasStoryboardApprovalReport &&
      (
        typeof planning.storyboardApprovalStatus !== "string" ||
        !REVIEW_APPROVAL_STATUSES.has(planning.storyboardApprovalStatus) ||
        typeof planning.storyboardApprovalCheckpointCount !== "number" ||
        typeof planning.storyboardApprovalCanRender !== "boolean"
      )
    ) {
      checks.push({ name: "review_packet_storyboard_approval", status: "fail", fileName: artifact.entry.fileName, message: "review-packet planning storyboard approval fields are invalid." });
    }
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
    if (Array.isArray(value.candidateEvaluations)) {
      this.validateMaterialCandidateEvaluations(value.candidateEvaluations, value.candidateCount, artifact, checks);
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

  private validateRenderSchedule(
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "render_schedule_shape", status: "fail", fileName: artifact.entry.fileName, message: "render-schedule must be an object." });
      return;
    }
    if (typeof value.concurrency !== "number" || !Number.isInteger(value.concurrency) || value.concurrency <= 0) {
      checks.push({ name: "render_schedule_concurrency", status: "fail", fileName: artifact.entry.fileName, message: "render-schedule concurrency must be a positive integer." });
    }
    if (!Array.isArray(value.items) || !Array.isArray(value.batches)) {
      checks.push({ name: "render_schedule_collections", status: "fail", fileName: artifact.entry.fileName, message: "render-schedule items and batches must be arrays." });
      return;
    }
    if (typeof value.itemCount === "number" && value.itemCount !== value.items.length) {
      checks.push({ name: "render_schedule_item_count", status: "fail", fileName: artifact.entry.fileName, message: "render-schedule itemCount must match items length." });
    }
    if (typeof value.batchCount === "number" && value.batchCount !== value.batches.length) {
      checks.push({ name: "render_schedule_batch_count", status: "fail", fileName: artifact.entry.fileName, message: "render-schedule batchCount must match batches length." });
    }
    for (const [index, item] of value.items.entries()) {
      if (!this.isRecord(item)) {
        checks.push({ name: "render_schedule_item_shape", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} is not an object.` });
        continue;
      }
      if (typeof item.shotId !== "string" || !item.shotId) {
        checks.push({ name: "render_schedule_item_shot", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} is missing shotId.` });
      }
      if (typeof item.batchId !== "string" || !item.batchId) {
        checks.push({ name: "render_schedule_item_batch", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} is missing batchId.` });
      }
      if (typeof item.mode !== "string" || !RENDER_SCHEDULE_MODES.has(item.mode)) {
        checks.push({ name: "render_schedule_item_mode", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} has invalid mode.` });
      }
      if (!Array.isArray(item.sequentialReasons)) {
        checks.push({ name: "render_schedule_item_reasons", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} sequentialReasons must be an array.` });
      } else {
        if (item.mode === "sequential" && item.sequentialReasons.length === 0) {
          checks.push({ name: "render_schedule_item_reasons", status: "fail", fileName: artifact.entry.fileName, message: `Sequential render schedule item ${index} must include at least one reason.` });
        }
        if (item.mode === "parallel" && item.sequentialReasons.length !== 0) {
          checks.push({ name: "render_schedule_item_reasons", status: "fail", fileName: artifact.entry.fileName, message: `Parallel render schedule item ${index} must not include sequential reasons.` });
        }
        for (const reason of item.sequentialReasons) {
          if (typeof reason !== "string" || !RENDER_SCHEDULE_SEQUENTIAL_REASONS.has(reason)) {
            checks.push({ name: "render_schedule_reason", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule item ${index} has invalid sequential reason.` });
          }
        }
      }
    }
    for (const [index, batch] of value.batches.entries()) {
      if (!this.isRecord(batch)) {
        checks.push({ name: "render_schedule_batch_shape", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule batch ${index} is not an object.` });
        continue;
      }
      if (typeof batch.batchId !== "string" || !batch.batchId) {
        checks.push({ name: "render_schedule_batch_id", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule batch ${index} is missing batchId.` });
      }
      if (typeof batch.mode !== "string" || !RENDER_SCHEDULE_MODES.has(batch.mode)) {
        checks.push({ name: "render_schedule_batch_mode", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule batch ${index} has invalid mode.` });
      }
      if (!Array.isArray(batch.itemIndexes) || !Array.isArray(batch.shotIds)) {
        checks.push({ name: "render_schedule_batch_items", status: "fail", fileName: artifact.entry.fileName, message: `Render schedule batch ${index} must include itemIndexes and shotIds arrays.` });
      }
    }
  }

  private validateMaterialCandidateEvaluations(
    evaluations: readonly unknown[],
    candidateCount: unknown,
    artifact: LoadedArtifact,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (typeof candidateCount === "number" && evaluations.length !== candidateCount) {
      checks.push({
        name: "material_validation_candidate_evaluations",
        status: "fail",
        fileName: artifact.entry.fileName,
        message: "material-source-validation candidateEvaluations length must match candidateCount."
      });
    }
    for (const [index, evaluation] of evaluations.entries()) {
      if (!this.isRecord(evaluation)) {
        checks.push({ name: "material_validation_candidate_evaluation_shape", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} is not an object.` });
        continue;
      }
      if (typeof evaluation.candidateId !== "string" || !evaluation.candidateId) {
        checks.push({ name: "material_validation_candidate_evaluation_id", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} is missing candidateId.` });
      }
      if (typeof evaluation.decision !== "string" || !MATERIAL_CANDIDATE_EVALUATION_DECISIONS.has(evaluation.decision)) {
        checks.push({ name: "material_validation_candidate_evaluation_decision", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} has invalid decision.` });
      }
      if (typeof evaluation.fitScore !== "number" || evaluation.fitScore < 0 || evaluation.fitScore > 100) {
        checks.push({ name: "material_validation_candidate_evaluation_score", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} has invalid fitScore.` });
      }
      if (typeof evaluation.maxFitScore !== "number" || evaluation.maxFitScore !== 100) {
        checks.push({ name: "material_validation_candidate_evaluation_score", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} has invalid maxFitScore.` });
      }
      if (!Array.isArray(evaluation.scoreFactors) || evaluation.scoreFactors.length === 0) {
        checks.push({ name: "material_validation_candidate_evaluation_factors", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} is missing scoreFactors.` });
      }
      if (!Array.isArray(evaluation.blockingIssueCodes) || !Array.isArray(evaluation.warningIssueCodes)) {
        checks.push({ name: "material_validation_candidate_evaluation_issues", status: "fail", fileName: artifact.entry.fileName, message: `Material candidate evaluation ${index} is missing issue code arrays.` });
      }
    }
  }

  private validatePostproductionAssetPlan(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "postproduction_asset_shape", status: "fail", fileName: artifact.entry.fileName, message: "postproduction-assets must be an object." });
      return;
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "postproduction_asset_project", status: "fail", fileName: artifact.entry.fileName, message: "postproduction-assets projectId does not match manifest." });
    }
    if (typeof value.planId !== "string" || !value.planId) {
      checks.push({ name: "postproduction_asset_plan_id", status: "fail", fileName: artifact.entry.fileName, message: "postproduction-assets planId is missing." });
    }
    if (typeof value.status !== "string" || !POSTPRODUCTION_ASSET_STATUSES.has(value.status)) {
      checks.push({ name: "postproduction_asset_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction-assets status is invalid." });
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "postproduction_asset_origins", status: "fail", fileName: artifact.entry.fileName, message: "postproduction sourcePatternOrigins are invalid." });
    }
    if (!this.isRecord(value.caption) || typeof value.caption.cueCount !== "number" || !Number.isInteger(value.caption.cueCount) || value.caption.cueCount < 0) {
      checks.push({ name: "postproduction_caption_plan", status: "fail", fileName: artifact.entry.fileName, message: "postproduction caption cueCount is invalid." });
    } else {
      if (typeof value.caption.deliveryMode !== "string" || !POSTPRODUCTION_CAPTION_DELIVERY_MODES.has(value.caption.deliveryMode)) {
        checks.push({ name: "postproduction_caption_delivery", status: "fail", fileName: artifact.entry.fileName, message: "postproduction caption deliveryMode is invalid." });
      }
      if (typeof value.caption.totalCaptionSeconds !== "number" || value.caption.totalCaptionSeconds < 0) {
        checks.push({ name: "postproduction_caption_duration", status: "fail", fileName: artifact.entry.fileName, message: "postproduction caption duration is invalid." });
      }
    }
    if (!this.isRecord(value.audio) || typeof value.audio.trackCount !== "number" || !Number.isInteger(value.audio.trackCount) || value.audio.trackCount < 0) {
      checks.push({ name: "postproduction_audio_plan", status: "fail", fileName: artifact.entry.fileName, message: "postproduction audio trackCount is invalid." });
    } else if (!Array.isArray(value.audio.roleCounts)) {
      checks.push({ name: "postproduction_audio_roles", status: "fail", fileName: artifact.entry.fileName, message: "postproduction audio roleCounts must be an array." });
    } else {
      for (const [index, roleCount] of value.audio.roleCounts.entries()) {
        if (
          !this.isRecord(roleCount) ||
          typeof roleCount.role !== "string" ||
          !POSTPRODUCTION_AUDIO_ROLES.has(roleCount.role) ||
          typeof roleCount.count !== "number" ||
          !Number.isInteger(roleCount.count) ||
          roleCount.count < 0
        ) {
          checks.push({ name: "postproduction_audio_roles", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction audio role count ${index} is invalid.` });
        }
      }
    }
    if (!this.isRecord(value.generatedAudio)) {
      checks.push({ name: "postproduction_generated_audio_plan", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio plan is missing." });
    } else {
      if (typeof value.generatedAudio.status !== "string" || !POSTPRODUCTION_GENERATED_AUDIO_STATUSES.has(value.generatedAudio.status)) {
        checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio status is invalid." });
      }
      if (
        typeof value.generatedAudio.intentCount !== "number" ||
        !Number.isInteger(value.generatedAudio.intentCount) ||
        value.generatedAudio.intentCount < 0
      ) {
        checks.push({ name: "postproduction_generated_audio_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio intentCount is invalid." });
      }
      if (
        typeof value.generatedAudio.readyIntentCount !== "number" ||
        !Number.isInteger(value.generatedAudio.readyIntentCount) ||
        value.generatedAudio.readyIntentCount < 0
      ) {
        checks.push({ name: "postproduction_generated_audio_ready_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio readyIntentCount is invalid." });
      }
      if (
        typeof value.generatedAudio.blockedIntentCount !== "number" ||
        !Number.isInteger(value.generatedAudio.blockedIntentCount) ||
        value.generatedAudio.blockedIntentCount < 0
      ) {
        checks.push({ name: "postproduction_generated_audio_blocked_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio blockedIntentCount is invalid." });
      }
      if (
        typeof value.generatedAudio.intentCount === "number" &&
        typeof value.generatedAudio.readyIntentCount === "number" &&
        typeof value.generatedAudio.blockedIntentCount === "number" &&
        value.generatedAudio.readyIntentCount + value.generatedAudio.blockedIntentCount !== value.generatedAudio.intentCount
      ) {
        checks.push({ name: "postproduction_generated_audio_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio readyIntentCount plus blockedIntentCount must equal intentCount." });
      }
      if (
        typeof value.generatedAudio.requestedDurationSeconds !== "number" ||
        !Number.isFinite(value.generatedAudio.requestedDurationSeconds) ||
        value.generatedAudio.requestedDurationSeconds < 0
      ) {
        checks.push({ name: "postproduction_generated_audio_duration", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio requestedDurationSeconds is invalid." });
      }
      if (typeof value.generatedAudio.providerConfigured !== "boolean") {
        checks.push({ name: "postproduction_generated_audio_provider", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio providerConfigured must be boolean." });
      }
      if (!this.isRecord(value.generatedAudio.executionPlan)) {
        checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio executionPlan is missing." });
      } else {
        this.validateGeneratedAudioExecutionPlan(artifact.entry.fileName, value.generatedAudio.executionPlan, checks);
      }
      if (!Array.isArray(value.generatedAudio.kindCounts)) {
        checks.push({ name: "postproduction_generated_audio_kinds", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio kindCounts must be an array." });
      } else {
        for (const [index, kindCount] of value.generatedAudio.kindCounts.entries()) {
          if (
            !this.isRecord(kindCount) ||
            typeof kindCount.kind !== "string" ||
            !POSTPRODUCTION_GENERATED_AUDIO_KINDS.has(kindCount.kind) ||
            typeof kindCount.count !== "number" ||
            !Number.isInteger(kindCount.count) ||
            kindCount.count < 0
          ) {
            checks.push({ name: "postproduction_generated_audio_kinds", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction generatedAudio kind count ${index} is invalid.` });
          }
        }
        const kindCountTotal = value.generatedAudio.kindCounts.reduce((sum: number, kindCount: unknown) => {
          if (!this.isRecord(kindCount) || typeof kindCount.count !== "number" || !Number.isInteger(kindCount.count)) {
            return sum;
          }
          return sum + kindCount.count;
        }, 0);
        if (typeof value.generatedAudio.intentCount === "number" && kindCountTotal !== value.generatedAudio.intentCount) {
          checks.push({ name: "postproduction_generated_audio_kinds", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio kindCounts must sum to intentCount." });
        }
      }
      const generatedAudioStatus = typeof value.generatedAudio.status === "string" ? value.generatedAudio.status : undefined;
      const generatedAudioIntentCount =
        typeof value.generatedAudio.intentCount === "number" ? value.generatedAudio.intentCount : undefined;
      if (generatedAudioStatus === "not_requested" && generatedAudioIntentCount !== 0) {
        checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio not_requested status requires zero intents." });
      }
      if (generatedAudioStatus === "planned_only" && (generatedAudioIntentCount === undefined || generatedAudioIntentCount <= 0)) {
        checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio planned_only status requires at least one intent." });
      }
      if (generatedAudioStatus === "planned_only" && value.generatedAudio.readyIntentCount !== 0) {
        checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio planned_only status requires zero ready intents." });
      }
      if (generatedAudioStatus === "ready_for_provider") {
        const readyIntentCount = typeof value.generatedAudio.readyIntentCount === "number"
          ? value.generatedAudio.readyIntentCount
          : undefined;
        if (readyIntentCount === undefined || readyIntentCount <= 0 || value.generatedAudio.blockedIntentCount !== 0) {
          checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio ready_for_provider status requires ready intents and zero blocked intents." });
        }
      }
      if (generatedAudioStatus === "partially_ready") {
        const readyIntentCount = typeof value.generatedAudio.readyIntentCount === "number"
          ? value.generatedAudio.readyIntentCount
          : undefined;
        const blockedIntentCount = typeof value.generatedAudio.blockedIntentCount === "number"
          ? value.generatedAudio.blockedIntentCount
          : undefined;
        if (readyIntentCount === undefined || blockedIntentCount === undefined || readyIntentCount <= 0 || blockedIntentCount <= 0) {
          checks.push({ name: "postproduction_generated_audio_status", status: "fail", fileName: artifact.entry.fileName, message: "postproduction generatedAudio partially_ready status requires ready and blocked intents." });
        }
      }
    }
    if (typeof value.issueCount !== "number" || !Number.isInteger(value.issueCount) || value.issueCount < 0) {
      checks.push({ name: "postproduction_issue_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction issueCount is invalid." });
    }
    if (!Array.isArray(value.issues)) {
      checks.push({ name: "postproduction_issues", status: "fail", fileName: artifact.entry.fileName, message: "postproduction issues must be an array." });
      return;
    }
    if (typeof value.issueCount === "number" && value.issueCount !== value.issues.length) {
      checks.push({ name: "postproduction_issue_count", status: "fail", fileName: artifact.entry.fileName, message: "postproduction issueCount does not match issues length." });
    }
    for (const [index, issue] of value.issues.entries()) {
      if (!this.isRecord(issue)) {
        checks.push({ name: "postproduction_issue_shape", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction issue ${index} is not an object.` });
        continue;
      }
      if (typeof issue.code !== "string" || !issue.code) {
        checks.push({ name: "postproduction_issue_code", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction issue ${index} is missing code.` });
      }
      if (typeof issue.severity !== "string" || !POSTPRODUCTION_ASSET_SEVERITIES.has(issue.severity)) {
        checks.push({ name: "postproduction_issue_severity", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction issue ${index} has invalid severity.` });
      }
      if (typeof issue.message !== "string" || !issue.message || typeof issue.repair !== "string" || !issue.repair) {
        checks.push({ name: "postproduction_issue_text", status: "fail", fileName: artifact.entry.fileName, message: `Postproduction issue ${index} is missing message or repair.` });
      }
    }
  }

  private validateGeneratedAudioExecutionPlan(
    fileName: string,
    value: Record<string, unknown>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (typeof value.status !== "string" || !POSTPRODUCTION_GENERATED_AUDIO_STATUSES.has(value.status)) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan status is invalid." });
    }
    for (const field of ["intentCount", "readyCount", "blockedCount"] as const) {
      if (typeof value[field] !== "number" || !Number.isInteger(value[field]) || value[field] < 0) {
        checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: `generatedAudio executionPlan ${field} is invalid.` });
      }
    }
    if (
      typeof value.intentCount === "number" &&
      typeof value.readyCount === "number" &&
      typeof value.blockedCount === "number" &&
      value.readyCount + value.blockedCount !== value.intentCount
    ) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan readyCount plus blockedCount must equal intentCount." });
    }
    if (typeof value.requestedDurationSeconds !== "number" || !Number.isFinite(value.requestedDurationSeconds) || value.requestedDurationSeconds < 0) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan requestedDurationSeconds is invalid." });
    }
    if (typeof value.outputFormat !== "string" || !["mp3", "wav"].includes(value.outputFormat)) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan outputFormat is invalid." });
    }
    if (!Array.isArray(value.items)) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan items must be an array." });
      return;
    }
    if (typeof value.intentCount === "number" && value.items.length !== value.intentCount) {
      checks.push({ name: "postproduction_generated_audio_execution_plan", status: "fail", fileName, message: "generatedAudio executionPlan items length must equal intentCount." });
    }
    for (const [index, item] of value.items.entries()) {
      if (!this.isRecord(item)) {
        checks.push({ name: "postproduction_generated_audio_execution_item", status: "fail", fileName, message: `generatedAudio executionPlan item ${index} must be an object.` });
        continue;
      }
      if (typeof item.intentId !== "string" || !item.intentId || typeof item.kind !== "string" || !POSTPRODUCTION_GENERATED_AUDIO_KINDS.has(item.kind)) {
        checks.push({ name: "postproduction_generated_audio_execution_item", status: "fail", fileName, message: `generatedAudio executionPlan item ${index} has invalid identity fields.` });
      }
      if (item.status === "ready_for_provider") {
        if (typeof item.provider !== "string" || !item.provider || typeof item.modelId !== "string" || !item.modelId || !this.isRecord(item.request)) {
          checks.push({ name: "postproduction_generated_audio_execution_item", status: "fail", fileName, message: `generatedAudio ready item ${index} is missing provider, modelId, or request.` });
        }
      } else if (item.status === "blocked") {
        if (typeof item.reason !== "string" || !item.reason || typeof item.message !== "string" || !item.message) {
          checks.push({ name: "postproduction_generated_audio_execution_item", status: "fail", fileName, message: `generatedAudio blocked item ${index} is missing reason or message.` });
        }
      } else {
        checks.push({ name: "postproduction_generated_audio_execution_item", status: "fail", fileName, message: `generatedAudio executionPlan item ${index} status is invalid.` });
      }
    }
  }

  private validateLongFormContinuity(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_form_continuity_shape", status: "fail", fileName: artifact.entry.fileName, message: "long-form-continuity must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-form-continuity.v1") {
      checks.push({ name: "long_form_continuity_schema", status: "fail", fileName: artifact.entry.fileName, message: "Unexpected long-form-continuity schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_form_continuity_project", status: "fail", fileName: artifact.entry.fileName, message: "long-form-continuity projectId does not match manifest." });
    }
    if (!Array.isArray(value.sequences)) {
      checks.push({ name: "long_form_continuity_sequences", status: "fail", fileName: artifact.entry.fileName, message: "long-form-continuity sequences are missing." });
      return;
    }
    if (typeof value.sequenceCount !== "number" || value.sequenceCount !== value.sequences.length) {
      checks.push({ name: "long_form_continuity_sequence_count", status: "fail", fileName: artifact.entry.fileName, message: "long-form-continuity sequenceCount must match sequences length." });
    }
    const bridgeCount = value.sequences.filter((sequence) => this.isRecord(sequence) && this.isRecord(sequence.bridgeToNext)).length;
    if (typeof value.bridgeCount !== "number" || value.bridgeCount !== bridgeCount) {
      checks.push({ name: "long_form_continuity_bridge_count", status: "fail", fileName: artifact.entry.fileName, message: "long-form-continuity bridgeCount must match bridge evidence." });
    }
    for (const [index, sequence] of value.sequences.entries()) {
      if (!this.isRecord(sequence)) {
        checks.push({ name: "long_form_continuity_sequence_shape", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} is not an object.` });
        continue;
      }
      if (typeof sequence.sequenceId !== "string" || !sequence.sequenceId) {
        checks.push({ name: "long_form_continuity_sequence_id", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} is missing sequenceId.` });
      }
      if (typeof sequence.order !== "number" || !Number.isInteger(sequence.order) || sequence.order !== index) {
        checks.push({ name: "long_form_continuity_sequence_order", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} order is not deterministic.` });
      }
      for (const field of ["sceneIds", "beatIds", "shotIds", "riskCodes"] as const) {
        if (!Array.isArray(sequence[field])) {
          checks.push({ name: "long_form_continuity_sequence_arrays", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} ${field} must be an array.` });
        }
      }
      const anchors = this.isRecord(sequence.anchors) ? sequence.anchors : undefined;
      if (!anchors || !Array.isArray(anchors.identity) || !Array.isArray(anchors.product) || !Array.isArray(anchors.environment) || !Array.isArray(anchors.style) || !Array.isArray(anchors.sourceVideoSceneIds)) {
        checks.push({ name: "long_form_continuity_anchors", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} anchors are incomplete.` });
      }
      if (sequence.renderModeRecommendation !== "parallel_safe" && sequence.renderModeRecommendation !== "sequential_recommended") {
        checks.push({ name: "long_form_continuity_render_mode", status: "fail", fileName: artifact.entry.fileName, message: `Sequence ${index} has invalid renderModeRecommendation.` });
      }
    }
  }

  private validateLongFormAgentReview(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_form_agent_review_shape", status: "fail", fileName, message: "long-form-agent-review must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-form-agent-review.v1") {
      checks.push({ name: "long_form_agent_review_schema", status: "fail", fileName, message: "Unexpected long-form-agent-review schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_form_agent_review_project", status: "fail", fileName, message: "long-form-agent-review projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "long_form_agent_review_spend_boundary", status: "fail", fileName, message: "long-form-agent-review must be no-spend/no-network/no-provider evidence." });
    }
    if (typeof value.status !== "string" || !LONG_FORM_AGENT_REVIEW_STATUSES.has(value.status)) {
      checks.push({ name: "long_form_agent_review_status", status: "fail", fileName, message: "long-form-agent-review status is invalid." });
    }
    if (value.agentCount !== LONG_FORM_AGENT_REVIEW_ROLES.size) {
      checks.push({ name: "long_form_agent_review_agent_count", status: "fail", fileName, message: "long-form-agent-review agentCount must cover every expected role." });
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "long_form_agent_review_origins", status: "fail", fileName, message: "long-form-agent-review sourcePatternOrigins are invalid." });
    }
    for (const field of [
      "targetDurationSeconds",
      "reviewedSequenceCount",
      "reviewedShotCount",
      "findingCount",
      "blockingFindingCount",
      "reviewRequiredFindingCount"
    ] as const) {
      if (typeof value[field] !== "number" || !Number.isInteger(value[field]) || value[field] < 0) {
        checks.push({ name: "long_form_agent_review_count", status: "fail", fileName, message: `long-form-agent-review ${field} is invalid.` });
      }
    }

    const decisions = Array.isArray(value.decisions) ? value.decisions : undefined;
    const findings = Array.isArray(value.findings) ? value.findings : undefined;
    if (!decisions || !findings || !Array.isArray(value.directives)) {
      checks.push({ name: "long_form_agent_review_collections", status: "fail", fileName, message: "long-form-agent-review decisions, findings, and directives must be arrays." });
      return;
    }
    if (decisions.length !== LONG_FORM_AGENT_REVIEW_ROLES.size) {
      checks.push({ name: "long_form_agent_review_decision_count", status: "fail", fileName, message: "long-form-agent-review must include one decision per role." });
    }
    const findingCount = findings.length;
    const blockingFindingCount = findings.filter((finding) => this.isRecord(finding) && finding.severity === "block").length;
    const reviewRequiredFindingCount = findings.filter((finding) => this.isRecord(finding) && finding.severity === "warn").length;
    if (value.findingCount !== findingCount) {
      checks.push({ name: "long_form_agent_review_finding_count", status: "fail", fileName, message: "long-form-agent-review findingCount must match findings length." });
    }
    if (value.blockingFindingCount !== blockingFindingCount) {
      checks.push({ name: "long_form_agent_review_block_count", status: "fail", fileName, message: "long-form-agent-review blockingFindingCount must match block findings." });
    }
    if (value.reviewRequiredFindingCount !== reviewRequiredFindingCount) {
      checks.push({ name: "long_form_agent_review_warn_count", status: "fail", fileName, message: "long-form-agent-review reviewRequiredFindingCount must match warning findings." });
    }
    if (blockingFindingCount > 0 && value.status !== "blocked") {
      checks.push({ name: "long_form_agent_review_status_semantics", status: "fail", fileName, message: "Blocking findings require blocked status." });
    }
    if (blockingFindingCount === 0 && reviewRequiredFindingCount > 0 && value.status !== "review_required") {
      checks.push({ name: "long_form_agent_review_status_semantics", status: "fail", fileName, message: "Warning findings require review_required status when no blockers exist." });
    }

    const decisionRoles = new Set<string>();
    for (const [index, decision] of decisions.entries()) {
      if (!this.isRecord(decision)) {
        checks.push({ name: "long_form_agent_review_decision_shape", status: "fail", fileName, message: `Decision ${index} must be an object.` });
        continue;
      }
      if (typeof decision.role !== "string" || !LONG_FORM_AGENT_REVIEW_ROLES.has(decision.role)) {
        checks.push({ name: "long_form_agent_review_decision_role", status: "fail", fileName, message: `Decision ${index} role is invalid.` });
      } else {
        decisionRoles.add(decision.role);
      }
      if (typeof decision.status !== "string" || !LONG_FORM_AGENT_REVIEW_STATUSES.has(decision.status)) {
        checks.push({ name: "long_form_agent_review_decision_status", status: "fail", fileName, message: `Decision ${index} status is invalid.` });
      }
      if (
        typeof decision.findingCount !== "number" ||
        !Number.isInteger(decision.findingCount) ||
        typeof decision.blockingFindingCount !== "number" ||
        !Number.isInteger(decision.blockingFindingCount) ||
        !Array.isArray(decision.requiredBeforeRender) ||
        typeof decision.priorityDirective !== "string" ||
        !decision.priorityDirective
      ) {
        checks.push({ name: "long_form_agent_review_decision_fields", status: "fail", fileName, message: `Decision ${index} fields are invalid.` });
      }
    }
    if (decisionRoles.size !== LONG_FORM_AGENT_REVIEW_ROLES.size) {
      checks.push({ name: "long_form_agent_review_role_coverage", status: "fail", fileName, message: "long-form-agent-review does not cover every review role." });
    }

    for (const [index, finding] of findings.entries()) {
      if (!this.isRecord(finding)) {
        checks.push({ name: "long_form_agent_review_finding_shape", status: "fail", fileName, message: `Finding ${index} must be an object.` });
        continue;
      }
      if (typeof finding.findingId !== "string" || !finding.findingId) {
        checks.push({ name: "long_form_agent_review_finding_id", status: "fail", fileName, message: `Finding ${index} findingId is missing.` });
      }
      if (typeof finding.role !== "string" || !LONG_FORM_AGENT_REVIEW_ROLES.has(finding.role)) {
        checks.push({ name: "long_form_agent_review_finding_role", status: "fail", fileName, message: `Finding ${index} role is invalid.` });
      }
      if (typeof finding.severity !== "string" || !LONG_FORM_AGENT_REVIEW_SEVERITIES.has(finding.severity)) {
        checks.push({ name: "long_form_agent_review_finding_severity", status: "fail", fileName, message: `Finding ${index} severity is invalid.` });
      }
      if (
        typeof finding.code !== "string" ||
        !finding.code ||
        typeof finding.message !== "string" ||
        !finding.message ||
        typeof finding.repairDirective !== "string" ||
        !finding.repairDirective
      ) {
        checks.push({ name: "long_form_agent_review_finding_text", status: "fail", fileName, message: `Finding ${index} text fields are missing.` });
      }
      if (!Array.isArray(finding.affectedSequenceIds) || !Array.isArray(finding.affectedShotIds) || !this.isRecord(finding.evidence)) {
        checks.push({ name: "long_form_agent_review_finding_evidence", status: "fail", fileName, message: `Finding ${index} evidence fields are invalid.` });
      }
    }

    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canProceedToPromptCompilation !== "boolean" ||
      releaseGateSummary.canUseAsNoSpendAgenticReviewEvidence !== true ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "long_form_agent_review_release_gate", status: "fail", fileName, message: "long-form-agent-review release gate summary is invalid." });
    } else if (value.status === "blocked" && releaseGateSummary.canProceedToPromptCompilation !== false) {
      checks.push({ name: "long_form_agent_review_release_gate", status: "fail", fileName, message: "Blocked long-form review must not proceed to prompt compilation." });
    }
  }

  private validateVideoRenderStrategy(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "video_render_strategy_shape", status: "fail", fileName, message: "video-render-strategy must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.video-render-strategy.v1") {
      checks.push({ name: "video_render_strategy_schema", status: "fail", fileName, message: "Unexpected video-render-strategy schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "video_render_strategy_project", status: "fail", fileName, message: "video-render-strategy projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "video_render_strategy_spend_boundary", status: "fail", fileName, message: "video-render-strategy must be no-spend/no-network/no-provider evidence." });
    }
    if (typeof value.requestedMode !== "string" || !VIDEO_RENDER_REQUESTED_MODES.has(value.requestedMode)) {
      checks.push({ name: "video_render_strategy_requested_mode", status: "fail", fileName, message: "video-render-strategy requestedMode is invalid." });
    }
    if (typeof value.workflowMode !== "string" || !VIDEO_RENDER_WORKFLOW_MODES.has(value.workflowMode)) {
      checks.push({ name: "video_render_strategy_workflow_mode", status: "fail", fileName, message: "video-render-strategy workflowMode is invalid." });
    }
    if (typeof value.continuityMode !== "string" || !VIDEO_RENDER_CONTINUITY_MODES.has(value.continuityMode)) {
      checks.push({ name: "video_render_strategy_continuity_mode", status: "fail", fileName, message: "video-render-strategy continuityMode is invalid." });
    }
    for (const field of [
      "targetDurationSeconds",
      "plannedShotCount",
      "issueCount",
      "warningIssueCount",
      "blockingIssueCount"
    ] as const) {
      if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) {
        checks.push({ name: "video_render_strategy_count", status: "fail", fileName, message: `video-render-strategy ${field} is invalid.` });
      }
    }
    for (const field of [
      "singleClipEligible",
      "storyboardRequired",
      "requiresStoryboardApproval",
      "requiresReferenceLock",
      "requiresSequentialRender",
      "sourceVideoAnalysisPresent"
    ] as const) {
      if (typeof value[field] !== "boolean") {
        checks.push({ name: "video_render_strategy_boolean", status: "fail", fileName, message: `video-render-strategy ${field} must be boolean.` });
      }
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "video_render_strategy_origins", status: "fail", fileName, message: "video-render-strategy sourcePatternOrigins are invalid." });
    }
    const referenceSummary = this.isRecord(value.referenceSummary) ? value.referenceSummary : undefined;
    if (
      !referenceSummary ||
      typeof referenceSummary.requestedReferenceCount !== "number" ||
      typeof referenceSummary.selectedReferenceCount !== "number" ||
      !Array.isArray(referenceSummary.requestedRoles) ||
      !Array.isArray(referenceSummary.selectedRoles) ||
      !Array.isArray(referenceSummary.primaryReferenceLabels)
    ) {
      checks.push({ name: "video_render_strategy_references", status: "fail", fileName, message: "video-render-strategy reference summary is invalid." });
    }
    const lastFrameChaining = this.isRecord(value.lastFrameChaining) ? value.lastFrameChaining : undefined;
    if (
      !lastFrameChaining ||
      typeof lastFrameChaining.status !== "string" ||
      !VIDEO_RENDER_LAST_FRAME_STATUSES.has(lastFrameChaining.status) ||
      typeof lastFrameChaining.eligibleShotCount !== "number" ||
      typeof lastFrameChaining.requiresReturnLastFrame !== "boolean" ||
      typeof lastFrameChaining.reason !== "string" ||
      !lastFrameChaining.reason
    ) {
      checks.push({ name: "video_render_strategy_last_frame_chaining", status: "fail", fileName, message: "video-render-strategy last-frame chaining evidence is invalid." });
    }
    const issues = Array.isArray(value.issues) ? value.issues : undefined;
    const decisions = Array.isArray(value.decisions) ? value.decisions : undefined;
    if (!issues || !decisions) {
      checks.push({ name: "video_render_strategy_collections", status: "fail", fileName, message: "video-render-strategy issues and decisions must be arrays." });
      return;
    }
    const warningIssueCount = issues.filter((issue) => this.isRecord(issue) && issue.severity === "warn").length;
    const blockingIssueCount = issues.filter((issue) => this.isRecord(issue) && issue.severity === "block").length;
    if (value.issueCount !== issues.length) {
      checks.push({ name: "video_render_strategy_issue_count", status: "fail", fileName, message: "video-render-strategy issueCount must match issues length." });
    }
    if (value.warningIssueCount !== warningIssueCount) {
      checks.push({ name: "video_render_strategy_warn_count", status: "fail", fileName, message: "video-render-strategy warningIssueCount must match warn issues." });
    }
    if (value.blockingIssueCount !== blockingIssueCount) {
      checks.push({ name: "video_render_strategy_block_count", status: "fail", fileName, message: "video-render-strategy blockingIssueCount must match block issues." });
    }
    for (const [index, issue] of issues.entries()) {
      if (!this.isRecord(issue)) {
        checks.push({ name: "video_render_strategy_issue_shape", status: "fail", fileName, message: `Strategy issue ${index} must be an object.` });
        continue;
      }
      if (typeof issue.severity !== "string" || !VIDEO_RENDER_ISSUE_SEVERITIES.has(issue.severity)) {
        checks.push({ name: "video_render_strategy_issue_severity", status: "fail", fileName, message: `Strategy issue ${index} severity is invalid.` });
      }
      if (typeof issue.code !== "string" || !issue.code || typeof issue.message !== "string" || !issue.message || typeof issue.repair !== "string" || !issue.repair) {
        checks.push({ name: "video_render_strategy_issue_text", status: "fail", fileName, message: `Strategy issue ${index} text fields are missing.` });
      }
    }
    for (const [index, decision] of decisions.entries()) {
      if (
        !this.isRecord(decision) ||
        typeof decision.code !== "string" ||
        !decision.code ||
        typeof decision.message !== "string" ||
        !decision.message
      ) {
        checks.push({ name: "video_render_strategy_decision_shape", status: "fail", fileName, message: `Strategy decision ${index} is invalid.` });
      }
    }
    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canProceedToPlanning !== "boolean" ||
      typeof releaseGateSummary.canProceedToRender !== "boolean" ||
      releaseGateSummary.canUseAsNoSpendStrategyEvidence !== true ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "video_render_strategy_release_gate", status: "fail", fileName, message: "video-render-strategy release gate summary is invalid." });
    } else if (blockingIssueCount > 0 && releaseGateSummary.canProceedToRender !== false) {
      checks.push({ name: "video_render_strategy_release_gate", status: "fail", fileName, message: "Blocking strategy issues must prevent render." });
    }
  }

  private validateStoryboardApproval(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "storyboard_approval_shape", status: "fail", fileName, message: "storyboard-approval must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.review-approval.v1") {
      checks.push({ name: "storyboard_approval_schema", status: "fail", fileName, message: "Unexpected storyboard approval schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "storyboard_approval_project", status: "fail", fileName, message: "storyboard approval projectId does not match manifest." });
    }
    if (value.gate !== "pre_render" || !REVIEW_APPROVAL_GATES.has(String(value.gate))) {
      checks.push({ name: "storyboard_approval_gate", status: "fail", fileName, message: "storyboard approval must be a pre_render gate." });
    }
    if (typeof value.status !== "string" || !REVIEW_APPROVAL_STATUSES.has(value.status)) {
      checks.push({ name: "storyboard_approval_status", status: "fail", fileName, message: "storyboard approval status is invalid." });
    }
    if (!Array.isArray(value.checkpoints)) {
      checks.push({ name: "storyboard_approval_checkpoints", status: "fail", fileName, message: "storyboard approval checkpoints must be an array." });
      return;
    }
    const summary = this.isRecord(value.summary) ? value.summary : undefined;
    if (
      !summary ||
      typeof summary.checkpointCount !== "number" ||
      typeof summary.requiredCheckpointCount !== "number" ||
      typeof summary.approvedRequiredCount !== "number" ||
      typeof summary.issueCount !== "number"
    ) {
      checks.push({ name: "storyboard_approval_summary", status: "fail", fileName, message: "storyboard approval summary is invalid." });
    } else if (summary.checkpointCount !== value.checkpoints.length) {
      checks.push({ name: "storyboard_approval_summary_count", status: "fail", fileName, message: "storyboard approval checkpointCount must match checkpoints length." });
    }
    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canRenderAfterReview !== "boolean" ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "storyboard_approval_release_gate", status: "fail", fileName, message: "storyboard approval release gate summary is invalid." });
    } else if (value.status === "approved" && releaseGateSummary.canRenderAfterReview !== true) {
      checks.push({ name: "storyboard_approval_release_gate", status: "fail", fileName, message: "Approved storyboard approval must allow pre-render continuation." });
    } else if (value.status !== "approved" && releaseGateSummary.canRenderAfterReview !== false) {
      checks.push({ name: "storyboard_approval_release_gate", status: "fail", fileName, message: "Unapproved storyboard approval must not allow render." });
    }
  }

  private validateLongFormTimeline(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_form_timeline_shape", status: "fail", fileName, message: "long-form-timeline must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-form-timeline.v1") {
      checks.push({ name: "long_form_timeline_schema", status: "fail", fileName, message: "Unexpected long-form-timeline schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_form_timeline_project", status: "fail", fileName, message: "long-form-timeline projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "long_form_timeline_spend_boundary", status: "fail", fileName, message: "long-form-timeline must be no-spend/no-network/no-provider evidence." });
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "long_form_timeline_origins", status: "fail", fileName, message: "long-form-timeline sourcePatternOrigins are invalid." });
    }
    for (const field of [
      "targetDurationSeconds",
      "plannedDurationSeconds",
      "sequenceCount",
      "segmentCount",
      "shotCount",
      "transitionCount",
      "sequentialSegmentCount",
      "manualReviewSegmentCount",
      "captionCueCount",
      "audioEventCount",
      "generatedAudioEventCount",
      "issueCount",
      "blockingIssueCount",
      "warningIssueCount"
    ] as const) {
      if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) {
        checks.push({ name: "long_form_timeline_count", status: "fail", fileName, message: `long-form-timeline ${field} is invalid.` });
      }
    }
    const sequences = Array.isArray(value.sequences) ? value.sequences : undefined;
    const segments = Array.isArray(value.segments) ? value.segments : undefined;
    const issues = Array.isArray(value.issues) ? value.issues : undefined;
    if (!sequences || !segments || !issues || !this.isRecord(value.postproduction)) {
      checks.push({ name: "long_form_timeline_collections", status: "fail", fileName, message: "long-form-timeline sequences, segments, postproduction, and issues must be present." });
      return;
    }
    if (value.sequenceCount !== sequences.length) {
      checks.push({ name: "long_form_timeline_sequence_count", status: "fail", fileName, message: "long-form-timeline sequenceCount must match sequences length." });
    }
    if (value.segmentCount !== segments.length) {
      checks.push({ name: "long_form_timeline_segment_count", status: "fail", fileName, message: "long-form-timeline segmentCount must match segments length." });
    }
    if (value.shotCount !== segments.length) {
      checks.push({ name: "long_form_timeline_shot_count", status: "fail", fileName, message: "long-form-timeline shotCount must match segment evidence." });
    }
    const blockingIssueCount = issues.filter((issue) => this.isRecord(issue) && issue.severity === "block").length;
    const warningIssueCount = issues.filter((issue) => this.isRecord(issue) && issue.severity === "warn").length;
    if (value.issueCount !== issues.length) {
      checks.push({ name: "long_form_timeline_issue_count", status: "fail", fileName, message: "long-form-timeline issueCount must match issues length." });
    }
    if (value.blockingIssueCount !== blockingIssueCount) {
      checks.push({ name: "long_form_timeline_block_count", status: "fail", fileName, message: "long-form-timeline blockingIssueCount must match block issues." });
    }
    if (value.warningIssueCount !== warningIssueCount) {
      checks.push({ name: "long_form_timeline_warn_count", status: "fail", fileName, message: "long-form-timeline warningIssueCount must match warn issues." });
    }

    let previousEndSecond = 0;
    const sequenceIds = new Set<string>();
    for (const [index, sequence] of sequences.entries()) {
      if (!this.isRecord(sequence)) {
        checks.push({ name: "long_form_timeline_sequence_shape", status: "fail", fileName, message: `Timeline sequence ${index} must be an object.` });
        continue;
      }
      if (typeof sequence.sequenceId !== "string" || !sequence.sequenceId) {
        checks.push({ name: "long_form_timeline_sequence_id", status: "fail", fileName, message: `Timeline sequence ${index} is missing sequenceId.` });
      } else {
        sequenceIds.add(sequence.sequenceId);
      }
      if (typeof sequence.order !== "number" || !Number.isInteger(sequence.order) || sequence.order !== index) {
        checks.push({ name: "long_form_timeline_sequence_order", status: "fail", fileName, message: `Timeline sequence ${index} order is not deterministic.` });
      }
      for (const field of ["segmentIds", "shotIds", "riskCodes", "sourceVideoSceneIds", "requiredBridgeAnchors"] as const) {
        if (!Array.isArray(sequence[field])) {
          checks.push({ name: "long_form_timeline_sequence_arrays", status: "fail", fileName, message: `Timeline sequence ${index} ${field} must be an array.` });
        }
      }
      if (sequence.renderModeRecommendation !== "parallel_safe" && sequence.renderModeRecommendation !== "sequential_recommended") {
        checks.push({ name: "long_form_timeline_sequence_render_mode", status: "fail", fileName, message: `Timeline sequence ${index} has invalid renderModeRecommendation.` });
      }
    }

    for (const [index, segment] of segments.entries()) {
      if (!this.isRecord(segment)) {
        checks.push({ name: "long_form_timeline_segment_shape", status: "fail", fileName, message: `Timeline segment ${index} must be an object.` });
        continue;
      }
      if (typeof segment.segmentId !== "string" || !segment.segmentId || typeof segment.shotId !== "string" || !segment.shotId) {
        checks.push({ name: "long_form_timeline_segment_id", status: "fail", fileName, message: `Timeline segment ${index} identity fields are missing.` });
      }
      if (typeof segment.sequenceId !== "string" || !sequenceIds.has(segment.sequenceId)) {
        checks.push({ name: "long_form_timeline_segment_sequence", status: "fail", fileName, message: `Timeline segment ${index} references an unknown sequence.` });
      }
      if (typeof segment.order !== "number" || !Number.isInteger(segment.order) || segment.order !== index) {
        checks.push({ name: "long_form_timeline_segment_order", status: "fail", fileName, message: `Timeline segment ${index} order is not deterministic.` });
      }
      if (
        typeof segment.startSecond !== "number" ||
        typeof segment.endSecond !== "number" ||
        typeof segment.durationSeconds !== "number" ||
        segment.startSecond < previousEndSecond ||
        segment.endSecond <= segment.startSecond ||
        Math.abs(segment.endSecond - segment.startSecond - segment.durationSeconds) > 0.01
      ) {
        checks.push({ name: "long_form_timeline_segment_time", status: "fail", fileName, message: `Timeline segment ${index} has invalid timing.` });
      }
      previousEndSecond = typeof segment.endSecond === "number" ? segment.endSecond : previousEndSecond;
      if (typeof segment.renderMode !== "string" || !RENDER_SCHEDULE_MODES.has(segment.renderMode)) {
        checks.push({ name: "long_form_timeline_segment_render_mode", status: "fail", fileName, message: `Timeline segment ${index} has invalid renderMode.` });
      }
      if (!Array.isArray(segment.sequentialReasons)) {
        checks.push({ name: "long_form_timeline_segment_reasons", status: "fail", fileName, message: `Timeline segment ${index} sequentialReasons must be an array.` });
      } else {
        for (const reason of segment.sequentialReasons) {
          if (typeof reason !== "string" || !RENDER_SCHEDULE_SEQUENTIAL_REASONS.has(reason)) {
            checks.push({ name: "long_form_timeline_segment_reason", status: "fail", fileName, message: `Timeline segment ${index} has invalid sequential reason.` });
          }
        }
      }
      for (const field of ["referenceRoles", "riskCodes", "continuityFields", "sourceVideoSceneIds"] as const) {
        if (!Array.isArray(segment[field])) {
          checks.push({ name: "long_form_timeline_segment_arrays", status: "fail", fileName, message: `Timeline segment ${index} ${field} must be an array.` });
        }
      }
      if (!this.isRecord(segment.captionCoverage) || !Array.isArray(segment.captionCoverage.cueIndexes)) {
        checks.push({ name: "long_form_timeline_caption_coverage", status: "fail", fileName, message: `Timeline segment ${index} caption coverage is invalid.` });
      }
      if (!this.isRecord(segment.audioCoverage) || !Array.isArray(segment.audioCoverage.suppliedTrackRoles) || !Array.isArray(segment.audioCoverage.generatedIntentIds)) {
        checks.push({ name: "long_form_timeline_audio_coverage", status: "fail", fileName, message: `Timeline segment ${index} audio coverage is invalid.` });
      }
      if (typeof segment.requiresManualReview !== "boolean") {
        checks.push({ name: "long_form_timeline_manual_review", status: "fail", fileName, message: `Timeline segment ${index} requiresManualReview must be boolean.` });
      }
    }
    if (typeof value.plannedDurationSeconds === "number" && Math.abs(value.plannedDurationSeconds - previousEndSecond) > 0.01) {
      checks.push({ name: "long_form_timeline_planned_duration", status: "fail", fileName, message: "long-form-timeline plannedDurationSeconds must match final segment endSecond." });
    }

    for (const [index, issue] of issues.entries()) {
      if (!this.isRecord(issue)) {
        checks.push({ name: "long_form_timeline_issue_shape", status: "fail", fileName, message: `Timeline issue ${index} must be an object.` });
        continue;
      }
      if (typeof issue.issueId !== "string" || !issue.issueId) {
        checks.push({ name: "long_form_timeline_issue_id", status: "fail", fileName, message: `Timeline issue ${index} issueId is missing.` });
      }
      if (typeof issue.severity !== "string" || !LONG_FORM_TIMELINE_ISSUE_SEVERITIES.has(issue.severity)) {
        checks.push({ name: "long_form_timeline_issue_severity", status: "fail", fileName, message: `Timeline issue ${index} severity is invalid.` });
      }
      if (typeof issue.code !== "string" || !LONG_FORM_TIMELINE_ISSUE_CODES.has(issue.code)) {
        checks.push({ name: "long_form_timeline_issue_code", status: "fail", fileName, message: `Timeline issue ${index} code is invalid.` });
      }
      if (typeof issue.message !== "string" || !issue.message || typeof issue.repair !== "string" || !issue.repair) {
        checks.push({ name: "long_form_timeline_issue_text", status: "fail", fileName, message: `Timeline issue ${index} text fields are missing.` });
      }
      if (!Array.isArray(issue.affectedSequenceIds) || !Array.isArray(issue.affectedShotIds) || !this.isRecord(issue.evidence)) {
        checks.push({ name: "long_form_timeline_issue_evidence", status: "fail", fileName, message: `Timeline issue ${index} evidence fields are invalid.` });
      }
    }

    const postproduction = value.postproduction;
    if (
      !this.isRecord(postproduction) ||
      postproduction.captionCueCount !== value.captionCueCount ||
      postproduction.audioTrackCount !== value.audioEventCount ||
      postproduction.generatedAudioIntentCount !== value.generatedAudioEventCount
    ) {
      checks.push({ name: "long_form_timeline_postproduction", status: "fail", fileName, message: "long-form-timeline postproduction summary does not match top-level counts." });
    }

    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canUseAsNoSpendTimelineEvidence !== "boolean" ||
      typeof releaseGateSummary.canProceedToRender !== "boolean" ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "long_form_timeline_release_gate", status: "fail", fileName, message: "long-form-timeline release gate summary is invalid." });
    } else if (blockingIssueCount > 0 && releaseGateSummary.canProceedToRender !== false) {
      checks.push({ name: "long_form_timeline_release_gate", status: "fail", fileName, message: "Blocking long-form timeline issues must prevent render." });
    }
  }

  private validateLongFormCreativeIntelligence(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_form_creative_shape", status: "fail", fileName, message: "long-form-creative-intelligence must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-form-creative-intelligence.v1") {
      checks.push({ name: "long_form_creative_schema", status: "fail", fileName, message: "Unexpected long-form-creative-intelligence schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_form_creative_project", status: "fail", fileName, message: "long-form-creative-intelligence projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "long_form_creative_spend_boundary", status: "fail", fileName, message: "long-form-creative-intelligence must be no-spend/no-network/no-provider evidence." });
    }
    if (typeof value.status !== "string" || !LONG_FORM_CREATIVE_STATUSES.has(value.status)) {
      checks.push({ name: "long_form_creative_status", status: "fail", fileName, message: "long-form-creative-intelligence status is invalid." });
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "long_form_creative_origins", status: "fail", fileName, message: "long-form-creative-intelligence sourcePatternOrigins are invalid." });
    }
    for (const field of [
      "targetDurationSeconds",
      "qualityScore",
      "findingCount",
      "blockingFindingCount",
      "reviewRequiredFindingCount",
      "shotDirectiveCount",
      "candidateDirectiveCount",
      "repairDirectiveCount"
    ] as const) {
      if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) {
        checks.push({ name: "long_form_creative_count", status: "fail", fileName, message: `long-form-creative-intelligence ${field} is invalid.` });
      }
    }
    if (typeof value.qualityScore === "number" && (value.qualityScore > 100 || value.qualityScore < 0)) {
      checks.push({ name: "long_form_creative_quality_score", status: "fail", fileName, message: "long-form-creative-intelligence qualityScore must be between 0 and 100." });
    }
    const nicheStrategy = this.isRecord(value.nicheStrategy) ? value.nicheStrategy : undefined;
    if (
      !nicheStrategy ||
      !this.isValidAudienceNicheIntelligence(nicheStrategy.audienceNicheIntelligence) ||
      typeof nicheStrategy.niche !== "string" ||
      typeof nicheStrategy.audience !== "string" ||
      typeof nicheStrategy.platformIntent !== "string" ||
      typeof nicheStrategy.desiredViewerAction !== "string" ||
      typeof nicheStrategy.trendPosture !== "string" ||
      typeof nicheStrategy.viewerObjection !== "string" ||
      typeof nicheStrategy.proofStrategy !== "string" ||
      typeof nicheStrategy.shareTrigger !== "string" ||
      typeof nicheStrategy.hookPattern !== "string" ||
      !Array.isArray(nicheStrategy.retentionBeats) ||
      !Array.isArray(nicheStrategy.viralLevers) ||
      !Array.isArray(nicheStrategy.antiPatterns)
    ) {
      checks.push({ name: "long_form_creative_niche_strategy", status: "fail", fileName, message: "long-form-creative-intelligence nicheStrategy is invalid." });
    }
    const storyBible = this.isRecord(value.storyBible) ? value.storyBible : undefined;
    if (
      !storyBible ||
      typeof storyBible.logline !== "string" ||
      typeof storyBible.centralQuestion !== "string" ||
      typeof storyBible.payoff !== "string" ||
      !Array.isArray(storyBible.emotionalArc) ||
      !Array.isArray(storyBible.characterAnchors) ||
      !Array.isArray(storyBible.productAnchors) ||
      !Array.isArray(storyBible.environmentAnchors) ||
      !Array.isArray(storyBible.styleAnchors) ||
      !Array.isArray(storyBible.continuityRules)
    ) {
      checks.push({ name: "long_form_creative_story_bible", status: "fail", fileName, message: "long-form-creative-intelligence storyBible is invalid." });
    }
    const findings = Array.isArray(value.findings) ? value.findings : undefined;
    const shotDirectives = Array.isArray(value.shotDirectives) ? value.shotDirectives : undefined;
    const candidateDirectives = Array.isArray(value.candidateDirectives) ? value.candidateDirectives : undefined;
    const repairDirectives = Array.isArray(value.repairDirectives) ? value.repairDirectives : undefined;
    if (!findings || !shotDirectives || !candidateDirectives || !repairDirectives) {
      checks.push({ name: "long_form_creative_collections", status: "fail", fileName, message: "long-form-creative-intelligence collections are missing." });
      return;
    }
    const blockingFindingCount = findings.filter((findingItem) => this.isRecord(findingItem) && findingItem.severity === "block").length;
    const reviewRequiredFindingCount = findings.filter((findingItem) => this.isRecord(findingItem) && findingItem.severity === "warn").length;
    if (value.findingCount !== findings.length) {
      checks.push({ name: "long_form_creative_finding_count", status: "fail", fileName, message: "long-form-creative-intelligence findingCount must match findings length." });
    }
    if (value.blockingFindingCount !== blockingFindingCount) {
      checks.push({ name: "long_form_creative_block_count", status: "fail", fileName, message: "long-form-creative-intelligence blockingFindingCount must match block findings." });
    }
    if (value.reviewRequiredFindingCount !== reviewRequiredFindingCount) {
      checks.push({ name: "long_form_creative_warn_count", status: "fail", fileName, message: "long-form-creative-intelligence reviewRequiredFindingCount must match warn findings." });
    }
    if (value.shotDirectiveCount !== shotDirectives.length) {
      checks.push({ name: "long_form_creative_shot_directive_count", status: "fail", fileName, message: "long-form-creative-intelligence shotDirectiveCount must match shotDirectives length." });
    }
    if (value.candidateDirectiveCount !== candidateDirectives.length) {
      checks.push({ name: "long_form_creative_candidate_count", status: "fail", fileName, message: "long-form-creative-intelligence candidateDirectiveCount must match candidateDirectives length." });
    }
    if (value.repairDirectiveCount !== repairDirectives.length) {
      checks.push({ name: "long_form_creative_repair_count", status: "fail", fileName, message: "long-form-creative-intelligence repairDirectiveCount must match repairDirectives length." });
    }

    for (const [index, findingItem] of findings.entries()) {
      if (!this.isRecord(findingItem)) {
        checks.push({ name: "long_form_creative_finding_shape", status: "fail", fileName, message: `Creative finding ${index} must be an object.` });
        continue;
      }
      if (typeof findingItem.findingId !== "string" || !findingItem.findingId) {
        checks.push({ name: "long_form_creative_finding_id", status: "fail", fileName, message: `Creative finding ${index} findingId is missing.` });
      }
      if (typeof findingItem.severity !== "string" || !LONG_FORM_CREATIVE_SEVERITIES.has(findingItem.severity)) {
        checks.push({ name: "long_form_creative_finding_severity", status: "fail", fileName, message: `Creative finding ${index} severity is invalid.` });
      }
      if (typeof findingItem.code !== "string" || !findingItem.code) {
        checks.push({ name: "long_form_creative_finding_code", status: "fail", fileName, message: `Creative finding ${index} code is invalid.` });
      }
      if (typeof findingItem.message !== "string" || !findingItem.message || typeof findingItem.repair !== "string" || !findingItem.repair) {
        checks.push({ name: "long_form_creative_finding_text", status: "fail", fileName, message: `Creative finding ${index} text fields are missing.` });
      }
      if (!Array.isArray(findingItem.affectedSequenceIds) || !Array.isArray(findingItem.affectedShotIds) || !this.isRecord(findingItem.evidence)) {
        checks.push({ name: "long_form_creative_finding_evidence", status: "fail", fileName, message: `Creative finding ${index} evidence fields are invalid.` });
      }
    }

    for (const [index, directive] of shotDirectives.entries()) {
      if (!this.isRecord(directive)) {
        checks.push({ name: "long_form_creative_shot_directive_shape", status: "fail", fileName, message: `Creative shot directive ${index} must be an object.` });
        continue;
      }
      if (
        typeof directive.shotId !== "string" ||
        typeof directive.sequenceId !== "string" ||
        typeof directive.order !== "number" ||
        typeof directive.viralRole !== "string" ||
        typeof directive.targetEmotion !== "string" ||
        typeof directive.recommendedCandidateCount !== "number" ||
        typeof directive.shouldPrioritizeRepair !== "boolean" ||
        !Array.isArray(directive.qualityChecks) ||
        !Array.isArray(directive.continuityAnchors)
      ) {
        checks.push({ name: "long_form_creative_shot_directive_fields", status: "fail", fileName, message: `Creative shot directive ${index} fields are invalid.` });
      }
    }

    for (const [index, directive] of candidateDirectives.entries()) {
      if (!this.isRecord(directive)) {
        checks.push({ name: "long_form_creative_candidate_shape", status: "fail", fileName, message: `Creative candidate directive ${index} must be an object.` });
        continue;
      }
      if (
        typeof directive.shotId !== "string" ||
        typeof directive.sequenceId !== "string" ||
        typeof directive.candidateCount !== "number" ||
        directive.candidateCount < 1 ||
        !Array.isArray(directive.reasonCodes)
      ) {
        checks.push({ name: "long_form_creative_candidate_fields", status: "fail", fileName, message: `Creative candidate directive ${index} fields are invalid.` });
      }
    }

    for (const [index, directive] of repairDirectives.entries()) {
      if (!this.isRecord(directive)) {
        checks.push({ name: "long_form_creative_repair_shape", status: "fail", fileName, message: `Creative repair directive ${index} must be an object.` });
        continue;
      }
      if (
        typeof directive.repairId !== "string" ||
        typeof directive.scope !== "string" ||
        !LONG_FORM_CREATIVE_REPAIR_SCOPES.has(directive.scope) ||
        typeof directive.priority !== "string" ||
        !LONG_FORM_CREATIVE_REPAIR_PRIORITIES.has(directive.priority) ||
        typeof directive.action !== "string" ||
        !directive.action ||
        typeof directive.canAutoRepairBeforeRender !== "boolean" ||
        typeof directive.requiresManualReview !== "boolean" ||
        !Array.isArray(directive.affectedSequenceIds) ||
        !Array.isArray(directive.affectedShotIds) ||
        !Array.isArray(directive.triggerCodes)
      ) {
        checks.push({ name: "long_form_creative_repair_fields", status: "fail", fileName, message: `Creative repair directive ${index} fields are invalid.` });
      }
    }

    const audioCaptionQuality = this.isRecord(value.audioCaptionQuality) ? value.audioCaptionQuality : undefined;
    if (
      !audioCaptionQuality ||
      typeof audioCaptionQuality.status !== "string" ||
      !LONG_FORM_CREATIVE_STATUSES.has(audioCaptionQuality.status) ||
      typeof audioCaptionQuality.captionCoverageRatio !== "number" ||
      typeof audioCaptionQuality.captionCueCount !== "number" ||
      typeof audioCaptionQuality.generatedAudioIntentCount !== "number" ||
      typeof audioCaptionQuality.generatedAudioReadyIntentCount !== "number" ||
      typeof audioCaptionQuality.generatedAudioBlockedIntentCount !== "number" ||
      typeof audioCaptionQuality.timingIssueCount !== "number" ||
      !Array.isArray(audioCaptionQuality.recommendations)
    ) {
      checks.push({ name: "long_form_creative_audio_caption", status: "fail", fileName, message: "long-form-creative-intelligence audioCaptionQuality is invalid." });
    }

    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canUseAsNoSpendCreativeIntelligenceEvidence !== "boolean" ||
      typeof releaseGateSummary.canProceedToRender !== "boolean" ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "long_form_creative_release_gate", status: "fail", fileName, message: "long-form-creative-intelligence release gate summary is invalid." });
    } else if (blockingFindingCount > 0 && releaseGateSummary.canProceedToRender !== false) {
      checks.push({ name: "long_form_creative_release_gate", status: "fail", fileName, message: "Blocking creative findings must prevent render." });
    }
  }

  private validateLongDirectorUiContract(
    manifest: ProjectArtifactBundle,
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const artifact = artifacts.get("long_director_ui_contract");
    const runSummaryArtifact = artifacts.get("run_summary");
    const runSummary = runSummaryArtifact && this.isRecord(runSummaryArtifact.value)
      ? runSummaryArtifact.value
      : undefined;
    const reviewPacketArtifact = artifacts.get("review_packet");
    const reviewPlanning = reviewPacketArtifact &&
      this.isRecord(reviewPacketArtifact.value) &&
      this.isRecord(reviewPacketArtifact.value.planning)
        ? reviewPacketArtifact.value.planning
        : undefined;

    if (!artifact) {
      if (runSummary?.longDirectorUiContractReady !== undefined) {
        checks.push({
          name: "long_director_ui_consistency",
          status: "fail",
          fileName: runSummaryArtifact?.entry.fileName ?? "run-summary.json",
          message: "run-summary says Long Director UI contract exists, but long-director-ui-contract.json is missing."
        });
      }
      if (reviewPlanning?.longDirectorUiContractReady !== undefined) {
        checks.push({
          name: "long_director_ui_consistency",
          status: "fail",
          fileName: reviewPacketArtifact?.entry.fileName ?? "review-packet.json",
          message: "review-packet says Long Director UI contract exists, but long-director-ui-contract.json is missing."
        });
      }
      return;
    }

    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_director_ui_shape", status: "fail", fileName, message: "long-director-ui-contract must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-director-ui-contract.v1") {
      checks.push({ name: "long_director_ui_schema", status: "fail", fileName, message: "Unexpected Long Director UI contract schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_director_ui_project", status: "fail", fileName, message: "Long Director UI contract projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "long_director_ui_spend_boundary", status: "fail", fileName, message: "Long Director UI contract must be no-spend/no-network/no-provider evidence." });
    }
    if (typeof value.status !== "string" || !LONG_FORM_CREATIVE_STATUSES.has(value.status)) {
      checks.push({ name: "long_director_ui_status", status: "fail", fileName, message: "Long Director UI contract status is invalid." });
    }

    const duration = this.isRecord(value.duration) ? value.duration : undefined;
    if (
      !duration ||
      typeof duration.targetSeconds !== "number" ||
      !Number.isFinite(duration.targetSeconds) ||
      duration.targetSeconds <= 0 ||
      duration.commercialMinSeconds !== 120 ||
      duration.commercialMaxSeconds !== 480 ||
      typeof duration.sequenceCount !== "number" ||
      !Number.isInteger(duration.sequenceCount) ||
      duration.sequenceCount < 0 ||
      typeof duration.shotDirectiveCount !== "number" ||
      !Number.isInteger(duration.shotDirectiveCount) ||
      duration.shotDirectiveCount < 0
    ) {
      checks.push({ name: "long_director_ui_duration", status: "fail", fileName, message: "Long Director UI duration summary is invalid." });
    }

    const director = this.isRecord(value.director) ? value.director : undefined;
    const checkpointStages = Array.isArray(director?.checkpointStages) ? director.checkpointStages : undefined;
    const directives = Array.isArray(director?.directives) ? director.directives : undefined;
    if (
      !director ||
      typeof director.directorId !== "string" ||
      !director.directorId ||
      typeof director.status !== "string" ||
      !LONG_FORM_CREATIVE_STATUSES.has(director.status) ||
      typeof director.narrativeMode !== "string" ||
      !LONG_DIRECTOR_NARRATIVE_MODES.has(director.narrativeMode) ||
      typeof director.continuityMode !== "string" ||
      !LONG_DIRECTOR_CONTINUITY_MODES.has(director.continuityMode) ||
      !checkpointStages ||
      checkpointStages.length === 0 ||
      checkpointStages.some((stage) => typeof stage !== "string" || !LONG_DIRECTOR_CHECKPOINT_STAGES.has(stage)) ||
      director.pauseBeforeProviderSpend !== true ||
      director.pauseBeforeCustomerRelease !== true ||
      typeof director.findingCount !== "number" ||
      director.findingCount < 0 ||
      typeof director.blockerCount !== "number" ||
      director.blockerCount < 0 ||
      typeof director.warningCount !== "number" ||
      director.warningCount < 0 ||
      !directives ||
      directives.some((directive) => typeof directive !== "string" || !directive)
    ) {
      checks.push({ name: "long_director_ui_director", status: "fail", fileName, message: "Long Director UI director summary is invalid." });
    }

    const creative = this.isRecord(value.creative) ? value.creative : undefined;
    if (
      !creative ||
      typeof creative.qualityScore !== "number" ||
      creative.qualityScore < 0 ||
      creative.qualityScore > 100 ||
      typeof creative.niche !== "string" ||
      !creative.niche ||
      typeof creative.platformIntent !== "string" ||
      !creative.platformIntent ||
      typeof creative.desiredViewerAction !== "string" ||
      !creative.desiredViewerAction ||
      typeof creative.trendPosture !== "string" ||
      !creative.trendPosture ||
      typeof creative.viewerObjection !== "string" ||
      !creative.viewerObjection ||
      typeof creative.proofStrategy !== "string" ||
      !creative.proofStrategy ||
      typeof creative.shareTrigger !== "string" ||
      !creative.shareTrigger ||
      typeof creative.ideaSeedCount !== "number" ||
      creative.ideaSeedCount < 0 ||
      typeof creative.viralLeverCount !== "number" ||
      creative.viralLeverCount < 0 ||
      typeof creative.findingCount !== "number" ||
      creative.findingCount < 0 ||
      typeof creative.blockingFindingCount !== "number" ||
      creative.blockingFindingCount < 0 ||
      typeof creative.reviewRequiredFindingCount !== "number" ||
      creative.reviewRequiredFindingCount < 0 ||
      typeof creative.candidateDirectiveCount !== "number" ||
      creative.candidateDirectiveCount < 0 ||
      typeof creative.repairDirectiveCount !== "number" ||
      creative.repairDirectiveCount < 0 ||
      typeof creative.highPriorityRepairCount !== "number" ||
      creative.highPriorityRepairCount < 0
    ) {
      checks.push({ name: "long_director_ui_creative", status: "fail", fileName, message: "Long Director UI creative summary is invalid." });
    }

    const workflowControls = Array.isArray(value.workflowControls) ? value.workflowControls : undefined;
    if (!workflowControls || workflowControls.length === 0) {
      checks.push({ name: "long_director_ui_workflow_controls", status: "fail", fileName, message: "Long Director UI workflow controls are missing." });
    } else {
      const workflowModes = new Set<string>();
      for (const [index, control] of workflowControls.entries()) {
        if (!this.isRecord(control)) {
          checks.push({ name: "long_director_ui_workflow_control", status: "fail", fileName, message: `Workflow control ${index} must be an object.` });
          continue;
        }
        if (
          typeof control.mode !== "string" ||
          !LONG_DIRECTOR_UI_WORKFLOW_MODES.has(control.mode) ||
          typeof control.label !== "string" ||
          !control.label ||
          typeof control.recommended !== "boolean" ||
          typeof control.enabled !== "boolean" ||
          typeof control.reason !== "string" ||
          !control.reason
        ) {
          checks.push({ name: "long_director_ui_workflow_control", status: "fail", fileName, message: `Workflow control ${index} fields are invalid.` });
        } else {
          workflowModes.add(control.mode);
        }
      }
      for (const mode of LONG_DIRECTOR_UI_WORKFLOW_MODES) {
        if (!workflowModes.has(mode)) {
          checks.push({ name: "long_director_ui_workflow_modes", status: "fail", fileName, message: `Long Director UI workflow controls are missing ${mode}.` });
        }
      }
    }

    const backendManagedSteps = Array.isArray(value.backendManagedSteps) ? value.backendManagedSteps : undefined;
    const userRequiredActions = Array.isArray(value.userRequiredActions) ? value.userRequiredActions : undefined;
    this.validateLongDirectorUiActions(backendManagedSteps, "backendManagedSteps", fileName, checks);
    this.validateLongDirectorUiActions(userRequiredActions, "userRequiredActions", fileName, checks);

    const outputContract = this.isRecord(value.outputContract) ? value.outputContract : undefined;
    if (
      !outputContract ||
      outputContract.finalMp4AssemblyManagedByBackend !== true ||
      outputContract.longFormManualQualityReviewRequired !== true ||
      outputContract.benchmarkEvidenceRequired !== true ||
      outputContract.canSubmitToProviderNow !== false ||
      typeof outputContract.canProceedToRenderAfterApproval !== "boolean" ||
      typeof outputContract.captionCoverageRatio !== "number" ||
      outputContract.captionCoverageRatio < 0 ||
      outputContract.captionCoverageRatio > 1 ||
      typeof outputContract.generatedAudioIntentCount !== "number" ||
      outputContract.generatedAudioIntentCount < 0 ||
      typeof outputContract.expectedShotDirectiveCount !== "number" ||
      outputContract.expectedShotDirectiveCount < 0 ||
      typeof outputContract.repairQueueCount !== "number" ||
      outputContract.repairQueueCount < 0
    ) {
      checks.push({ name: "long_director_ui_output_contract", status: "fail", fileName, message: "Long Director UI output contract is invalid." });
    }

    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.readyForLongReviewUiIntegration !== "boolean" ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "long_director_ui_release_gate", status: "fail", fileName, message: "Long Director UI release gate summary is invalid." });
    } else if (
      backendManagedSteps &&
      releaseGateSummary.readyForLongReviewUiIntegration !== backendManagedSteps.every((step) => this.isRecord(step) && step.status !== "blocked")
    ) {
      checks.push({ name: "long_director_ui_release_gate", status: "fail", fileName, message: "Long Director UI ready flag must match backend managed step status." });
    }

    this.validateLongDirectorUiCreativeConsistency(artifact, artifacts.get("long_form_creative_intelligence"), checks);
    this.validateLongDirectorUiSummaryConsistency(artifact, runSummaryArtifact, reviewPacketArtifact, checks);
  }

  private validateLongDirectorUiActions(
    actions: unknown[] | undefined,
    fieldName: string,
    fileName: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!actions || actions.length === 0) {
      checks.push({ name: "long_director_ui_actions", status: "fail", fileName, message: `Long Director UI ${fieldName} are missing.` });
      return;
    }
    for (const [index, action] of actions.entries()) {
      if (!this.isRecord(action)) {
        checks.push({ name: "long_director_ui_action", status: "fail", fileName, message: `${fieldName} action ${index} must be an object.` });
        continue;
      }
      if (
        typeof action.actionId !== "string" ||
        !action.actionId ||
        typeof action.label !== "string" ||
        !action.label ||
        typeof action.status !== "string" ||
        !LONG_DIRECTOR_UI_ACTION_STATUSES.has(action.status) ||
        typeof action.required !== "boolean" ||
        typeof action.handledBy !== "string" ||
        !LONG_DIRECTOR_UI_ACTION_HANDLERS.has(action.handledBy) ||
        typeof action.reason !== "string" ||
        !action.reason
      ) {
        checks.push({ name: "long_director_ui_action", status: "fail", fileName, message: `${fieldName} action ${index} fields are invalid.` });
      }
    }
  }

  private validateLongDirectorUiCreativeConsistency(
    artifact: LoadedArtifact,
    creativeArtifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!this.isRecord(artifact.value) || !creativeArtifact || !this.isRecord(creativeArtifact.value)) {
      return;
    }
    const value = artifact.value;
    const creativePlan = creativeArtifact.value;
    const fileName = artifact.entry.fileName;
    const duration = this.isRecord(value.duration) ? value.duration : undefined;
    const director = this.isRecord(value.director) ? value.director : undefined;
    const creative = this.isRecord(value.creative) ? value.creative : undefined;
    const outputContract = this.isRecord(value.outputContract) ? value.outputContract : undefined;
    const releaseGateSummary = this.isRecord(creativePlan.releaseGateSummary) ? creativePlan.releaseGateSummary : undefined;
    const directorPlan = this.isRecord(creativePlan.directorPlan) ? creativePlan.directorPlan : undefined;
    const directorStory = directorPlan && this.isRecord(directorPlan.storyPlan) ? directorPlan.storyPlan : undefined;
    const directorContinuity = directorPlan && this.isRecord(directorPlan.continuityPlan) ? directorPlan.continuityPlan : undefined;
    const checkpointPolicy = directorPlan && this.isRecord(directorPlan.checkpointPolicy) ? directorPlan.checkpointPolicy : undefined;
    const nicheStrategy = this.isRecord(creativePlan.nicheStrategy) ? creativePlan.nicheStrategy : undefined;
    const audioCaptionQuality = this.isRecord(creativePlan.audioCaptionQuality) ? creativePlan.audioCaptionQuality : undefined;

    this.compareLongDirectorUiField(fileName, "status", value.status, creativePlan.status, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "duration.targetSeconds", duration?.targetSeconds, creativePlan.targetDurationSeconds, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "duration.sequenceCount", duration?.sequenceCount, this.longDirectorUiSequenceCountFromCreative(creativePlan), creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "duration.shotDirectiveCount", duration?.shotDirectiveCount, creativePlan.shotDirectiveCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.directorId", director?.directorId, directorPlan?.directorId, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.status", director?.status, directorPlan?.status, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.narrativeMode", director?.narrativeMode, directorStory?.narrativeMode, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.continuityMode", director?.continuityMode, directorContinuity?.mode, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.pauseBeforeProviderSpend", director?.pauseBeforeProviderSpend, checkpointPolicy?.pauseBeforeProviderSpend, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "director.pauseBeforeCustomerRelease", director?.pauseBeforeCustomerRelease, checkpointPolicy?.pauseBeforeCustomerRelease, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.qualityScore", creative?.qualityScore, creativePlan.qualityScore, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.niche", creative?.niche, nicheStrategy?.niche, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.platformIntent", creative?.platformIntent, nicheStrategy?.platformIntent, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.desiredViewerAction", creative?.desiredViewerAction, nicheStrategy?.desiredViewerAction, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.trendPosture", creative?.trendPosture, nicheStrategy?.trendPosture, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.viewerObjection", creative?.viewerObjection, nicheStrategy?.viewerObjection, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.proofStrategy", creative?.proofStrategy, nicheStrategy?.proofStrategy, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.shareTrigger", creative?.shareTrigger, nicheStrategy?.shareTrigger, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(
      fileName,
      "creative.ideaSeedCount",
      creative?.ideaSeedCount,
      this.longDirectorUiIdeaSeedCount(nicheStrategy),
      creativeArtifact.entry.fileName,
      checks
    );
    this.compareLongDirectorUiField(fileName, "creative.findingCount", creative?.findingCount, creativePlan.findingCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.blockingFindingCount", creative?.blockingFindingCount, creativePlan.blockingFindingCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.reviewRequiredFindingCount", creative?.reviewRequiredFindingCount, creativePlan.reviewRequiredFindingCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.candidateDirectiveCount", creative?.candidateDirectiveCount, creativePlan.candidateDirectiveCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.repairDirectiveCount", creative?.repairDirectiveCount, creativePlan.repairDirectiveCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "creative.highPriorityRepairCount", creative?.highPriorityRepairCount, this.longDirectorUiHighPriorityRepairCount(creativePlan), creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "outputContract.canProceedToRenderAfterApproval", outputContract?.canProceedToRenderAfterApproval, releaseGateSummary?.canProceedToRender, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "outputContract.captionCoverageRatio", outputContract?.captionCoverageRatio, audioCaptionQuality?.captionCoverageRatio, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "outputContract.generatedAudioIntentCount", outputContract?.generatedAudioIntentCount, audioCaptionQuality?.generatedAudioIntentCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "outputContract.expectedShotDirectiveCount", outputContract?.expectedShotDirectiveCount, creativePlan.shotDirectiveCount, creativeArtifact.entry.fileName, checks);
    this.compareLongDirectorUiField(fileName, "outputContract.repairQueueCount", outputContract?.repairQueueCount, creativePlan.repairDirectiveCount, creativeArtifact.entry.fileName, checks);
  }

  private validateLongDirectorUiSummaryConsistency(
    artifact: LoadedArtifact,
    runSummaryArtifact: LoadedArtifact | undefined,
    reviewPacketArtifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!this.isRecord(artifact.value)) {
      return;
    }
    const value = artifact.value;
    const director = this.isRecord(value.director) ? value.director : undefined;
    const outputContract = this.isRecord(value.outputContract) ? value.outputContract : undefined;
    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    const expected = {
      longDirectorUiContractReady: releaseGateSummary?.readyForLongReviewUiIntegration,
      longDirectorNarrativeMode: director?.narrativeMode,
      longDirectorCheckpointStageCount: Array.isArray(director?.checkpointStages) ? director.checkpointStages.length : undefined,
      longDirectorManualQualityReviewRequired: outputContract?.longFormManualQualityReviewRequired,
      longDirectorBenchEvidenceRequired: outputContract?.benchmarkEvidenceRequired,
      longDirectorCanSubmitToProviderNow: outputContract?.canSubmitToProviderNow,
      longDirectorCanProceedToRenderAfterApproval: outputContract?.canProceedToRenderAfterApproval,
      longDirectorRepairQueueCount: outputContract?.repairQueueCount
    };

    if (runSummaryArtifact && this.isRecord(runSummaryArtifact.value)) {
      for (const [field, expectedValue] of Object.entries(expected)) {
        this.compareLongDirectorUiField(
          runSummaryArtifact.entry.fileName,
          field,
          runSummaryArtifact.value[field],
          expectedValue,
          artifact.entry.fileName,
          checks
        );
      }
    }

    const reviewPlanning = reviewPacketArtifact &&
      this.isRecord(reviewPacketArtifact.value) &&
      this.isRecord(reviewPacketArtifact.value.planning)
        ? reviewPacketArtifact.value.planning
        : undefined;
    if (reviewPacketArtifact && !reviewPlanning) {
      checks.push({
        name: "long_director_ui_consistency",
        status: "fail",
        fileName: reviewPacketArtifact.entry.fileName,
        message: "review-packet planning evidence is missing."
      });
    } else if (reviewPacketArtifact && reviewPlanning) {
      for (const [field, expectedValue] of Object.entries(expected)) {
        this.compareLongDirectorUiField(
          reviewPacketArtifact.entry.fileName,
          `planning.${field}`,
          reviewPlanning[field],
          expectedValue,
          artifact.entry.fileName,
          checks
        );
      }
    }
  }

  private longDirectorUiSequenceCountFromCreative(value: Record<string, unknown>): number | undefined {
    const shotDirectives = Array.isArray(value.shotDirectives) ? value.shotDirectives : undefined;
    if (shotDirectives && shotDirectives.length > 0) {
      const sequenceIds = new Set<string>();
      for (const directive of shotDirectives) {
        if (this.isRecord(directive) && typeof directive.sequenceId === "string" && directive.sequenceId) {
          sequenceIds.add(directive.sequenceId);
        }
      }
      if (sequenceIds.size > 0) {
        return sequenceIds.size;
      }
    }
    const storyBible = this.isRecord(value.storyBible) ? value.storyBible : undefined;
    return Array.isArray(storyBible?.emotionalArc) ? storyBible.emotionalArc.length : undefined;
  }

  private longDirectorUiHighPriorityRepairCount(value: Record<string, unknown>): number | undefined {
    const repairDirectives = Array.isArray(value.repairDirectives) ? value.repairDirectives : undefined;
    if (!repairDirectives) {
      return undefined;
    }
    return repairDirectives.filter(
      (directive) =>
        this.isRecord(directive) &&
        (directive.priority === "high" || directive.priority === "critical")
    ).length;
  }

  private longDirectorUiIdeaSeedCount(nicheStrategy: Record<string, unknown> | undefined): number | undefined {
    const audienceNiche = nicheStrategy && this.isRecord(nicheStrategy.audienceNicheIntelligence)
      ? nicheStrategy.audienceNicheIntelligence
      : undefined;
    return Array.isArray(audienceNiche?.ideaSeeds) ? audienceNiche.ideaSeeds.length : undefined;
  }

  private compareLongDirectorUiField(
    fileName: string,
    fieldPath: string,
    actual: unknown,
    expected: unknown,
    expectedSource: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (expected === undefined) {
      return;
    }
    if (actual !== expected) {
      checks.push({
        name: "long_director_ui_consistency",
        status: "fail",
        fileName,
        message: `${fieldPath} does not match ${expectedSource}.`
      });
    }
  }

  private validateLongFormReadiness(
    manifest: ProjectArtifactBundle,
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    const fileName = artifact.entry.fileName;
    if (!this.isRecord(value)) {
      checks.push({ name: "long_form_readiness_shape", status: "fail", fileName, message: "long-form-readiness must be an object." });
      return;
    }
    if (value.schemaVersion !== "cinejelly.long-form-readiness.v1") {
      checks.push({ name: "long_form_readiness_schema", status: "fail", fileName, message: "Unexpected long-form-readiness schema version." });
    }
    if (value.projectId !== manifest.projectId) {
      checks.push({ name: "long_form_readiness_project", status: "fail", fileName, message: "long-form-readiness projectId does not match manifest." });
    }
    if (value.noSpend !== true || value.networkCallsMade !== false || value.providerCallsMade !== false) {
      checks.push({ name: "long_form_readiness_spend_boundary", status: "fail", fileName, message: "long-form-readiness must be no-spend/no-network/no-provider evidence." });
    }
    if (typeof value.status !== "string" || !LONG_FORM_READINESS_STATUSES.has(value.status)) {
      checks.push({ name: "long_form_readiness_status", status: "fail", fileName, message: "long-form-readiness status is invalid." });
    }
    if (!Array.isArray(value.sourcePatternOrigins) || value.sourcePatternOrigins.some((origin) => typeof origin !== "string" || !origin)) {
      checks.push({ name: "long_form_readiness_origins", status: "fail", fileName, message: "long-form-readiness sourcePatternOrigins are invalid." });
    }
    if (typeof value.targetDurationSeconds !== "number" || !Number.isFinite(value.targetDurationSeconds) || value.targetDurationSeconds <= 0) {
      checks.push({ name: "long_form_readiness_duration", status: "fail", fileName, message: "long-form-readiness targetDurationSeconds is invalid." });
    }

    const intentRoute = this.isRecord(value.intentRoute) ? value.intentRoute : undefined;
    if (
      !intentRoute ||
      typeof intentRoute.intentKind !== "string" ||
      !LONG_FORM_READINESS_INTENT_KINDS.has(intentRoute.intentKind) ||
      typeof intentRoute.platformIntent !== "string" ||
      typeof intentRoute.targetDurationClass !== "string" ||
      !LONG_FORM_READINESS_DURATION_CLASSES.has(intentRoute.targetDurationClass) ||
      typeof intentRoute.userControlMode !== "string" ||
      !LONG_FORM_READINESS_USER_CONTROL_MODES.has(intentRoute.userControlMode) ||
      typeof intentRoute.recommendedWorkflowMode !== "string" ||
      !VIDEO_RENDER_WORKFLOW_MODES.has(intentRoute.recommendedWorkflowMode) ||
      !Array.isArray(intentRoute.reasons) ||
      !Array.isArray(intentRoute.missingInputs)
    ) {
      checks.push({ name: "long_form_readiness_intent_route", status: "fail", fileName, message: "long-form-readiness intentRoute is invalid." });
    }

    const coherence = this.isRecord(value.coherence) ? value.coherence : undefined;
    const scoreFields = [
      "overallScore",
      "storyArcScore",
      "sequenceBridgeScore",
      "anchorConsistencyScore",
      "hookPayoffScore",
      "timelineFitScore",
      "sourceVideoAlignmentScore"
    ] as const;
    if (
      !coherence ||
      scoreFields.some((field) =>
        typeof coherence[field] !== "number" ||
        !Number.isFinite(coherence[field]) ||
        coherence[field] < 0 ||
        coherence[field] > 100
      ) ||
      typeof coherence.issueCount !== "number" ||
      typeof coherence.blockingIssueCount !== "number" ||
      typeof coherence.reviewRequiredIssueCount !== "number"
    ) {
      checks.push({ name: "long_form_readiness_coherence", status: "fail", fileName, message: "long-form-readiness coherence scores are invalid." });
    }

    const adaptiveShotDecisions = Array.isArray(value.adaptiveShotDecisions) ? value.adaptiveShotDecisions : undefined;
    const repairQueue = Array.isArray(value.repairQueue) ? value.repairQueue : undefined;
    if (!adaptiveShotDecisions || adaptiveShotDecisions.length === 0 || !repairQueue) {
      checks.push({ name: "long_form_readiness_collections", status: "fail", fileName, message: "long-form-readiness decisions/repairQueue are missing." });
      return;
    }
    for (const [index, decision] of adaptiveShotDecisions.entries()) {
      if (!this.isRecord(decision)) {
        checks.push({ name: "long_form_readiness_decision_shape", status: "fail", fileName, message: `Readiness shot decision ${index} must be an object.` });
        continue;
      }
      if (
        typeof decision.shotId !== "string" ||
        !decision.shotId ||
        typeof decision.order !== "number" ||
        typeof decision.mode !== "string" ||
        !LONG_FORM_READINESS_RENDER_UNIT_MODES.has(decision.mode) ||
        typeof decision.renderMode !== "string" ||
        !RENDER_SCHEDULE_MODES.has(decision.renderMode) ||
        typeof decision.shouldRunTestTake !== "boolean" ||
        typeof decision.shouldChainFromPrevious !== "boolean" ||
        typeof decision.requiresReferenceLock !== "boolean" ||
        typeof decision.requiresManualReview !== "boolean" ||
        !Array.isArray(decision.reasons) ||
        !Array.isArray(decision.repairHints)
      ) {
        checks.push({ name: "long_form_readiness_decision_fields", status: "fail", fileName, message: `Readiness shot decision ${index} fields are invalid.` });
      }
    }

    const blockingRepairCount = repairQueue.filter((repair) => this.isRecord(repair) && repair.blocksRender === true).length;
    for (const [index, repair] of repairQueue.entries()) {
      if (!this.isRecord(repair)) {
        checks.push({ name: "long_form_readiness_repair_shape", status: "fail", fileName, message: `Readiness repair ${index} must be an object.` });
        continue;
      }
      if (
        typeof repair.repairId !== "string" ||
        !repair.repairId ||
        typeof repair.category !== "string" ||
        !LONG_FORM_READINESS_REPAIR_CATEGORIES.has(repair.category) ||
        typeof repair.priority !== "string" ||
        !LONG_FORM_READINESS_REPAIR_PRIORITIES.has(repair.priority) ||
        typeof repair.autoRepairable !== "boolean" ||
        typeof repair.blocksRender !== "boolean" ||
        !Array.isArray(repair.affectedSequenceIds) ||
        !Array.isArray(repair.affectedShotIds) ||
        typeof repair.trigger !== "string" ||
        typeof repair.action !== "string" ||
        !repair.action ||
        typeof repair.uiLabel !== "string" ||
        !repair.uiLabel
      ) {
        checks.push({ name: "long_form_readiness_repair_fields", status: "fail", fileName, message: `Readiness repair ${index} fields are invalid.` });
      }
    }

    const uiReviewPacket = this.isRecord(value.uiReviewPacket) ? value.uiReviewPacket : undefined;
    if (
      !uiReviewPacket ||
      typeof uiReviewPacket.canRenderAfterApproval !== "boolean" ||
      !Array.isArray(uiReviewPacket.requiredApprovalSurfaces) ||
      typeof uiReviewPacket.sceneReviewCount !== "number" ||
      typeof uiReviewPacket.shotReviewCount !== "number" ||
      typeof uiReviewPacket.audioReviewCount !== "number" ||
      typeof uiReviewPacket.captionReviewCount !== "number" ||
      typeof uiReviewPacket.claimReviewCount !== "number" ||
      typeof uiReviewPacket.repairQueueCount !== "number" ||
      typeof uiReviewPacket.operatorSummary !== "string" ||
      !Array.isArray(uiReviewPacket.nextActions)
    ) {
      checks.push({ name: "long_form_readiness_ui_review_packet", status: "fail", fileName, message: "long-form-readiness uiReviewPacket is invalid." });
    } else {
      const manualShotReviewCount = adaptiveShotDecisions.filter((decision) =>
        this.isRecord(decision) && decision.requiresManualReview === true
      ).length;
      if (uiReviewPacket.repairQueueCount !== repairQueue.length || uiReviewPacket.shotReviewCount !== manualShotReviewCount) {
        checks.push({ name: "long_form_readiness_ui_counts", status: "fail", fileName, message: "long-form-readiness UI counts do not match decision/repair evidence." });
      }
      if (value.status === "blocked" && uiReviewPacket.canRenderAfterApproval !== false) {
        checks.push({ name: "long_form_readiness_ui_gate", status: "fail", fileName, message: "Blocked long-form readiness must not allow render after approval." });
      }
    }

    const releaseGateSummary = this.isRecord(value.releaseGateSummary) ? value.releaseGateSummary : undefined;
    if (
      !releaseGateSummary ||
      typeof releaseGateSummary.canUseAsNoSpendReadinessEvidence !== "boolean" ||
      typeof releaseGateSummary.canProceedToRender !== "boolean" ||
      releaseGateSummary.canReleaseToCustomerTraffic !== false ||
      typeof releaseGateSummary.releaseBlocker !== "string" ||
      !releaseGateSummary.releaseBlocker
    ) {
      checks.push({ name: "long_form_readiness_release_gate", status: "fail", fileName, message: "long-form-readiness release gate summary is invalid." });
    } else if ((value.status === "blocked" || blockingRepairCount > 0) && releaseGateSummary.canProceedToRender !== false) {
      checks.push({ name: "long_form_readiness_release_gate", status: "fail", fileName, message: "Blocking readiness repairs must prevent render." });
    }
  }

  private validateGeneratedAudioOutputBatchValidation(
    artifact: LoadedArtifact | undefined,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!artifact) {
      return;
    }
    const value = artifact.value;
    if (!this.isRecord(value)) {
      checks.push({
        name: "generated_audio_output_batch_shape",
        status: "fail",
        fileName: artifact.entry.fileName,
        message: "generated-audio-output-batch-validation must be an object."
      });
      return;
    }
    const fileName = artifact.entry.fileName;
    if (typeof value.status !== "string" || !GENERATED_AUDIO_OUTPUT_BATCH_STATUSES.has(value.status)) {
      checks.push({ name: "generated_audio_output_batch_status", status: "fail", fileName, message: "Generated-audio output batch status is invalid." });
    }
    for (const field of [
      "intentCount",
      "readyIntentCount",
      "resultCount",
      "approvedTrackCount",
      "reviewRequiredReportCount",
      "rejectedReportCount",
      "missingResultCount",
      "unexpectedResultCount",
      "duplicateResultCount",
      "issueCount"
    ] as const) {
      if (typeof value[field] !== "number" || !Number.isInteger(value[field]) || value[field] < 0) {
        checks.push({ name: "generated_audio_output_batch_count", status: "fail", fileName, message: `Generated-audio output batch ${field} is invalid.` });
      }
    }
    if (!Array.isArray(value.issues)) {
      checks.push({ name: "generated_audio_output_batch_issues", status: "fail", fileName, message: "Generated-audio output batch issues must be an array." });
    } else {
      if (typeof value.issueCount === "number" && value.issueCount !== value.issues.length) {
        checks.push({ name: "generated_audio_output_batch_issue_count", status: "fail", fileName, message: "Generated-audio output batch issueCount does not match issues length." });
      }
      for (const [index, issue] of value.issues.entries()) {
        this.validateGeneratedAudioOutputIssue(fileName, issue, `Generated-audio output batch issue ${index}`, checks);
      }
    }
    if (!Array.isArray(value.reports)) {
      checks.push({ name: "generated_audio_output_batch_reports", status: "fail", fileName, message: "Generated-audio output batch reports must be an array." });
    } else {
      for (const [index, report] of value.reports.entries()) {
        this.validateGeneratedAudioOutputReport(fileName, report, index, checks);
      }
    }
    if (!Array.isArray(value.audioTracks)) {
      checks.push({ name: "generated_audio_output_batch_tracks", status: "fail", fileName, message: "Generated-audio output batch audioTracks must be an array." });
    } else {
      if (typeof value.approvedTrackCount === "number" && value.audioTracks.length !== value.approvedTrackCount) {
        checks.push({ name: "generated_audio_output_batch_track_count", status: "fail", fileName, message: "Generated-audio output batch approvedTrackCount does not match audioTracks length." });
      }
      for (const [index, track] of value.audioTracks.entries()) {
        this.validateGeneratedAudioOutputTrack(fileName, track, index, checks);
      }
    }

    const reportStatusCounts = Array.isArray(value.reports)
      ? this.generatedAudioReportStatusCounts(value.reports)
      : { approved: 0, reviewRequired: 0, rejected: 0 };
    if (typeof value.reviewRequiredReportCount === "number" && value.reviewRequiredReportCount !== reportStatusCounts.reviewRequired) {
      checks.push({ name: "generated_audio_output_batch_report_count", status: "fail", fileName, message: "Generated-audio output batch reviewRequiredReportCount does not match reports." });
    }
    if (typeof value.rejectedReportCount === "number" && value.rejectedReportCount !== reportStatusCounts.rejected) {
      checks.push({ name: "generated_audio_output_batch_report_count", status: "fail", fileName, message: "Generated-audio output batch rejectedReportCount does not match reports." });
    }

    this.validateGeneratedAudioBatchStatusSemantics(fileName, value, reportStatusCounts, checks);
  }

  private validateGeneratedAudioOutputReport(
    fileName: string,
    value: unknown,
    index: number,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!this.isRecord(value)) {
      checks.push({ name: "generated_audio_output_report_shape", status: "fail", fileName, message: `Generated-audio output report ${index} must be an object.` });
      return;
    }
    if (typeof value.status !== "string" || !GENERATED_AUDIO_OUTPUT_VALIDATION_STATUSES.has(value.status)) {
      checks.push({ name: "generated_audio_output_report_status", status: "fail", fileName, message: `Generated-audio output report ${index} status is invalid.` });
    }
    if (
      typeof value.intentId !== "string" ||
      !value.intentId ||
      typeof value.kind !== "string" ||
      !POSTPRODUCTION_GENERATED_AUDIO_KINDS.has(value.kind) ||
      typeof value.provider !== "string" ||
      !value.provider ||
      typeof value.modelId !== "string" ||
      !value.modelId
    ) {
      checks.push({ name: "generated_audio_output_report_identity", status: "fail", fileName, message: `Generated-audio output report ${index} has invalid identity fields.` });
    }
    if (typeof value.issueCount !== "number" || !Number.isInteger(value.issueCount) || value.issueCount < 0) {
      checks.push({ name: "generated_audio_output_report_issue_count", status: "fail", fileName, message: `Generated-audio output report ${index} issueCount is invalid.` });
    }
    if (!Array.isArray(value.issues)) {
      checks.push({ name: "generated_audio_output_report_issues", status: "fail", fileName, message: `Generated-audio output report ${index} issues must be an array.` });
    } else {
      if (typeof value.issueCount === "number" && value.issueCount !== value.issues.length) {
        checks.push({ name: "generated_audio_output_report_issue_count", status: "fail", fileName, message: `Generated-audio output report ${index} issueCount does not match issues length.` });
      }
      for (const [issueIndex, issue] of value.issues.entries()) {
        this.validateGeneratedAudioOutputIssue(fileName, issue, `Generated-audio output report ${index} issue ${issueIndex}`, checks);
      }
    }
    if (value.audioTrack !== undefined) {
      this.validateGeneratedAudioOutputTrack(fileName, value.audioTrack, index, checks);
    }
    if (value.status === "approved" && !this.isRecord(value.audioTrack)) {
      checks.push({ name: "generated_audio_output_report_track", status: "fail", fileName, message: `Approved generated-audio output report ${index} must include audioTrack evidence.` });
    }
  }

  private validateGeneratedAudioOutputIssue(
    fileName: string,
    value: unknown,
    label: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!this.isRecord(value)) {
      checks.push({ name: "generated_audio_output_issue_shape", status: "fail", fileName, message: `${label} must be an object.` });
      return;
    }
    if (typeof value.code !== "string" || !value.code) {
      checks.push({ name: "generated_audio_output_issue_code", status: "fail", fileName, message: `${label} is missing code.` });
    }
    if (typeof value.severity !== "string" || !GENERATED_AUDIO_OUTPUT_ISSUE_SEVERITIES.has(value.severity)) {
      checks.push({ name: "generated_audio_output_issue_severity", status: "fail", fileName, message: `${label} has invalid severity.` });
    }
    if (typeof value.message !== "string" || !value.message || typeof value.repair !== "string" || !value.repair) {
      checks.push({ name: "generated_audio_output_issue_text", status: "fail", fileName, message: `${label} is missing message or repair.` });
    }
  }

  private validateGeneratedAudioOutputTrack(
    fileName: string,
    value: unknown,
    index: number,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (!this.isRecord(value)) {
      checks.push({ name: "generated_audio_output_track_shape", status: "fail", fileName, message: `Generated-audio output track ${index} must be an object.` });
      return;
    }
    if (typeof value.trackId !== "string" || !value.trackId) {
      checks.push({ name: "generated_audio_output_track_id", status: "fail", fileName, message: `Generated-audio output track ${index} is missing trackId.` });
    }
    if (typeof value.role !== "string" || !POSTPRODUCTION_AUDIO_ROLES.has(value.role)) {
      checks.push({ name: "generated_audio_output_track_role", status: "fail", fileName, message: `Generated-audio output track ${index} role is invalid.` });
    }
    if (typeof value.volume !== "number" || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 2) {
      checks.push({ name: "generated_audio_output_track_volume", status: "fail", fileName, message: `Generated-audio output track ${index} volume is invalid.` });
    }
    if (typeof value.sourceUrlOrPath !== "string" || !this.isCredentialFreeHttps(value.sourceUrlOrPath)) {
      checks.push({ name: "generated_audio_output_track_url", status: "fail", fileName, message: `Generated-audio output track ${index} must use a credential-free HTTPS URL.` });
    }
  }

  private generatedAudioReportStatusCounts(reports: readonly unknown[]): {
    readonly approved: number;
    readonly reviewRequired: number;
    readonly rejected: number;
  } {
    const counts = { approved: 0, reviewRequired: 0, rejected: 0 };
    for (const report of reports) {
      if (!this.isRecord(report)) {
        continue;
      }
      if (report.status === "approved") {
        counts.approved += 1;
      } else if (report.status === "review_required") {
        counts.reviewRequired += 1;
      } else if (report.status === "rejected") {
        counts.rejected += 1;
      }
    }
    return counts;
  }

  private validateGeneratedAudioBatchStatusSemantics(
    fileName: string,
    value: Record<string, unknown>,
    reportStatusCounts: { readonly approved: number; readonly reviewRequired: number; readonly rejected: number },
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (value.status === "not_requested") {
      if (value.intentCount !== 0 || value.readyIntentCount !== 0 || value.resultCount !== 0 || value.approvedTrackCount !== 0) {
        checks.push({ name: "generated_audio_output_batch_status", status: "fail", fileName, message: "not_requested generated-audio output batch must have zero intents, results, and tracks." });
      }
    }
    if (value.status === "approved") {
      if (value.issueCount !== 0 || value.reviewRequiredReportCount !== 0 || value.rejectedReportCount !== 0 || value.approvedTrackCount !== value.readyIntentCount) {
        checks.push({ name: "generated_audio_output_batch_status", status: "fail", fileName, message: "approved generated-audio output batch requires zero issues and one approved track per ready intent." });
      }
    }
    if (value.status === "rejected" && value.approvedTrackCount !== 0) {
      checks.push({ name: "generated_audio_output_batch_status", status: "fail", fileName, message: "rejected generated-audio output batch must not include approved tracks." });
    }
    if (value.status === "partially_approved") {
      const hasProblemEvidence =
        (typeof value.issueCount === "number" && value.issueCount > 0) ||
        reportStatusCounts.reviewRequired > 0 ||
        reportStatusCounts.rejected > 0;
      if (value.approvedTrackCount === 0 || !hasProblemEvidence) {
        checks.push({ name: "generated_audio_output_batch_status", status: "fail", fileName, message: "partially_approved generated-audio output batch requires approved tracks plus unresolved issue or report evidence." });
      }
    }
  }

  private validatePostproductionAssetConsistency(
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const artifact = artifacts.get("postproduction_asset_plan");
    if (!artifact || !this.isRecord(artifact.value)) {
      return;
    }
    const plan = artifact.value;
    const caption = this.isRecord(plan.caption) ? plan.caption : undefined;
    const audio = this.isRecord(plan.audio) ? plan.audio : undefined;
    const generatedAudio = this.isRecord(plan.generatedAudio) ? plan.generatedAudio : undefined;
    const expected = {
      status: typeof plan.status === "string" ? plan.status : undefined,
      captionCueCount: typeof caption?.cueCount === "number" ? caption.cueCount : undefined,
      captionBurnIn: typeof caption?.burnIn === "boolean" ? caption.burnIn : undefined,
      audioTrackCount: typeof audio?.trackCount === "number" ? audio.trackCount : undefined,
      audioMixEnabled: typeof audio?.enabled === "boolean" ? audio.enabled : undefined,
      generatedAudioStatus: typeof generatedAudio?.status === "string" ? generatedAudio.status : undefined,
      generatedAudioIntentCount: typeof generatedAudio?.intentCount === "number" ? generatedAudio.intentCount : undefined,
      generatedAudioReadyIntentCount: typeof generatedAudio?.readyIntentCount === "number" ? generatedAudio.readyIntentCount : undefined,
      generatedAudioBlockedIntentCount: typeof generatedAudio?.blockedIntentCount === "number" ? generatedAudio.blockedIntentCount : undefined,
      issueCount: typeof plan.issueCount === "number" ? plan.issueCount : undefined
    };

    const runSummary = artifacts.get("run_summary");
    if (runSummary && this.isRecord(runSummary.value)) {
      this.compareArtifactField(
        runSummary.entry.fileName,
        "postproductionAssetStatus",
        runSummary.value.postproductionAssetStatus,
        expected.status,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "captionCueCount",
        runSummary.value.captionCueCount,
        expected.captionCueCount,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "audioTrackCount",
        runSummary.value.audioTrackCount,
        expected.audioTrackCount,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "generatedAudioStatus",
        runSummary.value.generatedAudioStatus,
        expected.generatedAudioStatus,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "generatedAudioIntentCount",
        runSummary.value.generatedAudioIntentCount,
        expected.generatedAudioIntentCount,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "generatedAudioReadyIntentCount",
        runSummary.value.generatedAudioReadyIntentCount,
        expected.generatedAudioReadyIntentCount,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "generatedAudioBlockedIntentCount",
        runSummary.value.generatedAudioBlockedIntentCount,
        expected.generatedAudioBlockedIntentCount,
        checks
      );
      this.compareArtifactField(
        runSummary.entry.fileName,
        "postproductionAssetIssueCount",
        runSummary.value.postproductionAssetIssueCount,
        expected.issueCount,
        checks
      );
    }

    const reviewPacket = artifacts.get("review_packet");
    const reviewPlanning = reviewPacket && this.isRecord(reviewPacket.value) && this.isRecord(reviewPacket.value.planning)
      ? reviewPacket.value.planning
      : undefined;
    if (reviewPacket && !reviewPlanning) {
      checks.push({
        name: "postproduction_asset_consistency",
        status: "fail",
        fileName: reviewPacket.entry.fileName,
        message: "review-packet planning evidence is missing."
      });
    } else if (reviewPacket && reviewPlanning) {
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.postproductionAssetStatus",
        reviewPlanning.postproductionAssetStatus,
        expected.status,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.captionCueCount",
        reviewPlanning.captionCueCount,
        expected.captionCueCount,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.audioTrackCount",
        reviewPlanning.audioTrackCount,
        expected.audioTrackCount,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.generatedAudioStatus",
        reviewPlanning.generatedAudioStatus,
        expected.generatedAudioStatus,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.generatedAudioIntentCount",
        reviewPlanning.generatedAudioIntentCount,
        expected.generatedAudioIntentCount,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.generatedAudioReadyIntentCount",
        reviewPlanning.generatedAudioReadyIntentCount,
        expected.generatedAudioReadyIntentCount,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.generatedAudioBlockedIntentCount",
        reviewPlanning.generatedAudioBlockedIntentCount,
        expected.generatedAudioBlockedIntentCount,
        checks
      );
      this.compareArtifactField(
        reviewPacket.entry.fileName,
        "planning.postproductionAssetIssueCount",
        reviewPlanning.postproductionAssetIssueCount,
        expected.issueCount,
        checks
      );
    }

    const stageLifecycle = artifacts.get("stage_lifecycle");
    const assembleEvidence = this.assembleStageEvidence(stageLifecycle?.value);
    if (stageLifecycle && !assembleEvidence) {
      checks.push({
        name: "postproduction_asset_consistency",
        status: "fail",
        fileName: stageLifecycle.entry.fileName,
        message: "assemble-stage postproduction evidence is missing."
      });
    } else if (stageLifecycle && assembleEvidence) {
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.postproductionAssetStatus",
        assembleEvidence.postproductionAssetStatus,
        expected.status,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.captionCueCount",
        assembleEvidence.captionCueCount,
        expected.captionCueCount,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.captionBurnIn",
        assembleEvidence.captionBurnIn,
        expected.captionBurnIn,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.audioTrackCount",
        assembleEvidence.audioTrackCount,
        expected.audioTrackCount,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.audioMixEnabled",
        assembleEvidence.audioMixEnabled,
        expected.audioMixEnabled,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.generatedAudioStatus",
        assembleEvidence.generatedAudioStatus,
        expected.generatedAudioStatus,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.generatedAudioIntentCount",
        assembleEvidence.generatedAudioIntentCount,
        expected.generatedAudioIntentCount,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.generatedAudioReadyIntentCount",
        assembleEvidence.generatedAudioReadyIntentCount,
        expected.generatedAudioReadyIntentCount,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.generatedAudioBlockedIntentCount",
        assembleEvidence.generatedAudioBlockedIntentCount,
        expected.generatedAudioBlockedIntentCount,
        checks
      );
      this.compareArtifactField(
        stageLifecycle.entry.fileName,
        "assemble.evidence.postproductionAssetIssueCount",
        assembleEvidence.postproductionAssetIssueCount,
        expected.issueCount,
        checks
      );
    }
  }

  private validateStoryboardApprovalConsistency(
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const approvalArtifact = artifacts.get("storyboard_approval");
    const strategyArtifact = artifacts.get("video_render_strategy");
    const runSummaryArtifact = artifacts.get("run_summary");
    const reviewPacketArtifact = artifacts.get("review_packet");
    const strategy = strategyArtifact && this.isRecord(strategyArtifact.value) ? strategyArtifact.value : undefined;
    const runSummary = runSummaryArtifact && this.isRecord(runSummaryArtifact.value) ? runSummaryArtifact.value : undefined;
    const reviewPlanning = reviewPacketArtifact &&
      this.isRecord(reviewPacketArtifact.value) &&
      this.isRecord(reviewPacketArtifact.value.planning)
        ? reviewPacketArtifact.value.planning
        : undefined;

    if (strategy?.storyboardRequired === true && !approvalArtifact) {
      checks.push({
        name: "storyboard_approval_consistency",
        status: "fail",
        fileName: strategyArtifact?.entry.fileName ?? "video-render-strategy.json",
        message: "Storyboard-required workflow must include storyboard-approval.json before render evidence is accepted."
      });
      return;
    }
    if (runSummary?.hasStoryboardApprovalReport === true && !approvalArtifact) {
      checks.push({
        name: "storyboard_approval_consistency",
        status: "fail",
        fileName: runSummaryArtifact?.entry.fileName ?? "run-summary.json",
        message: "run-summary says storyboard approval exists, but the artifact is missing."
      });
    }
    if (reviewPlanning?.hasStoryboardApprovalReport === true && !approvalArtifact) {
      checks.push({
        name: "storyboard_approval_consistency",
        status: "fail",
        fileName: reviewPacketArtifact?.entry.fileName ?? "review-packet.json",
        message: "review-packet says storyboard approval exists, but the artifact is missing."
      });
    }
    if (!approvalArtifact || !this.isRecord(approvalArtifact.value)) {
      return;
    }
    const approval = approvalArtifact.value;
    if (strategy?.storyboardRequired === true && approval.status !== "approved") {
      checks.push({
        name: "storyboard_approval_consistency",
        status: "fail",
        fileName: approvalArtifact.entry.fileName,
        message: "Rendered storyboard-required workflow must have approved storyboard approval evidence."
      });
    }
    if (runSummary) {
      if (runSummary.hasStoryboardApprovalReport !== true) {
        checks.push({
          name: "storyboard_approval_consistency",
          status: "fail",
          fileName: runSummaryArtifact?.entry.fileName ?? approvalArtifact.entry.fileName,
          message: "run-summary must mark hasStoryboardApprovalReport true when the artifact exists."
        });
      }
      this.compareStoryboardApprovalField(
        runSummaryArtifact?.entry.fileName ?? approvalArtifact.entry.fileName,
        "storyboardApprovalStatus",
        runSummary.storyboardApprovalStatus,
        approval.status,
        approvalArtifact.entry.fileName,
        checks
      );
      const summary = this.isRecord(approval.summary) ? approval.summary : undefined;
      this.compareStoryboardApprovalField(
        runSummaryArtifact?.entry.fileName ?? approvalArtifact.entry.fileName,
        "storyboardApprovalCheckpointCount",
        runSummary.storyboardApprovalCheckpointCount,
        summary?.checkpointCount,
        approvalArtifact.entry.fileName,
        checks
      );
    }
    if (reviewPlanning) {
      if (reviewPlanning.hasStoryboardApprovalReport !== true) {
        checks.push({
          name: "storyboard_approval_consistency",
          status: "fail",
          fileName: reviewPacketArtifact?.entry.fileName ?? approvalArtifact.entry.fileName,
          message: "review-packet must mark hasStoryboardApprovalReport true when the artifact exists."
        });
      }
      this.compareStoryboardApprovalField(
        reviewPacketArtifact?.entry.fileName ?? approvalArtifact.entry.fileName,
        "planning.storyboardApprovalStatus",
        reviewPlanning.storyboardApprovalStatus,
        approval.status,
        approvalArtifact.entry.fileName,
        checks
      );
    }
  }

  private compareStoryboardApprovalField(
    fileName: string,
    fieldPath: string,
    actual: unknown,
    expected: unknown,
    expectedSource: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (expected === undefined) {
      return;
    }
    if (actual !== expected) {
      checks.push({
        name: "storyboard_approval_consistency",
        status: "fail",
        fileName,
        message: `${fieldPath} does not match ${expectedSource}.`
      });
    }
  }

  private validateGeneratedAudioOutputBatchConsistency(
    artifacts: ReadonlyMap<ProjectArtifactKind, LoadedArtifact>,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const batchArtifact = artifacts.get("generated_audio_output_batch_validation");
    const runSummary = artifacts.get("run_summary");
    const runSummaryValue = runSummary && this.isRecord(runSummary.value) ? runSummary.value : undefined;

    if (!batchArtifact) {
      if (runSummaryValue?.hasGeneratedAudioOutputBatchValidation === true) {
        checks.push({
          name: "generated_audio_output_batch_consistency",
          status: "fail",
          fileName: runSummary?.entry.fileName ?? "run-summary.json",
          message: "run-summary says generated-audio output batch validation exists, but the artifact is missing."
        });
      }
      const reviewPacket = artifacts.get("review_packet");
      const reviewPlanning = reviewPacket && this.isRecord(reviewPacket.value) && this.isRecord(reviewPacket.value.planning)
        ? reviewPacket.value.planning
        : undefined;
      if (reviewPlanning?.hasGeneratedAudioOutputBatchValidation === true) {
        checks.push({
          name: "generated_audio_output_batch_consistency",
          status: "fail",
          fileName: reviewPacket?.entry.fileName ?? "review-packet.json",
          message: "review-packet says generated-audio output batch validation exists, but the artifact is missing."
        });
      }
      return;
    }
    if (!this.isRecord(batchArtifact.value)) {
      return;
    }
    const batch = batchArtifact.value;
    const postproductionArtifact = artifacts.get("postproduction_asset_plan");
    const postproductionValue = postproductionArtifact && this.isRecord(postproductionArtifact.value)
      ? postproductionArtifact.value
      : undefined;
    const generatedAudio = postproductionValue && this.isRecord(postproductionValue.generatedAudio)
      ? postproductionValue.generatedAudio
      : undefined;

    if (generatedAudio) {
      this.compareGeneratedAudioBatchField(
        batchArtifact.entry.fileName,
        "intentCount",
        batch.intentCount,
        generatedAudio.intentCount,
        "postproduction-assets.json generatedAudio.intentCount",
        checks
      );
      this.compareGeneratedAudioBatchField(
        batchArtifact.entry.fileName,
        "readyIntentCount",
        batch.readyIntentCount,
        generatedAudio.readyIntentCount,
        "postproduction-assets.json generatedAudio.readyIntentCount",
        checks
      );
    }

    if (!runSummaryValue) {
      return;
    }
    if (runSummaryValue.hasGeneratedAudioOutputBatchValidation !== true) {
      checks.push({
        name: "generated_audio_output_batch_consistency",
        status: "fail",
        fileName: runSummary?.entry.fileName ?? "run-summary.json",
        message: "run-summary must mark hasGeneratedAudioOutputBatchValidation true when the batch artifact exists."
      });
    }
    this.compareGeneratedAudioBatchField(
      runSummary?.entry.fileName ?? batchArtifact.entry.fileName,
      "generatedAudioOutputBatchStatus",
      runSummaryValue.generatedAudioOutputBatchStatus,
      batch.status,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      runSummary?.entry.fileName ?? batchArtifact.entry.fileName,
      "generatedAudioResultCount",
      runSummaryValue.generatedAudioResultCount,
      batch.resultCount,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      runSummary?.entry.fileName ?? batchArtifact.entry.fileName,
      "generatedAudioApprovedTrackCount",
      runSummaryValue.generatedAudioApprovedTrackCount,
      batch.approvedTrackCount,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      runSummary?.entry.fileName ?? batchArtifact.entry.fileName,
      "generatedAudioOutputBatchIssueCount",
      runSummaryValue.generatedAudioOutputBatchIssueCount,
      batch.issueCount,
      batchArtifact.entry.fileName,
      checks
    );

    const reviewPacket = artifacts.get("review_packet");
    const reviewPlanning = reviewPacket && this.isRecord(reviewPacket.value) && this.isRecord(reviewPacket.value.planning)
      ? reviewPacket.value.planning
      : undefined;
    if (!reviewPlanning) {
      return;
    }
    if (reviewPlanning.hasGeneratedAudioOutputBatchValidation !== true) {
      checks.push({
        name: "generated_audio_output_batch_consistency",
        status: "fail",
        fileName: reviewPacket?.entry.fileName ?? "review-packet.json",
        message: "review-packet must mark hasGeneratedAudioOutputBatchValidation true when the batch artifact exists."
      });
    }
    this.compareGeneratedAudioBatchField(
      reviewPacket?.entry.fileName ?? batchArtifact.entry.fileName,
      "planning.generatedAudioOutputBatchStatus",
      reviewPlanning.generatedAudioOutputBatchStatus,
      batch.status,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      reviewPacket?.entry.fileName ?? batchArtifact.entry.fileName,
      "planning.generatedAudioResultCount",
      reviewPlanning.generatedAudioResultCount,
      batch.resultCount,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      reviewPacket?.entry.fileName ?? batchArtifact.entry.fileName,
      "planning.generatedAudioApprovedTrackCount",
      reviewPlanning.generatedAudioApprovedTrackCount,
      batch.approvedTrackCount,
      batchArtifact.entry.fileName,
      checks
    );
    this.compareGeneratedAudioBatchField(
      reviewPacket?.entry.fileName ?? batchArtifact.entry.fileName,
      "planning.generatedAudioOutputBatchIssueCount",
      reviewPlanning.generatedAudioOutputBatchIssueCount,
      batch.issueCount,
      batchArtifact.entry.fileName,
      checks
    );
  }

  private compareGeneratedAudioBatchField(
    fileName: string,
    fieldPath: string,
    actual: unknown,
    expected: unknown,
    expectedSource: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (expected === undefined) {
      return;
    }
    if (actual !== expected) {
      checks.push({
        name: "generated_audio_output_batch_consistency",
        status: "fail",
        fileName,
        message: `${fieldPath} does not match ${expectedSource}.`
      });
    }
  }

  private assembleStageEvidence(value: unknown): Record<string, unknown> | undefined {
    if (!this.isRecord(value) || !Array.isArray(value.records)) {
      return undefined;
    }
    const assemble = value.records.find(
      (record): record is Record<string, unknown> =>
        this.isRecord(record) && record.stage === "assemble"
    );
    return assemble && this.isRecord(assemble.evidence) ? assemble.evidence : undefined;
  }

  private compareArtifactField(
    fileName: string,
    fieldPath: string,
    actual: unknown,
    expected: unknown,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    if (expected === undefined) {
      return;
    }
    if (actual !== expected) {
      checks.push({
        name: "postproduction_asset_consistency",
        status: "fail",
        fileName,
        message: `${fieldPath} does not match postproduction-assets.json.`
      });
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
    for (const type of ["project", "story_arc", "sequence", "scene", "shot", "material_sourcing"] as const) {
      if (!nodeTypes.has(type)) {
        checks.push({ name: "production_graph_node_type", status: "fail", fileName: artifact.entry.fileName, message: `production-graph is missing ${type} node evidence.` });
      }
    }
    this.validateSequenceGraphShape(value, artifact.entry.fileName, checks);
    if (artifacts.has("rendered_shots") && !nodeTypes.has("clip_render")) {
      checks.push({ name: "production_graph_render_nodes", status: "warn", fileName: artifact.entry.fileName, message: "production-graph has rendered_shots artifact but no clip_render node." });
    }
  }

  private validateSequenceGraphShape(
    value: Record<string, unknown>,
    fileName: string,
    checks: ProjectArtifactValidationCheck[]
  ): void {
    const nodes = Array.isArray(value.nodes) ? value.nodes.filter((node): node is Record<string, unknown> => this.isRecord(node)) : [];
    const edges = Array.isArray(value.edges) ? value.edges.filter((edge): edge is Record<string, unknown> => this.isRecord(edge)) : [];
    const sequenceNodes = nodes.filter((node) => node.type === "sequence");
    const sceneNodes = nodes.filter((node) => node.type === "scene");
    const storyNodes = nodes.filter((node) => node.type === "story_arc");
    const sequenceIds = new Set(sequenceNodes.map((node) => node.id).filter((id): id is string => typeof id === "string"));
    const storyIds = new Set(storyNodes.map((node) => node.id).filter((id): id is string => typeof id === "string"));

    if (sequenceNodes.length === 0 || sceneNodes.length === 0) {
      return;
    }
    for (const [index, node] of sequenceNodes.entries()) {
      const data = this.isRecord(node.data) ? node.data : undefined;
      if (!data) {
        checks.push({ name: "production_graph_sequence_data", status: "fail", fileName, message: `Sequence node ${index} is missing data.` });
        continue;
      }
      for (const field of ["title", "purpose"] as const) {
        if (typeof data[field] !== "string" || !data[field]) {
          checks.push({ name: "production_graph_sequence_data", status: "fail", fileName, message: `Sequence node ${index} is missing ${field}.` });
        }
      }
      if (typeof data.targetDurationSeconds !== "number" || !Number.isFinite(data.targetDurationSeconds) || data.targetDurationSeconds <= 0) {
        checks.push({ name: "production_graph_sequence_duration", status: "fail", fileName, message: `Sequence node ${index} has invalid targetDurationSeconds.` });
      }
      if (typeof data.order !== "number" || !Number.isInteger(data.order) || data.order !== index) {
        checks.push({ name: "production_graph_sequence_order", status: "fail", fileName, message: `Sequence node ${index} order is not deterministic.` });
      }
      const hasStoryParent = edges.some((edge) =>
        edge.type === "depends_on" &&
        storyIds.has(String(edge.fromNodeId)) &&
        edge.toNodeId === node.id
      );
      if (!hasStoryParent) {
        checks.push({ name: "production_graph_sequence_parent", status: "fail", fileName, message: `Sequence node ${index} is not linked from a story_arc node.` });
      }
    }
    for (const [index, node] of sceneNodes.entries()) {
      const hasSequenceParent = edges.some((edge) =>
        edge.type === "depends_on" &&
        sequenceIds.has(String(edge.fromNodeId)) &&
        edge.toNodeId === node.id
      );
      if (!hasSequenceParent) {
        checks.push({ name: "production_graph_scene_parent", status: "fail", fileName, message: `Scene node ${index} is not linked from a sequence node.` });
      }
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

  private isValidAudienceNicheIntelligence(value: unknown): boolean {
    if (!this.isRecord(value)) {
      return false;
    }
    return value.schemaVersion === "cinejelly.audience-niche-intelligence.v1" &&
      typeof value.intelligenceId === "string" &&
      value.noSpend === true &&
      value.networkCallsMade === false &&
      value.providerCallsMade === false &&
      typeof value.userPresentationStyle === "string" &&
      typeof value.niche === "string" &&
      typeof value.audience === "string" &&
      typeof value.funnelStage === "string" &&
      typeof value.format === "string" &&
      typeof value.trendPosture === "string" &&
      typeof value.viewerDesire === "string" &&
      typeof value.viewerObjection === "string" &&
      typeof value.hookAngle === "string" &&
      typeof value.retentionPattern === "string" &&
      typeof value.proofStrategy === "string" &&
      typeof value.shareTrigger === "string" &&
      typeof value.ctaStrategy === "string" &&
      Array.isArray(value.localizationSignals) &&
      Array.isArray(value.riskSignals) &&
      Array.isArray(value.missingSignals) &&
      Array.isArray(value.ideaSeeds) &&
      Array.isArray(value.sourcePatternOrigins);
  }

  private isCredentialFreeHttps(value: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return false;
    }
    return !CREDENTIAL_QUERY_URI_PATTERN.test(value);
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
