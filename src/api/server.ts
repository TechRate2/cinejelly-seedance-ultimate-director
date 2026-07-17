/**
 * Production HTTP entrypoint for CineJelly's one-input render pipeline.
 * It exposes a small JSON API without adding framework dependencies.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse
} from "node:http";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime } from "../application/director-factory.js";
import {
  normalizeRenderRequest,
  RenderRequestNormalizationError
} from "../application/render-request-normalizer.js";
import { buildRenderSettingsDescriptor } from "../application/render-settings-descriptor.js";
import { UPLOAD_FILE_NAME_PATTERN, buildUploadUri, uploadsDirectoryFor } from "../core/upload-reference.js";
import { VideoRedubPlanner } from "../core/video-redub-planner.js";
import { RedubExecutor } from "../core/redub-executor.js";
import { SeriesContinuityStore } from "../core/series-continuity-store.js";
import { SeriesEpisodeDirector } from "../application/series-episode-director.js";
import type { SeriesDramaRequest } from "../core/series-drama-planner.js";
import { createStableId } from "../utils/ids.js";
import { MediaInspector } from "../core/media-inspector.js";
import { captionCuesToSrt } from "../core/subtitle-translator.js";
import { AtlasCloudProvider } from "../providers/atlascloud/atlas-cloud-provider.js";
import { ProviderCostLedger } from "../providers/cost-ledger.js";
import { loadRuntimeSettings } from "../config/runtime-config.js";
import {
  UserAccountError,
  UserAccountStore,
  estimateRenderCredits,
  estimatePipelineRenderCredits,
  type RenderCreditPricing,
  type PipelineCostConfig
} from "./user-account-store.js";
import { AdminSettingsStore } from "./admin-settings-store.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "../application/validation-readiness-report.js";
import {
  buildOperatorLaunchUiContract,
  type OperatorLaunchUiReportInput
} from "../core/operator-launch-ui-contract.js";
import { BITRATE_MODES, RATIOS, RESOLUTIONS } from "../config/seedance-settings.js";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import { ReviewApprovalSystem } from "../core/review-approval-system.js";
import { buildLongDirectorUiContract } from "../core/long-director-ui-contract.js";
import {
  mergeProductUrlSnapshots,
  ProductUrlResearcher,
  safeProductUrlResearchSummary
} from "../core/product-url-researcher.js";
import { ShortPipelineConversationEngine } from "../core/short-pipeline-conversation.js";
import { buildShortMvpUiContract } from "../core/short-mvp-ui-contract.js";
import { ShortPipelinePlanner } from "../core/short-pipeline-planner.js";
import {
  buildShortPipelineRenderHandoff,
  reviewInputCanQueueRender,
  type ShortPipelineRenderHandoff,
  type ShortPipelineRenderHandoffReviewInput
} from "../core/short-pipeline-render-handoff.js";
import { buildShortVideoPipeCatalog } from "../core/short-video-pipe-planner.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactValidationReport } from "../types/artifact.js";
import type { LongFormCreativeIntelligencePlan } from "../types/long-form-creative-intelligence.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type {
  ReviewApprovalCheckpointInput,
  ReviewApprovalDecision,
  ReviewApprovalEvidenceValue,
  ReviewApprovalGate,
  ReviewApprovalReport,
  ReviewApprovalSurface
} from "../types/review-approval.js";
import type {
  ShortPipelineConversationInput,
  ShortPipelineConversationMessageInput,
  ShortPipelineConversationRole,
  ShortMediaReferenceInput,
  ShortPipelineAudioPolicyInput,
  ShortPipelinePlan,
  ShortPipelinePlanInput,
  ShortSeedanceSettingsInput,
  ShortVisualBibleInput
} from "../types/short-pipeline.js";
import type { AspectRatio, BitrateMode, Resolution } from "../types/settings.js";
import type { ShortChannelStyleProfileInput } from "../types/short-channel-style.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiResponse } from "./api-response-redaction.js";
import { redactEmbeddedLocalPaths } from "./api-response-redaction.js";
import { probeAtlasModelPricing, AtlasPricingProbeError, ATLAS_PRICING_PAGE_URL } from "./atlas-pricing-probe.js";
import type { AtlasPricingProbeResult } from "./atlas-pricing-probe.js";
import { toApiProjectArtifactBundle, toApiProjectArtifactValidationReport } from "./artifact-response.js";
import { ApiAuthGuard, readApiAuthDisabled } from "./api-auth.js";
import {
  ApiClientPolicyError,
  ApiClientPolicyGate,
  type ApiClientPolicyReservation
} from "./api-client-policy.js";
import { ApiConcurrencyGate } from "./api-concurrency-gate.js";
import { ApiRateLimiter, readRateLimitDisabled, readTrustProxyHeaders } from "./api-rate-limit.js";
import { ApiShutdownCoordinator, createHttpRequestLifecycle } from "./http-lifecycle.js";
import { isApplicationJsonMediaType } from "./media-type.js";
import { buildOperatorLaunchDashboardPage } from "./operator-launch-dashboard-page.js";
import { buildOperatorTopupPage } from "./operator-topup-page.js";
import {
  createProductionGraphResumeQueueService,
  PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH,
  readProductionGraphResumeQueuePath,
  type ProductionGraphResumeQueueService
} from "./production-graph-resume-queue-service.js";
import {
  RenderJobCapacityError,
  RenderJobIdempotencyConflictError,
  RenderJobManager,
  RenderJobReviewStateError,
  type RenderJobReviewInput,
  type RenderJobSummary
} from "./render-job-manager.js";
import { readRenderJobHistoryPath, RenderJobHistoryStore } from "./render-job-history-store.js";
import {
  RENDER_PROVIDER_HANDOFF_LEASE_SERVICE_PATH,
  readRenderProviderLeasePath,
  RenderProviderHandoffLeaseService,
  SerializedRenderProviderHandoffLeaseStore
} from "./render-provider-handoff-lease-service.js";
import { FileRenderProviderHandoffLeaseStore } from "./render-provider-handoff.js";
import { renderRequestAdmissionFromEnv, RenderRequestAdmissionError } from "./render-request-admission.js";
import {
  attachRequestContextHeaders,
  createApiRequestContext,
  type ApiRequestContext
} from "./request-context.js";
import {
  readShortChannelStyleLibraryPath,
  ShortChannelStyleLibraryStore,
  type ShortChannelStyleLibraryRecord
} from "./short-channel-style-library-store.js";
import {
  readShortPipelineSessionStorePath,
  ShortPipelineSessionStore,
  type ShortPipelineStoredSessionRecord
} from "./short-pipeline-session-store.js";
import { buildShortPipelineCreatePage } from "./short-pipeline-create-page.js";
import {
  ApiWorkspaceBillingError,
  ApiWorkspaceBillingGate,
  type ApiWorkspaceBillingReservation
} from "./workspace-billing-policy.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,160}$/;
const PERSISTED_REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_.:-]{8,160}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const REVIEW_TEXT_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_REVIEW_APPROVAL_CHECKPOINTS = 120;
const DEFAULT_UPLOAD_MAX_BYTES = 26_214_400;
/** Total uploads-directory ceiling (all customers combined) so no one can exhaust the disk. */
const DEFAULT_UPLOADS_TOTAL_MAX_BYTES = 5 * 1024 * 1024 * 1024;
/** Hard cap on the number of stored uploads so the directory scan and disk stay bounded. */
const DEFAULT_UPLOADS_MAX_FILES = 5_000;
// Per-USER upload byte cap so one account cannot consume the shared global pool and deny uploads to
// every other tenant (finding F11). The global cap above stays the hard disk guard.
const DEFAULT_UPLOADS_PER_USER_MAX_BYTES = 1024 * 1024 * 1024;
/** Reference uploads: extension -> served content type. Images/video/audio only. */
const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4"
};
const UPLOAD_KIND_BY_EXTENSION: Record<string, "image" | "video" | "audio"> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  mp4: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio"
};
const MAX_REVIEW_APPROVAL_EVIDENCE_ENTRIES = 60;
const MAX_REVIEW_APPROVAL_ARRAY_ITEMS = 80;
const LONG_FORM_CREATIVE_STATUSES = new Set(["ready", "review_required", "blocked"]);
const LONG_FORM_CREATIVE_REPAIR_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const LONG_DIRECTOR_NARRATIVE_MODES = new Set([
  "single_long_story",
  "documentary_explainer",
  "training_or_education",
  "brand_film",
  "series_episode"
]);
const LONG_DIRECTOR_CONTINUITY_MODES = new Set(["project_bible", "series_bible_required"]);
const LONG_DIRECTOR_CHECKPOINT_STAGES = new Set(["story", "scene_plan", "references", "sample", "render", "publish"]);
const SHORT_MEDIA_REFERENCE_ROLES = new Set([
  "kol",
  "creator",
  "product",
  "wardrobe",
  "clothing",
  "background",
  "environment",
  "first_frame",
  "last_frame",
  "style",
  "motion",
  "camera",
  "audio",
  "source_video"
]);
const SHORT_MEDIA_REFERENCE_KINDS = new Set(["image", "video", "audio"]);
const SHORT_MEDIA_REFERENCE_RIGHTS = new Set(["operator_approved", "needs_review", "unknown"]);
const SHORT_MEDIA_REFERENCE_PRIORITIES = new Set(["primary", "supporting"]);
const SHORT_AUDIO_MODES = new Set(["off", "voiceover", "native", "hybrid"]);
const SHORT_AUDIO_LANGUAGES = new Set(["en", "vi", "zh"]);
const MAX_SHORT_MEDIA_REFERENCES = 12;
const BASE_SECURITY_HEADERS: OutgoingHttpHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
};
const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'"
].join("; ");
const OPERATOR_LAUNCH_UI_REPORTS = [
  {
    reportId: "business_completion_audit",
    label: "Business Completion Audit",
    reportPath: "assets/output_deliverables/business-readiness/business-completion-audit-report.json"
  },
  {
    reportId: "roadmap_closure_audit",
    label: "Roadmap Closure Audit",
    reportPath: "assets/output_deliverables/business-readiness/roadmap-closure-audit-report.json"
  },
  {
    reportId: "business_readiness_audit",
    label: "Business Readiness Audit",
    reportPath: "assets/output_deliverables/phase6-validation/business-readiness-report.json"
  },
  {
    reportId: "commercial_launch_doctor",
    label: "Commercial Launch Doctor",
    reportPath: "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json"
  },
  {
    reportId: "commercial_launch_inputs",
    label: "Commercial Launch Inputs",
    reportPath: "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json"
  },
  {
    reportId: "commercial_launch_intake",
    label: "Commercial Launch Intake",
    reportPath: "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json"
  },
  {
    reportId: "snapshot_parity_audit",
    label: "Snapshot Parity Audit",
    reportPath: "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json"
  },
  {
    reportId: "report_contract_validation",
    label: "Report Contract Validation",
    reportPath: "assets/output_deliverables/business-readiness/report-contract-validation-report.json"
  },
  {
    reportId: "ops_config_validation",
    label: "Ops Config Validation",
    reportPath: "assets/output_deliverables/business-readiness/ops-config-validation-report.json"
  }
] as const;

interface RenderRequestBody extends CineJellyProjectRequest {
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
  readonly preExportReviewApprovalGate?: ReviewApprovalGate;
  readonly preExportReviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
}

interface RenderJobReviewRequestBody {
  readonly gate?: ReviewApprovalGate;
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly checkpoints?: readonly ReviewApprovalCheckpointInput[];
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
}

interface ShortPipelineConversationRequestBody extends Omit<ShortPipelineConversationInput, "messages"> {
  readonly messages?: readonly ShortPipelineConversationMessageInput[];
  readonly userPrompt?: string;
  readonly channelStyleProfileId?: string;
  readonly settings?: CineJellyProjectRequest["settings"];
}

interface ShortPipelinePlanRequestBody extends ShortPipelinePlanInput {
  readonly channelStyleProfileId?: string;
  readonly settings?: CineJellyProjectRequest["settings"];
}

interface ShortPipelineProductUrlPlanRequestBody extends ShortPipelinePlanRequestBody {
  readonly confirmLiveNetwork?: boolean;
  readonly maxProductUrlBytes?: number;
  readonly productResearchTimeoutMs?: number;
}

interface LongDirectorUiContractRequestBody {
  readonly longFormCreativeIntelligencePlan?: LongFormCreativeIntelligencePlan;
}

interface NormalizedShortPipelineProductUrlPlanBody {
  readonly planInput: ShortPipelinePlanInput;
  readonly confirmLiveNetwork: boolean;
  readonly maxProductUrlBytes?: number;
  readonly productResearchTimeoutMs?: number;
}

interface ShortPipelineRenderJobRequestBody {
  readonly planInput?: ShortPipelinePlanRequestBody;
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
  readonly confirmRenderSubmission?: boolean;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly captionPreference?: "narration_subtitles" | "none";
  readonly audio?: ShortPipelinePlanInput["audio"];
  readonly settings?: CineJellyProjectRequest["settings"];
  readonly modelPreferences?: CineJellyProjectRequest["modelPreferences"];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
}

interface ShortPipelineConversationSessionRenderJobRequestBody {
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
  readonly confirmRenderSubmission?: boolean;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly captionPreference?: "narration_subtitles" | "none";
  readonly audio?: ShortPipelinePlanInput["audio"];
  readonly settings?: CineJellyProjectRequest["settings"];
  readonly modelPreferences?: CineJellyProjectRequest["modelPreferences"];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
}

interface NormalizedShortPipelineRenderJobBody {
  readonly planInput: ShortPipelinePlanInput;
  readonly reviewApproval?: ShortPipelineRenderHandoffReviewInput;
  readonly confirmRenderSubmission: boolean;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly captionPreference?: "narration_subtitles" | "none";
  readonly audio?: ShortPipelinePlanInput["audio"];
  readonly settings?: CineJellyProjectRequest["settings"];
  readonly modelPreferences?: CineJellyProjectRequest["modelPreferences"];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
}

interface NormalizedShortPipelineConversationSessionRenderJobBody {
  readonly reviewApproval?: ShortPipelineRenderHandoffReviewInput;
  readonly confirmRenderSubmission: boolean;
  readonly includeGeneratedAudioIntents?: boolean;
  readonly captionPreference?: "narration_subtitles" | "none";
  readonly audio?: ShortPipelinePlanInput["audio"];
  readonly settings?: CineJellyProjectRequest["settings"];
  readonly modelPreferences?: CineJellyProjectRequest["modelPreferences"];
  readonly references?: CineJellyProjectRequest["references"];
  readonly metadata?: CineJellyProjectRequest["metadata"];
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
}

interface CommercialRenderReservation {
  readonly clientPolicyReservation?: ApiClientPolicyReservation;
  readonly workspaceBillingReservation?: ApiWorkspaceBillingReservation;
}

class UnsupportedMediaTypeError extends Error {
  public readonly statusCode = 415;

  public constructor() {
    super("Render request Content-Type must be application/json.");
    this.name = "UnsupportedMediaTypeError";
  }
}

class RequestBodyTooLargeError extends Error {
  public readonly statusCode = 413;

