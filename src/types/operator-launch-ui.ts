export type OperatorLaunchUiDashboardStatus =
  | "ready"
  | "review_required"
  | "blocked"
  | "blocked_by_external_inputs"
  | "blocked_by_operator_inputs"
  | "missing_evidence"
  | "scope_decision_required";

export type OperatorLaunchUiActionStatus =
  | "ready"
  | "needs_operator_input"
  | "blocked_external"
  | "blocked_budget"
  | "pending_after_paid_run"
  | "scope_decision_required";

export interface OperatorLaunchUiSourceReport {
  readonly reportId: string;
  readonly label: string;
  readonly reportPath: string;
  readonly present: boolean;
  readonly status: string;
  readonly schemaVersion?: string;
  readonly releaseEvidence: boolean;
  readonly parseError?: string;
}

export interface OperatorLaunchUiReadinessSummary {
  readonly evidenceCompletionPercent: number;
  readonly businessReadinessStatus: string;
  readonly releaseAuditStatus: string;
  readonly snapshotParityStatus: string;
  readonly reportContractsStatus: string;
  readonly launchDoctorStatus: string;
  readonly knownCodeBlockingIssueCount: number;
  readonly knownProductCodeGapCount: number;
  readonly canReleaseToCustomerTraffic: boolean;
}

export interface OperatorLaunchUiBudgetSummary {
  readonly budgetFit: string;
  readonly approvedBudgetUsd: number;
  readonly knownPaidEstimateUsd: number;
  readonly readyPaidGates: readonly string[];
  readonly readyPaidGateCount: number;
  readonly canRunGeneratedAudioPaidSlice: boolean;
  readonly canRunFullKnownPaidSequence: boolean;
  readonly shouldDeferFullSequenceSpend: boolean;
}

export interface OperatorLaunchUiOperatorInputSummary {
  readonly requiredInputCount: number;
  readonly configuredInputCount: number;
  readonly missingOrBlockedInputCount: number;
  readonly blockedInputIds: readonly string[];
  readonly safeToShareWithOperators: boolean;
  readonly commandPlanAuditStatus: string;
}

export interface OperatorLaunchUiProductGap {
  readonly gapId: string;
  readonly label: string;
  readonly category: string;
  readonly status: string;
  readonly currentCoveragePercent: number;
  readonly scopeDecisionRequired: boolean;
  readonly blocksApiCliCommercialLaunch: boolean;
  readonly blocksFullSnapshotParity: boolean;
  readonly requiredAction: string;
}

export interface OperatorLaunchUiAction {
  readonly actionId: string;
  readonly label: string;
  readonly status: OperatorLaunchUiActionStatus;
  readonly owner: string;
  readonly category: string;
  readonly priority: number;
  readonly requiredAction: string;
  readonly command?: string;
  readonly requiresLiveNetwork: boolean;
  readonly requiresProviderSpend: boolean;
  readonly requiresManualReview: boolean;
  readonly scopeDecisionRequired: boolean;
}

export interface OperatorLaunchUiContract {
  readonly schemaVersion: "cinejelly.operator-launch-ui-contract.v1";
  readonly generatedAt: Date;
  readonly noSpend: true;
  readonly networkCallsMade: false;
  readonly providerCallsMade: false;
  readonly dashboardStatus: OperatorLaunchUiDashboardStatus;
  readonly sourceReports: readonly OperatorLaunchUiSourceReport[];
  readonly readiness: OperatorLaunchUiReadinessSummary;
  readonly budget: OperatorLaunchUiBudgetSummary;
  readonly operatorInputs: OperatorLaunchUiOperatorInputSummary;
  readonly productGaps: readonly OperatorLaunchUiProductGap[];
  readonly nextActions: readonly OperatorLaunchUiAction[];
  readonly releaseGateSummary: {
    readonly canUseAsNoSpendOperatorLaunchUiEvidence: true;
    readonly readyForOperatorDashboard: boolean;
    readonly canReleaseToCustomerTraffic: false;
    readonly releaseBlocker: string;
  };
}
