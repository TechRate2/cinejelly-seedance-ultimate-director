/**
 * Production HTTP entrypoint for CineJelly's one-input render pipeline.
 * It exposes a small JSON API without adding framework dependencies.
 */

import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse
} from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectorRuntime } from "../application/director-factory.js";
import {
  normalizeRenderRequest,
  RenderRequestNormalizationError
} from "../application/render-request-normalizer.js";
import { buildRenderSettingsDescriptor } from "../application/render-settings-descriptor.js";
import { RuntimePreflight } from "../application/runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "../application/validation-readiness-report.js";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import { ProjectArtifactStore } from "../core/project-artifact-store.js";
import {
  mergeProductUrlSnapshots,
  ProductUrlResearcher,
  safeProductUrlResearchSummary
} from "../core/product-url-researcher.js";
import { ShortPipelineConversationEngine } from "../core/short-pipeline-conversation.js";
import { ShortPipelinePlanner } from "../core/short-pipeline-planner.js";
import {
  buildShortPipelineRenderHandoff,
  reviewInputCanQueueRender,
  type ShortPipelineRenderHandoffReviewInput
} from "../core/short-pipeline-render-handoff.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { ProjectArtifactBundle, ProjectArtifactValidationReport } from "../types/artifact.js";
import type { CostLedgerEntry } from "../types/provider.js";
import type {
  ReviewApprovalCheckpointInput,
  ReviewApprovalDecision,
  ReviewApprovalEvidenceValue,
  ReviewApprovalGate,
  ReviewApprovalSurface
} from "../types/review-approval.js";
import type {
  ShortPipelineConversationInput,
  ShortPipelineConversationMessageInput,
  ShortPipelineConversationRole,
  ShortPipelinePlan,
  ShortPipelinePlanInput
} from "../types/short-pipeline.js";
import { redactUnknown } from "../utils/redaction.js";
import { redactApiLocalPaths } from "./api-response-redaction.js";
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
  type RenderJobReviewInput
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
  readShortPipelineSessionStorePath,
  ShortPipelineSessionStore,
  type ShortPipelineStoredSessionRecord
} from "./short-pipeline-session-store.js";
import {
  ApiWorkspaceBillingError,
  ApiWorkspaceBillingGate,
  type ApiWorkspaceBillingReservation
} from "./workspace-billing-policy.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,160}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const REVIEW_TEXT_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_REVIEW_APPROVAL_CHECKPOINTS = 120;
const MAX_REVIEW_APPROVAL_EVIDENCE_ENTRIES = 60;
const MAX_REVIEW_APPROVAL_ARRAY_ITEMS = 80;

interface RenderRequestBody extends CineJellyProjectRequest {
  readonly outputPath?: string;
  readonly workDirectory?: string;
  readonly artifactDirectory?: string;
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
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
}

interface ShortPipelineProductUrlPlanRequestBody extends ShortPipelinePlanInput {
  readonly confirmLiveNetwork?: boolean;
  readonly maxProductUrlBytes?: number;
  readonly productResearchTimeoutMs?: number;
}

interface NormalizedShortPipelineProductUrlPlanBody {
  readonly planInput: ShortPipelinePlanInput;
  readonly confirmLiveNetwork: boolean;
  readonly maxProductUrlBytes?: number;
  readonly productResearchTimeoutMs?: number;
}

interface ShortPipelineRenderJobRequestBody {
  readonly planInput?: ShortPipelinePlanInput;
  readonly reviewApprovalGate?: ReviewApprovalGate;
  readonly reviewApprovalCheckpoints?: readonly ReviewApprovalCheckpointInput[];
  readonly confirmRenderSubmission?: boolean;
  readonly includeGeneratedAudioIntents?: boolean;
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

class ShortPipelineSessionStoreUnavailableError extends Error {
  public readonly statusCode = 503;