  public constructor(maxBodyBytes: number) {
    super(`Request body exceeds maximum size of ${maxBodyBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

class ShortPipelineRenderHandoffError extends Error {
  public readonly statusCode = 422;

  public constructor(message: string) {
    super(message);
    this.name = "ShortPipelineRenderHandoffError";
  }
}

function assertShortPipelineRenderHandoffAllowed(handoff: ShortPipelineRenderHandoff): void {
  if (!handoff.summary.canUseAsRenderJobHandoff) {
    throw new ShortPipelineRenderHandoffError(handoff.summary.releaseBlocker);
  }
}

class ShortPipelineSessionStoreUnavailableError extends Error {
  public readonly statusCode = 503;

  public constructor() {
    super("CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH is required before durable short-pipeline conversation sessions can be used.");
    this.name = "ShortPipelineSessionStoreUnavailableError";
  }
}

class ShortChannelStyleLibraryUnavailableError extends Error {
  public readonly statusCode = 503;

  public constructor() {
    super("CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH is required before durable short channel-style profiles can be used.");
    this.name = "ShortChannelStyleLibraryUnavailableError";
  }
}

class ShortChannelStyleProfileNotFoundError extends Error {
  public readonly statusCode = 404;

  public constructor() {
    super("Short channel-style profile was not found for this client.");
    this.name = "ShortChannelStyleProfileNotFoundError";
  }
}

/**
 * Short-lived cache for the live Atlas pricing scrape so rapid operator clicks don't hammer the
 * Atlas marketing page (which is Cloudflare-fronted). "Realtime" for the operator's purposes: a
 * click re-reads within a minute is served from cache; older than that re-fetches.
 */
const ATLAS_PRICING_CACHE_TTL_MS = 60_000;
let atlasPricingCache: { at: number; result: AtlasPricingProbeResult } | undefined;

async function readAtlasPricingCached(nowMs: number): Promise<AtlasPricingProbeResult> {
  if (atlasPricingCache && nowMs - atlasPricingCache.at < ATLAS_PRICING_CACHE_TTL_MS) {
    return atlasPricingCache.result;
  }
  const result = await probeAtlasModelPricing();
  atlasPricingCache = { at: nowMs, result };
  return result;
}

export function startServer(port = readPort(process.env.PORT)): Server {
  const maxBodyBytes = readPositiveInteger(process.env.CINEJELLY_API_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const preflight = new RuntimePreflight();
  const validationReadinessReporter = new Phase6ValidationReadinessReporter();
  const artifactStore = new ProjectArtifactStore();
  const artifactValidator = new ProjectArtifactValidator();
  const shortPipelinePlanner = new ShortPipelinePlanner();
  const shortPipelineConversationEngine = new ShortPipelineConversationEngine({ planner: shortPipelinePlanner });
  const productUrlResearcher = new ProductUrlResearcher();
  const reviewApprovalSystem = new ReviewApprovalSystem();
  const shortPipelineSessionStore = shortPipelineSessionStoreConfig(process.env);
  const shortChannelStyleLibraryStore = shortChannelStyleLibraryStoreConfig(process.env);
  const requestAdmission = renderRequestAdmissionFromEnv(process.env);
  const clientPolicyGate = ApiClientPolicyGate.fromEnv(process.env);
  const workspaceBillingGate = ApiWorkspaceBillingGate.fromEnv(process.env);
  const userAccountStore = UserAccountStore.fromEnv(process.env);
  const adminSettingsStore = AdminSettingsStore.fromEnv(process.env);
  // Re-apply operator model choices persisted from the admin UI before any job runs.
  adminSettingsStore.applyModelEnvOverrides();
  const apiAuthGuard = new ApiAuthGuard({
    disabled: readApiAuthDisabled(process.env.CINEJELLY_DISABLE_API_AUTH),
    ...(process.env.CINEJELLY_API_AUTH_TOKEN ? { sharedKey: process.env.CINEJELLY_API_AUTH_TOKEN } : {}),
    clientKeys: clientPolicyGate.authClientKeys(),
    sessionResolver: (sessionToken) => {
      const account = userAccountStore.resolveSession(sessionToken);
      return account ? { userId: account.userId, email: account.email } : undefined;
    }
  });
  const apiRateLimiter = new ApiRateLimiter({
    windowMs: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: readPositiveInteger(process.env.CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS, 6),
    disabled: readRateLimitDisabled(process.env.CINEJELLY_DISABLE_API_RATE_LIMIT),
    trustProxyHeaders: readTrustProxyHeaders(process.env.CINEJELLY_TRUST_PROXY_HEADERS)
  });
  const syncRenderGate = new ApiConcurrencyGate({
    maxConcurrent: readPositiveInteger(process.env.CINEJELLY_API_SYNC_RENDER_CONCURRENCY, 1)
  });
  // Bound concurrent in-flight uploads so a flood of slow-body 25MB uploads from one free account
  // can't accumulate in memory and OOM the whole process (finding F3). Each held upload buffers up
  // to CINEJELLY_UPLOAD_MAX_BYTES, so peak upload memory is capped at (this) × that size.
  const uploadGate = new ApiConcurrencyGate({
    maxConcurrent: readPositiveInteger(process.env.CINEJELLY_API_UPLOAD_CONCURRENCY, 4)
  });
  // Running upload-usage totals so the quota check is O(1) instead of a full directory stat-scan on
  // EVERY request (finding F14), plus a per-user byte tally so one account cannot monopolize the
  // shared pool (finding F11). Seeded once by a lazy scan, then updated on each successful write; the
  // global total only drifts if files are deleted out-of-band (safe direction — it over-counts).
  const uploadsUsage: {
    initialized: boolean;
    seedPromise: Promise<void> | null;
    totalBytes: number;
    fileCount: number;
    perUserBytes: Map<string, number>;
  } = { initialized: false, seedPromise: null, totalBytes: 0, fileCount: 0, perUserBytes: new Map<string, number>() };
  const ensureUploadsUsage = async (dir: string): Promise<{ readonly totalBytes: number; readonly fileCount: number }> => {
    if (!uploadsUsage.initialized) {
      // Single-flight seed: concurrent first-callers await ONE scan instead of each launching their
      // own full readdir+stat (which would recreate the O(n) storm F14 removed, x uploadGate width).
      if (!uploadsUsage.seedPromise) {
        uploadsUsage.seedPromise = uploadsDirectoryUsage(dir).then((scanned) => {
          uploadsUsage.totalBytes = scanned.totalBytes;
          uploadsUsage.fileCount = scanned.fileCount;
          uploadsUsage.initialized = true;
        });
      }
      await uploadsUsage.seedPromise;
    }
    return { totalBytes: uploadsUsage.totalBytes, fileCount: uploadsUsage.fileCount };
  };
  const recordUpload = (uploaderId: string | undefined, bytes: number): void => {
    uploadsUsage.totalBytes += bytes;
    uploadsUsage.fileCount += 1;
    if (uploaderId) {
      uploadsUsage.perUserBytes.set(uploaderId, (uploadsUsage.perUserBytes.get(uploaderId) ?? 0) + bytes);
    }
  };
  const jobManager = new RenderJobManager({
    artifactStore,
    maxConcurrentJobs: readPositiveInteger(process.env.CINEJELLY_API_JOB_CONCURRENCY, 1),
    historyLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_HISTORY_LIMIT, 500),
    queueLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_QUEUE_LIMIT, 50),
    // "Treo chờ admin": an admin-side/provider failure holds the job (customer sees
    // "processing", money stays reserved) and auto-retries until the operator fixes it, up to
    // a deadline after which it force-fails and refunds. Set the flag to "false" to restore
    // the old immediate fail+refund behavior.
    operatorHoldEnabled: (process.env.CINEJELLY_JOB_HOLD_ON_CONFIG_ERROR ?? "true").trim().toLowerCase() !== "false",
    operatorHoldMaxMs: readPositiveInteger(process.env.CINEJELLY_JOB_HOLD_MAX_HOURS, 24) * 60 * 60 * 1000,
    operatorHoldRetryIntervalMs: readPositiveInteger(process.env.CINEJELLY_JOB_HOLD_RETRY_INTERVAL_MS, 180_000),
    ...renderJobHistoryStoreConfig(process.env),
    // Central billing settlement: every terminal transition of a customer job that did not
    // succeed refunds its up-front credit charge (idempotent in the store).
    onJobFinalized: (event) => {
      const finalizedUserId = userIdFromClientId(event.clientId);
      if (!finalizedUserId) {
        return;
      }
      if (event.status === "succeeded") {
        // Durable delivery marker so a post-restart reconcile never refunds this delivered video
        // even after it ages out of the in-memory job history (finding F2).
        userAccountStore.markRenderSettled({ userId: finalizedUserId, jobId: event.jobId });
        return;
      }
      const policy = adminSettingsStore.refundPolicy();
      if (policy === "off") {
        // Owner policy: a failed job never returns credits (cash is never returned under any
        // policy). Operator-hold means infra failures retry to success instead of landing
        // here, so this consumes credits only on a genuinely terminal failure.
        return;
      }
      const reason = event.status === "failed" ? "video bị lỗi" : event.status === "canceled" ? "đã hủy" : "bị từ chối duyệt";
      if (policy === "auto") {
        userAccountStore.refundRender({ userId: finalizedUserId, jobId: event.jobId, reason });
        return;
      }
      // Admin-favorable default: no automatic refunds — the case lands in the operator's
      // refund queue on /operator/topups for a one-tap decision.
      userAccountStore.queueRefundRequest({ userId: finalizedUserId, jobId: event.jobId, reason });
    }
  });
  // Charges are durable but jobs are not: after a restart, settle every unmatched charge
  // whose job vanished or ended without success — per the refund policy. Under "off" the
  // owner keeps the credits, so reconciliation is skipped entirely.
  if (adminSettingsStore.refundPolicy() !== "off") {
    userAccountStore.reconcileRenderCharges(
      (jobId) =>
        // Phí dịch phụ đề/thuyết minh (redub_*) tính và trả kết quả ngay trong một request —
        // không có job nền để đối soát; lỗi giữa chừng đã hoàn/vào hàng chờ ngay tại route,
        // nên coi như đã tất toán (trường hợp sập máy đúng lúc chạy: admin cộng bù thủ công).
        jobId.startsWith("redub_") ? "succeeded" : jobManager.statusOfAny(jobId),
      { mode: adminSettingsStore.refundPolicy() === "auto" ? "refund" : "queue" }
    );
  }
  // Start the periodic operator-hold sweep: retries held jobs (so a fixed key resumes them)
  // and force-fails any held past the deadline (billing then settles per the refund policy —
  // auto refunds, manual queues, "off" keeps the credits — so the job is never stuck forever).
  jobManager.startOperatorHoldSweep();
  // Mỗi tài khoản chỉ một yêu cầu dịch/thuyết minh chạy tại một thời điểm (chặn double-click
  // gây trừ tiền hai lần và giới hạn chi phí provider).
  const redubInFlight = new Set<string>();
  // Per-series render in-flight guard: a second episode render for the SAME series while one is
  // running is rejected (409), so concurrent same-episode submits can never double-charge or
  // double-spend even if the sync concurrency knob is raised (security audit).
  const seriesRenderInFlight = new Set<string>();
  const renderProviderLeaseService = renderProviderLeaseServiceConfig(process.env);
  const productionGraphResumeQueueService = productionGraphResumeQueueServiceConfig(process.env);
  const shutdownCoordinator = new ApiShutdownCoordinator();

  const server = createServer(async (request, response) => {
    const requestContext = createApiRequestContext(request);
    const requestLifecycle = createHttpRequestLifecycle(request, response);
    const unregisterLifecycle = shutdownCoordinator.register(requestLifecycle);
    attachRequestContextHeaders(response, requestContext);
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const rateLimitDecision = apiRateLimiter.check(request, requestUrl.pathname, request.method);
      if (!rateLimitDecision.allowed) {
        sendJson(response, rateLimitDecision.statusCode ?? 429, {
          error: rateLimitDecision.message ?? "Too many requests.",
          retryAfterSeconds: rateLimitDecision.retryAfterSeconds
        }, requestContext, retryAfterHeaders(rateLimitDecision.retryAfterSeconds));
        return;
      }
      const authDecision = apiAuthGuard.authorize(request, requestUrl.pathname);
      if (!authDecision.allowed) {
        sendJson(response, authDecision.statusCode ?? 401, { error: authDecision.message ?? "Unauthorized." }, requestContext);
        return;
      }
      if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")) {
        sendHtml(
          response,
          200,
          '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/short/create"><title>CineJelly</title></head><body><a href="/short/create">Mở CineJelly Studio</a></body></html>'
        );
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, { status: "ok" }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/preflight") {
        const report = await preflight.run(requestLifecycle.signal);
        sendJson(response, report.status === "fail" ? 503 : 200, report, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/validation-readiness") {
        const report = validationReadinessReporter.build(await preflight.run(requestLifecycle.signal));
        sendJson(response, report.decision === "blocked" ? 503 : 200, report, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/render-settings") {
        sendJson(response, 200, buildRenderSettingsDescriptor(process.env), requestContext);
        return;
      }
      if (
        request.method === "GET" &&
        (requestUrl.pathname === "/operator/launch" || requestUrl.pathname === "/operator/launch-dashboard")
      ) {
        sendHtml(response, 200, buildOperatorLaunchDashboardPage());
        return;
      }
      if (
        request.method === "GET" &&
        (requestUrl.pathname === "/operator/topups" || requestUrl.pathname === "/operator/admin")
      ) {
        sendHtml(response, 200, buildOperatorTopupPage());
        return;
      }
      if (
        request.method === "GET" &&
        (requestUrl.pathname === "/short/create" || requestUrl.pathname === "/short/create-video")
      ) {
        sendHtml(response, 200, buildShortPipelineCreatePage());
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/short-pipeline/video-pipes") {
        sendJson(response, 200, buildShortVideoPipeCatalog(), requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/channel-styles") {
        assertJsonContentType(request);
        const store = requireShortChannelStyleLibraryStore(shortChannelStyleLibraryStore);
        const body = await readJsonBody<ShortChannelStyleProfileInput>(request, maxBodyBytes);
        const record = store.saveProfile(body, clientFilter(authDecision.principal));
        sendJson(response, record.profile.status === "blocked" ? 422 : 201, {
          persisted: true,
          channelStyle: record.profile,
          storedChannelStyle: storedShortChannelStyleResponse(store, record)
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/short-pipeline/channel-styles") {
        const store = requireShortChannelStyleLibraryStore(shortChannelStyleLibraryStore);
        sendJson(response, 200, {
          persisted: true,
          channelStyles: store.list(clientFilter(authDecision.principal))
        }, requestContext);
        return;
      }
      const shortChannelStyleMatch = requestUrl.pathname.match(/^\/v1\/short-pipeline\/channel-styles\/([^/]+)$/);
      if (request.method === "GET" && shortChannelStyleMatch) {
        const store = requireShortChannelStyleLibraryStore(shortChannelStyleLibraryStore);
        const record = store.get(
          decodeURIComponent(shortChannelStyleMatch[1] ?? ""),
          clientFilter(authDecision.principal)
        );
        sendJson(response, record ? 200 : 404, record
          ? {
              persisted: true,
              channelStyle: record.profile,
              channelStyleInput: record.input,
              storedChannelStyle: storedShortChannelStyleResponse(store, record)
            }
          : { error: "Short channel-style profile not found." }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/conversation") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelineConversationRequestBody>(request, maxBodyBytes);
        const session = shortPipelineConversationEngine.buildSession(
          shortPipelineConversationInputFromBody(
            body,
            requestContext.requestId,
            shortChannelStyleLibraryStore,
            clientFilter(authDecision.principal)
          )
        );
        sendJson(response, session.plan.status === "blocked" ? 422 : 200, session, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/conversation-sessions") {
        assertJsonContentType(request);
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        const body = await readJsonBody<ShortPipelineConversationRequestBody>(request, maxBodyBytes);
        const session = shortPipelineConversationEngine.buildSession(
          shortPipelineConversationInputFromBody(
            body,
            requestContext.requestId,
            shortChannelStyleLibraryStore,
            clientFilter(authDecision.principal)
          )
        );
        const record = store.saveSession(session, clientFilter(authDecision.principal));
        sendJson(response, session.plan.status === "blocked" ? 422 : 201, {
          persisted: true,
          session: record.session,
          storedSession: storedShortPipelineSessionResponse(store, record)
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/short-pipeline/conversation-sessions") {
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        sendJson(response, 200, {
          persisted: true,
          sessions: store.list(clientFilter(authDecision.principal))
        }, requestContext);
        return;
      }
      const shortPipelineConversationSessionMatch = requestUrl.pathname.match(/^\/v1\/short-pipeline\/conversation-sessions\/([^/]+)$/);
      if (request.method === "GET" && shortPipelineConversationSessionMatch) {
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        const record = store.get(
          decodeURIComponent(shortPipelineConversationSessionMatch[1] ?? ""),
          clientFilter(authDecision.principal)
        );
        sendJson(response, record ? 200 : 404, record
          ? {
              persisted: true,
              session: record.session,
              storedSession: storedShortPipelineSessionResponse(store, record)
            }
          : { error: "Short-pipeline conversation session not found." }, requestContext);
        return;
      }
      const shortPipelineConversationSessionUiContractMatch =
        requestUrl.pathname.match(/^\/v1\/short-pipeline\/conversation-sessions\/([^/]+)\/ui-contract$/);
      if (request.method === "GET" && shortPipelineConversationSessionUiContractMatch) {
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        const record = store.get(
          decodeURIComponent(shortPipelineConversationSessionUiContractMatch[1] ?? ""),
          clientFilter(authDecision.principal)
        );
        const plan = record ? shortPipelinePlanFromStoredSession(record) : undefined;
        sendJson(response, record && plan ? 200 : 404, record && plan
          ? {
              persisted: true,
              sessionId: record.sessionId,
              uiContract: buildShortMvpUiContract(plan)
            }
          : { error: "Short-pipeline conversation session not found." }, requestContext);
        return;
      }
      const shortPipelineConversationSessionRenderMatch =
        requestUrl.pathname.match(/^\/v1\/short-pipeline\/conversation-sessions\/([^/]+)\/render-jobs$/);
      if (request.method === "POST" && shortPipelineConversationSessionRenderMatch) {
        assertJsonContentType(request);
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        const record = store.get(
          decodeURIComponent(shortPipelineConversationSessionRenderMatch[1] ?? ""),
          clientFilter(authDecision.principal)
        );
        if (!record) {
          sendJson(response, 404, { error: "Short-pipeline conversation session not found." }, requestContext);
          return;
        }
        let body = await readJsonBody<ShortPipelineConversationSessionRenderJobRequestBody>(request, maxBodyBytes);
        if (authDecision.principal?.kind === "user") {
          // Customers cannot approve their own review gate; the operator desk decides.
          const { reviewApprovalGate: strippedGate, reviewApprovalCheckpoints: strippedCheckpoints, ...sanitizedBody } = body;
          void strippedGate;
          void strippedCheckpoints;
          body = sanitizedBody;
        }
        const handoffBody = shortPipelineConversationSessionRenderJobBodyFromBody(body);
        const plan = shortPipelinePlanFromStoredSession(record);
        if (plan.status === "blocked") {
          throw new ShortPipelineRenderHandoffError(
            "Stored short-pipeline conversation session plan is blocked; correct product URL, brand-kit, or claim evidence before creating a render job."
          );
        }
        if (
          handoffBody.reviewApproval &&
          reviewInputCanQueueRender(handoffBody.reviewApproval) &&
          handoffBody.confirmRenderSubmission !== true
        ) {
          throw new ShortPipelineRenderHandoffError(
            "confirmRenderSubmission=true is required before approved short-pipeline session review evidence can queue a render job."
          );
        }
        const handoff = buildShortPipelineRenderHandoff({
          plan,
          ...(handoffBody.reviewApproval ? { reviewApproval: handoffBody.reviewApproval } : {}),
          ...(handoffBody.settings ? { settings: handoffBody.settings } : {}),
          ...(handoffBody.modelPreferences ? { modelPreferences: handoffBody.modelPreferences } : {}),
          ...(handoffBody.references ? { references: handoffBody.references } : {}),
          metadata: {
            ...handoffBody.metadata,
            shortPipelineSessionId: record.sessionId
          },
          ...(handoffBody.outputPath ? { outputPath: handoffBody.outputPath } : {}),
          ...(handoffBody.workDirectory ? { workDirectory: handoffBody.workDirectory } : {}),
          ...(handoffBody.artifactDirectory ? { artifactDirectory: handoffBody.artifactDirectory } : {}),
          ...(handoffBody.includeGeneratedAudioIntents !== undefined
            ? { includeGeneratedAudioIntents: handoffBody.includeGeneratedAudioIntents }
            : {}),
          ...(handoffBody.captionPreference ? { captionPreference: handoffBody.captionPreference } : {}),
          ...(handoffBody.audio ? { audio: handoffBody.audio } : {})
        });
        assertShortPipelineRenderHandoffAllowed(handoff);
        requestAdmission.assertAcceptable(handoff.request);
        const idempotencyKeyDigest = readIdempotencyKeyDigest(request);
        const requestFingerprint = idempotencyKeyDigest
          ? createRequestFingerprint({ sessionId: record.sessionId, body })
          : undefined;
        const normalizedRequest = normalizeRenderRequest(handoff.request, {
          requestId: requestContext.requestId,
          env: process.env
        });
        workspaceBillingGate.assertRenderAllowed({
          principal: authDecision.principal,
          request: normalizedRequest,
          requestId: requestContext.requestId,
          channel: "async"
        });
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const userRenderCharge = planUserRenderCharge({
          principal: authDecision.principal,
          store: userAccountStore,
          pricing: adminSettingsStore.pricing(),
          pipelineCost: adminSettingsStore.pipelineCost(),
          request: normalizedRequest
        });
        let commercialReservation: CommercialRenderReservation | undefined;
        let acceptedJobId: string | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          // Auto-run for customers skips the review pause; operators keep it.
          ...(customerAutoRunEnabled(authDecision.principal) ? {} : { reviewApproval: handoff.reviewApproval }),
          onAccepted: (acceptedSummary) => {
            acceptedJobId = acceptedSummary.jobId;
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          },

          onCanceledBeforeRun: () => {
            if (commercialReservation?.clientPolicyReservation) {
              clientPolicyGate.releaseRender({
                reservation: commercialReservation.clientPolicyReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
            if (commercialReservation?.workspaceBillingReservation) {
              workspaceBillingGate.releaseRender({
                reservation: commercialReservation.workspaceBillingReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
          }
        });
        if (userRenderCharge && !submission.idempotentReplay && chargeableSubmissionStatus(submission.summary.status)) {
          userAccountStore.chargeRender({
            userId: userRenderCharge.userId,
            jobId: submission.summary.jobId,
            credits: userRenderCharge.credits
          });
        }
        sendJson(response, 202, {
          shortPipelineSession: storedShortPipelineSessionResponse(store, record),
          shortPipeline: {
            ...handoff.summary,
            sessionId: record.sessionId
          },
          ...jobSummaryForPrincipal(submission.summary, authDecision.principal),
          ...(submission.idempotentReplay ? { idempotentReplay: true } : {}),
          ...(commercialReservation?.clientPolicyReservation
            ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
            : {}),
          ...(commercialReservation?.workspaceBillingReservation
            ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
            : {}),
          statusUrl: `/v1/render-jobs/${encodeURIComponent(submission.summary.jobId)}`
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/plan") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelinePlanRequestBody>(request, maxBodyBytes);
        const plan = shortPipelinePlanner.buildPlan(shortPipelinePlanInputFromBody(
          body,
          requestContext.requestId,
          shortChannelStyleLibraryStore,
          clientFilter(authDecision.principal)
        ));
        sendJson(response, plan.status === "blocked" ? 422 : 200, plan, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/ui-contract") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelinePlanRequestBody>(request, maxBodyBytes);
        const plan = shortPipelinePlanner.buildPlan(shortPipelinePlanInputFromBody(
          body,
          requestContext.requestId,
          shortChannelStyleLibraryStore,
          clientFilter(authDecision.principal)
        ));
        sendJson(response, plan.status === "blocked" ? 422 : 200, {
          plan,
          uiContract: buildShortMvpUiContract(plan)
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/long-form/director-ui-contract") {
        assertJsonContentType(request);
        const body = await readJsonBody<LongDirectorUiContractRequestBody>(request, maxBodyBytes);
        const longFormCreativeIntelligencePlan = longFormCreativeIntelligencePlanFromBody(body);
        const uiContract = buildLongDirectorUiContract(longFormCreativeIntelligencePlan);
        sendJson(response, longFormCreativeIntelligencePlan.status === "blocked" ? 422 : 200, {
          longFormCreativeIntelligencePlan,
          uiContract,
          releaseGateSummary: {
            canUseAsNoSpendLongDirectorUiContractEvidence: true,
            canSubmitToProviderNow: uiContract.outputContract.canSubmitToProviderNow,
            canReleaseToCustomerTraffic: false,
            releaseBlocker: "Long Director UI contract API is no-spend review-console evidence only; provider submission, paid long-form validation, artifact-bound manual review, and release approval remain separate gates."
          }
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/product-url-plan") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelineProductUrlPlanRequestBody>(request, maxBodyBytes);
        const productUrlBody = shortPipelineProductUrlPlanBodyFromBody(
          body,
          requestContext.requestId,
          shortChannelStyleLibraryStore,
          clientFilter(authDecision.principal)
        );
        const productUrl = productUrlBody.planInput.product?.productUrl;
        if (!productUrl) {
          throw new RenderRequestAdmissionError("Short pipeline product URL plan requires product.productUrl.");
        }
        const research = await productUrlResearcher.research({
          productUrl,
          ...(productUrlBody.planInput.userPrompt ? { userPrompt: productUrlBody.planInput.userPrompt } : {}),
          confirmLiveNetwork: productUrlBody.confirmLiveNetwork,
          ...(productUrlBody.maxProductUrlBytes ? { maxBytes: productUrlBody.maxProductUrlBytes } : {}),
          ...(productUrlBody.productResearchTimeoutMs ? { timeoutMs: productUrlBody.productResearchTimeoutMs } : {})
        });
        const safeResearch = safeProductUrlResearchSummary(research);
        if (research.status !== "ready" || !research.snapshot) {
          sendJson(response, 422, {
            error: "Product URL research is not ready for short-pipeline planning.",
            productUrlResearch: safeResearch
          }, requestContext);
          return;
        }
        const plan = shortPipelinePlanner.buildPlan({
          ...productUrlBody.planInput,
          product: {
            ...productUrlBody.planInput.product,
            snapshot: mergeProductUrlSnapshots(research.snapshot, productUrlBody.planInput.product?.snapshot)
          }
        });
        sendJson(response, plan.status === "blocked" ? 422 : 200, {
          productUrlResearch: safeResearch,
          plan
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/render-jobs") {
        assertJsonContentType(request);
        let body = await readJsonBody<ShortPipelineRenderJobRequestBody>(request, maxBodyBytes);
        if (authDecision.principal?.kind === "user") {
          const { reviewApprovalGate: strippedGate, reviewApprovalCheckpoints: strippedCheckpoints, ...sanitizedBody } = body;
          void strippedGate;
          void strippedCheckpoints;
          body = sanitizedBody;
        }
        const handoffBody = shortPipelineRenderJobBodyFromBody(
          body,
          requestContext.requestId,
          shortChannelStyleLibraryStore,
          clientFilter(authDecision.principal)
        );
        const plan = shortPipelinePlanner.buildPlan(handoffBody.planInput);
        if (plan.status === "blocked") {
          throw new ShortPipelineRenderHandoffError(
            "Short-pipeline plan is blocked; correct product URL, brand-kit, or claim evidence before creating a render job."
          );
        }
        if (
          handoffBody.reviewApproval &&
          reviewInputCanQueueRender(handoffBody.reviewApproval) &&
          handoffBody.confirmRenderSubmission !== true
        ) {
          throw new ShortPipelineRenderHandoffError(
            "confirmRenderSubmission=true is required before approved short-pipeline review evidence can queue a render job."
          );
        }
        const handoff = buildShortPipelineRenderHandoff({
          plan,
          ...(handoffBody.reviewApproval ? { reviewApproval: handoffBody.reviewApproval } : {}),
          ...(handoffBody.settings ? { settings: handoffBody.settings } : {}),
          ...(handoffBody.modelPreferences ? { modelPreferences: handoffBody.modelPreferences } : {}),
          ...(handoffBody.planInput.mediaReferences ? { mediaReferenceInputs: handoffBody.planInput.mediaReferences } : {}),
          ...(handoffBody.references ? { references: handoffBody.references } : {}),
          ...(handoffBody.metadata ? { metadata: handoffBody.metadata } : {}),
          ...(handoffBody.outputPath ? { outputPath: handoffBody.outputPath } : {}),
          ...(handoffBody.workDirectory ? { workDirectory: handoffBody.workDirectory } : {}),
          ...(handoffBody.artifactDirectory ? { artifactDirectory: handoffBody.artifactDirectory } : {}),
          ...(handoffBody.includeGeneratedAudioIntents !== undefined
            ? { includeGeneratedAudioIntents: handoffBody.includeGeneratedAudioIntents }
            : {}),
          ...(handoffBody.captionPreference ? { captionPreference: handoffBody.captionPreference } : {}),
          ...(handoffBody.audio ? { audio: handoffBody.audio } : {})
        });
        assertShortPipelineRenderHandoffAllowed(handoff);
        requestAdmission.assertAcceptable(handoff.request);
        const idempotencyKeyDigest = readIdempotencyKeyDigest(request);
        const requestFingerprint = idempotencyKeyDigest ? createRequestFingerprint(body) : undefined;
        const normalizedRequest = normalizeRenderRequest(handoff.request, {
          requestId: requestContext.requestId,
          env: process.env
        });
        workspaceBillingGate.assertRenderAllowed({
          principal: authDecision.principal,
          request: normalizedRequest,
          requestId: requestContext.requestId,
          channel: "async"
        });
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const userRenderCharge = planUserRenderCharge({
          principal: authDecision.principal,
          store: userAccountStore,
          pricing: adminSettingsStore.pricing(),
          pipelineCost: adminSettingsStore.pipelineCost(),
          request: normalizedRequest
        });
        let commercialReservation: CommercialRenderReservation | undefined;
        let acceptedJobId: string | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          // Auto-run for customers skips the review pause; operators keep it.
          ...(customerAutoRunEnabled(authDecision.principal) ? {} : { reviewApproval: handoff.reviewApproval }),
          onAccepted: (acceptedSummary) => {
            acceptedJobId = acceptedSummary.jobId;
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          },

          onCanceledBeforeRun: () => {
            if (commercialReservation?.clientPolicyReservation) {
              clientPolicyGate.releaseRender({
                reservation: commercialReservation.clientPolicyReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
            if (commercialReservation?.workspaceBillingReservation) {
              workspaceBillingGate.releaseRender({
                reservation: commercialReservation.workspaceBillingReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
          }
        });
        if (userRenderCharge && !submission.idempotentReplay && chargeableSubmissionStatus(submission.summary.status)) {
          userAccountStore.chargeRender({
            userId: userRenderCharge.userId,
            jobId: submission.summary.jobId,
            credits: userRenderCharge.credits
          });
        }
        sendJson(response, 202, {
          shortPipeline: handoff.summary,
          ...jobSummaryForPrincipal(submission.summary, authDecision.principal),
          ...(submission.idempotentReplay ? { idempotentReplay: true } : {}),
          ...(commercialReservation?.clientPolicyReservation
            ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
            : {}),
          ...(commercialReservation?.workspaceBillingReservation
            ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
            : {}),
          statusUrl: `/v1/render-jobs/${encodeURIComponent(submission.summary.jobId)}`
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/render-jobs") {
        sendJson(response, 200, {
          queue: jobManager.stats(),
          jobs: jobManager
            .list(clientFilter(authDecision.principal))
            .map((job) => jobSummaryForPrincipal(job, authDecision.principal))
        }, requestContext);
        return;
      }
      const jobReviewMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)\/review$/);
      if (request.method === "POST" && jobReviewMatch) {
        assertNotUserPrincipal(authDecision.principal, "Kiểm duyệt video do đội ngũ vận hành thực hiện — video của bạn sẽ được duyệt trong ít phút.");
        assertJsonContentType(request);
        const body = await readJsonBody<RenderJobReviewRequestBody>(request, maxBodyBytes);
        const reviewInput = renderJobReviewInputFromReviewBody(body);
        let commercialReservation: CommercialRenderReservation | undefined;
        const submission = jobManager.review(
          decodeURIComponent(jobReviewMatch[1] ?? ""),
          reviewInput,
          clientFilter(authDecision.principal),
          {
            onApprovedForRender: ({ request: approvedRequest }) => {
              commercialReservation = reserveCommercialRender({
                clientPolicyGate,
                workspaceBillingGate,
                principal: authDecision.principal,
                request: approvedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
          }
        );
        sendJson(response, submission ? 202 : 404, submission
          ? {
              ...jobSummaryForPrincipal(submission.summary, authDecision.principal),
              queuedForRender: submission.queuedForRender,
              ...(submission.approvedForExport !== undefined ? { approvedForExport: submission.approvedForExport } : {}),
              ...(commercialReservation?.clientPolicyReservation
                ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
                : {}),
              ...(commercialReservation?.workspaceBillingReservation
                ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
                : {})
            }
          : { error: "Render job not found." }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/account/register") {
        assertJsonContentType(request);
        const body = await readJsonBody<{ email?: string; password?: string; displayName?: string }>(request, maxBodyBytes);
        const registered = await userAccountStore.register({
          email: body.email ?? "",
          password: body.password ?? "",
          ...(body.displayName ? { displayName: body.displayName } : {})
        });
        // The session token travels in a response header: response bodies pass through the
        // secret redactor (which rightly swallows token-shaped fields), headers do not.
        sendJson(response, 201, { account: registered.user }, requestContext, {
          "X-CineJelly-Session-Token": registered.sessionToken
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/account/login") {
        assertJsonContentType(request);
        const body = await readJsonBody<{ email?: string; password?: string }>(request, maxBodyBytes);
        const loggedIn = await userAccountStore.login({ email: body.email ?? "", password: body.password ?? "" });
        sendJson(response, 200, { account: loggedIn.user }, requestContext, {
          "X-CineJelly-Session-Token": loggedIn.sessionToken
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/account/logout") {
        const sessionHeader = readHeader(request, "x-cinejelly-session");
        if (sessionHeader) {
          userAccountStore.logout(sessionHeader);
        }
        sendJson(response, 200, { status: "logged_out" }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/account/me") {
        const { userId } = requireUserPrincipal(authDecision.principal);
        const account = userAccountStore.me(userId);
        if (!account) {
          throw new UserAccountError("Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.", 401);
        }
        const studioContent = adminSettingsStore.studio();
        sendJson(response, 200, {
          account,
          packages: adminSettingsStore.packages(),
          usdToVnd: adminSettingsStore.usdToVnd(),
          renderPricing: adminSettingsStore.pricing(),
          // Metered pricing exposed as DERIVED credit rates (credits per render-second per tier),
          // never the raw Atlas USD cost — the customer can compute their clip's credit price
          // client-side without seeing supplier cost.
          pipelinePricing: buildPipelinePricingDescriptor(adminSettingsStore.pipelineCost(), process.env),
          refundPolicy: adminSettingsStore.refundPolicy(),
          topupInstructions: adminSettingsStore.topupBankInfo() ||
            "Chuyển khoản theo gói đã chọn rồi bấm 'Tôi đã chuyển khoản' — quản trị viên sẽ duyệt và cộng credits.",
          ...(studioContent.announcement ? { announcement: studioContent.announcement } : {}),
          ...(studioContent.featuredImages?.length ? { featuredImages: studioContent.featuredImages } : {})
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/account/statement") {
        const { userId } = requireUserPrincipal(authDecision.principal);
        sendJson(response, 200, { entries: userAccountStore.statementOf(userId), balanceCredits: userAccountStore.balanceOf(userId) }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/account/topups") {
        const { userId } = requireUserPrincipal(authDecision.principal);
        const configuredBankInfo = adminSettingsStore.topupBankInfo();
        if (!configuredBankInfo || /dien ngan hang|so tai khoan/i.test(configuredBankInfo)) {
          // The money path must never show a placeholder: block until the operator fills
          // the real bank account in .env (CINEJELLY_TOPUP_BANK_INFO).
          throw new UserAccountError(
            "Hệ thống chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ hỗ trợ (chủ hệ thống: điền CINEJELLY_TOPUP_BANK_INFO trong file .env).",
            503
          );
        }
        assertJsonContentType(request);
        const body = await readJsonBody<{ packageId?: string; note?: string }>(request, maxBodyBytes);
        const chosenPackage = adminSettingsStore.packages().find((candidate) => candidate.packageId === (body.packageId ?? ""));
        if (!chosenPackage) {
          throw new UserAccountError("Gói nạp không tồn tại.", 404);
        }
        const topup = userAccountStore.requestTopupForPackage({
          userId,
          creditPackage: chosenPackage,
          ...(body.note ? { userNote: body.note } : {})
        });
        sendJson(response, 201, {
          topup,
          instructions: configuredBankInfo
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/account/topups") {
        const { userId } = requireUserPrincipal(authDecision.principal);
        sendJson(response, 200, { topups: userAccountStore.topupsOf(userId) }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/redub/plans") {
        // Dịch phụ đề / thuyết minh lại video (ví dụ video tiếng Trung -> lồng tiếng Việt +
        // phụ đề nhiều nước). Khách đăng nhập trả phí cố định; key vận hành dùng tự do.
        // Mọi kiểm tra chặn (model, nguồn video) chạy TRƯỚC khi trừ tiền.
        if (!authDecision.principal) {
          throw new UserAccountError("Cần đăng nhập tài khoản để dùng chức năng này.", 401);
        }
        assertJsonContentType(request);
        const body = await readJsonBody<{
          uploadUri?: string;
          jobId?: string;
          sourceLanguage?: string;
          dubLanguage?: string;
          subtitleLanguages?: readonly string[];
          voiceStyle?: string;
          originalAudioTreatment?: string;
          acknowledgedCredits?: number;
          renderVideo?: boolean;
        }>(request, maxBodyBytes);
        const languagePattern = /^[a-z]{2}(-[a-z0-9]{2,8})?$/;
        const dubLanguage = typeof body.dubLanguage === "string" ? body.dubLanguage.trim().toLowerCase() : "";
        if (!languagePattern.test(dubLanguage)) {
          throw new UserAccountError("Thiếu hoặc sai ngôn ngữ thuyết minh (dubLanguage, ví dụ \"vi\").", 400);
        }
        const subtitleLanguages = (Array.isArray(body.subtitleLanguages) ? body.subtitleLanguages : [])
          .map((language) => String(language).trim().toLowerCase())
          .filter((language) => languagePattern.test(language))
          .slice(0, 5);
        const redubSourceLanguage =
          typeof body.sourceLanguage === "string" && languagePattern.test(body.sourceLanguage.trim().toLowerCase())
            ? body.sourceLanguage.trim().toLowerCase()
            : undefined;
        const redubVoiceStyle =
          typeof body.voiceStyle === "string" && body.voiceStyle.trim() ? body.voiceStyle.trim().slice(0, 200) : undefined;
        const redubAudioTreatment = body.originalAudioTreatment === "replace" ? ("replace" as const) : undefined;
        // Model bắt buộc — kiểm tra trước khi trừ tiền: hệ thống chưa bật thì không ai mất tiền.
        const redubSpeechModelId = (process.env.ATLASCLOUD_SPEECH_MODEL ?? "").trim();
        const redubLlmModelId = (process.env.ATLASCLOUD_LLM_MODEL ?? "").trim();
        if (!redubSpeechModelId || !redubLlmModelId) {
          throw new UserAccountError(
            "Tính năng dịch phụ đề/thuyết minh chưa được bật trên hệ thống (chủ hệ thống cần điền model nhận dạng giọng nói ATLASCLOUD_SPEECH_MODEL trong .env hoặc mục Model của Trung tâm quản trị).",
            503
          );
        }
        // renderVideo=true: không chỉ lập kế hoạch mà THI HÀNH luôn — đọc giọng thuyết minh
        // (ElevenLabs qua Atlas, tiếng Việt chuẩn) rồi trộn vào video (giảm nhỏ tiếng gốc hoặc
        // thay hẳn) + xuất file phụ đề. Cần model TTS — kiểm tra TRƯỚC khi trừ tiền.
        const redubRenderVideo = body.renderVideo === true;
        const redubTtsModelId = (process.env.ATLASCLOUD_TTS_MODEL ?? "").trim();
        const redubTtsVoice = (process.env.ATLASCLOUD_TTS_VOICE ?? "").trim();
        if (redubRenderVideo && !redubTtsModelId) {
          throw new UserAccountError(
            "Lồng tiếng thành video cần model đọc giọng (chủ hệ thống cần điền ATLASCLOUD_TTS_MODEL trong .env).",
            503
          );
        }
        // Nguồn video: file vừa tải lên (upload://...) hoặc video đã render xong của chính mình (jobId).
        let redubSourceUri: string | undefined;
        let redubProbePath: string | undefined;
        if (typeof body.uploadUri === "string" && body.uploadUri.trim()) {
          const trimmedUploadUri = body.uploadUri.trim();
          const uploadFileName = trimmedUploadUri.startsWith("upload://") ? trimmedUploadUri.slice("upload://".length) : "";
          if (!UPLOAD_FILE_NAME_PATTERN.test(uploadFileName)) {
            throw new UserAccountError("uploadUri không hợp lệ — dùng đúng mã upload:// trả về khi tải file lên.", 400);
          }
          const redubUploadsRoot = uploadsDirectoryFor(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
          const uploadedPath = resolve(redubUploadsRoot, uploadFileName);
          let uploadedStat;
          try {
            uploadedStat = await stat(uploadedPath);
          } catch {
            uploadedStat = undefined;
          }
          if (!uploadedPath.startsWith(resolve(redubUploadsRoot) + sep) || !uploadedStat?.isFile()) {
            throw new UserAccountError("File đã tải lên không tìm thấy — hãy tải video lên lại rồi thử tiếp.", 404);
          }
          redubSourceUri = trimmedUploadUri;
          redubProbePath = uploadedPath;
        } else if (typeof body.jobId === "string" && body.jobId.trim()) {
          const deliverablePath = jobManager.deliverablePathFor(body.jobId.trim(), clientFilter(authDecision.principal));
          const redubOutputRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
          const resolvedDeliverable = deliverablePath ? resolve(deliverablePath) : undefined;
          const deliverableInsideRoot = Boolean(
            resolvedDeliverable && (resolvedDeliverable === redubOutputRoot || resolvedDeliverable.startsWith(redubOutputRoot + sep))
          );
          let deliverableStat;
          try {
            deliverableStat = resolvedDeliverable ? await stat(resolvedDeliverable) : undefined;
          } catch {
            deliverableStat = undefined;
          }
          if (!resolvedDeliverable || !deliverableInsideRoot || !deliverableStat?.isFile()) {
            throw new UserAccountError("Video của job này chưa sẵn sàng hoặc không thuộc tài khoản của bạn.", 404);
          }
          redubSourceUri = resolvedDeliverable;
          redubProbePath = resolvedDeliverable;
        }
        if (!redubSourceUri) {
          throw new UserAccountError("Cần uploadUri (video đã tải lên) hoặc jobId (video đã render xong).", 400);
        }
        // Bill redub by the ACTUAL source duration (like a render) instead of a flat rate, and
        // hard-cap the length, so provider cost (STT + translation + TTS scale with duration)
        // can never outrun the credits collected. Probe is best-effort: if ffprobe can't read
        // the file, fall back to the flat minimum (the 25MB upload cap still bounds the source).
        let redubBillableSeconds = REDUB_FALLBACK_SECONDS;
        if (redubProbePath) {
          try {
            const probed = await new MediaInspector().probe(redubProbePath);
            if (probed.durationSeconds && probed.durationSeconds > 0) {
              if (probed.durationSeconds > REDUB_MAX_SOURCE_SECONDS) {
                throw new UserAccountError(
                  `Video dài quá ${Math.round(REDUB_MAX_SOURCE_SECONDS / 60)} phút — hãy cắt ngắn rồi thử lại (giới hạn để kiểm soát chi phí).`,
                  400
                );
              }
              redubBillableSeconds = probed.durationSeconds;
            }
          } catch (probeError) {
            if (probeError instanceof UserAccountError) {
              throw probeError;
            }
            // Probe unreadable: never fall back to the 5s minimum (a 25MB source can be minutes long,
            // so 5s would bill a long clip as 5s — charge-cheap/render-expensive). Bill the WORST-CASE
            // duration the source's byte size could hold at a low-bitrate floor, bounded by the 600s
            // cap, so a failed probe can only ever OVER-estimate, never undercharge.
            redubBillableSeconds = await worstCaseRedubSecondsFromBytes(redubProbePath);
          }
        }
        const redubActorKey =
          authDecision.principal.kind === "user" && authDecision.principal.userId
            ? `user:${authDecision.principal.userId}`
            : "operator";
        if (redubInFlight.has(redubActorKey)) {
          throw new UserAccountError("Bạn đang có một yêu cầu dịch/thuyết minh đang chạy — chờ xong rồi gửi tiếp.", 409);
        }
        // Phí cố định cho tài khoản khách, trừ TRƯỚC khi gọi provider; lỗi giữa chừng xử lý
        // theo chính sách hoàn tiền (auto -> hoàn ngay, manual -> vào hàng chờ admin duyệt).
        const redubId = `redub_${randomUUID()}`;
        let redubCharge: { readonly userId: string; readonly credits: number } | undefined;
        if (authDecision.principal.kind === "user" && authDecision.principal.userId) {
          const redubPricing = adminSettingsStore.pricing();
          // renderVideo thi hành thêm 1 lệnh đọc giọng TTS trả phí CHO TỪNG ĐOẠN lời thoại —
          // phụ phí nhân hệ số để giá khách trả luôn phủ đủ chi phí provider (audit tiền).
          // Khách vẫn xác nhận đúng con số cuối qua vòng acknowledgedCredits.
          const redubSurcharge = redubRenderVideo ? REDUB_RENDER_VIDEO_SURCHARGE : 1;
          const redubCredits = Math.max(
            redubPricing.minimumChargeCredits,
            Math.ceil(redubPricing.creditsPerRenderSecond * redubBillableSeconds * redubSurcharge)
          );
          // Honest pre-charge quote. Redub is billed by the SOURCE video's REAL duration, which the
          // browser cannot know until we probe the file here — so the first call NEVER charges: it
          // returns the true cost and the client must re-submit with acknowledgedCredits matching.
          // Nobody is ever charged an amount they were not shown and did not confirm first.
          const acknowledgedCredits = Number(body.acknowledgedCredits);
          if (!Number.isFinite(acknowledgedCredits) || acknowledgedCredits !== redubCredits) {
            sendJson(response, 200, {
              status: "quote",
              quote: {
                credits: redubCredits,
                billableSeconds: Math.round(redubBillableSeconds),
                creditsPerRenderSecond: redubPricing.creditsPerRenderSecond,
                minimumChargeCredits: redubPricing.minimumChargeCredits
              }
            }, requestContext);
            return;
          }
          const balanceCredits = userAccountStore.balanceOf(authDecision.principal.userId);
          if (balanceCredits < redubCredits) {
            throw new UserAccountError(
              `Số dư không đủ: dịch/thuyết minh cần ${redubCredits} credits, bạn đang có ${balanceCredits}. Hãy nạp thêm để tiếp tục.`,
              402
            );
          }
          userAccountStore.chargeRender({ userId: authDecision.principal.userId, jobId: redubId, credits: redubCredits });
          redubCharge = { userId: authDecision.principal.userId, credits: redubCredits };
        }
        redubInFlight.add(redubActorKey);
        // The redub result exists ONLY in this HTTP response body (nothing is persisted).
        // The work takes minutes — long enough that a browser fetch can time out or the
        // customer can close the tab. If that happens we must NOT keep them charged for a
        // result that now lands nowhere: wire the client disconnect to an abort so the
        // provider work stops and the catch below refunds/queues per policy.
        const redubAbort = new AbortController();
        const onRedubClientGone = (): void => {
          if (!response.writableEnded) {
            redubAbort.abort(new Error("Mất kết nối trước khi trả kết quả dịch/thuyết minh."));
          }
        };
        request.on("aborted", onRedubClientGone);
        response.on("close", onRedubClientGone);
        try {
          const localizationProvider = new AtlasCloudProvider(loadRuntimeSettings(process.env).atlasCloud, new ProviderCostLedger());
          const registeredAsset = await localizationProvider.registerAsset({ uri: redubSourceUri, kind: "video" }, redubAbort.signal);
          const activeAsset =
            registeredAsset.status === "active"
              ? registeredAsset
              : await localizationProvider.waitUntilActive(registeredAsset.assetId, redubAbort.signal);
          const redubAudioUri = activeAsset.uri?.startsWith("https://") ? activeAsset.uri : `asset://${activeAsset.assetId}`;
          const redubPlanner = new VideoRedubPlanner({ speechProvider: localizationProvider, llmProvider: localizationProvider });
          const redubPlan = await redubPlanner.plan(
            {
              projectId: redubId,
              audioUri: redubAudioUri,
              ...(redubSourceLanguage ? { sourceLanguage: redubSourceLanguage } : {}),
              dubLanguage,
              subtitleLanguages,
              ...(redubVoiceStyle ? { voiceStyle: redubVoiceStyle } : {}),
              ...(redubAudioTreatment ? { originalAudioTreatment: redubAudioTreatment } : {}),
              speechModelId: redubSpeechModelId,
              llmModelId: redubLlmModelId
            },
            redubAbort.signal
          );
          // renderVideo: thi hành lồng tiếng — đọc TTS từng đoạn, trộn vào video, lưu file
          // trong thư mục output (redub/<redubId>/). Kết quả là FILE thật, không chỉ text.
          let redubOutputs:
            | {
                readonly narrationTrackCount: number;
                readonly downloads: readonly { readonly kind: string; readonly language?: string; readonly url: string }[];
              }
            | undefined;
          if (redubRenderVideo) {
            if (!redubProbePath) {
              throw new Error("Không xác định được file video nguồn cục bộ để lồng tiếng.");
            }
            const redubDeliverDir = resolve(
              process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables",
              "redub",
              redubId
            );
            await mkdir(redubDeliverDir, { recursive: true });
            // Chủ sở hữu ghi xuống đĩa để route tải file kiểm tra được sau khi server khởi động lại.
            const redubOwnerId =
              authDecision.principal.kind === "user" && authDecision.principal.userId
                ? authDecision.principal.userId
                : "operator";
            await writeFile(join(redubDeliverDir, "owner.json"), JSON.stringify({ userId: redubOwnerId }), "utf8");
            const executed = await new RedubExecutor().execute({
              plan: redubPlan,
              sourceVideoPath: redubProbePath,
              workDirectory: redubDeliverDir,
              outputVideoPath: join(redubDeliverDir, "dubbed.mp4"),
              speechProvider: localizationProvider,
              ttsModelId: redubTtsModelId,
              ...(redubTtsVoice ? { ttsVoice: redubTtsVoice } : {}),
              signal: redubAbort.signal
            });
            const downloads: { readonly kind: string; readonly language?: string; readonly url: string }[] = [
              { kind: "dubbed_video", url: `/v1/redub/${redubId}/files/dubbed.mp4` }
            ];
            for (const track of redubPlan.subtitleTracks) {
              const subtitleName = `subtitles-${track.language}.srt`;
              await writeFile(join(redubDeliverDir, subtitleName), captionCuesToSrt(track.cues), "utf8");
              downloads.push({ kind: "subtitles", language: track.language, url: `/v1/redub/${redubId}/files/${subtitleName}` });
            }
            await writeFile(
              join(redubDeliverDir, "dub-script.txt"),
              redubPlan.ttsIntents.map((intent) => intent.prompt).join("\n\n"),
              "utf8"
            );
            downloads.push({ kind: "dub_script", url: `/v1/redub/${redubId}/files/dub-script.txt` });
            redubOutputs = { narrationTrackCount: executed.narrationTrackCount, downloads };
          }
          if (redubAbort.signal.aborted || response.writableEnded || response.destroyed) {
            // Client vanished during the work: we cannot deliver the result, so treat it as
            // a failure and let the catch refund/queue instead of silently keeping the money.
            throw redubAbort.signal.reason ?? new Error("Không gửi được kết quả dịch/thuyết minh (mất kết nối).");
          }
          sendJson(response, 200, {
            redubId,
            sourceLanguage: redubPlan.sourceLanguage,
            dubLanguage: redubPlan.dubLanguage,
            summary: redubPlan.summary,
            originalAudioTreatment: redubPlan.originalAudioTreatment,
            dubScript: redubPlan.ttsIntents.map((intent) => intent.prompt).join("\n\n"),
            subtitles: redubPlan.subtitleTracks.map((track) => ({
              language: track.language,
              cueCount: track.cues.length,
              srt: captionCuesToSrt(track.cues)
            })),
            ...(redubOutputs ? { outputs: redubOutputs } : {}),
            ...(redubCharge
              ? { creditsCharged: redubCharge.credits, balanceCredits: userAccountStore.balanceOf(redubCharge.userId) }
              : {})
          }, requestContext);
          return;
        } catch (error) {
          if (redubCharge) {
            // Match the render settlement policy exactly: auto refunds, manual queues, and
            // "off" keeps the credits (no refund, no queue) — the redub charge must never be
            // more refundable than a failed render under the same policy.
            const redubPolicy = adminSettingsStore.refundPolicy();
            if (redubPolicy === "auto") {
              userAccountStore.refundRender({ userId: redubCharge.userId, jobId: redubId, reason: "dịch/thuyết minh bị lỗi" });
            } else if (redubPolicy === "manual") {
              userAccountStore.queueRefundRequest({ userId: redubCharge.userId, jobId: redubId, reason: "dịch/thuyết minh bị lỗi" });
            }
          }
          throw error;
        } finally {
          request.removeListener("aborted", onRedubClientGone);
          response.removeListener("close", onRedubClientGone);
          redubInFlight.delete(redubActorKey);
        }
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/account/change-password") {
        const { userId } = requireUserPrincipal(authDecision.principal);
        assertJsonContentType(request);
        const body = await readJsonBody<{ currentPassword?: string; newPassword?: string }>(request, maxBodyBytes);
        const changed = await userAccountStore.changePassword({
          userId,
          currentPassword: body.currentPassword ?? "",
          newPassword: body.newPassword ?? ""
        });
        sendJson(response, 200, { status: "password_changed" }, requestContext, {
          "X-CineJelly-Session-Token": changed.sessionToken
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/admin/accounts/reset-password") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to reset passwords.");
        assertJsonContentType(request);
        const body = await readJsonBody<{ email?: string }>(request, maxBodyBytes);
        const reset = await userAccountStore.adminResetPassword({ email: body.email ?? "" });
        // The temporary password must reach the operator; it travels via header because
        // JSON bodies pass through the secret redactor (which rightly eats password fields).
        sendJson(response, 200, { status: "password_reset" }, requestContext, {
          "X-CineJelly-Temporary-Password": reset.temporaryPassword
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/settings") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for admin settings.");
        sendJson(response, 200, { settings: adminSettingsStore.snapshot() }, requestContext);
        return;
      }
      if (request.method === "PUT" && requestUrl.pathname === "/v1/admin/settings") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to change settings.");
        assertJsonContentType(request);
        const patch = await readJsonBody<Record<string, unknown>>(request, maxBodyBytes);
        adminSettingsStore.update(patch, "operator-desk");
        sendJson(response, 200, { settings: adminSettingsStore.snapshot() }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/atlas-pricing") {
        // "Kiểm tra giá Atlas realtime": reads Atlas Cloud's PUBLIC pricing page on demand (no API
        // key, no billable call) so the operator can spot Atlas promos/price moves and retune the
        // customer-facing rate. On any read/parse failure we return 502 with the page link so the
        // operator can check manually — never a fabricated price.
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for Atlas pricing.");
        try {
          const pricing = await readAtlasPricingCached(Date.now());
          sendJson(response, 200, pricing, requestContext);
        } catch (error) {
          const message =
            error instanceof AtlasPricingProbeError
              ? error.message
              : "Không đọc được giá Atlas ngay lúc này.";
          sendJson(response, 502, { error: message, sourceUrl: ATLAS_PRICING_PAGE_URL }, requestContext);
        }
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/refunds") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for the refund queue.");
        sendJson(response, 200, { pending: userAccountStore.pendingRefundRequests() }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/operator-holds") {
        // Jobs held because of an admin-side/provider problem — the operator's attention
        // queue. Full internal reasons are shown here (operator-only), never to customers.
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for the operator-hold queue.");
        sendJson(response, 200, { holds: jobManager.listOperatorHolds() }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/admin/operator-holds/retry") {
        // "Thử lại ngay": after fixing the config (e.g. the API key), push held jobs back
        // into the queue immediately instead of waiting for the next sweep. Optional jobId
        // retries just one; omit it to retry all.
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to retry held jobs.");
        assertJsonContentType(request);
        const body = await readJsonBody<{ jobId?: string }>(request, maxBodyBytes);
        const requeued = body.jobId ? jobManager.retryOperatorHolds(body.jobId) : jobManager.retryOperatorHolds();
        sendJson(response, 200, { requeued }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/admin/refunds/decide") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to decide refunds.");
        assertJsonContentType(request);
        const body = await readJsonBody<{ refundRequestId?: string; approve?: boolean }>(request, maxBodyBytes);
        const decided = userAccountStore.decideRefundRequest({
          refundRequestId: body.refundRequestId ?? "",
          approve: body.approve === true
        });
        sendJson(response, 200, { refundRequest: decided }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/accounts/lookup") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for customer lookup.");
        const lookup = userAccountStore.adminLookup(requestUrl.searchParams.get("email") ?? "");
        sendJson(response, 200, lookup, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/revenue-summary") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for the revenue summary.");
        sendJson(response, 200, { revenue: userAccountStore.revenueSummary() }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/topups") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to review top-ups.");
        sendJson(response, 200, { pending: userAccountStore.pendingTopups() }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/admin/topups/decide") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to decide top-ups.");
        assertJsonContentType(request);
        const body = await readJsonBody<{ topupId?: string; approve?: boolean; note?: string }>(request, maxBodyBytes);
        const decided = userAccountStore.decideTopup({
          topupId: body.topupId ?? "",
          approve: body.approve === true,
          ...(body.note ? { decisionNote: body.note } : {})
        });
        sendJson(response, 200, { topup: decided }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/admin/credits/adjust") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required to adjust credits.");
        assertJsonContentType(request);
        const body = await readJsonBody<{ email?: string; credits?: number; note?: string }>(request, maxBodyBytes);
        const account = userAccountStore.adminAdjust({
          email: body.email ?? "",
          credits: Number(body.credits ?? 0),
          ...(body.note ? { note: body.note } : {})
        });
        sendJson(response, 200, { account }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/uploads") {
        const declaredName = readHeader(request, "x-file-name") ?? "";
        const extensionMatch = declaredName.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
        const extension = extensionMatch?.[1] === "jpeg" ? "jpg" : extensionMatch?.[1];
        const kind = extension ? UPLOAD_KIND_BY_EXTENSION[extension] : undefined;
        if (!extension || !kind) {
          sendJson(response, 415, {
            error: "Unsupported upload type. Allowed: png, jpg, jpeg, webp, mp4, mov, mp3, wav, m4a (send the original file name in the X-File-Name header)."
          }, requestContext);
          return;
        }
        // Acquire a slot BEFORE buffering the body, so concurrent uploads (and their memory) are bounded.
        const uploadLease = uploadGate.tryAcquire();
        if (!uploadLease.allowed) {
          response.setHeader("Retry-After", String(uploadLease.retryAfterSeconds));
          sendJson(response, 503, { error: "Hệ thống đang bận nhận tệp tải lên — vui lòng thử lại sau giây lát." }, requestContext);
          return;
        }
        try {
        const uploadMaxBytes = readPositiveInteger(process.env.CINEJELLY_UPLOAD_MAX_BYTES, DEFAULT_UPLOAD_MAX_BYTES);
        const body = await readRawBody(request, uploadMaxBytes);
        if (body.length === 0) {
          sendJson(response, 400, { error: "Upload body is empty." }, requestContext);
          return;
        }
        const uploadsDir = uploadsDirectoryFor(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
        const storedFileName = `up_${randomBytes(16).toString("hex")}.${extension}`;
        try {
          await mkdir(uploadsDir, { recursive: true });
          // Disk-exhaustion guard: reject when the whole uploads directory is at its size or
          // file-count ceiling, so no account (even after self-registering) can fill the disk.
          const uploadsTotalMaxBytes = readPositiveInteger(
            process.env.CINEJELLY_UPLOADS_TOTAL_MAX_BYTES,
            DEFAULT_UPLOADS_TOTAL_MAX_BYTES
          );
          const usage = await ensureUploadsUsage(uploadsDir);
          const uploaderId = authDecision.principal && authDecision.principal.kind === "user" ? authDecision.principal.userId : undefined;
          if (usage.fileCount >= DEFAULT_UPLOADS_MAX_FILES || usage.totalBytes + body.length > uploadsTotalMaxBytes) {
            sendJson(response, 507, {
              error: "Kho lưu trữ tạm đã đầy — chủ hệ thống cần dọn thư mục uploads. Vui lòng thử lại sau."
            }, requestContext);
            return;
          }
          const perUserMaxBytes = readPositiveInteger(process.env.CINEJELLY_UPLOADS_PER_USER_MAX_BYTES, DEFAULT_UPLOADS_PER_USER_MAX_BYTES);
          if (uploaderId && (uploadsUsage.perUserBytes.get(uploaderId) ?? 0) + body.length > perUserMaxBytes) {
            sendJson(response, 507, {
              error: "Bạn đã đạt hạn mức dung lượng tải lên của tài khoản — hãy dùng bớt file cũ hoặc liên hệ hỗ trợ."
            }, requestContext);
            return;
          }
          await writeFile(join(uploadsDir, storedFileName), body);
          recordUpload(uploaderId, body.length);
        } catch (uploadError) {
          // Never leak a raw filesystem error (which carries absolute local paths) to a customer.
          void uploadError;
          sendJson(response, 500, { error: "Không lưu được tệp tải lên. Vui lòng thử lại sau." }, requestContext);
          return;
        }
        sendJson(response, 201, {
          status: "uploaded",
          kind,
          // Opaque handle (no server paths): the render pipeline resolves it back to the
          // stored file and uploads the bytes to the provider, so no public host is needed.
          uri: buildUploadUri(storedFileName),
          fileName: storedFileName,
          byteSize: body.length
        }, requestContext);
        return;
        } finally {
          uploadLease.release();
        }
      }
      const uploadedFileMatch = requestUrl.pathname.match(/^\/v1\/uploads\/([^/]+)$/);
      if (request.method === "GET" && uploadedFileMatch) {
        const requestedName = decodeURIComponent(uploadedFileMatch[1] ?? "");
        const requestedExtension = requestedName.split(".").pop() ?? "";
        const contentType = UPLOAD_CONTENT_TYPES[requestedExtension];
        if (!UPLOAD_FILE_NAME_PATTERN.test(requestedName) || !contentType) {
          sendJson(response, 404, { error: "Uploaded file not found." }, requestContext);
          return;
        }
        const uploadsRoot = uploadsDirectoryFor(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
        const uploadedPath = resolve(uploadsRoot, requestedName);
        if (!uploadedPath.startsWith(uploadsRoot + sep)) {
          sendJson(response, 404, { error: "Uploaded file not found." }, requestContext);
          return;
        }
        let uploadedStat;
        try {
          uploadedStat = await stat(uploadedPath);
        } catch {
          sendJson(response, 404, { error: "Uploaded file not found." }, requestContext);
          return;
        }
        if (!uploadedStat.isFile()) {
          sendJson(response, 404, { error: "Uploaded file not found." }, requestContext);
          return;
        }
        sendVideoStream(response, uploadedPath, uploadedStat.size, { contentType, inline: true });
        return;
      }
      // ---- Phim dài tập (series) — bề mặt vận hành: mọi tập render qua đầy đủ cổng chi phí/duyệt.
      // Đang gate bằng key vận hành: tài khoản khách chưa có surface billing cho series, nên KHÔNG
      // tồn tại đường nào để khách chạy series không bill (audit tiền).
      const seriesIdMatch = requestUrl.pathname.match(/^\/v1\/series\/([A-Za-z0-9_-]{1,120})$/);
      const seriesNextMatch = requestUrl.pathname.match(/^\/v1\/series\/([A-Za-z0-9_-]{1,120})\/episodes\/next(\/preview)?$/);
      if (requestUrl.pathname === "/v1/series" || seriesIdMatch || seriesNextMatch) {
        if (!authDecision.principal) {
          throw new UserAccountError("Cần đăng nhập tài khoản để dùng chức năng phim dài tập.", 401);
        }
        const seriesUserId =
          authDecision.principal.kind === "user" && authDecision.principal.userId
            ? authDecision.principal.userId
            : undefined;
        // Sở hữu: khách chỉ thấy/chạy series của chính mình; key vận hành thấy tất cả.
        const assertSeriesOwnership = (record: { readonly ownerUserId?: string } | undefined): void => {
          if (!record || (seriesUserId && record.ownerUserId !== seriesUserId)) {
            throw new UserAccountError("Series không tồn tại.", 404);
          }
        };
        const seriesOutputRoot = process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables";
        const seriesStore = new SeriesContinuityStore({ outputRoot: seriesOutputRoot });
        const composeOnlyDirector = new SeriesEpisodeDirector({
          director: { run: async () => { throw new Error("compose-only series director was asked to render"); } },
          store: seriesStore
        });
        if (request.method === "POST" && requestUrl.pathname === "/v1/series") {
          assertJsonContentType(request);
          const body = await readJsonBody<Partial<SeriesDramaRequest>>(request, maxBodyBytes);
          if (typeof body.premise !== "string" || !Array.isArray(body.cast)) {
            throw new UserAccountError("Body cần premise (chuỗi) và cast (mảng nhân vật).", 400);
          }
          // Namespace the seriesId PER OWNER so a customer can never collide with (read or squat)
          // another tenant's series by supplying/guessing an id — the client-chosen id is a slug
          // INSIDE the owner's namespace, never a global key (security audit: cross-tenant read).
          const namespacedSeriesId = seriesUserId
            ? `u${seriesUserId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}_${
                (typeof body.seriesId === "string" ? body.seriesId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) : "") ||
                createStableId("s", `${body.premise}:${body.episodeCount ?? ""}`)
              }`
            : body.seriesId;
          const seriesRequestBody: SeriesDramaRequest = {
            ...(body as SeriesDramaRequest),
            ...(namespacedSeriesId ? { seriesId: namespacedSeriesId } : {})
          };
          // planSeriesDrama tự validate sâu (số tập 1-200, độ dài tập 15-480s, cast hợp lệ, URI an toàn).
          const record = await composeOnlyDirector.startSeries(seriesRequestBody, seriesUserId);
          // The returned record may be a PRE-EXISTING series (create is idempotent by id). Only echo
          // it when the caller actually owns it, so a namespace/id collision can never leak another
          // owner's cast/metadata.
          const createdOwnerOk = seriesUserId ? record.ownerUserId === seriesUserId : !record.ownerUserId;
          if (!createdOwnerOk) {
            throw new UserAccountError("Series ID này đã tồn tại, hãy chọn tên khác.", 409);
          }
          sendJson(response, 201, {
            seriesId: record.seriesId,
            episodeCount: record.request.episodeCount,
            episodeDurationSeconds: record.request.episodeDurationSeconds,
            cast: record.cast.map((member) => ({ characterId: member.characterId, name: member.name, castRole: member.castRole })),
            recordedEpisodes: record.episodeStates.length,
            createdAt: record.createdAt
          }, requestContext);
          return;
        }
        if (request.method === "GET" && seriesIdMatch) {
          const record = await seriesStore.load(seriesIdMatch[1] ?? "");
          assertSeriesOwnership(record);
          sendJson(response, 200, record, requestContext);
          return;
        }
        if (request.method === "POST" && seriesNextMatch) {
          const seriesId = seriesNextMatch[1] ?? "";
          const previewOnly = Boolean(seriesNextMatch[2]);
          assertSeriesOwnership(await seriesStore.load(seriesId));
          const composed = await composeOnlyDirector.composeNextEpisode(seriesId);
          if (previewOnly) {
            // Không tốn tiền: trả brief tập kế tiếp (kèm recap thật) để duyệt trước khi render.
            sendJson(response, 200, {
              seriesId,
              episodeNumber: composed.episodeNumber,
              userInput: composed.request.userInput,
              settings: composed.request.settings,
              metadata: composed.request.metadata,
              referenceCount: composed.request.references?.length ?? 0
            }, requestContext);
            return;
          }
          assertJsonContentType(request);
          const body = await readJsonBody<{ metadata?: Record<string, string>; acknowledgedCredits?: number }>(request, maxBodyBytes);
          // Khách không được tự tiêm metadata (vd tự duyệt storyboard); operator thì được.
          const episodeRequest = {
            ...composed.request,
            metadata: {
              ...(composed.request.metadata ?? {}),
              ...(seriesUserId ? {} : body.metadata ?? {}),
              // Tập phim của khách: brief đã được xem trước + xác nhận giá; storyboard nội bộ được
              // đóng dấu duyệt để render đồng bộ không kẹt gate vận hành (cost gate vẫn nguyên).
              ...(seriesUserId ? { storyboardApproval: "operator_approved" } : {})
            }
          };
          const normalizedEpisode = normalizeRenderRequest(episodeRequest, {
            requestId: requestContext.requestId,
            env: process.env
          });
          requestAdmission.assertAcceptable(normalizedEpisode);
          // Khách: báo giá trước — chỉ trừ tiền khi client xác nhận đúng con số (như redub).
          let episodeCharge: { readonly userId: string; readonly credits: number } | undefined;
          if (seriesUserId) {
            episodeCharge = planUserRenderCharge({
              principal: authDecision.principal,
              store: userAccountStore,
              pricing: adminSettingsStore.pricing(),
              pipelineCost: adminSettingsStore.pipelineCost(),
              request: normalizedEpisode
            });
            if (episodeCharge && Number(body.acknowledgedCredits) !== episodeCharge.credits) {
              sendJson(response, 200, {
                status: "quote",
                seriesId,
                episodeNumber: composed.episodeNumber,
                quote: { credits: episodeCharge.credits }
              }, requestContext);
              return;
            }
          }
          // Serialize renders for ONE series: a second episode render while one is running is
          // rejected here, so two confirmed submits can never both charge + spend on the same
          // not-yet-recorded episode (the load-modify-write duplicate guard alone would let both
          // through). This runs BEFORE the charge, so a rejected concurrent request never pays.
          if (seriesRenderInFlight.has(seriesId)) {
            throw new UserAccountError("Series này đang render một tập — chờ xong rồi gửi tiếp.", 409);
          }
          const episodeLease = syncRenderGate.tryAcquire();
          if (!episodeLease.allowed) {
            sendJson(response, episodeLease.statusCode, {
              error: episodeLease.message,
              retryAfterSeconds: episodeLease.retryAfterSeconds
            }, requestContext, retryAfterHeaders(episodeLease.retryAfterSeconds));
            return;
          }
          seriesRenderInFlight.add(seriesId);
          // Unique-per-ATTEMPT job id (like sync_<requestId>/redub_<uuid>): the episode number only
          // advances on success, so a stable id would let a second FAILED-then-retried attempt reuse
          // the same job — where refund fires only once per job id, silently double-charging the
          // retry (money audit HIGH). A per-attempt id pairs each charge with its own refund.
          const episodeJobId = `series_${seriesId}_ep${composed.episodeNumber}_${requestContext.requestId}`;
          if (episodeCharge) {
            userAccountStore.chargeRender({ userId: episodeCharge.userId, jobId: episodeJobId, credits: episodeCharge.credits });
          }
          try {
            const episodeRuntime = createDirectorRuntime();
            const episodeResult = await episodeRuntime.director.run(normalizedEpisode, requestLifecycle.signal);
            const episodeArtifactDirectory =
              normalizedEpisode.artifactDirectory || join(normalizedEpisode.workDirectory || ".", "artifacts");
            const episodeArtifacts = await artifactStore.writeRunArtifacts({
              result: episodeResult,
              costLedger: episodeRuntime.ledger.list(),
              artifactDirectory: episodeArtifactDirectory
            });
            const updatedRecord = await composeOnlyDirector.recordRenderedEpisode(
              seriesId,
              composed.episodeNumber,
              normalizedEpisode,
              episodeResult
            );
            sendJson(response, 200, {
              seriesId,
              episodeNumber: composed.episodeNumber,
              projectId: episodeResult.projectId,
              recordedEpisodes: updatedRecord.episodeStates.length,
              episodeState: updatedRecord.episodeStates[updatedRecord.episodeStates.length - 1],
              ...(episodeCharge
                ? { creditsCharged: episodeCharge.credits, balanceCredits: userAccountStore.balanceOf(episodeCharge.userId) }
                : {}),
              artifacts: toApiProjectArtifactBundle(episodeArtifacts)
            }, requestContext);
            return;
          } catch (episodeError) {
            // Tập lỗi: hoàn credits theo đúng chính sách chung (auto hoàn ngay / manual vào hàng chờ).
            if (episodeCharge) {
              const episodePolicy = adminSettingsStore.refundPolicy();
              if (episodePolicy === "auto") {
                userAccountStore.refundRender({ userId: episodeCharge.userId, jobId: episodeJobId, reason: "tập phim render lỗi" });
              } else if (episodePolicy === "manual") {
                userAccountStore.queueRefundRequest({ userId: episodeCharge.userId, jobId: episodeJobId, reason: "tập phim render lỗi" });
              }
            }
            throw episodeError;
          } finally {
            episodeLease.release();
            seriesRenderInFlight.delete(seriesId);
          }
        }
        throw new UserAccountError("Route series không hỗ trợ method này.", 404);
      }
      const redubFileMatch = requestUrl.pathname.match(/^\/v1\/redub\/(redub_[0-9a-f-]{36})\/files\/([^/]+)$/);
      if (request.method === "GET" && redubFileMatch) {
        // Tải kết quả lồng tiếng: chỉ chủ sở hữu (owner.json ghi lúc render) hoặc key vận hành.
        if (!authDecision.principal) {
          sendJson(response, 401, { error: "Cần đăng nhập để tải kết quả lồng tiếng." }, requestContext);
          return;
        }
        const redubFileId = redubFileMatch[1] ?? "";
        const redubFileName = decodeURIComponent(redubFileMatch[2] ?? "");
        if (!REDUB_DOWNLOADABLE_FILE.test(redubFileName)) {
          sendJson(response, 404, { error: "File lồng tiếng không tồn tại." }, requestContext);
          return;
        }
        const redubFilesRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables", "redub");
        const redubFileDir = resolve(redubFilesRoot, redubFileId);
        const redubFilePath = resolve(redubFileDir, redubFileName);
        if (!redubFileDir.startsWith(redubFilesRoot + sep) || !redubFilePath.startsWith(redubFileDir + sep)) {
          sendJson(response, 404, { error: "File lồng tiếng không tồn tại." }, requestContext);
          return;
        }
        let redubOwner: string | undefined;
        try {
          const ownerRaw = JSON.parse(readFileSync(join(redubFileDir, "owner.json"), "utf8")) as { userId?: unknown };
          redubOwner = typeof ownerRaw.userId === "string" ? ownerRaw.userId : undefined;
        } catch {
          redubOwner = undefined;
        }
        const isOperatorPrincipal = authDecision.principal.kind !== "user";
        const isOwner =
          authDecision.principal.kind === "user" && Boolean(authDecision.principal.userId) &&
          authDecision.principal.userId === redubOwner;
        if (!redubOwner || (!isOwner && !isOperatorPrincipal)) {
          sendJson(response, 404, { error: "File lồng tiếng không tồn tại." }, requestContext);
          return;
        }
        let redubFileStat;
        try {
          redubFileStat = await stat(redubFilePath);
        } catch {
          redubFileStat = undefined;
        }
        if (!redubFileStat?.isFile()) {
          sendJson(response, 404, { error: "File lồng tiếng không tồn tại." }, requestContext);
          return;
        }
        if (redubFileName.endsWith(".mp4")) {
          sendVideoStream(response, redubFilePath, redubFileStat.size);
        } else {
          response.writeHead(200, {
            "Content-Type": redubFileName.endsWith(".srt") ? "text/plain; charset=utf-8" : "text/plain; charset=utf-8",
            "Content-Length": redubFileStat.size,
            "Content-Disposition": `attachment; filename="${redubFileName}"`
          });
          createReadStream(redubFilePath).pipe(response);
        }
        return;
      }
      const jobDeliverableMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)\/deliverable$/);
      if (request.method === "GET" && jobDeliverableMatch) {
        const deliverablePath = jobManager.deliverablePathFor(
          decodeURIComponent(jobDeliverableMatch[1] ?? ""),
          clientFilter(authDecision.principal)
        );
        const outputRoot = resolve(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
        const resolvedPath = deliverablePath ? resolve(deliverablePath) : undefined;
        const insideOutputRoot = Boolean(
          resolvedPath && (resolvedPath === outputRoot || resolvedPath.startsWith(outputRoot + sep))
        );
        if (!resolvedPath || !insideOutputRoot) {
          sendJson(response, 404, { error: "Render job deliverable not found." }, requestContext);
          return;
        }
        let deliverableStat;
        try {
          deliverableStat = await stat(resolvedPath);
        } catch {
          sendJson(response, 404, { error: "Render job deliverable not found." }, requestContext);
          return;
        }
        if (!deliverableStat.isFile()) {
          sendJson(response, 404, { error: "Render job deliverable not found." }, requestContext);
          return;
        }
        sendVideoStream(response, resolvedPath, deliverableStat.size);
        return;
      }
      const jobMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobManager.get(decodeURIComponent(jobMatch[1] ?? ""), clientFilter(authDecision.principal));
        sendJson(
          response,
          job ? 200 : 404,
          job ? jobSummaryForPrincipal(job, authDecision.principal) : { error: "Render job not found." },
          requestContext
        );
        return;
      }
      if (request.method === "DELETE" && jobMatch) {
        const job = jobManager.cancel(decodeURIComponent(jobMatch[1] ?? ""), clientFilter(authDecision.principal));
        sendJson(
          response,
          job ? 202 : 404,
          job ? jobSummaryForPrincipal(job, authDecision.principal) : { error: "Render job not found." },
          requestContext
        );
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/client-policy") {
        assertDeploymentPrincipal(authDecision.principal);
        sendJson(response, 200, clientPolicyGate.summary(), requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/operator-launch-ui-contract") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for operator launch UI diagnostics.");
        sendJson(response, 200, {
          uiContract: buildOperatorLaunchUiContract(readOperatorLaunchUiReports())
        }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/workspace-billing") {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for workspace billing diagnostics.");
        sendJson(response, 200, workspaceBillingGate.summary(), requestContext);
        return;
      }
      const renderProviderLeaseOperation = renderProviderLeaseOperationFor(requestUrl.pathname);
      if (renderProviderLeaseOperation) {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for render-provider lease service operations.");
        if (!renderProviderLeaseService) {
          throw new ApiClientPolicyError(
            "CINEJELLY_RENDER_PROVIDER_LEASE_PATH is required before render-provider lease service operations can be used.",
            503
          );
        }
        if (request.method === "POST") {
          assertJsonContentType(request);
        }
        const body = request.method === "POST" ? await readJsonBody<unknown>(request, maxBodyBytes) : undefined;
        const serviceResponse = await renderProviderLeaseService.handle({
          method: request.method,
          operation: renderProviderLeaseOperation,
          searchParams: requestUrl.searchParams,
          ...(body !== undefined ? { body } : {})
        });
        sendJson(response, serviceResponse.statusCode, serviceResponse.payload, requestContext);
        return;
      }
      const productionGraphResumeQueueOperation = productionGraphResumeQueueOperationFor(requestUrl.pathname);
      if (productionGraphResumeQueueOperation) {
        assertDeploymentPrincipal(authDecision.principal, "Deployment API token is required for Production Graph resume queue operations.");
        if (!productionGraphResumeQueueService) {
          throw new ApiClientPolicyError(
            "CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_PATH is required before Production Graph resume queue operations can be used.",
            503
          );
        }
        if (request.method === "POST") {
          assertJsonContentType(request);
        }
        const body = request.method === "POST" ? await readJsonBody<unknown>(request, maxBodyBytes) : undefined;
        const serviceResponse = await productionGraphResumeQueueService.handle({
          method: request.method,
          operation: productionGraphResumeQueueOperation,
          ...(body !== undefined ? { body } : {})
        });
        sendJson(response, serviceResponse.statusCode, serviceResponse.payload, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render-jobs") {
        assertNotUserPrincipal(authDecision.principal, "Tài khoản khách tạo video trong Studio (trang chính); endpoint này dành cho vận hành.");
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        const renderBody = renderRequestBody(body);
        const reviewApproval = renderJobReviewInputFromRenderBody(body);
        const preExportReviewApproval = preExportReviewInputFromRenderBody(body);
        requestAdmission.assertAcceptable(renderBody);
        const idempotencyKeyDigest = readIdempotencyKeyDigest(request);
        const requestFingerprint = idempotencyKeyDigest ? createRequestFingerprint(body) : undefined;
        const normalizedRequest = normalizeRenderRequest(renderBody, {
          requestId: requestContext.requestId,
          env: process.env
        });
        workspaceBillingGate.assertRenderAllowed({
          principal: authDecision.principal,
          request: normalizedRequest,
          requestId: requestContext.requestId,
          channel: "async"
        });
        const userRenderCharge = planUserRenderCharge({
          principal: authDecision.principal,
          store: userAccountStore,
          pricing: adminSettingsStore.pricing(),
          pipelineCost: adminSettingsStore.pipelineCost(),
          request: normalizedRequest
        });
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        let commercialReservation: CommercialRenderReservation | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          ...(reviewApproval ? { reviewApproval } : {}),
          ...(preExportReviewApproval ? { preExportReviewApproval } : {}),
          onAccepted: () => {
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          },
          onCanceledBeforeRun: () => {
            if (commercialReservation?.clientPolicyReservation) {
              clientPolicyGate.releaseRender({
                reservation: commercialReservation.clientPolicyReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
            if (commercialReservation?.workspaceBillingReservation) {
              workspaceBillingGate.releaseRender({
                reservation: commercialReservation.workspaceBillingReservation,
                request: normalizedRequest,
                requestId: requestContext.requestId,
                channel: "async"
              });
            }
          }
        });
        if (userRenderCharge && !submission.idempotentReplay && chargeableSubmissionStatus(submission.summary.status)) {
          userAccountStore.chargeRender({
            userId: userRenderCharge.userId,
            jobId: submission.summary.jobId,
            credits: userRenderCharge.credits
          });
        }
        sendJson(response, 202, {
          ...jobSummaryForPrincipal(submission.summary, authDecision.principal),
          ...(submission.idempotentReplay ? { idempotentReplay: true } : {}),
          ...(commercialReservation?.clientPolicyReservation
            ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
            : {}),
          ...(commercialReservation?.workspaceBillingReservation
            ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
            : {}),
          statusUrl: `/v1/render-jobs/${encodeURIComponent(submission.summary.jobId)}`
        }, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/render") {
        assertNotUserPrincipal(authDecision.principal, "Tài khoản khách tạo video trong Studio (trang chính); endpoint này dành cho vận hành.");
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        const renderBody = renderRequestBody(body);
        const reviewApproval = renderJobReviewInputFromRenderBody(body);
        requestAdmission.assertAcceptable(renderBody);
        let normalizedRequest = normalizeRenderRequest(renderBody, {
          requestId: requestContext.requestId,
          env: process.env
        });
        const preRenderReviewApproval = evaluatePreRenderReviewApproval(
          reviewApprovalSystem,
          requestContext.requestId,
          normalizedRequest,
          reviewApproval
        );
        if (preRenderReviewApproval && !preRenderReviewApproval.releaseGateSummary.canRenderAfterReview) {
          sendJson(response, 409, {
            status: statusForSyncPreRenderReview(preRenderReviewApproval),
            reviewApproval: preRenderReviewApproval,
            message: preRenderReviewApproval.lifecycle.message
          }, requestContext);
          return;
        }
        normalizedRequest = requestWithPreRenderApprovalMetadata(normalizedRequest, preRenderReviewApproval);
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        // Acquire the concurrency slot BEFORE reserving commercial spend: reservations
        // have no refund path, so reserving first would burn monthly quota and reserved
        // cost on every capacity 503 without any render happening.
        const renderLease = syncRenderGate.tryAcquire();
        if (!renderLease.allowed) {
          sendJson(response, renderLease.statusCode, {
            error: renderLease.message,
            retryAfterSeconds: renderLease.retryAfterSeconds
          }, requestContext, retryAfterHeaders(renderLease.retryAfterSeconds));
          return;
        }
        let commercialReservation: CommercialRenderReservation;
        try {
          commercialReservation = reserveCommercialRender({
            clientPolicyGate,
            workspaceBillingGate,
            principal: authDecision.principal,
            request: normalizedRequest,
            requestId: requestContext.requestId,
            channel: "sync"
          });
        } catch (reservationError: unknown) {
          // Quota/billing rejection happens before the render try/finally, so release the
          // concurrency slot here or the sync gate would leak on every quota denial.
          renderLease.release();
          throw reservationError;
        }
        const syncUserCharge = planUserRenderCharge({
          principal: authDecision.principal,
          store: userAccountStore,
          pricing: adminSettingsStore.pricing(),
          pipelineCost: adminSettingsStore.pipelineCost(),
          request: normalizedRequest
        });
        const syncJobId = `sync_${requestContext.requestId}`;
        if (syncUserCharge) {
          userAccountStore.chargeRender({
            userId: syncUserCharge.userId,
            jobId: syncJobId,
            credits: syncUserCharge.credits
          });
        }
        let costLedger: readonly CostLedgerEntry[] = [];
        let runtime: ReturnType<typeof createDirectorRuntime> | undefined;
        try {
          runtime = createDirectorRuntime();
          const result = await runtime.director.run(normalizedRequest, requestLifecycle.signal);
          costLedger = runtime.ledger.list();
          const artifacts = await artifactStore.writeRunArtifacts({
            result,
            costLedger,
            artifactDirectory
          });
          const artifactValidation = await validateArtifactsForApi(artifactValidator, artifacts);
          sendJson(response, 200, {
            ...result,
            ...(commercialReservation.clientPolicyReservation
              ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
              : {}),
            ...(commercialReservation.workspaceBillingReservation
              ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
              : {}),
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts),
            artifactValidation: toApiProjectArtifactValidationReport(artifactValidation)
          }, requestContext);
        } catch (renderError: unknown) {
          if (syncUserCharge) {
            userAccountStore.refundRender({ userId: syncUserCharge.userId, jobId: syncJobId, reason: "video bị lỗi" });
          }
          costLedger = runtime?.ledger.list() ?? costLedger;
          const artifacts = await artifactStore.writeFailureArtifacts({
            request: normalizedRequest,
            costLedger,
            artifactDirectory,
            error: renderError,
            stage: "render_pipeline"
          });
          const artifactValidation = await validateArtifactsForApi(artifactValidator, artifacts);
          sendJson(response, 500, {
            error: redactUnknown(redactEmbeddedLocalPaths(renderError instanceof Error ? renderError.message : String(renderError))),
            ...(commercialReservation.clientPolicyReservation
              ? { clientPolicyReservation: commercialReservation.clientPolicyReservation }
              : {}),
            ...(commercialReservation.workspaceBillingReservation
              ? { workspaceBillingReservation: commercialReservation.workspaceBillingReservation }
              : {}),
            costLedger,
            artifacts: toApiProjectArtifactBundle(artifacts),
            artifactValidation: toApiProjectArtifactValidationReport(artifactValidation)
          }, requestContext);
        } finally {
          renderLease.release();
        }
        return;
      }
      sendJson(response, 404, { error: "Not found" }, requestContext);
    } catch (error) {
      const retryAfterSeconds = retryAfterSecondsFor(error);
      // Strip any embedded local filesystem path BEFORE the message reaches the client, then
      // the secret redactor — so an OS error (ENOENT/EACCES with an absolute path) can never
      // leak the deployment's directory layout to a customer.
      const safeMessage = redactEmbeddedLocalPaths(error instanceof Error ? error.message : String(error));
      sendJson(response, errorStatusCode(error), {
        error: redactUnknown(safeMessage),
        ...(retryAfterSeconds ? { retryAfterSeconds } : {})
      }, requestContext, retryAfterHeaders(retryAfterSeconds));
    } finally {
      requestLifecycle.complete();
      requestLifecycle.dispose();
      unregisterLifecycle();
    }
  });

  server.listen(port, () => {
    const address = server.address();
    const boundPort = address && typeof address !== "string" ? address.port : port;
    console.log(`CineJelly API listening on port ${boundPort}`);
    // Atlas settings load lazily per render, so a missing/typo'd key does NOT crash boot —
    // the server is healthy and registration/top-up work, but the first customer render
    // would fail. Surface it loudly at startup so a monitoring-only operator notices before
    // announcing to customers (no spend; run `npm run doctor` or GET /v1/preflight to check).
    if (!process.env.ATLASCLOUD_API_KEY?.trim()) {
      console.warn(
        "[CẢNH BÁO] Chưa có ATLASCLOUD_API_KEY — server chạy được nhưng KHÁCH TẠO VIDEO SẼ LỖI. " +
          "Điền key trong .env rồi khởi động lại (kiểm tra: npm run doctor)."
      );
    }
    if (!process.env.CINEJELLY_API_AUTH_TOKEN?.trim()) {
      console.warn(
        "[CẢNH BÁO] Chưa có CINEJELLY_API_AUTH_TOKEN — trang quản trị /operator/admin bị chặn, không duyệt nạp tiền được."
      );
    }
  });
  registerShutdownHandlers(server, jobManager, shutdownCoordinator);
  return server;
}

async function validateArtifactsForApi(
  artifactValidator: ProjectArtifactValidator,
  artifacts: ProjectArtifactBundle
): Promise<ProjectArtifactValidationReport> {
  try {
    return await artifactValidator.validate(artifacts.artifactDirectory);
  } catch (error) {
    return {
      status: "fail",
      checkedAt: new Date(),
      artifactDirectory: artifacts.artifactDirectory,
      manifestPath: artifacts.manifestPath,
      projectId: artifacts.projectId,
      checks: [
        {
          name: "artifact_validation_runtime",
          status: "fail",
          message: error instanceof Error ? error.message : "Artifact validation failed."
        }
      ]
    };
  }
}

function readOperatorLaunchUiReports(): readonly OperatorLaunchUiReportInput[] {
  return OPERATOR_LAUNCH_UI_REPORTS.map((report): OperatorLaunchUiReportInput => {
    const absolutePath = resolve(process.cwd(), report.reportPath);
    if (!existsSync(absolutePath)) {
      return report;
    }
    try {
      return {
        ...report,
        payload: JSON.parse(readFileSync(absolutePath, "utf8")) as unknown
      };
    } catch {
      return {
        ...report,
        parseError: "Report is present but is not valid JSON."
      };
    }
  });
}

async function readJsonBody<TValue>(request: IncomingMessage, maxBodyBytes: number): Promise<TValue> {
  const declaredContentLength = readContentLength(request);
  if (declaredContentLength !== undefined && declaredContentLength > maxBodyBytes) {
    throw new RequestBodyTooLargeError(maxBodyBytes);
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new RequestBodyTooLargeError(maxBodyBytes);
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new RenderRequestAdmissionError("Request body cannot be empty.");
  }
  try {
    return JSON.parse(raw) as TValue;
  } catch {
    throw new RenderRequestAdmissionError("Request body must be valid JSON.");
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  requestContext: ApiRequestContext,
  headers: OutgoingHttpHeaders = {}
): void {
  if (response.destroyed) {
    return;
  }
  response.writeHead(statusCode, {
    ...headers,
    ...BASE_SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(redactApiResponse(redactUnknown(withRequestContext(payload, requestContext)))));
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  if (response.destroyed) {
    return;
  }
  response.writeHead(statusCode, {
    ...BASE_SECURITY_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": HTML_CONTENT_SECURITY_POLICY
  });
  response.end(html);
}

/**
 * Central binary sender for deliverable video streaming. Keeps response.writeHead usage
 * inside the sender helpers (same policy as sendJson/sendHtml) so security headers and
 * response behavior cannot drift per route.
 */
function sendVideoStream(
  response: ServerResponse,
  filePath: string,
  fileSizeBytes: number,
  options?: { readonly contentType?: string; readonly inline?: boolean }
): void {
  if (response.destroyed) {
    return;
  }
  const disposition = options?.inline ? "inline" : "attachment";
  response.writeHead(200, {
    ...BASE_SECURITY_HEADERS,
    "Content-Type": options?.contentType ?? "video/mp4",
    "Content-Length": String(fileSizeBytes),
    "Content-Disposition": `${disposition}; filename="${basename(filePath).replace(/["\\]/g, "")}"`
  });
  createReadStream(filePath).pipe(response);
}

/** Read a raw (non-JSON) request body with a hard byte cap. */
async function readRawBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declaredContentLength = readContentLength(request);
  if (declaredContentLength !== undefined && declaredContentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }
  // Slow-body DoS guard: destroy the request if the client goes idle (no chunk) for too long, so a
  // trickle-then-stall body cannot pin a connection or an uploadGate slot for the full request
  // timeout. The socket timeout is inactivity-based, so a steady upload keeps resetting it.
  const bodyIdleTimeoutMs = readPositiveInteger(process.env.CINEJELLY_API_BODY_IDLE_TIMEOUT_MS, 20_000);
  request.setTimeout(bodyIdleTimeoutMs, () => {
    request.destroy(new Error("Request body idle timeout."));
  });
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function readPort(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_PORT;
  }
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error("PORT must be a positive integer.");
  }
  const port = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`PORT must be a TCP port between ${MIN_PORT} and ${MAX_PORT}.`);
  }
  return port;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error("API job settings must be positive integers.");
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("API job settings must be positive integers.");
  }
  return parsed;
}

