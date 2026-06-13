/**
 * Phase 6 validation readiness reporting.
 * This prepares operator evidence before paid provider validation; it does not claim release readiness.
 */

import type {
  Phase6ValidationCheckCounts,
  Phase6ValidationReadinessDecision,
  Phase6ValidationReadinessReport,
  RuntimePreflightReport
} from "../types/preflight.js";

const SOURCE_PATTERN_ORIGINS = ["vericontext/vibeframe", "harry0703/MoneyPrinterTurbo"] as const;

export class Phase6ValidationReadinessReporter {
  public build(preflight: RuntimePreflightReport): Phase6ValidationReadinessReport {
    const checkCounts = this.countChecks(preflight);
    const hardBlockers = this.namesForStatus(preflight, "fail");
    const warnings = this.namesForStatus(preflight, "warn");
    const decision = this.decisionFor(checkCounts);

    return {
      schemaVersion: "cinejelly.phase6.validation-readiness.v1",
      generatedAt: new Date(),
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      decision,
      preflightStatus: preflight.status,
      checkCounts,
      hardBlockers,
      warnings,
      nextActions: this.nextActionsFor(decision),
      releaseGateSummary: {
        canRunPaidValidation: decision === "ready_for_paid_validation",
        canReleaseToCustomerTraffic: false,
        releaseBlocker:
          "Paid Atlas render validation, artifact validation, artifact inspection, and manual redaction review are still required."
      },
      preflight
    };
  }

  private countChecks(preflight: RuntimePreflightReport): Phase6ValidationCheckCounts {
    return preflight.checks.reduce<Phase6ValidationCheckCounts>(
      (counts, check) => ({
        total: counts.total + 1,
        pass: counts.pass + (check.status === "pass" ? 1 : 0),
        warn: counts.warn + (check.status === "warn" ? 1 : 0),
        fail: counts.fail + (check.status === "fail" ? 1 : 0)
      }),
      { total: 0, pass: 0, warn: 0, fail: 0 }
    );
  }

  private namesForStatus(
    preflight: RuntimePreflightReport,
    status: "warn" | "fail"
  ): readonly string[] {
    return preflight.checks
      .filter((check) => check.status === status)
      .map((check) => check.name);
  }

  private decisionFor(checkCounts: Phase6ValidationCheckCounts): Phase6ValidationReadinessDecision {
    if (checkCounts.fail > 0) {
      return "blocked";
    }
    if (checkCounts.warn > 0) {
      return "review_warnings";
    }
    return "ready_for_paid_validation";
  }

  private nextActionsFor(decision: Phase6ValidationReadinessDecision): readonly string[] {
    switch (decision) {
      case "blocked":
        return [
          "Fix every hard blocker listed in hardBlockers.",
          "Rerun npm.cmd run validation:readiness.",
          "Do not run paid Atlas validation until the readiness decision is review_warnings or ready_for_paid_validation."
        ];
      case "review_warnings":
        return [
          "Review every warning listed in warnings and record the operator decision.",
          "Run the paid Atlas validation request from docs/OPERATOR_RUNBOOK.md when warnings are accepted.",
          "Run npm.cmd run validate:artifacts -- <artifact-directory> after artifacts are written."
        ];
      case "ready_for_paid_validation":
        return [
          "Run the paid Atlas validation request from docs/OPERATOR_RUNBOOK.md.",
          "Poll /v1/render-jobs/{jobId} until terminal status and inspect stageProgressEvents.",
          "Run npm.cmd run validate:artifacts -- <artifact-directory> and complete the artifact/redaction checklist."
        ];
    }
  }
}
