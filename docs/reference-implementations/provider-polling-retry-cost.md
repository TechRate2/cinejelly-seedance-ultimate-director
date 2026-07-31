# Reference Implementation: Provider Polling, Retry, And Cost Fidelity

Implementation status as of 2026-06-16: CineJelly-owned production foundation implemented for provider-neutral ledger fields, Atlas prediction/media reference records, Atlas prediction/result polling compatibility, retry-code classification, timeout/abort normalization, and review-packet canceled-operation counts. Local typecheck/build passed, and one short paid Atlas validation render completed with artifact validation `pass`. CineJelly production code must remain CineJelly-owned TypeScript and must not import runtime code from `external/upstream/`.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Validate -> plan/cost -> dry-run/build -> render -> status refresh -> inspect loop, JSON build reports, cost caps before paid provider work, deterministic repair/status commands. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Task progress lifecycle, staged pipeline state updates, terminal failure state on missing stage output, bounded progress updates, resumable operator-visible task status. |
| Atlas Cloud provider schema | `src/providers/atlascloud/*`, current provider contracts, and Atlas docs for `generateVideo`, `prediction`, and `result` routes | Project-owned integration | Async prediction creation, polling, terminal prediction states, result-route fallback compatibility, media upload/direct-reference preparation, usage/cost metadata where provider responses expose it. |

## Behavior To Preserve

1. Provider spend must happen only after preflight/cost-gate approval.
2. Async predictions must move through an explicit state map: `queued`, `running`, `succeeded`, `failed`, `canceled`, `timeout`.
3. Polling must stop immediately on terminal states and must not hide `failed` or `canceled` as generic network failures.
4. Polling timeout is a retryable provider failure for orchestration, but the ledger must record it as a timeout with prediction lineage.
5. Caller abort/cancellation must stop polling and preserve an operator-visible cancellation record. It should not spin through the remaining retry budget.
6. Retry budget is tied to normalized `ProviderError` codes and the `retryable` flag, not string matching in higher layers.
7. Cost ledger entries must include operation, model, graph node, prediction ID, latency, retry count, terminal status, provider error code, retryable flag, and provider-returned usage/cost when available.
8. Provider errors exposed to the API/review layer must be stack-free and redact provider payload details.
9. Media upload or direct-reference preparation follows the same no-spend-before-validation discipline as predictions.

## Edge Cases

- Prediction creation returns no prediction ID: fail before wait polling and record the create operation failure.
- Prediction succeeds with no output URL: classify as `OUTPUT_MISSING`, record the prediction ID, and route to render repair.
- Prediction terminal `failed`: record a failed `video.wait_for_prediction` ledger entry with `providerStatus: "failed"` and do not retry blindly.
- Prediction terminal `canceled`: record a canceled ledger entry with `providerStatus: "canceled"` and let orchestration decide whether to resubmit.
- Polling exceeds timeout: record `status: "timeout"` and `errorCode: "POLLING_TIMEOUT"`.
- Caller aborts the job: record `status: "canceled"` and `errorCode: "REQUEST_ABORTED"` when the provider call sees the abort.
- Prediction succeeds with mixed media outputs, such as Atlas returning a generated `.mp4` plus a `returnLastFrame` `.png`: preserve every URL in provider evidence, but only video media URLs may become assembly timeline clips.
- HTTP 408, 429, and 5xx: normalize to retryable provider errors and consume retry budget.
- HTTP 400/422: normalize to non-retryable schema error so prompt/settings repair can happen before another paid call.
- HTTP 404/405 from `/model/prediction/{id}`: try Atlas result compatibility routes, including `/model/result/{id}` and the documented `/model/getResult?predictionId=...`, before treating the poll as failed.
- Non-JSON provider error body: redact and preserve only a short preview in details.
- Media upload terminal `failed` or invalid direct reference: record preparation failure with provider status evidence.
- Media upload success with only a temporary HTTPS URL: use the returned clean URL as the provider reference instead of requiring a separate asset ID.

## Reference Implementation

