# Reference Implementation: Provider Polling, Retry, And Cost Fidelity

Implementation status as of 2026-06-13: CineJelly-owned production foundation implemented for provider-neutral ledger fields, Atlas prediction/asset wait polling records, retry-code classification, timeout/abort normalization, and review-packet canceled-operation counts. `npm.cmd run typecheck` and `npm.cmd run build` passed; paid Atlas render validation remains pending. CineJelly production code must remain CineJelly-owned TypeScript and must not import runtime code from `external/upstream/`.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Validate -> plan/cost -> dry-run/build -> render -> status refresh -> inspect loop, JSON build reports, cost caps before paid provider work, deterministic repair/status commands. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/MoneyPrinterTurbo` | MIT | Task progress lifecycle, staged pipeline state updates, terminal failure state on missing stage output, bounded progress updates, resumable operator-visible task status. |
| Atlas Cloud provider schema | `src/providers/atlascloud/*` and current provider contracts | Project-owned integration | Async prediction creation, polling, terminal prediction states, Asset Library registration and activation polling, usage/cost metadata where provider responses expose it. |

## Behavior To Preserve

1. Provider spend must happen only after preflight/cost-gate approval.
2. Async predictions must move through an explicit state map: `queued`, `running`, `succeeded`, `failed`, `canceled`, `timeout`.
3. Polling must stop immediately on terminal states and must not hide `failed` or `canceled` as generic network failures.
4. Polling timeout is a retryable provider failure for orchestration, but the ledger must record it as a timeout with prediction lineage.
5. Caller abort/cancellation must stop polling and preserve an operator-visible cancellation record. It should not spin through the remaining retry budget.
6. Retry budget is tied to normalized `ProviderError` codes and the `retryable` flag, not string matching in higher layers.
7. Cost ledger entries must include operation, model, graph node, prediction ID, latency, retry count, terminal status, provider error code, retryable flag, and provider-returned usage/cost when available.
8. Provider errors exposed to the API/review layer must be stack-free and redact provider payload details.
9. Asset registration and activation polling follow the same terminal-state discipline as predictions.

## Edge Cases

- Prediction creation returns no prediction ID: fail before wait polling and record the create operation failure.
- Prediction succeeds with no output URL: classify as `OUTPUT_MISSING`, record the prediction ID, and route to render repair.
- Prediction terminal `failed`: record a failed `video.wait_for_prediction` ledger entry with `providerStatus: "failed"` and do not retry blindly.
- Prediction terminal `canceled`: record a canceled ledger entry with `providerStatus: "canceled"` and let orchestration decide whether to resubmit.
- Polling exceeds timeout: record `status: "timeout"` and `errorCode: "POLLING_TIMEOUT"`.
- Caller aborts the job: record `status: "canceled"` and `errorCode: "REQUEST_ABORTED"` when the provider call sees the abort.
- HTTP 408, 429, and 5xx: normalize to retryable provider errors and consume retry budget.
- HTTP 400/422: normalize to non-retryable schema error so prompt/settings repair can happen before another paid call.
- Non-JSON provider error body: redact and preserve only a short preview in details.
- Asset activation terminal `failed` or `deleted`: record activation failure with asset status evidence.

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
- Keep retry policy centralized in `src/utils/retry.ts`; higher-level agents read normalized errors and ledger entries.
- Preserve Atlas-specific mapping only inside `src/providers/atlascloud/*`.

## Validation Checklist

- `video.wait_for_prediction` records success, failed, canceled, timeout, and abort/cancel outcomes.
- Retry attempts increment only when a retry is actually scheduled.
- Caller abort stops polling without consuming the full retry budget.
- Ledger entries include `predictionId` for create/get/wait operations whenever known.
- Provider-returned `usage` is preserved in the ledger when available.
- Review packet cost summary counts failed, timeout, and canceled provider operations.
- No production import path references `external/upstream`.
- Source lineage is added to `DEFAULT_SOURCE_LOGIC_TRANSLATIONS` after implementation.