function errorStatusCode(error: unknown): number {
  return error instanceof UserAccountError ||
    error instanceof RenderRequestAdmissionError ||
    error instanceof RenderRequestNormalizationError ||
    error instanceof RenderJobCapacityError ||
    error instanceof RenderJobIdempotencyConflictError ||
    error instanceof RenderJobReviewStateError ||
    error instanceof UnsupportedMediaTypeError ||
    error instanceof RequestBodyTooLargeError ||
    error instanceof ShortPipelineRenderHandoffError ||
    error instanceof ShortPipelineSessionStoreUnavailableError ||
    error instanceof ShortChannelStyleLibraryUnavailableError ||
    error instanceof ShortChannelStyleProfileNotFoundError ||
    error instanceof ApiClientPolicyError ||
    error instanceof ApiWorkspaceBillingError
    ? error.statusCode
    : 500;
}

function retryAfterSecondsFor(error: unknown): number | undefined {
  if (
    error instanceof RenderJobCapacityError ||
    error instanceof ApiClientPolicyError ||
    error instanceof ApiWorkspaceBillingError
  ) {
    return error.retryAfterSeconds;
  }
  return undefined;
}

function retryAfterHeaders(retryAfterSeconds: number | undefined): OutgoingHttpHeaders {
  return retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
}