```ts
type ProviderCallStatus = "succeeded" | "failed" | "timeout" | "canceled";

const retryableCodes = new Set<ProviderErrorCode>([
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "POLLING_TIMEOUT"
]);

function normalizeRetryDecision(error: unknown, signal?: AbortSignal): RetryDecision {
  const providerError = asProviderError("atlascloud", error);
  if (signal?.aborted || providerError.code === "REQUEST_ABORTED") {
    return { retryable: false, reason: "caller abort stops retry budget" };
  }
  return {
    retryable: providerError.retryable && retryableCodes.has(providerError.code),
    reason: providerError.code
  };
}

async function trackProviderCall<T>(
  context: ProviderCallContext,
  callback: (recordRetry: () => void) => Promise<T>,
  successMetadata: (value: T) => LedgerMetadata = () => ({}),
  baseMetadata: LedgerMetadata = {}
): Promise<T> {
  let retryCount = 0;
  const startedAt = now();
  try {
    const value = await callback(() => retryCount += 1);
    ledger.record({
      ...context,
      ...baseMetadata,
      ...successMetadata(value),
      requestedAt: startedAt,
      completedAt: now(),
      status: "succeeded",
      retryCount
    });
    return value;
  } catch (error) {
    const providerError = asProviderError(context.provider, error);
    ledger.record({
      ...context,
      ...baseMetadata,
      requestedAt: startedAt,
      completedAt: now(),
      status: ledgerStatusFor(providerError),
      errorCode: providerError.code,
      retryable: providerError.retryable,
      retryCount
    });
    throw providerError;
  }
}

async function waitForPrediction(predictionId: string, context: PollingContext): Promise<Prediction> {
  return trackProviderCall(
    {
      provider: "atlascloud",
      operation: "video.wait_for_prediction",
      modelId: context.modelId,
      graphNodeId: context.graphNodeId
    },
    async () => {
      const deadline = Date.now() + context.timeoutMs;
      while (Date.now() <= deadline) {
        throwIfAborted(context.signal);
        const prediction = await getPrediction(predictionId, context.signal, context);
        if (prediction.status === "succeeded") {
          return prediction;
        }
        if (prediction.status === "failed") {
          throw providerFailure("GENERATION_FAILED", prediction);
        }
        if (prediction.status === "canceled") {
          throw providerFailure("PREDICTION_CANCELED", prediction);
        }
        await sleep(context.pollingIntervalMs, context.signal);
      }
      throw new ProviderError({
        provider: "atlascloud",
        code: "POLLING_TIMEOUT",
        retryable: true,
        message: "Prediction did not finish before polling timeout."
      });
    },
    prediction => ({
      predictionId: prediction.predictionId,
      providerStatus: prediction.status,
      usage: prediction.usage
    }),
    { predictionId }
  );
}
```

## CineJelly Translation Plan

- Keep VibeFrame's cost-gate-before-spend discipline through `RenderCostGate` and review packet cost evidence.
- Translate MoneyPrinterTurbo's staged task visibility into provider ledger events rather than copying its Python task manager.
- Add provider-neutral ledger fields in `src/types/provider.ts` so API, review packet, and artifact store can inspect polling outcomes.
- Wrap `waitForPrediction` and `waitUntilActive` in ledger tracking, not only raw HTTP calls.
- Keep Atlas prediction polling compatible with `/model/prediction/{id}`, `/model/result/{id}`, and `/model/getResult?predictionId=...` without hiding authentication, schema, rate-limit, credit, or server errors.
- Keep retry policy centralized in `src/utils/retry.ts`; higher-level agents read normalized errors and ledger entries.
- Preserve Atlas-specific mapping only inside `src/providers/atlascloud/*`.
- Allow `RenderProducer` to pass through a clean temporary upload URL returned by Atlas `/model/uploadMedia` so a url-only response does not become a malformed `asset://https://...` reference or a false asset-registration failure.
- Keep mixed provider outputs safe at the orchestration boundary: `DirectorAgent` must assemble only `.mp4`, `.mov`, `.m4v`, or `.webm` outputs, while still retaining non-video sidecars such as last-frame images in provider/artifact evidence.

## Validation Checklist

- `video.wait_for_prediction` records success, failed, canceled, timeout, and abort/cancel outcomes.
- Retry attempts increment only when a retry is actually scheduled.
- Caller abort stops polling without consuming the full retry budget.
- Ledger entries include `predictionId` for create/get/wait operations whenever known.
- Provider-returned `usage` is preserved in the ledger when available.
- Atlas result-route fallbacks are used only after earlier polling routes return 404/405, and mapped output URLs still flow through the same provider-neutral `Prediction` contract.
- Atlas upload responses that provide a clean HTTPS URL but no separate asset ID can still feed the next generation request as a direct provider reference.
- Mixed Atlas output URLs do not double the assembly clip count or shorten the final timeline through accidental still-image insertion.
- `tests/run-mixed-output-assembly-smoke.mjs` passes and writes no raw provider output URLs into its report.
- Review packet cost summary counts failed, timeout, and canceled provider operations.
- No production import path references `external/upstream`.
- Source lineage is added to `DEFAULT_SOURCE_LOGIC_TRANSLATIONS` after implementation.
