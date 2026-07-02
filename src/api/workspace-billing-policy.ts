/**
 * Workspace, project, and billing quota foundation for commercial render traffic.
 * It is opt-in so local/operator workflows keep working until customer workspaces are configured.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizeSeedanceSettings } from "../config/seedance-settings.js";
import type { CineJellyProjectRequest } from "../types/agent.js";
import type { QualityMode, SpeedTier } from "../types/settings.js";
import type { ApiAuthPrincipal } from "./api-auth.js";

export type ApiWorkspaceBillingErrorStatusCode = 400 | 403 | 429 | 503;

export class ApiWorkspaceBillingError extends Error {
  public readonly statusCode: ApiWorkspaceBillingErrorStatusCode;
  public readonly retryAfterSeconds?: number;

  public constructor(message: string, statusCode: ApiWorkspaceBillingErrorStatusCode, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiWorkspaceBillingError";
    this.statusCode = statusCode;
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}

export interface ApiWorkspaceProjectPolicy {
  readonly projectId: string;
  readonly enabled: boolean;
  readonly displayName?: string;
  readonly monthlyRequestLimit?: number;
  readonly monthlyReservedCostUsdLimit?: number;
  readonly maxReservedCostUsdPerRequest?: number;
  readonly defaultReservedCostUsdPerRequest?: number;
}

export interface ApiWorkspacePolicy {
  readonly workspaceId: string;
  readonly enabled: boolean;
  readonly displayName?: string;
  readonly planId?: string;
  readonly clientIds?: readonly string[];
  readonly monthlyRequestLimit?: number;
  readonly monthlyReservedCostUsdLimit?: number;
  readonly maxReservedCostUsdPerRequest?: number;
  readonly defaultReservedCostUsdPerRequest?: number;
  readonly creditBalanceUsd?: number;
  readonly projects?: readonly ApiWorkspaceProjectPolicy[];
}

export interface ApiWorkspaceBillingSettings {
  readonly workspaces: readonly ApiWorkspacePolicy[];
  readonly requireWorkspaceForRender: boolean;
  readonly usageLedgerPath?: string;
}

export interface ApiWorkspaceBillingReservation {
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly monthKey: string;
  readonly requestCountAfterReservation: number;
  readonly reservedCostUsd: number;
  readonly reservedCostUsdAfterReservation: number;
  readonly creditBalanceUsd?: number;
  readonly creditBalanceUsdAfterReservation?: number;
  readonly projectRequestCountAfterReservation?: number;
  readonly projectReservedCostUsdAfterReservation?: number;
}

export interface ApiWorkspaceBillingReserveInput {
  readonly principal: ApiAuthPrincipal | undefined;
  readonly request: CineJellyProjectRequest;
  readonly requestId: string;
  readonly channel: "sync" | "async";
}

interface UsageTotals {
  requestCount: number;
  reservedCostUsd: number;
}

interface WorkspaceLedgerRecord {
  readonly schemaVersion: "cinejelly.workspace-usage-ledger.v1";
  readonly recordedAt: string;
  readonly monthKey: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly clientId?: string;
  readonly requestId: string;
  readonly operation: "render.reserve" | "render.release";
  readonly channel: "sync" | "async";
  readonly reservedCostUsd: number;
  readonly durationTargetSeconds: number;
  readonly qualityMode: QualityMode;
  readonly tier: SpeedTier;
}

interface ReservationPlan {
  readonly workspace: ApiWorkspacePolicy;
  readonly project?: ApiWorkspaceProjectPolicy;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly monthKey: string;
  readonly reservedCostUsd: number;
  readonly settings: ReturnType<typeof normalizeSeedanceSettings>;
}

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,80}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,120}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,80}$/;

export class ApiWorkspaceBillingGate {
  private readonly workspaces: ReadonlyMap<string, ApiWorkspacePolicy>;
  private readonly requireWorkspaceForRender: boolean;
  private readonly usageLedgerPath: string | undefined;
  private readonly usageByWorkspaceMonth = new Map<string, UsageTotals>();
  private readonly usageByProjectMonth = new Map<string, UsageTotals>();

  public constructor(settings: ApiWorkspaceBillingSettings) {
    this.workspaces = new Map(settings.workspaces.map((workspace) => [workspace.workspaceId, workspace]));
    this.requireWorkspaceForRender = settings.requireWorkspaceForRender;
    this.usageLedgerPath = settings.usageLedgerPath;
    this.loadUsageLedger();
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): ApiWorkspaceBillingGate {
    return new ApiWorkspaceBillingGate(loadApiWorkspaceBillingSettingsFromEnv(env));
  }

  public assertRenderAllowed(input: ApiWorkspaceBillingReserveInput): void {
    const plan = this.reservationPlan(input);
    if (!plan) {
      return;
    }
    this.assertPlanAllowed(plan);
  }

  public reserveRender(input: ApiWorkspaceBillingReserveInput): ApiWorkspaceBillingReservation | undefined {
    const plan = this.reservationPlan(input);
    if (!plan) {
      return undefined;
    }
    this.assertPlanAllowed(plan);

    const workspaceUsageKey = this.workspaceUsageKey(plan.workspaceId, plan.monthKey);
    const currentWorkspaceUsage = this.usageByWorkspaceMonth.get(workspaceUsageKey) ?? {
      requestCount: 0,
      reservedCostUsd: 0
    };
    const nextWorkspaceUsage = this.nextUsage(currentWorkspaceUsage, plan.reservedCostUsd);

    let nextProjectUsage: UsageTotals | undefined;
    if (plan.projectId) {
      const projectUsageKey = this.projectUsageKey(plan.workspaceId, plan.projectId, plan.monthKey);
      const currentProjectUsage = this.usageByProjectMonth.get(projectUsageKey) ?? {
        requestCount: 0,
        reservedCostUsd: 0
      };
      nextProjectUsage = this.nextUsage(currentProjectUsage, plan.reservedCostUsd);
      this.usageByProjectMonth.set(projectUsageKey, nextProjectUsage);
    }

    this.usageByWorkspaceMonth.set(workspaceUsageKey, nextWorkspaceUsage);
    this.writeUsageRecord({
      schemaVersion: "cinejelly.workspace-usage-ledger.v1",
      recordedAt: new Date().toISOString(),
      monthKey: plan.monthKey,
      workspaceId: plan.workspaceId,
      ...(plan.projectId ? { projectId: plan.projectId } : {}),
      ...(input.principal?.kind === "client" && input.principal.clientId
        ? { clientId: input.principal.clientId }
        : {}),
      requestId: input.requestId,
      operation: "render.reserve",
      channel: input.channel,
      reservedCostUsd: plan.reservedCostUsd,
      durationTargetSeconds: plan.settings.durationTargetSeconds,
      qualityMode: plan.settings.qualityMode,
      tier: plan.settings.tier
    });

    return {
      workspaceId: plan.workspaceId,
      ...(plan.projectId ? { projectId: plan.projectId } : {}),
      monthKey: plan.monthKey,
      requestCountAfterReservation: nextWorkspaceUsage.requestCount,
      reservedCostUsd: plan.reservedCostUsd,
      reservedCostUsdAfterReservation: nextWorkspaceUsage.reservedCostUsd,
      ...(plan.workspace.creditBalanceUsd !== undefined
        ? {
            creditBalanceUsd: plan.workspace.creditBalanceUsd,
            creditBalanceUsdAfterReservation: roundMoney(plan.workspace.creditBalanceUsd - nextWorkspaceUsage.reservedCostUsd)
          }
        : {}),
      ...(nextProjectUsage
        ? {
            projectRequestCountAfterReservation: nextProjectUsage.requestCount,
            projectReservedCostUsdAfterReservation: nextProjectUsage.reservedCostUsd
          }
        : {})
    };
  }

  /**
   * Return a reservation for a job canceled while still queued (no provider work
   * happened). Decrements the workspace and project buckets for the reservation's month
   * and appends a render.release ledger line so workspace usage stays auditable.
   */
  public releaseRender(input: {
    readonly reservation: ApiWorkspaceBillingReservation;
    readonly request: CineJellyProjectRequest;
    readonly requestId: string;
    readonly channel: "sync" | "async";
  }): void {
    const workspaceUsageKey = this.workspaceUsageKey(input.reservation.workspaceId, input.reservation.monthKey);
    const currentWorkspaceUsage = this.usageByWorkspaceMonth.get(workspaceUsageKey);
    if (currentWorkspaceUsage) {
      this.usageByWorkspaceMonth.set(workspaceUsageKey, {
        requestCount: Math.max(0, currentWorkspaceUsage.requestCount - 1),
        reservedCostUsd: roundMoney(
          Math.max(0, currentWorkspaceUsage.reservedCostUsd - input.reservation.reservedCostUsd)
        )
      });
    }
    if (input.reservation.projectId) {
      const projectUsageKey = this.projectUsageKey(
        input.reservation.workspaceId,
        input.reservation.projectId,
        input.reservation.monthKey
      );
      const currentProjectUsage = this.usageByProjectMonth.get(projectUsageKey);
      if (currentProjectUsage) {
        this.usageByProjectMonth.set(projectUsageKey, {
          requestCount: Math.max(0, currentProjectUsage.requestCount - 1),
          reservedCostUsd: roundMoney(
            Math.max(0, currentProjectUsage.reservedCostUsd - input.reservation.reservedCostUsd)
          )
        });
      }
    }
    const settings = normalizeSeedanceSettings(input.request.settings ?? {});
    this.writeUsageRecord({
      schemaVersion: "cinejelly.workspace-usage-ledger.v1",
      recordedAt: new Date().toISOString(),
      monthKey: input.reservation.monthKey,
      workspaceId: input.reservation.workspaceId,
      ...(input.reservation.projectId ? { projectId: input.reservation.projectId } : {}),
      requestId: input.requestId,
      operation: "render.release",
      channel: input.channel,
      reservedCostUsd: input.reservation.reservedCostUsd,
      durationTargetSeconds: settings.durationTargetSeconds,
      qualityMode: settings.qualityMode,
      tier: settings.tier
    });
  }

  public summary(): unknown {
    const monthKey = monthKeyFor(new Date());
    return {
      enabled: this.workspaces.size > 0,
      requireWorkspaceForRender: this.requireWorkspaceForRender,
      usageLedgerConfigured: Boolean(this.usageLedgerPath),
      workspaceCount: this.workspaces.size,
      enabledWorkspaceCount: [...this.workspaces.values()].filter((workspace) => workspace.enabled).length,
      workspaces: [...this.workspaces.values()].map((workspace) => {
        const usage = this.usageByWorkspaceMonth.get(this.workspaceUsageKey(workspace.workspaceId, monthKey));
        return {
          workspaceId: workspace.workspaceId,
          displayName: workspace.displayName,
          planId: workspace.planId,
          enabled: workspace.enabled,
          clientCount: workspace.clientIds?.length ?? 0,
          monthlyRequestLimit: workspace.monthlyRequestLimit,
          monthlyReservedCostUsdLimit: workspace.monthlyReservedCostUsdLimit,
          maxReservedCostUsdPerRequest: workspace.maxReservedCostUsdPerRequest,
          defaultReservedCostUsdPerRequest: workspace.defaultReservedCostUsdPerRequest,
          creditBalanceUsd: workspace.creditBalanceUsd,
          usage: {
            monthKey,
            requestCount: usage?.requestCount ?? 0,
            reservedCostUsd: usage?.reservedCostUsd ?? 0
          },
          projects: (workspace.projects ?? []).map((project) => {
            const projectUsage = this.usageByProjectMonth.get(
              this.projectUsageKey(workspace.workspaceId, project.projectId, monthKey)
            );
            return {
              projectId: project.projectId,
              displayName: project.displayName,
              enabled: project.enabled,
              monthlyRequestLimit: project.monthlyRequestLimit,
              monthlyReservedCostUsdLimit: project.monthlyReservedCostUsdLimit,
              maxReservedCostUsdPerRequest: project.maxReservedCostUsdPerRequest,
              defaultReservedCostUsdPerRequest: project.defaultReservedCostUsdPerRequest,
              usage: {
                monthKey,
                requestCount: projectUsage?.requestCount ?? 0,
                reservedCostUsd: projectUsage?.reservedCostUsd ?? 0
              }
            };
          })
        };
      })
    };
  }

  private reservationPlan(input: ApiWorkspaceBillingReserveInput): ReservationPlan | undefined {
    if (this.workspaces.size === 0) {
      if (this.requireWorkspaceForRender) {
        throw new ApiWorkspaceBillingError(
          "CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER is true but no workspace billing policy is configured.",
          503
        );
      }
      return undefined;
    }

    const workspaceId = input.request.metadata?.workspaceId?.trim();
    if (!workspaceId) {
      if (this.requireWorkspaceForRender) {
        throw new ApiWorkspaceBillingError("Render requests must include metadata.workspaceId.", 400);
      }
      return undefined;
    }
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
      throw new ApiWorkspaceBillingError("metadata.workspaceId must be a safe workspace identifier.", 400);
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || !workspace.enabled) {
      throw new ApiWorkspaceBillingError("Workspace is disabled or not configured for rendering.", 403);
    }

    if (
      input.principal?.kind === "client" &&
      workspace.clientIds &&
      !workspace.clientIds.includes(input.principal.clientId ?? "")
    ) {
      throw new ApiWorkspaceBillingError("Client API key is not assigned to the requested workspace.", 403);
    }

    const projectId = input.request.metadata?.projectId?.trim();
    const project = this.projectFor(workspace, projectId);
    const settings = normalizeSeedanceSettings(input.request.settings ?? {});
    const reservedCostUsd = this.reservedCostUsdFor(workspace, project, input.request);

    return {
      workspace,
      ...(project ? { project } : {}),
      workspaceId,
      ...(projectId ? { projectId } : {}),
      monthKey: monthKeyFor(new Date()),
      reservedCostUsd,
      settings
    };
  }

  private projectFor(
    workspace: ApiWorkspacePolicy,
    projectId: string | undefined
  ): ApiWorkspaceProjectPolicy | undefined {
    if (projectId && !PROJECT_ID_PATTERN.test(projectId)) {
      throw new ApiWorkspaceBillingError("metadata.projectId must be a safe project identifier.", 400);
    }
    if (!workspace.projects || workspace.projects.length === 0) {
      return undefined;
    }
    if (!projectId) {
      throw new ApiWorkspaceBillingError("metadata.projectId is required for this workspace.", 400);
    }
    const project = workspace.projects.find((item) => item.projectId === projectId);
    if (!project || !project.enabled) {
      throw new ApiWorkspaceBillingError("Project is disabled or not configured for the requested workspace.", 403);
    }
    return project;
  }

  private assertPlanAllowed(plan: ReservationPlan): void {
    if (
      plan.workspace.maxReservedCostUsdPerRequest !== undefined &&
      plan.reservedCostUsd > plan.workspace.maxReservedCostUsdPerRequest
    ) {
      throw new ApiWorkspaceBillingError(
        `Reserved request cost ${plan.reservedCostUsd} USD exceeds workspace per-request limit ${plan.workspace.maxReservedCostUsdPerRequest} USD.`,
        403
      );
    }
    if (
      plan.project?.maxReservedCostUsdPerRequest !== undefined &&
      plan.reservedCostUsd > plan.project.maxReservedCostUsdPerRequest
    ) {
      throw new ApiWorkspaceBillingError(
        `Reserved request cost ${plan.reservedCostUsd} USD exceeds project per-request limit ${plan.project.maxReservedCostUsdPerRequest} USD.`,
        403
      );
    }

    const workspaceUsage = this.nextUsage(
      this.usageByWorkspaceMonth.get(this.workspaceUsageKey(plan.workspaceId, plan.monthKey)) ?? {
        requestCount: 0,
        reservedCostUsd: 0
      },
      plan.reservedCostUsd
    );
    if (
      plan.workspace.monthlyRequestLimit !== undefined &&
      workspaceUsage.requestCount > plan.workspace.monthlyRequestLimit
    ) {
      throw new ApiWorkspaceBillingError("Workspace monthly request quota has been reached.", 429, secondsUntilNextMonth());
    }
    if (
      plan.workspace.monthlyReservedCostUsdLimit !== undefined &&
      workspaceUsage.reservedCostUsd > plan.workspace.monthlyReservedCostUsdLimit
    ) {
      throw new ApiWorkspaceBillingError(
        "Workspace monthly reserved-cost quota has been reached.",
        429,
        secondsUntilNextMonth()
      );
    }
    if (
      plan.workspace.creditBalanceUsd !== undefined &&
      workspaceUsage.reservedCostUsd > plan.workspace.creditBalanceUsd
    ) {
      throw new ApiWorkspaceBillingError("Workspace credit balance is insufficient for this render reservation.", 429);
    }

    if (!plan.project || !plan.projectId) {
      return;
    }
    const projectUsage = this.nextUsage(
      this.usageByProjectMonth.get(this.projectUsageKey(plan.workspaceId, plan.projectId, plan.monthKey)) ?? {
        requestCount: 0,
        reservedCostUsd: 0
      },
      plan.reservedCostUsd
    );
    if (plan.project.monthlyRequestLimit !== undefined && projectUsage.requestCount > plan.project.monthlyRequestLimit) {
      throw new ApiWorkspaceBillingError("Project monthly request quota has been reached.", 429, secondsUntilNextMonth());
    }
    if (
      plan.project.monthlyReservedCostUsdLimit !== undefined &&
      projectUsage.reservedCostUsd > plan.project.monthlyReservedCostUsdLimit
    ) {
      throw new ApiWorkspaceBillingError(
        "Project monthly reserved-cost quota has been reached.",
        429,
        secondsUntilNextMonth()
      );
    }
  }

  private reservedCostUsdFor(
    workspace: ApiWorkspacePolicy,
    project: ApiWorkspaceProjectPolicy | undefined,
    request: CineJellyProjectRequest
  ): number {
    if (request.settings?.maxCostUsd !== undefined) {
      return roundMoney(request.settings.maxCostUsd);
    }
    if (project?.defaultReservedCostUsdPerRequest !== undefined) {
      return roundMoney(project.defaultReservedCostUsdPerRequest);
    }
    if (workspace.defaultReservedCostUsdPerRequest !== undefined) {
      return roundMoney(workspace.defaultReservedCostUsdPerRequest);
    }
    if (
      workspace.monthlyReservedCostUsdLimit !== undefined ||
      workspace.maxReservedCostUsdPerRequest !== undefined ||
      workspace.creditBalanceUsd !== undefined ||
      project?.monthlyReservedCostUsdLimit !== undefined ||
      project?.maxReservedCostUsdPerRequest !== undefined
    ) {
      throw new ApiWorkspaceBillingError(
        "Workspace render requests must include settings.maxCostUsd or define a default reserved cost.",
        400
      );
    }
    return 0;
  }

  private loadUsageLedger(): void {
    if (!this.usageLedgerPath || !existsSync(this.usageLedgerPath)) {
      return;
    }
    const text = readFileSync(this.usageLedgerPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const record = JSON.parse(line) as Partial<WorkspaceLedgerRecord>;
        if (
          record.schemaVersion !== "cinejelly.workspace-usage-ledger.v1" ||
          record.operation !== "render.reserve" ||
          typeof record.workspaceId !== "string" ||
          typeof record.monthKey !== "string" ||
          typeof record.reservedCostUsd !== "number"
        ) {
          continue;
        }
        const workspaceKey = this.workspaceUsageKey(record.workspaceId, record.monthKey);
        const workspaceUsage = this.usageByWorkspaceMonth.get(workspaceKey) ?? { requestCount: 0, reservedCostUsd: 0 };
        this.usageByWorkspaceMonth.set(workspaceKey, this.nextUsage(workspaceUsage, Math.max(0, record.reservedCostUsd)));
        if (typeof record.projectId === "string" && record.projectId.trim()) {
          const projectKey = this.projectUsageKey(record.workspaceId, record.projectId, record.monthKey);
          const projectUsage = this.usageByProjectMonth.get(projectKey) ?? { requestCount: 0, reservedCostUsd: 0 };
          this.usageByProjectMonth.set(projectKey, this.nextUsage(projectUsage, Math.max(0, record.reservedCostUsd)));
        }
      } catch {
        continue;
      }
    }
  }

  private writeUsageRecord(record: WorkspaceLedgerRecord): void {
    if (!this.usageLedgerPath) {
      return;
    }
    mkdirSync(dirname(resolve(this.usageLedgerPath)), { recursive: true });
    appendFileSync(this.usageLedgerPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private nextUsage(current: UsageTotals, reservedCostUsd: number): UsageTotals {
    return {
      requestCount: current.requestCount + 1,
      reservedCostUsd: roundMoney(current.reservedCostUsd + reservedCostUsd)
    };
  }

  private workspaceUsageKey(workspaceId: string, monthKey: string): string {
    return `${workspaceId}:${monthKey}`;
  }

  private projectUsageKey(workspaceId: string, projectId: string, monthKey: string): string {
    return `${workspaceId}:${projectId}:${monthKey}`;
  }
}

export function loadApiWorkspaceBillingSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ApiWorkspaceBillingSettings {
  const workspaces = parseApiWorkspacePoliciesJson(env.CINEJELLY_WORKSPACES_JSON);
  return {
    workspaces,
    requireWorkspaceForRender: readBooleanFlag(
      "CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER",
      env.CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER
    ),
    ...(env.CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH?.trim()
      ? { usageLedgerPath: env.CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH.trim() }
      : {})
  };
}

export function parseApiWorkspacePoliciesJson(value: string | undefined): readonly ApiWorkspacePolicy[] {
  if (!value?.trim()) {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("CINEJELLY_WORKSPACES_JSON must be a JSON array.");
  }
  const workspaceIds = new Set<string>();
  return parsed.map((item, index) => {
    const workspace = parseWorkspacePolicy(item, index);
    if (workspaceIds.has(workspace.workspaceId)) {
      throw new Error(`CINEJELLY_WORKSPACES_JSON has duplicate workspaceId ${workspace.workspaceId}.`);
    }
    workspaceIds.add(workspace.workspaceId);
    return workspace;
  });
}

function parseWorkspacePolicy(value: unknown, index: number): ApiWorkspacePolicy {
  const payload = objectPayload(value, `CINEJELLY_WORKSPACES_JSON[${index}]`);
  const workspaceId = requiredString(payload.workspaceId, `CINEJELLY_WORKSPACES_JSON[${index}].workspaceId`);
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error(`CINEJELLY_WORKSPACES_JSON[${index}].workspaceId is invalid.`);
  }
  const projects = optionalProjects(payload.projects, index);
  return {
    workspaceId,
    enabled: optionalBoolean(payload.enabled, true, `CINEJELLY_WORKSPACES_JSON[${index}].enabled`),
    ...optionalDisplayString(payload.displayName, "displayName", `CINEJELLY_WORKSPACES_JSON[${index}].displayName`),
    ...optionalDisplayString(payload.planId, "planId", `CINEJELLY_WORKSPACES_JSON[${index}].planId`),
    ...optionalClientIds(payload.clientIds, `CINEJELLY_WORKSPACES_JSON[${index}].clientIds`),
    ...optionalPositiveInteger(payload.monthlyRequestLimit, "monthlyRequestLimit", `CINEJELLY_WORKSPACES_JSON[${index}].monthlyRequestLimit`),
    ...optionalMoney(payload.monthlyReservedCostUsdLimit, "monthlyReservedCostUsdLimit", `CINEJELLY_WORKSPACES_JSON[${index}].monthlyReservedCostUsdLimit`),
    ...optionalMoney(payload.maxReservedCostUsdPerRequest, "maxReservedCostUsdPerRequest", `CINEJELLY_WORKSPACES_JSON[${index}].maxReservedCostUsdPerRequest`),
    ...optionalMoney(payload.defaultReservedCostUsdPerRequest, "defaultReservedCostUsdPerRequest", `CINEJELLY_WORKSPACES_JSON[${index}].defaultReservedCostUsdPerRequest`),
    ...optionalMoney(payload.creditBalanceUsd, "creditBalanceUsd", `CINEJELLY_WORKSPACES_JSON[${index}].creditBalanceUsd`),
    ...(projects.length > 0 ? { projects } : {})
  };
}

