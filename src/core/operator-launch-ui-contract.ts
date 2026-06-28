/**
 * Operator launch UI contract.
 * It compresses launch-readiness reports into a stable dashboard contract so a
 * future first-party UI does not need to parse raw report artifacts client-side.
 */

import type {
  OperatorLaunchUiAction,
  OperatorLaunchUiActionStatus,
  OperatorLaunchUiContract,
  OperatorLaunchUiDashboardStatus,
  OperatorLaunchUiProductGap,
  OperatorLaunchUiSourceReport
} from "../types/operator-launch-ui.js";
import { redactPrivateSourcePatternText } from "./private-source-pattern-registry.js";

export interface OperatorLaunchUiReportInput {
  readonly reportId: string;
  readonly label: string;
  readonly reportPath: string;
  readonly payload?: unknown;
  readonly parseError?: string;
}

export function buildOperatorLaunchUiContract(
  reports: readonly OperatorLaunchUiReportInput[]
): OperatorLaunchUiContract {
  const sourceReports = reports.map(sourceReportFor);
  const completion = reportPayload(reports, "business_completion_audit");
  const roadmap = reportPayload(reports, "roadmap_closure_audit");
  const readinessSnapshot = objectValue(completion?.readinessSnapshot);
  const budget = objectValue(readinessSnapshot?.budget);
  const operatorHandoff = objectValue(completion?.operatorHandoffSummary);
  const commercialScope = objectValue(completion?.commercialOfferScopeSummary);
  const productGaps = arrayValue(completion?.productCodeGaps).map(productGapFor);
  const nextActions = actionsFromRoadmap(roadmap);
  const canReleaseToCustomerTraffic = booleanValue(readinessSnapshot?.canReleaseToCustomerTraffic, false);
  const dashboardStatus = dashboardStatusFor(sourceReports, completion, commercialScope);

  return {
    schemaVersion: "cinejelly.operator-launch-ui-contract.v1",
    generatedAt: new Date(),
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    dashboardStatus,
    sourceReports,
    readiness: {
      evidenceCompletionPercent: numberValue(readinessSnapshot?.evidenceCompletionPercent),
      businessReadinessStatus: stringValue(readinessSnapshot?.businessReadinessStatus, "missing"),
      releaseAuditStatus: stringValue(readinessSnapshot?.releaseAuditStatus, "missing"),
      snapshotParityStatus: stringValue(readinessSnapshot?.snapshotParityStatus, "missing"),
      reportContractsStatus: stringValue(readinessSnapshot?.reportContractsStatus, "missing"),
      launchDoctorStatus: stringValue(readinessSnapshot?.launchDoctorStatus, "missing"),
      knownCodeBlockingIssueCount: numberValue(objectValue(completion?.completionStatus)?.knownCodeBlockingIssueCount),
      knownProductCodeGapCount: numberValue(objectValue(completion?.completionStatus)?.knownProductCodeGapCount),
      canReleaseToCustomerTraffic
    },
    budget: {
      budgetFit: stringValue(budget?.budgetFit, "unknown"),
      approvedBudgetUsd: numberValue(budget?.approvedBudgetUsd),
      knownPaidEstimateUsd: numberValue(budget?.knownPaidEstimateUsd),
      readyPaidGates: stringArrayValue(readinessSnapshot?.readyPaidGates).map(safeUiString),
      readyPaidGateCount: numberValue(readinessSnapshot?.readyPaidGateCount),
      canRunGeneratedAudioPaidSlice: booleanValue(readinessSnapshot?.canRunGeneratedAudioPaidSlice, false),
      canRunFullKnownPaidSequence: booleanValue(readinessSnapshot?.canRunFullKnownPaidSequence, false),
      shouldDeferFullSequenceSpend: booleanValue(readinessSnapshot?.shouldDeferFullSequenceSpend, true)
    },
    operatorInputs: {
      requiredInputCount: numberValue(operatorHandoff?.requiredInputCount),
      configuredInputCount: numberValue(operatorHandoff?.configuredInputCount),
      missingOrBlockedInputCount: numberValue(operatorHandoff?.missingOrBlockedInputCount),
      blockedInputIds: stringArrayValue(operatorHandoff?.blockedInputIds).map(safeUiId),
      safeToShareWithOperators: booleanValue(operatorHandoff?.safeToShareWithOperators, false),
      commandPlanAuditStatus: stringValue(operatorHandoff?.commandPlanAuditStatus, "missing")
    },
    productGaps,
    nextActions,
    releaseGateSummary: {
      canUseAsNoSpendOperatorLaunchUiEvidence: true,
      readyForOperatorDashboard: sourceReports.some((report) => report.present) &&
        sourceReports.some((report) => report.reportId === "business_completion_audit" && report.present),
      canReleaseToCustomerTraffic: false,
      releaseBlocker: canReleaseToCustomerTraffic
        ? "Operator dashboard evidence is no-spend UI evidence only; customer traffic still requires the explicit release gate."
        : "Operator dashboard shows launch-readiness evidence, but customer traffic remains blocked until business-readiness, operator inputs, paid/live evidence, and commercial scope gates pass."
    }
  };
}

