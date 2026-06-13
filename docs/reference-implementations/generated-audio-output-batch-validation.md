# Reference Implementation: Generated Audio Output Batch Validation

Implementation status as of 2026-06-14: planned for a CineJelly-owned batch validator that reconciles generated-audio execution plans with provider results before approved audio tracks can enter the final mix. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The validator must not call audio providers, download media, inspect waveform metadata, or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | End-to-end task stages keep material/audio failures visible instead of silently continuing composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | Generated voice/audio artifacts are stage outputs that must be matched back to task intent before composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/video.py` | MIT | Final composition consumes prepared and ordered audio assets rather than arbitrary provider outputs. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Validation/report discipline keeps artifact readiness explicit before release. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Batch approval and media-review ideas are used only as behavior guidance; CineJelly writes new implementation code. |

## Behavior To Preserve

1. Batch output order follows the reviewed `GeneratedAudioExecutionPlan.items` order, not provider result arrival order.
2. Only `ready_for_provider` execution items may produce approved mix tracks.
3. A ready item must have exactly one matching provider result. Missing or duplicate results are blocking batch issues.
4. Results for blocked, planned-only, or unknown intents are blocking batch issues and must not become tracks.
5. Result-level validation still owns provider/model/kind/intent/duration/URI/asset-resolution checks.
6. Approved tracks are aggregated only from result-level reports with `status === "approved"`.
7. A partially successful batch remains explicit: approved tracks are returned, but the batch status is `partially_approved` when any other ready item or stray result still needs repair.
8. The batch report must preserve counts for ready intents, provider results, approved tracks, review-required reports, rejected reports, missing results, unexpected results, duplicate results, and batch issues.
9. The validator does not infer replacement audio, choose between duplicate results, mutate the execution plan, call providers, download media, or create generated files.

## Edge Cases

- Execution plan has no ready items and there are no results: return `not_requested`.
- Execution plan has no ready items but provider results are supplied: reject as unexpected or blocked-intent results.
- Ready item exists but the original `GeneratedAudioIntent` is missing: block the batch and require plan regeneration.
- Ready item has no result: block with `missing_planned_result`.
- Ready item has two results with the same intent ID: block with `duplicate_result` and do not choose either result.
- Result intent ID belongs to a blocked plan item: block with `result_for_blocked_intent`.
- Result intent ID is not in the plan: block with `unexpected_result`.
- A result has `status: succeeded` but unresolved `asset://` output: result-level report is `review_required`; the batch is `review_required` if no approved tracks exist or `partially_approved` if some tracks are approved.
- A result has signed HTTPS, wrong provider, wrong model, wrong kind, wrong duration, or invalid volume: result-level report is rejected; the batch is rejected or partially approved depending on whether other tracks were approved.

## Reference Implementation

```ts
type BatchStatus =
  | "not_requested"
  | "approved"
  | "review_required"
  | "partially_approved"
  | "rejected";

function validateGeneratedAudioOutputBatch(input: {
  intents: readonly GeneratedAudioIntent[];
  executionPlan: GeneratedAudioExecutionPlan;
  results: readonly AudioGenerationResult[];
  outputValidator: GeneratedAudioOutputValidator;
}): GeneratedAudioOutputValidationBatchReport {
  const issues = [];
  const reports = [];
  const audioTracks = [];

  const intentById = uniqueMap(input.intents, "intentId", (intentId) => {
    issues.push(block("duplicate_intent", intentId));
  });
  const readyItems = input.executionPlan.items.filter((item) => item.status === "ready_for_provider");
  const readyById = uniqueMap(readyItems, "intentId", (intentId) => {
    issues.push(block("duplicate_planned_item", intentId));
  });
  const blockedIntentIds = new Set(
    input.executionPlan.items
      .filter((item) => item.status === "blocked")
      .map((item) => item.intentId)
  );
  const resultsById = groupBy(input.results, "intentId");

  for (const result of input.results) {
    if (!readyById.has(result.intentId)) {
      issues.push(
        blockedIntentIds.has(result.intentId)
          ? block("result_for_blocked_intent", result.intentId)
          : block("unexpected_result", result.intentId)
      );
    }
  }

  for (const readyItem of readyItems) {
    const intent = intentById.get(readyItem.intentId);
    const matchingResults = resultsById.get(readyItem.intentId) ?? [];

    if (!intent) {
      issues.push(block("missing_intent", readyItem.intentId));
      continue;
    }
    if (matchingResults.length === 0) {
      issues.push(block("missing_planned_result", readyItem.intentId));
      continue;
    }
    if (matchingResults.length > 1) {
      issues.push(block("duplicate_result", readyItem.intentId));
      continue;
    }

    const report = input.outputValidator.validate({
      intent,
      plannedItem: readyItem,
      result: matchingResults[0]
    });
    reports.push(report);
    if (report.status === "approved" && report.audioTrack) {
      audioTracks.push(report.audioTrack);
    }
  }

  const status = decideBatchStatus({
    readyCount: readyItems.length,
    resultCount: input.results.length,
    approvedTrackCount: audioTracks.length,
    issues,
    reports
  });

  return {
    status,
    intentCount: input.executionPlan.intentCount,
    readyIntentCount: readyItems.length,
    resultCount: input.results.length,
    approvedTrackCount: audioTracks.length,
    reviewRequiredReportCount: reports.filter((report) => report.status === "review_required").length,
    rejectedReportCount: reports.filter((report) => report.status === "rejected").length,
    missingResultCount: issues.filter((issue) => issue.code === "missing_planned_result").length,
    unexpectedResultCount: issues.filter(
      (issue) => issue.code === "unexpected_result" || issue.code === "result_for_blocked_intent"
    ).length,
    duplicateResultCount: issues.filter((issue) => issue.code === "duplicate_result").length,
    issueCount: issues.length,
    issues,
    reports,
    audioTracks
  };
}
```

## CineJelly Translation Plan

- Extend generated-audio output validation contracts under `src/types/generated-audio-output.ts`.
- Add `GeneratedAudioOutputBatchValidator` under `src/core`.
- Reuse `GeneratedAudioOutputValidator` for result-level validation instead of duplicating URI/duration/provider checks.
- Match results to ready execution-plan items by `intentId`.
- Preserve execution-plan ordering for reports and `AudioMixTrack` output.
- Make duplicate, missing, blocked-intent, and unexpected results visible as batch issues.
- Export the batch validator from `src/index.ts`.
- Update lineage records and roadmap docs after implementation.

## Validation Checklist

- Reference Implementation exists before production code changes.
- Batch report order follows `executionPlan.items`.
- Exactly one result is required per ready item before a track can be approved.
- Duplicate results are never auto-selected.
- Results for blocked or unknown intents never become tracks.
- Result-level validator remains the only authority for URI, asset resolution, provider/model/kind, duration, and volume checks.
- Approved tracks are returned only from approved result-level reports.
- The module performs no provider call, network download, media inspection, test/mock/demo generation, or runtime import from `external/upstream/`.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke against `dist/index.js` confirmed approved batches preserve execution-plan track order, missing ready results produce `partially_approved`, duplicate results are rejected without auto-selection, results for blocked intents are rejected without tracks, and resolver-approved `asset://` results produce tracks from credential-free HTTPS URLs.