function withRequestContext(payload: unknown, requestContext: ApiRequestContext): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      requestId: requestContext.requestId,
      ...payload
    };
  }
  return {
    requestId: requestContext.requestId,
    data: payload
  };
}

function readIdempotencyKeyDigest(request: IncomingMessage): string | undefined {
  const raw = readHeader(request, "idempotency-key");
  const normalized = raw?.trim();
  if (!normalized) {
    return undefined;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new RenderRequestAdmissionError(
      "Idempotency-Key must be 8 to 160 characters using only letters, digits, underscore, dot, colon, or hyphen."
    );
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function createRequestFingerprint(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function shortPipelineConversationInputFromBody(
  body: ShortPipelineConversationRequestBody,
  requestId: string,
  channelStyleStore: ShortChannelStyleLibraryStore | undefined,
  clientScope: { readonly clientId?: string }
): ShortPipelineConversationInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RenderRequestAdmissionError("Short pipeline conversation request body must be a JSON object.");
  }
  if (typeof body.projectId !== "string" || !body.projectId.trim()) {
    throw new RenderRequestAdmissionError("Short pipeline conversation requires projectId.");
  }
  const messages = conversationMessagesFromBody(body);
  if (messages.length === 0) {
    throw new RenderRequestAdmissionError("Short pipeline conversation requires messages or userPrompt.");
  }
  const channelStyle = resolveShortChannelStyleInput(body, channelStyleStore, clientScope);
  const mediaReferences = mediaReferencesFromBody(body.mediaReferences, "mediaReferences");
  const audio = shortAudioFromBody(body.audio, "audio");
  const seedanceSettings = shortSeedanceSettingsFromBody(body.seedanceSettings ?? body.settings, "seedanceSettings");
  const targetAspectRatio = shortAspectRatioFromBody(body.targetAspectRatio, "targetAspectRatio");
  const visualBible = shortVisualBibleFromBody(body.visualBible, "visualBible");
  return {
    projectId: body.projectId,
    requestId: shortPersistedRequestIdFromBody(body.requestId, requestId, "requestId"),
    messages,
    ...(body.product ? { product: body.product } : {}),
    ...(body.brandKit ? { brandKit: body.brandKit } : {}),
    ...(channelStyle ? { channelStyle } : {}),
    ...(mediaReferences ? { mediaReferences } : {}),
    ...(body.referenceVideoLearning ? { referenceVideoLearning: body.referenceVideoLearning } : {}),
    ...(body.preferredTemplateId ? { preferredTemplateId: body.preferredTemplateId } : {}),
    ...(body.allowTemplateSuggestions !== undefined
      ? { allowTemplateSuggestions: optionalBoolean(body.allowTemplateSuggestions, "allowTemplateSuggestions") ?? true }
      : {}),
    ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
    ...(body.targetDurationSeconds !== undefined ? { targetDurationSeconds: body.targetDurationSeconds } : {}),
    ...(targetAspectRatio ? { targetAspectRatio } : {}),
    ...(audio ? { audio } : {}),
    ...(seedanceSettings ? { seedanceSettings } : {}),
    ...(visualBible ? { visualBible } : {}),
    ...(body.generatedAt ? { generatedAt: optionalDate(body.generatedAt, "generatedAt") } : {})
  };
}

function conversationMessagesFromBody(body: ShortPipelineConversationRequestBody): readonly ShortPipelineConversationMessageInput[] {
  const sourceMessages = Array.isArray(body.messages)
    ? body.messages
    : body.userPrompt
    ? [{ role: "user" as const, text: body.userPrompt }]
    : [];
  if (sourceMessages.length > 24) {
    throw new RenderRequestAdmissionError("Short pipeline conversation cannot contain more than 24 messages.");
  }
  return sourceMessages.map((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new RenderRequestAdmissionError(`messages[${index}] must be an object.`);
    }
    if (typeof message.text !== "string" || !message.text.trim()) {
      throw new RenderRequestAdmissionError(`messages[${index}].text is required.`);
    }
    const role = conversationRole(message.role, index);
    return {
      role,
      text: message.text,
      ...(message.createdAt ? { createdAt: optionalDate(message.createdAt, `messages[${index}].createdAt`) } : {})
    };
  });
}