  public constructor() {
    super("CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH is required before durable short-pipeline conversation sessions can be used.");
    this.name = "ShortPipelineSessionStoreUnavailableError";
  }
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
  const shortPipelineSessionStore = shortPipelineSessionStoreConfig(process.env);
  const requestAdmission = renderRequestAdmissionFromEnv(process.env);
  const clientPolicyGate = ApiClientPolicyGate.fromEnv(process.env);
  const workspaceBillingGate = ApiWorkspaceBillingGate.fromEnv(process.env);
  const apiAuthGuard = new ApiAuthGuard({
    disabled: readApiAuthDisabled(process.env.CINEJELLY_DISABLE_API_AUTH),
    ...(process.env.CINEJELLY_API_AUTH_TOKEN ? { sharedKey: process.env.CINEJELLY_API_AUTH_TOKEN } : {}),
    clientKeys: clientPolicyGate.authClientKeys()
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
  const jobManager = new RenderJobManager({
    artifactStore,
    maxConcurrentJobs: readPositiveInteger(process.env.CINEJELLY_API_JOB_CONCURRENCY, 1),
    historyLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_HISTORY_LIMIT, 100),
    queueLimit: readPositiveInteger(process.env.CINEJELLY_API_JOB_QUEUE_LIMIT, 50),
    ...renderJobHistoryStoreConfig(process.env)
  });
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
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/conversation") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelineConversationRequestBody>(request, maxBodyBytes);
        const session = shortPipelineConversationEngine.buildSession(
          shortPipelineConversationInputFromBody(body, requestContext.requestId)
        );
        sendJson(response, session.plan.status === "blocked" ? 422 : 200, session, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/conversation-sessions") {
        assertJsonContentType(request);
        const store = requireShortPipelineSessionStore(shortPipelineSessionStore);
        const body = await readJsonBody<ShortPipelineConversationRequestBody>(request, maxBodyBytes);
        const session = shortPipelineConversationEngine.buildSession(
          shortPipelineConversationInputFromBody(body, requestContext.requestId)
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
        const body = await readJsonBody<ShortPipelineConversationSessionRenderJobRequestBody>(request, maxBodyBytes);
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
            : {})
        });
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
        let commercialReservation: CommercialRenderReservation | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          reviewApproval: handoff.reviewApproval,
          onAccepted: () => {
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          }
        });
        sendJson(response, 202, {
          shortPipelineSession: storedShortPipelineSessionResponse(store, record),
          shortPipeline: {
            ...handoff.summary,
            sessionId: record.sessionId
          },
          ...submission.summary,
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
        const body = await readJsonBody<ShortPipelinePlanInput>(request, maxBodyBytes);
        const plan = shortPipelinePlanner.buildPlan(shortPipelinePlanInputFromBody(body, requestContext.requestId));
        sendJson(response, plan.status === "blocked" ? 422 : 200, plan, requestContext);
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/short-pipeline/product-url-plan") {
        assertJsonContentType(request);
        const body = await readJsonBody<ShortPipelineProductUrlPlanRequestBody>(request, maxBodyBytes);
        const productUrlBody = shortPipelineProductUrlPlanBodyFromBody(body, requestContext.requestId);
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
        const body = await readJsonBody<ShortPipelineRenderJobRequestBody>(request, maxBodyBytes);
        const handoffBody = shortPipelineRenderJobBodyFromBody(body, requestContext.requestId);
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
          ...(handoffBody.references ? { references: handoffBody.references } : {}),
          ...(handoffBody.metadata ? { metadata: handoffBody.metadata } : {}),
          ...(handoffBody.outputPath ? { outputPath: handoffBody.outputPath } : {}),
          ...(handoffBody.workDirectory ? { workDirectory: handoffBody.workDirectory } : {}),
          ...(handoffBody.artifactDirectory ? { artifactDirectory: handoffBody.artifactDirectory } : {}),
          ...(handoffBody.includeGeneratedAudioIntents !== undefined
            ? { includeGeneratedAudioIntents: handoffBody.includeGeneratedAudioIntents }
            : {})
        });
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
        let commercialReservation: CommercialRenderReservation | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          reviewApproval: handoff.reviewApproval,
          onAccepted: () => {
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          }
        });
        sendJson(response, 202, {
          shortPipeline: handoff.summary,
          ...submission.summary,
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
          jobs: jobManager.list(clientFilter(authDecision.principal))
        }, requestContext);
        return;
      }
      const jobReviewMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)\/review$/);
      if (request.method === "POST" && jobReviewMatch) {
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
              ...submission.summary,
              queuedForRender: submission.queuedForRender,
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
      const jobMatch = requestUrl.pathname.match(/^\/v1\/render-jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobManager.get(decodeURIComponent(jobMatch[1] ?? ""), clientFilter(authDecision.principal));
        sendJson(response, job ? 200 : 404, job ?? { error: "Render job not found." }, requestContext);
        return;
      }
      if (request.method === "DELETE" && jobMatch) {
        const job = jobManager.cancel(decodeURIComponent(jobMatch[1] ?? ""), clientFilter(authDecision.principal));
        sendJson(response, job ? 202 : 404, job ?? { error: "Render job not found." }, requestContext);
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/v1/admin/client-policy") {
        assertDeploymentPrincipal(authDecision.principal);
        sendJson(response, 200, clientPolicyGate.summary(), requestContext);
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
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        const renderBody = renderRequestBody(body);
        const reviewApproval = renderJobReviewInputFromRenderBody(body);
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
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        let commercialReservation: CommercialRenderReservation | undefined;
        const submission = jobManager.submit({
          request: normalizedRequest,
          artifactDirectory,
          ...clientFilter(authDecision.principal),
          ...(idempotencyKeyDigest ? { idempotencyKeyDigest } : {}),
          ...(requestFingerprint ? { requestFingerprint } : {}),
          ...(reviewApproval ? { reviewApproval } : {}),
          onAccepted: () => {
            commercialReservation = reserveCommercialRender({
              clientPolicyGate,
              workspaceBillingGate,
              principal: authDecision.principal,
              request: normalizedRequest,
              requestId: requestContext.requestId,
              channel: "async"
            });
          }
        });
        sendJson(response, 202, {
          ...submission.summary,
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
        assertJsonContentType(request);
        const body = await readJsonBody<RenderRequestBody>(request, maxBodyBytes);
        const renderBody = renderRequestBody(body);
        requestAdmission.assertAcceptable(renderBody);
        const normalizedRequest = normalizeRenderRequest(renderBody, {
          requestId: requestContext.requestId,
          env: process.env
        });
        const artifactDirectory = normalizedRequest.artifactDirectory || join(normalizedRequest.workDirectory || ".", "artifacts");
        const commercialReservation = reserveCommercialRender({
          clientPolicyGate,
          workspaceBillingGate,
          principal: authDecision.principal,
          request: normalizedRequest,
          requestId: requestContext.requestId,
          channel: "sync"
        });
        const renderLease = syncRenderGate.tryAcquire();
        if (!renderLease.allowed) {
          sendJson(response, renderLease.statusCode, {
            error: renderLease.message,
            retryAfterSeconds: renderLease.retryAfterSeconds
          }, requestContext, retryAfterHeaders(renderLease.retryAfterSeconds));
          return;
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
            error: redactUnknown(renderError instanceof Error ? renderError.message : String(renderError)),
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
      sendJson(response, errorStatusCode(error), {
        error: redactUnknown(error instanceof Error ? error.message : String(error)),
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
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(redactApiLocalPaths(redactUnknown(withRequestContext(payload, requestContext)))));
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
  return error instanceof RenderRequestAdmissionError ||
    error instanceof RenderRequestNormalizationError ||
    error instanceof RenderJobCapacityError ||
    error instanceof RenderJobIdempotencyConflictError ||
    error instanceof RenderJobReviewStateError ||
    error instanceof UnsupportedMediaTypeError ||
    error instanceof RequestBodyTooLargeError ||
    error instanceof ShortPipelineRenderHandoffError ||
    error instanceof ShortPipelineSessionStoreUnavailableError ||
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
  requestId: string
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
  return {
    projectId: body.projectId,
    requestId: body.requestId ?? requestId,
    messages,
    ...(body.product ? { product: body.product } : {}),
    ...(body.brandKit ? { brandKit: body.brandKit } : {}),
    ...(body.preferredTemplateId ? { preferredTemplateId: body.preferredTemplateId } : {}),
    ...(body.allowTemplateSuggestions !== undefined
      ? { allowTemplateSuggestions: optionalBoolean(body.allowTemplateSuggestions, "allowTemplateSuggestions") ?? true }
      : {}),
    ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
    ...(body.targetDurationSeconds !== undefined ? { targetDurationSeconds: body.targetDurationSeconds } : {}),
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

function shortPipelinePlanInputFromBody(body: ShortPipelinePlanInput, requestId: string): ShortPipelinePlanInput {
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
  return {
    ...body,
    requestId: body.requestId ?? requestId
  };
}

function shortPipelineProductUrlPlanBodyFromBody(
  body: ShortPipelineProductUrlPlanRequestBody,
  requestId: string
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
    ...(body.preferredTemplateId ? { preferredTemplateId: body.preferredTemplateId } : {}),
    ...(body.allowTemplateSuggestions !== undefined ? { allowTemplateSuggestions: body.allowTemplateSuggestions } : {}),
    ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
    ...(body.targetDurationSeconds !== undefined ? { targetDurationSeconds: body.targetDurationSeconds } : {}),
    ...(body.generatedAt ? { generatedAt: body.generatedAt } : {})
  }, requestId);
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
  requestId: string
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
  const reviewApproval = body.reviewApprovalGate !== undefined || body.reviewApprovalCheckpoints !== undefined
    ? normalizeReviewApprovalInput({
        gate: body.reviewApprovalGate,
        checkpoints: body.reviewApprovalCheckpoints
      })
    : undefined;
  return {
    planInput: shortPipelinePlanInputFromBody(body.planInput, requestId),
    ...(reviewApproval ? { reviewApproval } : {}),
    confirmRenderSubmission,
    ...(includeGeneratedAudioIntents !== undefined ? { includeGeneratedAudioIntents } : {}),
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
  const reviewApproval = body.reviewApprovalGate !== undefined || body.reviewApprovalCheckpoints !== undefined
    ? normalizeReviewApprovalInput({
        gate: body.reviewApprovalGate,
        checkpoints: body.reviewApprovalCheckpoints
      })
    : undefined;
  return {
    ...(reviewApproval ? { reviewApproval } : {}),
    confirmRenderSubmission,
    ...(includeGeneratedAudioIntents !== undefined ? { includeGeneratedAudioIntents } : {}),
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
  const { reviewApprovalGate: _reviewApprovalGate, reviewApprovalCheckpoints: _reviewApprovalCheckpoints, ...renderBody } = body;
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

function clientFilter(principal: ReturnType<ApiAuthGuard["authorize"]>["principal"]): { readonly clientId?: string } {
  return principal?.kind === "client" && principal.clientId ? { clientId: principal.clientId } : {};
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

function requireShortPipelineSessionStore(store: ShortPipelineSessionStore | undefined): ShortPipelineSessionStore {
  if (!store) {
    throw new ShortPipelineSessionStoreUnavailableError();
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
