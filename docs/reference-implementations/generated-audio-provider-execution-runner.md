# Reference Implementation: Generated Audio Provider Execution Runner

Implementation status as of 2026-06-14: implemented foundation for a CineJelly-owned provider-neutral runner that executes ready generated-audio requests only after `GeneratedAudioExecutionPlanner` has produced verified `ready_for_provider` items. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The runner must not create fake audio files, mint public URLs, bypass capability planning, or call Atlas audio endpoints unless verified capabilities and provider wiring are present.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Audio generation is a visible stage with task progress, terminal success/failure, and optional stop-at-audio behavior. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | TTS execution preserves provider, prompt, duration, volume, and generated asset evidence before composition. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Validate, execute, report, and review generated assets through deterministic records instead of hidden side effects. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Sample-before-batch, provider-menu, and approval ideas are behavior notes only; AGPL implementation code is not copied or linked. |

## Behavior To Preserve

1. Execution can only consume `GeneratedAudioExecutionReadyItem` records. Blocked or planned-only items must never be sent to a provider.
2. Provider calls preserve execution-plan order so batch validation and later audio mixing can keep deterministic ordering.
3. One failed intent must not erase successful sibling evidence. The runner returns a provider result for each attempted ready item.
4. Provider exceptions become stable failed, timeout, or canceled `AudioGenerationResult` records with provider/model/intent/kind identity preserved.
5. Caller abort must stop remaining work and preserve a canceled result for the active item when possible.
6. The runner does not validate URLs, approve tracks, inspect waveform metadata, or create files. `GeneratedAudioOutputBatchValidator` owns result-to-track approval.
7. The runner does not execute Atlas audio by default. Atlas still reports no audio capabilities until current audio schema/model/pricing are verified.
8. No mock, demo, sample, or fake provider output is introduced into production paths.

## Edge Cases

- Execution plan is `not_requested` or `planned_only`: return no results and no provider calls.
- Mixed plan has ready and blocked items: call provider only for ready items; blocked items remain represented by the plan and batch validator.
- Provider throws `ProviderError` with `POLLING_TIMEOUT` or `REQUEST_TIMEOUT`: return a `timeout` result.
- Provider throws `ProviderError` with `REQUEST_ABORTED` or `PREDICTION_CANCELED`: return a `canceled` result.
- Provider throws any other error: return a `failed` result with stack-free raw error metadata.
- Provider returns a result for the wrong intent, kind, provider, or model: preserve the raw result; batch/output validation rejects the mismatch.
- Abort signal is already aborted before an item starts: stop before spending on later items and return no synthetic results for unattempted items.

## Reference Implementation

```ts
async function runGeneratedAudioExecution(input: {
  plan: GeneratedAudioExecutionPlan;
  provider: AudioProvider;
  signal?: AbortSignal;
}): Promise<GeneratedAudioExecutionRun> {
  const readyItems = input.plan.items.filter(isReady);
  const results: AudioGenerationResult[] = [];

  for (const item of readyItems) {
    if (input.signal?.aborted) {
      break;
    }

    const startedAt = new Date();
    try {
      results.push(await input.provider.generateAudio(item.request, input.signal));
    } catch (error) {
      const normalized = asProviderError(input.provider.name, error);
      results.push({
        provider: item.provider,
        modelId: item.modelId,
        intentId: item.intentId,
        kind: item.kind,
        status: statusFor(normalized),
        raw: {
          errorCode: normalized.code,
          retryable: normalized.retryable,
          message: normalized.message
        },
        submittedAt: startedAt,
        completedAt: new Date()
      });
      if (statusFor(normalized) === "canceled") {
        break;
      }
    }
  }

  return {
    status: results.length === 0
      ? "not_run"
      : results.every((result) => result.status === "succeeded")
        ? "succeeded"
        : results.some((result) => result.status === "succeeded")
          ? "partial"
          : "failed",
    readyItemCount: readyItems.length,
    attemptedCount: results.length,
    succeededCount: results.filter((result) => result.status === "succeeded").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    timeoutCount: results.filter((result) => result.status === "timeout").length,
    canceledCount: results.filter((result) => result.status === "canceled").length,
    results
  };
}
```

## CineJelly Translation Plan

- Add `GeneratedAudioProviderExecutionRunner` under `src/core`.
- Add a compact `GeneratedAudioExecutionRun` contract under `src/types/generated-audio-execution.ts`.
- Export the runner from `src/index.ts`.
- Optionally wire `DirectorAgent` with an `AudioProvider`; default runtime remains safe because Atlas returns no audio capabilities until verified.
- When the runner is used, pass its results into `GeneratedAudioOutputBatchValidator`; only approved validation reports can become generated-audio mix tracks.
- Update source lineage, snapshot inventory, roadmap, runbook, and provider docs.

## Validation Checklist

- Reference Implementation exists before production code.
- Runner never calls providers for blocked or planned-only items.
- Runner preserves ready-item order.
- Provider exceptions become stack-free `AudioGenerationResult` evidence.
- Abort/cancel stops remaining item execution.
- Runner does not approve URLs, create tracks, download media, inspect waveform data, or create generated audio files.
- Atlas remains no-spend by default until verified generated-audio capabilities exist.
- No production runtime import from `external/upstream/`.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke through the built `dist/index.js` surface confirmed the runner calls only ready execution-plan items, preserves plan order, skips blocked items, converts provider failures into failed result evidence, allows `GeneratedAudioOutputBatchValidator` to produce a `partially_approved` batch from mixed success/failure results, and turns provider mismatch into failed `UNSUPPORTED_SETTING` result evidence without calling the wrong provider.
