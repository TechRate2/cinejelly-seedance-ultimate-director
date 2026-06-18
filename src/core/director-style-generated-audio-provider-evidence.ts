import type {
  DirectorStyleBenchmarkGeneratedAudioProviderEvidence,
  DirectorStyleBenchmarkGeneratedAudioProviderEvidenceStatus
} from "../types/director-style-benchmark.js";

const SAFE_STATUS_PATTERN = /^[a-z0-9_.:-]{1,80}$/i;
const SUPPORTED_OUTPUT_FORMATS = new Set(["mp3", "wav"]);

export function normalizeDirectorStyleGeneratedAudioProviderEvidence(
  value: unknown,
  options: { readonly sourcePath?: string } = {}
): DirectorStyleBenchmarkGeneratedAudioProviderEvidence {
  if (!isRecord(value)) {
    throw new Error("generated-audio validation evidence must be a JSON object");
  }
  if (value.schemaVersion !== "cinejelly.generated-audio-validation.v1") {
    throw new Error("generated-audio validation evidence has an unsupported schemaVersion");
  }

  const providerNetworkCallsAllowed = value.spendGate?.providerNetworkCallsAllowed === true;
  const atlasBillingReady = value.atlasBillingGate?.canUseAsPrePaidAtlasBillingEvidence === true;
  const schemaReviewed = value.schemaGate?.confirmAudioSchemaReviewed === true;
  const executionStatus = safeStatus(value.executionRun?.status);
  const outputBatchStatus = safeStatus(value.outputBatchValidation?.status);
  const approvedTrackCount = safeNonNegativeInteger(value.outputBatchValidation?.approvedTrackCount);
  const providerLedgerEntryCount = safeNonNegativeInteger(value.providerLedger?.entryCount);
  const manualReviewPassed = value.manualAudioReview?.passed === true;
  const canUseAsBusinessReadinessGeneratedAudioEvidence =
    value.releaseGateSummary?.canUseAsBusinessReadinessGeneratedAudioEvidence === true;
  const statusInput = {
    reportStatus: safeStatus(value.status) ?? "unknown",
    canUseAsBusinessReadinessGeneratedAudioEvidence,
    providerNetworkCallsAllowed,
    atlasBillingReady,
    schemaReviewed,
    approvedTrackCount,
    providerLedgerEntryCount,
    manualReviewPassed
  };
  const status = statusFor({
    ...statusInput,
    ...(executionStatus ? { executionStatus } : {}),
    ...(outputBatchStatus ? { outputBatchStatus } : {})
  });
  const outputFormat = typeof value.checkedInputs?.outputFormat === "string" &&
    SUPPORTED_OUTPUT_FORMATS.has(value.checkedInputs.outputFormat)
    ? value.checkedInputs.outputFormat as "mp3" | "wav"
    : undefined;
  const modelId = safeString(value.checkedInputs?.modelId);
  const durationSeconds = safePositiveNumber(value.checkedInputs?.durationSeconds);
  const estimatedCostUsd = safeNonNegativeNumber(value.checkedInputs?.estimatedCostUsd);

  return {
    source: "generated_audio_validation_report",
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    status,
    reportStatus: safeStatus(value.status) ?? "unknown",
    canUseAsBusinessReadinessGeneratedAudioEvidence,
    ...(modelId ? { modelId } : {}),
    ...(outputFormat ? { outputFormat } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    providerNetworkCallsAllowed,
    atlasBillingReady,
    schemaReviewed,
    ...(executionStatus ? { executionStatus } : {}),
    ...(outputBatchStatus ? { outputBatchStatus } : {}),
    approvedTrackCount,
    providerLedgerEntryCount,
    manualReviewPassed,
    findings: findingsFor({
      status,
      providerNetworkCallsAllowed,
      atlasBillingReady,
      schemaReviewed,
      approvedTrackCount,
      providerLedgerEntryCount,
      manualReviewPassed,
      ...(executionStatus ? { executionStatus } : {}),
      ...(outputBatchStatus ? { outputBatchStatus } : {})
    })
  };
}

function statusFor(input: {
  readonly reportStatus: string;
  readonly canUseAsBusinessReadinessGeneratedAudioEvidence: boolean;
  readonly providerNetworkCallsAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly schemaReviewed: boolean;
  readonly executionStatus?: string;
  readonly outputBatchStatus?: string;
  readonly approvedTrackCount: number;
  readonly providerLedgerEntryCount: number;
  readonly manualReviewPassed: boolean;
}): DirectorStyleBenchmarkGeneratedAudioProviderEvidenceStatus {
  if (
    input.canUseAsBusinessReadinessGeneratedAudioEvidence &&
    input.reportStatus === "pass" &&
    input.providerNetworkCallsAllowed &&
    input.atlasBillingReady &&
    input.schemaReviewed &&
    input.executionStatus === "succeeded" &&
    input.outputBatchStatus === "approved" &&
    input.approvedTrackCount > 0 &&
    input.providerLedgerEntryCount > 0 &&
    input.manualReviewPassed
  ) {
    return "accepted";
  }
  if (input.reportStatus === "fail" || input.outputBatchStatus === "rejected") {
    return "rejected";
  }
  return "needs_review";
}

function findingsFor(input: {
  readonly status: DirectorStyleBenchmarkGeneratedAudioProviderEvidenceStatus;
  readonly providerNetworkCallsAllowed: boolean;
  readonly atlasBillingReady: boolean;
  readonly schemaReviewed: boolean;
  readonly executionStatus?: string;
  readonly outputBatchStatus?: string;
  readonly approvedTrackCount: number;
  readonly providerLedgerEntryCount: number;
  readonly manualReviewPassed: boolean;
}): readonly string[] {
  const findings: string[] = [];
  if (input.status === "accepted") {
    return ["Generated-audio validation report is accepted for provider-backed audio evidence."];
  }
  if (!input.providerNetworkCallsAllowed) {
    findings.push("Generated-audio provider spend evidence is missing.");
  }
  if (!input.atlasBillingReady) {
    findings.push("Generated-audio Atlas billing readiness evidence is missing or not accepted.");
  }
  if (!input.schemaReviewed) {
    findings.push("Generated-audio schema review confirmation is missing.");
  }
  if (input.executionStatus !== "succeeded") {
    findings.push(`Generated-audio execution status is ${input.executionStatus ?? "missing"}.`);
  }
  if (input.outputBatchStatus !== "approved" || input.approvedTrackCount <= 0) {
    findings.push(`Generated-audio output batch status is ${input.outputBatchStatus ?? "missing"}.`);
  }
  if (input.providerLedgerEntryCount <= 0) {
    findings.push("Generated-audio provider ledger evidence is missing.");
  }
  if (!input.manualReviewPassed) {
    findings.push("Generated-audio manual listening review is missing or not accepted.");
  }
  return findings;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 && !/[<>"'\\]/.test(trimmed) ? trimmed : undefined;
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

function safeNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