function mediaReferencesFromBody(
  value: unknown,
  label: string
): readonly ShortMediaReferenceInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an array when provided.`);
  }
  if (value.length > MAX_SHORT_MEDIA_REFERENCES) {
    throw new RenderRequestAdmissionError(`${label} cannot contain more than ${MAX_SHORT_MEDIA_REFERENCES} items.`);
  }
  const references = value.map((item, index): ShortMediaReferenceInput => {
    const itemLabel = `${label}[${index}]`;
    if (!isJsonRecord(item)) {
      throw new RenderRequestAdmissionError(`${itemLabel} must be an object.`);
    }
    const role = boundedMediaEnum(item.role, `${itemLabel}.role`, SHORT_MEDIA_REFERENCE_ROLES);
    const uri = boundedMediaString(item.uri, `${itemLabel}.uri`, 600, true);
    const kind = item.kind === undefined
      ? undefined
      : boundedMediaEnum(item.kind, `${itemLabel}.kind`, SHORT_MEDIA_REFERENCE_KINDS);
    const rightsStatus = item.rightsStatus === undefined
      ? undefined
      : boundedMediaEnum(item.rightsStatus, `${itemLabel}.rightsStatus`, SHORT_MEDIA_REFERENCE_RIGHTS);
    const priority = item.priority === undefined
      ? undefined
      : boundedMediaEnum(item.priority, `${itemLabel}.priority`, SHORT_MEDIA_REFERENCE_PRIORITIES);
    const displayLabel = item.label === undefined
      ? undefined
      : boundedMediaString(item.label, `${itemLabel}.label`, 120, false);
    const description = item.description === undefined
      ? undefined
      : boundedMediaString(item.description, `${itemLabel}.description`, 300, false);
    const reference: Record<string, unknown> = {
      role: role as ShortMediaReferenceInput["role"],
      uri
    };
    if (displayLabel) reference.label = displayLabel;
    if (kind !== undefined) reference.kind = kind as ShortMediaReferenceInput["kind"];
    if (rightsStatus !== undefined) reference.rightsStatus = rightsStatus as ShortMediaReferenceInput["rightsStatus"];
    if (priority !== undefined) reference.priority = priority as ShortMediaReferenceInput["priority"];
    if (description) reference.description = description;
    return reference as unknown as ShortMediaReferenceInput;
  });
  return references.length > 0 ? references : undefined;
}

function shortAudioFromBody(value: unknown, label: string): ShortPipelineAudioPolicyInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonRecord(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an object when provided.`);
  }
  const audio: Record<string, unknown> = {};
  if (value.mode !== undefined) {
    audio.mode = boundedMediaEnum(value.mode, `${label}.mode`, SHORT_AUDIO_MODES) as ShortPipelineAudioPolicyInput["mode"];
  }
  if (value.language !== undefined) {
    audio.language = boundedMediaEnum(value.language, `${label}.language`, SHORT_AUDIO_LANGUAGES) as ShortPipelineAudioPolicyInput["language"];
  }
  if (value.voiceStyle !== undefined) {
    audio.voiceStyle = boundedMediaString(value.voiceStyle, `${label}.voiceStyle`, 120, false);
  }
  return Object.keys(audio).length > 0 ? audio as ShortPipelineAudioPolicyInput : undefined;
}