function optionalProjects(value: unknown, workspaceIndex: number): readonly ApiWorkspaceProjectPolicy[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects must be an array.`);
  }
  const projectIds = new Set<string>();
  return value.map((item, index) => {
    const payload = objectPayload(item, `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}]`);
    const projectId = requiredString(payload.projectId, `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].projectId`);
    if (!PROJECT_ID_PATTERN.test(projectId)) {
      throw new Error(`CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].projectId is invalid.`);
    }
    if (projectIds.has(projectId)) {
      throw new Error(`CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects has duplicate projectId ${projectId}.`);
    }
    projectIds.add(projectId);
    return {
      projectId,
      enabled: optionalBoolean(payload.enabled, true, `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].enabled`),
      ...optionalDisplayString(payload.displayName, "displayName", `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].displayName`),
      ...optionalPositiveInteger(payload.monthlyRequestLimit, "monthlyRequestLimit", `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].monthlyRequestLimit`),
      ...optionalMoney(payload.monthlyReservedCostUsdLimit, "monthlyReservedCostUsdLimit", `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].monthlyReservedCostUsdLimit`),
      ...optionalMoney(payload.maxReservedCostUsdPerRequest, "maxReservedCostUsdPerRequest", `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].maxReservedCostUsdPerRequest`),
      ...optionalMoney(payload.defaultReservedCostUsdPerRequest, "defaultReservedCostUsdPerRequest", `CINEJELLY_WORKSPACES_JSON[${workspaceIndex}].projects[${index}].defaultReservedCostUsdPerRequest`)
    };
  });
}

function optionalClientIds(value: unknown, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  const clientIds = value.map((item) => requiredString(item, fieldName));
  for (const clientId of clientIds) {
    if (!CLIENT_ID_PATTERN.test(clientId)) {
      throw new Error(`${fieldName} contains an invalid clientId.`);
    }
  }
  return { clientIds };
}

function objectPayload(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${fieldName} must not contain control characters.`);
  }
  return value.trim();
}

function optionalDisplayString(value: unknown, outputKey: string, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  const normalized = requiredString(value, fieldName);
  if (normalized.length > 160) {
    throw new Error(`${fieldName} cannot exceed 160 characters.`);
  }
  return { [outputKey]: normalized };
}

function optionalBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, outputKey: string, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return { [outputKey]: value };
}

function optionalMoney(value: unknown, outputKey: string, fieldName: string): object {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
  return { [outputKey]: roundMoney(value) };
}

function readBooleanFlag(name: string, value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false when set.`);
}

function monthKeyFor(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function secondsUntilNextMonth(now = new Date()): number {
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / 1000));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}