function sourceReportFor(input: OperatorLaunchUiReportInput): OperatorLaunchUiSourceReport {
  const payload = objectValue(input.payload);
  return {
    reportId: input.reportId,
    label: safeUiString(input.label),
    reportPath: input.reportPath,
    present: Boolean(payload) && !input.parseError,
    status: input.parseError ? "invalid_json" : stringValue(payload?.status, payload ? "unknown" : "missing"),
    ...(typeof payload?.schemaVersion === "string" ? { schemaVersion: payload.schemaVersion } : {}),
    releaseEvidence: booleanValue(payload?.releaseEvidence, false),
    ...(input.parseError ? { parseError: input.parseError } : {})
  };
}

function dashboardStatusFor(
  sourceReports: readonly OperatorLaunchUiSourceReport[],
  completion: Record<string, unknown> | undefined,
  commercialScope: Record<string, unknown> | undefined
): OperatorLaunchUiDashboardStatus {
  if (!sourceReports.some((report) => report.present)) {
    return "missing_evidence";
  }
  if (booleanValue(commercialScope?.scopeDecisionRequired, false)) {
    return "scope_decision_required";
  }
  const status = stringValue(completion?.status, "missing_evidence");
  if (isDashboardStatus(status)) {
    return status;
  }
  return status.includes("operator") ? "blocked_by_operator_inputs" : "review_required";
}

function productGapFor(value: unknown): OperatorLaunchUiProductGap {
  const gap = objectValue(value);
  return {
    gapId: safeUiId(stringValue(gap?.id, "unknown_gap")),
    label: safeUiString(stringValue(gap?.label, "Unknown product gap")),
    category: safeUiId(stringValue(gap?.category, "product_gap")),
    status: safeUiId(stringValue(gap?.status, "unknown")),
    currentCoveragePercent: numberValue(gap?.currentCoveragePercent),
    scopeDecisionRequired: booleanValue(gap?.scopeDecisionRequired, false),
    blocksApiCliCommercialLaunch: booleanValue(gap?.blocksApiCliCommercialLaunch, false),
    blocksFullSnapshotParity: booleanValue(gap?.blocksFullSnapshotParity, false),
    requiredAction: safeUiString(stringValue(gap?.requiredAction, "Review product gap evidence."))
  };
}

function actionsFromRoadmap(roadmap: Record<string, unknown> | undefined): readonly OperatorLaunchUiAction[] {
  const requirements = arrayValue(roadmap?.requirements);
  return requirements
    .map((value, index): OperatorLaunchUiAction => {
      const requirement = objectValue(value);
      const directCommands = stringArrayValue(requirement?.directCommands);
      const commandGuards = arrayValue(requirement?.directCommandGuards).map(objectValue);
      const firstGuard = commandGuards.find(Boolean);
      return {
        actionId: safeUiId(stringValue(requirement?.id, `action_${index + 1}`)),
        label: safeUiString(stringValue(requirement?.label, "Launch readiness action")),
        status: actionStatusFor(stringValue(requirement?.status, "needs_operator_input")),
        owner: safeUiId(stringValue(requirement?.owner, "operator")),
        category: safeUiId(stringValue(requirement?.category, "launch_readiness")),
        priority: numberValue(requirement?.order) || index + 1,
        requiredAction: safeUiString(stringValue(requirement?.requiredAction, "Review the launch-readiness requirement.")),
        ...(directCommands[0] ? { command: directCommands[0] } : {}),
        requiresLiveNetwork: booleanValue(firstGuard?.requiresLiveNetwork, false),
        requiresProviderSpend: booleanValue(firstGuard?.requiresProviderSpend, false),
        requiresManualReview: booleanValue(firstGuard?.requiresManualReview, false),
        scopeDecisionRequired: stringValue(requirement?.status, "") === "scope_decision_required"
      };
    })
    .filter((action) => action.status !== "ready")
    .slice(0, 12);
}

function actionStatusFor(status: string): OperatorLaunchUiActionStatus {
  if (status === "ready" || status === "pass") {
    return "ready";
  }
  if (status.includes("budget")) {
    return "blocked_budget";
  }
  if (status === "pending_after_paid_run") {
    return "pending_after_paid_run";
  }
  if (status === "scope_decision_required") {
    return "scope_decision_required";
  }
  if (status.includes("external") || status.includes("live")) {
    return "blocked_external";
  }
  return "needs_operator_input";
}

function reportPayload(
  reports: readonly OperatorLaunchUiReportInput[],
  reportId: string
): Record<string, unknown> | undefined {
  return objectValue(reports.find((report) => report.reportId === reportId)?.payload);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): readonly string[] {
  return arrayValue(value).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function safeUiString(value: string): string {
  return redactPrivateSourcePatternText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function safeUiId(value: string): string {
  const safe = safeUiString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "unknown";
}

function isDashboardStatus(value: string): value is OperatorLaunchUiDashboardStatus {
  return [
    "ready",
    "review_required",
    "blocked",
    "blocked_by_external_inputs",
    "blocked_by_operator_inputs",
    "missing_evidence",
    "scope_decision_required"
  ].includes(value);
}