function shortAspectRatioFromBody(value: unknown, label: string): AspectRatio | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !RATIOS.includes(value as AspectRatio)) {
    throw new RenderRequestAdmissionError(`${label} is invalid.`);
  }
  if (value !== "9:16" && value !== "16:9" && value !== "1:1") {
    throw new RenderRequestAdmissionError(`${label} is not available in the Short Studio UI.`);
  }
  return value as AspectRatio;
}

function shortSeedanceSettingsFromBody(value: unknown, label: string): ShortSeedanceSettingsInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonRecord(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an object when provided.`);
  }
  const settings: {
    resolution?: Resolution;
    bitrateMode?: BitrateMode;
    returnLastFrame?: boolean;
  } = {};
  if (value.resolution !== undefined) {
    if (typeof value.resolution !== "string" || !RESOLUTIONS.includes(value.resolution as Resolution)) {
      throw new RenderRequestAdmissionError(`${label}.resolution is invalid.`);
    }
    settings.resolution = value.resolution as Resolution;
  }
  if (value.bitrateMode !== undefined) {
    if (typeof value.bitrateMode !== "string" || !BITRATE_MODES.includes(value.bitrateMode as BitrateMode)) {
      throw new RenderRequestAdmissionError(`${label}.bitrateMode is invalid.`);
    }
    settings.bitrateMode = value.bitrateMode as BitrateMode;
  }
  const returnLastFrame = optionalBoolean(value.returnLastFrame, `${label}.returnLastFrame`);
  if (returnLastFrame !== undefined) {
    settings.returnLastFrame = returnLastFrame;
  }
  return Object.keys(settings).length > 0 ? settings : undefined;
}

function shortVisualBibleFromBody(value: unknown, label: string): ShortVisualBibleInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonRecord(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an object when provided.`);
  }
  const visualBible: ShortVisualBibleInput = {};
  if (value.mode !== undefined) {
    const allowedModes = new Set(["auto", "off", "reference_board", "storyboard_board", "production_bible"]);
    if (typeof value.mode !== "string" || !allowedModes.has(value.mode)) {
      throw new RenderRequestAdmissionError(`${label}.mode is invalid.`);
    }
    (visualBible as { mode?: ShortVisualBibleInput["mode"] }).mode = value.mode as ShortVisualBibleInput["mode"];
  }
  if (value.imageProviderPolicy !== undefined) {
    const allowedPolicies = new Set(["provider_neutral", "openai_compatible", "atlascloud", "operator_supplied"]);
    if (typeof value.imageProviderPolicy !== "string" || !allowedPolicies.has(value.imageProviderPolicy)) {
      throw new RenderRequestAdmissionError(`${label}.imageProviderPolicy is invalid.`);
    }
    (visualBible as { imageProviderPolicy?: ShortVisualBibleInput["imageProviderPolicy"] }).imageProviderPolicy = value.imageProviderPolicy as ShortVisualBibleInput["imageProviderPolicy"];
  }
  if (value.maxBoardCount !== undefined) {
    if (typeof value.maxBoardCount !== "number" || !Number.isFinite(value.maxBoardCount) || value.maxBoardCount < 1 || value.maxBoardCount > 12) {
      throw new RenderRequestAdmissionError(`${label}.maxBoardCount must be between 1 and 12.`);
    }
    (visualBible as { maxBoardCount?: number }).maxBoardCount = Math.floor(value.maxBoardCount);
  }
  const requireBeforeRender = optionalBoolean(value.requireBeforeRender, `${label}.requireBeforeRender`);
  if (requireBeforeRender !== undefined) {
    (visualBible as { requireBeforeRender?: boolean }).requireBeforeRender = requireBeforeRender;
  }
  return Object.keys(visualBible).length > 0 ? visualBible : undefined;
}

function boundedMediaEnum(value: unknown, label: string, allowed: ReadonlySet<string>): string {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new RenderRequestAdmissionError(`${label} is invalid.`);
  }
  return value;
}

