/**
 * Runtime preflight types for production deployment readiness.
 * Reports must never expose secret values.
 */

export type PreflightStatus = "pass" | "warn" | "fail";

export interface PreflightCheck {
  readonly name: string;
  readonly status: PreflightStatus;
  readonly message: string;
}

export interface RuntimePreflightReport {
  readonly status: PreflightStatus;
  readonly checkedAt: Date;
  readonly checks: readonly PreflightCheck[];
}

export type Phase6ValidationReadinessDecision = "blocked" | "review_warnings" | "ready_for_paid_validation";

export interface Phase6ValidationCheckCounts {
  readonly total: number;
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
}

export interface Phase6ValidationReleaseGateSummary {
  readonly canRunPaidValidation: boolean;
  readonly canReleaseToCustomerTraffic: false;
  readonly releaseBlocker: string;
}

export interface Phase6ValidationReadinessReport {
  readonly schemaVersion: "cinejelly.phase6.validation-readiness.v1";
  readonly generatedAt: Date;
  readonly sourcePatternOrigins: readonly string[];
  readonly decision: Phase6ValidationReadinessDecision;
  readonly preflightStatus: PreflightStatus;
  readonly checkCounts: Phase6ValidationCheckCounts;
  readonly hardBlockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextActions: readonly string[];
  readonly releaseGateSummary: Phase6ValidationReleaseGateSummary;
  readonly preflight: RuntimePreflightReport;
}
