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