function boundedMediaString(value: unknown, label: string, maxLength: number, required: boolean): string {
  if (typeof value !== "string") {
    throw new RenderRequestAdmissionError(`${label} must be a string.`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (required && !normalized) {
    throw new RenderRequestAdmissionError(`${label} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new RenderRequestAdmissionError(`${label} cannot exceed ${maxLength} characters.`);
  }
  if (REVIEW_TEXT_CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new RenderRequestAdmissionError(`${label} must not contain control characters.`);
  }
  return normalized;
}

function shortPipelinePlanInputFromBody(
  body: ShortPipelinePlanRequestBody,
  requestId: string,
  channelStyleStore: ShortChannelStyleLibraryStore | undefined,
  clientScope: { readonly clientId?: string }
): ShortPipelinePlanInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RenderRequestAdmissionError("Short pipeline request body must be a JSON object.");
  }
  if (typeof body.projectId !== "string" || !body.projectId.trim()) {
    throw new RenderRequestAdmissionError("Short pipeline projectId is required.");
  }
  if (body.userPrompt !== undefined && typeof body.userPrompt !== "string") {
    throw new RenderRequestAdmissionError("Short pipeline userPrompt must be a string when provided.");
  }
  if (body.userPrompt && body.userPrompt.length > 4000) {
    throw new RenderRequestAdmissionError("Short pipeline userPrompt is too long.");
  }
  if (!body.userPrompt?.trim() && !body.product?.productUrl && !body.product?.snapshot) {
    throw new RenderRequestAdmissionError("Short pipeline requires userPrompt, product.productUrl, or product.snapshot.");
  }
  const channelStyle = resolveShortChannelStyleInput(body, channelStyleStore, clientScope);
  const mediaReferences = mediaReferencesFromBody(body.mediaReferences, "mediaReferences");
  const audio = shortAudioFromBody(body.audio, "audio");
  const seedanceSettings = shortSeedanceSettingsFromBody(body.seedanceSettings ?? body.settings, "seedanceSettings");
  const targetAspectRatio = shortAspectRatioFromBody(body.targetAspectRatio, "targetAspectRatio");
  const visualBible = shortVisualBibleFromBody(body.visualBible, "visualBible");
  return {
    projectId: body.projectId,
    requestId: shortPersistedRequestIdFromBody(body.requestId, requestId, "requestId"),
    ...(body.userPrompt ? { userPrompt: body.userPrompt } : {}),
    ...(body.product ? { product: body.product } : {}),
    ...(body.brandKit ? { brandKit: body.brandKit } : {}),
    ...(channelStyle ? { channelStyle } : {}),
    ...(mediaReferences ? { mediaReferences } : {}),
    ...(body.referenceVideoLearning ? { referenceVideoLearning: body.referenceVideoLearning } : {}),
    ...(body.preferredTemplateId ? { preferredTemplateId: body.preferredTemplateId } : {}),
    ...(body.allowTemplateSuggestions !== undefined
      ? { allowTemplateSuggestions: optionalBoolean(body.allowTemplateSuggestions, "allowTemplateSuggestions") ?? true }
      : {}),
    ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
    ...(body.targetDurationSeconds !== undefined ? { targetDurationSeconds: body.targetDurationSeconds } : {}),
    ...(targetAspectRatio ? { targetAspectRatio } : {}),
    ...(audio ? { audio } : {}),
    ...(seedanceSettings ? { seedanceSettings } : {}),
    ...(visualBible ? { visualBible } : {}),
    ...(body.generatedAt ? { generatedAt: body.generatedAt } : {})
  };
}

function shortPersistedRequestIdFromBody(value: unknown, fallback: string, label: string): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "string" || !PERSISTED_REQUEST_ID_PATTERN.test(value.trim())) {
    throw new RenderRequestAdmissionError(
      `Short pipeline ${label} must start with req_ and use 8 to 160 safe characters when provided.`
    );
  }
  return value.trim();
}

function longFormCreativeIntelligencePlanFromBody(body: LongDirectorUiContractRequestBody): LongFormCreativeIntelligencePlan {
  if (!isJsonRecord(body)) {
    throw new RenderRequestAdmissionError("Long Director UI contract request body must be a JSON object.");
  }
  const plan = body.longFormCreativeIntelligencePlan;
  if (!isJsonRecord(plan)) {
    throw new RenderRequestAdmissionError("Long Director UI contract request requires longFormCreativeIntelligencePlan.");
  }
  if (plan.schemaVersion !== "cinejelly.long-form-creative-intelligence.v1") {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.schemaVersion is invalid.");
  }
  if (typeof plan.projectId !== "string" || !plan.projectId.trim()) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.projectId is required.");
  }
  if (plan.noSpend !== true || plan.networkCallsMade !== false || plan.providerCallsMade !== false) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan must be no-spend/no-network/no-provider evidence.");
  }
  if (typeof plan.status !== "string" || !LONG_FORM_CREATIVE_STATUSES.has(plan.status)) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.status is invalid.");
  }
  requirePositiveNumber(plan.targetDurationSeconds, "longFormCreativeIntelligencePlan.targetDurationSeconds");
  requireBoundedNumber(plan.qualityScore, "longFormCreativeIntelligencePlan.qualityScore", 0, 100);
  const nicheStrategy = requireRecord(plan.nicheStrategy, "longFormCreativeIntelligencePlan.nicheStrategy");
  requireString(nicheStrategy.niche, "longFormCreativeIntelligencePlan.nicheStrategy.niche");
  requireString(nicheStrategy.platformIntent, "longFormCreativeIntelligencePlan.nicheStrategy.platformIntent");
  requireString(nicheStrategy.desiredViewerAction, "longFormCreativeIntelligencePlan.nicheStrategy.desiredViewerAction");
  requireArray(nicheStrategy.viralLevers, "longFormCreativeIntelligencePlan.nicheStrategy.viralLevers");
  const storyBible = requireRecord(plan.storyBible, "longFormCreativeIntelligencePlan.storyBible");
  requireArray(storyBible.emotionalArc, "longFormCreativeIntelligencePlan.storyBible.emotionalArc");
  const directorPlan = requireRecord(plan.directorPlan, "longFormCreativeIntelligencePlan.directorPlan");
  if (directorPlan.schemaVersion !== "cinejelly.long-director.v1") {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan.schemaVersion is invalid.");
  }
  requireString(directorPlan.directorId, "longFormCreativeIntelligencePlan.directorPlan.directorId");
  if (typeof directorPlan.status !== "string" || !LONG_FORM_CREATIVE_STATUSES.has(directorPlan.status)) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan.status is invalid.");
  }
  const directorStory = requireRecord(directorPlan.storyPlan, "longFormCreativeIntelligencePlan.directorPlan.storyPlan");
  if (typeof directorStory.narrativeMode !== "string" || !LONG_DIRECTOR_NARRATIVE_MODES.has(directorStory.narrativeMode)) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan.storyPlan.narrativeMode is invalid.");
  }
  const directorContinuity = requireRecord(directorPlan.continuityPlan, "longFormCreativeIntelligencePlan.directorPlan.continuityPlan");
  if (typeof directorContinuity.mode !== "string" || !LONG_DIRECTOR_CONTINUITY_MODES.has(directorContinuity.mode)) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan.continuityPlan.mode is invalid.");
  }
  const checkpointPolicy = requireRecord(directorPlan.checkpointPolicy, "longFormCreativeIntelligencePlan.directorPlan.checkpointPolicy");
  const checkpointStages = requireArray(
    checkpointPolicy.requiredStages,
    "longFormCreativeIntelligencePlan.directorPlan.checkpointPolicy.requiredStages"
  );
  if (checkpointStages.length === 0 || checkpointStages.some((stage) => typeof stage !== "string" || !LONG_DIRECTOR_CHECKPOINT_STAGES.has(stage))) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan.checkpointPolicy.requiredStages is invalid.");
  }
  if (checkpointPolicy.pauseBeforeProviderSpend !== true || checkpointPolicy.pauseBeforeCustomerRelease !== true) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.directorPlan checkpoint policy must pause before provider spend and customer release.");
  }
  requireArray(directorPlan.findings, "longFormCreativeIntelligencePlan.directorPlan.findings");
  requireStringArray(directorPlan.directorDirectives, "longFormCreativeIntelligencePlan.directorPlan.directorDirectives");
  const shotDirectives = requireArray(plan.shotDirectives, "longFormCreativeIntelligencePlan.shotDirectives");
  const candidateDirectives = requireArray(plan.candidateDirectives, "longFormCreativeIntelligencePlan.candidateDirectives");
  const repairDirectives = requireArray(plan.repairDirectives, "longFormCreativeIntelligencePlan.repairDirectives");
  const findings = requireArray(plan.findings, "longFormCreativeIntelligencePlan.findings");
  requireIntegerCount(plan.findingCount, findings.length, "longFormCreativeIntelligencePlan.findingCount");
  requireIntegerCount(plan.shotDirectiveCount, shotDirectives.length, "longFormCreativeIntelligencePlan.shotDirectiveCount");
  requireIntegerCount(plan.candidateDirectiveCount, candidateDirectives.length, "longFormCreativeIntelligencePlan.candidateDirectiveCount");
  requireIntegerCount(plan.repairDirectiveCount, repairDirectives.length, "longFormCreativeIntelligencePlan.repairDirectiveCount");
  for (const [index, directive] of shotDirectives.entries()) {
    const item = requireRecord(directive, `longFormCreativeIntelligencePlan.shotDirectives[${index}]`);
    requireString(item.sequenceId, `longFormCreativeIntelligencePlan.shotDirectives[${index}].sequenceId`);
  }
  for (const [index, directive] of repairDirectives.entries()) {
    const item = requireRecord(directive, `longFormCreativeIntelligencePlan.repairDirectives[${index}]`);
    if (typeof item.priority !== "string" || !LONG_FORM_CREATIVE_REPAIR_PRIORITIES.has(item.priority)) {
      throw new RenderRequestAdmissionError(`longFormCreativeIntelligencePlan.repairDirectives[${index}].priority is invalid.`);
    }
  }
  const audioCaptionQuality = requireRecord(plan.audioCaptionQuality, "longFormCreativeIntelligencePlan.audioCaptionQuality");
  if (typeof audioCaptionQuality.status !== "string" || !LONG_FORM_CREATIVE_STATUSES.has(audioCaptionQuality.status)) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.audioCaptionQuality.status is invalid.");
  }
  requireBoundedNumber(audioCaptionQuality.captionCoverageRatio, "longFormCreativeIntelligencePlan.audioCaptionQuality.captionCoverageRatio", 0, 1);
  requireNonNegativeNumber(audioCaptionQuality.generatedAudioIntentCount, "longFormCreativeIntelligencePlan.audioCaptionQuality.generatedAudioIntentCount");
  const releaseGateSummary = requireRecord(plan.releaseGateSummary, "longFormCreativeIntelligencePlan.releaseGateSummary");
  if (
    typeof releaseGateSummary.canProceedToRender !== "boolean" ||
    releaseGateSummary.canReleaseToCustomerTraffic !== false ||
    typeof releaseGateSummary.releaseBlocker !== "string" ||
    !releaseGateSummary.releaseBlocker
  ) {
    throw new RenderRequestAdmissionError("longFormCreativeIntelligencePlan.releaseGateSummary is invalid.");
  }
  return plan as unknown as LongFormCreativeIntelligencePlan;
}

function resolveShortChannelStyleInput(
  body: {
    readonly channelStyle?: ShortChannelStyleProfileInput;
    readonly channelStyleProfileId?: string;
  },
  store: ShortChannelStyleLibraryStore | undefined,
  clientScope: { readonly clientId?: string }
): ShortChannelStyleProfileInput | undefined {
  if (body.channelStyle && body.channelStyleProfileId) {
    throw new RenderRequestAdmissionError(
      "Short pipeline request must use either channelStyle or channelStyleProfileId, not both."
    );
  }
  if (body.channelStyle) {
    return body.channelStyle;
  }
  if (!body.channelStyleProfileId) {
    return undefined;
  }
  const library = requireShortChannelStyleLibraryStore(store);
  const record = library.get(body.channelStyleProfileId, clientScope);
  if (!record) {
    throw new ShortChannelStyleProfileNotFoundError();
  }
  return record.input;
}

function shortPipelineProductUrlPlanBodyFromBody(
  body: ShortPipelineProductUrlPlanRequestBody,
  requestId: string,
  channelStyleStore: ShortChannelStyleLibraryStore | undefined,
  clientScope: { readonly clientId?: string }
): NormalizedShortPipelineProductUrlPlanBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RenderRequestAdmissionError("Short pipeline product URL plan request body must be a JSON object.");
  }
  const planInput = shortPipelinePlanInputFromBody({
    projectId: body.projectId,
    ...(body.requestId ? { requestId: body.requestId } : {}),
    ...(body.userPrompt ? { userPrompt: body.userPrompt } : {}),
    ...(body.product ? { product: body.product } : {}),
    ...(body.brandKit ? { brandKit: body.brandKit } : {}),
    ...(body.channelStyle ? { channelStyle: body.channelStyle } : {}),
    ...(body.channelStyleProfileId ? { channelStyleProfileId: body.channelStyleProfileId } : {}),
    ...(body.mediaReferences ? { mediaReferences: body.mediaReferences } : {}),
    ...(body.referenceVideoLearning ? { referenceVideoLearning: body.referenceVideoLearning } : {}),
    ...(body.preferredTemplateId ? { preferredTemplateId: body.preferredTemplateId } : {}),
    ...(body.allowTemplateSuggestions !== undefined ? { allowTemplateSuggestions: body.allowTemplateSuggestions } : {}),
    ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
    ...(body.targetDurationSeconds !== undefined ? { targetDurationSeconds: body.targetDurationSeconds } : {}),
    ...(body.visualBible ? { visualBible: body.visualBible } : {}),
    ...(body.generatedAt ? { generatedAt: body.generatedAt } : {})
  }, requestId, channelStyleStore, clientScope);
  if (!planInput.product || typeof planInput.product !== "object" || Array.isArray(planInput.product)) {
    throw new RenderRequestAdmissionError("Short pipeline product URL plan requires a product object.");
  }
  if (typeof planInput.product.productUrl !== "string" || !planInput.product.productUrl.trim()) {
    throw new RenderRequestAdmissionError("Short pipeline product URL plan requires product.productUrl.");
  }
  const confirmLiveNetwork = optionalBoolean(body.confirmLiveNetwork, "confirmLiveNetwork") ?? false;
  const maxProductUrlBytes = optionalPositiveInteger(body.maxProductUrlBytes, "maxProductUrlBytes");
  const productResearchTimeoutMs = optionalPositiveInteger(body.productResearchTimeoutMs, "productResearchTimeoutMs");
  return {
    planInput,
    confirmLiveNetwork,
    ...(maxProductUrlBytes !== undefined ? { maxProductUrlBytes } : {}),
    ...(productResearchTimeoutMs !== undefined ? { productResearchTimeoutMs } : {})
  };
}

function shortPipelineRenderJobBodyFromBody(
  body: ShortPipelineRenderJobRequestBody,
  requestId: string,
  channelStyleStore: ShortChannelStyleLibraryStore | undefined,
  clientScope: { readonly clientId?: string }
): NormalizedShortPipelineRenderJobBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RenderRequestAdmissionError("Short pipeline render-job request body must be a JSON object.");
  }
  if (!body.planInput || typeof body.planInput !== "object" || Array.isArray(body.planInput)) {
    throw new RenderRequestAdmissionError("Short pipeline render-job body must include planInput.");
  }
  const confirmRenderSubmission = optionalBoolean(
    body.confirmRenderSubmission,
    "confirmRenderSubmission"
  ) ?? false;
  const includeGeneratedAudioIntents = optionalBoolean(
    body.includeGeneratedAudioIntents,
    "includeGeneratedAudioIntents"
  );
  if (
    body.captionPreference !== undefined &&
    body.captionPreference !== "narration_subtitles" &&
    body.captionPreference !== "none"
  ) {
    throw new RenderRequestAdmissionError('captionPreference must be "narration_subtitles" or "none" when provided.');
  }
  const captionPreference = body.captionPreference;
  const reviewApproval = body.reviewApprovalGate !== undefined || body.reviewApprovalCheckpoints !== undefined
    ? normalizeReviewApprovalInput({
        gate: body.reviewApprovalGate,
        checkpoints: body.reviewApprovalCheckpoints
      })
    : undefined;
  const audio = shortAudioFromBody(body.audio, "audio");
  return {
    planInput: shortPipelinePlanInputFromBody(body.planInput, requestId, channelStyleStore, clientScope),
    ...(reviewApproval ? { reviewApproval } : {}),
    confirmRenderSubmission,
    ...(includeGeneratedAudioIntents !== undefined ? { includeGeneratedAudioIntents } : {}),
    ...(captionPreference ? { captionPreference } : {}),
    ...(audio ? { audio } : {}),
    ...(body.settings ? { settings: body.settings } : {}),
    ...(body.modelPreferences ? { modelPreferences: body.modelPreferences } : {}),
    ...(body.references ? { references: body.references } : {}),
    ...(body.metadata ? { metadata: body.metadata } : {}),
    ...(body.outputPath ? { outputPath: body.outputPath } : {}),
    ...(body.workDirectory ? { workDirectory: body.workDirectory } : {}),
    ...(body.artifactDirectory ? { artifactDirectory: body.artifactDirectory } : {})
  };
}

function shortPipelineConversationSessionRenderJobBodyFromBody(
  body: ShortPipelineConversationSessionRenderJobRequestBody
): NormalizedShortPipelineConversationSessionRenderJobBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RenderRequestAdmissionError("Short pipeline conversation-session render-job request body must be a JSON object.");
  }
  if ("planInput" in body) {
    throw new RenderRequestAdmissionError(
      "Short pipeline conversation-session render-job body must not include planInput; the stored session plan is loaded server-side."
    );
  }
  const confirmRenderSubmission = optionalBoolean(
    body.confirmRenderSubmission,
    "confirmRenderSubmission"
  ) ?? false;
  const includeGeneratedAudioIntents = optionalBoolean(
    body.includeGeneratedAudioIntents,
    "includeGeneratedAudioIntents"
  );
  if (
    body.captionPreference !== undefined &&
    body.captionPreference !== "narration_subtitles" &&
    body.captionPreference !== "none"
  ) {
    throw new RenderRequestAdmissionError('captionPreference must be "narration_subtitles" or "none" when provided.');
  }
  const captionPreference = body.captionPreference;
  const reviewApproval = body.reviewApprovalGate !== undefined || body.reviewApprovalCheckpoints !== undefined
    ? normalizeReviewApprovalInput({
        gate: body.reviewApprovalGate,
        checkpoints: body.reviewApprovalCheckpoints
      })
    : undefined;
  const audio = shortAudioFromBody(body.audio, "audio");
  return {
    ...(reviewApproval ? { reviewApproval } : {}),
    confirmRenderSubmission,
    ...(includeGeneratedAudioIntents !== undefined ? { includeGeneratedAudioIntents } : {}),
    ...(captionPreference ? { captionPreference } : {}),
    ...(audio ? { audio } : {}),
    ...(body.settings ? { settings: body.settings } : {}),
    ...(body.modelPreferences ? { modelPreferences: body.modelPreferences } : {}),
    ...(body.references ? { references: body.references } : {}),
    ...(body.metadata ? { metadata: body.metadata } : {}),
    ...(body.outputPath ? { outputPath: body.outputPath } : {}),
    ...(body.workDirectory ? { workDirectory: body.workDirectory } : {}),
    ...(body.artifactDirectory ? { artifactDirectory: body.artifactDirectory } : {})
  };
}

function shortPipelinePlanFromStoredSession(record: ShortPipelineStoredSessionRecord): ShortPipelinePlan {
  const session = jsonObject(record.session, "Stored short-pipeline conversation session");
  const plan = jsonObject(session.plan, "Stored short-pipeline conversation session plan");
  const releaseGateSummary = jsonObject(
    plan.releaseGateSummary,
    "Stored short-pipeline conversation session plan releaseGateSummary"
  );
  if (session.schemaVersion !== "cinejelly.short-pipeline-conversation-session.v1") {
    throw new RenderRequestAdmissionError("Stored short-pipeline conversation session has an invalid schemaVersion.");
  }
  if (plan.schemaVersion !== "cinejelly.short-pipeline-plan.v1") {
    throw new RenderRequestAdmissionError("Stored short-pipeline conversation session plan has an invalid schemaVersion.");
  }
  if (plan.projectId !== record.projectId) {
    throw new RenderRequestAdmissionError("Stored short-pipeline conversation session plan projectId does not match the session record.");
  }
  if (session.noSpend !== true || session.networkCallsMade !== false || session.providerCallsMade !== false) {
    throw new RenderRequestAdmissionError("Stored short-pipeline conversation session must be no-spend/no-network before render handoff.");
  }
  if (plan.noSpend !== true || plan.networkCallsMade !== false || plan.providerCallsMade !== false) {
    throw new RenderRequestAdmissionError("Stored short-pipeline plan must be no-spend/no-network before render handoff.");
  }
  if (plan.status !== "approval_required" && plan.status !== "changes_requested" && plan.status !== "blocked") {
    throw new RenderRequestAdmissionError("Stored short-pipeline plan status is invalid.");
  }
  if (typeof releaseGateSummary.canUseAsNoSpendPlanningEvidence !== "boolean") {
    throw new RenderRequestAdmissionError("Stored short-pipeline plan release gate is invalid.");
  }
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    throw new RenderRequestAdmissionError("Stored short-pipeline plan must contain scene evidence before render handoff.");
  }
  if (!plan.reviewApproval || typeof plan.reviewApproval !== "object" || Array.isArray(plan.reviewApproval)) {
    throw new RenderRequestAdmissionError("Stored short-pipeline plan must contain review approval evidence.");
  }
  return plan as unknown as ShortPipelinePlan;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isJsonRecord(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an object.`);
  }
  return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an array.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RenderRequestAdmissionError(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  const array = requireArray(value, label);
  if (array.some((item) => typeof item !== "string" || !item.trim())) {
    throw new RenderRequestAdmissionError(`${label} must contain only non-empty strings.`);
  }
  return array as readonly string[];
}

function requirePositiveNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RenderRequestAdmissionError(`${label} must be a positive number.`);
  }
}

function requireNonNegativeNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RenderRequestAdmissionError(`${label} must be a non-negative number.`);
  }
}

function requireBoundedNumber(value: unknown, label: string, minimum: number, maximum: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RenderRequestAdmissionError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function requireIntegerCount(value: unknown, expected: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value !== expected) {
    throw new RenderRequestAdmissionError(`${label} must match its collection length.`);
  }
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new RenderRequestAdmissionError(`${label} must be a boolean when provided.`);
  }
  return value;
}

function conversationRole(value: unknown, index: number): ShortPipelineConversationRole {
  if (value === undefined) {
    return "user";
  }
  if (value === "user" || value === "assistant" || value === "operator") {
    return value;
  }
  throw new RenderRequestAdmissionError(`messages[${index}].role must be user, assistant, or operator when provided.`);
}

function optionalDate(value: unknown, label: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new RenderRequestAdmissionError(`${label} must be a valid date-time string when provided.`);
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RenderRequestAdmissionError(`${label} must be a positive integer when provided.`);
  }
  return value;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function readHeader(request: IncomingMessage, headerName: string): string | undefined {
  const value = request.headers[headerName];
  return typeof value === "string" ? value : undefined;
}

function readContentLength(request: IncomingMessage): number | undefined {
  const value = readHeader(request, "content-length")?.trim();
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function assertJsonContentType(request: IncomingMessage): void {
  if (!isApplicationJsonMediaType(readHeader(request, "content-type"))) {
    throw new UnsupportedMediaTypeError();
  }
}

function reserveCommercialRender(input: {
  readonly clientPolicyGate: ApiClientPolicyGate;
  readonly workspaceBillingGate: ApiWorkspaceBillingGate;
  readonly principal: ReturnType<ApiAuthGuard["authorize"]>["principal"];
  readonly request: CineJellyProjectRequest;
  readonly requestId: string;
  readonly channel: "sync" | "async";
}): CommercialRenderReservation {
  input.workspaceBillingGate.assertRenderAllowed({
    principal: input.principal,
    request: input.request,
    requestId: input.requestId,
    channel: input.channel
  });
  const clientPolicyReservation = input.clientPolicyGate.reserveRender({
    principal: input.principal,
    request: input.request,
    requestId: input.requestId,
    channel: input.channel
  });
  const workspaceBillingReservation = input.workspaceBillingGate.reserveRender({
    principal: input.principal,
    request: input.request,
    requestId: input.requestId,
    channel: input.channel
  });
  return {
    ...(clientPolicyReservation ? { clientPolicyReservation } : {}),
    ...(workspaceBillingReservation ? { workspaceBillingReservation } : {})
  };
}

function renderRequestBody(body: RenderRequestBody): CineJellyProjectRequest {
  const {
    reviewApprovalGate: _reviewApprovalGate,
    reviewApprovalCheckpoints: _reviewApprovalCheckpoints,
    preExportReviewApprovalGate: _preExportReviewApprovalGate,
    preExportReviewApprovalCheckpoints: _preExportReviewApprovalCheckpoints,
    ...renderBody
  } = body;
  return renderBody;
}

function renderJobReviewInputFromRenderBody(body: RenderRequestBody): RenderJobReviewInput | undefined {
  if (body.reviewApprovalGate === undefined && body.reviewApprovalCheckpoints === undefined) {
    return undefined;
  }
  return normalizeReviewApprovalInput({
    gate: body.reviewApprovalGate,
    checkpoints: body.reviewApprovalCheckpoints
  });
}

function evaluatePreRenderReviewApproval(
  system: ReviewApprovalSystem,
  requestId: string,
  request: CineJellyProjectRequest,
  reviewApproval: RenderJobReviewInput | undefined
): ReviewApprovalReport | undefined {
  if (!reviewApproval || reviewApproval.gate === "pre_export") {
    return undefined;
  }
  return system.evaluate({
    projectId: request.metadata?.projectId ?? requestId,
    ...(request.metadata?.requestId ? { requestId: request.metadata.requestId } : {}),
    gate: reviewApproval.gate ?? "pre_render",
    checkpoints: reviewApproval.checkpoints,
    generatedAt: new Date()
  });
}

function statusForSyncPreRenderReview(reviewApproval: ReviewApprovalReport): string {
  switch (reviewApproval.status) {
    case "approval_required":
      return "paused_for_review";
    case "changes_requested":
      return "paused_for_revision";
    case "rejected":
      return "rejected";
    case "blocked":
      return "blocked";
    case "approved":
      return "approved_for_render";
  }
}

function requestWithPreRenderApprovalMetadata(
  request: CineJellyProjectRequest,
  reviewApproval: ReviewApprovalReport | undefined
): CineJellyProjectRequest {
  if (!reviewApproval || reviewApproval.gate !== "pre_render" || reviewApproval.status !== "approved") {
    return request;
  }
  return {
    ...request,
    metadata: {
      ...(request.metadata ?? {}),
      storyboardApproval: "approved",
      storyboardReviewer: approvalReviewerSummary(reviewApproval),
      storyboardReviewedAt: approvalReviewedAt(reviewApproval).toISOString(),
      storyboardApprovalId: reviewApproval.approvalId,
      storyboardApprovalSource: "sync_render_pre_render_review"
    }
  };
}

function approvalReviewerSummary(reviewApproval: ReviewApprovalReport): string {
  const reviewers = [
    ...new Set(
      reviewApproval.checkpoints
        .map((checkpoint) => checkpoint.reviewer)
        .filter((reviewer): reviewer is string => Boolean(reviewer))
    )
  ].sort((left, right) => left.localeCompare(right));
  return reviewers.slice(0, 3).join(", ") || "Commercial reviewer";
}

function approvalReviewedAt(reviewApproval: ReviewApprovalReport): Date {
  return reviewApproval.checkpoints.reduce((latest, checkpoint) => {
    if (!checkpoint.reviewedAt || checkpoint.reviewedAt.getTime() <= latest.getTime()) {
      return latest;
    }
    return checkpoint.reviewedAt;
  }, reviewApproval.generatedAt);
}

function preExportReviewInputFromRenderBody(body: RenderRequestBody): RenderJobReviewInput | undefined {
  if (body.preExportReviewApprovalGate === undefined && body.preExportReviewApprovalCheckpoints === undefined) {
    return undefined;
  }
  const reviewInput = normalizeReviewApprovalInput({
    gate: body.preExportReviewApprovalGate ?? "pre_export",
    checkpoints: body.preExportReviewApprovalCheckpoints
  });
  if (reviewInput.gate !== "pre_export") {
    throw new RenderRequestAdmissionError("preExportReviewApprovalGate must be pre_export.");
  }
  return reviewInput;
}

function renderJobReviewInputFromReviewBody(body: RenderJobReviewRequestBody): RenderJobReviewInput {
  return normalizeReviewApprovalInput({
    gate: body.gate ?? body.reviewApprovalGate,
    checkpoints: body.checkpoints ?? body.reviewApprovalCheckpoints
  });
}

function normalizeReviewApprovalInput(input: {
  readonly gate?: unknown;
  readonly checkpoints?: unknown;
}): RenderJobReviewInput {
  const checkpoints = reviewApprovalCheckpoints(input.checkpoints);
  const gate = input.gate === undefined ? undefined : reviewApprovalGate(input.gate);
  return {
    ...(gate ? { gate } : {}),
    checkpoints
  };
}

function reviewApprovalCheckpoints(value: unknown): readonly ReviewApprovalCheckpointInput[] {
  if (!Array.isArray(value)) {
    throw new RenderRequestAdmissionError("reviewApprovalCheckpoints must be an array.");
  }
  if (value.length === 0) {
    throw new RenderRequestAdmissionError("reviewApprovalCheckpoints must contain at least one checkpoint.");
  }
  if (value.length > MAX_REVIEW_APPROVAL_CHECKPOINTS) {
    throw new RenderRequestAdmissionError(
      `reviewApprovalCheckpoints cannot contain more than ${MAX_REVIEW_APPROVAL_CHECKPOINTS} items.`
    );
  }
  return value.map((item, index) => reviewApprovalCheckpoint(item, index));
}

function reviewApprovalCheckpoint(value: unknown, index: number): ReviewApprovalCheckpointInput {
  const payload = jsonObject(value, `reviewApprovalCheckpoints[${index}] must be an object.`);
  return {
    surface: reviewApprovalSurface(payload.surface, index),
    label: boundedReviewText(payload.label, `reviewApprovalCheckpoints[${index}].label`, 240, true),
    ...(payload.subjectId !== undefined
      ? { subjectId: boundedReviewText(payload.subjectId, `reviewApprovalCheckpoints[${index}].subjectId`, 160, true) }
      : {}),
    ...(payload.required !== undefined
      ? { required: booleanReviewValue(payload.required, `reviewApprovalCheckpoints[${index}].required`) }
      : {}),
    ...(payload.decision !== undefined
      ? { decision: reviewApprovalDecision(payload.decision, `reviewApprovalCheckpoints[${index}].decision`) }
      : {}),
    ...(payload.reviewer !== undefined
      ? { reviewer: boundedReviewText(payload.reviewer, `reviewApprovalCheckpoints[${index}].reviewer`, 160, true) }
      : {}),
    ...(payload.reviewedAt !== undefined
      ? { reviewedAt: reviewApprovalDate(payload.reviewedAt, `reviewApprovalCheckpoints[${index}].reviewedAt`) }
      : {}),
    ...(payload.notes !== undefined
      ? { notes: boundedReviewText(payload.notes, `reviewApprovalCheckpoints[${index}].notes`, 1_000, true) }
      : {}),
    ...(payload.issueCodes !== undefined
      ? { issueCodes: reviewApprovalStringArray(payload.issueCodes, `reviewApprovalCheckpoints[${index}].issueCodes`, 80, 80) }
      : {}),
    ...(payload.evidence !== undefined
      ? { evidence: reviewApprovalEvidence(payload.evidence, `reviewApprovalCheckpoints[${index}].evidence`) }
      : {})
  };
}

function reviewApprovalGate(value: unknown): ReviewApprovalGate {
  if (value === "pre_render" || value === "pre_export") {
    return value;
  }
  throw new RenderRequestAdmissionError("reviewApprovalGate must be pre_render or pre_export.");
}

function reviewApprovalSurface(value: unknown, index: number): ReviewApprovalSurface {
  if (value === "scene" || value === "audio" || value === "caption" || value === "claim") {
    return value;
  }
  throw new RenderRequestAdmissionError(
    `reviewApprovalCheckpoints[${index}].surface must be scene, audio, caption, or claim.`
  );
}

function reviewApprovalDecision(value: unknown, label: string): ReviewApprovalDecision {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "changes_requested" ||
    value === "rejected" ||
    value === "blocked"
  ) {
    return value;
  }
  throw new RenderRequestAdmissionError(`${label} must use the review approval decision vocabulary.`);
}

