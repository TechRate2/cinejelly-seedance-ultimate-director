import type {
  DirectorStyleBenchmarkLongFormValidationEvidence,
  DirectorStyleBenchmarkLongFormValidationEvidenceStatus
} from "../types/director-style-benchmark.js";

const SAFE_STATUS_PATTERN = /^[a-z0-9_.:-]{1,80}$/i;

export function normalizeDirectorStyleLongFormValidationEvidence(
  value: unknown,
  options: { readonly sourcePath?: string } = {}
): DirectorStyleBenchmarkLongFormValidationEvidence {
  if (!isRecord(value)) {
    throw new Error("long-form validation evidence must be a JSON object");
  }
  if (value.schemaVersion !== "cinejelly.long-form-validation.v1") {
    throw new Error("long-form validation evidence has an unsupported schemaVersion");
  }

  const reportStatus = safeStatus(value.status) ?? "unknown";
  const canUseAsBusinessReadinessLongFormEvidence =
    value.releaseGateSummary?.canUseAsBusinessReadinessLongFormEvidence === true;
  const plannedDurationSeconds = safePositiveNumber(value.checkedInputs?.durationSeconds ?? value.costEstimate?.durationSeconds);
  const finalDurationSeconds = safePositiveNumber(value.artifactEvidence?.finalDurationSeconds);
  const providerSpendAllowed = value.spendGate?.providerSpendAllowed === true;
  const atlasBillingReady = value.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true;
  const requestValidationStatus = safeStatus(value.requestValidation?.status);
  const readinessDecision = safeStatus(value.readiness?.decision);
  const chunkPlanStatus = safeStatus(value.chunkPlan?.status);
  const paidRenderStatus = safeStatus(value.paidRender?.status);
  const artifactValidationStatus = safeStatus(value.paidRender?.artifactValidationStatus);
  const artifactEvidencePresent = value.artifactEvidence?.present === true;
  const deliverablePresent = value.artifactEvidence?.deliverablePresent === true;
  const costLedgerEntryCount = safeNonNegativeInteger(value.paidRender?.costLedgerEntryCount);
  const manualQualityReviewPassed = value.manualQualityReview?.passed === true;
  const manualReviewArtifactBindingMatched = value.manualQualityReview?.bindingMatched === true;
  const manualReviewArtifactBindingStatus = safeStatus(value.manualQualityReview?.artifactBindingStatus);
  const statusInput = {
    reportStatus,
    canUseAsBusinessReadinessLongFormEvidence,
    providerSpendAllowed,
    atlasBillingReady,
    ...(requestValidationStatus ? { requestValidationStatus } : {}),
    ...(chunkPlanStatus ? { chunkPlanStatus } : {}),
    ...(paidRenderStatus ? { paidRenderStatus } : {}),
    ...(artifactValidationStatus ? { artifactValidationStatus } : {}),
    artifactEvidencePresent,
    deliverablePresent,
    costLedgerEntryCount,
    manualQualityReviewPassed,
    manualReviewArtifactBindingMatched,
    ...(manualReviewArtifactBindingStatus ? { manualReviewArtifactBindingStatus } : {}),
    ...(finalDurationSeconds ? { finalDurationSeconds } : {})
  };
  const status = statusFor(statusInput);

  return {
    source: "long_form_validation_report",
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    status,
    reportStatus,
    canUseAsBusinessReadinessLongFormEvidence,
    ...(plannedDurationSeconds ? { plannedDurationSeconds } : {}),
    ...(finalDurationSeconds ? { finalDurationSeconds } : {}),
    providerSpendAllowed,
    atlasBillingReady,
    ...(requestValidationStatus ? { requestValidationStatus } : {}),
    ...(readinessDecision ? { readinessDecision } : {}),
    ...(chunkPlanStatus ? { chunkPlanStatus } : {}),
    ...(paidRenderStatus ? { paidRenderStatus } : {}),
    ...(artifactValidationStatus ? { artifactValidationStatus } : {}),
    artifactEvidencePresent,
    deliverablePresent,
    costLedgerEntryCount,
    manualQualityReviewPassed,
    manualReviewArtifactBindingMatched,
    ...(manualReviewArtifactBindingStatus ? { manualReviewArtifactBindingStatus } : {}),
    findings: findingsFor({ ...statusInput, status })
  };
}