function reviewApprovalEvidence(
  value: unknown,
  label: string
): Readonly<Record<string, ReviewApprovalEvidenceValue>> {
  const payload = jsonObject(value, `${label} must be an object.`);
  const entries = Object.entries(payload);
  if (entries.length > MAX_REVIEW_APPROVAL_EVIDENCE_ENTRIES) {
    throw new RenderRequestAdmissionError(
      `${label} cannot contain more than ${MAX_REVIEW_APPROVAL_EVIDENCE_ENTRIES} entries.`
    );
  }
  const evidence: Record<string, ReviewApprovalEvidenceValue> = {};
  for (const [key, item] of entries) {
    const safeKey = boundedReviewText(key, `${label}.key`, 80, true).replace(/\s+/g, "_");
    if (typeof item === "string") {
      evidence[safeKey] = boundedReviewText(item, `${label}.${safeKey}`, 1_000, true);
    } else if (typeof item === "number" && Number.isFinite(item)) {
      evidence[safeKey] = item;
    } else if (typeof item === "boolean") {
      evidence[safeKey] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
      evidence[safeKey] = reviewApprovalStringArray(item, `${label}.${safeKey}`, 500, MAX_REVIEW_APPROVAL_ARRAY_ITEMS);
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      evidence[safeKey] = item.slice(0, MAX_REVIEW_APPROVAL_ARRAY_ITEMS);
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "boolean")) {
      evidence[safeKey] = item.slice(0, MAX_REVIEW_APPROVAL_ARRAY_ITEMS);
    } else {
      throw new RenderRequestAdmissionError(`${label}.${safeKey} has an unsupported review evidence value.`);
    }
  }
  return evidence;
}

function reviewApprovalStringArray(
  value: unknown,
  label: string,
  maxItemLength: number,
  maxItems: number
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new RenderRequestAdmissionError(`${label} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new RenderRequestAdmissionError(`${label} cannot contain more than ${maxItems} items.`);
  }
  return value.map((item, index) => boundedReviewText(item, `${label}[${index}]`, maxItemLength, true));
}

function reviewApprovalDate(value: unknown, label: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value !== "string") {
    throw new RenderRequestAdmissionError(`${label} must be an ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RenderRequestAdmissionError(`${label} must be an ISO timestamp.`);
  }
  return parsed;
}

function booleanReviewValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new RenderRequestAdmissionError(`${label} must be a boolean.`);
  }
  return value;
}

function boundedReviewText(value: unknown, label: string, maxLength: number, required: boolean): string {
  if (typeof value !== "string") {
    throw new RenderRequestAdmissionError(`${label} must be a string.`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (required && !normalized) {
    throw new RenderRequestAdmissionError(`${label} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new RenderRequestAdmissionError(`${label} cannot exceed ${maxLength} characters.`);
  }
  if (REVIEW_TEXT_CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new RenderRequestAdmissionError(`${label} must not contain control characters.`);
  }
  return normalized;
}

function jsonObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RenderRequestAdmissionError(message);
  }
  return value as Record<string, unknown>;
}

/** Current total byte size and file count of the uploads directory (for the disk-usage guard). */
async function uploadsDirectoryUsage(dir: string): Promise<{ readonly totalBytes: number; readonly fileCount: number }> {
  let totalBytes = 0;
  let fileCount = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { totalBytes: 0, fileCount: 0 };
  }
  for (const name of names) {
    try {
      const fileStat = await stat(join(dir, name));
      if (fileStat.isFile()) {
        totalBytes += fileStat.size;
        fileCount += 1;
      }
    } catch {
      // A file that vanished mid-scan does not count.
    }
  }
  return { totalBytes, fileCount };
}

function clientFilter(principal: ReturnType<ApiAuthGuard["authorize"]>["principal"]): { readonly clientId?: string } {
  if (principal?.kind === "client" && principal.clientId) {
    return { clientId: principal.clientId };
  }
  if (principal?.kind === "user" && principal.userId) {
    // Customer jobs are scoped per account so users only ever see their own jobs.
    return { clientId: `user:${principal.userId}` };
  }
  return {};
}

/**
 * When CINEJELLY_CUSTOMER_AUTO_RUN=true, a customer's render skips the operator review pause
 * and runs immediately ("gửi là chạy"): the credits are charged at submit and the job goes
 * straight to the queue. Operator/API principals are unaffected. Default off keeps the review
 * gate. The operator can still watch every job in the admin desk.
 */
function customerAutoRunEnabled(principal: ReturnType<ApiAuthGuard["authorize"]>["principal"]): boolean {
  return (process.env.CINEJELLY_CUSTOMER_AUTO_RUN ?? "").trim().toLowerCase() === "true" && principal?.kind === "user";
}

/**
 * Customers must never see internal problems — only progress. Strip the diagnostic surface
 * (raw errors, operator-hold reasons, provider ledger/checkpoints, artifacts, reviewer
 * notes, stage-event internals) from a job summary before it reaches a customer. Operators
 * (deployment token) get the full summary so they can actually fix a held job. Status and
 * progress fields stay, so the customer still sees "processing / succeeded / (refunded)".
 */
function jobSummaryForPrincipal(
  summary: RenderJobSummary,
  principal: ReturnType<ApiAuthGuard["authorize"]>["principal"]
): RenderJobSummary & { readonly progressHighlights?: readonly string[] } {
  if (principal?.kind !== "user") {
    return summary;
  }
  // Strip the internal DIAGNOSTIC surface (raw errors, hold reasons, provider ledger, stage
  // event internals, artifacts, result payload). Keep the review-approval WORKFLOW state —
  // that is legitimate status for the customer ("in review / approved"), not an internal
  // problem, and the operator desk still reads full checkpoints via the deployment token.
  const {
    error: _error,
    operatorHoldReason: _operatorHoldReason,
    operatorHoldAttempts: _operatorHoldAttempts,
    firstOperatorHoldAt: _firstOperatorHoldAt,
    lastOperatorHoldAt: _lastOperatorHoldAt,
    costLedger: _costLedger,
    providerCheckpoint: _providerCheckpoint,
    artifacts: _artifacts,
    artifactValidation: _artifactValidation,
    result: _result,
    stageProgressEvents: _stageProgressEvents,
    ...safe
  } = summary;
  void _error;
  void _operatorHoldReason;
  void _operatorHoldAttempts;
  void _firstOperatorHoldAt;
  void _lastOperatorHoldAt;
  void _costLedger;
  void _providerCheckpoint;
  void _artifacts;
  void _artifactValidation;
  void _result;
  // Customer-safe progress highlights: a WHITELIST of quality milestones (talking-shot avatar
  // routing, keyframe anchoring) rendered as friendly copy — never raw internal stage events.
  const progressHighlights = (_stageProgressEvents ?? [])
    .map((event) => {
      if (typeof event.message !== "string") {
        return "";
      }
      const evidence = (event.evidence ?? {}) as Record<string, unknown>;
      if (event.message.includes("Talking-shot voicing completed")) {
        const routed = Number(evidence.avatarRoutedCount ?? 0);
        const total = Number(evidence.talkingShotCount ?? 0);
        return total > 0 ? `🎤 ${routed}/${total} cảnh nói được lồng tiếng khớp môi (avatar AI)` : "";
      }
      if (event.message.includes("Keyframe still generation completed")) {
        return "🖼 Đã tạo ảnh mở đầu từng cảnh (khóa nhận diện nhân vật/sản phẩm)";
      }
      return "";
    })
    .filter((line): line is string => Boolean(line))
    .slice(-4);
  return { ...safe, hasError: false, ...(progressHighlights.length > 0 ? { progressHighlights } : {}) };
}

/**
 * Customer render billing: predictable credits charged up front (fail 402 before any
 * provider spend), refunded automatically when the job is canceled or fails.
 */
/**
 * Customer-safe view of metered pricing: credits-per-render-second per speed tier (video cost ×
 * overhead ÷ credit basis) + the candidate multiplier per quality. Lets the studio compute a
 * clip's credit price client-side WITHOUT exposing the raw Atlas USD cost. `cheapestTier` powers
 * the logged-out "from Xđ" teaser.
 */
function buildPipelinePricingDescriptor(
  config: PipelineCostConfig,
  env: NodeJS.ProcessEnv
): {
  readonly enabled: boolean;
  readonly creditsPerRenderSecondByTier: Readonly<Record<string, number>>;
  readonly candidateCountByQuality: Readonly<Record<string, number>>;
  readonly repairCountByQuality: Readonly<Record<string, number>>;
  readonly testTakeSecondsPerShot: number;
  readonly avgSecondsPerShot: number;
  readonly minimumChargeCredits: number;
  readonly cheapestTier: string;
} {
  const basis = config.creditCostBasisUsd > 0 ? config.creditCostBasisUsd : 0.01;
  const overhead = config.overheadMultiplier >= 1 ? config.overheadMultiplier : 1;
  const creditsPerRenderSecondByTier: Record<string, number> = {};
  let cheapestTier = "mini";
  let cheapestRate = Infinity;
  for (const [tier, usdPerSecond] of Object.entries(config.videoCostUsdPerSecondByTier)) {
    const rate = Math.round(((usdPerSecond * overhead) / basis) * 1000) / 1000;
    creditsPerRenderSecondByTier[tier] = rate;
    if (rate < cheapestRate) {
      cheapestRate = rate;
      cheapestTier = tier;
    }
  }
  return {
    enabled: (env.CINEJELLY_PIPELINE_PRICING ?? "").trim().toLowerCase() === "true",
    creditsPerRenderSecondByTier,
    candidateCountByQuality: config.candidateCountByQuality,
    // Counts/multipliers only — NOT raw Atlas USD — so the studio can mirror the FULL billed-seconds
    // formula (candidate + repair passes + test-takes) and show the same price the server will charge.
    repairCountByQuality: config.repairCountByQuality,
    testTakeSecondsPerShot: config.testTakeSecondsPerShot,
    avgSecondsPerShot: config.avgSecondsPerShot,
    minimumChargeCredits: config.minimumChargeCredits,
    cheapestTier
  };
}

function planUserRenderCharge(input: {
  readonly principal: ReturnType<ApiAuthGuard["authorize"]>["principal"];
  readonly store: UserAccountStore;
  readonly pricing: RenderCreditPricing;
  readonly pipelineCost?: PipelineCostConfig;
  readonly request: {
    readonly settings?: { readonly durationTargetSeconds?: number; readonly qualityMode?: string; readonly tier?: string };
    readonly modelPreferences?: { readonly seedanceModelId?: string };
  };
}): { readonly userId: string; readonly credits: number } | undefined {
  if (input.principal?.kind !== "user" || !input.principal.userId) {
    return undefined;
  }
  if ((input.request as { metadata?: { workspaceId?: string } }).metadata?.workspaceId) {
    // Workspace billing is an operator/enterprise construct; a customer account must not
    // be able to pin renders onto (and drain) another tenant's workspace quota.
    throw new UserAccountError("Tài khoản khách không dùng workspace billing.", 403);
  }
  // Metered pipeline pricing: charge the REAL provider cost of this clip (video render seconds ×
  // the quality's candidate passes × the tier's Atlas $/second, + overhead), converted to credits.
  // Gated behind CINEJELLY_PIPELINE_PRICING so the rollout is deliberate; falls back to the legacy
  // per-second model when the flag is off (keeps existing behavior/tests stable).
  const usePipeline =
    input.pipelineCost !== undefined && (process.env.CINEJELLY_PIPELINE_PRICING ?? "").trim().toLowerCase() === "true";
  // Anti-underpay: a customer who pins a specific model via modelPreferences.seedanceModelId can
  // run a pricier model than settings.tier implies. Bill the most expensive tier in that case so
  // model pinning can never undercut the tier rate.
  const billedTier = input.request.modelPreferences?.seedanceModelId ? "standard" : input.request.settings?.tier;
  const credits = usePipeline && input.pipelineCost
    ? estimatePipelineRenderCredits({
        ...(input.request.settings?.durationTargetSeconds !== undefined
          ? { durationTargetSeconds: input.request.settings.durationTargetSeconds }
          : {}),
        ...(input.request.settings?.qualityMode ? { qualityMode: input.request.settings.qualityMode } : {}),
        ...(billedTier ? { tier: billedTier } : {}),
        config: input.pipelineCost
      }).credits
    : estimateRenderCredits({
        ...(input.request.settings?.durationTargetSeconds !== undefined
          ? { durationTargetSeconds: input.request.settings.durationTargetSeconds }
          : {}),
        ...(input.request.settings?.qualityMode ? { qualityMode: input.request.settings.qualityMode } : {}),
        pricing: input.pricing
      });
  const balanceCredits = input.store.balanceOf(input.principal.userId);
  if (balanceCredits < credits) {
    throw new UserAccountError(
      `Số dư không đủ: video này cần ${credits} credits, bạn đang có ${balanceCredits}. Hãy nạp thêm để tiếp tục.`,
      402
    );
  }
  return { userId: input.principal.userId, credits };
}

/**
 * Phí dịch phụ đề/thuyết minh tính theo ĐỘ DÀI THẬT của video nguồn (× "credits mỗi giây"),
 * và khách luôn được BÁO GIÁ + XÁC NHẬN trước khi trừ (handshake quote/acknowledgedCredits).
 * Hằng số này chỉ là mức tối thiểu dự phòng khi không đọc được thời lượng (ffprobe lỗi).
 */
const REDUB_FALLBACK_SECONDS = 5;
/** Hệ số phụ phí khi renderVideo=true (thi hành lồng tiếng thật: TTS trả phí mỗi đoạn + trộn). */
const REDUB_RENDER_VIDEO_SURCHARGE = (() => {
  const parsed = Number(process.env.CINEJELLY_REDUB_RENDER_SURCHARGE || "1.5");
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1.5;
})();
/** Tên file được phép tải về từ một thư mục redub — chặn mọi tên khác (path traversal). */
const REDUB_DOWNLOADABLE_FILE = /^(dubbed\.mp4|dub-script\.txt|subtitles-[a-z]{2}(?:-[a-z0-9]{2,8})?\.srt)$/;

/** Hard cap on redub source length so provider spend can never outrun the credits charged. */
const REDUB_MAX_SOURCE_SECONDS = 600;
// Low-bitrate floor (~200 kbps). A SMALLER bytes/second yields a LARGER (safer) worst-case duration,
// so when ffprobe cannot read a source we still bill at least what its byte size could contain.
const REDUB_WORST_CASE_BYTES_PER_SECOND = 25000;

/**
 * Money-safe fallback when ffprobe cannot read a redub source's real duration: estimate the longest
 * clip its byte size could hold (bounded by the 600s cap), so a failed probe over-estimates rather
 * than collapsing to the 5s minimum. Falls back to the hard cap if the file cannot even be stat()ed.
 */
async function worstCaseRedubSecondsFromBytes(localPath: string): Promise<number> {
  try {
    const info = await stat(localPath);
    const seconds = Math.ceil(info.size / REDUB_WORST_CASE_BYTES_PER_SECOND);
    return Math.min(REDUB_MAX_SOURCE_SECONDS, Math.max(REDUB_FALLBACK_SECONDS, seconds));
  } catch {
    return REDUB_MAX_SOURCE_SECONDS;
  }
}

/**
 * Statuses that commit the customer's money at submission time: the job either runs now
 * (queued) or waits for operator review before running (paused_*). Born-rejected/blocked
 * submissions never charge. Every non-success terminal transition refunds automatically.
 */
function chargeableSubmissionStatus(status: string): boolean {
  return status === "queued" || status === "paused_for_review" || status === "paused_for_revision";
}

function userIdFromClientId(clientId: string | undefined): string | undefined {
  return clientId?.startsWith("user:") ? clientId.slice("user:".length) : undefined;
}

function assertNotUserPrincipal(
  principal: ReturnType<ApiAuthGuard["authorize"]>["principal"],
  message: string
): void {
  if (principal?.kind === "user") {
    throw new UserAccountError(message, 403);
  }
}

function requireUserPrincipal(
  principal: ReturnType<ApiAuthGuard["authorize"]>["principal"]
): { readonly userId: string } {
  if (principal?.kind !== "user" || !principal.userId) {
    throw new UserAccountError("Cần đăng nhập tài khoản để dùng chức năng này.", 401);
  }
  return { userId: principal.userId };
}

function assertDeploymentPrincipal(
  principal: ReturnType<ApiAuthGuard["authorize"]>["principal"],
  message = "Deployment API token is required for admin client-policy diagnostics."
): void {
  if (principal?.kind !== "deployment") {
    throw new ApiClientPolicyError(message, 403);
  }
}

function renderJobHistoryStoreConfig(env: NodeJS.ProcessEnv): { readonly historyStore?: RenderJobHistoryStore } {
  const historyPath = readRenderJobHistoryPath(env);
  return historyPath
    ? { historyStore: new RenderJobHistoryStore({
        historyPath,
        historyLimit: readPositiveInteger(env.CINEJELLY_API_JOB_HISTORY_LIMIT, 100)
      }) }
    : {};
}

function shortPipelineSessionStoreConfig(env: NodeJS.ProcessEnv): ShortPipelineSessionStore | undefined {
  const storePath = readShortPipelineSessionStorePath(env);
  return storePath
    ? new ShortPipelineSessionStore({
        storePath,
        maxSessions: readPositiveInteger(env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_LIMIT, 200)
      })
    : undefined;
}

function shortChannelStyleLibraryStoreConfig(env: NodeJS.ProcessEnv): ShortChannelStyleLibraryStore | undefined {
  const storePath = readShortChannelStyleLibraryPath(env);
  return storePath
    ? new ShortChannelStyleLibraryStore({
        storePath,
        maxProfiles: readPositiveInteger(env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_LIMIT, 200)
      })
    : undefined;
}

function requireShortPipelineSessionStore(store: ShortPipelineSessionStore | undefined): ShortPipelineSessionStore {
  if (!store) {
    throw new ShortPipelineSessionStoreUnavailableError();
  }
  return store;
}

function requireShortChannelStyleLibraryStore(
  store: ShortChannelStyleLibraryStore | undefined
): ShortChannelStyleLibraryStore {
  if (!store) {
    throw new ShortChannelStyleLibraryUnavailableError();
  }
  return store;
}

function storedShortPipelineSessionResponse(
  store: ShortPipelineSessionStore,
  record: ShortPipelineStoredSessionRecord
): Record<string, unknown> {
  return {
    ...store.summaryFor(record),
    schemaVersion: record.schemaVersion
  };
}

function storedShortChannelStyleResponse(
  store: ShortChannelStyleLibraryStore,
  record: ShortChannelStyleLibraryRecord
): Record<string, unknown> {
  return {
    ...store.summaryFor(record),
    schemaVersion: record.schemaVersion
  };
}

function renderProviderLeaseServiceConfig(env: NodeJS.ProcessEnv): RenderProviderHandoffLeaseService | undefined {
  const leasePath = readRenderProviderLeasePath(env);
  return leasePath
    ? new RenderProviderHandoffLeaseService({
        leaseStore: new SerializedRenderProviderHandoffLeaseStore(
          new FileRenderProviderHandoffLeaseStore({
            leasePath,
            maxRecords: readPositiveInteger(env.CINEJELLY_RENDER_PROVIDER_LEASE_MAX_RECORDS, 500)
          })
        )
      })
    : undefined;
}

function productionGraphResumeQueueServiceConfig(env: NodeJS.ProcessEnv): ProductionGraphResumeQueueService | undefined {
  const queuePath = readProductionGraphResumeQueuePath(env);
  return queuePath
    ? createProductionGraphResumeQueueService({
        queuePath,
        maxRecords: readPositiveInteger(env.CINEJELLY_PRODUCTION_GRAPH_RESUME_QUEUE_MAX_RECORDS, 1_000)
      })
    : undefined;
}

function renderProviderLeaseOperationFor(pathname: string): string | undefined {
  if (!pathname.startsWith(`${RENDER_PROVIDER_HANDOFF_LEASE_SERVICE_PATH}/`)) {
    return undefined;
  }
  const operation = pathname.slice(RENDER_PROVIDER_HANDOFF_LEASE_SERVICE_PATH.length + 1);
  return operation && !operation.includes("/") ? operation : undefined;
}

function productionGraphResumeQueueOperationFor(pathname: string): string | undefined {
  if (!pathname.startsWith(`${PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH}/`)) {
    return undefined;
  }
  const operation = pathname.slice(PRODUCTION_GRAPH_RESUME_QUEUE_SERVICE_PATH.length + 1);
  return operation && !operation.includes("/") ? operation : undefined;
}

function registerShutdownHandlers(
  server: Server,
  jobManager: RenderJobManager,
  shutdownCoordinator: ApiShutdownCoordinator
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const reason = `CineJelly API received ${signal}; canceling active render work for deployment shutdown.`;
    jobManager.stopOperatorHoldSweep();
    const abortedRequestCount = shutdownCoordinator.abortActiveRequests(reason);
    const canceledJobs = jobManager.cancelAll(reason);
    console.log(
      `CineJelly API shutting down after ${signal}; aborted ${abortedRequestCount} active request(s), canceled ${canceledJobs.length} render job(s).`
    );
    server.close((error) => {
      if (error) {
        console.error("CineJelly API shutdown failed.", error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  startServer();
}