function statusFor(input: {
  readonly reportStatus: string;
  readonly canUseAsBusinessReadinessLongFormEvidence: boolean;
  readonly providerSpendAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly requestValidationStatus?: string;
  readonly chunkPlanStatus?: string;
  readonly paidRenderStatus?: string;
  readonly artifactValidationStatus?: string;
  readonly artifactEvidencePresent: boolean;
  readonly deliverablePresent: boolean;
  readonly costLedgerEntryCount: number;
  readonly manualQualityReviewPassed: boolean;
  readonly manualReviewArtifactBindingMatched: boolean;
  readonly manualReviewArtifactBindingStatus?: string;
  readonly finalDurationSeconds?: number;
}): DirectorStyleBenchmarkLongFormValidationEvidenceStatus {
  if (
    input.reportStatus === "pass" &&
    input.canUseAsBusinessReadinessLongFormEvidence &&
    input.providerSpendAllowed &&
    input.atlasBillingReady &&
    input.requestValidationStatus === "pass" &&
    input.chunkPlanStatus === "pass" &&
    input.paidRenderStatus === "completed" &&
    input.artifactValidationStatus === "pass" &&
    input.artifactEvidencePresent &&
    input.deliverablePresent &&
    input.costLedgerEntryCount > 0 &&
    input.manualQualityReviewPassed &&
    input.manualReviewArtifactBindingMatched &&
    input.manualReviewArtifactBindingStatus === "matched" &&
    isLongFormDuration(input.finalDurationSeconds)
  ) {
    return "accepted";
  }
  if (input.reportStatus === "fail" || input.requestValidationStatus === "fail" || input.chunkPlanStatus === "fail") {
    return "rejected";
  }
  return "needs_review";
}

function findingsFor(input: {
  readonly status: DirectorStyleBenchmarkLongFormValidationEvidenceStatus;
  readonly providerSpendAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly requestValidationStatus?: string;
  readonly chunkPlanStatus?: string;
  readonly paidRenderStatus?: string;
  readonly artifactValidationStatus?: string;
  readonly artifactEvidencePresent: boolean;
  readonly deliverablePresent: boolean;
  readonly costLedgerEntryCount: number;
  readonly manualQualityReviewPassed: boolean;
  readonly manualReviewArtifactBindingMatched: boolean;
  readonly manualReviewArtifactBindingStatus?: string;
  readonly finalDurationSeconds?: number;
}): readonly string[] {
  if (input.status === "accepted") {
    return ["Long-form validation report is accepted for 2-8 minute backend benchmark evidence."];
  }
  const findings: string[] = [];
  if (!input.providerSpendAllowed) {
    findings.push("Long-form paid provider spend evidence is missing.");
  }
  if (!input.atlasBillingReady) {
    findings.push("Long-form Atlas billing readiness evidence is missing or not accepted.");
  }
  if (input.requestValidationStatus !== "pass") {
    findings.push(`Long-form request validation status is ${input.requestValidationStatus ?? "missing"}.`);
  }
  if (input.chunkPlanStatus !== "pass") {
    findings.push(`Long-form chunk-plan status is ${input.chunkPlanStatus ?? "missing"}.`);
  }
  if (input.paidRenderStatus !== "completed") {
    findings.push(`Long-form paid render status is ${input.paidRenderStatus ?? "missing"}.`);
  }
  if (input.artifactValidationStatus !== "pass") {
    findings.push(`Long-form artifact validation status is ${input.artifactValidationStatus ?? "missing"}.`);
  }
  if (!input.artifactEvidencePresent || !input.deliverablePresent) {
    findings.push("Long-form artifact/deliverable evidence is missing.");
  }
  if (input.costLedgerEntryCount <= 0) {
    findings.push("Long-form provider cost-ledger evidence is missing.");
  }
  if (!input.manualQualityReviewPassed) {
    findings.push("Long-form manual quality/redaction review is missing or not accepted.");
  }
  if (!input.manualReviewArtifactBindingMatched || input.manualReviewArtifactBindingStatus !== "matched") {
    findings.push(`Long-form manual quality/redaction review artifact binding is ${input.manualReviewArtifactBindingStatus ?? "missing"}.`);
  }
  if (!isLongFormDuration(input.finalDurationSeconds)) {
    findings.push(`Long-form final duration is ${input.finalDurationSeconds ?? "missing"}; expected 120-480s.`);
  }
  return findings;
}

function isLongFormDuration(value: number | undefined): boolean {
  return value !== undefined && value >= 120 && value <= 480;
}

function safeStatus(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return SAFE_STATUS_PATTERN.test(trimmed) ? trimmed : undefined;
}

function safePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
